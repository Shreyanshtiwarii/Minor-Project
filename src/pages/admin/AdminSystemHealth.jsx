import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config';

export default function AdminSystemHealth() {
  const [healthItems, setHealthItems] = useState([]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/admin/system-health`)
      .then(res => res.json())
      .then(data => setHealthItems(data))
      .catch(err => console.warn('[AdminSystemHealth] Health fetch error:', err));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">System Health & Diagnostic Center</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Real-time monitoring for backend microservices, database, external API proxies, and infrastructure latency.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          GreenMove Operations
        </span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">favorite</span>
            <span>Infrastructure & Microservice Health</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Service / Component</th>
                <th className="py-3.5 px-4">Purpose</th>
                <th className="py-3.5 px-4">Health Status</th>
                <th className="py-3.5 px-4">Response Time</th>
                <th className="py-3.5 px-4">Diagnostic Message</th>
                <th className="py-3.5 px-4">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {healthItems.map((h, idx) => (
                <tr key={idx} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-4 font-semibold text-on-surface">{h.service}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{h.purpose}</td>
                  <td className="py-4 px-4 text-label-xs font-bold">
                    {h.status === 'HEALTHY' ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full flex items-center gap-1.5 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> 🟢 Healthy
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1.5 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span> 🟠 Pending Access
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface font-mono">{h.responseTime}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{h.details}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{h.lastChecked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
