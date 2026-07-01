#!/usr/bin/env bash
# ============================================================================
# Exprsn Platform — bare-metal provisioner for Ubuntu 25.x on DigitalOcean
# ----------------------------------------------------------------------------
# Menu-driven TUI (dialog) that installs and configures, as NATIVE systemd
# services, the full docker-compose backing stack PLUS the application itself:
#
#   Infra      : PostgreSQL+PostGIS, Redis, OpenSearch, RabbitMQ, Nginx,
#                OpenLDAP, Kerberos (KDC), BIND9, Postfix, Dovecot, strongSwan,
#                MinIO (S3), OpenSSL, UFW, SSSD host login
#   App        : Node deploy, web build, db:bootstrap/db:migrate, gateway +
#                worker systemd units
#   Hardening  : swap + sysctl, LDAPS, nightly pg_dump + slapcat backups
#
# Identity model (as requested):
#   • OpenLDAP is the directory + authentication source.
#   • Kerberos principals (admin, per-user, and host/service) live INSIDE
#     OpenLDAP (kdb5_ldap_util / kldap) — no local KDC file database.
#   • Postfix + Dovecot are LDAP-backed (virtual mailboxes keyed on mail=).
#   • The Ubuntu host authenticates logins against LDAP+Kerberos (SSSD).
#   • Users/groups are defined ONCE and provisioned into LDAP + Kerberos + mail.
#
# Flow: a hub menu you can revisit; edit any section, then Install. Nothing is
# touched until you confirm. One domain entry fans out into realm, base DN,
# DNS zone, mail domain and cert SAN.
#
# Usage (fresh Ubuntu 25.x droplet, as root, from the platform repo root):
#   bash scripts/provision-ubuntu.sh
# ============================================================================

set -uo pipefail   # not -e: dialog returns nonzero on Cancel and we handle it.

# ---------------------------------------------------------------------------
# 0. Globals
# ---------------------------------------------------------------------------
BT="Exprsn Platform Provisioner — Ubuntu 25.x"
CERT_DIR="/etc/exprsn/certs"
LOG="/var/log/exprsn-provision.log"
UI="whiptail"
export DEBIAN_FRONTEND=noninteractive

declare -A CFG
SERVICES=""

c_red() { printf '\033[31m%s\033[0m\n' "$*"; }
c_grn() { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw() { printf '\033[33m%s\033[0m\n' "$*"; }
log()   { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$LOG" >&2; }
die()   { c_red "FATAL: $*"; exit 1; }
rand_hex() { openssl rand -hex "${1:-24}"; }
gen_secret() { rand_hex "${1:-24}"; }
has() { [[ " $SERVICES " == *" $1 "* ]]; }
realm_from_domain()  { echo "${1^^}"; }
basedn_from_domain() { echo "dc=$(echo "$1" | sed 's/\./,dc=/g')"; }

# ---------------------------------------------------------------------------
# 1. dialog/whiptail wrappers
# ---------------------------------------------------------------------------
ui_input()  { $UI --backtitle "$BT" --title "$1" --inputbox    "$2" 11 78 "${3:-}" 3>&1 1>&2 2>&3; }
ui_pass()   { $UI --backtitle "$BT" --title "$1" --passwordbox "$2" 11 78          3>&1 1>&2 2>&3; }
ui_yesno()  { $UI --backtitle "$BT" --title "$1" --yesno       "$2" 13 78; }
ui_msg()    { $UI --backtitle "$BT" --title "$1" --msgbox      "$2" 20 80; }
ui_menu()   { local t="$1" x="$2" lh="$3"; shift 3
  $UI --backtitle "$BT" --title "$t" --menu "$x" 24 88 "$lh" "$@" 3>&1 1>&2 2>&3; }
ui_radio()  { local t="$1" x="$2" lh="$3"; shift 3
  $UI --backtitle "$BT" --title "$t" --radiolist "$x" 16 86 "$lh" "$@" 3>&1 1>&2 2>&3 | tr -d '"'; }
ui_check()  { local t="$1" x="$2" lh="$3"; shift 3
  $UI --backtitle "$BT" --title "$t" --separate-output --checklist "$x" 24 88 "$lh" "$@" 3>&1 1>&2 2>&3; }

# ---------------------------------------------------------------------------
# 2. Preflight
# ---------------------------------------------------------------------------
need_root() { [ "$(id -u)" -eq 0 ] || die "Run as root (sudo bash $0)."; }
detect_ip() {
  curl -fsS --max-time 4 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
    || ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || echo "127.0.0.1"
}
detect_appdir() {
  local d; d=$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" rev-parse --show-toplevel 2>/dev/null)
  [ -n "$d" ] && [ -f "$d/package.json" ] && { echo "$d"; return; }
  echo "/opt/exprsn-platform"
}

preflight() {
  need_root
  [ -r /etc/os-release ] && . /etc/os-release || true
  [ "${ID:-}" = "ubuntu" ] || c_ylw "WARNING: tuned for Ubuntu; detected '${ID:-?}'."
  case "${VERSION_ID:-}" in 25.*|24.*) : ;; *) c_ylw "Untested Ubuntu '${VERSION_ID:-?}'." ;; esac
  mkdir -p /etc/exprsn "$CERT_DIR"; chmod 700 /etc/exprsn
  : > "$LOG" 2>/dev/null || true
  if command -v dialog >/dev/null 2>&1; then UI=dialog
  else apt-get update -qq 2>/dev/null && apt-get install -y -qq dialog >/dev/null 2>&1 && UI=dialog \
    || { command -v whiptail >/dev/null 2>&1 || apt-get install -y -qq whiptail >/dev/null 2>&1; UI=whiptail; c_ylw "dialog unavailable — using whiptail (forms become step-by-step)."; }
  fi
  command -v openssl >/dev/null 2>&1 || apt-get install -y -qq openssl >/dev/null 2>&1
  log "Preflight OK on ${PRETTY_NAME:-unknown}; UI=$UI."
}

# ---------------------------------------------------------------------------
# 3. Defaults
# ---------------------------------------------------------------------------
init_defaults() {
  local ip host; ip=$(detect_ip); host=$(hostname -f 2>/dev/null || hostname)
  CFG[PRIMARY_DOMAIN]="exprsn.io"
  CFG[PUBLIC_HOST]="${host:-exprsn.example.com}"
  CFG[PUBLIC_IP]="$ip"
  CFG[INTERNAL_ZONE]="exprsn.local"
  CFG[GATEWAY_PORT]="8443"
  CFG[KRB5_REALM]="$(realm_from_domain "${CFG[PRIMARY_DOMAIN]}")"
  CFG[LDAP_BASE_DN]="$(basedn_from_domain "${CFG[PRIMARY_DOMAIN]}")"

  SERVICES="postgres redis opensearch rabbitmq minio nginx openldap kerberos bind9 postfix dovecot strongswan app ufw hostlogin backups"

  CFG[TLS_MODE]="selfsigned"; CFG[LE_EMAIL]="admin@${CFG[PRIMARY_DOMAIN]}"
  CFG[TLS_IMPORT_CRT]=""; CFG[TLS_IMPORT_KEY]=""
  CFG[TLS_CERT_PATH]="$CERT_DIR/platform.crt"; CFG[TLS_KEY_PATH]="$CERT_DIR/platform.key"

  CFG[JWT_SECRET]="$(gen_secret 32)"; CFG[SESSION_SECRET]="$(gen_secret 32)"
  CFG[SERVICE_TOKEN_SECRET]="$(gen_secret 48)"; CFG[ATPROTO_SIGNING_KEY]="$(gen_secret 32)"
  CFG[LDAP_ADMIN_PASSWORD]="$(gen_secret 20)"; CFG[KRB5_MASTER_PASSWORD]="$(gen_secret 24)"
  CFG[KRB5_ADMIN_PASSWORD]="$(gen_secret 20)"

  CFG[DB_NAME]="exprsn"; CFG[DB_USER]="exprsn"; CFG[DB_PASSWORD]="$(gen_secret 24)"
  CFG[DB_PORT]="5432"; CFG[DB_REMOTE]="no"; CFG[DB_REMOTE_CIDR]="10.0.0.0/8"

  CFG[REDIS_PASSWORD]="$(gen_secret 24)"; CFG[REDIS_PORT]="6379"
  CFG[OS_HEAP]="512m"; CFG[OS_SECURITY]="off"; CFG[OS_ADMIN_PASSWORD]="$(gen_secret 16)"
  CFG[RABBITMQ_USER]="exprsn"; CFG[RABBITMQ_PASSWORD]="$(gen_secret 24)"

  CFG[LDAP_ORG]="Exprsn"; CFG[LDAP_TLS]="yes"
  CFG[KRB5_CONTAINER_DN]="cn=krbContainer,${CFG[LDAP_BASE_DN]}"
  CFG[HOST_LOGIN]="yes"

  # Users & groups (provisioned into LDAP + Kerberos + mail). Records: uid|email|group|password
  CFG[GROUPS]="admins moderators users"
  CFG[USERS]="admin|admin@${CFG[PRIMARY_DOMAIN]}|admins|$(gen_secret 12)"

  CFG[MAIL_DOMAIN]="${CFG[PRIMARY_DOMAIN]}"; CFG[MAIL_HOSTNAME]="mail.${CFG[PRIMARY_DOMAIN]}"

  # MinIO / S3
  CFG[MINIO_PORT]="9000"; CFG[MINIO_CONSOLE_PORT]="9001"
  CFG[MINIO_ROOT_USER]="exprsn-admin"; CFG[MINIO_ROOT_PASSWORD]="$(gen_secret 16)"
  CFG[MINIO_APP_KEY]="exprsn-app"; CFG[MINIO_APP_SECRET]="$(gen_secret 20)"
  CFG[MINIO_BUCKETS]="exprsn-filevault exprsn-ca-certificates"

  CFG[DNS_FORWARDERS]="1.1.1.1 8.8.8.8"
  CFG[VPN_REMOTE_ADDR]=""; CFG[VPN_LOCAL_TS]="10.10.0.0/16"; CFG[VPN_REMOTE_TS]="10.20.0.0/16"; CFG[VPN_PSK]="$(gen_secret 24)"

  # App deploy
  CFG[APP_DIR]="$(detect_appdir)"; CFG[APP_REPO_URL]=""; CFG[NODE_MAJOR]="20"
  CFG[APP_USER]="exprsn"; CFG[APP_BUILD_WEB]="yes"; CFG[APP_SEED_DEMO]="no"

  # Hardening / backups
  CFG[SWAP_SIZE]="2G"; CFG[BACKUP_DIR]="/var/backups/exprsn"; CFG[BACKUP_KEEP]="7"

  CFG[ENV_TARGET]="both"; CFG[ENV_REPO_PATH]="${CFG[APP_DIR]}/.env"; CFG[ENV_PRINT]="no"
}

