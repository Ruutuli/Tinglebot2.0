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
    const characters = await Character.find({ userId: user.id })
      .select("_id name")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({
      characters: characters.map((c) => ({
        _id: String(c._id),
        name: c.name,
      })),
    });
  } catch (error) {
    console.error("[api/characters/list] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch characters" },
      { status: 500 }
    );
  }
}
