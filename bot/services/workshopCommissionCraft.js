'use strict';

const path = require('path');
const mongoose = require('mongoose');
const moduleAlias = require('module-alias');
moduleAlias.addAlias('@', path.resolve(__dirname, '..'));

/**
 * Workshop commission craft — dashboard accept flow.
 * Materials from commissioner OC; stamina from crafter; crafted items go to commissioner.
 * Mirrors /crafting recipe boosts, village rolls, Teacher/Entertainer/Fortune Teller, job vouchers.
 */

const generalCategories = require('../models/GeneralItemCategories');
const { Village } = require('../models/VillageModel');
const Character = require('../models/CharacterModel');
const ModCharacter = require('../models/ModCharacterModel');

const {
  connectToTinglebot,
  fetchCharacterById,
  fetchModCharacterById,
  fetchCharacterByName,
  fetchCharacterByNameAndUserId,
  fetchModCharacterByNameAndUserId,
  getCharacterInventoryCollection,
  fetchItemByName,
} = require('../database/db');

const { checkAndUseStamina } = require('../modules/characterStatsModule');
const { getJobPerk, isVillageExclusiveJob } = require('../modules/jobsModule');
const {
  validateJobVoucher,
  activateJobVoucher,
  fetchJobVoucherItem,
  deactivateJobVoucher,
} = require('../modules/jobVoucherModule');
const { capitalizeWords } = require('../modules/formattingModule');
const {
  applyCraftingStaminaBoost,
  applyCraftingMaterialBoost,
  applyCraftingQuantityBoost,
} = require('../modules/boostIntegration');
const {
  clearBoostAfterUse,
  getEffectiveJob,
  isBoosterUsingVoucherForJob,
  retrieveBoostingRequestFromTempDataByCharacter,
} = require('../commands/jobs/boosting');

const { addItemInventoryDatabase, processMaterials } = require('../utils/inventoryUtils');
const { info, error: logError } = require('../utils/logger');
const { isElixirItemName, isMixerOutputElixirName } = require('../modules/elixirModule');
const Item = require('../models/ItemModel');
const {
  ensureIngredientLabelsLoaded,
  elixirNameToEffectFamily,
  getIngredientLabelSets,
  getAllowedPartElementsForFamily,
  resolvePartElementForMixer,
  isMixerUniversalFairyCritterName,
  isExcludedMixerItem,
  normalizeNameKey,
} = require('../modules/elixirBrewModule');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseBaseStaminaToCraft(item) {
  const v = item?.staminaToCraft;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, v);
  if (v && typeof v === 'object' && v.base != null) {
    const n = Number(v.base);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function itemMatchesRecipeLine(itemName, lineName) {
  if (generalCategories[lineName]) {
    return generalCategories[lineName].includes(itemName);
  }
  return String(itemName).toLowerCase() === String(lineName).toLowerCase();
}

function normalizedInventoryItemNameForRecipeMatch(itemName) {
  return String(itemName ?? '')
    .trim()
    .replace(/\s*\[[^\]]+\]\s*$/i, '')
    .trim();
}

/** Align with /crafting brew: 1 critter + 1 part + up to 3 extras. */
const MIXER_BREW_MAX_INGREDIENT_UNITS = 5;
const MIXER_BREW_MAX_EXTRAS = 3;

function mergeMixerCommissionSelections(selections) {
  const map = new Map();
  for (const sel of selections || []) {
    const id = String(sel.inventoryDocumentId ?? '').trim();
    const mq = Math.floor(Number(sel.maxQuantity));
    if (!id || !Number.isFinite(mq) || mq < 1) continue;
    map.set(id, (map.get(id) || 0) + mq);
  }
  return Array.from(map.entries()).map(([inventoryDocumentId, maxQuantity]) => ({
    inventoryDocumentId,
    maxQuantity,
  }));
}

function mixerRecipeMinimumUnits(mats) {
  let n = 0;
  for (const m of mats || []) {
    const q = Math.floor(Number(m.quantity));
    if (Number.isFinite(q) && q > 0) n += q;
  }
  return n;
}

