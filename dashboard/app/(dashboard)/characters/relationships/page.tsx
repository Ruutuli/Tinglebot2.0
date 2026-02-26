"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { Loading, Tabs, Modal, SearchFilterBar, Pagination } from "@/components/ui";
import type { FilterGroup } from "@/components/ui";
import { capitalize, createSlug } from "@/lib/string-utils";
import { imageUrlForGcsUrl } from "@/lib/image-url";
import { RELATIONSHIP_CONFIG, type RelationshipType } from "@/data/relationshipConfig";
import { getVillageCrestIcon } from "@/app/(dashboard)/models/characters/page";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type CharacterRef = {
  _id: string;
  name: string;
  race?: string;
  job?: string;
  currentVillage?: string;
  homeVillage?: string;
  icon?: string;
};

type Character = {
  _id: string;
  name: string;
  race?: string;
  job?: string;
  currentVillage?: string;
  homeVillage?: string;
  icon?: string;
  userId?: string;
};

type Relationship = {
  _id: string;
  userId: string;
  characterId: CharacterRef | string;
  targetCharacterId: CharacterRef | string;
  characterName: string;
  targetCharacterName: string;
  relationshipTypes: RelationshipType[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

type TabValue = "my-relationships" | "all-relationships" | "all-entries";

// ============================================================================
// ------------------- Constants & Helpers -------------------
// ============================================================================

const CARD_BASE_CLASS = "group relative overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 shadow-lg transition-all duration-300 hover:border-[var(--totk-light-green)] hover:shadow-xl hover:shadow-[var(--totk-light-green)]/30 hover:-translate-y-1 cursor-pointer";

const IMAGE_CONTAINER_CLASS = "relative h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)] shadow-inner";

const EMPTY_STATE_CLASS = "rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 p-12 text-center";

const normalizeImageUrl = (imageUrl: string | undefined): string => {
  if (!imageUrl) return "/ankle_icon.png";
  if (imageUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(imageUrl);
  }
  return imageUrl;
};

const getCharacter = (char: CharacterRef | string): CharacterRef | null => {
  if (typeof char === "string") return null;
  return char;
};

const getCharacterId = (char: CharacterRef | string | null | undefined): string | null => {
  if (!char) return null;
  if (typeof char === "string") return char;
  if (typeof char === "object" && char !== null && "_id" in char) {
    return typeof char._id === "string" ? char._id : String(char._id);
  }
  return null;
};

// Get primary relationship type config (uses first type, or NEUTRAL as fallback)
const getPrimaryRelationshipConfig = (types: RelationshipType[]) => {
  if (types.length === 0) return RELATIONSHIP_CONFIG.NEUTRAL;
  return RELATIONSHIP_CONFIG[types[0]];
};

// ============================================================================
// ------------------- Components -------------------
// ============================================================================

function RelationshipTypeBadge({ type }: { type: RelationshipType }) {
  const config = RELATIONSHIP_CONFIG[type];
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold shadow-sm"
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
      }}
    >
      {config.label}
    </span>
  );
}

function CharacterCard({ 
  character, 
  onClick, 
  relationshipCount 
}: { 
  character: Character; 
  onClick: () => void;
  relationshipCount: number;
}) {
  const iconUrl = character.icon ? normalizeImageUrl(character.icon) : "/ankle_icon.png";
  const village = character.homeVillage || character.currentVillage || "";
  const villageCrestIcon = village ? getVillageCrestIcon(village) : null;
  const hasRelationships = relationshipCount > 0;

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    target.src = "/ankle_icon.png";
  }, []);

  return (
    <article 
      className={`${CARD_BASE_CLASS} p-4 sm:p-6 relative ${!hasRelationships ? 'opacity-50 grayscale' : ''}`} 
      onClick={onClick}
    >
      {/* Relationship Count Badge */}
      {hasRelationships && (
        <div className="absolute top-2 right-2 z-10">
          <div className="flex items-center gap-1 rounded-full bg-gradient-to-br from-[#e07a7a]/90 to-[#ff69b4]/90 px-2.5 py-1 shadow-lg border border-[#e07a7a]/50">
            <i className="fa-solid fa-heart text-xs text-white" />
            <span className="text-xs font-bold text-white tabular-nums">
              {relationshipCount}
            </span>
          </div>
        </div>
      )}
      
      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <div className={IMAGE_CONTAINER_CLASS}>
          <Image
            src={iconUrl}
            alt={character.name}
            fill
            className="object-cover"
            onError={handleImageError}
            unoptimized
          />
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <h3 className="text-lg sm:text-xl font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
            {character.name}
          </h3>
          {character.race && (
            <p className="text-xs sm:text-sm text-[var(--botw-pale)] opacity-90">
              {capitalize(character.race)}
            </p>
          )}
          {character.job && (
            <p className="text-xs text-[var(--totk-grey-200)] opacity-75">
              {capitalize(character.job)}
            </p>
          )}
          {villageCrestIcon && (
            <img
              src={villageCrestIcon}
              alt={`${village} crest`}
              className="h-6 w-6 sm:h-8 sm:w-8 object-contain opacity-90 mt-1"
            />
          )}
        </div>
      </div>
    </article>
  );
}

