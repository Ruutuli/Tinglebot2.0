// ------------------- Importing required modules -------------------
const { generateMount, randomInt } = require('../modules/mountGeneratorModule');  // Local module for mount generation and random integer
const MountModel = require('../models/MountModel');  // Mount model for database interaction
const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');  // Discord.js components for interaction and embeds
const fs = require('fs');  // File system module for reading and writing files
const path = require('path');  // Path module for handling file paths


// ------------------- Defining path for encounter data -------------------
const encounterFilePath = path.join(__dirname, '../data/encounter.json');

// ------------------- Defining mount emojis -------------------
const mountEmojis = {
  'Horse': '🐴', 'Donkey': '🐴', 'Ostrich': '🦤', 'Mountain Goat': '🐐', 'Deer': '🦌',
  'Bullbo': '🐂', 'Water Buffalo': '🐃', 'Wolfos': '🐺', 'Dodongo': '🐉', 'Moose': '🦣', 'Bear': '🐻'
};

// ------------------- Defining regional mount and village mappings -------------------
const regionalMounts = {
  'Ostrich': 'Rudania', 'Bullbo': 'Rudania', 'Dodongo': 'Rudania',
  'Mountain Goat': 'Inariko', 'Water Buffalo': 'Inariko', 'Moose': 'Inariko',
  'Deer': 'Vhintl', 'Wolfos': 'Vhintl', 'Bear': 'Vhintl'
};

// ------------------- Helper function to pick a random village -------------------
function getRandomVillage() {
  const villages = ['Vhintl', 'Inariko', 'Rudania'];
  return villages[randomInt(0, villages.length - 1)];
}

// ------------------- Slash Command Definition for Mount and Catch -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('mount')
    .setDescription('Trigger a random mount encounter or attempt to catch a mount')
    .addSubcommand(subcommand =>
      subcommand
        .setName('encounter')
        .setDescription('Trigger a random mount encounter')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('catch')
        .setDescription('Attempt to catch the wild mount')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('Name of your character attempting to catch the mount')
            .setRequired(true)
        )
        .addStringOption(option =>
          option.setName('encounterid')
            .setDescription('The ID of the current mount encounter')
            .setRequired(true)
        )
    ),

  // ------------------- Execute command based on subcommand -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'encounter') {
      await triggerMountEncounter(interaction);  // Trigger a mount encounter
    } else if (subcommand === 'catch') {
      await catchMount(interaction);  // Catch a mount
    } else if (interaction.isButton()) {
      // Handle button interaction here, specifically for the roll_rarity button
      if (interaction.customId.startsWith('roll_rarity')) {
        await handleRarityRoll(interaction);  // Call the rarity roll handler from buttonHandler.js
      }
    }
  }
};

// ------------------- Helper function to generate unique encounter ID -------------------
function generateEncounterId() {
  return Date.now().toString();  // Use timestamp to ensure unique ID
}

