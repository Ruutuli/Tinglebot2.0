"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";

// ------------------- Types -------------------
type Monster = {
  _id: string;
  name: string;
  nameMapping: string;
  image?: string;
  species: string;
  type: string;
  tier: number;
  hearts: number;
  dmg: number;
  bloodmoon: boolean;
  locations: string[];
  job?: string[];
  [key: string]: unknown;
};

type DropItem = { itemName: string; image?: string; emoji?: string; itemRarity?: number };

// ------------------- Monster image URL (reuse GCS proxy pattern from pets/items) -------------------
function monsterImageUrl(img?: string): string {
  if (!img || img === "No Image") return "/ankle_icon.png";
  if (img.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return `/api/images/${img.replace("https://storage.googleapis.com/tinglebot/", "")}`;
  }
  return img;
}

// ------------------- Location color class (same as items page ItemFlipCard) -------------------
function getLocationClass(locationName: string | null | undefined): string {
  const normalized = String(locationName ?? "").toLowerCase().replace(/\s+/g, "-");
  const locationMap: Record<string, string> = {
    eldin: "location-eldin",
    faron: "location-faron",
    gerudo: "location-gerudo",
    hebra: "location-hebra",
    lanayru: "location-lanayru",
    "leaf-dew-way": "location-leafdew",
    "path-of-scarlet-leaves": "location-scarletleaves",
    "central-hyrule": "location-central-hyrule",
  };
  if (locationMap[normalized]) return locationMap[normalized];
  if (normalized.includes("scarlet") || normalized.includes("leaves")) return "location-scarletleaves";
  if (normalized.includes("leaf") || normalized.includes("dew")) return "location-leafdew";
  if (normalized.includes("central")) return "location-central-hyrule";
  return "";
}

