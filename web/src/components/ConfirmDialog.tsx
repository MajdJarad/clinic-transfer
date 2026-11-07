import { Button, Modal } from './ui';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A confirmation for actions that cannot be undone (red confirm button). */
export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = 'إلغاء', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <div className="space-y-5" data-testid="confirm-dialog">
        <div className="text-sm leading-relaxed text-fg">{message}</div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy} data-testid="confirm-cancel">
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} data-testid="confirm-ok">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
