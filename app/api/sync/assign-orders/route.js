import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { b2bAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// One-time migration: assigns all historical customer orders to their B2B companies
// This updates B2B Edition itself so future syncs will pick up the companyId
export async function POST(request) {
  const { store_hash } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const b2bApi = b2bAPI(store_hash, accessToken);

    // Get all companies
    const { data: companies } = await supabase
      .from('companies')
      .select('bc_company_id, company_name')
      .eq('store_hash', store_hash);

    const results = [];

    for (const company of companies) {
      // Get all users for this company
      let usersOffset = 0;
      const bcCustomerIds = [];

      while (true) {
        const { data: usersResp } = await b2bApi.get(
          `/users?companyId=${company.bc_company_id}&limit=250&offset=${usersOffset}`
        );

        const users = usersResp?.data || [];
        if (users.length === 0) break;

        users.forEach(u => {
          if (u.bcId) bcCustomerIds.push(String(u.bcId));
        });

        const total = usersResp?.meta?.pagination?.totalCount || 0;
        usersOffset += 250;
        if (usersOffset >= total) break;
      }

      if (bcCustomerIds.length === 0) {
        results.push({ company: company.company_name, status: 'no users found' });
        continue;
      }

      // Call the "Assign Customer Orders to Company" endpoint for each customer
      let assigned = 0;
      for (const customerId of bcCustomerIds) {
        try {
          await b2bApi.post('/orders', {
            customerId,
            companyId: String(company.bc_company_id),
          });
          assigned++;
        } catch (err) {
          console.error(`Failed for customer ${customerId}:`, err.response?.data || err.message);
        }
      }

      results.push({
        company: company.company_name,
        companyId: company.bc_company_id,
        customers: bcCustomerIds,
        assigned,
      });
    }

    return NextResponse.json({ success: true, results });

  } catch (err) {
    console.error('Assign orders error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}