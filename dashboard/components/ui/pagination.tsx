"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [pagination.tsx]✨ Core deps - */
import { useMemo, useState, useRef, useEffect } from "react";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [pagination.tsx]🧷 Pagination props - */
export type PaginationProps = {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  className?: string;
  maxVisiblePages?: number;
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [pagination.tsx]🧱 Pagination component - */
export function Pagination({
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  className = "",
  maxVisiblePages = 5,
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  // Make pagination denser on small screens to avoid wrapping.
  const [isSmUp, setIsSmUp] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)"); // Tailwind 'sm'
    const update = () => setIsSmUp(mq.matches);
    update();

    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }

    // Fallback for older browsers.
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  const effectiveMaxVisiblePages = isSmUp ? maxVisiblePages : Math.min(maxVisiblePages, 3);

  // Calculate visible page numbers
  const visiblePages = useMemo(() => {
    if (totalPages <= effectiveMaxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | string)[] = [];
    const halfVisible = Math.floor(effectiveMaxVisiblePages / 2);

    // Always show first page
    pages.push(1);

    // Calculate start and end of visible range
    let start = Math.max(2, currentPage - halfVisible);
    let end = Math.min(totalPages - 1, currentPage + halfVisible);

    // Adjust if we're near the start
    if (currentPage <= halfVisible + 1) {
      end = Math.min(totalPages - 1, effectiveMaxVisiblePages);
    }

    // Adjust if we're near the end
    if (currentPage >= totalPages - halfVisible) {
      start = Math.max(2, totalPages - effectiveMaxVisiblePages + 1);
    }

    // Add ellipsis if needed
    if (start > 2) {
      pages.push("ellipsis-start");
    }

    // Add visible pages
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Add ellipsis if needed
    if (end < totalPages - 1) {
      pages.push("ellipsis-end");
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages, effectiveMaxVisiblePages]);

  if (totalPages <= 1) {
    return null;
  }

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      onPageChange(page);
    }
  };

  const [jumpTarget, setJumpTarget] = useState<"ellipsis-start" | "ellipsis-end" | null>(null);
  const [jumpInput, setJumpInput] = useState("");
  const jumpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (jumpTarget) {
      setJumpInput("");
      jumpInputRef.current?.focus();
    }
  }, [jumpTarget]);

  const submitJump = () => {
    const n = parseInt(jumpInput, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= totalPages) {
      onPageChange(n);
    }
    setJumpTarget(null);
    setJumpInput("");
  };

  const handleJumpKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitJump();
    }
    if (e.key === "Escape") {
      setJumpTarget(null);
      setJumpInput("");
      jumpInputRef.current?.blur();
    }
  };

  return (
    <div className={`flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap ${className}`}>
      {/* Previous Button */}
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className={`flex items-center gap-1 rounded-lg border-2 px-2.5 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-all min-h-[44px] ${
          currentPage === 1
            ? "cursor-not-allowed border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--totk-grey-300)] opacity-50"
            : "border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--botw-pale)] hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/30"
        }`}
      >
        <i className="fa-solid fa-chevron-left text-xs" />
        <span className="hidden sm:inline">Previous</span>
        <span className="sm:hidden">Prev</span>
      </button>

      {/* Page Numbers */}
      <div className="flex items-center gap-1">
        {visiblePages.map((page) => {
          if (typeof page === "string") {
            const isEditing = jumpTarget === page;
            return (
              <span key={page} className="flex min-w-[2.25rem] sm:min-w-[2.5rem] items-center justify-center">
                {isEditing ? (
                  <input
                    ref={jumpInputRef}
                    type="number"
                    min={1}
                    max={totalPages}
                    value={jumpInput}
                    onChange={(e) => setJumpInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={handleJumpKeyDown}
                    onBlur={submitJump}
                    placeholder={`1–${totalPages}`}
                    className="w-14 sm:w-16 rounded-lg border-2 border-[var(--totk-mid-ocher)] bg-[var(--totk-brown)] px-2 py-1.5 sm:px-2.5 text-center text-sm sm:text-base font-medium text-[var(--totk-ivory)] outline-none placeholder:font-normal placeholder:text-[var(--totk-grey-100)] focus:border-[var(--totk-light-green)] focus:ring-2 focus:ring-[var(--totk-light-green)]/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setJumpTarget(page as "ellipsis-start" | "ellipsis-end")}
                    className="min-w-[2.25rem] sm:min-w-[2.5rem] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm text-[var(--totk-grey-200)] transition-all hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/30 hover:text-[var(--botw-pale)]"
                    title={`Jump to page (1–${totalPages})`}
                  >
                    ...
                  </button>
                )}
              </span>
            );
          }

          const isActive = page === currentPage;
          return (
            <button
              key={page}
              onClick={() => handlePageChange(page)}
              className={`min-w-[2.25rem] sm:min-w-[2.5rem] rounded-lg border-2 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-all ${
                isActive
                  ? "border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                  : "border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--botw-pale)] hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/30"
              }`}
            >
              {page}
            </button>
          );
        })}
      </div>

      {/* Next Button */}
      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className={`flex items-center gap-1 rounded-lg border-2 px-2.5 py-2 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium transition-all min-h-[44px] ${
          currentPage === totalPages
            ? "cursor-not-allowed border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--totk-grey-300)] opacity-50"
            : "border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--botw-pale)] hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/30"
        }`}
      >
        <span className="hidden sm:inline">Next</span>
        <span className="sm:hidden">Next</span>
        <i className="fa-solid fa-chevron-right text-xs" />
      </button>
    </div>
  );
}
