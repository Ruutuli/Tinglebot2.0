import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Search accepted player characters + mod characters by name (for crafting request target picker).
 * Optional repeated `job` query params restrict to characters with those jobs (e.g. only crafters for an item).
 * With `job` set and empty `q`, returns an alphabetical browse list (up to limit).
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const jobFilters = url.searchParams
      .getAll("job")
      .map((j) => j.trim())
      .filter(Boolean);

    const browseByJobs = jobFilters.length > 0 && q.length === 0;
    const searchOk = q.length >= 2 || (jobFilters.length > 0 && q.length >= 1);

    if (!browseByJobs && !searchOk) {
      return NextResponse.json({ characters: [] });
    }

    const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("limit") ?? "15", 10) || 15));

    const esc = q.length > 0 ? q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
    const nameRe = esc ? new RegExp(esc, "i") : null;

    const charFilter: Record<string, unknown> = { status: "accepted" };
    if (nameRe) charFilter.name = nameRe;
    if (jobFilters.length) charFilter.job = { $in: jobFilters };

    const modFilter: Record<string, unknown> = {};
    if (nameRe) modFilter.name = nameRe;
    if (jobFilters.length) modFilter.job = { $in: jobFilters };

    await connect();
    const Character = (await import("@/models/CharacterModel.js")).default;
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;

    const [regular, mod] = await Promise.all([
      Character.find(charFilter)
        .select("_id name userId job currentStamina homeVillage")
        .sort({ name: 1 })
        .limit(limit)
        .lean(),
      ModCharacter.find(modFilter)
        .select("_id name userId job currentStamina homeVillage")
        .sort({ name: 1 })
        .limit(limit)
        .lean(),
    ]);

    const merged = [
      ...regular.map((c) => ({
        _id: String(c._id),
        name: c.name,
        userId: c.userId,
        job: c.job,
        currentStamina: c.currentStamina,
        homeVillage: c.homeVillage,
        isModCharacter: false,
      })),
      ...mod.map((c) => ({
        _id: String(c._id),
        name: c.name,
        userId: c.userId,
        job: c.job,
        currentStamina: c.currentStamina,
        homeVillage: c.homeVillage,
        isModCharacter: true,
      })),
    ];

    merged.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ characters: merged.slice(0, limit) });
  } catch (err) {
    console.error("[api/characters/search]", err);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
