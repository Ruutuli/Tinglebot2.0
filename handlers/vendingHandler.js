// ------------------- Import necessary modules -------------------
// Standard Libraries
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require("mongodb")

// Discord.js Components
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionType, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");

// Database Connections
const { connectToTinglebot } = require("../database/connection");

// Database Services
const { fetchCharacterByNameAndUserId, updateCharacterById } = require("../database/characterService");
const { fetchItemByName} = require("../database/itemService");
const { getCurrentVendingStockList, updateItemStockByName, updateVendingStock, VILLAGE_ICONS, VILLAGE_IMAGES } = require("../database/vendingService");
const { getTokenBalance, updateTokenBalance, appendSpentTokens, getOrCreateToken  } = require('../database/tokenService');

// Modules


// Utility Functions
const { appendSheetData, authorizeSheets, extractSpreadsheetId, fetchSheetData, getSheetIdByTitle, isValidGoogleSheetsUrl, readSheetData, writeSheetData } = require("../utils/googleSheetsUtils");
const {addItemToVendingInventory, connectToInventories, updateInventory, addItemInventoryDatabase } = require("../utils/inventoryUtils.js")
const { saveSubmissionToStorage, retrieveVendingRequestFromStorage, deleteVendingRequestFromStorage, saveVendingRequestToStorage, retrieveAllVendingRequests } = require('../utils/storage'); 
const { uploadSubmissionImage } = require('../utils/uploadUtils'); // Replace with the correct path to uploadUtils.js


// Database Models
const Character = require('../models/CharacterModel');
const VendingInventory = require('../models/VendingModel');
const ItemModel = require('../models/ItemModel'); 
const initializeInventoryModel = require('../models/InventoryModel');

// Google Sheets API
const sheets = google.sheets({ version: 'v4' });


const DEFAULT_IMAGE_URL = "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
const MONTHLY_VENDING_POINTS = 500;

const VILLAGE_COLORS = {
    Rudania: '#d7342a', // Rudania Red
    Inariko: '#277ecd', // Inariko Blue
    Vhintl: '#25c059',  // Vhintl Green
};

// ------------------- Main function to execute vending commands -------------------
async function executeVending(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
        await connectToTinglebot();

        switch (subcommand) {
            case "collect_points":
                await handleCollectPoints(interaction, userId);
                break;
            case "restock":
                await handleRestock(interaction, userId);
                break;
            case "barter":
                await handleBarter(interaction, userId);
                break;
            case "viewstock":
                await viewVendingStock(interaction);
                break;
            default:
                throw new Error(`Invalid subcommand: '${subcommand}'.`);
        }
    } catch (error) {
        console.error(`[vendingHandler]: Error executing subcommand '${subcommand}' for user ID ${userId}: ${error.message}`);
        await interaction.reply({
            content: `❌ An error occurred while processing your command: ${error.message}. Please try again or contact support.`,
            ephemeral: true,
        });
    }
}

async function connectToVendingDatabase() {
    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    try {
        await client.connect();
        return client;
    } catch (error) {
        console.error("[connectToVendingDatabase]: Error connecting to vending database:", error);
        throw error;
    }
}

