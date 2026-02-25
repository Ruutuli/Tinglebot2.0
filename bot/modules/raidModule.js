// ============================================================================
// ------------------- Standard Libraries -------------------
// ============================================================================
const { handleError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const { calculateFinalValue, calculateRaidFinalValue } = require('./rngModule');
const { EmbedBuilder } = require('discord.js');
const {
  getEncounterOutcome,
  createEncounterContext,
  getTier5EncounterOutcome,
  getTier6EncounterOutcome,
  getTier7EncounterOutcome,
  getTier8EncounterOutcome,
  getTier9EncounterOutcome,
  getTier10EncounterOutcome
} = require('./encounterModule');
const { getVillageEmojiByName } = require('./locationsModule');
const { capitalizeVillageName } = require('@/utils/stringUtils');
const { monsterMapping } = require('@/models/MonsterModel');
const Raid = require('@/models/RaidModel');
const { finalizeBlightApplication } = require('../handlers/blightHandler');
const embedsModule = require('../embeds/embeds.js');
const { getExploreCommandId, getItemCommandId } = embedsModule;
const { chatInputApplicationCommandMention } = require('@discordjs/formatters');
const { EXPLORATION_TESTING_MODE } = require('@/utils/explorationTestingConfig');
const scheduler = require('@/utils/scheduler');
const { fetchCharacterById, updateCharacterById, updateModCharacterById } = require('@/database/db');
const { generateModCharacterVictoryMessage, generateDamageDealtMessage, generateDamageMessage } = require('./flavorTextModule');
const { getCharacterBoostStatus, applyLootingDamageBoost } = require('./boostIntegration');
const { shouldConsumeElixir, consumeElixirBuff, getActiveBuffEffects } = require('./elixirModule');
const { useHearts } = require('./characterStatsModule');
const { getCurrentWeather } = require('@/services/weatherService');
const { getGlobalRaidCooldown, setGlobalRaidCooldown, getVillageRaidCooldown, VILLAGE_RAID_COOLDOWN, setVillageRaidCooldown } = require('../scripts/randomMonsterEncounters');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// ------------------- calculateRaidDuration ------------------
// Calculates raid duration based on monster tier (Tier 5: 10 min, Tier 10: 20 min, linear).
// Tier 5: 10 minutes, Tier 10: 20 minutes, scales linearly
function calculateRaidDuration(tier) {
  if (tier < 5) {
    return 10 * 60 * 1000; // 10 minutes for tiers below 5
  }
  if (tier > 10) {
    return 20 * 60 * 1000; // 20 minutes for tiers above 10
  }
  
  // Linear scaling: tier 5 = 10 minutes, tier 10 = 20 minutes
  const baseMinutes = 10;
  const minutesPerTier = (20 - 10) / (10 - 5); // 2 minutes per tier
  const additionalMinutes = (tier - 5) * minutesPerTier;
  const totalMinutes = baseMinutes + additionalMinutes;
  
  return totalMinutes * 60 * 1000; // Convert to milliseconds
}

const THREAD_AUTO_ARCHIVE_DURATION = 60; // 60 minutes (Discord allows: 1, 3, 7, 14, 30, 60, 1440 minutes)

// ------------------- Agenda job names ------------------
// One-time raid expiration (scheduler and raidModule)
const RAID_EXPIRATION_JOB_NAME = 'raid-expiration';
// 1-minute turn skip when current player doesn't roll in time
const RAID_TURN_SKIP_JOB_NAME = 'raid-turn-skip';

const RAID_TURN_SKIP_SECONDS = 60;

// Village resident role IDs
const VILLAGE_RESIDENT_ROLES = {
  'Rudania': '907344585238409236',
  'Inariko': '907344454854266890', 
  'Vhintl': '907344092491554906'
};

// Village visiting role IDs
const VILLAGE_VISITING_ROLES = {
  'Rudania': '1379850030856405185',
  'Inariko': '1379850102486863924', 
  'Vhintl': '1379850161794056303'
};

// Universal raid role for all villages (replaces resident + visiting during raids)
const UNIVERSAL_RAID_ROLE = '1205321558671884328';

// ------------------- getScaledMaxHearts ------------------
// Party-size scaling: 5 or fewer = base max hearts; 6+ = base + 2 per extra participant (5→10, 6→12, 7→14).
function getScaledMaxHearts(baseHearts, partySize) {
  if (partySize <= 5) return baseHearts;
  return baseHearts + 2 * (partySize - 5);
}

// ------------------- applyPartySizeScalingToRaid ------------------
// Recompute monster max/current hearts from base and current participant count; preserves damage dealt. Call after join or leave.
async function applyPartySizeScalingToRaid(raid) {
  if (!raid.analytics) raid.analytics = {};
  if (!raid.analytics.baseMonsterHearts || raid.analytics.baseMonsterHearts <= 0) {
    raid.analytics.baseMonsterHearts = raid.monster.maxHearts || 0;
  }
  const baseHearts = raid.analytics.baseMonsterHearts || 0;
  const partySize = (raid.participants || []).length;
  const oldMax = raid.monster.maxHearts || 0;
  const oldCurrent = raid.monster.currentHearts ?? oldMax;
  const damageDealtSoFar = Math.max(0, oldMax - oldCurrent);
  const newMax = getScaledMaxHearts(baseHearts, partySize);
  const newCurrent = Math.max(0, Math.min(newMax, newMax - damageDealtSoFar));
  raid.monster.maxHearts = newMax;
  raid.monster.currentHearts = newCurrent;
  await raid.save();
  if (partySize >= 5) {
    logger.info('RAID', `[raidModule.js] 📈 Raid ${raid.raidId} scaled HP → partySize=${partySize}, base=${baseHearts}, max=${newMax}, current=${newCurrent}`);
  }
  return raid;
}

// ============================================================================
// ------------------- Raid Battle Processing -------------------
// ============================================================================

// ------------------- getTierEncounterOutcomeForRaid ------------------
// Returns tier 5-10 encounter outcome for raid; null for tier < 5, throws for unsupported tier > 10.
async function getTierEncounterOutcomeForRaid(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, tier) {
  if (tier < 5) return null;
  switch (tier) {
    case 5:
      return await getTier5EncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, true);
    case 6:
      return await getTier6EncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, true);
    case 7:
      return await getTier7EncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, true);
    case 8:
      return await getTier8EncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, true);
    case 9:
      return await getTier9EncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, true);
    case 10:
      return await getTier10EncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, true);
    default:
      throw new Error(`Unsupported monster tier for raid: ${tier}`);
  }
}

