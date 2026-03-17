import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const parseList = (val) => val ? val.split(',').filter(Boolean) : [];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const dateField = searchParams.get('dateField') || 'created'; // 'created' or 'shipped'
  let companies = parseList(searchParams.get('companies'));
  const customerGroups = parseList(searchParams.get('customerGroups'));
  const salesReps = parseList(searchParams.get('salesReps'));

  // Company custom field filters
  const customFieldFilters = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('ccf_')) {
      const fieldName = decodeURIComponent(key.slice(4));
      customFieldFilters[fieldName] = value.split(',').filter(Boolean);
    }
  }

  try {
    // Filter companies by customer group
    if (customerGroups.length > 0) {
      const { data: groupCompanies } = await supabaseAdmin
        .from('companies')
        .select('bc_company_id')
        .eq('store_hash', store_hash)
        .in('customer_group_id', customerGroups);
      const ids = groupCompanies?.map(c => c.bc_company_id) || [];
      companies = companies.length > 0 ? companies.filter(c => ids.includes(c)) : ids;
    }

    if (salesReps.length > 0) {
      const { data: repAssignments } = await supabaseAdmin
        .from('rep_company_assignments')
        .select('company_id')
        .eq('store_hash', store_hash)
        .in('rep_id', salesReps);
      const ids = repAssignments?.map(a => a.company_id) || [];
      companies = companies.length > 0 ? companies.filter(c => ids.includes(c)) : ids;
    }

    // Filter companies by custom fields
    if (Object.keys(customFieldFilters).length > 0) {
      let cfQuery = supabaseAdmin
        .from('companies')
        .select('bc_company_id, custom_fields')
        .eq('store_hash', store_hash);
      if (companies.length) cfQuery = cfQuery.in('bc_company_id', companies);
      const { data: allCompanies } = await cfQuery;

      const filtered = allCompanies?.filter(c => {
        return Object.entries(customFieldFilters).every(([fieldName, allowedValues]) => {
          return allowedValues.includes(c.custom_fields?.[fieldName]);
        });
      }).map(c => c.bc_company_id) || [];

      companies = filtered;
    }

    // Fetch all companies for this store (for account count and custom field options)
    let companiesQuery = supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, customer_group_id, customer_group_name, custom_fields')
      .eq('store_hash', store_hash)
      .neq('status', '0');
    if (companies.length) companiesQuery = companiesQuery.in('bc_company_id', companies);
    const { data: companiesList } = await companiesQuery;

    const totalAccounts = companiesList?.length || 0;

    // Build company custom field options
    const companyCustomFieldOptions = {};
    companiesList?.forEach(c => {
      if (!c.custom_fields) return;
      Object.entries(c.custom_fields).forEach(([key, value]) => {
        if (!companyCustomFieldOptions[key]) companyCustomFieldOptions[key] = new Set();
        if (value) companyCustomFieldOptions[key].add(value);
      });
    });
    Object.keys(companyCustomFieldOptions).forEach(key => {
      companyCustomFieldOptions[key] = [...companyCustomFieldOptions[key]].sort();
    });

    // Customer group options
    const customerGroupOptions = {};
    companiesList?.forEach(c => {
      if (c.customer_group_id && c.customer_group_name) {
        customerGroupOptions[c.customer_group_id] = c.customer_group_name;
      }
    });

    // Get order line items with orders for date filtering
    const companyIds = companiesList?.map(c => c.bc_company_id) || [];

    // Get orders filtered by date and company
    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, total_inc_tax, status, custom_status, created_at_bc')
      .eq('store_hash', store_hash)
      .neq('custom_status', 'Invoice Payment')
      .neq('custom_status', 'Incomplete')
      .neq('custom_status', 'Cancelled')
      .not('company_id', 'is', null)
      .limit(100000);

    if (companyIds.length) ordersQuery = ordersQuery.in('company_id', companyIds);

    // Date filtering — use orders table for date_shipped, b2b_orders for date_created
    if (dateField === 'shipped') {
      // Filter via orders table join
      let shippedOrdersQuery = supabaseAdmin
        .from('orders')
        .select('bc_order_id')
        .eq('store_hash', store_hash)
        .not('date_shipped', 'is', null)
        .limit(100000);
      if (dateFrom) shippedOrdersQuery = shippedOrdersQuery.gte('date_shipped', dateFrom);
      if (dateTo) shippedOrdersQuery = shippedOrdersQuery.lte('date_shipped', dateTo + 'T23:59:59');
      const { data: shippedOrders } = await shippedOrdersQuery;
      const shippedOrderIds = shippedOrders?.map(o => o.bc_order_id) || [];
      if (shippedOrderIds.length) {
        ordersQuery = ordersQuery.in('bc_order_id', shippedOrderIds);
      } else if (dateFrom || dateTo) {
        return NextResponse.json({
          scorecards: { totalSpend: 0, orderCount: 0, avgOrderValue: 0, totalAccounts },
          categorySpend: [], brandSpend: [],
          companyCustomFieldOptions, customerGroupOptions,
        });
      }
    } else {
      if (dateFrom) ordersQuery = ordersQuery.gte('created_at_bc', dateFrom);
      if (dateTo) ordersQuery = ordersQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    }

    const { data: orders } = await ordersQuery;
    const orderIds = orders?.map(o => o.bc_order_id) || [];

    // Key metrics
    const totalSpend = orders?.reduce((s, o) => s + (parseFloat(o.total_inc_tax) || 0), 0) || 0;
    const orderCount = orders?.length || 0;
    const avgOrderValue = orderCount > 0 ? totalSpend / orderCount : 0;

    // Get line items for category/brand spread
    let categorySpend = [];
    let brandSpend = [];

    if (orderIds.length > 0) {
      const { data: lineItems } = await supabaseAdmin
        .from('order_line_items')
        .select('bc_order_id, product_id, quantity, line_total')
        .eq('store_hash', store_hash)
        .in('bc_order_id', orderIds)
        .limit(100000);

      const productIds = [...new Set(lineItems?.map(i => i.product_id).filter(Boolean))];
      const { data: productCatalog } = productIds.length > 0
        ? await supabaseAdmin
            .from('products')
            .select('bc_product_id, brand, category')
            .eq('store_hash', store_hash)
            .in('bc_product_id', productIds)
        : { data: [] };

      const catalogMap = {};
      productCatalog?.forEach(p => { catalogMap[p.bc_product_id] = p; });

      // Aggregate by category
      const catMap = {};
      const brandMap = {};
      lineItems?.forEach(item => {
        const cat = item.product_id ? (catalogMap[item.product_id]?.category || 'Uncategorized') : 'Uncategorized';
        const brand = item.product_id ? (catalogMap[item.product_id]?.brand || 'Unbranded') : 'Unbranded';
        const revenue = parseFloat(item.line_total || 0);
        catMap[cat] = (catMap[cat] || 0) + revenue;
        brandMap[brand] = (brandMap[brand] || 0) + revenue;
      });

      const totalLineRevenue = Object.values(catMap).reduce((s, v) => s + v, 0);

      categorySpend = Object.entries(catMap)
        .map(([name, spend]) => ({
          name,
          spend: Math.round(spend * 100) / 100,
          pct: totalLineRevenue > 0 ? Math.round((spend / totalLineRevenue) * 100) : 0,
        }))
        .sort((a, b) => b.spend - a.spend);

      brandSpend = Object.entries(brandMap)
        .map(([name, spend]) => ({
          name,
          spend: Math.round(spend * 100) / 100,
          pct: totalLineRevenue > 0 ? Math.round((spend / totalLineRevenue) * 100) : 0,
        }))
        .sort((a, b) => b.spend - a.spend);
    }

    return NextResponse.json({
      scorecards: {
        totalSpend: Math.round(totalSpend),
        orderCount,
        avgOrderValue: Math.round(avgOrderValue),
        totalAccounts,
      },
      categorySpend,
      brandSpend,
      companyCustomFieldOptions,
      customerGroupOptions,
    });

  } catch (err) {
    console.error('Overview error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}