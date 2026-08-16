# Deploy updated StrategyVault + AgentOrchestrator and a new VaultFactory.
# Reuses unchanged implementations from the current factory (0x4e4D...).
# Usage: powershell -File script/DeploySettlementFix.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $Root '..\backend\.env'

Get-Content $EnvFile | ForEach-Object {
  if ($_ -match '^([^#=]+)=(.*)$') {
    Set-Item -Path "env:$($matches[1].Trim())" -Value $matches[2].Trim()
  }
}

if (-not $env:PRIVATE_KEY) { throw 'PRIVATE_KEY missing in backend/.env' }
if (-not $env:RPC_URL) { $env:RPC_URL = 'https://api.infra.testnet.somnia.network/' }

$Forge = Join-Path $env:USERPROFILE '.foundry\bin\forge.exe'
$Cast = Join-Path $env:USERPROFILE '.foundry\bin\cast.exe'
$OldFactory = if ($env:VAULT_FACTORY_ADDRESS) { $env:VAULT_FACTORY_ADDRESS } else { '0x4e4D20D7bc954FDe4C447a21255B9eD39cfAb938' }

Set-Location $Root
& $Forge build --silent

function Deploy-Contract([string]$Artifact) {
  Write-Host "=== Deploying $Artifact ===" -ForegroundColor Cyan
  $out = & $Forge create $Artifact --rpc-url $env:RPC_URL --private-key $env:PRIVATE_KEY --broadcast 2>&1
  $out | Write-Host
  if ($LASTEXITCODE -ne 0) { throw "forge create failed for $Artifact" }
  $addr = ($out | Select-String 'Deployed to:\s+(0x[a-fA-F0-9]+)').Matches[0].Groups[1].Value
  if (-not $addr) { throw "No address for $Artifact" }
  return $addr
}

function Get-Impl([string]$Factory, [string]$Sig) {
  return (& $Cast call $Factory $Sig --rpc-url $env:RPC_URL).Trim()
}

Write-Host "Reading implementations from $OldFactory"
$implMirror = Get-Impl $OldFactory 'implMirrorReactor()(address)'
$implStop = Get-Impl $OldFactory 'implStopReactor()(address)'
$implGuard = Get-Impl $OldFactory 'implDrawdownGuard()(address)'
$implCron = Get-Impl $OldFactory 'implEpochCron()(address)'
$implLedger = Get-Impl $OldFactory 'implPerformanceLedger()(address)'
$implFees = Get-Impl $OldFactory 'implFeeDistributor()(address)'
$implPublisher = Get-Impl $OldFactory 'implPublisher()(address)'

$implVault = Deploy-Contract 'src/core/StrategyVault.sol:StrategyVault'
$implOrch = Deploy-Contract 'src/core/AgentOrchestrator.sol:AgentOrchestrator'

Write-Host '=== Deploying VaultFactory ===' -ForegroundColor Cyan
$factoryOut = & $Forge create src/core/VaultFactory.sol:VaultFactory `
  --rpc-url $env:RPC_URL `
  --private-key $env:PRIVATE_KEY `
  --broadcast `
  --constructor-args $implVault $implOrch $implMirror $implStop $implGuard $implCron $implLedger $implFees $implPublisher 2>&1
$factoryOut | Write-Host
if ($LASTEXITCODE -ne 0) { throw 'VaultFactory deploy failed' }
$newFactory = ($factoryOut | Select-String 'Deployed to:\s+(0x[a-fA-F0-9]+)').Matches[0].Groups[1].Value

$deployDir = Join-Path $Root 'deployments'
New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
$ts = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$artifact = @{
  chainId = 50312
  deployedAt = $ts
  vaultFactory = $newFactory
  legacyVaultFactory = '0x5C5E7222C2Ed5DE198398F67d7574cAa87012E9e'
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
} | ConvertTo-Json -Depth 4

$outFile = Join-Path $deployDir "50312-settlement-fix-$ts.json"
$artifact | Set-Content $outFile
Copy-Item $outFile (Join-Path $deployDir '50312-latest.json') -Force

Write-Host ''
Write-Host '=== DEPLOYMENT COMPLETE ===' -ForegroundColor Green
Write-Host "VAULT_FACTORY_ADDRESS=$newFactory"
Write-Host "Artifact: $outFile"
