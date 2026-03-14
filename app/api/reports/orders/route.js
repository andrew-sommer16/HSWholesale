import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const parseList = (val) => val ? val.split(',').filter(Boolean) : [];

function getPreviousPeriod(dateFrom, dateTo) {
  if (!dateFrom || !dateTo) return { prevFrom: null, prevTo: null };
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const diffMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - diffMs);
  return {
    prevFrom: prevFrom.toISOString().split('T')[0],
    prevTo: prevTo.toISOString().split('T')[0],
  };
}

function pctChange(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  let companies = parseList(searchParams.get('companies'));
  const salesReps = parseList(searchParams.get('salesReps'));
  const customerGroups = parseList(searchParams.get('customerGroups'));
  const orderStatuses = parseList(searchParams.get('orderStatuses'));
  const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);

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

    if (customerGroups.length > 0) {
      const { data: groupCompanies } = await supabaseAdmin
        .from('companies')
        .select('bc_company_id')
        .eq('store_hash', store_hash)
        .in('customer_group_id', customerGroups);
      const groupCompanyIds = groupCompanies?.map(c => c.bc_company_id) || [];
      companies = companies.length > 0 ? companies.filter(c => groupCompanyIds.includes(c)) : groupCompanyIds;
    }

    const buildOrdersQuery = (from, to) => {
      let q = supabaseAdmin
        .from('b2b_orders')
        .select('bc_order_id, company_id, status, custom_status, total_inc_tax, created_at_bc')
        .eq('store_hash', store_hash)
        .not('company_id', 'is', null)
        .neq('status', 'Incomplete');
      if (from) q = q.gte('created_at_bc', from);
      if (to) q = q.lte('created_at_bc', to + 'T23:59:59');
      if (companies.length) q = q.in('company_id', companies);
      return q;
    };

    const { data: allOrders } = await buildOrdersQuery(dateFrom, dateTo);
    const { data: prevOrdersData } = await buildOrdersQuery(prevFrom, prevTo);

    const { data: companiesList } = await supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name')
      .eq('store_hash', store_hash);

    const companyMap = {};
    companiesList?.forEach(c => { companyMap[c.bc_company_id] = c.company_name; });

    const revenueOrders = allOrders?.filter(o => o.custom_status !== 'Invoice Payment') || [];
    const totalRevenue = revenueOrders.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0);
    const totalOrders = revenueOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const awaitingPayment = allOrders?.filter(o => o.status === 'Awaiting Payment').length || 0;

    const prevRevenueOrders = prevOrdersData?.filter(o => o.custom_status !== 'Invoice Payment') || [];
    const prevRevenue = prevRevenueOrders.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0);
    const prevOrderCount = prevRevenueOrders.length;
    const prevAvgOrderValue = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;
    const prevAwaitingPayment = prevOrdersData?.filter(o => o.status === 'Awaiting Payment').length || 0;

    const revenueByMonth = {};
    revenueOrders.forEach(o => {
      if (!o.created_at_bc) return;
      const date = new Date(o.created_at_bc);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth[key] = (revenueByMonth[key] || 0) + (parseFloat(o.total_inc_tax) || 0);
    });

    const revenueChart = Object.entries(revenueByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        value: Math.round(value),
      }));

    const statusCounts = {};
    allOrders?.forEach(o => {
      const s = o.custom_status || o.status || 'Unknown';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });

    const statusChart = Object.entries(statusCounts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);

    const revenueByCompany = {};
    revenueOrders.forEach(o => {
      const name = companyMap[o.company_id] || 'Unknown';
      revenueByCompany[name] = (revenueByCompany[name] || 0) + (parseFloat(o.total_inc_tax) || 0);
    });

    const companyChart = Object.entries(revenueByCompany)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    let pagedQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, b2b_order_id, company_id, status, custom_status, total_inc_tax, currency_code, po_number, created_at_bc, updated_at_bc', { count: 'exact' })
      .eq('store_hash', store_hash)
      .not('company_id', 'is', null)
      .neq('status', 'Incomplete')
      .order('created_at_bc', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (companies.length) pagedQuery = pagedQuery.in('company_id', companies);
    if (dateFrom) pagedQuery = pagedQuery.gte('created_at_bc', dateFrom);
    if (dateTo) pagedQuery = pagedQuery.lte('created_at_bc', dateTo + 'T23:59:59');
    if (orderStatuses.length) pagedQuery = pagedQuery.in('status', orderStatuses);

    const { data: orders, count } = await pagedQuery;

    const rows = orders?.map(o => ({
      bc_order_id: o.bc_order_id,
      company_name: companyMap[o.company_id] || 'Unknown',
      company_id: o.company_id,
      status: o.status, custom_status: o.custom_status,
      total_inc_tax: parseFloat(o.total_inc_tax) || 0,
      currency_code: o.currency_code, po_number: o.po_number,
      created_at_bc: o.created_at_bc, updated_at_bc: o.updated_at_bc,
      is_invoice_payment: o.custom_status === 'Invoice Payment',
    })) || [];

    return NextResponse.json({
      scorecards: {
        totalRevenue: Math.round(totalRevenue),
        revenueChange: pctChange(totalRevenue, prevRevenue),
        totalOrders,
        ordersChange: pctChange(totalOrders, prevOrderCount),
        avgOrderValue: Math.round(avgOrderValue),
        avgOrderValueChange: pctChange(avgOrderValue, prevAvgOrderValue),
        awaitingPayment,
        awaitingPaymentChange: pctChange(awaitingPayment, prevAwaitingPayment),
      },
      revenueChart, statusChart, companyChart,
      orders: rows,
      pagination: { page, limit, total: count || 0, totalPages: Math.ceil((count || 0) / limit) },
    });

  } catch (err) {
    console.error('Orders report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}