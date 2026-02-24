// ============================================================================
// ------------------- Admin Tasks - Mod List API -------------------
// GET /api/admin/tasks/mods - Get list of moderators for assignment
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { discordApiRequest } from "@/lib/discord";
import { logger } from "@/utils/logger";

interface GuildMember {
  user?: {
    id: string;
    username: string;
    global_name?: string;
    avatar?: string;
  };
  roles: string[];
}

interface ModInfo {
  discordId: string;
  username: string;
  avatar: string | null;
}

async function canAccessTasks(userId: string): Promise<boolean> {
  const [admin, mod] = await Promise.all([
    isAdminUser(userId),
    isModeratorUser(userId),
  ]);
  return admin || mod;
}

// Cache mods for 5 minutes to avoid excessive Discord API calls
let modsCache: { mods: ModInfo[]; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allowed = await canAccessTasks(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    // Check cache
    if (modsCache && Date.now() - modsCache.timestamp < CACHE_TTL) {
      return NextResponse.json({ mods: modsCache.mods });
    }

    const guildId = process.env.GUILD_ID;
    const modRoleId = process.env.MOD_ROLE_ID;
    const adminRoleId = process.env.ADMIN_ROLE_ID;

    if (!guildId) {
      return NextResponse.json(
        { error: "Configuration error", message: "GUILD_ID not configured" },
        { status: 500 }
      );
    }

    // Fetch guild members (up to 1000)
    const members = await discordApiRequest<GuildMember[]>(
      `/guilds/${guildId}/members?limit=1000`
    );

    if (!members) {
      return NextResponse.json(
        { error: "Failed to fetch guild members from Discord" },
        { status: 500 }
      );
    }

    // Filter to only mods and admins
    const mods: ModInfo[] = [];
    const roleIds = [modRoleId, adminRoleId].filter(Boolean) as string[];

    for (const member of members) {
      if (!member.user) continue;
      
      const hasRole = roleIds.some((roleId) => member.roles.includes(roleId));
      if (hasRole) {
        mods.push({
          discordId: member.user.id,
          username: member.user.global_name || member.user.username,
          avatar: member.user.avatar
            ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.png`
            : null,
        });
      }
    }

    // Sort alphabetically by username
    mods.sort((a, b) => a.username.localeCompare(b.username));

    // Update cache
    modsCache = { mods, timestamp: Date.now() };

    return NextResponse.json({ mods });
  } catch (e) {
    logger.error("api/admin/tasks/mods GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch moderators" },
      { status: 500 }
    );
  }
}
