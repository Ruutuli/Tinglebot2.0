/* ============================================================================
   blupee.js
   Purpose: Handles random blupee spawning on dashboard pages and rewards
   users with tokens when they click it. Gamification feature to encourage
   dashboard usage.
   
   Limits: 5 blupees per day with 30-minute cooldown between catches (server-enforced)
============================================================================ */

// ============================================================================
// ------------------- Configuration -------------------
// ============================================================================

const BLUPEE_CONFIG = {
  // Spawn settings
  minSpawnDelay: 15000, // 15 seconds minimum before first spawn
  maxSpawnDelay: 60000, // 60 seconds maximum before first spawn
  spawnChance: 0.12, // 12% chance to spawn on page load
  dailyLimit: 5, // Maximum 5 catches per day (server-enforced)
  cooldownMinutes: 30, // 30 minutes cooldown between catches (server-enforced)
  
  // Display settings
  displayDuration: 10000, // 10 seconds visible before disappearing
  fadeOutDuration: 1000, // 1 second fade out
  
  // Animation settings
  hopDuration: 800, // Duration of each hop animation
  hopDistance: 20, // Distance blupee hops (in pixels)
  
  // Movement settings
  moveInterval: 2000, // Move to new position every 2 seconds
  moveSpeed: 800, // Transition speed when moving (ms)
  
  // Positioning
  minDistanceFromEdge: 100, // Minimum pixels from screen edge
  size: 80, // Size of blupee image (pixels)
  
  // Reward
  tokenReward: 10
};

// ============================================================================
// ------------------- State Management -------------------
// ============================================================================

let blupeeSpawned = false;
let blupeeElement = null;
let spawnTimeout = null;
let despawnTimeout = null;
let hopInterval = null;
let moveInterval = null;

// ============================================================================
// ------------------- Initialization -------------------
// ============================================================================

// Initialize blupee system on page load
document.addEventListener('DOMContentLoaded', () => {
  // Only spawn blupee if user is authenticated
  checkAuthAndInitialize();
});

// Also reinitialize when navigating in SPA (for dashboard navigation)
window.addEventListener('popstate', () => {
  console.log('[blupee.js]: Page navigation detected, reinitializing blupee system');
  reinitializeBlupeeSystem();
});

// Listen for custom navigation events (for when sections change)
document.addEventListener('sectionChanged', () => {
  console.log('[blupee.js]: Section changed, reinitializing blupee system');
  reinitializeBlupeeSystem();
});

// Expose global function for manual reinitialization
window.reinitializeBlupee = function() {
  console.log('[blupee.js]: Manual reinitialization triggered');
  reinitializeBlupeeSystem();
};

// ============================================================================
// ------------------- Authentication Check -------------------
// ============================================================================

async function checkAuthAndInitialize() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.log('[blupee.js]: User not authenticated, blupee system disabled');
      return;
    }
    
    const userData = await response.json();
    
    if (userData.isAuthenticated) {
      // Check if user can claim blupee
      checkBlupeeStatus();
    }
  } catch (error) {
    console.error('[blupee.js]: Error checking authentication:', error);
  }
}

// ============================================================================
// ------------------- Blupee Status Check -------------------
// ============================================================================

async function checkBlupeeStatus() {
  try {
    const response = await fetch('/api/blupee/status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      console.log('[blupee.js]: Could not check blupee status');
      return;
    }
    
    const status = await response.json();
    
    // Check if user can claim (daily limit and cooldown)
    if (status.canClaim) {
      scheduleBlupeeSpawn();
    } else if (status.dailyLimitReached) {
      const hoursRemaining = Math.floor(status.resetIn / (60 * 60 * 1000));
      const minutesRemaining = Math.floor((status.resetIn % (60 * 60 * 1000)) / (60 * 1000));
    } else {
    }
  } catch (error) {
    console.error('[blupee.js]: Error checking blupee status:', error);
  }
}

// ============================================================================
// ------------------- Spawn Management -------------------
// ============================================================================

