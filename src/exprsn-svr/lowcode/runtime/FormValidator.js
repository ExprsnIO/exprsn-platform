/**
 * Form Validator
 *
 * Validates form submissions based on control properties and validation rules.
 */

class FormValidator {
  /**
   * Validate form values
   */
  async validate(formDefinition, values, formulaEngine) {
    const errors = [];

    // Validate individual controls
    for (const control of formDefinition.controls) {
      const controlErrors = await this.validateControl(control, values, formulaEngine);
      errors.push(...controlErrors);
    }

    // Validate custom validation rules
    if (formDefinition.validationRules) {
      const ruleErrors = await this.validateRules(formDefinition.validationRules, values, formulaEngine);
      errors.push(...ruleErrors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate single control
   */
  async validateControl(control, values, formulaEngine) {
    const errors = [];
    const value = values[control.name];
    const props = control.props || {};

    // Required validation
    if (props.required && this.isEmpty(value)) {
      errors.push({
        field: control.name,
        type: 'required',
        message: `${props.label || control.name} is required`
      });
      return errors; // Skip other validations if required fails
    }

    // Skip other validations if value is empty and not required
    if (this.isEmpty(value) && !props.required) {
      return errors;
    }

    // Type-specific validations
    switch (control.type) {
      case 'textinput':
      case 'textarea':
        errors.push(...this.validateText(control, value, props));
        break;

      case 'email':
        errors.push(...this.validateEmail(control, value, props));
        break;

      case 'number':
        errors.push(...this.validateNumber(control, value, props));
        break;

      case 'password':
        errors.push(...this.validatePassword(control, value, props));
        break;

      case 'date':
        errors.push(...this.validateDate(control, value, props));
        break;

      case 'time':
        errors.push(...this.validateTime(control, value, props));
        break;

      case 'select':
      case 'radio':
        errors.push(...this.validateSelection(control, value, props));
        break;

      case 'file':
        errors.push(...this.validateFile(control, value, props));
        break;
    }

    // Custom validation formula
    if (control.validation?.formula && formulaEngine) {
      try {
        const isValid = formulaEngine.evaluate(control.validation.formula, {
          value,
          values
        });

        if (!isValid) {
          errors.push({
            field: control.name,
            type: 'custom',
            message: control.validation.message || `${props.label || control.name} is invalid`
          });
        }
      } catch (error) {
        console.error(`Validation formula error for ${control.name}:`, error);
      }
    }

    return errors;
  }

  /**
   * Validate custom validation rules
   */
  async validateRules(rules, values, formulaEngine) {
    const errors = [];

    for (const rule of rules) {
      try {
        const isValid = formulaEngine.evaluate(rule.formula, { values });

        if (!isValid) {
          errors.push({
            field: rule.field || null,
            type: 'rule',
            message: rule.message || 'Validation rule failed'
          });
        }
      } catch (error) {
        console.error('Validation rule error:', error);
      }
    }

    return errors;
  }

  /**
   * Validate text input
   */
  validateText(control, value, props) {
    const errors = [];
    const str = String(value || '');

    // Min length
    if (props.minLength && str.length < props.minLength) {
      errors.push({
        field: control.name,
        type: 'minLength',
        message: `${props.label || control.name} must be at least ${props.minLength} characters`
      });
    }

    // Max length
    if (props.maxLength && str.length > props.maxLength) {
      errors.push({
        field: control.name,
        type: 'maxLength',
        message: `${props.label || control.name} must not exceed ${props.maxLength} characters`
      });
    }

    // Pattern
    if (props.pattern) {
      const regex = new RegExp(props.pattern);
      if (!regex.test(str)) {
        errors.push({
          field: control.name,
          type: 'pattern',
          message: props.patternMessage || `${props.label || control.name} format is invalid`
        });
      }
    }

    return errors;
  }

  /**
   * Validate email
   */
  validateEmail(control, value, props) {
    const errors = [];

    // Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errors.push({
        field: control.name,
        type: 'email',
        message: `${props.label || control.name} must be a valid email address`
      });
    }

    return errors;
  }

  /**
   * Validate number
   */
  validateNumber(control, value, props) {
    const errors = [];
    const num = Number(value);

    // Is number
    if (isNaN(num)) {
      errors.push({
        field: control.name,
        type: 'number',
        message: `${props.label || control.name} must be a valid number`
      });
      return errors;
    }

    // Min value
    if (props.min !== undefined && props.min !== null && num < props.min) {
      errors.push({
        field: control.name,
        type: 'min',
        message: `${props.label || control.name} must be at least ${props.min}`
      });
    }

    // Max value
    if (props.max !== undefined && props.max !== null && num > props.max) {
      errors.push({
        field: control.name,
        type: 'max',
        message: `${props.label || control.name} must not exceed ${props.max}`
      });
    }

    // Step
    if (props.step && num % props.step !== 0) {
      errors.push({
        field: control.name,
        type: 'step',
        message: `${props.label || control.name} must be a multiple of ${props.step}`
      });
    }

    return errors;
  }

