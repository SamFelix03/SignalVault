#!/usr/bin/env bash
# Deploy only ExternalSignalPublisher impl + new VaultFactory (reuse existing impls).
#
# Usage:
#   cd contracts && ./script/DeployPublisherOnly.sh
#
# Requires backend/.env with PRIVATE_KEY, RPC_URL, and existing IMPL_* addresses
# (or run full deploy.sh first).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-$ROOT/../backend/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${PRIVATE_KEY:?PRIVATE_KEY not set}"
: "${RPC_URL:?RPC_URL not set}"

CHAIN_ID="${CHAIN_ID:-50312}"
DEPLOYER="${DEPLOYER:-0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844}"
DEPLOYMENTS_DIR="$ROOT/deployments"

# Reuse README / prior deploy impl addresses if not set
IMPL_STRATEGY_VAULT="${IMPL_STRATEGY_VAULT:-0xB1002E371F990313Df28F562Dd2A1c979AD94FA4}"
IMPL_AGENT_ORCHESTRATOR="${IMPL_AGENT_ORCHESTRATOR:-0xB3a4ea0d2bdc96Bf6a29ae04ec90c6a9e9d28214}"
IMPL_MIRROR_REACTOR="${IMPL_MIRROR_REACTOR:-0xfB8368D044C8B514AC182e0Ba0C29AEB660B417a}"
IMPL_STOP_REACTOR="${IMPL_STOP_REACTOR:-0xA51eF1F8d804BAbA0e65073A9b5f2b1a58b03b44}"
IMPL_DRAWDOWN_GUARD="${IMPL_DRAWDOWN_GUARD:-0xF8119f8d66b3A1b9700783b08130875025f052D1}"
IMPL_EPOCH_CRON="${IMPL_EPOCH_CRON:-0xE38D9E7Aebd6818114261c9E79EaBee4BA497Eaa}"
IMPL_PERFORMANCE_LEDGER="${IMPL_PERFORMANCE_LEDGER:-0x4a595A20899993d2e1Bbd3543693EDF978580f20}"
IMPL_FEE_DISTRIBUTOR="${IMPL_FEE_DISTRIBUTOR:-0x06bCf35346D903CB82853F64443a17D78bb94671}"
LEGACY_VAULT_FACTORY="${LEGACY_VAULT_FACTORY:-0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e}"

forge build --silent

echo "=== Deploying ExternalSignalPublisher ==="
IMPL_PUBLISHER=$(forge create src/core/ExternalSignalPublisher.sol:ExternalSignalPublisher \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast 2>&1 | grep -E "Deployed to:" | awk '{print $3}')
echo "IMPL_PUBLISHER=$IMPL_PUBLISHER"

echo "=== Deploying VaultFactory (with publisher) ==="
FACTORY_OUT=$(forge create src/core/VaultFactory.sol:VaultFactory \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast \
  --constructor-args \
    "$IMPL_STRATEGY_VAULT" "$IMPL_AGENT_ORCHESTRATOR" "$IMPL_MIRROR_REACTOR" \
    "$IMPL_STOP_REACTOR" "$IMPL_DRAWDOWN_GUARD" "$IMPL_EPOCH_CRON" \
    "$IMPL_PERFORMANCE_LEDGER" "$IMPL_FEE_DISTRIBUTOR" "$IMPL_PUBLISHER" 2>&1)
echo "$FACTORY_OUT"
FACTORY=$(echo "$FACTORY_OUT" | grep -E "Deployed to:" | awk '{print $3}')

mkdir -p "$DEPLOYMENTS_DIR"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_FILE="$DEPLOYMENTS_DIR/${CHAIN_ID}-custom-agent-${TIMESTAMP}.json"

cat > "$OUT_FILE" <<EOF
{
  "chainId": $CHAIN_ID,
  "deployedAt": "$TIMESTAMP",
  "deployer": "$DEPLOYER",
  "vaultFactory": "$FACTORY",
  "legacyVaultFactory": "$LEGACY_VAULT_FACTORY",
  "implementations": {
    "strategyVault": "$IMPL_STRATEGY_VAULT",
    "agentOrchestrator": "$IMPL_AGENT_ORCHESTRATOR",
    "mirrorReactor": "$IMPL_MIRROR_REACTOR",
    "stopReactor": "$IMPL_STOP_REACTOR",
    "drawdownGuard": "$IMPL_DRAWDOWN_GUARD",
    "epochCron": "$IMPL_EPOCH_CRON",
    "performanceLedger": "$IMPL_PERFORMANCE_LEDGER",
    "feeDistributor": "$IMPL_FEE_DISTRIBUTOR",
    "externalSignalPublisher": "$IMPL_PUBLISHER"
  }
}
EOF

echo ""
echo "=== DONE ==="
echo "VAULT_FACTORY_ADDRESS=$FACTORY"
echo "LEGACY_VAULT_FACTORY_ADDRESS=$LEGACY_VAULT_FACTORY"
echo "IMPL_PUBLISHER=$IMPL_PUBLISHER"
echo "Artifact: $OUT_FILE"
