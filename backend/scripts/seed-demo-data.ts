import dotenv from 'dotenv';
dotenv.config();

import { SDK, SchemaEncoder, zeroBytes32 } from '@somnia-chain/streams';
import { toHex, keccak256, toBytes } from 'viem';
import { publicClient, getWalletClient, getAccount, config } from '../src/config/chains';
import { SIGNAL_SCHEMA, PNL_SCHEMA, SCHEMA_NAMES } from '../src/config/schemas';

async function seedDemoData(): Promise<void> {
  console.log('Seeding demo data to Somnia Data Streams...\n');

  const walletClient = getWalletClient();
  const account = getAccount();
  const sdk = new SDK({ public: publicClient, wallet: walletClient });

  const signalSchemaIdResult = await sdk.streams.computeSchemaId(SIGNAL_SCHEMA);
  if (signalSchemaIdResult instanceof Error) throw signalSchemaIdResult;
  const signalSchemaId = signalSchemaIdResult as `0x${string}`;

  const pnlSchemaIdResult = await sdk.streams.computeSchemaId(PNL_SCHEMA);
  if (pnlSchemaIdResult instanceof Error) throw pnlSchemaIdResult;
  const pnlSchemaId = pnlSchemaIdResult as `0x${string}`;

  const demoVault = config.vaultFactoryAddress || account.address;
  const now = BigInt(Math.floor(Date.now() / 1000));

  // Publish sample signals
  const signalEncoder = new SchemaEncoder(SIGNAL_SCHEMA);
  const signals = [
    { direction: 1, sizeBps: 2500, stopPrice: BigInt('3200000000000000000000'), reasoning: 'ETH breaking above resistance at 3200, momentum indicators bullish' },
    { direction: -1, sizeBps: 1500, stopPrice: BigInt('3400000000000000000000'), reasoning: 'Bearish divergence on 4h RSI, taking short position' },
    { direction: 1, sizeBps: 3000, stopPrice: BigInt('3100000000000000000000'), reasoning: 'Strong support bounce at 3100, volume confirmation' },
  ];

  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    const reasoningHash = keccak256(toBytes(s.reasoning));
    const payload = signalEncoder.encodeData([
      { name: 'timestamp', value: now - BigInt((signals.length - i) * 3600), type: 'uint64' },
      { name: 'vault', value: demoVault, type: 'address' },
      { name: 'direction', value: BigInt(s.direction), type: 'int8' },
      { name: 'sizeBps', value: BigInt(s.sizeBps), type: 'uint16' },
      { name: 'stopPrice', value: s.stopPrice, type: 'uint256' },
      { name: 'reasoningHash', value: reasoningHash, type: 'bytes32' },
      { name: 'reasoning', value: s.reasoning, type: 'string' },
    ]);

    const dataId = toHex(`demo-signal-${i}-${Date.now()}`, { size: 32 });
    const txResult = await sdk.streams.set([
      { id: dataId, schemaId: signalSchemaId, data: payload },
    ]);
    if (txResult instanceof Error) throw txResult;
    const tx = txResult as `0x${string}`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`Signal ${i + 1}: direction=${s.direction}, tx=${tx}, block=${receipt.blockNumber}`);
  }

  // Publish sample PnL records
  const pnlEncoder = new SchemaEncoder(PNL_SCHEMA);
  const trades = [
    { direction: 1, entryPrice: BigInt('59000000000000000000000'), exitPrice: BigInt('61000000000000000000000'), pnlBps: BigInt(339) },
    { direction: -1, entryPrice: BigInt('62000000000000000000000'), exitPrice: BigInt('60500000000000000000000'), pnlBps: BigInt(242) },
  ];

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const signalHash = keccak256(toBytes(`demo-signal-${i}`));
    const payload = pnlEncoder.encodeData([
      { name: 'timestamp', value: now - BigInt((trades.length - i) * 1800), type: 'uint64' },
      { name: 'vault', value: demoVault, type: 'address' },
      { name: 'follower', value: account.address, type: 'address' },
      { name: 'direction', value: BigInt(t.direction), type: 'int8' },
      { name: 'entryPrice', value: t.entryPrice, type: 'uint256' },
      { name: 'exitPrice', value: t.exitPrice, type: 'uint256' },
      { name: 'pnlBps', value: t.pnlBps, type: 'int256' },
      { name: 'signalHash', value: signalHash, type: 'bytes32' },
    ]);

    const dataId = toHex(`demo-pnl-${i}-${Date.now()}`, { size: 32 });
    const pnlTxResult = await sdk.streams.set([
      { id: dataId, schemaId: pnlSchemaId, data: payload },
    ]);
    if (pnlTxResult instanceof Error) throw pnlTxResult;
    const tx = pnlTxResult as `0x${string}`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`Trade ${i + 1}: pnlBps=${t.pnlBps.toString()}, tx=${tx}, block=${receipt.blockNumber}`);
  }

  console.log('\nDemo data seeded successfully.');
}

seedDemoData().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
