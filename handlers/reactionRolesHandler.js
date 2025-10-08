// ============================================================================
// REACTION ROLES HANDLER
// ============================================================================

const { EmbedBuilder } = require('discord.js');

// ============================================================================
// REACTION ROLES CONFIGURATION
// ============================================================================

// Role mappings for different reaction role categories
const REACTION_ROLES = {
  // Pronouns - using actual emoji IDs and role IDs from server-data.json
  pronouns: {
    '795050612496531486': '606350506310369281', // potionpink -> She / Her
    '795050612198604822': '606350558605082637', // potionblue -> He / Him
    '795050612550402069': '606350596559208463', // potionpurple -> They / Them
    '1086881430077984789': '1086880101855141978', // discordpotionyellow -> Other / Ask
    // Standard emoji fallbacks for testing
    '🩷': '606350506310369281', // She / Her
    '💙': '606350558605082637', // He / Him
    '💜': '606350596559208463', // They / Them
    '💛': '1086880101855141978' // Other / Ask
  },
  
  // Villages - using actual emoji IDs and role IDs from server-data.json
  villages: {
    '899492917452890142': '630837341124034580', // rudania -> Rudania
    '899493009073274920': '631507660524486657', // inariko -> Inariko
    '899492879205007450': '631507736508629002', // vhintl -> Vhintl
    // Standard emoji fallbacks for testing
    '🔥': '630837341124034580', // Rudania
    '💧': '631507660524486657', // Inariko
    '🌿': '631507736508629002' // Vhintl
  },
  
  // Notification roles - using actual emoji IDs and role IDs from server-data.json
  notifications: {
    '1300300616826200084': '961807270201659442', // scroll (custom emoji) -> RP Watch
    '📜': '961807270201659442', // scroll (fallback) -> RP Watch
    '💬': '1118238707078668348', // speech_balloon -> QOTD
    '🆘': 'Call for Help', // sos -> Call for Help (need to find role ID)
    '🎉': '1325998630032773140' // tada -> Member Event
  },

  // Inactive role - for inactive status management
  inactive: {
    '⚠️': '788148064182730782' // warning -> INACTIVE
  }
};

// ============================================================================
// REACTION ROLES HANDLER
// ============================================================================

/**
 * Initialize reaction roles handler
 * @param {Client} client - Discord client
 */
const initializeReactionRolesHandler = (client) => {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return;
      
      // Handle partial reactions
      if (reaction.message.partial) await reaction.message.fetch();
      if (reaction.partial) await reaction.fetch();
      
      await handleReactionRole(reaction, user, 'add');
    } catch (error) {
      console.error('[reactionRolesHandler.js]: Error handling reaction add:', error);
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    try {
      if (user.bot) return;
      
      // Handle partial reactions
      if (reaction.message.partial) await reaction.message.fetch();
      if (reaction.partial) await reaction.fetch();
      
      await handleReactionRole(reaction, user, 'remove');
    } catch (error) {
      console.error('[reactionRolesHandler.js]: Error handling reaction remove:', error);
    }
  });
};

/**
 * Handle reaction role assignment/removal
 * @param {MessageReaction} reaction - The reaction object
 * @param {User} user - The user who reacted
 * @param {string} action - 'add' or 'remove'
 */
const handleReactionRole = async (reaction, user, action) => {
  try {
    const guild = reaction.message.guild;
    if (!guild) return;
    
    const member = await guild.members.fetch(user.id);
    if (!member) return;
    
    const emoji = reaction.emoji.name;
    const emojiId = reaction.emoji.id;
    
    // Check if this is a reaction roles message
    const isReactionRolesMessage = await isReactionRolesEmbed(reaction.message);
    if (!isReactionRolesMessage) return;
    
    // Determine which category this reaction belongs to
    const category = getReactionCategory(emoji, emojiId);
    if (!category) return;
    
    const roleId = getRoleId(category, emoji, emojiId);
    if (!roleId) return;
    
    // Find the role by ID
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      console.log(`[reactionRolesHandler.js]: Role with ID "${roleId}" not found in guild`);
      return;
    }
    
    // Add or remove the role
    if (action === 'add') {
      if (!member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        console.log(`[reactionRolesHandler.js]: Added role "${role.name}" to ${user.tag}`);
        
        // Send detailed embed confirmation message
        try {
          const embed = createRoleAddedEmbed(role, user);
          await user.send({ embeds: [embed] });
        } catch (error) {
          console.log(`[reactionRolesHandler.js]: Could not send DM to ${user.tag} (DMs may be disabled)`);
        }
      }
    } else if (action === 'remove') {
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        console.log(`[reactionRolesHandler.js]: Removed role "${role.name}" from ${user.tag}`);
        
        // Send detailed embed confirmation message
        try {
          const embed = createRoleRemovedEmbed(role, user);
          await user.send({ embeds: [embed] });
        } catch (error) {
          console.log(`[reactionRolesHandler.js]: Could not send DM to ${user.tag} (DMs may be disabled)`);
        }
      }
    }
    
  } catch (error) {
    console.error(`[reactionRolesHandler.js]: Error handling reaction role ${action}:`, error);
  }
};

