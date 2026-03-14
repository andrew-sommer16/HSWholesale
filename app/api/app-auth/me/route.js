import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createClient } from '@supabase/supabase-js';

export async function GET(request) {
  const token = request.cookies.get('sb-token')?.value;

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const supabaseWithToken = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` }
        }
      }
    );

    const { data: { user }, error: authError } = await supabaseWithToken.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { data: appUser, error } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('email', user.email)
      .single();

    if (error || !appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      user: {
        id: appUser.id,
        email: appUser.email,
        role: appUser.role,
        store_hash: appUser.store_hash,
        first_name: appUser.first_name,
        last_name: appUser.last_name,
        bc_rep_id: appUser.bc_rep_id,
      }
    });

  } catch (err) {
    console.error('Me error:', err);
    return NextResponse.json({ error: 'Auth failed' }, { status: 401 });
  }
}