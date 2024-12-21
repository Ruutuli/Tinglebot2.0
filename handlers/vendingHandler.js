// ------------------- Import necessary modules -------------------
const {
    EmbedBuilder,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    InteractionType,
} = require("discord.js");
const { fetchCharacterByNameAndUserId, updateCharacterById } = require("../database/characterService");
const { fetchItemByName, addItemInventoryDatabase, removeItemInventoryDatabase } = require("../database/itemService");
const { connectToTinglebot } = require("../database/connection");
const {    getCurrentVendingStockList,    updateItemStockByName,    VILLAGE_IMAGES,    VILLAGE_ICONS,} = require("../database/vendingService");
const { getAllVillages } = require("../modules/locationsModule");
const { authorizeSheets, isValidGoogleSheetsUrl, extractSpreadsheetId, fetchSheetData, appendSheetData, getSheetIdByTitle, readSheetData } = require('../utils/googleSheetsUtils'); // Ensure these are imported
const { submissionStore } = require('../utils/storage'); // Store user selections temporarily



const VendingInventory = require('../models/VendingModel'); // Database model for the vending shop
const Character = require('../models/CharacterModel');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const sheets = google.sheets({ version: 'v4'});


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

        console.info(`[vendingHandler]: Executing subcommand '${subcommand}' for user ID ${userId}.`);

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

// ------------------- Handle the collect_points subcommand -------------------
async function handleCollectPoints(interaction, userId) {
    try {
        const characterName = interaction.options.getString("charactername");
        const character = await fetchCharacterByNameAndUserId(characterName, userId);

        if (!character) throw new Error(`Character '${characterName}' not found for user ID ${userId}.`);

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentMonthName = currentDate.toLocaleString("default", { month: "long" });
        const currentDay = currentDate.getDate();

        if (currentDay < 1 || currentDay > 21) {
            throw new Error(`Points can only be collected between the 1st and 5th of the month. Current day: ${currentDay}`);
        }

        if (character.lastCollectedMonth === currentMonth) {
            const embed = new EmbedBuilder()
                .setTitle("📅 Points Already Collected")
                .setDescription(`The Vendor's Guild Records show that **${character.name}** has already collected points for **${currentMonthName}**.`)
                .setColor("#FF0000")
                .setThumbnail(character.iconURL)
                .setImage(DEFAULT_IMAGE_URL);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Update character points
        const updatedPoints = (character.vendingPoints || 0) + MONTHLY_VENDING_POINTS;
        await updateCharacterById(character._id, { vendingPoints: updatedPoints, lastCollectedMonth: currentMonth });

        const embed = new EmbedBuilder()
            .setTitle("✅ Monthly Points Collected")
            .setDescription(`The Vendors Guild has credited **${character.name}** with **${MONTHLY_VENDING_POINTS}** points for **${currentMonthName}**!\n\n**Current Points:** ${updatedPoints}`)
            .setColor("#25c059")
            .setImage(DEFAULT_IMAGE_URL)
            .setThumbnail(character.iconURL);

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
async function handleRestock(interaction, userId) {
    console.info(`[vendingHandler]: Starting restock for user ID ${userId}.`);

    try {
        const characterName = interaction.options.getString("charactername");
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) throw new Error("Character not found.");

        const stockList = await getCurrentVendingStockList();
        const availableItems = stockList.stockList[capitalizeFirstLetter(character.currentVillage)]
            ?.filter((item) => item.vendingType === character.job);

        if (!availableItems || availableItems.length === 0) throw new Error("No items available.");

        const pouchSize = character.pouchSize || 3;
        const selectedItems = await handleItemSelection(interaction, availableItems, pouchSize);

        if (selectedItems.length === 0) {
            await interaction.reply({ content: `No items selected.`, ephemeral: true });
            return;
        }

        for (const item of selectedItems) {
            await triggerQuantityModal(interaction, item.itemName);
        }

        // Modal submissions will be handled by `handleModalSubmission`
    } catch (error) {
        console.error(`[vendingHandler]: Error during restock:`, error);
        if (!interaction.replied) {
            await interaction.reply({ content: `Error: ${error.message}`, ephemeral: true });
        }
    }
}


// ------------------- Handle Item Selection -------------------
// Handles the item selection process for all slots at once.
async function handleItemSelection(interaction, availableItems, pouchSize) {
    try {
        // Prepare dropdown menu options
        const options = availableItems.map((item) => ({
            label: item.itemName,
            value: item.itemName,
            description: `${item.itemName} - ${item.points} Points`,
        }));

        const dropdown = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId("selectItems")
                .setPlaceholder("Select up to 3 items")
                .addOptions(options)
                .setMinValues(1)
                .setMaxValues(Math.min(3, pouchSize))
        );

        // Check interaction state and defer or reply as needed
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
                content: `🛒 **Item Selection**\nChoose up to 3 items for your restock.`,
                components: [dropdown],
                ephemeral: true,
            });
        } else {
            await interaction.followUp({
                content: `🛒 **Item Selection**\nChoose up to 3 items for your restock.`,
                components: [dropdown],
                ephemeral: true,
            });
        }

        // Wait for user to make a selection
        const selection = await interaction.channel.awaitMessageComponent({
            filter: (i) => i.user.id === interaction.user.id,
            time: 60000,
        });

        await selection.deferUpdate();
        return availableItems.filter((item) => selection.values.includes(item.itemName));
    } catch (error) {
        console.error(`[handleItemSelection]: Error handling selection:`, error);
        if (!interaction.replied) {
            await interaction.followUp({ content: "❌ No selection made. Restock canceled.", ephemeral: true });
        }
        return [];
    }
}


