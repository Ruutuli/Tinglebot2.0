const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config();

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildMembers
    ]
});

// Function to extract server data
async function extractServerData() {
    try {
        console.log('🔍 Extracting server data...');
        console.log('🔗 Discord connection already established!');
        
        console.log(`✅ Bot logged in as ${client.user.tag}`);

        // Get the guild (server) - assuming single guild bot
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('❌ No guild found!');
            return;
        }

        console.log(`📊 Extracting data from: ${guild.name} (${guild.id})`);
        console.log(`👥 Server has ${guild.memberCount} members`);

        // Extract emojis
        console.log('🎭 Extracting emojis...');
        const emojis = [];
        let emojiCount = 0;
        const totalEmojis = guild.emojis.cache.size;
        
        guild.emojis.cache.forEach(emoji => {
            emojiCount++;
            console.log(`   📝 Processing emoji ${emojiCount}/${totalEmojis}: ${emoji.name} (${emoji.animated ? 'animated' : 'static'})`);
            
            emojis.push({
                id: emoji.id,
                name: emoji.name,
                animated: emoji.animated,
                url: emoji.url,
                identifier: emoji.identifier,
                createdTimestamp: emoji.createdTimestamp,
                managed: emoji.managed,
                available: emoji.available,
                guildId: emoji.guild.id
            });
        });
        console.log(`✅ Extracted ${emojis.length} emojis`);

        // Extract roles
        console.log('👥 Extracting roles...');
        const roles = [];
        let roleCount = 0;
        const totalRoles = guild.roles.cache.size;
        
        guild.roles.cache.forEach(role => {
            roleCount++;
            console.log(`   📝 Processing role ${roleCount}/${totalRoles}: ${role.name} (${role.members.size} members)`);
            
            roles.push({
                id: role.id,
                name: role.name,
                color: role.color,
                colorHex: role.hexColor,
                hoist: role.hoist,
                position: role.position,
                permissions: role.permissions.toArray(),
                managed: role.managed,
                mentionable: role.mentionable,
                createdTimestamp: role.createdTimestamp,
                icon: role.icon,
                unicodeEmoji: role.unicodeEmoji,
                tags: role.tags,
                members: role.members.size
            });
        });
        console.log(`✅ Extracted ${roles.length} roles`);

        // Extract channels
        console.log('📺 Extracting channels...');
        const channels = [];
        let channelCount = 0;
        const totalChannels = guild.channels.cache.size;
        
        guild.channels.cache.forEach(channel => {
            channelCount++;
            const channelTypeNames = {
                0: 'Text',
                2: 'Voice', 
                4: 'Category',
                5: 'Announcement',
                10: 'News Thread',
                11: 'Public Thread',
                12: 'Private Thread',
                13: 'Stage Voice',
                14: 'Directory',
                15: 'Forum'
            };
            const typeName = channelTypeNames[channel.type] || `Unknown (${channel.type})`;
            console.log(`   📝 Processing channel ${channelCount}/${totalChannels}: ${channel.name} (${typeName})`);
            
            channels.push({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                typeName: channel.type.toString(),
                position: channel.position,
                parentId: channel.parentId,
                parent: channel.parent ? channel.parent.name : null,
                createdTimestamp: channel.createdTimestamp,
                permissionsLocked: channel.permissionsLocked,
                // Additional properties based on channel type
                ...(channel.type === 0 && { // Text channel
                    topic: channel.topic,
                    nsfw: channel.nsfw,
                    rateLimitPerUser: channel.rateLimitPerUser
                }),
                ...(channel.type === 2 && { // Voice channel
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    rtcRegion: channel.rtcRegion
                }),
                ...(channel.type === 4 && { // Category
                    children: channel.children.cache.map(child => ({
                        id: child.id,
                        name: child.name,
                        type: child.type
                    }))
                })
            });
        });
        console.log(`✅ Extracted ${channels.length} channels`);

        // Create the complete server data object
        const serverData = {
            extractionDate: new Date().toISOString(),
            guild: {
                id: guild.id,
                name: guild.name,
                description: guild.description,
                memberCount: guild.memberCount,
                ownerId: guild.ownerId,
                createdTimestamp: guild.createdTimestamp,
                icon: guild.icon,
                banner: guild.banner,
                splash: guild.splash,
                discoverySplash: guild.discoverySplash,
                features: guild.features,
                verificationLevel: guild.verificationLevel,
                explicitContentFilter: guild.explicitContentFilter,
                mfaLevel: guild.mfaLevel,
                premiumTier: guild.premiumTier,
                premiumSubscriptionCount: guild.premiumSubscriptionCount,
                vanityURLCode: guild.vanityURLCode,
                preferredLocale: guild.preferredLocale,
                rulesChannelId: guild.rulesChannelId,
                publicUpdatesChannelId: guild.publicUpdatesChannelId,
                systemChannelId: guild.systemChannelId,
                afkChannelId: guild.afkChannelId,
                afkTimeout: guild.afkTimeout,
                defaultMessageNotifications: guild.defaultMessageNotifications,
                maximumMembers: guild.maximumMembers,
                maximumPresences: guild.maximumPresences
            },
            emojis: emojis,
            roles: roles,
            channels: channels,
            statistics: {
                totalEmojis: emojis.length,
                totalRoles: roles.length,
                totalChannels: channels.length,
                textChannels: channels.filter(c => c.type === 0).length,
                voiceChannels: channels.filter(c => c.type === 2).length,
                categories: channels.filter(c => c.type === 4).length,
                otherChannels: channels.filter(c => ![0, 2, 4].includes(c.type)).length
            }
        };

        // Create output directory if it doesn't exist
        console.log('📁 Creating output directory...');
        const outputDir = path.join(__dirname, '..', 'data', 'serverData');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
            console.log('   ✅ Directory created');
        } else {
            console.log('   ✅ Directory already exists');
        }

        // Save to JSON file
        console.log('💾 Saving data to file...');
        const filename = 'server-data.json';
        const filepath = path.join(outputDir, filename);
        
        console.log(`   📝 Writing file: ${filename}`);
        fs.writeFileSync(filepath, JSON.stringify(serverData, null, 2));
        console.log(`   ✅ File saved`);
        
        console.log(`✅ Server data extracted successfully!`);
        console.log(`📁 File saved to: ${filepath}`);
        console.log(`📊 Statistics:`);
        console.log(`   - Emojis: ${serverData.statistics.totalEmojis}`);
        console.log(`   - Roles: ${serverData.statistics.totalRoles}`);
        console.log(`   - Channels: ${serverData.statistics.totalChannels}`);
        console.log(`     - Text: ${serverData.statistics.textChannels}`);
        console.log(`     - Voice: ${serverData.statistics.voiceChannels}`);
        console.log(`     - Categories: ${serverData.statistics.categories}`);
        console.log(`     - Other: ${serverData.statistics.otherChannels}`);

    } catch (error) {
        console.error('❌ Error extracting server data:', error);
    } finally {
        // Destroy the client
        client.destroy();
        console.log('🔚 Bot disconnected');
        process.exit(0);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', error => {
    console.error('❌ Unhandled promise rejection:', error);
    process.exit(1);
});

