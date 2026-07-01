#!/usr/bin/env bash
# ============================================================================
# Exprsn — Native (bare-metal) target.
#
#   apt (Debian/Ubuntu)  → delegates to scripts/provision-ubuntu.sh, the deep,
#                          fully-wired provisioner (TUI hub, LDAP+KRB-in-LDAP,
#                          MinIO, mail, app deploy, backups).
#   dnf / pacman / brew  → generalized native install via install/lib/os.sh:
#                          core services fully configured (PostgreSQL+PostGIS,
#                          Redis, Nginx edge, MinIO); the identity/mail stack is
#                          installed + enabled with a baseline, and the deep
#                          per-distro config (slapd cn=config, KDC, SSSD/launchd)
#                          is flagged FOR VERIFICATION — it is NOT yet wired to
#                          the apt path's depth on these OSes.
# ============================================================================
set -uo pipefail
DIR="${EXPRSN_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
. "$DIR/install/lib/os.sh"

log()  { printf '[native] %s\n' "$*" >&2; }
warn() { printf '\033[33m[native] %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[31m[native] FATAL: %s\033[0m\n' "$*" >&2; exit 1; }
todo() { printf '\033[33m[native] VERIFY (%s): %s\033[0m\n' "$DISTRO" "$*" >&2; }
rand() { openssl rand -hex "${1:-24}" 2>/dev/null || head -c "${1:-24}" /dev/urandom | xxd -p | tr -d '\n'; }

# ---- deep, distro-specific provisioners ------------------------------------
if [ "$PM" = "apt" ]; then
  log "Debian/Ubuntu detected → handing off to the deep provisioner."
  exec sudo bash "$DIR/scripts/provision-ubuntu.sh"
fi
if [ "$PM" = "dnf" ]; then
  log "Fedora/RHEL detected → handing off to the deep provisioner."
  exec sudo bash "$DIR/scripts/provision-fedora.sh"
fi

# ---- non-apt generalized native path ---------------------------------------
[ "$PM" = "unknown" ] && die "no native backend for this distro; try --mode docker."
command -v openssl >/dev/null 2>&1 || pkg_install openssl 2>/dev/null || true

DB_NAME="exprsn"; DB_USER="exprsn"; DB_PASSWORD="$(rand 24)"
REDIS_PASSWORD="$(rand 24)"
MINIO_ROOT_USER="exprsn-admin"; MINIO_ROOT_PASSWORD="$(rand 16)"
MINIO_APP_KEY="exprsn-app"; MINIO_APP_SECRET="$(rand 20)"
PUBLIC_HOST="$(hostname -f 2>/dev/null || hostname)"
GATEWAY_PORT="8443"
CERT_DIR="/etc/exprsn/certs"; [ "$OS" = macos ] && CERT_DIR="$(osx_brew_prefix)/etc/exprsn/certs"
ENV_OUT="/etc/exprsn/platform.env"; [ "$OS" = macos ] && ENV_OUT="$(osx_brew_prefix)/etc/exprsn/platform.env"

psql_admin() { if [ "$OS" = macos ]; then psql postgres -v ON_ERROR_STOP=1 "$@"; else sudo -u postgres psql -v ON_ERROR_STOP=1 "$@"; fi; }

# Which services to install (env override; default = full set sans app for now).
SERVICES="${EXPRSN_SERVICES:-postgres redis opensearch rabbitmq minio nginx openldap kerberos bind9 postfix dovecot strongswan firewall}"
has() { [[ " $SERVICES " == *" $1 "* ]]; }

prep() { log "refreshing package index…"; pkg_update; pkg_install $(os_pkgs base); }

do_tls() {
  sudo mkdir -p "$CERT_DIR"
  if [ ! -s "$CERT_DIR/platform.key" ]; then
    log "self-signed TLS cert → $CERT_DIR"
    sudo openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout "$CERT_DIR/platform.key" -out "$CERT_DIR/platform.crt" \
      -subj "/CN=$PUBLIC_HOST" -addext "subjectAltName=DNS:$PUBLIC_HOST,DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
    sudo chmod 600 "$CERT_DIR/platform.key"
  fi
}

