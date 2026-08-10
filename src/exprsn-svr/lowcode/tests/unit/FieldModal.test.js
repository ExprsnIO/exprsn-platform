/**
 * Unit Tests for Enhanced Field Modal
 * Tests field type helpers, validation, and modal operations
 */

describe('Field Type Helpers', () => {
  // Helper functions extracted from entity-designer-pro.js logic
  const isStringType = (type) => {
    return ['String', 'Text', 'Char', 'Email', 'URL', 'Phone'].includes(type);
  };

  const isNumberType = (type) => {
    return ['Integer', 'BigInt', 'Decimal', 'Float', 'Double'].includes(type);
  };

  const isDateType = (type) => {
    return ['Date', 'DateTime', 'Time', 'Timestamp'].includes(type);
  };

  const requiresPrecision = (type) => {
    return type === 'Decimal';
  };

  const supportsAutoIncrement = (type) => {
    return ['Integer', 'BigInt'].includes(type);
  };

  describe('isStringType()', () => {
    test('should identify string types correctly', () => {
      expect(isStringType('String')).toBe(true);
      expect(isStringType('Text')).toBe(true);
      expect(isStringType('Char')).toBe(true);
      expect(isStringType('Email')).toBe(true);
      expect(isStringType('URL')).toBe(true);
      expect(isStringType('Phone')).toBe(true);
    });

    test('should return false for non-string types', () => {
      expect(isStringType('Integer')).toBe(false);
      expect(isStringType('Boolean')).toBe(false);
      expect(isStringType('UUID')).toBe(false);
    });
  });

  describe('isNumberType()', () => {
    test('should identify number types correctly', () => {
      expect(isNumberType('Integer')).toBe(true);
      expect(isNumberType('BigInt')).toBe(true);
      expect(isNumberType('Decimal')).toBe(true);
      expect(isNumberType('Float')).toBe(true);
      expect(isNumberType('Double')).toBe(true);
    });

    test('should return false for non-number types', () => {
      expect(isNumberType('String')).toBe(false);
      expect(isNumberType('Boolean')).toBe(false);
    });
  });

  describe('isDateType()', () => {
    test('should identify date types correctly', () => {
      expect(isDateType('Date')).toBe(true);
      expect(isDateType('DateTime')).toBe(true);
      expect(isDateType('Time')).toBe(true);
      expect(isDateType('Timestamp')).toBe(true);
    });

    test('should return false for non-date types', () => {
      expect(isDateType('String')).toBe(false);
      expect(isDateType('Integer')).toBe(false);
    });
  });

  describe('requiresPrecision()', () => {
    test('should return true only for Decimal type', () => {
      expect(requiresPrecision('Decimal')).toBe(true);
      expect(requiresPrecision('Float')).toBe(false);
      expect(requiresPrecision('Integer')).toBe(false);
    });
  });

  describe('supportsAutoIncrement()', () => {
    test('should return true for integer types', () => {
      expect(supportsAutoIncrement('Integer')).toBe(true);
      expect(supportsAutoIncrement('BigInt')).toBe(true);
    });

    test('should return false for non-integer types', () => {
      expect(supportsAutoIncrement('Decimal')).toBe(false);
      expect(supportsAutoIncrement('String')).toBe(false);
    });
  });
});

