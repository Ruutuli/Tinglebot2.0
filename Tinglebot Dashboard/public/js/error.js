/* ============================================================================
   error.js
   Purpose: Error handling and logging utilities for the dashboard
============================================================================ */

// ------------------- Function: logError -------------------
// Logs errors to console and optionally to a remote service
export function logError(error, context = '') {
  console.error(`❌ Error in ${context}:`, error);
  
  // Log additional error details
  console.error('Error details:', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    context
  });
}

// ------------------- Function: handleError -------------------
// Handles errors with user-friendly messages
export function handleError(error, context = '') {
  logError(error, context);
  
  // Show error in UI if possible
  const errorState = document.querySelector('.error-state');
  if (errorState) {
    errorState.style.display = 'flex';
    const errorMessage = errorState.querySelector('p');
    if (errorMessage) {
      errorMessage.textContent = `Error in ${context}: ${error.message}`;
    }
  }
}

// ------------------- Function: showError -------------------
// Shows a user-friendly error message
export function showError(message, element) {
  if (!element) return;
  
  element.innerHTML = `
    <div class="error-state">
      <i class="fas fa-exclamation-circle"></i>
      <p>${message}</p>
      <button class="retry-button">Retry</button>
    </div>
  `;
}

// ------------------- Function: hideError -------------------
// Hides error messages
export function hideError(element) {
  if (!element) return;
  
  const errorState = element.querySelector('.error-state');
  if (errorState) {
    errorState.style.display = 'none';
  }
} 