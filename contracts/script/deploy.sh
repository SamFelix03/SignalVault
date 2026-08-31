#!/usr/bin/env bash
# Reliable Somnia testnet deploy for SignalVault implementations + VaultFactory.
#
# Why not `forge script DeployAll.s.sol --broadcast`?
# Somnia CREATE gas is ~25-55M per contract; forge script batching underestimates
# limits and txs revert (forge may still print "Deployed to" from simulation).
# This script uses sequential `forge create` (auto gas estimation) and verifies
# each on-chain receipt before continuing.
#
# Usage:
#   cd contracts && ./script/deploy.sh
#
# Resume a partial deploy (reuse addresses already on-chain):
#   IMPL_STRATEGY_VAULT=0x... IMPL_AGENT_ORCHESTRATOR=0x... ./script/deploy.sh
#
# Skip specific steps (must provide IMPL_* for skipped contracts):
#   SKIP_PERFORMANCE_LEDGER=1 IMPL_PERFORMANCE_LEDGER=0x... ./script/deploy.sh
#
# Requires ../backend/.env with PRIVATE_KEY and RPC_URL (or export them).

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

: "${PRIVATE_KEY:?PRIVATE_KEY not set - add to backend/.env or export}"
: "${RPC_URL:?RPC_URL not set}"

CHAIN_ID="${CHAIN_ID:-50312}"
DEPLOYER="${DEPLOYER:-0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844}"
DEPLOYMENTS_DIR="$ROOT/deployments"

balance_stt() {
  cast balance "$DEPLOYER" --rpc-url "$RPC_URL" | xargs -I{} cast from-wei {}
}

verify_deployed() {
  local addr=$1 label=$2
  local code status
  code=$(cast code "$addr" --rpc-url "$RPC_URL")
  if [[ "$code" == "0x" ]]; then
    echo "ERROR: $label at $addr has no bytecode on-chain" >&2
    exit 1
  fi
  echo "  ✓ $label verified at $addr" >&2
}

deploy_contract() {
  local label=$1 artifact=$2
  echo "" >&2
  echo "=== Deploying $label ===" >&2

  local out addr tx status gas_used
  if ! out=$(forge create "$artifact" \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast 2>&1); then
    echo "$out" >&2
    echo "ERROR: forge create failed for $label" >&2
    exit 1
  fi

  echo "$out" >&2
  addr=$(echo "$out" | grep -E "Deployed to:" | awk '{print $3}')
  tx=$(echo "$out" | grep -E "Transaction hash:" | awk '{print $3}')

  if [[ -z "$addr" ]]; then
    echo "ERROR: no address returned for $label" >&2
    exit 1
  fi

  if [[ -n "$tx" ]]; then
    local receipt
    receipt=$(cast receipt "$tx" --rpc-url "$RPC_URL")
    status=$(echo "$receipt" | awk '/^status/ {print $2}')
    gas_used=$(echo "$receipt" | awk '/^gasUsed/ {print $2}')
    if [[ "$status" != "1" ]]; then
      echo "ERROR: $label deployment tx failed (status=$status, tx=$tx)" >&2
      exit 1
    fi
    echo "  gas used: $gas_used" >&2
  fi

  verify_deployed "$addr" "$label"
  printf '%s' "$addr"
}

resolve_impl() {
  local env_name=$1 skip_name=$2 label=$3 artifact=$4
  local existing skip_flag

  # bash indirect expansion
  existing="${!env_name-}"
  skip_flag="${!skip_name-}"

  if [[ -n "$existing" ]]; then
    echo "Reusing $label=$existing" >&2
    verify_deployed "$existing" "$label"
    printf '%s' "$existing"
    return
  fi

  if [[ -n "$skip_flag" ]]; then
    echo "ERROR: $skip_name is set but $env_name is not - provide the existing address" >&2
    exit 1
  fi

  deploy_contract "$label" "$artifact"
}

echo "SignalVault deploy - chain $CHAIN_ID"
echo "Deployer: $DEPLOYER"
echo "RPC: $RPC_URL"
echo ""

BALANCE_BEFORE=$(balance_stt)
echo "Balance before: $BALANCE_BEFORE STT"
echo ""

forge build --silent

IMPL_STRATEGY_VAULT=$(resolve_impl \
  IMPL_STRATEGY_VAULT SKIP_STRATEGY_VAULT \
  StrategyVault "src/core/StrategyVault.sol:StrategyVault")

IMPL_AGENT_ORCHESTRATOR=$(resolve_impl \
  IMPL_AGENT_ORCHESTRATOR SKIP_AGENT_ORCHESTRATOR \
  AgentOrchestrator "src/core/AgentOrchestrator.sol:AgentOrchestrator")

IMPL_MIRROR_REACTOR=$(resolve_impl \
  IMPL_MIRROR_REACTOR SKIP_MIRROR_REACTOR \
  MirrorReactor "src/reactivity/MirrorReactor.sol:MirrorReactor")

IMPL_STOP_REACTOR=$(resolve_impl \
  IMPL_STOP_REACTOR SKIP_STOP_REACTOR \
  StopReactor "src/reactivity/StopReactor.sol:StopReactor")

