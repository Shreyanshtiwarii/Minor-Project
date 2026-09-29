import React from 'react';

export default function AdminProfile() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center pb-4 border-b border-outline-variant">
        <div>
          <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold">Admin Profile Settings</h1>
          <p className="text-body-md text-on-surface-variant mt-1">
            System Administrator credentials, session configurations, and security preferences.
          </p>
        </div>
        <span className="text-label-xs font-semibold text-primary bg-primary/10 px-3 py-1 rounded-lg border border-primary/20">
          GreenMove Security
        </span>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm max-w-2xl space-y-4">
        <div className="flex items-center gap-4 border-b border-outline-variant/40 pb-4">
          <div className="w-16 h-16 rounded-full bg-primary text-on-primary font-bold text-headline-md flex items-center justify-center border-2 border-primary/30">
            A
          </div>
          <div>
            <h3 className="text-headline-sm font-bold text-on-surface">GreenMove System Administrator</h3>
            <p className="text-label-xs text-on-surface-variant">admin@greenmove.com • Role: ADMIN</p>
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-full text-[11px] font-bold">
              Authenticated Admin Session
            </span>
          </div>
        </div>

        <div className="space-y-3 text-body-md">
          <div className="flex justify-between py-2 border-b border-outline-variant/20">
            <span className="text-label-xs font-semibold text-on-surface-variant">Username</span>
            <span className="text-label-sm font-bold text-on-surface">admin</span>
          </div>
          <div className="flex justify-between py-2 border-b border-outline-variant/20">
            <span className="text-label-xs font-semibold text-on-surface-variant">Access Control Level</span>
            <span className="text-label-sm font-bold text-primary">FULL_SYSTEM_ADMIN</span>
          </div>
          <div className="flex justify-between py-2 border-b border-outline-variant/20">
            <span className="text-label-xs font-semibold text-on-surface-variant">Session Isolation</span>
            <span className="text-label-sm font-bold text-emerald-700">Enforced (Separate Admin Context)</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-label-xs font-semibold text-on-surface-variant">Tagline</span>
            <span className="text-label-sm font-bold text-primary">Every Move Shapes Tomorrow.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
