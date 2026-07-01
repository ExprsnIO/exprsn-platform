#!/usr/bin/env bash
# ============================================================================
# Exprsn — OS abstraction layer (sourced by targets/native.sh)
# ----------------------------------------------------------------------------
# Normalises package management, service management, firewall, and the
# per-distro package-name differences across:
#   apt    (Debian / Ubuntu)
#   dnf    (Fedora / RHEL / Rocky / Alma)
#   pacman (Arch / Manjaro)
#   brew   (macOS)
# Service control maps to systemd (Linux) or launchd/brew services (macOS).
# ============================================================================

# Re-derive platform if the bootstrap didn't export it (direct invocation).
OS="${EXPRSN_OS:-}"; DISTRO="${EXPRSN_DISTRO:-}"; PM="${EXPRSN_PM:-}"; SVC="${EXPRSN_SVC:-}"
if [ -z "$PM" ]; then
  case "$(uname -s)" in
    Darwin) OS=macos; DISTRO=macos; PM=brew; SVC=launchd ;;
    Linux) OS=linux; SVC=systemd
      [ -r /etc/os-release ] && . /etc/os-release && DISTRO="${ID:-unknown}" || DISTRO=unknown
      case "$DISTRO" in ubuntu|debian|linuxmint|pop) PM=apt;; fedora|rhel|centos|rocky|almalinux) PM=dnf;; arch|manjaro|endeavouros) PM=pacman;; *) PM=unknown;; esac ;;
  esac
fi

osx_brew_prefix() { brew --prefix 2>/dev/null || echo /opt/homebrew; }

# ---- package management ----------------------------------------------------
pkg_update() {
  case "$PM" in
    apt) sudo apt-get update -qq ;;
    dnf) sudo dnf -q makecache ;;
    pacman) sudo pacman -Sy --noconfirm >/dev/null ;;
    brew) brew update >/dev/null 2>&1 || true ;;
  esac
}
pkg_install() {  # pkg_install <pkg...>
  [ $# -eq 0 ] && return 0
  case "$PM" in
    apt) sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null ;;
    dnf) sudo dnf install -y -q "$@" ;;
    pacman) sudo pacman -S --noconfirm --needed "$@" >/dev/null ;;
    brew) brew install "$@" || true ;;
    *) echo "[os] cannot install on PM=$PM: $*" >&2; return 1 ;;
  esac
}

# os_pkgs <service> — echo the package list for the current PM.
os_pkgs() {
  case "$1" in
    base)        case "$PM" in apt) echo "ca-certificates curl gnupg git";; dnf) echo "ca-certificates curl gnupg2 git";; pacman) echo "ca-certificates curl gnupg git";; brew) echo "git";; esac ;;
    postgres)    case "$PM" in apt) echo "postgresql postgresql-contrib postgis";; dnf) echo "postgresql-server postgresql-contrib postgis";; pacman) echo "postgresql postgis";; brew) echo "postgresql@16 postgis";; esac ;;
    redis)       case "$PM" in apt) echo "redis-server";; dnf) echo "redis";; pacman) echo "redis";; brew) echo "redis";; esac ;;
    rabbitmq)    case "$PM" in apt|dnf) echo "rabbitmq-server";; pacman) echo "rabbitmq";; brew) echo "rabbitmq";; esac ;;
    nginx)       echo "nginx" ;;
    openldap)    case "$PM" in apt) echo "slapd ldap-utils";; dnf) echo "openldap-servers openldap-clients";; pacman) echo "openldap";; brew) echo "openldap";; esac ;;
    kerberos)    case "$PM" in apt) echo "krb5-kdc krb5-admin-server krb5-kdc-ldap krb5-user";; dnf) echo "krb5-server krb5-workstation";; pacman) echo "krb5";; brew) echo "krb5";; esac ;;
    bind9)       case "$PM" in apt) echo "bind9 bind9utils dnsutils";; dnf) echo "bind bind-utils";; pacman) echo "bind";; brew) echo "bind";; esac ;;
    postfix)     case "$PM" in apt) echo "postfix postfix-ldap";; dnf) echo "postfix";; pacman) echo "postfix";; brew) echo "postfix";; esac ;;
    dovecot)     case "$PM" in apt) echo "dovecot-core dovecot-imapd dovecot-pop3d dovecot-lmtpd dovecot-ldap";; dnf) echo "dovecot dovecot-pigeonhole";; pacman) echo "dovecot";; brew) echo "dovecot";; esac ;;
    strongswan)  case "$PM" in apt) echo "strongswan strongswan-swanctl libcharon-extra-plugins";; dnf) echo "strongswan";; pacman) echo "strongswan";; brew) echo "strongswan";; esac ;;
    sssd)        case "$PM" in apt) echo "sssd sssd-tools libnss-sss libpam-sss oddjob-mkhomedir";; dnf) echo "sssd sssd-tools oddjob-mkhomedir authselect";; pacman) echo "sssd";; brew) echo "";; esac ;;
    firewall)    case "$PM" in apt) echo "ufw";; dnf) echo "firewalld";; pacman) echo "ufw";; brew) echo "";; esac ;;
    nodejs)      case "$PM" in apt|dnf) echo "nodejs";; pacman) echo "nodejs npm";; brew) echo "node";; esac ;;
    docker)      case "$PM" in apt) echo "docker.io docker-compose-plugin";; dnf) echo "docker docker-compose-plugin";; pacman) echo "docker docker-compose";; brew) echo "docker";; esac ;;
    *) echo "$1" ;;
  esac
}

