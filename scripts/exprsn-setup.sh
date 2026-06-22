#!/usr/bin/env bash
#
# ═══════════════════════════════════════════════════════════════════════════
#  exprsn-setup.sh — Exprsn Platform dependency installer & bootstrapper
# ═══════════════════════════════════════════════════════════════════════════
#
#  One self-contained script that, for each piece of software the Exprsn
#  Platform needs, lets you choose how to obtain it:
#
#      [V] Vendor stable binary   (default — production build from the vendor)
#      [P] OS package manager     (apt / dnf / yum / pacman, native paths)
#      [D] Docker                 (pull / run an official image)
#      [S] Source build           (download source, ./configure && make — last resort)
#
#  Software covered:
#      PostgreSQL · Redis · OpenSearch · RabbitMQ · Node.js · Nginx · Dovecot · OpenSSL
#
#  Supported hosts:
#      Ubuntu 22+ · Debian · RHEL · CentOS · Rocky · Alma · Fedora · Arch · macOS
#      (macOS deliberately does NOT use Homebrew — vendor binaries / source only.)
#
#  It can additionally:
#      • write systemd unit files (Linux) or launchd plists (macOS)
#      • start the services and test that each one answers
#      • create the required service users and config (DB role/db, redis auth, …)
#      • generate the platform .env, run db bootstrap + migrations
#      • create an administrative user, an organization, and issue root + intermediate CA certs
#      • start the Exprsn platform and curl its /health endpoint
#
#  Usage:
#      ./exprsn-setup.sh                 # interactive menu
#      ./exprsn-setup.sh all             # guided full install (still prompts per choice)
#      ./exprsn-setup.sh install <sw>    # install one component (postgresql|redis|...)
#      ./exprsn-setup.sh test            # run connectivity tests for everything
#      ./exprsn-setup.sh bootstrap       # .env + npm + certs + db + admin/org/CA + start
#      ./exprsn-setup.sh --help
#
#  Most settings can be overridden from the environment (see the CONFIG block).
# ═══════════════════════════════════════════════════════════════════════════

set -o errexit
set -o nounset
set -o pipefail

# ───────────────────────────────────────────────────────────────────────────
#  CONFIG — pinned stable versions and defaults (override via environment)
# ───────────────────────────────────────────────────────────────────────────
PG_MAJOR="${PG_MAJOR:-17}"
PG_FULL="${PG_FULL:-17.2}"
REDIS_VERSION="${REDIS_VERSION:-7.4.2}"
OPENSEARCH_VERSION="${OPENSEARCH_VERSION:-2.18.0}"
RABBITMQ_VERSION="${RABBITMQ_VERSION:-4.0.5}"
NODE_VERSION="${NODE_VERSION:-22.13.0}"
NGINX_VERSION="${NGINX_VERSION:-1.26.3}"
DOVECOT_VERSION="${DOVECOT_VERSION:-2.3.21.1}"
OPENSSL_VERSION="${OPENSSL_VERSION:-3.4.0}"

# Platform location — this script lives in <root>/scripts, so root is one up.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLATFORM_ROOT="${PLATFORM_ROOT:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

# Install prefix for binary/source installs where the package manager isn't used.
# (Package-manager installs use distro-native paths; this is only the fallback.)
PREFIX="${EXPRSN_PREFIX:-}"          # resolved per-OS in detect_os()
DATA_ROOT="${EXPRSN_DATA:-}"         # resolved per-OS in detect_os()
ETC_ROOT="${EXPRSN_ETC:-}"           # resolved per-OS in detect_os()

# Service connection defaults (must line up with the platform .env)
DB_HOST="${DB_HOST:-127.0.0.1}";        DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-exprsn}";           DB_USER="${DB_USER:-exprsn}"
DB_PASSWORD="${DB_PASSWORD:-}"          # blank => generated
REDIS_HOST="${REDIS_HOST:-127.0.0.1}";  REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"    # blank => generated
OPENSEARCH_HOST="${OPENSEARCH_HOST:-127.0.0.1}"; OPENSEARCH_PORT="${OPENSEARCH_PORT:-9200}"
RABBITMQ_HOST="${RABBITMQ_HOST:-127.0.0.1}";     RABBITMQ_PORT="${RABBITMQ_PORT:-5672}"
RABBITMQ_MGMT_PORT="${RABBITMQ_MGMT_PORT:-15672}"
RABBITMQ_USER="${RABBITMQ_USER:-exprsn}";        RABBITMQ_PASSWORD="${RABBITMQ_PASSWORD:-}"
RABBITMQ_VHOST="${RABBITMQ_VHOST:-/exprsn}"
HTTPS_PORT="${HTTPS_PORT:-8443}"
NGINX_TLS_PORT="${NGINX_TLS_PORT:-443}"
DOVECOT_IMAP_PORT="${DOVECOT_IMAP_PORT:-143}";   DOVECOT_IMAPS_PORT="${DOVECOT_IMAPS_PORT:-993}"

# Bootstrap identity defaults (prompted in bootstrap, overridable via env)
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@exprsn.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"    # blank => prompted/generated
ADMIN_FIRST="${ADMIN_FIRST:-System}";   ADMIN_LAST="${ADMIN_LAST:-Administrator}"
ORG_NAME="${ORG_NAME:-Exprsn}";         ORG_SLUG="${ORG_SLUG:-exprsn}"
ORG_TYPE="${ORG_TYPE:-enterprise}"
CA_NAME="${CA_NAME:-Exprsn Root CA}";   CA_ORG="${CA_ORG:-Exprsn Platform}"
CA_COUNTRY="${CA_COUNTRY:-US}";         CA_STATE="${CA_STATE:-CA}"
CA_LOCALITY="${CA_LOCALITY:-San Francisco}"
CA_OU="${CA_OU:-Certificate Authority}"; CA_EMAIL="${CA_EMAIL:-$ADMIN_EMAIL}"

ASSUME_YES="${ASSUME_YES:-false}"       # -y / EXPRSN_YES=true to skip confirmations

# ───────────────────────────────────────────────────────────────────────────
#  Pretty output
# ───────────────────────────────────────────────────────────────────────────
if [[ -t 1 ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GRN=$'\033[32m'; C_YLW=$'\033[33m'
  C_BLU=$'\033[34m'; C_CYN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GRN=""; C_YLW=""; C_BLU=""; C_CYN=""
fi
log()  { printf '%s\n' "${C_DIM}[$(date '+%H:%M:%S')]${C_RESET} $*"; }
info() { printf '%s\n' "${C_CYN}›${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GRN}✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YLW}!${C_RESET} $*" >&2; }
err()  { printf '%s\n' "${C_RED}✗ $*${C_RESET}" >&2; }
die()  { err "$*"; exit 1; }
hr()   { printf '%s\n' "${C_DIM}────────────────────────────────────────────────────────────────────${C_RESET}"; }
head() { printf '\n%s\n' "${C_BOLD}${C_BLU}== $* ==${C_RESET}"; }

# ───────────────────────────────────────────────────────────────────────────
#  Generic helpers
# ───────────────────────────────────────────────────────────────────────────
have() { command -v "$1" >/dev/null 2>&1; }

confirm() {  # confirm "Question?"  -> 0 yes / 1 no
  local q="$1" ans
  [[ "$ASSUME_YES" == "true" ]] && return 0
  read -r -p "${q} [y/N] " ans </dev/tty || true
  [[ "$ans" =~ ^[Yy]$ ]]
}

ask() {  # ask "Prompt" "default" -> echoes answer
  local prompt="$1" def="${2:-}" ans
  if [[ -n "$def" ]]; then
    read -r -p "${prompt} [${def}]: " ans </dev/tty || true
    printf '%s' "${ans:-$def}"
  else
    read -r -p "${prompt}: " ans </dev/tty || true
    printf '%s' "$ans"
  fi
}

ask_secret() {  # ask_secret "Prompt" -> echoes secret (hidden input)
  local prompt="$1" ans
  read -r -s -p "${prompt}: " ans </dev/tty || true
  printf '\n' >&2
  printf '%s' "$ans"
}

gen_secret() { # gen_secret [bytes] -> url-safe-ish base64 secret
  local n="${1:-32}"
  if have openssl; then openssl rand -base64 "$n" | tr -d '\n=+/' ; else
    head -c "$n" /dev/urandom | LC_ALL=C tr -dc 'A-Za-z0-9' ; fi
}

# Run a command as root (passwordless if already root; sudo otherwise).
SUDO=""
as_root() {
  if [[ "${OS_FAMILY:-}" == "macos" || "$(id -u)" -ne 0 ]]; then
    $SUDO "$@"
  else
    "$@"
  fi
}

# Download a URL to a path, preferring curl, falling back to wget.
fetch() {  # fetch <url> <dest>
  local url="$1" dest="$2"
  info "Downloading ${url##*/}"
  if have curl; then
    curl -fL --retry 3 -o "$dest" "$url"
  elif have wget; then
    wget -q -O "$dest" "$url"
  else
    die "Neither curl nor wget is available to download $url"
  fi
}

# Per-software install-method chooser. Echoes one of: vendor pkg docker source skip
choose_method() {  # choose_method <SoftwareLabel> <recommended>
  local label="$1" rec="${2:-vendor}" ans
  if [[ "$ASSUME_YES" == "true" ]]; then printf '%s' "$rec"; return; fi
  {
    printf '\n%s\n' "${C_BOLD}How should ${label} be installed?${C_RESET}"
    printf '  %s  vendor stable binary %s\n' "[V]" "$([[ $rec == vendor ]] && echo '(recommended)')"
    printf '  %s  OS package manager   %s\n' "[P]" "$([[ $rec == pkg ]] && echo '(recommended)')"
    printf '  %s  Docker container     %s\n' "[D]" "$([[ $rec == docker ]] && echo '(recommended)')"
    printf '  %s  build from source    %s\n' "[S]" "$([[ $rec == source ]] && echo '(recommended)')"
    printf '  %s  skip\n' "[-]"
  } >/dev/tty
  read -r -p "Choice [${rec}]: " ans </dev/tty || true
  case "${ans:-}" in
    [Vv]*) printf 'vendor' ;;
    [Pp]*) printf 'pkg' ;;
    [Dd]*) printf 'docker' ;;
    [Ss]*) printf 'source' ;;
    -|[Nn]*|skip) printf 'skip' ;;
    "") printf '%s' "$rec" ;;
    *) printf '%s' "$rec" ;;
  esac
}

