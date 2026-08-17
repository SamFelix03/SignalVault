# Deploy SignalVault implementations + VaultFactory + SignalPayToken (Somnia testnet)
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

function Deploy-Contract([string]$Label, [string]$Artifact) {
    Write-Host "`n=== Deploying $Label ===" -ForegroundColor Cyan
    $out = forge create $Artifact --rpc-url $Rpc --private-key $Pk --broadcast 2>&1 | Out-String
    Write-Host $out
    if ($LASTEXITCODE -ne 0) { throw "forge create failed for $Label" }
    if ($out -match 'Deployed to:\s*(0x[a-fA-F0-9]{40})') {
        return $Matches[1]
    }
    throw "No address in output for $Label"
}

function Verify-Code([string]$Addr, [string]$Label) {
    $code = cast code $Addr --rpc-url $Rpc
    if ($code -eq "0x") { throw "$Label at $Addr has no bytecode" }
    Write-Host "  OK $Label verified at $Addr" -ForegroundColor Green
}

forge build --silent

$implVault = Deploy-Contract "StrategyVault" "src/core/StrategyVault.sol:StrategyVault"
$implOrch = Deploy-Contract "AgentOrchestrator" "src/core/AgentOrchestrator.sol:AgentOrchestrator"
$implMirror = Deploy-Contract "MirrorReactor" "src/reactivity/MirrorReactor.sol:MirrorReactor"
$implStop = Deploy-Contract "StopReactor" "src/reactivity/StopReactor.sol:StopReactor"
$implGuard = Deploy-Contract "DrawdownGuard" "src/reactivity/DrawdownGuard.sol:DrawdownGuard"
$implCron = Deploy-Contract "EpochCron" "src/reactivity/EpochCron.sol:EpochCron"
$implLedger = Deploy-Contract "PerformanceLedger" "src/finance/PerformanceLedger.sol:PerformanceLedger"
$implFees = Deploy-Contract "FeeDistributor" "src/finance/FeeDistributor.sol:FeeDistributor"
$implPublisher = Deploy-Contract "ExternalSignalPublisher" "src/core/ExternalSignalPublisher.sol:ExternalSignalPublisher"
$paymentToken = Deploy-Contract "SignalPayToken" "src/finance/SignalPayToken.sol:SignalPayToken"

Write-Host "`n=== Deploying VaultFactory ===" -ForegroundColor Cyan
$factoryOut = forge create src/core/VaultFactory.sol:VaultFactory `
    --rpc-url $Rpc --private-key $Pk --broadcast `
    --constructor-args $implVault $implOrch $implMirror $implStop $implGuard $implCron $implLedger $implFees $implPublisher 2>&1 | Out-String
Write-Host $factoryOut
if ($factoryOut -notmatch 'Deployed to:\s*(0x[a-fA-F0-9]{40})') { throw "VaultFactory deploy failed" }
$factory = $Matches[1]

Verify-Code $factory "VaultFactory"

Write-Host "`n=== Setting payment token on factory ===" -ForegroundColor Cyan
$setOut = cast send $factory "setPaymentToken(address)" $paymentToken --rpc-url $Rpc --private-key $Pk 2>&1 | Out-String
Write-Host $setOut

$deploymentsDir = Join-Path $Root "deployments"
New-Item -ItemType Directory -Force -Path $deploymentsDir | Out-Null
$ts = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$outFile = Join-Path $deploymentsDir "50312-$ts.json"
@{
    chainId = 50312
    deployedAt = $ts
    vaultFactory = $factory
    paymentToken = $paymentToken
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
Write-Host "PAYMENT_TOKEN=$paymentToken"
Write-Host "Artifacts: $outFile"

# Export for caller
Write-Output "VAULT_FACTORY=$factory"
Write-Output "PAYMENT_TOKEN=$paymentToken"
