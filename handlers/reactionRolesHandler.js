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
    '📜': '961807270201659442', // scroll -> RP Watch
    '💬': '1118238707078668348', // speech_balloon -> QOTD
    '🆘': '1205321558671884328', // sos -> help
    '🎉': '1325998630032773140' // tada -> Member Event
  },

  // Inactive role - for inactive status management
  inactive: {
    '⚠️': '788148064182730782' // warning -> INACTIVE
  },

  // Rules agreement - for Traveler role
  rulesAgreement: {
    '629100065264369677': '788137818135330837' // triforce -> Traveler
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
  console.log('[reactionRolesHandler.js]: 🎯 Initializing reaction roles handler...');
  
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      if (user.bot) return;
      
      // Handle partial reactions
      if (reaction.message.partial) {
        console.log('[reactionRolesHandler.js]: 📥 Fetching partial message...');
        await reaction.message.fetch();
      }
      if (reaction.partial) {
        console.log('[reactionRolesHandler.js]: 📥 Fetching partial reaction...');
        await reaction.fetch();
      }
      
      await handleReactionRole(reaction, user, 'add');
    } catch (error) {
      console.error('[reactionRolesHandler.js]: Error handling reaction add:', error);
      console.error('[reactionRolesHandler.js]: Error details:', {
        emoji: reaction.emoji?.name,
        emojiId: reaction.emoji?.id,
        userId: user.id,
        messageId: reaction.message?.id,
        channelId: reaction.message?.channelId
      });
    }
  });

  client.on('messageReactionRemove', async (reaction, user) => {
    try {
      if (user.bot) return;
      
      // Handle partial reactions
      if (reaction.message.partial) {
        console.log('[reactionRolesHandler.js]: 📥 Fetching partial message...');
        await reaction.message.fetch();
      }
      if (reaction.partial) {
        console.log('[reactionRolesHandler.js]: 📥 Fetching partial reaction...');
        await reaction.fetch();
      }
      
      await handleReactionRole(reaction, user, 'remove');
    } catch (error) {
      console.error('[reactionRolesHandler.js]: Error handling reaction remove:', error);
      console.error('[reactionRolesHandler.js]: Error details:', {
        emoji: reaction.emoji?.name,
        emojiId: reaction.emoji?.id,
        userId: user.id,
        messageId: reaction.message?.id,
        channelId: reaction.message?.channelId
      });
    }
  });
  
  console.log('[reactionRolesHandler.js]: ✅ Reaction roles handler initialized successfully');
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
    if (!guild) {
      console.log('[reactionRolesHandler.js]: ❌ No guild found for reaction');
      return;
    }
    
    const member = await guild.members.fetch(user.id);
    if (!member) {
      console.log('[reactionRolesHandler.js]: ❌ Member not found');
      return;
    }
    
    const emoji = reaction.emoji.name;
    const emojiId = reaction.emoji.id;
    console.log(`[reactionRolesHandler.js]: 🔍 Reaction detected: emoji="${emoji}", emojiId="${emojiId}", user="${user.tag}", messageId="${reaction.message.id}"`);
    
    // Check if this is a reaction roles message
    const isReactionRolesMessage = await isReactionRolesEmbed(reaction.message);
    if (!isReactionRolesMessage) {
      console.log(`[reactionRolesHandler.js]: ⚠️ Message ${reaction.message.id} is not a reaction roles embed - ignoring reaction`);
      return;
    }
    
    // Determine which category this reaction belongs to
    const category = getReactionCategory(emoji, emojiId);
    if (!category) {
      console.log(`[reactionRolesHandler.js]: ⚠️ No category found for emoji="${emoji}", emojiId="${emojiId}"`);
      return;
    }
    console.log(`[reactionRolesHandler.js]: ✅ Category found: "${category}"`);
    
    const roleId = getRoleId(category, emoji, emojiId);
    if (!roleId) {
      console.log(`[reactionRolesHandler.js]: ❌ No role ID found for category="${category}", emoji="${emoji}", emojiId="${emojiId}"`);
      return;
    }
    console.log(`[reactionRolesHandler.js]: ✅ Role ID found: "${roleId}"`);
    
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
  if (!message.embeds || message.embeds.length === 0) {
    console.log(`[reactionRolesHandler.js]: ⚠️ Message ${message.id} has no embeds`);
    return false;
  }
  
  const embed = message.embeds[0];
  const title = embed.title?.toLowerCase() || '';
  const description = embed.description?.toLowerCase() || '';
  
  console.log(`[reactionRolesHandler.js]: 🔍 Checking embed - messageId: ${message.id}, channelId: ${message.channelId}, title: "${embed.title}"`);
  
  // Check for reaction roles indicators
  const isReactionRoles = title.includes('pronouns') || 
         title.includes('village') || 
         title.includes('role') ||
         title.includes('rules') ||
         title.includes('inactive') ||
         title.includes('notification') ||
         description.includes('choose your own pronouns') ||
         description.includes('choose the village') ||
         description.includes('opt-in roles') ||
         description.includes('fully read') ||
         description.includes('bp2:809226748024979466') || // Bot emoji indicator
         description.includes('inactive role') ||
         description.includes('return to active');
  
  // Also check if message author is the bot and in the roles channel
  const ROLES_CHANNEL_ID = '787807438119370752';
  const RULES_CHANNEL_ID = '788106986327506994';
  const isInRolesChannel = message.channelId === ROLES_CHANNEL_ID || message.channelId === RULES_CHANNEL_ID;
  
  console.log(`[reactionRolesHandler.js]: 🔍 isReactionRoles: ${isReactionRoles}, isInRolesChannel: ${isInRolesChannel} (current: ${message.channelId})`);
  
  if (isReactionRoles && isInRolesChannel) {
    console.log(`[reactionRolesHandler.js]: ✅ Detected reaction roles embed in message ${message.id}`);
    return true;
  } else {
    if (!isReactionRoles) {
      console.log(`[reactionRolesHandler.js]: ⚠️ Message ${message.id} does not match reaction roles patterns`);
    }
    if (!isInRolesChannel) {
      console.log(`[reactionRolesHandler.js]: ⚠️ Message ${message.id} is not in roles/rules channel`);
    }
    return false;
  }
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
  console.log(`[reactionRolesHandler.js]: 🔍 Looking up category for emojiKey="${emojiKey}"`);
  
  if (REACTION_ROLES.pronouns[emojiKey]) {
    console.log(`[reactionRolesHandler.js]: ✅ Found in pronouns`);
    return 'pronouns';
  }
  
  // Check villages (try emoji ID first, then emoji name)
  if (REACTION_ROLES.villages[emojiKey]) {
    console.log(`[reactionRolesHandler.js]: ✅ Found in villages`);
    return 'villages';
  }
  
  // Check notifications (try emoji ID first, then emoji name)
  if (REACTION_ROLES.notifications[emojiKey]) {
    console.log(`[reactionRolesHandler.js]: ✅ Found in notifications`);
    return 'notifications';
  }
  
  // Check inactive (try emoji ID first, then emoji name)
  if (REACTION_ROLES.inactive[emojiKey]) {
    console.log(`[reactionRolesHandler.js]: ✅ Found in inactive`);
    return 'inactive';
  }
  
  // Check rules agreement (try emoji ID first, then emoji name)
  if (REACTION_ROLES.rulesAgreement[emojiKey]) {
    console.log(`[reactionRolesHandler.js]: ✅ Found in rulesAgreement`);
    return 'rulesAgreement';
  }
  
  console.log(`[reactionRolesHandler.js]: ❌ No category found. Available notification emojis:`, Object.keys(REACTION_ROLES.notifications));
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
    case 'rulesAgreement':
      return REACTION_ROLES.rulesAgreement[emojiKey];
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
    .setDescription('<:bp2:809226748024979466> First, choose your own pronouns!\n\n<a:potionpink:795050612496531486> <@&606350506310369281>\n<a:potionblue:795050612198604822> <@&606350558605082637>\n<a:potionpurple:795050612550402069> <@&606350596559208463>\n<:discordpotionyellow:1086881430077984789> <@&1086880101855141978>')
    .setColor('#FF69B4')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();
};

