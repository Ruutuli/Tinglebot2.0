// ------------------- Import necessary modules and functions -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler.js');
const { connectToTinglebot, getIngredientItems, getCharacterInventoryCollection, fetchCharacterByNameAndUserId } = require('../../database/db.js');
const { escapeRegExp } = require('../../utils/inventoryUtils.js');
const ItemModel = require('../../models/ItemModel.js');
const Character = require('../../models/CharacterModel.js');
const { handleAutocomplete } = require('../../handlers/autocompleteHandler.js');
const { getCategoryColor } = require('../../modules/formattingModule.js');
const { formatItemDetails } = require('../../embeds/embeds.js');
const generalCategories = require('../../models/GeneralItemCategories.js');

// ------------------- Constants -------------------
const ITEMS_PER_PAGE = 25;
const DEFAULT_EMOJI = '🔹';

module.exports = {
  // ------------------- Slash Command Definition -------------------
  data: new SlashCommandBuilder()
    .setName('lookup')
    .setDescription('Look up details of a specific item or ingredient')
    .addSubcommand(subcommand =>
      subcommand
        .setName('item')
        .setDescription('Look up details of a specific item')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('The name of the item to look up')
            .setAutocomplete(true)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('ingredient')
        .setDescription('Find items that can be crafted using an ingredient')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('The name of the ingredient to look up')
            .setAutocomplete(true)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('crafting')
        .setDescription('Check what items a character can currently craft')
        .addStringOption(option =>
          option.setName('charactername')
            .setDescription('The name of the character to check')
            .setAutocomplete(true)
            .setRequired(true)
        )
    ),

  // ------------------- Main execute function for lookup -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply({ flags: 64 });
      await connectToTinglebot();
  
      const subcommand = interaction.options.getSubcommand();
  
      if (subcommand === 'item') {
        const itemName = interaction.options.getString('name');
        await handleItemLookup(interaction, itemName);
      } else if (subcommand === 'ingredient') {
        const ingredientName = interaction.options.getString('name');
        await handleIngredientLookup(interaction, ingredientName);
      } else if (subcommand === 'crafting') {
        const characterName = interaction.options.getString('charactername');
        await handleCraftingLookup(interaction, characterName);
      }
    } catch (error) {
      handleError(error, 'lookup.js', {
        commandName: 'lookup',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        subcommand: interaction.options.getSubcommand()
      });

      console.error("❌ Error in lookup command:", error);
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
  // Escape special regex characters to prevent regex syntax errors
  const escapedItemName = escapeRegExp(itemName);
  
  const item = await ItemModel.findOne({ 
    itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") }
  }).exec();
  
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
      
      // Add null check and fallback to direct material info
      if (!materialItem) {
        return formatItemDetails(material.itemName, material.quantity, emoji);
      }
      
      return formatItemDetails(materialItem.itemName, material.quantity, materialItem.emoji || '✂️');
    }
  }));
  const craftingMaterialText = craftingMaterials.filter(mat => mat !== null).map(mat => `> ${mat}`).join('\n');

  // Handle item properties such as category, source, job, and locations
  const sourceText = item.obtain?.length > 0 ? item.obtain : item.obtainTags || [];
  const jobText = item.allJobs?.length > 0 ? item.allJobs : ['None'];
  const locationsFormatted = (item.locationsTags || []).join(', ');
  const sourceFormatted = sourceText.map(source => `${source}`).join('\n');
  const jobFormatted = jobText.join('\n');

  // Create item embed
  let modifierHeartsLine = '';
  let staminaToCraftLine = '';
  let staminaRecoveredLine = '';
  const isMaterial = Array.isArray(item.category)
    ? item.category.includes('Material')
    : item.category === 'Material';
  if (!isMaterial) {
    modifierHeartsLine = `**__❤️ Modifier/Hearts:__** ${item.modifierHearts?.toString() || 'N/A'}\n`;
    staminaToCraftLine = `**__🟩 Stamina to Craft:__** ${item.staminaToCraft?.toString() || 'N/A'}\n`;
    staminaRecoveredLine = `**__💚 Stamina Recovered:__** ${item.staminaRecovered?.toString() || 'N/A'}`;
  }

  // Build description string with proper formatting
  const description = [
    `**__✨ Category:__** ${Array.isArray(item.category) ? item.category.join(', ') : item.category || 'None'}`,
    `**__✨ Type:__** ${Array.isArray(item.type) ? item.type.join(', ') : item.type || 'None'}`,
    `**__✨ Subtype:__** ${Array.isArray(item.subtype) ? item.subtype.join(', ') : item.subtype || 'None'}`,
    `**__🪙 Buy Price:__** ${item.buyPrice || 'N/A'}`,
    `**__🪙 Sell Price:__** ${item.sellPrice || 'N/A'}`,
    staminaToCraftLine,
    modifierHeartsLine,
    staminaRecoveredLine
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(getCategoryColor(item.category))
    .setAuthor({ 
      name: `${item.itemName}`, 
      ...(item.imageType ? { iconURL: item.imageType } : {})
    })
    .setDescription(description)
    .setThumbnail(imageUrl !== 'No Image' ? imageUrl : null)
    .setFooter({ text: `Locations: ${locationsFormatted}` })
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
    .addFields(
      { name: '🔍 **__Job:__**', value: `>>> ${jobFormatted}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
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
  
  // Send the main item embed first
  await interaction.editReply({ embeds: [embed] });

  // If there are characters with the item, create paginated embeds for them
  if (charactersWithItem.length > 0) {
    let currentPage = 0;
    const totalPages = Math.ceil(charactersWithItem.length / ITEMS_PER_PAGE);

    const generateCharactersEmbed = (page) => {
      const start = page * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const charactersToDisplay = charactersWithItem.slice(start, end);
      
      const charactersFormatted = charactersToDisplay
        .map(char => formatItemDetails(char.name, char.quantity, emoji))
        .join('\n');

      return new EmbedBuilder()
        .setColor(getCategoryColor(item.category))
        .setTitle(`Characters that have ${item.itemName}`)
        .setDescription(charactersFormatted)
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: `Page ${page + 1} of ${totalPages}` });
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

    const message = await interaction.followUp({
      embeds: [generateCharactersEmbed(currentPage)],
      components: [generatePaginationRow()],
      ephemeral: true
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
        embeds: [generateCharactersEmbed(currentPage)],
        components: [generatePaginationRow()],
      });
    });

    collector.on('end', async () => {
      try {
        await interaction.editReply({ components: [] });
      } catch (error) {
        handleError(error, 'lookup.js');
      }
    });
  } else {
    // If no characters have the item, send a simple message
    await interaction.followUp({ content: 'No characters currently have this item.', ephemeral: true });
  }
}

// ------------------- Handle ingredient lookup -------------------
async function handleIngredientLookup(interaction, ingredientName) {
  const craftableItems = await getIngredientItems(ingredientName.toLowerCase());

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

// ------------------- Handle crafting lookup -------------------
async function handleCraftingLookup(interaction, characterName) {
  try {
    // Get the user ID from the interaction
    const userId = interaction.user.id;
    
    // Fetch character by name and user ID
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    if (!character) {
      return interaction.editReply({ 
        content: `❌ Character "${characterName}" not found or does not belong to you.`, 
        ephemeral: true 
      });
    }

    // Get character's inventory
    const inventoryCollection = await getCharacterInventoryCollection(character.name);
    const inventory = await inventoryCollection.find().toArray();

         // Get all craftable items from the database
     const allCraftableItems = await ItemModel.find({
       crafting: true,
       craftingMaterial: { $exists: true, $ne: [] }
     }).select('itemName craftingMaterial emoji category staminaToCraft allJobs').lean();

    // Check which items the character can currently craft
    const craftableItems = [];
    
    for (const item of allCraftableItems) {
      let canCraft = true;
      const missingMaterials = [];
      
      // Check each required material
      for (const material of item.craftingMaterial) {
        const requiredQty = material.quantity;
        let ownedQty = 0;

        if (generalCategories[material.itemName]) {
          // Check category items (like "Any Fish", "Any Fruit", etc.)
          ownedQty = inventory.filter(invItem => 
            generalCategories[material.itemName].includes(invItem.itemName)
          ).reduce((sum, inv) => sum + inv.quantity, 0);
        } else {
          // Check specific item
          ownedQty = inventory.filter(invItem => 
            invItem.itemName.toLowerCase() === material.itemName.toLowerCase()
          ).reduce((sum, inv) => sum + inv.quantity, 0);
        }

        if (ownedQty < requiredQty) {
          canCraft = false;
          missingMaterials.push(`${material.itemName} (Required: ${requiredQty}, Owned: ${ownedQty})`);
        }
      }

             if (canCraft) {
         craftableItems.push({
           name: item.itemName,
           emoji: item.emoji || DEFAULT_EMOJI,
           category: item.category,
           staminaToCraft: item.staminaToCraft,
           allJobs: item.allJobs,
           materials: item.craftingMaterial
         });
       }
    }

    if (craftableItems.length === 0) {
      return interaction.editReply({ 
        content: `❌ **${character.name}** cannot currently craft any items.\n\nCheck your inventory for materials or gather more resources!`, 
        ephemeral: true 
      });
    }

    // Sort craftable items by category and name
    craftableItems.sort((a, b) => {
      const categoryA = Array.isArray(a.category) ? a.category[0] : a.category;
      const categoryB = Array.isArray(b.category) ? b.category[0] : b.category;
      if (categoryA !== categoryB) {
        return categoryA.localeCompare(categoryB);
      }
      return a.name.localeCompare(b.name);
    });

    // Pagination logic for displaying craftable items
    let currentPage = 0;
    const totalPages = Math.ceil(craftableItems.length / ITEMS_PER_PAGE);

    const generateEmbed = (page) => {
      const start = page * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const itemsToDisplay = craftableItems.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle(`🛠️ Currently Craftable Items for ${character.name}`)
        .setDescription(`Found **${craftableItems.length}** items you can craft right now!`)
        .setColor('#A48D68')
        .setThumbnail(character.icon || null)
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

             for (const item of itemsToDisplay) {
         const categoryText = Array.isArray(item.category) ? item.category.join(', ') : item.category;
         const staminaText = item.staminaToCraft ? `> Stamina to Craft: ${item.staminaToCraft}` : '';
         const jobText = item.allJobs && item.allJobs.length > 0 ? `> Job: ${item.allJobs.join(', ')}` : '';
         
         const materialsText = item.materials.map(mat => {
           const emoji = mat.emoji || DEFAULT_EMOJI;
           return `> ${emoji} ${mat.itemName} x${mat.quantity}`;
         }).join('\n');

         embed.addFields({
           name: `__${item.emoji} ${item.name}__`,
           value: `> Category: ${categoryText}\n${staminaText}\n${jobText}\n__Materials:__\n${materialsText}`,
           inline: false
         });
       }

      return embed.setFooter({ text: `Page ${page + 1} of ${totalPages} • Total craftable: ${craftableItems.length}` });
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
      embeds: [generateEmbed(currentPage)],
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
        embeds: [generateEmbed(currentPage)],
        components: [generatePaginationRow()],
      });
    });

    collector.on('end', async () => {
      try {
        await message.edit({ components: [] });
      } catch (error) {
        handleError(error, 'lookup.js', {
          commandName: 'craftingLookup',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: character.name
        });
      }
    });

  } catch (error) {
    handleError(error, 'lookup.js', {
      commandName: 'craftingLookup',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: characterName
    });
    
    console.error(`[lookup.js]: Crafting lookup failed:`, error);
    
    await interaction.editReply({ 
      content: '❌ There was an error while checking craftable items. Please try again later.', 
      ephemeral: true 
    });
  }
}

// ------------------- Fetch characters with a specific item -------------------
async function fetchCharactersWithItem(itemName) {
  const characters = await Character.find().lean().exec();
  const charactersWithItem = [];

  for (const char of characters) {
    const inventoryCollection = await getCharacterInventoryCollection(char.name);
    const inventory = await inventoryCollection.find().toArray();

    const itemEntry = inventory.find(item => 
      item.itemName.toLowerCase() === itemName.toLowerCase()
    );
    if (itemEntry) {
      charactersWithItem.push({ name: char.name, quantity: itemEntry.quantity });
    }
  }

  return charactersWithItem;
}
