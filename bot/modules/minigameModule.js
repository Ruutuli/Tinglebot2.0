// ============================================================================
// ------------------- Minigame Module -------------------
// Core logic for different minigames including "They Came for the Cows"
// ============================================================================

// ------------------- Standard Libraries -------------------
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const Jimp = require('jimp');
const { AttachmentBuilder } = require('discord.js');
const logger = require('../../utils/logger');

// ============================================================================
// ------------------- Game Configuration -------------------
// ============================================================================
const GAME_CONFIGS = {
  theycame: {
    name: 'They Came for the Cows',
    description: 'Aliens are coming for the livestock! Defend your village!',
    maxRounds: 8, // 6 rounds of spawns + 2 cleanup rounds
    segments: ['A', 'B', 'C', 'D', 'E', 'F'],
    rings: [
      { name: 'Outer Ring', difficulty: 5, description: 'Requires 5+ to defeat' },
      { name: 'Middle Ring', difficulty: 4, description: 'Requires 4+ to defeat' },
      { name: 'Inner Ring', difficulty: 3, description: 'Requires 3+ to defeat' }
    ],
    maxPlayers: 6,
    startingAnimals: 25, // Total animals to protect
    maxAliensPerSegment: 1, // Only one alien per segment
    images: {
      alien: 'https://storage.googleapis.com/tinglebot/Minigame/Alien.png',
      villages: {
        rudania: 'https://storage.googleapis.com/tinglebot/Minigame/TheyCame_Rudania.png',
        inariko: 'https://storage.googleapis.com/tinglebot/Minigame/TheyCame_Inariko.png',
        vhintl: 'https://storage.googleapis.com/tinglebot/Minigame/TheyCame_Vhintl.png'
      },
      defaultVillage: 'rudania'
    },
    alienPositions: {
      '1A': { x: 640, y: 105 },
      '2A': { x: 640, y: 315 },
      '3A': { x: 640, y: 530 },
      '1B': { x: 1170, y: 320 },
      '2B': { x: 1000, y: 530 },
      '3B': { x: 745, y: 600 },
      '1C': { x: 1195, y: 1000 },
      '2C': { x: 1000, y: 850 },
      '3C': { x: 800, y: 740 },
      '1D': { x: 640, y: 1210 },
      '2D': { x: 640, y: 1000 },
      '3D': { x: 640, y: 775 },
      '1E': { x: 80, y: 910 },
      '2E': { x: 310, y: 770 },
      '3E': { x: 500, y: 740 },
      '1F': { x: 75, y: 350 },
      '2F': { x: 310, y: 490 },
      '3F': { x: 510, y: 580 }
    }
  }
};

// ============================================================================
// ------------------- Image Helper Functions -------------------
// ============================================================================

// ------------------- Function: getCurrentVillageImage -------------------
// Gets the current village image URL based on the village name
function getCurrentVillageImage(villageName = null) {
  const config = GAME_CONFIGS.theycame.images;
  const village = villageName || config.defaultVillage;
  return config.villages[village] || config.villages[config.defaultVillage];
}

// ------------------- Function: getAlienImage -------------------
// Gets the alien image URL
function getAlienImage() {
  return GAME_CONFIGS.theycame.images.alien;
}

// ------------------- Function: getAvailableVillages -------------------
// Gets list of available village names
function getAvailableVillages() {
  return Object.keys(GAME_CONFIGS.theycame.images.villages);
}

// ------------------- Function: getAlienPosition -------------------
// Gets the pixel coordinates for an alien at a specific position
function getAlienPosition(alienId) {
  return GAME_CONFIGS.theycame.alienPositions[alienId] || null;
}

// ------------------- Function: getAlienPositions -------------------
// Gets all alien positions for the current game state
function getAlienPositions(gameData) {
  const activeAliens = gameData.aliens.filter(alien => !alien.defeated);
  return activeAliens.map(alien => ({
    id: alien.id,
    segment: alien.segment,
    ring: alien.ring,
    position: getAlienPosition(alien.id)
  }));
}


