/**
 * GET /api/help-wanted — fetch all help wanted quests with completion data
 */

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";
import { logger } from "@/utils/logger";

// Cache user-specific help wanted quests for 1 minute
export const revalidate = 60;

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

    // TEMPORARY: Add dummy data for user 211219306137124865 for preview
    const DUMMY_USER_ID = "211219306137124865";
    const isDummyUser = discordId === DUMMY_USER_ID;
    
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

    if (isDummyUser) {
      // Create dummy quest completions
      const dummyQuests = [
        { questId: "X123456", village: "Rudania", date: "2025-01-20", type: "item", npcName: "Hank", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/20/2025, 10:30:00 AM" } },
        { questId: "X234567", village: "Inariko", date: "2025-01-19", type: "monster", npcName: "Jasz", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/19/2025, 2:15:00 PM" } },
        { questId: "X345678", village: "Vhintl", date: "2025-01-18", type: "crafting", npcName: "Lil Tim", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/18/2025, 8:45:00 AM" } },
        { questId: "X456789", village: "Rudania", date: "2025-01-17", type: "escort", npcName: "Lecia", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/17/2025, 4:20:00 PM" } },
        { questId: "X567890", village: "Inariko", date: "2025-01-16", type: "art", npcName: "Peddler", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/16/2025, 11:00:00 AM" } },
        { questId: "X678901", village: "Vhintl", date: "2025-01-15", type: "writing", npcName: "Myti", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/15/2025, 3:30:00 PM" } },
        { questId: "X789012", village: "Rudania", date: "2025-01-14", type: "item", npcName: "Tye", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/14/2025, 9:15:00 AM" } },
        { questId: "X890123", village: "Inariko", date: "2025-01-13", type: "monster", npcName: "Cree", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/13/2025, 1:45:00 PM" } },
        { questId: "X901234", village: "Vhintl", date: "2025-01-12", type: "crafting", npcName: "Walton", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/12/2025, 6:00:00 PM" } },
        { questId: "X012345", village: "Rudania", date: "2025-01-11", type: "escort", npcName: "Cece", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/11/2025, 10:20:00 AM" } },
        { questId: "X112233", village: "Inariko", date: "2025-01-10", type: "item", npcName: "Lukan", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/10/2025, 2:50:00 PM" } },
        { questId: "X223344", village: "Vhintl", date: "2025-01-09", type: "monster", npcName: "Jengo", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/9/2025, 7:30:00 AM" } },
        { questId: "X334455", village: "Rudania", date: "2025-01-08", type: "crafting", npcName: "Sue", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/8/2025, 12:15:00 PM" } },
        { questId: "X445566", village: "Inariko", date: "2025-01-07", type: "art", npcName: "Hank", completedBy: { userId: DUMMY_USER_ID, characterId: "684184db7e58feb80a435bcb", timestamp: "1/7/2025, 5:45:00 PM" } },
        { questId: "X556677", village: "Vhintl", date: "2025-01-06", type: "writing", npcName: "Jasz", completedBy: { userId: DUMMY_USER_ID, characterId: "68436b06ce1cf9f45f17e99b", timestamp: "1/6/2025, 9:00:00 AM" } },
      ];
      
      completedQuestsRaw = dummyQuests.map((q, idx) => ({
        _id: `dummy-${idx}`,
        questId: q.questId,
        village: q.village,
        date: q.date,
        type: q.type,
        npcName: q.npcName,
        requirements: {},
        completed: true,
        completedBy: q.completedBy,
      }));
    } else {
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
        "completedBy.userId": discordId
      })
        .sort({ date: -1 })
        .limit(500);
    }

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
    if (isDummyUser) {
      // Dummy character names for preview
      characterMap.set("68436b06ce1cf9f45f17e99b", "Fiddle");
      characterMap.set("684184db7e58feb80a435bcb", "Test Character");
    } else if (characterIds.size > 0) {
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

    if (isDummyUser) {
      // Use the same dummy data for all quests
      allQuests = completedQuestsRaw;
    } else {
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
        "completedBy.userId": discordId
      })
        .sort({ date: -1 })
        .limit(500);
    }

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
