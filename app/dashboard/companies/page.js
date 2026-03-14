'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import Pagination from '@/components/Pagination';
import { useFilters, formatDateRange } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { exportToCsv } from '@/lib/exportCsv';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const pct = (n) => `${n || 0}%`;
const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308'];

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
  { key: 'revenue', label: 'Revenue' },
  { key: 'order_count', label: 'Orders' },
  { key: 'outstanding', label: 'Outstanding' },
  { key: 'open_quote_count', label: 'Open Quotes' },
  { key: 'open_quote_value', label: 'Open Quote Value' },
  { key: 'quotes_created', label: 'Quotes Created' },
  { key: 'converted_quotes', label: 'Converted Quotes' },
  { key: 'quote_conversion', label: 'Conversion %', format: v => `${v}%` },
];

export default function CompaniesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [sort, setSort] = useState({ key: 'revenue', dir: 'desc' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(user?.role === 'rep' ? user?.bc_rep_id : null, user?.store_hash);

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => { setPage(1); }, [filters]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/companies?${buildQueryString({ page, limit })}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, page, user]);

  const companies = data?.companies || [];
  const pagination = data?.pagination || {};
  const s = data?.scorecards || {};

  const filtered = companies
    .filter(c => c.company_name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.is_unassigned) return 1;
      if (b.is_unassigned) return -1;
      const mul = sort.dir === 'asc' ? 1 : -1;
      return (a[sort.key] > b[sort.key] ? 1 : -1) * mul;
    });

  const chartData = [...companies].filter(c => c.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="text-gray-500 mt-1">Revenue, orders, and outstanding balances by company</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(filters)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('companies.csv', companies, CSV_COLUMNS)}
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
            <StatCard label="Total Companies" value={pagination.total || 0} sub="Active accounts" accent="text-gray-900" />
            <StatCard label="Total Revenue" value={fmt(s.totalRevenue)} sub="vs previous period" accent="text-blue-600" change={s.revenueChange} />
            <StatCard label="Open Quote Value" value={fmt(s.totalOpenQuoteValue)} sub="Active pipeline" accent="text-purple-600" change={s.openQuoteValueChange} />
            <StatCard label="Outstanding" value={fmt(s.totalOutstanding)} sub="Unpaid balances" accent="text-red-500" />
          </>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-40 mb-6" />
          <div className="h-[220px] bg-gray-100 rounded" />
        </div>
      ) : chartData.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Revenue by Company (This Page)</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="company_name" tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => v.length > 12 ? v.slice(0, 12) + '…' : v} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">All Companies</h2>
          <input type="text" placeholder="Search this page..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {[
                  { key: 'company_name', label: 'Company' }, { key: 'revenue', label: 'Revenue' },
                  { key: 'order_count', label: 'Orders' }, { key: 'outstanding', label: 'Outstanding' },
                  { key: 'open_quote_count', label: 'Open Quotes' }, { key: 'open_quote_value', label: 'Open Quote Value' },
                  { key: 'quotes_created', label: 'Quotes' }, { key: 'converted_quotes', label: 'Converted' },
                  { key: 'quote_conversion', label: 'Conversion %' },
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
                  {filtered.map((c, i) => (
                    <tr key={c.company_id} className={`hover:bg-gray-50 transition-colors ${c.is_unassigned ? 'bg-gray-50/50 border-t-2 border-gray-200' : ''}`}>
                      <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: c.is_unassigned ? '#d1d5db' : COLORS[i % COLORS.length] }} />
                          {c.is_unassigned ? (
                            <span className="text-gray-400 italic">{c.company_name}</span>
                          ) : (
                            <a href={`/dashboard/companies/${c.company_id}`} className="hover:text-blue-600 hover:underline transition-colors">{c.company_name}</a>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-700 font-medium">{fmt(c.revenue)}</td>
                      <td className="px-6 py-4 text-gray-600">{c.order_count}</td>
                      <td className="px-6 py-4"><span className={c.outstanding > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>{fmt(c.outstanding)}</span></td>
                      <td className="px-6 py-4 text-gray-600">{c.open_quote_count}</td>
                      <td className="px-6 py-4 text-gray-600">{fmt(c.open_quote_value)}</td>
                      <td className="px-6 py-4 text-gray-600">{c.quotes_created}</td>
                      <td className="px-6 py-4 text-gray-600">{c.converted_quotes}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(c.quote_conversion, 100)}%` }} /></div>
                          <span className="text-gray-600 text-xs">{pct(c.quote_conversion)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-400">No companies found</td></tr>}
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
        activeFilterCount={activeFilterCount} pageType="companies" filterOptions={filterOptions} />
    </div>
  );
}
export const dynamic = 'force-dynamic';
