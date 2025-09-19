// ============================================================================
// ------------------- Imports & Dependencies -------------------
// ============================================================================

// Discord.js
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

// Node.js built-ins
const fs = require('fs');
const path = require('path');

// Third-party
const { google } = require('googleapis');

// Utils
const { handleError } = require('../utils/globalErrorHandler');
const { authorizeSheets, writeSheetData } = require('../utils/googleSheetsUtils'); 
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// Models
const Quest = require('../models/QuestModel');

// Modules
const { BORDER_IMAGE, QUEST_TYPES, QUEST_CHANNEL_ID, extractVillageFromLocation } = require('../modules/questRewardModule');

// ============================================================================
// ------------------- Configuration & Constants -------------------
// ============================================================================

// Discord Configuration
const MOD_CHANNEL_ID = '795747760691216384';
const MOD_ROLE_ID = '606128760655183882';

// Google Sheets Configuration
const SHEET_ID = '1M106nBghmgng9xigxkVpUXuKIF60QXXKiAERlG1a0Gs';
const SHEET_RANGE = 'loggedQuests!A2:U';
const MAX_COLUMNS = 21;

// Column Mapping Configuration
const COLUMN_MAPPING = {
    TITLE: 0,                    // A - Title
    DESCRIPTION: 1,              // B - Description
    RULES: 2,                    // C - Rules
    DATE: 3,                     // D - Date
    QUEST_TYPE: 4,               // E - Quest Type
    LOCATION: 5,                 // F - Location
    TIME_LIMIT: 6,               // G - Time Limit
    SIGNUP_DEADLINE: 7,          // H - Signup Deadline
    PARTICIPANT_CAP: 8,          // I - Participant Cap
    POST_REQUIREMENT: 9,         // J - Post Requirement
    MIN_REQUIREMENTS: 10,        // K - Min Requirements
    TABLEROLL: 11,               // L - Table Roll
    TOKEN_REWARD: 12,            // M - Token Reward
    ITEM_REWARD_QTY: 13,         // N - Item Reward: Qty
    RP_THREAD_PARENT_CHANNEL: 14, // O - RP Thread Parent Channel
    COLLAB: 15,                  // P - Collab
    QUEST_ID: 16,                // Q - Quest ID
    STATUS: 17,                  // R - Status
    POSTED: 18,                  // S - Posted
    POSTED_AT: 19,               // T - Posted At
    BOT_NOTES: 20                // U - Bot Notes
};

// ============================================================================
// ------------------- Discord Bot Setup -------------------
// ============================================================================

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

// ============================================================================
// ------------------- Google Sheets API Setup -------------------
// ============================================================================

let serviceAccount;

if (process.env.RAILWAY_ENVIRONMENT) {
    serviceAccount = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };
} else {
    const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../config/service_account.json');
    if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
        console.error('[questAnnouncements.js] ❌ Service account file not found at', SERVICE_ACCOUNT_PATH);
        process.exit(1);
    }
    serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
}

const sheets = google.sheets({
    version: 'v4',
    auth: new google.auth.JWT(
        serviceAccount.client_email,
        null,
        serviceAccount.private_key,
        ['https://www.googleapis.com/auth/spreadsheets.readonly']
    )
});

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// ------------------- parseTokenReward -
function parseTokenReward(tokenReward) {
    const details = parseTokenRewardDetails(tokenReward);
    if (!details) return 0;
    return details.type === 'per_unit' ? details.total : details.amount;
}

// ------------------- parseTokenRewardDetails -
function parseTokenRewardDetails(tokenReward) {
    if (!tokenReward || tokenReward === 'N/A') return null;
    if (typeof tokenReward === 'number') return { type: 'flat', amount: tokenReward };
    
    const parsed = parseFloat(tokenReward);
    if (!isNaN(parsed)) return { type: 'flat', amount: parsed };
    
    if (tokenReward.toLowerCase().includes('no reward') || 
        tokenReward.toLowerCase().includes('none')) {
        return null;
    }
    
    // Handle per_unit format: per_unit:222 unit:submission max:3
    if (tokenReward.includes('per_unit:')) {
        const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
        const maxMatch = tokenReward.match(/max:(\d+)/);
        const unitMatch = tokenReward.match(/unit:(\w+)/);
        
        if (perUnitMatch) {
            const perUnit = parseInt(perUnitMatch[1]);
            const maxUnits = maxMatch ? parseInt(maxMatch[1]) : 1;
            const unit = unitMatch ? unitMatch[1] : 'submission';
            
            return {
                type: 'per_unit',
                perUnit: perUnit,
                maxUnits: maxUnits,
                unit: unit,
                total: perUnit * maxUnits
            };
        }
    }
    
    return null;
}

// ------------------- appendBotNote -
function appendBotNote(note, msg) {
    const now = new Date().toISOString();
    return (note ? `${note}\n` : '') + `[${now}] ${msg}`;
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
    postQuests,
    appendBotNote
};

// ============================================================================
// ------------------- Data Processing Functions -------------------
// ============================================================================

// ------------------- validateSheetData -
function validateSheetData(questData) {
    if (!Array.isArray(questData) || questData.length === 0) {
        throw new Error('No quest data found');
    }
    
    // Log basic info about the data
    const actualColumns = questData[0] ? questData[0].length : 0;
    console.log(`[questAnnouncements.js] 📊 Retrieved ${questData.length} rows with ${actualColumns} columns from Google Sheets`);
    
    // No validation needed - parseQuestRow handles missing columns with padding
    return questData;
}

