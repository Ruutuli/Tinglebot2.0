"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { capitalize } from "@/lib/string-utils";
import { imageUrlForGcsUrl } from "@/lib/image-url";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type Pet = {
  _id: string;
  name: string;
  species: string;
  petType: string;
  level: number;
  ownerName: string;
  status: "active" | "stored" | "retired" | "for_sale";
  rollsRemaining: number;
  rollCombination: string[];
  imageUrl?: string;
};

type Mount = {
  _id: string;
  name: string;
  species: string;
  level: string;
  stamina: number;
  currentStamina?: number;
  owner: string;
  status: "active" | "stored" | "for_sale";
  traits?: string[];
  region?: string;
};

type StatusType = Pet["status"] | Mount["status"];

type SectionProps = {
  title: string;
  children: React.ReactNode;
  emptyMessage: string;
};

// ============================================================================
// ------------------- Constants & Helpers -------------------
// ============================================================================

// ------------------- Shared ClassName Constants ------------------
// Reusable className strings to prevent duplication -
const CARD_BASE_CLASS = "pet-card group relative overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 shadow-lg transition-all duration-300 hover:border-[var(--totk-light-green)] hover:shadow-xl hover:shadow-[var(--totk-light-green)]/30 hover:-translate-y-1";

const IMAGE_CONTAINER_CLASS = "relative h-24 w-24 overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)] shadow-inner";

const DETAIL_BOX_CLASS = "rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 shadow-inner";

const TAG_BADGE_CLASS = "rounded-md border border-[var(--totk-light-ocher)]/30 bg-gradient-to-br from-[var(--totk-light-ocher)]/25 to-[var(--totk-light-ocher)]/15 px-2 py-0.5 text-xs font-semibold text-[var(--totk-light-ocher)]";

const EMPTY_STATE_CLASS = "rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 p-12 text-center";

// ------------------- Status Color Helper ------------------
// Returns CSS classes for status badges based on status type -
const getStatusColor = (status: StatusType): string => {
  switch (status) {
    case "active":
      return "bg-gradient-to-br from-[var(--totk-light-green)]/25 to-[var(--totk-light-green)]/15 text-[var(--totk-light-green)] border-[var(--totk-light-green)]/30";
    case "stored":
      return "bg-gradient-to-br from-[var(--botw-blue)]/25 to-[var(--botw-blue)]/15 text-[var(--botw-blue)] border-[var(--botw-blue)]/30";
    case "retired":
      return "bg-gradient-to-br from-[var(--totk-grey-200)]/25 to-[var(--totk-grey-200)]/15 text-[var(--totk-grey-200)] border-[var(--totk-grey-200)]/30";
    case "for_sale":
      return "bg-gradient-to-br from-[var(--totk-light-ocher)]/25 to-[var(--totk-light-ocher)]/15 text-[var(--totk-light-ocher)] border-[var(--totk-light-ocher)]/30";
    default:
      return "bg-gradient-to-br from-[var(--totk-grey-200)]/25 to-[var(--totk-grey-200)]/15 text-[var(--totk-grey-200)] border-[var(--totk-grey-200)]/30";
  }
};

// ------------------- Image URL Helper ------------------
// Normalizes image URLs for display -
const normalizeImageUrl = (imageUrl: string): string => {
  if (imageUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(imageUrl);
  }
  return imageUrl;
};

// ============================================================================
// ------------------- Components -------------------
// ============================================================================

// ------------------- DetailBox Component ------------------
// Renders a stat detail box with label and value -
type DetailBoxProps = {
  label: string;
  value: React.ReactNode;
  valueColor?: string;
  size?: "sm" | "md";
};

