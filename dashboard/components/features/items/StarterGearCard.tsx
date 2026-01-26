"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
import { formatItemImageUrl } from "@/lib/item-utils";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================
export type StarterGearItem = {
  _id: string;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  modifierHearts?: number;
  staminaToCraft?: number;
};

// ============================================================================
// ------------------- Component -------------------
// ============================================================================
export function StarterGearCard({ item }: { item: StarterGearItem }) {
  const imageUrl = formatItemImageUrl(item.image);

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

  return (
    <div className="model-details-item item-card modern-item-card" style={{ padding: '1.5rem' }}>
      {/* Header */}
      <div className="item-header-row modern-item-header" style={{ marginBottom: '1.25rem' }}>
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
        </div>
      </div>

      {/* Stats Section */}
      <div className="item-section modern-item-section">
        <div className="item-section-label modern-item-section-label" style={{ marginBottom: '0.875rem' }}>
          <i className="fas fa-chart-bar" aria-hidden="true"></i> Stats
        </div>
        <div className="item-detail-list modern-item-detail-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {item.modifierHearts != null && (
            <div className="item-detail-row modern-item-detail-row" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem'
            }}>
              <i className="fas fa-heart" style={{ color: 'var(--totk-light-green)', flexShrink: 0 }} aria-hidden="true"></i>
              <strong style={{ color: 'var(--botw-pale)', marginRight: 'auto' }}>Modifier:</strong>
              <span style={{ color: 'var(--totk-light-green)', fontWeight: '600' }}>{item.modifierHearts}</span>
            </div>
          )}
          {item.staminaToCraft != null && (
            <div className="item-detail-row modern-item-detail-row" style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem',
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem'
            }}>
              <i className="fas fa-tools" style={{ color: 'var(--botw-blue)', flexShrink: 0 }} aria-hidden="true"></i>
              <strong style={{ color: 'var(--botw-pale)', marginRight: 'auto' }}>Stamina to Craft:</strong>
              <span style={{ color: 'var(--botw-blue)', fontWeight: '600' }}>{item.staminaToCraft}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
