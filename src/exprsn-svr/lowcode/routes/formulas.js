/**
 * ═══════════════════════════════════════════════════════════
 * Formula Evaluation API
 * Server-side formula evaluation for complex expressions
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const FormulaEngine = require('../engine/FormulaEngine');
const Joi = require('joi');

/**
 * Evaluate a formula expression
 * POST /api/formulas/evaluate
 */
router.post('/evaluate', async (req, res) => {
  try {
    // Validate request
    const schema = Joi.object({
      formula: Joi.string().required(),
      context: Joi.object().optional(),
      collections: Joi.object().optional(),
      variables: Joi.object().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { formula, context = {}, collections = {}, variables = {} } = value;

    // Create formula engine instance
    const engine = new FormulaEngine();

    // Set context
    engine.setContext(context);

    // Set collections
    if (Object.keys(collections).length > 0) {
      engine.setCollections(collections);
    }

    // Set variables
    Object.keys(variables).forEach(key => {
      engine.variables.set(key, variables[key]);
    });

    // Evaluate formula
    const result = engine.evaluate(formula);

    res.json({
      success: true,
      data: {
        formula,
        result,
        type: typeof result
      }
    });

  } catch (error) {
    console.error('Formula evaluation error:', error);
    res.status(500).json({
      success: false,
      error: 'EVALUATION_ERROR',
      message: error.message
    });
  }
});

/**
 * Batch evaluate multiple formulas
 * POST /api/formulas/evaluate-batch
 */
router.post('/evaluate-batch', async (req, res) => {
  try {
    const schema = Joi.object({
      formulas: Joi.array().items(Joi.object({
        id: Joi.string().required(),
        formula: Joi.string().required()
      })).required(),
      context: Joi.object().optional(),
      collections: Joi.object().optional(),
      variables: Joi.object().optional()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { formulas, context = {}, collections = {}, variables = {} } = value;

    // Create formula engine instance
    const engine = new FormulaEngine();
    engine.setContext(context);

    if (Object.keys(collections).length > 0) {
      engine.setCollections(collections);
    }

    Object.keys(variables).forEach(key => {
      engine.variables.set(key, variables[key]);
    });

    // Evaluate all formulas
    const results = {};
    const errors = {};

    for (const item of formulas) {
      try {
        results[item.id] = engine.evaluate(item.formula);
      } catch (err) {
        errors[item.id] = err.message;
        results[item.id] = null;
      }
    }

    res.json({
      success: true,
      data: {
        results,
        errors: Object.keys(errors).length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Batch evaluation error:', error);
    res.status(500).json({
      success: false,
      error: 'EVALUATION_ERROR',
      message: error.message
    });
  }
});

/**
 * Validate formula syntax
 * POST /api/formulas/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const schema = Joi.object({
      formula: Joi.string().required()
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { formula } = value;

    // Create formula engine and try to parse
    const engine = new FormulaEngine();

    try {
      // Just parse, don't evaluate
      engine.parser.parse(formula);

      res.json({
        success: true,
        data: {
          valid: true,
          formula
        }
      });
    } catch (parseError) {
      res.json({
        success: true,
        data: {
          valid: false,
          formula,
          error: parseError.message
        }
      });
    }

  } catch (error) {
    console.error('Formula validation error:', error);
    res.status(500).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message
    });
  }
});

/**
 * Get list of available functions
 * GET /api/formulas/functions
 */
router.get('/functions', (req, res) => {
  const engine = new FormulaEngine();
  const functions = engine.getBuiltInFunctions();

  const functionList = Object.keys(functions).map(name => ({
    name,
    category: getFunctionCategory(name)
  }));

  res.json({
    success: true,
    data: {
      count: functionList.length,
      functions: functionList
    }
  });
});

/**
 * Helper: Categorize functions
 */
function getFunctionCategory(funcName) {
  const categories = {
    data: ['Filter', 'LookUp', 'Sort', 'CountRows', 'Sum', 'Average', 'Min', 'Max', 'Distinct', 'First', 'Last'],
    text: ['Text', 'Concatenate', 'Upper', 'Lower', 'Trim', 'Left', 'Right', 'Mid', 'Len', 'Replace', 'Substitute', 'Split'],
    logic: ['If', 'Switch', 'And', 'Or', 'Not'],
    math: ['Round', 'RoundUp', 'RoundDown', 'Abs', 'Sqrt', 'Power', 'Exp', 'Ln', 'Log', 'Mod'],
    datetime: ['Now', 'Today', 'Year', 'Month', 'Day', 'Hour', 'Minute', 'Second', 'DateAdd', 'DateDiff'],
    conversion: ['Value', 'Boolean'],
    collection: ['ClearCollect', 'Collect', 'Clear'],
    validation: ['IsBlank', 'IsEmpty', 'IsError', 'IsNumeric']
  };

  for (const [category, funcs] of Object.entries(categories)) {
    if (funcs.includes(funcName)) {
      return category;
    }
  }

  return 'other';
}

module.exports = router;