function stackMatchesAnyRecipeLine(itemName, craftingMaterial) {
  const base = normalizedInventoryItemNameForRecipeMatch(itemName);
  const mats = Array.isArray(craftingMaterial) ? craftingMaterial : [];
  return mats.some((m) => itemMatchesRecipeLine(base, String(m?.itemName ?? '').trim()));
}

function inventoryNormLookupKey(name) {
  return normalizeNameKey(normalizedInventoryItemNameForRecipeMatch(name));
}

/**
 * Batch-fetch Item rows for commissioner inventory labels (normalized name keys).
 * @param {string[]} inventoryItemLabels
 */
async function fetchItemDocsByInventoryLabels(inventoryItemLabels) {
  const canonicalByLower = new Map();
  for (const raw of inventoryItemLabels) {
    const base = normalizedInventoryItemNameForRecipeMatch(raw);
    const low = base.toLowerCase();
    if (!canonicalByLower.has(low)) canonicalByLower.set(low, base);
  }
  if (!canonicalByLower.size) return new Map();

  const $or = [...canonicalByLower.values()].map((canonical) => ({
    itemName: new RegExp(`^${escapeRegex(canonical)}$`, 'i'),
  }));
  const docs = await Item.find({ $or }).select('itemName effectFamily element').lean();
  const map = new Map();
  for (const d of docs) {
    if (!d.itemName) continue;
    map.set(inventoryNormLookupKey(d.itemName), d);
  }
  return map;
}

/**
 * Recipe line match OR `/crafting brew`-style extra (same family critter, allowed part, fairy).
 */
function stackEligibleForMixerCommission(itemName, craftingMaterial, craftItemName, itemDoc) {
  if (stackMatchesAnyRecipeLine(itemName, craftingMaterial)) return true;

  const brewFam = elixirNameToEffectFamily(craftItemName);
  if (!brewFam) return false;

  if (isExcludedMixerItem(itemName)) return false;
  if (isMixerUniversalFairyCritterName(itemName)) return true;

  const { critterNames, partNames, familyByCritterName } = getIngredientLabelSets();
  const nameKey = inventoryNormLookupKey(itemName);

  const partListed = [...partNames].some((n) => normalizeNameKey(n) === nameKey);
  const critterListed = [...critterNames].some((n) => normalizeNameKey(n) === nameKey);

  if (!itemDoc || !itemDoc.itemName) return false;

  if (partListed) {
    const allowed = getAllowedPartElementsForFamily(brewFam);
    const actual = resolvePartElementForMixer(itemDoc, itemName);
    return allowed.includes(actual);
  }

  if (critterListed) {
    const famFromDb =
      itemDoc.effectFamily != null ? String(itemDoc.effectFamily).trim().toLowerCase() : '';
    const fam = famFromDb || familyByCritterName.get(nameKey) || '';
    return fam === String(brewFam).trim().toLowerCase();
  }

  return false;
}

/**
 * Commissioner-chosen stacks for mixer elixirs; consumes only what the boost-adjusted recipe needs per line.
 */
