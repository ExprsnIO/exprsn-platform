#!/usr/bin/env bash
# ============================================================================
# Exprsn — Docker target. Installs Docker + Compose, renders .env, and brings
# up the existing docker-compose.yml stack. Works on every OS (incl. macOS and
# any host without native package coverage). Sourced libs handle PM differences.
# ============================================================================
set -uo pipefail
DIR="${EXPRSN_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
. "$DIR/install/lib/os.sh"

log() { printf '[docker] %s\n' "$*" >&2; }
die() { printf '\033[31m[docker] FATAL: %s\033[0m\n' "$*" >&2; exit 1; }
rand() { openssl rand -hex "${1:-24}" 2>/dev/null || head -c "${1:-24}" /dev/urandom | xxd -p | tr -d '\n'; }

# ---- ensure Docker + compose ----------------------------------------------
ensure_docker() {
  if command -v docker >/dev/null 2>&1; then log "docker present: $(docker --version)"; else
    log "installing Docker…"
    case "$PM" in
      apt) pkg_update; pkg_install docker.io docker-compose-plugin || { curl -fsSL https://get.docker.com | sudo sh; } ;;
      dnf) pkg_install docker docker-compose-plugin || { curl -fsSL https://get.docker.com | sudo sh; } ;;
      pacman) pkg_install docker docker-compose ;;
      brew) die "Install Docker Desktop for macOS (https://www.docker.com/products/docker-desktop) then re-run." ;;
    esac
    [ "$SVC" = systemd ] && { sudo systemctl enable --now docker >/dev/null 2>&1 || true; }
  fi
  docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 \
    || die "docker compose plugin missing."
}
compose() { if docker compose version >/dev/null 2>&1; then docker compose "$@"; else docker-compose "$@"; fi; }

# ---- render .env from .env.example with generated secrets ------------------
render_env() {
  local env="$DIR/.env"
  if [ -f "$env" ]; then log ".env exists — leaving it untouched."; return; fi
  [ -f "$DIR/.env.example" ] || die ".env.example not found in $DIR"
  cp "$DIR/.env.example" "$env"
  # Replace the obvious change_me placeholders with real secrets.
  local DBP RP RMQ JWT SESS SVC
  DBP=$(rand 24); RP=$(rand 24); RMQ=$(rand 24); JWT=$(rand 32); SESS=$(rand 32); SVC=$(rand 48)
  sed -i.bak -E \
    -e "s/^DB_PASSWORD=.*/DB_PASSWORD=${DBP}/" \
    -e "s/^REDIS_PASSWORD=.*/REDIS_PASSWORD=${RP}/" \
    -e "s/^RABBITMQ_PASSWORD=.*/RABBITMQ_PASSWORD=${RMQ}/" \
    -e "s/^JWT_SECRET=.*/JWT_SECRET=${JWT}/" \
    -e "s/^SESSION_SECRET=.*/SESSION_SECRET=${SESS}/" \
    "$env" 2>/dev/null || true
  grep -q '^SERVICE_TOKEN_SECRET=' "$env" && sed -i.bak -E "s/^#?\s*SERVICE_TOKEN_SECRET=.*/SERVICE_TOKEN_SECRET=${SVC}/" "$env" || echo "SERVICE_TOKEN_SECRET=${SVC}" >> "$env"
  rm -f "$env.bak"
  chmod 600 "$env"
  log "rendered $DIR/.env with generated secrets."
}

# ---- choose compose profiles ----------------------------------------------
choose_profiles() {
  PROFILES=()
  if [ "${EXPRSN_UNATTENDED:-0}" = "1" ] || ! command -v whiptail >/dev/null 2>&1; then
    PROFILES=(--profile extras)     # core + extras by default
  else
    if whiptail --yesno "Bring up EXTRAS too (OpenLDAP, BIND, Kerberos, Dovecot, strongSwan)?\n\nNo = core only (postgres, redis, opensearch, rabbitmq, nginx)." 12 70; then
      PROFILES=(--profile extras)
    fi
    whiptail --yesno "Also bring up OPTIONAL (OpenSearch Dashboards, etc.)?" 10 70 && PROFILES+=(--profile optional)
  fi
}

main() {
  command -v openssl >/dev/null 2>&1 || pkg_install openssl 2>/dev/null || true
  ensure_docker
  render_env
  # Dev TLS cert for the nginx edge container, if the repo provides a generator.
  [ -f "$DIR/certs/platform.crt" ] || { (cd "$DIR" && npm run gen:certs >/dev/null 2>&1) || \
    { mkdir -p "$DIR/certs"; openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
      -keyout "$DIR/certs/platform.key" -out "$DIR/certs/platform.crt" -subj "/CN=localhost" >/dev/null 2>&1; }; }
  choose_profiles
  log "starting stack: compose ${PROFILES[*]} up -d"
  ( cd "$DIR" && compose "${PROFILES[@]}" pull && compose "${PROFILES[@]}" up -d )
  printf '\033[32m'
  echo "===================================================================="
  echo " Exprsn Docker stack is up."
  echo "   Status:  (cd $DIR && docker compose ps)"
  echo "   Logs:    (cd $DIR && docker compose logs -f)"
  echo "   .env:    $DIR/.env  (generated secrets — chmod 600)"
  echo "   Next:    run the gateway:  (cd $DIR && npm install && npm start)"
  echo "            then: curl -k https://localhost:8443/health"
  echo "===================================================================="
  printf '\033[0m'
}
main "$@"
