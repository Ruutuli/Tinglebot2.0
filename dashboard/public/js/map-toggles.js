/**
 * Map Toggles - UI state and visibility management
 * Handles layer toggles, grid visibility, and label controls
 */


class MapToggles {
    constructor(config, layers) {
        this.config = config;
        this.layers = layers;
        this.isAdmin = false;
        
        // Toggle state (defaults from config)
        this.state = { ...this.config.LAYER_DEFAULTS };
        
        // UI elements
        this.toggleContainer = null;
        this.toggleElements = new Map();
        
        // Event listeners
        this.listeners = new Map();
        
        this.initialize();
    }
    
    /**
     * Initialize toggles and create UI
     */
    initialize() {
        this._createToggleUI();
        this._applyInitialState();
        
        // Toggles initialized
    }
    
    /**
     * Create toggle UI elements in the permanent sidebar
     */
    _createToggleUI() {
        // Find the existing sidebar container
        this.toggleContainer = document.getElementById('map-layer-toggles');
        if (!this.toggleContainer) {
            console.error('[toggles] Sidebar container not found');
            return;
        }
        
        // Create toggles for each layer
        this._createLayerToggles();
    }
    
    /**
     * Create toggle elements for each layer
     */
    _createLayerToggles() {
        const layerGroups = [
            {
                title: 'Grid & Labels',
                layers: [
                    { key: 'grid-lines', label: 'Grid Lines', icon: '⊞' },
                    { key: 'square-labels', label: 'Square Labels', icon: 'A' },
                    { key: 'quadrant-cross', label: 'Quadrant Cross', icon: '+' },
                    { key: 'quadrant-labels', label: 'Quadrant Labels', icon: 'Q' }
                ]
            },
        {
            title: 'Map Layers',
            layers: [
                { key: 'paths', label: 'All Paths', icon: '🛤️' },
                { key: 'region-borders', label: 'Region Borders', icon: '🏞️' },
                { key: 'village-borders-inner', label: 'Village Borders (Inner)', icon: '🏘️' },
                { key: 'village-borders-outer', label: 'Village Borders (Outer)', icon: '🏘️' },
                { key: 'village-markers', label: 'Village Markers', icon: '🏛️' },
                { key: 'region-names', label: 'Region Names', icon: '🏷️' },
                { key: 'blight', label: 'Blight Areas', icon: '💀' },
                { key: 'fog', label: 'Fog Layer (Admin)', icon: '🌫️', adminOnly: true },
                { key: 'exploration', label: 'Exploration Markers', icon: '🗺️' }
            ]
        },
        {
            title: 'Path Types',
            layers: [
                { key: 'MAP_0003s_0000_PSL', label: 'Path of Scarlet Leaves', icon: '🍂' },
                { key: 'MAP_0003s_0001_LDW', label: 'Leaf Dew Way', icon: '🌿' },
                { key: 'MAP_0003s_0002_Other-Paths', label: 'Other Paths', icon: '🛣️' }
            ]
        }
        ];
        
        layerGroups.forEach(group => {
            // Group container
            const groupContainer = document.createElement('div');
            groupContainer.className = 'layer-toggle-group';
            
            // Group title
            const groupTitle = document.createElement('div');
            groupTitle.textContent = group.title;
            groupTitle.className = 'layer-toggle-group-title';
            groupContainer.appendChild(groupTitle);
            
            // Group layers
        group.layers.forEach(layer => {
            if (layer.special === 'exploration') {
                // Create special exploration button
                const explorationBtn = document.createElement('button');
                explorationBtn.className = 'exploration-tool-btn';
                explorationBtn.innerHTML = `
                    <span class="tool-icon">${layer.icon}</span>
                    <span class="tool-label">${layer.label}</span>
                `;
                explorationBtn.onclick = () => {
                    console.log('[exploration] Button clicked');
                    showExplorationPanel();
                };
                groupContainer.appendChild(explorationBtn);
            } else {
                const toggleElement = this._createToggleElement(layer.key, layer.label, layer.icon, layer.adminOnly);
                groupContainer.appendChild(toggleElement);
            }
        });
            
            this.toggleContainer.appendChild(groupContainer);
        });
    }
    
    /**
     * Create individual toggle element
     * @param {string} key - Toggle key
     * @param {string} label - Display label
     * @param {string} icon - Display icon
     * @param {boolean} adminOnly - Whether this toggle is admin-only
     */
    _createToggleElement(key, label, icon, adminOnly = false) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'layer-toggle';
        
