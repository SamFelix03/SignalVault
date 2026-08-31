import 'dotenv/config'
import { createPublicClient, http, parseAbi, type Address } from 'viem'
import { somniaTestnet } from '../src/config/chains.js'
import { RPC_URL } from '../src/config/constants.js'
import { resolveMirrorWallet } from '../src/services/mirror-wallet.js'

const vault = '0x9d66a3C2AE78F9852254752a813deC7E1a6f79A5' as Address
const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97' as Address
const USDso = '0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171' as Address
const oldMirror = '0x89a7bd2781826f9fc1bDa07dC124c2b307ce7F58' as Address

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  const { mirrorWallet } = await resolveMirrorWallet(vault, follower)
  const erc20 = parseAbi([
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
  ])
  const [bal, allowNew, allowOld] = await Promise.all([
    client.readContract({ address: USDso, abi: erc20, functionName: 'balanceOf', args: [follower] }),
    client.readContract({ address: USDso, abi: erc20, functionName: 'allowance', args: [follower, mirrorWallet] }),
    client.readContract({ address: USDso, abi: erc20, functionName: 'allowance', args: [follower, oldMirror] }),
  ])
  console.log('mirrorWallet (this vault):', mirrorWallet)
  console.log('USDso balance:', (Number(bal) / 1e18).toFixed(4))
  console.log('allowance → new mirror:', allowNew.toString())
  console.log('allowance → old mirror (0x89a7…):', allowOld.toString())
  console.log(allowNew >= 1_200_000_000_000_000_000n ? '✅ approved to correct mirror' : '❌ NOT approved to this vault mirror wallet')
}

main()
