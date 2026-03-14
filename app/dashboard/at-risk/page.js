'use client';
import { useEffect, useState } from 'react';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import { useFilters } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { exportToCsv } from '@/lib/exportCsv';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const RISK_COLORS = {
  inactive: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-100', dot: 'bg-orange-400' },
  overdue: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-100', dot: 'bg-red-500' },
  aging_quotes: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-100', dot: 'bg-yellow-400' },
};

const SEVERITY_BADGE = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-50 text-yellow-700',
};

const CSV_COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'sales_rep_name', label: 'Sales Rep' },
  { key: 'risk_score', label: 'Risk Score' },
  { key: 'total_revenue', label: 'Total Revenue' },
  { key: 'overdue_outstanding', label: 'Overdue Outstanding' },
  { key: 'order_count', label: 'Total Orders' },
  { key: 'risks', label: 'Risk Signals', format: v => Array.isArray(v) ? v.map(r => r.label).join('; ') : '' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
    <div className="h-2 bg-gray-100 rounded w-1/3" />
  </div>
);

const SkeletonRiskCard = () => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse">
    <div className="px-6 py-4 flex items-start gap-4">
      <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0" />
      <div className="flex-1">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/4" />
      </div>
    </div>
    <div className="px-6 pb-4 space-y-2">
      <div className="h-10 bg-gray-100 rounded-lg" />
      <div className="h-10 bg-gray-100 rounded-lg" />
    </div>
    <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex gap-6">
      <div className="h-3 bg-gray-200 rounded w-20" />
      <div className="h-3 bg-gray-200 rounded w-20" />
      <div className="h-3 bg-gray-200 rounded w-16" />
    </div>
  </div>
);

function RiskCard({ company }) {
  const hasHigh = company.risks.some(r => r.severity === 'high');
  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${hasHigh ? 'border-red-200' : 'border-gray-100'}`}>
      <div className="px-6 py-4 flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${hasHigh ? 'bg-red-100 text-red-700' : 'bg-orange-50 text-orange-700'}`}>
            {hasHigh ? '⚠' : '!'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <a href={`/dashboard/companies/${company.company_id}`}
                className="font-semibold text-gray-900 hover:text-blue-600 hover:underline">{company.company_name}</a>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${hasHigh ? SEVERITY_BADGE.high : SEVERITY_BADGE.medium}`}>
                {hasHigh ? 'High Risk' : 'Medium Risk'}
              </span>
            </div>
            {company.sales_rep_name && <p className="text-xs text-gray-400 mt-0.5">Rep: {company.sales_rep_name}</p>}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-400 uppercase tracking-wider">Risk Score</p>
          <p className={`text-xl font-bold ${hasHigh ? 'text-red-600' : 'text-orange-500'}`}>{company.risk_score}</p>
        </div>
      </div>
      <div className="px-6 pb-4 space-y-2">
        {company.risks.map((risk, i) => {
          const colors = RISK_COLORS[risk.type] || RISK_COLORS.inactive;
          return (
            <div key={i} className={`flex items-start gap-3 px-3 py-2 rounded-lg ${colors.bg} border ${colors.border}`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${colors.dot}`} />
              <div>
                <p className={`text-xs font-semibold ${colors.text}`}>{risk.label}</p>
                <p className={`text-xs ${colors.text} opacity-80`}>{risk.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-6">
        <div><p className="text-xs text-gray-400">Total Revenue</p><p className="text-sm font-medium text-gray-700">{fmt(company.total_revenue)}</p></div>
        {company.overdue_outstanding > 0 && (
          <div><p className="text-xs text-gray-400">Overdue</p><p className="text-sm font-medium text-red-600">{fmt(company.overdue_outstanding)}</p></div>
        )}
        <div><p className="text-xs text-gray-400">Orders</p><p className="text-sm font-medium text-gray-700">{company.order_count}</p></div>
        <div className="ml-auto">
          <a href={`/dashboard/companies/${company.company_id}`} className="text-xs font-medium text-blue-500 hover:text-blue-700">View Company →</a>
        </div>
      </div>
    </div>
  );
}

function AtRiskPageInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(user?.role === 'rep' ? user?.bc_rep_id : null, user?.store_hash);

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/at-risk?${buildQueryString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [filters, user]);

  const summary = data?.summary || {};
  const allCompanies = data?.atRiskCompanies || [];

  const filtered = allCompanies
    .filter(c => {
      if (riskFilter === 'high') return c.risks.some(r => r.severity === 'high');
      if (riskFilter === 'inactive') return c.risks.some(r => r.type === 'inactive');
      if (riskFilter === 'overdue') return c.risks.some(r => r.type === 'overdue');
      if (riskFilter === 'aging_quotes') return c.risks.some(r => r.type === 'aging_quotes');
      return true;
    })
    .filter(c => c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.sales_rep_name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">At-Risk Companies</h1>
          <p className="text-gray-500 mt-1">Companies showing signs of churn or payment issues</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => exportToCsv('at-risk-companies.csv', filtered, CSV_COLUMNS)}
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
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">At-Risk Companies</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{summary.total || 0}</p>
            </div>
            <div className="bg-red-50/30 rounded-xl p-5 border border-red-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">High Risk</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{summary.high || 0}</p>
            </div>
            <div className="bg-orange-50/30 rounded-xl p-5 border border-orange-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Medium Risk</p>
              <p className="text-2xl font-bold mt-1 text-orange-500">{summary.medium || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Overdue</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{fmt(summary.totalOverdue)}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          {[
            { key: 'all', label: `All (${allCompanies.length})` },
            { key: 'high', label: `High Risk (${summary.high || 0})` },
            { key: 'overdue', label: 'Overdue Balance' },
            { key: 'inactive', label: 'Inactive' },
            { key: 'aging_quotes', label: 'Aging Quotes' },
          ].map(f => (
            <button key={f.key} onClick={() => setRiskFilter(f.key)}
              className={`px-3 py-2 transition-colors ${riskFilter === f.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {f.label}
            </button>
          ))}
        </div>
        <input type="text" placeholder="Search companies..." value={search} onChange={e => setSearch(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(4)].map((_, i) => <SkeletonRiskCard key={i} />)
        ) : (
          <>
            {filtered.map(company => <RiskCard key={company.company_id} company={company} />)}
            {filtered.length === 0 && (
              <div className="bg-white rounded-xl p-16 text-center border border-gray-100">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-gray-600 font-medium">No at-risk companies found</p>
                <p className="text-gray-400 text-sm mt-1">All companies are looking healthy</p>
              </div>
            )}
          </>
        )}
      </div>

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} pendingFilters={pendingFilters}
        updatePending={updatePending} applyFilters={applyFilters} resetFilters={resetFilters}
        activeFilterCount={activeFilterCount} pageType="at-risk" filterOptions={filterOptions} />
    </div>
  );
}
export const dynamic = 'force-dynamic';

export default function AtRiskPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <AtRiskPageInner />
    </Suspense>
  );
}
