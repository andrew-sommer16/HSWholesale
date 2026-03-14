import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const baseUrl = process.env.BIGCOMMERCE_APP_URL;

  try {
    // Get all installed stores
    const { data: stores, error } = await supabaseAdmin
      .from('bc_stores')
      .select('store_hash')
      .eq('is_active', true);

    if (error) throw error;

    if (!stores || stores.length === 0) {
      return NextResponse.json({ success: true, message: 'No active stores to sync' });
    }

    // Sync each store
    const results = await Promise.allSettled(
      stores.map(store =>
        fetch(`${baseUrl}/api/sync/all`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_hash: store.store_hash }),
        }).then(r => r.json())
      )
    );

    const summary = results.map((r, i) => ({
      store_hash: stores[i].store_hash,
      status: r.status,
      result: r.value || r.reason?.message,
    }));

    return NextResponse.json({ success: true, stores: stores.length, summary });

  } catch (err) {
    console.error('Cron trigger error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}