/* ======================================================================
 * File: ui.js
 * Description: Manages scroll-to-top functionality and both client-side and server-side pagination UI.
 * ====================================================================== */

// ============================================================================
// ------------------- Section: Scroll Utility -------------------
// Handles "back to top" button visibility and behavior
// ============================================================================
/**
 * ------------------- Function: setupBackToTopButton -------------------
 * Configures the scroll-to-top button visibility and click behavior.
 */
function setupBackToTopButton() {
    
    let button = document.getElementById('backToTop');
    if (!button) {
        // Create the button as a fallback
      button = document.createElement('button');
      button.id = 'backToTop';
      button.className = 'back-to-top';
      button.setAttribute('aria-label', 'Back to top');
      button.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
      document.body.appendChild(button);
    }
    
    
    // Ensure button is always visible
    button.style.display = 'flex';
    button.style.opacity = '1';
    button.style.pointerEvents = 'auto';
    button.style.visibility = 'visible';
  
    // Smooth scroll to top on click
    button.addEventListener('click', () => {
      scrollToTop();
    });
    
}

/**
 * ------------------- Function: scrollToTop -------------------
 * Smoothly scrolls the window to the top of the page with a single, smooth animation.
 */
function scrollToTop() {
  
  // Check for scrollable containers that might need scrolling
  const mainContent = document.querySelector('.main-content');
  const modelDetailsData = document.getElementById('model-details-data');
  
  if (mainContent) {
  }
  
  if (modelDetailsData) {
  }
  
  // Check if any scrollable containers need scrolling
  const scrollableElements = [];
  
  if (mainContent && mainContent.scrollTop > 0) {
    scrollableElements.push(mainContent);
  }
  
  if (modelDetailsData && modelDetailsData.scrollTop > 0) {
    scrollableElements.push(modelDetailsData);
  }
  
  // If we have scrollable elements, scroll them first
  if (scrollableElements.length > 0) {
    scrollableElements.forEach(element => {
      element.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  
  // Always scroll the window as well
  if ('scrollBehavior' in document.documentElement.style) {
    window.scrollTo({ 
      top: 0, 
      behavior: 'smooth' 
    });
  } else {
    // Fallback for older browsers with custom easing
    const start = window.pageYOffset;
    const startTime = performance.now();
    const duration = 600; // Slightly faster for better UX
    
    const easeOutCubic = (t) => {
      return 1 - Math.pow(1 - t, 3);
    };
    
    const animateWindowScroll = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      
      window.scrollTo(0, start - (start * easedProgress));
      
      if (progress < 1) {
        requestAnimationFrame(animateWindowScroll);
      }
    };
    
    requestAnimationFrame(animateWindowScroll);
  }
  
}
  
// ============================================================================
// ------------------- Section: Search Filter Builder -------------------
// Provides a consistent, modular way to render search/filter bars
// ============================================================================
/**
 * Creates a standardized search filter bar that automatically applies the
 * shared styling and layout used across the dashboard.
 * @param {Object} config - Configuration for the filter bar
 * @param {string} [config.id] - Optional id for the filter bar element
 * @param {Array} [config.filters] - List of filter definitions
 * @param {Array} [config.buttons] - Optional actions (e.g., clear button)
 * @param {Array} [config.barClasses] - Extra classes for the bar wrapper
 * @param {Object} [config.dataset] - Data attributes to apply to the bar
 * @returns {{ bar: HTMLElement, elements: Record<string, HTMLElement> }}
 */
function createSearchFilterBar({
  id,
  filters = [],
  advancedFilters = [],
  buttons = [],
  barClasses = [],
  dataset = {},
  layout = 'responsive',
  advancedToggleLabel = 'Show advanced filters',
  advancedToggleExpandedLabel = 'Hide advanced filters'
} = {}) {
  const bar = document.createElement('div');
  const classList = ['search-filter-bar', ...barClasses];
  bar.className = classList.filter(Boolean).join(' ');
  bar.dataset.layout = layout;

  if (id) {
    bar.id = id;
  }

  if (dataset && typeof dataset === 'object') {
    Object.entries(dataset).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        bar.dataset[key] = value;
      }
    });
  }

  const createdElements = {};

  const applyAttributes = (element, attributes = {}) => {
    Object.entries(attributes).forEach(([attr, value]) => {
      if (value === undefined || value === null || value === false) return;
      if (value === true) {
        element.setAttribute(attr, attr);
      } else {
        element.setAttribute(attr, value);
      }
    });
  };

  const normalizeOptions = (options = []) =>
    options.map(option => (typeof option === 'string' ? { value: option, label: option } : option));

  const appendControl = (container, filterConfig = {}) => {
    if (!filterConfig) return;

    if (filterConfig.type === 'custom' && typeof filterConfig.render === 'function') {
      const customWrapper = document.createElement('div');
      customWrapper.className = ['search-filter-control', ...(filterConfig.wrapperClasses || [])].join(' ').trim();
      if (filterConfig.wrapperAttributes) {
        applyAttributes(customWrapper, filterConfig.wrapperAttributes);
      }
      const renderedNode = filterConfig.render(customWrapper);
      if (renderedNode instanceof HTMLElement && !customWrapper.contains(renderedNode)) {
        customWrapper.appendChild(renderedNode);
      }
      container.appendChild(customWrapper);
      return;
    }

    const control = document.createElement('div');
    const controlClasses = ['search-filter-control'];
    if (!filterConfig.type || filterConfig.type === 'input') {
      controlClasses.push('search-input');
    }
    if (filterConfig.width === 'double') {
      controlClasses.push('span-two');
    }
    if (filterConfig.width === 'full') {
      controlClasses.push('span-full');
    }
    if (Array.isArray(filterConfig.wrapperClasses)) {
      controlClasses.push(...filterConfig.wrapperClasses);
    }

    control.className = controlClasses.filter(Boolean).join(' ');
    if (filterConfig.wrapperAttributes) {
      applyAttributes(control, filterConfig.wrapperAttributes);
    }

    let element;
    if (filterConfig.element instanceof HTMLElement) {
      element = filterConfig.element;
    } else if (filterConfig.type === 'select') {
      element = document.createElement('select');
    } else {
      element = document.createElement('input');
      element.type = filterConfig.inputType || 'text';
    }

    if (filterConfig.id) element.id = filterConfig.id;
    if (filterConfig.name) element.name = filterConfig.name;
    if (filterConfig.placeholder) element.placeholder = filterConfig.placeholder;
    if (filterConfig.value !== undefined) element.value = filterConfig.value;
    if (filterConfig.maxLength) element.maxLength = filterConfig.maxLength;

    if (filterConfig.attributes) {
      applyAttributes(element, filterConfig.attributes);
    }

    if (filterConfig.dataset) {
      Object.entries(filterConfig.dataset).forEach(([dataKey, dataValue]) => {
        if (dataValue !== undefined && dataValue !== null) {
          element.dataset[dataKey] = dataValue;
        }
      });
    }

    if (filterConfig.type === 'select') {
      const options = normalizeOptions(filterConfig.options || []);
      if (options.length === 0 && filterConfig.placeholderOption) {
        options.push(filterConfig.placeholderOption);
      }
      options.forEach(opt => {
        const optionElement = document.createElement('option');
        optionElement.value = opt.value ?? opt.label ?? '';
        optionElement.textContent = opt.label ?? opt.value ?? '';
        if (opt.disabled) optionElement.disabled = true;
        if (opt.selected) optionElement.selected = true;
        if (opt.hidden) optionElement.hidden = true;
        element.appendChild(optionElement);
      });

      if (filterConfig.defaultValue !== undefined) {
        element.value = filterConfig.defaultValue;
      }
    }

    if (filterConfig.label) {
      control.classList.add('has-label');
      const labelEl = document.createElement('label');
      labelEl.className = ['search-filter-label', filterConfig.labelClass || ''].filter(Boolean).join(' ').trim();
      labelEl.textContent = filterConfig.label;
      const labelTarget = filterConfig.id || filterConfig.name;
      if (labelTarget) {
        labelEl.setAttribute('for', labelTarget);
      }
      if (filterConfig.labelIcon) {
        const icon = document.createElement('i');
        icon.className = filterConfig.labelIcon;
        labelEl.prepend(icon);
      }
      control.appendChild(labelEl);
    }

    control.appendChild(element);
    container.appendChild(control);

    if (filterConfig.id) {
      createdElements[filterConfig.id] = element;
    }
  };

  filters.forEach(config => appendControl(bar, config));

  const normalizedButtons = buttons.map(buttonConfig => {
    if (typeof buttonConfig === 'string') {
      return {
        label: buttonConfig,
        className: 'clear-filters-btn'
      };
    }
    return buttonConfig;
  });

  normalizedButtons.forEach((buttonConfig, index) => {
    if (!buttonConfig) return;
    const button = document.createElement('button');
    button.type = buttonConfig.type || 'button';
    if (buttonConfig.id) {
      button.id = buttonConfig.id;
    } else if (!buttonConfig.html && !buttonConfig.label) {
      button.id = `filter-btn-${index}`;
    }
    button.className = buttonConfig.className || 'clear-filters-btn';

    if (buttonConfig.html) {
      button.innerHTML = buttonConfig.html;
    } else {
      button.textContent = buttonConfig.label || 'Action';
    }

    if (buttonConfig.attributes) {
      applyAttributes(button, buttonConfig.attributes);
    }

    if (buttonConfig.dataset) {
      Object.entries(buttonConfig.dataset).forEach(([dataKey, dataValue]) => {
        if (dataValue !== undefined && dataValue !== null) {
          button.dataset[dataKey] = dataValue;
        }
      });
    }

    bar.appendChild(button);

    if (button.id) {
      createdElements[button.id] = button;
    }
  });

  if (advancedFilters.length) {
    const advancedSection = document.createElement('div');
    advancedSection.className = 'search-filter-advanced-section';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'search-filter-advanced-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `<span>${advancedToggleLabel}</span><i class="fas fa-chevron-down"></i>`;

    const advancedGrid = document.createElement('div');
    advancedGrid.className = 'search-filter-advanced-grid';

    advancedFilters.forEach(config => appendControl(advancedGrid, config));

    toggle.addEventListener('click', () => {
      const expanded = advancedSection.classList.toggle('expanded');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.querySelector('span').textContent = expanded
        ? advancedToggleExpandedLabel
        : advancedToggleLabel;
    });

    advancedSection.appendChild(toggle);
    advancedSection.appendChild(advancedGrid);
    bar.appendChild(advancedSection);
  }

  return { bar, elements: createdElements };
}

