import { Router, type Request, type Response } from 'express';
import { receiptStore, type Receipt } from '../../services/receipt-store';
import { logger } from '../../utils/logger';

const CTX = 'ReceiptRoutes';
export const receiptRouter = Router();

receiptRouter.post('/:hash', (req: Request, res: Response) => {
  try {
    const hash = req.params.hash as string;
    const body = req.body as Omit<Receipt, 'hash'>;

    if (!body.epoch || !body.blockNumber || !Array.isArray(body.stages)) {
      res.status(400).json({ error: 'Invalid receipt: requires epoch, blockNumber, and stages array' });
      return;
    }

    const receipt: Receipt = { hash, ...body };
    receiptStore.store(receipt);
    res.status(201).json({ receipt });
  } catch (err) {
    logger.error(CTX, 'Failed to store receipt', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

receiptRouter.get('/:hash', (req: Request, res: Response) => {
  try {
    const hash = req.params.hash as string;
    const receipt = receiptStore.get(hash);

    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    res.json({ receipt });
  } catch (err) {
    logger.error(CTX, 'Failed to get receipt', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
