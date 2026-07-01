#!/usr/bin/env bash
# ============================================================================
# Exprsn Platform — bare-metal provisioner for Fedora (and RHEL/Rocky/Alma)
# ----------------------------------------------------------------------------
# Full-depth native install: the Fedora counterpart to scripts/provision-ubuntu.sh.
# Same menu-driven TUI and identity model; Fedora-specific plumbing throughout:
#
#   • dnf packages + service names (krb5kdc, kadmin, named, slapd, postgresql)
#   • OpenLDAP via openldap-servers + cn=config (no debconf): suffix/rootDN/rootPW
#     set over ldapi:///, base schemas (cosine, nis, inetorgperson) imported
#   • Kerberos KDC with the LDAP backend (krb5-server-ldap / kldap),
#     KDC dir /var/kerberos/krb5kdc, principals stored IN OpenLDAP
#   • Postfix (postfix-ldap) + Dovecot (built-in LDAP) virtual mailboxes
#   • Host login via SSSD + authselect (not pam-auth-update)
#   • firewalld (not ufw) and SELinux contexts/booleans applied
#   • MinIO (S3), app deploy + gateway/worker systemd units, swap/sysctl, backups
#
# Usage (Fedora/RHEL host, as root):
#   bash scripts/provision-fedora.sh
# ============================================================================
set -uo pipefail

BT="Exprsn Platform Provisioner — Fedora/RHEL"
CERT_DIR="/etc/exprsn/certs"
LOG="/var/log/exprsn-provision.log"
KDCDIR="/var/kerberos/krb5kdc"
UI="whiptail"

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
first_dc() { echo "$1" | sed 's/^dc=//; s/,.*//'; }

# SELinux helpers
selinux_on() { command -v getenforce >/dev/null 2>&1 && [ "$(getenforce 2>/dev/null)" != "Disabled" ]; }
ensure_semanage() { selinux_on && ! command -v semanage >/dev/null 2>&1 && dnf install -y -q policycoreutils-python-utils >/dev/null 2>&1 || true; }
selinux_fcontext() { selinux_on || return 0; ensure_semanage; semanage fcontext -a -t "$2" "$1(/.*)?" 2>/dev/null || semanage fcontext -m -t "$2" "$1(/.*)?" 2>/dev/null || true; restorecon -R "$1" 2>/dev/null || true; }
selinux_port() { selinux_on || return 0; ensure_semanage; semanage port -a -t "$2" -p tcp "$1" 2>/dev/null || true; }
selinux_bool() { selinux_on || return 0; setsebool -P "$1" on 2>/dev/null || true; }

# ---- dialog/whiptail wrappers ----------------------------------------------
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

# ---- preflight -------------------------------------------------------------
need_root() { [ "$(id -u)" -eq 0 ] || die "Run as root (sudo bash $0)."; }
detect_ip() {
  curl -fsS --max-time 4 http://169.254.169.254/metadata/v1/interfaces/public/0/ipv4/address 2>/dev/null \
    || ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || echo "127.0.0.1"
}
detect_appdir() {
  local d; d=$(git -C "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" rev-parse --show-toplevel 2>/dev/null)
  [ -n "$d" ] && [ -f "$d/package.json" ] && { echo "$d"; return; }; echo "/opt/exprsn-platform"
}
preflight() {
  need_root
  [ -r /etc/os-release ] && . /etc/os-release || true
  case "${ID:-}" in fedora|rhel|centos|rocky|almalinux) : ;; *) c_ylw "Tuned for Fedora/RHEL; detected '${ID:-?}'."; esac
  mkdir -p /etc/exprsn "$CERT_DIR"; chmod 700 /etc/exprsn
  : > "$LOG" 2>/dev/null || true
  if command -v dialog >/dev/null 2>&1; then UI=dialog
  else dnf install -y -q dialog >/dev/null 2>&1 && UI=dialog || { command -v whiptail >/dev/null 2>&1 || dnf install -y -q newt >/dev/null 2>&1; UI=whiptail; }
  fi
  command -v openssl >/dev/null 2>&1 || dnf install -y -q openssl >/dev/null 2>&1
  log "Preflight OK on ${PRETTY_NAME:-Fedora}; UI=$UI; SELinux=$(getenforce 2>/dev/null || echo n/a)."
}

# ---- defaults --------------------------------------------------------------
init_defaults() {
  local ip host; ip=$(detect_ip); host=$(hostname -f 2>/dev/null || hostname)
  CFG[PRIMARY_DOMAIN]="exprsn.io"; CFG[PUBLIC_HOST]="${host:-exprsn.example.com}"; CFG[PUBLIC_IP]="$ip"
  CFG[INTERNAL_ZONE]="exprsn.local"; CFG[GATEWAY_PORT]="8443"
  CFG[KRB5_REALM]="$(realm_from_domain "${CFG[PRIMARY_DOMAIN]}")"; CFG[LDAP_BASE_DN]="$(basedn_from_domain "${CFG[PRIMARY_DOMAIN]}")"
  SERVICES="postgres redis opensearch rabbitmq minio nginx openldap kerberos bind9 postfix dovecot strongswan app firewall hostlogin backups"
  CFG[TLS_MODE]="selfsigned"; CFG[LE_EMAIL]="admin@${CFG[PRIMARY_DOMAIN]}"; CFG[TLS_IMPORT_CRT]=""; CFG[TLS_IMPORT_KEY]=""
  CFG[TLS_CERT_PATH]="$CERT_DIR/platform.crt"; CFG[TLS_KEY_PATH]="$CERT_DIR/platform.key"
  CFG[JWT_SECRET]="$(gen_secret 32)"; CFG[SESSION_SECRET]="$(gen_secret 32)"; CFG[SERVICE_TOKEN_SECRET]="$(gen_secret 48)"
  CFG[ATPROTO_SIGNING_KEY]="$(gen_secret 32)"; CFG[LDAP_ADMIN_PASSWORD]="$(gen_secret 20)"
  CFG[KRB5_MASTER_PASSWORD]="$(gen_secret 24)"; CFG[KRB5_ADMIN_PASSWORD]="$(gen_secret 20)"
  CFG[DB_NAME]="exprsn"; CFG[DB_USER]="exprsn"; CFG[DB_PASSWORD]="$(gen_secret 24)"; CFG[DB_PORT]="5432"; CFG[DB_REMOTE]="no"; CFG[DB_REMOTE_CIDR]="10.0.0.0/8"
  CFG[REDIS_PASSWORD]="$(gen_secret 24)"; CFG[REDIS_PORT]="6379"
  CFG[OS_HEAP]="512m"; CFG[OS_SECURITY]="off"; CFG[OS_ADMIN_PASSWORD]="$(gen_secret 16)"
  CFG[RABBITMQ_USER]="exprsn"; CFG[RABBITMQ_PASSWORD]="$(gen_secret 24)"
  CFG[LDAP_ORG]="Exprsn"; CFG[LDAP_TLS]="yes"; CFG[KRB5_CONTAINER_DN]="cn=krbContainer,${CFG[LDAP_BASE_DN]}"; CFG[HOST_LOGIN]="yes"
  CFG[GROUPS]="admins moderators users"; CFG[USERS]="admin|admin@${CFG[PRIMARY_DOMAIN]}|admins|$(gen_secret 12)"
  CFG[MAIL_DOMAIN]="${CFG[PRIMARY_DOMAIN]}"; CFG[MAIL_HOSTNAME]="mail.${CFG[PRIMARY_DOMAIN]}"
  CFG[MINIO_PORT]="9000"; CFG[MINIO_CONSOLE_PORT]="9001"; CFG[MINIO_ROOT_USER]="exprsn-admin"; CFG[MINIO_ROOT_PASSWORD]="$(gen_secret 16)"
  CFG[MINIO_APP_KEY]="exprsn-app"; CFG[MINIO_APP_SECRET]="$(gen_secret 20)"; CFG[MINIO_BUCKETS]="exprsn-filevault exprsn-ca-certificates"
  CFG[DNS_FORWARDERS]="1.1.1.1 8.8.8.8"; CFG[VPN_REMOTE_ADDR]=""; CFG[VPN_LOCAL_TS]="10.10.0.0/16"; CFG[VPN_REMOTE_TS]="10.20.0.0/16"; CFG[VPN_PSK]="$(gen_secret 24)"
  CFG[APP_DIR]="$(detect_appdir)"; CFG[APP_REPO_URL]=""; CFG[NODE_MAJOR]="20"; CFG[APP_USER]="exprsn"; CFG[APP_BUILD_WEB]="yes"; CFG[APP_SEED_DEMO]="no"
  CFG[SWAP_SIZE]="2G"; CFG[BACKUP_DIR]="/var/backups/exprsn"; CFG[BACKUP_KEEP]="7"
  CFG[ENV_TARGET]="both"; CFG[ENV_REPO_PATH]="${CFG[APP_DIR]}/.env"; CFG[ENV_PRINT]="no"
}

