// ============================================================================
// ------------------- manualPostQuest.js -------------------
// Script to manually post a quest to Discord and save it to the database
// Usage: node bot/scripts/manualPostQuest.js
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Quest = require('../../shared/models/QuestModel');
const { generateUniqueId } = require('../../shared/utils/uniqueIdUtils');
const { BORDER_IMAGE, QUEST_TYPES, QUEST_CHANNEL_ID, extractVillageFromLocation } = require('../modules/questRewardModule');

// ============================================================================
// ------------------- Configuration -------------------
// ============================================================================

// Edit these quest details to match your quest
const QUEST_DATA = {
    title: 'Aeonic Tradition',
    description: `In years long past, it had been tradition to gift the dragons with something. Sacrifice, gold, food, things to entice their attention and favor. In recent times, this tradition has fallen to the wayside and the people have learned that the dragons answer to much less severe and grandiose measures. But that does not mean they don't appreciate a good gift now and then! For whatever reason, across all three villages, the alters are being dusted, the offering bowls are being placed. Maybe it is worth the time, to gift them something, to say some words or leave a note too... Who knows what will happen, or what you might receive in return?`,
    rules: 'Flavor must be included for the gifts to count. Must travel if gifting to a dragon not in your current location.',
    date: 'January 2026',
    questType: 'Interactive', // Valid: 'Art', 'Writing', 'Interactive', 'RP', 'Art / Writing'
    location: 'All Villages',
    timeLimit: '1 month',
    tokenReward: 'No reward', // Can be: number, 'No reward', or complex format like 'flat:300' or 'per_unit:222 unit:submission max:3'
    itemReward: null, // Optional: item name
    itemRewardQty: null, // Optional: item quantity
    participantCap: null, // Optional: number
    postRequirement: null, // Optional: number (for RP quests)
    signupDeadline: null, // Optional: date string
    minRequirements: 0,
    tableroll: null, // Optional: table roll name (for Interactive quests)
    rpThreadParentChannel: null, // Optional: Discord channel ID (for RP quests)
    collabAllowed: false,
    collabRule: null
};

// ============================================================================
// ------------------- Database Connection -------------------
// ============================================================================

async function connectToDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) {
            throw new Error('MongoDB URI not found in environment variables');
        }
        
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
        return true;
    } catch (error) {
        console.error('❌ Error connecting to MongoDB:', error);
        return false;
    }
}

// ============================================================================
// ------------------- Discord Client Setup -------------------
// ============================================================================

const client = new Client({ 
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] 
});

