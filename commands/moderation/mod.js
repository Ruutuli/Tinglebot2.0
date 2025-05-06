// ============================================================================
// ------------------- Imports -------------------
// Grouped and alphabetized within each section
// ============================================================================

const fs = require('fs');
const path = require('path');

const {
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder
} = require('discord.js');

const { handleError } = require('../../utils/globalErrorHandler');
const {
  fetchCharacterByName,
  fetchCharacterByNameAndUserId,
  updatePetToCharacter,
  fetchItemByName,
  getOrCreateToken,
  updateTokenBalance,
  appendEarnedTokens
} = require('../../database/db');

const Pet = require('../../models/PetModel');
const User = require('../../models/UserModel');

const {
  addItemInventoryDatabase
} = require('../../utils/inventoryUtils');

const {
  deleteSubmissionFromStorage,
  retrieveSubmissionFromStorage
} = require('../../utils/storage');

const {
  storeEncounter,
  getRandomMount,
  getMountThumbnail,
  getMountEmoji
} = require('../../modules/mountModule');

const {
  fetchTableFromDatabase,
  loadTable,
  rollItem
} = require('../../utils/sheetTableUtils');

const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const villageEmojis = {
  rudania: '<:rudania:899492917452890142>',
  inariko: '<:inariko:899493009073274920>',
  vhintl: '<:vhintl:899492879205007450>',
};

const allVillageMounts = ['Horse', 'Donkey'];

// ============================================================================
// ------------------- Command Definition -------------------
// Defines the /mod command and all subcommands
// ============================================================================

const modCommand = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('🛠️ Moderator utilities: manage items, pets, encounters, status, tables, and submissions')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)

// ------------------- Subcommand: give -------------------
.addSubcommand(sub =>
    sub
      .setName('give')
      .setDescription('🎁 Give an item to a character')
      .addStringOption(opt =>
        opt
          .setName('character')
          .setDescription('Name of the target character')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt
          .setName('item')
          .setDescription('Name of the item to give')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt
          .setName('quantity')
          .setDescription('Amount of the item to give')
          .setRequired(true)
      )
  )
  
  // ------------------- Subcommand: petlevel -------------------
  .addSubcommand(sub =>
    sub
      .setName('petlevel')
      .setDescription("🐾 Override a pet's level for a character")
      .addStringOption(opt =>
        opt
          .setName('character')
          .setDescription('Name of the character owner')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(opt =>
        opt
          .setName('petname')
          .setDescription("Name of the pet to override")
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addIntegerOption(opt =>
        opt
          .setName('level')
          .setDescription('New level value for the pet')
          .setRequired(true)
      )
  )
  
  // ------------------- Subcommand: mount -------------------
  .addSubcommand(sub =>
    sub
      .setName('mount')
      .setDescription("🐴 Create a mount encounter")
      .addStringOption(option => option
        .setName('village')
        .setDescription('Enter the village where the encounter happens')
        .setRequired(false)
        .addChoices(
          { name: 'Rudania', value: 'rudania' },
          { name: 'Inariko', value: 'inariko' },
          { name: 'Vhintl', value: 'vhintl' }
        )
      )
      .addStringOption(option => option
        .setName('level')
        .setDescription('Choose the mount level (Basic, Mid, High)')
        .setRequired(false)
        .addChoices(
          { name: 'Basic', value: 'Basic' },
          { name: 'Mid', value: 'Mid' },
          { name: 'High', value: 'High' }
        )
      )
      .addStringOption(option => option
        .setName('species')
        .setDescription('Choose the mount species')
        .setRequired(false)
        .addChoices(
          { name: 'Horse 🐴', value: 'Horse' },
          { name: 'Donkey 🍑', value: 'Donkey' },
          { name: 'Ostrich 🦃', value: 'Ostrich' },
          { name: 'Mountain Goat 🐐', value: 'Mountain Goat' },
          { name: 'Deer 🦌', value: 'Deer' },
          { name: 'Bullbo 🐗', value: 'Bullbo' },
          { name: 'Water Buffalo 🐃', value: 'Water Buffalo' },
          { name: 'Wolfos 🐺', value: 'Wolfos' },
          { name: 'Dodongo 🐉', value: 'Dodongo' },
          { name: 'Moose 🍁', value: 'Moose' },
          { name: 'Bear 🐻', value: 'Bear' }
        )
      )
  )
  
  // ------------------- Subcommand: approve -------------------
  .addSubcommand(sub =>
    sub
      .setName('approve')
      .setDescription('✅ Approve or deny a submission')
      .addStringOption(opt =>
        opt
          .setName('submission_id')
          .setDescription('The ID of the submission to approve/deny.')
          .setRequired(true)
      )
      .addStringOption(opt =>
        opt
          .setName('action')
          .setDescription('Approve or deny the submission.')
          .setRequired(true)
          .addChoices(
            { name: 'Approve', value: 'approve' },
            { name: 'Deny', value: 'deny' }
          )
      )
      .addStringOption(opt =>
        opt
          .setName('reason')
          .setDescription('Provide a reason for denying the submission (optional).')
          .setRequired(false)
      )
  )  
  
  // ------------------- Subcommand: inactivityreport -------------------
  .addSubcommand(sub =>
    sub
      .setName('inactivityreport')
      .setDescription("📋 View members inactive for 3+ months")
  )
  
  // ------------------- Subcommand: table -------------------
  .addSubcommandGroup(group =>
    group
      .setName('table')
      .setDescription("📊 Load or roll from item tables")
      .addSubcommand(sub =>
        sub
          .setName('load')
          .setDescription('Loads a table from Google Sheets into the database')
          .addStringOption(option =>
            option
              .setName('tablename')
              .setDescription('The name of the sheet tab')
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub
          .setName('roll')
          .setDescription('Rolls an item from a loaded table stored in the database')
          .addStringOption(option =>
            option
              .setName('tablename')
              .setDescription('The name of the table to roll from')
              .setRequired(true)
          )
      )
  )
  
// ============================================================================
// ------------------- Execute Command Handler -------------------
// Delegates logic to subcommand-specific handlers
// ============================================================================

async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'give') {
        return await handleGive(interaction);      
    } else if (subcommand === 'petlevel') {
        return await handlePetLevel(interaction);
    } else if (subcommand === 'mount') {
        return await handleMount(interaction);      
    } else if (subcommand === 'approve') {
        return await handleApprove(interaction);      
    } else if (subcommand === 'inactivityreport') {
        return await handleInactivityReport(interaction);      
    } else if (subcommand === 'table') {
        return await handleTable(interaction);      
    } else {
      return interaction.editReply('❌ Unknown subcommand.');
    }

  } catch (error) {
    handleError(error, 'modCombined.js');
    console.error('[modCombined.js]: Command execution error', error);
    return interaction.editReply('⚠️ Something went wrong while processing the command.');
  }
}


