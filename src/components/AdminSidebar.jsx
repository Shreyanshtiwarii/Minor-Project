import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import LogoutConfirmDialog from './LogoutConfirmDialog';

export default function AdminSidebar() {
  const navigate = useNavigate();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleAdminLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin/login');
  };

  const adminNavItems = [
    { name: 'Dashboard', path: '/admin', icon: 'dashboard' },
    { name: 'Transport Data', path: '/admin/transport-data', icon: 'directions_transit' },
    { name: 'Users & Access', path: '/admin/users', icon: 'group' },
    { name: 'Fuel & Energy Prices', path: '/admin/fuel-prices', icon: 'local_gas_station' },
    { name: 'Emission Factors', path: '/admin/emission-factors', icon: 'factory' },
    { name: 'EV / Charging Data', path: '/admin/ev-data', icon: 'ev_station' },
    { name: 'Transit Data', path: '/admin/transit-data', icon: 'directions_bus' },
    { name: 'Integrations / APIs', path: '/admin/integrations', icon: 'api' },
    { name: 'System Health', path: '/admin/system-health', icon: 'favorite' },
    { name: 'Analytics', path: '/admin/analytics', icon: 'analytics' },
    { name: 'Audit Logs', path: '/admin/audit-logs', icon: 'receipt_long' },
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
        <div className="bg-primary/10 text-primary border border-primary/20 rounded-lg px-3 py-1.5 text-[11px] font-bold flex items-center gap-1.5">
          <span className="material-symbols-outlined text-xs">admin_panel_settings</span>
          <span>ADMIN CONTROL CENTER</span>
        </div>
      </div>

      {/* Admin Navigation Items */}
      <div className="flex-1 overflow-y-auto pt-2 flex flex-col gap-1 px-2 custom-scrollbar">
        {adminNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/admin'}
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

      {/* Footer Profile Settings */}
      <div className="pt-3 border-t border-outline-variant px-2 flex flex-col gap-1">
        <NavLink
          to="/admin/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-label-sm font-label-sm transition-colors ${
              isActive
                ? 'bg-primary text-on-primary font-semibold'
                : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">person</span>
          <span>Profile Settings</span>
        </NavLink>

        <button
          type="button"
          onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-label-sm font-label-sm text-error hover:bg-error-container/20 transition-colors cursor-pointer text-left w-full mt-1"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span>Admin Logout</span>
        </button>
      </div>
      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          handleAdminLogout();
        }}
      />
    </nav>
  );
}
