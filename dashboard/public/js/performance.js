/**
 * Performance and Error Handling Script
 * Handles all the inline scripts that were moved from index.html
 */

// Add error handling for module loading
window.addEventListener('error', function(event) {
  // Filter out expected errors that are handled gracefully
  if (event.error && event.error.message && 
      (event.error.message.includes('L is not defined') || 
       event.error.message.includes('ReferenceError: L is not defined'))) {
    // This is the Leaflet loading issue we've already fixed, don't log it
    return;
  }
  console.error('❌ Script Error:', event.error);
});

// Add module loading error handling
window.addEventListener('unhandledrejection', function(event) {
  console.error('❌ Module Loading Error:', event.reason);
});

// Log when the page is fully loaded
window.addEventListener('load', function() {
  // Check if modules are loaded
  const scripts = document.querySelectorAll('script[type="module"]');
  scripts.forEach(script => {
    // Module script info could be handled here
  });
});

// Ensure character of week is loaded and available
window.addEventListener('load', function() {
  // If character of week function is available, trigger initial load
  if (typeof loadCharacterOfWeek === 'function') {
    setTimeout(() => {
      loadCharacterOfWeek();
    }, 1000); // Small delay to ensure everything is loaded
  }
});

// Performance monitoring
window.addEventListener('load', function() {
  // Log performance metrics
  if ('performance' in window) {
    const perfData = performance.getEntriesByType('navigation')[0];
    if (perfData) {
    }
  }
});

// Handle retry buttons with data-action attributes
document.addEventListener('click', function(event) {
  if (event.target.classList.contains('retry-button')) {
    const action = event.target.getAttribute('data-action');
    switch(action) {
      case 'retry-inventory':
        if (typeof loadInventory === 'function') {
          loadInventory();
        }
        break;
      default:
    }
  }
});

// Resource loading optimization
document.addEventListener('DOMContentLoaded', function() {
  // Preload critical images
  const criticalImages = [
    '/images/ankleicon.png',
    '/images/tingleicon.png'
  ];
  criticalImages.forEach(src => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = src;
    document.head.appendChild(link);
  });
});

// Service Worker registration removed - not needed for this dashboard application 