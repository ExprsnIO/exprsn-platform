/*
 * Exprsn Platform docs — site manifest.
 * Assigns a global (EXPRSN_DOCS_MANIFEST) instead of being fetched as JSON so
 * it loads via a plain <script> tag with no network/CORS concerns.
 *
 * `markdown[].path` is relative to the REPO ROOT (the viewer resolves it for
 * either serving root — repo root or docs/). `pages` lists the hand-written
 * HTML pages for navigation.
 */
(function (global) {
  'use strict';

  var manifest = {
    markdown: [
      {
        id: 'architecture',
        title: 'Architecture',
        description: 'Unified platform design: the gateway, module contract, schema-per-module data isolation, sockets, and migrations.',
        path: 'ARCHITECTURE.md'
      },
      {
        id: 'api-surface',
        title: 'API Surface',
        description: 'Reference inventory of every REST endpoint and Socket.IO event across the ten consolidated modules.',
        path: 'API_SURFACE.md'
      },
      {
        id: 'status',
        title: 'Status & Follow-ups',
        description: 'The authoritative punch list: integration status, remaining follow-ups, and production-readiness items R1–R6.',
        path: 'STATUS.md'
      },
      {
        id: 'sprint',
        title: 'Sprint Plan',
        description: 'Current sprint plan (MVP release readiness): sequenced tickets with sizing and acceptance criteria.',
        path: 'SPRINT.md'
      },
      {
        id: 'todo',
        title: 'To Do',
        description: 'Running to-do list — open and completed items as they come up.',
        path: 'TODO.md'
      },
      {
        id: 'lowcode-clarifications',
        title: 'Lowcode Clarifications',
        description: 'The 34 answered clarification items driving work on the lowcode and plugins modules.',
        path: 'LOWCODE_CLARIFICATIONS.md'
      },
      {
        id: 'plugins-plan',
        title: 'Plugins Plan',
        description: 'Implementation plan for the flag-gated plugin system: manifest hook bus, phases, sandboxing, and status.',
        path: 'PLUGINS_PLAN.md'
      },
      {
        id: 'plugins-decisions',
        title: 'Plugins Decisions',
        description: 'Exported decision log for the plugin system — companion to the Plugins Plan.',
        path: 'PLUGINS_DECISIONS.md'
      },
      {
        id: 'groups-frontend-plan',
        title: 'Groups Frontend Plan',
        description: 'Groups frontend expansion plan (implemented): cross-module tabs for posts, galleries, files, messages, live, and secrets.',
        path: 'GROUPS_FRONTEND_PLAN.md'
      },
      {
        id: 'groups-admin-plan',
        title: 'Groups Admin Plan',
        description: 'Admin-console Groups (nexus) section expansion plan (implemented): management, moderation, governance, stats, and audit.',
        path: 'GROUPS_ADMIN_PLAN.md'
      },
      {
        id: 'admin-improvements',
        title: 'Admin Improvements',
        description: 'Admin frontend improvement notes: module name, status, uptime, and environment in table format.',
        path: 'FEAT_ADMIN_IMPROVEMENTS.md'
      },
      {
        id: 'admin-interface-report',
        title: 'Admin Interface Report',
        description: 'Endpoint-to-admin-UI mapping across all ten modules, with data-type concerns and a prioritized backlog.',
        path: 'ADMIN_INTERFACE_REPORT.md'
      },
      {
        id: 'claude',
        title: 'CLAUDE.md',
        description: 'Repository guidance for Claude Code: commands, architecture pointers, module contract, testing, and MVP scope.',
        path: 'CLAUDE.md'
      },
      {
        id: 'runbook-secrets',
        title: 'Runbook: Secrets & Rotation',
        description: 'How production secrets are sourced, what must be set before a deploy, and how to rotate each secret.',
        path: 'docs/runbooks/secrets-and-rotation.md'
      }
    ],

    pages: [
      { title: 'Index', href: 'index.html' },
      { title: 'CA', href: 'exprsn-ca.html' },
      { title: 'Auth', href: 'exprsn-auth.html' },
      { title: 'Timeline', href: 'exprsn-timeline.html' },
      { title: 'Prefetch', href: 'exprsn-prefetch.html' },
      { title: 'DB Model', href: 'database-model.html' },
      { title: 'Platform Model', href: 'platform-model.html' },
      { title: 'Glossary', href: 'glossary.html' },
      { title: 'Guides (MD)', href: 'viewer.html' }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = manifest;
  if (global) global.EXPRSN_DOCS_MANIFEST = manifest;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
