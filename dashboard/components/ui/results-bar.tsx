"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [results-bar.tsx]✨ Core deps - */

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [results-bar.tsx]🧷 Results bar props - */
export type ResultsBarProps = {
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  /** Optional: how many items are actually rendered on this page (after filtering). */
  currentCount?: number;
  itemName: string; // e.g., "characters", "items", "monsters"
  className?: string;
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [results-bar.tsx]🧱 Results bar component - */
export function ResultsBar({
  currentPage,
  totalItems,
  itemsPerPage,
  currentCount,
  itemName,
  className = "",
}: ResultsBarProps) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItemRaw = currentCount != null ? startItem + Math.max(0, currentCount) - 1 : currentPage * itemsPerPage;
  const endItem = totalItems === 0 ? 0 : Math.min(endItemRaw, totalItems);

  return (
    <div
      className={`rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 sm:px-4 py-2 ${className}`}
    >
      <p className="text-center text-xs sm:text-sm text-[var(--botw-pale)]">
        Showing <span className="font-semibold text-[var(--totk-light-green)]">{startItem}</span>-
        <span className="font-semibold text-[var(--totk-light-green)]">{endItem}</span> of{" "}
        <span className="font-semibold text-[var(--totk-light-green)]">{totalItems}</span> {itemName}{" "}
        {totalPages > 1 && (
          <>
            (Page <span className="font-semibold text-[var(--totk-light-ocher)]">{currentPage}</span> of{" "}
            <span className="font-semibold text-[var(--totk-light-ocher)]">{totalPages}</span>)
          </>
        )}
      </p>
    </div>
  );
}
