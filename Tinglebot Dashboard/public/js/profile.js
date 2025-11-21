/* ============================================================================
 * File: profile.js
 * Purpose: Handles user profile page functionality and data display.
 * ============================================================================ */

let currentUser = null;
let isAuthenticated = false;

export async function setProfileContext() {
  const module = await import('./auth.js');
  currentUser = module.currentUser;
  isAuthenticated = module.isAuthenticated;
}

await setProfileContext();

import { renderCharacterCards } from './characters.js';
import { capitalize } from './utils.js';

console.log('[profile.js] ✅ Profile module loaded');

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

/**
 * Escapes HTML attributes to prevent XSS and string literal issues
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtmlAttribute(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// ------------------- Section: Profile Page Initialization -------------------
// Sets up profile page and loads user data
// ============================================================================

let profileInitialized = false;

// ------------------- Function: initProfilePage -------------------
// Initializes the profile page and loads user data
async function initProfilePage() {
  try {
    
    if (profileInitialized) {
      return;
    }
    
    // Check authentication
    if (!isAuthenticated || !currentUser) { 
      window.location.href = '/login';
      return;
    }
    
    // Load profile data
    await loadProfileData();
    
    // Setup event listeners
    setupProfileEventListeners();
    
    profileInitialized = true;
    
  } catch (error) {
    console.error('[profile.js]: ❌ Error initializing profile page:', error);
  }
}

// ============================================================================
// ------------------- Section: Profile Data Loading -------------------
// Handles loading and displaying user profile data
// ============================================================================

// ------------------- Function: loadProfileData -------------------
// Loads and displays user profile data
async function loadProfileData() {
  try {
    
    
    // Update profile elements with current user data
    updateProfileDisplay(currentUser);
    
    // Load additional profile data if needed
    await loadExtendedProfileData();
    
    // Load user's characters
    await loadUserCharacters();
    
    // Load user's help wanted completions
    await loadHelpWantedCompletions();

    // Load quest activity overview
    await loadQuestOverview();

    // Load vending shops
    await loadVendingShops();
    
  } catch (error) {
    console.error('[profile.js]: ❌ Error loading profile data:', error);
    showProfileError('Failed to load profile data');
  }
}

// ------------------- Function: updateProfileDisplay -------------------
// Updates the profile page display with user data
function updateProfileDisplay(userData) {
  const profileAvatar = document.getElementById('profile-avatar');
  const profileName = document.getElementById('profile-name');
  const profileTokens = document.getElementById('profile-tokens');
  const profileSlots = document.getElementById('profile-slots');
  const profileJoined = document.getElementById('profile-joined');
  
  if (!profileAvatar || !profileName ||
      !profileTokens || !profileSlots || !profileJoined) {
    
    return;
  }
  
  // Update avatar
  let avatarUrl = '/images/ankleicon.png';
  
  if (userData.avatar) {
    // If avatar is a Discord avatar hash, construct the Discord CDN URL
    if (userData.avatar && !userData.avatar.startsWith('http')) {
      avatarUrl = `https://cdn.discordapp.com/avatars/${userData.discordId}/${userData.avatar}.png`;
    } else if (userData.avatar) {
      avatarUrl = userData.avatar;
    }
  }
  
  profileAvatar.src = avatarUrl;
  
  // Update user info
  profileName.textContent = userData.nickname || userData.username || 'User';
  
  // Update nickname display
  const nicknameValue = document.getElementById('profile-nickname-value');
  if (nicknameValue) {
    nicknameValue.textContent = userData.nickname || 'Not set';
  }
  
  // Update stats
  profileTokens.textContent = userData.tokens || 0;
  profileSlots.textContent = userData.characterSlot !== undefined ? userData.characterSlot : 2;
  
  // Update level
  const profileLevel = document.getElementById('profile-level');
  if (profileLevel && userData.leveling) {
    profileLevel.textContent = userData.leveling.level || 1;
  }
  
  // Update XP
  const profileXP = document.getElementById('profile-xp');
  if (profileXP && userData.leveling) {
    profileXP.textContent = userData.leveling.xp || 0;
  }
  
  // Update birthday
  const profileBirthday = document.getElementById('profile-birthday');
  if (profileBirthday) {
    if (userData.birthday && userData.birthday.month && userData.birthday.day) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      profileBirthday.textContent = `${months[userData.birthday.month - 1]} ${userData.birthday.day}`;
    } else {
      profileBirthday.textContent = 'Not Set';
    }
  }
  
  // Update status
  const profileStatus = document.getElementById('profile-status');
  if (profileStatus) {
    const status = userData.status || 'active';
    profileStatus.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }
  
  // Update help wanted total
  const profileHelpWanted = document.getElementById('profile-help-wanted');
  if (profileHelpWanted && userData.helpWanted) {
    profileHelpWanted.textContent = userData.helpWanted.totalCompletions || 0;
  }
  
  // Update join date - will be updated by loadExtendedProfileData
  profileJoined.textContent = 'Loading...';
  
}

// ------------------- Function: loadExtendedProfileData -------------------
// Loads additional profile data from server if needed
async function loadExtendedProfileData() {
  try {
    
    
    // Fetch guild member information to get actual join date
    const response = await fetch('/api/user/guild-info', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const guildData = await response.json();
    const profileJoined = document.getElementById('profile-joined');
    
    if (profileJoined) {
      if (guildData.joinedAt) {
        const joinDate = new Date(guildData.joinedAt);
        profileJoined.textContent = formatDate(joinDate);
      } else if (guildData.inGuild === false) {
        profileJoined.textContent = 'Not in guild';
      } else {
        // Fallback to database creation date
        if (currentUser && currentUser.createdAt) {
          const joinDate = new Date(currentUser.createdAt);
          profileJoined.textContent = formatDate(joinDate) + ' (Account)';
        } else {
          profileJoined.textContent = 'Unknown';
        }
      }
    }
    
  } catch (error) {
    console.error('[profile.js]: ❌ Error loading extended profile data:', error);
    
    // Fallback to database creation date on error
    const profileJoined = document.getElementById('profile-joined');
    if (profileJoined && currentUser && currentUser.createdAt) {
      const joinDate = new Date(currentUser.createdAt);
      profileJoined.textContent = formatDate(joinDate) + ' (Account)';
    } else if (profileJoined) {
      profileJoined.textContent = 'Unknown';
    }
  }
}

// ------------------- Function: loadUserCharacters -------------------
// Loads and displays the user's characters
async function loadUserCharacters() {
  try {
    
    
    const charactersContainer = document.getElementById('profile-characters-container');
    const charactersCount = document.getElementById('characters-count');
    const charactersLoading = document.getElementById('profile-characters-loading');
    
    if (!charactersContainer || !charactersCount || !charactersLoading) {
      
      return;
    }
    
    // Show loading state
    charactersLoading.style.display = 'flex';
    charactersContainer.innerHTML = '';
    charactersContainer.appendChild(charactersLoading);
    
    // Fetch user's characters from the API
    const response = await fetch('/api/user/characters', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const { data: characters } = await response.json();
    
    // Update character count
    charactersCount.textContent = characters.length;
    
    // Hide loading state
    charactersLoading.style.display = 'none';
    
    if (characters.length === 0) {
      // Show no characters message
      charactersContainer.innerHTML = `
        <div class="profile-no-characters">
          <i class="fas fa-user-slash"></i>
          <h4>No Characters Found</h4>
          <p>You haven't created any characters yet. Start your adventure by creating your first character!</p>
        </div>
      `;
    } else {
      // Create a grid container for character cards
      const charactersGrid = document.createElement('div');
      charactersGrid.className = 'profile-characters-grid';
      
      // Render character cards using the existing character rendering function
      characters.forEach(character => {
        const characterCard = createProfileCharacterCard(character);
        charactersGrid.appendChild(characterCard);
      });
      
      charactersContainer.appendChild(charactersGrid);
    }
    
  } catch (error) {
    
    
    const charactersContainer = document.getElementById('profile-characters-container');
    if (charactersContainer) {
      charactersContainer.innerHTML = `
        <div class="profile-no-characters">
          <i class="fas fa-exclamation-triangle"></i>
          <h4>Error Loading Characters</h4>
          <p>Failed to load your characters. Please try refreshing the page.</p>
        </div>
      `;
    }
  }
}

// ------------------- Function: loadHelpWantedCompletions -------------------
// Loads and displays the user's help wanted quest completions
async function loadHelpWantedCompletions() {
  try {
    
    
    const helpWantedContainer = document.getElementById('profile-help-wanted-container');
    const helpWantedTotalCount = document.getElementById('help-wanted-total-count');
    const helpWantedLoading = document.getElementById('profile-help-wanted-loading');
    
    if (!helpWantedContainer || !helpWantedTotalCount || !helpWantedLoading) {
      
      return;
    }
    
    // Show loading state
    helpWantedLoading.style.display = 'flex';
    helpWantedContainer.innerHTML = '';
    helpWantedContainer.appendChild(helpWantedLoading);
    
    // Check if currentUser has helpWanted data
    if (!currentUser || !currentUser.helpWanted) {
      helpWantedLoading.style.display = 'none';
      helpWantedContainer.innerHTML = `
        <div class="profile-no-help-wanted">
          <i class="fas fa-hands-helping"></i>
          <h4>No Help Wanted Completions</h4>
          <p>You haven't completed any Help Wanted quests yet.</p>
        </div>
      `;
      helpWantedTotalCount.textContent = 0;
      return;
    }
    
    const helpWantedData = currentUser.helpWanted;
    const completions = helpWantedData.completions || [];
    
    // Update total count
    helpWantedTotalCount.textContent = helpWantedData.totalCompletions || completions.length || 0;
    
    // Hide loading state
    helpWantedLoading.style.display = 'none';
    
    if (completions.length === 0) {
      // Show no completions message
      helpWantedContainer.innerHTML = `
        <div class="profile-no-help-wanted">
          <i class="fas fa-hands-helping"></i>
          <h4>No Help Wanted Completions</h4>
          <p>You haven't completed any Help Wanted quests yet.</p>
        </div>
      `;
    } else {
      // Calculate statistics
      const stats = calculateHelpWantedStats(completions);
      
      // Create dashboard
      const dashboard = document.createElement('div');
      dashboard.className = 'help-wanted-dashboard';
      
      dashboard.innerHTML = `
        <div class="hw-stats-grid">
          <div class="hw-stat-card">
            <div class="hw-stat-icon">
              <i class="fas fa-check-circle"></i>
            </div>
            <div class="hw-stat-content">
              <div class="hw-stat-label">Total Completed</div>
              <div class="hw-stat-value">${stats.totalCompleted}</div>
            </div>
          </div>
          
          <div class="hw-stat-card">
            <div class="hw-stat-icon">
              <i class="fas fa-calendar-day"></i>
            </div>
            <div class="hw-stat-content">
              <div class="hw-stat-label">Today</div>
              <div class="hw-stat-value">${stats.today}</div>
            </div>
          </div>
          
          <div class="hw-stat-card">
            <div class="hw-stat-icon">
              <i class="fas fa-calendar-week"></i>
            </div>
            <div class="hw-stat-content">
              <div class="hw-stat-label">This Week</div>
              <div class="hw-stat-value">${stats.thisWeek}</div>
            </div>
          </div>
          
          <div class="hw-stat-card hw-last-quest">
            <div class="hw-stat-icon">
              <i class="fas fa-clock"></i>
            </div>
            <div class="hw-stat-content">
              <div class="hw-stat-label">Last Quest</div>
              <div class="hw-stat-value-small">${stats.lastQuest.type}</div>
              <div class="hw-stat-sublabel">${stats.lastQuest.village} • ${stats.lastQuest.date}</div>
            </div>
          </div>
        </div>
        
        <div class="hw-charts-grid">
          <div class="hw-chart-card">
            <h4><i class="fas fa-map-marked-alt"></i> Villages Helped</h4>
            <div class="hw-chart-container">
              <canvas id="hw-villages-chart"></canvas>
            </div>
            <div class="hw-breakdown">
              ${Object.entries(stats.villageBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([village, count]) => `
                  <div class="hw-breakdown-item">
                    <span class="village-badge ${village.toLowerCase()}">${capitalize(village)}</span>
                    <span class="hw-breakdown-count">${count}</span>
                  </div>
                `).join('')}
            </div>
          </div>
          
          <div class="hw-chart-card">
            <h4><i class="fas fa-tasks"></i> Quest Types</h4>
            <div class="hw-chart-container">
              <canvas id="hw-types-chart"></canvas>
            </div>
            <div class="hw-breakdown">
              ${Object.entries(stats.typeBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => `
                  <div class="hw-breakdown-item">
                    <span class="hw-breakdown-label">${capitalize(type)}</span>
                    <span class="hw-breakdown-count">${count}</span>
                  </div>
                `).join('')}
            </div>
          </div>
        </div>
      `;
      
      helpWantedContainer.appendChild(dashboard);
      
      // Render charts after DOM is updated
      setTimeout(() => {
        renderHelpWantedCharts(stats);
      }, 100);
    }
    
  } catch (error) {
    
    
    const helpWantedContainer = document.getElementById('profile-help-wanted-container');
    if (helpWantedContainer) {
      helpWantedContainer.innerHTML = `
        <div class="profile-no-help-wanted">
          <i class="fas fa-exclamation-triangle"></i>
          <h4>Error Loading Help Wanted Completions</h4>
          <p>Failed to load your help wanted completions. Please try refreshing the page.</p>
        </div>
      `;
    }
  }
}

// ------------------- Function: calculateHelpWantedStats -------------------
// Calculates statistics from help wanted completions
function calculateHelpWantedStats(completions) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  
  // Sort by date (newest first)
  const sorted = [...completions].sort((a, b) => {
    const dateA = new Date(a.timestamp || a.date);
    const dateB = new Date(b.timestamp || b.date);
    return dateB - dateA;
  });
  
  // Calculate counts
  let todayCount = 0;
  let weekCount = 0;
  const villageBreakdown = {};
  const typeBreakdown = {};
  
  completions.forEach(completion => {
    const date = new Date(completion.timestamp || completion.date);
    
    // Count today and this week
    if (date >= today) todayCount++;
    if (date >= weekAgo) weekCount++;
    
    // Village breakdown
    const village = completion.village || 'Unknown';
    villageBreakdown[village] = (villageBreakdown[village] || 0) + 1;
    
    // Type breakdown
    const type = completion.questType || 'Unknown';
    typeBreakdown[type] = (typeBreakdown[type] || 0) + 1;
  });
  
  // Last quest info
  const lastCompletion = sorted[0];
  const lastDate = lastCompletion ? new Date(lastCompletion.timestamp || lastCompletion.date) : null;
  const lastQuest = {
    type: lastCompletion ? capitalize(lastCompletion.questType || 'Unknown') : 'None',
    village: lastCompletion ? capitalize(lastCompletion.village || 'Unknown') : '',
    date: lastDate ? lastDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
  };
  
  return {
    totalCompleted: completions.length,
    today: todayCount,
    thisWeek: weekCount,
    lastQuest,
    villageBreakdown,
    typeBreakdown
  };
}

// ------------------- Function: renderHelpWantedCharts -------------------
// Renders Chart.js charts for help wanted statistics
function renderHelpWantedCharts(stats) {
  try {
    // Check if Chart.js is available
    if (typeof Chart === 'undefined') {
      console.warn('[profile.js]: Chart.js not available for help wanted charts');
      return;
    }
    
    // Villages Chart
    const villagesCanvas = document.getElementById('hw-villages-chart');
    if (villagesCanvas) {
      const villageColors = {
        'Rudania': '#ff6b6b',
        'Inariko': '#4dabf7',
        'Vhintl': '#51cf66',
        'Unknown': '#868e96'
      };
      
      new Chart(villagesCanvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(stats.villageBreakdown),
          datasets: [{
            data: Object.values(stats.villageBreakdown),
            backgroundColor: Object.keys(stats.villageBreakdown).map(v => villageColors[v] || '#868e96'),
            borderWidth: 2,
            borderColor: '#1a1a2e'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 12,
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: '#4dabf7',
              borderWidth: 1
            },
            datalabels: {
              color: '#ffffff',
              font: {
                weight: 'bold',
                size: 14
              },
              formatter: (value) => value
            }
          }
        },
        plugins: [ChartDataLabels]
      });
    }
    
    // Quest Types Chart
    const typesCanvas = document.getElementById('hw-types-chart');
    if (typesCanvas) {
      const typeColors = ['#4dabf7', '#51cf66', '#ff6b6b', '#ffd43b', '#a78bfa', '#f783ac'];
      
      new Chart(typesCanvas, {
        type: 'doughnut',
        data: {
          labels: Object.keys(stats.typeBreakdown),
          datasets: [{
            data: Object.values(stats.typeBreakdown),
            backgroundColor: typeColors,
            borderWidth: 2,
            borderColor: '#1a1a2e'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.8)',
              padding: 12,
              titleColor: '#fff',
              bodyColor: '#fff',
              borderColor: '#4dabf7',
              borderWidth: 1
            },
            datalabels: {
              color: '#ffffff',
              font: {
                weight: 'bold',
                size: 14
              },
              formatter: (value) => value
            }
          }
        },
        plugins: [ChartDataLabels]
      });
    }
  } catch (error) {
    console.error('[profile.js]: Error rendering help wanted charts:', error);
  }
}

// ------------------- Function: loadQuestOverview -------------------
// Loads the user's overall quest stats and participation details
async function loadQuestOverview() {
  try {
    const questsContainer = document.getElementById('profile-quests-container');
    const questsLoading = document.getElementById('profile-quests-loading');
    const questsTotalCount = document.getElementById('quests-total-count');

    if (!questsContainer || !questsLoading) {
      console.warn('[profile.js] ⚠️ Quest overview container not found in DOM');
      return;
    }

    console.log('[profile.js] ▶️ Loading quest overview...');

    questsLoading.style.display = 'flex';
    questsContainer.innerHTML = '';
    questsContainer.appendChild(questsLoading);

    const questTrackingStats = calculateQuestTrackingStats(currentUser?.quests || null);
    console.log('[profile.js] 📊 Quest tracking stats:', questTrackingStats);
    let participationData = null;

    try {
      const response = await fetch('/api/user/quests', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      participationData = await response.json();
      console.log('[profile.js] 📦 Quest participation data received:', participationData);
    } catch (error) {
      console.warn('[profile.js]: ⚠️ Unable to fetch quest participation data:', error);
    }

    questsLoading.style.display = 'none';
    console.log('[profile.js] ✅ Quest API processing complete');

    const hasTracking = questTrackingStats && questTrackingStats.allTimeTotal > 0;
    const hasParticipation = participationData && participationData.totalParticipations > 0;

    if (!hasTracking && !hasParticipation) {
      questsContainer.innerHTML = `
        <div class="profile-no-quests">
          <i class="fas fa-scroll"></i>
          <h4>No Quest Activity Recorded</h4>
          <p>Complete any standard quest to see your progress overview here.</p>
        </div>
      `;
      if (questsTotalCount) {
        questsTotalCount.textContent = '0';
      }
      return;
    }

    if (questsTotalCount) {
      const totalTracked = questTrackingStats?.allTimeTotal ?? participationData?.totalParticipations ?? 0;
      questsTotalCount.textContent = totalTracked;
    }

    const dashboard = document.createElement('div');
    dashboard.className = 'quests-dashboard';

    const sections = [];

    if (questTrackingStats) {
      sections.push(renderQuestStatsGrid(questTrackingStats, participationData));
      const insightsSection = renderQuestInsightsSection(questTrackingStats);
      if (insightsSection) {
        sections.push(insightsSection);
      }
    }

    sections.push(renderQuestParticipationSection(participationData));

    dashboard.innerHTML = sections.filter(Boolean).join('');
    questsContainer.appendChild(dashboard);
    console.log('[profile.js] ✅ Quest overview rendered');

    if (questTrackingStats && Object.keys(questTrackingStats.typeTotals).length > 0) {
      setTimeout(() => {
        renderQuestTypeChart(questTrackingStats.typeTotals);
      }, 100);
    }
  } catch (error) {
    console.error('[profile.js]: ❌ Error loading quest overview:', error);
    const questsContainer = document.getElementById('profile-quests-container');
    if (questsContainer) {
      questsContainer.innerHTML = `
        <div class="profile-no-quests">
          <i class="fas fa-exclamation-triangle"></i>
          <h4>Error Loading Quest Data</h4>
          <p>Please refresh the page to try again.</p>
        </div>
      `;
    }
  }
}

// ------------------- Function: calculateQuestTrackingStats -------------------
// Normalizes quest tracking data from the UserModel
function calculateQuestTrackingStats(questTracking) {
  if (!questTracking) {
    return null;
  }

  const completions = Array.isArray(questTracking.completions) ? [...questTracking.completions] : [];
  completions.sort((a, b) => {
    const dateA = new Date(a.completedAt || a.rewardedAt || 0);
    const dateB = new Date(b.completedAt || b.rewardedAt || 0);
    return dateB - dateA;
  });

  const legacy = questTracking.legacy || {};
  const currentPending = questTracking.pendingTurnIns || 0;
  const legacyPending = legacy.pendingTurnIns || 0;
  const totalPending = currentPending + legacyPending;

  return {
    totalCompleted: questTracking.totalCompleted || completions.length,
    legacyTransferred: legacy.totalTransferred || 0,
    allTimeTotal: (questTracking.totalCompleted || 0) + (legacy.totalTransferred || 0),
    pendingTurnIns: currentPending,
    legacyPending,
    totalPending,
    redeemableSets: Math.floor(totalPending / 10),
    pendingRemainder: totalPending % 10,
    lastCompletion: completions[0] || null,
    recentCompletions: completions.slice(0, 5),
    typeTotals: questTracking.typeTotals || {}
  };
}

// ------------------- Function: renderQuestStatsGrid -------------------
// Builds the summary stat cards for quests
function renderQuestStatsGrid(stats, participationData) {
  const pendingMeta = stats.redeemableSets > 0
    ? `${stats.redeemableSets} set${stats.redeemableSets === 1 ? '' : 's'} ready`
    : `${stats.pendingRemainder} until next set`;

  const lastCompletionLabel = stats.lastCompletion
    ? formatDateOnly(stats.lastCompletion.completedAt || stats.lastCompletion.rewardedAt)
    : 'No completions yet';

  const lastCompletionSubtext = stats.lastCompletion
    ? `${capitalize((stats.lastCompletion.questType || 'Unknown').replace(/_/g, ' '))} • ${escapeHtmlAttribute(stats.lastCompletion.questTitle || stats.lastCompletion.questId || 'Quest')}`
    : 'Complete a quest to populate history';

  const activeCount = participationData?.activeQuests?.length || 0;
  const pendingRewards = participationData?.pendingRewards || 0;

  return `
    <div class="quests-stats-grid">
      <div class="quests-stat-card">
        <span class="quests-stat-label">Total Completed</span>
        <span class="quests-stat-value">${stats.totalCompleted.toLocaleString()}</span>
        <span class="quests-stat-meta">+${stats.legacyTransferred.toLocaleString()} legacy</span>
      </div>
      <div class="quests-stat-card">
        <span class="quests-stat-label">All-Time Progress</span>
        <span class="quests-stat-value">${stats.allTimeTotal.toLocaleString()}</span>
        <span class="quests-stat-meta">Includes legacy transfers</span>
      </div>
      <div class="quests-stat-card">
        <span class="quests-stat-label">Pending Turn-ins</span>
        <span class="quests-stat-value">${stats.totalPending.toLocaleString()}</span>
        <span class="quests-stat-meta">${pendingMeta}</span>
      </div>
      <div class="quests-stat-card">
        <span class="quests-stat-label">Active Quests</span>
        <span class="quests-stat-value">${activeCount}</span>
        <span class="quests-stat-meta">${pendingRewards} awaiting rewards</span>
      </div>
      <div class="quests-stat-card">
        <span class="quests-stat-label">Last Completion</span>
        <span class="quests-stat-value" style="font-size: 1.4rem;">${lastCompletionLabel}</span>
        <span class="quests-stat-meta">${lastCompletionSubtext}</span>
      </div>
    </div>
  `;
}

// ------------------- Function: renderQuestInsightsSection -------------------
// Renders chart + recent completion insights from quest tracking
function renderQuestInsightsSection(stats) {
  const hasTypeTotals = Object.values(stats.typeTotals || {}).some((count) => count > 0);
  const hasRecent = Array.isArray(stats.recentCompletions) && stats.recentCompletions.length > 0;

  if (!hasTypeTotals && !hasRecent) {
    return '';
  }

  const recentList = hasRecent
    ? renderQuestCompletionsList(stats.recentCompletions)
    : '<div class="quests-empty">No recorded completions yet.</div>';

  if (!hasTypeTotals) {
    return `
      <div class="quests-list-card">
        <h4><i class="fas fa-history"></i> Recent Completions</h4>
        ${recentList}
      </div>
    `;
  }

  return `
    <div class="quests-lists-grid">
      <div class="quests-chart-card">
        <h4><i class="fas fa-chart-pie"></i> Quest Type Breakdown</h4>
        <div class="quests-chart-container">
          <canvas id="quests-types-chart"></canvas>
        </div>
        <div class="quests-breakdown">
          ${Object.entries(stats.typeTotals)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => `
              <div class="quests-breakdown-item">
                <span class="quest-type-badge ${getQuestTypeClass(type)}">${capitalize(type.replace(/_/g, ' '))}</span>
                <span>${count}</span>
              </div>
            `).join('')}
        </div>
      </div>
      <div class="quests-list-card">
        <h4><i class="fas fa-history"></i> Recent Completions</h4>
        ${recentList}
      </div>
    </div>
  `;
}

// ------------------- Function: renderQuestParticipationSection -------------------
// Shows active quests and recent quest runs from QuestModel data
function renderQuestParticipationSection(participationData) {
  const activeQuestsHtml = renderQuestParticipationList(participationData?.activeQuests, 'active');

  const recentSource = participationData?.recentCompletions?.length
    ? participationData.recentCompletions
    : (participationData?.participations || []).slice(0, 5);

  const recentQuestsHtml = renderQuestParticipationList(recentSource, 'recent');

  return `
    <div class="quests-lists-grid">
      <div class="quests-list-card">
        <h4><i class="fas fa-hourglass-half"></i> Active Quests</h4>
        ${activeQuestsHtml}
      </div>
      <div class="quests-list-card">
        <h4><i class="fas fa-dragon"></i> Recent Quest Runs</h4>
        ${recentQuestsHtml}
      </div>
    </div>
  `;
}

// ------------------- Function: renderQuestCompletionsList -------------------
// Builds the list of recent quest completions from UserModel
function renderQuestCompletionsList(completions = []) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return '<div class="quests-empty">No recorded completions yet.</div>';
  }

  return `
    <div class="quests-recent-list">
      ${completions.map((completion) => {
        const title = escapeHtmlAttribute(completion.questTitle || completion.questId || 'Quest');
        const typeLabel = capitalize((completion.questType || 'Unknown').replace(/_/g, ' '));
        const completionDate = completion.completedAt || completion.rewardedAt;
        const dateText = completionDate ? formatDateOnly(completionDate) : 'Pending date';
        const rewardText = completion.tokensEarned
          ? `+${completion.tokensEarned.toLocaleString()} tokens`
          : 'No tokens logged';
        return `
          <div class="quests-recent-item">
            <div>
              <h5>${title}</h5>
              <div class="quest-card-meta">${typeLabel} • ${dateText}</div>
            </div>
            <div class="quests-recent-meta">
              <span class="quest-type-badge ${getQuestTypeClass(completion.questType)}">${typeLabel}</span>
              <span class="quests-reward">${rewardText}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ------------------- Function: renderQuestParticipationList -------------------
// Renders quest cards for participation data from QuestModel
function renderQuestParticipationList(quests = [], variant = 'active') {
  const questEntries = Array.isArray(quests) ? quests.filter(Boolean) : [];
  if (questEntries.length === 0) {
    const emptyText = variant === 'active'
      ? 'You are not currently active in any quests.'
      : 'No recent quest activity captured.';
    return `<div class="quests-empty">${emptyText}</div>`;
  }

  return `
    <div class="quests-list">
      ${questEntries.map((quest) => {
        const title = escapeHtmlAttribute(quest.title || quest.questCode || 'Quest');
        const typeLabel = capitalize((quest.questType || 'Unknown').replace(/_/g, ' '));
        const status = formatQuestStatus(quest.participant?.status);
        const timelineDate = variant === 'active'
          ? formatDateOnly(quest.participant?.joinedAt || quest.postedAt || quest.date)
          : formatDateOnly(quest.participant?.completedAt || quest.participant?.rewardedAt || quest.participant?.joinedAt);
        const reward = variant === 'active'
          ? formatQuestReward(null, quest.tokenReward)
          : formatQuestReward(quest.participant?.tokensEarned, quest.tokenReward);
        const progress = formatQuestProgress(quest);
        const village = quest.requiredVillage ? ` • ${capitalize(quest.requiredVillage)}` : '';
        return `
          <div class="quest-card">
            <div class="quest-card-header">
              <div>
                <p class="quest-card-title">${title}</p>
                <p class="quest-card-meta">${typeLabel}${village}</p>
              </div>
              <span class="quest-status ${status.className}">${status.label}</span>
            </div>
            <div class="quest-card-body">
              <div class="quest-card-row">
                <span><i class="fas fa-calendar-alt"></i> ${timelineDate}</span>
                <span><i class="fas fa-award"></i> ${reward}</span>
              </div>
              <div class="quest-card-row">
                <span><i class="fas fa-chart-line"></i> ${progress}</span>
                <span><i class="fas fa-map-marker-alt"></i> ${escapeHtmlAttribute(quest.location || 'Unknown')}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ------------------- Function: formatQuestStatus -------------------
// Maps quest participant statuses to UI labels and classes
function formatQuestStatus(status = 'active') {
  const statusMap = {
    active: { label: 'In Progress', className: 'status-active' },
    completed: { label: 'Awaiting Reward', className: 'status-completed' },
    rewarded: { label: 'Rewarded', className: 'status-rewarded' },
    failed: { label: 'Failed', className: 'status-failed' },
    disqualified: { label: 'Disqualified', className: 'status-disqualified' }
  };

  return statusMap[status] || { label: capitalize(status || 'Unknown'), className: 'status-active' };
}

// ------------------- Function: formatQuestReward -------------------
// Formats quest rewards for display
function formatQuestReward(tokensEarned, tokenReward) {
  if (typeof tokensEarned === 'number' && tokensEarned > 0) {
    return `+${tokensEarned.toLocaleString()} tokens`;
  }

  if (!tokenReward && tokenReward !== 0) {
    return 'No reward listed';
  }

  if (typeof tokenReward === 'number') {
    return `${tokenReward.toLocaleString()} tokens`;
  }

  return escapeHtmlAttribute(String(tokenReward));
}

// ------------------- Function: formatQuestProgress -------------------
// Provides human readable progress text based on quest type
function formatQuestProgress(quest) {
  const participant = quest.participant || {};

  if (quest.questType === 'RP') {
    return `${participant.rpPostCount || 0} RP posts logged`;
  }

  if (quest.questType === 'Interactive') {
    return `${participant.successfulRolls || 0} successful rolls`;
  }

  const submissions = participant.submissions || 0;
  return `${submissions} submission${submissions === 1 ? '' : 's'} recorded`;
}

// ------------------- Function: getQuestTypeClass -------------------
// Returns a class name for quest type badges
function getQuestTypeClass(type = '') {
  if (!type) return '';
  return `quest-type-${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

// ------------------- Function: renderQuestTypeChart -------------------
// Renders the quest type breakdown chart
function renderQuestTypeChart(typeTotals = {}) {
  if (typeof Chart === 'undefined') {
    console.warn('[profile.js]: Chart.js not available for quest charts');
    return;
  }

  const canvas = document.getElementById('quests-types-chart');
  if (!canvas) {
    return;
  }

  const entries = Object.entries(typeTotals).filter(([, count]) => count > 0);
  if (!entries.length) {
    return;
  }

  const labels = entries.map(([type]) => capitalize(type.replace(/_/g, ' ')));
  const data = entries.map(([, count]) => count);
  const colors = ['#ffd43b', '#4dabf7', '#ff6b6b', '#51cf66', '#a78bfa', '#f783ac', '#f8c291'];

  const plugins = [];
  if (typeof ChartDataLabels !== 'undefined') {
    plugins.push(ChartDataLabels);
  }

  new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 2,
        borderColor: '#1a1a2e'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          padding: 12,
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#ffd43b',
          borderWidth: 1
        },
        datalabels: {
          color: '#ffffff',
          font: { weight: 'bold', size: 14 },
          formatter: (value) => value
        }
      }
    },
    plugins
  });
}

// ------------------- Function: createProfileCharacterCard -------------------
// Creates a simplified character card for the profile page
function createProfileCharacterCard(character) {
  const card = document.createElement('div');
  card.className = 'profile-character-card';
  card.setAttribute('data-character', character.name);
  
  // Determine character status
  let statusClass = '';
  let statusText = '';
  let statusIcon = '';
  
  if (character.blighted) {
    statusClass = 'blighted';
    statusText = 'Blighted';
    statusIcon = 'fas fa-skull';
  } else if (character.ko) {
    statusClass = 'ko';
    statusText = 'KO\'d';
    statusIcon = 'fas fa-heart-broken';
  } else {
    statusClass = 'online';
    statusText = 'Active';
    statusIcon = 'fas fa-heart';
  }
  
  // Check if character has rolled today
  const hasRolledToday = checkIfCharacterRolledToday(character);
  const rollStatus = hasRolledToday ? 
    '<div class="profile-character-roll-status rolled"><i class="fas fa-dice"></i> Rolled today</div>' :
    '<div class="profile-character-roll-status not-rolled"><i class="fas fa-clock"></i> Has not rolled today</div>';
  
  // Format character icon URL
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  // Get village information
  const currentVillage = character.currentVillage || character.homeVillage || 'Unknown';
  const homeVillage = character.homeVillage || 'Unknown';
  const isVisiting = currentVillage !== homeVillage;
  
  card.innerHTML = `
    <div class="profile-character-header">
      <img 
        src="${iconUrl}" 
        alt="${character.name}" 
        class="profile-character-avatar"
        onerror="this.src='/images/ankleicon.png'"
      >
      <div class="profile-character-info">
        <h4 class="profile-character-name">${character.name}</h4>
        <p class="profile-character-details">
          ${character.race ? capitalize(character.race) : ''}
          ${character.race && character.job ? ' • ' : ''}
          ${character.job ? capitalize(character.job) : ''}
        </p>
        <p class="profile-character-village">
          <i class="fas fa-map-marker-alt"></i>
          ${isVisiting ? `Visiting ${capitalize(currentVillage)}` : `Home: ${capitalize(homeVillage)}`}
          ${isVisiting ? ` (from ${capitalize(homeVillage)})` : ''}
        </p>
      </div>
    </div>
    
    <div class="profile-character-stats">
      <div class="profile-character-stat">
        <span class="profile-character-stat-label">Hearts</span>
        <span class="profile-character-stat-value">${character.currentHearts}/${character.maxHearts}</span>
      </div>
      <div class="profile-character-stat">
        <span class="profile-character-stat-label">Stamina</span>
        <span class="profile-character-stat-value">${character.currentStamina}/${character.maxStamina}</span>
      </div>
    </div>
    
    <div class="profile-character-status ${statusClass}">
      <i class="${statusIcon}"></i>
      <span>${statusText}</span>
    </div>
    
    ${rollStatus}
  `;
  
  // Add click handler to show character details modal
  card.addEventListener('click', () => {
    showCharacterModal(character);
  });
  
  return card;
}

// ------------------- Function: showCharacterModal -------------------
// Shows a modal with detailed character information
function showCharacterModal(character) {
  
  // Create modal container
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  
  // Create modal content using CSS classes
  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  
  // Format character icon URL
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  // Determine character status
  let statusClass = '';
  let statusText = '';
  let statusIcon = '';
  
  if (character.blighted) {
    statusClass = 'blighted';
    statusText = 'Blighted';
    statusIcon = 'fas fa-skull';
  } else if (character.ko) {
    statusClass = 'ko';
    statusText = 'KO\'d';
    statusIcon = 'fas fa-heart-broken';
  } else {
    statusClass = 'online';
    statusText = 'Active';
    statusIcon = 'fas fa-heart';
  }
  
  modalContent.innerHTML = `
    <div class="character-modal-header">
      <div style="display: flex; align-items: center; gap: 1.5rem;">
        <img 
          src="${iconUrl}" 
          alt="${character.name}" 
          style="
            width: 60px;
            height: 60px;
            border-radius: 50%;
            object-fit: cover;
            border: 3px solid var(--border-color);
          "
          onerror="this.src='/images/ankleicon.png'"
        >
        <div>
          <h2 style="margin: 0 0 0.5rem 0; color: var(--text-color); font-size: 1.8rem;">${character.name}</h2>
          <p style="margin: 0 0 0.5rem 0; color: var(--text-secondary);">
            ${character.race ? capitalize(character.race) : ''}
            ${character.race && character.job ? ' • ' : ''}
            ${character.job ? capitalize(character.job) : ''}
          </p>
          <div class="character-status ${statusClass}" style="
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.25rem 0.75rem;
            border-radius: 1rem;
            font-size: 0.9rem;
            font-weight: 500;
            background: ${statusClass === 'blighted' ? 'var(--blight-border)' : statusClass === 'ko' ? '#f44336' : 'var(--success-color)'};
            color: white;
          ">
            <i class="${statusIcon}"></i>
            <span>${statusText}</span>
          </div>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <button class="export-character-btn" data-character-id="${character._id}" style="
          padding: 0.5rem 1rem;
          background: #4CAF50;
          color: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: background 0.2s;
        " onmouseover="this.style.background='#45a049'" onmouseout="this.style.background='#4CAF50'" title="Export all character data">
          <i class="fas fa-download"></i>
          Export Data
        </button>
        <button class="edit-character-btn" data-character-id="${character._id}" style="
          padding: 0.5rem 1rem;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: background 0.2s;
        " onmouseover="this.style.background='var(--primary-hover)'" onmouseout="this.style.background='var(--primary-color)'">
          <i class="fas fa-edit"></i>
          Edit
        </button>
        <button class="close-modal">&times;</button>
      </div>
    </div>
    
    <div class="character-modal-body">
      <div class="character-modal-section">
        <h3>Basic Info</h3>
        <div class="character-modal-grid">
          <div class="character-modal-item">
            <span class="label">Race:</span>
            <span class="value">${character.race ? capitalize(character.race) : 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Job:</span>
            <span class="value">${character.job ? capitalize(character.job) : 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Home Village:</span>
            <span class="value">${character.homeVillage ? capitalize(character.homeVillage) : 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Current Village:</span>
            <span class="value">${character.currentVillage ? capitalize(character.currentVillage) : 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Pronouns:</span>
            <span class="value">${character.pronouns || 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Age:</span>
            <span class="value">${character.age || 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Birthday:</span>
            <span class="value">${character.birthday || 'Unknown'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Height:</span>
            <span class="value">${character.height ? `${character.height} cm | ${convertCmToFeetInches(character.height)}` : 'Unknown'}</span>
          </div>
        </div>
      </div>

      <div class="character-modal-section">
        <h3>Stats</h3>
        <div class="character-modal-grid">
          <div class="character-modal-item">
            <span class="label">Hearts:</span>
            <span class="value">${character.currentHearts}/${character.maxHearts}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Stamina:</span>
            <span class="value">${character.currentStamina}/${character.maxStamina}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Attack:</span>
            <span class="value">${character.attack || 0}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Defense:</span>
            <span class="value">${character.defense || 0}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Spirit Orbs:</span>
            <span class="value">${character.spiritOrbs || 0}</span>
          </div>
        </div>
      </div>

      <div class="character-modal-section">
        <h3>Gear</h3>
        <div class="character-modal-grid">
          <div class="character-modal-item">
            <span class="label">Weapon:</span>
            <span class="value">${character.gearWeapon?.name ? `${character.gearWeapon.name} | ${getGearStat(character.gearWeapon, 'modifierHearts')}` : 'None'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Shield:</span>
            <span class="value">${character.gearShield?.name ? `${character.gearShield.name} | ${getGearStat(character.gearShield, 'modifierHearts')}` : 'None'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Head:</span>
            <span class="value">${character.gearArmor?.head?.name ? `${character.gearArmor.head.name} | ${getGearStat(character.gearArmor.head, 'modifierHearts')}` : 'None'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Chest:</span>
            <span class="value">${character.gearArmor?.chest?.name ? `${character.gearArmor.chest.name} | ${getGearStat(character.gearArmor.chest, 'modifierHearts')}` : 'None'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Legs:</span>
            <span class="value">${character.gearArmor?.legs?.name ? `${character.gearArmor.legs.name} | ${getGearStat(character.gearArmor.legs, 'modifierHearts')}` : 'None'}</span>
          </div>
        </div>
      </div>

      <div class="character-modal-section">
        <h3>Status</h3>
        <div class="character-modal-grid">
          <div class="character-modal-item">
            <span class="label">Blighted:</span>
            <span class="value">${character.blighted ? 'Yes' : 'No'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Blight Stage:</span>
            <span class="value">${character.blightStage ?? 0}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">KO'd:</span>
            <span class="value">${character.ko ? 'Yes' : 'No'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">In Jail:</span>
            <span class="value">${character.inJail ? `Yes${character.jailReleaseTime ? ' | Until ' + new Date(character.jailReleaseTime).toLocaleDateString() : ''}` : 'No'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Debuff:</span>
            <span class="value">${character.debuff?.active
              ? `Debuffed${character.debuff.endDate ? ' | Ends ' + new Date(character.debuff.endDate).toLocaleDateString() : ''}`
              : 'Not Debuffed'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Buff:</span>
            <span class="value">${character.buff?.active ? `Active (${capitalize(character.buff.type || 'Unknown')})` : 'None'}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Last Stamina Usage:</span>
            <span class="value">${formatDateOnly(character.lastStaminaUsage)}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Job Changed:</span>
            <span class="value">${formatDateOnly(character.jobDateChanged)}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Steal Protection:</span>
            <span class="value">${
              !character.canBeStolenFrom || character.stealProtection?.isProtected
                ? 'Protected' 
                : 'Not Protected'
            }</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Failed Steal Attempts:</span>
            <span class="value">${character.failedStealAttempts || 0}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Failed Flee Attempts:</span>
            <span class="value">${character.failedFleeAttempts || 0}</span>
          </div>
        </div>
      </div>
      
      <div class="character-modal-section">
        <h3>Additional Details</h3>
        <div class="character-modal-grid">
          ${character.jobVoucher ? `
          <div class="character-modal-item">
            <span class="label">Job Voucher:</span>
            <span class="value">Active${character.jobVoucherJob ? ` (${capitalize(character.jobVoucherJob)})` : ''}</span>
          </div>
          ` : ''}
          ${character.boostedBy ? `
          <div class="character-modal-item">
            <span class="label">Boosted By:</span>
            <span class="value">${character.boostedBy}</span>
          </div>
          ` : ''}
          ${character.helpWanted?.lastCompletion ? `
          <div class="character-modal-item">
            <span class="label">Last Help Wanted:</span>
            <span class="value">${character.helpWanted.lastCompletion}</span>
          </div>
          ` : ''}
          ${character.helpWanted?.completions?.length ? `
          <div class="character-modal-item">
            <span class="label">Help Wanted Completions:</span>
            <span class="value">${character.helpWanted.completions.length}</span>
          </div>
          ` : ''}
          ${character.currentActivePet ? `
          <div class="character-modal-item">
            <span class="label">Active Pet:</span>
            <span class="value">${character.currentActivePet}</span>
          </div>
          ` : ''}
          ${character.currentActiveMount ? `
          <div class="character-modal-item">
            <span class="label">Active Mount:</span>
            <span class="value">${character.currentActiveMount}</span>
          </div>
          ` : ''}
        </div>
      </div>
      
      ${character.vendorType ? `
      <div class="character-modal-section">
        <h3>Vendor Info</h3>
        <div class="character-modal-grid">
          <div class="character-modal-item">
            <span class="label">Vendor Type:</span>
            <span class="value">${capitalize(character.vendorType)}</span>
          </div>
          <div class="character-modal-item">
            <span class="label">Vending Points:</span>
            <span class="value">${character.vendingPoints || 0}</span>
          </div>
          ${character.shopPouch ? `
          <div class="character-modal-item">
            <span class="label">Shop Pouch:</span>
            <span class="value">${character.shopPouch}</span>
          </div>
          ` : ''}
          ${character.pouchSize ? `
          <div class="character-modal-item">
            <span class="label">Pouch Size:</span>
            <span class="value">${character.pouchSize}</span>
          </div>
          ` : ''}
        </div>
      </div>
      ` : ''}

      <div class="character-modal-section">
        <h3>Links</h3>
        <div class="character-modal-links">
          ${character.appLink ? `
            <a href="${character.appLink}" target="_blank">
              <i class="fas fa-external-link-alt"></i>
              Character Sheet
            </a>
          ` : ''}
          ${character.inventory ? `
            <a href="${character.inventory}" target="_blank">
              <i class="fas fa-backpack"></i>
              Inventory
            </a>
          ` : ''}
          ${character.shopLink ? `
            <a href="${character.shopLink}" target="_blank">
              <i class="fas fa-store"></i>
              Shop
            </a>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  // Add close functionality
  const closeBtn = modal.querySelector('.close-modal');
  closeBtn?.addEventListener('click', () => {
    modal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
    }
  });
  
  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => {
        if (modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Add export button functionality
  const exportBtn = modal.querySelector('.export-character-btn');
  exportBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      // Disable button and show loading state
      const originalHTML = exportBtn.innerHTML;
      exportBtn.disabled = true;
      exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
      
      // Fetch the export data
      const response = await fetch(`/api/characters/${character._id}/export`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }
      
      // Get the data as JSON
      const exportData = await response.json();
      
      // Normalize character name for filenames (lowercase, replace spaces with underscores)
      const fileBaseName = character.name.toLowerCase().replace(/\s+/g, '_');
      
      // Create a new JSZip instance
      const zip = new JSZip();
      let filesAdded = 0;
      
      // Add character data
      if (exportData.character) {
        zip.file(`${fileBaseName}.character.json`, JSON.stringify(exportData.character, null, 2));
        filesAdded++;
      }
      
      // Add inventory data
      if (exportData.inventory && exportData.inventory.length > 0) {
        zip.file(`${fileBaseName}.inventory.json`, JSON.stringify(exportData.inventory, null, 2));
        filesAdded++;
      }
      
      // Add pets data
      if (exportData.pets && exportData.pets.length > 0) {
        zip.file(`${fileBaseName}.pets.json`, JSON.stringify(exportData.pets, null, 2));
        filesAdded++;
      }
      
      // Add mounts data
      if (exportData.mounts && exportData.mounts.length > 0) {
        zip.file(`${fileBaseName}.mounts.json`, JSON.stringify(exportData.mounts, null, 2));
        filesAdded++;
      }
      
      // Add relationships data
      if (exportData.relationships && exportData.relationships.length > 0) {
        zip.file(`${fileBaseName}.relationships.json`, JSON.stringify(exportData.relationships, null, 2));
        filesAdded++;
      }
      
      // Add quests data
      if (exportData.quests && exportData.quests.length > 0) {
        zip.file(`${fileBaseName}.quests.json`, JSON.stringify(exportData.quests, null, 2));
        filesAdded++;
      }
      
      // Add parties data
      if (exportData.parties && exportData.parties.length > 0) {
        zip.file(`${fileBaseName}.parties.json`, JSON.stringify(exportData.parties, null, 2));
        filesAdded++;
      }
      
      // Add raids data
      if (exportData.raids && exportData.raids.length > 0) {
        zip.file(`${fileBaseName}.raids.json`, JSON.stringify(exportData.raids, null, 2));
        filesAdded++;
      }
      
      // Add steal stats data
      if (exportData.stealStats) {
        zip.file(`${fileBaseName}.stealstats.json`, JSON.stringify(exportData.stealStats, null, 2));
        filesAdded++;
      }
      
      // Add blight history data
      if (exportData.blightHistory && exportData.blightHistory.length > 0) {
        zip.file(`${fileBaseName}.blighthistory.json`, JSON.stringify(exportData.blightHistory, null, 2));
        filesAdded++;
      }
      
      // Add metadata file
      const metadata = {
        exportDate: exportData.exportDate,
        exportedBy: exportData.exportedBy,
        characterName: character.name,
        characterId: character._id,
        isModCharacter: exportData.isModCharacter,
        filesExported: filesAdded
      };
      zip.file(`${fileBaseName}.metadata.json`, JSON.stringify(metadata, null, 2));
      filesAdded++;
      
      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Download the zip file
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileBaseName}_export_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Show success message
      exportBtn.innerHTML = `<i class="fas fa-check"></i> Exported (${filesAdded} files)`;
      exportBtn.style.background = '#4CAF50';
      
      setTimeout(() => {
        exportBtn.innerHTML = originalHTML;
        exportBtn.disabled = false;
      }, 3000);
      
    } catch (error) {
      console.error('[profile.js]: Error exporting character data:', error);
      exportBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Export Failed';
      exportBtn.style.background = '#f44336';
      
      setTimeout(() => {
        exportBtn.innerHTML = '<i class="fas fa-download"></i> Export Data';
        exportBtn.disabled = false;
        exportBtn.style.background = '#4CAF50';
      }, 3000);
    }
  });
  
  // Add edit button functionality
  const editBtn = modal.querySelector('.edit-character-btn');
  editBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showEditCharacterModal(character, modal);
  });
}

// ------------------- Function: showEditCharacterModal -------------------
// Shows a modal to edit character information
function showEditCharacterModal(character, parentModal) {
  
  // Format character icon URL
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  // Create edit modal container
  const editModal = document.createElement('div');
  editModal.className = 'character-modal';
  editModal.style.zIndex = '10001'; // Higher than parent modal
  
  const editModalContent = document.createElement('div');
  editModalContent.className = 'character-modal-content';
  editModalContent.style.maxWidth = '600px';
  
  editModalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-edit"></i> Edit Character: ${character.name}
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    
    <div class="character-modal-body">
      <form id="edit-character-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        
        <div class="form-group">
          <label for="edit-age" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Age
          </label>
          <input 
            type="number" 
            id="edit-age" 
            name="age" 
            value="${character.age || ''}"
            placeholder="Enter age"
            min="0"
            style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              background: var(--input-bg);
              color: var(--text-color);
              font-size: 1rem;
            "
          />
        </div>
        
        <div class="form-group">
          <label for="edit-pronouns" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Pronouns
          </label>
          <input 
            type="text" 
            id="edit-pronouns" 
            name="pronouns" 
            value="${character.pronouns || ''}"
            placeholder="e.g., he/him, she/her, they/them"
            style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              background: var(--input-bg);
              color: var(--text-color);
              font-size: 1rem;
            "
          />
        </div>
        
        <div class="form-group">
          <label for="edit-height" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Height (cm)
          </label>
          <input 
            type="number" 
            id="edit-height" 
            name="height" 
            value="${character.height || ''}"
            placeholder="Enter height in centimeters"
            min="0"
            style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              background: var(--input-bg);
              color: var(--text-color);
              font-size: 1rem;
            "
          />
          ${character.height ? `<small style="color: var(--text-secondary); margin-top: 0.25rem; display: block;">${convertCmToFeetInches(character.height)}</small>` : ''}
        </div>
        
        <div class="form-group">
          <label for="edit-birthday" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Birthday (MM-DD)
          </label>
          <input 
            type="text" 
            id="edit-birthday" 
            name="birthday" 
            value="${character.birthday || ''}"
            placeholder="MM-DD (e.g., 01-15, 12-25)"
            pattern="^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$"
            maxlength="5"
            style="
              width: 100%;
              padding: 0.75rem;
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              background: var(--input-bg);
              color: var(--text-color);
              font-size: 1rem;
            "
          />
          <small style="color: var(--text-secondary); margin-top: 0.5rem; display: block;">
            Format: MM-DD (e.g., 01-15 for January 15th, 12-25 for December 25th)
          </small>
        </div>
        
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input 
              type="checkbox" 
              id="edit-can-be-stolen-from" 
              name="canBeStolenFrom" 
              ${character.canBeStolenFrom !== false ? 'checked' : ''}
              style="
                width: 18px;
                height: 18px;
                cursor: pointer;
              "
            />
            <span style="font-weight: 500; color: var(--text-color);">Allow This Character to be Stolen From</span>
          </label>
          <small style="color: var(--text-secondary); margin-top: 0.5rem; display: block;">
            When unchecked, this character will be permanently protected from all steal attempts (opt-out of stealing mechanic).
          </small>
        </div>
        
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
          <button 
            type="button" 
            class="cancel-edit-btn"
            style="
              padding: 0.75rem 1.5rem;
              background: var(--card-bg);
              color: var(--text-color);
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
              transition: background 0.2s;
            "
          >
            Cancel
          </button>
          <button 
            type="submit"
            style="
              padding: 0.75rem 1.5rem;
              background: var(--primary-color);
              color: white;
              border: none;
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
              transition: background 0.2s;
              display: flex;
              align-items: center;
              gap: 0.5rem;
            "
          >
            <i class="fas fa-save"></i>
            Save Changes
          </button>
        </div>
      </form>
    </div>
  `;
  
  editModal.appendChild(editModalContent);
  document.body.appendChild(editModal);
  
  // Add birthday input formatting helper
  const birthdayInput = editModal.querySelector('#edit-birthday');
  birthdayInput.addEventListener('input', (e) => {
    let value = e.target.value.replace(/\D/g, ''); // Remove non-digits
    
    if (value.length >= 2) {
      value = value.slice(0, 2) + '-' + value.slice(2, 4);
    }
    
    e.target.value = value.slice(0, 5); // Max length MM-DD
  });
  
  // Handle form submission
  const form = editModal.querySelector('#edit-character-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Validate birthday format if provided
    const birthdayValue = form.birthday.value.trim();
    if (birthdayValue && !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(birthdayValue)) {
      showProfileMessage('Birthday must be in MM-DD format (e.g., 01-15)', 'error');
      return;
    }
    
    try {
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
      
      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append('age', parseInt(form.age.value) || '');
      formData.append('pronouns', form.pronouns.value.trim());
      formData.append('height', parseInt(form.height.value) || '');
      formData.append('birthday', birthdayValue);
      formData.append('canBeStolenFrom', form.canBeStolenFrom.checked);
      
      const response = await fetch(`/api/characters/${character._id}/profile`, {
        method: 'PATCH',
        credentials: 'include',
        body: formData
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update character');
      }
      
      const result = await response.json();
      
      showProfileMessage('Character updated successfully!', 'success');
      
      // Close edit modal
      editModal.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => {
        if (editModal.parentNode) {
          editModal.parentNode.removeChild(editModal);
        }
      }, 300);
      
      // Close parent modal and reload characters
      if (parentModal && parentModal.parentNode) {
        parentModal.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
          if (parentModal.parentNode) {
            parentModal.parentNode.removeChild(parentModal);
          }
        }, 300);
      }
      
      // Reload the character list
      await loadUserCharacters();
      
    } catch (error) {
      console.error('[profile.js]: ❌ Error updating character:', error);
      showProfileMessage(error.message || 'Failed to update character', 'error');
      
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
    }
  });
  
  // Handle cancel button
  const cancelBtn = editModal.querySelector('.cancel-edit-btn');
  cancelBtn.addEventListener('click', () => {
    editModal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (editModal.parentNode) {
        editModal.parentNode.removeChild(editModal);
      }
    }, 300);
  });
  
  // Handle close button
  const closeBtn = editModal.querySelector('.close-modal');
  closeBtn.addEventListener('click', () => {
    editModal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (editModal.parentNode) {
        editModal.parentNode.removeChild(editModal);
      }
    }, 300);
  });
  
  // Handle modal background click
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      editModal.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => {
        if (editModal.parentNode) {
          editModal.parentNode.removeChild(editModal);
        }
      }, 300);
    }
  });
}

// ------------------- Function: getGearStat -------------------
// Returns a stat string with + prefix if positive
function getGearStat(gear, statName) {
  if (!gear || !gear[statName]) return '';
  const value = gear[statName];
  return value > 0 ? `+${value}` : value;
}

// ------------------- Function: formatPrettyDate -------------------
// Converts a date string into a human-readable format
function formatPrettyDate(date) {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

// ------------------- Function: formatDateOnly -------------------
// Converts a date string into a date-only format (no time)
function formatDateOnly(date) {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString();
}

// ------------------- Function: convertCmToFeetInches -------------------
// Converts centimeters to feet and inches format
function convertCmToFeetInches(heightInCm) {
  const totalInches = heightInCm / 2.54;
  const feet = Math.floor(totalInches / 12);
  const inches = Math.round(totalInches % 12);
  return `${feet}'${inches}"`;
}

// ============================================================================
// ------------------- Section: Event Listeners -------------------
// Sets up profile page event listeners
// ============================================================================

// ------------------- Function: setupProfileEventListeners -------------------
// Sets up all profile page event listeners
function setupProfileEventListeners() {
  
  // Profile link in user dropdown
  const profileLink = document.getElementById('profile-link');
  if (profileLink) {
    profileLink.addEventListener('click', handleProfileLinkClick);
  }
  
  // Export all user data button
  const exportAllBtn = document.getElementById('export-all-user-data-btn');
  if (exportAllBtn) {
    exportAllBtn.addEventListener('click', handleExportAllUserData);
  }
  
  // Manage vending shops button
  const manageVendingBtn = document.getElementById('manage-vending-shops-btn');
  if (manageVendingBtn) {
    manageVendingBtn.addEventListener('click', () => {
      window.location.hash = '#vending';
      const navEvent = new CustomEvent('navigateToSection', { 
        detail: { section: 'vending-section' } 
      });
      document.dispatchEvent(navEvent);
    });
  }
  
  // Nickname editing buttons
  const editNicknameBtn = document.getElementById('edit-nickname-btn');
  const saveNicknameBtn = document.getElementById('save-nickname-btn');
  const cancelNicknameBtn = document.getElementById('cancel-nickname-btn');
  
  if (editNicknameBtn) {
    editNicknameBtn.addEventListener('click', handleEditNickname);
  }
  
  if (saveNicknameBtn) {
    saveNicknameBtn.addEventListener('click', handleSaveNickname);
  }
  
  if (cancelNicknameBtn) {
    cancelNicknameBtn.addEventListener('click', handleCancelNickname);
  }
  
  // Listen for custom navigation events
  document.addEventListener('navigateToSection', (event) => {
    if (event.detail.section === 'profile-section') {
      // The section will be shown by the main navigation handler
      // We just need to initialize the profile page
      setTimeout(() => {
        initProfilePage();
      }, 100);
    }
  });
  
}

// ============================================================================
// ------------------- Section: Profile Actions -------------------
// Handles profile page action buttons
// ============================================================================

// ------------------- Function: handleProfileLinkClick -------------------
// Handles profile link click from user dropdown
function handleProfileLinkClick(event) {
  event.preventDefault();
  
  // Close the user dropdown
  const userDropdown = document.getElementById('user-dropdown');
  if (userDropdown) {
    userDropdown.classList.remove('show');
  }
  
  // Navigate to profile section
  window.location.hash = '#profile';
  // Trigger the profile section display
  const navEvent = new CustomEvent('navigateToSection', { 
    detail: { section: 'profile-section' } 
  });
  document.dispatchEvent(navEvent);
}

// ------------------- Function: handleExportAllUserData -------------------
// Handles exporting all user data (all characters and related data)
async function handleExportAllUserData(event) {
  const btn = event.target.closest('button');
  
  try {
    // Disable button and show loading state
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting all data...';
    
    // Fetch the export data
    const response = await fetch('/api/user/export-all', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status}`);
    }
    
    // Get the data as JSON
    const exportData = await response.json();
    
    // Get username for filename
    const username = currentUser?.username || 'user';
    const fileBaseName = username.toLowerCase().replace(/\s+/g, '_');
    
    // Create a new JSZip instance
    const zip = new JSZip();
    let filesAdded = 0;
    
    // Add user data
    if (exportData.user) {
      zip.file(`${fileBaseName}.user.json`, JSON.stringify(exportData.user, null, 2));
      filesAdded++;
    }
    
    // Add each character's data as separate files
    for (const charData of exportData.characters) {
      const charName = charData.character.name.toLowerCase().replace(/\s+/g, '_');
      
      // Add character profile
      if (charData.character) {
        zip.file(`${charName}.character.json`, JSON.stringify(charData.character, null, 2));
        filesAdded++;
      }
      
      // Add inventory
      if (charData.inventory && charData.inventory.length > 0) {
        zip.file(`${charName}.inventory.json`, JSON.stringify(charData.inventory, null, 2));
        filesAdded++;
      }
      
      // Add pets
      if (charData.pets && charData.pets.length > 0) {
        zip.file(`${charName}.pets.json`, JSON.stringify(charData.pets, null, 2));
        filesAdded++;
      }
      
      // Add mounts
      if (charData.mounts && charData.mounts.length > 0) {
        zip.file(`${charName}.mounts.json`, JSON.stringify(charData.mounts, null, 2));
        filesAdded++;
      }
      
      // Add relationships
      if (charData.relationships && charData.relationships.length > 0) {
        zip.file(`${charName}.relationships.json`, JSON.stringify(charData.relationships, null, 2));
        filesAdded++;
      }
      
      // Add quests
      if (charData.quests && charData.quests.length > 0) {
        zip.file(`${charName}.quests.json`, JSON.stringify(charData.quests, null, 2));
        filesAdded++;
      }
      
      // Add steal stats
      if (charData.stealStats) {
        zip.file(`${charName}.stealstats.json`, JSON.stringify(charData.stealStats, null, 2));
        filesAdded++;
      }
      
      // Add blight history
      if (charData.blightHistory && charData.blightHistory.length > 0) {
        zip.file(`${charName}.blighthistory.json`, JSON.stringify(charData.blightHistory, null, 2));
        filesAdded++;
      }
    }
    
    // Add parties (user-level)
    if (exportData.parties && exportData.parties.length > 0) {
      zip.file(`${fileBaseName}.parties.json`, JSON.stringify(exportData.parties, null, 2));
      filesAdded++;
    }
    
    // Add raids (user-level)
    if (exportData.raids && exportData.raids.length > 0) {
      zip.file(`${fileBaseName}.raids.json`, JSON.stringify(exportData.raids, null, 2));
      filesAdded++;
    }
    
    // Add metadata file
    const metadata = {
      exportDate: exportData.exportDate,
      userId: exportData.userId,
      username: username,
      totalCharacters: exportData.characters.length,
      filesExported: filesAdded
    };
    zip.file(`${fileBaseName}.metadata.json`, JSON.stringify(metadata, null, 2));
    filesAdded++;
    
    // Generate the zip file
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    
    // Download the zip file
    const url = window.URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileBaseName}_complete_export_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    // Show success message
    btn.innerHTML = `<i class="fas fa-check"></i> Exported (${filesAdded} files)`;
    btn.style.background = '#4CAF50';
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }, 4000);
    
  } catch (error) {
    console.error('[profile.js]: Error exporting all user data:', error);
    btn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Export Failed';
    btn.style.background = '#f44336';
    
    setTimeout(() => {
      btn.innerHTML = '<i class="fas fa-file-download"></i> Export All Data';
      btn.disabled = false;
      btn.style.background = '#4CAF50';
    }, 3000);
  }
}

// ============================================================================
// ------------------- Section: Utility Functions -------------------
// Helper functions for profile functionality
// ============================================================================

// ------------------- Function: formatDate -------------------
// Formats a date for display
function formatDate(date) {
  try {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch (error) {
    
    return 'Unknown';
  }
}

// ------------------- Function: showProfileMessage -------------------
// Shows a message on the profile page
function showProfileMessage(message, type = 'info') {
  
  
  // Create a temporary message element
  const messageElement = document.createElement('div');
  messageElement.className = `profile-message ${type}`;
  messageElement.textContent = message;
  messageElement.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    padding: 1rem 1.5rem;
    border-radius: 0.5rem;
    color: white;
    font-weight: 500;
    z-index: 10000;
    animation: slideInRight 0.3s ease;
    max-width: 300px;
  `;
  
  // Set background color based on type
  switch (type) {
    case 'success':
      messageElement.style.background = '#4CAF50';
      break;
    case 'error':
      messageElement.style.background = '#f44336';
      break;
    case 'warning':
      messageElement.style.background = '#ff9800';
      break;
    default:
      messageElement.style.background = '#2196F3';
  }
  
  // Add to page
  document.body.appendChild(messageElement);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (messageElement.parentNode) {
      messageElement.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        if (messageElement.parentNode) {
          messageElement.parentNode.removeChild(messageElement);
        }
      }, 300);
    }
  }, 3000);
}

// ------------------- Function: showProfileError -------------------
// Shows an error message on the profile page
function showProfileError(message) {
  showProfileMessage(message, 'error');
}

// ============================================================================
// ------------------- Section: Nickname Editing -------------------
// Handles nickname editing functionality
// ============================================================================

// ------------------- Function: handleEditNickname -------------------
// Shows the nickname editing form
function handleEditNickname() {
  const nicknameDisplay = document.getElementById('profile-nickname-display');
  const nicknameEdit = document.getElementById('profile-nickname-edit');
  const nicknameInput = document.getElementById('profile-nickname-input');
  
  if (nicknameDisplay && nicknameEdit && nicknameInput) {
    // Set current nickname value in input
    nicknameInput.value = currentUser?.nickname || '';
    
    // Toggle display
    nicknameDisplay.style.display = 'none';
    nicknameEdit.style.display = 'flex';
    
    // Focus the input
    nicknameInput.focus();
  }
}

// ------------------- Function: handleCancelNickname -------------------
// Cancels nickname editing
function handleCancelNickname() {
  const nicknameDisplay = document.getElementById('profile-nickname-display');
  const nicknameEdit = document.getElementById('profile-nickname-edit');
  const nicknameInput = document.getElementById('profile-nickname-input');
  
  if (nicknameDisplay && nicknameEdit && nicknameInput) {
    // Reset input
    nicknameInput.value = currentUser?.nickname || '';
    
    // Toggle display
    nicknameDisplay.style.display = 'flex';
    nicknameEdit.style.display = 'none';
  }
}

// ------------------- Function: handleSaveNickname -------------------
// Saves the nickname to the database
async function handleSaveNickname() {
  const nicknameInput = document.getElementById('profile-nickname-input');
  const saveBtn = document.getElementById('save-nickname-btn');
  
  if (!nicknameInput || !saveBtn) return;
  
  const nickname = nicknameInput.value.trim();
  
  try {
    // Disable button
    const originalHTML = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    
    // Send update request
    const response = await fetch('/api/user/nickname', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ nickname })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update nickname');
    }
    
    const result = await response.json();
    
    // Update current user object
    if (currentUser) {
      currentUser.nickname = nickname;
    }
    
    // Update display
    const nicknameValue = document.getElementById('profile-nickname-value');
    if (nicknameValue) {
      nicknameValue.textContent = nickname || 'Not set';
    }
    
    // Update header display name if it exists
    const headerUsername = document.querySelector('.user-dropdown .user-info .user-name');
    if (headerUsername) {
      headerUsername.textContent = nickname || currentUser?.username || 'User';
    }
    
    // Hide edit form
    handleCancelNickname();
    
    // Show success message
    showProfileMessage('Display name updated successfully!', 'success');
    
    // Reset button
    saveBtn.innerHTML = originalHTML;
    saveBtn.disabled = false;
    
  } catch (error) {
    console.error('[profile.js]: Error saving nickname:', error);
    showProfileMessage(error.message || 'Failed to update display name', 'error');
    
    // Reset button
    saveBtn.innerHTML = '<i class="fas fa-save"></i> Save';
    saveBtn.disabled = false;
  }
}

// ============================================================================
// ------------------- Section: Helper Functions -------------------
// Utility functions for character display
// ============================================================================

// ------------------- Function: checkIfCharacterRolledToday -------------------
// Checks if a character has rolled today based on their dailyRoll data
// Uses 8am-8am rolling window logic
function checkIfCharacterRolledToday(character) {
  try {
    if (!character.dailyRoll || typeof character.dailyRoll !== 'object') {
      return false;
    }
    
    // Calculate the current 8am-8am rolling window
    const now = new Date();
    const currentHour = now.getHours();
    
    let weatherDayStart, weatherDayEnd;
    
    if (currentHour >= 8) {
      // If it's 8am or later, the weather day started at 8am today
      weatherDayStart = new Date(now);
      weatherDayStart.setHours(8, 0, 0, 0);
      
      weatherDayEnd = new Date(now);
      weatherDayEnd.setDate(weatherDayEnd.getDate() + 1);
      weatherDayEnd.setHours(8, 0, 0, 0);
    } else {
      // If it's before 8am, the weather day started at 8am yesterday
      weatherDayStart = new Date(now);
      weatherDayStart.setDate(weatherDayStart.getDate() - 1);
      weatherDayStart.setHours(8, 0, 0, 0);
      
      weatherDayEnd = new Date(now);
      weatherDayEnd.setHours(8, 0, 0, 0);
    }
    
    // Check if any of the dailyRoll entries fall within the current rolling window
    for (const [rollType, timestamp] of Object.entries(character.dailyRoll)) {
      if (timestamp) {
        const rollDate = new Date(timestamp);
        if (rollDate >= weatherDayStart && rollDate < weatherDayEnd) {
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {

    return false;
  }
}

// ------------------- Function: formatCharacterIconUrl -------------------
// Formats and returns character icon URL
function formatCharacterIconUrl(icon) {
  if (!icon) return '/images/ankleicon.png';
  
  // Check for Google Cloud Storage URL first
  if (icon.includes('storage.googleapis.com/tinglebot/')) {
    const filename = icon.split('/').pop();
    return `/api/images/${filename}`;
  }
  
  // If it's another HTTP URL, return as is
  if (icon.startsWith('http')) {
    return icon;
  }
  
  // For local filenames/relative paths, serve from static images folder
  return `/images/${icon}`;
}

// ============================================================================
// ------------------- Section: Vending Management -------------------
// Handles vending shop inventory management
// ============================================================================

// ------------------- Function: loadVendingShops -------------------
// Loads and displays all vendor characters and their inventories
// Accepts optional container IDs for use in different sections
async function loadVendingShops(options = {}) {
  try {
    const containerId = options.containerId || 'profile-vending-container';
    const loadingId = options.loadingId || 'profile-vending-loading';
    const infoId = options.infoId || 'profile-vending-info';
    const countId = options.countId || 'vending-characters-count';
    
    const vendingContainer = document.getElementById(containerId);
    const vendingLoading = document.getElementById(loadingId);
    const vendingInfo = document.getElementById(infoId);
    const vendingCharactersCount = document.getElementById(countId);

    if (!vendingContainer) {
      console.warn(`[profile.js] ⚠️ Vending container (${containerId}) not found in DOM`);
      return;
    }
    
    // Create loading element if it doesn't exist
    let loadingElement = vendingLoading;
    if (!loadingElement && vendingContainer) {
      loadingElement = document.createElement('div');
      loadingElement.id = loadingId;
      loadingElement.className = 'profile-vending-loading';
      loadingElement.style.cssText = 'display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; color: var(--text-secondary); gap: 1rem;';
      loadingElement.innerHTML = '<div class="loading-spinner"></div><p>Loading your vending shops...</p>';
    }

    if (loadingElement) {
      loadingElement.style.display = 'flex';
      vendingContainer.innerHTML = '';
      vendingContainer.appendChild(loadingElement);
    } else {
      vendingContainer.innerHTML = '<div class="loading-spinner"></div><p>Loading your vending shops...</p>';
    }

    // Get user's characters
    const response = await fetch('/api/user/characters', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const { data: characters } = await response.json();

    // Filter vendor characters (shopkeeper or merchant)
    // Check both job and vendorType fields to catch characters that haven't completed setup yet
    const vendorCharacters = characters.filter(char => {
      const job = char.job?.toLowerCase();
      const vendorType = char.vendorType?.toLowerCase();
      return (job === 'shopkeeper' || job === 'merchant') || 
             (vendorType === 'shopkeeper' || vendorType === 'merchant');
    });

    if (loadingElement) {
      loadingElement.style.display = 'none';
    }

    if (vendorCharacters.length === 0) {
      vendingContainer.innerHTML = `
        <div class="profile-no-vending">
          <i class="fas fa-store-slash"></i>
          <h4>No Vending Shops</h4>
          <p>You don't have any characters set up as vendors. Characters need to be Shopkeepers or Merchants to manage vending shops.</p>
        </div>
      `;
      if (vendingInfo) {
        vendingInfo.style.display = 'none';
      }
      return;
    }

    // Update count
    if (vendingCharactersCount) {
      vendingCharactersCount.textContent = vendorCharacters.length;
    }
    if (vendingInfo) {
      vendingInfo.style.display = 'block';
    }

    // Create vendor cards
    const vendorGrid = document.createElement('div');
    vendorGrid.className = 'profile-vending-grid';
    vendorGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 1.5rem; margin-top: 1rem;';

    for (const character of vendorCharacters) {
      const vendorCard = await createVendorCard(character);
      vendorGrid.appendChild(vendorCard);
    }

    vendingContainer.appendChild(vendorGrid);

  } catch (error) {
    console.error('[profile.js]: ❌ Error loading vending shops:', error);
    const vendingContainer = document.getElementById('profile-vending-container');
    if (vendingContainer) {
      vendingContainer.innerHTML = `
        <div class="profile-no-vending">
          <i class="fas fa-exclamation-triangle"></i>
          <h4>Error Loading Vending Shops</h4>
          <p>Failed to load your vending shops. Please try refreshing the page.</p>
        </div>
      `;
    }
  }
}

// ------------------- Function: createVendorCard -------------------
// Creates a card displaying vendor character and their inventory
async function createVendorCard(character) {
  const card = document.createElement('div');
  card.className = 'profile-vendor-card';
  card.style.cssText = `
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  `;

  // Calculate slot info
  const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
  const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
  const baseSlots = baseSlotLimits[character.vendorType?.toLowerCase()] || 0;
  const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
  const totalSlots = baseSlots + extraSlots;

  // Fetch vending inventory
  let inventoryData = null;
  let usedSlots = 0;
  try {
    const inventoryResponse = await fetch(`/api/characters/${character._id}/vending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (inventoryResponse.ok) {
      const data = await inventoryResponse.json();
      inventoryData = data;
      usedSlots = data.character.slots.used || 0;
    }
  } catch (error) {
    console.error(`[profile.js]: Error fetching inventory for ${character.name}:`, error);
  }

  const availableSlots = totalSlots - usedSlots;
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  // Check if character is already set up
  const isSetup = character.vendingSetup?.shopLink || character.shopLink;

  card.innerHTML = `
    <div class="vendor-card-header" style="display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 1rem;">
      <img src="${iconUrl}" alt="${character.name}" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);" onerror="this.src='/images/ankleicon.png'">
      <div style="flex: 1;">
        <h4 style="margin: 0 0 0.25rem 0; color: var(--text-color); font-size: 1.2rem;">${character.name}</h4>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">
          ${capitalize(character.vendorType || character.job || 'Vendor')} • ${capitalize(character.shopPouch || character.vendingSetup?.pouchType || 'No')} Pouch
        </p>
      </div>
    </div>
    <div class="vendor-card-stats" style="display: flex; gap: 1rem; padding: 0.75rem 0;">
      <div style="flex: 1; text-align: center; padding: 0.5rem; background: var(--input-bg); border-radius: 0.25rem;">
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Vending Points</div>
        <div style="font-size: 1.2rem; font-weight: 600; color: var(--text-color);">${(character.vendingPoints || 0).toLocaleString()}</div>
      </div>
      <div style="flex: 1; text-align: center; padding: 0.5rem; background: var(--input-bg); border-radius: 0.25rem;">
        <div style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.25rem;">Slots</div>
        <div style="font-size: 1.2rem; font-weight: 600; color: var(--text-color);">
          ${usedSlots}/${totalSlots}
        </div>
        <div style="font-size: 0.75rem; color: ${availableSlots > 0 ? 'var(--success-color)' : 'var(--error-color)'}; margin-top: 0.25rem;">
          ${availableSlots} available
        </div>
      </div>
    </div>
    <div class="vendor-card-inventory" style="max-height: 300px; overflow-y: auto;">
      <div id="vendor-inventory-${character._id}" style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${inventoryData && inventoryData.items.length > 0 ? 
          inventoryData.items.map(item => `
            <div class="vendor-item" style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem; background: var(--input-bg); border-radius: 0.25rem; border: 1px solid var(--border-color);">
              <div style="flex: 1;">
                <div style="font-weight: 500; color: var(--text-color); margin-bottom: 0.25rem;">${escapeHtmlAttribute(item.itemName)}</div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                  Stock: ${item.stockQty} 
                  ${item.tokenPrice !== null && item.tokenPrice !== undefined ? `• ${item.tokenPrice} tokens` : ''}
                  ${item.artPrice ? `• ${escapeHtmlAttribute(item.artPrice)} art` : ''}
                  ${item.otherPrice ? `• ${escapeHtmlAttribute(item.otherPrice)}` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 0.5rem;">
                <button class="edit-vendor-item-btn" data-character-id="${character._id}" data-item-id="${item._id}" style="
                  padding: 0.5rem;
                  background: var(--primary-color);
                  color: white;
                  border: none;
                  border-radius: 0.25rem;
                  cursor: pointer;
                  font-size: 0.9rem;
                  transition: background 0.2s;
                " title="Edit item">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="delete-vendor-item-btn" data-character-id="${character._id}" data-item-id="${item._id}" style="
                  padding: 0.5rem;
                  background: var(--error-color);
                  color: white;
                  border: none;
                  border-radius: 0.25rem;
                  cursor: pointer;
                  font-size: 0.9rem;
                  transition: background 0.2s;
                " title="Delete item">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
          `).join('') : 
          '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No items in inventory</div>'
        }
      </div>
    </div>
    <div class="vendor-card-actions" style="display: flex; gap: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
      ${!isSetup ? `
      <button class="setup-vendor-btn" data-character-id="${character._id}" data-character-name="${escapeHtmlAttribute(character.name)}" style="
        flex: 1;
        padding: 0.75rem;
        background: var(--success-color);
        color: white;
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      " onmouseover="this.style.background='var(--success-hover)'" onmouseout="this.style.background='var(--success-color)'">
        <i class="fas fa-magic"></i>
        Setup (One-Time)
      </button>
      ` : `
      <button class="add-vendor-item-btn" data-character-id="${character._id}" style="
        flex: 1;
        padding: 0.75rem;
        background: var(--primary-color);
        color: white;
        border: none;
        border-radius: 0.5rem;
        cursor: pointer;
        font-size: 0.9rem;
        font-weight: 500;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      " onmouseover="this.style.background='var(--primary-hover)'" onmouseout="this.style.background='var(--primary-color)'">
        <i class="fas fa-plus"></i>
        Add Item
      </button>
      <button class="manage-vendor-btn" data-character-id="${character._id}" style="
        padding: 0.75rem 1rem;
        background: var(--card-bg);
        color: var(--text-color);
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        cursor: pointer;
        font-size: 0.9rem;
        transition: background 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      " onmouseover="this.style.background='var(--input-bg)'" onmouseout="this.style.background='var(--card-bg)'">
        <i class="fas fa-cog"></i>
        Manage
      </button>
      `}
    </div>
  `;

  // Add event listeners
  const setupBtn = card.querySelector('.setup-vendor-btn');
  setupBtn?.addEventListener('click', () => showVendingSetupModal(character));

  const addBtn = card.querySelector('.add-vendor-item-btn');
  addBtn?.addEventListener('click', () => showAddVendorItemModal(character));

  const editButtons = card.querySelectorAll('.edit-vendor-item-btn');
  editButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const characterId = btn.dataset.characterId;
      const itemId = btn.dataset.itemId;
      const item = inventoryData.items.find(i => i._id === itemId);
      if (item) {
        await showEditVendorItemModal(character, item);
      }
    });
  });

  const deleteButtons = card.querySelectorAll('.delete-vendor-item-btn');
  deleteButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const characterId = btn.dataset.characterId;
      const itemId = btn.dataset.itemId;
      if (confirm('Are you sure you want to delete this item from your vending inventory?')) {
        await deleteVendorItem(characterId, itemId);
      }
    });
  });

  return card;
}

// ------------------- Function: showVendingSetupModal -------------------
// Shows a modal to set up vending shop for the first time (one-time import from old method)
function showVendingSetupModal(character) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '700px';

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-magic"></i> Setup Vending Shop: ${escapeHtmlAttribute(character.name)}
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body">
      <div style="background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.5rem;">
        <p style="margin: 0; color: var(--warning-text, #856404); font-size: 0.9rem;">
          <strong>⚠️ One-Time Setup:</strong> This can only be done once! This will import your existing vending data from the old method.
        </p>
      </div>
      <form id="vending-setup-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <label style="display: block; color: var(--text-color); font-weight: 500;">
              Vending Inventory Items <span style="color: var(--error-color);">*</span>
            </label>
            <button 
              type="button" 
              id="add-vending-row-btn"
              style="
                padding: 0.5rem 1rem;
                background: var(--primary-color);
                color: white;
                border: none;
                border-radius: 0.25rem;
                cursor: pointer;
                font-size: 0.85rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
              "
              onmouseover="this.style.background='var(--primary-hover)'" 
              onmouseout="this.style.background='var(--primary-color)'"
            >
              <i class="fas fa-plus"></i> Add Row
            </button>
          </div>
          <div style="overflow-x: auto; border: 1px solid var(--border-color); border-radius: 0.5rem; max-height: 400px; overflow-y: auto;">
            <table id="vending-setup-table" style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
              <thead style="position: sticky; top: 0; background: var(--card-bg); z-index: 10;">
                <tr style="border-bottom: 2px solid var(--border-color);">
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Character Name</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Item Name *</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Stock Qty *</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Cost Each</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Points Spent</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Bought From</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Token Price</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Art Price</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Other Price</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Trades Open?</th>
                  <th style="padding: 0.75rem; text-align: left; color: var(--text-color); font-weight: 600; background: var(--card-bg);">Date</th>
                  <th style="padding: 0.75rem; text-align: center; color: var(--text-color); font-weight: 600; background: var(--card-bg); width: 50px;">Action</th>
                </tr>
              </thead>
              <tbody id="vending-setup-tbody">
                <!-- Rows will be added here -->
              </tbody>
            </table>
          </div>
          <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">
            Fill out the table with your vending inventory items. Character Name will default to ${escapeHtmlAttribute(character.name)} if left empty.
          </p>
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-color); font-weight: 500;">
            Pouch Type <span style="color: var(--error-color);">*</span>
          </label>
          <select 
            id="setup-pouch-type" 
            name="pouchType" 
            required
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem;"
          >
            <option value="none">None (0 slots)</option>
            <option value="bronze">Bronze (15 slots) - 1,000 tokens</option>
            <option value="silver">Silver (30 slots) - 5,000 tokens</option>
            <option value="gold">Gold (50 slots) - 10,000 tokens</option>
          </select>
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-color); font-weight: 500;">
            Vending Points (Current)
          </label>
          <input 
            type="number" 
            id="setup-vending-points" 
            name="vendingPoints" 
            min="0"
            value="${character.vendingPoints || 0}"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem;"
          />
        </div>
        <div>
          <label style="display: block; margin-bottom: 0.5rem; color: var(--text-color); font-weight: 500;">
            Shop Banner Image URL (Optional)
          </label>
          <input 
            type="url" 
            id="setup-shop-image" 
            name="shopImage" 
            placeholder="https://..."
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem;"
          />
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
          <button 
            type="submit" 
            style="
              flex: 1;
              padding: 0.75rem;
              background: var(--success-color);
              color: white;
              border: none;
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
              font-weight: 500;
              transition: background 0.2s;
            "
            onmouseover="this.style.background='var(--success-hover)'" 
            onmouseout="this.style.background='var(--success-color)'"
          >
            <i class="fas fa-magic"></i> Setup & Import
          </button>
          <button 
            type="button" 
            class="close-modal"
            style="
              padding: 0.75rem 1.5rem;
              background: var(--card-bg);
              color: var(--text-color);
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
              transition: background 0.2s;
            "
            onmouseover="this.style.background='var(--input-bg)'" 
            onmouseout="this.style.background='var(--card-bg)'"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Add initial row
  addVendingSetupRow(character.name);

  // Add row button handler
  const addRowBtn = document.getElementById('add-vending-row-btn');
  addRowBtn.addEventListener('click', () => {
    addVendingSetupRow(character.name);
  });

  // Function to add a new row to the table
  function addVendingSetupRow(defaultCharacterName) {
    const tbody = document.getElementById('vending-setup-tbody');
    const row = document.createElement('tr');
    row.style.borderBottom = '1px solid var(--border-color)';
    row.innerHTML = `
      <td style="padding: 0.5rem;">
        <input 
          type="text" 
          class="vending-row-input" 
          data-field="characterName"
          value="${escapeHtmlAttribute(defaultCharacterName)}"
          placeholder="${escapeHtmlAttribute(defaultCharacterName)}"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="text" 
          class="vending-row-input" 
          data-field="itemName"
          required
          placeholder="Item name"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="number" 
          class="vending-row-input" 
          data-field="stockQty"
          required
          min="1"
          value="1"
          placeholder="1"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="number" 
          class="vending-row-input" 
          data-field="costEach"
          min="0"
          step="0.01"
          value="0"
          placeholder="0"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="number" 
          class="vending-row-input" 
          data-field="pointsSpent"
          min="0"
          step="0.01"
          value="0"
          placeholder="0"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="text" 
          class="vending-row-input" 
          data-field="boughtFrom"
          placeholder="Village name"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="number" 
          class="vending-row-input" 
          data-field="tokenPrice"
          min="0"
          step="0.01"
          value="0"
          placeholder="0"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="text" 
          class="vending-row-input" 
          data-field="artPrice"
          placeholder="N/A"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="text" 
          class="vending-row-input" 
          data-field="otherPrice"
          placeholder="N/A"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem;">
        <select 
          class="vending-row-input" 
          data-field="tradesOpen"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        >
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </td>
      <td style="padding: 0.5rem;">
        <input 
          type="date" 
          class="vending-row-input" 
          data-field="date"
          style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.85rem;"
        />
      </td>
      <td style="padding: 0.5rem; text-align: center;">
        <button 
          type="button" 
          class="remove-vending-row-btn"
          style="
            padding: 0.5rem;
            background: var(--error-color);
            color: white;
            border: none;
            border-radius: 0.25rem;
            cursor: pointer;
            font-size: 0.85rem;
            width: 100%;
          "
          onmouseover="this.style.background='var(--error-hover)'" 
          onmouseout="this.style.background='var(--error-color)'"
          title="Remove row"
        >
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(row);

    // Add remove button handler
    const removeBtn = row.querySelector('.remove-vending-row-btn');
    removeBtn.addEventListener('click', () => {
      if (tbody.children.length > 1) {
        row.remove();
      } else {
        alert('You must have at least one row');
      }
    });
  }

  // Close modal handlers
  const closeButtons = modal.querySelectorAll('.close-modal');
  closeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      document.body.removeChild(modal);
    }
  });

  // Form submission
  const form = modal.querySelector('#vending-setup-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Collect table data
    const tbody = document.getElementById('vending-setup-tbody');
    const rows = tbody.querySelectorAll('tr');
    const items = [];

    for (const row of rows) {
      const inputs = row.querySelectorAll('.vending-row-input');
      const rowData = {};
      
      inputs.forEach(input => {
        const field = input.dataset.field;
        if (input.type === 'number') {
          rowData[field] = parseFloat(input.value) || 0;
        } else if (input.type === 'checkbox') {
          rowData[field] = input.checked;
        } else if (input.tagName === 'SELECT') {
          rowData[field] = input.value === 'true';
        } else {
          rowData[field] = input.value.trim();
        }
      });

      // Validate required fields
      if (!rowData.itemName || !rowData.stockQty || rowData.stockQty <= 0) {
        continue; // Skip invalid rows
      }

      // Use character name from input or default
      if (!rowData.characterName) {
        rowData.characterName = character.name;
      }

      items.push(rowData);
    }

    if (items.length === 0) {
      alert('Please add at least one valid item (Item Name and Stock Qty are required)');
      return;
    }

    const pouchType = document.getElementById('setup-pouch-type').value;
    const vendingPoints = parseInt(document.getElementById('setup-vending-points').value) || 0;
    const shopImage = document.getElementById('setup-shop-image').value || null;

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Setting up...';

    try {
      const response = await fetch(`/api/characters/${character._id}/vending/setup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          items,
          pouchType,
          vendingPoints,
          shopImage
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to set up vending shop');
      }

      // Success - close modal and reload
      alert('✅ Vending shop set up successfully! Your inventory has been imported.');
      document.body.removeChild(modal);
      
      // Reload vending shops
      const containerId = document.getElementById('vending-shops-container') ? 'vending-shops-container' : 'profile-vending-container';
      await loadVendingShops({ containerId });
    } catch (error) {
      console.error('[profile.js]: Error setting up vending:', error);
      alert(`❌ Error: ${error.message}`);
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

// ------------------- Function: showAddVendorItemModal -------------------
// Shows a modal to add a new item to vending inventory
function showAddVendorItemModal(character) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '600px';

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-plus"></i> Add Item to ${character.name}'s Shop
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body">
      <form id="add-vendor-item-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div class="form-group">
          <label for="item-name" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Item Name *
          </label>
          <input type="text" id="item-name" name="itemName" required
            placeholder="Enter item name"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="stock-qty" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Stock Quantity *
          </label>
          <input type="number" id="stock-qty" name="stockQty" required min="1"
            placeholder="Enter stock quantity"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="token-price" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Token Price
          </label>
          <input type="number" id="token-price" name="tokenPrice" min="0" step="0.01"
            placeholder="Enter token price (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="art-price" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Art Price
          </label>
          <input type="text" id="art-price" name="artPrice"
            placeholder="Enter art price (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="other-price" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Other Price
          </label>
          <input type="text" id="other-price" name="otherPrice"
            placeholder="Enter other price (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="slot" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Slot Number (Optional)
          </label>
          <input type="text" id="slot" name="slot"
            placeholder="Enter slot number (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="barter-open" name="barterOpen" style="width: 18px; height: 18px; cursor: pointer;">
            <span style="font-weight: 500; color: var(--text-color);">Barter/Trades Open</span>
          </label>
        </div>
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
          <button type="button" class="cancel-add-vendor-item-btn" style="
            padding: 0.75rem 1.5rem;
            background: var(--card-bg);
            color: var(--text-color);
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.2s;
          ">Cancel</button>
          <button type="submit" style="
            padding: 0.75rem 1.5rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          ">
            <i class="fas fa-plus"></i>
            Add Item
          </button>
        </div>
      </form>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle form submission
  const form = modal.querySelector('#add-vendor-item-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addVendorItem(character._id, form, modal);
  });

  // Handle close
  const closeBtn = modal.querySelector('.close-modal');
  const cancelBtn = modal.querySelector('.cancel-add-vendor-item-btn');
  const closeModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  };
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Close on Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// ------------------- Function: showEditVendorItemModal -------------------
// Shows a modal to edit an existing vending item
function showEditVendorItemModal(character, item) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '600px';

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-edit"></i> Edit Item: ${escapeHtmlAttribute(item.itemName)}
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body">
      <form id="edit-vendor-item-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div class="form-group">
          <label for="edit-stock-qty" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Stock Quantity *
          </label>
          <input type="number" id="edit-stock-qty" name="stockQty" required min="1" value="${item.stockQty || 1}"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="edit-token-price" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Token Price
          </label>
          <input type="number" id="edit-token-price" name="tokenPrice" min="0" step="0.01" value="${item.tokenPrice || ''}"
            placeholder="Enter token price (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="edit-art-price" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Art Price
          </label>
          <input type="text" id="edit-art-price" name="artPrice" value="${item.artPrice || ''}"
            placeholder="Enter art price (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="edit-other-price" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Other Price
          </label>
          <input type="text" id="edit-other-price" name="otherPrice" value="${item.otherPrice || ''}"
            placeholder="Enter other price (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label for="edit-slot" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Slot Number (Optional)
          </label>
          <input type="text" id="edit-slot" name="slot" value="${item.slot || ''}"
            placeholder="Enter slot number (optional)"
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
        </div>
        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
            <input type="checkbox" id="edit-barter-open" name="barterOpen" ${item.barterOpen ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">
            <span style="font-weight: 500; color: var(--text-color);">Barter/Trades Open</span>
          </label>
        </div>
        <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1rem;">
          <button type="button" class="cancel-edit-vendor-item-btn" style="
            padding: 0.75rem 1.5rem;
            background: var(--card-bg);
            color: var(--text-color);
            border: 1px solid var(--border-color);
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.2s;
          ">Cancel</button>
          <button type="submit" style="
            padding: 0.75rem 1.5rem;
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
          ">
            <i class="fas fa-save"></i>
            Save Changes
          </button>
        </div>
      </form>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle form submission
  const form = modal.querySelector('#edit-vendor-item-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await updateVendorItem(character._id, item._id, form, modal);
  });

  // Handle close
  const closeBtn = modal.querySelector('.close-modal');
  const cancelBtn = modal.querySelector('.cancel-edit-vendor-item-btn');
  const closeModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  };
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  // Close on Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// ------------------- Function: addVendorItem -------------------
// Adds a new item to vending inventory
async function addVendorItem(characterId, form, modal) {
  try {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    const formData = {
      itemName: form.itemName.value.trim(),
      stockQty: parseInt(form.stockQty.value),
      tokenPrice: form.tokenPrice.value ? parseFloat(form.tokenPrice.value) : null,
      artPrice: form.artPrice.value.trim() || null,
      otherPrice: form.otherPrice.value.trim() || null,
      barterOpen: form.barterOpen.checked,
      slot: form.slot.value.trim() || null
    };

    const response = await fetch(`/api/characters/${characterId}/vending/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add item');
    }

    showProfileMessage('Item added to vending inventory!', 'success');
    
    // Close modal
    modal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);

    // Reload vending shops
    await loadVendingShops();

  } catch (error) {
    console.error('[profile.js]: ❌ Error adding vending item:', error);
    showProfileMessage(error.message || 'Failed to add item', 'error');
    
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Item';
  }
}

// ------------------- Function: updateVendorItem -------------------
// Updates an existing vending item
async function updateVendorItem(characterId, itemId, form, modal) {
  try {
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const formData = {
      stockQty: parseInt(form.stockQty.value),
      tokenPrice: form.tokenPrice.value ? parseFloat(form.tokenPrice.value) : null,
      artPrice: form.artPrice.value.trim() || null,
      otherPrice: form.otherPrice.value.trim() || null,
      barterOpen: form.barterOpen.checked,
      slot: form.slot.value.trim() || null
    };

    const response = await fetch(`/api/characters/${characterId}/vending/items/${itemId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update item');
    }

    showProfileMessage('Item updated successfully!', 'success');
    
    // Close modal
    modal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);

    // Reload vending shops
    await loadVendingShops();

  } catch (error) {
    console.error('[profile.js]: ❌ Error updating vending item:', error);
    showProfileMessage(error.message || 'Failed to update item', 'error');
    
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
  }
}

// ------------------- Function: deleteVendorItem -------------------
// Deletes a vending item
async function deleteVendorItem(characterId, itemId) {
  try {
    const response = await fetch(`/api/characters/${characterId}/vending/items/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete item');
    }

    showProfileMessage('Item deleted successfully!', 'success');
    
    // Reload vending shops
    await loadVendingShops();

  } catch (error) {
    console.error('[profile.js]: ❌ Error deleting vending item:', error);
    showProfileMessage(error.message || 'Failed to delete item', 'error');
  }
}

// ============================================================================
// ------------------- Section: Public API -------------------
// Exports functions for use in other modules
// ============================================================================

export {
  initProfilePage,
  loadProfileData,
  updateProfileDisplay,
  loadVendingShops
}; 