# ---- section editors (identical UX to the Ubuntu provisioner) --------------
edit_domain() {
  if [ "$UI" = dialog ]; then
    local out prev="${CFG[PRIMARY_DOMAIN]}"
    out=$(dialog --backtitle "$BT" --title "1 · Domain & Identity" --form "Type the primary domain; realm + base DN derive (editable)." 18 78 7 \
      "Primary domain" 1 2 "${CFG[PRIMARY_DOMAIN]}" 1 22 46 0 "Public FQDN (edge)" 2 2 "${CFG[PUBLIC_HOST]}" 2 22 46 0 \
      "Public IPv4" 3 2 "${CFG[PUBLIC_IP]}" 3 22 46 0 "Internal DNS zone" 4 2 "${CFG[INTERNAL_ZONE]}" 4 22 46 0 \
      "Kerberos realm" 5 2 "${CFG[KRB5_REALM]}" 5 22 46 0 "LDAP base DN" 6 2 "${CFG[LDAP_BASE_DN]}" 6 22 46 0 \
      "Gateway port" 7 2 "${CFG[GATEWAY_PORT]}" 7 22 46 0 3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"
    CFG[PRIMARY_DOMAIN]="${v[0]}"; CFG[PUBLIC_HOST]="${v[1]}"; CFG[PUBLIC_IP]="${v[2]}"; CFG[INTERNAL_ZONE]="${v[3]}"
    CFG[KRB5_REALM]="${v[4]}"; CFG[LDAP_BASE_DN]="${v[5]}"; CFG[GATEWAY_PORT]="${v[6]}"
    if [ "${CFG[PRIMARY_DOMAIN]}" != "$prev" ]; then
      [ "${CFG[KRB5_REALM]}" = "$(realm_from_domain "$prev")" ] && CFG[KRB5_REALM]="$(realm_from_domain "${CFG[PRIMARY_DOMAIN]}")"
      [ "${CFG[LDAP_BASE_DN]}" = "$(basedn_from_domain "$prev")" ] && CFG[LDAP_BASE_DN]="$(basedn_from_domain "${CFG[PRIMARY_DOMAIN]}")"
    fi
  else
    CFG[PRIMARY_DOMAIN]=$(ui_input "Domain" "Primary domain" "${CFG[PRIMARY_DOMAIN]}") || return 0
    CFG[KRB5_REALM]="$(realm_from_domain "${CFG[PRIMARY_DOMAIN]}")"; CFG[LDAP_BASE_DN]="$(basedn_from_domain "${CFG[PRIMARY_DOMAIN]}")"
    CFG[PUBLIC_HOST]=$(ui_input "Identity" "Public FQDN" "${CFG[PUBLIC_HOST]}") || true
    CFG[PUBLIC_IP]=$(ui_input "Identity" "Public IPv4" "${CFG[PUBLIC_IP]}") || true
    CFG[INTERNAL_ZONE]=$(ui_input "Identity" "Internal DNS zone" "${CFG[INTERNAL_ZONE]}") || true
    CFG[GATEWAY_PORT]=$(ui_input "Identity" "Gateway port" "${CFG[GATEWAY_PORT]}") || true
  fi
  CFG[KRB5_CONTAINER_DN]="cn=krbContainer,${CFG[LDAP_BASE_DN]}"; CFG[MAIL_DOMAIN]="${CFG[PRIMARY_DOMAIN]}"; CFG[MAIL_HOSTNAME]="mail.${CFG[PRIMARY_DOMAIN]}"
}
edit_services() {
  local out
  out=$(ui_check "2 · Services" "Select services to install." 16 \
    "postgres" "PostgreSQL + PostGIS" "$(has postgres && echo ON||echo OFF)" "redis" "Redis" "$(has redis && echo ON||echo OFF)" \
    "opensearch" "OpenSearch" "$(has opensearch && echo ON||echo OFF)" "rabbitmq" "RabbitMQ" "$(has rabbitmq && echo ON||echo OFF)" \
    "minio" "MinIO (S3)" "$(has minio && echo ON||echo OFF)" "nginx" "Nginx (TLS edge)" "$(has nginx && echo ON||echo OFF)" \
    "openldap" "OpenLDAP (directory + auth)" "$(has openldap && echo ON||echo OFF)" "kerberos" "Kerberos KDC (in LDAP)" "$(has kerberos && echo ON||echo OFF)" \
    "bind9" "BIND9 (DNS + MX/SRV)" "$(has bind9 && echo ON||echo OFF)" "postfix" "Postfix (LDAP SMTP)" "$(has postfix && echo ON||echo OFF)" \
    "dovecot" "Dovecot (LDAP IMAP/POP3)" "$(has dovecot && echo ON||echo OFF)" "strongswan" "strongSwan" "$(has strongswan && echo ON||echo OFF)" \
    "srs" "SRS (live ingest)" "$(has srs && echo ON||echo OFF)" "app" "Deploy platform" "$(has app && echo ON||echo OFF)" \
    "hostlogin" "Host login (SSSD+authselect)" "$(has hostlogin && echo ON||echo OFF)" "backups" "Nightly backups" "$(has backups && echo ON||echo OFF)" \
    "firewall" "firewalld rules" "$(has firewall && echo ON||echo OFF)") || return 0
  SERVICES=$(echo "$out" | tr '\n' ' ')
  { has kerberos || has hostlogin; } && ! has openldap && { SERVICES="$SERVICES openldap"; ui_msg "Dependency" "Kerberos/host-login require OpenLDAP — re-enabled."; }
}
edit_keys() {
  local mode
  mode=$(ui_radio "3 · TLS certificate" "Certificate source:" 3 \
    "selfsigned" "OpenSSL self-signed" "$([ "${CFG[TLS_MODE]}" = selfsigned ] && echo ON||echo OFF)" \
    "letsencrypt" "Let's Encrypt (certbot)" "$([ "${CFG[TLS_MODE]}" = letsencrypt ] && echo ON||echo OFF)" \
    "import" "Import existing crt/key" "$([ "${CFG[TLS_MODE]}" = import ] && echo ON||echo OFF)") || return 0
  [ -n "$mode" ] && CFG[TLS_MODE]="$mode"
  case "${CFG[TLS_MODE]}" in
    letsencrypt) CFG[LE_EMAIL]=$(ui_input "Let's Encrypt" "Contact email" "${CFG[LE_EMAIL]}") || true ;;
    import) CFG[TLS_IMPORT_CRT]=$(ui_input "Import cert" "Path to .crt" "${CFG[TLS_IMPORT_CRT]:-/etc/pki/tls/certs/exprsn.crt}") || true
            CFG[TLS_IMPORT_KEY]=$(ui_input "Import key" "Path to .key" "${CFG[TLS_IMPORT_KEY]:-/etc/pki/tls/private/exprsn.key}") || true ;;
  esac
  local sel k v
  sel=$(ui_check "3 · Keys & secrets" "Tick a secret to TYPE it; unticked keep auto-generated value." 8 \
    "JWT_SECRET" "JWT secret" OFF "SESSION_SECRET" "Session secret" OFF "SERVICE_TOKEN_SECRET" "Service HMAC seed" OFF \
    "ATPROTO_SIGNING_KEY" "AT-Proto key" OFF "LDAP_ADMIN_PASSWORD" "LDAP admin" OFF "KRB5_MASTER_PASSWORD" "KDC master" OFF) || return 0
  while IFS= read -r k; do [ -z "$k" ] && continue; v=$(ui_pass "Secret" "Value for ${k}:") || continue; [ -n "$v" ] && CFG[$k]="$v"; done <<< "$sel"
}
edit_postgres() {
  CFG[DB_NAME]=$(ui_input "4 · PostgreSQL" "Database name" "${CFG[DB_NAME]}") || return 0
  CFG[DB_USER]=$(ui_input "4 · PostgreSQL" "Role/username" "${CFG[DB_USER]}") || return 0
  local p; p=$(ui_pass "4 · PostgreSQL" "Password (blank=keep)") || true; [ -n "$p" ] && CFG[DB_PASSWORD]="$p"
  CFG[DB_PORT]=$(ui_input "4 · PostgreSQL" "Listen port" "${CFG[DB_PORT]}") || true
  if ui_yesno "4 · PostgreSQL" "Allow remote TCP? No = localhost only."; then CFG[DB_REMOTE]="yes"; CFG[DB_REMOTE_CIDR]=$(ui_input "4 · PostgreSQL" "CIDR (md5)" "${CFG[DB_REMOTE_CIDR]}") || true; else CFG[DB_REMOTE]="no"; fi
}
edit_directory() {
  if [ "$UI" = dialog ]; then
    local out; out=$(dialog --backtitle "$BT" --title "5 · Directory & Auth" --form "OpenLDAP auth source; Kerberos principals stored in it." 15 80 4 \
      "Organisation" 1 2 "${CFG[LDAP_ORG]}" 1 20 50 0 "Base DN" 2 2 "${CFG[LDAP_BASE_DN]}" 2 20 50 0 \
      "Kerberos realm" 3 2 "${CFG[KRB5_REALM]}" 3 20 50 0 "KDC container DN" 4 2 "${CFG[KRB5_CONTAINER_DN]}" 4 20 50 0 3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"; CFG[LDAP_ORG]="${v[0]}"; CFG[LDAP_BASE_DN]="${v[1]}"; CFG[KRB5_REALM]="${v[2]}"; CFG[KRB5_CONTAINER_DN]="${v[3]}"
  else
    CFG[LDAP_ORG]=$(ui_input "5 · Directory" "Organisation" "${CFG[LDAP_ORG]}") || return 0
    CFG[LDAP_BASE_DN]=$(ui_input "5 · Directory" "Base DN" "${CFG[LDAP_BASE_DN]}") || true
    CFG[KRB5_REALM]=$(ui_input "5 · Directory" "Kerberos realm" "${CFG[KRB5_REALM]}") || true
    CFG[KRB5_CONTAINER_DN]=$(ui_input "5 · Directory" "KDC container DN" "${CFG[KRB5_CONTAINER_DN]}") || true
  fi
  ui_yesno "5 · Directory" "Enable LDAPS/StartTLS with the platform cert?" && CFG[LDAP_TLS]=yes || CFG[LDAP_TLS]=no
  if ui_yesno "5 · Directory" "Configure host login via SSSD + authselect (LDAP id, Kerberos auth)?"; then CFG[HOST_LOGIN]="yes"; has hostlogin || SERVICES="$SERVICES hostlogin"
  else CFG[HOST_LOGIN]="no"; SERVICES=$(echo "$SERVICES" | sed 's/ hostlogin//; s/hostlogin //'); fi
}
add_user() {
  local u email grp p
  if [ "$UI" = dialog ]; then
    local out; out=$(dialog --backtitle "$BT" --title "Add user" --mixedform "New directory user (password blank=auto):" 13 70 4 \
      "uid" 1 2 "" 1 12 30 0 0 "email" 2 2 "" 2 12 40 0 0 "group" 3 2 "users" 3 12 30 0 0 "password" 4 2 "" 4 12 30 0 1 3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"; u="${v[0]}"; email="${v[1]}"; grp="${v[2]}"; p="${v[3]}"
  else u=$(ui_input "Add user" "uid") || return 0; email=$(ui_input "Add user" "email") || true; grp=$(ui_input "Add user" "group" "users") || true; p=$(ui_pass "Add user" "password (blank=auto)") || true; fi
  [ -z "$u" ] && return 0; [ -z "$email" ] && email="${u}@${CFG[MAIL_DOMAIN]}"; [ -z "$grp" ] && grp="users"; [ -z "$p" ] && p="$(gen_secret 12)"
  CFG[USERS]="${CFG[USERS]}
${u}|${email}|${grp}|${p}"
}
edit_users() {
  while true; do
    local items=() i=0 u email grp p
    while IFS='|' read -r u email grp p; do [ -z "$u" ] && continue; items+=("$i" "${u}  <${email}>  [${grp}]"); i=$((i+1)); done <<< "${CFG[USERS]}"
    local choice; choice=$(ui_menu "6 · Users & Groups" "Groups: ${CFG[GROUPS]}\nEach user → LDAP + Kerberos + mailbox." 14 "${items[@]}" "A" "➕ Add user" "G" "Edit groups" "B" "◀ Back") || return 0
    case "$choice" in
      A) add_user ;; G) CFG[GROUPS]=$(ui_input "Groups" "Space-separated names" "${CFG[GROUPS]}") || true ;; B|"") return 0 ;;
      *) if ui_yesno "Remove user" "Delete user #${choice}?"; then local n=0 keep=""; while IFS= read -r line; do [ -z "$line" ] && continue; [ "$n" != "$choice" ] && keep="${keep}${line}"$'\n'; n=$((n+1)); done <<< "${CFG[USERS]}"; CFG[USERS]="${keep%$'\n'}"; fi ;;
    esac
  done
}
edit_mail() {
  CFG[MAIL_DOMAIN]=$(ui_input "7 · Mail" "Mail domain" "${CFG[MAIL_DOMAIN]}") || return 0
  CFG[MAIL_HOSTNAME]=$(ui_input "7 · Mail" "Mail hostname (FQDN)" "${CFG[MAIL_HOSTNAME]}") || true
  ui_msg "7 · Mail" "Mailboxes are LDAP-backed: directory users with a 'mail' attribute are valid recipients and log in by email. Manage accounts in section 6."
}
edit_minio() {
  if [ "$UI" = dialog ]; then
    local out; out=$(dialog --backtitle "$BT" --title "8 · MinIO" --mixedform "S3 storage for filevault + CA." 16 78 6 \
      "API port" 1 2 "${CFG[MINIO_PORT]}" 1 16 20 0 0 "Console port" 2 2 "${CFG[MINIO_CONSOLE_PORT]}" 2 16 20 0 0 \
      "Root user" 3 2 "${CFG[MINIO_ROOT_USER]}" 3 16 30 0 0 "Root password" 4 2 "${CFG[MINIO_ROOT_PASSWORD]}" 4 16 30 0 1 \
      "App key" 5 2 "${CFG[MINIO_APP_KEY]}" 5 16 30 0 0 "App secret" 6 2 "${CFG[MINIO_APP_SECRET]}" 6 16 30 0 1 3>&1 1>&2 2>&3) || return 0
    local v; mapfile -t v <<< "$out"; CFG[MINIO_PORT]="${v[0]}"; CFG[MINIO_CONSOLE_PORT]="${v[1]}"; CFG[MINIO_ROOT_USER]="${v[2]}"; CFG[MINIO_ROOT_PASSWORD]="${v[3]}"; CFG[MINIO_APP_KEY]="${v[4]}"; CFG[MINIO_APP_SECRET]="${v[5]}"
  else CFG[MINIO_PORT]=$(ui_input "8 · MinIO" "API port" "${CFG[MINIO_PORT]}") || return 0; CFG[MINIO_ROOT_USER]=$(ui_input "8 · MinIO" "Root user" "${CFG[MINIO_ROOT_USER]}") || true; fi
  CFG[MINIO_BUCKETS]=$(ui_input "8 · MinIO" "Buckets (space-separated)" "${CFG[MINIO_BUCKETS]}") || true
}
edit_netvpn() {
  CFG[DNS_FORWARDERS]=$(ui_input "9 · DNS" "BIND forwarders (space-separated)" "${CFG[DNS_FORWARDERS]}") || return 0
  CFG[VPN_REMOTE_ADDR]=$(ui_input "9 · VPN" "strongSwan peer IP (blank=undefined)" "${CFG[VPN_REMOTE_ADDR]}") || true
  if [ -n "${CFG[VPN_REMOTE_ADDR]}" ]; then CFG[VPN_LOCAL_TS]=$(ui_input "9 · VPN" "Local TS" "${CFG[VPN_LOCAL_TS]}") || true; CFG[VPN_REMOTE_TS]=$(ui_input "9 · VPN" "Remote TS" "${CFG[VPN_REMOTE_TS]}") || true; local p; p=$(ui_pass "9 · VPN" "PSK (blank=keep)") || true; [ -n "$p" ] && CFG[VPN_PSK]="$p"; fi
}
edit_app() {
  CFG[APP_DIR]=$(ui_input "10 · App deploy" "Platform repo dir" "${CFG[APP_DIR]}") || return 0
  [ -f "${CFG[APP_DIR]}/package.json" ] || CFG[APP_REPO_URL]=$(ui_input "10 · App deploy" "git URL to clone (blank=skip)" "${CFG[APP_REPO_URL]}") || true
  CFG[NODE_MAJOR]=$(ui_input "10 · App deploy" "Node.js major" "${CFG[NODE_MAJOR]}") || true
  ui_yesno "10 · App deploy" "Build the web SPA?" && CFG[APP_BUILD_WEB]=yes || CFG[APP_BUILD_WEB]=no
  ui_yesno "10 · App deploy" "Run db:bootstrap + db:migrate, then seed demo?" && CFG[APP_SEED_DEMO]=yes || CFG[APP_SEED_DEMO]=no
  CFG[ENV_REPO_PATH]="${CFG[APP_DIR]}/.env"
}
edit_hardening() {
  CFG[SWAP_SIZE]=$(ui_input "11 · Hardening" "Swapfile size (0=skip)" "${CFG[SWAP_SIZE]}") || return 0
  CFG[BACKUP_DIR]=$(ui_input "11 · Backups" "Backup dir" "${CFG[BACKUP_DIR]}") || true
  CFG[BACKUP_KEEP]=$(ui_input "11 · Backups" "Days to retain" "${CFG[BACKUP_KEEP]}") || true
}
edit_env() {
  local m; m=$(ui_radio "12 · .env Output" "Where to write config:" 3 \
    "system" "/etc/exprsn/platform.env" "$([ "${CFG[ENV_TARGET]}" = system ] && echo ON||echo OFF)" \
    "repo" "Repo .env" "$([ "${CFG[ENV_TARGET]}" = repo ] && echo ON||echo OFF)" \
    "both" "Both" "$([ "${CFG[ENV_TARGET]}" = both ] && echo ON||echo OFF)") || return 0
  [ -n "$m" ] && CFG[ENV_TARGET]="$m"
  [ "${CFG[ENV_TARGET]}" != system ] && { CFG[ENV_REPO_PATH]=$(ui_input "12 · .env Output" "Repo .env path" "${CFG[ENV_REPO_PATH]}") || true; }
  ui_yesno "12 · .env Output" "Print secrets to screen at the end?" && CFG[ENV_PRINT]=yes || CFG[ENV_PRINT]=no
}

