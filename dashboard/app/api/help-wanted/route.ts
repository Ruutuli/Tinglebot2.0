/**
 * GET /api/help-wanted — fetch all help wanted quests with completion data
 */

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { logger } from "@/utils/logger";

// Uses session cookies; must be dynamically rendered per-request.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const discordId = session.user?.id;

    if (!discordId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connect();

    // Check if model already exists to avoid recompilation error
    let HelpWantedQuest: unknown;
    if (mongoose.models.HelpWantedQuest) {
      HelpWantedQuest = mongoose.models.HelpWantedQuest;
    } else {
      const module = await import("@/models/HelpWantedQuestModel.js");
      HelpWantedQuest = module.default;
    }

    // Fetch Character model for lookups
    type CharacterSelectDoc = {
      _id: mongoose.Types.ObjectId;
      name?: string;
    };
    let Character: mongoose.Model<CharacterSelectDoc>;
    if (mongoose.models.Character) {
      Character = mongoose.models.Character as mongoose.Model<CharacterSelectDoc>;
    } else {
      const charModule = await import("@/models/CharacterModel.js");
      Character = charModule.default as mongoose.Model<CharacterSelectDoc>;
    }

    let completedQuestsRaw: Array<{
      _id: unknown;
      questId?: string;
      village?: string;
      date?: string;
      type?: string;
      npcName?: string;
      requirements?: unknown;
      completed?: boolean;
      completedBy?: {
        userId?: string;
        characterId?: unknown;
        timestamp?: string;
      };
    }> = [];

    // Fetch only quests completed by this user
    completedQuestsRaw = await (HelpWantedQuest as unknown as {
      find: (filter: Record<string, unknown>) => {
        sort: (sort: Record<string, number>) => {
          limit: (limit: number) => Promise<Array<{
            _id: unknown;
            questId?: string;
            village?: string;
            date?: string;
            type?: string;
            npcName?: string;
            requirements?: unknown;
            completed?: boolean;
            completedBy?: {
              userId?: string;
              characterId?: unknown;
              timestamp?: string;
            };
          }>>;
        };
      };
    }).find({
      completed: true,
      "completedBy.userId": discordId,
    })
      .sort({ date: -1 })
      .limit(500);

    // Extract unique character IDs and fetch character names
    const characterIds = new Set<string>();
    completedQuestsRaw.forEach((quest) => {
      if (quest.completedBy?.characterId) {
        const charId = typeof quest.completedBy.characterId === "object" && quest.completedBy.characterId && "_id" in quest.completedBy.characterId
          ? String((quest.completedBy.characterId as { _id: unknown })._id)
          : String(quest.completedBy.characterId);
        if (charId && charId !== "null" && charId !== "undefined") {
          characterIds.add(charId);
        }
      }
    });

    // Fetch character names
    const characterMap = new Map<string, string>();
    if (characterIds.size > 0) {
      const characters = await Character.find({ 
        _id: { $in: Array.from(characterIds).map(id => new mongoose.Types.ObjectId(id)) } 
      })
        .select("_id name")
        .lean<CharacterSelectDoc[]>();
      
      characters.forEach((char) => {
        const charId = typeof char._id === "object" && char._id && "_id" in char._id
          ? String((char._id as { _id: unknown })._id)
          : String(char._id);
        if (char.name) {
          characterMap.set(charId, char.name);
        }
      });
    }

    // Fetch all quests completed by this user (for listing)
    let allQuests: Array<{
      _id: unknown;
      questId?: string;
      village?: string;
      date?: string;
      type?: string;
      npcName?: string;
      requirements?: unknown;
      completed?: boolean;
      completedBy?: {
        userId?: string;
        characterId?: unknown;
        timestamp?: string;
      };
    }> = [];

    allQuests = await (HelpWantedQuest as unknown as {
      find: (filter: Record<string, unknown>) => {
        sort: (sort: Record<string, number>) => {
          limit: (limit: number) => Promise<Array<{
            _id: unknown;
            questId?: string;
            village?: string;
            date?: string;
            type?: string;
            npcName?: string;
            requirements?: unknown;
            completed?: boolean;
            completedBy?: {
              userId?: string;
              characterId?: unknown;
              timestamp?: string;
            };
          }>>;
        };
      };
    }).find({
      "completedBy.userId": discordId,
    })
      .sort({ date: -1 })
      .limit(500);

    // Transform completed quests to include character info
    const questsWithCompletions = completedQuestsRaw.map((quest) => {
      const charId = quest.completedBy?.characterId
        ? (typeof quest.completedBy.characterId === "object" && quest.completedBy.characterId && "_id" in quest.completedBy.characterId
            ? String((quest.completedBy.characterId as { _id: unknown })._id)
            : String(quest.completedBy.characterId || ""))
        : "";
      const characterName = charId ? (characterMap.get(charId) || "Unknown") : "Unknown";
      
      return {
        questId: quest.questId,
        village: quest.village,
        date: quest.date,
        type: quest.type,
        npcName: quest.npcName,
        requirements: quest.requirements,
        completed: quest.completed,
        completedBy: quest.completedBy ? {
          userId: quest.completedBy.userId,
          characterId: charId,
          characterName: characterName,
          timestamp: quest.completedBy.timestamp,
        } : null,
      };
    });

    // Transform all quests
    const allQuestsList = allQuests.map((quest) => ({
      questId: quest.questId,
      village: quest.village,
      date: quest.date,
      type: quest.type,
      npcName: quest.npcName,
      requirements: quest.requirements,
      completed: quest.completed,
      completedBy: quest.completedBy ? {
        userId: quest.completedBy.userId,
        characterId: typeof quest.completedBy.characterId === "object" && quest.completedBy.characterId && "_id" in quest.completedBy.characterId
          ? String((quest.completedBy.characterId as { _id: unknown })._id)
          : String(quest.completedBy.characterId || ""),
        timestamp: quest.completedBy.timestamp,
      } : null,
    }));

    const response = NextResponse.json({
      completedQuests: questsWithCompletions,
      allQuests: allQuestsList,
    });

    // Add cache headers - private cache since this is user-specific
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error("api/help-wanted GET", `Failed to fetch help wanted quests: ${errorMessage}${errorStack ? `\n${errorStack}` : ""}`);
    return NextResponse.json(
      { error: "Failed to fetch help wanted quests" },
      { status: 500 }
    );
  }
}
