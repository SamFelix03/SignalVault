import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { vaultRouter } from './routes/vaults';
import { receiptRouter } from './routes/receipts';
import { pipelineRouter } from './routes/pipeline';
import { followerRouter } from './routes/followers';
import { eventsRouter } from './routes/events';
import { composabilityRouter } from './routes/composability';
import { setupRouter } from './routes/setup';
import { marketsRouter } from './routes/markets';
import { telegramRouter } from './routes/telegram';
import { startTelegramBotPoller } from '../services/telegram-bot-poller';
import { followerVaultIndex } from '../services/follower-vault-index';
import { vaultIndexer } from '../services/vault-indexer';
import { streamPublisher } from '../services/stream-publisher';
import { mirrorWorker } from '../services/mirror-worker';
import { pipelineReceiptIndexer } from '../services/pipeline-receipt-indexer';
import { walletFillWatcher } from '../services/wallet-fill-watcher';
import { redemptionWatcher } from '../services/redemption-watcher';
import { recoverInFlightPipelines } from '../services/pipeline-run-tracker';
import { logger } from '../utils/logger';

dotenv.config();

const CTX = 'Server';
const PORT = parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10);

const app = express();

app.use(cors());
app.use(express.json());

app
  .route('/health')
  .get((_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      vaults: vaultIndexer.getAllVaults().length,
    });
  })
  .head((_req, res) => {
    res.status(200).end();
  });

app.use('/api/vaults', vaultRouter);
app.use('/api/receipts', receiptRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/followers', followerRouter);
app.use('/api/events', eventsRouter);
app.use('/api/composability', composabilityRouter);
app.use('/api/setup', setupRouter);
app.use('/api/markets', marketsRouter);
app.use('/api/telegram', telegramRouter);

async function bootstrap(): Promise<void> {
  try {
    await vaultIndexer.start();
    logger.info(CTX, 'Vault indexer initialized');

    await followerVaultIndex.syncAll();
    logger.info(CTX, 'Follower vault index synced');

    await mirrorWorker.reconcileAll();
    logger.info(CTX, 'Signal-sync mirror reconciled');

    await streamPublisher.start();
    logger.info(CTX, 'Stream publisher initialized');

    await walletFillWatcher.start();
    logger.info(CTX, 'Wallet fill watcher initialized');

    await redemptionWatcher.start();
    logger.info(CTX, 'Redemption watcher initialized');

    await pipelineReceiptIndexer.start();
    logger.info(CTX, 'Pipeline receipt indexer initialized');

    await recoverInFlightPipelines();
    logger.info(CTX, 'In-flight pipeline recovery complete');

    await startTelegramBotPoller();

    app.listen(PORT, () => {
      logger.info(CTX, `Server running on port ${PORT}`);
    });
  } catch (err) {
    logger.error(CTX, 'Failed to bootstrap server', err);
    process.exit(1);
  }
}

bootstrap();
