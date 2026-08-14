import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * A dialog built on the native <dialog> element.
 *
 * `showModal()` gives focus trapping, Escape-to-close, background inertness and
 * a top-layer that cannot be covered by a stacking-context accident — all of
 * which the hand-rolled `fixed inset-0` overlays here had none of. Everything
 * left to do is styling and the backdrop click.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape fires the dialog's own `cancel`/`close`; the parent still owns the
  // state, so it has to hear about it.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handle = () => onClose();
    dialog.addEventListener("close", handle);
    return () => dialog.removeEventListener("close", handle);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // The backdrop is a pseudo-element of the dialog, so a click on it lands
      // on the dialog itself. Comparing the target to the element is what
      // distinguishes "clicked outside" from "clicked the content".
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`m-auto w-[calc(100vw-2rem)] rounded-card border border-hairline bg-paper
                  p-0 text-ink backdrop:bg-black/50 ${wide ? "max-w-2xl" : "max-w-md"}`}
    >
      <div className="max-h-[80vh] overflow-auto overscroll-contain p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <p className="label">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 text-faint transition hover:text-accent"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

/**
 * Replaces window.confirm, which blocks the whole tab, cannot be styled, and on
 * a phone reads as a browser warning rather than part of the app.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="mb-6 text-sm leading-relaxed">{message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="btn-gradient rounded-card px-5 py-2.5 font-medium"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}