# ───────────────────────────────────────────────────────────────────────────
#  OS / package-manager detection
# ───────────────────────────────────────────────────────────────────────────
OS_FAMILY=""   # debian | rhel | arch | macos
OS_ID=""       # ubuntu, debian, fedora, rhel, centos, rocky, almalinux, arch, macos
OS_VER=""
PKG=""         # apt-get | dnf | yum | pacman | none(macos)
ARCH=""        # x86_64 | aarch64 (normalized)
NODE_ARCH=""   # x64 | arm64 (nodejs.org naming)
INIT=""        # systemd | launchd | none

detect_os() {
  local uname_s; uname_s="$(uname -s)"
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) ARCH="x86_64"; NODE_ARCH="x64" ;;
    aarch64|arm64) ARCH="aarch64"; NODE_ARCH="arm64" ;;
  esac

  if [[ "$uname_s" == "Darwin" ]]; then
    OS_FAMILY="macos"; OS_ID="macos"; OS_VER="$(sw_vers -productVersion 2>/dev/null || echo '?')"
    PKG="none"; INIT="launchd"
    PREFIX="${PREFIX:-/usr/local/exprsn}"
    DATA_ROOT="${DATA_ROOT:-/usr/local/exprsn/data}"
    ETC_ROOT="${ETC_ROOT:-/usr/local/exprsn/etc}"
  elif [[ -r /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-linux}"; OS_VER="${VERSION_ID:-}"
    case " ${ID:-} ${ID_LIKE:-} " in
      *" debian "*|*" ubuntu "*) OS_FAMILY="debian"; PKG="apt-get" ;;
      *" rhel "*|*" fedora "*|*" centos "*) OS_FAMILY="rhel"; PKG="$(have dnf && echo dnf || echo yum)" ;;
      *" arch "*) OS_FAMILY="arch"; PKG="pacman" ;;
      *) # fall back on ID
         case "${ID:-}" in
           ubuntu|debian) OS_FAMILY="debian"; PKG="apt-get" ;;
           fedora|rhel|centos|rocky|almalinux) OS_FAMILY="rhel"; PKG="$(have dnf && echo dnf || echo yum)" ;;
           arch|manjaro|endeavouros) OS_FAMILY="arch"; PKG="pacman" ;;
           *) die "Unsupported Linux distribution: ${ID:-unknown}" ;;
         esac ;;
    esac
    INIT="$(have systemctl && echo systemd || echo none)"
    PREFIX="${PREFIX:-/opt/exprsn}"
    DATA_ROOT="${DATA_ROOT:-/opt/exprsn/data}"
    ETC_ROOT="${ETC_ROOT:-/opt/exprsn/etc}"
  else
    die "Cannot determine operating system (no /etc/os-release, not Darwin)."
  fi

  # sudo handling
  if [[ "$OS_FAMILY" != "macos" && "$(id -u)" -ne 0 ]]; then
    have sudo || die "This needs root for system installs; please install sudo or run as root."
    SUDO="sudo"
  fi
}

pkg_install() {  # pkg_install <pkg...>
  case "$PKG" in
    apt-get) as_root apt-get update -y && as_root apt-get install -y "$@" ;;
    dnf)     as_root dnf install -y "$@" ;;
    yum)     as_root yum install -y "$@" ;;
    pacman)  as_root pacman -Sy --noconfirm "$@" ;;
    none)    warn "No package manager on macOS — skipping pkg_install $*" ; return 1 ;;
  esac
}

ensure_build_tools() {
  info "Ensuring a C toolchain is present (for source builds)"
  case "$OS_FAMILY" in
    debian) pkg_install build-essential pkg-config curl ca-certificates ;;
    rhel)   as_root "$PKG" groupinstall -y "Development Tools" || pkg_install gcc make ; pkg_install pkg-config curl ;;
    arch)   pkg_install base-devel curl ;;
    macos)  have cc || die "Xcode Command Line Tools required: run 'xcode-select --install' first." ;;
  esac
}

# ───────────────────────────────────────────────────────────────────────────
#  Service-manager abstraction (systemd unit / launchd plist)
# ───────────────────────────────────────────────────────────────────────────
SYSTEMD_DIR="/etc/systemd/system"
LAUNCHD_DIR="/Library/LaunchDaemons"

# install_service <name> <exec...> ; optional env via SVC_ENV (newline KEY=VAL),
# working dir via SVC_WORKDIR, run-as user via SVC_USER.
install_service() {
  local name="$1"; shift
  local exec_line="$*"
  local workdir="${SVC_WORKDIR:-}" user="${SVC_USER:-}" envblock="${SVC_ENV:-}"
  if [[ "$INIT" == "systemd" ]]; then
    local unit="${SYSTEMD_DIR}/${name}.service"
    info "Writing systemd unit ${unit}"
    {
      echo "[Unit]"
      echo "Description=Exprsn ${name}"
      echo "After=network.target"
      echo ""
      echo "[Service]"
      echo "Type=simple"
      [[ -n "$user" ]] && echo "User=${user}"
      [[ -n "$workdir" ]] && echo "WorkingDirectory=${workdir}"
      while IFS= read -r line; do [[ -n "$line" ]] && echo "Environment=${line}"; done <<<"$envblock"
      echo "ExecStart=${exec_line}"
      echo "Restart=on-failure"
      echo "RestartSec=5"
      echo "LimitNOFILE=65536"
      echo ""
      echo "[Install]"
      echo "WantedBy=multi-user.target"
    } | as_root tee "$unit" >/dev/null
    as_root systemctl daemon-reload
    ok "systemd unit ${name}.service installed"
  elif [[ "$INIT" == "launchd" ]]; then
    local plist="${LAUNCHD_DIR}/com.exprsn.${name}.plist"
    info "Writing launchd plist ${plist}"
    {
      echo '<?xml version="1.0" encoding="UTF-8"?>'
      echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
      echo '<plist version="1.0"><dict>'
      echo "  <key>Label</key><string>com.exprsn.${name}</string>"
      echo '  <key>ProgramArguments</key><array>'
      # naive split of exec line on spaces; quote-free exec lines only
      for tok in $exec_line; do echo "    <string>${tok}</string>"; done
      echo '  </array>'
      [[ -n "$workdir" ]] && echo "  <key>WorkingDirectory</key><string>${workdir}</string>"
      if [[ -n "$envblock" ]]; then
        echo '  <key>EnvironmentVariables</key><dict>'
        while IFS= read -r line; do
          [[ -z "$line" ]] && continue
          echo "    <key>${line%%=*}</key><string>${line#*=}</string>"
        done <<<"$envblock"
        echo '  </dict>'
      fi
      echo '  <key>RunAtLoad</key><true/>'
      echo '  <key>KeepAlive</key><true/>'
      echo "  <key>StandardErrorPath</key><string>${DATA_ROOT}/logs/${name}.err.log</string>"
      echo "  <key>StandardOutPath</key><string>${DATA_ROOT}/logs/${name}.out.log</string>"
      echo '</dict></plist>'
    } | as_root tee "$plist" >/dev/null
    as_root mkdir -p "${DATA_ROOT}/logs"
    ok "launchd plist com.exprsn.${name} installed"
  else
    warn "No service manager (systemd/launchd) detected — ${name} must be started manually."
  fi
}

start_service() {  # start_service <name>
  local name="$1"
  if [[ "$INIT" == "systemd" ]]; then
    as_root systemctl enable "$name" >/dev/null 2>&1 || true
    as_root systemctl restart "$name"
  elif [[ "$INIT" == "launchd" ]]; then
    as_root launchctl unload "${LAUNCHD_DIR}/com.exprsn.${name}.plist" 2>/dev/null || true
    as_root launchctl load -w "${LAUNCHD_DIR}/com.exprsn.${name}.plist"
  fi
}

# ───────────────────────────────────────────────────────────────────────────
#  Docker helpers
# ───────────────────────────────────────────────────────────────────────────
ensure_docker() {
  if have docker; then ok "Docker present: $(docker --version)"; return 0; fi
  warn "Docker is not installed."
  if confirm "Install Docker Engine via the official convenience script?"; then
    if [[ "$OS_FAMILY" == "macos" ]]; then
      die "Install Docker Desktop for Mac from https://www.docker.com/products/docker-desktop/ then re-run."
    fi
    fetch "https://get.docker.com" /tmp/get-docker.sh
    as_root sh /tmp/get-docker.sh
    as_root systemctl enable --now docker 2>/dev/null || true
  else
    return 1
  fi
}

docker_up() {  # docker_up <name> <image> <run-args...>
  local name="$1" image="$2"; shift 2
  ensure_docker || die "Docker required for this choice."
  info "Pulling ${image}"
  as_root docker pull "$image"
  as_root docker rm -f "$name" >/dev/null 2>&1 || true
  info "Starting container ${name}"
  as_root docker run -d --name "$name" --restart unless-stopped "$@" "$image"
  ok "Container ${name} started"
}

