'use client';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import FilterPanel from '@/components/FilterPanel';
import FilterPills from '@/components/FilterPills';
import { useFilters, formatDateRange } from '@/lib/useFilters';
import { useCurrentUser } from '@/lib/useCurrentUser';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const KPICard = ({ title, value, subtitle, color = 'blue', change }) => (
  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
    <p className="text-sm text-gray-500 font-medium">{title}</p>
    <p className={`text-2xl font-bold mt-1 text-${color}-600`}>{value}</p>
    <div className="flex items-center justify-between mt-1">
      {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      {change !== undefined && change !== null && (
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${change > 0 ? 'bg-green-50 text-green-600' : change < 0 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
          {change > 0 ? '↑' : change < 0 ? '↓' : '→'} {Math.abs(change)}%
        </span>
      )}
    </div>
  </div>
);

const SkeletonCard = () => (
  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 animate-pulse">
    <div className="h-3 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
    <div className="h-2 bg-gray-100 rounded w-1/3" />
  </div>
);

export default function OverviewPage() {
  const [data, setData] = useState(null);
  const [atRisk, setAtRisk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterOptions, setFilterOptions] = useState({});
  const { user } = useCurrentUser();
  const { filters, pendingFilters, updatePending, applyFilters, resetFilters, removeFilter, activeFilterCount, buildQueryString } = useFilters(user?.role === 'rep' ? user?.bc_rep_id : null, user?.store_hash);

  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/filter-options?store_hash=${user.store_hash}`).then(r => r.json()).then(setFilterOptions);
  }, [user]);

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/overview?${buildQueryString()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`/api/reports/at-risk?${buildQueryString()}`)
      .then(r => r.json())
      .then(d => setAtRisk(d.summary))
      .catch(() => {});
  }, [filters, user]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-gray-500 mt-1">Your B2B store at a glance</p>
          <p className="text-xs text-gray-400 mt-0.5">{formatDateRange(filters)}</p>
        </div>
        <button onClick={() => setFilterOpen(true)} className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors">
          <span>⚙️</span><span>Filters</span>
          {activeFilterCount > 0 && <span className="px-1.5 py-0.5 bg-blue-600 text-white text-xs rounded-full">{activeFilterCount}</span>}
        </button>
      </div>

      <FilterPills filters={filters} filterOptions={filterOptions} onRemove={removeFilter} onReset={resetFilters} />

      <div className="grid grid-cols-4 gap-6 mt-6 mb-8">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <KPICard title="Total B2B Revenue" value={fmt(data?.totalRevenue || 0)}
              subtitle="vs previous period" color="blue" change={data?.revenueChange} />
            <KPICard title="Active Companies" value={data?.activeCompanies || 0}
              subtitle="Current accounts" color="green" />
            <KPICard title="Open Quote Pipeline" value={fmt(data?.pipelineValue || 0)}
              subtitle="vs previous period" color="purple" change={data?.pipelineChange} />
            <KPICard title="Total Outstanding" value={fmt(data?.overdueBalance || 0)}
              subtitle="Unpaid balances" color="red" />
          </>
        )}
      </div>

      {atRisk && atRisk.total > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p.5 flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-lg">⚠️</div>
            <div>
              <p className="font-semibold text-red-900">{atRisk.total} At-Risk {atRisk.total === 1 ? 'Company' : 'Companies'}</p>
              <p className="text-sm text-red-700 mt-0.5">
                {atRisk.high > 0 && `${atRisk.high} high risk · `}
                {atRisk.totalOverdue > 0 && `${fmt(atRisk.totalOverdue)} overdue`}
              </p>
            </div>
          </div>
          <a href="/dashboard/at-risk"
            className="text-sm font-medium text-red-700 border border-red-200 rounded-lg px-4 py-2 hover:bg-red-100 transition-colors bg-white">
            View All →
          </a>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="col-span-2 bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Revenue Over Time</h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data?.revenueChart || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Quote Performance</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Quotes</p>
                <p className="text-2xl font-bold text-gray-900">{loading ? '...' : data?.totalQuotes || 0}</p>
              </div>
              {!loading && data?.quotesChange !== undefined && (
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${data.quotesChange > 0 ? 'bg-green-50 text-green-600' : data.quotesChange < 0 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                  {data.quotesChange > 0 ? '↑' : data.quotesChange < 0 ? '↓' : '→'} {Math.abs(data.quotesChange)}%
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Converted to Orders</p>
              <p className="text-2xl font-bold text-green-600">{loading ? '...' : data?.convertedQuotes || 0}</p>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Conversion Rate</p>
                <p className="text-2xl font-bold text-blue-600">{loading ? '...' : `${data?.conversionRate || 0}%`}</p>
              </div>
              {!loading && data?.conversionChange !== undefined && (
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${data.conversionChange > 0 ? 'bg-green-50 text-green-600' : data.conversionChange < 0 ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                  {data.conversionChange > 0 ? '↑' : data.conversionChange < 0 ? '↓' : '→'} {Math.abs(data.conversionChange)}%
                </span>
              )}
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${data?.conversionRate || 0}%` }} />
            </div>
          </div>
        </div>
      </div>

      <FilterPanel open={filterOpen} onClose={() => setFilterOpen(false)} pendingFilters={pendingFilters}
        updatePending={updatePending} applyFilters={applyFilters} resetFilters={resetFilters}
        activeFilterCount={activeFilterCount} pageType="overview" filterOptions={filterOptions} />
    </div>
  );
}
export const dynamic = 'force-dynamic';