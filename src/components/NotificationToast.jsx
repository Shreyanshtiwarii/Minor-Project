import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Phase 5 - Carpool operational integration.
 *
 * Single, reusable in-app notification primitive shared by every Phase 5 notification:
 *   - "Passenger joined" (shown to the driver, in ActivePoolDetailsModal)
 *   - "Join succeeded" with fare + approx pickup time (shown to the passenger)
 *   - "Pickup coming up" reminder (~1 minute before pickup)
 *
 * There is no existing global toast/notification system in this app (each page that
 * needed a lightweight inline notice, e.g. PlanRoute's traffic-update card, rolled its
 * own local one-off UI). This component is the ONE new piece of notification
 * infrastructure Phase 5 introduces; every Phase 5 notification renders through it
 * instead of each caller inventing its own toast markup.
 */

let toastIdCounter = 0;

/**
 * @param {number} [autoDismissMs] - how long a toast stays visible before auto-dismissing.
 *   Pass 0 to disable auto-dismiss.
 */
export function useToastStack(autoDismissMs = 7000) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const pushToast = useCallback((toast) => {
    const id = `toast_${Date.now()}_${toastIdCounter++}`;
    setToasts((prev) => [...prev, { id, ...toast }]);
    if (autoDismissMs > 0) {
      const timer = setTimeout(() => dismissToast(id), autoDismissMs);
      timers.current.set(id, timer);
    }
    return id;
  }, [autoDismissMs, dismissToast]);

  // Clean up any pending auto-dismiss timers on unmount.
  useEffect(() => {
    const timersMap = timers.current;
    return () => {
      timersMap.forEach((timer) => clearTimeout(timer));
      timersMap.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast };
}

/**
 * Renders the current toast stack, fixed to a corner of the viewport (or of the
 * nearest `position: relative` ancestor, e.g. a modal, when `contained` is set).
 */
export default function NotificationToast({ toasts, onDismiss, contained = false }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div
      className={`${contained ? 'absolute' : 'fixed'} z-[200] bottom-4 right-4 flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] sm:w-full pointer-events-none`}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto rounded-xl border border-outline-variant/40 bg-surface-container-lowest shadow-lg px-4 py-3 flex items-start gap-3"
        >
          {t.icon && (
            <span className={`material-symbols-outlined text-xl shrink-0 ${t.tone === 'reminder' ? 'text-amber-600' : 'text-primary'}`}>
              {t.icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            {t.title && <p className="text-label-sm font-semibold text-on-surface">{t.title}</p>}
            {t.message && <p className="text-label-xs text-on-surface-variant mt-0.5">{t.message}</p>}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-on-surface-variant hover:text-on-surface shrink-0 cursor-pointer"
            aria-label="Dismiss notification"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