// ============================================================================
// ------------------- Section: Client-Side Pagination Controls -------------------
// Handles rendering and event bindings for pagination UI (client-side)
// ============================================================================
/**
 * ------------------- Function: createPagination -------------------
 * Builds and returns a DOM node with pagination controls.
 */
function createPagination({ page = 1, pages = 1 }, onPageChange) {
  if (pages <= 1) {
    return document.createDocumentFragment();
  }

  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'pagination';

  // Helper to create a button
  const makeButton = ({ className, content, title, disabled, onClick }) => {
    const btn = document.createElement('button');
    btn.className = className;
    if (title) btn.title = title;
    if (disabled) btn.disabled = true;
    btn.innerHTML = content;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      onClick();
    });
    return btn;
  };

  // Previous
  if (page > 1) {
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: '<i class="fas fa-chevron-left"></i>',
      title: 'Previous Page',
      onClick: () => {
        onPageChange(page - 1);
      },
    }));
  }

  // First page shortcut
  if (page > 2) {
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: '1',
      onClick: () => {
        onPageChange(1);
      },
    }));
  }

  // Leading ellipsis
  if (page > 3) {
    const ell = document.createElement('span');
    ell.className = 'pagination-ellipsis';
    ell.textContent = '…';
    paginationDiv.appendChild(ell);
  }

  // Surrounding pages
  for (let i = Math.max(1, page - 1); i <= Math.min(pages, page + 1); i++) {
    paginationDiv.appendChild(makeButton({
      className: `pagination-button${i === page ? ' active' : ''}`,
      content: `${i}`,
      onClick: () => {  
        onPageChange(i);
      },
    }));
  }

  // Trailing ellipsis
  if (page < pages - 2) {
    const ell = document.createElement('span');
    ell.className = 'pagination-ellipsis';
    ell.textContent = '…';
    paginationDiv.appendChild(ell);
  }

  // Last page shortcut
  if (page < pages - 1) {
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: `${pages}`,
      onClick: () => {
        onPageChange(pages);
      },
    }));
  }

  // Next
  if (page < pages) {
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: '<i class="fas fa-chevron-right"></i>',
      title: 'Next Page',
      onClick: () => {
        onPageChange(page + 1);
      },
    }));
  }

  return paginationDiv;
}

