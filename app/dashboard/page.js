'use client';
import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
  </div>
);

function DateRangePicker({ dateFrom, dateTo, dateField, onChange }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
        <button onClick={() => onChange({ dateField: 'created' })}
          className={`px-3 py-1.5 transition-colors ${dateField === 'created' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
          Order Date
        </button>
        <button onClick={() => onChange({ dateField: 'shipped' })}
          className={`px-3 py-1.5 transition-colors ${dateField === 'shipped' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
          Ship Date
        </button>
      </div>
      <input type="date" value={dateFrom} onChange={e => onChange({ dateFrom: e.target.value })}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <span className="text-gray-400 text-sm">to</span>
      <input type="date" value={dateTo} onChange={e => onChange({ dateTo: e.target.value })}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      {(dateFrom || dateTo) && (
        <button onClick={() => onChange({ dateFrom: '', dateTo: '' })}
          className="text-xs text-red-500 hover:text-red-700 font-medium">Clear</button>
      )}
    </div>
  );
}

function SpreadSection({ title, data, loading }) {
  const total = data.reduce((s, d) => s + d.spend, 0);
  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-32 mb-6" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
  if (!data.length) return null;

  const top8 = data.slice(0, 8);
  const other = data.slice(8).reduce((s, d) => s + d.spend, 0);
  const chartData = other > 0 ? [...top8, { name: 'Other', spend: other, pct: Math.round((other / total) * 100) }] : top8;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        {/* Pie chart */}
        <div className="p-4">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartData} dataKey="spend" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, pct }) => `${name} ${pct}%`} labelLine={false}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        {/* Table */}
        <div className="overflow-auto max-h-72">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-right">Spend</th>
                <th className="px-4 py-3 text-right">% of Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.map((row, i) => (
                <tr key={row.name} className="hover:bg-gray-50">
                  <td className="px-4 py-3 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="text-gray-800 font-medium truncate max-w-[140px]">{row.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(row.spend)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${row.pct}%`, background: COLORS[i % COLORS.length] }} />
                      </div>
                      <span className="text-gray-600 text-xs w-8 text-right">{row.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OverviewPageInner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateField, setDateField] = useState('created');
  const [customerGroupFilters, setCustomerGroupFilters] = useState([]);
  const [customFieldFilters, setCustomFieldFilters] = useState({});
  const [cfPanelOpen, setCfPanelOpen] = useState(false);
  const { user } = useCurrentUser();

  const buildQS = () => {
    const params = new URLSearchParams();
    params.set('store_hash', user.store_hash);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('dateField', dateField);
    if (customerGroupFilters.length) params.set('customerGroups', customerGroupFilters.join(','));
    Object.entries(customFieldFilters).forEach(([key, values]) => {
      if (values.length) params.set(`ccf_${encodeURIComponent(key)}`, values.join(','));
    });
    return params.toString();
  };

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    fetch(`/api/reports/overview?${buildQS()}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, dateFrom, dateTo, dateField, customerGroupFilters, customFieldFilters]);

  const handleDateChange = (updates) => {
    if (updates.dateFrom !== undefined) setDateFrom(updates.dateFrom);
    if (updates.dateTo !== undefined) setDateTo(updates.dateTo);
    if (updates.dateField !== undefined) setDateField(updates.dateField);
  };

  const toggleCustomerGroup = (id) => {
    setCustomerGroupFilters(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleCfFilter = (fieldName, value) => {
    setCustomFieldFilters(prev => {
      const current = prev[fieldName] || [];
      const updated = current.includes(value) ? current.filter(v => v !== value) : [...current, value];
      return { ...prev, [fieldName]: updated };
    });
  };

  const clearAllFilters = () => {
    setCustomerGroupFilters([]);
    setCustomFieldFilters({});
    setDateFrom('');
    setDateTo('');
  };

  const s = data?.scorecards || {};
  const customerGroupOptions = data?.customerGroupOptions || {};
  const companyCustomFieldOptions = data?.companyCustomFieldOptions || {};
  const activeCfCount = Object.values(customFieldFilters).flat().length + customerGroupFilters.length;

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
          <p className="text-gray-500 mt-1">Key metrics, category and brand spend analysis</p>
        </div>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} dateField={dateField} onChange={handleDateChange} />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Filters</h3>
          {activeCfCount > 0 && (
            <button onClick={clearAllFilters} className="text-xs text-red-500 hover:text-red-700 font-medium">
              Clear all ({activeCfCount})
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-6">
          {/* Customer Groups */}
          {Object.keys(customerGroupOptions).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer Groups</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(customerGroupOptions).map(([id, name]) => {
                  const active = customerGroupFilters.includes(id);
                  return (
                    <button key={id} onClick={() => toggleCustomerGroup(id)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Company Custom Fields */}
          {Object.keys(companyCustomFieldOptions).map(fieldName => (
            <div key={fieldName}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{fieldName}</p>
              <div className="flex flex-wrap gap-2">
                {companyCustomFieldOptions[fieldName].map(value => {
                  const active = (customFieldFilters[fieldName] || []).includes(value);
                  return (
                    <button key={value} onClick={() => toggleCfFilter(fieldName, value)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scorecards */}
      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          [...Array(4)].map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Spend</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(s.totalSpend)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Order Count</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{(s.orderCount || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Avg Order Value</p>
              <p className="text-2xl font-bold mt-1 text-indigo-600">{fmt(s.avgOrderValue)}</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Accounts</p>
              <p className="text-2xl font-bold mt-1 text-gray-900">{(s.totalAccounts || 0).toLocaleString()}</p>
            </div>
          </>
        )}
      </div>

      {/* Category and Brand Spread */}
      <SpreadSection title="Category Spend" data={data?.categorySpend || []} loading={loading} />
      <SpreadSection title="Brand Spend" data={data?.brandSpend || []} loading={loading} />
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
      <OverviewPageInner />
    </Suspense>
  );
}
export const dynamic = 'force-dynamic';