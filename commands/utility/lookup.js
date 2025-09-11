// ------------------- Import necessary modules and functions -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { handleInteractionError } = require('../../utils/globalErrorHandler.js');
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
      await handleInteractionError(error, interaction, {
        source: 'lookup.js',
        subcommand: interaction.options.getSubcommand()
      });
    }
  },

  // ------------------- Autocomplete function for lookup -------------------
  async autocomplete(interaction) {
    await handleAutocomplete(interaction, { keepAlive: true });
  }
};

// ------------------- Handle item lookup -------------------
async function handleItemLookup(interaction, itemName) {
  
  let item;
  if (itemName.includes('+')) {
    item = await ItemModel.findOne({ 
      itemName: itemName
    }).exec();
  } else {
    const escapedItemName = escapeRegExp(itemName);
    item = await ItemModel.findOne({ 
      itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") }
    }).exec();
  }
  
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
    if (!material || !material.itemName) {
      return 'Unknown material';
    }
    
    if (!material._id) {
      return formatItemDetails(String(material.itemName), Number(material.quantity) || 0, String(emoji));
    } else {
      const materialItem = await ItemModel.findById(material._id).select('itemName emoji');
      
      if (!materialItem) {
        return formatItemDetails(String(material.itemName), Number(material.quantity) || 0, String(emoji));
      }
      
      return formatItemDetails(String(materialItem.itemName), Number(material.quantity) || 0, String(materialItem.emoji || '✂️'));
    }
  }));
  const craftingMaterialText = craftingMaterials.filter(mat => mat !== null).map(mat => `> ${mat}`).join('\n');


  const sourceText = item.obtain?.length > 0 ? item.obtain : item.obtainTags || [];
  const jobText = item.allJobs?.length > 0 ? item.allJobs : ['None'];
  const locationsFormatted = (item.locationsTags || []).join(', ') || 'None';
  const sourceFormatted = sourceText.map(source => String(source || 'Unknown')).join('\n');
  const jobFormatted = jobText.map(job => String(job || 'Unknown')).join('\n');


  let modifierHeartsLine = '';
  let staminaToCraftLine = '';
  let staminaRecoveredLine = '';
  const isMaterial = Array.isArray(item.category)
    ? item.category.includes('Material')
    : item.category === 'Material';
  if (!isMaterial) {
    modifierHeartsLine = `**__❤️ Modifier/Hearts:__** ${String(item.modifierHearts || 'N/A')}\n`;
    staminaToCraftLine = `**__🟩 Stamina to Craft:__** ${String(item.staminaToCraft || 'N/A')}\n`;
    staminaRecoveredLine = `**__💚 Stamina Recovered:__** ${String(item.staminaRecovered || 'N/A')}`;
  }


  const description = [
    `**__✨ Category:__** ${Array.isArray(item.category) ? item.category.join(', ') : String(item.category || 'None')}`,
    `**__✨ Type:__** ${Array.isArray(item.type) ? item.type.join(', ') : String(item.type || 'None')}`,
    `**__✨ Subtype:__** ${Array.isArray(item.subtype) ? item.subtype.join(', ') : String(item.subtype || 'None')}`,
    `**__🪙 Buy Price:__** ${item.buyPrice || 'N/A'}`,
    `**__🪙 Sell Price:__** ${item.sellPrice || 'N/A'}`,
    staminaToCraftLine,
    modifierHeartsLine,
    staminaRecoveredLine
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setColor(getCategoryColor(item.category || 'Unknown'))
    .setAuthor({ 
      name: String(item.itemName || 'Unknown Item'), 
      ...(item.imageType ? { iconURL: String(item.imageType) } : {})
    })
    .setDescription(description)
    .setThumbnail(imageUrl !== 'No Image' ? imageUrl : null)
    .setFooter({ text: `Locations: ${locationsFormatted}` })
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .addFields(
      { name: '🔍 Job:', value: `>>> ${jobFormatted}`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🛠️ Source:', value: `>>> ${sourceFormatted}`, inline: true }
    );


  if (item.craftingMaterial && item.craftingMaterial.length > 0) {
    const filteredCraftingMaterials = item.craftingMaterial.filter(mat => !['#Raw Material', '#Not Craftable'].includes(mat.itemName));
    if (filteredCraftingMaterials.length > 0) {
      embed.addFields({ name: '✂️ Crafting Materials:', value: craftingMaterialText, inline: false });
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
        .map(char => formatItemDetails(String(char.name || 'Unknown'), Number(char.quantity) || 0, String(emoji)))
        .join('\n');

      return new EmbedBuilder()
        .setColor(getCategoryColor(item.category || 'Unknown'))
        .setTitle(`Characters that have ${String(item.itemName || 'Unknown Item')}`)
        .setDescription(charactersFormatted)
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ text: `Page ${Number(page || 0) + 1} of ${Number(totalPages || 1)}` });
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

    let message;
    
    try {
      message = await interaction.followUp({
        embeds: [generateCharactersEmbed(currentPage)],
        components: [generatePaginationRow()],
        ephemeral: true
      });
    } catch (error) {
      handleInteractionError(error, 'lookup.js');
      return;
    }

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
        handleInteractionError(error, 'lookup.js');
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
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

  let totalEmbedLength = 0;

  for (const item of itemsToDisplay) {
    // Ensure item has required properties
    if (!item || !item.name || !item.craftingMaterial) {
      continue; // Skip invalid items
    }

    const requirements = await Promise.all(item.craftingMaterial.map(async (mat) => {
      if (!mat || !mat.itemName) {
        return 'Unknown material';
      }
      const materialItem = await ItemModel.findOne({ itemName: mat.itemName }).select('emoji');
      const emoji = materialItem?.emoji || DEFAULT_EMOJI || '❓';
      const quantity = Number(mat.quantity) || 0;
      return formatItemDetails(String(mat.itemName), quantity, emoji);
    }));

    const requirementsText = `**Requires:**\n>>> ${requirements.join('\n')}`;
    const fieldLength = String(item.name).length + requirementsText.length;

    if (totalEmbedLength + fieldLength > 5800) {  // Leave a margin below 6000
      break;
    }

    embed.addFields({ 
      name: String(item.name || 'Unknown Item'), 
      value: requirementsText 
    });
    totalEmbedLength += fieldLength;
  }

  return embed.setFooter({ text: `Page ${Number(page || 0) + 1} of ${Number(totalPages || 1)}` });
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

 let message;
 
 try {
   message = await interaction.editReply({
     embeds: [await generateEmbed(currentPage)],
     components: [generatePaginationRow()],
   });
 } catch (error) {
   handleInteractionError(error, 'lookup.js');
   return;
 }

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
    handleInteractionError(error, 'lookup.js');

     // Error handling if needed
   }
 });
}

