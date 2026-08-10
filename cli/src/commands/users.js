/**
 * User, Group, and Role Management Commands
 */

const chalk = require('chalk');
const { UserManager } = require('../modules/user-manager');

module.exports = function(program) {
  const users = program.command('users').description('Manage users, groups, and roles');

  // User commands
  users
    .command('list')
    .alias('ls')
    .description('List all users')
    .option('-r, --role <role>', 'Filter by role')
    .option('-g, --group <group>', 'Filter by group')
    .option('--active', 'Show only active users')
    .action(async (options) => {
      const manager = new UserManager();
      await manager.listUsers(options);
    });

  users
    .command('create')
    .description('Create a new user')
    .option('-u, --username <username>', 'Username')
    .option('-e, --email <email>', 'Email address')
    .option('-p, --password <password>', 'Password')
    .option('-r, --role <role>', 'Role', 'user')
    .action(async (options) => {
      const manager = new UserManager();
      await manager.createUser(options);
    });

  users
    .command('show <userId>')
    .description('Show user details')
    .action(async (userId) => {
      const manager = new UserManager();
      await manager.showUser(userId);
    });

  users
    .command('update <userId>')
    .description('Update user details')
    .option('-e, --email <email>', 'New email')
    .option('-r, --role <role>', 'New role')
    .option('--active <status>', 'Active status (true|false)')
    .action(async (userId, options) => {
      const manager = new UserManager();
      await manager.updateUser(userId, options);
    });

  users
    .command('delete <userId>')
    .description('Delete a user')
    .option('-f, --force', 'Force deletion without confirmation')
    .action(async (userId, options) => {
      const manager = new UserManager();
      await manager.deleteUser(userId, options);
    });

  users
    .command('reset-password <userId>')
    .description('Reset user password')
    .option('-p, --password <password>', 'New password')
    .action(async (userId, options) => {
      const manager = new UserManager();
      await manager.resetPassword(userId, options);
    });

  // Group commands
  const groups = users.command('groups').description('Manage groups');

  groups
    .command('list')
    .description('List all groups')
    .action(async () => {
      const manager = new UserManager();
      await manager.listGroups();
    });

  groups
    .command('create <name>')
    .description('Create a new group')
    .option('-d, --description <desc>', 'Group description')
    .action(async (name, options) => {
      const manager = new UserManager();
      await manager.createGroup(name, options);
    });

  groups
    .command('add-member <groupId> <userId>')
    .description('Add user to group')
    .action(async (groupId, userId) => {
      const manager = new UserManager();
      await manager.addToGroup(groupId, userId);
    });

  groups
    .command('remove-member <groupId> <userId>')
    .description('Remove user from group')
    .action(async (groupId, userId) => {
      const manager = new UserManager();
      await manager.removeFromGroup(groupId, userId);
    });

  // Role commands
  const roles = users.command('roles').description('Manage roles');

  roles
    .command('list')
    .description('List all roles')
    .action(async () => {
      const manager = new UserManager();
      await manager.listRoles();
    });

  roles
    .command('create <name>')
    .description('Create a new role')
    .option('-p, --permissions <perms>', 'Permissions JSON')
    .action(async (name, options) => {
      const manager = new UserManager();
      await manager.createRole(name, options);
    });

  roles
    .command('assign <userId> <role>')
    .description('Assign role to user')
    .action(async (userId, role) => {
      const manager = new UserManager();
      await manager.assignRole(userId, role);
    });
};
