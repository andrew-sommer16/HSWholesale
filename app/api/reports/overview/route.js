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

    const [
      { data: b2bOrders },
      { data: allQuotes },
      { data: prevOrders },
      { data: prevQuotes },
      { data: payments },
      { data: invoices },
      { data: allOrders },
      { count: activeCompanies },
    ] = await Promise.all([
      (() => {
        let q = supabaseAdmin
          .from('b2b_orders')
          .select('bc_order_id, company_id, total_inc_tax, custom_status, status, created_at_bc')
          .eq('store_hash', store_hash)
          .not('company_id', 'is', null)
          .neq('custom_status', 'Invoice Payment')
          .neq('status', 'Incomplete');
        if (dateFrom) q = q.gte('created_at_bc', dateFrom);
        if (dateTo) q = q.lte('created_at_bc', dateTo + 'T23:59:59');
        if (companies.length) q = q.in('company_id', companies);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from('quotes')
          .select('status, total_amount')
          .eq('store_hash', store_hash);
        if (dateFrom) q = q.gte('created_at_bc', dateFrom);
        if (dateTo) q = q.lte('created_at_bc', dateTo + 'T23:59:59');
        if (companies.length) q = q.in('company_id', companies);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from('b2b_orders')
          .select('bc_order_id, company_id, total_inc_tax, custom_status, status, created_at_bc')
          .eq('store_hash', store_hash)
          .not('company_id', 'is', null)
          .neq('custom_status', 'Invoice Payment')
          .neq('status', 'Incomplete');
        if (prevFrom) q = q.gte('created_at_bc', prevFrom);
        if (prevTo) q = q.lte('created_at_bc', prevTo + 'T23:59:59');
        if (companies.length) q = q.in('company_id', companies);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from('quotes')
          .select('status, total_amount')
          .eq('store_hash', store_hash);
        if (prevFrom) q = q.gte('created_at_bc', prevFrom);
        if (prevTo) q = q.lte('created_at_bc', prevTo + 'T23:59:59');
        if (companies.length) q = q.in('company_id', companies);
        return q;
      })(),
      supabaseAdmin
        .from('invoice_payments')
        .select('invoice_id, total_amount')
        .eq('store_hash', store_hash),
      (() => {
        let q = supabaseAdmin
          .from('b2b_invoices_ip')
          .select('invoice_id, order_number, company_id, original_balance')
          .eq('store_hash', store_hash);
        if (companies.length) q = q.in('company_id', companies);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from('b2b_orders')
          .select('bc_order_id, company_id, total_inc_tax, status, custom_status')
          .eq('store_hash', store_hash)
          .not('company_id', 'is', null)
          .neq('status', 'Incomplete');
        if (companies.length) q = q.in('company_id', companies);
        return q;
      })(),
      (() => {
        let q = supabaseAdmin
          .from('companies')
          .select('*', { count: 'exact', head: true })
          .eq('store_hash', store_hash)
          .eq('status', '1');
        if (companies.length) q = q.in('bc_company_id', companies);
        return q;
      })(),
    ]);

    const totalRevenue = b2bOrders?.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0) || 0;
    const totalQuotes = allQuotes?.length || 0;
    const convertedQuotes = allQuotes?.filter(q => q.status === '4').length || 0;
    const conversionRate = totalQuotes > 0 ? Math.round((convertedQuotes / totalQuotes) * 100) : 0;
    const openQuotes = allQuotes?.filter(q => ['0', '2'].includes(q.status)) || [];
    const pipelineValue = openQuotes.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0);

    const prevRevenue = prevOrders?.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0) || 0;
    const prevTotalQuotes = prevQuotes?.length || 0;
    const prevConverted = prevQuotes?.filter(q => q.status === '4').length || 0;
    const prevConversionRate = prevTotalQuotes > 0 ? Math.round((prevConverted / prevTotalQuotes) * 100) : 0;
    const prevOpenQuotes = prevQuotes?.filter(q => ['0', '2'].includes(q.status)) || [];
    const prevPipelineValue = prevOpenQuotes.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0);

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

    const companiesWithOrders = new Set(allOrders?.map(o => o.company_id) || []);
    const orderIds = new Set(allOrders?.map(o => o.bc_order_id) || []);

    let overdueBalance = 0;
    allOrders?.forEach(o => {
      if (invoiceOutstandingByOrder.hasOwnProperty(o.bc_order_id)) {
        overdueBalance += invoiceOutstandingByOrder[o.bc_order_id];
      } else if (o.status === 'Awaiting Payment') {
        overdueBalance += parseFloat(o.total_inc_tax) || 0;
      } else if (o.status === 'Completed' && o.custom_status === 'Invoice Payment') {
        overdueBalance += parseFloat(o.total_inc_tax) || 0;
      }
    });

    invoices?.forEach(inv => {
      if (!orderIds.has(inv.order_number) && companiesWithOrders.has(inv.company_id)) {
        const paid = paidByInvoiceId[inv.invoice_id] || 0;
        const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
        overdueBalance += outstanding;
      }
    });

    const revenueByMonth = {};
    b2bOrders?.forEach(o => {
      if (!o.created_at_bc) return;
      const date = new Date(o.created_at_bc);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      revenueByMonth[key] = (revenueByMonth[key] || 0) + (parseFloat(o.total_inc_tax) || 0);
    });

    const revenueChart = Object.entries(revenueByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, revenue]) => ({
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        revenue: Math.round(revenue),
      }));

    return NextResponse.json({
      totalRevenue: Math.round(totalRevenue),
      prevRevenue: Math.round(prevRevenue),
      revenueChange: pctChange(totalRevenue, prevRevenue),
      activeCompanies: activeCompanies || 0,
      pipelineValue: Math.round(pipelineValue),
      prevPipelineValue: Math.round(prevPipelineValue),
      pipelineChange: pctChange(pipelineValue, prevPipelineValue),
      overdueBalance: Math.round(overdueBalance),
      revenueChart,
      totalQuotes,
      prevTotalQuotes,
      quotesChange: pctChange(totalQuotes, prevTotalQuotes),
      convertedQuotes,
      conversionRate,
      prevConversionRate,
      conversionChange: pctChange(conversionRate, prevConversionRate),
    });

  } catch (err) {
    console.error('Overview error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}