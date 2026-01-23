// ============================================================================
// ------------------- Character API Routes -------------------
// Routes for character data and operations
// ============================================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const Character = require('../../models/CharacterModel');
const ModCharacter = require('../../models/ModCharacterModel');
const CharacterModeration = require('../../models/CharacterModerationModel');
const User = require('../../models/UserModel');
const { asyncHandler, NotFoundError } = require('../../middleware/errorHandler');
const { validateObjectId } = require('../../middleware/validation');
const logger = require('../../utils/logger');
const { 
  connectToInventoriesNative,
  connectToTinglebot,
  createCharacter,
  createCharacterInventory,
  getOrCreateUser,
  getCharacterInventoryCollection,
  fetchItemByName
} = require('../../database/db');
const { 
  isUniqueCharacterName,
  isValidRace
} = require('../../utils/validation');
// Import job data and create validation functions
const { jobPerks, villageJobs, allJobs } = require('../../data/jobData');

// Simple validation functions using dashboard's jobData
function isValidJob(job) {
  if (!job || typeof job !== 'string') return false;
  const normalizedJob = job.toLowerCase().trim();
  return allJobs.some(j => j.toLowerCase() === normalizedJob);
}

function isVillageExclusiveJob(job) {
  if (!job || typeof job !== 'string') return null;
  const normalizedJob = job.toLowerCase();
  for (const [village, jobs] of Object.entries(villageJobs)) {
    if (jobs.map(j => j.toLowerCase()).includes(normalizedJob)) {
      return village;
    }
  }
  return null;
}
const { isValidVillage } = require('../../modules/locationsModule');
const { getJobPerk } = require('../../modules/jobsModule');
const bucket = require('../../config/gcsService');

// Multer configuration for character icon and appArt uploads to Google Cloud Storage
const characterIconUpload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 7 * 1024 * 1024 // 7MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed!'), false);
      return;
    }
    // Additional validation for image types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed!'), false);
      return;
    }
    cb(null, true);
  }
});

// Multer configuration for both icon and appArt uploads
const characterUploads = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 7 * 1024 * 1024, // 7MB limit per file
    files: 2 // Allow up to 2 files (icon and appArt)
  },
  fileFilter: function (req, file, cb) {
    // Accept images only
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Only image files are allowed!'), false);
      return;
    }
    // Additional validation for image types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed!'), false);
      return;
    }
    cb(null, true);
  }
}).fields([
  { name: 'icon', maxCount: 1 },
  { name: 'appArt', maxCount: 1 }
]);

// Helper function to post character creation to Discord
async function postCharacterCreationToDiscord(character, user, reqUser, req = null) {
  try {
    const CHARACTER_CREATION_CHANNEL_ID = process.env.ADMIN_REVIEW_CHANNEL_ID || process.env.CHARACTER_CREATION_CHANNEL_ID || '964342870796537909';
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    
    if (!DISCORD_TOKEN) {
      logger.warn('SERVER', 'DISCORD_TOKEN not configured, skipping Discord post');
      return;
    }

    // Helper functions for formatting
    const capitalize = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    };

    const capitalizeFirstLetter = (str) => {
      if (!str) return '';
      return str.charAt(0).toUpperCase() + str.slice(1);
    };

    const convertCmToFeetInches = (heightInCm) => {
      const totalInches = heightInCm / 2.54;
      const feet = Math.floor(totalInches / 12);
      const inches = Math.round(totalInches % 12);
      return `${feet}' ${inches}"`;
    };

    // Get village emoji (simple mapping)
    const getVillageEmoji = (village) => {
      const emojiMap = {
        'inariko': '🌊',
        'rudania': '🔥',
        'vhintl': '🌿'
      };
      return emojiMap[village?.toLowerCase()] || '';
    };

    const heightInFeetInches = character.height ? convertCmToFeetInches(character.height) : 'N/A';
    const homeVillageEmoji = getVillageEmoji(character.homeVillage);
    const currentVillageEmoji = getVillageEmoji(character.currentVillage);

    // Build gear info
    const gearInfo = [];
    if (character.gearWeapon?.name) {
      gearInfo.push(`🗡️ **Weapon:** ${character.gearWeapon.name}`);
    }
    if (character.gearShield?.name) {
      gearInfo.push(`🛡️ **Shield:** ${character.gearShield.name}`);
    }
    if (character.gearArmor?.chest?.name) {
      gearInfo.push(`👕 **Chest:** ${character.gearArmor.chest.name}`);
    }
    if (character.gearArmor?.legs?.name) {
      gearInfo.push(`👖 **Legs:** ${character.gearArmor.legs.name}`);
    }
    const gearText = gearInfo.length > 0 ? gearInfo.join('\n') : 'None selected';

    // Get base URL for moderation link - use tinglebot.xyz
    const moderationUrl = 'https://tinglebot.xyz/character-moderation';

    // Get user's Discord avatar URL
    const userDiscordId = reqUser?.discordId || user?.discordId || character.userId;
    const userAvatar = reqUser?.avatar || user?.avatar;
    const userAvatarUrl = userAvatar 
      ? `https://cdn.discordapp.com/avatars/${userDiscordId}/${userAvatar}.png?size=256`
      : `https://cdn.discordapp.com/embed/avatars/${(parseInt(userDiscordId) || 0) % 5}.png`;

    // Create embed with improved styling - cleaner layout
    const embed = {
      title: `✨ New Character Created: ${character.name}`,
      description: `A new character has been submitted and is awaiting moderation review.`,
      color: 0xFFA500, // Orange for pending status
      thumbnail: {
        url: userAvatarUrl
      },
      image: {
        url: character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
      },
      fields: [
        {
          name: '👤 Character Information',
          value: `**Name:** ${character.name}\n**Pronouns:** ${character.pronouns}\n**Age:** ${character.age}\n**Height:** ${character.height} cm (${heightInFeetInches})`,
          inline: false
        },
        {
          name: '🏘️ Location & Job',
          value: `**Race:** ${capitalize(character.race)}\n**Home Village:** ${homeVillageEmoji} ${capitalizeFirstLetter(character.homeVillage)}\n**Job:** ${capitalizeFirstLetter(character.job)}`,
          inline: false
        },
        {
          name: '❤️ Stats',
          value: `**Hearts:** ${character.currentHearts}/${character.maxHearts}\n**Stamina:** ${character.currentStamina}/${character.maxStamina}\n**Attack:** ${character.attack || 0}\n**Defense:** ${character.defense || 0}`,
          inline: false
        },
        {
          name: '⚔️ Starting Gear',
          value: gearText || 'None selected',
          inline: false
        },
        {
          name: '🔗 Links',
          value: `[📋 View Application](${character.appLink})\n[⚖️ Review in Moderation Panel](${moderationUrl})`,
          inline: false
        }
      ],
      footer: {
        text: `Created by ${reqUser?.username || user?.username || 'Unknown'} • Status: Pending Review`
      },
      timestamp: new Date().toISOString()
    };

    // Get user mention (reusing userDiscordId from line 166)
    const userMention = userDiscordId ? `<@${userDiscordId}>` : '';

    // Post to Discord
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${CHARACTER_CREATION_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: userMention || undefined,
        embeds: [embed]
      })
    });

    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      logger.error('SERVER', `Failed to post character creation to Discord: ${discordResponse.status} - ${errorText}`);
      return;
    }

    logger.success('SERVER', `Character creation posted to Discord: ${character.name}`);
  } catch (error) {
    logger.error('SERVER', 'Error posting character creation to Discord', error);
    // Don't throw - Discord posting failure shouldn't break character creation
  }
}

