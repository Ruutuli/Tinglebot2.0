// ============================================================================
// ------------------- Discord Role Service -------------------
// Handles Discord role assignment for characters
// ============================================================================

const logger = require('../utils/logger');
const { getJobPerk } = require('../modules/jobsModule');

/**
 * Assign Discord roles to user when character is accepted
 * @param {Object} character - Character document
 * @returns {Promise<void>}
 */
async function assignCharacterRoles(character) {
  try {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    const GUILD_ID = process.env.PROD_GUILD_ID;
    
    if (!DISCORD_TOKEN || !GUILD_ID) {
      logger.warn('DISCORD_ROLES', 'DISCORD_TOKEN or PROD_GUILD_ID not configured, skipping role assignment');
      return;
    }
    
    // Village resident role IDs
    const VILLAGE_RESIDENT_ROLES = {
      'Rudania': '907344585238409236',
      'Inariko': '907344454854266890',
      'Vhintl': '907344092491554906'
    };
    
    // Map job names to their role IDs (from environment variables)
    const jobRoleIdMap = {
      'Adventurer': process.env.JOB_ADVENTURER,
      'Artist': process.env.JOB_ARTIST,
      'Bandit': process.env.JOB_BANDIT,
      'Beekeeper': process.env.JOB_BEEKEEPER,
      'Blacksmith': process.env.JOB_BLACKSMITH,
      'Cook': process.env.JOB_COOK,
      'Courier': process.env.JOB_COURIER,
      'Craftsman': process.env.JOB_CRAFTSMAN,
      'Farmer': process.env.JOB_FARMER,
      'Fisherman': process.env.JOB_FISHERMAN,
      'Forager': process.env.JOB_FORAGER,
      'Fortune Teller': process.env.JOB_FORTUNE_TELLER,
      'Graveskeeper': process.env.JOB_GRAVESKEEPER,
      'Guard': process.env.JOB_GUARD,
      'Healer': process.env.JOB_HEALER,
      'Herbalist': process.env.JOB_HERBALIST,
      'Hunter': process.env.JOB_HUNTER,
      'Mask Maker': process.env.JOB_MASK_MAKER,
      'Merchant': process.env.JOB_MERCHANT,
      'Mercenary': process.env.JOB_MERCENARY,
      'Miner': process.env.JOB_MINER,
      'Oracle': process.env.JOB_ORACLE,
      'Priest': process.env.JOB_PRIEST,
      'Rancher': process.env.JOB_RANCHER,
      'Researcher': process.env.JOB_RESEARCHER,
      'Scout': process.env.JOB_SCOUT,
      'Scholar': process.env.JOB_SCHOLAR,
      'Shopkeeper': process.env.JOB_SHOPKEEPER,
      'Stablehand': process.env.JOB_STABLEHAND,
      'Teacher': process.env.JOB_TEACHER,
      'Villager': process.env.JOB_VILLAGER,
      'Weaver': process.env.JOB_WEAVER,
      'Witch': process.env.JOB_WITCH,
      'Entertainer': process.env.JOB_ENTERTAINER
    };
    
    // Map job perks to their IDs
    const jobPerkIdMap = {
      'LOOTING': process.env.JOB_PERK_LOOTING,
      'STEALING': process.env.JOB_PERK_STEALING,
      'ENTERTAINING': process.env.JOB_PERK_ENTERTAINING,
      'DELIVERING': process.env.JOB_PERK_DELIVERING,
      'HEALING': process.env.JOB_PERK_HEALING,
      'GATHERING': process.env.JOB_PERK_GATHERING,
      'CRAFTING': process.env.JOB_PERK_CRAFTING,
      'BOOST': process.env.JOB_PERK_BOOST || process.env.JOB_PERK_BOOSTING,
      'VENDING': process.env.JOB_PERK_VENDING
    };
    
    // Race role name mapping (we'll find these by name from the guild)
    const raceRoleNames = {
      'Gerudo': 'Race: Gerudo',
      'Goron': 'Race: Goron',
      'Hylian': 'Race: Hylian',
      'Keaton': 'Race: Keaton',
      'Korok/Kokiri': 'Race: Korok/Kokiri',
      'Kokiri': 'Race: Korok/Kokiri',
      'Mixed': 'Race: Mixed',
      'Mogma': 'Race: Mogma',
      'Rito': 'Race: Rito',
      'Sheikah': 'Race: Sheikah',
      'Twili': 'Race: Twili',
      'Zora': 'Race: Zora'
    };
    
    // Get all guild roles to find race roles by name
    const rolesResponse = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!rolesResponse.ok) {
      logger.error('DISCORD_ROLES', `Failed to fetch guild roles: ${rolesResponse.status}`);
      return;
    }
    
    const guildRoles = await rolesResponse.json();
    
    // Get member to check current roles
    const memberResponse = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${character.userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!memberResponse.ok) {
      logger.warn('DISCORD_ROLES', `Member not found in guild: ${character.userId}`);
      return;
    }
    
    const member = await memberResponse.json();
    const currentRoleIds = member.roles || [];
    const rolesToAdd = [];
    const rolesToRemove = [];
    
    // Role IDs for OC approval
    const APPROVED_OC_ROLE_ID = '788137728943325185'; // Role to add when approved
    const PENDING_OC_ROLE_ID = '788137818135330837'; // Role to remove when approved
    
    // Add approved OC role
    if (!currentRoleIds.includes(APPROVED_OC_ROLE_ID)) {
      rolesToAdd.push(APPROVED_OC_ROLE_ID);
      logger.info('DISCORD_ROLES', `Adding approved OC role: ${APPROVED_OC_ROLE_ID}`);
    } else {
      logger.info('DISCORD_ROLES', `User already has approved OC role`);
    }
    
    // Remove pending OC role if present
    if (currentRoleIds.includes(PENDING_OC_ROLE_ID)) {
      rolesToRemove.push(PENDING_OC_ROLE_ID);
      logger.info('DISCORD_ROLES', `Removing pending OC role: ${PENDING_OC_ROLE_ID}`);
    }
    
    // Add village resident role
    // Village names are stored lowercase, so we need to capitalize properly
    let villageName = null;
    if (character.homeVillage) {
      const lowerVillage = character.homeVillage.toLowerCase();
      // Map lowercase to proper case
      if (lowerVillage === 'inariko') villageName = 'Inariko';
      else if (lowerVillage === 'rudania') villageName = 'Rudania';
      else if (lowerVillage === 'vhintl') villageName = 'Vhintl';
      else villageName = character.homeVillage.charAt(0).toUpperCase() + character.homeVillage.slice(1).toLowerCase();
    }
    const villageRoleId = villageName ? VILLAGE_RESIDENT_ROLES[villageName] : null;
    if (villageRoleId && !currentRoleIds.includes(villageRoleId)) {
      rolesToAdd.push(villageRoleId);
      logger.info('DISCORD_ROLES', `Adding village role for ${villageName}: ${villageRoleId}`);
    } else if (villageRoleId) {
      logger.info('DISCORD_ROLES', `User already has village role for ${villageName}`);
    } else if (character.homeVillage) {
      logger.warn('DISCORD_ROLES', `No village role ID found for village: ${villageName || character.homeVillage}`);
    }
    
    // Add race role (find by name)
    // Handle race case-insensitively
    const characterRace = character.race ? character.race.charAt(0).toUpperCase() + character.race.slice(1).toLowerCase() : null;
    const raceRoleName = characterRace ? (raceRoleNames[characterRace] || `Race: ${characterRace}`) : null;
    if (raceRoleName) {
      const raceRole = guildRoles.find(r => r.name === raceRoleName);
      if (raceRole && !currentRoleIds.includes(raceRole.id)) {
        rolesToAdd.push(raceRole.id);
        logger.info('DISCORD_ROLES', `Adding race role: ${raceRoleName} (${raceRole.id})`);
      } else if (raceRole) {
        logger.info('DISCORD_ROLES', `User already has race role: ${raceRoleName}`);
      } else {
        logger.warn('DISCORD_ROLES', `Race role not found in guild: ${raceRoleName}`);
      }
    } else {
      logger.warn('DISCORD_ROLES', `No race role name determined for race: ${character.race}`);
    }
    
    // Add job role
    const jobRoleId = character.job ? jobRoleIdMap[character.job] : null;
    if (jobRoleId && !currentRoleIds.includes(jobRoleId)) {
      rolesToAdd.push(jobRoleId);
      logger.info('DISCORD_ROLES', `Adding job role for ${character.job}: ${jobRoleId}`);
    } else if (jobRoleId) {
      logger.info('DISCORD_ROLES', `User already has job role for ${character.job}`);
    } else if (character.job) {
      logger.warn('DISCORD_ROLES', `No job role ID found for job: ${character.job}`);
    }
    
    // Add job perk roles
    const jobPerkInfo = character.job ? getJobPerk(character.job) : null;
    if (jobPerkInfo && jobPerkInfo.perks) {
      for (const perk of jobPerkInfo.perks) {
        if (perk === 'NONE' || perk === 'N/A' || perk === 'ALL') continue;
        
        const perkRoleId = jobPerkIdMap[perk];
        if (perkRoleId && !currentRoleIds.includes(perkRoleId)) {
          rolesToAdd.push(perkRoleId);
          logger.info('DISCORD_ROLES', `Adding job perk role: ${perk} (${perkRoleId})`);
        } else if (perkRoleId) {
          logger.info('DISCORD_ROLES', `User already has job perk role: ${perk}`);
        } else {
          logger.warn('DISCORD_ROLES', `No job perk role ID found for perk: ${perk}`);
        }
      }
    }
    
    // Assign all roles at once (add new roles, remove specified roles)
    if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
      // Start with current roles, add new ones, remove specified ones
      const newRoles = currentRoleIds
        .filter(roleId => !rolesToRemove.includes(roleId)) // Remove roles that should be removed
        .concat(rolesToAdd.filter(roleId => !currentRoleIds.includes(roleId))); // Add new roles that aren't already present
      
      const changes = [];
      if (rolesToAdd.length > 0) changes.push(`adding ${rolesToAdd.length} role(s): ${rolesToAdd.join(', ')}`);
      if (rolesToRemove.length > 0) changes.push(`removing ${rolesToRemove.length} role(s): ${rolesToRemove.join(', ')}`);
      
      logger.info('DISCORD_ROLES', `Attempting to update roles for user ${character.userId} for character ${character.name}. ${changes.join(', ')}`);
      
      const updateResponse = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/members/${character.userId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roles: newRoles
        })
      });
      
      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        logger.error('DISCORD_ROLES', `Failed to update roles: ${updateResponse.status} - ${errorText}. Character: ${character.name}, User: ${character.userId}, Changes attempted: ${changes.join(', ')}`);
        throw new Error(`Discord API error: ${updateResponse.status} - ${errorText}`);
      }
      
      logger.success('DISCORD_ROLES', `Successfully updated roles for user ${character.userId} for character ${character.name}. ${changes.join(', ')}`);
    } else {
      logger.info('DISCORD_ROLES', `No role changes needed for character ${character.name} (user may already have all required roles and no roles to remove)`);
    }
  } catch (error) {
    logger.error('DISCORD_ROLES', 'Error assigning character roles', error);
    // Don't throw - role assignment failure shouldn't break the approval flow
  }
}

module.exports = {
  assignCharacterRoles
};
