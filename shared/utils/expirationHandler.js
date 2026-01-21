const TempData = require('../models/TempDataModel');
const { handleError } = require('./globalErrorHandler');

// Function to check for expired requests and notify users
async function checkExpiredRequests(client) {
  try {
    // Find all expired requests
    const expiredRequests = await TempData.findExpired();
    
    for (const request of expiredRequests) {
      try {
        // Get the request data
        const { type, key, data } = request;
        
        // Prepare notification message based on request type
        let message = '';
        let userId = '';
        
        switch (type) {
          case 'healing':
            message = `Your healing request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'vending':
            message = `Your vending request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'boosting':
            message = `Your boosting request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'battle':
            message = `Your battle progress for ${data.characterName} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          case 'encounter':
            message = `Your encounter request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'blight':
            message = `Your blight healing request for ${data.characterName} has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
            break;
          case 'travel':
            message = `Your travel request for ${data.characterName} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          case 'gather':
            message = `Your gathering request for ${data.characterName} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          case 'delivery':
            message = `Your delivery request from ${data.sender} to ${data.recipient} has expired after 48 hours without being completed.`;
            userId = data.userId;
            break;
          default:
            message = `Your ${type} request has expired after 48 hours without being fulfilled.`;
            userId = data.userId;
        }

        // Send DM to user if we have their ID
        if (userId) {
          try {
            const user = await client.users.fetch(userId);
            if (user) {
              await user.send(message);
            }
          } catch (dmError) {
            console.error(`[expirationHandler.js]: Failed to send DM to user ${userId}:`, dmError);
          }
        }

        // Delete the expired request
        await TempData.findByIdAndDelete(request._id);
        
        console.log(`[expirationHandler.js]: Deleted expired ${type} request for ${key}`);
      } catch (requestError) {
        console.error(`[expirationHandler.js]: Error processing expired request ${request._id}:`, requestError);
      }
    }
  } catch (error) {
    handleError(error, 'expirationHandler.js');
  }
}

// Track expiration check state to prevent duplicate initialization
let expirationCheckTimer = null;
let isExpirationChecksRunning = false;
let isCheckInProgress = false;
let expirationClient = null;

// Function to calculate time until next 8 AM EST
function getTimeUntilNext8AM() {
  const now = new Date();
  // Get current time in EST
  const estString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const estNow = new Date(estString);
  const next8AM = new Date(estNow);
  next8AM.setHours(8, 0, 0, 0);
  
  // If it's already past 8 AM EST, schedule for next day
  if (estNow > next8AM) {
    next8AM.setDate(next8AM.getDate() + 1);
  }
  
  // Convert back to UTC for time calculation
  const next8AMUTC = new Date(next8AM.toLocaleString("en-US", { timeZone: "UTC" }));
  return next8AMUTC.getTime() - now.getTime();
}

// Function to schedule next check (module-level singleton)
function scheduleNextCheck(delayMs) {
  // CRITICAL: Don't schedule duplicates - if timer already exists or is being scheduled, don't create another
  // This check must happen FIRST to prevent race conditions
  if (expirationCheckTimer !== null) {
    console.log('[expirationHandler.js]: Timer already scheduled - skipping duplicate schedule');
    return;
  }
  
  // CRITICAL: Also don't schedule if a check is in progress (it will reschedule when done)
  if (isCheckInProgress) {
    console.log('[expirationHandler.js]: Check in progress - skipping schedule, will reschedule when check completes');
    return;
  }

  // Don't schedule if checks are not running
  if (!isExpirationChecksRunning || !expirationClient) {
    console.log('[expirationHandler.js]: Expiration checks not active - skipping schedule');
    return;
  }

  // Use provided delay or calculate from 8 AM EST
  const timeUntilNext = delayMs !== undefined ? delayMs : getTimeUntilNext8AM();
  
  // CRITICAL: Set a sentinel value FIRST to prevent other calls from passing the null check
  // This prevents race conditions where multiple calls see expirationCheckTimer === null simultaneously
  expirationCheckTimer = { _scheduling: true };
  
  // Now create the actual timer
  const timerId = setTimeout(async () => {
    // CRITICAL: Clear timer reference IMMEDIATELY to allow rescheduling
    // But only if this is still the active timer (defense in depth)
    if (expirationCheckTimer === timerId) {
      expirationCheckTimer = null;
    } else {
      // Another timer has already been scheduled, ignore this callback
      console.log('[expirationHandler.js]: Timer callback skipped - newer timer already scheduled');
      return;
    }
    
    // Prevent overlap if the work takes longer than delay
    if (isCheckInProgress) {
      console.log('[expirationHandler.js]: Check already in progress - skipping this run, will reschedule when check completes');
      // DO NOT schedule another timer here - the check that's in progress will schedule one when it finishes
      // This prevents exponential growth
      return;
    }

    // Set flag to prevent concurrent execution
    isCheckInProgress = true;

    try {
      await checkExpiredRequests(expirationClient);
    } catch (error) {
      console.error('[expirationHandler.js]: Error in expiration check:', error);
    } finally {
      // Clear the flag
      isCheckInProgress = false;
      
      // Schedule next check (only if still running and no timer already scheduled)
      if (isExpirationChecksRunning && expirationCheckTimer === null) {
        scheduleNextCheck();
      }
    }
  }, timeUntilNext);
  
  // CRITICAL: Replace sentinel with actual timer ID atomically
  expirationCheckTimer = timerId;
}

// Function to stop expiration checks (for cleanup)
function stopExpirationChecks() {
  console.log('[expirationHandler.js]: Stopping expiration checks...');
  
  // Clear the running flag first to prevent new schedules
  isExpirationChecksRunning = false;
  
  // Clear any existing timer
  if (expirationCheckTimer) {
    clearTimeout(expirationCheckTimer);
    expirationCheckTimer = null;
  }
  
  // Clear client reference
  expirationClient = null;
  
  console.log('[expirationHandler.js]: Expiration checks stopped');
}

// Function to start the expiration check interval
function startExpirationChecks(client) {
  // Atomic check-and-set: Prevent duplicate initialization
  if (isExpirationChecksRunning) {
    console.log('[expirationHandler.js]: Expiration checks already running - skipping duplicate initialization');
    return;
  }

  // Clear any existing timer (safety check for edge cases)
  if (expirationCheckTimer) {
    console.log('[expirationHandler.js]: Found existing timer during initialization - clearing it');
    clearTimeout(expirationCheckTimer);
    expirationCheckTimer = null;
  }

  // Set flags atomically
  isExpirationChecksRunning = true;
  expirationClient = client;


  // Start the scheduling loop
  scheduleNextCheck();
  
  // Run initial check (async, non-blocking)
  (async () => {
    if (isCheckInProgress) {
      console.log('[expirationHandler.js]: Initial check skipped - check already in progress');
      return;
    }
    
    isCheckInProgress = true;
    try {
      await checkExpiredRequests(client);
    } catch (error) {
      console.error('[expirationHandler.js]: Error in initial expiration check:', error);
    } finally {
      isCheckInProgress = false;
    }
  })();
}

module.exports = {
  checkExpiredRequests,
  startExpirationChecks,
  stopExpirationChecks
}; 