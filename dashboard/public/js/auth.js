// ------------------- Auth Module -------------------
// Handles Discord OAuth authentication

// Current user state
export let currentUser = null;

// Authentication status
export let isAuthenticated = false;

// Admin status
export let isAdmin = false;

// Update user menu UI based on authentication status
export function updateUserMenu() {
  const usernameEl = document.getElementById('username');
  const userInfoEl = document.getElementById('user-info');
  const guestInfoEl = document.getElementById('guest-info');
  const userDropdown = document.getElementById('user-dropdown');
  const adminAreaNavItem = document.getElementById('admin-area-nav-item');
  const inventoriesNavItem = document.getElementById('inventories-nav-item');
  
  // Show/hide admin navigation based on admin status
  if (adminAreaNavItem) {
    const shouldShow = isAuthenticated && isAdmin;
    adminAreaNavItem.style.display = shouldShow ? 'block' : 'none';
    console.log('[auth.js] updateUserMenu - Admin nav:', {
      isAuthenticated,
      isAdmin,
      shouldShow,
      display: adminAreaNavItem.style.display
    });
  } else {
    console.warn('[auth.js] updateUserMenu - Admin nav item not found in DOM');
  }
  
  // Show/hide inventories navigation based on authentication status
  if (inventoriesNavItem) {
    inventoriesNavItem.style.display = isAuthenticated ? 'block' : 'none';
    console.log('[auth.js] updateUserMenu - Inventories nav:', {
      isAuthenticated,
      display: inventoriesNavItem.style.display
    });
  }
  
  if (isAuthenticated && currentUser) {
    // Update username
    if (usernameEl) {
      usernameEl.textContent = currentUser.globalName || currentUser.username || 'User';
    }
    
    // Update user info section
    const userNameEl = document.getElementById('user-name');
    const userDiscriminatorEl = document.getElementById('user-discriminator');
    const userDropdownAvatar = document.getElementById('user-dropdown-avatar');
    const userAvatar = document.getElementById('user-avatar');
    
    if (userNameEl) {
      userNameEl.textContent = currentUser.globalName || currentUser.username || 'User';
    }
    
    if (userDiscriminatorEl && currentUser.discriminator && currentUser.discriminator !== '0') {
      userDiscriminatorEl.textContent = `#${currentUser.discriminator}`;
    } else if (userDiscriminatorEl) {
      userDiscriminatorEl.textContent = '';
    }
    
    // Update avatars
    const avatarUrl = currentUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${currentUser.discordId}/${currentUser.avatar}.png`
      : '/images/ankleicon.png';
    
    if (userDropdownAvatar) {
      userDropdownAvatar.src = avatarUrl;
      userDropdownAvatar.onerror = () => { userDropdownAvatar.src = '/images/ankleicon.png'; };
    }
    
    if (userAvatar) {
      userAvatar.src = avatarUrl;
      userAvatar.onerror = () => { userAvatar.src = '/images/ankleicon.png'; };
    }
    
    // Show user info, hide guest info
    if (userInfoEl) userInfoEl.style.display = 'flex';
    if (guestInfoEl) guestInfoEl.style.display = 'none';
  } else {
    // Update username to show guest state
    if (usernameEl) {
      usernameEl.textContent = 'Guest';
    }
    
    // Show guest info, hide user info
    if (userInfoEl) userInfoEl.style.display = 'none';
    if (guestInfoEl) guestInfoEl.style.display = 'flex';
  }
}

// Initialize user menu dropdown click handler
export function initUserMenu() {
  const userMenu = document.getElementById('user-menu');
  const userDropdown = document.getElementById('user-dropdown');
  
  if (!userMenu || !userDropdown) return;
  
  // Toggle dropdown on click
  userMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('show');
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target) && !userDropdown.contains(e.target)) {
      userDropdown.classList.remove('show');
    }
  });
  
  // Close dropdown when clicking inside the dropdown (for links)
  userDropdown.addEventListener('click', (e) => {
    // Only close if clicking on a link/button, not on the dropdown container itself
    if (e.target.closest('a, button')) {
      setTimeout(() => {
        userDropdown.classList.remove('show');
      }, 100);
    }
  });
}

// Check user authentication status
export async function checkUserAuthStatus() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (response.ok) {
      const data = await response.json();
      isAuthenticated = data.isAuthenticated || false;
      currentUser = data.user || null;
      isAdmin = data.isAdmin || false;
      
      console.log('[auth.js] Auth status check:', {
        isAuthenticated,
        userId: currentUser?.discordId,
        isAdmin,
        adminFromAPI: data.isAdmin
      });
    } else {
      console.warn('[auth.js] Auth check failed with status:', response.status);
      isAuthenticated = false;
      currentUser = null;
      isAdmin = false;
    }
  } catch (error) {
    console.warn('[auth.js]: Failed to check auth status:', error);
    isAuthenticated = false;
    currentUser = null;
    isAdmin = false;
  }
  
  // Update UI after checking auth status
  updateUserMenu();
  
  // Log admin nav item state for debugging
  const adminAreaNavItem = document.getElementById('admin-area-nav-item');
  if (adminAreaNavItem) {
    console.log('[auth.js] Admin nav item visibility:', {
      display: adminAreaNavItem.style.display,
      isAuthenticated,
      isAdmin,
      shouldShow: isAuthenticated && isAdmin
    });
  }
  
  return { isAuthenticated, currentUser };
}

// Redirect to Discord OAuth login
export function login() {
  window.location.href = '/auth/discord';
}

// Logout user
export function logout() {
  window.location.href = '/auth/logout';
}

// Make login function globally available for inline onclick handlers
window.redirectToLogin = function() {
  window.location.href = '/auth/discord';
};

// Check if current user is an admin
export function isAdminUser() {
  return isAdmin;
}

// Initialize auth status on module load
checkUserAuthStatus().then(() => {
  initUserMenu();
}).catch(err => {
  console.warn('[auth.js]: Failed to initialize auth status:', err);
  initUserMenu(); // Still initialize menu even if auth check fails
});

