// ------------------- Import necessary modules -------------------
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const NodeCache = require('node-cache');
const Item = require('@/shared/models/ItemModel');

// ------------------- Cache and constants -------------------
// Configure NodeCache with checkperiod disabled to avoid creating persistent timers
// stdTTL: default TTL for items (items are set with 3600s TTL anyway, but this is a fallback)
// checkperiod: 0 disables automatic expiration checking (expiration checked on access instead)
// This eliminates the persistent timer that was being flagged by the memory monitor
const cache = new NodeCache({
  stdTTL: 3600, // 1 hour default (matches the TTL used when setting items)
  checkperiod: 0 // Disable automatic checking - expiration checked lazily on access
});
const ITEMS_PER_PAGE = 25;

// ------------------- Handles the item lookup interaction -------------------
// This function handles pagination for item lookup and manages the interaction response.
async function handleItemLookupInteraction(interaction) {
  const { customId } = interaction;
  const [, action, page] = customId.split(':');
  await interaction.deferUpdate(); // Defer to ensure smooth handling.

  const newPage = action === 'next' ? parseInt(page) + 1 : parseInt(page) - 1;

  let items = cache.get('items'); // Retrieve items from cache.
  if (!items) {
    items = await Item.find().sort({ itemName: 1 }).exec(); // Fetch items from database if not in cache.
    cache.set('items', items, 3600); // Cache items for 1 hour.
  }

  // Pagination logic.
  const start = (newPage - 1) * ITEMS_PER_PAGE;
  const end = start + ITEMS_PER_PAGE;
  const pageItems = items.slice(start, end);

  // Build the embed for the current page of items.
  const embed = new EmbedBuilder()
    .setTitle('Item Lookup')
    .setColor('#00FF00')
    .setTimestamp();

  const itemNames = pageItems.map(item => item.itemName).join('\n');
  embed.addFields({ name: 'Items', value: itemNames });

  // Create navigation buttons for the item lookup pages.
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`lookup:prev:${newPage}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(newPage === 1), // Disable if on the first page.
      new ButtonBuilder()
        .setCustomId(`lookup:next:${newPage}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(end >= items.length) // Disable if on the last page.
    );

  await interaction.editReply({ embeds: [embed], components: [row] }); // Respond with the updated embed and buttons.
}

module.exports = {
  handleItemLookupInteraction,
};
