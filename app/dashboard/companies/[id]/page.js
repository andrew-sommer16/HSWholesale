'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCsv } from '@/lib/exportCsv';
import { useCurrentUser } from '@/lib/useCurrentUser';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_STYLES = {
  'Awaiting Payment': 'bg-yellow-50 text-yellow-700',
  'Completed': 'bg-green-50 text-green-700',
  'Shipped': 'bg-indigo-50 text-indigo-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Invoice Payment': 'bg-purple-50 text-purple-700',
};

const QUOTE_STATUS_STYLES = {
  '0': 'bg-blue-50 text-blue-700',
  '2': 'bg-yellow-50 text-yellow-700',
  '4': 'bg-green-50 text-green-700',
  '5': 'bg-gray-100 text-gray-500',
};

const AGING_BADGE = {
  '0–30': 'bg-blue-50 text-blue-700',
  '31–60': 'bg-orange-50 text-orange-700',
  '61–90': 'bg-red-50 text-red-600',
  '90+': 'bg-red-100 text-red-800',
  'Paid': 'bg-green-50 text-green-700',
};

const StatCard = ({ label, value, sub, accent }) => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
    <p className={`text-2xl font-bold mt-1 ${accent || 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
  </div>
);

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
    <div className="h-2 bg-gray-100 rounded w-1/3" />
  </div>
);

const SkeletonRow = ({ cols }) => (
  <tr className="animate-pulse">
    {[...Array(cols)].map((_, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </td>
    ))}
  </tr>
);

const ORDER_CSV = [
  { key: 'bc_order_id', label: 'Order #' },
  { key: 'custom_status', label: 'Status' },
  { key: 'total_inc_tax', label: 'Total' },
  { key: 'currency_code', label: 'Currency' },
  { key: 'po_number', label: 'PO Number' },
  { key: 'created_at_bc', label: 'Date', format: v => v ? new Date(v).toLocaleDateString() : '' },
];

const QUOTE_CSV = [
  { key: 'quote_id', label: 'Quote ID' },
  { key: 'status_name', label: 'Status' },
  { key: 'total_amount', label: 'Value' },
  { key: 'days_old', label: 'Days Old' },
  { key: 'created_at', label: 'Created', format: v => v ? new Date(v).toLocaleDateString() : '' },
  { key: 'expires_at', label: 'Expires', format: v => v ? new Date(v).toLocaleDateString() : '' },
];

const INVOICE_CSV = [
  { key: 'bc_order_id', label: 'Order #' },
  { key: 'invoice_total', label: 'Invoice Total' },
  { key: 'paid_amount', label: 'Paid' },
  { key: 'outstanding_amount', label: 'Outstanding' },
  { key: 'aging_bucket', label: 'Age' },
  { key: 'pct_paid', label: '% Paid', format: v => `${v}%` },
  { key: 'created_at', label: 'Date', format: v => v ? new Date(v).toLocaleDateString() : '' },
];

const INVOICE_PAYMENT_CSV = [
  { key: 'bc_order_id', label: 'Order #' },
  { key: 'total_inc_tax', label: 'Amount' },
  { key: 'created_at_bc', label: 'Date', format: v => v ? new Date(v).toLocaleDateString() : '' },
];

export default function CompanyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useCurrentUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('orders');
  const [sort, setSort] = useState({ key: 'created_at_bc', dir: 'desc' });

  const handleSort = (key) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  };

  const sortData = (arr) => {
    if (!arr || !sort.key) return arr || [];
    return [...arr].sort((a, b) => {
      const mul = sort.dir === 'asc' ? 1 : -1;
      const av = a[sort.key] ?? '';
      const bv = b[sort.key] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
      return String(av).localeCompare(String(bv)) * mul;
    });
  };

  const SortIcon = ({ col }) => {
    if (sort.key !== col) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-500 ml-1">{sort.dir === 'asc' ? '↑' : '↓'}</span>;
  };

  const Th = ({ col, children }) => (
    <th onClick={() => handleSort(col)}
      className="px-6 py-3 text-left cursor-pointer hover:text-gray-700 select-none whitespace-nowrap">
      {children}<SortIcon col={col} />
    </th>
  );

  useEffect(() => {
    if (!user) return;
    const storeHash = user.store_hash;
    fetch(`/api/reports/companies/${id}?store_hash=${storeHash}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id, user]);

  if (!loading && !data?.company) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm">Company not found</div>
    </div>
  );

  const { company, scorecards: s, revenueChart, orders, quotes, invoices } = data || {};
  const regularOrders = orders?.filter(o => !o.is_invoice_payment) || [];
  const invoicePayments = orders?.filter(o => o.is_invoice_payment) || [];

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/companies')}
            className="text-gray-400 hover:text-gray-600 text-sm font-medium flex items-center gap-1">
            ← Back
          </button>
          <div>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-7 bg-gray-200 rounded w-48 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-32" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">{company.company_name}</h1>
                <div className="flex items-center gap-3 mt-1">
                  {company.customer_group_name && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {company.customer_group_name}
                    </span>
                  )}
                  {company.sales_rep_name && (
                    <span className="text-xs text-gray-500">Rep: {company.sales_rep_name}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${company.status === '1' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {company.status === '1' ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <StatCard label="Total Revenue" value={fmt(s.totalRevenue)} accent="text-blue-600" />
            <StatCard label="Orders" value={s.totalOrders} accent="text-indigo-600" />
            <StatCard label="Outstanding" value={fmt(s.totalOutstanding)} accent="text-red-500" />
            <StatCard label="Open Quotes" value={s.openQuotes} accent="text-purple-600" />
            <StatCard label="Open Quote Value" value={fmt(s.openQuoteValue)} accent="text-purple-600" />
          </>
        )}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-40 mb-6" />
          <div className="h-[200px] bg-gray-100 rounded" />
        </div>
      ) : revenueChart?.length > 0 && (
        <div className="bg-white rounded-xl p-6 border border-gray-100 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-widest">Revenue Over Time</h2>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => fmt(v)} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {[
              { key: 'orders', label: `Orders (${regularOrders.length})` },
              { key: 'invoice_payments', label: `Invoice Payments (${invoicePayments.length})` },
              { key: 'quotes', label: `Quotes (${quotes?.length || 0})` },
              { key: 'invoices', label: `Invoices (${invoices?.length || 0})` },
            ].map(t => (
              <button key={t.key} onClick={() => { setTab(t.key); setSort({ key: 'created_at_bc', dir: 'desc' }); }}
                className={`px-4 py-2 transition-colors ${tab === t.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              if (!data) return;
              if (tab === 'orders') exportToCsv(`${company.company_name}-orders.csv`, regularOrders, ORDER_CSV);
              if (tab === 'invoice_payments') exportToCsv(`${company.company_name}-invoice-payments.csv`, invoicePayments, INVOICE_PAYMENT_CSV);
              if (tab === 'quotes') exportToCsv(`${company.company_name}-quotes.csv`, quotes, QUOTE_CSV);
              if (tab === 'invoices') exportToCsv(`${company.company_name}-invoices.csv`, invoices, INVOICE_CSV);
            }}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
            ⬇ Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          {/* Orders Tab */}
          {tab === 'orders' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Th col="bc_order_id">Order #</Th>
                  <Th col="custom_status">Status</Th>
                  <Th col="total_inc_tax">Total</Th>
                  <Th col="po_number">PO Number</Th>
                  <Th col="created_at_bc">Date</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [...Array(5)].map((_, i) => <SkeletonRow key={i} cols={5} />)
                ) : (
                  <>
                    {sortData(regularOrders).map(o => (
                      <tr key={o.bc_order_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{o.bc_order_id}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[o.custom_status] || STATUS_STYLES[o.status] || 'bg-gray-100 text-gray-500'}`}>
                            {o.custom_status || o.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{fmt(o.total_inc_tax)}</td>
                        <td className="px-6 py-4 text-gray-500">{o.po_number || '—'}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {o.created_at_bc ? new Date(o.created_at_bc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!regularOrders.length && <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No orders</td></tr>}
                  </>
                )}
              </tbody>
            </table>
          )}

          {/* Invoice Payments Tab */}
          {tab === 'invoice_payments' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Th col="bc_order_id">Order #</Th>
                  <Th col="total_inc_tax">Amount</Th>
                  <Th col="created_at_bc">Date</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [...Array(5)].map((_, i) => <SkeletonRow key={i} cols={3} />)
                ) : (
                  <>
                    {sortData(invoicePayments).map(o => (
                      <tr key={o.bc_order_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{o.bc_order_id}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{fmt(o.total_inc_tax)}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {o.created_at_bc ? new Date(o.created_at_bc).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!invoicePayments.length && <tr><td colSpan={3} className="px-6 py-12 text-center text-gray-400">No invoice payments</td></tr>}
                  </>
                )}
              </tbody>
            </table>
          )}

          {/* Quotes Tab */}
          {tab === 'quotes' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Th col="quote_id">Quote ID</Th>
                  <Th col="status_name">Status</Th>
                  <Th col="total_amount">Value</Th>
                  <Th col="days_old">Days Old</Th>
                  <Th col="created_at">Created</Th>
                  <Th col="expires_at">Expires</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [...Array(5)].map((_, i) => <SkeletonRow key={i} cols={6} />)
                ) : (
                  <>
                    {sortData(quotes).map(q => (
                      <tr key={q.quote_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{q.quote_id}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_STYLES[q.status] || 'bg-gray-100 text-gray-500'}`}>
                            {q.status_name}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-gray-900">{fmt(q.total_amount)}</td>
                        <td className="px-6 py-4 text-gray-600">{q.days_old ?? '—'}</td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {q.created_at ? new Date(q.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {q.expires_at ? new Date(q.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!quotes?.length && <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">No quotes</td></tr>}
                  </>
                )}
              </tbody>
            </table>
          )}

          {/* Invoices Tab */}
          {tab === 'invoices' && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <Th col="bc_order_id">Order #</Th>
                  <Th col="invoice_total">Invoice Total</Th>
                  <Th col="paid_amount">Paid</Th>
                  <Th col="outstanding_amount">Outstanding</Th>
                  <Th col="aging_bucket">Age</Th>
                  <Th col="pct_paid">% Paid</Th>
                  <Th col="created_at">Date</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  [...Array(5)].map((_, i) => <SkeletonRow key={i} cols={7} />)
                ) : (
                  <>
                    {sortData(invoices).map((r, i) => (
                      <tr key={`${r.bc_order_id}-${i}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-mono text-xs text-gray-500">{r.bc_order_id}</td>
                        <td className="px-6 py-4 text-gray-700">{fmt(r.invoice_total)}</td>
                        <td className="px-6 py-4 text-green-600">{fmt(r.paid_amount)}</td>
                        <td className="px-6 py-4">
                          <span className={r.outstanding_amount > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}>
                            {fmt(r.outstanding_amount)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${AGING_BADGE[r.aging_bucket] || 'bg-gray-100 text-gray-500'}`}>
                            {r.aging_bucket}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-gray-100 rounded-full h-1.5">
                              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(r.pct_paid, 100)}%` }} />
                            </div>
                            <span className="text-gray-600 text-xs">{r.pct_paid}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-600 whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                    {!invoices?.length && <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No invoices</td></tr>}
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
export const dynamic = 'force-dynamic';