// Assign Discord roles to user when character is accepted
async function assignCharacterRoles(character) {
  try {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    const GUILD_ID = process.env.PROD_GUILD_ID;
    
    if (!DISCORD_TOKEN || !GUILD_ID) {
      logger.warn('CHARACTERS', 'DISCORD_TOKEN or PROD_GUILD_ID not configured, skipping role assignment');
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
      logger.error('CHARACTERS', `Failed to fetch guild roles: ${rolesResponse.status}`);
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
      logger.warn('CHARACTERS', `Member not found in guild: ${character.userId}`);
      return;
    }
    
    const member = await memberResponse.json();
    const currentRoleIds = member.roles || [];
    const rolesToAdd = [];
    
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
      logger.info('CHARACTERS', `Adding village role for ${villageName}: ${villageRoleId}`);
    } else if (villageRoleId) {
      logger.info('CHARACTERS', `User already has village role for ${villageName}`);
    } else if (character.homeVillage) {
      logger.warn('CHARACTERS', `No village role ID found for village: ${villageName || character.homeVillage}`);
    }
    
    // Add race role (find by name)
    // Handle race case-insensitively
    const characterRace = character.race ? character.race.charAt(0).toUpperCase() + character.race.slice(1).toLowerCase() : null;
    const raceRoleName = characterRace ? (raceRoleNames[characterRace] || `Race: ${characterRace}`) : null;
    if (raceRoleName) {
      const raceRole = guildRoles.find(r => r.name === raceRoleName);
      if (raceRole && !currentRoleIds.includes(raceRole.id)) {
        rolesToAdd.push(raceRole.id);
        logger.info('CHARACTERS', `Adding race role: ${raceRoleName} (${raceRole.id})`);
      } else if (raceRole) {
        logger.info('CHARACTERS', `User already has race role: ${raceRoleName}`);
      } else {
        logger.warn('CHARACTERS', `Race role not found in guild: ${raceRoleName}`);
      }
    } else {
      logger.warn('CHARACTERS', `No race role name determined for race: ${character.race}`);
    }
    
    // Add job role
    const jobRoleId = character.job ? jobRoleIdMap[character.job] : null;
    if (jobRoleId && !currentRoleIds.includes(jobRoleId)) {
      rolesToAdd.push(jobRoleId);
      logger.info('CHARACTERS', `Adding job role for ${character.job}: ${jobRoleId}`);
    } else if (jobRoleId) {
      logger.info('CHARACTERS', `User already has job role for ${character.job}`);
    } else if (character.job) {
      logger.warn('CHARACTERS', `No job role ID found for job: ${character.job}`);
    }
    
    // Add job perk roles
    const jobPerkInfo = character.job ? getJobPerk(character.job) : null;
    if (jobPerkInfo && jobPerkInfo.perks) {
      for (const perk of jobPerkInfo.perks) {
        if (perk === 'NONE' || perk === 'N/A' || perk === 'ALL') continue;
        
        const perkRoleId = jobPerkIdMap[perk];
        if (perkRoleId && !currentRoleIds.includes(perkRoleId)) {
          rolesToAdd.push(perkRoleId);
          logger.info('CHARACTERS', `Adding job perk role: ${perk} (${perkRoleId})`);
        } else if (perkRoleId) {
          logger.info('CHARACTERS', `User already has job perk role: ${perk}`);
        } else {
          logger.warn('CHARACTERS', `No job perk role ID found for perk: ${perk}`);
        }
      }
    }
    
    // Assign all roles at once
    if (rolesToAdd.length > 0) {
      const newRoles = [...currentRoleIds, ...rolesToAdd];
      
      logger.info('CHARACTERS', `Attempting to assign ${rolesToAdd.length} role(s) to user ${character.userId} for character ${character.name}. Roles: ${rolesToAdd.join(', ')}`);
      
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
        logger.error('CHARACTERS', `Failed to assign roles: ${updateResponse.status} - ${errorText}. Character: ${character.name}, User: ${character.userId}, Roles attempted: ${rolesToAdd.join(', ')}`);
        throw new Error(`Discord API error: ${updateResponse.status} - ${errorText}`);
      }
      
      logger.success('CHARACTERS', `Successfully assigned ${rolesToAdd.length} role(s) to user ${character.userId} for character ${character.name}`);
    } else {
      logger.info('CHARACTERS', `No new roles to assign for character ${character.name} (user may already have all required roles)`);
    }
  } catch (error) {
    logger.error('CHARACTERS', 'Error assigning character roles', error);
    // Don't throw - role assignment failure shouldn't break the approval flow
  }
}

