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

    let companiesQuery = supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, status')
      .eq('store_hash', store_hash)
      .eq('status', '1');
    if (companies.length) companiesQuery = companiesQuery.in('bc_company_id', companies);
    const { data: companiesList } = await companiesQuery;

    const buildOrdersQuery = (from, to) => {
      let q = supabaseAdmin
        .from('b2b_orders')
        .select('bc_order_id, company_id, total_inc_tax, status, custom_status')
        .eq('store_hash', store_hash)
        .not('company_id', 'is', null)
        .neq('status', 'Incomplete');
      if (from) q = q.gte('created_at_bc', from);
      if (to) q = q.lte('created_at_bc', to + 'T23:59:59');
      if (companies.length) q = q.in('company_id', companies);
      return q;
    };

    const buildQuotesQuery = (from, to) => {
      let q = supabaseAdmin
        .from('quotes')
        .select('company_id, status, total_amount')
        .eq('store_hash', store_hash);
      if (from) q = q.gte('created_at_bc', from);
      if (to) q = q.lte('created_at_bc', to + 'T23:59:59');
      if (companies.length) q = q.in('company_id', companies);
      return q;
    };

    const { data: allOrders } = await buildOrdersQuery(dateFrom, dateTo);
    const { data: prevOrders } = await buildOrdersQuery(prevFrom, prevTo);
    const { data: quotes } = await buildQuotesQuery(dateFrom, dateTo);
    const { data: prevQuotesData } = await buildQuotesQuery(prevFrom, prevTo);

    const { data: payments } = await supabaseAdmin
      .from('invoice_payments')
      .select('invoice_id, total_amount')
      .eq('store_hash', store_hash);

    let invoicesQuery = supabaseAdmin
      .from('b2b_invoices_ip')
      .select('invoice_id, order_number, company_id, original_balance')
      .eq('store_hash', store_hash);
    if (companies.length) invoicesQuery = invoicesQuery.in('company_id', companies);
    const { data: invoices } = await invoicesQuery;

    const paidByInvoiceId = {};
    payments?.forEach(p => {
      if (!p.invoice_id) return;
      paidByInvoiceId[p.invoice_id] = (paidByInvoiceId[p.invoice_id] || 0) + (parseFloat(p.total_amount) || 0);
    });

    const invoiceOutstandingByOrder = {};
    invoices?.forEach(inv => {
      const paid = paidByInvoiceId[inv.invoice_id] || 0;
      const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
      invoiceOutstandingByOrder[inv.order_number] = outstanding;
    });

    const orderIds = new Set(allOrders?.map(o => o.bc_order_id) || []);
    const companiesWithOrders = new Set(allOrders?.map(o => o.company_id) || []);

    const companyMap = {};
    companiesList?.forEach(c => {
      companyMap[c.bc_company_id] = {
        company_id: c.bc_company_id, company_name: c.company_name,
        revenue: 0, order_count: 0, outstanding: 0,
        open_quote_value: 0, open_quote_count: 0,
        quotes_created: 0, converted_quotes: 0, is_unassigned: false,
      };
    });

    companyMap['__unassigned__'] = {
      company_id: '__unassigned__', company_name: 'Unassigned',
      revenue: 0, order_count: 0, outstanding: 0,
      open_quote_value: 0, open_quote_count: 0,
      quotes_created: 0, converted_quotes: 0, is_unassigned: true,
    };

    allOrders?.forEach(o => {
      if (o.custom_status === 'Invoice Payment') return;
      if (!companyMap[o.company_id]) return;
      companyMap[o.company_id].revenue += parseFloat(o.total_inc_tax) || 0;
      companyMap[o.company_id].order_count += 1;
    });

    allOrders?.forEach(o => {
      if (!companyMap[o.company_id]) return;
      let outstanding = 0;
      if (invoiceOutstandingByOrder.hasOwnProperty(o.bc_order_id)) {
        outstanding = invoiceOutstandingByOrder[o.bc_order_id];
      } else if (o.status === 'Awaiting Payment') {
        outstanding = parseFloat(o.total_inc_tax) || 0;
      } else if (o.status === 'Completed' && o.custom_status === 'Invoice Payment') {
        outstanding = parseFloat(o.total_inc_tax) || 0;
      }
      companyMap[o.company_id].outstanding += outstanding;
    });

    invoices?.forEach(inv => {
      if (!orderIds.has(inv.order_number) && companiesWithOrders.has(inv.company_id)) {
        if (!companyMap[inv.company_id]) return;
        const paid = paidByInvoiceId[inv.invoice_id] || 0;
        const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
        companyMap[inv.company_id].outstanding += outstanding;
      }
    });

    quotes?.forEach(q => {
      const key = q.company_id || '__unassigned__';
      if (!companyMap[key]) return;
      companyMap[key].quotes_created += 1;
      if (q.status === '4') companyMap[key].converted_quotes += 1;
      if (['0', '2'].includes(q.status)) {
        companyMap[key].open_quote_value += parseFloat(q.total_amount) || 0;
        companyMap[key].open_quote_count += 1;
      }
    });

    const allRows = Object.values(companyMap).map(c => ({
      ...c,
      revenue: Math.round(c.revenue * 100) / 100,
      outstanding: Math.round(c.outstanding * 100) / 100,
      open_quote_value: Math.round(c.open_quote_value * 100) / 100,
      quote_conversion: c.quotes_created > 0 ? Math.round((c.converted_quotes / c.quotes_created) * 100) : 0,
    }));

    const companyRows = allRows.filter(c => !c.is_unassigned).sort((a, b) => b.revenue - a.revenue);
    const unassigned = allRows.find(c => c.is_unassigned);
    const allSorted = unassigned && unassigned.quotes_created > 0 ? [...companyRows, unassigned] : companyRows;

    const totalRevenue = allRows.reduce((s, c) => s + c.revenue, 0);
    const totalOrders = allRows.reduce((s, c) => s + c.order_count, 0);
    const totalOutstanding = allRows.reduce((s, c) => s + c.outstanding, 0);
    const totalOpenQuoteValue = allRows.reduce((s, c) => s + c.open_quote_value, 0);

    const prevRevenue = prevOrders?.filter(o => o.custom_status !== 'Invoice Payment')
      .reduce((s, o) => s + (parseFloat(o.total_inc_tax) || 0), 0) || 0;
    const prevOrderCount = prevOrders?.filter(o => o.custom_status !== 'Invoice Payment').length || 0;
    const prevOpenQuoteValue = prevQuotesData?.filter(q => ['0', '2'].includes(q.status))
      .reduce((s, q) => s + (parseFloat(q.total_amount) || 0), 0) || 0;

    const total = allSorted.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = allSorted.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      companies: paginated,
      pagination: { page, limit, total, totalPages },
      scorecards: {
        totalRevenue: Math.round(totalRevenue),
        revenueChange: pctChange(totalRevenue, prevRevenue),
        totalOrders,
        ordersChange: pctChange(totalOrders, prevOrderCount),
        totalOutstanding: Math.round(totalOutstanding),
        totalOpenQuoteValue: Math.round(totalOpenQuoteValue),
        openQuoteValueChange: pctChange(totalOpenQuoteValue, prevOpenQuoteValue),
      },
    });

  } catch (err) {
    console.error('Companies report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}