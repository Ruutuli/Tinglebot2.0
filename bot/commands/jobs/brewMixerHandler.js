// ============================================================================
// /crafting brew — multi-step mixer (critter → part → optional extras: parts and/or same-family critters)
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const { connectToTinglebot, fetchCharacterByNameAndUserId, getCharacterInventoryCollection, fetchItemByName } = require('@/database/db');
const TempData = require('@/models/TempDataModel');
const { checkAndUseStamina } = require('../../modules/characterStatsModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { addItemInventoryDatabase, removeItemInventoryDatabase } = require('@/utils/inventoryUtils');
const { checkInventorySync } = require('@/utils/characterUtils');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { info } = require('@/utils/logger');
const { enforceJail } = require('@/utils/jailCheck');
const {
  validateBrewPair,
  validateBrewExtraPart,
  mixerBrewOutcomeFromIngredientRarities,
  countMixerExtraSynergy,
  MIXER_POTENCY_WEIGHT_MAX,
  MIXER_POTENCY_WEIGHT_AVG,
  MIXER_POTENCY_WEIGHT_MIN,
  MIXER_SYNERGY_BONUS_PER_EXTRA,
  MIXER_SYNERGY_BONUS_MAX,
  normalizeMixerIngredientRarity,
  elixirNameToEffectFamily,
  normalizeNameKey,
  getAllowedPartElementsForFamily,
  getRequiredPartElementForFamily,
  getPartElementFromLabels,
  getIngredientLabelSets,
  ensureIngredientLabelsLoaded,
  isExcludedMixerItem,
  isMixerUniversalFairyCritterName,
  mixerFairyHealHeartsFromExtras,
} = require('../../modules/elixirBrewModule');
const { createCraftingEmbed } = require('../../embeds/embeds.js');

const EMBED_BORDER_IMAGE_URL = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
const MAX_MIXER_EXTRAS = 3;

function formatElixirLevelForCraftingEmbed(level) {
  if (level == null || level === '') return null;
  const n = Number(level);
  if (!Number.isFinite(n)) return String(level);
  const names = { 1: 'Basic', 2: 'Mid', 3: 'High' };
  const word = names[n];
  return word ? `${n} (${word})` : String(n);
}

/** After `deferUpdate` on a brew menu: clear components and show text (errors). Uses `editReply` first (correct after defer). */
async function stripBrewMixerEphemeralUi(interaction, line) {
  const payload = { content: line, embeds: [], components: [] };
  try {
    await interaction.editReply(payload);
  } catch (_) {
    try {
      if (typeof interaction.message?.edit === 'function') {
        await interaction.message.edit(payload);
      }
    } catch (_) {}
  }
}

/** Replace mixer UI with a done state: success embed, no buttons/selects. */
async function completeBrewMixerEphemeralUi(interaction, { characterName, itemName }) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Brew complete')
    .setDescription(
      `**${characterName}** brewed **${itemName}**.\n\n_See the public craft card in this channel._`
    )
    .setColor(0x008b8b);
  const payload = { content: '', embeds: [embed], components: [] };
  try {
    await interaction.editReply(payload);
  } catch (_) {
    try {
      if (typeof interaction.message?.edit === 'function') {
        await interaction.message.edit(payload);
      }
    } catch (_) {}
  }
}

/** Mixer cancel — ingredients/stamina are only consumed in `finalizeBrewMixerSession`; cancel is always a no-op for inventory. */
function buildBrewMixerCanceledEmbed(session) {
  const who = session?.characterName ? `**${session.characterName}**` : 'Your character';
  const elixir = session?.chosenElixirName ? `**${session.chosenElixirName}**` : 'this elixir';
  return new EmbedBuilder()
    .setTitle('🧪 Brew canceled')
    .setDescription(
      `${who} — mixer for ${elixir} was closed.\n\n` +
        'Nothing was consumed: **no ingredients were removed** from inventory and **no stamina** was spent. There is nothing to refund.'
    )
    .setColor(0x95a5a6);
}

function cleanBrewOptionItemName(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/\s*\(Qty:\s*\d+\)/i, '')
    .replace(/\s*-\s*🟩\s*\d+\s*\|\s*Has:\s*\d+/i, '')
    .trim();
}

function parseStaminaToCraftBrew(raw) {
  if (raw == null) return 4;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.max(1, Math.floor(raw));
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? Math.max(1, n) : 4;
}

function rowQty(row) {
  const q = row.quantity;
  if (typeof q === 'number' && !isNaN(q)) return q;
  return parseInt(q, 10) || 0;
}

function isPartNameLabeled(name, partNames) {
  return [...partNames].some((p) => p.toLowerCase() === String(name).toLowerCase());
}

function partMatchesAllowedElements(name, allowedEls, partNames) {
  if (!isPartNameLabeled(name, partNames)) return false;
  const keys = [...partNames];
  const match = keys.find((k) => k.toLowerCase() === String(name).toLowerCase());
  const el = (match && getPartElementFromLabels(match)) || 'none';
  return allowedEls.includes(el);
}

/** Fallback when elixir has no critter line on `craftingMaterial` (legacy rows). */
function buildCritterOptionsByFamily(inventory, chosenFamily, familyByCritterName) {
  const qtyByKey = new Map();
  const displayNameByKey = new Map();
  for (const row of inventory) {
    const name = row.itemName;
    if (!name || rowQty(row) < 1) continue;
    const fam = familyByCritterName.get(name.toLowerCase());
    if (fam !== chosenFamily) continue;
    const key = name.toLowerCase();
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + rowQty(row));
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, name);
  }
  const choices = [];
  for (const [key, qty] of qtyByKey) {
    const name = displayNameByKey.get(key);
    choices.push({
      label: `${name} (Qty: ${qty})`.slice(0, 100),
      value: name,
    });
    if (choices.length >= 25) break;
  }
  return choices;
}

/**
 * Mixer critter slot = exact name from elixir `craftingMaterial` (first non–Any Monster Part).
 * If the DB has no critter line, fall back to any labeled critter in the elixir’s effect family.
 */
