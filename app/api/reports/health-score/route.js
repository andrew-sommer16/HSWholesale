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

    // Fetch companies and all their orders in parallel
    let companiesQuery = supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, status, sales_rep_id, created_at')
      .eq('store_hash', store_hash)
      .eq('status', '1'); // active only
    if (companies.length) companiesQuery = companiesQuery.in('bc_company_id', companies);

    let ordersQuery = supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, company_id, total_inc_tax, created_at_bc, custom_status')
      .eq('store_hash', store_hash)
      .neq('custom_status', 'Invoice Payment')
      .not('created_at_bc', 'is', null)
      .order('created_at_bc', { ascending: true });
    if (companies.length) ordersQuery = ordersQuery.in('company_id', companies);

    const [
      { data: companiesList },
      { data: orders },
      { data: repsList },
    ] = await Promise.all([
      companiesQuery,
      ordersQuery,
      supabaseAdmin.from('sales_reps').select('bc_rep_id, first_name, last_name').eq('store_hash', store_hash),
    ]);

    const repMap = {};
    repsList?.forEach(r => { repMap[r.bc_rep_id] = `${r.first_name} ${r.last_name}`.trim(); });

    // Group orders by company
    const ordersByCompany = {};
    orders?.forEach(o => {
      if (!ordersByCompany[o.company_id]) ordersByCompany[o.company_id] = [];
      ordersByCompany[o.company_id].push(o);
    });

    const today = new Date();

    const rows = (companiesList || []).map(company => {
      const companyOrders = ordersByCompany[company.bc_company_id] || [];
      const sortedOrders = companyOrders.sort((a, b) => new Date(a.created_at_bc) - new Date(b.created_at_bc));

      // Account age in days
      const accountAge = company.created_at
        ? Math.floor((today - new Date(company.created_at)) / 86400000)
        : null;

      // First and last order dates
      const firstOrder = sortedOrders.length > 0 ? sortedOrders[0].created_at_bc : null;
      const lastOrder = sortedOrders.length > 0 ? sortedOrders[sortedOrders.length - 1].created_at_bc : null;

      // Days since last order
      const daysSinceLastOrder = lastOrder
        ? Math.floor((today - new Date(lastOrder)) / 86400000)
        : null;

      // Average days between orders
      let avgDaysBetweenOrders = null;
      if (sortedOrders.length >= 2) {
        const gaps = [];
        for (let i = 1; i < sortedOrders.length; i++) {
          const gap = Math.floor(
            (new Date(sortedOrders[i].created_at_bc) - new Date(sortedOrders[i - 1].created_at_bc)) / 86400000
          );
          if (gap > 0) gaps.push(gap);
        }
        if (gaps.length > 0) {
          avgDaysBetweenOrders = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        }
      }

      // Total revenue
      const totalRevenue = companyOrders.reduce((sum, o) => sum + (parseFloat(o.total_inc_tax) || 0), 0);

      // Health score calculation (0-100)
      let score = 0;
      let scoreFactors = [];

      // Order recency (30 pts) — ordered in last 30/60/90 days
      if (daysSinceLastOrder !== null) {
        if (daysSinceLastOrder <= 30) { score += 30; scoreFactors.push({ label: 'Ordered recently', pts: 30 }); }
        else if (daysSinceLastOrder <= 60) { score += 20; scoreFactors.push({ label: 'Ordered within 60 days', pts: 20 }); }
        else if (daysSinceLastOrder <= 90) { score += 10; scoreFactors.push({ label: 'Ordered within 90 days', pts: 10 }); }
        else { scoreFactors.push({ label: 'No recent orders', pts: 0 }); }
      }

      // Order frequency (25 pts) — how regularly they order
      if (avgDaysBetweenOrders !== null) {
        if (avgDaysBetweenOrders <= 30) { score += 25; scoreFactors.push({ label: 'Orders frequently', pts: 25 }); }
        else if (avgDaysBetweenOrders <= 60) { score += 18; scoreFactors.push({ label: 'Orders regularly', pts: 18 }); }
        else if (avgDaysBetweenOrders <= 90) { score += 10; scoreFactors.push({ label: 'Orders occasionally', pts: 10 }); }
        else { score += 5; scoreFactors.push({ label: 'Infrequent orders', pts: 5 }); }
      }

      // Order volume (25 pts) — total number of orders
      if (companyOrders.length >= 20) { score += 25; scoreFactors.push({ label: '20+ orders', pts: 25 }); }
      else if (companyOrders.length >= 10) { score += 18; scoreFactors.push({ label: '10+ orders', pts: 18 }); }
      else if (companyOrders.length >= 5) { score += 12; scoreFactors.push({ label: '5+ orders', pts: 12 }); }
      else if (companyOrders.length >= 1) { score += 6; scoreFactors.push({ label: 'Has ordered', pts: 6 }); }
      else { scoreFactors.push({ label: 'No orders yet', pts: 0 }); }

      // Account longevity (20 pts) — how long they've been a customer
      if (accountAge !== null) {
        if (accountAge >= 365) { score += 20; scoreFactors.push({ label: '1+ year customer', pts: 20 }); }
        else if (accountAge >= 180) { score += 15; scoreFactors.push({ label: '6+ month customer', pts: 15 }); }
        else if (accountAge >= 90) { score += 10; scoreFactors.push({ label: '3+ month customer', pts: 10 }); }
        else { score += 5; scoreFactors.push({ label: 'New customer', pts: 5 }); }
      }

      // Health tier
      let tier, tierColor;
      if (score >= 80) { tier = 'Excellent'; tierColor = 'green'; }
      else if (score >= 60) { tier = 'Good'; tierColor = 'blue'; }
      else if (score >= 40) { tier = 'Fair'; tierColor = 'yellow'; }
      else { tier = 'At Risk'; tierColor = 'red'; }

      return {
        company_id: company.bc_company_id,
        company_name: company.company_name,
        sales_rep_name: company.sales_rep_id ? repMap[company.sales_rep_id] || null : null,
        health_score: score,
        tier,
        tier_color: tierColor,
        account_age_days: accountAge,
        total_orders: companyOrders.length,
        total_revenue: Math.round(totalRevenue),
        first_order_date: firstOrder,
        last_order_date: lastOrder,
        days_since_last_order: daysSinceLastOrder,
        avg_days_between_orders: avgDaysBetweenOrders,
        score_factors: scoreFactors,
      };
    });

    // Sort by health score ascending (worst first)
    rows.sort((a, b) => a.health_score - b.health_score);

    const scorecards = {
      total: rows.length,
      excellent: rows.filter(r => r.tier === 'Excellent').length,
      good: rows.filter(r => r.tier === 'Good').length,
      fair: rows.filter(r => r.tier === 'Fair').length,
      atRisk: rows.filter(r => r.tier === 'At Risk').length,
      avgScore: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.health_score, 0) / rows.length) : 0,
    };

    return NextResponse.json({ scorecards, companies: rows });

  } catch (err) {
    console.error('Health score error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}