// ============================================================================
// ---- Custom Weapon Command ----
// Handles creation, submission, and approval of custom weapons
// ============================================================================

// ------------------- /customweapon Command -------------------
// ------------------- Standard Libraries -------------------
const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs
const mongoose = require('mongoose'); // Add mongoose import

// ------------------- Database Connections -------------------
const { fetchCharacterByNameAndUserId, fetchModCharacterByNameAndUserId, updateCharacterById, getCharacterInventoryCollection, fetchItemByName, fetchValidWeaponSubtypes, fetchAllWeapons } = require('@/database/db');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials, removeItemInventoryDatabase, escapeRegExp } = require('@/utils/inventoryUtils');
// Google Sheets functionality removed
const { retrieveWeaponSubmissionFromStorage, saveWeaponSubmissionToStorage, updateWeaponSubmissionData, deleteWeaponSubmissionFromStorage, saveSubmissionToStorage, deleteSubmissionFromStorage } = require('@/utils/storage');
const { uploadSubmissionImage } = require('@/utils/uploadUtils');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const { checkAndUseStamina } = require('../../modules/characterStatsModule')
const { formatDateTime } = require('../../modules/formattingModule');

// ------------------- Database Models -------------------
const ItemModel = require('@/models/ItemModel');

// ------------------- Helper Functions -------------------

// ---- Function: buildMaterialsList ----
// Builds materials list synchronously for Discord embeds
function buildMaterialsList(craftingMaterials) {
    try {
        // Get material names (case-insensitive)
        const materialNames = craftingMaterials.map(mat => mat.itemName.toLowerCase());
        
        // Build the list synchronously
        const materialLines = [];
        
        // Add crafting materials
        for (const mat of craftingMaterials) {
            materialLines.push(`> :small_blue_diamond: **${mat.itemName}** x${mat.quantity}`);
        }
        
        // Only add Blueprint Voucher if not already present
        if (!materialNames.includes('blueprint voucher')) {
            materialLines.push(`> :small_blue_diamond: **Blueprint Voucher** x1`);
        }
        
        // Only add Star Fragment if not already present
        if (!materialNames.includes('star fragment')) {
            materialLines.push(`> :small_blue_diamond: **Star Fragment** x1`);
        }
        
        return materialLines.join('\n');
    } catch (error) {
        console.error(`[buildMaterialsList]: Error building materials list:`, error);
        return '> :small_blue_diamond: **Materials** (Error loading details)';
    }
}

// ---- Function: createValidationErrorEmbed ----
// Creates a comprehensive error embed for validation failures
function createValidationErrorEmbed(characterName, itemName, currentQuantity, requiredQuantity, similarItems = [], operation = 'craft') {
    const embed = {
        color: 0xFF6B35, // Orange color for warnings
        title: `❌ Missing Required Item: ${itemName}`,
        description: `**${characterName}** is missing the required **${itemName}** to ${operation}.`,
        fields: [
            {
                name: '📊 Current Status',
                value: `**Current:** ${currentQuantity || 0}\n**Required:** ${requiredQuantity}\n**Missing:** ${requiredQuantity - (currentQuantity || 0)}`,
                inline: true
            }
        ],
        footer: { text: 'Please obtain the required items before attempting to craft.' },
        timestamp: new Date().toISOString()
    };

    // Add similar items field if any found
    if (similarItems.length > 0) {
        embed.fields.push({
            name: '💡 Similar Items Found',
            value: similarItems.map(item => `• **${item}**`).join('\n'),
            inline: false
        });
    }

    // Add helpful tips based on the item
    const tips = [];
    if (itemName.toLowerCase().includes('star fragment')) {
        tips.push('• Complete special events and quests');
        tips.push('• Participate in seasonal activities');
        tips.push('• Trade with other players');
        tips.push('• Check the marketplace');
    } else if (itemName.toLowerCase().includes('blueprint voucher')) {
        tips.push('• Complete special crafting events');
        tips.push('• Participate in seasonal activities');
        tips.push('• Trade with other players');
        tips.push('• Check the marketplace');
        tips.push('• Complete specific quests');
    }

    if (tips.length > 0) {
        embed.fields.push({
            name: '🔍 How to Obtain',
            value: tips.join('\n'),
            inline: false
        });
    }

    return embed;
}

// ---- Function: validateInventoryData ----
// Validates inventory data structure and provides detailed error messages
function validateInventoryData(inventoryItems, characterName) {
    try {
        // Check if inventoryItems is valid
        if (!inventoryItems) {
            throw new Error(`❌ **${characterName}**'s inventory data is null or undefined. Please ensure your inventory is properly synced.`);
        }

        if (!Array.isArray(inventoryItems)) {
            throw new Error(`❌ **${characterName}**'s inventory data is not in the expected format. Please ensure your inventory is properly synced.`);
        }

        if (inventoryItems.length === 0) {
            throw new Error(`❌ **${characterName}**'s inventory appears to be empty. Please ensure your inventory is properly synced with the database.`);
        }

        // Check for invalid items in the inventory
        const invalidItems = inventoryItems.filter(item => 
            !item || 
            typeof item !== 'object' || 
            !item.itemName || 
            typeof item.itemName !== 'string' ||
            item.quantity === undefined || 
            item.quantity === null
        );

        if (invalidItems.length > 0) {
            console.warn(`[validateInventoryData]: ⚠️ Found ${invalidItems.length} invalid items in ${characterName}'s inventory`);
        }

        // Log inventory summary for debugging
        console.log(`[validateInventoryData]: ✅ Inventory validation passed for ${characterName}:`);
        console.log(`[validateInventoryData]:   - Total items: ${inventoryItems.length}`);
        console.log(`[validateInventoryData]:   - Valid items: ${inventoryItems.length - invalidItems.length}`);
        console.log(`[validateInventoryData]:   - Invalid items: ${invalidItems.length}`);

        return {
            isValid: true,
            itemCount: inventoryItems.length,
            validItemCount: inventoryItems.length - invalidItems.length,
            invalidItemCount: invalidItems.length
        };

    } catch (error) {
        console.error(`[validateInventoryData]: ❌ Inventory validation failed for ${characterName}:`, error.message);
        throw error;
    }
}

// ---- Function: logMaterialsToGoogleSheets ----
// Logs materials used for crafting to Google Sheets
async function logMaterialsToGoogleSheets(auth, spreadsheetId, range, character, materialsUsed, craftedItem, interactionUrl, formattedDateTime, interaction) {
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
                    } catch (error) {
                        handleInteractionError(error, 'customWeapon.js', {
                            commandName: 'customWeapon',
                            userTag: interaction?.user?.tag,
                            userId: interaction?.user?.id,
                            characterName: character?.name,
                            options: {
                                materialId: material._id,
                                operation: 'findById'
                            }
                        });
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
                handleInteractionError(error, 'customWeapon.js', {
                    commandName: 'customWeapon',
                    userTag: interaction?.user?.tag,
                    userId: interaction?.user?.id,
                    characterName: character?.name,
                    options: {
                        material: material,
                        operation: 'processMaterial'
                    }
                });

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

        await safeAppendDataToSheet(character.inventory, character, range, usedMaterialsValues, undefined, { 
            skipValidation: true,
            context: {
                commandName: 'customWeapon',
                userTag: interaction?.user?.tag,
                userId: interaction?.user?.id,
                characterName: character.name,
                spreadsheetId: extractSpreadsheetId(character.inventory),
                range: range,
                sheetType: 'inventory',
                options: {
                    weaponName: craftedItem.itemName,
                    materials: materialsUsed
                }
            }
        });
    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            userTag: interaction?.user?.tag,
            userId: interaction?.user?.id,
            characterName: character?.name,
            options: {
                spreadsheetId,
                range,
                materialsUsed,
                operation: 'logMaterialsToGoogleSheets'
            }
        });
        console.error(`[customweapon create]: Failed to log materials to sheet:`, error);
    }
}

