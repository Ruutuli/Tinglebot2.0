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
    maxRounds: 6, // 6 rounds of spawns + cleanup
    segments: ['A', 'B', 'C', 'D', 'E', 'F'],
    rings: [
      { name: 'Outer Ring', difficulty: 5, description: 'Requires 5+ to defeat' },
      { name: 'Middle Ring', difficulty: 4, description: 'Requires 4+ to defeat' },
      { name: 'Inner Ring', difficulty: 3, description: 'Requires 3+ to defeat' }
    ],
    sessionDurationHours: 2, // Game expires after 2 hours
    maxPlayers: 50,
    startingAnimals: 25, // Total animals to protect
    maxAliensPerSegment: 1 // Only one alien per segment
  }
};

// ============================================================================
// ------------------- Alien Defense Game Logic -------------------
// ============================================================================

// ------------------- Function: addPlayerToTurnOrder -------------------
// Adds a player to the turn order when they sign up
function addPlayerToTurnOrder(gameData, playerId, playerName) {
  // Check if player is already in turn order
  if (gameData.turnOrder.find(p => p.discordId === playerId)) {
    return {
      success: false,
      message: '❌ You\'re already signed up for the turn order!'
    };
  }
  
  // Add player to turn order
  gameData.turnOrder.push({
    discordId: playerId,
    username: playerName,
    position: gameData.turnOrder.length + 1
  });
  
  return {
    success: true,
    message: `✅ **${playerName}** signed up! Position: ${gameData.turnOrder.length}`
  };
}

// ------------------- Function: spawnAliens -------------------
// Spawns aliens based on player count (1dX where X = players, max 6)
function spawnAliens(gameData, playerCount) {
  const maxSpawn = Math.min(playerCount, 6);
  const spawnCount = Math.floor(Math.random() * maxSpawn) + 1; // 1dX
  
  // Get available segments (no alien currently there)
  const occupiedSegments = gameData.aliens
    .filter(a => !a.defeated && a.ring === 1)
    .map(a => a.segment);
  const availableSegments = GAME_CONFIGS.theycame.segments.filter(s => !occupiedSegments.includes(s));
  
  // Spawn aliens in random available segments
  const newAliens = [];
  for (let i = 0; i < spawnCount && availableSegments.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * availableSegments.length);
    const segment = availableSegments.splice(randomIndex, 1)[0];
    
    newAliens.push({
      id: `${segment}1`, // Track + Ring format
      segment: segment,
      ring: 1, // Start in outer ring
      health: 1,
      defeated: false,
      defeatedBy: null,
      defeatedAt: null
    });
  }
  
  gameData.aliens.push(...newAliens);
  
  return {
    success: true,
    spawnCount: newAliens.length,
    message: `👾 **Round ${gameData.currentRound}:** ${newAliens.length} aliens spawned!`
  };
}

