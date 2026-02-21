/**
 * Main Map Integration - Entry point for the Leaflet image-space map system
 * Integrates all modules and provides global API
 */

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const MAP_DEBUG = false;
const MAP_LOAD_MIN_TILES = 3;
const MAP_LOAD_MIN_DURATION_MS = 1200;
const MAP_LOAD_MAX_WAIT_MS = 15000;
const MAP_LOAD_POLL_MS = 100;
const PIN_POLL_INTERVAL_MS = 10000;
const PATH_MAX_POINTS = 500;
const PATH_LAT_MIN = 0;
const PATH_LAT_MAX = 20000;
const PATH_LNG_MIN = 0;
const PATH_LNG_MAX = 24000;

// ------------------- State ------------------
// Global map engine instance -
let mapEngine = null;
// Cleanup refs (intervals and listeners) for page unload
let zoomDisplayIntervalId = null;
let pathImagesIntervalId = null;
let sidebarObserverRef = null;
let pinVisibilityHandlerRef = null;

// ============================================================================
// ------------------- Map init and loading -------------------
// ============================================================================

// ------------------- Map init ------------------
// checkAdminStatus - Returns true if user is admin or mod
async function checkAdminStatus() {
    try {
        const response = await fetch('/api/user', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        if (response.ok) {
            const userData = await response.json();
            const isAdminOrMod = userData.isAuthenticated && (userData.isAdmin || userData.isMod);
            if (isAdminOrMod) {
                // Set admin status on map engine
                if (mapEngine) {
                    mapEngine.isAdmin = true;
                }
                // Also set it globally for toggles to access
                window.currentUser = userData.user;
                window.currentUser.isAdmin = userData.isAdmin;
                window.currentUser.isMod = userData.isMod;
                return true;
            }
        }
    } catch (error) {
        console.error('[map.js]❌ Error checking admin status:', error);
    }
    return false;
}

// ------------------- Map init ------------------
// initializeMap -
async function initializeMap() {
    try {
        const loadStartTime = performance.now();

        // Step 1: Initializing system
        updateLoadingProgress(5, 'Initializing map system...', 1);

        // Check if MapEngine is available
        if (typeof MapEngine === 'undefined') {
            console.error('[map.js]❌ MapEngine class not found. Available classes:', {
                MapGeometry: typeof MapGeometry,
                MapManifest: typeof MapManifest,
                MapLayers: typeof MapLayers,
                MapLoader: typeof MapLoader,
                MapToggles: typeof MapToggles,
                MapEngine: typeof MapEngine
            });
            throw new Error('MapEngine class is not defined. Please check that map-engine.js is loaded.');
        }

        // Check if MAP_CONFIG is available
        if (typeof MAP_CONFIG === 'undefined') {
            throw new Error('MAP_CONFIG is not defined. Please check that map-constants.js is loaded.');
        }

        // Fetch path image overrides BEFORE creating map so loader uses them when loading squares
        await fetchPathImageOverrides();

        // Step 2: Create map engine with config
        updateLoadingProgress(15, 'Creating map engine...', 1);
        mapEngine = new MapEngine(MAP_CONFIG);

        // Check admin/mod status BEFORE initializing so toggles show correctly
        const isAdminOrMod = await checkAdminStatus();
        if (isAdminOrMod) {
            mapEngine.isAdmin = true;
        }

        // Step 3: Initialize the engine (loads manifest, layers, triggers tile loading)
        updateLoadingProgress(25, 'Loading map manifest...', 2);
        await mapEngine.initialize('map');

        // Setup global event listeners (non-blocking)
        setupGlobalEventListeners();

        // Step 4: Wait for tiles to load while updating progress
        updateLoadingProgress(45, 'Loading map tiles...', 2);
        await waitForMapTiles(loadStartTime);

        // Step 5: Complete
        updateLoadingProgress(100, 'Ready to explore!', 4);
        await new Promise(resolve => setTimeout(resolve, 300));

        // Hide loading overlay
        hideLoadingOverlay();

        // Post-init: click handler, pins (zoom interval started in DOMContentLoaded only)
        if (mapEngine && mapEngine.isInitialized) {
            mapEngine.addEventListener('click', handleMapClick);
            initializePinsWhenReady();
        }

        // Map system initialized successfully

    } catch (error) {
        console.error('[map.js]❌ Failed to initialize map system:', error);
        showError('Failed to initialize map system: ' + error.message);
    }
}

// ------------------- Map init ------------------
// waitForMapTiles -
function waitForMapTiles(loadStartTime) {
    return new Promise((resolve) => {
        const checkProgress = () => {
            const elapsed = performance.now() - loadStartTime;
            const progress = mapEngine.getLoadingProgress();
            const loaderStats = progress.loader || {};
            const loaded = loaderStats.loadedSquares || 0;
            const viewportTotal = loaderStats.viewportSquares || 1;
            const targetLoaded = Math.max(MAP_LOAD_MIN_TILES, Math.ceil(viewportTotal * 0.5));

            // Update progress: 45–95% based on tiles loaded
            const tileProgress = Math.min(1, loaded / targetLoaded);
            const percent = Math.round(45 + tileProgress * 50);
            const message = loaded > 0
                ? `Loading map tiles... (${loaded} of ${viewportTotal} loaded)`
                : 'Loading map tiles...';
            updateLoadingProgress(Math.min(percent, 95), message, loaded > 0 ? 3 : 2);

            const minDurationMet = elapsed >= MAP_LOAD_MIN_DURATION_MS;
            const enoughTilesLoaded = loaded >= targetLoaded;
            const maxWaitExceeded = elapsed >= MAP_LOAD_MAX_WAIT_MS;

            if ((minDurationMet && enoughTilesLoaded) || maxWaitExceeded) {
                resolve();
                return;
            }

            setTimeout(checkProgress, MAP_LOAD_POLL_MS);
        };

        // Start checking after a short delay so loader has time to queue tiles
        setTimeout(checkProgress, MAP_LOAD_POLL_MS);
    });
}

// ============================================================================
// ------------------- Global event listeners -------------------
// ============================================================================

// ------------------- Global event listeners ------------------
// setupGlobalEventListeners -
function setupGlobalEventListeners() {
    // Window resize handler
    window.addEventListener('resize', debounce(() => {
        if (mapEngine) {
            mapEngine.getMap().invalidateSize();
        }
    }, 250));
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);
    
    // Prevent context menu on map
    document.addEventListener('contextmenu', (event) => {
        if (event.target.closest('#map')) {
            event.preventDefault();
        }
    });
    
    // Add observer to track sidebar class changes (stored for cleanup)
    const sidebar = document.querySelector('.side-ui');
    if (sidebar) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class' && MAP_DEBUG) {
                    console.log('[map.js] Sidebar class changed:', sidebar.className);
                }
            });
        });
        observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        sidebarObserverRef = observer;
    }
    
    // Global event listeners setup
}

// ------------------- Global event listeners ------------------
// handleGlobalKeydown -
function handleGlobalKeydown(event) {
    // Only handle shortcuts when not in input fields
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    const key = event.key.toLowerCase();
    
    switch (key) {
        case 'f':
            // Fit to canvas
            if (mapEngine) {
                mapEngine.fitToCanvas();
            }
            event.preventDefault();
            break;
            
        case 'r':
            // Reload viewport
            if (mapEngine) {
                mapEngine.reloadViewport();
            }
            event.preventDefault();
            break;
            
        case 't':
            // Toggle sidebar
            toggleSidebar();
            event.preventDefault();
            break;
            
        case 'd':
            // Debug info
            if (mapEngine && event.ctrlKey) {
                mapEngine.logDebugInfo();
                event.preventDefault();
            }
            break;
            
        case 'escape':
            // Hide sidebar or close square popup
            if (window.currentSquarePopup) {
                closeSquareInfo();
            } else {
                hideSidebar();
            }
            break;
    }
}

