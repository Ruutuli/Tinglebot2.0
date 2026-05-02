import mongoose from "mongoose";

type ItemCraftFields = {
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
};

export async function loadCharacterUnionById(id: string): Promise<CharacterUnion | null> {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const c = await Character.findById(id)
    .select("userId name job homeVillage currentStamina maxStamina")
    .lean()
    .exec();
  if (c && typeof c.userId === "string") {
    const maxS = Math.max(0, Number((c as { maxStamina?: number }).maxStamina) || 0);
    return {
      _id: c._id as mongoose.Types.ObjectId,
      userId: c.userId,
      name: String(c.name ?? ""),
      job: String(c.job ?? ""),
      homeVillage: String((c as { homeVillage?: string }).homeVillage ?? ""),
      currentStamina: Math.max(0, Number(c.currentStamina) || 0),
      maxStamina: maxS,
      isModCharacter: false,
    };
  }

  const m = await ModCharacter.findById(id)
    .select("userId name job homeVillage currentStamina maxStamina")
    .lean()
    .exec();
  if (m && typeof m.userId === "string") {
    const maxS = Math.max(0, Number((m as { maxStamina?: number }).maxStamina) || 999);
    return {
      _id: m._id as mongoose.Types.ObjectId,
      userId: m.userId,
      name: String(m.name ?? ""),
      job: String(m.job ?? ""),
      homeVillage: String((m as { homeVillage?: string }).homeVillage ?? ""),
      currentStamina: Math.max(0, Number(m.currentStamina) || 999),
      maxStamina: maxS,
      isModCharacter: true,
    };
  }

  return null;
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
