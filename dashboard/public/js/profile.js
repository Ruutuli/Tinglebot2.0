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

// ------------------- Function: showVendingNotification -------------------
// Shows a styled notification toast for vending operations
function showVendingNotification(message, type = 'success', duration = 4000) {
  // Remove any existing notification
  const existing = document.querySelector('.vending-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.className = `vending-notification ${type}`;

  const iconMap = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle'
  };

  const icon = document.createElement('i');
  icon.className = `${iconMap[type] || iconMap.success} vending-notification-icon`;

  const content = document.createElement('div');
  content.className = 'vending-notification-content';

  // Split message by newlines for title and message
  const lines = message.split('\n').filter(line => line.trim());
  const title = lines[0] || message;
  const subtitle = lines.slice(1).join('\n');

  const titleEl = document.createElement('div');
  titleEl.className = 'vending-notification-title';
  titleEl.textContent = title;

  content.appendChild(titleEl);

  if (subtitle) {
    const messageEl = document.createElement('div');
    messageEl.className = 'vending-notification-message';
    messageEl.textContent = subtitle;
    content.appendChild(messageEl);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'vending-notification-close';
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.setAttribute('aria-label', 'Close notification');
  closeBtn.onclick = () => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  };

  notification.appendChild(icon);
  notification.appendChild(content);
  notification.appendChild(closeBtn);
  document.body.appendChild(notification);

  // Trigger animation
  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  // Auto-remove after duration
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, duration);
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
    
    // Setup steal cooldowns character selector
    setupStealCooldownsSelector();
    
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
        const rewardText = typeof completion.tokensEarned === 'number'
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
      // Find and click the vending section sidebar link to trigger navigation
      const vendingLink = document.querySelector('.sidebar-nav a[data-section="vending-section"]');
      if (vendingLink) {
        vendingLink.click();
      } else {
        // Fallback: set hash and trigger navigation manually
        window.location.hash = '#vending-section';
        window.history.pushState({ section: 'vending-section' }, '', '#vending-section');
        // Dispatch event that index.js might listen to, or try to call showVendingSection
        const event = new Event('hashchange');
        window.dispatchEvent(event);
      }
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
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  `;

  // Calculate slot info
  const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
  const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
  const vendorType = character.vendorType?.toLowerCase() || character.job?.toLowerCase();
  const baseSlots = baseSlotLimits[vendorType] || 0;
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
    } else if (inventoryResponse.status === 404) {
      // Character hasn't set up vending yet - this is expected, don't log as error
      // Just use default values (inventoryData stays null, usedSlots stays 0)
    } else {
      // Other error status - log it
      console.warn(`[profile.js]: Failed to fetch inventory for ${character.name}: ${inventoryResponse.status} ${inventoryResponse.statusText}`);
    }
  } catch (error) {
    // Network or other errors
    console.error(`[profile.js]: Error fetching inventory for ${character.name}:`, error);
  }

  const availableSlots = totalSlots - usedSlots;
  const iconUrl = formatCharacterIconUrl(character.icon);
  
  // Check if character is already set up
  const isSetup = character.vendingSetup?.setupDate;

  card.innerHTML = `
    <div class="vendor-card-header" style="display: flex; align-items: center; gap: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
      <img src="${iconUrl}" alt="${character.name}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border-color);" onerror="this.src='/images/ankleicon.png'">
      <div style="flex: 1;">
        <h4 style="margin: 0 0 0.15rem 0; color: var(--text-color); font-size: 1.1rem; font-weight: 600;">${character.name}</h4>
        <p style="margin: 0; color: var(--text-secondary); font-size: 0.85rem;">
          ${capitalize(character.vendorType || character.job || 'Vendor')} • ${capitalize(character.currentVillage || character.homeVillage || 'Unknown')} • ${usedSlots}/${totalSlots} slots
        </p>
      </div>
    </div>
    <div class="vendor-card-slots" style="margin-bottom: 0.75rem;">
      <div id="vendor-inventory-${character._id}" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0.5rem;">
        ${inventoryData && inventoryData.items && inventoryData.items.length > 0 ? 
          inventoryData.items.sort((a, b) => {
            const slotA = a.slot ? parseInt(a.slot.replace(/[^0-9]/g, '')) || 999 : 999;
            const slotB = b.slot ? parseInt(b.slot.replace(/[^0-9]/g, '')) || 999 : 999;
            return slotA - slotB;
          }).map(item => `
            <div style="padding: 0.5rem; background: var(--input-bg); border-radius: 0.4rem; border: 1px solid var(--border-color); text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-secondary); margin-bottom: 0.25rem; font-weight: 600;">${item.slot || 'No Slot'}</div>
              <div style="font-size: 0.85rem; color: var(--text-color); font-weight: 500; word-break: break-word;">${escapeHtmlAttribute(item.itemName)}</div>
            </div>
          `).join('') : 
          '<div style="grid-column: 1 / -1; text-align: center; padding: 1.5rem; color: var(--text-secondary);"><i class="fas fa-inbox" style="font-size: 1.5rem; margin-bottom: 0.5rem; opacity: 0.5;"></i><div style="font-size: 0.9rem;">No items</div></div>'
        }
      </div>
    </div>
    <div class="vendor-card-actions" style="padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
      <button class="view-vendor-btn" data-character-id="${character._id}" style="
        width: 100%;
        padding: 0.65rem;
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
      " onmouseover="this.style.background='var(--primary-hover)'" onmouseout="this.style.background='var(--primary-color)'" title="View and manage vendor dashboard">
        <i class="fas fa-store"></i>
        View Dashboard
      </button>
    </div>
  `;

  // Add event listeners
  const viewBtn = card.querySelector('.view-vendor-btn');
  viewBtn?.addEventListener('click', () => {
    // Navigate to vendor dashboard page
    // The function is made available globally in index.js
    if (window.showVendorDashboardSection) {
      window.showVendorDashboardSection(character._id);
    } else if (typeof showVendorDashboardSection === 'function') {
      // Fallback: try direct function call
      showVendorDashboardSection(character._id);
    } else {
      console.error('[profile.js]: showVendorDashboardSection function not available');
      alert('Unable to open vendor dashboard. Please refresh the page.');
    }
  });

  return card;
}

// ------------------- Function: showValidationErrorsModal -------------------
// Shows a nice modal displaying validation errors
function showValidationErrorsModal(errors, title, type = 'error') {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10002';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '600px';

  const isSuccess = type === 'success';
  const icon = isSuccess ? 'fa-check-circle' : 'fa-exclamation-triangle';
  const iconColor = isSuccess ? '#4CAF50' : '#ff9800';
  const borderColor = isSuccess ? '#4CAF50' : '#ff9800';

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
        <i class="fas ${icon}" style="color: ${iconColor};"></i> ${escapeHtmlAttribute(title)}
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body">
      ${isSuccess ? `
        <div style="padding: 1rem; background: #e8f5e9; border: 1px solid ${borderColor}; border-radius: 0.5rem; color: #2e7d32; margin-bottom: 1rem;">
          <p style="margin: 0; font-size: 1rem;">${escapeHtmlAttribute(errors.length > 0 ? errors[0] : title)}</p>
        </div>
      ` : errors.length > 0 ? `
        <div style="margin-bottom: 1rem;">
          <p style="color: var(--text-color); margin-bottom: 0.75rem; font-weight: 500;">Please fix the following issues:</p>
          <ul style="margin: 0; padding-left: 1.5rem; color: var(--text-color); line-height: 1.8;">
            ${errors.map(error => `<li style="margin-bottom: 0.5rem;">${escapeHtmlAttribute(error)}</li>`).join('')}
          </ul>
        </div>
      ` : `
        <div style="padding: 1rem; background: #fff3cd; border: 1px solid ${borderColor}; border-radius: 0.5rem; color: #856404;">
          <p style="margin: 0;">${escapeHtmlAttribute(title)}</p>
        </div>
      `}
      <div style="display: flex; justify-content: flex-end; margin-top: 1.5rem;">
        <button 
          class="close-validation-modal"
          style="
            padding: 0.75rem 2rem;
            background: ${isSuccess ? '#4CAF50' : '#ff9800'};
            color: white;
            border: none;
            border-radius: 0.5rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: background 0.2s;
          "
          onmouseover="this.style.background='${isSuccess ? '#45a049' : '#e68900'}'"
          onmouseout="this.style.background='${isSuccess ? '#4CAF50' : '#ff9800'}'"
        >
          ${isSuccess ? 'Continue' : 'Close'}
        </button>
      </div>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Close handlers
  const closeModal = () => {
    modal.style.animation = 'fadeOut 0.3s ease forwards';
    setTimeout(() => {
      if (modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }
    }, 300);
  };

  const closeBtn = modal.querySelector('.close-modal');
  const closeValidationBtn = modal.querySelector('.close-validation-modal');
  closeBtn?.addEventListener('click', closeModal);
  closeValidationBtn?.addEventListener('click', closeModal);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Close on Escape key
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// ------------------- Function: showRestockModal -------------------
// Shows a custom styled modal for restocking vending items
async function showRestockModal(itemName, costEach, characterId, itemId = null, currentSlot = null) {
  return new Promise(async (resolve) => {
    const modal = document.createElement('div');
    modal.className = 'character-modal';
    modal.style.zIndex = '10003';

    const modalContent = document.createElement('div');
    modalContent.className = 'character-modal-content';
    modalContent.style.maxWidth = '600px';

    // Fetch character and slot information
    let availableSlots = [];
    let occupiedSlots = [];
    let totalSlots = 0;
    let character = null;
    let existingItemSlot = null;

    if (characterId) {
      try {
        // Fetch character data
        const charResponse = await fetch(`/api/character/${characterId}`, {
          credentials: 'include'
        });
        if (charResponse.ok) {
          const charData = await charResponse.json();
          character = charData;
        }

        // Fetch vending inventory to check slots
        const vendingResponse = await fetch(`/api/characters/${characterId}/vending`, {
          credentials: 'include'
        });
        
        if (vendingResponse.ok) {
          const vendingData = await vendingResponse.json();
          
          // Calculate slot limits
          const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
          const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
          const vendorType = character?.vendorType?.toLowerCase() || character?.job?.toLowerCase() || 'shopkeeper';
          const pouchType = character?.shopPouch?.toLowerCase() || character?.vendingSetup?.pouchType?.toLowerCase() || 'none';
          const baseSlots = baseSlotLimits[vendorType] || 0;
          const pouchSlots = pouchCapacities[pouchType] || 0;
          totalSlots = baseSlots + pouchSlots;

          // Get occupied slots
          if (vendingData.items && Array.isArray(vendingData.items)) {
            occupiedSlots = vendingData.items
              .filter(item => item.slot && (!itemId || item._id !== itemId))
              .map(item => ({
                slot: item.slot,
                itemName: item.itemName,
                stockQty: item.stockQty
              }));

            // Check if item already exists and can be stacked
            if (itemId) {
              existingItemSlot = vendingData.items.find(item => item._id === itemId);
            } else {
              // Check if same item exists in a slot (for stacking)
              existingItemSlot = vendingData.items.find(item => 
                item.itemName === itemName && item.slot
              );
            }
          }

          // Calculate available slots
          const occupiedSlotNames = new Set(occupiedSlots.map(s => s.slot));
          for (let i = 1; i <= totalSlots; i++) {
            const slotName = `Slot ${i}`;
            if (!occupiedSlotNames.has(slotName)) {
              availableSlots.push(slotName);
            }
          }
        }
      } catch (error) {
        console.warn('[profile.js]: Error fetching slot information:', error);
      }
    }

    // Determine default slot
    let defaultSlot = currentSlot || (existingItemSlot?.slot) || (availableSlots.length > 0 ? availableSlots[0] : null);

    modalContent.innerHTML = `
      <div class="character-modal-header">
        <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fas fa-shopping-cart" style="color: var(--primary-color);"></i> Restock Item
        </h2>
        <button class="close-modal" style="background: transparent; border: none; color: var(--text-color); font-size: 2rem; cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s;" onmouseover="this.style.background='var(--input-bg)'; this.style.color='var(--error-color)'" onmouseout="this.style.background='transparent'; this.style.color='var(--text-color)'">&times;</button>
      </div>
      <div class="character-modal-body" style="padding: 2rem;">
        <div style="margin-bottom: 1.5rem;">
          <div style="background: linear-gradient(135deg, rgba(0,123,255,0.1) 0%, rgba(0,123,255,0.05) 100%); border: 2px solid var(--primary-color); border-radius: 0.75rem; padding: 1.25rem; margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
              <i class="fas fa-box" style="color: var(--primary-color); font-size: 1.5rem;"></i>
              <div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 0.25rem;">Item Name</div>
                <div style="font-size: 1.25rem; color: var(--text-color); font-weight: 700;">${escapeHtmlAttribute(itemName)}</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
              <i class="fas fa-coins" style="color: #ffc107; font-size: 1.25rem;"></i>
              <div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 0.25rem;">Cost Per Item</div>
                <div style="font-size: 1.1rem; color: var(--text-color); font-weight: 700;">${costEach.toLocaleString()} vending points</div>
              </div>
            </div>
          </div>

          ${totalSlots > 0 ? `
          <div style="margin-bottom: 1.5rem;">
            <label style="display: block; margin-bottom: 0.75rem; color: var(--text-color); font-weight: 600; font-size: 0.95rem;">
              <i class="fas fa-layer-group" style="margin-right: 0.5rem;"></i> Slot <span style="color: var(--error-color); font-weight: 700;">*</span>
            </label>
            ${existingItemSlot && existingItemSlot.slot ? `
              <div style="background: linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(76,175,80,0.05) 100%); border: 2px solid #4CAF50; border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <i class="fas fa-info-circle" style="color: #4CAF50;"></i>
                  <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600;">Existing item found in ${existingItemSlot.slot}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary);">
                  Current stock: ${existingItemSlot.stockQty || 0} • Will add to existing stock
                </div>
              </div>
            ` : ''}
            <select 
              id="restock-slot-select"
              style="width: 100%; padding: 1rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem; font-weight: 600; transition: all 0.2s; box-sizing: border-box; cursor: pointer;"
              onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
              onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
            >
              ${existingItemSlot && existingItemSlot.slot ? `
                <option value="${existingItemSlot.slot}" selected>${existingItemSlot.slot} (Current - Add to existing stock)</option>
              ` : ''}
              ${availableSlots.map(slot => `
                <option value="${slot}" ${slot === defaultSlot && !existingItemSlot ? 'selected' : ''}>${slot} (Available)</option>
              `).join('')}
              ${occupiedSlots.map(slot => `
                <option value="${slot.slot}" disabled>${slot.slot} (Occupied: ${slot.itemName})</option>
              `).join('')}
            </select>
            <div style="margin-top: 0.75rem; padding: 0.75rem; background: var(--bg-secondary); border-radius: 0.5rem; border: 1px solid var(--border-color);">
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem;">
                <strong>Slot Status:</strong>
              </div>
              <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; font-size: 0.8rem;">
                <span style="padding: 0.25rem 0.5rem; background: rgba(76,175,80,0.2); color: #4CAF50; border-radius: 4px; font-weight: 600;">
                  ${availableSlots.length} Available
                </span>
                <span style="padding: 0.25rem 0.5rem; background: rgba(136,136,136,0.2); color: #888; border-radius: 4px; font-weight: 600;">
                  ${occupiedSlots.length} Occupied
                </span>
                <span style="padding: 0.25rem 0.5rem; background: rgba(0,123,255,0.2); color: var(--primary-color); border-radius: 4px; font-weight: 600;">
                  ${totalSlots} Total
                </span>
              </div>
            </div>
          </div>
          ` : ''}

          <label style="display: block; margin-bottom: 0.75rem; color: var(--text-color); font-weight: 600; font-size: 0.95rem;">
            Quantity <span style="color: var(--error-color); font-weight: 700;">*</span>
          </label>
          <input 
            type="number" 
            id="restock-quantity-input"
            min="1"
            value="1"
            step="1"
            style="width: 100%; padding: 1rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1.1rem; font-weight: 600; transition: all 0.2s; box-sizing: border-box;"
            onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
            onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
            oninput="updateRestockTotal()"
          />

          <div id="restock-total-display" style="margin-top: 1.25rem; padding: 1rem; background: linear-gradient(135deg, rgba(76,175,80,0.1) 0%, rgba(76,175,80,0.05) 100%); border: 2px solid #4CAF50; border-radius: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 0.25rem;">Total Cost</div>
              <div id="restock-total-amount" style="font-size: 1.5rem; color: #4CAF50; font-weight: 700;">${costEach.toLocaleString()} points</div>
            </div>
            <i class="fas fa-calculator" style="color: #4CAF50; font-size: 2rem; opacity: 0.7;"></i>
          </div>

          <div style="margin-top: 2rem; padding-top: 2rem; border-top: 2px solid var(--border-color);">
            <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem;">
              <i class="fas fa-tags" style="color: var(--primary-color);"></i>
              Set Item Prices <span style="color: var(--error-color); font-weight: 700;">*</span>
            </h3>
            <div style="background: linear-gradient(135deg, rgba(255,193,7,0.1) 0%, rgba(255,193,7,0.05) 100%); border: 2px solid #ffc107; border-radius: 0.5rem; padding: 1rem; margin-bottom: 1rem;">
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <i class="fas fa-info-circle" style="color: #ffc107;"></i>
                <span style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 600;">At least one price must be set</span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-secondary);">
                Set token price, art price, or other price. Items cannot be sold without at least one price.
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
              <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-color); font-weight: 600; font-size: 0.9rem;">
                  <i class="fas fa-coins" style="margin-right: 0.5rem; color: #ffc107;"></i>Token Price
                </label>
                <input 
                  type="number" 
                  id="restock-token-price"
                  min="0"
                  step="1"
                  placeholder="0"
                  style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem; font-weight: 500; transition: all 0.2s; box-sizing: border-box;"
                  onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
                  onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
                />
              </div>

              <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-color); font-weight: 600; font-size: 0.9rem;">
                  <i class="fas fa-palette" style="margin-right: 0.5rem; color: #9c27b0;"></i>Art Price
                </label>
                <input 
                  type="text" 
                  id="restock-art-price"
                  placeholder="N/A"
                  style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem; font-weight: 500; transition: all 0.2s; box-sizing: border-box;"
                  onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
                  onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
                />
              </div>

              <div>
                <label style="display: block; margin-bottom: 0.5rem; color: var(--text-color); font-weight: 600; font-size: 0.9rem;">
                  <i class="fas fa-handshake" style="margin-right: 0.5rem; color: var(--accent);"></i>Other Price
                </label>
                <input 
                  type="text" 
                  id="restock-other-price"
                  placeholder="N/A"
                  style="width: 100%; padding: 0.875rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem; font-weight: 500; transition: all 0.2s; box-sizing: border-box;"
                  onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
                  onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
                />
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <button 
            id="restock-cancel-btn"
            type="button"
            style="flex: 1; padding: 1rem; background: var(--input-bg); color: var(--text-color); border: 2px solid var(--border-color); border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem;"
            onmouseover="this.style.background='var(--error-color)'; this.style.borderColor='var(--error-color)'; this.style.color='white'"
            onmouseout="this.style.background='var(--input-bg)'; this.style.borderColor='var(--border-color)'; this.style.color='var(--text-color)'"
          >
            <i class="fas fa-times"></i> Cancel
          </button>
          <button 
            id="restock-confirm-btn"
            type="button"
            style="flex: 1; padding: 1rem; background: var(--primary-color); color: white; border: 2px solid var(--primary-color); border-radius: 0.5rem; font-size: 1rem; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 0.5rem; box-shadow: 0 2px 8px rgba(0,123,255,0.3);"
            onmouseover="this.style.background='var(--primary-hover)'; this.style.borderColor='var(--primary-hover)'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,123,255,0.4)'"
            onmouseout="this.style.background='var(--primary-color)'; this.style.borderColor='var(--primary-color)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,123,255,0.3)'"
          >
            <i class="fas fa-check"></i> Confirm Restock
          </button>
        </div>
      </div>
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Function to update total cost display
    window.updateRestockTotal = function() {
      const quantityInput = document.getElementById('restock-quantity-input');
      const totalDisplay = document.getElementById('restock-total-amount');
      const quantity = parseInt(quantityInput.value) || 0;
      const totalCost = costEach * quantity;
      totalDisplay.textContent = totalCost.toLocaleString() + ' points';
    };

    // Focus input on mount
    const quantityInput = document.getElementById('restock-quantity-input');
    quantityInput.focus();
    quantityInput.select();

    // Close handlers
    const closeModal = () => {
      document.body.removeChild(modal);
      delete window.updateRestockTotal;
      resolve(null);
    };

    modal.querySelector('.close-modal').addEventListener('click', closeModal);
    document.getElementById('restock-cancel-btn').addEventListener('click', closeModal);

    // Confirm handler
    document.getElementById('restock-confirm-btn').addEventListener('click', () => {
      const quantity = parseInt(quantityInput.value);
      if (isNaN(quantity) || quantity <= 0) {
        quantityInput.style.borderColor = 'var(--error-color)';
        quantityInput.style.boxShadow = '0 0 0 3px rgba(220,53,69,0.1)';
        setTimeout(() => {
          quantityInput.style.borderColor = 'var(--border-color)';
          quantityInput.style.boxShadow = 'none';
        }, 2000);
        return;
      }

      // Validate prices - at least one must be set
      const tokenPriceInput = document.getElementById('restock-token-price');
      const artPriceInput = document.getElementById('restock-art-price');
      const otherPriceInput = document.getElementById('restock-other-price');
      
      const tokenPrice = tokenPriceInput.value ? parseFloat(tokenPriceInput.value) : null;
      const artPrice = artPriceInput.value.trim() || null;
      const otherPrice = otherPriceInput.value.trim() || null;

      // Check if at least one price is set
      const hasTokenPrice = tokenPrice !== null && tokenPrice !== undefined && tokenPrice > 0;
      const hasArtPrice = artPrice && artPrice !== 'N/A' && artPrice.trim() !== '';
      const hasOtherPrice = otherPrice && otherPrice !== 'N/A' && otherPrice.trim() !== '';

      if (!hasTokenPrice && !hasArtPrice && !hasOtherPrice) {
        // Show error on all price fields
        const errorStyle = 'var(--error-color)';
        const errorShadow = '0 0 0 3px rgba(220,53,69,0.1)';
        
        tokenPriceInput.style.borderColor = errorStyle;
        tokenPriceInput.style.boxShadow = errorShadow;
        artPriceInput.style.borderColor = errorStyle;
        artPriceInput.style.boxShadow = errorShadow;
        otherPriceInput.style.borderColor = errorStyle;
        otherPriceInput.style.boxShadow = errorShadow;

        // Show notification
        showVendingNotification('At least one price must be set (Token, Art, or Other price)', 'error');

        // Reset styles after 3 seconds
        setTimeout(() => {
          tokenPriceInput.style.borderColor = 'var(--border-color)';
          tokenPriceInput.style.boxShadow = 'none';
          artPriceInput.style.borderColor = 'var(--border-color)';
          artPriceInput.style.boxShadow = 'none';
          otherPriceInput.style.borderColor = 'var(--border-color)';
          otherPriceInput.style.boxShadow = 'none';
        }, 3000);
        return;
      }

      const slotSelect = document.getElementById('restock-slot-select');
      const selectedSlot = slotSelect ? slotSelect.value : null;

      document.body.removeChild(modal);
      delete window.updateRestockTotal;
      resolve({ 
        quantity, 
        slot: selectedSlot,
        tokenPrice: hasTokenPrice ? tokenPrice : null,
        artPrice: hasArtPrice ? artPrice : null,
        otherPrice: hasOtherPrice ? otherPrice : null
      });
    });

    // Close on escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal();
      }
    });
  });
}

