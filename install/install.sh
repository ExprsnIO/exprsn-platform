#!/bin/sh
# ============================================================================
# Exprsn Platform — universal bootstrap installer
# ----------------------------------------------------------------------------
# Self-hostable, curl-pipeable entrypoint. POSIX sh (runs before bash 4 is
# guaranteed, e.g. macOS's bash 3.2). It:
#
#   1. detects OS / distro / arch
#   2. (optional) provisions a cloud VM (DigitalOcean / AWS / Azure) and
#      re-runs itself there unattended via cloud-init
#   3. acquires the platform source  (git clone | tarball | xz | zip),
#      from git.exprsn.io (primary) with github.com/exprsnio mirror fallback
#   4. dispatches to a target:  native  (bare metal)  |  docker  (containers)
#
# Quick start (self-hosted):
#   curl -fsSL https://git.exprsn.io/install.sh | sh
#   curl -fsSL https://git.exprsn.io/install.sh | sh -s -- --mode docker
#   curl -fsSL https://git.exprsn.io/install.sh | sh -s -- \
#        --provision do --region nyc3 --size s-2vcpu-4gb
#
# Flags:
#   --mode native|docker        install target (default: native)
#   --source git|tarball|xz|zip how to fetch source (default: git)
#   --channel stable|main       branch/release channel (default: stable)
#   --provision do|aws|azure    create a cloud VM first, then install on it
#   --region <r> --size <s>     cloud VM placement/size
#   --dir <path>                install dir (default: /opt/exprsn or ~/exprsn)
#   --ref <branch|tag|sha>      override the git ref / archive ref
#   --unattended                no TUI; use flags + defaults (for cloud-init)
#   --no-verify                 skip archive checksum verification
#   --help
# ============================================================================
set -eu

# ---- defaults --------------------------------------------------------------
MODE="native"
SOURCE="git"
CHANNEL="stable"
PROVISION=""
REGION=""
SIZE=""
INSTALL_DIR=""
REF=""
UNATTENDED="0"
VERIFY="1"

PRIMARY_GIT="https://git.exprsn.io/exprsn/exprsn.git"
MIRROR_GIT="https://github.com/exprsnio/exprsn.git"
# Gitea/GitLab-style archive endpoints (adjust if the forge differs).
ARCHIVE_BASE="https://git.exprsn.io/exprsn/exprsn/archive"     # /<ref>.tar.gz|.tar.xz|.zip
BOOTSTRAP_URL="https://git.exprsn.io/install.sh"

c_red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
c_grn() { printf '\033[32m%s\033[0m\n' "$*"; }
c_ylw() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
log()   { printf '[exprsn] %s\n' "$*" >&2; }
die()   { c_red "FATAL: $*"; exit 1; }
have()  { command -v "$1" >/dev/null 2>&1; }

usage() { sed -n '2,40p' "$0" 2>/dev/null || true; exit 0; }

# ---- parse flags -----------------------------------------------------------
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --source) SOURCE="$2"; shift 2 ;;
    --channel) CHANNEL="$2"; shift 2 ;;
    --provision) PROVISION="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    --size) SIZE="$2"; shift 2 ;;
    --dir) INSTALL_DIR="$2"; shift 2 ;;
    --ref) REF="$2"; shift 2 ;;
    --unattended) UNATTENDED="1"; shift ;;
    --no-verify) VERIFY="0"; shift ;;
    --help|-h) usage ;;
    *) die "unknown flag: $1" ;;
  esac
done
[ -n "$REF" ] || REF="$CHANNEL"

# ---- platform detection ----------------------------------------------------
detect_platform() {
  UNAME="$(uname -s)"
  ARCH="$(uname -m)"
  case "$UNAME" in
    Darwin) OS="macos"; DISTRO="macos"; PM="brew"; SVC="launchd" ;;
    Linux)
      OS="linux"; SVC="systemd"
      if [ -r /etc/os-release ]; then . /etc/os-release; DISTRO="${ID:-unknown}"; else DISTRO="unknown"; fi
      case "$DISTRO" in
        ubuntu|debian|linuxmint|pop) PM="apt" ;;
        fedora|rhel|centos|rocky|almalinux) PM="dnf" ;;
        arch|manjaro|endeavouros) PM="pacman" ;;
        *) PM="unknown" ;;
      esac ;;
    *) die "unsupported OS: $UNAME" ;;
  esac
  log "platform: os=$OS distro=$DISTRO pm=$PM svc=$SVC arch=$ARCH"
}

# ---- minimal bootstrap deps (curl/git/tar) ---------------------------------
ensure_tool() {
  tool="$1"; have "$tool" && return 0
  log "installing prerequisite: $tool"
  case "$PM" in
    apt)    sudo apt-get update -qq && sudo apt-get install -y -qq "$tool" ;;
    dnf)    sudo dnf install -y -q "$tool" ;;
    pacman) sudo pacman -Sy --noconfirm "$tool" ;;
    brew)   have brew || die "Homebrew required for native macOS bootstrap (or use --mode docker). Install: https://brew.sh"; brew install "$tool" ;;
    *) die "cannot auto-install '$tool' on this platform; install it and retry." ;;
  esac
}

