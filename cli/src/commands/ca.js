/**
 * Certificate Authority Management Commands
 */

const chalk = require('chalk');
const { CAManager } = require('../modules/ca-manager');

module.exports = function(program) {
  const ca = program.command('ca').description('Manage Certificate Authority');

  // List certificates
  ca
    .command('list')
    .alias('ls')
    .description('List all certificates')
    .option('-t, --type <type>', 'Filter by type (root|intermediate|entity)')
    .option('-s, --status <status>', 'Filter by status (valid|revoked|expired)')
    .action(async (options) => {
      const manager = new CAManager();
      await manager.listCertificates(options);
    });

  // Issue certificate
  ca
    .command('issue')
    .description('Issue a new certificate')
    .option('-n, --name <name>', 'Certificate common name')
    .option('-t, --type <type>', 'Certificate type (intermediate|entity)', 'entity')
    .option('-d, --days <days>', 'Validity in days', '365')
    .option('-e, --email <email>', 'Email address')
    .action(async (options) => {
      const manager = new CAManager();
      await manager.issueCertificate(options);
    });

  // Revoke certificate
  ca
    .command('revoke <serial>')
    .description('Revoke a certificate')
    .option('-r, --reason <reason>', 'Revocation reason', 'unspecified')
    .action(async (serial, options) => {
      const manager = new CAManager();
      await manager.revokeCertificate(serial, options);
    });

  // Certificate details
  ca
    .command('show <serial>')
    .description('Show certificate details')
    .action(async (serial) => {
      const manager = new CAManager();
      await manager.showCertificate(serial);
    });

  // Generate CRL
  ca
    .command('crl')
    .description('Generate Certificate Revocation List')
    .option('-o, --output <file>', 'Output file path')
    .action(async (options) => {
      const manager = new CAManager();
      await manager.generateCRL(options);
    });

  // OCSP responder
  ca
    .command('ocsp')
    .description('Manage OCSP responder')
    .option('--start', 'Start OCSP responder')
    .option('--stop', 'Stop OCSP responder')
    .option('--status', 'Check OCSP responder status')
    .action(async (options) => {
      const manager = new CAManager();
      await manager.manageOCSP(options);
    });

  // Token management
  const token = ca.command('token').description('Manage CA tokens');

  token
    .command('create')
    .description('Create a new CA token')
    .option('-s, --service <service>', 'Service name')
    .option('-r, --resource <resource>', 'Resource pattern')
    .option('-p, --permissions <perms>', 'Permissions (read,write,delete)', 'read')
    .option('-d, --days <days>', 'Validity in days', '30')
    .action(async (options) => {
      const manager = new CAManager();
      await manager.createToken(options);
    });

  token
    .command('list')
    .description('List all tokens')
    .option('-s, --service <service>', 'Filter by service')
    .option('--valid', 'Show only valid tokens')
    .action(async (options) => {
      const manager = new CAManager();
      await manager.listTokens(options);
    });

  token
    .command('verify <tokenId>')
    .description('Verify a token')
    .action(async (tokenId) => {
      const manager = new CAManager();
      await manager.verifyToken(tokenId);
    });

  token
    .command('revoke <tokenId>')
    .description('Revoke a token')
    .action(async (tokenId) => {
      const manager = new CAManager();
      await manager.revokeToken(tokenId);
    });
};
