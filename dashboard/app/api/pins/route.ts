import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

async function getAuthenticatedUser() {
  const session = await getSession();
  const user = session.user;
  if (!user?.id) {
    return null;
  }
  return { discordId: user.id, username: user.username };
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    await connect();
    const Pin = (await import("@/models/PinModel.js")).default;
    const User = (await import("@/models/UserModel.js")).default;
    const pins = await (Pin as unknown as { getUserPins: (d: string, p: boolean) => Promise<unknown[]> }).getUserPins(auth.discordId, true);
    const list = pins ?? [];
    if (list.length === 0) {
      return NextResponse.json({ success: true, pins: [] });
    }
    const discordIds = [...new Set((list as { discordId: string }[]).map((p) => p.discordId))];
    const users = await User.find({ discordId: { $in: discordIds } })
      .select("discordId username")
      .lean();
    const userByDiscordId = new Map(
      (users as unknown as { discordId: string; username?: string }[]).map((u) => [u.discordId, u.username || ""])
    );
    const pinsWithCreator = (list as Record<string, unknown>[]).map((pin) => ({
      ...pin,
      creator: {
        username: userByDiscordId.get((pin.discordId as string) ?? "") || "Unknown",
      },
    }));
    return NextResponse.json({ success: true, pins: pinsWithCreator });
  } catch (error) {
    console.error("[api/pins] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch pins" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    await connect();
    const User = (await import("@/models/UserModel.js")).default;
    const Pin = (await import("@/models/PinModel.js")).default;

    const userDoc = await User.findOne({ discordId: auth.discordId });
    if (!userDoc) {
      return NextResponse.json({ error: "User record not found" }, { status: 400 });
    }
    if (auth.username && (userDoc as { username?: string }).username !== auth.username) {
      await User.updateOne({ discordId: auth.discordId }, { $set: { username: auth.username } });
    }

    const contentType = request.headers.get("content-type") || "";
    let body: Record<string, unknown>;
    let coordinates: { lat: number; lng: number };
    let name: string;
    let description: string;
    let icon: string;
    let color: string;
    let category: string;
    let isPublic = true;
    let characterId: string | null = null;
    let imageUrl: string | null = null;
    let sourceDiscoveryKey: string | null = null;
    let partyId: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const coordsStr = formData.get("coordinates");
      if (typeof coordsStr !== "string") {
        return NextResponse.json({ error: "Missing required fields: coordinates" }, { status: 400 });
      }
      coordinates = JSON.parse(coordsStr) as { lat: number; lng: number };
      name = (formData.get("name") as string)?.trim() || "";
      description = ((formData.get("description") as string) || "").trim();
      icon = (formData.get("icon") as string) || "fas fa-map-marker-alt";
      color = (formData.get("color") as string) || "#00A3DA";
      const cat = formData.get("category");
      category = Array.isArray(cat) ? (cat[0] as string) : (cat as string) || "homes";
      isPublic = (formData.get("isPublic") as string) !== "false";
      const charId = formData.get("characterId") as string | null;
      characterId = charId && String(charId).trim() ? String(charId).trim() : null;
      const imgUrl = formData.get("imageUrl") as string | null;
      imageUrl = imgUrl && String(imgUrl).trim() ? String(imgUrl).trim() : null;
      const srcKey = formData.get("sourceDiscoveryKey") as string | null;
      sourceDiscoveryKey = srcKey && String(srcKey).trim() ? String(srcKey).trim() : null;
      const pId = formData.get("partyId") as string | null;
      partyId = pId && String(pId).trim() ? String(pId).trim() : null;
    } else {
      body = (await request.json()) as Record<string, unknown>;
      const coords = body.coordinates as { lat?: number; lng?: number };
      if (coords?.lat == null || coords?.lng == null) {
        return NextResponse.json({ error: "Missing required fields: name and coordinates" }, { status: 400 });
      }
      coordinates = { lat: Number(coords.lat), lng: Number(coords.lng) };
      name = String(body.name || "").trim();
      description = String(body.description || "").trim();
      icon = String(body.icon || "fas fa-map-marker-alt");
      color = String(body.color || "#00A3DA");
      category = String(body.category || "homes");
      isPublic = (body.isPublic as boolean) !== false;
      const charId = body.characterId;
      characterId = charId && String(charId).trim() ? String(charId).trim() : null;
      const imgUrl = body.imageUrl;
      imageUrl = imgUrl != null && String(imgUrl).trim() ? String(imgUrl).trim() : null;
      const srcKey = body.sourceDiscoveryKey;
      sourceDiscoveryKey = srcKey != null && String(srcKey).trim() ? String(srcKey).trim() : null;
      const pId = body.partyId;
      partyId = pId != null && String(pId).trim() ? String(pId).trim() : null;
    }

    if (!name) {
      return NextResponse.json({ error: "Pin name is required" }, { status: 400 });
    }
    if (coordinates.lat < 0 || coordinates.lat > 20000 || coordinates.lng < 0 || coordinates.lng > 24000) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const validCategories = ["homes", "farms", "shops", "points-of-interest"];
    if (!validCategories.includes(category)) {
      category = "homes";
    }

    let characterObjId: import("mongoose").Types.ObjectId | null = null;
    if (characterId) {
      const Character = (await import("@/models/CharacterModel.js")).default;
      const character = await Character.findOne({
        _id: characterId,
        userId: auth.discordId,
      });
      if (character) {
        characterObjId = character._id;
      }
    }

    const colIndex = Math.min(9, Math.max(0, Math.floor(coordinates.lng / 2400)));
    const rowIndex = Math.min(11, Math.max(0, Math.floor(coordinates.lat / 1666)));
    const gridLocation = String.fromCharCode(65 + colIndex) + (rowIndex + 1);

    const pinData: Record<string, unknown> = {
      name,
      description: description.slice(0, 500),
      coordinates: { lat: coordinates.lat, lng: coordinates.lng },
      gridLocation,
      icon: icon.slice(0, 50),
      color: /^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#00A3DA",
      category,
      isPublic,
      createdBy: userDoc._id,
      discordId: auth.discordId,
    };
    if (characterObjId) {
      pinData.character = characterObjId;
    }
    if (imageUrl) {
      pinData.imageUrl = imageUrl;
    }
    if (sourceDiscoveryKey) {
      pinData.sourceDiscoveryKey = sourceDiscoveryKey.slice(0, 200);
    }
    const pin = new Pin(pinData);

    await pin.save();
    await pin.populate("character", "name");
    const pinObj = pin.toObject();

    // If this pin was placed from an expedition discovery: update party (reportedDiscoveryKeys) and exploringMap (Square quadrant discoveries)
    if (sourceDiscoveryKey) {
      const key = sourceDiscoveryKey.slice(0, 200);

      if (partyId) {
        try {
          const Party =
            mongoose.models.Party ??
            ((await import("@/models/PartyModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
          const updateResult = await Party.updateOne(
            { partyId: String(partyId).trim() },
            { $addToSet: { reportedDiscoveryKeys: key } }
          );
          if (updateResult.matchedCount === 0) {
            console.warn("[api/pins] Party not found for reportedDiscoveryKeys update; partyId:", partyId);
          }
        } catch (partyErr) {
          console.error("[api/pins] Failed to update party reportedDiscoveryKeys:", partyErr);
        }
      }

      // Mark discovery as pinned on the map (or push if bot hadn't logged it yet)
      try {
        const parts = String(sourceDiscoveryKey).split("|");
        const outcome = (parts[0] ?? "").trim();
        const squareIdRaw = (parts[1] ?? "").trim();
        const quadrantId = (parts[2] ?? "").trim().toUpperCase();
        const atStr = (parts[3] ?? "").trim();
        if (outcome && squareIdRaw && (quadrantId === "Q1" || quadrantId === "Q2" || quadrantId === "Q3" || quadrantId === "Q4")) {
          const Square =
            mongoose.models.Square ??
            ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
          const squareIdRegex = new RegExp(
            `^${squareIdRaw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
            "i"
          );
          const now = new Date();
          const pinIdStr = (pin as { _id?: unknown })._id != null ? String((pin as { _id: { toString: () => string } })._id.toString()) : "";

          // Prefer: mark existing discovery (with matching discoveryKey) as pinned
          const markPinnedResult = await Square.updateOne(
            {
              squareId: squareIdRegex,
              "quadrants.quadrantId": quadrantId,
              "quadrants.discoveries.discoveryKey": key,
            },
            {
              $set: {
                "quadrants.$[q].discoveries.$[d].pinned": true,
                "quadrants.$[q].discoveries.$[d].pinnedAt": now,
                "quadrants.$[q].discoveries.$[d].pinId": pinIdStr,
              },
            },
            { arrayFilters: [{ "q.quadrantId": quadrantId }, { "d.discoveryKey": key }] }
          );

          if (markPinnedResult.modifiedCount === 0) {
            // Fallback: push a new discovery (e.g. old data without discoveryKey, or bot hadn't written yet)
            const discoveredAt = atStr ? new Date(atStr) : now;
            await Square.updateOne(
              { squareId: squareIdRegex, "quadrants.quadrantId": quadrantId },
              {
                $push: {
                  "quadrants.$[q].discoveries": {
                    type: outcome.slice(0, 50),
                    discoveredBy: auth.discordId,
                    discoveredAt,
                    discoveryKey: key,
                    pinned: true,
                    pinnedAt: now,
                    pinId: pinIdStr,
                  },
                },
              },
              { arrayFilters: [{ "q.quadrantId": quadrantId }] }
            );
          }
        }
      } catch (mapErr) {
        console.error("[api/pins] Failed to mark discovery pinned / add to exploringMap:", mapErr);
      }
    }

    return NextResponse.json({ success: true, pin: pinObj });
  } catch (error) {
    console.error("[api/pins] POST error:", error);
    return NextResponse.json({ error: "Failed to create pin" }, { status: 500 });
  }
}
