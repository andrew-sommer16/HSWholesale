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

export async function POST(request) {
  const sessionUser = await getSessionUser(request);
  if (!sessionUser || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw listError;

    const authUser = users.find(u => u.email === email);
    if (!authUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, { password });
    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Password updated' });

  } catch (err) {
    console.error('Set password error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}