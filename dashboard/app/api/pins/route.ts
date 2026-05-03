import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, isDatabaseUnavailableError, logDatabaseUnavailableOnce } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getAllOldMapsByCoordinates, getOldMapByCoordinates, getOldMapByNumber } from "@/lib/oldMapCatalog";

export const dynamic = "force-dynamic";

/** Aligns dashboard discovery pin `outcome` with Square quadrant `oldMapLeadsTo` (same rules as bot oldMapUtils.pinOutcomeMatchesOldMapLead). "shrine" is legacy wording for grotto—treat as identical. */
function pinOutcomeMatchesOldMapQuadrantLead(outcome: string, leadsToRaw: string | null | undefined): boolean {
  const o = String(outcome ?? "").trim().toLowerCase();
  const lt = String(leadsToRaw ?? "").trim().toLowerCase();
  const grottoOutcomes = new Set(["grotto", "grotto_found", "grotto_cleansed", "map_grotto", "shrine"]);
  const ruinsOutcomes = new Set(["ruin_rest", "map_ruins", "ruins"]);
  const campOutcomes = new Set(["monster_camp", "monster_camp_fight"]);
  if (grottoOutcomes.has(o) && (lt === "grotto" || lt === "shrine")) return true; // lt "shrine" === grotto
  if (ruinsOutcomes.has(o) && lt === "ruins") return true;
  if (campOutcomes.has(o) && lt === "monster_camp") return true;
  return false;
}

async function getAuthenticatedUser() {
  const session = await getSession();
  const user = session.user;
  if (!user?.id) {
    return null;
  }
  return { discordId: user.id, username: user.username };
}

