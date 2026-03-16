'use client';
import { useState } from 'react';
import { useGlobalFilters, DATE_PRESETS } from '@/lib/filterContext';

export default function DateBar() {
  const { dateFrom, setDateFrom, dateTo, setDateTo, dateField, setDateField, applyPreset, dateRangeLabel } = useGlobalFilters();
  const [showPresets, setShowPresets] = useState(false);

  return (
    <div className="bg-white border-b border-gray-100 px-8 py-3 flex items-center gap-4 flex-wrap sticky top-0 z-10 shadow-sm">
      {/* Current date range label */}
      <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
        📅 {dateRangeLabel()}
      </span>

      <div className="flex items-center gap-3 ml-auto flex-wrap">
        {/* Order/Ship toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
          <button onClick={() => setDateField('created')}
            className={`px-3 py-1.5 transition-colors ${dateField === 'created' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Order Date
          </button>
          <button onClick={() => setDateField('shipped')}
            className={`px-3 py-1.5 transition-colors ${dateField === 'shipped' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            Ship Date
          </button>
        </div>

        {/* Presets */}
        <div className="relative">
          <button onClick={() => setShowPresets(!showPresets)}
            className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 text-gray-600 whitespace-nowrap">
            Presets ▾
          </button>
          {showPresets && (
            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-40">
              {DATE_PRESETS.map(p => (
                <button key={p.label} onClick={() => { applyPreset(p); setShowPresets(false); }}
                  className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg ${
                    p.clear ? 'text-blue-600 border-t border-gray-100 font-medium' : 'text-gray-700'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Date inputs */}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <span className="text-gray-400 text-xs">to</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
  );
}