// ------------------- processRaidBattle ------------------
// Processes a raid battle turn using the encounter module's tier-specific logic.
// options: { skipPersist: true } for expedition (monster camp) waves — no character hearts or KO persisted; caller applies damage to party pool only.
async function processRaidBattle(character, monster, diceRoll, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, characterHeartsBefore = null, options = {}) {
  const skipPersist = options.skipPersist === true;
  try {
    // Battle processing details logged only in debug mode

    let outcome;
    
    // ------------------- Mod Character 1-Hit KO Logic -------------------
    // Mod characters have the ability to 1-hit KO all raid monsters
    if (character.isModCharacter) {
      logger.info('RAID', `Mod character ${character.name} (${character.modTitle || 'Oracle'}) uses 1-hit KO ability on ${monster.name}!`);
      
      // Generate appropriate flavor text based on character type
      const modFlavorText = generateModCharacterVictoryMessage(
        character.name, 
        character.modTitle || 'Oracle', 
        character.modType || 'Power'
      );
      
      // Create a special outcome for mod character 1-hit KO
      outcome = {
        result: modFlavorText, // Use special mod character flavor text
        hearts: monster.maxHearts || monster.hearts || 999, // Deal maximum damage to instantly kill monster
        playerHearts: {
          current: character.currentHearts, // Mod character takes no damage
          max: character.maxHearts
        },
        monsterHearts: {
          current: 0, // Monster is instantly defeated
          max: monster.maxHearts || monster.hearts || 999
        },
        diceRoll: diceRoll,
        damageValue: monster.maxHearts || monster.hearts || 999, // Show max damage dealt
        adjustedRandomValue: adjustedRandomValue,
        isModKO: true // Special flag to indicate this was a mod character 1-hit KO
      };
    } else {
      // Use the encounter module's tier-specific logic for non-dragon characters
      // Create a copy of the monster to avoid modifying the shared raid monster object
      const monsterCopy = { ...monster };
      
      // Handle tiers 1-4 using getEncounterOutcome, tiers 5-10 using tier-specific functions
      if (monster.tier <= 4) {
        const encounterOutcome = await getEncounterOutcome(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, skipPersist ? { skipPersist: true } : {});
        
        // getEncounterOutcome already saved character damage via useHearts (unless skipPersist)
        // Reload character to get updated hearts when not in testing mode
        if (!skipPersist) {
          const updatedCharacter = await fetchCharacterById(character._id, character.isModCharacter);
          if (updatedCharacter) {
            Object.assign(character, updatedCharacter.toObject ? updatedCharacter.toObject() : updatedCharacter);
          }
        }
        
        // Convert outcome format: getEncounterOutcome uses 'hearts' for character damage,
        // but we need 'hearts' for monster damage in raid/wave context
        const characterDamage = encounterOutcome.hearts || 0;
        const currentMonsterHearts = monster.currentHearts || monster.maxHearts || monster.hearts || 0;
        let monsterDamage = 0;
        let newMonsterHearts = currentMonsterHearts;
        let outcomeText = '';
        
        // Calculate monster damage incrementally (like tiers 5+)
        // For raids/waves, we want incremental damage, not instant defeats
        // Calculate incremental damage based on roll value (similar to tier 5+)
        // Use ranges similar to tier 5 but scaled for lower tiers
        if (defenseSuccess) {
          // Defense success: deal 2 hearts (dodge and counter)
          monsterDamage = Math.min(2, currentMonsterHearts);
          newMonsterHearts = Math.max(0, currentMonsterHearts - monsterDamage);
          outcomeText = `💥💀 The monster ${monster.name} attacks! But ${character.name} dodges! 💨\n${generateDamageDealtMessage(monsterDamage)}`;
        } else if (characterDamage > 0) {
          // Character takes damage - monster may deal some damage back
          if (adjustedRandomValue >= 60) {
            // Medium-high roll: deal 1 heart to monster even when taking damage
            monsterDamage = Math.min(1, currentMonsterHearts);
            newMonsterHearts = Math.max(0, currentMonsterHearts - monsterDamage);
            outcomeText = `${generateDamageMessage(characterDamage)}\n${generateDamageDealtMessage(monsterDamage)}`;
          } else {
            // Low roll: no damage to monster (character takes damage)
            monsterDamage = 0;
            outcomeText = generateDamageMessage(characterDamage);
          }
        } else if (adjustedRandomValue >= 80) {
          // High roll: deal 2 hearts
          monsterDamage = Math.min(2, currentMonsterHearts);
          newMonsterHearts = Math.max(0, currentMonsterHearts - monsterDamage);
          outcomeText = generateDamageDealtMessage(monsterDamage);
        } else if (adjustedRandomValue >= 60) {
          // Medium-high roll: deal 1 heart
          monsterDamage = Math.min(1, currentMonsterHearts);
          newMonsterHearts = Math.max(0, currentMonsterHearts - monsterDamage);
          outcomeText = generateDamageDealtMessage(monsterDamage);
        } else {
          // Low roll: no damage dealt by either side (similar to tier 5+ "dodge" outcome)
          monsterDamage = 0;
          outcomeText = `⚔️🏹 ${character.name} attacks! But the monster dodges. 💫`;
        }
        
        // Format outcome to match tier 5+ format
        // Mark that damage was already saved so processRaidBattle doesn't save again
        // For expedition waves (skipPersist=true), getEncounterOutcome doesn't update character.currentHearts,
        // so we calculate current hearts manually from characterHeartsBefore - characterDamage
        outcome = {
          result: outcomeText,
          hearts: monsterDamage, // Damage dealt to monster (used for tracking)
          playerHearts: {
            current: skipPersist ? Math.max(0, characterHeartsBefore - characterDamage) : character.currentHearts,
            max: character.maxHearts
          },
          monsterHearts: {
            current: newMonsterHearts,
            max: monster.maxHearts || monster.hearts
          },
          damageValue: damageValue,
          adjustedRandomValue: adjustedRandomValue,
          attackSuccess: attackSuccess,
          defenseSuccess: defenseSuccess,
          canLoot: newMonsterHearts <= 0, // Can loot when monster is defeated
          damageAlreadySaved: true // Flag to prevent double-saving damage
        };
      } else {
        outcome = await getTierEncounterOutcomeForRaid(character, monsterCopy, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, monster.tier);
      }
    }

    if (!outcome) {
      throw new Error('Failed to calculate raid battle outcome');
    }

    // ------------------- Fortune Teller: Fated Reroll (if damage taken) -------------------
    // Check if character has Fortune Teller boost and damage was taken
    let fortuneRerollTriggered = false;
    let fortuneRerollImproved = false;
    
    // Calculate initial damage for reroll check
    let initialCharacterDamage = characterHeartsBefore - (outcome.playerHearts?.current || character.currentHearts);
    
    try {
      const boostStatusForReroll = await getCharacterBoostStatus(character.name);
      const hasFortuneTellerLootBoost = boostStatusForReroll && boostStatusForReroll.boosterJob === 'Fortune Teller' && boostStatusForReroll.category === 'Looting';
      
      if (hasFortuneTellerLootBoost && initialCharacterDamage > 0) {
        logger.info('RAID', `🔮 Fortune Teller Fated Reroll triggered for ${character.name} in raid (damage=${initialCharacterDamage})`);
        fortuneRerollTriggered = true;

        // Perform a single reroll end-to-end
        const diceRollReroll = Math.floor(Math.random() * 100) + 1;
        let { damageValue: damageValueReroll, adjustedRandomValue: adjustedRandomValueReroll, attackSuccess: attackSuccessReroll, defenseSuccess: defenseSuccessReroll } =
          calculateRaidFinalValue(character, diceRollReroll);

        // Create a copy of the monster for reroll; get outcome via shared tier helper
        const monsterCopyReroll = { ...monster };
        let rerollOutcome = null;
        if (monster.tier >= 5 && monster.tier <= 10) {
          rerollOutcome = await getTierEncounterOutcomeForRaid(character, monsterCopyReroll, damageValueReroll, adjustedRandomValueReroll, attackSuccessReroll, defenseSuccessReroll, monster.tier);
        }

        if (rerollOutcome) {
          const rerollDamage = characterHeartsBefore - (rerollOutcome.playerHearts?.current || character.currentHearts);
          
          // Choose the better outcome: prioritize fewer hearts (damage), then higher adjusted roll
          const isRerollBetter = rerollDamage < initialCharacterDamage || (
            rerollDamage === initialCharacterDamage && (adjustedRandomValueReroll || 0) > (adjustedRandomValue || 0)
          );

          if (isRerollBetter) {
            logger.info('RAID', `🔮 Fated Reroll improved outcome for ${character.name}: damage ${initialCharacterDamage} → ${rerollDamage}, roll ${adjustedRandomValue} → ${adjustedRandomValueReroll}`);
            fortuneRerollImproved = true;
            
            // Replace outcome with reroll result
            outcome = rerollOutcome;
            adjustedRandomValue = adjustedRandomValueReroll;
            attackSuccess = attackSuccessReroll;
            defenseSuccess = defenseSuccessReroll;
            damageValue = damageValueReroll;
          } else {
            logger.info('RAID', `🔮 Fated Reroll did not improve outcome for ${character.name}; keeping original.`);
          }
        }
      }
    } catch (e) {
      logger.error('RAID', `Failed during Fortune Teller Fated Reroll for ${character.name}: ${e.message}`);
    }

    // ------------------- Apply Entertainer Boost (Damage Reduction) -------------------
    // Calculate actual damage taken
    // For tiers 1-4, getEncounterOutcome already saved damage, so we skip damage saving
    // For tiers 5+, the encounter module modifies character.currentHearts in memory but doesn't call useHearts
    const characterDamage = characterHeartsBefore - (outcome.playerHearts?.current || character.currentHearts);
    let finalDamage = characterDamage;
    const damageAlreadySaved = outcome.damageAlreadySaved || false;
    
    // Apply boost damage reduction using unified boost system BEFORE saving to database
    // Note: For tiers 1-4, damage was already saved by getEncounterOutcome, so boosts can't reduce it
    // This is acceptable since tiers 1-4 are simpler encounters
    if (character.boostedBy && characterDamage > 0 && !damageAlreadySaved) {
      const monsterTier = monster.tier || 5;
      finalDamage = await applyLootingDamageBoost(character.name, characterDamage, monsterTier);
      const damageReduction = characterDamage - finalDamage;
      
      if (damageReduction > 0) {
        logger.info('RAID', `[raidModule.js] 🎭 Boost applied - damage reduced ${characterDamage}→${finalDamage} (-${damageReduction}) for ${character.name}`);
      }
    }

    // ------------------- Apply Damage to Database -------------------
    // For tiers 1-4, damage was already saved by getEncounterOutcome, so skip saving here
    // For tiers 5+, the encounter module doesn't save hearts to DB, so we need to do it here
    // Apply the final damage (after boost reduction) to the database
    if (finalDamage > 0 && !damageAlreadySaved && !skipPersist) {
      const finalHearts = Math.max(0, characterHeartsBefore - finalDamage);
      
      // Use useHearts to properly save damage and handle KO if needed
      await useHearts(character._id, finalDamage, createEncounterContext(character, 'raid_damage'));
      
      const updatedCharacter = await fetchCharacterById(character._id, character.isModCharacter);
      if (updatedCharacter) {
        Object.assign(character, updatedCharacter.toObject ? updatedCharacter.toObject() : updatedCharacter);
      }
      if (outcome.playerHearts) {
        outcome.playerHearts.current = character.currentHearts;
      }
    } else if (finalDamage > 0 && skipPersist && outcome.playerHearts) {
      // Testing mode: update in-memory hearts only for display
      const finalHearts = Math.max(0, characterHeartsBefore - finalDamage);
      character.currentHearts = finalHearts;
      outcome.playerHearts.current = finalHearts;
    } else if (outcome.playerHearts) {
      // No damage taken, but ensure we have the correct hearts value
      outcome.playerHearts.current = characterHeartsBefore;
      character.currentHearts = characterHeartsBefore;
    }

    // ------------------- Elixir Consumption Logic -------------------
    // Check if elixirs should be consumed based on the raid encounter
    try {
      if (!skipPersist) {
        if (shouldConsumeElixir(character, 'raid', { monster: monster })) {
          consumeElixirBuff(character);
          logger.info('RAID', `[raidModule.js] 🧪 Elixir consumed for ${character.name} during raid`);
          await character.save();
        }
      }
    } catch (elixirError) {
      logger.warn('RAID', `[raidModule.js] ⚠️ Elixir consumption failed:`, elixirError);
      // Don't fail the raid if elixir consumption fails
    }

    // Battle result logged only in debug mode

    return {
      hearts: outcome.hearts, // Damage dealt to monster
      outcome: (outcome.result || outcome.outcome || 'Battle completed'), // Handle both regular and mod character outcomes with fallback
      playerHearts: outcome.playerHearts || {
        current: character.currentHearts,
        max: character.maxHearts
      },
      monsterHearts: outcome.monsterHearts || {
        current: monster.currentHearts,
        max: monster.maxHearts
      },
      originalRoll: diceRoll,
      adjustedRandomValue: adjustedRandomValue,
      attackSuccess: attackSuccess,
      defenseSuccess: defenseSuccess,
      damageValue: damageValue,
      attackStat: character.attack || 0,
      defenseStat: character.defense || 0,
      characterHeartsBefore: characterHeartsBefore || character.currentHearts
    };

  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'processRaidBattle',
      characterName: character?.name,
      monsterName: monster?.name
    });
    logger.error('RAID', `[raidModule.js] ❌ Error processing raid battle:`, error);
    return null;
  }
}

