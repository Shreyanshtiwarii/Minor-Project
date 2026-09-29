import React from 'react';

export default function AdminTransitData() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Transit Data Monitoring</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Public transit coverage, GTFS feed status, and municipal transit integration status.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-amber-800 bg-amber-50 px-3 py-1 rounded-lg border border-amber-300">
          Limited Coverage
        </span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-4">
        <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">directions_bus</span>
          <span>Municipal Transit Feed Status</span>
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">City / Region</th>
                <th className="py-3.5 px-4">Transit Provider</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Data Coverage</th>
                <th className="py-3.5 px-4">Last Sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              <tr className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-4 px-4 font-semibold text-on-surface">Indore</td>
                <td className="py-4 px-4 text-label-xs text-on-surface-variant">AICTSL City Bus</td>
                <td className="py-4 px-4 text-label-xs">
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-300 rounded font-semibold">
                    Limited
                  </span>
                </td>
                <td className="py-4 px-4 text-label-xs text-on-surface-variant">Major Route Corridors</td>
                <td className="py-4 px-4 text-label-xs text-on-surface-variant">Static Schedule Benchmark</td>
              </tr>
              <tr className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-4 px-4 font-semibold text-on-surface">Bhopal</td>
                <td className="py-4 px-4 text-label-xs text-on-surface-variant">BCLL Transit</td>
                <td className="py-4 px-4 text-label-xs">
                  <span className="px-2 py-0.5 bg-surface-container text-on-surface-variant border border-outline-variant rounded font-semibold">
                    Not Configured
                  </span>
                </td>
                <td className="py-4 px-4 text-label-xs text-on-surface-variant">Unavailable</td>
                <td className="py-4 px-4 text-label-xs text-on-surface-variant">N/A</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