st() { [ "${1:-}" = touched ] && echo "✓" || echo "·"; }
hub() {
  declare -A T
  while true; do
    local n; n=$(echo "$SERVICES" | wc -w); local nu; nu=$(grep -c . <<< "${CFG[USERS]}")
    local choice
    choice=$(ui_menu "Exprsn Platform Provisioner (Fedora)" "Configure any section, then Install." 16 \
      "1" "Domain & Identity   →  ${CFG[PRIMARY_DOMAIN]} / ${CFG[KRB5_REALM]}  $(st "${T[1]:-}")" \
      "2" "Services            →  ${n} selected  $(st "${T[2]:-}")" \
      "3" "TLS & Keys          →  ${CFG[TLS_MODE]}  $(st "${T[3]:-}")" \
      "4" "PostgreSQL+PostGIS  →  db=${CFG[DB_NAME]} remote=${CFG[DB_REMOTE]}  $(st "${T[4]:-}")" \
      "5" "Directory & Auth    →  LDAP+KRB5 ldaps=${CFG[LDAP_TLS]} host=${CFG[HOST_LOGIN]}  $(st "${T[5]:-}")" \
      "6" "Users & Groups      →  ${nu} users  $(st "${T[6]:-}")" \
      "7" "Mail                →  ${CFG[MAIL_DOMAIN]}  $(st "${T[7]:-}")" \
      "8" "Object storage      →  MinIO :${CFG[MINIO_PORT]}  $(st "${T[8]:-}")" \
      "9" "DNS & VPN           →  zone=${CFG[INTERNAL_ZONE]}  $(st "${T[9]:-}")" \
      "10" "App deploy         →  ${CFG[APP_DIR]}  $(st "${T[10]:-}")" \
      "11" "Hardening & Backups →  swap=${CFG[SWAP_SIZE]}  $(st "${T[11]:-}")" \
      "12" ".env Output        →  ${CFG[ENV_TARGET]}  $(st "${T[12]:-}")" \
      "I" "▶  Install now" "Q" "Quit") || return 1
    case "$choice" in
      1) edit_domain; T[1]=touched;; 2) edit_services; T[2]=touched;; 3) edit_keys; T[3]=touched;; 4) edit_postgres; T[4]=touched;;
      5) edit_directory; T[5]=touched;; 6) edit_users; T[6]=touched;; 7) edit_mail; T[7]=touched;; 8) edit_minio; T[8]=touched;;
      9) edit_netvpn; T[9]=touched;; 10) edit_app; T[10]=touched;; 11) edit_hardening; T[11]=touched;; 12) edit_env; T[12]=touched;;
      I) confirm_install && return 0;; Q) return 1;;
    esac
  done
}
confirm_install() {
  local s=""
  s+="Host:    ${CFG[PUBLIC_HOST]} (${CFG[PUBLIC_IP]})\n"
  s+="Domain:  ${CFG[PRIMARY_DOMAIN]}  Realm: ${CFG[KRB5_REALM]}  BaseDN: ${CFG[LDAP_BASE_DN]}\n"
  s+="TLS:     ${CFG[TLS_MODE]}   Gateway: 127.0.0.1:${CFG[GATEWAY_PORT]}\n"
  s+="Auth:    OpenLDAP (KRB5 in LDAP), ldaps=${CFG[LDAP_TLS]}, host-login=${CFG[HOST_LOGIN]}\n"
  s+="Users:   $(grep -c . <<< "${CFG[USERS]}")  Groups: ${CFG[GROUPS]}\n"
  s+="SELinux: $(getenforce 2>/dev/null || echo n/a)   Firewall: firewalld\n"
  s+="Services: ${SERVICES}\n\nProceed?"
  ui_yesno "Confirm — review before installing" "$s"
}

