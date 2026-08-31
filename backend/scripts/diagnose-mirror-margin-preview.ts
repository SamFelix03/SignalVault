/**
 * Step 5: Use markets-sdk margin preview to quantify mirror order requirements.
 */
import 'dotenv/config'
import { createPublicClient, http } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = '0x535d863382aF5dbB94d078E28fFbdC42573F8F69'
const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97'
const pool = '0x996d36787cfc6569037039730d8cf82ad29c8f56'
const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E'

async function main() {
  const { mirrorWallet } = await resolveMirrorWallet(vault, follower)
  const { previewPerpOrderMargin } = await import('@somnia-chain/markets-sdk/dist/perp/margin.js')

  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const mark = await client.readContract({
    address: pool,
    abi: [{ type: 'function', name: 'getMarkPrice', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const,
    functionName: 'getMarkPrice',
  })
  const tick = (
    await client.readContract({
      address: pool,
      abi: [{ type: 'function', name: 'getOrderBookParameters', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }], stateMutability: 'view' }] as const,
      functionName: 'getOrderBookParameters',
    })
  )[0]
  const adj = (mark * 300n) / 10_000n
  let price = mark - adj
  price = price - (price % tick)
  const quantity = 9_000_000n

  for (const autoPull of [false, true]) {
    const preview = await previewPerpOrderMargin({
      pool,
      marginBank: MARGIN_BANK,
      account: mirrorWallet,
      isBid: false,
      price,
      quantity,
      autoPull,
    }, client)
    console.log(`\npreviewPerpOrderMargin autoPull=${autoPull}:`)
    console.log(JSON.stringify(preview, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
