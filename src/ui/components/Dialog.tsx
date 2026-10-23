import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import styles from './Dialog.module.css';

export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly closeLabel: string;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  readonly size?: 'sm' | 'md' | 'lg' | 'sheet';
  /** Prevent closing with Escape / backdrop (e.g. while saving). */
  readonly dismissible?: boolean;
  readonly role?: 'dialog' | 'alertdialog';
  readonly className?: string;
}

let openCount = 0;

/**
 * Modal dialog built on the native <dialog> element: top layer, focus trap,
 * inert background and Escape handling come from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  closeLabel,
  children,
  footer,
  size = 'md',
  dismissible = true,
  role = 'dialog',
  className,
}: DialogProps): ReactNode {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Only a close initiated inside the dialog (Escape, close button, backdrop)
  // notifies the parent; closing because the parent set open=false does not.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
      openCount += 1;
      document.documentElement.classList.add('scroll-locked');
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleClose = (): void => {
      openCount = Math.max(0, openCount - 1);
      if (openCount === 0) document.documentElement.classList.remove('scroll-locked');
      const target = returnFocus.current;
      if (target && document.contains(target)) target.focus();
      if (openRef.current) onCloseRef.current();
    };
    el.addEventListener('close', handleClose);
    return () => el.removeEventListener('close', handleClose);
  }, []);

  useEffect(
    () => () => {
      if (ref.current?.open) {
        ref.current.close();
      }
    },
    [],
  );

  return (
    // Click on the backdrop closes the dialog; the keyboard equivalent (Escape) is native to <dialog>.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={[styles.dialog, size !== 'md' ? styles[size] : '', className ?? ''].join(' ')}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) ref.current.close();
      }}
    >
      {open ? (
        <>
          <div className={styles.header}>
            <div>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {description ? (
                <p id={descId} className={styles.description}>
                  {description}
                </p>
              ) : null}
            </div>
            {dismissible ? (
              <IconButton label={closeLabel} icon={<X />} onClick={() => ref.current?.close()} />
            ) : null}
          </div>
          <div className={styles.body}>{children}</div>
          {footer ? <div className={styles.footer}>{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
