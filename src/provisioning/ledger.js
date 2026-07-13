/**
 * ═══════════════════════════════════════════════════════════════════════
 * Provisioning ledger (FEAT-032 / ADR-0003 Decision 3 §1c)
 * ═══════════════════════════════════════════════════════════════════════
 * Thin wrapper over the auth `ProvisioningRun` model — the saga's idempotency
 * ledger. The engine drives every step through here: findOrCreate the run
 * (resume-forward or short-circuit), advance the cursor while merging created
 * ids, and finalize (completed / failed / compensation_failed).
 *
 * The auth model is LAZILY required (inside the accessor) so this composition-
 * layer library never eagerly pulls auth's Sequelize at module load — mirroring
 * the engine's lazy-require discipline (ADR-0003 Decision 2c).
 */

function provisioningRunModel() {
  // Lazy require: the engine's sole model, reached through auth's Sequelize.
  return require('../../services/auth/src/models').ProvisioningRun;
}

/**
 * Find-or-create the ledger row for a full org provisioning run.
 * @param {Object} params - { idempotencyKey, kind?, organizationId? }
 * @returns {Promise<{ run, created: boolean }>}
 */
async function findOrCreateRun({ idempotencyKey, kind = 'org', organizationId = null }) {
  const ProvisioningRun = provisioningRunModel();
  const [run, created] = await ProvisioningRun.findOrCreate({
    where: { idempotencyKey, kind },
    defaults: {
      idempotencyKey,
      kind,
      organizationId,
      status: 'in_progress',
      ids: {}
    }
  });
  return { run, created };
}

/**
 * Find-or-create the per-member credentialing ledger row (the FEAT-035 seam).
 * @param {Object} params - { idempotencyKey, userId, organizationId? }
 * @returns {Promise<{ run, created: boolean }>}
 */
async function findOrCreateMemberRun({ idempotencyKey, userId, organizationId = null }) {
  const ProvisioningRun = provisioningRunModel();
  const [run, created] = await ProvisioningRun.findOrCreate({
    where: { idempotencyKey, userId, kind: 'member' },
    defaults: {
      idempotencyKey,
      kind: 'member',
      userId,
      organizationId,
      status: 'in_progress',
      ids: {}
    }
  });
  return { run, created };
}

/**
 * Advance the resume-forward cursor to `stepId`, merging any newly-created ids
 * into the ledger's `ids` JSONB.
 * @param {ProvisioningRun} run
 * @param {string} stepId - e.g. 'S4'
 * @param {Object} [idsPatch] - ids/flags to merge
 * @returns {Promise<ProvisioningRun>}
 */
async function advance(run, stepId, idsPatch = {}) {
  run.cursor = stepId;
  run.ids = { ...(run.ids || {}), ...idsPatch };
  run.changed('ids', true);
  await run.save();
  return run;
}

/**
 * Mark the run completed, merging the final id set.
 * @param {ProvisioningRun} run
 * @param {Object} [ids]
 * @returns {Promise<ProvisioningRun>}
 */
async function markCompleted(run, ids = {}) {
  run.status = 'completed';
  run.ids = { ...(run.ids || {}), ...ids };
  run.changed('ids', true);
  await run.save();
  return run;
}

/**
 * Mark the run failed (compensation is expected to have run / be running).
 * @param {ProvisioningRun} run
 * @param {Object} error - { step, code, message }
 * @returns {Promise<ProvisioningRun>}
 */
async function markFailed(run, error) {
  run.status = 'failed';
  run.error = error || null;
  await run.save();
  return run;
}

/**
 * Reset a failed-and-fully-compensated run so a same-key retry re-runs from S1
 * on a clean slate, rather than resuming forward over resources that
 * compensation already destroyed (ADR-0003 RC-2: only a `completed` run may
 * short-circuit; a `failed` run that unwound cleanly must restart).
 * @param {ProvisioningRun} run
 * @returns {Promise<ProvisioningRun>}
 */
async function resetForRetry(run) {
  run.cursor = null;
  run.ids = {};
  run.error = null;
  run.status = 'in_progress';
  run.changed('ids', true);
  await run.save();
  return run;
}

/**
 * Park the run in compensation_failed with residual ids + the compensator error.
 * @param {ProvisioningRun} run
 * @param {Object} [residualIds] - ids that could not be compensated
 * @param {Error} [err] - the compensator failure
 * @returns {Promise<ProvisioningRun>}
 */
async function markCompensationFailed(run, residualIds = {}, err = null) {
  run.status = 'compensation_failed';
  run.ids = { ...(run.ids || {}), ...residualIds };
  run.changed('ids', true);
  run.error = {
    ...(run.error || {}),
    compensation: err ? err.message : 'compensation failed'
  };
  await run.save();
  return run;
}

module.exports = {
  findOrCreateRun,
  findOrCreateMemberRun,
  advance,
  markCompleted,
  markFailed,
  resetForRetry,
  markCompensationFailed
};