// ============================================================================
// ------------------- Handlers -------------------.
// ============================================================================

// ------------------- Function: handleGive -------------------
// Gives an item to a character by name, validating quantity and existence.
async function handleGive(interaction) {
    const userId = interaction.user.id;
    const charName = interaction.options.getString('character');
    const itemName = interaction.options.getString('item');
    const quantity = interaction.options.getInteger('quantity');
  
    if (quantity < 1) {
      return interaction.editReply('❌ You must specify a quantity of at least **1**.');
    }
  
    // ------------------- Fetch Character & Item -------------------
    const character = await fetchCharacterByNameAndUserId(charName, userId);
    if (!character) {
      return interaction.editReply(`❌ Character **${charName}** not found for your account.`);
    }
  
    const item = await fetchItemByName(itemName);
    if (!item) {
      return interaction.editReply(`❌ Item **${itemName}** does not exist.`);
    }
  
    // ------------------- Apply Inventory Update -------------------
    await addItemInventoryDatabase(
      character._id,
      itemName,
      quantity,
      interaction,
      'Admin Give'
    );
  
    return interaction.editReply(
      `✅ Successfully gave **${quantity}× ${itemName}** to **${character.name}**.`
    );
  }

  // ------------------- Function: handlePetLevel -------------------
// Overrides a pet's level and syncs its rollsRemaining to match.
async function handlePetLevel(interaction) {
    const charName = interaction.options.getString('character');
    const petName = interaction.options.getString('petname');
    const newLevel = interaction.options.getInteger('level');
  
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return interaction.editReply(
        `❌ Character **${charName}** not found in database.`
      );
    }
  
    const petDoc = await Pet.findOne({
      owner: character._id,
      name: petName,
    });
  
    if (!petDoc) {
      return interaction.editReply(
        `❌ Pet **${petName}** not found for **${character.name}**.`
      );
    }
  
    petDoc.level = newLevel;
    petDoc.rollsRemaining = newLevel;
    await petDoc.save();
  
    const updatedPet = petDoc.toObject();
    delete updatedPet._id;
  
    await updatePetToCharacter(character._id, petName, updatedPet);
  
    return interaction.editReply(
      `✅ Pet **${petName}** level and rolls set to **${newLevel}** for **${character.name}**.`
    );
  }
  
  // ------------------- Function: handleMount -------------------
