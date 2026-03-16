import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const dateField = searchParams.get('dateField') || 'created';

  try {
    // Get company info
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, primary_email, parent_company_name, customer_group_name, sales_rep_id, custom_fields, created_at_bc')
      .eq('store_hash', store_hash)
      .eq('bc_company_id', id)
      .single();

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    // Get sales rep name
    let salesRepName = null;
    if (company.sales_rep_id) {
      const { data: rep } = await supabaseAdmin
        .from('sales_reps')
        .select('first_name, last_name')
        .eq('store_hash', store_hash)
        .eq('bc_rep_id', company.sales_rep_id)
        .single();
      if (rep) salesRepName = `${rep.first_name} ${rep.last_name}`.trim();
    }

    // Get orders
    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, custom_status, total_inc_tax, po_number, created_at_bc, currency_code')
      .eq('store_hash', store_hash)
      .eq('company_id', id)
      .neq('custom_status', 'Invoice Payment')
      .neq('custom_status', 'Incomplete')
      .order('created_at_bc', { ascending: false });

    if (dateField === 'shipped') {
      const { data: shippedOrders } = await supabaseAdmin
        .from('orders')
        .select('bc_order_id')
        .eq('store_hash', store_hash)
        .not('date_shipped', 'is', null)
        .gte('date_shipped', dateFrom || '2000-01-01')
        .lte('date_shipped', (dateTo || new Date().toISOString().split('T')[0]) + 'T23:59:59');
      const shippedIds = shippedOrders?.map(o => o.bc_order_id) || [];
      if (shippedIds.length) ordersQuery = ordersQuery.in('bc_order_id', shippedIds);
    } else {
      if (dateFrom) ordersQuery = ordersQuery.gte('created_at_bc', dateFrom);
      if (dateTo) ordersQuery = ordersQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    }

    const { data: orders } = await ordersQuery;

    // Get order line items from Supabase
    const orderIds = orders?.map(o => o.bc_order_id) || [];
    const { data: lineItems } = orderIds.length > 0
      ? await supabaseAdmin
          .from('order_line_items')
          .select('bc_order_id, sku, product_name, quantity, base_price, line_total')
          .eq('store_hash', store_hash)
          .in('bc_order_id', orderIds)
      : { data: [] };

    // Group line items by order
    const lineItemsByOrder = {};
    lineItems?.forEach(item => {
      if (!lineItemsByOrder[item.bc_order_id]) lineItemsByOrder[item.bc_order_id] = [];
      lineItemsByOrder[item.bc_order_id].push(item);
    });

    // Scorecards
    const totalRevenue = orders?.reduce((s, o) => s + (parseFloat(o.total_inc_tax) || 0), 0) || 0;
    const orderCount = orders?.length || 0;
    const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
    const today = new Date();
    const lastOrder = orders?.[0]?.created_at_bc;
    const daysSinceLastOrder = lastOrder
      ? Math.floor((today - new Date(lastOrder)) / 86400000)
      : null;

    return NextResponse.json({
      company: {
        ...company,
        sales_rep_name: salesRepName,
      },
      scorecards: {
        totalRevenue: Math.round(totalRevenue),
        orderCount,
        avgOrderValue: Math.round(avgOrderValue),
        daysSinceLastOrder,
      },
      orders: (orders || []).map(o => ({
        ...o,
        line_items: lineItemsByOrder[o.bc_order_id] || [],
      })),
    });

  } catch (err) {
    console.error('Company detail error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}