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
    console.log('🔝 Setting up back to top button...');
    console.log('🔝 Document ready state:', document.readyState);
    console.log('🔝 Window scroll position:', window.pageYOffset);
    
    let button = document.getElementById('backToTop');
    if (!button) {
      console.error('❌ Back to top button not found in DOM');
      console.error('❌ Available elements with "back" in ID:', 
        Array.from(document.querySelectorAll('[id*="back"]')).map(el => el.id));
      console.error('❌ Available elements with "top" in ID:', 
        Array.from(document.querySelectorAll('[id*="top"]')).map(el => el.id));
      
      // Create the button as a fallback
      console.log('🔝 Creating back-to-top button as fallback...');
      button = document.createElement('button');
      button.id = 'backToTop';
      button.className = 'back-to-top';
      button.setAttribute('aria-label', 'Back to top');
      button.innerHTML = '<i class="fas fa-arrow-up" aria-hidden="true"></i>';
      document.body.appendChild(button);
      console.log('✅ Created back-to-top button:', button);
    }
    
    console.log('✅ Back to top button found:', button);
    console.log('✅ Button current styles:', {
      display: button.style.display,
      opacity: button.style.opacity,
      visibility: button.style.visibility,
      position: button.style.position,
      zIndex: button.style.zIndex
    });
    
    // Ensure button is always visible
    console.log('🔝 Making button always visible...');
    button.style.display = 'flex';
    button.style.opacity = '1';
    button.style.pointerEvents = 'auto';
    button.style.visibility = 'visible';
  
    // Smooth scroll to top on click
    button.addEventListener('click', () => {
      console.log('🔝 Back to top button clicked');
      scrollToTop();
    });
    
    console.log('✅ Back to top button setup complete - always visible');
}

/**
 * ------------------- Function: scrollToTop -------------------
 * Smoothly scrolls the window to the top of the page with fallback support.
 */
function scrollToTop() {
  console.log('📜 scrollToTop function called');
  console.log('📜 Current scroll position:', window.pageYOffset);
  
  // Try scrolling the model details container first
  const modelDetailsData = document.getElementById('model-details-data');
  if (modelDetailsData) {
    console.log('📜 Found model-details-data container, scrolling it to top');
    modelDetailsData.scrollTop = 0;
  }
  
  // Try smooth scrolling first
  if ('scrollBehavior' in document.documentElement.style) {
    console.log('📜 Using smooth scroll behavior');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    // Fallback for older browsers
    console.log('📜 Using fallback scroll method');
    window.scrollTo(0, 0);
  }
  
  // Additional fallback for edge cases
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  
  // Force scroll after a brief delay to ensure DOM is updated
  setTimeout(() => {
    console.log('📜 Force scrolling after delay');
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (modelDetailsData) {
      modelDetailsData.scrollTop = 0;
    }
  }, 50);
  
  console.log('📜 Scroll to top completed');
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
  console.log('🎯 Creating pagination:', { page, pages });
  if (pages <= 1) {
    console.log('📄 No pagination needed (pages <= 1)');
    return document.createDocumentFragment();
  }

  const paginationDiv = document.createElement('div');
  paginationDiv.className = 'pagination';
  console.log('📄 Created pagination container');

  // Helper to create a button
  const makeButton = ({ className, content, title, disabled, onClick }) => {
    console.log('🔘 Creating button:', { className, content, title, disabled });
    const btn = document.createElement('button');
    btn.className = className;
    if (title) btn.title = title;
    if (disabled) btn.disabled = true;
    btn.innerHTML = content;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      console.log('🖱️ Pagination button clicked:', { className, content });
      onClick();
    });
    return btn;
  };

  // Previous
  if (page > 1) {
    console.log('⬅️ Adding previous button');
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: '<i class="fas fa-chevron-left"></i>',
      title: 'Previous Page',
      onClick: () => {
        console.log('⬅️ Previous page clicked, current page:', page);
        onPageChange(page - 1);
      },
    }));
  }

  // First page shortcut
  if (page > 2) {
    console.log('1️⃣ Adding first page button');
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: '1',
      onClick: () => {
        console.log('1️⃣ First page clicked');
        onPageChange(1);
      },
    }));
  }

  // Leading ellipsis
  if (page > 3) {
    console.log('... Adding leading ellipsis');
    const ell = document.createElement('span');
    ell.className = 'pagination-ellipsis';
    ell.textContent = '…';
    paginationDiv.appendChild(ell);
  }

  // Surrounding pages
  console.log('📄 Adding surrounding pages');
  for (let i = Math.max(1, page - 1); i <= Math.min(pages, page + 1); i++) {
    console.log(`📄 Adding page button ${i}`);
    paginationDiv.appendChild(makeButton({
      className: `pagination-button${i === page ? ' active' : ''}`,
      content: `${i}`,
      onClick: () => {
        console.log(`📄 Page ${i} clicked`);
        onPageChange(i);
      },
    }));
  }

  // Trailing ellipsis
  if (page < pages - 2) {
    console.log('... Adding trailing ellipsis');
    const ell = document.createElement('span');
    ell.className = 'pagination-ellipsis';
    ell.textContent = '…';
    paginationDiv.appendChild(ell);
  }

  // Last page shortcut
  if (page < pages - 1) {
    console.log('🔚 Adding last page button');
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: `${pages}`,
      onClick: () => {
        console.log(`🔚 Last page clicked: ${pages}`);
        onPageChange(pages);
      },
    }));
  }

  // Next
  if (page < pages) {
    console.log('➡️ Adding next button');
    paginationDiv.appendChild(makeButton({
      className: 'pagination-button',
      content: '<i class="fas fa-chevron-right"></i>',
      title: 'Next Page',
      onClick: () => {
        console.log('➡️ Next page clicked, current page:', page);
        onPageChange(page + 1);
      },
    }));
  }

  console.log('✅ Pagination creation complete');
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
// ------------------- Exports -------------------
// Expose public functions for external use
// ============================================================================
export {
  setupBackToTopButton,
  createPagination,
  setupServerPagination,
  capitalizeFirstLetter,
  scrollToTop
};
  