// ------------------- parseQuestRow -
function parseQuestRow(questRow) {
    const defaults = new Array(MAX_COLUMNS).fill(null);
    const paddedRow = [...questRow, ...defaults].slice(0, MAX_COLUMNS);
    
    // Parse quest type - handle combined types
    let questType = paddedRow[COLUMN_MAPPING.QUEST_TYPE] || 'General';
    // Keep combined types as-is for now, we'll handle them in the quest model
    
    // Parse token reward - handle complex formats
    let tokenReward = paddedRow[COLUMN_MAPPING.TOKEN_REWARD] || 'No reward';
    if (tokenReward.includes('flat:')) {
        tokenReward = tokenReward.split('flat:')[1];
    } else if (tokenReward.includes('per_unit:')) {
        // Extract the per_unit value
        const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
        tokenReward = perUnitMatch ? perUnitMatch[1] : '0';
    } else if (tokenReward === 'TBD') {
        tokenReward = 'No reward';
    }
    
    // Parse item reward - handle multiple items
    let itemReward = paddedRow[COLUMN_MAPPING.ITEM_REWARD_QTY] || null;
    // Keep multiple items as-is for now, we'll handle them in the quest model
    
    // Parse collab - handle complex formats
    let collab = paddedRow[COLUMN_MAPPING.COLLAB] || null;
    if (collab && collab.includes('/')) {
        // Extract just the TRUE/FALSE part
        collab = collab.split('/')[0];
    }
    
    // Parse participant cap - handle "Unlimited" values
    let participantCap = paddedRow[COLUMN_MAPPING.PARTICIPANT_CAP] || null;
    if (participantCap === 'Unlimited' || participantCap === 'unlimited' || participantCap === 'N/A') {
        participantCap = null;
    }

    return {
        title: paddedRow[COLUMN_MAPPING.TITLE] || 'Untitled Quest',
        description: paddedRow[COLUMN_MAPPING.DESCRIPTION] || 'No description',
        rules: paddedRow[COLUMN_MAPPING.RULES] || null,
        date: paddedRow[COLUMN_MAPPING.DATE] || new Date().toISOString(),
        questType: questType,
        location: paddedRow[COLUMN_MAPPING.LOCATION] || 'Unknown',
        timeLimit: paddedRow[COLUMN_MAPPING.TIME_LIMIT] || 'No time limit',
        signupDeadline: paddedRow[COLUMN_MAPPING.SIGNUP_DEADLINE] || null,
        participantCap: participantCap,
        postRequirement: paddedRow[COLUMN_MAPPING.POST_REQUIREMENT] || null,
        minRequirements: paddedRow[COLUMN_MAPPING.MIN_REQUIREMENTS] || 0,
        tableroll: paddedRow[COLUMN_MAPPING.TABLEROLL] || null,
        tokenReward: tokenReward,
        itemReward: itemReward,
        rpThreadParentChannel: paddedRow[COLUMN_MAPPING.RP_THREAD_PARENT_CHANNEL] || null,
        collab: collab,
        questID: paddedRow[COLUMN_MAPPING.QUEST_ID] || null,
        status: paddedRow[COLUMN_MAPPING.STATUS] || 'pending',
        posted: paddedRow[COLUMN_MAPPING.POSTED] || 'No',
        postedAt: paddedRow[COLUMN_MAPPING.POSTED_AT] || null,
        botNotes: paddedRow[COLUMN_MAPPING.BOT_NOTES] || null
    };
}

// ------------------- fetchQuestData -
async function fetchQuestData() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: SHEET_RANGE,
        });
        const questData = response.data.values || [];
        return validateSheetData(questData);
    } catch (error) {
        handleError(error, 'questAnnouncements.js');
        console.error('[questAnnouncements.js] ❌ Error fetching data from Google Sheets:', error);
        return [];
    }
}

// ============================================================================
// ------------------- Validation Functions -------------------
// ============================================================================

// ------------------- validateRPThreadRequirements -
async function validateRPThreadRequirements(quest, guild) {
    const errors = [];
    const warnings = [];
    
    // Check if channel ID is provided
    if (!quest.rpThreadParentChannel || quest.rpThreadParentChannel.trim() === '') {
        errors.push('RP Thread Parent Channel is required for RP quests');
        return { valid: false, errors, warnings };
    }
    
    // Validate channel ID format
    if (!/^\d+$/.test(quest.rpThreadParentChannel)) {
        errors.push(`Invalid channel ID format: ${quest.rpThreadParentChannel}`);
        return { valid: false, errors, warnings };
    }
    
    // Get channel and validate it exists
    const parentChannel = guild.channels.cache.get(quest.rpThreadParentChannel);
    if (!parentChannel) {
        errors.push(`Channel not found: ${quest.rpThreadParentChannel}`);
        return { valid: false, errors, warnings };
    }
    
    // Check if channel supports threads
    if (parentChannel.type !== 0 && parentChannel.type !== 2) {
        errors.push(`Channel does not support threads (type: ${parentChannel.type})`);
        return { valid: false, errors, warnings };
    }
    
    // Check bot permissions
    const botMember = guild.members.me;
    if (!parentChannel.permissionsFor(botMember).has(['MANAGE_THREADS', 'SEND_MESSAGES'])) {
        errors.push('Bot lacks required permissions to create threads');
        return { valid: false, errors, warnings };
    }
    
    // Test channel access
    try {
        await parentChannel.fetch();
    } catch (error) {
        errors.push(`Cannot access channel: ${error.message}`);
        return { valid: false, errors, warnings };
    }
    
    return { valid: true, errors, warnings, parentChannel };
}

