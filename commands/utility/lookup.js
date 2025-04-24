// ------------------- Import necessary modules and functions -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler.js');
const { connectToTinglebot, getIngredientItems, getCharacterInventoryCollection} = require('../../database/db.js');
const ItemModel = require('../../models/ItemModel.js');
const Character = require('../../models/CharacterModel.js');
const { handleAutocomplete } = require('../../handlers/autocompleteHandler.js');
const { getCategoryColor } = require('../../modules/formattingModule.js');
const { formatItemDetails } = require('../../embeds/embeds.js');

// ------------------- Constants -------------------
const ITEMS_PER_PAGE = 25;
const DEFAULT_EMOJI = '🔹';

module.exports = {
  // ------------------- Slash Command Definition -------------------
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up details of a specific item or ingredient')
    .addStringOption(option =>
      option.setName('item')
        .setDescription('The name of the item to look up')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('ingredient')
        .setDescription('The name of the ingredient to look up')
        .setAutocomplete(true)
        .setRequired(false)
    ),

  // ------------------- Main execute function for lookup -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
      await connectToTinglebot();
  
      const itemName = interaction.options.getString('item');
      const ingredientName = interaction.options.getString('ingredient');
  
      if (itemName) {
        await handleItemLookup(interaction, itemName);
      } else if (ingredientName) {
        await handleIngredientLookup(interaction, ingredientName);
      } else {
        return interaction.editReply({ content: '❌ Please provide either an item or ingredient to look up.', ephemeral: true });
      }
    } catch (error) {
    handleError(error, 'lookup.js');

      console.error("❌ Error in lookup command:", error);  // Log detailed error
      return interaction.editReply({ content: '❌ There was an error while executing this command!', ephemeral: true });
    }
  
  },

  // ------------------- Autocomplete function for lookup -------------------
  async autocomplete(interaction) {
    await handleAutocomplete(interaction, { keepAlive: true });
  }
};

