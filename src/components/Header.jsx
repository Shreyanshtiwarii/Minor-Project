import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getMyImpact } from '../services/impactService';
import LogoutConfirmDialog from './LogoutConfirmDialog';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.name ? user.name.split(' ')[0] : 'there';
  const [savings, setSavings] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const fetchSavings = async () => {
    if (!user) return;
    try {
      const data = await getMyImpact();
      setSavings(Math.round(data.realizedSavings || 0));
    } catch (e) {
      console.error("Failed to load navbar savings", e);
    }
  };

  useEffect(() => {
    fetchSavings();
    const handleUpdate = () => fetchSavings();
    window.addEventListener('impact-updated', handleUpdate);
    return () => window.removeEventListener('impact-updated', handleUpdate);
  }, [user]);

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
    <>
      <header className="flex justify-between items-center h-16 px-4 md:px-md w-full bg-surface/80 backdrop-blur-md sticky top-0 z-40 border-b border-outline-variant shadow-sm transition-opacity hover:opacity-100">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden text-on-surface-variant hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-surface-variant cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Open navigation menu"
          >
            <span className="material-symbols-outlined text-2xl">menu</span>
          </button>
          <h2 className="text-headline-md font-headline-md font-bold text-primary hidden md:block truncate">Hello, {firstName} 👋</h2>
          <h2 className="text-headline-md font-headline-md font-bold text-primary md:hidden truncate">GreenMove</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-6 shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-3">
            {savings !== null && (
              <button
                onClick={() => navigate('/impact')}
                className="bg-primary/10 text-primary hover:bg-primary/20 px-2 sm:px-3 py-1.5 rounded-lg text-label-xs sm:text-label-sm font-bold border border-primary/20 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                title="Your Realized Savings"
              >
                <span className="material-symbols-outlined text-xs sm:text-sm">savings</span>
                <span>₹{savings.toLocaleString()} <span className="hidden sm:inline">Saved</span></span>
              </button>
            )}
            <button className="text-on-surface-variant hover:text-primary transition-colors p-1.5 sm:p-2 rounded-full hover:bg-surface-variant cursor-pointer shrink-0">
              <span className="material-symbols-outlined text-xl sm:text-2xl">location_on</span>
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors p-1.5 sm:p-2 rounded-full hover:bg-surface-variant cursor-pointer shrink-0">
              <span className="material-symbols-outlined text-xl sm:text-2xl">notifications</span>
            </button>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-secondary-fixed overflow-hidden border border-outline-variant flex items-center justify-center text-on-secondary-container font-label-sm font-bold shrink-0">
              {user?.name ? user.name.charAt(0).toUpperCase() : (
                <img 
                  alt="User Profile Avatar" 
                  className="w-full h-full object-cover" 
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuA8R5LI8FlY9fApjBuKfZKCILEd1RMeqJLC4D4Em64BPBLN8MhVYI6Qh1nE_fpQA8ra1-p8SaEKl9aDFSSb1lfVXy4cMi2q-_-GiHvooWJp6hTa23TVOD5fYoxqsV2DrGeTBxNsl8rYChDVjUWmT1CAoZdaLw6O2Sdobs1DTVPii-B9sO0xNT6FbOUbAcFimWrXfMH5zy6Nl2ONOAAI5lw3UIxNqDlBkWrkIGQ-ioGj0LJ6mGYJEBaL"
                />
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="w-4/5 max-w-xs bg-surface-container h-full flex flex-col p-4 border-r border-outline-variant shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-outline-variant">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-3xl shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
                <div>
                  <h1 className="text-headline-md font-headline-md font-bold text-primary">GreenMove</h1>
                  <p className="text-label-xs font-label-xs text-on-surface-variant">Sustainable Transit</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="text-on-surface-variant hover:text-primary p-1.5 rounded-lg hover:bg-surface-variant cursor-pointer"
                aria-label="Close menu"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-1">
              {menuItems.map((item) => (
                <NavLink
                  key={item.name + '-mobile-' + item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg py-3 px-4 transition-colors ${
                      isActive 
                        ? 'bg-secondary-container text-on-secondary-container font-semibold' 
                        : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span 
                        className="material-symbols-outlined shrink-0" 
                        style={{ fontVariationSettings: (isActive || item.fillIcon) ? "'FILL' 1" : "'FILL' 0" }}
                      >
                        {item.icon}
                      </span>
                      <span className="font-label-sm">{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>

            <div className="border-t border-outline-variant pt-4 space-y-1">
              <NavLink
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg py-3 px-4 transition-colors ${
                    isActive ? 'bg-surface-variant text-primary' : 'text-on-surface-variant hover:text-primary hover:bg-surface-variant'
                  }`
                }
              >
                <span className="material-symbols-outlined shrink-0">person</span>
                <span className="font-label-sm">Profile Settings</span>
              </NavLink>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="w-full flex items-center gap-3 rounded-lg py-3 px-4 text-left transition-colors text-on-surface-variant hover:text-error hover:bg-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined shrink-0">logout</span>
                <span className="font-label-sm">Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <LogoutConfirmDialog
        open={showLogoutConfirm}
        onCancel={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          handleLogout();
        }}
      />
    </>
  );
}
