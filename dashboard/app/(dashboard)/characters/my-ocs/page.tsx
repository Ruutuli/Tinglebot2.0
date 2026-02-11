"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import Link from "next/link";
import React, { useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useSession } from "@/hooks/use-session";
import { useModelList } from "@/hooks/use-model-list";
import { Loading } from "@/components/ui";
import {
  type Character,
  getVillageBorderClass,
  getVillageBorderStyle,
  getVillageTextStyle,
  getVillageCrestIcon,
} from "@/app/(dashboard)/models/characters/page";
import { capitalize, createSlug } from "@/lib/string-utils";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type ApplicationFeedback = Array<{ modUsername?: string; text: string }>;

type CharacterWithFeedback = Character & {
  applicationFeedback?: ApplicationFeedback;
};

// Markdown components for feedback rendering
type MarkdownComponentProps = {
  children?: ReactNode;
  href?: string;
};

/**
 * Convert plain URLs in text to markdown links
 */
function convertUrlsToMarkdown(text: string): string {
  // URL regex pattern - matches http(s):// URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => `[${url}](${url})`);
}

const FEEDBACK_MARKDOWN_COMPONENTS: Components = {
  p: ({ children }: MarkdownComponentProps) => (
    <p className="mb-2 last:mb-0 break-words">{children}</p>
  ),
  ul: ({ children }: MarkdownComponentProps) => (
    <ul className="list-disc list-inside mb-2 space-y-1 break-words">{children}</ul>
  ),
  ol: ({ children }: MarkdownComponentProps) => (
    <ol className="list-decimal list-inside mb-2 space-y-1 break-words">{children}</ol>
  ),
  li: ({ children }: MarkdownComponentProps) => (
    <li className="ml-2 break-words">{children}</li>
  ),
  strong: ({ children }: MarkdownComponentProps) => (
    <strong className="font-bold text-[var(--totk-light-green)] break-words">{children}</strong>
  ),
  em: ({ children }: MarkdownComponentProps) => (
    <em className="italic break-words">{children}</em>
  ),
  code: ({ children }: MarkdownComponentProps) => (
    <code className="bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] px-1 py-0.5 rounded text-xs font-mono break-words">
      {children}
    </code>
  ),
  pre: ({ children }: MarkdownComponentProps) => (
    <pre className="bg-[var(--botw-warm-black)] p-2 rounded overflow-x-auto mb-2 text-xs break-words">
      {children}
    </pre>
  ),
  blockquote: ({ children }: MarkdownComponentProps) => (
    <blockquote className="border-l-4 border-[var(--totk-green)] pl-2 italic mb-2 break-words">
      {children}
    </blockquote>
  ),
  a: ({ children, href }: MarkdownComponentProps) => (
    <a
      href={href}
      className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)] break-words"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  br: () => <br />,
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

function getRaceCrestIcon(race: string): string | null {
  if (!race) return null;
  const raceLower = race.toLowerCase().trim();
  const iconMap: Record<string, string> = {
    gerudo: "/assets/races/crest_gerudo.png",
    goron: "/assets/races/crest_goron.png",
    hylian: "/assets/races/crest_hylian.png",
    keaton: "/assets/races/crest_keaton.png",
    kokiri: "/assets/races/crest_kokiri.png",
    "korok/kokiri": "/assets/races/crest_kokiri.png",
    mixed: "/assets/races/crest_mixed.png",
    mogma: "/assets/races/crest_mogma.png",
    rito: "/assets/races/crest_rito.png",
    sheikah: "/assets/races/crest_sheikah.png",
    twili: "/assets/races/crest_twili.png",
    yiga: "/assets/races/crest_yiga.png",
    zora: "/assets/races/crest_zora.png",
  };
  return iconMap[raceLower] || null;
}

// ============================================================================
// ------------------- Components -------------------
// ============================================================================

// ------------------- MyCharacterCard ------------------
// Character card component with OC name, race, village, icons, and action buttons -

