/* ====================================================================== */
/* Quest Rendering and Filtering Module                                 */
/* Handles quest card rendering, filtering, pagination, and quest details */
/* ====================================================================== */

import { scrollToTop, createSearchFilterBar } from './ui.js';
import { capitalize } from './utils.js';

// ============================================================================
// ------------------- Rendering: Quest Cards -------------------
// Displays quests with pagination and status-based styling
// ============================================================================

// ------------------- Function: renderQuestCards -------------------
// Renders all quest cards with pagination and detail sections
function renderQuestCards(quests, page = 1, totalQuests = null) {
    console.log('🔍 renderQuestCards called with:', { quests: quests?.length, page, totalQuests });
    
    // ------------------- Sort Quests by Date (Newest First) -------------------
    const sortedQuests = [...quests].sort((a, b) => {
        const dateA = new Date(a.postedAt || a.createdAt || 0);
        const dateB = new Date(b.postedAt || b.createdAt || 0);
        return dateB - dateA; // Newest first
    });

    console.log('📊 Sorted quests:', sortedQuests.length);

    // Scroll to top of the page
    scrollToTop();

    const grid = document.getElementById('quests-container');
    console.log('🎯 Grid container found:', !!grid);
    if (!grid) {
        console.error('❌ Grid container not found');
        return;
    }

    // ------------------- No Quests Found -------------------
    if (!sortedQuests || sortedQuests.length === 0) {
        grid.innerHTML = '<div class="quest-loading">No quests found</div>';
        const pagination = document.getElementById('quest-pagination');
        if (pagination) pagination.innerHTML = '';
        return;
    }

    // Get quests per page setting
    const questsPerPageSelect = document.getElementById('quests-per-page');
    const questsPerPage = questsPerPageSelect ? 
        (questsPerPageSelect.value === 'all' ? sortedQuests.length : parseInt(questsPerPageSelect.value)) : 
        12;

    // Calculate pagination info - use totalQuests if provided, otherwise use current quests length
    const questsForPagination = totalQuests !== null ? totalQuests : sortedQuests.length;
    const totalPages = Math.ceil(questsForPagination / questsPerPage);
    const startIndex = (page - 1) * questsPerPage;
    const endIndex = Math.min(startIndex + questsPerPage, questsForPagination);

    // ------------------- Render Quest Cards -------------------
    grid.innerHTML = sortedQuests.map(quest => {
        // Quest status and styling
        const statusClass = getQuestStatusClass(quest.status);
        const questTypeClass = getQuestTypeClass(quest.questType);
        
        // Format dates
        const postedDate = formatQuestDate(quest.postedAt);
        const deadlineDate = formatQuestDate(quest.signupDeadline);
        
        // Participant count
        const participantCount = quest.participants ? Object.keys(quest.participants).length : 0;
        const participantCap = quest.participantCap || '∞';
        
        // Token reward formatting
        const tokenRewardData = formatTokenReward(quest.tokenReward);
        
        // Item rewards formatting
        const itemRewards = formatItemRewards(quest.itemRewards, quest.itemReward, quest.itemRewardQty);
        
        // Participation requirements
        const participationRequirements = formatParticipationRequirements(quest);
        
        return `
            <div class="quest-card ${questTypeClass}" data-quest-id="${quest.questID}">
                <div class="quest-card-inner">
                    <div class="quest-card-front">
                        <div class="quest-header">
                            <div class="quest-title-row">
                                <h3 class="quest-title">${quest.title}</h3>
                                <div class="quest-status-badge ${statusClass}">
                                    <i class="fas ${getQuestStatusIcon(quest.status)}"></i>
                                    <span>${capitalize(quest.status)}</span>
                                </div>
                            </div>
                            
                            <div class="quest-type-badge ${questTypeClass}">
                                <i class="fas ${getQuestTypeIcon(quest.questType)}"></i>
                                <span>${quest.questType}</span>
                            </div>
                            
                            <div class="quest-meta">
                                ${postedDate ? `
                                    <div class="quest-date">
                                        <i class="fas fa-calendar"></i>
                                        <span>Posted: ${postedDate}</span>
                                    </div>
                                ` : ''}
                                ${deadlineDate ? `
                                    <div class="quest-deadline">
                                        <i class="fas fa-clock"></i>
                                        <span>Signup Deadline: ${deadlineDate}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>

                        <div class="quest-description">
                            <p>${quest.description}</p>
                        </div>

                        <div class="quest-details">
                            <div class="quest-detail-row">
                                <span class="quest-detail-label">📍 Location:</span>
                                <span class="quest-detail-value">${quest.location}</span>
                            </div>
                            <div class="quest-detail-row">
                                <span class="quest-detail-label">⏰ Time Limit:</span>
                                <span class="quest-detail-value">${quest.timeLimit}</span>
                            </div>
                            <div class="quest-detail-row">
                                <span class="quest-detail-label">👥 Participants:</span>
                                <span class="quest-detail-value">${participantCount}/${participantCap}</span>
                            </div>
                        </div>

                        ${tokenRewardData || itemRewards ? `
                            <div class="quest-rewards">
                                <div class="reward-section">
                                    <h4>🏆 Rewards</h4>
                                    <div class="reward-breakdown">
                                        ${tokenRewardData && tokenRewardData.breakdown ? `
                                            <div class="reward-details">
                                                ${tokenRewardData.breakdown.map(detail => `
                                                    <div class="reward-detail">
                                                        <span class="reward-icon">${detail.icon}</span>
                                                        <span class="reward-text">${detail.text}</span>
                                                    </div>
                                                `).join('')}
                                            </div>
                                        ` : ''}
                                        ${itemRewards ? `
                                            <div class="reward-detail item-reward">
                                                <span class="reward-icon">🎁</span>
                                                <span class="reward-text">${itemRewards}</span>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            </div>
                        ` : ''}

                        <div class="quest-participation">
                            <h4>🗓️ Participation</h4>
                            <div class="participation-requirements">
                                ${participationRequirements.map(req => `
                                    <div class="requirement-item">
                                        <span class="requirement-icon">${req.icon}</span>
                                        <span class="requirement-text">${req.text}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        ${quest.rules ? `
                            <div class="quest-rules">
                                <h4><i class="fas fa-list"></i> Rules</h4>
                                <p>${quest.rules}</p>
                            </div>
                        ` : ''}

                        ${quest.specialNote ? `
                            <div class="quest-special-note">
                                <h4><i class="fas fa-star"></i> Special Note</h4>
                                <p>${quest.specialNote}</p>
                            </div>
                        ` : ''}

                        <div class="quest-footer">
                            <div class="quest-actions">
                                <button class="quest-action-btn view-participants" onclick="this.closest('.quest-card').classList.toggle('flipped')">
                                    <i class="fas fa-users"></i>
                                    <span>View Participants</span>
                                </button>
                            </div>
                        </div>
                    </div>
            
            <div class="quest-card-back">
                <div class="quest-participants-section">
                    <div class="quest-participants-header">
                        <button class="quest-back-btn" onclick="this.closest('.quest-card').classList.toggle('flipped')">
                            <i class="fas fa-arrow-left"></i>
                            <span>Back to Quest</span>
                        </button>
                        <div class="quest-participants-title">Participants (${quest.participants ? Object.keys(quest.participants).length : 0}/${quest.participantCap || '∞'})</div>
                    </div>
                    ${quest.participants && Object.keys(quest.participants).length > 0 ? `
                        <div class="quest-participants-list">
                            ${Object.values(quest.participants).map(participant => `
                                <div class="quest-participant-item">
                                    <div class="quest-participant-info">
                                        <span class="quest-participant-name">${participant.characterName}</span>
                                        <span class="quest-participant-status ${participant.progress}">${capitalize(participant.progress)}</span>
                                    </div>
                                    <div class="quest-participant-details">
                                        <small>Joined: ${formatShortDate(participant.joinedAt)}</small>
                                        ${quest.questType === 'RP' && participant.rpPostCount ? `
                                            <small>Posts: ${participant.rpPostCount}</small>
                                        ` : ''}
                                        ${participant.requiredVillage ? `
                                            <small>Village: ${capitalize(participant.requiredVillage)}</small>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="quest-participants-empty">
                            <i class="fas fa-user-plus"></i>
                            <p>No participants yet</p>
                        </div>
                    `}
                </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Update results info
    const resultsInfo = document.querySelector('.quest-results-info p');
    if (resultsInfo) {
        const totalPages = Math.ceil(questsForPagination / questsPerPage);
        resultsInfo.textContent = `Showing ${startIndex + 1}-${endIndex} of ${questsForPagination} quests (Page ${page} of ${totalPages})`;
    }
}

// ============================================================================
// ------------------- Rendering: Helpers -------------------
// Returns quest status classes, icons, and formatted values
// ============================================================================

// ------------------- Function: getQuestStatusClass -------------------
// Returns CSS class for quest status
function getQuestStatusClass(status) {
    const statusMap = {
        'active': 'status-active',
        'completed': 'status-completed',
        'cancelled': 'status-cancelled'
    };
    return statusMap[status] || 'status-unknown';
}

// ------------------- Function: getQuestStatusIcon -------------------
// Returns FontAwesome icon for quest status
function getQuestStatusIcon(status) {
    const iconMap = {
        'active': 'fa-play-circle',
        'completed': 'fa-check-circle',
        'cancelled': 'fa-times-circle'
    };
    return iconMap[status] || 'fa-question-circle';
}

// ------------------- Function: getQuestTypeClass -------------------
// Returns CSS class for quest type
function getQuestTypeClass(questType) {
    const typeMap = {
        'Art': 'type-art',
        'Writing': 'type-writing',
        'Interactive': 'type-interactive',
        'RP': 'type-rp',
        'Art / Writing': 'type-art-writing'
    };
    return typeMap[questType] || 'type-unknown';
}

// ------------------- Function: getQuestTypeIcon -------------------
// Returns FontAwesome icon for quest type
function getQuestTypeIcon(questType) {
    const iconMap = {
        'Art': 'fa-palette',
        'Writing': 'fa-pen',
        'Interactive': 'fa-gamepad',
        'RP': 'fa-users',
        'Art / Writing': 'fa-paint-brush'
    };
    return iconMap[questType] || 'fa-scroll';
}

// ------------------- Function: formatQuestDate -------------------
// Formats quest dates for display
function formatQuestDate(dateString) {
    if (!dateString) return null;
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

// ------------------- Function: formatShortDate -------------------
// Formats date in a shorter format for participant lists
function formatShortDate(dateString) {
    if (!dateString) return null;
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

// ------------------- Function: formatMinRequirements -------------------
// Formats minimum requirements for display
function formatMinRequirements(minRequirements) {
    if (!minRequirements || minRequirements === 0) {
        return 'None';
    }
    
    if (typeof minRequirements === 'number') {
        return `Level ${minRequirements}+`;
    }
    
    if (typeof minRequirements === 'object') {
        if (minRequirements.level) {
            return `Level ${minRequirements.level}+`;
        }
        if (minRequirements.rolls) {
            return `${minRequirements.rolls} rolls required`;
        }
        return 'Custom requirements';
    }
    
    return String(minRequirements);
}

// ------------------- Function: formatTokenReward -------------------
// Formats token reward for display with clear explanations
function formatTokenReward(tokenReward) {
    if (!tokenReward || tokenReward === 'N/A' || tokenReward === 'No reward' || tokenReward === 'No reward specified' || tokenReward === 'None') {
        return null;
    }
    
    if (typeof tokenReward === 'number') {
        return {
            type: 'simple',
            display: `${tokenReward} tokens`,
            breakdown: null
        };
    }
    
    if (typeof tokenReward === 'string') {
        // Parse complex reward formats
        const reward = parseComplexReward(tokenReward);
        return reward;
    }
    
    return null;
}

// ------------------- Function: parseComplexReward -------------------
// Parses complex reward strings and returns formatted breakdown
function parseComplexReward(rewardString) {
    const reward = {
        type: 'complex',
        display: '',
        breakdown: []
    };
    
    // Handle per_unit format: "per_unit:222 unit:submission max:3"
    if (rewardString.includes('per_unit:')) {
        const perUnitMatch = rewardString.match(/per_unit:(\d+)/);
        const unitMatch = rewardString.match(/unit:(\w+)/);
        const maxMatch = rewardString.match(/max:(\d+)/);
        
        if (perUnitMatch && unitMatch && maxMatch) {
            const perUnit = parseInt(perUnitMatch[1]);
            const unit = unitMatch[1];
            const max = parseInt(maxMatch[1]);
            const totalTokens = perUnit * max;
            
            reward.display = `${perUnit} tokens per ${unit} (max ${max} ${unit}s = ${totalTokens} tokens total)`;
            reward.breakdown = [
                { icon: '💰', text: `${perUnit} tokens per ${unit}` },
                { icon: '📊', text: `Maximum ${max} ${unit}s` },
                { icon: '🎯', text: `Total possible: ${totalTokens} tokens` }
            ];
        }
    }
    
    // Handle flat format: "flat:500"
    else if (rewardString.includes('flat:')) {
        const flatMatch = rewardString.match(/flat:(\d+)/);
        if (flatMatch) {
            const amount = parseInt(flatMatch[1]);
            reward.display = `${amount} tokens (flat rate)`;
            reward.breakdown = [
                { icon: '💰', text: `${amount} tokens guaranteed` },
                { icon: '✅', text: 'Flat participation reward' }
            ];
        }
    }
    
    // Handle collab_bonus format: "collab_bonus:100"
    else if (rewardString.includes('collab_bonus:')) {
        const bonusMatch = rewardString.match(/collab_bonus:(\d+)/);
        if (bonusMatch) {
            const bonus = parseInt(bonusMatch[1]);
            reward.display = `${bonus} tokens (collaboration bonus)`;
            reward.breakdown = [
                { icon: '🤝', text: `${bonus} tokens collaboration bonus` },
                { icon: '✨', text: 'Bonus for working together' }
            ];
        }
    }
    
    // Handle simple number strings
    else {
        const parsed = parseFloat(rewardString);
        if (!isNaN(parsed)) {
            reward.display = `${parsed} tokens`;
            reward.breakdown = [
                { icon: '💰', text: `${parsed} tokens` }
            ];
        } else {
            // Fallback for unknown formats
            reward.display = rewardString;
            reward.breakdown = [
                { icon: '❓', text: 'Custom reward format' }
            ];
        }
    }
    
    return reward;
}

// ------------------- Function: resolveChannelName -------------------
// Resolves Discord channel IDs to readable channel names
function resolveChannelName(channelId) {
    // Channel ID to name mapping - can be expanded as needed
    const channelMap = {
        '706880599863853097': '⭐》casual-rp',
        // Add more channel mappings as needed
        // 'channel_id': 'channel_name'
    };
    
    // Return mapped name or fallback to showing the ID with a prefix
    const mappedName = channelMap[channelId];
    if (mappedName) {
        return mappedName;
    }
    
    // If no mapping found, show a truncated version of the ID for readability
    if (channelId && channelId.length > 10) {
        return `#${channelId.slice(-8)}...`;
    }
    
    return channelId || 'Unknown Channel';
}

// ------------------- Function: formatParticipationRequirements -------------------
// Formats participation requirements for display
function formatParticipationRequirements(quest) {
    const requirements = [];
    
    // Post requirements for RP quests
    if (quest.questType === 'RP' && quest.postRequirement) {
        requirements.push({
            icon: '💬',
            text: `${quest.postRequirement} RP Posts Required`,
            detail: 'Roleplay participation requirement'
        });
    }
    
    // Post requirements for Writing quests
    if (quest.questType === 'Writing' && quest.postRequirement) {
        requirements.push({
            icon: '📝',
            text: `${quest.postRequirement} Writing Submissions`,
            detail: 'Written content submissions required'
        });
    }
    
    // Post requirements for Art quests
    if (quest.questType === 'Art' && quest.postRequirement) {
        requirements.push({
            icon: '🎨',
            text: `${quest.postRequirement} Art Submissions`,
            detail: 'Visual art submissions required'
        });
    }
    
    // Art/Writing combined requirements
    if (quest.questType === 'Art / Writing') {
        if (quest.postRequirement) {
            requirements.push({
                icon: '🎨📝',
                text: `${quest.postRequirement} Submissions Each`,
                detail: 'Both art AND writing required'
            });
        } else {
            requirements.push({
                icon: '🎨📝',
                text: '1 Submission Each',
                detail: 'Both art AND writing required'
            });
        }
    }
    
    // Interactive quest requirements
    if (quest.questType === 'Interactive' && quest.requiredRolls) {
        requirements.push({
            icon: '🎲',
            text: `${quest.requiredRolls} Successful Rolls`,
            detail: 'Table roll participation requirement'
        });
    }
    
    // Minimum requirements
    if (quest.minRequirements) {
        if (typeof quest.minRequirements === 'number' && quest.minRequirements > 0) {
            requirements.push({
                icon: '📊',
                text: `Level ${quest.minRequirements}+ Required`,
                detail: 'Minimum character level requirement'
            });
        } else if (typeof quest.minRequirements === 'object' && quest.minRequirements.level) {
            requirements.push({
                icon: '📊',
                text: `Level ${quest.minRequirements.level}+ Required`,
                detail: 'Minimum character level requirement'
            });
        }
    }
    
    // Default requirements if none specified
    if (requirements.length === 0) {
        if (quest.questType === 'RP') {
            requirements.push({
                icon: '💬',
                text: '15 RP Posts Required',
                detail: 'Default roleplay participation requirement'
            });
        } else if (quest.questType === 'Writing') {
            requirements.push({
                icon: '📝',
                text: '1 Writing Submission',
                detail: 'Written content submission required'
            });
        } else if (quest.questType === 'Art') {
            requirements.push({
                icon: '🎨',
                text: '1 Art Submission',
                detail: 'Visual art submission required'
            });
        }
    }
    
    return requirements;
}

// ------------------- Function: formatItemRewards -------------------
// Formats item rewards for display
function formatItemRewards(itemRewards, itemReward, itemRewardQty) {
    if (itemRewards && itemRewards.length > 0) {
        return itemRewards.map(item => `${item.quantity}x ${item.name}`).join(', ');
    }
    
    if (itemReward && itemReward !== 'N/A' && itemReward !== 'No reward') {
        const qty = itemRewardQty || 1;
        return `${qty}x ${itemReward}`;
    }
    
    return null;
}

// ============================================================================
// ------------------- Filtering: Dropdown and Search -------------------
// Applies filters to quest list based on UI selection
// ============================================================================

// ------------------- Function: populateFilterOptions -------------------
// Populates dropdowns for quest type, status, and location based on unique values
async function populateFilterOptions(quests) {
    try {
        // Fetch all quests from database to get unique filter values
        const response = await fetch('/api/models/quest?all=true');
        if (!response.ok) {
            return;
        }
        
        const { data: allQuests } = await response.json();
        
        // Extract unique values from all quests
        const questTypeSet = new Set();
        const statusSet = new Set();
        const locationSet = new Set();
        
        allQuests.forEach(q => {
            if (q.questType) questTypeSet.add(q.questType);
            if (q.status) statusSet.add(q.status);
            if (q.location) locationSet.add(q.location);
        });
        
        // Populate the select dropdowns
        populateSelect('filter-quest-type', Array.from(questTypeSet));
        populateSelect('filter-quest-status', Array.from(statusSet));
        populateSelect('filter-quest-location', Array.from(locationSet));
        
    } catch (error) {
        console.error('❌ Error loading quest filter options from database:', error);
    }
}

// ------------------- Function: populateSelect -------------------
// Helper to populate a <select> element with new options
function populateSelect(id, values) {
    const select = document.getElementById(id);
    if (!select) return;

    select.querySelectorAll('option:not([value="all"])').forEach(opt => opt.remove());

    const formatted = values
        .map(v => capitalize(v.toLowerCase()))
        .sort();

    formatted.forEach(val => {
        const option = document.createElement('option');
        option.value = val.toLowerCase();
        option.textContent = val;
        select.appendChild(option);
    });
}

// ------------------- Function: setupQuestFilters -------------------
// Adds listeners to filter UI and re-renders quests on change
async function setupQuestFilters(quests) {
    console.log('⚙️ setupQuestFilters called with:', quests?.length, 'quests');
    window.allQuests = quests;

    if (window.questFiltersInitialized) {
        console.log('🔄 Quest filters already initialized, calling filterQuests');
        window.filterQuests();
        return;
    }

    // Show the filters container
    const filtersContainer = document.querySelector('.quest-filters');
    if (filtersContainer) {
        filtersContainer.style.display = 'flex';
    }

    const searchInput = document.getElementById('quest-search-input');
    const questTypeSelect = document.getElementById('filter-quest-type');
    const questStatusSelect = document.getElementById('filter-quest-status');
    const questLocationSelect = document.getElementById('filter-quest-location');
    const sortSelect = document.getElementById('sort-by');
    const questsPerPageSelect = document.getElementById('quests-per-page');
    const clearFiltersBtn = document.getElementById('clear-filters');

    const missing = [searchInput, questTypeSelect, questStatusSelect, questLocationSelect, sortSelect, questsPerPageSelect, clearFiltersBtn].some(el => !el);
    if (missing) {
        if (!window.filterSetupRetried) {
            window.filterSetupRetried = true;
            requestAnimationFrame(() => setupQuestFilters(quests));
        } else {
            console.error('❌ Failed to initialize quest filters. Please refresh.');
        }
        return;
    }

    window.filterSetupRetried = false;

    // Populate filter options with available values from database
    await populateFilterOptions(quests);

    // ------------------- Function: filterQuests -------------------
    // Main filtering function that handles both server-side and client-side filtering
    window.filterQuests = async function (page = 1) {
        console.log('🔍 filterQuests called with page:', page);
        const searchTerm = searchInput.value.toLowerCase();
        const questTypeFilter = questTypeSelect.value.toLowerCase();
        const questStatusFilter = questStatusSelect.value.toLowerCase();
        const questLocationFilter = questLocationSelect.value.toLowerCase();
        const sortBy = sortSelect.value;
        const questsPerPage = questsPerPageSelect.value;

        // Save current filter state
        window.savedFilterState = {
            searchTerm: searchInput.value,
            questTypeFilter,
            questStatusFilter,
            questLocationFilter,
            sortBy,
            questsPerPage
        };

        // Check if any filters are active
        const hasActiveFilters = searchTerm || 
            questTypeFilter !== 'all' || 
            questStatusFilter !== 'all' || 
            questLocationFilter !== 'all';

        // Always use server-side filtering when filters are active OR when quests per page is not 'all'
        if (hasActiveFilters || questsPerPage !== 'all') {
            await filterQuestsWithAllData(page);
        } else {
            filterQuestsClientSide(page);
        }
    };

    // ------------------- Function: filterQuestsWithAllData -------------------
    // Fetches all quests from database and applies client-side filtering
    async function filterQuestsWithAllData(page = 1) {
        const searchTerm = searchInput.value.toLowerCase();
        const questTypeFilter = questTypeSelect.value.toLowerCase();
        const questStatusFilter = questStatusSelect.value.toLowerCase();
        const questLocationFilter = questLocationSelect.value.toLowerCase();
        const sortBy = sortSelect.value;
        const questsPerPage = questsPerPageSelect.value === 'all' ? 999999 : parseInt(questsPerPageSelect.value);

        // Show loading state
        const resultsInfo = document.querySelector('.quest-results-info p');
        if (resultsInfo) {
            resultsInfo.textContent = 'Loading filtered quests...';
        }

        try {
            // Always fetch ALL quests from the database
            const response = await fetch('/api/models/quest?all=true');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const { data: allQuests } = await response.json();

            // Apply filtering and sorting to ALL quests
            const filteredAndSorted = applyFiltersAndSort(allQuests);

            // Apply pagination
            const totalPages = Math.ceil(filteredAndSorted.length / questsPerPage);
            const startIndex = (page - 1) * questsPerPage;
            const endIndex = startIndex + questsPerPage;
            const paginatedQuests = filteredAndSorted.slice(startIndex, endIndex);

            // Update global quests for this filtered view
            window.allQuests = filteredAndSorted;

            // Update results info
            if (resultsInfo) {
                if (questsPerPageSelect.value === 'all') {
                    resultsInfo.textContent = `Showing all ${filteredAndSorted.length} filtered quests`;
                } else {
                    resultsInfo.textContent = `Showing ${paginatedQuests.length} of ${filteredAndSorted.length} filtered quests (Page ${page} of ${totalPages})`;
                }
            }

            // Render the paginated filtered quests
            renderQuestCards(paginatedQuests, page, filteredAndSorted.length);

            // Update pagination for filtered results
            if (questsPerPageSelect.value !== 'all' && filteredAndSorted.length > questsPerPage) {
                updateFilteredPagination(page, totalPages, filteredAndSorted.length);
            } else {
                const contentDiv = document.getElementById('model-details-data');
                if (contentDiv) {
                    const existingPagination = contentDiv.querySelector('.pagination');
                    if (existingPagination) {
                        existingPagination.remove();
                    }
                }
            }

        } catch (error) {
            console.error('❌ Error fetching all quests for filtering:', error);
            // Fallback to client-side filtering on current quests
            filterQuestsClientSide(page);
        }
    }

    // ------------------- Function: filterQuestsClientSide -------------------
    // Client-side filtering for when no server-side filtering is needed
    function filterQuestsClientSide(page = 1) {
        console.log('🔍 filterQuestsClientSide called with page:', page);
        console.log('📊 window.allQuests:', window.allQuests?.length);
        const searchTerm = searchInput.value.toLowerCase();
        const questTypeFilter = questTypeSelect.value.toLowerCase();
        const questStatusFilter = questStatusSelect.value.toLowerCase();
        const questLocationFilter = questLocationSelect.value.toLowerCase();
        const sortBy = sortSelect.value;
        const questsPerPage = questsPerPageSelect.value === 'all' ? window.allQuests.length : parseInt(questsPerPageSelect.value);

        const filtered = window.allQuests.filter(quest => {
            const matchesSearch = !searchTerm ||
                quest.title?.toLowerCase().includes(searchTerm) ||
                quest.description?.toLowerCase().includes(searchTerm) ||
                quest.location?.toLowerCase().includes(searchTerm);

            const matchesQuestType = questTypeFilter === 'all' || quest.questType?.toLowerCase() === questTypeFilter;
            const matchesStatus = questStatusFilter === 'all' || quest.status?.toLowerCase() === questStatusFilter;
            const matchesLocation = questLocationFilter === 'all' || quest.location?.toLowerCase() === questLocationFilter;

            return matchesSearch && matchesQuestType && matchesStatus && matchesLocation;
        });

        const [field, direction] = sortBy.split('-');
        const isAsc = direction === 'asc';

        const sorted = [...filtered].sort((a, b) => {
            let valA, valB;
            
            switch (field) {
                case 'title':
                    valA = a.title ?? '';
                    valB = b.title ?? '';
                    break;
                case 'date':
                    valA = new Date(a.postedAt || a.createdAt || 0);
                    valB = new Date(b.postedAt || b.createdAt || 0);
                    break;
                default:
                    valA = a[field] ?? '';
                    valB = b[field] ?? '';
            }
            
            return isAsc
                ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
                : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
        });

        // Apply pagination
        const totalPages = Math.ceil(sorted.length / questsPerPage);
        const startIndex = (page - 1) * questsPerPage;
        const endIndex = startIndex + questsPerPage;
        const paginatedQuests = sorted.slice(startIndex, endIndex);

        // Update results info
        const resultsInfo = document.querySelector('.quest-results-info p');
        if (resultsInfo) {
            if (questsPerPageSelect.value === 'all') {
                resultsInfo.textContent = `Showing all ${sorted.length} of ${window.allQuests.length} quests`;
            } else {
                resultsInfo.textContent = `Showing ${paginatedQuests.length} of ${sorted.length} quests (Page ${page} of ${totalPages})`;
            }
        }

        // Render the paginated quests
        renderQuestCards(paginatedQuests, page, sorted.length);

        // Update pagination
        if (questsPerPageSelect.value !== 'all' && sorted.length > questsPerPage) {
            updateFilteredPagination(page, totalPages, sorted.length);
        } else {
            const contentDiv = document.getElementById('model-details-data');
            if (contentDiv) {
                const existingPagination = contentDiv.querySelector('.pagination');
                if (existingPagination) {
                    existingPagination.remove();
                }
            }
        }
    }

    // ------------------- Function: applyFiltersAndSort -------------------
    // Unified function to apply filters and sorting to quests
    function applyFiltersAndSort(quests) {
        const searchTerm = searchInput.value.toLowerCase();
        const questTypeFilter = questTypeSelect.value.toLowerCase();
        const questStatusFilter = questStatusSelect.value.toLowerCase();
        const questLocationFilter = questLocationSelect.value.toLowerCase();
        const sortBy = sortSelect.value;

        // Apply filters
        const filtered = quests.filter(quest => {
            const matchesSearch = !searchTerm ||
                quest.title?.toLowerCase().includes(searchTerm) ||
                quest.description?.toLowerCase().includes(searchTerm) ||
                quest.location?.toLowerCase().includes(searchTerm);

            const matchesQuestType = questTypeFilter === 'all' || quest.questType?.toLowerCase() === questTypeFilter;
            const matchesStatus = questStatusFilter === 'all' || quest.status?.toLowerCase() === questStatusFilter;
            const matchesLocation = questLocationFilter === 'all' || quest.location?.toLowerCase() === questLocationFilter;

            return matchesSearch && matchesQuestType && matchesStatus && matchesLocation;
        });

        // Apply sorting
        const [field, direction] = sortBy.split('-');
        const isAsc = direction === 'asc';

        return [...filtered].sort((a, b) => {
            let valA, valB;
            
            switch (field) {
                case 'title':
                    valA = a.title ?? '';
                    valB = b.title ?? '';
                    break;
                case 'date':
                    valA = new Date(a.postedAt || a.createdAt || 0);
                    valB = new Date(b.postedAt || b.createdAt || 0);
                    break;
                default:
                    valA = a[field] ?? '';
                    valB = b[field] ?? '';
            }
            
            return isAsc
                ? (typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB)
                : (typeof valB === 'string' ? valB.localeCompare(valA) : valB - valA);
        });
    }

    // ------------------- Function: updateFilteredPagination -------------------
    // Creates pagination for filtered results
    function updateFilteredPagination(currentPage, totalPages, totalItems) {
        const contentDiv = document.getElementById('model-details-data');
        if (!contentDiv) {
            console.error('❌ Content div not found');
            return;
        }

        // Remove ALL existing pagination
        const existingPagination = contentDiv.querySelector('.pagination');
        if (existingPagination) {
            existingPagination.remove();
        }

        // Only show pagination if there are multiple pages
        if (totalPages > 1) {
            const handlePageChange = async (pageNum) => {
                window.filterQuests(pageNum);
            };

            // Create pagination manually
            const paginationDiv = document.createElement('div');
            paginationDiv.className = 'pagination';
            
            // Add previous button
            if (currentPage > 1) {
                const prevButton = document.createElement('button');
                prevButton.className = 'pagination-button';
                prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
                prevButton.title = 'Previous Page';
                prevButton.addEventListener('click', () => handlePageChange(currentPage - 1));
                paginationDiv.appendChild(prevButton);
            }

            // Add page numbers
            const startPage = Math.max(1, currentPage - 2);
            const endPage = Math.min(totalPages, currentPage + 2);

            if (startPage > 1) {
                const firstButton = document.createElement('button');
                firstButton.className = 'pagination-button';
                firstButton.textContent = '1';
                firstButton.addEventListener('click', () => handlePageChange(1));
                paginationDiv.appendChild(firstButton);

                if (startPage > 2) {
                    const ellipsis = document.createElement('span');
                    ellipsis.className = 'pagination-ellipsis';
                    ellipsis.textContent = '...';
                    paginationDiv.appendChild(ellipsis);
                }
            }

            for (let i = startPage; i <= endPage; i++) {
                const pageButton = document.createElement('button');
                pageButton.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
                pageButton.textContent = i.toString();
                pageButton.addEventListener('click', () => handlePageChange(i));
                paginationDiv.appendChild(pageButton);
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    const ellipsis = document.createElement('span');
                    ellipsis.className = 'pagination-ellipsis';
                    ellipsis.textContent = '...';
                    paginationDiv.appendChild(ellipsis);
                }

                const lastButton = document.createElement('button');
                lastButton.className = 'pagination-button';
                lastButton.textContent = totalPages.toString();
                lastButton.addEventListener('click', () => handlePageChange(totalPages));
                paginationDiv.appendChild(lastButton);
            }

            // Add next button
            if (currentPage < totalPages) {
                const nextButton = document.createElement('button');
                nextButton.className = 'pagination-button';
                nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
                nextButton.title = 'Next Page';
                nextButton.addEventListener('click', () => handlePageChange(currentPage + 1));
                paginationDiv.appendChild(nextButton);
            }

            contentDiv.appendChild(paginationDiv);
        }
    }

    // Add event listeners
    searchInput.addEventListener('input', () => window.filterQuests(1));
    questTypeSelect.addEventListener('change', () => window.filterQuests(1));
    questStatusSelect.addEventListener('change', () => window.filterQuests(1));
    questLocationSelect.addEventListener('change', () => window.filterQuests(1));
    sortSelect.addEventListener('change', () => window.filterQuests(1));
    questsPerPageSelect.addEventListener('change', () => window.filterQuests(1));

    clearFiltersBtn.addEventListener('click', async () => {
        searchInput.value = '';
        questTypeSelect.value = 'all';
        questStatusSelect.value = 'all';
        questLocationSelect.value = 'all';
        sortSelect.value = 'date-desc';
        questsPerPageSelect.value = '12';
        
        // Clear saved filter state
        window.savedFilterState = {};
        
        // Reload the original page data
        try {
            const response = await fetch('/api/models/quest?page=1');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const { data, pagination } = await response.json();
            
            // Update global quests with original page data
            window.allQuests = data;
            
            // Update results info
            const resultsInfo = document.querySelector('.quest-results-info p');
            if (resultsInfo) {
                resultsInfo.textContent = `Showing ${data.length} of ${pagination.total} quests`;
            }
            
            // Re-render with original data
            renderQuestCards(data, 1, pagination.total);
            
            // Remove any filtered pagination
            const contentDiv = document.getElementById('model-details-data');
            if (contentDiv) {
                const existingPagination = contentDiv.querySelector('.pagination');
                if (existingPagination) {
                    existingPagination.remove();
                }
            }
            
            // Re-create normal pagination
            if (pagination.pages > 1) {
                const handlePageChange = async (pageNum) => {
                    try {
                        const { data: pageData, pagination: pagePagination } = await fetch(`/api/models/quest?page=${pageNum}`).then(r => r.json());
                        window.allQuests = pageData;
                        
                        // Update results info
                        const resultsInfo = document.querySelector('.quest-results-info p');
                        if (resultsInfo) {
                            resultsInfo.textContent = `Showing ${pageData.length} of ${pagePagination.total} quests (sorted by date)`;
                        }
                        
                        renderQuestCards(pageData, pageNum, pagePagination.total);
                        
                        // Update pagination
                        const contentDiv = document.getElementById('model-details-data');
                        if (contentDiv) {
                            const existingPagination = contentDiv.querySelector('.pagination');
                            if (existingPagination) {
                                existingPagination.remove();
                            }
                            createNormalPagination(pagePagination.page, pagePagination.pages, handlePageChange);
                        }
                    } catch (error) {
                        console.error('❌ Error loading page:', error);
                    }
                };
                
                createNormalPagination(pagination.page, pagination.pages, handlePageChange);
            }
            
        } catch (error) {
            console.error('❌ Error reloading original data:', error);
            // Fallback to client-side filtering
            window.filterQuests(1);
        }
    });

    // ------------------- Function: createNormalPagination -------------------
    // Creates normal pagination for unfiltered results
    function createNormalPagination(currentPage, totalPages, handlePageChange) {
        const contentDiv = document.getElementById('model-details-data');
        if (!contentDiv) return;

        const paginationDiv = document.createElement('div');
        paginationDiv.className = 'pagination';
        
        // Add previous button
        if (currentPage > 1) {
            const prevButton = document.createElement('button');
            prevButton.className = 'pagination-button';
            prevButton.innerHTML = '<i class="fas fa-chevron-left"></i>';
            prevButton.title = 'Previous Page';
            prevButton.addEventListener('click', () => handlePageChange(currentPage - 1));
            paginationDiv.appendChild(prevButton);
        }

        // Add page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) {
            const firstButton = document.createElement('button');
            firstButton.className = 'pagination-button';
            firstButton.textContent = '1';
            firstButton.addEventListener('click', () => handlePageChange(1));
            paginationDiv.appendChild(firstButton);

            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                paginationDiv.appendChild(ellipsis);
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
            pageButton.textContent = i.toString();
            pageButton.addEventListener('click', () => handlePageChange(i));
            paginationDiv.appendChild(pageButton);
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                paginationDiv.appendChild(ellipsis);
            }

            const lastButton = document.createElement('button');
            lastButton.className = 'pagination-button';
            lastButton.textContent = totalPages.toString();
            lastButton.addEventListener('click', () => handlePageChange(totalPages));
            paginationDiv.appendChild(lastButton);
        }

        // Add next button
        if (currentPage < totalPages) {
            const nextButton = document.createElement('button');
            nextButton.className = 'pagination-button';
            nextButton.innerHTML = '<i class="fas fa-chevron-right"></i>';
            nextButton.title = 'Next Page';
            nextButton.addEventListener('click', () => handlePageChange(currentPage + 1));
            paginationDiv.appendChild(nextButton);
        }

        contentDiv.appendChild(paginationDiv);
    }

    window.questFiltersInitialized = true;
    window.filterQuests();
}

// ============================================================================
// ------------------- Page Initialization -------------------
// Sets up the filters and quest grid on first load
// ============================================================================

// ------------------- Function: initializeQuestPage -------------------
// Initializes the quest page with filters, pagination, and card rendering
function initializeQuestPage(data, page = 1, contentDiv) {
    console.log('🚀 initializeQuestPage called with:', { data: data?.length, page, contentDiv: !!contentDiv });
    
    // Store quests globally for filtering
    window.allQuests = data;

    // Create or refresh the standardized filter bar
    let filtersContainer = document.querySelector('.quest-filters');
    if (!filtersContainer) {
        filtersContainer = document.createElement('div');
        filtersContainer.className = 'quest-filters';
    }
    filtersContainer.innerHTML = '';

    const { bar: questFilterBar } = createSearchFilterBar({
        layout: 'wide',
        filters: [
            {
                type: 'input',
                id: 'quest-search-input',
                placeholder: 'Search quests...',
                attributes: { autocomplete: 'off' },
                width: 'double'
            },
            { type: 'select', id: 'filter-quest-type', options: [{ value: 'all', label: 'All Quest Types' }] },
            { type: 'select', id: 'filter-quest-status', options: [{ value: 'all', label: 'All Status' }] },
            { type: 'select', id: 'filter-quest-location', options: [{ value: 'all', label: 'All Locations' }] },
            {
                type: 'select',
                id: 'sort-by',
                options: [
                    { value: 'date-desc', label: 'Date (Newest First)', selected: true },
                    { value: 'date-asc', label: 'Date (Oldest First)' },
                    { value: 'title-asc', label: 'Title (A-Z)' },
                    { value: 'title-desc', label: 'Title (Z-A)' }
                ]
            },
            {
                type: 'select',
                id: 'quests-per-page',
                options: [
                    { value: '12', label: '12 per page', selected: true },
                    { value: '24', label: '24 per page' },
                    { value: '36', label: '36 per page' },
                    { value: '48', label: '48 per page' },
                    { value: 'all', label: 'All quests' }
                ]
            }
        ],
        buttons: [
            { id: 'clear-filters', label: 'Clear Filters', className: 'clear-filters-btn' }
        ]
    });

    filtersContainer.appendChild(questFilterBar);
    contentDiv.insertBefore(filtersContainer, contentDiv.firstChild);

    // Create quest container if it doesn't exist
    let container = document.getElementById('quests-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'quests-container';
        container.className = 'quest-details-grid';
        contentDiv.appendChild(container);
    }

    // Add results info section
    let resultsInfo = document.querySelector('.quest-results-info');
    if (!resultsInfo) {
        resultsInfo = document.createElement('div');
        resultsInfo.className = 'quest-results-info';
        resultsInfo.innerHTML = '<p>Loading quests...</p>';
        contentDiv.insertBefore(resultsInfo, container);
    }

    // Only initialize filters if they haven't been initialized yet
    if (!window.questFiltersInitialized) {
        console.log('🔧 Setting up quest filters for the first time');
        setupQuestFilters(data);
    } else {
        console.log('🔄 Quest filters already initialized, just rendering cards');
        // If filters are already initialized, just update the quest display
        renderQuestCards(data, page);
    }

    // Update results info
    if (resultsInfo) {
        resultsInfo.innerHTML = `<p>Showing ${data.length} quests (sorted by date)</p>`;
    }
}

// ============================================================================
// ------------------- Quest Actions -------------------
// Handles quest interactions like viewing details and joining
// ============================================================================




// ============================================================================
// ------------------- Exports -------------------
// Public API for quest rendering module
// ============================================================================
export {
    renderQuestCards,
    populateFilterOptions,
    setupQuestFilters,
    initializeQuestPage
};