# ---- cloud provisioning (create the VM, then re-run there) ------------------
do_provision() {
  log "provisioning a cloud VM via '$PROVISION'…"
  # cloud-init / user-data: install Exprsn unattended on first boot.
  CLOUD_INIT="$(cat <<EOF
#!/bin/bash
set -e
curl -fsSL ${BOOTSTRAP_URL} | bash -s -- --mode ${MODE} --source ${SOURCE} --channel ${CHANNEL} --unattended
EOF
)"
  TMP_UD="$(mktemp)"; printf '%s\n' "$CLOUD_INIT" > "$TMP_UD"
  # The cloud module needs the source for its provider script; fetch a shallow copy.
  WORK="$(mktemp -d)"; acquire_source "$WORK"
  PROV_SCRIPT="$WORK/install/cloud/${PROVISION_FILE}"
  [ -f "$PROV_SCRIPT" ] || die "cloud provider script not found: $PROV_SCRIPT"
  EXPRSN_REGION="$REGION" EXPRSN_SIZE="$SIZE" EXPRSN_USERDATA="$TMP_UD" \
    sh "$PROV_SCRIPT"
  c_grn "VM provisioning requested via $PROVISION. cloud-init will run the installer on first boot."
  exit 0
}

# ---- source acquisition ----------------------------------------------------
acquire_source() {
  dest="$1"
  case "$SOURCE" in
    git)
      ensure_tool git
      log "git clone (ref=$REF) → $dest"
      git clone --depth 1 --branch "$REF" "$PRIMARY_GIT" "$dest" 2>/dev/null \
        || git clone --depth 1 --branch "$REF" "$MIRROR_GIT" "$dest" \
        || die "git clone failed from both primary and mirror." ;;
    tarball|xz|zip)
      ensure_tool curl
      case "$SOURCE" in tarball) EXT="tar.gz" ;; xz) EXT="tar.xz" ;; zip) EXT="zip" ;; esac
      url="${ARCHIVE_BASE}/${REF}.${EXT}"
      tmp="$(mktemp)"; log "download $url"
      curl -fsSL "$url" -o "$tmp" || die "download failed: $url"
      if [ "$VERIFY" = "1" ]; then
        if curl -fsSL "${url}.sha256" -o "${tmp}.sha256" 2>/dev/null; then
          ( cd "$(dirname "$tmp")" && \
            { sha256sum -c "${tmp}.sha256" 2>/dev/null || shasum -a 256 -c "${tmp}.sha256"; } ) \
            || die "checksum verification failed for $url"
          log "checksum OK"
        else c_ylw "no .sha256 published for $url — skipping verification (use --no-verify to silence)"; fi
      fi
      mkdir -p "$dest"
      case "$EXT" in
        tar.gz) tar -xzf "$tmp" -C "$dest" --strip-components=1 ;;
        tar.xz) tar -xJf "$tmp" -C "$dest" --strip-components=1 ;;
        zip)    ensure_tool unzip; tmpd="$(mktemp -d)"; unzip -q "$tmp" -d "$tmpd"; \
                inner="$(find "$tmpd" -mindepth 1 -maxdepth 1 -type d | head -1)"; \
                cp -a "$inner"/. "$dest"/ ;;
      esac ;;
    *) die "unknown --source: $SOURCE" ;;
  esac
}

# ---- main ------------------------------------------------------------------
detect_platform

case "$PROVISION" in
  ""|none) ;;
  do|digitalocean) PROVISION_FILE="digitalocean.sh"; do_provision ;;
  aws)             PROVISION_FILE="aws.sh";          do_provision ;;
  azure|az)        PROVISION_FILE="azure.sh";        do_provision ;;
  *) die "unknown --provision: $PROVISION (use do|aws|azure)" ;;
esac

# default install dir
if [ -z "$INSTALL_DIR" ]; then
  if [ "$OS" = "macos" ] || [ "$(id -u)" != "0" ]; then INSTALL_DIR="$HOME/exprsn"; else INSTALL_DIR="/opt/exprsn"; fi
fi

# If we're already inside a checkout (dev run), use it; else fetch.
if [ -f "./package.json" ] && [ -d "./install" ]; then
  INSTALL_DIR="$(pwd)"; log "using in-place checkout: $INSTALL_DIR"
elif [ -f "$INSTALL_DIR/package.json" ]; then
  log "reusing existing source at $INSTALL_DIR"
else
  acquire_source "$INSTALL_DIR"
fi

# Dispatch to the chosen target. Targets are bash (4+) and use lib/os.sh.
TARGET="$INSTALL_DIR/install/targets/${MODE}.sh"
[ -f "$TARGET" ] || die "target not found: $TARGET (mode=$MODE)"

# Ensure a modern bash for the target (macOS default is 3.2).
BASH_BIN="bash"
if [ "$OS" = "macos" ]; then
  if have /opt/homebrew/bin/bash; then BASH_BIN="/opt/homebrew/bin/bash";
  elif have /usr/local/bin/bash; then BASH_BIN="/usr/local/bin/bash";
  else c_ylw "macOS system bash is 3.2; native target needs bash 4+. 'brew install bash' or use --mode docker."; fi
fi

export EXPRSN_OS="$OS" EXPRSN_DISTRO="$DISTRO" EXPRSN_PM="$PM" EXPRSN_SVC="$SVC" \
       EXPRSN_ARCH="$ARCH" EXPRSN_DIR="$INSTALL_DIR" EXPRSN_CHANNEL="$CHANNEL" \
       EXPRSN_UNATTENDED="$UNATTENDED"

log "dispatching → $MODE target"
exec "$BASH_BIN" "$TARGET" "$@"
