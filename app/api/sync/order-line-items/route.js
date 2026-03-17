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

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();
  const startTime = Date.now();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = bcAPI(store_hash, accessToken);

    // On full_sync, clear any existing cursor
    if (full_sync) await clearCursor(store_hash);

    // Get all B2B order IDs (only orders with a company_id)
    const { data: b2bOrders } = await supabase
      .from('b2b_orders')
      .select('bc_order_id')
      .eq('store_hash', store_hash)
      .not('company_id', 'is', null)
      .limit(100000);

    const allOrderIds = b2bOrders?.map(o => o.bc_order_id) || [];

    if (allOrderIds.length === 0) {
      return NextResponse.json({ success: true, done: true, synced: 0, message: 'No B2B orders found' });
    }

    // Resume from cursor or start at index 0
    const cursor = await getCursor(store_hash);
    let startIndex = cursor?.index || 0;
    let synced = cursor?.synced || 0;

    const BATCH_SIZE = 10;

    for (let i = startIndex; i < allOrderIds.length; i += BATCH_SIZE) {
      // Check time limit
      if (Date.now() - startTime > TIME_LIMIT_MS) {
        await saveCursor(store_hash, { index: i, synced });
        return NextResponse.json({
          success: true,
          done: false,
          synced,
          resumeIndex: i,
          total: allOrderIds.length,
          message: `Synced ${synced} line items (${i}/${allOrderIds.length} orders) — call again to continue`,
        });
      }

      const batch = allOrderIds.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (orderId) => {
        try {
          const { data: products } = await api.get(`/v2/orders/${orderId}/products`);
          if (!products || products.length === 0) return;

          const lineItems = products
            .filter(p => p.name !== 'Invoice Payment')
            .map(p => {
              const qty = parseInt(p.quantity || 0);
              const price = parseFloat(p.price_inc_tax || p.base_price_inc_tax || p.base_price_ex_tax || 0);
              return {
                store_hash,
                bc_order_id: String(orderId),
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
            .eq('bc_order_id', String(orderId));

          const { error } = await supabase
            .from('order_line_items')
            .insert(lineItems);

          if (error) console.error(`Line items insert error for order ${orderId}:`, error);
          else synced += lineItems.length;
        } catch (err) {
          console.error(`Failed to fetch line items for order ${orderId}:`, err.message);
        }
      }));
    }

    // All done
    await clearCursor(store_hash);
    await supabase.from('sync_log').insert({
      store_hash,
      sync_type: 'order-line-items',
      status: 'success',
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, done: true, synced, total: allOrderIds.length });

  } catch (err) {
    console.error('Order line items sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}