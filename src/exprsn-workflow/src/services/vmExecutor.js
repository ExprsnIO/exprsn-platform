const vm = require('vm');
const logger = require('../utils/logger');

class VMExecutor {
  constructor() {
    this.defaultTimeout = parseInt(process.env.WORKFLOW_VM_TIMEOUT, 10) || 30000;
    this.maxMemory = parseInt(process.env.WORKFLOW_VM_MAX_MEMORY, 10) || 128; // MB
    this.enabled = process.env.WORKFLOW_ENABLE_VM_EXECUTION !== 'false';
  }

  /**
   * Create a hardened sandbox context
   * NOTE: Node.js vm module is NOT a security boundary. This provides defense-in-depth
   * but should not be relied upon for untrusted code execution in production.
   */
  _createSandbox(context = {}) {
    // Create a null-prototype object to prevent prototype pollution
    const sandbox = Object.create(null);

    // Provide safe console implementation
    sandbox.console = {
      log: (...args) => logger.debug('VM console.log:', ...args),
      info: (...args) => logger.info('VM console.info:', ...args),
      warn: (...args) => logger.warn('VM console.warn:', ...args),
      error: (...args) => logger.error('VM console.error:', ...args)
    };

    // Provide frozen safe built-ins
    sandbox.JSON = Object.freeze({ ...JSON });
    sandbox.Math = Object.freeze({ ...Math });
    sandbox.Date = Date;
    sandbox.Array = Array;
    sandbox.Object = Object;
    sandbox.String = String;
    sandbox.Number = Number;
    sandbox.Boolean = Boolean;
    sandbox.RegExp = RegExp;
    sandbox.Error = Error;
    sandbox.TypeError = TypeError;
    sandbox.RangeError = RangeError;
    sandbox.isNaN = isNaN;
    sandbox.isFinite = isFinite;
    sandbox.parseInt = parseInt;
    sandbox.parseFloat = parseFloat;

    // Copy user context with deep cloning to prevent reference leakage
    for (const [key, value] of Object.entries(context)) {
      try {
        // Deep clone to prevent reference leakage
        sandbox[key] = JSON.parse(JSON.stringify(value));
      } catch (error) {
        // If value is not JSON-serializable, skip it
        logger.warn(`Skipping non-serializable context value: ${key}`);
      }
    }

    // Explicitly block dangerous globals
    sandbox.require = undefined;
    sandbox.module = undefined;
    sandbox.exports = undefined;
    sandbox.process = undefined;
    sandbox.global = undefined;
    sandbox.globalThis = undefined;
    sandbox.__dirname = undefined;
    sandbox.__filename = undefined;
    sandbox.setTimeout = undefined;
    sandbox.setInterval = undefined;
    sandbox.setImmediate = undefined;
    sandbox.clearTimeout = undefined;
    sandbox.clearInterval = undefined;
    sandbox.clearImmediate = undefined;
    sandbox.Buffer = undefined;
    sandbox.eval = undefined;
    sandbox.Function = undefined;

    return sandbox;
  }

  /**
   * Execute JavaScript code in sandboxed VM
   */
  async execute(code, context = {}, options = {}) {
    if (!this.enabled) {
      throw new Error('VM execution is disabled');
    }

    const {
      timeout = this.defaultTimeout
    } = options;

    const startTime = Date.now();
    let memoryUsageBefore = null;
    let memoryUsageAfter = null;

    try {
      // Track memory usage before execution
      if (global.gc) {
        global.gc();
      }
      memoryUsageBefore = process.memoryUsage();

      // Create hardened sandbox
      const sandbox = this._createSandbox(context);

      // Wrap code to capture return value safely
      const wrappedCode = `
        'use strict';
        (function() {
          try {
            ${code}
          } catch (error) {
            throw new Error('Execution error: ' + error.message);
          }
        })();
      `;

      // Compile script
      const script = new vm.Script(wrappedCode, {
        filename: 'workflow-vm-script.js',
        displayErrors: true,
        timeout: timeout
      });

      // Create context from sandbox
      const vmContext = vm.createContext(sandbox, {
        name: 'workflow-sandbox',
        codeGeneration: {
          strings: false, // Disable eval() and new Function()
          wasm: false     // Disable WebAssembly
        }
      });

      // Execute with timeout
      const result = script.runInContext(vmContext, {
        timeout: timeout,
        displayErrors: true,
        breakOnSigint: true
      });

      // Track memory usage after execution
      memoryUsageAfter = process.memoryUsage();
      const memoryDelta = memoryUsageAfter.heapUsed - memoryUsageBefore.heapUsed;

      const executionTime = Date.now() - startTime;

      logger.debug('VM execution completed', {
        hasResult: result !== undefined,
        resultType: typeof result,
        executionTime: `${executionTime}ms`,
        memoryDelta: `${Math.round(memoryDelta / 1024)}KB`
      });

      // Clone result to prevent reference leakage
      let safeResult;
      try {
        safeResult = JSON.parse(JSON.stringify(result));
      } catch (error) {
        // If result is not JSON-serializable, return primitive representation
        safeResult = String(result);
      }

      return {
        success: true,
        result: safeResult,
        executionTime,
        memoryDelta,
        logs: []
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error('VM execution failed', {
        error: error.message,
        stack: error.stack,
        executionTime: `${executionTime}ms`
      });

      // Detect timeout errors
      const isTimeout = error.message && (
        error.message.includes('timeout') ||
        error.message.includes('Script execution timed out')
      );

      return {
        success: false,
        error: isTimeout ? 'Execution timeout exceeded' : error.message,
        timeout: isTimeout,
        executionTime,
        logs: []
      };
    }
  }

  /**
   * Execute JavaScript expression (returns value)
   */
  async executeExpression(expression, context = {}, options = {}) {
    const code = `return ${expression};`;
    return await this.execute(code, context, options);
  }

  /**
   * Validate JavaScript code syntax
   */
  validateSyntax(code) {
    try {
      new vm.Script(code);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
        line: error.stack ? this._extractLineNumber(error.stack) : null
      };
    }
  }

