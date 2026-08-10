/**
 * ═══════════════════════════════════════════════════════════
 * Code Execution Service
 * Sandboxed execution of user JavaScript code
 * ═══════════════════════════════════════════════════════════
 */

const { VM } = require('vm2');
const config = require('../config');
const logger = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

class CodeExecutionService {
  /**
   * Execute JavaScript code in a sandboxed environment
   */
  async executeCode(code, context = {}, options = {}) {
    if (!config.codeExecution.enabled) {
      throw new AppError('Code execution is disabled', 403);
    }

    try {
      const timeout = options.timeout || config.codeExecution.timeout;
      const memoryLimit = options.memoryLimit || config.codeExecution.memoryLimit;

      // Create VM instance with limited access
      const vm = new VM({
        timeout,
        sandbox: {
          ...context,
          console: this.createConsoleMock(),
          setTimeout: undefined,
          setInterval: undefined,
          setImmediate: undefined,
          process: undefined,
          require: undefined,
          module: undefined,
          exports: undefined,
          __dirname: undefined,
          __filename: undefined
        }
      });

      logger.debug('Executing code in sandbox', {
        codeLength: code.length,
        timeout,
        memoryLimit
      });

      const result = vm.run(code);

      logger.debug('Code executed successfully', {
        resultType: typeof result
      });

      return {
        success: true,
        result,
        logs: this.consoleBuffer
      };
    } catch (error) {
      logger.warn('Code execution failed', {
        error: error.message,
        codeLength: code.length
      });

      return {
        success: false,
        error: error.message,
        logs: this.consoleBuffer
      };
    } finally {
      this.consoleBuffer = [];
    }
  }

  /**
   * Execute server-side code for a page
   */
  async executePageCode(page, requestContext = {}) {
    if (!page.server_code) {
      return {};
    }

    const context = {
      page: {
        id: page.id,
        slug: page.slug,
        title: page.title,
        data: page.page_data
      },
      request: {
        query: requestContext.query || {},
        params: requestContext.params || {},
        user: requestContext.user || null
      },
      Date,
      Math,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object
    };

    logger.info('Executing server code for page', {
      pageId: page.id,
      codeLength: page.server_code.length
    });

    const result = await this.executeCode(page.server_code, context, {
      timeout: 3000 // 3 second timeout for page code
    });

    if (!result.success) {
      logger.error('Page server code execution failed', {
        pageId: page.id,
        error: result.error
      });
      return {};
    }

    return result.result || {};
  }

  /**
   * Validate JavaScript syntax
   */
  validateSyntax(code) {
    try {
      new Function(code);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Create a console mock for logging
   */
  createConsoleMock() {
    this.consoleBuffer = this.consoleBuffer || [];
    
    return {
      log: (...args) => {
        this.consoleBuffer.push({
          level: 'log',
          message: args.map(a => String(a)).join(' '),
          timestamp: Date.now()
        });
      },
      error: (...args) => {
        this.consoleBuffer.push({
          level: 'error',
          message: args.map(a => String(a)).join(' '),
          timestamp: Date.now()
        });
      },
      warn: (...args) => {
        this.consoleBuffer.push({
          level: 'warn',
          message: args.map(a => String(a)).join(' '),
          timestamp: Date.now()
        });
      },
      info: (...args) => {
        this.consoleBuffer.push({
          level: 'info',
          message: args.map(a => String(a)).join(' '),
          timestamp: Date.now()
        });
      }
    };
  }
}

// Initialize buffer
CodeExecutionService.prototype.consoleBuffer = [];

module.exports = new CodeExecutionService();
