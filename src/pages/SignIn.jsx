import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { resendVerificationEmail } from '../services/authService';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function SignIn() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loginWithGoogle } = useAuth();

  const redirectTo = location.state?.from || '/dashboard';

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // True when the last login attempt failed specifically because the account isn't verified
  // yet - shows a "resend verification email" action instead of just an error message.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState('idle'); // 'idle' | 'sending' | 'sent'

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const errors = {};
    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(form.email.trim())) {
      errors.email = 'Enter a valid email address';
    }
    if (!form.password) {
      errors.password = 'Password is required';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setNeedsVerification(false);
    setResendState('idle');
    if (!validate()) return;

    setLoading(true);
    try {
      await login(form.email.trim(), form.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(err.message || 'Unable to sign in. Please try again.');
      setNeedsVerification(!!err.emailNotVerified);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!form.email.trim()) return;
    setResendState('sending');
    try {
      await resendVerificationEmail(form.email.trim());
    } catch {
      // Resend intentionally always looks successful (see backend), this is just a safety net.
    } finally {
      setResendState('sent');
    }
  };

  const handleGoogleCredential = async (idToken) => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle(idToken);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFormError(err.message || 'Google sign-in failed. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 font-body-md antialiased">
      <Link to="/" className="flex items-center gap-2 mb-8">
        <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
        <span className="font-headline-md text-headline-md text-primary tracking-tight">GreenMove</span>
      </Link>

      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-headline-md font-headline-md text-on-surface font-bold">Welcome back</h1>
          <p className="text-body-md text-on-surface-variant mt-1">Sign in to continue your sustainable commute</p>
        </div>

        {formError && (
          <div role="alert" className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
            {formError}
            {needsVerification && (
              <button
                type="button"
                onClick={handleResend}
                disabled={resendState === 'sending'}
                className="block mt-2 text-primary font-semibold hover:underline disabled:opacity-70"
              >
                {resendState === 'sent' ? 'Verification email sent - check your inbox' : resendState === 'sending' ? 'Sending...' : 'Resend verification email'}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-label-xs font-semibold text-on-surface mb-1">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.email ? 'border-error' : 'border-outline-variant'}`}
              placeholder="you@example.com"
            />
            {fieldErrors.email && <p className="text-error text-label-xs mt-1">{fieldErrors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-label-xs font-semibold text-on-surface mb-1">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange}
              className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.password ? 'border-error' : 'border-outline-variant'}`}
              placeholder="••••••••"
            />
            {fieldErrors.password && <p className="text-error text-label-xs mt-1">{fieldErrors.password}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">login</span>
                <span>Sign In</span>
              </>
            )}
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="h-px flex-1 bg-outline-variant" />
          <span className="text-label-xs text-on-surface-variant">OR</span>
          <div className="h-px flex-1 bg-outline-variant" />
        </div>

        <GoogleSignInButton onCredential={handleGoogleCredential} disabled={loading || googleLoading} />
        {googleLoading && (
          <p className="text-label-xs text-on-surface-variant text-center mt-2">Signing in with Google...</p>
        )}

        <p className="text-body-md text-on-surface-variant text-center mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary font-semibold hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
