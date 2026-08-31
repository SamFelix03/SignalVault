/**
 * Temporarily patch PerpRouterV5 to use aggressive slippage for testnet
 * 
 *   npx tsx scripts/patch-router-v5-slippage.ts
 */
import 'dotenv/config'
import { promises as fs } from 'fs'
import { resolve } from 'path'

async function main() {
  const routerPath = resolve(__dirname, '../../contracts/src/integrations/PerpRouterV5.sol')
  
  console.log('=== Patching PerpRouterV5 for Aggressive Testnet Slippage ===')
  console.log('File:', routerPath)
  
  const content = await fs.readFile(routerPath, 'utf-8')
  
  // Check current slippage setting
  const currentMatch = content.match(/MAX_MIRROR_SLIPPAGE_BPS = (\d+)/)
  if (currentMatch) {
    const currentValue = currentMatch[1]
    console.log('Current MAX_MIRROR_SLIPPAGE_BPS:', currentValue)
    
    if (currentValue === '5000') {
      console.log('✅ Already patched to 5000 (50%)')
      return
    }
    
    if (currentValue === '1500') {
      // Patch from 1500 to 5000
      const patchedContent = content.replace(
        /uint16 internal constant MAX_MIRROR_SLIPPAGE_BPS = 1500;/,
        'uint16 internal constant MAX_MIRROR_SLIPPAGE_BPS = 5000; // Aggressive testnet slippage'
      )
      
      await fs.writeFile(routerPath, patchedContent)
      console.log('✅ Patched MAX_MIRROR_SLIPPAGE_BPS: 1500 → 5000 (50%)')
      console.log('⚡ IOC orders will now try up to 50% slippage for testnet liquidity')
      console.log('')
      console.log('Next: Rebuild and redeploy PerpRouterV5 with aggressive slippage')
    } else {
      console.log('⚠️ Unexpected current value:', currentValue)
    }
  } else {
    console.log('❌ Could not find MAX_MIRROR_SLIPPAGE_BPS constant')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})