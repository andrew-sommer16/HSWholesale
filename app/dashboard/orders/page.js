'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import Pagination from '@/components/Pagination';
import { useFilters, formatDateRange } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { exportToCsv } from '@/lib/exportCsv';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308'];
const STATUS_STYLES = {
  'Awaiting Payment': 'bg-yellow-50 text-yellow-700', 'Awaiting Fulfillment': 'bg-blue-50 text-blue-700',
  'Shipped': 'bg-indigo-50 text-indigo-700', 'Completed': 'bg-green-50 text-green-700',
  'Cancelled': 'bg-gray-100 text-gray-500', 'Refunded': 'bg-red-50 text-red-600',
  'Invoice Payment': 'bg-purple-50 text-purple-700',
};

const ChangeChip = ({ change }) => {
  if (change === undefined || change === null) return null;
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${change > 0 ? 'bg-green-50 text-green-600' : change < 0 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
      {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change)}%
    </span>
  );
};

const StatCard = ({ label, value, sub, accent, change }) => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    <div className="flex items-center justify-between mt-1">
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      <ChangeChip change={change} />
    </div>
  </div>
);

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
    <div className="h-2 bg-gray-100 rounded w-1/3" />
  </div>
);

const SkeletonChart = ({ height = 200 }) => (
  <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-3 bg-gray-200 rounded w-40 mb-6" />
    <div className={`bg-gray-100 rounded`} style={{ height }} />
  </div>
);

const SkeletonRow = ({ cols = 7 }) => (
  <tr className="animate-pulse">
    {[...Array(cols)].map((_, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-3 bg-gray-100 rounded" style={{ width: `${50 + Math.random() * 40}%` }} />
      </td>
    ))}
  </tr>
);

const CSV_COLUMNS = [
  { key: 'bc_order_id', label: 'Order #' },
  { key: 'company_name', label: 'Company' },
  { key: 'custom_status', label: 'Status' },
  { key: 'total_inc_tax', label: 'Total' },
  { key: 'currency_code', label: 'Currency' },
  { key: 'po_number', label: 'PO Number' },
  { key: 'created_at_bc', label: 'Order Date', format: v => v ? new Date(v).toLocaleDateString() : '' },
];

export default function OrdersPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'created_at_bc', dir: 'desc' });
  const [page, setPage] = useState(1);
  const limit = 25;
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(user?.role === 'rep' ? user?.bc_rep_id : null, user?.store_hash);

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => { setPage(1); }, [filters, filter]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/orders?${buildQueryString({ page, limit })}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, page, user]);

  const s = data?.scorecards || {};
  const pagination = data?.pagination || {};
  const allOrders = data?.orders || [];

  const filtered = allOrders
    .filter(o => {
      if (filter === 'revenue') return !o.is_invoice_payment;
      if (filter === 'awaiting') return o.status === 'Awaiting Payment';
      if (filter === 'payments') return o.is_invoice_payment;
      return true;
    })
    .filter(o => o.company_name?.toLowerCase().includes(search.toLowerCase()) || o.bc_order_id?.toString().includes(search) || o.po_number?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      return ((a[sort.key] ?? '') > (b[sort.key] ?? '') ? 1 : -1) * mul;
    });

  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500 mt-1">B2B order history, revenue, and payment status</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(filters)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('orders.csv', filtered, CSV_COLUMNS)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
            ⬇ Export CSV
          </button>
          <button onClick={() => setFilterOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
            <span>⚙️</span><span>Filters</span>
            {activeFilterCount > 0 && <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">{activeFilterCount}</span>}
          </button>
        </div>
      </div>

      <FilterPills filters={filters} filterOptions={filterOptions} onRemove={removeFilter} onReset={resetFilters} />

      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <StatCard label="Total Revenue" value={fmt(s.totalRevenue)} sub="Excl. invoice payments" accent="text-blue-600" change={s.revenueChange} />
            <StatCard label="Total Orders" value={s.totalOrders} sub="B2B orders" accent="text-indigo-600" change={s.ordersChange} />
            <StatCard label="Avg Order Value" value={fmt(s.avgOrderValue)} sub="Per order" accent="text-purple-600" change={s.avgOrderValueChange} />
            <StatCard label="Awaiting Payment" value={s.awaitingPayment} sub="Open balances" accent="text-yellow-600" change={s.awaitingPaymentChange} />
          </>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2"><SkeletonChart height={200} /></div>
          <SkeletonChart height={200} />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Revenue Over Time</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data?.revenueChart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">By Status</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.statusChart || []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <YAxis type="category" dataKey="status" tick={{ fontSize: 10, fill: '#9ca3af' }} width={100} tickFormatter={v => v.length > 14 ? v.slice(0, 14) + '…' : v} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {(data?.statusChart || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonChart height={200} />
      ) : (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Revenue by Company</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data?.companyChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v.length > 14 ? v.slice(0, 14) + '…' : v} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {(data?.companyChart || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest whitespace-nowrap">All Orders</h2>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {[{ key: 'all', label: 'All' }, { key: 'revenue', label: 'Revenue Only' }, { key: 'awaiting', label: 'Awaiting Payment' }, { key: 'payments', label: 'Invoice Payments' }].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)} className={`px-3 py-1.5 transition-colors ${filter === f.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{f.label}</button>
              ))}
            </div>
            <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {[{ key: 'bc_order_id', label: 'Order #' }, { key: 'company_name', label: 'Company' }, { key: 'custom_status', label: 'Status' },
                  { key: 'total_inc_tax', label: 'Total' }, { key: 'currency_code', label: 'Currency' }, { key: 'po_number', label: 'PO Number' },
                  { key: 'created_at_bc', label: 'Order Date' }].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} className="px-6 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(8)].map((_, i) => <SkeletonRow key={i} cols={7} />)
              ) : (
                <>
                  {filtered.map((o, i) => (
                    <tr key={`${o.bc_order_id}-${i}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs">
                        <a href={`/dashboard/orders/${o.bc_order_id}`} className="text-blue-500 hover:text-blue-700 hover:underline">{o.bc_order_id}</a>
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <a href={`/dashboard/companies/${o.company_id}`} className="hover:text-blue-600 hover:underline">{o.company_name}</a>
                      </td>
                      <td className="px-6 py-4"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[o.custom_status] || STATUS_STYLES[o.status] || 'bg-gray-100 text-gray-500'}`}>{o.custom_status || o.status}</span></td>
                      <td className="px-6 py-4 font-medium text-gray-900">{fmt(o.total_inc_tax)}</td>
                      <td className="px-6 py-4 text-gray-500">{o.currency_code || 'USD'}</td>
                      <td className="px-6 py-4 text-gray-500">{o.po_number || '—'}</td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">{o.created_at_bc ? new Date(o.created_at_bc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No orders found</td></tr>}
                </>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page || 1} totalPages={pagination.totalPages || 1}
          total={pagination.total || 0} limit={limit}
          onPageChange={p => { setPage(p); window.scrollTo(0, 0); }} />
      </div>

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} pendingFilters={pendingFilters}
        updatePending={updatePending} applyFilters={applyFilters} resetFilters={resetFilters}
        activeFilterCount={activeFilterCount} pageType="orders" filterOptions={filterOptions} />
    </div>
  );
}
export const dynamic = 'force-dynamic';
