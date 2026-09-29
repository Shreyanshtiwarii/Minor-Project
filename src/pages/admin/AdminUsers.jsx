import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.warn('[AdminUsers] Failed to load users from backend:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const res = await fetch(`http://localhost:8080/api/v1/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Role': 'ADMIN' },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        setActionMsg(`Updated user status to ${newStatus}`);
        fetchUsers();
      }
    } catch (err) {
      console.error('[AdminUsers] Update status failed:', err);
    }
  };

  const handleToggleRole = async (userId, currentRole) => {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    try {
      const res = await fetch(`http://localhost:8080/api/v1/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Role': 'ADMIN' },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        setActionMsg(`Updated user role to ${newRole}`);
        fetchUsers();
      }
    } catch (err) {
      console.error('[AdminUsers] Update role failed:', err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Users & Access Management</h1>
          <p className="text-body-md text-on-surface-variant mt-1">Inspect application user accounts, manage roles, and enforce access controls.</p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          GreenMove Security
        </span>
      </div>

      {actionMsg && (
        <div className="bg-emerald-50 text-emerald-800 border border-emerald-300 p-3 rounded-xl text-label-xs flex justify-between items-center">
          <span>{actionMsg}</span>
          <button onClick={() => setActionMsg(null)} className="font-bold text-xs">✕</button>
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">group</span>
            <span>Registered Accounts Directory ({users.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Name & Email</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Joined Date</th>
                <th className="py-3.5 px-4">Last Active</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-4">
                    <p className="font-semibold text-on-surface">{u.name}</p>
                    <p className="text-label-xs text-on-surface-variant">{u.email}</p>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-label-xs font-bold border ${
                      u.role === 'ADMIN'
                        ? 'bg-purple-50 text-purple-800 border-purple-300'
                        : 'bg-surface-container text-on-surface-variant border-outline-variant'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`px-2.5 py-1 rounded-full text-label-xs font-bold border ${
                      u.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-error-container/20 text-error border-error/30'
                    }`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{u.joinedDate}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{u.lastActive}</td>
                  <td className="py-4 px-4 text-right space-x-2">
                    <button
                      onClick={() => handleToggleRole(u.id, u.role)}
                      className="px-3 py-1 bg-surface-variant hover:bg-surface-container text-on-surface text-label-xs rounded-lg border border-outline-variant cursor-pointer transition-colors"
                    >
                      Toggle Role
                    </button>
                    <button
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      className={`px-3 py-1 text-label-xs rounded-lg cursor-pointer transition-colors border ${
                        u.status === 'ACTIVE'
                          ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                      }`}
                    >
                      {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
