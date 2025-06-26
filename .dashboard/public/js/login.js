/* ============================================================================
 * File: login.js
 * Purpose: Handles optional authentication and guest access.
 * ============================================================================ */

// ============================================================================
// ------------------- Section: Initialization -------------------
// Handles initial setup and event listener attachment
// ============================================================================
document.addEventListener('DOMContentLoaded', initAuth);

// ------------------- Function: initAuth -------------------
// Initializes authentication flows and UI elements
function initAuth() {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) {
    console.error('Login form not found');
    return;
  }

  // Attach login handler if form exists
  attachLoginHandler(loginForm);
}

// ============================================================================
// ------------------- Section: Login Handling -------------------
// Handles optional login form submission
// ============================================================================
   
// ------------------- Function: attachLoginHandler -------------------
// Attaches submit event listener to login form
function attachLoginHandler(form) {
  form.addEventListener('submit', handleLoginSubmit);
}

// ------------------- Function: handleLoginSubmit -------------------
// Processes optional login form submission
async function handleLoginSubmit(event) {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const remember = document.getElementById('remember').checked;

  // If no credentials provided, continue as guest
  if (!username || !password) {
    redirectToDashboard();
    return;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, remember })
    });

    if (!response.ok) {
      console.warn('Login failed, continuing as guest');
      redirectToDashboard();
      return;
    }

    const data = await response.json();
    if (data?.token) {
      storeAuthToken(data.token, remember);
    }
    redirectToDashboard();
  } catch (error) {
    console.error('Login error, continuing as guest:', error);
    redirectToDashboard();
  }
}

// ------------------- Function: redirectToDashboard -------------------
// Redirects user to the dashboard page
function redirectToDashboard() {
  window.location.href = '/dashboard';
}

// ------------------- Function: storeAuthToken -------------------
// Stores authentication token in local or session storage
function storeAuthToken(token, remember) {
  if (!token) return;
  if (remember) {
    localStorage.setItem('authToken', token);
  } else {
    sessionStorage.setItem('authToken', token);
  }
}