// ============================================================================
// ------------------- Raid Functions -------------------
// ============================================================================
// ------------------- Turn order rules ------------------
// currentTurn indexes raid.participants[]; first joiner is index 0.
// Mod characters are in the array but do not participate in turn order (can roll anytime; advanceTurn skips them; no skip timer).
// KO'd participants stay in order (turn to use a fairy or leave); skip timer applies to them.
// Turn advances after a non-mod roll or item use; skip job runs only for village raids (no skip for expedition raids).
// When someone leaves or is skip-removed, RaidModel adjusts currentTurn; raidModule cancels/schedules the skip timer when the current turn player changes.

// ------------------- getRaidOrThrow ------------------
// Fetches raid by raidId; throws with debug info (available active raid IDs) if not found.
async function getRaidOrThrow(raidId) {
  const raid = await Raid.findOne({ raidId });
  if (!raid) {
    const allRaids = await Raid.find({ status: 'active' }).select('raidId village monster.name createdAt').limit(10);
    const activeRaidIds = allRaids.map(r => r.raidId).join(', ');
    throw new Error(`Raid not found. Raid ID: "${raidId}". Available active raids: ${activeRaidIds || 'None'}`);
  }
  return raid;
}

// ------------------- startRaid ------------------
// Creates a new raid instance with the given monster and village
// expeditionId: when set, only members of that expedition can join (exploration-triggered raid)
// grottoId: when set, this raid is a Grotto Test of Power; on victory complete grotto and grant Spirit Orbs
async function startRaid(monster, village, interaction = null, expeditionId = null, grottoId = null) {
  try {
    // Generate unique raid ID with 'R' prefix for Raid
    const raidId = generateUniqueId('R');
    
    // Calculate raid duration based on monster tier (only used for non-expedition raids)
    const raidDuration = calculateRaidDuration(monster.tier);
    // Expedition raids have no timer: use far-future expiresAt so raid never auto-expires
    const isExpeditionRaid = !!expeditionId;
    const expiresAt = isExpeditionRaid
      ? new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000) // 100 years
      : new Date(Date.now() + raidDuration);

    // Create raid document
    const raid = new Raid({
      raidId: raidId,
      monster: {
        name: monster.name,
        nameMapping: monster.nameMapping,
        image: monster.image,
        tier: monster.tier,
        currentHearts: monster.hearts,
        maxHearts: monster.hearts
      },
      village: village,
      channelId: interaction?.channel?.id || null,
      expeditionId: expeditionId || null,
      grottoId: grottoId || null,
      expiresAt,
      analytics: {
        monsterTier: monster.tier,
        village: village,
        baseMonsterHearts: monster.hearts
      }
    });

    // Save raid to database
    await raid.save();

    logger.info('RAID', `[raidModule.js] 🐉 Started raid ${raidId} - ${monster.name} (T${monster.tier}) in ${village}${isExpeditionRaid ? ' (expedition)' : ` (${Math.floor(raidDuration / (1000 * 60))}m)`}`);
    
    // Schedule raid expiration using Agenda (only for normal village raids; expedition raids have no timer)
    if (!isExpeditionRaid) {
      try {
        const expirationTime = new Date(Date.now() + raidDuration);
        await scheduler.scheduleOneTimeJob(RAID_EXPIRATION_JOB_NAME, expirationTime, { raidId });
        logger.info('RAID', `Scheduled raid expiration for ${raidId} at ${expirationTime.toISOString()}`);
      } catch (schedulerError) {
        logger.error('RAID', `Failed to schedule raid expiration job: ${schedulerError.message}`);
        // Fallback: cleanup task will catch expired raids every 5 minutes
      }
    }
    
    return {
      raidId,
      raidData: raid,
      thread: null // Thread will be created in triggerRaid function
    };
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'startRaid',
      monsterName: monster?.name,
      village: village
    });
    logger.error('RAID', `[raidModule.js] ❌ Error starting raid:`, error);
    throw error;
  }
}