async function planAndApplyElixirCommissionRemovals({
  selections,
  commissioner,
  invCollection,
  adjustedCraftingMaterials,
  baseCraftingMaterials,
  quantity,
  craftItemName,
}) {
  const charId = commissioner._id;
  const resolved = [];
  const baseMats = Array.isArray(baseCraftingMaterials) ? baseCraftingMaterials : [];
  const mergedSels = mergeMixerCommissionSelections(selections);

  let sumMaxQty = 0;
  for (const sel of mergedSels) {
    const maxQ = Math.floor(Number(sel.maxQuantity));
    if (!Number.isFinite(maxQ) || maxQ < 1) {
      return {
        ok: false,
        error:
          'Mixer commission: each stack entry needs a positive maxQuantity (whole number). Ask the commissioner to re-save stack choices from the dashboard.',
      };
    }
    sumMaxQty += maxQ;
  }
  if (sumMaxQty > MIXER_BREW_MAX_INGREDIENT_UNITS) {
    return {
      ok: false,
      error: `Mixer commission: at most ${MIXER_BREW_MAX_INGREDIENT_UNITS} total units per brew (1 critter + 1 part + up to ${MIXER_BREW_MAX_EXTRAS} extras). Saved commitments sum to ${sumMaxQty}. Commissioner must edit the request.`,
    };
  }

  const recipeMin = mixerRecipeMinimumUnits(baseMats);
  if (recipeMin > 0 && sumMaxQty < recipeMin) {
    return {
      ok: false,
      error: `Mixer commission: commitments sum to ${sumMaxQty} but the catalog recipe needs at least ${recipeMin} unit(s) across its lines. Commissioner should add stacks or raise quantities (max ${MIXER_BREW_MAX_INGREDIENT_UNITS} total).`,
    };
  }

  await ensureIngredientLabelsLoaded();

  const prepass = [];
  for (const sel of mergedSels) {
    const maxQ = Math.floor(Number(sel.maxQuantity));
    let docId;
    try {
      docId = new mongoose.Types.ObjectId(String(sel.inventoryDocumentId));
    } catch {
      return {
        ok: false,
        error:
          'Invalid inventoryDocumentId in saved elixir selections. Commissioner should pick stacks again from the workshop form.',
      };
    }
    const row = await invCollection.findOne({ _id: docId, characterId: charId });
    if (!row) {
      return {
        ok: false,
        error:
          'A chosen inventory stack is missing or no longer on the commissioner OC (inventory changed or wrong character). Commissioner should refresh stacks and edit the request.',
      };
    }
    const stackQty = Math.floor(Number(row.quantity)) || 0;
    if (maxQ > stackQty) {
      return {
        ok: false,
        error: `Commission saved ${maxQ}× "${row.itemName}" but that stack only has ${stackQty}. Commissioner should lower the amount or restock, then edit the request.`,
      };
    }
    if (maxQ < 1) {
      return { ok: false, error: `No quantity available on the selected stack (${row.itemName}).` };
    }
    prepass.push({ docId, row, maxQ });
  }

  const itemDocMap = await fetchItemDocsByInventoryLabels(prepass.map((p) => p.row.itemName));

  for (const p of prepass) {
    const doc = itemDocMap.get(inventoryNormLookupKey(p.row.itemName)) ?? null;
    if (!stackEligibleForMixerCommission(p.row.itemName, baseMats, craftItemName, doc)) {
      return {
        ok: false,
        error: `Stack "${p.row.itemName}" is not valid for this mixer commission (recipe lines, same-effect critters, allowed parts, or Fairy / Mock Fairy — same rules as /crafting brew). Commissioner should edit stack choices.`,
      };
    }
    resolved.push({
      docId: p.docId,
      itemName: p.row.itemName,
      qtyLeft: p.maxQ,
    });
  }

  const removalsByDoc = new Map();
  const recordTake = (docId, itemName, take) => {
    if (take <= 0) return;
    const k = String(docId);
    const prev = removalsByDoc.get(k) || { docId, itemName, quantity: 0 };
    prev.quantity += take;
    removalsByDoc.set(k, prev);
  };

  for (const mat of adjustedCraftingMaterials) {
    const need = mat.quantity * quantity;
    let rem = need;
    for (const entry of resolved) {
      if (rem <= 0) break;
      if (entry.qtyLeft <= 0) continue;
      if (
        !itemMatchesRecipeLine(normalizedInventoryItemNameForRecipeMatch(entry.itemName), mat.itemName)
      )
        continue;
      const take = Math.min(rem, entry.qtyLeft);
      entry.qtyLeft -= take;
      rem -= take;
      recordTake(entry.docId, entry.itemName, take);
    }
    if (rem > 0) {
      return {
        ok: false,
        error: `After Scholar/village material rolls, this brew still needs ${need}× "${mat.itemName}" (short by ${rem}). Chosen stacks don't cover every recipe line — commissioner should add matching materials or edit stack amounts (up to ${MIXER_BREW_MAX_INGREDIENT_UNITS} units; extras may repeat the same stack).`,
      };
    }
  }

  const materialsUsed = [];
  for (const r of removalsByDoc.values()) {
    materialsUsed.push({ itemName: r.itemName, quantity: r.quantity, _id: r.docId });
  }

  for (const r of removalsByDoc.values()) {
    await invCollection.updateOne({ _id: r.docId }, { $inc: { quantity: -r.quantity } });
    const after = await invCollection.findOne({ _id: r.docId });
    if (after && (after.quantity || 0) <= 0) {
      await invCollection.deleteOne({ _id: r.docId });
    }
  }

  return { ok: true, materialsUsed };
}