# ---- provisioners (Fedora) -------------------------------------------------
dnf_install() { log "dnf install: $*"; dnf install -y -q "$@" >/dev/null; }
prep() { log "dnf makecache…"; dnf -q makecache >/dev/null 2>&1 || true; dnf_install ca-certificates curl gnupg2 git; ensure_semanage; }

do_sysctl() { printf 'vm.max_map_count=262144\nvm.swappiness=1\n' > /etc/sysctl.d/99-exprsn.conf; sysctl --system >/dev/null 2>&1 || true; log "sysctl set."; }
do_swap() {
  [ "${CFG[SWAP_SIZE]}" = 0 ] && return; swapon --show 2>/dev/null | grep -q . && { log "swap active."; return; }
  fallocate -l "${CFG[SWAP_SIZE]}" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=$(( ${CFG[SWAP_SIZE]%G} * 1024 )) status=none
  chmod 600 /swapfile; mkswap /swapfile >/dev/null; swapon /swapfile; grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab; log "swap ${CFG[SWAP_SIZE]}."
}
do_tls() {
  case "${CFG[TLS_MODE]}" in
    import) [ -s "${CFG[TLS_IMPORT_CRT]}" ] && [ -s "${CFG[TLS_IMPORT_KEY]}" ] || die "Import crt/key unreadable."; install -m644 "${CFG[TLS_IMPORT_CRT]}" "$CERT_DIR/platform.crt"; install -m600 "${CFG[TLS_IMPORT_KEY]}" "$CERT_DIR/platform.key" ;;
    letsencrypt) dnf_install certbot python3-certbot-nginx; CFG[_LE_PENDING]=yes ;;
  esac
  if [ ! -s "$CERT_DIR/platform.key" ]; then
    openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout "$CERT_DIR/platform.key" -out "$CERT_DIR/platform.crt" \
      -subj "/CN=${CFG[PUBLIC_HOST]}" -addext "subjectAltName=DNS:${CFG[PUBLIC_HOST]},DNS:localhost,IP:${CFG[PUBLIC_IP]},IP:127.0.0.1" >/dev/null 2>&1
    chmod 600 "$CERT_DIR/platform.key"
  fi
  CFG[TLS_CERT_PATH]="$CERT_DIR/platform.crt"; CFG[TLS_KEY_PATH]="$CERT_DIR/platform.key"
}
do_postgres() {
  dnf_install postgresql-server postgresql-contrib postgis
  [ -f /var/lib/pgsql/data/PG_VERSION ] || postgresql-setup --initdb >/dev/null 2>&1
  local conf=/var/lib/pgsql/data
  if [ "${CFG[DB_REMOTE]}" = yes ]; then sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = '*'/" "$conf/postgresql.conf"
    grep -q "exprsn provisioner" "$conf/pg_hba.conf" || printf "# exprsn provisioner\nhost all all %s md5\n" "${CFG[DB_REMOTE_CIDR]}" >> "$conf/pg_hba.conf"
  else sed -ri "s/^#?listen_addresses\s*=.*/listen_addresses = 'localhost'/" "$conf/postgresql.conf"; fi
  sed -ri "s/^#?port\s*=.*/port = ${CFG[DB_PORT]}/" "$conf/postgresql.conf"
  # Fedora default pg_hba uses ident for 127.0.0.1/::1 — switch to md5 so TCP password auth works.
  sed -ri 's#^(host\s+all\s+all\s+(127\.0\.0\.1/32|::1/128)\s+)(ident|peer)#\1md5#' "$conf/pg_hba.conf"
  [ "${CFG[DB_PORT]}" != "5432" ] && selinux_port "${CFG[DB_PORT]}" postgresql_port_t
  systemctl enable --now postgresql >/dev/null 2>&1 || true; systemctl restart postgresql; sleep 2
  local U="${CFG[DB_USER]}" P="${CFG[DB_PASSWORD]}" D="${CFG[DB_NAME]}"
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${U}') THEN CREATE ROLE "${U}" LOGIN PASSWORD '${P}'; ELSE ALTER ROLE "${U}" WITH LOGIN PASSWORD '${P}'; END IF; END \$\$;
SELECT 'CREATE DATABASE "${D}" OWNER "${U}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='${D}')\gexec
SQL
  sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$D" -c 'CREATE EXTENSION IF NOT EXISTS postgis; CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS citext;'
  log "PostgreSQL: db=${D} owner=${U} (pg_hba→md5)."
}
do_redis() {
  dnf_install redis; local c=/etc/redis/redis.conf; [ -f "$c" ] || c=/etc/redis.conf
  sed -ri "s/^#?\s*requirepass .*/requirepass ${CFG[REDIS_PASSWORD]}/" "$c" 2>/dev/null; grep -q "^requirepass" "$c" || echo "requirepass ${CFG[REDIS_PASSWORD]}" >> "$c"
  sed -ri "s/^#?\s*port .*/port ${CFG[REDIS_PORT]}/" "$c" 2>/dev/null
  systemctl enable --now redis >/dev/null 2>&1 || true; systemctl restart redis; log "Redis :${CFG[REDIS_PORT]}."
}
do_opensearch() {
  if [ ! -f /etc/yum.repos.d/opensearch-2.x.repo ]; then
    cat > /etc/yum.repos.d/opensearch-2.x.repo <<'EOF'
[opensearch-2.x]
name=OpenSearch 2.x
baseurl=https://artifacts.opensearch.org/releases/bundle/opensearch/2.x/yum
enabled=1
gpgcheck=1
gpgkey=https://artifacts.opensearch.org/publickeys/opensearch-PGP-KEY.pub
EOF
  fi
  OPENSEARCH_INITIAL_ADMIN_PASSWORD="${CFG[OS_ADMIN_PASSWORD]}" dnf_install opensearch || c_ylw "opensearch install issue."
  local c=/etc/opensearch/opensearch.yml
  { echo "discovery.type: single-node"; echo "network.host: 0.0.0.0"; [ "${CFG[OS_SECURITY]}" = off ] && echo "plugins.security.disabled: true"; } >> "$c"
  sed -ri "s/^-Xms.*/-Xms${CFG[OS_HEAP]}/; s/^-Xmx.*/-Xmx${CFG[OS_HEAP]}/" /etc/opensearch/jvm.options 2>/dev/null || true
  systemctl daemon-reload; systemctl enable --now opensearch >/dev/null 2>&1 || true; log "OpenSearch installed."
}
do_rabbitmq() {
  dnf_install rabbitmq-server; systemctl enable --now rabbitmq-server >/dev/null 2>&1 || true
  rabbitmq-plugins enable rabbitmq_management >/dev/null 2>&1 || true
  local U="${CFG[RABBITMQ_USER]}" P="${CFG[RABBITMQ_PASSWORD]}"
  rabbitmqctl list_users 2>/dev/null | grep -qw "$U" && rabbitmqctl change_password "$U" "$P" >/dev/null || rabbitmqctl add_user "$U" "$P" >/dev/null
  rabbitmqctl set_user_tags "$U" administrator >/dev/null; rabbitmqctl set_permissions -p / "$U" ".*" ".*" ".*" >/dev/null; rabbitmqctl delete_user guest >/dev/null 2>&1 || true
  log "RabbitMQ user=${U}."
}
do_minio() {
  case "$(uname -m)" in x86_64) MA=amd64;; aarch64) MA=arm64;; *) MA=amd64;; esac
  id minio-user >/dev/null 2>&1 || useradd -r -s /sbin/nologin minio-user
  mkdir -p /var/lib/minio; chown minio-user: /var/lib/minio
  [ -x /usr/local/bin/minio ] || { curl -fsSL "https://dl.min.io/server/minio/release/linux-${MA}/minio" -o /usr/local/bin/minio; chmod +x /usr/local/bin/minio; }
  [ -x /usr/local/bin/mc ] || { curl -fsSL "https://dl.min.io/client/mc/release/linux-${MA}/mc" -o /usr/local/bin/mc; chmod +x /usr/local/bin/mc; }
  cat > /etc/default/minio <<EOF
