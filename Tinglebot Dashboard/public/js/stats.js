/* ============================================================================ */
/* Stats Dashboard Script                                                       */
/* Handles initialization and rendering of character statistics charts,        */
/* activity logs, and navigation between dashboard and stats sections.         */
/* ============================================================================ */

// Chart.js is loaded globally via CDN in index.html
// Register ChartDataLabels plugin if available
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// ============================================================================
// ------------------- State Management -------------------
// ============================================================================

// Chart instances for reuse or cleanup
let villageChart = null;
let raceChart = null;
let jobChart = null;
let hwqTypeChart = null;
let hwqNPCChart = null;

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// Helper: Check if device is mobile
function isMobileDevice() {
    return window.innerWidth <= 768;
}

// Helper: Check if browser is Firefox
function isFirefoxBrowser() {
    return navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
}

// Helper: Check if device is tablet (like Surface Pro)
function isTabletDevice() {
    return window.innerWidth > 768 && window.innerWidth <= 1024;
}

// Helper: Format debuff end date as next midnight
function formatDebuffEndMidnight(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date.toLocaleString();
}

// Helper: Validate and clean data object
function cleanDataObject(data, type = 'unknown') {
    const cleaned = {};
    Object.entries(data || {}).forEach(([key, value]) => {
        const isValid = key && 
            key !== 'undefined' && 
            key !== 'null' && 
            key !== 'Unknown' && 
            key !== 'unknown' &&
            key !== undefined &&
            key !== null &&
            typeof key === 'string' &&
            key.trim() !== '' &&
            !key.toLowerCase().includes('undefined') &&
            !key.toLowerCase().includes('null') &&
            typeof value === 'number' && 
            value > 0;
        
        if (isValid) {
            // Special handling for race data: combine Dragon and dragon
            if (type === 'race') {
                const normalizedKey = key.toLowerCase() === 'dragon' ? 'Dragon' : key;
                if (cleaned[normalizedKey]) {
                    cleaned[normalizedKey] += value;
                } else {
                    cleaned[normalizedKey] = value;
                }
            } else {
                cleaned[key] = value;
            }
        }
    });
    return cleaned;
}

// ============================================================================
// ------------------- Chart Configuration -------------------
// ============================================================================

// Helper: Get responsive chart options
function getResponsiveChartOptions() {
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();
    const fontSize = isMobile ? 10 : (isTablet ? 11 : 12);
    const titleSize = isMobile ? 11 : (isTablet ? 12 : 13);
    const padding = isMobile ? 5 : (isTablet ? 8 : 10);
    
    return {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: { 
                top: padding, 
                bottom: padding 
            }
        },
        plugins: {
            legend: { 
                display: false,
                position: 'bottom',
                labels: {
                    color: '#FFFFFF',
                    font: { size: fontSize },
                    padding: isMobile ? 10 : (isTablet ? 12 : 15),
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            title: {
                display: false
            },
            tooltip: {
                backgroundColor: '#333',
                titleColor: '#fff',
                bodyColor: '#ddd',
                borderColor: '#555',
                borderWidth: 1,
                titleFont: { size: titleSize },
                bodyFont: { size: fontSize },
                callbacks: {
                    title: function(context) {
                        return context[0].label || 'Unknown';
                    },
                    label: function(context) {
                        return context.parsed.y || 0;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    color: '#FFFFFF',
                    font: { size: fontSize }
                },
                grid: {
                    color: 'rgba(255, 255, 255, 0.1)'
                }
            },
            x: {
                ticks: {
                    color: '#FFFFFF',
                    font: { size: fontSize }
                },
                grid: {
                    display: false
                }
            }
        },
        animation: {
            duration: isMobile ? 600 : (isTablet ? 700 : 800),
            easing: 'easeOutQuart'
        }
    };
}

// Helper: Get responsive pie chart options
function getResponsivePieChartOptions() {
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();
    const fontSize = isMobile ? 10 : (isTablet ? 11 : 12);
    const titleSize = isMobile ? 11 : (isTablet ? 12 : 13);
    const padding = isMobile ? 5 : (isTablet ? 8 : 10);
    
    return {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
            padding: { 
                top: padding, 
                bottom: padding 
            }
        },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                labels: {
                    color: '#FFFFFF',
                    font: { size: fontSize },
                    padding: isMobile ? 10 : (isTablet ? 12 : 15),
                    usePointStyle: true,
                    pointStyle: 'circle'
                }
            },
            title: {
                display: false
            },
            tooltip: {
                backgroundColor: '#333',
                titleColor: '#fff',
                bodyColor: '#ddd',
                borderColor: '#555',
                borderWidth: 1,
                titleFont: { size: titleSize },
                bodyFont: { size: fontSize },
                callbacks: {
                    label: function(context) {
                        const label = context.label || '';
                        const value = context.parsed;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        },
        animation: {
            duration: isMobile ? 600 : (isTablet ? 700 : 800),
            easing: 'easeOutQuart'
        }
    };
}

// ============================================================================
// ------------------- Chart Creation Functions -------------------
// ============================================================================

// Function: Create bar chart with modern styling and rounded bars
function createBarChart(ctx, data, options = {}) {
    const {
        labelTransform = v => v,
        colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'],
        yMax = null
    } = options;

    const cleanedData = cleanDataObject(data, 'chart');
    const labels = Object.keys(cleanedData).map(label => {
        try {
            const transformed = labelTransform(label);
            return transformed || 'Unknown';
        } catch (error) {
            return 'Unknown';
        }
    });
    const values = Object.values(cleanedData);
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();

    const chartConfig = {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderRadius: isMobile ? 4 : (isTablet ? 6 : 8),
                barPercentage: isMobile ? 0.8 : (isTablet ? 0.78 : 0.75),
                categoryPercentage: isMobile ? 0.9 : (isTablet ? 0.88 : 0.85)
            }]
        },
        options: getResponsiveChartOptions()
    };

    // Override y-axis max if specified
    if (yMax !== null) {
        chartConfig.options.scales.y.max = yMax;
    }

    // Add datalabels plugin if available
    if (typeof ChartDataLabels !== 'undefined') {
        const labelSize = isMobile ? 10 : (isTablet ? 11 : 12);
        chartConfig.options.plugins.datalabels = {
            anchor: 'end',
            align: 'top',
            color: '#FFFFFF',
            font: {
                weight: 'bold',
                size: labelSize
            },
            formatter: (value) => {
                if (value === undefined || value === null || value === 'undefined' || value === 'null') {
                    return '';
                }
                return value;
            },
            display: (context) => {
                const value = context.dataset.data[context.dataIndex];
                return value !== undefined && value !== null && value !== 'undefined' && value !== 'null';
            }
        };
        chartConfig.plugins = [ChartDataLabels];
    }

    return new Chart(ctx, chartConfig);
}

