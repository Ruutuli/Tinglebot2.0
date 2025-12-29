// Debug logging for file loading and paths

// Function to check if a file exists
async function checkFileExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.status === 200;
    } catch (error) {
        console.error(`Error checking file ${url}:`, error);
        return false;
    }
}

// Check CSS file
checkFileExists('css/styles.css');

// Monitor network requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
    return originalFetch.apply(this, args).then(response => {
        // Log 401 errors for user settings endpoint as info instead of error
        if (response.status === 401 && args[0] && args[0].includes('/api/user/settings')) {
            console.log('[debug.js]: User not authenticated for settings endpoint (expected)');
        }
        return response;
    }).catch(error => {
        // Filter out expected 401 errors from user settings endpoint
        if (error.message && error.message.includes('401') && args[0] && args[0].includes('/api/user/settings')) {
            // This is an expected 401 for unauthenticated users, don't log it
            return Promise.reject(error);
        }
        console.error('Network error:', error);
        return Promise.reject(error);
    });
};

// Log any errors
window.addEventListener('error', (event) => {
    console.error('Global error:', event.message, 'at', event.filename, ':', event.lineno);
}); 