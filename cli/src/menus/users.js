const inquirer = require('inquirer');
const chalk = require('chalk');
const { UserManager } = require('../modules/user-manager');

class UsersMenu {
  constructor() {
    this.manager = new UserManager();
  }

  async show() {
    const choices = [
      { name: 'List users', value: 'list' },
      { name: 'Create user', value: 'create' },
      { name: 'Show user details', value: 'show' },
      { name: 'Update user', value: 'update' },
      { name: 'Delete user', value: 'delete' },
      { name: 'Reset password', value: 'reset-password' },
      new inquirer.Separator(),
      { name: 'List groups', value: 'list-groups' },
      { name: 'Create group', value: 'create-group' },
      new inquirer.Separator(),
      { name: 'List roles', value: 'list-roles' },
      { name: 'Assign role', value: 'assign-role' },
      new inquirer.Separator(),
      { name: chalk.gray('← Back'), value: 'back' }
    ];

    const answer = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'User & Access Management',
      choices
    }]);

    switch (answer.action) {
      case 'list':
        await this.manager.listUsers();
        await this.show();
        break;
      case 'create':
        await this.manager.createUser();
        await this.show();
        break;
      case 'list-groups':
        await this.manager.listGroups();
        await this.show();
        break;
      case 'list-roles':
        await this.manager.listRoles();
        await this.show();
        break;
      case 'back':
        return;
    }
  }
}

module.exports = UsersMenu;