# ═══════════════════════════════════════════════════════════════════════════
#  PostgreSQL
# ═══════════════════════════════════════════════════════════════════════════
install_postgresql() {
  head "PostgreSQL ${PG_FULL}"
  local m; m="$(choose_method "PostgreSQL ${PG_FULL}" vendor)"
  case "$m" in
    skip) warn "Skipping PostgreSQL"; return ;;
    docker)
      docker_up exprsn-postgres "postgres:${PG_MAJOR}" \
        -p "${DB_PORT}:5432" \
        -e POSTGRES_USER="$DB_USER" -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB="$DB_NAME" \
        -v exprsn-pgdata:/var/lib/postgresql/data
      PG_VIA="docker"; return ;;
    vendor|pkg)
      case "$OS_FAMILY" in
        debian)
          if [[ "$m" == "vendor" ]]; then
            info "Adding the PostgreSQL Global Development Group (PGDG) apt repo"
            pkg_install curl ca-certificates gnupg
            as_root install -d /usr/share/postgresql-common/pgdg
            fetch "https://www.postgresql.org/media/keys/ACCC4CF8.asc" /tmp/pgdg.asc
            as_root gpg --dearmor -o /usr/share/keyrings/pgdg.gpg /tmp/pgdg.asc
            echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" \
              | as_root tee /etc/apt/sources.list.d/pgdg.list >/dev/null
            pkg_install "postgresql-${PG_MAJOR}"
          else
            pkg_install postgresql postgresql-contrib
          fi
          PG_SVC="postgresql" ;;
        rhel)
          if [[ "$m" == "vendor" ]]; then
            info "Adding the PGDG yum repo"
            local rel; rel="$(rpm -E %rhel 2>/dev/null || echo 9)"
            as_root "$PKG" install -y "https://download.postgresql.org/pub/repos/yum/reporpms/EL-${rel}-${ARCH}/pgdg-redhat-repo-latest.noarch.rpm" || \
              warn "PGDG repo rpm install failed; falling back to distro package"
            as_root "$PKG" -qy module disable postgresql 2>/dev/null || true
            pkg_install "postgresql${PG_MAJOR}-server" "postgresql${PG_MAJOR}" || pkg_install postgresql-server postgresql
            if [[ -x "/usr/pgsql-${PG_MAJOR}/bin/postgresql-${PG_MAJOR}-setup" ]]; then
              as_root "/usr/pgsql-${PG_MAJOR}/bin/postgresql-${PG_MAJOR}-setup" initdb || true
              PG_SVC="postgresql-${PG_MAJOR}"
            else
              as_root postgresql-setup --initdb || true
              PG_SVC="postgresql"
            fi
          else
            pkg_install postgresql-server postgresql
            as_root postgresql-setup --initdb 2>/dev/null || true
            PG_SVC="postgresql"
          fi ;;
        arch)
          pkg_install postgresql
          as_root install -d -o postgres -g postgres /var/lib/postgres/data
          as_root -u postgres initdb -D /var/lib/postgres/data 2>/dev/null || true
          PG_SVC="postgresql" ;;
        macos)
          info "Fetching EDB PostgreSQL ${PG_FULL} binaries (no Homebrew)"
          local edb_arch; edb_arch="$([[ $NODE_ARCH == arm64 ]] && echo osx-arm64 || echo osx)"
          local url="https://get.enterprisedb.com/postgresql/postgresql-${PG_FULL}-1-${edb_arch}-binaries.zip"
          fetch "$url" /tmp/pg.zip
          as_root mkdir -p "${PREFIX}/pgsql"
          as_root unzip -oq /tmp/pg.zip -d "${PREFIX}/pgsql"
          local pgbin="${PREFIX}/pgsql/pgsql/bin"
          as_root mkdir -p "${DATA_ROOT}/pgsql"
          as_root "${pgbin}/initdb" -D "${DATA_ROOT}/pgsql" -U "$DB_USER" --auth=scram-sha-256 2>/dev/null || true
          SVC_WORKDIR="${PREFIX}/pgsql" \
            install_service postgresql "${pgbin}/postgres -D ${DATA_ROOT}/pgsql -p ${DB_PORT}"
          PG_VIA="binary"; PG_BIN="$pgbin"; return ;;
      esac
      [[ "$OS_FAMILY" != macos ]] && { start_service "${PG_SVC:-postgresql}"; PG_VIA="service"; PG_SVC="${PG_SVC:-postgresql}"; } ;;
    source)
      ensure_build_tools
      pkg_install libreadline-dev zlib1g-dev 2>/dev/null || pkg_install readline-devel zlib-devel 2>/dev/null || true
      fetch "https://ftp.postgresql.org/pub/source/v${PG_FULL}/postgresql-${PG_FULL}.tar.gz" /tmp/pg.tgz
      tar xzf /tmp/pg.tgz -C /tmp
      ( cd "/tmp/postgresql-${PG_FULL}" && ./configure --prefix="${PREFIX}/pgsql" && make -j"$(getconf _NPROCESSORS_ONLN)" && as_root make install )
      as_root mkdir -p "${DATA_ROOT}/pgsql"
      as_root "${PREFIX}/pgsql/bin/initdb" -D "${DATA_ROOT}/pgsql" -U "$DB_USER" 2>/dev/null || true
      install_service postgresql "${PREFIX}/pgsql/bin/postgres -D ${DATA_ROOT}/pgsql -p ${DB_PORT}"
      PG_VIA="source"; PG_BIN="${PREFIX}/pgsql/bin"; return ;;
  esac
  ok "PostgreSQL install step complete"
}

configure_postgresql() {
  head "Configure PostgreSQL role & database"
  [[ -z "$DB_PASSWORD" ]] && { DB_PASSWORD="$(gen_secret 24)"; info "Generated DB password for '${DB_USER}'"; }
  # Build a psql runner appropriate to how PG was installed.
  local psql=(psql)
  if [[ "${PG_VIA:-}" == "docker" ]]; then
    info "Waiting for the postgres container to accept connections"
    local i; for i in $(seq 1 30); do as_root docker exec exprsn-postgres pg_isready -U "$DB_USER" >/dev/null 2>&1 && break; sleep 1; done
    as_root docker exec -e PGPASSWORD="$DB_PASSWORD" exprsn-postgres \
      psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "SELECT 1" >/dev/null 2>&1 \
      && ok "Container DB '${DB_NAME}' owned by '${DB_USER}' ready (created from image env)"
    return
  fi
  # Find a superuser to run as. On most distros that's the 'postgres' OS user.
  local run_as_postgres=(as_root -u postgres)
  if [[ "$OS_FAMILY" == "macos" || "${PG_VIA:-}" == "binary" || "${PG_VIA:-}" == "source" ]]; then
    # binary/source installs run initdb as $DB_USER who is already superuser
    run_as_postgres=()
    [[ -n "${PG_BIN:-}" ]] && psql=("${PG_BIN}/psql" -p "$DB_PORT")
  fi
  info "Creating role '${DB_USER}' and database '${DB_NAME}'"
  "${run_as_postgres[@]}" "${psql[@]}" -v ON_ERROR_STOP=0 -d postgres <<SQL || warn "Some PG statements may already be applied"
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE "${DB_USER}" LOGIN PASSWORD '${DB_PASSWORD}' CREATEDB;
  ELSE
    ALTER ROLE "${DB_USER}" PASSWORD '${DB_PASSWORD}' LOGIN CREATEDB;
  END IF;
END \$\$;
SELECT 'CREATE DATABASE "${DB_NAME}" OWNER "${DB_USER}"'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL
  ok "PostgreSQL role/database configured (password stored in platform .env)"
}

test_postgresql() {
  info "Testing PostgreSQL on ${DB_HOST}:${DB_PORT}"
  if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 1" >/dev/null 2>&1; then
    ok "PostgreSQL reachable and '${DB_NAME}' accepts '${DB_USER}'"
  elif have pg_isready && pg_isready -h "$DB_HOST" -p "$DB_PORT" >/dev/null 2>&1; then
    warn "Postgres port is up but auth/db test failed — check role/password"
  else
    err "PostgreSQL not reachable on ${DB_HOST}:${DB_PORT}"; return 1
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  Redis
# ═══════════════════════════════════════════════════════════════════════════
install_redis() {
  head "Redis ${REDIS_VERSION}"
  local m; m="$(choose_method "Redis ${REDIS_VERSION}" vendor)"
  case "$m" in
    skip) warn "Skipping Redis"; return ;;
    docker)
      [[ -z "$REDIS_PASSWORD" ]] && REDIS_PASSWORD="$(gen_secret 24)"
      docker_up exprsn-redis "redis:7" -p "${REDIS_PORT}:6379" \
        -v exprsn-redisdata:/data \
        redis-server --requirepass "$REDIS_PASSWORD" --appendonly yes
      REDIS_VIA="docker"; return ;;
    vendor)
      case "$OS_FAMILY" in
        debian)
          info "Adding the official Redis apt repo (packages.redis.io)"
          pkg_install curl ca-certificates gnupg lsb-release
          fetch "https://packages.redis.io/gpg" /tmp/redis.gpg.asc
          as_root gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg /tmp/redis.gpg.asc
          echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" \
            | as_root tee /etc/apt/sources.list.d/redis.list >/dev/null
          pkg_install redis ; REDIS_SVC="redis-server" ;;
        rhel)
          fetch "https://packages.redis.io/rpm/rpm.redis.io.rpm.keys" /tmp/redis.keys 2>/dev/null || true
          pkg_install redis || warn "Distro redis used"; REDIS_SVC="redis" ;;
        arch) pkg_install redis; REDIS_SVC="redis" ;;
        macos) install_redis_source; return ;;
      esac
      [[ "$OS_FAMILY" != macos ]] && start_service "${REDIS_SVC}" && REDIS_VIA="service" ;;
    pkg)
      case "$OS_FAMILY" in
        debian) pkg_install redis-server; REDIS_SVC="redis-server" ;;
        rhel|arch) pkg_install redis; REDIS_SVC="redis" ;;
        macos) install_redis_source; return ;;
      esac
      start_service "${REDIS_SVC}"; REDIS_VIA="service" ;;
    source) install_redis_source ;;
  esac
  ok "Redis install step complete"
}

