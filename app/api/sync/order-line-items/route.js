import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CURSOR_KEY = (store_hash) => `line_items_sync_cursor_${store_hash}`;
const TIME_LIMIT_MS = 45000; // stop after 45s to stay under Vercel's 60s limit

async function getCursor(store_hash) {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('store_hash', store_hash)
    .eq('key', CURSOR_KEY(store_hash))
    .single();
  return data?.value ? JSON.parse(data.value) : null;
}

async function saveCursor(store_hash, cursor) {
  await supabase
    .from('app_settings')
    .upsert({
      store_hash,
      key: CURSOR_KEY(store_hash),
      value: JSON.stringify(cursor),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'store_hash,key' });
}

async function clearCursor(store_hash) {
  await supabase
    .from('app_settings')
    .delete()
    .eq('store_hash', store_hash)
    .eq('key', CURSOR_KEY(store_hash));
}

async function getLastSyncTime(store_hash) {
  const { data } = await supabase
    .from('sync_log')
    .select('completed_at')
    .eq('store_hash', store_hash)
    .eq('sync_type', 'order-line-items')
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  return data?.completed_at || null;
}

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();
  const startTime = Date.now();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = bcAPI(store_hash, accessToken);

    // On full_sync, clear any existing cursor and start from page 1
    if (full_sync) {
      await clearCursor(store_hash);
    }

    // Resume from saved cursor or start fresh
    const cursor = await getCursor(store_hash);
    let page = cursor?.page || 1;
    let synced = cursor?.synced || 0;

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash);
    const dateFilter = lastSync
      ? `&min_date_modified=${encodeURIComponent(new Date(lastSync).toUTCString())}`
      : '';

    let hasMore = true;

    while (hasMore) {
      // Check time — stop before hitting Vercel's 60s limit
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        // Save progress and return — caller should invoke again to continue
        await saveCursor(store_hash, { page, synced });
        return NextResponse.json({
          success: true,
          done: false,
          synced,
          resumePage: page,
          message: `Synced ${synced} line items so far — call again to continue from page ${page}`,
        });
      }

      const { data: orders } = await api.get(
        `/v2/orders?page=${page}&limit=250&sort=id:asc${dateFilter}`
      );

      if (!orders || orders.length === 0) {
        hasMore = false;
        break;
      }

      // Skip Invoice Payment and Incomplete orders
      const realOrders = orders.filter(o =>
        o.status !== 'Invoice Payment' &&
        o.status !== 'Incomplete' &&
        !o.custom_status?.includes('Invoice Payment')
      );

      const BATCH_SIZE = 10;
      for (let i = 0; i < realOrders.length; i += BATCH_SIZE) {
        // Check time inside batch loop too
        if (Date.now() - startTime > TIME_LIMIT_MS) {
          await saveCursor(store_hash, { page, synced });
          return NextResponse.json({
            success: true,
            done: false,
            synced,
            resumePage: page,
            message: `Synced ${synced} line items so far — call again to continue from page ${page}`,
          });
        }

        const batch = realOrders.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (order) => {
          try {
            const { data: products } = await api.get(`/v2/orders/${order.id}/products`);
            if (!products || products.length === 0) return;

            const lineItems = products
              .filter(p => p.name !== 'Invoice Payment')
              .map(p => {
                const qty = parseInt(p.quantity || 0);
                const price = parseFloat(p.price_inc_tax || p.base_price_inc_tax || p.base_price_ex_tax || 0);
                return {
                  store_hash,
                  bc_order_id: String(order.id),
                  product_id: p.product_id ? String(p.product_id) : null,
                  variant_id: p.variant_id ? String(p.variant_id) : null,
                  sku: p.sku || '',
                  product_name: p.name || '',
                  quantity: qty,
                  base_price: price,
                  line_total: Math.round(price * qty * 100) / 100,
                };
              });

            if (lineItems.length === 0) return;

            await supabase
              .from('order_line_items')
              .delete()
              .eq('store_hash', store_hash)
              .eq('bc_order_id', String(order.id));

            const { error } = await supabase
              .from('order_line_items')
              .insert(lineItems);

            if (error) console.error(`Line items insert error for order ${order.id}:`, error);
            else synced += lineItems.length;
          } catch (err) {
            console.error(`Failed to fetch line items for order ${order.id}:`, err.message);
          }
        }));
      }

      hasMore = orders.length === 250;
      page++;
    }

    // All done — clear cursor and log success
    await clearCursor(store_hash);
    await supabase.from('sync_log').insert({
      store_hash,
      sync_type: 'order-line-items',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, done: true, synced });

  } catch (err) {
    console.error('Order line items sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}