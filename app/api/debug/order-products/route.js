import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');
  const order_id = searchParams.get('order_id');

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = bcAPI(store_hash, accessToken);
    const { data: products } = await api.get(`/v2/orders/${order_id}/products`);
    return NextResponse.json({ order_id, products, count: products?.length || 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message, response: err.response?.data }, { status: 500 });
  }
}