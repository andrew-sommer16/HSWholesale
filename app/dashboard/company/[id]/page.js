'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useGlobalFilters } from '@/lib/filterContext';
import { exportToCsv } from '@/lib/exportCsv';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);
const fmtWhole = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_COLORS = {
  'Completed': 'bg-green-100 text-green-700',
  'Shipped': 'bg-blue-100 text-blue-700',
  'Awaiting Fulfillment': 'bg-yellow-100 text-yellow-700',
  'Awaiting Payment': 'bg-orange-100 text-orange-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Refunded': 'bg-red-100 text-red-600',
  'In Store Order': 'bg-purple-100 text-purple-700',
};

const CSV_COLUMNS = [
  { key: 'bc_order_id', label: 'Order ID' },
  { key: 'custom_status', label: 'Status' },
  { key: 'total_inc_tax', label: 'Total' },
  { key: 'po_number', label: 'PO Number' },
  { key: 'created_at_bc', label: 'Date', format: v => v ? new Date(v).toLocaleDateString() : '—' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4" />
  </div>
);

function CompanyDetailInner() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useCurrentUser();
  const { buildFilterQS, dateFrom, dateTo, dateField } = useGlobalFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'created_at_bc', dir: 'desc' });

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    const qs = buildFilterQS({ store_hash: user.store_hash });
    fetch(`/api/reports/company/${id}?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, user, dateFrom, dateTo, dateField]);

  const company = data?.company;
  const s = data?.scorecards || {};
  const allOrders = data?.orders || [];

  // Get unique statuses for filter tabs
  const statuses = [...new Set(allOrders.map(o => o.custom_status).filter(Boolean))];

  const filtered = allOrders
    .filter(o => statusFilter === 'all' || o.custom_status === statusFilter)
    .filter(o =>
      !search ||
      o.bc_order_id?.includes(search) ||
      o.po_number?.toLowerCase().includes(search.toLowerCase()) ||
      o.custom_status?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      const av = a[sort.key] ?? '';
      const bv = b[sort.key] ?? '';
      if (sort.key === 'total_inc_tax') return (parseFloat(av) - parseFloat(bv)) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });

  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  if (!loading && !company) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400">Company not found</p>
    </div>
  );

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
              <h1 className="text-2xl font-bold text-gray-900">{company.company_name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                {company.customer_group_name && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                    {company.customer_group_name}
                  </span>
                )}
                {company.sales_rep_name && (
                  <span className="text-xs text-gray-500">Rep: {company.sales_rep_name}</span>
                )}
                {company.primary_email && (
                  <span className="text-xs text-gray-500">{company.primary_email}</span>
                )}
                {company.parent_company_name && (
                  <span className="text-xs text-gray-500">↳ {company.parent_company_name}</span>
                )}
              </div>
            </div>
          )}
        </div>
        <button onClick={() => exportToCsv(`${company?.company_name}-orders.csv`, filtered, CSV_COLUMNS)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40">
          ⬇ Export CSV
        </button>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Revenue</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{fmtWhole(s.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Orders</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{s.orderCount || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avg Order Value</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600">{fmtWhole(s.avgOrderValue)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Days Since Last Order</p>
              <p className={`text-2xl font-bold mt-1 ${s.daysSinceLastOrder > 90 ? 'text-red-500' : s.daysSinceLastOrder > 60 ? 'text-orange-500' : 'text-gray-900'}`}>
                {s.daysSinceLastOrder !== null ? `${s.daysSinceLastOrder}d` : '—'}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Extra fields */}
      {!loading && Object.keys(company?.custom_fields || {}).length > 0 && (
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Extra Fields</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(company.custom_fields).map(([key, value]) => (
              <div key={key}>
                <p className="text-xs text-gray-400">{key}</p>
                <p className="text-sm font-medium text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Orders table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest whitespace-nowrap">
              Orders ({allOrders.length})
            </h2>
            {/* Status filter tabs */}
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              <button onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 transition-colors ${statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                All
              </button>
              {statuses.map(s => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 transition-colors ${statusFilter === s ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>
          <input type="text" placeholder="Search order ID, PO..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 w-6" />
                {[
                  { key: 'bc_order_id', label: 'Order ID' },
                  { key: 'custom_status', label: 'Status' },
                  { key: 'total_inc_tax', label: 'Total' },
                  { key: 'po_number', label: 'PO Number' },
                  { key: 'created_at_bc', label: 'Date' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded w-3/4" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                <>
                  {filtered.map(order => (
                    <>
                      <tr key={order.bc_order_id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedOrder(expandedOrder === order.bc_order_id ? null : order.bc_order_id)}>
                        <td className="px-4 py-4 text-gray-400 text-xs">
                          {expandedOrder === order.bc_order_id ? '▾' : '▸'}
                        </td>
                        <td className="px-4 py-4 font-mono text-xs text-gray-600">#{order.bc_order_id}</td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.custom_status] || 'bg-gray-100 text-gray-500'}`}>
                            {order.custom_status || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-medium text-gray-900">{fmtWhole(order.total_inc_tax)}</td>
                        <td className="px-4 py-4 text-gray-500">{order.po_number || '—'}</td>
                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {order.created_at_bc ? new Date(order.created_at_bc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                      {expandedOrder === order.bc_order_id && (
                        <tr key={`${order.bc_order_id}-expanded`}>
                          <td colSpan={6} className="px-6 py-4 bg-gray-50 border-b border-gray-100">
                            {order.line_items.length > 0 ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-gray-400 border-b border-gray-200">
                                    <th className="text-left pb-2 font-semibold">Product</th>
                                    <th className="text-left pb-2 font-semibold">SKU</th>
                                    <th className="text-right pb-2 font-semibold">Qty</th>
                                    <th className="text-right pb-2 font-semibold">Unit Price</th>
                                    <th className="text-right pb-2 font-semibold">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.line_items.map((item, i) => (
                                    <tr key={i} className="border-b border-gray-100 last:border-0">
                                      <td className="py-2 pr-4 text-gray-800 font-medium">{item.product_name || '—'}</td>
                                      <td className="py-2 pr-4 font-mono text-gray-500">{item.sku || '—'}</td>
                                      <td className="py-2 text-right text-gray-600">{item.quantity}</td>
                                      <td className="py-2 text-right text-gray-600">{fmt(item.base_price)}</td>
                                      <td className="py-2 text-right font-semibold text-gray-900">{fmt(item.line_total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t-2 border-gray-200">
                                    <td colSpan={4} className="pt-2 text-right font-semibold text-gray-600">Order Total</td>
                                    <td className="pt-2 text-right font-bold text-gray-900">{fmtWhole(order.total_inc_tax)}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            ) : (
                              <p className="text-gray-400 text-xs py-2">No line item data — run a full sync to load order details</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-16 text-center text-gray-400">No orders found</td></tr>
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

export default function CompanyDetailPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <CompanyDetailInner />
    </Suspense>
  );
}
export const dynamic = 'force-dynamic';