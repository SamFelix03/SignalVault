/**
 * Triggers pipeline, waits for watchdog completion, verifies on-chain data
 * matches HTTP fallback sources (not placeholder strings).
 *
 * Run: npx tsx src/scripts/verify-fallback-onchain.ts
 */
import { createPublicClient, http } from 'viem';
import {
  DEMO_ORCHESTRATOR_ADDRESS,
  DEMO_VAULT_ADDRESS,
  RPC_URL,
} from '../config/constants';
import { somniaTestnet } from '../config/chains';
import { AgentOrchestratorABI } from '../abis/AgentOrchestrator';
import { StrategyVaultABI } from '../abis/StrategyVault';
import { fetchPipelineFallbackData } from '../services/agent-fallback';

const API = `http://localhost:${process.env.PORT || 3001}`;
const PLACEHOLDERS = ['Macro context unavailable', 'News unavailable'];

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) });
  const vault = DEMO_VAULT_ADDRESS;
  const orchestrator = DEMO_ORCHESTRATOR_ADDRESS;

  console.log('=== On-chain fallback verification ===');
  console.log('Vault:', vault);
  console.log('Orchestrator:', orchestrator);

  const expected = await fetchPipelineFallbackData();
  console.log('\nHTTP fallback (expected):');
  console.log('  Fear/Greed:', expected.fearGreedIndex, expected.fearGreedClassification);
  console.log('  Funding raw:', expected.fetchedFunding.toString(), `(${expected.fundingChangePct.toFixed(2)}%)`);
  console.log('  News:', expected.newsHeadline.slice(0, 100));

  const health = await fetch(`${API}/health`);
  if (!health.ok) throw new Error('Backend not running on ' + API);

  console.log('\nTriggering pipeline...');
  const trigger = await fetch(`${API}/api/pipeline/${vault}/trigger`, { method: 'POST' });
  const triggerBody = await trigger.json();
  console.log('  Trigger status:', trigger.status, triggerBody);

  const runId = BigInt(String(triggerBody.runId ?? 1));
  const deadline = Date.now() + 110_000;

  while (Date.now() < deadline) {
    const res = await fetch(`${API}/api/pipeline/${vault}`);
    const body = await res.json();
    const flags = Number(body.flags ?? 0);
    const completed = Boolean(body.completed) || (flags & 8) !== 0;
    console.log(`  [${new Date().toISOString().slice(11, 19)}] stage=${body.stage} flags=${flags} completed=${completed}`);
    if (completed) break;
    await new Promise((r) => setTimeout(r, 5_000));
  }

  const [price, funding, fearGreed, news] = await client.readContract({
    address: orchestrator,
    abi: AgentOrchestratorABI,
    functionName: 'getPipelineData',
    args: [runId],
  }) as [bigint, bigint, bigint, string];

  const signal = await client.readContract({
    address: vault,
    abi: StrategyVaultABI,
    functionName: 'getCurrentSignal',
  }) as { direction: number; sizeBps: number; reasoningSummary: string };

  console.log('\nOn-chain pipeline data (run', runId.toString(), '):');
  console.log('  Price (cents):', price.toString());
  console.log('  Funding raw:', funding.toString());
  console.log('  Fear/Greed:', fearGreed.toString());
  console.log('  News:', news.slice(0, 120));

  console.log('\nOn-chain signal:');
  console.log('  Direction:', signal.direction);
  console.log('  Size bps:', signal.sizeBps);
  console.log('  Reasoning:', signal.reasoningSummary.slice(0, 160));

  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({
    name: 'Fear/Greed matches alternative.me',
    ok: Number(fearGreed) === expected.fearGreedIndex,
    detail: `on-chain=${fearGreed} expected=${expected.fearGreedIndex}`,
  });

  checks.push({
    name: 'Funding populated from CoinGecko',
    ok: funding > 0n,
    detail: `on-chain=${funding}`,
  });

  checks.push({
    name: 'News is real (not placeholder)',
    ok: !PLACEHOLDERS.some((p) => news.includes(p)) && news.length > 20,
    detail: news.slice(0, 80),
  });

  checks.push({
    name: 'News contains live headline',
    ok: expected.newsHeadline.length > 0 && news.includes(expected.newsHeadline.slice(0, 30)),
    detail: `headline prefix="${expected.newsHeadline.slice(0, 40)}"`,
  });

  checks.push({
    name: 'Signal reasoning references Fear/Greed',
    ok: signal.reasoningSummary.includes(String(expected.fearGreedIndex)),
    detail: signal.reasoningSummary.slice(0, 80),
  });

  checks.push({
    name: 'Signal reasoning has no placeholder',
    ok: !PLACEHOLDERS.some((p) => signal.reasoningSummary.includes(p)),
    detail: '',
  });

  checks.push({
    name: 'Non-flat signal emitted',
    ok: signal.direction !== 0 || signal.sizeBps > 0,
    detail: `dir=${signal.direction} size=${signal.sizeBps}`,
  });

  console.log('\n=== Results ===');
  let passed = 0;
  for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    console.log(`  [${mark}] ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    if (c.ok) passed++;
  }

  console.log(`\n${passed}/${checks.length} checks passed`);
  if (passed < checks.length) process.exit(1);
  console.log('\nOn-chain signals are using real HTTP fallback data.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