// ---- Function: combineMaterials ----
// Combines materials used for crafting to avoid duplicates
function combineMaterials(materialsUsed) {
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

// ---- Function: getAllWeaponSubmissions ----
// Retrieves all weapon submissions from storage
async function getAllWeaponSubmissions() {
    try {
        const { getAllWeaponSubmissions } = require('@/utils/storage');
        const submissions = await getAllWeaponSubmissions();
        return submissions;
    } catch (error) {
        handleInteractionError(error, 'customWeapon.js');
        console.error(`[customweapon helper]: Error reading weapon submissions:`, error);
        return [];
    }
}

// ---- Function: validateWeaponSubmission ----
// Validates all aspects of a weapon submission
async function validateWeaponSubmission(submission) {
    const validModifiers = ['1', '2', '3', '4'];
    const validTypes = ['1h', '2h'];
    const validSubtypes = await fetchValidWeaponSubtypes();

    if (!validModifiers.includes(submission.modifiers)) {
        throw new Error(`Invalid modifier value: ${submission.modifiers}. Must be one of: ${validModifiers.join(', ')}`);
    }

    if (!validTypes.includes(submission.type)) {
        throw new Error(`Invalid weapon type: ${submission.type}. Must be one of: ${validTypes.join(', ')}`);
    }

    if (!validSubtypes.includes(submission.subtype.toLowerCase())) {
        throw new Error(`Invalid weapon subtype: ${submission.subtype}. Please check the available subtypes.`);
    }

    const baseWeapon = await ItemModel.findOne({ itemName: submission.baseWeapon });
    if (!baseWeapon) {
        throw new Error(`Base weapon "${submission.baseWeapon}" not found in the database.`);
    }

    if (!baseWeapon.type.includes(submission.type)) {
        throw new Error(`The base weapon "${submission.baseWeapon}" is a ${baseWeapon.type.join('/')} weapon, but you selected ${submission.type}.`);
    }
}

// ---- Function: validateCraftingRequirements ----
// Validates all requirements for crafting a weapon
async function validateCraftingRequirements(character, weaponSubmission, inventoryItems) {
    // Check Blueprint Voucher
    await validateBlueprintVoucher(inventoryItems, character.name, 'craft');

    // Check Star Fragments
    await validateStarFragment(inventoryItems, character.name);

    // Check Stamina
    if (character.currentStamina < weaponSubmission.staminaToCraft) {
        throw new Error(`Insufficient stamina. You need ${weaponSubmission.staminaToCraft} stamina to craft this weapon.`);
    }

    // Check Materials
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
        throw new Error(`You are missing required materials:\n${missingMaterials.join('\n')}`);
    }
}

// ---- Function: parseAndValidateMaterials ----
// Parses and validates crafting materials string with comprehensive error handling
async function parseAndValidateMaterials(materialsString, interaction) {
    try {
        // Clean and validate materials string
        const cleanedMaterials = materialsString.trim();
        if (!cleanedMaterials) {
            throw new Error('Materials string is empty');
        }

        if (!cleanedMaterials.includes('x')) {
            throw new Error('Materials must be formatted as "item x1, item x2, etc."');
        }

        const materials = await Promise.all(
            cleanedMaterials.split(',').map(async (material, index) => {
                const trimmedMaterial = material.trim();
                if (!trimmedMaterial) {
                    throw new Error(`Empty material at position ${index + 1}`);
                }

                const [itemName, quantity] = trimmedMaterial.split('x');
                if (!itemName || !quantity || isNaN(quantity)) {
                    throw new Error(
                        `Invalid material format: "${trimmedMaterial}". Each material must follow the format "item x<quantity>", e.g., "diamond x3".`
                    );
                }

                const cleanItemName = itemName.trim();
                const cleanQuantity = quantity.trim();

                if (!cleanItemName || !cleanQuantity) {
                    throw new Error(`Invalid material format: "${trimmedMaterial}". Item name and quantity cannot be empty.`);
                }

                const parsedQuantity = parseInt(cleanQuantity, 10);
                if (parsedQuantity <= 0 || parsedQuantity > 1000) {
                    throw new Error(`Invalid quantity for "${cleanItemName}": ${parsedQuantity}. Must be between 1 and 1000.`);
                }

                // Fetch the item from the database using case-insensitive search
                let item;
                if (cleanItemName.includes('+')) {
                    item = await ItemModel.findOne({ 
                        itemName: cleanItemName
                    });
                } else {
                    item = await ItemModel.findOne({ 
                        itemName: { $regex: new RegExp(`^${escapeRegExp(cleanItemName)}$`, 'i') }
                    });
                }
                if (!item) {
                    throw new Error(
                        `Item "${cleanItemName}" does not exist in the database. Please ensure the item name is correct.`
                    );
                }

                console.log(`[parseAndValidateMaterials]: ✅ Found material: ${item.itemName} x${parsedQuantity}`);
                return {
                    _id: item._id,
                    itemName: item.itemName,
                    quantity: parsedQuantity,
                };
            })
        );

        // Validate we have at least one material
        if (materials.length === 0) {
            throw new Error('At least one crafting material is required.');
        }

        // Check for duplicate materials
        const materialNames = materials.map(m => m.itemName.toLowerCase());
        const uniqueNames = [...new Set(materialNames)];
        if (materialNames.length !== uniqueNames.length) {
            throw new Error('Duplicate materials are not allowed. Each material should be listed only once.');
        }

        // Add Blueprint Voucher x1 automatically
        const blueprintItem = await ItemModel.findOne({ 
            itemName: { $regex: /^Blueprint Voucher$/i }
        });
        if (!blueprintItem) {
            throw new Error(`"Blueprint Voucher" does not exist in the database.`);
        }

        // Check if Blueprint Voucher is already in the materials list
        const hasBlueprintVoucher = materials.some(m => m.itemName.toLowerCase() === 'blueprint voucher');
        if (!hasBlueprintVoucher) {
            materials.push({
                _id: blueprintItem._id,
                itemName: 'Blueprint Voucher',
                quantity: 1,
            });
            console.log(`[parseAndValidateMaterials]: ✅ Added Blueprint Voucher x1`);
        }

        return materials;

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            userTag: interaction?.user?.tag,
            userId: interaction?.user?.id,
            options: {
                materialsString,
                operation: 'parseAndValidateMaterials'
            }
        });
        throw error;
    }
}

