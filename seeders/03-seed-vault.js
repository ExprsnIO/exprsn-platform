/**
 * Vault Service Seeder - Encryption keys, secrets, leases, audit logs
 */

const { Sequelize } = require('sequelize');
const crypto = require('crypto');

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  const sequelize = new Sequelize(process.env.VAULT_DB_NAME || 'exprsn_vault', process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || '', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  });

  try {
    await sequelize.authenticate();
    console.log('  Connected to exprsn_vault database');

    // Create sample encryption keys
    for (let i = 0; i < 10; i++) {
      await sequelize.query(`
        INSERT INTO encryption_keys (name, algorithm, encrypted_key, key_derivation, version, purpose, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `, {
        replacements: [`key-${i}`, 'AES-256-GCM', crypto.randomBytes(32).toString('base64'), JSON.stringify({method: 'pbkdf2'}), 1, 'data-encryption', 'active']
      });
      recordsCreated++;
    }

    // Create sample secrets
    for (let i = 0; i < 50; i++) {
      await sequelize.query(`
        INSERT INTO secrets (path, key, encrypted_value, iv, auth_tag, version, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      `, {
        replacements: [`secret/app${i % 5}/db`, `password-${i}`, crypto.randomBytes(64).toString('base64'), crypto.randomBytes(16).toString('hex'), crypto.randomBytes(16).toString('hex'), 1, 'active']
      });
      recordsCreated++;
    }

    return { recordsCreated, duration: ((Date.now() - startTime) / 1000).toFixed(2) };
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed().then(r => { console.log(`\nVault seeded: ${r.recordsCreated} records`); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { seed };
