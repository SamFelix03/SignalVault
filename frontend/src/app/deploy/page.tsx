'use client'

import { DeployForm } from '@/components/deploy/deploy-form'

export default function DeployPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Deploy a Vault</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create an autonomous trading vault powered by on-chain AI agents
        </p>
      </div>

      <DeployForm />
    </div>
  )
}