function scheduleBlupeeSpawn() {
  // Random chance to spawn
  if (Math.random() > BLUPEE_CONFIG.spawnChance) {
    console.log('[blupee.js]: Blupee did not spawn this session (random chance)');
    return;
  }
  
  // Random delay before spawning
  const spawnDelay = Math.random() * 
    (BLUPEE_CONFIG.maxSpawnDelay - BLUPEE_CONFIG.minSpawnDelay) + 
    BLUPEE_CONFIG.minSpawnDelay;
  
  console.log(`[blupee.js]: Blupee will spawn in ${Math.round(spawnDelay / 1000)} seconds`);
  
  spawnTimeout = setTimeout(() => {
    spawnBlupee();
  }, spawnDelay);
}

function spawnBlupee() {
  if (blupeeSpawned || blupeeElement) {
    return; // Already spawned
  }
  
  // Get random position on screen
  const position = getRandomPosition();
  
  // Create blupee element
  blupeeElement = document.createElement('div');
  blupeeElement.id = 'blupee-creature';
  blupeeElement.className = 'blupee-container';
  blupeeElement.style.left = `${position.x}px`;
  blupeeElement.style.top = `${position.y}px`;
  
  // Create blupee image
  const blupeeImg = document.createElement('img');
  blupeeImg.src = '/images/blupee.png';
  blupeeImg.alt = 'Blupee';
  blupeeImg.className = 'blupee-image';
  
  // Create sparkle effect
  const sparkle = document.createElement('div');
  sparkle.className = 'blupee-sparkle';
  
  blupeeElement.appendChild(blupeeImg);
  blupeeElement.appendChild(sparkle);
  
  // Add click handler
  blupeeElement.addEventListener('click', handleBlupeeClick);
  
  // Add to page
  document.body.appendChild(blupeeElement);
  
  blupeeSpawned = true;
  
  console.log('[blupee.js]: 🐰 Blupee spawned!');
  
  // Start hopping animation
  startHopAnimation();
  
  // Start movement (blupee moves around the screen)
  startMovement();
  
  // Schedule despawn
  despawnTimeout = setTimeout(() => {
    despawnBlupee();
  }, BLUPEE_CONFIG.displayDuration);
}

function despawnBlupee() {
  if (!blupeeElement) {
    return;
  }
  
  // Stop hopping
  if (hopInterval) {
    clearInterval(hopInterval);
    hopInterval = null;
  }
  
  // Stop movement
  if (moveInterval) {
    clearInterval(moveInterval);
    moveInterval = null;
  }
  
  // Fade out and remove
  blupeeElement.classList.add('blupee-fade-out');
  
  setTimeout(() => {
    if (blupeeElement && blupeeElement.parentNode) {
      blupeeElement.parentNode.removeChild(blupeeElement);
    }
    blupeeElement = null;
    blupeeSpawned = false;
    console.log('[blupee.js]: Blupee despawned');
  }, BLUPEE_CONFIG.fadeOutDuration);
}

// ============================================================================
// ------------------- Animation -------------------
// ============================================================================

function startHopAnimation() {
  let hopUp = true;
  
  hopInterval = setInterval(() => {
    if (!blupeeElement) {
      clearInterval(hopInterval);
      return;
    }
    
    if (hopUp) {
      blupeeElement.style.transform = `translateY(-${BLUPEE_CONFIG.hopDistance}px)`;
    } else {
      blupeeElement.style.transform = 'translateY(0)';
    }
    
    hopUp = !hopUp;
  }, BLUPEE_CONFIG.hopDuration);
}

function startMovement() {
  // Move to a new position every few seconds
  moveInterval = setInterval(() => {
    if (!blupeeElement) {
      clearInterval(moveInterval);
      return;
    }
    
    // Get new random position
    const newPosition = getRandomPosition();
    
    // Smoothly move to new position
    blupeeElement.style.transition = `left ${BLUPEE_CONFIG.moveSpeed}ms ease-in-out, top ${BLUPEE_CONFIG.moveSpeed}ms ease-in-out`;
    blupeeElement.style.left = `${newPosition.x}px`;
    blupeeElement.style.top = `${newPosition.y}px`;
    
    console.log(`[blupee.js]: 🐰 Blupee moved to new position (${Math.round(newPosition.x)}, ${Math.round(newPosition.y)})`);
  }, BLUPEE_CONFIG.moveInterval);
}

