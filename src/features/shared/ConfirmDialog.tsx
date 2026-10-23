import { useEffect, useState, type ReactNode } from 'react';
import { T, useT } from '@/i18n';
import { Button, Dialog, Field, TextInput } from '@/ui';

/**
 * Confirmation for destructive actions. With `confirmWord`, the user must type
 * the word (double confirmation for resets).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  confirmWord,
  danger = true,
  busy = false,
}: {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly confirmLabel: ReactNode;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  readonly confirmWord?: string;
  readonly danger?: boolean;
  readonly busy?: boolean;
}): ReactNode {
  const t = useT();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);
  const blocked =
    confirmWord !== undefined &&
    typed.trim().toLocaleUpperCase() !== confirmWord.toLocaleUpperCase();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      role="alertdialog"
      closeLabel={t('common.close')}
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            <T id="common.cancel" />
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={blocked}
            loading={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {confirmWord ? (
        <Field label={<T id="confirm.typeWord" values={{ word: confirmWord }} />}>
          <TextInput value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </Field>
      ) : null}
    </Dialog>
  );
}
