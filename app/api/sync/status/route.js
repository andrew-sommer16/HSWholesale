import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  try {
    const { data: lastSync } = await supabaseAdmin
      .from('sync_log')
      .select('*')
      .eq('store_hash', store_hash)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({ lastSync: lastSync || null });
  } catch (err) {
    return NextResponse.json({ lastSync: null });
  }
}