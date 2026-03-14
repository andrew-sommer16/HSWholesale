import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { b2bAPI, getStoreCredentials } from '@/lib/bigcommerce';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const toISO = (val) => {
  if (!val) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 0) return new Date(num * 1000).toISOString();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

const extractCompanyId = (q) => {
  if (q.companyId && /^\d+$/.test(String(q.companyId))) return String(q.companyId);
  if (q.company && typeof q.company === 'object') {
    if (q.company.companyId) return String(q.company.companyId);
    if (q.company.id) return String(q.company.id);
  }
  return null;
};

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

const BATCH_SIZE = 10;

export async function POST(request) {
  const { store_hash, full_sync } = await request.json();

  try {
    const accessToken = await getStoreCredentials(supabase, store_hash);
    const api = b2bAPI(store_hash, accessToken);

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash, 'quotes');
    const lastSyncUnix = lastSync ? Math.floor(new Date(lastSync).getTime() / 1000) : null;

    let offset = 0;
    const limit = 250;
    const seen = new Set();
    const allQuotes = [];

    while (true) {
      const dateParam = lastSyncUnix ? `&updatedAt=${lastSyncUnix}` : '';
      const { data } = await api.get(`/rfq?limit=${limit}&offset=${offset}${dateParam}`);
      if (!data?.data || data.data.length === 0) break;

      data.data.forEach(q => {
        const key = `${store_hash}:${q.quoteId}`;
        if (!seen.has(key)) { seen.add(key); allQuotes.push(q); }
      });

      const totalCount = data?.meta?.pagination?.totalCount || 0;
      offset += limit;
      if (offset >= totalCount) break;
    }

    const quotes = [];
    const lineItems = [];

    for (let i = 0; i < allQuotes.length; i += BATCH_SIZE) {
      const batch = allQuotes.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (q) => {
        if (!q.quoteId) return;

        let companyId = extractCompanyId(q);

        try {
          const { data: detail } = await api.get(`/rfq/${q.quoteId}`);
          const info = detail?.data?.companyInfo;
          if (info?.companyId) companyId = String(info.companyId);

          const items = detail?.data?.productList || detail?.data?.products || [];
          items.forEach(item => {
            const qty = Number(item.quantity || 0) || 0;
            const offeredPrice = parseFloat(item.offeredPrice || item.basePrice || 0) || 0;
            lineItems.push({
              store_hash,
              bc_quote_id: String(q.quoteId),
              product_id: item.productId ? String(item.productId) : null,
              variant_id: item.variantId ? String(item.variantId) : null,
              sku: item.sku || '',
              product_name: item.productName || item.name || '',
              quantity: qty,
              base_price: parseFloat(item.basePrice || 0) || 0,
              offered_price: offeredPrice,
              line_total: offeredPrice * qty,
            });
          });
        } catch (e) {
          console.error(`Failed to fetch detail for quote ${q.quoteId}:`, e.message);
        }

        if (!companyId) {
          console.warn(`Skipping quote ${q.quoteId} — no company ID found`);
          return;
        }

        quotes.push({
          store_hash,
          bc_quote_id: String(q.quoteId),
          company_id: companyId,
          sales_rep_id: q.salesRepEmail || null,
          status: String(q.status),
          total_amount: parseFloat(q.subtotal || 0),
          converted_order_id: q.orderId ? String(q.orderId) : null,
          created_at_bc: toISO(q.createdAt),
          updated_at_bc: toISO(q.updatedAt),
          expires_at: toISO(q.expiredAt),
        });
      }));

      console.log(`Quotes progress: ${Math.min(i + BATCH_SIZE, allQuotes.length)}/${allQuotes.length}`);
    }

    if (quotes.length > 0) {
      const { error } = await supabase
        .from('quotes')
        .upsert(quotes, { onConflict: 'store_hash,bc_quote_id' });
      if (error) console.error('Quotes upsert error:', error);
    }

    if (lineItems.length > 0) {
      if (lastSync) {
        // Incremental — only delete line items for quotes we're updating
        const quoteIds = quotes.map(q => q.bc_quote_id);
        if (quoteIds.length > 0) {
          await supabase.from('quote_line_items')
            .delete()
            .eq('store_hash', store_hash)
            .in('bc_quote_id', quoteIds);
        }
      } else {
        // Full sync — delete all line items for this store
        await supabase.from('quote_line_items').delete().eq('store_hash', store_hash);
      }
      const { error } = await supabase.from('quote_line_items').insert(lineItems);
      if (error) console.error('Quote line items insert error:', error);
    }

    return NextResponse.json({ success: true, quotes: quotes.length, lineItems: lineItems.length, incremental: !!lastSync });

  } catch (err) {
    console.error('Quotes sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}