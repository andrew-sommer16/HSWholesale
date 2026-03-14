import { NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAuth } from '@/lib/supabase';

export async function POST(request) {
  const { email, password } = await request.json();

  try {
    // Use anon key client for signInWithPassword
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      console.log('Auth error full:', JSON.stringify(authError, null, 2));
      console.log('Auth error status:', authError?.status);
      console.log('Auth error code:', authError?.code);
      console.log('Auth error message:', authError?.message);
      console.log('Auth data:', JSON.stringify(authData, null, 2));
      return NextResponse.json({ error: authError.message }, { status: 401 });
    }

    // Use admin client for DB operations
    const { data: appUser, error: userError } = await supabaseAdmin
      .from('app_users')
      .select('*')
      .eq('email', email)
      .single();

    if (userError || !appUser) {
      return NextResponse.json({ error: 'User not found in app' }, { status: 404 });
    }

    if (!appUser.is_active) {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 });
    }

    await supabaseAdmin
      .from('app_users')
      .update({ last_login: new Date().toISOString() })
      .eq('email', email);

    const response = NextResponse.json({
      success: true,
      user: {
        id: appUser.id,
        email: appUser.email,
        role: appUser.role,
        store_hash: appUser.store_hash,
        first_name: appUser.first_name,
        last_name: appUser.last_name,
        bc_rep_id: appUser.bc_rep_id,
      },
      access_token: authData.session.access_token,
    });

    response.cookies.set('sb-token', authData.session.access_token, {
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;

  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}