#!/usr/bin/env bash
# ============================================================================
# Exprsn Platform — Ollama secondary-backend provisioner (TASK-039 / ADR-0005)
# ----------------------------------------------------------------------------
# Brings up the loopback-bound `ollama` container (compose `cortex` profile) and
# pulls the cortex vision model into its persistent volume, ONCE, at provision
# time. Models are pulled here — NEVER inside a job (a multi-GB /api/pull inside
# a bounded worker turns one slow job into a stuck queue; see ADR-0005 §4).
#
# This is the SECONDARY backend only: the primary stays the llama.cpp router at
# CORTEX_LLM_BASE_URL. The container is unauthenticated and MUST remain bound to
# 127.0.0.1 (compose enforces this). See docs/runbooks/digitalocean-ubuntu.md §5.
#
# Usage (from the repo root):
#   scripts/provision-ollama.sh            # up + pull $CORTEX_OLLAMA_VISION_MODEL
#   CORTEX_OLLAMA_VISION_MODEL=qwen3.5:2b scripts/provision-ollama.sh
#   npm run cortex:ollama:provision
#
# Idempotent: `ollama pull` no-ops if the model layers are already present, and
# `compose up -d` no-ops if the container is already running.
# ============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Load .env if present so CORTEX_OLLAMA_VISION_MODEL / OLLAMA_PORT resolve the
# same way Compose resolves them. Does not clobber values already in the env.
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

CONTAINER="${OLLAMA_CONTAINER:-exprsn-ollama}"
MODEL="${CORTEX_OLLAMA_VISION_MODEL:-qwen3.5:2b}"
COMPOSE="docker compose --profile cortex"

echo "==> Provisioning Ollama secondary backend"
echo "    container: $CONTAINER"
echo "    model:     $MODEL"

# 1. Ensure the container is up (loopback-bound, cortex profile).
echo "==> Starting the ollama container (cortex profile)..."
$COMPOSE up -d ollama

# 2. Wait for the daemon to answer before pulling.
echo "==> Waiting for the Ollama daemon to become ready..."
for i in $(seq 1 30); do
  if docker exec "$CONTAINER" ollama list >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "!!! Ollama did not become ready in time. Check: docker logs $CONTAINER" >&2
    exit 1
  fi
  sleep 2
done

# 3. Pull the model into the persistent volume.
echo "==> Pulling '$MODEL' (this can take several minutes on first run)..."
docker exec "$CONTAINER" ollama pull "$MODEL"

# 4. Show what the box actually holds. Tag names DRIFT — reconcile
#    CORTEX_OLLAMA_VISION_MODEL with the exact tag listed here if they differ.
echo "==> Done. Models resident in $CONTAINER:"
docker exec "$CONTAINER" ollama list

cat <<EOF

Next steps:
  • VERIFY the exact tag above matches CORTEX_OLLAMA_VISION_MODEL in .env
    (tag names drift; the pulled tag is authoritative).
  • Confirm the port is loopback-only:  docker port $CONTAINER
    Expected: 11434/tcp -> 127.0.0.1:${OLLAMA_PORT:-11434}  (never 0.0.0.0)
  • Set CORTEX_OLLAMA_ENABLED=true once the cortex backend code is deployed.
EOF
