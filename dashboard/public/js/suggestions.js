// Suggestion Box Module
const suggestionsModule = (function() {
  'use strict';

  // DOM elements
  let suggestionForm;
  let charCount;
  let suggestionSuccess;
  let suggestionError;
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
    suggestionForm = document.getElementById('suggestion-form');
    charCount = document.getElementById('char-count');
    suggestionSuccess = document.getElementById('suggestion-success');
    suggestionError = document.getElementById('suggestion-error');
    
  }

  // Bind event listeners
  function bindEvents() {
    if (suggestionForm) {
      suggestionForm.addEventListener('submit', handleSubmit);
      suggestionForm.addEventListener('reset', handleReset);
      
      // Character count for description
      const descriptionField = document.getElementById('suggestion-description');
      if (descriptionField) {
        descriptionField.addEventListener('input', updateCharCount);
      }
      
      // Check authentication status and update UI accordingly
      checkAuthenticationStatus().then(authStatus => {
        updateSuggestionBoxUI(authStatus);
      });
    }

    // Add event listeners for modal close buttons
    if (suggestionError) {
      const closeBtn = suggestionError.querySelector('.modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', hideMessages);
      }
      
      // Close modal when clicking outside
      suggestionError.addEventListener('click', (e) => {
        if (e.target === suggestionError) {
          hideMessages();
        }
      });
    }

    if (suggestionSuccess) {
      const closeBtn = suggestionSuccess.querySelector('.modal-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', hideMessages);
      }
      
      // Close modal when clicking outside
      suggestionSuccess.addEventListener('click', (e) => {
        if (e.target === suggestionSuccess) {
          hideMessages();
        }
      });
    }
  }

  // Create modal element
  function createModal() {
    // Remove existing modal if it exists
    const existingModal = document.getElementById('suggestion-modal');
    if (existingModal) {
      existingModal.remove();
    }

    // Create modal HTML
    modal = document.createElement('div');
    modal.id = 'suggestion-modal';
    modal.className = 'suggestion-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h3>Submission Successful!</h3>
          <button class="modal-close" aria-label="Close modal">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="modal-icon">
            <i class="fas fa-check-circle"></i>
          </div>
          <p>Submission sent to Discord!</p>
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
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        hideModal();
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
      showError('You must be logged in with Discord to submit suggestions. Please log in first.', true);
      return;
    }
    
    
    const formData = new FormData(suggestionForm);
    const suggestionData = {
      category: formData.get('category'),
      title: formData.get('title'),
      description: formData.get('description'),
      timestamp: new Date().toISOString(),
      userId: authStatus.user?.id || null
    };


    // Show loading state
    const submitBtn = suggestionForm.querySelector('.submit-suggestion-btn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;

    try {
      
      // Submit suggestion (this would connect to your backend)
      const result = await submitSuggestion(suggestionData);
      
      // Show modal instead of success message
      showModal();
      
      // Reset form
      suggestionForm.reset();
      updateCharCount();
      
    } catch (error) {
      console.error('Error submitting suggestion:', error);
      showError(error.message || 'There was an error submitting your suggestion. Please try again.');
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
      const descriptionField = document.getElementById('suggestion-description');
      if (descriptionField) {
        const currentLength = descriptionField.value.length;
        charCount.textContent = currentLength;
        
        // Add visual feedback for character limit
        if (currentLength > 900) {
          charCount.style.color = '#e74c3c';
        } else if (currentLength > 800) {
          charCount.style.color = '#f39c12';
        } else {
          charCount.style.color = '#7f8c8d';
        }
      }
    }
  }

  // Submit suggestion to backend
  async function submitSuggestion(suggestionData) {
    try {
      // Note: Client-side validation removed to ensure server-side logging captures all attempts

      // Make actual API call to server
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(suggestionData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error submitting suggestion:', error);
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

  // Get current user ID (if logged in)
  function getCurrentUserId() {
    // This would get the current user's ID from your auth system
    // For anonymous submissions, return null
    try {
      // Check if user is logged in (you'll need to implement this based on your auth system)
      const user = JSON.parse(localStorage.getItem('user'));
      return user ? user.id : null;
    } catch (error) {
      return null;
    }
  }

  // Show success message
  function showSuccess(message = 'Thank You!') {
    
    hideMessages();
    if (suggestionSuccess) {
      
      // Update the success message text
      const successTitle = suggestionSuccess.querySelector('h3');
      const successText = suggestionSuccess.querySelector('p');
      
      
      if (successTitle) {
        successTitle.textContent = message;
      }
      if (successText) {
        successText.textContent = 'Your anonymous suggestion has been submitted successfully! We\'ll review it and respond in the server.';
      }
      
      // Show success message
      suggestionSuccess.style.display = 'block';
      suggestionSuccess.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Auto-hide after 8 seconds
      setTimeout(() => {
        hideMessages();
      }, 8000);
    } else {
      console.error('suggestionSuccess element not found!');
    }
  }

  // Show error message
  function showError(message = 'There was an error submitting your suggestion. Please try again.', showLoginButton = false) {
    hideMessages();
    if (suggestionError) {
      // Update error message if provided
      const errorText = suggestionError.querySelector('p');
      if (errorText) {
        errorText.textContent = message;
      }
      
      // Add login button if needed
      if (showLoginButton) {
        let loginButton = suggestionError.querySelector('.login-button');
        if (!loginButton) {
          loginButton = document.createElement('button');
          loginButton.className = 'login-button';
          loginButton.innerHTML = '<i class="fas fa-sign-in-alt"></i> Login with Discord';
          loginButton.addEventListener('click', () => {
            window.location.href = '/login';
          });
          suggestionError.querySelector('.modal-body').appendChild(loginButton);
        }
        loginButton.style.display = 'inline-flex';
      } else {
        const loginButton = suggestionError.querySelector('.login-button');
        if (loginButton) {
          loginButton.style.display = 'none';
        }
      }
      
      suggestionError.style.display = 'flex';
      
      // Auto-hide after 8 seconds (longer for login messages)
      setTimeout(() => {
        hideMessages();
      }, showLoginButton ? 8000 : 5000);
    }
  }

  // Hide all messages
  function hideMessages() {
    if (suggestionSuccess) {
      suggestionSuccess.style.display = 'none';
    }
    if (suggestionError) suggestionError.style.display = 'none';
  }

  // Update suggestion box UI based on authentication status
  function updateSuggestionBoxUI(authStatus) {
    const suggestionFormWrapper = document.querySelector('.suggestion-form-wrapper');
    const suggestionInfo = document.querySelector('.suggestion-info');
    
    if (!authStatus.authenticated) {
      // Hide the form and show login prompt
      if (suggestionFormWrapper) {
        suggestionFormWrapper.style.display = 'none';
      }
      
      // Create or update login prompt
      let loginPrompt = document.getElementById('suggestion-login-prompt');
      if (!loginPrompt) {
        loginPrompt = document.createElement('div');
        loginPrompt.id = 'suggestion-login-prompt';
        loginPrompt.className = 'suggestion-login-prompt';
        loginPrompt.innerHTML = `
          <div class="login-prompt-content">
            <div class="login-prompt-icon">
              <i class="fab fa-discord"></i>
            </div>
            <h3>Login Required</h3>
            <p>You must be logged in with Discord to submit anonymous suggestions.</p>
            <p>This helps us ensure suggestions come from verified server members while keeping them anonymous.</p>
            <a href="/login" class="discord-login-btn">
              <i class="fab fa-discord"></i>
              Login with Discord
            </a>
            <div class="login-benefits">
              <h4>Why login?</h4>
              <ul>
                <li><i class="fas fa-check"></i> Verify you're a server member</li>
                <li><i class="fas fa-check"></i> Submit anonymous suggestions</li>
                <li><i class="fas fa-check"></i> Get responses to your suggestions</li>
                <li><i class="fas fa-check"></i> Help us improve the server</li>
              </ul>
            </div>
          </div>
        `;
        
        // Insert before suggestion info
        if (suggestionInfo) {
          suggestionInfo.parentNode.insertBefore(loginPrompt, suggestionInfo);
        } else {
          // Insert at the end of suggestion-box-container
          const container = document.querySelector('.suggestion-box-container');
          if (container) {
            container.appendChild(loginPrompt);
          }
        }
      }
      
      // Add CSS styles for the login prompt
      if (!document.getElementById('suggestion-login-styles')) {
        const style = document.createElement('style');
        style.id = 'suggestion-login-styles';
        style.textContent = `
          .suggestion-login-prompt {
            background: linear-gradient(135deg, rgba(88, 101, 242, 0.1), rgba(88, 101, 242, 0.05));
            border: 2px solid rgba(88, 101, 242, 0.3);
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
            color: #5865F2;
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
            border-top: 1px solid rgba(88, 101, 242, 0.2);
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
      if (suggestionFormWrapper) {
        suggestionFormWrapper.style.display = 'block';
      }
      
      const loginPrompt = document.getElementById('suggestion-login-prompt');
      if (loginPrompt) {
        loginPrompt.remove();
      }
      
      // Update submit button
      const submitBtn = suggestionForm.querySelector('.submit-suggestion-btn');
      if (submitBtn) {
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> <span class="btn-text">Submit Suggestion</span>';
        submitBtn.style.opacity = '1';
        submitBtn.title = 'Submit your suggestion';
      }
    }
  }

  // Refresh authentication status (called after login)
  function refreshAuthStatus() {
    if (suggestionForm) {
      checkAuthenticationStatus().then(authStatus => {
        updateSuggestionBoxUI(authStatus);
      });
    }
  }

  // Public API
  return {
    init: init,
    handleSubmit: handleSubmit,
    handleReset: handleReset,
    updateCharCount: updateCharCount,
    showModal: showModal,
    hideModal: hideModal,
    refreshAuthStatus: refreshAuthStatus
  };
})();

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
  suggestionsModule.init();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = suggestionsModule;
}
