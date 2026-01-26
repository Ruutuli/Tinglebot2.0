"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [edit/[id]/page.tsx]✨ Core dependencies - */
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { CreateForm, type CreateMetadata } from "../../create/page";
import type { CharacterStatus } from "@/lib/character-field-editability";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* ============================================================================ */
/* ------------------- Subcomponents ------------------- */
/* ============================================================================ */

/* [edit/[id]/page.tsx]🧩 Page header component - */
function PageHeader() {
  return (
    <div className="mb-3 sm:mb-4 md:mb-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4">
      <img
        alt=""
        className="h-4 w-auto sm:h-5 md:h-6"
        src="/Side=Left.svg"
      />
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-green)]">
        Edit Character
      </h1>
      <img
        alt=""
        className="h-4 w-auto sm:h-5 md:h-6"
        src="/Side=Right.svg"
      />
    </div>
  );
}

/* [edit/[id]/page.tsx]🧩 Message banner component - */
type MessageBannerProps = {
  type: "success" | "error";
  message: string;
};

function MessageBanner({ type, message }: MessageBannerProps) {
  const isSuccess = type === "success";
  const borderColor = isSuccess ? "border-[var(--totk-light-green)]" : "border-[#ff6347]";
  const bgColor = isSuccess ? "bg-[var(--totk-light-green)]/10" : "bg-[#ff6347]/10";
  const textColor = isSuccess ? "text-[var(--totk-light-green)]" : "text-[#ff6347]";
  const icon = isSuccess ? "fa-check-circle" : "fa-exclamation-triangle";

  return (
    <div className={`mb-4 sm:mb-6 rounded-lg border-2 ${borderColor} ${bgColor} px-3 py-2.5 sm:px-4 sm:py-3 text-center`}>
      <p className={`text-xs sm:text-sm font-medium ${textColor}`}>
        <i className={`fa-solid ${icon} mr-1.5 sm:mr-2`} aria-hidden="true" />
        {message}
      </p>
    </div>
  );
}

type CharacterData = {
  _id?: string;
  name?: string;
  age?: number | null;
  height?: number | null;
  pronouns?: string;
  gender?: string;
  race?: string;
  homeVillage?: string;
  village?: string;
  job?: string;
  virtue?: string;
  personality?: string;
  history?: string;
  extras?: string;
  appLink?: string;
  icon?: string;
  appArt?: string;
  maxHearts?: number;
  maxStamina?: number;
  birthday?: string | null;
  status?: string | null;
  gearWeapon?: { name: string; stats: Record<string, number> | Map<string, number> };
  gearShield?: { name: string; stats: Record<string, number> | Map<string, number> };
  gearArmor?: {
    head?: { name: string; stats: Record<string, number> | Map<string, number> };
    chest?: { name: string; stats: Record<string, number> | Map<string, number> };
    legs?: { name: string; stats: Record<string, number> | Map<string, number> };
  };
};

/* ============================================================================ */
/* ------------------- Edit Page Component ------------------- */
/* ============================================================================ */

export default function EditCharacterPage() {
  const params = useParams();
  const router = useRouter();
  const { loading: sessionLoading, user } = useSession();
  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [metadata, setMetadata] = useState<CreateMetadata | null>(null);
  const [charError, setCharError] = useState<string | null>(null);
  const [charLoading, setCharLoading] = useState(true);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submittingForReview, setSubmittingForReview] = useState(false);
  const [submitReviewError, setSubmitReviewError] = useState<string | null>(null);
  const [submitReviewSuccess, setSubmitReviewSuccess] = useState(false);

  const characterId = typeof params.id === "string" ? params.id : null;

  const fetchCharacter = useCallback(async () => {
    if (!characterId) {
      setCharError("Character ID is required");
      setCharLoading(false);
      return;
    }

    setCharLoading(true);
    setCharError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          (b as { error?: string }).error ?? `Request failed: ${res.status}`
        );
      }
      const data = (await res.json()) as { character?: CharacterData };
      if (!data.character) {
        throw new Error("Character not found");
      }
      setCharacter(data.character);
    } catch (e) {
      setCharError(e instanceof Error ? e.message : String(e));
      setCharacter(null);
    } finally {
      setCharLoading(false);
    }
  }, [characterId]);

  const fetchMetadata = useCallback(async () => {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/characters/create-metadata");
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          (b as { error?: string }).error ?? `Request failed: ${res.status}`
        );
      }
      const data = (await res.json()) as CreateMetadata;
      setMetadata(data);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : String(e));
      setMetadata(null);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCharacter();
    fetchMetadata();
  }, [fetchCharacter, fetchMetadata]);

  const handleSubmitForReview = useCallback(async () => {
    if (!characterId) return;
    
    setSubmittingForReview(true);
    setSubmitReviewError(null);
    setSubmitReviewSuccess(false);
    
    try {
      const res = await fetch(`/api/characters/${characterId}/submit`, {
        method: "POST",
      });
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to submit character");
      }
      
      setSubmitReviewSuccess(true);
      // Refresh character data to get updated status
      await fetchCharacter();
      
      // Clear success message after 3 seconds
      setTimeout(() => setSubmitReviewSuccess(false), 3000);
    } catch (e) {
      setSubmitReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmittingForReview(false);
    }
  }, [characterId, fetchCharacter]);

  const loading = sessionLoading || charLoading || metaLoading;
  const error = charError || metaError;

  if (loading) {
    return (
      <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <Loading
            message="Loading character data..."
            size="lg"
            variant="inline"
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <PageHeader />
          <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-brown)]/80 p-3 sm:p-4 md:p-6">
            <p className="text-center text-sm sm:text-base text-[var(--botw-pale)]">
              Sign in to edit a character.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !character || !metadata) {
    return (
      <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <PageHeader />
          <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-brown)]/80 p-3 sm:p-4 md:p-6">
            <p className="text-center text-sm sm:text-base text-[var(--botw-pale)]">
              {error ?? "Failed to load character data."}
            </p>
            {error && (
              <div className="mt-3 sm:mt-4 text-center">
                <button
                  onClick={() => router.push("/characters/my-ocs")}
                  className="rounded-md border-2 border-[var(--totk-light-green)] bg-[var(--botw-warm-black)] px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)] hover:text-[var(--botw-warm-black)] hover:shadow-[0_0_12px_rgba(73,213,156,0.4)] hover:scale-[1.02] transition-all min-h-[44px] touch-manipulation"
                >
                  Back to My OCs
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* [edit/[id]/page.tsx]🧠 Character status helper - */
  const getCharacterStatus = useCallback((): CharacterStatus | null => {
    if (!character?.status) return null;
    const status = character.status;
    if (status === "pending" || status === "needs_changes" || status === "accepted") {
      return status as CharacterStatus;
    }
    return null;
  }, [character?.status]);

  return (
    <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        <PageHeader />
        
        {/* Submit Success/Error Messages */}
        {submitReviewSuccess && (
          <MessageBanner
            type="success"
            message="Character submitted successfully!"
          />
        )}
        {submitReviewError && (
          <MessageBanner
            type="error"
            message={submitReviewError}
          />
        )}
        
        <CreateForm
          metadata={metadata}
          submitError={submitError}
          submitLoading={submitLoading}
          submitSuccess={submitSuccess}
          setSubmitError={setSubmitError}
          setSubmitLoading={setSubmitLoading}
          setSubmitSuccess={setSubmitSuccess}
          characterId={characterId!}
          initialCharacter={character}
          onSubmitForReview={handleSubmitForReview}
          submittingForReview={submittingForReview}
          characterStatus={getCharacterStatus()}
        />
      </div>
    </div>
  );
}