// Function: Create pie chart with modern styling and labels
function createPieChart(ctx, data, options = {}) {
    const {
        labelTransform = v => v,
        colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF']
    } = options;

    const cleanedData = cleanDataObject(data, 'pie');
    const labels = Object.keys(cleanedData).map(labelTransform);
    const values = Object.values(cleanedData);
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();

    const chartConfig = {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: isMobile ? 1 : (isTablet ? 1.5 : 2),
                borderColor: '#1a1a1a'
            }]
        },
        options: getResponsivePieChartOptions()
    };

    // Add datalabels plugin with bigger, bolder text
    if (typeof ChartDataLabels !== 'undefined') {
        const labelSize = isMobile ? 8 : (isTablet ? 10 : 12);
        chartConfig.options.plugins.datalabels = {
            color: '#000000',
            font: {
                weight: 'bold',
                size: labelSize
            },
            anchor: 'center',
            align: 'center',
            offset: 0,
            formatter: (value, context) => {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${value}\n(${percentage}%)`;
            }
        };
        chartConfig.plugins = [ChartDataLabels];
    }

    return new Chart(ctx, chartConfig);
}

// ============================================================================
// ------------------- Responsive Chart Management -------------------
// ============================================================================

// Function: Update charts on window resize
function updateChartsOnResize() {
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();
    
    // Update chart containers height based on screen size
    const chartContainers = document.querySelectorAll('.chart-container');
    chartContainers.forEach(container => {
        if (isMobile) {
            container.style.height = '250px';
        } else if (isTablet) {
            container.style.height = '350px';
        } else {
            container.style.height = '400px';
        }
    });
    
    // Update pie chart layout for responsive design
    const villageChartContainer = document.querySelector('#villageDistributionChart')?.parentElement?.parentElement;
    if (villageChartContainer && villageChartContainer.style.display === 'flex') {
        // Adjust flex layout based on device
        if (isMobile) {
            villageChartContainer.style.flexDirection = 'column';
            villageChartContainer.style.gap = '1rem';
        } else if (isTablet) {
            villageChartContainer.style.flexDirection = 'row';
            villageChartContainer.style.gap = '1.5rem';
        } else {
            villageChartContainer.style.flexDirection = 'row';
            villageChartContainer.style.gap = '2rem';
        }
    }
    
    // Recreate charts if they exist - but only if we're not already in the middle of initialization
    if ((villageChart || raceChart || jobChart) && !window.statsInitializing) {
        window.statsInitializing = true;
        initStatsPage().finally(() => {
            window.statsInitializing = false;
        });
    } else {
        // Apply Firefox fixes even if charts don't exist
        applyFirefoxFixes();
    }
}

// Add window resize listener with debouncing
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(updateChartsOnResize, 250);
});

// ============================================================================
// ------------------- Firefox Compatibility Functions -------------------
// ============================================================================

// Function: Apply Firefox-specific fixes to stats tables
function applyFirefoxFixes() {
    if (!isFirefoxBrowser()) return;
    
    console.log('🔥 Applying Firefox compatibility fixes...');
    
    // Add Firefox class to body for CSS targeting
    document.body.classList.add('firefox-browser');
    
    // Find all stats table containers
    const tableContainers = document.querySelectorAll('.stats-table-container');
    
    console.log(`📊 Found ${tableContainers.length} table containers`);
    
    tableContainers.forEach((container, containerIndex) => {
        // Add Firefox-specific class
        container.classList.add('firefox-compat');
        
        // Force flexbox layout for Firefox
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.justifyContent = 'flex-start';
        container.style.alignItems = 'stretch';
        container.style.gap = '1.5rem';
        
        // Ensure proper flexbox layout for Firefox
        const tables = container.querySelectorAll('.stats-table');
        console.log(`  Container ${containerIndex}: Found ${tables.length} tables`);
        
        tables.forEach((table, index) => {
            // Add specific Firefox styling - fixed 458px width
            table.style.flex = '0 0 458px';
            table.style.minWidth = '458px';
            table.style.maxWidth = '458px';
            table.style.width = '458px';
            table.style.marginBottom = '0';
            table.style.boxSizing = 'border-box';
            table.style.tableLayout = 'auto';
            table.style.overflow = 'visible';
            
            // Fix table cell overflow issues
            const cells = table.querySelectorAll('td, th');
            cells.forEach(cell => {
                cell.style.maxWidth = 'none';
                cell.style.whiteSpace = 'normal';
                cell.style.overflow = 'visible';
                cell.style.textOverflow = 'clip';
                cell.style.wordBreak = 'normal';
                cell.style.overflowWrap = 'normal';
                cell.style.padding = '0.6rem 0.75rem';
                cell.style.boxSizing = 'border-box';
                cell.style.minWidth = 'auto';
                cell.style.width = 'auto';
            });
        });
    });
    
    // Fix visiting villages grid layout for Firefox
    const visitingGrids = document.querySelectorAll('.visiting-villages-grid, .jail-villages-grid');
    console.log(`🏘️ Found ${visitingGrids.length} village grids`);
    
    visitingGrids.forEach((grid, gridIndex) => {
        // Force horizontal flexbox layout
        grid.style.display = 'flex';
        grid.style.flexDirection = 'row';
        grid.style.flexWrap = 'wrap';
        grid.style.justifyContent = 'flex-start';
        grid.style.alignItems = 'stretch';
        grid.style.gap = '2rem';
        
        // Fix individual village cards
        const villages = grid.querySelectorAll('.visiting-village, .jail-village');
        console.log(`  Grid ${gridIndex}: Found ${villages.length} village cards`);
        
        villages.forEach(village => {
            village.style.flex = '1 1 300px';
            village.style.minWidth = '300px';
            village.style.maxWidth = 'calc(33.333% - 1.33rem)';
            village.style.boxSizing = 'border-box';
        });
    });
    
    console.log('✅ Firefox fixes applied successfully');
}

// Function: Apply Firefox-specific fixes to chart containers
function applyFirefoxChartFixes() {
    if (!isFirefoxBrowser()) return;
    
    console.log('🔥 Applying Firefox chart compatibility fixes...');
    
    // Fix chart containers
    const chartContainers = document.querySelectorAll('.chart-container');
    chartContainers.forEach(container => {
        container.style.position = 'relative';
        container.style.overflow = 'visible';
        container.style.width = '100%';
        container.style.height = 'auto';
        container.style.minHeight = '300px';
    });
    
    // Fix canvas elements
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
        canvas.style.maxWidth = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
    });
    
    console.log('✅ Firefox chart fixes applied successfully');
}

// ============================================================================
// ------------------- HTML Generation Functions -------------------
// ============================================================================

// Helper: Generate stats table HTML
function generateStatsTable(title, headers, data) {
    if (!data || data.length === 0) {
        return `<tr><td colspan="${headers.length}">None</td></tr>`;
    }
    
    return data.map(row => {
        const cells = Array.isArray(row) ? row : Object.values(row);
        return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
    }).join('');
}

// Helper: Generate character stats section
function generateCharacterStatsSection(data) {
    return `
        <div class="stats-table-section">
            <h4 class="stats-section-header"><i class="fas fa-users"></i> General</h4>
            <div class="stats-table-container">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Character Statistics</th>
                        </tr>
                        <tr>
                            <th>Stat</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Total Characters</strong></td>
                            <td>${data.totalCharacters || 0}</td>
                        </tr>
                        ${data.modCharacterStats ? `<tr>
                            <td><strong>Mod Characters</strong></td>
                            <td>${data.modCharacterStats.totalModCharacters || 0}</td>
                        </tr>` : ''}
                        <tr>
                            <td><strong>Jailed Characters</strong></td>
                            <td>${data.jailedCount || 0}</td>
                        </tr>
                    </tbody>
                </table>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Upcoming Birthdays</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Birthday</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(data.upcomingBirthdays || []).length
                            ? data.upcomingBirthdays.map(b => `<tr><td>${b.name}</td><td>${b.birthday}</td></tr>`).join('')
                            : '<tr><td colspan="2">None in next 30 days</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Helper: Generate status effects section
function generateStatusEffectsSection(data) {
    return `
        <div class="stats-table-section">
            <h4 class="stats-section-header"><i class="fas fa-exclamation-triangle"></i> Status Effects</h4>
            <div class="stats-table-container">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">KO'd Characters</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(data.kodCharacters && data.kodCharacters.length > 0)
                            ? data.kodCharacters.map(char => `<tr><td colspan="2">${char.name}</td></tr>`).join('')
                            : '<tr><td colspan="2">None</td></tr>'
                        }
                    </tbody>
                </table>
                
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Blighted Characters</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Blighted At</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(data.blightedCharacters && data.blightedCharacters.length > 0)
                            ? data.blightedCharacters.map(char => `
                                <tr>
                                    <td>${char.name}</td>
                                    <td>${char.blightedAt ? new Date(char.blightedAt).toLocaleString() : '—'}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="2">None</td></tr>'
                        }
                    </tbody>
                </table>
                
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Debuffed Characters</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Debuff Ends</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(data.debuffedCharacters && data.debuffedCharacters.length > 0)
                            ? data.debuffedCharacters.map(char => `
                                <tr>
                                    <td>${char.name}</td>
                                    <td>${char.debuff && char.debuff.endDate ? formatDebuffEndMidnight(char.debuff.endDate) : '—'}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="2">None</td></tr>'
                        }
                    </tbody>
                </table>
                
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Jailed Characters</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Release Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(data.jailedCharacters && data.jailedCharacters.length > 0)
                            ? data.jailedCharacters.map(char => `
                                <tr>
                                    <td>${char.name}</td>
                                    <td>${char.jailReleaseTime ? new Date(char.jailReleaseTime).toLocaleString() : '—'}</td>
                                </tr>
                            `).join('')
                            : '<tr><td colspan="2">None</td></tr>'
                        }
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Helper: Generate top stats section
function generateTopStatsSection(data) {
    const createTopStatTable = (title, statData) => {
        if (!statData?.names || statData.names.length === 0) {
            return `<tr><td colspan="2">No data</td></tr>`;
        }
        
        return statData.names.map((name, index) => `
            <tr>
                <td>${name}</td>
                <td>${statData.values ? statData.values[index] : statData.value || 0}</td>
            </tr>
        `).join('');
    };

    return `
        <div class="stats-table-section">
            <h4 class="stats-section-header"><i class="fas fa-trophy"></i> Top Stats</h4>
            <div class="stats-table-container">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Most Stamina</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Stamina</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${createTopStatTable('Most Stamina', data.mostStaminaChar)}
                    </tbody>
                </table>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Most Hearts</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Hearts</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${createTopStatTable('Most Hearts', data.mostHeartsChar)}
                    </tbody>
                </table>
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Most Spirit Orbs</th>
                        </tr>
                        <tr>
                            <th>Character</th>
                            <th>Spirit Orbs</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${createTopStatTable('Most Spirit Orbs', data.mostOrbsChar)}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Helper: Generate mod character statistics section
function generateModCharacterStatsSection(data) {
    if (!data.modCharacterStats) return '';
    
    const modStats = data.modCharacterStats;
    const modTypes = modStats.modCharactersPerType || {};
    const modVillages = modStats.modCharactersPerVillage || {};
    
    return `
        <div class="stats-card-wide mod-characters-section">
            <h3><i class="fas fa-crown"></i> Mod Character Statistics</h3>
            <div class="mod-stats-grid">
                <div class="mod-stats-item">
                    <h4>Mod Types</h4>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.keys(modTypes).length > 0 
                                ? Object.entries(modTypes).map(([type, count]) => `
                                    <tr>
                                        <td>${type.charAt(0).toUpperCase() + type.slice(1)}</td>
                                        <td>${count}</td>
                                    </tr>
                                `).join('')
                                : '<tr><td colspan="2">No mod types available</td></tr>'
                            }
                        </tbody>
                    </table>
                </div>
                <div class="mod-stats-item">
                    <h4>Mod Characters by Village</h4>
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>Village</th>
                                <th>Count</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.keys(modVillages).length > 0 
                                ? Object.entries(modVillages).map(([village, count]) => `
                                    <tr>
                                        <td>${village.charAt(0).toUpperCase() + village.slice(1)}</td>
                                        <td>${count}</td>
                                    </tr>
                                `).join('')
                                : '<tr><td colspan="2">No village data</td></tr>'
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

// Helper: Generate visiting characters section
function generateVisitingCharactersSection(data) {
    const visitingDetails = data.visitingDetails || {};
    
    return `
        <div class="stats-card-wide visiting-characters-section">
            <h3>Visiting Characters</h3>
            <div class="visiting-villages-grid">
                ${Object.entries(visitingDetails).map(([village, characters]) => `
                    <div class="visiting-village ${village.toLowerCase()}">
                        <h4>${village.charAt(0).toUpperCase() + village.slice(1)} (${characters.length})</h4>
                        ${characters.length > 0 ? `
                            <table class="stats-table">
                                <tr>
                                    <th>Character</th>
                                    <th>Home Village</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${characters.map(char => `
                                    <tr>
                                        <td>${char.name}</td>
                                        <td>${char.homeVillage.charAt(0).toUpperCase() + char.homeVillage.slice(1)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    ` : '<p style="color: #aaa; text-align: center; margin: 1rem 0;">No visitors</p>'}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Helper: Generate jail status section
function generateJailStatusSection(data) {
    const jailedCharacters = data.jailedCharacters || [];
    
    if (jailedCharacters.length === 0) {
        return `
            <div class="stats-card-wide jail-status-section">
                <h3><i class="fas fa-lock"></i> Jail Status</h3>
                <p style="color: #aaa; text-align: center; margin: 1rem 0;">No characters are currently in jail</p>
            </div>
        `;
    }
    
    // Group jailed characters by current village
    const jailedByVillage = {};
    jailedCharacters.forEach(char => {
        const village = char.currentVillage || char.homeVillage || 'Unknown';
        if (!jailedByVillage[village]) {
            jailedByVillage[village] = [];
        }
        jailedByVillage[village].push(char);
    });
    
    return `
        <div class="stats-card-wide jail-status-section">
            <h3><i class="fas fa-lock"></i> Jail Status (${jailedCharacters.length})</h3>
            <div class="jail-villages-grid">
                ${Object.entries(jailedByVillage).map(([village, characters]) => `
                    <div class="jail-village ${village.toLowerCase()}">
                        <h4>${village.charAt(0).toUpperCase() + village.slice(1)} Jail (${characters.length})</h4>
                        <table class="stats-table">
                            <thead>
                                <tr>
                                    <th>Character</th>
                                    <th>Home Village</th>
                                    <th>Release Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${characters.map(char => `
                                    <tr>
                                        <td>${char.name}</td>
                                        <td>${char.homeVillage ? char.homeVillage.charAt(0).toUpperCase() + char.homeVillage.slice(1) : '—'}</td>
                                        <td>${char.jailReleaseTime ? new Date(char.jailReleaseTime).toLocaleString() : '—'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ============================================================================
// ------------------- Chart Initialization Functions -------------------
// ============================================================================

// Helper: Generate pie chart breakdown HTML
function generatePieChartBreakdown(data, title, colors) {
    const cleanedData = cleanDataObject(data);
    const total = Object.values(cleanedData).reduce((sum, value) => sum + value, 0);
    const isMobile = isMobileDevice();
    
    if (Object.keys(cleanedData).length === 0) {
        return '<div class="breakdown-empty">No data available</div>';
    }
    
    // Create a mapping of village names to their colors in the same order as the pie chart
    const villageColorMapping = {};
    Object.keys(cleanedData).forEach((village, index) => {
        villageColorMapping[village] = colors[index];
    });
    
    const breakdownItems = Object.entries(cleanedData)
        .sort(([,a], [,b]) => b - a) // Sort by value descending
        .map(([label, value]) => {
            const percentage = ((value / total) * 100).toFixed(1);
            // Use the exact same color as the pie chart for this village
            const color = villageColorMapping[label] || '#999999';
            return `
                <div class="breakdown-item">
                    <div class="breakdown-color" style="background-color: ${color}"></div>
                    <div class="breakdown-info">
                        <div class="breakdown-label">${label.charAt(0).toUpperCase() + label.slice(1)}</div>
                        <div class="breakdown-stats">
                            <span class="breakdown-value">${value}</span>
                            <span class="breakdown-percentage">(${percentage}%)</span>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');
    
    return `
        <div class="pie-breakdown">
            <div class="breakdown-header">
                <div class="breakdown-total">Total: ${total}</div>
            </div>
            <div class="breakdown-list">
                ${breakdownItems}
            </div>
        </div>
    `;
}

// Function: Initialize village distribution chart
function initializeVillageChart(data) {
    const villageData = data.charactersPerVillage || {};
    const colors = ['#EF9A9A', '#9FB7F2', '#98D8A7']; // Red for Rudania, Blue for Inariko, Green for Vhintl
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();
    
    // Get the canvas element first
    let canvas = document.getElementById('villageDistributionChart');
    if (!canvas) {
        console.error('Village distribution chart canvas not found');
        return;
    }
    
    // Update chart container to include breakdown
    const chartContainer = canvas.parentElement;
    
    // Clear container completely to prevent any duplicates
    chartContainer.innerHTML = '';
    
    // Reset container styles
    chartContainer.style.display = 'flex';
    chartContainer.style.gap = isMobile ? '1rem' : (isTablet ? '1.5rem' : '2rem');
    chartContainer.style.alignItems = 'flex-start';
    chartContainer.style.flexDirection = isMobile ? 'column' : 'row';
    
    // Create chart wrapper
    const chartWrapper = document.createElement('div');
    chartWrapper.style.flex = '1';
    chartWrapper.style.minHeight = isMobile ? '250px' : (isTablet ? '300px' : '300px');
    
    // Move canvas to wrapper
    chartWrapper.appendChild(canvas);
    
    // Create breakdown section with village-specific colors
    const breakdownWrapper = document.createElement('div');
    breakdownWrapper.style.flex = '1';
    breakdownWrapper.innerHTML = generatePieChartBreakdown(villageData, 'Village Distribution', colors);
    
    // Add new structure to container
    chartContainer.appendChild(chartWrapper);
    chartContainer.appendChild(breakdownWrapper);
    
    // Create chart with consistent color mapping
    const villageCtx = canvas.getContext('2d');
    villageChart = createPieChart(villageCtx, villageData, {
        labelTransform: v => v.charAt(0).toUpperCase() + v.slice(1),
        colors: colors
    });
}

// Function: Initialize race distribution chart
function initializeRaceChart(data) {
    const raceCtx = document.getElementById('raceDistributionChart').getContext('2d');
    const raceData = cleanDataObject(data.charactersPerRace, 'race');
    
    if (Object.keys(raceData).length === 0) {
        document.querySelector('#raceDistributionChart').parentElement.innerHTML =
            '<div style="text-align: center; color: #FFFFFF; padding: 20px;">No valid race data available</div>';
        return;
    }
    
    // Sort race data by count (largest to smallest)
    const sortedRaceData = Object.fromEntries(
        Object.entries(raceData).sort(([,a], [,b]) => b - a)
    );
    
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();
    raceChart = createBarChart(raceCtx, sortedRaceData, {
        labelTransform: v => v || 'Unknown',
        colors: [
            '#FF9999', '#FFD27A', '#FFF066', '#A6F29A', '#6EEEDD', '#8FCBFF',
            '#B89CFF', '#F78CD2', '#8CE6C0', '#FFDB66', '#BFBFBF'
        ],
        yMax: isMobile ? 30 : (isTablet ? 32 : 35)
    });
}

// Function: Initialize job distribution chart
function initializeJobChart(data) {
    const jobCtx = document.getElementById('jobDistributionChart').getContext('2d');
    const jobData = cleanDataObject(data.charactersPerJob, 'job');
    
    if (Object.keys(jobData).length === 0) {
        document.querySelector('#jobDistributionChart').parentElement.innerHTML =
            '<div style="text-align: center; color: #FFFFFF; padding: 20px;">No valid job data available</div>';
        return;
    }
    
    // Sort job data by count (largest to smallest)
    const sortedJobData = Object.fromEntries(
        Object.entries(jobData).sort(([,a], [,b]) => b - a)
    );
    
    const isMobile = isMobileDevice();
    const isTablet = isTabletDevice();
    jobChart = createBarChart(jobCtx, sortedJobData, {
        labelTransform: v => v || 'Unknown',
        colors: [
            '#FF9999', '#FFD27A', '#FFF066', '#A6F29A', '#6EEEDD',
            '#8FCBFF', '#B89CFF', '#F78CD2', '#8CE6C0', '#FFDB66',
            '#BFBFBF', '#D6AEFA', '#7BEFC3', '#FFC3A0', '#AAB6FF', '#FFB3B3'
        ],
        yMax: isMobile ? 12 : (isTablet ? 13 : 15)
    });
}

// ============================================================================
// ------------------- Main Initialization Function -------------------
// ============================================================================

// Function: Initialize stats page - fetches data and renders all charts
async function initStatsPage() {
    // Prevent multiple simultaneous initializations
    if (window.statsInitializing) {
        return;
    }
    
    try {
        window.statsInitializing = true;
        // Fetch stats data with cache-busting
        const timestamp = Date.now();
        const [charRes, hwqRes] = await Promise.all([
            fetch(`/api/stats/characters?t=${timestamp}`),
            fetch(`/api/stats/hwqs?t=${timestamp}`)
        ]);
        
        if (!charRes.ok) throw new Error(`HTTP error! status: ${charRes.status}`);

        const data = await charRes.json();
        if (!data) throw new Error('No data received');
        
        // Fetch HWQ stats
        let hwqData = null;
        if (hwqRes.ok) {
            hwqData = await hwqRes.json();
        }

        // Update total characters card
        const totalCard = document.getElementById('stats-total-characters');
        const totalCardHeader = totalCard.closest('.stats-card-wide')?.querySelector('h3');
        if (totalCardHeader) totalCardHeader.textContent = 'Character Stats';
        totalCard.textContent = '';

        // Generate and append stats sections
        const totalCardParent = totalCard.closest('.stats-card-wide');
        if (totalCardParent) {
            // Remove existing extra stats
            let extraStats = totalCardParent.querySelector('.extra-stats');
            if (extraStats) extraStats.remove();

            // Create new extra stats section
            extraStats = document.createElement('div');
            extraStats.className = 'extra-stats';
            extraStats.style.marginTop = '1.5rem';
            extraStats.innerHTML = 
                generateCharacterStatsSection(data) +
                generateStatusEffectsSection(data) +
                generateTopStatsSection(data);
            
            totalCardParent.appendChild(extraStats);
        }

        // Remove existing sections
        let debuffedSection = document.querySelector('.debuffed-characters-section');
        if (debuffedSection) debuffedSection.remove();

        let visitingSection = document.querySelector('.visiting-characters-section');
        if (visitingSection) visitingSection.remove();
        
        // Add visiting characters section
        visitingSection = document.createElement('div');
        visitingSection.innerHTML = generateVisitingCharactersSection(data);
        
        // Insert after the first stats card
        const firstStatsCard = document.querySelector('#stats-section .stats-card-wide');
        if (firstStatsCard) {
            firstStatsCard.parentNode.insertBefore(visitingSection.firstElementChild, firstStatsCard.nextSibling);
        }
        
        // Add jail status section
        const jailStatusSection = document.createElement('div');
        jailStatusSection.innerHTML = generateJailStatusSection(data);
        
        // Insert after the visiting characters section
        if (visitingSection.firstElementChild) {
            visitingSection.firstElementChild.parentNode.insertBefore(jailStatusSection.firstElementChild, visitingSection.firstElementChild.nextSibling);
        }
        
        // Add mod character statistics section
        const modStatsSection = document.createElement('div');
        modStatsSection.innerHTML = generateModCharacterStatsSection(data);
        
        // Insert after the jail status section
        if (jailStatusSection.firstElementChild) {
            jailStatusSection.firstElementChild.parentNode.insertBefore(modStatsSection.firstElementChild, jailStatusSection.firstElementChild.nextSibling);
        }

        // Clean up existing charts
        if (villageChart) villageChart.destroy();
        if (raceChart) raceChart.destroy();
        if (jobChart) jobChart.destroy();

        // Set responsive chart container heights
        const isMobile = isMobileDevice();
        const isTablet = isTabletDevice();
        const chartContainers = document.querySelectorAll('.chart-container');
        chartContainers.forEach(container => {
            if (isMobile) {
                container.style.height = '250px';
            } else if (isTablet) {
                container.style.height = '350px';
            } else {
                container.style.height = '400px';
            }
        });

        // Initialize all charts
        initializeVillageChart(data);
        initializeRaceChart(data);
        initializeJobChart(data);
        
        // Initialize HWQ stats if data is available
        if (hwqData) {
            initializeHWQStats(hwqData);
        }

        // Apply Firefox-specific fixes (with multiple attempts to ensure DOM is ready)
        applyFirefoxFixes();
        setTimeout(applyFirefoxFixes, 50);
        setTimeout(applyFirefoxFixes, 200);
        
        // Apply Firefox chart fixes
        if (isFirefoxBrowser()) {
            applyFirefoxChartFixes();
        }

    } catch (err) {
        document.getElementById('stats-total-characters').textContent = 'Error';
        console.error('Error loading stats:', err);
    } finally {
        window.statsInitializing = false;
    }
}

// ============================================================================
// ------------------- HWQ Statistics Functions -------------------
// ============================================================================

// Function: Initialize HWQ statistics section
function initializeHWQStats(hwqData) {
    // Render overview stats
    renderHWQOverview(hwqData);
    
    // Initialize charts (removed village chart - all villages post same amount)
    initializeHWQTypeChart(hwqData);
    initializeHWQNPCChart(hwqData);
    
    // Render top completers with detailed stats
    renderHWQTopCompleters(hwqData);
}

// Function: Render HWQ overview statistics
function renderHWQOverview(hwqData) {
    const overviewDiv = document.getElementById('hwq-stats-overview');
    if (!overviewDiv) return;
    
    overviewDiv.innerHTML = `
        <div class="stats-table-section">
            <h4 class="stats-section-header"><i class="fas fa-info-circle"></i> Overview</h4>
            <div class="stats-table-container">
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">General Statistics</th>
                        </tr>
                        <tr>
                            <th>Metric</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><strong>Total Help Wanted Quests</strong></td>
                            <td>${hwqData.totalQuests || 0}</td>
                        </tr>
                        <tr>
                            <td><strong>Completed</strong></td>
                            <td>${hwqData.completedQuests || 0}</td>
                        </tr>
                        <tr>
                            <td><strong>Active</strong></td>
                            <td>${hwqData.activeQuests || 0}</td>
                        </tr>
                        <tr>
                            <td><strong>Completion Rate</strong></td>
                            <td>${hwqData.completionRate}%</td>
                        </tr>
                        <tr>
                            <td><strong>Unique Completers</strong></td>
                            <td>${hwqData.uniqueCompleterCount || 0} users</td>
                        </tr>
                    </tbody>
                </table>
                
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="2">Completion by Type</th>
                        </tr>
                        <tr>
                            <th>Type</th>
                            <th>Rate</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(hwqData.completionRateByType || {})
                            .sort(([,a], [,b]) => b - a)
                            .map(([type, rate]) => `
                                <tr>
                                    <td>${type.charAt(0).toUpperCase() + type.slice(1)}</td>
                                    <td>${rate}%</td>
                                </tr>
                            `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Function: Initialize HWQ type distribution chart
function initializeHWQTypeChart(hwqData) {
    const canvas = document.getElementById('hwqTypeChart');
    if (!canvas) return;
    
    // Hide loading indicator
    const loadingIndicator = canvas.parentElement.querySelector('.chart-loading');
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    
    const ctx = canvas.getContext('2d');
    const typeData = hwqData.questsPerType || {};
    
    if (hwqTypeChart) hwqTypeChart.destroy();
    
    // Calculate dynamic y-axis max: use highest value + 20% buffer, minimum 100
    const maxValue = Math.max(...Object.values(typeData), 0);
    const dynamicMax = Math.max(100, Math.ceil(maxValue * 1.2 / 10) * 10); // Round up to nearest 10
    
    hwqTypeChart = createBarChart(ctx, typeData, {
        labelTransform: v => v.charAt(0).toUpperCase() + v.slice(1),
        colors: [
            '#00bcd4', // Item (cyan)
            '#f44336', // Monster (red)
            '#673ab7', // Escort (purple)
            '#ffc107', // Crafting (gold)
            '#e91e63', // Art (pink)
            '#2196f3'  // Writing (blue)
        ],
        yMax: dynamicMax
    });
}

// Function: Initialize HWQ NPC chart (top requesters)
function initializeHWQNPCChart(hwqData) {
    const canvas = document.getElementById('hwqNPCChart');
    if (!canvas) return;
    
    // Hide loading indicator
    const loadingIndicator = canvas.parentElement.querySelector('.chart-loading');
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    
    const ctx = canvas.getContext('2d');
    const topNPCs = hwqData.topNPCs || [];
    
    if (hwqNPCChart) hwqNPCChart.destroy();
    
    // Convert to object for chart
    const npcData = {};
    topNPCs.forEach(npc => {
        npcData[npc.npc] = npc.count;
    });
    
    // Calculate dynamic y-axis max
    const maxValue = Math.max(...Object.values(npcData), 0);
    const dynamicMax = Math.max(50, Math.ceil(maxValue * 1.2 / 5) * 5); // Round up to nearest 5
    
    hwqNPCChart = createBarChart(ctx, npcData, {
        labelTransform: v => v,
        colors: [
            '#FF9999', '#FFD27A', '#FFF066', '#A6F29A', '#6EEEDD',
            '#8FCBFF', '#B89CFF', '#F78CD2', '#8CE6C0', '#FFDB66'
        ],
        yMax: dynamicMax
    });
}

// Function: Render top completers leaderboard with detailed stats
function renderHWQTopCompleters(hwqData) {
    const completersDiv = document.getElementById('hwq-top-completers');
    if (!completersDiv) return;
    
    const topCompleters = hwqData.topCompleters || [];
    
    if (topCompleters.length === 0) {
        completersDiv.innerHTML = '<p style="text-align: center; color: #aaa;">No completion data available</p>';
        return;
    }
    
    completersDiv.innerHTML = `
        <div class="stats-table-section">
            <h4 class="stats-section-header"><i class="fas fa-trophy"></i> Leaderboard</h4>
            <div class="stats-table-container">
                <!-- Main Leaderboard -->
                <table class="stats-table" style="max-width: 500px;">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>User</th>
                            <th>Quests Completed</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topCompleters.map((completer, index) => {
                            const medals = ['🥇', '🥈', '🥉'];
                            const medal = index < 3 ? medals[index] : '';
                            return `
                                <tr${index < 3 ? ' style="background: rgba(255, 215, 0, 0.08);"' : ''}>
                                    <td style="text-align: center; font-weight: 600; font-size: 1.1rem;">${medal} ${index + 1}</td>
                                    <td><i class="fas fa-user"></i> ${completer.nickname || completer.username}</td>
                                    <td style="text-align: center; font-weight: 700; color: var(--accent-color); font-size: 1.1rem;">${completer.count}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <!-- Favorite Quest Types -->
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="3">Favorite Quest Types</th>
                        </tr>
                        <tr>
                            <th>User</th>
                            <th>Type</th>
                            <th>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topCompleters.slice(0, 5).map((completer) => {
                            const favoriteTypeIcon = completer.favoriteType 
                                ? getQuestTypeIconForStats(completer.favoriteType)
                                : '';
                            const favoriteTypeDisplay = completer.favoriteType
                                ? `${favoriteTypeIcon} ${completer.favoriteType.charAt(0).toUpperCase() + completer.favoriteType.slice(1)}`
                                : '—';
                            
                            // Get count for favorite type
                            const favoriteTypeCount = completer.favoriteType && completer.byType 
                                ? completer.byType[completer.favoriteType] || 0
                                : 0;
                            
                            return `
                                <tr>
                                    <td><i class="fas fa-user"></i> ${completer.nickname || completer.username}</td>
                                    <td style="text-align: center;">${favoriteTypeDisplay}</td>
                                    <td style="text-align: center; font-weight: 600; color: var(--accent-color);">${favoriteTypeCount}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
                
                <!-- Most Active Characters -->
                <table class="stats-table">
                    <thead>
                        <tr>
                            <th colspan="3">Most Active Characters</th>
                        </tr>
                        <tr>
                            <th>User</th>
                            <th>Character</th>
                            <th>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${topCompleters.slice(0, 5).map((completer) => {
                            const topCharDisplay = completer.topCharacter
                                ? `<i class="fas fa-user-circle"></i> ${completer.topCharacter.name}${completer.topCharacter.job ? ` (${completer.topCharacter.job})` : ''}`
                                : '—';
                            
                            // Get count for top character - find max count in byCharacter
                            let topCharCount = 0;
                            if (completer.byCharacter && Object.keys(completer.byCharacter).length > 0) {
                                topCharCount = Math.max(...Object.values(completer.byCharacter));
                            }
                            
                            return `
                                <tr>
                                    <td><i class="fas fa-user"></i> ${completer.nickname || completer.username}</td>
                                    <td>${topCharDisplay}</td>
                                    <td style="text-align: center; font-weight: 600; color: var(--accent-color);">${topCharCount}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Helper: Get quest type icon for stats display
function getQuestTypeIconForStats(type) {
    const icons = {
        'item': '📦',
        'monster': '🐉',
        'escort': '🚶',
        'crafting': '🔨',
        'art': '🎨',
        'writing': '✍️'
    };
    return icons[type] || '📋';
}

// ============================================================================
// ------------------- Early Initialization -------------------
// ============================================================================

// Apply Firefox fixes immediately when script loads
if (isFirefoxBrowser()) {
    console.log('🦊 Firefox detected - preparing compatibility mode...');
    document.body.classList.add('firefox-browser');
    
    // Apply fixes when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyFirefoxFixes);
    } else {
        applyFirefoxFixes();
    }
}

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

export {
    initStatsPage
};