# ---------------------------------------------------------------------------
# 4. Section editors
# ---------------------------------------------------------------------------
edit_domain() {
  if [ "$UI" = dialog ]; then
    local out prev="${CFG[PRIMARY_DOMAIN]}"
    out=$(dialog --backtitle "$BT" --title "1 · Domain & Identity" --form \
      "Type the primary domain; realm + base DN are derived (editable)." 18 78 7 \
      "Primary domain"     1 2 "${CFG[PRIMARY_DOMAIN]}" 1 22 46 0 \
      "Public FQDN (edge)" 2 2 "${CFG[PUBLIC_HOST]}"    2 22 46 0 \
      "Public IPv4"        3 2 "${CFG[PUBLIC_IP]}"      3 22 46 0 \
      "Internal DNS zone"  4 2 "${CFG[INTERNAL_ZONE]}"  4 22 46 0 \
      "Kerberos realm"     5 2 "${CFG[KRB5_REALM]}"     5 22 46 0 \
      "LDAP base DN"       6 2 "${CFG[LDAP_BASE_DN]}"   6 22 46 0 \
      "Gateway port"       7 2 "${CFG[GATEWAY_PORT]}"   7 22 46 0 \
      3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"
    CFG[PRIMARY_DOMAIN]="${v[0]}"; CFG[PUBLIC_HOST]="${v[1]}"; CFG[PUBLIC_IP]="${v[2]}"
    CFG[INTERNAL_ZONE]="${v[3]}"; CFG[KRB5_REALM]="${v[4]}"; CFG[LDAP_BASE_DN]="${v[5]}"; CFG[GATEWAY_PORT]="${v[6]}"
    if [ "${CFG[PRIMARY_DOMAIN]}" != "$prev" ]; then
      [ "${CFG[KRB5_REALM]}" = "$(realm_from_domain "$prev")" ]   && CFG[KRB5_REALM]="$(realm_from_domain "${CFG[PRIMARY_DOMAIN]}")"
      [ "${CFG[LDAP_BASE_DN]}" = "$(basedn_from_domain "$prev")" ] && CFG[LDAP_BASE_DN]="$(basedn_from_domain "${CFG[PRIMARY_DOMAIN]}")"
    fi
  else
    CFG[PRIMARY_DOMAIN]=$(ui_input "Domain" "Primary domain" "${CFG[PRIMARY_DOMAIN]}") || return 0
    CFG[KRB5_REALM]="$(realm_from_domain "${CFG[PRIMARY_DOMAIN]}")"; CFG[LDAP_BASE_DN]="$(basedn_from_domain "${CFG[PRIMARY_DOMAIN]}")"
    CFG[PUBLIC_HOST]=$(ui_input "Identity" "Public FQDN (edge)" "${CFG[PUBLIC_HOST]}") || true
    CFG[PUBLIC_IP]=$(ui_input "Identity" "Public IPv4" "${CFG[PUBLIC_IP]}") || true
    CFG[INTERNAL_ZONE]=$(ui_input "Identity" "Internal DNS zone" "${CFG[INTERNAL_ZONE]}") || true
    CFG[GATEWAY_PORT]=$(ui_input "Identity" "Gateway port" "${CFG[GATEWAY_PORT]}") || true
  fi
  CFG[KRB5_CONTAINER_DN]="cn=krbContainer,${CFG[LDAP_BASE_DN]}"
  CFG[MAIL_DOMAIN]="${CFG[PRIMARY_DOMAIN]}"; CFG[MAIL_HOSTNAME]="mail.${CFG[PRIMARY_DOMAIN]}"
}

edit_services() {
  local out
  out=$(ui_check "2 · Services" "Select services to install (space toggles)." 16 \
    "postgres" "PostgreSQL + PostGIS"             "$(has postgres && echo ON||echo OFF)" \
    "redis" "Redis"                               "$(has redis && echo ON||echo OFF)" \
    "opensearch" "OpenSearch"                     "$(has opensearch && echo ON||echo OFF)" \
    "rabbitmq" "RabbitMQ"                         "$(has rabbitmq && echo ON||echo OFF)" \
    "minio" "MinIO (S3 object storage)"           "$(has minio && echo ON||echo OFF)" \
    "nginx" "Nginx (TLS edge)"                    "$(has nginx && echo ON||echo OFF)" \
    "openldap" "OpenLDAP (directory + auth)"      "$(has openldap && echo ON||echo OFF)" \
    "kerberos" "Kerberos KDC (principals in LDAP)" "$(has kerberos && echo ON||echo OFF)" \
    "bind9" "BIND9 (DNS + MX/SRV)"                "$(has bind9 && echo ON||echo OFF)" \
    "postfix" "Postfix (LDAP-backed SMTP)"        "$(has postfix && echo ON||echo OFF)" \
    "dovecot" "Dovecot (LDAP-backed IMAP/POP3)"   "$(has dovecot && echo ON||echo OFF)" \
    "strongswan" "strongSwan (IPsec)"             "$(has strongswan && echo ON||echo OFF)" \
    "srs" "SRS (live ingest)"                     "$(has srs && echo ON||echo OFF)" \
    "app" "Deploy platform (Node+web+systemd)"    "$(has app && echo ON||echo OFF)" \
    "hostlogin" "Host login via LDAP+Kerberos"    "$(has hostlogin && echo ON||echo OFF)" \
    "backups" "Nightly pg_dump + slapcat"         "$(has backups && echo ON||echo OFF)" \
    "ufw" "UFW host firewall"                     "$(has ufw && echo ON||echo OFF)") || return 0
  SERVICES=$(echo "$out" | tr '\n' ' ')
  if { has kerberos || has hostlogin; } && ! has openldap; then SERVICES="$SERVICES openldap"; ui_msg "Dependency" "Kerberos-in-LDAP / host login require OpenLDAP — re-enabled."; fi
}

edit_keys() {
  local mode
  mode=$(ui_radio "3 · TLS certificate" "Certificate source for the Nginx edge:" 3 \
    "selfsigned" "OpenSSL self-signed" "$([ "${CFG[TLS_MODE]}" = selfsigned ] && echo ON||echo OFF)" \
    "letsencrypt" "Let's Encrypt (certbot)" "$([ "${CFG[TLS_MODE]}" = letsencrypt ] && echo ON||echo OFF)" \
    "import" "Import existing crt/key" "$([ "${CFG[TLS_MODE]}" = import ] && echo ON||echo OFF)") || return 0
  [ -n "$mode" ] && CFG[TLS_MODE]="$mode"
  case "${CFG[TLS_MODE]}" in
    letsencrypt) CFG[LE_EMAIL]=$(ui_input "Let's Encrypt" "Contact email" "${CFG[LE_EMAIL]}") || true ;;
    import) CFG[TLS_IMPORT_CRT]=$(ui_input "Import cert" "Path to certificate (.crt PEM)" "${CFG[TLS_IMPORT_CRT]:-/etc/ssl/exprsn.crt}") || true
            CFG[TLS_IMPORT_KEY]=$(ui_input "Import key" "Path to private key (.key PEM)" "${CFG[TLS_IMPORT_KEY]:-/etc/ssl/exprsn.key}") || true ;;
  esac
  local sel k v
  sel=$(ui_check "3 · Keys & secrets" "Tick a secret to TYPE it. Unticked keep their auto-generated value." 8 \
    "JWT_SECRET" "JWT signing secret" OFF "SESSION_SECRET" "Session secret" OFF \
    "SERVICE_TOKEN_SECRET" "Service HMAC seed" OFF "ATPROTO_SIGNING_KEY" "AT-Proto signing key" OFF \
    "LDAP_ADMIN_PASSWORD" "OpenLDAP admin password" OFF "KRB5_MASTER_PASSWORD" "Kerberos KDC master" OFF) || return 0
  while IFS= read -r k; do [ -z "$k" ] && continue; v=$(ui_pass "Secret" "Value for ${k}:") || continue; [ -n "$v" ] && CFG[$k]="$v"; done <<< "$sel"
}

edit_postgres() {
  CFG[DB_NAME]=$(ui_input "4 · PostgreSQL" "Database name" "${CFG[DB_NAME]}") || return 0
  CFG[DB_USER]=$(ui_input "4 · PostgreSQL" "Role/username" "${CFG[DB_USER]}") || return 0
  local p; p=$(ui_pass "4 · PostgreSQL" "Password for '${CFG[DB_USER]}' (blank=keep)") || true; [ -n "$p" ] && CFG[DB_PASSWORD]="$p"
  CFG[DB_PORT]=$(ui_input "4 · PostgreSQL" "Listen port" "${CFG[DB_PORT]}") || true
  if ui_yesno "4 · PostgreSQL" "Allow remote TCP (all interfaces + pg_hba)? No = localhost only."; then
    CFG[DB_REMOTE]="yes"; CFG[DB_REMOTE_CIDR]=$(ui_input "4 · PostgreSQL" "CIDR allowed (md5)" "${CFG[DB_REMOTE_CIDR]}") || true
  else CFG[DB_REMOTE]="no"; fi
}

