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

function toAgentReceipt(receipt: Receipt) {
  const priceStage = receipt.stages.find((s) => s.stage.includes('price'));
  const fundingStage = receipt.stages.find((s) => s.stage.includes('funding'));
  const fngStage = receipt.stages.find((s) => s.stage.includes('fear'));
  const newsStage = receipt.stages.find((s) => s.stage.includes('news'));

  return {
    hash: receipt.hash,
    vaultAddress: '',
    epoch: receipt.epoch,
    blockNumber: receipt.blockNumber,
    txHash: '',
    stages: {
      jsonApi: priceStage ? {
        url: priceStage.url,
        rawResult: priceStage.result,
        extractedValue: String((priceStage.result as { price?: string })?.price ?? ''),
        validators: priceStage.validators,
      } : undefined,
      parseWebsite: fngStage ? {
        url: fngStage.url,
        markdownSnippet: JSON.stringify(fngStage.result),
        confidence: 90,
        answerable: true,
      } : undefined,
      inferToolsChat: newsStage ? {
        systemPrompt: 'Strategy agent inference',
        userMessage: JSON.stringify({
          funding: fundingStage?.result,
          fearGreed: fngStage?.result,
        }),
        chainOfThought: String((newsStage.result as { summary?: string })?.summary ?? ''),
        toolCalled: 'updateSignal',
        toolArguments: {},
      } : undefined,
    },
  };
}

receiptRouter.get('/:hash', (req: Request, res: Response) => {
  try {
    const hash = req.params.hash as string;
    const receipt = receiptStore.get(hash);

    if (!receipt) {
      res.status(404).json({ error: 'Receipt not found' });
      return;
    }

    res.json(toAgentReceipt(receipt));
  } catch (err) {
    logger.error(CTX, 'Failed to get receipt', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
