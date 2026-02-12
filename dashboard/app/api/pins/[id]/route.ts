import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { isAdminUser } from "@/lib/session";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const session = await getSession();
  const user = session.user;
  if (!user?.id) return null;
  return { discordId: user.id };
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: pinId } = await params;
  if (!pinId) {
    return NextResponse.json({ error: "Pin ID required" }, { status: 400 });
  }

  try {
    await connect();
    const Pin = (await import("@/models/PinModel.js")).default;

    const pin = await Pin.findById(pinId);
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }
    if (pin.discordId !== auth.discordId) {
      return NextResponse.json({ error: "You can only edit your own pins" }, { status: 403 });
    }

    const contentType = request.headers.get("content-type") || "";
    let name: string;
    let description: string;
    let icon: string;
    let color: string;
    let category: string;
    let isPublic: boolean;
    let characterId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      name = (formData.get("name") as string)?.trim() ?? pin.name;
      description = ((formData.get("description") as string) ?? pin.description ?? "").trim();
      icon = (formData.get("icon") as string) ?? pin.icon;
      color = (formData.get("color") as string) ?? pin.color;
      const cat = formData.get("category");
      category = Array.isArray(cat) ? (cat[0] as string) : (cat as string) ?? pin.category;
      isPublic = (formData.get("isPublic") as string) !== "false";
      const charId = formData.get("characterId") as string | null;
      characterId = charId !== null && charId !== undefined && String(charId).trim() !== "" ? String(charId).trim() : null;
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      name = (body.name as string)?.trim() ?? pin.name;
      description = String(body.description ?? pin.description ?? "").trim();
      icon = String(body.icon ?? pin.icon);
      color = String(body.color ?? pin.color);
      category = String(body.category ?? pin.category);
      isPublic = (body.isPublic as boolean) !== false;
      const charId = body.characterId;
      characterId = charId !== null && charId !== undefined && String(charId).trim() !== "" ? String(charId).trim() : null;
    }

    const validCategories = ["homes", "farms", "shops", "points-of-interest"] as const;
    if (validCategories.includes(category as (typeof validCategories)[number])) {
      pin.category = category as (typeof validCategories)[number];
    }
    pin.name = name.slice(0, 100);
    pin.description = description.slice(0, 500);
    pin.icon = icon.slice(0, 50);
    if (/^#[0-9A-Fa-f]{6}$/.test(color)) pin.color = color;
    pin.isPublic = isPublic;

    if (characterId === null) {
      pin.character = null;
    } else {
      const Character = (await import("@/models/CharacterModel.js")).default;
      const character = await Character.findOne({
        _id: characterId,
        userId: pin.discordId,
      });
      pin.character = character ? character._id : null;
    }

    await pin.save();
    await pin.populate("character", "name");

    return NextResponse.json({ success: true, pin: pin.toObject() });
  } catch (error) {
    console.error("[api/pins] PUT error:", error);
    return NextResponse.json({ error: "Failed to update pin" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { id: pinId } = await params;
  if (!pinId) {
    return NextResponse.json({ error: "Pin ID required" }, { status: 400 });
  }

  try {
    await connect();
    const Pin = (await import("@/models/PinModel.js")).default;

    const pin = await Pin.findById(pinId);
    if (!pin) {
      return NextResponse.json({ error: "Pin not found" }, { status: 404 });
    }
    const isOwner = pin.discordId === auth.discordId;
    const [isMod, isAdmin] = await Promise.all([
      isModeratorUser(auth.discordId),
      isAdminUser(auth.discordId),
    ]);
    if (!isOwner && !isMod && !isAdmin) {
      return NextResponse.json({ error: "You can only delete your own pins" }, { status: 403 });
    }

    await Pin.findByIdAndDelete(pinId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/pins] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete pin" }, { status: 500 });
  }
}
