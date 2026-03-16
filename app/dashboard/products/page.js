'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useGlobalFilters } from '@/lib/filterContext';
import { exportToCsv } from '@/lib/exportCsv';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

const CSV_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'product_name', label: 'Product Name' },
  { key: 'brand', label: 'Brand' },
  { key: 'category', label: 'Category' },
  { key: 'total_quantity', label: 'Total Qty Sold' },
  { key: 'total_revenue', label: 'Total Revenue' },
  { key: 'order_count', label: 'Orders' },
  { key: 'avg_order_value', label: 'Avg Order Value' },
  { key: 'last_order_date', label: 'Last Order Date', format: v => v ? new Date(v).toLocaleDateString() : '—' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {['30%', '40%', '25%', '25%', '20%', '25%', '20%', '25%', '30%'].map((w, i) => (
      <td key={i} className="px-6 py-4"><div className="h-3 bg-gray-100 rounded" style={{ width: w }} /></td>
    ))}
  </tr>
);

function ProductsPageInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cfFilterOpen, setCfFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [topX, setTopX] = useState(25);
  const [groupBy, setGroupBy] = useState('sku');
  const [sort, setSort] = useState({ key: 'total_revenue', dir: 'desc' });
  const [customFieldFilters, setCustomFieldFilters] = useState({});
  const { user } = useCurrentUser();
  const { dateFrom, dateTo, dateField } = useGlobalFilters();

  const buildQS = () => {
    const params = new URLSearchParams();
    params.set('store_hash', user.store_hash);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('dateField', dateField);
    params.set('limit', topX);
    params.set('groupBy', groupBy);
    Object.entries(customFieldFilters).forEach(([key, values]) => {
      if (values.length) params.set(`cf_${encodeURIComponent(key)}`, values.join(','));
    });
    return params.toString();
  };

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/products?${buildQS()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, dateFrom, dateTo, dateField, topX, groupBy, customFieldFilters]);

  const s = data?.scorecards || {};
  const allProducts = data?.products || [];
  const customFieldOptions = data?.customFieldOptions || {};
  const activeCfFilters = Object.values(customFieldFilters).flat().length;

  const filtered = allProducts
    .filter(p =>
      p.sku?.toLowerCase().includes(search.toLowerCase()) ||
      p.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.brand?.toLowerCase().includes(search.toLowerCase()) ||
      p.category?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      return (av > bv ? 1 : av < bv ? -1 : 0) * mul;
    });

  const chartData = [...allProducts].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10);

  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const toggleCfFilter = (fieldName, value) => {
    setCustomFieldFilters(prev => {
      const current = prev[fieldName] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [fieldName]: updated };
    });
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Performance</h1>
          <p className="text-gray-500 mt-1">Top SKUs by revenue, quantity, and order frequency</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('product-performance.csv', filtered, CSV_COLUMNS)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
            ⬇ Export CSV
          </button>
          <button onClick={() => setCfFilterOpen(!cfFilterOpen)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${activeCfFilters > 0 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
            <span>🏷️</span><span>Product Fields</span>
            {activeCfFilters > 0 && <span className="px-1.5 py-0.5 bg-white text-blue-600 text-xs rounded-full font-bold">{activeCfFilters}</span>}
          </button>
        </div>
      </div>

      {/* Product custom field filters */}
      {cfFilterOpen && Object.keys(customFieldOptions).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700">Filter by Product Fields</h3>
            <div className="flex items-center gap-3">
              {activeCfFilters > 0 && (
                <button onClick={() => setCustomFieldFilters({})} className="text-xs text-red-500 hover:text-red-700 font-medium">
                  Clear all
                </button>
              )}
              <button onClick={() => setCfFilterOpen(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {Object.entries(customFieldOptions).map(([fieldName, values]) => (
              <div key={fieldName}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{fieldName}</p>
                <div className="space-y-1.5">
                  {values.map(value => {
                    const isChecked = (customFieldFilters[fieldName] || []).includes(value);
                    return (
                      <label key={value} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={isChecked} onChange={() => toggleCfFilter(fieldName, value)}
                          className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className={`text-sm ${isChecked ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>{value}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scorecards */}
      <div className="grid grid-cols-5 gap-4">
        {loading ? [...Array(5)].map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{groupBy === 'sku' ? 'Unique SKUs' : 'Unique Products'}</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{s.totalSkus || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Revenue</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(s.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Units Sold</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600">{(s.totalQuantity || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm col-span-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Top {groupBy === 'sku' ? 'SKU' : 'Product'}</p>
              <p className="text-lg font-bold mt-1 text-gray-900 truncate">{s.topSku || '—'}</p>
              <p className="text-xs text-gray-400 mt-0.5">{fmt(s.topSkuRevenue)} revenue</p>
            </div>
          </>
        )}
      </div>

      {/* Chart */}
      {!loading && chartData.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Top 10 by Revenue</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="sku" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => [fmt(v), 'Revenue']} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Bar dataKey="total_revenue" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest whitespace-nowrap">
              Top {groupBy === 'sku' ? 'SKUs' : 'Products'}
            </h2>
            <select value={topX} onChange={e => setTopX(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value={25}>Top 25</option>
              <option value={50}>Top 50</option>
              <option value={100}>Top 100</option>
              <option value={500}>All</option>
            </select>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              <button onClick={() => setGroupBy('sku')}
                className={`px-3 py-1.5 transition-colors ${groupBy === 'sku' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                By Variant SKU
              </button>
              <button onClick={() => setGroupBy('product')}
                className={`px-3 py-1.5 transition-colors ${groupBy === 'product' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                By Product
              </button>
            </div>
          </div>
          <input type="text" placeholder="Search SKU, product, brand..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {[
                  { key: 'sku', label: groupBy === 'sku' ? 'SKU' : 'Parent SKU' },
                  { key: 'product_name', label: 'Product Name' },
                  { key: 'brand', label: 'Brand' },
                  { key: 'category', label: 'Category' },
                  { key: 'total_quantity', label: 'Qty Sold' },
                  { key: 'total_revenue', label: 'Revenue' },
                  { key: 'order_count', label: 'Orders' },
                  { key: 'avg_order_value', label: 'Avg Order' },
                  { key: 'last_order_date', label: 'Last Order' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className="px-6 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
                {activeCfFilters > 0 && Object.keys(customFieldFilters).filter(k => customFieldFilters[k].length > 0).map(fieldName => (
                  <th key={fieldName} className="px-6 py-3 text-left whitespace-nowrap text-gray-500">{fieldName}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(10)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {filtered.map((p, i) => (
                    <tr key={p.sku + i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {i < 3 && <span className="text-xs font-bold text-gray-400">#{i + 1}</span>}
                          <span className="font-mono text-xs text-gray-700">{p.sku || '—'}</span>
                        </div>
                        {groupBy === 'product' && p.variant_skus?.length > 1 && (
                          <p className="text-xs text-gray-400 mt-0.5">{p.variant_skus.length} variants</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-900 max-w-xs truncate">{p.product_name || '—'}</td>
                      <td className="px-6 py-4 text-gray-600">{p.brand || '—'}</td>
                      <td className="px-6 py-4 text-gray-600">{p.category || '—'}</td>
                      <td className="px-6 py-4 text-gray-700 font-medium">{p.total_quantity.toLocaleString()}</td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fmt(p.total_revenue)}</td>
                      <td className="px-6 py-4 text-gray-600">{p.order_count}</td>
                      <td className="px-6 py-4 text-gray-600">{fmt(p.avg_order_value)}</td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {p.last_order_date ? new Date(p.last_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      {activeCfFilters > 0 && Object.keys(customFieldFilters).filter(k => customFieldFilters[k].length > 0).map(fieldName => (
                        <td key={fieldName} className="px-6 py-4 text-gray-600">{p.custom_fields?.[fieldName] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={9 + activeCfFilters} className="px-6 py-16 text-center text-gray-400">
                      {allProducts.length === 0 ? 'No product data — run a sync to load order line items' : 'No products match your search'}
                    </td></tr>
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

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <ProductsPageInner />
    </Suspense>
  );
}
export const dynamic = 'force-dynamic';