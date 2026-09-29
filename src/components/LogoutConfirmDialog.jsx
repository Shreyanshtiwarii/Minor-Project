import React, { useEffect } from 'react';

/**
 * Confirmation dialog shown before logging the user out.
 *
 * Props:
 * - open: whether the dialog is visible
 * - onCancel: called when the user cancels (stays logged in)
 * - onConfirm: called when the user confirms (performs logout + redirect)
 */
export default function LogoutConfirmDialog({ open, onCancel, onConfirm }) {
  // Allow closing with Escape for accessibility/UX consistency.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="logout-confirm-title"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-surface-container-lowest border border-outline-variant shadow-lg p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-error text-2xl">logout</span>
          <h2 id="logout-confirm-title" className="text-headline-md font-headline-md font-bold text-on-surface">
            Log out?
          </h2>
        </div>
        <p className="text-body-md text-on-surface-variant mb-6">
          Are you sure you want to logout?
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg font-label-sm text-on-surface-variant hover:bg-surface-variant transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="px-4 py-2 rounded-lg font-label-sm bg-error text-on-error hover:opacity-90 transition-opacity cursor-pointer"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
