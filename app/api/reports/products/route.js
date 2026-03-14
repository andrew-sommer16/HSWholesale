import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const parseList = (val) => val ? val.split(',').filter(Boolean) : [];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const limit = parseInt(searchParams.get('limit') || '25');
  let companies = parseList(searchParams.get('companies'));
  const salesReps = parseList(searchParams.get('salesReps'));

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
      .neq('custom_status', 'Invoice Payment');
    if (dateFrom) ordersQuery = ordersQuery.gte('created_at_bc', dateFrom);
    if (dateTo) ordersQuery = ordersQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    if (companies.length) ordersQuery = ordersQuery.in('company_id', companies);

    const { data: orders } = await ordersQuery;
    const orderIds = orders?.map(o => o.bc_order_id) || [];
    const orderDateMap = {};
    orders?.forEach(o => { orderDateMap[o.bc_order_id] = o.created_at_bc; });

    if (orderIds.length === 0) {
      return NextResponse.json({ scorecards: { totalSkus: 0, totalRevenue: 0, totalQuantity: 0 }, products: [] });
    }

    // Get line items for those orders
    const { data: lineItems } = await supabaseAdmin
      .from('order_line_items')
      .select('bc_order_id, product_id, sku, product_name, quantity, base_price, line_total')
      .eq('store_hash', store_hash)
      .in('bc_order_id', orderIds);

    // Get product catalog for brand, category, custom fields
    const productIds = [...new Set(lineItems?.map(i => i.product_id).filter(Boolean))];
    const { data: productCatalog } = productIds.length > 0
      ? await supabaseAdmin
          .from('products')
          .select('bc_product_id, brand, category, custom_fields')
          .eq('store_hash', store_hash)
          .in('bc_product_id', productIds)
      : { data: [] };

    const catalogMap = {};
    productCatalog?.forEach(p => { catalogMap[p.bc_product_id] = p; });

    // Aggregate by SKU
    const skuMap = {};
    lineItems?.forEach(item => {
      const sku = item.sku || item.product_name || 'Unknown';
      if (!skuMap[sku]) {
        const catalog = item.product_id ? catalogMap[item.product_id] : null;
        skuMap[sku] = {
          sku,
          product_name: item.product_name || sku,
          product_id: item.product_id,
          brand: catalog?.brand || null,
          category: catalog?.category || null,
          custom_fields: catalog?.custom_fields || {},
          total_quantity: 0,
          total_revenue: 0,
          order_count: new Set(),
          last_order_date: null,
        };
      }
      skuMap[sku].total_quantity += parseInt(item.quantity || 0);
      skuMap[sku].total_revenue += parseFloat(item.line_total || 0);
      skuMap[sku].order_count.add(item.bc_order_id);

      const orderDate = orderDateMap[item.bc_order_id];
      if (orderDate && (!skuMap[sku].last_order_date || orderDate > skuMap[sku].last_order_date)) {
        skuMap[sku].last_order_date = orderDate;
      }
    });

    const products = Object.values(skuMap)
      .map(p => ({
        ...p,
        order_count: p.order_count.size,
        total_revenue: Math.round(p.total_revenue * 100) / 100,
        avg_order_value: p.order_count.size > 0 ? Math.round(p.total_revenue / p.order_count.size * 100) / 100 : 0,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)
      .slice(0, limit);

    const totalRevenue = Object.values(skuMap).reduce((s, p) => s + p.total_revenue, 0);
    const totalQuantity = Object.values(skuMap).reduce((s, p) => s + p.total_quantity, 0);

    return NextResponse.json({
      scorecards: {
        totalSkus: Object.keys(skuMap).length,
        totalRevenue: Math.round(totalRevenue),
        totalQuantity,
        topSku: products[0]?.sku || null,
        topSkuRevenue: products[0]?.total_revenue || 0,
      },
      products,
    });

  } catch (err) {
    console.error('Products report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}