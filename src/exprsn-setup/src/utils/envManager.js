/**
 * ═══════════════════════════════════════════════════════════
 * Environment File Manager
 * Manages reading and writing .env files for services
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');

class EnvManager {
  /**
   * Get the path to a service's .env file
   * @param {string} serviceName - Service name (e.g., 'exprsn-ca')
   * @returns {string} Path to .env file
   */
  getEnvPath(serviceName) {
    const basePath = path.join(__dirname, '../../..');
    return path.join(basePath, serviceName, '.env');
  }

  /**
   * Read .env file and parse into object
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Environment variables as key-value pairs
   */
  async read(serviceName) {
    try {
      const envPath = this.getEnvPath(serviceName);
      const content = await fs.readFile(envPath, 'utf-8');

      const env = {};
      const lines = content.split('\n');

      for (const line of lines) {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || line.trim() === '') {
          continue;
        }

        // Parse key=value
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();

          // Remove quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }

          env[key] = value;
        }
      }

      return env;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty object
        return {};
      }
      throw error;
    }
  }

  /**
   * Write environment variables to .env file
   * @param {string} serviceName - Service name
   * @param {Object} variables - Environment variables to write
   * @param {boolean} merge - Whether to merge with existing variables (default: true)
   * @returns {Promise<void>}
   */
  async write(serviceName, variables, merge = true) {
    try {
      const envPath = this.getEnvPath(serviceName);

      let env = {};

      if (merge) {
        // Read existing variables
        env = await this.read(serviceName);
      }

      // Merge new variables
      Object.assign(env, variables);

      // Build .env file content
      const lines = [];
      lines.push('# ═══════════════════════════════════════════════════════════');
      lines.push(`# ${serviceName.toUpperCase()} Environment Configuration`);
      lines.push(`# Last Updated: ${new Date().toISOString()}`);
      lines.push('# ═══════════════════════════════════════════════════════════');
      lines.push('');

      // Group variables by category
      const categories = this.categorizeVariables(env);

      for (const [category, vars] of Object.entries(categories)) {
        if (vars.length === 0) continue;

        lines.push(`# ${category}`);
        for (const [key, value] of vars) {
          // Quote values that contain spaces or special characters
          const needsQuotes = /[\s#]/.test(value);
          const formattedValue = needsQuotes ? `"${value}"` : value;
          lines.push(`${key}=${formattedValue}`);
        }
        lines.push('');
      }

      const content = lines.join('\n');

      // Write to file
      await fs.writeFile(envPath, content, 'utf-8');

      return { success: true, path: envPath };
    } catch (error) {
      console.error('Error writing .env file:', error);
      throw error;
    }
  }

  /**
   * Update specific variables in .env file
   * @param {string} serviceName - Service name
   * @param {Object} updates - Variables to update
   * @returns {Promise<Object>} Result with updated variables
   */
  async update(serviceName, updates) {
    try {
      await this.write(serviceName, updates, true);

      return {
        success: true,
        updated: Object.keys(updates),
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get a specific variable from .env file
   * @param {string} serviceName - Service name
   * @param {string} key - Variable key
   * @returns {Promise<string|null>} Variable value or null
   */
  async get(serviceName, key) {
    const env = await this.read(serviceName);
    return env[key] || null;
  }

  /**
   * Delete specific variables from .env file
   * @param {string} serviceName - Service name
   * @param {Array<string>} keys - Variable keys to delete
   * @returns {Promise<Object>} Result
   */
  async delete(serviceName, keys) {
    try {
      const env = await this.read(serviceName);

      for (const key of keys) {
        delete env[key];
      }

      await this.write(serviceName, env, false);

      return {
        success: true,
        deleted: keys
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Check if .env file exists for a service
   * @param {string} serviceName - Service name
   * @returns {Promise<boolean>} True if exists
   */
  async exists(serviceName) {
    try {
      const envPath = this.getEnvPath(serviceName);
      await fs.access(envPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create .env file from template
   * @param {string} serviceName - Service name
   * @param {Object} defaults - Default variables
   * @returns {Promise<Object>} Result
   */
  async createFromTemplate(serviceName, defaults = {}) {
    try {
      const envPath = this.getEnvPath(serviceName);

      // Check if already exists
      if (await this.exists(serviceName)) {
        return {
          success: false,
          error: '.env file already exists'
        };
      }

      await this.write(serviceName, defaults, false);

      return {
        success: true,
        path: envPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Backup .env file
   * @param {string} serviceName - Service name
   * @returns {Promise<Object>} Result with backup path
   */
  async backup(serviceName) {
    try {
      const envPath = this.getEnvPath(serviceName);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${envPath}.backup.${timestamp}`;

      await fs.copyFile(envPath, backupPath);

      return {
        success: true,
        backupPath
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Categorize variables by prefix or common patterns
   * @param {Object} env - Environment variables
   * @returns {Object} Categorized variables
   */
  categorizeVariables(env) {
    const categories = {
      'Server Configuration': [],
      'Database Configuration': [],
      'Redis Configuration': [],
      'CA Configuration': [],
      'OCSP Configuration': [],
      'CRL Configuration': [],
      'Storage Configuration': [],
      'Security Configuration': [],
      'Email Configuration': [],
      'Logging Configuration': [],
      'Other': []
    };

    const entries = Object.entries(env);

    for (const [key, value] of entries) {
      const keyLower = key.toLowerCase();

      if (keyLower.startsWith('port') || keyLower.includes('host') || keyLower === 'node_env') {
        categories['Server Configuration'].push([key, value]);
      } else if (keyLower.includes('db_') || keyLower.includes('database')) {
        categories['Database Configuration'].push([key, value]);
      } else if (keyLower.includes('redis')) {
        categories['Redis Configuration'].push([key, value]);
      } else if (keyLower.includes('ca_') || keyLower.includes('root_ca')) {
        categories['CA Configuration'].push([key, value]);
      } else if (keyLower.includes('ocsp')) {
        categories['OCSP Configuration'].push([key, value]);
      } else if (keyLower.includes('crl')) {
        categories['CRL Configuration'].push([key, value]);
      } else if (keyLower.includes('storage') || keyLower.includes('s3')) {
        categories['Storage Configuration'].push([key, value]);
      } else if (keyLower.includes('key') || keyLower.includes('secret') || keyLower.includes('jwt')) {
        categories['Security Configuration'].push([key, value]);
      } else if (keyLower.includes('email') || keyLower.includes('smtp') || keyLower.includes('mail')) {
        categories['Email Configuration'].push([key, value]);
      } else if (keyLower.includes('log')) {
        categories['Logging Configuration'].push([key, value]);
      } else {
        categories['Other'].push([key, value]);
      }
    }

    return categories;
  }
}

module.exports = new EnvManager();
