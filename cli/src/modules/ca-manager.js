/**
 * Certificate Authority Manager
 * Manages certificates, tokens, OCSP, and CRL operations
 */

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const inquirer = require('inquirer');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

class CAManager {
  constructor() {
    this.caUrl = process.env.CA_URL || 'http://localhost:3000';
    this.rootDir = global.EXPRSN_ROOT || path.resolve(__dirname, '../../..');
  }

  /**
   * List all certificates
   */
  async listCertificates(options = {}) {
    const spinner = ora('Fetching certificates...').start();

    try {
      const response = await axios.get(`${this.caUrl}/api/certificates`, {
        params: {
          type: options.type,
          status: options.status
        }
      });

      spinner.stop();

      const certs = response.data.data || [];

      if (certs.length === 0) {
        console.log(chalk.yellow('No certificates found'));
        return;
      }

      const table = new Table({
        head: ['Serial', 'Subject', 'Type', 'Status', 'Valid Until'].map(h => chalk.cyan(h)),
        style: { head: [], border: [] }
      });

      for (const cert of certs) {
        const statusColor = cert.status === 'valid' ? 'green' :
                           cert.status === 'revoked' ? 'red' : 'yellow';

        table.push([
          cert.serialNumber.substring(0, 16) + '...',
          cert.subject.CN || cert.subject.commonName,
          cert.type,
          chalk[statusColor](cert.status),
          new Date(cert.validUntil).toLocaleDateString()
        ]);
      }

      console.log('\n' + table.toString() + '\n');
      console.log(chalk.gray(`Total: ${certs.length} certificates\n`));
    } catch (error) {
      spinner.fail('Failed to list certificates');
      logger.error('List certificates error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Issue a new certificate
   */
  async issueCertificate(options = {}) {
    try {
      let answers = options;

      // Interactive mode if no options provided
      if (!options.name) {
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Certificate common name (CN):',
            validate: input => input.length > 0 || 'Name is required'
          },
          {
            type: 'list',
            name: 'type',
            message: 'Certificate type:',
            choices: ['entity', 'intermediate'],
            default: 'entity'
          },
          {
            type: 'number',
            name: 'days',
            message: 'Validity period (days):',
            default: 365,
            validate: input => input > 0 || 'Must be greater than 0'
          },
          {
            type: 'input',
            name: 'email',
            message: 'Email address (optional):',
            default: ''
          }
        ]);
      }

      const spinner = ora('Issuing certificate...').start();

      const response = await axios.post(`${this.caUrl}/api/certificates/issue`, {
        commonName: answers.name,
        type: answers.type,
        validityDays: parseInt(answers.days),
        email: answers.email || undefined
      });

      spinner.succeed('Certificate issued successfully');

      const cert = response.data.data;

      console.log(chalk.cyan('\n━━━ Certificate Details ━━━\n'));
      console.log(`  Serial:       ${cert.serialNumber}`);
      console.log(`  Subject:      ${cert.subject.CN}`);
      console.log(`  Type:         ${cert.type}`);
      console.log(`  Valid From:   ${new Date(cert.validFrom).toLocaleString()}`);
      console.log(`  Valid Until:  ${new Date(cert.validUntil).toLocaleString()}`);
      console.log(`  Status:       ${chalk.green('Valid')}`);
      console.log();

      // Save certificate to file
      const certDir = path.join(this.rootDir, 'certificates');
      await fs.ensureDir(certDir);

      const certPath = path.join(certDir, `${cert.serialNumber}.pem`);
      await fs.writeFile(certPath, cert.certificate);

      console.log(chalk.gray(`Certificate saved to: ${certPath}\n`));
    } catch (error) {
      logger.error('Issue certificate error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Revoke a certificate
   */
  async revokeCertificate(serial, options = {}) {
    try {
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: `Are you sure you want to revoke certificate ${serial}?`,
          default: false
        }
      ]);

      if (!confirm.proceed) {
        console.log(chalk.yellow('Revocation cancelled'));
        return;
      }

      const spinner = ora('Revoking certificate...').start();

      await axios.post(`${this.caUrl}/api/certificates/${serial}/revoke`, {
        reason: options.reason || 'unspecified'
      });

      spinner.succeed(`Certificate ${serial} revoked successfully`);
    } catch (error) {
      logger.error('Revoke certificate error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Show certificate details
   */
  async showCertificate(serial) {
    const spinner = ora('Fetching certificate details...').start();

    try {
      const response = await axios.get(`${this.caUrl}/api/certificates/${serial}`);
      spinner.stop();

      const cert = response.data.data;

      console.log(chalk.cyan('\n━━━ Certificate Details ━━━\n'));
      console.log(`  Serial:       ${cert.serialNumber}`);
      console.log(`  Subject:      ${cert.subject.CN || cert.subject.commonName}`);
      console.log(`  Issuer:       ${cert.issuer.CN || cert.issuer.commonName}`);
      console.log(`  Type:         ${cert.type}`);
      console.log(`  Valid From:   ${new Date(cert.validFrom).toLocaleString()}`);
      console.log(`  Valid Until:  ${new Date(cert.validUntil).toLocaleString()}`);
      console.log(`  Status:       ${cert.status === 'valid' ? chalk.green('Valid') : chalk.red('Revoked')}`);
      console.log(`  Signature:    ${cert.signatureAlgorithm}`);
      console.log(`  Key Size:     ${cert.keySize} bits`);

      if (cert.extensions) {
        console.log('\n  Extensions:');
        Object.entries(cert.extensions).forEach(([key, value]) => {
          console.log(`    ${key}: ${value}`);
        });
      }

      console.log();
    } catch (error) {
      spinner.fail('Failed to fetch certificate');
      logger.error('Show certificate error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Generate CRL
   */
  async generateCRL(options = {}) {
    const spinner = ora('Generating Certificate Revocation List...').start();

    try {
      const response = await axios.post(`${this.caUrl}/api/crl/generate`);
      spinner.succeed('CRL generated successfully');

      if (options.output) {
        await fs.writeFile(options.output, response.data.crl);
        console.log(chalk.gray(`CRL saved to: ${options.output}\n`));
      } else {
        console.log('\n' + response.data.crl + '\n');
      }
    } catch (error) {
      spinner.fail('Failed to generate CRL');
      logger.error('Generate CRL error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Manage OCSP responder
   */
  async manageOCSP(options = {}) {
    try {
      if (options.start) {
        const spinner = ora('Starting OCSP responder...').start();
        // OCSP is part of CA service, so we just check status
        const response = await axios.get(`${this.caUrl}/api/ocsp/status`);
        spinner.succeed('OCSP responder is running');
        console.log(chalk.gray(`OCSP URL: http://localhost:2560\n`));
      } else if (options.stop) {
        console.log(chalk.yellow('OCSP responder is managed by exprsn-ca service'));
        console.log(chalk.gray('Use: exprsn services stop ca\n'));
      } else if (options.status) {
        const spinner = ora('Checking OCSP status...').start();
        try {
          await axios.get(`${this.caUrl}/api/ocsp/status`);
          spinner.succeed('OCSP responder is healthy');
        } catch (error) {
          spinner.fail('OCSP responder is not running');
        }
      } else {
        console.log(chalk.yellow('Please specify an option: --start, --stop, or --status'));
      }
    } catch (error) {
      logger.error('OCSP management error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Create CA token
   */
  async createToken(options = {}) {
    try {
      let answers = options;

      if (!options.service) {
        answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'service',
            message: 'Service name:',
            validate: input => input.length > 0 || 'Service name is required'
          },
          {
            type: 'input',
            name: 'resource',
            message: 'Resource pattern:',
            default: 'http://localhost:*/api/*',
            validate: input => input.length > 0 || 'Resource is required'
          },
          {
            type: 'checkbox',
            name: 'permissions',
            message: 'Select permissions:',
            choices: [
              { name: 'Read', value: 'read', checked: true },
              { name: 'Write', value: 'write' },
              { name: 'Update', value: 'update' },
              { name: 'Delete', value: 'delete' },
              { name: 'Append', value: 'append' }
            ]
          },
          {
            type: 'number',
            name: 'days',
            message: 'Validity period (days):',
            default: 30
          }
        ]);
      }

      const spinner = ora('Creating CA token...').start();

      const permissions = {};
      const permList = Array.isArray(answers.permissions) ?
        answers.permissions :
        (answers.permissions || 'read').split(',');

      permList.forEach(perm => {
        permissions[perm.trim()] = true;
      });

      const response = await axios.post(`${this.caUrl}/api/tokens`, {
        serviceName: answers.service,
        resource: answers.resource,
        permissions,
        validityDays: parseInt(answers.days || 30)
      });

      spinner.succeed('CA token created successfully');

      const token = response.data.data;

      console.log(chalk.cyan('\n━━━ CA Token Details ━━━\n'));
      console.log(`  ID:          ${token.id}`);
      console.log(`  Service:     ${answers.service}`);
      console.log(`  Resource:    ${answers.resource}`);
      console.log(`  Permissions: ${Object.keys(permissions).filter(k => permissions[k]).join(', ')}`);
      console.log(`  Expires:     ${new Date(token.expiresAt).toLocaleString()}`);
      console.log();
      console.log(chalk.gray('Token (save this securely):'));
      console.log(chalk.yellow(JSON.stringify(token, null, 2)));
      console.log();
    } catch (error) {
      logger.error('Create token error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * List CA tokens
   */
  async listTokens(options = {}) {
    const spinner = ora('Fetching tokens...').start();

    try {
      const response = await axios.get(`${this.caUrl}/api/tokens`, {
        params: {
          service: options.service,
          valid: options.valid
        }
      });

      spinner.stop();

      const tokens = response.data.data || [];

      if (tokens.length === 0) {
        console.log(chalk.yellow('No tokens found'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Service', 'Resource', 'Permissions', 'Expires'].map(h => chalk.cyan(h)),
        style: { head: [], border: [] },
        colWidths: [38, 20, 30, 25, 20]
      });

      for (const token of tokens) {
        const perms = Object.keys(token.permissions).filter(k => token.permissions[k]).join(',');
        const expired = new Date(token.expiresAt) < new Date();
        const expiryColor = expired ? 'red' : 'green';

        table.push([
          token.id.substring(0, 8) + '...',
          token.serviceName || 'N/A',
          token.resource.value.substring(0, 28) + '...',
          perms,
          chalk[expiryColor](new Date(token.expiresAt).toLocaleDateString())
        ]);
      }

      console.log('\n' + table.toString() + '\n');
      console.log(chalk.gray(`Total: ${tokens.length} tokens\n`));
    } catch (error) {
      spinner.fail('Failed to list tokens');
      logger.error('List tokens error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Verify a token
   */
  async verifyToken(tokenId) {
    const spinner = ora('Verifying token...').start();

    try {
      const response = await axios.post(`${this.caUrl}/api/tokens/verify`, { tokenId });
      spinner.stop();

      if (response.data.valid) {
        console.log(chalk.green('\n✓ Token is valid\n'));
        console.log(chalk.cyan('Token Details:'));
        console.log(JSON.stringify(response.data.token, null, 2));
        console.log();
      } else {
        console.log(chalk.red('\n✗ Token is invalid\n'));
        console.log(chalk.yellow(`Reason: ${response.data.reason}\n`));
      }
    } catch (error) {
      spinner.fail('Token verification failed');
      logger.error('Verify token error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  /**
   * Revoke a token
   */
  async revokeToken(tokenId) {
    try {
      const confirm = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: `Are you sure you want to revoke token ${tokenId}?`,
          default: false
        }
      ]);

      if (!confirm.proceed) {
        console.log(chalk.yellow('Revocation cancelled'));
        return;
      }

      const spinner = ora('Revoking token...').start();

      await axios.delete(`${this.caUrl}/api/tokens/${tokenId}`);

      spinner.succeed(`Token ${tokenId} revoked successfully`);
    } catch (error) {
      logger.error('Revoke token error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }
}

module.exports = { CAManager };