/**
 * Check if a message is a reaction roles embed
 * @param {Message} message - The message to check
 * @returns {boolean} - Whether this is a reaction roles message
 */
const isReactionRolesEmbed = async (message) => {
  if (!message.embeds || message.embeds.length === 0) return false;
  
  const embed = message.embeds[0];
  const title = embed.title?.toLowerCase() || '';
  const description = embed.description?.toLowerCase() || '';
  
  // Check for reaction roles indicators
  return title.includes('pronouns') || 
         title.includes('village') || 
         title.includes('role') ||
         description.includes('choose your own pronouns') ||
         description.includes('choose the village') ||
         description.includes('opt-in roles');
};

/**
 * Get the category of a reaction
 * @param {string} emoji - The emoji name
 * @param {string} emojiId - The emoji ID (for custom emojis)
 * @returns {string|null} - The category or null
 */
const getReactionCategory = (emoji, emojiId) => {
  // Check pronouns (try emoji ID first, then emoji name)
  const emojiKey = emojiId || emoji;
  if (REACTION_ROLES.pronouns[emojiKey]) return 'pronouns';
  
  // Check villages (try emoji ID first, then emoji name)
  if (REACTION_ROLES.villages[emojiKey]) return 'villages';
  
  // Check notifications (try emoji ID first, then emoji name)
  if (REACTION_ROLES.notifications[emojiKey]) return 'notifications';
  
  // Check inactive (try emoji ID first, then emoji name)
  if (REACTION_ROLES.inactive[emojiKey]) return 'inactive';
  
  return null;
};

/**
 * Get the role ID for a reaction
 * @param {string} category - The category
 * @param {string} emoji - The emoji name
 * @param {string} emojiId - The emoji ID
 * @returns {string|null} - The role ID or null
 */
const getRoleId = (category, emoji, emojiId) => {
  const emojiKey = emojiId || emoji;
  switch (category) {
    case 'pronouns':
      return REACTION_ROLES.pronouns[emojiKey];
    case 'villages':
      return REACTION_ROLES.villages[emojiKey];
    case 'notifications':
      return REACTION_ROLES.notifications[emojiKey];
    case 'inactive':
      return REACTION_ROLES.inactive[emojiKey];
    default:
      return null;
  }
};

// ============================================================================
// REACTION ROLES EMBED CREATORS
// ============================================================================

/**
 * Create pronouns reaction roles embed
 * @returns {EmbedBuilder} - The pronouns embed
 */
const createPronounsEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Pronouns')
    .setDescription('<:bp2:1300264497823735828> First, choose your own pronouns!\n\n<a:potionpink:795050612496531486> @She / Her\n<a:potionblue:795050612198604822> @He / Him\n<a:potionpurple:795050612550402069> @They / Them\n<:discordpotionyellow:1086881430077984789> @Other / Ask')
    .setColor('#FF69B4')
    .setTimestamp();
};

/**
 * Create village reaction roles embed
 * @returns {EmbedBuilder} - The village embed
 */
const createVillageEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Village')
    .setDescription('<:blank:1284697992430067793> <:bp2:1300264497823735828> Only choose the village of your FIRST/MAIN character.\n\n<:rudania:899492917452890142> @Rudania | <:inariko:899493009073274920> @Inariko | <:vhintl:899492879205007450> @Vhintl')
    .setColor('#00CED1')
    .setTimestamp();
};

/**
 * Create inactive role embed
 * @returns {EmbedBuilder} - The inactive role embed
 */
const createInactiveEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Inactive')
    .setDescription('<:bb0:1300264428894359643> Inactive Role <:bb5:1300264445885005874>\nIf you have the @INACTIVE role, this means you are currently marked as inactive. While you have this role, your access to server channels will be limited.\n\n<:bp:1300264484698980372> If you haven\'t participated in the server for 3 months, you will be marked as INACTIVE.\n<:bp2:1300264497823735828> If you know you\'ll be away or busy for a while, you can set yourself as inactive early by typing !inactive in 🔔》sheikah-slate.\n◈ If you miss 3 consecutive activity checks (held quarterly), you will be removed from the server to make room for new members. ◈')
    .addFields(
      {
        name: 'Active',
        value: '<:bb0:1300264428894359643> To Return to Active Status <:bb5:1300264445885005874>\n\n<:bp2:1300264497823735828> 1. When you\'re ready to return, carefully read through 🔔》rules to get updated on any rule changes. Then click the reaction at the bottom to confirm you agree.\n\n<:bp2:1300264497823735828> 2. Go to 🔔》sheikah-slate and type !active to mark yourself as active again.\n\n<:bp2:1300264497823735828> 3. Head over to 🔔》roles and re-select your roles to regain full access to the server.',
        inline: false
      }
    )
    .setColor('#FF8C00')
    .setTimestamp();
};

/**
 * Create notification roles embed
 * @returns {EmbedBuilder} - The notification roles embed
 */
const createNotificationRolesEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Opt-In Roles for Notifications')
    .setDescription('<:bb0:1300264428894359643> Opt-In Roles for Notifications <:bb5:1300264445885005874>\n\nThese roles are completely optional and meant to help you stay informed about server activity that interests you. Click the appropriate emoji to assign yourself the role!\n\n────────────────────')
    .addFields(
      {
        name: '<:scroll:1300300616826200084> @RP Watch',
        value: 'Want to be notified when a new Thread RP starts?\nClick the <:scroll:1300300616826200084> emoji below to receive the RP Watch role!\n\n<:bp2:1300264497823735828> Please use this tag once when starting a new thread RP (if you\'re comfortable)! It helps observers find and follow the thread.\n<:bp2:1300264497823735828> People can still join a thread manually, but this role makes it easier to stay in the loop!\n\n────────────────────',
        inline: false
      },
      {
        name: '💬 @QOTD',
        value: 'Want to be pinged when a new Question of the Day is asked in 💬》headcanons or 💬》nsfw-boinkcanons?\nClick the 💬 emoji below to opt-in!\n\n<:bp2:1300264497823735828> Anyone can use this tag! Please avoid spamming or it may be revoked.\n<:bp2:1300264497823735828> You\'re also welcome to start a thread with your question!\n\n────────────────────',
        inline: false
      },
      {
        name: '🆘 @Call for Help',
        value: 'Need backup? This role is used when a high-tier monster appears in a village and characters are needed to defend or respond.\nClick the 🆘 emoji below to be notified of these moments!\n\n────────────────────',
        inline: false
      },
      {
        name: '🎉 @Member Events',
        value: 'Want to know when member-run events are happening?\nClick the 🎉 emoji below to be notified about new or ongoing community events!\n\n<:bp2:1300264497823735828> This tag is for approved event runners only—please don\'t use it unless you\'re running a registered event!\n\n────────────────────',
        inline: false
      }
    )
    .setFooter({ text: 'React below to get any of the roles above and stay connected to what matters most to you! ✨' })
    .setColor('#32CD32')
    .setTimestamp();
};

/**
 * Create role added embed
 * @param {Role} role - The role that was added
 * @param {User} user - The user who received the role
 * @returns {EmbedBuilder} - The role added embed
 */
const createRoleAddedEmbed = (role, user) => {
  const roleInfo = getRoleInformation(role.name);
  
  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('✅ Role Added!')
    .setDescription(`You now have the **${role.name}** role!`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '🎭 Role Name',
        value: role.name,
        inline: true
      },
      {
        name: '📋 Category',
        value: roleInfo.category,
        inline: true
      },
      {
        name: '🆔 Role ID',
        value: role.id,
        inline: true
      },
      {
        name: '📝 Description',
        value: roleInfo.description,
        inline: false
      },
      {
        name: '💡 What This Means',
        value: roleInfo.benefits,
        inline: false
      }
    )
    .setFooter({ 
      text: 'Role assignment successful • React again to remove this role',
      icon_url: user.client.user.displayAvatarURL()
    })
    .setTimestamp();

  return embed;
};

/**
 * Create role removed embed
 * @param {Role} role - The role that was removed
 * @param {User} user - The user who lost the role
 * @returns {EmbedBuilder} - The role removed embed
 */
const createRoleRemovedEmbed = (role, user) => {
  const roleInfo = getRoleInformation(role.name);
  
  const embed = new EmbedBuilder()
    .setColor(0xff6b6b)
    .setTitle('❌ Role Removed')
    .setDescription(`You no longer have the **${role.name}** role.`)
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: '🎭 Role Name',
        value: role.name,
        inline: true
      },
      {
        name: '📋 Category',
        value: roleInfo.category,
        inline: true
      },
      {
        name: '🆔 Role ID',
        value: role.id,
        inline: true
      },
      {
        name: '📝 What You Lost',
        value: roleInfo.benefits,
        inline: false
      },
      {
        name: '🔄 Want It Back?',
        value: 'Simply react to the role message again to re-add this role!',
        inline: false
      }
    )
    .setFooter({ 
      text: 'Role removal successful • React again to re-add this role',
      icon_url: user.client.user.displayAvatarURL()
    })
    .setTimestamp();

  return embed;
};

