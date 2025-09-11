// ============================================================================
// ------------------- Imports & Dependencies -------------------
// ============================================================================

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { authorizeSheets, writeSheetData } = require('../utils/googleSheetsUtils'); 
const Quest = require('../models/QuestModel');
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ============================================================================
// ------------------- Configuration & Constants -------------------
// ============================================================================

const QUEST_CHANNEL_ID = process.env.TEST_CHANNEL_ID || '1305486549252706335';
const SHEET_ID = '1M106nBghmgng9xigxkVpUXuKIF60QXXKiAERlG1a0Gs';
const MOD_CHANNEL_ID = '795747760691216384';
const MOD_ROLE_ID = '606128760655183882';

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
    if (!tokenReward || tokenReward === 'N/A') return 0;
    if (typeof tokenReward === 'number') return Math.max(0, tokenReward);
    
    const parsed = parseFloat(tokenReward);
    if (!isNaN(parsed)) return Math.max(0, parsed);
    
    if (tokenReward.toLowerCase().includes('no reward') || 
        tokenReward.toLowerCase().includes('none')) {
        return 0;
    }
    
    return 0;
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
// ------------------- Column Mapping Configuration -------------------
// ============================================================================

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
// ------------------- Data Processing Functions -------------------
// ============================================================================

// ------------------- validateSheetData -
function validateSheetData(questData) {
    if (!Array.isArray(questData) || questData.length === 0) {
        throw new Error('No quest data found');
    }
    
    const expectedColumns = Object.keys(COLUMN_MAPPING).length;
    const invalidRows = questData.filter((row, index) => {
        if (!Array.isArray(row) || row.length < expectedColumns) {
            console.warn(`[questAnnouncements.js] ⚠️ Row ${index + 2}: Expected ${expectedColumns} columns, got ${row.length}`);
            return true;
        }
        return false;
    });
    
    if (invalidRows.length > 0) {
        console.warn(`[questAnnouncements.js] ⚠️ Found ${invalidRows.length} rows with invalid column count`);
    }
    
    return questData;
}

// ------------------- parseQuestRow -
function parseQuestRow(questRow) {
    const defaults = new Array(21).fill(null);
    const paddedRow = [...questRow, ...defaults].slice(0, 21);
    
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
    
    return {
        title: paddedRow[COLUMN_MAPPING.TITLE] || 'Untitled Quest',
        description: paddedRow[COLUMN_MAPPING.DESCRIPTION] || 'No description',
        rules: paddedRow[COLUMN_MAPPING.RULES] || null,
        date: paddedRow[COLUMN_MAPPING.DATE] || new Date().toISOString(),
        questType: questType,
        location: paddedRow[COLUMN_MAPPING.LOCATION] || 'Unknown',
        timeLimit: paddedRow[COLUMN_MAPPING.TIME_LIMIT] || 'No time limit',
        signupDeadline: paddedRow[COLUMN_MAPPING.SIGNUP_DEADLINE] || null,
        participantCap: paddedRow[COLUMN_MAPPING.PARTICIPANT_CAP] || null,
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
            range: 'loggedQuests!A2:U',
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
    
    if (!quest.rpThreadParentChannel || quest.rpThreadParentChannel.trim() === '') {
        errors.push('RP Thread Parent Channel is required for RP quests');
        return { valid: false, errors, warnings };
    }
    
    if (!/^\d+$/.test(quest.rpThreadParentChannel)) {
        errors.push(`Invalid channel ID format: ${quest.rpThreadParentChannel}`);
        return { valid: false, errors, warnings };
    }
    
    const parentChannel = guild.channels.cache.get(quest.rpThreadParentChannel);
    if (!parentChannel) {
        errors.push(`Channel not found: ${quest.rpThreadParentChannel}`);
        return { valid: false, errors, warnings };
    }
    
    if (parentChannel.type !== 0 && parentChannel.type !== 2) {
        errors.push(`Channel does not support threads (type: ${parentChannel.type})`);
        return { valid: false, errors, warnings };
    }
    
    const botMember = guild.members.me;
    if (!parentChannel.permissionsFor(botMember).has(['MANAGE_THREADS', 'SEND_MESSAGES'])) {
        errors.push('Bot lacks required permissions to create threads');
        return { valid: false, errors, warnings };
    }
    
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
        console.error(`[questAnnouncements.js] ❌ Failed to send mod notification:`, error);
    }
}

