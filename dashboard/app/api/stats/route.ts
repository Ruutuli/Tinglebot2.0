import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { logger } from "@/utils/logger";
import { fetchDiscordUsernames } from "@/lib/discord";
import type { PipelineStage } from "mongoose";

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const revalidate = 300;

export async function GET() {
  try {
    await connect();
    const CharacterModule = await import("@/models/CharacterModel.js");
    const WeatherModule = await import("@/models/WeatherModel.js");
    const PetModule = await import("@/models/PetModel.js");
    const MountModule = await import("@/models/MountModel.js");
    const QuestModule = await import("@/models/QuestModel.js");
    const HelpWantedModule = await import("@/models/HelpWantedQuestModel.js");
    const RelicModule = await import("@/models/RelicModel.js");
    const RelationshipModule = await import("@/models/RelationshipModel.js");
    const RaidModule = await import("@/models/RaidModel.js");
    const StealStatsModule = await import("@/models/StealStatsModel.js");
    const MinigameModule = await import("@/models/MinigameModel.js");

    const Character = CharacterModule.default || CharacterModule;
    const Weather = WeatherModule.default || WeatherModule;
    const Pet = PetModule.default || PetModule;
    const Mount = MountModule.default || MountModule;
    const Quest = QuestModule.default || QuestModule;
    const HelpWantedQuest = HelpWantedModule.default || HelpWantedModule;
    const Relic = RelicModule.default || RelicModule;
    const Relationship = RelationshipModule.default || RelationshipModule;
    const Raid = RaidModule.default || RaidModule;
    const StealStats = StealStatsModule.default || StealStatsModule;
    const Minigame = MinigameModule.default || MinigameModule;

    const UserModule = await import("@/models/UserModel.js");
    const User = UserModule.default || UserModule;


    // ------------------- Character Statistics -------------------
    // Only count accepted characters
    const characterFilter = { status: "accepted" };

    // Compute attack/defense from equipped gear (same pattern as characters route)
    const addComputedStats: PipelineStage.AddFields = {
      $addFields: {
        attack: {
          $ifNull: [
            { $ifNull: ["$gearWeapon.stats.modifierHearts", "$gearWeapon.stats.attack"] },
            0,
          ],
        },
        defense: {
          $add: [
            { $ifNull: [{ $ifNull: ["$gearArmor.head.stats.modifierHearts", "$gearArmor.head.stats.defense"] }, 0] },
            { $ifNull: [{ $ifNull: ["$gearArmor.chest.stats.modifierHearts", "$gearArmor.chest.stats.defense"] }, 0] },
            { $ifNull: [{ $ifNull: ["$gearArmor.legs.stats.modifierHearts", "$gearArmor.legs.stats.defense"] }, 0] },
            { $ifNull: [{ $ifNull: ["$gearShield.stats.modifierHearts", "$gearShield.stats.defense"] }, 0] },
          ],
        },
      },
    };

    // Normalize village for consistent grouping (same logic as frontend)
    const normalizeVillage = (v: string) => {
      if (!v) return "Unknown";
      const n = String(v).toLowerCase().trim();
      if (n === "rudania" || n.startsWith("rudania")) return "Rudania";
      if (n === "inariko" || n.startsWith("inariko")) return "Inariko";
      if (n === "vhintl" || n.startsWith("vhintl")) return "Vhintl";
      if (n.includes("rudania")) return "Rudania";
      if (n.includes("inariko")) return "Inariko";
      if (n.includes("vhintl")) return "Vhintl";
      return String(v).charAt(0).toUpperCase() + String(v).slice(1).toLowerCase();
    };

    // Normalize gender into broader categories
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

    // Character aggregations
    const [
      characterTotal,
      characterByHomeVillage,
      characterByCurrentVillage,
      characterByJob,
      characterByRace,
      characterByGender,
      characterByRaceAndVillage,
      characterStatusCounts,
      characterAverages,
      characterBirthdays,
    ] = await Promise.all([
      Character.countDocuments(characterFilter),
      Character.aggregate([
        { $match: characterFilter },
        { $group: { _id: "$homeVillage", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        { $group: { _id: "$currentVillage", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        { $group: { _id: "$job", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        { $group: { _id: "$race", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        { $group: { _id: "$gender", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        { $group: { _id: { race: "$race", homeVillage: "$homeVillage" }, count: { $sum: 1 } } },
        { $sort: { "_id.race": 1, count: -1 } },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        {
          $group: {
            _id: null,
            blighted: { $sum: { $cond: ["$blighted", 1, 0] } },
            ko: { $sum: { $cond: ["$ko", 1, 0] } },
            inJail: { $sum: { $cond: ["$inJail", 1, 0] } },
          },
        },
      ]),
      Character.aggregate([
        { $match: characterFilter },
        addComputedStats,
        {
          $group: {
            _id: null,
            avgMaxHearts: { $avg: { $ifNull: ["$maxHearts", 0] } },
            avgCurrentHearts: { $avg: { $ifNull: ["$currentHearts", 0] } },
            avgMaxStamina: { $avg: { $ifNull: ["$maxStamina", 0] } },
            avgCurrentStamina: { $avg: { $ifNull: ["$currentStamina", 0] } },
            avgAttack: { $avg: { $ifNull: ["$attack", 0] } },
            avgDefense: { $avg: { $ifNull: ["$defense", 0] } },
          },
        },
      ]),
      Character.find(characterFilter)
        .select("birthday")
        .lean()
        .then((docs: unknown[]) => docs.map((d) => (d as { birthday?: string }).birthday)),
    ]);

    // ------------------- Weather Statistics -------------------
    const [
      weatherRecordsByVillage,
      weatherRecordsBySeason,
      weatherSpecialByVillage,
      weatherSpecialBySeason,
      weatherSpecialByVillageAndType,
      weatherPrecipitationByVillageAndType,
      weatherPrecipitationBySeason,
      weatherTemperatureByVillage,
      weatherWindByVillage,
    ] = await Promise.all([
      Weather.aggregate([
        { $group: { _id: "$village", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Weather.aggregate([
        { $group: { _id: "$season", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "special.label": { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$village", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "special.label": { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$season", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "special.label": { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: {
              village: "$village",
              type: "$special.label",
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            village: "$_id.village",
            type: "$_id.type",
            count: 1,
          },
        },
        { $sort: { village: 1, count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "precipitation.label": { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: {
              village: "$village",
              type: "$precipitation.label",
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            village: "$_id.village",
            type: "$_id.type",
            count: 1,
          },
        },
        { $sort: { village: 1, count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "precipitation.label": { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: {
              season: "$season",
              type: "$precipitation.label",
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            season: "$_id.season",
            type: "$_id.type",
            count: 1,
          },
        },
        { $sort: { season: 1, count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "temperature.label": { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: {
              village: "$village",
              type: "$temperature.label",
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            village: "$_id.village",
            type: "$_id.type",
            count: 1,
          },
        },
        { $sort: { village: 1, count: -1 } },
      ]),
      Weather.aggregate([
        {
          $match: {
            "wind.label": { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: {
              village: "$village",
              type: "$wind.label",
            },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            village: "$_id.village",
            type: "$_id.type",
            count: 1,
          },
        },
        { $sort: { village: 1, count: -1 } },
      ]),
    ]);

    // ------------------- Pet Statistics -------------------
    const [
      petTotal,
      petByStatus,
      petBySpecies,
      petByType,
      petAverageLevel,
      petOwnerCount,
    ] = await Promise.all([
      Pet.countDocuments({}),
      Pet.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Pet.aggregate([
        { $group: { _id: "$species", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Pet.aggregate([
        { $group: { _id: "$petType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Pet.aggregate([
        {
          $group: {
            _id: null,
            avgLevel: { $avg: { $ifNull: ["$level", 0] } },
          },
        },
      ]),
      Pet.distinct("owner"),
    ]);

    // ------------------- Mount Statistics -------------------
    const [
      mountTotal,
      mountBySpecies,
      mountByLevel,
      mountByRegion,
    ] = await Promise.all([
      Mount.countDocuments({}),
      Mount.aggregate([{ $group: { _id: "$species", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Mount.aggregate([{ $group: { _id: "$level", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Mount.aggregate([{ $group: { _id: "$region", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    // ------------------- Quest Statistics -------------------
    const [
      questTotal,
      questByType,
      questByStatus,
    ] = await Promise.all([
      Quest.countDocuments({}),
      Quest.aggregate([{ $group: { _id: "$questType", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Quest.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    ]);

    // ------------------- Help Wanted Statistics -------------------
    const [
      helpWantedTotal,
      helpWantedByType,
      helpWantedByNpc,
      helpWantedCompleted,
    ] = await Promise.all([
      HelpWantedQuest.countDocuments({}),
      HelpWantedQuest.aggregate([{ $group: { _id: "$type", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      HelpWantedQuest.aggregate([{ $group: { _id: "$npcName", count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      HelpWantedQuest.countDocuments({ completed: true }),
    ]);

    // ------------------- Relic Statistics -------------------
    const [
      relicTotal,
      relicAppraised,
      relicUnique,
    ] = await Promise.all([
      Relic.countDocuments({}),
      Relic.countDocuments({ appraised: true }),
      Relic.countDocuments({ unique: true }),
    ]);

    // ------------------- Relationship Statistics -------------------
    const [relationshipTotal, relationshipByType] = await Promise.all([
      Relationship.countDocuments({}),
      Relationship.aggregate([
        { $unwind: "$relationshipTypes" },
        { $group: { _id: "$relationshipTypes", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // ------------------- Raid Statistics -------------------
    const [
      raidTotal,
      raidByVillage,
      raidByResult,
      raidByTier,
    ] = await Promise.all([
      Raid.countDocuments({}),
      Raid.aggregate([
        { $group: { _id: "$village", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Raid.aggregate([
        { $match: { result: { $in: ["defeated", "timeout"] } } },
        { $group: { _id: "$result", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Raid.aggregate([
        { $group: { _id: "$monster.tier", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    // ------------------- Steal Statistics -------------------
    const [
      stealStatsDocs,
      stealVictimsAgg,
    ] = await Promise.all([
      StealStats.find({}).lean(),
      StealStats.aggregate([
        { $unwind: "$victims" },
        {
          $group: {
            _id: "$victims.characterName",
            count: { $sum: { $ifNull: ["$victims.count", 1] } },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
    ]);
    const stealTotalAttempts = stealStatsDocs.reduce((s, d) => s + (d.totalAttempts || 0), 0);
    const stealTotalSuccess = stealStatsDocs.reduce((s, d) => s + (d.successfulSteals || 0), 0);
    const stealByRarity = {
      common: stealStatsDocs.reduce((s, d) => s + (d.itemsByRarity?.common ?? 0), 0),
      uncommon: stealStatsDocs.reduce((s, d) => s + (d.itemsByRarity?.uncommon ?? 0), 0),
      rare: stealStatsDocs.reduce((s, d) => s + (d.itemsByRarity?.rare ?? 0), 0),
    };

    // ------------------- Minigame Statistics -------------------
    const [
      minigameTotal,
      minigameByType,
      minigameByStatus,
      minigameByVillage,
    ] = await Promise.all([
      Minigame.countDocuments({}),
      Minigame.aggregate([
        { $group: { _id: "$gameType", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Minigame.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Minigame.aggregate([
        { $group: { _id: "$village", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    // ------------------- Token Statistics -------------------
    const [
      tokenStats,
      topTokenHolders,
    ] = await Promise.all([
      User.aggregate([
        { $match: { tokens: { $exists: true, $gt: 0 } } },
        {
          $group: {
            _id: null,
            totalTokens: { $sum: "$tokens" },
            avgTokens: { $avg: "$tokens" },
            maxTokens: { $max: "$tokens" },
            minTokens: { $min: "$tokens" },
            userCount: { $sum: 1 },
          },
        },
      ]),
      User.aggregate([
        { $match: { tokens: { $exists: true, $gt: 0 } } },
        { $sort: { tokens: -1 } },
        { $limit: 15 },
        { $project: { discordId: 1, tokens: 1, username: 1 } },
      ]),
    ]);

    // ------------------- Inventory Statistics -------------------
    let topCharactersByItems: Array<{ characterName: string; slug: string; totalItems: number; uniqueItems: number }> = [];
    let topItemsByTotalQuantity: Array<{ itemName: string; totalQuantity: number }> = [];
    try {
      const acceptedCharacters = await Character.find(characterFilter).select("_id name publicSlug").lean();
      const db = await getInventoriesDb();
      const itemToTotalQuantity = new Map<string, number>();
      const characterStats: Array<{ characterName: string; slug: string; totalItems: number; uniqueItems: number }> = [];
      for (const char of acceptedCharacters) {
        const name = char.name as string;
        const slug = (char.publicSlug as string) || name.toLowerCase().replace(/\s+/g, "-");
        const charId = typeof char._id === "string" ? new mongoose.Types.ObjectId(char._id) : char._id;
        try {
          const collection = db.collection(name.toLowerCase());
          const items = await collection.find({ characterId: charId, quantity: { $gt: 0 } }).toArray() as Array<{ quantity?: number; itemName?: string }>;
          const totalItems = items.reduce((sum, item) => sum + (item.quantity || 0), 0);
          characterStats.push({ characterName: name, slug, totalItems, uniqueItems: new Set(items.map((item) => item.itemName).filter(Boolean)).size });
          for (const item of items) {
            const itemName = item.itemName;
            const qty = item.quantity || 0;
            if (itemName) itemToTotalQuantity.set(itemName, (itemToTotalQuantity.get(itemName) || 0) + qty);
          }
        } catch {
          characterStats.push({ characterName: name, slug, totalItems: 0, uniqueItems: 0 });
        }
      }
      topCharactersByItems = characterStats
        .filter((c) => c.totalItems > 0)
        .sort((a, b) => b.totalItems - a.totalItems)
        .slice(0, 15);
      topItemsByTotalQuantity = Array.from(itemToTotalQuantity.entries())
        .map(([itemName, totalQuantity]) => ({ itemName, totalQuantity }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 20);
    } catch (invErr) {
      logger.error("api/stats", invErr instanceof Error ? invErr.message : String(invErr));
    }

    // Format response data
    const response = {
      characters: {
        total: characterTotal,
        byHomeVillage: characterByHomeVillage.map((item) => ({
          village: item._id || "Unknown",
          count: item.count,
        })),
        byCurrentVillage: characterByCurrentVillage.map((item) => ({
          village: item._id || "Unknown",
          count: item.count,
        })),
        byJob: characterByJob.map((item) => ({
          job: item._id || "Unknown",
          count: item.count,
        })),
        byRace: characterByRace.map((item) => ({
          race: item._id || "Unknown",
          count: item.count,
        })),
        byGender: (() => {
          const genderMap = new Map<string, number>();
          characterByGender.forEach((item) => {
            const normalizedGender = normalizeGender(item._id || "Unknown");
            genderMap.set(normalizedGender, (genderMap.get(normalizedGender) || 0) + item.count);
          });
          return Array.from(genderMap.entries())
            .map(([gender, count]) => ({ gender, count }))
            .sort((a, b) => b.count - a.count);
        })(),
        byRaceByVillage: characterByRaceAndVillage.map((item) => ({
          race: item._id?.race || "Unknown",
          village: normalizeVillage(String(item._id?.homeVillage ?? "Unknown")),
          count: item.count,
        })),
        birthdayByMonth: (() => {
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const parseMonth = (s: string | undefined): number | null => {
            if (!s || typeof s !== "string") return null;
            const t = s.trim();
            if (!t) return null;
            for (let i = 0; i < monthNames.length; i++) if (t.toLowerCase().startsWith(monthNames[i].toLowerCase().slice(0, 3))) return i + 1;
            const slash = t.split("/");
            if (slash.length >= 2) { const m = parseInt(slash[0], 10); if (m >= 1 && m <= 12) return m; const m2 = parseInt(slash[1], 10); if (m2 >= 1 && m2 <= 12) return m2; }
            const dash = t.split("-");
            if (dash.length >= 2) { const m = parseInt(dash[1], 10); if (m >= 1 && m <= 12) return m; const m0 = parseInt(dash[0], 10); if (m0 >= 1 && m0 <= 12) return m0; }
            return null;
          };
          const byMonth: Record<number, number> = {};
          for (let i = 1; i <= 12; i++) byMonth[i] = 0;
          characterBirthdays.forEach((b) => {
            const m = parseMonth(b);
            if (m != null) byMonth[m]++;
          });
          return Object.entries(byMonth).map(([month, count]) => ({ month: parseInt(month, 10), monthName: monthNames[parseInt(month, 10) - 1], count }));
        })(),
        birthdayBySeason: (() => {
          const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const parseMonth = (s: string | undefined): number | null => {
            if (!s || typeof s !== "string") return null;
            const t = s.trim();
            if (!t) return null;
            for (let i = 0; i < monthNames.length; i++) if (t.toLowerCase().startsWith(monthNames[i].toLowerCase().slice(0, 3))) return i + 1;
            const slash = t.split("/");
            if (slash.length >= 2) { const m = parseInt(slash[0], 10); if (m >= 1 && m <= 12) return m; const m2 = parseInt(slash[1], 10); if (m2 >= 1 && m2 <= 12) return m2; }
            const dash = t.split("-");
            if (dash.length >= 2) { const m = parseInt(dash[1], 10); if (m >= 1 && m <= 12) return m; const m0 = parseInt(dash[0], 10); if (m0 >= 1 && m0 <= 12) return m0; }
            return null;
          };
          const seasonByMonth: Record<number, string> = { 1: "Winter", 2: "Winter", 3: "Spring", 4: "Spring", 5: "Spring", 6: "Summer", 7: "Summer", 8: "Summer", 9: "Fall", 10: "Fall", 11: "Fall", 12: "Winter" };
          const bySeason: Record<string, number> = { Winter: 0, Spring: 0, Summer: 0, Fall: 0 };
          characterBirthdays.forEach((b) => {
            const m = parseMonth(b);
            if (m != null && seasonByMonth[m]) bySeason[seasonByMonth[m]]++;
          });
          return ["Winter", "Spring", "Summer", "Fall"].map((season) => ({ season, count: bySeason[season] ?? 0 }));
        })(),
        statusCounts: {
          blighted: characterStatusCounts[0]?.blighted || 0,
          ko: characterStatusCounts[0]?.ko || 0,
          inJail: characterStatusCounts[0]?.inJail || 0,
        },
        averages: {
          maxHearts: Math.round((characterAverages[0]?.avgMaxHearts || 0) * 100) / 100,
          currentHearts: Math.round((characterAverages[0]?.avgCurrentHearts || 0) * 100) / 100,
          maxStamina: Math.round((characterAverages[0]?.avgMaxStamina || 0) * 100) / 100,
          currentStamina: Math.round((characterAverages[0]?.avgCurrentStamina || 0) * 100) / 100,
          attack: Math.round((characterAverages[0]?.avgAttack || 0) * 100) / 100,
          defense: Math.round((characterAverages[0]?.avgDefense || 0) * 100) / 100,
        },
      },
      weather: {
        total: weatherRecordsByVillage.reduce((sum, i) => sum + i.count, 0),
        recordsByVillage: weatherRecordsByVillage.map((item) => ({
          village: item._id || "Unknown",
          count: item.count,
        })),
        recordsBySeason: weatherRecordsBySeason.map((item) => ({
          season: item._id || "Unknown",
          count: item.count,
        })),
        specialByVillage: weatherSpecialByVillage.map((item) => ({
          village: item._id || "Unknown",
          count: item.count,
        })),
        specialBySeason: weatherSpecialBySeason.map((item) => ({
          season: item._id || "Unknown",
          count: item.count,
        })),
        specialByVillageAndType: weatherSpecialByVillageAndType.map((item) => ({
          village: item.village || "Unknown",
          type: item.type || "Unknown",
          count: item.count,
        })),
        precipitationByVillageAndType: weatherPrecipitationByVillageAndType.map((item) => ({
          village: item.village || "Unknown",
          type: item.type || "Unknown",
          count: item.count,
        })),
        precipitationBySeason: weatherPrecipitationBySeason.map((item) => ({
          season: item.season || "Unknown",
          type: item.type || "Unknown",
          count: item.count,
        })),
        temperatureByVillage: weatherTemperatureByVillage.map((item) => ({
          village: item.village || "Unknown",
          type: item.type || "Unknown",
          count: item.count,
        })),
        windByVillage: weatherWindByVillage.map((item) => ({
          village: item.village || "Unknown",
          type: item.type || "Unknown",
          count: item.count,
        })),
      },
      pets: {
        total: petTotal,
        byStatus: petByStatus.map((item) => ({
          status: item._id || "Unknown",
          count: item.count,
        })),
        bySpecies: petBySpecies.map((item) => ({
          species: item._id || "Unknown",
          count: item.count,
        })),
        byType: petByType.map((item) => ({
          type: item._id || "Unknown",
          count: item.count,
        })),
        averageLevel: Math.round((petAverageLevel[0]?.avgLevel || 0) * 100) / 100,
        ownerCount: petOwnerCount.length,
      },
      mounts: {
        total: mountTotal,
        bySpecies: mountBySpecies.map((item) => ({ species: item._id || "Unknown", count: item.count })),
        byLevel: mountByLevel.map((item) => ({ level: item._id || "Unknown", count: item.count })),
        byRegion: mountByRegion.map((item) => ({ region: item._id || "Unknown", count: item.count })),
      },
      quests: {
        total: questTotal,
        byType: questByType.map((item) => ({ type: item._id || "Unknown", count: item.count })),
        byStatus: questByStatus.map((item) => ({ status: item._id || "Unknown", count: item.count })),
      },
      helpWanted: {
        total: helpWantedTotal,
        completed: helpWantedCompleted,
        byType: helpWantedByType.map((item) => ({ type: item._id || "Unknown", count: item.count })),
        byNpc: helpWantedByNpc.map((item) => ({ npc: item._id || "Unknown", count: item.count })),
      },
      relics: {
        total: relicTotal,
        appraised: relicAppraised,
        unique: relicUnique,
      },
      relationships: {
        total: relationshipTotal,
        byType: relationshipByType.map((item: { _id: string; count: number }) => ({ type: item._id || "Unknown", count: item.count })),
      },
      raids: {
        total: raidTotal,
        byVillage: raidByVillage.map((item) => ({ village: item._id || "Unknown", count: item.count })),
        byResult: raidByResult.map((item) => ({ result: item._id || "Unknown", count: item.count })),
        byTier: raidByTier.map((item) => ({ tier: item._id ?? 0, count: item.count })),
      },
      stealStats: {
        totalAttempts: stealTotalAttempts,
        successfulSteals: stealTotalSuccess,
        successRate: stealTotalAttempts > 0 ? Math.round((stealTotalSuccess / stealTotalAttempts) * 10000) / 100 : 0,
        byRarity: stealByRarity,
        topVictims: stealVictimsAgg.map((item) => ({ name: item._id || "Unknown", count: item.count })),
      },
      minigames: {
        total: minigameTotal,
        byGameType: minigameByType.map((item) => ({ gameType: item._id || "Unknown", count: item.count })),
        byStatus: minigameByStatus.map((item) => ({ status: item._id || "Unknown", count: item.count })),
        byVillage: minigameByVillage.map((item) => ({ village: item._id || "Unknown", count: item.count })),
      },
      inventory: {
        topCharactersByItems,
        topItemsByTotalQuantity,
      },
      tokens: await (async () => {
        const holdersWithoutUsername = topTokenHolders.filter((u) => !u.username);
        const discordIds = holdersWithoutUsername.map((u) => u.discordId as string).filter(Boolean);
        const usernameMap = discordIds.length > 0 ? await fetchDiscordUsernames(discordIds) : {};
        return {
          totalTokens: tokenStats[0]?.totalTokens ?? 0,
          averageTokens: Math.round((tokenStats[0]?.avgTokens ?? 0) * 100) / 100,
          maxTokens: tokenStats[0]?.maxTokens ?? 0,
          minTokens: tokenStats[0]?.minTokens ?? 0,
          userCount: tokenStats[0]?.userCount ?? 0,
          topHolders: topTokenHolders.map((u) => ({
            discordId: u.discordId as string,
            tokens: u.tokens as number,
            username: (u.username as string) || usernameMap[u.discordId as string] || null,
          })),
        };
      })(),
    };

    const nextResponse = NextResponse.json(response);

    // Add cache headers for browser/CDN caching
    nextResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return nextResponse;
  } catch (e) {
    logger.error("api/stats", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
