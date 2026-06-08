import { Router, type Request, type Response } from 'express';
import { getAddress, type Address } from 'viem';
import { receiptStore, type Receipt } from '../../services/receipt-store';
import { getOrBuildReceipt } from '../../services/receipt-builder';
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
  const newsSummary = String((newsStage?.result as { summary?: string })?.summary ?? '');
  const ruleBased = receipt.ruleBased ?? newsSummary.includes('Macro context unavailable');

  const fngResult = fngStage?.result as { fearGreedIndex?: string } | undefined;
  const priceResult = priceStage?.result as { price?: string } | undefined;

  return {
    hash: receipt.hash,
    vaultAddress: receipt.vaultAddress ?? '',
    epoch: receipt.epoch,
    blockNumber: receipt.blockNumber,
    txHash: receipt.txHash ?? '',
    stages: {
      jsonApi: priceStage ? {
        url: priceStage.url,
        rawResult: priceStage.result,
        extractedValue: String(priceResult?.price ?? ''),
        validators: priceStage.validators,
      } : undefined,
      parseWebsite: fngStage ? {
        url: fngStage.url,
        markdownSnippet: JSON.stringify(fngStage.result),
        confidence: fngStage.confidence ?? 90,
        answerable: true,
      } : undefined,
      inferToolsChat: (newsStage || receipt.reasoningSummary) ? {
        systemPrompt: ruleBased
          ? 'Rule-based completion with HTTP fallback data (alternative.me, CoinGecko, CryptoCompare) — Somnia agents did not finish in time.'
          : 'Strategy agent inference',
        userMessage: JSON.stringify({
          price: priceResult?.price,
          funding: fundingStage?.result,
          fearGreed: fngResult,
          macroHeadline: newsSummary,
        }, null, 2),
        chainOfThought: receipt.reasoningSummary ?? newsSummary,
        toolCalled: 'updateSignal',
        toolArguments: {},
        ruleBased,
      } : undefined,
    },
  };
}

receiptRouter.get('/:hash', async (req: Request, res: Response) => {
  try {
    const hash = req.params.hash as string;
    const vaultParam = typeof req.query.vault === 'string' ? req.query.vault : undefined;
    const vaultAddress = vaultParam ? (getAddress(vaultParam) as Address) : undefined;

    let receipt = receiptStore.get(hash);
    if (!receipt) {
      receipt = (await getOrBuildReceipt(hash, vaultAddress)) ?? undefined;
    }

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