// ------------------- Function: generateAlienOverlayImage -------------------
// Generates a composite image with aliens overlaid on the village background
async function generateAlienOverlayImage(gameData, sessionId) {
  try {
    // Get village image
    const villageImageUrl = gameData?.images?.village || getCurrentVillageImage();
    const alienImageUrl = gameData?.images?.alien || getAlienImage();
    
    // Load village background
    const villageImg = await Jimp.read(villageImageUrl);
    
    // Get active aliens with positions
    const alienPositions = getAlienPositions(gameData);
    
    // Load alien image once
    const alienImg = await Jimp.read(alienImageUrl);
    
    // Resize images to appropriate size while maintaining aspect ratio
    const alienSize = 100; // Larger size for better visibility
    alienImg.resize(alienSize, Jimp.AUTO); // Maintain aspect ratio
    
    // Composite each alien onto the village image
    for (const alien of alienPositions) {
      if (alien.position) {
        const { x, y } = alien.position;
        
        // Only render active (non-defeated) aliens
        if (alien.defeated) {
          continue;
        }
        
        const imageClone = alienImg.clone();
        
        // Get actual dimensions of the resized image
        const imageWidth = imageClone.bitmap.width;
        const imageHeight = imageClone.bitmap.height;
        
        // Adjust position to center the image on the coordinates
        const adjustedX = Math.max(0, x - imageWidth / 2);
        const adjustedY = Math.max(0, y - imageHeight / 2);
        
        // Ensure we don't go outside the image bounds
        if (adjustedX + imageWidth <= villageImg.bitmap.width && 
            adjustedY + imageHeight <= villageImg.bitmap.height) {
          
          // Add ring-based color tinting only for active aliens (not defeated ones)
          if (!alien.defeated) {
            if (alien.ring === 1) {
              // Outer ring - red tint
              imageClone.color([
                { apply: 'red', params: [20] },
                { apply: 'brighten', params: [10] }
              ]);
            } else if (alien.ring === 2) {
              // Middle ring - orange tint
              imageClone.color([
                { apply: 'red', params: [10] },
                { apply: 'green', params: [5] },
                { apply: 'brighten', params: [5] }
              ]);
            } else if (alien.ring === 3) {
              // Inner ring - yellow tint
              imageClone.color([
                { apply: 'red', params: [5] },
                { apply: 'green', params: [10] },
                { apply: 'brighten', params: [15] }
              ]);
            }
          }
          
          // Composite the image onto the village
          villageImg.composite(imageClone, adjustedX, adjustedY, {
            mode: Jimp.BLEND_SOURCE_OVER,
            opacitySource: 0.9,
            opacityDest: 1
          });
        }
      }
    }
    
    
    // Generate static PNG
    const buffer = await villageImg.getBufferAsync(Jimp.MIME_PNG);
    const attachment = new AttachmentBuilder(buffer, { 
      name: `minigame-${sessionId}-overlay.png` 
    });
    return attachment;
  } catch (error) {
    console.error('[minigameModule.js]: Error generating alien overlay image:', error);
    return null;
  }
}


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
// Spawns aliens based on player count and round
// First turn: players + 2 (up to 6 max)
// Subsequent turns: 1dX (X = players)
function spawnAliens(gameData, playerCount, currentRound) {
  let spawnCount;
  
  if (currentRound === 0) {
    // First turn: players + 2 (up to 6 max)
    spawnCount = Math.min(playerCount + 2, 6);
  } else {
    // Subsequent turns: different logic based on player count
    if (playerCount >= 4) {
      // For 4+ players: 1d3 + (players - 3)
      // 4 players: 1d3 + 1 = 2-4 aliens
      // 5 players: 1d3 + 2 = 3-5 aliens  
      // 6 players: 1d3 + 3 = 4-6 aliens
      spawnCount = Math.floor(Math.random() * 3) + 1 + (playerCount - 3); // 1d3 + (players - 3)
    } else {
      // For 1-3 players: 1d3 (consistent challenge for small groups)
      spawnCount = Math.floor(Math.random() * 3) + 1; // 1d3
    }
  }
  
  // Get available segments (no alien currently there in outer ring)
  const occupiedSegments = gameData.aliens
    .filter(a => !a.defeated && a.ring === 1)
    .map(a => a.segment);
  const availableSegments = GAME_CONFIGS.theycame.segments.filter(s => !occupiedSegments.includes(s));
  
  // Spawn aliens in random available segments
  const newAliens = [];
  for (let i = 0; i < spawnCount && availableSegments.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * availableSegments.length);
    const segment = availableSegments.splice(randomIndex, 1)[0];
    
    const newAlien = {
      id: `1${segment}`, // Ring + Segment format
      segment: segment,
      ring: 1, // Start in outer ring
      health: 1,
      defeated: false,
      defeatedBy: null,
      defeatedAt: null
    };
    
    newAliens.push(newAlien);
  }
  
  gameData.aliens.push(...newAliens);
  
  logger.minigame.spawn(newAliens.length, newAliens.map(a => a.id));
  
  // Create spawn location messages
  const spawnMessages = newAliens.map(alien => {
    const ringNames = ['Outer', 'Middle', 'Inner'];
    const ringName = ringNames[alien.ring - 1] || 'Unknown';
    return `${alien.id} (${ringName})`;
  });

  return {
    success: true,
    spawnCount: newAliens.length,
    message: `👾 ${newAliens.length} aliens spawned!`,
    spawnLocations: spawnMessages
  };
}