// ============================================================================
// ------------------- Section: Server-Side Pagination Controls -------------------
// Handles building pagination markup and attaching to the container (server-side)
// ============================================================================
/**
 * ------------------- Function: setupServerPagination -------------------
 * Renders server-driven pagination into the target container by model name.
 */
async function setupServerPagination(modelName, { currentPage = 1, totalPages = 1 }) {
  const container = document.getElementById(`${modelName}-pagination`);
  if (!container) return;  // Exit if no container found

  try {
    let html = '';

    // Previous button
    html += `
      <button class="pagination-btn" ${currentPage === 1 ? 'disabled' : ''}
              onclick="load${capitalizeFirstLetter(modelName)}Page(${currentPage - 1})">
        Previous
      </button>`;

    // Page number buttons
    for (let i = 1; i <= totalPages; i++) {
      html += `
        <button class="pagination-btn${i === currentPage ? ' active' : ''}"
                onclick="load${capitalizeFirstLetter(modelName)}Page(${i})">
          ${i}
        </button>`;
    }

    // Next button
    html += `
      <button class="pagination-btn" ${currentPage === totalPages ? 'disabled' : ''}
              onclick="load${capitalizeFirstLetter(modelName)}Page(${currentPage + 1})">
        Next
      </button>`;

    container.innerHTML = html;
  } catch (error) {
    console.error(`Error setting up ${modelName} pagination:`, error);
    // Optional: container.innerHTML = '<p class="error">Failed to load pagination.</p>';
  }
}