install_redis_source() {
  ensure_build_tools
  fetch "https://download.redis.io/releases/redis-${REDIS_VERSION}.tar.gz" /tmp/redis.tgz
  tar xzf /tmp/redis.tgz -C /tmp
  ( cd "/tmp/redis-${REDIS_VERSION}" && make -j"$(getconf _NPROCESSORS_ONLN)" && as_root make PREFIX="${PREFIX}/redis" install )
  REDIS_VIA="source"; REDIS_BIN="${PREFIX}/redis/bin"
  ok "Redis built to ${PREFIX}/redis"
}

configure_redis() {
  head "Configure Redis"
  [[ -z "$REDIS_PASSWORD" ]] && { REDIS_PASSWORD="$(gen_secret 24)"; info "Generated Redis password"; }
  [[ "${REDIS_VIA:-}" == "docker" ]] && { ok "Redis configured via container flags"; return; }
  local conf="${ETC_ROOT}/redis.conf"
  as_root mkdir -p "${ETC_ROOT}" "${DATA_ROOT}/redis"
  info "Writing ${conf}"
  as_root tee "$conf" >/dev/null <<CONF
bind 127.0.0.1 ::1
port ${REDIS_PORT}
protected-mode yes
requirepass ${REDIS_PASSWORD}
appendonly yes
dir ${DATA_ROOT}/redis
save 900 1
save 300 10
maxmemory-policy noeviction
CONF
  if [[ "${REDIS_VIA:-}" == "source" || "$OS_FAMILY" == "macos" ]]; then
    local rbin="${REDIS_BIN:-${PREFIX}/redis/bin}"
    install_service redis "${rbin}/redis-server ${conf}"
  else
    # distro packages keep their own conf; append our overrides safely
    local sysconf; sysconf="$( [[ "$OS_FAMILY" == debian ]] && echo /etc/redis/redis.conf || echo /etc/redis.conf )"
    if [[ -f "$sysconf" ]]; then
      as_root sed -i.bak -E "s/^# *requirepass .*/requirepass ${REDIS_PASSWORD}/; s/^requirepass .*/requirepass ${REDIS_PASSWORD}/" "$sysconf" || true
      grep -q "^requirepass ${REDIS_PASSWORD}" "$sysconf" 2>/dev/null || echo "requirepass ${REDIS_PASSWORD}" | as_root tee -a "$sysconf" >/dev/null
      start_service "${REDIS_SVC:-redis}"
    fi
  fi
  ok "Redis configured with auth (password stored in platform .env)"
}

test_redis() {
  info "Testing Redis on ${REDIS_HOST}:${REDIS_PORT}"
  local cli=redis-cli
  [[ -n "${REDIS_BIN:-}" && -x "${REDIS_BIN}/redis-cli" ]] && cli="${REDIS_BIN}/redis-cli"
  if [[ "${REDIS_VIA:-}" == "docker" ]]; then
    [[ "$(as_root docker exec exprsn-redis redis-cli -a "$REDIS_PASSWORD" ping 2>/dev/null)" == "PONG" ]] \
      && { ok "Redis (container) responds to PING"; return; } || { err "Redis container PING failed"; return 1; }
  fi
  if have "$cli"; then
    if [[ "$("$cli" -h "$REDIS_HOST" -p "$REDIS_PORT" ${REDIS_PASSWORD:+-a "$REDIS_PASSWORD"} ping 2>/dev/null)" == "PONG" ]]; then
      ok "Redis responds to PING"
    else err "Redis PING failed (auth or service down)"; return 1; fi
  else
    (exec 3<>"/dev/tcp/${REDIS_HOST}/${REDIS_PORT}") 2>/dev/null && ok "Redis port open (redis-cli not installed for full test)" || { err "Redis port closed"; return 1; }
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  OpenSearch
# ═══════════════════════════════════════════════════════════════════════════
install_opensearch() {
  head "OpenSearch ${OPENSEARCH_VERSION}"
  local rec=vendor; [[ "$OS_FAMILY" == macos ]] && rec=docker
  local m; m="$(choose_method "OpenSearch ${OPENSEARCH_VERSION}" "$rec")"
  case "$m" in
    skip) warn "Skipping OpenSearch"; return ;;
    docker)
      docker_up exprsn-opensearch "opensearchproject/opensearch:2" \
        -p "${OPENSEARCH_PORT}:9200" \
        -e discovery.type=single-node \
        -e DISABLE_SECURITY_PLUGIN=true \
        -e "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m" \
        -v exprsn-osdata:/usr/share/opensearch/data
      OS_VIA="docker"; return ;;
    vendor|source)
      if [[ "$OS_FAMILY" == macos ]]; then
        warn "OpenSearch ships no macOS build; use Docker. Switching to Docker."
        docker_up exprsn-opensearch "opensearchproject/opensearch:2" -p "${OPENSEARCH_PORT}:9200" \
          -e discovery.type=single-node -e DISABLE_SECURITY_PLUGIN=true \
          -e "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m" -v exprsn-osdata:/usr/share/opensearch/data
        OS_VIA="docker"; return
      fi
      local osarch; osarch="$([[ $ARCH == aarch64 ]] && echo arm64 || echo x64)"
      local tgz="opensearch-${OPENSEARCH_VERSION}-linux-${osarch}.tar.gz"
      fetch "https://artifacts.opensearch.org/releases/bundle/opensearch/${OPENSEARCH_VERSION}/${tgz}" /tmp/os.tgz
      as_root mkdir -p "${PREFIX}"
      as_root tar xzf /tmp/os.tgz -C "${PREFIX}"
      as_root ln -sfn "${PREFIX}/opensearch-${OPENSEARCH_VERSION}" "${PREFIX}/opensearch"
      OS_HOME="${PREFIX}/opensearch"; OS_VIA="binary" ;;
    pkg)
      case "$OS_FAMILY" in
        debian)
          fetch "https://artifacts.opensearch.org/publickeys/opensearch.pgp" /tmp/os.pgp
          as_root gpg --dearmor -o /usr/share/keyrings/opensearch-keyring /tmp/os.pgp
          echo "deb [signed-by=/usr/share/keyrings/opensearch-keyring] https://artifacts.opensearch.org/releases/bundle/opensearch/2.x/apt stable main" \
            | as_root tee /etc/apt/sources.list.d/opensearch-2.x.list >/dev/null
          DISABLE_INSTALL_DEMO_CONFIG=true pkg_install opensearch ;;
        rhel) pkg_install "https://artifacts.opensearch.org/releases/bundle/opensearch/${OPENSEARCH_VERSION}/opensearch-${OPENSEARCH_VERSION}-linux-${ARCH}.rpm" ;;
        arch) warn "No native Arch package; using vendor tarball"; OS_FAMILY=arch; install_opensearch; return ;;
        macos) warn "Use Docker on macOS"; return ;;
      esac
      OS_HOME="/usr/share/opensearch"; OS_VIA="pkg" ;;
  esac
  ok "OpenSearch install step complete"
}

configure_opensearch() {
  [[ "${OS_VIA:-}" == "docker" ]] && { ok "OpenSearch configured via container env"; return; }
  [[ -z "${OS_HOME:-}" ]] && return
  head "Configure OpenSearch (single-node, security disabled for localhost dev)"
  local yml="${OS_HOME}/config/opensearch.yml"
  as_root mkdir -p "${DATA_ROOT}/opensearch"
  as_root tee "$yml" >/dev/null <<YML
cluster.name: exprsn
node.name: exprsn-node1
path.data: ${DATA_ROOT}/opensearch
network.host: 127.0.0.1
http.port: ${OPENSEARCH_PORT}
discovery.type: single-node
plugins.security.disabled: true
YML
  install_service opensearch "${OS_HOME}/bin/opensearch"
  ok "OpenSearch configured at ${OS_HOME}"
}

test_opensearch() {
  info "Testing OpenSearch on ${OPENSEARCH_HOST}:${OPENSEARCH_PORT}"
  local i
  for i in $(seq 1 30); do
    if curl -fsS "http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}" >/dev/null 2>&1; then
      ok "OpenSearch responding ($(curl -fsS "http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}" | grep -o '"number"[^,]*' | head -1))"
      return 0
    fi
    sleep 2
  done
  err "OpenSearch not reachable on ${OPENSEARCH_HOST}:${OPENSEARCH_PORT}"; return 1
}

