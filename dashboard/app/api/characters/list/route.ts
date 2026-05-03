import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/characters/list
 * Returns a simple list of the current user's characters (id + name) for dropdowns (e.g. pin tagging).
 */
export async function GET() {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connect();
    const Character = (await import("@/models/CharacterModel.js")).default;
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;

    const [regularChars, modChars] = await Promise.all([
      Character.find({ userId: user.id })
        .select("_id name job jobVoucher jobVoucherJob currentStamina maxStamina currentVillage")
        .sort({ name: 1 })
        .lean(),
      ModCharacter.find({ userId: user.id })
        .select("_id name job jobVoucher jobVoucherJob currentStamina maxStamina currentVillage")
        .sort({ name: 1 })
        .lean(),
    ]);

    const characters = [
      ...regularChars.map((c) => ({
        _id: String(c._id),
        name: c.name,
        job: c.job,
        jobVoucher: Boolean(c.jobVoucher),
        jobVoucherJob:
          c.jobVoucherJob === undefined || c.jobVoucherJob === null ? null : String(c.jobVoucherJob),
        currentStamina: c.currentStamina,
        maxStamina: Math.max(0, Number((c as { maxStamina?: number }).maxStamina) || 0),
        currentVillage: String((c as { currentVillage?: string }).currentVillage ?? "").trim(),
        isModCharacter: false,
      })),
      ...modChars.map((c) => ({
        _id: String(c._id),
        name: c.name,
        job: c.job,
        jobVoucher: Boolean(c.jobVoucher),
        jobVoucherJob:
          c.jobVoucherJob === undefined || c.jobVoucherJob === null ? null : String(c.jobVoucherJob),
        currentStamina: c.currentStamina,
        maxStamina: Math.max(0, Number((c as { maxStamina?: number }).maxStamina) || 999),
        currentVillage: String((c as { currentVillage?: string }).currentVillage ?? "").trim(),
        isModCharacter: true,
      })),
    ].sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ characters });
  } catch (error) {
    console.error("[api/characters/list] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch characters" },
      { status: 500 }
    );
  }
}
