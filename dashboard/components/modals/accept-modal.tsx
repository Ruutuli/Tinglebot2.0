"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

import { Modal } from "@/components/ui";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [accept-modal.tsx]🧷 Accept modal props - */
export interface AcceptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [accept-modal.tsx]🧱 Accept/confirm modal - */
export function AcceptModal({
  isOpen,
  onClose,
  onAccept,
  title = "Confirm Action",
  message,
  confirmText = "Accept",
  cancelText = "Cancel",
}: AcceptModalProps) {
  const handleAccept = () => {
    onAccept();
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="md"
      title={title}
      description={message}
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-[var(--botw-pale)]">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-sm font-semibold text-[var(--totk-ivory)] transition-all duration-200 hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleAccept}
            className="px-4 py-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-dark-green)] text-sm font-semibold text-[var(--totk-ivory)] transition-all duration-200 hover:border-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)] hover:text-[var(--botw-warm-black)] hover:shadow-[0_0_16px_rgba(73,213,156,0.5)] hover:scale-[1.02]"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
