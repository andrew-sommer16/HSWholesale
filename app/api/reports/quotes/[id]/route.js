import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  try {
    const { data: quote } = await supabaseAdmin
      .from('quotes')
      .select('bc_quote_id, company_id, status, total_amount, created_at_bc, updated_at_bc, expires_at, converted_order_id, sales_rep_id')
      .eq('store_hash', store_hash)
      .eq('bc_quote_id', id)
      .single();

    if (!quote) return NextResponse.json({ error: 'Quote not found' }, { status: 404 });

    let companyName = 'Unassigned';
    if (quote.company_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('company_name')
        .eq('store_hash', store_hash)
        .eq('bc_company_id', quote.company_id)
        .single();
      if (company) companyName = company.company_name;
    }

    let salesRepName = null;
    if (quote.sales_rep_id) {
      const { data: rep } = await supabaseAdmin
        .from('sales_reps')
        .select('first_name, last_name')
        .eq('store_hash', store_hash)
        .eq('email', quote.sales_rep_id)
        .single();
      if (rep) salesRepName = `${rep.first_name} ${rep.last_name}`.trim();
    }

    const { data: lineItems } = await supabaseAdmin
      .from('quote_line_items')
      .select('*')
      .eq('store_hash', store_hash)
      .eq('bc_quote_id', id);

    const statusName = (s) => {
      const map = { '0': 'New', '2': 'In Process', '3': 'Updated by Customer', '4': 'Ordered', '5': 'Expired', '6': 'Archived', '7': 'Draft' };
      return map[String(s)] || String(s);
    };

    const today = new Date();
    const daysOld = quote.created_at_bc ? Math.floor((today - new Date(quote.created_at_bc)) / 86400000) : null;

    return NextResponse.json({
      quote: {
        ...quote,
        company_name: companyName,
        sales_rep_name: salesRepName,
        status_name: statusName(quote.status),
        days_old: daysOld,
      },
      lineItems: lineItems || [],
    });

  } catch (err) {
    console.error('Quote detail error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
} 