// ---- Function: updateNotificationMessage ----
// Updates the notification message in the approval channel
async function updateNotificationMessage(weaponSubmission, interaction) {
    try {
        if (!weaponSubmission.notificationMessageId) {
            console.log(`[updateNotificationMessage]: No notification message ID found for weapon ${weaponSubmission.weaponName}`);
            return;
        }

        const notificationChannel = await interaction.client.channels.fetch('1381479893090566144');
        if (!notificationChannel) {
            console.error(`[updateNotificationMessage]: Could not fetch notification channel`);
            return;
        }

        const notificationMessage = await notificationChannel.messages.fetch(weaponSubmission.notificationMessageId);
        if (!notificationMessage) {
            console.error(`[updateNotificationMessage]: Could not fetch notification message ${weaponSubmission.notificationMessageId}`);
            return;
        }

        // Update the embed to show approval status
        const updatedEmbed = {
            color: 0x00FF00, // Green color for approved
            title: '✅ CUSTOM WEAPON APPROVED!',
            description: '⏰ **Approved within 24 hours!**',
            fields: [
                {
                    name: '👤 Submitted by',
                    value: `<@${weaponSubmission.userId}>`,
                    inline: true
                },
                {
                    name: '✅ Approved by',
                    value: `<@${interaction.user.id}>`,
                    inline: true
                },
                {
                    name: '📅 Approved on',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                },
                {
                    name: '🆔 Submission ID',
                    value: `\`${weaponSubmission.submissionId || 'N/A'}\``,
                    inline: true
                },
                {
                    name: '🛠️ Weapon Name',
                    value: weaponSubmission.weaponName,
                    inline: true
                },
                {
                    name: '⚡ Stamina Cost',
                    value: `${weaponSubmission.staminaToCraft || 'N/A'}`,
                    inline: true
                }
            ],
            image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
                text: 'Custom Weapon Approved'
            },
            timestamp: new Date().toISOString()
        };

        await notificationMessage.edit({
            embeds: [updatedEmbed]
        });

        console.log(`[updateNotificationMessage]: ✅ Successfully updated notification message for weapon ${weaponSubmission.weaponName}`);

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            userTag: interaction?.user?.tag,
            userId: interaction?.user?.id,
            characterName: weaponSubmission?.characterName,
            options: {
                weaponName: weaponSubmission?.weaponName,
                notificationMessageId: weaponSubmission?.notificationMessageId,
                operation: 'updateNotificationMessage'
            }
        });
        console.error(`[updateNotificationMessage]: Failed to update notification message:`, error);
    }
}

// ---- Function: sendApprovalDM ----
// Sends approval notification DM to the submitter
async function sendApprovalDM(user, weaponSubmission, craftingMaterials, staminaToCraft, weaponId, interaction) {
    try {
        if (!user) {
            console.log(`[sendApprovalDM]: No user found for weapon ${weaponSubmission.weaponName}`);
            return;
        }

        const dmEmbed = {
            title: `Custom Weapon Approved: ${weaponSubmission.weaponName}`,
            description: "The item has been added to the database! Use </customweapon create:1330719656905801770> to craft it. This will consume the required stamina and materials from your character's inventory.",
            color: 0xAA926A,
            thumbnail: { url: weaponSubmission.image },
            fields: [
                { name: 'Character', value: `> ${weaponSubmission.characterName}`, inline: true },
                { name: 'Weapon Name', value: `> ${weaponSubmission.weaponName}`, inline: true },
                { name: 'Subtype', value: `> ${weaponSubmission.subtype}`, inline: true },
                { name: 'Modifiers', value: `> ${weaponSubmission.modifiers}`, inline: true },
                { name: 'Type', value: `> ${weaponSubmission.type}`, inline: true },
                { name: 'Stamina to Craft', value: `> ${staminaToCraft}`, inline: true },
                { name: 'Weapon ID', value: `\`\`\`${weaponSubmission.submissionId || weaponId}\`\`\``, inline: false },
                {
                    name: '__Materials to Craft__',
                    value: buildMaterialsList(craftingMaterials),
                    inline: false,
                },
            ],
            footer: { text: 'Your weapon has been added to the database!' },
            image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png',
            },
        };

        await user.send({
            content: `✅ Your custom weapon **${weaponSubmission.weaponName}** has been approved!`,
            embeds: [dmEmbed],
        });

        console.log(`[sendApprovalDM]: ✅ Sent DM to user ${user.id} for weapon ${weaponSubmission.weaponName}`);

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            userTag: interaction?.user?.tag,
            userId: interaction?.user?.id,
            characterName: weaponSubmission?.characterName,
            options: {
                weaponName: weaponSubmission?.weaponName,
                targetUserId: user?.id,
                operation: 'sendApprovalDM'
            }
        });
        console.error(`[sendApprovalDM]: Failed to DM user ${user?.id}:`, error);
    }
}

// ---- Function: validateBlueprintVoucher ----
// Validates Blueprint Voucher requirement with comprehensive error handling and detailed feedback
async function validateBlueprintVoucher(inventoryItems, characterName, operation = 'craft') {
    try {
        // Validate input parameters and inventory data
        if (!characterName || typeof characterName !== 'string') {
            throw new Error('❌ Invalid character name provided for Blueprint Voucher validation.');
        }

        // Validate inventory data structure
        validateInventoryData(inventoryItems, characterName);

        // Case-insensitive search for Blueprint Voucher with multiple variations
        const blueprintVoucherVariations = [
            'blueprint voucher',
            'blueprint vouchers',
            'blueprintvoucher',
            'blueprintvouchers'
        ];

        const blueprintVouchers = inventoryItems.filter(item => {
            if (!item || !item.itemName) return false;
            
            const itemNameLower = item.itemName.toLowerCase().trim();
            return blueprintVoucherVariations.some(variation => 
                itemNameLower === variation || 
                (itemNameLower.includes('blueprint') && itemNameLower.includes('voucher'))
            );
        });

        // Calculate total quantity with proper validation
        const totalBlueprintVouchers = blueprintVouchers.reduce((sum, item) => {
            const quantity = parseInt(item.quantity) || 0;
            if (quantity < 0) {
                console.warn(`[validateBlueprintVoucher]: ⚠️ Negative quantity detected for ${item.itemName}: ${quantity}`);
                return sum;
            }
            return sum + quantity;
        }, 0);

        // Detailed logging for debugging
        console.log(`[validateBlueprintVoucher]: 🔍 Inventory analysis for ${characterName}:`);
        console.log(`[validateBlueprintVoucher]:   - Total inventory items: ${inventoryItems.length}`);
        console.log(`[validateBlueprintVoucher]:   - Blueprint Voucher items found: ${blueprintVouchers.length}`);
        console.log(`[validateBlueprintVoucher]:   - Total Blueprint Vouchers: ${totalBlueprintVouchers}`);

        // Check if any Blueprint Vouchers were found at all
        if (blueprintVouchers.length === 0) {

            // Check for similar items that might be Blueprint Vouchers
            const similarItems = inventoryItems.filter(item => 
                item.itemName && 
                (item.itemName.toLowerCase().includes('blueprint') || 
                 item.itemName.toLowerCase().includes('voucher'))
            );

            if (similarItems.length > 0) {
                const similarItemNames = similarItems.map(item => `"${item.itemName}"`).join(', ');
                throw new Error(`❌ **${characterName}** does not have a **Blueprint Voucher** in their inventory.\n\n💡 **Similar items found:** ${similarItemNames}\n\n🔍 **Please check:**\n• Item name spelling (should be exactly "Blueprint Voucher")\n• Item availability in your inventory\n• Inventory sync status`);
            } else {
                const operationContext = operation === 'submit' 
                    ? 'submit a custom weapon'
                    : 'craft this weapon';
                
                throw new Error(`❌ **${characterName}** does not have a **Blueprint Voucher** in their inventory.\n\n💡 **How to obtain Blueprint Vouchers:**\n• Complete special crafting events\n• Participate in seasonal activities\n• Trade with other players\n• Check the marketplace\n• Complete specific quests\n\n🔍 **Please ensure:**\n• Your inventory is properly synced\n• You have the required item before attempting to ${operationContext}`);
            }
        }

        // Check if enough Blueprint Vouchers are available
        if (totalBlueprintVouchers < 1) {
            const availableItems = blueprintVouchers.map(item => 
                `"${item.itemName}" (Quantity: ${item.quantity || 0})`
            ).join(', ');

            const operationContext = operation === 'submit' 
                ? 'submit a custom weapon'
                : 'craft this weapon';

            throw new Error(`❌ **${characterName}** has insufficient **Blueprint Vouchers**.\n\n📊 **Current Blueprint Vouchers:** ${totalBlueprintVouchers}\n📋 **Required:** 1\n\n💡 **Available items:** ${availableItems}\n\n🔍 **Please obtain:** ${1 - totalBlueprintVouchers} more Blueprint Voucher(s) to ${operationContext}.`);
        }

        // Success logging
        console.log(`[validateBlueprintVoucher]: ✅ Found Blueprint Vouchers x${totalBlueprintVouchers} for ${characterName}`);
        
        // Return the first valid Blueprint Voucher for backward compatibility
        const blueprintVoucher = blueprintVouchers.find(item => item.quantity > 0);
        
        return {
            ...blueprintVoucher,
            totalBlueprintVouchers,
            validationDetails: {
                inventoryItemCount: inventoryItems.length,
                blueprintVoucherItemCount: blueprintVouchers.length,
                characterName: characterName,
                operation: operation,
                validationTimestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        // Enhanced error handling with more context
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            characterName: characterName,
            options: {
                operation: 'validateBlueprintVoucher',
                voucherOperation: operation,
                inventoryItemCount: inventoryItems?.length || 0,
                inventoryItems: inventoryItems?.slice(0, 5).map(item => item?.itemName).filter(Boolean), // First 5 items for debugging
                errorType: error.name,
                errorMessage: error.message
            }
        });

        // Re-throw the error with enhanced context if it's not already detailed
        if (!error.message.includes('❌')) {
            throw new Error(`❌ Blueprint Voucher validation failed for **${characterName}**: ${error.message}`);
        }

        throw error;
    }
}