// Post character status update (accepted/denied) to Discord
async function postCharacterStatusToDiscord(character, status, denialReason, isModCharacter = false) {
  try {
    const CHARACTER_CREATION_CHANNEL_ID = process.env.CHARACTER_CREATION_CHANNEL_ID || '964342870796537909';
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    
    if (!DISCORD_TOKEN) {
      logger.warn('CHARACTERS', 'DISCORD_TOKEN not configured, skipping Discord post');
      return;
    }
    
    // Get user info
    const user = await User.findOne({ discordId: character.userId }).lean();
    const userName = user?.username || user?.discordId || 'Unknown';
    
    const color = status === 'accepted' ? 0x4caf50 : 0xf44336;
    const title = status === 'accepted' 
      ? `✅ Character Accepted: ${character.name}`
      : `⚠️ Character Needs Changes: ${character.name}`;
    
    const embed = {
      title: title,
      color: color,
      description: status === 'accepted' 
        ? `Your character **${character.name}** has been accepted and is now active!`
        : `Your character **${character.name}** needs changes. Please review the feedback below.`,
      fields: [
        {
          name: '👤 Character Details',
          value: `**Name:** ${character.name}\n**Race:** ${character.race}\n**Village:** ${character.homeVillage}\n**Job:** ${character.job}`,
          inline: false
        }
      ],
      footer: {
        text: `User: ${userName} • Character ID: ${character._id}`
      },
      timestamp: new Date().toISOString()
    };
    
    if (status === 'denied' && denialReason) {
      // Format denial reasons - make it more prominent
      const reasonsText = denialReason.length > 1500 ? denialReason.substring(0, 1500) + '...' : denialReason;
      
      embed.fields.push({
        name: '❌ **DENIAL REASONS**',
        value: `\`\`\`\n${reasonsText}\n\`\`\``,
        inline: false
      });
      
      // Generate OC page URL
      const ocPageSlug = character.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const dashboardUrl = (process.env.DASHBOARD_URL || 'https://dashboard.tinglebot.com').replace(/\/+$/, '');
      const ocPageUrl = `${dashboardUrl}/ocs/${ocPageSlug}`;
      
      embed.fields.push({
        name: '✏️ Edit & Resubmit',
        value: `You can edit your character and resubmit it for review.\n\n🔗 **[Go to OC Page](${ocPageUrl})**`,
        inline: false
      });
      
      // Admin account mention
      const adminMention = `<@668281042414600212> (roots.admin)`;
      
      embed.fields.push({
        name: '💬 Need Help?',
        value: `If you have any questions about this decision, please DM ${adminMention}.\n\n⚠️ **Note:** Tinglebot cannot reply to or see your messages. Please contact the admin account if you need assistance.`,
        inline: false
      });
    }
    
    // Post to Discord
    const discordResponse = await fetch(`https://discord.com/api/v10/channels/${CHARACTER_CREATION_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: status === 'denied' ? `<@${character.userId}>` : undefined, // Ping user on denial
        embeds: [embed]
      })
    });
    
    if (!discordResponse.ok) {
      const errorText = await discordResponse.text();
      logger.error('CHARACTERS', `Failed to post character status to Discord: ${discordResponse.status} - ${errorText}`);
      return;
    }
    
    logger.success('CHARACTERS', `Character ${status} notification posted to Discord: ${character.name}`);
  } catch (error) {
    logger.error('CHARACTERS', 'Error posting character status to Discord', error);
    // Don't throw - Discord posting failure shouldn't break the moderation flow
  }
}

// Helper function to send DM to user when character is denied
async function sendDenialDM(character, denialReason) {
  try {
    const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
    
    if (!DISCORD_TOKEN) {
      logger.warn('CHARACTERS', 'DISCORD_TOKEN not configured, skipping DM');
      return;
    }
    
    // Admin account mention
    const adminMention = `<@668281042414600212> (roots.admin)`;
    
    // Generate OC page URL
    const ocPageSlug = character.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const dashboardUrl = (process.env.DASHBOARD_URL || 'https://dashboard.tinglebot.com').replace(/\/+$/, '');
    const ocPageUrl = `${dashboardUrl}/ocs/${ocPageSlug}`;
    
    // Format denial reasons - make it more prominent
    const reasonsText = denialReason.length > 1500 ? denialReason.substring(0, 1500) + '...' : denialReason;
    
    // Create DM embed
    const embed = {
      title: `⚠️ Character Needs Changes: ${character.name}`,
      description: `Your character **${character.name}** needs changes. Please review the feedback below.`,
      color: 0xf44336,
      fields: [
        {
          name: '❌ **DENIAL REASONS**',
          value: `\`\`\`\n${reasonsText}\n\`\`\``,
          inline: false
        },
        {
          name: '✏️ Edit & Resubmit',
          value: `You can edit your character and resubmit it for review.\n\n🔗 **[Go to OC Page](${ocPageUrl})**`,
          inline: false
        },
        {
          name: '💬 Need Help?',
          value: `If you have any questions about this decision, please DM ${adminMention}.\n\n⚠️ **Note:** Tinglebot cannot reply to or see your messages. Please contact the admin account if you need assistance.`,
          inline: false
        }
      ],
      timestamp: new Date().toISOString()
    };
    
    // Try to create DM channel and send message
    // First, create the DM channel
    const createDMResponse = await fetch(`https://discord.com/api/v10/users/@me/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipient_id: character.userId
      })
    });
    
    if (!createDMResponse.ok) {
      const errorText = await createDMResponse.text();
      // If DM fails (user has DMs disabled, blocked bot, etc.), create notification instead
      logger.warn('CHARACTERS', `Cannot create DM channel for user ${character.userId}: ${createDMResponse.status} - ${errorText}`);
      await createDenialNotification(character, denialReason);
      return;
    }
    
    const dmChannel = await createDMResponse.json();
    
    // Send message to DM channel
    const sendMessageResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed]
      })
    });
    
    if (!sendMessageResponse.ok) {
      const errorText = await sendMessageResponse.text();
      logger.warn('CHARACTERS', `Cannot send DM to user ${character.userId}: ${sendMessageResponse.status} - ${errorText}`);
      // Fallback to notification
      await createDenialNotification(character, denialReason);
      return;
    }
    
    logger.success('CHARACTERS', `Denial DM sent to user ${character.userId} for character ${character.name}`);
  } catch (error) {
    logger.error('CHARACTERS', 'Error sending denial DM', error);
    // Fallback to notification
    await createDenialNotification(character, denialReason).catch(err => {
      logger.error('CHARACTERS', 'Failed to create denial notification', err);
    });
  }
}

// Helper function to create a notification in the database for the user
async function createDenialNotification(character, denialReason) {
  try {
    await connectToTinglebot();
    
    const Notification = require('../../models/NotificationModel');
    
    // Create notification
    const notification = new Notification({
      userId: character.userId,
      type: 'character_denied',
      title: `Character Needs Changes: ${character.name}`,
      message: denialReason,
      characterId: character._id.toString(),
      characterName: character.name,
      read: false
    });
    
    await notification.save();
    logger.success('CHARACTERS', `Created denial notification for user ${character.userId}`);
  } catch (error) {
    logger.error('CHARACTERS', 'Error creating denial notification', error);
    throw error;
  }
}

// Helper function to upload character icon to Google Cloud Storage
async function uploadCharacterIconToGCS(file) {
  try {
    if (!file) return null;
    
    const fileName = `character-icons/${uuidv4()}${path.extname(file.originalname)}`;
    const fileUpload = bucket.file(fileName);
    
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      }
    });
    
    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        logger.error('CHARACTERS', 'Error uploading character icon to GCS', error);
        reject(error);
      });
      
      stream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error in uploadCharacterIconToGCS', error);
    throw error;
  }
}

// Helper function to upload character appArt to Google Cloud Storage
async function uploadCharacterAppArtToGCS(file) {
  try {
    if (!file) return null;
    
    const fileName = `character-appart/${uuidv4()}${path.extname(file.originalname)}`;
    const fileUpload = bucket.file(fileName);
    
    const stream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype,
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString()
        }
      }
    });
    
    return new Promise((resolve, reject) => {
      stream.on('error', (error) => {
        logger.error('CHARACTERS', 'Error uploading character appArt to GCS', error);
        reject(error);
      });
      
      stream.on('finish', () => {
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
        resolve(publicUrl);
      });
      
      stream.end(file.buffer);
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error in uploadCharacterAppArtToGCS', error);
    throw error;
  }
}

// Helper function to count spirit orbs (needs to be imported or defined)
// This is a placeholder - actual implementation should be imported from appropriate module
async function countSpiritOrbsBatch(characterNames) {
  // Placeholder - implement based on actual spirit orb counting logic
  return {};
}

// ------------------- Function: getRaces -------------------
// Returns list of all valid races
router.get('/races', asyncHandler(async (req, res) => {
  const { getAllRaces } = require('../../modules/raceModule');
  const races = getAllRaces();
  res.json({ data: races });
}));

// ------------------- Function: getJobs -------------------
// Returns list of all jobs, optionally filtered by village
router.get('/jobs', asyncHandler(async (req, res) => {
  const { villageJobs, generalJobs, allJobs } = require('../../data/jobData');
  const village = req.query.village?.toLowerCase();
  
  if (village && villageJobs[village]) {
    // Return village-specific jobs + general jobs
    const jobs = [...villageJobs[village], ...generalJobs].sort();
    res.json({ data: jobs });
  } else {
    // Return all jobs
    res.json({ data: allJobs });
  }
}));

// ------------------- Function: getStarterGear -------------------
// Returns list of starter gear items
router.get('/starter-gear', asyncHandler(async (req, res) => {
  const { fetchAllItems } = require('../../database/db');
  const Item = require('../../models/ItemModel');
  
  // List of allowed starter gear item names (from starterGear.js)
  const STARTER_GEAR_NAMES = [
    'Soup Ladle',
    'Pot Lid',
    'Wooden Shield',
    'Wooden Bow',
    'Boomerang',
    'Emblazoned Shield',
    "Fisherman's Shield",
    "Hunter's Shield",
    "Traveler's Shield",
    'Rusty Broadsword',
    "Traveler's Sword",
    "Woodcutter's Axe",
    "Traveler's Bow",
    'Wooden Mop',
    'Rusty Claymore',
    "Traveler's Claymore",
    'Tree Branch',
    'Rusty Shield',
    'Korok Leaf',
    'Farming Hoe',
    "Farmer's Pitchfork",
    'Rusty Halberd',
    "Traveler's Spear",
    'Old Shirt',
    'Well-Worn Trousers'
  ];
  
  function normalizeName(name) {
    return name
      .toLowerCase()
      .replace(/['']/g, "'")
      .replace(/[^a-z0-9' ]/gi, '')
      .trim();
  }
  
  const normalizedSet = new Set(STARTER_GEAR_NAMES.map(normalizeName));
  
  // Fetch all items and filter to starter gear
  const allItems = await fetchAllItems();
  const starterGear = allItems.filter(item => {
    const normalizedName = normalizeName(item.itemName || '');
    return normalizedSet.has(normalizedName);
  });
  
  // Categorize by type
  const categorized = {
    weapons: [],
    shields: [],
    armor: {
      head: [],
      chest: [],
      legs: []
    }
  };
  
  starterGear.forEach(item => {
    const categories = Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []);
    const types = Array.isArray(item.type) ? item.type : (item.type ? [item.type] : []);
    const subtypes = Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []);
    
    // Check if it's a weapon
    if (categories.includes('Weapon') || types.includes('1H') || types.includes('2H')) {
      categorized.weapons.push(item);
    }
    // Check if it's a shield
    else if (subtypes.includes('Shield') || item.itemName?.toLowerCase().includes('shield')) {
      categorized.shields.push(item);
    }
    // Check if it's armor
    else if (categories.includes('Armor') || types.includes('Chest') || types.includes('Legs')) {
      if (types.includes('Chest') || item.itemName?.toLowerCase().includes('shirt')) {
        categorized.armor.chest.push(item);
      } else if (types.includes('Legs') || item.itemName?.toLowerCase().includes('trousers')) {
        categorized.armor.legs.push(item);
      } else {
        categorized.armor.head.push(item);
      }
    }
  });
  
  res.json({ 
    data: starterGear,
    categorized: categorized
  });
}));

// ------------------- Function: getCharacterCount -------------------
// Returns total number of characters
router.get('/count', asyncHandler(async (req, res) => {
  const regularCount = await Character.countDocuments({ name: { $nin: ['Tingle', 'Tingle test', 'John'] } });
  const modCount = await ModCharacter.countDocuments();
  res.json({ count: regularCount + modCount });
}));

// ------------------- Function: getUserCharacters -------------------
// Returns all characters belonging to the authenticated user (including mod characters)
router.get('/user/characters', asyncHandler(async (req, res) => {
  const userId = req.user?.discordId;
  
  const regularCharacters = await Character.find({ userId }).lean();
  const modCharacters = await ModCharacter.find({ userId }).lean();
  
  // Combine both character types
  const characters = [...regularCharacters, ...modCharacters];
  
  // Initialize spirit orbs count for characters
  characters.forEach(character => {
    character.spiritOrbs = 0; // Will be updated with actual count from inventory
  });
  
  // Get spirit orb counts for all characters
  const characterNames = characters.map(char => char.name);
  const spiritOrbCounts = await countSpiritOrbsBatch(characterNames);
  
  // Update spirit orb counts
  characters.forEach(character => {
    character.spiritOrbs = spiritOrbCounts[character.name] || 0;
  });
  
  res.json({ data: characters });
}));

// ------------------- Function: getCharacterList -------------------
// Returns basic character info without inventory data (fast loading, including mod characters)
router.get('/list', asyncHandler(async (req, res) => {
  const regularCharacters = await Character.find({}, {
    name: 1,
    icon: 1,
    race: 1,
    job: 1,
    homeVillage: 1,
    currentVillage: 1,
    isModCharacter: 1
  }).lean();
  
  const modCharacters = await ModCharacter.find({}, {
    name: 1,
    icon: 1,
    race: 1,
    job: 1,
    homeVillage: 1,
    currentVillage: 1,
    isModCharacter: 1,
    modTitle: 1,
    modType: 1
  }).lean();
  
  // Combine both character types
  const allCharacters = [...regularCharacters, ...modCharacters];
  
  // Filter out excluded characters
  const excludedCharacters = ['Tingle', 'Tingle test', 'John'];
  const filteredCharacters = allCharacters.filter(char => 
    !excludedCharacters.includes(char.name)
  );
  
  const characterList = filteredCharacters.map(char => ({
    characterName: char.name,
    icon: char.icon,
    race: char.race,
    job: char.job,
    homeVillage: char.homeVillage,
    currentVillage: char.currentVillage,
    isModCharacter: char.isModCharacter || false,
    modTitle: char.modTitle || null,
    modType: char.modType || null
  }));
  
  res.json({ data: characterList });
}));

// ------------------- Function: getAllCharacters -------------------
// Returns all characters for relationship selection (including mod characters)
router.get('/', asyncHandler(async (req, res) => {
  const regularCharacters = await Character.find({})
    .select('name race job currentVillage homeVillage icon userId isModCharacter')
    .sort({ name: 1 })
    .lean();
  
  const modCharacters = await ModCharacter.find({})
    .select('name race job currentVillage homeVillage icon userId isModCharacter modTitle modType')
    .sort({ name: 1 })
    .lean();
  
  // Combine both character types
  const characters = [...regularCharacters, ...modCharacters];
  
  res.json({ characters });
}));

// ------------------- Function: createCharacter -------------------
// Creates a new character for the authenticated user
router.post('/create', characterUploads, asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  if (!userId) {
    return res.status(400).json({ error: 'User ID not found' });
  }

  // Extract and validate form data
  const {
    name,
    age,
    height,
    hearts,
    stamina,
    pronouns,
    race,
    village,
    job,
    appLink,
    starterWeapon,
    starterShield,
    starterArmorChest,
    starterArmorLegs,
    gender,
    virtue,
    personality,
    history,
    extras
  } = req.body;

  // Validate required fields (appLink is now optional)
  const missingFields = [];
  if (!name) missingFields.push('name');
  if (!age) missingFields.push('age');
  if (!height) missingFields.push('height');
  if (!hearts) missingFields.push('hearts');
  if (!stamina) missingFields.push('stamina');
  if (!pronouns) missingFields.push('pronouns');
  if (!race) missingFields.push('race');
  if (!village) missingFields.push('village');
  if (!job) missingFields.push('job');
  
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      error: `Missing required fields: ${missingFields.join(', ')}`,
      missingFields: missingFields,
      required: ['name', 'age', 'height', 'hearts', 'stamina', 'pronouns', 'race', 'village', 'job']
    });
  }

  // Validate icon file
  const iconFile = req.files?.icon?.[0];
  if (!iconFile) {
    return res.status(400).json({ error: 'Character icon is required' });
  }

  // Validate appArt file
  const appArtFile = req.files?.appArt?.[0];
  if (!appArtFile) {
    return res.status(400).json({ error: 'Application art is required' });
  }

  // Validate biography fields
  if (!gender || gender.trim().length === 0) {
    return res.status(400).json({ error: 'Gender (with pronouns) is required' });
  }

  if (!virtue || !['power', 'wisdom', 'courage', 'tba'].includes(virtue.toLowerCase())) {
    return res.status(400).json({ error: 'Virtue must be one of: power, wisdom, courage, or TBA' });
  }

  if (!personality || personality.trim().length === 0) {
    return res.status(400).json({ error: 'Personality description is required' });
  }

  if (!history || history.trim().length === 0) {
    return res.status(400).json({ error: 'History description is required' });
  }

  // Validate numeric fields
  const ageNum = parseInt(age, 10);
  const heightNum = parseFloat(height);
  const heartsNum = parseInt(hearts, 10);
  const staminaNum = parseInt(stamina, 10);

  if (isNaN(ageNum) || ageNum < 1) {
    return res.status(400).json({ error: 'Age must be a positive number (minimum 1)' });
  }

  if (isNaN(heightNum) || heightNum <= 0) {
    return res.status(400).json({ error: 'Height must be a positive number' });
  }

  if (isNaN(heartsNum) || heartsNum < 1) {
    return res.status(400).json({ error: 'Hearts must be a positive number (minimum 1)' });
  }

  if (isNaN(staminaNum) || staminaNum < 1) {
    return res.status(400).json({ error: 'Stamina must be a positive number (minimum 1)' });
  }

  // Validate race
  if (!isValidRace(race)) {
    return res.status(400).json({ error: `"${race}" is not a valid race` });
  }

  // Validate village
  if (!isValidVillage(village)) {
    return res.status(400).json({ error: `"${village}" is not a valid village` });
  }

  // Validate job
  if (!isValidJob(job)) {
    return res.status(400).json({ error: `"${job}" is not a valid job` });
  }

  // Check job/village compatibility
  const jobVillage = isVillageExclusiveJob(job);
  if (jobVillage && jobVillage.toLowerCase() !== village.toLowerCase()) {
    return res.status(400).json({ 
      error: `Job "${job}" is exclusive to ${jobVillage} village, but character is in ${village} village` 
    });
  }

  // Check character name uniqueness
  await connectToTinglebot();
  const isUnique = await isUniqueCharacterName(userId, name);
  if (!isUnique) {
    return res.status(400).json({ error: `A character with the name "${name}" already exists` });
  }

  // Check user's character slot availability
  let user = await User.findOne({ discordId: userId });
  if (!user) {
    // Create user if doesn't exist
    user = new User({
      discordId: userId,
      characterSlot: 2
    });
    await user.save();
  }

  if (user.characterSlot <= 0) {
    return res.status(400).json({ error: 'You do not have enough character slots available to create a new character' });
  }

  let character = null;
  try {
    // Upload icon to GCS
    const iconUrl = await uploadCharacterIconToGCS(iconFile);
    if (!iconUrl) {
      return res.status(500).json({ error: 'Failed to upload character icon' });
    }

    // Upload appArt to GCS
    const appArtUrl = await uploadCharacterAppArtToGCS(appArtFile);
    if (!appArtUrl) {
      return res.status(500).json({ error: 'Failed to upload application art' });
    }

    // Handle starting gear if selected (before creating character)
    let gearWeapon = null;
    let gearShield = null;
    let gearArmor = {
      head: null,
      chest: null,
      legs: null
    };
    
    if (starterWeapon) {
      const weaponItem = await fetchItemByName(starterWeapon);
      if (weaponItem) {
        gearWeapon = {
          name: weaponItem.itemName,
          stats: { modifierHearts: weaponItem.modifierHearts || 0 },
          type: Array.isArray(weaponItem.type) ? weaponItem.type[0] : weaponItem.type || null
        };
      }
    }
    
    if (starterShield) {
      const shieldItem = await fetchItemByName(starterShield);
      if (shieldItem) {
        gearShield = {
          name: shieldItem.itemName,
          stats: { modifierHearts: shieldItem.modifierHearts || 0 },
          subtype: Array.isArray(shieldItem.subtype) ? shieldItem.subtype[0] : shieldItem.subtype || null
        };
      }
    }
    
    if (starterArmorChest) {
      const chestItem = await fetchItemByName(starterArmorChest);
      if (chestItem) {
        gearArmor.chest = {
          name: chestItem.itemName,
          stats: { modifierHearts: chestItem.modifierHearts || 0 }
        };
      }
    }
    
    if (starterArmorLegs) {
      const legsItem = await fetchItemByName(starterArmorLegs);
      if (legsItem) {
        gearArmor.legs = {
          name: legsItem.itemName,
          stats: { modifierHearts: legsItem.modifierHearts || 0 }
        };
      }
    }

    // Create character
    character = new Character({
      userId: userId,
      name: name.trim(),
      age: ageNum,
      height: heightNum,
      maxHearts: heartsNum,
      currentHearts: heartsNum,
      maxStamina: staminaNum,
      currentStamina: staminaNum,
      pronouns: pronouns.trim(),
      race: race.toLowerCase(),
      homeVillage: village.toLowerCase(),
      currentVillage: village.toLowerCase(),
      job: job,
      inventory: `https://tinglebot.xyz/character-inventory.html?character=${encodeURIComponent(name)}`,
      appLink: appLink ? appLink.trim() : '',
      icon: iconUrl,
      appArt: appArtUrl,
      blighted: false,
      spiritOrbs: 0,
      birthday: '',
      inventorySynced: false,
      gearWeapon: gearWeapon,
      gearShield: gearShield,
      gearArmor: gearArmor,
      status: null, // New characters start as DRAFT (null) - must be submitted
      applicationVersion: 1, // Start at version 1
      submittedAt: null, // Not submitted yet
      gender: gender.trim(),
      virtue: virtue.toLowerCase(),
      personality: personality.trim(),
      history: history.trim(),
      extras: extras ? extras.trim() : ''
    });

    await character.save();

    // Update character stats if gear was equipped
    if (gearWeapon || gearShield || gearArmor.chest || gearArmor.legs) {
      // Helper function to get modifierHearts from stats (handles both Map and plain object)
      const getModifierHearts = (stats) => {
        if (!stats) return 0;
        // Handle Map
        if (stats instanceof Map) {
          return stats.get('modifierHearts') || 0;
        }
        // Handle plain object
        if (typeof stats === 'object') {
          return stats.modifierHearts || 0;
        }
        return 0;
      };

      // Calculate defense from armor and shield
      let totalDefense = 0;
      if (character.gearArmor) {
        totalDefense += getModifierHearts(character.gearArmor.head?.stats);
        totalDefense += getModifierHearts(character.gearArmor.chest?.stats);
        totalDefense += getModifierHearts(character.gearArmor.legs?.stats);
      }
      if (character.gearShield?.stats) {
        totalDefense += getModifierHearts(character.gearShield.stats);
      }

      // Calculate attack from weapon
      const totalAttack = getModifierHearts(character.gearWeapon?.stats);

      // Update character stats directly
      character.defense = totalDefense;
      character.attack = totalAttack;
      await character.save();
    }

    // Create inventory collection
    await createCharacterInventory(character.name, character._id, character.job);
    
    // Add selected gear items to inventory if they were selected
    if (starterWeapon || starterShield || starterArmorChest || starterArmorLegs) {
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      
      const gearItems = [starterWeapon, starterShield, starterArmorChest, starterArmorLegs].filter(Boolean);
      for (const itemName of gearItems) {
        const item = await fetchItemByName(itemName);
        if (item) {
          await inventoryCollection.insertOne({
            itemName: item.itemName,
            quantity: 1,
            obtained: `Starting gear - ${new Date().toLocaleDateString()}`,
            createdAt: new Date(),
            updatedAt: new Date()
          });
        }
      }
    }

    // Decrement character slot
    user.characterSlot -= 1;
    await user.save();

    logger.info('CHARACTERS', `Character created as DRAFT: ${character.name} by user ${userId}`);

    // Don't post to Discord yet - wait for submission
    // postCharacterCreationToDiscord will be called when character is submitted

    // Generate OC page URL slug from character name
    const ocPageSlug = character.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const ocPageUrl = `/ocs/${ocPageSlug}`;

    // Return created character
    res.status(201).json({ 
      success: true,
      message: 'Character created successfully',
      character: character.toObject(),
      ocPageUrl: ocPageUrl
    });

  } catch (error) {
    logger.error('CHARACTERS', 'Error creating character', error);
    
    // If character was created but something else failed, try to clean up
    if (character && character._id) {
      try {
        await Character.findByIdAndDelete(character._id);
        // Restore character slot if character creation failed
        if (user) {
          user.characterSlot += 1;
          await user.save();
        }
      } catch (cleanupError) {
        logger.error('CHARACTERS', 'Error cleaning up character after creation failure', cleanupError);
      }
    }

    res.status(500).json({ 
      error: 'An error occurred while creating your character',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// ------------------- Function: getCharacterByName -------------------
// Returns character data by character name (for OC page URL lookup)
// Verifies ownership - only the character owner can access
router.get('/by-name/:name', asyncHandler(async (req, res) => {
  const nameSlug = decodeURIComponent(req.params.name);
  
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const userId = req.user.discordId;
  
  // Helper function to create slug from character name
  const createSlug = (name) => {
    if (!name || typeof name !== 'string') return '';
    return name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };
  
  const normalizedSlug = nameSlug.toLowerCase();
  
  // First, search all characters to see if the character exists
  // This helps provide better error messages
  let allCharacters;
  try {
    allCharacters = await Character.find({}).lean();
  } catch (error) {
    logger.error(`[characters.js] Error fetching characters: ${error.message}`, error);
    throw new Error('Failed to fetch characters from database');
  }
  
  // Find character whose name matches the slug pattern (across all characters)
  // Filter out characters without names first to avoid errors
  let character;
  try {
    character = allCharacters.find(char => {
      if (!char || !char.name) return false;
      try {
        const charSlug = createSlug(char.name);
        return charSlug === normalizedSlug;
      } catch (error) {
        logger.warn(`[characters.js] Error creating slug for character: ${char._id}, name: ${char.name}, error: ${error.message}`);
        return false;
      }
    });
    
    // Fallback: try direct name match (case-insensitive) if slug match fails
    if (!character) {
      character = allCharacters.find(char => {
        if (!char || !char.name || typeof char.name !== 'string') return false;
        try {
          return char.name.toLowerCase() === normalizedSlug;
        } catch (error) {
          logger.warn(`[characters.js] Error matching name for character: ${char._id}, name: ${char.name}, error: ${error.message}`);
          return false;
        }
      });
    }
  } catch (error) {
    logger.error(`[characters.js] Error finding character: ${error.message}`, error);
    throw new Error('Failed to search for character');
  }
  
  if (!character) {
    // Character doesn't exist at all
    logger.warn(`[characters.js] Character not found for slug: "${nameSlug}" (userId: ${userId})`);
    throw new NotFoundError(`Character "${nameSlug}" not found. Please check the character name and try again.`);
  }
  
  // Validate character object has required properties
  if (!character || typeof character !== 'object') {
    logger.error(`[characters.js] Invalid character object found for slug: "${nameSlug}"`);
    throw new Error('Invalid character data');
  }
  
  // Check ownership - convert both to strings for comparison (Discord IDs can be stored as strings or numbers)
  const characterUserId = String(character.userId || '');
  const requestUserId = String(userId || '');
  const isOwner = characterUserId === requestUserId;
  
  // Public visibility: Only show approved characters to non-owners
  if (!isOwner) {
    // Character exists but user doesn't own it
    // Only allow viewing if character is approved (status: 'accepted')
    if (character.status !== 'accepted') {
      logger.info(`[characters.js] Blocked access to non-approved character "${character?.name || nameSlug}" by user ${requestUserId}`);
      throw new NotFoundError('Character not found or not yet approved for public viewing');
    }
    
    const charName = character?.name || 'Unknown';
    logger.info(`[characters.js] Character "${charName}" viewed by non-owner - userId: ${requestUserId}, ownerId: ${characterUserId}`);
  }
  
  // Return character data with ownership flag
  // Ensure all required fields exist before sending
  try {
    const responseData = {
      ...character,
      icon: character?.icon || null,
      isOwner: isOwner, // Frontend can use this to hide/edit edit buttons
      name: character?.name || 'Unknown'
    };
    
    res.json(responseData);
  } catch (error) {
    logger.error(`[characters.js] Error sending response for character "${character?.name || nameSlug}": ${error.message}`, error);
    throw new Error('Failed to send character data');
  }
}));

// ------------------- Function: editCharacter -------------------
// Updates a character (for denied/accepted characters)
// Allows resubmission if status is 'denied'
router.put('/edit/:id', characterIconUpload.single('icon'), validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;
  const { resubmit } = req.body; // Flag to resubmit denied character

  // Find character and verify ownership
  // Try both string and original type for userId (Discord IDs can be stored as strings or numbers)
  let character = await Character.findOne({ 
    _id: characterId, 
    userId: String(userId) 
  });
  
  // If not found, try with the userId as-is in case it's already the right type
  if (!character) {
    character = await Character.findOne({ 
      _id: characterId, 
      userId: userId 
    });
  }
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Import field editability utility
  const { isFieldEditable } = require('../../utils/fieldEditability');

  // Check if character can be edited based on status
  if (character.status === 'pending') {
    return res.status(400).json({ error: 'Character is pending moderation and cannot be edited. Please wait for moderation to complete.' });
  }

  // Don't auto-resubmit on edit - resubmit should be explicit via resubmit endpoint
  // But allow editing of denied characters

  // Extract form data
  const {
    name,
    age,
    height,
    hearts,
    stamina,
    pronouns,
    race,
    village,
    job,
    appLink,
    starterWeapon,
    starterShield,
    starterArmorChest,
    starterArmorLegs,
    personality,
    history,
    extras,
    gender,
    virtue,
    birthday
  } = req.body;

  // Check field editability for each field being updated
  const status = character.status; // null=DRAFT, 'pending', 'denied', 'accepted'
  const lockedFields = [];

  // Check each field
  if (name !== undefined && name.trim() !== character.name && !isFieldEditable('name', status)) {
    lockedFields.push('name');
  }
  if (age !== undefined && age !== '' && parseInt(age, 10) !== character.age && !isFieldEditable('age', status)) {
    lockedFields.push('age');
  }
  if (race !== undefined && race.toLowerCase() !== character.race?.toLowerCase() && !isFieldEditable('race', status)) {
    lockedFields.push('race');
  }
  if (village !== undefined && village.toLowerCase() !== character.homeVillage?.toLowerCase() && !isFieldEditable('homeVillage', status)) {
    lockedFields.push('homeVillage');
  }
  if (job !== undefined && job !== character.job && !isFieldEditable('job', status)) {
    lockedFields.push('job');
  }
  if (hearts !== undefined && !isFieldEditable('maxHearts', status)) {
    lockedFields.push('hearts');
  }
  if (stamina !== undefined && !isFieldEditable('maxStamina', status)) {
    lockedFields.push('stamina');
  }
  if (starterWeapon !== undefined && !isFieldEditable('gearWeapon', status)) {
    lockedFields.push('starterWeapon');
  }
  if (starterShield !== undefined && !isFieldEditable('gearShield', status)) {
    lockedFields.push('starterShield');
  }
  if (starterArmorChest !== undefined && !isFieldEditable('gearArmor', status)) {
    lockedFields.push('starterArmorChest');
  }
  if (starterArmorLegs !== undefined && !isFieldEditable('gearArmor', status)) {
    lockedFields.push('starterArmorLegs');
  }

  if (lockedFields.length > 0) {
    return res.status(400).json({ 
      error: `The following fields cannot be edited: ${lockedFields.join(', ')}`,
      lockedFields: lockedFields
    });
  }

  // If status is 'accepted', only allow editing approved-editable fields
  if (character.status === 'accepted') {
    // Only update allowed profile fields
    if (height !== undefined && height !== '' && isFieldEditable('height', status)) {
      character.height = parseFloat(height) || null;
    }
    if (pronouns !== undefined && isFieldEditable('pronouns', status)) {
      character.pronouns = pronouns.trim();
    }
    if (personality !== undefined && isFieldEditable('personality', status)) {
      character.personality = personality.trim();
    }
    if (history !== undefined && isFieldEditable('history', status)) {
      character.history = history.trim();
    }
    if (extras !== undefined && isFieldEditable('extras', status)) {
      character.extras = extras.trim();
    }
    if (gender !== undefined && isFieldEditable('gender', status)) {
      character.gender = gender.trim();
    }
    if (virtue !== undefined && isFieldEditable('virtue', status)) {
      character.virtue = virtue.toLowerCase();
    }
    if (appLink !== undefined && isFieldEditable('appLink', status)) {
      character.appLink = appLink.trim();
    }
    if (birthday !== undefined && isFieldEditable('birthday', status)) {
      character.birthday = birthday.trim();
    }
    if (req.file && isFieldEditable('icon', status)) {
      const iconUrl = await uploadCharacterIconToGCS(req.file);
      if (iconUrl) {
        character.icon = iconUrl;
      }
    }
    
    await character.save();
    return res.json({
      success: true,
      message: 'Character profile updated successfully',
      character: character.toObject()
    });
  }

  // For denied characters (needs changes) or DRAFT, allow full editing except locked fields
  // Age cannot be edited - reject if age is being changed
  if (age !== undefined && age !== '' && parseInt(age, 10) !== character.age) {
    return res.status(400).json({ error: 'Age cannot be edited' });
  }
  
  // Validate required fields (age is still required but must match current value)
  if (!name || !age || !height || !hearts || !stamina || !pronouns || !race || !village || !job || !appLink) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      required: ['name', 'age', 'height', 'hearts', 'stamina', 'pronouns', 'race', 'village', 'job', 'appLink']
    });
  }

  // Validate numeric fields
  const ageNum = parseInt(age, 10);
  const heightNum = parseFloat(height);
  const heartsNum = parseInt(hearts, 10);
  const staminaNum = parseInt(stamina, 10);

  // Age validation - must match current age (already checked above, but validate format)
  if (isNaN(ageNum) || ageNum < 1) {
    return res.status(400).json({ error: 'Age must be a positive number (minimum 1)' });
  }
  
  // Ensure age hasn't changed (double check)
  if (ageNum !== character.age) {
    return res.status(400).json({ error: 'Age cannot be edited' });
  }

  if (isNaN(heightNum) || heightNum <= 0) {
    return res.status(400).json({ error: 'Height must be a positive number' });
  }

  if (isNaN(heartsNum) || heartsNum < 1) {
    return res.status(400).json({ error: 'Hearts must be a positive number (minimum 1)' });
  }

  if (isNaN(staminaNum) || staminaNum < 1) {
    return res.status(400).json({ error: 'Stamina must be a positive number (minimum 1)' });
  }

  // Validate race
  if (!isValidRace(race)) {
    return res.status(400).json({ error: `"${race}" is not a valid race` });
  }

  // Validate village
  if (!isValidVillage(village)) {
    return res.status(400).json({ error: `"${village}" is not a valid village` });
  }

  // Validate job
  if (!isValidJob(job)) {
    return res.status(400).json({ error: `"${job}" is not a valid job` });
  }

  // Check job/village compatibility
  const jobVillage = isVillageExclusiveJob(job);
  if (jobVillage && jobVillage.toLowerCase() !== village.toLowerCase()) {
    return res.status(400).json({ 
      error: `Job "${job}" is exclusive to ${jobVillage} village, but character is in ${village} village` 
    });
  }

  // Check character name uniqueness (only if name changed)
  if (name.trim() !== character.name) {
    await connectToTinglebot();
    const isUnique = await isUniqueCharacterName(userId, name);
    if (!isUnique) {
      return res.status(400).json({ error: `A character with the name "${name}" already exists` });
    }
  }

  // Handle icon upload
  if (req.file) {
    const iconUrl = await uploadCharacterIconToGCS(req.file);
    if (iconUrl) {
      character.icon = iconUrl;
    }
  }

  // Handle starting gear updates
  let gearWeapon = null;
  let gearShield = null;
  let gearArmor = {
    head: null,
    chest: null,
    legs: null
  };
  
  if (starterWeapon) {
    const weaponItem = await fetchItemByName(starterWeapon);
    if (weaponItem) {
      gearWeapon = {
        name: weaponItem.itemName,
        stats: { modifierHearts: weaponItem.modifierHearts || 0 },
        type: Array.isArray(weaponItem.type) ? weaponItem.type[0] : weaponItem.type || null
      };
    }
  }
  
  if (starterShield) {
    const shieldItem = await fetchItemByName(starterShield);
    if (shieldItem) {
      gearShield = {
        name: shieldItem.itemName,
        stats: { modifierHearts: shieldItem.modifierHearts || 0 },
        subtype: Array.isArray(shieldItem.subtype) ? shieldItem.subtype[0] : shieldItem.subtype || null
      };
    }
  }
  
  if (starterArmorChest) {
    const chestItem = await fetchItemByName(starterArmorChest);
    if (chestItem) {
      gearArmor.chest = {
        name: chestItem.itemName,
        stats: { modifierHearts: chestItem.modifierHearts || 0 }
      };
    }
  }
  
  if (starterArmorLegs) {
    const legsItem = await fetchItemByName(starterArmorLegs);
    if (legsItem) {
      gearArmor.legs = {
        name: legsItem.itemName,
        stats: { modifierHearts: legsItem.modifierHearts || 0 }
      };
    }
  }

  // Update character fields
  character.name = name.trim();
  character.age = ageNum;
  character.height = heightNum;
  character.maxHearts = heartsNum;
  character.currentHearts = heartsNum;
  character.maxStamina = staminaNum;
  character.currentStamina = staminaNum;
  character.pronouns = pronouns.trim();
  character.race = race.toLowerCase();
  character.homeVillage = village.toLowerCase();
  character.currentVillage = village.toLowerCase();
  character.job = job;
  character.appLink = appLink.trim();
  character.inventory = `https://tinglebot.xyz/character-inventory.html?character=${encodeURIComponent(character.name)}`;
  character.gearWeapon = gearWeapon;
  character.gearShield = gearShield;
  character.gearArmor = gearArmor;

  // Update character stats if gear was equipped
  if (gearWeapon || gearShield || gearArmor.chest || gearArmor.legs) {
    const getModifierHearts = (stats) => {
      if (!stats) return 0;
      if (stats instanceof Map) {
        return stats.get('modifierHearts') || 0;
      }
      if (typeof stats === 'object') {
        return stats.modifierHearts || 0;
      }
      return 0;
    };

    let totalDefense = 0;
    if (character.gearArmor) {
      totalDefense += getModifierHearts(character.gearArmor.head?.stats);
      totalDefense += getModifierHearts(character.gearArmor.chest?.stats);
      totalDefense += getModifierHearts(character.gearArmor.legs?.stats);
    }
    if (character.gearShield?.stats) {
      totalDefense += getModifierHearts(character.gearShield.stats);
    }

    const totalAttack = getModifierHearts(character.gearWeapon?.stats);

    character.defense = totalDefense;
    character.attack = totalAttack;
  }

  await character.save();

  logger.info('CHARACTERS', `Character updated: ${character.name} by user ${userId}${shouldResubmit ? ' (resubmitted)' : ''}`);

  // If resubmitted (either explicitly or automatically for denied characters), post to Discord
  if (shouldResubmit) {
    postCharacterCreationToDiscord(character, await User.findOne({ discordId: userId }), req.user, req).catch(err => {
      logger.error('SERVER', 'Failed to post character resubmission to Discord', err);
    });
  }

  // Generate OC page URL slug
  const ocPageSlug = character.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  const ocPageUrl = `/ocs/${ocPageSlug}`;

  res.json({
    success: true,
    message: shouldResubmit ? 'Character updated and resubmitted successfully' : 'Character updated successfully',
    character: character.toObject(),
    ocPageUrl: ocPageUrl
  });
}));

