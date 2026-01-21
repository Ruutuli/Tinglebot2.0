// ============================================================================
// ------------------- Villages API Routes -------------------
// Routes for village data and status
// ============================================================================

const express = require('express');
const router = express.Router();
const { Village } = require('@/shared/models/VillageModel');
const { asyncHandler } = require('../../middleware/errorHandler');
const logger = require('@/shared/utils/logger');

// ------------------- Function: getVillageStatus -------------------
// Returns current status for all villages
router.get('/status', asyncHandler(async (req, res) => {
  // Get all villages
  const villages = await Village.find({}).lean();
  
  // Organize by village name
  const villageStatus = {};
  const villageNames = ['Rudania', 'Inariko', 'Vhintl'];
  
  for (const village of villages) {
    // Convert Map fields to objects for JSON serialization
    const levelHealth = village.levelHealth instanceof Map 
      ? Object.fromEntries(village.levelHealth) 
      : village.levelHealth || {};
    
    const tokenRequirements = village.tokenRequirements instanceof Map 
      ? Object.fromEntries(village.tokenRequirements) 
      : village.tokenRequirements || {};
    
    const materials = village.materials instanceof Map 
      ? Object.fromEntries(village.materials) 
      : village.materials || {};
    
    // Ensure currentTokens is always a number (default to 0 if undefined/null)
    const currentTokens = typeof village.currentTokens === 'number' 
      ? village.currentTokens 
      : 0;
    
    // Get max health for current level
    const maxHealth = levelHealth[village.level.toString()] || 100;
    
    // Get token requirement for next level (if not max level)
    const nextLevel = village.level + 1;
    const requiredTokens = village.level < 3 
      ? (tokenRequirements[nextLevel.toString()] || 0)
      : 0;
    
    // Calculate token progress percentage
    const tokenProgressPercentage = requiredTokens > 0 
      ? Math.round((currentTokens / requiredTokens) * 100)
      : 100;
    
    // Format token progress
    const tokenProgress = {
      current: currentTokens,
      required: requiredTokens,
      percentage: tokenProgressPercentage
    };
    
    // Get vending tier display text
    let vendingTierText = 'Basic stock only';
    if (village.vendingTier === 3) {
      vendingTierText = 'Rare stock unlocked';
    } else if (village.vendingTier === 2) {
      vendingTierText = 'Mid-tier stock unlocked';
    }
    
    villageStatus[village.name] = {
      name: village.name,
      level: village.level,
      health: village.health,
      maxHealth: maxHealth,
      status: village.status || 'upgradable',
      tokenProgress: tokenProgress,
      vendingTier: village.vendingTier || 1,
      vendingDiscount: village.vendingDiscount || 0,
      vendingTierText: vendingTierText,
      color: village.color,
      region: village.region,
      emoji: village.emoji
    };
  }
  
  // Ensure all villages are present (in case some are missing)
  villageNames.forEach(name => {
    if (!villageStatus[name]) {
      logger.warn(`[villages.js] Village "${name}" not found in database`);
    }
  });
  
  res.json({
    villages: villageStatus
  });
}));

module.exports = router;
