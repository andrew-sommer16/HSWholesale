'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useGlobalFilters } from '@/lib/filterContext';
import { exportToCsv } from '@/lib/exportCsv';
import Pagination from '@/components/Pagination';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const TIER_STYLES = {
  Excellent: 'bg-green-100 text-green-700',
  Good: 'bg-blue-100 text-blue-700',
  Fair: 'bg-yellow-100 text-yellow-700',
  'At Risk': 'bg-red-100 text-red-700',
};

const CSV_COLUMNS = [
  { key: 'company_name', label: 'Company' },
  { key: 'primary_email', label: 'Primary Email' },
  { key: 'parent_company_name', label: 'Parent Company' },
  { key: 'customer_group_name', label: 'Customer Group' },
  { key: 'health_score', label: 'Health Score' },
  { key: 'tier', label: 'Tier' },
  { key: 'account_age_days', label: 'Account Age (Days)' },
  { key: 'total_orders', label: 'Total Orders' },
  { key: 'total_revenue', label: 'Total Revenue' },
  { key: 'avg_order_value', label: 'Avg Order Value' },
  { key: 'first_order_date', label: 'First Order', format: v => v ? new Date(v).toLocaleDateString() : '—' },
  { key: 'last_order_date', label: 'Last Order', format: v => v ? new Date(v).toLocaleDateString() : '—' },
  { key: 'days_since_last_order', label: 'Days Since Last Order' },
  { key: 'avg_days_between_orders', label: 'Avg Days Between Orders' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4" />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {['35%', '25%', '20%', '20%', '15%', '20%', '20%', '20%', '15%', '20%'].map((w, i) => (
      <td key={i} className="px-4 py-4"><div className="h-3 bg-gray-100 rounded" style={{ width: w }} /></td>
    ))}
  </tr>
);

function HealthBar({ score }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-400' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700">{score}</span>
    </div>
  );
}

function StatusDistribution({ dist }) {
  if (!dist || Object.keys(dist).length === 0) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {Object.entries(dist).slice(0, 3).map(([status, data]) => (
        <span key={status} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
          {status}: {data.count}
        </span>
      ))}
    </div>
  );
}

function CompanyAnalyticsInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'health_score', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [expandedRow, setExpandedRow] = useState(null);
  const limit = 25;
  const { user } = useCurrentUser();
  const router = useRouter();
  const { buildFilterQS, dateFrom, dateTo, dateField, customerGroups, extraFieldFilters, setFilterOptions, companyStatus } = useGlobalFilters();

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    const qs = buildFilterQS({ store_hash: user.store_hash, page, limit, companyStatus });
    fetch(`/api/reports/company-analytics?${qs}`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setLoading(false);
        // Update global filter options from this response
        if (d.extraFieldOptions || d.customerGroupOptions) {
          setFilterOptions({
            extraFieldOptions: d.extraFieldOptions || {},
            customerGroupOptions: d.customerGroupOptions || {},
          });
        }
      })
      .catch(() => setLoading(false));
  }, [user, page, companyStatus, dateFrom, dateTo, dateField, customerGroups, extraFieldFilters]);

  useEffect(() => { setPage(1); }, [search, tierFilter]);

  const s = data?.scorecards || {};
  const pagination = data?.pagination || {};
  const allCompanies = data?.companies || [];

  const filtered = allCompanies
    .filter(c => tierFilter === 'all' || c.tier === tierFilter)
    .filter(c =>
      !search ||
      c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.primary_email?.toLowerCase().includes(search.toLowerCase()) ||
      c.parent_company_name?.toLowerCase().includes(search.toLowerCase())
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
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Company Analytics</h1>
          <p className="text-gray-500 mt-1">Account health, order history, and distribution</p>
        </div>
        <button onClick={() => exportToCsv('company-analytics.csv', filtered, CSV_COLUMNS)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
          ⬇ Export CSV
        </button>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? [...Array(4)].map((_, i) => <SkeletonCard key={i} />) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Accounts</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{s.totalAccounts || 0}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Revenue</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(s.totalRevenue)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Orders</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600">{(s.totalOrders || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avg Order Value</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{fmt(s.avgOrderValue)}</p>
            </div>
          </>
        )}
      </div>

      {/* Health tier summary */}
      {!loading && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-green-50 rounded-xl p-4 border border-green-100 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Excellent</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{s.excellent || 0}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Good</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{s.good || 0}</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-100 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Fair</p>
            <p className="text-2xl font-bold mt-1 text-yellow-600">{s.fair || 0}</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-100 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">At Risk</p>
            <p className="text-2xl font-bold mt-1 text-red-600">{s.atRisk || 0}</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
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
          <input type="text" placeholder="Search by name, email, parent company..." value={search} onChange={e => setSearch(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 w-72 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {[
                  { key: 'company_name', label: 'Company' },
                  { key: 'health_score', label: 'Health' },
                  { key: 'tier', label: 'Tier' },
                  { key: 'account_age_days', label: 'Acct Age' },
                  { key: 'total_orders', label: 'Orders' },
                  { key: 'total_revenue', label: 'Revenue' },
                  { key: 'first_order_date', label: 'First Order' },
                  { key: 'last_order_date', label: 'Last Order' },
                  { key: 'days_since_last_order', label: 'Days Since' },
                  { key: 'avg_days_between_orders', label: 'Avg Gap' },
                ].map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className="px-4 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
                    {col.label}<SortIcon col={col.key} />
                  </th>
                ))}
                <th className="px-4 py-3 text-left whitespace-nowrap">Order Distribution</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [...Array(8)].map((_, i) => <SkeletonRow key={i} />)
              ) : (
                <>
                  {filtered.map(c => (
                    <>
                      <tr key={c.company_id}
                        className="hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedRow(expandedRow === c.company_id ? null : c.company_id)}>
                        <td className="px-4 py-4">
                          <p className="font-medium text-blue-600 hover:text-blue-800 hover:underline cursor-pointer" onClick={e => { e.stopPropagation(); router.push(`/dashboard/company/${c.company_id}`); }}>{c.company_name}</p>
                          {c.primary_email && <p className="text-xs text-gray-400 mt-0.5">{c.primary_email}</p>}
                          {c.parent_company_name && <p className="text-xs text-gray-400 mt-0.5">↳ {c.parent_company_name}</p>}
                        </td>
                        <td className="px-4 py-4"><HealthBar score={c.health_score} /></td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIER_STYLES[c.tier]}`}>{c.tier}</span>
                        </td>
                        <td className="px-4 py-4 text-gray-600">{c.account_age_days !== null ? `${c.account_age_days}d` : '—'}</td>
                        <td className="px-4 py-4 text-gray-600">{c.total_orders}</td>
                        <td className="px-4 py-4 font-medium text-gray-900">{fmt(c.total_revenue)}</td>
                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {c.first_order_date ? new Date(c.first_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-4 text-gray-600 whitespace-nowrap">
                          {c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-4">
                          {c.days_since_last_order !== null
                            ? <span className={c.days_since_last_order > 90 ? 'text-red-500 font-medium' : c.days_since_last_order > 60 ? 'text-orange-500' : 'text-gray-600'}>
                                {c.days_since_last_order}d
                              </span>
                            : '—'}
                        </td>
                        <td className="px-4 py-4 text-gray-600">{c.avg_days_between_orders !== null ? `${c.avg_days_between_orders}d` : '—'}</td>
                        <td className="px-4 py-4"><StatusDistribution dist={c.status_distribution} /></td>
                      </tr>
                      {expandedRow === c.company_id && (
                        <tr key={`${c.company_id}-expanded`} className="bg-blue-50">
                          <td colSpan={11} className="px-6 py-4">
                            <div className="grid grid-cols-3 gap-6">
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Order Distribution</p>
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400">
                                      <th className="text-left pb-1">Status</th>
                                      <th className="text-right pb-1">Count</th>
                                      <th className="text-right pb-1">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {Object.entries(c.status_distribution || {}).map(([status, d]) => (
                                      <tr key={status}>
                                        <td className="py-0.5 text-gray-700">{status}</td>
                                        <td className="py-0.5 text-right text-gray-600">{d.count}</td>
                                        <td className="py-0.5 text-right text-gray-900 font-medium">{fmt(d.total)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Account Details</p>
                                <div className="space-y-1 text-xs text-gray-600">
                                  {c.customer_group_name && <p>Group: <span className="font-medium text-gray-800">{c.customer_group_name}</span></p>}
                                  {c.primary_email && <p>Email: <span className="font-medium text-gray-800">{c.primary_email}</span></p>}
                                  {c.parent_company_name && <p>Parent: <span className="font-medium text-gray-800">{c.parent_company_name}</span></p>}
                                  <p>Avg Order Value: <span className="font-medium text-gray-800">{fmt(c.avg_order_value)}</span></p>
                                </div>
                              </div>
                              {Object.keys(c.custom_fields || {}).length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Extra Fields</p>
                                  <div className="space-y-1 text-xs text-gray-600">
                                    {Object.entries(c.custom_fields).map(([key, value]) => (
                                      <p key={key}>{key}: <span className="font-medium text-gray-800">{value}</span></p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} className="px-6 py-16 text-center text-gray-400">No companies found</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={pagination.page || 1} totalPages={pagination.totalPages || 1}
          total={pagination.total || 0} limit={limit}
          onPageChange={p => { setPage(p); window.scrollTo(0, 0); }} />
      </div>
    </div>
  );
}

export default function CompanyAnalyticsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <CompanyAnalyticsInner />
    </Suspense>
  );
}
export const dynamic = 'force-dynamic';