import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(request) {
  const { email, role, first_name, last_name, store_hash, bc_rep_id } = await request.json();

  try {
    // Create auth user in Supabase
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // Create app_users record
    const { error: userError } = await supabaseAdmin
      .from('app_users')
      .insert({
        email,
        role,
        first_name: first_name || '',
        last_name: last_name || '',
        store_hash,
        bc_rep_id: bc_rep_id || null,
        is_active: true,
        invited_at: new Date().toISOString(),
      });

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: `Invite sent to ${email}` });

  } catch (err) {
    console.error('Invite error:', err);
    return NextResponse.json({ error: 'Invite failed' }, { status: 500 });
  }
}