/**
 * Get detailed information about a role
 * @param {string} roleName - The name of the role
 * @returns {Object} - Role information object
 */
const getRoleInformation = (roleName) => {
  const roleInfo = {
    'She / Her': {
      category: 'Pronouns',
      description: 'Use this to indicate your preferred pronouns.',
      benefits: '• Helps others address you correctly\n• Creates a more inclusive environment\n• Shows respect for identity'
    },
    'He / Him': {
      category: 'Pronouns',
      description: 'Use this to indicate your preferred pronouns.',
      benefits: '• Helps others address you correctly\n• Creates a more inclusive environment\n• Shows respect for identity'
    },
    'They / Them': {
      category: 'Pronouns',
      description: 'Use this to indicate your preferred pronouns.',
      benefits: '• Helps others address you correctly\n• Creates a more inclusive environment\n• Shows respect for identity'
    },
    'Other / Ask': {
      category: 'Pronouns',
      description: 'Use this if you prefer different pronouns or want people to ask.',
      benefits: '• Indicates you have unique pronoun preferences\n• Encourages respectful communication\n• Creates awareness for diverse identities'
    },
    'Rudania': {
      category: 'Village',
      description: 'You are a member of Rudania Village.',
      benefits: '• Access to village-specific channels\n• Participate in village events\n• Connect with fellow villagers\n• Village-specific roleplay opportunities'
    },
    'Inariko': {
      category: 'Village',
      description: 'You are a member of Inariko Village.',
      benefits: '• Access to village-specific channels\n• Participate in village events\n• Connect with fellow villagers\n• Village-specific roleplay opportunities'
    },
    'Vhintl': {
      category: 'Village',
      description: 'You are a member of Vhintl Village.',
      benefits: '• Access to village-specific channels\n• Participate in village events\n• Connect with fellow villagers\n• Village-specific roleplay opportunities'
    },
    'RP Watch': {
      category: 'Notifications',
      description: 'Get notified when new Thread RP starts!',
      benefits: '• Receive notifications for new RP threads\n• Stay updated on ongoing roleplay\n• Easily find threads to observe or join\n• Never miss exciting RP opportunities'
    },
    'qotd': {
      category: 'Notifications',
      description: 'Get pinged for Questions of the Day!',
      benefits: '• Daily questions in headcanon channels\n• NSFW questions when available\n• Engage with community discussions\n• Share your thoughts and opinions'
    },
    'Call for Help': {
      category: 'Notifications',
      description: 'Get notified when backup is needed!',
      benefits: '• High-tier monster encounter alerts\n• Village defense situation calls\n• Emergency response notifications\n• Help protect the community'
    },
    'Member Event': {
      category: 'Notifications',
      description: 'Get notified about community events!',
      benefits: '• Member-run event announcements\n• Community activity notifications\n• Special event participation\n• Stay connected with server activities'
    },
    'Member Events': {
      category: 'Notifications',
      description: 'Get notified about community events!',
      benefits: '• Member-run event announcements\n• Community activity notifications\n• Special event participation\n• Stay connected with server activities'
    },
    'INACTIVE': {
      category: 'Status',
      description: 'You are currently marked as inactive.',
      benefits: '• Limited server access\n• Automatic removal after extended inactivity\n• Can be reactivated by following the return process'
    }
  };

  // Return role info or default if not found
  return roleInfo[roleName] || {
    category: 'Custom Role',
    description: 'This is a custom role with special permissions.',
    benefits: '• Custom permissions and access\n• Special role benefits\n• Unique server experience'
  };
};

// ============================================================================
// REACTION ROLES SETUP FUNCTIONS
// ============================================================================

/**
 * Set up pronouns reaction roles
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Message>} - The posted message
 */
