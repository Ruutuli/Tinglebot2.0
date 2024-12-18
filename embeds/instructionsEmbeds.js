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
            value: 'Items must be EXACTLY as they are on the website. Check [this sheet](https://docs.google.com/spreadsheets/d/1pu6M0g7MRs5L2fkqoOrRNTKRmYB8d29j0EtDrQzw3zs/edit?usp=sharing) for the correct format.',
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
const editSyncMessage = async (interaction, characterName, totalSyncedItemsCount, skippedLinesDetails, timestamp, characterInventoryLink) => {
    try {
        // Validate that the inventory link is valid
        const validatedLink = characterInventoryLink && characterInventoryLink.startsWith('http')
            ? characterInventoryLink
            : 'https://docs.google.com/spreadsheets'; // Default fallback URL

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
            `> [View Inventory](${validatedLink})\n\n` +
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
        { 
            name: '1. Open the Example Template', 
            value: `[📄 Token Tracker Example Template](https://docs.google.com/spreadsheets/d/1zAEqKbAMEdV0oGz7lNAhHaAPt_eIseMMSnyIXr-hovc/edit?usp=sharing)` 
        },
        { 
            name: '2. Make a Copy of the Template', 
            value: '🔖 Go to **File > Make a Copy** in the menu to create your own sheet.' 
        },
        { 
            name: '3. Create a New Tab Named "loggedTracker"', 
            value: '📂 Ensure you have a tab named exactly `loggedTracker` in your Google Sheet.' 
        },
        { 
            name: '4. Add Headers to Your Tracker', 
            value: `Ensure these headers are present in the in these cells of the **loggedTracker** tab B7:F7:
            \`\`\`SUBMISSION | LINK | CATEGORIES | TYPE | TOKEN AMOUNT
            \`\`\`` 
        },
        { 
            name: '5. Share Your Google Sheet', 
            value: '📧 Share the sheet with this email address with **edit permissions**:\n`tinglebot@rotw-tinglebot.iam.gserviceaccount.com`' 
        },
        { 
            name: `6. Test Your Setup`, 
            value: `✅ Use the command \`/tokens test\` to check if your token tracker is set up correctly for **${username}**.` 
        }
    ];

    if (errorMessage) {
        fields.push({ 
            name: 'Error', 
            value: `❌ **${errorMessage}**` 
        });
    } else {
        fields.push({ 
            name: 'Success', 
            value: '🎉 Your token tracker setup appears to be correct! 🎉' 
        });
    }

    return new EmbedBuilder()
        .setTitle(`📋 Setup Instructions for ${username}`)
        .setDescription(`Follow these steps to set up your Google Sheets token tracker:
        
        **Ensure your Google Sheets URL follows this format:**
        \`\`\`
        https://docs.google.com/spreadsheets/d/1AbcDefGhijk/edit
        \`\`\`
        Make sure all steps are completed before testing.`)
        .addFields(fields)
        .setColor(getRandomColor())
        .setTimestamp()
        .setFooter({ text: 'Need help? Contact a mod for assistance!' });
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
