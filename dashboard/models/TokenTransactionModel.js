// ============================================================================
// 💰 Token Transaction Model
// Stores all token transactions (earned and spent) for tracking and analytics
// ============================================================================

const mongoose = require('mongoose');

const tokenTransactionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['earned', 'spent'],
    required: true,
    index: true
  },
  category: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  link: {
    type: String,
    default: ''
  },
  balanceBefore: {
    type: Number,
    default: 0
  },
  balanceAfter: {
    type: Number,
    default: 0
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  dayKey: {
    type: String,
    required: true,
    index: true
  } // Format: YYYY-MM-DD for daily aggregation
}, {
  timestamps: true
});

// Compound indexes for efficient queries
tokenTransactionSchema.index({ userId: 1, timestamp: -1 });
tokenTransactionSchema.index({ userId: 1, type: 1, timestamp: -1 });
tokenTransactionSchema.index({ userId: 1, dayKey: 1 });
tokenTransactionSchema.index({ type: 1, dayKey: 1 });

// Static method to get user's token transactions
tokenTransactionSchema.statics.getUserTransactions = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to get user's transaction summary
tokenTransactionSchema.statics.getUserTransactionSummary = async function(userId) {
  const transactions = await this.find({ userId }).lean();
  
  const totalEarned = transactions
    .filter(t => t.type === 'earned')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const totalSpent = transactions
    .filter(t => t.type === 'spent')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const earnedCount = transactions.filter(t => t.type === 'earned').length;
  const spentCount = transactions.filter(t => t.type === 'spent').length;
  
  // Get first and last transaction dates
  const sortedTransactions = transactions.sort((a, b) => 
    new Date(a.timestamp) - new Date(b.timestamp)
  );
  
  return {
    totalEarned,
    totalSpent,
    netTokens: totalEarned - totalSpent,
    earnedCount,
    spentCount,
    totalTransactions: transactions.length,
    firstTransactionDate: sortedTransactions[0]?.timestamp || null,
    lastTransactionDate: sortedTransactions[sortedTransactions.length - 1]?.timestamp || null
  };
};

// Static method to get daily token statistics
tokenTransactionSchema.statics.getDailyTokenStats = async function(userId, days = 7) {
  const today = new Date();
  const dayKeys = [];
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dayKeys.push(date.toISOString().split('T')[0]);
  }
  
  const transactions = await this.find({
    userId,
    dayKey: { $in: dayKeys }
  }).lean();
  
  const dailyStats = {};
  dayKeys.forEach(dayKey => {
    dailyStats[dayKey] = {
      earned: 0,
      spent: 0,
      net: 0,
      count: 0
    };
  });
  
  transactions.forEach(transaction => {
    const dayKey = transaction.dayKey;
    if (dailyStats[dayKey]) {
      if (transaction.type === 'earned') {
        dailyStats[dayKey].earned += Math.abs(transaction.amount);
      } else {
        dailyStats[dayKey].spent += Math.abs(transaction.amount);
      }
      dailyStats[dayKey].count++;
      dailyStats[dayKey].net = dailyStats[dayKey].earned - dailyStats[dayKey].spent;
    }
  });
  
  return dailyStats;
};

// Static method to get global token statistics
tokenTransactionSchema.statics.getGlobalTokenStats = async function() {
  const transactions = await this.find({}).lean();
  
  const totalEarned = transactions
    .filter(t => t.type === 'earned')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const totalSpent = transactions
    .filter(t => t.type === 'spent')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  const uniqueUsers = new Set(transactions.map(t => t.userId));
  
  const today = new Date().toISOString().split('T')[0];
  const todayTransactions = transactions.filter(t => t.dayKey === today);
  const todayEarned = todayTransactions
    .filter(t => t.type === 'earned')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const todaySpent = todayTransactions
    .filter(t => t.type === 'spent')
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  
  return {
    totalEarned,
    totalSpent,
    netTokens: totalEarned - totalSpent,
    totalTransactions: transactions.length,
    uniqueUsers: uniqueUsers.size,
    todayEarned,
    todaySpent,
    todayNet: todayEarned - todaySpent,
    todayTransactions: todayTransactions.length
  };
};

// Static method to create a transaction record
tokenTransactionSchema.statics.createTransaction = async function({
  userId,
  amount,
  type,
  category = '',
  description = '',
  link = '',
  balanceBefore = null,
  balanceAfter = null
}) {
  const today = new Date();
  const dayKey = today.toISOString().split('T')[0];
  
  const transaction = new this({
    userId,
    amount,
    type,
    category,
    description,
    link,
    balanceBefore: balanceBefore !== null ? balanceBefore : 0,
    balanceAfter: balanceAfter !== null ? balanceAfter : 0,
    dayKey
  });
  
  return await transaction.save();
};

module.exports = mongoose.models.TokenTransaction || mongoose.model('TokenTransaction', tokenTransactionSchema);

