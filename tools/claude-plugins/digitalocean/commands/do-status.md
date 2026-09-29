---
description: Summarize the DigitalOcean account — resources, health, spend and anything that needs attention
argument-hint: "[tag]"
---

Give me a concise DigitalOcean status report. If a tag was given ("$ARGUMENTS"), scope droplets to it.

1. Call `do_account` (token check, balance, safety mode) and `do_inventory` (pass `tag_name` if a tag was given).
2. Report as a short table per resource type that has items: name, status, region, size/plan, public IP or URL.
3. Then list anything that needs attention: droplets not `active`, App Platform deployments not `ACTIVE`,
   databases not `online`, droplets not covered by any cloud firewall (compare firewall `droplet_ids`/`tags`
   against droplet ids/tags), and month-to-date spend.
4. Do not change anything. End with the current safety mode.