do_postgres() {
  pkg_install $(os_pkgs postgres)
  pg_first_init
  svc_enable_now "$(pg_unit)"; svc_restart "$(pg_unit)"
  sleep 2
  psql_admin <<SQL || warn "postgres role/db step had issues"
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASSWORD}';
  ELSE ALTER ROLE "${DB_USER}" WITH LOGIN PASSWORD '${DB_PASSWORD}'; END IF;
END \$\$;
SELECT 'CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${DB_NAME}')\gexec
SQL
  psql_admin -d "$DB_NAME" <<'SQL' || warn "extension creation had issues (postgis package present?)"
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
  log "PostgreSQL ready: db=$DB_NAME owner=$DB_USER."
}

do_redis() {
  pkg_install $(os_pkgs redis)
  local conf
  case "$PM" in dnf|pacman) conf=/etc/redis/redis.conf; [ -f /etc/redis.conf ] && conf=/etc/redis.conf ;; brew) conf="$(osx_brew_prefix)/etc/redis.conf" ;; esac
  if [ -n "${conf:-}" ] && [ -f "$conf" ]; then
    sudo sed -ri "s/^#?\s*requirepass .*/requirepass ${REDIS_PASSWORD}/" "$conf" 2>/dev/null \
      || echo "requirepass ${REDIS_PASSWORD}" | sudo tee -a "$conf" >/dev/null
  fi
  svc_enable_now "$(redis_unit)"; svc_restart "$(redis_unit)"
  log "Redis ready (auth set)."
}

do_opensearch() {
  case "$PM" in
    dnf)
      if [ ! -f /etc/yum.repos.d/opensearch-2.x.repo ]; then
        sudo tee /etc/yum.repos.d/opensearch-2.x.repo >/dev/null <<'EOF'
[opensearch-2.x]
name=OpenSearch 2.x
baseurl=https://artifacts.opensearch.org/releases/bundle/opensearch/2.x/yum
enabled=1
gpgcheck=1
gpgkey=https://artifacts.opensearch.org/publickeys/opensearch-PGP-KEY.pub
EOF
      fi
      OPENSEARCH_INITIAL_ADMIN_PASSWORD="$(rand 16)" pkg_install opensearch || warn "opensearch install failed"
      svc_enable_now opensearch ;;
    pacman) warn "OpenSearch is in the AUR on Arch — install 'opensearch' via an AUR helper, or use --mode docker for search."; return ;;
    brew) pkg_install opensearch; svc_enable_now opensearch ;;
    *) warn "OpenSearch: no native path for $DISTRO; use docker." ; return ;;
  esac
  log "OpenSearch installed (security defaults vary by distro — verify)."
}

do_rabbitmq() {
  pkg_install $(os_pkgs rabbitmq)
  svc_enable_now rabbitmq-server 2>/dev/null || svc_enable_now rabbitmq
  command -v rabbitmq-plugins >/dev/null 2>&1 && sudo rabbitmq-plugins enable rabbitmq_management >/dev/null 2>&1 || true
  log "RabbitMQ installed (+management). Set a user with rabbitmqctl add_user."
}

do_minio() {
  case "$ARCH" in x86_64|amd64) MARCH=amd64 ;; aarch64|arm64) MARCH=arm64 ;; *) MARCH=amd64 ;; esac
  local bindir=/usr/local/bin; [ "$OS" = macos ] && bindir="$(osx_brew_prefix)/bin"
  if [ ! -x "$bindir/minio" ]; then
    local plat=linux; [ "$OS" = macos ] && plat=darwin
    sudo curl -fsSL "https://dl.min.io/server/minio/release/${plat}-${MARCH}/minio" -o "$bindir/minio" && sudo chmod +x "$bindir/minio"
    sudo curl -fsSL "https://dl.min.io/client/mc/release/${plat}-${MARCH}/mc" -o "$bindir/mc" && sudo chmod +x "$bindir/mc"
  fi
  sudo mkdir -p /var/lib/minio 2>/dev/null || true
  if [ "$SVC" = systemd ]; then
    id minio-user >/dev/null 2>&1 || sudo useradd -r -s /usr/sbin/nologin minio-user
    sudo chown minio-user: /var/lib/minio
    sudo tee /etc/default/minio >/dev/null <<EOF
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
MINIO_VOLUMES=/var/lib/minio
MINIO_OPTS=--address :9000 --console-address :9001
EOF
    sudo tee /etc/systemd/system/minio.service >/dev/null <<'EOF'
