import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { vaultRouter } from './routes/vaults';
import { receiptRouter } from './routes/receipts';
import { pipelineRouter } from './routes/pipeline';
import { vaultIndexer } from '../services/vault-indexer';
import { streamPublisher } from '../services/stream-publisher';
import { logger } from '../utils/logger';

dotenv.config();

const CTX = 'Server';
const PORT = parseInt(process.env.PORT || '3001', 10);

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    vaults: vaultIndexer.getAllVaults().length,
  });
});

app.use('/api/vaults', vaultRouter);
app.use('/api/receipts', receiptRouter);
app.use('/api/pipeline', pipelineRouter);

async function bootstrap(): Promise<void> {
  try {
    await vaultIndexer.start();
    logger.info(CTX, 'Vault indexer initialized');

    await streamPublisher.start();
    logger.info(CTX, 'Stream publisher initialized');

    app.listen(PORT, () => {
      logger.info(CTX, `Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(CTX, 'Failed to bootstrap server', err);
    process.exit(1);
  }
}

bootstrap();
