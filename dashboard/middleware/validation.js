// ============================================================================
// ------------------- Validation Middleware -------------------
// Reusable validation middleware for common patterns
// ============================================================================

const { ObjectId } = require('mongodb');
const logger = require('../utils/logger.js');

// ------------------- Function: validateObjectId -------------------
// Validates that a parameter is a valid MongoDB ObjectId
function validateObjectId(paramName = 'id') {
  return (req, res, next) => {
    const id = req.params[paramName];
    
    if (!id) {
      return res.status(400).json({ 
        error: 'Missing required parameter',
        field: paramName 
      });
    }
    
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ 
        error: 'Invalid ID format',
        field: paramName 
      });
    }
    
    next();
  };
}

// ------------------- Function: validateRequiredFields -------------------
// Validates that required fields are present in request body
function validateRequiredFields(fields) {
  return (req, res, next) => {
    const missing = [];
    
    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        missing.push(field);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        fields: missing 
      });
    }
    
    next();
  };
}

// ------------------- Function: validateStringLength -------------------
// Validates string length constraints
function validateStringLength(field, minLength = 0, maxLength = Infinity) {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined && value !== null) {
      if (typeof value !== 'string') {
        return res.status(400).json({ 
          error: 'Invalid field type',
          field: field,
          expected: 'string'
        });
      }
      
      if (value.length < minLength) {
        return res.status(400).json({ 
          error: 'Field too short',
          field: field,
          minLength: minLength
        });
      }
      
      if (value.length > maxLength) {
        return res.status(400).json({ 
          error: 'Field too long',
          field: field,
          maxLength: maxLength
        });
      }
    }
    
    next();
  };
}

// ------------------- Function: validateNumberRange -------------------
// Validates number is within specified range
function validateNumberRange(field, min = -Infinity, max = Infinity) {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined && value !== null) {
      const num = Number(value);
      
      if (isNaN(num)) {
        return res.status(400).json({ 
          error: 'Invalid number format',
          field: field
        });
      }
      
      if (num < min || num > max) {
        return res.status(400).json({ 
          error: 'Number out of range',
          field: field,
          min: min,
          max: max
        });
      }
    }
    
    next();
  };
}

// ------------------- Function: validateEnum -------------------
// Validates that a field value is one of the allowed values
function validateEnum(field, allowedValues) {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined && value !== null) {
      if (!allowedValues.includes(value)) {
        return res.status(400).json({ 
          error: 'Invalid value',
          field: field,
          allowedValues: allowedValues
        });
      }
    }
    
    next();
  };
}

// ------------------- Function: validateArray -------------------
// Validates that a field is an array with optional constraints
function validateArray(field, minLength = 0, maxLength = Infinity) {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined && value !== null) {
      if (!Array.isArray(value)) {
        return res.status(400).json({ 
          error: 'Field must be an array',
          field: field
        });
      }
      
      if (value.length < minLength) {
        return res.status(400).json({ 
          error: 'Array too short',
          field: field,
          minLength: minLength
        });
      }
      
      if (value.length > maxLength) {
        return res.status(400).json({ 
          error: 'Array too long',
          field: field,
          maxLength: maxLength
        });
      }
    }
    
    next();
  };
}

// ------------------- Function: validateEmail -------------------
// Validates email format
function validateEmail(field = 'email') {
  return (req, res, next) => {
    const value = req.body[field];
    
    if (value !== undefined && value !== null) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return res.status(400).json({ 
          error: 'Invalid email format',
          field: field
        });
      }
    }
    
    next();
  };
}

// ------------------- Function: validateQueryParams -------------------
// Validates query parameters
function validateQueryParams(requiredParams = [], optionalParams = {}) {
  return (req, res, next) => {
    const missing = [];
    
    // Check required params
    for (const param of requiredParams) {
      if (req.query[param] === undefined || req.query[param] === null || req.query[param] === '') {
        missing.push(param);
      }
    }
    
    if (missing.length > 0) {
      return res.status(400).json({ 
        error: 'Missing required query parameters',
        params: missing 
      });
    }
    
    // Validate optional params if provided
    for (const [param, validator] of Object.entries(optionalParams)) {
      if (req.query[param] !== undefined && req.query[param] !== null) {
        try {
          validator(req.query[param]);
        } catch (error) {
          return res.status(400).json({ 
            error: 'Invalid query parameter',
            param: param,
            message: error.message
          });
        }
      }
    }
    
    next();
  };
}

// ------------------- Function: sanitizeInput -------------------
// Basic input sanitization to prevent XSS
function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Remove potential script tags and dangerous patterns
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitize(obj[key]);
      }
    }
  };
  
  if (req.body) sanitize(req.body);
  if (req.query) sanitize(req.query);
  
  next();
}

module.exports = {
  validateObjectId,
  validateRequiredFields,
  validateStringLength,
  validateNumberRange,
  validateEnum,
  validateArray,
  validateEmail,
  validateQueryParams,
  sanitizeInput
};






