import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

const parseList = (val) => val ? val.split(',').filter(Boolean) : [];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  let companies = parseList(searchParams.get('companies'));
  const salesReps = parseList(searchParams.get('salesReps'));
  const customerGroups = parseList(searchParams.get('customerGroups'));

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
      .select('bc_company_id, company_name, sales_rep_id')
      .eq('store_hash', store_hash)
      .eq('status', '1');
    if (companies.length) companiesQuery = companiesQuery.in('bc_company_id', companies);
    const { data: companiesList } = await companiesQuery;

    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, total_inc_tax, status, custom_status, created_at_bc')
      .eq('store_hash', store_hash)
      .not('company_id', 'is', null)
      .neq('status', 'Incomplete');
    if (companies.length) ordersQuery = ordersQuery.in('company_id', companies);
    const { data: allOrders } = await ordersQuery;

    // Fetch invoices including due_date
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

    let quotesQuery = supabaseAdmin
      .from('quotes')
      .select('bc_quote_id, company_id, status, total_amount, created_at_bc')
      .eq('store_hash', store_hash)
      .in('status', ['0', '2']);
    if (companies.length) quotesQuery = quotesQuery.in('company_id', companies);
    const { data: openQuotes } = await quotesQuery;

    const { data: reps } = await supabaseAdmin
      .from('sales_reps')
      .select('bc_rep_id, first_name, last_name')
      .eq('store_hash', store_hash);

    const repMap = {};
    reps?.forEach(r => { repMap[r.bc_rep_id] = `${r.first_name} ${r.last_name}`.trim(); });

    const paidByInvoiceId = {};
    payments?.forEach(p => {
      if (!p.invoice_id) return;
      paidByInvoiceId[p.invoice_id] = (paidByInvoiceId[p.invoice_id] || 0) + (parseFloat(p.total_amount) || 0);
    });

    const today = new Date();

    const ordersByCompany = {};
    allOrders?.forEach(o => {
      if (!ordersByCompany[o.company_id]) ordersByCompany[o.company_id] = [];
      ordersByCompany[o.company_id].push(o);
    });

    const invoicesByCompany = {};
    invoices?.forEach(inv => {
      if (!invoicesByCompany[inv.company_id]) invoicesByCompany[inv.company_id] = [];
      invoicesByCompany[inv.company_id].push(inv);
    });

    const quotesByCompany = {};
    openQuotes?.forEach(q => {
      if (!quotesByCompany[q.company_id]) quotesByCompany[q.company_id] = [];
      quotesByCompany[q.company_id].push(q);
    });

    const atRiskCompanies = [];

    companiesList?.forEach(company => {
      const cid = company.bc_company_id;
      const companyOrders = ordersByCompany[cid] || [];
      const companyInvoices = invoicesByCompany[cid] || [];
      const companyQuotes = quotesByCompany[cid] || [];

      const risks = [];
      let riskScore = 0;

      // Risk 1: No recent orders (60+ days)
      const revenueOrders = companyOrders.filter(o => o.custom_status !== 'Invoice Payment');
      if (revenueOrders.length > 0) {
        const lastOrder = revenueOrders.reduce((latest, o) => {
          return !latest || new Date(o.created_at_bc) > new Date(latest.created_at_bc) ? o : latest;
        }, null);
        const daysSinceOrder = lastOrder ? Math.floor((today - new Date(lastOrder.created_at_bc)) / 86400000) : null;
        if (daysSinceOrder !== null && daysSinceOrder >= 60) {
          risks.push({
            type: 'inactive',
            label: 'No recent orders',
            detail: `Last order ${daysSinceOrder} days ago`,
            severity: daysSinceOrder >= 90 ? 'high' : 'medium',
          });
          riskScore += daysSinceOrder >= 90 ? 3 : 2;
        }
      }

      // Risk 2: Overdue balance — use actual due_date if available, fall back to 60+ day age
      let overdueOutstanding = 0;
      let overdueInvoiceCount = 0;

      companyOrders.forEach(o => {
        const inv = companyInvoices.find(i => i.order_number === o.bc_order_id);
        if (inv) {
          const paid = paidByInvoiceId[inv.invoice_id] || 0;
          const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
          if (outstanding > 0) {
            // Use due_date if available, otherwise fall back to 60-day age rule
            const isOverdue = inv.due_date
              ? new Date(inv.due_date) < today
              : Math.floor((today - new Date(inv.created_at_b2b)) / 86400000) >= 60;
            if (isOverdue) {
              overdueOutstanding += outstanding;
              overdueInvoiceCount++;
            }
          }
        } else if (o.status === 'Awaiting Payment') {
          // No invoice record — fall back to order age
          const orderAge = Math.floor((today - new Date(o.created_at_bc)) / 86400000);
          if (orderAge >= 60) {
            overdueOutstanding += parseFloat(o.total_inc_tax) || 0;
            overdueInvoiceCount++;
          }
        }
      });

      // Also check invoices not matched to orders
      companyInvoices.forEach(inv => {
        const matchedOrder = companyOrders.find(o => o.bc_order_id === inv.order_number);
        if (!matchedOrder) {
          const paid = paidByInvoiceId[inv.invoice_id] || 0;
          const outstanding = Math.max(0, (parseFloat(inv.original_balance) || 0) - paid);
          if (outstanding > 0 && inv.due_date && new Date(inv.due_date) < today) {
            overdueOutstanding += outstanding;
            overdueInvoiceCount++;
          }
        }
      });

      if (overdueOutstanding > 0) {
        risks.push({
          type: 'overdue',
          label: 'Overdue balance',
          detail: `${overdueInvoiceCount} invoice${overdueInvoiceCount > 1 ? 's' : ''} past due — $${Math.round(overdueOutstanding).toLocaleString()} outstanding`,
          severity: overdueOutstanding >= 5000 ? 'high' : 'medium',
        });
        riskScore += overdueOutstanding >= 5000 ? 3 : 2;
      }

      // Risk 3: Aging open quotes (90+ days)
      const agingQuotes = companyQuotes.filter(q => {
        if (!q.created_at_bc) return false;
        const days = Math.floor((today - new Date(q.created_at_bc)) / 86400000);
        return days >= 90;
      });

      if (agingQuotes.length > 0) {
        const agingValue = agingQuotes.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0);
        risks.push({
          type: 'aging_quotes',
          label: 'Aging quotes',
          detail: `${agingQuotes.length} quote${agingQuotes.length > 1 ? 's' : ''} open 90+ days ($${Math.round(agingValue).toLocaleString()})`,
          severity: agingQuotes.length >= 3 ? 'high' : 'medium',
        });
        riskScore += agingQuotes.length >= 3 ? 2 : 1;
      }

      if (risks.length > 0) {
        const totalRevenue = revenueOrders.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0);
        atRiskCompanies.push({
          company_id: cid,
          company_name: company.company_name,
          sales_rep_name: company.sales_rep_id ? repMap[company.sales_rep_id] || null : null,
          risk_score: riskScore,
          risks,
          total_revenue: Math.round(totalRevenue),
          overdue_outstanding: Math.round(overdueOutstanding),
          order_count: revenueOrders.length,
        });
      }
    });

    atRiskCompanies.sort((a, b) => b.risk_score - a.risk_score);

    return NextResponse.json({
      atRiskCompanies,
      summary: {
        total: atRiskCompanies.length,
        high: atRiskCompanies.filter(c => c.risks.some(r => r.severity === 'high')).length,
        medium: atRiskCompanies.filter(c => !c.risks.some(r => r.severity === 'high')).length,
        totalOverdue: atRiskCompanies.reduce((sum, c) => sum + c.overdue_outstanding, 0),
      },
    });

  } catch (err) {
    console.error('At-risk error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}