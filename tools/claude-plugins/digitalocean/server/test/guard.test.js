'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { decide } = require('../../hooks/guard');

const P = 'mcp__plugin_digitalocean_digitalocean__';

test('guard asks on destructive MCP calls, passes reads/writes/dry runs', () => {
  assert.match(decide({ tool_name: `${P}do_delete_droplet`, tool_input: { droplet_id: 1 } }), /permanently delete/);
  assert.match(decide({ tool_name: `${P}do_droplet_action`, tool_input: { type: 'rebuild', droplet_id: 1 } }), /wipes/);
  assert.match(decide({ tool_name: `${P}do_api_request`, tool_input: { method: 'delete', path: '/vpcs/x' } }), /DELETE/);
  assert.equal(decide({ tool_name: `${P}do_delete_droplet`, tool_input: { dry_run: true } }), null);
  assert.equal(decide({ tool_name: `${P}do_droplet_action`, tool_input: { type: 'reboot' } }), null);
  assert.equal(decide({ tool_name: `${P}do_list_droplets`, tool_input: {} }), null);
});

test('guard asks on destructive shell commands only', () => {
  assert.ok(decide({ tool_name: 'Bash', tool_input: { command: 'doctl compute droplet delete web-1 -f' } }));
  assert.ok(decide({ tool_name: 'Bash', tool_input: { command: 'curl -X DELETE https://api.digitalocean.com/v2/droplets/1' } }));
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'doctl compute droplet list' } }), null);
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }), null);
});

test('guard script emits hook JSON on stdin/stdout', () => {
  const script = path.join(__dirname, '../../hooks/guard.js');
  const out = execFileSync('node', [script], {
    input: JSON.stringify({ tool_name: `${P}do_delete_droplet`, tool_input: { droplet_id: 1, confirm: 'x' } }),
  }).toString();
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
  assert.equal(execFileSync('node', [script], { input: '{"tool_name":"Read"}' }).toString(), '');
});
