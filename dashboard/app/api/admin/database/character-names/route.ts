// ============================================================================
// GET /api/admin/database/character-names
// Returns sorted unique character names (regular + mod) for admin UI autocomplete.
// Admin-only.
// ============================================================================

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";

export async function GET() {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      logger.warn(
        "api/admin/database/character-names GET",
        `Access denied for user ${user.id}: not admin`
      );
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    await connect();

    const names = new Set<string>();

    const CharacterModule = await import("@/models/CharacterModel.js");
    const Character = CharacterModule.default;
    const chars = await Character.find({}).select("name").lean();
    for (const c of chars as { name?: string }[]) {
      if (c?.name && typeof c.name === "string") names.add(c.name.trim());
    }

    try {
      const ModModule = await import("@/models/ModCharacterModel.js");
      const ModCharacter = ModModule.default;
      const mods = await ModCharacter.find({}).select("name").lean();
      for (const c of mods as { name?: string }[]) {
        if (c?.name && typeof c.name === "string") names.add(c.name.trim());
      }
    } catch {
      // Mod character collection optional in some environments
    }

    const sorted = Array.from(names).sort((a, b) => a.localeCompare(b));
    return NextResponse.json({ names: sorted });
  } catch (e) {
    logger.error("api/admin/database/character-names GET", String(e));
    return NextResponse.json(
      { error: "Internal Server Error", message: "Failed to load character names" },
      { status: 500 }
    );
  }
}
