/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Item = require("./models/ItemModel.js");
const { jobPerks } = require("./data/jobData.js");

// ============================================================================
// ------------------- Logging & Process Safety -------------------
// ============================================================================

const FILE_TAG = "[audit-item-rarity.js]";

function logInfo(msg) {
  console.log(`${FILE_TAG}ℹ️ ${msg}`);
}

function logWarn(msg) {
  console.warn(`${FILE_TAG}⚠️ ${msg}`);
}

function logError(msg, err) {
  console.error(`${FILE_TAG}❌ ${msg}`, err || "");
}

let isShuttingDown = false;

async function safeDisconnect(reason) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    if (mongoose.connection?.readyState === 1 || mongoose.connection?.readyState === 2) {
      await mongoose.disconnect();
    }
  } catch (err) {
    logError(`Failed to disconnect MongoDB (${reason}).`, err);
  }
}

function registerShutdownHandlers() {
  const handle = async (signal) => {
    logWarn(`Shutdown signal received: ${signal}`);
    await safeDisconnect(signal);
    process.exit(0);
  };

  process.once("SIGINT", () => handle("SIGINT"));
  process.once("SIGTERM", () => handle("SIGTERM"));
  process.once("uncaughtException", async (err) => {
    logError("Uncaught exception.", err);
    await safeDisconnect("uncaughtException");
    process.exit(1);
  });
  process.once("unhandledRejection", async (reason) => {
    logError("Unhandled rejection.", reason);
    await safeDisconnect("unhandledRejection");
    process.exit(1);
  });
}

registerShutdownHandlers();

// ============================================================================
// ------------------- World Constants -------------------
// ============================================================================

// Full canonical location list (provided by you)
const ALL_LOCATIONS = [
  "Central Hyrule",
  "Eldin",
  "Faron",
  "Gerudo",
  "Hebra",
  "Lanayru",
  "Path of Scarlet Leaves",
  "Leaf Dew Way",
];

// Location commonness weights (higher = more common / easier to access)
const LOCATION_WEIGHT = {
  Eldin: 1.0,
  Faron: 1.0,
  Lanayru: 1.0,
  "Leaf Dew Way": 0.6,
  "Path of Scarlet Leaves": 0.6,
  "Central Hyrule": 0.2,
  Hebra: 0.2,
  Gerudo: 0.2,
};

// Method base weights
const METHOD_BASE_WEIGHT = {
  Gathering: 1.35,
  Looting: 1.2,
  Traveling: 0.65,
  Exploring: 0.55,
  Vending: 0.9,
  Crafting: 0.8,
};

// ============================================================================
// ------------------- Helpers: Normalization & Arrays -------------------
// ============================================================================

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function uniq(arr) {
  return Array.from(new Set((arr || []).filter(Boolean)));
}

function asStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  return [String(v)];
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// ============================================================================
// ------------------- Minimal .env Loader -------------------
// ============================================================================

function stripQuotes(v) {
  const s = String(v);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function loadEnvFile(envPath) {
  try {
    if (!fs.existsSync(envPath)) return false;
    const raw = fs.readFileSync(envPath, "utf8");
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;

      const key = m[1];
      let value = m[2] ?? "";

      // Remove inline comments for unquoted values: KEY=value # comment
      if (!value.trim().startsWith('"') && !value.trim().startsWith("'")) {
        value = value.split(" #")[0].split("\t#")[0];
      }

      value = stripQuotes(value.trim());

      // Don't override already-set env vars (shell should win)
      if (process.env[key] == null) process.env[key] = value;
    }

    return true;
  } catch (err) {
    logError("Failed to load .env file.", err);
    return false;
  }
}

function loadDotEnv() {
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(__dirname, ".env"),
    path.resolve(__dirname, "..", ".env"),
    path.resolve(process.cwd(), "..", ".env"),
  ];

  for (const p of candidates) {
    if (loadEnvFile(p)) return p;
  }
  return null;
}

// ============================================================================
// ------------------- CLI Parsing -------------------
// ============================================================================

function getArgValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  if (!v || v.startsWith("--")) return fallback;
  return v;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

// Your system: 1 = super common, 10 = super rare
const MAX_RARITY = Math.max(2, toNumber(getArgValue("--max-rarity", "10"), 10));
const TOP_N = Math.max(1, toNumber(getArgValue("--top", "50"), 50));
const MIN_DELTA = Math.max(0, toNumber(getArgValue("--min-delta", "1"), 1));
const SHOW_ALL = hasFlag("--all");
const NAME_FILTER = String(getArgValue("--name", "") || "").trim().toLowerCase();
const AS_JSON = hasFlag("--json");
const BANDING = String(getArgValue("--banding", "calibrated") || "calibrated").toLowerCase();

const ONLY_GEAR = hasFlag("--only-gear");
const EXCLUDE_GEAR = hasFlag("--exclude-gear");

const CRAFTABLE_FILTER = String(getArgValue("--craftable", "any") || "any").toLowerCase();
const OUT_PATH = String(getArgValue("--out", "") || "").trim();

// Iterations for propagating ingredient rarity into crafted items
const CRAFT_PROP_ITERATIONS = Math.max(1, toNumber(getArgValue("--craft-iters", "6"), 6));


// ============================================================================
// ------------------- Locations -------------------
// ============================================================================

function getLocationWeight(locationName) {
  const raw = String(locationName || "");
  if (LOCATION_WEIGHT[raw] != null) return LOCATION_WEIGHT[raw];

  // Fuzzy match for any non-canonical strings
  const k = normKey(raw);
  if (!k) return 0.7;
  if (k.includes("eldin")) return 1.0;
  if (k.includes("faron")) return 1.0;
  if (k.includes("lanayru")) return 1.0;
  if (k.includes("leafdewway") || (k.includes("leaf") && k.includes("dew"))) return 0.6;
  if (k.includes("pathofscarletleaves") || k.includes("scarlet")) return 0.6;
  if (k.includes("centralhyrule") || k.includes("central")) return 0.2;
  if (k.includes("hebra")) return 0.2;
  if (k.includes("gerudo")) return 0.2;
  return 0.7;
}