function DetailBox({ label, value, valueColor = "text-[var(--totk-light-green)]", size = "sm" }: DetailBoxProps) {
  const paddingClass = size === "md" ? "p-3" : "p-2";
  const labelMarginClass = size === "md" ? "mb-1" : "mb-0.5";
  const valueSizeClass = size === "md" ? "text-xl" : "text-lg";

  return (
    <div className={`${DETAIL_BOX_CLASS} ${paddingClass}`}>
      <p className={`${labelMarginClass} text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]`}>
        {label}
      </p>
      <p className={`${valueSizeClass} font-bold ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

// ------------------- TagList Component ------------------
// Renders a list of tags/badges -
type TagListProps = {
  tags: string[];
  gap?: "gap-1.5" | "gap-2";
  tagPadding?: "py-0.5" | "py-1";
};

function TagList({ tags, gap = "gap-1.5", tagPadding = "py-0.5" }: TagListProps) {
  if (tags.length === 0) return null;

  return (
    <div className={`flex flex-wrap ${gap}`}>
      {tags.map((tag) => (
        <span
          key={tag}
          className={`${TAG_BADGE_CLASS} ${tagPadding}`}
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

// ------------------- EmptyState Component ------------------
// Renders an empty state message -
type EmptyStateProps = {
  message: string;
};

function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className={EMPTY_STATE_CLASS}>
      <p className="text-base text-[var(--botw-pale)] opacity-60 italic">{message}</p>
    </div>
  );
}

// ------------------- PetCard Component ------------------
function PetCard({ pet }: { pet: Pet }) {

  // ------------------- Image Error Handler ------------------
  // Handles image load errors by falling back to default icon -
  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    target.src = "/ankle_icon.png";
  }, []);

  return (
    <article className={`${CARD_BASE_CLASS} p-4`}>
      <div className="flex gap-4">
        {/* Pet Image - Left Side */}
        <div className="shrink-0">
          {pet.imageUrl ? (
            <div className={`${IMAGE_CONTAINER_CLASS}`}>
              <Image
                src={normalizeImageUrl(pet.imageUrl)}
                alt={pet.name}
                fill
                className="object-cover"
                onError={handleImageError}
                unoptimized
              />
            </div>
          ) : (
            <div className={`${IMAGE_CONTAINER_CLASS} flex items-center justify-center`}>
              <i className="fa-solid fa-paw text-3xl text-[var(--totk-grey-200)]" aria-hidden="true" />
            </div>
          )}
        </div>

        {/* Info - Right Side */}
        <div className="flex-1 min-w-0">
          {/* Header with Name and Status */}
          <header className="mb-3 flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] truncate">
                {pet.name}
              </h3>
              <p className="mt-0.5 text-sm font-medium text-[var(--botw-pale)] opacity-90">
                {pet.species} <span className="text-[var(--totk-grey-200)]" aria-hidden="true">•</span> {pet.petType}
              </p>
            </div>
            <span 
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide shadow-md ${getStatusColor(pet.status)}`}
              aria-label={`Status: ${pet.status}`}
            >
              {capitalize(pet.status)}
            </span>
          </header>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <DetailBox label="Level" value={pet.level} />
            <DetailBox label="Rolls Remaining" value={pet.rollsRemaining} valueColor="text-[var(--botw-blue)]" />
          </div>

          {/* Roll Combination */}
          {pet.rollCombination && pet.rollCombination.length > 0 && (
            <div className={`${DETAIL_BOX_CLASS} p-2`}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                Roll Combination
              </p>
              <TagList tags={pet.rollCombination} />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ------------------- MountCard Component ------------------
function MountCard({ mount }: { mount: Mount }) {
  return (
    <article className={`${CARD_BASE_CLASS} p-6`}>
      {/* Header */}
      <header className="relative mb-4 flex items-start justify-between">
        <div className="flex-1 pr-2">
          <h3 className="text-xl font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
            {mount.name}
          </h3>
          <p className="mt-1 text-sm font-medium text-[var(--botw-pale)] opacity-90">
            {mount.species} <span className="text-[var(--totk-grey-200)]" aria-hidden="true">•</span> {mount.level}
          </p>
        </div>
        <span 
          className={`ml-2 shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-md ${getStatusColor(mount.status)}`}
          aria-label={`Status: ${mount.status}`}
        >
          {capitalize(mount.status)}
        </span>
      </header>

      {/* Details Grid */}
      <div className="grid grid-cols-2 gap-3">
        <DetailBox 
          label="Stamina" 
          value={`${mount.currentStamina ?? mount.stamina}/${mount.stamina}`}
          valueColor="text-[var(--botw-blue)]"
          size="md"
        />
        {mount.region && (
          <DetailBox 
            label="Region" 
            value={mount.region}
            valueColor="text-[var(--totk-light-ocher)]"
            size="md"
          />
        )}
      </div>

      {/* Traits */}
      {mount.traits && mount.traits.length > 0 && (
        <div className={`${DETAIL_BOX_CLASS} mt-4 p-3`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
            Traits
          </p>
          <TagList tags={mount.traits} gap="gap-2" tagPadding="py-1" />
        </div>
      )}
    </article>
  );
}

// ------------------- Section Component ------------------
function Section({ title, children, emptyMessage }: SectionProps) {
  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center gap-4">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--totk-dark-ocher)]/50" />
        <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)] uppercase tracking-wider px-2">
          {title}
        </h2>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--totk-dark-ocher)]/50" />
      </div>
      {children}
    </section>
  );
}

