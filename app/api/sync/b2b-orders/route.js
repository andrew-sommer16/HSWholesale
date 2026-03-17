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

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash, 'b2b-orders');
    const lastSyncUnix = lastSync ? Math.floor(new Date(lastSync).getTime() / 1000) : null;

    // Get all companies for this store
    const { data: companies } = await supabase
      .from('companies')
      .select('bc_company_id, company_name')
      .eq('store_hash', store_hash);

    if (!companies || companies.length === 0) {
      return NextResponse.json({ success: true, synced: 0, message: 'No companies found' });
    }

    let totalSynced = 0;
    const seen = new Set();

    // Fetch orders for each company using the company-specific endpoint
    for (const company of companies) {
      let offset = 0;
      const limit = 250;
      let hasMore = true;

      while (hasMore) {
        const dateParam = lastSyncUnix ? `&beginDateAt=${lastSyncUnix}` : '';
        let response;
        try {
          response = await api.get(`/orders?limit=${limit}&offset=${offset}&companyId=${company.bc_company_id}${dateParam}`);
        } catch (err) {
          console.error(`Failed to fetch orders for company ${company.bc_company_id}:`, err.message);
          break;
        }

        const data = response?.data;
        if (!data?.data || data.data.length === 0) {
          hasMore = false;
          break;
        }

        const unique = data.data.filter(o => {
          const key = `${store_hash}:${o.bcOrderId}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (unique.length > 0) {
          const orders = unique.map(o => ({
            store_hash,
            bc_order_id: String(o.bcOrderId),
            b2b_order_id: o.id ? String(o.id) : null,
            company_id: String(company.bc_company_id), // use company ID from our loop
            status: o.status || '',
            custom_status: o.customStatus || o.status || '',
            total_inc_tax: parseFloat(o.totalIncTax || 0),
            currency_code: o.currencyCode || 'USD',
            po_number: o.poNumber || null,
            created_at_bc: o.createdAt ? new Date(o.createdAt * 1000).toISOString() : null,
            updated_at_bc: o.updatedAt ? new Date(o.updatedAt * 1000).toISOString() : null,
          }));

          const { error } = await supabase
            .from('b2b_orders')
            .upsert(orders, { onConflict: 'store_hash,bc_order_id' });

          if (error) console.error('B2B orders upsert error:', error);
          else totalSynced += orders.length;
        }

        const totalCount = data?.meta?.pagination?.totalCount || 0;
        offset += limit;
        hasMore = offset < totalCount;
      }
    }

    return NextResponse.json({ success: true, synced: totalSynced, companies: companies.length, incremental: !!lastSync });

  } catch (err) {
    console.error('B2B orders sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}