// ------------------- Function to handle mount encounter -------------------
async function triggerMountEncounter(interaction) {
  try {
    const encounterChannelId = '1245011883715461222';  // Replace with actual channel ID
    const encounterChannel = interaction.guild.channels.cache.get(encounterChannelId);

    // ------------------- Error handling for missing channel -------------------
    if (!encounterChannel) {
      await interaction.reply('❌ **Encounter channel not found.**');
      return;
    }

    // ------------------- Determine mount level and generate a mount -------------------
    const level = randomInt(1, 100) <= 60 ? 'Basic' : randomInt(1, 100) <= 90 ? 'Mid' : 'High';
    const mount = generateMount(level);

    // Generate a unique encounter ID
    const encounterId = generateEncounterId();
    
    // ------------------- Building encounter message -------------------
    let message = '';
    let village = '';
    const emoji = mountEmojis[mount.species] || '🐺';  // Use default emoji if not defined

    // ------------------- Message for regional mounts -------------------
    if (regionalMounts[mount.species]) {
      village = regionalMounts[mount.species];
      message = `
        There’s mention of a **${mount.species}** lurking in **${village}**!

        Use \`/mount catch charactername: encounterid:${encounterId}\` and the first to get a 20 is positioned to try and catch the mount!
        
        You will need Tokens for this game if you succeed!

        This mount can only be kept by people in **${village}**, and only those currently in **${village}** can participate!

        Please be polite and wait either for another person to roll before rolling again, or if it has been a full minute or so.
      `;
    } else {
      // ------------------- Message for global mounts (Horse/Donkey) -------------------
      village = getRandomVillage();
      message = `
        There’s mention of a **${mount.species}** lurking about **${village}**!

        Use \`/mount catch charactername: encounterid:${encounterId}\` and the first to get a 20 is positioned to try and catch the mount!
        
        You will need Tokens for this game if you succeed!

        This mount can be kept by people in **ALL VILLAGES** but only those currently in **${village}** can participate!

        Please be polite and wait either for another person to roll before rolling again, or if it has been a full minute or so.
      `;
    }

    // ------------------- Save the encounter to the encounter.json file -------------------
    const encounterData = {
      encounterId,
      species: mount.species,
      level: mount.level,
      stamina: mount.stamina,
      caught: false
    };

    fs.writeFileSync(encounterFilePath, JSON.stringify(encounterData, null, 2), 'utf-8');

    // ------------------- Build and send embed message -------------------
    const embed = new EmbedBuilder()
      .setTitle(`${emoji} **A Wild ${mount.species} Appears!**`)
      .setDescription(message)
      .addFields({ name: 'Stamina', value: `${mount.stamina}`, inline: true })
      .setFooter({ text: `Encounter ID: ${encounterId}` });

    await encounterChannel.send({ embeds: [embed] });
    await interaction.reply(`✅ **Mount encounter triggered! Encounter ID: \`${encounterId}\`**`);
  } catch (error) {
    // ------------------- Error handling for encounter generation -------------------
    await interaction.reply('❌ **An error occurred while trying to trigger the encounter.**');
  }
}

// ------------------- Function to handle catching the mount -------------------
async function catchMount(interaction) {
  try {
    console.log("Mount catch interaction triggered");
    const characterName = interaction.options.getString('charactername');
    const encounterId = interaction.options.getString('encounterid');
    const discordId = interaction.user.id;

    console.log(`Character Name: ${characterName}, Encounter ID: ${encounterId}, Discord ID: ${discordId}`);

    // ------------------- Load the encounter data -------------------
    if (!fs.existsSync(encounterFilePath)) {
      console.log("Encounter file not found");
      await interaction.reply('❌ **No wild mount available to catch!**');
      return;
    }

    const encounterData = JSON.parse(fs.readFileSync(encounterFilePath, 'utf-8'));

    // ------------------- Validate encounter ID and status -------------------
    if (encounterData.encounterId !== encounterId) {
      console.log("Invalid encounter ID");
      await interaction.reply('❌ **No active mount encounter found with that ID!**');
      return;
    }

    if (encounterData.caught) {
      console.log("Mount already caught");
      await interaction.reply('❌ **The wild mount has already been caught by someone else!**');
      return;
    }

    // ------------------- Set roll to 20 for testing purposes -------------------
    const roll = 20;  // Forces a 20 for testing

    if (roll === 20) {
      console.log("Roll successful, catching mount");
      encounterData.caught = true;
      fs.writeFileSync(encounterFilePath, JSON.stringify(encounterData, null, 2), 'utf-8');

      const newMount = new MountModel({
        discordId,  // Store discordId as a string
        characterId: characterName,  // Store characterId as a string
        species: encounterData.species,
        level: encounterData.level,
        stamina: encounterData.stamina,
        name: `${characterName}'s ${encounterData.species}`,
        traits: [],
        owner: characterName
      });

      await newMount.save();

      console.log("Mount caught and saved to database");

      // ------------------- Send success message with rarity roll button -------------------
      const successEmbed = new EmbedBuilder()
        .setDescription(`✅ **Success! ${characterName} has caught the wild ${encounterData.species}!**\nWhat kind of mount is it? Let's roll a 1d50 to find out!`);

      const rarityButton = new ButtonBuilder()
        .setCustomId(`roll_rarity|${characterName}|${encounterId}`)  // Use | for delimiter
        .setLabel('Roll 1d50 for Rarity')
        .setStyle(ButtonStyle.Primary);

      const actionRow = new ActionRowBuilder().addComponents(rarityButton);

      await interaction.reply({ embeds: [successEmbed], components: [actionRow] });
    } else {
      console.log(`Roll failed: ${roll}`);
      await interaction.reply(`❌ **${characterName} rolled a ${roll} and failed to catch the mount. Try again!**`);
    }
  } catch (error) {
    console.error("Error in catchMount:", error);
    await interaction.reply('❌ **An error occurred while trying to catch the mount.**');
  }
}