edit_directory() {
  if [ "$UI" = dialog ]; then
    local out
    out=$(dialog --backtitle "$BT" --title "5 · Directory & Auth" --form \
      "OpenLDAP is the auth source; Kerberos principals are stored in it. Passwords on the Keys screen." 15 80 4 \
      "Organisation"     1 2 "${CFG[LDAP_ORG]}"         1 20 50 0 \
      "Base DN"          2 2 "${CFG[LDAP_BASE_DN]}"      2 20 50 0 \
      "Kerberos realm"   3 2 "${CFG[KRB5_REALM]}"        3 20 50 0 \
      "KDC container DN" 4 2 "${CFG[KRB5_CONTAINER_DN]}" 4 20 50 0 \
      3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"
    CFG[LDAP_ORG]="${v[0]}"; CFG[LDAP_BASE_DN]="${v[1]}"; CFG[KRB5_REALM]="${v[2]}"; CFG[KRB5_CONTAINER_DN]="${v[3]}"
  else
    CFG[LDAP_ORG]=$(ui_input "5 · Directory" "Organisation" "${CFG[LDAP_ORG]}") || return 0
    CFG[LDAP_BASE_DN]=$(ui_input "5 · Directory" "Base DN" "${CFG[LDAP_BASE_DN]}") || true
    CFG[KRB5_REALM]=$(ui_input "5 · Directory" "Kerberos realm" "${CFG[KRB5_REALM]}") || true
    CFG[KRB5_CONTAINER_DN]=$(ui_input "5 · Directory" "KDC container DN" "${CFG[KRB5_CONTAINER_DN]}") || true
  fi
  ui_yesno "5 · Directory" "Enable LDAPS/StartTLS using the platform cert (instead of snakeoil)?" && CFG[LDAP_TLS]=yes || CFG[LDAP_TLS]=no
  if ui_yesno "5 · Directory" "Configure THIS host to authenticate logins against LDAP+Kerberos (SSSD/PAM)?"; then
    CFG[HOST_LOGIN]="yes"; has hostlogin || SERVICES="$SERVICES hostlogin"
  else CFG[HOST_LOGIN]="no"; SERVICES=$(echo "$SERVICES" | sed 's/ hostlogin//; s/hostlogin //'); fi
}

add_user() {
  local u email grp p
  if [ "$UI" = dialog ]; then
    local out; out=$(dialog --backtitle "$BT" --title "Add user" --mixedform "New directory user (password blank = auto):" 13 70 4 \
      "uid"      1 2 ""      1 12 30 0 0 \
      "email"    2 2 ""      2 12 40 0 0 \
      "group"    3 2 "users" 3 12 30 0 0 \
      "password" 4 2 ""      4 12 30 0 1 \
      3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"; u="${v[0]}"; email="${v[1]}"; grp="${v[2]}"; p="${v[3]}"
  else
    u=$(ui_input "Add user" "uid") || return 0
    email=$(ui_input "Add user" "email") || true
    grp=$(ui_input "Add user" "group" "users") || true
    p=$(ui_pass "Add user" "password (blank=auto)") || true
  fi
  [ -z "$u" ] && return 0
  [ -z "$email" ] && email="${u}@${CFG[MAIL_DOMAIN]}"
  [ -z "$grp" ] && grp="users"
  [ -z "$p" ] && p="$(gen_secret 12)"
  CFG[USERS]="${CFG[USERS]}
${u}|${email}|${grp}|${p}"
}

edit_users() {
  while true; do
    local items=() i=0 u email grp p
    while IFS='|' read -r u email grp p; do [ -z "$u" ] && continue; items+=("$i" "${u}  <${email}>  [${grp}]"); i=$((i+1)); done <<< "${CFG[USERS]}"
    local choice
    choice=$(ui_menu "6 · Users & Groups" "Groups: ${CFG[GROUPS]}\nEach user → LDAP entry + Kerberos principal + mailbox." 14 \
      "${items[@]}" "A" "➕ Add user" "G" "Edit group list" "B" "◀ Back") || return 0
    case "$choice" in
      A) add_user ;;
      G) CFG[GROUPS]=$(ui_input "Groups" "Space-separated group names" "${CFG[GROUPS]}") || true ;;
      B|"") return 0 ;;
      *) if ui_yesno "Remove user" "Delete user #${choice} from the list?"; then
           local n=0 keep=""; while IFS= read -r line; do [ -z "$line" ] && continue; [ "$n" != "$choice" ] && keep="${keep}${line}"$'\n'; n=$((n+1)); done <<< "${CFG[USERS]}"
           CFG[USERS]="${keep%$'\n'}"; fi ;;
    esac
  done
}

edit_mail() {
  CFG[MAIL_DOMAIN]=$(ui_input "7 · Mail" "Primary mail domain" "${CFG[MAIL_DOMAIN]}") || return 0
  CFG[MAIL_HOSTNAME]=$(ui_input "7 · Mail" "Mail server hostname (FQDN)" "${CFG[MAIL_HOSTNAME]}") || true
  ui_msg "7 · Mail" "Mailboxes are LDAP-backed: every directory user with a 'mail' attribute is a valid recipient and can log in to IMAP/POP3 with their email address. Manage accounts under section 6 (Users & Groups)."
}

edit_minio() {
  if [ "$UI" = dialog ]; then
    local out; out=$(dialog --backtitle "$BT" --title "8 · Object storage (MinIO)" --mixedform \
      "S3-compatible storage for filevault + CA. App key/secret go into .env." 16 78 6 \
      "API port"      1 2 "${CFG[MINIO_PORT]}"         1 16 20 0 0 \
      "Console port"  2 2 "${CFG[MINIO_CONSOLE_PORT]}" 2 16 20 0 0 \
      "Root user"     3 2 "${CFG[MINIO_ROOT_USER]}"    3 16 30 0 0 \
      "Root password" 4 2 "${CFG[MINIO_ROOT_PASSWORD]}" 4 16 30 0 1 \
      "App key"       5 2 "${CFG[MINIO_APP_KEY]}"      5 16 30 0 0 \
      "App secret"    6 2 "${CFG[MINIO_APP_SECRET]}"   6 16 30 0 1 \
      3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"
    CFG[MINIO_PORT]="${v[0]}"; CFG[MINIO_CONSOLE_PORT]="${v[1]}"; CFG[MINIO_ROOT_USER]="${v[2]}"
    CFG[MINIO_ROOT_PASSWORD]="${v[3]}"; CFG[MINIO_APP_KEY]="${v[4]}"; CFG[MINIO_APP_SECRET]="${v[5]}"
  else
    CFG[MINIO_PORT]=$(ui_input "8 · MinIO" "API port" "${CFG[MINIO_PORT]}") || return 0
    CFG[MINIO_ROOT_USER]=$(ui_input "8 · MinIO" "Root user" "${CFG[MINIO_ROOT_USER]}") || true
  fi
  CFG[MINIO_BUCKETS]=$(ui_input "8 · MinIO" "Buckets to create (space-separated)" "${CFG[MINIO_BUCKETS]}") || true
}

edit_netvpn() {
  CFG[DNS_FORWARDERS]=$(ui_input "9 · DNS" "BIND9 upstream forwarders (space-separated)" "${CFG[DNS_FORWARDERS]}") || return 0
  CFG[VPN_REMOTE_ADDR]=$(ui_input "9 · VPN" "strongSwan peer IP (blank=undefined)" "${CFG[VPN_REMOTE_ADDR]}") || true
  if [ -n "${CFG[VPN_REMOTE_ADDR]}" ]; then
    CFG[VPN_LOCAL_TS]=$(ui_input "9 · VPN" "Local traffic selector" "${CFG[VPN_LOCAL_TS]}") || true
    CFG[VPN_REMOTE_TS]=$(ui_input "9 · VPN" "Remote traffic selector" "${CFG[VPN_REMOTE_TS]}") || true
    local p; p=$(ui_pass "9 · VPN" "Pre-shared key (blank=keep)") || true; [ -n "$p" ] && CFG[VPN_PSK]="$p"
  fi
}

edit_app() {
  CFG[APP_DIR]=$(ui_input "10 · App deploy" "Platform repo dir on this host" "${CFG[APP_DIR]}") || return 0
  if [ ! -f "${CFG[APP_DIR]}/package.json" ]; then
    CFG[APP_REPO_URL]=$(ui_input "10 · App deploy" "No code there — git URL to clone (blank=skip deploy)" "${CFG[APP_REPO_URL]}") || true
  fi
  CFG[NODE_MAJOR]=$(ui_input "10 · App deploy" "Node.js major version" "${CFG[NODE_MAJOR]}") || true
  ui_yesno "10 · App deploy" "Build the web SPA (npm run web:build)?" && CFG[APP_BUILD_WEB]=yes || CFG[APP_BUILD_WEB]=no
  ui_yesno "10 · App deploy" "Run db:bootstrap + db:migrate, then seed demo timeline data?\n\nYes = also run seed:timeline." && CFG[APP_SEED_DEMO]=yes || CFG[APP_SEED_DEMO]=no
  CFG[ENV_REPO_PATH]="${CFG[APP_DIR]}/.env"
}

edit_hardening() {
  CFG[SWAP_SIZE]=$(ui_input "11 · Hardening" "Swapfile size (e.g. 2G; 0=skip)" "${CFG[SWAP_SIZE]}") || return 0
  CFG[BACKUP_DIR]=$(ui_input "11 · Backups" "Backup destination dir" "${CFG[BACKUP_DIR]}") || true
  CFG[BACKUP_KEEP]=$(ui_input "11 · Backups" "Days of backups to retain" "${CFG[BACKUP_KEEP]}") || true
}

edit_env() {
  local m; m=$(ui_radio "12 · .env Output" "Where to write the consolidated config:" 3 \
    "system" "/etc/exprsn/platform.env (0600)" "$([ "${CFG[ENV_TARGET]}" = system ] && echo ON||echo OFF)" \
    "repo" "Repo .env (backs up existing)" "$([ "${CFG[ENV_TARGET]}" = repo ] && echo ON||echo OFF)" \
    "both" "Both" "$([ "${CFG[ENV_TARGET]}" = both ] && echo ON||echo OFF)") || return 0
  [ -n "$m" ] && CFG[ENV_TARGET]="$m"
  [ "${CFG[ENV_TARGET]}" != system ] && { CFG[ENV_REPO_PATH]=$(ui_input "12 · .env Output" "Repo .env path" "${CFG[ENV_REPO_PATH]}") || true; }
  ui_yesno "12 · .env Output" "Print generated secrets to screen at the end?" && CFG[ENV_PRINT]=yes || CFG[ENV_PRINT]=no
}

# ---------------------------------------------------------------------------
# 5. Hub
# ---------------------------------------------------------------------------
st() { [ "${1:-}" = touched ] && echo "✓" || echo "·"; }
hub() {
  declare -A T
  while true; do
    local n; n=$(echo "$SERVICES" | wc -w)
    local nu; nu=$(grep -c . <<< "${CFG[USERS]}")
    local choice
    choice=$(ui_menu "Exprsn Platform Provisioner" "Configure any section, then Install. Nothing installs until you confirm." 16 \
      "1" "Domain & Identity   →  ${CFG[PRIMARY_DOMAIN]} / ${CFG[KRB5_REALM]}  $(st "${T[1]:-}")" \
      "2" "Services            →  ${n} selected  $(st "${T[2]:-}")" \
      "3" "TLS & Keys          →  ${CFG[TLS_MODE]}  $(st "${T[3]:-}")" \
      "4" "PostgreSQL+PostGIS  →  db=${CFG[DB_NAME]} remote=${CFG[DB_REMOTE]}  $(st "${T[4]:-}")" \
      "5" "Directory & Auth    →  LDAP+KRB5 ldaps=${CFG[LDAP_TLS]} host=${CFG[HOST_LOGIN]}  $(st "${T[5]:-}")" \
      "6" "Users & Groups      →  ${nu} users  $(st "${T[6]:-}")" \
      "7" "Mail                →  ${CFG[MAIL_DOMAIN]} (LDAP-backed)  $(st "${T[7]:-}")" \
      "8" "Object storage      →  MinIO :${CFG[MINIO_PORT]}  $(st "${T[8]:-}")" \
      "9" "DNS & VPN           →  zone=${CFG[INTERNAL_ZONE]}  $(st "${T[9]:-}")" \
      "10" "App deploy         →  ${CFG[APP_DIR]}  $(st "${T[10]:-}")" \
      "11" "Hardening & Backups →  swap=${CFG[SWAP_SIZE]} keep=${CFG[BACKUP_KEEP]}d  $(st "${T[11]:-}")" \
      "12" ".env Output        →  ${CFG[ENV_TARGET]}  $(st "${T[12]:-}")" \
      "I" "▶  Install now" "Q" "Quit without installing") || return 1
    case "$choice" in
      1) edit_domain; T[1]=touched ;; 2) edit_services; T[2]=touched ;; 3) edit_keys; T[3]=touched ;;
      4) edit_postgres; T[4]=touched ;; 5) edit_directory; T[5]=touched ;; 6) edit_users; T[6]=touched ;;
      7) edit_mail; T[7]=touched ;; 8) edit_minio; T[8]=touched ;; 9) edit_netvpn; T[9]=touched ;;
      10) edit_app; T[10]=touched ;; 11) edit_hardening; T[11]=touched ;; 12) edit_env; T[12]=touched ;;
      I) confirm_install && return 0 ;; Q) return 1 ;;
    esac
  done
}
confirm_install() {
  local s=""
  s+="Host:    ${CFG[PUBLIC_HOST]} (${CFG[PUBLIC_IP]})\n"
  s+="Domain:  ${CFG[PRIMARY_DOMAIN]}  Realm: ${CFG[KRB5_REALM]}  BaseDN: ${CFG[LDAP_BASE_DN]}\n"
  s+="TLS:     ${CFG[TLS_MODE]}   Gateway: 127.0.0.1:${CFG[GATEWAY_PORT]}\n"
  s+="Auth:    OpenLDAP (KRB5 in LDAP), ldaps=${CFG[LDAP_TLS]}, host-login=${CFG[HOST_LOGIN]}\n"
  s+="Users:   $(grep -c . <<< "${CFG[USERS]}") (LDAP+KRB+mail)   Groups: ${CFG[GROUPS]}\n"
  s+="Storage: MinIO buckets: ${CFG[MINIO_BUCKETS]}\n"
  s+="App:     ${CFG[APP_DIR]} (deploy=$(has app && echo yes||echo no))\n"
  s+="Services: ${SERVICES}\n\n"
  s+="Proceed? Auto secrets were generated and saved to your .env target."
  ui_yesno "Confirm — review before installing" "$s"
}