function buildMixerCritterOptions(inventory, catalogCritterName, chosenFamily, familyByCritterName) {
  if (catalogCritterName && String(catalogCritterName).trim()) {
    const target = normalizeNameKey(catalogCritterName);
    const qtyByKey = new Map();
    const displayNameByKey = new Map();
    for (const row of inventory) {
      const name = row.itemName;
      if (!name || rowQty(row) < 1) continue;
      if (normalizeNameKey(name) !== target) continue;
      const key = name.toLowerCase();
      qtyByKey.set(key, (qtyByKey.get(key) || 0) + rowQty(row));
      if (!displayNameByKey.has(key)) displayNameByKey.set(key, name);
    }
    const choices = [];
    for (const [key, qty] of qtyByKey) {
      const name = displayNameByKey.get(key);
      choices.push({
        label: `${name} (Qty: ${qty})`.slice(0, 100),
        value: name,
      });
    }
    return choices;
  }
  return buildCritterOptionsByFamily(inventory, chosenFamily, familyByCritterName);
}

/**
 * Step 2 monster parts only: **thread-element** parts first (when the elixir has a thread), then **neutral**;
 * within each bucket **highest rarity** → higher stack → A→Z (same rules as optional extras).
 */
function sortMixerPartOnlyPairsForSelectMenu(rows, effectFamily, allowedPartEls, partNames, rarityByKey) {
  const req = getRequiredPartElementForFamily(effectFamily);
  const thread = [];
  const neutralParts = [];
  const rScore = (p) =>
    normalizeMixerIngredientRarity(rarityByKey?.get(normalizeNameKey(p.name)) ?? 1);
  const qtyOf = (p) => p.remainingQty ?? 0;

  const byRarityQtyName = (a, b) => {
    const dr = rScore(b) - rScore(a);
    if (dr !== 0) return dr;
    const dq = qtyOf(b) - qtyOf(a);
    if (dq !== 0) return dq;
    return a.name.localeCompare(b.name);
  };

  for (const p of rows) {
    const key = normalizeNameKey(p.name);
    if (!isPartNameLabeled(p.name, partNames) || !partMatchesAllowedElements(p.name, allowedPartEls, partNames)) {
      continue;
    }
    const match = [...partNames].find((n) => n.toLowerCase() === key);
    const el = match ? String(getPartElementFromLabels(match) || 'none').toLowerCase() : 'none';
    if (req !== 'none' && el === req) {
      thread.push(p);
    } else {
      neutralParts.push(p);
    }
  }

  thread.sort(byRarityQtyName);
  neutralParts.sort(byRarityQtyName);
  if (req === 'none') {
    return neutralParts;
  }
  return [...thread, ...neutralParts];
}

async function buildPartOptions(inventory, allowedEls, partNames, userId, effectFamily) {
  const qtyByKey = new Map();
  const displayNameByKey = new Map();
  for (const row of inventory) {
    const name = row.itemName;
    if (!name || rowQty(row) < 1) continue;
    if (!partMatchesAllowedElements(name, allowedEls, partNames)) continue;
    const key = name.toLowerCase();
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + rowQty(row));
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, name);
  }
  const rows = [];
  for (const [key, qty] of qtyByKey) {
    rows.push({ name: displayNameByKey.get(key), remainingQty: qty });
  }

  const rarityByKey = await fetchBrewExtraItemRarityMap(
    rows.map((r) => r.name),
    userId,
    'brew_part_select_label'
  );
  const ordered = sortMixerPartOnlyPairsForSelectMenu(
    rows,
    effectFamily,
    allowedEls,
    partNames,
    rarityByKey
  );
  const capped = ordered.slice(0, 25);

  const choices = [];
  for (const { name, remainingQty: qty } of capped) {
    const k = normalizeNameKey(name);
    const r = rarityByKey.get(k) ?? 1;
    const base = `${name} (Qty: ${qty}) · rarity: ${r}`;
    let label = base;
    if (base.length > 100) {
      const shortName = name.length > 52 ? `${name.slice(0, 49)}…` : name;
      label = `${shortName} (Qty: ${qty}) · rarity: ${r}`.slice(0, 100);
    }
    choices.push({ label, value: name });
  }
  return choices;
}

function isCritterNameLabeled(name, critterNames) {
  return [...critterNames].some((c) => c.toLowerCase() === String(name).toLowerCase());
}

/**
 * Discord select menus allow at most 25 options. Order: **thread-element parts** → **same-family critters**
 * → **Fairy / Mock Fairy** → **neutral parts**. Within each bucket: **highest catalog rarity first**, then stack, then A→Z.
 */
function sortMixerExtraPairsForSelectMenu(
  pairs,
  effectFamily,
  allowedPartEls,
  partNames,
  critterNames,
  familyByCritterName,
  rarityByKey
) {
  const req = getRequiredPartElementForFamily(effectFamily);
  const brewFam = String(effectFamily || '').trim().toLowerCase();
  const thread = [];
  const critters = [];
  const fairyUniversal = [];
  const neutralParts = [];

  const rScore = (p) =>
    normalizeMixerIngredientRarity(rarityByKey?.get(normalizeNameKey(p.name)) ?? 1);

  for (const p of pairs) {
    const key = normalizeNameKey(p.name);
    if (isMixerUniversalFairyCritterName(p.name) && isCritterNameLabeled(p.name, critterNames)) {
      fairyUniversal.push(p);
      continue;
    }
    const asCritter =
      isCritterNameLabeled(p.name, critterNames) && familyByCritterName.get(key) === brewFam;
    if (asCritter) {
      critters.push(p);
      continue;
    }
    const asPart =
      isPartNameLabeled(p.name, partNames) && partMatchesAllowedElements(p.name, allowedPartEls, partNames);
    if (!asPart) continue;

    const match = [...partNames].find((n) => n.toLowerCase() === key);
    const el = match ? String(getPartElementFromLabels(match) || 'none').toLowerCase() : 'none';
    if (req !== 'none' && el === req) {
      thread.push(p);
    } else {
      neutralParts.push(p);
    }
  }

  const byRarityQtyName = (a, b) => {
    const dr = rScore(b) - rScore(a);
    if (dr !== 0) return dr;
    const dq = b.remainingQty - a.remainingQty;
    if (dq !== 0) return dq;
    return a.name.localeCompare(b.name);
  };
  thread.sort(byRarityQtyName);
  critters.sort(byRarityQtyName);
  fairyUniversal.sort(byRarityQtyName);
  neutralParts.sort(byRarityQtyName);

  if (req === 'none') {
    return [...critters, ...fairyUniversal, ...neutralParts];
  }
  return [...thread, ...critters, ...fairyUniversal, ...neutralParts];
}

