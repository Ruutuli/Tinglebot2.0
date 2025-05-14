// ============================================================================
// ------------------- Trade Interaction Handler -------------------
// Handles parsing of interaction options, item validation, and character verification.
// ============================================================================

// ------------------- Trade Session Management -------------------
// Handles creation, updates, and execution of trade sessions
async function createTradeSession(initiator, target, items) {
  const tradeId = generateUniqueId('T');
  const formattedInitiatorItems = await Promise.all(items.map(async item => ({
    name: item.name,
    quantity: item.quantity,
    emoji: await getItemEmoji(item.name)
  })));

  const tradeData = {
    initiator: {
      userId: initiator.userId,
      characterName: initiator.name,
      items: formattedInitiatorItems
    },
    target: {
      userId: target.userId,
      characterName: target.name,
      items: []
    },
    status: 'pending',
    createdAt: new Date(),
    initiatorConfirmed: false,
    targetConfirmed: false,
    messageId: null,
    channelId: null
  };

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await TempData.create({ key: tradeId, type: 'trade', data: tradeData, expiresAt });
  console.log(`[trade.js]: ✅ Trade session created: ${tradeId}`);
  return tradeId;
}

// ------------------- Trade Session Update -------------------
async function updateTradeSession(tradeId, targetItems) {
  const formattedTargetItems = await Promise.all(targetItems.map(async item => ({
    name: item.name,
    quantity: item.quantity,
    emoji: await getItemEmoji(item.name)
  })));

  await TempData.findOneAndUpdate(
    { key: tradeId, type: 'trade' },
    { $set: { 'data.target.items': formattedTargetItems } }
  );
  console.log(`[trade.js]: 🔄 Trade session updated: ${tradeId}`);
  return (await TempData.findByTypeAndKey('trade', tradeId)).data;
}

// ------------------- Trade Confirmation -------------------
async function confirmTrade(tradeId, userId) {
  const trade = await TempData.findByTypeAndKey('trade', tradeId);
  if (!trade) {
    throw new Error('Trade not found');
  }

  const tradeData = trade.data;
  if (tradeData.initiator.userId === userId) {
    tradeData.initiatorConfirmed = true;
  } else if (tradeData.target.userId === userId) {
    tradeData.targetConfirmed = true;
  }

  trade.data = tradeData;
  trade.markModified('data');
  await trade.save();
  return tradeData;
}

// ------------------- Trade Execution -------------------
async function executeTrade(tradeData) {
  const { initiator, target } = tradeData;
  const initiatorChar = await fetchCharacterByNameAndUserId(initiator.characterName, initiator.userId);
  const targetChar = await fetchCharacterByNameAndUserId(target.characterName, target.userId);

  if (!initiatorChar || !targetChar) {
    throw new Error('Character not found for trade execution');
  }

  const uniqueSyncId = uuidv4();

  // Process items for both parties
  await Promise.all([
    processTradeItems(initiatorChar, targetChar, initiator.items, uniqueSyncId),
    processTradeItems(targetChar, initiatorChar, target.items, uniqueSyncId)
  ]);

  console.log(`[trade.js]: ✅ Trade completed between ${initiator.characterName} and ${target.characterName}`);
  return true;
}

// ------------------- Trade Item Processing -------------------
async function processTradeItems(fromChar, toChar, items, uniqueSyncId) {
  for (const item of items) {
    const itemDetails = await ItemModel.findOne({
      itemName: new RegExp(`^${item.name}$`, "i"),
    }).exec();

    const category = itemDetails?.category.join(", ") || "";
    const type = itemDetails?.type.join(", ") || "";
    const subtype = itemDetails?.subtype.join(", ") || "";

    // Remove from sender
    const removeData = {
      characterId: fromChar._id,
      itemName: item.name,
      quantity: -item.quantity,
      category,
      type,
      subtype,
      obtain: `Trade to ${toChar.name}`,
      date: new Date(),
      synced: uniqueSyncId,
      characterName: fromChar.name
    };
    await syncToInventoryDatabase(fromChar, removeData);

    // Add to receiver
    const addData = {
      characterId: toChar._id,
      itemName: item.name,
      quantity: item.quantity,
      category,
      type,
      subtype,
      obtain: `Trade from ${fromChar.name}`,
      date: new Date(),
      synced: uniqueSyncId,
      characterName: toChar.name
    };
    await syncToInventoryDatabase(toChar, addData);
  }
}