// ------------------- Function: showVendingSetupModal -------------------
// Shows a modal to set up vending shop for the first time (one-time import from old method)
function showVendingSetupModal(character) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '95vw';
  modalContent.style.maxHeight = '90vh';
  modalContent.style.overflow = 'auto';

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-magic"></i> Setup Vending Shop: ${escapeHtmlAttribute(character.name)}
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body" style="padding: 1.5rem;">
      <div style="background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.5rem;">
        <p style="margin: 0; color: var(--warning-text, #856404); font-size: 0.9rem; line-height: 1.5;">
          <strong>⚠️ One-Time Setup:</strong> This can only be done once! This will import your existing vending data from the old method.
        </p>
      </div>
      <form id="vending-setup-form" style="display: flex; flex-direction: column; gap: 2rem;">
        <!-- Step 1: Pouch Type Selection -->
        <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
            <span style="background: var(--primary-color); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">1</span>
            Select Pouch Type
          </h3>
          <label style="display: block; margin-bottom: 0.75rem; color: var(--text-color); font-weight: 600; font-size: 0.95rem;">
            Pouch Type <span style="color: var(--error-color); font-weight: 700;">*</span>
          </label>
          <select 
            id="setup-pouch-type" 
            name="pouchType" 
            required
            style="width: 100%; padding: 0.85rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.95rem; cursor: pointer; font-weight: 500; transition: all 0.2s;"
            onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
            onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
          >
            <option value="">-- Select Pouch Type First --</option>
            <option value="none">None (0 slots)</option>
            <option value="bronze">Bronze (15 slots) - 1,000 tokens</option>
            <option value="silver">Silver (30 slots) - 5,000 tokens</option>
            <option value="gold">Gold (50 slots) - 10,000 tokens</option>
          </select>
          <div id="max-slots-display" style="margin-top: 1rem; padding: 1.25rem; background: linear-gradient(135deg, var(--input-bg) 0%, rgba(0,123,255,0.05) 100%); border: 2px solid var(--primary-color); border-radius: 0.5rem; color: var(--text-color); font-size: 0.9rem; display: none; box-shadow: 0 2px 8px rgba(0,123,255,0.1);">
            <div style="margin-bottom: 0.75rem;"><strong style="color: var(--primary-color); font-size: 1rem;">Starting Shop Slots:</strong></div>
            <div style="margin-left: 1rem; margin-bottom: 0.75rem; color: var(--text-color); font-size: 0.9rem; line-height: 2;">
              <div style="padding: 0.25rem 0;">• Shopkeeper: <strong style="color: var(--primary-color);">5 slots</strong></div>
              <div style="padding: 0.25rem 0;">• Merchant: <strong style="color: var(--primary-color);">3 slots</strong></div>
            </div>
            <div style="padding-top: 0.75rem; border-top: 2px solid var(--border-color); font-weight: 600;"><strong style="color: var(--text-color);">Total Max Slots Available:</strong> <span id="max-slots-value" style="color: var(--primary-color); font-size: 1.3rem; font-weight: 700;">0</span></div>
          </div>
        </div>

        <!-- Step 2: Add Inventory Items -->
        <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <h3 style="margin: 0; color: var(--text-color); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
              <span style="background: var(--primary-color); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">2</span>
              Add Inventory Items <span style="color: var(--error-color); font-size: 0.9rem; font-weight: 700;">*</span>
            </h3>
            <button 
              type="button" 
              id="add-vending-row-btn"
              disabled
              style="
                padding: 0.6rem 1.2rem;
                background: var(--input-bg);
                color: var(--text-secondary);
                border: 2px solid var(--border-color);
                border-radius: 0.5rem;
                cursor: not-allowed;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 0.5rem;
                opacity: 0.5;
                font-weight: 500;
                transition: all 0.2s;
              "
            >
              <i class="fas fa-plus"></i> Add Row
            </button>
          </div>
          <div id="pouch-required-message" style="padding: 1.25rem; background: linear-gradient(135deg, #fff3cd 0%, #ffe69c 100%); border: 2px solid #ffc107; border-radius: 0.5rem; color: #856404; font-size: 0.95rem; margin-bottom: 1rem; line-height: 1.6; font-weight: 500; box-shadow: 0 2px 4px rgba(255,193,7,0.2);">
            <strong style="font-size: 1rem;">⚠️ Please select a Pouch Type first</strong> to enable adding items. The system needs to know your maximum slot capacity.
          </div>
          <div id="vending-items-container" style="overflow-x: auto; border: 2px solid var(--border-color); border-radius: 0.5rem; min-height: 350px; max-height: 450px; overflow-y: auto; opacity: 0.5; pointer-events: none; background: var(--input-bg); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);">
            <table id="vending-setup-table" style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
              <thead style="position: sticky; top: 0; background: var(--card-bg); z-index: 10; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
                <tr style="border-bottom: 3px solid var(--border-color);">
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Character</th>
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Item Name <span style="color: var(--error-color); font-weight: 700;">*</span></th>
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Stock Qty <span style="color: var(--error-color); font-weight: 700;">*</span></th>
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Token Price</th>
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Art Price</th>
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Other Price</th>
                  <th style="padding: 1.25rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Trades Open?</th>
                  <th style="padding: 1.25rem 0.75rem; text-align: center; color: var(--text-color); font-weight: 700; background: var(--card-bg); width: 60px; font-size: 0.95rem;">Action</th>
                </tr>
              </thead>
              <tbody id="vending-setup-tbody">
                <!-- Rows will be added here -->
              </tbody>
            </table>
          </div>
          <p style="margin: 1rem 0 0 0; color: var(--text-color); font-size: 0.9rem; line-height: 1.6; padding: 0.75rem; background: rgba(0,123,255,0.05); border-radius: 0.25rem; border-left: 3px solid var(--primary-color);">
            <i class="fas fa-info-circle" style="margin-right: 0.5rem; color: var(--primary-color);"></i>
            Fill out the table with your vending inventory items. Character Name will default to <strong style="color: var(--primary-color);">${escapeHtmlAttribute(character.name)}</strong> if left empty. Token prices must be <strong>whole numbers only</strong>.
          </p>
        </div>

        <!-- Step 3: Additional Settings -->
        <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
            <span style="background: var(--primary-color); color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">3</span>
            Additional Settings
          </h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem;">
            <div>
              <label style="display: block; margin-bottom: 0.75rem; color: var(--text-color); font-weight: 600; font-size: 0.95rem;">
                Vending Points (Current)
              </label>
              <input 
                type="number" 
                id="setup-vending-points" 
                name="vendingPoints" 
                min="0"
                value="${character.vendingPoints || 0}"
                style="width: 100%; padding: 0.85rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.95rem; font-weight: 500; transition: all 0.2s;"
                onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
                onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
              />
            </div>
            <div>
              <label style="display: block; margin-bottom: 0.75rem; color: var(--text-color); font-weight: 600; font-size: 0.95rem;">
                Shop Banner Image URL <span style="color: var(--text-secondary); font-weight: normal; font-size: 0.85rem;">(Optional)</span>
              </label>
              <input 
                type="url" 
                id="setup-shop-image" 
                name="shopImage" 
                placeholder="https://..."
                style="width: 100%; padding: 0.85rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.95rem; font-weight: 500; transition: all 0.2s;"
                onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
                onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'"
              />
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 1rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color);">
          <button 
            type="submit" 
            style="
              flex: 1;
              padding: 1rem;
              background: var(--success-color);
              color: white;
              border: none;
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
              font-weight: 600;
              transition: all 0.2s;
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.5rem;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            "
            onmouseover="this.style.background='var(--success-hover)'; this.style.transform='translateY(-1px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.15)'" 
            onmouseout="this.style.background='var(--success-color)'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'"
          >
            <i class="fas fa-magic"></i> Setup & Import
          </button>
          <button 
            type="button" 
            class="close-modal"
            style="
              padding: 1rem 2rem;
              background: var(--card-bg);
              color: var(--text-color);
              border: 1px solid var(--border-color);
              border-radius: 0.5rem;
              cursor: pointer;
              font-size: 1rem;
              font-weight: 500;
              transition: all 0.2s;
            "
            onmouseover="this.style.background='var(--input-bg)'; this.style.borderColor='var(--primary-color)'" 
            onmouseout="this.style.background='var(--card-bg)'; this.style.borderColor='var(--border-color)'"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Fetch all items for autocomplete
  let allItems = [];
  (async () => {
    try {
      const response = await fetch('/api/items', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        const items = await response.json();
        allItems = items.map(item => item.itemName).filter(Boolean).sort();
      }
    } catch (error) {
      console.error('[profile.js]: Error fetching items for autocomplete:', error);
    }
  })();

  // Calculate and display slots based on pouch type
  const pouchTypeSelect = document.getElementById('setup-pouch-type');
  const maxSlotsDisplay = document.getElementById('max-slots-display');
  const maxSlotsValue = document.getElementById('max-slots-value');
  const addRowBtn = document.getElementById('add-vending-row-btn');
  const pouchRequiredMessage = document.getElementById('pouch-required-message');
  const vendingItemsContainer = document.getElementById('vending-items-container');

  // Determine base slots based on character job/vendorType
  const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
  const job = character.job?.toLowerCase() || character.vendorType?.toLowerCase() || '';
  const baseSlots = baseSlotLimits[job] || 0;

  // Function to update slots display and enable/disable form
  function updateSlotsDisplay() {
    if (!pouchTypeSelect) {
      console.error('[profile.js]: pouchTypeSelect not found');
      return;
    }
    
    const selectedPouch = pouchTypeSelect.value || '';
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const pouchSlots = pouchCapacities[selectedPouch] || 0;
    const totalSlots = baseSlots + pouchSlots;

    // Enable if any pouch is selected (including "none")
    if (selectedPouch && selectedPouch.trim() !== '') {
      // Show slots display
      maxSlotsDisplay.style.display = 'block';
      maxSlotsValue.textContent = `${totalSlots} (${baseSlots} base + ${pouchSlots} pouch)`;
      
      // Enable form
      addRowBtn.disabled = false;
      addRowBtn.style.background = 'var(--primary-color)';
      addRowBtn.style.color = 'white';
      addRowBtn.style.border = '2px solid var(--primary-color)';
      addRowBtn.style.cursor = 'pointer';
      addRowBtn.style.opacity = '1';
      addRowBtn.style.fontWeight = '600';
      addRowBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      addRowBtn.onmouseover = () => {
        addRowBtn.style.background = 'var(--primary-hover)';
        addRowBtn.style.transform = 'translateY(-1px)';
        addRowBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
      };
      addRowBtn.onmouseout = () => {
        addRowBtn.style.background = 'var(--primary-color)';
        addRowBtn.style.transform = 'translateY(0)';
        addRowBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      };
      
      // Hide warning message and enable table
      pouchRequiredMessage.style.display = 'none';
      vendingItemsContainer.style.opacity = '1';
      vendingItemsContainer.style.pointerEvents = 'auto';
      vendingItemsContainer.style.borderColor = 'var(--primary-color)';
      vendingItemsContainer.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.1)';
    } else {
      // Hide slots display
      maxSlotsDisplay.style.display = 'none';
      
      // Disable form
      addRowBtn.disabled = true;
      addRowBtn.style.background = 'var(--input-bg)';
      addRowBtn.style.color = 'var(--text-secondary)';
      addRowBtn.style.border = '2px solid var(--border-color)';
      addRowBtn.style.cursor = 'not-allowed';
      addRowBtn.style.opacity = '0.5';
      addRowBtn.style.fontWeight = '500';
      addRowBtn.style.boxShadow = 'none';
      addRowBtn.onmouseover = null;
      addRowBtn.onmouseout = null;
      
      // Show warning message and disable table
      pouchRequiredMessage.style.display = 'block';
      vendingItemsContainer.style.opacity = '0.4';
      vendingItemsContainer.style.pointerEvents = 'none';
      vendingItemsContainer.style.borderColor = 'var(--border-color)';
      vendingItemsContainer.style.boxShadow = 'none';
    }
  }

  // Add event listener for pouch type change
  if (pouchTypeSelect) {
    pouchTypeSelect.addEventListener('change', function() {
      console.log('[profile.js]: Pouch type changed to:', pouchTypeSelect.value);
      updateSlotsDisplay();
    });
    
    // Also listen for input event (some browsers fire this instead)
    pouchTypeSelect.addEventListener('input', function() {
      console.log('[profile.js]: Pouch type input changed to:', pouchTypeSelect.value);
      updateSlotsDisplay();
    });
  }

  // Set initial state (form should be disabled until pouch is selected)
  updateSlotsDisplay();

  // Add row button handler
  addRowBtn.addEventListener('click', () => {
    addVendingSetupRow(character.name, allItems);
  });

  // Function to add a new row to the table
  function addVendingSetupRow(defaultCharacterName, itemsList = []) {
    const tbody = document.getElementById('vending-setup-tbody');
    const row = document.createElement('tr');
    row.style.borderBottom = '2px solid var(--border-color)';
    row.style.backgroundColor = 'var(--card-bg)';
    
    // Character name cell
    const charNameCell = document.createElement('td');
    charNameCell.style.padding = '0.5rem';
    const charNameInput = document.createElement('input');
    charNameInput.type = 'text';
    charNameInput.className = 'vending-row-input';
    charNameInput.dataset.field = 'characterName';
    charNameInput.value = defaultCharacterName;
    charNameInput.placeholder = defaultCharacterName;
    charNameInput.style.cssText = 'width: 100%; padding: 0.6rem; border: 2px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; font-weight: 500; transition: all 0.2s;';
    charNameInput.onfocus = function() { this.style.borderColor = 'var(--primary-color)'; this.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.1)'; };
    charNameInput.onblur = function() { this.style.borderColor = 'var(--border-color)'; this.style.boxShadow = 'none'; };
    charNameCell.appendChild(charNameInput);
    row.appendChild(charNameCell);
    
    // Item name cell with autocomplete
    const itemNameCell = document.createElement('td');
    itemNameCell.style.padding = '0.5rem';
    itemNameCell.style.position = 'relative';
    
    const itemNameContainer = document.createElement('div');
    itemNameContainer.style.position = 'relative';
    
    const itemNameInput = document.createElement('input');
    itemNameInput.type = 'text';
    itemNameInput.className = 'vending-row-input';
    itemNameInput.dataset.field = 'itemName';
    itemNameInput.required = true;
    itemNameInput.placeholder = 'Search items...';
    itemNameInput.autocomplete = 'off';
    itemNameInput.style.cssText = 'width: 100%; padding: 0.6rem; border: 2px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; font-weight: 500; transition: all 0.2s;';
    itemNameInput.onfocus = function() { this.style.borderColor = 'var(--primary-color)'; this.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.1)'; };
    itemNameInput.onblur = function() { this.style.borderColor = 'var(--border-color)'; this.style.boxShadow = 'none'; };
    
    const itemDropdown = document.createElement('div');
    itemDropdown.className = 'vending-item-autocomplete';
    itemDropdown.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 400px;
      overflow-y: auto;
      background: var(--card-bg);
      border: 2px solid var(--border-color);
      border-radius: 0.5rem;
      margin-top: 2px;
      z-index: 10000;
      display: none;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    itemNameContainer.appendChild(itemNameInput);
    itemNameContainer.appendChild(itemDropdown);
    itemNameCell.appendChild(itemNameContainer);
    row.appendChild(itemNameCell);
    
    // Autocomplete functionality - uses allItems which will be updated when items load
    const filterItems = (searchTerm, itemsToSearch) => {
      if (!searchTerm) {
        // When no search term, show first 100 items to give a good starting point
        return itemsToSearch.slice(0, 100);
      }
      const term = searchTerm.toLowerCase();
      // When searching, show all matching results (no limit)
      return itemsToSearch.filter(item => item.toLowerCase().includes(term));
    };
    
    const renderDropdown = (items) => {
      itemDropdown.innerHTML = '';
      if (items.length === 0) {
        itemDropdown.innerHTML = '<div style="padding: 0.5rem; color: var(--text-secondary); font-style: italic; font-size: 0.85rem;">No items found</div>';
        itemDropdown.style.display = 'block';
        return;
      }
      
      items.forEach(item => {
        const option = document.createElement('div');
        option.textContent = item;
        option.style.cssText = `
          padding: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          color: var(--text-color);
          font-size: 0.9rem;
          font-weight: 500;
          border-bottom: 1px solid var(--border-color);
        `;
        
        option.addEventListener('mouseenter', () => {
          option.style.background = 'var(--primary-color)';
          option.style.color = 'white';
          option.style.fontWeight = '600';
        });
        
        option.addEventListener('mouseleave', () => {
          option.style.background = 'transparent';
          option.style.color = 'var(--text-color)';
          option.style.fontWeight = '500';
        });
        
        option.addEventListener('click', () => {
          itemNameInput.value = item;
          itemDropdown.style.display = 'none';
          itemNameInput.dispatchEvent(new Event('input'));
        });
        
        itemDropdown.appendChild(option);
      });
      
      itemDropdown.style.display = 'block';
    };
    
    itemNameInput.addEventListener('input', (e) => {
      // Use allItems if available (will be updated when items load), otherwise use itemsList
      const currentItems = allItems.length > 0 ? allItems : itemsList;
      const results = filterItems(e.target.value, currentItems);
      if (e.target.value.trim() && currentItems.length > 0) {
        renderDropdown(results);
      } else {
        itemDropdown.style.display = 'none';
      }
    });
    
    itemNameInput.addEventListener('focus', () => {
      const currentItems = allItems.length > 0 ? allItems : itemsList;
      if (currentItems.length > 0 && itemNameInput.value.trim()) {
        const results = filterItems(itemNameInput.value, currentItems);
        renderDropdown(results);
      } else if (currentItems.length > 0) {
        // Show first 100 items when focusing on empty input
        renderDropdown(currentItems.slice(0, 100));
      }
    });
    
    // Close dropdown when clicking outside
    const closeDropdown = (e) => {
      if (!itemNameContainer.contains(e.target)) {
        itemDropdown.style.display = 'none';
        document.removeEventListener('click', closeDropdown);
      }
    };
    
    itemNameInput.addEventListener('focus', () => {
      setTimeout(() => document.addEventListener('click', closeDropdown), 100);
    });
    
    // Add remaining cells
    const cells = [
      { field: 'stockQty', type: 'number', required: true, min: 1, value: 1, placeholder: '1' },
      { field: 'tokenPrice', type: 'number', min: 0, step: 1, value: 0, placeholder: '0' },
      { field: 'artPrice', type: 'text', placeholder: 'N/A' },
      { field: 'otherPrice', type: 'text', placeholder: 'N/A' },
      { field: 'tradesOpen', type: 'select', options: [{ value: 'false', text: 'No' }, { value: 'true', text: 'Yes' }] }
    ];
    
    cells.forEach(cellData => {
      const cell = document.createElement('td');
      cell.style.padding = '0.75rem';
      cell.style.borderRight = '1px solid var(--border-color)';
      
      if (cellData.type === 'select') {
        const select = document.createElement('select');
        select.className = 'vending-row-input';
        select.dataset.field = cellData.field;
        select.style.cssText = 'width: 100%; padding: 0.6rem; border: 2px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: all 0.2s;';
        select.onfocus = function() { this.style.borderColor = 'var(--primary-color)'; this.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.1)'; };
        select.onblur = function() { this.style.borderColor = 'var(--border-color)'; this.style.boxShadow = 'none'; };
        cellData.options.forEach(opt => {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.text;
          select.appendChild(option);
        });
        cell.appendChild(select);
      } else {
        const input = document.createElement('input');
        input.type = cellData.type;
        input.className = 'vending-row-input';
        input.dataset.field = cellData.field;
        if (cellData.required) input.required = true;
        if (cellData.min !== undefined) input.min = cellData.min;
        if (cellData.step !== undefined) input.step = cellData.step;
        if (cellData.value !== undefined) input.value = cellData.value;
        if (cellData.placeholder) input.placeholder = cellData.placeholder;
        input.style.cssText = 'width: 100%; padding: 0.6rem; border: 2px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; font-weight: 500; transition: all 0.2s;';
        input.onfocus = function() { this.style.borderColor = 'var(--primary-color)'; this.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.1)'; };
        input.onblur = function() { this.style.borderColor = 'var(--border-color)'; this.style.boxShadow = 'none'; };
        cell.appendChild(input);
      }
      
      row.appendChild(cell);
    });
    
    // Action cell with remove button
    const actionCell = document.createElement('td');
    actionCell.style.padding = '0.5rem';
    actionCell.style.textAlign = 'center';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-vending-row-btn';
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>';
    removeBtn.style.cssText = `
      padding: 0.6rem;
      background: var(--error-color);
      color: white;
      border: 2px solid var(--error-color);
      border-radius: 0.25rem;
      cursor: pointer;
      font-size: 0.9rem;
      width: 100%;
      font-weight: 600;
      transition: all 0.2s;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    removeBtn.onmouseover = () => {
      removeBtn.style.background = 'var(--error-hover)';
      removeBtn.style.borderColor = 'var(--error-hover)';
      removeBtn.style.transform = 'translateY(-1px)';
      removeBtn.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    };
    removeBtn.onmouseout = () => {
      removeBtn.style.background = 'var(--error-color)';
      removeBtn.style.borderColor = 'var(--error-color)';
      removeBtn.style.transform = 'translateY(0)';
      removeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
    };
    removeBtn.title = 'Remove row';
    removeBtn.addEventListener('click', () => {
      if (tbody.children.length > 1) {
        row.remove();
      } else {
        alert('You must have at least one row');
      }
    });
    actionCell.appendChild(removeBtn);
    row.appendChild(actionCell);
    
    tbody.appendChild(row);
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
        } else if (input.type === 'date') {
          rowData[field] = input.value || null;
        } else if (input.tagName === 'SELECT') {
          rowData[field] = input.value === 'true';
        } else {
          rowData[field] = input.value.trim() || null;
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
        // Display all errors if they exist
        let errorMessage = data.error || 'Failed to set up vending shop';
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          errorMessage = errorMessage + '\n\nValidation errors:\n' + data.errors.join('\n');
        }
        throw new Error(errorMessage);
      }

      // Check if there were any validation errors (but setup still succeeded)
      if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
        // Show validation errors in a nice modal
        showValidationErrorsModal(data.errors, 'Setup completed with some errors');
        // Don't close the setup modal, let user fix errors
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        return;
      } else {
        // Success - close modal and reload
        showValidationErrorsModal([], 'Vending shop set up successfully! Your inventory has been imported.', 'success');
      }
      
      document.body.removeChild(modal);
      
      // Reload vending shops
      const containerId = document.getElementById('vending-shops-container') ? 'vending-shops-container' : 'profile-vending-container';
      await loadVendingShops({ containerId });
    } catch (error) {
      console.error('[profile.js]: Error setting up vending:', error);
      // Parse error message for validation errors
      const errorMessage = error.message || 'An unknown error occurred';
      const errorLines = errorMessage.split('\n');
      
      // Check if error message contains validation errors
      const validationIndex = errorLines.findIndex(line => line.includes('Validation errors:'));
      if (validationIndex >= 0) {
        // Extract validation errors (everything after "Validation errors:")
        const errors = errorLines.slice(validationIndex + 1).filter(line => line.trim().length > 0);
        showValidationErrorsModal(errors, 'Validation Errors');
      } else {
        // Single error message
        showValidationErrorsModal([errorMessage], 'Error');
      }
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalText;
    }
  });
}

// ------------------- Function: showAddVendorItemModal -------------------
// Shows a modal to add a new item to vending inventory from user's inventory
async function showAddVendorItemModal(character) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '600px';

  // Fetch character's inventory (like inventory.js does) and item details
  let inventoryItems = [];
  // Fetch current vending inventory to see occupied slots
  let occupiedSlots = new Map(); // Map of slot -> itemName
  let totalSlots = 0;
  
  try {
    // Calculate total slots
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[character.vendorType?.toLowerCase()] || 0;
    const pouchSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    totalSlots = baseSlots + pouchSlots;
    
    // Fetch current vending inventory
    try {
      const vendingResponse = await fetch(`/api/characters/${character._id}/vending`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (vendingResponse.ok) {
        const vendingData = await vendingResponse.json();
        if (vendingData.items && Array.isArray(vendingData.items)) {
          vendingData.items.forEach(item => {
            if (item.slot) {
              occupiedSlots.set(item.slot, item.itemName);
            }
          });
        }
      }
    } catch (error) {
      console.warn('[profile.js]: Error fetching vending inventory for slot info:', error);
    }
    
    const inventoryResponse = await fetch(`/api/inventory/characters?characters=${encodeURIComponent(character.name)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (inventoryResponse.ok) {
      const inventoryData = await inventoryResponse.json();
      // Get items from this specific character's inventory
      if (inventoryData.data && Array.isArray(inventoryData.data)) {
        // Combine items with the same name (like inventory.js does)
        const combinedItems = inventoryData.data.reduce((acc, item) => {
          const existing = acc.find(i => i.itemName === item.itemName);
          if (existing) {
            existing.quantity += item.quantity || 0;
          } else {
            acc.push({
              itemName: item.itemName,
              quantity: item.quantity || 0
            });
          }
          return acc;
        }, []);
        
        // Fetch item details (including maxStackSize) for all items
        const itemNames = combinedItems.map(item => item.itemName);
        const itemsResponse = await fetch('/api/items', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        });
        
        let itemsData = [];
        if (itemsResponse.ok) {
          itemsData = await itemsResponse.json();
        }
        
        // Create a map of item details
        const itemsMap = new Map();
        itemsData.forEach(item => {
          itemsMap.set(item.itemName, item);
        });
        
        // Combine inventory items with item details
        inventoryItems = combinedItems
          .filter(item => item.quantity > 0)
          .map(item => {
            const itemDetails = itemsMap.get(item.itemName);
            return {
              itemName: item.itemName,
              quantity: item.quantity,
              maxStackSize: itemDetails?.maxStackSize || 10,
              stackable: itemDetails?.stackable || false
            };
          })
          .sort((a, b) => a.itemName.localeCompare(b.itemName));
      }
    }
  } catch (error) {
    console.error('[profile.js]: Error fetching character inventory:', error);
  }

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-plus"></i> Add Item from Inventory to ${escapeHtmlAttribute(character.name)}'s Shop
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body">
      <form id="add-vendor-item-form" style="display: flex; flex-direction: column; gap: 1.5rem;">
        <div class="form-group">
          <label for="item-name" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Item from Inventory *
          </label>
          ${inventoryItems.length > 0 ? `
          <select id="item-name" name="itemName" required
            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
            <option value="">-- Select an item from your inventory --</option>
            ${inventoryItems.map(item => `
              <option value="${escapeHtmlAttribute(item.itemName)}" 
                      data-quantity="${item.quantity}" 
                      data-max-stack="${item.maxStackSize || 10}"
                      data-stackable="${item.stackable || false}">
                ${escapeHtmlAttribute(item.itemName)} (Available: ${item.quantity}${item.stackable ? `, Max Stack: ${item.maxStackSize || 10}` : ', Not Stackable'})
              </option>
            `).join('')}
          </select>
          <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">
            Only items you own can be added to your vending shop.
          </p>
          ` : `
          <div style="padding: 1rem; background: var(--warning-bg, #fff3cd); border: 1px solid var(--warning-border, #ffc107); border-radius: 0.5rem; color: var(--warning-text, #856404);">
            <strong>⚠️ No items in inventory:</strong> You don't have any items in your inventory to add to the vending shop.
          </div>
          `}
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
          <input type="number" id="token-price" name="tokenPrice" min="0" step="1"
            placeholder="Enter token price (whole numbers only)"
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
            Slot Number <span style="color: var(--error-color);">*</span>
          </label>
          <select id="slot" name="slot" required
            style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem; font-weight: 500; cursor: pointer; transition: all 0.2s;"
            onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
            onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
            <option value="">-- Select a slot --</option>
            ${Array.from({ length: totalSlots }, (_, i) => {
              const slotNum = i + 1;
              const slotName = `Slot ${slotNum}`;
              const occupiedItem = occupiedSlots.get(slotName);
              return `<option value="${slotName}" ${occupiedItem ? 'disabled style="color: var(--error-color); background: rgba(255,0,0,0.1);"' : ''}>
                ${slotName}${occupiedItem ? ` - Occupied by ${escapeHtmlAttribute(occupiedItem)}` : ' - Available'}
              </option>`;
            }).join('')}
          </select>
          <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">
            Select which slot this item will occupy. Occupied slots are disabled.
          </p>
        </div>
        <div class="form-group">
          <label for="barter-open" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Barter/Trades Open
          </label>
          <select id="barter-open" name="barterOpen" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
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
          <button type="submit" ${inventoryItems.length === 0 ? 'disabled' : ''} style="
            padding: 0.75rem 1.5rem;
            background: ${inventoryItems.length === 0 ? 'var(--input-bg)' : 'var(--primary-color)'};
            color: ${inventoryItems.length === 0 ? 'var(--text-secondary)' : 'white'};
            border: none;
            border-radius: 0.5rem;
            cursor: ${inventoryItems.length === 0 ? 'not-allowed' : 'pointer'};
            font-size: 1rem;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            opacity: ${inventoryItems.length === 0 ? '0.6' : '1'};
          ">
            <i class="fas fa-plus"></i>
            Add Item from Inventory
          </button>
        </div>
      </form>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle item selection to update stock quantity max
  if (inventoryItems.length > 0) {
    const itemSelect = modal.querySelector('#item-name');
    const stockQtyInput = modal.querySelector('#stock-qty');
    
    itemSelect.addEventListener('change', (e) => {
      const selectedOption = e.target.options[e.target.selectedIndex];
      if (!selectedOption || !selectedOption.value) return;
      
      const availableQuantity = parseInt(selectedOption.dataset.quantity) || 1;
      const maxStackSize = parseInt(selectedOption.dataset.maxStack) || 10;
      const isStackable = selectedOption.dataset.stackable === 'true';
      
      // For non-stackable items, max is 1; for stackable, it's the minimum of available quantity and maxStackSize
      const maxQuantity = isStackable ? Math.min(availableQuantity, maxStackSize) : 1;
      
      stockQtyInput.max = maxQuantity;
      stockQtyInput.min = 1;
      stockQtyInput.value = '';
      stockQtyInput.placeholder = isStackable 
        ? `Enter stock quantity (max: ${maxQuantity}, max stack: ${maxStackSize})`
        : 'Enter stock quantity (max: 1, not stackable)';
      
      // Update the label to show available quantity and stack info
      const label = stockQtyInput.previousElementSibling;
      if (label && label.tagName === 'LABEL') {
        const stackInfo = isStackable 
          ? `(Available: ${availableQuantity}, Max Stack: ${maxStackSize}, Max to Add: ${maxQuantity})`
          : `(Available: ${availableQuantity}, Not Stackable, Max: 1)`;
        label.innerHTML = `Stock Quantity * <span style="color: var(--text-secondary); font-weight: normal; font-size: 0.85rem;">${stackInfo}</span>`;
      }
    });
  }

  // Handle form submission
  const form = modal.querySelector('#add-vendor-item-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (inventoryItems.length === 0) return;
    
    // Validate stock quantity doesn't exceed available quantity or max stack size
    const itemSelect = form.querySelector('#item-name');
    const stockQtyInput = form.querySelector('#stock-qty');
    if (itemSelect && stockQtyInput) {
      const selectedOption = itemSelect.options[itemSelect.selectedIndex];
      if (!selectedOption || !selectedOption.value) {
        showProfileMessage('Please select an item from inventory', 'error');
        return;
      }
      
      const availableQuantity = parseInt(selectedOption.dataset.quantity) || 1;
      const maxStackSize = parseInt(selectedOption.dataset.maxStack) || 10;
      const isStackable = selectedOption.dataset.stackable === 'true';
      const requestedQty = parseInt(stockQtyInput.value);
      
      if (isNaN(requestedQty) || requestedQty < 1) {
        showProfileMessage('Stock quantity must be at least 1', 'error');
        return;
      }
      
      if (!isStackable && requestedQty > 1) {
        showProfileMessage('This item is not stackable. Stock quantity must be 1.', 'error');
        return;
      }
      
      if (isStackable && requestedQty > maxStackSize) {
        showProfileMessage(`This item has a maximum stack size of ${maxStackSize}. Stock quantity cannot exceed this.`, 'error');
        return;
      }
      
      if (requestedQty > availableQuantity) {
        showProfileMessage(`Stock quantity cannot exceed available quantity (${availableQuantity})`, 'error');
        return;
      }
    }
    
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

// ------------------- Function: showManageVendorModal -------------------
// Shows a modal to manage existing vending items (edit/delete) and shop banner
async function showManageVendorModal(character) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '95vw';
  modalContent.style.maxHeight = '90vh';
  modalContent.style.overflow = 'auto';

  // Fetch current vending inventory
  let inventoryData = null;
  try {
    const vendingResponse = await fetch(`/api/characters/${character._id}/vending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (vendingResponse.ok) {
      inventoryData = await vendingResponse.json();
    } else {
      showProfileMessage('Failed to load vending inventory', 'error');
      return;
    }
  } catch (error) {
    console.error('[profile.js]: Error fetching vending inventory:', error);
    showProfileMessage('Failed to load vending inventory', 'error');
    return;
  }

  const items = inventoryData?.items || [];
  const shopImage = character.vendingSetup?.shopImage || character.shopImage || '';

  modalContent.innerHTML = `
    <div class="character-modal-header">
      <h2 style="margin: 0; color: var(--text-color); font-size: 1.5rem;">
        <i class="fas fa-cog"></i> Manage Vending Shop: ${escapeHtmlAttribute(character.name)}
      </h2>
      <button class="close-modal">&times;</button>
    </div>
    <div class="character-modal-body" style="padding: 1.5rem;">
      <!-- Shop Banner Image Section -->
      <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
          <i class="fas fa-image" style="color: var(--primary-color);"></i>
          Shop Banner Image
        </h3>
        <label for="manage-shop-image" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
          Shop Banner Image URL (Optional)
        </label>
        <input type="url" id="manage-shop-image" name="shopImage" value="${escapeHtmlAttribute(shopImage)}"
          placeholder="https://example.com/image.png"
          style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 0.95rem; transition: all 0.2s;"
          onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
          onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
        <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">
          Enter a URL for your shop banner image. This will be displayed when others view your shop.
        </p>
      </div>

      <!-- Existing Items Section -->
      <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h3 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; display: flex; align-items: center; gap: 0.5rem; font-weight: 600;">
          <i class="fas fa-boxes" style="color: var(--primary-color);"></i>
          Existing Items (${items.length})
        </h3>
        ${items.length > 0 ? `
          <div style="overflow-x: auto; border: 2px solid var(--border-color); border-radius: 0.5rem; max-height: 500px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
              <thead style="position: sticky; top: 0; background: var(--card-bg); z-index: 10; box-shadow: 0 4px 6px rgba(0,0,0,0.15);">
                <tr style="border-bottom: 3px solid var(--border-color);">
                  <th style="padding: 1rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Slot</th>
                  <th style="padding: 1rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Item Name</th>
                  <th style="padding: 1rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Stock</th>
                  <th style="padding: 1rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Token Price</th>
                  <th style="padding: 1rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Art Price</th>
                  <th style="padding: 1rem 0.75rem; text-align: left; color: var(--text-color); font-weight: 700; background: var(--card-bg); white-space: nowrap; font-size: 0.95rem; border-right: 1px solid var(--border-color);">Trades Open</th>
                  <th style="padding: 1rem 0.75rem; text-align: center; color: var(--text-color); font-weight: 700; background: var(--card-bg); width: 150px; font-size: 0.95rem;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${items.sort((a, b) => {
                  const slotA = a.slot ? parseInt(a.slot.replace(/[^0-9]/g, '')) || 999 : 999;
                  const slotB = b.slot ? parseInt(b.slot.replace(/[^0-9]/g, '')) || 999 : 999;
                  return slotA - slotB;
                }).map(item => {
                  const itemIdStr = typeof item._id === 'object' && item._id.toString ? item._id.toString() : String(item._id);
                  return `
                  <tr class="manage-item-row" data-item-id="${itemIdStr}" style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 1rem 0.75rem; border-right: 1px solid var(--border-color);">
                      <span style="font-weight: 700; color: white; font-size: 0.8rem; background: var(--primary-color); padding: 0.3rem 0.6rem; border-radius: 0.25rem;">
                        ${item.slot || 'No Slot'}
                      </span>
                    </td>
                    <td style="padding: 1rem 0.75rem; border-right: 1px solid var(--border-color); font-weight: 600; color: var(--text-color);">${escapeHtmlAttribute(item.itemName)}</td>
                    <td style="padding: 1rem 0.75rem; border-right: 1px solid var(--border-color); color: var(--text-color);">${item.stockQty || 1}</td>
                    <td style="padding: 1rem 0.75rem; border-right: 1px solid var(--border-color);">
                      <input type="number" class="manage-token-price" data-item-id="${itemIdStr}" 
                        value="${item.tokenPrice !== null && item.tokenPrice !== undefined ? item.tokenPrice : ''}" 
                        placeholder="0" min="0" step="1"
                        style="width: 100%; padding: 0.5rem; border: 2px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; transition: all 0.2s;"
                        onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px rgba(0,123,255,0.1)'"
                        onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    </td>
                    <td style="padding: 1rem 0.75rem; border-right: 1px solid var(--border-color);">
                      <input type="text" class="manage-art-price" data-item-id="${itemIdStr}" 
                        value="${item.artPrice && item.artPrice !== 'N/A' ? escapeHtmlAttribute(item.artPrice) : ''}" 
                        placeholder="N/A"
                        style="width: 100%; padding: 0.5rem; border: 2px solid var(--border-color); border-radius: 0.25rem; background: var(--input-bg); color: var(--text-color); font-size: 0.9rem; transition: all 0.2s;"
                        onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 2px rgba(0,123,255,0.1)'"
                        onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                    </td>
                    <td style="padding: 1rem 0.75rem; border-right: 1px solid var(--border-color);">
                      <label style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; cursor: pointer; margin: 0;">
                        <input type="checkbox" class="manage-trades-open" data-item-id="${itemIdStr}" ${item.tradesOpen ? 'checked' : ''} 
                          style="width: 22px; height: 22px; cursor: pointer; accent-color: var(--primary-color); border: 2px solid ${item.tradesOpen ? 'var(--primary-color)' : 'var(--border-color)'}; border-radius: 4px; background-color: ${item.tradesOpen ? 'var(--primary-color)' : 'transparent'}; transition: all 0.2s; box-shadow: ${item.tradesOpen ? '0 0 0 2px rgba(0,123,255,0.2)' : 'none'};"
                          onchange="const isChecked = this.checked; this.style.borderColor = isChecked ? 'var(--primary-color)' : 'var(--border-color)'; this.style.backgroundColor = isChecked ? 'var(--primary-color)' : 'transparent'; this.style.boxShadow = isChecked ? '0 0 0 2px rgba(0,123,255,0.2)' : 'none'; const span = this.nextElementSibling; if (span) span.textContent = isChecked ? 'Yes' : 'No'; span.style.color = isChecked ? 'var(--success-color)' : 'var(--text-secondary)'; span.style.fontWeight = isChecked ? '600' : '500';">
                        <span style="font-weight: ${item.tradesOpen ? '600' : '500'}; color: ${item.tradesOpen ? 'var(--success-color)' : 'var(--text-secondary)'}; font-size: 0.9rem; min-width: 30px;">${item.tradesOpen ? 'Yes' : 'No'}</span>
                      </label>
                    </td>
                    <td style="padding: 1rem 0.75rem; text-align: center;">
                      <div style="display: flex; gap: 0.5rem; justify-content: center;">
                        <button class="manage-save-item-btn" data-item-id="${itemIdStr}" style="
                          padding: 0.5rem 1rem;
                          background: var(--success-color);
                          color: white;
                          border: none;
                          border-radius: 0.25rem;
                          cursor: pointer;
                          font-size: 0.85rem;
                          transition: background 0.2s;
                          display: flex;
                          align-items: center;
                          gap: 0.25rem;
                        " title="Save changes" onmouseover="this.style.background='var(--success-hover)'" onmouseout="this.style.background='var(--success-color)'">
                          <i class="fas fa-save"></i> Save
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
            <i class="fas fa-inbox" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i>
            <p style="margin: 0; font-size: 1rem;">No items in vending inventory</p>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem;">Use the "Add Item from Inventory" button to add items.</p>
          </div>
        `}
      </div>

      <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
        <button type="button" class="cancel-manage-vendor-btn" style="
          padding: 0.75rem 1.5rem;
          background: var(--card-bg);
          color: var(--text-color);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 1rem;
          transition: background 0.2s;
        ">Close</button>
        <button type="button" id="save-shop-image-btn" style="
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
          Save Shop Banner
        </button>
      </div>
    </div>
  `;

  modal.appendChild(modalContent);
  document.body.appendChild(modal);

  // Handle save buttons for inline editing
  const saveButtons = modal.querySelectorAll('.manage-save-item-btn');
  saveButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.itemId;
      const row = btn.closest('.manage-item-row');
      const tokenPriceInput = row.querySelector('.manage-token-price');
      const artPriceInput = row.querySelector('.manage-art-price');
      const tradesOpenCheckbox = row.querySelector('.manage-trades-open');
      
      const formData = {
        tokenPrice: tokenPriceInput.value ? parseFloat(tokenPriceInput.value) : null,
        artPrice: artPriceInput.value.trim() || null,
        barterOpen: tradesOpenCheckbox.checked
      };

      try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

        const itemIdStr = typeof itemId === 'object' && itemId.toString ? itemId.toString() : String(itemId);
        const response = await fetch(`/api/characters/${character._id}/vending/items/${itemIdStr}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(formData)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
          throw new Error(errorData.error || `Failed to update item (${response.status})`);
        }

        showProfileMessage('Item updated successfully!', 'success');
        
        // Update the trades open text
        const tradesOpenSpan = tradesOpenCheckbox.nextElementSibling;
        if (tradesOpenSpan) {
          tradesOpenSpan.textContent = tradesOpenCheckbox.checked ? 'Yes' : 'No';
        }
        
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save';
        
        // Reload vending shops to reflect changes
        await loadVendingShops();
      } catch (error) {
        console.error('[profile.js]: ❌ Error updating vending item:', error);
        showProfileMessage(error.message || 'Failed to update item', 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Save';
      }
    });
  });
  
  // Update trades open text when checkbox changes
  const tradesOpenCheckboxes = modal.querySelectorAll('.manage-trades-open');
  tradesOpenCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const span = checkbox.nextElementSibling;
      if (span) {
        span.textContent = checkbox.checked ? 'Yes' : 'No';
        span.style.color = checkbox.checked ? 'var(--success-color)' : 'var(--text-secondary)';
        span.style.fontWeight = checkbox.checked ? '600' : '500';
      }
    });
  });

  // Handle save shop banner
  const saveShopImageBtn = modal.querySelector('#save-shop-image-btn');
  saveShopImageBtn.addEventListener('click', async () => {
    const shopImageInput = modal.querySelector('#manage-shop-image');
    const shopImageUrl = shopImageInput.value.trim();

    try {
      saveShopImageBtn.disabled = true;
      saveShopImageBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

      const response = await fetch(`/api/characters/${character._id}/vending/shop-image`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ shopImage: shopImageUrl || null })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save shop banner');
      }

      showProfileMessage('Shop banner saved successfully!', 'success');
      
      // Reload vending shops to reflect changes
      await loadVendingShops();
      
      // Update the modal with new data
      setTimeout(() => {
        modal.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => {
          if (modal.parentNode) {
            modal.parentNode.removeChild(modal);
          }
          showManageVendorModal(character);
        }, 300);
      }, 500);

    } catch (error) {
      console.error('[profile.js]: ❌ Error saving shop banner:', error);
      showProfileMessage(error.message || 'Failed to save shop banner', 'error');
      saveShopImageBtn.disabled = false;
      saveShopImageBtn.innerHTML = '<i class="fas fa-save"></i> Save Shop Banner';
    }
  });

  // Handle close
  const closeBtn = modal.querySelector('.close-modal');
  const cancelBtn = modal.querySelector('.cancel-manage-vendor-btn');
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

// ------------------- Function: loadVendorDashboard -------------------
// Loads and displays vendor dashboard content on the page
export async function loadVendorDashboard(characterId) {
  const dashboardContent = document.getElementById('vendor-dashboard-content');
  if (!dashboardContent) {
    console.error('[profile.js]: Vendor dashboard content container not found');
    return;
  }

  // Show loading state
  dashboardContent.innerHTML = `
    <div style="text-align: center; padding: 3rem;">
      <div class="loading-spinner"></div>
      <p style="margin-top: 1rem; color: var(--text-secondary);">Loading vendor information...</p>
    </div>
  `;

  // Fetch character data first
  let character = null;
  try {
    const characterResponse = await fetch(`/api/user/characters`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (characterResponse.ok) {
      const { data: characters } = await characterResponse.json();
      character = characters.find(c => c._id === characterId);
      if (!character) {
        throw new Error('Character not found');
      }
    } else {
      throw new Error('Failed to load character');
    }
  } catch (error) {
    console.error('[profile.js]: Error fetching character:', error);
    dashboardContent.innerHTML = `
      <div style="text-align: center; padding: 3rem;">
        <p style="color: var(--error-color);">Error loading character information. Please try again.</p>
      </div>
    `;
    return;
  }

  // Fetch vendor data
  let inventoryData = null;
  let characterTransactions = [];
  let characterInventory = [];
  try {
    // Fetch vending inventory
    const inventoryResponse = await fetch(`/api/characters/${characterId}/vending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (inventoryResponse.ok) {
      inventoryData = await inventoryResponse.json();
    }

    // Fetch character's full inventory for job/village/limited items
    try {
      const invResponse = await fetch(`/api/inventory/characters?characters=${encodeURIComponent(character.name)}`, {
        credentials: 'include'
      });
      if (invResponse.ok) {
        const invData = await invResponse.json();
        characterInventory = invData.data || [];
      }
    } catch (error) {
      console.warn('[profile.js]: Could not load character inventory:', error);
    }

    // Fetch transactions
    try {
      const transactionsResponse = await fetch(`/api/vending/transactions?limit=50&skip=0`, {
        credentials: 'include'
      });
      if (transactionsResponse.ok) {
        const transactionsData = await transactionsResponse.json();
        if (transactionsData.success && transactionsData.transactions) {
          characterTransactions = transactionsData.transactions.filter(tx => 
            tx.vendorCharacterName === character.name || tx.userCharacterName === character.name
          ).slice(0, 10); // Show last 10 transactions
        }
      }
    } catch (error) {
      console.warn('[profile.js]: Could not load transactions:', error);
    }
  } catch (error) {
    console.error('[profile.js]: Error fetching vendor data:', error);
    dashboardContent.innerHTML = `
      <div style="text-align: center; padding: 3rem;">
        <p style="color: var(--error-color);">Error loading vendor information. Please try again.</p>
      </div>
    `;
    return;
  }

  // Fetch village shop items for restocking (from vending_stock collection)
  let villageShopItems = [];
  let limitedItems = [];
  const characterVendorType = character.vendorType?.toLowerCase() || character.job?.toLowerCase() || '';
  const isShopkeeper = characterVendorType === 'shopkeeper';
  // Shopkeepers can only restock from their home village; Merchants can use current village
  const characterVillage = isShopkeeper 
    ? (character.homeVillage || character.currentVillage)
    : (character.currentVillage || character.homeVillage);
  
  if (characterVillage) {
    try {
      const villageShopResponse = await fetch(`/api/village-shops/${encodeURIComponent(characterVillage)}`, {
        credentials: 'include'
      });
      if (villageShopResponse.ok) {
        const villageData = await villageShopResponse.json();
        if (villageData.success) {
          // Filter items by vendor type (merchant or shopkeeper)
          const allItems = villageData.items || [];
          villageShopItems = allItems.filter(item => {
            if (!item.vendingType) return true; // Include items without type
            const itemType = item.vendingType.toLowerCase();
            return itemType === characterVendorType;
          });
          limitedItems = villageData.limitedItems || [];
        }
      } else {
        console.warn('[profile.js]: Failed to load village shop items:', villageShopResponse.status);
      }
    } catch (error) {
      console.warn('[profile.js]: Could not load village shop items:', error);
    }
  }

  // Calculate slot info
  const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
  const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
  const vendorType = character.vendorType?.toLowerCase() || character.job?.toLowerCase();
  const baseSlots = baseSlotLimits[vendorType] || 0;
  const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase() || character.vendingSetup?.pouchType?.toLowerCase() || 'none'] || 0;
  const totalSlots = baseSlots + extraSlots;
  const usedSlots = inventoryData?.character?.slots?.used || 0;
  const availableSlots = totalSlots - usedSlots;

  // Format last collected month
  const lastCollectedMonth = character.lastCollectedMonth || 0;
  const currentMonth = new Date().getMonth() + 1;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const lastCollectedText = lastCollectedMonth > 0 ? months[lastCollectedMonth - 1] : 'Never';
  const isCurrentMonth = lastCollectedMonth === currentMonth;

  const iconUrl = formatCharacterIconUrl(character.icon);
  const DEFAULT_SHOP_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
  const shopImage = character.vendingSetup?.shopImage || character.shopImage || DEFAULT_SHOP_IMAGE_URL;
  const isSetup = character.vendingSetup?.setupDate;

  // Build dashboard HTML
  dashboardContent.innerHTML = `
    <!-- Header Section with Collection Status -->
    <div style="background: linear-gradient(135deg, var(--primary-color) 0%, rgba(0,123,255,0.8) 100%); color: white; padding: 2rem; border-radius: 1rem; margin-bottom: 2rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); position: relative; overflow: hidden;">
      <div style="display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1rem; position: relative; z-index: 1;">
        <img src="${iconUrl}" alt="${character.name}" style="width: 100px; height: 100px; border-radius: 50%; object-fit: cover; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.3);" onerror="this.src='/images/ankleicon.png'">
        <div style="flex: 1;">
          <h2 style="margin: 0 0 0.5rem 0; color: white; font-size: 2.5rem; font-weight: 700;">${escapeHtmlAttribute(character.name)}</h2>
          <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 1.2rem;">
            ${capitalize(character.vendorType || character.job || 'Vendor')} • ${capitalize(character.currentVillage || character.homeVillage || 'Unknown')} • ${capitalize(character.shopPouch || character.vendingSetup?.pouchType || 'No')} Pouch
          </p>
        </div>
      </div>
      
      <!-- Collection Status Banner -->
      <div style="background: ${isCurrentMonth ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; border: 2px solid ${isCurrentMonth ? '#10b981' : '#ef4444'}; border-radius: 0.75rem; padding: 1rem 1.5rem; margin-bottom: 1rem; position: relative; z-index: 1; backdrop-filter: blur(10px);">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 1rem;">
            <div style="width: 50px; height: 50px; border-radius: 50%; background: ${isCurrentMonth ? '#10b981' : '#ef4444'}; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;">
              ${isCurrentMonth ? '✓' : '⚠'}
            </div>
            <div>
              <div style="font-size: 1.1rem; font-weight: 700; color: white; margin-bottom: 0.25rem;">
                ${isCurrentMonth ? 'Points Collected This Month!' : 'Points Not Collected This Month'}
              </div>
              <div style="font-size: 0.9rem; color: rgba(255,255,255,0.9);">
                ${isCurrentMonth ? 
                  `You collected your vending points in ${lastCollectedText}.` : 
                  lastCollectedMonth > 0 ? 
                    `Last collected: ${lastCollectedText} (${currentMonth - lastCollectedMonth} month${currentMonth - lastCollectedMonth !== 1 ? 's' : ''} ago)` :
                    'You have never collected vending points. Use /vending collect to collect them!'
                }
              </div>
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 2rem; font-weight: 700; color: white;">${(character.vendingPoints || 0).toLocaleString()}</div>
            <div style="font-size: 0.85rem; color: rgba(255,255,255,0.8);">Vending Points</div>
          </div>
        </div>
      </div>
      
      ${isShopkeeper && character.currentVillage?.toLowerCase() !== character.homeVillage?.toLowerCase() ? `
      <!-- Shopkeeper Travel Warning -->
      <div style="background: rgba(239, 68, 68, 0.2); border: 2px solid #ef4444; border-radius: 0.75rem; padding: 1rem 1.5rem; margin-bottom: 1rem; position: relative; z-index: 1; backdrop-filter: blur(10px);">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="width: 50px; height: 50px; border-radius: 50%; background: #ef4444; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; color: white;">
            ⚠
          </div>
          <div style="flex: 1;">
            <div style="font-size: 1.1rem; font-weight: 700; color: white; margin-bottom: 0.25rem;">
              Shopkeepers can only restock from their home village!
            </div>
            <div style="font-size: 0.9rem; color: rgba(255,255,255,0.9);">
              You are currently in ${capitalize(character.currentVillage || 'unknown')}, but your home village is ${capitalize(character.homeVillage || 'unknown')}. 
              Please travel to your home village using: <code style="background: rgba(0,0,0,0.3); padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.85rem;">/travel charactername:${character.name} destination:${character.homeVillage} mode:on foot</code>
            </div>
          </div>
        </div>
      </div>
      ` : ''}
      
      <!-- Shop Banner Image -->
      <div style="margin-top: 1rem; border-radius: 0.75rem; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.3); position: relative; z-index: 1; background: var(--input-bg); border: 2px solid var(--border-color);">
        <img src="${escapeHtmlAttribute(shopImage)}" alt="Shop Banner" style="width: 100%; max-height: 300px; object-fit: cover; display: block;" onerror="this.src='${DEFAULT_SHOP_IMAGE_URL}'">
      </div>
    </div>
    
    <div style="padding: 0;">
      <!-- Quick Stats Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
        <div style="background: linear-gradient(135deg, var(--card-bg) 0%, rgba(0,123,255,0.05) 100%); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.25rem; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Shop Slots</div>
          <div style="font-size: 2rem; font-weight: 700; color: var(--text-color); margin-bottom: 0.25rem;">${usedSlots}/${totalSlots}</div>
          <div style="font-size: 0.8rem; color: ${availableSlots > 0 ? 'var(--success-color)' : 'var(--error-color)'}; font-weight: 600;">
            ${availableSlots} available
          </div>
        </div>
        <div style="background: linear-gradient(135deg, var(--card-bg) 0%, rgba(0,123,255,0.05) 100%); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.25rem; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
          <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Items in Stock</div>
          <div style="font-size: 2rem; font-weight: 700; color: var(--primary-color);">${inventoryData?.items?.length || 0}</div>
        </div>
      </div>

      <!-- Management Actions -->
      <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h3 style="margin: 0; color: var(--text-color); font-size: 1.4rem; display: flex; align-items: center; gap: 0.75rem; font-weight: 700;">
            <i class="fas fa-tools" style="color: var(--primary-color); font-size: 1.2rem;"></i>
            Shop Management
          </h3>
        </div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          ${!isSetup ? `
          <button class="dashboard-setup-vendor-btn" data-character-id="${character._id}" data-character-name="${escapeHtmlAttribute(character.name)}" style="
            padding: 1rem 2rem;
            background: linear-gradient(135deg, var(--success-color) 0%, #45a049 100%);
            color: white;
            border: none;
            border-radius: 0.75rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(76, 175, 80, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(76, 175, 80, 0.3)'">
            <i class="fas fa-magic"></i>
            Setup Shop (One-Time)
          </button>
          ` : `
          <button class="dashboard-add-vendor-item-btn" data-character-id="${character._id}" style="
            padding: 1rem 2rem;
            background: linear-gradient(135deg, var(--primary-color) 0%, #0056b3 100%);
            color: white;
            border: none;
            border-radius: 0.75rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 16px rgba(0, 123, 255, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(0, 123, 255, 0.3)'">
            <i class="fas fa-plus"></i>
            Add Item from Inventory
          </button>
          <button class="dashboard-manage-vendor-btn" data-character-id="${character._id}" style="
            padding: 1rem 2rem;
            background: var(--card-bg);
            color: var(--text-color);
            border: 2px solid var(--border-color);
            border-radius: 0.75rem;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
          " onmouseover="this.style.background='var(--input-bg)'; this.style.borderColor='var(--primary-color)'; this.style.transform='translateY(-2px)'" onmouseout="this.style.background='var(--card-bg)'; this.style.borderColor='var(--border-color)'; this.style.transform='translateY(0)'">
            <i class="fas fa-cog"></i>
            Manage Items & Settings
            ${inventoryData && inventoryData.items && inventoryData.items.length > 0 ? 
              `<span style="margin-left: 0.5rem; background: var(--primary-color); color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 700;">${inventoryData.items.length}</span>` : 
              ''
            }
          </button>
          `}
        </div>
      </div>

      <!-- Available Stock for Restocking Section -->
      ${(villageShopItems.length > 0 || limitedItems.length > 0) ? `
      <div style="background: linear-gradient(135deg, var(--card-bg) 0%, rgba(16,185,129,0.05) 100%); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h3 style="margin: 0; color: var(--text-color); font-size: 1.4rem; display: flex; align-items: center; gap: 0.75rem; font-weight: 700;">
            <i class="fas fa-store" style="color: var(--success-color); font-size: 1.2rem;"></i>
            Available Stock in ${capitalize(characterVillage)} (${villageShopItems.length + limitedItems.length})
          </h3>
          <p style="margin: 0; color: var(--text-secondary); font-size: 0.9rem;">
            Items available for restocking from village shop
          </p>
        </div>
        ${villageShopItems.length > 0 ? `
        <div style="margin-bottom: 2rem;">
          <h4 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; font-weight: 600;">
            ${capitalize(characterVendorType || 'Vendor')} Items (${villageShopItems.length})
          </h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; max-height: 400px; overflow-y: auto;">
            ${villageShopItems.map(item => `
              <div style="padding: 1rem; background: var(--input-bg); border-radius: 0.5rem; border: 1px solid var(--border-color); text-align: center;">
                <div style="font-weight: 600; color: var(--text-color); font-size: 0.95rem; margin-bottom: 0.5rem;">${escapeHtmlAttribute(item.itemName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                  ${item.vendingType ? `<span style="background: ${item.vendingType.toLowerCase() === 'merchant' ? 'rgba(0,123,255,0.1)' : 'rgba(16,185,129,0.1)'}; color: ${item.vendingType.toLowerCase() === 'merchant' ? 'var(--primary-color)' : 'var(--success-color)'}; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 600; font-size: 0.7rem;">${item.vendingType}</span>` : ''}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                  <span style="color: var(--primary-color); font-weight: 600;">${item.costEach || 0}</span> points each
                </div>
                ${item.costEach > 0 ? `
                <button class="dashboard-restock-from-shop-btn" data-character-id="${character._id}" data-item-name="${escapeHtmlAttribute(item.itemName)}" data-cost-each="${item.costEach || 0}" style="
                  width: 100%;
                  padding: 0.5rem;
                  background: var(--success-color);
                  color: white;
                  border: none;
                  border-radius: 0.4rem;
                  cursor: pointer;
                  font-size: 0.85rem;
                  font-weight: 600;
                  transition: background 0.2s;
                " onmouseover="this.style.background='var(--success-hover)'" onmouseout="this.style.background='var(--success-color)'">
                  <i class="fas fa-shopping-cart"></i> Restock
                </button>
                ` : `
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-style: italic;">Not available for restock</div>
                `}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
        ${limitedItems.length > 0 ? `
        <div>
          <h4 style="margin: 0 0 1rem 0; color: var(--text-color); font-size: 1.1rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-star" style="color: #ffc107;"></i>
            Limited Items (${limitedItems.length})
          </h4>
          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1rem; max-height: 400px; overflow-y: auto;">
            ${limitedItems.map(item => `
              <div style="padding: 1rem; background: linear-gradient(135deg, var(--input-bg) 0%, rgba(255,193,7,0.1) 100%); border-radius: 0.5rem; border: 2px solid #ffc107; text-align: center;">
                <div style="font-weight: 600; color: var(--text-color); font-size: 0.95rem; margin-bottom: 0.5rem;">${escapeHtmlAttribute(item.itemName)}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
                  <span style="background: rgba(255,193,7,0.2); color: #ffc107; padding: 0.2rem 0.5rem; border-radius: 0.25rem; font-weight: 600; font-size: 0.7rem;">Limited</span>
                  ${item.stock ? `<span style="margin-left: 0.5rem; color: var(--text-secondary);">Stock: ${item.stock}</span>` : ''}
                </div>
                <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.75rem;">
                  <span style="color: #ffc107; font-weight: 600;">${item.costEach || 0}</span> points each
                </div>
                ${item.costEach > 0 ? `
                <button class="dashboard-restock-from-shop-btn" data-character-id="${character._id}" data-item-name="${escapeHtmlAttribute(item.itemName)}" data-cost-each="${item.costEach || 0}" style="
                  width: 100%;
                  padding: 0.5rem;
                  background: #ffc107;
                  color: #000;
                  border: none;
                  border-radius: 0.4rem;
                  cursor: pointer;
                  font-size: 0.85rem;
                  font-weight: 600;
                  transition: background 0.2s;
                " onmouseover="this.style.background='#ffb300'" onmouseout="this.style.background='#ffc107'">
                  <i class="fas fa-shopping-cart"></i> Restock
                </button>
                ` : `
                <div style="font-size: 0.75rem; color: var(--text-secondary); font-style: italic;">Not available for restock</div>
                `}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      ` : characterVillage ? `
      <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          <i class="fas fa-store" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
          <div style="font-size: 1rem; font-weight: 500;">No stock available in ${capitalize(characterVillage)}</div>
          <div style="font-size: 0.85rem; margin-top: 0.5rem;">Stock is generated monthly. Check back next month!</div>
        </div>
      </div>
      ` : ''}

      <!-- Vending Inventory Section -->
      <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.5rem; margin-bottom: 2rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h3 style="margin: 0; color: var(--text-color); font-size: 1.4rem; display: flex; align-items: center; gap: 0.75rem; font-weight: 700;">
            <i class="fas fa-boxes" style="color: var(--primary-color); font-size: 1.2rem;"></i>
            Vending Shop Inventory (${inventoryData?.items?.length || 0})
          </h3>
        </div>
        <div style="max-height: 500px; overflow-y: auto;">
          ${inventoryData && inventoryData.items && inventoryData.items.length > 0 ? 
            inventoryData.items.sort((a, b) => {
              const slotA = a.slot ? parseInt(a.slot.replace(/[^0-9]/g, '')) || 999 : 999;
              const slotB = b.slot ? parseInt(b.slot.replace(/[^0-9]/g, '')) || 999 : 999;
              return slotA - slotB;
            }).map(item => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 1.25rem; background: linear-gradient(135deg, var(--input-bg) 0%, rgba(0,123,255,0.03) 100%); border-radius: 0.75rem; border: 2px solid var(--border-color); margin-bottom: 1rem; transition: all 0.2s;" onmouseover="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 4px 12px rgba(0,123,255,0.15)'" onmouseout="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
                <div style="flex: 1;">
                  <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                    <span style="font-weight: 700; color: white; font-size: 0.9rem; background: linear-gradient(135deg, var(--primary-color) 0%, #0056b3 100%); padding: 0.5rem 1rem; border-radius: 0.5rem; min-width: 70px; text-align: center; box-shadow: 0 2px 6px rgba(0,123,255,0.3);">
                      ${item.slot || 'No Slot'}
                    </span>
                    <span style="font-weight: 600; color: var(--text-color); font-size: 1.15rem;">${escapeHtmlAttribute(item.itemName)}</span>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-top: 0.75rem;">
                    <div style="padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 0.4rem;">
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.5px;">Stock</div>
                      <div style="font-size: 1rem; font-weight: 700; color: var(--text-color);">${item.stockQty}</div>
                    </div>
                    ${item.tokenPrice !== null && item.tokenPrice !== undefined ? `
                    <div style="padding: 0.5rem; background: rgba(0,123,255,0.1); border-radius: 0.4rem;">
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.5px;">💰 Tokens</div>
                      <div style="font-size: 1rem; font-weight: 700; color: var(--primary-color);">${item.tokenPrice}</div>
                    </div>
                    ` : ''}
                    ${item.artPrice && item.artPrice !== 'N/A' ? `
                    <div style="padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 0.4rem;">
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.5px;">🎨 Art</div>
                      <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-color);">${escapeHtmlAttribute(item.artPrice)}</div>
                    </div>
                    ` : ''}
                    ${item.otherPrice && item.otherPrice !== 'N/A' ? `
                    <div style="padding: 0.5rem; background: rgba(0,0,0,0.05); border-radius: 0.4rem;">
                      <div style="font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem; text-transform: uppercase; letter-spacing: 0.5px;">Other</div>
                      <div style="font-size: 0.9rem; font-weight: 600; color: var(--text-color);">${escapeHtmlAttribute(item.otherPrice)}</div>
                    </div>
                    ` : ''}
                    ${item.barterOpen || item.tradesOpen ? `
                    <div style="padding: 0.5rem; background: rgba(16,185,129,0.1); border-radius: 0.4rem;">
                      <div style="font-size: 0.75rem; color: var(--success-color); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">🔄 Barter Open</div>
                    </div>
                    ` : ''}
                  </div>
                </div>
                <div style="display: flex; gap: 0.75rem; margin-left: 1.5rem;">
                  ${item.costEach > 0 ? `
                  <button class="dashboard-restock-item-btn" data-character-id="${character._id}" data-item-id="${item._id}" data-item-name="${escapeHtmlAttribute(item.itemName)}" data-cost-each="${item.costEach}" data-slot="${item.slot || ''}" style="
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, var(--success-color) 0%, #45a049 100%);
                    color: white;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 600;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    box-shadow: 0 2px 6px rgba(76, 175, 80, 0.3);
                  " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 10px rgba(76, 175, 80, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(76, 175, 80, 0.3)'" title="Restock item (${item.costEach} points each)">
                    <i class="fas fa-sync-alt"></i>
                    Restock
                  </button>
                  ` : ''}
                  <button class="dashboard-edit-vendor-item-btn" data-character-id="${character._id}" data-item-id="${item._id}" style="
                    padding: 0.75rem 1.25rem;
                    background: linear-gradient(135deg, var(--primary-color) 0%, #0056b3 100%);
                    color: white;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    font-size: 0.9rem;
                    font-weight: 600;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    box-shadow: 0 2px 6px rgba(0,123,255,0.3);
                  " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 10px rgba(0,123,255,0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 6px rgba(0,123,255,0.3)'" title="Edit item">
                    <i class="fas fa-edit"></i>
                    Edit
                  </button>
                </div>
              </div>
            `).join('') : 
            '<div style="text-align: center; padding: 4rem; color: var(--text-secondary);"><i class="fas fa-inbox" style="font-size: 4rem; margin-bottom: 1rem; opacity: 0.5;"></i><div style="font-size: 1.2rem; font-weight: 500;">No items in vending inventory</div><div style="font-size: 0.9rem; margin-top: 0.5rem; color: var(--text-secondary);">Add items from your inventory to start selling!</div></div>'
          }
        </div>
      </div>

      <!-- Recent Transactions Section -->
      <div style="background: var(--card-bg); border: 2px solid var(--border-color); border-radius: 0.75rem; padding: 1.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 1rem;">
          <h3 style="margin: 0; color: var(--text-color); font-size: 1.4rem; display: flex; align-items: center; gap: 0.75rem; font-weight: 700;">
            <i class="fas fa-exchange-alt" style="color: var(--primary-color); font-size: 1.2rem;"></i>
            Recent Transactions (${characterTransactions.length})
          </h3>
        </div>
        <div style="max-height: 300px; overflow-y: auto;">
          ${characterTransactions.length > 0 ? 
            characterTransactions.map(tx => {
              const date = new Date(tx.date).toLocaleString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              const statusColor = tx.status === 'completed' ? '#10b981' : 
                                  tx.status === 'pending' ? '#f59e0b' : 
                                  tx.status === 'failed' ? '#ef4444' : 
                                  tx.status === 'expired' ? '#6b7280' : '#6366f1';
              
              // Determine transaction type and display text
              const isVendorPurchase = tx.transactionType === 'vendor_purchase';
              const isVendorMove = tx.transactionType === 'vendor_move';
              const isVendorTransaction = isVendorPurchase || isVendorMove;
              
              let roleText = '';
              if (isVendorPurchase) {
                roleText = '📦 Restocked';
              } else if (isVendorMove) {
                roleText = '📤 Moved from inventory';
              } else {
                const isVendor = tx.vendorCharacterName === character.name;
                roleText = isVendor ? 'Sold to' : 'Bought from';
                roleText += ` ${isVendor ? tx.userCharacterName : tx.vendorCharacterName}`;
              }
              
              let paymentInfo = '';
              let paymentMethodDisplay = '';
              if (isVendorPurchase) {
                paymentMethodDisplay = '💎 Vending Points';
                paymentInfo = `${tx.pointsSpent || 0} points`;
              } else if (isVendorMove) {
                paymentMethodDisplay = '📦 Inventory Transfer';
                paymentInfo = 'From personal inventory';
              } else if (tx.paymentMethod === 'tokens') {
                paymentMethodDisplay = '💰 Tokens';
                paymentInfo = '💰 Tokens';
              } else if (tx.paymentMethod === 'art') {
                paymentMethodDisplay = '🎨 Art';
                paymentInfo = '🎨 Art';
              } else if (tx.paymentMethod === 'barter') {
                paymentMethodDisplay = '🔄 Barter';
                const items = tx.offeredItemsWithQty && tx.offeredItemsWithQty.length > 0 
                  ? tx.offeredItemsWithQty 
                  : (tx.offeredItems || []).map(item => ({ itemName: item, quantity: 1 }));
                paymentInfo = items.map(item => item.itemName + ' x' + item.quantity).join(', ');
              } else {
                paymentMethodDisplay = tx.paymentMethod || 'N/A';
              }
              return `
                <div style="background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem;">
                  <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
                    <div style="flex: 1;">
                      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
                        <span style="background: ${statusColor}; color: white; padding: 0.25rem 0.6rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">
                          ${tx.status}
                        </span>
                        <span style="color: var(--text-secondary); font-size: 0.85rem;">
                          ${roleText}
                        </span>
                      </div>
                      <h4 style="margin: 0; color: var(--text-color); font-size: 1rem; font-weight: 600;">
                        ${escapeHtmlAttribute(tx.itemName)} × ${tx.quantity}
                      </h4>
                    </div>
                    <span style="color: var(--text-secondary); font-size: 0.8rem; white-space: nowrap; margin-left: 0.5rem;">${date}</span>
                  </div>
                  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem;">
                    <div>
                      <span style="color: var(--text-secondary); font-size: 0.8rem;">Payment</span>
                      <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-weight: 500; font-size: 0.9rem;">
                        ${paymentMethodDisplay}
                      </p>
                    </div>
                    ${paymentInfo ? `
                    <div>
                      <span style="color: var(--text-secondary); font-size: 0.8rem;">${isVendorPurchase ? 'Points Spent' : isVendorMove ? 'Source' : tx.paymentMethod === 'barter' ? 'Traded Items' : 'Amount'}</span>
                      <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-weight: 500; font-size: 0.9rem;">${escapeHtmlAttribute(paymentInfo)}</p>
                    </div>
                    ` : ''}
                  </div>
                </div>
              `;
            }).join('') : 
            '<div style="text-align: center; padding: 3rem; color: var(--text-secondary);"><i class="fas fa-exchange-alt" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i><div style="font-size: 1.1rem;">No transactions found</div></div>'
          }
        </div>
      </div>
    </div>
  `;

  // Add event listeners for dashboard buttons
  const setupBtn = dashboardContent.querySelector('.dashboard-setup-vendor-btn');
  setupBtn?.addEventListener('click', () => {
    showVendingSetupModal(character);
  });

  const addBtn = dashboardContent.querySelector('.dashboard-add-vendor-item-btn');
  addBtn?.addEventListener('click', () => {
    showAddVendorItemModal(character);
  });

  const manageBtn = dashboardContent.querySelector('.dashboard-manage-vendor-btn');
  manageBtn?.addEventListener('click', () => {
    showManageVendorModal(character);
  });

  // Add event listeners for edit buttons on inventory items
  const editButtons = dashboardContent.querySelectorAll('.dashboard-edit-vendor-item-btn');
  editButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = btn.dataset.itemId;
      const item = inventoryData?.items?.find(i => i._id === itemId);
      if (item) {
        await showEditVendorItemModal(character, item);
        // Reload dashboard after editing
        await loadVendorDashboard(characterId);
      }
    });
  });

  // Add event listeners for restock from shop buttons
  const restockFromShopButtons = dashboardContent.querySelectorAll('.dashboard-restock-from-shop-btn');
  restockFromShopButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const characterId = btn.dataset.characterId;
      const itemName = btn.dataset.itemName;
      const costEach = parseFloat(btn.dataset.costEach) || 0;

      if (costEach <= 0) {
        showVendingNotification('This item cannot be restocked (no cost set).', 'error');
        return;
      }

      // Show custom restock modal
      const restockData = await showRestockModal(itemName, costEach, characterId);
      if (!restockData || !restockData.quantity) return;

      const quantity = restockData.quantity;
      const slot = restockData.slot;
      const totalCost = costEach * quantity;

      // Disable button during request
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restocking...';

      try {
        // Restock the item (API will handle creating it if it doesn't exist)
        const response = await fetch(`/api/characters/${characterId}/vending/restock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            itemName: itemName,
            quantity: quantity,
            costEach: costEach,
            slot: slot,
            tokenPrice: restockData.tokenPrice,
            artPrice: restockData.artPrice,
            otherPrice: restockData.otherPrice
          })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showVendingNotification(`Successfully restocked ${quantity} × ${itemName}!\n\nPoints spent: ${totalCost}`, 'success');
          // Reload dashboard to show updated stock
          await loadVendorDashboard(characterId);
        } else {
          showVendingNotification(`Failed to restock: ${result.error || 'Unknown error'}`, 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Restock';
        }
      } catch (error) {
        console.error('[profile.js]: Error restocking item from shop:', error);
        showVendingNotification(`Error restocking item: ${error.message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i> Restock';
      }
    });
  });

  // Add event listeners for restock buttons
  const restockButtons = dashboardContent.querySelectorAll('.dashboard-restock-item-btn');
  restockButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const characterId = btn.dataset.characterId;
      const itemId = btn.dataset.itemId;
      const itemName = btn.dataset.itemName;
      const costEach = parseFloat(btn.dataset.costEach) || 0;
      const slot = btn.dataset.slot || '';

      if (costEach <= 0) {
        showVendingNotification('This item cannot be restocked (no cost set).', 'error');
        return;
      }

      // Show custom restock modal
      const restockData = await showRestockModal(itemName, costEach, characterId, itemId, slot);
      if (!restockData || !restockData.quantity) return;

      const quantity = restockData.quantity;
      const selectedSlot = restockData.slot || slot;
      const totalCost = costEach * quantity;

      // Disable button during request
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restocking...';

      try {
        const response = await fetch(`/api/characters/${characterId}/vending/restock`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            itemId: itemId,
            itemName: itemName,
            quantity: quantity,
            slot: selectedSlot || slot,
            tokenPrice: restockData.tokenPrice,
            artPrice: restockData.artPrice,
            otherPrice: restockData.otherPrice
          })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showVendingNotification(`Successfully restocked ${quantity} × ${itemName}!\n\nPoints spent: ${totalCost}`, 'success');
          // Reload dashboard to show updated stock
          await loadVendorDashboard(characterId);
        } else {
          showVendingNotification(`Failed to restock: ${result.error || 'Unknown error'}`, 'error');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-sync-alt"></i> Restock';
        }
      } catch (error) {
        console.error('[profile.js]: Error restocking item:', error);
        showVendingNotification(`Error restocking item: ${error.message}`, 'error');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-sync-alt"></i> Restock';
      }
    });
  });

}

// ------------------- Function: showEditVendorItemModal -------------------
// Shows a modal to edit an existing vending item
async function showEditVendorItemModal(character, item) {
  const modal = document.createElement('div');
  modal.className = 'character-modal';
  modal.style.zIndex = '10001';

  const modalContent = document.createElement('div');
  modalContent.className = 'character-modal-content';
  modalContent.style.maxWidth = '600px';

  // Fetch current vending inventory to see occupied slots
  let occupiedSlots = new Map(); // Map of slot -> itemName
  let totalSlots = 0;
  
  try {
    // Calculate total slots
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[character.vendorType?.toLowerCase()] || 0;
    const pouchSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    totalSlots = baseSlots + pouchSlots;
    
    // Fetch current vending inventory
    try {
      const vendingResponse = await fetch(`/api/characters/${character._id}/vending`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (vendingResponse.ok) {
        const vendingData = await vendingResponse.json();
        if (vendingData.items && Array.isArray(vendingData.items)) {
          vendingData.items.forEach(vendingItem => {
            // Don't mark the current item's slot as occupied (since we're editing it)
            if (vendingItem.slot && vendingItem._id !== item._id) {
              occupiedSlots.set(vendingItem.slot, vendingItem.itemName);
            }
          });
        }
      }
    } catch (error) {
      console.warn('[profile.js]: Error fetching vending inventory for slot info:', error);
    }
  } catch (error) {
    console.error('[profile.js]: Error calculating slots:', error);
  }

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
          <input type="number" id="edit-token-price" name="tokenPrice" min="0" step="1" value="${item.tokenPrice || ''}"
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
            Slot Number <span style="color: var(--error-color);">*</span>
          </label>
          <select id="edit-slot" name="slot" required
            style="width: 100%; padding: 0.75rem; border: 2px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem; font-weight: 500; cursor: pointer; transition: all 0.2s;"
            onfocus="this.style.borderColor='var(--primary-color)'; this.style.boxShadow='0 0 0 3px rgba(0,123,255,0.1)'"
            onblur="this.style.borderColor='var(--border-color)'; this.style.boxShadow='none'">
            <option value="">-- Select a slot --</option>
            ${Array.from({ length: totalSlots }, (_, i) => {
              const slotNum = i + 1;
              const slotName = `Slot ${slotNum}`;
              const occupiedItem = occupiedSlots.get(slotName);
              const isCurrentSlot = item.slot === slotName;
              return `<option value="${slotName}" ${occupiedItem && !isCurrentSlot ? 'disabled style="color: var(--error-color); background: rgba(255,0,0,0.1);"' : ''} ${isCurrentSlot ? 'selected' : ''}>
                ${slotName}${occupiedItem && !isCurrentSlot ? ` - Occupied by ${escapeHtmlAttribute(occupiedItem)}` : isCurrentSlot ? ' - Current Slot' : ' - Available'}
              </option>`;
            }).join('')}
          </select>
          <p style="margin: 0.5rem 0 0 0; color: var(--text-secondary); font-size: 0.85rem;">
            Select which slot this item will occupy. Occupied slots are disabled.
          </p>
        </div>
        <div class="form-group">
          <label for="edit-barter-open" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: var(--text-color);">
            Barter/Trades Open
          </label>
          <select id="edit-barter-open" name="barterOpen" style="width: 100%; padding: 0.75rem; border: 1px solid var(--border-color); border-radius: 0.5rem; background: var(--input-bg); color: var(--text-color); font-size: 1rem;">
            <option value="false" ${!(item.barterOpen !== undefined ? item.barterOpen : (item.tradesOpen || false)) ? 'selected' : ''}>No</option>
            <option value="true" ${(item.barterOpen !== undefined ? item.barterOpen : (item.tradesOpen || false)) ? 'selected' : ''}>Yes</option>
          </select>
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
    
    // Validate slot availability before submitting
    const slotInput = form.slot;
    if (!slotInput.value.trim()) {
      throw new Error('Please select a slot for this item');
    }
    
    // Check if slot is available by fetching current vending inventory
    try {
      const vendingResponse = await fetch(`/api/characters/${characterId}/vending`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (vendingResponse.ok) {
        const vendingData = await vendingResponse.json();
        const items = vendingData?.items || [];
        const selectedSlot = slotInput.value.trim();
        
        // Check if slot is already occupied
        const slotOccupied = items.some(item => item.slot === selectedSlot);
        if (slotOccupied) {
          throw new Error(`Slot ${selectedSlot} is already occupied. Please select a different slot.`);
        }
        
        // Check total slots available
        const totalSlots = vendingData.character?.slots?.total || 0;
        const usedSlots = items.length;
        const availableSlots = totalSlots - usedSlots;
        
        if (availableSlots <= 0) {
          throw new Error(`You have no available slots. You have used all ${totalSlots} slots.`);
        }
      }
    } catch (validationError) {
      if (validationError.message.includes('Slot') || validationError.message.includes('slots')) {
        throw validationError;
      }
      // If it's a network error, continue anyway - server will validate
      console.warn('[profile.js]: Could not validate slots client-side:', validationError);
    }
    
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

    // Get barter open value from select element
    const barterOpenSelect = form.querySelector('#barter-open') || form.querySelector('select[name="barterOpen"]') || form.barterOpen;
    const barterOpenValue = barterOpenSelect ? barterOpenSelect.value : 'false';
    const barterOpenBool = barterOpenValue === 'true';
    
    console.log('[profile.js]: Adding vending item with barterOpen:', barterOpenBool, 'from value:', barterOpenValue);
    
    const formData = {
      itemName: form.itemName.value.trim(),
      stockQty: parseInt(form.stockQty.value),
      tokenPrice: form.tokenPrice.value ? parseFloat(form.tokenPrice.value) : null,
      artPrice: form.artPrice.value.trim() || null,
      otherPrice: form.otherPrice.value.trim() || null,
      barterOpen: barterOpenBool,
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
    submitBtn.innerHTML = '<i class="fas fa-plus"></i> Add Item from Inventory';
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

    // Ensure itemId is a string
    const itemIdStr = typeof itemId === 'object' && itemId.toString ? itemId.toString() : String(itemId);
    
    const barterOpenSelect = form.querySelector('#edit-barter-open') || form.querySelector('select[name="barterOpen"]');
    const formData = {
      stockQty: parseInt(form.stockQty.value),
      tokenPrice: form.tokenPrice.value ? parseFloat(form.tokenPrice.value) : null,
      artPrice: form.artPrice.value.trim() || null,
      otherPrice: form.otherPrice.value.trim() || null,
      barterOpen: barterOpenSelect ? barterOpenSelect.value === 'true' : false,
      slot: form.slot.value.trim() || null
    };

    const response = await fetch(`/api/characters/${characterId}/vending/items/${itemIdStr}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
      throw new Error(errorData.error || `Failed to update item (${response.status})`);
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
// ------------------- Section: Vending Transactions -------------------
// ============================================================================

let currentVendingFilter = 'all'; // 'all', 'buyer', 'vendor', 'pending', 'completed'
let currentVendingPage = 1;
const vendingPageSize = 50;

// ------------------- Function: setupStealCooldownsSelector -------------------
// Sets up the character selector for steal cooldowns
async function setupStealCooldownsSelector() {
  try {
    const selector = document.getElementById('steal-cooldowns-character-select');
    if (!selector) {
      return;
    }

    // Fetch user's characters
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

    // Clear existing options (except the first one)
    selector.innerHTML = '<option value="">Select a character...</option>';

    // Add character options
    characters.forEach(char => {
      const option = document.createElement('option');
      option.value = char._id;
      option.textContent = char.name;
      selector.appendChild(option);
    });

    // Set up change event listener
    selector.addEventListener('change', async (e) => {
      const characterId = e.target.value;
      if (characterId) {
        await loadStealCooldowns(characterId);
      } else {
        const content = document.getElementById('steal-cooldowns-content');
        if (content) {
          content.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
              <i class="fas fa-info-circle" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.5;"></i>
              <p>Select a character to view steal cooldowns</p>
            </div>
          `;
        }
      }
    });
  } catch (error) {
    console.error('[profile.js]: Error setting up steal cooldowns selector:', error);
  }
}

// ------------------- Function: loadStealCooldowns -------------------
// Loads and displays steal cooldown information for a character
export async function loadStealCooldowns(characterId) {
  try {
    const cooldownsContainer = document.getElementById('steal-cooldowns-content');
    if (!cooldownsContainer) {
      console.warn('[profile.js]: Steal cooldowns container not found');
      return;
    }

    // Show loading state
    cooldownsContainer.innerHTML = '<div class="loading-state"><i class="fas fa-spinner fa-spin"></i> Loading cooldowns...</div>';

    const response = await fetch(`/api/steal/cooldowns/${characterId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        cooldownsContainer.innerHTML = '<div class="error-message">Character not found</div>';
        return;
      }
      if (response.status === 403) {
        cooldownsContainer.innerHTML = '<div class="error-message">Access denied</div>';
        return;
      }
      throw new Error(`Failed to load cooldowns: ${response.statusText}`);
    }

    const cooldowns = await response.json();

    // Format cooldown time helper
    const formatTime = (timeLeft) => {
      const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      
      if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
      } else {
        return `${minutes}m`;
      }
    };

    // Build HTML
    let html = '<div class="steal-cooldowns-dashboard">';

    // NPC Cooldowns Section
    html += '<div class="cooldowns-section">';
    html += '<h3><i class="fas fa-robot"></i> NPC Cooldowns</h3>';
    
    if (cooldowns.npcs && cooldowns.npcs.length > 0) {
      html += '<div class="cooldowns-grid">';
      cooldowns.npcs.forEach(npc => {
        html += '<div class="cooldown-card npc-cooldown">';
        html += `<div class="cooldown-card-header"><strong>${npc.name}</strong></div>`;
        html += '<div class="cooldown-card-body">';
        
        if (npc.global) {
          html += `<div class="cooldown-item global"><span class="cooldown-label">🌍 Global:</span> <span class="cooldown-time">${npc.global.formatted}</span></div>`;
        } else {
          html += '<div class="cooldown-item global available"><span class="cooldown-label">🌍 Global:</span> <span class="cooldown-time">✅ Available</span></div>';
        }
        
        if (npc.personal) {
          html += `<div class="cooldown-item personal"><span class="cooldown-label">👤 Personal:</span> <span class="cooldown-time">${npc.personal.formatted}</span></div>`;
        } else {
          html += '<div class="cooldown-item personal available"><span class="cooldown-label">👤 Personal:</span> <span class="cooldown-time">✅ Available</span></div>';
        }
        
        const canSteal = !npc.global && !npc.personal;
        html += `<div class="cooldown-status ${canSteal ? 'available' : 'on-cooldown'}">`;
        html += canSteal ? '✅ Available to steal' : '❌ On cooldown';
        html += '</div>';
        
        html += '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="no-cooldowns">✅ No NPCs on cooldown - All NPCs are available!</div>';
    }
    
    html += '</div>';

    // Player Cooldowns Section
    html += '<div class="cooldowns-section">';
    html += '<h3><i class="fas fa-users"></i> Player Cooldowns</h3>';
    
    if (cooldowns.players && cooldowns.players.length > 0) {
      html += '<div class="cooldowns-grid">';
      cooldowns.players.forEach(player => {
        html += '<div class="cooldown-card player-cooldown">';
        html += `<div class="cooldown-card-header"><strong>${player.name}</strong></div>`;
        html += '<div class="cooldown-card-body">';
        
        if (player.global) {
          html += `<div class="cooldown-item global"><span class="cooldown-label">🌍 Global:</span> <span class="cooldown-time">${player.global.formatted}</span></div>`;
        } else {
          html += '<div class="cooldown-item global available"><span class="cooldown-label">🌍 Global:</span> <span class="cooldown-time">✅ Available</span></div>';
        }
        
        const canSteal = !player.global;
        html += `<div class="cooldown-status ${canSteal ? 'available' : 'on-cooldown'}">`;
        html += canSteal ? '✅ Available to steal' : '❌ On cooldown';
        html += '</div>';
        
        html += '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="no-cooldowns">✅ No players on cooldown - All players are available!</div>';
    }
    
    html += '</div>';

    // Summary
    const totalOnCooldown = (cooldowns.npcs?.length || 0) + (cooldowns.players?.length || 0);
    html += '<div class="cooldowns-summary">';
    html += `<p><strong>Total targets on cooldown:</strong> ${totalOnCooldown}</p>`;
    html += '<p class="summary-note">💡 Use <code>/steal cooldown</code> in Discord to check cooldowns on the go!</p>';
    html += '</div>';

    html += '</div>';

    cooldownsContainer.innerHTML = html;
  } catch (error) {
    console.error('[profile.js]: Error loading steal cooldowns:', error);
    const cooldownsContainer = document.getElementById('steal-cooldowns-content');
    if (cooldownsContainer) {
      cooldownsContainer.innerHTML = `<div class="error-message">Failed to load cooldowns: ${error.message}</div>`;
    }
  }
}

// ------------------- Function: setupVendingTabs -------------------
// Sets up tab switching for vending section
export function setupVendingTabs() {
  const shopsTab = document.getElementById('vending-shops-tab');
  const transactionsTab = document.getElementById('vending-transactions-tab');
  const shopsContent = document.getElementById('vending-shops-tab-content');
  const transactionsContent = document.getElementById('vending-transactions-tab-content');
  
  if (shopsTab && transactionsTab && shopsContent && transactionsContent) {
    shopsTab.addEventListener('click', () => {
      shopsTab.classList.add('active');
      transactionsTab.classList.remove('active');
      shopsContent.classList.add('active');
      shopsContent.style.display = 'block';
      transactionsContent.classList.remove('active');
      transactionsContent.style.display = 'none';
    });
    
    transactionsTab.addEventListener('click', async () => {
      transactionsTab.classList.add('active');
      shopsTab.classList.remove('active');
      transactionsContent.classList.add('active');
      transactionsContent.style.display = 'block';
      shopsContent.classList.remove('active');
      shopsContent.style.display = 'none';
      
      // Load transactions when tab is clicked
      await loadVendingTransactions();
      setupVendingFilters();
    });
  }
}

// ------------------- Function: setupVendingFilters -------------------
// Sets up filter buttons for vending transactions
function setupVendingFilters() {
  const filterButtons = document.querySelectorAll('.vending-transactions-filters .tokens-filter-btn');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      // Remove active class from all buttons
      filterButtons.forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      btn.classList.add('active');
      
      // Determine filter
      let filter = 'all';
      if (btn.id === 'vending-filter-buyer') filter = 'buyer';
      else if (btn.id === 'vending-filter-vendor') filter = 'vendor';
      else if (btn.id === 'vending-filter-pending') filter = 'pending';
      else if (btn.id === 'vending-filter-completed') filter = 'completed';
      
      // Load transactions with filter
      currentVendingPage = 1;
      await loadVendingTransactions(currentVendingPage, filter);
    });
  });
}

// ------------------- Function: loadVendingTransactions -------------------
// Loads vending transactions from the API
export async function loadVendingTransactions(page = 1, filter = 'all') {
  try {
    currentVendingPage = page;
    currentVendingFilter = filter;

    const loadingEl = document.getElementById('vending-transactions-loading');
    const transactionsList = document.getElementById('vending-transactions-list');
    
    if (!transactionsList) {
      console.warn('[profile.js]: Vending transactions list not found');
      return;
    }

    if (loadingEl) {
      loadingEl.style.display = 'flex';
    }

    const skip = (page - 1) * vendingPageSize;
    let url = `/api/vending/transactions?limit=${vendingPageSize}&skip=${skip}`;
    if (filter !== 'all') {
      if (filter === 'buyer' || filter === 'vendor') {
        url += `&role=${filter}`;
      } else {
        url += `&status=${filter}`;
      }
    }

    console.log('[profile.js]: 🔍 Fetching vending transactions from:', url);
    
    const response = await fetch(url, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to load vending transactions: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[profile.js]: ✅ Received vending transactions:', data.transactions?.length || 0);

    if (loadingEl) {
      loadingEl.style.display = 'none';
    }

    if (data.success && data.transactions) {
      renderVendingTransactions(data.transactions, data.total || 0, data.hasMore || false);
    } else {
      transactionsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No transactions found.</p>';
    }
  } catch (error) {
    console.error('[profile.js]: ❌ Error loading vending transactions:', error);
    const loadingEl = document.getElementById('vending-transactions-loading');
    const transactionsList = document.getElementById('vending-transactions-list');
    
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    
    if (transactionsList) {
      transactionsList.innerHTML = `<p style="color: var(--error-color); text-align: center; padding: 2rem;">Error loading transactions: ${error.message || 'Unknown error'}</p>`;
    }
  }
}

// ------------------- Function: loadCharacterTransactions -------------------
// Loads vending transactions for a specific character
async function loadCharacterTransactions(characterId, characterName) {
  try {
    const transactionsContainer = document.getElementById(`vendor-transactions-${characterId}`);
    if (!transactionsContainer) {
      console.warn(`[profile.js]: Transactions container not found for character ${characterId}`);
      return;
    }

    // Show loading state
    transactionsContainer.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
        <i class="fas fa-spinner fa-spin" style="margin-right: 0.5rem;"></i>Loading transactions...
      </div>
    `;

    // Fetch all transactions (we'll filter by character name on client side)
    const response = await fetch(`/api/vending/transactions?limit=100&skip=0`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`Failed to load transactions: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.success && data.transactions) {
      // Filter transactions for this character (as vendor or buyer)
      const characterTransactions = data.transactions.filter(tx => 
        tx.vendorCharacterName === characterName || tx.userCharacterName === characterName
      );

      if (characterTransactions.length === 0) {
        transactionsContainer.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; opacity: 0.5;"></i>
            <div>No transactions found for this character</div>
          </div>
        `;
        return;
      }

      // Render transactions
      const transactionsHtml = characterTransactions.map(tx => {
        const date = new Date(tx.date).toLocaleString('en-US', { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const statusColor = tx.status === 'completed' ? '#10b981' : 
                            tx.status === 'pending' ? '#f59e0b' : 
                            tx.status === 'failed' ? '#ef4444' : 
                            tx.status === 'expired' ? '#6b7280' : '#6366f1';
        
        // Determine transaction type and display text
        const isVendorPurchase = tx.transactionType === 'vendor_purchase';
        const isVendorMove = tx.transactionType === 'vendor_move';
        const isVendorTransaction = isVendorPurchase || isVendorMove;
        
        let roleText = '';
        if (isVendorPurchase) {
          roleText = '📦 Restocked';
        } else if (isVendorMove) {
          roleText = '📤 Moved from inventory';
        } else {
          const isVendor = tx.vendorCharacterName === characterName;
          roleText = isVendor ? 'Selling to' : 'Buying from';
          roleText += ` ${isVendor ? tx.userCharacterName : tx.vendorCharacterName}`;
        }
        
        let paymentInfo = '';
        let paymentMethodDisplay = '';
        if (isVendorPurchase) {
          paymentMethodDisplay = '💎 Vending Points';
          paymentInfo = `${tx.pointsSpent || 0} points`;
        } else if (isVendorMove) {
          paymentMethodDisplay = '📦 Inventory Transfer';
          paymentInfo = 'From personal inventory';
        } else if (tx.paymentMethod === 'tokens') {
          paymentMethodDisplay = '💰 Tokens';
          paymentInfo = '💰 Tokens';
        } else if (tx.paymentMethod === 'art') {
          paymentMethodDisplay = '🎨 Art';
          paymentInfo = '🎨 Art';
        } else if (tx.paymentMethod === 'barter') {
          paymentMethodDisplay = '🔄 Barter';
          const items = tx.offeredItemsWithQty && tx.offeredItemsWithQty.length > 0 
            ? tx.offeredItemsWithQty 
            : (tx.offeredItems || []).map(item => ({ itemName: item, quantity: 1 }));
          paymentInfo = items.map(item => item.itemName + ' x' + item.quantity).join(', ');
        } else {
          paymentMethodDisplay = tx.paymentMethod || 'N/A';
        }
        
        return `
          <div class="vendor-transaction-item" style="background: var(--input-bg); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.75rem;">
              <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap;">
                  <span style="background: ${statusColor}; color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;">
                    ${tx.status}
                  </span>
                  <span style="color: var(--text-secondary); font-size: 0.8rem;">
                    ${roleText}
                  </span>
                </div>
                <h4 style="margin: 0; color: var(--text-color); font-size: 1rem; font-weight: 600;">
                  ${escapeHtmlAttribute(tx.itemName)} × ${tx.quantity}
                </h4>
              </div>
              <span style="color: var(--text-secondary); font-size: 0.75rem; white-space: nowrap; margin-left: 0.5rem;">${date}</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-top: 0.75rem;">
              <div>
                <span style="color: var(--text-secondary); font-size: 0.75rem;">Payment</span>
                <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-weight: 500; font-size: 0.85rem;">
                  ${paymentMethodDisplay}
                </p>
              </div>
              ${paymentInfo ? `
              <div>
                <span style="color: var(--text-secondary); font-size: 0.75rem;">${isVendorPurchase ? 'Points Spent' : isVendorMove ? 'Source' : tx.paymentMethod === 'barter' ? 'Traded Items' : 'Amount'}</span>
                <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-weight: 500; font-size: 0.85rem;">${escapeHtmlAttribute(paymentInfo)}</p>
              </div>
              ` : ''}
            </div>
            
            ${tx.notes ? `
            <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color);">
              <span style="color: var(--text-secondary); font-size: 0.75rem;">Notes</span>
              <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-size: 0.85rem;">${escapeHtmlAttribute(tx.notes)}</p>
            </div>
            ` : ''}
          </div>
        `;
      }).join('');

      transactionsContainer.innerHTML = transactionsHtml;
    } else {
      transactionsContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No transactions found.
        </div>
      `;
    }
  } catch (error) {
    console.error(`[profile.js]: ❌ Error loading transactions for character ${characterId}:`, error);
    const transactionsContainer = document.getElementById(`vendor-transactions-${characterId}`);
    if (transactionsContainer) {
      transactionsContainer.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--error-color);">
          Error loading transactions: ${error.message || 'Unknown error'}
        </div>
      `;
    }
  }
}

// ------------------- Function: renderVendingTransactions -------------------
// Renders the vending transactions list
function renderVendingTransactions(transactions, total, hasMore) {
  const transactionsList = document.getElementById('vending-transactions-list');
  const pagination = document.getElementById('vending-pagination');
  
  if (!transactionsList) return;

  if (transactions.length === 0) {
    transactionsList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 2rem;">No transactions found.</p>';
    if (pagination) pagination.style.display = 'none';
    return;
  }

  const transactionsHtml = transactions.map(tx => {
    const date = new Date(tx.date).toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    const statusColor = tx.status === 'completed' ? '#10b981' : 
                        tx.status === 'pending' ? '#f59e0b' : 
                        tx.status === 'failed' ? '#ef4444' : 
                        tx.status === 'expired' ? '#6b7280' : '#6366f1';
    
    // Determine transaction type and display text
    const isVendorPurchase = tx.transactionType === 'vendor_purchase';
    const isVendorMove = tx.transactionType === 'vendor_move';
    const isVendorTransaction = isVendorPurchase || isVendorMove;
    
    let roleText = '';
    if (isVendorPurchase) {
      roleText = '📦 Restocked';
    } else if (isVendorMove) {
      roleText = '📤 Moved from inventory';
    } else {
      roleText = tx.userRole === 'buyer' ? '👤 Buying from' : '🏪 Selling to';
      roleText += tx.otherParty ? ` ${tx.otherParty}` : '';
    }
    
    let paymentInfo = '';
    let paymentMethodDisplay = '';
    if (isVendorPurchase) {
      paymentMethodDisplay = '💎 Vending Points';
      paymentInfo = `${tx.pointsSpent || 0} points`;
    } else if (isVendorMove) {
      paymentMethodDisplay = '📦 Inventory Transfer';
      paymentInfo = 'From personal inventory';
    } else if (tx.paymentMethod === 'tokens') {
      paymentMethodDisplay = '💰 Tokens';
      paymentInfo = '💰 Tokens';
    } else if (tx.paymentMethod === 'art') {
      paymentMethodDisplay = '🎨 Art';
      paymentInfo = '🎨 Art';
    } else if (tx.paymentMethod === 'barter') {
      paymentMethodDisplay = '🔄 Barter';
      const items = tx.offeredItemsWithQty && tx.offeredItemsWithQty.length > 0 
        ? tx.offeredItemsWithQty 
        : (tx.offeredItems || []).map(item => ({ itemName: item, quantity: 1 }));
      paymentInfo = items.map(item => item.itemName + ' x' + item.quantity).join(', ');
    } else {
      paymentMethodDisplay = tx.paymentMethod || 'N/A';
    }
    
    return `
      <div class="vending-transaction-item" style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 0.5rem; padding: 1.5rem; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
              <span style="background: ${statusColor}; color: white; padding: 0.25rem 0.75rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;">
                ${tx.status}
              </span>
              <span style="color: var(--text-secondary); font-size: 0.875rem;">
                ${roleText}
              </span>
            </div>
            <h4 style="margin: 0; color: var(--text-color); font-size: 1.1rem;">
              ${tx.itemName} × ${tx.quantity}
            </h4>
          </div>
          <span style="color: var(--text-secondary); font-size: 0.875rem;">${date}</span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-top: 1rem;">
          <div>
            <span style="color: var(--text-secondary); font-size: 0.875rem;">Payment Method</span>
            <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-weight: 500;">${paymentMethodDisplay}</p>
          </div>
          ${paymentInfo ? `
          <div>
            <span style="color: var(--text-secondary); font-size: 0.875rem;">${isVendorPurchase ? 'Points Spent' : isVendorMove ? 'Source' : tx.paymentMethod === 'barter' ? 'Traded Items' : 'Amount'}</span>
            <p style="margin: 0.25rem 0 0 0; color: var(--text-color); font-weight: 500;">${paymentInfo}</p>
          </div>
          ` : ''}
          ${tx.notes ? `
          <div style="grid-column: 1 / -1;">
            <span style="color: var(--text-secondary); font-size: 0.875rem;">Notes</span>
            <p style="margin: 0.25rem 0 0 0; color: var(--text-color);">${tx.notes}</p>
          </div>
          ` : ''}
        </div>
        
        ${tx.fulfillmentId ? `
        <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-color);">
          <span style="color: var(--text-secondary); font-size: 0.75rem; font-family: monospace;">ID: ${tx.fulfillmentId}</span>
        </div>
        ` : ''}
      </div>
    `;
  }).join('');

  transactionsList.innerHTML = transactionsHtml;

  // Setup pagination
  if (pagination && (hasMore || currentVendingPage > 1)) {
    pagination.style.display = 'block';
    const totalPages = Math.ceil(total / vendingPageSize);
    
    let paginationHtml = '<div style="display: flex; justify-content: center; gap: 0.5rem; align-items: center;">';
    
    if (currentVendingPage > 1) {
      paginationHtml += `<button class="tokens-filter-btn" onclick="window.profileModule.loadVendingTransactions(${currentVendingPage - 1}, '${currentVendingFilter}')">Previous</button>`;
    }
    
    paginationHtml += `<span style="color: var(--text-secondary); padding: 0 1rem;">Page ${currentVendingPage} of ${totalPages} (${total} total)</span>`;
    
    if (hasMore) {
      paginationHtml += `<button class="tokens-filter-btn" onclick="window.profileModule.loadVendingTransactions(${currentVendingPage + 1}, '${currentVendingFilter}')">Next</button>`;
    }
    
    paginationHtml += '</div>';
    pagination.innerHTML = paginationHtml;
  } else if (pagination) {
    pagination.style.display = 'none';
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