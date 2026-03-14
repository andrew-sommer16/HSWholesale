import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  try {
    const accessToken = await getStoreCredentials(supabaseAdmin, store_hash);
    const api = bcAPI(store_hash, accessToken);

    const { data } = await api.get(`/v2/orders/${id}/products`);

    const lineItems = (data || []).map(p => ({
      product_id: p.product_id,
      variant_id: p.variant_id,
      sku: p.sku,
      product_name: p.name,
      quantity: p.quantity,
      base_price: parseFloat(p.base_price_inc_tax || p.price_inc_tax || 0),
      line_total: parseFloat(p.base_price_inc_tax || 0) * p.quantity,
    }));

    return NextResponse.json({ lineItems });

  } catch (err) {
    console.error('Order line items error:', err);
    return NextResponse.json({ lineItems: [] });
  }
}