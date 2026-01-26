/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

export type ItemFlagsProps = {
  crafting?: boolean;
  gathering?: boolean;
  looting?: boolean;
  specialWeather?: boolean;
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

export function ItemFlags({ crafting, gathering, looting, specialWeather }: ItemFlagsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {crafting && (
        <span className="rounded bg-[var(--totk-dark-green)]/30 px-2 py-1 text-xs">Craftable</span>
      )}
      {gathering && (
        <span className="rounded bg-[var(--botw-blue)]/30 px-2 py-1 text-xs">Gatherable</span>
      )}
      {looting && (
        <span className="rounded bg-[var(--totk-light-ocher)]/30 px-2 py-1 text-xs">Lootable</span>
      )}
      {specialWeather && (
        <span className="rounded bg-[var(--totk-dark-green)]/30 px-2 py-1 text-xs text-[var(--totk-dark-green)]">
          Special Weather
        </span>
      )}
    </div>
  );
}
