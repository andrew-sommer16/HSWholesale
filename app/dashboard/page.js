'use client';
import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useGlobalFilters } from '@/lib/filterContext';
import { Suspense } from 'react';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);
const COLORS = ['#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6'];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
  </div>
);

function SpreadSection({ title, data, loading }) {
  if (loading) return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 animate-pulse">
      <div className="h-3 bg-gray-200 rounded w-32 mb-6" />
      <div className="h-48 bg-gray-100 rounded" />
    </div>
  );
  if (!data?.length) return null;

  const total = data.reduce((s, d) => s + d.spend, 0);
  const top8 = data.slice(0, 8);
  const otherSpend = data.slice(8).reduce((s, d) => s + d.spend, 0);
  const chartData = otherSpend > 0
    ? [...top8, { name: 'Other', spend: otherSpend, pct: Math.round((otherSpend / total) * 100) }]
    : top8;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">{title}</h2>
      </div>
      <div className="grid grid-cols-2 divide-x divide-gray-100">
        <div className="p-4">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartData} dataKey="spend" nameKey="name" cx="50%" cy="50%" outerRadius={90}
                label={({ name, pct }) => pct > 3 ? `${name} ${pct}%` : ''} labelLine={false}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
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
                    <span className="text-gray-800 font-medium truncate max-w-[160px]">{row.name}</span>
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
  const { user } = useCurrentUser();
  const { buildFilterQS, dateFrom, dateTo, dateField, customerGroups, extraFieldFilters } = useGlobalFilters();

  useEffect(() => {
    if (!user?.store_hash) return;
    setLoading(true);
    const qs = buildFilterQS({ store_hash: user.store_hash });
    fetch(`/api/reports/overview?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [user, dateFrom, dateTo, dateField, customerGroups, extraFieldFilters]);

  const s = data?.scorecards || {};

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 mt-1">Key metrics, category and brand spend analysis</p>
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