// ------------------- Loading overlay ------------------
// hideLoadingOverlay -
function hideLoadingOverlay() {
    const overlay = document.getElementById('map-loading-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}

// ------------------- Loading overlay ------------------
// showError -
function showError(message) {
    console.error('[map.js]❌', message);
    
    // Create error display
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(255, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 8px;
        border: 2px solid #ff0000;
        z-index: 10000;
        font-family: 'Segoe UI', sans-serif;
        text-align: center;
        max-width: 400px;
    `;
    
    errorDiv.innerHTML = `
        <h3>Map Loading Error</h3>
        <p>${message}</p>
        <div style="margin-top: 15px;">
            <button onclick="location.reload()" style="
                background: #ff4444;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 10px;
            ">Reload Page</button>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: #666;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
            ">Dismiss</button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
}

// ============================================================================
// ------------------- Sidebar and zoom -------------------
// ============================================================================

// ------------------- Sidebar ------------------
// toggleSidebar -
function toggleSidebar() {
    const sidebar = document.querySelector('.side-ui');
    if (sidebar) {
        const isCollapsed = sidebar.classList.contains('collapsed');
        console.log('toggleSidebar: Current collapsed state:', isCollapsed);
        sidebar.classList.toggle('collapsed');
        console.log('toggleSidebar: New collapsed state:', sidebar.classList.contains('collapsed'));
    }
}

// ------------------- Sidebar ------------------
// showSidebar -
function showSidebar() {
    const sidebar = document.querySelector('.side-ui');
    if (sidebar) {
        sidebar.classList.remove('collapsed');
    }
}

// ------------------- Sidebar ------------------
// hideSidebar -
function hideSidebar() {
    const sidebar = document.querySelector('.side-ui');
    if (sidebar) {
        sidebar.classList.add('collapsed');
    }
}

// ------------------- Zoom ------------------
// zoomIn -
function zoomIn() {
    if (mapEngine) {
        const currentZoom = mapEngine.getZoom();
        mapEngine.setZoom(currentZoom + 1);
    }
}

// ------------------- Zoom ------------------
// zoomOut -
function zoomOut() {
    if (mapEngine) {
        const currentZoom = mapEngine.getZoom();
        mapEngine.setZoom(currentZoom - 1);
    }
}

// ------------------- Zoom ------------------
// resetZoom -
function resetZoom() {
    if (mapEngine) {
        mapEngine.setZoom(-2); // Default zoom level (medium detail)
    }
}

// ------------------- Zoom ------------------
// setZoom -
function setZoom(zoom) {
    if (mapEngine) {
        mapEngine.setZoom(zoom);
    }
}

// ------------------- Map API ------------------
// jumpToVillage -
function jumpToVillage(square, villageName) {
    if (mapEngine) {
        if (MAP_DEBUG) console.log(`[DEBUG] Jumping to ${villageName} at ${square}`);
        
        // Check if square is valid
        if (!mapEngine.geometry.isValidSquareId(square)) {
            if (MAP_DEBUG) console.error(`[DEBUG] Invalid square ID: ${square}`);
            return;
        }
        
        // Get bounds for debugging
        const bounds = mapEngine.geometry.getSquareBounds(square);
        if (MAP_DEBUG) console.log(`[DEBUG] Square bounds for ${square}:`, bounds);
        
        // Jump to the specific square
        jumpToSquare(square);
        
        // Set a good zoom level for village viewing
        mapEngine.setZoom(-1);
        
        if (MAP_DEBUG) console.log(`[DEBUG] Jumped to ${villageName} at ${square}`);
    }
}

// ------------------- Map API ------------------
// toggleSection -
function toggleSection(sectionId) {
    const section = document.querySelector(`.${sectionId}`);
    if (!section) return;
    
    const header = section.querySelector('.section-header');
    const content = section.querySelector('.section-content');
    const arrow = section.querySelector('.section-arrow');
    
    if (content.classList.contains('expanded')) {
        // Collapse section
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        header.classList.add('collapsed');
        arrow.style.transform = 'rotate(-90deg)';
    } else {
        // Expand section
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        header.classList.remove('collapsed');
        arrow.style.transform = 'rotate(0deg)';
    }
}

// ------------------- Map API ------------------
// debounce -
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ------------------- Map API ------------------
// jumpToSquare -
function jumpToSquare(squareId) {
    if (mapEngine) {
        mapEngine.jumpToSquare(squareId);
    } else {
        console.warn('[map.js]⚠️ Map engine not initialized');
    }
}

// ------------------- Map API ------------------
// fitToCanvas -
function fitToCanvas() {
    if (mapEngine) {
        mapEngine.fitToCanvas();
    } else {
        console.warn('[map.js]⚠️ Map engine not initialized');
    }
}

// ------------------- Map API ------------------
// jumpToCoordinates -
function jumpToCoordinates(x, y, zoom = 3) {
    if (mapEngine) {
        mapEngine.jumpToCoordinates(x, y, zoom);
    } else {
        console.warn('[map.js]⚠️ Map engine not initialized');
    }
}

// ------------------- Map API ------------------
// getMapState -
function getMapState() {
    if (mapEngine) {
        return {
            viewport: mapEngine.getViewportBounds(),
            zoom: mapEngine.getZoom(),
            center: mapEngine.getCenter(),
            loadedSquares: mapEngine.getLoadedSquares(),
            toggleState: mapEngine.getToggleState()
        };
    }
    return null;
}

// ------------------- Map API ------------------
// setMapToggleState -
function setMapToggleState(state) {
    if (mapEngine) {
        mapEngine.setToggleState(state);
    } else {
        console.warn('[map.js]⚠️ Map engine not initialized');
    }
}


// ------------------- Map API ------------------
// updateZoomDisplay -
function updateZoomDisplay() {
    if (!mapEngine || !mapEngine.isInitialized) return;
    
    const currentZoom = mapEngine.getZoom();
    
    // Update main zoom level display
    const zoomElement = document.getElementById('zoom-level');
    const viewStatusElement = document.getElementById('view-status');
    const zoomDescriptionElement = document.getElementById('zoom-description');
    
    if (zoomElement) {
        zoomElement.textContent = currentZoom;
    }
    
    
    if (viewStatusElement && zoomDescriptionElement) {
        if (currentZoom >= -1) {
            viewStatusElement.textContent = 'Maximum Detail';
            zoomDescriptionElement.textContent = 'All labels visible (A1-J12, Q1-Q4)';
        } else if (currentZoom >= -2) {
            viewStatusElement.textContent = 'High Detail';
            zoomDescriptionElement.textContent = 'Square labels visible (A1-J12)';
        } else if (currentZoom >= -3) {
            viewStatusElement.textContent = 'Medium Detail';
            zoomDescriptionElement.textContent = 'Grid visible, no labels';
        } else {
            viewStatusElement.textContent = 'Overview';
            zoomDescriptionElement.textContent = 'Full realm view';
        }
    }
}

// ------------------- Map API ------------------
// handleMapClick -
function handleMapClick(event) {
    if (!mapEngine) return;
    
    const latlng = event.latlng;
    const lat = latlng.lat;
    const lng = latlng.lng;
    
    // Handle path drawing: add point (bounds-clamped, max points) and update preview line
    if (pathDrawingMode && currentExplorationId) {
        if (pathDrawingPoints.length >= PATH_MAX_POINTS) {
            const statusEl = document.getElementById('exploration-mode-status');
            if (statusEl) statusEl.textContent = 'Maximum ' + PATH_MAX_POINTS + ' points. Click "Finish path" to save this path.';
            return;
        }
        const pt = clampPathPoint(lat, lng);
        pathDrawingPoints.push(pt);
        try {
            const map = mapEngine.getMap();
            if (map) {
                if (pathPreviewPolyline) map.removeLayer(pathPreviewPolyline);
                if (pathDrawingPoints.length >= 2 && typeof L !== 'undefined') {
                    const latlngs = pathDrawingPoints.map(p => [p.lat, p.lng]);
                    pathPreviewPolyline = L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.7, dashArray: '8,4' });
                    pathPreviewPolyline.addTo(map);
                }
            }
        } catch (e) { /* ignore */ }
        const statusEl = document.getElementById('exploration-mode-status');
        if (statusEl) statusEl.textContent = pathDrawingPoints.length >= PATH_MAX_POINTS
            ? 'Maximum ' + PATH_MAX_POINTS + ' points. Click "Finish path" to save.'
            : pathDrawingPoints.length + ' point(s). Click "Finish path" to save.';
        updateFinishPathButtonState();
        return;
    }
    // Handle exploration mode (markers)
    if (explorationMode && currentExplorationId) {
        const activeMarker = document.querySelector('.marker-btn.active');
        if (activeMarker) {
            const markerType = activeMarker.classList.contains('ruins') ? 'ruins' : 
                              activeMarker.classList.contains('monster') ? 'monster' : 'grotto';
            addExplorationMarker(lat, lng, markerType);
            return;
        }
    }
    // Default behavior - show square info
    const hitTest = mapEngine.hitTest(lng, lat);
    
    if (hitTest.square) {
        // Clicked square - show square information (COMMENTED OUT FOR NOW)
        // showSquareInfo(hitTest.square, hitTest.quadrant);
    }
}

// ------------------- Map API ------------------
// showSquareInfo -
function showSquareInfo(squareId, quadrant = null) {
    if (!mapEngine) return;
    
    // Close any existing popup first
    closeSquareInfo();
    
    // Get square metadata
    const metadata = mapEngine.getSquareMetadata(squareId);
    const region = mapEngine.getRegion(squareId);
    const status = mapEngine.getStatus(squareId);
    const isExplorable = mapEngine.isExplorable(squareId);
    
    // Create info popup
    const popup = L.popup({
        closeButton: true,
        autoClose: false,
        closeOnClick: false,
        className: 'square-info-popup'
    });
    
    // Get region and status colors from config
    const regionColor = MAP_CONFIG.SQUARE_METADATA.REGION_COLORS[region] || '#666';
    const statusColor = MAP_CONFIG.SQUARE_METADATA.STATUS_COLORS[status] || '#666';
    
    // Create popup content
    const content = `
        <div class="square-info-content">
            <div class="square-info-header">
                <h3 class="square-title">Square ${squareId}</h3>
                ${quadrant ? `<div class="quadrant-info">Quadrant ${quadrant}</div>` : ''}
            </div>
            <div class="square-info-body">
                <div class="info-row">
                    <div class="info-label">
                        <i class="fas fa-map-marker-alt"></i>
                        Region:
                    </div>
                    <div class="info-value" style="color: ${regionColor};">
                        ${region || 'Unknown'}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">
                        <i class="fas fa-${isExplorable ? 'check-circle' : 'times-circle'}"></i>
                        Status:
                    </div>
                    <div class="info-value" style="color: ${statusColor};">
                        ${status || 'Unknown'}
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-label">
                        <i class="fas fa-${isExplorable ? 'unlock' : 'lock'}"></i>
                        Access:
                    </div>
                    <div class="info-value" style="color: ${isExplorable ? '#22C55E' : '#EF4444'};">
                        ${isExplorable ? 'Explorable' : 'Inaccessible'}
                    </div>
                </div>
            </div>
            <div class="square-info-actions">
                <button class="action-btn close-btn" onclick="closeSquareInfo()" title="Close popup">
                    <i class="fas fa-times"></i>
                    Close
                </button>
            </div>
        </div>
    `;
    
    popup.setContent(content);
    
    // Get square center coordinates
    const squareCenter = mapEngine.geometry.getSquareCenter(squareId);
    
    // Open popup at square center
    popup.setLatLng([squareCenter.y, squareCenter.x])
         .openOn(mapEngine.getMap());
    
    // Store popup reference for closing
    window.currentSquarePopup = popup;
    if (MAP_DEBUG) console.log('[map.js] Square', squareId, 'clicked - Region:', region, 'Status:', status, 'Explorable:', isExplorable);
}

// ------------------- Map API ------------------
// closeSquareInfo -
function closeSquareInfo() {
    if (window.currentSquarePopup) {
        // Close the popup
        mapEngine.getMap().closePopup(window.currentSquarePopup);
        // Clear the reference
        window.currentSquarePopup = null;
    }
    
    // Also close any other popups that might be open
    if (mapEngine && mapEngine.getMap()) {
        mapEngine.getMap().closePopup();
    }
}

// ------------------- Map init ------------------
// DOMContentLoaded -
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Show initial loading progress
        updateLoadingProgress(0, 'Starting ROTW Map...', 1);
        
        // Wait a bit to ensure all scripts are loaded
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Initialize map with enhanced progress tracking
        await initializeMap();
        
        // Only proceed if initialization was successful
        if (mapEngine && mapEngine.isInitialized) {
            if (zoomDisplayIntervalId) clearInterval(zoomDisplayIntervalId);
            zoomDisplayIntervalId = setInterval(updateZoomDisplay, 1000);
            // Add map click handler
            mapEngine.addEventListener('click', handleMapClick);
            // User-drawn paths layer (secured paths)
            userPathsLayer = L.layerGroup().addTo(mapEngine.getMap());
            loadUserPaths();
            // User-uploaded path images (draw on square image, upload; same GCS URL auto-updates)
            userPathImagesLayer = L.layerGroup().addTo(mapEngine.getMap());
            loadUserPathImages();
            document.addEventListener('visibilitychange', onVisibilityPathImages);
            if (pathImagesIntervalId) clearInterval(pathImagesIntervalId);
            pathImagesIntervalId = setInterval(loadUserPathImages, 60000);
            // Initialize pins system
            initializePinsWhenReady();
            // URL: open exploration panel in path-draw mode for this expedition
            const params = new URLSearchParams(window.location.search);
            const drawPath = params.get('drawPath');
            const partyId = params.get('partyId');
            if (drawPath === '1' && partyId && partyId.trim().toUpperCase().startsWith('E')) {
                const input = document.querySelector('#exploration-id');
                if (input) { input.value = partyId.trim(); }
                if (typeof window.setExplorationId === 'function') window.setExplorationId();
                if (typeof window.toggleExplorationMode === 'function') window.toggleExplorationMode();
                setTimeout(() => { if (typeof window.togglePathDrawing === 'function') window.togglePathDrawing(); }, 300);
            }
            // Map system ready
        } else {
            // Initialization failed, error already shown
            updateLoadingProgress(0, 'Initialization failed', 1);
        }
        
    } catch (error) {
        console.error('[map.js]❌ Initialization error:', error);
        showError('Failed to initialize map: ' + error.message);
    }
});

// ------------------- Cleanup ------------------
// Clear intervals and remove listeners on page unload to prevent leaks
function mapPageCleanup() {
    if (zoomDisplayIntervalId) { clearInterval(zoomDisplayIntervalId); zoomDisplayIntervalId = null; }
    if (pathImagesIntervalId) { clearInterval(pathImagesIntervalId); pathImagesIntervalId = null; }
    if (pinPollIntervalId) { clearInterval(pinPollIntervalId); pinPollIntervalId = null; }
    document.removeEventListener('visibilitychange', onVisibilityPathImages);
    if (pinVisibilityHandlerRef) {
        document.removeEventListener('visibilitychange', pinVisibilityHandlerRef);
        pinVisibilityHandlerRef = null;
    }
    if (sidebarObserverRef) {
        sidebarObserverRef.disconnect();
        sidebarObserverRef = null;
    }
}
window.addEventListener('pagehide', mapPageCleanup);

// ------------------- Map init ------------------
// updateLoadingProgress -
function updateLoadingProgress(percent, message, step = 1) {
    const progressFill = document.getElementById('loading-progress-fill');
    const progressText = document.getElementById('loading-progress-text');
    const subtitle = document.getElementById('loading-subtitle');
    
    if (progressFill) {
        progressFill.style.width = percent + '%';
    }
    
    if (progressText) {
        progressText.textContent = percent + '%';
    }
    
    if (subtitle) {
        subtitle.textContent = message;
    }
    
    // Update loading steps
    updateLoadingSteps(step);
}

// ------------------- Map init ------------------
// updateLoadingSteps -
function updateLoadingSteps(currentStep) {
    // Reset all steps
    for (let i = 1; i <= 4; i++) {
        const stepElement = document.getElementById(`step-${i}`);
        if (stepElement) {
            stepElement.classList.remove('active', 'completed');
        }
    }
    
    // Mark completed steps
    for (let i = 1; i < currentStep; i++) {
        const stepElement = document.getElementById(`step-${i}`);
        if (stepElement) {
            stepElement.classList.add('completed');
        }
    }
    
    // Mark current step as active
    const currentStepElement = document.getElementById(`step-${currentStep}`);
    if (currentStepElement) {
        currentStepElement.classList.add('active');
    }
}