// ------------------- Handle Item Quantity -------------------
// Handles the modal interaction to get the quantity of an item.
async function handleItemQuantity(interaction, item, itemNumber) {
    try {
        console.info(`[vendingHandler]: Preparing to trigger modal for item: ${item.itemName}.`);

        // Ensure interaction state is suitable for modal
        if (!interaction.deferred && !interaction.replied) {
            throw new Error("Interaction must be deferred or replied before triggering a modal.");
        }

        await triggerQuantityModal(interaction, item.itemName);

        // Await modal submission
        const modalSubmit = await interaction.awaitModalSubmit({
            filter: (i) => i.customId === `itemQuantity-${item.itemName}` && i.user.id === interaction.user.id,
            time: 60000,
        });

        const quantity = parseInt(modalSubmit.fields.getTextInputValue("quantityInput"), 10);
        if (isNaN(quantity) || quantity <= 0) {
            throw new Error("Invalid quantity provided.");
        }

        console.info(`[vendingHandler]: Modal submission received for ${item.itemName}. Quantity: ${quantity}`);
        await modalSubmit.deferUpdate();
        return quantity;
    } catch (error) {
        console.error(`[vendingHandler]: Error handling quantity for item ${item.itemName}:`, error);
        return null;
    }
}


// ------------------- Display Summary and Confirm -------------------
async function displaySummaryAndConfirm(interaction, submissionState) {
    const { selectedItems, totalPoints, characterName } = submissionState;

    const totalCost = selectedItems.reduce((sum, { item, quantity }) => sum + item.points * quantity, 0);
    if (totalCost > totalPoints) {
        await interaction.followUp({
            content: `❌ You do not have enough points to purchase these items.\n\n💰 **Total Cost**: ${totalCost} Points\n💳 **Available Points**: ${totalPoints}`,
            ephemeral: true,
        });
        return;
    }

    const summary = selectedItems
        .map(({ item, quantity }) => `- **${item.itemName}** x ${quantity} (${item.points * quantity} Points)`)
        .join("\n");

    const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("confirmRestock")
            .setLabel("Yes, Confirm")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId("cancelRestock")
            .setLabel("No, Cancel")
            .setStyle(ButtonStyle.Danger)
    );

    await interaction.followUp({
        content: `🛍️ **Restock Summary for ${characterName}:**\n\n${summary}\n\n💰 **Total Cost**: ${totalCost} Points\n\nDo you want to proceed?`,
        components: [confirmRow],
        ephemeral: true,
    });
}