// ------------------- joinRaid ------------------
// Allows a character to join an active raid after validation checks. options: { client, guild } for blight finalization.
async function joinRaid(character, raidId, options = {}) {
  try {
    const raid = await getRaidOrThrow(raidId);

    // Check if raid is active
    if (raid.status !== 'active') {
      throw new Error('Raid is not active');
    }

    // KO'd characters cannot start a raid alone (would produce "No valid turn order"). They can join if others are already in the raid (they get a turn to use a fairy or leave).
    const participantCount = (raid.participants || []).length;
    if (character.ko && participantCount === 0) {
      throw new Error('Your character is KO\'d and cannot start a raid alone. Use </item:1463789335626125378> to heal first, or join a raid that already has participants.');
    }

    // If this raid was triggered from an expedition, only expedition members can join
    if (raid.expeditionId) {
      const Party = require('@/models/PartyModel');
      const party = await Party.findActiveByPartyId(raid.expeditionId);
      if (!party || !party.characters || !party.characters.length) {
        throw new Error(`Expedition ${raid.expeditionId} not found. Only members of that expedition can join this raid.`);
      }
      const isInExpedition = party.characters.some(
        (c) => c._id && character._id && c._id.toString() === character._id.toString()
      );
      if (!isInExpedition) {
        const cmdRoll = `</explore roll:${getExploreCommandId()}>`;
        throw new Error(`Only members of expedition **${raid.expeditionId}** can join this raid. This raid was triggered during that expedition. Use ${cmdRoll} with id \`${raid.expeditionId}\` and your character if you're in the party.`);
      }
    } else {
      // This is NOT an expedition raid - check if the character is currently in an active expedition
      // Characters on expeditions cannot join village raids; they must use raids triggered during their expedition
      const Party = require('@/models/PartyModel');
      const activeParty = await Party.findOne({
        status: 'started',
        'characters._id': character._id
      });
      if (activeParty) {
        throw new Error(`**${character.name}** is currently on expedition **${activeParty.partyId}**. Characters on active expeditions cannot join village raids. Complete or end your expedition first, or wait for a raid to trigger during your exploration.`);
      }
    }

    // Check if character is in the same village (skip for expedition raids — character is in the region, raid.village is the region's village)
    if (!raid.expeditionId && character.currentVillage.toLowerCase() !== raid.village.toLowerCase()) {
      throw new Error('Character must be in the same village as the raid');
    }

    // Check if character has blight stage 3 or higher (monsters don't attack them)
    if (character.blighted && character.blightStage >= 3) {
      throw new Error(`Character ${character.name} cannot participate in raids at Blight Stage ${character.blightStage} - monsters no longer attack them`);
    }

    // Check raid participant cap (max 10); mod characters can join at any time
    const MAX_RAID_PARTICIPANTS = 10;
    if (!character.isModCharacter && participantCount >= MAX_RAID_PARTICIPANTS) {
      throw new Error(`This raid is full! Maximum of ${MAX_RAID_PARTICIPANTS} participants allowed. (${participantCount}/${MAX_RAID_PARTICIPANTS})`);
    }

    // ------------------- Blight Rain Check -------------------
    const weatherData = await getCurrentWeather(raid.village);
    let blightRainMessage = null;
    
    if (weatherData?.special?.label === 'Blight Rain') {
      // Mod characters and Hibiki are immune to blight infection
      const HIBIKI_USER_ID = "668281042414600212";
      if (character.isModCharacter || character.userId === HIBIKI_USER_ID) {
        if (character.isModCharacter) {
          blightRainMessage = 
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
        } else {
          blightRainMessage = 
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** was definitely in the blight rain, but somehow avoided being infected... Was it luck? Or something else? ◈`;
        }
      } else if (character.blighted) {
        blightRainMessage = 
          "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
          `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
      } else {
        // Check for resistance buffs
        const buffEffects = getActiveBuffEffects(character);
        let infectionChance = 0.75; // Base 75% chance
        
        // Apply resistance buffs
        if (buffEffects && buffEffects.blightResistance > 0) {
          infectionChance -= (buffEffects.blightResistance * 0.3); // Each level reduces by 30%
        }
        if (buffEffects && buffEffects.fireResistance > 0) {
          infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
        }
        
        // Consume elixirs after applying their effects
        if (shouldConsumeElixir(character, 'raid', { blightRain: true })) {
          consumeElixirBuff(character);
          const updateFn = character.isModCharacter ? updateModCharacterById : updateCharacterById;
          await updateFn(character._id, { buff: character.buff });
        }
        
        // Ensure chance stays within reasonable bounds
        infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
        
        const infectionRoll = Math.random();
        
        if (infectionRoll < infectionChance) {
          blightRainMessage = 
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
            "🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n" +
            "📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n" +
            "⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
            "🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today's blight roll if you were just infected.*";
          
          logger.info('RAID', `[raidModule.js] 💀 ${character.name} infected with blight during raid join`);

          // Use shared finalize helper - each step has its own try/catch for resilience
          const finalizeResult = await finalizeBlightApplication(
            character,
            character.userId,
            {
              client: options.client,
              guild: options.guild,
              source: 'Blight Rain during raid',
              alreadySaved: false
            }
          );
          
        } else {
          blightRainMessage = 
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain and managed to avoid infection! ◈`;
        }
      }
    }

    // Create participant data (isModCharacter: mod characters don't participate in turn order)
    const participant = {
      userId: character.userId,
      characterId: character._id,
      name: character.name,
      damage: 0,
      joinedAt: new Date(),
      isModCharacter: !!character.isModCharacter,
      characterState: {
        currentHearts: character.currentHearts,
        maxHearts: character.maxHearts,
        currentStamina: character.currentStamina,
        maxStamina: character.maxStamina,
        attack: character.attack,
        defense: character.defense,
        gearArmor: character.gearArmor,
        gearWeapon: character.gearWeapon,
        gearShield: character.gearShield,
        ko: character.ko
      }
    };

    // Add participant to raid using the model method
    try {
      await raid.addParticipant(participant);
    } catch (error) {
      if (error.message === 'User already has a character in this raid') {
        throw new Error('You already have a character participating in this raid');
      }
      throw error; // Re-throw other errors
    }

    // ----- Dynamic HP scaling: 5 or fewer = base max; 6+ = base + 2 per extra participant -----
    try {
      await applyPartySizeScalingToRaid(raid);
    } catch (scaleError) {
      logger.warn('RAID', `[raidModule.js] ⚠️ Failed to scale raid HP: ${scaleError.message}`);
    }

    logger.info('RAID', `[raidModule.js] 👤 ${character.name} joined raid ${raidId}`);

    // Only start the 1-minute skip timer when the first participant joins. Later joiners
    // get their turn (and timer) from raid.js + processRaidTurn, so scheduling here
    // would use stale currentTurn and target the wrong player.
    if (raid.participants.length === 1) {
      try {
        await scheduleRaidTurnSkip(raidId);
      } catch (skipErr) {
        logger.warn('RAID', `Failed to schedule first turn skip for ${raidId}: ${skipErr.message}`);
      }
    }
    
    return {
      raidId,
      raidData: raid,
      participant,
      blightRainMessage
    };
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'joinRaid',
      characterName: character?.name,
      raidId: raidId
    });
    logger.error('RAID', `[raidModule.js] ❌ Error joining raid:`, error);
    throw error;
  }
}

// ------------------- scheduleRaidTurnSkip ------------------
// Schedules a one-time job in 60s to skip the current turn if they don't roll. Mod characters are not on the turn timer.
// Always cancels any existing skip job for this raid first so only one timer is ever active.
// Stores scheduledAt (ms) so the handler only skips after 60s elapsed (immune to Agenda running early or clock skew).
// Expedition raids: no turn-skip timer (only during exploring).
async function scheduleRaidTurnSkip(raidId) {
  await cancelRaidTurnSkip(raidId); // Prevent duplicate jobs — only one skip timer per raid
  const raid = await Raid.findOne({ raidId, status: 'active' });
  if (!raid || !raid.participants || raid.participants.length === 0) return;
  if (raid.expeditionId) return; // No turn timer during expedition raids
  const current = raid.getCurrentTurnParticipant(); // Include KO'd — they get 1 minute to use a fairy or leave
  if (!current) return;
  if (current.isModCharacter) return; // Mod characters are not on the turn timer
  const now = Date.now();
  const scheduledAt = now;
  const runAfterMs = now + RAID_TURN_SKIP_SECONDS * 1000;
  const when = new Date(runAfterMs);
  if (when.getTime() <= now + 1000) {
    logger.warn('RAID', `scheduleRaidTurnSkip: computed time was in the past, using now + ${RAID_TURN_SKIP_SECONDS}s`);
  }
  await scheduler.scheduleOneTimeJob(RAID_TURN_SKIP_JOB_NAME, when, {
    raidId,
    characterId: current.characterId.toString(),
    scheduledAt, // Handler: only skip when (Date.now() - scheduledAt) >= 60000
    runAfter: runAfterMs
  });
  logger.info('RAID', `Scheduled turn skip for ${raidId} in ${RAID_TURN_SKIP_SECONDS}s at ${when.toISOString()} (${current.name})`);
}

// ------------------- notifyExpeditionRaidOver ------------------
// When a raid was triggered from an expedition: update party progressLog and send "continue expedition" to thread
// For result === 'fled' (retreat): do NOT fetch/save party — explore retreat handler owns that save to avoid double-dip on stamina.
// finalBlowCharacter: when result === 'defeated', the character who dealt the killing blow (for progress log).
async function notifyExpeditionRaidOver(raid, client, result, finalBlowCharacter = null) {
  if (!raid.expeditionId || !client) return;
  try {
    if (result !== 'fled') {
      const Party = require('@/models/PartyModel');
      const party = await Party.findActiveByPartyId(raid.expeditionId);
      if (!party) return;
      // When defeated, raid_over is pushed from raid.js after raid_turn so progress log order is correct (damage then raid over)
      if (result !== 'defeated') {
        if (!party.progressLog) party.progressLog = [];
        const monsterName = raid.monster?.name || 'monster';
        const msg = `Raid timed out. Continue the expedition.`;
        party.progressLog.push({
          at: new Date(),
          characterName: 'Raid',
          outcome: 'raid_over',
          message: msg,
        });
      }
      // Advance turn so the next party member can /explore roll (we didn't advance when raid started)
      if (party.characters?.length > 0) {
        party.currentTurn = (party.currentTurn + 1) % party.characters.length;
      }
      await party.save();
    }

    const cmdRoll = `</explore roll:${getExploreCommandId()}>`;
    const desc = result === 'defeated'
      ? `The monster was defeated! Use ${cmdRoll} with id \`${raid.expeditionId}\` and your character to continue.`
      : result === 'fled'
        ? `The party escaped! Use ${cmdRoll} with id \`${raid.expeditionId}\` and your character to continue.`
        : `The raid timed out. Use ${cmdRoll} with id \`${raid.expeditionId}\` and your character to continue.`;
    const embed = new EmbedBuilder()
      .setColor(result === 'defeated' ? 0x4CAF50 : result === 'fled' ? 0x9C27B0 : 0xFF9800)
      .setTitle('🗺️ **Raid over — continue your expedition**')
      .setDescription(desc)
      .addFields({ name: '🆔 **__Expedition ID__**', value: raid.expeditionId, inline: true })
      .setTimestamp();

    if (raid.threadId) {
      try {
        const thread = await client.channels.fetch(raid.threadId);
        if (thread) await thread.send({ embeds: [embed] });
      } catch (e) {
        logger.warn('RAID', `Could not send expedition continue message to thread: ${e.message}`);
      }
    }
  } catch (err) {
    logger.error('RAID', `notifyExpeditionRaidOver: ${err.message}`);
  }
}

// ------------------- cancelRaidTurnSkip ------------------
async function cancelRaidTurnSkip(raidId) {
  const n = await scheduler.cancelJob(RAID_TURN_SKIP_JOB_NAME, { raidId });
  if (n > 0) logger.info('RAID', `Cancelled ${n} turn-skip job(s) for raid ${raidId}`);
}

// ------------------- advanceRaidTurnOnItemUse ------------------
// When a character uses a healing item (e.g. Fairy) during their raid turn, advance the raid turn.
// Called from /item command after successful healing so items count as a turn.
async function advanceRaidTurnOnItemUse(characterId) {
  if (!characterId) return;
  const charIdStr = characterId.toString();
  const raids = await Raid.find({ status: 'active', 'participants.characterId': characterId });
  for (const raid of raids) {
    const current = raid.getCurrentTurnParticipant();
    if (current && current.characterId && current.characterId.toString() === charIdStr) {
      if (current.isModCharacter) return; // Mod characters don't affect turn order
      
      // Check if this participant already took an action this turn (e.g., attacked then healed)
      // If so, skip advancing the turn again to prevent double-advancement
      if (current.hasTakenActionThisTurn) {
        logger.info('RAID', `Item use by ${current.name} — turn already advanced this cycle, skipping`);
        return;
      }
      
      // Mark that this participant has taken their action this turn
      current.hasTakenActionThisTurn = true;
      await raid.save();
      
      await cancelRaidTurnSkip(raid.raidId);
      await raid.advanceTurn();
      await scheduleRaidTurnSkip(raid.raidId);
      logger.info('RAID', `Item use by ${current.name} advanced raid ${raid.raidId} turn`);
      break;
    }
  }
}

// ------------------- syncExpeditionPartyPoolFromRaid ------------------
// For expedition raids, the party pool is the single source of truth throughout the expedition.
// Damage is applied to the party pool after each turn (in processRaidTurn).
// This function is a no-op for expeditions — we don't want to overwrite the pool with character DB values.
// Character DB values are stale during expeditions (they're only updated when the expedition ends).
async function syncExpeditionPartyPoolFromRaid(raid) {
  if (!raid?.expeditionId) return;
  // For expeditions, party pool is always the source of truth. Don't sync from character DB.
  logger.info('RAID', `Skipping pool sync for raid ${raid.raidId} (expedition — party pool is source of truth)`);
}

// ------------------- endExplorationRaidAsRetreat ------------------
// Called when party successfully retreats from an exploration raid. Ends the raid as 'fled' and notifies expedition.
async function endExplorationRaidAsRetreat(raid, client) {
  if (!raid || raid.status !== 'active') return;
  try {
    await cancelRaidTurnSkip(raid.raidId);
    await syncExpeditionPartyPoolFromRaid(raid);
    await raid.completeRaid('fled');
    if (raid.expeditionId && client) {
      await notifyExpeditionRaidOver(raid, client, 'fled');
    }
  } catch (err) {
    logger.error('RAID', `endExplorationRaidAsRetreat: ${err.message}`);
    throw err;
  }
}

// ------------------- closeRaidsForExpedition ------------------
// Closes any active raids linked to an expedition when the expedition ends (party KO or return home).
// Uses direct update (no KO). Does not notify expedition—caller handles that.
async function closeRaidsForExpedition(expeditionId) {
  if (!expeditionId) return;
  try {
    const raids = await Raid.find({ expeditionId: { $regex: new RegExp(`^${expeditionId}$`, 'i') }, status: 'active' });
    for (const raid of raids) {
      try {
        await cancelRaidTurnSkip(raid.raidId);
        try {
          await scheduler.cancelJob(RAID_EXPIRATION_JOB_NAME, { raidId: raid.raidId });
        } catch (cancelErr) {
          // Ignore—expedition raids typically have no expiration job
        }
        await syncExpeditionPartyPoolFromRaid(raid);
        await raid.completeRaid('fled');
        logger.info('RAID', `Closed expedition raid ${raid.raidId} for expedition ${expeditionId}`);
      } catch (raidErr) {
        logger.error('RAID', `Failed to close raid ${raid.raidId} for expedition ${expeditionId}: ${raidErr.message}`);
      }
    }
  } catch (err) {
    logger.error('RAID', `closeRaidsForExpedition: ${err.message}`);
    throw err;
  }
}

// ------------------- leaveRaid ------------------
// Player voluntarily leaves; monster HP is unchanged (no revert). Eligible for loot if 1+ damage or 3+ rounds.
// Expedition raids: leaving is not allowed; the whole party must retreat together via /explore retreat.
async function leaveRaid(character, raidId, options = {}) {
  const raid = await Raid.findOne({ raidId });
  if (!raid) throw new Error('Raid not found');
  if (raid.status !== 'active') throw new Error('Raid is not active');
  if (raid.expeditionId) {
    const cmdRetreat = `</explore retreat:${getExploreCommandId()}>`;
    throw new Error(`You cannot leave an expedition raid individually. The whole party retreats together — use ${cmdRetreat} with id \`${raid.expeditionId}\` and your character (costs 1 stamina per attempt, not guaranteed).`);
  }
  const participants = raid.participants || [];
  const participant = participants.find(p => p.characterId.toString() === character._id.toString());
  if (!participant) throw new Error('Character is not in this raid');

  const currentTurnParticipant = raid.getCurrentTurnParticipant();
  const wasCurrentTurn = currentTurnParticipant && currentTurnParticipant.characterId.toString() === character._id.toString();

  const eligibleForLoot = (participant.damage >= 1) || ((participant.roundsParticipated || 0) >= 3);
  await raid.removeParticipant(character._id, eligibleForLoot);

  // Revert monster max (and current) hearts to the scale for the new party size (e.g. 6→5 reverts max 12→10)
  try {
    const updatedRaid = await Raid.findOne({ raidId, status: 'active' });
    if (updatedRaid && updatedRaid.participants && updatedRaid.participants.length > 0) {
      await applyPartySizeScalingToRaid(updatedRaid);
    }
  } catch (scaleError) {
    logger.warn('RAID', `[raidModule.js] ⚠️ Failed to rescale raid HP on leave: ${scaleError.message}`);
  }

  if (wasCurrentTurn) {
    await cancelRaidTurnSkip(raidId);
    // Optionally schedule 1-minute skip for new current turn
    const freshRaid = await Raid.findOne({ raidId, status: 'active' });
    if (freshRaid && freshRaid.participants && freshRaid.participants.length > 0) {
      await scheduleRaidTurnSkip(raidId);
    }
  }

  const freshRaid = await Raid.findOne({ raidId, status: 'active' });
  let nextTurnMention = null;
  if (freshRaid && freshRaid.participants && freshRaid.participants.length > 0) {
    const next = freshRaid.getCurrentTurnParticipant();
    if (next) nextTurnMention = `<@${next.userId}>`;
  }
  return { eligibleForLoot, nextTurnMention };
}

// User-facing message when turn was already processed or turn order advanced (duplicate submit, turn-skip race, etc.)
const RAID_TURN_ALREADY_PROCESSED_MSG = 'Your turn was already processed or the turn has advanced. Please wait for your next turn.';

// ------------------- processRaidTurn ------------------
// Processes a single turn in a raid for a character
async function processRaidTurn(character, raidId, interaction, raidData = null) {
  try {
    // Always fetch fresh raid for validation (ignore passed raidData to avoid stale state / races)
    let raid = await getRaidOrThrow(raidId);

    // Check if raid is active
    if (raid.status !== 'active') {
      throw new Error('Raid is not active');
    }

    // Cancel 1-minute skip job only when the current turn player is rolling (mod characters don't affect turn order)
    const isModTurn = !!character.isModCharacter;
    if (!isModTurn) {
      await cancelRaidTurnSkip(raidId);
    }

    // Find participant
    const participants = raid.participants || [];
    let participant = participants.find(p => p.characterId.toString() === character._id.toString());
    if (!participant) {
      throw new Error('Character is not in this raid');
    }

    // Explicit "is it my turn?" check (mod characters can roll anytime)
    if (!isModTurn) {
      const currentTurnParticipant = raid.getCurrentTurnParticipant();
      if (!currentTurnParticipant || currentTurnParticipant.characterId.toString() !== character._id.toString()) {
        throw new Error(RAID_TURN_ALREADY_PROCESSED_MSG);
      }
    }

    // Prevent double turn advancement: if participant already took action this turn, reject
    if (participant.hasTakenActionThisTurn) {
      throw new Error(RAID_TURN_ALREADY_PROCESSED_MSG);
    }

    // Note: KO'd characters can still take turns in raids (KO status is handled during combat)

    // Generate random roll and apply raid difficulty penalty before calculating final value
    let diceRoll = Math.floor(Math.random() * 100) + 1;
    // Party-size and tier-based penalty: -1 per extra participant, -0.5 per tier above 5 (capped total 15)
    const partySize = (raid.participants || []).length;
    const partyPenalty = Math.max(0, (partySize - 1) * 1);
    const tierPenalty = Math.max(0, ((raid.monster?.tier || 5) - 5) * 0.5);
    const totalPenalty = Math.min(15, partyPenalty + tierPenalty);
    diceRoll = Math.max(1, Math.floor(diceRoll - totalPenalty));
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateRaidFinalValue(character, diceRoll);

    // For expedition raids, use party pool as the source of truth (not character DB)
    // This mirrors how waveModule handles expedition waves
    let characterHeartsBefore = character.currentHearts;
    let battleCharacter = character;
    
    if (raid.expeditionId) {
      const Party = require('@/models/PartyModel');
      const party = await Party.findActiveByPartyId(raid.expeditionId);
      if (party) {
        characterHeartsBefore = Math.max(0, party.totalHearts ?? 0);
        // Ensure maxHearts is valid - if 0 or unset, compute from party.characters array
        let partyMaxHearts = party.maxHearts;
        if (!partyMaxHearts || partyMaxHearts === 0) {
          // Fallback: sum character maxHearts from party.characters array (snapshot at expedition start)
          partyMaxHearts = (party.characters || []).reduce((sum, c) => sum + (c.maxHearts || 0), 0);
          // If still 0, use totalHearts as last resort (shouldn't happen but safety net)
          if (partyMaxHearts === 0) {
            partyMaxHearts = Math.max(1, characterHeartsBefore);
          }
        }
        const plainChar = character.toObject ? character.toObject() : { ...character };
        battleCharacter = { ...plainChar, currentHearts: characterHeartsBefore, maxHearts: partyMaxHearts };
        logger.info('RAID', `Expedition raid turn — using party pool: ${characterHeartsBefore}/${partyMaxHearts} ❤`);
      }
    }
    
    // Process the raid battle turn
    const skipPersist = !!(raid.expeditionId && EXPLORATION_TESTING_MODE);
    const battleResult = await processRaidBattle(
      battleCharacter,
      raid.monster,
      diceRoll,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess,
      characterHeartsBefore,
      { skipPersist: skipPersist || !!raid.expeditionId }
    );

    if (!battleResult) {
      throw new Error('Failed to process raid battle turn');
    }

    // Update participant's damage using the model method with retry logic
    await raid.updateParticipantDamage(character._id, battleResult.hearts);

    // Update monster hearts with retry logic for version conflicts
    let raidUpdateRetries = 0;
    const maxRaidRetries = 3;
    
    while (raidUpdateRetries < maxRaidRetries) {
      try {
        // Update monster hearts
        raid.monster.currentHearts = battleResult.monsterHearts.current;

        // Check if monster is defeated
        if (raid.monster.currentHearts <= 0) {
          // Cancel the scheduled expiration job since raid completed early
          try {
            await scheduler.cancelJob(RAID_EXPIRATION_JOB_NAME, { raidId });
            logger.info('RAID', `Cancelled expiration job for completed raid ${raidId}`);
          } catch (cancelError) {
            logger.warn('RAID', `Failed to cancel expiration job for raid ${raidId}: ${cancelError.message}`);
            // Don't fail the raid completion if job cancellation fails
          }

          await syncExpeditionPartyPoolFromRaid(raid);
          await raid.completeRaid('defeated');
          if (raid.expeditionId && interaction?.client) {
            await notifyExpeditionRaidOver(raid, interaction.client, 'defeated', character);
          }
        } else {
          // Reload character from database to get the latest state (hearts were saved in processRaidBattle)
          const updatedCharacter = await fetchCharacterById(character._id, character.isModCharacter);
          if (updatedCharacter) {
            Object.assign(character, updatedCharacter.toObject ? updatedCharacter.toObject() : updatedCharacter);
          }

          if (character.boostedBy) {
            const { clearBoostAfterUse } = require('../commands/jobs/boosting.js');
            await clearBoostAfterUse(character, {
              client: interaction?.client,
              context: 'raid turn'
            });
            logger.info('RAID', `[raidModule.js] 🎭 Boost cleared for ${character.name} after raid turn`);
          }
          
          // Mark that this participant has taken their action this turn (prevents double advancement)
          participant.hasTakenActionThisTurn = true;
          
          // Advance turn and schedule 1-minute skip only for non-mod turns (mod characters don't affect turn order)
          if (!isModTurn) {
            await raid.advanceTurn();
            try {
              await scheduleRaidTurnSkip(raidId);
            } catch (skipErr) {
              logger.warn('RAID', `Failed to schedule turn skip after turn for ${raidId}: ${skipErr.message}`);
            }
          }
        }

        // Save updated raid data
        await raid.save();
        break; // Success, exit retry loop
        
      } catch (error) {
        if (error.name === 'VersionError' && raidUpdateRetries < maxRaidRetries - 1) {
          raidUpdateRetries++;
          logger.warn('RAID', `[raidModule.js] ⚠️ Version conflict in processRaidTurn, retrying (${raidUpdateRetries}/${maxRaidRetries})`);
          
          // Reload the raid document to get the latest version
          const freshRaid = await Raid.findById(raid._id);
          if (!freshRaid) {
            throw new Error('Raid document not found during retry');
          }
          
          // Update the current raid object with fresh data
          raid.set(freshRaid.toObject());
          
          // Re-validate: turn may have been processed by another request or turn-skip; avoid double-apply
          const participantsAfter = raid.participants || [];
          const participantRef = participantsAfter.find(p => p.characterId.toString() === character._id.toString());
          if (!participantRef) {
            throw new Error(RAID_TURN_ALREADY_PROCESSED_MSG);
          }
          if (!isModTurn) {
            const currentTurnParticipant = raid.getCurrentTurnParticipant();
            if (!currentTurnParticipant || currentTurnParticipant.characterId.toString() !== character._id.toString()) {
              throw new Error(RAID_TURN_ALREADY_PROCESSED_MSG);
            }
          }
          if (participantRef.hasTakenActionThisTurn) {
            throw new Error(RAID_TURN_ALREADY_PROCESSED_MSG);
          }
          participant = participantRef;
          
          continue;
        } else {
          // Re-throw if it's not a version error or we've exhausted retries
          throw error;
        }
      }
    }
    
    if (raidUpdateRetries >= maxRaidRetries) {
      throw new Error(`Failed to update raid after ${maxRaidRetries} retries`);
    }

    // When raid was triggered from exploration, apply damage from this turn to party pool.
    // IMPORTANT: For expeditions, the party pool is the source of truth — do NOT sum from character DB.
    // Only apply the damage dealt this turn (battleResult) to the existing party pool.
    if (raid.expeditionId && battleResult) {
      try {
        const Party = require('@/models/PartyModel');
        const party = await Party.findActiveByPartyId(raid.expeditionId);
        if (party && party.status === 'started') {
          // Calculate damage taken this turn from battleResult
          // Use party.totalHearts as fallback, NOT playerHearts.max (which could be wrong if maxHearts was miscalculated)
          const heartsBefore = battleResult.characterHeartsBefore ?? party.totalHearts ?? 0;
          const heartsAfter = battleResult.playerHearts?.current ?? heartsBefore;
          const damageTaken = Math.max(0, heartsBefore - heartsAfter);
          
          // Apply damage to party pool (don't sum from character DB - that would overwrite pool with stale values)
          const newPartyHearts = Math.max(0, (party.totalHearts ?? 0) - damageTaken);
          party.totalHearts = newPartyHearts;
          party.markModified('totalHearts');
          await party.save();
          logger.info('RAID', `Expedition raid turn — party hearts: ${party.totalHearts} ❤ (damage this turn: ${damageTaken})`);
          
          // Check if party pool hit 0 — trigger immediate expedition failure
          if (newPartyHearts <= 0 && raid.status === 'active') {
            logger.info('RAID', `Expedition raid ${raid.raidId} — party hearts hit 0, triggering expedition failure`);
            
            // Close the raid first (mark as fled since party was KO'd, not monster defeated)
            await cancelRaidTurnSkip(raid.raidId);
            await raid.completeRaid('fled');
            
            // Trigger expedition failure
            const { handleExpeditionFailedFromWave } = require('./exploreModule');
            const failResult = await handleExpeditionFailedFromWave(raid.expeditionId, interaction?.client);
            if (failResult.success) {
              logger.info('RAID', `Expedition ${raid.expeditionId} failed from raid — party KO'd`);
              // Send the failure embed to the raid thread
              if (failResult.embed && raid.threadId && interaction?.client) {
                try {
                  const thread = await interaction.client.channels.fetch(raid.threadId);
                  if (thread) {
                    await thread.send({ embeds: [failResult.embed] });
                  }
                } catch (threadErr) {
                  logger.warn('RAID', `Could not send expedition failure embed to raid thread: ${threadErr.message}`);
                }
              }
            } else {
              logger.warn('RAID', `handleExpeditionFailedFromWave returned error: ${failResult.error}`);
            }
          }
        }
      } catch (syncErr) {
        logger.warn('RAID', `Failed to sync expedition party hearts after raid turn: ${syncErr?.message || syncErr}`);
      }
    }

    // Turn completion logged only in debug mode
    
    return {
      raidId,
      raidData: raid,
      battleResult,
      participant
    };
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'processRaidTurn',
      characterName: character?.name,
      raidId: raidId
    });
    logger.error('RAID', `[raidModule.js] ❌ Error processing raid turn:`, error);
    throw error;
  }
}

// ------------------- checkRaidExpiration ------------------
// Checks if a raid has expired and handles the timeout consequences
async function checkRaidExpiration(raidId, client = null) {
  try {
    // Retrieve raid from database
    const raid = await Raid.findOne({ raidId: raidId });
    if (!raid) {
      return null;
    }

    // Skip if raid is already completed
    if (raid.status !== 'active') {
      return raid;
    }

    // Check if raid has expired
    if (raid.isExpired()) {
      logger.info('RAID', `Raid ${raidId} has expired`);

      // Cancel any scheduled expiration job (in case it's still pending)
      try {
        await scheduler.cancelJob(RAID_EXPIRATION_JOB_NAME, { raidId });
      } catch (cancelError) {
        // Ignore cancellation errors - job may have already run or been cancelled
      }

      // Mark raid as failed and KO all participants (idempotent)
      await raid.failRaid(client);

      if (raid.expeditionId && client) {
        await notifyExpeditionRaidOver(raid, client, 'timeout');
      }

      // Try to send failure message if client is available
      if (client) {
        try {
          const buildFailureEmbed = () => new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💥 **Raid Failed!**')
            .setDescription(`The raid against **${raid.monster.name}** has failed!`)
            .addFields(
              {
                name: '__Monster Status__',
                value: `💙 **Hearts:** ${raid.monster.currentHearts}/${raid.monster.maxHearts}`,
                inline: false
              },
              {
                name: '__Participants__',
                value: (raid.participants && raid.participants.length > 0)
                  ? raid.participants.map(p => `• **${p.name}** (${p.damage} hearts) - **KO'd**`).join('\n')
                  : 'No participants',
                inline: false
              },
              {
                name: '__Failure__',
                value: (raid.participants && raid.participants.length > 0)
                  ? `All participants have been knocked out! 💀`
                  : `The monster caused havoc as no one defended the village from it and then ran off!`,
                inline: false
              }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: `Raid ID: ${raidId}` })
            .setTimestamp();

          // Try to send failure message to thread, else fall back to the original channel
          let sent = false;
          if (raid.threadId) {
            try {
              const thread = await client.channels.fetch(raid.threadId);
              if (thread) {
                await thread.send({ embeds: [buildFailureEmbed()] });
                logger.info('RAID', 'Failure message sent to raid thread');
                sent = true;
              }
            } catch (threadError) {
              logger.error('RAID', `Error sending failure message to thread: ${threadError.message}`);
            }
          }

          if (!sent && raid.channelId) {
            try {
              const channel = await client.channels.fetch(raid.channelId);
              if (channel) {
                await channel.send({ embeds: [buildFailureEmbed()] });
                logger.info('RAID', 'Failure message sent to raid channel (fallback)');
                sent = true;
              }
            } catch (channelError) {
              logger.error('RAID', `Error sending failure message to channel: ${channelError.message}`);
            }
          }
        } catch (messageError) {
          logger.error('RAID', `Error sending failure message: ${messageError.message}`);
          // Don't fail the expiration check if message sending fails
        }
      }

      logger.info('RAID', `Raid ${raidId} failed (timeout) - participants KO'd`);
    }

    return raid;
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'checkRaidExpiration',
      raidId: raidId
    });
    logger.error('RAID', `Error checking raid expiration: ${error.message}`);
    throw error;
  }
}

