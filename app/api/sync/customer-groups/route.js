import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const { store_hash } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = bcAPI(store_hash, accessToken);

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data } = await api.get(`/v2/customer_groups?page=${page}&limit=250`);

      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      const groups = data.map(g => ({
        store_hash,
        bc_group_id: String(g.id),
        group_name: g.name,
        is_default: g.is_default || false,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('customer_groups')
        .upsert(groups, { onConflict: 'store_hash,bc_group_id' });

      if (error) console.error('Customer groups upsert error:', error);

      hasMore = data.length === 250;
      page++;
    }

    return NextResponse.json({ success: true, message: 'Customer groups synced' });

  } catch (err) {
    console.error('Customer groups sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}