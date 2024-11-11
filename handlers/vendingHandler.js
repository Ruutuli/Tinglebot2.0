// ------------------- Import necessary modules -------------------
const { fetchCharacterByNameAndUserId, updateCharacterById } = require("../database/characterService");
const { fetchItemByName, addItemInventoryDatabase, removeItemInventoryDatabase } = require("../database/itemService");
const { connectToTinglebot } = require("../database/connection");
const {
    getCurrentVendingStockList,
    updateItemStockByName,
    VILLAGE_IMAGES,
    VILLAGE_ICONS,
} = require("../database/vendingService");
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
const { getAllVillages } = require("../modules/locationsModule");

const DEFAULT_IMAGE_URL = "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
const MONTHLY_VENDING_POINTS = 500;

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
                throw new Error("Invalid vending command.");
        }
    } catch (error) {
        console.error("Error executing vending command:", error);
        await interaction.reply({
            content: `An error occurred while processing the vending command: ${error.message}`,
            ephemeral: true,
        });
    }
}

// ------------------- Handle the collect_points subcommand -------------------
async function handleCollectPoints(interaction, userId) {
    try {
        const characterName = interaction.options.getString("charactername");
        const character = await fetchCharacterByNameAndUserId(characterName, userId);

        if (!character) throw new Error("Character not found.");

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentMonthName = currentDate.toLocaleString("default", { month: "long" });
        const currentDay = currentDate.getDate();

        if (currentDay < 1 || currentDay > 5) throw new Error("Points can only be collected between the 1st and 5th of each month.");
        if (character.lastCollectedMonth === currentMonth) {
            const embed = new EmbedBuilder()
                .setTitle("Points Already Collected")
                .setDescription(`The Vendor's Guild Records show that **${character.name}** has already collected points for the month of ${currentMonthName}!`)
                .setColor("#FF0000")
                .setThumbnail(character.iconURL)
                .setImage(DEFAULT_IMAGE_URL);

            await interaction.reply({ embeds: [embed], ephemeral: true });
            return;
        }

        // Update character with new points and last collected month
        const updatedPoints = (character.vendingPoints || 0) + MONTHLY_VENDING_POINTS;
        await updateCharacterById(character._id, { vendingPoints: updatedPoints, lastCollectedMonth: currentMonth });

        const embed = new EmbedBuilder()
            .setTitle("Monthly Points Collected")
            .setDescription(`The Vendors Guild provides **${character.name}** with their ${currentMonthName} Monthly credit! Happy restocking!\n\n**Current Points:** ${updatedPoints}`)
            .setColor("#AA926A")
            .setImage(DEFAULT_IMAGE_URL)
            .setThumbnail(character.iconURL);

        await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
        console.error("Error collecting points:", error);
        const currentMonthName = new Date().toLocaleString("default", { month: "long" });
        const embed = new EmbedBuilder()
            .setTitle("Error Collecting Points")
            .setDescription(`The Vendor's Guild Records show that **${characterName}** has already collected points for the month of ${currentMonthName}!`)
            .setColor("#FF0000")
            .setImage(DEFAULT_IMAGE_URL);

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

// ------------------- Handle the restock subcommand -------------------
async function handleRestock(interaction, userId) {
    try {
        const characterName = interaction.options.getString("charactername");
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) throw new Error("Character not found.");
        if (!character.vendingPoints) {
            await updateCharacterById(character._id, { vendingPoints: MONTHLY_VENDING_POINTS });
            character.vendingPoints = MONTHLY_VENDING_POINTS;
        }

        const stockList = await getCurrentVendingStockList();
        const villageName = capitalizeFirstLetter(character.currentVillage);
        const villageStock = stockList.stockList[villageName];
        const availableItems = villageStock.filter((item) => item.vendingType === character.job);

        if (!availableItems || availableItems.length === 0) throw new Error("No items available for your village.");

        const itemOptions = availableItems.map((item) => ({
            label: `${item.itemName}`,
            value: item.itemName,
            description: `${item.itemName} - ${item.points} Points`,
        }));

        const limitedItems = stockList.limitedItems.map((item) => ({
            label: `${item.itemName}`,
            value: `limited-${item.itemName}`,
            description: `${item.itemName} - ${item.points} Points - qty: ${item.stock}`,
        }));

        const maxOptions = 25;
        const allOptions = [...itemOptions, ...limitedItems];
        const splitOptions = [];
        while (allOptions.length > 0) splitOptions.push(allOptions.splice(0, maxOptions));

        const actionRows = splitOptions.map((options) =>
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("selectItem")
                    .setPlaceholder("Select items to restock")
                    .addOptions(options)
            )
        );

        const completeRestockButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("completeRestock")
                .setLabel("Complete Restock")
                .setStyle(ButtonStyle.Success)
        );

        await interaction.reply({
            content: `Select items to restock for **${character.name}**:`,
            components: [...actionRows, completeRestockButtonRow],
            ephemeral: false,
        });

        const filter = (i) => i.user.id === userId;
        const collector = interaction.channel.createMessageComponentCollector({
            filter,
            time: 60000,
        });

        const selectedItems = [];

        collector.on("collect", async (i) => {
            if (i.customId === "selectItem") {
                const selectedItem = i.values[0];
                let isLimited = false;
                let itemData;

                if (selectedItem.startsWith("limited-")) {
                    const limitedItemName = selectedItem.slice(8);
                    itemData = stockList.limitedItems.find((item) => item.itemName === limitedItemName);
                    isLimited = true;
                } else {
                    itemData = availableItems.find((item) => item.itemName === selectedItem);
                }

                if (!itemData) {
                    await i.reply({ content: "Item not found.", ephemeral: true });
                    return;
                }

                const quantityModal = new ModalBuilder()
                    .setCustomId(`quantityModal-${itemData.itemName}`)
                    .setTitle(`Enter Quantity for ${itemData.itemName}`);

                const quantityInput = new TextInputBuilder()
                    .setCustomId("quantityInput")
                    .setLabel("Quantity")
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`Enter quantity (max: ${isLimited ? itemData.stock : '∞'})`)
                    .setRequired(true);

                quantityModal.addComponents(new ActionRowBuilder().addComponents(quantityInput));
                await i.showModal(quantityModal);
            } else if (i.customId === "completeRestock") {
                const itemsList = selectedItems
                    .map((item) => `**${item.itemName}** - Quantity: ${item.quantity}`)
                    .join("\n");

                const restockEmbed = new EmbedBuilder()
                    .setTitle("Restock Completed")
                    .setDescription(itemsList ? `Here are your restocked items:\n\n${itemsList}` : "No items were selected.")
                    .setColor("#AA926A")
                    .setThumbnail(character.iconURL);

                await i.update({ embeds: [restockEmbed], components: [], ephemeral: false });
                collector.stop();
            }
        });

        interaction.client.on("interactionCreate", async (modalInteraction) => {
            if (modalInteraction.type === InteractionType.ModalSubmit && modalInteraction.customId.startsWith("quantityModal-")) {
                const itemName = modalInteraction.customId.slice(14);
                const quantity = parseInt(modalInteraction.fields.getTextInputValue("quantityInput"), 10);

                const itemData = availableItems.find((item) => item.itemName === itemName) || stockList.limitedItems.find((item) => item.itemName === itemName);
                const isLimited = stockList.limitedItems.includes(itemData);

                if (isNaN(quantity) || quantity < 1 || (isLimited && quantity > itemData.stock)) {
                    await modalInteraction.reply({ content: `Invalid quantity. Please enter a number between 1 and ${itemData.stock}.`, ephemeral: true });
                    return;
                }

                const totalCost = itemData.points * quantity;
                if (character.vendingPoints < totalCost) {
                    await modalInteraction.reply({ content: `You do not have enough points. You need ${totalCost} points to purchase ${quantity} of ${itemName}.`, ephemeral: true });
                    return;
                }

                character.vendingPoints -= totalCost;
                await updateCharacterById(character._id, { vendingPoints: character.vendingPoints });

                if (isLimited) {
                    itemData.stock -= quantity;
                    await updateItemStockByName(itemData.itemName, itemData.stock);
                }

                selectedItems.push({ itemName: itemName, quantity });

                await modalInteraction.reply({ content: `Bought **${itemName}** x ${quantity}! You spent ${totalCost} points! You have ${character.vendingPoints} points left.`, ephemeral: true });

                if (character.vendingPoints <= 0) {
                    collector.stop();
                    await interaction.editReply({ content: `You have run out of points. Restock completed.`, components: [] });
                }
            }
        });
    } catch (error) {
        console.error("Error handling restock:", error);
        await interaction.reply({ content: `An error occurred during restock: ${error.message}`, ephemeral: true });
    }
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

        const villageEmbeds = await Promise.all(Object.keys(stockList.stockList).map((village) => {
            const villageItems = stockList.stockList[village];
            const itemDescriptions = villageItems.map((item) => `**${item.itemName}**\n> Points: ${item.points}\n> Type: ${item.vendingType}`);
            const description = itemDescriptions.length ? itemDescriptions.join("\n\n") : "No items available for this village.";

            return new EmbedBuilder()
                .setTitle(`${village} ${currentMonthName} Vending Stock`)
                .setDescription(description)
                .setColor("#AA926A")
                .setThumbnail(VILLAGE_ICONS[village])
                .setImage(VILLAGE_IMAGES[village]);
        }));

        const limitedItems = stockList.limitedItems.map((item) => `**${item.itemName}**\n> Points: ${item.points}\n> Stock: ${item.stock}`);
        const limitedEmbed = new EmbedBuilder()
            .setTitle(`Limited Items for ${currentMonthName} ${currentYear}`)
            .setDescription(limitedItems.join("\n\n"))
            .setColor("#FFD700")
            .setImage(DEFAULT_IMAGE_URL);

        await interaction.editReply({ content: `Vending: ${currentMonthName} ${currentYear}`, embeds: [...villageEmbeds, limitedEmbed] });
    } catch (error) {
        console.error("Error viewing vending stock:", error);
        await interaction.editReply({ content: `An error occurred while viewing the vending stock: ${error.message}`, ephemeral: true });
    }
}

// ------------------- Helper function to capitalize the first letter of a string -------------------
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

module.exports = {
    executeVending,
    viewVendingStock,
};
