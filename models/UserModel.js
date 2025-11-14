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
  },

  // ------------------- Birthday System -------------------
  birthday: {
    month: { type: Number, min: 1, max: 12, default: null }, // Birthday month (1-12)
    day: { type: Number, min: 1, max: 31, default: null }, // Birthday day (1-31)
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
  quests: {
    totalCompleted: { type: Number, default: 0 }, // Total number of standard quests completed
    lastCompletionAt: { type: Date, default: null }, // Timestamp of most recent quest completion
    typeTotals: {
      art: { type: Number, default: 0 },
      writing: { type: Number, default: 0 },
      interactive: { type: Number, default: 0 },
      rp: { type: Number, default: 0 },
      artWriting: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
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
        rewardSource: { type: String, default: 'immediate' }
      }
    ],
    legacy: {
      totalTransferred: { type: Number, default: 0 },
      pendingTurnIns: { type: Number, default: 0 },
      transferredAt: { type: Date, default: null },
      transferUsed: { type: Boolean, default: false }
    }
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
  // MEE6-style exponential level calculation (CUMULATIVE)
  // XP accumulates: you need the sum of all XP requirements from level 1 to N
  // Level 1: 0 XP
  // Level 2: 220 XP total
  // Level 5: 1,370 XP total
  // Level 10: 5,520 XP total
  // Level 50: 283,220 XP total
  // Level 91: ~1.5M XP total
  // To go from 91→92 needs: 46,055 XP
  if (!this.leveling) return 1;
  
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
    totalCompleted: 0,
    lastCompletionAt: null,
    pendingTurnIns: 0,
    typeTotals: {
      art: 0,
      writing: 0,
      interactive: 0,
      rp: 0,
      artWriting: 0,
      other: 0
    },
    completions: [],
    legacy: {
      totalTransferred: 0,
      pendingTurnIns: 0,
      transferredAt: null,
      transferUsed: false
    }
  };
}