// ------------------- Function: createAlienDefenseGame -------------------
// Creates a new alien defense game session
function createAlienDefenseGame(channelId, guildId, createdBy, village = 'rudania') {
  const sessionId = generateUniqueId('A'); // Alien Defense prefix
  
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
    turnPhase: 'waiting', // waiting, rolling, advancing
    village: village, // Selected village
    images: {
      alien: getAlienImage(),
      village: getCurrentVillageImage(village)
    }
  };

  return {
    sessionId,
    gameType: 'theycame',
    channelId,
    guildId,
    createdBy,
    status: 'waiting',
    players: [], // Start with empty players array - creator joins separately
    gameData
  };
}

// ------------------- Function: processAlienDefenseRoll -------------------
// Processes a player's roll against an alien
function processAlienDefenseRoll(gameData, playerId, playerName, targetAlienId, roll) {
  logger.info('MINIGAME', `Processing: ${playerName} vs ${targetAlienId} (Roll: ${roll})`);
  
  // Check if it's the player's turn (if turn order is active)
  if (gameData.turnOrder.length > 0) {
    const currentPlayer = gameData.turnOrder[gameData.currentTurnIndex];
    if (currentPlayer.discordId !== playerId) {
      logger.warn('MINIGAME', `Turn check failed: Expected ${currentPlayer.username}, got ${playerName}`);
      return {
        success: false,
        message: `❌ It's not your turn! Current turn: **${currentPlayer.username}**`,
        gameData: gameData
      };
    }
  }
  
  // Extract alien ID from target string (handle cases where user might input formatted string)
  let cleanAlienId = targetAlienId;
  if (targetAlienId.includes('👾')) {
    // Extract ID from formatted string like "👾 1A | Outer Ring | Difficulty: 5+" or "👾 2E | Middle Ring | Difficulty: 4+"
    const match = targetAlienId.match(/👾\s*([A-Z0-9]+)/);
    if (match) {
      cleanAlienId = match[1];
      logger.info('MINIGAME', `Extracted ID: ${cleanAlienId} from ${targetAlienId}`);
    } else {
      logger.warn('MINIGAME', `Failed to extract ID from: ${targetAlienId}`);
    }
  }
  
  const alien = gameData.aliens.find(a => a.id === cleanAlienId && !a.defeated);
  
  if (!alien) {
    logger.warn('MINIGAME', `Alien not found: ${cleanAlienId}`);
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
    logger.minigame.roll(playerName, alien.id, roll, requiredRoll);
    alien.defeated = true;
    alien.defeatedBy = playerId;
    alien.defeatedAt = new Date();
    
    // Check if game should end immediately after defeating this alien
    const gameEndCheck = checkAlienDefenseGameEnd(gameData);
    if (gameEndCheck.gameEnded) {
      logger.success('MINIGAME', `Game ended: ${gameEndCheck.message}`);
      return {
        success: true,
        message: `🎯 **${playerName}** defeated alien ${alien.id} with a ${roll}! (Required: ${requiredRoll}+)\n\n${gameEndCheck.message}`,
        gameData: gameData,
        shouldAdvanceRound: false,
        gameEnded: true,
        gameEndResult: gameEndCheck
      };
    }
    
    // Advance to next player's turn
    if (gameData.turnOrder.length > 0) {
      gameData.currentTurnIndex = (gameData.currentTurnIndex + 1) % gameData.turnOrder.length;
    }
    
    // Check if all players have taken their turn (completed a full cycle)
    const shouldAdvanceRound = gameData.turnOrder.length > 0 && gameData.currentTurnIndex === 0;
    
    return {
      success: true,
      message: `🎯 **${playerName}** defeated alien ${alien.id} with a ${roll}! (Required: ${requiredRoll}+)`,
      gameData: gameData,
      shouldAdvanceRound: shouldAdvanceRound
    };
  } else {
    // Advance to next player's turn even on miss
    logger.minigame.roll(playerName, alien.id, roll, requiredRoll);
    if (gameData.turnOrder.length > 0) {
      gameData.currentTurnIndex = (gameData.currentTurnIndex + 1) % gameData.turnOrder.length;
    }
    
    // Check if all players have taken their turn (completed a full cycle)
    const shouldAdvanceRound = gameData.turnOrder.length > 0 && gameData.currentTurnIndex === 0;
    
    return {
      success: false,
      message: `💥 **${playerName}** missed alien ${alien.id} with a ${roll}. (Required: ${requiredRoll}+)`,
      gameData: gameData,
      shouldAdvanceRound: shouldAdvanceRound
    };
  }
}

