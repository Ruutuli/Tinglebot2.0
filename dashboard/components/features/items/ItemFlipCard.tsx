"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
import { useState, useEffect } from "react";
import {
  formatSources,
  formatLocations,
  formatJobs,
  formatSpecialWeather,
  formatCraftingMaterials,
  formatItemImageUrl,
  getMainCategory,
  getMainType,
  type ItemData,
} from "@/lib/item-utils";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================
export type ItemFlipCardProps = ItemData & {
  _id: string;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  itemRarity: number;
  category: string[] | string;
  type: string[] | string;
  subtype?: string[] | string;
  buyPrice: number;
  sellPrice: number;
  stackable: boolean;
  maxStackSize: number;
  modifierHearts?: number;
  staminaRecovered?: number;
  staminaToCraft?: number;
  entertainerItems?: boolean;
  divineItems?: boolean;
};

type CharacterOwnership = {
  characterId: string;
  characterName: string;
  quantity: number;
};

type OwnershipData = {
  itemName: string;
  totalInWorld: number;
  characters: CharacterOwnership[];
};

// ============================================================================
// ------------------- Component -------------------
// ============================================================================
export function ItemFlipCard({ item }: { item: ItemFlipCardProps }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const [ownershipData, setOwnershipData] = useState<OwnershipData | null>(null);
  const [isLoadingOwnership, setIsLoadingOwnership] = useState(false);

  const sources = formatSources(item);
  const locations = formatLocations(item);
  const jobs = formatJobs(item);
  const specialWeather = formatSpecialWeather(item);
  const craftingMaterials = formatCraftingMaterials(item);
  const mainCategory = getMainCategory(item);
  const mainType = getMainType(item);
  const imageUrl = formatItemImageUrl(item.image);

  // Type bar color mapping (based on category)
  const typeColorMap: Record<string, string> = {
    Armor: "#1F5D50",
    Weapon: "#B99F65",
    Shield: "#6A8ED6",
    Material: "#0169A0",
    Recipe: "#AF966D",
    Misc: "#888888",
  };
  const typeBarColor = typeColorMap[mainCategory] || "#1F5D50";

  // Format subtype
  const subtypeDisplay =
    item.subtype && Array.isArray(item.subtype)
      ? item.subtype.filter(Boolean).join(", ")
      : item.subtype || "";

  // Slot is the first type (e.g., "Material", "Plant") - this is what shows in the slot label
  const slot = mainType || "";
  
  // Type bar shows the category (mainCategory), not the type

  // Fetch ownership data when card is flipped
  useEffect(() => {
    if (isFlipped && !ownershipData && !isLoadingOwnership) {
      setIsLoadingOwnership(true);
      fetch(`/api/models/items/${encodeURIComponent(item.itemName)}/ownership`)
        .then((res) => res.json())
        .then((data: OwnershipData) => {
          setOwnershipData(data);
          setIsLoadingOwnership(false);
        })
        .catch((err) => {
          console.error("Failed to fetch ownership data:", err);
          setIsLoadingOwnership(false);
        });
    }
  }, [isFlipped, item.itemName, ownershipData, isLoadingOwnership]);

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  // Check if emoji is actually an emoji character, not a code
  const isValidEmoji = (emoji?: string): boolean => {
    if (!emoji) return false;
    // Hide if it looks like Discord emoji code (<:name:id> or :name:)
    if (emoji.includes("<") || (emoji.startsWith(":") && emoji.endsWith(":"))) {
      return false;
    }
    // Hide if it's just text/code (contains only alphanumeric, underscores, hyphens)
    if (/^[a-zA-Z0-9_\-:<>]+$/.test(emoji) && !/[\u{1F300}-\u{1F9FF}]/u.test(emoji)) {
      return false;
    }
    return true;
  };

  const shouldShowEmoji = isValidEmoji(item.emoji);

  // Map location names to CSS classes
  const getLocationClass = (locationName: string | null | undefined): string => {
    const normalized = String(locationName ?? "").toLowerCase().replace(/\s+/g, "-");
    const locationMap: Record<string, string> = {
      "eldin": "location-eldin",
      "faron": "location-faron",
      "gerudo": "location-gerudo",
      "hebra": "location-hebra",
      "lanayru": "location-lanayru",
      "leaf-dew-way": "location-leafdew",
      "path-of-scarlet-leaves": "location-scarletleaves",
      "central-hyrule": "location-central-hyrule",
    };
    
    // Try exact match first
    if (locationMap[normalized]) {
      return locationMap[normalized];
    }
    
    // Try partial matches for variations
    if (normalized.includes("scarlet") || normalized.includes("leaves")) {
      return "location-scarletleaves";
    }
    if (normalized.includes("leaf") || normalized.includes("dew")) {
      return "location-leafdew";
    }
    if (normalized.includes("central")) {
      return "location-central-hyrule";
    }
    
    return ""; // Return empty string if no match
  };

  return (
    <div
      className={`model-details-item item-card modern-item-card flip-card ${isFlipped ? "flipped" : ""}`}
      onClick={handleFlip}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleFlip();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Flip card for ${item.itemName}`}
    >
      {/* Front Side */}
      <div className="flip-card-front item-card-front">
          <div className="item-header-row modern-item-header">
            <div className="item-image-card">
              <img
                src={imageUrl}
                alt={item.itemName}
                className="item-image modern-item-image"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = "/ankle_icon.png";
                }}
              />
              {shouldShowEmoji && (
                <span className="item-emoji" aria-hidden="true">
                  {item.emoji}
                </span>
              )}
            </div>
            <div className="item-header-info modern-item-header-info">
              <div className="item-name-row">
                <span className="item-name-big">{item.itemName}</span>
              </div>
              <div
                className="item-type-bar"
                style={{ background: typeBarColor }}
              >
                {item.imageType && item.imageType !== "No Image Type" ? (
                  <img
                    src={item.imageType}
                    alt="Type Icon"
                    width={24}
                    height={24}
                    className="item-type-icon"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = "none";
                    }}
                  />
                ) : (
                  <i className="fas fa-star" aria-hidden="true"></i>
                )}
                <span className="item-type-bar-label">{mainCategory}</span>
              </div>
              <div className="item-slot-row">
                {slot && <span className="item-slot-label">{slot}</span>}
                {subtypeDisplay && (
                  <span className="item-subtype-label">{subtypeDisplay}</span>
                )}
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="item-section modern-item-details">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-info-circle" aria-hidden="true"></i> Details
            </div>
            <div className="item-detail-list modern-item-detail-list">
              <div className="item-detail-row modern-item-detail-row">
                <i className="fas fa-coins" aria-hidden="true"></i>
                <strong>Buy:</strong> <span>{item.buyPrice ?? 0}</span>
              </div>
              <div className="item-detail-row modern-item-detail-row">
                <i className="fas fa-hand-holding-usd" aria-hidden="true"></i>
                <strong>Sell:</strong> <span>{item.sellPrice ?? 0}</span>
              </div>
              <div className="item-detail-row modern-item-detail-row">
                <i className="fas fa-star" aria-hidden="true"></i>
                <strong>Rarity:</strong> <span>{item.itemRarity || 1}</span>
              </div>
              {/* Stats Section - Show for craftable items, weapons, and armor */}
              {(craftingMaterials || mainCategory === "Weapon" || mainCategory === "Armor") && (item.modifierHearts != null || item.staminaRecovered != null || item.staminaToCraft != null) && (
                <>
                  {item.modifierHearts != null && (
                    <div className="item-detail-row modern-item-detail-row">
                      <i className="fas fa-heart" aria-hidden="true"></i>
                      <strong>
                        {mainCategory === "Weapon" || mainCategory === "Armor" ? "Modifier" : "Hearts"}:
                      </strong>{" "}
                      <span>{item.modifierHearts}</span>
                    </div>
                  )}
                  {item.staminaRecovered != null && (
                    <div className="item-detail-row modern-item-detail-row">
                      <i className="fas fa-bolt" aria-hidden="true"></i>
                      <strong>Stamina Recovered:</strong> <span>{item.staminaRecovered}</span>
                    </div>
                  )}
                  {item.staminaToCraft != null && (
                    <div className="item-detail-row modern-item-detail-row">
                      <i className="fas fa-tools" aria-hidden="true"></i>
                      <strong>Stamina to Craft:</strong> <span>{item.staminaToCraft}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Sources Section */}
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-route" aria-hidden="true"></i> Sources
            </div>
            <div className="item-tag-list modern-item-tag-list">
              {sources.map((source, idx) => (
                <span key={idx} className="item-tag">
                  {source}
                </span>
              ))}
            </div>
          </div>

          {/* Locations Section */}
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-map-marker-alt" aria-hidden="true"></i>{" "}
              Locations
            </div>
            <div className="item-tag-list modern-item-tag-list">
              {locations.map((location, idx) => {
                const locationClass = getLocationClass(location);
                return (
                  <span key={idx} className={`item-tag ${locationClass}`}>
                    {location}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Jobs Section */}
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-user" aria-hidden="true"></i> Jobs
            </div>
            <div className="item-tag-list modern-item-tag-list">
              {jobs.map((job, idx) => (
                <span key={idx} className="item-tag">
                  {job}
                </span>
              ))}
            </div>
          </div>

          {/* Crafting Materials Section */}
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-tools" aria-hidden="true"></i> Crafting
              Materials
            </div>
            <div className="item-crafting-list modern-item-crafting-list">
              {craftingMaterials ? (
                craftingMaterials.map((mat, idx) => (
                  <div key={idx} className="item-crafting-row">
                    <span className="item-crafting-qty">
                      {mat.quantity} ×
                    </span>
                    <span className="item-tag">{mat.itemName}</span>
                  </div>
                ))
              ) : (
                <div className="item-crafting-row">
                  <span className="item-tag">Not Craftable</span>
                </div>
              )}
            </div>
          </div>

          {/* Special Weather Section */}
          <div className="item-section modern-item-section">
            <div className="item-section-label modern-item-section-label">
              <i className="fas fa-cloud-sun" aria-hidden="true"></i> Special
              Weather
            </div>
            <div className="item-tag-list modern-item-tag-list">
              {specialWeather.map((weather, idx) => (
                <span key={idx} className="item-tag">
                  {weather}
                </span>
              ))}
            </div>
          </div>

          {/* Entertainer / Divine item tags (public) */}
          {(item.entertainerItems || item.divineItems) && (
            <div className="item-section modern-item-section">
              <div className="item-section-label modern-item-section-label">
                <i className="fas fa-tags" aria-hidden="true"></i> Boost tags
              </div>
              <div className="item-tag-list modern-item-tag-list">
                {item.entertainerItems && (
                  <span className="item-tag">Entertainer item</span>
                )}
                {item.divineItems && (
                  <span className="item-tag">Divine item</span>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Back Side - Character Ownership */}
          <div className="flip-card-back item-card-back">
            <div className="item-header-row modern-item-header">
              <div className="item-image-card">
                <img
                  src={imageUrl}
                  alt={item.itemName}
                  className="item-image modern-item-image"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "/ankle_icon.png";
                  }}
                />
                {shouldShowEmoji && (
                  <span className="item-emoji" aria-hidden="true">
                    {item.emoji}
                  </span>
                )}
              </div>
              <div className="item-header-info modern-item-header-info">
                <div className="item-name-row">
                  <span className="item-name-big">{item.itemName}</span>
                </div>
                <div
                  className="item-type-bar"
                  style={{ background: typeBarColor }}
                >
                  {item.imageType && item.imageType !== "No Image Type" ? (
                    <img
                      src={item.imageType}
                      alt="Type Icon"
                      width={24}
                      height={24}
                      className="item-type-icon"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  ) : (
                    <i className="fas fa-star" aria-hidden="true"></i>
                  )}
                  <span className="item-type-bar-label">{mainCategory}</span>
                </div>
              </div>
            </div>

            {/* Character Ownership Section */}
            <div className="item-section modern-item-section">
              <div className="item-section-label modern-item-section-label">
                <i className="fas fa-users" aria-hidden="true"></i> Characters that have {item.itemName}
              </div>
              {isLoadingOwnership ? (
                <div className="item-detail-list modern-item-detail-list">
                  <div className="item-detail-row modern-item-detail-row">
                    Loading...
                  </div>
                </div>
              ) : ownershipData ? (
                <div className="item-ownership-list">
                  <div className="item-ownership-total">
                    <strong>Total in world:</strong> {(ownershipData.totalInWorld || 0).toLocaleString()}
                  </div>
                  <div className="item-ownership-characters">
                    {ownershipData.characters && ownershipData.characters.length > 0 ? (
                      ownershipData.characters.map((char) => (
                        <div key={char.characterId} className="item-ownership-row">
                          <span className="item-ownership-character">{char.characterName}</span>
                          <span className="item-ownership-quantity">x{(char.quantity || 0).toLocaleString()}</span>
                        </div>
                      ))
                    ) : (
                      <div className="item-detail-row modern-item-detail-row">
                        No characters found
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="item-detail-list modern-item-detail-list">
                  <div className="item-detail-row modern-item-detail-row">
                    No ownership data available
                  </div>
                </div>
              )}
            </div>
          </div>
    </div>
  );
}
