#!/usr/bin/env bash
# ============================================================================
# Exprsn cloud provisioner — AWS EC2 (aws cli v2)
# Launches an Ubuntu instance and bootstraps the installer via user-data.
# Requires: aws cli configured (`aws configure`) with EC2 permissions.
#
# Env in:  EXPRSN_REGION, EXPRSN_SIZE (instance type), EXPRSN_USERDATA
# Optional: EXPRSN_AMI, EXPRSN_KEYNAME, EXPRSN_SG (security group id),
#           EXPRSN_SUBNET
# ============================================================================
set -euo pipefail
command -v aws >/dev/null 2>&1 || { echo "aws cli not found. Install + 'aws configure'." >&2; exit 1; }

REGION="${EXPRSN_REGION:-us-east-1}"
TYPE="${EXPRSN_SIZE:-t3.medium}"
USERDATA="${EXPRSN_USERDATA:?cloud-init user-data file required}"
NAME="${EXPRSN_NAME:-exprsn-node}"

# Resolve the latest Ubuntu 24.04/25.x AMI from Canonical's SSM public parameter
# unless an AMI is pinned. (25.04 param path used; falls back to 24.04 LTS.)
AMI="${EXPRSN_AMI:-}"
if [ -z "$AMI" ]; then
  AMI="$(aws ssm get-parameter --region "$REGION" \
        --name /aws/service/canonical/ubuntu/server/25.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
        --query 'Parameter.Value' --output text 2>/dev/null || true)"
  [ -n "$AMI" ] && [ "$AMI" != "None" ] || AMI="$(aws ssm get-parameter --region "$REGION" \
        --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
        --query 'Parameter.Value' --output text)"
fi
[ -n "$AMI" ] && [ "$AMI" != "None" ] || { echo "Could not resolve an Ubuntu AMI; set EXPRSN_AMI." >&2; exit 1; }

ARGS=(--region "$REGION" --image-id "$AMI" --instance-type "$TYPE"
      --user-data "file://$USERDATA" --count 1
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]")
[ -n "${EXPRSN_KEYNAME:-}" ] && ARGS+=(--key-name "$EXPRSN_KEYNAME")
[ -n "${EXPRSN_SG:-}" ]      && ARGS+=(--security-group-ids "$EXPRSN_SG")
[ -n "${EXPRSN_SUBNET:-}" ]  && ARGS+=(--subnet-id "$EXPRSN_SUBNET")

echo "[aws] launching $TYPE ($AMI) in $REGION…" >&2
ID="$(aws ec2 run-instances "${ARGS[@]}" --query 'Instances[0].InstanceId' --output text)"
echo "[aws] instance $ID launching; user-data runs the Exprsn installer on boot." >&2
aws ec2 wait instance-running --region "$REGION" --instance-ids "$ID" 2>/dev/null || true
IP="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$ID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text 2>/dev/null || true)"
echo "[aws] instance $ID public IP: ${IP:-pending}. Open ports 22/80/443/8443 in the SG." >&2
