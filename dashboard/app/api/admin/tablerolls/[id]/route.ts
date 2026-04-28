// ============================================================================
// GET /api/admin/tablerolls/[id] - Get one tableroll (admin only)
// PUT /api/admin/tablerolls/[id] - Update tableroll (admin only)
// DELETE /api/admin/tablerolls/[id] - Delete tableroll (admin only)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";

const NAME_REGEX = /^[a-zA-Z0-9\s\-_]+$/;
const KNOWN_ALLOWED_VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;
const KNOWN_ALLOWED_SET = new Set(KNOWN_ALLOWED_VILLAGES.map((v) => v.toLowerCase()));

function normalizeAllowedVillages(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  const out = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") return null;
    const t = x.trim();
    if (!t) continue;
    const lower = t.toLowerCase();
    if (!KNOWN_ALLOWED_SET.has(lower)) return null;
    const canon = KNOWN_ALLOWED_VILLAGES.find((k) => k.toLowerCase() === lower)!;
    out.add(canon);
  }
  return [...out];
}

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

async function requireAdmin() {
  const session = await getSession();
  const user = session.user ?? null;
  if (!user?.id) {
    return { status: 401 as const, body: { error: "Unauthorized" } };
  }
  const admin = await isAdminUser(user.id);
  if (!admin) {
    return { status: 403 as const, body: { error: "Forbidden", message: "Admin access required" } };
  }
  return { user };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("status" in auth) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await connect();
    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const doc = await TableRoll.findById(id).lean();
    if (!doc) {
      return NextResponse.json({ error: "Table roll not found" }, { status: 404 });
    }
    return NextResponse.json(doc);
  } catch (e) {
    console.error("[api/admin/tablerolls/[id]] GET error:", e);
    return NextResponse.json(
      { error: "Failed to fetch tableroll" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("status" in auth) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await req.json();

    await connect();
    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const doc = await TableRoll.findById(id);
    if (!doc) {
      return NextResponse.json({ error: "Table roll not found" }, { status: 404 });
    }

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(
          { error: "Bad request", message: "name cannot be empty" },
          { status: 400 }
        );
      }
      if (!NAME_REGEX.test(name)) {
        return NextResponse.json(
          { error: "Bad request", message: "Name can only contain letters, numbers, spaces, hyphens, and underscores" },
          { status: 400 }
        );
      }
      doc.name = name;
    }
    if (Array.isArray(body.entries)) {
      if (body.entries.length === 0) {
        return NextResponse.json(
          { error: "Bad request", message: "At least one entry is required" },
          { status: 400 }
        );
      }
      doc.entries = body.entries.map(normalizeEntry);
    }
    if (typeof body.isActive === "boolean") {
      doc.isActive = body.isActive;
    }
    if (typeof body.maxRollsPerDay === "number" && body.maxRollsPerDay >= 0) {
      doc.maxRollsPerDay = body.maxRollsPerDay;
    }

    if (Array.isArray(body.allowedVillages)) {
      const normalizedVillages = normalizeAllowedVillages(body.allowedVillages);
      if (normalizedVillages === null) {
        return NextResponse.json(
          {
            error: "Bad request",
            message:
              `allowedVillages must be an array of villages: ${KNOWN_ALLOWED_VILLAGES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      doc.allowedVillages = normalizedVillages;
    }

    await doc.save();
    const updated = doc.toObject ? doc.toObject() : doc;
    return NextResponse.json(updated);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("duplicate key") || msg.includes("E11000")) {
      return NextResponse.json(
        { error: "Bad request", message: "A table roll with this name already exists" },
        { status: 400 }
      );
    }
    console.error("[api/admin/tablerolls/[id]] PUT error:", e);
    return NextResponse.json(
      { error: "Failed to update tableroll", message: msg },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("status" in auth) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    await connect();
    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const doc = await TableRoll.findByIdAndDelete(id);
    if (!doc) {
      return NextResponse.json({ error: "Table roll not found" }, { status: 404 });
    }
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error("[api/admin/tablerolls/[id]] DELETE error:", e);
    return NextResponse.json(
      { error: "Failed to delete tableroll" },
      { status: 500 }
    );
  }
}