const TOTAL_LOCATION_AVAILABILITY = ALL_LOCATIONS.reduce((sum, loc) => sum + getLocationWeight(loc), 0);

// ============================================================================
// ------------------- Categories & Crafting -------------------
// ============================================================================

function isCraftable(item) {
  return Array.isArray(item?.craftingMaterial) && item.craftingMaterial.length > 0;
}

function hasCategory(item, categoryName) {
  const target = String(categoryName || "").toLowerCase();
  if (!target) return false;

  const cats = asStringArray(item?.category).map((c) => c.toLowerCase());
  const gear = String(item?.categoryGear || "").toLowerCase();
  return cats.includes(target) || gear === target;
}

function isGear(item) {
  return hasCategory(item, "Armor") || hasCategory(item, "Weapon");
}

function isRecipe(item) {
  return hasCategory(item, "Recipe");
}

function isGearOrRecipe(item) {
  return isGear(item) || isRecipe(item);
}

// ============================================================================
// ------------------- Monsters (Looting Availability) -------------------
// ============================================================================

const MONSTER_KEY_REGEX =
  /bokoblin|chuchu|hinox|keese|lizalfos|lynel|moblin|molduga|octorok|pebblit|talus|wizzrobe|likelike|evermean|gibdo|horriblin|gloomhands|bossbokoblin|frox|yiga/i;

