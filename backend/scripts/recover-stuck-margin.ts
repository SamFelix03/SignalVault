/**
 * Recover USDso stuck in MarginBank under old mirror wallet.
 * After router upgrades, old margin may be left in MarginBank.
 * 
 *   npx tsx scripts/recover-stuck-margin.ts <oldMirrorWallet>
 */
import 'dotenv/config'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'

const MARGIN_BANK = '0xdd4A14A2763FDa39b9759D2D4150DB0e0f085C4E' as Address

async function main() {
  const oldMirrorWallet = process.argv[2] as Address
  if (!oldMirrorWallet) throw new Error('usage: recover-stuck-margin.ts <oldMirrorWallet>')

  const pk = process.env.PRIVATE_KEY
  if (!pk) throw new Error('PRIVATE_KEY required')

  const account = privateKeyToAccount((pk.startsWith('0x') ? pk : `0x${pk}`) as Hex)
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL) })

  // Check deposited balance
  const deposited = await client.readContract({
    address: MARGIN_BANK,
    abi: parseAbi(['function getDepositedBalance(address) view returns (uint256)']),
    functionName: 'getDepositedBalance',
    args: [oldMirrorWallet],
  }).catch(() => 0n)

  console.log('Old mirror wallet:', oldMirrorWallet)
  console.log('Deposited in MarginBank:', formatUnits(deposited, 18), 'USDso')

  if (deposited === 0n) {
    console.log('No margin to recover')
    return
  }

  // Get owner of the mirror wallet
  const owner = await client.readContract({
    address: oldMirrorWallet,
    abi: parseAbi(['function owner() view returns (address)']),
    functionName: 'owner',
  })

  console.log('Mirror wallet owner:', owner)
  console.log('Recovery wallet:', account.address)

  if (owner.toLowerCase() !== account.address.toLowerCase()) {
    console.log('⚠️ You are not the owner of this mirror wallet')
    console.log('Only the follower can recover their margin')
    return
  }

  // Withdraw all deposited margin
  console.log(`\nWithdrawing ${formatUnits(deposited, 18)} USDso...`)
  
  const withdrawHash = await wallet.writeContract({
    address: MARGIN_BANK,
    abi: parseAbi(['function withdraw(uint256 amount)']),
    functionName: 'withdraw',
    args: [deposited],
  })

  const receipt = await client.waitForTransactionReceipt({ hash: withdrawHash })
  console.log('Withdraw tx:', withdrawHash)
  console.log('Status:', receipt.status)

  if (receipt.status === 'success') {
    const newBalance = await client.readContract({
      address: MARGIN_BANK,
      abi: parseAbi(['function getDepositedBalance(address) view returns (uint256)']),
      functionName: 'getDepositedBalance',
      args: [oldMirrorWallet],
    }).catch(() => 0n)

    console.log('✅ Margin recovered successfully!')
    console.log('Remaining in bank:', formatUnits(newBalance, 18), 'USDso')
  } else {
    console.log('❌ Withdraw failed')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})