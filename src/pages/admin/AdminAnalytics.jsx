import React from 'react';

export default function AdminAnalytics() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">System Analytics & Growth</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            Aggregated system usage metrics, route growth analytics, and modal share breakdown across GreenMove.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          GreenMove Platform Intelligence
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-3">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">trending_up</span>
            <span>Monthly Active Route Queries</span>
          </h3>
          <div className="p-4 bg-surface-container-low rounded-xl border border-outline-variant/30 space-y-2">
            <div className="flex justify-between text-label-xs font-semibold">
              <span>Driving & EV Routes</span>
              <span className="text-primary">4,210 queries (48%)</span>
            </div>
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[48%] rounded-full"></div>
            </div>

            <div className="flex justify-between text-label-xs font-semibold pt-2">
              <span>Carpool Shared Matches</span>
              <span className="text-primary">2,640 queries (30%)</span>
            </div>
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-emerald-600 w-[30%] rounded-full"></div>
            </div>

            <div className="flex justify-between text-label-xs font-semibold pt-2">
              <span>Cycling & Walking</span>
              <span className="text-primary">1,792 queries (22%)</span>
            </div>
            <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
              <div className="h-full bg-amber-500 w-[22%] rounded-full"></div>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-3">
          <h3 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">co2</span>
            <span>Verified CO₂ Reduction Distribution</span>
          </h3>
          <div className="space-y-3 text-body-md">
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 flex justify-between items-center">
              <span className="text-label-xs font-semibold">EV Charging & Range Routing</span>
              <span className="text-headline-sm font-bold text-primary">1.2 tons CO₂ saved</span>
            </div>
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 flex justify-between items-center">
              <span className="text-label-xs font-semibold">Carpool Occupancy Optimization</span>
              <span className="text-headline-sm font-bold text-emerald-700">1.1 tons CO₂ saved</span>
            </div>
            <div className="p-3 bg-surface-container-low rounded-xl border border-outline-variant/30 flex justify-between items-center">
              <span className="text-label-xs font-semibold">Active Cycling & Walking</span>
              <span className="text-headline-sm font-bold text-secondary">0.5 tons CO₂ saved</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