// ------------------- Handle the collect_points subcommand -------------------
async function handleCollectPoints(interaction, userId) {
    try {
        const characterName = interaction.options.getString("charactername");
        const character = await fetchCharacterByNameAndUserId(characterName, userId);

        if (!character) throw new Error(`Character '${characterName}' not found for user ID ${userId}.`);

        // Validate character's job
        const allowedJobs = ['Shopkeeper', 'Merchant'];
        if (!allowedJobs.includes(character.job)) {
            throw new Error(
                `Only characters with the job **Shopkeeper** or **Merchant** can collect vending points. ` +
                `Current job: **${character.job}**.`
            );
        }

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentMonthName = currentDate.toLocaleString("default", { month: "long" });
        const currentDay = currentDate.getDate();

        if (currentDay < 1 || currentDay > 31) { // Fix to 1-5 later
            throw new Error(`Points can only be collected between the 1st and 5th of the month. Current day: ${currentDay}`);
        }

        if (character.lastCollectedMonth === currentMonth) {
            const embed = new EmbedBuilder()
                .setTitle("📅 Points Already Collected")
                .setDescription(
                    `The Vendor's Guild Records show that **${character.name}** has already collected points for **${currentMonthName}**.\n\n` +
                    `**Current Points:** ${character.vendingPoints || 0}` // Display current points
                )
                .setColor("#AA926A") // Gold color
                .setThumbnail(character.icon || DEFAULT_IMAGE_URL) // Fallback if the icon is missing
                .setImage(DEFAULT_IMAGE_URL) // Default image
                .addFields(
                    { name: "🔗 **Vending Shop Link**", value: `> [Click here to view shop](${character.shopLink || 'No shop link available'})`, inline: false }
                );

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Update character points
        const updatedPoints = (character.vendingPoints || 0) + MONTHLY_VENDING_POINTS;
        await updateCharacterById(character._id, { vendingPoints: updatedPoints, lastCollectedMonth: currentMonth });

        const embed = new EmbedBuilder()
            .setTitle("✅ Monthly Points Collected")
            .setDescription(
                `The Vendors Guild has credited **${character.name}** with **${MONTHLY_VENDING_POINTS}** points for **${currentMonthName}**!\n\n**Current Points:** ${updatedPoints}`
            )
            .setColor("#AA926A") // Gold color
            .setThumbnail(character.icon || DEFAULT_IMAGE_URL) // Fallback if the icon is missing
            .setImage(DEFAULT_IMAGE_URL) // Default image
            .addFields(
                { name: "🔗 **Vending Shop Link**", value: `[Click here to view shop](${character.shopLink || 'No shop link available'})`, inline: false }
            );

        await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
        console.error(`[vendingHandler]: Error collecting points for user ID ${userId}: ${error.message}`);
        await interaction.reply({
            content: `❌ An error occurred while collecting points: ${error.message}. Please try again later or contact support.`,
            ephemeral: true,
        });
    }
}


// ------------------- Handle the Restock Subcommand -------------------
// Handles the restock process for a character.
async function handleRestock(interaction) {
    try {
        // Acknowledge the interaction
        await interaction.deferReply({ ephemeral: true });

        // Extract interaction options
        const characterName = interaction.options.getString('charactername');
        const itemName = interaction.options.getString('itemname');
        const stockQty = interaction.options.getInteger('stockqty');
        const tokenPrice = interaction.options.getInteger('tokenprice') || 'N/A';
        const artPrice = interaction.options.getInteger('artprice') || 'N/A';
        const otherPrice = interaction.options.getInteger('otherprice') || 'N/A';
        const tradesOpen = interaction.options.getBoolean('tradesopen') || false;
        const userId = interaction.user.id;

        // Define slot and pouch limits
        const baseSlotLimits = {
            shopkeeper: 5, // Shopkeeper's starting slots
            merchant: 3,   // Merchant's starting slots
        };

        const pouchCapacities = {
            none: 0,       // No pouch: 0 additional slots
            bronze: 15,    // Bronze pouch: +15 slots
            silver: 30,    // Silver pouch: +30 slots
            gold: 50,      // Gold pouch: +50 slots
        };

        // Fetch character and validate
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            throw new Error(`Character '${characterName}' not found.`);
        }

        // Calculate total slots available
        const baseSlots = baseSlotLimits[character.job.toLowerCase()] || 0;
        const additionalSlots = pouchCapacities[character.shopPouch?.toLowerCase() || 'none'];
        const totalSlots = baseSlots + additionalSlots;

        // Connect to the vending inventory
        const client = await connectToVendingDatabase();
        const db = client.db('vending');
        const inventoryCollection = db.collection(characterName.toLowerCase());

        // Fetch current shop inventory
        const shopItems = await inventoryCollection.find({}).toArray();
        const currentSlotsUsed = shopItems.reduce((slots, item) => {
            if (item.stackable) {
                return slots + Math.ceil(item.stockQty / 10); // Stackable items: 10 per slot
            } else {
                return slots + item.stockQty; // Craftable items: 1 slot per item
            }
        }, 0);

        // Fetch item details from database
        const itemDetails = await fetchItemByName(itemName);
        if (!itemDetails) {
            throw new Error(`Item '${itemName}' not found in the database.`);
        }

        // Determine stacking rules based on item properties
        const isCraftable = itemDetails.crafting || false;
        const isStackable = !isCraftable; // If not craftable, it is stackable
        
        const slotsRequired = isCraftable
            ? stockQty // Craftable items: 1 slot per item
            : Math.ceil(stockQty / 10); // Stackable items: 10 per slot
        
        if (currentSlotsUsed + slotsRequired > totalSlots) {
            // Construct detailed reason message
            const reason = isCraftable
                ? `This is a crafting item! You tried to stock **${stockQty} of this item**. Each crafting item takes up **1 slot per unit**.`
                : `This is a stackable item! You tried to stock **${stockQty} of this item**. Stackable items take up **1 slot for every 10 units**.`;
        
            throw new Error(
                `Not enough space in the shop. **${characterName}'s** shop has **${totalSlots} slots**. ` +
                `${currentSlotsUsed} are already used. Adding '**${itemDetails.itemName}**' would require ${slotsRequired} slots, exceeding the limit.\n\n` +
                reason
            );
        }      

        // Fetch the current vending stock
        const stockList = await getCurrentVendingStockList();
        if (!stockList || !stockList.stockList) {
            throw new Error('No vending stock available for this month.');
        }

        // Validate item in current village stock or limited items
        const currentVillage = character.currentVillage.toLowerCase().trim();
        const villageStock = stockList.stockList[currentVillage] || [];
        const limitedItems = stockList.limitedItems || [];

        const limitedItem = limitedItems.find(
            item => item.itemName.toLowerCase() === itemName.toLowerCase()
        );

        const villageItem = villageStock.find(
            item =>
                item.itemName.toLowerCase() === itemName.toLowerCase() &&
                item.vendingType.toLowerCase() === character.job.toLowerCase()
        );

        const itemPointsCost = limitedItem
            ? limitedItem.points
            : villageItem?.points;

        if (!itemPointsCost) {
            throw new Error(`Item '${itemName}' is not valid for '${characterName}'.`);
        }

        if (limitedItem && limitedItem.stock < stockQty) {
            throw new Error(
                `Insufficient stock for limited item '${itemName}'. Only ${limitedItem.stock} available.`
            );
        }

        const pointsSpent = stockQty * itemPointsCost;

        // Deduct points from the character
        const remainingPoints = (character.vendingPoints || 0) - pointsSpent;
        if (remainingPoints < 0) {
            throw new Error(`Insufficient points. ${characterName} only has ${character.vendingPoints} points.`);
        }

        await updateCharacterById(character._id, { vendingPoints: remainingPoints });

        // Deduct limited item stock if applicable
        if (limitedItem) {
            await updateItemStockByName(itemName, stockQty);
        }

        // Add item to the character's vending sub-collection
        await addItemToVendingInventory(character.name.toLowerCase(), {
            characterName,
            itemName,
            stockQty,
            costEach: itemPointsCost,
            pointsSpent,
            boughtFrom: character.currentVillage,
            tokenPrice,
            artPrice,
            otherPrice,
            tradesOpen,
            stackable: !isCraftable,
            date: new Date()
        });

        // Update the shop spreadsheet
        const spreadsheetId = extractSpreadsheetId(character.shopLink);
        if (!spreadsheetId) {
            throw new Error(`Invalid or missing shop link for '${characterName}'.`);
        }

        try {
            const auth = await authorizeSheets();
            const currentMonthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
            const values = [
                [
                    characterName,
                    itemName,
                    stockQty,
                    itemPointsCost,
                    pointsSpent,
                    character.currentVillage,
                    tokenPrice,
                    artPrice,
                    otherPrice,
                    tradesOpen ? 'Yes' : 'No',
                    currentMonthYear
                ]
            ];

            await appendSheetData(auth, spreadsheetId, 'vendingShop!A:K', values);
        } catch (error) {
            console.error(`[handleRestock]: Error updating spreadsheet for '${characterName}':`, error);
            throw new Error('Failed to update shop spreadsheet. Please check the Google Sheets configuration.');
        }

        // Create embed for the response
        const embed = new EmbedBuilder()
            .setTitle('✅ **Restock Successful!**')
            .setDescription(`✨ **${characterName}'s Shop Restocked!**`)
            .addFields(
                { name: '📦 **Item**', value: `\`${itemName}\``, inline: true },
                { name: '🔢 **Quantity**', value: `\`${stockQty}\``, inline: true },
                { name: '🛠️ **Slots Required**', value: `\`${slotsRequired}\``, inline: true },
                { name: '💰 **Remaining Points**', value: `\`${remainingPoints}\``, inline: true }
            )
            .setColor('#AA926A');

        // Edit the deferred reply
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('[handleRestock]: Error during restock:', error);
        await interaction.editReply({ content: `❌ **Error:** ${error.message}` });
    }
}

// removed updateBuyerInventory to repalce with addItemInventoryDatabase 

