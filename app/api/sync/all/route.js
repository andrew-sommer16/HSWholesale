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

  // All syncs run in background — return immediately so we never timeout
  const allEndpoints = [
    'companies', 'customer-groups', 'sales-reps',
    'b2b-orders', 'b2b-invoices', 'quotes', 'net-terms', 'products',
    'invoice-payments',
  ];
  // Note: order-line-items is handled separately by the frontend resumable loop

  // Fire all syncs in background without awaiting
  Promise.all(allEndpoints.map(async (endpoint) => {
    try {
      await fetch(`${baseUrl}/api/sync/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_hash, full_sync }),
      });
    } catch (err) {
      console.error(`Background sync failed for ${endpoint}:`, err.message);
    }
  })).then(async () => {
    // Mark sync as complete once all background syncs finish
    if (logEntry?.id) {
      await supabaseAdmin
        .from('sync_log')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
        })
        .eq('id', logEntry.id);
    }
  }).catch(async (err) => {
    if (logEntry?.id) {
      await supabaseAdmin
        .from('sync_log')
        .update({
          status: 'partial',
          completed_at: new Date().toISOString(),
          error_message: err.message,
        })
        .eq('id', logEntry.id);
    }
  });

  // Return immediately — don't wait for syncs to finish
  return NextResponse.json({
    success: true,
    incremental: !full_sync,
    note: 'All syncs running in background. Check sync status for progress.',
  });
}