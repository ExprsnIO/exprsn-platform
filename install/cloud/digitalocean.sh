#!/usr/bin/env bash
# ============================================================================
# Exprsn cloud provisioner — DigitalOcean (doctl)
# Creates an Ubuntu 25.x droplet and bootstraps the installer via cloud-init.
# Requires: doctl authenticated (`doctl auth init`).
#
# Env in:  EXPRSN_REGION, EXPRSN_SIZE, EXPRSN_USERDATA (cloud-init file)
# ============================================================================
set -euo pipefail
command -v doctl >/dev/null 2>&1 || { echo "doctl not found. Install + 'doctl auth init'." >&2; exit 1; }

REGION="${EXPRSN_REGION:-nyc3}"
SIZE="${EXPRSN_SIZE:-s-2vcpu-4gb}"
IMAGE="${EXPRSN_IMAGE:-ubuntu-25-04-x64}"
NAME="${EXPRSN_NAME:-exprsn-$(date +%s 2>/dev/null || echo node)}"
USERDATA="${EXPRSN_USERDATA:?cloud-init user-data file required}"

# First SSH key on the account (override with EXPRSN_SSH_KEY=<id/fingerprint>).
SSHKEY="${EXPRSN_SSH_KEY:-$(doctl compute ssh-key list --no-header --format ID | head -1)}"
[ -n "$SSHKEY" ] || { echo "No SSH key on the DO account; add one (doctl compute ssh-key import)." >&2; exit 1; }

echo "[do] creating droplet $NAME ($SIZE/$IMAGE in $REGION)…" >&2
doctl compute droplet create "$NAME" \
  --region "$REGION" --size "$SIZE" --image "$IMAGE" \
  --ssh-keys "$SSHKEY" --user-data-file "$USERDATA" \
  --wait --format ID,Name,PublicIPv4

echo "[do] droplet created. cloud-init is running the Exprsn installer now." >&2
echo "[do] watch: doctl compute droplet list | grep $NAME ; then ssh root@<ip> 'tail -f /var/log/cloud-init-output.log'" >&2