/**
 * Create village reaction roles embed
 * @returns {EmbedBuilder} - The village embed
 */
const createVillageEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Village')
    .setDescription('<:blank:895697584390275162> <:bp2:809226748024979466> Only choose the village of your FIRST/MAIN character.\n\n<:rudania:899492917452890142> <@&630837341124034580> | <:inariko:899493009073274920> <@&631507660524486657> | <:vhintl:899492879205007450> <@&631507736508629002>')
    .setColor('#00CED1')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();
};

/**
 * Create inactive role embed
 * @returns {EmbedBuilder} - The inactive role embed
 */
const createInactiveEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Inactive')
    .setDescription('<:bb0:854499720797618207> **Inactive Role** <:bb5:854499721182445568>\n\nIf you have the <@&788148064182730782> role, this means you are currently marked as inactive. While you have this role, your access to server channels will be limited.\n\n**How You Become Inactive:**\n<:bp:807847444012204063> If you haven\'t participated in the server for 3 months, you will be marked as INACTIVE.\n\n<:bp2:809226748024979466> If you know you\'ll be away or busy for a while, you can set yourself as inactive early by typing `/inactive` in <#641858948802150400>.\n\n**Important:** If you miss 3 consecutive activity checks (held quarterly), you will be removed from the server to make room for new members.')
    .addFields(
      {
        name: '<:bb0:854499720797618207> To Return to Active Status <:bb5:854499721182445568>',
        value: '<:bp2:809226748024979466> **Step 1:** When you\'re ready to return, carefully read through <#788106986327506994> to get updated on any rule changes. Then click the reaction at the bottom to confirm you agree.\n\n<:bp2:809226748024979466> **Step 2:** Go to <#641858948802150400> and type `/active` to mark yourself as active again.\n\n<:bp2:809226748024979466> **Step 3:** Head over to <#787807438119370752> and re-select your roles to regain full access to the server.',
        inline: false
      }
    )
    .setColor('#FF8C00')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();
};

