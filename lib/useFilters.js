'use client';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useMemo, useState, useEffect } from 'react';

const today = new Date();
const thirtyDaysAgo = new Date(today);
thirtyDaysAgo.setDate(today.getDate() - 30);

const DEFAULT_DATE_FROM = thirtyDaysAgo.toISOString().split('T')[0];
const DEFAULT_DATE_TO = today.toISOString().split('T')[0];

export function getDefaultFilters(repId = null) {
  return {
    companies: [],
    customerGroups: [],
    salesReps: repId ? [repId] : [],
    dateFrom: DEFAULT_DATE_FROM,
    dateTo: DEFAULT_DATE_TO,
    quoteStatuses: [],
    orderStatuses: [],
    paymentStatuses: [],
  };
}

export function formatDateRange(filters) {
  if (!filters?.dateFrom && !filters?.dateTo) return 'All time';
  const from = filters.dateFrom ? new Date(filters.dateFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const to = filters.dateTo ? new Date(filters.dateTo).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  if (from && to) return `${from} — ${to}`;
  if (from) return `From ${from}`;
  if (to) return `Until ${to}`;
  return 'All time';
}

function parseList(val) {
  if (!val) return [];
  return val.split(',').filter(Boolean);
}

function serializeList(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr.join(',');
}

export function useFilters(repId = null, storeHash = null) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => {
    const companies = parseList(searchParams.get('companies'));
    const customerGroups = parseList(searchParams.get('customerGroups'));
    const rawReps = parseList(searchParams.get('salesReps'));
    const salesReps = rawReps.length > 0 ? rawReps : (repId ? [repId] : []);
    const dateFromParam = searchParams.get('dateFrom');
    const dateToParam = searchParams.get('dateTo');
    const dateFrom = dateFromParam === 'alltime' ? '' : (dateFromParam || DEFAULT_DATE_FROM);
    const dateTo = dateToParam === 'alltime' ? '' : (dateToParam || DEFAULT_DATE_TO);
    const quoteStatuses = parseList(searchParams.get('quoteStatuses'));
    const orderStatuses = parseList(searchParams.get('orderStatuses'));
    const paymentStatuses = parseList(searchParams.get('paymentStatuses'));
    return { companies, customerGroups, salesReps, dateFrom, dateTo, quoteStatuses, orderStatuses, paymentStatuses };
  }, [searchParams, repId]);

  const [pendingFilters, setPendingFilters] = useState(filters);

  useEffect(() => {
    setPendingFilters(filters);
  }, [searchParams]);

  const updatePending = useCallback((key, value) => {
    setPendingFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const buildParams = useCallback((f) => {
    const params = new URLSearchParams();
    if (f.companies?.length) params.set('companies', serializeList(f.companies));
    if (f.customerGroups?.length) params.set('customerGroups', serializeList(f.customerGroups));
    const repsToSave = repId ? f.salesReps.filter(r => r !== repId) : f.salesReps;
    if (repsToSave.length) params.set('salesReps', serializeList(f.salesReps));
    else if (f.salesReps.length && !repId) params.set('salesReps', serializeList(f.salesReps));
    if (f.dateFrom === '') params.set('dateFrom', 'alltime');
    else if (f.dateFrom && f.dateFrom !== DEFAULT_DATE_FROM) params.set('dateFrom', f.dateFrom);
    if (f.dateTo === '') params.set('dateTo', 'alltime');
    else if (f.dateTo && f.dateTo !== DEFAULT_DATE_TO) params.set('dateTo', f.dateTo);
    if (f.quoteStatuses?.length) params.set('quoteStatuses', serializeList(f.quoteStatuses));
    if (f.orderStatuses?.length) params.set('orderStatuses', serializeList(f.orderStatuses));
    if (f.paymentStatuses?.length) params.set('paymentStatuses', serializeList(f.paymentStatuses));
    return params;
  }, [repId]);

  const applyFilters = useCallback(() => {
    const params = buildParams(pendingFilters);
    router.push(`${pathname}?${params.toString()}`);
  }, [pendingFilters, pathname, router, buildParams]);

  const resetFilters = useCallback(() => {
    setPendingFilters(getDefaultFilters(repId));
    router.push(pathname);
  }, [pathname, router, repId]);

  const removeFilter = useCallback((key, newValue) => {
    const updated = { ...filters, [key]: newValue };
    const params = buildParams(updated);
    setPendingFilters(updated);
    router.push(`${pathname}?${params.toString()}`);
  }, [filters, pathname, router, buildParams]);

  const activeFilterCount = useMemo(() => {
    return Object.entries(filters).reduce((count, [key, value]) => {
      if (key === 'dateFrom' || key === 'dateTo') return count;
      if (key === 'salesReps' && repId && value.length === 1 && value[0] === repId) return count;
      if (Array.isArray(value) && value.length > 0) return count + 1;
      return count;
    }, 0);
  }, [filters, repId]);

  const buildQueryString = useCallback((extra = {}) => {
    const params = new URLSearchParams();
    if (storeHash) params.set('store_hash', storeHash);
    if (filters.companies.length) params.set('companies', filters.companies.join(','));
    if (filters.customerGroups.length) params.set('customerGroups', filters.customerGroups.join(','));
    if (filters.salesReps.length) params.set('salesReps', filters.salesReps.join(','));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.quoteStatuses.length) params.set('quoteStatuses', filters.quoteStatuses.join(','));
    if (filters.orderStatuses.length) params.set('orderStatuses', filters.orderStatuses.join(','));
    if (filters.paymentStatuses.length) params.set('paymentStatuses', filters.paymentStatuses.join(','));
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return params.toString();
  }, [filters, storeHash]);

  return {
    filters,
    pendingFilters,
    updatePending,
    applyFilters,
    resetFilters,
    removeFilter,
    activeFilterCount,
    buildQueryString,
  };
}