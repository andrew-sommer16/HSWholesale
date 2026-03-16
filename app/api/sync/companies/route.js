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
        const BATCH_SIZE = 10;
        for (let i = 0; i < unique.length; i += BATCH_SIZE) {
          const batch = unique.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (c) => {
            let customFields = {};
            let parentCompanyId = null;
            let parentCompanyName = null;
            let primaryEmail = c.companyEmail || null;
            let createdAtBc = c.createdAt ? new Date(c.createdAt * 1000).toISOString() : null;
            let customerGroupId = c.bcGroupId ? String(c.bcGroupId) : null;
            let customerGroupName = c.bcGroupName || null;

            try {
              const { data: detail } = await api.get(`/companies/${c.companyId}`);
              const info = detail?.data;

              if (info) {
                // Created at
                if (info.createdAt) createdAtBc = new Date(info.createdAt * 1000).toISOString();

                // Primary email
                primaryEmail = info.companyEmail || info.primaryEmail || primaryEmail;

                // Customer group from detail (more reliable)
                if (info.bcGroupId) customerGroupId = String(info.bcGroupId);
                if (info.bcGroupName) customerGroupName = info.bcGroupName;

                // Parent company
                if (info.parentCompany?.id) {
                  parentCompanyId = String(info.parentCompany.id);
                  parentCompanyName = info.parentCompany.name || null;
                }

                // Extra fields
                const extraFields = info.extraFields || [];
                if (Array.isArray(extraFields)) {
                  extraFields.forEach(f => {
                    const name = f.labelName || f.fieldName || f.name;
                    const value = f.fieldValue !== undefined ? f.fieldValue : f.value;
                    if (name && value !== null && value !== undefined && value !== '') {
                      customFields[name] = String(value);
                    }
                  });
                }
              }
            } catch (e) {
              console.error(`Failed to fetch company detail for ${c.companyId}:`, e.message);
            }

            const { error } = await supabase
              .from('companies')
              .upsert({
                store_hash,
                bc_company_id: String(c.companyId),
                company_name: c.companyName,
                status: String(c.companyStatus),
                sales_rep_id: c.salesRepId ? String(c.salesRepId) : null,
                customer_group_id: customerGroupId,
                customer_group_name: customerGroupName,
                custom_fields: customFields,
                parent_company_id: parentCompanyId,
                parent_company_name: parentCompanyName,
                primary_email: primaryEmail,
                created_at_bc: createdAtBc,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'store_hash,bc_company_id' });

            if (error) console.error('Company upsert error:', error);
            else synced++;
          }));
        }
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