# ---- service management ----------------------------------------------------
# On macOS we use `brew services`; the unit name is the brew formula.
svc_enable_now() {  # <unit/formula>
  case "$SVC" in
    systemd) sudo systemctl enable --now "$1" >/dev/null 2>&1 || true ;;
    launchd) brew services start "$1" >/dev/null 2>&1 || true ;;
  esac
}
svc_restart() {
  case "$SVC" in
    systemd) sudo systemctl restart "$1" 2>/dev/null || true ;;
    launchd) brew services restart "$1" >/dev/null 2>&1 || true ;;
  esac
}
svc_reload() {
  case "$SVC" in systemd) sudo systemctl reload "$1" 2>/dev/null || svc_restart "$1" ;; launchd) svc_restart "$1" ;; esac
}
svc_daemon_reload() { [ "$SVC" = systemd ] && sudo systemctl daemon-reload || true; }

# ---- firewall --------------------------------------------------------------
fw_allow() {  # fw_allow <port>[/proto]
  case "$PM" in
    apt|pacman) sudo ufw allow "$1" >/dev/null 2>&1 || true ;;
    dnf) p="${1%%/*}"; proto="${1#*/}"; [ "$proto" = "$1" ] && proto=tcp
         sudo firewall-cmd --permanent --add-port="${p}/${proto}" >/dev/null 2>&1 || true ;;
    brew) : ;;  # macOS uses the Application Firewall; no per-port CLI parity
  esac
}
fw_enable() {
  case "$PM" in
    apt|pacman) sudo ufw --force enable >/dev/null 2>&1 || true ;;
    dnf) sudo systemctl enable --now firewalld >/dev/null 2>&1; sudo firewall-cmd --reload >/dev/null 2>&1 || true ;;
    brew) : ;;
  esac
}

# ---- SELinux (Fedora/RHEL) -------------------------------------------------
selinux_relax_proxy() {
  command -v setsebool >/dev/null 2>&1 || return 0
  sudo setsebool -P httpd_can_network_connect 1 2>/dev/null || true
}

# ---- Postgres init (differs per distro) ------------------------------------
pg_first_init() {
  case "$PM" in
    apt) : ;;                                   # apt auto-creates a cluster
    dnf) [ -f /var/lib/pgsql/data/PG_VERSION ] || sudo postgresql-setup --initdb >/dev/null 2>&1 || true ;;
    pacman) if [ ! -f /var/lib/postgres/data/PG_VERSION ]; then
              sudo -iu postgres initdb -D /var/lib/postgres/data >/dev/null 2>&1 || true; fi ;;
    brew) : ;;
  esac
}
pg_unit() { case "$PM" in apt) echo postgresql;; dnf) echo postgresql;; pacman) echo postgresql;; brew) echo "postgresql@16";; esac; }
redis_unit() { case "$PM" in apt) echo redis-server;; *) echo redis;; esac; }

export OS DISTRO PM SVC
