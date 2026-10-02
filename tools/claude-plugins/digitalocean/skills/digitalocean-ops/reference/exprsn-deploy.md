# Deploying Exprsn to DigitalOcean — defaults

Source of truth in the repo: `docs/runbooks/digitalocean-ubuntu.md` (software
inventory, sizing, firewall) and `install/cloud/digitalocean.sh` (the doctl
provisioner this plugin's flow mirrors). Re-read those if they disagree with this
file — they win.

## Droplet

- **Size:** 8 GB / 4 vCPU minimum for the all-in-one stack (OpenSearch + Postgres +
  Redis + RabbitMQ + gateway + workers). 4 GB thrashes. `s-4vcpu-8gb` is the floor.
- **Image:** latest Ubuntu LTS distribution slug from `do_list_images`.
- **Tags:** `exprsn` plus an environment tag (`exprsn-staging` / `exprsn-prod`). Add
  `protected` to production droplets so disruptive actions are refused.
- **Monitoring:** leave on (default). Enable backups for production.
- **user_data:** a cloud-init file that runs the installer unattended
  (`install/install.sh --unattended`; see `install/README.md`). Keep it under 64 KiB.

## Cloud firewall (do this — ufw is not enough)

Docker's `DOCKER-USER` iptables chain is evaluated ahead of ufw, so containers
published on `0.0.0.0` (Postgres 5432, Redis 6379, OpenSearch 9200 with security
disabled, RabbitMQ 5672/15672, gateway 8443, Ollama 11434) are internet-reachable
even when ufw denies them. A **DigitalOcean cloud firewall** filters before traffic
reaches the droplet, so it closes that hole. Attach it by tag (`exprsn`) so new
droplets inherit it.

Inbound rules:

| Port | Source | Why |
| --- | --- | --- |
| 22/tcp | the operator's IP(s) — ask; never default to `0.0.0.0/0` without saying so | SSH |
| 80/tcp | `0.0.0.0/0`, `::/0` | nginx + ACME HTTP-01 |
| 443/tcp | `0.0.0.0/0`, `::/0` | nginx edge (SPA + API) |
| 1935/tcp | only if the user accepts external RTMP ingest | live streaming |

Do **not** open 8443 or any backing-service port.

## DNS

If the domain is on DigitalOcean DNS: `A` (and `AAAA` if ipv6) for the hostname →
droplet public IP, TTL 300 during cut-over, raise to 1800 afterwards.

## Managed services (optional)

Offloading is recommended by the runbook: Managed Postgres (enable PostGIS), Managed
Redis/Valkey, Managed OpenSearch, Spaces for FileVault. RabbitMQ stays a container.
Put managed databases and the droplet in the same VPC and restrict the database
trusted sources to the droplet/tag (`do_api_request` on
`/databases/{id}/firewall`).
