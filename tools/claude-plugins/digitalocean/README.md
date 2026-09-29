# `digitalocean` — Claude Code plugin

Orchestrate DigitalOcean from Claude Code through the DO API v2: inventory,
droplets and droplet actions, DNS, cloud firewalls, App Platform deploys, managed
databases, Kubernetes, load balancers and volumes, plus a policy-checked escape
hatch for any other endpoint.

| Component | What it does |
| --- | --- |
| `server/` | Zero-dependency stdio MCP server (Node ≥ 18) exposing 29 `do_*` tools |
| `skills/digitalocean-ops` | Inspect → resolve → dry-run → approve → execute → verify loop; Exprsn deploy defaults |
| `commands/` | `/digitalocean:do-status`, `/digitalocean:do-provision`, `/digitalocean:do-dns` |
| `agents/do-infra-operator` | Subagent for multi-step DO work, plan-only unless a change is explicitly authorized |
| `hooks/guard.js` | PreToolUse hook: always prompts before deletes / rebuild / restore / raw DELETE, incl. `doctl … delete` in Bash |

## Install

```bash
# 1. token — create at https://cloud.digitalocean.com/account/api/tokens
#    (use a custom-scoped token with only the scopes you need; read-only scopes are enough for status work)
export DIGITALOCEAN_TOKEN=dop_v1_...

# 2. inside Claude Code, from the repo root
/plugin marketplace add ./tools/claude-plugins
/plugin install digitalocean@exprsn-tools
```

Restart Claude Code after changing any of the environment variables below —
the MCP server reads them at start-up.

## Safety model

| `DO_MCP_MODE` | Tools exposed | Allows |
| --- | --- | --- |
| `read-only` *(default)* | list/get/inventory/wait + `do_api_request` GET | nothing that changes state |
| `read-write` | + create droplet, droplet actions, DNS upsert, firewall create, app redeploy | creates, updates, power/resize/snapshot |
| `full` | + `do_delete_droplet`, `do_delete_domain_record` | deletes, `rebuild`/`restore` |

Enforced in the server, not just the prompt:

- **Destructive calls need `confirm`** echoing the exact target (droplet name, record id,
  or the API path for a raw DELETE). A wrong or missing value is refused before any request is sent.
- **Protected tag** (`DO_MCP_PROTECTED_TAG`, default `protected`; set to empty to disable):
  droplets carrying it refuse power-off/reboot/resize/rebuild/restore/delete in every mode.
- **`dry_run: true`** on every write tool returns the exact request without sending it.
- The token is only ever sent to the configured API origin; absolute URLs pointing elsewhere are refused.
- 429/5xx responses are retried with backoff honouring `Retry-After` / `ratelimit-reset`.

The PreToolUse hook adds a second, independent prompt for destructive operations even if
you have allow-listed the plugin's tools.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DIGITALOCEAN_TOKEN` | — | API token (`DIGITALOCEAN_ACCESS_TOKEN` / `DO_TOKEN` also accepted) |
| `DO_MCP_MODE` | `read-only` | `read-only` \| `read-write` \| `full` |
| `DO_MCP_PROTECTED_TAG` | `protected` | tag that blocks disruptive droplet actions; empty disables |
| `DO_API_BASE_URL` | `https://api.digitalocean.com/v2` | override for tests/proxies |

## Tools

Read: `do_account`, `do_inventory`, `do_list_regions`, `do_list_sizes`, `do_list_images`,
`do_list_ssh_keys`, `do_list_projects`, `do_list_tags`, `do_list_droplets`, `do_get_droplet`,
`do_get_action`, `do_wait_for_action`, `do_list_domains`, `do_list_domain_records`,
`do_list_firewalls`, `do_list_load_balancers`, `do_list_volumes`, `do_list_databases`,
`do_list_kubernetes_clusters`, `do_list_apps`, `do_get_app`.

Write: `do_create_droplet`, `do_droplet_action`, `do_upsert_domain_record`,
`do_create_firewall`, `do_create_app_deployment`.

Destroy: `do_delete_droplet`, `do_delete_domain_record`.

Any: `do_api_request` (level follows the HTTP method).

List tools return compact summaries; pass `raw: true` for the full API objects.

## Development

```bash
cd tools/claude-plugins/digitalocean/server && npm test   # node:test, no network, no deps
```

Try the server by hand:

```bash
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"do_account","arguments":{}}}' \
  | node tools/claude-plugins/digitalocean/server/index.js
```

Or load the plugin without installing it: `claude --plugin-dir tools/claude-plugins/digitalocean`.