// Generates a random mount encounter with optional village, level, and species.
async function handleMount(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.editReply('❌ You do not have permission to use this command.');
    }
  
    let village = interaction.options.getString('village');
  
    // ------------------- Determine Village from Channel -------------------
    if (!village) {
      const channelId = interaction.channelId;
      if (channelId === process.env.RUDANIA_TOWN_HALL) {
        village = 'rudania';
      } else if (channelId === process.env.INARIKO_TOWN_HALL) {
        village = 'inariko';
      } else if (channelId === process.env.VHINTL_TOWN_HALL) {
        village = 'vhintl';
      } else {
        return interaction.editReply('❌ **You must use this command inside a Town Hall channel (Rudania, Inariko, or Vhintl).**');
      }
    }
  
    let species = interaction.options.getString('species');
    if (!species) {
      const mountData = getRandomMount(village);
      if (!mountData || mountData.village.toLowerCase() !== village.toLowerCase()) {
        return interaction.editReply(`❌ **Failed to find a valid mount species for ${village}.** Please try again.`);
      }
      species = mountData.mount;
    }
  
    let level = interaction.options.getString('level');
  
    if (!level) {
      const speciesToLevelMap = {
        Horse: ['Basic', 'Mid', 'High'],
        Donkey: ['Basic', 'Mid', 'High'],
        Ostrich: ['Basic'],
        'Mountain Goat': ['Basic'],
        Deer: ['Basic'],
        Bullbo: ['Mid'],
        'Water Buffalo': ['Mid'],
        Wolfos: ['Mid'],
        Dodongo: ['High'],
        Moose: ['High'],
        Bear: ['High'],
      };
  
      const validLevels = speciesToLevelMap[species] || [];
      if (validLevels.length === 0) {
        return interaction.editReply(`❌ Invalid species: ${species}. Please choose a valid species.`);
      }
  
      level = validLevels[Math.floor(Math.random() * validLevels.length)];
    }
  
    const encounterId = uuidv4().split('-')[0];
    const emoji = getMountEmoji(species);
    const villageWithEmoji = `${villageEmojis[village]} ${village}`;
  
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} 🌟 ${level} Level ${species} Encounter!`)
      .setDescription(`🐾 A **${level} level ${species}** has been spotted in **${villageWithEmoji}**!\n\nTo join the encounter, use </mount:1306176789755858983>.`)
      .addFields(
        {
          name: '📜 Encounter Information',
          value:
            `> You will need **Tokens** for this game if you succeed!\n\n` +
            `Use the command below to join:\n` +
            `\`\`\`/mount encounterid:${encounterId} charactername:\`\`\``,
          inline: false,
        },
        {
          name: '🏠 Village',
          value: allVillageMounts.includes(species)
            ? `> 🏠 This mount can be kept by anyone in **any village**, but only those currently in **${villageWithEmoji}** can participate!`
            : `> ❗ This mount can only be kept by villagers from **${villageWithEmoji}**, and only those currently in **${villageWithEmoji}** can participate!`,
          inline: false,
        }
      )
      .setThumbnail(getMountThumbnail(species) || '')
      .setColor(0xAA926A)
      .setFooter({ text: '⏳ Wait a minute before rolling again or let others participate.' });
  
    const encounterData = {
      users: [],
      mountType: species,
      rarity: 'To be determined',
      mountLevel: level,
      mountStamina: 'To be determined',
      environment: 'To be determined',
      village,
      actions: [],
      tameStatus: false,
    };
  
    try {
      storeEncounter(encounterId, encounterData);
    } catch (error) {
      handleError(error, 'mod.js');
      console.error('[mod.js]: Error storing encounter:', error);
      return interaction.editReply('❌ Failed to store encounter. Please try again later.');
    }
  
    await interaction.editReply({ embeds: [embed] });
  }
  
  // ------------------- Function: handleApprove -------------------
