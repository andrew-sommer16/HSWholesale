'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { exportToCsv } from '@/lib/exportCsv';
import { useCurrentUser } from '@/lib/useCurrentUser';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

const STATUS_STYLES = {
  '0': 'bg-blue-50 text-blue-700', '2': 'bg-yellow-50 text-yellow-700',
  '3': 'bg-orange-50 text-orange-700', '4': 'bg-green-50 text-green-700',
  '5': 'bg-gray-100 text-gray-500', '6': 'bg-gray-100 text-gray-500',
};

const CSV_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'product_name', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'base_price', label: 'Retail Price' },
  { key: 'offered_price', label: 'Quote Price' },
  { key: 'line_total', label: 'Line Total' },
  { key: 'discount_pct', label: 'Discount %', format: v => `${v}%` },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {['60%', '25%', '20%', '30%', '30%', '30%', '20%'].map((w, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-3 bg-gray-100 rounded" style={{ width: w }} />
      </td>
    ))}
  </tr>
);

export default function QuoteDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const storeHash = user.store_hash;
    fetch(`/api/reports/quotes/${id}?store_hash=${storeHash}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, user]);

  if (!loading && !data?.quote) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm">Quote not found</div>
    </div>
  );

  const quote = data?.quote;
  const lineItems = data?.lineItems || [];

  // Calculate retail and discount totals from line items
  const retailTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.base_price || 0) * Number(item.quantity || 0)), 0);
  const quoteTotal = parseFloat(quote?.total_amount || 0);
  const totalDiscount = Math.max(0, retailTotal - quoteTotal);
  const discountPct = retailTotal > 0 ? Math.round((totalDiscount / retailTotal) * 100) : 0;

  // Add discount_pct to line items for CSV export
  const lineItemsWithDiscount = lineItems.map(item => ({
    ...item,
    discount_pct: item.base_price > 0 && item.offered_price < item.base_price
      ? Math.round(((item.base_price - item.offered_price) / item.base_price) * 100)
      : 0,
  }));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/quotes')}
            className="text-gray-400 hover:text-gray-600 text-sm font-medium flex items-center gap-1">← Back</button>
          <div>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-7 bg-gray-200 rounded w-40 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-48" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Quote #{quote.bc_quote_id}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[quote.status] || 'bg-gray-100 text-gray-500'}`}>
                    {quote.status_name}
                  </span>
                  {quote.company_name && <span className="text-xs text-gray-500">{quote.company_name}</span>}
                  {quote.sales_rep_name && <span className="text-xs text-gray-500">Rep: {quote.sales_rep_name}</span>}
                </div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => exportToCsv(`quote-${quote?.bc_quote_id}.csv`, lineItemsWithDiscount, CSV_COLUMNS)}
          disabled={loading}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">
          ⬇ Export CSV
        </button>
      </div>

      {/* Row 1 — dates and age */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Days Old</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{quote.days_old ?? '—'}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Status</p>
              <p className="text-lg font-bold mt-1 text-gray-900">{quote.status_name}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Created</p>
              <p className="text-lg font-bold mt-1 text-gray-900">
                {quote.created_at_bc ? new Date(quote.created_at_bc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Expires</p>
              <p className="text-lg font-bold mt-1 text-gray-900">
                {quote.expires_at ? new Date(quote.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Row 2 — value and discount */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Retail Value</p>
              <p className="text-2xl font-bold mt-1 text-gray-500">{retailTotal > 0 ? fmt(retailTotal) : '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">List price total</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Quote Value</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(quoteTotal)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Negotiated price</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Discount Given</p>
              <p className={`text-2xl font-bold mt-1 ${discountPct >= 20 ? 'text-red-500' : discountPct >= 10 ? 'text-orange-500' : 'text-green-600'}`}>
                {retailTotal > 0 ? fmt(totalDiscount) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Retail minus quote</p>
            </div>
            <div className={`rounded-xl p-5 border shadow-sm ${discountPct >= 20 ? 'bg-red-50 border-red-100' : discountPct >= 10 ? 'bg-orange-50 border-orange-100' : 'bg-green-50 border-green-100'}`}>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avg Discount</p>
              <p className={`text-2xl font-bold mt-1 ${discountPct >= 20 ? 'text-red-600' : discountPct >= 10 ? 'text-orange-600' : 'text-green-600'}`}>
                {retailTotal > 0 ? `-${discountPct}%` : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Across all line items</p>
            </div>
          </>
        )}
      </div>

      {!loading && quote.converted_order_id && (
        <div className="bg-green-50 border border-green-100 rounded-xl px-6 py-4 flex items-center gap-3">
          <span className="text-green-600 text-sm font-medium">✓ Converted to Order</span>
          <a href={`/dashboard/orders/${quote.converted_order_id}`} className="text-green-700 font-mono text-sm hover:underline">
            #{quote.converted_order_id}
          </a>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">
            Line Items {!loading && `(${lineItems.length})`}
          </h2>
        </div>
        {loading ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Product</th>
                <th className="px-6 py-3 text-left">SKU</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right">Retail Price</th>
                <th className="px-6 py-3 text-right">Quote Price</th>
                <th className="px-6 py-3 text-right">Line Total</th>
                <th className="px-6 py-3 text-right">Discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}
            </tbody>
          </table>
        ) : lineItems.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Product</th>
                <th className="px-6 py-3 text-left">SKU</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right">Retail Price</th>
                <th className="px-6 py-3 text-right">Quote Price</th>
                <th className="px-6 py-3 text-right">Line Total</th>
                <th className="px-6 py-3 text-right">Discount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {lineItems.map((item, i) => {
                const discount = item.base_price > 0 && item.offered_price < item.base_price
                  ? Math.round(((item.base_price - item.offered_price) / item.base_price) * 100) : 0;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{item.product_name || '—'}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{item.sku || '—'}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-gray-500">{fmt(item.base_price)}</td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">{fmt(item.offered_price)}</td>
                    <td className="px-6 py-4 text-right font-bold text-gray-900">{fmt(item.line_total)}</td>
                    <td className="px-6 py-4 text-right">
                      {discount > 0 ? (
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${discount >= 20 ? 'bg-red-50 text-red-600' : discount >= 10 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                          -{discount}%
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t border-gray-200">
                <td colSpan={3} className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Totals</td>
                <td className="px-6 py-3 text-right text-sm text-gray-500">{retailTotal > 0 ? fmt(retailTotal) : '—'}</td>
                <td className="px-6 py-3 text-right text-sm font-semibold text-gray-700">{fmt(quoteTotal)}</td>
                <td className="px-6 py-3 text-right font-bold text-gray-900">{fmt(quoteTotal)}</td>
                <td className="px-6 py-3 text-right">
                  {discountPct > 0 ? (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${discountPct >= 20 ? 'bg-red-50 text-red-600' : discountPct >= 10 ? 'bg-orange-50 text-orange-600' : 'bg-green-50 text-green-600'}`}>
                      -{discountPct}%
                    </span>
                  ) : '—'}
                </td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-gray-400 text-sm">No line items — run a sync to load product data</p>
            <p className="text-gray-300 text-xs mt-1">Click Sync Now in the sidebar</p>
          </div>
        )}
      </div>
    </div>
  );
}
export const dynamic = 'force-dynamic';