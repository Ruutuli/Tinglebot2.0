// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { countUniqueQuestCompletions } = require('../utils/questTrackingUtils');
// Inline logger so we don't depend on require() resolution in Next.js bundle (file, message) => void
const log = (level, file, message) => console.log(`[${new Date().toISOString()}] [${file}] ${level}: ${message}`);
const logger = {
  info: (file, message) => log('INFO', file, message),
  success: (file, message) => log('SUCCESS', file, message),
  warn: (file, message) => log('WARN', file, message),
  error: (file, message) => log('ERROR', file, message),
  debug: (file, message) => log('DEBUG', file, message),
};
// ------------------- Define the user schema -------------------
const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true }, // Unique Discord ID of the user
  username: { type: String, default: '' }, // Discord username / display name (e.g. for "Created by" on pins)
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

  // ------------------- Intro tracking fields -------------------
  introPostedAt: { type: Date, default: null }, // When the user posted their intro

  // ------------------- Help Wanted Quest Tracking -------------------
  // Tracks Help Wanted quest completions, cooldowns, and history for this user
  helpWanted: {
    lastCompletion: { type: String, default: null }, // YYYY-MM-DD
    cooldownUntil: { type: Date, default: null },
    totalCompletions: { type: Number, default: 0 }, // Total number of Help Wanted quests ever completed (never decreases)
    currentCompletions: { type: Number, default: 0 }, // Current available completions for exchange (increments with new completions, decrements with exchanges, resets to 0 after exchange)
    lastExchangeAmount: { type: Number, default: 0 }, // Amount exchanged in the last exchange
    lastExchangeAt: { type: Date, default: null }, // Timestamp of last exchange
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
  },

  // ------------------- Birthday System -------------------
  birthday: {
    month: { type: Number, default: null, validate: { validator: (v) => v == null || (v >= 1 && v <= 12), message: 'Month must be 1-12 or empty (no birthday)' } }, // 1-12 or null for no birthday
    day: { type: Number, default: null, validate: { validator: (v) => v == null || (v >= 1 && v <= 31), message: 'Day must be 1-31 or empty (no birthday)' } }, // 1-31 or null for no birthday
    lastBirthdayReward: { type: String, default: null }, // Last year they received birthday rewards (YYYY format)
    birthdayDiscountExpiresAt: { type: Date, default: null }, // When the birthday discount expires
    birthdayRewards: [{ // Track birthday rewards given
      year: { type: String }, // YYYY format
      rewardType: { type: String }, // 'tokens' or 'discount'
      amount: { type: Number }, // tokens received or discount percentage
      timestamp: { type: Date, default: Date.now }
    }]
  },

  // ------------------- Nitro Boost Rewards System -------------------
  boostRewards: {
    lastRewardMonth: { type: String, default: null }, // Last month rewards were given (YYYY-MM format)
    totalRewards: { type: Number, default: 0 }, // Total boost rewards received
    rewardHistory: [{ // Track boost reward history
      month: { type: String }, // YYYY-MM format
      boostCount: { type: Number }, // Number of boosts during that month
      tokensReceived: { type: Number }, // Tokens received (boostCount × 500)
      timestamp: { type: Date, default: Date.now }
    }]
  },

  // ------------------- Quest Completion Tracking -------------------
  // bot: quests completed/turned in since bot; legacy: pre-bot imported totals
  quests: {
    bot: {
      completed: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      pendingSlotOnly: { type: Number, default: 0 }
    },
    legacy: {
      completed: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      transferredAt: { type: Date, default: null },
      transferUsed: { type: Boolean, default: false }
    },
    lastCompletionAt: { type: Date, default: null },
    typeTotals: {
      art: { type: Number, default: 0 },
      writing: { type: Number, default: 0 },
      interactive: { type: Number, default: 0 },
      rp: { type: Number, default: 0 },
      artWriting: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      meme: { type: Number, default: 0 }
    },
    completions: [
      {
        questId: { type: String },
        questType: { type: String },
        questTitle: { type: String },
        completedAt: { type: Date, default: Date.now },
        rewardedAt: { type: Date, default: null },
        tokensEarned: { type: Number, default: 0 },
        itemsEarned: [{ name: String, quantity: Number }],
        rewardSource: { type: String, default: 'immediate' },
        slotOnlyTurnIn: { type: Boolean, default: false }
      }
    ],
    turnIns: {
      totalSetsTurnedIn: { type: Number, default: 0 },
      lastTurnedInAt: { type: Date, default: null },
      history: [{
        turnedInAt: Date,
        amount: Number,
        fromBot: Number,
        fromLegacy: Number,
        fromBotSlotOnly: { type: Number, default: 0 }
      }]
    }
  },

  // ------------------- Blupee Hunt System -------------------
  blupeeHunt: {
    lastClaimed: { type: Date, default: null }, // Last time user claimed a blupee
    totalClaimed: { type: Number, default: 0 }, // Total number of blupees ever caught
    dailyCount: { type: Number, default: 0 }, // Number of blupees caught today
    dailyResetDate: { type: Date, default: null }, // Date when daily count should reset
    claimHistory: [{
      tokensReceived: { type: Number }, // Tokens received for this catch
      timestamp: { type: Date, default: Date.now } // When the catch occurred
    }]
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
userSchema.methods.addXP = async function(amount, source = 'message', updateMessageTime = false) {
  const maxRetries = 3;
  let retries = 0;
  
  while (retries < maxRetries) {
    try {
      // Reload the document if retrying to get the latest version
      if (retries > 0) {
        const freshDoc = await this.constructor.findById(this._id);
        if (freshDoc) {
          // Update the current document with fresh data
          this.set(freshDoc.toObject());
        }
      }
      
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
      
      // Ensure xp is initialized (handles partial leveling objects)
      if (typeof this.leveling.xp !== 'number') {
        this.leveling.xp = 0;
      }
      
      // Ensure xpHistory is initialized
      if (!Array.isArray(this.leveling.xpHistory)) {
        this.leveling.xpHistory = [];
      }
      
      // Ensure level is initialized
      if (typeof this.leveling.level !== 'number') {
        this.leveling.level = 1;
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
      
      // Optionally update message time in the same save operation
      if (updateMessageTime) {
        this.leveling.lastMessageTime = new Date();
        this.leveling.totalMessages++;
      }
      
      await this.save();
      return { leveledUp, newLevel, oldLevel: this.leveling.level - (leveledUp ? 1 : 0) };
    } catch (error) {
      // Retry on version errors (concurrent modification)
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        continue;
      }
      // Re-throw if not a version error or max retries reached
      throw error;
    }
  }
};

userSchema.methods.calculateLevel = function() {
  // MEE6-style exponential level calculation (CUMULATIVE)
  // XP accumulates: you need the sum of all XP requirements from level 1 to N
  // Level 1: 0 XP
  // Level 2: 220 XP total
  // Level 5: 1,370 XP total
  // Level 10: 5,520 XP total
  // Level 50: 283,220 XP total
  // Level 91: ~1.5M XP total
  // To go from 91→92 needs: 46,055 XP
  if (!this.leveling || typeof this.leveling.xp !== 'number') return 1;
  
  let level = 1;
  let totalXpRequired = 0;
  
  // Calculate level based on total cumulative XP
  while (true) {
    const nextLevel = level + 1;
    const xpForNextLevel = this.getXPRequiredForLevel(nextLevel);
    totalXpRequired += xpForNextLevel;
    
    if (this.leveling.xp < totalXpRequired) {
      break;
    }
    
    level++;
  }
  
  return level;
};

userSchema.methods.getXPRequiredForLevel = function(targetLevel) {
  // Calculate XP for a specific level using MEE6's direct formula
  // Formula: XP = 5 × (level²) + 50 × level + 100
  // Level 1 = 155 XP, Level 2 = 220 XP, Level 91 = 46,055 XP
  if (targetLevel < 1) return 0;
  return 5 * Math.pow(targetLevel, 2) + 50 * targetLevel + 100;
};

userSchema.methods.getXPForNextLevel = function() {
  // Get total cumulative XP required to reach the next level
  if (!this.leveling) return this.getXPRequiredForLevel(2); // Default to level 2 requirement
  
  let totalXp = 0;
  for (let i = 2; i <= this.leveling.level + 1; i++) {
    totalXp += this.getXPRequiredForLevel(i);
  }
  
  return totalXp;
};

userSchema.methods.getProgressToNextLevel = function() {
  if (!this.leveling) {
    const xpNeeded = this.getXPRequiredForLevel(2);
    return { current: 0, needed: xpNeeded, percentage: 0 };
  }
  
  // Calculate total XP required to reach current level
  let currentLevelTotalXP = 0;
  for (let i = 2; i <= this.leveling.level; i++) {
    currentLevelTotalXP += this.getXPRequiredForLevel(i);
  }
  
  // Calculate XP needed for next level
  const xpNeededForNextLevel = this.getXPRequiredForLevel(this.leveling.level + 1);
  
  // Calculate progress within current level
  const progressXP = this.leveling.xp - currentLevelTotalXP;
  const percentage = Math.min(100, Math.max(0, Math.round((progressXP / xpNeededForNextLevel) * 100)));
  
  return {
    current: progressXP,
    needed: xpNeededForNextLevel,
    percentage: percentage
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

userSchema.methods.getTotalXPForLevel = function(targetLevel) {
  // Calculate cumulative XP required to reach a specific level
  // This is the sum of XP needed for each level from 2 to targetLevel
  if (targetLevel <= 1) return 0;
  
  let totalXP = 0;
  for (let level = 2; level <= targetLevel; level++) {
    totalXP += this.getXPRequiredForLevel(level);
  }
  
  return totalXP;
};

// ------------------- Quest Tracking Methods -------------------
function getQuestTypeKey(questType = '') {
  const normalized = questType.trim().toLowerCase();
  
  if (normalized === 'art') return 'art';
  if (normalized === 'writing') return 'writing';
  if (normalized === 'interactive') return 'interactive';
  if (normalized === 'rp') return 'rp';
  if (normalized === 'art / writing' || normalized === 'art/writing') return 'artWriting';
  
  return 'other';
}

function defaultQuestTracking() {
  return {
    bot: { completed: 0, pending: 0, pendingSlotOnly: 0 },
    legacy: {
      completed: 0,
      pending: 0,
      transferredAt: null,
      transferUsed: false
    },
    lastCompletionAt: null,
    typeTotals: {
      art: 0,
      writing: 0,
      interactive: 0,
      rp: 0,
      artWriting: 0,
      other: 0,
      meme: 0
    },
    completions: [],
    turnIns: { totalSetsTurnedIn: 0, lastTurnedInAt: null, history: [] }
  };
}

function migrateQuestShapeToBotLegacy(quests) {
  if (!quests || typeof quests !== 'object') return false;
  let changed = false;
  if (typeof quests.totalCompleted === 'number' || typeof quests.pendingTurnIns === 'number') {
    if (!quests.bot || typeof quests.bot !== 'object') quests.bot = { completed: 0, pending: 0, pendingSlotOnly: 0 };
    if (typeof quests.bot.completed !== 'number') quests.bot.completed = safePendingNumber(quests.totalCompleted);
    if (typeof quests.bot.pending !== 'number') quests.bot.pending = safePendingNumber(quests.pendingTurnIns);
    if (typeof quests.bot.pendingSlotOnly !== 'number') quests.bot.pendingSlotOnly = 0;
    changed = true;
  }
  const legacy = quests.legacy || {};
  if (typeof legacy.totalTransferred === 'number' || typeof legacy.pendingTurnIns === 'number') {
    if (!quests.legacy || typeof quests.legacy !== 'object') quests.legacy = { ...defaultQuestTracking().legacy };
    if (typeof quests.legacy.completed !== 'number') quests.legacy.completed = safePendingNumber(legacy.totalTransferred);
    if (typeof quests.legacy.pending !== 'number') quests.legacy.pending = safePendingNumber(legacy.pendingTurnIns);
    changed = true;
  }
  return changed;
}

/** Coerce to a non-negative integer for pending turn-in math (avoids NaN/negative from bad data). */
function safePendingNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function shouldFixPendingTurnInsFromCompletions(questTracking) {
  if (safePendingNumber(questTracking.bot?.pendingSlotOnly) > 0) return false;
  const completions = questTracking.completions || [];
  if (completions.some((c) => c && c.slotOnlyTurnIn === true)) return false;
  const actualCompletions = countUniqueQuestCompletions(completions);
  const botPending = questTracking.bot?.pending ?? 0;
  const legacyPending = questTracking.legacy?.pending ?? 0;
  const legacyTransferUsed = questTracking.legacy?.transferUsed || false;
  if (botPending !== 0 || actualCompletions <= 0) return false;
  // Never overwrite bot.pending when the user has ever turned in quests — 0 is then valid (they redeemed them)
  const hasTurnInHistory = (questTracking.turnIns?.totalSetsTurnedIn ?? 0) > 0 ||
    (Array.isArray(questTracking.turnIns?.history) && questTracking.turnIns.history.length > 0);
  if (hasTurnInHistory) return false;
  return !legacyTransferUsed || legacyPending > 0;
}

userSchema.methods.recomputePendingTurnInsIfNeeded = function(reason = '') {
  const qt = this.quests;
  if (!qt) return;
  const actualCompletions = countUniqueQuestCompletions(qt.completions || []);
  if (!shouldFixPendingTurnInsFromCompletions(qt)) return;
  if (!qt.bot || typeof qt.bot !== 'object') {
    qt.bot = { completed: qt.bot?.completed ?? 0, pending: 0, pendingSlotOnly: 0 };
  }
  qt.bot.pending = actualCompletions;
  logger.info('QUEST', `recomputePendingTurnInsIfNeeded: fixed bot.pending for user ${this.discordId}: was 0, set to ${actualCompletions}${reason ? ` (${reason})` : ''}`);
};

userSchema.methods.ensureQuestTracking = function() {
  if (!this.quests) {
    this.quests = defaultQuestTracking();
  } else {
    migrateQuestShapeToBotLegacy(this.quests);
    if (!this.quests.bot || typeof this.quests.bot !== 'object') this.quests.bot = { ...defaultQuestTracking().bot };
    this.quests.bot.completed = safePendingNumber(this.quests.bot.completed);
    this.quests.bot.pending = safePendingNumber(this.quests.bot.pending);
    if (typeof this.quests.bot.pendingSlotOnly !== 'number') {
      this.quests.bot.pendingSlotOnly = 0;
    } else {
      this.quests.bot.pendingSlotOnly = safePendingNumber(this.quests.bot.pendingSlotOnly);
    }
    this.recomputePendingTurnInsIfNeeded('ensureQuestTracking');
    if (this.quests.bot.pending < 0) this.quests.bot.pending = 0;
    if (this.quests.bot.pendingSlotOnly < 0) this.quests.bot.pendingSlotOnly = 0;
    const turnInHistory = this.quests.turnIns?.history;
    if (Array.isArray(turnInHistory) && turnInHistory.length > 0) {
      const totalConsumedFromBot = turnInHistory.reduce(
        (sum, e) =>
          sum + safePendingNumber(e.fromBot) + safePendingNumber(e.fromBotSlotOnly),
        0
      );
      const maxCombined = Math.max(0, (this.quests.bot.completed || 0) - totalConsumedFromBot);
      let g = safePendingNumber(this.quests.bot.pending);
      let s = safePendingNumber(this.quests.bot.pendingSlotOnly);
      if (g + s > maxCombined) {
        let over = g + s - maxCombined;
        while (over > 0 && s > 0) {
          s -= 1;
          over -= 1;
        }
        while (over > 0 && g > 0) {
          g -= 1;
          over -= 1;
        }
        this.quests.bot.pending = g;
        this.quests.bot.pendingSlotOnly = s;
      }
    }
    if (!this.quests.typeTotals) {
      this.quests.typeTotals = { ...defaultQuestTracking().typeTotals };
    } else {
      const defaults = defaultQuestTracking().typeTotals;
      for (const key of Object.keys(defaults)) {
        if (typeof this.quests.typeTotals[key] !== 'number') {
          this.quests.typeTotals[key] = defaults[key];
        }
      }
    }
    if (!Array.isArray(this.quests.completions)) this.quests.completions = [];
    if (!this.quests.legacy || typeof this.quests.legacy !== 'object') {
      this.quests.legacy = { ...defaultQuestTracking().legacy };
    } else {
      const legacyDefaults = defaultQuestTracking().legacy;
      for (const key of Object.keys(legacyDefaults)) {
        if (typeof this.quests.legacy[key] === 'undefined' || this.quests.legacy[key] === null) {
          this.quests.legacy[key] = legacyDefaults[key];
        }
      }
      this.quests.legacy.completed = safePendingNumber(this.quests.legacy.completed);
      this.quests.legacy.pending = safePendingNumber(this.quests.legacy.pending);
    }
    if (!this.quests.turnIns || typeof this.quests.turnIns !== 'object') {
      this.quests.turnIns = { ...defaultQuestTracking().turnIns };
    }
  }
  return this.quests;
};

userSchema.methods.recordQuestCompletion = async function({
  questId = null,
  questType = null,
  questTitle = null,
  completedAt = null,
  rewardedAt = null,
  tokensEarned = 0,
  itemsEarned = [],
  rewardSource = 'immediate',
  slotOnlyTurnIn = false
} = {}) {
  const questTracking = this.ensureQuestTracking();
  const completionTimestamp = rewardedAt || completedAt || new Date();
  const typeKey = getQuestTypeKey(questType);
  const normalizedItems = Array.isArray(itemsEarned)
    ? itemsEarned.map(item => ({
        name: item?.name || null,
        quantity: typeof item?.quantity === 'number' ? item.quantity : 1
      }))
    : [];
  
  // ------------------- Validate questId -------------------
  // questId is required for proper tracking - warn if missing but don't fail
  if (!questId || questId.trim() === '') {
    logger.warn('QUEST', `Quest completion recorded without questId for user ${this.discordId}. This may cause tracking issues.`);
  }
  
  let isNewCompletion = true;
  let existingCompletion = null;
  
  if (questId) {
    existingCompletion = questTracking.completions.find(entry => entry.questId === questId);
    if (existingCompletion) {
      const prevSlotOnly = existingCompletion.slotOnlyTurnIn === true;
      const prevTypeKey = getQuestTypeKey(existingCompletion.questType);
      // Update existing completion
      existingCompletion.questType = questType;
      existingCompletion.questTitle = questTitle;
      existingCompletion.completedAt = completedAt || existingCompletion.completedAt || completionTimestamp;
      existingCompletion.rewardedAt = rewardedAt || completionTimestamp;
      existingCompletion.tokensEarned = tokensEarned;
      existingCompletion.itemsEarned = normalizedItems;
      existingCompletion.rewardSource = rewardSource;
      if (slotOnlyTurnIn === true) {
        existingCompletion.slotOnlyTurnIn = true;
      }
      if (!prevSlotOnly && slotOnlyTurnIn === true) {
        questTracking.typeTotals[prevTypeKey] = Math.max(0, (questTracking.typeTotals[prevTypeKey] || 0) - 1);
        questTracking.typeTotals.meme = (questTracking.typeTotals.meme || 0) + 1;
      }
      isNewCompletion = false;
    }
  } else {
    // If no questId provided, check if there's a completion with matching title and recent date
    // This helps prevent duplicates when questId is missing
    if (questTitle) {
      const recentDate = new Date(completionTimestamp.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      existingCompletion = questTracking.completions.find(entry => 
        !entry.questId && 
        entry.questTitle === questTitle &&
        entry.completedAt && 
        new Date(entry.completedAt) >= recentDate
      );
      if (existingCompletion) {
        const prevSlotOnly = existingCompletion.slotOnlyTurnIn === true;
        const prevTypeKey = getQuestTypeKey(existingCompletion.questType);
        // Update existing completion even without questId match
        existingCompletion.questType = questType;
        existingCompletion.questTitle = questTitle;
        existingCompletion.completedAt = completedAt || existingCompletion.completedAt || completionTimestamp;
        existingCompletion.rewardedAt = rewardedAt || completionTimestamp;
        existingCompletion.tokensEarned = tokensEarned;
        existingCompletion.itemsEarned = normalizedItems;
        existingCompletion.rewardSource = rewardSource;
        if (slotOnlyTurnIn === true) {
          existingCompletion.slotOnlyTurnIn = true;
        }
        if (!prevSlotOnly && slotOnlyTurnIn === true) {
          questTracking.typeTotals[prevTypeKey] = Math.max(0, (questTracking.typeTotals[prevTypeKey] || 0) - 1);
          questTracking.typeTotals.meme = (questTracking.typeTotals.meme || 0) + 1;
        }
        // Try to set questId if we now have it
        if (questId) {
          existingCompletion.questId = questId;
        }
        isNewCompletion = false;
      }
    }
  }
  
  if (isNewCompletion) {
    questTracking.completions.push({
      questId,
      questType,
      questTitle,
      completedAt: completedAt || completionTimestamp,
      rewardedAt: rewardedAt || completionTimestamp,
      tokensEarned,
      itemsEarned: normalizedItems,
      rewardSource,
      slotOnlyTurnIn: Boolean(slotOnlyTurnIn)
    });
    questTracking.bot.completed += 1;
    if (slotOnlyTurnIn === true) {
      questTracking.bot.pendingSlotOnly = (questTracking.bot.pendingSlotOnly || 0) + 1;
    } else {
      questTracking.bot.pending = (questTracking.bot.pending || 0) + 1;
    }
    if (slotOnlyTurnIn === true) {
      questTracking.typeTotals.meme = (questTracking.typeTotals.meme || 0) + 1;
    } else {
      questTracking.typeTotals[typeKey] = (questTracking.typeTotals[typeKey] || 0) + 1;
    }
  } else {
    const actualCompletions = countUniqueQuestCompletions(questTracking.completions);
    if (questTracking.bot.completed !== actualCompletions) {
      logger.warn('QUEST', `Quest tracking mismatch for user ${this.discordId}: bot.completed=${questTracking.bot.completed}, actual=${actualCompletions}. Auto-fixing...`);
      const diff = actualCompletions - questTracking.bot.completed;
      questTracking.bot.completed = actualCompletions;
      if (diff > 0) {
        questTracking.bot.pending = (questTracking.bot.pending || 0) + diff;
        logger.info('QUEST', `Fixed bot.pending: added ${diff} missing completions for user ${this.discordId}`);
      }
    }
  }

  questTracking.lastCompletionAt = completionTimestamp;
  if (questTracking.completions.length > 25) {
    questTracking.completions = questTracking.completions.slice(-25);
  }

  await this.save();

  return {
    totalCompleted: questTracking.bot.completed,
    lastCompletionAt: questTracking.lastCompletionAt,
    typeTotals: questTracking.typeTotals,
    pendingTurnIns: this.getQuestPendingTurnIns()
  };
};

userSchema.methods.getQuestStats = function() {
  const questTracking = this.ensureQuestTracking();
  const legacy = questTracking.legacy || defaultQuestTracking().legacy;
  const legacyClone = {
    completed: legacy.completed ?? 0,
    pending: legacy.pending ?? 0,
    transferredAt: legacy.transferredAt ?? null,
    transferUsed: Boolean(legacy.transferUsed)
  };
  const botCompleted = questTracking.bot?.completed ?? 0;
  const allTimeTotal = botCompleted + legacyClone.completed;
  const turnInSummary = this.getQuestTurnInSummary();
  const completions = questTracking.completions || [];
  const questList = completions.map((c) => ({
    name: c.questTitle || 'Unknown',
    year: c.completedAt ? String(new Date(c.completedAt).getFullYear()) : '',
    category: c.questType || ''
  }));
  return {
    totalCompleted: botCompleted,
    legacy: legacyClone,
    allTimeTotal,
    lastCompletionAt: questTracking.lastCompletionAt,
    typeTotals: { ...questTracking.typeTotals },
    recentCompletions: questTracking.completions.slice(-5).reverse(),
    pendingTurnIns: turnInSummary.totalPending,
    turnInSummary,
    questList
  };
};

userSchema.methods.canUseLegacyQuestTransfer = function() {
  const questTracking = this.ensureQuestTracking();
  return questTracking.legacy?.transferUsed !== true;
};

userSchema.methods.applyLegacyQuestTransfer = async function({
  totalCompleted = 0,
  pendingTurnIns = 0
} = {}) {
  const questTracking = this.ensureQuestTracking();

  if (questTracking.legacy?.transferUsed) {
    return {
      success: false,
      error: 'Legacy quest transfer has already been used.'
    };
  }

  const sanitizedTotal = Number.isFinite(totalCompleted) ? Math.max(0, Math.floor(totalCompleted)) : 0;
  const sanitizedPending = Number.isFinite(pendingTurnIns) ? Math.max(0, Math.floor(pendingTurnIns)) : 0;

  if (sanitizedPending > sanitizedTotal) {
    return {
      success: false,
      error: 'Pending turn-ins cannot exceed total transferred quests.'
    };
  }

  if (!questTracking.legacy || typeof questTracking.legacy !== 'object') {
    questTracking.legacy = { ...defaultQuestTracking().legacy };
  }
  questTracking.legacy.completed = sanitizedTotal;
  questTracking.legacy.pending = sanitizedPending;
  questTracking.legacy.transferredAt = new Date();
  questTracking.legacy.transferUsed = true;

  this.recomputePendingTurnInsIfNeeded('applyLegacyQuestTransfer');

  await this.save();

  return {
    success: true,
    legacy: {
      completed: questTracking.legacy.completed,
      pending: questTracking.legacy.pending,
      transferredAt: questTracking.legacy.transferredAt,
      transferUsed: questTracking.legacy.transferUsed
    },
    allTimeTotal: (questTracking.bot?.completed ?? 0) + questTracking.legacy.completed,
    pendingTurnIns: this.getQuestPendingTurnIns(),
    turnInSummary: this.getQuestTurnInSummary()
  };
};

userSchema.methods.getQuestPendingTurnIns = function() {
  const questTracking = this.ensureQuestTracking();
  const legacyPending = safePendingNumber(questTracking.legacy?.pending);
  const botPending = safePendingNumber(questTracking.bot?.pending);
  const slotOnly = safePendingNumber(questTracking.bot?.pendingSlotOnly);
  return Math.max(0, legacyPending + botPending + slotOnly);
};

userSchema.methods.getQuestTurnInSummary = function() {
  const questTracking = this.ensureQuestTracking();
  const legacyPending = safePendingNumber(questTracking.legacy?.pending);
  const botPending = safePendingNumber(questTracking.bot?.pending);
  const slotOnlyPending = safePendingNumber(questTracking.bot?.pendingSlotOnly);
  const orbEligiblePending = Math.max(0, legacyPending + botPending);
  const totalPending = Math.max(0, orbEligiblePending + slotOnlyPending);
  const redeemableSets = Math.floor(totalPending / 10);
  const remainder = totalPending % 10;
  const redeemableOrbSets = Math.floor(orbEligiblePending / 10);
  const orbRemainder = orbEligiblePending % 10;

  return {
    totalPending,
    redeemableSets,
    remainder,
    legacyPending,
    currentPending: botPending,
    slotOnlyPending,
    orbEligiblePending,
    redeemableOrbSets,
    orbRemainder
  };
};

userSchema.methods.consumeQuestTurnIns = async function(amount = 10, options = {}) {
  const questTracking = this.ensureQuestTracking();
  const sanitizedAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const rewardType = options.rewardType === 'spirit_orb' ? 'spirit_orb' : 'character_slot';

  if (sanitizedAmount <= 0) {
    return { success: false, error: 'Amount to consume must be greater than zero.' };
  }

  this.recomputePendingTurnInsIfNeeded('consumeQuestTurnIns');

  const legacyBefore = safePendingNumber(questTracking.legacy?.pending);
  const botBefore = safePendingNumber(questTracking.bot?.pending);
  const slotOnlyBefore = safePendingNumber(questTracking.bot?.pendingSlotOnly);
  const orbEligibleBefore = legacyBefore + botBefore;
  const totalPending = orbEligibleBefore + slotOnlyBefore;

  if (rewardType === 'spirit_orb') {
    if (orbEligibleBefore < sanitizedAmount) {
      return {
        success: false,
        error:
          `Not enough quest turn-ins that count toward a Spirit Orb. You have ${orbEligibleBefore} (Hard Group Art Meme credits are for character slots only). You need ${sanitizedAmount}.`
      };
    }
  } else if (totalPending < sanitizedAmount) {
    return {
      success: false,
      error: `Not enough pending quest turn-ins. You currently have ${totalPending}.`
    };
  }

  if (!questTracking.legacy || typeof questTracking.legacy !== 'object') {
    questTracking.legacy = { ...defaultQuestTracking().legacy };
  }

  let remaining = sanitizedAmount;
  let consumedFromCurrent = 0;
  let consumedFromLegacy = 0;
  let consumedFromSlotOnly = 0;

  if (rewardType === 'spirit_orb') {
    if (botBefore > 0 && remaining > 0) {
      consumedFromCurrent = Math.min(botBefore, remaining);
      remaining -= consumedFromCurrent;
    }
    if (remaining > 0 && legacyBefore > 0) {
      consumedFromLegacy = Math.min(legacyBefore, remaining);
      remaining -= consumedFromLegacy;
    }
  } else {
    if (botBefore > 0 && remaining > 0) {
      consumedFromCurrent = Math.min(botBefore, remaining);
      remaining -= consumedFromCurrent;
    }
    if (remaining > 0 && legacyBefore > 0) {
      consumedFromLegacy = Math.min(legacyBefore, remaining);
      remaining -= consumedFromLegacy;
    }
    if (remaining > 0 && slotOnlyBefore > 0) {
      consumedFromSlotOnly = Math.min(slotOnlyBefore, remaining);
      remaining -= consumedFromSlotOnly;
    }
  }

  questTracking.bot.pending = Math.max(0, botBefore - consumedFromCurrent);
  questTracking.legacy.pending = Math.max(0, legacyBefore - consumedFromLegacy);
  questTracking.bot.pendingSlotOnly = Math.max(0, slotOnlyBefore - consumedFromSlotOnly);

  questTracking.bot.pending = safePendingNumber(questTracking.bot?.pending);
  questTracking.legacy.pending = safePendingNumber(questTracking.legacy?.pending);
  questTracking.bot.pendingSlotOnly = safePendingNumber(questTracking.bot?.pendingSlotOnly);

  const totalAfterConsume = this.getQuestPendingTurnIns();
  if (totalAfterConsume <= 0) {
    questTracking.bot.pending = 0;
    questTracking.bot.pendingSlotOnly = 0;
    questTracking.legacy.pending = 0;
  }

  if (remaining > 0) {
    const consumed = consumedFromCurrent + consumedFromLegacy + consumedFromSlotOnly;
    logger.error(
      'QUEST',
      `consumeQuestTurnIns: attempted to consume ${sanitizedAmount} but only consumed ${consumed} (bot=${consumedFromCurrent} legacy=${consumedFromLegacy} slotOnly=${consumedFromSlotOnly}); totalPending before was ${totalPending}; userId=${this.discordId}`
    );
  }

  const setsThisTimeForUpdate = Math.floor(sanitizedAmount / 10) || 1;
  const historyEntry = {
    turnedInAt: new Date(),
    amount: sanitizedAmount,
    fromBot: consumedFromCurrent,
    fromLegacy: consumedFromLegacy,
    fromBotSlotOnly: consumedFromSlotOnly
  };
  const updatePipeline = [
    {
      $set: {
        'quests.bot.pending': {
          $max: [
            0,
            { $subtract: [{ $ifNull: ['$quests.bot.pending', 0] }, consumedFromCurrent] }
          ]
        },
        'quests.bot.pendingSlotOnly': {
          $max: [
            0,
            { $subtract: [{ $ifNull: ['$quests.bot.pendingSlotOnly', 0] }, consumedFromSlotOnly] }
          ]
        },
        'quests.legacy.pending': {
          $max: [
            0,
            { $subtract: [{ $ifNull: ['$quests.legacy.pending', 0] }, consumedFromLegacy] }
          ]
        },
        'quests.turnIns.totalSetsTurnedIn': {
          $add: [{ $ifNull: ['$quests.turnIns.totalSetsTurnedIn', 0] }, setsThisTimeForUpdate]
        },
        'quests.turnIns.lastTurnedInAt': new Date(),
        'quests.turnIns.history': {
          $slice: [
            { $concatArrays: [{ $ifNull: ['$quests.turnIns.history', []] }, [historyEntry]] },
            -25
          ]
        }
      }
    }
  ];
  let updatedDoc;
  try {
    updatedDoc = await this.constructor.findOneAndUpdate(
      { _id: this._id },
      updatePipeline,
      { new: true }
    );
  } catch (err) {
    logger.error('QUEST', `consumeQuestTurnIns: findOneAndUpdate failed; userId=${this.discordId}`, err);
    return {
      success: false,
      error: 'Failed to save turn-in. Please try again.'
    };
  }
  if (!updatedDoc || !updatedDoc.quests) {
    logger.error('QUEST', `consumeQuestTurnIns: no document updated; userId=${this.discordId}`);
    return {
      success: false,
      error: 'Failed to save turn-in. Please try again.'
    };
  }

  questTracking.bot.pending = safePendingNumber(updatedDoc.quests.bot?.pending);
  questTracking.bot.pendingSlotOnly = safePendingNumber(updatedDoc.quests.bot?.pendingSlotOnly);
  questTracking.legacy.pending = safePendingNumber(updatedDoc.quests.legacy?.pending);
  questTracking.turnIns = updatedDoc.quests.turnIns || questTracking.turnIns;

  const turnInSummary = updatedDoc.getQuestTurnInSummary ? updatedDoc.getQuestTurnInSummary() : this.getQuestTurnInSummary();
  return {
    success: true,
    consumed: sanitizedAmount,
    consumedFromCurrent,
    consumedFromLegacy,
    consumedFromSlotOnly,
    remainingPending: turnInSummary.totalPending,
    turnInSummary
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
  
  // Calculate cumulative XP for the MEE6 level
  // MEE6 uses cumulative XP (sum of all level requirements from 1 to N)
  const xpRequired = this.getTotalXPForLevel(mee6Level);
  
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

// ------------------- Birthday Methods -------------------
userSchema.methods.setBirthday = async function(month, day) {
  // Initialize birthday object if it doesn't exist
  if (!this.birthday) {
    this.birthday = {
      month: null,
      day: null,
      lastBirthdayReward: null,
      birthdayRewards: []
    };
  }
  
  // Validate date
  if (!this.isValidBirthday(month, day)) {
    return {
      success: false,
      message: 'Invalid birthday date. Please check the month and day.'
    };
  }
  
  this.birthday.month = month;
  this.birthday.day = day;
  
  await this.save();
  
  return {
    success: true,
    message: `Birthday set to ${this.formatBirthday()}!`,
    birthday: this.formatBirthday()
  };
};

userSchema.methods.isValidBirthday = function(month, day) {
  if (!month || !day || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  
  // Check if day is valid for the month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > daysInMonth[month - 1]) {
    return false;
  }
  
  // Allow February 29th (they'll get rewards on Feb 28 in non-leap years)
  return true;
};

userSchema.methods.formatBirthday = function() {
  if (!this.birthday || !this.birthday.month || !this.birthday.day) {
    return null;
  }
  
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  
  const monthName = months[this.birthday.month - 1];
  const day = this.birthday.day;
  
  return `${monthName} ${day}`;
};

userSchema.methods.isBirthdayToday = function() {
  if (!this.birthday || !this.birthday.month || !this.birthday.day) {
    return false;
  }
  
  const today = new Date();
  return today.getMonth() + 1 === this.birthday.month && today.getDate() === this.birthday.day;
};

userSchema.methods.giveBirthdayRewards = async function(rewardType = 'random') {
  if (!this.birthday || !this.birthday.month || !this.birthday.day) {
    return {
      success: false,
      message: 'No birthday set'
    };
  }
  
  const currentYear = new Date().getFullYear().toString();
  
  // Check if already received rewards this year
  if (this.birthday.lastBirthdayReward === currentYear) {
    return {
      success: false,
      message: 'Birthday rewards already given this year'
    };
  }
  
  // Determine reward type
  let finalRewardType = rewardType;
  if (rewardType === 'random') {
    finalRewardType = Math.random() < 0.5 ? 'tokens' : 'discount';
  }
  
  let rewardAmount = 0;
  let rewardDescription = '';
  
  if (finalRewardType === 'tokens') {
    rewardAmount = 1500;
    this.tokens = (this.tokens || 0) + rewardAmount;
    rewardDescription = `1500 tokens`;
  } else if (finalRewardType === 'discount') {
    rewardAmount = 75;
    rewardDescription = `75% discount in village shops (active until end of your birthday)`;
    
    // Set discount to expire at end of birthday (11:59:59 PM EST)
    // Get current time in EST-equivalent (UTC-5) to determine the birthday date
    const now = new Date();
    const estNow = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    
    // Get EST date components
    const year = estNow.getFullYear();
    const month = estNow.getMonth();
    const day = estNow.getDate();
    
    // Create expiration date: 11:59:59.999 PM EST
    // Method: Create a date representing end of day EST by using UTC calculation
    // EST is UTC-5, EDT is UTC-4. We'll determine the offset dynamically.
    // Create a date at the start of the day in EST, then add 23:59:59.999 hours
    const startOfDayUTC = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    // Get what this UTC time is in EST to calculate offset
    const startESTString = startOfDayUTC.toLocaleString("en-US", { 
      timeZone: "America/New_York", 
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    // Parse the date parts from EST string (format: "MM/DD/YYYY, HH:MM:SS")
    const estParts = startESTString.match(/(\d+)\/(\d+)\/(\d+),\s+(\d+):(\d+):(\d+)/);
    if (estParts) {
      const estMonth = parseInt(estParts[1]) - 1;
      const estDay = parseInt(estParts[2]);
      const estYear = parseInt(estParts[3]);
      const estHour = parseInt(estParts[4]);
      // Calculate offset: difference between UTC and EST for this date
      const estDate = new Date(estYear, estMonth, estDay, estHour, 0, 0, 0);
      const offsetMs = startOfDayUTC.getTime() - estDate.getTime();
      // Create expiration: start of day UTC + offset + 23:59:59.999 hours
      const expirationDate = new Date(startOfDayUTC.getTime() + offsetMs + (23 * 60 * 60 * 1000) + (59 * 60 * 1000) + (59 * 1000) + 999);
      this.birthday.birthdayDiscountExpiresAt = expirationDate;
    } else {
      // Fallback: use EST offset of 5 hours (UTC-5)
      const expirationDate = new Date(Date.UTC(year, month, day, 23 + 5, 59, 59, 999));
      this.birthday.birthdayDiscountExpiresAt = expirationDate;
    }
  }
  
  // Update birthday tracking
  this.birthday.lastBirthdayReward = currentYear;
  this.birthday.birthdayRewards.push({
    year: currentYear,
    rewardType: finalRewardType,
    amount: rewardAmount,
    timestamp: new Date()
  });
  
  // Keep only last 10 birthday reward records
  if (this.birthday.birthdayRewards.length > 10) {
    this.birthday.birthdayRewards = this.birthday.birthdayRewards.slice(-10);
  }
  
  await this.save();
  
  return {
    success: true,
    message: 'Birthday rewards given!',
    rewardType: finalRewardType,
    rewardAmount: rewardAmount,
    rewardDescription: rewardDescription,
    newTokenBalance: this.tokens
  };
};

userSchema.methods.hasBirthdayDiscount = function() {
  if (!this.birthday || !this.birthday.birthdayDiscountExpiresAt) {
    return false;
  }
  
  // Compare using EST timezone to match expiration date timezone
  // Both dates are stored as UTC internally, so we compare UTC timestamps
  // but we need to ensure we're comparing EST times
  const now = new Date();
  const expiration = this.birthday.birthdayDiscountExpiresAt;
  
  // Get current time in EST to compare with expiration (which represents end of day EST)
  const nowESTString = now.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
  const expirationESTString = expiration.toLocaleString("en-US", { timeZone: "America/New_York", hour12: false });
  
  // Parse both as dates and compare (they'll be in server timezone, but the relative comparison is correct)
  // Better: compare the actual UTC timestamps since expiration is stored as UTC representing EST time
  return now < expiration;
};

userSchema.methods.getBirthdayDiscountAmount = function() {
  if (this.hasBirthdayDiscount()) {
    return 75; // 75% discount
  }
  return 0;
};

// ------------------- Boost Reward Methods -------------------
userSchema.methods.giveBoostRewards = async function() {
  // Initialize boostRewards object if it doesn't exist
  if (!this.boostRewards) {
    this.boostRewards = {
      lastRewardMonth: null,
      totalRewards: 0,
      rewardHistory: []
    };
  }
  
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // Check if already received rewards this month
  if (this.boostRewards.lastRewardMonth === currentMonth) {
    return {
      success: false,
      message: 'Boost rewards already given this month',
      alreadyRewarded: true
    };
  }
  
  // Flat reward: 1000 tokens for boosting
  const tokensToReceive = 1000;
  
  // Add tokens
  this.tokens = (this.tokens || 0) + tokensToReceive;
  
  // Update boost reward tracking
  this.boostRewards.lastRewardMonth = currentMonth;
  this.boostRewards.totalRewards += tokensToReceive;
  
  // Add to reward history
  this.boostRewards.rewardHistory.push({
    month: currentMonth,
    boostCount: 1, // Track as 1 entry for history purposes
    tokensReceived: tokensToReceive,
    timestamp: now
  });
  
  // Keep only last 12 months of history
  if (this.boostRewards.rewardHistory.length > 12) {
    this.boostRewards.rewardHistory = this.boostRewards.rewardHistory.slice(-12);
  }
  
  await this.save();
  
  return {
    success: true,
    message: `Received ${tokensToReceive} tokens for boosting the server!`,
    tokensReceived: tokensToReceive,
    newTokenBalance: this.tokens,
    month: currentMonth
  };
};

// ------------------- Export the User model -------------------
const User = mongoose.models.User || mongoose.model('User', userSchema);
module.exports = User;
