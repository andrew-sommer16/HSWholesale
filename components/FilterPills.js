'use client';

export default function FilterPills({ filters, filterOptions, onRemove, onReset }) {
  const pills = [];

  if (filters.companies?.length > 0) {
    filters.companies.forEach(id => {
      const label = filterOptions.companies?.find(c => c.value === id)?.label || id;
      pills.push({ key: 'companies', value: id, label: `Company: ${label}` });
    });
  }

  if (filters.salesReps?.length > 0) {
    filters.salesReps.forEach(id => {
      const label = filterOptions.salesReps?.find(r => r.value === id)?.label || id;
      pills.push({ key: 'salesReps', value: id, label: `Rep: ${label}` });
    });
  }

  if (filters.customerGroups?.length > 0) {
    filters.customerGroups.forEach(id => {
      const label = filterOptions.customerGroups?.find(g => g.value === id)?.label || id;
      pills.push({ key: 'customerGroups', value: id, label: `Group: ${label}` });
    });
  }

  if (filters.quoteStatuses?.length > 0) {
    filters.quoteStatuses.forEach(id => {
      const label = filterOptions.quoteStatuses?.find(s => s.value === id)?.label || id;
      pills.push({ key: 'quoteStatuses', value: id, label: `Status: ${label}` });
    });
  }

  if (filters.orderStatuses?.length > 0) {
    filters.orderStatuses.forEach(id => {
      pills.push({ key: 'orderStatuses', value: id, label: `Status: ${id}` });
    });
  }

  if (filters.paymentStatuses?.length > 0) {
    filters.paymentStatuses.forEach(id => {
      const label = id === 'outstanding' ? 'Outstanding' : 'Paid';
      pills.push({ key: 'paymentStatuses', value: id, label: `Payment: ${label}` });
    });
  }

  if (pills.length === 0) return null;

  const handleRemove = (key, value) => {
    const current = filters[key] || [];
    onRemove(key, current.filter(v => v !== value));
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {pills.map((pill, i) => (
        <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full border border-blue-100">
          {pill.label}
          <button onClick={() => handleRemove(pill.key, pill.value)}
            className="text-blue-400 hover:text-blue-700 font-bold leading-none">
            ×
          </button>
        </span>
      ))}
      <button onClick={onReset}
        className="text-xs text-gray-400 hover:text-gray-600 font-medium underline">
        Clear all
      </button>
    </div>
  );
}