function MyCharacterCard({ character }: { character: Character }): React.ReactElement {
  const [resubmitting, setResubmitting] = useState(false);
  const homeVillage = String(character.homeVillage ?? "");
  const villageClass = getVillageBorderClass(homeVillage);
  const villageStyle = getVillageBorderStyle(homeVillage);
  const villageTextStyle = getVillageTextStyle(homeVillage);

  // Shared className constants
  const baseButtonClass = "flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs sm:text-sm font-bold shadow-lg transition-all min-h-[44px]";
  const baseBadgeClass = "inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2 py-0.5 sm:px-3 sm:py-1 text-[10px] sm:text-xs font-bold shadow-md border border-white/20";
  const crestIconClass = "h-10 w-10 sm:h-12 sm:w-12 object-contain opacity-90 drop-shadow-lg";
  const crestIconContainerClass = "flex-shrink-0 w-12 sm:w-16 flex items-center";

  const handleResubmit = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setResubmitting(true);
    try {
      const response = await fetch(`/api/characters/${character._id}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to resubmit character");
      }

      // Show success message and refresh the page to show updated status
      alert("Character resubmitted successfully! The page will refresh to show the updated status.");
      window.location.reload();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[my-ocs/page.tsx]❌ Failed to resubmit character:", error);
      alert(`Failed to resubmit character: ${error.message}`);
      setResubmitting(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.target;
    if (target instanceof HTMLImageElement) {
      target.src = "/ankle_icon.png";
    }
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const getStatusBadge = (): React.ReactNode => {
    // Only show badges for non-accepted characters
    // Draft status (null/undefined)
    if (!character.status || character.status === null) {
      return (
        <span className={`${baseBadgeClass} bg-[var(--totk-mid-ocher)] text-[var(--totk-ivory)]`}>
          <i className="fa-solid fa-file-pen text-[9px] sm:text-[10px]" />
          <span className="hidden sm:inline">Draft</span>
        </span>
      );
    }
    if (character.status === "pending") {
      return (
        <span className={`${baseBadgeClass} bg-[var(--botw-blue)] text-white`}>
          <i className="fa-solid fa-clock text-[9px] sm:text-[10px]" />
          <span className="hidden sm:inline">Pending</span>
        </span>
      );
    }
    if (character.status === "needs_changes") {
      return (
        <span className={`${baseBadgeClass} bg-[#ff6347] text-white`}>
          <i className="fa-solid fa-exclamation-triangle text-[9px] sm:text-[10px]" />
          <span className="hidden sm:inline">Needs Changes</span>
        </span>
      );
    }
    // Don't show badge for accepted characters
    return null;
  };

  const iconUrl: string = (character.icon && typeof character.icon === "string" ? character.icon : "/ankle_icon.png");
  const hasCustomIcon: boolean = Boolean(character.icon && typeof character.icon === "string");
  const characterName: string = String(character.name ?? "");
  const characterRace: string = String(character.race ?? "");
  
  // Get icon paths
  const raceCrestIcon = getRaceCrestIcon(characterRace);
  const villageCrestIcon = getVillageCrestIcon(homeVillage);
  
  // Type-safe access to applicationFeedback
  const applicationFeedback: ApplicationFeedback | undefined = (() => {
    const charWithFeedback = character as unknown as CharacterWithFeedback;
    const feedback = charWithFeedback.applicationFeedback;
    if (Array.isArray(feedback) && feedback.length > 0) {
      return feedback.filter(
        (item): item is ApplicationFeedback[number] =>
          typeof item === "object" &&
          item !== null &&
          typeof item.text === "string"
      );
    }
    return undefined;
  })();

  // Precompute conditional values
  const showFeedback = character.status === "needs_changes" && applicationFeedback && applicationFeedback.length > 0;
  const characterIconBorderClass = hasCustomIcon
    ? "border-[var(--totk-light-green)] shadow-[0_0_12px_rgba(73,213,156,0.6)]"
    : "border-[var(--totk-dark-ocher)]";

  return (
    <div
      className={`group relative block rounded-lg border-2 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] p-4 sm:p-5 shadow-lg transition-all hover:shadow-xl ${
        villageClass || "border-[var(--totk-dark-ocher)] hover:border-[var(--totk-light-green)]/60"
      }`}
      style={villageStyle}
    >
      {/* Status Badge - Top Right */}
      <div className="absolute top-3 right-3 z-10">
        {getStatusBadge()}
      </div>

      {/* Main Content */}
      <div className="relative z-10">
        {/* Icons Row: Race Icon (left) | Character Icon (center) | Village Icon (right) */}
        <div className="flex items-center justify-between mb-4">
          {/* Race Crest Icon - Left */}
          <div className="flex-shrink-0 w-12 sm:w-16 flex items-center justify-start">
            {raceCrestIcon ? (
              <img
                src={raceCrestIcon}
                alt={`${characterRace} crest`}
                className={crestIconClass}
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12" />
            )}
          </div>

          {/* Character Icon - Center */}
          <div className="flex-shrink-0 flex items-center justify-center">
            <img
              src={iconUrl}
              alt={characterName}
              className={`h-20 w-20 sm:h-24 sm:w-24 rounded-lg border-2 object-cover ${characterIconBorderClass}`}
              onError={handleImageError}
            />
          </div>

          {/* Village Crest Icon - Right */}
          <div className={`${crestIconContainerClass} justify-end`}>
            {villageCrestIcon ? (
              <img
                src={villageCrestIcon}
                alt={`${homeVillage} crest`}
                className={crestIconClass}
              />
            ) : (
              <div className="w-10 h-10 sm:w-12 sm:h-12" />
            )}
          </div>
        </div>

        {/* Info Row: Name | Race | Village */}
        <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4 flex-wrap">
          <span className="text-base sm:text-lg font-bold text-[var(--totk-light-green)]">
            {characterName}
          </span>
          <span className="text-sm sm:text-base text-[var(--botw-pale)] font-medium">
            {capitalize(characterRace) || "No race"}
          </span>
          <span 
            className="text-sm sm:text-base font-medium"
            style={villageTextStyle}
          >
            {capitalize(homeVillage) || "No village"}
          </span>
        </div>

        {/* Hearts and Stamina */}
        <div className="flex items-center justify-center gap-4 sm:gap-6 mb-4 text-xs sm:text-sm text-[var(--botw-pale)]">
          <span className="inline-flex items-center gap-1.5">
            <i className="fa-solid fa-heart text-[var(--totk-light-green)]" aria-hidden />
            <span>
              {character.currentHearts ?? character.maxHearts ?? 0}/{character.maxHearts ?? 0}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i className="fa-solid fa-bolt text-[var(--botw-blue)]" aria-hidden />
            <span>
              {character.currentStamina ?? character.maxStamina ?? 0}/{character.maxStamina ?? 0}
            </span>
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2.5 pt-3 sm:pt-4 border-t border-[var(--totk-dark-ocher)]/50 sm:flex-wrap">
          {character.status === "needs_changes" && (
            <button
              onClick={handleResubmit}
              disabled={resubmitting}
              className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs sm:text-sm font-bold shadow-lg transition-all min-h-[44px] bg-[var(--totk-light-green)] text-[var(--botw-warm-black)] hover:bg-[var(--totk-light-green)] hover:shadow-[0_0_12px_rgba(73,213,156,0.5)] hover:scale-[1.02] active:scale-[0.98] border border-[var(--totk-light-green)]/30 disabled:opacity-50 sm:flex-1 min-w-0"
            >
              <i className="fa-solid fa-paper-plane" />
              <span>{resubmitting ? "Resubmitting..." : "Resubmit"}</span>
            </button>
          )}
          <Link
            href={`/characters/edit/${character._id}`}
            onClick={handleLinkClick}
            className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs sm:text-sm font-bold shadow-lg transition-all min-h-[44px] bg-[var(--totk-mid-ocher)] text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] active:bg-[var(--totk-dark-ocher)] transition-colors border border-[var(--totk-light-ocher)]/30 sm:flex-1 min-w-0"
          >
            <i className="fa-solid fa-pen-to-square" />
            <span>Edit</span>
          </Link>
          <Link
            href={`/characters/inventories/${createSlug(characterName)}`}
            onClick={handleLinkClick}
            className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs sm:text-sm font-bold shadow-lg transition-all min-h-[44px] bg-[var(--botw-blue)] text-white hover:bg-[var(--botw-dark-blue)] active:bg-[var(--botw-dark-blue)] transition-colors border border-[var(--botw-blue)]/30 sm:flex-1 min-w-0"
          >
            <i className="fa-solid fa-box" />
            <span>Inventory</span>
          </Link>
          <Link
            href={`/characters/${createSlug(characterName)}`}
            onClick={handleLinkClick}
            className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-xs sm:text-sm font-bold shadow-lg transition-all min-h-[44px] bg-[var(--totk-green)] text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-green)] active:bg-[var(--totk-dark-green)] transition-colors border border-[var(--totk-light-green)]/30 sm:flex-1 min-w-0"
          >
            <i className="fa-solid fa-user-circle" />
            <span>Bio</span>
          </Link>
        </div>

        {/* Feedback Display for Needs Changes */}
        {showFeedback && (
          <div className="mt-4 pt-3 border-t border-[var(--totk-dark-ocher)]">
            <div className="text-xs sm:text-sm font-medium text-[var(--totk-light-ocher)] mb-2">
              <i className="fa-solid fa-comment-dots mr-1.5" />
              Moderator Feedback:
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {applicationFeedback.map((feedback, idx) => {
                // Create stable key from feedback content
                const feedbackKey = `feedback-${idx}-${feedback.text.slice(0, 20)}`;
                return (
                  <div
                    key={feedbackKey}
                    className="text-xs sm:text-sm text-[var(--botw-pale)] bg-[var(--botw-warm-black)]/50 rounded px-2 sm:px-3 py-1.5 sm:py-2 border border-[#ff6347]/20"
                  >
                    <div className="break-words overflow-wrap-anywhere">
                      <ReactMarkdown components={FEEDBACK_MARKDOWN_COMPONENTS}>
                        {convertUrlsToMarkdown(feedback.text)}
                      </ReactMarkdown>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------- Section -------------------

function CharacterSection({
  title,
  characters,
  loading,
  emptyMessage,
}: {
  title: string;
  characters: Character[];
  loading: boolean;
  emptyMessage: string;
}) {
  return (
    <div className="mb-8 sm:mb-12">
      <div className="mb-4 sm:mb-6 flex items-center gap-2 sm:gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--totk-dark-ocher)]/50" />
        <h2 className="text-xl sm:text-2xl font-bold text-[var(--totk-light-ocher)] uppercase tracking-wider px-2">
          {title}
        </h2>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--totk-dark-ocher)]/50" />
      </div>

      {loading ? (
        <div className="py-8 sm:py-12">
          <Loading message={`Loading ${title.toLowerCase()}...`} variant="inline" size="lg" />
        </div>
      ) : characters.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 p-6 sm:p-8 md:p-12 text-center">
          <p className="text-sm sm:text-base text-[var(--botw-pale)] opacity-60 italic">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          {characters.map((character) => (
            <MyCharacterCard key={character._id} character={character} />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------- MyOCsContent ------------------
// Main content component for My OCs page -

function MyOCsContent() {
  const { data: allCharacters, loading, error, refetch } = useModelList<Character>("characters", {
    apiPath: "/api/characters/my-ocs",
    defaultLimit: 100,
  });

  // Separate drafts (not submitted) from submitted pending characters
  // Explicitly handle null, undefined, and missing status fields as drafts
  const drafts = allCharacters.filter((c) => {
    const status = c.status;
    return status === null || status === undefined || status === "" || !status;
  });
  const pending = allCharacters.filter((c) => {
    const status = c.status;
    return status === "pending" || status === "needs_changes";
  });
  const accepted = allCharacters.filter((c) => c.status === "accepted");

  // Precompute section title
  const draftSectionTitle = drafts.length > 0 && pending.length > 0 
    ? "Draft / In Review" 
    : drafts.length > 0 
    ? "Draft" 
    : "In Review";

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-6 sm:mb-8 md:mb-12 flex flex-col items-center justify-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8 opacity-80" />
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              My Collection
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8 opacity-80" />
          </div>
          <p className="text-[var(--totk-grey-200)] font-medium tracking-widest uppercase text-xs sm:text-sm opacity-60 text-center px-4">
            Manage your characters and submissions
          </p>
          <Link
            href="/characters/create"
            className="mt-2 sm:mt-4 flex items-center gap-2 sm:gap-3 rounded-full bg-gradient-to-r from-[var(--totk-mid-ocher)] to-[var(--totk-dark-ocher)] px-4 py-2 sm:px-6 sm:py-2.5 md:px-8 md:py-3 text-xs sm:text-sm font-bold text-[var(--totk-ivory)] shadow-[0_0_20px_rgba(229,220,183,0.2)] hover:shadow-[0_0_30px_rgba(229,220,183,0.4)] transition-all transform hover:-translate-y-1 border border-[var(--totk-light-ocher)]/30"
          >
            <i className="fa-solid fa-plus text-xs sm:text-sm" />
            <span className="hidden sm:inline">CREATE NEW CHARACTER</span>
            <span className="sm:hidden">CREATE</span>
          </Link>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 sm:mb-6 md:mb-8 rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-4 sm:p-6 shadow-lg">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0">
                <i className="fa-solid fa-exclamation-triangle text-xl sm:text-2xl text-[#ff6347]" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="mb-1.5 sm:mb-2 text-base sm:text-lg font-bold text-[#ff6347]">Failed to Load Characters</h3>
                <p className="mb-3 sm:mb-4 text-xs sm:text-sm text-[var(--botw-pale)] break-words">{error}</p>
                <button
                  onClick={() => refetch()}
                  className="rounded-md bg-[var(--totk-mid-ocher)] px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-bold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] transition-colors"
                >
                  <i className="fa-solid fa-rotate-right mr-1.5 sm:mr-2" />
                  Try Again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Draft / In Review Section */}
        <CharacterSection
          title={draftSectionTitle}
          characters={[...drafts, ...pending]}
          loading={loading}
          emptyMessage="No characters in draft or pending review."
        />

        {/* Accepted Section */}
        <CharacterSection
          title="Active Characters"
          characters={accepted}
          loading={loading}
          emptyMessage="You haven't had any characters accepted yet."
        />
      </div>
    </div>
  );
}

// ------------------- Main page -------------------

export default function MyOCsPage() {
  const { user, loading: sessionLoading } = useSession();

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--botw-warm-black)]">
        <Loading message="Authenticating..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <div className="mb-6 sm:mb-8 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] uppercase">
              Access Denied
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 sm:p-8 shadow-2xl">
            <p className="text-sm sm:text-base text-[var(--botw-pale)] mb-4 sm:mb-6">
              You must be logged in to manage your character collection.
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

  return <MyOCsContent />;
}
