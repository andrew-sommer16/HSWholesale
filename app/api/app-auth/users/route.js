import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

async function getSessionUser(request) {
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
    .select('*')
    .eq('email', user.email)
    .single();

  return data;
}

export async function GET(request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const store_hash = searchParams.get('store_hash');

  const { data: users, error } = await supabaseAdmin
    .from('app_users')
    .select('id, email, first_name, last_name, role, bc_rep_id, is_active, invited_at')
    .eq('store_hash', store_hash)
    .order('first_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ users });
}

export async function PATCH(request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { id, role, first_name, last_name, bc_rep_id, is_active } = await request.json();

  const updates = {};
  if (role !== undefined) updates.role = role;
  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (bc_rep_id !== undefined) updates.bc_rep_id = bc_rep_id || null;
  if (is_active !== undefined) updates.is_active = is_active;

  const { error } = await supabaseAdmin
    .from('app_users')
    .update(updates)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}