// ------------------- Function: createAlienDefenseGame -------------------
// Creates a new alien defense game session
function createAlienDefenseGame(channelId, guildId, createdBy) {
  const sessionId = generateUniqueId('A'); // Alien Defense prefix
  const expiresAt = new Date(Date.now() + (GAME_CONFIGS.theycame.sessionDurationHours * 60 * 60 * 1000));
  
  // Initialize empty game board - aliens spawn based on player count
  const gameData = {
    currentRound: 0, // Start at 0, first round is when aliens spawn
    maxRounds: GAME_CONFIGS.theycame.maxRounds,
    aliens: [], // Start with no aliens
    villageAnimals: GAME_CONFIGS.theycame.startingAnimals,
    roundHistory: [],
    gameBoard: {
      outerRing: GAME_CONFIGS.theycame.segments,
      middleRing: [],
      innerRing: []
    },
    turnOrder: [], // Players sign up in order
    currentTurnIndex: 0, // Current player's turn
    turnPhase: 'waiting' // waiting, rolling, advancing
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
  // Check if it's the player's turn (if turn order is active)
  if (gameData.turnOrder.length > 0) {
    const currentPlayer = gameData.turnOrder[gameData.currentTurnIndex];
    if (currentPlayer.discordId !== playerId) {
      return {
        success: false,
        message: `❌ It's not your turn! Current turn: **${currentPlayer.username}**`,
        gameData: gameData
      };
    }
  }
  
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
    
    // Advance to next player's turn
    if (gameData.turnOrder.length > 0) {
      gameData.currentTurnIndex = (gameData.currentTurnIndex + 1) % gameData.turnOrder.length;
    }
    
    return {
      success: true,
      message: `🎯 **${playerName}** defeated alien ${alien.id} with a ${roll}! (Required: ${requiredRoll}+)`,
      gameData: gameData
    };
  } else {
    // Advance to next player's turn even on miss
    if (gameData.turnOrder.length > 0) {
      gameData.currentTurnIndex = (gameData.currentTurnIndex + 1) % gameData.turnOrder.length;
    }
    
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
  // Move undefeated aliens inward
  const undefeatedAliens = gameData.aliens.filter(a => !a.defeated);
  let animalsLost = 0;
  
  undefeatedAliens.forEach(alien => {
    if (alien.ring < 3) {
      // Check if the target segment is already occupied
      const targetSegmentOccupied = gameData.aliens.some(a => 
        !a.defeated && a.segment === alien.segment && a.ring === alien.ring + 1
      );
      
      if (!targetSegmentOccupied) {
        alien.ring++;
        alien.id = `${alien.segment}${alien.ring}`;
      } else {
        // Can't move - alien is blocked, stays in current position
        // This shouldn't happen with proper game logic, but safety check
      }
    } else {
      // Alien reached the barn - steal an animal!
      gameData.villageAnimals = Math.max(0, gameData.villageAnimals - 1);
      animalsLost++;
      alien.defeated = true; // Remove from board
      alien.defeatedBy = 'barn';
      alien.defeatedAt = new Date();
    }
  });

  // Spawn new aliens in outer ring if not at max rounds
  let spawnResult = null;
  if (gameData.currentRound < gameData.maxRounds) {
    const playerCount = gameData.turnOrder.length || 1; // Use turn order count or default to 1
    spawnResult = spawnAliens(gameData, playerCount);
  }

  gameData.currentRound++;
  
  // Record round history
  gameData.roundHistory.push({
    round: gameData.currentRound - 1,
    aliensDefeated: gameData.aliens.filter(a => a.defeated && a.defeatedBy !== 'barn').length,
    animalsLost: animalsLost,
    timestamp: new Date()
  });

  let message = `🔄 **Round ${gameData.currentRound - 1} complete!**`;
  if (animalsLost > 0) {
    message += ` ${animalsLost} animal${animalsLost > 1 ? 's' : ''} lost!`;
  }
  if (spawnResult) {
    message += ` ${spawnResult.message}`;
  }

  return {
    success: true,
    message: message,
    gameData: gameData
  };
}

// ------------------- Function: checkAlienDefenseGameEnd -------------------
// Checks if the alien defense game should end
function checkAlienDefenseGameEnd(gameData) {
  const activeAliens = gameData.aliens.filter(a => !a.defeated);
  
  // Game ends if all animals are lost
  if (gameData.villageAnimals <= 0) {
    return {
      gameEnded: true,
      finalScore: 0,
      message: `💀 **Game Over!** All animals lost! The village has fallen!`
    };
  }
  
  // Game ends when no more aliens and all rounds are complete
  if (gameData.currentRound > gameData.maxRounds && activeAliens.length === 0) {
    const animalsSaved = gameData.villageAnimals;
    const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
    const percentage = Math.round((animalsSaved / totalAnimals) * 100);
    
    return {
      gameEnded: true,
      finalScore: animalsSaved,
      message: `🏁 **Game Over!** Village saved ${animalsSaved}/${totalAnimals} animals (${percentage}%)!`
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
  addPlayerToTurnOrder,
  spawnAliens,
  processAlienDefenseRoll,
  advanceAlienDefenseRound,
  checkAlienDefenseGameEnd,
  getAlienDefenseGameStatus
};
