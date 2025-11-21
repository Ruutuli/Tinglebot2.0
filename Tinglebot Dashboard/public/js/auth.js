/* ============================================================================
 * File: auth.js
 * Purpose: Handles user authentication state and user menu functionality.
 * ============================================================================ */

// ============================================================================
// ------------------- Section: Authentication State -------------------
// Manages current user authentication status and data
// ============================================================================

let currentUser = null;
let isAuthenticated = false;
let isAdminUser = false;
let userDropdown = null; // Global reference to user dropdown element

// ============================================================================
// ------------------- Section: Initialization -------------------
// Sets up authentication checking and user menu functionality
// ============================================================================

document.addEventListener('DOMContentLoaded', initUserAuth);

// ------------------- Function: initUserAuth -------------------
// Initializes user authentication and menu functionality
async function initUserAuth() {
  try {
    
    // Check if user just logged in (check URL parameters)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('login') === 'success') {
      
      // Check if there's a returnTo hash stored
      const returnTo = sessionStorage.getItem('returnTo');
      if (returnTo) {
        sessionStorage.removeItem('returnTo');
        // Update URL without the login parameter and with the saved hash
        window.history.replaceState({}, document.title, window.location.pathname + returnTo);
        window.location.hash = returnTo;
      } else {
        // Remove the parameter from URL
        window.history.replaceState({}, document.title, window.location.pathname);
      }
      
      // Wait a moment for server to process login
      setTimeout(async () => {
        await checkUserAuthStatus();
      }, 500);
    } else {
      // Check authentication status
      await checkUserAuthStatus();
    }
    
    // Set up user menu interactions
    setupUserMenu();
    
    // Set up periodic refresh (every 30 seconds)
    setInterval(async () => {
      if (isAuthenticated) {
        await refreshUserData();
      }
    }, 30000);
    
  } catch (error) {
    console.error('[auth.js]: ❌ Error initializing user auth:', error);
    showGuestUser();
  }
}

// ------------------- Function: redirectToLogin -------------------
// Redirects to login page while preserving current location
window.redirectToLogin = function() {
  // Get current page path
  const currentPath = window.location.pathname + window.location.hash;
  
  // If we're on the map page, redirect directly to Discord auth with return URL
  if (currentPath.includes('/map')) {
    window.location.href = `/auth/discord?returnTo=${encodeURIComponent(currentPath)}`;
  } else {
    // For other pages, save to session storage and go to login page
    const currentHash = window.location.hash;
    if (currentHash && currentHash !== '#' && currentHash !== '#dashboard-section') {
      sessionStorage.setItem('returnTo', currentHash);
    }
    
    // Redirect to login page
    window.location.href = '/login';
  }
};

// ============================================================================
// ------------------- Section: Authentication Status -------------------
// Handles checking and updating authentication state
// ============================================================================

// ------------------- Function: checkUserAuthStatus -------------------
// Checks current user authentication status from server
async function checkUserAuthStatus() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    
    if (!response.ok) {
      throw new Error(`Failed to fetch user data: ${response.status} ${response.statusText}`);
    }
    
    const userData = await response.json();
    
    if (userData.isAuthenticated) {
      currentUser = userData.user;
      isAuthenticated = true;
      isAdminUser = Boolean(userData.isAdmin);
      updateUserMenu(userData.user);
      
      // Handle admin area visibility
      if (userData.isAdmin) {
        showAdminArea();
      } else {
        hideAdminArea();
      }
    } else {
      currentUser = null;
      isAuthenticated = false;
      isAdminUser = false;
      showGuestUser();
      hideAdminArea();
    }
  } catch (error) {
    console.error('[auth.js]: ❌ Error checking auth status:', error);
    showGuestUser();
    isAdminUser = false;
  }
}

// ============================================================================
// ------------------- Section: User Menu Management -------------------
// Handles user menu display and interactions
// ============================================================================

