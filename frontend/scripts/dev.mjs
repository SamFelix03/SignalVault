import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, '.env')

function readPortFromEnvFile() {
  if (!existsSync(envPath)) return null

  const content = readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const match = trimmed.match(/^(?:FRONTEND_PORT|PORT)\s*=\s*(\d+)\s*$/)
    if (match) return match[1]
  }

  return null
}

const useMock = process.argv.includes('--mock')

const port =
  process.env.FRONTEND_PORT ??
  process.env.PORT ??
  readPortFromEnvFile() ??
  '3000'

const childEnv = { ...process.env }
if (useMock) {
  childEnv.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
}

console.log(`Starting Next.js on port ${port} (set FRONTEND_PORT or PORT in frontend/.env)`)
if (useMock) {
  console.log('Mock data mode enabled — seeded demo vaults will be shown')
}

const child = spawn('npx', ['next', 'dev', '-p', port], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: childEnv,
})

child.on('exit', (code) => process.exit(code ?? 0))