# ---------------------------------------------------------------------------
# 6. Provisioners
# ---------------------------------------------------------------------------
apt_install() { log "apt install: $*"; apt-get install -y -qq "$@" >/dev/null; }
prep_apt() { log "apt update…"; apt-get update -qq >/dev/null; apt_install ca-certificates curl gnupg lsb-release apt-transport-https git; }

do_sysctl() {
  cat > /etc/sysctl.d/99-exprsn.conf <<'EOF'
vm.max_map_count=262144
vm.swappiness=1
EOF
  sysctl --system >/dev/null 2>&1 || true; log "sysctl: vm.max_map_count=262144."
}
do_swap() {
  [ "${CFG[SWAP_SIZE]}" = 0 ] && return
  swapon --show 2>/dev/null | grep -q . && { log "swap already active."; return; }
  fallocate -l "${CFG[SWAP_SIZE]}" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=$(( ${CFG[SWAP_SIZE]%G} * 1024 )) status=none
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  log "swap: ${CFG[SWAP_SIZE]} /swapfile active."
}

do_tls() {
  case "${CFG[TLS_MODE]}" in
    import) [ -s "${CFG[TLS_IMPORT_CRT]}" ] && [ -s "${CFG[TLS_IMPORT_KEY]}" ] || die "Import crt/key not readable."
            install -m644 "${CFG[TLS_IMPORT_CRT]}" "$CERT_DIR/platform.crt"; install -m600 "${CFG[TLS_IMPORT_KEY]}" "$CERT_DIR/platform.key" ;;
    letsencrypt) apt_install certbot python3-certbot-nginx; CFG[_LE_PENDING]=yes ;;
  esac
  if [ ! -s "$CERT_DIR/platform.key" ]; then
    log "Generating self-signed cert…"
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout "$CERT_DIR/platform.key" -out "$CERT_DIR/platform.crt" \
      -subj "/CN=${CFG[PUBLIC_HOST]}" -addext "subjectAltName=DNS:${CFG[PUBLIC_HOST]},DNS:localhost,IP:${CFG[PUBLIC_IP]},IP:127.0.0.1" >/dev/null 2>&1
    chmod 600 "$CERT_DIR/platform.key"
  fi
  CFG[TLS_CERT_PATH]="$CERT_DIR/platform.crt"; CFG[TLS_KEY_PATH]="$CERT_DIR/platform.key"
}

do_postgres() {
  apt_install postgresql postgresql-contrib postgis
  local ver; ver=$(ls /usr/lib/postgresql/ 2>/dev/null | sort -n | tail -1); [ -n "$ver" ] || die "PostgreSQL missing."
  apt_install "postgresql-${ver}-postgis-3" || c_ylw "postgresql-${ver}-postgis-3 unavailable."
  local conf="/etc/postgresql/${ver}/main"
  if [ "${CFG[DB_REMOTE]}" = yes ]; then
    sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = '*'/" "$conf/postgresql.conf"
    grep -q "exprsn provisioner" "$conf/pg_hba.conf" || printf "# exprsn provisioner\nhost all all %s md5\n" "${CFG[DB_REMOTE_CIDR]}" >> "$conf/pg_hba.conf"
  else sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = 'localhost'/" "$conf/postgresql.conf"; fi
  sed -ri "s/^#?port\s*=.*/port = ${CFG[DB_PORT]}/" "$conf/postgresql.conf"
  systemctl enable --now postgresql >/dev/null 2>&1 || true; systemctl restart postgresql
  local U="${CFG[DB_USER]}" P="${CFG[DB_PASSWORD]}" D="${CFG[DB_NAME]}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${U}') THEN CREATE ROLE "${U}" LOGIN PASSWORD '${P}';
  ELSE ALTER ROLE "${U}" WITH LOGIN PASSWORD '${P}'; END IF;
END \$\$;
SELECT 'CREATE DATABASE "${D}" OWNER "${U}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${D}')\gexec
SQL
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$D" <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;
SQL
  log "PostgreSQL ${ver}: db=${D} owner=${U}."
}

do_redis() {
  apt_install redis-server; local c=/etc/redis/redis.conf
  sed -ri "s/^#?\s*requirepass .*/requirepass ${CFG[REDIS_PASSWORD]}/" "$c"; grep -q "^requirepass" "$c" || echo "requirepass ${CFG[REDIS_PASSWORD]}" >> "$c"
  sed -ri "s/^#?\s*port .*/port ${CFG[REDIS_PORT]}/" "$c"
  sed -ri "s/^appendonly .*/appendonly yes/" "$c"; grep -q "^appendonly yes" "$c" || echo "appendonly yes" >> "$c"
  systemctl enable --now redis-server >/dev/null 2>&1 || true; systemctl restart redis-server; log "Redis :${CFG[REDIS_PORT]}."
}

do_opensearch() {
  if [ ! -f /usr/share/keyrings/opensearch-keyring.gpg ]; then
    curl -fsSL https://artifacts.opensearch.org/publickeys/opensearch-PGP-KEY.pub | gpg --dearmor -o /usr/share/keyrings/opensearch-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/opensearch-keyring.gpg] https://artifacts.opensearch.org/releases/bundle/opensearch/2.x/apt stable main" > /etc/apt/sources.list.d/opensearch-2.x.list
    apt-get update -qq >/dev/null
  fi
  OPENSEARCH_INITIAL_ADMIN_PASSWORD="${CFG[OS_ADMIN_PASSWORD]}" apt_install opensearch
  local c=/etc/opensearch/opensearch.yml
  { echo "discovery.type: single-node"; echo "network.host: 0.0.0.0"; [ "${CFG[OS_SECURITY]}" = off ] && echo "plugins.security.disabled: true"; } >> "$c"
  sed -ri "s/^-Xms.*/-Xms${CFG[OS_HEAP]}/; s/^-Xmx.*/-Xmx${CFG[OS_HEAP]}/" /etc/opensearch/jvm.options 2>/dev/null || true
  systemctl daemon-reload; systemctl enable --now opensearch >/dev/null 2>&1 || true
  systemctl restart opensearch || c_ylw "OpenSearch still starting."; log "OpenSearch (heap=${CFG[OS_HEAP]})."
}