async function loginDiscordClient() {
    try {
        const token = process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN;
        if (!token) {
            throw new Error('DISCORD_TOKEN or DISCORD_BOT_TOKEN not found in environment variables');
        }
        await client.login(token);
        console.log('✅ Logged in to Discord');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for client to be ready
        return true;
    } catch (error) {
        console.error('❌ Error logging in to Discord:', error);
        return false;
    }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- normalizeQuestType -
function normalizeQuestType(questType) {
    if (!questType) return 'Interactive';
    
    const normalized = questType.trim();
    
    // Handle combined types that need to be normalized to valid enum values
    if (normalized.includes(',')) {
        const parts = normalized.split(',').map(p => p.trim());
        const lowerParts = parts.map(p => p.toLowerCase());
        
        if (lowerParts.includes('interactive') && lowerParts.includes('rp')) {
            return 'Interactive';
        }
        
        if ((lowerParts.includes('writing') && lowerParts.includes('art')) ||
            (lowerParts.includes('art') && lowerParts.includes('writing'))) {
            return 'Art / Writing';
        }
    }
    
    if (normalized.includes('/')) {
        const parts = normalized.split('/').map(p => p.trim());
        const lowerParts = parts.map(p => p.toLowerCase());
        
        if ((lowerParts.includes('writing') && lowerParts.includes('art'))) {
            return 'Art / Writing';
        }
    }
    
    const lower = normalized.toLowerCase();
    if (lower === 'art') return 'Art';
    if (lower === 'writing') return 'Writing';
    if (lower === 'interactive') return 'Interactive';
    if (lower === 'rp') return 'RP';
    if (lower === 'art / writing' || lower === 'art/writing') return 'Art / Writing';
    
    return normalized;
}

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

// ------------------- parseTokenRewardDetails -
function parseTokenRewardDetails(tokenReward) {
    if (!tokenReward || tokenReward === 'N/A' || tokenReward === 'No reward') return null;
    if (typeof tokenReward === 'number') return { type: 'flat', amount: tokenReward };
    
    const parsed = parseFloat(tokenReward);
    if (!isNaN(parsed)) return { type: 'flat', amount: parsed };
    
    if (tokenReward.includes('per_unit:')) {
        const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
        const maxMatch = tokenReward.match(/max:(\d+)/);
        const unitMatch = tokenReward.match(/unit:(\w+)/);
        const collabBonusMatch = tokenReward.match(/collab_bonus:(\d+)/);
        
        if (perUnitMatch) {
            const perUnit = parseInt(perUnitMatch[1]);
            const maxUnits = maxMatch ? parseInt(maxMatch[1]) : 1;
            const unit = unitMatch ? unitMatch[1] : 'submission';
            const collabBonus = collabBonusMatch ? parseInt(collabBonusMatch[1]) : 0;
            
            return {
                type: 'per_unit',
                perUnit: perUnit,
                maxUnits: maxUnits,
                unit: unit,
                total: perUnit * maxUnits,
                collabBonus: collabBonus,
                maxWithCollab: (perUnit + collabBonus) * maxUnits
            };
        }
    }
    
    if (tokenReward.includes('flat:')) {
        const flatMatch = tokenReward.match(/flat:(\d+)/);
        const collabBonusMatch = tokenReward.match(/collab_bonus:(\d+)/);
        
        if (flatMatch) {
            const flatAmount = parseInt(flatMatch[1]);
            const collabBonus = collabBonusMatch ? parseInt(collabBonusMatch[1]) : 0;
            
            return {
                type: 'flat',
                amount: flatAmount,
                collabBonus: collabBonus,
                maxWithCollab: flatAmount + collabBonus
            };
        }
    }
    
    return null;
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
    } else if (quest.questType && quest.questType.toLowerCase() === QUEST_TYPES.INTERACTIVE.toLowerCase() && quest.tableRollName) {
        rulesText = '• **Interactive Quest**: Use table roll mechanics\n';
        rulesText += `• **Table**: ${quest.tableRollName}\n`;
        if (quest.requiredRolls > 1) {
            rulesText += `• **Requirement**: ${quest.requiredRolls} successful rolls\n`;
        }
    } else if (quest.questType && quest.questType === QUEST_TYPES.ART_WRITING) {
        rulesText = '• **Art & Writing**: Submit either art OR writing\n';
        rulesText += '• **Writing**: Minimum 500 words\n';
        rulesText += '• **Art**: Any style accepted\n';
    }
    
    if (quest.rules) {
        if (rulesText) rulesText += '\n';
        rulesText += quest.rules;
    }
    
    return rulesText || null;
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
            if (tokenDetails.collabBonus > 0) {
                rewards.push(`💰 **${tokenDetails.perUnit} tokens per ${tokenDetails.unit}** + **${tokenDetails.collabBonus} collab bonus** (max ${tokenDetails.maxUnits} ${tokenDetails.unit}s = **${tokenDetails.total} tokens** or **${tokenDetails.maxWithCollab} tokens with collab**)`);
            } else {
                rewards.push(`💰 **${tokenDetails.perUnit} tokens per ${tokenDetails.unit}** (max ${tokenDetails.maxUnits} ${tokenDetails.unit}s = **${tokenDetails.total} tokens total**)`);
            }
        } else {
            if (tokenDetails.collabBonus > 0) {
                rewards.push(`💰 **${tokenDetails.amount} tokens** + **${tokenDetails.collabBonus} collab bonus** (max **${tokenDetails.maxWithCollab} tokens with collab**)`);
            } else {
                rewards.push(`💰 **${tokenDetails.amount} tokens**`);
            }
        }
    }
    
    if (quest.itemReward) {
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
    
    if (quest.signupDeadline) {
        participation.push(`📅 **Signup by ${quest.signupDeadline}**`);
    }
    
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
            console.warn(`⚠️  Parent channel not found: ${quest.rpThreadParentChannel}`);
            return null;
        }
        
        if (parentChannel.type !== 0 && parentChannel.type !== 2) {
            console.warn(`⚠️  Parent channel does not support threads (type: ${parentChannel.type})`);
            return null;
        }
        
        const rpThread = await parentChannel.threads.create({
            name: `📜 ${quest.title} - RP Thread`,
            autoArchiveDuration: 1440,
            reason: `Auto-created RP thread for quest: ${quest.title}`,
            type: 11
        });
        
        return rpThread.id;
    } catch (error) {
        console.error('❌ Error creating RP thread:', error);
        return null;
    }
}

// ============================================================================
// ------------------- Main Function -------------------
// ============================================================================

