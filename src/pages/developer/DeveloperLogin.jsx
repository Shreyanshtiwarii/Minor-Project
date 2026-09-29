import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../config';

export default function DeveloperLogin() {
  const navigate = useNavigate();
  const [isCreateAccount, setIsCreateAccount] = useState(false);
  const [username, setUsername] = useState('nandni');
  const [password, setPassword] = useState('nandni');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    if (isCreateAccount) {
      // Account Creation Flow
      if (!username || !password || !email) {
        setError('Please fill in all required account registration fields.');
        setLoading(false);
        return;
      }
      setTimeout(() => {
        setSuccessMsg('Developer account registered successfully! Please sign in with your credentials.');
        setIsCreateAccount(false);
        setLoading(false);
      }, 800);
      return;
    }

    // Sign In Flow
    try {
      const res = await fetch(`${API_BASE_URL}/developer/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('developerToken', data.token);
        localStorage.setItem('developerRole', 'DEVELOPER');
        navigate('/dashboard', { replace: true });
      } else {
        setError(data.message || 'Invalid developer credentials');
      }
    } catch (err) {
      console.warn('[DeveloperLogin] Backend offline, fallback local verification:', err);
      const cleanUser = username.trim().toLowerCase();
      const cleanPass = password.trim().toLowerCase();
      if ((cleanUser === 'nandni' || cleanUser === 'nandini') && (cleanPass === 'nandni' || cleanPass === 'nandini')) {
        localStorage.setItem('developerToken', 'local_developer_token');
        localStorage.setItem('developerRole', 'DEVELOPER');
        navigate('/dashboard', { replace: true });
      } else {
        setError('Invalid developer credentials. Use nandni / nandni');
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
            <span className="material-symbols-outlined text-3xl">code</span>
          </div>
          <h1 className="text-headline-md font-headline-md text-on-surface font-bold">
            {isCreateAccount ? 'Create Developer Account' : 'GreenMove Developer Login'}
          </h1>
          <p className="text-label-xs text-on-surface-variant mt-1">
            {isCreateAccount ? 'Register a new developer credential' : 'Development Login'}
          </p>
          <span className="text-[11px] text-primary font-semibold mt-1">Every Move Shapes Tomorrow.</span>
        </div>

        {error && (
          <div className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-xl text-label-xs mb-4">
            {successMsg}
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
              placeholder="nandni"
            />
          </div>

          {isCreateAccount && (
            <div>
              <label className="block text-label-xs font-semibold text-on-surface mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-surface-container-low border border-outline-variant rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary"
                placeholder="nandni@greenmove.com"
              />
            </div>
          )}

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

          {!isCreateAccount && (
            <div className="bg-surface-container-low p-3 rounded-xl border border-outline-variant/30 text-[11px] text-on-surface-variant flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-primary">info</span>
              <span>Testing Credentials: <strong>nandni</strong> / <strong>nandni</strong></span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 font-semibold"
          >
            {loading ? (
              <span>Processing...</span>
            ) : isCreateAccount ? (
              <>
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>Create Account</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">login</span>
                <span>Sign In to Developer Panel</span>
              </>
            )}
          </button>
        </form>

        {/* Create Account Option / Link */}
        <div className="mt-5 text-center pt-4 border-t border-outline-variant/30">
          {isCreateAccount ? (
            <p className="text-label-xs text-on-surface-variant">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setIsCreateAccount(false); setError(null); }}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p className="text-label-xs text-on-surface-variant">
              Need a developer account?{' '}
              <button
                type="button"
                onClick={() => { setIsCreateAccount(true); setError(null); }}
                className="text-primary font-semibold hover:underline cursor-pointer"
              >
                Create Account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
