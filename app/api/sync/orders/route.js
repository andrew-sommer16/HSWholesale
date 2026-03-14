import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getLastSyncTime(store_hash, sync_type) {
  const { data } = await supabase
    .from('sync_log')
    .select('completed_at')
    .eq('store_hash', store_hash)
    .eq('sync_type', sync_type)
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  return data?.completed_at || null;
}

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = bcAPI(store_hash, accessToken);

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash, 'orders');
    const dateFilter = lastSync
      ? `&min_date_modified=${encodeURIComponent(new Date(lastSync).toUTCString())}`
      : '';

    let page = 1;
    let hasMore = true;
    let synced = 0;

    while (hasMore) {
      const { data } = await api.get(
        `/v2/orders?page=${page}&limit=250&sort=date_modified:desc${dateFilter}`
      );

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      const orders = data.map(o => ({
        store_hash,
        bc_order_id: String(o.id),
        company_id: o.customer_id ? String(o.customer_id) : null,
        customer_id: String(o.customer_id),
        status: o.status,
        subtotal: parseFloat(o.subtotal_ex_tax),
        total: parseFloat(o.total_inc_tax),
        currency: o.currency_code,
        po_number: o.po_number || null,
        date_created: o.date_created,
        date_modified: o.date_modified,
        date_shipped: o.date_shipped || null,
      }));

      const { error } = await supabase
        .from('orders')
        .upsert(orders, { onConflict: 'store_hash,bc_order_id' });

      if (error) console.error('Orders upsert error:', error);
      else synced += orders.length;

      hasMore = data.length === 250;
      page++;
    }

    return NextResponse.json({ success: true, synced, incremental: !!lastSync });

  } catch (err) {
    console.error('Orders sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}