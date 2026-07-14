# Deploying to an Ubuntu droplet

Companion to `docs/runbooks/digitalocean-ubuntu.md` (which lists the software to
install). This covers wiring it together: systemd units, the production compose
overlay, and the firewall rules they depend on.

Assumes the repo is at `/opt/exprsn`, owned by a system user `exprsn`. If you
deploy elsewhere, change `WorkingDirectory` in the two unit files to match — see
the dotenv warning below.

---

## 1. Layout

```
deploy/systemd/exprsn-gateway.service    # the HTTPS edge, :8443
deploy/systemd/exprsn-worker@.service    # templated — one instance per worker
deploy/systemd/exprsn.target             # starts/stops the whole platform
docker-compose.prod.yml                  # production overlay (repo root)
```

## 2. Compose overlay

The base `docker-compose.yml` publishes Postgres, Redis, OpenSearch and RabbitMQ
to `0.0.0.0`. That is fine on a laptop and **unsafe on a public droplet** —
OpenSearch in particular runs with `DISABLE_SECURITY_PLUGIN=true`, so it has no
authentication whatsoever. `docker-compose.prod.yml` republishes all of them on
loopback.

Always apply both files. Set this in the deploy user's shell profile so it is
impossible to forget:

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

Then `docker compose up -d` picks up both. Verify before exposing the droplet:

```bash
docker compose config | grep -A1 published    # every datastore must show 127.0.0.1
sudo ss -tlnp | grep -vE '127\.0\.0\.1|::1'   # what is ACTUALLY listening publicly
```

That second command is the one that matters — it is ground truth, and it is how
you catch a stale container still holding an old binding.

The overlay pins the Docker network to `172.28.0.0/16`. If the network already
exists from an earlier run, Compose will not re-create it with the new subnet —
`docker network rm exprsn-net` first.

## 3. systemd units

The gateway and **six** workers are separate host processes, none of which
survive a reboot on their own.

```bash
sudo cp deploy/systemd/exprsn-gateway.service /etc/systemd/system/
sudo cp deploy/systemd/exprsn-worker@.service /etc/systemd/system/
sudo cp deploy/systemd/exprsn.target          /etc/systemd/system/
sudo systemctl daemon-reload

sudo systemctl enable --now exprsn-gateway.service
sudo systemctl enable --now \
  exprsn-worker@timeline.service \
  exprsn-worker@prefetch.service \
  exprsn-worker@atproto.service \
  exprsn-worker@live.service \
  exprsn-worker@cortex.service \
  exprsn-worker@filevault.service
sudo systemctl enable exprsn.target
```

After that, `systemctl restart exprsn.target` cycles the whole platform, and
`journalctl -u exprsn-worker@live -f` tails one worker.

**Two things that will bite you if you edit these units:**

- **`WorkingDirectory=/opt/exprsn` is load-bearing.** `src/config/index.js` and
  every worker call a bare `require('dotenv').config()`, which resolves `.env`
  relative to the *current working directory*. Point the unit somewhere else and
  the process starts with no configuration at all and fails obscurely.
- **The worker instance name is the module DIRECTORY, not the npm script name.**
  `package.json` calls the last one `worker:filevault-moderation`, but the code
  lives at `services/filevault/src/worker.js` — so the unit is
  `exprsn-worker@filevault`, and that is what makes one template serve all six.

## 4. Firewall

`ufw` alone does not protect the containers — Docker's `DOCKER-USER` iptables
rules are evaluated ahead of ufw's chain, so a published container port is
reachable from the internet even when ufw reports it as denied. That is why §2
binds the datastores to loopback rather than trusting the firewall.

ufw *does* correctly govern **host** processes, which is what the gateway is.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp                     # SSH — ideally restrict to your IP
sudo ufw allow 80/tcp                     # nginx + ACME http-01 challenge
sudo ufw allow 443/tcp                    # nginx

# Only if external publishers (OBS) push RTMP to this droplet. Otherwise drop
# the 1935 mapping from docker-compose.prod.yml instead — a ufw rule will not
# close a published container port.
sudo ufw allow 1935/tcp

# The gateway (:8443) is a host process that must NOT be public, but the nginx
# CONTAINER has to reach it. It therefore cannot bind loopback — nginx connects
# from inside the Docker network, not from 127.0.0.1. Allow exactly that source
# range and nothing else. This is why the overlay pins the subnet.
sudo ufw allow from 172.28.0.0/16 to any port 8443 proto tcp

sudo ufw enable
```

Leave `HOST` unset (defaults to `0.0.0.0`) — the gateway needs to accept the
container's connection, and the ufw rule above is what keeps :8443 off the
public internet.

## 5. Required `.env` settings

Beyond the usual credentials, production needs:

```ini
NODE_ENV=production
TRUST_PROXY=true                  # nginx fronts the gateway; without this,
                                  # rate limiting and audit logs see nginx's IP
                                  # as the client for every request
CORS_ORIGIN=https://your.domain   # never '*' — a wildcard means same-origin
                                  # only, so cross-origin calls fail silently
PUBLIC_HOST=your.domain
TLS_CERT_PATH=/opt/exprsn/certs/platform.crt
TLS_KEY_PATH=/opt/exprsn/certs/platform.key
```

`HTTP_REDIRECT_PORT=0` is already set in the gateway unit — nginx owns `:80` and
issues the redirect, and without this the gateway binds a second redirect
listener on `0.0.0.0:8080`.

**Do not ship `npm run gen:certs` output.** That is a dev self-signed pair
(STATUS.md R1 tracks this as an open release gap). Issue real certificates with
certbot and have the deploy hook copy them into `./certs`, which the nginx
container mounts read-only, then `docker compose restart nginx`.

## 6. Order of operations on first boot

```bash
docker compose up -d          # containers first — the gateway connects to
                              # Postgres/Redis at require() time and will
                              # crash-loop until they accept connections
npm ci
npm run db:bootstrap          # create the db + one schema per module
npm run db:migrate            # sync models into their schemas
npm run web:build             # nginx serves web/dist
sudo systemctl start exprsn.target
curl -k https://localhost:8443/health
```

The units use `Restart=always` with `StartLimitIntervalSec=0`, so they retry
forever rather than giving up after systemd's default five-failures-in-ten-
seconds burst limit — which a slow Postgres start would otherwise trip on every
reboot.
