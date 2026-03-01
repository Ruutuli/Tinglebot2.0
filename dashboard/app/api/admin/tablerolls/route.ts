// ============================================================================
// GET /api/admin/tablerolls - List all tablerolls (admin only)
// POST /api/admin/tablerolls - Create tableroll (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";

const NAME_REGEX = /^[a-zA-Z0-9\s\-_]+$/;

function normalizeEntry(raw: unknown): { weight: number; flavor: string; item: string; thumbnailImage: string } {
  if (!raw || typeof raw !== "object") {
    return { weight: 1, flavor: "", item: "", thumbnailImage: "" };
  }
  const o = raw as Record<string, unknown>;
  const rawWeight = typeof o.weight === "number" && o.weight > 0 ? o.weight : Number(o.weight);
  const weight = Number.isFinite(rawWeight) && rawWeight >= 1 ? Math.round(rawWeight) : 1;
  return {
    weight,
    flavor: typeof o.flavor === "string" ? o.flavor : "",
    item: typeof o.item === "string" ? o.item : "",
    thumbnailImage: typeof o.thumbnailImage === "string" ? o.thumbnailImage : "",
  };
}

export async function GET() {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    await connect();
    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const tablerolls = await TableRoll.find({})
      .sort({ name: 1 })
      .lean();

    return NextResponse.json(tablerolls);
  } catch (e) {
    console.error("[api/admin/tablerolls] GET error:", e);
    return NextResponse.json(
      { error: "Failed to fetch tablerolls" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json(
        { error: "Bad request", message: "name is required" },
        { status: 400 }
      );
    }
    if (!NAME_REGEX.test(name)) {
      return NextResponse.json(
        { error: "Bad request", message: "Name can only contain letters, numbers, spaces, hyphens, and underscores" },
        { status: 400 }
      );
    }
    const rawEntries = Array.isArray(body.entries) ? body.entries : [];
    if (rawEntries.length === 0) {
      return NextResponse.json(
        { error: "Bad request", message: "At least one entry is required" },
        { status: 400 }
      );
    }
    const entries = rawEntries.map(normalizeEntry);
    const isActive = typeof body.isActive === "boolean" ? body.isActive : true;
    const maxRollsPerDay = typeof body.maxRollsPerDay === "number" && body.maxRollsPerDay >= 0
      ? body.maxRollsPerDay
      : 0;

    await connect();
    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const doc = new TableRoll({
      name,
      entries,
      createdBy: user.id,
      isActive,
      maxRollsPerDay,
    });
    await doc.save();
    const created = doc.toObject ? doc.toObject() : doc;
    return NextResponse.json(created);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate key") || msg.includes("E11000")) {
      return NextResponse.json(
        { error: "Bad request", message: "A table roll with this name already exists" },
        { status: 400 }
      );
    }
    console.error("[api/admin/tablerolls] POST error:", e);
    return NextResponse.json(
      { error: "Failed to create tableroll", message: msg },
      { status: 500 }
    );
  }
}
