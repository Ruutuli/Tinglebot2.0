"use client";

/* ============================================================================ */
/* ------------------- Character Moderation Page ------------------- */
/* Dashboard for moderators to review and vote on character applications */
/* ============================================================================ */

import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { CharacterModerationList } from "@/components/features/character-moderation/CharacterModerationList";
import Link from "next/link";

export default function CharacterModerationPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();

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
              You must be logged in to access the moderation dashboard.
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

  if (!isAdmin && !isModerator) {
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
              You must be an admin or moderator to access this page.
            </p>
            <Link
              href="/"
              className="inline-block rounded-md bg-[var(--totk-mid-ocher)] px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-8">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-12 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-6">
            <img src="/Side=Left.svg" alt="" className="h-8 w-auto opacity-80" />
            <h1 className="text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              Character Moderation
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-8 w-auto opacity-80" />
          </div>
          <p className="text-[var(--totk-grey-200)] font-medium tracking-widest uppercase text-sm opacity-60">
            Review and vote on character applications
          </p>
        </div>

        {/* Moderation List */}
        <CharacterModerationList currentUserId={user.id} />
      </div>
    </div>
  );
}
