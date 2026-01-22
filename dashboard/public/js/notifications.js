// ============================================================================
// ------------------- Shared Notification System -------------------
// Can be included on any page to show the notification bell
// ============================================================================

let notifications = [];
let notificationBadge = null;
let notificationDropdown = null;

/**
 * Initialize the notification system UI
 */
function initializeNotificationSystem() {
  const container = document.getElementById('notification-container');
  if (!container) return;

  // Create notification badge
  notificationBadge = document.createElement('div');
  notificationBadge.className = 'notification-badge';
  notificationBadge.innerHTML = `
    <i class="fas fa-bell notification-icon"></i>
    <span class="notification-count" style="display: none;">0</span>
  `;
  notificationBadge.addEventListener('click', toggleNotificationDropdown);

  // Create dropdown
  notificationDropdown = document.createElement('div');
  notificationDropdown.className = 'notification-dropdown';
  notificationDropdown.innerHTML = `
    <div class="notification-header">
      <h3>Notifications</h3>
      <div>
        <a href="/notifications.html" class="notification-view-all" style="margin-right: 0.5rem; color: var(--text-secondary); text-decoration: none; font-size: 0.85rem;" onclick="event.stopPropagation();">View All</a>
        <button class="notification-clear" onclick="clearAllNotifications()">Clear All</button>
      </div>
    </div>
    <div class="notification-list"></div>
  `;

  container.appendChild(notificationBadge);
  container.appendChild(notificationDropdown);

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (notificationDropdown && !container.contains(e.target)) {
      notificationDropdown.classList.remove('show');
    }
  });

  // Load notifications from API
  loadNotifications();
  
  // Poll for new notifications every 30 seconds
  setInterval(loadNotifications, 30000);
}

/**
 * Load notifications from the API
 */
async function loadNotifications() {
  try {
    const response = await fetch('/api/notifications', {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        // User not authenticated, hide notifications
        return;
      }
      throw new Error('Failed to load notifications');
    }

    const data = await response.json();
    notifications = (data.notifications || []).filter(n => !n.read).map(n => ({
      id: n._id || n.id,
      type: n.type || 'system',
      title: n.title || 'Notification',
      message: n.message || '',
      timestamp: n.createdAt ? new Date(n.createdAt) : new Date(),
      characterId: n.characterId,
      characterName: n.characterName,
      links: n.links || []
    }));

    updateNotificationBadge();
    renderNotifications();
  } catch (error) {
    console.error('[notifications.js]: Error loading notifications:', error);
  }
}

/**
 * Add a notification (for programmatic use)
 */
function addNotification(type, title, message, data = {}) {
  const notification = {
    type,
    title,
    message,
    timestamp: new Date(),
    id: `notification-${Date.now()}-${Math.random()}`,
    ...data
  };

  notifications.unshift(notification);
  updateNotificationBadge();
  renderNotifications();
}

/**
 * Update the notification badge display
 */
function updateNotificationBadge() {
  if (!notificationBadge) return;

  const count = notifications.length;
  const countElement = notificationBadge.querySelector('.notification-count');
  const badge = notificationBadge;

  if (count > 0) {
    countElement.textContent = count > 99 ? '99+' : count;
    countElement.style.display = 'flex';
    badge.classList.add('has-notifications');
  } else {
    countElement.style.display = 'none';
    badge.classList.remove('has-notifications');
  }
}

/**
 * Render notifications in the dropdown
 */
function renderNotifications() {
  if (!notificationDropdown) return;

  const list = notificationDropdown.querySelector('.notification-list');
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">No new notifications</div>';
    return;
  }

  list.innerHTML = notifications.slice(0, 10).map(notification => {
    const timeAgo = getTimeAgo(notification.timestamp);
    const icon = getNotificationIcon(notification.type);
    const link = notification.links && notification.links.length > 0 
      ? notification.links[0].url 
      : (notification.characterId 
        ? `/ocs/${encodeURIComponent(notification.characterName || '')}`
        : null);

    return `
      <div class="notification-item ${notification.type}" onclick="handleNotificationClick('${notification.id}', ${link ? `'${link}'` : 'null'})">
        <div class="notification-item-title">
          <i class="fas ${icon}"></i>
          <span>${escapeHtml(notification.title || 'Notification')}</span>
        </div>
        <div class="notification-item-message">${escapeHtml(notification.message)}</div>
        <div class="notification-item-time">
          ${link ? `<a href="${link}" style="color: var(--primary-color);" onclick="event.stopPropagation();">View</a> • ` : ''}${timeAgo}
        </div>
      </div>
    `;
  }).join('');

  if (notifications.length > 10) {
    const viewAll = document.createElement('div');
    viewAll.className = 'notification-view-all-link';
    viewAll.style.cssText = 'padding: 0.5rem; text-align: center; border-top: 1px solid rgba(255,255,255,0.1);';
    viewAll.innerHTML = `<a href="/notifications.html" style="color: var(--primary-color); text-decoration: none;">View all ${notifications.length} notifications</a>`;
    list.appendChild(viewAll);
  }
}

/**
 * Get icon for notification type
 */
function getNotificationIcon(type) {
  const iconMap = {
    'oc_approved': 'fa-check-circle',
    'oc_needs_changes': 'fa-exclamation-triangle',
    'oc_resubmitted': 'fa-redo',
    'character_denied': 'fa-times-circle',
    'character_accepted': 'fa-check-circle',
    'system': 'fa-info-circle'
  };
  return iconMap[type] || 'fa-info-circle';
}

/**
 * Toggle notification dropdown
 */
function toggleNotificationDropdown() {
  if (!notificationDropdown) return;
  notificationDropdown.classList.toggle('show');
}

/**
 * Handle notification click
 */
async function handleNotificationClick(notificationId, link) {
  // Mark as read
  try {
    await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.error('[notifications.js]: Error marking notification as read:', error);
  }

  // Navigate if link provided
  if (link) {
    window.location.href = link;
  } else {
    // Remove from local list
    removeNotification(notificationId);
  }
}

/**
 * Remove a notification
 */
function removeNotification(notificationId) {
  notifications = notifications.filter(n => n.id !== notificationId);
  updateNotificationBadge();
  renderNotifications();
}

/**
 * Clear all notifications (mark all as read)
 */
window.clearAllNotifications = async function() {
  try {
    await fetch('/api/notifications/read-all', {
      method: 'POST',
      credentials: 'include'
    });
    notifications = [];
    updateNotificationBadge();
    renderNotifications();
  } catch (error) {
    console.error('[notifications.js]: Error clearing notifications:', error);
  }
};

/**
 * Get time ago string
 */
function getTimeAgo(date) {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return `${Math.floor(seconds / 604800)}w ago`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Make functions available globally
window.addNotification = addNotification;
window.handleNotificationClick = handleNotificationClick;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeNotificationSystem);
} else {
  initializeNotificationSystem();
}