userSchema.methods.ensureQuestTracking = function() {
  if (!this.quests) {
    this.quests = defaultQuestTracking();
  } else {
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
    
    if (!Array.isArray(this.quests.completions)) {
      this.quests.completions = [];
    }
    
    if (typeof this.quests.totalCompleted !== 'number') {
      this.quests.totalCompleted = 0;
    }

    if (typeof this.quests.pendingTurnIns !== 'number') {
      this.quests.pendingTurnIns = 0;
    }

    if (!this.quests.legacy) {
      this.quests.legacy = { ...defaultQuestTracking().legacy };
    } else {
      const legacyDefaults = defaultQuestTracking().legacy;
      for (const key of Object.keys(legacyDefaults)) {
        if (typeof this.quests.legacy[key] === 'undefined' || this.quests.legacy[key] === null) {
          this.quests.legacy[key] = legacyDefaults[key];
        }
      }
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
  rewardSource = 'immediate'
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
  
  let isNewCompletion = true;
  if (questId) {
    const existingCompletion = questTracking.completions.find(entry => entry.questId === questId);
    if (existingCompletion) {
      existingCompletion.questType = questType;
      existingCompletion.questTitle = questTitle;
      existingCompletion.completedAt = completedAt || existingCompletion.completedAt || completionTimestamp;
      existingCompletion.rewardedAt = rewardedAt || completionTimestamp;
      existingCompletion.tokensEarned = tokensEarned;
      existingCompletion.itemsEarned = normalizedItems;
      existingCompletion.rewardSource = rewardSource;
      isNewCompletion = false;
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
      rewardSource
    });
    
    questTracking.totalCompleted += 1;
    questTracking.pendingTurnIns = (questTracking.pendingTurnIns || 0) + 1;
    questTracking.typeTotals[typeKey] = (questTracking.typeTotals[typeKey] || 0) + 1;
  }
  
  questTracking.lastCompletionAt = completionTimestamp;
  
  if (questTracking.completions.length > 25) {
    questTracking.completions = questTracking.completions.slice(-25);
  }
  
  await this.save();
  
  return {
    totalCompleted: questTracking.totalCompleted,
    lastCompletionAt: questTracking.lastCompletionAt,
    typeTotals: questTracking.typeTotals
  };
};

userSchema.methods.getQuestStats = function() {
  const questTracking = this.ensureQuestTracking();
  const legacy = questTracking.legacy || defaultQuestTracking().legacy;
  const legacyClone = {
    totalTransferred: legacy.totalTransferred || 0,
    pendingTurnIns: legacy.pendingTurnIns || 0,
    transferredAt: legacy.transferredAt || null,
    transferUsed: legacy.transferUsed || false
  };
  const allTimeTotal = (questTracking.totalCompleted || 0) + legacyClone.totalTransferred;
  const turnInSummary = this.getQuestTurnInSummary();
  return {
    totalCompleted: questTracking.totalCompleted,
    legacy: legacyClone,
    allTimeTotal,
    lastCompletionAt: questTracking.lastCompletionAt,
    typeTotals: { ...questTracking.typeTotals },
    recentCompletions: questTracking.completions.slice(-5).reverse(),
    pendingTurnIns: turnInSummary.totalPending,
    turnInSummary
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

  questTracking.legacy.totalTransferred = sanitizedTotal;
  questTracking.legacy.pendingTurnIns = sanitizedPending;
  questTracking.legacy.transferredAt = new Date();
  questTracking.legacy.transferUsed = true;

  await this.save();

  return {
    success: true,
    legacy: {
      totalTransferred: questTracking.legacy.totalTransferred,
      pendingTurnIns: questTracking.legacy.pendingTurnIns,
      transferredAt: questTracking.legacy.transferredAt,
      transferUsed: questTracking.legacy.transferUsed
    },
    allTimeTotal: (questTracking.totalCompleted || 0) + questTracking.legacy.totalTransferred,
    pendingTurnIns: this.getQuestPendingTurnIns(),
    turnInSummary: this.getQuestTurnInSummary()
  };
};

userSchema.methods.getQuestPendingTurnIns = function() {
  const questTracking = this.ensureQuestTracking();
  const legacyPending = questTracking.legacy?.pendingTurnIns || 0;

  // Placeholder for future non-legacy pending tracking.
  const currentPending = questTracking.pendingTurnIns || 0;

  return legacyPending + currentPending;
};

userSchema.methods.getQuestTurnInSummary = function() {
  const questTracking = this.ensureQuestTracking();
  const legacyPending = questTracking.legacy?.pendingTurnIns || 0;
  const currentPending = questTracking.pendingTurnIns || 0;
  const totalPending = legacyPending + currentPending;
  const redeemableSets = Math.floor(totalPending / 10);
  const remainder = totalPending % 10;

  return {
    totalPending,
    redeemableSets,
    remainder,
    legacyPending,
    currentPending
  };
};

userSchema.methods.consumeQuestTurnIns = async function(amount = 10) {
  const questTracking = this.ensureQuestTracking();
  const sanitizedAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;

  if (sanitizedAmount <= 0) {
    return { success: false, error: 'Amount to consume must be greater than zero.' };
  }

  const totalPending = this.getQuestPendingTurnIns();
  if (totalPending < sanitizedAmount) {
    return {
      success: false,
      error: `Not enough pending quest turn-ins. You currently have ${totalPending}.`
    };
  }

  let remaining = sanitizedAmount;

  if (questTracking.pendingTurnIns && questTracking.pendingTurnIns > 0) {
    const deductCurrent = Math.min(questTracking.pendingTurnIns, remaining);
    questTracking.pendingTurnIns -= deductCurrent;
    remaining -= deductCurrent;
  }

  if (remaining > 0 && questTracking.legacy?.pendingTurnIns) {
    questTracking.legacy.pendingTurnIns = Math.max(0, questTracking.legacy.pendingTurnIns - remaining);
    remaining = 0;
  }

  await this.save();

  return {
    success: true,
    consumed: sanitizedAmount,
    remainingPending: this.getQuestPendingTurnIns(),
    turnInSummary: this.getQuestTurnInSummary()
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
    
    // Set discount to expire at end of birthday (11:59:59 PM)
    const now = new Date();
    const expirationDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    this.birthday.birthdayDiscountExpiresAt = expirationDate;
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
  
  const now = new Date();
  return now < this.birthday.birthdayDiscountExpiresAt;
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
const User = mongoose.model('User', userSchema);
module.exports = User;