// ============================================================================
// ------------------- Embed Formatting Functions -------------------
// ============================================================================

// ------------------- formatQuestEmbed -
function formatQuestEmbed(quest) {
    const descriptionText = quest.description || 'No description provided.';
    const descriptionLines = descriptionText.split('\n');
    const quotedDescription = descriptionLines.map(line => `> *${line.trim()}*`).join('\n');
    
    const embed = new EmbedBuilder()
        .setTitle(`📜 ${quest.title}`)
        .setDescription(quotedDescription)
        .setColor(0xAA926A)
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

    // Quest Details
    const essentialInfo = [];
    if (quest.questType) essentialInfo.push(`**📖 Type:** ${quest.questType}`);
    
    if (quest.location) {
        let locationText = `**📍 Location:** ${quest.location}`;
        
        if (quest.location.includes('Rudania') || quest.location.includes('Inariko') || quest.location.includes('Vhintl')) {
            let villages = quest.location;
            villages = villages.replace(/Rudania/g, '<:rudania:899492917452890142> Rudania');
            villages = villages.replace(/Inariko/g, '<:inariko:899493009073274920> Inariko');
            villages = villages.replace(/Vhintl/g, '<:vhintl:899492879205007450> Vhintl');
            locationText = `**📍 Location:** ${villages}`;
        }
        
        essentialInfo.push(locationText);
    }
    
    if (quest.timeLimit) essentialInfo.push(`**⏰ Duration:** ${quest.timeLimit}`);
    if (quest.date) essentialInfo.push(`**📅 Date:** ${quest.date}`);
    if (quest.questID) essentialInfo.push(`**🆔 Quest ID:** \`${quest.questID}\``);
    
    if (essentialInfo.length > 0) {
        embed.addFields({ 
            name: '__📋 Quest Details__', 
            value: essentialInfo.join('\n'), 
            inline: false 
        });
    }

    // Rewards
    const rewards = [];
    const normalizedTokenReward = quest.getNormalizedTokenReward ? quest.getNormalizedTokenReward() : parseTokenReward(quest.tokenReward);
    if (normalizedTokenReward > 0) {
        rewards.push(`💰 **${normalizedTokenReward}** tokens`);
    }
    
    // Handle multiple items
    if (quest.itemRewards && quest.itemRewards.length > 0) {
        for (const item of quest.itemRewards) {
            rewards.push(`🎁 **${item.name}**${item.quantity > 1 ? ` × **${item.quantity}**` : ''}`);
        }
    } else if (quest.itemReward) {
        rewards.push(`🎁 **${quest.itemReward}**${quest.itemRewardQty ? ` × **${quest.itemRewardQty}**` : ''}`);
    }
    
    if (quest.minRequirements && quest.minRequirements > 0) {
        rewards.push(`🔑 **Min Requirements:** ${quest.minRequirements}`);
    }
    
    if (rewards.length > 0) {
        embed.addFields({ 
            name: '__🏆 Rewards__', 
            value: rewards.join('\n'), 
            inline: false 
        });
    }

    // Participation
    const participation = [];
    if (quest.signupDeadline && quest.signupDeadline !== 'No Deadline') {
        let formattedDate = quest.signupDeadline;
        try {
            const date = new Date(quest.signupDeadline);
            if (!isNaN(date.getTime())) {
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const year = String(date.getFullYear()).slice(-2);
                formattedDate = `${month}-${day}-${year}`;
            }
        } catch (error) {
            // Keep original format if parsing fails
        }
        participation.push(`📅 **Signup Deadline:** ${formattedDate}`);
    }
    if (quest.participantCap) {
        participation.push(`👥 **Participant Cap:** ${quest.participantCap} ⚠️`);
    }
    if (quest.postRequirement) {
        participation.push(`💬 **Post Requirement:** ${quest.postRequirement} posts`);
    }
    if (quest.questType && quest.questType.toLowerCase() === 'interactive' && quest.tableRollName) {
        const rollInfo = `🎲 **Table Roll:** ${quest.tableRollName}`;
        const rollRequirement = quest.requiredRolls > 1 ? ` (${quest.requiredRolls} successful rolls required)` : '';
        const criteria = quest.rollSuccessCriteria ? ` - Success: ${quest.rollSuccessCriteria}` : '';
        participation.push(rollInfo + rollRequirement + criteria);
    }
    
    if (participation.length > 0) {
        embed.addFields({ 
            name: '__🗓️ Participation__', 
            value: participation.join('\n'), 
            inline: false 
        });
    }

    // RP Thread
    if (quest.questType && quest.questType.toLowerCase() === 'rp' && quest.rpThreadParentChannel) {
        const guildId = quest.guildId || 'UNKNOWN';
        embed.addFields({ 
            name: '__🎭 RP Thread__', 
            value: `> 🧵 [Join the RP discussion here!](https://discord.com/channels/${guildId}/${quest.rpThreadParentChannel})`, 
            inline: false 
        });
    } else if (quest.questType && quest.questType.toLowerCase() === 'rp') {
        embed.addFields({ 
            name: '__🎭 RP Thread__', 
            value: `> ⚠️ RP thread will be created when quest is posted`, 
            inline: false 
        });
    }

    // Quest Rules
    let rulesText = '• Use </quest join:1389946995468271729> to participate\n';
    
    if (quest.participantCap) {
        rulesText += `• ⚠️  Member-capped quest (max ${quest.participantCap} participants)\n`;
        rulesText += '• 🚫 Only ONE member-capped quest per person\n';
    }
    if (quest.questType && quest.questType.toLowerCase() === 'rp') {
        rulesText += '• 🎭 RP quests: 1-week signup window\n';
        rulesText += '• 🎫 Use Quest Vouchers for guaranteed spots!\n';
        rulesText += '• 📝 RP posts must be 20+ characters with meaningful content\n';
        rulesText += '• ❌ Posts that DON\'T count: reactions, emojis only, "))" posts, URLs only\n';
        if (quest.tableroll) {
            rulesText += `• 🎲 **Optional Table Roll**: Use </tableroll roll:1389946995468271729> to roll on **${quest.tableroll}** table\n`;
        }
        rulesText += '• 📊 Use </quest postcount:1389946995468271729> to check your progress\n';
        rulesText += '• 🏘️ **IMPORTANT**: You must stay in the quest village for the entire duration!\n';
        rulesText += '• ⚠️ Leaving the village will disqualify you from the quest\n';
    }
    
    if (quest.questType && quest.questType.toLowerCase() === 'interactive' && quest.tableRollName) {
        rulesText += '• 🎲 Interactive quests: Use table roll mechanics\n';
        rulesText += '• 🎫 Use Quest Vouchers for guaranteed spots!\n';
        rulesText += `• 🎯 Roll on **${quest.tableRollName}** table to complete quest\n`;
        if (quest.requiredRolls > 1) {
            rulesText += `• ✅ Need ${quest.requiredRolls} successful rolls to complete\n`;
        }
        if (quest.rollSuccessCriteria) {
            rulesText += `• 🎯 Success criteria: ${quest.rollSuccessCriteria}\n`;
        }
        rulesText += '• 📊 Use </quest postcount:1389946995468271729> to check your progress\n';
    }
    
    if (quest.questType && quest.questType === 'Art / Writing') {
        rulesText += '• 🎨 Art & Writing quests: Submit either art OR writing\n';
        rulesText += '• 🎫 Use Quest Vouchers for guaranteed spots!\n';
        rulesText += '• 📝 Writing: Minimum 500 words\n';
        rulesText += '• 🎨 Art: Any art style accepted\n';
        rulesText += '• 📊 Use </quest postcount:1389946995468271729> to check your progress\n';
    }
    
    if (quest.rules && quest.rules.trim()) {
        rulesText += '\n';
        rulesText += '**__📋 Additional Rules:__**\n';
        rulesText += quest.rules;
    }
    
    embed.addFields({ 
        name: '__📋 Quest Rules__', 
        value: rulesText, 
        inline: false 
    });

    if (quest.questID) {
        embed.setFooter({ 
            text: `🆔 Quest ID: ${quest.questID}`, 
            iconURL: 'https://cdn.discordapp.com/emojis/1234567890123456789.png' 
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
        participantCap: parsedQuest.participantCap === 'N/A' || !parsedQuest.participantCap ? null : parseInt(parsedQuest.participantCap, 10),
        postRequirement: parsedQuest.postRequirement === 'N/A' || !parsedQuest.postRequirement ? null : parseInt(parsedQuest.postRequirement, 10),
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
    if (sanitizedQuest.questType.toLowerCase() !== 'interactive') {
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
            
            // Set table roll configuration
            sanitizedQuest.tableRollName = tableName;
            sanitizedQuest.requiredRolls = requiredRolls;
            sanitizedQuest.rollSuccessCriteria = successCriteria;
            sanitizedQuest.tableRollConfig = {
                tableName,
                requiredRolls,
                successCriteria
            };
            
            console.log(`[questAnnouncements.js] ✅ Interactive quest "${sanitizedQuest.title}" configured with table roll: ${tableName} (${requiredRolls} rolls, criteria: ${successCriteria || 'any'})`);
        } else {
            console.warn(`[questAnnouncements.js] ⚠️ Invalid table roll configuration format for quest "${sanitizedQuest.title}": ${minRequirements}`);
            sanitizedQuest.botNotes = `WARNING: Invalid table roll configuration format: ${minRequirements}`;
        }
    } else if (typeof minRequirements === 'number' && minRequirements > 0) {
        // Simple numeric requirement - default table roll setup
        sanitizedQuest.requiredRolls = minRequirements;
        sanitizedQuest.tableRollConfig = {
            requiredRolls: minRequirements,
            successCriteria: null
        };
        
        console.log(`[questAnnouncements.js] ✅ Interactive quest "${sanitizedQuest.title}" configured with ${minRequirements} required rolls`);
    } else {
        console.warn(`[questAnnouncements.js] ⚠️ No valid table roll configuration found for interactive quest "${sanitizedQuest.title}"`);
        sanitizedQuest.botNotes = `WARNING: No table roll configuration found for interactive quest`;
    }
    
    return true;
}

// ------------------- createQuestRole -
async function createQuestRole(guild, questTitle) {
    let role = guild.roles.cache.find(r => r.name === `Quest: ${questTitle}`);
    
    if (!role) {
        console.log(`[questAnnouncements.js] 🔧 Creating role for quest: "${questTitle}"`);
        role = await guild.roles.create({
            name: `Quest: ${questTitle}`,
            color: 0xAA926A,
            mentionable: true,
            reason: `Automatically created for the quest: "${questTitle}"`
        });
        console.log(`[questAnnouncements.js] ✅ Role created for quest: "${questTitle}" with ID: ${role.id}`);
    } else {
        console.log(`[questAnnouncements.js] ℹ️ Role already exists for quest: "${questTitle}" with ID: ${role.id}`);
    }
    
    return role;
}

// ------------------- createRPThread -
async function createRPThread(guild, quest) {
    if (quest.questType.toLowerCase() !== 'rp' || !quest.rpThreadParentChannel) {
        return null;
    }
    
    console.log(`[questAnnouncements.js] 🔧 Creating RP thread for: "${quest.title}"`);
    
    try {
        const parentChannel = guild.channels.cache.get(quest.rpThreadParentChannel);
        if (!parentChannel) {
            console.log(`[questAnnouncements.js] ⚠️ Parent channel not found: ${quest.rpThreadParentChannel}`);
            quest.botNotes = `Parent channel not found: ${quest.rpThreadParentChannel}`;
            return null;
        }
        
        if (parentChannel.type !== 0 && parentChannel.type !== 2) {
            console.log(`[questAnnouncements.js] ⚠️ Channel does not support threads. Type: ${parentChannel.type}`);
            quest.botNotes = `Parent channel does not support threads (type: ${parentChannel.type})`;
            return null;
        }
        
        if (!parentChannel.threads) {
            console.log(`[questAnnouncements.js] ⚠️ Channel threads property is undefined`);
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
            .setDescription(`This is the RP thread for the quest: **${quest.title}**\n\n**Requirements**: ${quest.postRequirement || 15}-20 posts minimum, 2 paragraph maximum per post.\n\n**Note**: This quest is member-driven.`)
            .addFields(
                { name: 'Quest Type', value: 'RP', inline: true },
                { name: 'Post Requirement', value: `${quest.postRequirement || 15}-20 posts`, inline: true },
                { name: 'Status', value: 'Active', inline: true },
                { name: 'Quest ID', value: `\`${quest.questID}\``, inline: true },
                { name: 'Join Quest', value: `</quest join:1389946995468271729> questid:${quest.questID} charactername:YourCharacter`, inline: false }
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
// ------------------- Main Quest Processing Function -------------------
// ============================================================================

// ------------------- postQuests -
async function postQuests() {
    console.log('[questAnnouncements.js] 🚀 Starting quest posting process...');
    
    const questChannel = await client.channels.fetch(QUEST_CHANNEL_ID);
    if (!questChannel) {
        console.error('[questAnnouncements.js] ❌ Quest channel not found!');
        return;
    }

    const auth = await authorizeSheets();
    const questData = await fetchQuestData();

    if (!questData.length) {
        console.log('[questAnnouncements.js] ℹ️ No quest data found in Google Sheets');
        return;
    }

    console.log(`[questAnnouncements.js] 📊 Retrieved ${questData.length} quests from sheet`);

    const unpostedQuests = questData.filter((quest, index) => {
        const parsedQuest = parseQuestRow(quest);
        const sanitizedPosted = parsedQuest.posted ? parsedQuest.posted.trim().toLowerCase() : '';
        
        if (sanitizedPosted === 'posted' && parsedQuest.questID && parsedQuest.questID !== 'N/A') {
            console.log(`[questAnnouncements.js] ⏭️ Skipping quest "${parsedQuest.title}" - Already posted with ID ${parsedQuest.questID}`);
            return false;
        }
        
        return true;
    });

    if (!unpostedQuests.length) {
        console.log('[questAnnouncements.js] ℹ️ No new quests to post. All quests are already marked as "Posted"');
        return;
    }

    console.log(`[questAnnouncements.js] 📝 Found ${unpostedQuests.length} quests to post`);
    const guild = questChannel.guild;
    const questsToProcess = process.env.TEST_CHANNEL_ID ? unpostedQuests.slice(0, 1) : unpostedQuests;
    console.log(`[questAnnouncements.js] 🔄 Processing ${questsToProcess.length} quest(s) ${process.env.TEST_CHANNEL_ID ? '(TEST MODE)' : '(all quests)'}`);

    for (const [rowIndex, quest] of questsToProcess.entries()) {
        const parsedQuest = parseQuestRow(quest);
        console.log(`[questAnnouncements.js] 🔍 Processing quest: "${parsedQuest.title}"`);
    
        try {
            const sanitizedQuest = sanitizeQuestData(parsedQuest);
            
            if (sanitizedQuest.questType.toLowerCase() === 'rp') {
                const rpValid = await handleRPQuestSetup(sanitizedQuest, guild);
                if (!rpValid) continue;
            } else if (sanitizedQuest.questType.toLowerCase() === 'interactive') {
                const interactiveValid = await handleInteractiveQuestSetup(sanitizedQuest, guild);
                if (!interactiveValid) continue;
            }
            
            sanitizedQuest.questID = generateUniqueId('Q');
            const role = await createQuestRole(guild, sanitizedQuest.title);
            sanitizedQuest.roleID = role.id;
            
            // For RP quests, set the required village based on location
            if (sanitizedQuest.questType.toLowerCase() === 'rp') {
                const questLocation = sanitizedQuest.location.toLowerCase();
                if (questLocation.includes('rudania')) {
                    sanitizedQuest.requiredVillage = 'rudania';
                } else if (questLocation.includes('inariko')) {
                    sanitizedQuest.requiredVillage = 'inariko';
                } else if (questLocation.includes('vhintl')) {
                    sanitizedQuest.requiredVillage = 'vhintl';
                }
            }
            
            await createRPThread(guild, sanitizedQuest);
            
            const questEmbed = formatQuestEmbed(sanitizedQuest);
            const message = await questChannel.send({ embeds: [questEmbed] });
            sanitizedQuest.messageID = message.id;
            
            await saveQuestToDatabase(sanitizedQuest);
            
            sanitizedQuest.posted = true;
            sanitizedQuest.postedAt = new Date();
            
            try {
                await markQuestAsPosted(auth, rowIndex, sanitizedQuest.questID);
                console.log(`[questAnnouncements.js] ✅ Quest "${sanitizedQuest.title}" marked as posted in Google Sheets`);
            } catch (sheetError) {
                console.error(`[questAnnouncements.js] ❌ Failed to mark quest as posted in Google Sheets:`, sheetError.message);
                await sendModNotification(guild, sanitizedQuest.title, sanitizedQuest.questID, 'Sheet Update Failed', sheetError.message);
            }
        } catch (error) {
            handleError(error, 'questAnnouncements.js');
            console.error(`[questAnnouncements.js] ❌ Failed to process quest "${parsedQuest.title || 'Untitled Quest'}":`, error);
            await sendModNotification(guild, parsedQuest.title || 'Untitled Quest', 'TBD', 'Quest Processing Failed', error.message);
        }
    }
       
    console.log('[questAnnouncements.js] ✅ Finished processing quests');
    
    // Check quest completions
    try {
        const activeQuests = await Quest.find({ status: 'active' });
        let completedCount = 0;
        
        for (const quest of activeQuests) {
            const completionResult = await quest.checkAutoCompletion();
            if (completionResult.completed) {
                completedCount++;
                console.log(`[questAnnouncements.js] ✅ Quest "${quest.title}" completed: ${completionResult.reason}`);
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
// ------------------- Google Sheets Functions -------------------
// ============================================================================

// ------------------- markQuestAsPosted -
async function markQuestAsPosted(auth, rowIndex, questID) {
    try {
        console.log(`[questAnnouncements.js] 📝 Marking quest as posted in Google Sheets (Row: ${rowIndex + 2}, Quest ID: ${questID})`);
        const now = new Date().toISOString();
        await writeSheetData(auth, SHEET_ID, `loggedQuests!P${rowIndex + 2}:S${rowIndex + 2}`, [[questID, 'active', 'Posted', now]]);
        console.log(`[questAnnouncements.js] ✅ Quest marked as posted in Google Sheets (Row: ${rowIndex + 2})`);
    } catch (error) {
        handleError(error, 'questAnnouncements.js');
        console.error(`[questAnnouncements.js] ❌ Failed to mark quest as posted in Google Sheets (Row: ${rowIndex + 2}):`, error);
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