do_rabbitmq() {
  apt_install rabbitmq-server; systemctl enable --now rabbitmq-server >/dev/null 2>&1 || true
  rabbitmq-plugins enable rabbitmq_management >/dev/null 2>&1 || true
  local U="${CFG[RABBITMQ_USER]}" P="${CFG[RABBITMQ_PASSWORD]}"
  rabbitmqctl list_users 2>/dev/null | grep -qw "$U" && rabbitmqctl change_password "$U" "$P" >/dev/null || rabbitmqctl add_user "$U" "$P" >/dev/null
  rabbitmqctl set_user_tags "$U" administrator >/dev/null; rabbitmqctl set_permissions -p / "$U" ".*" ".*" ".*" >/dev/null
  rabbitmqctl delete_user guest >/dev/null 2>&1 || true; log "RabbitMQ user=${U}."
}

do_minio() {
  id minio-user >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin minio-user
  mkdir -p /var/lib/minio; chown minio-user: /var/lib/minio
  [ -x /usr/local/bin/minio ] || { curl -fsSL https://dl.min.io/server/minio/release/linux-amd64/minio -o /usr/local/bin/minio; chmod +x /usr/local/bin/minio; }
  [ -x /usr/local/bin/mc ]    || { curl -fsSL https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc; chmod +x /usr/local/bin/mc; }
  cat > /etc/default/minio <<EOF
MINIO_ROOT_USER=${CFG[MINIO_ROOT_USER]}
MINIO_ROOT_PASSWORD=${CFG[MINIO_ROOT_PASSWORD]}
MINIO_VOLUMES=/var/lib/minio
MINIO_OPTS=--address :${CFG[MINIO_PORT]} --console-address :${CFG[MINIO_CONSOLE_PORT]}
EOF
  cat > /etc/systemd/system/minio.service <<'EOF'
[Unit]
Description=MinIO object storage
After=network.target
[Service]
User=minio-user
Group=minio-user
EnvironmentFile=/etc/default/minio
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES
Restart=on-failure
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl enable --now minio >/dev/null 2>&1 || true
  local i; for i in $(seq 1 30); do /usr/local/bin/mc alias set local "http://localhost:${CFG[MINIO_PORT]}" "${CFG[MINIO_ROOT_USER]}" "${CFG[MINIO_ROOT_PASSWORD]}" >/dev/null 2>&1 && break; sleep 1; done
  local b; for b in ${CFG[MINIO_BUCKETS]}; do /usr/local/bin/mc mb --ignore-existing "local/$b" >/dev/null 2>&1; done
  /usr/local/bin/mc admin user add local "${CFG[MINIO_APP_KEY]}" "${CFG[MINIO_APP_SECRET]}" >/dev/null 2>&1 || true
  /usr/local/bin/mc admin policy attach local readwrite --user "${CFG[MINIO_APP_KEY]}" >/dev/null 2>&1 \
    || /usr/local/bin/mc admin policy set local readwrite user="${CFG[MINIO_APP_KEY]}" >/dev/null 2>&1 || true
  log "MinIO :${CFG[MINIO_PORT]} buckets: ${CFG[MINIO_BUCKETS]}; app key ${CFG[MINIO_APP_KEY]}."
}

do_openldap() {
  debconf-set-selections <<EOF
slapd slapd/internal/generated_adminpw password ${CFG[LDAP_ADMIN_PASSWORD]}
slapd slapd/internal/adminpw password ${CFG[LDAP_ADMIN_PASSWORD]}
slapd slapd/password1 password ${CFG[LDAP_ADMIN_PASSWORD]}
slapd slapd/password2 password ${CFG[LDAP_ADMIN_PASSWORD]}
slapd slapd/domain string ${CFG[PRIMARY_DOMAIN]}
slapd shared/organization string ${CFG[LDAP_ORG]}
slapd slapd/backend select MDB
slapd slapd/purge_database boolean false
slapd slapd/move_old_database boolean true
slapd slapd/no_configuration boolean false
EOF
  apt_install slapd ldap-utils
  dpkg-reconfigure -f noninteractive slapd >/dev/null 2>&1 || true
  systemctl enable --now slapd >/dev/null 2>&1 || true
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}"
  # ou structure
  cat > /tmp/ou.ldif <<EOF
dn: ou=People,${B}
objectClass: organizationalUnit
ou: People

dn: ou=Groups,${B}
objectClass: organizationalUnit
ou: Groups
EOF
  ldapadd -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/ou.ldif >/dev/null 2>&1 || true
  rm -f /tmp/ou.ldif
  # LDAPS / StartTLS with the platform cert
  if [ "${CFG[LDAP_TLS]}" = yes ]; then
    mkdir -p /etc/ldap/certs
    install -m644 "$CERT_DIR/platform.crt" /etc/ldap/certs/platform.crt
    install -m640 "$CERT_DIR/platform.key" /etc/ldap/certs/platform.key
    chown -R openldap:openldap /etc/ldap/certs
    cat > /tmp/tls.ldif <<EOF
dn: cn=config
changetype: modify
replace: olcTLSCertificateFile
olcTLSCertificateFile: /etc/ldap/certs/platform.crt
-
replace: olcTLSCertificateKeyFile
olcTLSCertificateKeyFile: /etc/ldap/certs/platform.key
EOF
    ldapmodify -Q -Y EXTERNAL -H ldapi:/// -f /tmp/tls.ldif >/dev/null 2>&1 || c_ylw "LDAP TLS config failed."
    rm -f /tmp/tls.ldif
    sed -ri 's|^SLAPD_SERVICES=.*|SLAPD_SERVICES="ldap:/// ldapi:/// ldaps:///"|' /etc/default/slapd 2>/dev/null || true
    systemctl restart slapd
  fi
  log "OpenLDAP ready: base ${B}, ldaps=${CFG[LDAP_TLS]}."
}

do_kerberos() {
  has openldap || die "Kerberos-in-LDAP needs OpenLDAP."
  local realm="${CFG[KRB5_REALM]}" B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}" container="${CFG[KRB5_CONTAINER_DN]}"
  debconf-set-selections <<EOF
krb5-config krb5-config/default_realm string ${realm}
krb5-config krb5-config/kerberos_servers string ${CFG[PUBLIC_HOST]}
krb5-config krb5-config/admin_server string ${CFG[PUBLIC_HOST]}
EOF
  apt_install krb5-kdc krb5-admin-server krb5-kdc-ldap krb5-config krb5-user
  if ! ldapsearch -Q -Y EXTERNAL -H ldapi:/// -b cn=schema,cn=config dn 2>/dev/null | grep -qi kerberos; then
    local sc=/tmp/kerberos.ldif
    zcat /usr/share/doc/krb5-kdc-ldap/kerberos.openldap.ldif.gz > "$sc" 2>/dev/null || zcat /usr/share/doc/krb5-kdc-ldap/kerberos.schema.gz > "$sc" 2>/dev/null || true
    [ -s "$sc" ] && ldapadd -Q -Y EXTERNAL -H ldapi:/// -f "$sc" >/dev/null 2>&1 && log "Kerberos schema imported." || c_ylw "Kerberos schema import needs manual check."
    rm -f "$sc"
  fi
  cat > /etc/krb5.conf <<EOF
[libdefaults]
    default_realm = ${realm}
    dns_lookup_realm = false
    dns_lookup_kdc = false
    rdns = false

[realms]
    ${realm} = {
        kdc = ${CFG[PUBLIC_HOST]}
        admin_server = ${CFG[PUBLIC_HOST]}
        default_domain = ${CFG[INTERNAL_ZONE]}
        database_module = openldap_ldapconf
    }

[domain_realm]
    .${CFG[INTERNAL_ZONE]} = ${realm}
    ${CFG[INTERNAL_ZONE]} = ${realm}

[dbdefaults]
    ldap_kerberos_container_dn = ${container}

[dbmodules]
    openldap_ldapconf = {
        db_library = kldap
        ldap_kerberos_container_dn = ${container}
        ldap_kdc_dn = "${admin}"
        ldap_kadmind_dn = "${admin}"
        ldap_service_password_file = /etc/krb5kdc/service.keyfile
        ldap_servers = ldapi:///
        ldap_conns_per_server = 5
    }
EOF
  mkdir -p /etc/krb5kdc; echo "*/admin@${realm} *" > /etc/krb5kdc/kadm5.acl
  printf '%s\n%s\n' "$pw" "$pw" | kdb5_ldap_util -D "$admin" -w "$pw" stashsrvpw -f /etc/krb5kdc/service.keyfile "$admin" >/dev/null 2>&1 || true
  if ! kdb5_ldap_util -D "$admin" -w "$pw" view -r "$realm" >/dev/null 2>&1; then
    log "Creating Kerberos realm ${realm} in LDAP…"
    kdb5_ldap_util -D "$admin" -w "$pw" create -subtrees "$B" -r "$realm" -s -P "${CFG[KRB5_MASTER_PASSWORD]}" -H ldapi:/// || c_ylw "kdb5_ldap_util create issue — verify schema/base DN."
  fi
  kadmin.local -q "getprinc admin/admin@${realm}" >/dev/null 2>&1 || kadmin.local -q "addprinc -pw ${CFG[KRB5_ADMIN_PASSWORD]} admin/admin@${realm}" >/dev/null 2>&1
  systemctl enable --now krb5-kdc krb5-admin-server >/dev/null 2>&1 || true; systemctl restart krb5-kdc krb5-admin-server
  log "Kerberos realm=${realm}: principals in LDAP (${container})."
}

do_keytabs() {
  has kerberos || return
  local realm="${CFG[KRB5_REALM]}" fqdn="${CFG[PUBLIC_HOST]}" svc
  for svc in host HTTP ldap imap smtp; do
    kadmin.local -q "getprinc ${svc}/${fqdn}@${realm}" >/dev/null 2>&1 || kadmin.local -q "addprinc -randkey ${svc}/${fqdn}@${realm}" >/dev/null 2>&1
    kadmin.local -q "ktadd -k /etc/krb5.keytab ${svc}/${fqdn}@${realm}" >/dev/null 2>&1
  done
  chmod 600 /etc/krb5.keytab 2>/dev/null || true
  log "Kerberos service keytabs → /etc/krb5.keytab (host,HTTP,ldap,imap,smtp)."
}

