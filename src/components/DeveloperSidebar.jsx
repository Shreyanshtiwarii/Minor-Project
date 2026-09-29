import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import LogoutConfirmDialog from './LogoutConfirmDialog';

export default function DeveloperSidebar() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleDeveloperLogout = () => {
    localStorage.removeItem('developerToken');
    localStorage.removeItem('developerRole');
    navigate('/developer/login');
  };

  const devNavItems = [
    { name: 'Diagnostics Overview', path: '/developer', icon: 'developer_board' },
    { name: 'API Connection Matrix', path: '/developer/api-matrix', icon: 'api' },
    { name: 'JVM & System Health', path: '/developer/jvm-health', icon: 'memory' },
    { name: 'Application Log Stream', path: '/developer/logs', icon: 'terminal' },
    { name: 'Build & Environment', path: '/developer/build-info', icon: 'settings_system_daydream' }
  ];

  return (
    <nav className="hidden md:flex flex-col h-full py-md bg-surface-container fixed left-0 top-0 w-[260px] border-r border-outline-variant z-50">
      {/* Branding */}
      <div className="px-md mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
        <div>
          <h1 className="text-headline-md font-headline-md font-bold text-primary">GreenMove</h1>
          <p className="text-[11px] font-label-xs text-on-surface-variant font-semibold">Every Move Shapes Tomorrow.</p>
        </div>
      </div>

      <div className="px-3 mb-3">
        <div className="bg-purple-900/10 text-purple-700 border border-purple-300 rounded-lg px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs">terminal</span>
          <span>DEVELOPER CONTROL CENTER</span>
        </div>
      </div>

      {/* Developer Navigation Items */}
      <div className="flex-1 overflow-y-auto pt-2 flex flex-col gap-1 px-2 custom-scrollbar">
        {devNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/developer'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-label-sm font-label-sm transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
            <span>{item.name}</span>
          </NavLink>
        ))}
      </div>

      {/* Footer Developer Logout */}
      <div className="pt-3 border-t border-outline-variant px-2 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-label-sm font-label-sm text-error hover:bg-error-container/20 transition-colors cursor-pointer text-left w-full"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span>Developer Logout</span>
        </button>
      </div>
      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          handleDeveloperLogout();
        }}
      />
    </nav>
  );
}
