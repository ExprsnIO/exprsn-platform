#!/usr/bin/env bash
# ============================================================================
# Exprsn cloud provisioner — Azure (az cli)
# Creates a resource group + Ubuntu VM and bootstraps via custom-data.
# Requires: az cli logged in (`az login`).
#
# Env in:  EXPRSN_REGION (location), EXPRSN_SIZE (VM size), EXPRSN_USERDATA
# Optional: EXPRSN_RG (resource group), EXPRSN_NAME
# ============================================================================
set -euo pipefail
command -v az >/dev/null 2>&1 || { echo "az cli not found. Install + 'az login'." >&2; exit 1; }

LOCATION="${EXPRSN_REGION:-eastus}"
SIZE="${EXPRSN_SIZE:-Standard_B2s}"
RG="${EXPRSN_RG:-exprsn-rg}"
NAME="${EXPRSN_NAME:-exprsn-node}"
IMAGE="${EXPRSN_IMAGE:-Ubuntu2504}"   # az image alias; falls back below if absent
USERDATA="${EXPRSN_USERDATA:?cloud-init custom-data file required}"

echo "[az] ensuring resource group $RG in $LOCATION…" >&2
az group create --name "$RG" --location "$LOCATION" --output none

echo "[az] creating VM $NAME ($SIZE)…" >&2
if ! az vm create --resource-group "$RG" --name "$NAME" --image "$IMAGE" --size "$SIZE" \
      --admin-username exprsn --generate-ssh-keys --custom-data "$USERDATA" \
      --public-ip-sku Standard --output table 2>/dev/null; then
  echo "[az] '$IMAGE' alias unavailable; retrying with full URN Canonical:ubuntu-24_04-lts:server:latest" >&2
  az vm create --resource-group "$RG" --name "$NAME" \
    --image "Canonical:ubuntu-24_04-lts:server:latest" --size "$SIZE" \
    --admin-username exprsn --generate-ssh-keys --custom-data "$USERDATA" \
    --public-ip-sku Standard --output table
fi

echo "[az] opening ports 22/80/443/8443…" >&2
for p in 22 80 443 8443; do
  az vm open-port --resource-group "$RG" --name "$NAME" --port "$p" --priority $((1000+p%1000)) --output none 2>/dev/null || true
done
echo "[az] VM created; custom-data runs the Exprsn installer on first boot." >&2