// ------------------- Handle crafting lookup -------------------
async function handleCraftingLookup(interaction, characterName) {
  // Declare variables in function scope so they're accessible in catch block
  let message = null;
  let collector = null;
  
  try {
    // Validate interaction and user
    if (!interaction || !interaction.user) {
      console.error('[lookup.js]: Invalid interaction or missing user object');
      return;
    }
    
    // Get the user ID from the interaction
    const userId = interaction.user.id;
    
    // Validate character name
    if (!characterName || typeof characterName !== 'string') {
      console.error('[lookup.js]: Invalid character name provided:', characterName);
      
      // Check if interaction is still valid before attempting to respond
      if (interaction && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ 
            content: '❌ Invalid character name provided.', 
            ephemeral: true 
          });
        } catch (replyError) {
          console.error('[lookup.js]: Failed to send invalid character name error:', replyError);
        }
      } else if (interaction && (interaction.replied || interaction.deferred)) {
        try {
          await interaction.editReply({ 
            content: '❌ Invalid character name provided.', 
            ephemeral: true 
          });
        } catch (editError) {
          console.error('[lookup.js]: Failed to edit invalid character name error:', editError);
          try {
            await interaction.followUp({ 
              content: '❌ Invalid character name provided.', 
              ephemeral: true 
            });
          } catch (followUpError) {
            console.error('[lookup.js]: Failed to send follow-up for invalid character name:', followUpError);
          }
        }
      }
      return;
    }
    
    // Fetch character by name and user ID
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    
    if (!character) {
      console.log(`[lookup.js]: Character "${characterName}" not found for user: ${interaction.user.tag} (${interaction.user.id})`);
      
      // Check if interaction is still valid before attempting to respond
      if (interaction && !interaction.replied && !interaction.deferred) {
        try {
          return await interaction.reply({ 
            content: `❌ Character "${characterName}" not found or does not belong to you.`, 
            ephemeral: true 
          });
        } catch (replyError) {
          console.error('[lookup.js]: Failed to send character not found error:', replyError);
        }
      } else if (interaction && (interaction.replied || interaction.deferred)) {
        try {
          return await interaction.editReply({ 
            content: `❌ Character "${characterName}" not found or does not belong to you.`, 
            ephemeral: true 
          });
        } catch (editError) {
          console.error('[lookup.js]: Failed to edit character not found error:', editError);
          try {
            await interaction.followUp({ 
              content: `❌ Character "${characterName}" not found or does not belong to you.`, 
              ephemeral: true 
            });
          } catch (followUpError) {
            console.error('[lookup.js]: Failed to send follow-up for character not found:', followUpError);
          }
        }
      }
      return;
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
      try {
        return await interaction.editReply({ 
          content: `❌ **${character.name}** cannot currently craft any items.\n\nCheck your inventory for materials or gather more resources!`, 
          ephemeral: true 
        });
      } catch (replyError) {
        console.error('[lookup.js]: Failed to send no craftable items error:', replyError);
        try {
          await interaction.followUp({ 
            content: `❌ **${character.name}** cannot currently craft any items.\n\nCheck your inventory for materials or gather more resources!`, 
            ephemeral: true 
          });
        } catch (followUpError) {
          console.error('[lookup.js]: Failed to send follow-up for no craftable items:', followUpError);
        }
      }
      return;
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
      // Ensure page is a valid number and within bounds
      const validPage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
      const start = validPage * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const itemsToDisplay = craftableItems.slice(start, end);

      const embed = new EmbedBuilder()
        .setTitle(`🛠️ Currently Craftable Items for ${character.name}`)
        .setDescription(`Found **${craftableItems.length}** items you can craft right now!`)
        .setColor('#A48D68')
        .setThumbnail(character.icon || null)
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
      
      // Ensure title and description don't exceed Discord's limits
      if (embed.data.title && embed.data.title.length > 256) {
        embed.setTitle(embed.data.title.substring(0, 253) + '...');
      }
      if (embed.data.description && embed.data.description.length > 4096) {
        embed.setDescription(embed.data.description.substring(0, 4093) + '...');
      }

      let totalEmbedSize = 0;
      const maxEmbedSize = 6000; // Discord's total embed size limit
      const maxFields = 25; // Discord's maximum fields per embed
      let fieldCount = 0;

      for (const item of itemsToDisplay) {
        // Check if we're approaching the embed size limit or field count limit
        if (totalEmbedSize > maxEmbedSize - 1000 || fieldCount >= maxFields - 3) {
          embed.addFields({
            name: '⚠️ Display Limit Reached',
            value: '> Some items could not be displayed due to Discord embed limits.',
            inline: false
          });
          fieldCount++;
          break;
        }

        // Ensure all values are valid strings/numbers with fallbacks
        const itemName = String(item.name || 'Unknown Item');
        const itemEmoji = String(item.emoji || '❓');
        const categoryText = Array.isArray(item.category) ? item.category.join(', ') : String(item.category || 'Unknown');
        const staminaText = item.staminaToCraft ? `> Stamina to Craft: ${item.staminaToCraft}` : '';
        const jobText = item.allJobs && item.allJobs.length > 0 ? `> Job: ${item.allJobs.join(', ')}` : '';
        
        const materialsText = item.materials && Array.isArray(item.materials) ? item.materials.map(mat => {
          const emoji = String(mat.emoji || DEFAULT_EMOJI || '❓');
          const itemName = String(mat.itemName || 'Unknown Material');
          const quantity = Number(mat.quantity) || 0;
          return `> ${emoji} ${itemName} x${quantity}`;
        }).join('\n') : '> No materials required';

        // Build the field value and ensure it doesn't exceed Discord's limit
        let fieldValue = `> Category: ${categoryText}\n${staminaText}\n${jobText}\n**Materials:**\n${materialsText}`;
        
        // Sanitize the field value to remove any problematic characters
        fieldValue = fieldValue.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
        fieldValue = fieldValue.replace(/[*_`~]/g, ''); // Remove markdown characters
        
        // Truncate if the value is too long (Discord limit is 1024 characters)
        if (fieldValue.length > 1024) {
          fieldValue = fieldValue.substring(0, 1021) + '...';
        }

        // Ensure the field name doesn't exceed Discord's limit (256 characters)
        let fieldName = `${itemEmoji} ${itemName}`;
        
        // Sanitize the field name - remove markdown and control characters
        fieldName = fieldName.replace(/[\u0000-\u001F\u007F-\u009F]/g, ''); // Remove control characters
        fieldName = fieldName.replace(/[*_`~]/g, ''); // Remove markdown characters
        
        if (fieldName.length > 256) {
          fieldName = fieldName.substring(0, 253) + '...';
        }

        try {
          embed.addFields({
            name: fieldName,
            value: fieldValue,
            inline: false
          });
          
          // Track embed size and field count
          totalEmbedSize += fieldName.length + fieldValue.length;
          fieldCount++;
        } catch (fieldError) {
          console.error('[lookup.js]: Failed to add field for item:', item.name, fieldError);
          // Add a simplified field if the original fails
          try {
            embed.addFields({
              name: '❓ Item',
              value: '> Unable to display full details due to length limits',
              inline: false
            });
            totalEmbedSize += 50; // Approximate size for simplified field
            fieldCount++;
          } catch (simplifiedFieldError) {
            console.error('[lookup.js]: Failed to add simplified field:', simplifiedFieldError);
          }
        }

        // Add separator field between items (except for the last item)
        if (itemsToDisplay.indexOf(item) < itemsToDisplay.length - 1) {
          try {
            embed.addFields({
              name: '━━━━━━━━━━━━━━━━━━━━━━━━━',
              value: '‎', // Invisible character for value
              inline: false
            });
            totalEmbedSize += 30; // Approximate size for separator
            fieldCount++;
          } catch (separatorError) {
            console.error('[lookup.js]: Failed to add separator field:', separatorError);
            // Use a simpler separator if the em dash one fails
            try {
              embed.addFields({
                name: '---',
                value: '‎', // Invisible character for value
                inline: false
              });
              totalEmbedSize += 10; // Approximate size for simple separator
              fieldCount++;
            } catch (simpleSeparatorError) {
              console.error('[lookup.js]: Failed to add simple separator field:', simpleSeparatorError);
            }
          }
        }
      }

      // Final safety check - ensure we don't exceed Discord's limits
      if (fieldCount >= maxFields - 1) {
        embed.addFields({
          name: '⚠️ Field Limit Reached',
          value: '> Some items could not be displayed due to field count limits.',
          inline: false
        });
        fieldCount++;
      }
      
      const footerText = `Page ${Number(page || 0) + 1} of ${Number(totalPages || 1)} • Total craftable: ${Number(craftableItems.length || 0)}`;
      
      // Ensure footer text doesn't exceed Discord's limit (2048 characters)
      if (footerText.length > 2048) {
        embed.setFooter({ text: footerText.substring(0, 2045) + '...' });
      } else {
        embed.setFooter({ text: footerText });
      }
      
      return embed;
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

    let embed;
    try {
      embed = generateEmbed(currentPage);
    } catch (embedError) {
      console.error('[lookup.js]: Failed to generate embed:', embedError);
      // Create a fallback embed
      const fallbackTitle = `🛠️ Craftable Items for ${character.name}`;
      const fallbackDescription = `Found **${craftableItems.length}** items you can craft.\n\n*Display limited due to technical constraints.*`;
      const fallbackFooter = `Total craftable: ${Number(craftableItems.length || 0)}`;
      
      embed = new EmbedBuilder()
        .setTitle(fallbackTitle.length > 256 ? fallbackTitle.substring(0, 253) + '...' : fallbackTitle)
        .setDescription(fallbackDescription.length > 4096 ? fallbackDescription.substring(0, 4093) + '...' : fallbackDescription)
        .setColor('#A48D68')
        .setFooter({ text: fallbackFooter.length > 2048 ? fallbackFooter.substring(0, 2045) + '...' : fallbackFooter });
    }
    
    // Final validation before sending
    try {
      // Ensure embed doesn't exceed Discord's limits
      if (embed.data.fields && embed.data.fields.length > 25) {
        console.warn('[lookup.js]: Embed has too many fields, truncating...');
        embed.data.fields = embed.data.fields.slice(0, 25);
      }
      
      message = await interaction.editReply({
        embeds: [embed],
        components: [generatePaginationRow()],
      });
    } catch (error) {
      handleInteractionError(error, 'lookup.js', {
        commandName: 'craftingLookup',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: character.name,
        operation: 'initialMessageCreation'
      });
      
      // Try to create a simplified embed as fallback
      try {
        const fallbackTitle = `🛠️ Craftable Items for ${character.name}`;
        const fallbackDescription = `Found **${craftableItems.length}** items you can craft.\n\n*Display limited due to technical constraints.*`;
        const fallbackFooter = `Total craftable: ${Number(craftableItems.length || 0)}`;
        
        const fallbackEmbed = new EmbedBuilder()
          .setTitle(fallbackTitle.length > 256 ? fallbackTitle.substring(0, 253) + '...' : fallbackTitle)
          .setDescription(fallbackDescription.length > 4096 ? fallbackDescription.substring(0, 4093) + '...' : fallbackDescription)
          .setColor('#A48D68')
          .setFooter({ text: fallbackFooter.length > 2048 ? fallbackFooter.substring(0, 2045) + '...' : fallbackFooter });
        
        message = await interaction.editReply({
          embeds: [fallbackEmbed],
          content: '⚠️ **Note:** Some items could not be displayed due to length limits. Please check individual items for full details.',
        });
      } catch (fallbackError) {
        console.error('[lookup.js]: Fallback embed creation also failed:', fallbackError);
        
        try {
          await interaction.editReply({ 
            content: '❌ There was an error creating the display. Please try again later.', 
            ephemeral: true 
          });
        } catch (replyError) {
          console.error('[lookup.js]: Failed to send display creation error:', replyError);
          try {
            await interaction.followUp({ 
              content: '❌ There was an error creating the display. Please try again later.', 
              ephemeral: true 
            });
          } catch (followUpError) {
            console.error('[lookup.js]: Failed to send follow-up for display creation error:', followUpError);
          }
        }
        return;
      }
    }

    if (!message) {
      console.error('[lookup.js]: Message creation failed, cannot create collector');
      return;
    }
    
    collector = message.createMessageComponentCollector({ time: 600000 }); // 10 minutes

    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: '❌ **You cannot use these buttons.**', ephemeral: true });
        return;
      }

      try {
        if (i.customId === 'prev') {
          currentPage = Math.max(0, currentPage - 1);
        } else if (i.customId === 'next') {
          currentPage = Math.min(totalPages - 1, currentPage + 1);
        }

        // Ensure currentPage is within valid bounds
        currentPage = Math.max(0, Math.min(currentPage, totalPages - 1));


        if (message && !message.deleted) {
          try {
            await i.update({
              embeds: [generateEmbed(currentPage)],
              components: [generatePaginationRow()],
            });
          } catch (updateError) {
            console.error('[lookup.js]: Failed to update embed for button interaction:', updateError);
            
            // Try to create a simplified embed as fallback
            try {
              const fallbackEmbed = new EmbedBuilder()
                .setTitle(`🛠️ Craftable Items for ${character.name}`)
                .setDescription(`Found **${craftableItems.length}** items you can craft.\n\n*Display limited due to technical constraints.*`)
                .setColor('#A48D68')
                .setFooter({ text: `Page ${Number(currentPage || 0) + 1} of ${Number(totalPages || 1)} • Total craftable: ${Number(craftableItems.length || 0)}` });
              
              await i.update({
                embeds: [fallbackEmbed],
                content: '⚠️ **Note:** Some items could not be displayed due to length limits. Please check individual items for full details.',
              });
            } catch (fallbackUpdateError) {
              console.error('[lookup.js]: Fallback embed update also failed:', fallbackUpdateError);
              
              try {
                await i.reply({ 
                  content: '❌ There was an error updating the display. Please try the command again.', 
                  ephemeral: true 
                });
              } catch (replyError) {
                console.error('[lookup.js]: Failed to send error reply for button interaction:', replyError);
              }
            }
          }
        } else {

          if (collector && !collector.ended) {
            collector.stop();
          }
          await i.reply({ 
            content: '❌ The display message was deleted. Please run the command again.', 
            ephemeral: true 
          });
        }
              } catch (error) {
          console.error(`[lookup.js]: Button interaction error for user: ${interaction.user.tag} (${interaction.user.id}):`, error);
          
          if (error.code === 10008) {
            // Message not found - stop collector
            if (collector && !collector.ended) {
              collector.stop();
            }
          } else {
            handleInteractionError(error, 'lookup.js', {
              commandName: 'craftingLookup',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              characterName: character.name,
              interactionId: i.id,
              customId: i.customId
            });
            

            try {
              await i.reply({ 
                content: '❌ There was an error updating the display. Please try the command again.', 
                ephemeral: true 
              });
            } catch (replyError) {
              console.error('[lookup.js]: Failed to send error reply:', replyError);
            }
          }
        }
    });

    collector.on('end', () => {
      // Collector ended naturally
    });
    

    collector.on('error', (error) => {
      console.error(`[lookup.js]: Collector error:`, error);
    });

  } catch (error) {

    if (collector && !collector.ended) {
      collector.stop();
    }
    

    
    handleInteractionError(error, 'lookup.js', {
      commandName: 'craftingLookup',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName: characterName
    });
    
    console.error(`[lookup.js]: Crafting lookup failed:`, error);
    

    
    // Check if interaction is still valid before attempting to respond
    if (interaction && !interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ 
          content: '❌ There was an error while checking craftable items. Please try again later.', 
          ephemeral: true 
        });
      } catch (replyError) {
        console.error(`[lookup.js]: Failed to send error reply:`, replyError);
      }
    } else if (interaction && (interaction.replied || interaction.deferred)) {
      try {
        await interaction.editReply({ 
          content: '❌ There was an error while checking craftable items. Please try again later.', 
          ephemeral: true 
        });
      } catch (editError) {
        console.error(`[lookup.js]: Failed to edit error reply:`, editError);
        try {
          await interaction.followUp({ 
            content: '❌ There was a critical error. Please try again later.', 
            ephemeral: true 
          });
        } catch (followUpError) {
          console.error(`[lookup.js]: Failed to send follow-up error message:`, followUpError);
        }
      }
    }
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
