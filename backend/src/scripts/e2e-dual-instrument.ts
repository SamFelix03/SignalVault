/**
 * Dual-instrument E2E smoke test (testnet).
 *
 *   npx tsx src/scripts/e2e-dual-instrument.ts
 *
 * Requires funded wallet + deployed BINARY and PERP vaults in env.
 */
import 'dotenv/config';

async function main() {
  const binaryVault = process.env.E2E_BINARY_VAULT;
  const perpVault = process.env.E2E_PERP_VAULT;
  if (!binaryVault || !perpVault) {
    console.log('Set E2E_BINARY_VAULT and E2E_PERP_VAULT to run full E2E');
    console.log('Contract unit tests: cd contracts && forge test');
    console.log('Perp operator spike: npx tsx scripts/spike-perp-operator.ts');
    process.exit(0);
  }
  console.log('E2E vaults configured — run subscribe + publish flows manually for now', {
    binaryVault,
    perpVault,
  });
}

main();
