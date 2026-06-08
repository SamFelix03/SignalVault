import { EventEmitter } from 'events';

export type VaultUpdateEvent = {
  type: 'vault-update' | 'pipeline-update';
  vault?: string;
  data: unknown;
};

class AppEventBus extends EventEmitter {
  emitVaultUpdate(vault: string, data: unknown): void {
    this.emit('event', { type: 'vault-update', vault, data } satisfies VaultUpdateEvent);
  }

  emitPipelineUpdate(vault: string, data: unknown): void {
    this.emit('event', { type: 'pipeline-update', vault, data } satisfies VaultUpdateEvent);
  }
}

export const eventBus = new AppEventBus();
