/* ============================================================================
 * File: login.js
 * Purpose: Handles Discord authentication and guest access.
 * ============================================================================ */

// ============================================================================
// ------------------- Section: Initialization -------------------
// Handles initial setup and authentication status check
// ============================================================================
document.addEventListener('DOMContentLoaded', initAuth);

// ============================================================================
// ------------------- Section: Page Cleanup -------------------
// Handles cleanup when page is being closed or hidden
// ============================================================================

// ------------------- Function: cleanupAnimations -------------------
// Stops all animations to prevent lingering effects
function cleanupAnimations() {
  const loginPage = document.querySelector('.login-page');
  if (loginPage) {
    loginPage.classList.add('closing');
  }
  
  const logoGlow = document.querySelector('.logo-glow');
  if (logoGlow) {
    logoGlow.style.animation = 'none';
    logoGlow.style.opacity = '0';
  }
  
  // Stop any other background animations
  const floatingShapes = document.querySelectorAll('.floating-shapes .shape');
  floatingShapes.forEach(shape => {
    shape.style.animation = 'none';
  });
}

// ------------------- Event Listeners for Page Cleanup -------------------
// Stop animations when page is being hidden or closed
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    cleanupAnimations();
  } else {
    // Reset animations when page becomes visible again
    const loginPage = document.querySelector('.login-page');
    if (loginPage) {
      loginPage.classList.remove('closing', 'hidden');
    }
  }
});

// Stop animations before page unload
window.addEventListener('beforeunload', cleanupAnimations);

// Stop animations when page is being hidden (for mobile)
window.addEventListener('pagehide', cleanupAnimations);

// Additional cleanup for when user navigates away
window.addEventListener('blur', function() {
  const loginPage = document.querySelector('.login-page');
  if (loginPage) {
    loginPage.classList.add('hidden');
  }
});

window.addEventListener('focus', function() {
  const loginPage = document.querySelector('.login-page');
  if (loginPage) {
    loginPage.classList.remove('hidden');
  }
});

// ------------------- Function: initAuth -------------------
// Initializes authentication flows and checks current auth status
async function initAuth() {
  try {
    // Check if user is already authenticated
    const authStatus = await checkAuthStatus();
    
    if (authStatus.authenticated) {
      // User is already logged in, redirect to dashboard
      redirectToDashboard();
      return;
    }
    
    // Set up Discord login button event listeners
    setupDiscordLogin();
    
  } catch (error) {
    console.error('Auth initialization error:', error);
  }
}

// ============================================================================
// ------------------- Section: Authentication Status -------------------
// Handles checking and managing authentication state
// ============================================================================

// ------------------- Function: checkAuthStatus -------------------
// Checks current authentication status from server
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/status', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Include cookies for session
    });
    
    if (!response.ok) {
      throw new Error('Failed to check auth status');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error checking auth status:', error);
    return { authenticated: false };
  }
}

// ============================================================================
// ------------------- Section: Discord Authentication -------------------
// Handles Discord OAuth flow
// ============================================================================

// ------------------- Function: setupDiscordLogin -------------------
// Sets up Discord login button functionality
function setupDiscordLogin() {
  const discordButton = document.querySelector('.discord-login-button');
  if (discordButton) {
    discordButton.addEventListener('click', handleDiscordLogin);
  }
}

// ------------------- Function: handleDiscordLogin -------------------
// Handles Discord login button click
function handleDiscordLogin(event) {
  event.preventDefault();
  
  // Add loading state to button
  const button = event.currentTarget;
  const originalText = button.innerHTML;
  
  button.classList.add('login-loading');
  button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting to Discord...';
  button.style.pointerEvents = 'none';
  
  // Get return URL from session storage or default to dashboard
  const returnTo = sessionStorage.getItem('returnTo') || '/';
  
  // Redirect to Discord OAuth with return URL
  window.location.href = `/auth/discord?returnTo=${encodeURIComponent(returnTo)}`;
}

// ============================================================================
// ------------------- Section: Navigation -------------------
// Handles page navigation and redirects
// ============================================================================

// ------------------- Function: redirectToDashboard -------------------
// Redirects user to the dashboard page
function redirectToDashboard() {
  window.location.href = '/dashboard';
}

// ============================================================================
// ------------------- Section: Utility Functions -------------------
// Helper functions for authentication management
// ============================================================================

// ------------------- Function: showError -------------------
// Displays error messages to user
function showError(message) {
  // Create error element if it doesn't exist
  let errorElement = document.querySelector('.auth-error');
  if (!errorElement) {
    errorElement = document.createElement('div');
    errorElement.className = 'auth-error';
    errorElement.style.cssText = `
      color: #ff6b6b;
      background: rgba(255, 107, 107, 0.1);
      border: 1px solid #ff6b6b;
      border-radius: 0.5rem;
      padding: 1rem;
      margin: 1rem 0;
      text-align: center;
    `;
    
    const loginCard = document.querySelector('.login-card');
    if (loginCard) {
      loginCard.insertBefore(errorElement, loginCard.firstChild);
    }
  }
  
  errorElement.textContent = message;
  errorElement.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorElement.style.display = 'none';
  }, 5000);
}

// ------------------- Function: showSuccess -------------------
// Displays success messages to user
function showSuccess(message) {
  // Create success element if it doesn't exist
  let successElement = document.querySelector('.auth-success');
  if (!successElement) {
    successElement = document.createElement('div');
    successElement.className = 'auth-success';
    successElement.style.cssText = `
      color: #51cf66;
      background: rgba(81, 207, 102, 0.1);
      border: 1px solid #51cf66;
      border-radius: 0.5rem;
      padding: 1rem;
      margin: 1rem 0;
      text-align: center;
    `;
    
    const loginCard = document.querySelector('.login-card');
    if (loginCard) {
      loginCard.insertBefore(successElement, loginCard.firstChild);
    }
  }
  
  successElement.textContent = message;
  successElement.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    successElement.style.display = 'none';
  }, 3000);
}
