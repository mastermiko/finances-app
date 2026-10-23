import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useToasts, type Toast } from './toast-store';
import styles from './Toaster.module.css';

const ICONS = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert,
} as const;

function ToastItem({ toast, closeLabel }: { toast: Toast; closeLabel: string }): ReactNode {
  const dismiss = useToasts((s) => s.dismiss);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration);
  const started = useRef(Date.now());

  useEffect(() => {
    if (paused) return;
    started.current = Date.now();
    const timer = window.setTimeout(() => dismiss(toast.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - started.current;
    };
  }, [paused, dismiss, toast.id]);

  const Icon = ICONS[toast.tone];
  return (
    // Hover and focus only pause the timer (WCAG 2.2.1); no action is bound to the container.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={styles.toast}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={styles.icon} aria-hidden="true" />
      <p className={styles.message}>{toast.message}</p>
      {toast.action ? (
        <button
          type="button"
          className={styles.action}
          onClick={() => {
            dismiss(toast.id);
            void toast.action?.onAction();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        className={styles.close}
        aria-label={closeLabel}
        onClick={() => dismiss(toast.id)}
      >
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/** Notification region: announced politely by screen readers (aria-live). */
export function Toaster({
  closeLabel,
  regionLabel,
}: {
  closeLabel: string;
  regionLabel: string;
}): ReactNode {
  const toasts = useToasts((s) => s.toasts);
  return (
    <section className={styles.region} aria-label={regionLabel}>
      <div role="status" aria-live="polite" aria-atomic="false" className={styles.stack}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} closeLabel={closeLabel} />
        ))}
      </div>
    </section>
  );
}
