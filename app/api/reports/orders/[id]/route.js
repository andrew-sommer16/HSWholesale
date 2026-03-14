import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  try {
    const { data: order } = await supabaseAdmin
      .from('b2b_orders')
      .select('bc_order_id, b2b_order_id, company_id, status, custom_status, total_inc_tax, currency_code, po_number, created_at_bc, updated_at_bc')
      .eq('store_hash', store_hash)
      .eq('bc_order_id', id)
      .single();

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    let companyName = 'Unknown';
    if (order.company_id) {
      const { data: company } = await supabaseAdmin
        .from('companies')
        .select('company_name')
        .eq('store_hash', store_hash)
        .eq('bc_company_id', order.company_id)
        .single();
      if (company) companyName = company.company_name;
    }

    const { data: invoice } = await supabaseAdmin
      .from('b2b_invoices_ip')
      .select('invoice_id, original_balance, open_balance, created_at_b2b')
      .eq('store_hash', store_hash)
      .eq('order_number', id)
      .single();

    let paidAmount = 0;
    let outstandingAmount = parseFloat(order.total_inc_tax) || 0;

    if (invoice) {
      const { data: payments } = await supabaseAdmin
        .from('invoice_payments')
        .select('total_amount')
        .eq('store_hash', store_hash)
        .eq('invoice_id', invoice.invoice_id);

      paidAmount = payments?.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0) || 0;
      outstandingAmount = Math.max(0, (parseFloat(invoice.original_balance) || 0) - paidAmount);
    }

    const { data: relatedQuote } = await supabaseAdmin
      .from('quotes')
      .select('bc_quote_id, status, total_amount')
      .eq('store_hash', store_hash)
      .eq('converted_order_id', id)
      .single();

    return NextResponse.json({
      order: {
        ...order,
        company_name: companyName,
        paid_amount: Math.round(paidAmount * 100) / 100,
        outstanding_amount: Math.round(outstandingAmount * 100) / 100,
        invoice_total: invoice ? parseFloat(invoice.original_balance) || 0 : parseFloat(order.total_inc_tax) || 0,
        pct_paid: parseFloat(order.total_inc_tax) > 0
          ? Math.round((paidAmount / parseFloat(order.total_inc_tax)) * 100)
          : 0,
      },
      relatedQuote: relatedQuote || null,
    });

  } catch (err) {
    console.error('Order detail error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}