const TempData = require('../models/TempDataModel');
const { handleError } = require('./globalErrorHandler');

// Import croner for scheduled expiration checks
let createCronJob = null;
let destroyCronJob = null;

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
let expirationCronJob = null;
let expirationCheckTimer = null; // Fallback timer if croner is not available
let isExpirationChecksRunning = false;
let isCheckInProgress = false;
let expirationClient = null;

// Function to calculate time until next 8 AM EST (for setTimeout fallback)
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

// Function to stop expiration checks (for cleanup)
function stopExpirationChecks() {
  console.log('[expirationHandler.js]: Stopping expiration checks...');
  
  // Clear the running flag first to prevent new schedules
  isExpirationChecksRunning = false;
  
  // Clear any existing cron job
  if (expirationCronJob !== null && destroyCronJob) {
    try {
      destroyCronJob('expiration-check');
      expirationCronJob = null;
    } catch (error) {
      console.log('[expirationHandler.js]: Error destroying cron job during stop:', error);
    }
  }
  
  // Clear any existing timer (fallback)
  if (expirationCheckTimer !== null) {
    try {
      clearTimeout(expirationCheckTimer);
      expirationCheckTimer = null;
    } catch (error) {
      console.log('[expirationHandler.js]: Error clearing timer during stop:', error);
    }
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

  // Try to import croner functions (they may not be available in all contexts)
  try {
    if (!createCronJob || !destroyCronJob) {
      const cronerModule = require('../../bot/scheduler/croner');
      createCronJob = cronerModule.createCronJob;
      destroyCronJob = cronerModule.destroyCronJob;
    }
  } catch (error) {
    console.error('[expirationHandler.js]: Failed to import croner, falling back to setTimeout:', error);
    // Fallback to setTimeout if croner is not available
    createCronJob = null;
    destroyCronJob = null;
  }

  // Clear any existing cron job (safety check for edge cases)
  if (expirationCronJob !== null && destroyCronJob) {
    console.log('[expirationHandler.js]: Found existing cron job during initialization - destroying it');
    try {
      destroyCronJob('expiration-check');
    } catch (error) {
      console.log('[expirationHandler.js]: Error destroying existing cron job during initialization:', error);
    }
    expirationCronJob = null;
  }
  
  // Clear any existing timer (fallback)
  if (expirationCheckTimer !== null) {
    console.log('[expirationHandler.js]: Found existing timer during initialization - clearing it');
    try {
      clearTimeout(expirationCheckTimer);
    } catch (error) {
      console.log('[expirationHandler.js]: Error clearing existing timer during initialization:', error);
    }
    expirationCheckTimer = null;
  }

  // Set flags atomically
  isExpirationChecksRunning = true;
  expirationClient = client;

  // Use croner if available (runs daily at 8 AM EST)
  if (createCronJob) {
    try {
      expirationCronJob = createCronJob(
        'expiration-check',
        '0 8 * * *', // Daily at 8 AM
        async () => {
          // Prevent overlap if the work takes longer than expected
          if (isCheckInProgress) {
            console.log('[expirationHandler.js]: Check already in progress - skipping this run');
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
          }
        },
        { timezone: 'America/New_York' }
      );
      console.log('[expirationHandler.js]: Scheduled expiration checks using croner (daily at 8 AM EST)');
    } catch (error) {
      console.error('[expirationHandler.js]: Failed to create cron job, falling back to setTimeout:', error);
      createCronJob = null;
    }
  }
  
  // Fallback to setTimeout if croner is not available
  if (!createCronJob && expirationCheckTimer === null) {
    console.log('[expirationHandler.js]: Using setTimeout fallback for expiration checks');
    const scheduleNextCheck = () => {
      if (!isExpirationChecksRunning || !expirationClient) {
        return;
      }
      
      if (isCheckInProgress) {
        // Reschedule when check completes
        return;
      }
      
      const timeUntilNext = getTimeUntilNext8AM();
      expirationCheckTimer = setTimeout(async () => {
        expirationCheckTimer = null;
        
        if (isCheckInProgress) {
          scheduleNextCheck();
          return;
        }
        
        isCheckInProgress = true;
        try {
          await checkExpiredRequests(expirationClient);
        } catch (error) {
          console.error('[expirationHandler.js]: Error in expiration check:', error);
        } finally {
          isCheckInProgress = false;
          if (isExpirationChecksRunning && expirationCheckTimer === null) {
            scheduleNextCheck();
          }
        }
      }, timeUntilNext);
    };
    
    scheduleNextCheck();
  }
  
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