function craftingStaminaLogContext(character, itemName, { refund = false } = {}) {
  if (refund) {
    return { source: 'Workshop commission craft refund', itemName: itemName || null };
  }
  return {
    source: character?.jobVoucher ? 'Workshop commission (Job Voucher)' : 'Workshop commission',
    itemName: itemName || null,
    jobVoucher: !!character?.jobVoucher,
    job: character?.jobVoucherJob || character?.job || null,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.crafterUserId
 * @param {string} opts.crafterCharacterId
 * @param {string} opts.commissionerDiscordId
 * @param {string} opts.commissionerCharacterName
 * @param {string} opts.craftItemName
 * @param {number|null|undefined} opts.elixirTier
 * @param {Array<{ inventoryDocumentId: unknown, maxQuantity: unknown }>=} opts.elixirMaterialSelections — required for mixer elixirs (from commission doc)
 */
async function executeWorkshopCommissionCraft(opts) {
  const {
    crafterUserId,
    crafterCharacterId,
    commissionerDiscordId,
    commissionerCharacterName,
    craftItemName,
    elixirTier,
    elixirMaterialSelections: elixirMaterialSelectionsOpt,
  } = opts;
  const elixirMaterialSelections = Array.isArray(elixirMaterialSelectionsOpt) ? elixirMaterialSelectionsOpt : [];

  const quantity = 1;
  const itemName = String(craftItemName || '').trim();

  await connectToTinglebot();

  let crafter = await fetchCharacterById(crafterCharacterId);
  if (!crafter) crafter = await fetchModCharacterById(crafterCharacterId);
  if (!crafter || String(crafter.userId) !== String(crafterUserId)) {
    return { ok: false, code: 'CRAFTER', error: 'Crafter character not found or not owned by accepting user.' };
  }

  const nameRe = new RegExp(`^${escapeRegex(String(commissionerCharacterName).trim())}$`, 'i');
  let commissioner = await Character.findOne({ userId: commissionerDiscordId, name: nameRe });
  if (!commissioner) commissioner = await ModCharacter.findOne({ userId: commissionerDiscordId, name: nameRe });
  if (!commissioner) {
    return { ok: false, code: 'COMMISSIONER', error: 'Commissioner character not found.' };
  }

  if (commissioner.inJail) {
    return { ok: false, code: 'JAIL', error: 'Commissioner OC is in jail; commission cannot complete.' };
  }
  if (crafter.inJail) {
    return { ok: false, code: 'JAIL', error: 'Your OC is in jail and cannot craft.' };
  }

  if (crafter.debuff?.active) {
    const debuffEndDate = new Date(crafter.debuff.endDate);
    if (debuffEndDate > new Date()) {
      return { ok: false, code: 'DEBUFF', error: `${crafter.name} is debuffed and cannot craft.` };
    }
    crafter.debuff.active = false;
    crafter.debuff.endDate = null;
    await crafter.save();
  }

  const item = await fetchItemByName(itemName, { operation: 'workshop_commission' });
  if (!item || !item.crafting) {
    return { ok: false, code: 'ITEM', error: 'Item not found or not craftable.' };
  }

  const baseStaminaRecipe = parseBaseStaminaToCraft(item);

  const jobResolved = crafter.jobVoucher && crafter.jobVoucherJob ? crafter.jobVoucherJob : crafter.job;
  const jobNormalizedEarly = jobResolved ? String(jobResolved).trim() : '';
  const jobLowerEarly = jobNormalizedEarly.toLowerCase();

  if (isElixirItemName(item.itemName) && jobLowerEarly === 'witch') {
    return {
      ok: false,
      code: 'WITCH_ELIXIR',
      error:
        'Witch elixirs must be brewed with /crafting brew in Discord; this workshop commission cannot auto-complete that recipe.',
    };
  }

  const jobPerk = getJobPerk(jobNormalizedEarly);
  if (!jobPerk) {
    return { ok: false, code: 'JOB', error: `No job perks for ${jobNormalizedEarly}.` };
  }
  const hasAllPerks = jobPerk.perks.includes('ALL');
  if (!hasAllPerks && !jobPerk.perks.includes('CRAFTING')) {
    return { ok: false, code: 'JOB', error: 'This job cannot craft.' };
  }

  const jobFieldMap = {
    cook: 'cook',
    blacksmith: 'blacksmith',
    craftsman: 'craftsman',
    'mask maker': 'maskMaker',
    researcher: 'researcher',
    weaver: 'weaver',
    artist: 'artist',
    witch: 'witch',
  };
  const jobField = jobFieldMap[jobLowerEarly];
  const canCraftItem = hasAllPerks || (jobField && item[jobField] === true);
  if (!canCraftItem) {
    return { ok: false, code: 'JOB', error: `Item cannot be crafted by ${jobNormalizedEarly}.` };
  }

  let voucherCheck;
  let jobVoucherItem;
  const crafterForVoucher = crafter;

  if (crafter.jobVoucher) {
    voucherCheck = await validateJobVoucher(crafter, jobResolved);
    if (voucherCheck.skipVoucher) {
      info('WS-COMM', `${crafter.name} voucher skip`);
    } else if (!voucherCheck.success) {
      if (crafter.jobVoucherJob === null) {
        info('WS-COMM', 'Unrestricted job voucher');
      } else {
        return {
          ok: false,
          code: 'VOUCHER',
          error: 'Job voucher validation failed for this craft.',
        };
      }
    } else {
      if (baseStaminaRecipe > 5) {
        return {
          ok: false,
          code: 'VOUCHER',
          error: 'Recipe base stamina exceeds job voucher limit (>5).',
        };
      }
      const lockedVillage = isVillageExclusiveJob(jobResolved);
      if (lockedVillage && String(crafter.currentVillage).toLowerCase() !== lockedVillage.toLowerCase()) {
        return {
          ok: false,
          code: 'VOUCHER',
          error: `${crafter.name} must be in ${lockedVillage} to use this job voucher for crafting.`,
        };
      }
      const fetchResult = await fetchJobVoucherItem();
      if (!fetchResult.success) {
        return { ok: false, code: 'VOUCHER', error: 'Could not load Job Voucher item.' };
      }
      jobVoucherItem = fetchResult.item;
    }
  }

  let freshCrafter = await fetchCharacterByNameAndUserId(crafter.name, crafterUserId);
  if (!freshCrafter) freshCrafter = await fetchModCharacterByNameAndUserId(crafter.name, crafterUserId);
  if (!freshCrafter) {
    return { ok: false, code: 'CRAFTER', error: 'Could not reload crafter character.' };
  }

  let staminaCost = baseStaminaRecipe * quantity;
  staminaCost = await applyCraftingStaminaBoost(freshCrafter.name, staminaCost);

  let teacherStaminaContribution = 0;
  let crafterStaminaCost = staminaCost;
  let boosterName = freshCrafter.boostedBy;
  if (!boosterName) {
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCrafter.name);
    const currentTime = Date.now();
    const notExpired = !activeBoost?.boostExpiresAt || currentTime <= activeBoost.boostExpiresAt;
    if (
      activeBoost &&
      activeBoost.status === 'accepted' &&
      activeBoost.category === 'Crafting' &&
      activeBoost.boostingCharacter &&
      notExpired
    ) {
      boosterName = activeBoost.boostingCharacter;
      freshCrafter.boostedBy = boosterName;
      await freshCrafter.save();
    }
  }
  if (boosterName) {
    const boosterCharacter = await fetchCharacterByName(boosterName);
    if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
      const halfCost = Math.ceil(staminaCost / 2);
      teacherStaminaContribution = Math.min(halfCost, 3);
      crafterStaminaCost = staminaCost - teacherStaminaContribution;
      if (boosterCharacter.currentStamina < teacherStaminaContribution) {
        return {
          ok: false,
          code: 'TEACHER_STAMINA',
          error: `Teacher ${boosterCharacter.name} lacks stamina (${boosterCharacter.currentStamina}/${teacherStaminaContribution}).`,
        };
      }
    }
  }

  const villageName = capitalizeWords(freshCrafter.currentVillage);
  const village = await Village.findOne({ name: villageName });
  const villageLevel = village?.level || 1;

  let villageStaminaReduction = 0;
  if (villageLevel === 2) {
    villageStaminaReduction = Math.random() * 0.05 + 0.05;
  } else if (villageLevel === 3) {
    villageStaminaReduction = Math.random() * 0.05 + 0.1;
  }
  if (villageStaminaReduction > 0) {
    crafterStaminaCost = Math.max(1, Math.floor(crafterStaminaCost * (1 - villageStaminaReduction)));
  }

  const modCrafter = !!(await ModCharacter.findById(freshCrafter._id));
  if (!modCrafter) {
    const availableStamina = freshCrafter.currentStamina ?? 0;
    if (availableStamina < crafterStaminaCost) {
      return {
        ok: false,
        code: 'STAMINA',
        error: `Not enough stamina (${availableStamina}/${crafterStaminaCost}). Village and Priest/Teacher effects are applied.`,
      };
    }
  }

  const inventoryCollection = await getCharacterInventoryCollection(commissioner.name);
  const inventory = await inventoryCollection.find().toArray();

  const originalCraftingMaterials = Array.isArray(item.craftingMaterial) ? item.craftingMaterial : [];
  if (originalCraftingMaterials.length === 0) {
    return { ok: false, code: 'RECIPE', error: 'This item has no crafting recipe.' };
  }

  let adjustedCraftingMaterials = await applyCraftingMaterialBoost(
    freshCrafter.name,
    originalCraftingMaterials,
    quantity
  );
  if (!Array.isArray(adjustedCraftingMaterials)) adjustedCraftingMaterials = originalCraftingMaterials;

  if (villageLevel >= 2 && adjustedCraftingMaterials.length > 0) {
    const villageMaterialReduction =
      villageLevel === 2 ? Math.random() * 0.05 + 0.05 : Math.random() * 0.05 + 0.1;
    adjustedCraftingMaterials = adjustedCraftingMaterials.map((material) => ({
      ...material,
      quantity: Math.max(1, Math.ceil(material.quantity * (1 - villageMaterialReduction))),
    }));
  }

  let materialsUsed;

  if (isMixerOutputElixirName(item.itemName)) {
    if (elixirMaterialSelections.length === 0) {
      return {
        ok: false,
        code: 'ELIXIR_MATERIALS',
        error:
          'Mixer elixir commissions need specific inventory stacks from the commissioner. They must edit the request and choose stacks before you can claim.',
      };
    }
    const normalizedSels = elixirMaterialSelections.map((s) => ({
      inventoryDocumentId: s.inventoryDocumentId,
      maxQuantity: s.maxQuantity,
    }));
    const elixirApply = await planAndApplyElixirCommissionRemovals({
      selections: normalizedSels,
      commissioner,
      invCollection: inventoryCollection,
      adjustedCraftingMaterials,
      baseCraftingMaterials: originalCraftingMaterials,
      quantity,
      craftItemName: item.itemName,
    });
    if (!elixirApply.ok) {
      return { ok: false, code: 'ELIXIR_MATERIALS', error: elixirApply.error };
    }
    materialsUsed = elixirApply.materialsUsed;
  } else {
    const missingMaterials = [];
    for (const material of adjustedCraftingMaterials) {
      const requiredQty = material.quantity * quantity;
      let ownedQty = 0;
      if (generalCategories[material.itemName]) {
        ownedQty = inventory
          .filter((invItem) => generalCategories[material.itemName].includes(invItem.itemName))
          .reduce((sum, inv) => sum + inv.quantity, 0);
      } else {
        ownedQty = inventory
          .filter((invItem) => invItem.itemName === material.itemName)
          .reduce((sum, inv) => sum + inv.quantity, 0);
      }
      if (ownedQty < requiredQty) {
        missingMaterials.push(`${material.itemName}: need ${requiredQty}, have ${ownedQty}`);
      }
    }
    if (missingMaterials.length) {
      return {
        ok: false,
        code: 'MATERIALS',
        error:
          'Commissioner is missing materials (after Scholar/village reductions). Add items to the commissioner OC inventory.',
        missingMaterials,
      };
    }

    const itemWithAdjustedMaterials = { ...item, craftingMaterial: adjustedCraftingMaterials };
    try {
      materialsUsed = await processMaterials(null, commissioner, inventory, itemWithAdjustedMaterials, quantity);
    } catch (e) {
      logError('WS-COMM', `processMaterials: ${e.message}`);
      return { ok: false, code: 'MATERIALS', error: 'Failed to remove materials. Try again.' };
    }

    if (materialsUsed === 'canceled') {
      return { ok: false, code: 'MATERIALS', error: 'Materials could not be consumed (inventory may have changed).' };
    }
    if (materialsUsed && typeof materialsUsed === 'object' && materialsUsed.status === 'pending') {
      return {
        ok: false,
        code: 'MATERIALS_SELECTION',
        error:
          'This recipe needs a material choice only supported in Discord /crafting. Consolidate commissioner stacks or craft in-game.',
      };
    }
  }

  if (teacherStaminaContribution > 0 && freshCrafter.boostedBy) {
    const boosterCharacter = await fetchCharacterByName(freshCrafter.boostedBy);
    const needsTeacherSecondVoucher =
      boosterCharacter && isBoosterUsingVoucherForJob(boosterCharacter, 'Teacher');
    if (needsTeacherSecondVoucher) {
      const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCrafter.name);
      if (!activeBoost || !activeBoost.boosterUsedSecondVoucher) {
        for (const mat of materialsUsed) {
          await addItemInventoryDatabase(
            commissioner._id,
            mat.itemName,
            mat.quantity,
            null,
            'Workshop Commission Refund'
          );
        }
        return {
          ok: false,
          code: 'VOUCHER',
          error: `**${freshCrafter.name}** cannot use Teacher stamina help until **${freshCrafter.boostedBy || 'the Teacher'}** uses their second job voucher in Discord (/item, Job Voucher → Teacher).`,
        };
      }
    }
  }

  if (freshCrafter.boostedBy) {
    const boosterCharacter = await fetchCharacterByName(freshCrafter.boostedBy);
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCrafter.name);
    const isEntertainerCraftingBoost =
      activeBoost &&
      activeBoost.category === 'Crafting' &&
      (activeBoost.boosterJob || '').trim().toLowerCase() === 'entertainer';
    if (isEntertainerCraftingBoost && boosterCharacter) {
      const boosterIsNativeEntertainer =
        (boosterCharacter.job || '').trim().toLowerCase() === 'entertainer';
      const boosterIsCurrentlyEntertainer =
        getEffectiveJob(boosterCharacter).trim().toLowerCase() === 'entertainer';
      if (!boosterIsNativeEntertainer && !boosterIsCurrentlyEntertainer) {
        for (const mat of materialsUsed) {
          await addItemInventoryDatabase(
            commissioner._id,
            mat.itemName,
            mat.quantity,
            null,
            'Workshop Commission Refund'
          );
        }
        return {
          ok: false,
          code: 'VOUCHER',
          error: `**${freshCrafter.name}** cannot use Entertainer crafting boost until **${freshCrafter.boostedBy || 'the Entertainer'}** uses their second job voucher in Discord (/item, Job Voucher → Entertainer).`,
        };
      }
    }
  }

  let staminaDeducted = false;
  let teacherDeducted = false;

  try {
    await checkAndUseStamina(
      freshCrafter,
      crafterStaminaCost,
      craftingStaminaLogContext(freshCrafter, itemName)
    );
    staminaDeducted = true;

    if (teacherStaminaContribution > 0 && freshCrafter.boostedBy) {
      const boosterCharacter = await fetchCharacterByName(freshCrafter.boostedBy);
      if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
        await checkAndUseStamina(boosterCharacter, teacherStaminaContribution, {
          source: 'Workshop commission (Teacher support)',
          itemName: itemName || null,
        });
        teacherDeducted = true;
      }
    }

    let craftedQuantity = quantity;
    craftedQuantity = await applyCraftingQuantityBoost(freshCrafter.name, craftedQuantity);

    let fortuneTellerBoostTag = false;
    if (freshCrafter.boostedBy) {
      const boosterCharacter = await fetchCharacterByName(freshCrafter.boostedBy);
      if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Fortune Teller') {
        const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCrafter.name);
        if (activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Crafting') {
          fortuneTellerBoostTag = true;
        }
      }
    }

    const addOpts = { craftedAt: new Date(), fortuneTellerBoost: fortuneTellerBoostTag };
    if (isElixirItemName(item.itemName)) {
      const t = Number(elixirTier);
      addOpts.elixirLevel = t === 2 || t === 3 ? t : 1;
    }

    await addItemInventoryDatabase(
      commissioner._id,
      item.itemName,
      craftedQuantity,
      null,
      'Workshop Commission',
      addOpts
    );

    const boosterNameBeforeClear = freshCrafter.boostedBy;
    const activeBoostAtCraft = boosterNameBeforeClear
      ? await retrieveBoostingRequestFromTempDataByCharacter(freshCrafter.name)
      : null;

    if (
      activeBoostAtCraft &&
      activeBoostAtCraft.category === 'Crafting' &&
      (activeBoostAtCraft.boosterJob || '').trim().toLowerCase() === 'entertainer' &&
      boosterNameBeforeClear
    ) {
      const b = await fetchCharacterByName(boosterNameBeforeClear);
      if (b && isBoosterUsingVoucherForJob(b, 'Entertainer')) {
        await deactivateJobVoucher(b._id, { afterUse: true });
      }
    }

    await clearBoostAfterUse(freshCrafter, { client: null, context: 'workshop_commission_craft' });

    if (teacherStaminaContribution > 0 && boosterNameBeforeClear) {
      const b = await fetchCharacterByName(boosterNameBeforeClear);
      if (b && b.jobVoucher) {
        await deactivateJobVoucher(b._id, { afterUse: true });
      }
    }

    const jobForVoucher =
      crafterForVoucher.jobVoucher && crafterForVoucher.jobVoucherJob
        ? crafterForVoucher.jobVoucherJob
        : crafterForVoucher.job;
    if (crafterForVoucher.jobVoucher && !voucherCheck?.skipVoucher && jobVoucherItem) {
      await activateJobVoucher(crafterForVoucher, jobForVoucher, jobVoucherItem, 1, null);
      await deactivateJobVoucher(crafterForVoucher._id, { afterUse: true });
    }

    return {
      ok: true,
      craftedQuantity,
      crafterStaminaPaid: crafterStaminaCost,
      teacherStaminaPaid: teacherStaminaContribution,
    };
  } catch (e) {
    logError('WS-COMM', `post-material failure: ${e.message}`);
    try {
      if (Array.isArray(materialsUsed)) {
        for (const mat of materialsUsed) {
          await addItemInventoryDatabase(
            commissioner._id,
            mat.itemName,
            mat.quantity,
            null,
            'Workshop Commission Refund'
          );
        }
      }
      if (staminaDeducted) {
        await checkAndUseStamina(
          freshCrafter,
          -crafterStaminaCost,
          craftingStaminaLogContext(freshCrafter, itemName, { refund: true })
        );
      }
      if (teacherDeducted && freshCrafter.boostedBy) {
        const boosterCharacter = await fetchCharacterByName(freshCrafter.boostedBy);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
          await checkAndUseStamina(boosterCharacter, -teacherStaminaContribution, {
            source: 'Workshop commission refund (Teacher support)',
            itemName: itemName || null,
          });
        }
      }
    } catch (refundErr) {
      logError('WS-COMM', `refund failed: ${refundErr.message}`);
    }
    return { ok: false, code: 'EXECUTION', error: e.message || 'Craft failed after consuming materials.' };
  }
}

module.exports = { executeWorkshopCommissionCraft };