[Unit]
Description=MinIO
After=network.target
[Service]
User=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=on-failure
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
EOF
    svc_daemon_reload; svc_enable_now minio
  else
    todo "create a launchd plist for MinIO (server /usr/local/var/minio)"
  fi
  local i; for i in $(seq 1 30); do "$bindir/mc" alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 && break; sleep 1; done
  "$bindir/mc" mb --ignore-existing local/exprsn-filevault local/exprsn-ca-certificates >/dev/null 2>&1 || true
  "$bindir/mc" admin user add local "$MINIO_APP_KEY" "$MINIO_APP_SECRET" >/dev/null 2>&1 || true
  "$bindir/mc" admin policy attach local readwrite --user "$MINIO_APP_KEY" >/dev/null 2>&1 || true
  log "MinIO ready: buckets exprsn-filevault, exprsn-ca-certificates."
}

do_nginx() {
  pkg_install $(os_pkgs nginx)
  selinux_relax_proxy
  local snippet
  read -r -d '' snippet <<EOF || true
upstream exprsn_gateway { server 127.0.0.1:${GATEWAY_PORT}; }
proxy_ssl_verify off;
server { listen 80; server_name ${PUBLIC_HOST}; return 301 https://\$host\$request_uri; }
server {
    listen 443 ssl; server_name ${PUBLIC_HOST};
    ssl_certificate ${CERT_DIR}/platform.crt; ssl_certificate_key ${CERT_DIR}/platform.key;
    client_max_body_size 100m; root /var/www/exprsn; index index.html;
    location ~ ^/(ca|auth|spark|nexus|filevault|vault|timeline|prefetch|moderator|live|atproto|health)(/|\$) {
        proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; proxy_read_timeout 300s; }
    location /socket.io/ { proxy_pass https://exprsn_gateway; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_set_header Host \$host; proxy_read_timeout 300s; }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
  local target
  case "$PM" in
    dnf|pacman) target=/etc/nginx/conf.d/exprsn.conf ;;
    brew) sudo mkdir -p "$(osx_brew_prefix)/etc/nginx/servers"; target="$(osx_brew_prefix)/etc/nginx/servers/exprsn.conf" ;;
  esac
  sudo mkdir -p /var/www/exprsn 2>/dev/null || true
  echo "<h1>Exprsn edge is up</h1>" | sudo tee /var/www/exprsn/index.html >/dev/null 2>&1 || true
  echo "$snippet" | sudo tee "$target" >/dev/null
  sudo nginx -t && { svc_enable_now nginx; svc_reload nginx; } || warn "nginx config test failed — review $target"
  log "Nginx edge → 127.0.0.1:${GATEWAY_PORT} (config: $target)."
}

# --- identity / mail stack: install + enable + flag deep config -------------
do_openldap() { pkg_install $(os_pkgs openldap); svc_enable_now slapd 2>/dev/null || todo "enable slapd (dnf uses 'slapd', config via slapd.ldif / cn=config differs)"; todo "wire base DN + admin DN + ou=People/Groups (apt path does this fully; port slapd cn=config here)"; }
do_kerberos() { pkg_install $(os_pkgs kerberos); todo "configure KDC with LDAP backend (krb5-kdc-ldap exists only on apt; Fedora/Arch need the kldap plugin path; macOS uses Heimdal, not MIT kdb5_ldap_util)"; }
do_bind9()    { pkg_install $(os_pkgs bind9); svc_enable_now named 2>/dev/null || svc_enable_now bind 2>/dev/null || true; todo "write the ${PUBLIC_HOST} zone + MX/SRV (zone authoring is portable; only paths differ: /etc/named.conf vs /etc/bind)"; }
do_postfix()  { pkg_install $(os_pkgs postfix); svc_enable_now postfix; todo "LDAP-backed virtual mailbox maps (postfix-ldap pkg name/availability differs off-apt)"; }
do_dovecot()  { pkg_install $(os_pkgs dovecot); svc_enable_now dovecot; todo "LDAP userdb/passdb (dovecot-ldap split package on apt; bundled elsewhere)"; }
do_strongswan(){ pkg_install $(os_pkgs strongswan); svc_enable_now strongswan 2>/dev/null || true; log "strongSwan installed."; }
do_firewall() {
  pkg_install $(os_pkgs firewall) 2>/dev/null || true
  fw_allow 22/tcp; has nginx && { fw_allow 80/tcp; fw_allow 443/tcp; }; fw_allow ${GATEWAY_PORT}/tcp
  has openldap && { fw_allow 389/tcp; fw_allow 636/tcp; }
  has bind9 && { fw_allow 53/tcp; fw_allow 53/udp; }
  has minio && { fw_allow 9000/tcp; fw_allow 9001/tcp; }
  fw_enable; log "firewall configured."
}

write_env() {
  sudo mkdir -p "$(dirname "$ENV_OUT")"
  sudo tee "$ENV_OUT" >/dev/null <<EOF
# Generated by install/targets/native.sh on $(hostname) ($DISTRO)
NODE_ENV=production
HOST=0.0.0.0
HTTPS_PORT=${GATEWAY_PORT}
PUBLIC_HOST=${PUBLIC_HOST}
TLS_ENABLED=true
TLS_CERT_PATH=${CERT_DIR}/platform.crt
TLS_KEY_PATH=${CERT_DIR}/platform.key
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_SSL=false
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=${REDIS_PASSWORD}
ELASTICSEARCH_NODE=http://localhost:9200
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=exprsn-filevault
S3_REGION=us-east-1
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=${MINIO_APP_KEY}
AWS_SECRET_ACCESS_KEY=${MINIO_APP_SECRET}
S3_BUCKET_NAME=exprsn-ca-certificates
S3_BUCKET_PREFIX=ca/
JWT_SECRET=$(rand 32)
SESSION_SECRET=$(rand 32)
SERVICE_TOKEN_SECRET=$(rand 48)
SERVICE_ID=platform
EOF
  sudo chmod 600 "$ENV_OUT"
  log "wrote $ENV_OUT"
}

main() {
  warn "Native backend for '$DISTRO' (pacman/brew) is a FIRST PASS: core services"
  warn "are fully configured; the LDAP/Kerberos/SSSD/mail deep wiring is complete"
  warn "on apt + dnf only, and flagged with VERIFY lines below. (Debian/Ubuntu →"
  warn "provision-ubuntu.sh, Fedora/RHEL → provision-fedora.sh.) --mode docker = full parity."
  prep
  do_tls
  has postgres   && do_postgres
  has redis      && do_redis
  has opensearch && do_opensearch
  has rabbitmq   && do_rabbitmq
  has minio      && do_minio
  has openldap   && do_openldap
  has kerberos   && do_kerberos
  has bind9      && do_bind9
  has postfix    && do_postfix
  has dovecot    && do_dovecot
  has strongswan && do_strongswan
  has nginx      && do_nginx
  write_env
  has firewall   && do_firewall
  printf '\033[32m'
  echo "===================================================================="
  echo " Native install ($DISTRO) — core services up; identity stack flagged."
  echo "   Config: $ENV_OUT"
  echo "   Verify: scroll up for VERIFY lines (LDAP/KRB/mail deep config)."
  echo "===================================================================="
  printf '\033[0m'
}
main "$@"
