import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // "race" or "job"
    const value = searchParams.get("value"); // the race or job name

    if (!type || !value) {
      return NextResponse.json(
        { error: "Missing type or value parameter" },
        { status: 400 }
      );
    }

    if (type !== "race" && type !== "job") {
      return NextResponse.json(
        { error: "Type must be 'race' or 'job'" },
        { status: 400 }
      );
    }

    await connect();
    const CharacterModule = await import("@/models/CharacterModel.js");
    const Character = CharacterModule.default || CharacterModule;

    logger.info("api/stats/breakdown", `Request: type=${type}, value="${value}"`);

    // Use case-insensitive regex match to handle variations in capitalization
    const characterFilter: Record<string, unknown> = { 
      status: "accepted",
      [type]: { $regex: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }
    };

    logger.info("api/stats/breakdown", `Filter: ${JSON.stringify(characterFilter)}`);

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
      // Handle any case variation
      if (normalized === "rudania" || normalized.startsWith("rudania")) return "Rudania";
      if (normalized === "inariko" || normalized.startsWith("inariko")) return "Inariko";
      if (normalized === "vhintl" || normalized.startsWith("vhintl")) return "Vhintl";
      // Fallback: try to match partial strings
      if (normalized.includes("rudania")) return "Rudania";
      if (normalized.includes("inariko")) return "Inariko";
      if (normalized.includes("vhintl")) return "Vhintl";
      // Capitalize first letter of each word
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

    // Get all characters matching the filter
    const characters = await Character.find(characterFilter)
      .select("_id name homeVillage currentVillage job race")
      .lean();

    logger.info("api/stats/breakdown", `Found ${characters.length} characters matching filter`);

    // Log sample of actual values in database for debugging
    if (characters.length > 0) {
      const sampleValues = characters.slice(0, 5).map((char) => {
        const charObj = char as Record<string, unknown>;
        return {
          name: char.name,
          [type]: charObj[type],
        };
      });
      logger.info("api/stats/breakdown", `Sample characters: ${JSON.stringify(sampleValues)}`);
    }

    // Check all unique values for this type to see what's actually in the DB (for debugging)
    const allValues = await Character.distinct(type, { status: "accepted" });
    const matchingValues = allValues.filter((v) => 
      typeof v === "string" && v.toLowerCase() === value.toLowerCase()
    );
    logger.info("api/stats/breakdown", `All ${type} values matching "${value}" (case-insensitive): ${JSON.stringify(matchingValues)}`);
    logger.info("api/stats/breakdown", `Total unique ${type} values in DB: ${allValues.length}`);

    // Breakdown by home village (with normalization)
    const byHomeVillage = characters.reduce((acc, char) => {
      const village = normalizeVillageName(char.homeVillage || "Unknown");
      acc[village] = (acc[village] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Breakdown by job (if filtering by race) - with normalization
    const byJob = type === "race" 
      ? characters.reduce((acc, char) => {
          const job = normalizeName(char.job || "Unknown");
          acc[job] = (acc[job] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};

    // Breakdown by race (if filtering by job) - with normalization
    const byRace = type === "job"
      ? characters.reduce((acc, char) => {
          const race = normalizeName(char.race || "Unknown");
          acc[race] = (acc[race] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      : {};

    // Character names with IDs, slugs, and home village
    const characterNames = characters
      .map((char) => ({
        name: char.name || "Unknown",
        id: String(char._id),
        slug: createSlug(char.name || "Unknown"),
        homeVillage: normalizeVillageName(char.homeVillage || "Unknown"),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const response = {
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
