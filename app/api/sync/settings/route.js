import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

async function getSessionStoreHash(request) {
  const token = request.cookies.get('sb-token')?.value;
  if (!token) return null;

  const supabaseWithToken = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error } = await supabaseWithToken.auth.getUser();
  if (error || !user) return null;

  const { data } = await supabaseAdmin
    .from('app_users')
    .select('store_hash')
    .eq('email', user.email)
    .single();

  return data?.store_hash || null;
}

export async function GET(request) {
  try {
    const store_hash = await getSessionStoreHash(request);
    if (!store_hash) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('key, value')
      .eq('store_hash', store_hash)
      .in('key', ['sync_interval_hours', 'scheduled_sync_enabled']);

    const settings = {};
    data?.forEach(row => { settings[row.key] = row.value; });

    return NextResponse.json({
      sync_interval_hours: settings.sync_interval_hours || '4',
      scheduled_sync_enabled: settings.scheduled_sync_enabled !== 'false',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const store_hash = await getSessionStoreHash(request);
    if (!store_hash) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const updates = [];

    if (body.sync_interval_hours !== undefined) {
      updates.push({ store_hash, key: 'sync_interval_hours', value: String(body.sync_interval_hours), updated_at: new Date().toISOString() });
    }
    if (body.scheduled_sync_enabled !== undefined) {
      updates.push({ store_hash, key: 'scheduled_sync_enabled', value: String(body.scheduled_sync_enabled), updated_at: new Date().toISOString() });
    }

    for (const update of updates) {
      await supabaseAdmin
        .from('app_settings')
        .upsert(update, { onConflict: 'store_hash,key' });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}