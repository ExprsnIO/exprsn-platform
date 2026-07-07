'use strict';

/**
 * Hard refusal shared by every seed entry point (BUG-004): seeders write fake
 * orgs/users/certs/tokens/demo content straight into the configured DB and
 * must never run against a production environment. Require this FIRST, before
 * any `NODE_ENV || 'development'` defaulting, dotenv load, or model import.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('[seed] Refusing to run: NODE_ENV=production. Seed scripts must never run against a production environment.');
  process.exit(1);
}
