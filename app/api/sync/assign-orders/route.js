import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hardcoded customer_id -> company_id mappings for this store
// These come from the B2B Edition order export CSV
const CUSTOMER_COMPANY_MAP = {
  '5528': '9665966',   // EKL INVESTMENTS, LLC DBA Rudy's
  '31834': '9657546',  // GYTIS SMOKE SHOPPP
};

export async function POST(request) {
  const { store_hash } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = bcAPI(store_hash, accessToken);

    let totalSynced = 0;
    const results = [];

    for (const [customerId, companyId] of Object.entries(CUSTOMER_COMPANY_MAP)) {
      let page = 1;
      let hasMore = true;
      let synced = 0;

      while (hasMore) {
        const { data: orders } = await api.get(
          `/v2/orders?customer_id=${customerId}&page=${page}&limit=250&sort=id:asc`
        );

        if (!orders || orders.length === 0) {
          hasMore = false;
          break;
        }

        const rows = orders.map(o => ({
          store_hash,
          bc_order_id: String(o.id),
          company_id: companyId,
          status: o.status || '',
          custom_status: o.status || '',
          total_inc_tax: parseFloat(o.total_inc_tax || 0),
          currency_code: o.currency_code || 'USD',
          po_number: o.po_number || null,
          created_at_bc: o.date_created ? new Date(o.date_created).toISOString() : null,
          updated_at_bc: o.date_modified ? new Date(o.date_modified).toISOString() : null,
        }));

        const { error } = await supabase
          .from('b2b_orders')
          .upsert(rows, { onConflict: 'store_hash,bc_order_id' });

        if (error) console.error('Upsert error:', error);
        else synced += rows.length;

        hasMore = orders.length === 250;
        page++;
      }

      results.push({ customerId, companyId, synced });
      totalSynced += synced;
    }

    return NextResponse.json({ success: true, totalSynced, results });

  } catch (err) {
    console.error('Assign orders error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}