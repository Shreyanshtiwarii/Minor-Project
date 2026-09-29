import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function DeveloperLanding() {
  const navigate = useNavigate();

  const handleSignInClick = () => {
    // CRITICAL: Navigate to Developer Login page (/developer/login). DO NOT auto-authenticate!
    navigate('/developer/login');
  };

  return (
    <div className="min-h-screen bg-background text-on-surface font-body-md antialiased flex flex-col">
      {/* Top Header */}
      <header className="bg-surface/90 backdrop-blur-md sticky top-0 z-50 border-b border-outline-variant/30 px-md py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>eco</span>
          <div>
            <span className="font-headline-md text-headline-md text-primary font-bold">GreenMove Developer</span>
            <span className="block text-[11px] text-on-surface-variant font-semibold">Every Move Shapes Tomorrow.</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSignInClick}
          className="bg-primary text-on-primary font-label-sm px-6 py-2 rounded-xl hover:bg-primary/90 transition-colors shadow-sm cursor-pointer font-semibold flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">login</span>
          <span>Sign In</span>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6">
          <span className="material-symbols-outlined text-4xl">code</span>
        </div>

        <h1 className="text-headline-lg font-headline-lg text-on-surface font-bold mb-4">
          GreenMove Developer Portal
        </h1>
        <p className="text-body-lg text-on-surface-variant max-w-xl mb-8">
          Welcome to the GreenMove Developer Portal. Click below to sign in with your developer credentials.
        </p>

        <button
          type="button"
          onClick={handleSignInClick}
          className="bg-primary text-on-primary font-label-sm px-8 py-3.5 rounded-xl hover:bg-primary/90 transition-all shadow-md hover:shadow-lg cursor-pointer font-bold text-body-md flex items-center gap-2"
        >
          <span>Sign In with Credentials</span>
          <span className="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </main>
    </div>
  );
}
