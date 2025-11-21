// Service Worker for Map Caching
const CACHE_NAME = 'tinglebot-map-v1';
const STATIC_CACHE = 'tinglebot-static-v1';

// Files to cache for offline functionality
const CACHE_URLS = [
  '/',
  '/map.html',
  '/css/styles.css',
  '/css/map.css',
  '/js/map.js',
  '/js/fullscreen-map.js',
  '/images/tingleicon.png',
  '/images/ankleicon.png'
];

// Map images to cache (commented out due to CORS issues)
// const MAP_IMAGES = [
//   'https://storage.googleapis.com/tinglebot/map/thumbnail/Map_Thumbnail_0002_Map-Base.png',
//   'https://storage.googleapis.com/tinglebot/map/medium/Map_Medium_0002_Map-Base.png',
//   'https://storage.googleapis.com/tinglebot/map/half/Map_HALF_0002_Map-Base.png',
//   'https://storage.googleapis.com/tinglebot/map/MAP_0002_Map-Base.png'
// ];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('Caching static assets...');
      return cache.addAll(CACHE_URLS);
    })
  );
  
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim();
});

// Fetch event - serve from cache when possible
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Handle map images with cache-first strategy
  if (url.hostname === 'storage.googleapis.com' && url.pathname.includes('/tinglebot/map/')) {
    event.respondWith(
      caches.match(request).then(response => {
        if (response) {
          console.log('Serving map image from cache:', url.pathname);
          return response;
        }
        
        // If not in cache, fetch and cache it
        return fetch(request).then(fetchResponse => {
          if (fetchResponse.ok) {
            const responseClone = fetchResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return fetchResponse;
        }).catch(() => {
          // Return a placeholder if fetch fails
          return new Response('Map image unavailable offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
    );
    return;
  }
  
  // Handle API requests with network-first strategy
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return response;
      }).catch(() => {
        // Fallback to cache for API requests
        return caches.match(request).then(response => {
          if (response) {
            console.log('Serving API from cache:', url.pathname);
            return response;
          }
          
          // Return offline response for API
          return new Response(JSON.stringify({
            error: 'Offline',
            message: 'This feature requires an internet connection'
          }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }
  
  // Handle static assets with cache-first strategy
  event.respondWith(
    caches.match(request).then(response => {
      if (response) {
        return response;
      }
      
      return fetch(request).then(fetchResponse => {
        if (fetchResponse.ok) {
          const responseClone = fetchResponse.clone();
          caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, responseClone);
          });
        }
        return fetchResponse;
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', event => {
  if (event.tag === 'map-sync') {
    console.log('Background sync triggered for map data');
    // Handle offline map data sync when connection is restored
    event.waitUntil(syncMapData());
  }
});

async function syncMapData() {
  try {
    // Get offline actions from IndexedDB
    const offlineActions = await getOfflineActions();
    
    for (const action of offlineActions) {
      try {
        await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body
        });
        
        // Remove from offline storage after successful sync
        await removeOfflineAction(action.id);
      } catch (error) {
        console.warn('Failed to sync offline action:', error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Helper functions for offline storage
async function getOfflineActions() {
  // This would integrate with IndexedDB for storing offline actions
  return [];
}

async function removeOfflineAction(id) {
  // Remove action from IndexedDB after successful sync
  console.log('Removed offline action:', id);
}

// Message handling for cache management
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('Map cache cleared');
        return caches.open(CACHE_NAME);
      })
    );
  }
  
  // Disabled image preloading due to CORS issues
  if (event.data && event.data.type === 'PRELOAD_IMAGES') {
    console.log('⚠️ Image preloading disabled due to CORS policy');
    // event.waitUntil(
    //   caches.open(CACHE_NAME).then(cache => {
    //     return Promise.all(
    //       event.data.urls.map(url => 
    //         fetch(url).then(response => {
    //           if (response.ok) {
    //             return cache.put(url, response);
    //           }
    //         }).catch(error => {
    //           console.warn('Failed to preload image:', url, error);
    //         })
    //       )
    //     );
    //   })
    // );
  }
});
