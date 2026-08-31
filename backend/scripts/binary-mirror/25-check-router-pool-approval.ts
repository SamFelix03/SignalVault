#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

const ROUTER = '0xd76aeC3896918dd06bCC5f02d50b6C6aEC00140B'
const POOL = '0x4143cD6dcBAc98D05a7e0406947d46Eb14651EC9'
const OLD_POOL = '0x171186a2A8D237aD194Dd3CAe9b05326407c4E11' // From old market
const TUSDC = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
])

async function main() {
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  console.log('=== ROUTER STATE CHECK ===')
  console.log('Router:', ROUTER)
  console.log('Current pool:', POOL)
  console.log('Old pool:', OLD_POOL)
  
  const [balance, allowanceCurrent, allowanceOld] = await Promise.all([
    client.readContract({
      address: TUSDC as `0x${string}`,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [ROUTER as `0x${string}`]
    }),
    client.readContract({
      address: TUSDC as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [ROUTER as `0x${string}`, POOL as `0x${string}`]
    }),
    client.readContract({
      address: TUSDC as `0x${string}`,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [ROUTER as `0x${string}`, OLD_POOL as `0x${string}`]
    })
  ])
  
  console.log('\nRouter tUSDC balance:', (Number(balance) / 1e6).toFixed(2), 'tUSDC')
  console.log('Router→Current pool allowance:', (Number(allowanceCurrent) / 1e6).toFixed(2), 'tUSDC')
  console.log('Router→Old pool allowance:', (Number(allowanceOld) / 1e6).toFixed(2), 'tUSDC')
  
  if (Number(allowanceCurrent) === 0) {
    console.log('\n❌ PROBLEM: Router has NOT approved the current pool!')
    console.log('The router pulls tUSDC from follower but cannot spend it on the pool.')
    console.log('This explains the error 0xd48c4403')
  } else {
    console.log('\n✅ Router has approved the current pool')
  }
}

main().catch(console.error)
