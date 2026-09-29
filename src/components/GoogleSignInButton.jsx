import React, { useEffect, useRef, useState } from 'react';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gsiScriptPromise = null;
function loadGoogleScript() {
  if (gsiScriptPromise) return gsiScriptPromise;
  gsiScriptPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = GSI_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
  return gsiScriptPromise;
}

/**
 * Renders Google's official "Continue with Google" button using Google Identity
 * Services (GIS). Requires VITE_GOOGLE_CLIENT_ID to be set to a valid OAuth Web
 * Client ID (see .env.example). Until configured, a disabled placeholder button
 * is shown instead so the sign-in/sign-up pages remain fully usable via email.
 */
export default function GoogleSignInButton({ onCredential, disabled }) {
  const containerRef = useRef(null);
  const [scriptError, setScriptError] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || disabled) return;

    let cancelled = false;

    loadGoogleScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id || !containerRef.current) return;

        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => {
            if (response?.credential) {
              onCredential(response.credential);
            }
          }
        });

        window.google.accounts.id.renderButton(containerRef.current, {
          theme: 'outline',
          size: 'large',
          width: containerRef.current.offsetWidth || 320,
          text: 'continue_with',
          shape: 'rectangular'
        });
      })
      .catch(() => setScriptError(true));

    return () => { cancelled = true; };
  }, [onCredential, disabled]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title="Google Sign-In is not configured yet. Set VITE_GOOGLE_CLIENT_ID and GOOGLE_CLIENT_ID to enable it."
        className="w-full flex items-center justify-center gap-3 border border-outline-variant rounded-xl py-2.5 text-body-md text-on-surface-variant bg-surface-container-low cursor-not-allowed opacity-70"
      >
        <GoogleGlyph />
        Continue with Google (not configured)
      </button>
    );
  }

  if (scriptError) {
    return (
      <button
        type="button"
        disabled
        className="w-full flex items-center justify-center gap-3 border border-outline-variant rounded-xl py-2.5 text-body-md text-on-surface-variant bg-surface-container-low cursor-not-allowed opacity-70"
      >
        <GoogleGlyph />
        Google Sign-In unavailable
      </button>
    );
  }

  return <div ref={containerRef} className="w-full flex justify-center [&>div]:!w-full" />;
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.98v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.98A9 9 0 0 0 0 9c0 1.45.35 2.83.98 4.03z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .98 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
    </svg>
  );
}
