/* ======================================================================
 * File: levels.js
 * Description: Handles the Levels & Progression section of the dashboard
 * ====================================================================== */

// ============================================================================
// ------------------- Section: Levels Module -------------------
// Main module for managing the levels section
// ============================================================================

const levelsModule = {
  currentTab: 'rank',
  leaderboardLimit: 10,
  blupeeLeaderboardLimit: 10,
  userData: null,
  isAuthenticated: false,

  /**
   * ------------------- Function: init -------------------
   * Initialize the levels module
   */
  init() {
    this.setupEventListeners();
    this.checkAuthAndLoad();
  },

  /**
   * ------------------- Function: setupEventListeners -------------------
   * Set up event listeners for tabs and interactions
   */
  setupEventListeners() {
    // Tab switching
    const tabButtons = document.querySelectorAll('.levels-tab');
    tabButtons.forEach(button => {
      button.addEventListener('click', () => {
        const tab = button.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // Close exchange modal when clicking outside
    const exchangeModal = document.getElementById('exchange-modal');
    if (exchangeModal) {
      exchangeModal.addEventListener('click', (e) => {
        if (e.target === exchangeModal) {
          this.closeExchangeModal();
        }
      });
    }

    // Close user details modal when clicking outside
    const userDetailsModal = document.getElementById('user-details-modal');
    if (userDetailsModal) {
      userDetailsModal.addEventListener('click', (e) => {
        if (e.target === userDetailsModal) {
          this.closeUserDetailsModal();
        }
      });
    }
  },

  /**
   * ------------------- Function: checkAuthAndLoad -------------------
   * Check if user is authenticated and load appropriate content
   */
  async checkAuthAndLoad() {
    try {
      const response = await fetch('/api/user');
      const data = await response.json();
      
      this.isAuthenticated = data.isAuthenticated;
      
      if (this.isAuthenticated) {
        document.getElementById('levels-guest-message').style.display = 'none';
        document.getElementById('levels-content').style.display = 'block';
        await this.loadLevelData();
      } else {
        document.getElementById('levels-guest-message').style.display = 'flex';
        document.getElementById('levels-content').style.display = 'none';
      }
    } catch (error) {
      console.error('[levels.js]: Error checking authentication:', error);
      this.showError();
    }
  },

  /**
   * ------------------- Function: loadLevelData -------------------
   * Load level data based on current tab
   */
  async loadLevelData() {
    this.showLoading();
    
    try {
      if (this.currentTab === 'rank') {
        await this.loadRankData();
      } else if (this.currentTab === 'leaderboard') {
        await this.loadLeaderboard();
      } else if (this.currentTab === 'blupee-leaderboard') {
        await this.loadBlupeeLeaderboard();
      } else if (this.currentTab === 'exchange') {
        await this.loadExchangeData();
      }
      
      this.hideLoading();
    } catch (error) {
      console.error('[levels.js]: Error loading level data:', error);
      this.showError();
    }
  },

  /**
   * ------------------- Function: loadRankData -------------------
   * Load user's rank and level information
   */
  async loadRankData() {
    try {
      const response = await fetch('/api/user/levels/rank');
      if (!response.ok) {
        throw new Error('Failed to fetch rank data');
      }
      
      const data = await response.json();
      this.userData = data;
      
      // Update level display
      document.getElementById('user-level').textContent = `Level ${data.level}`;
      document.getElementById('user-rank').textContent = `#${data.rank}`;
      document.getElementById('user-xp').textContent = data.xp.toLocaleString();
      document.getElementById('user-messages').textContent = data.totalMessages.toLocaleString();
      
      // Update progress bar
      const percentage = data.progress.percentage;
      document.getElementById('level-progress-fill').style.width = `${percentage}%`;
      document.getElementById('level-progress-percentage').textContent = `${percentage}%`;
      document.getElementById('level-progress-amount').textContent = 
        `${data.progress.current.toLocaleString()} / ${data.progress.needed.toLocaleString()} XP`;
      document.getElementById('next-level-text').textContent = `Level ${data.level + 1}`;
      
      // Show MEE6 import info if applicable
      if (data.hasImportedFromMee6 && data.importedMee6Level) {
        document.getElementById('level-import-info').style.display = 'flex';
        document.getElementById('imported-level').textContent = data.importedMee6Level;
      } else {
        document.getElementById('level-import-info').style.display = 'none';
      }
      
      // Update exchange preview
      document.getElementById('exchangeable-levels').textContent = data.exchange.exchangeableLevels;
      document.getElementById('potential-tokens').textContent = data.exchange.potentialTokens.toLocaleString();
      
    } catch (error) {
      console.error('[levels.js]: Error loading rank data:', error);
      throw error;
    }
  },

  /**
   * ------------------- Function: loadLeaderboard -------------------
   * Load and display the leaderboard
   */
  async loadLeaderboard() {
    try {
      const response = await fetch(`/api/levels/leaderboard?limit=${this.leaderboardLimit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch leaderboard');
      }
      
      const data = await response.json();
      this.displayLeaderboard(data.leaderboard);
      
    } catch (error) {
      console.error('[levels.js]: Error loading leaderboard:', error);
      throw error;
    }
  },

  /**
   * ------------------- Function: displayLeaderboard -------------------
   * Display leaderboard entries
   */
  displayLeaderboard(leaderboard) {
    const container = document.getElementById('leaderboard-list');
    
    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = `
        <div class="no-data">
          <i class="fas fa-trophy"></i>
          <p>No leaderboard data available yet.</p>
        </div>
      `;
      return;
    }
    
    const medals = ['🥇', '🥈', '🥉'];
    
    container.innerHTML = leaderboard.map((entry, index) => {
      const medal = index < 3 ? medals[index] : '';
      const avatarUrl = entry.avatar 
        ? `https://cdn.discordapp.com/avatars/${entry.discordId}/${entry.avatar}.png`
        : '/images/ankleicon.png';
      
      return `
        <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}" onclick="levelsModule.showUserDetails('${entry.discordId}')">
          <div class="leaderboard-rank">
            ${medal || `<span class="rank-number">#${entry.rank}</span>`}
          </div>
          <div class="leaderboard-avatar">
            <img src="${avatarUrl}" alt="${entry.nickname || entry.username}" onerror="this.src='/images/ankleicon.png'">
          </div>
          <div class="leaderboard-info">
            <div class="leaderboard-username">${entry.nickname || entry.username}</div>
            <div class="leaderboard-stats">
              <span class="level-badge">Level ${entry.level}</span>
              <span class="xp-text">${entry.xp.toLocaleString()} XP</span>
            </div>
          </div>
          <div class="leaderboard-messages">
            <i class="fas fa-comment"></i>
            <span>${entry.totalMessages.toLocaleString()}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * ------------------- Function: loadBlupeeLeaderboard -------------------
   * Load and display the blupee leaderboard
   */
  async loadBlupeeLeaderboard() {
    try {
      const response = await fetch(`/api/levels/blupee-leaderboard?limit=${this.blupeeLeaderboardLimit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch blupee leaderboard');
      }
      
      const data = await response.json();
      this.displayBlupeeLeaderboard(data.leaderboard);
      
    } catch (error) {
      console.error('[levels.js]: Error loading blupee leaderboard:', error);
      throw error;
    }
  },

  /**
   * ------------------- Function: displayBlupeeLeaderboard -------------------
   * Display blupee leaderboard entries
   */
  displayBlupeeLeaderboard(leaderboard) {
    const container = document.getElementById('blupee-leaderboard-list');
    
    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = `
        <div class="no-data">
          <i class="fas fa-rabbit"></i>
          <p>No blupee hunters yet. Start catching blupees to appear on the leaderboard!</p>
        </div>
      `;
      return;
    }
    
    const medals = ['🥇', '🥈', '🥉'];
    
    container.innerHTML = leaderboard.map((entry, index) => {
      const medal = index < 3 ? medals[index] : '';
      const avatarUrl = entry.avatar 
        ? `https://cdn.discordapp.com/avatars/${entry.discordId}/${entry.avatar}.png`
        : '/images/ankleicon.png';
      
      // Calculate time since last claim if available
      let lastClaimedText = 'Never';
      if (entry.lastClaimed) {
        const timeDiff = Date.now() - new Date(entry.lastClaimed).getTime();
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const days = Math.floor(hours / 24);
        
        if (days > 0) {
          lastClaimedText = `${days}d ago`;
        } else if (hours > 0) {
          lastClaimedText = `${hours}h ago`;
        } else {
          lastClaimedText = 'Recently';
        }
      }
      
      return `
        <div class="leaderboard-entry ${index < 3 ? 'top-three' : ''}">
          <div class="leaderboard-rank">
            ${medal || `<span class="rank-number">#${entry.rank}</span>`}
          </div>
          <div class="leaderboard-avatar">
            <img src="${avatarUrl}" alt="${entry.nickname || entry.username}" onerror="this.src='/images/ankleicon.png'">
          </div>
          <div class="leaderboard-info">
            <div class="leaderboard-username">${entry.nickname || entry.username}</div>
            <div class="leaderboard-stats">
              <span class="level-badge">🐰 ${entry.totalBlupeesCaught} Blupees</span>
              <span class="xp-text">Last: ${lastClaimedText}</span>
            </div>
          </div>
          <div class="leaderboard-messages">
            <i class="fas fa-rabbit"></i>
            <span>${entry.totalBlupeesCaught}</span>
          </div>
        </div>
      `;
    }).join('');
  },

  /**
   * ------------------- Function: loadExchangeData -------------------
   * Load exchange status and information
   */
  async loadExchangeData() {
    try {
      const response = await fetch('/api/user/levels/exchange-status');
      if (!response.ok) {
        throw new Error('Failed to fetch exchange data');
      }
      
      const data = await response.json();
      
      // Update exchange info cards
      document.getElementById('exchange-current-level').textContent = `Level ${data.currentLevel}`;
      document.getElementById('exchange-last-level').textContent = `Level ${data.lastExchangedLevel}`;
      document.getElementById('exchange-available-levels').textContent = data.exchangeableLevels;
      document.getElementById('exchange-tokens-receive').textContent = data.potentialTokens.toLocaleString();
      
      // Update exchange history
      document.getElementById('total-levels-exchanged').textContent = data.totalLevelsExchanged;
      document.getElementById('current-token-balance').textContent = data.currentTokenBalance.toLocaleString();
      
      // Enable/disable exchange button
      const exchangeBtn = document.getElementById('exchange-btn');
      const exchangeNote = document.getElementById('exchange-note');
      
      if (data.exchangeableLevels > 0) {
        exchangeBtn.disabled = false;
        exchangeNote.textContent = `You can exchange ${data.exchangeableLevels} level(s) for ${data.potentialTokens.toLocaleString()} tokens!`;
        exchangeNote.style.color = 'var(--success-color, #4caf50)';
      } else {
        exchangeBtn.disabled = true;
        exchangeNote.textContent = 'Level up more to exchange levels for tokens!';
        exchangeNote.style.color = 'var(--text-secondary)';
      }
      
    } catch (error) {
      console.error('[levels.js]: Error loading exchange data:', error);
      throw error;
    }
  },

  /**
   * ------------------- Function: performExchange -------------------
   * Show exchange confirmation modal
   */
  async performExchange() {
    // Get exchange data
    try {
      const response = await fetch('/api/user/levels/exchange-status');
      if (!response.ok) {
        throw new Error('Failed to fetch exchange data');
      }
      
      const data = await response.json();
      
      // Update modal with exchange details
      document.getElementById('modal-levels-to-exchange').textContent = data.exchangeableLevels;
      document.getElementById('modal-tokens-to-receive').textContent = data.potentialTokens.toLocaleString();
      
      // Show modal
      document.getElementById('exchange-modal').classList.add('active');
      
    } catch (error) {
      console.error('[levels.js]: Error loading exchange details:', error);
      alert('Failed to load exchange details. Please try again.');
    }
  },

  /**
   * ------------------- Function: closeExchangeModal -------------------
   * Close the exchange confirmation modal
   */
  closeExchangeModal() {
    document.getElementById('exchange-modal').classList.remove('active');
  },

  /**
   * ------------------- Function: confirmExchange -------------------
   * Confirm and execute the level exchange
   */
  async confirmExchange() {
    const exchangeBtn = document.getElementById('exchange-btn');
    const confirmBtn = document.querySelector('.exchange-modal-btn-confirm');
    
    // Close modal
    this.closeExchangeModal();
    
    // Disable button and show loading
    exchangeBtn.disabled = true;
    exchangeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>Exchanging...</span>';
    
    try {
      const response = await fetch('/api/user/levels/exchange', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to perform exchange');
      }
      
      const data = await response.json();
      
      if (data.success) {
        // Show success message
        alert(`Successfully exchanged ${data.levelsExchanged} levels for ${data.tokensReceived.toLocaleString()} tokens!\nNew balance: ${data.newTokenBalance.toLocaleString()} tokens`);
        
        // Reload exchange data
        await this.loadExchangeData();
        
        // Also reload rank data if on rank tab
        if (this.currentTab === 'rank') {
          await this.loadRankData();
        }
      } else {
        alert(data.message || 'Failed to exchange levels. Please try again.');
      }
      
    } catch (error) {
      console.error('[levels.js]: Error performing exchange:', error);
      alert('An error occurred while exchanging levels. Please try again later.');
    } finally {
      // Re-enable button
      exchangeBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> <span>Exchange Levels</span>';
    }
  },

  /**
   * ------------------- Function: showUserDetails -------------------
   * Show detailed user rank information
   */
  async showUserDetails(discordId) {
    try {
      const response = await fetch(`/api/levels/user/${discordId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }
      
      const data = await response.json();
      
      // Update modal header
      const avatarUrl = data.avatar 
        ? `https://cdn.discordapp.com/avatars/${data.discordId}/${data.avatar}.png`
        : '/images/ankleicon.png';
      
      document.getElementById('user-details-avatar').src = avatarUrl;
      document.getElementById('user-details-username').textContent = data.nickname || data.username;
      document.getElementById('user-details-level-header').textContent = `Level ${data.level}`;
      
      // Update rank badge
      document.getElementById('user-details-rank-text').textContent = `Rank #${data.rank}`;
      
      // Update statistics
      document.getElementById('user-details-level').textContent = data.level;
      document.getElementById('user-details-xp').textContent = data.xp.toLocaleString();
      document.getElementById('user-details-messages').textContent = data.totalMessages.toLocaleString();
      document.getElementById('user-details-rank').textContent = `#${data.rank}`;
      
      // Update progress bar
      const percentage = data.progress.percentage;
      document.getElementById('user-details-progress-fill').style.width = `${percentage}%`;
      document.getElementById('user-details-progress-percentage').textContent = `${percentage}%`;
      document.getElementById('user-details-progress-amount').textContent = 
        `${data.progress.current.toLocaleString()} / ${data.progress.needed.toLocaleString()} XP`;
      document.getElementById('user-details-next-level').textContent = `Level ${data.level + 1}`;
      
      // Show modal
      document.getElementById('user-details-modal').classList.add('active');
      
    } catch (error) {
      console.error('[levels.js]: Error loading user details:', error);
      alert('Failed to load user details. Please try again.');
    }
  },

  /**
   * ------------------- Function: closeUserDetailsModal -------------------
   * Close the user details modal
   */
  closeUserDetailsModal() {
    document.getElementById('user-details-modal').classList.remove('active');
  },

  /**
   * ------------------- Function: switchTab -------------------
   * Switch between tabs
   */
  switchTab(tab) {
    this.currentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.levels-tab').forEach(button => {
      if (button.getAttribute('data-tab') === tab) {
        button.classList.add('active');
      } else {
        button.classList.remove('active');
      }
    });
    
    // Update tab content
    document.querySelectorAll('.levels-tab-content').forEach(content => {
      content.classList.remove('active');
    });
    document.getElementById(`${tab}-tab`).classList.add('active');
    
    // Load data for the new tab
    this.loadLevelData();
  },

  /**
   * ------------------- Function: changeLeaderboardLimit -------------------
   * Change leaderboard display limit
   */
  changeLeaderboardLimit(limit) {
    this.leaderboardLimit = parseInt(limit);
    this.loadLeaderboard();
  },

  /**
   * ------------------- Function: changeBlupeeLeaderboardLimit -------------------
   * Change blupee leaderboard display limit
   */
  changeBlupeeLeaderboardLimit(limit) {
    this.blupeeLeaderboardLimit = parseInt(limit);
    this.loadBlupeeLeaderboard();
  },

  /**
   * ------------------- Function: showLoading -------------------
   * Show loading state
   */
  showLoading() {
    document.getElementById('levels-loading').style.display = 'flex';
    document.getElementById('levels-content').style.display = 'none';
    document.getElementById('levels-error').style.display = 'none';
  },

  /**
   * ------------------- Function: hideLoading -------------------
   * Hide loading state
   */
  hideLoading() {
    document.getElementById('levels-loading').style.display = 'none';
    document.getElementById('levels-content').style.display = 'block';
    document.getElementById('levels-error').style.display = 'none';
  },

  /**
   * ------------------- Function: showError -------------------
   * Show error state
   */
  showError() {
    document.getElementById('levels-loading').style.display = 'none';
    document.getElementById('levels-content').style.display = 'none';
    document.getElementById('levels-error').style.display = 'flex';
  }
};

// ============================================================================
// ------------------- Section: Initialization -------------------
// Initialize the module when DOM is ready
// ============================================================================

// Check if we're on the levels section and initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize when navigating to levels section
  const levelsLink = document.querySelector('a[href="#levels"]');
  if (levelsLink) {
    levelsLink.addEventListener('click', () => {
      setTimeout(() => {
        levelsModule.init();
      }, 100);
    });
  }
  
  // Also check if we're already on the levels section
  const hash = window.location.hash;
  if (hash === '#levels' || hash === '#levels-section') {
    setTimeout(() => {
      levelsModule.init();
    }, 100);
  }
  
  // Listen for hash changes
  window.addEventListener('hashchange', () => {
    const newHash = window.location.hash;
    if (newHash === '#levels' || newHash === '#levels-section') {
      levelsModule.init();
    }
  });
});

// Export module for global access
window.levelsModule = levelsModule;

// Export for module usage
export default levelsModule;

