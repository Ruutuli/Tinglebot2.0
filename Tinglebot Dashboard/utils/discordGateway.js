const { Client, GatewayIntentBits } = require('discord.js');
const MessageTracking = require('../models/MessageTrackingModel');
const logger = require('./logger');

class DiscordGateway {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
      ]
    });
    
    this.isConnected = false;
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    // Message tracking
    this.client.on('messageCreate', async (message) => {
      if (message.author.bot) return;
      
      try {
        await this.trackMessage(message);
      } catch (error) {
        logger.error('Error tracking message:', error);
      }
    });
    
    // Connection events
    this.client.on('clientReady', () => {
      logger.info(`Discord Gateway connected as ${this.client.user.tag}`);
      this.isConnected = true;
    });
    
    this.client.on('error', (error) => {
      logger.error('Discord Gateway error:', error);
      this.isConnected = false;
    });
    
    this.client.on('disconnect', () => {
      logger.warn('Discord Gateway disconnected');
      this.isConnected = false;
    });
  }
  
  async trackMessage(message) {
    const dayKey = new Date().toISOString().split('T')[0];
    
    const messageData = {
      guildId: message.guild.id,
      userId: message.author.id,
      channelId: message.channel.id,
      messageId: message.id,
      content: message.content,
      timestamp: new Date(message.createdTimestamp),
      dayKey: dayKey
    };
    
    try {
      await MessageTracking.create(messageData);
    } catch (error) {
      // Ignore duplicate key errors (message already tracked)
      if (error.code !== 11000) {
        logger.error('Error saving message to database:', error);
      }
    }
  }
  
  async connect() {
    if (!process.env.DISCORD_TOKEN) {
      throw new Error('DISCORD_TOKEN environment variable is required');
    }
    
    try {
      await this.client.login(process.env.DISCORD_TOKEN);
      return true;
    } catch (error) {
      logger.error('Failed to connect to Discord Gateway:', error);
      return false;
    }
  }
  
  async disconnect() {
    if (this.client) {
      await this.client.destroy();
      this.isConnected = false;
    }
  }
  
  getConnectionStatus() {
    return {
      connected: this.isConnected,
      readyAt: this.client?.readyAt,
      user: this.client?.user?.tag
    };
  }
  
  // Get real-time guild presence data
  async getGuildPresences(guildId) {
    if (!this.isConnected) {
      return null;
    }
    
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return null;
      
      const members = guild.members.cache;
      const presences = {
        online: 0,
        idle: 0,
        dnd: 0,
        offline: 0,
        members: []
      };
      
      members.forEach(member => {
        const presence = member.presence?.status || 'offline';
        presences[presence]++;
        
        if (presence !== 'offline') {
          presences.members.push({
            id: member.user.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            avatar: member.user.displayAvatarURL(),
            status: presence,
            activity: member.presence?.activities?.[0]?.name || null
          });
        }
      });
      
      return presences;
    } catch (error) {
      logger.error('Error getting guild presences:', error);
      return null;
    }
  }
  
  // Get voice channel members
  async getVoiceChannelMembers(guildId) {
    if (!this.isConnected) {
      return 0;
    }
    
    try {
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild) return 0;
      
      let voiceCount = 0;
      guild.channels.cache.forEach(channel => {
        if (channel.type === 2 && channel.members) { // Voice channel
          voiceCount += channel.members.size;
        }
      });
      
      return voiceCount;
    } catch (error) {
      logger.error('Error getting voice channel members:', error);
      return 0;
    }
  }
}

// Singleton instance
let gatewayInstance = null;

function getDiscordGateway() {
  if (!gatewayInstance) {
    gatewayInstance = new DiscordGateway();
  }
  return gatewayInstance;
}

module.exports = {
  DiscordGateway,
  getDiscordGateway
};
