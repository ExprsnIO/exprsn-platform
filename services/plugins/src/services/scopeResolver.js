'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Scope resolver — given an event context, return the ordered set of enabled
 * installations that apply, with merged config.
 *
 * Mirrors ruleEngineService._ruleApplies' scope-filter idea (docs/plans/plugins-plan.md §4):
 *  1. From context derive { userId, orgId?, groupId?, module }.
 *  2. Match enabled installs: platform (always) ∪ organization=orgId ∪
 *     group=groupId (only when group context is present) ∪ user=userId.
 *  3. Filter by manifest appliesTo/events against the emitting module/event.
 *  4. Merge config precedence platform < organization < group < user.
 *
 * MVP enforcement (decisions ledger): platform + user fully; organization
 * partial (org-admin authority reuses platform-admin, interim); group
 * declarable-but-only-enforceable-where-group-context-exists.
 * ═══════════════════════════════════════════════════════════
 */

const { Op } = require('sequelize');
const { Plugin, PluginInstallation, PluginGrant } = require('../models');

const SCOPE_PRECEDENCE = { platform: 0, organization: 1, group: 2, user: 3 };

function listIncludes(list, value) {
  // An empty/absent declared list means "no constraint" (applies to all).
  if (!Array.isArray(list) || list.length === 0) return true;
  return list.includes(value);
}

/**
 * Resolve applicable installations for an event context.
 * @param {{event:string, module:string, userId?:string, orgId?:string, groupId?:string}} ctx
 * @returns {Promise<Array<{installation, plugin, manifest, mergedConfig, grants:string[]}>>}
 */
async function resolve(ctx) {
  const { event, module: moduleName, userId, orgId, groupId } = ctx || {};

  // Build the scope OR-set. platform always; the others only when context exists.
  const scopeOr = [{ scopeType: 'platform' }];
  if (userId) scopeOr.push({ scopeType: 'user', scopeId: userId });
  if (orgId) scopeOr.push({ scopeType: 'organization', scopeId: orgId });
  if (groupId) scopeOr.push({ scopeType: 'group', scopeId: groupId });

  const installs = await PluginInstallation.findAll({
    where: { status: 'enabled', [Op.or]: scopeOr },
    include: [
      { model: Plugin, as: 'plugin', where: { status: { [Op.ne]: 'disabled' } }, required: true },
      { model: PluginGrant, as: 'grants', required: false },
    ],
  });

  // Filter by manifest events/appliesTo, then group by plugin for config merge.
  const byPlugin = new Map();
  for (const inst of installs) {
    const manifest = inst.plugin.manifest || {};
    if (event && !listIncludes(manifest.events, event)) continue;
    if (moduleName && !listIncludes(manifest.appliesTo, moduleName)) continue;
    const key = inst.pluginId;
    if (!byPlugin.has(key)) byPlugin.set(key, []);
    byPlugin.get(key).push(inst);
  }

  const resolved = [];
  for (const group of byPlugin.values()) {
    group.sort((a, b) => SCOPE_PRECEDENCE[a.scopeType] - SCOPE_PRECEDENCE[b.scopeType]);
    const mergedConfig = {};
    for (const inst of group) Object.assign(mergedConfig, inst.config || {});
    const effective = group[group.length - 1]; // most specific scope wins as the active install
    resolved.push({
      installation: effective,
      plugin: effective.plugin,
      manifest: effective.plugin.manifest || {},
      mergedConfig,
      grants: (effective.grants || []).map((g) => g.capability),
    });
  }

  // Stable order: platform-scoped first so base behavior runs before overrides.
  resolved.sort((a, b) =>
    SCOPE_PRECEDENCE[a.installation.scopeType] - SCOPE_PRECEDENCE[b.installation.scopeType]);
  return resolved;
}

module.exports = { resolve, SCOPE_PRECEDENCE };
