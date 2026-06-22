/**
 * ═══════════════════════════════════════════════════════════
 * Internal HTTPS Agent
 * Shared keep-alive agent for in-process service-to-service calls
 * that loop back through the gateway's HTTPS edge.
 * ═══════════════════════════════════════════════════════════
 *
 * In the consolidated platform every `*_SERVICE_URL` points at
 * https://localhost:8443/<module> — the gateway's own (self-signed in dev)
 * certificate. Node's default agent rejects that cert, so outbound clients
 * reuse this agent. We only relax verification outside production, matching
 * the convention in shared/tls-config.js.
 */

const https = require('https');

let agent = null;

/**
 * Get the shared HTTPS agent for internal (gateway loopback) calls.
 * @returns {https.Agent}
 */
function getInternalHttpsAgent() {
  if (!agent) {
    agent = new https.Agent({
      keepAlive: true,
      // Trust the real chain in production; accept the dev self-signed cert otherwise.
      rejectUnauthorized: process.env.NODE_ENV === 'production'
    });
  }
  return agent;
}

module.exports = { getInternalHttpsAgent };
