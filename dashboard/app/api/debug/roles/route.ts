/**
 * Debug endpoint to check user roles.
 * GET /api/debug/roles
 * Returns detailed information about the current user's role checks.
 */

import { NextResponse } from "next/server";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { userHasGuildRole } from "@/lib/discord";

export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  const session = await getSession();
  const user = session.user ?? null;

  if (!user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const guildId = process.env.GUILD_ID;
  const adminRoleId = process.env.ADMIN_ROLE_ID;
  const modRoleId = process.env.MOD_ROLE_ID;
  const hasToken = !!process.env.DISCORD_TOKEN;

  // Check roles directly
  const isAdmin = await isAdminUser(user.id);
  const isMod = await isModeratorUser(user.id);

  // Try to get member info directly to see what Discord returns
  type DiscordMemberInfo = {
    roles?: string[];
    [key: string]: unknown;
  };
  
  let memberInfo: DiscordMemberInfo | null = null;
  let memberInfoError: string | null = null;
  
  if (guildId && hasToken) {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${user.id}`,
        { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
      );
      
      if (res.ok) {
        memberInfo = (await res.json()) as DiscordMemberInfo;
      } else {
        const errorText = await res.text();
        try {
          memberInfoError = JSON.parse(errorText);
        } catch {
          memberInfoError = errorText;
        }
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      memberInfoError = error.message;
    }
  }

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
    },
    configuration: {
      guildId,
      adminRoleId,
      modRoleId,
      hasDiscordToken: hasToken,
    },
    roleChecks: {
      isAdmin,
      isMod,
    },
    discordMemberInfo: memberInfo
      ? {
          roles: memberInfo.roles || [],
          hasAdminRole: adminRoleId ? memberInfo.roles?.includes(adminRoleId) : false,
          hasModRole: modRoleId ? memberInfo.roles?.includes(modRoleId) : false,
        }
      : null,
    errors: {
      memberInfoError,
      possibleCauses: [
        "Bot missing 'Server Members Intent' in Discord Developer Portal",
        "Bot not in the guild",
        "User not in the guild",
        "Bot missing permissions",
        "Invalid Discord token",
      ],
    },
  });
}
