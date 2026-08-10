/**
 * User, Group, and Role Manager
 */

const axios = require('axios');
const chalk = require('chalk');
const ora = require('ora');
const Table = require('cli-table3');
const inquirer = require('inquirer');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

class UserManager {
  constructor() {
    this.authUrl = process.env.AUTH_URL || 'http://localhost:3001';
  }

  async listUsers(options = {}) {
    const spinner = ora('Fetching users...').start();
    try {
      const response = await axios.get(`${this.authUrl}/api/users`, { params: options });
      spinner.stop();

      const users = response.data.data || [];
      if (users.length === 0) {
        console.log(chalk.yellow('No users found'));
        return;
      }

      const table = new Table({
        head: ['ID', 'Username', 'Email', 'Role', 'Status', 'Created'].map(h => chalk.cyan(h))
      });

      users.forEach(user => {
        table.push([
          user.id.substring(0, 8),
          user.username,
          user.email,
          user.role,
          user.active ? chalk.green('Active') : chalk.gray('Inactive'),
          new Date(user.createdAt).toLocaleDateString()
        ]);
      });

      console.log('\n' + table.toString() + '\n');
    } catch (error) {
      spinner.fail('Failed to list users');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async createUser(options = {}) {
    try {
      let answers = options;
      if (!options.username) {
        answers = await inquirer.prompt([
          { type: 'input', name: 'username', message: 'Username:', validate: i => i.length > 0 },
          { type: 'input', name: 'email', message: 'Email:', validate: i => i.includes('@') },
          { type: 'password', name: 'password', message: 'Password:', validate: i => i.length >= 8 },
          { type: 'list', name: 'role', message: 'Role:', choices: ['user', 'admin', 'moderator'], default: 'user' }
        ]);
      }

      const spinner = ora('Creating user...').start();
      const hashedPassword = await bcrypt.hash(answers.password, 12);

      const response = await axios.post(`${this.authUrl}/api/users`, {
        username: answers.username,
        email: answers.email,
        password: hashedPassword,
        role: answers.role || 'user'
      });

      spinner.succeed(`User ${answers.username} created successfully`);
      console.log(chalk.gray(`User ID: ${response.data.data.id}\n`));
    } catch (error) {
      logger.error('Create user error:', error);
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async showUser(userId) {
    const spinner = ora('Fetching user details...').start();
    try {
      const response = await axios.get(`${this.authUrl}/api/users/${userId}`);
      spinner.stop();

      const user = response.data.data;
      console.log(chalk.cyan('\n━━━ User Details ━━━\n'));
      console.log(`  ID:       ${user.id}`);
      console.log(`  Username: ${user.username}`);
      console.log(`  Email:    ${user.email}`);
      console.log(`  Role:     ${user.role}`);
      console.log(`  Status:   ${user.active ? chalk.green('Active') : chalk.gray('Inactive')}`);
      console.log(`  Created:  ${new Date(user.createdAt).toLocaleString()}`);
      console.log();
    } catch (error) {
      spinner.fail('Failed to fetch user');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async updateUser(userId, options) {
    const spinner = ora('Updating user...').start();
    try {
      await axios.patch(`${this.authUrl}/api/users/${userId}`, options);
      spinner.succeed('User updated successfully');
    } catch (error) {
      spinner.fail('Failed to update user');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async deleteUser(userId, options = {}) {
    try {
      if (!options.force) {
        const confirm = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: `Delete user ${userId}?`,
          default: false
        }]);
        if (!confirm.proceed) return;
      }

      const spinner = ora('Deleting user...').start();
      await axios.delete(`${this.authUrl}/api/users/${userId}`);
      spinner.succeed('User deleted successfully');
    } catch (error) {
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async resetPassword(userId, options = {}) {
    try {
      let password = options.password;
      if (!password) {
        const answer = await inquirer.prompt([{
          type: 'password',
          name: 'password',
          message: 'New password:',
          validate: i => i.length >= 8
        }]);
        password = answer.password;
      }

      const spinner = ora('Resetting password...').start();
      const hashedPassword = await bcrypt.hash(password, 12);
      await axios.patch(`${this.authUrl}/api/users/${userId}/password`, { password: hashedPassword });
      spinner.succeed('Password reset successfully');
    } catch (error) {
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async listGroups() {
    const spinner = ora('Fetching groups...').start();
    try {
      const response = await axios.get(`${this.authUrl}/api/groups`);
      spinner.stop();

      const groups = response.data.data || [];
      const table = new Table({
        head: ['ID', 'Name', 'Description', 'Members'].map(h => chalk.cyan(h))
      });

      groups.forEach(group => {
        table.push([
          group.id.substring(0, 8),
          group.name,
          group.description || '-',
          group.memberCount || 0
        ]);
      });

      console.log('\n' + table.toString() + '\n');
    } catch (error) {
      spinner.fail('Failed to list groups');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async createGroup(name, options = {}) {
    const spinner = ora('Creating group...').start();
    try {
      await axios.post(`${this.authUrl}/api/groups`, {
        name,
        description: options.description
      });
      spinner.succeed(`Group ${name} created successfully`);
    } catch (error) {
      spinner.fail('Failed to create group');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async addToGroup(groupId, userId) {
    const spinner = ora('Adding user to group...').start();
    try {
      await axios.post(`${this.authUrl}/api/groups/${groupId}/members`, { userId });
      spinner.succeed('User added to group successfully');
    } catch (error) {
      spinner.fail('Failed to add user to group');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async removeFromGroup(groupId, userId) {
    const spinner = ora('Removing user from group...').start();
    try {
      await axios.delete(`${this.authUrl}/api/groups/${groupId}/members/${userId}`);
      spinner.succeed('User removed from group successfully');
    } catch (error) {
      spinner.fail('Failed to remove user from group');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }

  async listRoles() {
    console.log(chalk.cyan('\n━━━ Available Roles ━━━\n'));
    const roles = ['user', 'moderator', 'admin', 'superadmin'];
    roles.forEach(role => console.log(`  • ${role}`));
    console.log();
  }

  async createRole(name, options = {}) {
    console.log(chalk.yellow('Custom roles are managed through the auth service configuration'));
    console.log(chalk.gray('Default roles: user, moderator, admin, superadmin\n'));
  }

  async assignRole(userId, role) {
    const spinner = ora('Assigning role...').start();
    try {
      await axios.patch(`${this.authUrl}/api/users/${userId}`, { role });
      spinner.succeed(`Role ${role} assigned successfully`);
    } catch (error) {
      spinner.fail('Failed to assign role');
      console.error(chalk.red('Error:'), error.response?.data?.message || error.message);
    }
  }
}

module.exports = { UserManager };