  /**
   * Extract line number from error stack
   */
  _extractLineNumber(stack) {
    const match = stack.match(/:(\d+):(\d+)/);
    return match ? { line: parseInt(match[1]), column: parseInt(match[2]) } : null;
  }

  /**
   * Execute data transformation
   */
  async transform(data, transformCode, options = {}) {
    const code = `
      const input = ${JSON.stringify(data)};
      let output;

      ${transformCode}

      return output;
    `;

    const result = await this.execute(code, {}, options);

    if (result.success) {
      return {
        success: true,
        data: result.result,
        executionTime: result.executionTime
      };
    }

    return result;
  }

  /**
   * Execute field mapping
   */
  async mapFields(sourceData, mappings, options = {}) {
    // Escape field names and build mapping code
    const mappingCode = Object.entries(mappings)
      .map(([targetField, sourceExpression]) => {
        const escapedField = targetField.replace(/'/g, "\\'");
        return `target['${escapedField}'] = ${sourceExpression};`;
      })
      .join('\n');

    const code = `
      const source = ${JSON.stringify(sourceData)};
      const target = {};

      ${mappingCode}

      return target;
    `;

    const result = await this.execute(code, {}, options);

    if (result.success) {
      return {
        success: true,
        data: result.result,
        executionTime: result.executionTime
      };
    }

    return result;
  }

  /**
   * Execute condition evaluation
   */
  async evaluateCondition(condition, context = {}, options = {}) {
    const code = `
      return Boolean(${condition});
    `;

    const result = await this.execute(code, context, {
      ...options,
      timeout: options.timeout || 5000 // Shorter timeout for conditions
    });

    if (result.success) {
      return {
        success: true,
        result: Boolean(result.result),
        executionTime: result.executionTime
      };
    }

    return result;
  }

  /**
   * Execute multiple conditions (switch/case logic)
   */
  async evaluateConditions(conditions, context = {}, options = {}) {
    const results = {};
    const timings = {};

    for (const [key, condition] of Object.entries(conditions)) {
      const result = await this.evaluateCondition(condition, context, options);

      if (result.success) {
        results[key] = result.result;
        timings[key] = result.executionTime;
      } else {
        results[key] = false;
        logger.warn(`Condition evaluation failed for ${key}:`, result.error);
      }
    }

    return {
      success: true,
      results,
      timings
    };
  }

  /**
   * Execute aggregation/computation
   */
  async compute(data, computeCode, options = {}) {
    const code = `
      const data = ${JSON.stringify(data)};
      let result;

      ${computeCode}

      return result;
    `;

    const result = await this.execute(code, {}, options);

    if (result.success) {
      return {
        success: true,
        result: result.result,
        executionTime: result.executionTime
      };
    }

    return result;
  }

  /**
   * Safe function to get nested property value
   */
  getNestedValue(obj, path) {
    return path.split('.').reduce((current, prop) => {
      return current?.[prop];
    }, obj);
  }

  /**
   * Safe function to set nested property value
   */
  setNestedValue(obj, path, value) {
    const parts = path.split('.');
    const last = parts.pop();
    const target = parts.reduce((current, prop) => {
      if (!current[prop]) current[prop] = {};
      return current[prop];
    }, obj);
    target[last] = value;
    return obj;
  }

  /**
   * Get current memory usage statistics
   */
  getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
      external: Math.round(usage.external / 1024 / 1024) + ' MB',
      rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024) + ' MB'
    };
  }

  /**
   * Execute code with resource monitoring
   */
  async executeWithMonitoring(code, context = {}, options = {}) {
    const startMemory = process.memoryUsage();
    const startTime = Date.now();

    const result = await this.execute(code, context, options);

    const endMemory = process.memoryUsage();
    const endTime = Date.now();

    return {
      ...result,
      monitoring: {
        executionTime: endTime - startTime,
        memoryDelta: {
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          heapTotal: endMemory.heapTotal - startMemory.heapTotal,
          external: endMemory.external - startMemory.external
        }
      }
    };
  }
}

// Security warning in logs
logger.warn('⚠️  VM Executor Security Notice: Node.js vm module is NOT a security boundary.');
logger.warn('⚠️  Do not execute untrusted code in production. Consider using isolated-vm with compatible Node.js version.');
logger.warn('⚠️  See RECOMMENDATIONS.md for security best practices.');

module.exports = new VMExecutor();
