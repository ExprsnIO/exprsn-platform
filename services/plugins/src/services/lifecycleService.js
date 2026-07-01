'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Plugin lifecycle service — catalog registration + install lifecycle.
 *
 * Keeps route handlers thin and centralises the trust rules:
 *  · register() validates a manifest (manifestValidator) before it ever lands;
 *  · install() pins the version, validates config against the manifest's
 *    configSchema, and creates grants that are a SUBSET of declared capabilities;
 *  · enable/disable/uninstall go through the state-machine engine so every
 *    lifecycle change is guarded + audited (plugin_transitions).
 * ═══════════════════════════════════════════════════════════
 */

const crypto = require('node:crypto');
const { createLogger } = require('@exprsn/shared');
const {
  Plugin, PluginVersion, PluginInstallation, PluginGrant,
} = require('../models');
const { validateManifest, validateConfig } = require('./manifestValidator');
const capabilities = require('../capabilities');
const stateMachine = require('./stateMachine');

const logger = createLogger('exprsn-plugins-lifecycle');

function checksum(manifest) {
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

/**
 * Register (or update) a plugin from a manifest. Validates first; appends an
 * immutable version row. `source` defaults to 'uploaded'.
 */
async function register(manifest, { source = 'uploaded', signature = null } = {}) {
  const { valid, errors } = validateManifest(manifest);
  if (!valid) { const e = new Error(`invalid manifest: ${errors.join('; ')}`); e.status = 400; e.details = errors; throw e; }

  const [plugin] = await Plugin.findOrCreate({
    where: { pluginKey: manifest.key },
    defaults: {
      pluginKey: manifest.key, name: manifest.name, description: manifest.description || null,
      publisher: manifest.publisher || null, latestVersion: manifest.version, kind: manifest.kind,
      source, status: 'published', manifest, signature,
    },
  });

  // Update to the newest manifest (catalog reflects the latest published version).
  plugin.name = manifest.name;
  plugin.description = manifest.description || null;
  plugin.publisher = manifest.publisher || null;
  plugin.latestVersion = manifest.version;
  plugin.kind = manifest.kind;
  plugin.manifest = manifest;
  plugin.signature = signature;
  if (plugin.source !== 'builtin') plugin.source = source;
  await plugin.save();

  await PluginVersion.findOrCreate({
    where: { pluginId: plugin.id, version: manifest.version },
    defaults: { pluginId: plugin.id, version: manifest.version, manifest, checksum: checksum(manifest) },
  });

  return plugin;
}

/**
 * Install a plugin at a scope. Creates the installation (status 'enabled' via
 * the state machine) and its capability grants.
 */
async function install({ pluginKey, scopeType = 'platform', scopeId = null, config = {}, capabilities: requested, installedBy = null }) {
  const plugin = await Plugin.findOne({ where: { pluginKey } });
  if (!plugin) { const e = new Error(`unknown plugin: ${pluginKey}`); e.status = 404; throw e; }

  const manifest = plugin.manifest || {};

  // Scope must be one the manifest allows.
  if (Array.isArray(manifest.scopes) && manifest.scopes.length && !manifest.scopes.includes(scopeType)) {
    const e = new Error(`plugin ${pluginKey} cannot be installed at scope '${scopeType}'`); e.status = 400; throw e;
  }
  if (scopeType !== 'platform' && !scopeId) {
    const e = new Error(`scopeId is required for scope '${scopeType}'`); e.status = 400; throw e;
  }

  // Validate config against the manifest's configSchema.
  const cfg = validateConfig(manifest, config);
  if (!cfg.valid) { const e = new Error(`invalid config: ${cfg.errors.join('; ')}`); e.status = 400; e.details = cfg.errors; throw e; }

  // Grants: requested ⊆ declared. Default to all declared capabilities.
  const declared = manifest.capabilities || [];
  const grantList = requested && requested.length ? requested : declared;
  if (!capabilities.isSubset(grantList, declared)) {
    const e = new Error('requested capabilities exceed those declared by the manifest'); e.status = 400; throw e;
  }

  const [installation, created] = await PluginInstallation.findOrCreate({
    where: { pluginId: plugin.id, scopeType, scopeId },
    defaults: {
      pluginId: plugin.id, scopeType, scopeId, version: manifest.version,
      status: 'installed', lifecycleState: 'installed', config, installedBy,
    },
  });
  if (!created) { const e = new Error('plugin already installed at this scope'); e.status = 409; throw e; }

  // Replace grants.
  await PluginGrant.destroy({ where: { installationId: installation.id } });
  await PluginGrant.bulkCreate(grantList.map((cap) => ({
    installationId: installation.id, capability: cap, grantedBy: installedBy,
  })));

  // Move to 'enabled' through the state machine.
  await stateMachine.applyInstallTransition(installation, 'enable', { actorId: installedBy });
  logger.info('Plugin installed', { pluginKey, scopeType, scopeId, installationId: installation.id });
  return installation;
}

/** Drive a lifecycle event (enable/disable/fail/uninstall) on an installation. */
async function transition(installationId, event, { actorId } = {}) {
  const installation = await PluginInstallation.findByPk(installationId);
  if (!installation) { const e = new Error('installation not found'); e.status = 404; throw e; }

  if (event === 'uninstall') {
    await stateMachine.applyInstallTransition(installation, 'uninstall', { actorId });
    await PluginGrant.destroy({ where: { installationId } });
    await installation.destroy();
    return { ok: true, toState: 'uninstalled', removed: true };
  }

  const res = await stateMachine.applyInstallTransition(installation, event, { actorId });
  if (!res.ok) { const e = new Error(res.reason); e.status = 409; throw e; }
  return { ...res, installation };
}

module.exports = { register, install, transition, checksum };
