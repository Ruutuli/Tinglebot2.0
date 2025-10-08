// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
// ------------------- Define the user schema -------------------
const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true }, // Unique Discord ID of the user
  googleSheetsUrl: { type: String, default: '' }, // URL to user's Google Sheets (if applicable)
  timezone: { type: String, default: 'UTC' }, // User's timezone (default to UTC)
  tokens: { type: Number, default: 0 }, // Number of tokens the user has
  tokenTracker: { type: String, default: '' }, // URL to token tracker
  tokensSynced: { type: Boolean, default: false }, // Track if tokens are synced
  blightedcharacter: { type: Boolean, default: false }, // Is the character blighted?
  characterSlot: { type: Number, default: 2 }, // Number of character slots available to the user

  // ------------------- Inactivity tracking fields -------------------
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }, // Activity status
  statusChangedAt: { type: Date, default: Date.now }, // When the status was last changed

  // ------------------- Message tracking fields -------------------
  lastMessageContent: { type: String, default: '' }, // Content of the last message sent
  lastMessageTimestamp: { type: Date }, // Timestamp of the last message

  // ------------------- Help Wanted Quest Tracking -------------------
  // Tracks Help Wanted quest completions, cooldowns, and history for this user
  helpWanted: {
    lastCompletion: { type: String, default: null }, // YYYY-MM-DD
    cooldownUntil: { type: Date, default: null },
    totalCompletions: { type: Number, default: 0 }, // Total number of Help Wanted quests completed
    completions: [
      {
        date: { type: String }, // YYYY-MM-DD
        village: { type: String },
        questType: { type: String },
        questId: { type: String },
        timestamp: { type: Date }
      }
    ]
  },

  // ------------------- Leveling System -------------------
  leveling: {
    xp: { type: Number, default: 0 }, // Total XP earned by the user
    level: { type: Number, default: 1 }, // Current level of the user
    lastMessageTime: { type: Date, default: null }, // Last time user sent a message (for cooldown)
    totalMessages: { type: Number, default: 0 }, // Total messages sent (for statistics)
    xpHistory: [{ // Track XP gains for analytics
      amount: { type: Number },
      source: { type: String }, // 'message', 'bonus', etc.
      timestamp: { type: Date, default: Date.now }
    }],
    lastExchangedLevel: { type: Number, default: 0 }, // Last level that was exchanged for tokens
    totalLevelsExchanged: { type: Number, default: 0 }, // Total levels exchanged for tokens
    exchangeHistory: [{ // Track level exchanges
      levelsExchanged: { type: Number },
      tokensReceived: { type: Number },
      timestamp: { type: Date, default: Date.now }
    }],
    hasImportedFromMee6: { type: Boolean, default: false }, // Track if user has imported from MEE6
    mee6ImportDate: { type: Date, default: null }, // When the import was performed
    importedMee6Level: { type: Number, default: null } // What level was imported from MEE6
  }
});

// ------------------- Static methods for leveling -------------------
userSchema.statics.getOrCreateUser = async function(discordId) {
  let user = await this.findOne({ discordId });
  if (!user) {
    user = new this({ discordId });
    await user.save();
  }
  return user;
};

userSchema.statics.getTopUsers = async function(limit = 10) {
  return this.find({}).sort({ 'leveling.level': -1, 'leveling.xp': -1 }).limit(limit);
};

// ------------------- Instance methods for leveling -------------------
userSchema.methods.addXP = async function(amount, source = 'message') {
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: []
    };
  }
  
  this.leveling.xp += amount;
  this.leveling.xpHistory.push({ amount, source, timestamp: new Date() });
  
  // Keep only last 50 XP gains for performance
  if (this.leveling.xpHistory.length > 50) {
    this.leveling.xpHistory = this.leveling.xpHistory.slice(-50);
  }
  
  // Check for level up
  const newLevel = this.calculateLevel();
  const leveledUp = newLevel > this.leveling.level;
  this.leveling.level = newLevel;
  
  await this.save();
  return { leveledUp, newLevel, oldLevel: this.leveling.level - (leveledUp ? 1 : 0) };
};

userSchema.methods.calculateLevel = function() {
  // Level calculation: XP required = level * 100 + (level - 1) * 50
  // Level 1: 0 XP, Level 2: 150 XP, Level 3: 350 XP, Level 4: 600 XP, etc.
  if (!this.leveling) return 1;
  
  let level = 1;
  let xpRequired = 0;
  
  while (this.leveling.xp >= xpRequired) {
    level++;
    xpRequired = level * 100 + (level - 1) * 50;
  }
  
  return level - 1;
};

userSchema.methods.getXPForNextLevel = function() {
  if (!this.leveling) return 150; // Default to level 2 requirement
  
  const nextLevel = this.leveling.level + 1;
  const xpRequired = nextLevel * 100 + (nextLevel - 1) * 50;
  return xpRequired;
};

userSchema.methods.getProgressToNextLevel = function() {
  if (!this.leveling) {
    return { current: 0, needed: 150, percentage: 0 };
  }
  
  const currentLevelXP = this.leveling.level * 100 + (this.leveling.level - 1) * 50;
  const nextLevelXP = this.getXPForNextLevel();
  const progressXP = this.leveling.xp - currentLevelXP;
  const totalXPNeeded = nextLevelXP - currentLevelXP;
  
  return {
    current: progressXP,
    needed: totalXPNeeded,
    percentage: Math.round((progressXP / totalXPNeeded) * 100)
  };
};

userSchema.methods.canGainXP = function() {
  if (!this.leveling || !this.leveling.lastMessageTime) return true;
  
  const cooldownMs = 60 * 1000; // 1 minute cooldown
  const timeSinceLastMessage = Date.now() - this.leveling.lastMessageTime.getTime();
  
  return timeSinceLastMessage >= cooldownMs;
};