IMPL_DRAWDOWN_GUARD=$(resolve_impl \
  IMPL_DRAWDOWN_GUARD SKIP_DRAWDOWN_GUARD \
  DrawdownGuard "src/reactivity/DrawdownGuard.sol:DrawdownGuard")

IMPL_EPOCH_CRON=$(resolve_impl \
  IMPL_EPOCH_CRON SKIP_EPOCH_CRON \
  EpochCron "src/reactivity/EpochCron.sol:EpochCron")

IMPL_PERFORMANCE_LEDGER=$(resolve_impl \
  IMPL_PERFORMANCE_LEDGER SKIP_PERFORMANCE_LEDGER \
  PerformanceLedger "src/finance/PerformanceLedger.sol:PerformanceLedger")

IMPL_FEE_DISTRIBUTOR=$(resolve_impl \
  IMPL_FEE_DISTRIBUTOR SKIP_FEE_DISTRIBUTOR \
  FeeDistributor "src/finance/FeeDistributor.sol:FeeDistributor")

IMPL_PUBLISHER=$(resolve_impl \
  IMPL_PUBLISHER SKIP_PUBLISHER \
  ExternalSignalPublisher "src/core/ExternalSignalPublisher.sol:ExternalSignalPublisher")

TUSDC_COLLATERAL="0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E"

echo "" >&2
echo "=== Deploying VaultFactory ===" >&2

if [[ -n "${VAULT_FACTORY:-}" ]]; then
  echo "Reusing VaultFactory=$VAULT_FACTORY" >&2
  verify_deployed "$VAULT_FACTORY" VaultFactory
  FACTORY="$VAULT_FACTORY"
else
  if [[ -n "${SKIP_VAULT_FACTORY:-}" ]]; then
    echo "ERROR: SKIP_VAULT_FACTORY set but VAULT_FACTORY not provided" >&2
    exit 1
  fi

  FACTORY_OUT=$(forge create src/core/VaultFactory.sol:VaultFactory \
    --rpc-url "$RPC_URL" \
    --private-key "$PRIVATE_KEY" \
    --broadcast \
    --constructor-args \
      "$IMPL_STRATEGY_VAULT" "$IMPL_AGENT_ORCHESTRATOR" "$IMPL_MIRROR_REACTOR" \
      "$IMPL_STOP_REACTOR" "$IMPL_DRAWDOWN_GUARD" "$IMPL_EPOCH_CRON" \
      "$IMPL_PERFORMANCE_LEDGER" "$IMPL_FEE_DISTRIBUTOR" "$IMPL_PUBLISHER" 2>&1) || {
    echo "$FACTORY_OUT" >&2
    exit 1
  }
  echo "$FACTORY_OUT" >&2
  FACTORY=$(echo "$FACTORY_OUT" | grep -E "Deployed to:" | awk '{print $3}')
  FACTORY_TX=$(echo "$FACTORY_OUT" | grep -E "Transaction hash:" | awk '{print $3}')
  if [[ -n "$FACTORY_TX" ]]; then
    FACTORY_STATUS=$(cast receipt "$FACTORY_TX" --rpc-url "$RPC_URL" | awk '/^status/ {print $2}')
    if [[ "$FACTORY_STATUS" != "1" ]]; then
      echo "ERROR: VaultFactory tx failed (tx=$FACTORY_TX)" >&2
      exit 1
    fi
  fi
  verify_deployed "$FACTORY" VaultFactory
fi

BALANCE_AFTER=$(balance_stt)
COST=$(echo "$BALANCE_BEFORE - $BALANCE_AFTER" | bc)

mkdir -p "$DEPLOYMENTS_DIR"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_FILE="$DEPLOYMENTS_DIR/${CHAIN_ID}-${TIMESTAMP}.json"
LATEST_FILE="$DEPLOYMENTS_DIR/${CHAIN_ID}-latest.json"

cat > "$OUT_FILE" <<EOF
{
  "chainId": $CHAIN_ID,
  "deployedAt": "$TIMESTAMP",
  "deployer": "$DEPLOYER",
  "vaultFactory": "$FACTORY",
  "collateralToken": "$TUSDC_COLLATERAL",
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
cp "$OUT_FILE" "$LATEST_FILE"

echo ""
echo "Balance after:  $BALANCE_AFTER STT"
echo "Deploy cost:    ~$COST STT"
echo ""
echo "=== DEPLOYMENT COMPLETE ==="
echo "VAULT_FACTORY=$FACTORY"
echo ""
echo "Artifacts: $OUT_FILE"
echo ""
echo "Next steps:"
echo "  1. Update backend/.env:  VAULT_FACTORY_ADDRESS=$FACTORY"
echo "  2. Update frontend/src/lib/constants.ts with VAULT_FACTORY_ADDRESS"
echo "  3. Signal fees + mirror trades use tUSDC: $TUSDC_COLLATERAL"
echo "  4. Deploy demo vault:    cd backend && npx tsx src/scripts/deploy-demo-vault.ts"
echo "  5. Register subs:        cd backend && npx tsx src/scripts/register-subscriptions.ts"
