'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Migration: add 'cortex' to the AI-provider enum(s)
 *
 * BUG-011 / FEAT-023 — the local-LLM "cortex" provider
 * (services/moderator/src/ai-providers/cortex.js) returns
 * `{ provider: 'cortex', ... }`. moderationService persists that into
 * moderation_items.ai_provider (ModerationCase.aiProvider) and the same enum
 * backs ai_agents.provider (AIAgent.provider). Those Postgres enums were
 * created with only claude|openai|deepseek|local, so enforce-mode moderation
 * fails to persist with:
 *   invalid input value for enum moderator.enum_moderation_items_ai_provider: "cortex"
 *
 * We add a DISTINCT 'cortex' label (not a reuse of 'local'): 'local' in
 * config/index.js means local ML MODEL FILES (nsfw/toxicity/spam classifiers) —
 * a different engine than the Cortex local LLM — and FEAT-023's enforcement gate
 * relies on a per-provider accuracy audit trail, which collapses if cortex
 * verdicts are recorded as 'local'.
 *
 * The enum's Postgres type name differs by build path:
 *   - model-sync (scripts/migrate-sync.js): Sequelize names it
 *       enum_moderation_items_ai_provider / enum_ai_agents_provider
 *   - raw sequelize-cli (this dir): a shared named type `ai_provider`
 * so this migration targets ALL of them, in whatever schema they live, and is
 * idempotent via ADD VALUE IF NOT EXISTS (PG 12+ / this repo is PG16). Note:
 * scripts/migrate-sync.js (`npm run db:migrate`) will NOT alter an existing
 * enum — an operator must run THIS migration explicitly (see BUG-011).
 * ═══════════════════════════════════════════════════════════
 */

const PROVIDER_ENUM_TYPES = [
  'ai_provider', // raw sequelize-cli path (shared named type)
  'enum_moderation_items_ai_provider', // model-sync path — ModerationCase.aiProvider
  'enum_ai_agents_provider' // model-sync path — AIAgent.provider
];

const TYPES_SQL_LIST = PROVIDER_ENUM_TYPES.map((v) => `'${v}'`).join(', ');

module.exports = {
  up: async (queryInterface) => {
    // Add 'cortex' to every provider enum that exists, schema-qualified and
    // idempotent. ADD VALUE IF NOT EXISTS is valid inside a transaction on
    // PG12+ so long as the new value is not USED in the same transaction — we
    // only add it here, so this is safe under sequelize-cli.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT n.nspname AS schema_name, t.typname AS type_name
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typtype = 'e'
            AND t.typname IN (${TYPES_SQL_LIST})
        LOOP
          EXECUTE format(
            'ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L',
            r.schema_name, r.type_name, 'cortex'
          );
        END LOOP;
      END $$;
    `);
  },

  down: async (queryInterface) => {
    // Postgres has no "DROP VALUE" for an enum, so reversing means rebuilding
    // each provider enum WITHOUT 'cortex' and repointing its dependent columns.
    // This is refused (raises) if any live row still uses 'cortex', to avoid
    // silent data loss — clean up those rows first, then re-run the undo.
    await queryInterface.sequelize.query(`
      DO $$
      DECLARE
        r record;
        col record;
        used_count bigint;
        remaining_labels text;
      BEGIN
        FOR r IN
          SELECT t.oid AS type_oid, n.nspname AS schema_name, t.typname AS type_name
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typtype = 'e'
            AND t.typname IN (${TYPES_SQL_LIST})
        LOOP
          -- Nothing to do if this enum never got 'cortex'.
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum WHERE enumtypid = r.type_oid AND enumlabel = 'cortex'
          ) THEN
            CONTINUE;
          END IF;

          -- Refuse if any dependent column still holds 'cortex'.
          FOR col IN
            SELECT nc.nspname AS col_schema, c.relname AS col_table, a.attname AS col_name
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace nc ON nc.oid = c.relnamespace
            WHERE a.atttypid = r.type_oid
              AND a.attnum > 0
              AND NOT a.attisdropped
              AND c.relkind IN ('r', 'p')
          LOOP
            EXECUTE format(
              'SELECT count(*) FROM %I.%I WHERE %I = %L',
              col.col_schema, col.col_table, col.col_name, 'cortex'
            ) INTO used_count;
            IF used_count > 0 THEN
              RAISE EXCEPTION
                'Cannot remove cortex from %.%: % row(s) in %.%.% still use it',
                r.schema_name, r.type_name, used_count,
                col.col_schema, col.col_table, col.col_name;
            END IF;
          END LOOP;

          -- Build the label list for the rebuilt type, preserving order and
          -- dropping 'cortex'.
          SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
          INTO remaining_labels
          FROM pg_enum
          WHERE enumtypid = r.type_oid AND enumlabel <> 'cortex';

          -- Swap: rename old -> create new -> repoint columns -> drop old.
          EXECUTE format('ALTER TYPE %I.%I RENAME TO %I',
            r.schema_name, r.type_name, r.type_name || '_cortex_old');
          EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)',
            r.schema_name, r.type_name, remaining_labels);

          FOR col IN
            SELECT nc.nspname AS col_schema, c.relname AS col_table, a.attname AS col_name
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace nc ON nc.oid = c.relnamespace
            WHERE a.atttypid = r.type_oid
              AND a.attnum > 0
              AND NOT a.attisdropped
              AND c.relkind IN ('r', 'p')
          LOOP
            EXECUTE format(
              'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I USING %I::text::%I.%I',
              col.col_schema, col.col_table, col.col_name,
              r.schema_name, r.type_name,
              col.col_name,
              r.schema_name, r.type_name
            );
          END LOOP;

          EXECUTE format('DROP TYPE %I.%I', r.schema_name, r.type_name || '_cortex_old');
        END LOOP;
      END $$;
    `);
  }
};