/**
 * Create notification roles embed
 * @returns {EmbedBuilder} - The notification roles embed
 */
const createNotificationRolesEmbed = () => {
  return new EmbedBuilder()
    .setTitle('Opt-In Roles for Notifications')
    .setDescription('<:bb0:854499720797618207> **Opt-In Roles for Notifications** <:bb5:854499721182445568>\n\nThese roles are completely optional and meant to help you stay informed about server activity that interests you. Click the appropriate emoji to assign yourself the role!\n\n────────────────────')
    .addFields(
      {
        name: '📜 RP Watch',
        value: 'Want to be notified when a new Thread RP starts?\nClick the 📜 emoji below to receive the <@&961807270201659442> role!\n\n<:bp2:809226748024979466> Please use this tag once when starting a new thread RP (if you\'re comfortable)! It helps observers find and follow the thread.\n<:bp2:809226748024979466> People can still join a thread manually, but this role makes it easier to stay in the loop!\n\n────────────────────',
        inline: false
      },
      {
        name: '💬 QOTD',
        value: 'Want to be pinged when a new Question of the Day is asked in <#606180017084432394> or <#945486121176027176>?\nClick the 💬 emoji below to receive the <@&1118238707078668348> role!\n\n<:bp2:809226748024979466> Anyone can use this tag! Please avoid spamming or it may be revoked.\n<:bp2:809226748024979466> You\'re also welcome to start a thread with your question!\n\n────────────────────',
        inline: false
      },
      {
        name: '🆘 Call for Help',
        value: 'Need backup? This role is used when a high-tier monster appears in a village and characters are needed to defend or respond.\nClick the 🆘 emoji below to receive the <@&1205321558671884328> role!\n\n────────────────────',
        inline: false
      },
      {
        name: '🎉 Member Events',
        value: 'Want to know when member-run events are happening?\nClick the 🎉 emoji below to receive the <@&1325998630032773140> role!\n\n<:bp2:809226748024979466> This tag is for approved event runners only—please don\'t use it unless you\'re running a registered event!\n\n────────────────────',
        inline: false
      }
    )
    .setFooter({ text: 'React below to get any of the roles above and stay connected to what matters most to you! ✨' })
    .setColor('#32CD32')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();
};