// Export global API
window.MapAPI = {
    jumpToSquare,
    fitToCanvas,
    jumpToCoordinates,
    getMapState,
    setMapToggleState,
    getMapEngine: () => mapEngine,
    
    // Square metadata API
    getSquareMetadata: (squareId) => mapEngine ? mapEngine.getSquareMetadata(squareId) : null,
    isExplorable: (squareId) => mapEngine ? mapEngine.isExplorable(squareId) : false,
    isInaccessible: (squareId) => mapEngine ? mapEngine.isInaccessible(squareId) : false,
    getRegion: (squareId) => mapEngine ? mapEngine.getRegion(squareId) : null,
    getStatus: (squareId) => mapEngine ? mapEngine.getStatus(squareId) : null,
    getSquaresByRegion: (region) => mapEngine ? mapEngine.getSquaresByRegion(region) : [],
    getSquaresByStatus: (status) => mapEngine ? mapEngine.getSquaresByStatus(status) : [],
    getRegions: () => mapEngine ? mapEngine.getRegions() : [],
    getStatuses: () => mapEngine ? mapEngine.getStatuses() : [],
    
    // Square info popup functions
    showSquareInfo: (squareId, quadrant) => showSquareInfo(squareId, quadrant),
    closeSquareInfo: () => closeSquareInfo()
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeMap,
        jumpToSquare,
        fitToCanvas,
        jumpToCoordinates,
        getMapState,
        setMapToggleState
    };
}

// ============================================================================
// Pin Management Functions
// ============================================================================

// Pin management state
let pinManager = {
    pins: [],
    addPinMode: false,
    selectedPin: null,
    currentUser: null,
    isAuthenticated: false,
    isMod: false,
    isAdmin: false
};

