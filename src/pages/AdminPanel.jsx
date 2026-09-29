import React, { useState } from 'react';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState('Transport Data');

  const modes = [
    { name: 'Electric Vehicle', icon: 'electric_car', status: 'Active', capacity: '1-5 pax', source: 'Demo Dataset', sourceStatus: 'Up to date', isGreen: true },
    { name: 'Public Bus', icon: 'directions_bus', status: 'Active', capacity: '40-80 pax', source: 'City Transit API', sourceStatus: 'Needs refresh', isGreen: false },
    { name: 'Bicycle', icon: 'pedal_bike', status: 'Active', capacity: '1 pax', source: 'Static Model', sourceStatus: 'Verified', isGreen: true }
  ];

  const factors = [
    { category: 'Car, Petrol', factor: '0.18', unit: 'kg CO2e / km', source: 'DEFRA 2023' },
    { category: 'Car, Diesel', factor: '0.17', unit: 'kg CO2e / km', source: 'DEFRA 2023' },
    { category: 'Local Bus (Avg)', factor: '0.10', unit: 'kg CO2e / p.km', source: 'EPA Transport' }
  ];

  return (
    <main className="flex-1 pt-24 p-md lg:p-lg lg:pt-28 flex flex-col gap-lg max-w-7xl mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-primary text-2xl font-bold">admin_panel_settings</span>
            <h2 className="text-headline-lg font-headline-lg text-on-surface">System Administration</h2>
          </div>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            Manage core routing data, emission factors, and operational metrics.
            <span className="text-primary font-semibold block text-label-xs mt-1">GreenMove — Every Move Shapes Tomorrow.</span>
          </p>
        </div>
        {/* Admin Sub-navigation (Pills) */}
        <div className="flex flex-wrap items-center gap-2">
          {['Transport Data', 'Users & Access', 'Integrations'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-label-sm font-label-sm px-4 py-2 rounded-full transition-colors cursor-pointer ${
                activeTab === tab 
                  ? 'bg-primary text-on-primary shadow-md' 
                  : 'bg-surface-container-highest hover:bg-surface-variant text-on-surface-variant'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs (Dashboard Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1 */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-sm lg:p-md shadow-sm flex flex-col relative overflow-hidden group hover:border-primary-container transition-colors">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary-fixed opacity-20 rounded-full blur-2xl group-hover:bg-secondary-fixed transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined">group</span>
            </div>
            <span className="bg-surface-container-low text-on-surface-variant text-label-xs font-label-xs px-2 py-1 rounded-md flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-primary">trending_up</span> +12%
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-label-sm font-label-sm text-on-surface-variant mb-1">Active Users</p>
            <p className="text-display-metrics font-display-metrics text-on-surface">1,248</p>
          </div>
        </div>
        {/* Card 2 */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-sm lg:p-md shadow-sm flex flex-col relative overflow-hidden group hover:border-primary-container transition-colors">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary-fixed opacity-20 rounded-full blur-2xl group-hover:bg-secondary-fixed transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined">co2</span>
            </div>
            <span className="bg-surface-container-low text-on-surface-variant text-label-xs font-label-xs px-2 py-1 rounded-md flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-primary">trending_up</span> +0.4t
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-label-sm font-label-sm text-on-surface-variant mb-1">CO2 Saved (Monthly)</p>
            <p className="text-display-metrics font-display-metrics text-on-surface">2.8 <span className="text-headline-md text-outline">tons</span></p>
          </div>
        </div>
        {/* Card 3 */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-sm lg:p-md shadow-sm flex flex-col relative overflow-hidden group hover:border-primary-container transition-colors">
          <div className="absolute -right-6 -top-6 w-32 h-32 bg-primary-fixed opacity-20 rounded-full blur-2xl group-hover:bg-secondary-fixed transition-colors"></div>
          <div className="flex justify-between items-start mb-4 relative z-10">
            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined">directions_car</span>
            </div>
            <span className="bg-surface-container-low text-on-surface-variant text-label-xs font-label-xs px-2 py-1 rounded-md flex items-center gap-1">
              Live
            </span>
          </div>
          <div className="relative z-10">
            <p className="text-label-sm font-label-sm text-on-surface-variant mb-1">Carpool Matches</p>
            <p className="text-display-metrics font-display-metrics text-on-surface">642</p>
          </div>
        </div>
      </div>

      {/* Tables Section (Bento Layout) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Table 1: Transport Modes */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-sm lg:p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
            <h3 className="text-headline-md font-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-outline">directions_transit</span>
              Transport Modes
            </h3>
            <button className="text-primary hover:bg-surface-container-high p-2 rounded-lg transition-colors cursor-pointer">
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-lowest">
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Mode</th>
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Status</th>
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Capacity</th>
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Data Source</th>
                </tr>
              </thead>
              <tbody className="text-body-md font-body-md divide-y divide-outline-variant">
                {modes.map((mode, index) => (
                  <tr key={index} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-4 px-sm lg:px-md">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-[18px]">{mode.icon}</span>
                        </div>
                        <span className="text-on-surface font-medium">{mode.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-sm lg:px-md">
                      <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-surface-container-low border border-primary-container text-primary-container text-label-xs font-label-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-container"></span> {mode.status}
                      </span>
                    </td>
                    <td className="py-4 px-sm lg:px-md text-on-surface-variant">{mode.capacity}</td>
                    <td className="py-4 px-sm lg:px-md">
                      <div className="flex flex-col">
                        <span className="text-on-surface text-sm">{mode.source}</span>
                        <span className={`text-label-xs font-label-xs mt-0.5 flex items-center gap-1 ${mode.isGreen ? 'text-primary' : 'text-error'}`}>
                          <span className="material-symbols-outlined text-[12px]">{mode.isGreen ? 'check_circle' : 'warning'}</span> 
                          {mode.sourceStatus}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Emission Factors */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-sm lg:p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50">
            <h3 className="text-headline-md font-headline-md text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-outline">factory</span>
              Emission Factors
            </h3>
            <button className="text-primary hover:bg-surface-container-high p-2 rounded-lg transition-colors cursor-pointer">
              <span className="material-symbols-outlined">download</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant bg-surface-container-lowest">
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Category</th>
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Factor</th>
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Unit</th>
                  <th className="py-3 px-sm lg:px-md text-label-sm font-label-sm text-on-surface-variant font-semibold">Provenance</th>
                </tr>
              </thead>
              <tbody className="text-body-md font-body-md divide-y divide-outline-variant">
                {factors.map((factor, index) => (
                  <tr key={index} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-4 px-sm lg:px-md font-medium text-on-surface">{factor.category}</td>
                    <td className="py-4 px-sm lg:px-md text-on-surface-variant">{factor.factor}</td>
                    <td className="py-4 px-sm lg:px-md">
                      <span className="bg-surface-container-high text-on-surface-variant px-2 py-1 rounded text-label-xs font-label-xs">{factor.unit}</span>
                    </td>
                    <td className="py-4 px-sm lg:px-md">
                      <div className="text-sm text-on-surface">{factor.source}</div>
                      <a className="text-label-xs font-label-xs text-primary hover:underline mt-0.5 inline-block" href="#">View Source</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-sm border-t border-outline-variant bg-surface-container-low/30 text-center">
            <button className="text-label-sm font-label-sm text-primary hover:text-primary-container transition-colors font-medium cursor-pointer">
              View All Emission Factors
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