// ------------------- Handle the barter subcommand -------------------
async function handleBarter(interaction, userId) {
    try {
        const buyerName = interaction.options.getString("buyername");
        const vendorName = interaction.options.getString("vendorname");
        const itemName = interaction.options.getString("item");

        const buyer = await fetchCharacterByNameAndUserId(buyerName, userId);
        const vendor = await fetchCharacterByNameAndUserId(vendorName, userId);
        if (!buyer || !vendor) throw new Error("Buyer or vendor not found.");

        const item = await fetchItemByName(buyer.inventory, itemName);
        if (!item) throw new Error(`${buyerName} does not have ${itemName} in their inventory.`);

        const price = item.points;
        if (vendor.vendingPoints < price) throw new Error(`${vendorName} does not have enough points to buy ${itemName}.`);

        await removeItemInventoryDatabase(buyer._id, itemName);
        await addItemInventoryDatabase(vendor._id, itemName);

        await updateCharacterById(buyer._id, { vendingPoints: buyer.vendingPoints + price });
        await updateCharacterById(vendor._id, { vendingPoints: vendor.vendingPoints - price });

        await interaction.reply({ content: `${buyerName} sold ${itemName} to ${vendorName} for ${price} points.`, ephemeral: true });
    } catch (error) {
        console.error("Error handling barter:", error);
        await interaction.reply({ content: `An error occurred during the barter: ${error.message}`, ephemeral: true });
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
async function handleViewShop(interaction, userId) {
    try {
        const characterName = interaction.options.getString("charactername");

        // Fetch character data
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) throw new Error(`Character '${characterName}' not found for user ID ${userId}.`);

        // Create an embed for shop details
        const shopEmbed = new EmbedBuilder()
            .setTitle(`🛍️ ${character.name}'s Shop Details`)
            .setDescription(`View the current details for **${character.name}**'s shop.`)
            .setColor("#AA926A")
            .addFields(
                { name: '💰 Vending Points', value: character.vendingPoints.toString(), inline: true },
                { name: '🛠️ Vendor Type', value: character.vendorType || 'None', inline: true },
                { name: '👜 Shop Pouch', value: character.shopPouch || 'None', inline: true },
                { name: '📅 Last Collected Month', value: character.lastCollectedMonth > 0 ? character.lastCollectedMonth.toString() : 'Not Collected', inline: true }
            )
            .setThumbnail(character.iconURL || DEFAULT_IMAGE_URL)
            .setFooter({ text: `Requested by ${interaction.user.username}`, iconURL: interaction.user.displayAvatarURL() });

        // Reply with the embed
        await interaction.reply({ embeds: [shopEmbed], ephemeral: false });
    } catch (error) {
        console.error(`[vendingHandler]: Error viewing shop for user ID ${userId}: ${error.message}`);
        await interaction.reply({
            content: `❌ An error occurred while fetching the shop details: ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- Sync Vending Items -------------------
const normalize = (value) => value?.toLowerCase().trim();

async function handleSyncVending(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });

        const characterName = interaction.options.getString('charactername');
        const userId = interaction.user.id;

        // Fetch the character by name and user ID
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            await interaction.editReply(`❌ Character '${characterName}' not found.`);
            return;
        }

        // Fetch the vending stock
        const stockList = await getCurrentVendingStockList();
        if (!stockList || !stockList.stockList) {
            await interaction.editReply(`❌ No stock data available.`);
            return;
        }

        // Match the character's current village with the stock list
        const normalizedVillage = normalize(character.currentVillage);
        const villageStock = stockList.stockList[normalizedVillage] || [];

        // Log retrieved data for debugging
        console.log(`[Sync Validation]: Normalized Village: "${normalizedVillage}"`);
        console.log(`[Sync Validation]: Stock for Village:`, villageStock);

        if (!villageStock || villageStock.length === 0) {
            await interaction.editReply(`❌ No stock data available for "${character.currentVillage}".`);
            return;
        }

        // Prepare for syncing
        const itemsToSync = [];
        const errors = [];
        const data = []; // Example data placeholder for input spreadsheet

        // Process and validate items
        for (const row of data) {
            const [itemName, stockQty, vendingType] = row;

            // Match the item in the stock
            const stockItem = villageStock.find(
                (item) => normalize(item.itemName) === normalize(itemName) && item.vendingType === vendingType
            );

            if (stockItem) {
                itemsToSync.push({ itemName, stockQty });
            } else {
                errors.push(`❌ **${itemName}** not found or invalid for village **${character.currentVillage}**.`);
            }
        }

        // Respond to the interaction
        await interaction.editReply({
            content: `✅ Synced Items:\n${itemsToSync.map(i => `- ${i.itemName} (Qty: ${i.stockQty})`).join('\n') || 'None'}\n\n` +
                     `⚠️ Errors:\n${errors.join('\n') || 'None'}`,
            ephemeral: true,
        });
    } catch (error) {
        console.error('[handleSyncVending]: Error:', error);
        await interaction.editReply('❌ An error occurred while syncing vending items. Please try again later.');
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
            'BOUGHT FROM', 'TOKEN PRICE', 'ART PRICE', 'OTHER PRICE', 'TRADES OPEN?', 'DATE', 'CONFIRMED SYNC'
        ];
        const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A1:L1');
        if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
            await sendSetupInstructions(interaction, 'missing_headers', character._id, characterName, shopLink);
            return;
        }

        // Determine pouch size based on type
        const pouchSizes = {
            bronze: 5,
            silver: 10,
            gold: 15,
            none: 3
        };
        const pouchSize = pouchSizes[pouch] || 3; // Default to 3 for "none"

        // Update character data
        await updateCharacterById(character._id, {
            shopLink,
            vendingType: character.job,
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

        // Log the file ID being checked
        console.log(`[vendingHandler]: Checking access for file ID: ${spreadsheetId}`);
        
        // Attempt to fetch spreadsheet details
        const response = await sheets.spreadsheets.get({ spreadsheetId });
        console.log(`[vendingHandler]: Spreadsheet access confirmed for file ID: ${spreadsheetId}`);
        return true; // If no error, access is confirmed
    } catch (error) {
        console.error(`[vendingHandler]: Error checking access for file ID: ${spreadsheetId}`, {
            fileId: spreadsheetId,
            error: error.response?.data || error.message,
        });
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
                '   ```\n   CHARACTER NAME | ITEM NAME | STOCK QTY | COST EACH | POINTS SPENT |\n   BOUGHT FROM | TOKEN PRICE | ART PRICE | OTHER PRICE | TRADES OPEN? |\n   DATE | CONFIRMED SYNC\n   ```',
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
            );
    }

    return embed;
};




module.exports = {
    executeVending,
    viewVendingStock,
    handleViewShop,
    handleSyncVending,
    handleShopLink,
    handleVendingSetup,
    createVendingSetupEmbed
};
