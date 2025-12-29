/**
 * Map Metrics - Diagnostics and performance monitoring
 * Tracks loading performance, errors, and provides dev HUD
 */

class MapMetrics {
    constructor(config) {
        this.config = config;
        this.isDevMode = window.location.hostname === 'localhost' || 
                        window.location.hostname.includes('dev') ||
                        window.location.search.includes('debug=true');
        
        // Performance tracking
        this.startTime = performance.now();
        this.loadTimes = new Map();
        this.batchTimes = [];
        this.imageLoadTimes = [];
        
        // Error tracking
        this.errors = new Map();
        this.layerErrors = new Map();
        
        // Counters
        this.counts = {
            imagesLoaded: 0,
            imagesFailed: 0,
            squaresLoaded: 0,
            squaresFailed: 0,
            batchesProcessed: 0
        };
        
        // Current state
        this.currentZoom = null;
        
        // Memory tracking (if available)
        this.memoryInfo = null;
        this.memoryCheckInterval = null;
        
        // HUD elements
        this.hudElement = null;
        this.hudVisible = this.isDevMode;
        
        this.initialize();
    }
    
    /**
     * Initialize metrics and create HUD if in dev mode
     */
    initialize() {
        if (this.isDevMode) {
            this._createHUD();
            this._startMemoryMonitoring();
        }
        
        // Metrics initialized
    }
    
