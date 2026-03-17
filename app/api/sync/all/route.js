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

  // Group 3 — slow syncs, fired in background without awaiting
  // order-line-items makes one API call per order (22k+) and can take 10-30 mins
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

  // Run groups 1 and 2 synchronously — these are fast enough to await
  for (const endpoint of group1) {
    await syncEndpoint(endpoint);
  }
  await Promise.all(group2.map(syncEndpoint));

  // Mark the main sync as complete before group 3 starts
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

  // Fire group 3 in the background without awaiting — these are long-running
  // and have their own 300s maxDuration set in vercel.json
  Promise.all(group3.map(async (endpoint) => {
    try {
      await fetch(`${baseUrl}/api/sync/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_hash, full_sync }),
      });
    } catch (err) {
      console.error(`Background sync failed for ${endpoint}:`, err.message);
    }
  }));

  return NextResponse.json({
    success: true,
    results,
    incremental: !full_sync,
    note: 'order-line-items and invoice-payments are syncing in the background — this may take 10-30 minutes for large stores',
  });
}