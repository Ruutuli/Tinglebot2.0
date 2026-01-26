/**
 * Session utilities: iron-session config, types, and admin check.
 * Uses SESSION_SECRET and ADMIN_ROLE_ID (Discord role) + GUILD_ID.
 */

import { getIronSession, type IronSession } from "iron-session";
import { cookies } from "next/headers";
import { userHasGuildRole } from "@/lib/discord";

export type SessionUser = {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
};

export type SessionData = {
  user?: SessionUser;
};

const SESSION_OPTIONS = {
  cookieName: "tinglebot_session",
  password: process.env.SESSION_SECRET!,
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 14 - 60, // 14 days minus 1 min
    path: "/",
  },
};

export function getSessionOptions() {
  return SESSION_OPTIONS;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, SESSION_OPTIONS);
}

/**
 * Check if user is admin via Discord role in guild.
 * Uses ADMIN_ROLE_ID and GUILD_ID from env.
 */
export async function isAdminUser(discordId: string): Promise<boolean> {
  const guildId = process.env.GUILD_ID;
  const roleId = process.env.ADMIN_ROLE_ID;
  
  if (!guildId || !roleId) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[isAdminUser] Missing configuration: guildId=${guildId}, roleId=${roleId}`
      );
    }
    return false;
  }

  return userHasGuildRole(guildId, discordId, roleId);
}
