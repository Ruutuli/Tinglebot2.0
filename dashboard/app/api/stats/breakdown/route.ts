import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const value = searchParams.get("value");

    if (!type || !value) {
      return NextResponse.json(
        { error: "Missing type or value parameter" },
        { status: 400 }
      );
    }

    const allowedTypes = ["race", "job", "gender", "homeVillage", "petSpecies", "petType", "inventoryCharacter", "inventoryItem"];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: `Type must be one of: ${allowedTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // Helper function to create slug from name
    const createSlug = (name: string): string => {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    };

    // Helper function to normalize village names (same logic as stats page)
    const normalizeVillageName = (village: string): string => {
      if (!village) return "Unknown";
      const normalized = village.toLowerCase().trim();
      if (normalized === "rudania" || normalized.startsWith("rudania")) return "Rudania";
      if (normalized === "inariko" || normalized.startsWith("inariko")) return "Inariko";
      if (normalized === "vhintl" || normalized.startsWith("vhintl")) return "Vhintl";
      if (normalized.includes("rudania")) return "Rudania";
      if (normalized.includes("inariko")) return "Inariko";
      if (normalized.includes("vhintl")) return "Vhintl";
      return village
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
    };

    // Helper function to normalize job/race names
    const normalizeName = (name: string): string => {
      if (!name) return "Unknown";
      return name
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ")
        .trim();
    };

    // Normalize gender into broader categories (same as stats route)
    const normalizeGender = (g: string): string => {
      if (!g) return "Unknown";
      const gender = String(g).toLowerCase().trim();
      
      // Split by common separators (|, ||, /, etc.) and get the first meaningful word
      const firstPart = gender.split(/[\s|/]+/)[0].trim();
      const fullText = gender.replace(/[|/]/g, " ").replace(/\s+/g, " ").trim();
      
      // Check for word boundaries - look for "male" as a whole word or at start
      const hasMale = /\bmale\b/.test(fullText) || firstPart === "male" || fullText.startsWith("male");
      const hasFemale = /\bfemale\b/.test(fullText) || firstPart === "female" || fullText.startsWith("female");
      const hasDemi = /\bdemi\b/.test(fullText) || /\bdemi-/.test(fullText) || firstPart.startsWith("demi");
      const hasTrans = /\btrans\b/.test(fullText) || /\btransman\b/.test(fullText) || /\btrans man\b/.test(fullText) || /\btransgender\b/.test(fullText);
      const hasNonbinary = /\bnonbinary\b/.test(fullText) || /\bnon-binary\b/.test(fullText) || /\bnon binary\b/.test(fullText) || /\benby\b/.test(fullText) || /\benby\b/.test(fullText);
      const hasGenderfluid = /\bgenderfluid\b/.test(fullText) || /\bgender-fluid\b/.test(fullText) || /\bgender fluid\b/.test(fullText);
      const hasAgender = /\bagender\b/.test(fullText) || /\ba-gender\b/.test(fullText) || /\ba gender\b/.test(fullText);
      const hasBigender = /\bbigender\b/.test(fullText) || /\bbi-gender\b/.test(fullText) || /\bbi gender\b/.test(fullText);
      const hasPangender = /\bpangender\b/.test(fullText) || /\bpan-gender\b/.test(fullText) || /\bpan gender\b/.test(fullText);
      const hasNeutrois = /\bneutrois\b/.test(fullText);
      const hasTwoSpirit = /\btwo.spirit\b/.test(fullText) || /\b2spirit\b/.test(fullText) || /\b2-spirit\b/.test(fullText);
      
      // Male variations (check first to avoid conflicts)
      if (hasMale && !hasFemale && !hasDemi) {
        // Trans men are still Male category
        if (hasTrans && (hasMale || fullText.includes("man"))) {
          return "Male";
        }
        return "Male";
      }
      
      // Female variations
      if (hasFemale && !hasDemi) {
        return "Female";
      }
      
      // Nonbinary variations (check these before default)
      // Anything with "demi" is under the nonbinary umbrella
      if (hasNonbinary || hasGenderfluid || hasAgender || hasDemi || hasBigender || hasPangender || hasNeutrois || hasTwoSpirit) {
        return "Nonbinary";
      }
      
      // Check for trans without clear male/female indicator
      if (hasTrans) {
        // If it says "trans man" or similar, it's Male
        if (fullText.includes("man") || fullText.includes("male")) {
          return "Male";
        }
        // If it says "trans woman" or similar, it's Female
        if (fullText.includes("woman") || fullText.includes("female")) {
          return "Female";
        }
        // Otherwise, could be nonbinary
        return "Nonbinary";
      }
      
      // Default: return capitalized first word
      const firstWord = firstPart || String(g).split(/[\s|/]/)[0].trim();
      if (firstWord) {
        return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
      }
      
      return "Unknown";
    };

    await connect();

    // --- Pet breakdown (petSpecies / petType) ---
    if (type === "petSpecies" || type === "petType") {
      const PetModule = await import("@/models/PetModel.js");
      const Pet = PetModule.default || PetModule;
      const field = type === "petSpecies" ? "species" : "petType";
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pets = await Pet.find({ [field]: { $regex: new RegExp(`^${escaped}$`, "i") } })
        .select("name species petType level ownerName owner")
        .lean();

      const petsWithSlug = pets.map((p: unknown) => {
        const pet = p as Record<string, unknown>;
        const ownerName = (pet.ownerName as string) || "Unknown";
        return {
          name: (pet.name as string) ?? "Unknown",
          species: (pet.species as string) ?? "Unknown",
          petType: (pet.petType as string) ?? "Unknown",
          level: Number(pet.level) ?? 0,
          ownerName,
          ownerSlug: createSlug(ownerName),
        };
      });

      return NextResponse.json({
        kind: "pets",
        type,
        value,
        total: petsWithSlug.length,
        pets: petsWithSlug,
      });
    }

    // --- Inventory breakdown (inventoryCharacter / inventoryItem) ---
    if (type === "inventoryCharacter" || type === "inventoryItem") {
      await connect();
      const CharacterModule = await import("@/models/CharacterModel.js");
      const Character = CharacterModule.default || CharacterModule;
      const db = await getInventoriesDb();

      if (type === "inventoryCharacter") {
        const slug = value.trim();
        const charDoc = await Character.findOne({ status: "accepted" })
          .or([{ publicSlug: new RegExp(`^${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }, { name: slug }])
          .select("_id name publicSlug")
          .lean();
        const char = charDoc as { _id?: unknown; name?: string; publicSlug?: string } | null;
        if (!char) {
          return NextResponse.json({ kind: "inventoryCharacter", type, value, characterName: null, slug: null, totalItems: 0, uniqueItems: 0 });
        }
        const name = char.name || "";
        const publicSlug = char.publicSlug || name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
        const charId = typeof char._id === "string" ? new mongoose.Types.ObjectId(char._id) : char._id;
        let totalItems = 0;
        let uniqueItems = 0;
        try {
          const collection = db.collection(name.toLowerCase());
          const items = (await collection.find({ characterId: charId, quantity: { $gt: 0 } }).toArray()) as Array<{ quantity?: number; itemName?: string }>;
          totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          uniqueItems = new Set(items.map((item) => item.itemName).filter(Boolean)).size;
        } catch {
          // collection may not exist
        }
        return NextResponse.json({
          kind: "inventoryCharacter",
          type,
          value,
          characterName: name,
          slug: publicSlug,
          totalItems,
          uniqueItems,
        });
      }

      // inventoryItem: find characters who have this item
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const itemRegex = new RegExp(`^${escaped}$`, "i");
      const acceptedCharacters = await Character.find({ status: "accepted" }).select("_id name publicSlug").lean();
      const charactersWithItem: Array<{ characterName: string; slug: string }> = [];
      for (const char of acceptedCharacters) {
        const name = (char.name as string) || "";
        const slug = (char.publicSlug as string) || name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]/g, "");
        const charId = typeof char._id === "string" ? new mongoose.Types.ObjectId(char._id) : char._id;
        try {
          const collection = db.collection(name.toLowerCase());
          const hasItem = await collection.findOne({ characterId: charId, itemName: { $regex: itemRegex }, quantity: { $gt: 0 } });
          if (hasItem) charactersWithItem.push({ characterName: name, slug });
        } catch {
          // skip
        }
      }
      return NextResponse.json({
        kind: "inventoryItem",
        type,
        value,
        itemName: value,
        total: charactersWithItem.length,
        characters: charactersWithItem.sort((a, b) => a.characterName.localeCompare(b.characterName)),
      });
    }

    // --- Character breakdown (job / race / homeVillage) ---
    const CharacterModule = await import("@/models/CharacterModel.js");
    const Character = CharacterModule.default || CharacterModule;

    const characterFilter: Record<string, unknown> = {
      status: "accepted",
    };
    if (type === "homeVillage") {
      const valueLower = value.trim().toLowerCase();
      const allVillages = await Character.distinct("homeVillage", { status: "accepted" });
      const matchingVillages = allVillages.filter(
        (v) => v && normalizeVillageName(String(v)).toLowerCase() === valueLower
      );
      characterFilter.homeVillage =
        matchingVillages.length > 0
          ? { $in: matchingVillages }
          : { $regex: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    } else if (type === "gender") {
      // For gender, we need to match all genders that normalize to the clicked category
      const allGenders = await Character.distinct("gender", { status: "accepted" });
      const matchingGenders = allGenders.filter(
        (g) => g && normalizeGender(String(g)).toLowerCase() === value.trim().toLowerCase()
      );
      characterFilter.gender =
        matchingGenders.length > 0
          ? { $in: matchingGenders }
          : { $regex: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    } else {
      characterFilter[type] = { $regex: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") };
    }

    const characters = await Character.find(characterFilter)
      .select("_id name homeVillage currentVillage job race gender")
      .lean();

    logger.info("api/stats/breakdown", `${type}="${value}" → ${characters.length} characters`);

    const byHomeVillage = characters.reduce((acc, char) => {
      const village = normalizeVillageName(char.homeVillage || "Unknown");
      acc[village] = (acc[village] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byJob = type === "race" || type === "gender"
      ? characters.reduce((acc, char) => {
          const job = normalizeName(char.job || "Unknown");
          acc[job] = (acc[job] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};

    const byRace = type === "job" || type === "gender"
      ? characters.reduce((acc, char) => {
          const race = normalizeName(char.race || "Unknown");
          acc[race] = (acc[race] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};

    const byGender = type === "job" || type === "race"
      ? characters.reduce((acc, char) => {
          const gender = normalizeName(char.gender || "Unknown");
          acc[gender] = (acc[gender] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};

    // Detailed gender breakdown (shows original gender values, not normalized)
    const byGenderDetailed = type === "gender"
      ? characters.reduce((acc, char) => {
          const gender = char.gender || "Unknown";
          acc[gender] = (acc[gender] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};

    const characterNames = characters
      .map((char) => ({
        name: char.name || "Unknown",
        id: String(char._id),
        slug: createSlug(char.name || "Unknown"),
        homeVillage: normalizeVillageName(char.homeVillage || "Unknown"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const response = {
      kind: "characters",
      type,
      value,
      total: characters.length,
      characterNames,
      breakdown: {
        byHomeVillage: Object.entries(byHomeVillage)
          .map(([village, count]) => ({ village, count }))
          .sort((a, b) => b.count - a.count),
        ...(type === "race" && {
          byJob: Object.entries(byJob)
            .map(([job, count]) => ({ job, count }))
            .sort((a, b) => b.count - a.count),
        }),
        ...(type === "job" && {
          byRace: Object.entries(byRace)
            .map(([race, count]) => ({ race, count }))
            .sort((a, b) => b.count - a.count),
          byGender: Object.entries(byGender)
            .map(([gender, count]) => ({ gender, count }))
            .sort((a, b) => b.count - a.count),
        }),
        ...(type === "race" && {
          byGender: Object.entries(byGender)
            .map(([gender, count]) => ({ gender, count }))
            .sort((a, b) => b.count - a.count),
        }),
        ...(type === "gender" && {
          byGenderDetailed: Object.entries(byGenderDetailed)
            .map(([gender, count]) => ({ gender, count }))
            .sort((a, b) => b.count - a.count),
          byJob: Object.entries(byJob)
            .map(([job, count]) => ({ job, count }))
            .sort((a, b) => b.count - a.count),
        }),
      },
    };

    return NextResponse.json(response);
  } catch (e) {
    logger.error("api/stats/breakdown", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch breakdown" },
      { status: 500 }
    );
  }
}