export async function GET() {
  try {
    await connect();
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      logDatabaseUnavailableOnce("pins");
      return NextResponse.json(
        { success: true, pins: [] },
        { status: 200, headers: { "X-Degraded": "database" } }
      );
    }
    console.error("[api/pins] GET connect error:", err);
    return NextResponse.json({ error: "Failed to fetch pins" }, { status: 500 });
  }

  const auth = await getAuthenticatedUser();
  if (!auth) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
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
    if (isDatabaseUnavailableError(error)) {
      logDatabaseUnavailableOnce("pins");
      return NextResponse.json(
        { success: true, pins: [] },
        { status: 200, headers: { "X-Degraded": "database" } }
      );
    }
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
    if (partyId) {
      pinData.partyId = String(partyId).trim().slice(0, 32);
    }

    // Prevent duplicate discovery markers: only one pin per discovery per expedition (race-safe).
    if (sourceDiscoveryKey && partyId) {
      const existing = await Pin.findOne({
        sourceDiscoveryKey: sourceDiscoveryKey.slice(0, 200),
        partyId: String(partyId).trim().slice(0, 32),
      }).lean();
      if (existing) {
        return NextResponse.json(
          { error: "A marker for this discovery has already been placed." },
          { status: 409 }
        );
      }
    }

    const pin = new Pin(pinData);

    // 1. Save to pins collection (Pin model)
    await pin.save();
    await pin.populate("character", "name");
    const pinObj = pin.toObject();

    // If this pin was placed from "Report to town hall": also update Party and Map (Square) so all three stay in sync.
    if (sourceDiscoveryKey) {
      const key = sourceDiscoveryKey.slice(0, 200);

      // 2. Save to Party model (reportedDiscoveryKeys)
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

      // 3. Save to Map model (Square: mark discovery pinned in quadrants[].discoveries, or push if new)
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

          // Grotto lifecycle: "grotto", "grotto_found", "grotto_cleansed", "map_grotto", "shrine" (shrine = old word for grotto) are the same discovery (one per square+quadrant). Store as type "grotto" + grottoStatus.
          const isGrottoOutcome =
            outcome === "grotto" ||
            outcome === "grotto_found" ||
            outcome === "grotto_cleansed" ||
            outcome === "map_grotto" ||
            outcome === "shrine";
          const grottoStatus = outcome === "grotto_cleansed" ? "cleansed" : "found";

          // 1) Prefer: mark existing discovery (with matching discoveryKey) as pinned
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
                ...(isGrottoOutcome && {
                  "quadrants.$[q].discoveries.$[d].grottoStatus": grottoStatus,
                  ...(name && { "quadrants.$[q].discoveries.$[d].name": name }),
                }),
              },
            },
            { arrayFilters: [{ "q.quadrantId": quadrantId }, { "d.discoveryKey": key }] }
          );

          if (markPinnedResult.modifiedCount === 0 && isGrottoOutcome) {
            // 2) Grotto fallback: mark any existing grotto (or legacy "shrine" row) in this square+quadrant as pinned (same grotto, different key from progress log)
            const markExistingGrottoResult = await Square.updateOne(
              {
                squareId: squareIdRegex,
                "quadrants.quadrantId": quadrantId,
                "quadrants.discoveries.type": { $in: ["grotto", "shrine"] },
              },
              {
                $set: {
                  "quadrants.$[q].discoveries.$[d].type": "grotto",
                  "quadrants.$[q].discoveries.$[d].pinned": true,
                  "quadrants.$[q].discoveries.$[d].pinnedAt": now,
                  "quadrants.$[q].discoveries.$[d].pinId": pinIdStr,
                  "quadrants.$[q].discoveries.$[d].grottoStatus": grottoStatus,
                  "quadrants.$[q].discoveries.$[d].discoveryKey": key,
                  ...(name && { "quadrants.$[q].discoveries.$[d].name": name }),
                },
              },
              { arrayFilters: [{ "q.quadrantId": quadrantId }, { "d.type": { $in: ["grotto", "shrine"] } }] }
            );
            if (markExistingGrottoResult.modifiedCount > 0) {
              // Matched and updated the single grotto; do not push a duplicate
            } else {
              // No grotto in map yet: push a single discovery with type "grotto"
              const discoveredAt = atStr ? new Date(atStr) : now;
              await Square.updateOne(
                { squareId: squareIdRegex, "quadrants.quadrantId": quadrantId },
                {
                  $push: {
                    "quadrants.$[q].discoveries": {
                      type: "grotto",
                      grottoStatus,
                      ...(name && { name }),
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
          } else if (markPinnedResult.modifiedCount === 0) {
            // 3) Non-grotto fallback: push a new discovery (e.g. old data without discoveryKey, or bot hadn't written yet)
            console.warn("[api/pins] No existing discovery matched key; pushing new discovery for", squareIdRaw, quadrantId, "(key may differ in case or not yet written by bot)");
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

      // 4) oldMapsFound: stamp explore-map pin when this marker matches a redeemed Old Map # at this square+quadrant
      if (partyId) {
        try {
          const parts = String(key).split("|");
          const outcomePart = (parts[0] ?? "").trim();
          const squarePart = (parts[1] ?? "").trim();
          const quadrantPart = (parts[2] ?? "").trim().toUpperCase();
          if (
            outcomePart &&
            squarePart &&
            (quadrantPart === "Q1" || quadrantPart === "Q2" || quadrantPart === "Q3" || quadrantPart === "Q4")
          ) {
            const Square =
              mongoose.models.Square ??
              ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
            const squareIdRegex = new RegExp(`^${squarePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
            const squareLean = await Square.findOne({ squareId: squareIdRegex }).select("quadrants").lean();
            const quadDoc = (squareLean as { quadrants?: Array<{ quadrantId?: string; oldMapNumber?: number | null; oldMapLeadsTo?: string | null }> })?.quadrants?.find(
              (qq) => String(qq.quadrantId ?? "").toUpperCase() === quadrantPart
            );
            const catalogUnique = getOldMapByCoordinates(squarePart, quadrantPart);
            const catalogAtCellAll = getAllOldMapsByCoordinates(squarePart, quadrantPart);
            let oldMapNum = quadDoc?.oldMapNumber;
            let leadsToField = quadDoc?.oldMapLeadsTo;
            if (oldMapNum == null && catalogUnique) {
              oldMapNum = catalogUnique.number;
            }
            if (oldMapNum == null && catalogAtCellAll.length > 1) {
              const byOutcome = catalogAtCellAll.filter((m) =>
                pinOutcomeMatchesOldMapQuadrantLead(outcomePart, m.leadsTo)
              );
              if (byOutcome.length === 1) {
                oldMapNum = byOutcome[0].number;
                leadsToField = byOutcome[0].leadsTo;
              }
            }
            if (
              (leadsToField == null || String(leadsToField).trim() === "") &&
              typeof oldMapNum === "number" &&
              oldMapNum >= 1 &&
              oldMapNum <= 46
            ) {
              leadsToField =
                getOldMapByNumber(oldMapNum)?.leadsTo ?? catalogUnique?.leadsTo ?? catalogAtCellAll[0]?.leadsTo ?? null;
            }
            let outcomeMatches = pinOutcomeMatchesOldMapQuadrantLead(outcomePart, leadsToField);
            if (
              !outcomeMatches &&
              typeof oldMapNum === "number" &&
              oldMapNum >= 1 &&
              oldMapNum <= 46
            ) {
              const catRow = getOldMapByNumber(oldMapNum);
              if (catRow) outcomeMatches = pinOutcomeMatchesOldMapQuadrantLead(outcomePart, catRow.leadsTo);
            }
            if (
              !outcomeMatches &&
              catalogUnique &&
              typeof oldMapNum === "number" &&
              catalogUnique.number === oldMapNum
            ) {
              outcomeMatches = pinOutcomeMatchesOldMapQuadrantLead(outcomePart, catalogUnique.leadsTo);
            }
            if (
              typeof oldMapNum === "number" &&
              oldMapNum >= 1 &&
              oldMapNum <= 46 &&
              outcomeMatches
            ) {
              const OldMapFoundMod = await import("@/models/OldMapFoundModel.js");
              const OldMapFound = (OldMapFoundMod as { default?: mongoose.Model<unknown> }).default || OldMapFoundMod;
              const stamp = new Date();
              const pid = String(partyId).trim().slice(0, 32);
              const squareUpper = squarePart.trim().toUpperCase();
              // Only stamp the map copy redeemed on this expedition at this cell—avoids marking a later find of the same map #.
              const pinNotSet: Record<string, unknown> = {
                $or: [{ exploreMapPinnedAt: null }, { exploreMapPinnedAt: { $exists: false } }],
              };
              const destMatchesPin = {
                $or: [
                  {
                    $and: [
                      { redeemedDestinationSquare: squareUpper },
                      { redeemedDestinationQuadrant: quadrantPart },
                    ],
                  },
                  {
                    $and: [
                      {
                        $or: [
                          { redeemedDestinationSquare: null },
                          { redeemedDestinationSquare: "" },
                          { redeemedDestinationSquare: { $exists: false } },
                        ],
                      },
                      {
                        $or: [
                          { redeemedDestinationQuadrant: null },
                          { redeemedDestinationQuadrant: "" },
                          { redeemedDestinationQuadrant: { $exists: false } },
                        ],
                      },
                    ],
                  },
                ],
              };
              await OldMapFound.updateMany(
                {
                  $and: [
                    { mapNumber: oldMapNum },
                    { redeemedAt: { $ne: null } },
                    pinNotSet,
                    { redeemedForPartyId: pid },
                    destMatchesPin,
                  ],
                },
                { $set: { exploreMapPinnedAt: stamp, exploreMapPinnedPartyId: pid } }
              );
            }
          }
        } catch (oldMapErr) {
          console.error("[api/pins] OldMapFound explore pin stamp failed:", oldMapErr);
        }
      }
    }

    return NextResponse.json({ success: true, pin: pinObj });
  } catch (error) {
    console.error("[api/pins] POST error:", error);
    if (isDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: "Database unavailable", code: "database_unavailable" },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Failed to create pin" }, { status: 500 });
  }
}