// Approves or denies a user submission and handles token updates, notifications, and reactions.
async function handleApprove(interaction) {
    const submissionId = interaction.options.getString('submission_id');
    const action = interaction.options.getString('action');
    const reason = interaction.options.getString('reason') || null;
  
    await interaction.deferReply({ ephemeral: true });
  
    if (!submissionId || typeof submissionId !== 'string') {
      return interaction.editReply('❌ Invalid submission ID provided.');
    }
  
    try {
      const submission = await retrieveSubmissionFromStorage(submissionId);
      if (!submission) {
        return interaction.editReply(`⚠️ Submission with ID \`${submissionId}\` not found.`);
      }
  
      const { userId, collab, category = 'art', finalTokenAmount: tokenAmount, title, messageUrl } = submission;
  
      if (!messageUrl) {
        throw new Error('Message URL is missing or invalid.');
      }
  
      const channelId = messageUrl.split('/')[5];
      const messageId = messageUrl.split('/')[6];
      const channel = await interaction.client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
  
      if (action === 'approve') {
        const user = await getOrCreateToken(userId);
        if (!user) {
          return interaction.editReply(`❌ User with ID \`${userId}\` not found.`);
        }
  
        await message.react('☑️');
  
        if (collab) {
          const splitTokens = Math.floor(tokenAmount / 2);
          const collaboratorId = collab.replace(/[<@>]/g, '');
  
          await updateTokenBalance(userId, splitTokens);
          await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);
  
          await updateTokenBalance(collaboratorId, splitTokens);
          await appendEarnedTokens(collaboratorId, title, category, splitTokens, messageUrl);
  
          await interaction.client.users.send(
            userId,
            `**✅ Your submission \`${submissionId}\` has been approved!**\nYou have received **${splitTokens}** tokens.`
          );
          await interaction.client.users.send(
            collaboratorId,
            `**✅ A submission you collaborated on (\`${submissionId}\`) has been approved!**\nYou have received **${splitTokens}** tokens.`
          );
        } else {
          await updateTokenBalance(userId, tokenAmount);
          await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);
  
          await interaction.client.users.send(
            userId,
            `**✅ Your submission \`${submissionId}\` has been approved!**\n**${tokenAmount}** tokens have been added to your balance.`
          );
        }
  
        await deleteSubmissionFromStorage(submissionId);
        return interaction.editReply(`✅ Submission \`${submissionId}\` has been approved.`);
      }
  
      if (action === 'deny') {
        await message.react('❌');
  
        await interaction.client.users.send(
          userId,
          `**❌ Your submission \`${submissionId}\` has been denied.**\nPlease resubmit your submission for approval.\n**Reason:** ${reason || 'No reason provided.'}`
        );
  
        await deleteSubmissionFromStorage(submissionId);
        return interaction.editReply(`❌ Submission \`${submissionId}\` has been denied.\n**Reason:** ${reason || 'No reason provided.'}`);
      }
  
      return interaction.editReply('❌ Invalid action specified. Use `approve` or `deny`.');
    } catch (error) {
      handleError(error, 'mod.js');
      console.error('[mod.js]: Error during approve/deny logic', error);
      return interaction.editReply('⚠️ An error occurred while processing the submission.');
    }
  }

  // ------------------- Function: handleInactivityReport -------------------
