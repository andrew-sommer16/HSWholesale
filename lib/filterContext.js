'use client';
import { createContext, useContext, useState } from 'react';

const FilterContext = createContext(null);

export const DATE_PRESETS = [
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'Last 6 months', days: 180 },
  { label: 'Last 12 months', days: 365 },
  { label: 'This year', year: 'current' },
  { label: 'Last year', year: 'last' },
  { label: 'All time', clear: true },
];

const pad = (d) => d.toISOString().split('T')[0];

const getDefaultDates = () => {
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30);
  return { dateFrom: pad(from), dateTo: pad(today) };
};

export function FilterProvider({ children }) {
  const defaults = getDefaultDates();
  const [dateFrom, setDateFrom] = useState(defaults.dateFrom);
  const [dateTo, setDateTo] = useState(defaults.dateTo);
  const [dateField, setDateField] = useState('created');
  const [customerGroups, setCustomerGroups] = useState([]);
  const [extraFieldFilters, setExtraFieldFilters] = useState({});
  const [companyStatus, setCompanyStatus] = useState('all'); // 'all', 'active', 'inactive'

  // Filter options loaded from API — stored globally so all pages share them
  const [filterOptions, setFilterOptions] = useState({
    customerGroupOptions: {},
    extraFieldOptions: {},
  });

  const applyPreset = (preset) => {
    const today = new Date();
    if (preset.clear) {
      setDateFrom('');
      setDateTo('');
    } else if (preset.days) {
      const from = new Date(today);
      from.setDate(from.getDate() - preset.days);
      setDateFrom(pad(from));
      setDateTo(pad(today));
    } else if (preset.year === 'current') {
      setDateFrom(`${today.getFullYear()}-01-01`);
      setDateTo(pad(today));
    } else if (preset.year === 'last') {
      const y = today.getFullYear() - 1;
      setDateFrom(`${y}-01-01`);
      setDateTo(`${y}-12-31`);
    }
  };

  const toggleCustomerGroup = (id) => {
    setCustomerGroups(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleExtraField = (fieldName, value) => {
    setExtraFieldFilters(prev => {
      const current = prev[fieldName] || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [fieldName]: updated };
    });
  };

  const clearAllFilters = () => {
    setCustomerGroups([]);
    setExtraFieldFilters({});
    setDateFrom('');
    setDateTo('');
    setCompanyStatus('all');
  };

  const dateRangeLabel = () => {
    if (!dateFrom && !dateTo) return 'All time';
    const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (dateFrom && dateTo) return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    if (dateFrom) return `From ${fmtDate(dateFrom)}`;
    return `Until ${fmtDate(dateTo)}`;
  };

  const buildFilterQS = (extra = {}) => {
    const params = new URLSearchParams(extra);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('dateField', dateField);
    // Always read companyStatus fresh from state
    const currentStatus = extra.companyStatus !== undefined ? extra.companyStatus : companyStatus;
    if (currentStatus && currentStatus !== 'all') params.set('companyStatus', currentStatus);
    else params.delete('companyStatus');
    if (customerGroups.length) params.set('customerGroups', customerGroups.join(','));
    Object.entries(extraFieldFilters).forEach(([key, values]) => {
      if (values.length) params.set(`ccf_${encodeURIComponent(key)}`, values.join(','));
    });
    return params.toString();
  };

  const activeFilterCount =
    customerGroups.length + Object.values(extraFieldFilters).flat().length;

  return (
    <FilterContext.Provider value={{
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      dateField, setDateField,
      companyStatus, setCompanyStatus,
      customerGroups,
      extraFieldFilters,
      filterOptions, setFilterOptions,
      applyPreset,
      toggleCustomerGroup,
      toggleExtraField,
      clearAllFilters,
      dateRangeLabel,
      buildFilterQS,
      activeFilterCount,
    }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useGlobalFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useGlobalFilters must be used within FilterProvider');
  return ctx;
}