// ============================================================================
// ------------------- Position Calculation -------------------
// ============================================================================

function getRandomPosition() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  const minX = BLUPEE_CONFIG.minDistanceFromEdge;
  const maxX = viewportWidth - BLUPEE_CONFIG.minDistanceFromEdge - BLUPEE_CONFIG.size;
  const minY = BLUPEE_CONFIG.minDistanceFromEdge;
  const maxY = viewportHeight - BLUPEE_CONFIG.minDistanceFromEdge - BLUPEE_CONFIG.size;
  
  return {
    x: Math.random() * (maxX - minX) + minX,
    y: Math.random() * (maxY - minY) + minY
  };
}

// ============================================================================
// ------------------- Click Handler -------------------
// ============================================================================

async function handleBlupeeClick(event) {
  event.preventDefault();
  event.stopPropagation();
  
  if (!blupeeElement) {
    return;
  }
  
  console.log('[blupee.js]: Blupee clicked!');
  
  // Immediately stop all animations and movement
  if (hopInterval) {
    clearInterval(hopInterval);
    hopInterval = null;
  }
  
  if (moveInterval) {
    clearInterval(moveInterval);
    moveInterval = null;
  }
  
  if (despawnTimeout) {
    clearTimeout(despawnTimeout);
    despawnTimeout = null;
  }
  
  // Prevent multiple clicks
  blupeeElement.removeEventListener('click', handleBlupeeClick);
  blupeeElement.style.pointerEvents = 'none';
  
  // Freeze position and remove transitions to prevent movement
  const currentLeft = blupeeElement.style.left;
  const currentTop = blupeeElement.style.top;
  blupeeElement.style.transition = 'none';
  blupeeElement.style.left = currentLeft;
  blupeeElement.style.top = currentTop;
  blupeeElement.style.transform = 'translateY(0)';
  
  // Force reflow to ensure transition removal takes effect
  void blupeeElement.offsetHeight;
  
  // Add clicked animation immediately
  blupeeElement.classList.add('blupee-clicked');
  
  try {
    // Claim reward from server
    const response = await fetch('/api/blupee/claim', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      // Show success notification
      showRewardNotification(data);
      
      // Update token display if it exists
      updateTokenDisplay(data.newTokenBalance);
      
      // Sparkle burst effect
      createSparkBurst(event.clientX, event.clientY);
      
      console.log(`[blupee.js]: ✨ Reward claimed! +${data.tokensAwarded} tokens (Daily: ${data.dailyCount}/${data.dailyLimit}, Total: ${data.newTokenBalance})`);
    } else {
      // Show error (cooldown, daily limit, or other issue)
      if (response.status === 429) {
        if (data.dailyLimitReached) {
          showErrorNotification(data.message || 'Daily limit reached! No more blupees today.');
        } else {
          showErrorNotification(data.message || 'Blupee on cooldown! Please wait before catching another.');
        }
      } else {
        showErrorNotification(data.message || 'Could not claim blupee reward');
      }
      console.log('[blupee.js]: Could not claim reward:', data.message);
    }
  } catch (error) {
    console.error('[blupee.js]: Error claiming blupee:', error);
    showErrorNotification('An error occurred while claiming your reward');
  }
  
  // Remove blupee element immediately after animation
  setTimeout(() => {
    if (blupeeElement && blupeeElement.parentNode) {
      blupeeElement.parentNode.removeChild(blupeeElement);
      blupeeElement = null;
      blupeeSpawned = false;
      console.log('[blupee.js]: Blupee removed after catch');
    }
  }, 1000);
}

// ============================================================================
// ------------------- UI Notifications -------------------
// ============================================================================

