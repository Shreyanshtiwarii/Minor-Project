import React, { useState, useEffect } from 'react';

export default function AdminIntegrations() {
  const [integrations, setIntegrations] = useState([]);

  useEffect(() => {
    fetch('http://localhost:8080/api/v1/admin/integrations')
      .then(res => res.json())
      .then(data => setIntegrations(data))
      .catch(err => console.warn('[AdminIntegrations] Failed to fetch integrations:', err));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Integrations & API Monitoring</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Centralized status monitoring for GreenMove external service providers and credentials.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          Security Protected
        </span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">api</span>
            <span>External Service Providers</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Provider / API</th>
                <th className="py-3.5 px-4">Purpose</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Configuration State</th>
                <th className="py-3.5 px-4">Last Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {integrations.map((item, idx) => (
                <tr key={idx} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-4 font-semibold text-on-surface">{item.provider}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{item.purpose}</td>
                  <td className="py-4 px-4 text-label-xs font-bold">
                    {item.status === 'HEALTHY' ? (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full flex items-center gap-1.5 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Healthy
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 rounded-full flex items-center gap-1.5 w-max">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span> Pending Access
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{item.configStatus}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{item.lastChecked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