// Generates a report of users inactive for 3+ months, including message counts and last activity.
async function handleInactivityReport(interaction) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return interaction.editReply("❌ You do not have permission to use this command.");
    }
  
    await interaction.editReply("📋 Generating inactivity report... this may take a minute.");
  
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  
    let inactiveUsers = await User.find({
      $or: [
        { lastMessageTimestamp: { $exists: false } },
        { lastMessageTimestamp: { $lte: threeMonthsAgo } },
      ],
    });
  
    inactiveUsers = (await Promise.all(
      inactiveUsers.map(async (user) => {
        try {
          await interaction.guild.members.fetch(user.discordId);
          return user;
        } catch {
          return null;
        }
      })
    )).filter(Boolean);
  
    const channelsToCheck = interaction.guild.channels.cache.filter(
      (channel) =>
        channel.isTextBased() &&
        channel.viewable &&
        channel.permissionsFor(interaction.client.user)?.has("ReadMessageHistory")
    );
  
    async function fetchLastMessage(user) {
      const results = await Promise.all(
        channelsToCheck.map(async (channel) => {
          try {
            const messages = await channel.messages.fetch({ limit: 100 });
            const userMessage = messages.find((msg) => msg.author.id === user.discordId);
            if (userMessage) {
              return { message: userMessage, channel };
            }
          } catch {}
          return null;
        })
      );
  
      const valid = results.filter(r => r !== null);
      if (valid.length > 0) {
        const best = valid.reduce((a, b) =>
          a.message.createdAt > b.message.createdAt ? a : b
        );
        user.lastMessageTimestamp = best.message.createdAt;
        user.lastMessageJump = `https://discord.com/channels/${interaction.guild.id}/${best.channel.id}/${best.message.id}`;
        await user.save();
      }
    }
  
    async function fetchMessageCount(user) {
      let total = 0;
      const threeMonthTimestamp = threeMonthsAgo.getTime();
  
      for (const channel of channelsToCheck.values()) {
        try {
          const messages = await channel.messages.fetch({ limit: 100 });
          messages.forEach((msg) => {
            if (
              msg.author.id === user.discordId &&
              msg.createdTimestamp > threeMonthTimestamp
            ) {
              total++;
            }
          });
        } catch {}
      }
  
      user.messageCount = total;
    }
  
    for (const user of inactiveUsers) {
      if (!user.lastMessageTimestamp || !user.lastMessageJump) {
        await fetchLastMessage(user);
      }
      await fetchMessageCount(user);
    }
  
    function formatDate(date) {
      const d = new Date(date);
      return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
    }
  
    const reportLines = inactiveUsers.map((user) => {
      const last = user.lastMessageTimestamp
        ? `[Jump to Message](${user.lastMessageJump}) on ${formatDate(user.lastMessageTimestamp)}`
        : "*Never Messaged*";
  
      const emoji =
        !user.lastMessageTimestamp ? "❌"
          : new Date(user.lastMessageTimestamp) > threeMonthsAgo ? "✅"
          : "⚠️";
  
      return `**Member:** <@${user.discordId}>\n**Status:** ${user.status || 'unknown'} ${emoji}\n**Last Message:** ${last}\n**Messages (3mo):** ${user.messageCount}`;
    });
  
    const chunks = splitMessage(reportLines.join('\n\n'), 2000);
    await interaction.editReply({ content: `📋 **Users inactive for 3+ months:**\n\n${chunks[0]}` });
    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp({ content: chunks[i], ephemeral: true });
    }
  
    function splitMessage(text, maxLength = 2000) {
      const lines = text.split("\n");
      const chunks = [];
      let chunk = "";
  
      for (const line of lines) {
        if (chunk.length + line.length + 1 > maxLength) {
          chunks.push(chunk);
          chunk = line;
        } else {
          chunk += "\n" + line;
        }
      }
      if (chunk.length) chunks.push(chunk);
      return chunks;
    }
  }
  
  // ------------------- Function: handleTable -------------------
// Loads a table from Google Sheets or rolls from a loaded table in the database.
async function handleTable(interaction) {
    const subcommandGroup = interaction.options.getSubcommand();
    const tableName = interaction.options.getString('tablename');
  
    if (!tableName) {
      return interaction.editReply('❌ Please provide a table name.');
    }
  
    try {
      if (subcommandGroup === 'load') {
        const success = await loadTable(tableName);
        if (success) {
          return interaction.editReply(`✅ **Successfully loaded table: ${tableName} into the database.**`);
        } else {
          return interaction.editReply(`❌ **Failed to load table: ${tableName}**`);
        }
      }
  
      if (subcommandGroup === 'roll') {
        const tableData = await fetchTableFromDatabase(tableName);
        if (!tableData) {
          return interaction.editReply(`❌ **No data found for table: ${tableName}**`);
        }
  
        const result = await rollItem(tableName);
        if (!result) {
          return interaction.editReply(`❌ **Failed to roll from table: ${tableName}**`);
        }
  
        const embed = new EmbedBuilder()
          .setColor('#0099ff')
          .setTitle(`🎲 Roll Result from ${tableName}`)
          .addFields(
            { name: 'Item', value: result.item || 'Unknown', inline: true },
            { name: 'Flavor Text', value: result.flavorText || 'No description', inline: false }
          )
          .setTimestamp();
  
        return interaction.editReply({ embeds: [embed] });
      }
  
      return interaction.editReply('❌ Invalid subcommand for /mod table.');
    } catch (err) {
      handleError(err, 'mod.js');
      console.error('[mod.js]: Error in table handler', err);
      return interaction.editReply('⚠️ An error occurred while processing the table command.');
    }
  }
  
  
// ============================================================================
// ------------------- Export Command -------------------
// ============================================================================

module.exports = {
  data: modCommand,
  execute
};
