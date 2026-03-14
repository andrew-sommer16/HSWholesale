import { NextResponse } from 'next/server';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STORE_HASH = process.env.BIGCOMMERCE_STORE_HASH;;

// Webhook scopes we care about
const WEBHOOK_SCOPES = [
  { scope: 'store/order/created', description: 'Order created' },
  { scope: 'store/order/statusUpdated', description: 'Order status changed' },
  { scope: 'store/order/archived', description: 'Order archived' },
];

// GET — list registered webhooks
export async function GET() {
  try {
    const accessToken = await getStoreCredentials(supabase, STORE_HASH);
    const api = bcAPI(STORE_HASH, accessToken);
    const { data } = await api.get('/v3/hooks');
    return NextResponse.json({ webhooks: data?.data || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST — register all webhooks
export async function POST(request) {
  try {
    const { app_url } = await request.json();
    if (!app_url) return NextResponse.json({ error: 'app_url required' }, { status: 400 });

    const accessToken = await getStoreCredentials(supabase, STORE_HASH);
    const api = bcAPI(STORE_HASH, accessToken);

    const destination = `${app_url}/api/webhooks/bigcommerce`;
    const results = [];

    for (const webhook of WEBHOOK_SCOPES) {
      try {
        const { data } = await api.post('/v3/hooks', {
          scope: webhook.scope,
          destination,
          is_active: true,
          headers: {},
        });
        results.push({ scope: webhook.scope, success: true, id: data?.data?.id });
      } catch (err) {
        results.push({ scope: webhook.scope, success: false, error: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — remove all webhooks pointing to our app
export async function DELETE(request) {
  try {
    const { app_url } = await request.json();
    const accessToken = await getStoreCredentials(supabase, STORE_HASH);
    const api = bcAPI(STORE_HASH, accessToken);

    const { data } = await api.get('/v3/hooks');
    const ours = (data?.data || []).filter(h =>
      !app_url || h.destination?.includes(app_url)
    );

    const results = [];
    for (const hook of ours) {
      try {
        await api.delete(`/v3/hooks/${hook.id}`);
        results.push({ id: hook.id, deleted: true });
      } catch (err) {
        results.push({ id: hook.id, deleted: false, error: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}