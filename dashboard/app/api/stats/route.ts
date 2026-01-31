import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";
import type { PipelineStage } from "mongoose";

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connect();
    const CharacterModule = await import("@/models/CharacterModel.js");
    const WeatherModule = await import("@/models/WeatherModel.js");
    const PetModule = await import("@/models/PetModel.js");
    
    // Handle both ESM default export and CommonJS module.exports
    const Character = CharacterModule.default || CharacterModule;
    const Weather = WeatherModule.default || WeatherModule;
    const Pet = PetModule.default || PetModule;

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

    // Character aggregations
    const [
      characterTotal,
      characterByHomeVillage,
      characterByCurrentVillage,
      characterByJob,
      characterByRace,
      characterStatusCounts,
      characterAverages,
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
    ]);

    // ------------------- Weather Statistics -------------------
    const [
      weatherTotal,
      weatherSpecialCount,
      weatherPrecipitationByVillage,
    ] = await Promise.all([
      Weather.countDocuments({}),
      Weather.countDocuments({
        "special.label": { $exists: true, $ne: null, $ne: "" },
      }),
      Weather.aggregate([
        {
          $match: {
            "precipitation.label": { $exists: true, $ne: null, $ne: "" },
          },
        },
        {
          $group: {
            _id: {
              village: "$village",
              precipitation: "$precipitation.label",
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: "$_id.village",
            precipitations: {
              $push: {
                type: "$_id.precipitation",
                count: "$count",
              },
            },
          },
        },
        {
          $project: {
            village: "$_id",
            mostCommon: {
              $arrayElemAt: [
                {
                  $slice: [
                    {
                      $sortArray: {
                        input: "$precipitations",
                        sortBy: { count: -1 },
                      },
                    },
                    1,
                  ],
                },
                0,
              ],
            },
            allPrecipitations: {
              $sortArray: {
                input: "$precipitations",
                sortBy: { count: -1 },
              },
            },
          },
        },
        { $sort: { village: 1 } },
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
        total: weatherTotal,
        specialCount: weatherSpecialCount,
        precipitationByVillage: weatherPrecipitationByVillage.map((item) => ({
          village: item.village || "Unknown",
          mostCommon: item.mostCommon
            ? {
                type: item.mostCommon.type,
                count: item.mostCommon.count,
              }
            : null,
          allPrecipitations: item.allPrecipitations || [],
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
