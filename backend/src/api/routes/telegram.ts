import { Router, type Request, type Response } from 'express';
import { getAddress } from 'viem';
import { vaultIndexer } from '../../services/vault-indexer';
import {
  subscribe,
  unsubscribe,
  isSubscribed,
  getVaultsForChat,
} from '../../services/telegram-subscription-store';
import { createLinkToken, getLinkToken } from '../../services/telegram-link-store';
import { isSupabaseConfigured } from '../../config/supabase';
import { isTelegramEnabled } from '../../services/telegram-notifier';
import { logger } from '../../utils/logger';

const CTX = 'TelegramRoutes';
export const telegramRouter = Router();

function requireTelegramConfigured(res: Response): boolean {
  if (!isSupabaseConfigured()) {
    res.status(503).json({ error: 'Supabase is not configured' });
    return false;
  }
  if (!isTelegramEnabled()) {
    res.status(503).json({ error: 'Telegram alerts are not enabled' });
    return false;
  }
  return true;
}

telegramRouter.post('/link', async (req: Request, res: Response) => {
  if (!requireTelegramConfigured(res)) return;

  try {
    const { vault } = req.body as { vault?: string };
    if (!vault) {
      res.status(400).json({ error: 'vault is required' });
      return;
    }

    const vaultAddress = getAddress(vault);
    if (!vaultIndexer.getVault(vaultAddress)) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    const link = await createLinkToken(vaultAddress);
    const botUsername = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '');
    const telegramUrl = botUsername
      ? `https://t.me/${botUsername}?start=${link.token}`
      : undefined;

    res.json({
      token: link.token,
      vault: link.vault,
      expiresAt: link.expiresAt,
      telegramUrl,
    });
  } catch (err) {
    logger.error(CTX, 'create link failed', err);
    res.status(500).json({ error: 'Failed to create Telegram link' });
  }
});

telegramRouter.get('/link/:token', async (req: Request, res: Response) => {
  if (!requireTelegramConfigured(res)) return;

  try {
    const token = String(req.params.token);
    const link = await getLinkToken(token);
    if (!link) {
      res.status(404).json({ error: 'Link not found' });
      return;
    }

    const expired = new Date(link.expiresAt).getTime() < Date.now();
    const linked = Boolean(link.completedAt && link.chatId);

    res.json({
      token: link.token,
      vault: link.vault,
      expiresAt: link.expiresAt,
      expired,
      linked,
      chatId: link.chatId,
      username: link.username,
      firstName: link.firstName,
    });
  } catch (err) {
    logger.error(CTX, 'get link failed', err);
    res.status(500).json({ error: 'Failed to fetch link status' });
  }
});

telegramRouter.post('/subscribe', async (req: Request, res: Response) => {
  if (!requireTelegramConfigured(res)) return;

  try {
    const { vault, chatId, username } = req.body as {
      vault?: string;
      chatId?: string | number;
      username?: string;
    };

    if (!vault || chatId === undefined || chatId === null || chatId === '') {
      res.status(400).json({ error: 'vault and chatId are required' });
      return;
    }

    const vaultAddress = getAddress(vault);
    if (!vaultIndexer.getVault(vaultAddress)) {
      res.status(404).json({ error: 'Vault not found' });
      return;
    }

    await subscribe(String(chatId), vaultAddress, username);
    logger.info(CTX, `Subscribed chat ${chatId} to vault ${vaultAddress}`);
    res.json({ ok: true, vault: vaultAddress, chatId: String(chatId) });
  } catch (err) {
    logger.error(CTX, 'subscribe failed', err);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

telegramRouter.delete('/subscribe', async (req: Request, res: Response) => {
  if (!requireTelegramConfigured(res)) return;

  try {
    const { vault, chatId } = req.body as { vault?: string; chatId?: string | number };

    if (!vault || chatId === undefined || chatId === null || chatId === '') {
      res.status(400).json({ error: 'vault and chatId are required' });
      return;
    }

    const vaultAddress = getAddress(vault);
    await unsubscribe(String(chatId), vaultAddress);
    logger.info(CTX, `Unsubscribed chat ${chatId} from vault ${vaultAddress}`);
    res.json({ ok: true, vault: vaultAddress, chatId: String(chatId) });
  } catch (err) {
    logger.error(CTX, 'unsubscribe failed', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

telegramRouter.get('/subscriptions', async (req: Request, res: Response) => {
  if (!requireTelegramConfigured(res)) return;

  try {
    const chatId = req.query.chatId as string | undefined;
    const vault = req.query.vault as string | undefined;

    if (!chatId) {
      res.status(400).json({ error: 'chatId query parameter is required' });
      return;
    }

    if (vault) {
      const vaultAddress = getAddress(vault);
      const subscribed = await isSubscribed(String(chatId), vaultAddress);
      res.json({ chatId: String(chatId), vault: vaultAddress, subscribed });
      return;
    }

    const subscriptions = await getVaultsForChat(String(chatId));
    res.json({
      chatId: String(chatId),
      subscriptions: subscriptions.map((s) => ({
        vault: s.vault,
        username: s.username,
        subscribedAt: s.subscribedAt,
      })),
    });
  } catch (err) {
    logger.error(CTX, 'list subscriptions failed', err);
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});