function CharacterRelationshipsModal({
  character,
  outgoingRelationships: initialOutgoingRelationships,
  incomingRelationships: initialIncomingRelationships,
  open,
  onOpenChange,
  loading,
  user,
  onRefresh,
  onEditClick,
}: {
  character: Character | null;
  outgoingRelationships: Relationship[];
  incomingRelationships: Relationship[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  user: { id: string } | null;
  onRefresh: () => void;
  onEditClick: (relationship: Relationship) => void;
}) {
  // Use local state to allow optimistic updates
  const [outgoingRelationships, setOutgoingRelationships] = useState<Relationship[]>(initialOutgoingRelationships);
  const [incomingRelationships, setIncomingRelationships] = useState<Relationship[]>(initialIncomingRelationships);

  // Update local state when props change (when modal opens or data refreshes)
  useEffect(() => {
    setOutgoingRelationships(initialOutgoingRelationships);
    setIncomingRelationships(initialIncomingRelationships);
  }, [initialOutgoingRelationships, initialIncomingRelationships]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

  const handleDelete = useCallback(async (relationshipId: string, characterName: string, targetName: string) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the relationship between ${characterName} and ${targetName}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(relationshipId);
      setDeleteError(null);
      setDeleteSuccess(null);

      const res = await fetch("/api/characters/relationships", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ relationshipId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete relationship");
      }

      // Optimistically remove the relationship from the UI immediately
      // This makes the UI feel more responsive while the refresh happens
      setOutgoingRelationships(prev => prev.filter(rel => rel._id !== relationshipId));
      setIncomingRelationships(prev => prev.filter(rel => rel._id !== relationshipId));

      // Show success message
      setDeleteSuccess(`Relationship between ${characterName} and ${targetName} deleted successfully`);

      // Refresh the relationships to ensure we have the latest data
      console.log("[CharacterRelationshipsModal] Refreshing relationships after delete...");
      await onRefresh();
      console.log("[CharacterRelationshipsModal] Relationships refreshed");

      // Auto-clear success message after 3 seconds
      setTimeout(() => {
        setDeleteSuccess(null);
      }, 3000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete relationship";
      setDeleteError(errorMessage);
      console.error("[CharacterRelationshipsModal] Failed to delete relationship:", err);
    } finally {
      setDeletingId(null);
    }
  }, [onRefresh]);

  // Group relationships by target character
  const relationshipMap = useMemo(() => {
    const map = new Map<string, {
      targetChar: CharacterRef | null;
      targetName: string;
      outgoing?: Relationship;
      incoming?: Relationship;
    }>();

    // Add outgoing relationships
    outgoingRelationships.forEach((rel) => {
      const targetId = getCharacterId(rel.targetCharacterId);
      if (!targetId) return;
      
      const targetChar = getCharacter(rel.targetCharacterId);
      
      if (!map.has(targetId)) {
        map.set(targetId, {
          targetChar,
          targetName: rel.targetCharacterName,
        });
      }
      map.get(targetId)!.outgoing = rel;
    });

    // Add incoming relationships
    incomingRelationships.forEach((rel) => {
      const sourceId = getCharacterId(rel.characterId);
      if (!sourceId) return;
      
      const sourceChar = getCharacter(rel.characterId);
      
      if (!map.has(sourceId)) {
        map.set(sourceId, {
          targetChar: sourceChar,
          targetName: rel.characterName,
        });
      }
      map.get(sourceId)!.incoming = rel;
    });

    return Array.from(map.values());
  }, [outgoingRelationships, incomingRelationships]);

  const totalRelationships = relationshipMap.length;

  // Auto-close modal if all relationships are deleted
  useEffect(() => {
    if (!loading && totalRelationships === 0 && deleteSuccess) {
      // Close modal after showing success message for 2 seconds
      const timer = setTimeout(() => {
        onOpenChange(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, totalRelationships, deleteSuccess, onOpenChange]);

  if (!character) return null;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`${character.name}'s Relationships`}
      size="xl"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loading message="Loading relationships..." variant="inline" size="md" />
        </div>
      ) : totalRelationships === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-4">💝</div>
          <p className="text-sm text-[var(--botw-pale)] opacity-60 italic">
            {character.name} doesn't have any relationships yet.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Delete Success Message */}
          {deleteSuccess && (
            <div className="mb-4 rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--botw-warm-black)]/90 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-check-circle text-[var(--totk-light-green)]" />
                  <p className="text-sm text-[var(--totk-light-green)]">{deleteSuccess}</p>
                </div>
                <button
                  onClick={() => setDeleteSuccess(null)}
                  className="text-[var(--totk-light-green)] hover:text-[var(--totk-light-green)]/80 p-2 -mr-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
          )}

          {/* Delete Error Message */}
          {deleteError && (
            <div className="mb-4 rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <i className="fa-solid fa-exclamation-circle text-[#ff6347]" />
                  <p className="text-sm text-[#ff6347]">{deleteError}</p>
                </div>
                <button
                  onClick={() => setDeleteError(null)}
                  className="text-[#ff6347] hover:text-[#ff6347]/80 p-2 -mr-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                >
                  <i className="fa-solid fa-xmark" />
                </button>
              </div>
            </div>
          )}

          {relationshipMap.map((relData, index) => {
            const targetChar = relData.targetChar;
            const targetIconUrl = targetChar?.icon ? normalizeImageUrl(targetChar.icon) : "/ankle_icon.png";
            const targetVillage = targetChar?.homeVillage || targetChar?.currentVillage || "";
            const targetVillageCrestIcon = targetVillage ? getVillageCrestIcon(targetVillage) : null;
            const targetSlug = createSlug(relData.targetName);

            return (
              <div
                key={`${relData.targetName}-${index}`}
                className="rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/80 to-[var(--totk-brown)]/40 p-3 sm:p-5 shadow-lg"
              >
                {/* Character Header */}
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 mb-4 sm:mb-5 pb-3 sm:pb-4 border-b-2 border-[var(--totk-dark-ocher)]/40">
                  <Link
                    href={`/characters/${targetSlug}`}
                    className="flex flex-col sm:flex-row items-center sm:items-center gap-3 hover:opacity-80 transition-opacity w-full sm:w-auto"
                  >
                    <div className="relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-lg border-2 border-[var(--totk-light-green)]/50 bg-[var(--botw-warm-black)] shadow-lg ring-2 ring-[var(--totk-light-green)]/20">
                      <Image
                        src={targetIconUrl}
                        alt={relData.targetName}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="text-center sm:text-left">
                      <h4 className="text-base sm:text-lg font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                        {relData.targetName}
                      </h4>
                      {targetChar?.race && (
                        <p className="text-xs text-[var(--botw-pale)] opacity-90">
                          {capitalize(targetChar.race)}
                        </p>
                      )}
                      {targetVillageCrestIcon && (
                        <img
                          src={targetVillageCrestIcon}
                          alt={`${targetVillage} crest`}
                          className="h-6 w-6 object-contain opacity-90 mt-1 mx-auto sm:mx-0"
                        />
                      )}
                    </div>
                  </Link>
                </div>

                {/* My character feels this way */}
                {relData.outgoing && (() => {
                  const primaryConfig = getPrimaryRelationshipConfig(relData.outgoing.relationshipTypes);
                  const isOwnRelationship = relData.outgoing.userId === user?.id;
                  const isDeleting = deletingId === relData.outgoing._id;
                  
                  return (
                    <div 
                      className="relative mb-3 sm:mb-4 rounded-lg border-2 p-3 sm:p-4 shadow-inner"
                      style={{
                        borderColor: `${primaryConfig.borderColor}`,
                        background: `linear-gradient(to bottom right, ${primaryConfig.bgColor}, transparent)`,
                      }}
                    >
                      {/* Edit and Delete Buttons */}
                      {isOwnRelationship && (
                        <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditClick(relData.outgoing!);
                            }}
                            className="rounded-md border-2 border-[var(--totk-light-green)]/60 bg-[var(--botw-warm-black)]/90 p-2 sm:p-1.5 text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/20 hover:border-[var(--totk-light-green)] transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                            title="Edit relationship"
                          >
                            <i className="fa-solid fa-pencil text-sm sm:text-xs" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(relData.outgoing!._id, character.name, relData.targetName);
                            }}
                            disabled={isDeleting}
                            className="rounded-md border-2 border-[#ff6347]/60 bg-[var(--botw-warm-black)]/90 p-2 sm:p-1.5 text-[#ff6347] hover:bg-[#ff6347]/20 hover:border-[#ff6347] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                            title="Delete relationship"
                          >
                            {isDeleting ? (
                              <i className="fa-solid fa-spinner fa-spin text-sm sm:text-xs" />
                            ) : (
                              <i className="fa-solid fa-trash text-sm sm:text-xs" />
                            )}
                          </button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap pr-12 sm:pr-16">
                        <div className="flex items-center gap-1.5">
                          {relData.outgoing.relationshipTypes.map((type) => {
                            const config = RELATIONSHIP_CONFIG[type];
                            return (
                              <i 
                                key={type}
                                className={`fa-solid ${config.icon} text-base sm:text-lg`}
                                style={{ color: config.color }}
                                title={config.label}
                              />
                            );
                          })}
                        </div>
                        <p 
                          className="text-xs sm:text-sm font-bold uppercase tracking-wider"
                          style={{ color: primaryConfig.color }}
                        >
                          {character.name} feels this way:
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        {relData.outgoing.relationshipTypes.map((type) => (
                          <RelationshipTypeBadge key={type} type={type} />
                        ))}
                      </div>
                      {relData.outgoing.notes && (
                        <div 
                          className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t"
                          style={{ borderColor: `${primaryConfig.borderColor}` }}
                        >
                          <p className="text-xs sm:text-sm text-[var(--botw-pale)] whitespace-pre-wrap break-words leading-relaxed">
                            {relData.outgoing.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* This character feels this way */}
                {relData.incoming && (() => {
                  const primaryConfig = getPrimaryRelationshipConfig(relData.incoming.relationshipTypes);
                  return (
                    <div 
                      className="rounded-lg border-2 p-3 sm:p-4 shadow-inner"
                      style={{
                        borderColor: `${primaryConfig.borderColor}`,
                        background: `linear-gradient(to bottom right, ${primaryConfig.bgColor}, transparent)`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          {relData.incoming.relationshipTypes.map((type) => {
                            const config = RELATIONSHIP_CONFIG[type];
                            return (
                              <i 
                                key={type}
                                className={`fa-solid ${config.icon} text-base sm:text-lg`}
                                style={{ color: config.color }}
                                title={config.label}
                              />
                            );
                          })}
                        </div>
                        <p 
                          className="text-xs sm:text-sm font-bold uppercase tracking-wider"
                          style={{ color: primaryConfig.color }}
                        >
                          {relData.targetName} feels this way:
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                        {relData.incoming.relationshipTypes.map((type) => (
                          <RelationshipTypeBadge key={type} type={type} />
                        ))}
                      </div>
                      {relData.incoming.notes && (
                        <div 
                          className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t"
                          style={{ borderColor: `${primaryConfig.borderColor}` }}
                        >
                          <p className="text-xs sm:text-sm text-[var(--botw-pale)] whitespace-pre-wrap break-words leading-relaxed">
                            {relData.incoming.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function CreateRelationshipModal({
  myCharacters,
  open,
  onOpenChange,
  onSuccess,
  relationshipToEdit,
}: {
  myCharacters: Character[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void | Promise<void>;
  relationshipToEdit?: Relationship | null;
}) {
  const isEditMode = !!relationshipToEdit;
  const [characterAId, setCharacterAId] = useState<string>("");
  const [characterBId, setCharacterBId] = useState<string>("");
  const [characterBSearch, setCharacterBSearch] = useState<string>("");
  const [characterBDropdownOpen, setCharacterBDropdownOpen] = useState<boolean>(false);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(false);
  const [searchResults, setSearchResults] = useState<Character[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<RelationshipType[]>([]);
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch initial characters for Character B selector (first 100 for initial display)
  useEffect(() => {
    if (open && allCharacters.length === 0 && !loadingCharacters) {
      const fetchInitialCharacters = async () => {
        try {
          setLoadingCharacters(true);
          const res = await fetch("/api/models/characters?limit=100");
          if (!res.ok) throw new Error("Failed to fetch characters");
          const data = await res.json();
          const characters = data.data || [];
          console.log(`[CreateRelationshipModal] Loaded ${characters.length} initial characters`);
          setAllCharacters(characters);
        } catch (err) {
          console.error("Failed to load characters:", err);
          setError("Failed to load characters");
        } finally {
          setLoadingCharacters(false);
        }
      };
      fetchInitialCharacters();
    }
  }, [open, allCharacters.length, loadingCharacters]);

  // Search for characters when user types (using API search parameter)
  useEffect(() => {
    if (!open) return;
    
    const searchTerm = characterBSearch.trim();
    
    // If search term is empty, clear search results and use initial characters
    if (!searchTerm) {
      setSearchResults([]);
      return;
    }

    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(async () => {
      try {
        setLoadingSearch(true);
        const res = await fetch(`/api/models/characters?limit=100&search=${encodeURIComponent(searchTerm)}`);
        if (!res.ok) throw new Error("Failed to search characters");
        const data = await res.json();
        const characters = data.data || [];
        console.log(`[CreateRelationshipModal] Found ${characters.length} characters for search "${searchTerm}"`);
        setSearchResults(characters);
      } catch (err) {
        console.error("Failed to search characters:", err);
        setSearchResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [characterBSearch, open]);

  // Reset form when modal opens/closes or populate when editing
  useEffect(() => {
    if (!open) {
      setCharacterAId("");
      setCharacterBId("");
      setCharacterBSearch("");
      setCharacterBDropdownOpen(false);
      setSelectedTypes([]);
      setNotes("");
      setError(null);
      setSuccess(null);
      setSearchResults([]);
    } else if (relationshipToEdit) {
      // Populate form with relationship data for editing
      const charAId = typeof relationshipToEdit.characterId === 'string' 
        ? relationshipToEdit.characterId 
        : relationshipToEdit.characterId._id;
      const charBId = typeof relationshipToEdit.targetCharacterId === 'string'
        ? relationshipToEdit.targetCharacterId
        : relationshipToEdit.targetCharacterId._id;
      
      setCharacterAId(String(charAId));
      setCharacterBId(String(charBId));
      setCharacterBSearch(relationshipToEdit.targetCharacterName);
      setSelectedTypes(relationshipToEdit.relationshipTypes);
      setNotes(relationshipToEdit.notes || "");
    }
  }, [open, relationshipToEdit]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Don't close if clicking inside the dropdown container or input
      if (!target.closest('.character-b-dropdown-container') && 
          !target.closest('input[type="text"]')) {
        setCharacterBDropdownOpen(false);
      }
    };

    if (characterBDropdownOpen) {
      // Use a small delay to avoid immediate closure when opening
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 100);
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [characterBDropdownOpen]);

  // Use search results when searching, otherwise use initial characters
  const filteredCharactersB = useMemo(() => {
    const searchTerm = characterBSearch.trim();
    
    // If searching, use API search results
    if (searchTerm && searchResults.length > 0) {
      return searchResults;
    }
    
    // If searching but no results yet, return empty (will show loading)
    if (searchTerm) {
      return [];
    }
    
    // No search term - show initial characters
    return allCharacters.slice(0, 100);
  }, [allCharacters, characterBSearch, searchResults]);

  const toggleRelationshipType = (type: RelationshipType) => {
    setSelectedTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!isEditMode) {
      // Only validate character selection when creating, not editing
      if (!characterAId) {
        setError("Please select Character A");
        return;
      }

      if (!characterBId) {
        setError("Please select Character B");
        return;
      }

      if (characterAId === characterBId) {
        setError("A character cannot have a relationship with themselves");
        return;
      }
    }

    if (selectedTypes.length === 0) {
      setError("Please select at least one relationship type");
      return;
    }

    if (notes.length > 1000) {
      setError("Notes cannot exceed 1000 characters");
      return;
    }

    try {
      setSubmitting(true);
      
      const url = "/api/characters/relationships";
      const method = isEditMode ? "PUT" : "POST";
      const body = isEditMode
        ? {
            relationshipId: relationshipToEdit!._id,
            relationshipTypes: selectedTypes,
            notes: notes.trim() || undefined,
          }
        : {
            characterId: characterAId,
            targetCharacterId: characterBId,
            relationshipTypes: selectedTypes,
            notes: notes.trim() || undefined,
          };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditMode ? 'update' : 'create'} relationship`);
      }

      setSuccess(`Relationship ${isEditMode ? 'updated' : 'created'} successfully!`);
      // Close modal immediately and refresh in background
      onOpenChange(false);
      // Refresh relationships after a brief delay to ensure API has processed
      setTimeout(async () => {
        await onSuccess();
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${isEditMode ? 'update' : 'create'} relationship`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCharacterA = myCharacters.find((c) => c._id === characterAId);
  const selectedCharacterB = allCharacters.find((c) => c._id === characterBId);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditMode ? "Edit Relationship" : "Create New Relationship"}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Character A Selection */}
        <div>
          <label className="block text-sm font-bold text-[var(--totk-light-green)] mb-2">
            Character A (Your Character) *
          </label>
          {isEditMode ? (
            <div className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 px-4 py-2 text-[var(--botw-pale)] opacity-75">
              {selectedCharacterA?.name || relationshipToEdit?.characterName}
            </div>
          ) : (
            <select
              value={characterAId}
              onChange={(e) => setCharacterAId(e.target.value)}
              className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2 text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none"
              required
            >
              <option value="">Select a character...</option>
              {myCharacters.map((char) => (
                <option key={char._id} value={char._id}>
                  {char.name} {char.race ? `(${capitalize(char.race)})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Character B Selection */}
        <div>
          <label className="block text-sm font-bold text-[var(--totk-light-green)] mb-2">
            Character B (Other Character) *
          </label>
          {isEditMode ? (
            <div className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 px-4 py-2 text-[var(--botw-pale)] opacity-75">
              {relationshipToEdit?.targetCharacterName}
            </div>
          ) : (
            <div className="relative character-b-dropdown-container">
              <div className="relative">
                <input
                  type="text"
                  value={characterBSearch}
                  onChange={(e) => {
                    const newValue = e.target.value;
                    setCharacterBSearch(newValue);
                    // Clear selection when user starts typing something different
                    if (selectedCharacterB && newValue !== selectedCharacterB.name) {
                      setCharacterBId("");
                    }
                    if (!newValue) {
                      setCharacterBId("");
                      setCharacterBSearch("");
                    }
                    setCharacterBDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setCharacterBDropdownOpen(true);
                    // If characters are loaded and no search term, show initial results
                    if (allCharacters.length > 0 && !characterBSearch.trim()) {
                      // Already handled by filteredCharactersB showing first 100
                    }
                  }}
                  placeholder="Search or select a character..."
                  className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2.5 sm:py-2 pr-12 sm:pr-10 text-sm sm:text-base text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none min-h-[44px] sm:min-h-0"
                />
                <button
                  type="button"
                  onClick={() => setCharacterBDropdownOpen(!characterBDropdownOpen)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 sm:p-2 text-[var(--botw-pale)] hover:text-[var(--totk-light-green)] transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                >
                  <i className={`fa-solid ${characterBDropdownOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} />
                </button>
              </div>
            {characterBDropdownOpen && (loadingCharacters || loadingSearch) && (
              <div className="absolute z-10 mt-1 w-full max-w-[calc(100vw-2rem)] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 shadow-lg">
                <p className="text-sm text-[var(--botw-pale)] opacity-75 text-center">
                  {loadingSearch ? "Searching..." : "Loading characters..."}
                </p>
              </div>
            )}
            {characterBDropdownOpen && !loadingCharacters && !loadingSearch && filteredCharactersB.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-60 w-full max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg">
                {filteredCharactersB.map((char) => (
                  <button
                    key={char._id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCharacterBId(char._id);
                      setCharacterBSearch(char.name);
                      setCharacterBDropdownOpen(false);
                    }}
                    onMouseDown={(e) => {
                      // Prevent the click outside handler from firing
                      e.preventDefault();
                    }}
                    className={`w-full px-4 py-3 sm:py-2 text-left hover:bg-[var(--totk-dark-ocher)]/30 transition-colors min-h-[44px] sm:min-h-0 ${
                      characterBId === char._id
                        ? "bg-[var(--totk-light-green)]/20 border-l-2 border-[var(--totk-light-green)]"
                        : ""
                    }`}
                  >
                    <div className="font-semibold text-[var(--totk-light-green)]">
                      {char.name}
                    </div>
                    <div className="text-xs text-[var(--botw-pale)] opacity-75">
                      {char.race && capitalize(char.race)}
                      {char.race && char.homeVillage && " • "}
                      {char.homeVillage && capitalize(char.homeVillage)}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {characterBDropdownOpen && !loadingCharacters && filteredCharactersB.length === 0 && characterBSearch && (
              <div className="absolute z-10 mt-1 w-full max-w-[calc(100vw-2rem)] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 shadow-lg">
                <p className="text-sm text-[var(--botw-pale)] opacity-75 text-center">
                  No characters found matching "{characterBSearch}"
                </p>
              </div>
            )}
            {characterBDropdownOpen && !loadingCharacters && !loadingSearch && filteredCharactersB.length === 0 && !characterBSearch && allCharacters.length === 0 && (
              <div className="absolute z-10 mt-1 w-full max-w-[calc(100vw-2rem)] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 shadow-lg">
                <p className="text-sm text-[var(--botw-pale)] opacity-75 text-center">
                  Loading characters...
                </p>
              </div>
            )}
            {characterBDropdownOpen && !loadingCharacters && !loadingSearch && filteredCharactersB.length === 0 && !characterBSearch && allCharacters.length > 0 && (
              <div className="absolute z-10 mt-1 w-full max-w-[calc(100vw-2rem)] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 shadow-lg">
                <p className="text-sm text-[var(--botw-pale)] opacity-75 text-center">
                  Start typing to search for characters...
                </p>
              </div>
            )}
            {selectedCharacterB && (
              <div className="mt-2 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/50 p-2">
                <span className="text-sm text-[var(--botw-pale)]">
                  Selected: <span className="font-semibold text-[var(--totk-light-green)]">{selectedCharacterB.name}</span>
                </span>
              </div>
            )}
            </div>
          )}
        </div>

        {/* Relationship Types */}
        <div>
          <label className="block text-sm font-bold text-[var(--totk-light-green)] mb-3">
            Relationship Types * (Select one or more)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {(Object.keys(RELATIONSHIP_CONFIG) as RelationshipType[]).map((type) => {
              const config = RELATIONSHIP_CONFIG[type];
              const isSelected = selectedTypes.includes(type);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleRelationshipType(type)}
                  className={`flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 sm:py-2 text-sm font-semibold transition-all min-h-[44px] sm:min-h-0 ${
                    isSelected
                      ? "shadow-lg"
                      : "border-[var(--totk-dark-ocher)]/60 hover:border-[var(--totk-dark-ocher)]"
                  }`}
                  style={{
                    backgroundColor: isSelected ? config.bgColor : "transparent",
                    color: isSelected ? config.color : "var(--botw-pale)",
                    borderColor: isSelected ? config.borderColor : undefined,
                    boxShadow: isSelected ? `0 4px 6px -1px ${config.borderColor}40, 0 2px 4px -1px ${config.borderColor}20` : "none",
                  }}
                >
                  <i className={`fa-solid ${config.icon}`} />
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-bold text-[var(--totk-light-green)] mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={1000}
            rows={4}
            className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2 text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:outline-none resize-none"
            placeholder="Add any additional notes about this relationship..."
          />
          <div className="mt-1 text-xs text-[var(--totk-grey-200)] opacity-75 text-right">
            {notes.length}/1000
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-4">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-exclamation-circle text-[#ff6347]" />
              <p className="text-sm text-[#ff6347]">{error}</p>
            </div>
          </div>
        )}

        {/* Success Message */}
        {success && (
          <div className="rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--botw-warm-black)]/90 p-4">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-check-circle text-[var(--totk-light-green)]" />
              <p className="text-sm text-[var(--totk-light-green)]">{success}</p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-[var(--totk-dark-ocher)]/40">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto rounded-md border-2 border-[var(--totk-dark-ocher)] bg-transparent px-4 py-2.5 sm:py-2 text-sm font-bold text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/20 transition-colors min-h-[44px] sm:min-h-0"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto rounded-md bg-[var(--totk-light-green)] px-4 py-2.5 sm:py-2 text-sm font-bold text-[var(--botw-warm-black)] hover:bg-[var(--totk-dark-green)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] sm:min-h-0"
          >
            {submitting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin mr-2" />
                {isEditMode ? "Updating..." : "Creating..."}
              </>
            ) : (
              <>
                <i className={`fa-solid ${isEditMode ? 'fa-pencil' : 'fa-heart'} mr-2`} />
                {isEditMode ? "Update Relationship" : "Create Relationship"}
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================================
// ------------------- AllEntriesTabContent Component -------------------
// ============================================================================

function AllEntriesTabContent({ 
  relationships, 
  user, 
  myCharacters,
  onRefresh,
  onEditClick
}: { 
  relationships: Relationship[]; 
  user: { id: string } | null;
  myCharacters: Character[];
  onRefresh: () => void;
  onEditClick: (relationship: Relationship) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<RelationshipType[]>([]);
  const [myCharactersOnly, setMyCharactersOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("date-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(24);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Create a Set of user's character IDs for efficient lookup
  const myCharacterIds = useMemo(() => {
    return new Set(myCharacters.map(char => char._id));
  }, [myCharacters]);

  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  // Filter and sort relationships
  const filteredAndSorted = useMemo(() => {
    let filtered = relationships;

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter((rel) => {
        const charA = typeof rel.characterId === "object" && rel.characterId !== null ? rel.characterId : null;
        const charB = typeof rel.targetCharacterId === "object" && rel.targetCharacterId !== null ? rel.targetCharacterId : null;
        return (
          rel.characterName.toLowerCase().includes(searchLower) ||
          rel.targetCharacterName.toLowerCase().includes(searchLower) ||
          (charA?.name && charA.name.toLowerCase().includes(searchLower)) ||
          (charB?.name && charB.name.toLowerCase().includes(searchLower))
        );
      });
    }

    // Type filter
    if (selectedTypes.length > 0) {
      filtered = filtered.filter((rel) =>
        rel.relationshipTypes.some((type) => selectedTypes.includes(type))
      );
    }

    // My characters only filter
    if (myCharactersOnly && user) {
      filtered = filtered.filter((rel) => {
        const charAId = typeof rel.characterId === 'string' ? rel.characterId : rel.characterId._id;
        const charBId = typeof rel.targetCharacterId === 'string' ? rel.targetCharacterId : rel.targetCharacterId._id;
        return myCharacterIds.has(charAId) || myCharacterIds.has(charBId);
      });
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date-desc":
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        case "date-asc":
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        case "char-a-asc":
          return a.characterName.localeCompare(b.characterName);
        case "char-a-desc":
          return b.characterName.localeCompare(a.characterName);
        case "char-b-asc":
          return a.targetCharacterName.localeCompare(b.targetCharacterName);
        case "char-b-desc":
          return b.targetCharacterName.localeCompare(a.targetCharacterName);
        case "type-asc":
          return a.relationshipTypes[0]?.localeCompare(b.relationshipTypes[0] || "") || 0;
        case "type-desc":
          return (b.relationshipTypes[0] || "").localeCompare(a.relationshipTypes[0] || "");
        default:
          return 0;
      }
    });

    return filtered;
  }, [relationships, search, selectedTypes, sortBy, myCharactersOnly, user, myCharacterIds]);

  // Paginate
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedRelationships = filteredAndSorted.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Build filter groups
  const filterGroups: FilterGroup[] = useMemo(() => {
    const typeOptions = Object.entries(RELATIONSHIP_CONFIG).map(([type, config]) => ({
      id: type,
      label: config.label,
      value: type,
      active: selectedTypes.includes(type as RelationshipType),
    }));

    const groups: FilterGroup[] = [
      {
        id: "relationshipTypes",
        label: "Relationship Types",
        type: "multiple",
        options: typeOptions,
      },
    ];

    groups.push(
      {
        id: "sortBy",
        label: "Sort By",
        type: "single",
        options: [
          { id: "date-desc", label: "Date (Newest First)", value: "date-desc", active: sortBy === "date-desc" },
          { id: "date-asc", label: "Date (Oldest First)", value: "date-asc", active: sortBy === "date-asc" },
          { id: "char-a-asc", label: "Character A (A-Z)", value: "char-a-asc", active: sortBy === "char-a-asc" },
          { id: "char-a-desc", label: "Character A (Z-A)", value: "char-a-desc", active: sortBy === "char-a-desc" },
          { id: "char-b-asc", label: "Character B (A-Z)", value: "char-b-asc", active: sortBy === "char-b-asc" },
          { id: "char-b-desc", label: "Character B (Z-A)", value: "char-b-desc", active: sortBy === "char-b-desc" },
          { id: "type-asc", label: "Relationship Type (A-Z)", value: "type-asc", active: sortBy === "type-asc" },
          { id: "type-desc", label: "Relationship Type (Z-A)", value: "type-desc", active: sortBy === "type-desc" },
        ],
      },
      {
        id: "perPage",
        label: "Per Page",
        type: "single",
        options: [
          { id: "12", label: "12 per page", value: 12, active: itemsPerPage === 12 },
          { id: "24", label: "24 per page", value: 24, active: itemsPerPage === 24 },
          { id: "48", label: "48 per page", value: 48, active: itemsPerPage === 48 },
          { id: "96", label: "96 per page", value: 96, active: itemsPerPage === 96 },
        ],
      }
    );

    return groups;
  }, [selectedTypes, sortBy, itemsPerPage]);

  const handleFilterChange = useCallback((groupId: string, optionId: string, active: boolean) => {
    if (groupId === "relationshipTypes") {
      setSelectedTypes((prev) => {
        if (active) {
          return [...prev, optionId as RelationshipType];
        } else {
          return prev.filter((t) => t !== optionId);
        }
      });
      setCurrentPage(1);
    } else if (groupId === "sortBy") {
      if (active) {
        setSortBy(optionId);
        setCurrentPage(1);
      }
    } else if (groupId === "perPage") {
      if (active) {
        setItemsPerPage(Number(optionId));
        setCurrentPage(1);
      }
    }
  }, []);

  const handleClearAll = useCallback(() => {
    setSearch("");
    setSelectedTypes([]);
    setMyCharactersOnly(false);
    setSortBy("date-desc");
    setItemsPerPage(24);
    setCurrentPage(1);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleDelete = useCallback(async (relationshipId: string, characterName: string, targetName: string) => {
    // Confirmation dialog
    const confirmed = window.confirm(
      `Are you sure you want to delete the relationship between ${characterName} and ${targetName}? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setDeletingId(relationshipId);
      setDeleteError(null);

      const res = await fetch("/api/characters/relationships", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ relationshipId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete relationship");
      }

      // Refresh the relationships list
      onRefresh();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to delete relationship";
      setDeleteError(errorMessage);
      console.error("[AllEntriesTabContent] Failed to delete relationship:", err);
    } finally {
      setDeletingId(null);
    }
  }, [onRefresh]);

  return (
    <div>
      <SearchFilterBar
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value);
          setCurrentPage(1);
        }}
        searchPlaceholder="Search by character names..."
        filterGroups={filterGroups}
        onFilterChange={handleFilterChange}
        onClearAll={handleClearAll}
        className="mb-4"
        customContent={
          user ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--botw-pale)] hover:text-[var(--totk-light-green)] transition-colors py-2">
              <input
                type="checkbox"
                checked={myCharactersOnly}
                onChange={(e) => {
                  setMyCharactersOnly(e.target.checked);
                  setCurrentPage(1);
                }}
                className="h-5 w-5 sm:h-4 sm:w-4 cursor-pointer accent-[var(--totk-light-green)]"
              />
              <span>My Characters Only</span>
            </label>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <p className="text-xs sm:text-sm text-[var(--botw-pale)]">
          Showing {paginatedRelationships.length} of {filteredAndSorted.length} relationships
        </p>
      </div>

      {/* Delete Error Message */}
      {deleteError && (
        <div className="mb-4 rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-exclamation-circle text-[#ff6347]" />
              <p className="text-sm text-[#ff6347]">{deleteError}</p>
            </div>
            <button
              onClick={() => setDeleteError(null)}
              className="text-[#ff6347] hover:text-[#ff6347]/80 p-2 -mr-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
            >
              <i className="fa-solid fa-xmark" />
            </button>
          </div>
        </div>
      )}

      {paginatedRelationships.length === 0 ? (
        <div className={EMPTY_STATE_CLASS}>
          <div className="text-6xl mb-4">💝</div>
          <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
            {filteredAndSorted.length === 0 && relationships.length === 0
              ? "No relationships found."
              : "No relationships match your filters."}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 mb-6">
            {paginatedRelationships.map((relationship) => {
              // Handle both populated character objects and IDs
              const charA = typeof relationship.characterId === "object" && relationship.characterId !== null 
                ? relationship.characterId as CharacterRef 
                : getCharacter(relationship.characterId);
              const charB = typeof relationship.targetCharacterId === "object" && relationship.targetCharacterId !== null 
                ? relationship.targetCharacterId as CharacterRef 
                : getCharacter(relationship.targetCharacterId);
              const charAIconUrl = charA?.icon ? normalizeImageUrl(charA.icon) : "/ankle_icon.png";
              const charBIconUrl = charB?.icon ? normalizeImageUrl(charB.icon) : "/ankle_icon.png";
              const charAVillage = charA?.homeVillage || charA?.currentVillage || "";
              const charBVillage = charB?.homeVillage || charB?.currentVillage || "";
              const charAVillageCrest = charAVillage ? getVillageCrestIcon(charAVillage) : null;
              const charBVillageCrest = charBVillage ? getVillageCrestIcon(charBVillage) : null;
              const charASlug = createSlug(relationship.characterName);
              const charBSlug = createSlug(relationship.targetCharacterName);
              const hasNotes = relationship.notes && relationship.notes.trim().length > 0;

              const isOwnRelationship = relationship.userId === user?.id;
              const isDeleting = deletingId === relationship._id;

              return (
                <div
                  key={relationship._id}
                  className="relative rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-3 sm:p-4 shadow-lg hover:border-[var(--totk-light-green)] transition-all"
                >
                  {/* Edit and Delete Buttons */}
                  {isOwnRelationship && (
                    <div className="absolute top-2 right-2 z-10 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditClick(relationship);
                        }}
                        className="rounded-md border-2 border-[var(--totk-light-green)]/60 bg-[var(--botw-warm-black)]/90 p-2 sm:p-1.5 text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/20 hover:border-[var(--totk-light-green)] transition-colors min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                        title="Edit relationship"
                      >
                        <i className="fa-solid fa-pencil text-sm sm:text-xs" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(relationship._id, relationship.characterName, relationship.targetCharacterName);
                        }}
                        disabled={isDeleting}
                        className="rounded-md border-2 border-[#ff6347]/60 bg-[var(--botw-warm-black)]/90 p-2 sm:p-1.5 text-[#ff6347] hover:bg-[#ff6347]/20 hover:border-[#ff6347] transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center"
                        title="Delete relationship"
                      >
                        {isDeleting ? (
                          <i className="fa-solid fa-spinner fa-spin text-sm sm:text-xs" />
                        ) : (
                          <i className="fa-solid fa-trash text-sm sm:text-xs" />
                        )}
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
                    {/* Character A */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-full sm:max-w-[200px] justify-self-start">
                      <Link
                        href={`/characters/${charASlug}`}
                        className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity min-w-0 flex-1"
                      >
                        <div className="relative h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)] shadow-inner">
                          <Image
                            src={charAIconUrl}
                            alt={relationship.characterName}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-bold text-[var(--totk-light-green)] truncate" title={relationship.characterName}>
                            {relationship.characterName}
                          </h4>
                          {charA?.race && (
                            <p className="text-xs text-[var(--botw-pale)] opacity-90 truncate" title={capitalize(charA.race)}>
                              {capitalize(charA.race)}
                            </p>
                          )}
                          {charAVillage && (
                            <p className="text-xs text-[var(--totk-grey-200)] opacity-75 truncate mt-0.5" title={capitalize(charAVillage)}>
                              {capitalize(charAVillage)}
                            </p>
                          )}
                        </div>
                      </Link>
                      {/* Arrow pointing right */}
                      <div className="hidden sm:flex items-center text-[var(--totk-light-green)] text-xl px-2">
                        <i className="fa-solid fa-arrow-right" />
                      </div>
                    </div>

                    {/* Relationship Types & Info - Centered */}
                    <div className="flex flex-col items-center justify-center gap-2 sm:gap-2.5 min-w-0 px-2 sm:px-4 order-first sm:order-none">
                      {/* Direction label for mobile */}
                      <div className="sm:hidden text-xs text-[var(--botw-pale)] opacity-75 mb-1 text-center px-2">
                        <span className="font-semibold text-[var(--totk-light-green)]">{relationship.characterName}</span>
                        {" "}feels this way about{" "}
                        <span className="font-semibold text-[var(--totk-light-green)]">{relationship.targetCharacterName}</span>
                      </div>
                      {/* Heart Icons */}
                      <div className="flex items-center gap-2 flex-wrap justify-center">
                        {relationship.relationshipTypes.map((type) => {
                          const config = RELATIONSHIP_CONFIG[type];
                          return (
                            <i 
                              key={type}
                              className={`fa-solid ${config.icon} text-lg sm:text-xl`}
                              style={{ color: config.color }}
                              title={config.label}
                            />
                          );
                        })}
                      </div>
                      {/* Relationship Type Badges */}
                      <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                        {relationship.relationshipTypes.map((type) => (
                          <RelationshipTypeBadge key={type} type={type} />
                        ))}
                      </div>
                      {hasNotes && (
                        <p className="text-xs text-[var(--botw-pale)] text-center break-words whitespace-pre-wrap max-w-full sm:max-w-2xl w-full px-2">
                          {relationship.notes}
                        </p>
                      )}
                      {relationship.createdAt && (
                        <p className="text-xs text-[var(--totk-grey-200)] opacity-75 text-center">
                          {new Date(relationship.createdAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {/* Character B */}
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-full sm:max-w-[200px] sm:flex-row-reverse justify-self-end">
                      <Link
                        href={`/characters/${charBSlug}`}
                        className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity min-w-0 flex-1 sm:flex-row-reverse"
                      >
                        <div className="relative h-12 w-12 sm:h-16 sm:w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)] shadow-inner">
                          <Image
                            src={charBIconUrl}
                            alt={relationship.targetCharacterName}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1 text-left sm:text-right">
                          <h4 className="text-sm font-bold text-[var(--totk-light-green)] truncate" title={relationship.targetCharacterName}>
                            {relationship.targetCharacterName}
                          </h4>
                          {charB?.race && (
                            <p className="text-xs text-[var(--botw-pale)] opacity-90 truncate" title={capitalize(charB.race)}>
                              {capitalize(charB.race)}
                            </p>
                          )}
                          {charBVillage && (
                            <p className="text-xs text-[var(--totk-grey-200)] opacity-75 truncate mt-0.5" title={capitalize(charBVillage)}>
                              {capitalize(charBVillage)}
                            </p>
                          )}
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalItems={filteredAndSorted.length}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// ------------------- Main Component -------------------
// ============================================================================

export default function RelationshipsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [activeTab, setActiveTab] = useState<TabValue>("my-relationships");
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const [allCharacters, setAllCharacters] = useState<Character[]>([]);
  const [allRelationships, setAllRelationships] = useState<Relationship[]>([]);
  const [relationshipCounts, setRelationshipCounts] = useState<Map<string, number>>(new Map());
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [outgoingRelationships, setOutgoingRelationships] = useState<Relationship[]>([]);
  const [incomingRelationships, setIncomingRelationships] = useState<Relationship[]>([]);
  const [loadingCharacters, setLoadingCharacters] = useState(true);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [relationshipToEdit, setRelationshipToEdit] = useState<Relationship | null>(null);

  // Refresh relationships after creation or deletion
  const refreshRelationships = useCallback(async () => {
    // Only refresh counts if we're on a tab that shows character cards with counts
    if (activeTab !== "my-relationships" && activeTab !== "all-relationships") {
      console.log("[relationships/page.tsx] Skipping refresh - not on my-relationships or all-relationships tab, current tab:", activeTab);
      return;
    }

    console.log("[relationships/page.tsx] Starting refreshRelationships...");
    try {
      // Add cache-busting timestamp to ensure we get fresh data
      const timestamp = Date.now();
      const res = await fetch(`/api/characters/relationships/all?t=${timestamp}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (!res.ok) {
        console.error("[relationships/page.tsx] Failed to fetch relationships for counts:", res.status);
        return;
      }

      const data = await res.json();
      const relationships = data.relationships || [];
      console.log("[relationships/page.tsx] Fetched", relationships.length, "relationships");
      
      const counts = new Map<string, number>();

      relationships.forEach((rel: Relationship) => {
        const charId = getCharacterId(rel.characterId);
        const targetId = getCharacterId(rel.targetCharacterId);
        
        if (charId) {
          const currentCount = counts.get(charId) || 0;
          counts.set(charId, currentCount + 1);
        }
        if (targetId) {
          const currentCount = counts.get(targetId) || 0;
          counts.set(targetId, currentCount + 1);
        }
      });

      // Create a new Map instance to ensure React detects the change
      const newCounts = new Map(counts);
      console.log("[relationships/page.tsx] Setting relationship counts:", Array.from(newCounts.entries()));
      setRelationshipCounts(newCounts);
      console.log("[relationships/page.tsx] Refreshed relationship counts:", counts.size, "characters with relationships");
    } catch (err) {
      console.error("[relationships/page.tsx] ❌ Failed to refresh relationship counts:", err);
    }
  }, [activeTab]);

  // Fetch relationships for counting
  useEffect(() => {
    if (activeTab !== "my-relationships" && activeTab !== "all-relationships") return;

    const abortController = new AbortController();

    const fetchRelationshipsForCounts = async () => {
      try {
        // Add cache-busting timestamp to ensure fresh data
        const timestamp = Date.now();
        const res = await fetch(`/api/characters/relationships/all?t=${timestamp}`, {
          signal: abortController.signal,
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        });

        if (!res.ok) return;

        const data = await res.json();
        if (abortController.signal.aborted) return;

        const relationships = data.relationships || [];
        const counts = new Map<string, number>();

        relationships.forEach((rel: Relationship) => {
          const charId = getCharacterId(rel.characterId);
          const targetId = getCharacterId(rel.targetCharacterId);
          
          if (charId) {
            const currentCount = counts.get(charId) || 0;
            counts.set(charId, currentCount + 1);
          }
          if (targetId) {
            const currentCount = counts.get(targetId) || 0;
            counts.set(targetId, currentCount + 1);
          }
        });

        if (!abortController.signal.aborted) {
          // Create a new Map instance to ensure React detects the change
          const newCounts = new Map(counts);
          setRelationshipCounts(newCounts);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error("[relationships/page.tsx] ❌ Failed to load relationship counts:", err);
      }
    };

    fetchRelationshipsForCounts();
    return () => abortController.abort();
  }, [activeTab]);

  // Fetch my characters
  useEffect(() => {
    if (!user || activeTab !== "my-relationships") {
      if (!user) setLoadingCharacters(false);
      return;
    }

    const abortController = new AbortController();

    const fetchMyCharacters = async () => {
      try {
        setLoadingCharacters(true);
        setError(null);

        const res = await fetch("/api/characters/my-ocs?limit=1000", {
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch characters: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();
        if (!abortController.signal.aborted) {
          setMyCharacters(data.data || []);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[relationships/page.tsx] ❌ Failed to load characters:", error);
        setError(error.message);
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingCharacters(false);
        }
      }
    };

    fetchMyCharacters();
    return () => abortController.abort();
  }, [user, activeTab]);

  // Fetch all characters
  useEffect(() => {
    if (activeTab !== "all-relationships") return;

    const abortController = new AbortController();

    const fetchAllCharacters = async () => {
      try {
        setLoadingCharacters(true);
        setError(null);

        // Fetch all characters by paginating through all pages
        // API has MAX_LIMIT of 100, so we need to fetch multiple pages
        let allChars: Character[] = [];
        let page = 1;
        let hasMore = true;
        const limit = 100; // API's MAX_LIMIT

        while (hasMore && !abortController.signal.aborted) {
          const res = await fetch(`/api/models/characters?page=${page}&limit=${limit}`, {
            signal: abortController.signal,
          });

          if (!res.ok) {
            throw new Error(`Failed to fetch all characters: ${res.status} ${res.statusText}`);
          }

          const data = await res.json();
          const pageData = data.data || [];
          allChars = [...allChars, ...pageData];

          // Check if there are more pages
          hasMore = page < (data.totalPages || 1) && pageData.length === limit;
          page++;

          // Safety check to prevent infinite loops
          if (page > 1000) {
            console.warn("[relationships/page.tsx] Stopped fetching after 1000 pages to prevent infinite loop");
            break;
          }
        }

        if (!abortController.signal.aborted) {
          console.log(`[relationships/page.tsx] Loaded ${allChars.length} total characters`);
          setAllCharacters(allChars);
        }
      } catch (err) {
        if (abortController.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[relationships/page.tsx] ❌ Failed to load all characters:", error);
        setError(error.message);
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingCharacters(false);
        }
      }
    };

    fetchAllCharacters();
    return () => abortController.abort();
  }, [activeTab]);

  // Fetch all relationships for all-entries tab
  const fetchAllRelationships = useCallback(async () => {
    if (activeTab !== "all-entries") return;

    try {
      setLoadingCharacters(true);
      setError(null);

      const res = await fetch("/api/characters/relationships/all");

      if (!res.ok) {
        throw new Error(`Failed to fetch all relationships: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setAllRelationships(data.relationships || []);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[relationships/page.tsx] ❌ Failed to load all relationships:", error);
      setError(error.message);
    } finally {
      setLoadingCharacters(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "all-entries") return;

    const abortController = new AbortController();
    fetchAllRelationships();
    return () => abortController.abort();
  }, [activeTab, fetchAllRelationships]);

  // Fetch relationships for selected character
  const fetchCharacterRelationships = useCallback(async (characterId: string) => {
    try {
      setLoadingRelationships(true);
      // Add cache-busting to ensure fresh data
      const timestamp = Date.now();
      const res = await fetch(`/api/characters/relationships/${characterId}?t=${timestamp}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache",
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch relationships: ${res.status}`);
      }
      const data = await res.json();
      console.log("[relationships/page.tsx] Fetched character relationships:", {
        outgoing: data.outgoing?.length || 0,
        incoming: data.incoming?.length || 0,
      });
      setOutgoingRelationships(data.outgoing || []);
      setIncomingRelationships(data.incoming || []);
    } catch (err) {
      console.error("[relationships/page.tsx] ❌ Failed to load character relationships:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingRelationships(false);
    }
  }, []);

  const handleCharacterClick = useCallback(async (character: Character) => {
    setSelectedCharacter(character);
    setModalOpen(true);
    setOutgoingRelationships([]);
    setIncomingRelationships([]);
    await fetchCharacterRelationships(character._id);
  }, [fetchCharacterRelationships]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading message="Authenticating..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!user && activeTab === "my-relationships") {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <div className="mb-6 sm:mb-8 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] uppercase">
              Access Denied
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 sm:p-8 shadow-2xl">
            <p className="text-sm sm:text-base text-[var(--botw-pale)] mb-4 sm:mb-6">
              You must be logged in to view your character relationships.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-block rounded-md bg-[#5865F2] px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-bold text-white transition-colors hover:bg-[#4752C4]"
            >
              Login with Discord
            </a>
          </div>
        </div>
      </div>
    );
  }

  const currentCharacters = activeTab === "my-relationships" ? myCharacters : allCharacters;

  return (
    <main className="min-h-full p-4 sm:p-6 md:p-8 overflow-x-hidden">
      <div className="mx-auto max-w-[90rem] w-full">
        <header className="mb-6 sm:mb-8 flex flex-col items-center justify-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8 opacity-80" aria-hidden="true" />
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              Relationships
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8 opacity-80" aria-hidden="true" />
          </div>
          <p className="text-[var(--totk-grey-200)] font-medium tracking-widest uppercase text-xs sm:text-sm opacity-60 text-center px-4">
            Character connections and bonds
          </p>
        </header>

        <div className="mb-6">
          <Tabs
            tabs={[
              { value: "my-relationships", label: "My Relationships", icon: "fa-heart" },
              { value: "all-relationships", label: "All Relationships", icon: "fa-users" },
              { value: "all-entries", label: "All Entries", icon: "fa-list" },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as TabValue)}
          />
        </div>

        {error && (
          <div className="mb-6 rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-4 sm:p-6 shadow-lg" role="alert">
            <div className="flex items-start gap-3 sm:gap-4">
              <i className="fa-solid fa-exclamation-triangle text-xl sm:text-2xl text-[#ff6347] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <h3 className="mb-2 text-base sm:text-lg font-bold text-[#ff6347]">Error</h3>
                <p className="mb-4 text-xs sm:text-sm text-[var(--botw-pale)] break-words">{error}</p>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-md bg-[var(--totk-mid-ocher)] px-4 py-2.5 sm:py-2 text-sm font-bold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] transition-colors min-h-[44px] sm:min-h-0"
                >
                  <i className="fa-solid fa-rotate-right mr-2" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {loadingCharacters ? (
          <Loading message={`Loading ${activeTab === "my-relationships" ? "your characters" : activeTab === "all-relationships" ? "all characters" : activeTab === "all-entries" ? "all relationships" : "relationships"}...`} variant="inline" size="lg" />
        ) : (
          <>
            {activeTab === "all-entries" ? (
              <AllEntriesTabContent 
                relationships={allRelationships} 
                user={user}
                myCharacters={myCharacters}
                onRefresh={fetchAllRelationships}
                onEditClick={(relationship) => {
                  setRelationshipToEdit(relationship);
                  setEditModalOpen(true);
                }}
              />
            ) : (
              <>
                {activeTab === "my-relationships" && myCharacters.length > 0 && (
                  <div className="mb-6 flex justify-end">
                    <button
                      onClick={() => setCreateModalOpen(true)}
                      className="flex items-center gap-2 rounded-md bg-[var(--totk-light-green)] px-4 py-2.5 sm:py-2 text-sm font-bold text-[var(--botw-warm-black)] hover:bg-[var(--totk-dark-green)] transition-colors shadow-lg min-h-[44px] sm:min-h-0"
                    >
                      <i className="fa-solid fa-heart-circle-plus" />
                      Create New Relationship
                    </button>
                  </div>
                )}
                {currentCharacters.length === 0 ? (
              <div className={EMPTY_STATE_CLASS}>
                <div className="text-6xl mb-4">💝</div>
                <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
                  {activeTab === "my-relationships" 
                    ? "You don't have any characters yet."
                    : "No characters found."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:gap-6 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {currentCharacters.map((character) => {
                  const count = relationshipCounts.get(character._id) || 0;
                  return (
                    <CharacterCard
                      key={character._id}
                      character={character}
                      onClick={() => handleCharacterClick(character)}
                      relationshipCount={count}
                    />
                  );
                })}
              </div>
                )}
              </>
            )}
          </>
        )}

        <CharacterRelationshipsModal
          character={selectedCharacter}
          outgoingRelationships={outgoingRelationships}
          incomingRelationships={incomingRelationships}
          open={modalOpen}
          onOpenChange={setModalOpen}
          loading={loadingRelationships}
          user={user}
          onRefresh={async () => {
            console.log("[relationships/page.tsx] CharacterRelationshipsModal onRefresh called");
            // Small delay to ensure API has processed the deletion
            await new Promise(resolve => setTimeout(resolve, 100));
            // Refresh relationship counts on character cards
            await refreshRelationships();
            // Refresh modal data
            if (selectedCharacter) {
              await fetchCharacterRelationships(selectedCharacter._id);
            }
            console.log("[relationships/page.tsx] CharacterRelationshipsModal onRefresh completed");
          }}
          onEditClick={(relationship) => {
            setRelationshipToEdit(relationship);
            setEditModalOpen(true);
          }}
        />

        {activeTab === "my-relationships" && (
          <CreateRelationshipModal
            myCharacters={myCharacters}
            open={createModalOpen}
            onOpenChange={setCreateModalOpen}
            onSuccess={async () => {
              console.log("[relationships/page.tsx] CreateRelationshipModal onSuccess called");
              await refreshRelationships();
              console.log("[relationships/page.tsx] CreateRelationshipModal onSuccess completed");
            }}
          />
        )}

        {/* Edit modal - available from any tab */}
        <CreateRelationshipModal
          myCharacters={myCharacters}
          open={editModalOpen}
          onOpenChange={(open) => {
            setEditModalOpen(open);
            if (!open) {
              setRelationshipToEdit(null);
            }
          }}
          relationshipToEdit={relationshipToEdit}
          onSuccess={async () => {
            console.log("[relationships/page.tsx] EditRelationshipModal onSuccess called");
            await refreshRelationships();
            // Refresh modal if open
            if (selectedCharacter) {
              await fetchCharacterRelationships(selectedCharacter._id);
            }
            // Refresh All Entries if on that tab
            if (activeTab === "all-entries") {
              await fetchAllRelationships();
            }
            console.log("[relationships/page.tsx] EditRelationshipModal onSuccess completed");
          }}
        />
      </div>
    </main>
  );
}
