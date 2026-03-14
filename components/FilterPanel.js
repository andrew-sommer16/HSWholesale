'use client';
import { useState, useEffect } from 'react';

const today = new Date();
const fmt = (d) => d.toISOString().split('T')[0];

const DATE_PRESETS = [
  { label: 'Last 30 Days', getValue: () => { const from = new Date(today); from.setDate(today.getDate() - 30); return { dateFrom: fmt(from), dateTo: fmt(today) }; } },
  { label: 'Last 60 Days', getValue: () => { const from = new Date(today); from.setDate(today.getDate() - 60); return { dateFrom: fmt(from), dateTo: fmt(today) }; } },
  { label: 'Last 90 Days', getValue: () => { const from = new Date(today); from.setDate(today.getDate() - 90); return { dateFrom: fmt(from), dateTo: fmt(today) }; } },
  { label: 'Last 12 Months', getValue: () => { const from = new Date(today); from.setMonth(today.getMonth() - 12); return { dateFrom: fmt(from), dateTo: fmt(today) }; } },
  { label: 'Year to Date', getValue: () => { const from = new Date(today.getFullYear(), 0, 1); return { dateFrom: fmt(from), dateTo: fmt(today) }; } },
  { label: 'Last Year', getValue: () => { const from = new Date(today.getFullYear() - 1, 0, 1); const to = new Date(today.getFullYear() - 1, 11, 31); return { dateFrom: fmt(from), dateTo: fmt(to) }; } },
  { label: 'This Month', getValue: () => { const from = new Date(today.getFullYear(), today.getMonth(), 1); return { dateFrom: fmt(from), dateTo: fmt(today) }; } },
  { label: 'Last Month', getValue: () => { const from = new Date(today.getFullYear(), today.getMonth() - 1, 1); const to = new Date(today.getFullYear(), today.getMonth(), 0); return { dateFrom: fmt(from), dateTo: fmt(to) }; } },
  { label: 'All Time', getValue: () => ({ dateFrom: '', dateTo: '' }) },
];

function MultiSelect({ options = [], selected = [], onChange, placeholder }) {
  const [open, setOpen] = useState(false);

  const toggle = (value) => {
    if (selected.includes(value)) onChange(selected.filter(v => v !== value));
    else onChange([...selected, value]);
  };

  const selectedLabels = selected.map(v => options.find(o => o.value === v)?.label || v);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full text-left text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between">
        <span className={selected.length === 0 ? 'text-gray-400' : 'text-gray-900'}>
          {selected.length === 0 ? placeholder : selectedLabels.length <= 2 ? selectedLabels.join(', ') : `${selectedLabels[0]}, +${selectedLabels.length - 1} more`}
        </span>
        <span className="text-gray-400 ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No options</div>
          ) : (
            options.map(opt => (
              <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)}
                  className="rounded border-gray-300 text-blue-600" />
                <span className="text-gray-700">{opt.label}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function FilterPanel({ open, onClose, pendingFilters, updatePending, applyFilters, resetFilters, activeFilterCount, pageType, filterOptions = {} }) {
  const [activePreset, setActivePreset] = useState(null);

  useEffect(() => {
    if (!pendingFilters) return;
    const match = DATE_PRESETS.find(p => {
      const { dateFrom, dateTo } = p.getValue();
      return dateFrom === (pendingFilters.dateFrom || '') && dateTo === (pendingFilters.dateTo || '');
    });
    setActivePreset(match?.label || null);
  }, [pendingFilters?.dateFrom, pendingFilters?.dateTo]);

  const applyPreset = (preset) => {
    const { dateFrom, dateTo } = preset.getValue();
    updatePending('dateFrom', dateFrom);
    updatePending('dateTo', dateTo);
    setActivePreset(preset.label);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/20" onClick={onClose} />
      <div className="w-80 bg-white shadow-xl flex flex-col h-full">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Filters</h2>
          <div className="flex items-center gap-3">
            {activeFilterCount > 0 && (
              <button onClick={() => { resetFilters(); onClose(); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Reset all</button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Date Range</label>
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {DATE_PRESETS.map(preset => (
                <button key={preset.label} onClick={() => applyPreset(preset)}
                  className={`text-xs px-2 py-1.5 rounded-lg border font-medium transition-colors text-center ${
                    activePreset === preset.label ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-400 block mb-1">From</label>
                <input type="date" value={pendingFilters?.dateFrom || ''}
                  onChange={e => { updatePending('dateFrom', e.target.value); setActivePreset(null); }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">To</label>
                <input type="date" value={pendingFilters?.dateTo || ''}
                  onChange={e => { updatePending('dateTo', e.target.value); setActivePreset(null); }}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Company</label>
            <MultiSelect options={filterOptions.companies || []} selected={pendingFilters?.companies || []}
              onChange={val => updatePending('companies', val)} placeholder="All companies" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Sales Rep</label>
            <MultiSelect options={filterOptions.salesReps || []} selected={pendingFilters?.salesReps || []}
              onChange={val => updatePending('salesReps', val)} placeholder="All reps" />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Customer Group</label>
            <MultiSelect options={filterOptions.customerGroups || []} selected={pendingFilters?.customerGroups || []}
              onChange={val => updatePending('customerGroups', val)} placeholder="All groups" />
          </div>

          {pageType === 'quotes' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Quote Status</label>
              <MultiSelect options={filterOptions.quoteStatuses || []} selected={pendingFilters?.quoteStatuses || []}
                onChange={val => updatePending('quoteStatuses', val)} placeholder="All statuses" />
            </div>
          )}

          {pageType === 'orders' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Order Status</label>
              <MultiSelect options={filterOptions.orderStatuses || []} selected={pendingFilters?.orderStatuses || []}
                onChange={val => updatePending('orderStatuses', val)} placeholder="All statuses" />
            </div>
          )}

          {pageType === 'net-terms' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Payment Status</label>
              <MultiSelect options={filterOptions.paymentStatuses || []} selected={pendingFilters?.paymentStatuses || []}
                onChange={val => updatePending('paymentStatuses', val)} placeholder="All statuses" />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button onClick={() => { resetFilters(); onClose(); }}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            Reset
          </button>
          <button onClick={() => { applyFilters(); onClose(); }}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
            Apply{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </button>
        </div>
      </div>
    </div>
  );
}