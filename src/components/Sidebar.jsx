import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LogoutConfirmDialog from './LogoutConfirmDialog';

export const SIDEBAR_COLLAPSE_KEY = 'sidebarCollapsed';
export const SIDEBAR_COLLAPSE_EVENT = 'sidebar-collapse-change';

function Tooltip({ label, children }) {
  return (
    <div className="relative group/tip flex items-center justify-center">
      {children}
      <span className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-inverse-surface px-2 py-1 text-label-xs font-label-xs text-inverse-on-surface opacity-0 scale-95 group-hover/tip:opacity-100 group-hover/tip:scale-100 transition-all duration-150 z-[60]">
        {label}
      </span>
    </div>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSE_KEY, String(collapsed));
    } catch {
      // ignore storage errors
    }
    window.dispatchEvent(new CustomEvent(SIDEBAR_COLLAPSE_EVENT, { detail: collapsed }));
  }, [collapsed]);

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: 'dashboard', fillIcon: true },
    { name: 'Vehicle Pool', path: '/vehicle-pool', icon: 'group' },
    { name: 'EV Intelligence', path: '/ev-intelligence', icon: 'ev_station' },
    { name: 'Plan Route', path: '/plan-route', icon: 'route' },
    { name: 'Compare', path: '/compare', icon: 'compare_arrows' },
    { name: 'My Impact', path: '/impact', icon: 'eco' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  return (
    <nav
      className={`hidden md:flex flex-col h-full py-md bg-surface-container fixed left-0 top-0 border-r border-outline-variant z-50 transition-[width] duration-[250ms] ease-in-out ${
        collapsed ? 'w-[76px]' : 'w-[260px]'
      }`}
    >
      <div className={`mb-6 relative flex items-center h-12 group/header ${collapsed ? 'justify-center px-2' : 'px-md justify-between'}`}>
        
        <div className={`flex items-center gap-3 transition-opacity duration-200 ${collapsed ? 'opacity-100 group-hover/header:opacity-0' : 'opacity-100'}`}>
          <span className="material-symbols-outlined text-primary text-3xl shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
          {!collapsed && (
            <div className="overflow-hidden whitespace-nowrap">
              <h1 className="text-headline-md font-headline-md font-bold text-primary">GreenMove</h1>
              <p className="text-label-xs font-label-xs text-on-surface-variant">Sustainable Transit</p>
            </div>
          )}
        </div>

        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-surface-variant cursor-pointer flex items-center justify-center shrink-0"
            title="Close sidebar"
            aria-label="Close sidebar"
          >
            <span className="material-symbols-outlined text-[20px]">menu_open</span>
          </button>
        )}

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="absolute inset-0 m-auto w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-surface-variant rounded-lg opacity-0 group-hover/header:opacity-100 transition-opacity cursor-pointer"
            title="Open sidebar"
            aria-label="Open sidebar"
          >
            <span className="material-symbols-outlined text-[20px]">menu</span>
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1">
          {menuItems.map((item) => (
            <NavLink
              key={item.name + '-' + item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg py-3 mx-2 transition-transform duration-200 ${
                  collapsed ? 'justify-center px-0' : 'px-4'
                } ${
                  isActive 
                    ? 'bg-secondary-container text-on-secondary-container scale-98 hover:bg-secondary-fixed-dim' 
                    : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant'
                }`
              }
            >
              {({ isActive }) => {
                const icon = (
                  <span 
                    className="material-symbols-outlined shrink-0" 
                    style={{ fontVariationSettings: (isActive || item.fillIcon) ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                );
                if (collapsed) {
                  return <Tooltip label={item.name}>{icon}</Tooltip>;
                }
                return (
                  <>
                    {icon}
                    <span className="font-label-sm">{item.name}</span>
                  </>
                );
              }}
            </NavLink>
          ))}
        </div>
      </div>
      <div className="mt-auto border-t border-outline-variant pt-4 space-y-1">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg py-3 mx-2 transition-colors duration-200 ${
              collapsed ? 'justify-center px-0' : 'px-4'
            } ${
              isActive ? 'bg-surface-variant text-primary' : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant'
            }`
          }
        >
          {collapsed ? (
            <Tooltip label="Profile Settings">
              <span className="material-symbols-outlined shrink-0">person</span>
            </Tooltip>
          ) : (
            <>
              <span className="material-symbols-outlined shrink-0">person</span>
              <span className="font-label-sm">Profile Settings</span>
            </>
          )}
        </NavLink>
        <button
          onClick={() => setShowLogoutConfirm(true)}
          className={`flex items-center gap-3 rounded-lg py-3 mx-2 text-left transition-colors duration-200 text-on-surface-variant hover:text-error hover:bg-surface-variant cursor-pointer ${
            collapsed ? 'justify-center px-0 w-[calc(100%-1rem)]' : 'px-4 w-[calc(100%-1rem)]'
          }`}
        >
          {collapsed ? (
            <Tooltip label="Log Out">
              <span className="material-symbols-outlined shrink-0">logout</span>
            </Tooltip>
          ) : (
            <>
              <span className="material-symbols-outlined shrink-0">logout</span>
              <span className="font-label-sm">Log Out</span>
            </>
          )}
        </button>
      </div>
      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          handleLogout();
        }}
      />
    </nav>
  );
}