  /**
   * Validate password
   */
  validatePassword(control, value, props) {
    const errors = [];
    const str = String(value || '');

    // Min length
    if (props.minLength && str.length < props.minLength) {
      errors.push({
        field: control.name,
        type: 'minLength',
        message: `Password must be at least ${props.minLength} characters`
      });
    }

    // Require uppercase
    if (props.requireUppercase && !/[A-Z]/.test(str)) {
      errors.push({
        field: control.name,
        type: 'uppercase',
        message: 'Password must contain at least one uppercase letter'
      });
    }

    // Require lowercase
    if (props.requireLowercase && !/[a-z]/.test(str)) {
      errors.push({
        field: control.name,
        type: 'lowercase',
        message: 'Password must contain at least one lowercase letter'
      });
    }

    // Require number
    if (props.requireNumber && !/[0-9]/.test(str)) {
      errors.push({
        field: control.name,
        type: 'number',
        message: 'Password must contain at least one number'
      });
    }

    // Require special char
    if (props.requireSpecialChar && !/[!@#$%^&*(),.?":{}|<>]/.test(str)) {
      errors.push({
        field: control.name,
        type: 'specialChar',
        message: 'Password must contain at least one special character'
      });
    }

    return errors;
  }

  /**
   * Validate date
   */
  validateDate(control, value, props) {
    const errors = [];

    // Is valid date
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      errors.push({
        field: control.name,
        type: 'date',
        message: `${props.label || control.name} must be a valid date`
      });
      return errors;
    }

    // Min date
    if (props.min) {
      const minDate = new Date(props.min);
      if (date < minDate) {
        errors.push({
          field: control.name,
          type: 'min',
          message: `${props.label || control.name} must be on or after ${minDate.toLocaleDateString()}`
        });
      }
    }

    // Max date
    if (props.max) {
      const maxDate = new Date(props.max);
      if (date > maxDate) {
        errors.push({
          field: control.name,
          type: 'max',
          message: `${props.label || control.name} must be on or before ${maxDate.toLocaleDateString()}`
        });
      }
    }

    return errors;
  }

  /**
   * Validate time
   */
  validateTime(control, value, props) {
    const errors = [];

    // Time format (HH:MM or HH:MM:SS)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;
    if (!timeRegex.test(value)) {
      errors.push({
        field: control.name,
        type: 'time',
        message: `${props.label || control.name} must be a valid time (HH:MM)`
      });
    }

    return errors;
  }

  /**
   * Validate selection (select, radio)
   */
  validateSelection(control, value, props) {
    const errors = [];

    // Valid option
    if (props.options) {
      const validValues = props.options.map(opt => opt.value);
      if (!validValues.includes(value)) {
        errors.push({
          field: control.name,
          type: 'option',
          message: `${props.label || control.name} must be a valid option`
        });
      }
    }

    return errors;
  }

  /**
   * Validate file
   */
  validateFile(control, value, props) {
    const errors = [];

    // Assume value is a File object or array of File objects
    const files = Array.isArray(value) ? value : [value];

    for (const file of files) {
      if (!file) continue;

      // File size
      if (props.maxSize && file.size > props.maxSize) {
        errors.push({
          field: control.name,
          type: 'fileSize',
          message: `File "${file.name}" exceeds maximum size of ${this.formatFileSize(props.maxSize)}`
        });
      }

      // File type
      if (props.accept && props.accept !== '*/*') {
        const acceptedTypes = props.accept.split(',').map(t => t.trim());
        const fileType = file.type || '';
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();

        const isAccepted = acceptedTypes.some(acceptType => {
          if (acceptType.endsWith('/*')) {
            // Wildcard type (e.g., image/*)
            const baseType = acceptType.split('/')[0];
            return fileType.startsWith(baseType + '/');
          } else if (acceptType.startsWith('.')) {
            // Extension
            return acceptType.toLowerCase() === fileExt;
          } else {
            // Exact MIME type
            return acceptType === fileType;
          }
        });

        if (!isAccepted) {
          errors.push({
            field: control.name,
            type: 'fileType',
            message: `File "${file.name}" type is not accepted`
          });
        }
      }
    }

    // Multiple files
    if (!props.multiple && files.length > 1) {
      errors.push({
        field: control.name,
        type: 'multiple',
        message: `${props.label || control.name} accepts only one file`
      });
    }

    return errors;
  }

  /**
   * Check if value is empty
   */
  isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' && value.trim() === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }
}

module.exports = FormValidator;