// ------------------- Handle item lookup -------------------
async function handleItemLookup(interaction, itemName) {
  const item = await ItemModel.findOne({ itemName }).exec();
  if (!item) {
      return interaction.editReply({ content: '❌ No item found with this name.', ephemeral: true });
  }


  // Prepare image and emoji
  let imageUrl = item.image && item.image.startsWith('wix:image://')
    ? item.image.replace('wix:image://v1/', 'https://static.wixstatic.com/media/').replace(/~mv2.*$/, '')
    : item.image || 'No Image';
  const emoji = item.emoji || '🔹';


  // Format crafting materials
  const craftingMaterials = await Promise.all((item.craftingMaterial || []).map(async (material) => {
    if (!material._id) {
      return formatItemDetails(material.itemName, material.quantity, emoji);
    } else {
      const materialItem = await ItemModel.findById(material._id).select('itemName emoji');
      return formatItemDetails(materialItem.itemName, material.quantity, materialItem.emoji || '✂️');
    }
  }));
  const craftingMaterialText = craftingMaterials.filter(mat => mat !== null).map(mat => `> ${mat}`).join('\n');

// Handle item properties such as category, source, job, and locations
const sourceText = item.obtain?.length > 0 ? item.obtain : item.obtainTags || [];
const jobText = item.allJobs?.length > 0 ? item.allJobs : ['None']; // No need to split

const locationsFormatted = (item.locationsTags || []).join(', ');

const sourceFormatted = sourceText.map(source => `${source}`).join('\n');
const jobFormatted = jobText.join('\n'); // Join array elements with a newline

  // Create item embed
  const embed = new EmbedBuilder()
    .setColor(getCategoryColor(item.category))
    .setAuthor({ name: `${item.itemName}`, iconURL: item.imageType })
    .setDescription(`**__✨ Category:__** ${item.category.join(', ') || 'None'}
    **__✨ Type:__** ${item.type.join(', ') || 'None'}
    **__✨ Subtype:__** ${item.subtype.join(', ') || 'None'}
    **__🪙 Buy Price:__** ${item.buyPrice || 'N/A'}
    **__🪙 Sell Price:__** ${item.sellPrice || 'N/A'}
    **__🟩 Stamina to Craft:__** ${item.staminaToCraft?.toString() || 'N/A'}
    **__❤️ Modifier/Hearts:__** ${item.modifierHearts?.toString() || 'N/A'}
    **__💚 Stamina Recovered:__** ${item.staminaRecovered?.toString() || 'N/A'}`)
    .setThumbnail(imageUrl !== 'No Image' ? imageUrl : null)
    .setFooter({ text: `Locations: ${locationsFormatted}` })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .addFields(
      { name: '🔍 **__Job:__**', value: `>>> ${jobFormatted}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true }, // Empty field for better formatting
      { name: '🛠️ **__Source:__**', value: `>>> ${sourceFormatted}`, inline: true }
    );

  // Add crafting materials if available
  if (item.craftingMaterial && item.craftingMaterial.length > 0) {
    const filteredCraftingMaterials = item.craftingMaterial.filter(mat => !['#Raw Material', '#Not Craftable'].includes(mat.itemName));
    if (filteredCraftingMaterials.length > 0) {
      embed.addFields({ name: '✂️ **__Crafting Materials:__**', value: craftingMaterialText, inline: false });
    }
  }

  // Get characters that have this item and format their details
  const charactersWithItem = await fetchCharactersWithItem(itemName);
  const charactersFormatted = charactersWithItem.length > 0
    ? charactersWithItem.map(char => formatItemDetails(char.name, char.quantity, emoji)).join('\n')
    : 'None';

  const charactersEmbed = new EmbedBuilder()
    .setColor(getCategoryColor(item.category))
    .setTitle('Characters that have this item')
    .setDescription(charactersFormatted)
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

  await interaction.editReply({ embeds: [embed, charactersEmbed], ephemeral: true });
}



// ------------------- Handle ingredient lookup -------------------
async function handleIngredientLookup(interaction, ingredientName) {
  const craftableItems = await getIngredientItems(ingredientName);

  if (craftableItems.length === 0) {
    return interaction.editReply({ content: `❌ No craftable items found using ${ingredientName}.`, ephemeral: true });
  }

 // Pagination logic for displaying craftable items
 let currentPage = 0;
 const totalPages = Math.ceil(craftableItems.length / ITEMS_PER_PAGE);

 const generateEmbed = async (page) => {
  const start = page * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const itemsToDisplay = craftableItems.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle(`Items that can be crafted using ${ingredientName}`)
    .setColor('#A48D68')
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

  let totalEmbedLength = 0;

  for (const item of itemsToDisplay) {
    const requirements = await Promise.all(item.craftingMaterial.map(async (mat) => {
      const materialItem = await ItemModel.findOne({ itemName: mat.itemName }).select('emoji');
      const emoji = materialItem?.emoji || DEFAULT_EMOJI;
      return formatItemDetails(mat.itemName, mat.quantity, emoji);
    }));

    const requirementsText = `**Requires:**\n>>> ${requirements.join('\n')}`;
    const fieldLength = item.name.length + requirementsText.length;

    if (totalEmbedLength + fieldLength > 5800) {  // Leave a margin below 6000
      break;
    }

    embed.addFields({ name: item.name, value: requirementsText });
    totalEmbedLength += fieldLength;
  }

  return embed.setFooter({ text: `Page ${page + 1} of ${totalPages}` });
};

 const generatePaginationRow = () => new ActionRowBuilder().addComponents(
   new ButtonBuilder()
     .setCustomId('prev')
     .setLabel('Previous')
     .setStyle(ButtonStyle.Primary)
     .setDisabled(currentPage === 0),
   new ButtonBuilder()
     .setCustomId('next')
     .setLabel('Next')
     .setStyle(ButtonStyle.Primary)
     .setDisabled(currentPage === totalPages - 1)
 );

 const message = await interaction.editReply({
   embeds: [await generateEmbed(currentPage)],
   components: [generatePaginationRow()],
 });

 const collector = message.createMessageComponentCollector({ time: 600000 }); // 10 minutes

 collector.on('collect', async i => {
   if (i.user.id !== interaction.user.id) {
     await i.reply({ content: '❌ **You cannot use these buttons.**', ephemeral: true });
     return;
   }

   if (i.customId === 'prev') {
     currentPage--;
   } else if (i.customId === 'next') {
     currentPage++;
   }

   await i.update({
     embeds: [await generateEmbed(currentPage)],
     components: [generatePaginationRow()],
   });
 });

 collector.on('end', async () => {
   try {
     await interaction.editReply({ components: [] });
   } catch (error) {
    handleError(error, 'lookup.js');

     // Error handling if needed
   }
 });
}

// ------------------- Fetch characters with a specific item -------------------
async function fetchCharactersWithItem(itemName) {
  const characters = await Character.find().lean().exec();
  const charactersWithItem = [];

  for (const char of characters) {
    const inventoryCollection = await getCharacterInventoryCollection(char.name);
    const inventory = await inventoryCollection.find().toArray();

    const itemEntry = inventory.find(item => item.itemName === itemName);
    if (itemEntry) {
      charactersWithItem.push({ name: char.name, quantity: itemEntry.quantity });
    }
  }

  return charactersWithItem;
}
