# Exprsn Platform — Docker infrastructure

`docker-compose.yml` (repo root) provisions every backing service the platform
talks to, split into three Compose **profiles**:

| Tier         | Profile    | Services |
|--------------|------------|----------|
| **Core**     | *(none)*   | `postgres` (+PostGIS), `redis`, `opensearch`, `rabbitmq`, `nginx` |
| **Extras**   | `extras`   | `openldap`, `bind` (DNS), `kerberos` (KDC+kadmin), `dovecot` (IMAP/POP3), `strongswan` (IPsec) |
| **Optional** | `optional` | `opensearch-dashboards`, `wireshark` |

Core is everything `npm start` actually needs to boot. Extras are the
directory/network/mail services the platform integrates with. Optional is
developer/observability tooling.

## Quick start

```bash
cp .env.example .env          # set DB/Redis/RabbitMQ/LDAP/etc. secrets
npm run infra:pull            # pull all images (all tiers)
npm run infra:up              # start CORE only
# or
npm run infra:up:all          # start core + extras + optional
npm run infra:start           # pull + up:all in one shot
```

Other scripts: `npm run infra:ps`, `npm run infra:logs`, `npm run infra:down`.

Then the normal app bootstrap:

```bash
npm run gen:certs && npm run db:bootstrap && npm run db:migrate && npm start
```

## Image map

| Service        | Image                                         | Host ports | Notes |
|----------------|-----------------------------------------------|------------|-------|
| postgres       | `postgis/postgis:16-3.4`                      | 5432 | PostGIS + uuid-ossp/pg_trgm/citext seeded on first boot |
| redis          | `redis:7-alpine`                              | 6379 | AOF on; password only if `REDIS_PASSWORD` set |
| opensearch     | `opensearchproject/opensearch:2.18.0`         | 9200, 9600 | security plugin off for dev; ES client compatible |
| rabbitmq       | `rabbitmq:3.13-management-alpine`             | 5672, 15672 | management UI on 15672 |
| nginx          | `nginx:1.27-alpine`                            | 80, 443 | reverse proxy → host `:8443` |
| openldap       | `osixia/openldap:1.5.0`                        | 389, 636 | admin `cn=admin,dc=exprsn,dc=local` |
| bind           | `internetsystemsconsortium/bind9:9.20`        | 53/tcp+udp | authoritative for `exprsn.local`, recursive otherwise |
| kerberos       | `gcavalcante8808/krb5-server`                  | 88/udp, 749, 464/udp | community KDC image (no official one exists) |
| dovecot        | `dovecot/dovecot:2.4.1`                        | 143, 993, 110, 995 | built-in 2.4 config; dev user via `USER_PASSWORD` |
| strongswan     | `strongx509/strongswan:6.0.6`                  | host net | IKEv2; edit `docker/strongswan/swanctl.conf` |
| os-dashboards  | `opensearchproject/opensearch-dashboards:2.18.0` | 5601 | |
| wireshark      | `lscr.io/linuxserver/wireshark:latest`         | 3000 (host net) | web UI |

Config lives under `docker/`: `nginx/nginx.conf`, `postgres/initdb/`,
`bind/etc/`, `strongswan/swanctl.conf`. All are mounted read-only; edit and
re-`up` to apply. (Dovecot 2.4 uses its image's built-in config.)

## Host firewall (`ufw`) — not a container

`ufw` was on the request list, but a host firewall manages the **host kernel's**
netfilter tables, which a container cannot own — there is no image to pull and
no compose service can stand in for it. Configure it on the host instead:

```bash
# Debian/Ubuntu host
sudo apt-get install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 8443/tcp        # platform HTTPS edge
sudo ufw allow 80,443/tcp      # nginx (if used)
sudo ufw enable
```

> **macOS note:** this dev host is macOS, which has no `ufw`. Use the built-in
> Application Firewall (`socketfilterfw`) or `pf`. `ufw` only applies on a Linux
> host/VM. Also beware: Docker publishes ports by writing iptables rules that
> can bypass `ufw` on Linux — restrict published ports or use
> `ufw-docker` to reconcile the two.

## Security caveats (these are DEV defaults)

- OpenSearch security plugin and Dovecot TLS are **disabled** for local dev.
- Default passwords are `change_me` placeholders — set real secrets in `.env`.
- `strongswan` and `wireshark` use `network_mode: host` + `NET_ADMIN`; they see
  the host's real interfaces. Only run them when you need them.
- nginx proxies upstream with `proxy_ssl_verify off` (dev self-signed cert).
