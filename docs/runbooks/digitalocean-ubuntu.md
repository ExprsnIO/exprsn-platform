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

**Cortex** (`--profile cortex`): `ollama/ollama` — the OPT-IN secondary
inference backend for the cortex module. Not started by `npm run infra:up*`;
see §6 for the loopback binding, model pull, and firewall posture.

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

If you run the optional Ollama secondary backend (§6), there is also a **oneshot**
provisioner unit, `exprsn-ollama-pull.service`, that brings its container up and
pulls the model. It is deliberately NOT part of `exprsn.target` — enable it only
when you actually opt into Ollama.

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
| 11434 | Ollama (if run, §6) | **unauthenticated LLM — MUST stay loopback-only** |

Before this stack goes on a public droplet, bind those mappings to loopback
(`"127.0.0.1:5432:5432"`, etc.) rather than relying on the firewall, and/or
adopt `ufw-docker` to fix the rule ordering.

**Ports that should actually be public:** `22` (SSH, ideally source-restricted),
`80` (nginx + ACME challenge), `443` (nginx), and `1935` only if you accept RTMP
ingest from external publishers.

---

## 6. Cortex Ollama secondary backend (optional)

Ollama is the **automatic secondary** inference backend for the cortex module
(FEAT-072 / ADR-0005). The **primary** stays the llama.cpp router at
`CORTEX_LLM_BASE_URL`; the backend registry only fails over to Ollama when the
primary is unavailable, and only on **async worker** paths — it is **queue-only**
and never sits on a synchronous request path (enforced in code). It is fully
**opt-in**: the container lives behind the compose `cortex` profile, so
`npm run infra:up*` never starts it and the core stack does not depend on it.

### Loopback binding — non-negotiable

Ollama serves an **unauthenticated** LLM. Its host port is published on
`127.0.0.1:${OLLAMA_PORT:-11434}:11434` in **both** `docker-compose.yml` and
`docker-compose.prod.yml` — **never** `11434:11434`. This is exactly the trap in
**§5**: a `0.0.0.0` mapping puts an open LLM on the public internet, and because
Docker's `DOCKER-USER` iptables chain is evaluated **ahead of** ufw, `ufw status`
would show the port denied while it stays reachable. Loopback binding, not the
firewall, is what closes it. The cortex workers run on the host and reach it over
`http://127.0.0.1:11434`, so nothing breaks.

Verify after start:

```bash
docker port exprsn-ollama
# expect: 11434/tcp -> 127.0.0.1:11434   (NEVER 0.0.0.0:11434)
```

### Resource limits (CPU-only 8 GB droplet)

The service sets `OLLAMA_NUM_PARALLEL=1`, `OLLAMA_MAX_LOADED_MODELS=1`,
`OLLAMA_KEEP_ALIVE=5m`, `OLLAMA_NUM_THREAD=2` — one model loaded, one request at
a time, short keep-alive. Two worker processes (image + video) can hit it at
once, so the `NUM_PARALLEL`/`MAX_LOADED_MODELS=1` caps are load-bearing: a second
request queues behind the first instead of loading a second copy of a multi-GB
model into 8 GB. The `ollama_models` named volume keeps pulled models across
restarts.

### Bring it up and pull the model

Model tag is `CORTEX_OLLAMA_VISION_MODEL` (default `qwen3.5:2b`, chosen for the
CPU-only box). Pull happens at **provision time**, never inside a job:

```bash
# one command does both (up + wait + pull + list):
npm run cortex:ollama:provision
# or on a systemd host, the oneshot unit:
sudo systemctl enable --now exprsn-ollama-pull.service
```

**VERIFY the exact tag** the box actually holds after the pull — Ollama tag names
drift, and the pulled tag is authoritative. Reconcile `.env` if it differs:

```bash
docker exec exprsn-ollama ollama list
```

Then set `CORTEX_OLLAMA_ENABLED=true` (and the rest of the `CORTEX_OLLAMA_*`
block in `.env`) once the cortex backend code is deployed.