# ═══════════════════════════════════════════════════════════════════════════
#  RabbitMQ
# ═══════════════════════════════════════════════════════════════════════════
install_rabbitmq() {
  head "RabbitMQ ${RABBITMQ_VERSION}"
  local rec=pkg; [[ "$OS_FAMILY" == macos ]] && rec=docker
  local m; m="$(choose_method "RabbitMQ ${RABBITMQ_VERSION}" "$rec")"
  case "$m" in
    skip) warn "Skipping RabbitMQ"; return ;;
    docker)
      [[ -z "$RABBITMQ_PASSWORD" ]] && RABBITMQ_PASSWORD="$(gen_secret 24)"
      docker_up exprsn-rabbitmq "rabbitmq:${RABBITMQ_VERSION%%.*}-management" \
        -p "${RABBITMQ_PORT}:5672" -p "${RABBITMQ_MGMT_PORT}:15672" \
        -e RABBITMQ_DEFAULT_USER="$RABBITMQ_USER" \
        -e RABBITMQ_DEFAULT_PASS="$RABBITMQ_PASSWORD" \
        -e RABBITMQ_DEFAULT_VHOST="$RABBITMQ_VHOST" \
        -v exprsn-rabbitmqdata:/var/lib/rabbitmq
      RABBIT_VIA="docker"; return ;;
    vendor|pkg)
      case "$OS_FAMILY" in
        debian) pkg_install rabbitmq-server; RABBIT_SVC="rabbitmq-server" ;;
        rhel)   pkg_install rabbitmq-server; RABBIT_SVC="rabbitmq-server" ;;
        arch)   pkg_install rabbitmq; RABBIT_SVC="rabbitmq" ;;
        macos)
          warn "RabbitMQ on macOS without Homebrew needs Erlang + the generic-unix build."
          warn "Recommend Docker instead; switching to Docker."
          [[ -z "$RABBITMQ_PASSWORD" ]] && RABBITMQ_PASSWORD="$(gen_secret 24)"
          docker_up exprsn-rabbitmq "rabbitmq:${RABBITMQ_VERSION%%.*}-management" \
            -p "${RABBITMQ_PORT}:5672" -p "${RABBITMQ_MGMT_PORT}:15672" \
            -e RABBITMQ_DEFAULT_USER="$RABBITMQ_USER" -e RABBITMQ_DEFAULT_PASS="$RABBITMQ_PASSWORD" \
            -e RABBITMQ_DEFAULT_VHOST="$RABBITMQ_VHOST" -v exprsn-rabbitmqdata:/var/lib/rabbitmq
          RABBIT_VIA="docker"; return ;;
      esac
      start_service "${RABBIT_SVC}"; RABBIT_VIA="service" ;;
    source)
      warn "Building RabbitMQ/Erlang from source is impractical here; using the generic-unix vendor build is recommended."
      warn "Falling back to the package manager."; OS_FAMILY="$OS_FAMILY"; install_rabbitmq; return ;;
  esac
  ok "RabbitMQ install step complete"
}

configure_rabbitmq() {
  [[ "${RABBIT_VIA:-}" == "docker" ]] && { ok "RabbitMQ user/vhost set via container env"; return; }
  [[ -z "${RABBIT_VIA:-}" ]] && return
  head "Configure RabbitMQ user '${RABBITMQ_USER}' + vhost '${RABBITMQ_VHOST}'"
  [[ -z "$RABBITMQ_PASSWORD" ]] && { RABBITMQ_PASSWORD="$(gen_secret 24)"; info "Generated RabbitMQ password"; }
  as_root rabbitmq-plugins enable rabbitmq_management >/dev/null 2>&1 || true
  as_root rabbitmqctl add_vhost "$RABBITMQ_VHOST" 2>/dev/null || true
  as_root rabbitmqctl add_user "$RABBITMQ_USER" "$RABBITMQ_PASSWORD" 2>/dev/null \
    || as_root rabbitmqctl change_password "$RABBITMQ_USER" "$RABBITMQ_PASSWORD" 2>/dev/null || true
  as_root rabbitmqctl set_user_tags "$RABBITMQ_USER" administrator 2>/dev/null || true
  as_root rabbitmqctl set_permissions -p "$RABBITMQ_VHOST" "$RABBITMQ_USER" ".*" ".*" ".*" 2>/dev/null || true
  as_root rabbitmqctl delete_user guest 2>/dev/null || true
  ok "RabbitMQ user/vhost/permissions configured"
}

test_rabbitmq() {
  info "Testing RabbitMQ on ${RABBITMQ_HOST}:${RABBITMQ_PORT}"
  if [[ "${RABBIT_VIA:-}" == "docker" ]]; then
    as_root docker exec exprsn-rabbitmq rabbitmq-diagnostics -q ping >/dev/null 2>&1 \
      && { ok "RabbitMQ (container) ping ok"; return; } || { err "RabbitMQ container ping failed"; return 1; }
  fi
  if have rabbitmq-diagnostics && as_root rabbitmq-diagnostics -q ping >/dev/null 2>&1; then
    ok "RabbitMQ responds to diagnostics ping"
  elif (exec 3<>"/dev/tcp/${RABBITMQ_HOST}/${RABBITMQ_PORT}") 2>/dev/null; then
    ok "RabbitMQ AMQP port ${RABBITMQ_PORT} open"
  else
    warn "RabbitMQ not reachable (note: the platform code does not require it by default)"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  Node.js
# ═══════════════════════════════════════════════════════════════════════════
install_nodejs() {
  head "Node.js ${NODE_VERSION}"
  if have node; then info "Existing Node: $(node -v)"; confirm "Reinstall/replace Node.js?" || { NODE_VIA="existing"; return; }; fi
  local m; m="$(choose_method "Node.js ${NODE_VERSION}" vendor)"
  case "$m" in
    skip) warn "Skipping Node.js"; return ;;
    docker) warn "The platform runs as a host process; install Node on the host. Skipping Docker for Node."; install_nodejs_vendor; return ;;
    vendor) install_nodejs_vendor ;;
    pkg)
      case "$OS_FAMILY" in
        debian) fetch "https://deb.nodesource.com/setup_${NODE_VERSION%%.*}.x" /tmp/nodesource.sh; as_root bash /tmp/nodesource.sh; pkg_install nodejs ;;
        rhel)   fetch "https://rpm.nodesource.com/setup_${NODE_VERSION%%.*}.x" /tmp/nodesource.sh; as_root bash /tmp/nodesource.sh; pkg_install nodejs ;;
        arch)   pkg_install nodejs npm ;;
        macos)  install_nodejs_vendor ;;
      esac ;;
    source)
      ensure_build_tools
      fetch "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}.tar.gz" /tmp/node-src.tgz
      tar xzf /tmp/node-src.tgz -C /tmp
      ( cd "/tmp/node-v${NODE_VERSION}" && ./configure --prefix="${PREFIX}/node" && make -j"$(getconf _NPROCESSORS_ONLN)" && as_root make install )
      as_root ln -sf "${PREFIX}/node/bin/node" /usr/local/bin/node
      as_root ln -sf "${PREFIX}/node/bin/npm" /usr/local/bin/npm ;;
  esac
  NODE_VIA="${NODE_VIA:-installed}"
  have node && ok "Node.js ready: $(node -v)"
}

install_nodejs_vendor() {
  local plat; plat="$([[ "$OS_FAMILY" == macos ]] && echo darwin || echo linux)"
  local tgz="node-v${NODE_VERSION}-${plat}-${NODE_ARCH}.tar.gz"
  fetch "https://nodejs.org/dist/v${NODE_VERSION}/${tgz}" /tmp/node.tgz
  as_root mkdir -p "${PREFIX}/node"
  as_root tar xzf /tmp/node.tgz -C "${PREFIX}/node" --strip-components=1
  as_root ln -sf "${PREFIX}/node/bin/node" /usr/local/bin/node
  as_root ln -sf "${PREFIX}/node/bin/npm" /usr/local/bin/npm
  as_root ln -sf "${PREFIX}/node/bin/npx" /usr/local/bin/npx 2>/dev/null || true
}

test_nodejs() {
  if have node; then ok "Node.js $(node -v), npm $(npm -v 2>/dev/null)"; else err "node not on PATH"; return 1; fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  Nginx (TLS reverse proxy in front of the platform's 8443 edge)
# ═══════════════════════════════════════════════════════════════════════════
install_nginx() {
  head "Nginx ${NGINX_VERSION}"
  local rec=vendor; [[ "$OS_FAMILY" == macos ]] && rec=source
  local m; m="$(choose_method "Nginx ${NGINX_VERSION}" "$rec")"
  case "$m" in
    skip) warn "Skipping Nginx"; return ;;
    docker) NGINX_VIA="docker"; warn "Nginx reverse-proxy in Docker needs host networking to reach 8443; service install recommended. Skipping."; return ;;
    vendor|pkg)
      case "$OS_FAMILY" in
        debian)
          if [[ "$m" == vendor ]]; then
            pkg_install curl gnupg2 ca-certificates lsb-release
            fetch "https://nginx.org/keys/nginx_signing.key" /tmp/nginx.key
            as_root gpg --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg /tmp/nginx.key
            echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/$(. /etc/os-release; echo "$ID") $(lsb_release -cs) nginx" \
              | as_root tee /etc/apt/sources.list.d/nginx.list >/dev/null
          fi
          pkg_install nginx ;;
        rhel) pkg_install nginx ;;
        arch) pkg_install nginx ;;
        macos) install_nginx_source; return ;;
      esac
      NGINX_SVC="nginx"; NGINX_VIA="service" ;;
    source) install_nginx_source ;;
  esac
  ok "Nginx install step complete"
}

install_nginx_source() {
  ensure_build_tools
  pkg_install libpcre3-dev zlib1g-dev libssl-dev 2>/dev/null || pkg_install pcre-devel zlib-devel openssl-devel 2>/dev/null || true
  fetch "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" /tmp/nginx.tgz
  tar xzf /tmp/nginx.tgz -C /tmp
  ( cd "/tmp/nginx-${NGINX_VERSION}" && ./configure --prefix="${PREFIX}/nginx" --with-http_ssl_module --with-http_v2_module && make -j"$(getconf _NPROCESSORS_ONLN)" && as_root make install )
  NGINX_VIA="source"; NGINX_BIN="${PREFIX}/nginx/sbin/nginx"
  install_service nginx "${NGINX_BIN} -g 'daemon off;'"
  ok "Nginx built to ${PREFIX}/nginx"
}

