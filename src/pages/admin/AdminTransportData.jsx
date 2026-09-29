import React, { useState } from 'react';

export default function AdminTransportData() {
  const [modes, setModes] = useState([
    { id: 'ev', name: 'Electric Vehicle', icon: 'electric_car', status: 'Active', capacity: '1-5 pax', source: 'System Data', sourceStatus: 'Up to date', isGreen: true },
    { id: 'bus', name: 'Public Bus', icon: 'directions_bus', status: 'Active', capacity: '40-80 pax', source: 'Transit Data', sourceStatus: 'Needs refresh', isGreen: false },
    { id: 'bike', name: 'Bicycle', icon: 'pedal_bike', status: 'Active', capacity: '1 pax', source: 'Static Model', sourceStatus: 'Verified', isGreen: true },
    { id: 'car', name: 'Car', icon: 'directions_car', status: 'Active', capacity: '1-5 pax', source: 'System Data', sourceStatus: 'Verified', isGreen: true },
    { id: 'motorcycle', name: 'Motorcycle', icon: 'two_wheeler', status: 'Active', capacity: '1-2 pax', source: 'System Data', sourceStatus: 'Verified', isGreen: true },
    { id: 'carpool', name: 'Carpool', icon: 'groups', status: 'Active', capacity: '2-4 pax', source: 'Shared Database', sourceStatus: 'Verified', isGreen: true }
  ]);

  const handleToggleModeStatus = (id) => {
    setModes(modes.map(m => m.id === id ? { ...m, status: m.status === 'Active' ? 'Disabled' : 'Active' } : m));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Transport Data Management</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Manage supported GreenMove transport modes, passenger capacities, data provenance, and operational status.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          GreenMove Supported Modes
        </span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-outline-variant bg-surface-container-low/50">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">directions_transit</span>
            <span>Supported Transport Modes & Capacities</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-lowest text-label-xs text-on-surface-variant uppercase font-semibold">
                <th className="py-3.5 px-4">Transport Mode</th>
                <th className="py-3.5 px-4">Operational Status</th>
                <th className="py-3.5 px-4">Passenger Capacity</th>
                <th className="py-3.5 px-4">Data Source & Provenance</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant text-body-md">
              {modes.map((m) => (
                <tr key={m.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-4 font-semibold text-on-surface">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                      </div>
                      <span>{m.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-label-xs font-bold">
                    <span className={`px-2.5 py-1 rounded-full border ${
                      m.status === 'Active'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-surface-container text-on-surface-variant border-outline-variant'
                    }`}>
                      {m.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{m.capacity}</td>
                  <td className="py-4 px-4 text-label-xs text-on-surface-variant">{m.source} ({m.sourceStatus})</td>
                  <td className="py-4 px-4 text-right">
                    <button
                      onClick={() => handleToggleModeStatus(m.id)}
                      className="px-3 py-1 bg-surface-variant hover:bg-surface-container text-label-xs font-semibold rounded-lg border border-outline-variant cursor-pointer transition-colors"
                    >
                      {m.status === 'Active' ? 'Disable' : 'Enable'}
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
