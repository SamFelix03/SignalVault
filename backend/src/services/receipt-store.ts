import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

const CTX = 'ReceiptStore';
const DATA_DIR = path.resolve(__dirname, '../../data/receipts');

export interface ReceiptStage {
  stage: string;
  type: string;
  url: string;
  result: unknown;
  validators: string[];
  consensus: boolean;
  fallbackSource?: 'http' | 'somnia';
  confidence?: number;
}

export interface Receipt {
  hash: string;
  epoch: number;
  blockNumber: number;
  stages: ReceiptStage[];
  vaultAddress?: string;
  orchestrator?: string;
  runId?: number;
  txHash?: string;
  reasoningSummary?: string;
  ruleBased?: boolean;
  publisherKind?: 'native' | 'custom';
  signalDirection?: number;
  signalSizeBps?: number;
}

class ReceiptStore {
  private receipts: Map<string, Receipt> = new Map();

  constructor() {
    this.ensureDataDir();
    this.loadFromDisk();
  }

  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadFromDisk(): void {
    try {
      const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
        const receipt: Receipt = JSON.parse(content);
        this.receipts.set(receipt.hash, receipt);
      }
      logger.info(CTX, `Loaded ${this.receipts.size} receipts from disk`);
    } catch (err) {
      logger.warn(CTX, 'Failed to load receipts from disk', err);
    }
  }

  private persistToDisk(receipt: Receipt): void {
    try {
      const filePath = path.join(DATA_DIR, `${receipt.hash}.json`);
      fs.writeFileSync(filePath, JSON.stringify(receipt, null, 2));
    } catch (err) {
      logger.error(CTX, 'Failed to persist receipt', err);
    }
  }

  store(receipt: Receipt): void {
    this.receipts.set(receipt.hash, receipt);
    this.persistToDisk(receipt);
    logger.info(CTX, `Stored receipt ${receipt.hash}`);
  }

  get(hash: string): Receipt | undefined {
    return this.receipts.get(hash);
  }

  getAll(): Receipt[] {
    return Array.from(this.receipts.values());
  }
}

export const receiptStore = new ReceiptStore();
