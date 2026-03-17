import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const parseList = (val) => val ? val.split(',').filter(Boolean) : [];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const limit = parseInt(searchParams.get('limit') || '25');
  const groupBy = searchParams.get('groupBy') || 'sku'; // 'sku' or 'product'
  let companies = parseList(searchParams.get('companies'));
  const salesReps = parseList(searchParams.get('salesReps'));

  // Custom field filters — passed as customField[FieldName]=value1,value2
  const customFieldFilters = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('cf_')) {
      const fieldName = decodeURIComponent(key.slice(3));
      customFieldFilters[fieldName] = value.split(',').filter(Boolean);
    }
  }

  try {
    if (salesReps.length > 0) {
      const { data: repAssignments } = await supabaseAdmin
        .from('rep_company_assignments')
        .select('company_id')
        .eq('store_hash', store_hash)
        .in('rep_id', salesReps);
      const repCompanyIds = repAssignments?.map(a => a.company_id) || [];
      companies = companies.length > 0 ? companies.filter(c => repCompanyIds.includes(c)) : repCompanyIds;
    }

    // Get orders in date range
    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, created_at_bc')
      .eq('store_hash', store_hash)
      .neq('custom_status', 'Invoice Payment')
      .neq('custom_status', 'Incomplete')
      .limit(100000);
    if (dateFrom) ordersQuery = ordersQuery.gte('created_at_bc', dateFrom);
    if (dateTo) ordersQuery = ordersQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    if (companies.length) ordersQuery = ordersQuery.in('company_id', companies);

    const { data: orders } = await ordersQuery;
    const orderIds = orders?.map(o => o.bc_order_id) || [];
    const orderDateMap = {};
    orders?.forEach(o => { orderDateMap[o.bc_order_id] = o.created_at_bc; });

    if (orderIds.length === 0) {
      return NextResponse.json({
        scorecards: { totalSkus: 0, totalRevenue: 0, totalQuantity: 0 },
        products: [],
        customFieldOptions: {},
      });
    }

    // Get line items for those orders
    const { data: lineItems } = await supabaseAdmin
      .from('order_line_items')
      .select('bc_order_id, product_id, sku, product_name, quantity, base_price, line_total')
      .eq('store_hash', store_hash)
      .in('bc_order_id', orderIds)
      .limit(100000);

    // Get ALL products for this store for custom field options + catalog info
    const { data: allProducts } = await supabaseAdmin
      .from('products')
      .select('bc_product_id, name, sku, brand, category, custom_fields')
      .eq('store_hash', store_hash);

    const catalogMap = {};
    allProducts?.forEach(p => { catalogMap[p.bc_product_id] = p; });

    // Build dynamic custom field options from ALL products
    const customFieldOptions = {};
    allProducts?.forEach(p => {
      if (!p.custom_fields) return;
      Object.entries(p.custom_fields).forEach(([key, value]) => {
        if (!customFieldOptions[key]) customFieldOptions[key] = new Set();
        if (value) customFieldOptions[key].add(value);
      });
    });
    // Convert sets to arrays
    Object.keys(customFieldOptions).forEach(key => {
      customFieldOptions[key] = [...customFieldOptions[key]].sort();
    });

    // Filter products by custom fields if any filters are active
    const hasCustomFieldFilters = Object.keys(customFieldFilters).length > 0;
    const allowedProductIds = hasCustomFieldFilters
      ? new Set(
          allProducts
            ?.filter(p => {
              return Object.entries(customFieldFilters).every(([fieldName, allowedValues]) => {
                const productValue = p.custom_fields?.[fieldName];
                return allowedValues.includes(productValue);
              });
            })
            .map(p => p.bc_product_id)
        )
      : null;

    // Aggregate — groupBy sku (variant) or product (parent)
    const groupMap = {};

    lineItems?.forEach(item => {
      // Skip if custom field filter is active and product doesn't match
      if (allowedProductIds && item.product_id && !allowedProductIds.has(item.product_id)) return;

      const catalog = item.product_id ? catalogMap[item.product_id] : null;
      const groupKey = groupBy === 'product'
        ? (item.product_id || item.sku || 'Unknown')
        : (item.sku || item.product_name || 'Unknown');

      if (!groupMap[groupKey]) {
        groupMap[groupKey] = {
          sku: groupBy === 'product' ? (catalog?.sku || item.sku || '—') : (item.sku || '—'),
          product_name: groupBy === 'product' ? (catalog?.name || item.product_name || groupKey) : (item.product_name || item.sku),
          product_id: item.product_id,
          brand: catalog?.brand || null,
          category: catalog?.category || null,
          custom_fields: catalog?.custom_fields || {},
          total_quantity: 0,
          total_revenue: 0,
          order_count: new Set(),
          last_order_date: null,
          variant_skus: new Set(),
        };
      }

      groupMap[groupKey].total_quantity += parseInt(item.quantity || 0);
      groupMap[groupKey].total_revenue += parseFloat(item.line_total || 0);
      groupMap[groupKey].order_count.add(item.bc_order_id);
      if (item.sku) groupMap[groupKey].variant_skus.add(item.sku);

      const orderDate = orderDateMap[item.bc_order_id];
      if (orderDate && (!groupMap[groupKey].last_order_date || orderDate > groupMap[groupKey].last_order_date)) {
        groupMap[groupKey].last_order_date = orderDate;
      }
    });

    const products = Object.values(groupMap)
      .map(p => ({
        ...p,
        order_count: p.order_count.size,
        variant_skus: [...p.variant_skus],
        total_revenue: Math.round(p.total_revenue * 100) / 100,
        avg_order_value: p.order_count.size > 0
          ? Math.round(p.total_revenue / p.order_count.size * 100) / 100
          : 0,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit);

    const totalRevenue = Object.values(groupMap).reduce((s, p) => s + p.total_revenue, 0);
    const totalQuantity = Object.values(groupMap).reduce((s, p) => s + p.total_quantity, 0);

    return NextResponse.json({
      scorecards: {
        totalSkus: Object.keys(groupMap).length,
        totalRevenue: Math.round(totalRevenue),
        totalQuantity,
        topSku: products[0]?.sku || null,
        topSkuRevenue: products[0]?.total_revenue || 0,
      },
      products,
      customFieldOptions,
    });

  } catch (err) {
    console.error('Products report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}