// ------------------- Trade Message Management -------------------
async function updateTradeMessage(message, tradeData, fromCharacter, toCharacter) {
  const tradeEmbed = await createTradeEmbed(
    tradeData.initiator.characterName,
    tradeData.target.characterName,
    tradeData.initiator.items,
    tradeData.target.items,
    message.url,
    fromCharacter.icon || "",
    toCharacter.icon || ""
  );

  const statusDescription = 
    `🔃 Trade Status:\n` +
    `${tradeData.initiatorConfirmed ? '✅' : '⏳'} ${tradeData.initiator.characterName} confirmed\n` +
    `${tradeData.targetConfirmed ? '✅' : '⏳'} ${tradeData.target.characterName} confirmed\n\n` +
    `<@${tradeData.initiator.userId}>, please react with ✅ to confirm the trade!`;

  tradeEmbed.setDescription(statusDescription);
  await message.edit({ embeds: [tradeEmbed] });
}

// ------------------- Trade Validation -------------------
async function validateTradeItems(character, items) {
  const characterInventoryCollection = await getCharacterInventoryCollection(character.name);
  for (const item of items) {
    const itemInventory = await characterInventoryCollection.findOne({
      itemName: { $regex: new RegExp(`^${item.name}$`, "i") },
    });
    if (!itemInventory || itemInventory.quantity < item.quantity) {
      throw new Error(`❌ \`${character.name}\` does not have enough \`${item.name} - QTY:${itemInventory ? itemInventory.quantity : 0}\` to trade.`);
    }
  }
}