// ------------------- Function: getCharacterById -------------------
// Returns character data by character ID
// NOTE: This must be defined LAST to avoid matching specific routes like /list, /count, etc.
router.get('/:id', validateObjectId('id'), asyncHandler(async (req, res) => {
  const char = await Character.findById(req.params.id);
  if (!char) {
    throw new NotFoundError('Character not found');
  }
  res.json({ ...char.toObject(), icon: char.icon });
}));

// ------------------- Section: Character Moderation Routes -------------------

// Middleware to check if user is a mod/admin
async function checkModAccess(req) {
  // Check if user is authenticated
  const user = req.session?.user || req.user;
  if (!user || !user.discordId) {
    return false;
  }
  
  // Use the same checkAdminAccess function from server.js
  // For now, we'll check the ADMIN_ROLE_ID
  const guildId = process.env.PROD_GUILD_ID;
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  
  if (!guildId || !ADMIN_ROLE_ID) {
    return false;
  }
  
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${user.discordId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const memberData = await response.json();
      const roles = memberData.roles || [];
      const adminRoleIdStr = String(ADMIN_ROLE_ID);
      return roles.some(roleId => String(roleId) === adminRoleIdStr);
    }
    return false;
  } catch (error) {
    logger.error('CHARACTERS', `Error checking mod access: ${error.message}`);
    return false;
  }
}

