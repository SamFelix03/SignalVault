import { Router, type Request, type Response } from 'express';
import { getBinaryMarketsCatalog, getPerpMarketsCatalog } from '../../services/markets-catalog';
import { logger } from '../../utils/logger';

const CTX = 'MarketsRoutes';
export const marketsRouter = Router();

marketsRouter.get('/binary', async (_req: Request, res: Response) => {
  try {
    logger.info(CTX, 'GET /api/markets/binary');
    const rows = await getBinaryMarketsCatalog();
    logger.info(CTX, 'Listed binary markets', { count: rows.length, trading: rows.filter((r) => r.trading).length });
    res.json({ markets: rows });
  } catch (err) {
    logger.error(CTX, 'Failed to list binary markets', err);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

marketsRouter.get('/perps', async (_req: Request, res: Response) => {
  try {
    logger.info(CTX, 'GET /api/markets/perps');
    const rows = await getPerpMarketsCatalog();
    logger.info(CTX, 'Listed perp markets', { count: rows.length });
    res.json({ markets: rows });
  } catch (err) {
    logger.error(CTX, 'Failed to list perp markets', err);
    res.status(500).json({ error: 'Failed to fetch perp markets' });
  }
});
