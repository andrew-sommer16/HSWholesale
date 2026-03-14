'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import { useFilters, formatDateRange } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { exportToCsv } from '@/lib/exportCsv';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
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

const SkeletonRepCard = () => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
    <div className="px-6 py-5 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
        <div>
          <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-24" />
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-20" />
    </div>
    <div className="px-6 pb-5 grid grid-cols-5 gap-4 border-t border-gray-50 pt-4">
      {[...Array(5)].map((_, i) => (
        <div key={i}>
          <div className="h-2 bg-gray-100 rounded w-16 mb-2" />
          <div className="h-6 bg-gray-200 rounded w-20" />
        </div>
      ))}
    </div>
  </div>
);

const CSV_COLUMNS = [
  { key: 'name', label: 'Rep Name' },
  { key: 'email', label: 'Email' },
  { key: 'company_count', label: 'Companies' },
  { key: 'total_revenue', label: 'Total Revenue' },
  { key: 'total_orders', label: 'Total Orders' },
  { key: 'avg_order_value', label: 'Avg Order Value' },
  { key: 'total_quotes', label: 'Total Quotes' },
  { key: 'converted_quotes', label: 'Converted Quotes' },
  { key: 'conversion_rate', label: 'Conversion Rate', format: v => `${v}%` },
  { key: 'open_quote_value', label: 'Open Quote Value' },
  { key: 'company_names', label: 'Assigned Companies', format: v => Array.isArray(v) ? v.join('; ') : v },
];

function RepCard({ rep, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
            style={{ backgroundColor: COLORS[index % COLORS.length] }}>
            {rep.name?.charAt(0) || '?'}
          </div>
          <div>
            <p className="font-semibold text-gray-900">{rep.name || 'Unknown'}</p>
            <p className="text-xs text-gray-400">{rep.email}</p>
          </div>
        </div>
        <button onClick={() => setExpanded(e => !e)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
          {expanded ? 'Hide details ↑' : 'Show details ↓'}
        </button>
      </div>
      <div className="px-6 pb-5 grid grid-cols-5 gap-4 border-t border-gray-50 pt-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Revenue</p>
          <p className="text-lg font-bold text-blue-600 mt-0.5">{fmt(rep.total_revenue)}</p>
          <ChangeChip change={rep.revenueChange} />
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Orders</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{rep.total_orders}</p>
          <ChangeChip change={rep.ordersChange} />
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Avg Order</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{fmt(rep.avg_order_value)}</p>
          <ChangeChip change={rep.avgOrderValueChange} />
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Quotes</p>
          <p className="text-lg font-bold text-gray-900 mt-0.5">{rep.total_quotes}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wider">Conversion</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-lg font-bold text-gray-900">{rep.conversion_rate}%</p>
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(rep.conversion_rate, 100)}%` }} />
            </div>
          </div>
          <ChangeChip change={rep.conversionChange} />
        </div>
      </div>
      {expanded && (
        <div className="border-t border-gray-100 px-6 py-5 grid grid-cols-2 gap-6">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Revenue Over Time</p>
            {rep.revenue_chart?.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={rep.revenue_chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 11 }} />
                  <Line type="monotone" dataKey="value" stroke={COLORS[index % COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-gray-400">No revenue data</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assigned Companies ({rep.company_count})</p>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {rep.company_names?.length > 0 ? rep.company_names.map((name, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />{name}
                </div>
              )) : <p className="text-sm text-gray-400">No companies assigned</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SalesRepsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [search, setSearch] = useState('');
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(user?.role === 'rep' ? user?.bc_rep_id : null, user?.store_hash);

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/sales-reps?${buildQueryString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, user]);

  const s = data?.scorecards || {};
  const reps = (data?.reps || []).filter(r =>
    r.name?.toLowerCase().includes(search.toLowerCase()) || r.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Reps</h1>
          <p className="text-gray-500 mt-1">Performance, revenue, and company assignments by rep</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(filters)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('sales-reps.csv', data?.reps || [], CSV_COLUMNS)}
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
            <StatCard label="Total Reps" value={s.totalReps} accent="text-gray-900" />
            <StatCard label="Total Revenue" value={fmt(s.totalRevenue)} sub="Across all reps" accent="text-blue-600" change={s.revenueChange} />
            <StatCard label="Total Orders" value={s.totalOrders} sub="Across all reps" accent="text-indigo-600" change={s.ordersChange} />
            <StatCard label="Quote Conversion" value={`${s.overallConversion}%`} sub="Overall rate" accent="text-purple-600" change={s.conversionChange} />
          </>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-40 mb-6" />
          <div className="h-[200px] bg-gray-100 rounded" />
        </div>
      ) : data?.repChart?.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Revenue by Rep</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.repChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.repChart.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">All Reps</h2>
        <input type="text" placeholder="Search reps..." value={search} onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => <SkeletonRepCard key={i} />)
        ) : (
          <>
            {reps.map((rep, i) => <RepCard key={rep.rep_id} rep={rep} index={i} />)}
            {reps.length === 0 && <div className="bg-white rounded-xl p-12 text-center text-gray-400 border border-gray-100">No sales reps found</div>}
          </>
        )}
      </div>

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} pendingFilters={pendingFilters}
        updatePending={updatePending} applyFilters={applyFilters} resetFilters={resetFilters}
        activeFilterCount={activeFilterCount} pageType="sales-reps" filterOptions={filterOptions} />
    </div>
  );
}
export const dynamic = 'force-dynamic';