// ============================================================================
// ------------------- Main Component -------------------
// ============================================================================

export default function MyCompanionsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [pets, setPets] = useState<Pet[]>([]);
  const [mounts, setMounts] = useState<Mount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ------------------- Fetch Companions Effect ------------------
  // Fetches pets and mounts data with proper cleanup to prevent memory leaks -
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const abortController = new AbortController();

    const fetchCompanions = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/characters/my-companions", {
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch companions: ${res.status} ${res.statusText}`);
        }

        const data = await res.json();

        // Only update state if not aborted
        if (!abortController.signal.aborted) {
          setPets(data.pets || []);
          setMounts(data.mounts || []);
        }
      } catch (err) {
        // Don't set error if fetch was aborted (component unmounted)
        if (abortController.signal.aborted) {
          return;
        }

        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[my-companions/page.tsx] ❌ Failed to load companions:", error);
        setError(error.message);
      } finally {
        // Only update loading state if not aborted
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchCompanions();

    // Cleanup: abort fetch if component unmounts or user changes
    return () => {
      abortController.abort();
    };
  }, [user]);

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading message="Loading companions..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-[var(--totk-light-ocher)] mb-6">
            Access Denied
          </h1>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-8 shadow-2xl">
            <p className="text-base text-[var(--botw-pale)] mb-6">
              You must be logged in to view your companions.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-block rounded-md bg-[#5865F2] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#4752C4]"
            >
              Login with Discord
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ------------------- Render Helpers ------------------
  // Precompute content to avoid nested ternaries -
  const petsContent = pets.length === 0 ? (
    <EmptyState message="You don't have any pets yet." />
  ) : (
    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {pets.map((pet) => (
        <PetCard key={pet._id} pet={pet} />
      ))}
    </div>
  );

  const mountsContent = mounts.length === 0 ? (
    <EmptyState message="You don't have any mounts yet." />
  ) : (
    <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      {mounts.map((mount) => (
        <MountCard key={mount._id} mount={mount} />
      ))}
    </div>
  );

  return (
    <main className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <header className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-4">
            <img src="/Side=Left.svg" alt="" className="h-6 md:h-8 opacity-80" aria-hidden="true" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              My Companions
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-6 md:h-8 opacity-80" aria-hidden="true" />
          </div>
          <p className="text-[var(--totk-grey-200)] font-medium tracking-widest uppercase text-sm opacity-60 text-center">
            Your pets and mounts
          </p>
        </header>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-6 shadow-lg" role="alert">
            <div className="flex items-start gap-4">
              <i className="fa-solid fa-exclamation-triangle text-2xl text-[#ff6347]" aria-hidden="true" />
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-bold text-[#ff6347]">Failed to Load Companions</h3>
                <p className="text-sm text-[var(--botw-pale)]">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Pets Section */}
        <Section
          title="Pets"
          emptyMessage="You don't have any pets yet."
        >
          {petsContent}
        </Section>

        {/* Mounts Section */}
        <Section
          title="Mounts"
          emptyMessage="You don't have any mounts yet."
        >
          {mountsContent}
        </Section>
      </div>
    </main>
  );
}
