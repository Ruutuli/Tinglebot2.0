"use client";

type MessageBannerProps = {
  type: "success" | "error";
  message: string;
  onDismiss?: () => void;
};

export function MessageBanner({ type, message, onDismiss }: MessageBannerProps) {
  const isSuccess = type === "success";
  const borderColor = isSuccess ? "border-[var(--totk-light-green)]" : "border-[#ff6347]";
  const bgColor = isSuccess ? "bg-[var(--totk-light-green)]/10" : "bg-[#ff6347]/10";
  const textColor = isSuccess ? "text-[var(--totk-light-green)]" : "text-[#ff6347]";
  const icon = isSuccess ? "fa-check-circle" : "fa-exclamation-triangle";

  return (
    <div className={`mb-4 rounded-lg border-2 ${borderColor} ${bgColor} p-4 flex items-start justify-between gap-3`}>
      <div className="flex items-start gap-2">
        <i className={`fa-solid ${icon} mt-0.5 ${textColor}`} aria-hidden="true" />
        <p className={`text-sm font-medium ${textColor}`}>{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-[var(--botw-pale)] hover:text-[var(--totk-light-ocher)] transition-colors"
          aria-label="Dismiss message"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
