import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const parseList = (val) => val ? val.split(',').filter(Boolean) : [];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const dateField = searchParams.get('dateField') || 'created';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const search = searchParams.get('search') || '';
  let companies = parseList(searchParams.get('companies'));
  const customerGroups = parseList(searchParams.get('customerGroups'));
  const salesReps = parseList(searchParams.get('salesReps'));

  const customFieldFilters = {};
  for (const [key, value] of searchParams.entries()) {
    if (key.startsWith('ccf_')) {
      const fieldName = decodeURIComponent(key.slice(4));
      customFieldFilters[fieldName] = value.split(',').filter(Boolean);
    }
  }

  try {
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

    // Fetch all companies
    let companiesQuery = supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, status, sales_rep_id, customer_group_id, customer_group_name, parent_company_name, primary_email, custom_fields, created_at, created_at_bc')
      .eq('store_hash', store_hash)
      ;
    if (companies.length) companiesQuery = companiesQuery.in('bc_company_id', companies);
    const { data: allCompanies } = await companiesQuery;

    // Apply custom field filters
    let filteredCompanies = allCompanies || [];
    if (Object.keys(customFieldFilters).length > 0) {
      filteredCompanies = filteredCompanies.filter(c =>
        Object.entries(customFieldFilters).every(([fieldName, allowedValues]) =>
          allowedValues.includes(c.custom_fields?.[fieldName])
        )
      );
    }

    // Apply search
    if (search) {
      const s = search.toLowerCase();
      filteredCompanies = filteredCompanies.filter(c =>
        c.company_name?.toLowerCase().includes(s) ||
        c.primary_email?.toLowerCase().includes(s) ||
        c.parent_company_name?.toLowerCase().includes(s)
      );
    }

    // Build extra field options from all companies
    const extraFieldOptions = {};
    (allCompanies || []).forEach(c => {
      if (!c.custom_fields) return;
      Object.entries(c.custom_fields).forEach(([key, value]) => {
        if (!extraFieldOptions[key]) extraFieldOptions[key] = new Set();
        if (value) extraFieldOptions[key].add(value);
      });
    });
    // Build customer group options
    const customerGroupOptions = {};
    (allCompanies || []).forEach(c => {
      if (c.customer_group_id && c.customer_group_name) {
        customerGroupOptions[c.customer_group_id] = c.customer_group_name;
      }
    });

    Object.keys(extraFieldOptions).forEach(key => {
      extraFieldOptions[key] = [...extraFieldOptions[key]].sort();
    });

    const companyIds = filteredCompanies.map(c => c.bc_company_id);

    // Get all orders for these companies
    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, total_inc_tax, custom_status, created_at_bc')
      .eq('store_hash', store_hash)
      .neq('custom_status', 'Invoice Payment')
      .neq('custom_status', 'Incomplete')
      .not('created_at_bc', 'is', null);
    if (companyIds.length) ordersQuery = ordersQuery.in('company_id', companyIds);

    if (dateField === 'shipped') {
      let shippedQuery = supabaseAdmin
        .from('orders')
        .select('bc_order_id')
        .eq('store_hash', store_hash)
        .not('date_shipped', 'is', null);
      if (dateFrom) shippedQuery = shippedQuery.gte('date_shipped', dateFrom);
      if (dateTo) shippedQuery = shippedQuery.lte('date_shipped', dateTo + 'T23:59:59');
      const { data: shippedOrders } = await shippedQuery;
      const shippedIds = shippedOrders?.map(o => o.bc_order_id) || [];
      if (shippedIds.length) ordersQuery = ordersQuery.in('bc_order_id', shippedIds);
    } else {
      if (dateFrom) ordersQuery = ordersQuery.gte('created_at_bc', dateFrom);
      if (dateTo) ordersQuery = ordersQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    }

    const { data: orders } = await ordersQuery;

    // Get sales reps
    const { data: repsList } = await supabaseAdmin
      .from('sales_reps')
      .select('bc_rep_id, first_name, last_name')
      .eq('store_hash', store_hash);
    const repMap = {};
    repsList?.forEach(r => { repMap[r.bc_rep_id] = `${r.first_name} ${r.last_name}`.trim(); });

    // Group orders by company
    const ordersByCompany = {};
    orders?.forEach(o => {
      if (!ordersByCompany[o.company_id]) ordersByCompany[o.company_id] = [];
      ordersByCompany[o.company_id].push(o);
    });

    const today = new Date();

    const rows = filteredCompanies.map(company => {
      const companyOrders = (ordersByCompany[company.bc_company_id] || [])
        .sort((a, b) => new Date(a.created_at_bc) - new Date(b.created_at_bc));

      const accountAge = company.created_at_bc || company.created_at
        ? Math.floor((today - new Date(company.created_at_bc || company.created_at)) / 86400000)
        : null;

      const firstOrder = companyOrders.length > 0 ? companyOrders[0].created_at_bc : null;
      const lastOrder = companyOrders.length > 0 ? companyOrders[companyOrders.length - 1].created_at_bc : null;
      const daysSinceLastOrder = lastOrder
        ? Math.floor((today - new Date(lastOrder)) / 86400000)
        : null;

      let avgDaysBetweenOrders = null;
      if (companyOrders.length >= 2) {
        const gaps = [];
        for (let i = 1; i < companyOrders.length; i++) {
          const gap = Math.floor(
            (new Date(companyOrders[i].created_at_bc) - new Date(companyOrders[i - 1].created_at_bc)) / 86400000
          );
          if (gap > 0) gaps.push(gap);
        }
        if (gaps.length > 0) avgDaysBetweenOrders = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }

      const totalRevenue = companyOrders.reduce((s, o) => s + (parseFloat(o.total_inc_tax) || 0), 0);
      const orderCount = companyOrders.length;
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

      // Order distribution by status
      const statusDist = {};
      companyOrders.forEach(o => {
        const s = o.custom_status || o.status || 'Unknown';
        if (!statusDist[s]) statusDist[s] = { count: 0, total: 0 };
        statusDist[s].count++;
        statusDist[s].total += parseFloat(o.total_inc_tax) || 0;
      });

      // Health score
      let healthScore = 0;
      if (daysSinceLastOrder !== null) {
        if (daysSinceLastOrder <= 30) healthScore += 30;
        else if (daysSinceLastOrder <= 60) healthScore += 20;
        else if (daysSinceLastOrder <= 90) healthScore += 10;
      }
      if (avgDaysBetweenOrders !== null) {
        if (avgDaysBetweenOrders <= 30) healthScore += 25;
        else if (avgDaysBetweenOrders <= 60) healthScore += 18;
        else if (avgDaysBetweenOrders <= 90) healthScore += 10;
        else healthScore += 5;
      }
      if (orderCount >= 20) healthScore += 25;
      else if (orderCount >= 10) healthScore += 18;
      else if (orderCount >= 5) healthScore += 12;
      else if (orderCount >= 1) healthScore += 6;
      if (accountAge !== null) {
        if (accountAge >= 365) healthScore += 20;
        else if (accountAge >= 180) healthScore += 15;
        else if (accountAge >= 90) healthScore += 10;
        else healthScore += 5;
      }

      let tier;
      if (healthScore >= 80) tier = 'Excellent';
      else if (healthScore >= 60) tier = 'Good';
      else if (healthScore >= 40) tier = 'Fair';
      else tier = 'At Risk';

      return {
        company_id: company.bc_company_id,
        company_name: company.company_name,
        primary_email: company.primary_email || null,
        parent_company_name: company.parent_company_name || null,
        customer_group_name: company.customer_group_name || null,
        sales_rep_name: company.sales_rep_id ? repMap[company.sales_rep_id] || null : null,
        custom_fields: company.custom_fields || {},
        health_score: healthScore,
        tier,
        account_age_days: accountAge,
        total_orders: orderCount,
        total_revenue: Math.round(totalRevenue),
        avg_order_value: Math.round(avgOrderValue),
        first_order_date: firstOrder,
        last_order_date: lastOrder,
        days_since_last_order: daysSinceLastOrder,
        avg_days_between_orders: avgDaysBetweenOrders,
        status_distribution: statusDist,
      };
    });

    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = rows.slice((page - 1) * limit, page * limit);

    // Scorecards
    const totalRevenue = rows.reduce((s, r) => s + r.total_revenue, 0);
    const totalOrders = rows.reduce((s, r) => s + r.total_orders, 0);

    return NextResponse.json({
      scorecards: {
        totalAccounts: total,
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
        excellent: rows.filter(r => r.tier === 'Excellent').length,
        good: rows.filter(r => r.tier === 'Good').length,
        fair: rows.filter(r => r.tier === 'Fair').length,
        atRisk: rows.filter(r => r.tier === 'At Risk').length,
      },
      companies: paginated,
      extraFieldOptions,
      customerGroupOptions,
      pagination: { page, limit, total, totalPages },
    });

  } catch (err) {
    console.error('Company analytics error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}