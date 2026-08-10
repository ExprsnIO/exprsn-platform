const inquirer = require('inquirer');
const chalk = require('chalk');
const { CAManager } = require('../modules/ca-manager');

class CAMenu {
  constructor() {
    this.manager = new CAManager();
  }

  async show() {
    const choices = [
      { name: 'List certificates', value: 'list-certs' },
      { name: 'Issue certificate', value: 'issue' },
      { name: 'Revoke certificate', value: 'revoke' },
      { name: 'Show certificate details', value: 'show-cert' },
      new inquirer.Separator(),
      { name: 'Create CA token', value: 'create-token' },
      { name: 'List CA tokens', value: 'list-tokens' },
      { name: 'Verify token', value: 'verify-token' },
      new inquirer.Separator(),
      { name: 'OCSP status', value: 'ocsp' },
      { name: 'Generate CRL', value: 'crl' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Certificate Authority Management',
      choices
    }]);

    switch (answer.action) {
      case 'list-certs':
        await this.manager.listCertificates();
        await this.show();
        break;
      case 'issue':
        await this.manager.issueCertificate();
        await this.show();
        break;
      case 'create-token':
        await this.manager.createToken();
        await this.show();
        break;
      case 'list-tokens':
        await this.manager.listTokens();
        await this.show();
        break;
      case 'ocsp':
        await this.manager.manageOCSP({ status: true });
        await this.show();
        break;
      case 'back':
        return;
    }
  }
}

module.exports = CAMenu;