// ------------------- Handle the barter subcommand -------------------
async function handleBarter(interaction) {
    try {
        // ------------------- Extract interaction options -------------------
        const userCharacterName = interaction.options.getString('charactername');
        const vendorCharacterName = interaction.options.getString('vendorcharacter');
        const itemName = interaction.options.getString('itemname');
        const quantity = interaction.options.getInteger('quantity');
        const paymentMethod = interaction.options.getString('paymentmethod');
        const userId = interaction.user.id;

        // ------------------- Initialize Variables for Success Response -------------------
        let sellPricePerUnit = 0; // Declare for use in success embed
        let totalPrice = 0; // Declare for use in success embed

        // ------------------- Fetch and validate user data -------------------
        const user = await getOrCreateToken(userId);
        if (!user) {
            throw new Error(`[handleBarter]: Unable to retrieve user data for user ID: ${userId}`);
        }
        console.log(`[handleBarter]: Fetched user data for ID ${userId}. Tracker Link: ${user.tokenTracker || 'No tracker'}`);

        // ------------------- Validate input -------------------
        if (!quantity || quantity <= 0) {
            throw new Error(`Invalid quantity specified: ${quantity}. Please provide a positive integer.`);
        }
        if (!['art', 'other', 'token', 'trade'].includes(paymentMethod)) {
            throw new Error(`Invalid payment method: ${paymentMethod}. Allowed methods are 'art', 'other', 'token', and 'trade'.`);
        }
        const notes = interaction.options.getString('notes') || 'No additional notes provided.';

        // ------------------- Validate characters -------------------
        const userCharacter = await fetchCharacterByNameAndUserId(userCharacterName, userId);
        const vendorCharacter = await Character.findOne({ name: vendorCharacterName });

        if (!userCharacter || !vendorCharacter) {
            throw new Error(`[handleBarter]: Character validation failed. User's character: ${userCharacterName}, Vendor: ${vendorCharacterName}`);
        }
        console.log(`[handleBarter]: Characters validated. User: ${userCharacter.name}, Vendor: ${vendorCharacter.name}`);

        // Ensure both characters are in the same village
        if (userCharacter.currentVillage.toLowerCase() !== vendorCharacter.currentVillage.toLowerCase()) {
            throw new Error(
                `Both characters must be in the same village to barter. ` +
                `**${userCharacter.name}** is in **${userCharacter.currentVillage}**, ` +
                `but **${vendorCharacter.name}** is in **${vendorCharacter.currentVillage}**.`
            );
        }

        // Restrict payment methods for characters owned by the same user
        if (userCharacter.userId === vendorCharacter.userId && paymentMethod !== 'token') {
            throw new Error(
                `Payment method '${paymentMethod}' is not allowed when the buyer and vendor characters have the same owner. ` +
                `You can only use **tokens** for this transaction.`
            );
        }

        // ------------------- Fetch item from vendor's inventory -------------------
        const client = await connectToVendingDatabase();
        const db = client.db('vending');
        const inventoryCollection = db.collection(vendorCharacterName.toLowerCase());

        const item = await inventoryCollection.findOne({ itemName });
        if (!item) {
            throw new Error(`Item '${itemName}' not found in ${vendorCharacterName}'s inventory.`);
        }

        // Validate stock availability
        if (item.stockQty < quantity) {
            throw new Error(`Insufficient stock of '${itemName}'. Available: ${item.stockQty}, Requested: ${quantity}.`);
        }

        // ------------------- Handle different payment methods -------------------
        switch (paymentMethod) {
            case 'art':
            case 'other': {
                // ------------------- Art/Other Payment Handling -------------------
                const priceDescription = paymentMethod === 'art' ? item.artPrice : item.otherPrice;
                if (!priceDescription || priceDescription.trim().toLowerCase() === 'n/a') {
                    throw new Error(`🎨 The item **${itemName}** cannot be sold using the payment method **${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}** because the price is unavailable. Please choose a different payment method or contact the vendor for assistance.`);
                }

                const fulfillmentId = `${vendorCharacter._id.toString().slice(-5)}${Date.now().toString().slice(-5)}`;
                const embed = new EmbedBuilder()
                    .setTitle('⏳ Fulfillment Required!')
                    .setDescription(
                        `Your barter request for **${quantity}x ${itemName}** from **${vendorCharacterName}** has been placed on hold.\n\n` +
                        `**What to do next:**\n` +
                        `1. Fulfill your part of the barter as described below.\n` +
                        `2. Once completed, the vendor will fulfill your request.`
                    )
                    .addFields(
                        { name: '🛠️ **Requirements**', value: priceDescription, inline: false },
                        { name: '🔢 **Fulfillment ID**', value: `\`${fulfillmentId}\``, inline: true },
                        { name: '🛒 **Quantity Requested**', value: `${quantity}`, inline: true },
                        { name: '📦 **Item**', value: itemName, inline: true },
                        { name: '📜 **Notes**', value: notes, inline: false }
                    )
                    .setColor('#AA926A')
                    .setFooter({ text: `Awaiting fulfillment by ${vendorCharacterName}.` });

                const message = await interaction.reply({ embeds: [embed], ephemeral: false, fetchReply: true });

                saveVendingRequestToStorage(fulfillmentId, {
                    fulfillmentId,
                    userCharacterName,
                    vendorCharacterName,
                    itemName,
                    quantity,
                    priceDescription,
                    paymentMethod,
                    buyerId: interaction.user.id,
                    buyerUsername: interaction.user.username,
                    notes,
                    createdAt: new Date(),
                    messageId: message.id,
                });

               // Add the item to the buyer's inventory
               console.log(`[handleBarter]: Adding item '${itemName}' to buyer's inventory.`);
               await addItemInventoryDatabase(userCharacter._id, itemName, quantity, interaction, 'Vending');
               console.log(`[handleBarter]: Item '${itemName}' successfully added to buyer's inventory.`);               
                return;
            }

            case 'token': {
                // ------------------- Token Payment Handling -------------------
                     sellPricePerUnit = userCharacter.userId === vendorCharacter.userId
                    ? parseFloat((await ItemModel.findOne({ itemName }))?.sellPrice || 0) // Vendor's default sell price
                    : parseFloat(item.tokenPrice || 0); // Item's token price in vendor's inventory

                // Validate the calculated price
                if (isNaN(sellPricePerUnit) || sellPricePerUnit <= 0) {
                    throw new Error(
                        `The item **${itemName}** cannot be purchased with **Tokens**. Try a different payment method or contact the vendor for clarification.`
                    );
                }

                totalPrice = sellPricePerUnit * quantity;

                // Validate the buyer's token balance
                const buyerTokens = await getTokenBalance(interaction.user.id);
                if (buyerTokens < totalPrice) {
                    throw new Error(
                        `Insufficient tokens! This purchase costs ${totalPrice} tokens, but you only have ${buyerTokens}.`
                    );
                }

                // Deduct tokens and update the vendor's stock
                await updateTokenBalance(interaction.user.id, -totalPrice); // Deduct from buyer
                if (userCharacter.userId !== vendorCharacter.userId) {
                    await updateTokenBalance(vendorCharacter.userId, totalPrice); // Add to vendor if different users
                }

                // Update vendor's inventory
                const updatedStock = item.stockQty - quantity;
                if (updatedStock === 0) {
                    await inventoryCollection.deleteOne({ itemName }); // Remove item if stock is depleted
                } else {
                    await inventoryCollection.updateOne(
                        { itemName },
                        { $set: { stockQty: updatedStock } }
                    );
                }

               // Add the item to the buyer's inventory
               console.log(`[handleBarter]: Adding item '${itemName}' to buyer's inventory.`);
               await addItemInventoryDatabase(userCharacter._id, itemName, quantity, interaction, 'Vending');
               console.log(`[handleBarter]: Item '${itemName}' successfully added to buyer's inventory.`);               

                break;
            }
           
            case 'trade': {
                // ------------------- Trade Payment Handling -------------------
                if (!item.tradesOpen) {
                    throw new Error(`Sorry, this vendor isn't accepting trades for '${itemName}'!`);
                }

                const tradeDescription = notes || 'No trade details provided.';
                const tradeFulfillmentId = `${vendorCharacter._id.toString().slice(-5)}${Date.now().toString().slice(-5)}`;
                const tradeEmbed = new EmbedBuilder()
                    .setTitle('⏳ Trade Fulfillment Required!')
                    .setDescription(
                        `Your barter request for **${quantity}x ${itemName}** from **${vendorCharacterName}** has been placed on hold.\n\n` +
                        `**What to do next:**\n` +
                        `- **Vendor**: React to this message with a ✅ to confirm acceptance of the trade.\n` +
                        `- **Buyer**: Once the vendor accepts, use the **/gift** command to send the traded items to the vendor.\n` +
                        `- **Vendor**: Fulfill the barter request once the trade is completed.`
                    )
                    .addFields(
                        { name: '🔢 **Fulfillment ID**', value: `\`${tradeFulfillmentId}\``, inline: true },
                        { name: '🛒 **Quantity Requested**', value: `${quantity}`, inline: true },
                        { name: '📦 **Item**', value: itemName, inline: true },
                        { name: '📜 **Trade Details**', value: tradeDescription, inline: false }
                    )
                    .setColor('#AA926A')
                    .setFooter({ text: `Awaiting trade completion by ${vendorCharacterName}.` });

                const tradeMessage = await interaction.reply({ embeds: [tradeEmbed], ephemeral: false, fetchReply: true });

                saveVendingRequestToStorage(tradeFulfillmentId, {
                    fulfillmentId: tradeFulfillmentId,
                    userCharacterName,
                    vendorCharacterName,
                    itemName,
                    quantity,
                    tradeDescription,
                    paymentMethod,
                    buyerId: interaction.user.id,
                    buyerUsername: interaction.user.username,
                    notes,
                    createdAt: new Date(),
                    messageId: tradeMessage.id,
                });

               // Add the item to the buyer's inventory
               console.log(`[handleBarter]: Adding item '${itemName}' to buyer's inventory.`);
               await addItemInventoryDatabase(userCharacter._id, itemName, quantity, interaction, 'Vending');
               console.log(`[handleBarter]: Item '${itemName}' successfully added to buyer's inventory.`);
               
                return;
            }

            default:
                throw new Error('Invalid payment method.');
        }

        // ------------------- Log transaction in Google Sheets -------------------
        if (userCharacter.inventory) {
            const spreadsheetId = extractSpreadsheetId(userCharacter.inventory);
            try {
                const auth = await authorizeSheets();
                const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
                const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                const uniqueSyncId = uuidv4();

                const itemDetails = await ItemModel.findOne({ itemName });
                if (!itemDetails) {
                    throw new Error(`Item '${itemName}' not found in the database.`);
                }

                const category = itemDetails?.category || [];
                const type = itemDetails?.type || [];
                const subtype = itemDetails?.subtype || [];

                const values = [[
                    userCharacter.name,
                    itemName,
                    quantity.toString(),
                    category.join(', '),
                    type.join(', '),
                    subtype.join(', '),
                    `Bought from ${vendorCharacter.name}`,
                    userCharacter.job || 'N/A',
                    userCharacter.perk || 'N/A',
                    userCharacter.currentVillage,
                    interactionUrl,
                    formattedDateTime,
                    uniqueSyncId
                ]];

                const range = 'loggedInventory!A2:M';
                await appendSheetData(auth, spreadsheetId, range, values);
            } catch (sheetError) {
                console.error(`[handleBarter]: Failed to log purchase to buyer's Google Sheets: ${sheetError.message}`);
            }
        }

// ------------------- Success Response -------------------
const embedSuccess = new EmbedBuilder()
    .setTitle('✅ Barter Successful!')
    .setDescription(
        `You successfully bartered for **${quantity}x ${itemName}** from **${vendorCharacter.name}**.`
    )
    .addFields(
        { name: '💰 **Final Price Per Unit**', value: `${sellPricePerUnit} Tokens`, inline: true },
        { name: '💰 **Total Price**', value: `${totalPrice} Tokens`, inline: true },
        { name: '📦 **Quantity Purchased**', value: `${quantity}`, inline: true },
        { name: '📜 **Notes**', value: notes, inline: false }
    )
    .setColor('#AA926A');

await interaction.reply({ embeds: [embedSuccess], ephemeral: false });


    } catch (error) {
        console.error('[handleBarter]: Error during barter:', error);
        await interaction.reply({
            content: `❌ An error occurred during the barter: ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- Reaction Listener for Trade Acceptance -------------------
let botClient;

function initializeReactionHandler(client) {
    botClient = client;

    client.on('messageReactionAdd', async (reaction, user) => {
        try {
            if (reaction.emoji.name !== '✅' || user.bot) return; // Ensure it's a green checkmark and not from a bot
    
            const messageId = reaction.message.id;
    
            // Retrieve the fulfillment request by message ID
            const allRequests = retrieveAllVendingRequests(); // Replace with your actual function to fetch all requests
            const fulfillmentData = allRequests.find(request => request.messageId === messageId);
    
            if (!fulfillmentData) return;
    
            const {
                buyerId,
                userCharacterName,
                vendorCharacterName,
                itemName,
                quantity,
            } = fulfillmentData;
    
            // Check if the user reacting is the vendor
            const vendorCharacter = await Character.findOne({ name: vendorCharacterName });
            if (!vendorCharacter || vendorCharacter.userId !== user.id) {
                console.warn(`[messageReactionAdd]: User ${user.username} is not authorized to accept this trade.`);
                return;
            }
    
            // Notify the buyer
            const buyer = await client.users.fetch(buyerId);
            await buyer.send(
                `🎉 Your trade barter for **${quantity}x ${itemName}** with **${vendorCharacterName}** has been accepted! ` +
                `Please use the **/gift** command to send the traded items to the vendor.`
            );
    
            // Update the trade message to reflect acceptance
            const embed = reaction.message.embeds[0];
            if (embed) {
                const updatedEmbed = EmbedBuilder.from(embed)
                    .setTitle('✅ **Trade Accepted!**')
                    .setDescription(
                        `The barter for **${quantity}x ${itemName}** has been accepted by **${vendorCharacterName}**.
    
    ` +
                        `**What to do next:**
    ` +
                        `- **Buyer**: Use the **/gift** command to send the traded items to **${vendorCharacterName}**.
    ` +
                        `- **Vendor**: Fulfill the barter request once the trade is completed.`
                    )
                    .addFields(
                        { name: '🔢 **Quantity Accepted**', value: `${quantity}`, inline: true },
                        { name: '📦 **Item**', value: itemName, inline: true },
                        { name: '🛒 **Vendor**', value: vendorCharacterName, inline: true }
                    )
                    .setColor('#AA926A');
                await reaction.message.edit({ embeds: [updatedEmbed] });
            }
        } catch (error) {
            console.error(`[messageReactionAdd]: Error handling reaction: ${error.message}`);
        }
    });
}

// ------------------- Handle the Fulfill Subcommand -------------------
async function handleFulfill(interaction) {
    try {
        const fulfillmentId = interaction.options.getString('id'); // Get the fulfillment ID

        // Retrieve the fulfillment data
        const fulfillmentData = retrieveVendingRequestFromStorage(fulfillmentId);
        if (!fulfillmentData) {
            throw new Error(`Fulfillment ID '${fulfillmentId}' not found.`);
        }

        const {
            userCharacterName,
            vendorCharacterName,
            itemName,
            quantity,
            buyerId,
            messageId,
        } = fulfillmentData;

        // Fetch the vendor character
        const vendorCharacter = await Character.findOne({ name: vendorCharacterName });
        if (!vendorCharacter) {
            throw new Error(`Vendor character '${vendorCharacterName}' not found.`);
        }

        // Ensure the user executing the command owns the vendor character
        if (vendorCharacter.userId !== interaction.user.id) {
            throw new Error(`You do not own the vendor character '${vendorCharacterName}' and cannot fulfill this request.`);
        }

        // Connect to the vending inventory database
        const client = await connectToVendingDatabase();
        const db = client.db('vending');
        const vendorInventory = db.collection(vendorCharacterName.toLowerCase());

        // Fetch the item from the vendor's inventory
        const item = await vendorInventory.findOne({ itemName });
        if (!item) {
            throw new Error(`Item '${itemName}' not found in ${vendorCharacterName}'s inventory.`);
        }

        // Validate stock availability
        if (item.stockQty < quantity) {
            throw new Error(
                `Vendor does not have enough stock for '${itemName}'. Available: ${item.stockQty}, Requested: ${quantity}.`
            );
        }

        // Deduct the stock from the vendor's inventory
        const updatedStock = item.stockQty - quantity;
        if (updatedStock === 0) {
            await vendorInventory.deleteOne({ itemName }); // Remove the item if stock reaches zero
        } else {
            await vendorInventory.updateOne(
                { itemName },
                { $set: { stockQty: updatedStock } }
            );
        }

        // Add the item to the buyer's inventory using addItemInventoryDatabase
        const buyerCharacter = await Character.findOne({ name: userCharacterName });
        if (!buyerCharacter) {
            throw new Error(`Buyer character '${userCharacterName}' not found.`);
        }

        console.log(`[handleFulfill]: Adding item '${itemName}' to buyer's inventory.`);
        await addItemInventoryDatabase(buyerCharacter._id, itemName, quantity, interaction, 'Vending');
        console.log(`[handleFulfill]: Item '${itemName}' successfully added to buyer's inventory.`);

        // Update the buyer's Google Sheet
        if (buyerCharacter.inventory) {
            const spreadsheetId = extractSpreadsheetId(buyerCharacter.inventory);
            const auth = await authorizeSheets();

            const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
            const uniqueSyncId = uuidv4(); // Generate a unique sync ID for logging purposes

            const values = [[
                buyerCharacter.name,             // Character Name
                itemName,                        // Item Name
                quantity.toString(),             // Quantity of Item
                'Vending',                       // How the item was obtained
                buyerCharacter.job || '',
                buyerCharacter.perk || '',
                buyerCharacter.currentVillage,
                interactionUrl,                  // Link to the interaction
                formattedDateTime,               // Date/Time of transaction
                uniqueSyncId                     // Unique Sync ID
            ]];

            const range = 'loggedInventory!A2:M'; // Range for appending data
            await appendSheetData(auth, spreadsheetId, range, values);
        }

        // React to the "Fulfillment Required!" message
        if (messageId) {
            try {
                const channel = await interaction.client.channels.fetch(interaction.channelId); // Fetch the current channel
                if (!channel) {
                    console.warn(`[handleFulfill]: Channel not found for ID '${interaction.channelId}'.`);
                } else {
                    const message = await channel.messages.fetch(messageId); // Fetch the specific message
                    if (!message) {
                        console.warn(`[handleFulfill]: Message not found for ID '${messageId}'.`);
                    } else {
                        await message.react('✅'); // React with green checkmark
                        console.log(`[handleFulfill]: Reacted to message ID '${messageId}' with a green checkmark.`);
                    }
                }
            } catch (error) {
                console.error(`[handleFulfill]: Error reacting to message ID '${messageId}':`, error);
            }
        }

        // Notify the buyer
        const buyer = await interaction.client.users.fetch(buyerId);
        await buyer.send(
            `✅ Your barter request for **${quantity}x ${itemName}** from **${vendorCharacterName}** has been fulfilled!`
        );

        // Respond with an embed
        const embed = new EmbedBuilder()
        .setTitle('✅ **Fulfillment Complete**')
        .setDescription(`The Vendor's Guild has overseen the fulfillment of **${quantity}x ${itemName}**.`)
        .addFields(
            { name: '📦 **Item**', value: itemName, inline: true },
            { name: '🔢 **Quantity**', value: quantity.toString(), inline: true },
            { name: '🏷️ **Buyer**', value: `[${userCharacterName}](${buyerCharacter.inventory || 'No link available'})`, inline: true },
            { name: '🏷️ **Vendor**', value: `[${vendorCharacterName}](${vendorCharacter.inventory || 'No link available'})`, inline: true },
            { name: '🛍️ **Vendor Shop**', value: `[View Shop](${vendorCharacter.shopLink || 'No shop link available'})`, inline: true }
        )
        .setColor('#AA926A') // Set the gold color
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Set the image
        .setFooter({ text: `Transaction overseen by The Vendor's Guild` });
    

        await interaction.reply({ embeds: [embed], ephemeral: false });

        // Delete the fulfillment data
        deleteVendingRequestFromStorage(fulfillmentId);
    } catch (error) {
        console.error('[handleFulfill]: Error during fulfillment:', error);
        await interaction.reply({
            content: `❌ An error occurred during fulfillment: ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- Handle the Pouch Upgrade Subcommand -------------------
async function handlePouchUpgrade(interaction) {
    try {
        const characterName = interaction.options.getString('charactername');
        const pouchType = interaction.options.getString('pouchtype');
        const userId = interaction.user.id;

        // Fetch the character
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            throw new Error(`Character '${characterName}' not found or does not belong to you.`);
        }

        // Define pouch capacities and costs
        const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
        const pouchCosts = { bronze: 1000, silver: 5000, gold: 10000 };

        // Ensure the user is not downgrading or selecting the same pouch type
        if (pouchCapacities[pouchType] <= pouchCapacities[character.shopPouch || 'none']) {
            throw new Error(`You cannot downgrade or select the same pouch type.`);
        }

        // Fetch the user's current token balance
        const userTokens = await getTokenBalance(userId);
        const cost = pouchCosts[pouchType];

        if (userTokens < cost) {
            throw new Error(`Upgrading to ${pouchType} costs ${cost} tokens, but you only have ${userTokens}.`);
        }

        // Deduct tokens and upgrade the pouch
        await updateTokenBalance(userId, -cost); // Deduct tokens
        character.shopPouch = pouchType;
        await character.save();

        // Respond with success
        const embed = new EmbedBuilder()
            .setTitle('✅ **Pouch Upgrade Successful!**')
            .setDescription(`**${character.name}** has successfully upgraded their pouch to **${capitalizeFirstLetter(pouchType)}**.`)
            .addFields(
                { name: '🛍️ **New Capacity**', value: `${pouchCapacities[pouchType]} slots`, inline: true },
                { name: '💰 **Tokens Spent**', value: `${cost}`, inline: true },
                { name: '💰 **Remaining Tokens**', value: `${userTokens - cost}`, inline: true }
            )
            .setColor('#AA926A') // Set the gold color
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

        await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
        console.error('[handlePouchUpgrade]: Error:', error);
        await interaction.reply({
            content: `❌ **Error:** ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- View the current vending stock -------------------
async function viewVendingStock(interaction) {
    try {
        await interaction.deferReply({ ephemeral: false });
        const currentMonthName = new Date().toLocaleString("default", { month: "long" });
        const currentYear = new Date().getFullYear();
        
        const stockList = await getCurrentVendingStockList();
        
        if (!stockList || !stockList.stockList) {
            console.error("Error: Stock list is missing or invalid", stockList); // Log the issue
            await interaction.editReply({
                content: "❌ Unable to fetch the vending stock. Please try again later.",
                ephemeral: true,
            });
            return;
        }

        const villageEmbeds = await Promise.all(Object.keys(stockList.stockList).map((village) => {
            const villageItems = stockList.stockList[village];
            const itemDescriptions = villageItems.map((item) => {
                const emoji = item.emoji || '🔹';
                return `**${emoji} ${item.itemName}**\n> Points: ${item.points}\n> Type: ${item.vendingType}`;
            });
            const description = itemDescriptions.length ? itemDescriptions.join("\n\n") : "No items available for this village.";

            return new EmbedBuilder()
                .setTitle(`${village} ${currentMonthName} Vending Stock`)
                .setDescription(description)
                .setColor(VILLAGE_COLORS[village] || "#AA926A") // Use dynamic color or fallback
                .setThumbnail(VILLAGE_ICONS[village])
                .setImage(VILLAGE_IMAGES[village]);
        }));

        const limitedItems = stockList.limitedItems.map((item) => {
            const emoji = item.emoji || '🛒';
            return `**${emoji} ${item.itemName}**\n> Points: ${item.points}\n> Stock: ${item.stock}`;
        });
        const limitedEmbed = new EmbedBuilder()
            .setTitle(`Limited Items for ${currentMonthName} ${currentYear}`)
            .setDescription(limitedItems.join("\n\n"))
            .setColor("#FFD700")
            .setImage(DEFAULT_IMAGE_URL);

        await interaction.editReply({
            content: `# 🔹Vending: ${currentMonthName} ${currentYear}`,
            embeds: [...villageEmbeds, limitedEmbed],
        });
    } catch (error) {
        console.error("Error viewing vending stock:", error);
        await interaction.editReply({
            content: `❌ An error occurred while viewing the vending stock: ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- View Vendor Shop -------------------
const VIEW_SHOP_IMAGE_URL = "https://t3.ftcdn.net/jpg/05/48/37/72/360_F_548377272_4TSQyUy8y5gWP9m1vdWOa1RE9AmkphIp.png";

// Helper function to capitalize the first letter of a string
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

// Helper function to validate a URL
function isValidUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

async function handleViewShop(interaction) {
    try {
        const characterName = interaction.options.getString("charactername");

        // Fetch the character from the database
        const character = await Character.findOne({ name: characterName });
        if (!character) {
            throw new Error(`Character '${characterName}' not found.`);
        }

        // Validate the shop image URL
        const shopImage = isValidUrl(character.shopImage) ? character.shopImage : VIEW_SHOP_IMAGE_URL;
        console.log(`[handleViewShop]: Using shop image URL: ${shopImage}`);

        // Connect to the vending inventory database
        const client = await connectToVendingDatabase();
        const db = client.db('vending');
        const inventoryCollection = db.collection(characterName.toLowerCase());

        // Fetch all items in the character's vending inventory
        const items = await inventoryCollection.find({}).toArray();
        if (!items || items.length === 0) {
            throw new Error(`No items found in ${characterName}'s shop.`);
        }

        // Create item descriptions for pagination
        const itemDescriptionsArray = await Promise.all(
            items.map(async (item) => {
                const itemDetails = await ItemModel.findOne({ itemName: item.itemName });
                const emoji = itemDetails?.emoji || '🔹';
                return `**${emoji} ${item.itemName}** - \`qty: ${item.stockQty}\`\n> **Token Price:** ${item.tokenPrice || 'N/A'}\n> **Art Price:** ${item.artPrice || 'N/A'}\n> **Other Price:** ${item.otherPrice || 'N/A'}\n> **Trades Open:** ${item.tradesOpen ? 'Yes' : 'No'}`;
            })
        );

        // Paginate items (4 items per page)
        const itemsPerPage = 4;
        const totalPages = Math.ceil(itemDescriptionsArray.length / itemsPerPage);

        // Function to generate the embed for a specific page
        const generateEmbed = (page) => {
            const start = (page - 1) * itemsPerPage;
            const end = start + itemsPerPage;
            const pageItems = itemDescriptionsArray.slice(start, end).join("\n\n");

            const formattedVillage = capitalizeFirstLetter(character.currentVillage);

            return new EmbedBuilder()
                .setTitle(`🛍️ ${characterName}'s Shop (Page ${page}/${totalPages})`)
                .setDescription(`${pageItems}\n\n💡 Use </vending barter:1306176790095728737> to buy from this character!`)
                .setColor("#AA926A")
                .setThumbnail(character.icon || DEFAULT_IMAGE_URL)
                .setImage(shopImage) // Use validated shop image
                .setFooter({
                    text: `${characterName}: ${character.job} is currently in ${formattedVillage}!`,
                    iconURL: interaction.user.displayAvatarURL(),
                });
        };

        // Create buttons for pagination
        const createButtons = (currentPage) => new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('prev_page')
                .setLabel('Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId('next_page')
                .setLabel('Next')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages)
        );

        // Initial page setup
        let currentPage = 1;
        const embed = generateEmbed(currentPage);

        // Send the initial message
        const message = await interaction.reply({
            embeds: [embed],
            components: [createButtons(currentPage)],
            fetchReply: true,
        });

        // Create a collector for button interactions
        const collector = message.createMessageComponentCollector({
            filter: (btnInteraction) => btnInteraction.user.id === interaction.user.id,
            time: 60000, // 1 minute
        });

        collector.on('collect', async (btnInteraction) => {
            try {
                if (btnInteraction.customId === 'prev_page') {
                    currentPage = Math.max(1, currentPage - 1);
                } else if (btnInteraction.customId === 'next_page') {
                    currentPage = Math.min(totalPages, currentPage + 1);
                } else {
                    console.warn(`[Pagination]: Unhandled button interaction: ${btnInteraction.customId}`);
                    return;
                }

                // Update the embed and buttons
                await btnInteraction.update({
                    embeds: [generateEmbed(currentPage)],
                    components: [createButtons(currentPage)],
                });
            } catch (error) {
                if (error.code === 10008) {
                    console.error('[handleViewShop]: Message not found or interaction expired.');
                    collector.stop();
                } else {
                    console.error('[handleViewShop]: Error handling button interaction:', error);
                }
            }
        });

        collector.on('end', async () => {
            try {
                // Disable buttons when collector ends
                await message.edit({
                    components: [],
                });
            } catch (error) {
                if (error.code !== 10008) {
                    console.error('[handleViewShop]: Error disabling buttons:', error);
                }
            }
        });
    } catch (error) {
        console.error(`[handleViewShop]: Error viewing shop for user '${interaction.user.id}':`, error);
        try {
            await interaction.reply({
                content: `❌ An error occurred while viewing the shop: ${error.message}`,
                ephemeral: true,
            });
        } catch (replyError) {
            if (replyError.code !== 10008) {
                console.error('[handleViewShop]: Error sending reply:', replyError);
            }
        }
    }
}


// ------------------- shop link -------------------
async function handleShopLink(interaction) {
    try {
        const characterName = interaction.options.getString('charactername');
        const shopLink = interaction.options.getString('link');

        // Validate the Google Sheets link
        if (!isValidGoogleSheetsUrl(shopLink)) {
            await interaction.reply({ content: '❌ Invalid Google Sheets link. Please provide a valid link.', ephemeral: true });
            return;
        }

        // Fetch the character by name and user ID
        const userId = interaction.user.id;
        const character = await fetchCharacterByNameAndUserId(characterName, userId);

        if (!character) {
            await interaction.reply({ content: `❌ Character '${characterName}' not found.`, ephemeral: true });
            return;
        }

        // Update the shop link in the character model
        await Character.updateOne(
            { _id: character._id },
            { $set: { shopLink } }
        );

        await interaction.reply({ content: `✅ Shop link for **${characterName}** updated successfully!`, ephemeral: false });
    } catch (error) {
        console.error('[handleShopLink]: Error updating shop link:', error);
        await interaction.reply({ content: '❌ An error occurred while updating the shop link. Please try again later.', ephemeral: true });
    }
}

// ------------------- Helper function to capitalize the first letter of a string -------------------
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

// ------------------- Helper: Vending Setup -------------------
async function handleVendingSetup(interaction) {
    try {
        const characterName = interaction.options.getString('charactername');
        const shopLink = interaction.options.getString('shoplink');
        const pouch = interaction.options.getString('pouch');
        const points = interaction.options.getInteger('points');
        const userId = interaction.user.id;

        // Validate the Google Sheets link
        if (!isValidGoogleSheetsUrl(shopLink)) {
            await interaction.reply({ content: '❌ Invalid Google Sheets link. Please provide a valid link.', ephemeral: true });
            return;
        }

        // Fetch the character
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            await interaction.reply({ content: `❌ Character '${characterName}' not found.`, ephemeral: true });
            return;
        }

        // Check if setup has already been completed
        if (character.vendingSetup) {
            await interaction.reply({ content: `❌ **${characterName}** has already been set up for vending.`, ephemeral: true });
            return;
        }

        // Extract spreadsheet ID
        const spreadsheetId = extractSpreadsheetId(shopLink);
        if (!spreadsheetId) {
            await interaction.reply({ content: '❌ Unable to extract Spreadsheet ID from the provided link.', ephemeral: true });
            return;
        }

        // Authorize Google Sheets
        const auth = await authorizeSheets();

        // Validate permissions for the bot
        const hasPermission = await checkEditorPermission(auth, spreadsheetId, 'tinglebot@rotw-tinglebot.iam.gserviceaccount.com');
        if (!hasPermission) {
            await sendPermissionErrorEmbed(interaction, 'tinglebot@rotw-tinglebot.iam.gserviceaccount.com', shopLink);
            return;
        }

        // Check for the "vendingShop" tab
        const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'vendingShop');
        if (!sheetId) {
            await sendSetupInstructions(interaction, 'missing_sheet', character._id, characterName, shopLink);
            return;
        }

        // Validate headers in the "vendingShop" tab
        const expectedHeaders = [
            'CHARACTER NAME', 'ITEM NAME', 'STOCK QTY', 'COST EACH', 'POINTS SPENT',
            'BOUGHT FROM', 'TOKEN PRICE', 'ART PRICE', 'OTHER PRICE', 'TRADES OPEN?', 'DATE'
        ];
        const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A1:L1');
        if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
            await sendSetupInstructions(interaction, 'missing_headers', character._id, characterName, shopLink);
            return;
        }

        // Define pouch sizes based on type
        const pouchSizes = {
            bronze: 15,
            silver: 30,
            gold: 50,
            none: character.job.toLowerCase() === 'merchant' ? 3 : 5
        };

        const pouchSize = pouchSizes[pouch] || 3; // Default to 3 for "none"

        // Update character data
        await updateCharacterById(character._id, {
            shopLink,
            vendingType: character.job, // Set vendorType to match the character's job
            shopPouch: pouch,
            pouchSize,
            vendingPoints: points,
            vendingSetup: true,
        });

        // Create an embed with instructions
        const setupEmbed = createVendingSetupEmbed(characterName, shopLink, pouch, points, pouchSize);

        // Respond with the setup confirmation and embed
        await interaction.reply({
            embeds: [setupEmbed],
            ephemeral: true, // Ensure the response is private
        });

    } catch (error) {
        console.error(`[handleVendingSetup]: Error during vending setup:`, error);
        await interaction.reply({ content: '❌ An error occurred during setup. Please try again later.', ephemeral: true });
    }
}

// ------------------- Helper: Google Sheet  -------------------
async function checkEditorPermission(auth, spreadsheetId, email) {
    try {
        const sheets = google.sheets({ version: 'v4', auth });

        console.log(`[checkEditorPermission]: Checking access for spreadsheetId: ${spreadsheetId}`);
        
        // Attempt to fetch spreadsheet details
        const response = await sheets.spreadsheets.get({ spreadsheetId });
        console.log(`[checkEditorPermission]: Access confirmed for spreadsheetId: ${spreadsheetId}`);
        return true; // If no error, access is confirmed
    } catch (error) {
        const errorDetails = error.response?.data || error.message;
        console.error(`[checkEditorPermission]: Error for spreadsheetId: ${spreadsheetId}`, errorDetails);
        
        // Log specific error details for 404
        if (error.response?.status === 404) {
            console.error(`[checkEditorPermission]: Spreadsheet not found or inaccessible. Ensure the ID is correct and the bot's service account has permission.`);
        }
        return false;
    }
}

// ------------------- Permission Error Embed -------------------
const sendPermissionErrorEmbed = async (interaction, email, shopLink) => {
    const embed = new EmbedBuilder()
        .setTitle('❌ Missing Permissions')
        .setDescription(
            `The bot does not have edit access to the provided Google Sheets document. This is required for the setup to proceed.`
        )
        .addFields(
            { name: '🔗 Provided Link', value: `[Click here to access the document](${shopLink})`, inline: false },
            {
                name: '📋 Steps to Grant Access',
                value: [
                    `1. Open the Google Sheets document using the provided link.`,
                    `2. Click the **Share** button in the top-right corner.`,
                    `3. Add the following email address as an **Editor**:`,
                    `   \`\`\`${email}\`\`\``,
                    `4. Confirm the permission changes.`,
                    `5. Run the \`/vending setup\` command again.`,
                ].join('\n'),
                inline: false,
            }
        )
        .setColor('#FF0000')
        .setFooter({ text: 'Need help? Contact a moderator for assistance.' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
};

// ------------------- Helper: Send Setup Instructions -------------------
async function sendSetupInstructions(interaction, errorType, characterId, characterName, googleSheetsUrl) {
    const detailedInstructions = {
        missing_sheet: {
            title: 'Missing "vendingShop" Tab',
            description: 'Your Google Sheets document is missing the required `vendingShop` tab. Follow these steps to fix this issue:',
            steps: [
                '1. Use this [Google Sheets Template](https://docs.google.com/spreadsheets/d/163UPIMTyHLLCei598sP5Ezonpgl2W-DaSxn8JBSRRSw/edit?gid=440335447#gid=440335447) to start.',
                '2. Click **File > Make a Copy** to create your own copy of the template.',
                '3. Ensure the new sheet includes a tab named **`vendingShop`**.',
                '4. Use the copied link during the `/vending setup` command.'
            ]
        },
        missing_headers: {
            title: 'Incorrect or Missing Headers',
            description: 'The `vendingShop` tab is missing required headers. Follow these steps to fix this issue:',
            steps: [
                '1. Open the `vendingShop` tab in your Google Sheets document.',
                '2. Use this [Google Sheets Template](https://docs.google.com/spreadsheets/d/163UPIMTyHLLCei598sP5Ezonpgl2W-DaSxn8JBSRRSw/edit?gid=440335447#gid=440335447) for reference.',
                '3. Ensure the following headers are present in Row 1 (Columns A-L):',
                '   ```\n   CHARACTER NAME | ITEM NAME | STOCK QTY | COST EACH | POINTS SPENT |\n   BOUGHT FROM | TOKEN PRICE | ART PRICE | OTHER PRICE | TRADES OPEN? |\n   DATE ```',
                '4. Ensure there are no typos (copy them exactly from the template).',
                '5. Save your changes and try running the `/vending setup` command again.'
            ]
        },
        generic_error: {
            title: 'Setup Error',
            description: 'An unexpected error occurred during the setup. Please ensure your Google Sheets document is configured correctly and try again. If the issue persists, contact a moderator for help.',
            steps: [
                '1. Verify the Google Sheets link is accurate.',
                '2. Use this [Google Sheets Template](https://docs.google.com/spreadsheets/d/163UPIMTyHLLCei598sP5Ezonpgl2W-DaSxn8JBSRRSw/edit?gid=440335447#gid=440335447) to ensure all required tabs and headers are correct.',
                '3. Contact a moderator for further assistance if the issue persists.'
            ]
        }
    };

    const errorDetails = detailedInstructions[errorType] || detailedInstructions['generic_error'];

    const embed = new EmbedBuilder()
        .setTitle(`❌ ${errorDetails.title}`)
        .setDescription(`${errorDetails.description}\n\n**Steps to Fix:**\n${errorDetails.steps.join('\n')}`)
        .setColor('#FF0000')
        .setTimestamp()
        .setFooter({ text: 'Need help? Contact a moderator for assistance.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`[vendingHandler]: Setup instructions sent for error: ${errorType}`);
}

// ------------------- Helper: Create Vending Setup Embed -------------------
const createVendingSetupEmbed = (characterName, shopLink, pouch, points, inventorySlots, errorMessage = '') => {
    const embed = new EmbedBuilder()
        .setTitle(`📋 Vending Setup Instructions for **${characterName}**`)
        .setColor(errorMessage ? '#FF0000' : '#25c059')
        .setTimestamp();

    if (errorMessage) {
        embed.addFields({ name: '❌ Setup Error', value: errorMessage });
    } else {
        embed.setDescription(`✅ **Vending setup complete for ${characterName}!** Your inventory is set up correctly and ready to use!`)
            .addFields(
                { name: '🔗 Shop Link', value: `[Click here to access your shop link](${shopLink})`, inline: false },
                { name: '👜 Pouch Type', value: `**${pouch.charAt(0).toUpperCase() + pouch.slice(1)}**`, inline: true },
                { name: '📦 Inventory Slots', value: `**${inventorySlots} slots**`, inline: true },
                { name: '💰 Starting Points', value: `**${points} points**`, inline: true },
                { name: '🛠️ Next Steps', value: '1. Use `/vending restock` to add items to your vending inventory.\n2. Set prices for each item in your shop.\n3. Use `/vending sync` to finalize your inventory.' }
            )
            .setColor('#AA926A') // Set the gold color for the final embed
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
    }

    return embed;
};


// ------------------- Handle the Edit Shop Subcommand -------------------
async function handleEditShop(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        // Extract interaction options
        const characterName = interaction.options.getString('charactername');
        const itemName = interaction.options.getString('itemname');
        const shopImageFile = interaction.options.getAttachment('shopimagefile'); // Get the uploaded file
        const tokenPrice = interaction.options.getInteger('tokenprice');
        const artPrice = interaction.options.getString('artprice');
        const otherPrice = interaction.options.getString('otherprice');
        const tradesOpen = interaction.options.getBoolean('tradesopen');
        const userId = interaction.user.id;

        // Fetch the character by name and user ID
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            throw new Error(`Character '${characterName}' not found or does not belong to you.`);
        }

        // Handle special case for "Shop Image"
        if (itemName.toLowerCase() === 'shop image') {
            if (!shopImageFile) {
                throw new Error('No shop image file uploaded. Please upload a valid image.');
            }

            // Upload the shop image
            const sanitizedCharacterName = characterName.replace(/\s+/g, ''); // Remove spaces
            const imageName = `${sanitizedCharacterName}_shop_image_${Date.now()}`; // Include timestamp in the name
            const uploadedImageUrl = await uploadSubmissionImage(shopImageFile.url, imageName);
            console.log(`[handleEditShop]: Uploaded shop image for ${characterName}. Saved as: ${imageName}`);

            // Update the shop image for the character
            await Character.updateOne(
                { name: characterName },
                { $set: { shopImage: uploadedImageUrl } }
            );

            await interaction.editReply({
                content: `✅ Shop image updated successfully for **${characterName}**!`,
            });
            return;
        }

        // Connect to the vending inventory database
        const client = await connectToVendingDatabase();
        const db = client.db('vending');
        const inventoryCollection = db.collection(characterName.toLowerCase());

        // Fetch the item from the vending inventory
        const item = await inventoryCollection.findOne({ itemName });
        if (!item) {
            throw new Error(`Item '${itemName}' not found in ${characterName}'s shop.`);
        }

        // Update the prices and trades open status in the database
        const updateFields = {};
        if (tokenPrice !== null) updateFields.tokenPrice = tokenPrice;
        if (artPrice) updateFields.artPrice = artPrice;
        if (otherPrice) updateFields.otherPrice = otherPrice;
        if (tradesOpen !== null) updateFields.tradesOpen = tradesOpen;

        if (Object.keys(updateFields).length === 0) {
            throw new Error('No fields were provided for update.');
        }

        await inventoryCollection.updateOne({ itemName }, { $set: updateFields });

        // Update the prices and trades open status in the Google Sheet
        const spreadsheetId = extractSpreadsheetId(character.shopLink);
        if (!spreadsheetId) {
            throw new Error(`Invalid or missing shop link for '${characterName}'.`);
        }

        const auth = await authorizeSheets();
        const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A:K');

        // Find the row matching the item name and rewrite it
        const rowIndex = sheetData.findIndex(row => row[1] === itemName);
        if (rowIndex === -1) {
            throw new Error(`Item '${itemName}' not found in the shop spreadsheet.`);
        }

        const updatedRow = [
            characterName,
            itemName,
            sheetData[rowIndex][2], // StockQty
            sheetData[rowIndex][3], // CostEach
            sheetData[rowIndex][4], // PointsSpent
            sheetData[rowIndex][5], // BoughtFrom
            tokenPrice !== null ? tokenPrice : sheetData[rowIndex][6], // TokenPrice
            artPrice || sheetData[rowIndex][7], // ArtPrice
            otherPrice || sheetData[rowIndex][8], // OtherPrice
            tradesOpen !== null ? (tradesOpen ? 'Yes' : 'No') : sheetData[rowIndex][9], // TradesOpen
            sheetData[rowIndex][10], // MonthYear
        ];

        const range = `vendingShop!A${rowIndex + 1}:K${rowIndex + 1}`; // Define the specific row range to update
        await writeSheetData(auth, spreadsheetId, range, [updatedRow]);

        // Create success message
        const embed = new EmbedBuilder()
            .setTitle('✅ **Item Updated Successfully!**')
            .setDescription(`The details for **${itemName}** in **${characterName}'s** shop have been updated.`)
            .addFields(
                { name: '💰 **Token Price**', value: `${tokenPrice !== null ? tokenPrice : item.tokenPrice || 'N/A'}`, inline: true },
                { name: '🎨 **Art Price**', value: `${artPrice || item.artPrice || 'N/A'}`, inline: true },
                { name: '📜 **Other Price**', value: `${otherPrice || item.otherPrice || 'N/A'}`, inline: true },
                { name: '🔄 **Trades Open**', value: `${tradesOpen !== null ? (tradesOpen ? 'Yes' : 'No') : item.tradesOpen ? 'Yes' : 'No'}`, inline: true }
            )
            .setColor('#AA926A') // Set the gold color
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error('[handleEditShop]: Error editing shop item:', error);
        await interaction.editReply({
            content: `❌ An error occurred while editing the shop item: ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- Handle the Vending Sync Subcommand -------------------
async function handleVendingSync(interaction) {
    try {
        const characterName = interaction.options.getString('charactername');
        const userId = interaction.user.id;

        // Fetch the character
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            throw new Error(`Character '${characterName}' not found or does not belong to you.`);
        }

        console.log(`[handleVendingSync]: Retrieved character details:`, character);

        if (character.vendingSync) {
            throw new Error(`The sync has already been completed for **${characterName}**.`);
        }

        const shopLink = character.shopLink;
        console.log(`[handleVendingSync]: Retrieved shop link for character '${characterName}': '${shopLink}'`);

        if (!shopLink) {
            throw new Error(`No shop link found for **${characterName}**. Please set up a shop link using the "/vending setup" command.`);
        }

        // Extract the spreadsheet ID
        const spreadsheetId = extractSpreadsheetId(shopLink);
        if (!spreadsheetId) {
            throw new Error('Invalid shop link. Unable to extract the spreadsheet ID.');
        }

        // Authorize Google Sheets
        const auth = await authorizeSheets();

        // Read the vendingShop sheet data
        const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A:K');
        if (!sheetData || sheetData.length === 0) {
            throw new Error('The vendingShop sheet is empty or could not be read.');
        }

        const headerRow = sheetData[0];
        const rows = sheetData.slice(1);

        // Ensure the header contains a "Date" column
        const dateColumnIndex = headerRow.indexOf('DATE');
        if (dateColumnIndex === -1) {
            throw new Error('The vendingShop sheet does not contain a DATE column.');
        }

        // Filter rows marked as "Old Stock"
        const oldStockRows = rows.filter(row => row[dateColumnIndex]?.toLowerCase() === 'old stock');
        if (oldStockRows.length === 0) {
            throw new Error('No rows marked as "Old Stock" found in the vendingShop sheet.');
        }

        // Add items to the vending inventory
        for (const row of oldStockRows) {
            const [characterName, itemName, stockQty] = row;
            const quantity = parseInt(stockQty, 10);

            if (!itemName || isNaN(quantity)) {
                console.warn(`[handleVendingSync]: Skipping invalid row: ${JSON.stringify(row)}`);
                continue;
            }

            await addItemToVendingInventory(characterName.toLowerCase(), {
                characterName,
                itemName,
                stockQty: quantity,
                date: new Date(),
            });
        }

        // Mark the character as synced
        await updateCharacterById(character._id, { vendingSync: true });

        // Reply with success
        await interaction.reply({
            content: `✅ Successfully synced **${oldStockRows.length} items** from "Old Stock" for **${characterName}**.`,
            ephemeral: true,
        });
    } catch (error) {
        console.error('[handleVendingSync]: Error syncing vending inventory:', error);
        await interaction.reply({
            content: `❌ An error occurred while syncing: ${error.message}`,
            ephemeral: true,
        });
    }
}


module.exports = {
    executeVending,
    viewVendingStock,
    handleViewShop,
    handleShopLink,
    handleVendingSetup,
    createVendingSetupEmbed,
    handleFulfill,
    handleEditShop, 
    initializeReactionHandler,
    handlePouchUpgrade,
    handleVendingSync,
    connectToVendingDatabase
};
