import { useI18n } from '@/i18n/context';
import { Modal } from './Modal';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  /** Shown in place of a silent failure when the confirmed action rejects. */
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          {error && <p className="flex-1 text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 rounded-pill bg-bg-alt px-5 text-sm font-semibold text-ink"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-10 rounded-pill bg-danger px-5 text-sm font-semibold text-on-accent disabled:opacity-60"
          >
            {busy ? t('common.processing') : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="prose-cjk text-sm whitespace-pre-line">{message}</p>
    </Modal>
  );
}