// ============================================================================
// ------------------- Section: Helpers -------------------
// Utility functions shared across modules
// ============================================================================
/**
 * ------------------- Function: capitalizeFirstLetter -------------------
 * Capitalizes the first character of a string.
 */
function capitalizeFirstLetter(str = '') {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============================================================================
// ------------------- Section: Mobile Enhancements -------------------
// Handles mobile-specific interactions and responsive behavior
// ============================================================================

/**
 * ------------------- Function: setupMobileEnhancements -------------------
 * Configures mobile-specific behaviors and touch interactions.
 */
function setupMobileEnhancements() {
  // Mobile sidebar toggle
  setupMobileSidebar();
  
  // Touch-friendly interactions
  setupTouchInteractions();
  
  // Mobile viewport handling
  setupMobileViewport();
  
  // Mobile gesture support
  setupMobileGestures();
  
  // Mobile performance optimizations
  setupMobilePerformance();
}

/**
 * ------------------- Function: setupMobileSidebar -------------------
 * Handles mobile sidebar toggle behavior.
 */
function setupMobileSidebar() {
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');
  const mainWrapper = document.querySelector('.main-wrapper');
  const overlay = document.createElement('div');
  
  if (!sidebarToggle || !sidebar) return;
  
  // Create overlay for mobile sidebar
  overlay.className = 'sidebar-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1001;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
  `;
  document.body.appendChild(overlay);
  
  // Toggle sidebar function
  function toggleSidebar() {
    const isOpen = sidebar.classList.contains('mobile-open');
    
    if (isOpen) {
      sidebar.classList.remove('mobile-open');
      overlay.style.opacity = '0';
      overlay.style.visibility = 'hidden';
      document.body.style.overflow = '';
    } else {
      sidebar.classList.add('mobile-open');
      overlay.style.opacity = '1';
      overlay.style.visibility = 'visible';
      document.body.style.overflow = 'hidden';
    }
  }
  
  // Event listeners
  sidebarToggle.addEventListener('click', (e) => {
    e.preventDefault();
    toggleSidebar();
  });
  
  overlay.addEventListener('click', toggleSidebar);
  
  // Close sidebar when clicking on a link
  const sidebarLinks = sidebar.querySelectorAll('a');
  sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        toggleSidebar();
      }
    });
  });
  
  // Handle window resize
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (window.innerWidth > 768) {
        sidebar.classList.remove('mobile-open');
        overlay.style.opacity = '0';
        overlay.style.visibility = 'hidden';
        document.body.style.overflow = '';
      }
    }, 250);
  });
}

/**
 * ------------------- Function: setupTouchInteractions -------------------
 * Enhances touch interactions for mobile devices with proper sensitivity handling.
 */
function setupTouchInteractions() {
  // Add touch feedback to interactive elements
  const touchElements = document.querySelectorAll('.model-card, .countdown-card, .weather-card, .sidebar-nav a');
  
  touchElements.forEach(element => {
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let hasMoved = false;
    let touchDelay = null;
    
    // Touch start - record initial position and time
    element.addEventListener('touchstart', function(e) {
      touchStartTime = Date.now();
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      hasMoved = false;
      
      // Add visual feedback immediately
      this.style.transform = 'scale(0.98)';
      this.style.transition = 'transform 0.1s ease';
      
      // Set a delay to prevent accidental clicks during scrolling
      touchDelay = setTimeout(() => {
        // Only proceed if touch hasn't moved significantly
        if (!hasMoved) {
          this.style.transform = 'scale(0.95)';
        }
      }, 50);
    }, { passive: true });
    
    // Touch move - track if user is scrolling
    element.addEventListener('touchmove', function(e) {
      if (touchStartX && touchStartY) {
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);
        const deltaY = Math.abs(e.touches[0].clientY - touchStartY);
        
        // If moved more than 10px, consider it scrolling
        if (deltaX > 10 || deltaY > 10) {
          hasMoved = true;
          // Reset visual feedback if scrolling
          this.style.transform = '';
          this.style.transition = '';
        }
      }
    }, { passive: true });
    
    // Touch end - handle click only if not scrolling
    element.addEventListener('touchend', function(e) {
      // Clear the delay
      if (touchDelay) {
        clearTimeout(touchDelay);
        touchDelay = null;
      }
      
      // Reset visual feedback
      this.style.transform = '';
      this.style.transition = '';
      
      // Only trigger click if:
      // 1. Touch duration was reasonable (not too quick, not too long)
      // 2. User didn't scroll significantly
      // 3. Touch was intentional (not accidental)
      const touchDuration = Date.now() - touchStartTime;
      const isValidTouch = touchDuration > 50 && touchDuration < 1000 && !hasMoved;
      
      if (isValidTouch) {
        // Prevent default to avoid double-tap zoom
        e.preventDefault();
        // Trigger the click
        this.click();
      }
      
      // Reset tracking variables
      touchStartTime = 0;
      touchStartX = 0;
      touchStartY = 0;
      hasMoved = false;
    }, { passive: false });
    
    // Handle touch cancel (e.g., when scrolling starts)
    element.addEventListener('touchcancel', function() {
      if (touchDelay) {
        clearTimeout(touchDelay);
        touchDelay = null;
      }
      
      this.style.transform = '';
      this.style.transition = '';
      hasMoved = true;
    }, { passive: true });
  });
  
  // Improve scroll performance on mobile
  const scrollableElements = document.querySelectorAll('.main-content, .model-details-content');
  scrollableElements.forEach(element => {
    element.style.webkitOverflowScrolling = 'touch';
  });
}

/**
 * ------------------- Function: setupMobileViewport -------------------
 * Handles mobile viewport and orientation changes.
 */
function setupMobileViewport() {
  // Set viewport meta tag dynamically if needed
  const viewport = document.querySelector('meta[name="viewport"]');
  if (!viewport) {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
    document.head.appendChild(meta);
  }
  
  // Handle orientation changes
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      // Recalculate layouts after orientation change
      window.dispatchEvent(new Event('resize'));
    }, 100);
  });
  
  // Handle virtual keyboard on mobile
  const inputs = document.querySelectorAll('input, textarea');
  inputs.forEach(input => {
    input.addEventListener('focus', () => {
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
  });
}

/**
 * ------------------- Function: setupMobileGestures -------------------
 * Adds gesture support for mobile devices.
 */
function setupMobileGestures() {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isDragging = false;
  
  // Swipe to close sidebar
  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isDragging = false;
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!startX || !startY) return;
    
    currentX = e.touches[0].clientX;
    currentY = e.touches[0].clientY;
    
    const diffX = startX - currentX;
    const diffY = startY - currentY;
    
    // Check if it's a horizontal swipe
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 50) {
      isDragging = true;
      e.preventDefault();
    }
  });
  
  document.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    
    const diffX = startX - currentX;
    const sidebar = document.querySelector('.sidebar');
    
    // Swipe left to close sidebar
    if (diffX > 100 && sidebar && sidebar.classList.contains('mobile-open')) {
      const sidebarToggle = document.getElementById('sidebar-toggle');
      if (sidebarToggle) {
        sidebarToggle.click();
      }
    }
    
    startX = 0;
    startY = 0;
    isDragging = false;
  });
}

/**
 * ------------------- Function: setupMobilePerformance -------------------
 * Optimizes performance for mobile devices.
 */
function setupMobilePerformance() {
  // Reduce animations on low-end devices
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    document.documentElement.style.setProperty('--animation-duration', '0.1s');
  }
  
  // Optimize images for mobile
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    if (window.innerWidth <= 768) {
      // Add loading="lazy" for better performance
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy');
      }
    }
  });
  
  // Debounce scroll events for better performance
  let scrollTimeout;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      // Handle scroll-based updates here
    }, 16); // ~60fps
  });
}

/**
 * ------------------- Function: isMobileDevice -------------------
 * Detects if the current device is mobile.
 */
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
         window.innerWidth <= 768;
}

/**
 * ------------------- Function: setupMobileBackButton -------------------
 * Handles mobile back button behavior.
 */
function setupMobileBackButton() {
  // Handle browser back button for mobile navigation
  window.addEventListener('popstate', (event) => {
    if (isMobileDevice()) {
      const modelDetailsPage = document.getElementById('model-details-page');
      if (modelDetailsPage && modelDetailsPage.style.display !== 'none') {
        // Go back to dashboard
        showDashboard();
      }
    }
  });
}

/**
 * ------------------- Function: showDashboard -------------------
 * Shows the main dashboard and hides other sections.
 */
function showDashboard() {
  // Hide all sections
  const sections = document.querySelectorAll('section[id$="-section"]');
  sections.forEach(section => {
    section.style.display = 'none';
  });
  
  // Show dashboard
  const dashboard = document.getElementById('dashboard-section');
  if (dashboard) {
    dashboard.style.display = 'block';
  }
  
  // Hide model details page
  const modelDetailsPage = document.getElementById('model-details-page');
  if (modelDetailsPage) {
    modelDetailsPage.style.display = 'none';
  }
  
  // Update active navigation
  const navItems = document.querySelectorAll('.sidebar-nav li');
  navItems.forEach(item => item.classList.remove('active'));
  
  const dashboardNav = document.querySelector('.sidebar-nav a[href="#dashboard"]');
  if (dashboardNav) {
    dashboardNav.parentElement.classList.add('active');
  }
  
  // Update breadcrumb
  const breadcrumb = document.querySelector('.breadcrumb');
  if (breadcrumb) {
    breadcrumb.textContent = 'Dashboard';
  }
}

// Initialize mobile enhancements when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  setupMobileEnhancements();
  setupMobileBackButton();
});

// Export functions for use in other modules
window.mobileUtils = {
  isMobileDevice,
  showDashboard,
  setupMobileEnhancements
};

window.createSearchFilterBar = createSearchFilterBar;

// ============================================================================
// ------------------- Exports -------------------
// Expose public functions for external use
// ============================================================================
export {
  setupBackToTopButton,
  createPagination,
  setupServerPagination,
  capitalizeFirstLetter,
  scrollToTop,
  createSearchFilterBar
};
  