// ---- Function: validateStarFragment ----
// Validates Star Fragment requirement with comprehensive error handling and detailed feedback
async function validateStarFragment(inventoryItems, characterName) {
    try {
        // Validate input parameters and inventory data
        if (!characterName || typeof characterName !== 'string') {
            throw new Error('❌ Invalid character name provided for Star Fragment validation.');
        }

        // Validate inventory data structure
        validateInventoryData(inventoryItems, characterName);

        // Case-insensitive search for Star Fragment with multiple variations
        const starFragmentVariations = [
            'star fragment',
            'star fragments',
            'starfragment',
            'starfragments'
        ];

        const starFragments = inventoryItems.filter(item => {
            if (!item || !item.itemName) return false;
            
            const itemNameLower = item.itemName.toLowerCase().trim();
            return starFragmentVariations.some(variation => 
                itemNameLower === variation || 
                itemNameLower.includes('star') && itemNameLower.includes('fragment')
            );
        });

        // Calculate total quantity with proper validation
        const totalStarFragments = starFragments.reduce((sum, item) => {
            const quantity = parseInt(item.quantity) || 0;
            if (quantity < 0) {
                console.warn(`[validateStarFragment]: ⚠️ Negative quantity detected for ${item.itemName}: ${quantity}`);
                return sum;
            }
            return sum + quantity;
        }, 0);

        // Detailed logging for debugging
        console.log(`[validateStarFragment]: 🔍 Inventory analysis for ${characterName}:`);
        console.log(`[validateStarFragment]:   - Total inventory items: ${inventoryItems.length}`);
        console.log(`[validateStarFragment]:   - Star Fragment items found: ${starFragments.length}`);
        console.log(`[validateStarFragment]:   - Total Star Fragments: ${totalStarFragments}`);

        // Check if any Star Fragments were found at all
        if (starFragments.length === 0) {

            // Check for similar items that might be Star Fragments
            const similarItems = inventoryItems.filter(item => 
                item.itemName && 
                (item.itemName.toLowerCase().includes('star') || 
                 item.itemName.toLowerCase().includes('fragment'))
            );

            if (similarItems.length > 0) {
                const similarItemNames = similarItems.map(item => `"${item.itemName}"`).join(', ');
                throw new Error(`❌ **${characterName}** does not have a **Star Fragment** in their inventory.\n\n💡 **Similar items found:** ${similarItemNames}\n\n🔍 **Please check:**\n• Item name spelling (should be exactly "Star Fragment")\n• Item availability in your inventory\n• Inventory sync status`);
            } else {
                throw new Error(`❌ **${characterName}** does not have a **Star Fragment** in their inventory.\n\n💡 **How to obtain Star Fragments:**\n• Complete special events and quests\n• Participate in seasonal activities\n• Trade with other players\n• Check the marketplace\n\n🔍 **Please ensure:**\n• Your inventory is properly synced\n• You have the required item before attempting to craft`);
            }
        }

        // Check if enough Star Fragments are available
        if (totalStarFragments < 1) {
            const availableItems = starFragments.map(item => 
                `"${item.itemName}" (Quantity: ${item.quantity || 0})`
            ).join(', ');

            throw new Error(`❌ **${characterName}** has insufficient **Star Fragments**.\n\n📊 **Current Star Fragments:** ${totalStarFragments}\n📋 **Required:** 1\n\n💡 **Available items:** ${availableItems}\n\n🔍 **Please obtain:** ${1 - totalStarFragments} more Star Fragment(s) to craft this weapon.`);
        }

        // Success logging
        console.log(`[validateStarFragment]: ✅ Found Star Fragments x${totalStarFragments} for ${characterName}`);
        
        // Return detailed information for potential future use
        return { 
            totalStarFragments, 
            starFragments,
            validationDetails: {
                inventoryItemCount: inventoryItems.length,
                starFragmentItemCount: starFragments.length,
                characterName: characterName,
                validationTimestamp: new Date().toISOString()
            }
        };

    } catch (error) {
        // Enhanced error handling with more context
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            characterName: characterName,
            options: {
                operation: 'validateStarFragment',
                inventoryItemCount: inventoryItems?.length || 0,
                inventoryItems: inventoryItems?.slice(0, 5).map(item => item?.itemName).filter(Boolean), // First 5 items for debugging
                errorType: error.name,
                errorMessage: error.message
            }
        });

        // Re-throw the error with enhanced context if it's not already detailed
        if (!error.message.includes('❌')) {
            throw new Error(`❌ Star Fragment validation failed for **${characterName}**: ${error.message}`);
        }

        throw error;
    }
}

// ---- Function: validateCraftingLock ----
// Validates that a weapon submission has not been crafted before
async function validateCraftingLock(weaponSubmission, weaponId, characterName) {
    try {
        // Check if submission exists
        if (!weaponSubmission) {
            throw new Error(`Custom weapon submission not found. Please verify the Weapon ID is correct.`);
        }

        // Check if already crafted
        if (weaponSubmission.crafted === true) {
            console.error(`[validateCraftingLock]: ❌ Weapon already crafted for ID: ${weaponId}`);
            throw new Error(`This weapon has already been crafted and cannot be crafted again.`);
        }

        // Check if submission is approved
        if (weaponSubmission.status !== 'approved') {
            console.error(`[validateCraftingLock]: ❌ Submission status is ${weaponSubmission.status} for ID: ${weaponId}`);
            throw new Error(`This weapon has not been approved yet. Current status: ${weaponSubmission.status}`);
        }

        // Check if only the submitting character can craft
        if (weaponSubmission.characterName !== characterName) {
            console.error(`[validateCraftingLock]: ❌ Character mismatch. Expected: ${weaponSubmission.characterName}, Got: ${characterName}`);
            throw new Error(`Only **${weaponSubmission.characterName}** can craft this weapon.`);
        }

        // Validate required fields for crafting
        if (!weaponSubmission.craftingMaterials || weaponSubmission.craftingMaterials.length === 0) {
            throw new Error(`This weapon has not been properly configured for crafting. Please contact an administrator.`);
        }

        if (!weaponSubmission.staminaToCraft || weaponSubmission.staminaToCraft <= 0) {
            throw new Error(`This weapon has not been properly configured for crafting. Please contact an administrator.`);
        }

        console.log(`[validateCraftingLock]: ✅ Crafting lock validation passed for weapon ${weaponSubmission.weaponName} (ID: ${weaponId})`);
        return true;

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            characterName: characterName,
            options: {
                weaponId: weaponId,
                weaponName: weaponSubmission?.weaponName,
                status: weaponSubmission?.status,
                crafted: weaponSubmission?.crafted,
                operation: 'validateCraftingLock'
            }
        });
        throw error;
    }
}

