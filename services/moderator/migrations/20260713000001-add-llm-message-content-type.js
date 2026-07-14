'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Migration: add 'llm_message' to the content_type enum(s)
 *
 * BUG-015 / FEAT-021 (Cortex) — Cortex's optional moderator cross-screen
 * (`CORTEX_MODERATE=true` → moderatorScreen() in
 * services/cortex/src/engine/jobs.js) POSTs
 *   { contentType: 'llm_message', sourceService: 'cortex', ... }
 * to /moderator/api/moderate/content. But moderation_items.content_type is a
 * Postgres enum of text|image|video|audio|post|comment|message|profile|file —
 * with no 'llm_message'. moderationService's first step is a dedup
 *   ModerationItem.findOne({ where: { sourceService, contentType, contentId } })
 * and Sequelize casts contentType to the enum, so Postgres throws
 *   invalid input value for enum moderator.enum_moderation_items_content_type: "llm_message"
 * BEFORE any moderation happens → the route 500s → cortex catches it and fails
 * open. The feature has therefore never done anything.
 *
 * A downstream logged action (_logAction) writes a ModerationAction with the
 * SAME contentType (moderation_actions.content_type), so that enum needs the
 * value too or a flagged llm_message would fail to persist its action. We add
 * 'llm_message' to ALL of moderator's content_type enums to keep the audit
 * trail whole and the drift-check (`npm run db:check`) clean; adding it to the
 * agent_executions / reports enums as well keeps the four in lock-step with the
 * models (each `DataTypes.ENUM('...', 'llm_message')`).
 *
 * The enum's Postgres type name differs by build path:
 *   - model-sync (scripts/migrate-sync.js): Sequelize names it
 *       enum_moderation_items_content_type / enum_moderation_actions_content_type
 *       / enum_agent_executions_content_type / enum_reports_content_type
 *   - raw sequelize-cli (this dir): a shared named type `content_type`
 * so this migration targets ALL of them, in whatever schema they live, and is
 * idempotent via ADD VALUE IF NOT EXISTS (PG 12+ / this repo is PG16). It does
 * NOT touch other modules' content_type enums (e.g. nexus's
 * enum_group_content_flags_content_type) — only the explicit moderator names.
 * Note: scripts/migrate-sync.js (`npm run db:migrate`) will NOT alter an
 * existing enum — an operator must run THIS migration's up() explicitly
 * (see BUG-015 / mirrors BUG-014).
 * ═══════════════════════════════════════════════════════════
 */

const CONTENT_TYPE_ENUM_TYPES = [
  'content_type', // raw sequelize-cli path (shared named type)
  'enum_moderation_items_content_type', // model-sync — ModerationCase.contentType
  'enum_moderation_actions_content_type', // model-sync — ModerationAction.contentType
  'enum_agent_executions_content_type', // model-sync — AgentExecution.contentType
  'enum_reports_content_type' // model-sync — Report.contentType
];

const TYPES_SQL_LIST = CONTENT_TYPE_ENUM_TYPES.map((v) => `'${v}'`).join(', ');

module.exports = {
  up: async (queryInterface) => {
    // Add 'llm_message' to every moderator content_type enum that exists,
    // schema-qualified and idempotent. ADD VALUE IF NOT EXISTS is valid inside a
    // transaction on PG12+ so long as the new value is not USED in the same
    // transaction — we only add it here, so this is safe under sequelize-cli.
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
            r.schema_name, r.type_name, 'llm_message'
          );
        END LOOP;
      END $$;
    `);
  },

  down: async (queryInterface) => {
    // Postgres has no "DROP VALUE" for an enum, so reversing means rebuilding
    // each content_type enum WITHOUT 'llm_message' and repointing its dependent
    // columns. This is refused (raises) if any live row still uses 'llm_message',
    // to avoid silent data loss — clean up those rows first, then re-run the undo.
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
          -- Nothing to do if this enum never got 'llm_message'.
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum WHERE enumtypid = r.type_oid AND enumlabel = 'llm_message'
          ) THEN
            CONTINUE;
          END IF;

          -- Refuse if any dependent column still holds 'llm_message'. This also
          -- covers array columns (e.g. moderation_rules.applies_to content_type[])
          -- by scanning for the label via a text cast.
          FOR col IN
            SELECT nc.nspname AS col_schema, c.relname AS col_table, a.attname AS col_name,
                   t2.typname AS col_type
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace nc ON nc.oid = c.relnamespace
            JOIN pg_type t2 ON t2.oid = a.atttypid
            WHERE a.attnum > 0
              AND NOT a.attisdropped
              AND c.relkind IN ('r', 'p')
              AND (a.atttypid = r.type_oid OR t2.typelem = r.type_oid)
          LOOP
            EXECUTE format(
              'SELECT count(*) FROM %I.%I WHERE %I::text LIKE %L',
              col.col_schema, col.col_table, col.col_name, '%llm_message%'
            ) INTO used_count;
            IF used_count > 0 THEN
              RAISE EXCEPTION
                'Cannot remove llm_message from %.%: % row(s) in %.%.% still use it',
                r.schema_name, r.type_name, used_count,
                col.col_schema, col.col_table, col.col_name;
            END IF;
          END LOOP;

          -- Build the label list for the rebuilt type, preserving order and
          -- dropping 'llm_message'.
          SELECT string_agg(quote_literal(enumlabel), ', ' ORDER BY enumsortorder)
          INTO remaining_labels
          FROM pg_enum
          WHERE enumtypid = r.type_oid AND enumlabel <> 'llm_message';

          -- Swap: rename old -> create new -> repoint columns -> drop old.
          EXECUTE format('ALTER TYPE %I.%I RENAME TO %I',
            r.schema_name, r.type_name, r.type_name || '_llmmsg_old');
          EXECUTE format('CREATE TYPE %I.%I AS ENUM (%s)',
            r.schema_name, r.type_name, remaining_labels);

          FOR col IN
            SELECT nc.nspname AS col_schema, c.relname AS col_table, a.attname AS col_name,
                   t2.typname AS col_type, t2.typelem AS col_typelem
            FROM pg_attribute a
            JOIN pg_class c ON c.oid = a.attrelid
            JOIN pg_namespace nc ON nc.oid = c.relnamespace
            JOIN pg_type t2 ON t2.oid = a.atttypid
            WHERE a.attnum > 0
              AND NOT a.attisdropped
              AND c.relkind IN ('r', 'p')
              AND (a.atttypid = (SELECT oid FROM pg_type WHERE typname = r.type_name || '_llmmsg_old' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = r.schema_name))
                   OR t2.typelem = (SELECT oid FROM pg_type WHERE typname = r.type_name || '_llmmsg_old' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = r.schema_name)))
          LOOP
            IF col.col_typelem <> 0 THEN
              -- array column: cast element-wise
              EXECUTE format(
                'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I[] USING %I::text[]::%I.%I[]',
                col.col_schema, col.col_table, col.col_name,
                r.schema_name, r.type_name,
                col.col_name,
                r.schema_name, r.type_name
              );
            ELSE
              EXECUTE format(
                'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %I.%I USING %I::text::%I.%I',
                col.col_schema, col.col_table, col.col_name,
                r.schema_name, r.type_name,
                col.col_name,
                r.schema_name, r.type_name
              );
            END IF;
          END LOOP;

          EXECUTE format('DROP TYPE %I.%I', r.schema_name, r.type_name || '_llmmsg_old');
        END LOOP;
      END $$;
    `);
  }
};