        // Check if this is an admin-only toggle and user is not admin
        if (adminOnly && !this._isAdmin()) {
            toggleDiv.style.display = 'none';
            return toggleDiv;
        }
        
        // Checkbox
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `toggle-${key}`;
        checkbox.checked = this.state[key] || false;
        
        // Label
        const labelElement = document.createElement('label');
        labelElement.htmlFor = `toggle-${key}`;
        
        // Icon
        const iconSpan = document.createElement('span');
        iconSpan.textContent = icon;
        iconSpan.className = 'layer-icon';
        
        // Text
        const textSpan = document.createElement('span');
        textSpan.textContent = label;
        textSpan.className = 'layer-text';
        
        labelElement.appendChild(iconSpan);
        labelElement.appendChild(textSpan);
        
        toggleDiv.appendChild(checkbox);
        toggleDiv.appendChild(labelElement);
        
        // Event listeners
        const handleToggle = (event) => {
            event.preventDefault();
            this.toggle(key);
        };
        
        checkbox.addEventListener('change', handleToggle);
        toggleDiv.addEventListener('click', handleToggle);
        
        // Store reference
        this.toggleElements.set(key, {
            container: toggleDiv,
            checkbox: checkbox,
            label: labelElement
        });
        
        return toggleDiv;
    }
    
    /**
     * Apply initial state to layers
     */
    _applyInitialState() {
        for (const [key, visible] of Object.entries(this.state)) {
            this._applyToggleState(key, visible);
        }
    }
    
    /**
     * Toggle a layer on/off
     * @param {string} key - Toggle key
     * @param {boolean} force - Force specific state (optional)
     */
    toggle(key, force = null) {
        const newState = force !== null ? force : !this.state[key];
        this.setState(key, newState);
    }
    
    /**
     * Set toggle state
     * @param {string} key - Toggle key
     * @param {boolean} visible - Visibility state
     */
    setState(key, visible) {
        if (this.state[key] === visible) return;
        
        this.state[key] = visible;
        this._applyToggleState(key, visible);
        this._updateToggleUI(key, visible);
        this._notifyListeners(key, visible);
        
        // Toggle changed
    }
    
    /**
     * Check if current user is admin
     * @returns {boolean} True if user is admin
     */
    _isAdmin() {
        // Check instance admin status first
        if (this.isAdmin) {
            return true;
        }
        
        // Check if we have admin status from the global user data
        if (typeof window !== 'undefined' && window.currentUser && window.currentUser.isAdmin) {
            return true;
        }
        
        // Check if we have admin status from the map system
        if (typeof window !== 'undefined' && window.mapEngine && window.mapEngine.isAdmin) {
            return true;
        }
        
        return false;
    }

    /**
     * Apply toggle state to layers
     * @param {string} key - Toggle key
     * @param {boolean} visible - Visibility state
     */
    _applyToggleState(key, visible) {
        switch (key) {
            case 'grid-lines':
                this.layers.setGridVisibility(visible);
                break;
                
            case 'square-labels':
                this.layers.setSquareLabelsVisibility(visible);
                break;
                
            case 'quadrant-labels':
                this.layers.setQuadrantLabelsVisibility(visible);
                break;
                
            case 'quadrant-cross':
                this.layers.setQuadrantCrossVisibility(visible);
                break;
                
        case 'fog':
            this.layers.setFogVisibility(visible);
            break;
        case 'exploration':
            this.layers.setExplorationVisibility(visible);
            break;
                
            case 'paths':
            case 'region-borders':
            case 'village-borders-inner':
            case 'village-borders-outer':
            case 'village-markers':
            case 'region-names':
            case 'blight':
            case 'MAP_0003s_0000_PSL':
            case 'MAP_0003s_0001_LDW':
            case 'MAP_0003s_0002_Other-Paths':
                this.layers.setLayerVisibility(key, visible);
                break;
                
            default:
                console.warn('[toggles] Unknown toggle key:', key);
        }
    }
    
    /**
     * Update toggle UI element
     * @param {string} key - Toggle key
     * @param {boolean} visible - Visibility state
     */
    _updateToggleUI(key, visible) {
        const element = this.toggleElements.get(key);
        if (element) {
            element.checkbox.checked = visible;
            
            // Visual feedback
            element.container.style.opacity = visible ? '1' : '0.6';
        }
    }
    
    /**
     * Add toggle change listener
     * @param {string} key - Toggle key (or 'all' for all toggles)
     * @param {Function} callback - Callback function
     */
    addListener(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, []);
        }
        this.listeners.get(key).push(callback);
    }
    
    /**
     * Remove toggle change listener
     * @param {string} key - Toggle key
     * @param {Function} callback - Callback function
     */
    removeListener(key, callback) {
        const listeners = this.listeners.get(key);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    
    /**
     * Notify listeners of toggle change
     * @param {string} key - Toggle key
     * @param {boolean} visible - Visibility state
     */
    _notifyListeners(key, visible) {
        // Notify specific listeners
        const listeners = this.listeners.get(key);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(key, visible, this.state);
                } catch (error) {
                    console.error('[toggles] Listener error:', error);
                }
            });
        }
        
        // Notify 'all' listeners
        const allListeners = this.listeners.get('all');
        if (allListeners) {
            allListeners.forEach(callback => {
                try {
                    callback(key, visible, this.state);
                } catch (error) {
                    console.error('[toggles] Listener error:', error);
                }
            });
        }
    }
    
    /**
     * Get current toggle state
     * @param {string} key - Toggle key (optional)
     * @returns {Object|boolean} State object or specific toggle state
     */
    getState(key = null) {
        if (key) {
            return this.state[key] || false;
        }
        return { ...this.state };
    }
    
    /**
     * Set multiple toggle states at once
     * @param {Object} states - Object of key-value pairs
     */
    setStates(states) {
        for (const [key, visible] of Object.entries(states)) {
            this.setState(key, visible);
        }
    }
    
    /**
     * Reset all toggles to default state
     */
    resetToDefaults() {
        this.setState(this.config.LAYER_DEFAULTS);
    }
    
    /**
     * Show/hide toggle UI (now handled by sidebar)
     * @param {boolean} visible - Visibility state
     */
    setVisible(visible) {
        // Toggle visibility is now handled by the permanent sidebar
        // This method is kept for compatibility but does nothing
    }
    
    /**
     * Toggle UI visibility (now handled by sidebar)
     */
    toggleVisible() {
        // Toggle visibility is now handled by the permanent sidebar
        // This method is kept for compatibility but does nothing
    }
    
    /**
     * Save toggle state to localStorage
     */
    saveState() {
        try {
            localStorage.setItem('mapToggles', JSON.stringify(this.state));
            // State saved to localStorage
        } catch (error) {
            console.warn('[toggles] Failed to save state:', error);
        }
    }
    
    /**
     * Load toggle state from localStorage
     */
    loadState() {
        try {
            const saved = localStorage.getItem('mapToggles');
            if (saved) {
                const savedState = JSON.parse(saved);
                this.setStates(savedState);
                // State loaded from localStorage
            }
        } catch (error) {
            console.warn('[toggles] Failed to load state:', error);
        }
    }
    
    /**
     * Auto-save state on changes
     */
    enableAutoSave() {
        this.addListener('all', () => {
            this.saveState();
        });
    }
    
    /**
     * Create keyboard shortcuts for toggles
     */
    createKeyboardShortcuts() {
        const shortcuts = {
            'g': 'grid-lines',
            'l': 'square-labels',
            'q': 'quadrant-labels',
            'b': 'base',
            'p': 'paths',
            'r': 'region-borders',
            'v': 'village-borders',
            'n': 'region-names',
            'm': 'mask',
            '1': 'MAP_0003s_0000_PSL',
            '2': 'MAP_0003s_0001_LDW',
            '3': 'MAP_0003s_0002_Other-Paths'
        };
        
        document.addEventListener('keydown', (event) => {
            // Only handle shortcuts when not in input fields
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            const key = event.key.toLowerCase();
            const toggleKey = shortcuts[key];
            
            if (toggleKey) {
                event.preventDefault();
                this.toggle(toggleKey);
            }
        });
        
        // Keyboard shortcuts enabled
    }
    
    /**
     * Cleanup toggles (remove UI, listeners)
     */
    cleanup() {
        // Clear toggle elements from the sidebar
        if (this.toggleContainer) {
            this.toggleContainer.innerHTML = '';
        }
        
        // Clear references
        this.toggleElements.clear();
        this.listeners.clear();
        
        // Cleaned up
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapToggles;
}