// ------------------- Monster flip card (front: stats, back: drops) -------------------
function MonsterFlipCard({ monster }: { monster: Monster }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [drops, setDrops] = useState<DropItem[] | null>(null);
  const [dropsLoading, setDropsLoading] = useState(false);
  const fetchedRef = useRef(false);
  useEffect(() => {
    fetchedRef.current = false;
    setDrops(null);
  }, [monster.name]);

  useEffect(() => {
    if (!isFlipped) return;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    setDropsLoading(true);
    fetch(`/api/models/monsters/${encodeURIComponent(monster.name)}/drops`)
      .then((res) => res.json())
      .then((data: { items?: DropItem[] }) => {
        setDrops(Array.isArray(data.items) ? data.items : []);
        setDropsLoading(false);
      })
      .catch(() => {
        setDrops([]);
        setDropsLoading(false);
      });
  }, [isFlipped, monster.name]);

  const handleFlip = () => setIsFlipped((prev) => !prev);
  const imageSrc = monsterImageUrl(monster.image);

  return (
    <div
      className={`model-details-item item-card modern-item-card flip-card flip-card-monster ${isFlipped ? "flipped" : ""}`}
      onClick={handleFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleFlip();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Flip card for ${monster.name}`}
    >
      {/* Front: monster stats (match pets/items card styling) */}
      <div className="flip-card-front item-card-front">
        <div className="item-header-row modern-item-header">
          <div className="item-image-card">
            <img
              src={imageSrc}
              alt={monster.name}
              className="item-image modern-item-image"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/ankle_icon.png";
              }}
            />
          </div>
          <div className="item-header-info modern-item-header-info">
            <div className="item-name-row">
              <span className="item-name-big">{monster.name}</span>
            </div>
            <div className="item-slot-row">
              <span className="item-slot-label">{monster.species}</span>
              <span className="item-subtype-label">{monster.type}</span>
            </div>
            <div className="item-detail-row modern-item-detail-row">
              <i className="fas fa-star" aria-hidden="true"></i>
              <strong>Tier:</strong> <span className="text-[var(--totk-light-ocher)]">{monster.tier}</span>
            </div>
          </div>
        </div>
        <div className="item-section modern-item-details">
          <div className="item-section-label modern-item-section-label">
            <i className="fas fa-info-circle" aria-hidden="true"></i> Stats
          </div>
          <div className="item-detail-list modern-item-detail-list">
            <div className="item-detail-row modern-item-detail-row">
              <i className="fas fa-heart" aria-hidden="true"></i>
              <strong>Hearts:</strong> <span className="text-[var(--totk-light-green)]">{monster.hearts}</span>
            </div>
            <div className="item-detail-row modern-item-detail-row">
              <i className="fas fa-bolt" aria-hidden="true"></i>
              <strong>Damage:</strong> <span className="text-[var(--blight-border)]">{monster.dmg}</span>
            </div>
          </div>
        </div>
        {monster.bloodmoon && (
          <div className="rounded bg-[var(--blight-border)]/30 px-2 py-1 text-center text-xs text-[var(--botw-pale)]">
            Blood Moon Monster
          </div>
        )}
        {monster.locations && monster.locations.length > 0 && (
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-map-marker-alt" aria-hidden="true"></i> Locations
            </div>
            <div className="item-tag-list modern-item-tag-list">
              {monster.locations.map((loc, idx) => (
                <span key={idx} className={`item-tag ${getLocationClass(loc)}`}>
                  {loc}
                </span>
              ))}
            </div>
          </div>
        )}
        {monster.job && monster.job.length > 0 && (
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-user" aria-hidden="true"></i> Jobs that can find this monster
            </div>
            <div className="item-tag-list modern-item-tag-list">
              {monster.job.map((j, idx) => (
                <span key={idx} className="item-tag">
                  {j}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="mt-auto text-xs text-[var(--totk-grey-200)]">Click to see drops</p>
      </div>

      {/* Back: drops list (scrollable when many drops) */}
      <div className="flip-card-back item-card-back">
        <div className="item-header-row modern-item-header shrink-0">
          <div className="item-image-card">
            <img
              src={imageSrc}
              alt={monster.name}
              className="item-image modern-item-image"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/ankle_icon.png";
              }}
            />
          </div>
          <div className="item-header-info modern-item-header-info">
            <div className="item-name-row">
              <span className="item-name-big">{monster.name}</span>
            </div>
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-gift" aria-hidden="true"></i> Drops
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden pr-2">
          {dropsLoading ? (
            <div className="item-detail-list modern-item-detail-list">
              <div className="item-detail-row modern-item-detail-row">Loading drops...</div>
            </div>
          ) : drops && drops.length > 0 ? (
            <div className="item-section modern-item-section">
              <ul className="space-y-2 pl-0 list-none text-[var(--botw-pale)] text-sm">
                {[...drops]
                  .sort(
                    (a, b) =>
                      (a.itemRarity ?? 1) - (b.itemRarity ?? 1) ||
                      (a.itemName ?? "").localeCompare(b.itemName ?? "")
                  )
                  .map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-baseline gap-2 py-1 border-b border-[var(--totk-dark-ocher)]/30 last:border-b-0"
                  >
                    <span className="text-[var(--totk-light-ocher)] shrink-0 w-5 text-xs" aria-hidden>
                      <i className="fas fa-star" />
                    </span>
                    <span className="min-w-0 flex-1">
                      {item.emoji && !/^[a-zA-Z0-9_\-:<>]+$/.test(item.emoji) ? `${item.emoji} ` : ""}
                      {item.itemName}
                    </span>
                    <span className="text-[var(--totk-grey-200)] text-xs shrink-0">
                      Rarity {item.itemRarity ?? 1}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="item-detail-list modern-item-detail-list">
              <div className="item-detail-row modern-item-detail-row">No drops recorded</div>
            </div>
          )}
        </div>
        <p className="shrink-0 text-xs text-[var(--totk-grey-200)]">Click to flip back</p>
      </div>
    </div>
  );
}

export default function MonstersPage() {
  const pathname = usePathname();
  const {
    data: monsters,
    total,
    loading,
    error,
    search,
    setSearch,
    currentPage,
    setCurrentPage,
    filterGroups,
    handleFilterChange,
    itemsPerPage,
    clearAll,
  } = useModelList<Monster>("monsters");

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    const mainElement = document.querySelector('main');
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainElement?.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
    
    // Double-check after a brief delay
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      if (window.scrollY > 0 || (mainEl?.scrollTop ?? 0) > 0) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        mainEl?.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
      }
    }, 50);
  }, []);

  // Ensure scroll to top when pathname changes (page navigation)
  useEffect(() => {
    scrollToTop();
  }, [pathname, scrollToTop]);

  // Scroll to top when pagination changes
  useEffect(() => {
    scrollToTop();
  }, [currentPage, scrollToTop]);

  // Scroll to top when search changes
  useEffect(() => {
    scrollToTop();
  }, [search, scrollToTop]);

  return (
    <ModelListPageLayout
      title="Monsters"
      loadingMessage="Loading monsters..."
      errorMessage="This page will display all monsters from the database once MongoDB connection is configured."
      itemName="monsters"
      searchPlaceholder="Search monsters by name, species, or type..."
      loading={loading}
      error={error}
      search={search}
      onSearchChange={setSearch}
      filterGroups={filterGroups}
      onFilterChange={handleFilterChange}
      onClearAll={clearAll}
      currentPage={currentPage}
      totalItems={total}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
    >
      {monsters.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">No monsters found.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
            {monsters.map((monster) => (
              <MonsterFlipCard key={monster._id} monster={monster} />
            ))}
          </div>
          {total > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}
    </ModelListPageLayout>
  );
}
