#!/usr/bin/env npx tsx
import 'dotenv/config'
import { createPublicClient, http, parseAbi } from 'viem'
import { somniaTestnet } from '../../src/config/chains.js'
import { RPC_URL } from '../../src/config/constants.js'

async function main() {
  const router = '0xd76aeC3896918dd06bCC5f02d50b6C6aEC00140B'
  const pool = '0x831c5b73d2aa87a0ea70ac46418a2c0c54ac6342'
  const tusdc = '0x70a86d8842fb63c4ad2b7cdddf530ebf1bb25d8e'
  
  const client = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL) })
  
  const [rBal, rAllow] = await Promise.all([
    client.readContract({
      address: tusdc as `0x${string}`,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [router as `0x${string}`]
    }),
    client.readContract({
      address: tusdc as `0x${string}`,
      abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
      functionName: 'allowance',
      args: [router as `0x${string}`, pool as `0x${string}`]
    })
  ])
  
  console.log('Router state:')
  console.log('  Router:', router)
  console.log('  Pool:', pool)
  console.log('  tUSDC balance:', (Number(rBal) / 1e6).toFixed(2), 'tUSDC')
  console.log('  Pool allowance:', (Number(rAllow) / 1e6).toFixed(2), 'tUSDC')
}

main().catch(console.error)
