const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Service for managing PostgreSQL users and roles
 */
class RoleService {
  /**
   * List all roles
   */
  async listRoles(connectionConfig) {
    const query = `
      SELECT
        r.rolname as name,
        r.rolsuper as is_superuser,
        r.rolinherit as can_inherit,
        r.rolcreaterole as can_create_role,
        r.rolcreatedb as can_create_db,
        r.rolcanlogin as can_login,
        r.rolreplication as is_replication,
        r.rolbypassrls as bypass_rls,
        r.rolconnlimit as connection_limit,
        r.rolvaliduntil as valid_until,
        ARRAY(
          SELECT b.rolname
          FROM pg_catalog.pg_auth_members m
          JOIN pg_catalog.pg_roles b ON (m.roleid = b.oid)
          WHERE m.member = r.oid
        ) as member_of,
        pg_catalog.shobj_description(r.oid, 'pg_authid') as description
      FROM pg_catalog.pg_roles r
      ORDER BY r.rolname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows;
  }

  /**
   * Get role details
   */
  async getRole(connectionConfig, roleName) {
    const query = `
      SELECT
        r.rolname as name,
        r.rolsuper as is_superuser,
        r.rolinherit as can_inherit,
        r.rolcreaterole as can_create_role,
        r.rolcreatedb as can_create_db,
        r.rolcanlogin as can_login,
        r.rolreplication as is_replication,
        r.rolbypassrls as bypass_rls,
        r.rolconnlimit as connection_limit,
        r.rolvaliduntil as valid_until,
        r.rolconfig as config,
        ARRAY(
          SELECT b.rolname
          FROM pg_catalog.pg_auth_members m
          JOIN pg_catalog.pg_roles b ON (m.roleid = b.oid)
          WHERE m.member = r.oid
        ) as member_of,
        ARRAY(
          SELECT b.rolname
          FROM pg_catalog.pg_auth_members m
          JOIN pg_catalog.pg_roles b ON (m.member = b.oid)
          WHERE m.roleid = r.oid
        ) as members,
        pg_catalog.shobj_description(r.oid, 'pg_authid') as description
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = $1
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [roleName]);
    return result.rows[0] || null;
  }

  /**
   * Create a new role
   */
  async createRole(connectionConfig, roleName, options = {}) {
    const {
      password = null,
      superuser = false,
      createDb = false,
      createRole = false,
      inherit = true,
      login = false,
      replication = false,
      bypassRls = false,
      connectionLimit = -1,
      validUntil = null,
      inRoles = [],
      adminRoles = []
    } = options;

    let sql = pgFormat('CREATE ROLE %I', roleName);

    const attributes = [];

    if (superuser) attributes.push('SUPERUSER');
    if (createDb) attributes.push('CREATEDB');
    if (createRole) attributes.push('CREATEROLE');
    if (inherit) attributes.push('INHERIT');
    if (login) attributes.push('LOGIN');
    if (replication) attributes.push('REPLICATION');
    if (bypassRls) attributes.push('BYPASSRLS');

    if (attributes.length > 0) {
      sql += ` WITH ${attributes.join(' ')}`;
    }

    if (password) {
      sql += pgFormat(' PASSWORD %L', password);
    }

    if (connectionLimit !== -1) {
      sql += ` CONNECTION LIMIT ${connectionLimit}`;
    }

    if (validUntil) {
      sql += pgFormat(' VALID UNTIL %L', validUntil);
    }

    if (inRoles.length > 0) {
      sql += pgFormat(' IN ROLE %s', inRoles.map(r => pgFormat('%I', r)).join(', '));
    }

    if (adminRoles.length > 0) {
      sql += pgFormat(' ADMIN %s', adminRoles.map(r => pgFormat('%I', r)).join(', '));
    }

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Role created', { name: roleName, options });
    return { success: true, message: `Role '${roleName}' created successfully` };
  }

  /**
   * Alter a role
   */
  async alterRole(connectionConfig, roleName, changes) {
    const queries = [];

    if (changes.rename) {
      queries.push(pgFormat('ALTER ROLE %I RENAME TO %I', roleName, changes.rename));
      roleName = changes.rename;
    }

    const attributes = [];

    if (changes.superuser !== undefined) {
      attributes.push(changes.superuser ? 'SUPERUSER' : 'NOSUPERUSER');
    }
    if (changes.createDb !== undefined) {
      attributes.push(changes.createDb ? 'CREATEDB' : 'NOCREATEDB');
    }
    if (changes.createRole !== undefined) {
      attributes.push(changes.createRole ? 'CREATEROLE' : 'NOCREATEROLE');
    }
    if (changes.inherit !== undefined) {
      attributes.push(changes.inherit ? 'INHERIT' : 'NOINHERIT');
    }
    if (changes.login !== undefined) {
      attributes.push(changes.login ? 'LOGIN' : 'NOLOGIN');
    }
    if (changes.replication !== undefined) {
      attributes.push(changes.replication ? 'REPLICATION' : 'NOREPLICATION');
    }
    if (changes.bypassRls !== undefined) {
      attributes.push(changes.bypassRls ? 'BYPASSRLS' : 'NOBYPASSRLS');
    }

    if (changes.password) {
      queries.push(pgFormat('ALTER ROLE %I WITH PASSWORD %L', roleName, changes.password));
    }

    if (changes.connectionLimit !== undefined) {
      attributes.push(`CONNECTION LIMIT ${changes.connectionLimit}`);
    }

    if (changes.validUntil !== undefined) {
      if (changes.validUntil === null) {
        attributes.push('VALID UNTIL \'infinity\'');
      } else {
        queries.push(pgFormat('ALTER ROLE %I VALID UNTIL %L', roleName, changes.validUntil));
      }
    }

    if (attributes.length > 0) {
      queries.push(pgFormat('ALTER ROLE %I WITH %s', roleName, attributes.join(' ')));
    }

    for (const query of queries) {
      await connectionPoolManager.executeQuery(connectionConfig, query);
    }

    logger.info('Role altered', { name: roleName, changes });
    return { success: true, message: `Role '${roleName}' altered successfully` };
  }

  /**
   * Drop a role
   */
  async dropRole(connectionConfig, roleName, ifExists = true) {
    const ifExistsClause = ifExists ? 'IF EXISTS' : '';
    const sql = pgFormat('DROP ROLE %s %I', ifExistsClause, roleName);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Role dropped', { name: roleName });
    return { success: true, message: `Role '${roleName}' dropped successfully` };
  }

  /**
   * Grant role to another role
   */
  async grantRole(connectionConfig, roleName, granteeRole, withAdminOption = false) {
    const adminClause = withAdminOption ? 'WITH ADMIN OPTION' : '';
    const sql = pgFormat('GRANT %I TO %I %s', roleName, granteeRole, adminClause);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Role granted', { role: roleName, grantee: granteeRole, withAdmin: withAdminOption });
    return { success: true, message: `Role '${roleName}' granted to '${granteeRole}' successfully` };
  }

  /**
   * Revoke role from another role
   */
  async revokeRole(connectionConfig, roleName, revokeFromRole, cascade = false) {
    const cascadeClause = cascade ? 'CASCADE' : '';
    const sql = pgFormat('REVOKE %I FROM %I %s', roleName, revokeFromRole, cascadeClause);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Role revoked', { role: roleName, revokeFrom: revokeFromRole, cascade });
    return { success: true, message: `Role '${roleName}' revoked from '${revokeFromRole}' successfully` };
  }

  /**
   * Get role privileges on a specific object
   */
  async getRolePrivileges(connectionConfig, roleName, schemaName = 'public') {
    const query = `
      SELECT
        n.nspname as schema,
        c.relname as object_name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized view'
          WHEN 'S' THEN 'sequence'
          WHEN 'f' THEN 'foreign table'
        END as object_type,
        pg_catalog.array_to_string(c.relacl, E'\n') as acl,
        pg_catalog.has_table_privilege($1, c.oid, 'SELECT') as has_select,
        pg_catalog.has_table_privilege($1, c.oid, 'INSERT') as has_insert,
        pg_catalog.has_table_privilege($1, c.oid, 'UPDATE') as has_update,
        pg_catalog.has_table_privilege($1, c.oid, 'DELETE') as has_delete,
        pg_catalog.has_table_privilege($1, c.oid, 'TRUNCATE') as has_truncate,
        pg_catalog.has_table_privilege($1, c.oid, 'REFERENCES') as has_references,
        pg_catalog.has_table_privilege($1, c.oid, 'TRIGGER') as has_trigger
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $2
        AND c.relkind IN ('r', 'v', 'm', 'S', 'f')
      ORDER BY c.relname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [roleName, schemaName]);
    return result.rows;
  }

  /**
   * Grant privileges on a table to a role
   */
  async grantTablePrivileges(connectionConfig, schemaName, tableName, roleName, privileges = [], withGrantOption = false) {
    const privList = privileges.length > 0 ? privileges.join(', ') : 'ALL PRIVILEGES';
    const grantOptionClause = withGrantOption ? 'WITH GRANT OPTION' : '';

    const sql = pgFormat(
      'GRANT %s ON TABLE %I.%I TO %I %s',
      privList,
      schemaName,
      tableName,
      roleName,
      grantOptionClause
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Table privileges granted', { schema: schemaName, table: tableName, role: roleName, privileges });
    return { success: true, message: `Privileges granted to '${roleName}' on '${schemaName}.${tableName}' successfully` };
  }

  /**
   * Revoke privileges on a table from a role
   */
  async revokeTablePrivileges(connectionConfig, schemaName, tableName, roleName, privileges = [], cascade = false) {
    const privList = privileges.length > 0 ? privileges.join(', ') : 'ALL PRIVILEGES';
    const cascadeClause = cascade ? 'CASCADE' : '';

    const sql = pgFormat(
      'REVOKE %s ON TABLE %I.%I FROM %I %s',
      privList,
      schemaName,
      tableName,
      roleName,
      cascadeClause
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Table privileges revoked', { schema: schemaName, table: tableName, role: roleName, privileges });
    return { success: true, message: `Privileges revoked from '${roleName}' on '${schemaName}.${tableName}' successfully` };
  }

  /**
   * Get active sessions for a role
   */
  async getRoleSessions(connectionConfig, roleName) {
    const query = `
      SELECT
        pid,
        usename,
        application_name,
        client_addr,
        backend_start,
        state,
        query
      FROM pg_stat_activity
      WHERE usename = $1
      ORDER BY backend_start DESC
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [roleName]);
    return result.rows;
  }

  /**
   * Terminate all sessions for a role
   */
  async terminateRoleSessions(connectionConfig, roleName) {
    const query = `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE usename = $1
        AND pid <> pg_backend_pid()
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [roleName]);

    logger.info('Role sessions terminated', { role: roleName, count: result.rowCount });
    return {
      success: true,
      terminated: result.rowCount,
      message: `Terminated ${result.rowCount} session(s) for role '${roleName}'`
    };
  }
}

module.exports = new RoleService();
