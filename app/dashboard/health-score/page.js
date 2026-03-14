'use client';
import { useEffect, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import { useFilters } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { exportToCsv } from '@/lib/exportCsv';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const TIER_STYLES = {
  Excellent: { badge: 'bg-green-100 text-green-700', bar: 'bg-green-500', ring: 'border-green-200' },
  Good: { badge: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500', ring: 'border-blue-200' },
  Fair: { badge: 'bg-yellow-100 text-yellow-700', bar: 'bg-yellow-400', ring: 'border-yellow-200' },
  'At Risk': { badge: 'bg-red-100 text-red-700', bar: 'bg-red-500', ring: 'border-red-200' },
};

const CSV_COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'sales_rep_name', label: 'Sales Rep' },
  { key: 'health_score', label: 'Health Score' },
  { key: 'tier', label: 'Tier' },
  { key: 'account_age_days', label: 'Account Age (Days)' },
  { key: 'total_orders', label: 'Total Orders' },
  { key: 'total_revenue', label: 'Total Revenue' },
  { key: 'first_order_date', label: 'First Order', format: v => v ? new Date(v).toLocaleDateString() : '—' },
  { key: 'last_order_date', label: 'Last Order', format: v => v ? new Date(v).toLocaleDateString() : '—' },
  { key: 'days_since_last_order', label: 'Days Since Last Order' },
  { key: 'avg_days_between_orders', label: 'Avg Days Between Orders' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
    <div className="h-2 bg-gray-100 rounded w-1/3" />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {['40%', '20%', '25%', '20%', '20%', '25%', '25%', '20%'].map((w, i) => (
      <td key={i} className="px-6 py-4"><div className="h-3 bg-gray-100 rounded" style={{ width: w }} /></td>
    ))}
  </tr>
);

function HealthScoreBar({ score }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-24 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-bold text-gray-900">{score}</span>
    </div>
  );
}

function HealthScorePageInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'health_score', dir: 'asc' });
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(
    user?.role === 'rep' ? user?.bc_rep_id : null,
    user?.store_hash
  );

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/health-score?${buildQueryString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, user]);

  const s = data?.scorecards || {};
  const allCompanies = data?.companies || [];

  const filtered = allCompanies
    .filter(c => tierFilter === 'all' || c.tier === tierFilter)
    .filter(c =>
      c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.sales_rep_name?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      return (av > bv ? 1 : av < bv ? -1 : 0) * mul;
    });

  const handleSort = (key) => setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Health Score</h1>
          <p className="text-gray-500 mt-1">Account age, order history, and engagement tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('health-scores.csv', filtered, CSV_COLUMNS)}
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

      {/* Scorecards */}
      <div className="grid grid-cols-6 gap-4">
        {loading ? (
          [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Accounts</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{s.total || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avg Score</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{s.avgScore || 0}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-5 border border-green-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Excellent</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{s.excellent || 0}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Good</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{s.good || 0}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Fair</p>
              <p className="text-2xl font-bold mt-1 text-yellow-600">{s.fair || 0}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-5 border border-red-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">At Risk</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{s.atRisk || 0}</p>
            </div>
          </>
        )}
      </div>

      {/* Score explanation */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4">
        <p className="text-xs font-semibold text-blue-800 mb-2">How the score is calculated (0–100):</p>
        <div className="flex gap-6 text-xs text-blue-700">
          <span>📅 Order recency — 30pts</span>
          <span>🔄 Order frequency — 25pts</span>
          <span>📦 Order volume — 25pts</span>
          <span>🏆 Account longevity — 20pts</span>
        </div>
      </div>

      {/* Filters and table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {[
              { key: 'all', label: `All (${allCompanies.length})` },
              { key: 'Excellent', label: `Excellent (${s.excellent || 0})` },
              { key: 'Good', label: `Good (${s.good || 0})` },
              { key: 'Fair', label: `Fair (${s.fair || 0})` },
              { key: 'At Risk', label: `At Risk (${s.atRisk || 0})` },
            ].map(f => (
              <button key={f.key} onClick={() => setTierFilter(f.key)}
                className={`px-3 py-2 transition-colors ${tierFilter === f.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <input type="text" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {[
                  { key: 'company_name', label: 'Company' },
                  { key: 'health_score', label: 'Health Score' },
                  { key: 'tier', label: 'Tier' },
                  { key: 'account_age_days', label: 'Account Age' },
                  { key: 'total_orders', label: 'Total Orders' },
                  { key: 'first_order_date', label: 'First Order' },
                  { key: 'last_order_date', label: 'Last Order' },
                  { key: 'days_since_last_order', label: 'Days Since Order' },
                  { key: 'avg_days_between_orders', label: 'Avg Order Gap' },
                  { key: 'total_revenue', label: 'Total Revenue' },
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
                [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {filtered.map(c => {
                    const style = TIER_STYLES[c.tier] || TIER_STYLES['At Risk'];
                    return (
                      <tr key={c.company_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <a href={`/dashboard/companies/${c.company_id}`} className="hover:text-blue-600 hover:underline">
                            {c.company_name}
                          </a>
                          {c.sales_rep_name && <p className="text-xs text-gray-400 mt-0.5">{c.sales_rep_name}</p>}
                        </td>
                        <td className="px-6 py-4"><HealthScoreBar score={c.health_score} /></td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>{c.tier}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {c.account_age_days !== null ? `${c.account_age_days}d` : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">{c.total_orders}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {c.first_order_date ? new Date(c.first_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {c.days_since_last_order !== null
                            ? <span className={c.days_since_last_order > 90 ? 'text-red-500 font-medium' : c.days_since_last_order > 60 ? 'text-orange-500' : 'text-gray-600'}>
                                {c.days_since_last_order}d
                              </span>
                            : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600">
                          {c.avg_days_between_orders !== null ? `${c.avg_days_between_orders}d` : '—'}
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{fmt(c.total_revenue)}</td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr><td colSpan={10} className="px-6 py-16 text-center text-gray-400">No companies found</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} pendingFilters={pendingFilters}
        updatePending={updatePending} applyFilters={applyFilters} resetFilters={resetFilters}
        activeFilterCount={activeFilterCount} pageType="companies" filterOptions={filterOptions} />
    </div>
  );
}

export default function HealthScorePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <HealthScorePageInner />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';