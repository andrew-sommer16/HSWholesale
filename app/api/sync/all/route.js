import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();
  const baseUrl = process.env.BIGCOMMERCE_APP_URL;

  const { data: logEntry } = await supabaseAdmin
    .from('sync_log')
    .insert({
      store_hash,
      sync_type: 'full',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  // Group 1 — sequential (needed by later syncs)
  const group1 = ['companies', 'customer-groups', 'sales-reps'];

  // Group 2 — parallel
  const group2 = ['orders', 'b2b-orders', 'b2b-invoices', 'quotes', 'net-terms', 'products'];

  // Group 3 — after group 2 (depends on orders and invoices)
  const group3 = ['invoice-payments', 'order-line-items'];

  const results = {};
  let hasError = false;
  const errors = [];

  const syncEndpoint = async (endpoint) => {
    try {
      const res = await fetch(`${baseUrl}/api/sync/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_hash, full_sync }),
      });
      results[endpoint] = await res.json();
      if (!results[endpoint].success) {
        hasError = true;
        errors.push(`${endpoint}: ${results[endpoint].error || 'failed'}`);
      }
    } catch (err) {
      results[endpoint] = { error: err.message };
      hasError = true;
      errors.push(`${endpoint}: ${err.message}`);
    }
  };

  for (const endpoint of group1) {
    await syncEndpoint(endpoint);
  }

  await Promise.all(group2.map(syncEndpoint));
  await Promise.all(group3.map(syncEndpoint));

  if (logEntry?.id) {
    await supabaseAdmin
      .from('sync_log')
      .update({
        status: hasError ? 'partial' : 'success',
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.join('; ') : null,
      })
      .eq('id', logEntry.id);
  }

  return NextResponse.json({ success: true, results, incremental: !full_sync });
}