// ------------------- Import necessary modules and classes -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } = require('discord.js');
const { getRandomColor } = require('../modules/formattingModule'); // Utility function to get random colors

module.exports = {
  // ------------------- Command data definition -------------------
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get a list of all commands and their descriptions'),

  // ------------------- Main execute function for providing help -------------------
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true }); // Defer reply to allow more time for processing

    const uniqueId = interaction.id; // Unique identifier for this interaction
    const gettingStartedEmbed = createGettingStartedEmbed(); // Embed for "Getting Started"
    const commandsEmbed = createCommandsEmbed(); // Embed for "Commands List"
    const buttonsRow = createButtonsRow(uniqueId); // Row of buttons for user interaction

    // Send initial reply with the Getting Started embed and buttons
    await interaction.editReply({ embeds: [gettingStartedEmbed], components: [buttonsRow] });

    // Create a button collector to handle button clicks
    const collector = interaction.channel.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 120000, // 2 minutes
    });

    // Handle button interactions
    collector.on('collect', async i => {
      if (!i.isButton()) return;
      if (i.customId !== `getting_started_${uniqueId}` && i.customId !== `commands_list_${uniqueId}`) return;

      try {
        // Use update() to switch between "Getting Started" and "Commands List" without creating a new reply
        if (i.customId === `getting_started_${uniqueId}`) {
          await i.update({ embeds: [gettingStartedEmbed], components: [buttonsRow] });
        } else if (i.customId === `commands_list_${uniqueId}`) {
          await i.update({ embeds: [commandsEmbed], components: [buttonsRow] });
        }
      } catch (error) {
        // Handle expired interactions
        if (error.code === 10062) {
          console.error('Interaction expired:', error.message);
        } else {
          console.error('Error updating interaction:', error);
        }
      }
    });

    // Handle end of collector (disable buttons when the interaction times out)
    collector.on('end', async () => {
      try {
        await disableButtons(interaction, uniqueId);
      } catch (error) {
        console.error('Error disabling buttons:', error);
      }
    });
  }
};

// ------------------- Create the Getting Started embed -------------------
function createGettingStartedEmbed() {
  const googleSheetsUrl = 'https://docs.google.com/spreadsheets/d/1pu6M0g7MRs5L2fkqoOrRNTKRmYB8d29j0EtDrQzw3zs/edit#gid=1571005582'; // Google Sheets example URL
  const characterName = 'Tingle'; // Example character name

  return new EmbedBuilder()
    .setColor(getRandomColor()) // Use random color for embed
    .setTitle('🚀 Getting Started')
    .setDescription('Here are the steps to create a character and start using the bot:')
    .addFields(
      { name: '1️⃣ Create a Character', value: 'Use the `/createcharacter name:<name>` command to create a new character.\n**Example:** `/createcharacter name:Tingle`' },
      { name: '2️⃣ Edit Character (if needed)', value: 'Use the `/editcharacter` command to edit your character.\n**Note:** Editing will delete the inventory, so avoid syncing until accurate.' },
      { name: '3️⃣ Prepare and Test Inventory', value: 'Set up your inventory sheet:\n- Create a tab named "loggedInventory".\n- Ensure headers in A1:M1 as:\n```Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync```\n- Share the sheet with this email: 📧 tinglebot@rotw-tinglebot.iam.gserviceaccount.com\nUse `/testinventorysetup` after setup.' },
      { name: '4️⃣ Exact Formatting', value: 'Items must match exactly as on the website. Reference [this sheet](https://docs.google.com/spreadsheets/d/1pAAmYQ6956WrG3EchGPLeOlP0_2P-DE9kZ0Huwk4IjE/edit?gid=347262666#gid=347262666).' },
      { name: '5️⃣ Sync Inventory', value: `Format items like:\n\`\`\`\nCharacter Name | Item Name\n\`\`\`\n**Example Inventory Sheet:** [Click here](${googleSheetsUrl})\nAfter testing, use \`/syncinventory\` to sync your items.` }
    )
    .setFooter({ text: 'If you have any questions, feel free to ask!' })
    .setTimestamp()
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'); // Footer image
}

// ------------------- Create the Commands List embed -------------------
function createCommandsEmbed() {
  return new EmbedBuilder()
    .setColor('#0099ff') // Use a fixed color for consistency
    .setTitle('📜 List of Commands')
    .addFields(
      { name: '🔹 /craft', value: '> Craft an item for your character, specifying the character name and item to craft.' },
      { name: '🔹 /createcharacter', value: '> Create a new character by providing a unique name.' },
      { name: '🔹 /deletecharacter', value: '> Delete an existing character. This action cannot be undone.' },
      { name: '🔹 /editcharacter', value: '> Edit a character\'s details, such as changing the name.' },
      { name: '🔹 /gather', value: '> Gather materials based on job and location.' },
      { name: '🔹 /gear', value: '> Manage your character\'s gear by equipping armor and weapons.' },
      { name: '🔹 /lookup', value: '> Lookup materials, armor, weapons, and recipes.' },
      { name: '🔹 /loot', value: '> Encounter monsters and loot items.' },
      { name: '🔹 /roll', value: '> Roll dice to generate a random number.' },
      { name: '🔹 /setbirthday', value: '> Set the birthday for your character.' },
      { name: '🔹 /syncinventory', value: '> Sync your character\'s inventory with the database.' },
      { name: '🔹 /testinventorysetup', value: '> Test the Google Sheet setup for inventory.' },
      { name: '🔹 /transfer', value: '> Transfer items between characters.' },
      { name: '🔹 /viewcharacter', value: '> View character details, such as stats and gear.' },
      { name: '🔹 /viewcharacterlist', value: '> View all characters owned by a user.' },
      { name: '🔹 /viewinventory', value: '> View the inventory of a character.' }
    )
    .setFooter({ text: 'If you have any questions, feel free to ask!' })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'); // Footer image
}

// ------------------- Create buttons for the help interaction -------------------
function createButtonsRow(uniqueId) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`getting_started_${uniqueId}`)
        .setLabel('Getting Started')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚀'),
      new ButtonBuilder()
        .setCustomId(`commands_list_${uniqueId}`)
        .setLabel('List of Commands')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜')
    );
}

// ------------------- Disable buttons after interaction ends -------------------
async function disableButtons(interaction, uniqueId) {
  const disabledRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`getting_started_${uniqueId}`)
        .setLabel('Getting Started')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🚀')
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`commands_list_${uniqueId}`)
        .setLabel('List of Commands')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜')
        .setDisabled(true)
    );

  await interaction.editReply({ components: [disabledRow] });
}
