import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const signedPayload = searchParams.get('signed_payload_jwt');

  try {
    const parts = signedPayload.split('.');
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf8')
    );

    const storeHash = payload.sub.split('/')[1];

    // Mark store as uninstalled in Supabase
    const { error } = await supabase
      .from('bc_stores')
      .update({ uninstalled_at: new Date().toISOString() })
      .eq('store_hash', storeHash);

    if (error) console.error('Uninstall error:', error);

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error('Uninstall error:', err);
    return NextResponse.json({ error: 'Uninstall failed' }, { status: 500 });
  }
}