// Initialize pin manager with authentication
async function initializePinManager() {
    try {
        // Check authentication status
        const response = await fetch('/api/user', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        if (response.ok) {
            const userData = await response.json();
            pinManager.isAuthenticated = userData.isAuthenticated;
            pinManager.currentUser = userData.user;
            pinManager.isMod = userData.isMod === true;
            pinManager.isAdmin = userData.isAdmin === true;
            
            if (pinManager.isAuthenticated) {
                await loadPins();
                updatePinUI();
                initializeSearch();
                // Poll pins so when someone else adds a pin, everyone sees it
                if (pinPollIntervalId) clearInterval(pinPollIntervalId);
                pinPollIntervalId = setInterval(loadPins, PIN_POLL_INTERVAL_MS);
                if (pinVisibilityHandlerRef) document.removeEventListener('visibilitychange', pinVisibilityHandlerRef);
                pinVisibilityHandlerRef = function onPinVisibility() {
                    if (document.visibilityState === 'visible') loadPins();
                };
                document.addEventListener('visibilitychange', pinVisibilityHandlerRef);
            } else {
                showPinAuthRequired();
                initializeSearch();
            }
        } else {
            showPinAuthRequired();
        }
    } catch (error) {
        console.error('[map.js]❌ Error initializing pin manager:', error);
        showPinAuthRequired();
    }
}

// Avoid overlapping pin loads when polling
let pinLoadInProgress = false;
let pinPollIntervalId = null;

// Load pins from server
async function loadPins() {
    if (pinLoadInProgress) return;
    pinLoadInProgress = true;
    try {
        const response = await fetch('/api/pins', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            pinManager.pins = data.pins || [];
            updatePinsList();
            addPinsToMap();
        } else {
            console.error('[map.js]❌ Failed to load pins:', response.statusText);
        }
    } catch (error) {
        console.error('[map.js]❌ Error loading pins:', error);
    } finally {
        pinLoadInProgress = false;
    }
}

// Toggle add pin mode (with authentication check)
function toggleAddPinMode() {
    if (!pinManager.isAuthenticated) {
        showPinAuthRequired();
        return;
    }
    
    pinManager.addPinMode = !pinManager.addPinMode;
    const addBtn = document.querySelector('.add-pin-btn');
    const mapContainer = document.getElementById('map');
    
    if (pinManager.addPinMode) {
        // Update button appearance
        addBtn.style.background = 'rgba(34, 197, 94, 0.2)';
        addBtn.style.borderColor = '#22C55E';
        addBtn.style.color = '#22C55E';
        addBtn.innerHTML = '<i class="fas fa-times"></i><span>Cancel</span>';
        
        // Change cursor to indicate pin placement mode
        mapContainer.classList.add('pin-placement-mode');
        
        // Add click listener to map for pin placement
        if (mapEngine && mapEngine.getMap()) {
            mapEngine.getMap().on('click', handleMapClickForPin);
        }
        
        // Show instruction tooltip
        showPinPlacementTooltip();
    } else {
        // Reset button appearance
        addBtn.style.background = '';
        addBtn.style.borderColor = '';
        addBtn.style.color = '';
        addBtn.innerHTML = '<i class="fas fa-plus"></i><span>Add Pin</span>';
        
        // Reset cursor
        mapContainer.classList.remove('pin-placement-mode');
        
        // Remove click listener
        if (mapEngine && mapEngine.getMap()) {
            mapEngine.getMap().off('click', handleMapClickForPin);
        }
        
        // Hide instruction tooltip
        hidePinPlacementTooltip();
    }
}

// Handle map click for pin placement
async function handleMapClickForPin(e) {
    if (!pinManager.addPinMode || !pinManager.isAuthenticated) return;
    
    // Get proper coordinates using hitTest
    const hitTest = mapEngine.hitTest(e.latlng.lng, e.latlng.lat);
    // Note: Leaflet uses [lat, lng] which maps to [y, x] in screen space
    // But our coordinate system has Y=0 at bottom, Leaflet has Y=0 at top
    // So we need to flip the Y coordinate: y_our = CANVAS_H - y_leaflet
    const lat = mapEngine.config.CANVAS_H - e.latlng.lat;  // Flip Y coordinate
    const lng = e.latlng.lng;  // X coordinate stays the same
    
    // Hide instruction tooltip
    hidePinPlacementTooltip();
    
    // Show pin creation modal
    showPinCreationModal(lat, lng);
    
    // Exit add mode
    toggleAddPinMode();
}

// Show pin placement instruction tooltip
function showPinPlacementTooltip() {
    // Remove any existing tooltip
    hidePinPlacementTooltip();
    
    const tooltip = document.createElement('div');
    tooltip.id = 'pin-placement-tooltip';
    tooltip.className = 'pin-placement-tooltip';
    tooltip.innerHTML = `
        <div class="tooltip-content">
            <div class="tooltip-icon">
                <i class="fas fa-map-pin"></i>
            </div>
            <div class="tooltip-text">
                <strong>Pin Placement Mode</strong>
                <span>Click anywhere on the map to place a pin</span>
            </div>
            <button class="tooltip-close" onclick="toggleAddPinMode()" title="Cancel">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    document.body.appendChild(tooltip);
    
    // Show tooltip with animation
    setTimeout(() => {
        tooltip.classList.add('show');
    }, 100);
}

// Hide pin placement instruction tooltip
function hidePinPlacementTooltip() {
    const tooltip = document.getElementById('pin-placement-tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
        setTimeout(() => {
            tooltip.remove();
        }, 300);
    }
}

// Load character options into a pin modal select (optional selectedId for edit mode)
async function loadPinCharacterOptions(selectEl, selectedId) {
    if (!selectEl) return;
    try {
        const res = await fetch('/api/characters/list', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const characters = data.characters || [];
        const idStr = selectedId ? (typeof selectedId === 'object' && selectedId._id ? selectedId._id : String(selectedId)) : '';
        selectEl.innerHTML = '';
        const noneOpt = document.createElement('option');
        noneOpt.value = '';
        noneOpt.textContent = 'No character';
        selectEl.appendChild(noneOpt);
        characters.forEach(function (c) {
            const opt = document.createElement('option');
            opt.value = c._id;
            opt.textContent = c.name;
            if (c._id === idStr) opt.selected = true;
            selectEl.appendChild(opt);
        });
    } catch (e) {
        console.warn('[map.js]⚠️ Failed to load characters for pin:', e);
    }
}

// Show pin creation modal
function showPinCreationModal(lat, lng) {
    const modal = document.createElement('div');
    modal.className = 'pin-creation-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closePinModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <div class="header-left">
                        <div class="pin-icon-preview">
                            <i class="fas fa-map-marker-alt" id="preview-icon"></i>
                        </div>
                        <div class="header-text">
                            <h3>Create New Pin</h3>
                            <div class="coordinate-info">
                                <i class="fas fa-crosshairs"></i>
                                <span>Location: ${lat.toFixed(2)}, ${lng.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>
                    <button class="modal-close" onclick="closePinModal()" title="Close (Esc)" aria-label="Close modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="pin-creation-form" novalidate>
                        <div class="form-section">
                            <h4 class="section-title">
                                <i class="fas fa-info-circle"></i>
                                Basic Information
                            </h4>
                            <div class="form-group">
                                <label for="pin-name">
                                    Pin Name <span class="required">*</span>
                                    <span class="char-count" id="name-count">0/100</span>
                                </label>
                                <input type="text" id="pin-name" name="name" required maxlength="100" 
                                       placeholder="Enter a descriptive name for this location" autocomplete="off">
                                <div class="field-error" id="name-error"></div>
                            </div>
                            <div class="form-group">
                                <label for="pin-description">
                                    Description
                                    <span class="char-count" id="desc-count">0/500</span>
                                </label>
                                <textarea id="pin-description" name="description" maxlength="500" 
                                          placeholder="Add details about this location (optional)" rows="3"></textarea>
                            </div>
                            <div class="form-group">
                                <label for="pin-character">
                                    Tag character
                                    <span class="optional-label">(Optional)</span>
                                </label>
                                <select id="pin-character" name="characterId" class="pin-character-select">
                                    <option value="">No character</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-section">
                            <h4 class="section-title">
                                <i class="fas fa-image"></i>
                                Pin Image
                            </h4>
                            <div class="form-group">
                                <label for="pin-image">
                                    Upload Image
                                    <span class="optional-label">(Optional)</span>
                                </label>
                                <div class="image-upload-container">
                                    <input type="file" id="pin-image" name="image" accept="image/*" 
                                           class="image-upload-input" onchange="handleImageUpload(event)">
                                    <div class="image-upload-area" onclick="document.getElementById('pin-image').click()">
                                        <div class="upload-placeholder" id="upload-placeholder">
                                            <i class="fas fa-cloud-upload-alt"></i>
                                            <p>Click to upload an image</p>
                                            <small>JPEG, PNG, GIF, WebP (max 5MB)</small>
                                        </div>
                                        <div class="image-preview" id="image-preview" style="display: none;">
                                            <img id="preview-img" src="" alt="Preview">
                                            <button type="button" class="remove-image-btn" onclick="removeImagePreview()" title="Remove image">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="image-error" id="image-error"></div>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <h4 class="section-title">
                                <i class="fas fa-tags"></i>
                                Appearance
                            </h4>
                            <div class="appearance-grid">
                                <div class="form-group category-group">
                                    <label for="pin-category">Category</label>
                                    <div class="category-selector">
                                        <div class="category-option selected" data-category="homes" data-icon="fas fa-home">
                                            <input type="radio" name="category" value="homes" checked style="display: none;">
                                            <i class="fas fa-home"></i>
                                            <span>Homes</span>
                                        </div>
                                        <div class="category-option" data-category="farms" data-icon="fas fa-seedling">
                                            <input type="radio" name="category" value="farms" style="display: none;">
                                            <i class="fas fa-seedling"></i>
                                            <span>Farms</span>
                                        </div>
                                        <div class="category-option" data-category="shops" data-icon="fas fa-store">
                                            <input type="radio" name="category" value="shops" style="display: none;">
                                            <i class="fas fa-store"></i>
                                            <span>Shops</span>
                                        </div>
                                        <div class="category-option" data-category="points-of-interest" data-icon="fas fa-star">
                                            <input type="radio" name="category" value="points-of-interest" style="display: none;">
                                            <i class="fas fa-star"></i>
                                            <span>Points of Interest</span>
                                        </div>
                                    </div>
                                </div>
                                
                            </div>
                        </div>


                        <div class="form-actions">
                            <button type="button" onclick="closePinModal()" class="btn-cancel">
                                <i class="fas fa-times"></i>
                                Cancel
                            </button>
                            <button type="submit" class="btn-create" id="create-btn">
                                <i class="fas fa-plus"></i>
                                Create Pin
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load character list for dropdown
    loadPinCharacterOptions(document.getElementById('pin-character'));
    
    // Setup form interactions
    setupPinFormInteractions();
    
    // Handle form submission
    document.getElementById('pin-creation-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await createPinFromForm(lat, lng);
    });
    
    // Focus on name input
    setTimeout(() => {
        document.getElementById('pin-name').focus();
    }, 100);
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', handlePinModalKeyboard);
}

// Get default color for pin category
function getDefaultColorForCategory(category) {
    const info = getCategoryDisplayInfo(category);
    return info.color;
}

// getCategoryDisplayInfo - single source for pin category name, icon, color
function getCategoryDisplayInfo(category) {
    const map = {
        'homes': { name: 'Homes', icon: '🏠', color: '#C5FF00' },
        'farms': { name: 'Farms', icon: '🌱', color: '#22C55E' },
        'shops': { name: 'Shops', icon: '🏪', color: '#FF8C00' },
        'points-of-interest': { name: 'Points of Interest', icon: '⭐', color: '#FF69B4' }
    };
    return map[category] || { name: 'Unknown', icon: '📍', color: '#00A3DA' };
}

// getPinTextShadow - house: black outline, others: white
function getPinTextShadow(category) {
    return category === 'homes'
        ? '-1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black, 0 0 3px black'
        : '-1px -1px 0 white, 1px -1px 0 white, -1px 1px 0 white, 1px 1px 0 white, 0 0 3px white';
}

// Exploration discovery icons (custom PNGs only); pin.icon may be "exploration:grotto" etc.
var EXPLORATION_ICON_URLS = {
    grotto: 'https://storage.googleapis.com/tinglebot/maps/grottoiconroots2024.png',
    grotto_cleansed: 'https://storage.googleapis.com/tinglebot/maps/grottoiconroots2024.png',
    monster_camp: 'https://storage.googleapis.com/tinglebot/maps/monstercamproots2024.png',
    ruins: 'https://storage.googleapis.com/tinglebot/maps/ruinrestcamproots2024.png',
    relic: 'https://storage.googleapis.com/tinglebot/maps/ruinrestcamproots2024.png'
};
function getPinIconHtml(pin) {
    var icon = pin.icon;
    if (typeof icon === 'string' && icon.indexOf('exploration:') === 0) {
        var type = icon.slice(12);
        var url = EXPLORATION_ICON_URLS[type] || EXPLORATION_ICON_URLS.ruins;
        if (url) {
            var grottoClass = type === 'grotto_cleansed' ? 'grotto-gold' : '';
            var wrap = grottoClass ? '<div class="grotto-pin-wrap ' + grottoClass + '">' : '';
            var wrapEnd = grottoClass ? '</div>' : '';
            return wrap + '<img src="' + url + '" alt="" class="exploration-pin-icon" style="width:28px;height:28px;object-fit:contain;display:block;">' + wrapEnd;
        }
    }
    return '<i class="' + (icon || 'fas fa-map-marker-alt') + '"></i>';
}

// Get location information for a pin
function getPinLocationInfo(gridLocation, coordinates) {
    const info = {
        region: null,
        village: null,
        quadrant: null
    };
    
    // Get region from map engine
    if (mapEngine && gridLocation) {
        info.region = mapEngine.getRegion(gridLocation);
    }
    
    // Village mapping based on grid location
    const villageMap = {
        'H8': 'Inariko',
        'H5': 'Rudania', 
        'F10': 'Vhintl'
    };
    
    if (gridLocation && villageMap[gridLocation]) {
        info.village = villageMap[gridLocation];
    }
    
    // Calculate quadrant if coordinates are available
    if (coordinates && mapEngine) {
        if (MAP_DEBUG) console.log('[DEBUG] Pin coordinates:', coordinates);
        
        // Get square bounds for debugging
        const squareBounds = mapEngine.geometry.getSquareBounds(gridLocation);
        if (MAP_DEBUG) console.log('[DEBUG] Square bounds for', gridLocation, ':', squareBounds);
        
        // Calculate relative position within square
        const relativeX = coordinates.lng - squareBounds.x0;
        const relativeY = coordinates.lat - squareBounds.y0;
        if (MAP_DEBUG) {
            console.log('[DEBUG] Relative position within square:', { relativeX, relativeY });
            console.log('[DEBUG] Square dimensions:', { width: mapEngine.geometry.config.SQUARE_W, height: mapEngine.geometry.config.SQUARE_H });
            console.log('[DEBUG] Half dimensions:', { halfWidth: mapEngine.geometry.config.SQUARE_W / 2, halfHeight: mapEngine.geometry.config.SQUARE_H / 2 });
        }
        
        // Manual quadrant calculation to debug
        const isRight = relativeX >= mapEngine.geometry.config.SQUARE_W / 2;
        const isBottom = relativeY >= mapEngine.geometry.config.SQUARE_H / 2;
        if (MAP_DEBUG) console.log('[DEBUG] Manual calculation - isRight:', isRight, 'isBottom:', isBottom);
        
        // Try inverted Y-axis calculation
        const isBottomInverted = relativeY < mapEngine.geometry.config.SQUARE_H / 2;
        if (MAP_DEBUG) console.log('[DEBUG] Inverted Y calculation - isBottomInverted:', isBottomInverted);
        
        // Manual quadrant calculation with inverted Y
        let manualQuadrant;
        if (!isRight && !isBottomInverted) manualQuadrant = 1;
        else if (isRight && !isBottomInverted) manualQuadrant = 2;
        else if (!isRight && isBottomInverted) manualQuadrant = 3;
        else manualQuadrant = 4;
        if (MAP_DEBUG) console.log('[DEBUG] Manual quadrant with inverted Y:', manualQuadrant);
        
        // Try completely inverted coordinate system
        const isLeftInverted = relativeX < mapEngine.geometry.config.SQUARE_W / 2;
        const isTopInverted = relativeY < mapEngine.geometry.config.SQUARE_H / 2;
        if (MAP_DEBUG) console.log('[DEBUG] Completely inverted - isLeftInverted:', isLeftInverted, 'isTopInverted:', isTopInverted);
        
        let invertedQuadrant;
        if (isLeftInverted && isTopInverted) invertedQuadrant = 1;
        else if (!isLeftInverted && isTopInverted) invertedQuadrant = 2;
        else if (isLeftInverted && !isTopInverted) invertedQuadrant = 3;
        else invertedQuadrant = 4;
        if (MAP_DEBUG) console.log('[DEBUG] Completely inverted quadrant:', invertedQuadrant);
        
        // Try both coordinate orders since the map system might be different
        let hitTest = mapEngine.hitTest(coordinates.lng, coordinates.lat);
        if (MAP_DEBUG) {
            console.log('[DEBUG] Hit test result (lng, lat):', hitTest);
            console.log('[DEBUG] Expected square:', gridLocation, 'vs Hit test square:', hitTest.square);
        }
        
        // If no quadrant found, try the reverse order
        if (!hitTest.quadrant) {
            hitTest = mapEngine.hitTest(coordinates.lat, coordinates.lng);
            if (MAP_DEBUG) {
                console.log('[DEBUG] Hit test result (lat, lng):', hitTest);
                console.log('[DEBUG] Expected square:', gridLocation, 'vs Hit test square (reverse):', hitTest.square);
            }
        }
        
        // Also test the reverse coordinate order for square detection
        const reverseHitTest = mapEngine.hitTest(coordinates.lat, coordinates.lng);
        if (MAP_DEBUG) console.log('[DEBUG] Reverse hit test for square detection:', reverseHitTest);
        
        // Use the correct quadrant calculation
        // This uses: isRight = relativeX >= halfWidth, isTop = relativeY < halfHeight
        const isRightFinal = relativeX >= mapEngine.geometry.config.SQUARE_W / 2;
        const isTopFinal = relativeY < mapEngine.geometry.config.SQUARE_H / 2;
        
        let correctedQuadrant;
        if (!isRightFinal && isTopFinal) correctedQuadrant = 1;  // top-left
        else if (isRightFinal && isTopFinal) correctedQuadrant = 2;  // top-right
        else if (!isRightFinal && !isTopFinal) correctedQuadrant = 3;  // bottom-left
        else correctedQuadrant = 4;  // bottom-right
        
        info.quadrant = `Q${correctedQuadrant}`;
        if (MAP_DEBUG) {
            console.log('[DEBUG] Corrected quadrant set to:', info.quadrant);
            console.log('[DEBUG] Using correct quadrant calculation - isRightFinal:', isRightFinal, 'isTopFinal:', isTopFinal);
        }
    } else {
        if (MAP_DEBUG) console.log('[DEBUG] Missing coordinates or mapEngine:', { coordinates, mapEngine: !!mapEngine });
    }
    
    return info;
}

// Handle image upload and preview
function handleImageUpload(event) {
    const file = event.target.files[0];
    const errorDiv = document.getElementById('image-error');
    const previewDiv = document.getElementById('image-preview');
    const placeholderDiv = document.getElementById('upload-placeholder');
    const previewImg = document.getElementById('preview-img');
    
    // Clear previous errors
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
    
    if (!file) {
        // No file selected, show placeholder
        previewDiv.style.display = 'none';
        placeholderDiv.style.display = 'block';
        return;
    }
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        errorDiv.textContent = 'Please select a valid image file (JPEG, PNG, GIF, or WebP)';
        errorDiv.style.display = 'block';
        event.target.value = '';
        return;
    }
    
    // Validate file size (5MB = 5 * 1024 * 1024 bytes)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        errorDiv.textContent = 'Image file is too large. Maximum size is 5MB.';
        errorDiv.style.display = 'block';
        event.target.value = '';
        return;
    }
    
    // Create preview
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImg.src = e.target.result;
        previewDiv.style.display = 'block';
        placeholderDiv.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// Remove image preview
function removeImagePreview() {
    const fileInput = document.getElementById('pin-image');
    const previewDiv = document.getElementById('image-preview');
    const placeholderDiv = document.getElementById('upload-placeholder');
    const errorDiv = document.getElementById('image-error');
    
    fileInput.value = '';
    previewDiv.style.display = 'none';
    placeholderDiv.style.display = 'block';
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
}

// Open image modal for viewing pin images
function openImageModal(imageUrl, imageTitle) {
    const modal = document.createElement('div');
    modal.className = 'image-viewer-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeImageModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <h3>${imageTitle}</h3>
                    <button class="modal-close" onclick="closeImageModal()" title="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <img src="${imageUrl}" alt="${imageTitle}" class="image-viewer-img">
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add keyboard event listener
    const handleKeydown = (e) => {
        if (e.key === 'Escape') {
            closeImageModal();
        }
    };
    document.addEventListener('keydown', handleKeydown);
    
    // Store event listener for cleanup
    modal._handleKeydown = handleKeydown;
}

// Close image modal
function closeImageModal() {
    const modal = document.querySelector('.image-viewer-modal');
    if (modal) {
        // Remove keyboard event listener
        if (modal._handleKeydown) {
            document.removeEventListener('keydown', modal._handleKeydown);
        }
        
        // Add closing animation
        modal.style.opacity = '0';
        setTimeout(() => {
            modal.remove();
        }, 300);
    }
}

// Create pin from form data
async function createPinFromForm(lat, lng) {
    try {
        const form = document.getElementById('pin-creation-form');
        const formData = new FormData(form);
        const previewIcon = document.getElementById('preview-icon');
        
        // Get the selected category and its corresponding icon
        const selectedCategory = formData.get('category');
        const categoryOption = document.querySelector(`.pin-creation-modal [data-category="${selectedCategory}"]`);
        const iconClass = categoryOption ? categoryOption.dataset.icon : 'fas fa-home';
        
        // Get default color based on category
        const defaultColor = getDefaultColorForCategory(selectedCategory);
        
        // Add coordinates to FormData
        formData.append('coordinates', JSON.stringify({ lat, lng }));
        // Update existing category with the selected one (in case form has different value)
        formData.set('category', selectedCategory);
        formData.set('icon', iconClass);
        formData.set('color', defaultColor);
        formData.set('isPublic', 'true');
        const characterId = document.getElementById('pin-character')?.value?.trim();
        if (characterId) formData.set('characterId', characterId);
        
        // Show loading state
        const createBtn = document.getElementById('create-btn');
        const originalText = createBtn.innerHTML;
        createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';
        createBtn.disabled = true;
        
        const response = await fetch('/api/pins', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            pinManager.pins.push(data.pin);
            addPinToMap(data.pin);
            updatePinsList();
            
            // Show success message
            showPinSuccessMessage(data.pin.name);
            
            closePinModal();
            if (MAP_DEBUG) console.log('[map.js] Pin created:', data.pin);
        } else {
            const error = await response.json();
            showPinErrorMessage('Failed to create pin: ' + error.error);
            
            // Restore button state
            createBtn.innerHTML = originalText;
            createBtn.disabled = false;
        }
    } catch (error) {
        console.error('[map.js]❌ Error creating pin:', error);
        showPinErrorMessage('Failed to create pin. Please try again.');
        
        // Restore button state
        const createBtn = document.getElementById('create-btn');
        createBtn.innerHTML = '<i class="fas fa-plus"></i> Create Pin';
        createBtn.disabled = false;
    }
}

// Show success message for pin creation
function showPinSuccessMessage(pinName) {
    const notification = document.createElement('div');
    notification.className = 'pin-notification success';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-check-circle"></i>
            <span>Pin "${pinName}" created successfully!</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove notification
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Show error message for pin creation
function showPinErrorMessage(message) {
    const notification = document.createElement('div');
    notification.className = 'pin-notification error';
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-exclamation-triangle"></i>
            <span>${message}</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove notification
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}

// Setup form interactions for enhanced modal
function setupPinFormInteractions() {
    const nameInput = document.getElementById('pin-name');
    const descInput = document.getElementById('pin-description');
    const previewIcon = document.getElementById('preview-icon');
    
    // Get the submit button (could be create-btn or update-btn)
    const createBtn = document.getElementById('create-btn');
    const updateBtn = document.getElementById('update-btn');
    const submitBtn = createBtn || updateBtn;
    
    // Character counters
    nameInput.addEventListener('input', () => {
        const count = nameInput.value.length;
        document.getElementById('name-count').textContent = `${count}/100`;
        validateName();
    });
    
    descInput.addEventListener('input', () => {
        const count = descInput.value.length;
        document.getElementById('desc-count').textContent = `${count}/500`;
    });
    
    
    // Category selection
    document.querySelectorAll('.category-option').forEach(option => {
        option.addEventListener('click', () => {
            // Remove selected class from all options
            document.querySelectorAll('.category-option').forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            option.classList.add('selected');
            
            // Update preview icon
            const icon = option.dataset.icon;
            previewIcon.className = icon;
            
            // Update the hidden radio button value
            const radioInput = option.querySelector('input[type="radio"]');
            if (radioInput) {
                radioInput.checked = true;
                
                // Update color based on category
                const category = radioInput.value;
                const defaultColor = getDefaultColorForCategory(category);
                previewIcon.style.color = defaultColor;
            }
        });
    });
    
    // Form validation
    function validateName() {
        const name = nameInput.value.trim();
        const errorDiv = document.getElementById('name-error');
        
        if (name.length === 0) {
            errorDiv.textContent = 'Pin name is required';
            nameInput.classList.add('error');
            if (submitBtn) submitBtn.disabled = true;
        } else if (name.length < 2) {
            errorDiv.textContent = 'Pin name must be at least 2 characters';
            nameInput.classList.add('error');
            if (submitBtn) submitBtn.disabled = true;
        } else {
            errorDiv.textContent = '';
            nameInput.classList.remove('error');
            if (submitBtn) submitBtn.disabled = false;
        }
    }
    
    // Initial validation
    validateName();
}

// Handle keyboard shortcuts for pin modal
function handlePinModalKeyboard(e) {
    if (!document.querySelector('.pin-creation-modal')) return;
    
    switch (e.key) {
        case 'Escape':
            e.preventDefault();
            closePinModal();
            break;
        case 'Enter':
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const form = document.getElementById('pin-creation-form');
                if (form && !document.getElementById('create-btn').disabled) {
                    form.dispatchEvent(new Event('submit'));
                }
            }
            break;
    }
}

// Close pin modal
function closePinModal() {
    const modal = document.querySelector('.pin-creation-modal');
    if (modal) {
        // Remove keyboard event listener
        document.removeEventListener('keydown', handlePinModalKeyboard);
        
        // Add closing animation
        modal.classList.add('closing');
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
}

// Show delete confirmation modal
function showDeleteConfirmationModal(pinName) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'delete-confirmation-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="closeDeleteModal(false)">
                <div class="modal-content" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <div class="header-left">
                            <div class="pin-icon-preview">
                                <i class="fas fa-exclamation-triangle" style="color: #ff6b6b;"></i>
                            </div>
                            <div class="header-text">
                                <h3>Delete Pin</h3>
                                <div class="coordinate-info">
                                    <i class="fas fa-map-marker-alt"></i>
                                    <span>Confirm deletion</span>
                                </div>
                            </div>
                        </div>
                        <button class="modal-close" onclick="closeDeleteModal(false)" title="Close (Esc)" aria-label="Close modal">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div class="delete-warning">
                            <p>Are you sure you want to delete the pin <strong>"${pinName}"</strong>?</p>
                            <p class="warning-text">This action cannot be undone.</p>
                        </div>
                        <div class="form-actions">
                            <button type="button" onclick="closeDeleteModal(false)" class="btn-cancel">Cancel</button>
                            <button type="button" onclick="closeDeleteModal(true)" class="btn-delete">Delete Pin</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add keyboard event listener
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeDeleteModal(false);
            }
        };
        document.addEventListener('keydown', handleKeydown);
        
        // Store the resolve function and event listener for cleanup
        modal._resolve = resolve;
        modal._handleKeydown = handleKeydown;
        
        // Focus on the delete button
        setTimeout(() => {
            const deleteBtn = modal.querySelector('.btn-delete');
            if (deleteBtn) deleteBtn.focus();
        }, 100);
    });
}

// Close delete modal
function closeDeleteModal(confirmed) {
    const modal = document.querySelector('.delete-confirmation-modal');
    
    if (modal && modal._resolve) {
        // Remove keyboard event listener
        if (modal._handleKeydown) {
            document.removeEventListener('keydown', modal._handleKeydown);
        }
        
        // Resolve the promise
        modal._resolve(confirmed);
        
        // Add closing animation
        modal.style.opacity = '0';
        modal.style.transform = 'translateY(-50%) scale(0.95)';
        setTimeout(() => {
            modal.remove();
        }, 200);
    } else if (!modal) {
        console.error('[map.js]❌ Delete modal not found');
    }
}

// Get grid coordinates from lat/lng
function getGridCoordinates(lat, lng) {
    // This is a simplified version - you'd need to implement proper coordinate conversion
    // based on your map's coordinate system
    const col = String.fromCharCode(65 + Math.floor((lng + 180) / 36)); // A-J
    const row = Math.floor((lat + 90) / 15) + 1; // 1-12
    return col + row;
}

// Add pin to map
function addPinToMap(pin) {
    if (!mapEngine || !mapEngine.getMap()) {
        console.warn('[map.js]⚠️ Map engine not available, skipping pin addition for:', pin.name);
        return;
    }
    
    try {
        const map = mapEngine.getMap();
        // Convert from our coordinate system (Y=0 at bottom) to Leaflet (Y=0 at top)
        const leafletLat = mapEngine.config.CANVAS_H - pin.coordinates.lat;
        const leafletLng = pin.coordinates.lng;
    
    const textShadow = getPinTextShadow(pin.category);
    const marker = L.marker([leafletLat, leafletLng], {
        icon: L.divIcon({
            className: 'custom-pin',
            html: `<div style="color: ${pin.color}; font-size: 20px; text-shadow: ${textShadow}; z-index: 50000; position: relative;">${getPinIconHtml(pin)}</div>`,
            iconSize: [28, 28],
            iconAnchor: [14, 28]
        })
    });
    
    // Create popup content with proper permissions
    const canEdit = pinManager.isAuthenticated && pin.discordId === pinManager.currentUser?.discordId;
    const canDelete = canEdit || (pinManager.isAuthenticated && (pinManager.isMod || pinManager.isAdmin));
    
    const category = getCategoryDisplayInfo(pin.category);

    // Format creation date
    const createdDate = pin.createdAt ? new Date(pin.createdAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }) : 'Unknown';

    // Get location information
    if (MAP_DEBUG) console.log('[DEBUG] Pin data for location info:', {
        gridLocation: pin.gridLocation,
        coordinates: pin.coordinates,
        pin: pin
    });
    const locationInfo = getPinLocationInfo(pin.gridLocation, pin.coordinates);

    const popupContent = `
        <div class="pin-popup">
            <div class="pin-popup-header">
                <div class="pin-popup-icon" style="color: ${pin.color};">
                    ${getPinIconHtml(pin)}
                </div>
                <div class="pin-popup-title">
                    <h4>${pin.name}</h4>
                    <div class="pin-popup-category" style="color: ${category.color};">
                        <i class="fas fa-tag"></i>
                        <span>${category.name}</span>
                    </div>
                </div>
            </div>
            <div class="pin-popup-body">
                <div class="pin-popup-info">
                    <div class="pin-popup-location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>Square: ${pin.gridLocation}${locationInfo.quadrant ? ' ' + locationInfo.quadrant : ''}</span>
                    </div>
                    <div class="pin-popup-coordinates">
                        <i class="fas fa-crosshairs"></i>
                        <span>Coordinates: ${pin.coordinates?.lat?.toFixed(2) || 'N/A'}, ${pin.coordinates?.lng?.toFixed(2) || 'N/A'}</span>
                    </div>
                    <div class="pin-popup-region">
                        <i class="fas fa-globe"></i>
                        <span>Region: ${locationInfo.region || 'Unknown'}</span>
                    </div>
                    ${locationInfo.village ? `
                    <div class="pin-popup-village">
                        <i class="fas fa-home"></i>
                        <span>Village: ${locationInfo.village}</span>
                    </div>
                    ` : ''}
                    ${pin.description ? `
                    <div class="pin-popup-description">
                        <i class="fas fa-info-circle"></i>
                        <span>${pin.description}</span>
                    </div>
                    ` : ''}
                    ${pin.partyId ? (() => {
                        const pid = String(pin.partyId);
                        const safe = pid.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                        return `
                    <div class="pin-popup-expedition">
                        <i class="fas fa-compass"></i>
                        <span>Found in expedition: <a href="/explore/${encodeURIComponent(pid)}" target="_blank" rel="noopener noreferrer">${safe}</a></span>
                    </div>
                    `;
                    })() : ''}
                    ${pin.imageUrl ? `
                    <div class="pin-popup-image">
                        <img src="${pin.imageUrl}" alt="${pin.name}" class="pin-popup-img" onclick="openImageModal('${pin.imageUrl}', '${pin.name}')" loading="lazy">
                    </div>
                    ` : ''}
                    <div class="pin-popup-creator">
                        <i class="fas fa-user"></i>
                        <span>Created by ${pin.creator?.username || 'Unknown'}</span>
                    </div>
                    ${pin.character?.name ? `
                    <div class="pin-popup-character">
                        <i class="fas fa-id-card"></i>
                        <span>Character: ${pin.character.name}</span>
                    </div>
                    ` : ''}
                    <div class="pin-popup-date">
                        <i class="fas fa-calendar"></i>
                        <span>${createdDate}</span>
                    </div>
                </div>
                ${canEdit || canDelete ? `
                <div class="pin-popup-actions">
                    ${canEdit ? `
                    <button onclick="editPin('${pin._id}')" class="pin-popup-btn edit-btn">
                        <i class="fas fa-edit"></i>
                        <span>Edit</span>
                    </button>
                    ` : ''}
                    ${canDelete ? `
                    <button onclick="deletePin('${pin._id}')" class="pin-popup-btn delete-btn">
                        <i class="fas fa-trash"></i>
                        <span>Delete</span>
                    </button>
                    ` : ''}
                </div>
                ` : ''}
            </div>
        </div>
    `;
    
    // Configure popup options
    const popupOptions = {
        closeButton: true,
        autoClose: true,
        closeOnClick: true,
        maxWidth: 400,
        minWidth: 320,
        keepInView: true
    };
    
    marker.bindPopup(popupContent, popupOptions);
    
    // Add tooltip for hover functionality to show pin name
    marker.bindTooltip(pin.name, {
        permanent: false,
        direction: 'top',
        offset: [0, -15],
        opacity: 0.9,
        className: 'pin-tooltip'
    });
    
    marker.addTo(map);
    marker.pinId = pin._id;
    } catch (error) {
        console.error('[map.js]❌ Error adding pin to map:', error, 'Pin:', pin);
    }
}

// Add all pins to map
function addPinsToMap() {
    if (!mapEngine || !mapEngine.getMap()) {
        console.warn('[map.js]⚠️ Map engine not available, skipping pin addition');
        return;
    }
    
    try {
        // Clear existing pins
        const map = mapEngine.getMap();
        map.eachLayer(layer => {
            if (layer.pinId) {
                map.removeLayer(layer);
            }
        });
        
        // Add all pins
        pinManager.pins.forEach(pin => {
            addPinToMap(pin);
        });
    } catch (error) {
        console.error('[map.js]❌ Error adding pins to map:', error);
    }
}

// Update pins list in UI
function updatePinsList() {
    // Use the new search functionality
    filterPins();
}

// View pin details
function viewPin(pinId) {
    const pin = pinManager.pins.find(p => p._id === pinId);
    if (!pin) return;
    
    // Center map on pin
    if (mapEngine && mapEngine.getMap()) {
        // Convert from our coordinate system (Y=0 at bottom) to Leaflet (Y=0 at top)
        const leafletLat = mapEngine.config.CANVAS_H - pin.coordinates.lat;
        const leafletLng = pin.coordinates.lng;
        mapEngine.getMap().setView([leafletLat, leafletLng], Math.max(mapEngine.getMap().getZoom(), 10));
    }
}

// Edit pin
async function editPin(pinId) {
    if (!pinManager.isAuthenticated) {
        showPinAuthRequired();
        return;
    }
    
    const pin = pinManager.pins.find(p => p._id === pinId);
    if (!pin) return;
    
    // Check if user can edit this pin
    if (pin.discordId !== pinManager.currentUser?.discordId) {
        alert('You can only edit your own pins.');
        return;
    }
    
    // Show edit modal (reuse creation modal with pre-filled data)
    showPinEditModal(pin);
}

// Show pin edit modal
function showPinEditModal(pin) {
    const modal = document.createElement('div');
    modal.className = 'pin-creation-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closePinModal()">
            <div class="modal-content" onclick="event.stopPropagation()">
                <div class="modal-header">
                    <div class="header-left">
                        <div class="pin-icon-preview" id="preview-icon-wrap">
                            ${getPinIconHtml(pin)}
                        </div>
                        <div class="header-text">
                            <h3>Edit Pin</h3>
                            <div class="coordinate-info">
                                <i class="fas fa-crosshairs"></i>
                                <span>Location: ${pin.coordinates?.lat?.toFixed(2) || '0.00'}, ${pin.coordinates?.lng?.toFixed(2) || '0.00'}</span>
                            </div>
                        </div>
                    </div>
                    <button class="modal-close" onclick="closePinModal()" title="Close (Esc)" aria-label="Close modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <form id="pin-edit-form" novalidate>
                        <div class="form-section">
                            <h4 class="section-title">
                                <i class="fas fa-info-circle"></i>
                                Basic Information
                            </h4>
                            <div class="form-group">
                                <label for="pin-name">
                                    Pin Name <span class="required">*</span>
                                    <span class="char-count" id="name-count">${pin.name?.length || 0}/100</span>
                                </label>
                                <input type="text" id="pin-name" name="name" required maxlength="100" 
                                       placeholder="Enter a descriptive name for this location" autocomplete="off" value="${pin.name || ''}">
                                <div class="field-error" id="name-error"></div>
                            </div>
                            <div class="form-group">
                                <label for="pin-description">
                                    Description
                                    <span class="char-count" id="desc-count">${pin.description?.length || 0}/500</span>
                                </label>
                                <textarea id="pin-description" name="description" maxlength="500" 
                                          placeholder="Add details about this location (optional)" rows="3">${pin.description || ''}</textarea>
                            </div>
                            <div class="form-group">
                                <label for="pin-character">
                                    Tag character
                                    <span class="optional-label">(Optional)</span>
                                </label>
                                <select id="pin-character" name="characterId" class="pin-character-select">
                                    <option value="">No character</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-section">
                            <h4 class="section-title">
                                <i class="fas fa-image"></i>
                                Pin Image
                            </h4>
                            <div class="form-group">
                                <label for="pin-image">
                                    Upload Image
                                    <span class="optional-label">(Optional)</span>
                                </label>
                                <div class="image-upload-container">
                                    <input type="file" id="pin-image" name="image" accept="image/*" 
                                           class="image-upload-input" onchange="handleImageUpload(event)">
                                    <div class="image-upload-area" onclick="document.getElementById('pin-image').click()">
                                        <div class="upload-placeholder" id="upload-placeholder" ${pin.imageUrl ? 'style="display: none;"' : ''}>
                                            <i class="fas fa-cloud-upload-alt"></i>
                                            <p>Click to upload an image</p>
                                            <small>JPEG, PNG, GIF, WebP (max 5MB)</small>
                                        </div>
                                        <div class="image-preview" id="image-preview" ${pin.imageUrl ? '' : 'style="display: none;"'}>
                                            <img id="preview-img" src="${pin.imageUrl || ''}" alt="Preview">
                                            <button type="button" class="remove-image-btn" onclick="removeImagePreview()" title="Remove image">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="image-error" id="image-error"></div>
                                </div>
                            </div>
                        </div>

                        <div class="form-section">
                            <h4 class="section-title">
                                <i class="fas fa-tags"></i>
                                Appearance
                            </h4>
                            <div class="appearance-grid">
                                <div class="form-group category-group">
                                    <label for="pin-category">Category</label>
                                    <div class="category-selector">
                                        <div class="category-option ${pin.category === 'homes' ? 'selected' : ''}" data-category="homes" data-icon="fas fa-home">
                                            <input type="radio" name="category" value="homes" ${pin.category === 'homes' ? 'checked' : ''} style="display: none;">
                                            <i class="fas fa-home"></i>
                                            <span>Homes</span>
                                        </div>
                                        <div class="category-option ${pin.category === 'farms' ? 'selected' : ''}" data-category="farms" data-icon="fas fa-seedling">
                                            <input type="radio" name="category" value="farms" ${pin.category === 'farms' ? 'checked' : ''} style="display: none;">
                                            <i class="fas fa-seedling"></i>
                                            <span>Farms</span>
                                        </div>
                                        <div class="category-option ${pin.category === 'shops' ? 'selected' : ''}" data-category="shops" data-icon="fas fa-store">
                                            <input type="radio" name="category" value="shops" ${pin.category === 'shops' ? 'checked' : ''} style="display: none;">
                                            <i class="fas fa-store"></i>
                                            <span>Shops</span>
                                        </div>
                                        <div class="category-option ${pin.category === 'points-of-interest' ? 'selected' : ''}" data-category="points-of-interest" data-icon="fas fa-star">
                                            <input type="radio" name="category" value="points-of-interest" ${pin.category === 'points-of-interest' ? 'checked' : ''} style="display: none;">
                                            <i class="fas fa-star"></i>
                                            <span>Points of Interest</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="form-actions">
                            <button type="button" onclick="closePinModal()" class="btn-cancel">
                                <i class="fas fa-times"></i>
                                Cancel
                            </button>
                            <button type="submit" class="btn-create" id="update-btn">
                                <i class="fas fa-save"></i>
                                Update Pin
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load character list and set current pin's character
    const pinCharacterId = pin.character?._id || pin.character || '';
    loadPinCharacterOptions(document.getElementById('pin-character'), pinCharacterId);
    
    // Setup form interactions
    setupPinFormInteractions();
    
    // Handle form submission
    document.getElementById('pin-edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await updatePinFromForm(pin._id);
    });
    
    // Focus on name input
    setTimeout(() => {
        document.getElementById('pin-name').focus();
    }, 100);
    
    // Handle keyboard shortcuts
    document.addEventListener('keydown', handlePinModalKeyboard);
}

// Update pin from form data
async function updatePinFromForm(pinId) {
    try {
        const form = document.getElementById('pin-edit-form');
        const formData = new FormData(form);
        
        // Get the selected category and its corresponding icon
        const selectedCategory = formData.get('category');
        const categoryOption = document.querySelector(`.pin-creation-modal [data-category="${selectedCategory}"]`);
        const iconClass = categoryOption ? categoryOption.dataset.icon : 'fas fa-home';
        
        // Get default color based on category
        const defaultColor = getDefaultColorForCategory(selectedCategory);
        
        // Update form data with correct values
        formData.set('category', selectedCategory);
        formData.set('icon', iconClass);
        formData.set('color', defaultColor);
        formData.set('isPublic', 'true');
        const characterId = document.getElementById('pin-character')?.value?.trim();
        if (characterId) {
            formData.set('characterId', characterId);
        } else {
            formData.set('characterId', '');
        }
        
        // Show loading state
        const updateBtn = document.getElementById('update-btn');
        const originalText = updateBtn.innerHTML;
        updateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';
        updateBtn.disabled = true;
        
        const response = await fetch(`/api/pins/${pinId}`, {
            method: 'PUT',
            credentials: 'include',
            body: formData
        });
        
        if (response.ok) {
            const data = await response.json();
            // Update pin in local array
            const pinIndex = pinManager.pins.findIndex(p => p._id === pinId);
            if (pinIndex !== -1) {
                pinManager.pins[pinIndex] = data.pin;
            }
            
            // Safely update the map and UI
            try {
                addPinsToMap();
                updatePinsList();
                closePinModal();
                console.log('Pin updated successfully:', data.pin);
            } catch (mapError) {
                console.error('[map.js]❌ Error updating map after pin update:', mapError);
                updatePinsList();
                closePinModal();
            }
        } else {
            const error = await response.json();
            alert('Failed to update pin: ' + error.error);
        }
    } catch (error) {
        console.error('[map.js]❌ Error updating pin:', error);
        alert('Failed to update pin. Please try again.');
    } finally {
        // Restore button state
        const updateBtn = document.getElementById('update-btn');
        if (updateBtn) {
            updateBtn.innerHTML = '<i class="fas fa-save"></i> Update Pin';
            updateBtn.disabled = false;
        }
    }
}

// Delete pin
async function deletePin(pinId) {
    if (!pinManager.isAuthenticated) {
        showPinAuthRequired();
        return;
    }
    
    const pin = pinManager.pins.find(p => p._id === pinId);
    if (!pin) return;
    
    // Check if user can delete this pin (owner or mod)
    const isOwner = pin.discordId === pinManager.currentUser?.discordId;
    if (!isOwner && !pinManager.isMod && !pinManager.isAdmin) {
        alert('You can only delete your own pins.');
        return;
    }
    
    const confirmed = await showDeleteConfirmationModal(pin.name);
    if (!confirmed) return;
    
    try {
        const response = await fetch(`/api/pins/${pinId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });
        
        if (response.ok) {
            // Remove from local array
            const pinIndex = pinManager.pins.findIndex(p => p._id === pinId);
            if (pinIndex !== -1) {
                pinManager.pins.splice(pinIndex, 1);
            }
            // Remove from map
            if (mapEngine && mapEngine.getMap()) {
                const map = mapEngine.getMap();
                map.eachLayer(layer => {
                    if (layer.pinId === pinId) {
                        map.removeLayer(layer);
                    }
                });
            }
            updatePinsList();
        } else {
            const error = await response.json();
            alert('Failed to delete pin: ' + error.error);
        }
    } catch (error) {
        console.error('[map.js]❌ Error deleting pin:', error);
        alert('Failed to delete pin. Please try again.');
    }
}


