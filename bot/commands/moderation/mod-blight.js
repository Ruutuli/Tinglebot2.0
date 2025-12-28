// ============================================================================
// ------------------- Imports -------------------
// Grouped and alphabetized within each section
// ============================================================================

// ------------------- Node.js Standard Libraries -------------------
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// ------------------- Discord.js Components -------------------
const {
  EmbedBuilder,
  PermissionsBitField,
  SlashCommandBuilder
} = require('discord.js');

// ------------------- Database Connections -------------------
const {
  connectToInventories,
  connectToTinglebot
} = require('../../../database/db');

// ------------------- Database Services -------------------
const {
  fetchCharacterByName,
  fetchAllCharacters
} = require('../../../database/db');

// ------------------- Utility Functions -------------------
const { handleInteractionError } = require('../../../utils/globalErrorHandler');

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

const modBlightCommand = new SlashCommandBuilder()
  .setName('mod-blight')
  .setDescription('🚨 Blight management utilities for moderators')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)

// ------------------- Subcommand: blightpause -------------------
.addSubcommand(sub =>
  sub
    .setName('pause')
    .setDescription('⏸️ Pause blight progression for a character')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the character to pause')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Reason for pausing blight progression')
        .setRequired(false)
    )
)

// ------------------- Subcommand: blightunpause -------------------
.addSubcommand(sub =>
  sub
    .setName('unpause')
    .setDescription('▶️ Unpause blight progression for a character')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the character to unpause')
        .setRequired(true)
        .setAutocomplete(true)
    )
)

// ------------------- Subcommand: blightstatus -------------------
.addSubcommand(sub =>
  sub
    .setName('status')
    .setDescription('📊 View detailed blight status for a character')
    .addStringOption(opt =>
      opt
        .setName('character')
        .setDescription('Name of the character to check')
        .setRequired(true)
        .setAutocomplete(true)
    )
)

// ------------------- Subcommand: blightoverride -------------------
.addSubcommand(sub =>
  sub
    .setName('override')
    .setDescription('🚨 Admin override for blight healing in emergencies')
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('The emergency action to perform')
        .setRequired(true)
        .addChoices(
          { name: 'Wipe All Blight', value: 'wipe_all' },
          { name: 'Wipe Village Blight', value: 'wipe_village' },
          { name: 'Wipe Character Blight', value: 'wipe_character' },
          { name: 'Set All Blight Level', value: 'set_all_level' },
          { name: 'Set Village Blight Level', value: 'set_village_level' },
          { name: 'Set Character Blight Level', value: 'set_character_level' }
        )
    )
    .addStringOption(option =>
      option
        .setName('target')
        .setDescription('Target for the action (village name, character name, or "all")')
        .setRequired(false)
    )
    .addIntegerOption(option =>
      option
        .setName('level')
        .setDescription('Blight level to set (0-5, only for set actions)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(5)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the emergency override')
        .setRequired(false)
    )
);

// ============================================================================
// ------------------- Execute Function -------------------
// ============================================================================

async function execute(interaction) {
  try {
    const subcommand = interaction.options.getSubcommand();
    
    switch (subcommand) {
      case 'pause':
        await handleBlightPause(interaction);
        break;
      case 'unpause':
        await handleBlightUnpause(interaction);
        break;
      case 'status':
        await handleBlightStatus(interaction);
        break;
      case 'override':
        await handleBlightOverride(interaction);
        break;
      default:
        await interaction.reply({
          content: '❌ Unknown subcommand.',
          ephemeral: true
        });
    }
  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod-blight.js',
      subcommand: interaction.options.getSubcommand()
    });
  }
}

// ============================================================================
// ------------------- Subcommand Handlers -------------------
// ============================================================================

async function handleBlightPause(interaction) {
  const charName = interaction.options.getString('character');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return await interaction.reply({
        content: `❌ Character "${charName}" not found.`,
        ephemeral: true
      });
    }

    // Check if character already has blight pause
    const pauseInfo = character.blightPause;
    if (pauseInfo && pauseInfo.isPaused) {
      const pauseDate = new Date(pauseInfo.pausedAt).toLocaleDateString();
      return await interaction.reply({
        content: `⚠️ Character "${charName}" is already paused since ${pauseDate}.`,
        ephemeral: true
      });
    }

    // Update character with blight pause
    await Character.findByIdAndUpdate(character._id, {
      $set: {
        blightPause: {
          isPaused: true,
          pausedAt: new Date(),
          pausedBy: interaction.user.id,
          reason: reason
        }
      }
    });

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('⏸️ Blight Progression Paused')
      .setDescription(`Blight progression has been paused for **${character.name}**`)
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '📝 Reason', value: reason, inline: true },
        { name: '👨‍💼 Moderator', value: interaction.user.tag, inline: true },
        { name: '💡 To Unpause', value: `Use \`/mod-blight unpause character:${character.name}\``, inline: false }
      )
      .setThumbnail(character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png')
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod-blight.js',
      subcommand: 'pause'
    });
  }
}

