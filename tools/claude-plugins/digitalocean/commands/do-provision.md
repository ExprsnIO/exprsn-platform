---
description: Plan and provision a droplet (optionally for Exprsn) with a cloud firewall and DNS record, previewing every request first
argument-hint: "<name> [region] [size] [fqdn]"
---

Provision infrastructure on DigitalOcean. Arguments: "$ARGUMENTS" (name, then optional region slug, size slug,
and fully-qualified hostname for DNS). Ask for anything missing that you cannot sensibly default.

Use the `digitalocean-ops` skill. If this is for the Exprsn platform, also follow its
`reference/exprsn-deploy.md` defaults (size floor, tags, cloud-firewall ports, cloud-init installer).

1. `do_account` — stop and tell me which `DO_MCP_MODE` is needed if it is `read-only`.
2. Resolve slugs and ids: `do_list_regions`, `do_list_sizes`, `do_list_images` (type distribution),
   `do_list_ssh_keys`, and `do_list_domains` if a hostname was given. Check that no droplet with the same name
   exists (`do_list_droplets` with `name`).
3. Show one plan: droplet spec + monthly price, firewall rules (ask me for my SSH source IP), DNS record.
   Call each write tool with `dry_run: true` and show the requests. Wait for my approval.
4. On approval: `do_create_droplet` → `do_wait_for_action` → `do_get_droplet` for the IP →
   `do_create_firewall` attached by tag (skip if an equivalent firewall already covers the tag) →
   `do_upsert_domain_record` (A record, TTL 300).
5. Verify each resource by re-reading it and report the IP, hostname, firewall id, and next steps
   (e.g. `ssh root@<ip> 'tail -f /var/log/cloud-init-output.log'`).