// ============================================================================
// ------------------- Notification Functions -------------------
// ============================================================================

// ------------------- sendModNotification -
async function sendModNotification(guild, questTitle, questID, errorType, errorDetails) {
    try {
        const modChannel = guild.channels.cache.get(MOD_CHANNEL_ID);
        
        if (!modChannel) {
            console.error(`[questAnnouncements.js] ❌ Mod channel ${MOD_CHANNEL_ID} not found`);
            return;
        }
        
        const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('🚨 Quest Posting Error')
            .addFields(
                { name: 'Quest', value: `${questTitle} (${questID})`, inline: true },
                { name: 'Error Type', value: errorType, inline: true },
                { name: 'Error Details', value: errorDetails, inline: false },
                { name: 'Action Required', value: 'Please check the Google Sheet and fix the RP Thread Parent Channel for this quest.', inline: false }
            )
            .setTimestamp();
        
        await modChannel.send({ 
            content: `<@&${MOD_ROLE_ID}>`, 
            embeds: [embed] 
        });
        
        console.log(`[questAnnouncements.js] ✅ Sent mod notification for quest ${questID}`);
    } catch (error) {
        console.error('[questAnnouncements.js] ❌ Failed to send mod notification:', error);
    }
}

// ------------------- validateTableRollExists -
async function validateTableRollExists(tableName) {
    try {
        const TableRoll = require('../models/TableRollModel');
        const table = await TableRoll.findOne({ name: tableName, isActive: true });
        
        return {
            exists: !!table,
            table: table,
            error: table ? null : `Table roll "${tableName}" not found or inactive`
        };
    } catch (error) {
        console.error('[questAnnouncements.js] ❌ Error validating table roll existence:', error);
        return {
            exists: false,
            table: null,
            error: `Database error: ${error.message}`
        };
    }
}

// ============================================================================
// ------------------- Embed Formatting Functions -------------------
// ============================================================================

// ------------------- formatLocationText -
function formatLocationText(location) {
    if (!location) return 'Unknown';
    
    if (location.includes('Rudania') || location.includes('Inariko') || location.includes('Vhintl')) {
        return location
            .replace(/Rudania/g, '<:rudania:899492917452890142> Rudania')
            .replace(/Inariko/g, '<:inariko:899493009073274920> Inariko')
            .replace(/Vhintl/g, '<:vhintl:899492879205007450> Vhintl');
    }
    
    return location;
}

// ------------------- formatSignupDeadline -
function formatSignupDeadline(signupDeadline) {
    if (!signupDeadline || signupDeadline === 'No Deadline') return null;
    
    try {
        const date = new Date(signupDeadline);
        if (!isNaN(date.getTime())) {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const year = String(date.getFullYear()).slice(-2);
            return `${month}-${day}-${year}`;
        }
    } catch (error) {
        // Keep original format if parsing fails
    }
    
    return signupDeadline;
}

// ------------------- formatQuestRules -
function formatQuestRules(quest) {
    let rulesText = '';
    
    if (quest.questType && quest.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase()) {
        rulesText = '• **RP Quest**: 1-week signup window\n';
        rulesText += '• **Village Rule**: Stay in quest village for entire duration\n';
        rulesText += '• **Posts**: 20+ characters, meaningful content only\n';
        if (quest.participantCap) {
            rulesText += `• **Member-capped**: Max ${quest.participantCap} participants\n`;
        }
        if (quest.tableroll) {
            rulesText += `• **Optional Table Roll**: ${quest.tableroll} table available\n`;
        }
    } else if (quest.questType && quest.questType.toLowerCase() === QUEST_TYPES.INTERACTIVE.toLowerCase() && quest.tableRollName) {
        rulesText = '• **Interactive Quest**: Use table roll mechanics\n';
        rulesText += `• **Table**: ${quest.tableRollName}\n`;
        if (quest.requiredRolls > 1) {
            rulesText += `• **Requirement**: ${quest.requiredRolls} successful rolls\n`;
        }
        if (quest.participantCap) {
            rulesText += `• **Member-capped**: Max ${quest.participantCap} participants\n`;
        }
    } else if (quest.questType && quest.questType === QUEST_TYPES.ART_WRITING) {
        rulesText = '• **Art & Writing**: Submit either art OR writing\n';
        rulesText += '• **Writing**: Minimum 500 words\n';
        rulesText += '• **Art**: Any style accepted\n';
    }
    
    if (quest.participantCap) {
        rulesText += '• **Rule**: Only ONE member-capped quest per person\n';
    }
    
    // Add additional rules if present
    if (quest.rules && quest.rules.trim()) {
        const additionalRules = quest.rules.split('\n').filter(rule => rule.trim()).map(rule => `• ${rule.trim()}`).join('\n');
        if (rulesText) {
            rulesText += additionalRules;
        } else {
            rulesText = additionalRules;
        }
    }
    
    return rulesText;
}

