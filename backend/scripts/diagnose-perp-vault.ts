/**
 * Diagnose perp vault mirror readiness.
 *   npx tsx scripts/diagnose-perp-vault.ts 0x7735...
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address, type Hex } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address
const MARKETS_CORE = '0x2802504314685D89bF6C992CA5a8e7cC78bc0294' as Address
const PLACE_ORDER_FOR = '0x80054449' as Hex

const vaultAbi = parseAbi([
  'function mirrorReactor() view returns (address)',
  'function executionRouter() view returns (address)',
  'function instrumentType() view returns (uint8)',
  'function getFollowers() view returns (address[])',
  'function getFollowerConfig(address) view returns ((uint16 riskPct, uint256 maxPositionSize, uint16 maxSlippageBps, uint256 stopLossBuffer, bool active))',
  'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
])

const marginBankAbi = parseAbi([
  'function getPosition(address account, address perpPool) view returns (int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs)',
  'function getMaxLeverage(address account, address perpPool) view returns (uint16)',
])

const operatorAbi = parseAbi([
  'function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)',
])

const marketsCoreAbi = parseAbi([
  'function operatorPermissionsRegistry() view returns (address)',
])

async function main() {
  const vault = (process.argv[2] ?? process.env.PERP_VAULT_ADDRESS) as Address
  if (!vault) throw new Error('vault address required')

  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })

  const [mirror, router, instrument, followers, signal] = await Promise.all([
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'mirrorReactor' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'executionRouter' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'instrumentType' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getFollowers' }),
    client.readContract({ address: vault, abi: vaultAbi, functionName: 'getCurrentSignal' }),
  ])

  const pool = (`0x${signal.marketId.slice(-40)}`) as Address

  console.log('Vault:', vault)
  console.log('Instrument:', instrument === 1 ? 'PERP' : 'BINARY')
  console.log('MirrorReactor:', mirror)
  console.log('PerpRouter:', router)
  console.log('MirrorReactor.subscriptionId (contract field):', await client.readContract({
    address: mirror,
    abi: parseAbi(['function subscriptionId() view returns (uint256)']),
    functionName: 'subscriptionId',
  }).then((n) => n.toString()))
  console.log('\nCurrent signal:')
  console.log('  direction:', signal.direction, signal.direction > 0 ? 'LONG' : signal.direction < 0 ? 'SHORT' : 'FLAT')
  console.log('  sizeBps:', signal.sizeBps)
  console.log('  pool:', pool)
  console.log('  limitPrice:', signal.limitPrice.toString())
  console.log('  epoch:', signal.epoch.toString())
  console.log('  reason:', signal.reasoningSummary.slice(0, 120))

  let registry: Address | null = null
  try {
    registry = await client.readContract({
      address: MARKETS_CORE,
      abi: marketsCoreAbi,
      functionName: 'operatorPermissionsRegistry',
    })
  } catch {
    registry = null
  }

  console.log('\nFollowers:', followers.length)
  for (const follower of followers) {
    const cfg = await client.readContract({
      address: vault,
      abi: vaultAbi,
      functionName: 'getFollowerConfig',
      args: [follower],
    })
    let operatorOk: boolean | string = 'registry unavailable'
    if (registry) {
      try {
        operatorOk = await client.readContract({
          address: registry,
          abi: operatorAbi,
          functionName: 'isApprovedForPool',
          args: [pool, follower, router, PLACE_ORDER_FOR],
        })
      } catch {
        operatorOk = 'check failed'
      }
    }
    const [pos, lev] = await Promise.all([
      client.readContract({
        address: MARGIN_BANK,
        abi: marginBankAbi,
        functionName: 'getPosition',
        args: [follower, pool],
      }),
      client.readContract({
        address: MARGIN_BANK,
        abi: marginBankAbi,
        functionName: 'getMaxLeverage',
        args: [follower, pool],
      }),
    ])
    const collateral = (cfg.maxPositionSize * BigInt(signal.sizeBps) * BigInt(cfg.riskPct)) / (10_000n * 10_000n)
    console.log(`\n  ${follower}`)
    console.log('    active:', cfg.active, 'riskPct:', cfg.riskPct, 'maxPosition:', cfg.maxPositionSize.toString())
    console.log('    operator approved (PerpRouter placeOrderFor):', operatorOk)
    console.log('    maxLeverage:', lev)
    console.log('    position size:', pos[0].toString())
    console.log('    mirror collateral budget:', collateral.toString())
  }

  if (followers.length === 0) {
    console.log('\n⚠ No followers subscribed — mirror has nobody to trade for.')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
