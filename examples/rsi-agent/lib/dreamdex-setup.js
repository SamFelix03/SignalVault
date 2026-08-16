import { parseEther } from 'viem'
import {
  FACTORY_ABI,
  STRATEGY_VAULT_ABI,
  MIRROR_REACTOR_ABI,
  DREAMDEX_ADAPTER_ABI,
  ERC20_ABI,
} from './abis.js'

const DEFAULT_FACTORIES = [
  '0x68491CE1f69E8B0DFC25a1F6DE51A1a15825E612',
  '0x4e4D20D7bc954FDe4C447a21255B9eD39cfAb938',
  '0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e',
]

export async function resolveVaultDeployment(publicClient, vaultAddress, factoryAddresses) {
  const factories = factoryAddresses?.length ? factoryAddresses : DEFAULT_FACTORIES

  for (const factory of factories) {
    const count = await publicClient.readContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'getDeploymentCount',
    })

    for (let i = 0n; i < count; i++) {
      const dep = await publicClient.readContract({
        address: factory,
        abi: FACTORY_ABI,
        functionName: 'getDeployment',
        args: [i],
      })

      if (dep.vault.toLowerCase() === vaultAddress.toLowerCase()) {
        return dep
      }
    }
  }

  throw new Error(`Vault ${vaultAddress} not found in known factories`)
}

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
 * dreamDEX trades fire via MirrorReactor when subscribed followers receive SignalUpdated.
 * The native agent uses the same path — strategist must subscribe to mirror their own signals.
 */
export async function ensureDreamDexTrading({
  publicClient,
  walletClient,
  account,
  vaultAddress,
  factoryAddresses,
  riskPct = 1000,
  maxPositionEth = '0.05',
  maxSlippageBps = 300,
  stopLossBufferEth = '0.01',
  quoteDepositUsd = '100',
  baseDepositEth = '0',
}) {
  const dep = await resolveVaultDeployment(publicClient, vaultAddress, factoryAddresses)
  const mirrorReactor = dep.mirrorReactor

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