async function fetchBrewExtraItemRarityMap(names, userId, operation = 'brew_extra_menu_rarity') {
  const rarityByKey = new Map();
  for (const name of names) {
    const k = normalizeNameKey(name);
    if (rarityByKey.has(k)) continue;
    const doc = await fetchItemByName(name, {
      commandName: 'crafting',
      userId,
      operation,
    });
    const r = doc?.itemRarity != null && doc.itemRarity !== '' ? doc.itemRarity : 1;
    rarityByKey.set(k, r);
  }
  return rarityByKey;
}

/**
 * One select-menu option per eligible ingredient name (qty shown on the label).
 * Reserves one each of `critterName` and `partName`, then one per entry in `pickedExtrasSoFar`.
 * Loads rarities for ordering (type buckets, then rarity desc).
 */
async function buildMixerExtraSlots(
  inventory,
  effectFamily,
  critterName,
  partName,
  partNames,
  critterNames,
  familyByCritterName,
  pickedExtrasSoFar = [],
  userId
) {
  const brewFam = String(effectFamily || '').trim().toLowerCase();
  const allowedPartEls = getAllowedPartElementsForFamily(effectFamily);
  const qtyByKey = new Map();
  const displayNameByKey = new Map();
  for (const row of inventory) {
    const name = row.itemName;
    if (!name || rowQty(row) < 1) continue;
    const key = normalizeNameKey(name);
    qtyByKey.set(key, (qtyByKey.get(key) || 0) + rowQty(row));
    if (!displayNameByKey.has(key)) displayNameByKey.set(key, name);
  }

  const critK = normalizeNameKey(critterName);
  const partK = normalizeNameKey(partName);
  if (critK && qtyByKey.has(critK)) {
    qtyByKey.set(critK, Math.max(0, (qtyByKey.get(critK) || 0) - 1));
  }
  if (partK && qtyByKey.has(partK)) {
    qtyByKey.set(partK, Math.max(0, (qtyByKey.get(partK) || 0) - 1));
  }

  for (const pickedName of pickedExtrasSoFar) {
    const k = normalizeNameKey(pickedName);
    if (k && qtyByKey.has(k)) {
      qtyByKey.set(k, Math.max(0, (qtyByKey.get(k) || 0) - 1));
    }
  }

  const pairs = [];
  for (const [key, qty] of qtyByKey) {
    if (qty < 1) continue;
    const name = displayNameByKey.get(key);
    if (!name) continue;
    if (isExcludedMixerItem(name)) continue;

    const asPart = isPartNameLabeled(name, partNames) && partMatchesAllowedElements(name, allowedPartEls, partNames);
    const asCritter =
      isCritterNameLabeled(name, critterNames) && familyByCritterName.get(key) === brewFam;
    const universalFairy =
      isMixerUniversalFairyCritterName(name) && isCritterNameLabeled(name, critterNames);
    if (!asPart && !asCritter && !universalFairy) continue;

    pairs.push({ name, remainingQty: qty });
  }

  const rarityByKey = await fetchBrewExtraItemRarityMap(
    pairs.map((p) => p.name),
    userId
  );
  const ordered = sortMixerExtraPairsForSelectMenu(
    pairs,
    effectFamily,
    allowedPartEls,
    partNames,
    critterNames,
    familyByCritterName,
    rarityByKey
  );
  const menuOmittedCount = Math.max(0, ordered.length - 25);
  const capped = ordered.slice(0, 25);
  return {
    itemNames: capped.map((p) => p.name),
    remainingQtyPerSlot: capped.map((p) => p.remainingQty),
    menuOmittedCount,
    rarityByKey,
  };
}

async function buildMixerExtraSlotOptionLabels(itemNames, remainingQtyPerSlot, userId, preloadedRarityByKey) {
  const rarityByKey = preloadedRarityByKey instanceof Map ? preloadedRarityByKey : new Map();
  for (const name of itemNames) {
    const k = normalizeNameKey(name);
    if (rarityByKey.has(k)) continue;
    const doc = await fetchItemByName(name, {
      commandName: 'crafting',
      userId,
      operation: 'brew_extra_select_label',
    });
    const r = doc?.itemRarity != null && doc.itemRarity !== '' ? doc.itemRarity : 1;
    rarityByKey.set(k, r);
  }
  return itemNames.map((name, i) => {
    const k = normalizeNameKey(name);
    const r = rarityByKey.get(k) ?? 1;
    const q = remainingQtyPerSlot[i];
    const base = `${name} · Qty: ${q} · rarity: ${r}`;
    if (base.length <= 100) return base;
    const shortName = name.length > 52 ? `${name.slice(0, 49)}…` : name;
    return `${shortName} · Qty: ${q} · rarity: ${r}`.slice(0, 100);
  });
}

