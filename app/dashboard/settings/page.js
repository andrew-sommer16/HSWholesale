'use client';
import { useEffect, useState } from 'react';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useRouter } from 'next/navigation';

const ROLES = ['admin', 'manager', 'rep'];
const SYNC_INTERVALS = [
  { value: '1', label: 'Every hour' },
  { value: '2', label: 'Every 2 hours' },
  { value: '4', label: 'Every 4 hours' },
  { value: '8', label: 'Every 8 hours' },
  { value: '24', label: 'Once a day' },
];

const RoleBadge = ({ role }) => {
  const styles = {
    admin: 'bg-purple-50 text-purple-700',
    manager: 'bg-blue-50 text-blue-700',
    rep: 'bg-green-50 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[role] || 'bg-gray-100 text-gray-500'}`}>
      {role}
    </span>
  );
};

export default function SettingsPage() {
  const { user } = useCurrentUser();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('users');

  // User management state
  const [users, setUsers] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [passwordUser, setPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [invite, setInvite] = useState({ email: '', first_name: '', last_name: '', role: 'rep', bc_rep_id: '' });

  // Sync settings state
  const [syncSettings, setSyncSettings] = useState({
    sync_interval_hours: '4',
    scheduled_sync_enabled: true,
  });
  const [syncSaving, setSyncSaving] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'admin') router.push('/dashboard');
  }, [user]);

  useEffect(() => {
    loadUsers();
    fetch(`/api/reports/sales-reps?store_hash=${user?.store_hash}`)
      .then(r => r.json())
      .then(d => setSalesReps(d.reps || []));
    loadSyncSettings();
  }, [user]);

  const loadUsers = async () => {
    setLoading(true);
    const res = await fetch(`/api/app-auth/users?store_hash=${user?.store_hash}`);
    const d = await res.json();
    setUsers(d.users || []);
    setLoading(false);
  };

  const loadSyncSettings = async () => {
    const res = await fetch('/api/sync/settings');
    const d = await res.json();
    if (!d.error) setSyncSettings(d);
  };

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveSyncSettings = async () => {
    setSyncSaving(true);
    const res = await fetch('/api/sync/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncSettings),
    });
    const d = await res.json();
    setSyncSaving(false);
    if (d.success) {
      showMessage('Sync settings saved — update vercel.json with the cron schedule shown below.');
    } else {
      showMessage(d.error || 'Failed to save', 'error');
    }
  };

  const handleInvite = async () => {
    if (!invite.email) return;
    setSaving(true);
    const res = await fetch('/api/app-auth/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...invite, store_hash: user?.store_hash }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      showMessage(`Invite sent to ${invite.email}`);
      setInviteOpen(false);
      setInvite({ email: '', first_name: '', last_name: '', role: 'rep', bc_rep_id: '' });
      loadUsers();
    } else {
      showMessage(d.error || 'Invite failed', 'error');
    }
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    setSaving(true);
    const res = await fetch('/api/app-auth/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingUser),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      showMessage('User updated');
      setEditingUser(null);
      loadUsers();
    } else {
      showMessage(d.error || 'Update failed', 'error');
    }
  };

  const handleToggleActive = async (u) => {
    const res = await fetch('/api/app-auth/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: u.id, is_active: !u.is_active }),
    });
    const d = await res.json();
    if (d.success) {
      showMessage(`User ${u.is_active ? 'deactivated' : 'reactivated'}`);
      loadUsers();
    }
  };

  const handleSetPassword = async () => {
    if (!passwordUser || !newPassword) return;
    setSaving(true);
    const res = await fetch('/api/app-auth/set-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: passwordUser.email, password: newPassword }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      showMessage('Password updated');
      setPasswordUser(null);
      setNewPassword('');
    } else {
      showMessage(d.error || 'Failed to update password', 'error');
    }
  };

  const cronSchedule = {
    '1': '0 * * * *',
    '2': '0 */2 * * *',
    '4': '0 */4 * * *',
    '8': '0 */8 * * *',
    '24': '0 0 * * *',
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 mt-1">Manage users and sync schedule</p>
        </div>
        {activeTab === 'users' && (
          <button onClick={() => setInviteOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            + Invite User
          </button>
        )}
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium mb-6 w-fit">
        {[{ key: 'users', label: '👥 User Management' }, { key: 'sync', label: '🔄 Sync Settings' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-5 py-2.5 transition-colors ${activeTab === t.key ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── USER MANAGEMENT TAB ── */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3 text-left">Name</th>
                <th className="px-6 py-3 text-left">Email</th>
                <th className="px-6 py-3 text-left">Role</th>
                <th className="px-6 py-3 text-left">Sales Rep</th>
                <th className="px-6 py-3 text-left">Status</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400">Loading...</td></tr>
              ) : users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 font-medium text-gray-900">{u.first_name} {u.last_name}</td>
                  <td className="px-6 py-4 text-gray-500">{u.email}</td>
                  <td className="px-6 py-4"><RoleBadge role={u.role} /></td>
                  <td className="px-6 py-4 text-gray-500 text-xs">{u.bc_rep_id ? `Rep #${u.bc_rep_id}` : '—'}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingUser({ ...u })} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                      <button onClick={() => { setPasswordUser(u); setNewPassword(''); }} className="text-xs text-gray-500 hover:text-gray-700 font-medium">Password</button>
                      <button onClick={() => handleToggleActive(u)}
                        className={`text-xs font-medium ${u.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-600 hover:text-green-800'}`}>
                        {u.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── SYNC SETTINGS TAB ── */}
      {activeTab === 'sync' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Scheduled Sync</h2>
                <p className="text-sm text-gray-500 mt-0.5">Automatically sync all data on a set interval via Vercel cron</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only"
                    checked={syncSettings.scheduled_sync_enabled}
                    onChange={e => setSyncSettings(s => ({ ...s, scheduled_sync_enabled: e.target.checked }))} />
                  <div className={`w-10 h-6 rounded-full transition-colors ${syncSettings.scheduled_sync_enabled ? 'bg-blue-600' : 'bg-gray-200'}`} />
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${syncSettings.scheduled_sync_enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                </div>
                <span className="text-sm text-gray-600">{syncSettings.scheduled_sync_enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Sync Interval</label>
              <div className="flex gap-2 flex-wrap">
                {SYNC_INTERVALS.map(opt => (
                  <button key={opt.value} onClick={() => setSyncSettings(s => ({ ...s, sync_interval_hours: opt.value }))}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${syncSettings.sync_interval_hours === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Minimum interval is 1 hour on Vercel Hobby plan. Upgrade to Vercel Pro for more frequent syncs.</p>
            </div>

            {syncSettings.scheduled_sync_enabled && (
              <div className="bg-gray-50 rounded-lg p-4 mb-5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Update vercel.json with this cron schedule:</p>
                <pre className="text-xs text-gray-700 font-mono bg-white border border-gray-200 rounded p-3 overflow-x-auto">{JSON.stringify({
                  crons: [{
                    path: `/api/sync/trigger?secret=$\{CRON_SECRET\}`,
                    schedule: cronSchedule[syncSettings.sync_interval_hours]
                  }]
                }, null, 2)}</pre>
              </div>
            )}

            <button onClick={handleSaveSyncSettings} disabled={syncSaving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {syncSaving ? 'Saving...' : 'Save Schedule'}
            </button>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Invite User</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">First Name</label>
                  <input value={invite.first_name} onChange={e => setInvite(p => ({ ...p, first_name: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Name</label>
                  <input value={invite.last_name} onChange={e => setInvite(p => ({ ...p, last_name: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Email</label>
                <input type="email" value={invite.email} onChange={e => setInvite(p => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Role</label>
                <select value={invite.role} onChange={e => setInvite(p => ({ ...p, role: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {invite.role === 'rep' && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Link to Sales Rep</label>
                  <select value={invite.bc_rep_id} onChange={e => setInvite(p => ({ ...p, bc_rep_id: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— None —</option>
                    {salesReps.map(r => (
                      <option key={r.bc_rep_id} value={r.bc_rep_id}>{r.first_name} {r.last_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleInvite} disabled={saving}
                className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Sending...' : 'Send Invite'}
              </button>
              <button onClick={() => setInviteOpen(false)}
                className="flex-1 border border-gray-200 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit User</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">First Name</label>
                  <input value={editingUser.first_name || ''} onChange={e => setEditingUser(p => ({ ...p, first_name: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Last Name</label>
                  <input value={editingUser.last_name || ''} onChange={e => setEditingUser(p => ({ ...p, last_name: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Role</label>
                <select value={editingUser.role} onChange={e => setEditingUser(p => ({ ...p, role: e.target.value }))}
                  className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              {editingUser.role === 'rep' && (
                <div>
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">Link to Sales Rep</label>
                  <select value={editingUser.bc_rep_id || ''} onChange={e => setEditingUser(p => ({ ...p, bc_rep_id: e.target.value }))}
                    className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">— None —</option>
                    {salesReps.map(r => (
                      <option key={r.bc_rep_id} value={r.bc_rep_id}>{r.first_name} {r.last_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleUpdateUser} disabled={saving}
                className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingUser(null)}
                className="flex-1 border border-gray-200 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set Password Modal */}
      {passwordUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Set Password</h2>
            <p className="text-sm text-gray-500 mb-4">{passwordUser.email}</p>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">New Password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSetPassword} disabled={saving || newPassword.length < 8}
                className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Set Password'}
              </button>
              <button onClick={() => { setPasswordUser(null); setNewPassword(''); }}
                className="flex-1 border border-gray-200 text-sm font-medium py-2 rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';