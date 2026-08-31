#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'

async function main() {
  const follower = '0x6C8011a929164485c3aED93433E7363Fcb990b97'
  const router = '0xd76aeC3896918dd06bCC5f02d50b6C6aEC00140B'
  const tusdc = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'
  
  const client = createPublicClient({ chain: somniaTestnet, transport: http() })
  
  const allowance = await client.readContract({
    address: tusdc as `0x${string}`,
    abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
    functionName: 'allowance',
    args: [follower as `0x${string}`, router as `0x${string}`]
  })
  
  console.log('Follower allowance for new router:')
  console.log('  Follower:', follower)
  console.log('  Router:', router)
  console.log('  Allowance:', (Number(allowance) / 1e6).toFixed(2), 'tUSDC')
  console.log('  Allowance (raw):', allowance.toString())
}

main().catch(console.error)