configure_nginx() {
  [[ -z "${NGINX_VIA:-}" || "${NGINX_VIA}" == "docker" ]] && return
  head "Configure Nginx reverse proxy :${NGINX_TLS_PORT} → https://127.0.0.1:${HTTPS_PORT}"
  local confdir crt="${PLATFORM_ROOT}/certs/platform.crt" key="${PLATFORM_ROOT}/certs/platform.key"
  case "$OS_FAMILY" in
    debian) confdir="/etc/nginx/conf.d" ;;
    rhel)   confdir="/etc/nginx/conf.d" ;;
    arch)   confdir="/etc/nginx/conf.d"; as_root mkdir -p "$confdir"; grep -q 'conf.d/\*.conf' /etc/nginx/nginx.conf 2>/dev/null || warn "Add 'include conf.d/*.conf;' to /etc/nginx/nginx.conf http{}" ;;
    macos)  confdir="${PREFIX}/nginx/conf/conf.d"; as_root mkdir -p "$confdir"; grep -q 'conf.d/\*.conf' "${PREFIX}/nginx/conf/nginx.conf" 2>/dev/null || warn "Add 'include conf.d/*.conf;' to ${PREFIX}/nginx/conf/nginx.conf http{}" ;;
  esac
  as_root mkdir -p "$confdir"
  as_root tee "${confdir}/exprsn.conf" >/dev/null <<NGINX
# Exprsn Platform — TLS reverse proxy to the single HTTPS edge (8443)
server {
    listen ${NGINX_TLS_PORT} ssl;
    listen [::]:${NGINX_TLS_PORT} ssl;
    server_name _;

    ssl_certificate     ${crt};
    ssl_certificate_key ${key};
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 100m;

    location / {
        proxy_pass https://127.0.0.1:${HTTPS_PORT};
        proxy_ssl_verify off;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # WebSocket / Socket.IO upgrade
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
NGINX
  if have nginx; then as_root nginx -t && start_service "${NGINX_SVC:-nginx}" || warn "nginx -t failed; review config"; else start_service nginx; fi
  ok "Nginx reverse proxy configured"
}

test_nginx() {
  info "Testing Nginx on :${NGINX_TLS_PORT}"
  if curl -kfsS "https://127.0.0.1:${NGINX_TLS_PORT}/health" >/dev/null 2>&1 || curl -kIs "https://127.0.0.1:${NGINX_TLS_PORT}" >/dev/null 2>&1; then
    ok "Nginx answering TLS on :${NGINX_TLS_PORT}"
  else
    warn "Nginx not answering on :${NGINX_TLS_PORT} yet (platform may not be started)"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  Dovecot (IMAP/POP, TLS via the platform certs) — best effort
# ═══════════════════════════════════════════════════════════════════════════
install_dovecot() {
  head "Dovecot ${DOVECOT_VERSION}"
  local rec=pkg; [[ "$OS_FAMILY" == macos ]] && rec=source
  local m; m="$(choose_method "Dovecot ${DOVECOT_VERSION}" "$rec")"
  case "$m" in
    skip) warn "Skipping Dovecot"; return ;;
    docker)
      docker_up exprsn-dovecot "dovecot/dovecot:latest" \
        -p "${DOVECOT_IMAP_PORT}:143" -p "${DOVECOT_IMAPS_PORT}:993" \
        -v exprsn-maildata:/srv/mail
      DOVECOT_VIA="docker"; return ;;
    vendor|pkg)
      case "$OS_FAMILY" in
        debian) pkg_install dovecot-imapd dovecot-pop3d ;;
        rhel)   pkg_install dovecot ;;
        arch)   pkg_install dovecot ;;
        macos)  install_dovecot_source; return ;;
      esac
      DOVECOT_VIA="service"; DOVECOT_SVC="dovecot" ;;
    source) install_dovecot_source ;;
  esac
  ok "Dovecot install step complete"
}

install_dovecot_source() {
  ensure_build_tools
  pkg_install libssl-dev zlib1g-dev 2>/dev/null || pkg_install openssl-devel zlib-devel 2>/dev/null || true
  fetch "https://dovecot.org/releases/2.3/dovecot-${DOVECOT_VERSION}.tar.gz" /tmp/dovecot.tgz
  tar xzf /tmp/dovecot.tgz -C /tmp
  ( cd "/tmp/dovecot-${DOVECOT_VERSION}" && ./configure --prefix="${PREFIX}/dovecot" && make -j"$(getconf _NPROCESSORS_ONLN)" && as_root make install )
  DOVECOT_VIA="source"; DOVECOT_BIN="${PREFIX}/dovecot/sbin/dovecot"
  ok "Dovecot built to ${PREFIX}/dovecot"
}

configure_dovecot() {
  [[ -z "${DOVECOT_VIA:-}" || "${DOVECOT_VIA}" == "docker" ]] && return
  head "Configure Dovecot (minimal IMAP + TLS, Maildir)"
  local etc="/etc/dovecot"; [[ "${DOVECOT_VIA}" == source || "$OS_FAMILY" == macos ]] && etc="${PREFIX}/dovecot/etc/dovecot"
  as_root mkdir -p "$etc" "${DATA_ROOT}/mail"
  # Single virtual mail user (the admin) with a passwd-file backend.
  local mailpass; mailpass="$(gen_secret 16)"
  printf '%s:{PLAIN}%s:5000:5000::%s/mail/%s\n' "$ADMIN_EMAIL" "$mailpass" "$DATA_ROOT" "$ADMIN_EMAIL" \
    | as_root tee "${etc}/users" >/dev/null
  as_root tee "${etc}/dovecot.conf" >/dev/null <<DCONF
protocols = imap pop3
listen = 127.0.0.1, ::1
mail_location = maildir:${DATA_ROOT}/mail/%u/Maildir
ssl = yes
ssl_cert = <${PLATFORM_ROOT}/certs/platform.crt
ssl_key  = <${PLATFORM_ROOT}/certs/platform.key
disable_plaintext_auth = no
auth_mechanisms = plain login
passdb {
  driver = passwd-file
  args = scheme=PLAIN username_format=%u ${etc}/users
}
userdb {
  driver = static
  args = uid=5000 gid=5000 home=${DATA_ROOT}/mail/%u
}
service imap-login {
  inet_listener imap  { port = ${DOVECOT_IMAP_PORT} }
  inet_listener imaps { port = ${DOVECOT_IMAPS_PORT} }
}
DCONF
  if [[ "${DOVECOT_VIA}" == source || "$OS_FAMILY" == macos ]]; then
    install_service dovecot "${DOVECOT_BIN:-${PREFIX}/dovecot/sbin/dovecot} -F -c ${etc}/dovecot.conf"
  else
    start_service "${DOVECOT_SVC:-dovecot}"
  fi
  info "Dovecot mail user ${ADMIN_EMAIL} password: ${mailpass}"
  ok "Dovecot configured (best-effort; tune for production mail delivery)"
}

test_dovecot() {
  info "Testing Dovecot IMAP on :${DOVECOT_IMAP_PORT}"
  if [[ "${DOVECOT_VIA:-}" == "docker" ]]; then
    (exec 3<>"/dev/tcp/127.0.0.1/${DOVECOT_IMAP_PORT}") 2>/dev/null && ok "Dovecot (container) IMAP port open" || { warn "Dovecot port closed"; return 1; }
    return
  fi
  if (exec 3<>"/dev/tcp/127.0.0.1/${DOVECOT_IMAP_PORT}") 2>/dev/null; then ok "Dovecot IMAP port ${DOVECOT_IMAP_PORT} open"; else warn "Dovecot IMAP port closed"; fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  OpenSSL
# ═══════════════════════════════════════════════════════════════════════════
install_openssl() {
  head "OpenSSL ${OPENSSL_VERSION}"
  if have openssl; then info "System: $(openssl version)"; fi
  local rec=pkg; [[ "$OS_FAMILY" == macos ]] && rec=source
  local m; m="$(choose_method "OpenSSL ${OPENSSL_VERSION}" "$rec")"
  if [[ "$m" == "docker" ]]; then
    warn "OpenSSL is a library/CLI, not a service — Docker not applicable. Building from source."
    m=source
  fi
  case "$m" in
    skip) warn "Skipping OpenSSL"; return ;;
    vendor|pkg)
      case "$OS_FAMILY" in
        debian) pkg_install openssl libssl-dev ;;
        rhel)   pkg_install openssl openssl-devel ;;
        arch)   pkg_install openssl ;;
        macos)  install_openssl_source; return ;;
      esac ;;
    source) install_openssl_source ;;
  esac
  ok "OpenSSL ready: $(openssl version 2>/dev/null || echo "${PREFIX}/openssl")"
}

install_openssl_source() {
  ensure_build_tools
  fetch "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" /tmp/openssl.tgz \
    || fetch "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz" /tmp/openssl.tgz
  tar xzf /tmp/openssl.tgz -C /tmp
  ( cd "/tmp/openssl-${OPENSSL_VERSION}" && ./config --prefix="${PREFIX}/openssl" --openssldir="${PREFIX}/openssl/ssl" && make -j"$(getconf _NPROCESSORS_ONLN)" && as_root make install_sw )
  as_root ln -sf "${PREFIX}/openssl/bin/openssl" /usr/local/bin/openssl 2>/dev/null || true
  ok "OpenSSL ${OPENSSL_VERSION} built to ${PREFIX}/openssl"
}

