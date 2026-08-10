const jsonata = require('jsonata');
const Joi = require('joi');
const logger = require('../../utils/logger');

class JSONLexService {
  constructor() {
    this.enabled = process.env.JSONLEX_ENABLED !== 'false';
    this.strictValidation = process.env.JSONLEX_VALIDATION_STRICT === 'true';
  }

  /**
   * Validate data against JSONLex schema
   */
  async validate(data, schema) {
    if (!this.enabled) {
      return { valid: true, data };
    }

    try {
      // Convert JSONLex schema to Joi schema
      const joiSchema = this.convertToJoiSchema(schema);

      // Validate data
      const { error, value } = joiSchema.validate(data, {
        abortEarly: !this.strictValidation,
        allowUnknown: !this.strictValidation
      });

      if (error) {
        return {
          valid: false,
          errors: error.details.map(detail => ({
            path: detail.path.join('.'),
            message: detail.message,
            type: detail.type
          }))
        };
      }

      return {
        valid: true,
        data: value
      };
    } catch (error) {
      logger.error('JSONLex validation error', { error: error.message });
      return {
        valid: false,
        errors: [{ message: error.message }]
      };
    }
  }

  /**
   * Convert JSONLex schema to Joi schema
   */
  convertToJoiSchema(schema) {
    if (!schema || typeof schema !== 'object') {
      return Joi.any();
    }

    const type = schema.type || 'object';

    switch (type) {
      case 'object':
        return this.buildObjectSchema(schema);
      case 'array':
        return this.buildArraySchema(schema);
      case 'string':
        return this.buildStringSchema(schema);
      case 'number':
      case 'integer':
        return this.buildNumberSchema(schema);
      case 'boolean':
        return Joi.boolean();
      case 'any':
        return Joi.any();
      default:
        return Joi.any();
    }
  }

  /**
   * Build object schema
   */
  buildObjectSchema(schema) {
    let joiSchema = Joi.object();

    if (schema.properties) {
      const schemaMap = {};

      for (const [key, propSchema] of Object.entries(schema.properties)) {
        schemaMap[key] = this.convertToJoiSchema(propSchema);
      }

      joiSchema = joiSchema.keys(schemaMap);
    }

    if (schema.required && Array.isArray(schema.required)) {
      const requiredKeys = {};
      for (const key of schema.required) {
        requiredKeys[key] = Joi.any().required();
      }
      joiSchema = joiSchema.keys(requiredKeys);
    }

    if (schema.additionalProperties === false) {
      joiSchema = joiSchema.unknown(false);
    }

    return joiSchema;
  }

  /**
   * Build array schema
   */
  buildArraySchema(schema) {
    let joiSchema = Joi.array();

    if (schema.items) {
      joiSchema = joiSchema.items(this.convertToJoiSchema(schema.items));
    }

    if (schema.minItems !== undefined) {
      joiSchema = joiSchema.min(schema.minItems);
    }

    if (schema.maxItems !== undefined) {
      joiSchema = joiSchema.max(schema.maxItems);
    }

    if (schema.uniqueItems) {
      joiSchema = joiSchema.unique();
    }

    return joiSchema;
  }

  /**
   * Build string schema
   */
  buildStringSchema(schema) {
    let joiSchema = Joi.string();

    if (schema.minLength !== undefined) {
      joiSchema = joiSchema.min(schema.minLength);
    }

    if (schema.maxLength !== undefined) {
      joiSchema = joiSchema.max(schema.maxLength);
    }

    if (schema.pattern) {
      joiSchema = joiSchema.pattern(new RegExp(schema.pattern));
    }

    if (schema.format) {
      switch (schema.format) {
        case 'email':
          joiSchema = joiSchema.email();
          break;
        case 'uri':
        case 'url':
          joiSchema = joiSchema.uri();
          break;
        case 'uuid':
          joiSchema = joiSchema.uuid();
          break;
        case 'date':
        case 'date-time':
          joiSchema = joiSchema.isoDate();
          break;
      }
    }

    if (schema.enum && Array.isArray(schema.enum)) {
      joiSchema = joiSchema.valid(...schema.enum);
    }

    return joiSchema;
  }

  /**
   * Build number schema
   */
  buildNumberSchema(schema) {
    let joiSchema = schema.type === 'integer' ? Joi.number().integer() : Joi.number();

    if (schema.minimum !== undefined) {
      joiSchema = joiSchema.min(schema.minimum);
    }

    if (schema.maximum !== undefined) {
      joiSchema = joiSchema.max(schema.maximum);
    }

    if (schema.exclusiveMinimum !== undefined) {
      joiSchema = joiSchema.greater(schema.exclusiveMinimum);
    }

    if (schema.exclusiveMaximum !== undefined) {
      joiSchema = joiSchema.less(schema.exclusiveMaximum);
    }

    if (schema.multipleOf !== undefined) {
      joiSchema = joiSchema.multiple(schema.multipleOf);
    }

    return joiSchema;
  }

  /**
   * Transform data using JSONata expression
   */
  async transform(data, expression) {
    try {
      const compiled = jsonata(expression);
      const result = await compiled.evaluate(data);

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.error('JSONata transformation error', {
        error: error.message,
        expression
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate and transform in one operation
   */
  async validateAndTransform(data, schema, transformExpression) {
    // First validate
    const validationResult = await this.validate(data, schema);

    if (!validationResult.valid) {
      return {
        success: false,
        errors: validationResult.errors
      };
    }

    // Then transform
    if (transformExpression) {
      return await this.transform(validationResult.data, transformExpression);
    }

    return {
      success: true,
      data: validationResult.data
    };
  }

  /**
   * Create schema from sample data
   */
  inferSchema(data) {
    if (data === null || data === undefined) {
      return { type: 'any' };
    }

    const type = Array.isArray(data) ? 'array' : typeof data;

    switch (type) {
      case 'object':
        const properties = {};
        for (const [key, value] of Object.entries(data)) {
          properties[key] = this.inferSchema(value);
        }
        return {
          type: 'object',
          properties
        };

      case 'array':
        if (data.length > 0) {
          return {
            type: 'array',
            items: this.inferSchema(data[0])
          };
        }
        return { type: 'array' };

      case 'string':
        return { type: 'string' };

      case 'number':
        return {
          type: Number.isInteger(data) ? 'integer' : 'number'
        };

      case 'boolean':
        return { type: 'boolean' };

      default:
        return { type: 'any' };
    }
  }
}

module.exports = new JSONLexService();
