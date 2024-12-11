// ------------------- Import necessary modules and functions -------------------
const { EmbedBuilder } = require('discord.js');
const { getRandomColor } = require('../modules/formattingModule');
const { DEFAULT_IMAGE_URL } = require('./embedUtils');

// ------------------- Create setup instructions embed -------------------
const createSetupInstructionsEmbed = (characterName, googleSheetsUrl, errorMessage = '') => {
    const fields = [
        { name: '1. Open your Inventory Link', value: `[📄 Inventory](${googleSheetsUrl})` },
        { name: '2. Create a new tab named "loggedInventory".', value: '🔖' },
        { name: '3. Make sure there are headers for these ranges A1:M1 that read:', value: '```Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync```' },
        { name: '4. Share the Google Sheet with this email with edit permissions:', value: '📧 tinglebot@rotw-tinglebot.iam.gserviceaccount.com' },
        { name: `5. Use \`/testinventorysetup charactername:${characterName}\` to test if it's set up right.`, value: '✅' }
    ];

    if (errorMessage) {
        fields.push({ name: 'Error', value: `❌ **${errorMessage}**` });
    } else {
        fields.push({ name: 'Success', value: '🎉 Inventory is set up correctly! 🎉' });
    }

    return new EmbedBuilder()
        .setTitle(`📋 Setup Instructions for ${characterName}`)
        .setDescription(`Check that your inventory links are in one of these formats:
        \`\`\`
        https://docs.google.com/spreadsheets/d/1AbcDefGhijkLmnoPqrStuVwxYz0123456789/edit
        https://docs.google.com/spreadsheets/d/1AbcDefGhijkLmnoPqrStuVwxYz0123456789/view
        \`\`\`
        Please follow these steps to set up your Google Sheets inventory:`)
        .addFields(fields)
        .setColor(getRandomColor())
        .setTimestamp()
        .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Create sync embed -------------------
const createSyncEmbed = (characterName, googleSheetsUrl) => {
    const syncEmbed = new EmbedBuilder()
        .setTitle(`🔄 Sync Inventory for **${characterName}**`)
        .setDescription('Follow these steps to sync your character\'s inventory. Note: The sync can only be performed **once**.')
        .setColor(getRandomColor())
        .setTimestamp()
        .setFooter({ text: 'This process may take time, especially if your character has many items!' })
        .setImage(DEFAULT_IMAGE_URL);

    const fields = [
        {
            name: '📄 Step 1: Open the Google Sheet',
            value: `Use [this link](${googleSheetsUrl}) to open your character's inventory sheet.`,
        },
        {
            name: '✂️ Step 2: Copy and Paste Your Inventory Items',
            value: 'Ensure each item in your inventory is listed as follows in the loggedInventory tab:\n```\nCharacter Name | Item Name | Quantity\n```',
        },
        {
            name: '📝 Step 3: Example Format',
            value: 'Each row should contain:\n- **Character Name**\n- **Item Name**\n- **Quantity**\nExample:\n```\nTingle | Palm Fruit | 47\n```',
        },
        {
            name: '⚠️ Step 4: Important Notes',
            value: '- This sync can only be performed once. Ensure all items are listed before confirming.\n- Do not edit the "loggedInventory" sheet after syncing.',
        },
        {
            name: '🔍 Step 5: Exact Formatting',
            value: 'Items must be EXACTLY as they are on the website. Check [this sheet](https://docs.google.com/spreadsheets) for the correct format.',
        },
        {
            name: '✅ Confirm Sync',
            value: 'When ready, confirm the sync by clicking **Yes**.',
        }
    ];

    fields.forEach(field => {
        syncEmbed.addFields({ name: field.name, value: field.value });
    });

    return syncEmbed;
};

// ------------------- Edit sync message with final summary -------------------
const editSyncMessage = async (interaction, characterName, totalSyncedItemsCount, skippedLinesDetails, timestamp) => {
    try {
        const inventoryLink = `https://docs.google.com/spreadsheets/d/${interaction.guildId}/edit`; // Replace with actual inventory URL logic

        let skippedLinesMessage = '';
        if (skippedLinesDetails.length > 0) {
            skippedLinesMessage = '**Skipped Lines:**\n' +
                skippedLinesDetails.map((detail) => `- ${detail.reason}`).join('\n') +
                '\n\n⚠️ Please double-check the spelling or formatting of these items in your sheet. Please let a mod know if any lines were skipped!';
        }

        const finalMessage = `✅ **Sync completed for ${characterName}!**\n\n` +
            `**${totalSyncedItemsCount} lines synced**\n` +
            `${skippedLinesDetails.length > 0 ? `${skippedLinesDetails.length} skipped` : 'No lines skipped.'}\n\n` +
            `${skippedLinesMessage}\n\n` +
            `[📄 **View Inventory**](${inventoryLink})\n\n` +
            `*Synced on ${timestamp}.*`;

        await interaction.editReply({
            content: finalMessage,
            embeds: [],
            components: [],
        });
    } catch (error) {
        console.error(`Error editing sync completion message: ${error.message}`);
        throw error;
    }
};


// ------------------- Edit message for sync error -------------------
const editSyncErrorMessage = async (interaction, errorMessage) => {
    try {
        await interaction.editReply({
            content: errorMessage,
            embeds: [],
            components: []
        });
    } catch (error) {
        console.error(`Error editing sync error message: ${error.message}`);
        throw error;
    }
};

// ------------------- Create token tracker setup embed -------------------
const createTokenTrackerSetupEmbed = (username, googleSheetsUrl, errorMessage = '') => {
    const fields = [
        { name: '1. Open your Token Tracker Link', value: `[📄 Token Tracker](${googleSheetsUrl})` },
        { name: '2. Create a new tab named "Token Tracker".', value: '🔖' },
        { name: '3. Make sure there are headers for these ranges B7:G7 that read:', value: '```EARNED, SUBMISSION, LINK, CATEGORIES, TOKEN AMOUNT, PURCHASE NAME, TOKEN AMOUNT```' },
        { name: '4. Share the Google Sheet with this email with edit permissions:', value: '📧 tinglebot@rotw-tinglebot.iam.gserviceaccount.com' },
        { name: `5. Use \`/testtokentracker username:${username}\` to test if it's set up correctly.`, value: '✅' }
    ];

    if (errorMessage) {
        fields.push({ name: 'Error', value: `❌ **${errorMessage}**` });
    } else {
        fields.push({ name: 'Success', value: '🎉 Token Tracker is set up correctly! 🎉' });
    }

    return new EmbedBuilder()
        .setTitle(`📋 Setup Instructions for ${username}`)
        .setDescription(`Ensure your token tracker link is formatted as follows:
        \`\`\`
        https://docs.google.com/spreadsheets/d/1AbcDefGhijk/edit
        \`\`\`
        Follow these steps to set up your Google Sheets token tracker:`)
        .addFields(fields)
        .setColor(getRandomColor())
        .setTimestamp()
        .setImage(DEFAULT_IMAGE_URL);
};

// ------------------- Export the functions -------------------
module.exports = {
    createSetupInstructionsEmbed,
    editSyncMessage,
    createSyncEmbed,
    editSyncErrorMessage,
    createTokenTrackerSetupEmbed,
};

/**
 * Key Improvements:
 * 1. Simplified comments and structured code for better readability.
 * 2. Grouped related fields logically in each embed creation.
 * 3. Enhanced formatting for user-facing messages and instructions.
 */
