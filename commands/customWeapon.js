// ------------------- /customweapon Command -------------------
// ------------------- Standard Libraries -------------------
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

// ------------------- Database Connections -------------------
const { connectToInventories } = require('../database/connection');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId, updateCharacterById, getCharacterInventoryCollection } = require('../database/characterService');
const { fetchItemByName, fetchValidWeaponSubtypes } = require('../database/itemService');


// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials, removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { appendSheetData, authorizeSheets, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { retrieveSubmissionFromStorage, saveSubmissionToStorage, deleteSubmissionFromStorage } = require('../utils/storage');
const { uploadSubmissionImage } = require('../utils/uploadUtils');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const { checkAndUseStamina } = require('../modules/characterStatsModule')
const { formatDateTime } = require('../modules/formattingModule');

// ------------------- Database Models -------------------
const ItemModel = require('../models/ItemModel');

// ------------------- Export Command Module -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('customweapon')
        .setDescription('Commands for managing custom weapons.')

        // ------------------- Create Command -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Craft an approved custom weapon.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The character crafting the weapon.')
                        .setRequired(true)
                        .setAutocomplete(true) // Autocomplete for character names
                )
                .addStringOption(option =>
                    option
                        .setName('weaponid')
                        .setDescription('The ID of the approved custom weapon.')
                        .setRequired(true)
                )
        )

        // ------------------- Submit Command -------------------
        .addSubcommand(subcommand =>
            subcommand
                .setName('submit')
                .setDescription('Submit a custom weapon for approval.')
                .addStringOption(option =>
                    option
                        .setName('charactername')
                        .setDescription('The character proposing the weapon.')
                        .setRequired(true)
                        .setAutocomplete(true) // Autocomplete for character names
                )
                .addStringOption(option =>
                    option
                        .setName('weaponname')
                        .setDescription('The name of the custom weapon.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('baseweapon')
                        .setDescription('The base weapon the custom weapon is based on.')
                        .setRequired(true)
                        .setAutocomplete(true) // Autocomplete for base weapons
                )
                .addStringOption(option =>
                    option
                        .setName('modifiers')
                        .setDescription('Modifiers of the weapon.')
                        .setRequired(true)
                        .addChoices(
                            { name: '1', value: '1' },
                            { name: '2', value: '2' },
                            { name: '3', value: '3' },
                            { name: '4', value: '4' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('type')
                        .setDescription('The type of weapon (1h/2h).')
                        .setRequired(true)
                        .addChoices(
                            { name: '1h', value: '1h' },
                            { name: '2h', value: '2h' }
                        )
                )
                .addStringOption(option =>
                    option
                        .setName('subtype')
                        .setDescription('The subtype of the weapon (e.g., hammer, sword).')
                        .setRequired(true)
                        .setAutocomplete(true) // Autocomplete for subtypes
                )
                .addStringOption(option =>
                    option
                        .setName('description')
                        .setDescription('A description of the custom weapon.')
                        .setRequired(true)
                )
                .addAttachmentOption(option =>
                    option
                        .setName('image')
                        .setDescription('An image file of the custom weapon.')
                        .setRequired(true)
                )
        )
// ------------------- Approve Command -------------------
.addSubcommand(subcommand =>
    subcommand
        .setName('approve')
        .setDescription('Approve a proposed custom weapon. [Admins Only]')
        .addStringOption(option =>
            option
                .setName('weaponid')
                .setDescription('The ID of the custom weapon to approve.')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('staminatocraft')
                .setDescription('The stamina required to craft the weapon.')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('materialstocraft')
                .setDescription('Materials required to craft the weapon, formatted as item x1, item x2, etc.')
                .setRequired(true)
        )
),

// ------------------- Command Execution Logic -------------------

async execute(interaction) {
    try {
        // Defer reply early for long-running commands
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: false });
        }

        const subcommand = interaction.options.getSubcommand();

// ------------------- Create Custom Weapon -------------------
if (subcommand === 'create') {
    const characterName = interaction.options.getString('charactername');
    const weaponId = interaction.options.getString('weaponid');
    const userId = interaction.user.id;

    // Fetch Character
    let character;
    try {
        character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            await interaction.editReply({
                content: `❌ Character **${characterName}** not found.`,
                ephemeral: true,
            });
            return;
        }
    } catch (error) {
        console.error(`[customweapon create]: Error fetching character ${characterName}:`, error);
        await interaction.editReply({
            content: `❌ An error occurred while retrieving character data. Please try again later.`,
            ephemeral: true,
        });
        return;
    }

// Retrieve Submission
const weaponSubmission = retrieveSubmissionFromStorage(weaponId);

if (!weaponSubmission || weaponSubmission.status !== 'approved') {
    console.error(`[customweapon create]: Submission not found or not approved. Status: ${weaponSubmission?.status}`);
    await interaction.editReply({
        content: `❌ Approved custom weapon not found.`,
        ephemeral: true,
    });
    return;
}


// ✅ Prevent reuse of crafted weapons
if (weaponSubmission.crafted === true) {
    await interaction.editReply({
        content: `❌ This weapon has already been crafted and cannot be crafted again.`,
        ephemeral: true,
    });
    return;
}


    // ------------------- Ensure Only the Submitting Character Can Craft -------------------
    if (weaponSubmission.characterName !== characterName) {
        await interaction.editReply({
            content: `❌ Only **${weaponSubmission.characterName}** can craft this weapon.`,
            ephemeral: true,
        });
        return;
    }

    // Fetch Inventory
    let inventoryItems;
    try {
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        inventoryItems = await inventoryCollection.find({ characterId: character._id }).toArray();
    } catch (error) {
        console.error(`[customweapon create]: Failed to fetch inventory for ${characterName}:`, error);
        await interaction.editReply({
            content: `❌ Unable to access **${characterName}**'s inventory. Please ensure it is properly synced.`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Check for Blueprint Voucher -------------------
    const hasBlueprintVoucher = inventoryItems.some(item => item.itemName === "Blueprint Voucher" && item.quantity > 0);
    if (!hasBlueprintVoucher) {
        await interaction.editReply({
            content: `❌ You need **1 Blueprint Voucher** to craft this weapon.`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Check Star Fragments -------------------
    const totalStarFragments = inventoryItems
        .filter(item => item.itemName === 'Star Fragment')
        .reduce((sum, item) => sum + item.quantity, 0);
    if (totalStarFragments < 1) {
        await interaction.editReply({
            content: `❌ You need **1 Star Fragment** to craft this weapon.`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Check Stamina -------------------
    if (character.currentStamina < weaponSubmission.staminaToCraft) {
        await interaction.editReply({
            content: `❌ Insufficient stamina. You need **${weaponSubmission.staminaToCraft}** stamina to craft this weapon.`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Check Required Materials -------------------
    const missingMaterials = [];
    for (const material of weaponSubmission.craftingMaterials) {
        const totalAvailable = inventoryItems
            .filter(item => item.itemName === material.itemName)
            .reduce((sum, item) => sum + item.quantity, 0);

        if (totalAvailable < material.quantity) {
            missingMaterials.push(`${material.itemName} (Need: ${material.quantity}, Have: ${totalAvailable})`);
        }
    }

    if (missingMaterials.length > 0) {
        await interaction.editReply({
            content: `❌ You are missing required materials:\n${missingMaterials.join('\n')}`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Process Materials & Remove Inventory -------------------
// ✅ Begin Transaction-safe Crafting
let materialsRemoved = false;
let staminaDeducted = false;

try {
    // ------------------- Process Materials & Remove Inventory -------------------
    await processMaterials(interaction, character, inventoryItems, { craftingMaterial: weaponSubmission.craftingMaterials }, 1);
    await removeItemInventoryDatabase(character._id, 'Star Fragment', 1, interaction);
    await removeItemInventoryDatabase(character._id, 'Blueprint Voucher', 1, interaction);

    materialsRemoved = true;

    // Log stamina before and after deduction
    const oldStamina = character.currentStamina;
    await checkAndUseStamina(character, weaponSubmission.staminaToCraft);
    staminaDeducted = true;

    // Fetch character again to get updated stamina
    const updatedCharacter = await fetchCharacterByNameAndUserId(character.name, character.userId);
    const newStamina = updatedCharacter?.currentStamina;

} catch (error) {
    console.error(`[customweapon create]: Transaction error:`, error);

    if (materialsRemoved) {
        await addItemInventoryDatabase(character._id, weaponSubmission.craftingMaterials, 1);
        await addItemInventoryDatabase(character._id, [{ itemName: 'Star Fragment', quantity: 1 }], 1);
        await addItemInventoryDatabase(character._id, [{ itemName: 'Blueprint Voucher', quantity: 1 }], 1);
    }

    if (staminaDeducted) {
        await updateCharacterById(character._id, {
            $inc: { currentStamina: weaponSubmission.staminaToCraft }
        });
        console.log(`[customweapon create]: Rolled back ${weaponSubmission.staminaToCraft} stamina for ${character.name}.`);
    }

    await interaction.editReply({
        content: `❌ Crafting failed. Materials and stamina have been restored. Error: ${error.message}`,
        ephemeral: true,
    });
    return;
}


    // ------------------- Add Custom Weapon to Inventory -------------------
    try {
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        const newInventoryItem = {
            characterId: character._id,
            itemName: weaponSubmission.weaponName,
            itemId: weaponSubmission.itemId,
            quantity: 1,
            category: 'Custom Weapon',
            type: weaponSubmission.type,
            subtype: weaponSubmission.subtype,
            location: character.currentVillage || 'Unknown',
            date: new Date(),
            obtain: 'Custom Weapon',
            synced: uuidv4(),
        };

// ✅ Mark weaponSubmission as crafted
weaponSubmission.crafted = true;
saveSubmissionToStorage(weaponId, weaponSubmission);

await inventoryCollection.insertOne(newInventoryItem);

// ✅ Delete submission from storage after crafting is finalized
deleteSubmissionFromStorage(weaponId);

        // ------------------- Log Crafted Weapon to Google Sheets -------------------
try {
    const auth = await authorizeSheets();
    const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
    const range = 'loggedInventory!A2:M';
    const uniqueSyncId = uuidv4();
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
    const formattedDateTime = formatDateTime(new Date());

// 🛠️ Fetch actual item details from DB for accurate category/type/subtype
const item = await fetchItemByName(weaponSubmission.weaponName);

const values = [
  [
    character.name,
    weaponSubmission.weaponName,
    '1',
    item?.category?.join(', ') || 'Unknown',
    item?.type?.join(', ') || 'Unknown',
    item?.subtype?.join(', ') || 'Unknown',
    'Custom Weapon',
    character.job || '',
    '',
    character.currentVillage,
    interactionUrl,
    formattedDateTime,
    uniqueSyncId
  ]
];

    await appendSheetData(auth, spreadsheetId, range, values);

// 🛠️ Append Star Fragment and Blueprint Voucher to materials for proper logging
const fullMaterialsUsed = await Promise.all([
    ...weaponSubmission.craftingMaterials.map(async (mat) => {
        const dbItem = await ItemModel.findOne({ itemName: mat.itemName });
        const emoji = dbItem?.emoji || ':small_blue_diamond:';
        return `> ${emoji} **${mat.itemName}** x${mat.quantity}`;
    }),
    (async () => {
        const blueprintItem = await ItemModel.findOne({ itemName: 'Blueprint Voucher' });
        const blueprintEmoji = (blueprintItem?.itemName === 'Blueprint Voucher' || !blueprintItem?.emoji || blueprintItem.emoji.trim() === '') 
    ? ':small_blue_diamond:' 
    : blueprintItem.emoji;
        return `> ${blueprintEmoji} **Blueprint Voucher** x1`;
    })()
]);


await logMaterialsToGoogleSheets(
    auth,
    spreadsheetId,
    range,
    character,
    [...weaponSubmission.craftingMaterials, { itemName: 'Blueprint Voucher', quantity: 1 }],
    newInventoryItem,
    interactionUrl,
    formattedDateTime
  );
  
} catch (error) {
    console.error(`[customweapon create]: Failed to log Google Sheets crafting entry:`, error);
}

    } catch (error) {
        console.error(`[customweapon create]: Failed to add ${weaponSubmission.weaponName} to inventory:`, error);
        await interaction.editReply({
            content: `❌ Failed to add the custom weapon **${weaponSubmission.weaponName}** to the inventory.`,
            ephemeral: true,
        });
        return;
    }

// ------------------- Send Success Message -------------------
try {
    const updatedStamina = character.currentStamina;

   // Fetch material emojis from database
const fullMaterialsUsed = await Promise.all([
    ...weaponSubmission.craftingMaterials.map(async (mat) => {
        const dbItem = await ItemModel.findOne({ itemName: mat.itemName });
        const emoji = dbItem?.emoji || ':small_blue_diamond:'; // Default to diamond if no emoji found
        return `> ${emoji} **${mat.itemName}** x${mat.quantity}`;
    }),
    (async () => {
        const blueprintItem = await ItemModel.findOne({ itemName: 'Blueprint Voucher' });
        const blueprintEmoji = (blueprintItem?.itemName === 'Blueprint Voucher' || !blueprintItem?.emoji || blueprintItem.emoji.trim() === '') 
    ? ':small_blue_diamond:' 
    : blueprintItem.emoji;

        return `> ${blueprintEmoji} **Blueprint Voucher** x1`;
    })()
]);

// Create the 🎉 Congratulations! embed
const embed = {
    title: `🎉 Congratulations!`,
    description: `You have created your custom weapon, **${weaponSubmission.weaponName}**, with the help of a skilled crafter!! This item has been added to **${characterName}**'s inventory.`,
    color: 0xAA926A,
    thumbnail: { url: weaponSubmission.image },
    fields: [
        {
            name: `⚡ Stamina Cost`,
            value: `> ${weaponSubmission.staminaToCraft}`,
            inline: true,
        },
        {
            name: `💚 Remaining Stamina`,
            value: `> ${updatedStamina}`,
            inline: true,
        },
        {
            name: `📦 Materials Used`,
            value: fullMaterialsUsed.join('\n'),
            inline: false,
        },
        {
            name: `What’s next?`,
            value: `🛡️ Use the </gear:1306176789755858975> command to equip it and enjoy your new weapon.`,
            inline: false,
        },
    ],
    footer: { text: 'Enjoy your new weapon!' },
    image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
};

// Send the response with the embed
await interaction.editReply({ content: null, embeds: [embed] });

} catch (error) {
    console.error(`[customweapon create]: Error sending success embed:`, error);
}


 // ------------------- Submit Command -------------------

} else if (subcommand === 'submit') {

// Define submission date at the start of the subcommand
const submissionDate = new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
});

const characterName = interaction.options.getString('charactername');
const weaponName = interaction.options.getString('weaponname');
const baseWeapon = interaction.options.getString('baseweapon');
const modifiers = interaction.options.getString('modifiers');
const type = interaction.options.getString('type');
const subtype = interaction.options.getString('subtype');
const description = interaction.options.getString('description');
const imageAttachment = interaction.options.getAttachment('image'); // Retrieve the uploaded image
const weaponId = generateUniqueId('W');

// ------------------- Validate Non-Empty Content -------------------
if (!weaponName.trim() || !description.trim() || !subtype.trim()) {
    return interaction.editReply({
        content: `❌ Submission fields **Weapon Name**, **Description**, and **Subtype** must contain valid text and cannot be blank.`,
        ephemeral: true,
    });
}

// Fetch Character
try {
    const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    if (!character) {
        await interaction.editReply({ content: `❌ Character **${characterName}** not found.`, ephemeral: true });
        return;
    }

    // Fetch Character Inventory
    let inventoryItems;
    try {
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        inventoryItems = await inventoryCollection.find({ characterId: character._id }).toArray();
        if (!Array.isArray(inventoryItems) || inventoryItems.length === 0) {
            throw new Error('Inventory is empty or not synced.');
        }
    } catch (error) {
        console.error(`[customweapon submit]: Failed to fetch inventory for ${characterName}:`, error);
        await interaction.editReply({
            content: `❌ Unable to access **${characterName}**'s inventory. Please ensure it is properly synced.`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Check if Character Has "Blueprint Voucher" -------------------
    const hasBlueprintVoucher = inventoryItems.some(item => item.itemName === "Blueprint Voucher" && item.quantity > 0);

    if (!hasBlueprintVoucher) {
        await interaction.editReply({
            content: `❌ **${characterName}** does not have a **Blueprint Voucher** in their inventory. You need this item to submit a custom weapon!`,
            ephemeral: true,
        });
        return;
    }

    // Upload Image
    let uploadedImageUrl = null;
    if (imageAttachment) {
        try {
            const imageName = `${weaponName.replace(/\s+/g, '_')}_${weaponId}`; // Generate a unique name
            uploadedImageUrl = await uploadSubmissionImage(imageAttachment.url, imageName); // Upload to Google Cloud
        } catch (error) {
            console.error(`[customweapon submit]: Failed to upload image for ${weaponName}:`, error);
            return interaction.reply({
                content: '❌ Failed to upload the image. Please ensure the file is valid.',
                ephemeral: true,
            });
        }
    }

// ------------------- Duplicate Submission Check -------------------
const allSubmissions = getAllSubmissions(); 

// ❌ Check for duplicate weapon name globally (regardless of character)
const duplicateNameExists = allSubmissions.some(sub =>
    sub.weaponName.toLowerCase() === weaponName.toLowerCase() &&
    sub.status !== 'rejected'
);

// 🔒 Prevent submission if any existing non-rejected weapon has same name
if (duplicateNameExists) {
    return interaction.editReply({
        content: `❌ A custom weapon named **${weaponName}** has already been submitted or approved. Please choose a different name.`,
        ephemeral: true,
    });
}

// Check for duplicate weapon ID collision
const duplicateIdExists = allSubmissions.some(sub =>
    sub.itemId === weaponId
);

if (duplicateIdExists) {
    return interaction.editReply({
        content: `❌ Submission failed: The generated Weapon ID \`${weaponId}\` is already in use. Please try submitting again to generate a new ID.`,
        ephemeral: true,
    });
}

// 🔒 Prevent editing if the weaponId already exists and is approved or crafted
const existingSubmission = retrieveSubmissionFromStorage(weaponId);
if (existingSubmission && ['approved', 'crafted'].includes(existingSubmission.status)) {
    return interaction.editReply({
        content: `❌ This weapon submission has already been **approved** or **crafted**, and cannot be edited or resubmitted.`,
        ephemeral: true,
    });
}

    // Create Response Embed
    const embed = {
        title: `Custom Weapon Submission: ${weaponName}`,
        description: description || 'No description provided.',
        color: 0xAA926A, // Gold color
        thumbnail: { url: character.icon }, // Character icon as thumbnail
        fields: [
            { name: 'Submitted By', value: `<@${interaction.user.id}>`, inline: false },
            { name: 'Character', value: `> ${characterName}`, inline: false },
            { name: 'Weapon Name', value: `> ${weaponName}`, inline: false },
            { name: 'Base Weapon', value: `> ${baseWeapon}`, inline: false },
            { name: 'Modifiers', value: `> ${modifiers}`, inline: false },
            { name: 'Type', value: `> ${type}`, inline: false },
            { name: 'Subtype', value: `> ${subtype}`, inline: false },
            { name: 'Weapon ID', value: `\`\`\`${weaponId}\`\`\``, inline: false },
        ],
        image: uploadedImageUrl ? { url: uploadedImageUrl } : undefined, // Weapon image if available
        footer: { text: 'Your submission is pending moderator approval.' },
    };

    // Send Reply
    let submissionMessage;
    if (!interaction.replied && !interaction.deferred) {
        submissionMessage = await interaction.reply({
            content: `✅ Your custom weapon has been submitted successfully by <@${interaction.user.id}>! Awaiting <@&1330750652745519116> approval.`,
            embeds: [embed],
            fetchReply: true, // ✅ This allows us to capture the message ID
        });
    } else {
        submissionMessage = await interaction.editReply({
            content: `✅ Your custom weapon has been submitted successfully by <@${interaction.user.id}>! Awaiting <@&1330750652745519116> approval.`,
            embeds: [embed],
        });
    }

    // 🛠️ Save submission initially without notificationMessageId
saveSubmissionToStorage(weaponId, {
    characterName,
    weaponName,
    baseWeapon,
    modifiers,
    type,
    subtype,
    description,
    image: uploadedImageUrl || 'https://default.image.url/weapon.png',
    userId: interaction.user.id,
    itemId: weaponId,
    status: 'pending',
    submissionMessageId: submissionMessage?.id
});

      
    
    
// ------------------- Send Pending Submission Notification to Approval Channel -------------------
try {
    const notificationChannel = await interaction.client.channels.fetch('1347628427993153637');
    if (notificationChannel) {
        const submissionLink = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${submissionMessage.id}`;

        const notificationMessage = await notificationChannel.send({
            content: `🛠️ **Pending Custom Weapon Submission!**\n⏳ **Please approve within 24 hours!**\n📌 Submitted by <@${interaction.user.id}> on **${submissionDate}**.\n🔍 Awaiting approval!\n\n🆔 **Submission ID:** \`${weaponId}\`\n🔗 [View Submission](${submissionLink})`
        });

        // ✅ Safely update submission with notificationMessageId now
        const updatedSubmission = retrieveSubmissionFromStorage(weaponId);
        if (updatedSubmission) {
            updatedSubmission.notificationMessageId = notificationMessage.id;
            saveSubmissionToStorage(weaponId, updatedSubmission);
        }
    }
} catch (error) {
    console.error(`[customweapon submit]: Error sending notification to channel:`, error);
}


} catch (error) {
    console.error(`[customweapon submit]: Error during submission process:`, error);

    // Ensure a reply is sent even on error
    if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
            content: `❌ An error occurred while processing your request. Please try again later.`,
            ephemeral: true,
        });
    } else if (interaction.deferred) {
        return interaction.editReply({
            content: `❌ An error occurred while processing your request. Please try again later.`,
        });
    }
}



// ------------------- Approve Subcommand -------------------
} else if (subcommand === 'approve') {
    // Check for Admin Privileges using PermissionsBitField.Flags.Administrator
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.editReply({
            content: '❌ You do not have the necessary permissions to use this command. Only administrators can approve custom weapons.',
            ephemeral: true,
        });
        return;
    }

    const weaponId = interaction.options.getString('weaponid');
    const staminaToCraft = interaction.options.getInteger('staminatocraft');
    const materialsToCraft = interaction.options.getString('materialstocraft');

    try {
// Retrieve Submission
const weaponSubmission = retrieveSubmissionFromStorage(weaponId);

// ✅ FIXED CONDITION — Expecting to approve a 'pending' weapon, not already approved
if (!weaponSubmission || weaponSubmission.status !== 'pending') {
    console.error(`[customweapon approve]: Submission not found or already approved. Status: ${weaponSubmission?.status}`);
    await interaction.editReply({
        content: `❌ Pending custom weapon not found or this weapon has already been approved.`,
        ephemeral: true,
    });
    return;
}




// ✅ Prevent reuse of crafted weapons
if (weaponSubmission.crafted === true) {
    await interaction.editReply({
        content: `❌ This weapon has already been crafted and cannot be crafted again.`,
        ephemeral: true,
    });
    return;
}

// ------------------- Validate Weapon Submission Fields -------------------
const validModifiers = ['1', '2', '3', '4'];
const validTypes = ['1h', '2h'];

const validSubtypes = await fetchValidWeaponSubtypes();

if (
    !validModifiers.includes(weaponSubmission.modifiers) ||
    !validTypes.includes(weaponSubmission.type) ||
    !validSubtypes.includes(weaponSubmission.subtype.toLowerCase())
) {
    await interaction.editReply({
        content: `❌ Weapon submission contains **invalid modifiers, type, or subtype**.\nPlease contact a moderator to review this submission.`,
        ephemeral: true,
    });
    return;
}



        // Validate Submitter User
        const userId = weaponSubmission.userId;
        if (!userId) {
            await interaction.editReply({
                content: '❌ Unable to notify the submitter because the user ID is missing from the submission.',
                ephemeral: true,
            });
            return;
        }

        // Fetch the Submitter User
        let user;
        try {
            user = await interaction.client.users.fetch(userId);
        } catch (error) {
            console.error(`[customweapon approve]: Failed to fetch user with ID ${userId}:`, error);
            await interaction.editReply({
                content: '❌ User who submitted this weapon could not be found.',
                ephemeral: true,
            });
            return;
        }

        // Parse Crafting Materials
        let craftingMaterials;
        try {
            craftingMaterials = await Promise.all(
                materialsToCraft.split(',').map(async (material) => {
                    const [itemName, quantity] = material.trim().split('x');
                    if (!itemName || !quantity || isNaN(quantity)) {
                        throw new Error(
                            `Invalid material format: "${material}". Each material must follow the format "item x<quantity>", e.g., "diamond x3".`
                        );
                    }

                    // Fetch the item from the database
                    const item = await ItemModel.findOne({ itemName: itemName.trim() });
                    if (!item) {
                        throw new Error(
                            `Item "${itemName.trim()}" does not exist in the database. Please ensure the item name is correct.`
                        );
                    }

                    return {
                        _id: item._id,
                        itemName: item.itemName,
                        quantity: parseInt(quantity.trim(), 10),
                    };
                })
            );

            // Add Star Fragment x1 automatically
            const starFragment = await ItemModel.findOne({ itemName: 'Star Fragment' });
            if (!starFragment) {
                throw new Error(`"Star Fragment" does not exist in the database.`);
            }
            craftingMaterials.push({
                _id: starFragment._id,
                itemName: 'Star Fragment',
                quantity: 1,
            });
        } catch (error) {
            console.error(`[customweapon approve]: Error parsing materials: ${error.message}`);
            await interaction.editReply({
                content: `❌ Failed to parse materials: ${error.message}`,
                ephemeral: true,
            });
            return;
        }

        // Approve Weapon Submission
        weaponSubmission.status = 'approved';
        weaponSubmission.staminaToCraft = staminaToCraft;
        weaponSubmission.craftingMaterials = craftingMaterials;
        weaponSubmission.crafted = false; // 🔐 Ensure crafted flag initialized
        saveSubmissionToStorage(weaponId, weaponSubmission);
        

        // Save Weapon to Database
        try {
            const newItem = new ItemModel({
                itemName: weaponSubmission.weaponName,
                image: weaponSubmission.image,
                imageType: 'https://static.wixstatic.com/media/7573f4_1fabe54755434389a9cfb24180c4538b~mv2.png',
                category: ['Custom Weapon'],
                categoryGear: 'Weapon',
                type: [weaponSubmission.type],
                subtype: [weaponSubmission.subtype],
                craftingMaterial: weaponSubmission.craftingMaterials,
                staminaToCraft: weaponSubmission.staminaToCraft,
                itemRarity: 10,
                obtainTags: ['Custom Weapon'],
                modifierHearts: parseInt(weaponSubmission.modifiers, 10),
                crafting: false,
            });

            await newItem.save();
        } catch (error) {
            console.error(`[customweapon approve]: Failed to save weapon to database:`, error);
            await interaction.editReply({
                content: '❌ Failed to save the weapon to the database. Please try again later.',
                ephemeral: true,
            });
            return;
        }

        // Notify Submitter via DM
        try {
            const dmEmbed = {
                title: `Custom Weapon Approved: ${weaponSubmission.weaponName}`,
                description: 'The item has been added to the database! Use </customweapon create:1330719656905801770> to craft it. This will consume the required stamina and materials from your character’s inventory.',
                color: 0xAA926A,
                thumbnail: { url: weaponSubmission.image },
                fields: [
                    { name: 'Character', value: `> ${weaponSubmission.characterName}`, inline: true },
                    { name: 'Weapon Name', value: `> ${weaponSubmission.weaponName}`, inline: true },
                    { name: 'Subtype', value: `> ${weaponSubmission.subtype}`, inline: true },
                    { name: 'Modifiers', value: `> ${weaponSubmission.modifiers}`, inline: true },
                    { name: 'Type', value: `> ${weaponSubmission.type}`, inline: true },
                    { name: 'Stamina to Craft', value: `> ${staminaToCraft}`, inline: true },
                    { name: 'Weapon ID', value: `\`\`\`${weaponId}\`\`\``, inline: false },
                    {
                        name: '__Materials to Craft__',
                        value: (await Promise.all([
                          ...craftingMaterials.map(async (mat) => {
                            const item = await ItemModel.findOne({ itemName: mat.itemName });
                            const emoji = item?.emoji && item.emoji.trim() !== '' ? item.emoji : ':small_blue_diamond:';
                            return `> ${emoji} **${mat.itemName}** x${mat.quantity}`;
                          }),
                          (async () => {
                            const blueprintItem = await ItemModel.findOne({ itemName: 'Blueprint Voucher' });
                            const emoji = blueprintItem?.emoji && blueprintItem.emoji.trim() !== '' ? blueprintItem.emoji : ':small_blue_diamond:';
                            return `> :small_blue_diamond: **Blueprint Voucher** x1`;
                          })()
                        ])).join('\n'),
                        inline: false,
                      },
                      
                    
                ],
                footer: { text: 'Your weapon has been added to the database!' },
                image: {
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                },
            };

            await user.send({
                content: `☑️ Your custom weapon **${weaponSubmission.weaponName}** has been approved!`,
                embeds: [dmEmbed],
            });
        } catch (error) {
            console.error(`[customweapon approve]: Failed to DM user ${userId}:`, error);
        }

        // Confirm Approval in Channel
        await interaction.editReply({
            content: `✅ Custom weapon **${weaponSubmission.weaponName}** has been approved and added to the database!`,
            embeds: [
                {
                    title: `Approved Weapon: ${weaponSubmission.weaponName}`,
                    description: 'The item has been added to the database! Use </customweapon create:1330719656905801770> to craft it. This will consume the required stamina and materials from your character’s inventory.',
                    color: 0xAA926A,
                    thumbnail: { url: weaponSubmission.image },
                    fields: [
                        { name: 'Character', value: `> ${weaponSubmission.characterName}`, inline: true },
                        { name: 'Weapon Name', value: `> ${weaponSubmission.weaponName}`, inline: true },
                        { name: 'Stamina to Craft', value: `> ${staminaToCraft}`, inline: true },
                        { name: 'Modifiers', value: `> ${weaponSubmission.modifiers}`, inline: true },
                        { name: 'Type', value: `> ${weaponSubmission.type}`, inline: true },
                        { name: 'Subtype', value: `> ${weaponSubmission.subtype}`, inline: true },
                        { name: 'Weapon ID', value: `\`\`\`${weaponId}\`\`\``, inline: false },
                        {
                            name: '__Materials to Craft__',
                            value: (await Promise.all([
                              ...craftingMaterials.map(async (mat) => {
                                const item = await ItemModel.findOne({ itemName: mat.itemName });
                                const emoji = item?.emoji && item.emoji.trim() !== '' ? item.emoji : ':small_blue_diamond:';
                                return `> ${emoji} **${mat.itemName}** x${mat.quantity}`;
                              }),
                              (async () => {
                                const blueprintItem = await ItemModel.findOne({ itemName: 'Blueprint Voucher' });
                                const emoji = blueprintItem?.emoji && blueprintItem.emoji.trim() !== '' ? blueprintItem.emoji : ':small_blue_diamond:';
                                return `> :small_blue_diamond: **Blueprint Voucher** x1`;
                              })()
                            ])).join('\n'),
                            inline: false,
                          },
                          
                        
                    ],
                    image: {
                        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
                    },
                },
            ],
            ephemeral: false,
        });

// ✅ React with a checkmark on original submission message
try {
    if (weaponSubmission.notificationMessageId) {
        const notificationChannel = await interaction.client.channels.fetch('1347628427993153637');
        const originalMsg = await notificationChannel.messages.fetch(weaponSubmission.notificationMessageId);
        if (originalMsg) {
            await originalMsg.react('✅');
        }
    }
} catch (err) {
    console.error(`[customweapon approve]: Failed to react to notification message:`, err.message);
}




    } catch (error) {
        console.error(`[customweapon approve]: An unexpected error occurred:`, error);
        if (!interaction.deferred && !interaction.replied) {
            await interaction.reply({
                content: '❌ An unexpected error occurred while approving the weapon. Please try again later.',
                ephemeral: true,
            });
        } else {
            await interaction.editReply({
                content: '❌ An unexpected error occurred while approving the weapon. Please try again later.',
            });
        }
    }
}

        } catch (error) {
            console.error('[customweapon command]:', error);
            return interaction.reply({ content: '❌ An error occurred while processing the command.', ephemeral: true });
        }
    }
};

// ------------------- Helper Functions -------------------

// ------------------- Logs materials used for crafting to Google Sheets -------------------
async function logMaterialsToGoogleSheets(auth, spreadsheetId, range, character, materialsUsed, craftedItem, interactionUrl, formattedDateTime) {
    try {
        const combinedMaterials = combineMaterials(materialsUsed);

        const usedMaterialsValues = await Promise.all(combinedMaterials.map(async (material) => {
            try {
                let materialItem = null;

                // Attempt lookup by ID if available
                if (material._id) {
                    try {
                        const materialObjectId = new mongoose.Types.ObjectId(material._id);
                        materialItem = await ItemModel.findById(materialObjectId);
                    } catch (_) {
                        // Silently fail invalid ObjectId — fallback handled below
                    }
                }

                // Fallback to itemName lookup
                if (!materialItem || !materialItem.category || !materialItem.type || !materialItem.subtype) {
                    materialItem = await ItemModel.findOne({ itemName: material.itemName });
                }

                // Still not found = use 'Unknown'
                if (!materialItem) {
                    return [
                        character.name,
                        material.itemName || 'Unknown',
                        `-${material.quantity || 1}`,
                        'Unknown',
                        'Unknown',
                        'Unknown',
                        `Used for ${craftedItem.itemName}`,
                        character.job || '',
                        '',
                        character.currentVillage || '',
                        interactionUrl,
                        formattedDateTime,
                        uuidv4()
                    ];
                }

                return [
                    character.name,
                    material.itemName || 'Unknown',
                    `-${material.quantity || 1}`,
                    materialItem.category?.join(', ') || 'Unknown',
                    materialItem.type?.join(', ') || 'Unknown',
                    materialItem.subtype?.length ? materialItem.subtype.join(', ') : '',
                    `Used for ${craftedItem.itemName}`,
                    character.job || '',
                    '',
                    character.currentVillage || '',
                    interactionUrl,
                    formattedDateTime,
                    uuidv4()
                ];
            } catch (error) {
                console.error('[logMaterialsToGoogleSheets]: Error processing material:', error.message);
                return [
                    character.name,
                    material.itemName || 'Unknown',
                    `-${material.quantity || 1}`,
                    'Unknown',
                    'Unknown',
                    'Unknown',
                    `Used for ${craftedItem.itemName}`,
                    character.job || '',
                    '',
                    character.currentVillage || '',
                    interactionUrl,
                    formattedDateTime,
                    uuidv4()
                ];
            }
        }));

        await appendSheetData(auth, spreadsheetId, range, usedMaterialsValues);
    } catch (error) {
        console.error(`[customweapon create]: Failed to log materials to sheet:`, error);
    }
}

  
  // Combines materials used for crafting to avoid duplicates
  function combineMaterials(materialsUsed) {
    const combinedMaterials = [];
    const materialMap = new Map();
  
    for (const material of materialsUsed) {
      if (materialMap.has(material.itemName)) {
        materialMap.get(material.itemName).quantity += material.quantity;
      } else {
        materialMap.set(material.itemName, { ...material });
      }
    }
  
    return Array.from(materialMap.values());
  }
  
  // ------------------- Get All Submissions from Storage -------------------
  function getAllSubmissions() {
    try {
        const fs = require('fs');
        const path = require('path');
        const submissionsPath = path.join(__dirname, '../data/submissions.json');

        if (!fs.existsSync(submissionsPath)) return [];

        const rawData = fs.readFileSync(submissionsPath, 'utf-8').trim();

        // Handle empty file safely
        if (!rawData) return [];

        let submissions = {};
        try {
            submissions = JSON.parse(rawData);
        } catch (parseError) {
            console.error(`[customweapon helper]: Failed to parse submissions.json — it might be corrupt or empty. Returning empty list.`);
            return [];
        }

        return Object.values(submissions);
    } catch (error) {
        console.error(`[customweapon helper]: Error retrieving all submissions:`, error);
        return [];
    }
}


