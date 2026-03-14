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

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash, 'order-line-items');
    const dateFilter = lastSync
      ? `&min_date_modified=${encodeURIComponent(new Date(lastSync).toUTCString())}`
      : '';

    let page = 1;
    let hasMore = true;
    let synced = 0;

    while (hasMore) {
      const { data: orders } = await api.get(
        `/v2/orders?page=${page}&limit=250&sort=date_modified:desc${dateFilter}`
      );

      if (!orders || orders.length === 0) {
        hasMore = false;
        break;
      }

      // Skip Invoice Payment orders
      const realOrders = orders.filter(o => 
        o.status !== 'Invoice Payment' && 
        !o.custom_status?.includes('Invoice Payment')
      );

      const BATCH_SIZE = 10;
      for (let i = 0; i < realOrders.length; i += BATCH_SIZE) {
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

    return NextResponse.json({ success: true, synced, incremental: !!lastSync });

  } catch (err) {
    console.error('Order line items sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}