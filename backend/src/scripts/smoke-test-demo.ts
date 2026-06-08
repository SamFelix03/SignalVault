/**
 * End-to-end smoke test for the demo vault.
 * Run: npx tsx src/scripts/smoke-test-demo.ts
 */
import {
  DEMO_VAULT_ADDRESS,
  DEMO_ORCHESTRATOR_ADDRESS,
} from '../config/constants';

const API = `http://localhost:${process.env.PORT || 3001}`;
const VAULT = DEMO_VAULT_ADDRESS;

type Json = Record<string, unknown>;

async function get(path: string) {
  const res = await fetch(`${API}${path}`);
  const body = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, body };
}

async function post(path: string) {
  const res = await fetch(`${API}${path}`, { method: 'POST' });
  const body = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, body };
}

async function waitForPipelineComplete(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const [{ body }, signal] = await Promise.all([
      get(`/api/pipeline/${VAULT}`),
      get(`/api/vaults/${VAULT}/signals`),
    ]);
    const flags = Number(body.flags ?? 0);
    const stage = Number(body.stage ?? 0);
    const completed = Boolean(body.completed) || (flags & 8) !== 0;
    const hasSignal = Number(signal.body.direction ?? 0) !== 0;
    const data = body.data as Json | undefined;
    console.log(`  pipeline stage=${stage} flags=${flags} signal=${signal.body.direction ?? 0}`);
    if ((completed && stage === 0) || hasSignal) return body;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error('Pipeline did not complete in time');
}

async function main() {
  console.log('=== Smoke test ===');
  console.log('Vault:', VAULT);
  console.log('Orchestrator:', DEMO_ORCHESTRATOR_ADDRESS);
  console.log('API:', API);

  const health = await get('/health');
  console.log('\n1. Health:', health.status, health.body);
  if (health.status !== 200) throw new Error('Backend not healthy');

  const vaults = await get('/api/vaults');
  const vaultList = (vaults.body.vaults as Json[] | undefined) ?? [];
  console.log('\n2. Vault list:', vaults.status, `count=${vaultList.length}`);
  const found = vaultList.some((v) => String(v.address).toLowerCase() === VAULT.toLowerCase());
  if (!found) console.warn('   WARN: demo vault not in indexer yet — restart backend');

  const vault = await get(`/api/vaults/${VAULT}`);
  console.log('\n3. Vault detail:', vault.status);

  console.log('\n4. Triggering pipeline...');
  const trigger = await post(`/api/pipeline/${VAULT}/trigger`);
  console.log('   Trigger:', trigger.status, trigger.body);
  if (trigger.status !== 200) throw new Error('Pipeline trigger failed');

  console.log('\n5. Waiting for pipeline completion...');
  const pipeline = await waitForPipelineComplete();
  console.log('   Completed:', pipeline);

  const leaderboard = await get(`/api/vaults/${VAULT}/leaderboard`);
  console.log('\n6. Leaderboard:', leaderboard.status, {
    trades: leaderboard.body.totalTrades,
    winRate: leaderboard.body.winRate,
  });

  const pnl = await get(`/api/vaults/${VAULT}/pnl`);
  const chartData = pnl.body.chartData as unknown[] | undefined;
  console.log('\n7. PnL:', pnl.status, `chartPoints=${chartData?.length ?? 0}`);

  const signal = await get(`/api/vaults/${VAULT}/signals`);
  const latest = (signal.body.signals as Json[] | undefined)?.[0];
  const summary = String(latest?.reasoningSummary ?? '');
  console.log('\n8. Signal:', signal.status, latest?.direction, summary.slice(0, 80));

  console.log('\n=== Smoke test passed ===');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