test_openssl() {
  if have openssl; then ok "OpenSSL: $(openssl version)"; else err "openssl not on PATH"; return 1; fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  Exprsn platform bootstrap
# ═══════════════════════════════════════════════════════════════════════════
write_env() {
  head "Generate platform .env"
  local env="${PLATFORM_ROOT}/.env"
  if [[ -f "$env" ]] && ! confirm "${env} exists — overwrite?"; then info "Keeping existing .env"; return; fi
  [[ -z "$DB_PASSWORD" ]] && DB_PASSWORD="$(gen_secret 24)"
  [[ -z "$REDIS_PASSWORD" ]] && REDIS_PASSWORD=""   # may legitimately be empty
  local jwt sess svc; jwt="$(gen_secret 48)"; sess="$(gen_secret 48)"; svc="$(gen_secret 32)"
  info "Writing ${env}"
  cat >"$env" <<ENV
# Generated by exprsn-setup.sh
NODE_ENV=production
HOST=0.0.0.0
HTTPS_PORT=${HTTPS_PORT}
HTTP_REDIRECT_PORT=8080
PUBLIC_HOST=localhost:${HTTPS_PORT}
CORS_ORIGIN=*
TRUST_PROXY=true

TLS_ENABLED=true
TLS_CERT_PATH=./certs/platform.crt
TLS_KEY_PATH=./certs/platform.key

DB_HOST=${DB_HOST}
DB_PORT=${DB_PORT}
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_LOGGING=false

REDIS_HOST=${REDIS_HOST}
REDIS_PORT=${REDIS_PORT}
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_DB=0
REDIS_ENABLED=true

SERVICE_TOKEN=${svc}
JWT_SECRET=${jwt}
SESSION_SECRET=${sess}
OIDC_ISSUER=https://localhost:${HTTPS_PORT}/auth

ELASTICSEARCH_NODE=http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}

CA_SERVICE_URL=https://localhost:${HTTPS_PORT}/ca
AUTH_SERVICE_URL=https://localhost:${HTTPS_PORT}/auth
SPARK_SERVICE_URL=https://localhost:${HTTPS_PORT}/spark
NEXUS_SERVICE_URL=https://localhost:${HTTPS_PORT}/nexus
FILEVAULT_SERVICE_URL=https://localhost:${HTTPS_PORT}/filevault
VAULT_SERVICE_URL=https://localhost:${HTTPS_PORT}/vault
TIMELINE_SERVICE_URL=https://localhost:${HTTPS_PORT}/timeline
PREFETCH_SERVICE_URL=https://localhost:${HTTPS_PORT}/prefetch
MODERATOR_SERVICE_URL=https://localhost:${HTTPS_PORT}/moderator
LIVE_SERVICE_URL=https://localhost:${HTTPS_PORT}/live

# Storage for CA-issued certificates/keys (disk backend)
STORAGE_TYPE=disk
STORAGE_DISK_PATH=./data/ca
STORAGE_DISK_CERTS_PATH=./data/ca/certs
STORAGE_DISK_KEYS_PATH=./data/ca/keys
STORAGE_DISK_CRL_PATH=./data/ca/crl
STORAGE_DISK_OCSP_PATH=./data/ca/ocsp

# RabbitMQ (optional broker; not required by default code paths)
RABBITMQ_URL=amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}${RABBITMQ_VHOST}

SETUP_COMPLETE=true
ENV
  chmod 600 "$env"
  ok ".env written (DB password and secrets generated)"
}

npm_install() {
  head "npm install (resolves @exprsn/shared via file:./shared)"
  ( cd "$PLATFORM_ROOT" && npm install --no-audit --no-fund )
  ok "Node dependencies installed"
}

gen_certs() {
  head "Generate the platform TLS edge certificate"
  if [[ -f "${PLATFORM_ROOT}/certs/platform.crt" ]] && ! confirm "Platform cert exists — regenerate?"; then
    info "Keeping existing platform cert"; return; fi
  ( cd "$PLATFORM_ROOT" && npm run gen:certs )
  ok "certs/platform.crt + platform.key generated"
}

db_bootstrap() {
  head "Database bootstrap (create db + per-module schemas) and migrations"
  ( cd "$PLATFORM_ROOT" && npm run db:bootstrap )
  if confirm "Run per-module migrations now (npm run db:migrate)?"; then
    ( cd "$PLATFORM_ROOT" && npm run db:migrate ) || warn "db:migrate reported issues — see STATUS.md follow-up #1 (schema/searchPath)"
  fi
  ok "Database bootstrap complete"
}

opensearch_indices() {
  local script="${PLATFORM_ROOT}/services/timeline/scripts/setup-elasticsearch.js"
  [[ -f "$script" ]] || return 0
  if confirm "Initialize OpenSearch indices (timeline setup script)?"; then
    ( cd "$PLATFORM_ROOT/services/timeline" && ELASTICSEARCH_NODE="http://${OPENSEARCH_HOST}:${OPENSEARCH_PORT}" node scripts/setup-elasticsearch.js ) \
      && ok "OpenSearch indices initialized" || warn "Index setup reported issues (OpenSearch reachable?)"
  fi
}

# Create admin user + organization + root/intermediate CA via a generated Node helper.
bootstrap_identity() {
  head "Create administrative user, organization, and issue root certificates"
  ADMIN_EMAIL="$(ask 'Admin email' "$ADMIN_EMAIL")"
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(ask_secret 'Admin password (blank = generate strong one)')"
    [[ -z "$ADMIN_PASSWORD" ]] && { ADMIN_PASSWORD="$(gen_secret 18)"; info "Generated admin password: ${ADMIN_PASSWORD}"; }
  fi
  ORG_NAME="$(ask 'Organization name' "$ORG_NAME")"
  ORG_SLUG="$(ask 'Organization slug' "$ORG_SLUG")"
  CA_NAME="$(ask 'Root CA common name' "$CA_NAME")"

  local helper="${PLATFORM_ROOT}/.exprsn-bootstrap.js"
  info "Writing bootstrap helper ${helper}"
  cat >"$helper" <<'JS'
'use strict';
// Generated by exprsn-setup.sh — creates admin user, root/intermediate CA, and an organization.
// Uses the CA SetupService singleton + auth models so records land where the running platform reads them.
const path = require('path');
const root = __dirname;
process.chdir(root);
require('dotenv').config({ path: path.join(root, '.env') });

const E = process.env;
const adminEmail = E.BOOTSTRAP_ADMIN_EMAIL;
const adminPass  = E.BOOTSTRAP_ADMIN_PASSWORD;
const caConfig = {
  name: E.BOOTSTRAP_CA_NAME, organization: E.BOOTSTRAP_CA_ORG,
  country: E.BOOTSTRAP_CA_COUNTRY, state: E.BOOTSTRAP_CA_STATE,
  locality: E.BOOTSTRAP_CA_LOCALITY, organizationalUnit: E.BOOTSTRAP_CA_OU,
  email: E.BOOTSTRAP_CA_EMAIL, rootKeySize: 4096, rootValidityDays: 7300,
  intermediateKeySize: 4096, intermediateValidityDays: 3650,
};

(async () => {
  // ---- Phase 1: CA admin user + root/intermediate certificates -----------
  try {
    const setup = require('./services/ca/services/setup.js');
    const cadb  = require('./services/ca/models');
    if (cadb.sequelize && cadb.sequelize.sync) { try { await cadb.sequelize.sync(); } catch (e) { console.error('  ca sync:', e.message); } }
    const { User } = cadb;
    let admin = await User.findOne({ where: { username: 'admin' } }).catch(() => null);
    if (admin) {
      console.log('  • CA admin user already exists (id=' + admin.id + ') — skipping create');
    } else {
      admin = await setup.createAdminUser({ email: adminEmail, password: adminPass,
        firstName: E.BOOTSTRAP_ADMIN_FIRST, lastName: E.BOOTSTRAP_ADMIN_LAST });
      console.log('  ✓ CA admin user created (id=' + admin.id + ')');
    }
    const { Certificate } = cadb;
    let root = await Certificate.findOne({ where: { type: 'root' } }).catch(() => null);
    if (root) {
      console.log('  • Root CA already present (serial=' + root.serialNumber + ') — skipping');
    } else {
      root = await setup.generateRootCertificate(caConfig, admin.id);
      console.log('  ✓ Root CA issued (serial=' + root.serialNumber + ')');
      try {
        const inter = await setup.generateIntermediateCertificate(caConfig, root, admin.id);
        console.log('  ✓ Intermediate CA issued (serial=' + inter.serialNumber + ')');
      } catch (e) { console.error('  ! intermediate CA:', e.message); }
    }
    try {
      const groups = await setup.createDefaultGroups();
      const roles  = await setup.createDefaultRoles();
      await setup.assignAdminPermissions(admin, groups, roles);
      console.log('  ✓ Default groups/roles created and admin granted super-admin');
    } catch (e) { console.error('  ! groups/roles (may already exist):', e.message); }
  } catch (e) {
    console.error('  ✗ CA bootstrap phase failed:', e.message);
  }

  // ---- Phase 2: auth-side owner user + organization ----------------------
  try {
    const am = require('./services/auth/src/models');
    if (am.sequelize && am.sequelize.sync) { try { await am.sequelize.sync(); } catch (e) { console.error('  auth sync:', e.message); } }
    const { User } = am;
    const orgSvc = require('./services/auth/src/services/organizationService');
    let owner = await User.findOne({ where: { email: adminEmail } }).catch(() => null);
    if (!owner) {
      owner = await User.create({
        username: (adminEmail.split('@')[0] || 'admin'),
        email: adminEmail, passwordHash: adminPass, // beforeCreate hook hashes it
        firstName: E.BOOTSTRAP_ADMIN_FIRST, lastName: E.BOOTSTRAP_ADMIN_LAST,
        status: 'active', emailVerified: true,
      });
      console.log('  ✓ Auth owner user created (id=' + owner.id + ')');
    } else {
      console.log('  • Auth owner user already exists (id=' + owner.id + ')');
    }
    const existing = await am.Organization.findOne({ where: { slug: E.BOOTSTRAP_ORG_SLUG } }).catch(() => null);
    if (existing) {
      console.log('  • Organization "' + E.BOOTSTRAP_ORG_SLUG + '" already exists — skipping');
    } else {
      const org = await orgSvc.createOrganization(
        { name: E.BOOTSTRAP_ORG_NAME, slug: E.BOOTSTRAP_ORG_SLUG, type: E.BOOTSTRAP_ORG_TYPE }, owner.id);
      console.log('  ✓ Organization created (id=' + org.id + ', slug=' + org.slug + ')');
    }
  } catch (e) {
    console.error('  ✗ Organization bootstrap phase failed:', e.message);
  }

  process.exit(0);
})();
JS

  info "Running identity bootstrap"
  ( cd "$PLATFORM_ROOT" && \
    BOOTSTRAP_ADMIN_EMAIL="$ADMIN_EMAIL" BOOTSTRAP_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    BOOTSTRAP_ADMIN_FIRST="$ADMIN_FIRST" BOOTSTRAP_ADMIN_LAST="$ADMIN_LAST" \
    BOOTSTRAP_ORG_NAME="$ORG_NAME" BOOTSTRAP_ORG_SLUG="$ORG_SLUG" BOOTSTRAP_ORG_TYPE="$ORG_TYPE" \
    BOOTSTRAP_CA_NAME="$CA_NAME" BOOTSTRAP_CA_ORG="$CA_ORG" BOOTSTRAP_CA_COUNTRY="$CA_COUNTRY" \
    BOOTSTRAP_CA_STATE="$CA_STATE" BOOTSTRAP_CA_LOCALITY="$CA_LOCALITY" BOOTSTRAP_CA_OU="$CA_OU" \
    BOOTSTRAP_CA_EMAIL="$CA_EMAIL" \
    node .exprsn-bootstrap.js ) || warn "Identity bootstrap reported issues (review output above)"
  rm -f "$helper"
  ok "Identity bootstrap finished"
  printf '%s\n' "${C_BOLD}Admin login:${C_RESET} ${ADMIN_EMAIL}  ${C_DIM}(password as entered/generated above)${C_RESET}"
}

