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

    while (hasMore) {
      const { data } = await api.get(
        `/sales-staffs?limit=${limit}&offset=${offset}`
      );

      if (!data?.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      // Upsert sales reps
      // API returns salesRepName instead of firstName/lastName
      const reps = data.data.map(r => ({
        store_hash,
        bc_rep_id: String(r.id),
        first_name: r.salesRepName?.split(' ')[0] || r.firstName || r.first_name || '',
        last_name: r.salesRepName?.split(' ').slice(1).join(' ') || r.lastName || r.last_name || '',
        email: r.email,
      }));

      const { error } = await supabase
        .from('sales_reps')
        .upsert(reps, { onConflict: 'store_hash,bc_rep_id' });

      if (error) console.error('Sales reps upsert error:', error);

      // Sync company assignments using companies endpoint filtered by rep
      for (const rep of data.data) {
        try {
          const { data: companyData } = await supabase
            .from('companies')
            .select('bc_company_id')
            .eq('store_hash', store_hash)
            .eq('sales_rep_id', String(rep.id));

          if (companyData?.length > 0) {
            const assignments = companyData.map(c => ({
              store_hash,
              rep_id: String(rep.id),
              company_id: c.bc_company_id,
            }));

            await supabase
              .from('rep_company_assignments')
              .upsert(assignments, { onConflict: 'store_hash,rep_id,company_id' });
          }
        } catch (repErr) {
          console.error(`Assignment error for rep ${rep.id}:`, repErr.message);
        }
      }

      const totalCount = data?.meta?.pagination?.totalCount || 0;
      offset += limit;
      hasMore = offset < totalCount;
    }

    return NextResponse.json({ success: true, message: 'Sales reps synced' });

  } catch (err) {
    console.error('Sales reps sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}