do_users() {
  has openldap || return
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}" realm="${CFG[KRB5_REALM]}"
  local gid=20000 g
  for g in ${CFG[GROUPS]}; do
    printf 'dn: cn=%s,ou=Groups,%s\nobjectClass: posixGroup\ncn: %s\ngidNumber: %s\n' "$g" "$B" "$g" "$gid" > /tmp/g.ldif
    ldapadd -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/g.ldif >/dev/null 2>&1 || true
    gid=$((gid+1))
  done
  local uid=10001 u email grp upw hash
  while IFS='|' read -r u email grp upw; do
    [ -z "$u" ] && continue
    [ -z "$upw" ] && upw="$(gen_secret 12)"; hash=$(slappasswd -s "$upw")
    cat > /tmp/u.ldif <<EOF
dn: uid=${u},ou=People,${B}
objectClass: inetOrgPerson
objectClass: posixAccount
objectClass: shadowAccount
uid: ${u}
cn: ${u}
sn: ${u}
mail: ${email}
uidNumber: ${uid}
gidNumber: 20000
homeDirectory: /home/${u}
loginShell: /bin/bash
userPassword: ${hash}
EOF
    ldapadd -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/u.ldif >/dev/null 2>&1 || true
    if [ -n "$grp" ]; then
      printf 'dn: cn=%s,ou=Groups,%s\nchangetype: modify\nadd: memberUid\nmemberUid: %s\n' "$grp" "$B" "$u" > /tmp/m.ldif
      ldapmodify -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/m.ldif >/dev/null 2>&1 || true
    fi
    has kerberos && { kadmin.local -q "getprinc ${u}@${realm}" >/dev/null 2>&1 || kadmin.local -q "addprinc -pw ${upw} ${u}@${realm}" >/dev/null 2>&1; }
    uid=$((uid+1))
  done <<< "${CFG[USERS]}"
  rm -f /tmp/g.ldif /tmp/u.ldif /tmp/m.ldif
  log "Provisioned $(grep -c . <<< "${CFG[USERS]}") users + groups into LDAP$(has kerberos && echo ' + Kerberos')."
}

do_hostlogin() {
  has openldap || die "Host login needs OpenLDAP."
  apt_install sssd sssd-tools libnss-sss libpam-sss libsss-sudo oddjob-mkhomedir
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}"
  cat > /etc/sssd/sssd.conf <<EOF
[sssd]
services = nss, pam
config_file_version = 2
domains = EXPRSN

[domain/EXPRSN]
id_provider = ldap
auth_provider = krb5
chpass_provider = krb5
ldap_uri = ldap://localhost
ldap_search_base = ${B}
ldap_default_bind_dn = ${admin}
ldap_default_authtok = ${CFG[LDAP_ADMIN_PASSWORD]}
ldap_id_use_start_tls = false
ldap_tls_reqcert = never
krb5_server = ${CFG[PUBLIC_HOST]}
krb5_realm = ${CFG[KRB5_REALM]}
cache_credentials = true
enumerate = false
fallback_homedir = /home/%u
default_shell = /bin/bash
EOF
  chmod 600 /etc/sssd/sssd.conf
  pam-auth-update --enable sss mkhomedir >/dev/null 2>&1 || true
  systemctl enable --now sssd >/dev/null 2>&1 || true; systemctl restart sssd
  log "Host login: NSS+PAM → SSSD (LDAP id, Kerberos auth)."
}

do_bind9() {
  apt_install bind9 bind9utils dnsutils
  local zone="${CFG[INTERNAL_ZONE]}" realm="${CFG[KRB5_REALM]}" fwd; fwd=$(echo "${CFG[DNS_FORWARDERS]}" | tr ' ' ';')
  cat > /etc/bind/named.conf.options <<EOF
options { directory "/var/cache/bind"; recursion yes; allow-query { any; }; allow-recursion { any; };
  forwarders { ${fwd}; }; dnssec-validation auto; listen-on { any; }; listen-on-v6 { any; }; };
EOF
  cat > /etc/bind/named.conf.local <<EOF
zone "${zone}" { type master; file "/etc/bind/db.${zone}"; };
EOF
  cat > "/etc/bind/db.${zone}" <<EOF
\$TTL 604800
@   IN  SOA ns1.${zone}. admin.${zone}. ( 2 604800 86400 2419200 604800 )
@       IN  NS  ns1.${zone}.
@       IN  MX  10 mail.${zone}.
ns1     IN  A   ${CFG[PUBLIC_IP]}
gateway IN  A   ${CFG[PUBLIC_IP]}
ldap    IN  A   ${CFG[PUBLIC_IP]}
db      IN  A   ${CFG[PUBLIC_IP]}
search  IN  A   ${CFG[PUBLIC_IP]}
mq      IN  A   ${CFG[PUBLIC_IP]}
mail    IN  A   ${CFG[PUBLIC_IP]}
kdc     IN  A   ${CFG[PUBLIC_IP]}
s3      IN  A   ${CFG[PUBLIC_IP]}
_kerberos.${zone}.        IN TXT "${realm}"
_kerberos._udp            IN SRV 0 0 88   kdc.${zone}.
_kerberos._tcp            IN SRV 0 0 88   kdc.${zone}.
_kerberos-master._udp     IN SRV 0 0 88   kdc.${zone}.
_kpasswd._udp             IN SRV 0 0 464  kdc.${zone}.
_kerberos-adm._tcp        IN SRV 0 0 749  kdc.${zone}.
_ldap._tcp                IN SRV 0 0 389  ldap.${zone}.
EOF
  named-checkconf; named-checkzone "$zone" "/etc/bind/db.${zone}" >/dev/null
  systemctl enable --now named >/dev/null 2>&1 || systemctl enable --now bind9 >/dev/null 2>&1 || true
  systemctl restart named 2>/dev/null || systemctl restart bind9
  log "BIND9 authoritative for ${zone} (+MX, Kerberos/LDAP SRV)."
}

do_postfix() {
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}"
  debconf-set-selections <<EOF
postfix postfix/main_mailer_type select Internet Site
postfix postfix/mailname string ${CFG[MAIL_HOSTNAME]}
EOF
  if has openldap; then apt_install postfix postfix-ldap; else apt_install postfix; fi
  postconf -e "myhostname = ${CFG[MAIL_HOSTNAME]}" "mydomain = ${CFG[MAIL_DOMAIN]}" "myorigin = \$mydomain" \
    "inet_interfaces = all" "inet_protocols = ipv4" "mydestination = localhost" \
    "smtpd_tls_cert_file = ${CFG[TLS_CERT_PATH]}" "smtpd_tls_key_file = ${CFG[TLS_KEY_PATH]}" "smtpd_tls_security_level = may"
  if has openldap; then
    getent passwd vmail >/dev/null || useradd -r -u 5000 -d /var/vmail -s /usr/sbin/nologin -m vmail
    mkdir -p /var/vmail; chown -R vmail: /var/vmail
    cat > /etc/postfix/ldap-mailbox.cf <<EOF
server_host = localhost
search_base = ou=People,${B}
query_filter = (&(objectClass=inetOrgPerson)(mail=%s))
result_attribute = mail
result_format = %d/%u/
bind = yes
bind_dn = ${admin}
bind_pw = ${pw}
EOF
    cp /etc/postfix/ldap-mailbox.cf /etc/postfix/ldap-alias.cf
    sed -ri 's/result_format = .*/result_format = %s/' /etc/postfix/ldap-alias.cf
    chgrp postfix /etc/postfix/ldap-*.cf; chmod 640 /etc/postfix/ldap-*.cf
    postconf -e "virtual_mailbox_domains = ${CFG[MAIL_DOMAIN]}" "virtual_mailbox_base = /var/vmail" \
      "virtual_mailbox_maps = ldap:/etc/postfix/ldap-mailbox.cf" "virtual_alias_maps = ldap:/etc/postfix/ldap-alias.cf" \
      "virtual_transport = lmtp:unix:private/dovecot-lmtp" "virtual_minimum_uid = 5000" \
      "virtual_uid_maps = static:5000" "virtual_gid_maps = static:5000"
  else
    postconf -e "home_mailbox = Maildir/"; has dovecot && postconf -e "mailbox_transport = lmtp:unix:private/dovecot-lmtp"
  fi
  systemctl enable --now postfix >/dev/null 2>&1 || true; systemctl restart postfix
  log "Postfix mydomain=${CFG[MAIL_DOMAIN]} ($(has openldap && echo 'LDAP virtual mailboxes' || echo 'local Maildir'))."
}

do_dovecot() {
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}"
  if has openldap; then apt_install dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-ldap
  else apt_install dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd; fi
  sed -ri 's|^#?ssl =.*|ssl = yes|' /etc/dovecot/conf.d/10-ssl.conf
  sed -ri "s|^#?ssl_cert =.*|ssl_cert = <${CFG[TLS_CERT_PATH]}|" /etc/dovecot/conf.d/10-ssl.conf
  sed -ri "s|^#?ssl_key =.*|ssl_key = <${CFG[TLS_KEY_PATH]}|" /etc/dovecot/conf.d/10-ssl.conf
  if has openldap; then
    getent passwd vmail >/dev/null || useradd -r -u 5000 -d /var/vmail -s /usr/sbin/nologin -m vmail
    mkdir -p /var/vmail; chown -R vmail: /var/vmail
    sed -ri 's|^#?mail_location =.*|mail_location = maildir:/var/vmail/%d/%n/Maildir|' /etc/dovecot/conf.d/10-mail.conf
    cat > /etc/dovecot/dovecot-ldap.conf.ext <<EOF
uris = ldap://localhost
dn = ${admin}
dnpass = ${pw}
base = ou=People,${B}
scope = subtree
auth_bind = yes
user_filter = (&(objectClass=inetOrgPerson)(mail=%u))
pass_filter = (&(objectClass=inetOrgPerson)(mail=%u))
user_attrs = =uid=5000,=gid=5000,=home=/var/vmail/%d/%n,=mail=maildir:/var/vmail/%d/%n/Maildir
EOF
    chmod 600 /etc/dovecot/dovecot-ldap.conf.ext
    sed -ri 's|^!include auth-system.conf.ext|#!include auth-system.conf.ext|' /etc/dovecot/conf.d/10-auth.conf
    grep -q 'auth-ldap.conf.ext' /etc/dovecot/conf.d/10-auth.conf || echo '!include auth-ldap.conf.ext' >> /etc/dovecot/conf.d/10-auth.conf
  else
    sed -ri 's|^#?mail_location =.*|mail_location = maildir:~/Maildir|' /etc/dovecot/conf.d/10-mail.conf
  fi
  if has postfix && ! grep -q "dovecot-lmtp" /etc/dovecot/conf.d/10-master.conf; then
    cat >> /etc/dovecot/conf.d/10-master.conf <<'EOF'