async function handleBlightUnpause(interaction) {
  const charName = interaction.options.getString('character');

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return await interaction.reply({
        content: `❌ Character "${charName}" not found.`,
        ephemeral: true
      });
    }

    // Check if character is actually paused
    const pauseInfo = character.blightPause;
    if (!pauseInfo || !pauseInfo.isPaused) {
      return await interaction.reply({
        content: `⚠️ Character "${charName}" is not currently paused.`,
        ephemeral: true
      });
    }

    // Update character to remove blight pause
    await Character.findByIdAndUpdate(character._id, {
      $unset: { blightPause: 1 }
    });

    const embed = new EmbedBuilder()
      .setColor('#51cf66')
      .setTitle('▶️ Blight Progression Resumed')
      .setDescription(`Blight progression has been resumed for **${character.name}**`)
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '👨‍💼 Moderator', value: interaction.user.tag, inline: true },
        { name: '⏱️ Previously Paused', value: `Since ${new Date(pauseInfo.pausedAt).toLocaleDateString()}`, inline: true },
        { name: '📝 Previous Reason', value: pauseInfo.reason || 'No reason provided', inline: false },
        { name: '💡 To Pause Again', value: `Use \`/mod-blight pause character:${character.name} reason:your_reason\``, inline: false }
      )
      .setThumbnail(character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png')
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod-blight.js',
      subcommand: 'unpause'
    });
  }
}

async function handleBlightStatus(interaction) {
  const charName = interaction.options.getString('character');

  try {
    const character = await fetchCharacterByName(charName);
    if (!character) {
      return await interaction.reply({
        content: `❌ Character "${charName}" not found.`,
        ephemeral: true
      });
    }

    const pauseInfo = character.blightPause;
    const embed = new EmbedBuilder()
      .setColor('#ffd43b')
      .setTitle('📊 Blight Status Report')
      .setDescription(`Blight status for **${character.name}**`)
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '🏘️ Village', value: character.village || 'Unknown', inline: true },
        { name: '👨‍💼 Checked by', value: interaction.user.tag, inline: true }
      )
      .setThumbnail(character.icon || 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png')
      .setTimestamp();

    if (pauseInfo && pauseInfo.isPaused) {
      const pauseDate = new Date(pauseInfo.pausedAt).toLocaleDateString();
      embed.addFields(
        { name: '⏸️ Status', value: '**PAUSED** - Blight progression is currently paused.', inline: false },
        { name: '📅 Paused Since', value: pauseDate, inline: true },
        { name: '👨‍💼 Paused by', value: `<@${pauseInfo.pausedBy}>`, inline: true },
        { name: '📝 Reason', value: pauseInfo.reason || 'No reason provided', inline: false },
        { name: '💡 To Unpause', value: `Use \`/mod-blight unpause character:${character.name}\``, inline: false }
      );
    } else {
      embed.addFields(
        { name: '▶️ Status', value: '**ACTIVE** - Blight progression is currently active.', inline: false },
        { name: '💡 To Pause', value: `Use \`/mod-blight pause character:${character.name} reason:your_reason\``, inline: false }
      );
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod-blight.js',
      subcommand: 'status'
    });
  }
}

