'use client'

import { DeployForm } from '@/components/deploy/deploy-form'
import { DeployHero } from '@/components/deploy/deploy-hero'

export default function DeployPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <DeployHero />
      <DeployForm />
    </div>
  )
}