service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}
EOF
  fi
  systemctl enable --now dovecot >/dev/null 2>&1 || true; systemctl restart dovecot
  log "Dovecot ($(has openldap && echo 'LDAP userdb, login=email' || echo 'system accounts'))."
}

do_strongswan() {
  apt_install strongswan strongswan-swanctl libcharon-extra-plugins
  printf 'net.ipv4.ip_forward = 1\nnet.ipv6.conf.all.forwarding = 1\n' > /etc/sysctl.d/99-exprsn-ipsec.conf; sysctl --system >/dev/null 2>&1 || true
  if [ -n "${CFG[VPN_REMOTE_ADDR]:-}" ]; then
    cat > /etc/swanctl/swanctl.conf <<EOF
connections {
    exprsn-vpn { version = 2; local_addrs = ${CFG[PUBLIC_IP]}; remote_addrs = ${CFG[VPN_REMOTE_ADDR]}
        local { auth = psk; id = ${CFG[PUBLIC_HOST]} } remote { auth = psk; id = ${CFG[VPN_REMOTE_ADDR]} }
        children { net { local_ts = ${CFG[VPN_LOCAL_TS]}; remote_ts = ${CFG[VPN_REMOTE_TS]}; start_action = trap } } }
}
secrets { ike-exprsn { id-local = ${CFG[PUBLIC_HOST]}; id-remote = ${CFG[VPN_REMOTE_ADDR]}; secret = "${CFG[VPN_PSK]}" } }
EOF
  else printf 'connections {\n}\nsecrets {\n}\n' > /etc/swanctl/swanctl.conf; fi
  systemctl enable --now strongswan >/dev/null 2>&1 || systemctl enable --now strongswan-starter >/dev/null 2>&1 || true
  systemctl restart strongswan 2>/dev/null || systemctl restart strongswan-starter 2>/dev/null || true
  swanctl --load-all >/dev/null 2>&1 || true; log "strongSwan (IKEv2)."
}

do_srs() {
  apt_install build-essential
  if [ ! -x /usr/local/srs/objs/srs ]; then
    log "Building SRS…"; rm -rf /usr/local/srs-src
    git clone --depth 1 -b 5.0release https://github.com/ossrs/srs.git /usr/local/srs-src || die "SRS clone failed."
    ( cd /usr/local/srs-src/trunk && ./configure >/dev/null && make -j"$(nproc)" >/dev/null )
    mkdir -p /usr/local/srs && cp -r /usr/local/srs-src/trunk/objs /usr/local/srs/objs
  fi
  mkdir -p /usr/local/srs/conf
  printf 'listen 1935; max_connections 1000; daemon off; srs_log_tank console;\nhttp_api { enabled on; listen 1985; }\nhttp_server { enabled on; listen 8080; dir ./objs/nginx/html; }\nvhost __defaultVhost__ { hls { enabled on; hls_path ./objs/nginx/html; hls_fragment 4; hls_window 12; } http_remux { enabled on; mount [vhost]/[app]/[stream].flv; } }\n' > /usr/local/srs/conf/srs.conf
  cat > /etc/systemd/system/srs.service <<'EOF'
[Unit]
Description=SRS live streaming server
After=network.target
[Service]
ExecStart=/usr/local/srs/objs/srs -c /usr/local/srs/conf/srs.conf
WorkingDirectory=/usr/local/srs
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl enable --now srs >/dev/null 2>&1 || true; log "SRS RTMP/1935."
}

do_app() {
  if ! command -v node >/dev/null 2>&1 || [ "$(node -v 2>/dev/null | sed 's/v\([0-9]*\).*/\1/')" -lt "${CFG[NODE_MAJOR]}" ] 2>/dev/null; then
    curl -fsSL "https://deb.nodesource.com/setup_${CFG[NODE_MAJOR]}.x" | bash - >/dev/null 2>&1; apt_install nodejs
  fi
  id "${CFG[APP_USER]}" >/dev/null 2>&1 || useradd -r -m -d "/home/${CFG[APP_USER]}" -s /usr/sbin/nologin "${CFG[APP_USER]}"
  local dir="${CFG[APP_DIR]}"
  if [ ! -f "$dir/package.json" ]; then
    [ -n "${CFG[APP_REPO_URL]}" ] || { c_ylw "No code at $dir and no repo URL — skipping app deploy."; return; }
    git clone "${CFG[APP_REPO_URL]}" "$dir" || { c_ylw "clone failed — skipping app deploy."; return; }
  fi
  chown -R "${CFG[APP_USER]}:${CFG[APP_USER]}" "$dir"
  sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm ci --no-audit --no-fund" 2>>"$LOG" || sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm install" 2>>"$LOG" || c_ylw "npm install reported errors."
  if [ "${CFG[APP_BUILD_WEB]}" = yes ]; then
    sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run web:install && npm run web:build" 2>>"$LOG" || c_ylw "web build failed."
    [ -d "$dir/web/dist" ] && chmod -R a+rX "$dir/web/dist"
  fi
  CFG[_APP_READY]=yes; log "App deployed to $dir (Node $(node -v 2>/dev/null))."
}

