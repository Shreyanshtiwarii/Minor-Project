import React, { useState, useEffect } from 'react';

export default function DeveloperDashboard() {
  const [diag, setDiag] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8080/api/v1/developer/diagnostics')
      .then(res => res.json())
      .then(data => setDiag(data))
      .catch(err => console.warn('[DeveloperDashboard] Diagnostics fetch error:', err));

    fetch('http://localhost:8080/api/v1/developer/logs')
      .then(res => res.json())
      .then(data => setLogs(data))
      .catch(err => console.warn('[DeveloperDashboard] Logs fetch error:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Developer Control Center</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Application diagnostics, environment configurations, API connectivity matrices, and JVM telemetry.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-purple-800 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-300 self-start md:self-auto">
          GreenMove — Every Move Shapes Tomorrow.
        </span>
      </div>

      {/* Overview Diagnostics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-label-xs uppercase font-semibold text-on-surface-variant">Active Profile</span>
          <p className="text-headline-lg font-bold text-primary">{diag?.application?.activeProfile || 'test'}</p>
          <p className="text-[11px] text-on-surface-variant">Server Port: {diag?.application?.serverPort || '8080'}</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-label-xs uppercase font-semibold text-on-surface-variant">JVM Uptime</span>
          <p className="text-headline-lg font-bold text-on-surface">{diag?.jvm?.uptimeFormatted || 'Active'}</p>
          <p className="text-[11px] text-emerald-700 font-semibold">Java Runtime 21.0.11</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-label-xs uppercase font-semibold text-on-surface-variant">Heap Memory</span>
          <p className="text-headline-lg font-bold text-on-surface">{diag?.jvm?.heapMemoryUsedMb || '0'} MB</p>
          <p className="text-[11px] text-on-surface-variant">Max Allocated: {diag?.jvm?.heapMemoryMaxMb || '4096'} MB</p>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-5 shadow-sm space-y-1">
          <span className="text-label-xs uppercase font-semibold text-on-surface-variant">Active Threads</span>
          <p className="text-headline-lg font-bold text-purple-700">{diag?.jvm?.threadCount || '32'}</p>
          <p className="text-[11px] text-purple-800 font-semibold">Executors & Workers</p>
        </div>
      </div>

      {/* Developer Log Stream */}
      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-outline-variant/40 pb-3">
          <h3 className="text-headline-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">terminal</span>
            <span>Application Debug Log Stream</span>
          </h3>
          <span className="text-label-xs text-on-surface-variant font-mono">DEBUG_LOG_LEVEL=DEBUG</span>
        </div>

        <div className="bg-zinc-950 text-zinc-100 rounded-xl p-4 font-mono text-xs space-y-2 overflow-x-auto">
          {logs.map((log, idx) => (
            <div key={idx} className="flex gap-3">
              <span className="text-zinc-500">{log.timestamp}</span>
              <span className={log.level === 'WARN' ? 'text-amber-400 font-bold' : log.level === 'ERROR' ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                [{log.level}]
              </span>
              <span className="text-zinc-400">{log.logger}:</span>
              <span>{log.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
