import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { verifyEmail } from '../services/authService';

/**
 * Landing page for the signup verification link emailed via Brevo
 * (frontendUrl + "/verify-email?token=..."). Confirms the token with the backend and tells the
 * user to sign in - no session is created here (verify and log in are separate steps).
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('This verification link is missing its token. Please use the link from your email.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await verifyEmail(token);
        if (cancelled) return;
        setStatus('success');
        setMessage(res?.message || 'Your email has been verified. You can now sign in.');
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setMessage(err.message || 'This verification link is invalid or has expired.');
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 font-body-md antialiased">
      <Link to="/" className="flex items-center gap-2 mb-8">
        <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
        <span className="font-headline-md text-headline-md text-primary tracking-tight">GreenMove</span>
      </Link>

      <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 md:p-8 shadow-md text-center">
        {status === 'verifying' && (
          <>
            <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
            <h1 className="text-headline-md font-headline-md text-on-surface font-bold mt-4">Verifying your email...</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <span className="material-symbols-outlined text-4xl text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            <h1 className="text-headline-md font-headline-md text-on-surface font-bold mt-4">Email verified</h1>
            <p className="text-body-md text-on-surface-variant mt-2">{message}</p>
            <Link
              to="/signin"
              className="mt-6 inline-block w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm font-semibold"
            >
              Go to sign in
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <span className="material-symbols-outlined text-4xl text-error">error</span>
            <h1 className="text-headline-md font-headline-md text-on-surface font-bold mt-4">Verification failed</h1>
            <p className="text-body-md text-on-surface-variant mt-2">{message}</p>
            <Link
              to="/signin"
              className="mt-6 inline-block w-full bg-primary text-on-primary font-label-sm py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm font-semibold"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
