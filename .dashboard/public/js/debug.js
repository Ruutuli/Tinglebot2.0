// Debug logging for file loading and paths
console.log('Debug script loaded');

// Function to check if a file exists
async function checkFileExists(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        console.log(`File check for ${url}:`, response.status === 200 ? 'Found' : 'Not found');
        return response.status === 200;
    } catch (error) {
        console.error(`Error checking file ${url}:`, error);
        return false;
    }
}

// Check CSS file
checkFileExists('css/styles.css');

// Log current page URL and base path
console.log('Current page URL:', window.location.href);
console.log('Base path:', window.location.pathname);

// Monitor network requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
    console.log('Fetch request:', args[0]);
    return originalFetch.apply(this, args);
};

// Log any errors
window.addEventListener('error', (event) => {
    console.error('Global error:', event.message, 'at', event.filename, ':', event.lineno);
}); 