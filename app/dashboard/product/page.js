'use client';
import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useGlobalFilters } from '@/lib/filterContext';
import { exportToCsv } from '@/lib/exportCsv';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);
const fmtWhole = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const COMPANY_CSV = [
  { key: 'company_name', label: 'Company' },
  { key: 'customer_group_name', label: 'Customer Group' },
  { key: 'order_count', label: 'Orders' },
  { key: 'total_quantity', label: 'Total Qty' },
  { key: 'total_spend', label: 'Total Spend' },
  { key: 'last_order_date', label: 'Last Order', format: v => v ? new Date(v).toLocaleDateString() : '—' },
];

const SKU_CSV = [
  { key: 'sku', label: 'SKU' },
  { key: 'product_name', label: 'Product Name' },
  { key: 'order_count', label: 'Orders' },
  { key: 'total_quantity', label: 'Total Qty' },
  { key: 'total_spend', label: 'Total Spend' },
  { key: 'last_order_date', label: 'Last Order', format: v => v ? new Date(v).toLocaleDateString() : '—' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4" />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {['40%', '25%', '20%', '20%', '25%', '25%'].map((w, i) => (
      <td key={i} className="px-6 py-4"><div className="h-3 bg-gray-100 rounded" style={{ width: w }} /></td>
    ))}
  </tr>
);

function ProductDetailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { buildFilterQS, dateFrom, dateTo, dateField } = useGlobalFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState({ key: 'total_spend', dir: 'desc' });
  const [search, setSearch] = useState('');

  const sku = searchParams.get('sku');
  const product_id = searchParams.get('product_id');
  const mode = searchParams.get('mode') || 'sku';

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    const base = buildFilterQS({ store_hash: user.store_hash });
    const extra = new URLSearchParams();
    extra.set('mode', mode);
    if (sku) extra.set('sku', sku);
    if (product_id) extra.set('product_id', product_id);
    fetch(`/api/reports/product?${base}&${extra.toString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, sku, product_id, mode, dateFrom, dateTo, dateField]);

  const product = data?.product;
  const s = data?.scorecards || {};
  const companies = data?.companies || [];
  const skus = data?.skus || [];

  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const sortRows = (rows) => [...rows]
    .filter(r =>
      !search ||
      r.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.sku?.toLowerCase().includes(search.toLowerCase()) ||
      r.product_name?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      return (av > bv ? 1 : av < bv ? -1 : 0) * mul;
    });

  const sortedCompanies = sortRows(companies);
  const sortedSkus = sortRows(skus);

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}
            className="text-gray-400 hover:text-gray-600 text-sm font-medium flex items-center gap-1">
            ← Back
          </button>
          {loading ? (
            <div className="animate-pulse">
              <div className="h-7 bg-gray-200 rounded w-48 mb-2" />
              <div className="h-4 bg-gray-100 rounded w-64" />
            </div>
          ) : (
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {mode === 'sku' ? product?.sku : product?.product_name}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {mode === 'sku' && product?.product_name && (
                  <span className="text-sm text-gray-500">{product.product_name}</span>
                )}
                {product?.brand && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{product.brand}</span>
                )}
                {product?.category && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{product.category}</span>
                )}
                {mode === 'product' && (
                  <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                    {skus.length} variant{skus.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => exportToCsv(
            `${sku || product_id}-companies.csv`,
            sortedCompanies,
            COMPANY_CSV
          )}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40">
          ⬇ Export CSV
        </button>
      </div>

      {/* Product extra fields */}
      {!loading && Object.keys(product?.custom_fields || {}).length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Product Fields</p>
          <div className="flex flex-wrap gap-6">
            {Object.entries(product.custom_fields).map(([key, value]) => (
              <div key={key}>
                <p className="text-xs text-gray-400">{key}</p>
                <p className="text-sm font-medium text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scorecards */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Companies Ordered</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{s.totalCompanies || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Orders</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600">{s.totalOrders || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Units Sold</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{(s.totalQuantity || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Spend</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{fmtWhole(s.totalSpend)}</p>
            </div>
          </>
        )}
      </div>

      {/* SKU breakdown (product mode only) */}
      {mode === 'product' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">Variant SKU Breakdown</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {[
                    { key: 'sku', label: 'SKU' },
                    { key: 'product_name', label: 'Variant Name' },
                    { key: 'order_count', label: 'Orders' },
                    { key: 'total_quantity', label: 'Units Sold' },
                    { key: 'total_spend', label: 'Total Spend' },
                    { key: 'last_order_date', label: 'Last Order' },
                  ].map(col => (
                    <th key={col.key} onClick={() => handleSort(col.key)}
                      className="px-6 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                      {col.label}<SortIcon col={col.key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [...Array(3)].map((_, i) => <SkeletonRow key={i} />)
                ) : sortedSkus.map(s => (
                  <tr key={s.sku} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono text-xs text-gray-700">{s.sku}</td>
                    <td className="px-6 py-4 text-gray-800">{s.product_name || '—'}</td>
                    <td className="px-6 py-4 text-gray-600">{s.order_count}</td>
                    <td className="px-6 py-4 text-gray-700 font-medium">{s.total_quantity.toLocaleString()}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{fmtWhole(s.total_spend)}</td>
                    <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                      {s.last_order_date ? new Date(s.last_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))}
                {!loading && sortedSkus.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No variants found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Companies table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">
            Companies ({companies.length})
          </h2>
          <input type="text" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {[
                  { key: 'company_name', label: 'Company' },
                  { key: 'customer_group_name', label: 'Customer Group' },
                  { key: 'order_count', label: 'Orders' },
                  { key: 'total_quantity', label: 'Units Bought' },
                  { key: 'total_spend', label: 'Total Spend' },
                  { key: 'last_order_date', label: 'Last Order' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className="px-6 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(5)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {sortedCompanies.map(c => (
                    <tr key={c.company_id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/dashboard/company/${c.company_id}`)}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline text-left">
                          {c.company_name}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{c.customer_group_name || '—'}</td>
                      <td className="px-6 py-4 text-gray-600">{c.order_count}</td>
                      <td className="px-6 py-4 text-gray-700 font-medium">{c.total_quantity.toLocaleString()}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fmtWhole(c.total_spend)}</td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))}
                  {sortedCompanies.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-16 text-center text-gray-400">No companies found</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <ProductDetailInner />
    </Suspense>
  );
}
export const dynamic = 'force-dynamic';