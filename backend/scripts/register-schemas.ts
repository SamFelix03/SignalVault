import dotenv from 'dotenv';
dotenv.config();

import { SDK, zeroBytes32 } from '@somnia-chain/streams';
import { publicClient, getWalletClient } from '../src/config/chains';
import { SIGNAL_SCHEMA, PNL_SCHEMA, VAULT_META_SCHEMA, SCHEMA_NAMES } from '../src/config/schemas';

async function registerSchemas(): Promise<void> {
  console.log('Registering Data Stream schemas on Somnia testnet...\n');

  const walletClient = getWalletClient();
  const sdk = new SDK({ public: publicClient, wallet: walletClient });

  const schemas = [
    { name: SCHEMA_NAMES.signal, schema: SIGNAL_SCHEMA },
    { name: SCHEMA_NAMES.pnl, schema: PNL_SCHEMA },
    { name: SCHEMA_NAMES.vaultMeta, schema: VAULT_META_SCHEMA },
  ];

  for (const { name, schema } of schemas) {
    const schemaIdResult = await sdk.streams.computeSchemaId(schema);
    if (schemaIdResult instanceof Error) throw schemaIdResult;
    const schemaId = schemaIdResult as `0x${string}`;

    console.log(`Schema: ${name}`);
    console.log(`  Definition: ${schema}`);
    console.log(`  Computed ID: ${schemaId}`);

    const exists = await sdk.streams.isDataSchemaRegistered(schemaId);
    if (exists) {
      console.log(`  Status: Already registered\n`);
      continue;
    }

    console.log(`  Registering...`);
    const txResult = await sdk.streams.registerDataSchemas([
      { schemaName: name, schema, parentSchemaId: zeroBytes32 as `0x${string}` },
    ]);
    if (txResult instanceof Error) throw txResult;
    const tx = txResult as `0x${string}`;

    const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
    console.log(`  TX: ${tx}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log(`  Status: Registered\n`);
  }

  console.log('All schemas registered successfully.');
}

registerSchemas().catch((err) => {
  console.error('Schema registration failed:', err);
  process.exit(1);
});
