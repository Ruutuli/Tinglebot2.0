// Form validation and utility functions

function validateForm(formData) {
    const errors = {};
    
    // Validate required fields
    for (const [key, value] of formData.entries()) {
        if (!value && value !== 0) {
            errors[key] = 'This field is required';
        }
    }
    
    // Add specific validation rules here
    if (formData.get('email') && !isValidEmail(formData.get('email'))) {
        errors.email = 'Invalid email format';
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function renderLocationTags(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.map(tag => `<span class="location-tag">${tag}</span>`).join('');
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = options.map(option => `
        <option value="${option.value}">${option.label}</option>
    `).join('');
}

function setDefaultUserInfo() {
    const defaultInfo = {
        name: 'Guest',
        level: 1,
        village: 'Unknown'
    };
    
    updateUserInfo(defaultInfo);
}

function updateUserInfo(user) {
    const nameElement = document.getElementById('user-name');
    const levelElement = document.getElementById('user-level');
    const villageElement = document.getElementById('user-village');
    
    if (nameElement) nameElement.textContent = user.name;
    if (levelElement) levelElement.textContent = `Level ${user.level}`;
    if (villageElement) villageElement.textContent = user.village;
}

export {
    validateForm,
    isValidEmail,
    renderLocationTags,
    populateSelect,
    setDefaultUserInfo,
    updateUserInfo
}; 