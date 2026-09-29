import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('adminRole', 'ADMIN');
        navigate('/admin', { replace: true });
      } else {
        setError(data.message || 'Invalid admin credentials');
      }
    } catch (err) {
      console.warn('[AdminLogin] Backend offline, fallback local verification:', err);
      if (username === 'admin' && password === 'admin') {
        localStorage.setItem('adminToken', 'local_admin_token');
        localStorage.setItem('adminRole', 'ADMIN');
        navigate('/admin', { replace: true });
      } else {
        setError('Invalid admin credentials. Use admin / admin');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-md">
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-3xl">admin_panel_settings</span>
          </div>
          <h1 className="text-headline-md font-headline-md text-on-surface font-bold">GreenMove Admin Login</h1>
          <p className="text-label-xs text-on-surface-variant mt-1">
            System Control Center & Administration
          </p>
          <span className="text-[11px] text-primary font-semibold mt-1">Every Move Shapes Tomorrow.</span>
        </div>

        {error && (
          <div className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-label-xs font-semibold text-on-surface mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary"
              placeholder="admin"
            />
          </div>

          <div>
            <label className="block text-label-xs font-semibold text-on-surface mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary"
              placeholder="••••••••"
            />
          </div>

          <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 text-[11px] text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-primary">info</span>
            <span>Testing Credentials: <strong>admin</strong> / <strong>admin</strong></span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 font-semibold"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">login</span>
                <span>Sign In to Admin Panel</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
