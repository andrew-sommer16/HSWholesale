import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const scope = searchParams.get('scope');

  try {
    // Exchange code for access token
    const tokenResponse = await fetch('https://login.bigcommerce.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.BIGCOMMERCE_CLIENT_ID,
        client_secret: process.env.BIGCOMMERCE_CLIENT_SECRET,
        code,
        scope,
        grant_type: 'authorization_code',
        redirect_uri: `${process.env.BIGCOMMERCE_APP_URL}/api/auth`,
        context: searchParams.get('context'),
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
    }

    const { access_token, context, user } = tokenData;
    const storeHash = context.split('/')[1];

    // Save store credentials
    const { error: storeError } = await supabase
      .from('bc_stores')
      .upsert({
        store_hash: storeHash,
        access_token,
        scope,
        owner_email: user.email,
        owner_id: user.id,
        installed_at: new Date().toISOString(),
        is_active: true,
      }, { onConflict: 'store_hash' });

    if (storeError) {
      console.error('Store upsert error:', storeError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // Check if admin user already exists for this store
    const { data: existingUser } = await supabase
      .from('app_users')
      .select('id')
      .eq('store_hash', storeHash)
      .eq('email', user.email)
      .single();

    if (!existingUser) {
      // Create Supabase auth account for the store owner
      const tempPassword = Math.random().toString(36).slice(-12) + 'A1!';
      
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: tempPassword,
        email_confirm: true,
      });

      if (authError && authError.message !== 'User already registered') {
        console.error('Auth user creation error:', authError);
      }

      // Create app_users record
      const { error: userError } = await supabase
        .from('app_users')
        .upsert({
          store_hash: storeHash,
          email: user.email,
          first_name: user.username || 'Store',
          last_name: 'Owner',
          role: 'admin',
          is_active: true,
          invited_at: new Date().toISOString(),
        }, { onConflict: 'store_hash,email' });

      if (userError) {
        console.error('App user creation error:', userError);
      }

      // Send password reset email so owner can set their own password
      await supabase.auth.admin.generateLink({
        type: 'recovery',
        email: user.email,
      });
    }

    // Redirect to login page with a message
    return NextResponse.redirect(
      `${process.env.BIGCOMMERCE_APP_URL}/login?installed=true&email=${encodeURIComponent(user.email)}`
    );

  } catch (err) {
    console.error('Auth error:', err);
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}