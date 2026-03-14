import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  try {
    // Company details first (needed to get sales_rep_id)
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, status, bc_group_id, bc_group_name, customer_group_id, customer_group_name, sales_rep_id')
      .eq('store_hash', store_hash)
      .eq('bc_company_id', id)
      .single();

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    // Run orders, quotes, invoices, and sales rep lookup in parallel
    const [
      { data: orders },
      { data: quotes },
      { data: invoices },
      salesRepResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('b2b_orders')
        .select('bc_order_id, total_inc_tax, status, custom_status, created_at_bc, currency_code, po_number')
        .eq('store_hash', store_hash)
        .eq('company_id', id)
        .neq('status', 'Incomplete')
        .order('created_at_bc', { ascending: false }),

      supabaseAdmin
        .from('quotes')
        .select('bc_quote_id, status, total_amount, created_at_bc, expires_at, converted_order_id')
        .eq('store_hash', store_hash)
        .eq('company_id', id)
        .neq('bc_quote_id', 'undefined')
        .order('created_at_bc', { ascending: false }),

      supabaseAdmin
        .from('b2b_invoices_ip')
        .select('invoice_id, order_number, original_balance, created_at_b2b')
        .eq('store_hash', store_hash)
        .eq('company_id', id),

      company.sales_rep_id
        ? supabaseAdmin
            .from('sales_reps')
            .select('first_name, last_name')
            .eq('store_hash', store_hash)
            .eq('bc_rep_id', company.sales_rep_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const salesRepName = salesRepResult?.data
      ? `${salesRepResult.data.first_name} ${salesRepResult.data.last_name}`.trim()
      : null;

    // Fetch payments scoped only to this company's invoice IDs
    const invoiceIds = invoices?.map(i => i.invoice_id).filter(Boolean) || [];
    const { data: payments } = invoiceIds.length
      ? await supabaseAdmin
          .from('invoice_payments')
          .select('invoice_id, total_amount')
          .eq('store_hash', store_hash)
          .in('invoice_id', invoiceIds)
      : { data: [] };

    // Build payment lookup
    const paidByInvoiceId = {};
    payments?.forEach(p => {
      if (!p.invoice_id) return;
      paidByInvoiceId[p.invoice_id] = (paidByInvoiceId[p.invoice_id] || 0) + (parseFloat(p.total_amount) || 0);
    });

    const invoiceOutstandingByOrder = {};
    invoices?.forEach(inv => {
      const paid = paidByInvoiceId[inv.invoice_id] || 0;
      const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
      invoiceOutstandingByOrder[inv.order_number] = {
        outstanding,
        paid,
        original: parseFloat(inv.original_balance) || 0,
      };
    });

    const orderIds = new Set(orders?.map(o => o.bc_order_id) || []);

    // Scorecards
    const revenueOrders = orders?.filter(o => o.custom_status !== 'Invoice Payment') || [];
    const totalRevenue = revenueOrders.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0);
    const totalOrders = revenueOrders.length;

    let totalOutstanding = 0;
    orders?.forEach(o => {
      if (invoiceOutstandingByOrder.hasOwnProperty(o.bc_order_id)) {
        totalOutstanding += invoiceOutstandingByOrder[o.bc_order_id].outstanding;
      } else if (o.status === 'Awaiting Payment') {
        totalOutstanding += parseFloat(o.total_inc_tax) || 0;
      } else if (o.status === 'Completed' && o.custom_status === 'Invoice Payment') {
        totalOutstanding += parseFloat(o.total_inc_tax) || 0;
      }
    });

    invoices?.forEach(inv => {
      if (!orderIds.has(inv.order_number)) {
        const paid = paidByInvoiceId[inv.invoice_id] || 0;
        totalOutstanding += Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
      }
    });

    const openQuotes = quotes?.filter(q => ['0', '2'].includes(q.status)) || [];
    const openQuoteValue = openQuotes.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0);

    // Revenue by month
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

    const today = new Date();

    const agingBucket = (date) => {
      if (!date) return '90+';
      const days = Math.floor((today - new Date(date)) / 86400000);
      if (days <= 30) return '0–30';
      if (days <= 60) return '31–60';
      if (days <= 90) return '61–90';
      return '90+';
    };

    const statusName = (s) => {
      const map = { '0': 'New', '2': 'In Process', '4': 'Ordered', '5': 'Expired', '6': 'Archived' };
      return map[String(s)] || String(s);
    };

    const invoiceRows = orders?.map(o => {
      let invoiceTotal = 0, paid = 0, outstanding = 0;
      if (invoiceOutstandingByOrder.hasOwnProperty(o.bc_order_id)) {
        const inv = invoiceOutstandingByOrder[o.bc_order_id];
        invoiceTotal = inv.original; paid = inv.paid; outstanding = inv.outstanding;
      } else if (o.status === 'Awaiting Payment') {
        invoiceTotal = parseFloat(o.total_inc_tax) || 0; outstanding = invoiceTotal;
      } else if (o.status === 'Completed' && o.custom_status === 'Invoice Payment') {
        outstanding = parseFloat(o.total_inc_tax) || 0;
      } else return null;
      return {
        bc_order_id: o.bc_order_id,
        invoice_total: Math.round(invoiceTotal * 100) / 100,
        paid_amount: Math.round(paid * 100) / 100,
        outstanding_amount: Math.round(outstanding * 100) / 100,
        aging_bucket: outstanding > 0 ? agingBucket(o.created_at_bc) : 'Paid',
        created_at: o.created_at_bc,
        pct_paid: invoiceTotal > 0 ? Math.round((paid / invoiceTotal) * 100) : (outstanding > 0 ? 0 : 100),
      };
    }).filter(Boolean) || [];

    const quoteRows = quotes?.map(q => ({
      quote_id: q.bc_quote_id,
      status: q.status,
      status_name: statusName(q.status),
      total_amount: parseFloat(q.total_amount) || 0,
      created_at: q.created_at_bc,
      expires_at: q.expires_at,
      converted_order_id: q.converted_order_id,
      days_old: q.created_at_bc ? Math.floor((today - new Date(q.created_at_bc)) / 86400000) : null,
    })) || [];

    const orderRows = orders?.map(o => ({
      bc_order_id: o.bc_order_id,
      status: o.status,
      custom_status: o.custom_status,
      total_inc_tax: parseFloat(o.total_inc_tax) || 0,
      currency_code: o.currency_code,
      po_number: o.po_number,
      created_at_bc: o.created_at_bc,
      is_invoice_payment: o.custom_status === 'Invoice Payment',
    })) || [];

    return NextResponse.json({
      company: { ...company, sales_rep_name: salesRepName },
      scorecards: {
        totalRevenue: Math.round(totalRevenue),
        totalOrders,
        totalOutstanding: Math.round(totalOutstanding),
        openQuoteValue: Math.round(openQuoteValue),
        openQuotes: openQuotes.length,
        totalQuotes: quotes?.length || 0,
      },
      revenueChart,
      orders: orderRows,
      quotes: quoteRows,
      invoices: invoiceRows,
    });

  } catch (err) {
    console.error('Company detail error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}