// ---- Function: markWeaponAsCrafted ----
// Safely marks a weapon as crafted with comprehensive error handling
async function markWeaponAsCrafted(weaponSubmission, weaponId, characterName) {
    try {
        // Double-check that weapon is not already crafted
        if (weaponSubmission.crafted === true) {
            console.error(`[markWeaponAsCrafted]: ❌ Attempted to mark already crafted weapon: ${weaponId}`);
            throw new Error(`This weapon has already been crafted.`);
        }

        // Update the crafted flag
        weaponSubmission.crafted = true;
        weaponSubmission.craftedAt = new Date();
        weaponSubmission.craftedBy = characterName;

        // Save the updated submission
        await saveSubmissionToStorage(weaponId, weaponSubmission);
        
        console.log(`[markWeaponAsCrafted]: ✅ Successfully marked weapon ${weaponSubmission.weaponName} (ID: ${weaponId}) as crafted`);

        return true;

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            characterName: characterName,
            options: {
                weaponId: weaponId,
                weaponName: weaponSubmission?.weaponName,
                operation: 'markWeaponAsCrafted'
            }
        });
        throw error;
    }
}

// ---- Function: cleanupCraftedSubmission ----
// Safely removes a crafted submission from storage
async function cleanupCraftedSubmission(weaponId, weaponName) {
    try {
        // Delete submission from storage after crafting is finalized
        await deleteSubmissionFromStorage(weaponId);
        console.log(`[cleanupCraftedSubmission]: ✅ Successfully cleaned up crafted submission ${weaponName} (ID: ${weaponId})`);
        return true;

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            options: {
                weaponId: weaponId,
                weaponName: weaponName,
                operation: 'cleanupCraftedSubmission'
            }
        });
        console.error(`[cleanupCraftedSubmission]: ❌ Failed to cleanup submission ${weaponId}:`, error);
        throw error;
    }
}

// ---- Function: validateCreateCommandRequirements ----
// Comprehensive validation for the create command
async function validateCreateCommandRequirements(characterName, weaponId, userId, interaction) {
    try {
        // Validate input parameters
        if (!characterName || !weaponId || !userId) {
            throw new Error('Missing required parameters for crafting.');
        }

        // Fetch Character with comprehensive error handling
        let character = await fetchCharacterByNameAndUserId(characterName, userId);
        
        // If not found as regular character, try as mod character
        if (!character) {
            character = await fetchModCharacterByNameAndUserId(characterName, userId);
        }
        
        if (!character) {
            throw new Error(`Character **${characterName}** not found.`);
        }

        // Validate character ownership
        if (character.userId !== userId) {
            throw new Error(`Character **${characterName}** does not belong to you.`);
        }

        // Check character status (jail, etc.)
        if (character.jailed === true) {
            throw new Error(`Character **${characterName}** is currently jailed and cannot craft weapons.`);
        }

        console.log(`[validateCreateCommandRequirements]: ✅ Character validation passed for ${characterName}`);
        return character;

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js', {
            commandName: 'customWeapon',
            userTag: interaction?.user?.tag,
            userId: userId,
            characterName: characterName,
            options: {
                weaponId: weaponId,
                operation: 'validateCreateCommandRequirements'
            }
        });
        throw error;
    }
}

// ---- Function: processCraftingTransaction ----
// Handles the entire crafting transaction with comprehensive rollback
async function processCraftingTransaction(character, weaponSubmission, inventoryItems, interaction) {
    let materialsRemoved = false;
    let staminaDeducted = false;
    let weaponAdded = false;
    let weaponMarkedAsCrafted = false;
    let hasStarFragment = false;
    let hasBlueprintVoucher = false;

    try {
        console.log(`[processCraftingTransaction]: 🛠️ Starting crafting transaction for ${weaponSubmission.weaponName}`);

        // Step 1: Process materials
        // Check if Star Fragment and Blueprint Voucher are already in crafting materials
        const existingMaterialNames = weaponSubmission.craftingMaterials.map(m => m.itemName.toLowerCase());
        hasStarFragment = existingMaterialNames.includes('star fragment');
        hasBlueprintVoucher = existingMaterialNames.includes('blueprint voucher');

        const materialsToProcess = [
            ...weaponSubmission.craftingMaterials,
            // Only add Star Fragment if not already present
            ...(!hasStarFragment ? [{ itemName: 'Star Fragment', quantity: 1 }] : []),
            // Only add Blueprint Voucher if not already present
            ...(!hasBlueprintVoucher ? [{ itemName: 'Blueprint Voucher', quantity: 1 }] : [])
        ];

        console.log(`[processCraftingTransaction]: 📋 Materials to process: ${materialsToProcess.length} items`);
        console.log(`[processCraftingTransaction]:   - Has Star Fragment: ${hasStarFragment}`);
        console.log(`[processCraftingTransaction]:   - Has Blueprint Voucher: ${hasBlueprintVoucher}`);

        const processedMaterials = await processMaterials(interaction, character, inventoryItems, { craftingMaterial: materialsToProcess }, 1);
        if (processedMaterials === "canceled") {
            throw new Error('Crafting canceled due to insufficient materials.');
        }
        materialsRemoved = true;
        console.log(`[processCraftingTransaction]: ✅ Materials processed successfully`);

        // Step 2: Deduct stamina
        await checkAndUseStamina(character, weaponSubmission.staminaToCraft);
        staminaDeducted = true;
        console.log(`[processCraftingTransaction]: ✅ Stamina deducted successfully`);

        // Step 3: Add weapon to inventory
        const craftedAt = new Date();
        await addItemInventoryDatabase(
            character._id,
            weaponSubmission.weaponName,
            1,
            interaction,
            'Custom Weapon',
            craftedAt
        );
        weaponAdded = true;
        console.log(`[processCraftingTransaction]: ✅ Weapon added to inventory successfully`);

        // Step 4: Mark as crafted
        await markWeaponAsCrafted(weaponSubmission, weaponSubmission.itemId, character.name);
        weaponMarkedAsCrafted = true;
        console.log(`[processCraftingTransaction]: ✅ Weapon marked as crafted successfully`);

        // Step 5: Cleanup submission
        await cleanupCraftedSubmission(weaponSubmission.itemId, weaponSubmission.weaponName);
        console.log(`[processCraftingTransaction]: ✅ Submission cleaned up successfully`);

        console.log(`[processCraftingTransaction]: ✅ Crafting transaction completed successfully`);
        return true;

    } catch (error) {
        console.error(`[processCraftingTransaction]: ❌ Transaction failed: ${error.message}`);
        
        // Comprehensive rollback
        try {
            if (weaponMarkedAsCrafted) {
                console.log(`[processCraftingTransaction]: 🔄 Rolling back weapon marking`);
                // Note: This would require a separate function to unmark, but for now we'll log it
            }

            if (weaponAdded) {
                console.log(`[processCraftingTransaction]: 🔄 Rolling back weapon addition`);
                // Remove weapon from inventory
                await removeItemInventoryDatabase(character._id, weaponSubmission.weaponName, 1, interaction, 'Rollback');
            }

            if (staminaDeducted) {
                console.log(`[processCraftingTransaction]: 🔄 Rolling back stamina deduction`);
                await updateCharacterById(character._id, {
                    $inc: { currentStamina: weaponSubmission.staminaToCraft }
                });
            }

            if (materialsRemoved) {
                console.log(`[processCraftingTransaction]: 🔄 Rolling back material consumption`);
                // Restore materials - only restore what was actually consumed
                await addItemInventoryDatabase(character._id, weaponSubmission.craftingMaterials, 1, interaction, 'Rollback');
                
                // Only restore Star Fragment and Blueprint Voucher if they were added during processing
                if (!hasStarFragment) {
                    await addItemInventoryDatabase(character._id, 'Star Fragment', 1, interaction, 'Rollback');
                }
                if (!hasBlueprintVoucher) {
                    await addItemInventoryDatabase(character._id, 'Blueprint Voucher', 1, interaction, 'Rollback');
                }
            }

            console.log(`[processCraftingTransaction]: ✅ Rollback completed successfully`);
        } catch (rollbackError) {
            console.error(`[processCraftingTransaction]: ❌ Rollback failed: ${rollbackError.message}`);
            handleInteractionError(rollbackError, 'customWeapon.js', {
                commandName: 'customWeapon',
                userTag: interaction?.user?.tag,
                userId: interaction?.user?.id,
                characterName: character?.name,
                options: {
                    weaponName: weaponSubmission?.weaponName,
                    operation: 'processCraftingTransaction_rollback'
                }
            });
        }

        throw error;
    }
}

