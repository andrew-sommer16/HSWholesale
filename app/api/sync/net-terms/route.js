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

    // Get all companies from Supabase
    const { data: companiesData, error: companiesError } = await supabase
      .from('companies')
      .select('bc_company_id')
      .eq('store_hash', store_hash);

    if (companiesError) {
      console.error('Error fetching companies:', companiesError);
      return NextResponse.json({ error: 'Error fetching companies' }, { status: 500 });
    }

    if (!companiesData || companiesData.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No companies found - sync companies first'
      });
    }

    console.log(`Syncing net terms for ${companiesData.length} companies`);

    for (const company of companiesData) {
      const companyId = company.bc_company_id;
      if (!companyId) continue;

      try {
        const { data } = await api.get(
          `/companies/${companyId}/payment-terms`
        );

        if (data?.data) {
          const terms = data.data;
          const { error } = await supabase
            .from('net_terms')
            .upsert({
              store_hash,
              company_id: companyId,
              terms_days: terms.termsDays || terms.net_days || null,
              credit_limit: parseFloat(terms.creditLimit || 0),
              outstanding_balance: parseFloat(terms.outstandingBalance || 0),
              overdue_balance: parseFloat(terms.overdueBalance || 0),
              status: terms.status || 'active',
              updated_at: new Date().toISOString(),
            }, { onConflict: 'store_hash,company_id' });

          if (error) console.error(`Net terms upsert error for ${companyId}:`, error);
        }
      } catch (companyErr) {
        console.error(`Net terms error for company ${companyId}:`, companyErr.message);
      }
    }

    return NextResponse.json({ success: true, message: 'Net terms synced' });

  } catch (err) {
    console.error('Net terms sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}