// Show authentication required message
function showPinAuthRequired() {
    const pinsList = document.getElementById('pins-list');
    if (pinsList) {
        pinsList.innerHTML = `
            <div class="auth-required-message">
                <i class="fas fa-lock"></i>
                <h4>Authentication Required</h4>
                <p>You must be logged in with Discord and be a verified member of our server to use pins.</p>
                <button onclick="redirectToMapLogin()" class="btn-login">
                    <i class="fab fa-discord"></i>
                    Login with Discord
                </button>
            </div>
        `;
    }
    
    // Disable pin buttons
    const addBtn = document.querySelector('.add-pin-btn');
    const manageBtn = document.querySelector('.manage-pins-btn');
    
    if (addBtn) {
        addBtn.style.opacity = '0.5';
        addBtn.style.cursor = 'not-allowed';
    }
    if (manageBtn) {
        manageBtn.style.opacity = '0.5';
        manageBtn.style.cursor = 'not-allowed';
    }
}

// Redirect to Discord auth with map return URL
function redirectToMapLogin() {
    const currentPath = window.location.pathname + window.location.hash;
    window.location.href = `/api/auth/discord?redirect=${encodeURIComponent(currentPath)}`;
}

// Search functionality
let currentSearchTerm = '';
let currentFilterCategory = 'all';

