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
  const paymentStatuses = parseList(searchParams.get('paymentStatuses'));
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

    let invoicesQuery = supabaseAdmin
      .from('b2b_invoices_ip')
      .select('invoice_id, order_number, company_id, original_balance, created_at_b2b, due_date')
      .eq('store_hash', store_hash);
    if (companies.length) invoicesQuery = invoicesQuery.in('company_id', companies);
    const { data: invoices } = await invoicesQuery;

    const { data: payments } = await supabaseAdmin
      .from('invoice_payments')
      .select('invoice_id, total_amount')
      .eq('store_hash', store_hash);

    const buildOrdersQuery = (from, to) => {
      let q = supabaseAdmin
        .from('b2b_orders')
        .select('bc_order_id, company_id, total_inc_tax, status, custom_status, created_at_bc')
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

    const paidByInvoiceId = {};
    payments?.forEach(p => {
      if (!p.invoice_id) return;
      paidByInvoiceId[p.invoice_id] = (paidByInvoiceId[p.invoice_id] || 0) + (parseFloat(p.total_amount) || 0);
    });

    // Build invoice lookup including due_date
    const invoiceOutstandingByOrder = {};
    invoices?.forEach(inv => {
      const paid = paidByInvoiceId[inv.invoice_id] || 0;
      const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
      invoiceOutstandingByOrder[inv.order_number] = {
        outstanding, paid, original: parseFloat(inv.original_balance) || 0,
        created_at: inv.created_at_b2b,
        due_date: inv.due_date,
      };
    });

    const orderIds = new Set(allOrders?.map(o => o.bc_order_id) || []);
    const companiesWithOrders = new Set(allOrders?.map(o => o.company_id) || []);
    const today = new Date();

    const agingBucket = (date) => {
      if (!date) return '90+';
      const days = Math.floor((today - new Date(date)) / 86400000);
      if (days <= 30) return '0–30';
      if (days <= 60) return '31–60';
      if (days <= 90) return '61–90';
      return '90+';
    };

    const dueDateStatus = (due_date) => {
      if (!due_date) return null;
      const days = Math.floor((new Date(due_date) - today) / 86400000);
      if (days < 0) return 'overdue';
      if (days <= 7) return 'due_soon';
      return 'on_track';
    };

    let rows = [];

    allOrders?.forEach(o => {
      let invoiceTotal = 0, paid = 0, outstanding = 0;
      let createdAt = o.created_at_bc;
      let due_date = null;

      if (invoiceOutstandingByOrder.hasOwnProperty(o.bc_order_id)) {
        const inv = invoiceOutstandingByOrder[o.bc_order_id];
        invoiceTotal = inv.original; paid = inv.paid; outstanding = inv.outstanding;
        createdAt = inv.created_at || o.created_at_bc;
        due_date = inv.due_date;
      } else if (o.status === 'Awaiting Payment') {
        invoiceTotal = parseFloat(o.total_inc_tax) || 0; outstanding = invoiceTotal;
      } else if (o.status === 'Completed' && o.custom_status === 'Invoice Payment') {
        invoiceTotal = 0; outstanding = parseFloat(o.total_inc_tax) || 0;
      } else return;

      rows.push({
        bc_order_id: o.bc_order_id, company_id: o.company_id,
        company_name: companyMap[o.company_id] || o.company_id || 'Unknown',
        invoice_total: Math.round(invoiceTotal * 100) / 100,
        paid_amount: Math.round(paid * 100) / 100,
        outstanding_amount: Math.round(outstanding * 100) / 100,
        aging_bucket: outstanding > 0 ? agingBucket(createdAt) : 'Paid',
        created_at: createdAt,
        due_date,
        due_date_status: dueDateStatus(due_date),
        pct_paid: invoiceTotal > 0 ? Math.round((paid / invoiceTotal) * 100) : (outstanding > 0 ? 0 : 100),
      });
    });

    invoices?.forEach(inv => {
      if (!orderIds.has(inv.order_number) && companiesWithOrders.has(inv.company_id)) {
        const paid = paidByInvoiceId[inv.invoice_id] || 0;
        const original = parseFloat(inv.original_balance) || 0;
        const outstanding = Math.max(0, original - paid);
        if (outstanding <= 0) return;
        rows.push({
          bc_order_id: inv.order_number, company_id: inv.company_id,
          company_name: companyMap[inv.company_id] || inv.company_id || 'Unknown',
          invoice_total: Math.round(original * 100) / 100,
          paid_amount: Math.round(paid * 100) / 100,
          outstanding_amount: Math.round(outstanding * 100) / 100,
          aging_bucket: agingBucket(inv.created_at_b2b),
          created_at: inv.created_at_b2b,
          due_date: inv.due_date,
          due_date_status: dueDateStatus(inv.due_date),
          pct_paid: original > 0 ? Math.round((paid / original) * 100) : 0,
        });
      }
    });

    if (paymentStatuses.length) {
      rows = rows.filter(r => {
        if (paymentStatuses.includes('outstanding') && r.outstanding_amount > 0) return true;
        if (paymentStatuses.includes('paid') && r.outstanding_amount === 0) return true;
        return false;
      });
    }

    const totalInvoiced = rows.reduce((sum, r) => sum + r.invoice_total, 0);
    const totalPaid = rows.reduce((sum, r) => sum + r.paid_amount, 0);
    const totalOutstanding = rows.reduce((sum, r) => sum + r.outstanding_amount, 0);
    const pctPaidOverall = totalInvoiced > 0 ? Math.round((totalPaid / totalInvoiced) * 100) : 0;

    let prevOutstanding = 0, prevInvoiced = 0, prevPaid = 0;
    prevOrdersData?.forEach(o => {
      if (invoiceOutstandingByOrder.hasOwnProperty(o.bc_order_id)) {
        const inv = invoiceOutstandingByOrder[o.bc_order_id];
        prevInvoiced += inv.original; prevPaid += inv.paid; prevOutstanding += inv.outstanding;
      } else if (o.status === 'Awaiting Payment') {
        const amt = parseFloat(o.total_inc_tax) || 0;
        prevInvoiced += amt; prevOutstanding += amt;
      }
    });

    const agingTotals = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
    rows.forEach(r => {
      if (r.outstanding_amount > 0 && agingTotals.hasOwnProperty(r.aging_bucket)) {
        agingTotals[r.aging_bucket] += r.outstanding_amount;
      }
    });

    const agingChart = Object.entries(agingTotals).map(([bucket, value]) => ({ bucket, value: Math.round(value) }));

    const outstandingByCompany = {};
    rows.forEach(r => {
      if (r.outstanding_amount <= 0) return;
      outstandingByCompany[r.company_name] = (outstandingByCompany[r.company_name] || 0) + r.outstanding_amount;
    });

    const companyChart = Object.entries(outstandingByCompany)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const outstandingByMonth = {};
    rows.forEach(r => {
      if (!r.created_at || r.outstanding_amount <= 0) return;
      const date = new Date(r.created_at);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      outstandingByMonth[key] = (outstandingByMonth[key] || 0) + r.outstanding_amount;
    });

    const outstandingOverTime = Object.entries(outstandingByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        value: Math.round(value),
      }));

    rows.sort((a, b) => b.outstanding_amount - a.outstanding_amount);
    const total = rows.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = rows.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      scorecards: {
        totalOutstanding: Math.round(totalOutstanding),
        outstandingChange: pctChange(totalOutstanding, prevOutstanding),
        totalInvoiced: Math.round(totalInvoiced),
        invoicedChange: pctChange(totalInvoiced, prevInvoiced),
        totalPaid: Math.round(totalPaid),
        paidChange: pctChange(totalPaid, prevPaid),
        pctPaid: pctPaidOverall,
      },
      agingChart, companyChart, outstandingOverTime,
      invoices: paginated,
      pagination: { page, limit, total, totalPages },
    });

  } catch (err) {
    console.error('Net terms report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}