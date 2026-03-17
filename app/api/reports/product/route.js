import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const sku = searchParams.get('sku');
  const product_id = searchParams.get('product_id');
  const mode = searchParams.get('mode') || 'sku'; // 'sku' or 'product'
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const dateField = searchParams.get('dateField') || 'created';

  try {
    // Get orders filtered by date
    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, created_at_bc')
      .eq('store_hash', store_hash)
      .neq('custom_status', 'Invoice Payment')
      .neq('custom_status', 'Incomplete')
      .neq('custom_status', 'Cancelled')
      .limit(100000);

    if (dateField === 'shipped') {
      const { data: shippedOrders } = await supabaseAdmin
        .from('orders')
        .select('bc_order_id')
        .eq('store_hash', store_hash)
        .not('date_shipped', 'is', null)
        .gte('date_shipped', dateFrom || '2000-01-01')
        .lte('date_shipped', (dateTo || new Date().toISOString().split('T')[0]) + 'T23:59:59')
        .limit(100000);
      const shippedIds = shippedOrders?.map(o => o.bc_order_id) || [];
      if (shippedIds.length) ordersQuery = ordersQuery.in('bc_order_id', shippedIds);
    } else {
      if (dateFrom) ordersQuery = ordersQuery.gte('created_at_bc', dateFrom);
      if (dateTo) ordersQuery = ordersQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    }

    const { data: orders } = await ordersQuery;
    const orderIds = orders?.map(o => o.bc_order_id) || [];
    const orderMap = {};
    orders?.forEach(o => { orderMap[o.bc_order_id] = o; });

    if (orderIds.length === 0) {
      return NextResponse.json({ product: null, skus: [], companies: [] });
    }

    // Get line items based on mode
    let lineItemsQuery = supabaseAdmin
      .from('order_line_items')
      .select('bc_order_id, product_id, sku, product_name, quantity, base_price, line_total')
      .eq('store_hash', store_hash)
      .in('bc_order_id', orderIds)
      .limit(100000);

    if (mode === 'sku') {
      lineItemsQuery = lineItemsQuery.eq('sku', sku);
    } else {
      // Product mode — get all SKUs for this product_id
      lineItemsQuery = lineItemsQuery.eq('product_id', product_id);
    }

    const { data: lineItems } = await lineItemsQuery;

    // Get product info
    const { data: productInfo } = product_id
      ? await supabaseAdmin
          .from('products')
          .select('name, sku, brand, category, custom_fields')
          .eq('store_hash', store_hash)
          .eq('bc_product_id', product_id)
          .single()
      : { data: null };

    // Get companies for lookup
    const companyIds = [...new Set(
      lineItems?.map(item => orderMap[item.bc_order_id]?.company_id).filter(Boolean)
    )];

    const { data: companiesList } = companyIds.length > 0
      ? await supabaseAdmin
          .from('companies')
          .select('bc_company_id, company_name, customer_group_name')
          .eq('store_hash', store_hash)
          .in('bc_company_id', companyIds)
      : { data: [] };

    const companyMap = {};
    companiesList?.forEach(c => { companyMap[c.bc_company_id] = c; });

    // Aggregate by company
    const companyAgg = {};
    lineItems?.forEach(item => {
      const order = orderMap[item.bc_order_id];
      if (!order?.company_id) return;

      const companyId = order.company_id;
      if (!companyAgg[companyId]) {
        const co = companyMap[companyId];
        companyAgg[companyId] = {
          company_id: companyId,
          company_name: co?.company_name || companyId,
          customer_group_name: co?.customer_group_name || null,
          order_count: new Set(),
          total_quantity: 0,
          total_spend: 0,
          last_order_date: null,
        };
      }
      companyAgg[companyId].order_count.add(item.bc_order_id);
      companyAgg[companyId].total_quantity += parseInt(item.quantity || 0);
      companyAgg[companyId].total_spend += parseFloat(item.line_total || 0);

      const orderDate = order.created_at_bc;
      if (orderDate && (!companyAgg[companyId].last_order_date || orderDate > companyAgg[companyId].last_order_date)) {
        companyAgg[companyId].last_order_date = orderDate;
      }
    });

    const companies = Object.values(companyAgg)
      .map(c => ({
        ...c,
        order_count: c.order_count.size,
        total_spend: Math.round(c.total_spend * 100) / 100,
      }))
      .sort((a, b) => b.total_spend - a.total_spend);

    // For product mode — also aggregate by SKU (child variants)
    let skus = [];
    if (mode === 'product') {
      const skuAgg = {};
      lineItems?.forEach(item => {
        const s = item.sku || 'Unknown';
        if (!skuAgg[s]) {
          skuAgg[s] = {
            sku: s,
            product_name: item.product_name,
            order_count: new Set(),
            total_quantity: 0,
            total_spend: 0,
            last_order_date: null,
          };
        }
        skuAgg[s].order_count.add(item.bc_order_id);
        skuAgg[s].total_quantity += parseInt(item.quantity || 0);
        skuAgg[s].total_spend += parseFloat(item.line_total || 0);

        const orderDate = orderMap[item.bc_order_id]?.created_at_bc;
        if (orderDate && (!skuAgg[s].last_order_date || orderDate > skuAgg[s].last_order_date)) {
          skuAgg[s].last_order_date = orderDate;
        }
      });

      skus = Object.values(skuAgg)
        .map(s => ({ ...s, order_count: s.order_count.size, total_spend: Math.round(s.total_spend * 100) / 100 }))
        .sort((a, b) => b.total_spend - a.total_spend);
    }

    // Overall scorecards
    const totalQuantity = companies.reduce((s, c) => s + c.total_quantity, 0);
    const totalSpend = companies.reduce((s, c) => s + c.total_spend, 0);
    const totalOrders = new Set(lineItems?.map(i => i.bc_order_id)).size;

    return NextResponse.json({
      product: {
        sku: mode === 'sku' ? sku : (productInfo?.sku || sku),
        product_name: lineItems?.[0]?.product_name || productInfo?.name || sku,
        brand: productInfo?.brand || null,
        category: productInfo?.category || null,
        custom_fields: productInfo?.custom_fields || {},
        mode,
      },
      scorecards: {
        totalCompanies: companies.length,
        totalOrders,
        totalQuantity,
        totalSpend: Math.round(totalSpend * 100) / 100,
      },
      skus,
      companies,
    });

  } catch (err) {
    console.error('Product detail error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}