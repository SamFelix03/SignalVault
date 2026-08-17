import { parseEther } from 'viem'
import {
  STRATEGY_VAULT_ABI,
  MIRROR_REACTOR_ABI,
  DREAMDEX_ADAPTER_ABI,
  ERC20_ABI,
} from './abis.js'

export async function readCurrentSignal(publicClient, vaultAddress) {
  const signal = await publicClient.readContract({
    address: vaultAddress,
    abi: STRATEGY_VAULT_ABI,
    functionName: 'getCurrentSignal',
  })

  return {
    directionNum: Number(signal.direction),
    sizeBps: Number(signal.sizeBps),
    stopPrice: signal.stopPrice,
    reason: signal.reasoningSummary,
  }
}

/**
 * Optional dreamDEX bootstrap — reads mirror reactor from the vault contract directly.
 * Agent authors only need VAULT_ADDRESS; no factory addresses required.
 */
export async function ensureDreamDexTrading({
  publicClient,
  walletClient,
  account,
  vaultAddress,
  riskPct = 1000,
  maxPositionEth = '0.05',
  maxSlippageBps = 300,
  stopLossBufferEth = '0.01',
  quoteDepositUsd = '100',
  baseDepositEth = '0',
}) {
  const mirrorReactor = await publicClient.readContract({
    address: vaultAddress,
    abi: STRATEGY_VAULT_ABI,
    functionName: 'mirrorReactor',
  })

  if (!mirrorReactor || mirrorReactor === '0x0000000000000000000000000000000000000000') {
    throw new Error(`Vault ${vaultAddress} has no mirror reactor configured`)
  }

  const dexAdapter = await publicClient.readContract({
    address: mirrorReactor,
    abi: MIRROR_REACTOR_ABI,
    functionName: 'dex',
  })

  const followerConfig = await publicClient.readContract({
    address: vaultAddress,
    abi: STRATEGY_VAULT_ABI,
    functionName: 'getFollowerConfig',
    args: [account.address],
  })

  if (!followerConfig.active) {
    const signalPrice = await publicClient.readContract({
      address: vaultAddress,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'signalPrice',
    }).catch(() => 0n)

    if (signalPrice > 0n) {
      const paymentToken = await publicClient.readContract({
        address: vaultAddress,
        abi: STRATEGY_VAULT_ABI,
        functionName: 'paymentToken',
      })

      const budget = signalPrice * 50n
      const allowance = await publicClient.readContract({
        address: paymentToken,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, vaultAddress],
      })

      if (allowance < budget) {
        console.log(`Approving SVT for signal payments (budget: ${budget} wei)...`)
        const approveHash = await walletClient.writeContract({
          address: paymentToken,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [vaultAddress, budget],
          account,
          chain: walletClient.chain,
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
        console.log(`SVT approved: ${approveHash}`)
      }
    }

    console.log('Subscribing strategist wallet to vault (enables dreamDEX mirroring)...')
    const hash = await walletClient.writeContract({
      address: vaultAddress,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'subscribe',
      args: [
        {
          riskPct,
          maxPositionSize: parseEther(maxPositionEth),
          maxSlippageBps,
          stopLossBuffer: parseEther(stopLossBufferEth),
          active: true,
        },
      ],
      account,
      chain: walletClient.chain,
    })
    await publicClient.waitForTransactionReceipt({ hash })
    console.log(`Subscribed: ${hash}`)
  } else {
    console.log('Strategist already subscribed — dreamDEX mirroring enabled')
  }

  const quoteToken = await publicClient.readContract({
    address: dexAdapter,
    abi: DREAMDEX_ADAPTER_ABI,
    functionName: 'quoteToken',
  })

  const quoteAmount = parseEther(quoteDepositUsd)
  if (quoteAmount > 0n) {
    const walletBalance = await publicClient.readContract({
      address: quoteToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    })

    if (walletBalance >= quoteAmount) {
      console.log(`Funding dreamDEX adapter with ${quoteDepositUsd} USDso for LONG mirrors...`)
      const approveHash = await walletClient.writeContract({
        address: quoteToken,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [dexAdapter, quoteAmount],
        account,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      const depositHash = await walletClient.writeContract({
        address: dexAdapter,
        abi: DREAMDEX_ADAPTER_ABI,
        functionName: 'depositQuote',
        args: [quoteAmount],
        account,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      console.log(`Adapter funded (quote): ${depositHash}`)
    } else {
      console.warn(
        `Skipping quote deposit — wallet has ${walletBalance} wei USDso, need ${quoteAmount}. ` +
          'LONG mirrors may fail until adapter is funded.',
      )
    }
  }

  const baseAmount = parseEther(baseDepositEth)
  if (baseAmount > 0n) {
    const baseToken = await publicClient.readContract({
      address: dexAdapter,
      abi: DREAMDEX_ADAPTER_ABI,
      functionName: 'baseToken',
    })

    const baseBalance = await publicClient.readContract({
      address: baseToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    })

    if (baseBalance >= baseAmount) {
      console.log(`Funding dreamDEX adapter with ${baseDepositEth} WETH for SHORT mirrors...`)
      const approveHash = await walletClient.writeContract({
        address: baseToken,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [dexAdapter, baseAmount],
        account,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      const depositHash = await walletClient.writeContract({
        address: dexAdapter,
        abi: DREAMDEX_ADAPTER_ABI,
        functionName: 'depositBase',
        args: [baseAmount],
        account,
        chain: walletClient.chain,
      })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })
      console.log(`Adapter funded (base): ${depositHash}`)
    } else {
      console.warn('Skipping base deposit — insufficient WETH for SHORT mirrors')
    }
  }

  return { mirrorReactor, dexAdapter }
}
