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

  const dateRangeLabel = () => {
    if (!dateFrom && !dateTo) return 'All time';
    const fmtDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (dateFrom && dateTo) return `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
    if (dateFrom) return `From ${fmtDate(dateFrom)}`;
    return `Until ${fmtDate(dateTo)}`;
  };

  return (
    <FilterContext.Provider value={{
      dateFrom, setDateFrom,
      dateTo, setDateTo,
      dateField, setDateField,
      applyPreset,
      dateRangeLabel,
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