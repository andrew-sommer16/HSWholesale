import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  const { email, password } = await request.json();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: `Missing env vars: url=${!!url} key=${!!key}` }, { status: 500 });
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return NextResponse.json({ error: error.message }, { status: 401 });

    return NextResponse.json({ success: true, token: data.session.access_token });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}