const setupPronounsReactionRoles = async (channel) => {
  // Post image first
  await channel.send('https://media.discordapp.net/attachments/787807438119370752/895700602896670760/header_-_pronouns.png?ex=68e68931&is=68e537b1&hm=7cae44768fb69f5369408d58b4c91d4d6115d4551191c583ebe1a6fa6fbc9b1d&=&format=webp&quality=lossless');
  
  const embed = createPronounsEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add reactions using custom emojis
  try {
    // Get emoji objects from the guild
    const potionpink = channel.guild.emojis.cache.get('795050612496531486');
    const potionblue = channel.guild.emojis.cache.get('795050612198604822');
    const potionpurple = channel.guild.emojis.cache.get('795050612550402069');
    const discordpotionyellow = channel.guild.emojis.cache.get('1086881430077984789');
    
    if (potionpink) await message.react(potionpink);
    if (potionblue) await message.react(potionblue);
    if (potionpurple) await message.react(potionpurple);
    if (discordpotionyellow) await message.react(discordpotionyellow);
  } catch (error) {
    console.log('[reactionRolesHandler.js]: Error adding custom emoji reactions:', error);
    // Fallback to standard emojis if custom ones don't exist
    await message.react('🩷');
    await message.react('💙');
    await message.react('💜');
    await message.react('💛');
  }
  
  return message;
};

/**
 * Set up village reaction roles
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Message>} - The posted message
 */
const setupVillageReactionRoles = async (channel) => {
  // Post image first
  await channel.send('https://media.discordapp.net/attachments/787807438119370752/895702437669765130/header_-_village.png?ex=68e68ae6&is=68e53966&hm=21ae0a642607d9a7a50ca8bf974fc3d4dd9baeccccbc22f0986755b43044da3a&=&format=webp&quality=lossless');
  
  const embed = createVillageEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add reactions using custom emojis
  try {
    // Get emoji objects from the guild
    const rudania = channel.guild.emojis.cache.get('899492917452890142');
    const inariko = channel.guild.emojis.cache.get('899493009073274920');
    const vhintl = channel.guild.emojis.cache.get('899492879205007450');
    
    if (rudania) await message.react(rudania);
    if (inariko) await message.react(inariko);
    if (vhintl) await message.react(vhintl);
  } catch (error) {
    console.log('[reactionRolesHandler.js]: Error adding custom emoji reactions:', error);
    // Fallback to standard emojis if custom ones don't exist
    await message.react('🔥');
    await message.react('💧');
    await message.react('🌿');
  }
  
  return message;
};

/**
 * Set up inactive role embed
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Message>} - The posted message
 */
const setupInactiveRoleEmbed = async (channel) => {
  const embed = createInactiveEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  return message;
};

/**
 * Set up notification roles
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Message>} - The posted message
 */
const setupNotificationReactionRoles = async (channel) => {
  // Post image first
  await channel.send('https://media.discordapp.net/attachments/787807438119370752/895711409281843300/header_-_otherroles.png?ex=68e69341&is=68e541c1&hm=254c85259c5db33419f7ff013b31df2e4adffea2ad27d302d634622495ad9a6d&=&format=webp&quality=lossless');
  
  const embed = createNotificationRolesEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add reactions using custom scroll emoji and standard emojis
  try {
    // Get custom scroll emoji from the guild
    const scroll = channel.guild.emojis.cache.get('1300300616826200084');
    
    if (scroll) await message.react(scroll);
    else await message.react('📜'); // Fallback to standard emoji
    
    await message.react('💬');
    await message.react('🆘');
    await message.react('🎉');
  } catch (error) {
    console.log('[reactionRolesHandler.js]: Error adding custom emoji reactions:', error);
    // Fallback to standard emojis if custom ones don't exist
    await message.react('📜');
    await message.react('💬');
    await message.react('🆘');
    await message.react('🎉');
  }
  
  return message;
};

/**
 * Set up all reaction roles in a channel
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Object>} - Object containing all posted messages
 */
const setupAllReactionRoles = async (channel) => {
  try {
    const messages = {};
    
    // Set up pronouns
    messages.pronouns = await setupPronounsReactionRoles(channel);
    
    // Set up villages
    messages.villages = await setupVillageReactionRoles(channel);
    
    // Set up inactive role info
    messages.inactive = await setupInactiveRoleEmbed(channel);
    
    // Set up notification roles
    messages.notifications = await setupNotificationReactionRoles(channel);
    
    console.log('[reactionRolesHandler.js]: Successfully set up all reaction roles');
    return messages;
    
  } catch (error) {
    console.error('[reactionRolesHandler.js]: Error setting up reaction roles:', error);
    throw error;
  }
};

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  initializeReactionRolesHandler,
  setupPronounsReactionRoles,
  setupVillageReactionRoles,
  setupInactiveRoleEmbed,
  setupNotificationReactionRoles,
  setupAllReactionRoles,
  createPronounsEmbed,
  createVillageEmbed,
  createInactiveEmbed,
  createNotificationRolesEmbed,
  REACTION_ROLES
};
