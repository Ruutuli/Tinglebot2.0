// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Models -------------------
const Character = require('../models/CharacterModel');

// ------------------- Services -------------------
const { getCharacterInventoryCollection } = require('../database/characterService');

// ------------------- Modules -------------------
const { exchangeSpiritOrbs } = require('../modules/characterStatsModule');

// ------------------- Add Google Sheets Logging -------------------
const { authorizeSheets, appendSheetData, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');

// ------------------- Slash Command Definition -------------------
const data = new SlashCommandBuilder()
  .setName('spiritorbs')
  .setDescription('Check or exchange Spirit Orbs for health or stamina upgrades')
  .addSubcommand(subcommand =>
    subcommand
      .setName('check')
      .setDescription('Check how many Spirit Orbs your character has')
      .addStringOption(option =>
        option.setName('character')
          .setDescription('Your character name')
          .setRequired(true)
          .setAutocomplete(true)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('exchange')
      .setDescription('Exchange 4 Spirit Orbs for +1 heart or stamina')
      .addStringOption(option =>
        option.setName('character')
          .setDescription('Your character name')
          .setRequired(true)
          .setAutocomplete(true)
      )
      .addStringOption(option =>
        option.setName('type')
          .setDescription('Choose to upgrade hearts or stamina')
          .setRequired(true)
          .addChoices(
            { name: 'Hearts ❤️', value: 'hearts' },
            { name: 'Stamina 🟩', value: 'stamina' }
          )
      )
  );

// ------------------- Command Execution Handler -------------------
async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const characterName = interaction.options.getString('character');
  const userId = interaction.user.id;

  try {
    // ------------------- Validate Character -------------------
    const character = await Character.findOne({ userId, name: characterName });
    if (!character) {
      return await interaction.reply({
        content: `❌ Character **${characterName}** not found.`,
        ephemeral: true
      });
    }

    // ------------------- Load Inventory Collection -------------------
    const inventoryCollection = await getCharacterInventoryCollection(character.name);

    // ------------------- Subcommand: Check -------------------
    if (subcommand === 'check') {
      const spiritOrb = await inventoryCollection.findOne({
        characterId: character._id,
        itemName: { $regex: /^spirit orb$/i }
      });

      const orbCount = spiritOrb?.quantity || 0;

      return await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#AA926A')
            .setTitle(`<:spiritorb:1171310851748270121> Spirit Orb Check`)
            .setDescription(`✨ **[${character.name}](${character.inventory})** currently has **${orbCount} Spirit Orb(s)** in their inventory.`)
            .setThumbnail('https://static.wixstatic.com/media/7573f4_ec0778984faf4b5e996a5e849fab2165~mv2.png')
        ],
        ephemeral: true
      });
    }

    // ------------------- Subcommand: Exchange -------------------
    if (subcommand === 'exchange') {
      const type = interaction.options.getString('type');

      const spiritOrb = await inventoryCollection.findOne({
        characterId: character._id,
        itemName: { $regex: /^spirit orb$/i }
      });

      const orbCount = spiritOrb?.quantity || 0;

      if (orbCount < 4) {
        return await interaction.reply({
          content: `❌ **${character.name}** only has **${orbCount} Spirit Orb(s)** in their inventory. You need at least **4** to exchange.`,
          ephemeral: true
        });
      }

      // Capture original stats before exchange
      const oldValue = type === 'hearts'
        ? `${character.currentHearts}/${character.maxHearts}`
        : `${character.currentStamina}/${character.maxStamina}`;

      // Perform stat upgrade and inventory update
      const updatedCharacter = await exchangeSpiritOrbs(character._id, type);

      // Capture new stats after exchange
      const newValue = type === 'hearts'
        ? `${updatedCharacter.currentHearts}/${updatedCharacter.maxHearts}`
        : `${updatedCharacter.currentStamina}/${updatedCharacter.maxStamina}`;

      // ------------------- Flavor Text Options -------------------
      const flavorOptions = [
        'A soft wind rustles the trees as the Goddess Statue pulses with light.',
        'A serene glow surrounds the area as your offering is accepted.',
        'You hear a distant chime as your prayer is answered.',
        'The ground hums beneath you, resonating with power.',
        'The statue’s eyes briefly glow, acknowledging your sacrifice.'
      ];
      const chosenFlavor = flavorOptions[Math.floor(Math.random() * flavorOptions.length)];

        // ------------------- Build Exchange Embed -------------------
        const embed = new EmbedBuilder()
        .setAuthor({ name: `${character.name} - Spirit Orb Exchange`, iconURL: character.icon })
        .setColor('#AA926A')
        .setThumbnail('https://static.wixstatic.com/media/7573f4_ec0778984faf4b5e996a5e849fab2165~mv2.png')
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setDescription(`💫 **[${character.name}](${character.inventory})** offers 4 <:spiritorb:1171310851748270121> Spirit Orbs to the Goddess Statue.\n\n${chosenFlavor}`)

        // ------------------- Visual Meter Display -------------------
let meter = '';
try {
  if (type === 'hearts') {
    const maxHearts = Number(updatedCharacter.maxHearts ?? 1);
    if (isNaN(maxHearts) || maxHearts <= 0) throw new Error('Invalid maxHearts');
    meter = `${'❤️'.repeat(Math.max(0, maxHearts - 1))}💖`;
  } else if (type === 'stamina') {
    const maxStamina = Number(updatedCharacter.maxStamina ?? 1);
    if (isNaN(maxStamina) || maxStamina <= 0) throw new Error('Invalid maxStamina');
    meter = `${'🟩'.repeat(Math.max(0, maxStamina - 1))}✅`;
  }
} catch (err) {
    handleError(err, 'spiritOrb.js');

  console.error(`[spiritOrb.js]: Failed to build meter display: ${err.message}`);
  meter = '*Unable to display meter.*';
}

// ------------------- Field Construction -------------------
const fieldValue = `+1 **${type.charAt(0).toUpperCase() + type.slice(1)}**\n` +
                   `\`${oldValue} → ${newValue}\` (Fully recovered!)\n\n${meter}`;

// Temporary logging for debugging
console.log('[spiritOrb.js]: Final embed field content:', fieldValue);

// ------------------- Fetch updated Spirit Orb count -------------------
const updatedOrb = await inventoryCollection.findOne({
    characterId: character._id,
    itemName: { $regex: /^spirit orb$/i }
  });
  const remainingOrbs = updatedOrb?.quantity || 0;
  
  // ------------------- Add Fields to Embed -------------------
  embed.addFields([
    {
      name: '🔁 __Exchange Result__',
      value: String(
        `> +1 **${type.charAt(0).toUpperCase() + type.slice(1)}**\n` +
        `> \` ${oldValue} → ${newValue}\` (Fully recovered!)\n\n${meter}`
      ),
      inline: false
    },
    
    {
        name: '<:spiritorb:1171310851748270121> __Spirit Orbs__',
        value: `> ${orbCount} → ${remainingOrbs} (used 4)`,
        inline: true
      }
      
  ]);

  // Validate inventory link before logging
const inventoryLink = character.inventory || character.inventoryLink;
if (!inventoryLink || !isValidGoogleSheetsUrl(inventoryLink)) {
  console.warn(`[spiritOrb.js]: Invalid or missing Google Sheets URL for character ${character.name}`);
} else {
  try {
    const spreadsheetId = extractSpreadsheetId(inventoryLink);
    const auth = await authorizeSheets();
    const range = 'loggedInventory!A2:M';
    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
    const uniqueSyncId = uuidv4();

    const sheetRow = [
      character.name,                          // Character Name
      'Spirit Orb',                            // Item Name
      '-4',                                    // Quantity
      'Material',                              // Category
      'Special',                               // Type
      '',                                      // Subtype
      `Stat Upgrade (${type})`,                // How it was used
      character.job || '',                     // Character Job
      '',                                      // Perk
      character.currentVillage || '',          // Location
      interactionUrl,                          // Link to the Discord interaction
      formattedDateTime,                       // Date & Time
      uniqueSyncId                             // Unique ID
    ];

    await appendSheetData(auth, spreadsheetId, range, [sheetRow]);
  } catch (err) {
    handleError(err, 'spiritOrb.js');

    console.error(`[spiritOrb.js]: Failed to log Spirit Orb exchange to sheet: ${err.message}`);
  }
}

        // ------------------- Send Embed -------------------
        return await interaction.reply({ embeds: [embed], ephemeral: false });

    }

  } catch (error) {
    handleError(error, 'spiritOrb.js');

    console.error(`[spiritOrb.js]: Error handling /spiritorbs command: ${error.stack}`);
    return await interaction.reply({
      content: `⚠️ An unexpected error occurred while processing your request.`,
      ephemeral: true
    });
  }
}

// ------------------- Export Command -------------------
module.exports = {
  data,
  execute
};
