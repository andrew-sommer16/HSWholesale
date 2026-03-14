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
      const { data } = await api.get(`/ip/payments?limit=${limit}&offset=${offset}`);

      if (!data?.data || data.data.length === 0) {
        hasMore = false;
        break;
      }

      const unique = data.data.filter(p => {
        const key = `${store_hash}:${p.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (unique.length > 0) {
        const payments = [];

        unique.forEach(p => {
          if (p.lineItems?.length > 0) {
            // One record per invoice this payment applies to
            p.lineItems.forEach(line => {
              payments.push({
                store_hash,
                payment_id: `${p.id}-${line.invoiceId}`,
                invoice_id: line.invoiceId ? String(line.invoiceId) : null,
                company_id: p.customerId ? String(p.customerId) : null,
                total_amount: parseFloat(line.amount?.value || 0),
                currency_code: line.amount?.code || 'USD',
                payer_name: p.payerName || null,
                processing_status: p.processingStatus ? String(p.processingStatus) : null,
                applied_status: p.appliedStatus ? String(p.appliedStatus) : null,
                created_at_b2b: p.createdAt ? new Date(p.createdAt * 1000).toISOString() : null,
                updated_at_b2b: p.updatedAt ? new Date(p.updatedAt * 1000).toISOString() : null,
              });
            });
          } else {
            // No line items — use payment total
            payments.push({
              store_hash,
              payment_id: String(p.id),
              invoice_id: null,
              company_id: p.customerId ? String(p.customerId) : null,
              total_amount: parseFloat(p.total?.value || 0),
              currency_code: p.total?.code || 'USD',
              payer_name: p.payerName || null,
              processing_status: p.processingStatus ? String(p.processingStatus) : null,
              applied_status: p.appliedStatus ? String(p.appliedStatus) : null,
              created_at_b2b: p.createdAt ? new Date(p.createdAt * 1000).toISOString() : null,
              updated_at_b2b: p.updatedAt ? new Date(p.updatedAt * 1000).toISOString() : null,
            });
          }
        });

        if (payments.length > 0) {
          const { error } = await supabase
            .from('invoice_payments')
            .upsert(payments, { onConflict: 'store_hash,payment_id' });

          if (error) {
            console.error('Invoice payments upsert error:', error);
          } else {
            synced += payments.length;
          }
        }
      }

      const totalCount = data?.meta?.pagination?.totalCount || 0;
      offset += limit;
      hasMore = offset < totalCount;
    }

    return NextResponse.json({ success: true, message: 'Invoice payments synced', synced });

  } catch (err) {
    console.error('Invoice payments sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}