// Initialize search functionality
function initializeSearch() {
    const searchInput = document.getElementById('pin-search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }
    
    if (clearBtn) {
        clearBtn.addEventListener('click', clearSearch);
    }
    
    // Add category filter event listeners
    const categoryFilters = document.querySelectorAll('.category-filter');
    categoryFilters.forEach(filter => {
        filter.addEventListener('click', handleCategoryFilter);
    });
}

// Handle category filter clicks
function handleCategoryFilter(e) {
    const category = e.target.dataset.category;
    currentFilterCategory = category;
    
    // Update active state
    document.querySelectorAll('.category-filter').forEach(btn => {
        btn.classList.remove('active');
    });
    e.target.classList.add('active');
    
    // Filter pins
    filterPins();
}

// Handle search input
function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    currentSearchTerm = searchTerm;
    
    // Show/hide clear button
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
        if (searchTerm) {
            clearBtn.classList.add('visible');
        } else {
            clearBtn.classList.remove('visible');
        }
    }
    
    // Filter pins
    filterPins();
}

// Clear search
function clearSearch() {
    const searchInput = document.getElementById('pin-search-input');
    const clearBtn = document.getElementById('clear-search-btn');
    
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
    
    if (clearBtn) {
        clearBtn.classList.remove('visible');
    }
    
    currentSearchTerm = '';
    filterPins();
}