// ============================================================================
// ---- Command Module Export ----
// Exports the custom weapon command and its subcommands
// ============================================================================
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

execute: async (interaction) => {
    try {
        // Defer reply early for long-running commands
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }

        const subcommand = interaction.options.getSubcommand();

// ------------------- Create Custom Weapon -------------------
if (subcommand === 'create') {
    const characterName = interaction.options.getString('charactername');
    const weaponId = interaction.options.getString('weaponid');
    const userId = interaction.user.id;

    // Validate create command requirements
    let character;
    try {
        character = await validateCreateCommandRequirements(characterName, weaponId, userId, interaction);
    } catch (error) {
        console.error(`[customweapon create]: ❌ Validation failed for create command: ${error.message}`);
        await interaction.editReply({
            content: `❌ ${error.message}`,
            ephemeral: true,
        });
        return;
    }

// Retrieve Submission
console.log(`[customweapon create]: 🔍 Retrieving submission ${weaponId}`);
        const weaponSubmission = await retrieveWeaponSubmissionFromStorage(weaponId);

// Validate crafting lock with comprehensive checks
try {
    await validateCraftingLock(weaponSubmission, weaponId, characterName);
} catch (error) {
    console.error(`[customweapon create]: ❌ Crafting lock validation failed: ${error.message}`);
    await interaction.editReply({
        content: `❌ ${error.message}`,
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
    handleInteractionError(error, 'customWeapon.js');

        console.error(`[customweapon create]: Failed to fetch inventory for ${character.name}:`, error);
        await interaction.editReply({
            content: `❌ Unable to access **${character.name}**'s inventory. Please ensure it is properly synced.`,
            ephemeral: true,
        });
        return;
    }

    // Validate crafting requirements using new function
    try {
        await validateCraftingRequirements(character, weaponSubmission, inventoryItems);
    } catch (error) {
        console.error(`[customweapon create]: ❌ Validation failed: ${error.message}`);
        await interaction.editReply({
            content: `❌ ${error.message}`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Process Materials & Remove Inventory -------------------
    // ✅ Begin Transaction-safe Crafting
    try {
        await processCraftingTransaction(character, weaponSubmission, inventoryItems, interaction);
    } catch (error) {
        console.error(`[customweapon create]: Transaction error:`, error);
        await interaction.editReply({
            content: `❌ Crafting failed. Error: ${error.message}`,
            ephemeral: true,
        });
        return;
    }

    // Google Sheets logging removed - inventory is managed in database
    try {
        // Google Sheets code removed - inventory operations are handled by database functions

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js');
        console.error(`[customweapon create]: Failed to log Google Sheets crafting entry:`, error);
    }

// ------------------- Send Success Message -------------------
try {
    const updatedStamina = character.currentStamina;

    // Build materials list synchronously
    const fullMaterialsUsed = buildMaterialsList(weaponSubmission.craftingMaterials);

// Create the 🎉 Congratulations! embed
const embed = {
    title: `🎉 Congratulations, ${characterName}!`,
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
            value: fullMaterialsUsed,
            inline: false,
        },
        {
            name: `📋 Inventory Link`,
            value: character.inventory ? `[View ${characterName}'s Inventory](${character.inventory})` : `Inventory link not available`,
            inline: false,
        },
        {
            name: `What's next?`,
            value: `🛡️ Use the </gear:1306176789755858975> command to equip it and enjoy your new weapon.`,
            inline: false,
        },
    ],
    footer: { text: 'Enjoy your new weapon!' },
    image: { url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png' },
};

// Send the response with the embed
await interaction.editReply({ content: null, embeds: [embed] });

} catch (error) {
    handleInteractionError(error, 'customWeapon.js');

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
    let character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    
    // If not found as regular character, try as mod character
    if (!character) {
        character = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
    }
    
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
    handleInteractionError(error, 'customWeapon.js');

        console.error(`[customweapon submit]: Failed to fetch inventory for ${characterName}:`, error);
        await interaction.editReply({
            content: `❌ Unable to access **${characterName}**'s inventory. Please ensure it is properly synced.`,
            ephemeral: true,
        });
        return;
    }

    // ------------------- Check if Character Has "Blueprint Voucher" -------------------
    try {
        await validateBlueprintVoucher(inventoryItems, characterName, 'submit');
    } catch (error) {
        await interaction.editReply({
            content: error.message,
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
    handleInteractionError(error, 'customWeapon.js');

            console.error(`[customweapon submit]: Failed to upload image for ${weaponName}:`, error);
            return interaction.reply({
                content: '❌ Failed to upload the image. Please ensure the file is valid.',
                ephemeral: true,
            });
        }
    }

// ------------------- Duplicate Submission Check -------------------
        const allSubmissions = await getAllWeaponSubmissions(); 

// ❌ Check for duplicate weapon name globally (regardless of character)
const duplicateNameExists = allSubmissions.some(sub =>
    sub.weaponName && weaponName &&
    sub.weaponName.toLowerCase() === weaponName.toLowerCase()
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
        const existingSubmission = await retrieveWeaponSubmissionFromStorage(weaponId);
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
            content: `✅ Your custom weapon has been submitted successfully by <@${interaction.user.id}>! Awaiting mod approval.`,
            embeds: [embed],
            fetchReply: true, // ✅ This allows us to capture the message ID
        });
    } else {
        submissionMessage = await interaction.editReply({
            content: `✅ Your custom weapon has been submitted successfully by <@${interaction.user.id}>! Awaiting mod approval.`,
            embeds: [embed],
        });
    }

    // 🛠️ Save weapon submission with proper structure
    const weaponSubmissionData = {
        submissionId: weaponId,
        userId: interaction.user.id,
        username: interaction.user.username,
        userAvatar: interaction.user.displayAvatarURL({ dynamic: true }),
        category: 'customweapon',
        // Weapon-specific fields
        characterName,
        weaponName,
        baseWeapon,
        modifiers,
        type,
        subtype,
        description,
        image: uploadedImageUrl || 'https://default.image.url/weapon.png',
        itemId: weaponId,
        status: 'pending',
        submissionMessageId: submissionMessage?.id,
        notificationMessageId: null, // Will be updated after notification is sent
        submittedAt: new Date(),
        crafted: false,
        craftingMaterials: [], // Will be populated during approval
        staminaToCraft: 0, // Will be set during approval
        // Required fields for storage compatibility
        questEvent: 'N/A',
        questBonus: 'N/A',
        baseSelections: [],
        typeMultiplierSelections: [],
        productMultiplierValue: null,
        addOnsApplied: [],
        specialWorksApplied: [],
        characterCount: 1,
        typeMultiplierCounts: {},
        finalTokenAmount: 0,
        tokenCalculation: 'N/A',
        collab: null,
        blightId: null,
        tokenTracker: null,
        fileUrl: null,
        fileName: null,
        title: weaponName
    };

    await saveWeaponSubmissionToStorage(weaponId, weaponSubmissionData);

      
    
    
// ------------------- Send Pending Submission Notification to Approval Channel -------------------
try {
    const notificationChannel = await interaction.client.channels.fetch('1381479893090566144');
    if (notificationChannel) {
        const submissionLink = `https://discord.com/channels/${interaction.guild.id}/${interaction.channel.id}/${submissionMessage.id}`;

        // Create embed for notification
        const notificationEmbed = {
            color: 0xFF6B35, // Orange color for custom weapons
            title: '🛠️ PENDING CUSTOM WEAPON SUBMISSION!',
            description: '⏳ **Please approve within 24 hours!**',
            fields: [
                {
                    name: '👤 Submitted by',
                    value: `<@${interaction.user.id}>`,
                    inline: true
                },
                {
                    name: '📅 Submitted on',
                    value: `<t:${Math.floor(new Date(submissionDate).getTime() / 1000)}:F>`,
                    inline: true
                },
                {
                    name: '🆔 Submission ID',
                    value: `\`${weaponId}\``,
                    inline: true
                },
                {
                    name: '🔗 View Submission',
                    value: `[Click Here](${submissionLink})`,
                    inline: true
                },
                {
                    name: '⚔️ Weapon Details',
                    value: `**Name:** ${weaponName}\n**Base:** ${baseWeapon}\n**Type:** ${type}\n**Subtype:** ${subtype}\n**Modifiers:** ${modifiers}`,
                    inline: false
                },
                {
                    name: '📋 How to Approve',
                    value: `Use the command:\n\`/customweapon approve weaponid:${weaponId} staminatocraft:[number] materialstocraft:[items]\`\n\n**Example:**\n\`/customweapon approve weaponid:${weaponId} staminatocraft:5 materialstocraft:Iron x5, Wood x3`,
                    inline: false
                },
                {
                    name: '⚠️ Important Notes',
                    value: '• Set appropriate stamina cost \n• List all required materials with quantities\n• Use exact item names from the database\n• Materials format: "Item x1, Item x2"',
                    inline: false
                }
            ],
            image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
                text: 'Custom Weapon Approval Required'
            },
            timestamp: new Date().toISOString()
        };

        const notificationMessage = await notificationChannel.send({
            embeds: [notificationEmbed]
        });

        // ✅ Safely update submission with notificationMessageId now
        const currentSubmission = await retrieveWeaponSubmissionFromStorage(weaponId);
        if (currentSubmission) {
            currentSubmission.notificationMessageId = notificationMessage.id;
            await saveWeaponSubmissionToStorage(weaponId, currentSubmission);
        }
    } else {
        console.warn(`[customweapon submit]: Notification channel not found or bot lacks access. Submission will still be processed.`);
    }
} catch (error) {
    // Handle specific Discord API errors
    if (error.code === 50001) {
        console.warn(`[customweapon submit]: Bot lacks access to notification channel. Submission will still be processed.`);
    } else {
        handleInteractionError(error, 'customWeapon.js');
        console.error(`[customweapon submit]: Error sending notification to channel:`, error);
    }
}


} catch (error) {
    handleInteractionError(error, 'customWeapon.js');

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

    // ------------------- Input Validation -------------------
    if (!weaponId || !staminaToCraft || !materialsToCraft) {
        await interaction.editReply({
            content: '❌ Missing required parameters. Please provide weapon ID, stamina cost, and materials.',
            ephemeral: true,
        });
        return;
    }

    // Validate stamina cost
    if (staminaToCraft < 0 || staminaToCraft > 1000) {
        await interaction.editReply({
            content: '❌ Stamina cost must be between 0 and 1000.',
            ephemeral: true,
        });
        return;
    }

    // Validate materials format
    if (!materialsToCraft.trim() || !materialsToCraft.includes('x')) {
        await interaction.editReply({
            content: '❌ Materials must be formatted as "item x1, item x2, etc."',
            ephemeral: true,
        });
        return;
    }

    try {
        // Retrieve Submission
        console.log(`[customweapon approve]: 🔍 Retrieving submission ${weaponId}`);
        const weaponSubmission = await retrieveWeaponSubmissionFromStorage(weaponId);
        
        if (!weaponSubmission) {
            console.error(`[customweapon approve]: ❌ No submission found for ID: ${weaponId}`);
            await interaction.editReply({
                content: `❌ Custom weapon submission not found. Please verify the Weapon ID is correct.`,
                ephemeral: true,
            });
            return;
        }

        // Validate submission using new function
        try {
            await validateWeaponSubmission(weaponSubmission);
        } catch (error) {
            console.error(`[customweapon approve]: ❌ Validation failed: ${error.message}`);
            await interaction.editReply({
                content: `❌ ${error.message}`,
                ephemeral: true,
            });
            return;
        }

        // Validate required fields
        if (!weaponSubmission.weaponName || !weaponSubmission.characterName || !weaponSubmission.baseWeapon) {
            console.error(`[customweapon approve]: ❌ Invalid submission data for ID: ${weaponId}`);
            await interaction.editReply({
                content: `❌ The submission data is incomplete or invalid. Please contact an administrator.`,
                ephemeral: true,
            });
            return;
        }

        console.log(`[customweapon approve]: 📊 Found submission for ${weaponSubmission.weaponName} (${weaponSubmission.status})`);

        // ✅ FIXED CONDITION — Expecting to approve a 'pending' weapon, not already approved
        if (weaponSubmission.status !== 'pending') {
            console.error(`[customweapon approve]: ❌ Submission status is ${weaponSubmission.status} for ID: ${weaponId}`);
            await interaction.editReply({
                content: `❌ This weapon has already been ${weaponSubmission.status}.`,
                ephemeral: true,
            });
            return;
        }

        // ✅ Prevent approving already crafted weapons
        if (weaponSubmission.crafted === true) {
            console.error(`[customweapon approve]: ❌ Attempted to approve already crafted weapon: ${weaponId}`);
            await interaction.editReply({
                content: `❌ This weapon has already been crafted and cannot be approved again.`,
                ephemeral: true,
            });
            return;
        }

        // Validate Weapon Submission Fields
        console.log(`[customweapon approve]: 🔍 Validating weapon fields:
            Base Weapon: ${weaponSubmission.baseWeapon}
            Type: ${weaponSubmission.type}
            Subtype: ${weaponSubmission.subtype}
            Modifiers: ${weaponSubmission.modifiers}`);

        const validTypes = ['1h', '2h'];
        const validSubtypes = await fetchValidWeaponSubtypes();

        // Fetch the base weapon from database to validate
        const baseWeapon = await ItemModel.findOne({ itemName: weaponSubmission.baseWeapon });
        if (!baseWeapon) {
            console.error(`[customweapon approve]: ❌ Base weapon not found in database: ${weaponSubmission.baseWeapon}`);
            await interaction.editReply({
                content: `❌ Base weapon "${weaponSubmission.baseWeapon}" not found in the database.`,
                ephemeral: true,
            });
            return;
        }

        // Check if base weapon type matches the selected type
        if (!baseWeapon.type.includes(weaponSubmission.type)) {
            console.error(`[customweapon approve]: ❌ Base weapon type (${baseWeapon.type}) does not match selected type (${weaponSubmission.type})`);
            await interaction.editReply({
                content: `❌ The base weapon "${weaponSubmission.baseWeapon}" is a ${baseWeapon.type.join('/')} weapon, but you selected ${weaponSubmission.type}.`,
                ephemeral: true,
            });
            return;
        }

        if (!validTypes.includes(weaponSubmission.type)) {
            console.error(`[customweapon approve]: ❌ Invalid type: ${weaponSubmission.type}`);
            await interaction.editReply({
                content: `❌ Invalid weapon type: ${weaponSubmission.type}. Must be one of: ${validTypes.join(', ')}`,
                ephemeral: true,
            });
            return;
        }

        if (!validSubtypes.includes(weaponSubmission.subtype.toLowerCase())) {
            console.error(`[customweapon approve]: ❌ Invalid subtype: ${weaponSubmission.subtype}`);
            await interaction.editReply({
                content: `❌ Invalid weapon subtype: ${weaponSubmission.subtype}. Please check the available subtypes.`,
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
            handleInteractionError(error, 'customWeapon.js');
            console.error(`[customweapon approve]: Failed to fetch user with ID ${userId}:`, error);
            // Continue with approval even if user can't be found - just skip DM
        }

        // Parse Crafting Materials
        let craftingMaterials;
        try {
            console.log(`[customweapon approve]: 🛠️ Parsing materials: ${materialsToCraft}`);
            
            craftingMaterials = await parseAndValidateMaterials(materialsToCraft, interaction);

        } catch (error) {
            handleInteractionError(error, 'customWeapon.js');
            console.error(`[customweapon approve]: ❌ Error parsing materials: ${error.message}`);
            await interaction.editReply({
                content: `❌ Failed to parse materials: ${error.message}`,
                ephemeral: true,
            });
            return;
        }

        // ------------------- Database Transaction for Approval -------------------
        let approvalSuccessful = false;
        let savedItem = null;

        try {
            // Check if weapon already exists in database
            const existingWeapon = await ItemModel.findOne({ itemName: weaponSubmission.weaponName });
            if (existingWeapon) {
                await interaction.editReply({
                    content: `❌ A weapon with the name "${weaponSubmission.weaponName}" already exists in the database.`,
                    ephemeral: true,
                });
                return;
            }

            // Save Weapon to Database
            const newItem = new ItemModel({
                itemName: weaponSubmission.weaponName,
                image: weaponSubmission.image || 'https://storage.googleapis.com/tinglebot/Graphics/weapon_white.png',
                imageType: 'https://storage.googleapis.com/tinglebot/Graphics/weapon_white.png',
                category: ['Custom Weapon'],
                categoryGear: 'Weapon',
                type: [weaponSubmission.type],
                subtype: [weaponSubmission.subtype],
                craftingMaterial: craftingMaterials,
                staminaToCraft: weaponSubmission.staminaToCraft,
                itemRarity: 10,
                obtain: ['Custom Weapon'],
                modifierHearts: parseInt(weaponSubmission.modifiers, 10),
                crafting: false,
            });

            savedItem = await newItem.save();
            console.log(`[customweapon approve]: ✅ Saved weapon to database: ${savedItem._id}`);

            // Update submission status with proper initialization
            weaponSubmission.status = 'approved';
            weaponSubmission.staminaToCraft = staminaToCraft;
            weaponSubmission.craftingMaterials = craftingMaterials;
            weaponSubmission.crafted = false; // 🔐 Ensure crafted flag is explicitly set to false
            weaponSubmission.approvedAt = new Date();
            weaponSubmission.approvedBy = interaction.user.id;
            
            await saveWeaponSubmissionToStorage(weaponId, weaponSubmission);
            console.log(`[customweapon approve]: ✅ Updated submission status to approved`);

            approvalSuccessful = true;

        } catch (error) {
            handleInteractionError(error, 'customWeapon.js');
            console.error(`[customweapon approve]: Failed to save weapon to database:`, error);
            
            // If we saved the item but failed to update submission, clean up
            if (savedItem) {
                try {
                    await ItemModel.findByIdAndDelete(savedItem._id);
                    console.log(`[customweapon approve]: ✅ Cleaned up saved item due to submission update failure`);
                } catch (cleanupError) {
                    console.error(`[customweapon approve]: ❌ Failed to cleanup saved item:`, cleanupError);
                }
            }
            
            await interaction.editReply({
                content: '❌ Failed to save the weapon to the database. Please try again later.',
                ephemeral: true,
            });
            return;
        }

        // ------------------- Notification System -------------------
        if (approvalSuccessful) {
            // Update notification message if it exists
            await updateNotificationMessage(weaponSubmission, interaction);

            // Notify Submitter via DM
            await sendApprovalDM(user, weaponSubmission, craftingMaterials, staminaToCraft, weaponId, interaction);

            // Confirm Approval in Channel
            await interaction.editReply({
                content: `✅ Custom weapon **${weaponSubmission.weaponName}** has been approved and added to the database!`,
                embeds: [
                    {
                        title: `Custom Weapon Approved: ${weaponSubmission.weaponName}`,
                        description: "The item has been added to the database! Use </customweapon create:1330719656905801770> to craft it. This will consume the required stamina and materials from your character's inventory.",
                        color: 0xAA926A,
                        thumbnail: { url: weaponSubmission.image },
                        fields: [
                            { name: 'Character', value: `> ${weaponSubmission.characterName}`, inline: true },
                            { name: 'Weapon Name', value: `> ${weaponSubmission.weaponName}`, inline: true },
                            { name: 'Subtype', value: `> ${weaponSubmission.subtype}`, inline: true },
                            { name: 'Modifiers', value: `> ${weaponSubmission.modifiers}`, inline: true },
                            { name: 'Type', value: `> ${weaponSubmission.type}`, inline: true },
                            { name: 'Stamina to Craft', value: `> ${staminaToCraft}`, inline: true },
                            { name: 'Weapon ID', value: `\`\`\`${weaponSubmission.submissionId || weaponId}\`\`\``, inline: false },
                            {
                                name: '__Materials to Craft__',
                                value: buildMaterialsList(craftingMaterials),
                                inline: false,
                            }
                        ],
                        footer: { text: 'Your weapon has been added to the database!' },
                        image: {
                            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png',
                        },
                    },
                ],
            });

            console.log(`[customweapon approve]: ✅ Successfully approved weapon ${weaponSubmission.weaponName} (ID: ${weaponId})`);
        }

    } catch (error) {
        handleInteractionError(error, 'customWeapon.js');
        console.error(`[customweapon approve]: Error approving weapon:`, error);
        await interaction.editReply({
            content: `❌ An error occurred while approving the weapon. Please try again later.`,
            ephemeral: true,
        });
    }
}

} catch (error) {
    handleInteractionError(error, 'customWeapon.js');
    console.error(`[customweapon execute]: Error executing command:`, error);
    await interaction.editReply({
        content: `❌ An error occurred while processing your request. Please try again later.`,
        ephemeral: true,
    });
}
},
};
