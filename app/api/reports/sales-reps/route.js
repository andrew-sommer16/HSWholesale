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
  let filterCompanies = parseList(searchParams.get('companies'));
  const filterReps = parseList(searchParams.get('salesReps'));
  const customerGroups = parseList(searchParams.get('customerGroups'));
  const { prevFrom, prevTo } = getPreviousPeriod(dateFrom, dateTo);

  try {
    if (customerGroups.length > 0) {
      const { data: groupCompanies } = await supabaseAdmin
        .from('companies')
        .select('bc_company_id')
        .eq('store_hash', store_hash)
        .in('customer_group_id', customerGroups);
      const groupCompanyIds = groupCompanies?.map(c => c.bc_company_id) || [];
      filterCompanies = filterCompanies.length > 0 ? filterCompanies.filter(c => groupCompanyIds.includes(c)) : groupCompanyIds;
    }

    let repsQuery = supabaseAdmin
      .from('sales_reps')
      .select('bc_rep_id, first_name, last_name, email')
      .eq('store_hash', store_hash);
    if (filterReps.length) repsQuery = repsQuery.in('bc_rep_id', filterReps);
    const { data: reps } = await repsQuery;

    const { data: assignments } = await supabaseAdmin
      .from('rep_company_assignments')
      .select('rep_id, company_id')
      .eq('store_hash', store_hash);

    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name')
      .eq('store_hash', store_hash);

    const buildOrdersQuery = (from, to) => {
      let q = supabaseAdmin
        .from('b2b_orders')
        .select('bc_order_id, company_id, total_inc_tax, status, custom_status, created_at_bc')
        .eq('store_hash', store_hash)
        .not('company_id', 'is', null)
        .neq('status', 'Incomplete')
        .neq('custom_status', 'Invoice Payment');
      if (filterCompanies.length) q = q.in('company_id', filterCompanies);
      if (from) q = q.gte('created_at_bc', from);
      if (to) q = q.lte('created_at_bc', to + 'T23:59:59');
      return q;
    };

    const buildQuotesQuery = (from, to) => {
      let q = supabaseAdmin
        .from('quotes')
        .select('company_id, status, total_amount')
        .eq('store_hash', store_hash);
      if (filterCompanies.length) q = q.in('company_id', filterCompanies);
      if (from) q = q.gte('created_at_bc', from);
      if (to) q = q.lte('created_at_bc', to + 'T23:59:59');
      return q;
    };

    const { data: orders } = await buildOrdersQuery(dateFrom, dateTo);
    const { data: prevOrders } = await buildOrdersQuery(prevFrom, prevTo);
    const { data: quotes } = await buildQuotesQuery(dateFrom, dateTo);
    const { data: prevQuotesData } = await buildQuotesQuery(prevFrom, prevTo);

    const companyMap = {};
    companies?.forEach(c => { companyMap[c.bc_company_id] = c.company_name; });

    const repCompanies = {};
    assignments?.forEach(a => {
      if (!repCompanies[a.rep_id]) repCompanies[a.rep_id] = new Set();
      repCompanies[a.rep_id].add(a.company_id);
    });

    const revenueByCompany = {};
    orders?.forEach(o => {
      revenueByCompany[o.company_id] = (revenueByCompany[o.company_id] || 0) + (parseFloat(o.total_inc_tax) || 0);
    });

    const ordersByCompany = {};
    orders?.forEach(o => {
      ordersByCompany[o.company_id] = (ordersByCompany[o.company_id] || 0) + 1;
    });

    const quotesByCompany = {};
    quotes?.forEach(q => {
      if (!quotesByCompany[q.company_id]) quotesByCompany[q.company_id] = { total: 0, converted: 0, open_value: 0 };
      quotesByCompany[q.company_id].total += 1;
      if (q.status === '4') quotesByCompany[q.company_id].converted += 1;
      if (['0', '2'].includes(q.status)) quotesByCompany[q.company_id].open_value += parseFloat(q.total_amount) || 0;
    });

    const prevRevenueByCompany = {};
    prevOrders?.forEach(o => {
      prevRevenueByCompany[o.company_id] = (prevRevenueByCompany[o.company_id] || 0) + (parseFloat(o.total_inc_tax) || 0);
    });

    const prevOrdersByCompany = {};
    prevOrders?.forEach(o => {
      prevOrdersByCompany[o.company_id] = (prevOrdersByCompany[o.company_id] || 0) + 1;
    });

    const prevQuotesByCompany = {};
    prevQuotesData?.forEach(q => {
      if (!prevQuotesByCompany[q.company_id]) prevQuotesByCompany[q.company_id] = { total: 0, converted: 0 };
      prevQuotesByCompany[q.company_id].total += 1;
      if (q.status === '4') prevQuotesByCompany[q.company_id].converted += 1;
    });

    const repMonthlyRevenue = {};
    orders?.forEach(o => {
      if (!o.created_at_bc) return;
      const date = new Date(o.created_at_bc);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      assignments?.forEach(a => {
        if (a.company_id === o.company_id) {
          if (!repMonthlyRevenue[a.rep_id]) repMonthlyRevenue[a.rep_id] = {};
          repMonthlyRevenue[a.rep_id][key] = (repMonthlyRevenue[a.rep_id][key] || 0) + (parseFloat(o.total_inc_tax) || 0);
        }
      });
    });

    const repRows = reps?.map(rep => {
      const repCompanyIds = Array.from(repCompanies[rep.bc_rep_id] || []);
      const filteredCompanyIds = filterCompanies.length ? repCompanyIds.filter(id => filterCompanies.includes(id)) : repCompanyIds;
      const companyNames = filteredCompanyIds.map(cid => companyMap[cid]).filter(Boolean);

      let totalRevenue = 0, totalOrders = 0, totalQuotes = 0, convertedQuotes = 0, openQuoteValue = 0;
      let prevRevenue = 0, prevOrderCount = 0, prevTotalQuotes = 0, prevConverted = 0;

      filteredCompanyIds.forEach(cid => {
        totalRevenue += revenueByCompany[cid] || 0;
        totalOrders += ordersByCompany[cid] || 0;
        prevRevenue += prevRevenueByCompany[cid] || 0;
        prevOrderCount += prevOrdersByCompany[cid] || 0;
        const qs = quotesByCompany[cid];
        if (qs) { totalQuotes += qs.total; convertedQuotes += qs.converted; openQuoteValue += qs.open_value; }
        const pqs = prevQuotesByCompany[cid];
        if (pqs) { prevTotalQuotes += pqs.total; prevConverted += pqs.converted; }
      });

      const conversionRate = totalQuotes > 0 ? Math.round((convertedQuotes / totalQuotes) * 100) : 0;
      const prevConversionRate = prevTotalQuotes > 0 ? Math.round((prevConverted / prevTotalQuotes) * 100) : 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const prevAvgOrderValue = prevOrderCount > 0 ? prevRevenue / prevOrderCount : 0;

      const monthly = repMonthlyRevenue[rep.bc_rep_id] || {};
      const revenueChart = Object.entries(monthly)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, value]) => ({
          month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
          value: Math.round(value),
        }));

      return {
        rep_id: rep.bc_rep_id,
        name: `${rep.first_name} ${rep.last_name}`.trim(),
        email: rep.email,
        company_count: filteredCompanyIds.length,
        company_names: companyNames,
        total_revenue: Math.round(totalRevenue),
        total_orders: totalOrders,
        avg_order_value: Math.round(avgOrderValue),
        total_quotes: totalQuotes,
        converted_quotes: convertedQuotes,
        conversion_rate: conversionRate,
        open_quote_value: Math.round(openQuoteValue),
        revenue_chart: revenueChart,
        revenueChange: pctChange(totalRevenue, prevRevenue),
        ordersChange: pctChange(totalOrders, prevOrderCount),
        avgOrderValueChange: pctChange(avgOrderValue, prevAvgOrderValue),
        conversionChange: pctChange(conversionRate, prevConversionRate),
      };
    }).sort((a, b) => b.total_revenue - a.total_revenue) || [];

    const totalRevenue = repRows.reduce((sum, r) => sum + r.total_revenue, 0);
    const totalOrders = repRows.reduce((sum, r) => sum + r.total_orders, 0);
    const totalQuotes = repRows.reduce((sum, r) => sum + r.total_quotes, 0);
    const convertedQuotes = repRows.reduce((sum, r) => sum + r.converted_quotes, 0);
    const overallConversion = totalQuotes > 0 ? Math.round((convertedQuotes / totalQuotes) * 100) : 0;

    const prevTotalRevenue = prevOrders?.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0) || 0;
    const prevTotalOrders = prevOrders?.length || 0;
    const prevTotalQuotes = prevQuotesData?.length || 0;
    const prevConvertedQuotes = prevQuotesData?.filter(q => q.status === '4').length || 0;
    const prevOverallConversion = prevTotalQuotes > 0 ? Math.round((prevConvertedQuotes / prevTotalQuotes) * 100) : 0;

    const repChart = repRows.filter(r => r.total_revenue > 0).map(r => ({ name: r.name, value: r.total_revenue }));

    return NextResponse.json({
      scorecards: {
        totalReps: reps?.length || 0,
        totalRevenue,
        revenueChange: pctChange(totalRevenue, prevTotalRevenue),
        totalOrders,
        ordersChange: pctChange(totalOrders, prevTotalOrders),
        overallConversion,
        conversionChange: pctChange(overallConversion, prevOverallConversion),
      },
      repChart,
      reps: repRows,
    });

  } catch (err) {
    console.error('Sales reps report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}