// Add connection event listeners for better feedback
client.on('connecting', () => {
    console.log('🔄 Connecting to Discord...');
});

client.on('connected', () => {
    console.log('🔗 Connected to Discord gateway!');
});

client.on('ready', () => {
    console.log('🎉 Ready event fired! Bot is fully connected.');
});

client.on('resumed', () => {
    console.log('🔄 Session resumed');
});

client.on('disconnected', (event) => {
    console.log('⚠️ Disconnected from Discord:', event.code, event.reason);
});

client.on('error', (error) => {
    console.error('❌ Discord client error:', error);
});

client.on('warn', (warning) => {
    console.warn('⚠️ Discord client warning:', warning);
});

client.on('debug', (info) => {
    if (info.includes('WebSocket') || info.includes('Gateway')) {
        console.log('🔍 Debug:', info);
    }
});

// Check if token exists
if (!process.env.DISCORD_TOKEN) {
    console.error('❌ DISCORD_TOKEN not found in environment variables!');
    console.log('💡 Make sure you have a .env file with DISCORD_TOKEN=your_bot_token');
    process.exit(1);
}

console.log('🔍 Token found, length:', process.env.DISCORD_TOKEN.length);

// Add timeout to prevent hanging
const connectionTimeout = setTimeout(() => {
    console.error('❌ Connection timeout after 30 seconds');
    console.log('💡 This might be due to:');
    console.log('   - Invalid bot token');
    console.log('   - Network connectivity issues');
    console.log('   - Discord API being down');
    process.exit(1);
}, 30000);

// Test Discord API connectivity first
console.log('🌐 Testing Discord API connectivity...');
const https = require('https');
const apiTest = https.get('https://discord.com/api/v10/gateway', (res) => {
    console.log('✅ Discord API is reachable (status:', res.statusCode + ')');
    startExtraction();
}).on('error', (err) => {
    console.error('❌ Cannot reach Discord API:', err.message);
    console.log('💡 Check your internet connection');
    process.exit(1);
});

function startExtraction() {
    // Start the extraction
    console.log('🚀 Starting server data extraction...');
    console.log('🔑 Attempting to login with bot token...');

    client.login(process.env.DISCORD_TOKEN).catch(error => {
        clearTimeout(connectionTimeout);
        console.error('❌ Failed to login:', error);
        if (error.code === 4004) {
            console.log('💡 This usually means the bot token is invalid');
        } else if (error.code === 50013) {
            console.log('💡 This usually means the bot lacks proper permissions');
        }
        process.exit(1);
    });

    // Run extraction when ready
    client.once('ready', () => {
        clearTimeout(connectionTimeout);
        extractServerData();
    });
}