function prettyFromKey(key) {
  const s = String(key || "");
  if (!s) return s;

  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/\s+/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractLootMonsters(item) {
  const out = [];

  if (Array.isArray(item?.monsterList) && item.monsterList.length) {
    for (const m of item.monsterList) {
      const name = String(m || "").trim();
      if (name) out.push(name);
    }
  }

  if (item && typeof item === "object") {
    for (const k of Object.keys(item)) {
      if (k === "monsterList") continue;
      if (k.startsWith("normal")) continue;
      if (!MONSTER_KEY_REGEX.test(k)) continue;
      if (item[k] === true) out.push(prettyFromKey(k));
    }
  }

  return uniq(out);
}

// ============================================================================
// ------------------- Jobs: Village Locks & Perks -------------------
// ============================================================================

const jobVillageByKey = new Map((jobPerks || []).map((j) => [normKey(j.job), j.village || null]));
const jobPerkByKey = new Map((jobPerks || []).map((j) => [normKey(j.job), String(j.perk || "")]));

function canonicalJobName(jobName) {
  const raw = String(jobName || "").trim();
  const cleaned = raw.replace(/\s*\(.+\)\s*/g, "").trim();
  if (cleaned.toLowerCase() === "gravekeeper") return "Graveskeeper";
  return cleaned;
}

function getJobVillage(jobName) {
  const canon = canonicalJobName(jobName);
  const key = normKey(canon);
  if (jobVillageByKey.has(key)) return jobVillageByKey.get(key);

  const withS = key.endsWith("s") ? key : `${key}s`;
  if (jobVillageByKey.has(withS)) return jobVillageByKey.get(withS);

  return null;
}

function isVillageLockedJob(jobName) {
  return Boolean(getJobVillage(jobName));
}

function getJobPerk(jobName) {
  const canon = canonicalJobName(jobName);
  const key = normKey(canon);
  if (jobPerkByKey.has(key)) return jobPerkByKey.get(key);

  const withS = key.endsWith("s") ? key : `${key}s`;
  if (jobPerkByKey.has(withS)) return jobPerkByKey.get(withS);

  return "";
}

function jobMatchesPerk(jobName, perkToken) {
  const perk = getJobPerk(jobName).toUpperCase();
  const token = String(perkToken || "").toUpperCase();
  if (!token) return false;
  return perk.includes(token);
}

// ============================================================================
// ------------------- Extractors -------------------
// ============================================================================

const JOB_FIELDS = [
  ["farmer", "Farmer"],
  ["forager", "Forager"],
  ["rancher", "Rancher"],
  ["herbalist", "Herbalist"],
  ["adventurer", "Adventurer"],
  ["artist", "Artist"],
  ["beekeeper", "Beekeeper"],
  ["blacksmith", "Blacksmith"],
  ["cook", "Cook"],
  ["craftsman", "Craftsman"],
  ["fisherman", "Fisherman"],
  ["gravekeeper", "Gravekeeper"],
  ["guard", "Guard"],
  ["maskMaker", "Mask Maker"],
  ["hunter", "Hunter"],
  ["hunterLooting", "Hunter (Looting)"],
  ["mercenary", "Mercenary"],
  ["miner", "Miner"],
  ["researcher", "Researcher"],
  ["scout", "Scout"],
  ["weaver", "Weaver"],
  ["witch", "Witch"],
];

function extractJobs(item) {
  if (Array.isArray(item?.allJobsTags) && item.allJobsTags.length > 0 && !item.allJobsTags.includes("None")) {
    return uniq(item.allJobsTags);
  }

  if (Array.isArray(item?.allJobs) && item.allJobs.length > 0 && !item.allJobs.includes("None")) {
    return uniq(item.allJobs);
  }

  const jobs = [];
  for (const [field, label] of JOB_FIELDS) {
    if (item?.[field]) jobs.push(label);
  }

  if (Array.isArray(item?.gatheringJobs) && item.gatheringJobs.length) jobs.push(...item.gatheringJobs);
  if (Array.isArray(item?.lootingJobs) && item.lootingJobs.length) jobs.push(...item.lootingJobs);
  if (Array.isArray(item?.craftingJobs) && item.craftingJobs.length) jobs.push(...item.craftingJobs);

  return uniq(jobs);
}

function extractLocations(item) {
  const filterNone = (x) => String(x).toLowerCase() !== "none";

  if (Array.isArray(item?.locationsTags) && item.locationsTags.length > 0) {
    const filtered = item.locationsTags.filter(Boolean).filter(filterNone);
    if (filtered.length) return uniq(filtered);
  }

  if (Array.isArray(item?.locations) && item.locations.length > 0) {
    const filtered = item.locations.filter(Boolean).filter(filterNone);
    if (filtered.length) return uniq(filtered);
  }

  const locations = [];
  if (item?.centralHyrule) locations.push("Central Hyrule");
  if (item?.eldin) locations.push("Eldin");
  if (item?.faron) locations.push("Faron");
  if (item?.gerudo) locations.push("Gerudo");
  if (item?.hebra) locations.push("Hebra");
  if (item?.lanayru) locations.push("Lanayru");
  if (item?.pathOfScarletLeaves) locations.push("Path of Scarlet Leaves");
  if (item?.leafDewWay) locations.push("Leaf Dew Way");
  return uniq(locations);
}

function extractSpecialWeather(item) {
  const sw = item?.specialWeather;
  if (!sw || typeof sw !== "object") return [];

  const out = [];
  if (sw.muggy) out.push("Muggy");
  if (sw.flowerbloom) out.push("Flowerbloom");
  if (sw.fairycircle) out.push("Fairy Circle");
  if (sw.jubilee) out.push("Jubilee");
  if (sw.meteorShower) out.push("Meteor Shower");
  if (sw.rockslide) out.push("Rockslide");
  if (sw.avalanche) out.push("Avalanche");
  return out;
}

function extractObtainMethods(item) {
  const methods = [];
  if (item?.gathering) methods.push("Gathering");
  if (item?.looting) methods.push("Looting");
  if (item?.traveling) methods.push("Traveling");
  if (item?.exploring) methods.push("Exploring");
  if (item?.vending) methods.push("Vending");
  if (isCraftable(item)) methods.push("Crafting");
  return methods;
}

function extractCraftingMaterials(item) {
  const mats = Array.isArray(item?.craftingMaterial) ? item.craftingMaterial : [];
  return mats
    .map((m) => ({
      itemName: String(m?.itemName || "").trim(),
      quantity: Number(m?.quantity ?? 0) || 0,
    }))
    .filter((m) => m.itemName && m.quantity > 0);
}

// ============================================================================
// ------------------- Scoring -------------------
// ============================================================================

// ------------------- computeScarcityBase ------------------
// Main rarity score builder - (PRICE DOES NOT AFFECT SCORE)
function computeScarcityBase(item) {
  const obtainMethods = extractObtainMethods(item);
  const jobs = extractJobs(item);
  const locations = extractLocations(item);
  const specialWeather = extractSpecialWeather(item);

  const buyPrice = Number(item?.buyPrice ?? 0) || 0;
  const sellPrice = Number(item?.sellPrice ?? 0) || 0;
  const modifierHearts = Number(item?.modifierHearts ?? 0) || 0;

  const craftMaterials = extractCraftingMaterials(item);

  const lootMonsters = extractLootMonsters(item);
  const lootMonsterCount = lootMonsters.length;
  const lootMonstersMissing = Boolean(item?.looting) && lootMonsterCount === 0;

  const { locationsMissing, locationAvailability, locationAvailabilityFraction, locationPenalty } =
    computeLocationPenalty(locations);

  const modifierPenalty = computeModifierPenalty(item, modifierHearts);

  const { effectiveWays, lockedJobs, hasLockedJob, hasUnlockedJob } = computeEffectiveWays({
    obtainMethods,
    jobs,
    specialWeather,
    lootMonsterCount,
  });

  const weatherPenalty = computeWeatherPenalty(specialWeather);

  let score = 0;
  score += Math.max(0, 6 - effectiveWays) * 10;
  score += locationPenalty;
  score += lockedJobs.length * 7;
  if (hasLockedJob && !hasUnlockedJob) score += 10;
  score += weatherPenalty;
  score += modifierPenalty;

  // Price no longer affects rarity scoring
  // score += priceScore * 4;

  score = Math.max(0, score);

  const reasons = [];
  reasons.push(
    `Obtain methods: ${obtainMethods.length ? obtainMethods.join(", ") : "None"} (effective ${effectiveWays.toFixed(2)})`
  );
  reasons.push(
    `Locations: ${locations.length ? locations.join(", ") : "None"} (${locations.length || 0})${
      locationsMissing ? " [MISSING]" : ""
    }; ` +
      `availability ${(locationAvailability || 0).toFixed(2)}/${TOTAL_LOCATION_AVAILABILITY.toFixed(2)} ` +
      `(${(locationAvailabilityFraction * 100).toFixed(1)}%); penalty ${locationPenalty.toFixed(2)}`
  );
  reasons.push(`Jobs: ${jobs.length ? jobs.join(", ") : "None"}`);

  if (Boolean(item?.looting)) {
    const preview = lootMonsters.slice(0, 5).join(", ");
    reasons.push(
      `Loot monsters: ${lootMonsterCount}${lootMonstersMissing ? " [MISSING]" : ""}` +
        (lootMonsterCount ? ` (${preview}${lootMonsterCount > 5 ? ", ..." : ""})` : "")
    );
  }

  if (lockedJobs.length) {
    reasons.push(`Village-locked jobs: ${lockedJobs.map((j) => `${j.job}@${j.village}`).join(", ")}`);
  }

  if (specialWeather.length) reasons.push(`Special weather: ${specialWeather.join(", ")}`);

  if (isGearOrRecipe(item) && modifierHearts !== 0) {
    reasons.push(`Modifier/hearts: ${modifierHearts} (penalty ${modifierPenalty.toFixed(2)})`);
  }

  if (craftMaterials.length) {
    reasons.push(`Crafting materials: ${craftMaterials.map((m) => `${m.quantity}x ${m.itemName}`).join(", ")}`);
  }

  // Keep price in output for debugging/auditing, but it does not affect score
  if (buyPrice || sellPrice) reasons.push(`Price: buy=${buyPrice || 0}, sell=${sellPrice || 0}`);

  return {
    score,
    effectiveWays,
    obtainMethods,
    locations,
    locationCountListed: locations.length,
    locationsMissing,
    locationAvailability,
    locationAvailabilityFraction,
    locationPenalty,
    modifierHearts,
    modifierPenalty,
    jobs,
    lockedJobs,
    specialWeather,
    buyPrice,
    sellPrice,
    craftMaterials,
    lootMonsters,
    lootMonsterCount,
    lootMonstersMissing,
    reasons,
  };
}

// ============================================================================
// ------------------- Scoring Helpers -------------------
// ============================================================================

// ------------------- computeLocationPenalty ------------------
// Location availability -> penalty -
function computeLocationPenalty(locations) {
  const locationsMissing = locations.length === 0;

  const locationAvailability = locationsMissing
    ? Math.min(...ALL_LOCATIONS.map(getLocationWeight))
    : locations.reduce((sum, loc) => sum + getLocationWeight(loc), 0);

  const locationAvailabilityFraction =
    TOTAL_LOCATION_AVAILABILITY > 0 ? locationAvailability / TOTAL_LOCATION_AVAILABILITY : 1;

  const locationPenalty = Math.min(
    45,
    18 * Math.log(TOTAL_LOCATION_AVAILABILITY / Math.max(0.05, locationAvailability))
  );

  return {
    locationsMissing,
    locationAvailability,
    locationAvailabilityFraction,
    locationPenalty,
  };
}

// ------------------- computeModifierPenalty ------------------
// Gear/recipe modifier -> penalty -
function computeModifierPenalty(item, modifierHearts) {
  if (!isGearOrRecipe(item) || modifierHearts === 0) return 0;

  const abs = Math.abs(modifierHearts);
  let penalty = 0;

  if (isGear(item)) {
    penalty = Math.min(55, abs * 7 + Math.max(0, abs - 5) * 3);
  } else if (isRecipe(item)) {
    penalty = Math.min(30, abs * 3.5 + Math.max(0, abs - 8) * 1.5);
  } else {
    penalty = Math.min(30, abs * 3);
  }

  if (modifierHearts < 0) penalty *= -0.6;
  return penalty;
}

// ------------------- computeWeatherPenalty ------------------
// Special weather (rare) -> additive penalty -
function computeWeatherPenalty(specialWeather) {
  if (!specialWeather.length) return 0;
  return 18 + Math.max(0, specialWeather.length - 1) * 8;
}

// ------------------- computeEffectiveWays ------------------
// Obtain methods -> effective ways to obtain (lower = rarer) -
function computeEffectiveWays({ obtainMethods, jobs, specialWeather, lootMonsterCount }) {
  const lockedJobs = jobs
    .map((j) => {
      const village = getJobVillage(j);
      return village ? { job: j, village } : null;
    })
    .filter(Boolean);

  const hasUnlockedJob = jobs.some((j) => !isVillageLockedJob(j));
  const hasLockedJob = lockedJobs.length > 0;

  let effectiveWays = 0;

  for (const m of obtainMethods) {
    let weight = METHOD_BASE_WEIGHT[m] ?? 1;

    if (m === "Gathering" || m === "Looting" || m === "Crafting") {
      const perkToken = m === "Crafting" ? "CRAFTING" : m.toUpperCase();

      const applicable = jobs.filter((j) => jobMatchesPerk(j, perkToken));
      const effectiveApplicable = applicable.length > 0 ? applicable : jobs.length > 0 ? jobs : [];

      const unlockedCount = effectiveApplicable.filter((j) => !isVillageLockedJob(j)).length;
      const lockedCount = effectiveApplicable.filter((j) => isVillageLockedJob(j)).length;

      const jobCount = unlockedCount + lockedCount;
      const jobAccessMultiplier = jobCount > 0 ? Math.min(1.65, 1 + 0.22 * Math.log1p(jobCount - 1)) : 1;

      if (jobCount > 0 && unlockedCount === 0 && lockedCount > 0) weight *= 0.35;
      else if (jobCount > 0 && unlockedCount > 0 && lockedCount > 0) weight *= 0.8;

      weight *= jobAccessMultiplier;
    }

    if (m === "Looting") {
      if (lootMonsterCount > 0) {
        const monsterMultiplier = Math.min(1.75, 1 + 0.28 * Math.log1p(lootMonsterCount - 1));
        weight *= monsterMultiplier;
      } else {
        // Looting item but no monsters mapped -> treat as rarer
        weight *= 0.6;
      }
    }

    // Special weather is rare: strong discount to obtainability
    if (specialWeather.length === 1) weight *= 0.45;
    if (specialWeather.length >= 2) weight *= 0.3;

    effectiveWays += weight;
  }

  return {
    effectiveWays,
    lockedJobs,
    hasLockedJob,
    hasUnlockedJob,
  };
}
// ============================================================================
// ------------------- Crafting Score Propagation -------------------
// ============================================================================

// ------------------- computeCraftPenalty ------------------
// Crafted items inherit some rarity from ingredient scores -
function computeCraftPenalty(craftMaterials, scoreByItemKey) {
  if (!craftMaterials || craftMaterials.length === 0) return 0;

  // Average ingredient scores weighted by log(quantity), lightly scaled.
  let sum = 0;
  for (const m of craftMaterials) {
    const ingScore = scoreByItemKey.get(normKey(m.itemName)) ?? 0;
    const qtyWeight = Math.log1p(Math.max(1, m.quantity)); // 0.69.. for 1, 1.1 for 2, ...
    sum += ingScore * qtyWeight;
  }

  const avg = sum / craftMaterials.length;
  const complexity = Math.min(10, craftMaterials.length) * 0.8;

  // Cap so crafted items don't explode in score
  return Math.min(35, avg * 0.22 + complexity);
}

// ============================================================================
// ------------------- Banding Helpers -------------------
// ============================================================================

// ------------------- quantile ------------------
// Utility - expects `sorted` ascending
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = Math.max(0, Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1))));
  return sorted[pos];
}

