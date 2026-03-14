'use client';
import { useEffect, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import { useFilters, formatDateRange } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { exportToCsv } from '@/lib/exportCsv';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const URGENCY_STYLES = {
  expired: { badge: 'bg-red-100 text-red-700', row: 'bg-red-50/30', label: 'Expired' },
  this_week: { badge: 'bg-orange-50 text-orange-700', row: 'bg-orange-50/20', label: 'This Week' },
  this_month: { badge: 'bg-yellow-50 text-yellow-700', row: '', label: 'This Month' },
  later: { badge: 'bg-gray-100 text-gray-500', row: '', label: 'Later' },
};

const CSV_COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'quote_id', label: 'Quote ID' },
  { key: 'sales_rep_name', label: 'Sales Rep' },
  { key: 'status_name', label: 'Status' },
  { key: 'total_amount', label: 'Value' },
  { key: 'created_at', label: 'Created', format: v => v ? new Date(v).toLocaleDateString() : '' },
  { key: 'expires_at', label: 'Expires', format: v => v ? new Date(v).toLocaleDateString() : '' },
  { key: 'days_until_expiry', label: 'Days Until Expiry' },
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
    {['60%', '30%', '40%', '25%', '35%', '45%', '30%'].map((width, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-3 bg-gray-100 rounded" style={{ width }} />
      </td>
    ))}
  </tr>
);

function QuoteExpiryPageInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'rep'
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(user?.role === 'rep' ? user?.bc_rep_id : null, user?.store_hash);

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/quote-expiry?${buildQueryString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, user]);

  const s = data?.scorecards || {};
  const allQuotes = data?.quotes || [];
  const byRep = data?.byRep || [];

  const filtered = allQuotes
    .filter(q => {
      if (filter === 'expired') return q.urgency === 'expired';
      if (filter === 'this_week') return q.urgency === 'this_week';
      if (filter === 'this_month') return q.urgency === 'this_month';
      return q.urgency !== 'later';
    })
    .filter(q =>
      q.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      q.quote_id?.toString().includes(search) ||
      q.sales_rep_name?.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quote Expiry Alerts</h1>
          <p className="text-gray-500 mt-1">Open quotes expiring soon — take action before losing the deal</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('quote-expiry.csv', filtered, CSV_COLUMNS)}
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
      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <div className="bg-red-50 rounded-xl p-5 border border-red-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Already Expired</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{s.expiredCount || 0}</p>
              <p className="text-xs text-red-500 mt-0.5">Open quotes past expiry</p>
            </div>
            <div className="bg-orange-50/50 rounded-xl p-5 border border-orange-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Expiring This Week</p>
              <p className="text-2xl font-bold mt-1 text-orange-600">{s.thisWeekCount || 0}</p>
              <p className="text-xs text-orange-500 mt-0.5">Within 7 days</p>
            </div>
            <div className="bg-yellow-50/50 rounded-xl p-5 border border-yellow-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Expiring This Month</p>
              <p className="text-2xl font-bold mt-1 text-yellow-600">{s.thisMonthCount || 0}</p>
              <p className="text-xs text-yellow-500 mt-0.5">Within 30 days</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Value at Risk</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{fmt(s.totalValueAtRisk)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Expired + expiring soon</p>
            </div>
          </>
        )}
      </div>

      {/* Alert banner for expired quotes */}
      {!loading && s.expiredCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">🚨</span>
            <div>
              <p className="font-semibold text-red-900 text-sm">
                {s.expiredCount} open quote{s.expiredCount > 1 ? 's have' : ' has'} passed expiry date
              </p>
              <p className="text-xs text-red-700 mt-0.5">These quotes are still open — follow up or close them out</p>
            </div>
          </div>
          <button onClick={() => setFilter('expired')}
            className="text-xs font-medium text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-100 bg-white transition-colors">
            View Expired →
          </button>
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {[
            { key: 'all', label: `All (${allQuotes.filter(q => q.urgency !== 'later').length})` },
            { key: 'expired', label: `Expired (${s.expiredCount || 0})` },
            { key: 'this_week', label: `This Week (${s.thisWeekCount || 0})` },
            { key: 'this_month', label: `This Month (${s.thisMonthCount || 0})` },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-2 transition-colors ${filter === f.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            <button onClick={() => setViewMode('table')}
              className={`px-3 py-2 transition-colors ${viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              📋 Table
            </button>
            <button onClick={() => setViewMode('rep')}
              className={`px-3 py-2 transition-colors ${viewMode === 'rep' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              👤 By Rep
            </button>
          </div>
          <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Company</th>
                <th className="px-6 py-3 text-left">Quote ID</th>
                <th className="px-6 py-3 text-left">Sales Rep</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Value</th>
                <th className="px-6 py-3 text-left">Expires</th>
                <th className="px-6 py-3 text-left">Urgency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(6)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {filtered.map(q => {
                    const style = URGENCY_STYLES[q.urgency] || URGENCY_STYLES.later;
                    return (
                      <tr key={q.quote_id} className={`hover:bg-gray-50 transition-colors ${style.row}`}>
                        <td className="px-6 py-4 font-medium text-gray-900">
                          <a href={`/dashboard/companies/${q.company_id}`} className="hover:text-blue-600 hover:underline">
                            {q.company_name}
                          </a>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs">
                          <a href={`/dashboard/quotes/${q.quote_id}`} className="text-blue-500 hover:text-blue-700 hover:underline">
                            {q.quote_id}
                          </a>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{q.sales_rep_name || '—'}</td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {q.status_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{fmt(q.total_amount)}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {q.expires_at ? new Date(q.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
                            {q.urgency === 'expired'
                              ? `${Math.abs(q.days_until_expiry)}d overdue`
                              : q.urgency === 'this_week' || q.urgency === 'this_month'
                              ? `${q.days_until_expiry}d left`
                              : style.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-16 text-center">
                        <p className="text-2xl mb-2">✅</p>
                        <p className="text-gray-600 font-medium">No quotes matching this filter</p>
                        <p className="text-gray-400 text-sm mt-1">All open quotes are in good shape</p>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* By Rep view */}
      {viewMode === 'rep' && (
        <div className="space-y-4">
          {loading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            ))
          ) : byRep.filter(r =>
              r.quotes.some(q => q.urgency !== 'later') &&
              (r.rep_name.toLowerCase().includes(search.toLowerCase()) ||
               r.quotes.some(q => q.company_name?.toLowerCase().includes(search.toLowerCase())))
            ).map(repGroup => (
            <div key={repGroup.rep_name} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-sm font-bold">
                    {repGroup.rep_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{repGroup.rep_name}</p>
                    <p className="text-xs text-gray-400">{repGroup.quotes.filter(q => q.urgency !== 'later').length} quotes need attention</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  {repGroup.expired_count > 0 && (
                    <span className="px-2 py-1 bg-red-50 text-red-700 rounded-full font-medium">
                      {repGroup.expired_count} expired
                    </span>
                  )}
                  {repGroup.expiring_soon > 0 && (
                    <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded-full font-medium">
                      {repGroup.expiring_soon} expiring soon
                    </span>
                  )}
                  <span className="text-gray-500 font-medium">{fmt(repGroup.total_value)} total</span>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <th className="px-6 py-2 text-left">Company</th>
                    <th className="px-6 py-2 text-left">Quote ID</th>
                    <th className="px-6 py-2 text-left">Value</th>
                    <th className="px-6 py-2 text-left">Expires</th>
                    <th className="px-6 py-2 text-left">Urgency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {repGroup.quotes.filter(q => q.urgency !== 'later').map(q => {
                    const style = URGENCY_STYLES[q.urgency] || URGENCY_STYLES.later;
                    return (
                      <tr key={q.quote_id} className={`hover:bg-gray-50 ${style.row}`}>
                        <td className="px-6 py-3 font-medium text-gray-900">
                          <a href={`/dashboard/companies/${q.company_id}`} className="hover:text-blue-600 hover:underline">
                            {q.company_name}
                          </a>
                        </td>
                        <td className="px-6 py-3 font-mono text-xs">
                          <a href={`/dashboard/quotes/${q.quote_id}`} className="text-blue-500 hover:text-blue-700 hover:underline">
                            {q.quote_id}
                          </a>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-900">{fmt(q.total_amount)}</td>
                        <td className="px-6 py-3 text-gray-600 whitespace-nowrap">
                          {q.expires_at ? new Date(q.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}`}>
                            {q.urgency === 'expired'
                              ? `${Math.abs(q.days_until_expiry)}d overdue`
                              : `${q.days_until_expiry}d left`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {!loading && byRep.filter(r => r.quotes.some(q => q.urgency !== 'later')).length === 0 && (
            <div className="bg-white rounded-xl p-16 text-center border border-gray-100">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-gray-600 font-medium">No expiring quotes</p>
              <p className="text-gray-400 text-sm mt-1">All open quotes are in good shape</p>
            </div>
          )}
        </div>
      )}

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} pendingFilters={pendingFilters}
        updatePending={updatePending} applyFilters={applyFilters} resetFilters={resetFilters}
        activeFilterCount={activeFilterCount} pageType="quotes" filterOptions={filterOptions} />
    </div>
  );
}

export default function QuoteExpiryPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <QuoteExpiryPageInner />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';