// ------------------- Function: setupUserMenu -------------------
// Sets up user menu click handlers and interactions
function setupUserMenu() {
  const userMenu = document.getElementById('user-menu');
  userDropdown = document.getElementById('user-dropdown'); // Assign to global variable
  
  if (!userMenu || !userDropdown) {
    console.error('[auth.js]: ❌ User menu elements not found');
    return;
  }

  // User menu click handler
  userMenu.addEventListener('click', function(event) {
    event.preventDefault();
    event.stopPropagation();
    
    // Toggle dropdown
    if (userDropdown.classList.contains('show')) {
        closeUserDropdown('userMenu click');
    } else {
        openUserDropdown('userMenu click');
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function(event) {
    if (!userMenu.contains(event.target) && !userDropdown.contains(event.target)) {
        closeUserDropdown('outside click');
    }
  });

  // Close dropdown when window loses focus
  window.addEventListener('blur', function() {
    closeUserDropdown('window blur');
  });

  // Close dropdown when pressing Escape key
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && userDropdown.classList.contains('show')) {
        closeUserDropdown('escape key');
    }
  });

  // Handle logout button click
  const logoutButton = userDropdown.querySelector('.logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUserDropdown('logout button');
      await logout();
    });
  }

  // Handle profile button click
  const profileButton = userDropdown.querySelector('.profile-button');
  if (profileButton) {
    profileButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUserDropdown('profile button');
      // Navigate to profile section
      const profileLink = document.querySelector('a[data-section="profile-section"]');
      if (profileLink) {
        profileLink.click();
      }
    });
  }

  // Handle login button click in guest info
  const loginButton = userDropdown.querySelector('.login-button');
  if (loginButton) {
    loginButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeUserDropdown('login button');
      
      // Navigate to login page
      window.location.href = '/login';
    });
  }

}

// ------------------- Function: openUserDropdown -------------------
// Opens the user dropdown menu
function openUserDropdown(source = 'unknown') {
  // Get userDropdown element if not already initialized
  const dropdown = userDropdown || document.getElementById('user-dropdown');
  if (!dropdown) {
    console.error('[auth.js]: ❌ User dropdown element not found');
    return;
  }
  
  dropdown.classList.add('show');
  dropdown.setAttribute('aria-expanded', 'true');
}

// ------------------- Function: closeUserDropdown -------------------
// Closes the user dropdown menu
function closeUserDropdown(source = 'unknown') {
  // Get userDropdown element if not already initialized
  const dropdown = userDropdown || document.getElementById('user-dropdown');
  if (!dropdown || !dropdown.classList.contains('show')) {
    return;
  }
  
  dropdown.classList.remove('show');
  dropdown.setAttribute('aria-expanded', 'false');
}

// ------------------- Function: updateUserMenu -------------------
// Updates user menu with authenticated user data
function updateUserMenu(userData) {
  const usernameElement = document.getElementById('username');
  const userAvatar = document.getElementById('user-avatar');
  const userDropdownAvatar = document.getElementById('user-dropdown-avatar');
  const userName = document.getElementById('user-name');
  const userDiscriminator = document.getElementById('user-discriminator');
  const userTokens = document.getElementById('user-tokens');
  const userSlots = document.getElementById('user-slots');
  const userInfo = document.getElementById('user-info');
  const guestInfo = document.getElementById('guest-info');
  
  if (!usernameElement || !userAvatar || !userDropdownAvatar || !userName || 
      !userDiscriminator || !userTokens || !userSlots || !userInfo || !guestInfo) {
    console.error('[auth.js]: ❌ User menu elements not found');
    return;
  }
  
  // Update main username display (use nickname if available)
  const displayName = userData.nickname || userData.username || 'User';
  usernameElement.textContent = displayName;
  
  // Update avatars
  const avatarUrl = userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.discordId}/${userData.avatar}.png` : '/images/ankleicon.png';
  userAvatar.src = avatarUrl;
  userDropdownAvatar.src = avatarUrl;
  
  // Update dropdown user info
  userName.textContent = displayName;
  userDiscriminator.textContent = userData.discriminator ? `#${userData.discriminator}` : '';
  userTokens.textContent = userData.tokens || 0;
  userSlots.textContent = userData.characterSlot || 2;
  
  // Show user info, hide guest info
  userInfo.style.display = 'flex';
  guestInfo.style.display = 'none';

  toggleInventoriesNav(true);
}

