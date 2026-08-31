/**
 * Check follower + mirror-wallet perp positions for a vault.
 *   npx tsx scripts/check-mirror-position.ts <vault> [follower]
 */
import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = process.argv[2] as Address
const follower = (process.argv[3] ?? '0x6C8011a929164485c3aED93433E7363Fcb990b97') as Address
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })

  const signal = await client.readContract({
    address: vault,
    abi: parseAbi([
      'function getCurrentSignal() view returns ((int8 direction, uint16 sizeBps, bytes32 marketId, uint256 limitPrice, uint256 epoch, bytes32 reasoningHash, string reasoningSummary))',
    ]),
    functionName: 'getCurrentSignal',
  })
  const pool = (`0x${signal.marketId.slice(-40)}`) as Address

  const { mirrorWallet, perpRouter } = await resolveMirrorWallet(vault, follower)
  const marginAbi = parseAbi([
    'function getPosition(address account, address perpPool) view returns (int128 size, uint128 avgEntryPrice, int256 entryFundingIndex, uint64 lastUpdatedTimestampNs)',
    'function getMaxLeverage(address account, address perpPool) view returns (uint16)',
  ])

  const mirrorReactor = await client.readContract({
    address: vault,
    abi: parseAbi(['function mirrorReactor() view returns (address)']),
    functionName: 'mirrorReactor',
  })

  const [followerPos, mirrorPos, followerLev, mirrorLev, mirrorCode] = await Promise.all([
    client.readContract({ address: MARGIN_BANK, abi: marginAbi, functionName: 'getPosition', args: [follower, pool] }),
    client.readContract({ address: MARGIN_BANK, abi: marginAbi, functionName: 'getPosition', args: [mirrorWallet, pool] }),
    client.readContract({ address: MARGIN_BANK, abi: marginAbi, functionName: 'getMaxLeverage', args: [follower, pool] }),
    client.readContract({ address: MARGIN_BANK, abi: marginAbi, functionName: 'getMaxLeverage', args: [mirrorWallet, pool] }),
    client.getBytecode({ address: mirrorWallet }),
  ])

  console.log('Vault:', vault)
  console.log('Follower:', follower)
  console.log('Mirror wallet:', mirrorWallet, mirrorCode && mirrorCode.length > 2 ? '(deployed)' : '(not deployed yet)')
  console.log('PerpRouter:', perpRouter)
  console.log('MirrorReactor:', mirrorReactor)
  console.log('Pool:', pool)
  console.log('Signal:', signal.direction > 0 ? 'LONG' : signal.direction < 0 ? 'SHORT' : 'FLAT', `${signal.sizeBps}bps`)
  console.log('\nFollower MarginBank position:', { size: followerPos[0].toString(), avgEntry: followerPos[1].toString(), maxLeverage: followerLev })
  console.log('Mirror wallet MarginBank position:', { size: mirrorPos[0].toString(), avgEntry: mirrorPos[1].toString(), maxLeverage: mirrorLev })

  const hasPosition = mirrorPos[0] !== 0n || followerPos[0] !== 0n
  console.log('\n' + (hasPosition ? '✅ Perp position exists' : '❌ No perp position on-chain yet'))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