// Get all pending characters for moderation review
router.get('/moderation/pending', asyncHandler(async (req, res) => {
  const isMod = await checkModAccess(req);
  if (!isMod) {
    return res.status(403).json({ error: 'Moderator access required' });
  }
  
  await connectToTinglebot();
  
  // Get all pending characters (both regular and mod)
  const pendingCharacters = await Character.find({ status: 'pending' })
    .select('name userId age height pronouns race homeVillage job icon appLink createdAt applicationVersion discordMessageId discordThreadId submittedAt')
    .lean();
  
  const pendingModCharacters = await ModCharacter.find({ status: 'pending' })
    .select('name userId age height pronouns race homeVillage job icon appLink createdAt modTitle modType applicationVersion discordMessageId discordThreadId submittedAt')
    .lean();
  
  // Get moderation votes for each character
  const allCharacterIds = [
    ...pendingCharacters.map(c => c._id),
    ...pendingModCharacters.map(c => c._id)
  ];
  
  const moderationVotes = await CharacterModeration.find({
    characterId: { $in: allCharacterIds }
  }).lean();
  
  // Group votes by character ID
  const votesByCharacter = {};
  moderationVotes.forEach(vote => {
    const charId = vote.characterId.toString();
    if (!votesByCharacter[charId]) {
      votesByCharacter[charId] = { approves: [], needsChanges: [] };
    }
    if (vote.vote === 'approve') {
      votesByCharacter[charId].approves.push({
        modId: vote.modId,
        modUsername: vote.modUsername,
        note: vote.note,
        createdAt: vote.createdAt
      });
    } else if (vote.vote === 'needs_changes') {
      votesByCharacter[charId].needsChanges.push({
        modId: vote.modId,
        modUsername: vote.modUsername,
        reason: vote.reason,
        note: vote.note,
        createdAt: vote.createdAt
      });
    }
  });
  
  // Add vote counts to characters
  const charactersWithVotes = [
    ...pendingCharacters.map(char => {
      const charId = char._id.toString();
      const votes = votesByCharacter[charId] || { approves: [], needsChanges: [] };
      return {
        ...char,
        isModCharacter: false,
        votes: votes,
        approveCount: votes.approves.length,
        needsChangesCount: votes.needsChanges.length
      };
    }),
    ...pendingModCharacters.map(char => {
      const charId = char._id.toString();
      const votes = votesByCharacter[charId] || { approves: [], needsChanges: [] };
      return {
        ...char,
        isModCharacter: true,
        votes: votes,
        approveCount: votes.approves.length,
        needsChangesCount: votes.needsChanges.length
      };
    })
  ];
  
  res.json({ characters: charactersWithVotes });
}));

