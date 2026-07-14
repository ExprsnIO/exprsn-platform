# DigitalOcean / Ubuntu — software inventory

What to install on an Ubuntu droplet to run the Exprsn platform.

**Baseline:** Ubuntu 24.04 LTS (Noble). Package names below are Noble's.

The important thing to understand first: **the backing stack is already
containerized.** `docker-compose.yml` defines Postgres+PostGIS, Redis,
OpenSearch, RabbitMQ, nginx, and SRS (plus optional LDAP/DNS/Kerberos/Dovecot/
strongSwan). You do **not** apt-install those. The host only needs Docker, Node,
and the handful of binaries the Node process actually shells out to.

---

## 1. Host packages (`apt`)

### Base
| Package | Why |
| --- | --- |
| `ca-certificates`, `curl`, `gnupg` | required to add the Docker + NodeSource apt keys |
| `git` | clone/pull the repo |
| `ufw` | host firewall — cannot be a container (see §5, it has a Docker caveat) |
| `unattended-upgrades` | automatic security patches |
| `fail2ban` | SSH brute-force protection |

### Node.js
`package.json` declares `"node": ">=18.0.0"`. Noble's own `nodejs` package is
18.19, which is past end-of-life — install **Node 22 LTS from NodeSource**
instead:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### Native-addon build dependencies
`argon2`, `bcrypt`, and `sharp` are native modules. They normally resolve to
prebuilt binaries on linux-x64, but `npm install` falls back to compiling from
source whenever a prebuild doesn't match — and that failure mode is a confusing
one to debug on a fresh box. Install the toolchain up front:

| Package | Why |
| --- | --- |
| `build-essential` | C/C++ toolchain for node-gyp |
| `python3` | node-gyp requires it |
| `pkg-config` | native module configure step |

### Media
| Package | Why |
| --- | --- |
| `ffmpeg` | **required.** `services/live/src/worker.js` shells out to `ffmpeg` for stream fanout and recording. Without it the live worker fails at runtime, not at boot. |

### Postgres client
| Package | Why |
| --- | --- |
| `postgresql-client-16` | `scripts/backup/pg-backup.sh` and `pg-restore.sh` run `pg_dump` / `pg_restore` / `psql` **on the host**. The major version must match the server — the compose file pins `postgis/postgis:16-3.4`, so pin the client to 16. |

### Docker Engine + Compose v2
Use Docker's official apt repo. Ubuntu's `docker.io` package does not ship
Compose v2, and every `npm run infra:*` script calls `docker compose`.

```
docker-ce  docker-ce-cli  containerd.io  docker-buildx-plugin  docker-compose-plugin
```

### TLS
| Package | Why |
| --- | --- |
| `certbot` | real certificates. Today the platform uses `npm run gen:certs` (dev self-signed) — that is tracked as a release gap in STATUS.md R1 and is not acceptable on a public droplet. |

nginx runs in a container and mounts `./certs` read-only, so run certbot in
standalone/DNS mode and add a deploy hook that copies the issued cert into
`./certs` and restarts the nginx container.

---

## 2. Containers (already defined — nothing to apt-install)

**Core** (`npm run infra:up`) — what `npm start` needs to boot:
`postgis/postgis:16-3.4`, `redis:7-alpine`, `opensearchproject/opensearch:2.18.0`,
`rabbitmq:3.13-management-alpine`, `nginx:1.27-alpine`, `ossrs/srs:5`.

**Extras** (`--profile extras`) — only if you actually use these integrations:
OpenLDAP, BIND9, Kerberos KDC, Dovecot, strongSwan. Note strongSwan is an
amd64-only image using host networking; on an amd64 droplet it works properly,
unlike the emulated dev setup on Apple Silicon.

**Optional** (`--profile optional`): OpenSearch Dashboards, Wireshark.
**Do not run the Wireshark container on a public droplet** — it takes
`NET_ADMIN`, joins the host network namespace, and exposes an unauthenticated
web UI on `:3000`.

---

## 3. Process supervision

`npm start` (the gateway) plus **six** background workers are separate
processes, none of which survive a reboot on their own:

```
worker:timeline  worker:prefetch  worker:atproto
worker:live      worker:cortex    worker:filevault-moderation
```

Use systemd (built into Ubuntu, nothing to install) — one unit per process, with
`Restart=always` and `After=docker.service` so they start after the containers.

---

## 4. Droplet sizing

OpenSearch alone reserves a 512 MB JVM heap and needs kernel tuning; add
Postgres, Redis, RabbitMQ, the gateway, and six workers on top.

- **8 GB / 4 vCPU minimum** for a single all-in-one droplet. 4 GB will thrash.
- DO droplets ship with **no swap** — add a swapfile.
- OpenSearch requires `vm.max_map_count=262144` (`/etc/sysctl.d/`) and the
  memlock/nofile ulimits the compose file already sets.

**Consider offloading to DO managed services** instead of running them on the
droplet: Managed Postgres (enable the PostGIS extension), Managed Redis/Valkey,
Managed OpenSearch, and Spaces for FileVault object storage (the repo already
depends on `aws-sdk` / `@aws-sdk/*`, which speak S3). RabbitMQ has no DO managed
equivalent — keep that one as a container.

---

## 5. Firewall — read this before exposing the droplet

**`ufw` alone will not protect this stack.** Docker writes its own iptables
rules into `DOCKER-USER`, which are evaluated *ahead of* ufw's chain. A
published container port is reachable from the internet even when ufw says the
port is denied.

That matters here because `docker-compose.yml` publishes these to `0.0.0.0` by
default:

| Port | Service | Exposure risk |
| --- | --- | --- |
| 5432 | Postgres | database open to the internet |
| 6379 | Redis | ditto |
| 9200 | OpenSearch | **runs with `DISABLE_SECURITY_PLUGIN=true` — no auth at all** |
| 5672 / 15672 | RabbitMQ + management UI | broker + admin console |
| 8443 | Node gateway | should sit behind nginx, not be reachable directly |

Before this stack goes on a public droplet, bind those mappings to loopback
(`"127.0.0.1:5432:5432"`, etc.) rather than relying on the firewall, and/or
adopt `ufw-docker` to fix the rule ordering.

**Ports that should actually be public:** `22` (SSH, ideally source-restricted),
`80` (nginx + ACME challenge), `443` (nginx), and `1935` only if you accept RTMP
ingest from external publishers.
