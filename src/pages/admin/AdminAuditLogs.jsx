import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/audit-logs`)
      .then(res => res.json())
      .then(data => setLogs(data))
      .catch(err => console.warn('[AdminAuditLogs] Audit logs fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">System Audit Logs</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Immutable system activity log recording administrator actions, price adjustments, emission factor changes, and security events.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          Security Audited
        </span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50 flex justify-between items-center">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">receipt_long</span>
            <span>Recorded Administrator Activity ({logs.length})</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Timestamp</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Action</th>
                <th className="py-3.5 px-4">Entity</th>
                <th className="py-3.5 px-4">Event Details</th>
                <th className="py-3.5 px-4">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-label-xs text-on-surface-variant animate-pulse">
                    Loading system audit trail...
                  </td>
                </tr>
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-4 px-4 text-label-xs text-on-surface-variant font-mono">{log.timestamp}</td>
                    <td className="py-4 px-4 font-semibold text-on-surface text-label-xs">{log.actor}</td>
                    <td className="py-4 px-4 font-bold text-primary text-label-xs">{log.action}</td>
                    <td className="py-4 px-4 text-label-xs text-on-surface-variant">{log.entityName}</td>
                    <td className="py-4 px-4 text-label-xs text-on-surface">{log.details}</td>
                    <td className="py-4 px-4 text-label-xs font-bold">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded">
                        {log.result}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-label-xs text-on-surface-variant">
                    No audit records recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
