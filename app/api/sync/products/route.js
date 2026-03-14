import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { bcAPI, getStoreCredentials } from '@/lib/bigcommerce';

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
    const api = bcAPI(store_hash, accessToken);

    const lastSync = full_sync ? null : await getLastSyncTime(store_hash, 'products');
    const dateFilter = lastSync
      ? `&date_modified:min=${encodeURIComponent(new Date(lastSync).toISOString())}`
      : '';

    let page = 1;
    let hasMore = true;
    let synced = 0;

    // Fetch categories and brands for lookup
    const [{ data: categoriesData }, { data: brandsData }] = await Promise.all([
      api.get('/v2/categories?limit=250'),
      api.get('/v2/brands?limit=250'),
    ]);

    const categoryMap = {};
    (categoriesData || []).forEach(c => { categoryMap[c.id] = c.name; });

    const brandMap = {};
    (brandsData || []).forEach(b => { brandMap[b.id] = b.name; });

    while (hasMore) {
      const { data: products } = await api.get(
        `/v3/catalog/products?page=${page}&limit=250&include=custom_fields${dateFilter}`
      );

      if (!products?.data || products.data.length === 0) {
        hasMore = false;
        break;
      }

      const rows = products.data.map(p => {
        // Get primary category name
        const primaryCategoryId = p.categories?.[0];
        const category = primaryCategoryId ? categoryMap[primaryCategoryId] || null : null;
        const brand = p.brand_id ? brandMap[p.brand_id] || null : null;

        // Store custom fields as JSON object
        const customFields = {};
        (p.custom_fields || []).forEach(cf => {
          customFields[cf.name] = cf.value;
        });

        return {
          store_hash,
          bc_product_id: String(p.id),
          name: p.name || '',
          sku: p.sku || '',
          brand,
          category,
          price: parseFloat(p.price || 0),
          custom_fields: customFields,
          updated_at: new Date().toISOString(),
        };
      });

      if (rows.length > 0) {
        const { error } = await supabase
          .from('products')
          .upsert(rows, { onConflict: 'store_hash,bc_product_id' });

        if (error) console.error('Products upsert error:', error);
        else synced += rows.length;
      }

      hasMore = products.data.length === 250;
      page++;
    }

    return NextResponse.json({ success: true, synced, incremental: !!lastSync });

  } catch (err) {
    console.error('Products sync error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}