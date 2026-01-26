// ============================================================================
// ------------------- GET /api/auth/session -------------------
// ============================================================================
// Return current user, isAdmin, and isModerator.
// Used by client for auth state and admin/moderator gating.
// Admin = user has ADMIN_ROLE_ID in GUILD_ID (Discord role).
// Moderator = user has MOD_ROLE_ID in GUILD_ID (Discord role).

import { NextResponse } from "next/server";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export async function GET() {
  const session = await getSession();
  const user = session.user ?? null;
  const isAdmin = user ? await isAdminUser(user.id) : false;
  const isModerator = user ? await isModeratorUser(user.id) : false;

  return NextResponse.json({
    user,
    isAdmin,
    isModerator,
  });
}
