---
description: Point a hostname at a droplet or IP on DigitalOcean DNS (create or update the record)
argument-hint: "<fqdn> <droplet-name|ip> [ttl]"
---

Point DNS on DigitalOcean: "$ARGUMENTS".

1. Split the FQDN into domain + relative name using `do_list_domains` (longest matching zone; apex = "@").
2. If the target is not an IP, resolve it with `do_list_droplets` (`name`) and use its public IPv4.
3. Look for an existing record with `do_list_domain_records` (`domain`, `type: "A"`, `name: <fqdn>`).
4. Show the change (old → new value, TTL; default 300) via `do_upsert_domain_record` with `dry_run: true`
   (pass `record_id` to update in place). Wait for approval, then apply and re-list to verify.
