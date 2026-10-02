---
name: digitalocean-ops
description: Orchestrate DigitalOcean infrastructure (droplets, droplet actions, DNS records, cloud firewalls, App Platform deploys, managed databases, Kubernetes, load balancers, volumes) through the plugin's do_* MCP tools. Use whenever the user asks to inspect, provision, resize, snapshot, redeploy, re-point DNS for, or tear down anything on DigitalOcean, or to deploy the Exprsn platform to a droplet.
---

# DigitalOcean operations

You drive DigitalOcean through the `do_*` tools of the bundled `digitalocean` MCP
server (a thin, policy-enforcing wrapper over the DO API v2). Follow this loop for
every change — it is the difference between orchestration and guesswork.

## 1. Orient

- Call `do_account` first in a session: it confirms the token works and reports the
  server's **safety mode** (`read-only` / `read-write` / `full`) and the protected tag.
- Call `do_inventory` for the big picture, then the specific `do_list_*` / `do_get_*`
  tool for the resource you are touching.
- If a write tool is missing from your tool list, the server is in a lower mode. Do not
  try to work around it (not via `do_api_request`, not via `doctl`/`curl` in Bash) —
  tell the user which `DO_MCP_MODE` to restart Claude Code with.

## 2. Resolve, never guess

Region, size and image **slugs**, SSH key ids, VPC ids and domain record ids must come
from the API:

| Need | Tool |
| --- | --- |
| region slug | `do_list_regions` (only `available: true`) |
| size slug + price | `do_list_sizes` (check the size lists the chosen region) |
| OS image slug | `do_list_images` with `type: "distribution"` |
| snapshot / custom image id | `do_list_images` with `private: true` |
| SSH key | `do_list_ssh_keys` |
| DNS record id | `do_list_domain_records` with `domain` (+ `type`/`name`) |

## 3. Plan and preview

Before any write, show the user a short plan: what will be created/changed, where,
and the monthly cost delta (from `price_monthly`). Every write tool accepts
`dry_run: true` — call it and show the returned `would_send` request. Batch related
changes (droplet + firewall + DNS) into one plan so the user approves once.

## 4. Execute and verify

- Create/action tools return action ids. Follow with `do_wait_for_action` rather than
  polling by hand, and re-read the resource (`do_get_droplet`, `do_list_domain_records`)
  to confirm the end state before reporting success.
- Report the outcome faithfully: action `errored` or a timed-out wait is a failure, say
  so with the action payload.

## 5. Destructive operations

Deletes, `rebuild` and `restore` require `DO_MCP_MODE=full` **and** a `confirm`
argument that exactly echoes the target (droplet name, record id, or API path for
`do_api_request` DELETE). Rules:

- Only fill `confirm` after the user explicitly approved *that specific* resource in
  this conversation. Approval of a plan that "cleans things up" is not approval to
  delete a named droplet — list the exact names and ask.
- Resources tagged with the protected tag (default `protected`) are refused. Never
  suggest removing the tag to get around it; tell the user it is protected.
- Offer a snapshot (`do_droplet_action` type `snapshot`) before deleting or rebuilding
  a droplet that is not obviously disposable.
- A plugin hook will additionally prompt the user for every destructive call.

## Escape hatch

`do_api_request` reaches any v2 endpoint without a dedicated tool (VPCs, reserved IPs,
CDN, monitoring alerts, Spaces keys, registry, uptime checks, …). Paths are relative to
`/v2`. It obeys the same mode rules (GET read, POST/PUT/PATCH write, DELETE destroy +
`confirm=<path>`). Check the reference at
https://docs.digitalocean.com/reference/api/digitalocean/ for request shapes.

## Exprsn-specific guidance

When the target is the Exprsn platform (this repository), see
`reference/exprsn-deploy.md` in this skill for sizing, firewall and DNS defaults.