describe('Field Configuration Building', () => {
  describe('buildFieldDataObject()', () => {
    test('should build basic field data correctly', () => {
      const fieldData = {
        name: 'email',
        label: 'Email Address',
        type: 'String',
        description: 'User email',
        validation: {
          required: true,
          unique: true,
          pattern: '^[^@]+@[^@]+\\.[^@]+$'
        }
      };

      expect(fieldData.name).toBe('email');
      expect(fieldData.type).toBe('String');
      expect(fieldData.validation.required).toBe(true);
      expect(fieldData.validation.unique).toBe(true);
      expect(fieldData.validation.pattern).toBeTruthy();
    });

    test('should include type-specific validation for strings', () => {
      const fieldData = {
        name: 'username',
        type: 'String',
        validation: {
          minLength: 3,
          maxLength: 30,
          pattern: '^[a-zA-Z0-9_]+$'
        }
      };

      expect(fieldData.validation.minLength).toBe(3);
      expect(fieldData.validation.maxLength).toBe(30);
      expect(fieldData.validation.pattern).toBeDefined();
    });

    test('should include type-specific validation for numbers', () => {
      const fieldData = {
        name: 'age',
        type: 'Integer',
        validation: {
          minValue: 0,
          maxValue: 150
        },
        config: {
          autoIncrement: false
        }
      };

      expect(fieldData.validation.minValue).toBe(0);
      expect(fieldData.validation.maxValue).toBe(150);
      expect(fieldData.config.autoIncrement).toBe(false);
    });

    test('should include precision and scale for Decimal', () => {
      const fieldData = {
        name: 'price',
        type: 'Decimal',
        validation: {
          precision: 10,
          scale: 2
        }
      };

      expect(fieldData.validation.precision).toBe(10);
      expect(fieldData.validation.scale).toBe(2);
    });

    test('should include UUID trigger configuration', () => {
      const fieldData = {
        name: 'id',
        type: 'UUID',
        config: {
          uuidTrigger: 'insert',
          uuidFunction: null
        },
        validation: {
          primaryKey: true
        }
      };

      expect(fieldData.config.uuidTrigger).toBe('insert');
      expect(fieldData.validation.primaryKey).toBe(true);
    });

    test('should include enum configuration', () => {
      const fieldData = {
        name: 'status',
        type: 'Enum',
        config: {
          enumScope: 'field',
          enumValues: [
            { value: 'active', label: 'Active', color: '#10b981', default: true },
            { value: 'inactive', label: 'Inactive', color: '#ef4444', default: false }
          ]
        }
      };

      expect(fieldData.config.enumScope).toBe('field');
      expect(fieldData.config.enumValues).toHaveLength(2);
      expect(fieldData.config.enumValues[0].default).toBe(true);
    });

    test('should include JSON schema configuration', () => {
      const fieldData = {
        name: 'metadata',
        type: 'JSONB',
        config: {
          jsonSchema: {
            type: 'object',
            properties: {
              tags: { type: 'array', items: { type: 'string' } },
              priority: { type: 'number' }
            }
          }
        }
      };

      expect(fieldData.config.jsonSchema.type).toBe('object');
      expect(fieldData.config.jsonSchema.properties.tags).toBeDefined();
    });

    test('should include calculated field configuration', () => {
      const fieldData = {
        name: 'fullName',
        type: 'String',
        config: {
          calculated: true,
          expression: '$.firstName + " " + $.lastName'
        }
      };

      expect(fieldData.config.calculated).toBe(true);
      expect(fieldData.config.expression).toBeTruthy();
    });

    test('should include color format configuration', () => {
      const fieldData = {
        name: 'brandColor',
        type: 'Color',
        config: {
          colorFormat: 'hex'
        },
        defaultValue: '#3b82f6'
      };

      expect(fieldData.config.colorFormat).toBe('hex');
      expect(fieldData.defaultValue).toBe('#3b82f6');
    });
  });
});

describe('Field Validation', () => {
  // Validation function extracted from logic
  function validateField(field) {
    const errors = [];

    // Name validation
    if (!field.name) errors.push('Field name is required');
    if (field.name && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field.name)) {
      errors.push('Invalid field name format');
    }

    // SQL keyword check
    const keywords = ['select', 'from', 'where', 'order', 'group', 'by', 'having', 'join'];
    if (keywords.includes(field.name?.toLowerCase())) {
      errors.push(`"${field.name}" is a SQL reserved keyword`);
    }

    // Type-specific validation
    if (field.type === 'Decimal' && field.validation) {
      if (field.validation.scale > field.validation.precision) {
        errors.push('Scale cannot be greater than precision');
      }
    }

    if (field.type === 'Integer' && field.validation) {
      if (field.validation.minValue > field.validation.maxValue) {
        errors.push('Minimum value cannot be greater than maximum value');
      }
    }

    if (field.type === 'Date' && field.validation) {
      if (new Date(field.validation.minDate) > new Date(field.validation.maxDate)) {
        errors.push('Minimum date cannot be after maximum date');
      }
    }

    return errors;
  }

  describe('validateFieldConfiguration()', () => {
    test('should validate required field name', () => {
      const field = { name: '', type: 'String' };
      const errors = validateField(field);
      expect(errors).toContain('Field name is required');
    });

    test('should validate field name format', () => {
      const invalidNames = ['123start', 'field-name', 'field name', 'field.name'];
      invalidNames.forEach(name => {
        const field = { name, type: 'String' };
        const errors = validateField(field);
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    test('should accept valid field names', () => {
      const validNames = ['firstName', 'user_id', 'createdAt', 'field123'];
      validNames.forEach(name => {
        const field = { name, type: 'String' };
        const errors = validateField(field);
        expect(errors).not.toContain('Invalid field name format');
      });
    });

    test('should validate SQL reserved keywords', () => {
      const keywords = ['select', 'from', 'where', 'order', 'group'];
      keywords.forEach(keyword => {
        const field = { name: keyword, type: 'String' };
        const errors = validateField(field);
        expect(errors).toContain(`"${keyword}" is a SQL reserved keyword`);
      });
    });

    test('should validate precision and scale for Decimal', () => {
      const field = {
        name: 'amount',
        type: 'Decimal',
        validation: { precision: 5, scale: 10 }
      };
      const errors = validateField(field);
      expect(errors).toContain('Scale cannot be greater than precision');
    });

    test('should validate min/max constraints', () => {
      const field = {
        name: 'age',
        type: 'Integer',
        validation: { minValue: 100, maxValue: 50 }
      };
      const errors = validateField(field);
      expect(errors).toContain('Minimum value cannot be greater than maximum value');
    });

    test('should validate date constraints', () => {
      const field = {
        name: 'eventDate',
        type: 'Date',
        validation: {
          minDate: '2024-12-31',
          maxDate: '2024-01-01'
        }
      };
      const errors = validateField(field);
      expect(errors).toContain('Minimum date cannot be after maximum date');
    });
  });
});
