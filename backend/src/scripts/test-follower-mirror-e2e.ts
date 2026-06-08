/**
 * E2E: signal-sync mirror → follower dashboard API.
 * Requires backend running with latest code. Run: npm run test:mirror-e2e
 */
import { privateKeyToAccount } from 'viem/accounts';
import { DEMO_VAULT_ADDRESS } from '../config/constants';

const API = `http://localhost:${process.env.PORT || process.env.BACKEND_PORT || 3001}`;
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

async function waitFor(
  label: string,
  predicate: () => Promise<boolean>,
  maxMs = 150_000,
  intervalMs = 3_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await predicate()) {
      console.log(`  ✓ ${label}`);
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout waiting for: ${label}`);
}

async function waitForPipelineIdle(maxMs = 150_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const { body } = await get(`/api/pipeline/${VAULT}`);
    const flags = Number(body.flags ?? 0);
    const completed = Boolean(body.completed) || (flags & 8) !== 0;
    const stage = Number(body.stage ?? 0);
    if (completed && stage === 0) return;
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error('Pipeline did not become idle in time');
}

async function triggerPipeline(label: string): Promise<void> {
  console.log(label);
  let trigger = await post(`/api/pipeline/${VAULT}/trigger`);
  if (trigger.status === 409) {
    console.log('  Pipeline busy — waiting for idle...');
    await waitForPipelineIdle();
    trigger = await post(`/api/pipeline/${VAULT}/trigger`);
  }
  if (trigger.status !== 200) {
    throw new Error(`Pipeline trigger failed: ${trigger.status} ${JSON.stringify(trigger.body)}`);
  }
  await waitForPipelineIdle();
}

function hasOpenMirrorPosition(positions: Array<{ vaultAddress: string; direction: number; size: string }>): boolean {
  return positions.some(
    (p) =>
      p.vaultAddress.toLowerCase() === VAULT.toLowerCase()
      && p.direction !== 0
      && p.size !== '0'
      && BigInt(p.size) > 0n,
  );
}

async function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY required');
  const follower = privateKeyToAccount(pk as `0x${string}`).address;

  console.log('=== Follower mirror E2E ===');
  console.log('API:', API);
  console.log('Vault:', VAULT);
  console.log('Follower:', follower);

  const health = await get('/health');
  if (health.status !== 200) throw new Error('Backend not running — start with npm run dev');
  console.log('\n1. Health OK, vaults indexed:', health.body.vaults);

  await waitForPipelineIdle().catch(() => {});

  console.log('\n2. Trigger pipeline (signal #1)...');
  await triggerPipeline('   Starting pipeline run #1');

  await waitFor('non-flat signal published', async () => {
    const sig = await get(`/api/vaults/${VAULT}/signals`);
    const latest = (sig.body.signals as Array<{ direction: number }> | undefined)?.[0];
    return Number(latest?.direction ?? 0) !== 0;
  });

  await waitFor('open follower mirror position', async () => {
    const pos = await get(`/api/followers/${follower}/positions`);
    const positions = (pos.body.positions as Array<{ vaultAddress: string; direction: number; size: string }>) ?? [];
    return hasOpenMirrorPosition(positions);
  });

  const posMid = await get(`/api/followers/${follower}/positions`);
  console.log('   Positions:', JSON.stringify(posMid.body.positions, null, 2));

  console.log('\n3. Trigger pipeline (signal #2 → settle + reopen)...');
  await triggerPipeline('   Starting pipeline run #2');

  await waitFor('settled follower trade', async () => {
    const trades = await get(`/api/followers/${follower}/trades`);
    const list = (trades.body.trades as unknown[]) ?? [];
    return list.length >= 1;
  });

  const trades = await get(`/api/followers/${follower}/trades`);
  console.log('\n4. Trades:', JSON.stringify(trades.body.trades, null, 2));

  const first = (trades.body.trades as Array<{ source?: string; vaultAddress: string }>)?.[0];
  if (!first || first.source !== 'signal-sync') {
    throw new Error('Expected signal-sync trade in API response');
  }

  console.log('\n=== Follower mirror E2E passed ===');
}

main().catch((err) => {
  console.error('E2E failed:', err);
  process.exit(1);
});