/** One step of the sequential optional-extras flow (up to MAX_MIXER_EXTRAS picks). */
async function buildBrewMixerExtraStepView(
  sessionId,
  merged,
  inventory,
  partNames,
  critterNames,
  familyByCritterName,
  userId
) {
  const partName = merged.partName;
  const extraPicks = Array.isArray(merged.extraPicks) ? merged.extraPicks : [];
  const { itemNames: slots, remainingQtyPerSlot, menuOmittedCount, rarityByKey } = await buildMixerExtraSlots(
    inventory,
    merged.effectFamily,
    merged.critterName,
    partName,
    partNames,
    critterNames,
    familyByCritterName,
    extraPicks,
    userId
  );
  const step = extraPicks.length + 1;
  const famWord = capitalizeWords(String(merged.effectFamily || '').replace(/_/g, ' '));
  const hint = mixerPartStepHint(merged.effectFamily);
  const pickedSummary =
    extraPicks.length === 0 ? '_None yet._' : extraPicks.map((n) => `• **${n}**`).join('\n');

  const menuLimitNote =
    menuOmittedCount > 0
      ? `\n\n_Note: the dropdown can only show **25** ingredients. Order: **matching-element parts** → **${famWord}** critters → **Fairy / Mock Fairy** → **neutral** parts; within each, **highest rarity first**. **${menuOmittedCount}** other eligible type(s) in your bag aren’t shown._`
      : '';
  const menuSortNote =
    slots.length > 0 && menuOmittedCount === 0
      ? `\n\n_List order: **matching-element parts** → **${famWord}** critters → **Fairy / Mock Fairy** → **neutral** parts; **highest rarity** first in each group._`
      : '';

  const embed = new EmbedBuilder()
    .setTitle('🧪 Brew — mixer')
    .setDescription(
      `**${merged.characterName}** → **${merged.chosenElixirName}**\nCritter: **${merged.critterName}** · Main part: **${partName}**\n\n` +
        `**Optional extra — pick ${step} of ${MAX_MIXER_EXTRAS}**\nChoose **one** ingredient below, or **Brew now** to finish with your current extras.\n\n` +
        `Allowed: **monster parts** (**${hint}**) **or** **${famWord}** critters **or** **Fairy** / **Mock Fairy** (_adds a little heal when you drink the elixir — **Fairy** +2 hearts, **Mock Fairy** +1 per extra_).\n\n**Extras so far:**\n${pickedSummary}${menuSortNote}${menuLimitNote}`
    )
    .setColor(0x008b8b);

  const finishRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`brew-mixer-finish|${sessionId}`)
      .setLabel('Brew now')
      .setStyle(ButtonStyle.Primary)
  );

  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`brew-mixer-cancel|${sessionId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger)
  );

  if (!slots.length) {
    return { embed, components: [finishRow, cancelRow], slots };
  }

  const slotLabels = await buildMixerExtraSlotOptionLabels(slots, remainingQtyPerSlot, userId, rarityByKey);
  const extrasRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`brew-mixer-extra-slot|${sessionId}`)
      .setPlaceholder(`Choose one extra (${step} of ${MAX_MIXER_EXTRAS})…`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        slots.map((_, i) =>
          new StringSelectMenuOptionBuilder().setLabel(slotLabels[i]).setValue(String(i))
        )
      )
  );

  return { embed, components: [finishRow, extrasRow, cancelRow], slots };
}

/** First non–monster-part slot on the elixir catalog row (mixer seed / recipe display). */
function getCatalogRepresentativeCritterName(elixirItem) {
  if (!elixirItem || !Array.isArray(elixirItem.craftingMaterial)) return null;
  for (const mat of elixirItem.craftingMaterial) {
    const n = mat?.itemName;
    if (!n || typeof n !== 'string') continue;
    if (n.toLowerCase() === 'any monster part') continue;
    return n.trim();
  }
  return null;
}

/**
 * Auto-skip critter step when inventory only allows one choice (catalog critter or legacy single-family critter).
 */
function resolveAutoCritterName(critterChoices, catalogCritterName) {
  if (!critterChoices.length) return null;
  if (catalogCritterName && String(catalogCritterName).trim()) {
    const key = normalizeNameKey(catalogCritterName);
    const hit = critterChoices.find((c) => normalizeNameKey(c.value) === key);
    if (hit) return hit.value;
    return null;
  }
  if (critterChoices.length === 1) return critterChoices[0].value;
  return null;
}

function describeMixerPartRequirement(effectFamily) {
  const allowed = getAllowedPartElementsForFamily(effectFamily);
  if (allowed.length === 1 && allowed[0] === 'none') {
    return '**One** neutral/none monster part (`element`: **none**).';
  }
  if (allowed.length === 1) {
    return `**One** **${allowed[0]}**-element monster part.`;
  }
  const bits = allowed.map((e) => (e === 'none' ? '**neutral/none**' : `**${e}**-element`));
  return `**One** monster part — ${bits.join(' or ')}.`;
}

function mixerPartStepHint(effectFamily) {
  const a = getAllowedPartElementsForFamily(effectFamily);
  const el = (e) => (e === 'none' ? 'neutral/none' : e);
  if (a.length > 1) return a.map(el).join(' or ');
  return el(a[0]);
}

function allowedPartsPlainLabel(allowedEls) {
  return allowedEls.map((e) => (e === 'none' ? 'neutral/none' : e)).join(' or ');
}

/** Lines like `1 × **Warm Darner**` from item `craftingMaterial` (matches catalog / crafting UI). */
function formatCatalogMixerRecipeForEmbed(elixirItem) {
  if (!elixirItem || !Array.isArray(elixirItem.craftingMaterial) || !elixirItem.craftingMaterial.length) {
    return null;
  }
  const lines = [];
  for (const mat of elixirItem.craftingMaterial) {
    if (!mat?.itemName) continue;
    const q = typeof mat.quantity === 'number' && mat.quantity > 0 ? mat.quantity : 1;
    lines.push(`${q} × **${mat.itemName}**`);
  }
  return lines.length ? lines.join('\n') : null;
}

async function finalizeBrewMixerSession(interaction, session, critterName, partName, extraPartNames = []) {
  await ensureIngredientLabelsLoaded();

  const userId = interaction.user.id;

  const brewMixerErrFollowUp = async (payload) => {
    await stripBrewMixerEphemeralUi(interaction, '❌ Brew stopped. See the next message.');
    await interaction.followUp({ ...payload, flags: [MessageFlags.Ephemeral] });
  };

  let character = await fetchCharacterByNameAndUserId(session.characterName, userId);
  if (!character) {
    const { fetchModCharacterByNameAndUserId } = require('@/database/db');
    character = await fetchModCharacterByNameAndUserId(session.characterName, userId);
  }
  if (!character) {
    await brewMixerErrFollowUp({ content: '❌ Character not found.' });
    return;
  }

  const critterItem = await fetchItemByName(critterName, {
    commandName: 'crafting',
    userId,
    operation: 'brew_validate_critter',
  });
  const partItem = await fetchItemByName(partName, {
    commandName: 'crafting',
    userId,
    operation: 'brew_validate_part',
  });
  if (!critterItem || !partItem) {
    await brewMixerErrFollowUp({
      content: `❌ Could not load items **${critterName}** / **${partName}**.`,
    });
    return;
  }

  const elixirForCritterRule = await fetchItemByName(session.chosenElixirName, {
    commandName: 'crafting',
    userId,
    operation: 'brew_enforce_catalog_critter',
  });
  const catalogCritterRequired = getCatalogRepresentativeCritterName(elixirForCritterRule);
  if (
    catalogCritterRequired &&
    normalizeNameKey(critterItem.itemName) !== normalizeNameKey(catalogCritterRequired)
  ) {
    await brewMixerErrFollowUp({
      content: `❌ **${session.chosenElixirName}** requires **${catalogCritterRequired}** (catalog \`craftingMaterial\`). Your critter was **${critterItem.itemName}**.`,
    });
    return;
  }

  const pair = validateBrewPair({
    critterItem,
    partItem,
    critterName: critterItem.itemName,
    partName: partItem.itemName,
  });
  if (!pair.ok) {
    await brewMixerErrFollowUp({ content: `❌ ${pair.message}` });
    return;
  }

  if (normalizeNameKey(pair.elixirName) !== normalizeNameKey(session.chosenElixirName)) {
    await brewMixerErrFollowUp({
      content: `❌ That mix would make **${pair.elixirName}**, not **${session.chosenElixirName}**.`,
    });
    return;
  }

  const outputItem = await fetchItemByName(pair.elixirName, {
    commandName: 'crafting',
    userId,
    operation: 'brew_output',
  });
  if (!outputItem) {
    await brewMixerErrFollowUp({
      content: `❌ Output **${pair.elixirName}** not in database.`,
    });
    return;
  }

  if (!session.hasAllPerks && outputItem.witch !== true) {
    await brewMixerErrFollowUp({
      content: `❌ **${pair.elixirName}** is not Witch-craftable in the catalog.`,
    });
    return;
  }

  const extras = Array.isArray(extraPartNames) ? extraPartNames.filter(Boolean) : [];
  if (extras.length > MAX_MIXER_EXTRAS) {
    await brewMixerErrFollowUp({
      content: `❌ At most **${MAX_MIXER_EXTRAS}** optional parts per brew.`,
    });
    return;
  }

  const extraItems = [];
  for (const en of extras) {
    const pItem = await fetchItemByName(en, {
      commandName: 'crafting',
      userId,
      operation: 'brew_validate_extra',
    });
    if (!pItem) {
      await brewMixerErrFollowUp({
        content: `❌ Unknown extra part **${en}**.`,
      });
      return;
    }
    const ex = validateBrewExtraPart({
      partItem: pItem,
      partName: pItem.itemName,
      effectFamily: session.effectFamily,
    });
    if (!ex.ok) {
      await brewMixerErrFollowUp({ content: `❌ ${ex.message}` });
      return;
    }
    extraItems.push(pItem);
  }

  const staminaCost = parseStaminaToCraftBrew(outputItem.staminaToCraft);
  const fresh = await fetchCharacterByNameAndUserId(character.name, userId);
  if (!fresh) {
    await brewMixerErrFollowUp({ content: '❌ Character not found.' });
    return;
  }
  if ((fresh.currentStamina ?? 0) < staminaCost) {
    await brewMixerErrFollowUp({
      embeds: [
        new EmbedBuilder()
          .setTitle('❌ Not Enough Stamina')
          .setDescription(`**${fresh.name}** needs **${staminaCost}** stamina to brew.`),
      ],
    });
    return;
  }

  try {
    await removeItemInventoryDatabase(character._id, critterItem.itemName, 1, interaction, 'Elixir brew (critter)', {});
    await removeItemInventoryDatabase(character._id, partItem.itemName, 1, interaction, 'Elixir brew (part)', {});
    for (const p of extraItems) {
      await removeItemInventoryDatabase(character._id, p.itemName, 1, interaction, 'Elixir brew (extra part)', {});
    }
  } catch (invErr) {
    handleInteractionError(invErr, 'brewMixerHandler.js');
    await brewMixerErrFollowUp({
      content: `❌ **Could not remove ingredients:** ${invErr.message || invErr}`,
    });
    return;
  }

  let staminaAfter;
  try {
    staminaAfter = await checkAndUseStamina(fresh, staminaCost);
  } catch (stErr) {
    await addItemInventoryDatabase(character._id, critterItem.itemName, 1, interaction, 'Brew refund (stamina)');
    await addItemInventoryDatabase(character._id, partItem.itemName, 1, interaction, 'Brew refund (stamina)');
    for (const p of extraItems) {
      await addItemInventoryDatabase(character._id, p.itemName, 1, interaction, 'Brew refund (stamina)');
    }
    await brewMixerErrFollowUp({
      content: `❌ **Stamina error:** ${stErr.message || stErr}. Ingredients refunded.`,
    });
    return;
  }

  const levelRarityInputs = [
    critterItem.itemRarity,
    partItem.itemRarity,
    ...extraItems.map((p) => p.itemRarity),
  ];
  const synergyExtraCount = countMixerExtraSynergy(extraItems, session.effectFamily);
  const mixOutcome = mixerBrewOutcomeFromIngredientRarities(levelRarityInputs, { synergyExtraCount });
  const brewedElixirLevel = mixOutcome.elixirLevel;
  const fairyHealHearts = mixerFairyHealHeartsFromExtras(extraItems);
  const partR =
    partItem.itemRarity != null && partItem.itemRarity !== '' ? partItem.itemRarity : 1;
  const critR =
    critterItem.itemRarity != null && critterItem.itemRarity !== '' ? critterItem.itemRarity : 1;
  const tierNames = { 1: 'Basic', 2: 'Mid', 3: 'High' };
  const tierWord = tierNames[brewedElixirLevel] || String(brewedElixirLevel);
  const extrasForLog =
    extraItems.length === 0
      ? 'none'
      : extraItems
          .map((p) => {
            const er = p.itemRarity != null && p.itemRarity !== '' ? p.itemRarity : 1;
            return `${p.itemName} (rarity ${er})`;
          })
          .join(', ');
  const pct = (w) => Math.round(w * 100);
  const avgStr = Number(mixOutcome.avgR.toFixed(2));
  const blendStr = Number(mixOutcome.blendRaw.toFixed(2));
  const synStr = Number(mixOutcome.synergyRaw.toFixed(2));
  info(
    'BREW',
    [
      `Mixer elixir level → **${brewedElixirLevel}** (${tierWord}) for **${character.name}** / output **${outputItem.itemName}**`,
      `  Potency: **${pct(MIXER_POTENCY_WEIGHT_MAX)}%** peak + **${pct(MIXER_POTENCY_WEIGHT_AVG)}%** mean + **${pct(MIXER_POTENCY_WEIGHT_MIN)}%** min (rarity 1–10 each, floored); **+${MIXER_SYNERGY_BONUS_PER_EXTRA}** raw per on-theme extra (cap **${MIXER_SYNERGY_BONUS_MAX}**) — same-family critter extra or thread-element part extra; then round → 1–3 Basic, 4–6 Mid, 7–10 High.`,
      `  Critter: **${critterItem.itemName}** (rarity **${critR}**)`,
      `  Main part: **${partItem.itemName}** (rarity **${partR}**)`,
      `  Extras: ${extrasForLog}`,
      `  On-theme extras (synergy): **${mixOutcome.synergyExtraCount}**`,
      `  Score **${mixOutcome.combinedRounded}** (blend **${blendStr}** + synergy **${synStr}**; peak **${mixOutcome.maxR}**, mean **${avgStr}**, min **${mixOutcome.minR}**; **${mixOutcome.ingredientCount}** ingredients, sum **${mixOutcome.sum}**) → elixirLevel **${brewedElixirLevel}**`,
      fairyHealHearts > 0
        ? `  Fairy mix-in: **+${fairyHealHearts}** heart(s) on use (\`modifierHearts\` on inventory row).`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  const brewAddOptions = { elixirLevel: brewedElixirLevel };
  if (fairyHealHearts > 0) {
    brewAddOptions.modifierHearts = fairyHealHearts;
  }
  await addItemInventoryDatabase(character._id, outputItem.itemName, 1, interaction, 'Elixir brew', brewAddOptions);

  const materialsUsed = [
    { itemName: critterItem.itemName, quantity: 1 },
    { itemName: partItem.itemName, quantity: 1 },
    ...extraItems.map((p) => ({ itemName: p.itemName, quantity: 1 })),
  ];
  const jobForFlavor =
    character.jobVoucher && character.jobVoucherJob ? character.jobVoucherJob : character.job;

  const levelLine = formatElixirLevelForCraftingEmbed(brewedElixirLevel);
  const synergyEmbed =
    mixOutcome.synergyExtraCount > 0
      ? ` **+${synStr}** synergy (**${mixOutcome.synergyExtraCount}** themed extra${mixOutcome.synergyExtraCount === 1 ? '' : 's'}).`
      : '';
  const fairyEmbed =
    fairyHealHearts > 0
      ? ` **+${fairyHealHearts}** heart(s) when used (Fairy mix-in).`
      : '';
  const brewedElixirLevelValue = levelLine
    ? `> ${levelLine}\n_Blended potency **${mixOutcome.combinedRounded}** — **${pct(MIXER_POTENCY_WEIGHT_MAX)}/${pct(MIXER_POTENCY_WEIGHT_AVG)}/${pct(MIXER_POTENCY_WEIGHT_MIN)}** peak/mean/weakest (**${mixOutcome.maxR}** / **${avgStr}** / **${mixOutcome.minR}**).${synergyEmbed}${fairyEmbed}_`
    : null;

  let brewEmbed;
  try {
    brewEmbed = await createCraftingEmbed(
      outputItem,
      character,
      '',
      materialsUsed,
      1,
      staminaCost,
      staminaAfter,
      jobForFlavor,
      null,
      0,
      [],
      null,
      brewedElixirLevelValue
    );
  } catch (embedErr) {
    handleInteractionError(embedErr, 'brewMixerHandler.js');
    brewEmbed = new EmbedBuilder()
      .setColor(0xaa926a)
      .setTitle(`🧪 ${character.name} brewed ${outputItem.itemName}`)
      .setDescription(
        `Mixer: **${critterItem.itemName}** + **${partItem.itemName}**` +
          (extraItems.length ? ` + ${extraItems.map((p) => `**${p.itemName}**`).join(', ')}` : '') +
          `.`
      );
    if (brewedElixirLevelValue) {
      brewEmbed.addFields({
        name: '🧪 **__Elixir Level__**',
        value: brewedElixirLevelValue,
        inline: false,
      });
    }
  }

  await completeBrewMixerEphemeralUi(interaction, {
    characterName: character.name,
    itemName: outputItem.itemName,
  });
  await interaction.followUp({ embeds: [brewEmbed], ephemeral: false });
}

async function runCraftingBrew(interaction) {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  await connectToTinglebot();

  const userId = interaction.user.id;
  const characterName = interaction.options.getString('charactername');
  const chosenElixirName = cleanBrewOptionItemName(interaction.options.getString('elixir'));

  const villageChannels = {
    Rudania: process.env.RUDANIA_TOWNHALL,
    Inariko: process.env.INARIKO_TOWNHALL,
    Vhintl: process.env.VHINTL_TOWNHALL,
  };

  try {
    await ensureIngredientLabelsLoaded();

    let character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      const { fetchModCharacterByNameAndUserId } = require('@/database/db');
      character = await fetchModCharacterByNameAndUserId(characterName, userId);
    }
    if (!character) {
      return interaction.editReply({
        content: `❌ **Character "${characterName}" not found or does not belong to you.**`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    if (await enforceJail(interaction, character)) return;

    await checkInventorySync(character);

    let currentVillage = capitalizeWords(character.currentVillage);
    let allowedChannel = villageChannels[currentVillage];
    if (character.jobVoucher && character.jobVoucherJob) {
      const perk = getJobPerk(character.jobVoucherJob);
      if (perk && perk.village) {
        currentVillage = capitalizeWords(perk.village);
        allowedChannel = villageChannels[currentVillage];
      }
    }

    const testingChannelId = '1391812848099004578';
    const isTestingChannel =
      interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;

    if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
      const channelMention = `<#${allowedChannel}>`;
      return interaction.editReply({
        embeds: [
          {
            color: 0x008b8b,
            description: `*${character.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only brew in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(character.currentVillage)}\n💬 **Allowed in:** ${channelMention}`,
            image: { url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png' },
            footer: { text: 'Channel Restriction' },
          },
        ],
        flags: [MessageFlags.Ephemeral],
      });
    }

    let job = character.jobVoucher && character.jobVoucherJob ? character.jobVoucherJob : character.job;
    const jobPerk = getJobPerk(job);
    const hasAllPerks = jobPerk && jobPerk.perks && jobPerk.perks.includes('ALL');
    if (!jobPerk || (!hasAllPerks && !jobPerk.perks.includes('CRAFTING'))) {
      const err = getJobVoucherErrorMessage('MISSING_SKILLS', {
        characterName: character.name,
        jobName: job || 'Unknown',
        activity: 'crafting',
      });
      return interaction.editReply({ embeds: [err.embed], flags: [MessageFlags.Ephemeral] });
    }

    const chosenFamily = elixirNameToEffectFamily(chosenElixirName);
    if (!chosenFamily) {
      return interaction.editReply({
        content: `❌ **${chosenElixirName || 'That'}** is not a mixer elixir. Pick one from the elixir list (autocomplete).`,
        flags: [MessageFlags.Ephemeral],
      });
    }

    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventory = await inventoryCollection.find({ quantity: { $gte: 1 } }).toArray();
    const elixirCatalog = await fetchItemByName(chosenElixirName, {
      commandName: 'crafting',
      userId,
      operation: 'brew_catalog_critter',
    });
    const catalogCritter = getCatalogRepresentativeCritterName(elixirCatalog);
    const { familyByCritterName, partNames } = getIngredientLabelSets();
    const critterChoices = buildMixerCritterOptions(inventory, catalogCritter, chosenFamily, familyByCritterName);

    if (critterChoices.length === 0) {
      const recipeBlock = formatCatalogMixerRecipeForEmbed(elixirCatalog);
      const recipeValue =
        recipeBlock ||
        `_(No critter + **Any Monster Part** on this elixir’s \`craftingMaterial\` — fix the catalog row.)_`;
      const partRule = describeMixerPartRequirement(chosenFamily);
      const desc =
        catalogCritter != null && String(catalogCritter).trim()
          ? `**${character.name}** needs **${catalogCritter}** in inventory to brew **${chosenElixirName}**.`
          : `**${character.name}** can’t brew **${chosenElixirName}** yet — this elixir’s catalog recipe has no critter line (staff: check \`craftingMaterial\`).`;
      const noCritterEmbed = new EmbedBuilder()
        .setTitle('❌ Can’t brew yet')
        .setDescription(desc)
        .addFields(
          { name: 'Recipe', value: recipeValue, inline: false },
          { name: 'Monster part', value: partRule, inline: false }
        )
        .setColor(0xe74c3c)
        .setImage(EMBED_BORDER_IMAGE_URL)
        .setFooter({
          text: catalogCritter
            ? `Add **${catalogCritter}** to inventory, then /crafting brew.`
            : 'Fix the catalog row or inventory, then try again.',
        })
        .setTimestamp();
      return interaction.editReply({ embeds: [noCritterEmbed], flags: [MessageFlags.Ephemeral] });
    }
    const autoCritterName = resolveAutoCritterName(critterChoices, catalogCritter);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const sessionData = {
      userId,
      characterId: String(character._id),
      characterName: character.name,
      chosenElixirName,
      effectFamily: chosenFamily,
      hasAllPerks,
    };
    if (autoCritterName) sessionData.critterName = autoCritterName;

    await TempData.findOneAndUpdate(
      { type: 'brewMixerSession', key: sessionId },
      {
        type: 'brewMixerSession',
        key: sessionId,
        data: sessionData,
        expiresAt,
      },
      { upsert: true }
    );

    const allowedPartEls = getAllowedPartElementsForFamily(chosenFamily);
    const partHint =
      allowedPartEls.length > 1
        ? `${allowedPartEls.map((e) => (e === 'none' ? 'neutral/none' : `${e}-aligned`)).join(' or ')} monster part`
        : allowedPartEls[0] === 'none'
          ? 'neutral/none monster part (`element`: **none** — e.g. Chuchu Jelly, horns)'
          : `**${allowedPartEls[0]}**-aligned part (see mixer element table)`;

    const cancelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`brew-mixer-cancel|${sessionId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    if (autoCritterName) {
      const partChoices = await buildPartOptions(inventory, allowedPartEls, partNames, userId, chosenFamily);
      if (partChoices.length === 0) {
        await TempData.findOneAndDelete({ type: 'brewMixerSession', key: sessionId });
        return interaction.editReply({
          content: `❌ No **${allowedPartsPlainLabel(allowedPartEls)}** monster parts in **${character.name}**’s inventory for **${chosenElixirName}**. Gather a matching part, then try again.`,
          flags: [MessageFlags.Ephemeral],
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('🧪 Brew — mixer')
        .setDescription(
          `**${character.name}** → **${chosenElixirName}**\nCritter: **${autoCritterName}**\n\n**Step 2:** Pick the **monster part** (${mixerPartStepHint(chosenFamily)}).`
        )
        .setColor(0x008b8b);

      const partRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`brew-mixer-part|${sessionId}`)
          .setPlaceholder('Select a monster part')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            partChoices.map((o) =>
              new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)
            )
          )
      );

      return interaction.editReply({
        embeds: [embed],
        components: [partRow, cancelRow],
        flags: [MessageFlags.Ephemeral],
      });
    }

    const step1Line =
      catalogCritter != null && String(catalogCritter).trim()
        ? `**Step 1:** Select **${catalogCritter}** (must match catalog \`craftingMaterial\`).`
        : '**Step 1:** Choose the **critter** for this elixir (no critter line on catalog — legacy family list).';
    const embed = new EmbedBuilder()
      .setTitle('🧪 Brew — mixer')
      .setDescription(
        `**${character.name}** → **${chosenElixirName}**\n\n${step1Line}\n**Step 2:** Choose the **monster part** (${partHint}).`
      )
      .setColor(0x008b8b);

    const critterRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`brew-mixer-critter|${sessionId}`)
        .setPlaceholder('Select a critter from inventory')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          critterChoices.map((o) =>
            new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)
          )
        )
    );

    return interaction.editReply({
      embeds: [embed],
      components: [critterRow, cancelRow],
      flags: [MessageFlags.Ephemeral],
    });
  } catch (error) {
    handleInteractionError(error, 'brewMixerHandler.js');
    const msg = error?.message || String(error);
    try {
      await interaction.editReply({ content: `❌ **Brew failed:** ${msg}`, flags: [MessageFlags.Ephemeral] });
    } catch (_) {}
  }
}