install_platform_service() {
  head "Install the Exprsn platform as a managed service"
  local node_bin; node_bin="$(command -v node || echo /usr/local/bin/node)"
  SVC_WORKDIR="$PLATFORM_ROOT" SVC_ENV="NODE_ENV=production" \
    install_service exprsn-platform "${node_bin} ${PLATFORM_ROOT}/src/index.js"
  if confirm "Also install the timeline & prefetch Bull workers as services?"; then
    SVC_WORKDIR="$PLATFORM_ROOT" install_service exprsn-timeline-worker "${node_bin} ${PLATFORM_ROOT}/services/timeline/src/worker.js"
    SVC_WORKDIR="$PLATFORM_ROOT" install_service exprsn-prefetch-worker "${node_bin} ${PLATFORM_ROOT}/services/prefetch/src/worker.js"
  fi
  ok "Platform service unit installed"
}

start_platform() {
  head "Start Exprsn"
  start_service exprsn-platform
  start_service exprsn-timeline-worker 2>/dev/null || true
  start_service exprsn-prefetch-worker 2>/dev/null || true
  info "Waiting for the HTTPS edge on :${HTTPS_PORT}"
  local i
  for i in $(seq 1 30); do
    if curl -kfsS "https://127.0.0.1:${HTTPS_PORT}/health" >/dev/null 2>&1; then
      ok "Exprsn is up — GET https://localhost:${HTTPS_PORT}/health responded"
      curl -ksS "https://127.0.0.1:${HTTPS_PORT}/health" 2>/dev/null | head -c 400; echo
      return 0
    fi
    sleep 2
  done
  warn "Health check did not pass within 60s. Check logs:"
  [[ "$INIT" == systemd ]] && warn "  journalctl -u exprsn-platform -e"
  [[ "$INIT" == launchd ]] && warn "  tail -f ${DATA_ROOT}/logs/exprsn-platform.err.log"
}

# ───────────────────────────────────────────────────────────────────────────
#  High-level orchestration
# ───────────────────────────────────────────────────────────────────────────
SOFTWARE=(postgresql redis opensearch rabbitmq nodejs nginx dovecot openssl)

install_one() {
  case "$1" in
    postgresql) install_postgresql ;;
    redis)      install_redis ;;
    opensearch) install_opensearch ;;
    rabbitmq)   install_rabbitmq ;;
    nodejs)     install_nodejs ;;
    nginx)      install_nginx ;;
    dovecot)    install_dovecot ;;
    openssl)    install_openssl ;;
    *) err "Unknown software: $1"; return 1 ;;
  esac
}

configure_all() {
  configure_postgresql; configure_redis; configure_opensearch
  configure_rabbitmq;   configure_nginx;  configure_dovecot
}

test_all() {
  head "Connectivity tests"
  local rc=0
  test_postgresql || rc=1
  test_redis      || rc=1
  test_opensearch || true
  test_rabbitmq   || true
  test_nodejs     || rc=1
  test_openssl    || rc=1
  test_nginx      || true
  test_dovecot    || true
  [[ $rc -eq 0 ]] && ok "Core services reachable" || warn "Some core tests failed (see above)"
  return 0
}

run_bootstrap() {
  test_nodejs || die "Node.js is required before bootstrapping the platform."
  write_env
  npm_install
  gen_certs
  db_bootstrap
  opensearch_indices
  bootstrap_identity
  install_platform_service
  if confirm "Start Exprsn now?"; then start_platform; fi
}

show_plan() {
  head "Detected environment"
  printf '  OS family : %s (%s %s)\n' "$OS_FAMILY" "$OS_ID" "$OS_VER"
  printf '  Arch      : %s\n' "$ARCH"
  printf '  Pkg mgr   : %s\n' "$PKG"
  printf '  Init      : %s\n' "$INIT"
  printf '  Prefix    : %s\n' "$PREFIX"
  printf '  Data root : %s\n' "$DATA_ROOT"
  printf '  Platform  : %s\n' "$PLATFORM_ROOT"
  head "Software to be offered"
  printf '  PostgreSQL %-8s Redis %-8s OpenSearch %s\n' "$PG_FULL" "$REDIS_VERSION" "$OPENSEARCH_VERSION"
  printf '  RabbitMQ %-10s Node.js %-7s Nginx %s\n' "$RABBITMQ_VERSION" "$NODE_VERSION" "$NGINX_VERSION"
  printf '  Dovecot %-11s OpenSSL %s\n' "$DOVECOT_VERSION" "$OPENSSL_VERSION"
}

guided_all() {
  show_plan
  confirm "Proceed with a guided full install?" || { info "Aborted."; return; }
  local sw
  for sw in "${SOFTWARE[@]}"; do install_one "$sw"; done
  configure_all
  if confirm "Run connectivity tests now?"; then test_all; fi
  if confirm "Bootstrap the Exprsn platform (.env, npm, certs, db, admin/org/CA)?"; then run_bootstrap; fi
  hr; ok "All done."
}

menu() {
  while true; do
    head "Exprsn Platform Setup"
    cat <<MENU
  1) Show detected environment & plan
  2) Install backing software (choose method per component)
  3) Configure software + create service users
  4) Create service units / plists  (done inline during install)
  5) Start all services
  6) Test all services (connectivity)
  7) Bootstrap Exprsn (.env, npm, certs, db, indices)
  8) Create admin user, organization, root certificates
  9) Install platform service + start Exprsn (health check)
  A) Guided full install (everything, with prompts)
  Q) Quit
MENU
    local c; c="$(ask 'Select' '')"
    c="$(printf '%s' "$c" | tr '[:lower:]' '[:upper:]')"
    case "$c" in
      1) show_plan ;;
      2) local sw; for sw in "${SOFTWARE[@]}"; do install_one "$sw"; done ;;
      3) configure_all ;;
      4) info "Service units are written during install/configure and by option 9." ;;
      5) for sw in postgresql redis opensearch rabbitmq nginx dovecot; do :; done
         start_service postgresql 2>/dev/null || true
         info "Use option 9 to start the platform; backing services start during install." ;;
      6) test_all ;;
      7) test_nodejs && { write_env; npm_install; gen_certs; db_bootstrap; opensearch_indices; } ;;
      8) bootstrap_identity ;;
      9) install_platform_service; start_platform ;;
      A) guided_all ;;
      Q) info "Bye."; return 0 ;;
      *) warn "Unknown selection: $c" ;;
    esac
  done
}

usage() {
  sed -n '2,60p' "$0" | sed 's/^# \{0,1\}//'
}

main() {
  # global flags
  local args=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -y|--yes) ASSUME_YES=true ;;
      -h|--help) detect_os 2>/dev/null || true; usage; exit 0 ;;
      *) args+=("$1") ;;
    esac
    shift
  done
  set -- "${args[@]:-}"

  detect_os
  as_root mkdir -p "$PREFIX" "$DATA_ROOT" "$ETC_ROOT" 2>/dev/null || true

  case "${1:-menu}" in
    menu|"")    menu ;;
    all)        guided_all ;;
    plan)       show_plan ;;
    install)    shift || true; [[ $# -ge 1 ]] || die "install needs a component name"; install_one "$1"; configure_"$1" 2>/dev/null || true ;;
    configure)  configure_all ;;
    test)       test_all ;;
    bootstrap)  run_bootstrap ;;
    identity)   bootstrap_identity ;;
    start)      install_platform_service; start_platform ;;
    *)          err "Unknown command: $1"; usage; exit 1 ;;
  esac
}

main "$@"