MINIO_ROOT_USER=${CFG[MINIO_ROOT_USER]}
MINIO_ROOT_PASSWORD=${CFG[MINIO_ROOT_PASSWORD]}
MINIO_VOLUMES=/var/lib/minio
MINIO_OPTS=--address :${CFG[MINIO_PORT]} --console-address :${CFG[MINIO_CONSOLE_PORT]}
EOF
  cat > /etc/systemd/system/minio.service <<'EOF'
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
  systemctl daemon-reload; systemctl enable --now minio >/dev/null 2>&1 || true
  local i; for i in $(seq 1 30); do /usr/local/bin/mc alias set local "http://localhost:${CFG[MINIO_PORT]}" "${CFG[MINIO_ROOT_USER]}" "${CFG[MINIO_ROOT_PASSWORD]}" >/dev/null 2>&1 && break; sleep 1; done
  local b; for b in ${CFG[MINIO_BUCKETS]}; do /usr/local/bin/mc mb --ignore-existing "local/$b" >/dev/null 2>&1; done
  /usr/local/bin/mc admin user add local "${CFG[MINIO_APP_KEY]}" "${CFG[MINIO_APP_SECRET]}" >/dev/null 2>&1 || true
  /usr/local/bin/mc admin policy attach local readwrite --user "${CFG[MINIO_APP_KEY]}" >/dev/null 2>&1 || true
  log "MinIO buckets: ${CFG[MINIO_BUCKETS]}."
}
do_openldap() {
  dnf_install openldap-servers openldap-clients
  [ -f /var/lib/ldap/DB_CONFIG ] || { cp -n /usr/share/openldap-servers/DB_CONFIG.example /var/lib/ldap/DB_CONFIG 2>/dev/null || true; chown ldap:ldap /var/lib/ldap/DB_CONFIG 2>/dev/null || true; }
  systemctl enable --now slapd >/dev/null 2>&1 || true; sleep 1
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}" hash; hash=$(slappasswd -s "$pw")
  # Locate the mdb database under cn=config and set suffix/rootDN/rootPW.
  local dbdn; dbdn=$(ldapsearch -Q -Y EXTERNAL -H ldapi:/// -b cn=config '(olcDatabase=*mdb)' dn 2>/dev/null | awk '/^dn:/{print $2; exit}')
  if [ -n "$dbdn" ]; then
    ldapmodify -Q -Y EXTERNAL -H ldapi:/// >/dev/null 2>&1 <<EOF || c_ylw "slapd suffix/rootpw modify issue."
dn: ${dbdn}
changetype: modify
replace: olcSuffix
olcSuffix: ${B}
-
replace: olcRootDN
olcRootDN: ${admin}
-
replace: olcRootPW
olcRootPW: ${hash}
EOF
  else c_ylw "Could not locate cn=config mdb database."; fi
  # Base schemas needed for posixAccount / inetOrgPerson.
  local s; for s in cosine nis inetorgperson; do ldapadd -Q -Y EXTERNAL -H ldapi:/// -f "/etc/openldap/schema/${s}.ldif" >/dev/null 2>&1 || true; done
  # Base entry + ou structure.
  cat > /tmp/base.ldif <<EOF
dn: ${B}
objectClass: dcObject
objectClass: organization
o: ${CFG[LDAP_ORG]}
dc: $(first_dc "$B")

dn: ou=People,${B}
objectClass: organizationalUnit
ou: People

dn: ou=Groups,${B}
objectClass: organizationalUnit
ou: Groups
EOF
  ldapadd -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/base.ldif >/dev/null 2>&1 || true; rm -f /tmp/base.ldif
  # LDAPS / StartTLS with the platform cert.
  if [ "${CFG[LDAP_TLS]}" = yes ]; then
    mkdir -p /etc/openldap/certs; install -m644 "$CERT_DIR/platform.crt" /etc/openldap/certs/platform.crt; install -m640 "$CERT_DIR/platform.key" /etc/openldap/certs/platform.key; chown -R ldap:ldap /etc/openldap/certs
    ldapmodify -Q -Y EXTERNAL -H ldapi:/// >/dev/null 2>&1 <<EOF || c_ylw "LDAP TLS modify issue."
dn: cn=config
changetype: modify
replace: olcTLSCertificateFile
olcTLSCertificateFile: /etc/openldap/certs/platform.crt
-
replace: olcTLSCertificateKeyFile
olcTLSCertificateKeyFile: /etc/openldap/certs/platform.key
EOF
    sed -ri 's|^SLAPD_URLS=.*|SLAPD_URLS="ldapi:/// ldap:/// ldaps:///"|' /etc/sysconfig/slapd 2>/dev/null || true
    systemctl restart slapd
  fi
  log "OpenLDAP (Fedora): suffix ${B}, ldaps=${CFG[LDAP_TLS]}."
}
do_kerberos() {
  has openldap || die "Kerberos-in-LDAP needs OpenLDAP."
  dnf_install krb5-server krb5-server-ldap krb5-workstation
  local realm="${CFG[KRB5_REALM]}" B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}" container="${CFG[KRB5_CONTAINER_DN]}"
  # Import Kerberos schema (path varies by release).
  if ! ldapsearch -Q -Y EXTERNAL -H ldapi:/// -b cn=schema,cn=config dn 2>/dev/null | grep -qi kerberos; then
    local sc; for sc in /usr/share/doc/krb5-server-ldap*/kerberos.{openldap.ldif,ldif,schema} /usr/share/doc/krb5-server-ldap/kerberos.*; do
      [ -f "$sc" ] || continue
      case "$sc" in *.schema) c_ylw "found .schema ($sc); convert via slapd or supply an .ldif"; ;; *) ldapadd -Q -Y EXTERNAL -H ldapi:/// -f "$sc" >/dev/null 2>&1 && { log "Kerberos schema imported ($sc)."; break; } ;; esac
    done
  fi
  mkdir -p "$KDCDIR"
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
        ldap_service_password_file = ${KDCDIR}/service.keyfile
        ldap_servers = ldapi:///
        ldap_conns_per_server = 5
    }