/**
 * Create rules agreement embed
 * @returns {EmbedBuilder} - The rules agreement embed
 */
const createRulesAgreementEmbed = () => {
  return new EmbedBuilder()
    .setTitle('⚠️ Have you FULLY READ and agree to follow ALL of the rules? ⚠️')
    .setDescription('⬆ [**BACK TO TOP**](https://discord.com/channels/603960955839447050/788106986327506994/953021328733118576) ⬆\n🔸 [GROUP RULES](https://discord.com/channels/603960955839447050/788106986327506994/953021447419351130)\n🔸 [SENSITIVE TOPICS](https://discord.com/channels/603960955839447050/788106986327506994/953021653305131019)\n🔸 [TRIGGERS](https://discord.com/channels/603960955839447050/788106986327506994/953021752500424774) ➽ [# 1](https://discord.com/channels/603960955839447050/788106986327506994/953021813196218438) ● [# 2](https://discord.com/channels/603960955839447050/788106986327506994/953021846045991012) ● [# 3](https://discord.com/channels/603960955839447050/788106986327506994/953021896750927916) ● [# 4](https://discord.com/channels/603960955839447050/788106986327506994/953021924945051658) ● [# 5](https://discord.com/channels/603960955839447050/788106986327506994/953021957941628928)\n🔸 [GREY LIST](https://discord.com/channels/603960955839447050/788106986327506994/953022049402638336)\n🔸 [INFRACTIONS](https://discord.com/channels/603960955839447050/788106986327506994/953022159402438686)')
    .setColor('#FFD700')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
        name: '📋 Category',
        value: roleInfo.category,
        inline: false
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
        name: '📋 Category',
        value: roleInfo.category,
        inline: false
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
    'help': {
      category: 'Notifications',
      description: 'Get notified when raids are happening!',
      benefits: '• Raid notifications and alerts\n• Join ongoing raids\n• Help defend villages during raids\n• Participate in raid events'
    },
    'Member Event': {
      category: 'Notifications',
      description: 'Get notified about community events!',
      benefits: '• Member-run event announcements\n• Community activity notifications\n• Special event participation\n• Stay connected with server activities'
    },
    'INACTIVE': {
      category: 'Status',
      description: 'You are currently marked as inactive.',
      benefits: '• Limited server access\n• Automatic removal after extended inactivity\n• Can be reactivated by following the return process'
    },
    'Traveler': {
      category: 'Access',
      description: 'You have agreed to follow all server rules.',
      benefits: '• Full access to server channels\n• Ability to participate in roleplay\n• Access to character creation\n• Join the community and explore Hyrule!'
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
  await channel.send('https://storage.googleapis.com/tinglebot/Graphics/header_-_pronouns.png');
  
  const embed = createPronounsEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add reactions using ONLY custom emojis
  try {
    // Get emoji objects from the guild
    const potionpink = channel.guild.emojis.cache.get('795050612496531486');
    const potionblue = channel.guild.emojis.cache.get('795050612198604822');
    const potionpurple = channel.guild.emojis.cache.get('795050612550402069');
    const discordpotionyellow = channel.guild.emojis.cache.get('1086881430077984789');
    
    // Log if any emojis are missing
    if (!potionpink) console.error('[reactionRolesHandler.js]: potionpink emoji not found (ID: 795050612496531486)');
    if (!potionblue) console.error('[reactionRolesHandler.js]: potionblue emoji not found (ID: 795050612198604822)');
    if (!potionpurple) console.error('[reactionRolesHandler.js]: potionpurple emoji not found (ID: 795050612550402069)');
    if (!discordpotionyellow) console.error('[reactionRolesHandler.js]: discordpotionyellow emoji not found (ID: 1086881430077984789)');
    
    // Only react with the custom emojis that were found
    if (potionpink) await message.react(potionpink);
    if (potionblue) await message.react(potionblue);
    if (potionpurple) await message.react(potionpurple);
    if (discordpotionyellow) await message.react(discordpotionyellow);
  } catch (error) {
    console.error('[reactionRolesHandler.js]: Error adding custom emoji reactions:', error);
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
  await channel.send('https://storage.googleapis.com/tinglebot/Graphics/header_-_village.png');
  
  const embed = createVillageEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add reactions using ONLY custom emojis
  try {
    // Get emoji objects from the guild
    const rudania = channel.guild.emojis.cache.get('899492917452890142');
    const inariko = channel.guild.emojis.cache.get('899493009073274920');
    const vhintl = channel.guild.emojis.cache.get('899492879205007450');
    
    // Log if any emojis are missing
    if (!rudania) console.error('[reactionRolesHandler.js]: rudania emoji not found (ID: 899492917452890142)');
    if (!inariko) console.error('[reactionRolesHandler.js]: inariko emoji not found (ID: 899493009073274920)');
    if (!vhintl) console.error('[reactionRolesHandler.js]: vhintl emoji not found (ID: 899492879205007450)');
    
    // Only react with the custom emojis that were found
    if (rudania) await message.react(rudania);
    if (inariko) await message.react(inariko);
    if (vhintl) await message.react(vhintl);
  } catch (error) {
    console.error('[reactionRolesHandler.js]: Error adding custom emoji reactions:', error);
  }
  
  return message;
};

/**
 * Set up inactive role embed
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Message>} - The posted message
 */
const setupInactiveRoleEmbed = async (channel) => {
  // Post other roles image before the inactive embed
  await channel.send('https://storage.googleapis.com/tinglebot/Graphics/header_-_otherroles.png');
  
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
  const embed = createNotificationRolesEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add reactions using standard emojis
  try {
    await message.react('📜'); // Scroll for RP Watch
    await message.react('💬'); // Speech balloon for QOTD
    await message.react('🆘'); // SOS for Call for Help
    await message.react('🎉'); // Party for Member Events
  } catch (error) {
    console.error('[reactionRolesHandler.js]: Error adding emoji reactions:', error);
  }
  
  return message;
};

/**
 * Set up rules agreement embed
 * @param {TextChannel} channel - The channel to post in
 * @returns {Promise<Message>} - The posted message
 */
const setupRulesAgreementEmbed = async (channel) => {
  const embed = createRulesAgreementEmbed();
  const message = await channel.send({ embeds: [embed] });
  
  // Add triforce reaction for agreement
  try {
    // Get triforce emoji from the guild
    const triforce = channel.guild.emojis.cache.get('629100065264369677');
    
    if (!triforce) {
      console.error('[reactionRolesHandler.js]: triforce emoji not found (ID: 629100065264369677)');
    } else {
      await message.react(triforce);
    }
  } catch (error) {
    console.error('[reactionRolesHandler.js]: Error adding reaction to rules agreement:', error);
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
  setupRulesAgreementEmbed,
  setupAllReactionRoles,
  createPronounsEmbed,
  createVillageEmbed,
  createInactiveEmbed,
  createNotificationRolesEmbed,
  createRulesAgreementEmbed,
  REACTION_ROLES
};