// ------------------- createRaidThread ------------------
// Creates a Discord thread for raid communication
async function createRaidThread(interaction, raid) {
  try {
    const villageName = capitalizeVillageName(raid.village);
    const emoji = '🛡️';
    const threadName = `${emoji} ${villageName} - ${raid.monster.name} (Tier ${raid.monster.tier})`;

    // Create the thread
    const thread = await interaction.fetchReply().then(message =>
      message.startThread({
        name: threadName,
        autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
        reason: `Raid initiated against ${raid.monster.name}`
      })
    );

    // Create the initial thread message - use universal raid role for village raids; skip @ for expedition raids (party-only)
    const isExpeditionRaid = !!raid.expeditionId;
    const roleMention = isExpeditionRaid ? null : `<@&${UNIVERSAL_RAID_ROLE}>`;
    const raidAnnounceEmbed = await createRaidEmbed(raid, raid.monster?.image);

    // Send embed to the thread (mention in content so it pings — only for village raids)
    await thread.send({ content: roleMention || undefined, embeds: [raidAnnounceEmbed] });

    // Update raid with thread information
    raid.threadId = thread.id;
    raid.messageId = interaction.id;
    await raid.save();

    return thread;
  } catch (error) {
    logger.error('RAID', `[raidModule.js] ❌ Error creating raid thread: ${error.message}`);
    return null;
  }
}

