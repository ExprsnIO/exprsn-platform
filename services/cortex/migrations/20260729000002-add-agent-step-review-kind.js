'use strict';

/**
 * FEAT-081 — add `agent_step` to `cortex.enum_reviews_kind`.
 *
 * A chained agent run that escalates files a `cortex.reviews` row so a human
 * sees the draft before anything acts on it. FEAT-081 wrote those rows with
 * `kind: 'agent_step'`, but the enum only carried the four pre-existing values,
 * so every escalate threw:
 *
 *     SequelizeDatabaseError: invalid input value for enum
 *     cortex.enum_reviews_kind: "agent_step"
 *
 * — turning "hold this for review" into "fail the run". The escalation silently
 * did not happen, which is the opposite of what the guardrail asked for. The
 * model definition now lists the value, but Sequelize cannot ALTER an existing
 * Postgres enum, so an already-created database needs this migration; a fresh
 * `sync()` picks it up from the model.
 *
 * `ADD VALUE IF NOT EXISTS` is idempotent. Deliberately NOT wrapped in a
 * transaction: Postgres refuses to USE a newly added enum value inside the same
 * transaction that added it, and older versions reject
 * `ALTER TYPE … ADD VALUE` in a transaction block outright.
 *
 * `down()` is a no-op — Postgres has no `DROP VALUE`, and removing one would
 * mean rewriting the type and every dependent column. An unused enum value
 * costs nothing.
 */

const SCHEMA = 'cortex';
const ENUM = 'enum_reviews_kind';
const VALUE = 'agent_step';

module.exports = {
  up: async (queryInterface) => {
    await queryInterface.sequelize.query(
      `ALTER TYPE "${SCHEMA}"."${ENUM}" ADD VALUE IF NOT EXISTS '${VALUE}';`,
    );
    // eslint-disable-next-line no-console
    console.log(`[FEAT-081] ${SCHEMA}.${ENUM} now accepts '${VALUE}'`);
  },

  down: async () => {
    // Postgres cannot drop an enum value; an unused one is harmless.
  },
};