async function manualPostQuest() {
    try {
        console.log('🚀 Starting manual quest post...\n');
        
        // Normalize quest type
        const normalizedQuestType = normalizeQuestType(QUEST_DATA.questType);
        console.log(`📝 Quest Type: "${QUEST_DATA.questType}" -> "${normalizedQuestType}"`);
        
        // Generate quest ID
        const questID = generateUniqueId('Q');
        console.log(`🆔 Generated Quest ID: ${questID}\n`);
        
        // Prepare quest object
        const questData = {
            title: QUEST_DATA.title,
            description: QUEST_DATA.description,
            questType: normalizedQuestType,
            location: QUEST_DATA.location,
            timeLimit: QUEST_DATA.timeLimit,
            date: QUEST_DATA.date,
            tokenReward: QUEST_DATA.tokenReward || 'No reward',
            itemReward: QUEST_DATA.itemReward || null,
            itemRewardQty: QUEST_DATA.itemRewardQty || null,
            participantCap: QUEST_DATA.participantCap || null,
            postRequirement: QUEST_DATA.postRequirement || null,
            signupDeadline: QUEST_DATA.signupDeadline || null,
            minRequirements: QUEST_DATA.minRequirements || 0,
            tableroll: QUEST_DATA.tableroll || null,
            rpThreadParentChannel: QUEST_DATA.rpThreadParentChannel || null,
            collabAllowed: QUEST_DATA.collabAllowed || false,
            collabRule: QUEST_DATA.collabRule || null,
            rules: QUEST_DATA.rules || null,
            questID: questID,
            posted: false,
            postedAt: null,
            status: 'active',
            participants: new Map(),
            targetChannel: QUEST_CHANNEL_ID
        };
        
        // Get Discord guild and channel
        const questChannel = client.channels.cache.get(QUEST_CHANNEL_ID);
        if (!questChannel) {
            throw new Error(`Quest channel not found: ${QUEST_CHANNEL_ID}`);
        }
        
        const guild = questChannel.guild;
        if (!guild) {
            throw new Error('Guild not found');
        }
        
        // Create quest role
        console.log('👤 Creating quest role...');
        const role = await createQuestRole(guild, questData.title);
        questData.roleID = role.id;
        questData.guildId = guild.id;
        console.log(`✅ Created role: ${role.name} (${role.id})`);
        
        // Handle RP quest setup
        if (questData.questType.toLowerCase() === QUEST_TYPES.RP.toLowerCase()) {
            if (!questData.postRequirement) {
                questData.postRequirement = 15;
            }
            
            const villages = extractVillageFromLocation(questData.location);
            questData.requiredVillage = villages ? (villages.length === 1 ? villages[0] : villages.join(', ')) : null;
            
            // Create RP thread
            if (questData.rpThreadParentChannel) {
                console.log('🎭 Creating RP thread...');
                const threadId = await createRPThread(guild, questData);
                if (threadId) {
                    console.log(`✅ Created RP thread: ${threadId}`);
                }
            }
        }
        
        // Format and post embed
        console.log('📨 Posting quest embed...');
        questData.questID = questID; // Ensure questID is set for embed
        const questEmbed = formatQuestEmbed(questData);
        const message = await questChannel.send({ embeds: [questEmbed] });
        questData.messageID = message.id;
        questData.posted = true;
        questData.postedAt = new Date();
        
        console.log(`✅ Posted quest embed: ${message.id}`);
        
        // Save to database
        console.log('💾 Saving quest to database...');
        const savedQuest = new Quest(questData);
        await savedQuest.save();
        console.log(`✅ Saved quest to database: ${savedQuest._id}`);
        
        console.log('\n✅ Quest posted successfully!');
        console.log(`📋 Quest ID: ${questID}`);
        console.log(`📝 Quest Title: ${questData.title}`);
        console.log(`🔗 Message ID: ${message.id}`);
        console.log(`👤 Role ID: ${role.id}`);
        
        return {
            success: true,
            questID: questID,
            messageID: message.id,
            roleID: role.id,
            quest: savedQuest
        };
        
    } catch (error) {
        console.error('❌ Error posting quest:', error);
        throw error;
    }
}

// ============================================================================
// ------------------- Main Execution -------------------
// ============================================================================

async function main() {
    try {
        // Connect to database
        const dbConnected = await connectToDatabase();
        if (!dbConnected) {
            process.exit(1);
        }
        
        // Login to Discord
        const discordLoggedIn = await loginDiscordClient();
        if (!discordLoggedIn) {
            await mongoose.connection.close();
            process.exit(1);
        }
        
        // Post quest
        await manualPostQuest();
        
        // Cleanup
        await client.destroy();
        await mongoose.connection.close();
        console.log('\n✅ Script completed successfully!');
        
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Script failed:', error);
        if (client) await client.destroy();
        if (mongoose.connection.readyState === 1) await mongoose.connection.close();
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = { manualPostQuest };

