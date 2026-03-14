import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { b2bAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  const { store_hash } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = b2bAPI(store_hash, accessToken);

    let offset = 0;
    const limit = 250;
    let hasMore = true;
    const seen = new Set();
    let synced = 0;

    while (hasMore) {
      const { data } = await api.get(`/ip/invoices?limit=${limit}&offset=${offset}`);

      if (!data?.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      const unique = data.data.filter(inv => {
        const key = `${store_hash}:${inv.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (unique.length > 0) {
        const invoices = unique.map(inv => ({
          store_hash,
          invoice_id: String(inv.id),
          order_number: inv.orderNumber ? String(inv.orderNumber) : null,
          company_id: inv.customerId ? String(inv.customerId) : null,
          original_balance: parseFloat(inv.originalBalance?.value || 0),
          open_balance: parseFloat(inv.openBalance?.value || 0),
          created_at_b2b: inv.createdAt ? new Date(inv.createdAt * 1000).toISOString() : null,
          updated_at_b2b: inv.updatedAt ? new Date(inv.updatedAt * 1000).toISOString() : null,
          due_date: inv.dueDate ? new Date(inv.dueDate * 1000).toISOString() : null,
          status: inv.status ? String(inv.status) : null,
        }));

        const { error } = await supabase
          .from('b2b_invoices_ip')
          .upsert(invoices, { onConflict: 'store_hash,invoice_id' });

        if (error) console.error('B2B invoices upsert error:', error);
        else synced += invoices.length;
      }

      const totalCount = data?.meta?.pagination?.totalCount || 0;
      offset += limit;
      hasMore = offset < totalCount;
    }

    return NextResponse.json({ success: true, message: 'B2B invoices synced', synced });

  } catch (err) {
    console.error('B2B invoices sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}