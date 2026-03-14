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

    // Fetch open quotes with expiry dates
    let quotesQuery = supabaseAdmin
      .from('quotes')
      .select('bc_quote_id, company_id, status, total_amount, created_at_bc, expires_at')
      .eq('store_hash', store_hash)
      .in('status', ['0', '2'])
      .not('expires_at', 'is', null)
      .neq('bc_quote_id', 'undefined')
      .not('company_id', 'is', null);
    if (companies.length) quotesQuery = quotesQuery.in('company_id', companies);
    const { data: quotes } = await quotesQuery;

    const { data: companiesList } = await supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, sales_rep_id')
      .eq('store_hash', store_hash);

    const { data: repsList } = await supabaseAdmin
      .from('sales_reps')
      .select('bc_rep_id, first_name, last_name')
      .eq('store_hash', store_hash);

    const companyMap = {};
    companiesList?.forEach(c => { companyMap[c.bc_company_id] = c; });

    const repMap = {};
    repsList?.forEach(r => { repMap[r.bc_rep_id] = `${r.first_name} ${r.last_name}`.trim(); });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const statusName = (s) => {
      const map = { '0': 'New', '2': 'In Process' };
      return map[String(s)] || String(s);
    };

    const rows = quotes?.map(q => {
      const expiresAt = new Date(q.expires_at);
      const daysUntilExpiry = Math.floor((expiresAt - today) / 86400000);
      const company = companyMap[q.company_id];
      const salesRepName = company?.sales_rep_id ? repMap[company.sales_rep_id] || null : null;

      let urgency;
      if (daysUntilExpiry < 0) urgency = 'expired';
      else if (daysUntilExpiry <= 7) urgency = 'this_week';
      else if (daysUntilExpiry <= 30) urgency = 'this_month';
      else urgency = 'later';

      return {
        quote_id: q.bc_quote_id,
        company_id: q.company_id,
        company_name: company?.company_name || 'Unknown',
        sales_rep_name: salesRepName,
        sales_rep_id: company?.sales_rep_id || null,
        status: q.status,
        status_name: statusName(q.status),
        total_amount: parseFloat(q.total_amount) || 0,
        created_at: q.created_at_bc,
        expires_at: q.expires_at,
        days_until_expiry: daysUntilExpiry,
        urgency,
      };
    }) || [];

    rows.sort((a, b) => a.days_until_expiry - b.days_until_expiry);

    const expired = rows.filter(r => r.urgency === 'expired');
    const thisWeek = rows.filter(r => r.urgency === 'this_week');
    const thisMonth = rows.filter(r => r.urgency === 'this_month');

    const totalValueAtRisk = [...expired, ...thisWeek, ...thisMonth]
      .reduce((sum, r) => sum + r.total_amount, 0);

    const byRep = {};
    rows.forEach(r => {
      const key = r.sales_rep_name || 'Unassigned';
      if (!byRep[key]) byRep[key] = [];
      byRep[key].push(r);
    });

    const byRepArray = Object.entries(byRep)
      .map(([rep, quotes]) => ({
        rep_name: rep,
        quotes,
        expiring_soon: quotes.filter(q => q.urgency === 'this_week' || q.urgency === 'this_month').length,
        expired_count: quotes.filter(q => q.urgency === 'expired').length,
        total_value: quotes.reduce((sum, q) => sum + q.total_amount, 0),
      }))
      .sort((a, b) => b.expired_count - a.expired_count || b.expiring_soon - a.expiring_soon);

    return NextResponse.json({
      scorecards: {
        expiredCount: expired.length,
        thisWeekCount: thisWeek.length,
        thisMonthCount: thisMonth.length,
        totalValueAtRisk: Math.round(totalValueAtRisk),
      },
      quotes: rows,
      byRep: byRepArray,
    });

  } catch (err) {
    console.error('Quote expiry error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}