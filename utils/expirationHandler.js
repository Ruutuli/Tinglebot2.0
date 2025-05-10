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

// Function to start the expiration check interval
function startExpirationChecks(client) {
  // Function to calculate time until next 8 AM
  function getTimeUntilNext8AM() {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    
    // If it's already past 8 AM, schedule for next day
    if (now > next8AM) {
      next8AM.setDate(next8AM.getDate() + 1);
    }
    
    return next8AM.getTime() - now.getTime();
  }

  // Function to schedule next check
  function scheduleNextCheck() {
    const timeUntilNext = getTimeUntilNext8AM();
    
    setTimeout(() => {
      // Run the check
      checkExpiredRequests(client).catch(error => {
        console.error('[expirationHandler.js]: Error in expiration check:', error);
      });
      
      // Schedule next check
      scheduleNextCheck();
    }, timeUntilNext);
  }

  // Start the scheduling
  scheduleNextCheck();
  
  // Run initial check
  checkExpiredRequests(client).catch(error => {
    console.error('[expirationHandler.js]: Error in initial expiration check:', error);
  });
}

module.exports = {
  checkExpiredRequests,
  startExpirationChecks
}; 