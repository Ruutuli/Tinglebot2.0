import mongoose from "mongoose";
import { leanOne } from "@/lib/mongoose-lean";

export type ItemCraftFields = {
  craftingJobs?: string[];
  staminaToCraft?: unknown;
};

export function parseStaminaToCraft(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, value);
  if (value && typeof value === "object" && "base" in value) {
    const n = Number((value as { base: unknown }).base);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function jobCanCraftItem(item: ItemCraftFields, job: string): boolean {
  const jobs = item.craftingJobs ?? [];
  if (!jobs.length) return false;
  const j = job.trim().toLowerCase();
  return jobs.some((g) => String(g).trim().toLowerCase() === j);
}

/** @param staminaPool Current stamina when claiming; max stamina when validating a named crafter on post. */
export function hasStaminaForCraft(
  staminaCost: number,
  staminaPool: number,
  isModCharacter: boolean
): boolean {
  if (isModCharacter) return true;
  return staminaPool >= staminaCost;
}

/**
 * Open-call summary for the board, e.g. "Any Cook with 3 stamina".
 */
export function formatOpenCommissionSeekingLine(jobs: string[], stamina: number): string {
  const st = Math.max(0, Math.floor(Number(stamina)) || 0);
  const list = jobs.map((j) => String(j).trim()).filter(Boolean);
  if (list.length === 0) {
    return st > 0 ? `Any crafter with ${st} stamina` : "Any qualified crafter";
  }
  const jobPhrase =
    list.length === 1
      ? list[0]
      : list.length === 2
        ? `${list[0]} or ${list[1]}`
        : `${list.slice(0, -1).join(", ")}, or ${list[list.length - 1]}`;
  return `Any ${jobPhrase} with ${st} stamina`;
}

export type CharacterUnion = {
  _id: mongoose.Types.ObjectId;
  userId: string;
  name: string;
  job: string;
  homeVillage: string;
  currentStamina: number;
  maxStamina: number;
  isModCharacter: boolean;
  /** Raw `icon` field from the character document */
  icon?: string;
};

type LeanCharacterRow = {
  _id: unknown;
  userId?: string;
  name?: unknown;
  job?: unknown;
  homeVillage?: string;
  currentStamina?: unknown;
  maxStamina?: number;
  icon?: string;
} | null;

function mapLeanRowToCharacterUnion(row: LeanCharacterRow, isModCharacter: boolean): CharacterUnion | null {
  if (!row || typeof row.userId !== "string") return null;
  const iconRaw = (row as { icon?: string }).icon;
  if (isModCharacter) {
    const maxS = Math.max(0, Number((row as { maxStamina?: number }).maxStamina) || 999);
    return {
      _id: row._id as mongoose.Types.ObjectId,
      userId: row.userId,
      name: String(row.name ?? ""),
      job: String(row.job ?? ""),
      homeVillage: String((row as { homeVillage?: string }).homeVillage ?? ""),
      currentStamina: Math.max(0, Number(row.currentStamina) || 999),
      maxStamina: maxS,
      isModCharacter: true,
      icon: typeof iconRaw === "string" && iconRaw.trim() ? iconRaw.trim() : undefined,
    };
  }
  const maxS = Math.max(0, Number((row as { maxStamina?: number }).maxStamina) || 0);
  return {
    _id: row._id as mongoose.Types.ObjectId,
    userId: row.userId,
    name: String(row.name ?? ""),
    job: String(row.job ?? ""),
    homeVillage: String((row as { homeVillage?: string }).homeVillage ?? ""),
    currentStamina: Math.max(0, Number(row.currentStamina) || 0),
    maxStamina: maxS,
    isModCharacter: false,
    icon: typeof iconRaw === "string" && iconRaw.trim() ? iconRaw.trim() : undefined,
  };
}

export async function loadCharacterUnionById(id: string): Promise<CharacterUnion | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const c = (await Character.findById(id)
    .select("userId name job homeVillage currentStamina maxStamina icon")
    .lean()
    .exec()) as unknown as LeanCharacterRow;
  const regular = mapLeanRowToCharacterUnion(c, false);
  if (regular) return regular;

  const m = (await ModCharacter.findById(id)
    .select("userId name job homeVillage currentStamina maxStamina icon")
    .lean()
    .exec()) as unknown as LeanCharacterRow;
  return mapLeanRowToCharacterUnion(m, true);
}

/**
 * Load a character only if it belongs to the given Discord user (for claim / sensitive actions).
 */
export async function loadCharacterUnionByIdForOwner(
  id: string,
  ownerDiscordId: string
): Promise<CharacterUnion | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const userId = String(ownerDiscordId ?? "").trim();
  if (!userId) return null;

  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const c = (await Character.findOne({ _id: id, userId })
    .select("userId name job homeVillage currentStamina maxStamina icon")
    .lean()
    .exec()) as unknown as LeanCharacterRow;
  const regular = mapLeanRowToCharacterUnion(c, false);
  if (regular) return regular;

  const m = (await ModCharacter.findOne({ _id: id, userId })
    .select("userId name job homeVillage currentStamina maxStamina icon")
    .lean()
    .exec()) as unknown as LeanCharacterRow;
  return mapLeanRowToCharacterUnion(m, true);
}

export async function userOwnsCharacterName(
  discordId: string,
  name: string
): Promise<boolean> {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");

  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const [a, b] = await Promise.all([
    Character.findOne({ userId: discordId, name: re }).select("_id").lean(),
    ModCharacter.findOne({ userId: discordId, name: re }).select("_id").lean(),
  ]);
  return Boolean(a || b);
}

/** Portrait used on Discord embeds; same resolution order as ownership check (regular OC, then mod). */
export async function loadCharacterIconForOwner(
  discordId: string,
  name: string
): Promise<string | undefined> {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const esc = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc}$`, "i");

  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const a = leanOne<{ icon?: string }>(
    await Character.findOne({ userId: discordId, name: re }).select("icon").lean()
  );
  const iconA = a?.icon;
  if (typeof iconA === "string" && iconA.trim()) return iconA.trim();

  const b = leanOne<{ icon?: string }>(
    await ModCharacter.findOne({ userId: discordId, name: re }).select("icon").lean()
  );
  const iconB = b?.icon;
  if (typeof iconB === "string" && iconB.trim()) return iconB.trim();

  return undefined;
}
