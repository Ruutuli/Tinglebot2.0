"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [modal.tsx]✨ Core deps - */
import * as Dialog from "@radix-ui/react-dialog";
import { clsx } from "clsx";
import { ReactNode } from "react";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [modal.tsx]🧷 Props contract - */
interface ModalProps {
  children: ReactNode;
  className?: string;
  description?: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  size?: "full" | "lg" | "md" | "sm" | "xl";
  title?: string;
  trigger?: ReactNode;
}

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

/* [modal.tsx]✨ Class maps - */
const sizeClasses = {
  full: "w-[100vw] h-[100vh] max-w-none max-h-none rounded-none",
  lg: "max-w-2xl",
  md: "max-w-lg",
  sm: "max-w-md",
  xl: "max-w-4xl",
};

const styles = {
  content: {
    backgroundColor: "var(--totk-brown)",
    borderColor: "var(--totk-dark-ocher)",
    boxShadow:
      "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 16px rgba(0, 163, 218, 0.15)",
    color: "var(--totk-ivory)",
  },
  overlay: { backgroundColor: "rgba(0, 0, 0, 0.6)" },
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [modal.tsx]🧱 Dialog shell - */
export function Modal({
  children,
  className,
  description,
  onOpenChange,
  open,
  size = "md",
  title,
  trigger,
}: ModalProps) {
  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      {trigger && <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>}
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm animate-in fade-in"
          style={styles.overlay}
        />
        <Dialog.Content
          className={clsx(
            size === "full"
              ? "fixed inset-0 z-50 w-full h-full border-0 p-6 shadow-2xl animate-in fade-in duration-200"
              : "fixed left-1/2 top-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200",
            sizeClasses[size],
            className
          )}
          style={styles.content}
        >
          {title && (
            <Dialog.Title
              className="mb-2 text-2xl font-bold"
              style={{ color: "var(--totk-light-ocher)" }}
            >
              {title}
            </Dialog.Title>
          )}
          {description && (
            <Dialog.Description
              className="mb-4 text-sm"
              style={{ color: "var(--totk-grey-200)" }}
            >
              {description}
            </Dialog.Description>
          )}
          <div className={size === "full" ? "h-[calc(100vh-8rem)] overflow-y-auto" : "max-h-[80vh] overflow-y-auto"}>{children}</div>
          <Dialog.Close asChild>
            <button
              type="button"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 hover:bg-[var(--totk-dark-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
              style={{ color: "var(--botw-pale)" }}
              aria-label="Close"
            >
              <i aria-hidden className="fa-solid fa-xmark" />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