// ------------------- Function: handleTrade -------------------
// Main handler for initiating or completing a trade session.
async function handleTrade(interaction) {
  const characterName = interaction.options.getString("fromcharacter");
  const item1 = interaction.options.getString("item1");
  const quantity1 = interaction.options.getInteger("quantity1");
  const item2 = interaction.options.getString("item2");
  const quantity2 = interaction.options.getInteger("quantity2") || 0;
  const item3 = interaction.options.getString("item3");
  const quantity3 = interaction.options.getInteger("quantity3") || 0;
  const tradingWithName = interaction.options.getString("tocharacter");
  const tradeId = interaction.options.getString("tradeid");
  const userId = interaction.user.id;

  try {
    await interaction.deferReply({ ephemeral: false });

    // ------------------- Validate Trade Quantities -------------------
    const itemArray = [
      { name: item1, quantity: quantity1 },
      { name: item2, quantity: quantity2 },
      { name: item3, quantity: quantity3 },
    ].filter((item) => item.name);

    for (const { quantity } of itemArray) {
      if (quantity <= 0) {
        await interaction.editReply({
          content: "❌ You must trade a **positive quantity** of items. Negative numbers are not allowed.",
          ephemeral: true,
        });
        return;
      }
    }

    // ------------------- Validate Characters -------------------
    const fromCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!fromCharacter) {
      await interaction.editReply({
        content: `❌ Character \`${characterName}\` not found or does not belong to you.`,
        ephemeral: true,
      });
      return;
    }

    const toCharacter = await fetchCharacterByName(tradingWithName);
    if (!toCharacter || toCharacter.userId === userId) {
      await interaction.editReply({
        content: `❌ Character \`${tradingWithName}\` not found or belongs to you.`,
        ephemeral: true,
      });
      return;
    }

    // ------------------- Check Inventory Sync -------------------
    try {
      await checkInventorySync(fromCharacter);
      await checkInventorySync(toCharacter);
    } catch (error) {
      await interaction.editReply({
        content: error.message,
        ephemeral: true,
      });
      return;
    }

    if (tradeId) {
      // ------------------- Handle Trade Completion -------------------
      try {
        console.log(`[trade.js]: 🔄 Processing trade ${tradeId}`);
        const trade = await TempData.findByTypeAndKey('trade', tradeId);
        if (!trade) {
          console.error(`[trade.js]: ❌ Trade ${tradeId} not found`);
          await interaction.editReply({
            content: `❌ Invalid or expired trade ID.`,
            ephemeral: true,
          });
          return;
        }

        // Check if trade has expired
        if (new Date() > trade.expiresAt) {
          console.log(`[trade.js]: ⚠️ Trade ${tradeId} expired`);
          await interaction.editReply({
            content: `❌ This trade has expired. Please initiate a new trade.`,
            ephemeral: true,
          });
          await TempData.deleteOne({ _id: trade._id });
          return;
        }

        const tradeData = trade.data;

        // Verify user is part of the trade
        if (tradeData.initiator.userId !== userId && tradeData.target.userId !== userId) {
          console.error(`[trade.js]: ❌ User ${userId} not part of trade ${tradeId}`);
          await interaction.editReply({
            content: `❌ You are not part of this trade.`,
            ephemeral: true,
          });
          return;
        }

        // Check if user has already confirmed
        if ((tradeData.initiator.userId === userId && tradeData.initiatorConfirmed) || 
            (tradeData.target.userId === userId && tradeData.targetConfirmed)) {
          console.error(`[trade.js]: ❌ User ${userId} already confirmed trade ${tradeId}`);
          await interaction.editReply({
            content: `❌ You have already confirmed this trade.`,
            ephemeral: true,
          });
          return;
        }

        // Update trade with target's items if target is confirming
        if (tradeData.target.userId === userId) {
          await updateTradeSession(tradeId, itemArray);
        }

        // Confirm trade for this user
        const updatedTradeData = await confirmTrade(tradeId, userId);
        console.log(`[trade.js]: 📦 Updated trade data after confirmation:`, JSON.stringify(updatedTradeData, null, 2));

        // If both users have confirmed, execute the trade
        if (updatedTradeData.initiatorConfirmed && updatedTradeData.targetConfirmed) {
          console.log(`[trade.js]: ✅ Both parties confirmed, executing trade`);
          
          // Send confirmation message
          const tradeConfirmMessage = await interaction.channel.send({
            content: `**Trade confirmed!** <@${updatedTradeData.initiator.userId}>, please react to the trade post with ✅ to finalize the trade.`
          });
          console.log(`[trade.js]: ✅ Trade confirmation message sent with ID: ${tradeConfirmMessage.id}`);
          
          // Update trade data with confirmation message
          await TempData.findOneAndUpdate(
            { key: tradeId, type: 'trade' },
            { 
              $set: { 
                'data.confirmMessageId': tradeConfirmMessage.id,
                'data.confirmChannelId': interaction.channelId 
              } 
            }
          );

          // Execute trade
          await executeTrade(updatedTradeData);
          
          // Clean up confirmation message
          try {
            await tradeConfirmMessage.delete();
            console.log(`[trade.js]: ✅ Confirmation message deleted successfully`);
          } catch (error) {
            console.error(`[trade.js]: ❌ Error deleting confirmation message:`, error);
          }

          await TempData.deleteOne({ _id: trade._id });
          
          // Update original trade message
          if (updatedTradeData.messageId && updatedTradeData.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
              const message = await channel.messages.fetch(updatedTradeData.messageId);
              await updateTradeMessage(message, updatedTradeData, fromCharacter, toCharacter);
              console.log(`[trade.js]: ✅ Final trade message updated successfully`);
            } catch (error) {
              console.error(`[trade.js]: ❌ Error updating final trade message:`, error);
            }
          }
          
          await interaction.editReply({
            content: `✅ Trade completed successfully.`,
            ephemeral: true,
          });
        } else {
          // Update trade status message
          if (updatedTradeData.messageId && updatedTradeData.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
              const message = await channel.messages.fetch(updatedTradeData.messageId);
              await updateTradeMessage(message, updatedTradeData, fromCharacter, toCharacter);
              console.log(`[trade.js]: ✅ Trade status message updated successfully`);
            } catch (error) {
              console.error(`[trade.js]: ❌ Error updating trade status message:`, error);
            }
          }
          
          await interaction.editReply({
            content: `**Trade confirmed!** <@${updatedTradeData.initiator.userId}>, please react to the trade post with ✅ to finalize the trade.`,
            ephemeral: true,
          });
        }

        // Clean up confirmation message if it exists
        if (updatedTradeData.confirmMessageId && updatedTradeData.channelId) {
          try {
            const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
            const confirmMsg = await channel.messages.fetch(updatedTradeData.confirmMessageId);
            await confirmMsg.delete();
            console.log(`[trade.js]: ✅ Trade confirmation message deleted successfully`);
          } catch (error) {
            console.error(`[trade.js]: ❌ Error deleting trade confirm message:`, error);
          }
        }
      } catch (error) {
        console.error(`[trade.js]: ❌ Error handling trade completion:`, error);
        await interaction.editReply({
          content: `❌ An error occurred while processing the trade.`,
          ephemeral: true,
        });
      }
    } else {
      // ------------------- Handle Trade Initiation -------------------
      try {
        // Validate items and quantities
        await validateTradeItems(fromCharacter, itemArray);

        // Create trade session
        const tradeId = await createTradeSession(fromCharacter, toCharacter, itemArray);

        // Create and send initial trade message
        const tradeEmbed = await createTradeEmbed(
          fromCharacter.name,
          toCharacter.name,
          itemArray,
          [],
          interaction.url,
          fromCharacter.icon || "",
          toCharacter.icon || ""
        );

        const tradeMessage = await interaction.editReply({
          content: `🔃 <@${toCharacter.userId}>, use the </economy trade:1372262090450141196> command with the following trade ID to complete the trade:\n\n\`\`\`${tradeId}\`\`\``,
          embeds: [tradeEmbed],
        });

        // Update trade session with message info
        await TempData.findOneAndUpdate(
          { key: tradeId, type: 'trade' },
          { $set: { 'data.messageId': tradeMessage.id, 'data.channelId': interaction.channelId } }
        );

        // Set up reaction collector
        try {
          await tradeMessage.react('✅');
          const filter = (reaction, user) => {
            return reaction.emoji.name === '✅' &&
              [fromCharacter.userId, toCharacter.userId].includes(user.id);
          };

          const collector = tradeMessage.createReactionCollector({ filter, time: 15 * 60 * 1000 });
          collector.on('collect', async (reaction, user) => {
            try {
              const latestTrade = await TempData.findByTypeAndKey('trade', tradeId);
              if ((latestTrade.data.initiator.userId === user.id && latestTrade.data.initiatorConfirmed) || 
                  (latestTrade.data.target.userId === user.id && latestTrade.data.targetConfirmed)) {
                console.log(`[trade.js]: ⚠️ User ${user.id} already confirmed trade ${tradeId}`);
                return;
              }

              const updatedTradeData = await confirmTrade(tradeId, user.id);
              console.log(`[trade.js]: ✅ ${user.tag} (${user.id}) reacted to trade ${tradeId}`);

              // Update trade message
              await updateTradeMessage(tradeMessage, updatedTradeData, fromCharacter, toCharacter);

              // If both confirmed, complete trade
              if (updatedTradeData.initiatorConfirmed && updatedTradeData.targetConfirmed) {
                collector.stop('both_confirmed');
                await executeTrade(updatedTradeData);
                await TempData.deleteOne({ _id: latestTrade._id });
                
                const finalEmbed = await createTradeEmbed(
                  updatedTradeData.initiator.characterName,
                  updatedTradeData.target.characterName,
                  updatedTradeData.initiator.items,
                  updatedTradeData.target.items,
                  tradeMessage.url,
                  fromCharacter.icon || "",
                  toCharacter.icon || ""
                );
                finalEmbed.setDescription(`✅ Trade completed successfully!`);
                await tradeMessage.edit({ content: null, embeds: [finalEmbed], components: [] });
                console.log(`[trade.js]: ✅ Trade completed: ${tradeId}`);

                // Clean up confirmation message
                if (updatedTradeData.confirmMessageId && updatedTradeData.channelId) {
                  try {
                    const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
                    const confirmMsg = await channel.messages.fetch(updatedTradeData.confirmMessageId);
                    await confirmMsg.delete();
                    console.log(`[trade.js]: ✅ Trade confirmation message deleted successfully`);
                  } catch (error) {
                    console.error(`[trade.js]: ❌ Error deleting trade confirm message:`, error);
                  }
                }
              }
            } catch (error) {
              console.error(`[trade.js]: ❌ Error processing reaction:`, error);
            }
          });

          collector.on('end', (collected, reason) => {
            if (reason !== 'both_confirmed') {
              tradeMessage.reactions.removeAll().catch(() => {});
            }
          });
        } catch (err) {
          console.error(`[trade.js]: ❌ Error setting up reaction collector: ${err.message}`);
        }
      } catch (error) {
        console.error(`[trade.js]: ❌ Error initiating trade:`, error);
        await interaction.editReply({
          content: `❌ An error occurred while initiating the trade.`,
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    handleError(error, "trade.js");
    console.error(`[trade.js]: ❌ Error executing trade command:`, error);
    await interaction.editReply({
      content: "❌ An error occurred while trying to execute the trade.",
    });
  }
}