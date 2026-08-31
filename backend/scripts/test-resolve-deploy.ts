import 'dotenv/config'
import { resolveVaultFromDeployTx } from '../src/services/vault-setup-service.js'

const tx = (process.argv[2] ?? '0x082dacc5d033d98d260ae92057d8c670a8590fed7f02e0d4f875d81a0d218543') as `0x${string}`

async function main() {
  const d = await resolveVaultFromDeployTx(tx)
  console.log('vaultAddress:', d.vaultAddress)
  console.log('vaultId:', d.vaultId.toString())
  console.log('strategist:', d.strategist)
  console.log('orchestrator:', d.orchestrator)
}

main().catch((e) => {
  console.error('FAILED:', e.message)
  process.exit(1)
})