EOF
  echo "*/admin@${realm} *" > "$KDCDIR/kadm5.acl"
  printf '%s\n%s\n' "$pw" "$pw" | kdb5_ldap_util -D "$admin" -w "$pw" stashsrvpw -f "$KDCDIR/service.keyfile" "$admin" >/dev/null 2>&1 || true
  if ! kdb5_ldap_util -D "$admin" -w "$pw" view -r "$realm" >/dev/null 2>&1; then
    log "Creating Kerberos realm ${realm} in LDAP…"
    kdb5_ldap_util -D "$admin" -w "$pw" create -subtrees "$B" -r "$realm" -s -P "${CFG[KRB5_MASTER_PASSWORD]}" -H ldapi:/// || c_ylw "kdb5_ldap_util create issue."
  fi
  kadmin.local -q "getprinc admin/admin@${realm}" >/dev/null 2>&1 || kadmin.local -q "addprinc -pw ${CFG[KRB5_ADMIN_PASSWORD]} admin/admin@${realm}" >/dev/null 2>&1
  systemctl enable --now krb5kdc kadmin >/dev/null 2>&1 || true; systemctl restart krb5kdc kadmin 2>/dev/null || true
  log "Kerberos realm=${realm}: principals in LDAP (${container}); KDC dir ${KDCDIR}."
}
do_keytabs() {
  has kerberos || return; local realm="${CFG[KRB5_REALM]}" fqdn="${CFG[PUBLIC_HOST]}" svc
  for svc in host HTTP ldap imap smtp; do
    kadmin.local -q "getprinc ${svc}/${fqdn}@${realm}" >/dev/null 2>&1 || kadmin.local -q "addprinc -randkey ${svc}/${fqdn}@${realm}" >/dev/null 2>&1
    kadmin.local -q "ktadd -k /etc/krb5.keytab ${svc}/${fqdn}@${realm}" >/dev/null 2>&1
  done
  chmod 600 /etc/krb5.keytab 2>/dev/null || true; log "Service keytabs → /etc/krb5.keytab."
}
do_users() {
  has openldap || return
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}" realm="${CFG[KRB5_REALM]}" gid=20000 g
  for g in ${CFG[GROUPS]}; do printf 'dn: cn=%s,ou=Groups,%s\nobjectClass: posixGroup\ncn: %s\ngidNumber: %s\n' "$g" "$B" "$g" "$gid" > /tmp/g.ldif; ldapadd -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/g.ldif >/dev/null 2>&1 || true; gid=$((gid+1)); done
  local uid=10001 u email grp upw hash
  while IFS='|' read -r u email grp upw; do
    [ -z "$u" ] && continue; [ -z "$upw" ] && upw="$(gen_secret 12)"; hash=$(slappasswd -s "$upw")
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
    [ -n "$grp" ] && { printf 'dn: cn=%s,ou=Groups,%s\nchangetype: modify\nadd: memberUid\nmemberUid: %s\n' "$grp" "$B" "$u" > /tmp/m.ldif; ldapmodify -c -x -H ldap://localhost -D "$admin" -w "$pw" -f /tmp/m.ldif >/dev/null 2>&1 || true; }
    has kerberos && { kadmin.local -q "getprinc ${u}@${realm}" >/dev/null 2>&1 || kadmin.local -q "addprinc -pw ${upw} ${u}@${realm}" >/dev/null 2>&1; }
    uid=$((uid+1))
  done <<< "${CFG[USERS]}"
  rm -f /tmp/g.ldif /tmp/u.ldif /tmp/m.ldif; log "Provisioned $(grep -c . <<< "${CFG[USERS]}") users + groups$(has kerberos && echo ' + Kerberos')."
}
do_hostlogin() {
  has openldap || die "Host login needs OpenLDAP."
  dnf_install sssd sssd-tools oddjob-mkhomedir authselect
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
  authselect select sssd with-mkhomedir --force >/dev/null 2>&1 || c_ylw "authselect select failed — run: authselect select sssd with-mkhomedir --force"
  systemctl enable --now oddjobd sssd >/dev/null 2>&1 || true; systemctl restart sssd
  log "Host login: SSSD + authselect (LDAP id, Kerberos auth)."
}
do_bind9() {
  dnf_install bind bind-utils
  local zone="${CFG[INTERNAL_ZONE]}" realm="${CFG[KRB5_REALM]}" fwd; fwd=$(echo "${CFG[DNS_FORWARDERS]}" | tr ' ' ';')
  # options + zone reference appended into /etc/named.conf (idempotent include).
  grep -q 'include "/etc/named.exprsn.conf";' /etc/named.conf || echo 'include "/etc/named.exprsn.conf";' >> /etc/named.conf
  cat > /etc/named.exprsn.conf <<EOF
zone "${zone}" IN { type master; file "exprsn.zone"; allow-update { none; }; };
EOF
  # Ensure forwarders + recursion in the options block.
  grep -q "forwarders" /etc/named.conf || sed -ri "s/^(options \{)/\1\n\tforwarders { ${fwd}; };/" /etc/named.conf
  cat > /var/named/exprsn.zone <<EOF
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
_kerberos.${zone}.    IN TXT "${realm}"
_kerberos._udp        IN SRV 0 0 88   kdc.${zone}.
_kerberos._tcp        IN SRV 0 0 88   kdc.${zone}.
_kpasswd._udp         IN SRV 0 0 464  kdc.${zone}.
_kerberos-adm._tcp    IN SRV 0 0 749  kdc.${zone}.
_ldap._tcp            IN SRV 0 0 389  ldap.${zone}.
EOF
  chown root:named /var/named/exprsn.zone 2>/dev/null || true
  selinux_fcontext /var/named named_zone_t
  named-checkconf && named-checkzone "$zone" /var/named/exprsn.zone >/dev/null || c_ylw "named config/zone check failed."
  systemctl enable --now named >/dev/null 2>&1 || true; systemctl restart named
  log "BIND9 (Fedora): zone ${zone} (+MX, Kerberos/LDAP SRV)."
}
do_postfix() {
  dnf_install postfix postfix-ldap
  command -v alternatives >/dev/null 2>&1 && alternatives --set mta /usr/sbin/sendmail.postfix >/dev/null 2>&1 || true
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}"
  postconf -e "myhostname = ${CFG[MAIL_HOSTNAME]}" "mydomain = ${CFG[MAIL_DOMAIN]}" "myorigin = \$mydomain" \
    "inet_interfaces = all" "inet_protocols = ipv4" "mydestination = localhost" \
    "smtpd_tls_cert_file = ${CFG[TLS_CERT_PATH]}" "smtpd_tls_key_file = ${CFG[TLS_KEY_PATH]}" "smtpd_tls_security_level = may"
  if has openldap; then
    getent passwd vmail >/dev/null || useradd -r -u 5000 -d /var/vmail -s /sbin/nologin -m vmail
    mkdir -p /var/vmail; chown -R vmail: /var/vmail; selinux_fcontext /var/vmail mail_spool_t
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
    cp /etc/postfix/ldap-mailbox.cf /etc/postfix/ldap-alias.cf; sed -ri 's/result_format = .*/result_format = %s/' /etc/postfix/ldap-alias.cf
    chgrp postfix /etc/postfix/ldap-*.cf; chmod 640 /etc/postfix/ldap-*.cf
    postconf -e "virtual_mailbox_domains = ${CFG[MAIL_DOMAIN]}" "virtual_mailbox_base = /var/vmail" \
      "virtual_mailbox_maps = ldap:/etc/postfix/ldap-mailbox.cf" "virtual_alias_maps = ldap:/etc/postfix/ldap-alias.cf" \
      "virtual_transport = lmtp:unix:private/dovecot-lmtp" "virtual_minimum_uid = 5000" "virtual_uid_maps = static:5000" "virtual_gid_maps = static:5000"
  fi
  systemctl enable --now postfix >/dev/null 2>&1 || true; systemctl restart postfix
  log "Postfix (Fedora) mydomain=${CFG[MAIL_DOMAIN]} ($(has openldap && echo 'LDAP virtual mailboxes' || echo Maildir))."
}
do_dovecot() {
  dnf_install dovecot
  local B="${CFG[LDAP_BASE_DN]}" admin="cn=admin,${CFG[LDAP_BASE_DN]}" pw="${CFG[LDAP_ADMIN_PASSWORD]}"
  sed -ri 's|^#?ssl =.*|ssl = yes|' /etc/dovecot/conf.d/10-ssl.conf 2>/dev/null || true
  sed -ri "s|^#?ssl_cert =.*|ssl_cert = <${CFG[TLS_CERT_PATH]}|" /etc/dovecot/conf.d/10-ssl.conf 2>/dev/null || true
  sed -ri "s|^#?ssl_key =.*|ssl_key = <${CFG[TLS_KEY_PATH]}|" /etc/dovecot/conf.d/10-ssl.conf 2>/dev/null || true
  if has openldap; then
    getent passwd vmail >/dev/null || useradd -r -u 5000 -d /var/vmail -s /sbin/nologin -m vmail
    mkdir -p /var/vmail; chown -R vmail: /var/vmail; selinux_fcontext /var/vmail mail_spool_t
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
  fi
  # LMTP socket for Postfix (Fedora postfix spool path).
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
  log "Dovecot (Fedora) ($(has openldap && echo 'LDAP userdb, login=email' || echo system))."
}
do_strongswan() {
  dnf_install strongswan
  printf 'net.ipv4.ip_forward = 1\nnet.ipv6.conf.all.forwarding = 1\n' > /etc/sysctl.d/99-exprsn-ipsec.conf; sysctl --system >/dev/null 2>&1 || true
  if [ -n "${CFG[VPN_REMOTE_ADDR]:-}" ]; then
    cat > /etc/strongswan/swanctl/swanctl.conf <<EOF
connections { exprsn-vpn { version = 2; local_addrs = ${CFG[PUBLIC_IP]}; remote_addrs = ${CFG[VPN_REMOTE_ADDR]}
  local { auth = psk; id = ${CFG[PUBLIC_HOST]} } remote { auth = psk; id = ${CFG[VPN_REMOTE_ADDR]} }
  children { net { local_ts = ${CFG[VPN_LOCAL_TS]}; remote_ts = ${CFG[VPN_REMOTE_TS]}; start_action = trap } } } }
secrets { ike-exprsn { id-local = ${CFG[PUBLIC_HOST]}; id-remote = ${CFG[VPN_REMOTE_ADDR]}; secret = "${CFG[VPN_PSK]}" } }
EOF
  fi
  systemctl enable --now strongswan >/dev/null 2>&1 || true; log "strongSwan installed."
}
do_srs() {
  dnf_install gcc gcc-c++ make
  if [ ! -x /usr/local/srs/objs/srs ]; then
    rm -rf /usr/local/srs-src; git clone --depth 1 -b 5.0release https://github.com/ossrs/srs.git /usr/local/srs-src || die "SRS clone failed."
    ( cd /usr/local/srs-src/trunk && ./configure >/dev/null && make -j"$(nproc)" >/dev/null ); mkdir -p /usr/local/srs && cp -r /usr/local/srs-src/trunk/objs /usr/local/srs/objs
  fi
  mkdir -p /usr/local/srs/conf
  printf 'listen 1935; max_connections 1000; daemon off; srs_log_tank console;\nhttp_api { enabled on; listen 1985; }\nhttp_server { enabled on; listen 8080; dir ./objs/nginx/html; }\nvhost __defaultVhost__ { hls { enabled on; hls_path ./objs/nginx/html; hls_fragment 4; hls_window 12; } http_remux { enabled on; mount [vhost]/[app]/[stream].flv; } }\n' > /usr/local/srs/conf/srs.conf
  cat > /etc/systemd/system/srs.service <<'EOF'
[Unit]
Description=SRS
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
    curl -fsSL "https://rpm.nodesource.com/setup_${CFG[NODE_MAJOR]}.x" | bash - >/dev/null 2>&1 && dnf_install nodejs || dnf_install nodejs
  fi
  id "${CFG[APP_USER]}" >/dev/null 2>&1 || useradd -r -m -d "/home/${CFG[APP_USER]}" -s /sbin/nologin "${CFG[APP_USER]}"
  local dir="${CFG[APP_DIR]}"
  if [ ! -f "$dir/package.json" ]; then [ -n "${CFG[APP_REPO_URL]}" ] || { c_ylw "No code at $dir and no repo URL — skip app."; return; }; git clone "${CFG[APP_REPO_URL]}" "$dir" || { c_ylw "clone failed."; return; }; fi
  chown -R "${CFG[APP_USER]}:${CFG[APP_USER]}" "$dir"
  sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm ci --no-audit --no-fund" 2>>"$LOG" || sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm install" 2>>"$LOG" || c_ylw "npm install errors."
  if [ "${CFG[APP_BUILD_WEB]}" = yes ]; then sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run web:install && npm run web:build" 2>>"$LOG" || c_ylw "web build failed."; [ -d "$dir/web/dist" ] && { chmod -R a+rX "$dir/web/dist"; selinux_fcontext "$dir/web/dist" httpd_sys_content_t; }; fi
  CFG[_APP_READY]=yes; log "App deployed to $dir."
}
do_dbsetup() {
  [ "${CFG[_APP_READY]:-}" = yes ] || { c_ylw "App not deployed — skip db bootstrap."; return; }
  local dir="${CFG[APP_DIR]}"
  sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run db:bootstrap" 2>>"$LOG" || c_ylw "db:bootstrap failed."
  sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run db:migrate" 2>>"$LOG" || c_ylw "db:migrate failed."
  [ "${CFG[APP_SEED_DEMO]}" = yes ] && { sudo -u "${CFG[APP_USER]}" bash -lc "cd '$dir' && npm run seed:timeline" 2>>"$LOG" || c_ylw "seed failed."; }
  log "DB bootstrap + migrate done."
}
do_systemd() {
  [ "${CFG[_APP_READY]:-}" = yes ] || return; local dir="${CFG[APP_DIR]}" u="${CFG[APP_USER]}"
  cat > /etc/systemd/system/exprsn-gateway.service <<EOF
[Unit]
Description=Exprsn Platform gateway
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service
[Service]
User=${u}
WorkingDirectory=${dir}
EnvironmentFile=/etc/exprsn/platform.env
ExecStart=/usr/bin/npm start
Restart=on-failure
[Install]
WantedBy=multi-user.target
EOF
  local w; for w in timeline prefetch atproto; do [ -f "$dir/services/$w/src/worker.js" ] || continue
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
  systemctl daemon-reload; systemctl enable --now exprsn-gateway >/dev/null 2>&1 || c_ylw "gateway didn't start — journalctl -u exprsn-gateway"
  for w in timeline prefetch atproto; do [ -f /etc/systemd/system/exprsn-worker-${w}.service ] && systemctl enable --now exprsn-worker-${w} >/dev/null 2>&1 || true; done
  log "systemd: exprsn-gateway + workers."
}
do_nginx() {
  dnf_install nginx; selinux_bool httpd_can_network_connect
  local web; if [ "${CFG[_APP_READY]:-}" = yes ] && [ -d "${CFG[APP_DIR]}/web/dist" ]; then web="${CFG[APP_DIR]}/web/dist"; else web=/usr/share/nginx/exprsn; mkdir -p "$web"; echo "<h1>Exprsn edge is up</h1>" > "$web/index.html"; selinux_fcontext "$web" httpd_sys_content_t; fi
  [ "${CFG[DB_PORT]}" ] && true
  selinux_port "${CFG[GATEWAY_PORT]}" http_port_t
  cat > /etc/nginx/conf.d/exprsn.conf <<EOF
upstream exprsn_gateway { server 127.0.0.1:${CFG[GATEWAY_PORT]}; }
proxy_ssl_verify off;
server { listen 80; server_name ${CFG[PUBLIC_HOST]}; return 301 https://\$host\$request_uri; }
server {
    listen 443 ssl; http2 on; server_name ${CFG[PUBLIC_HOST]};
    ssl_certificate ${CFG[TLS_CERT_PATH]}; ssl_certificate_key ${CFG[TLS_KEY_PATH]};
    client_max_body_size 100m; root ${web}; index index.html;
    location ~ ^/(ca|auth|spark|nexus|filevault|vault|timeline|prefetch|moderator|live|atproto|health)(/|\$) {
        proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; proxy_read_timeout 300s; }
    location ~ ^/(xrpc|\.well-known)(/|\$) { proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 300s; }
    location /socket.io/ { proxy_pass https://exprsn_gateway; proxy_set_header Host \$host; proxy_set_header Upgrade \$http_upgrade; proxy_set_header Connection "upgrade"; proxy_read_timeout 300s; }
    location /srs/ { proxy_pass http://127.0.0.1:8080/; proxy_set_header Host \$host; proxy_buffering off; }
    location / { try_files \$uri \$uri/ /index.html; }
}
EOF
  nginx -t && { systemctl enable --now nginx >/dev/null 2>&1 || true; systemctl reload nginx 2>/dev/null || systemctl restart nginx; } || c_ylw "nginx config test failed."
  if [ "${CFG[_LE_PENDING]:-}" = yes ]; then
    certbot --nginx -d "${CFG[PUBLIC_HOST]}" -m "${CFG[LE_EMAIL]}" --agree-tos -n --redirect \
      && { CFG[TLS_CERT_PATH]="/etc/letsencrypt/live/${CFG[PUBLIC_HOST]}/fullchain.pem"; CFG[TLS_KEY_PATH]="/etc/letsencrypt/live/${CFG[PUBLIC_HOST]}/privkey.pem"; } \
      || c_ylw "certbot failed; keeping self-signed."
  fi
  log "Nginx edge (conf.d/exprsn.conf) → 127.0.0.1:${CFG[GATEWAY_PORT]} (root ${web})."
}
do_backups() {
  mkdir -p "${CFG[BACKUP_DIR]}"; chmod 700 "${CFG[BACKUP_DIR]}"
  cat > /usr/local/sbin/exprsn-backup.sh <<EOF
#!/usr/bin/env bash
set -uo pipefail
DEST="${CFG[BACKUP_DIR]}"; KEEP=${CFG[BACKUP_KEEP]}; STAMP=\$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dumpall | gzip > "\$DEST/pg-\$STAMP.sql.gz" 2>/dev/null || true
command -v slapcat >/dev/null && slapcat 2>/dev/null | gzip > "\$DEST/ldap-\$STAMP.ldif.gz" || true
find "\$DEST" -type f -mtime +\$KEEP -delete 2>/dev/null || true
EOF
  chmod 700 /usr/local/sbin/exprsn-backup.sh
  cat > /etc/systemd/system/exprsn-backup.service <<'EOF'
[Unit]
Description=Exprsn nightly backup
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
  systemctl daemon-reload; systemctl enable --now exprsn-backup.timer >/dev/null 2>&1 || true; log "Backups nightly → ${CFG[BACKUP_DIR]}."
}
do_firewall() {
  systemctl enable --now firewalld >/dev/null 2>&1 || true
  fa() { firewall-cmd --permanent --add-port="$1" >/dev/null 2>&1 || true; }
  fa 22/tcp; has nginx && { fa 80/tcp; fa 443/tcp; }; fa "${CFG[GATEWAY_PORT]}/tcp"
  has postgres && [ "${CFG[DB_REMOTE]:-no}" = yes ] && fa "${CFG[DB_PORT]}/tcp"
  has openldap && { fa 389/tcp; fa 636/tcp; }
  has kerberos && { fa 88/tcp; fa 88/udp; fa 749/tcp; fa 464/udp; }
  has bind9 && { fa 53/tcp; fa 53/udp; }
  has postfix && fa 25/tcp; has dovecot && { for p in 143 993 110 995; do fa ${p}/tcp; done; }
  has minio && { fa "${CFG[MINIO_PORT]}/tcp"; fa "${CFG[MINIO_CONSOLE_PORT]}/tcp"; }
  has strongswan && { fa 500/udp; fa 4500/udp; }
  has srs && { fa 1935/tcp; fa 1985/tcp; }
  firewall-cmd --reload >/dev/null 2>&1 || true; log "firewalld configured."
}

build_env() {
  echo "# Generated by scripts/provision-fedora.sh on $(hostname)"
  echo "NODE_ENV=production"; echo "HOST=0.0.0.0"; echo "HTTPS_PORT=${CFG[GATEWAY_PORT]}"; echo "PUBLIC_HOST=${CFG[PUBLIC_HOST]}"
  echo "TLS_ENABLED=true"; echo "TLS_CERT_PATH=${CFG[TLS_CERT_PATH]}"; echo "TLS_KEY_PATH=${CFG[TLS_KEY_PATH]}"
  echo "JWT_SECRET=${CFG[JWT_SECRET]}"; echo "SESSION_SECRET=${CFG[SESSION_SECRET]}"; echo "SERVICE_TOKEN_SECRET=${CFG[SERVICE_TOKEN_SECRET]}"; echo "SERVICE_ID=platform"; echo "ATPROTO_SIGNING_KEY=${CFG[ATPROTO_SIGNING_KEY]}"
  has postgres && { echo "DB_HOST=localhost"; echo "DB_PORT=${CFG[DB_PORT]}"; echo "DB_NAME=${CFG[DB_NAME]}"; echo "DB_USER=${CFG[DB_USER]}"; echo "DB_PASSWORD=${CFG[DB_PASSWORD]}"; echo "DB_SSL=false"; }
  has redis && { echo "REDIS_HOST=localhost"; echo "REDIS_PORT=${CFG[REDIS_PORT]}"; echo "REDIS_PASSWORD=${CFG[REDIS_PASSWORD]}"; echo "REDIS_DB=0"; }
  has opensearch && echo "ELASTICSEARCH_NODE=http://localhost:9200"
  has rabbitmq && echo "RABBITMQ_URL=amqp://${CFG[RABBITMQ_USER]}:${CFG[RABBITMQ_PASSWORD]}@localhost:5672"
  has minio && { echo "S3_ENDPOINT=http://localhost:${CFG[MINIO_PORT]}"; echo "S3_BUCKET=exprsn-filevault"; echo "S3_REGION=us-east-1"; echo "AWS_REGION=us-east-1"; echo "AWS_ACCESS_KEY_ID=${CFG[MINIO_APP_KEY]}"; echo "AWS_SECRET_ACCESS_KEY=${CFG[MINIO_APP_SECRET]}"; echo "S3_BUCKET_NAME=exprsn-ca-certificates"; echo "S3_BUCKET_PREFIX=ca/"; }
  has openldap && { echo "LDAP_URL=ldap://localhost:389"; echo "LDAP_BASE_DN=${CFG[LDAP_BASE_DN]}"; echo "LDAP_ADMIN_DN=cn=admin,${CFG[LDAP_BASE_DN]}"; echo "LDAP_ADMIN_PASSWORD=${CFG[LDAP_ADMIN_PASSWORD]}"; echo "LDAP_USER_BASE=ou=People,${CFG[LDAP_BASE_DN]}"; echo "LDAP_GROUP_BASE=ou=Groups,${CFG[LDAP_BASE_DN]}"; }
  has kerberos && { echo "KRB5_REALM=${CFG[KRB5_REALM]}"; echo "KRB5_KDC=${CFG[PUBLIC_HOST]}"; echo "KRB5_BACKEND=ldap"; echo "KRB5_CONTAINER_DN=${CFG[KRB5_CONTAINER_DN]}"; }
  { has postfix || has dovecot; } && { echo "SMTP_HOST=localhost"; echo "SMTP_PORT=25"; echo "MAIL_DOMAIN=${CFG[MAIL_DOMAIN]}"; }
}
write_env() {
  local content; content=$(build_env)
  case "${CFG[ENV_TARGET]}" in system|both) echo "$content" > /etc/exprsn/platform.env; chmod 600 /etc/exprsn/platform.env; log "Wrote /etc/exprsn/platform.env.";; esac
  if [ "${CFG[ENV_TARGET]}" != system ] || has app; then
    local f="${CFG[ENV_REPO_PATH]}"; [ -f "$f" ] && cp -a "$f" "${f}.bak.$(date +%s)" 2>/dev/null && log "Backed up ${f}."
    echo "$content" > "$f"; chmod 600 "$f"; has app && [ "${CFG[_APP_READY]:-}" = yes ] && chown "${CFG[APP_USER]}:${CFG[APP_USER]}" "$f" 2>/dev/null || true; log "Wrote ${f}."
  fi
}

install_all() {
  prep; do_tls; do_swap; has opensearch && do_sysctl
  has postgres && do_postgres; has redis && do_redis; has opensearch && do_opensearch; has rabbitmq && do_rabbitmq; has minio && do_minio
  has openldap && do_openldap; has kerberos && do_kerberos; has kerberos && do_keytabs; has openldap && do_users; has hostlogin && do_hostlogin
  has bind9 && do_bind9; has postfix && do_postfix; has dovecot && do_dovecot; has strongswan && do_strongswan; has srs && do_srs
  has app && do_app; write_env; has app && do_dbsetup; has nginx && do_nginx; has app && do_systemd; has backups && do_backups; has firewall && do_firewall
}

main() {
  preflight; init_defaults
  ui_msg "Welcome" "Exprsn Platform provisioner for Fedora/RHEL.\n\nFull-depth native install: OpenLDAP (cn=config) as auth source, Kerberos principals stored IN LDAP (kldap), LDAP-backed Postfix/Dovecot, SSSD+authselect host login, MinIO, app deploy, swap/sysctl, firewalld and SELinux contexts.\n\nHub menu — configure, then Install. Nothing installs until you confirm."
  hub || { c_ylw "Cancelled — nothing installed."; exit 0; }
  log "Installing: ${SERVICES}"; install_all
  c_grn "===================================================================="
  c_grn " Provisioning complete (Fedora/RHEL)."
  c_grn "   Services:  ${SERVICES}"
  c_grn "   Domain:    ${CFG[PRIMARY_DOMAIN]}  Realm: ${CFG[KRB5_REALM]}  BaseDN: ${CFG[LDAP_BASE_DN]}"
  c_grn "   Users:     $(grep -c . <<< "${CFG[USERS]}") in LDAP+KRB+mail   SELinux: $(getenforce 2>/dev/null || echo n/a)"
  c_grn "   .env:      ${CFG[ENV_TARGET]}   Log: ${LOG}"
  c_grn "===================================================================="
  [ "${CFG[ENV_PRINT]}" = yes ] && { c_ylw "----- generated config -----"; build_env; }
  c_grn " Verify: systemctl status exprsn-gateway ; curl -k https://localhost:${CFG[GATEWAY_PORT]}/health"
}
main "$@"
