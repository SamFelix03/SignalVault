import { keccak256, toBytes } from 'viem'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(fileURLToPath(import.meta.url))
const { contractErrorsAbi } = require(
  'c:/Users/MSI/Desktop/SignalVault-2/node_modules/@somnia-chain/markets-sdk/dist/contractErrorsAbi.js',
) as {
  contractErrorsAbi: Array<{ type: string; name: string; inputs?: Array<{ type: string }> }>
}

const target = (process.argv[2] ?? '0xd48c4403').slice(0, 10)
for (const item of contractErrorsAbi) {
  if (item.type !== 'error') continue
  const types = (item.inputs ?? []).map((i) => i.type).join(',')
  const sig = `error ${item.name}(${types})`
  const sel = keccak256(toBytes(sig)).slice(0, 10)
  if (sel === target) console.log(sig)
}