// Filter pins based on search term and category
function filterPins() {
    const pinsList = document.getElementById('pins-list');
    if (!pinsList || !pinManager.pins) return;
    
    const filteredPins = pinManager.pins.filter(pin => {
        // Check category filter
        let categoryMatch;
        if (currentFilterCategory === 'all') {
            categoryMatch = true;
        } else if (currentFilterCategory === 'my-pins') {
            // Filter for pins created by the current user
            categoryMatch = pinManager.isAuthenticated && pin.discordId === pinManager.currentUser?.discordId;
        } else {
            categoryMatch = pin.category === currentFilterCategory;
        }
        
        // Check search term
        const searchMatch = !currentSearchTerm || 
            pin.name.toLowerCase().includes(currentSearchTerm) ||
            (pin.description && pin.description.toLowerCase().includes(currentSearchTerm)) ||
            pin.gridLocation.toLowerCase().includes(currentSearchTerm);
        
        return categoryMatch && searchMatch;
    });
    
    // Update the display
    updatePinsListDisplay(filteredPins);
}

// Update pins list display with filtered pins
function updatePinsListDisplay(pins) {
    const pinsList = document.getElementById('pins-list');
    if (!pinsList) return;
    
    if (pins.length === 0) {
        pinsList.innerHTML = `
            <div class="no-pins-message">
                <i class="fas fa-search"></i>
                <p>No pins found</p>
                ${currentSearchTerm ? `<small>Try a different search term</small>` : ''}
            </div>
        `;
        return;
    }
    
    pinsList.innerHTML = pins.map(pin => {
        const canEdit = pinManager.isAuthenticated && pin.discordId === pinManager.currentUser?.discordId;
        const canDelete = canEdit || (pinManager.isAuthenticated && (pinManager.isMod || pinManager.isAdmin));
        return `
            <div class="pin-item">
                <div class="pin-icon" style="color: ${pin.color}; text-shadow: ${getPinTextShadow(pin.category)};">
                    ${getPinIconHtml(pin)}
                </div>
                <div class="pin-info">
                    <span class="pin-name">${pin.name}</span>
                    <span class="pin-location">${pin.gridLocation}</span>
                    <span class="pin-creator">by ${pin.creator?.username || 'Unknown'}</span>
                    ${pin.character?.name ? `<span class="pin-character-tag">${pin.character.name}</span>` : ''}
                </div>
                <div class="pin-actions">
                    <button class="pin-action-btn" onclick="viewPin('${pin._id}')" title="View Details">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${canEdit ? `
                    <button class="pin-action-btn" onclick="editPin('${pin._id}')" title="Edit Pin">
                        <i class="fas fa-edit"></i>
                    </button>
                    ` : ''}
                    ${canDelete ? `
                    <button class="pin-action-btn delete" onclick="deletePin('${pin._id}')" title="Delete Pin">
                        <i class="fas fa-trash"></i>
                    </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Update pin UI based on authentication state
function updatePinUI() {
    if (!pinManager.isAuthenticated) {
        showPinAuthRequired();
        return;
    }
    
    // Enable pin buttons
    const addBtn = document.querySelector('.add-pin-btn');
    const manageBtn = document.querySelector('.manage-pins-btn');
    
    if (addBtn) {
        addBtn.style.opacity = '1';
        addBtn.style.cursor = 'pointer';
    }
    if (manageBtn) {
        manageBtn.style.opacity = '1';
        manageBtn.style.cursor = 'pointer';
    }
}

// Initialize pins when map is ready
async function initializePinsWhenReady() {
    // Wait for map engine to be ready
    if (mapEngine && mapEngine.isInitialized) {
        await initializePinManager();
        
        // Test metadata integration
        if (MAP_DEBUG) testMetadataIntegration();
    } else {
        // Wait a bit and try again
        setTimeout(initializePinsWhenReady, 1000);
    }
}

// Test metadata integration (only runs when MAP_DEBUG is true)
function testMetadataIntegration() {
    if (!mapEngine) return;
    
    if (MAP_DEBUG) console.log('[map] Testing metadata integration...');
    
    const testSquare = 'H5'; // Rudania
    const metadata = mapEngine.getSquareMetadata(testSquare);
    if (MAP_DEBUG) console.log(`[map] Metadata for ${testSquare}:`, metadata);
    
    const region = mapEngine.getRegion(testSquare);
    const status = mapEngine.getStatus(testSquare);
    if (MAP_DEBUG) console.log(`[map] ${testSquare} - Region: ${region}, Status: ${status}`);
    
    const isExplorable = mapEngine.isExplorable(testSquare);
    if (MAP_DEBUG) console.log(`[map] ${testSquare} is explorable: ${isExplorable}`);
    
    const regions = mapEngine.getRegions();
    if (MAP_DEBUG) console.log('[map] Available regions:', regions);
    
    const eldinSquares = mapEngine.getSquaresByRegion('Eldin');
    if (MAP_DEBUG) console.log('[map] Eldin squares:', eldinSquares.length, 'squares');
    
    const explorableSquares = mapEngine.getSquaresByStatus('Explorable');
    if (MAP_DEBUG) console.log('[map] Explorable squares:', explorableSquares.length, 'squares');
    
    if (MAP_DEBUG) console.log('[map] Metadata integration test complete!');
}

// Demonstration function for using square metadata
function demonstrateSquareMetadata() {
    if (!mapEngine) {
        if (MAP_DEBUG) console.log('[map] Map engine not available');
        return;
    }
    
    if (!MAP_DEBUG) return;
    console.log('[map.js] === Square Metadata Demonstration ===');
    const squareId = 'H5'; // Rudania
    const metadata = MapAPI.getSquareMetadata(squareId);
    console.log('[map.js] Square', squareId, 'metadata:', metadata);
    const isExplorable = MapAPI.isExplorable(squareId);
    console.log('[map.js] Square', squareId, 'is explorable:', isExplorable);
    const region = MapAPI.getRegion(squareId);
    console.log('[map.js] Square', squareId, 'is in region:', region);
    const eldinSquares = MapAPI.getSquaresByRegion('Eldin');
    console.log('[map.js] Eldin region has', eldinSquares.length, 'squares:', eldinSquares.slice(0, 5), '...');
    const explorableSquares = MapAPI.getSquaresByStatus('Explorable');
    console.log('[map.js] Explorable squares:', explorableSquares.length);
    const regions = MapAPI.getRegions();
    console.log('[map.js] Available regions:', regions);
    console.log('[map.js] === End Demonstration ===');
}

// Make demonstration function available globally
window.demonstrateSquareMetadata = demonstrateSquareMetadata;

// ============================================================================
// Exploration System
// ============================================================================

let currentExplorationId = null;
let explorationMode = false;
let pathDrawingMode = false;
let pathDrawingPoints = [];
let pathPreviewPolyline = null;
let userPathsLayer = null;
let userPathImagesLayer = null;
let pathDrawingSaving = false;

// ------------------- Exploration ------------------
// clampPathPoint - clamp lat/lng to map bounds
function clampPathPoint(lat, lng) {
    return {
        lat: Math.max(PATH_LAT_MIN, Math.min(PATH_LAT_MAX, Number(lat) || 0)),
        lng: Math.max(PATH_LNG_MIN, Math.min(PATH_LNG_MAX, Number(lng) || 0))
    };
}

// ------------------- Exploration ------------------
// setMapInteractionsEnabled - enable/disable dragging, zoom, keyboard
function setMapInteractionsEnabled(enabled) {
    if (!mapEngine) return;
    try {
        const map = mapEngine.getMap();
        if (!map) return;
        if (enabled) {
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
            map.boxZoom.enable();
            map.keyboard.enable();
        } else {
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();
            map.scrollWheelZoom.disable();
            map.boxZoom.disable();
            map.keyboard.disable();
        }
    } catch (e) { /* ignore */ }
}

// ------------------- Exploration ------------------
// toggleExplorationMode -
function toggleExplorationMode() {
    const panel = document.getElementById('exploration-panel');
    if (panel) {
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            if (MAP_DEBUG) console.log('[map.js] Exploration panel shown');
        } else {
            panel.style.display = 'none';
            explorationMode = false;
            pathDrawingMode = false;
            pathDrawingPoints = [];
            if (pathPreviewPolyline && mapEngine) {
                try {
                    const map = mapEngine.getMap();
                    if (map) map.removeLayer(pathPreviewPolyline);
                } catch (e) { /* ignore */ }
                pathPreviewPolyline = null;
            }
            setMapInteractionsEnabled(true);
            if (MAP_DEBUG) console.log('[map.js] Exploration panel hidden');
        }
    }
}

// ------------------- Exploration ------------------
// closeExplorationPanel -
function closeExplorationPanel() {
    // This function is now handled by toggleExplorationMode()
    toggleExplorationMode();
}

// ------------------- Exploration ------------------
// setExplorationId -
function setExplorationId() {
    const input = document.querySelector('#exploration-id');
    const id = input.value.trim();
    
    if (id && id.startsWith('E')) {
        currentExplorationId = id;
        document.getElementById('current-id-display').textContent = id;
        explorationMode = true;
        document.getElementById('exploration-mode-status').textContent = 'Exploration mode active - Click map to add markers';
        if (MAP_DEBUG) console.log('[map.js] Set exploration ID:', id);
    } else {
        alert('Exploration ID must start with "E" (e.g., E123456)');
    }
}

// ------------------- Exploration ------------------
// setMarkerType -
function setMarkerType(type) {
    if (!currentExplorationId) {
        alert('Please set an exploration ID first');
        return;
    }
    
    explorationMode = true;
    pathDrawingMode = false;
    
    // Update button states
    document.querySelectorAll('.marker-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.marker-btn.${type}`).classList.add('active');
    
    document.getElementById('exploration-mode-status').textContent = `Click map to place ${type} marker`;
    if (MAP_DEBUG) console.log('[map.js] Marker type set:', type);
}

// ------------------- Exploration ------------------
// togglePathDrawing -
function togglePathDrawing() {
    if (!currentExplorationId) {
        alert('Please set an exploration ID first');
        return;
    }
    
    pathDrawingMode = !pathDrawingMode;
    explorationMode = false;
    pathDrawingPoints = [];
    if (pathPreviewPolyline && mapEngine) {
        try {
            const map = mapEngine.getMap();
            if (map) map.removeLayer(pathPreviewPolyline);
        } catch (e) { /* ignore */ }
        pathPreviewPolyline = null;
    }
    document.querySelectorAll('.marker-btn').forEach(btn => btn.classList.remove('active'));
        if (pathDrawingMode) {
        document.querySelector('.path-btn')?.classList.add('active');
        const statusEl = document.getElementById('exploration-mode-status');
        if (statusEl) statusEl.textContent = 'Click on the map to add points (max ' + PATH_MAX_POINTS + '). When done, click "Finish path" to save.';
        setMapInteractionsEnabled(false);
    } else {
        document.querySelector('.path-btn')?.classList.remove('active');
        const statusEl = document.getElementById('exploration-mode-status');
        if (statusEl) statusEl.textContent = 'Path drawing mode off';
        setMapInteractionsEnabled(true);
    }
    updateFinishPathButtonState();
}

// ------------------- Exploration ------------------
// updateFinishPathButtonState -
function updateFinishPathButtonState() {
    const btn = document.querySelector('.finish-path-btn');
    if (!btn) return;
    const canSave = pathDrawingPoints.length >= 2 && !pathDrawingSaving;
    btn.disabled = !canSave;
    btn.title = pathDrawingSaving ? 'Saving…' : (pathDrawingPoints.length < 2 ? 'Add at least 2 points first' : 'Save the path you drew');
}

// ------------------- Exploration ------------------
// loadUserPaths -
async function loadUserPaths(retryCount = 0) {
    if (!mapEngine || !userPathsLayer || typeof L === 'undefined') return;
    const maxRetries = 1;
    try {
        const res = await fetch('/api/explore/paths', { credentials: 'include' });
        if (!res.ok) {
            if (retryCount < maxRetries) setTimeout(() => loadUserPaths(retryCount + 1), 2000);
            return;
        }
        const text = await res.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (e) {
            if (retryCount < maxRetries) setTimeout(() => loadUserPaths(retryCount + 1), 2000);
            return;
        }
        const paths = Array.isArray(data.paths) ? data.paths : [];
        userPathsLayer.clearLayers();
        paths.forEach(p => {
            const coords = Array.isArray(p?.coordinates) ? p.coordinates : [];
            if (coords.length < 2) return;
            const latlngs = [];
            for (let i = 0; i < coords.length; i++) {
                const c = coords[i];
                const lat = Number(c?.lat);
                const lng = Number(c?.lng);
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
                const p = clampPathPoint(lat, lng);
                latlngs.push([p.lat, p.lng]);
            }
            if (latlngs.length >= 2) {
                try {
                    const line = L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.9 });
                    userPathsLayer.addLayer(line);
                } catch (e) { /* skip bad path */ }
            }
        });
    } catch (e) {
        console.warn('[map.js]⚠️ Failed to load paths:', e);
        if (retryCount < maxRetries) setTimeout(() => loadUserPaths(retryCount + 1), 2000);
    }
}

function onVisibilityPathImages() {
    if (document.visibilityState === 'visible') loadUserPathImages();
}

// fetchPathImageOverrides - Fetch path images and set __pathImageBaseOverrides before map loads.
// Called early in init so the loader uses overrides when loading base layer (replaces base completely).
async function fetchPathImageOverrides() {
    try {
        const params = new URLSearchParams(window.location.search);
        const partyId = params.get('partyId')?.trim() || '';
        const url = partyId ? `/api/explore/path-images?partyId=${encodeURIComponent(partyId)}` : '/api/explore/path-images';
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.pathImages) ? data.pathImages : [];
        const overrides = {};
        const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
        list.forEach((item) => {
            const rawId = item.squareId;
            let imageUrl = item.imageUrl;
            if (!rawId || !imageUrl) return;
            const squareId = String(rawId).trim().toUpperCase();
            if (item.updatedAt) imageUrl = imageUrl + (imageUrl.indexOf('?') >= 0 ? '&' : '?') + 'v=' + item.updatedAt;
            // Use same-origin proxy for GCS URLs to avoid CORS (matches map tile loading)
            if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
                imageUrl = base + '/api/images/' + encodeURIComponent(imageUrl);
            }
            overrides[squareId] = imageUrl;
        });
        window.__pathImageBaseOverrides = overrides;
    } catch (e) {
        window.__pathImageBaseOverrides = {};
        if (MAP_DEBUG) console.warn('[map.js] Failed to fetch path image overrides:', e);
    }
}

