import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  try {
    const { data: companies } = await supabaseAdmin
      .from('companies')
      .select('bc_company_id, company_name, customer_group_id, customer_group_name')
      .eq('store_hash', store_hash)
      .neq('status', '0')
      .order('company_name');

    const { data: reps } = await supabaseAdmin
      .from('sales_reps')
      .select('bc_rep_id, first_name, last_name')
      .eq('store_hash', store_hash)
      .order('first_name');

    const { data: groups } = await supabaseAdmin
      .from('customer_groups')
      .select('bc_group_id, group_name')
      .eq('store_hash', store_hash)
      .order('group_name');

    return NextResponse.json({
      companies: companies?.map(c => ({
        value: c.bc_company_id,
        label: c.company_name,
        customerGroupId: c.customer_group_id,
      })) || [],
      salesReps: reps?.map(r => ({
        value: r.bc_rep_id,
        label: `${r.first_name} ${r.last_name}`.trim(),
      })) || [],
      customerGroups: groups?.map(g => ({
        value: g.bc_group_id,
        label: g.group_name,
      })) || [],
      quoteStatuses: [
        { value: '0', label: 'New' },
        { value: '2', label: 'In Process' },
        { value: '4', label: 'Ordered' },
        { value: '5', label: 'Expired' },
        { value: '6', label: 'Archived' },
      ],
      orderStatuses: [
        { value: 'Awaiting Payment', label: 'Awaiting Payment' },
        { value: 'Awaiting Fulfillment', label: 'Awaiting Fulfillment' },
        { value: 'Shipped', label: 'Shipped' },
        { value: 'Completed', label: 'Completed' },
        { value: 'Cancelled', label: 'Cancelled' },
      ],
      paymentStatuses: [
        { value: 'outstanding', label: 'Outstanding' },
        { value: 'paid', label: 'Paid' },
      ],
    });

  } catch (err) {
    console.error('Filter options error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}