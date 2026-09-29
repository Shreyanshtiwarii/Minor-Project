import React from 'react';

export default function DeveloperHeader() {
  return (
    <header className="bg-surface/80 backdrop-blur-md sticky top-0 z-40 border-b border-outline-variant shadow-sm flex justify-between items-center h-16 px-md w-full">
      <div className="flex items-center gap-3">
        <h2 className="text-headline-md font-headline-md font-bold text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-2xl">terminal</span>
          <span>GreenMove Developer Panel</span>
        </h2>
        <span className="bg-purple-50 text-purple-800 border border-purple-300 text-label-xs px-2.5 py-0.5 rounded-full font-bold hidden sm:inline-block">
          Development Control Center
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-label-xs text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-lg border border-outline-variant/30">
          <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse"></span>
          <span className="font-semibold text-on-surface">Debug Mode Active</span>
        </div>

        <div className="w-8 h-8 rounded-full bg-purple-700 text-on-primary flex items-center justify-center font-bold text-label-sm shadow-sm border border-outline-variant">
          D
        </div>
      </div>
    </header>
  );
}