// ------------------- medianOf ------------------
// Utility -
function medianOf(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return quantile(sorted, 0.5);
}

// ------------------- rarityFromScore ------------------
// Score -> rarity via thresholds -
function rarityFromScore(score, thresholds) {
  let band = 1;
  for (const t of thresholds) {
    if (score >= t) band += 1;
  }
  return Math.min(MAX_RARITY, band);
}

// ------------------- enforceMonotoneIncreasingByRarity ------------------
// PAV isotonic regression, weighted -
function enforceMonotoneIncreasingByRarity(points) {
  // points: [{ r, v, w }]
  const blocks = [];
  for (const p of points) {
    blocks.push({ start: p.r, end: p.r, sum: p.v * p.w, weight: p.w });

    while (blocks.length >= 2) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      const avgA = a.sum / Math.max(1e-9, a.weight);
      const avgB = b.sum / Math.max(1e-9, b.weight);
      if (avgA <= avgB) break;

      blocks.splice(blocks.length - 2, 2, {
        start: a.start,
        end: b.end,
        sum: a.sum + b.sum,
        weight: a.weight + b.weight,
      });
    }
  }

  const out = new Map();
  for (const b of blocks) {
    const avg = b.sum / Math.max(1e-9, b.weight);
    for (let r = b.start; r <= b.end; r += 1) out.set(r, avg);
  }
  return out;
}