// ------------------- Exploration ------------------
// loadUserPathImages -
async function loadUserPathImages() {
    if (!mapEngine || typeof L === 'undefined') return;
    try {
        const params = new URLSearchParams(window.location.search);
        const partyId = params.get('partyId')?.trim() || '';
        const url = partyId ? `/api/explore/path-images?partyId=${encodeURIComponent(partyId)}` : '/api/explore/path-images';
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data.pathImages) ? data.pathImages : [];
        const overrides = {};
        const base = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
        list.forEach((item) => {
            const rawId = item.squareId;
            let imageUrl = item.imageUrl;
            if (!rawId || !imageUrl) return;
            const squareId = String(rawId).trim().toUpperCase();
            if (item.updatedAt) imageUrl = imageUrl + (imageUrl.indexOf('?') >= 0 ? '&' : '?') + 'v=' + item.updatedAt;
            // Use same-origin proxy for GCS URLs to avoid CORS
            if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
                imageUrl = base + '/api/images/' + encodeURIComponent(imageUrl);
            }
            overrides[squareId] = imageUrl;
            if (typeof mapEngine.replaceBaseImageForSquare === 'function') {
                mapEngine.replaceBaseImageForSquare(squareId, imageUrl);
            }
        });
        window.__pathImageBaseOverrides = overrides;
        if (userPathImagesLayer) userPathImagesLayer.clearLayers();
    } catch (e) {
        console.warn('[map.js]⚠️ Failed to load path images:', e);
    }
}

// ------------------- Exploration ------------------
// addPathToMap -
function addPathToMap(path) {
    if (!userPathsLayer || !path || typeof L === 'undefined') return;
    const coords = Array.isArray(path.coordinates) ? path.coordinates : [];
    if (coords.length < 2) return;
    const latlngs = [];
    for (let i = 0; i < coords.length; i++) {
        const c = coords[i];
        const lat = Number(c?.lat);
        const lng = Number(c?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        const p = clampPathPoint(lat, lng);
        latlngs.push([p.lat, p.lng]);
    }
    if (latlngs.length < 2) return;
    try {
        const line = L.polyline(latlngs, { color: '#22c55e', weight: 4, opacity: 0.9 });
        userPathsLayer.addLayer(line);
    } catch (e) { /* ignore */ }
}

// ------------------- Exploration ------------------
// finishPathDrawing -
async function finishPathDrawing() {
    if (pathDrawingSaving) return;
    if (!pathDrawingMode || pathDrawingPoints.length < 2) {
        if (pathDrawingPoints.length < 2 && !pathDrawingSaving) {
            const statusEl = document.getElementById('exploration-mode-status');
            if (statusEl) statusEl.textContent = 'Add at least 2 points by clicking the map, then click "Finish path".';
        }
        return;
    }
    pathDrawingSaving = true;
    updateFinishPathButtonState();
    const statusEl = document.getElementById('exploration-mode-status');
    if (statusEl) statusEl.textContent = 'Saving path…';
    try {
        const payload = {
            partyId: currentExplorationId || null,
            coordinates: pathDrawingPoints.map(p => clampPathPoint(p.lat, p.lng))
        };
        const res = await fetch('/api/explore/paths', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        let data = {};
        try {
            const text = await res.text();
            data = text ? JSON.parse(text) : {};
        } catch (e) { /* use empty data */ }
        if (!res.ok) {
            if (statusEl) statusEl.textContent = (data.error || 'Failed to save path') + (res.status === 413 ? ' (path too long)' : '');
            pathDrawingSaving = false;
            updateFinishPathButtonState();
            return;
        }
        if (data.path) addPathToMap(data.path);
        pathDrawingPoints = [];
        if (pathPreviewPolyline && mapEngine) {
            try {
                const map = mapEngine.getMap();
                if (map) map.removeLayer(pathPreviewPolyline);
            } catch (e) { /* ignore */ }
            pathPreviewPolyline = null;
        }
        if (statusEl) statusEl.textContent = 'Path saved! You can draw another or turn off path drawing.';
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Failed to save path. Try again.';
        console.warn('[map.js]⚠️ Save path error:', e);
    } finally {
        pathDrawingSaving = false;
        updateFinishPathButtonState();
    }
}


// ------------------- Exploration ------------------
// addExplorationMarker -
function addExplorationMarker(lat, lng, type) {
    if (!currentExplorationId) return;
    
    // Canonical exploration marker icons (grottos, monster camp, ruins/camp)
    const iconUrls = {
        grotto: 'https://storage.googleapis.com/tinglebot/maps/grottoiconroots2024.png',
        monster: 'https://storage.googleapis.com/tinglebot/maps/monstercamproots2024.png',
        ruins: 'https://storage.googleapis.com/tinglebot/maps/ruinrestcamproots2024.png'
    };
    
    const icon = L.icon({
        iconUrl: iconUrls[type],
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    });
    
    const marker = L.marker([lat, lng], { icon })
        .addTo(mapEngine.getMap());
    
    // Create the popup content
    const popupContent = document.createElement('div');
    popupContent.className = 'exploration-popup';
    popupContent.innerHTML = `
        <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
        <p><strong>Exploration ID:</strong> ${currentExplorationId}</p>
        <p><strong>Type:</strong> ${type}</p>
        <button class="remove-btn">Remove</button>
    `;
    
    // Set up the remove button
    const removeBtn = popupContent.querySelector('.remove-btn');
    removeBtn.onclick = () => {
        mapEngine.getMap().removeLayer(marker);
    };
    
    marker.bindPopup(popupContent);
    
    // Mark as exploration marker
    marker._explorationMarker = true;
    marker._explorationId = currentExplorationId;
    marker._markerType = type;
    
    if (MAP_DEBUG) console.log('[map.js] Added exploration marker:', { type, id: currentExplorationId, lat, lng });
}

// ------------------- Exploration ------------------
// removeExplorationMarker -
function removeExplorationMarker(button) {
    const marker = button._marker;
    if (marker) {
        mapEngine.getMap().removeLayer(marker);
    }
}



// Make exploration functions globally accessible
window.toggleExplorationMode = toggleExplorationMode;
window.closeExplorationPanel = closeExplorationPanel;
window.setExplorationId = setExplorationId;
window.setMarkerType = setMarkerType;
window.togglePathDrawing = togglePathDrawing;
window.finishPathDrawing = finishPathDrawing;
window.loadUserPathImages = loadUserPathImages;
window.addExplorationMarker = addExplorationMarker;
window.removeExplorationMarker = removeExplorationMarker;

// Make square info functions globally accessible
window.showSquareInfo = showSquareInfo;
window.closeSquareInfo = closeSquareInfo;

// ------------------- Pin migration ------------------
// migrateHousePinColors -
async function migrateHousePinColors() {
    try {
        console.log('Starting house pin color migration...');
        
        const response = await fetch('/api/pins/migrate-house-colors', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(`Successfully updated ${result.modifiedCount} house pins to new color!`);
            
            // Refresh the map to show updated pins
            if (typeof loadPins === 'function') {
                loadPins();
            }
        } else {
            const error = await response.json();
            console.error('[map.js]❌ Migration failed:', error);
            alert('Failed to migrate house pin colors: ' + error.error);
        }
    } catch (error) {
        console.error('[map.js]❌ Error during migration:', error);
        alert('Error during migration: ' + error.message);
    }
}

// Make migration function globally accessible
window.migrateHousePinColors = migrateHousePinColors;