// ------------------- Function: advanceAlienDefenseRound -------------------
// Advances the game to the next round, moving undefeated aliens inward
function advanceAlienDefenseRound(gameData) {
  logger.info('MINIGAME', `Advancing Round ${gameData.currentRound}`);
  
  
  // Check if we've reached the maximum rounds (8) - end the game
  if (gameData.currentRound >= 8) {
    logger.info('MINIGAME', 'Max rounds reached, ending game');
    
    // Any remaining aliens steal animals at the end of round 8
    const activeAliens = gameData.aliens.filter(a => !a.defeated);
    let finalAnimalsLost = 0;
    let barnAliens = [];
    
    if (activeAliens.length > 0) {
      finalAnimalsLost = activeAliens.length;
      gameData.villageAnimals = Math.max(0, gameData.villageAnimals - finalAnimalsLost);
      
      // Mark remaining aliens as defeated by barn
      activeAliens.forEach(alien => {
        alien.defeated = true;
        alien.defeatedBy = 'barn';
        alien.defeatedAt = new Date();
        barnAliens.push(alien.id);
      });
    }
    
    const animalsSaved = gameData.villageAnimals;
    const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
    const percentage = Math.round((animalsSaved / totalAnimals) * 100);
    
    let endMessage;
    if (finalAnimalsLost > 0) {
      endMessage = `💀 **Game Over!** ${finalAnimalsLost} alien${finalAnimalsLost > 1 ? 's' : ''} reached the barn and stole ${finalAnimalsLost} animal${finalAnimalsLost > 1 ? 's' : ''}! Village saved ${animalsSaved}/${totalAnimals} animals (${percentage}%)!`;
    } else {
      endMessage = `🏁 **Game Over!** Village saved ${animalsSaved}/${totalAnimals} animals (${percentage}%)!`;
    }
    
    logger.info('MINIGAME', `Game ended | Saved: ${animalsSaved} Lost: ${finalAnimalsLost}`);
    
    return {
      success: true,
      message: endMessage,
      gameData: gameData,
      spawnLocations: [],
      movementMessages: [],
      barnAliens: barnAliens,
      gameEnded: true
    };
  }
  
  // First, advance to the next round
  gameData.currentRound++;
  logger.minigame.round(gameData.currentRound);
  
  // Move undefeated aliens inward at the START of the new round
  const undefeatedAliens = gameData.aliens.filter(a => !a.defeated);
  let animalsLost = 0;
  let barnAliens = []; // Track which aliens reached the barn
  let movementMessages = []; // Track which aliens moved
  let movementGroups = {
    'Outer→Middle': [],
    'Middle→Inner': [],
    'Inner→Barn': []
  };
  
  undefeatedAliens.forEach(alien => {
    if (alien.ring < 3) {
      // Check if the target segment is already occupied
      const targetSegmentOccupied = gameData.aliens.some(a => 
        !a.defeated && a.segment === alien.segment && a.ring === alien.ring + 1
      );
      
      if (!targetSegmentOccupied) {
        const oldId = alien.id;
        const oldRing = alien.ring;
        alien.ring++;
        alien.id = `${alien.ring}${alien.segment}`;
        logger.info('MINIGAME', `${oldId} → ${alien.id}`);
        
        // Track movement for grouped message
        const ringNames = ['Outer', 'Middle', 'Inner'];
        const oldRingName = ringNames[oldRing - 1] || 'Unknown';
        const newRingName = ringNames[alien.ring - 1] || 'Unknown';
        const movementKey = `${oldRingName}→${newRingName}`;
        movementGroups[movementKey] = movementGroups[movementKey] || [];
        movementGroups[movementKey].push(oldId);
      } else {
        logger.info('MINIGAME', `${alien.id} blocked`);
      }
    } else {
      // Alien reached the barn - steal an animal!
      logger.warn('MINIGAME', `${alien.id} reached barn! Animal stolen`);
      gameData.villageAnimals = Math.max(0, gameData.villageAnimals - 1);
      animalsLost++;
      barnAliens.push(alien.id); // Track which alien reached the barn
      movementGroups['Inner→Barn'].push(alien.id);
      alien.defeated = true; // Remove from board
      alien.defeatedBy = 'barn';
      alien.defeatedAt = new Date();
    }
  });
  
  // Spawn new aliens for the NEW round (only during rounds 1-6, skip rounds 7-8)
  let spawnResult = null;
  if (gameData.currentRound <= 6) {
    const playerCount = gameData.turnOrder.length || 1; // Use turn order count or default to 1
    spawnResult = spawnAliens(gameData, playerCount, gameData.currentRound - 1); // Pass previous round number for logic
    logger.info('MINIGAME', `Spawned ${spawnResult.spawnCount} aliens`);
  } else if (gameData.currentRound <= gameData.maxRounds) {
    logger.info('MINIGAME', `Cleanup round ${gameData.currentRound}`);
  }
  
  // Record round history
  gameData.roundHistory.push({
    round: gameData.currentRound - 1,
    aliensDefeated: gameData.aliens.filter(a => a.defeated && a.defeatedBy !== 'barn').length,
    animalsLost: animalsLost,
    timestamp: new Date()
  });

  let message = `🔄 **Round complete!**`;
  if (animalsLost > 0) {
    if (barnAliens.length > 0) {
      message += ` **${barnAliens.join(', ')}** reached the barn and took ${animalsLost} animal${animalsLost > 1 ? 's' : ''}!`;
    } else {
      message += ` ${animalsLost} animal${animalsLost > 1 ? 's' : ''} lost!`;
    }
  }
  if (spawnResult) {
    message += ` ${spawnResult.message}`;
  }

  // Create compact movement messages from grouped data
  const compactMovementMessages = [];
  Object.entries(movementGroups).forEach(([direction, aliens]) => {
    if (aliens.length > 0) {
      compactMovementMessages.push(`${direction}: ${aliens.join(', ')}`);
    }
  });

  logger.info('MINIGAME', `Round ${gameData.currentRound - 1} complete - Animals: ${gameData.villageAnimals}/25, Lost: ${animalsLost}, Barn Aliens: [${barnAliens.join(', ')}]`);
  logger.info('MINIGAME', `=== END ROUND ${gameData.currentRound - 1} ===`);

  return {
    success: true,
    message: message,
    gameData: gameData,
    spawnLocations: spawnResult ? spawnResult.spawnLocations : [],
    movementMessages: compactMovementMessages,
    barnAliens: barnAliens
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
  
  // Game ends early if all aliens are defeated in rounds 7 or 8
  if ((gameData.currentRound === 7 || gameData.currentRound === 8) && activeAliens.length === 0) {
    const animalsSaved = gameData.villageAnimals;
    const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
    const percentage = Math.round((animalsSaved / totalAnimals) * 100);
    
    return {
      gameEnded: true,
      finalScore: animalsSaved,
      message: `🏆 **Victory!** All aliens defeated in round ${gameData.currentRound}! Village saved ${animalsSaved}/${totalAnimals} animals (${percentage}%)!`
    };
  }
  
  // Game ends when all rounds are complete (round 8 finished)
  if (gameData.currentRound > gameData.maxRounds) {
    // Any remaining aliens steal animals at the end of round 8
    let finalAnimalsLost = 0;
    if (activeAliens.length > 0) {
      finalAnimalsLost = activeAliens.length;
      gameData.villageAnimals = Math.max(0, gameData.villageAnimals - finalAnimalsLost);
      
      // Mark remaining aliens as defeated by barn
      activeAliens.forEach(alien => {
        alien.defeated = true;
        alien.defeatedBy = 'barn';
        alien.defeatedAt = new Date();
      });
    }
    
    const animalsSaved = gameData.villageAnimals;
    const totalAnimals = GAME_CONFIGS.theycame.startingAnimals;
    const percentage = Math.round((animalsSaved / totalAnimals) * 100);
    
    if (finalAnimalsLost > 0) {
      return {
        gameEnded: true,
        finalScore: animalsSaved,
        message: `💀 **Game Over!** ${finalAnimalsLost} alien${finalAnimalsLost > 1 ? 's' : ''} reached the barn and stole ${finalAnimalsLost} animal${finalAnimalsLost > 1 ? 's' : ''}! Village saved ${animalsSaved}/${totalAnimals} animals (${percentage}%)!`
      };
    } else {
      return {
        gameEnded: true,
        finalScore: animalsSaved,
        message: `🏁 **Game Over!** Village saved ${animalsSaved}/${totalAnimals} animals (${percentage}%)!`
      };
    }
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

  // Check if game should have ended
  const gameEnded = gameData.currentRound > gameData.maxRounds;
  
  return {
    currentRound: gameData.currentRound,
    maxRounds: gameData.maxRounds,
    activeAliens: activeAliens.length,
    defeatedAliens: defeatedAliens.length,
    animalsLost: animalsLost,
    villageAnimals: gameData.villageAnimals,
    ringStatus: ringStatus,
    gameProgress: gameEnded ? 'Game End!' : `Round ${gameData.currentRound}`
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
  getAlienDefenseGameStatus,
  getCurrentVillageImage,
  getAlienImage,
  getAvailableVillages,
  getAlienPosition,
  getAlienPositions,
  generateAlienOverlayImage,
};