// ------------------- buildCalibratedMedians ------------------
// Calibrated banding that cannot collapse into "everything is rarity 1" -
function buildCalibratedMedians(scored) {
  const allScores = scored.map((s) => s.score).filter((x) => Number.isFinite(x));
  const scoresSorted = allScores.slice().sort((a, b) => a - b);

  const minScore = scoresSorted.length ? scoresSorted[0] : 0;
  const maxScore = scoresSorted.length ? scoresSorted[scoresSorted.length - 1] : 0;

  // Anchors keep low rarities low and high rarities high,
  // even if the existing labels are messy.
  const anchorLow = scoresSorted.length ? quantile(scoresSorted, 0.08) : minScore;
  const anchorHigh = scoresSorted.length ? quantile(scoresSorted, 0.92) : maxScore;

  // Build per-rarity medians + counts
  const byRarity = new Map();
  for (const s of scored) {
    const r = Math.min(MAX_RARITY, Math.max(1, Number(s.currentRarity) || 1));
    if (!byRarity.has(r)) byRarity.set(r, []);
    byRarity.get(r).push(s.score);
  }

  const medians = new Map();
  const counts = new Map();

  for (let r = 1; r <= MAX_RARITY; r += 1) {
    const arr = byRarity.get(r) || [];
    counts.set(r, arr.length);
    const med = medianOf(arr);
    if (med != null) medians.set(r, med);
  }

  // If calibration data is sparse, fall back to quantile thresholds behavior
  const MIN_SAMPLES_PER_RARITY = 6;
  const usablePoints = [];
  for (let r = 1; r <= MAX_RARITY; r += 1) {
    const c = counts.get(r) || 0;
    if (c >= MIN_SAMPLES_PER_RARITY && medians.has(r)) {
      usablePoints.push({ r, v: Number(medians.get(r)), w: c });
    }
  }

  if (usablePoints.length < 3 || scoresSorted.length < 20) {
    // Not enough signal to calibrate safely
    const fallback = new Map();
    for (let r = 1; r <= MAX_RARITY; r += 1) {
      fallback.set(r, quantile(scoresSorted, (r - 1) / Math.max(1, MAX_RARITY - 1)));
    }
    return fallback;
  }

  // Force endpoints to exist and be sane
  usablePoints.sort((a, b) => a.r - b.r);

  if (usablePoints[0].r !== 1) usablePoints.unshift({ r: 1, v: anchorLow, w: MIN_SAMPLES_PER_RARITY });
  else usablePoints[0].v = Math.min(usablePoints[0].v, anchorLow);

  const last = usablePoints[usablePoints.length - 1];
  if (last.r !== MAX_RARITY) usablePoints.push({ r: MAX_RARITY, v: anchorHigh, w: MIN_SAMPLES_PER_RARITY });
  else last.v = Math.max(last.v, anchorHigh);

  // Isotonic fit on the usable points
  const fitted = enforceMonotoneIncreasingByRarity(usablePoints);

  // Fill all rarities by interpolation between nearest fitted points
  const out = new Map();
  for (let r = 1; r <= MAX_RARITY; r += 1) {
    if (fitted.has(r)) {
      out.set(r, fitted.get(r));
      continue;
    }

    let left = r - 1;
    while (left >= 1 && !fitted.has(left)) left -= 1;

    let right = r + 1;
    while (right <= MAX_RARITY && !fitted.has(right)) right += 1;

    if (left < 1 && right > MAX_RARITY) {
      out.set(r, anchorLow);
      continue;
    }

    if (left < 1) {
      out.set(r, fitted.get(right));
      continue;
    }

    if (right > MAX_RARITY) {
      out.set(r, fitted.get(left));
      continue;
    }

    const a = Number(fitted.get(left));
    const b = Number(fitted.get(right));
    const t = (r - left) / (right - left);
    out.set(r, a + (b - a) * t);
  }

  // Final clamp to the score range so medians cannot drift wildly
  for (let r = 1; r <= MAX_RARITY; r += 1) {
    const v = Number(out.get(r) ?? 0);
    out.set(r, Math.max(minScore, Math.min(maxScore, v)));
  }

  return out;
}

// ------------------- rarityFromCalibratedMedians ------------------
// Score -> rarity via calibrated medians with proper distribution -
// Uses quantile-like thresholds between medians to ensure proper spread
function rarityFromCalibratedMedians(score, medians) {
  // Get all medians in order
  const medianValues = [];
  for (let r = 1; r <= MAX_RARITY; r += 1) {
    medianValues.push({ r, median: Number(medians.get(r) ?? 0) });
  }
  
  // If medians are not properly ordered (calibration failed), fall back to quantile-like mapping
  let isOrdered = true;
  for (let i = 1; i < medianValues.length; i += 1) {
    if (medianValues[i].median < medianValues[i - 1].median) {
      isOrdered = false;
      break;
    }
  }
  
  if (!isOrdered || medianValues[0].median > score * 0.5) {
    // Calibration looks wrong - use quantile-like thresholds instead
    // Find which percentile range the score falls into
    const allMedians = medianValues.map((m) => m.median).filter((v) => Number.isFinite(v));
    if (allMedians.length === 0) return 1;
    
    const minMed = Math.min(...allMedians);
    const maxMed = Math.max(...allMedians);
    const range = maxMed - minMed;
    
    if (range < 1) {
      // All medians are the same - use score directly
      return Math.min(MAX_RARITY, Math.max(1, Math.round((score / 100) * MAX_RARITY) || 1));
    }
    
    // Map score to rarity based on where it falls in the median range
    const normalized = (score - minMed) / range;
    return Math.min(MAX_RARITY, Math.max(1, Math.round(1 + normalized * (MAX_RARITY - 1)) || 1));
  }
  
  // Normal case: medians are ordered, use threshold-based mapping
  // Map score to rarity by finding which rarity's "zone" it falls into
  // Zone boundaries are midpoints between consecutive medians
  for (let r = 1; r < MAX_RARITY; r += 1) {
    const currMed = medianValues[r - 1].median;
    const nextMed = medianValues[r].median;
    const threshold = (currMed + nextMed) / 2;
    
    if (score < threshold) {
      return r;
    }
  }
  
  // Score is above all thresholds -> max rarity
  return MAX_RARITY;
}