// ------------------- formatQuestEmbed -
function formatQuestEmbed(quest) {
    const descriptionText = quest.description || 'No description provided.';
    const descriptionLines = descriptionText.split('\n');
    const quotedDescription = descriptionLines.map(line => `> *${line.trim()}*`).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle(`📜 ${quest.title}`)
        .setDescription(quotedDescription)
        .setColor(0xAA926A)
        .setImage(BORDER_IMAGE);

    // Essential Info
    const essentialInfo = [];
    if (quest.questType) essentialInfo.push(`**Type:** ${quest.questType}`);
    if (quest.questID) essentialInfo.push(`**ID:** \`${quest.questID}\``);
    if (quest.location) essentialInfo.push(`**Location:** ${formatLocationText(quest.location)}`);
    if (quest.timeLimit) essentialInfo.push(`**Duration:** ${quest.timeLimit}`);
    if (quest.date) essentialInfo.push(`**Date:** ${quest.date}`);
    
    if (essentialInfo.length > 0) {
        embed.addFields({ 
            name: '__📋 Details__', 
            value: essentialInfo.join('\n'), 
            inline: false 
        });
    }

    // Rewards
    const rewards = [];
    const tokenDetails = parseTokenRewardDetails(quest.tokenReward);
    if (tokenDetails) {
        if (tokenDetails.type === 'per_unit') {
            rewards.push(`💰 **${tokenDetails.perUnit} tokens per ${tokenDetails.unit}** (max ${tokenDetails.maxUnits} ${tokenDetails.unit}s = **${tokenDetails.total} tokens total**)`);
        } else {
            rewards.push(`💰 **${tokenDetails.amount} tokens**`);
        }
    }
    
    if (quest.itemRewards && quest.itemRewards.length > 0) {
        for (const item of quest.itemRewards) {
            rewards.push(`🎁 **${item.name}**${item.quantity > 1 ? ` ×${item.quantity}` : ''}`);
        }
    } else if (quest.itemReward) {
        rewards.push(`🎁 **${quest.itemReward}**${quest.itemRewardQty ? ` ×${quest.itemRewardQty}` : ''}`);
    }
    
    if (rewards.length > 0) {
        embed.addFields({ 
            name: '__🏆 Rewards__', 
            value: rewards.join(' • '), 
            inline: false 
        });
    }

    // Participation
    const participation = [];
    if (quest.participantCap) participation.push(`👥 **${quest.participantCap} slots**`);
    if (quest.postRequirement) participation.push(`💬 **${quest.postRequirement} posts**`);
    if (quest.minRequirements && quest.minRequirements !== 0) participation.push(`📝 **Min requirement: ${quest.minRequirements}**`);
    
    const formattedDeadline = formatSignupDeadline(quest.signupDeadline);
    if (formattedDeadline) participation.push(`📅 **Signup by ${formattedDeadline}**`);
    
    if (participation.length > 0) {
        embed.addFields({ 
            name: '__🗓️ Participation__', 
            value: participation.join(' • '), 
            inline: false 
        });
    }

    // Rules
    const rulesText = formatQuestRules(quest);
    if (rulesText) {
        embed.addFields({ 
            name: '__📋 Rules__', 
            value: rulesText, 
            inline: false 
        });
    }

    // RP Thread link
    if (quest.questType && quest.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase() && quest.rpThreadParentChannel) {
        const guildId = quest.guildId || 'UNKNOWN';
        embed.addFields({ 
            name: '__🎭 RP Thread__', 
            value: `[Join the RP discussion here!](https://discord.com/channels/${guildId}/${quest.rpThreadParentChannel})`, 
            inline: false 
        });
    }

    // Call to Action
    if (quest.questID) {
        embed.addFields({
            name: '__🎯 Join This Quest__',
            value: `</quest join:1389946995468271729> questid:${quest.questID}`,
            inline: false
        });
    }

    // Footer
    if (quest.questID) {
        embed.setFooter({ 
            text: `Quest ID: ${quest.questID}` 
        });
    }

    embed.setTimestamp();
    return embed;
}

// ============================================================================
// ------------------- Quest Processing Helper Functions -------------------
// ============================================================================

// ------------------- parseItemReward -
function parseItemReward(itemReward) {
    if (!itemReward || itemReward === 'N/A' || itemReward === '') {
        return { item: null, qty: 0 };
    }
    
    // Handle multiple items separated by semicolons
    if (itemReward.includes(';')) {
        const firstItem = itemReward.split(';')[0].trim();
        if (firstItem.includes(':')) {
            const [itemName, qty] = firstItem.split(':').map(s => s.trim());
            return { item: itemName, qty: parseInt(qty, 10) || 1 };
        }
        return { item: firstItem, qty: 1 };
    }
    
    if (itemReward.includes(':')) {
        const [itemName, qty] = itemReward.split(':').map(s => s.trim());
        return { item: itemName, qty: parseInt(qty, 10) || 1 };
    }
    
    return { item: itemReward, qty: 1 };
}

