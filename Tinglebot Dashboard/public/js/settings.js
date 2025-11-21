/* ============================================================================ */
/* Settings Management Module */
/* ============================================================================ */

class SettingsManager {
  constructor() {
    this.settings = this.getDefaultSettings();
    this.saveTimeouts = {}; // Track save timeouts to prevent duplicates
    this.init();
  }

  // Default settings configuration
  getDefaultSettings() {
    return {
      // Theme & Appearance
      theme: 'dark',
      fontSize: 'medium',
      highContrast: false,
      
      // Performance & Animation
      imageQuality: 'medium',
      animationSpeed: 'normal',
      
      // Data Display
      dateFormat: 'MM/DD/YYYY',
      timezone: 'auto',
      currencyFormat: 'USD',
      numberFormat: 'comma',
      
      // List Preferences
      itemsPerPage: 24,
      defaultSort: 'date-desc',
      
      // Notifications
      bloodMoonAlerts: false,
      dailyResetReminders: false,
      weatherNotifications: false,
      characterWeekUpdates: false
    };
  }

  // Initialize settings manager
  async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.applySettings();
    
    // Ensure dark mode is applied on first load
    if (!localStorage.getItem('tinglebot-settings')) {
      this.applyTheme('dark');
    }
    
    // Force refresh dropdown styling on page load
    setTimeout(() => {
      this.refreshDropdownStyling();
    }, 500);
  }

  // Load settings from server (or fallback to localStorage)
  async loadSettings() {
    try {
      // Try to load settings from server if user is authenticated
      const loadedFromServer = await this.loadSettingsFromServer();
      
      // If not loaded from server, fall back to localStorage
      if (!loadedFromServer) {
      const savedSettings = localStorage.getItem('tinglebot-settings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings);
        this.settings = { ...this.settings, ...parsedSettings };
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // Load all settings from server
  async loadSettingsFromServer() {
    try {
      const response = await fetch('/api/user/settings', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.settings) {
          // Update all settings with server values
          this.settings = { ...this.settings, ...data.settings };
          
          return true;
        }
      } else if (response.status === 401) {
        // User not authenticated - this is expected, don't log as error
        console.log('[settings.js]: User not authenticated, using local settings');
        return false;
      } else {
        console.warn('[settings.js]: Failed to load settings from server');
        return false;
      }
    } catch (error) {
      // Only log non-401 errors to reduce noise
      if (!error.message.includes('401')) {
        console.error('[settings.js]: Error loading settings from server:', error);
      }
      return false;
    }
  }

  // Save settings to server (and localStorage as backup)
  async saveSettings(isNotificationToggle = false) {
    try {
      // Save all settings to server
      const savedToServer = await this.saveSettingsToServer();
      
      if (savedToServer) {
        if (isNotificationToggle) {
          this.showNotification('Notification settings saved! Check your Discord DMs for confirmation.', 'success');
        } else {
          this.showNotification('Settings saved successfully!', 'success');
        }
      } else {
        // Fallback to localStorage if not authenticated
      localStorage.setItem('tinglebot-settings', JSON.stringify(this.settings));
        if (isNotificationToggle) {
          this.showNotification('Please log in to enable Discord notifications.', 'warning');
        } else {
          this.showNotification('Settings saved locally. Log in to sync across devices.', 'info');
        }
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showNotification('Error saving settings', 'error');
    }
  }

  // Save all settings to server
  async saveSettingsToServer() {
    try {
      const response = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ settings: this.settings })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Also save to localStorage as backup
        localStorage.setItem('tinglebot-settings', JSON.stringify(this.settings));
        return true;
      } else if (response.status === 401) {
        console.warn('[settings.js]: User not authenticated, settings not saved to server');
        return false;
      } else {
        throw new Error('Failed to save settings to server');
      }
    } catch (error) {
      // Only log non-401 errors to reduce noise
      if (!error.message.includes('401')) {
        console.error('[settings.js]: Error saving settings to server:', error);
      }
      return false;
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Save settings button
    const saveBtn = document.getElementById('save-settings');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveSettings());
    }

    // Reset settings button
    const resetBtn = document.getElementById('reset-settings');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetSettings());
    }

    // Settings change listeners
    this.setupSettingsChangeListeners();

    // Theme preview cards
    this.setupThemePreviewCards();
  }

  // Setup settings change listeners
  setupSettingsChangeListeners() {
    const settingsInputs = [
      'theme-select', 'font-size', 'high-contrast',
      'image-quality', 'animation-speed',
      'date-format', 'timezone', 'currency-format', 'number-format',
      'items-per-page', 'default-sort',
      'blood-moon-alerts', 'daily-reset-reminders', 'weather-notifications', 'character-week-updates'
    ];

    settingsInputs.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', (e) => this.handleSettingChange(e));
      }
    });
  }

  // Setup theme preview cards
  setupThemePreviewCards() {
    const previewCards = document.querySelectorAll('.theme-preview-card');
    previewCards.forEach(card => {
      card.addEventListener('click', () => {
        const theme = card.getAttribute('data-theme');
        this.previewTheme(theme);
      });
    });
  }

  // Preview theme (temporary application)
  previewTheme(theme) {
    // Update the theme select dropdown
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.value = theme;
    }

    // Apply the theme temporarily
    this.applyTheme(theme);

    // Update active preview card
    this.updateActivePreviewCard(theme);

    // Show preview notification
    this.showNotification(`Previewing ${theme} theme`, 'info');
  }

  // Update active preview card
  updateActivePreviewCard(activeTheme) {
    const previewCards = document.querySelectorAll('.theme-preview-card');
    previewCards.forEach(card => {
      const cardTheme = card.getAttribute('data-theme');
      if (cardTheme === activeTheme) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  // Handle individual setting changes
  handleSettingChange(event) {
    const { id, type, checked, value } = event.target;
    
    let settingValue = type === 'checkbox' ? checked : value;
    
    // Convert string numbers to actual numbers
    if (['items-per-page'].includes(id)) {
      settingValue = parseInt(settingValue) || settingValue;
    }

    // Update setting
    const settingKey = this.getElementSettingKey(id);
    if (settingKey) {
      this.settings[settingKey] = settingValue;
      this.applySetting(settingKey, settingValue);
      
      // Auto-save notification settings immediately to trigger DM
      const notificationSettings = ['bloodMoonAlerts', 'dailyResetReminders', 'weatherNotifications', 'characterWeekUpdates'];
      if (notificationSettings.includes(settingKey)) {
        // Clear any existing timeout for this setting to prevent duplicates
        if (this.saveTimeouts[settingKey]) {
          clearTimeout(this.saveTimeouts[settingKey]);
        }
        
        // Debounce the save to prevent duplicate API calls
        this.saveTimeouts[settingKey] = setTimeout(() => {
          // Only show DM confirmation message if turning ON
          this.saveSettings(settingValue === true);
          delete this.saveTimeouts[settingKey];
        }, 300); // 300ms debounce
      }
    }
  }

  // Map element IDs to setting keys
  getElementSettingKey(elementId) {
    const mapping = {
      'theme-select': 'theme',
      'font-size': 'fontSize',
      'high-contrast': 'highContrast',
      'image-quality': 'imageQuality',
      'animation-speed': 'animationSpeed',
      'date-format': 'dateFormat',
      'timezone': 'timezone',
      'currency-format': 'currencyFormat',
      'number-format': 'numberFormat',
      'items-per-page': 'itemsPerPage',
      'default-sort': 'defaultSort',
      'blood-moon-alerts': 'bloodMoonAlerts',
      'daily-reset-reminders': 'dailyResetReminders',
      'weather-notifications': 'weatherNotifications',
      'character-week-updates': 'characterWeekUpdates'
    };
    return mapping[elementId];
  }

  // Apply all settings
  applySettings() {
    Object.entries(this.settings).forEach(([key, value]) => {
      this.applySetting(key, value);
    });
    this.updateUI();
  }

  // Apply individual setting
  applySetting(key, value) {
    switch (key) {
      case 'theme':
        this.applyTheme(value);
        break;
      case 'fontSize':
        this.applyFontSize(value);
        break;
      case 'highContrast':
        this.applyHighContrast(value);
        break;
      case 'animationSpeed':
        this.applyAnimationSpeed(value);
        break;
      case 'imageQuality':
        this.applyImageQuality(value);
        break;
      // Add more cases as needed
    }
  }

  // Apply theme setting
  applyTheme(theme) {
    const root = document.documentElement;
    
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
    
    // Force refresh dropdown styling after theme change
    this.refreshDropdownStyling();
  }
  
  // Refresh dropdown styling to ensure proper light/dark mode appearance
  refreshDropdownStyling() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const isLightMode = currentTheme === 'light';
    
    // Force re-render of all select elements
    const selectElements = document.querySelectorAll('select, .setting-input');
    selectElements.forEach(select => {
      // Clear any existing inline styles
      select.style.backgroundColor = '';
      select.style.background = '';
      select.style.color = '';
      select.style.borderColor = '';
      
      // If light mode, force white background
      if (isLightMode) {
        select.style.backgroundColor = '#FFFFFF';
        select.style.background = '#FFFFFF';
        select.style.color = '#1A1A1A';
        select.style.borderColor = '#CBD5E0';
      }
      
      // Force style recalculation for options
      const options = select.querySelectorAll('option');
      options.forEach(option => {
        option.style.backgroundColor = '';
        option.style.background = '';
        option.style.color = '';
        
        // If light mode, force white background for options
        if (isLightMode) {
          option.style.backgroundColor = '#FFFFFF';
          option.style.background = '#FFFFFF';
          option.style.color = '#1A1A1A';
        }
      });
      
      // Trigger a reflow to force style recalculation
      select.style.display = 'none';
      select.offsetHeight; // Trigger reflow
      select.style.display = '';
    });
    
    // Add a small delay and force styling again
    setTimeout(() => {
      selectElements.forEach(select => {
        if (isLightMode) {
          select.style.backgroundColor = '#FFFFFF';
          select.style.background = '#FFFFFF';
          select.style.color = '#1A1A1A';
          select.style.borderColor = '#CBD5E0';
        } else {
          // Clear inline styles for dark mode to let CSS variables work
          select.style.backgroundColor = '';
          select.style.background = '';
          select.style.color = '';
          select.style.borderColor = '';
        }
        
        const options = select.querySelectorAll('option');
        options.forEach(option => {
          if (isLightMode) {
            option.style.backgroundColor = '#FFFFFF';
            option.style.background = '#FFFFFF';
            option.style.color = '#1A1A1A';
          } else {
            option.style.backgroundColor = '';
            option.style.background = '';
            option.style.color = '';
          }
        });
      });
    }, 100);
  }

  // Apply font size setting
  applyFontSize(size) {
    document.documentElement.setAttribute('data-font-size', size);
  }

  // Apply high contrast setting
  applyHighContrast(enabled) {
    document.documentElement.setAttribute('data-contrast', enabled ? 'high' : 'normal');
  }

  // Apply animation speed setting
  applyAnimationSpeed(speed) {
    document.documentElement.setAttribute('data-animation-speed', speed);
  }

  // Apply image quality setting
  applyImageQuality(quality) {
    // This would affect how images are loaded/displayed
    // Implementation depends on your image loading system
  }

  // Update UI with current settings
  updateUI() {
    Object.entries(this.settings).forEach(([key, value]) => {
      const elementId = this.getSettingElementId(key);
      if (elementId) {
        const element = document.getElementById(elementId);
        if (element) {
          if (element.type === 'checkbox') {
            element.checked = value;
          } else {
            element.value = value;
          }
        }
      }
    });

    // Update active preview card
    this.updateActivePreviewCard(this.settings.theme);
  }

  // Map setting keys to element IDs
  getSettingElementId(settingKey) {
    const mapping = {
      'theme': 'theme-select',
      'fontSize': 'font-size',
      'highContrast': 'high-contrast',
      'imageQuality': 'image-quality',
      'animationSpeed': 'animation-speed',
      'dateFormat': 'date-format',
      'timezone': 'timezone',
      'currencyFormat': 'currency-format',
      'numberFormat': 'number-format',
      'itemsPerPage': 'items-per-page',
      'defaultSort': 'default-sort',
      'bloodMoonAlerts': 'blood-moon-alerts',
      'dailyResetReminders': 'daily-reset-reminders',
      'weatherNotifications': 'weather-notifications',
      'characterWeekUpdates': 'character-week-updates'
    };
    return mapping[settingKey];
  }

  // Reset settings to defaults
  resetSettings() {
    if (confirm('Are you sure you want to reset all settings to their default values?')) {
      this.settings = this.getDefaultSettings();
      this.applySettings();
      this.updateUI();
      this.showNotification('Settings reset to defaults', 'success');
    }
  }

  // Set button loading state
  setButtonLoading(buttonId, loading) {
    const button = document.getElementById(buttonId);
    if (button) {
      if (loading) {
        button.classList.add('loading');
        button.disabled = true;
      } else {
        button.classList.remove('loading');
        button.disabled = false;
      }
    }
  }

  // Show notification
  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `settings-notification ${type}`;
    notification.innerHTML = `
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    `;

    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-weight: 600;
      animation: slideIn 0.3s ease;
    `;

    // Add animation keyframes
    if (!document.getElementById('notification-styles')) {
      const style = document.createElement('style');
      style.id = 'notification-styles';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // Remove notification after 3 seconds
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // Get current settings
  getSettings() {
    return { ...this.settings };
  }

  // Update a specific setting
  updateSetting(key, value) {
    this.settings[key] = value;
    this.applySetting(key, value);
  }
}

// Initialize settings manager when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  window.settingsManager = new SettingsManager();
  await window.settingsManager.init();
});

// Export for use in other modules
export default SettingsManager;
