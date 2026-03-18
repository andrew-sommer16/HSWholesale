'use client';
import { useState, useEffect } from 'react';
import { useGlobalFilters, DATE_PRESETS } from '@/lib/filterContext';
import { useCurrentUser } from '@/lib/useCurrentUser';

export default function DateBar() {
  const {
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    dateField, setDateField,
    customerGroups, extraFieldFilters,
    filterOptions, setFilterOptions,
    applyPreset,
    toggleCustomerGroup,
    toggleExtraField,
    clearAllFilters,
    dateRangeLabel,
    activeFilterCount,
    companyStatus, setCompanyStatus,
  } = useGlobalFilters();

  const { user } = useCurrentUser();
  const [showPresets, setShowPresets] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Load filter options once when user is available
  useEffect(() => {
    if (!user?.store_hash) return;
    fetch(`/api/reports/company-analytics?store_hash=${user.store_hash}&page=1&limit=1`)
      .then(r => r.json())
      .then(d => {
        if (d.extraFieldOptions || d.customerGroupOptions) {
          setFilterOptions({
            customerGroupOptions: d.customerGroupOptions || {},
            extraFieldOptions: d.extraFieldOptions || {},
          });
        }
      })
      .catch(() => {});
  }, [user?.store_hash]);

  const hasFilterOptions =
    Object.keys(filterOptions.customerGroupOptions).length > 0 ||
    Object.keys(filterOptions.extraFieldOptions).length > 0;

  return (
    <div className="bg-white border-b border-gray-100 shadow-sm">
      {/* Main date bar */}
      <div className="px-8 py-3 flex items-center gap-4 flex-wrap">
        {/* Date range label */}
        <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
          📅 {dateRangeLabel()}
        </span>

        {activeFilterCount > 0 && (
          <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium">
            {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
          </span>
        )}

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

          {/* Company status toggle */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
            {[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'inactive', label: 'Inactive' }].map(opt => (
              <button key={opt.key} onClick={() => setCompanyStatus(opt.key)}
                className={`px-3 py-1.5 transition-colors ${companyStatus === opt.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
                {opt.label}
              </button>
            ))}
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

          {/* Filters toggle */}
          {hasFilterOptions && (
            <button onClick={() => setShowFilters(!showFilters)}
              className={`text-xs font-medium px-3 py-1.5 border rounded-lg transition-colors whitespace-nowrap ${
                activeFilterCount > 0
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-600'
              }`}>
              ⚙️ Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : ''}
            </button>
          )}

          {/* Clear all */}
          {(activeFilterCount > 0 || dateFrom || dateTo) && (
            <button onClick={clearAllFilters}
              className="text-xs text-red-500 hover:text-red-700 font-medium whitespace-nowrap">
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Expanded filter panel */}
      {showFilters && hasFilterOptions && (
        <div className="px-8 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex flex-wrap gap-8">
            {/* Customer Groups */}
            {Object.keys(filterOptions.customerGroupOptions).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Customer Groups</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(filterOptions.customerGroupOptions).map(([id, name]) => {
                    const active = customerGroups.includes(id);
                    return (
                      <button key={id} onClick={() => toggleCustomerGroup(id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Extra fields */}
            {Object.entries(filterOptions.extraFieldOptions).map(([fieldName, values]) => (
              <div key={fieldName}>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{fieldName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {values.map(value => {
                    const active = (extraFieldFilters[fieldName] || []).includes(value);
                    return (
                      <button key={value} onClick={() => toggleExtraField(fieldName, value)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}>
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}