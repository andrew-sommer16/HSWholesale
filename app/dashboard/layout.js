'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
 
const navItems = [
  { href: '/dashboard', label: 'Overview', icon: '📊' },
  { href: '/dashboard/companies', label: 'Companies & Accounts', icon: '🏢' },
  { href: '/dashboard/at-risk', label: 'At-Risk Companies', icon: '⚠️' },
  { href: '/dashboard/quotes', label: 'Quotes', icon: '💬' },
  { href: '/dashboard/quote-expiry', label: 'Quote Expiry Alerts', icon: '⏰' },
  { href: '/dashboard/net-terms', label: 'Net Terms & Payments', icon: '💳' },
  { href: '/dashboard/orders', label: 'Orders', icon: '📦' },
  { href: '/dashboard/sales-reps', label: 'Sales Reps', icon: '👤' },
  { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
];
 
const GLOBAL_PARAMS = ['companies', 'customerGroups', 'salesReps', 'dateFrom', 'dateTo'];
 
function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
 
export const dynamic = 'force-dynamic';
 
export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
 
  useEffect(() => {
    fetch('/api/app-auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.error) router.push('/login');
        else setUser(data.user);
      })
      .catch(() => router.push('/login'));
  }, []);
 
  useEffect(() => {
    if (!user?.store_hash) return;
    fetchSyncStatus();
    const interval = setInterval(fetchSyncStatus, 30000);
    return () => clearInterval(interval);
  }, [user]);
 
  const fetchSyncStatus = () => {
    const storeHash = user?.store_hash;
    fetch(`/api/sync/status?store_hash=${storeHash}`)
      .then(r => r.json())
      .then(d => setSyncStatus(d.lastSync))
      .catch(() => {});
  };
 
  const handleSync = async (fullSync = false) => {
    setSyncing(true);
    try {
      const storeHash = user?.store_hash;
      await fetch('/api/sync/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_hash: storeHash, full_sync: fullSync }),
      });
      await fetchSyncStatus();
      router.refresh();
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setSyncing(false);
    }
  };
 
  const handleLogout = async () => {
    await fetch('/api/app-auth/logout', { method: 'POST' });
    router.push('/login');
  };
 
  const syncStatusColor = () => {
    if (!syncStatus) return 'bg-gray-300';
    if (syncStatus.status === 'running') return 'bg-yellow-400';
    if (syncStatus.status === 'success') return 'bg-green-400';
    if (syncStatus.status === 'partial') return 'bg-yellow-400';
    return 'bg-red-400';
  };
 
  const buildNavHref = (href) => {
    const params = new URLSearchParams();
    GLOBAL_PARAMS.forEach(key => {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    });
    const qs = params.toString();
    return qs ? `${href}?${qs}` : href;
  };
 
  const activeGlobalFilters = GLOBAL_PARAMS.filter(key =>
    key !== 'dateFrom' && key !== 'dateTo' && searchParams.get(key)
  ).length;
 
  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-64 bg-white shadow-sm flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">B2B Analytics</h1>
          <p className="text-xs text-gray-500 mt-1">BigCommerce B2B Edition</p>
        </div>
 
        {activeGlobalFilters > 0 && (
          <div className="mx-4 mt-3 px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg flex items-center justify-between">
            <span className="text-xs text-blue-700 font-medium">
              {activeGlobalFilters} filter{activeGlobalFilters > 1 ? 's' : ''} active
            </span>
            <button onClick={() => router.push(pathname)} className="text-xs text-blue-500 hover:text-blue-700 font-medium">
              Clear
            </button>
          </div>
        )}
 
        <nav className="flex-1 p-4 space-y-1">
          {navItems.filter(item => {
            if (item.href === '/dashboard/settings') return user?.role === 'admin';
            return true;
          }).map(item => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={buildNavHref(item.href)}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
 
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${syncStatusColor()}`} />
            <span className="text-xs text-gray-500">
              {syncing ? 'Syncing...' : `Synced ${timeAgo(syncStatus?.completed_at)}`}
            </span>
          </div>
          <div className="flex gap-1">
            <button onClick={() => handleSync(false)} disabled={syncing}
              className={`flex-1 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                syncing ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed' : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}>
              {syncing ? '⏳ Syncing...' : '🔄 Sync Now'}
            </button>
            {!syncing && (
              <button onClick={() => handleSync(true)}
                title="Full sync — pulls all data from scratch"
                className="text-xs font-medium px-2 py-1.5 rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
                ↺
              </button>
            )}
          </div>
        </div>
 
        <div className="p-4 border-t border-gray-200">
          {user && (
            <div className="mb-3">
              <p className="text-sm font-medium text-gray-900">{user.first_name} {user.last_name}</p>
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>
          )}
          <button onClick={handleLogout} className="w-full text-left text-sm text-gray-500 hover:text-gray-900">
            Sign out
          </button>
        </div>
      </div>
 
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-gray-400 text-sm">Loading...</div></div>}>
          {children}
        </Suspense>
      </div>
    </div>
  );
}