userSchema.methods.updateMessageTime = async function() {
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: [],
      lastExchangedLevel: 0,
      totalLevelsExchanged: 0,
      exchangeHistory: [],
      hasImportedFromMee6: false,
      mee6ImportDate: null,
      importedMee6Level: null
    };
  }
  
  this.leveling.lastMessageTime = new Date();
  this.leveling.totalMessages++;
  await this.save();
};

userSchema.methods.exchangeLevelsForTokens = async function() {
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: [],
      lastExchangedLevel: 0,
      totalLevelsExchanged: 0,
      exchangeHistory: [],
      hasImportedFromMee6: false,
      mee6ImportDate: null,
      importedMee6Level: null
    };
  }
  
  const currentLevel = this.leveling.level;
  const lastExchangedLevel = this.leveling.lastExchangedLevel || 0;
  
  // Calculate how many levels can be exchanged
  const levelsToExchange = currentLevel - lastExchangedLevel;
  
  if (levelsToExchange <= 0) {
    return {
      success: false,
      message: 'No new levels to exchange! You need to level up more.',
      levelsExchanged: 0,
      tokensReceived: 0
    };
  }
  
  // Calculate tokens (1 level = 100 tokens)
  const tokensToReceive = levelsToExchange * 100;
  
  // Update exchange tracking
  this.leveling.lastExchangedLevel = currentLevel;
  this.leveling.totalLevelsExchanged += levelsToExchange;
  
  // Add to exchange history
  this.leveling.exchangeHistory.push({
    levelsExchanged: levelsToExchange,
    tokensReceived: tokensToReceive,
    timestamp: new Date()
  });
  
  // Keep only last 20 exchange records for performance
  if (this.leveling.exchangeHistory.length > 20) {
    this.leveling.exchangeHistory = this.leveling.exchangeHistory.slice(-20);
  }
  
  await this.save();
  
  return {
    success: true,
    message: `Successfully exchanged ${levelsToExchange} levels for ${tokensToReceive} tokens!`,
    levelsExchanged: levelsToExchange,
    tokensReceived: tokensToReceive,
    currentLevel: currentLevel,
    lastExchangedLevel: lastExchangedLevel,
    totalMessages: this.leveling.totalMessages
  };
};

userSchema.methods.getExchangeableLevels = function() {
  if (!this.leveling) {
    return {
      currentLevel: 1,
      lastExchangedLevel: 0,
      exchangeableLevels: 0,
      potentialTokens: 0
    };
  }
  
  const currentLevel = this.leveling.level;
  const lastExchangedLevel = this.leveling.lastExchangedLevel || 0;
  const exchangeableLevels = Math.max(0, currentLevel - lastExchangedLevel);
  const potentialTokens = exchangeableLevels * 100;
  
  return {
    currentLevel: currentLevel,
    lastExchangedLevel: lastExchangedLevel,
    exchangeableLevels: exchangeableLevels,
    potentialTokens: potentialTokens
  };
};

userSchema.methods.importMee6Levels = async function(mee6Level, lastExchangedLevel = 0) {
  // Check if user has already imported from MEE6
  if (this.leveling?.hasImportedFromMee6) {
    return {
      success: false,
      message: 'You have already imported your levels from MEE6. Import can only be done once.',
      hasImported: true
    };
  }
  
  // Validate input
  if (!mee6Level || mee6Level < 1 || mee6Level > 1000) {
    return {
      success: false,
      message: 'Invalid MEE6 level. Please provide a level between 1 and 1000.',
      hasImported: false
    };
  }
  
  if (lastExchangedLevel < 0 || lastExchangedLevel >= mee6Level) {
    return {
      success: false,
      message: 'Invalid last exchanged level. Must be between 0 and your current MEE6 level.',
      hasImported: false
    };
  }
  
  // Initialize leveling object if it doesn't exist
  if (!this.leveling) {
    this.leveling = {
      xp: 0,
      level: 1,
      lastMessageTime: null,
      totalMessages: 0,
      xpHistory: [],
      lastExchangedLevel: 0,
      totalLevelsExchanged: 0,
      exchangeHistory: [],
      hasImportedFromMee6: false,
      mee6ImportDate: null,
      importedMee6Level: null
    };
  }
  
  // Calculate XP required for the MEE6 level using our leveling formula
  // Level calculation: XP required = level * 100 + (level - 1) * 50
  const xpRequired = mee6Level * 100 + (mee6Level - 1) * 50;
  
  // Set the level and XP
  this.leveling.level = mee6Level;
  this.leveling.xp = xpRequired;
  
  // Set exchange tracking to prevent double rewards
  this.leveling.lastExchangedLevel = lastExchangedLevel;
  
  // Mark as imported
  this.leveling.hasImportedFromMee6 = true;
  this.leveling.mee6ImportDate = new Date();
  this.leveling.importedMee6Level = mee6Level;
  
  // Calculate exchangeable levels
  const exchangeableLevels = Math.max(0, mee6Level - lastExchangedLevel);
  const potentialTokens = exchangeableLevels * 100;
  
  await this.save();
  
  return {
    success: true,
    message: `Successfully imported Level ${mee6Level} from MEE6!`,
    importedLevel: mee6Level,
    lastExchangedLevel: lastExchangedLevel,
    exchangeableLevels: exchangeableLevels,
    potentialTokens: potentialTokens,
    hasImported: true
  };
};

// ------------------- Export the User model -------------------
const User = mongoose.model('User', userSchema);
module.exports = User;
