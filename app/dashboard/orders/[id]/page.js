'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { exportToCsv } from '@/lib/exportCsv';
import { useCurrentUser } from '@/lib/useCurrentUser';

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n || 0);

const STATUS_STYLES = {
  'Awaiting Payment': 'bg-yellow-50 text-yellow-700',
  'Awaiting Fulfillment': 'bg-blue-50 text-blue-700',
  'Shipped': 'bg-indigo-50 text-indigo-700',
  'Completed': 'bg-green-50 text-green-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
  'Refunded': 'bg-red-50 text-red-600',
  'Invoice Payment': 'bg-purple-50 text-purple-700',
};

const QUOTE_STATUS = { '0': 'New', '2': 'In Process', '4': 'Ordered', '5': 'Expired' };

const CSV_COLUMNS = [
  { key: 'sku', label: 'SKU' },
  { key: 'product_name', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'base_price', label: 'Unit Price' },
  { key: 'line_total', label: 'Line Total' },
];

const SkeletonCard = () => (
  <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm animate-pulse">
    <div className="h-2.5 bg-gray-200 rounded w-1/2 mb-3" />
    <div className="h-7 bg-gray-200 rounded w-3/4 mb-2" />
  </div>
);

const SkeletonRow = () => (
  <tr className="animate-pulse">
    {['60%', '30%', '25%', '35%', '40%'].map((w, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-3 bg-gray-100 rounded" style={{ width: w }} />
      </td>
    ))}
  </tr>
);

export default function OrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useCurrentUser();
  const [data, setData] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lineItemsLoading, setLineItemsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const storeHash = user.store_hash;
    fetch(`/api/reports/orders/${id}?store_hash=${storeHash}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`/api/reports/orders/${id}/line-items?store_hash=${storeHash}`)
      .then(r => r.json())
      .then(d => { setLineItems(d.lineItems || []); setLineItemsLoading(false); })
      .catch(() => setLineItemsLoading(false));
  }, [id, user]);

  if (!loading && !data?.order) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-gray-400 text-sm">Order not found</div>
    </div>
  );

  const order = data?.order;
  const relatedQuote = data?.relatedQuote;
  const isInvoicePayment = order?.custom_status === 'Invoice Payment';

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard/orders')}
            className="text-gray-400 hover:text-gray-600 text-sm font-medium flex items-center gap-1">
            ← Back
          </button>
          <div>
            {loading ? (
              <div className="animate-pulse">
                <div className="h-7 bg-gray-200 rounded w-40 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-32" />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Order #{order.bc_order_id}</h1>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[order.custom_status] || STATUS_STYLES[order.status] || 'bg-gray-100 text-gray-500'}`}>
                    {order.custom_status || order.status}
                  </span>
                  {order.company_name && (
                    <a href={`/dashboard/companies/${order.company_id}`} className="text-xs text-blue-500 hover:text-blue-700 hover:underline">
                      {order.company_name}
                    </a>
                  )}
                  {order.currency_code && <span className="text-xs text-gray-400">{order.currency_code}</span>}
                </div>
              </>
            )}
          </div>
        </div>
        <button
          onClick={() => exportToCsv(`order-${order?.bc_order_id}.csv`, lineItems, CSV_COLUMNS)}
          disabled={loading || lineItemsLoading}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-40">
          ⬇ Export CSV
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {loading ? (
          <><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /></>
        ) : (
          <>
            <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Order Total</p>
              <p className="text-2xl font-bold mt-1 text-blue-600">{fmt(order.total_inc_tax)}</p>
            </div>
            {!isInvoicePayment && (
              <>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Paid</p>
                  <p className="text-2xl font-bold mt-1 text-green-600">{fmt(order.paid_amount)}</p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Outstanding</p>
                  <p className={`text-2xl font-bold mt-1 ${order.outstanding_amount > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {fmt(order.outstanding_amount)}
                  </p>
                </div>
                <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">% Paid</p>
                  <div className="mt-1">
                    <p className="text-2xl font-bold text-gray-900">{order.pct_paid}%</p>
                    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${Math.min(order.pct_paid, 100)}%` }} />
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest mb-4">Order Details</h2>
        {loading ? (
          <div className="grid grid-cols-3 gap-6 animate-pulse">
            {[...Array(6)].map((_, i) => (
              <div key={i}>
                <div className="h-2 bg-gray-100 rounded w-20 mb-2" />
                <div className="h-4 bg-gray-200 rounded w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Order Date</p>
              <p className="text-sm font-medium text-gray-900">
                {order.created_at_bc ? new Date(order.created_at_bc).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">PO Number</p>
              <p className="text-sm font-medium text-gray-900">{order.po_number || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Last Updated</p>
              <p className="text-sm font-medium text-gray-900">
                {order.updated_at_bc ? new Date(order.updated_at_bc).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Company</p>
              <a href={`/dashboard/companies/${order.company_id}`} className="text-sm font-medium text-blue-500 hover:text-blue-700 hover:underline">
                {order.company_name}
              </a>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">B2B Order ID</p>
              <p className="text-sm font-medium text-gray-900 font-mono">{order.b2b_order_id || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Currency</p>
              <p className="text-sm font-medium text-gray-900">{order.currency_code || 'USD'}</p>
            </div>
          </div>
        )}
      </div>

      {!loading && relatedQuote && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-blue-600 text-sm font-medium">💬 Converted from Quote</span>
            <span className="text-blue-700 font-mono text-sm">#{relatedQuote.bc_quote_id}</span>
            <span className="text-xs text-blue-500">{QUOTE_STATUS[relatedQuote.status] || relatedQuote.status}</span>
          </div>
          <a href={`/dashboard/quotes/${relatedQuote.bc_quote_id}`}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors">
            View Quote →
          </a>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest">
            Line Items {!lineItemsLoading && `(${lineItems.length})`}
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <th className="px-6 py-3 text-left">Product</th>
              <th className="px-6 py-3 text-left">SKU</th>
              <th className="px-6 py-3 text-right">Qty</th>
              <th className="px-6 py-3 text-right">Unit Price</th>
              <th className="px-6 py-3 text-right">Line Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lineItemsLoading ? (
              [...Array(4)].map((_, i) => <SkeletonRow key={i} />)
            ) : lineItems.length > 0 ? (
              lineItems.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">{item.product_name || '—'}</td>
                  <td className="px-6 py-4 font-mono text-xs text-gray-500">{item.sku || '—'}</td>
                  <td className="px-6 py-4 text-right text-gray-600">{item.quantity}</td>
                  <td className="px-6 py-4 text-right text-gray-700">{fmt(item.base_price)}</td>
                  <td className="px-6 py-4 text-right font-bold text-gray-900">{fmt(item.line_total)}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No line items found</td></tr>
            )}
          </tbody>
          {!lineItemsLoading && lineItems.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td colSpan={4} className="px-6 py-4 text-right text-sm font-semibold text-gray-700">Total</td>
                <td className="px-6 py-4 text-right font-bold text-gray-900">{fmt(order?.total_inc_tax)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
export const dynamic = 'force-dynamic';
