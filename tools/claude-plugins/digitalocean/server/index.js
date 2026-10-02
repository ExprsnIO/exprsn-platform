#!/usr/bin/env node
'use strict';

/**
 * DigitalOcean MCP server (stdio, newline-delimited JSON-RPC 2.0).
 * Zero dependencies — implements the small slice of MCP that Claude Code uses:
 * initialize, ping, tools/list, tools/call.
 *
 * Env:
 *   DIGITALOCEAN_TOKEN     personal access token (also DIGITALOCEAN_ACCESS_TOKEN / DO_TOKEN)
 *   DO_MCP_MODE            read-only (default) | read-write | full
 *   DO_MCP_PROTECTED_TAG   tag that blocks disruptive droplet actions (default "protected"; "" disables)
 *   DO_API_BASE_URL        override API base (tests / proxies)
 */

const readline = require('readline');
const { DOClient, resolveToken } = require('./client');
const { loadPolicy } = require('./policy');
const { visibleTools, callTool, annotationsFor } = require('./tools');

const SERVER_INFO = { name: 'digitalocean', version: '0.1.0' };
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

function createServer({ env = process.env, fetchImpl, sleep, write } = {}) {
  const policy = loadPolicy(env);
  const client = new DOClient({ token: resolveToken(env), baseUrl: env.DO_API_BASE_URL, fetchImpl });
  const ctx = { client, policy, sleep: sleep || ((ms) => new Promise((r) => setTimeout(r, ms))) };

  const log = (msg) => process.stderr.write(`[digitalocean-mcp] ${msg}\n`);
  if (policy.invalidMode) log(`unknown DO_MCP_MODE "${policy.invalidMode}", falling back to read-only`);
  if (!client.token) log('DIGITALOCEAN_TOKEN is not set — every tool call will fail until it is exported');

  const instructions =
    `DigitalOcean API tools. Safety mode: ${policy.mode}. ` +
    'Always inspect before changing (list/get), use dry_run to show the user the exact request for any write, ' +
    'and never pass a confirm argument unless the user explicitly approved that specific destructive action.';

  async function handle(msg) {
    const { id, method, params } = msg;
    switch (method) {
      case 'initialize': {
        const requested = params && params.protocolVersion;
        return {
          protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions,
        };
      }
      case 'ping':
        return {};
      case 'tools/list':
        return {
          tools: visibleTools(policy).map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
            annotations: annotationsFor(t),
          })),
        };
      case 'tools/call': {
        const name = params && params.name;
        try {
          const result = await callTool(name, (params && params.arguments) || {}, ctx);
          return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          // Tool failures are results (isError), not protocol errors, so the model can react.
          return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
      }
      default:
        if (id === undefined) return undefined; // notification (e.g. notifications/initialized)
        throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
    }
  }

  async function onLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    try {
      const result = await handle(msg);
      if (msg.id !== undefined && msg.id !== null) write({ jsonrpc: '2.0', id: msg.id, result });
    } catch (err) {
      if (msg.id !== undefined && msg.id !== null) {
        write({ jsonrpc: '2.0', id: msg.id, error: { code: err.code || -32603, message: err.message } });
      }
    }
  }

  return { handle, onLine, policy };
}

if (require.main === module) {
  const write = (obj) => process.stdout.write(`${JSON.stringify(obj)}\n`);
  const server = createServer({ write });
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => { server.onLine(line); });
  rl.on('close', () => process.exit(0));
}

module.exports = { createServer };
