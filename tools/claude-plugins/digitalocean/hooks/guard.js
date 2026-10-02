#!/usr/bin/env node
'use strict';

/**
 * PreToolUse guard — defence in depth on top of the MCP server's own policy.
 *
 * Forces an interactive permission prompt ("ask") for anything that destroys
 * DigitalOcean resources, even if the user has allow-listed the plugin's tools:
 *   - do_delete_* tools
 *   - do_droplet_action with rebuild / restore
 *   - do_api_request with DELETE
 *   - Bash: doctl … delete/rm, or curl/http DELETE against api.digitalocean.com
 * dry_run calls pass through. Everything else is left to normal permissions.
 */

const MCP_PREFIX = 'mcp__plugin_digitalocean_digitalocean__';

function decide(event) {
  const name = event.tool_name || '';
  const input = event.tool_input || {};

  if (name.startsWith(MCP_PREFIX)) {
    if (input.dry_run) return null;
    const tool = name.slice(MCP_PREFIX.length);
    if (tool.startsWith('do_delete_')) {
      return `DigitalOcean: ${tool} will permanently delete ${JSON.stringify(input)}.`;
    }
    if (tool === 'do_droplet_action' && ['rebuild', 'restore'].includes(input.type)) {
      return `DigitalOcean: ${input.type} wipes the disk of droplet ${input.droplet_id}.`;
    }
    if (tool === 'do_api_request' && String(input.method).toUpperCase() === 'DELETE') {
      return `DigitalOcean: raw API DELETE ${input.path}.`;
    }
    return null;
  }

  if (name === 'Bash') {
    const cmd = String(input.command || '');
    if (/\bdoctl\b[^\n;|&]*\s(delete|rm|destroy)\b/.test(cmd)) {
      return 'DigitalOcean: doctl delete command.';
    }
    if (/api\.digitalocean\.com/.test(cmd) && /(-X\s*|--request\s+)DELETE\b/i.test(cmd)) {
      return 'DigitalOcean: raw API DELETE via shell.';
    }
  }
  return null;
}

function main() {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let event;
    try { event = JSON.parse(raw || '{}'); } catch { process.exit(0); }
    const reason = decide(event);
    if (reason) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `${reason} This cannot be undone — approve only if intended.`,
        },
      }));
    }
    process.exit(0);
  });
}

if (require.main === module) main();

module.exports = { decide };