// ------------------- Function: showGuestUser -------------------
// Shows guest user interface when not authenticated
function showGuestUser() {
  const usernameElement = document.getElementById('username');
  const userAvatar = document.getElementById('user-avatar');
  const userInfo = document.getElementById('user-info');
  const guestInfo = document.getElementById('guest-info');
  
  if (!usernameElement || !userAvatar || !userInfo || !guestInfo) {
    console.error('[auth.js]: ❌ User menu elements not found');
    return;
  }
  
  // Update main display
  usernameElement.textContent = 'Login';
  userAvatar.src = '/images/ankleicon.png';
  
  // Show guest info, hide user info
  userInfo.style.display = 'none';
  guestInfo.style.display = 'flex';

  toggleInventoriesNav(false);
}

// ============================================================================
// ------------------- Section: Data Refresh -------------------
// Handles periodic data refresh for authenticated users
// ============================================================================

// ------------------- Function: refreshUserData -------------------
// Refreshes user data periodically
async function refreshUserData() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const userData = await response.json();
      if (userData.isAuthenticated && userData.user) {
        currentUser = userData.user;
        isAdminUser = Boolean(userData.isAdmin);
        updateUserMenu(userData.user);
      }
    }
  } catch (error) {
    console.error('[auth.js]: ❌ Error refreshing user data:', error);
  }
}

// ============================================================================
// ------------------- Section: Logout -------------------
// Handles user logout functionality
// ============================================================================

// ------------------- Function: logout -------------------
// Handles user logout
async function logout() {
  try {
    const response = await fetch('/auth/logout', {
      method: 'GET',
      credentials: 'include'
    });
    
    
    if (response.ok) {  
      currentUser = null;
      isAuthenticated = false;
      showGuestUser();
      
      // Close dropdown using global variable
      if (userDropdown) {
        userDropdown.classList.remove('show');
      }
    } else {
      console.error('[auth.js]: ❌ Logout failed');
    }
  } catch (error) {
    console.error('[auth.js]: ❌ Error during logout:', error);
  }
}

// ============================================================================
// ------------------- Section: Admin Area Management -------------------
// Handles showing/hiding admin area based on user permissions
// ============================================================================

// ------------------- Function: showAdminArea -------------------
// Shows the admin area for users with admin privileges
function showAdminArea() {
  const adminNavItem = document.getElementById('admin-area-nav-item');
  if (adminNavItem) {
    adminNavItem.style.display = 'block';
  }
}

// ------------------- Function: hideAdminArea -------------------
// Hides the admin area for non-admin users
function hideAdminArea() {
  const adminNavItem = document.getElementById('admin-area-nav-item');
  if (adminNavItem) {
    adminNavItem.style.display = 'none';
  }
}

function toggleInventoriesNav(isVisible) {
  const navItem = document.getElementById('inventories-nav-item');
  if (!navItem) {
    return;
  }
  navItem.style.display = isVisible ? 'block' : 'none';
}

// ============================================================================
// ------------------- Section: Public API -------------------
// Exports functions for use in other modules
// ============================================================================

export {
  currentUser,
  isAuthenticated,
  isAdminUser,
  checkUserAuthStatus,
  updateUserMenu,
  showGuestUser,
  refreshUserData,
  logout,
  openUserDropdown,
  closeUserDropdown,
  showAdminArea,
  hideAdminArea
}; 