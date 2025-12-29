// Member Lore Submission Module
const memberLoreModule = (function() {
  'use strict';

  // DOM elements
  let loreForm;
  let charCount;
  let loreSuccess;
  let loreError;
  let modal;

  // Initialize the module
  function init() {
    bindElements();
    bindEvents();
    updateCharCount();
    createModal();
  }

  // Bind DOM elements
  function bindElements() {
    loreForm = document.getElementById('lore-form');
    charCount = document.getElementById('lore-char-count');
    loreSuccess = document.getElementById('lore-success');
    loreError = document.getElementById('lore-error');
    
  }

  // Bind event listeners
  function bindEvents() {
    if (loreForm) {
      loreForm.addEventListener('submit', handleSubmit);
      loreForm.addEventListener('reset', handleReset);
      
      // Character count for description
      const descriptionField = document.getElementById('lore-description');
      if (descriptionField) {
        descriptionField.addEventListener('input', updateCharCount);
      }
      
      // Check authentication status and update UI accordingly
      checkAuthenticationStatus().then(authStatus => {
        updateLoreBoxUI(authStatus);
      });
    }

    // Add event listeners for modal close buttons
    if (loreError) {
      const closeBtn = loreError.querySelector('.modal-close');
      const okBtn = loreError.querySelector('.modal-ok-btn');
      const overlay = loreError.querySelector('.modal-overlay');
      
      if (closeBtn) {
        closeBtn.addEventListener('click', hideErrorModal);
      }
      if (okBtn) {
        okBtn.addEventListener('click', hideErrorModal);
      }
      if (overlay) {
        overlay.addEventListener('click', hideErrorModal);
      }
      
      // Close modal when clicking outside
      loreError.addEventListener('click', (e) => {
        if (e.target === loreError) {
          hideErrorModal();
        }
      });
    }

    if (loreSuccess) {
      const closeBtn = loreSuccess.querySelector('.modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', hideMessages);
      }
      
      // Close modal when clicking outside
      loreSuccess.addEventListener('click', (e) => {
        if (e.target === loreSuccess) {
          hideMessages();
        }
      });
    }
  }

  // Create modal element
  function createModal() {
    // Remove existing modal if it exists
    const existingModal = document.getElementById('lore-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal HTML
    modal = document.createElement('div');
    modal.id = 'lore-modal';
    modal.className = 'lore-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>Lore Submission Successful!</h3>
          <button class="modal-close" aria-label="Close modal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-icon">
            <i class="fas fa-scroll"></i>
          </div>
          <p>Your lore has been submitted for review!</p>
        </div>
        <div class="modal-footer">
          <button class="modal-ok-btn">OK</button>
        </div>
      </div>
    `;

    // Add modal to body
    document.body.appendChild(modal);

    // Bind modal events
    const closeBtn = modal.querySelector('.modal-close');
    const okBtn = modal.querySelector('.modal-ok-btn');
    const overlay = modal.querySelector('.modal-overlay');

    closeBtn.addEventListener('click', hideModal);
    okBtn.addEventListener('click', hideModal);
    overlay.addEventListener('click', hideModal);

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (modal && modal.classList.contains('show')) {
          hideModal();
        }
        if (loreError && loreError.classList.contains('show')) {
          hideErrorModal();
        }
      }
    });
  }

  // Show modal
  function showModal() {
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
      
      // Focus the OK button for accessibility
      setTimeout(() => {
        const okBtn = modal.querySelector('.modal-ok-btn');
        if (okBtn) okBtn.focus();
      }, 100);
    }
  }

  // Hide modal
  function hideModal() {
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
    }
  }

  // Handle form submission
  async function handleSubmit(event) {
    event.preventDefault();
    
    // Check authentication status first
    const authStatus = await checkAuthenticationStatus();
    
    if (!authStatus.authenticated) {
      showError('You must be logged in with Discord to submit lore. Please log in first.', true);
      return;
    }
    
    
    const formData = new FormData(loreForm);
    const loreData = {
      memberName: formData.get('memberName'),
      topic: formData.get('topic'),
      description: formData.get('description'),
      timestamp: new Date().toISOString(),
      userId: authStatus.user?.id || null
    };


    // Show loading state
    const submitBtn = loreForm.querySelector('.submit-lore-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;

    try {
      
      // Submit lore (this would connect to your backend)
      const result = await submitLore(loreData);
      
      // Show modal instead of success message
      showModal();
      
      // Reset form
      loreForm.reset();
      updateCharCount();
      
    } catch (error) {
      console.error('Error submitting lore:', error);
      showError(error.message || 'There was an error submitting your lore. Please try again.');
    } finally {
      // Restore button state
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  }

  // Handle form reset
  function handleReset() {
    updateCharCount();
    hideMessages();
  }

  // Update character count
  function updateCharCount() {
    if (charCount) {
      const descriptionField = document.getElementById('lore-description');
      if (descriptionField) {
        const currentLength = descriptionField.value.length;
        charCount.textContent = currentLength;
        
        // Add visual feedback for character limit
        if (currentLength > 1200) {
          charCount.style.color = '#e74c3c';
        } else if (currentLength > 1000) {
          charCount.style.color = '#f39c12';
        } else {
          charCount.style.color = '#7f8c8d';
        }
      }
    }
  }

  // Submit lore to backend
  async function submitLore(loreData) {
    try {
      // Make actual API call to server
      const response = await fetch('/api/member-lore', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(loreData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error submitting lore:', error);
      throw error;
    }
  }

  // Check if user is authenticated
  async function checkAuthenticationStatus() {
    try {
      const response = await fetch('/api/user', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      
      if (!response.ok) {
        return { authenticated: false, isGuildMember: false };
      }
      
      const userData = await response.json();
      
      return {
        authenticated: userData.isAuthenticated,
        isGuildMember: userData.isAuthenticated, // If authenticated, they're in the guild
        user: userData.user
      };
    } catch (error) {
      console.error('Error checking authentication status:', error);
      return { authenticated: false, isGuildMember: false };
    }
  }

  // Show success message
  function showSuccess(message = 'Thank You!') {
    
    hideMessages();
    if (loreSuccess) {
      
      // Update the success message text
      const successTitle = loreSuccess.querySelector('h3');
      const successText = loreSuccess.querySelector('p');
      
      
      if (successTitle) {
        successTitle.textContent = message;
      }
      if (successText) {
        successText.textContent = 'Your lore submission has been sent for review! We\'ll review it and respond in the server.';
      }
      
      // Show success message
      loreSuccess.style.display = 'block';
      loreSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        hideMessages();
      }, 8000);
    } else {
      console.error('loreSuccess element not found!');
    }
  }

  // Show error message
  function showError(message = 'There was an error submitting your lore. Please try again.', showLoginButton = false) {
    
    // Hide success modal but not error modal
    if (loreSuccess) {
      loreSuccess.style.display = 'none';
    }
    
    if (loreError) {
      // Update error message if provided
      const errorText = loreError.querySelector('p');
      if (errorText) {
        errorText.textContent = message;
      }
      
      // Add login button if needed
      if (showLoginButton) {
        let loginButton = loreError.querySelector('.login-button');
        if (!loginButton) {
          loginButton = document.createElement('button');
          loginButton.className = 'login-button';
          loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login with Discord';
          loginButton.addEventListener('click', () => {
            window.location.href = '/login';
          });
          loreError.querySelector('.modal-body').appendChild(loginButton);
        }
        loginButton.style.display = 'inline-flex';
      } else {
        const loginButton = loreError.querySelector('.login-button');
        if (loginButton) {
          loginButton.style.display = 'none';
        }
      }
      
      // Show modal with proper styling
      loreError.classList.add('show');
      loreError.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      
      // Focus the OK button for accessibility
      setTimeout(() => {
        const okBtn = loreError.querySelector('.modal-ok-btn');
        if (okBtn) okBtn.focus();
      }, 100);
      
      // Auto-hide after 8 seconds (longer for login messages)
      setTimeout(() => {
        hideErrorModal();
      }, showLoginButton ? 8000 : 5000);
    } else {
      console.error('loreError element not found!');
    }
  }

  // Hide error modal
  function hideErrorModal() {
    if (loreError) {
      loreError.classList.remove('show');
      document.body.style.overflow = '';
    }
  }

  // Hide all messages
  function hideMessages() {
    if (loreSuccess) {
      loreSuccess.style.display = 'none';
    }
    hideErrorModal();
  }

  // Update lore box UI based on authentication status
  function updateLoreBoxUI(authStatus) {
    const loreFormWrapper = document.querySelector('.lore-form-wrapper');
    const loreInfo = document.querySelector('.lore-info');
    
    if (!authStatus.authenticated) {
      // Hide the form and show login prompt
      if (loreFormWrapper) {
        loreFormWrapper.style.display = 'none';
      }
      
      // Create or update login prompt
      let loginPrompt = document.getElementById('lore-login-prompt');
      if (!loginPrompt) {
        loginPrompt = document.createElement('div');
        loginPrompt.id = 'lore-login-prompt';
        loginPrompt.className = 'lore-login-prompt';
        loginPrompt.innerHTML = `
          <div class="login-prompt-content">
            <div class="login-prompt-icon">
              <i class="fas fa-scroll"></i>
            </div>
            <h3>Login Required</h3>
            <p>You must be logged in with Discord to submit member lore.</p>
            <p>This helps us ensure lore submissions come from verified server members.</p>
            <a href="/login" class="discord-login-btn">
              <i class="fab fa-discord"></i>
              Login with Discord
            </a>
            <div class="login-benefits">
              <h4>Why login?</h4>
              <ul>
                <li><i class="fas fa-check"></i> Verify you're a server member</li>
                <li><i class="fas fa-check"></i> Submit your own lore</li>
                <li><i class="fas fa-check"></i> Contribute to the world building</li>
                <li><i class="fas fa-check"></i> Help expand the Roots of the Wild universe</li>
              </ul>
            </div>
          </div>
        `;
        
        // Insert before lore info
        if (loreInfo) {
          loreInfo.parentNode.insertBefore(loginPrompt, loreInfo);
        } else {
          // Insert at the end of lore-box-container
          const container = document.querySelector('.lore-box-container');
          if (container) {
            container.appendChild(loginPrompt);
          }
        }
      }
      
      // Add CSS styles for the login prompt
      if (!document.getElementById('lore-login-styles')) {
        const style = document.createElement('style');
        style.id = 'lore-login-styles';
        style.textContent = `
          .lore-login-prompt {
            background: linear-gradient(135deg, rgba(139, 69, 19, 0.1), rgba(139, 69, 19, 0.05));
            border: 2px solid rgba(139, 69, 19, 0.3);
            border-radius: 12px;
            padding: 2rem;
            text-align: center;
            margin-bottom: 2rem;
            backdrop-filter: blur(10px);
          }
          
          .login-prompt-content {
            max-width: 500px;
            margin: 0 auto;
          }
          
          .login-prompt-icon {
            font-size: 3rem;
            color: #8B4513;
            margin-bottom: 1rem;
          }
          
          .login-prompt-content h3 {
            color: var(--text-primary);
            margin-bottom: 1rem;
            font-size: 1.5rem;
          }
          
          .login-prompt-content p {
            color: var(--text-secondary);
            margin-bottom: 1rem;
            line-height: 1.6;
          }
          
          .discord-login-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: #5865F2;
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: 600;
            font-size: 1.1rem;
            margin: 1.5rem 0;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(88, 101, 242, 0.3);
          }
          
          .discord-login-btn:hover {
            background: #4752C4;
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(88, 101, 242, 0.4);
            color: white;
            text-decoration: none;
          }
          
          .login-benefits {
            margin-top: 2rem;
            padding-top: 1.5rem;
            border-top: 1px solid rgba(139, 69, 19, 0.2);
          }
          
          .login-benefits h4 {
            color: var(--text-primary);
            margin-bottom: 1rem;
            font-size: 1.2rem;
          }
          
          .login-benefits ul {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          
          .login-benefits li {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
            color: var(--text-secondary);
          }
          
          .login-benefits li i {
            color: #4CAF50;
            font-size: 0.9rem;
          }
        `;
        document.head.appendChild(style);
      }
      
    } else {
      // Show the form and hide login prompt
      if (loreFormWrapper) {
        loreFormWrapper.style.display = 'block';
      }
      
      const loginPrompt = document.getElementById('lore-login-prompt');
      if (loginPrompt) {
        loginPrompt.remove();
      }
      
      // Update submit button
      const submitBtn = loreForm.querySelector('.submit-lore-btn');
      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-scroll"></i> <span class="btn-text">Submit Lore</span>';
        submitBtn.style.opacity = '1';
        submitBtn.title = 'Submit your lore';
      }
    }
  }

  // Refresh authentication status (called after login)
  function refreshAuthStatus() {
    if (loreForm) {
      checkAuthenticationStatus().then(authStatus => {
        updateLoreBoxUI(authStatus);
      });
    }
  }

  // Test function to show error modal
  function testErrorModal() {
    showError('This is a test error message');
  }

  // Public API
  return {
    init: init,
    handleSubmit: handleSubmit,
    handleReset: handleReset,
    updateCharCount: updateCharCount,
    showModal: showModal,
    hideModal: hideModal,
    refreshAuthStatus: refreshAuthStatus,
    testErrorModal: testErrorModal
  };
})();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  memberLoreModule.init();
  
  // Make test function available globally for debugging
  window.testLoreErrorModal = memberLoreModule.testErrorModal;
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = memberLoreModule;
}