async function handleBrewMixerInteraction(interaction) {
  const parts = interaction.customId.split('|');
  const kind = parts[0];
  const sessionId = parts[1];
  if (!sessionId) {
    return interaction.reply({ content: '❌ Invalid brew session.', flags: [MessageFlags.Ephemeral] });
  }

  await connectToTinglebot();
  const doc = await TempData.findByTypeAndKey('brewMixerSession', sessionId);
  if (!doc || !doc.data) {
    return interaction.reply({
      content: '❌ **Brew session expired.** Run `/crafting brew` again.',
      flags: [MessageFlags.Ephemeral],
    });
  }
  const session = doc.data;
  if (session.userId !== interaction.user.id) {
    return interaction.reply({ content: '❌ This brew is not yours.', flags: [MessageFlags.Ephemeral] });
  }

  if (kind === 'brew-mixer-cancel') {
    await TempData.findOneAndDelete({ type: 'brewMixerSession', key: sessionId });
    const cancelEmbed = buildBrewMixerCanceledEmbed(session);
    if (interaction.isButton()) {
      return interaction.update({ content: '', embeds: [cancelEmbed], components: [] });
    }
    return interaction.reply({ embeds: [cancelEmbed], flags: [MessageFlags.Ephemeral] });
  }

  // Acknowledge before inventory / N× item lookups — avoids "Unknown interaction" (3s limit).
  await interaction.deferUpdate();

  await ensureIngredientLabelsLoaded();

  const inventoryCollection = await getCharacterInventoryCollection(session.characterName);
  const inventory = await inventoryCollection.find({ quantity: { $gte: 1 } }).toArray();
  const { partNames, critterNames, familyByCritterName } = getIngredientLabelSets();
  const allowedPartEls = getAllowedPartElementsForFamily(session.effectFamily);

  if (kind === 'brew-mixer-critter' && interaction.isStringSelectMenu()) {
    const critterName = interaction.values[0];
    await TempData.findOneAndUpdate(
      { type: 'brewMixerSession', key: sessionId },
      { $set: { 'data.critterName': critterName } }
    );

    const partChoices = await buildPartOptions(
      inventory,
      allowedPartEls,
      partNames,
      interaction.user.id,
      session.effectFamily
    );
    if (partChoices.length === 0) {
      await TempData.findOneAndDelete({ type: 'brewMixerSession', key: sessionId });
      return interaction.editReply({
        content: `❌ No **${allowedPartsPlainLabel(allowedPartEls)}** monster parts in inventory for **${session.chosenElixirName}**. Gather a matching part, then try again.`,
        embeds: [],
        components: [],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('🧪 Brew — mixer')
      .setDescription(
        `**${session.characterName}** → **${session.chosenElixirName}**\nCritter: **${critterName}**\n\n**Step 2:** Pick the **monster part** (${mixerPartStepHint(session.effectFamily)}).`
      )
      .setColor(0x008b8b);

    const partRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`brew-mixer-part|${sessionId}`)
        .setPlaceholder('Select a monster part')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          partChoices.map((o) =>
            new StringSelectMenuOptionBuilder().setLabel(o.label).setValue(o.value)
          )
        )
    );
    const cancelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`brew-mixer-cancel|${sessionId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({ embeds: [embed], components: [partRow, cancelRow] });
  }

  if (kind === 'brew-mixer-part' && interaction.isStringSelectMenu()) {
    const partName = interaction.values[0];
    const mergedPre = { ...session, partName, extraPicks: [] };
    const { embed, components, slots: extraSlots } = await buildBrewMixerExtraStepView(
      sessionId,
      mergedPre,
      inventory,
      partNames,
      critterNames,
      familyByCritterName,
      interaction.user.id
    );

    if (!extraSlots.length) {
      await TempData.findOneAndDelete({ type: 'brewMixerSession', key: sessionId });
      return finalizeBrewMixerSession(interaction, mergedPre, mergedPre.critterName, partName, []);
    }

    await TempData.findOneAndUpdate(
      { type: 'brewMixerSession', key: sessionId },
      {
        $set: {
          'data.partName': partName,
          'data.extraPicks': [],
          'data.extraPickerSlots': extraSlots,
        },
      }
    );

    return interaction.editReply({ embeds: [embed], components });
  }

  if (kind === 'brew-mixer-finish' && interaction.isButton()) {
    const fresh = await TempData.findByTypeAndKey('brewMixerSession', sessionId);
    const s = fresh?.data;
    if (!s?.critterName || !s?.partName) {
      return interaction.editReply({
        content: '❌ **Brew session expired.** Run `/crafting brew` again.',
        embeds: [],
        components: [],
      });
    }
    const picks = Array.isArray(s.extraPicks) ? s.extraPicks : [];
    await TempData.findOneAndDelete({ type: 'brewMixerSession', key: sessionId });
    return finalizeBrewMixerSession(interaction, s, s.critterName, s.partName, picks);
  }

  if (kind === 'brew-mixer-extra-slot' && interaction.isStringSelectMenu()) {
    const fresh = await TempData.findByTypeAndKey('brewMixerSession', sessionId);
    const s = fresh?.data;
    if (!s?.critterName || !s?.partName) {
      return interaction.editReply({
        content: '❌ **Brew session expired.** Run `/crafting brew` again.',
        embeds: [],
        components: [],
      });
    }
    const slotsShown = Array.isArray(s.extraPickerSlots) ? s.extraPickerSlots : [];
    const idx = parseInt(interaction.values[0], 10);
    if (!Number.isFinite(idx) || idx < 0 || idx >= slotsShown.length) {
      return interaction.editReply({
        content: '❌ That choice is no longer valid. Use the current brew menu or run `/crafting brew` again.',
        embeds: [],
        components: [],
      });
    }
    const itemName = slotsShown[idx];
    const extraPicks = [...(Array.isArray(s.extraPicks) ? s.extraPicks : []), itemName];

    if (extraPicks.length >= MAX_MIXER_EXTRAS) {
      await TempData.findOneAndDelete({ type: 'brewMixerSession', key: sessionId });
      return finalizeBrewMixerSession(interaction, { ...s, extraPicks }, s.critterName, s.partName, extraPicks);
    }

    const mergedNext = { ...s, partName: s.partName, extraPicks };
    const { embed, components, slots: nextSlots } = await buildBrewMixerExtraStepView(
      sessionId,
      mergedNext,
      inventory,
      partNames,
      critterNames,
      familyByCritterName,
      interaction.user.id
    );

    await TempData.findOneAndUpdate(
      { type: 'brewMixerSession', key: sessionId },
      { $set: { 'data.extraPicks': extraPicks, 'data.extraPickerSlots': nextSlots } }
    );

    return interaction.editReply({ embeds: [embed], components });
  }

  if (kind === 'brew-mixer-skip' || kind === 'brew-mixer-fairy-open' || kind === 'brew-mixer-fairy') {
    return interaction.editReply({
      content: '❌ That brew step is no longer used. Run `/crafting brew` again.',
      embeds: [],
      components: [],
    });
  }

  return interaction.editReply({
    content: '❌ Unsupported brew action.',
    embeds: [],
    components: [],
  });
}

module.exports = {
  runCraftingBrew,
  handleBrewMixerInteraction,
  cleanBrewOptionItemName,
  parseStaminaToCraftBrew,
};
