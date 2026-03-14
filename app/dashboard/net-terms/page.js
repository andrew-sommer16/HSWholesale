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
const AGING_COLORS = { '0–30': '#3b82f6', '31–60': '#f97316', '61–90': '#ef4444', '90+': '#7f1d1d' };
const AGING_BADGE = { '0–30': 'bg-blue-50 text-blue-700', '31–60': 'bg-orange-50 text-orange-700', '61–90': 'bg-red-50 text-red-600', '90+': 'bg-red-100 text-red-800', 'Paid': 'bg-green-50 text-green-700' };
const DUE_DATE_BADGE = { overdue: 'bg-red-50 text-red-600', due_soon: 'bg-yellow-50 text-yellow-700', on_track: 'bg-green-50 text-green-700' };
const DUE_DATE_LABEL = { overdue: 'Overdue', due_soon: 'Due Soon', on_track: '' };

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
    <div className="bg-gray-100 rounded" style={{ height }} />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {[...Array(9)].map((_, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-3 bg-gray-100 rounded" style={{ width: `${50 + Math.random() * 40}%` }} />
      </td>
    ))}
  </tr>
);

const CSV_COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'bc_order_id', label: 'Order #' },
  { key: 'created_at', label: 'Invoice Date', format: v => v ? new Date(v).toLocaleDateString() : '' },
  { key: 'due_date', label: 'Due Date', format: v => v ? new Date(v).toLocaleDateString() : '' },
  { key: 'invoice_total', label: 'Invoice Total' },
  { key: 'paid_amount', label: 'Paid Amount' },
  { key: 'outstanding_amount', label: 'Outstanding Amount' },
  { key: 'aging_bucket', label: 'Age' },
  { key: 'pct_paid', label: '% Paid', format: v => `${v}%` },
];

export default function NetTermsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [filter, setFilter] = useState('outstanding');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ key: 'outstanding_amount', dir: 'desc' });
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
    fetch(`/api/reports/net-terms?${buildQueryString({ page, limit })}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, page, user]);

  const s = data?.scorecards || {};
  const pagination = data?.pagination || {};
  const allInvoices = data?.invoices || [];

  const filtered = allInvoices
    .filter(r => {
      if (filter === 'outstanding') return r.outstanding_amount > 0;
      if (filter === 'paid') return r.outstanding_amount === 0;
      if (filter === 'overdue') return r.due_date_status === 'overdue';
      if (filter === 'due_soon') return r.due_date_status === 'due_soon';
      return true;
    })
    .filter(r => r.company_name?.toLowerCase().includes(search.toLowerCase()) || r.bc_order_id?.toString().includes(search))
    .sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      return (a[sort.key] > b[sort.key] ? 1 : -1) * mul;
    });

  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const overdueCount = allInvoices.filter(r => r.due_date_status === 'overdue').length;
  const dueSoonCount = allInvoices.filter(r => r.due_date_status === 'due_soon').length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Net Terms & Payments</h1>
          <p className="text-gray-500 mt-1">Invoice balances, payment status, and aging analysis</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(filters)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('net-terms.csv', filtered, CSV_COLUMNS)}
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
            <StatCard label="Total Outstanding" value={fmt(s.totalOutstanding)} sub="Unpaid balances" accent="text-red-500" change={s.outstandingChange} />
            <StatCard label="Total Invoiced" value={fmt(s.totalInvoiced)} sub="All invoices" accent="text-gray-900" change={s.invoicedChange} />
            <StatCard label="Total Paid" value={fmt(s.totalPaid)} sub="Collected" accent="text-green-600" change={s.paidChange} />
            <StatCard label="% Paid" value={`${s.pctPaid}%`} sub="Collection rate" accent="text-blue-600" />
          </>
        )}
      </div>

      {/* Overdue alert */}
      {!loading && overdueCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold text-red-900 text-sm">
                {overdueCount} overdue invoice{overdueCount > 1 ? 's' : ''}
                {dueSoonCount > 0 && ` · ${dueSoonCount} due within 7 days`}
              </p>
              <p className="text-xs text-red-700 mt-0.5">Past due date with outstanding balance</p>
            </div>
          </div>
          <button onClick={() => setFilter('overdue')}
            className="text-xs font-medium text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 bg-white transition-colors">
            View Overdue →
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-6">
          <SkeletonChart /><SkeletonChart />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Outstanding by Age</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.agingChart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {(data?.agingChart || []).map((entry, i) => <Cell key={i} fill={AGING_COLORS[entry.bucket] || '#3b82f6'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Outstanding by Company</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data?.companyChart || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {(data?.companyChart || []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {loading ? <SkeletonChart /> : (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Outstanding Over Time</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data?.outstandingOverTime || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest whitespace-nowrap">Invoice Detail</h2>
          <div className="flex items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
              {[
                { key: 'outstanding', label: 'Outstanding' },
                { key: 'overdue', label: `Overdue${overdueCount > 0 ? ` (${overdueCount})` : ''}` },
                { key: 'due_soon', label: `Due Soon${dueSoonCount > 0 ? ` (${dueSoonCount})` : ''}` },
                { key: 'paid', label: 'Paid' },
                { key: 'all', label: 'All' },
              ].map(f => (
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
                {[
                  { key: 'company_name', label: 'Company' },
                  { key: 'bc_order_id', label: 'Order #' },
                  { key: 'created_at', label: 'Invoice Date' },
                  { key: 'due_date', label: 'Due Date' },
                  { key: 'invoice_total', label: 'Invoice Total' },
                  { key: 'paid_amount', label: 'Paid' },
                  { key: 'outstanding_amount', label: 'Outstanding' },
                  { key: 'aging_bucket', label: 'Age' },
                  { key: 'pct_paid', label: '% Paid' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)} className="px-6 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {filtered.map((r, i) => (
                    <tr key={`${r.bc_order_id}-${i}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        <a href={`/dashboard/companies/${r.company_id}`} className="hover:text-blue-600 hover:underline">{r.company_name}</a>
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        <a href={`/dashboard/orders/${r.bc_order_id}`} className="text-blue-500 hover:text-blue-700 hover:underline">{r.bc_order_id}</a>
                      </td>
                      <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {r.due_date ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">
                              {new Date(r.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                            {r.due_date_status && r.due_date_status !== 'on_track' && (
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${DUE_DATE_BADGE[r.due_date_status]}`}>
                                {DUE_DATE_LABEL[r.due_date_status]}
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4 text-gray-700">{fmt(r.invoice_total)}</td>
                      <td className="px-6 py-4 text-green-600">{fmt(r.paid_amount)}</td>
                      <td className="px-6 py-4">
                        <span className={r.outstanding_amount > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>{fmt(r.outstanding_amount)}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${AGING_BADGE[r.aging_bucket] || 'bg-gray-100 text-gray-500'}`}>{r.aging_bucket}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(r.pct_paid, 100)}%` }} />
                          </div>
                          <span className="text-gray-600 text-xs">{r.pct_paid}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">No invoices found</td></tr>}
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
        activeFilterCount={activeFilterCount} pageType="net-terms" filterOptions={filterOptions} />
    </div>
  );
}
export const dynamic = 'force-dynamic';