// ------------------- parseCollabSettings -
function parseCollabSettings(collab) {
    if (!collab || collab === 'N/A' || collab === '') {
        return { allowed: false, rule: null };
    }
    
    // Handle complex formats like "TRUE/FULL_EACH" or "TRUE/SPLIT_EQUAL"
    if (collab.includes('/')) {
        const allowedPart = collab.split('/')[0];
        return {
            allowed: allowedPart.toLowerCase() === 'true',
            rule: null
        };
    }
    
    if (collab.includes(',')) {
        const parts = collab.split(',');
        const allowedPart = parts.find(p => p.toLowerCase().includes('allowed'));
        const rulePart = parts.find(p => p.toLowerCase().includes('rule'));
        
        return {
            allowed: allowedPart ? allowedPart.toLowerCase().includes('true') : false,
            rule: rulePart ? rulePart.split(':')[1]?.trim() : null
        };
    }
    
    return { allowed: collab.toLowerCase() === 'true', rule: null };
}

// ------------------- sanitizeQuestData -
function sanitizeQuestData(parsedQuest) {
    const itemReward = parseItemReward(parsedQuest.itemReward);
    const collab = parseCollabSettings(parsedQuest.collab);
    
    // Parse multiple items if present
    let itemRewards = [];
    if (parsedQuest.itemReward && parsedQuest.itemReward.includes(';')) {
        const itemStrings = parsedQuest.itemReward.split(';');
        for (const itemString of itemStrings) {
            const trimmed = itemString.trim();
            if (trimmed.includes(':')) {
                const [name, qty] = trimmed.split(':').map(s => s.trim());
                itemRewards.push({
                    name: name,
                    quantity: parseInt(qty, 10) || 1
                });
            } else {
                itemRewards.push({
                    name: trimmed,
                    quantity: 1
                });
            }
        }
    }
    
    return {
        title: parsedQuest.title || 'Untitled Quest',
        description: parsedQuest.description || 'No description provided.',
        questType: parsedQuest.questType || 'General',
        location: parsedQuest.location || 'Quest Location',
        timeLimit: parsedQuest.timeLimit || 'No time limit',
        minRequirements: parsedQuest.minRequirements || 0,
        tableroll: parsedQuest.tableroll && parsedQuest.tableroll !== 'N/A' && parsedQuest.tableroll !== '' ? parsedQuest.tableroll : null,
        tokenReward: parsedQuest.tokenReward === 'N/A' || !parsedQuest.tokenReward ? 'No reward specified' : parsedQuest.tokenReward,
        itemReward: itemReward.item,
        itemRewardQty: itemReward.qty,
        itemRewards: itemRewards,
        signupDeadline: parsedQuest.signupDeadline && parsedQuest.signupDeadline !== 'N/A' ? parsedQuest.signupDeadline : null,
        participantCap: parsedQuest.participantCap === 'N/A' || !parsedQuest.participantCap || parsedQuest.participantCap === 'Unlimited' || parsedQuest.participantCap === 'unlimited' ? null : (() => {
            const parsed = parseInt(parsedQuest.participantCap, 10);
            return isNaN(parsed) ? null : parsed;
        })(),
        postRequirement: parsedQuest.postRequirement === 'N/A' || !parsedQuest.postRequirement ? null : (() => {
            const parsed = parseInt(parsedQuest.postRequirement, 10);
            return isNaN(parsed) ? null : parsed;
        })(),
        specialNote: parsedQuest.rules && parsedQuest.rules !== 'N/A' && parsedQuest.rules !== '' ? parsedQuest.rules : null,
        participants: new Map(),
        status: 'active',
        date: parsedQuest.date || new Date().toISOString(),
        questID: null,
        posted: false,
        postedAt: null,
        targetChannel: QUEST_CHANNEL_ID,
        rpThreadParentChannel: parsedQuest.rpThreadParentChannel || null,
        roleID: null,
        collabAllowed: collab.allowed,
        collabRule: collab.rule,
        rules: parsedQuest.rules && parsedQuest.rules !== 'N/A' && parsedQuest.rules !== '' ? parsedQuest.rules : null,
        botNotes: parsedQuest.botNotes || null,
    };
}

