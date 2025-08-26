// ============================================================================
// ------------------- Minigame Module -------------------
// Core logic for different minigames including "They Came for the Cows"
// ============================================================================

// ------------------- Standard Libraries -------------------
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ============================================================================
// ------------------- Game Configuration -------------------
// ============================================================================
const GAME_CONFIGS = {
  theycame: {
    name: 'They Came for the Cows',
    description: 'Aliens are coming for the livestock! Defend your village!',
    maxRounds: 5,
    segments: ['A', 'B', 'C', 'D', 'E', 'F'],
    rings: [
      { name: 'Outer Ring', difficulty: 5, description: 'Requires 5+ to defeat' },
      { name: 'Middle Ring', difficulty: 4, description: 'Requires 4+ to defeat' },
      { name: 'Inner Ring', difficulty: 3, description: 'Requires 3+ to defeat' }
    ],
    sessionDurationHours: 2, // Game expires after 2 hours
    maxPlayers: 50
  }
};

// ============================================================================
// ------------------- Alien Defense Game Logic -------------------
// ============================================================================

// ------------------- Function: createAlienDefenseGame -------------------
// Creates a new alien defense game session
function createAlienDefenseGame(channelId, guildId, createdBy) {
  const sessionId = generateUniqueId('A'); // Alien Defense prefix
  const expiresAt = new Date(Date.now() + (GAME_CONFIGS.theycame.sessionDurationHours * 60 * 60 * 1000));
  
  // Initialize game board with aliens in outer ring
  const initialAliens = GAME_CONFIGS.theycame.segments.map(segment => ({
    id: `${segment}1`,
    segment: segment,
    ring: 1, // Start in outer ring
    health: 1, // Each alien has 1 health
    defeated: false,
    defeatedBy: null,
    defeatedAt: null
  }));

  const gameData = {
    currentRound: 1,
    maxRounds: GAME_CONFIGS.theycame.maxRounds,
    aliens: initialAliens,
    villageAnimals: 10, // Starting animal count
    roundHistory: [],
    gameBoard: {
      outerRing: GAME_CONFIGS.theycame.segments,
      middleRing: [],
      innerRing: []
    }
  };

  return {
    sessionId,
    gameType: 'theycame',
    channelId,
    guildId,
    createdBy,
    expiresAt,
    status: 'waiting',
    players: [{
      discordId: createdBy,
      username: 'Game Creator',
      joinedAt: new Date()
    }],
    gameData
  };
}

// ------------------- Function: processAlienDefenseRoll -------------------
// Processes a player's roll against an alien
function processAlienDefenseRoll(gameData, playerId, playerName, targetAlienId, roll) {
  const alien = gameData.aliens.find(a => a.id === targetAlienId && !a.defeated);
  
  if (!alien) {
    return {
      success: false,
      message: '❌ Target alien not found or already defeated!',
      gameData: gameData
    };
  }

  const ring = GAME_CONFIGS.theycame.rings[alien.ring - 1];
  const requiredRoll = ring.difficulty;
  
  if (roll >= requiredRoll) {
    // Alien defeated!
    alien.defeated = true;
    alien.defeatedBy = playerId;
    alien.defeatedAt = new Date();
    
    return {
      success: true,
      message: `🎯 **${playerName}** defeated alien ${alien.id} with a ${roll}! (Required: ${requiredRoll}+)`,
      gameData: gameData
    };
  } else {
    return {
      success: false,
      message: `💥 **${playerName}** missed alien ${alien.id} with a ${roll}. (Required: ${requiredRoll}+)`,
      gameData: gameData
    };
  }
}

// ------------------- Function: advanceAlienDefenseRound -------------------
// Advances the game to the next round, moving undefeated aliens inward
function advanceAlienDefenseRound(gameData) {
  if (gameData.currentRound >= gameData.maxRounds) {
    return {
      success: false,
      message: '❌ Maximum rounds reached!',
      gameData: gameData
    };
  }

  // Move undefeated aliens inward
  const undefeatedAliens = gameData.aliens.filter(a => !a.defeated);
  
  undefeatedAliens.forEach(alien => {
    if (alien.ring < 3) {
      alien.ring++;
      alien.id = `${alien.segment}${alien.ring}`;
    } else {
      // Alien reached the barn - steal an animal!
      gameData.villageAnimals = Math.max(0, gameData.villageAnimals - 1);
      alien.defeated = true; // Remove from board
      alien.defeatedBy = 'barn';
      alien.defeatedAt = new Date();
    }
  });

  // Spawn new aliens in outer ring if not at max rounds
  if (gameData.currentRound < gameData.maxRounds) {
    const newAliens = GAME_CONFIGS.theycame.segments.map(segment => ({
      id: `${segment}${gameData.currentRound + 1}`,
      segment: segment,
      ring: 1,
      health: 1,
      defeated: false,
      defeatedBy: null,
      defeatedAt: null
    }));
    
    gameData.aliens.push(...newAliens);
  }

  gameData.currentRound++;
  
  // Record round history
  gameData.roundHistory.push({
    round: gameData.currentRound - 1,
    aliensDefeated: gameData.aliens.filter(a => a.defeated && a.defeatedBy !== 'barn').length,
    animalsLost: gameData.aliens.filter(a => a.defeated && a.defeatedBy === 'barn').length,
    timestamp: new Date()
  });

  return {
    success: true,
    message: `🔄 **Round ${gameData.currentRound - 1} complete!** Round ${gameData.currentRound} begins!`,
    gameData: gameData
  };
}

// ------------------- Function: checkAlienDefenseGameEnd -------------------
// Checks if the alien defense game should end
function checkAlienDefenseGameEnd(gameData) {
  const activeAliens = gameData.aliens.filter(a => !a.defeated);
  
  // Game ends when no more aliens and all rounds are complete
  if (gameData.currentRound > gameData.maxRounds && activeAliens.length === 0) {
    return {
      gameEnded: true,
      finalScore: gameData.villageAnimals,
      message: `🏁 **Game Over!** Village saved ${gameData.villageAnimals} animals!`
    };
  }
  
  return {
    gameEnded: false,
    finalScore: null,
    message: null
  };
}

// ------------------- Function: getAlienDefenseGameStatus -------------------
// Gets the current status of the alien defense game
function getAlienDefenseGameStatus(gameData) {
  const activeAliens = gameData.aliens.filter(a => !a.defeated);
  const defeatedAliens = gameData.aliens.filter(a => a.defeated);
  const animalsLost = gameData.aliens.filter(a => a.defeated && a.defeatedBy === 'barn').length;
  
  const ringStatus = {
    outerRing: activeAliens.filter(a => a.ring === 1).length,
    middleRing: activeAliens.filter(a => a.ring === 2).length,
    innerRing: activeAliens.filter(a => a.ring === 3).length
  };

  return {
    currentRound: gameData.currentRound,
    maxRounds: gameData.maxRounds,
    activeAliens: activeAliens.length,
    defeatedAliens: defeatedAliens.length,
    animalsLost: animalsLost,
    villageAnimals: gameData.villageAnimals,
    ringStatus: ringStatus,
    gameProgress: `${gameData.currentRound}/${gameData.maxRounds} rounds`
  };
}

// ============================================================================
// ------------------- Export Functions -------------------
// ============================================================================
module.exports = {
  GAME_CONFIGS,
  createAlienDefenseGame,
  processAlienDefenseRoll,
  advanceAlienDefenseRound,
  checkAlienDefenseGameEnd,
  getAlienDefenseGameStatus
};
