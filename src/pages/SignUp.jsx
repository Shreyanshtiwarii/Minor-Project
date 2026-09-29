import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { resendVerificationEmail } from '../services/authService';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function SignUp() {
  const navigate = useNavigate();
  const { register, loginWithGoogle } = useAuth();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  // Set once signup succeeds - swaps the form out for a "check your email" screen, since
  // accounts start unverified and can't log in until the emailed link is confirmed.
  const [signupResult, setSignupResult] = useState(null);
  const [resendState, setResendState] = useState('idle'); // 'idle' | 'sending' | 'sent'

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const validate = () => {
    const errors = {};
    if (!form.name.trim()) {
      errors.name = 'Name is required';
    } else if (form.name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!isValidEmail(form.email.trim())) {
      errors.email = 'Enter a valid email address';
    }

    if (!form.password) {
      errors.password = 'Password is required';
    } else if (form.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (!form.confirmPassword) {
      errors.confirmPassword = 'Please confirm your password';
    } else if (form.password !== form.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await register(form.name.trim(), form.email.trim(), form.password, form.confirmPassword);
      setSignupResult(result);
    } catch (err) {
      setFormError(err.message || 'Unable to create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!signupResult?.email) return;
    setResendState('sending');
    try {
      await resendVerificationEmail(signupResult.email);
    } catch {
      // Resend intentionally always looks successful to the caller (see backend), so this
      // catch is just a safety net for network errors.
    } finally {
      setResendState('sent');
    }
  };

  const handleGoogleCredential = async (idToken) => {
    setFormError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle(idToken);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setFormError(err.message || 'Google sign-up failed. Please try again.');
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

      {signupResult ? (
        <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-md text-center">
          <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>mark_email_read</span>
          <h1 className="text-headline-md font-headline-md text-on-surface font-bold mt-4">Check your email</h1>
          <p className="text-body-md text-on-surface-variant mt-2">{signupResult.message}</p>

          <button
            type="button"
            onClick={handleResend}
            disabled={resendState === 'sending'}
            className="mt-6 w-full bg-surface-container-low border border-outline-variant text-on-surface font-label-sm py-3 rounded-xl hover:bg-surface-container transition-colors font-semibold disabled:opacity-70"
          >
            {resendState === 'sent' ? 'Verification email sent' : resendState === 'sending' ? 'Sending...' : "Didn't get it? Resend link"}
          </button>

          <Link
            to="/signin"
            className="mt-3 inline-block w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm font-semibold"
          >
            Go to sign in
          </Link>
        </div>
      ) : (
      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-md">
        <div className="mb-6 text-center">
          <h1 className="text-headline-md font-headline-md text-on-surface font-bold">Create your account</h1>
          <p className="text-body-md text-on-surface-variant mt-1">Join GreenMove and start tracking your impact</p>
        </div>

        {formError && (
          <div role="alert" className="bg-error-container/20 border border-error/30 text-error p-3 rounded-xl text-label-xs mb-4">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-label-xs font-semibold text-on-surface mb-1">Full name</label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.name ? 'border-error' : 'border-outline-variant'}`}
              placeholder="Jane Doe"
            />
            {fieldErrors.name && <p className="text-error text-label-xs mt-1">{fieldErrors.name}</p>}
          </div>

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
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.password ? 'border-error' : 'border-outline-variant'}`}
              placeholder="At least 8 characters"
            />
            {fieldErrors.password && <p className="text-error text-label-xs mt-1">{fieldErrors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-label-xs font-semibold text-on-surface mb-1">Confirm password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange}
              className={`w-full bg-surface-container-low border rounded-xl px-4 py-2.5 text-body-md text-on-surface focus:outline-none focus:border-primary ${fieldErrors.confirmPassword ? 'border-error' : 'border-outline-variant'}`}
              placeholder="Re-enter your password"
            />
            {fieldErrors.confirmPassword && <p className="text-error text-label-xs mt-1">{fieldErrors.confirmPassword}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 font-semibold disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">person_add</span>
                <span>Sign Up</span>
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
          <p className="text-label-xs text-on-surface-variant text-center mt-2">Signing up with Google...</p>
        )}

        <p className="text-body-md text-on-surface-variant text-center mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-primary font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
      )}
    </div>
  );
}
