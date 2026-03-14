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
  const quoteStatuses = parseList(searchParams.get('quoteStatuses'));
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

    const buildQuotesQuery = (from, to, statuses) => {
      let q = supabaseAdmin
        .from('quotes')
        .select('bc_quote_id, company_id, status, total_amount, created_at_bc, expires_at, converted_order_id')
        .eq('store_hash', store_hash)
        .neq('bc_quote_id', 'undefined');
      if (companies.length) q = q.in('company_id', companies);
      if (from) q = q.gte('created_at_bc', from);
      if (to) q = q.lte('created_at_bc', to + 'T23:59:59');
      if (statuses?.length) q = q.in('status', statuses);
      return q;
    };

    // Fetch quotes and line items in parallel
    const [
      { data: quotes },
      { data: prevQuotes },
      { data: companiesList },
      { data: lineItems },
    ] = await Promise.all([
      buildQuotesQuery(dateFrom, dateTo, quoteStatuses),
      buildQuotesQuery(prevFrom, prevTo, quoteStatuses),
      supabaseAdmin.from('companies').select('bc_company_id, company_name').eq('store_hash', store_hash),
      supabaseAdmin.from('quote_line_items')
        .select('bc_quote_id, base_price, offered_price, quantity')
        .eq('store_hash', store_hash),
    ]);

    const companyMap = {};
    companiesList?.forEach(c => { companyMap[c.bc_company_id] = c.company_name; });

    // Build retail value lookup per quote
    const retailByQuote = {};
    lineItems?.forEach(item => {
      const qty = Number(item.quantity || 0);
      const retail = parseFloat(item.base_price || 0) * qty;
      retailByQuote[item.bc_quote_id] = (retailByQuote[item.bc_quote_id] || 0) + retail;
    });

    const today = new Date();

    const statusName = (s) => {
      const map = { '0': 'New', '2': 'In Process', '3': 'Updated by Customer', '4': 'Ordered', '5': 'Expired', '6': 'Archived', '7': 'Draft' };
      return map[String(s)] || String(s);
    };

    const agingBucket = (days) => {
      if (days <= 30) return '0–30';
      if (days <= 60) return '31–60';
      if (days <= 90) return '61–90';
      return '90+';
    };

    const totalQuotes = quotes?.length || 0;
    const openQuotes = quotes?.filter(q => ['0', '2'].includes(q.status)) || [];
    const convertedQuotes = quotes?.filter(q => q.status === '4') || [];
    const expiredQuotes = quotes?.filter(q => q.status === '5') || [];
    const conversionRate = totalQuotes > 0 ? Math.round((convertedQuotes.length / totalQuotes) * 100) : 0;
    const openQuoteValue = openQuotes.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0);

    // Retail vs quoted value scorecards
    const totalRetailValue = quotes?.reduce((sum, q) => sum + (retailByQuote[q.bc_quote_id] || 0), 0) || 0;
    const totalQuoteValue = quotes?.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0) || 0;
    const avgDiscount = totalRetailValue > 0
      ? Math.round(((totalRetailValue - totalQuoteValue) / totalRetailValue) * 100)
      : 0;
    const totalDiscountAmount = Math.max(0, totalRetailValue - totalQuoteValue);

    const prevTotal = prevQuotes?.length || 0;
    const prevOpen = prevQuotes?.filter(q => ['0', '2'].includes(q.status)) || [];
    const prevConverted = prevQuotes?.filter(q => q.status === '4') || [];
    const prevConversionRate = prevTotal > 0 ? Math.round((prevConverted.length / prevTotal) * 100) : 0;
    const prevOpenQuoteValue = prevOpen.reduce((sum, q) => sum + (parseFloat(q.total_amount) || 0), 0);

    const quotesByMonth = {};
    quotes?.forEach(q => {
      if (!q.created_at_bc) return;
      const date = new Date(q.created_at_bc);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      quotesByMonth[key] = (quotesByMonth[key] || 0) + 1;
    });

    const quotesOverTime = Object.entries(quotesByMonth)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({
        month: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count,
      }));

    const agingCounts = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
    const agingValues = { '0–30': 0, '31–60': 0, '61–90': 0, '90+': 0 };
    openQuotes.forEach(q => {
      if (!q.created_at_bc) return;
      const days = Math.floor((today - new Date(q.created_at_bc)) / 86400000);
      const bucket = agingBucket(days);
      agingCounts[bucket] += 1;
      agingValues[bucket] += parseFloat(q.total_amount) || 0;
    });

    const agingChart = Object.entries(agingCounts).map(([bucket, count]) => ({
      bucket, count, value: Math.round(agingValues[bucket]),
    }));

    const valueByCompany = {};
    quotes?.forEach(q => {
      const name = companyMap[q.company_id] || (q.company_id ? q.company_id : 'Unassigned');
      valueByCompany[name] = (valueByCompany[name] || 0) + (parseFloat(q.total_amount) || 0);
    });

    const companyChart = Object.entries(valueByCompany)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const allRows = quotes?.map(q => {
      const companyName = companyMap[q.company_id] || (q.company_id ? q.company_id : 'Unassigned');
      const createdDate = q.created_at_bc ? new Date(q.created_at_bc) : null;
      const daysOld = createdDate ? Math.floor((today - createdDate) / 86400000) : null;
      const isOpen = ['0', '2'].includes(q.status);
      const quoteValue = parseFloat(q.total_amount) || 0;
      const retailValue = retailByQuote[q.bc_quote_id] || 0;
      const discountPct = retailValue > 0
        ? Math.round(((retailValue - quoteValue) / retailValue) * 100)
        : 0;
      const discountAmount = Math.max(0, retailValue - quoteValue);

      return {
        quote_id: q.bc_quote_id,
        company_name: companyName,
        status: q.status,
        status_name: statusName(q.status),
        total_amount: quoteValue,
        retail_value: Math.round(retailValue * 100) / 100,
        discount_pct: discountPct,
        discount_amount: Math.round(discountAmount * 100) / 100,
        created_at: q.created_at_bc,
        expires_at: q.expires_at,
        converted_order_id: q.converted_order_id,
        days_old: daysOld,
        aging_bucket: isOpen && daysOld !== null ? agingBucket(daysOld) : null,
      };
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) || [];

    const total = allRows.length;
    const totalPages = Math.ceil(total / limit);
    const paginated = allRows.slice((page - 1) * limit, page * limit);

    return NextResponse.json({
      scorecards: {
        totalQuotes,
        openQuotes: openQuotes.length,
        convertedQuotes: convertedQuotes.length,
        expiredQuotes: expiredQuotes.length,
        conversionRate,
        openQuoteValue: Math.round(openQuoteValue),
        totalRetailValue: Math.round(totalRetailValue),
        totalQuoteValue: Math.round(totalQuoteValue),
        avgDiscount,
        totalDiscountAmount: Math.round(totalDiscountAmount),
        totalQuotesChange: pctChange(totalQuotes, prevTotal),
        openQuotesChange: pctChange(openQuotes.length, prevOpen.length),
        conversionChange: pctChange(conversionRate, prevConversionRate),
        openQuoteValueChange: pctChange(openQuoteValue, prevOpenQuoteValue),
      },
      quotesOverTime,
      agingChart,
      companyChart,
      quotes: paginated,
      pagination: { page, limit, total, totalPages },
    });

  } catch (err) {
    console.error('Quotes report error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}