function showRewardNotification(data) {
  const notification = document.createElement('div');
  notification.className = 'blupee-notification blupee-notification-success';
  
  const dailyRemaining = data.dailyRemaining || 0;
  const dailyText = dailyRemaining > 0 
    ? `${dailyRemaining} remaining today` 
    : 'Daily limit reached!';
  
  notification.innerHTML = `
    <div class="blupee-notification-icon">🐰✨</div>
    <div class="blupee-notification-content">
      <div class="blupee-notification-title">Blupee Found!</div>
      <div class="blupee-notification-message">+${data.tokensAwarded} Tokens</div>
      <div class="blupee-notification-subtitle">${dailyText} • Total: ${data.totalBlupeesFound}</div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.classList.add('blupee-notification-show');
  }, 10);
  
  // Remove after 5 seconds
  setTimeout(() => {
    notification.classList.remove('blupee-notification-show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 5000);
}

function showErrorNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'blupee-notification blupee-notification-error';
  notification.innerHTML = `
    <div class="blupee-notification-icon">❌</div>
    <div class="blupee-notification-content">
      <div class="blupee-notification-title">Oops!</div>
      <div class="blupee-notification-message">${message}</div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Trigger animation
  setTimeout(() => {
    notification.classList.add('blupee-notification-show');
  }, 10);
  
  // Remove after 4 seconds
  setTimeout(() => {
    notification.classList.remove('blupee-notification-show');
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 4000);
}

function createSparkBurst(x, y) {
  const burstCount = 12;
  
  for (let i = 0; i < burstCount; i++) {
    const spark = document.createElement('div');
    spark.className = 'blupee-spark';
    spark.style.left = `${x}px`;
    spark.style.top = `${y}px`;
    
    // Random direction
    const angle = (Math.PI * 2 * i) / burstCount;
    const distance = 50 + Math.random() * 50;
    const tx = Math.cos(angle) * distance;
    const ty = Math.sin(angle) * distance;
    
    spark.style.setProperty('--tx', `${tx}px`);
    spark.style.setProperty('--ty', `${ty}px`);
    
    document.body.appendChild(spark);
    
    // Remove after animation
    setTimeout(() => {
      if (spark.parentNode) {
        spark.parentNode.removeChild(spark);
      }
    }, 1000);
  }
}

function updateTokenDisplay(newBalance) {
  // Try to find and update token display in the UI
  const tokenElements = document.querySelectorAll('[data-user-tokens], .user-tokens, #user-tokens');
  
  tokenElements.forEach(element => {
    element.textContent = newBalance;
  });
  
  // If there's an auth module, trigger a refresh
  if (window.auth && typeof window.auth.checkUserAuthStatus === 'function') {
    window.auth.checkUserAuthStatus();
  }
}

// ============================================================================
// ------------------- Reinitialization -------------------
// ============================================================================

function reinitializeBlupeeSystem() {
  // Clean up any existing blupee first
  cleanupBlupeeSystem();
  
  // Wait a brief moment then reinitialize
  setTimeout(() => {
    checkAuthAndInitialize();
  }, 500);
}

function cleanupBlupeeSystem() {
  // Clear all timeouts and intervals
  if (spawnTimeout) {
    clearTimeout(spawnTimeout);
    spawnTimeout = null;
  }
  if (despawnTimeout) {
    clearTimeout(despawnTimeout);
    despawnTimeout = null;
  }
  if (hopInterval) {
    clearInterval(hopInterval);
    hopInterval = null;
  }
  if (moveInterval) {
    clearInterval(moveInterval);
    moveInterval = null;
  }
  
  // Remove any existing blupee element
  if (blupeeElement && blupeeElement.parentNode) {
    blupeeElement.parentNode.removeChild(blupeeElement);
  }
  
  // Reset state
  blupeeElement = null;
  blupeeSpawned = false;
  
  console.log('[blupee.js]: Cleaned up existing blupee system');
}

// ============================================================================
// ------------------- Cleanup -------------------
// ============================================================================

// Clean up when page is unloaded
window.addEventListener('beforeunload', () => {
  cleanupBlupeeSystem();
});