do_dbsetup() {
  [ "${CFG[_APP_READY]:-}" = yes ] || { c_ylw "App not deployed — skipping db bootstrap."; return; }
  local dir="${CFG[APP_DIR]}"
  sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run db:bootstrap" 2>>"$LOG" || c_ylw "db:bootstrap failed (see $LOG)."
  sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run db:migrate" 2>>"$LOG" || c_ylw "db:migrate failed (see $LOG)."
  [ "${CFG[APP_SEED_DEMO]}" = yes ] && { sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run seed:timeline" 2>>"$LOG" || c_ylw "seed:timeline failed."; }
  log "DB bootstrap + migrate complete."
}

do_systemd() {
  [ "${CFG[_APP_READY]:-}" = yes ] || return
  local dir="${CFG[APP_DIR]}" u="${CFG[APP_USER]}"
  cat > /etc/systemd/system/exprsn-gateway.service <<EOF
[Unit]
Description=Exprsn Platform gateway
After=network.target postgresql.service redis-server.service
Wants=postgresql.service redis-server.service
[Service]
User=${u}
WorkingDirectory=${dir}
EnvironmentFile=/etc/exprsn/platform.env
ExecStart=/usr/bin/npm start
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
  local w
  for w in timeline prefetch atproto; do
    [ -f "$dir/services/$w/src/worker.js" ] || continue
    cat > /etc/systemd/system/exprsn-worker-${w}.service <<EOF
[Unit]
Description=Exprsn ${w} worker
After=exprsn-gateway.service
[Service]
User=${u}
WorkingDirectory=${dir}
EnvironmentFile=/etc/exprsn/platform.env
ExecStart=/usr/bin/npm run worker:${w}
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
  done
  systemctl daemon-reload
  systemctl enable --now exprsn-gateway >/dev/null 2>&1 || c_ylw "gateway service didn't start — check: journalctl -u exprsn-gateway"
  for w in timeline prefetch atproto; do [ -f /etc/systemd/system/exprsn-worker-${w}.service ] && systemctl enable --now exprsn-worker-${w} >/dev/null 2>&1 || true; done
  log "systemd units: exprsn-gateway + workers enabled."
}

do_nginx() {
  apt_install nginx
  local web
  if [ "${CFG[_APP_READY]:-}" = yes ] && [ -d "${CFG[APP_DIR]}/web/dist" ]; then web="${CFG[APP_DIR]}/web/dist"
  else web=/var/www/exprsn; mkdir -p "$web"; [ -f "$web/index.html" ] || printf '<!doctype html><meta charset=utf-8><title>Exprsn</title><h1>Exprsn edge is up</h1>' > "$web/index.html"; fi
  cat > /etc/nginx/sites-available/exprsn <<EOF
upstream exprsn_gateway { server 127.0.0.1:${CFG[GATEWAY_PORT]}; }
proxy_ssl_verify off;
server { listen 80; server_name ${CFG[PUBLIC_HOST]}; return 301 https://\$host\$request_uri; }
server {
    listen 443 ssl; http2 on; server_name ${CFG[PUBLIC_HOST]};
    ssl_certificate ${CFG[TLS_CERT_PATH]}; ssl_certificate_key ${CFG[TLS_KEY_PATH]};
    client_max_body_size 100m; root ${web}; index index.html;
    location ~ ^/(ca|auth|spark|nexus|filevault|vault|timeline|prefetch|moderator|live|atproto|health)(/|\$) {
        proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; proxy_read_timeout 300s;
    }
    location ~ ^/(xrpc|\.well-known)(/|\$) {
        proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 300s;
    }
    location /socket.io/ {
        proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 300s;
    }
    location /srs/ { proxy_pass http://127.0.0.1:8080/; proxy_set_header Host \$host; proxy_buffering off; }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
  ln -sf /etc/nginx/sites-available/exprsn /etc/nginx/sites-enabled/exprsn; rm -f /etc/nginx/sites-enabled/default
  nginx -t && { systemctl enable --now nginx >/dev/null 2>&1 || true; systemctl reload nginx; }
  if [ "${CFG[_LE_PENDING]:-}" = yes ]; then
    log "Requesting Let's Encrypt cert…"
    if certbot --nginx -d "${CFG[PUBLIC_HOST]}" -m "${CFG[LE_EMAIL]}" --agree-tos -n --redirect; then
      CFG[TLS_CERT_PATH]="/etc/letsencrypt/live/${CFG[PUBLIC_HOST]}/fullchain.pem"; CFG[TLS_KEY_PATH]="/etc/letsencrypt/live/${CFG[PUBLIC_HOST]}/privkey.pem"
    else c_ylw "certbot failed (DNS not pointed?). Keeping self-signed."; fi
  fi
  log "Nginx edge → 127.0.0.1:${CFG[GATEWAY_PORT]} (root ${web})."
}

do_backups() {
  mkdir -p "${CFG[BACKUP_DIR]}"; chmod 700 "${CFG[BACKUP_DIR]}"
  cat > /usr/local/sbin/exprsn-backup.sh <<EOF
#!/usr/bin/env bash
set -uo pipefail
DEST="${CFG[BACKUP_DIR]}"; KEEP=${CFG[BACKUP_KEEP]}; STAMP=\$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dumpall | gzip > "\$DEST/pg-\$STAMP.sql.gz" 2>/dev/null || true
command -v slapcat >/dev/null && slapcat -n 1 2>/dev/null | gzip > "\$DEST/ldap-\$STAMP.ldif.gz" || true
find "\$DEST" -type f -mtime +\$KEEP -delete 2>/dev/null || true
EOF
  chmod 700 /usr/local/sbin/exprsn-backup.sh
  cat > /etc/systemd/system/exprsn-backup.service <<'EOF'
[Unit]
Description=Exprsn nightly backup (Postgres + LDAP)
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/exprsn-backup.sh
EOF
  cat > /etc/systemd/system/exprsn-backup.timer <<'EOF'
[Unit]
Description=Nightly Exprsn backup
[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload; systemctl enable --now exprsn-backup.timer >/dev/null 2>&1 || true
  log "Backups: nightly pg_dumpall + slapcat → ${CFG[BACKUP_DIR]} (keep ${CFG[BACKUP_KEEP]}d)."
}

do_ufw() {
  apt_install ufw
  ufw --force default deny incoming >/dev/null; ufw --force default allow outgoing >/dev/null
  ufw allow 22/tcp >/dev/null
  has nginx && { ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; }
  ufw allow "${CFG[GATEWAY_PORT]}/tcp" >/dev/null
  has postgres && [ "${CFG[DB_REMOTE]:-no}" = yes ] && ufw allow "${CFG[DB_PORT]}/tcp" >/dev/null
  has openldap && { ufw allow 389/tcp >/dev/null; ufw allow 636/tcp >/dev/null; }
  has kerberos && { ufw allow 88 >/dev/null; ufw allow 749/tcp >/dev/null; ufw allow 464 >/dev/null; }
  has bind9 && { ufw allow 53/tcp >/dev/null; ufw allow 53/udp >/dev/null; }
  has postfix && ufw allow 25/tcp >/dev/null
  if has dovecot; then local p; for p in 143 993 110 995; do ufw allow ${p}/tcp >/dev/null; done; fi
  has minio && { ufw allow "${CFG[MINIO_PORT]}/tcp" >/dev/null; ufw allow "${CFG[MINIO_CONSOLE_PORT]}/tcp" >/dev/null; }
  has strongswan && { ufw allow 500/udp >/dev/null; ufw allow 4500/udp >/dev/null; }
  has srs && { ufw allow 1935/tcp >/dev/null; ufw allow 1985/tcp >/dev/null; }
  ufw --force enable >/dev/null; log "UFW enabled."
}

# ---------------------------------------------------------------------------
# 7. .env writer
# ---------------------------------------------------------------------------
build_env() {
  echo "# Generated by scripts/provision-ubuntu.sh on $(hostname -f 2>/dev/null || hostname)"
  echo "NODE_ENV=production"
  echo "HOST=0.0.0.0"; echo "HTTPS_PORT=${CFG[GATEWAY_PORT]}"; echo "PUBLIC_HOST=${CFG[PUBLIC_HOST]}"
  echo "TLS_ENABLED=true"; echo "TLS_CERT_PATH=${CFG[TLS_CERT_PATH]}"; echo "TLS_KEY_PATH=${CFG[TLS_KEY_PATH]}"
  echo "JWT_SECRET=${CFG[JWT_SECRET]}"; echo "SESSION_SECRET=${CFG[SESSION_SECRET]}"
  echo "SERVICE_TOKEN_SECRET=${CFG[SERVICE_TOKEN_SECRET]}"; echo "SERVICE_ID=platform"
  echo "ATPROTO_SIGNING_KEY=${CFG[ATPROTO_SIGNING_KEY]}"
  if has postgres; then echo "DB_HOST=localhost"; echo "DB_PORT=${CFG[DB_PORT]}"; echo "DB_NAME=${CFG[DB_NAME]}"; echo "DB_USER=${CFG[DB_USER]}"; echo "DB_PASSWORD=${CFG[DB_PASSWORD]}"; echo "DB_SSL=false"; fi
  if has redis; then echo "REDIS_HOST=localhost"; echo "REDIS_PORT=${CFG[REDIS_PORT]}"; echo "REDIS_PASSWORD=${CFG[REDIS_PASSWORD]}"; echo "REDIS_DB=0"; fi
  has opensearch && echo "ELASTICSEARCH_NODE=http://localhost:9200"
  has rabbitmq && echo "RABBITMQ_URL=amqp://${CFG[RABBITMQ_USER]}:${CFG[RABBITMQ_PASSWORD]}@localhost:5672"
  if has minio; then
    echo "S3_ENDPOINT=http://localhost:${CFG[MINIO_PORT]}"; echo "S3_BUCKET=exprsn-filevault"; echo "S3_REGION=us-east-1"
    echo "AWS_REGION=us-east-1"; echo "AWS_ACCESS_KEY_ID=${CFG[MINIO_APP_KEY]}"; echo "AWS_SECRET_ACCESS_KEY=${CFG[MINIO_APP_SECRET]}"
    echo "S3_BUCKET_NAME=exprsn-ca-certificates"; echo "S3_BUCKET_PREFIX=ca/"
  fi
  if has openldap; then
    echo "LDAP_URL=ldap://localhost:389"; echo "LDAP_BASE_DN=${CFG[LDAP_BASE_DN]}"
    echo "LDAP_ADMIN_DN=cn=admin,${CFG[LDAP_BASE_DN]}"; echo "LDAP_ADMIN_PASSWORD=${CFG[LDAP_ADMIN_PASSWORD]}"
    echo "LDAP_USER_BASE=ou=People,${CFG[LDAP_BASE_DN]}"; echo "LDAP_GROUP_BASE=ou=Groups,${CFG[LDAP_BASE_DN]}"
  fi
  if has kerberos; then echo "KRB5_REALM=${CFG[KRB5_REALM]}"; echo "KRB5_KDC=${CFG[PUBLIC_HOST]}"; echo "KRB5_BACKEND=ldap"; echo "KRB5_CONTAINER_DN=${CFG[KRB5_CONTAINER_DN]}"; fi
  if has postfix || has dovecot; then echo "SMTP_HOST=localhost"; echo "SMTP_PORT=25"; echo "MAIL_DOMAIN=${CFG[MAIL_DOMAIN]}"; fi
}

write_env() {
  local content; content=$(build_env)
  case "${CFG[ENV_TARGET]}" in system|both) echo "$content" > /etc/exprsn/platform.env; chmod 600 /etc/exprsn/platform.env; log "Wrote /etc/exprsn/platform.env."; esac
  if [ "${CFG[ENV_TARGET]}" != system ] || has app; then
    local f="${CFG[ENV_REPO_PATH]}"
    [ -f "$f" ] && cp -a "$f" "${f}.bak.$(date +%s)" 2>/dev/null && log "Backed up ${f}."
    echo "$content" > "$f"; chmod 600 "$f"
    has app && [ "${CFG[_APP_READY]:-}" = yes ] && chown "${CFG[APP_USER]}:${CFG[APP_USER]}" "$f" 2>/dev/null || true
    log "Wrote ${f}."
  fi
}

# ---------------------------------------------------------------------------
# 8. Orchestration
# ---------------------------------------------------------------------------
install_all() {
  prep_apt
  do_tls
  do_swap
  has opensearch && do_sysctl
  has postgres   && do_postgres
  has redis      && do_redis
  has opensearch && do_opensearch
  has rabbitmq   && do_rabbitmq
  has minio      && do_minio
  has openldap   && do_openldap
  has kerberos   && do_kerberos
  has kerberos   && do_keytabs
  has openldap   && do_users
  has hostlogin  && do_hostlogin
  has bind9      && do_bind9
  has postfix    && do_postfix
  has dovecot    && do_dovecot
  has strongswan && do_strongswan
  has srs        && do_srs
  has app        && do_app
  write_env                       # after app deploy so repo .env lands for the gateway
  has app        && do_dbsetup
  has nginx      && do_nginx
  has app        && do_systemd
  has backups    && do_backups
  has ufw        && do_ufw         # last
}

main() {
  preflight
  init_defaults
  ui_msg "Welcome" "Exprsn Platform provisioner for Ubuntu 25.x.\n\nHub menu — configure any section, then Install. Nothing installs until you confirm.\n\nThis build also: provisions users/groups into LDAP+Kerberos+mail, stands up MinIO (S3) buckets, deploys the app (db:bootstrap/migrate + gateway/worker systemd units), and adds swap/sysctl, LDAPS, and nightly backups."
  hub || { c_ylw "Cancelled — nothing installed."; exit 0; }
  log "Installing: ${SERVICES}"
  install_all
  c_grn "===================================================================="
  c_grn " Provisioning complete."
  c_grn "   Services:  ${SERVICES}"
  c_grn "   Domain:    ${CFG[PRIMARY_DOMAIN]}  Realm: ${CFG[KRB5_REALM]}  BaseDN: ${CFG[LDAP_BASE_DN]}"
  c_grn "   Users:     $(grep -c . <<< "${CFG[USERS]}") in LDAP+KRB+mail   Buckets: ${CFG[MINIO_BUCKETS]}"
  c_grn "   App:       ${CFG[APP_DIR]} (gateway=${CFG[_APP_READY]:-no})"
  c_grn "   .env:      ${CFG[ENV_TARGET]}   Log: ${LOG}   Certs: ${CERT_DIR}"
  c_grn "===================================================================="
  [ "${CFG[ENV_PRINT]}" = yes ] && { c_ylw "----- generated config (secrets) -----"; build_env; }
  c_grn " Verify: systemctl status exprsn-gateway ; curl -k https://localhost:${CFG[GATEWAY_PORT]}/health"
}

main "$@"
