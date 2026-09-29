import React from 'react';

export default function AdminHeader() {
  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-40 border-b border-outline-variant shadow-sm flex justify-between items-center h-16 px-md w-full">
      <div className="flex items-center gap-3">
        <h2 className="text-headline-md font-headline-md font-bold text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-2xl">admin_panel_settings</span>
          <span>GreenMove Admin</span>
        </h2>
        <span className="bg-primary/10 text-primary text-label-xs px-2.5 py-0.5 rounded-full font-bold border border-primary/20 hidden sm:inline-block">
          System Control Center
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-label-xs text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="font-semibold text-on-surface">System Online</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-label-sm shadow-sm border border-outline-variant">
          A
        </div>
      </div>
    </header>
  );
}
