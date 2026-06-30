'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Generic state-machine engine.
 *
 * A machine is { name, initial, states:[…], transitions:[{from,event,to,guard?,
 * actions?}] }. `guard` is a condition-tree (conditionEvaluator) evaluated
 * against a context; `actions` are hook-bus actions fired on a successful
 * transition. Reused by:
 *   · the plugin install lifecycle (INSTALL_MACHINE below), and
 *   · low-code entity record lifecycles (lowcode defines its own machines and
 *     drives them through this same engine — shared infra).
 *
 * Pure where it can be: `evaluate()` computes the next state without I/O;
 * `applyInstallTransition()` is the one DB-touching helper.
 * ═══════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');
const { matches } = require('./conditionEvaluator');

const logger = createLogger('exprsn-plugins-fsm');

/** The default plugin install lifecycle. `*` from-state means "any". */
const INSTALL_MACHINE = {
  name: 'install',
  initial: 'installed',
  states: ['installed', 'enabled', 'disabled', 'error', 'uninstalled'],
  transitions: [
    { from: 'installed', event: 'enable', to: 'enabled' },
    { from: 'disabled', event: 'enable', to: 'enabled' },
    { from: 'error', event: 'enable', to: 'enabled' },
    { from: 'enabled', event: 'disable', to: 'disabled' },
    { from: 'installed', event: 'disable', to: 'disabled' },
    { from: 'enabled', event: 'fail', to: 'error' },
    { from: '*', event: 'uninstall', to: 'uninstalled' },
  ],
};

/** Map a lifecycle state to the coarse `status` column the resolver keys off. */
const STATE_TO_STATUS = {
  installed: 'installed',
  enabled: 'enabled',
  disabled: 'disabled',
  error: 'error',
  uninstalled: 'disabled', // resolver excludes; the row is also deleted on uninstall
};

/** Find the transition that fires for (state, event), or null. */
function findTransition(machine, state, event) {
  return (machine.transitions || []).find(
    (t) => (t.from === state || t.from === '*') && t.event === event,
  ) || null;
}

/** All events available from a given state. */
function availableEvents(machine, state) {
  return (machine.transitions || [])
    .filter((t) => t.from === state || t.from === '*')
    .map((t) => t.event);
}

/**
 * Compute the next state for (currentState, event) under `ctx`, honouring any
 * guard. Pure — no I/O. Returns { ok, toState?, transition?, reason? }.
 */
function evaluate(machine, currentState, event, ctx = {}) {
  const t = findTransition(machine, currentState, event);
  if (!t) return { ok: false, reason: `no transition for '${event}' from '${currentState}'` };
  if (t.guard && !matches(t.guard, ctx)) return { ok: false, reason: 'guard not satisfied', transition: t };
  return { ok: true, toState: t.to, transition: t };
}

function models() { return require('../models'); }

/**
 * Drive the install lifecycle machine for one installation and persist the new
 * state (+ a PluginTransition audit row, + any transition actions on the hook
 * bus). Returns { ok, toState, reason? }.
 */
async function applyInstallTransition(installation, event, { actorId, ctx = {} } = {}) {
  const from = installation.lifecycleState || 'installed';
  const res = evaluate(INSTALL_MACHINE, from, event, ctx);
  if (!res.ok) return res;

  installation.lifecycleState = res.toState;
  installation.status = STATE_TO_STATUS[res.toState] || installation.status;
  await installation.save();

  try {
    await models().PluginTransition.create({
      installationId: installation.id, machine: 'install',
      fromState: from, toState: res.toState, event, actor: actorId || null,
    });
  } catch (err) {
    logger.warn('Failed to record install transition', { error: err.message });
  }

  // Fire transition actions on the hook bus (best-effort, never throws).
  const actions = res.transition.actions;
  if (Array.isArray(actions) && actions.length) {
    const pluginHost = require('./pluginHost');
    pluginHost.emit('plugin.lifecycle.transition', {
      installationId: installation.id, from, to: res.toState, event, actions,
    }).catch(() => {});
  }

  return { ok: true, toState: res.toState };
}

module.exports = {
  INSTALL_MACHINE,
  STATE_TO_STATUS,
  findTransition,
  availableEvents,
  evaluate,
  applyInstallTransition,
};
