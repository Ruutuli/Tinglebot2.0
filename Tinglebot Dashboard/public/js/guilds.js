// ============================================================================
// Guilds Module - Handles guild information and actions
// ============================================================================

// Global variables
let guildData = null;
let announcementsData = [];

// ============================================================================
// ------------------- Section: Discord Markdown Parser -------------------
// ============================================================================

function parseDiscordMarkdown(text) {
  if (!text) return '';
  
  let html = text;
  
  // Escape HTML first
  html = escapeHtml(html);
  
  // Bold text: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic text: *text* or _text_
  html = html.replace(/(?<!\*)\*(?!\*)([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  html = html.replace(/(?<!_)_(?!_)([^_]+?)_(?!_)/g, '<em>$1</em>');
  
  // Strikethrough: ~~text~~
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
  
  // Underline: __text__ (only if not already bold)
  html = html.replace(/(?<!__)__(?!_)([^_]+?)__(?!_)/g, '<u>$1</u>');
  
  // Code blocks: ```code```
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Inline code: `code`
  html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
  
  // Spoiler: ||text||
  html = html.replace(/\|\|(.*?)\|\|/g, '<span class="spoiler" onclick="this.classList.toggle(\'revealed\')">$1</span>');
  
  // Headers: # Header, ## Header, ### Header
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
  
  // Blockquotes: > text
  html = html.replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>');
  
  // Lists: - item or * item
  html = html.replace(/^[\s]*[-*] (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Numbered lists: 1. item
  html = html.replace(/^[\s]*\d+\. (.*$)/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ol>$1</ol>');
  
  // URLs: [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Plain URLs: http://example.com
  html = html.replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Line breaks
  html = html.replace(/\n/g, '<br>');
  
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function addSpoilerStyles() {
  if (document.getElementById('discord-markdown-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'discord-markdown-styles';
  style.textContent = `
    .spoiler {
      background-color: #4f545c;
      color: #4f545c;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.1s ease;
      user-select: none;
      padding: 2px 4px;
    }
    
    .spoiler:hover {
      background-color: #5f646c;
    }
    
    .spoiler.revealed {
      background-color: transparent;
      color: inherit;
      cursor: default;
    }
    
    /* Discord-style code blocks */
    pre {
      background-color: #2f3136;
      border-radius: 4px;
      padding: 12px;
      margin: 8px 0;
      overflow-x: auto;
      border: 1px solid #40444b;
    }
    
    code {
      background-color: #2f3136;
      border-radius: 3px;
      padding: 2px 4px;
      font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      border: 1px solid #40444b;
    }
    
    /* Blockquotes */
    blockquote {
      border-left: 4px solid #4f545c;
      margin: 8px 0;
      padding-left: 12px;
      color: #dcddde;
      background: rgba(79, 84, 92, 0.1);
      border-radius: 0 4px 4px 0;
    }
    
    /* Lists */
    ul, ol {
      margin: 8px 0;
      padding-left: 20px;
    }
    
    li {
      margin: 4px 0;
    }
    
    /* Headers */
    h1, h2, h3 {
      margin: 16px 0 8px 0;
      color: #ffffff;
      font-weight: 700;
    }
    
    h1 { font-size: 1.5em; }
    h2 { font-size: 1.3em; }
    h3 { font-size: 1.1em; }
    
    /* Links */
    a {
      color: #00b0f4;
      text-decoration: none;
    }
    
    a:hover {
      text-decoration: underline;
    }
    
    /* Strikethrough */
    del {
      opacity: 0.7;
    }
    
    /* Underline */
    u {
      text-decoration: underline;
    }
  `;
  
  document.head.appendChild(style);
}

// ============================================================================
// ------------------- Section: Guild Data Loading -------------------
// Loads guild information from the server
// ============================================================================

// ------------------- Function: loadGuildData -------------------
// Fetches guild data from the server
async function loadGuildData() {
  try {
    
    const response = await fetch('/api/guild/info', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    guildData = await response.json();    
    
    // Update the UI with guild data
    updateGuildUI(guildData);
    
  } catch (error) {
    console.error('[guilds.js]: ❌ Error loading guild data:', error);
    showGuildError('Failed to load guild information');
  }
}

// ------------------- Function: updateGuildUI -------------------
// Updates the guild UI with fetched data
function updateGuildUI(data) {
  
  // Update guild basic info
  const guildName = document.getElementById('guild-name');
  const guildDescription = document.getElementById('guild-description');
  const guildIcon = document.getElementById('guild-icon');
  const guildMembers = document.getElementById('guild-members');
  const guildInactive = document.getElementById('guild-inactive');
  
  if (guildName) {
    guildName.textContent = data.name || 'Tinglebot Guild';
  }
  
  if (guildDescription) {
    guildDescription.textContent = data.description || 'A community server for Tinglebot users to play together, share experiences, and enjoy the RPG system.';
  }
  
  if (guildIcon && data.icon) {
    guildIcon.src = data.icon;
  }
  
  if (guildMembers) {
    guildMembers.textContent = data.memberCount !== undefined ? data.memberCount : 'Loading...';
  }
  
  if (guildInactive) {
    guildInactive.textContent = data.inactiveCount !== undefined ? data.inactiveCount : 'Loading...';
  }
  
}

// ------------------- Function: showGuildError -------------------
// Shows error state for guild loading
function showGuildError(message) {
  console.error('[guilds.js]: ❌ Guild error:', message);
  
  const guildName = document.getElementById('guild-name');
  const guildDescription = document.getElementById('guild-description');
  
  if (guildName) {
    guildName.textContent = 'Error Loading Guild';
  }
  
  if (guildDescription) {
    guildDescription.textContent = message || 'Unable to load guild information. Please try again later.';
  }
}

// ============================================================================
// ------------------- Section: Guild Actions -------------------
// Handles guild action buttons
// ============================================================================

// ------------------- Function: setupGuildActions -------------------
// Sets up event listeners for guild action buttons
function setupGuildActions() {
  
  const joinGuildBtn = document.getElementById('join-guild-btn');
  const viewGuildBtn = document.getElementById('view-guild-btn');
  
  if (joinGuildBtn) {
    joinGuildBtn.addEventListener('click', handleJoinGuild);
  }
  
  if (viewGuildBtn) {
    viewGuildBtn.addEventListener('click', handleViewGuild);
  }
  
}

// ------------------- Function: handleJoinGuild -------------------
// Handles join guild button click
async function handleJoinGuild(event) {
  event.preventDefault();
  
  try {
    // Get guild ID from environment (this would be passed from server)
    const response = await fetch('/api/guild/join', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        // Open Discord invite link
        window.open(result.inviteUrl, '_blank');
      } else {
        console.error('[guilds.js]: ❌ Failed to get invite URL');
        alert('Unable to generate invite link. Please contact an administrator.');
      }
    } else {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
  } catch (error) {
    console.error('[guilds.js]: ❌ Error joining guild:', error);
    alert('Failed to join guild. Please try again later.');
  }
}

// ------------------- Function: handleViewGuild -------------------
// Handles view guild button click
function handleViewGuild(event) {
  event.preventDefault();
  
  // Open Discord guild in new tab
  // Use the guild ID from the loaded guild data
  if (guildData && guildData.id) {
    const guildUrl = `https://discord.com/channels/${guildData.id}`;
    window.open(guildUrl, '_blank');
  } else {
    console.error('[guilds.js]: ❌ Guild ID not available');
    alert('Guild information not loaded. Please refresh the page and try again.');
  }
}

// ============================================================================
// ------------------- Section: Guild Section Management -------------------
// Handles guild section display and initialization
// ============================================================================

// ------------------- Function: showGuildSection -------------------
// Shows the guild section and initializes it
function showGuildSection() {
  
  // Hide all main content sections
  const mainContent = document.querySelector('.main-content');
  const sections = mainContent.querySelectorAll('section, #model-details-page');
  
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show the guild section
  const guildSection = document.getElementById('guilds-section');
  if (guildSection) {
    guildSection.style.display = 'block';
    
    // Initialize guild page
    initGuildPage();
  } else {
    console.error('[guilds.js]: ❌ Guild section not found');
  }
  
  // Update active state in sidebar
  const sidebarLinks = document.querySelectorAll('.sidebar-nav a');
  sidebarLinks.forEach(link => {
    const linkSection = link.getAttribute('data-section');
    const listItem = link.closest('li');
    if (listItem) {
      if (linkSection === 'guilds-section') {
        listItem.classList.add('active');
      } else {
        listItem.classList.remove('active');
      }
    }
  });
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Guilds';
  }
}

// ------------------- Function: initGuildPage -------------------
// Initializes the guild page
async function initGuildPage() {
  
  try {
    // Load guild data
    await loadGuildData();
    
    // Setup guild actions
    setupGuildActions();
    
    // Load all new sections
    await Promise.all([
      loadServerActivity(),
      loadServerStats(),
      loadRoleDistribution(),
      loadAnnouncements()
    ]);
    
  } catch (error) {
    console.error('[guilds.js]: ❌ Error initializing guild page:', error);
    showGuildError('Failed to initialize guild page');
  }
}

// ============================================================================
// ------------------- Section: Server Activity -------------------
// Loads and displays server activity statistics
// ============================================================================

async function loadServerActivity() {
  try {
    const response = await fetch('/api/guild/activity', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    updateServerActivity(data);
  } catch (error) {
    console.error('[guilds.js]: ❌ Error loading server activity:', error);
    showActivityError();
  }
}

function updateServerActivity(data) {
  document.getElementById('online-count').textContent = data.onlineCount || '0';
  document.getElementById('voice-count').textContent = data.voiceCount || '0';
  document.getElementById('messages-today').textContent = data.messagesToday || '0';
  document.getElementById('boost-count').textContent = data.boostCount || '0';
}

function showActivityError() {
  document.getElementById('online-count').textContent = 'N/A';
  document.getElementById('voice-count').textContent = 'N/A';
  document.getElementById('messages-today').textContent = 'N/A';
  document.getElementById('boost-count').textContent = 'N/A';
}

// ============================================================================
// ------------------- Section: Server Stats -------------------
// Loads and displays server statistics
// ============================================================================

async function loadServerStats() {
  try {
    const response = await fetch('/api/guild/stats', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    updateServerStats(data);
  } catch (error) {
    console.error('[guilds.js]: ❌ Error loading server stats:', error);
    showServerStatsError();
  }
}

function updateServerStats(data) {
  document.getElementById('text-channels-count').textContent = data.textChannels || '0';
  document.getElementById('voice-channels-count').textContent = data.voiceChannels || '0';
  document.getElementById('roles-count').textContent = data.rolesCount || '0';
  document.getElementById('server-age').textContent = data.serverAge || 'N/A';
  document.getElementById('latest-member').textContent = data.latestMember || 'N/A';
  document.getElementById('server-owner').textContent = data.serverOwner || 'N/A';
}

function showServerStatsError() {
  ['text-channels-count', 'voice-channels-count', 'roles-count', 'server-age', 'latest-member', 'server-owner'].forEach(id => {
    document.getElementById(id).textContent = 'N/A';
  });
}

// ============================================================================
// ------------------- Section: Role Distribution -------------------
// Loads and displays role distribution
// ============================================================================

async function loadRoleDistribution() {
  try {
    const response = await fetch('/api/guild/roles', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    displayRoleDistribution(data.roles || []);
  } catch (error) {
    console.error('[guilds.js]: ❌ Error loading role distribution:', error);
    showRolesError();
  }
}

function displayRoleDistribution(roles) {
  const legendContainer = document.getElementById('roles-list');
  const canvas = document.getElementById('roles-chart');
  
  if (roles.length === 0) {
    legendContainer.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-shield-alt"></i>
        <p>No roles to display</p>
      </div>
    `;
    return;
  }
  
  // Sort by member count descending and take top 10
  roles.sort((a, b) => b.memberCount - a.memberCount);
  const topRoles = roles.slice(0, 10);
  
  // Draw chart
  drawRoleChart(canvas, topRoles);
  
  // Display legend with improved layout
  // Note: We don't calculate total from role counts since members can have multiple roles
  // Instead, we'll show the total role assignments and get actual member count from guild data
  const totalRoleAssignments = topRoles.reduce((sum, role) => sum + role.memberCount, 0);
  const actualMemberCount = guildData ? guildData.memberCount : 'N/A';
  
  legendContainer.innerHTML = `
    <div class="roles-legend-header">
      <h4><i class="fas fa-info-circle"></i> Role Details</h4>
      <span class="legend-total">${actualMemberCount} members • ${totalRoleAssignments} role assignments</span>
    </div>
    <div class="roles-legend-grid">
      ${topRoles.map((role, index) => {
        // Calculate percentage based on actual member count, not role assignments
        const percentage = guildData && guildData.memberCount > 0 
          ? (role.memberCount / guildData.memberCount * 100).toFixed(1)
          : '0.0';
        return `
          <div class="role-legend-item" data-rank="${index + 1}">
            <div class="role-rank">#${index + 1}</div>
            <div class="role-color-dot" style="background-color: ${role.color || '#99aab5'};"></div>
            <div class="role-legend-info">
              <div class="role-name">${role.name}</div>
              <div class="role-count">${role.memberCount} member${role.memberCount !== 1 ? 's' : ''}</div>
            </div>
            <div class="role-percentage">${percentage}%</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function drawRoleChart(canvas, roles) {
  const ctx = canvas.getContext('2d');
  
  // Set canvas size for high DPI displays
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  
  // Use full container width, minimum 800px
  const canvasWidth = Math.max(rect.width, 800);
  const canvasHeight = 600;
  
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
  canvas.style.width = canvasWidth + 'px';
  canvas.style.height = canvasHeight + 'px';
  ctx.scale(dpr, dpr);
  
  const width = canvasWidth;
  const height = canvasHeight;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  if (roles.length === 0) return;
  
  // Get actual member count from guild data (not sum of role assignments)
  const actualMemberCount = guildData ? guildData.memberCount : roles.reduce((sum, role) => sum + role.memberCount, 0);
  
  // Chart dimensions with more space for labels
  const padding = { top: 80, right: 40, bottom: 80, left: 60 }; // Reduced bottom padding since we removed labels
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Find max value for scaling
  const maxValue = Math.max(...roles.map(r => r.memberCount));
  
  // Bar dimensions - wider bars for better visibility
  const barWidth = Math.min(chartWidth / roles.length * 0.6, 50);
  const barSpacing = chartWidth / roles.length;
  
  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartHeight / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    
    // Draw y-axis labels
    const value = Math.round(maxValue * (1 - i / gridLines));
    ctx.fillStyle = '#a0aec0';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(value, padding.left - 10, y + 4);
  }
  
  // Draw bars with improved spacing
  roles.forEach((role, index) => {
    const percentage = (role.memberCount / actualMemberCount * 100).toFixed(1);
    const barHeight = (role.memberCount / maxValue) * chartHeight;
    const x = padding.left + index * barSpacing + (barSpacing - barWidth) / 2;
    const y = padding.top + chartHeight - barHeight;
    
    // Draw shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    
    // Draw bar with enhanced gradient
    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartHeight);
    const baseColor = role.color || '#99aab5';
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.5, adjustColorBrightness(baseColor, -15));
    gradient.addColorStop(1, adjustColorBrightness(baseColor, -40));
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);
    
    // Reset shadow for text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw highlight on top of bar
    const highlightGradient = ctx.createLinearGradient(x, y, x, y + 30);
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = highlightGradient;
    ctx.fillRect(x, y, barWidth, Math.min(30, barHeight));
    
    // Draw value badge on top of bar (always show for better UX)
    const badgeY = Math.max(y - 30, padding.top - 10);
    const badgeWidth = Math.max(45, role.memberCount.toString().length * 8 + 20);
    const badgeHeight = 24;
    const badgeX = x + barWidth / 2 - badgeWidth / 2;
    
    // Badge background with shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = 'rgba(73, 213, 156, 0.95)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 6);
    ctx.fill();
    
    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Badge value
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(role.memberCount.toString(), x + barWidth / 2, badgeY + 16);
    
    // Draw percentage below badge
    ctx.fillStyle = '#49d59c';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${percentage}%`, x + barWidth / 2, badgeY - 5);
  });
  
  // Draw axes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(width - padding.right, padding.top + chartHeight);
  ctx.moveTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left, padding.top);
  ctx.stroke();
  
  // Draw title with glow effect
  ctx.shadowColor = 'rgba(73, 213, 156, 0.5)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Top 10 Roles by Member Count', width / 2, 35);
  
  // Draw subtitle
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#a0aec0';
  ctx.font = '13px sans-serif';
  ctx.fillText(`Total: ${actualMemberCount} members across ${roles.length} roles`, width / 2, 55);
  
  // Add y-axis label
  ctx.save();
  ctx.translate(20, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#a0aec0';
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Member Count', 0, 0);
  ctx.restore();
}

function adjustColorBrightness(color, amount) {
  // Convert hex to RGB
  const hex = color.replace('#', '');
  const r = Math.max(0, Math.min(255, parseInt(hex.substring(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(hex.substring(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(hex.substring(4, 6), 16) + amount));
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function showRolesError() {
  const container = document.getElementById('roles-list');
  container.innerHTML = `
    <div class="loading-state">
      <i class="fas fa-exclamation-triangle"></i>
      <p>Failed to load role distribution</p>
    </div>
  `;
}

// ============================================================================
// ------------------- Section: Announcements -------------------
// Loads and displays recent announcements
// ============================================================================

async function loadAnnouncements() {
  try {
    const response = await fetch('/api/guild/announcements', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    displayAnnouncements(data.announcements || []);
  } catch (error) {
    console.error('[guilds.js]: ❌ Error loading announcements:', error);
    showAnnouncementsError();
  }
}

function displayAnnouncements(announcements) {
  const container = document.getElementById('announcements-list');
  announcementsData = announcements;
  
  if (announcements.length === 0) {
    container.innerHTML = `
      <div class="loading-state">
        <i class="fas fa-bullhorn"></i>
        <p>No recent announcements</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = announcements.map((announcement, index) => {
    const previewContent = announcement.contentPreview || announcement.content;
    const parsedPreview = parseDiscordMarkdown(previewContent);
    
    return `
      <div class="announcement-card ${announcement.isTruncated ? 'clickable' : ''}" data-announcement-index="${index}">
        <div class="announcement-header">
          <div class="announcement-author">
            <img 
              src="${announcement.authorAvatar || '/images/tingleicon.png'}" 
              alt="${announcement.authorName}" 
              class="announcement-avatar"
              onerror="this.src='/images/tingleicon.png'"
            />
            <span class="announcement-author-name">${announcement.authorName}</span>
          </div>
          <span class="announcement-time">${formatRelativeTime(announcement.timestamp)}</span>
        </div>
        <div class="announcement-content">${parsedPreview}</div>
      </div>
    `;
  }).join('');
  
  // Add Discord markdown styles
  addSpoilerStyles();
  
  // Add click handlers
  setupAnnouncementClickHandlers();
}

function formatRelativeTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showAnnouncementsError() {
  const container = document.getElementById('announcements-list');
  container.innerHTML = `
    <div class="loading-state">
      <i class="fas fa-exclamation-triangle"></i>
      <p>Failed to load announcements</p>
    </div>
  `;
}

function setupAnnouncementClickHandlers() {
  const announcementCards = document.querySelectorAll('.announcement-card.clickable');
  announcementCards.forEach(card => {
    card.addEventListener('click', () => {
      const index = parseInt(card.dataset.announcementIndex);
      showAnnouncementModal(announcementsData[index]);
    });
  });
}

function showAnnouncementModal(announcement) {
  const modal = document.getElementById('announcement-modal');
  const modalAvatar = document.getElementById('modal-author-avatar');
  const modalAuthorName = document.getElementById('modal-author-name');
  const modalTimestamp = document.getElementById('modal-timestamp');
  const modalContent = document.getElementById('modal-announcement-content');
  
  // Set modal content
  modalAvatar.src = announcement.authorAvatar || '/images/tingleicon.png';
  modalAuthorName.textContent = announcement.authorName;
  modalTimestamp.textContent = formatFullTime(announcement.timestamp);
  
  // Parse and render Discord markdown
  const parsedContent = parseDiscordMarkdown(announcement.content);
  modalContent.innerHTML = parsedContent;
  
  // Add spoiler styles if not already added
  addSpoilerStyles();
  
  // Show modal
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function hideAnnouncementModal() {
  const modal = document.getElementById('announcement-modal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

function formatFullTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('en-US', { 
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Setup modal close handlers
document.addEventListener('DOMContentLoaded', () => {
  const closeButton = document.getElementById('close-announcement-modal');
  const modal = document.getElementById('announcement-modal');
  
  if (closeButton) {
    closeButton.addEventListener('click', hideAnnouncementModal);
  }
  
  if (modal) {
    // Close on background click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideAnnouncementModal();
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modal.classList.contains('active')) {
        hideAnnouncementModal();
      }
    });
  }
});

// ============================================================================
// ------------------- Section: Event Listeners -------------------
// Sets up guild page event listeners
// ============================================================================

// ------------------- Function: setupGuildEventListeners -------------------
// Sets up all guild page event listeners
function setupGuildEventListeners() {
  
  // Listen for custom navigation events
  document.addEventListener('navigateToSection', (event) => {
    if (event.detail.section === 'guilds-section') {    
      // The section will be shown by the main navigation handler
      // We just need to initialize the guild page
      setTimeout(() => {
        initGuildPage();
      }, 100);
    }
  });
  
  // Handle window resize for chart responsiveness
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      // Redraw chart if guild section is visible
      const guildSection = document.getElementById('guilds-section');
      if (guildSection && guildSection.style.display !== 'none') {
        const canvas = document.getElementById('roles-chart');
        if (canvas && guildData && guildData.roles) {
          displayRoleDistribution(guildData.roles);
        }
      }
    }, 250);
  });
  
}

// ============================================================================
// ------------------- Section: Initialization -------------------
// Initialize guild module when loaded
// ============================================================================

// Initialize event listeners when module loads
setupGuildEventListeners();

// ============================================================================
// ------------------- Section: Exports -------------------
// Export functions for use in other modules
// ============================================================================

export {
  showGuildSection,
  initGuildPage,
  loadGuildData,
  setupGuildActions,
  handleJoinGuild,
  handleViewGuild
}; 