async function handleBlightOverride(interaction) {
  const action = interaction.options.getString('action');
  const target = interaction.options.getString('target');
  const level = interaction.options.getInteger('level');
  const reason = interaction.options.getString('reason') || 'Emergency override';

  try {
    await interaction.deferReply({ ephemeral: true });

    let result = '';
    let affectedCount = 0;

    switch (action) {
      case 'wipe_all':
        // Wipe blight from all characters
        const allCharacters = await Character.find({ blight: { $exists: true } });
        await Character.updateMany({}, { $unset: { blight: 1, blightPause: 1 } });
        affectedCount = allCharacters.length;
        result = `Wiped blight from all ${affectedCount} characters`;
        break;

      case 'wipe_village':
        if (!target) {
          return await interaction.editReply({
            content: '❌ Target village name is required for wipe_village action.',
            ephemeral: true
          });
        }
        const villageCharacters = await Character.find({ 
          village: { $regex: new RegExp(`^${target}$`, 'i') },
          blight: { $exists: true }
        });
        await Character.updateMany(
          { village: { $regex: new RegExp(`^${target}$`, 'i') } },
          { $unset: { blight: 1, blightPause: 1 } }
        );
        affectedCount = villageCharacters.length;
        result = `Wiped blight from ${affectedCount} characters in ${target}`;
        break;

      case 'wipe_character':
        if (!target) {
          return await interaction.editReply({
            content: '❌ Target character name is required for wipe_character action.',
            ephemeral: true
          });
        }
        const character = await fetchCharacterByName(target);
        if (!character) {
          return await interaction.editReply({
            content: `❌ Character "${target}" not found.`,
            ephemeral: true
          });
        }
        await Character.findByIdAndUpdate(character._id, {
          $unset: { blight: 1, blightPause: 1 }
        });
        affectedCount = 1;
        result = `Wiped blight from character ${target}`;
        break;

      case 'set_all_level':
        if (level === null || level === undefined) {
          return await interaction.editReply({
            content: '❌ Level is required for set_all_level action.',
            ephemeral: true
          });
        }
        await Character.updateMany({}, {
          $set: { blight: { level: level, timestamp: new Date() } },
          $unset: { blightPause: 1 }
        });
        const allChars = await Character.countDocuments({});
        affectedCount = allChars;
        result = `Set blight level ${level} for all ${affectedCount} characters`;
        break;

      case 'set_village_level':
        if (!target) {
          return await interaction.editReply({
            content: '❌ Target village name is required for set_village_level action.',
            ephemeral: true
          });
        }
        if (level === null || level === undefined) {
          return await interaction.editReply({
            content: '❌ Level is required for set_village_level action.',
            ephemeral: true
          });
        }
        await Character.updateMany(
          { village: { $regex: new RegExp(`^${target}$`, 'i') } },
          {
            $set: { blight: { level: level, timestamp: new Date() } },
            $unset: { blightPause: 1 }
          }
        );
        const villageChars = await Character.countDocuments({ 
          village: { $regex: new RegExp(`^${target}$`, 'i') } 
        });
        affectedCount = villageChars;
        result = `Set blight level ${level} for ${affectedCount} characters in ${target}`;
        break;

      case 'set_character_level':
        if (!target) {
          return await interaction.editReply({
            content: '❌ Target character name is required for set_character_level action.',
            ephemeral: true
          });
        }
        if (level === null || level === undefined) {
          return await interaction.editReply({
            content: '❌ Level is required for set_character_level action.',
            ephemeral: true
          });
        }
        const targetChar = await fetchCharacterByName(target);
        if (!targetChar) {
          return await interaction.editReply({
            content: `❌ Character "${target}" not found.`,
            ephemeral: true
          });
        }
        await Character.findByIdAndUpdate(targetChar._id, {
          $set: { blight: { level: level, timestamp: new Date() } },
          $unset: { blightPause: 1 }
        });
        affectedCount = 1;
        result = `Set blight level ${level} for character ${target}`;
        break;

      default:
        return await interaction.editReply({
          content: '❌ Invalid action specified.',
          ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
      .setColor('#ff6b6b')
      .setTitle('🚨 Blight Emergency Override')
      .setDescription('**EMERGENCY BLIGHT OVERRIDE EXECUTED**')
      .addFields(
        { name: '⚡ Action', value: action.replace(/_/g, ' ').toUpperCase(), inline: true },
        { name: '🎯 Target', value: target || 'ALL', inline: true },
        { name: '📊 Level', value: level?.toString() || 'N/A', inline: true },
        { name: '📈 Affected Characters', value: affectedCount.toString(), inline: true },
        { name: '👨‍💼 Executed by', value: interaction.user.tag, inline: true },
        { name: '📝 Reason', value: reason, inline: false },
        { name: '✅ Result', value: result, inline: false }
      )
      .setTimestamp();

    await interaction.editReply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (error) {
    await handleInteractionError(error, interaction, {
      source: 'mod-blight.js',
      subcommand: 'override'
    });
  }
}

// ============================================================================
// ------------------- Export Command -------------------
// ============================================================================

module.exports = {
  data: modBlightCommand,
  execute
};