// ------------------- handleRPQuestSetup -
async function handleRPQuestSetup(sanitizedQuest, guild) {
    if (!sanitizedQuest.postRequirement) {
        sanitizedQuest.postRequirement = 15;
    }
    
    if (!sanitizedQuest.signupDeadline) {
        const questDate = new Date(sanitizedQuest.date);
        const rpDeadline = new Date(questDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        sanitizedQuest.signupDeadline = rpDeadline.toISOString().split('T')[0];
    }

    const rpValidation = await validateRPThreadRequirements(sanitizedQuest, guild);
    if (!rpValidation.valid) {
        console.error(`[questAnnouncements.js] ❌ RP Quest "${sanitizedQuest.title}" validation failed:`, rpValidation.errors);
        sanitizedQuest.botNotes = `ERROR: RP Thread validation failed - ${rpValidation.errors.join(', ')}`;
        sanitizedQuest.posted = false;
        
        await sendModNotification(guild, sanitizedQuest.title, 'TBD', 'RP Thread Validation Failed', rpValidation.errors.join(', '));
        return false;
    }

    sanitizedQuest.specialNote = 'RP Quest Rules: 15-20 posts minimum, 2 paragraph maximum per post, member-driven.';
    return true;
}

// ------------------- handleInteractiveQuestSetup -
async function handleInteractiveQuestSetup(sanitizedQuest, guild) {
    if (sanitizedQuest.questType.toLowerCase() !== QUEST_TYPES.INTERACTIVE.toLowerCase()) {
        return true;
    }
    
    // Parse minRequirements for table roll configuration
    const minRequirements = sanitizedQuest.minRequirements;
    
    if (typeof minRequirements === 'string' && minRequirements.includes(':')) {
        // Parse table roll configuration from minRequirements field
        // Format: "tableName:requiredRolls:successCriteria"
        // Example: "treasure_chest:3:item:sword" or "loot_table:1:rarity:rare"
        const parts = minRequirements.split(':');
        
        if (parts.length >= 2) {
            const tableName = parts[0];
            const requiredRolls = parseInt(parts[1]) || 1;
            const successCriteria = parts[2] || null;
            
            // Validate that the table roll exists
            const tableValidation = await validateTableRollExists(tableName);
            if (!tableValidation.exists) {
                console.error(`[questAnnouncements.js] ❌ Interactive quest "${sanitizedQuest.title}" references non-existent table roll: ${tableName}`);
                sanitizedQuest.botNotes = `ERROR: Table roll "${tableName}" does not exist`;
                sanitizedQuest.posted = false;
                
                await sendModNotification(guild, sanitizedQuest.title, 'TBD', 'Table Roll Validation Failed', `Table roll "${tableName}" does not exist`);
                return false;
            }
            
            // Set table roll configuration
            sanitizedQuest.tableRollName = tableName;
            sanitizedQuest.requiredRolls = requiredRolls;
            sanitizedQuest.rollSuccessCriteria = successCriteria;
            sanitizedQuest.tableRollConfig = {
                tableName,
                requiredRolls,
                successCriteria
            };
            
            console.log(`[questAnnouncements.js] ✅ Interactive quest "${sanitizedQuest.title}" configured with table roll: ${tableName}`);
        } else {
            sanitizedQuest.botNotes = `WARNING: Invalid table roll configuration format: ${minRequirements}`;
        }
    } else if (typeof minRequirements === 'number' && minRequirements > 0) {
        // Simple numeric requirement - default table roll setup
        sanitizedQuest.requiredRolls = minRequirements;
        sanitizedQuest.tableRollConfig = {
            requiredRolls: minRequirements,
            successCriteria: null
        };
    } else {
        sanitizedQuest.botNotes = `WARNING: No table roll configuration found for interactive quest`;
    }
    
    return true;
}

// ------------------- createQuestRole -
async function createQuestRole(guild, questTitle) {
    let role = guild.roles.cache.find(r => r.name === `Quest: ${questTitle}`);
    
    if (!role) {
        role = await guild.roles.create({
            name: `Quest: ${questTitle}`,
            color: 0xAA926A,
            mentionable: true,
            reason: `Automatically created for the quest: "${questTitle}"`
        });
        console.log(`[questAnnouncements.js] ✅ Role created for quest: "${questTitle}" with ID: ${role.id}`);
    }
    
    return role;
}

// ------------------- createRPThread -
async function createRPThread(guild, quest) {
    if (quest.questType.toLowerCase() !== QUEST_TYPES.RP.toLowerCase() || !quest.rpThreadParentChannel) {
        return null;
    }
    
    try {
        const parentChannel = guild.channels.cache.get(quest.rpThreadParentChannel);
        if (!parentChannel) {
            quest.botNotes = `Parent channel not found: ${quest.rpThreadParentChannel}`;
            return null;
        }
        
        if (parentChannel.type !== 0 && parentChannel.type !== 2) {
            quest.botNotes = `Parent channel does not support threads (type: ${parentChannel.type})`;
            return null;
        }
        
        if (!parentChannel.threads) {
            quest.botNotes = `Channel threads property is undefined`;
            return null;
        }
        
        const rpThread = await parentChannel.threads.create({
            name: `📜 ${quest.title} - RP Thread`,
            autoArchiveDuration: 1440,
            reason: `Auto-created RP thread for quest: ${quest.title}`,
            type: 11
        });
        
        console.log(`[questAnnouncements.js] ✅ Created RP thread: ${rpThread.name} (${rpThread.id})`);
        
        const rpThreadEmbed = new EmbedBuilder()
            .setColor(0xAA926A)
            .setTitle(`📜 ${quest.title} - RP Thread`)
            .setDescription(`**Requirements**: ${quest.postRequirement || 15} posts • 2 paragraph max per post\n**Quest ID**: \`${quest.questID}\` • **Status**: Active`)
            .addFields(
                { 
                    name: '🎭 How to Join', 
                    value: `</quest join:1389946995468271729> questid:${quest.questID} charactername:YourCharacter`, 
                    inline: false 
                },
                { 
                    name: '📋 RP Rules', 
                    value: '• Posts must be 20+ characters with meaningful content\n• No reactions, emojis only, or "))" posts\n• Stay in the quest village for the entire duration\n• Use </quest postcount:1389946995468271729> to check your progress', 
                    inline: false 
                }
            )
            .setTimestamp();

        await rpThread.send({ embeds: [rpThreadEmbed] });
        console.log(`[questAnnouncements.js] ✅ Posted initial message in RP thread`);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        quest.rpThreadParentChannel = rpThread.id;
        quest.guildId = guild.id;
        console.log(`[questAnnouncements.js] ✅ Stored RP thread ID ${rpThread.id} and guild ID ${guild.id} for quest "${quest.title}"`);
        
        return rpThread;
    } catch (error) {
        console.error(`[questAnnouncements.js] ❌ Failed to create RP thread for quest "${quest.title}":`, error);
        quest.botNotes = `Failed to create RP thread: ${error.message}`;
        return null;
    }
}

// ------------------- saveQuestToDatabase -
async function saveQuestToDatabase(quest) {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
        try {
            const savedQuest = await Promise.race([
                new Quest(quest).save(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Database save timeout after 15 seconds')), 15000)
                )
            ]);
            
            console.log(`[questAnnouncements.js] ✅ Quest "${quest.title}" saved to database with ID: ${savedQuest._id}`);
            return savedQuest;
        } catch (error) {
            retryCount++;
            console.log(`[questAnnouncements.js] ⚠️ Database save attempt ${retryCount}/${maxRetries} failed for quest "${quest.title}": ${error.message}`);
            
            if (retryCount >= maxRetries) {
                throw error;
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

// ============================================================================
// ------------------- Quest Processing Helper Functions -------------------
// ============================================================================

// ------------------- filterQuestsForCurrentMonth -
function filterQuestsForCurrentMonth(questData) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    return questData.filter(quest => {
        const parsedQuest = parseQuestRow(quest);
        const questDate = parsedQuest.date;
        
        if (!questDate) return false;
        
        let questMonth, questYear;
        
        if (questDate.includes(' ')) {
            // Format: "October 2025"
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
            const parts = questDate.split(' ');
            const monthName = parts[0];
            questMonth = monthNames.indexOf(monthName) + 1;
            questYear = parseInt(parts[1]);
        } else if (questDate.includes('/')) {
            // Format: "10/2025"
            const parts = questDate.split('/');
            questMonth = parseInt(parts[0]);
            questYear = parseInt(parts[1]);
        } else {
            return false;
        }
        
        return questMonth === currentMonth && questYear === currentYear;
    });
}

// ------------------- filterUnpostedQuests -
function filterUnpostedQuests(quests) {
    return quests.filter((quest, index) => {
        const parsedQuest = parseQuestRow(quest);
        const sanitizedPosted = parsedQuest.posted ? parsedQuest.posted.trim().toLowerCase() : '';
        
        if (sanitizedPosted === 'posted' && parsedQuest.questID && parsedQuest.questID !== 'N/A') {
            console.log(`[questAnnouncements.js] ⏭️ Skipping quest "${parsedQuest.title}" - Already posted with ID ${parsedQuest.questID}`);
            return false;
        }
        
        return true;
    });
}

// ------------------- processIndividualQuest -
async function processIndividualQuest(quest, guild, questChannel, auth, rowIndex) {
    const parsedQuest = parseQuestRow(quest);
    console.log(`[questAnnouncements.js] 🔍 Processing quest: "${parsedQuest.title}"`);

    try {
        const sanitizedQuest = sanitizeQuestData(parsedQuest);
        
        // Handle quest type specific setup
        if (sanitizedQuest.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase()) {
            const rpValid = await handleRPQuestSetup(sanitizedQuest, guild);
            if (!rpValid) return false;
        } else if (sanitizedQuest.questType.toLowerCase() === 'interactive') {
            const interactiveValid = await handleInteractiveQuestSetup(sanitizedQuest, guild);
            if (!interactiveValid) return false;
        }
        
        // Generate quest ID and create role
        sanitizedQuest.questID = generateUniqueId('Q');
        const role = await createQuestRole(guild, sanitizedQuest.title);
        sanitizedQuest.roleID = role.id;
        
        // Set required village for RP quests
        if (sanitizedQuest.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase()) {
            sanitizedQuest.requiredVillage = extractVillageFromLocation(sanitizedQuest.location);
        }
        
        // Create RP thread if needed
        await createRPThread(guild, sanitizedQuest);
        
        // Post quest embed
        const questEmbed = formatQuestEmbed(sanitizedQuest);
        const message = await questChannel.send({ embeds: [questEmbed] });
        sanitizedQuest.messageID = message.id;
        
        // Save to database
        await saveQuestToDatabase(sanitizedQuest);
        
        // Update Google Sheets
        sanitizedQuest.posted = true;
        sanitizedQuest.postedAt = new Date();
        
        try {
            await markQuestAsPosted(auth, rowIndex, sanitizedQuest.questID);
            console.log(`[questAnnouncements.js] ✅ Quest "${sanitizedQuest.title}" marked as posted in Google Sheets`);
        } catch (sheetError) {
            console.error(`[questAnnouncements.js] ❌ Failed to mark quest as posted in Google Sheets:`, sheetError.message);
            await sendModNotification(guild, sanitizedQuest.title, sanitizedQuest.questID, 'Sheet Update Failed', sheetError.message);
        }
        
        return true;
    } catch (error) {
        handleError(error, 'questAnnouncements.js');
        console.error(`[questAnnouncements.js] ❌ Failed to process quest "${parsedQuest.title || 'Untitled Quest'}":`, error);
        await sendModNotification(guild, parsedQuest.title || 'Untitled Quest', 'TBD', 'Quest Processing Failed', error.message);
        return false;
    }
}

// ------------------- checkQuestCompletions -
async function checkQuestCompletions() {
    try {
        const activeQuests = await Quest.find({ 
            status: 'active',
            postedAt: { $exists: true, $ne: null }
        });
        let completedCount = 0;
        
        for (const quest of activeQuests) {
            try {
                const postedAt = new Date(quest.postedAt);
                const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
                
                if (postedAt < oneHourAgo) {
                    const completionResult = await quest.checkAutoCompletion();
                    if (completionResult.completed) {
                        completedCount++;
                    }
                }
            } catch (questError) {
                // Continue with other quests
            }
        }
        
        if (completedCount > 0) {
            console.log(`[questAnnouncements.js] ✅ Processed ${completedCount} quest completions`);
        }
    } catch (error) {
        console.error('[questAnnouncements.js] ❌ Error checking quest completion:', error);
    }
}

// ============================================================================
// ------------------- Main Quest Processing Function -------------------
// ============================================================================

// ------------------- postQuests -
async function postQuests(externalClient = null) {
    console.log('[questAnnouncements.js] 🚀 Starting quest posting process...');
    
    // Use external client if provided, otherwise use the internal client
    const activeClient = externalClient || client;
    
    // Fetch quest channel
    let questChannel;
    try {
        questChannel = await activeClient.channels.fetch(QUEST_CHANNEL_ID);
        if (!questChannel) {
            console.error('[questAnnouncements.js] ❌ Quest channel not found!');
            return;
        }
    } catch (error) {
        console.error('[questAnnouncements.js] ❌ Error fetching quest channel:', error);
        return;
    }

    // Get quest data from Google Sheets
    const auth = await authorizeSheets();
    const questData = await fetchQuestData();

    if (!questData.length) {
        console.log('[questAnnouncements.js] ℹ️ No quest data found in Google Sheets');
        return;
    }

    console.log(`[questAnnouncements.js] 📊 Retrieved ${questData.length} quests from sheet`);

    // Filter quests for current month
    const questsForCurrentMonth = filterQuestsForCurrentMonth(questData);
    
    if (questsForCurrentMonth.length === 0) {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        console.log(`[questAnnouncements.js] ℹ️ No quests scheduled for ${currentMonth}/${currentYear}. Skipping quest posting.`);
        return;
    }
    
    console.log(`[questAnnouncements.js] ✅ Found ${questsForCurrentMonth.length} quests scheduled for current month. Proceeding with posting.`);

    // Filter unposted quests
    const unpostedQuests = filterUnpostedQuests(questsForCurrentMonth);

    if (!unpostedQuests.length) {
        console.log('[questAnnouncements.js] ℹ️ No new quests to post. All quests are already marked as "Posted"');
        return;
    }

    console.log(`[questAnnouncements.js] 📝 Found ${unpostedQuests.length} quests to post`);
    const guild = questChannel.guild;

    // Process each quest
    for (const [rowIndex, quest] of unpostedQuests.entries()) {
        await processIndividualQuest(quest, guild, questChannel, auth, rowIndex);
    }
       
    console.log('[questAnnouncements.js] ✅ Finished processing quests');
    
    // Check quest completions
    await checkQuestCompletions();
}

// ============================================================================
// ------------------- Google Sheets Functions -------------------
// ============================================================================

// ------------------- markQuestAsPosted -
async function markQuestAsPosted(auth, rowIndex, questID) {
    try {
        console.log(`[questAnnouncements.js] 📝 Marking quest as posted in Google Sheets (Row: ${rowIndex + 2}, Quest ID: ${questID})`);
        const now = new Date().toISOString();
        await writeSheetData(auth, SHEET_ID, `loggedQuests!Q${rowIndex + 2}:T${rowIndex + 2}`, [[questID, 'active', 'Posted', now]]);
        console.log(`[questAnnouncements.js] ✅ Quest marked as posted in Google Sheets (Row: ${rowIndex + 2})`);
    } catch (error) {
        handleError(error, 'questAnnouncements.js');
        console.error('[questAnnouncements.js] ❌ Failed to mark quest as posted in Google Sheets:', error);
    }
}

// ============================================================================
// ------------------- Discord Bot Event Handlers -------------------
// ============================================================================

// ------------------- Test Command Handler -
client.on('messageCreate', async (message) => {
    if (message.content.trim() === '!testQuests') {
        console.log('[questAnnouncements.js] 🧪 Triggering quest posting manually');
        try {
            await postQuests();
            await message.reply('✅ Quests have been posted for testing!');
        } catch (error) {
            handleError(error, 'questAnnouncements.js');
            console.error('[questAnnouncements.js] ❌ Failed to execute postQuests:', error);
            await message.reply('❌ An error occurred while posting quests.');
        }
    }
});

// ------------------- Bot Ready Handler -
client.once('ready', () => {
    console.log(`[questAnnouncements.js] 🤖 Logged in as ${client.user.tag}`);
});

// ------------------- Bot Error Handler -
client.on('error', (error) => {
    console.error('[questAnnouncements.js] ❌ Discord client error:', error);
});

// ============================================================================
// ------------------- Bot Initialization -------------------
// ============================================================================

client.login(process.env.DISCORD_BOT_TOKEN);
