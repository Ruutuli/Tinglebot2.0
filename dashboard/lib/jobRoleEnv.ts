/**
 * Resolve Discord `JOB_*` role snowflakes for workshop pings.
 * Must use **static** `process.env.JOB_*` reads so Next.js inlines them at build time
 * (dynamic `process.env[key]` is often `undefined` in the bundled server).
 * Aligned with `bot/utils/memberJobRolesSync.js` → `getJobRoleIdMap`.
 */

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

function normalizeRoleId(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const id = raw.trim();
  if (!DISCORD_SNOWFLAKE.test(id)) return null;
  return id;
}

function getJobRoleIdMap(): Record<string, string | undefined> {
  return {
    Adventurer: process.env.JOB_ADVENTURER,
    Artist: process.env.JOB_ARTIST,
    Bandit: process.env.JOB_BANDIT,
    Beekeeper: process.env.JOB_BEEKEEPER,
    Blacksmith: process.env.JOB_BLACKSMITH,
    Cook: process.env.JOB_COOK,
    Courier: process.env.JOB_COURIER,
    Craftsman: process.env.JOB_CRAFTSMAN,
    Farmer: process.env.JOB_FARMER,
    Fisherman: process.env.JOB_FISHERMAN,
    Forager: process.env.JOB_FORAGER,
    "Fortune Teller": process.env.JOB_FORTUNE_TELLER,
    Graveskeeper: process.env.JOB_GRAVESKEEPER,
    Guard: process.env.JOB_GUARD,
    Healer: process.env.JOB_HEALER,
    Herbalist: process.env.JOB_HERBALIST,
    Hunter: process.env.JOB_HUNTER,
    "Mask Maker": process.env.JOB_MASK_MAKER,
    Merchant: process.env.JOB_MERCHANT,
    Mercenary: process.env.JOB_MERCENARY,
    Miner: process.env.JOB_MINER,
    Oracle: process.env.JOB_ORACLE,
    Priest: process.env.JOB_PRIEST,
    Rancher: process.env.JOB_RANCHER,
    Researcher: process.env.JOB_RESEARCHER,
    Sage: process.env.JOB_SAGE,
    Scout: process.env.JOB_SCOUT,
    Scholar: process.env.JOB_SCHOLAR,
    Shopkeeper: process.env.JOB_SHOPKEEPER,
    Stablehand: process.env.JOB_STABLEHAND,
    Teacher: process.env.JOB_TEACHER,
    Villager: process.env.JOB_VILLAGER,
    Weaver: process.env.JOB_WEAVER,
    Witch: process.env.JOB_WITCH,
    Dragon: process.env.JOB_DRAGON,
    Entertainer: process.env.JOB_ENTERTAINER,
  };
}

/** Discord role id for a catalog job name (`Cook`, `Fortune Teller`, …), or null. */
export function jobNameToRoleSnowflake(jobName: string | null | undefined): string | null {
  const map = getJobRoleIdMap();
  if (!jobName || typeof jobName !== "string") return null;
  const trimmed = jobName.trim();
  if (!trimmed) return null;

  const direct = normalizeRoleId(map[trimmed]);
  if (direct) return direct;

  const lower = trimmed.toLowerCase();
  const key = Object.keys(map).find((k) => k.toLowerCase() === lower);
  return key ? normalizeRoleId(map[key]) : null;
}
