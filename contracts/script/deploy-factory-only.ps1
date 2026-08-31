# Deploy VaultFactory only (reuse implementations from a prior partial deploy).
# PerpRouter v4 + MirrorReactor 30M gas — run forge build first.
$ErrorActionPreference = "Stop"
$env:PATH = "$env:USERPROFILE\.foundry\bin;$env:PATH"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$EnvFile = Join-Path $Root "..\backend\.env"
if (-not (Test-Path $EnvFile)) { throw "backend/.env not found" }

Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
    }
}

if (-not $env:PRIVATE_KEY) { throw "PRIVATE_KEY not set" }
if (-not $env:RPC_URL) { throw "RPC_URL not set" }

$Rpc = $env:RPC_URL
$Pk = $env:PRIVATE_KEY
$Tusdc = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E"
$Relayer = "0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844"

# Implementations from 2026-08-31 partial deploy (reused except mirror — redeployed below)
$implVault = "0xC1e5CEDe4CcD36F81Be893f14DD545c9A1fa6233"
$implOrch = "0xECd70CD56b66d691E882d4d86DfB96517221c257"
$implStop = "0x69f19f6e94447Dc7948169E9E063fc035241FbB9"
$implGuard = "0x9E9e92F332e9611930aEA22EdfCD98E0962836a1"
$implCron = "0x01E0C76eac3806329e5cc763A72461f45a016409"
$implLedger = "0xc37EFe7BE2aB16CD0a7cE70816B661763ED05eb6"
$implFees = "0xec3F19BAA0ba633721F9e736053A9002304cAFc7"
$implPublisher = "0x9F0144B894b2Ee9d1c03440777242CCC6c3F62c1"

Write-Host "`n=== Building contracts ===" -ForegroundColor Cyan
forge build 2>&1 | Out-String | Write-Host

Write-Host "`n=== Deploying MirrorReactor (30M gas + setRouter) ===" -ForegroundColor Cyan
$mirrorOut = forge create src/reactivity/MirrorReactor.sol:MirrorReactor `
    --rpc-url $Rpc --private-key $Pk --broadcast 2>&1 | Out-String
Write-Host $mirrorOut
if ($mirrorOut -notmatch 'Deployed to:\s*(0x[a-fA-F0-9]{40})') { throw "MirrorReactor deploy failed" }
$implMirror = $Matches[1]
Write-Host "MirrorReactor impl: $implMirror" -ForegroundColor Green

Write-Host "`n=== Deploying VaultFactory ===" -ForegroundColor Cyan
$factoryOut = forge create src/core/VaultFactory.sol:VaultFactory `
    --rpc-url $Rpc --private-key $Pk --broadcast `
    --constructor-args $implVault $implOrch $implMirror $implStop $implGuard $implCron $implLedger $implFees $implPublisher 2>&1 | Out-String
Write-Host $factoryOut
if ($factoryOut -notmatch 'Deployed to:\s*(0x[a-fA-F0-9]{40})') { throw "VaultFactory deploy failed" }
$factory = $Matches[1]

Write-Host "`n=== Setting relayer on factory ===" -ForegroundColor Cyan
cast send $factory "setRelayer(address)" $Relayer --rpc-url $Rpc --private-key $Pk

$deploymentsDir = Join-Path $Root "deployments"
New-Item -ItemType Directory -Force -Path $deploymentsDir | Out-Null
$ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outFile = Join-Path $deploymentsDir "50312-$ts.json"
@{
    chainId = 50312
    deployedAt = $ts
    vaultFactory = $factory
    collateralToken = $Tusdc
    implementations = @{
        strategyVault = $implVault
        agentOrchestrator = $implOrch
        mirrorReactor = $implMirror
        stopReactor = $implStop
        drawdownGuard = $implGuard
        epochCron = $implCron
        performanceLedger = $implLedger
        feeDistributor = $implFees
        externalSignalPublisher = $implPublisher
    }
} | ConvertTo-Json -Depth 4 | Set-Content $outFile

Copy-Item $outFile (Join-Path $deploymentsDir "50312-latest.json") -Force

Write-Host "`n=== DEPLOYMENT COMPLETE ===" -ForegroundColor Green
Write-Host "VAULT_FACTORY=$factory"
Write-Output "VAULT_FACTORY=$factory"
