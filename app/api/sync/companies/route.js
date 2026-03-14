import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { b2bAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getLastSyncTime(store_hash, sync_type) {
  const { data } = await supabase
    .from('sync_log')
    .select('completed_at')
    .eq('store_hash', store_hash)
    .eq('sync_type', sync_type)
    .eq('status', 'success')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  return data?.completed_at || null;
}

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = b2bAPI(store_hash, accessToken);

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash, 'companies');
    const lastSyncUnix = lastSync ? Math.floor(new Date(lastSync).getTime() / 1000) : null;

    let offset = 0;
    const limit = 250;
    let hasMore = true;
    const seen = new Set();
    let synced = 0;

    while (hasMore) {
      const dateParam = lastSyncUnix ? `&updatedAt=${lastSyncUnix}` : '';
      const { data } = await api.get(`/companies?limit=${limit}&offset=${offset}${dateParam}`);

      if (!data?.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      const unique = data.data.filter(c => {
        const key = `${store_hash}:${c.companyId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (unique.length > 0) {
        const companies = unique.map(c => ({
          store_hash,
          bc_company_id: String(c.companyId),
          company_name: c.companyName,
          status: String(c.companyStatus),
          sales_rep_id: c.salesRepId ? String(c.salesRepId) : null,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('companies')
          .upsert(companies, { onConflict: 'store_hash,bc_company_id' });

        if (error) console.error('Companies upsert error:', error);
        else synced += unique.length;
      }

      const totalCount = data?.meta?.pagination?.totalCount || 0;
      offset += limit;
      hasMore = offset < totalCount;
    }

    return NextResponse.json({ success: true, synced, incremental: !!lastSync });

  } catch (err) {
    console.error('Companies sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}