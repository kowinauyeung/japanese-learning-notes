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
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-3">
          {error && <p className="text-danger flex-1 text-xs">{error}</p>}
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill bg-bg-alt text-ink min-h-10 px-5 text-sm font-semibold"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-pill bg-danger text-on-accent min-h-10 px-5 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      }
    >
      <p className="prose-cjk text-sm whitespace-pre-line">{message}</p>
    </Modal>
  );
}
