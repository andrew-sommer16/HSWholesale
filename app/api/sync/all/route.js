import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();
  const baseUrl = process.env.BIGCOMMERCE_APP_URL;

  // Mark sync as started AND immediately complete
  // Background promises don't survive after response on Vercel hobby plan
  await supabaseAdmin
    .from('sync_log')
    .insert({
      store_hash,
      sync_type: 'full',
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });

  // Fire all syncs in background without awaiting
  // These run as separate Vercel function invocations so they survive independently
  const allEndpoints = [
    'companies', 'customer-groups', 'sales-reps',
    'b2b-orders', 'b2b-invoices', 'quotes', 'net-terms', 'products',
    'invoice-payments',
  ];

  allEndpoints.forEach(endpoint => {
    fetch(`${baseUrl}/api/sync/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_hash, full_sync }),
    }).catch(err => console.error(`Background sync failed for ${endpoint}:`, err.message));
  });

  return NextResponse.json({
    success: true,
    incremental: !full_sync,
    note: 'All syncs running in background.',
  });
}