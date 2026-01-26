"use client";

// ============================================================================
// ------------------- Character Moderation List Component -------------------
// ============================================================================
//
// ------------------- Character Moderation List ------------------
// Displays pending characters for moderation with vote information -

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { VoteModal } from "./VoteModal";
import { Loading } from "@/components/ui";
import { createSlug } from "@/lib/string-utils";
import { format } from "date-fns";

type Character = {
  _id: string;
  name: string;
  userId: string;
  username: string;
  status: string | null;
  applicationVersion: number;
  submittedAt: string | null;
  race?: string;
  job?: string;
  homeVillage?: string;
  icon?: string;
  voteSummary: {
    approveCount: number;
    needsChangesCount: number;
    totalVotes: number;
    currentUserVote: {
      vote: "approve" | "needs_changes";
      reason?: string | null;
      note?: string | null;
    } | null;
    votes: Array<{
      modId: string;
      modUsername: string;
      vote: "approve" | "needs_changes";
      reason?: string | null;
      note?: string | null;
      createdAt: string;
    }>;
  };
};

interface CharacterModerationListProps {
  currentUserId: string;
}

export function CharacterModerationList({
  currentUserId,
}: CharacterModerationListProps) {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    null
  );
  const [voteModalOpen, setVoteModalOpen] = useState(false);
  const [initialVoteType, setInitialVoteType] = useState<"approve" | "needs_changes" | undefined>(undefined);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // ------------------- Data Fetching -------------------
  // ============================================================================

  // ------------------- fetchCharacters ------------------
  // Fetches pending characters for moderation with proper cleanup -

  const fetchCharacters = useCallback(async () => {
    // Abort any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setError(null);
      const response = await fetch("/api/characters/moderation", {
        signal: abortController.signal,
      });

      if (abortController.signal.aborted) {
        return;
      }

      if (!response.ok) {
        let errorData: unknown = { error: "Unknown error" };
        try {
          errorData = await response.json();
        } catch {
          try {
            const text = await response.text();
            errorData = { error: text || "Failed to parse error response" };
          } catch {
            errorData = { error: "Failed to read error response" };
          }
        }

        const errorObj = errorData as { error?: string };
        
        // Handle specific error cases with user-friendly messages
        if (response.status === 403) {
          setError("You don't have permission to access character moderation. You need to be a moderator or admin.");
        } else if (response.status === 401) {
          setError("You need to be logged in to access character moderation.");
        } else {
          setError(`Failed to load characters: ${errorObj.error || response.statusText}`);
        }
        
        console.error("[CharacterModerationList.tsx]❌ Failed to fetch characters:", {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
          error: errorObj.error,
        });
        
        throw new Error(`Failed to fetch characters: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { characters?: Character[] };
      
      if (abortController.signal.aborted) {
        return;
      }

      setCharacters(data.characters || []);
      setError(null);
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        return;
      }

      const error = err instanceof Error ? err : new Error(String(err));
      
      console.error("[CharacterModerationList.tsx]❌ Failed to fetch characters:", error.message);
      
      // Set empty array on error to prevent infinite loading state
      setCharacters([]);
      // Only set generic error if we haven't already set a specific one
      setError((prevError) => prevError || "An unexpected error occurred while loading characters.");
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  // ============================================================================
  // ------------------- Effects -------------------
  // ============================================================================

  // ------------------- useEffect ------------------
  // Fetches characters on mount and polls for updates -

  useEffect(() => {
    fetchCharacters();
    const interval = setInterval(fetchCharacters, 30000);
    
    return () => {
      clearInterval(interval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCharacters]);

  // ============================================================================
  // ------------------- Event Handlers -------------------
  // ============================================================================

  // ------------------- handleVoteClick ------------------
  // Opens vote modal for editing existing vote -

  const handleVoteClick = useCallback((character: Character) => {
    setSelectedCharacter(character);
    setVoteModalOpen(true);
  }, []);

  // ------------------- handleQuickVote ------------------
  // Opens vote modal with pre-selected vote type -

  const handleQuickVote = useCallback((
    characterId: string,
    voteType: "approve" | "needs_changes",
  ) => {
    const character = characters.find((c) => c._id === characterId);
    if (character) {
      setInitialVoteType(voteType);
      setSelectedCharacter(character);
      setVoteModalOpen(true);
    }
  }, [characters]);

  // ------------------- handleVoteSubmitted ------------------
  // Refetches characters after vote submission -

  const handleVoteSubmitted = useCallback(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  if (loading) {
    return (
      <div className="py-12">
        <Loading message="Loading pending characters..." variant="inline" size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/50 p-12 text-center">
        <div className="mb-4">
          <i className="fa-solid fa-exclamation-triangle text-4xl text-[#ff6347]" />
        </div>
        <p className="text-lg font-semibold text-[#ff6347] mb-2">Access Denied</p>
        <p className="text-base text-[var(--botw-pale)] opacity-80">
          {error}
        </p>
      </div>
    );
  }

  if (characters.length === 0) {
    return (
      <div className="rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 p-12 text-center">
        <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
          No characters pending review.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {characters.map((character) => {
          const { voteSummary } = character;
          const currentVote = voteSummary.currentUserVote;

          return (
            <div
              key={character._id}
              className="overflow-hidden rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-md transition-all hover:shadow-lg"
            >
              {/* Header Section */}
              <div className="border-b border-[var(--totk-dark-ocher)] bg-gradient-to-r from-[var(--botw-warm-black)] to-[var(--totk-brown)]/30 p-4">
                <div className="flex items-start gap-4">
                  {character.icon && (
                    <img
                      src={character.icon}
                      alt={character.name}
                      className="h-16 w-16 flex-shrink-0 rounded-lg border border-[var(--totk-light-green)]/50 object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/ankle_icon.png";
                      }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/characters/${createSlug(character.name)}`}
                          className="block text-lg font-bold text-[var(--totk-light-green)] hover:underline truncate"
                        >
                          {character.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-[var(--totk-grey-200)]">
                          by {character.username}
                        </p>
                      </div>
                      <span className="flex-shrink-0 rounded bg-[var(--botw-blue)] px-2 py-0.5 text-xs font-bold text-white">
                        v{character.applicationVersion}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Content Section */}
              <div className="p-4">
                {/* Character Details */}
                <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--botw-pale)]">
                  {character.race && (
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-users w-3 text-[var(--totk-light-green)]" />
                      <span>{character.race}</span>
                    </span>
                  )}
                  {character.job && (
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-briefcase w-3 text-[var(--totk-light-green)]" />
                      <span>{character.job}</span>
                    </span>
                  )}
                  {character.homeVillage && (
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-home w-3 text-[var(--totk-light-green)]" />
                      <span>{character.homeVillage}</span>
                    </span>
                  )}
                  {character.submittedAt && (
                    <span className="flex items-center gap-1.5">
                      <i className="fa-solid fa-clock w-3 text-[var(--totk-light-green)]" />
                      <span>{format(new Date(character.submittedAt), "MMM d, yyyy")}</span>
                    </span>
                  )}
                </div>

                {/* Vote Status Bar */}
                <div className="mb-4 flex items-center justify-between rounded-md bg-[var(--botw-warm-black)]/60 px-3 py-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <i className="fa-solid fa-check-circle text-[var(--totk-light-green)]" />
                      <span className="text-sm font-semibold text-[var(--totk-light-green)]">
                        {voteSummary.approveCount}
                      </span>
                    </div>
                    <div className="h-4 w-px bg-[var(--totk-dark-ocher)]" />
                    <div className="flex items-center gap-1.5">
                      <i className="fa-solid fa-exclamation-triangle text-[#ff6347]" />
                      <span className="text-sm font-semibold text-[#ff6347]">
                        {voteSummary.needsChangesCount}
                      </span>
                    </div>
                  </div>
                  {currentVote && (
                    <div className={`rounded px-2 py-1 text-xs font-medium ${
                      currentVote.vote === "approve"
                        ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                        : "bg-[#ff6347]/20 text-[#ff6347]"
                    }`}>
                      {currentVote.vote === "approve" ? "✓ Voted" : "⚠ Voted"}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleQuickVote(character._id, "approve")}
                    disabled={currentVote?.vote === "approve"}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-all ${
                      currentVote?.vote === "approve"
                        ? "border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/10 text-[var(--totk-light-green)] cursor-not-allowed opacity-50"
                        : "border-[var(--totk-light-green)] bg-[var(--totk-light-green)] text-[var(--botw-warm-black)] hover:bg-[var(--totk-light-green)]/90 hover:shadow-md active:scale-[0.98]"
                    }`}
                  >
                    <i className="fa-solid fa-check" />
                    <span>Approve</span>
                  </button>
                  <button
                    onClick={() => handleQuickVote(character._id, "needs_changes")}
                    disabled={currentVote?.vote === "needs_changes"}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-all ${
                      currentVote?.vote === "needs_changes"
                        ? "border-[#ff6347]/30 bg-[#ff6347]/10 text-[#ff6347] cursor-not-allowed opacity-50"
                        : "border-[#ff6347] bg-[#ff6347] text-white hover:bg-[#ff6347]/90 hover:shadow-md active:scale-[0.98]"
                    }`}
                  >
                    <i className="fa-solid fa-exclamation-triangle" />
                    <span>Needs Revision</span>
                  </button>
                </div>
                {currentVote && (
                  <button
                    onClick={() => handleVoteClick(character)}
                    className="mt-2 w-full rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-1.5 text-xs font-medium text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-green)]/20"
                  >
                    <i className="fa-solid fa-pencil mr-1.5" />
                    Edit Vote
                  </button>
                )}
              </div>

              {/* Vote Details (Collapsible) */}
              {voteSummary.votes.length > 0 && (
                <details className="border-t border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/30">
                  <summary className="cursor-pointer px-4 py-2 text-xs font-medium text-[var(--totk-light-ocher)] hover:text-[var(--totk-light-green)] transition-colors">
                    <i className="fa-solid fa-chevron-down mr-2" />
                    View {voteSummary.votes.length} {voteSummary.votes.length === 1 ? "Vote" : "Votes"}
                  </summary>
                  <div className="border-t border-[var(--totk-dark-ocher)] p-4 space-y-2">
                    {voteSummary.votes.map((vote) => (
                      <div
                        key={`${vote.modId}-${vote.createdAt}`}
                        className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 p-2.5 text-xs"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-[var(--botw-pale)]">
                            {vote.modUsername}
                          </span>
                          <span
                            className={`font-semibold ${
                              vote.vote === "approve"
                                ? "text-[var(--totk-light-green)]"
                                : "text-[#ff6347]"
                            }`}
                          >
                            {vote.vote === "approve" ? "✓" : "⚠"}
                          </span>
                        </div>
                        {vote.reason && (
                          <p className="mt-1 text-[var(--totk-grey-200)] leading-relaxed">
                            {vote.reason}
                          </p>
                        )}
                        {vote.note && (
                          <p className="mt-1 text-[var(--totk-grey-300)] italic">
                            <span className="font-medium">Note:</span> {vote.note}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {/* Vote Modal */}
      {selectedCharacter && (
        <VoteModal
          characterId={selectedCharacter._id}
          characterName={selectedCharacter.name}
          currentVote={selectedCharacter.voteSummary.currentUserVote}
          initialVoteType={initialVoteType}
          onVoteSubmitted={handleVoteSubmitted}
          onClose={() => {
            setVoteModalOpen(false);
            setSelectedCharacter(null);
            setInitialVoteType(undefined);
          }}
          open={voteModalOpen}
        />
      )}
    </>
  );
}