// ------------------- createRaidEmbed ------------------
// Creates an embed for displaying raid information. Async when raid.expeditionId is set (loads party for hearts/stamina).
async function createRaidEmbed(raid, monsterImage) {
  const villageName = capitalizeVillageName(raid.village);
  const villageEmoji = getVillageEmojiByName(raid.village) || '';

  // Timer: only for normal village raids; expedition raids have no time limit
  const isExpeditionRaid = !!raid.expeditionId;
  const now = new Date();
  const expiresAt = new Date(raid.expiresAt);
  const timeRemaining = expiresAt.getTime() - now.getTime();

  let timeString = '';
  if (!isExpeditionRaid) {
    if (timeRemaining > 0) {
      const minutes = Math.floor(timeRemaining / (1000 * 60));
      const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
      timeString = `${minutes}m ${seconds}s remaining`;
    } else {
      timeString = '⏰ Time expired!';
    }
  }

  const totalDuration = calculateRaidDuration(raid.monster.tier);
  const totalMinutes = Math.floor(totalDuration / (1000 * 60));
  const descriptionLines = isExpeditionRaid
    ? [
      `**${raid.monster.name} has been spotted!**`,
      `*It's a Tier ${raid.monster.tier} monster! Defeat it to continue your expedition.*`,
      '',
    ]
    : [
      `**${raid.monster.name} has been spotted in ${villageName}!**`,
      `*It's a Tier ${raid.monster.tier} monster! Protect the village!*`,
      '',
    ];
  descriptionLines.push(
    `</raid:1470659276287774734> to join or continue the raid!`,
    `</item:${getItemCommandId()}> to heal during the raid!`
  );
  if (!isExpeditionRaid) {
    descriptionLines.push('', `⏰ **You have ${totalMinutes} minutes to complete this raid!**`);
  }
  const description = descriptionLines.join('\n');

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle(isExpeditionRaid ? '🛡️ Expedition Raid!' : '🛡️ Village Raid!')
    .setDescription(description)
    .addFields(
      {
        name: `__${raid.monster.name}__`,
        value: `💙 **Hearts:** ${raid.monster.currentHearts}/${raid.monster.maxHearts}\n⭐ **Tier:** ${raid.monster.tier}`,
        inline: false
      },
      {
        name: `__Location__`,
        value: `${villageEmoji} ${villageName}`,
        inline: false
      },
      ...(isExpeditionRaid ? [] : [{
        name: `__⏰ Time Remaining__`,
        value: `**${timeString}**`,
        inline: false
      }]),
      {
        name: `__Raid ID__`,
        value: `\u0060\u0060\u0060${raid.raidId}\u0060\u0060\u0060`,
        inline: false
      }
    )
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png')
    .setTimestamp();

  if (raid.expeditionId) {
    const exploreCmdId = getExploreCommandId();
    const cmdRoll = typeof exploreCmdId === 'string' && exploreCmdId
      ? chatInputApplicationCommandMention('explore', 'roll', exploreCmdId)
      : '`/explore roll`';
    const isGrottoRaid = !!raid.grottoId;
    const cmdRetreat = typeof exploreCmdId === 'string' && exploreCmdId
      ? chatInputApplicationCommandMention('explore', 'retreat', exploreCmdId)
      : '`/explore retreat`';
    let expeditionValue = `Only members of expedition **${raid.expeditionId}** can join. After the raid, use ${cmdRoll} with id \`${raid.expeditionId}\` to continue.`;
    if (!isGrottoRaid) {
      expeditionValue += `\n\n**Escape:** You can try to escape with ${cmdRetreat} (id: \`${raid.expeditionId}\`, your character) — costs 1 stamina per attempt, not guaranteed.`;
    }
    embed.addFields({
      name: '🗺️ __Expedition raid__',
      value: expeditionValue,
      inline: false
    });
    // Add party hearts and stamina for expedition raids
    try {
      const Party = require('@/models/PartyModel');
      const party = await Party.findActiveByPartyId(raid.expeditionId);
      if (party && (typeof party.totalHearts === 'number' || typeof party.totalStamina === 'number')) {
        const hearts = typeof party.totalHearts === 'number' ? party.totalHearts : 0;
        const stamina = typeof party.totalStamina === 'number' ? party.totalStamina : 0;
        embed.addFields({
          name: '❤️ **__Party Hearts__**',
          value: `**${hearts}** ❤ · **${stamina}** 🟩 stamina`,
          inline: true
        });
      }
    } catch (e) {
      logger.warn('RAID', `Could not load party for expedition raid embed: ${e?.message || e}`);
    }
  }

  // Add monster image as thumbnail if available
  if (monsterImage && monsterImage !== 'No Image') {
    embed.setThumbnail(monsterImage);
  }

  return embed;
}