// ============================================================================
// ------------------- Main -------------------
// ============================================================================

async function main() {
  const envPath = loadDotEnv();
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    logError("Missing MONGODB_URI. Set it in your shell or add it to a .env (dashboard/.env or repo root/.env).");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(uri);
  } catch (err) {
    logError("Failed to connect to MongoDB.", err);
    process.exitCode = 1;
    return;
  }

  const outLines = [];
  const emit = (line = "") => {
    outLines.push(line);
    // Only print to console if not writing to file (to avoid duplicate output)
    if (!OUT_PATH) {
      console.log(line);
    }
  };

  emit("╔══════════════════════════════════════════════════════════════════════════════╗");
  emit("║                    📊 ITEM RARITY AUDIT REPORT 📊                           ║");
  emit("╚══════════════════════════════════════════════════════════════════════════════╝");
  emit("");
  emit("🔒 READ-ONLY audit: no database writes will be performed.");
  if (envPath) emit(`📁 Loaded environment from: ${envPath}`);
  emit(`🎯 Banding: ${BANDING} (rarity 1..${MAX_RARITY})`);
  emit(`🔄 Craft propagation iterations: ${CRAFT_PROP_ITERATIONS}`);
  emit(
    `🔍 Filters: only-gear=${ONLY_GEAR ? "true" : "false"}, craftable=${CRAFTABLE_FILTER}, name=${
      NAME_FILTER ? `"${NAME_FILTER}"` : "any"
    }`
  );
  if (OUT_PATH) emit(`💾 Output file: ${OUT_PATH}`);
  emit("");

  let all = [];
  try {
    all = await Item.find({}).lean();
  } catch (err) {
    logError("Failed to load items.", err);
    process.exitCode = 1;
    return;
  }

  const focusItems = all.filter((it) => {
    if (NAME_FILTER && !String(it?.itemName || "").toLowerCase().includes(NAME_FILTER)) return false;
    if (ONLY_GEAR && !isGear(it)) return false;
    if (EXCLUDE_GEAR && isGear(it)) return false;
    if (CRAFTABLE_FILTER === "true" && !isCraftable(it)) return false;
    if (CRAFTABLE_FILTER === "false" && isCraftable(it)) return false;
    return true;
  });
  

  const base = all.map((it) => {
    const currentRarity = Number(it?.itemRarity ?? 1) || 1;
    const audit = computeScarcityBase(it);

    return {
      _id: String(it?._id || ""),
      itemName: String(it?.itemName || ""),
      currentRarity,
      ...audit,
    };
  });

  let scoreByKey = new Map(base.map((s) => [normKey(s.itemName), s.score]));
  let craftPenaltyByKey = new Map();

  for (let iter = 0; iter < CRAFT_PROP_ITERATIONS; iter += 1) {
    const nextScoreByKey = new Map();
    const nextPenaltyByKey = new Map();
    let maxChange = 0;

    for (const s of base) {
      const key = normKey(s.itemName);
      let score = s.score;
      let craftPenalty = 0;

      if (s.craftMaterials && s.craftMaterials.length) {
        craftPenalty = computeCraftPenalty(s.craftMaterials, scoreByKey);

        const hasNonCraftMethod = (s.obtainMethods || []).some((m) => m !== "Crafting");
        if (hasNonCraftMethod) craftPenalty *= 0.4;

        score += craftPenalty;
      }

      nextScoreByKey.set(key, score);
      nextPenaltyByKey.set(key, craftPenalty);
      maxChange = Math.max(maxChange, Math.abs(score - (scoreByKey.get(key) ?? 0)));
    }

    scoreByKey = nextScoreByKey;
    craftPenaltyByKey = nextPenaltyByKey;
    if (maxChange < 0.01) break;
  }

  const scored = base.map((s) => {
    const key = normKey(s.itemName);
    const finalScore = scoreByKey.get(key) ?? s.score;
    const craftPenalty = craftPenaltyByKey.get(key) ?? 0;
    return { ...s, score: finalScore, craftPenalty };
  });

  let thresholds = [];
  let calibratedMedians = null;

  if (BANDING === "quantile") {
    const scoresSorted = scored.map((s) => s.score).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    thresholds = [];
    
    if (scoresSorted.length === 0) {
      // No scores - use dummy thresholds
      for (let k = 1; k < MAX_RARITY; k += 1) thresholds.push(k * 10);
    } else {
      const minScore = scoresSorted[0];
      const maxScore = scoresSorted[scoresSorted.length - 1];
      const scoreRange = maxScore - minScore;
      
      // Use linear interpolation across the score range instead of percentiles
      // This ensures that scores are mapped more evenly: 
      // minScore → rarity 1, maxScore → rarity 10
      // This prevents clustering when most items have high scores
      for (let k = 1; k < MAX_RARITY; k += 1) {
        // Linear interpolation: k/MAX_RARITY of the way from min to max
        const threshold = minScore + (scoreRange * k / MAX_RARITY);
        thresholds.push(threshold);
      }
    }
  } else {
    calibratedMedians = buildCalibratedMedians(scored);
    
    // Safety check: if rarity 1's median is too high relative to score distribution,
    // calibration is probably wrong (items mislabeled as rarity 1 have high scores).
    // Fall back to quantile thresholds to ensure proper mapping: low scores → rarity 1, high scores → rarity 10
    const r1Median = Number(calibratedMedians.get(1) ?? 0);
    const r10Median = Number(calibratedMedians.get(MAX_RARITY) ?? 0);
    const allScores = scored.map((s) => s.score).filter((x) => Number.isFinite(x));
    const scoresSorted = allScores.slice().sort((a, b) => a - b);
    
    if (scoresSorted.length === 0) {
      calibratedMedians = null;
    } else {
      const p10 = quantile(scoresSorted, 0.1); // 10th percentile (should be ~rarity 1)
      const p90 = quantile(scoresSorted, 0.9); // 90th percentile (should be ~rarity 10)
      
      // Check if rarity 1 median is way too high (should be near bottom of distribution)
      // Or if medians aren't properly spread (rarity 10 should be much higher than rarity 1)
      const medianSpread = r10Median - r1Median;
      const scoreSpread = p90 - p10;
      
      if (r1Median > p10 * 2 || r1Median > 30 || (scoreSpread > 10 && medianSpread < scoreSpread * 0.3)) {
        // Calibration looks wrong - use linear interpolation instead to ensure proper distribution
        thresholds = [];
        const minScore = scoresSorted[0];
        const maxScore = scoresSorted[scoresSorted.length - 1];
        const scoreRange = maxScore - minScore;
        for (let k = 1; k < MAX_RARITY; k += 1) {
          const threshold = minScore + (scoreRange * k / MAX_RARITY);
          thresholds.push(threshold);
        }
        calibratedMedians = null; // Signal to use quantile mapping
        emit(`⚠️  Calibration check failed (r1 median too high or spread too small), falling back to linear thresholds`);
        emit("");
      }
    }
  }

  const focusIdSet = new Set(focusItems.map((it) => String(it?._id || "")));

  const results = scored
    .filter((s) => focusIdSet.has(String(s._id)))
    .map((s) => {
      const suggestedRarity =
        BANDING === "quantile" || calibratedMedians === null
          ? rarityFromScore(s.score, thresholds)
          : rarityFromCalibratedMedians(s.score, calibratedMedians);

      const delta = suggestedRarity - s.currentRarity;
      return { ...s, suggestedRarity, delta, absDelta: Math.abs(delta) };
    })
    .filter((r) => SHOW_ALL || r.absDelta >= MIN_DELTA)
    .sort((a, b) => {
      if (SHOW_ALL) {
        // When showing all, sort by: absDelta desc, then score desc, then name asc
        return b.absDelta - a.absDelta || b.score - a.score || a.itemName.localeCompare(b.itemName);
      } else {
        // When showing mismatches only, sort by: absDelta desc, then score desc, then name asc
        return b.absDelta - a.absDelta || b.score - a.score || a.itemName.localeCompare(b.itemName);
      }
    });

  if (AS_JSON) {
    const payload = JSON.stringify(
      {
        maxRarity: MAX_RARITY,
        banding: BANDING,
        thresholds: BANDING === "quantile" || calibratedMedians === null ? thresholds : undefined,
        calibratedMedians: BANDING === "calibrated" && calibratedMedians !== null ? Object.fromEntries(calibratedMedians) : undefined,
        craftPropagationIterations: CRAFT_PROP_ITERATIONS,
        focusCount: focusItems.length,
        totalItemCount: all.length,
        count: results.length,
        results,
      },
      null,
      2
    );

    process.stdout.write(payload);
    if (OUT_PATH) fs.writeFileSync(OUT_PATH, payload, "utf8");
    return;
  }

  emit("╔══════════════════════════════════════════════════════════════════════════════╗");
  emit("║                          📈 SUMMARY & SETTINGS                               ║");
  emit("╚══════════════════════════════════════════════════════════════════════════════╝");
  emit("");
  
  if (SHOW_ALL) {
    emit(`📦 Loaded: ${all.length} total items | Focus set: ${focusItems.length} items`);
    emit(`📋 Showing: ALL ${results.length} items (including matches)`);
  } else {
    emit(`📦 Loaded: ${all.length} total items | Focus set: ${focusItems.length} items`);
    emit(`📋 Showing: Top ${Math.min(TOP_N, results.length)} mismatches (min delta: ${MIN_DELTA})`);
  }
  emit("");
  emit(`🎲 Rarity Scale: 1..${MAX_RARITY}`);
  emit(`   🌱 1 = SUPER ULTRA HELLA COMMON (like finding a blade of grass in a grass field)`);
  emit(`   💎 ${MAX_RARITY} = SUPER ULTRA HELLA RARE (like finding $5k on a sidewalk)`);
  emit("");

  if (BANDING === "quantile" || calibratedMedians === null) {
    const allScores = scored.map((s) => s.score).filter((x) => Number.isFinite(x));
    const scoresSorted = allScores.slice().sort((a, b) => a - b);
    const minScore = scoresSorted.length ? scoresSorted[0] : 0;
    const maxScore = scoresSorted.length ? scoresSorted[scoresSorted.length - 1] : 0;
    const p50 = scoresSorted.length ? quantile(scoresSorted, 0.5) : 0;
    emit(`📊 Score Range: ${minScore.toFixed(2)} - ${maxScore.toFixed(2)} (median: ${p50.toFixed(2)})`);
    emit(`🎯 Thresholds (for rarity 2-10): ${thresholds.map((t) => t.toFixed(1)).join(", ")}`);
    emit(`   ℹ️  Score must exceed threshold to reach that rarity. Score < threshold[0] = rarity 1`);
    
    // Debug: show example mapping
    if (scoresSorted.length > 0) {
      const exampleLow = quantile(scoresSorted, 0.1);
      const exampleHigh = quantile(scoresSorted, 0.9);
      const exampleMid = quantile(scoresSorted, 0.5);
      emit(`   📝 Examples: ${exampleLow.toFixed(1)} → rarity ${rarityFromScore(exampleLow, thresholds)} | ${exampleMid.toFixed(1)} → rarity ${rarityFromScore(exampleMid, thresholds)} | ${exampleHigh.toFixed(1)} → rarity ${rarityFromScore(exampleHigh, thresholds)}`);
    }
  } else {
    const preview = [];
    for (let r = 1; r <= MAX_RARITY; r += 1) preview.push(`${r}:${calibratedMedians.get(r).toFixed(1)}`);
    emit(`📊 Calibrated median scores by rarity: ${preview.join("  ")}`);
  }
  emit("");
  emit("╔══════════════════════════════════════════════════════════════════════════════╗");
  emit("║                            📋 ITEM RESULTS                                   ║");
  emit("╚══════════════════════════════════════════════════════════════════════════════╝");
  emit("");
  emit("Legend:");
  emit("  🔴 = Current rarity WAY too low (delta > +3)");
  emit("  🟡 = Current rarity too low (delta +1 to +3)");
  emit("  ✅ = Perfect match (delta = 0)");
  emit("  🟠 = Current rarity too high (delta -1 to -3)");
  emit("  🔵 = Current rarity WAY too high (delta < -3)");
  emit("");

  const itemsToShow = SHOW_ALL ? results : results.slice(0, TOP_N);
  
  // Add header separator
  emit("═".repeat(80));
  emit("");
  
  for (let idx = 0; idx < itemsToShow.length; idx += 1) {
    const r = itemsToShow[idx];
    
    // Delta emoji indicator
    let deltaEmoji = "  ";
    if (r.delta > 3) deltaEmoji = "🔴"; // Way too low
    else if (r.delta > 0) deltaEmoji = "🟡"; // Too low
    else if (r.delta === 0) deltaEmoji = "✅"; // Perfect match
    else if (r.delta > -3) deltaEmoji = "🟠"; // Too high
    else deltaEmoji = "🔵"; // Way too high
    
    emit(`${deltaEmoji} ${r.itemName}`);
    emit(`   📊 Current: ${r.currentRarity}  →  Suggested: ${r.suggestedRarity}  (${r.delta >= 0 ? "+" : ""}${r.delta})  |  Score: ${r.score.toFixed(2)}`);
    emit("");

    const topReasons = [];
    
    // 🏢 Village-locked jobs (high impact)
    if (r.lockedJobs.length) {
      topReasons.push(`🏢 Village-locked: ${r.lockedJobs.map((j) => `${j.job}@${j.village}`).join(", ")}`);
    }
    
    // 🌦️ Special weather (high impact)
    if (r.specialWeather.length) {
      topReasons.push(`🌦️  Weather: ${r.specialWeather.join(", ")}`);
    }

    // ⚔️ Modifier/hearts (gear/recipes)
    if (isGearOrRecipe(r) && Number(r.modifierHearts || 0) !== 0) {
      topReasons.push(`⚔️  Modifier/Hearts: ${Number(r.modifierHearts).toFixed(0)} (penalty ${Number(r.modifierPenalty || 0).toFixed(2)})`);
    }

    // 👷 Jobs
    if (r.jobs && r.jobs.length) {
      topReasons.push(`👷 Jobs: ${r.jobs.join(", ")}`);
    }

    // 👹 Loot monsters
    if (Number(r.lootMonsterCount || 0) > 0 || r.lootMonstersMissing) {
      const preview = Array.isArray(r.lootMonsters) ? r.lootMonsters.slice(0, 5).join(", ") : "";
      topReasons.push(
        `👹 Loot monsters: ${Number(r.lootMonsterCount || 0)}${r.lootMonstersMissing ? " ⚠️ MISSING" : ""}` +
          (preview ? ` (${preview}${Number(r.lootMonsterCount || 0) > 5 ? ", ..." : ""})` : "")
      );
    }

    // 🔨 Crafting inputs
    if (r.craftMaterials && r.craftMaterials.length) {
      const matsWithScores = r.craftMaterials
        .map((m) => ({ ...m, ingScore: scoreByKey.get(normKey(m.itemName)) ?? null }))
        .sort((a, b) => (b.ingScore ?? 0) - (a.ingScore ?? 0));

      const preview = matsWithScores
        .slice(0, 3)
        .map((m) => `${m.quantity}x ${m.itemName}${m.ingScore == null ? "" : ` (score ${m.ingScore.toFixed(1)})`}`)
        .join(", ");

      topReasons.push(
        `🔨 Crafting: ${preview}${matsWithScores.length > 3 ? ", ..." : ""} (penalty ${Number(r.craftPenalty || 0).toFixed(2)})`
      );
    }

    // 🎯 Obtain methods
    topReasons.push(`🎯 Obtain: ${r.obtainMethods.join(", ") || "None"} (effective ${r.effectiveWays.toFixed(2)})`);

    // 📍 Locations
    if (r.locationCountListed > 0) {
      topReasons.push(
        `📍 Locations: ${r.locations.join(", ")} (${r.locationCountListed}) | ` +
          `Availability: ${(Number(r.locationAvailabilityFraction || 0) * 100).toFixed(1)}% | ` +
          `Penalty: ${Number(r.locationPenalty || 0).toFixed(2)}`
      );
    } else {
      topReasons.push(
        `📍 Locations: ⚠️ NONE LISTED (treated as SUPER rare) | ` +
          `Availability: ${(Number(r.locationAvailabilityFraction || 0) * 100).toFixed(1)}% | ` +
          `Penalty: ${Number(r.locationPenalty || 0).toFixed(2)}`
      );
    }

    // 💰 Price
    if (r.buyPrice || r.sellPrice) {
      topReasons.push(`💰 Price: Buy ${r.buyPrice || 0} | Sell ${r.sellPrice || 0}`);
    }

    for (const reason of topReasons) emit(`   ${reason}`);
    
    // Add separator between items (except last)
    if (idx < itemsToShow.length - 1) {
      emit("");
      emit("─".repeat(80));
      emit("");
    }
  }
  
  emit("");
  emit("═".repeat(80));

  if (OUT_PATH) {
    fs.writeFileSync(OUT_PATH, outLines.join("\n"), "utf8");
    // Only show confirmation if we suppressed console output
    console.log(`✅ Audit complete! Results written to: ${OUT_PATH}`);
    console.log(`   Total items: ${results.length}`);
  }
}

main()
  .catch((err) => {
    logError("Audit failed.", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await safeDisconnect("finally");
  });