    /**
     * Create developer HUD
     */
    _createHUD() {
        this.hudElement = document.createElement('div');
        this.hudElement.id = 'map-metrics-hud';
        this.hudElement.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            font-family: 'Courier New', monospace;
            font-size: 11px;
            padding: 10px;
            border-radius: 5px;
            border: 1px solid #333;
            z-index: 10000;
            min-width: 200px;
            line-height: 1.3;
            display: ${this.hudVisible ? 'block' : 'none'};
        `;
        
        document.body.appendChild(this.hudElement);
        
        // Add toggle button
        const toggleButton = document.createElement('button');
        toggleButton.textContent = 'M';
        toggleButton.style.cssText = `
            position: fixed;
            top: 10px;
            right: 220px;
            width: 20px;
            height: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #333;
            border-radius: 3px;
            cursor: pointer;
            font-size: 10px;
            z-index: 10001;
        `;
        
        toggleButton.addEventListener('click', () => {
            this.hudVisible = !this.hudVisible;
            this.hudElement.style.display = this.hudVisible ? 'block' : 'none';
        });
        
        document.body.appendChild(toggleButton);
        
        // Start HUD updates
        this._updateHUD();
    }
    
    /**
     * Update HUD display
     */
    _updateHUD() {
        if (!this.hudElement || !this.hudVisible) return;
        
        const uptime = ((performance.now() - this.startTime) / 1000).toFixed(1);
        const avgLoadTime = this._getAverageLoadTime();
        const avgBatchTime = this._getAverageBatchTime();
        const errorRate = this._getErrorRate();
        
        this.hudElement.innerHTML = `
            <div style="color: #ffff00; font-weight: bold; margin-bottom: 5px;">MAP METRICS</div>
            <div>Zoom Level: ${this.currentZoom !== null ? this.currentZoom : 'N/A'}</div>
            <div>Uptime: ${uptime}s</div>
            <div>Loaded Squares: ${this.counts.squaresLoaded}</div>
            <div>Failed Squares: ${this.counts.squaresFailed}</div>
            <div>Images Loaded: ${this.counts.imagesLoaded}</div>
            <div>Images Failed: ${this.counts.imagesFailed}</div>
            <div>Batches: ${this.counts.batchesProcessed}</div>
            <div>Avg Load: ${avgLoadTime}ms</div>
            <div>Avg Batch: ${avgBatchTime}ms</div>
            <div>Error Rate: ${errorRate}%</div>
            ${this.memoryInfo ? `<div>Memory: ${this.memoryInfo.usedJSHeapSize / 1024 / 1024 | 0}MB</div>` : ''}
        `;
        
        // Update every second
        setTimeout(() => this._updateHUD(), 1000);
    }
    
    /**
     * Start memory monitoring (if available)
     */
    _startMemoryMonitoring() {
        if (performance.memory) {
            this.memoryCheckInterval = setInterval(() => {
                this.memoryInfo = {
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                };
            }, 5000);
        }
    }
    
    /**
     * Record square load time
     * @param {string} squareId - Square ID
     * @param {number} loadTime - Load time in milliseconds
     */
    recordSquareLoadTime(squareId, loadTime) {
        this.loadTimes.set(squareId, loadTime);
        this.counts.squaresLoaded++;
        
        if (this.isDevMode) {
            console.log(`[metrics] Square ${squareId} loaded in ${loadTime.toFixed(1)}ms`);
        }
    }
    
    /**
     * Record batch processing time
     * @param {number} batchTime - Batch time in milliseconds
     */
    recordBatchTime(batchTime) {
        this.batchTimes.push(batchTime);
        this.counts.batchesProcessed++;
        
        // Keep only last 50 batch times
        if (this.batchTimes.length > 50) {
            this.batchTimes.shift();
        }
        
        if (this.isDevMode && batchTime > 100) {
            console.warn(`[metrics] Slow batch: ${batchTime.toFixed(1)}ms`);
        }
    }
    
    /**
     * Record image load time
     * @param {number} loadTime - Load time in milliseconds
     */
    recordImageLoadTime(loadTime) {
        this.imageLoadTimes.push(loadTime);
        this.counts.imagesLoaded++;
        
        // Keep only last 100 image load times
        if (this.imageLoadTimes.length > 100) {
            this.imageLoadTimes.shift();
        }
    }
    
    /**
     * Record load error
     * @param {string} squareId - Square ID
     * @param {Error} error - Error object
     */
    recordLoadError(squareId, error) {
        this.errors.set(squareId, {
            error: error.message,
            timestamp: Date.now()
        });
        this.counts.squaresFailed++;
        
        console.error(`[metrics] Load error for ${squareId}:`, error);
    }
    
    /**
     * Record layer error
     * @param {string} squareId - Square ID
     * @param {string} layerName - Layer name
     * @param {Error} error - Error object
     */
    recordLayerError(squareId, layerName, error) {
        const key = `${squareId}-${layerName}`;
        this.layerErrors.set(key, {
            error: error.message,
            timestamp: Date.now()
        });
        this.counts.imagesFailed++;
        
        console.warn(`[metrics] Layer error for ${squareId}/${layerName}:`, error);
    }
    
    /**
     * Get average load time
     * @returns {string} Average load time formatted
     */
    _getAverageLoadTime() {
        if (this.loadTimes.size === 0) return '0';
        
        const times = Array.from(this.loadTimes.values());
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        return avg.toFixed(1);
    }
    
    /**
     * Get average batch time
     * @returns {string} Average batch time formatted
     */
    _getAverageBatchTime() {
        if (this.batchTimes.length === 0) return '0';
        
        const avg = this.batchTimes.reduce((sum, time) => sum + time, 0) / this.batchTimes.length;
        return avg.toFixed(1);
    }
    
    /**
     * Get error rate percentage
     * @returns {string} Error rate formatted
     */
    _getErrorRate() {
        const total = this.counts.squaresLoaded + this.counts.squaresFailed;
        if (total === 0) return '0';
        
        const rate = (this.counts.squaresFailed / total) * 100;
        return rate.toFixed(1);
    }
    
    /**
     * Get comprehensive metrics report
     * @returns {Object} Metrics report
     */
    getReport() {
        const uptime = performance.now() - this.startTime;
        const avgLoadTime = this._getAverageLoadTime();
        const avgBatchTime = this._getAverageBatchTime();
        const errorRate = this._getErrorRate();
        
        return {
            uptime: uptime,
            uptimeFormatted: `${(uptime / 1000).toFixed(1)}s`,
            currentZoom: this.currentZoom,
            counts: { ...this.counts },
            performance: {
                averageLoadTime: parseFloat(avgLoadTime),
                averageBatchTime: parseFloat(avgBatchTime),
                errorRate: parseFloat(errorRate),
                totalLoadTimes: this.loadTimes.size,
                totalBatches: this.batchTimes.length,
                totalImageLoads: this.imageLoadTimes.length
            },
            memory: this.memoryInfo,
            errors: {
                totalErrors: this.errors.size,
                totalLayerErrors: this.layerErrors.size,
                recentErrors: Array.from(this.errors.entries()).slice(-5)
            }
        };
    }
    
    /**
     * Log performance summary to console
     */
    logSummary() {
        const report = this.getReport();
        
        console.group('[metrics] Performance Summary');
        console.log('Uptime:', report.uptimeFormatted);
        console.log('Loaded Squares:', report.counts.squaresLoaded);
        console.log('Failed Squares:', report.counts.squaresFailed);
        console.log('Images Loaded:', report.counts.imagesLoaded);
        console.log('Images Failed:', report.counts.imagesFailed);
        console.log('Average Load Time:', report.performance.averageLoadTime + 'ms');
        console.log('Average Batch Time:', report.performance.averageBatchTime + 'ms');
        console.log('Error Rate:', report.performance.errorRate + '%');
        
        if (report.memory) {
            console.log('Memory Used:', Math.round(report.memory.usedJSHeapSize / 1024 / 1024) + 'MB');
        }
        
        if (report.errors.totalErrors > 0) {
            console.group('Recent Errors');
            report.errors.recentErrors.forEach(([squareId, errorData]) => {
                console.log(`${squareId}:`, errorData.error);
            });
            console.groupEnd();
        }
        
        console.groupEnd();
    }
    
    /**
     * Reset all metrics
     */
    reset() {
        this.startTime = performance.now();
        this.loadTimes.clear();
        this.batchTimes = [];
        this.imageLoadTimes = [];
        this.errors.clear();
        this.layerErrors.clear();
        
        this.counts = {
            imagesLoaded: 0,
            imagesFailed: 0,
            squaresLoaded: 0,
            squaresFailed: 0,
            batchesProcessed: 0
        };
        
        // Reset all metrics
    }
    
    /**
     * Update current zoom level
     * @param {number} zoom - Current zoom level
     */
    updateZoomLevel(zoom) {
        this.currentZoom = zoom;
    }
    
    /**
     * Cleanup metrics (remove HUD, stop monitoring)
     */
    cleanup() {
        if (this.hudElement) {
            this.hudElement.remove();
            this.hudElement = null;
        }
        
        if (this.memoryCheckInterval) {
            clearInterval(this.memoryCheckInterval);
            this.memoryCheckInterval = null;
        }
        
        // Cleaned up
    }
    
    /**
     * Check if metrics are in dev mode
     * @returns {boolean} True if in dev mode
     */
    isDev() {
        return this.isDevMode;
    }
    
    /**
     * Toggle HUD visibility
     */
    toggleHUD() {
        this.hudVisible = !this.hudVisible;
        if (this.hudElement) {
            this.hudElement.style.display = this.hudVisible ? 'block' : 'none';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MapMetrics;
}