// Approve or deny a character
router.post('/moderation/vote', asyncHandler(async (req, res) => {
  const isMod = await checkModAccess(req);
  if (!isMod) {
    return res.status(403).json({ error: 'Moderator access required' });
  }
  
  const { characterId, vote, reason, note, isModCharacter } = req.body;
  
  // Support 'needs_changes' in addition to 'approve'
  if (!characterId || !vote || !['approve', 'needs_changes'].includes(vote)) {
    return res.status(400).json({ error: 'Invalid request. characterId and vote (approve/needs_changes) are required.' });
  }
  
  // Reason required for needs_changes
  if (vote === 'needs_changes' && !reason && !note) {
    return res.status(400).json({ error: 'Reason or note is required for needs_changes votes.' });
  }
  
  await connectToTinglebot();
  
  // Get the character
  const CharacterModel = isModCharacter ? ModCharacter : Character;
  const character = await CharacterModel.findById(characterId);
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found' });
  }
  
  if (character.status !== 'pending') {
    return res.status(400).json({ error: 'Character is not pending moderation' });
  }
  
  // Get mod user info
  const modUser = req.session?.user || req.user;
  const modId = modUser.discordId;
  const modUsername = modUser.username || modUser.discordId;
  
    // Use ocApplicationService to record vote
    const ocApplicationService = require('../../services/ocApplicationService');
    const auditService = require('../../services/auditService');
    const notificationService = require('../../utils/notificationService');
    const feedback = note || reason || null;
  
  try {
    // Check for existing vote to detect vote changes
    const applicationVersion = character.applicationVersion || 1;
    const existingVote = await CharacterModeration.findOne({
      characterId: characterId,
      modId: modId,
      applicationVersion: applicationVersion
    });
    
    const voteResult = await ocApplicationService.recordVote(
      characterId,
      modId,
      modUsername,
      vote,
      feedback
    );
    
    // Log vote (or vote change)
    if (existingVote && existingVote.vote !== vote) {
      await auditService.logVoteChange(
        characterId,
        applicationVersion,
        modId,
        modUsername,
        existingVote.vote,
        vote
      );
    } else {
      await auditService.logVote(
        characterId,
        applicationVersion,
        modId,
        modUsername,
        vote,
        feedback
      );
    }
    
    // Update Discord embed if message exists
    if (character.discordMessageId) {
      const discordPostingService = require('../../services/discordPostingService');
      await discordPostingService.updateApplicationEmbed(character.discordMessageId, character).catch(err => {
        logger.error('CHARACTERS', 'Failed to update Discord embed', err);
      });
    }
    
    // Check if decision has been reached
    const decision = await ocApplicationService.checkDecision(characterId);
    
    if (decision) {
      if (decision.decision === 'approved') {
        // Process approval
        await ocApplicationService.processApproval(characterId);
        
        // Log decision
        await auditService.logDecision(
          characterId,
          applicationVersion,
          'approved',
          modId,
          { modUsername, voteCounts: voteResult.counts }
        );
        
        // Refresh character
        const refreshedCharacter = await CharacterModel.findById(characterId);
        
        // Assign Discord roles
        try {
          await assignCharacterRoles(refreshedCharacter);
        } catch (err) {
          logger.error('CHARACTERS', 'Failed to assign character roles', err);
          // Log role assignment failure to mod channel if configured
          const LOGGING_CHANNEL_ID = process.env.LOGGING_CHANNEL_ID;
          if (LOGGING_CHANNEL_ID && process.env.DISCORD_TOKEN) {
            const failedRoles = err.message || 'Unknown error';
            await fetch(`https://discord.com/api/v10/channels/${LOGGING_CHANNEL_ID}/messages`, {
              method: 'POST',
              headers: {
                'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                content: `⚠️ **Role Assignment Failed**\n\nUser: <@${refreshedCharacter.userId}>\nCharacter: ${refreshedCharacter.name}\nOC Link: ${process.env.DASHBOARD_URL || 'https://tinglebot.xyz'}/ocs/${refreshedCharacter.publicSlug || refreshedCharacter.name.toLowerCase().replace(/\s+/g, '-')}\n\n**Error:** ${failedRoles}\n\nPlease assign roles manually.`
              })
            }).catch(() => {});
          }
        }
        
        // Send notification via notificationService
        await notificationService.sendOCDecisionNotification(
          refreshedCharacter.userId,
          'approved',
          refreshedCharacter.toObject(),
          null
        ).catch(err => {
          logger.error('CHARACTERS', 'Failed to send approval notification', err);
        });
        
        // Also post to Discord channel
        postCharacterStatusToDiscord(refreshedCharacter, 'accepted', null, isModCharacter).catch(err => {
          logger.error('CHARACTERS', 'Failed to post character acceptance to Discord', err);
        });
        
        return res.json({
          success: true,
          message: 'Character approved',
          character: refreshedCharacter.toObject(),
          voteCounts: voteResult.counts
        });
      } else if (decision.decision === 'needs_changes') {
        // Process needs changes (fast fail)
        const feedbackText = feedback || 'Changes requested by moderator';
        await ocApplicationService.processNeedsChanges(characterId, feedbackText);
        
        // Log decision
        await auditService.logDecision(
          characterId,
          applicationVersion,
          'needs_changes',
          modId,
          { modUsername, feedback: feedbackText }
        );
        
        // Log feedback sent
        await auditService.logFeedbackSent(
          characterId,
          applicationVersion,
          modId,
          feedbackText
        );
        
        // Refresh character
        const refreshedCharacter = await CharacterModel.findById(characterId);
        
        // Send notification via notificationService
        await notificationService.sendOCDecisionNotification(
          refreshedCharacter.userId,
          'needs_changes',
          refreshedCharacter.toObject(),
          feedbackText
        ).catch(err => {
          logger.error('CHARACTERS', 'Failed to send needs changes notification', err);
        });
        
        // Also post to Discord channel
        postCharacterStatusToDiscord(refreshedCharacter, 'denied', feedbackText, isModCharacter).catch(err => {
          logger.error('CHARACTERS', 'Failed to post character needs changes to Discord', err);
        });
        
        return res.json({
          success: true,
          message: 'Character marked as needs changes',
          character: refreshedCharacter.toObject(),
          voteCounts: voteResult.counts,
          feedback: feedbackText
        });
      }
    }
    
    // No decision yet - return vote counts
    const { APPROVAL_THRESHOLD } = ocApplicationService;
    return res.json({
      success: true,
      message: 'Vote recorded',
      voteCounts: voteResult.counts,
      remaining: {
        approvesNeeded: APPROVAL_THRESHOLD - voteResult.counts.approves,
        needsChangesNeeded: 0 // Fast fail - already checked above
      }
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error recording vote', error);
    return res.status(500).json({ 
      error: 'An error occurred while recording your vote',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// ------------------- Function: submitCharacter -------------------
// Submit character for review (move from DRAFT to PENDING)
router.post('/:id/submit', validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;

  // Find character and verify ownership
  let character = await Character.findOne({ 
    _id: characterId, 
    userId: String(userId) 
  });
  
  if (!character) {
    character = await Character.findOne({ 
      _id: characterId, 
      userId: userId 
    });
  }
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Check if character is in DRAFT state
  if (character.status !== null && character.status !== undefined) {
    return res.status(400).json({ 
      error: `Character cannot be submitted. Current status: ${character.status || 'DRAFT'}` 
    });
  }

    try {
    const ocApplicationService = require('../../services/ocApplicationService');
    const auditService = require('../../services/auditService');
    await ocApplicationService.submitCharacter(characterId);

    // Refresh character
    character = await Character.findById(characterId);

    // Log submission
    await auditService.logOCAction(
      'character',
      characterId,
      character.applicationVersion,
      'submitted',
      userId,
      { characterName: character.name }
    );

    // Post to Discord admin channel/thread
    const discordPostingService = require('../../services/discordPostingService');
    logger.info('CHARACTERS', `Attempting to post character ${character.name} to Discord...`);
    await discordPostingService.postApplicationToAdminChannel(character).catch(err => {
      logger.error('CHARACTERS', 'Failed to post character submission to Discord', err);
      console.error('[CHARACTERS] Discord posting error details:', {
        error: err.message,
        stack: err.stack,
        characterId: character._id,
        characterName: character.name,
        userId: character.userId
      });
    });

    logger.info('CHARACTERS', `Character ${character.name} submitted for review by user ${userId}`);

    res.json({
      success: true,
      message: 'Character submitted for review successfully',
      character: character.toObject()
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error submitting character', error);
    res.status(500).json({ 
      error: 'An error occurred while submitting your character',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// ------------------- Function: resubmitCharacter -------------------
// Resubmit character after needs changes (increment version, reset votes)
router.post('/:id/resubmit', validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;

  // Find character and verify ownership
  let character = await Character.findOne({ 
    _id: characterId, 
    userId: String(userId) 
  });
  
  if (!character) {
    character = await Character.findOne({ 
      _id: characterId, 
      userId: userId 
    });
  }
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Check if character is in NEEDS_CHANGES state (denied)
  if (character.status !== 'denied') {
    return res.status(400).json({ 
      error: `Character cannot be resubmitted. Current status: ${character.status || 'DRAFT'}` 
    });
  }

  try {
    const ocApplicationService = require('../../services/ocApplicationService');
    const auditService = require('../../services/auditService');
    
    const oldVersion = character.applicationVersion || 1;
    await ocApplicationService.resubmitCharacter(characterId);

    // Refresh character
    character = await Character.findById(characterId);
    
    // Log resubmission
    await auditService.logResubmission(
      characterId,
      oldVersion,
      character.applicationVersion,
      userId
    );

    // Post update to Discord thread if thread exists
    if (character.discordThreadId) {
      const discordPostingService = require('../../services/discordPostingService');
      discordPostingService.postResubmissionUpdate(character).catch(err => {
        logger.error('CHARACTERS', 'Failed to post resubmission update to Discord', err);
      });
    } else {
      // Post new submission to Discord
      const user = await User.findOne({ discordId: userId });
      postCharacterCreationToDiscord(character, user, req.user, req).catch(err => {
        logger.error('SERVER', 'Failed to post character resubmission to Discord', err);
      });
    }

    logger.info('CHARACTERS', `Character ${character.name} resubmitted (v${character.applicationVersion}) by user ${userId}`);

    res.json({
      success: true,
      message: `Character resubmitted successfully (v${character.applicationVersion})`,
      character: character.toObject()
    });
  } catch (error) {
    logger.error('CHARACTERS', 'Error resubmitting character', error);
    res.status(500).json({ 
      error: 'An error occurred while resubmitting your character',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}));

// ------------------- Function: getApplicationStatus -------------------
// Get current application status for a character
router.get('/:id/application', validateObjectId('id'), asyncHandler(async (req, res) => {
  // Check authentication
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const userId = req.user.discordId;
  const characterId = req.params.id;

  // Find character
  let character = await Character.findOne({ 
    _id: characterId, 
    userId: String(userId) 
  });
  
  if (!character) {
    character = await Character.findOne({ 
      _id: characterId, 
      userId: userId 
    });
  }
  
  if (!character) {
    return res.status(404).json({ error: 'Character not found or access denied' });
  }

  // Get vote counts
  const applicationVersion = character.applicationVersion || 1;
  const approveCount = await CharacterModeration.countDocuments({
    characterId: characterId,
    applicationVersion: applicationVersion,
    vote: 'approve'
  });
  
  const needsChangesCount = await CharacterModeration.countDocuments({
    characterId: characterId,
    applicationVersion: applicationVersion,
    vote: 'needs_changes'
  });

  // Get all votes
  const votes = await CharacterModeration.find({
    characterId: characterId,
    applicationVersion: applicationVersion
  }).sort({ createdAt: -1 }).lean();

  res.json({
    status: character.status, // null=DRAFT, 'pending'=PENDING, 'denied'=NEEDS_CHANGES, 'accepted'=APPROVED
    applicationVersion: character.applicationVersion,
    submittedAt: character.submittedAt,
    decidedAt: character.decidedAt,
    approvedAt: character.approvedAt,
    applicationFeedback: character.applicationFeedback || [],
    voteCounts: {
      approves: approveCount,
      needsChanges: needsChangesCount
    },
    votes: votes,
    discordMessageId: character.discordMessageId,
    discordThreadId: character.discordThreadId
  });
}));

module.exports = router;