// ------------------- formatCooldownRemaining ------------------
// Returns { hours, minutes } for remainingMs (for cooldown error messages).
function formatCooldownRemaining(remainingMs) {
  const hours = Math.floor(remainingMs / (1000 * 60 * 60));
  const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}

// ------------------- triggerRaid ------------------
// Triggers a raid in the specified channel
// expeditionId: when set, raid is linked to that expedition (only party members can join; skip global cooldown)
async function triggerRaid(monster, interaction, villageId, isBloodMoon = false, character = null, isQuotaBased = false, expeditionId = null, grottoId = null) {
  try {
    logger.info('RAID', `[raidModule.js] 🐉 Starting raid trigger: ${monster.name} in ${villageId}${expeditionId ? ` (expedition ${expeditionId})` : ''}${grottoId ? ' (Grotto)' : ''}`);

    // ------------------- Global Raid Cooldown Check -------------------
    // For Blood Moon, quota-based, and expedition raids, skip global cooldown
    if (!isBloodMoon && !isQuotaBased && !expeditionId) {
      const currentTime = Date.now();
      const lastRaidTime = await getGlobalRaidCooldown();
      const timeSinceLastRaid = currentTime - lastRaidTime;
      const RAID_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      
      if (timeSinceLastRaid < RAID_COOLDOWN) {
        const { hours, minutes } = formatCooldownRemaining(RAID_COOLDOWN - timeSinceLastRaid);
        return {
          success: false,
          error: `Raid cooldown active. Please wait ${hours}h ${minutes}m before triggering another raid.`
        };
      }
      
      await setGlobalRaidCooldown(currentTime);
    }
    
    // ------------------- Per-Village Raid Cooldown Check (for quota-based raids) -------------------
    // Quota-based raids have their own per-village cooldown to prevent the same village from triggering too frequently
    if (isQuotaBased) {
      const currentTime = Date.now();
      const lastRaidTime = await getVillageRaidCooldown(villageId);
      const timeSinceLastRaid = currentTime - lastRaidTime;
      
      if (timeSinceLastRaid < VILLAGE_RAID_COOLDOWN) {
        const { hours, minutes } = formatCooldownRemaining(VILLAGE_RAID_COOLDOWN - timeSinceLastRaid);
        return {
          success: false,
          error: `Village raid cooldown active. ${villageId} must wait ${hours}h ${minutes}m before another quota-based raid can be triggered.`
        };
      }
    }
    
    // Start the raid
    const { raidId, raidData } = await startRaid(monster, villageId, interaction, expeditionId, grottoId);
    
    // Automatically add character to raid if provided (from loot command)
    if (character) {
      try {
        await joinRaid(character, raidId, {
          client: interaction.client,
          guild: interaction.guild
        });

        if (expeditionId && raidData.expeditionId) {
          const Party = require('@/models/PartyModel');
          const Character = require('@/models/CharacterModel');
          const party = await Party.findActiveByPartyId(expeditionId);
          if (party?.characters?.length > 1) {
            const triggerIdx = party.characters.findIndex(c => c._id && character._id && c._id.toString() === character._id.toString());
            if (triggerIdx >= 0) {
              const n = party.characters.length;
              for (let i = 1; i < n; i++) {
                const slot = party.characters[(triggerIdx + i) % n];
                if (!slot?._id) continue;
                try {
                  const charDoc = await Character.findById(slot._id);
                  if (!charDoc) continue;
                  await joinRaid(charDoc, raidId, { client: interaction.client, guild: interaction.guild });
                } catch (err) {
                  logger.warn('RAID', `[raidModule.js] ⚠️ Could not auto-add ${slot.name} to expedition raid: ${err.message}`);
                }
              }
            }
          }
        }
      } catch (joinError) {
        logger.warn('RAID', `[raidModule.js] ⚠️ Failed to auto-add character ${character.name} to raid: ${joinError.message}`);
      }
    }

    // Re-fetch raid so we have the full participants list for expedition turn ping (raidData from startRaid is stale after joinRaid calls)
    let raidForTurnPing = raidData;
    if (expeditionId && raidData.expeditionId) {
      try {
        const refreshed = await Raid.findOne({ raidId });
        if (refreshed && refreshed.participants && refreshed.participants.length > 0) {
          raidForTurnPing = refreshed;
          // Assign party pool to raid participants (pooled hearts/stamina: loan pool to participants for raid)
          const Party = require('@/models/PartyModel');
          const party = await Party.findActiveByPartyId(expeditionId);
          if (party && party.status === 'started') {
            const poolHearts = Math.max(0, party.totalHearts ?? 0);
            const poolStamina = Math.max(0, party.totalStamina ?? 0);
            logger.info('RAID', `[raidModule.js] 🗺️ Expedition raid started — party pool: ${poolHearts} ❤, ${poolStamina} 🟩`);
          }
        }
      } catch (e) {
        logger.warn('RAID', `[raidModule.js] ⚠️ Could not re-fetch raid for turn ping: ${e?.message || e}`);
      }
    }

    // Create the raid embed
    const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping] 
      ? monsterMapping[monster.nameMapping] 
      : { image: monster.image };
    const monsterImage = monsterDetails.image || monster.image;
    const embed = await createRaidEmbed(raidData, monsterImage);

    const raidMessage = await interaction.channel.send({
      content: isBloodMoon ? `🌙 **BLOOD MOON RAID!**` : expeditionId ? `🗺️ **EXPEDITION RAID!**` : isQuotaBased ? `📅 **VILLAGE RAID!**` : `⚠️ **RAID TRIGGERED!** ⚠️`,
      embeds: [embed]
    });

    // Create the raid thread with error handling
    let thread = null;
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const freshMessage = await interaction.channel.messages.fetch(raidMessage.id);
      thread = await freshMessage.startThread({
        name: `🛡️ ${villageId} - ${monster.name} (T${monster.tier})`,
        autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
        reason: `Raid thread for ${monster.name} in ${villageId}`
      });

      // Verify thread was created properly
      if (!thread || !thread.id) {
        throw new Error('Failed to create raid thread');
      }

      // Send initial thread message: @ raid role for village raids only; expedition raids = party-only, no @
      const isExpeditionRaid = !!raidData.expeditionId;
      const roleMention = isExpeditionRaid ? null : `<@&${UNIVERSAL_RAID_ROLE}>`;
      const threadRaidEmbed = await createRaidEmbed(raidData, raidData.monster?.image);
      await thread.send({ content: roleMention || undefined, embeds: [threadRaidEmbed] });

      // Expedition raid: ping the raid's current-turn participant in the thread (turn order was auto-set when raid started)
      if (raidForTurnPing.expeditionId && raidForTurnPing.participants && raidForTurnPing.participants.length > 0) {
        const currentIdx = typeof raidForTurnPing.currentTurn === 'number' ? raidForTurnPing.currentTurn % raidForTurnPing.participants.length : 0;
        const firstTurn = raidForTurnPing.participants[currentIdx];
        if (firstTurn?.userId) {
          try {
            await thread.send({ content: `<@${firstTurn.userId}> — **you're up next.** Use \`/raid\` to take your turn.` });
          } catch (pingErr) {
            logger.warn('RAID', `[raidModule.js] ⚠️ Could not send expedition turn ping: ${pingErr?.message || pingErr}`);
          }
        }
      }

      // Update raid data with thread information
      raidData.threadId = thread.id;
      raidData.messageId = raidMessage.id;
      await raidData.save();

    } catch (threadError) {
      logger.warn('RAID', `[raidModule.js] ⚠️ Could not create thread: ${threadError.message}. Raid continues without thread.`);
      
      // Send the raid information as a follow-up: @ raid role for village raids only; expedition = no @
      const isExpeditionRaidFallback = !!raidData.expeditionId;
      const roleMentionFallback = isExpeditionRaidFallback ? null : `<@&${UNIVERSAL_RAID_ROLE}>`;
      const raidAnnounceEmbed = await createRaidEmbed(raidData, raidData.monster?.image);
      raidAnnounceEmbed.addFields({
        name: '📌 Note',
        value: '*No thread was created in this channel. Use the Raid ID above with </raid:1470659276287774734> to participate!*',
        inline: false
      });
      const payload = { content: roleMentionFallback || undefined, embeds: [raidAnnounceEmbed] };

      if (interaction && typeof interaction.followUp === 'function') {
        await interaction.followUp(payload);
      } else {
        await interaction.channel.send(payload);
      }
      
      // Update raid data without thread information
      raidData.messageId = raidMessage.id;
      raidData.channelId = interaction.channel.id;
      await raidData.save();
    }

    if (isQuotaBased) {
      await setVillageRaidCooldown(villageId, Date.now());
    }

    logger.info('RAID', `[raidModule.js] 🐉 Triggered raid ${raidId} - ${monster.name} (T${monster.tier}) in ${villageId}${isBloodMoon ? ' (Blood Moon)' : ''}${isQuotaBased ? ' (Quota-based)' : ''}`);

    return {
      success: true,
      raidId: raidId,
      raidData: raidData,
      thread: thread,
      message: raidMessage
    };

  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'triggerRaid',
      monsterName: monster?.name,
      villageId: villageId,
      isBloodMoon: isBloodMoon
    });
    logger.error('RAID', `[raidModule.js] ❌ Error triggering raid:`, error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  startRaid,
  joinRaid,
  leaveRaid,
  processRaidTurn,
  processRaidBattle,
  checkRaidExpiration,
  createRaidEmbed,
  createRaidThread,
  triggerRaid,
  endExplorationRaidAsRetreat,
  closeRaidsForExpedition,
  calculateRaidDuration,
  scheduleRaidTurnSkip,
  cancelRaidTurnSkip,
  advanceRaidTurnOnItemUse,
  applyPartySizeScalingToRaid,
  RAID_EXPIRATION_JOB_NAME,
  RAID_TURN_SKIP_JOB_NAME
};
