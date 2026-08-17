import { vaultIndexer } from './vault-indexer';
import { completeLinkToken } from './telegram-link-store';
import { subscribe } from './telegram-subscription-store';
import { isTelegramEnabled } from './telegram-notifier';
import { logger } from '../utils/logger';

const CTX = 'TelegramBotPoller';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    text?: string;
    chat: { id: number; type: string };
    from?: { id: number; username?: string; first_name?: string };
  };
}

let running = false;
let offset = 0;

function parseVaultName(strategyPrompt: string): string {
  const trimmed = strategyPrompt?.trim() ?? '';
  if (!trimmed) return 'Strategy Vault';
  const colonIdx = trimmed.indexOf(': ');
  if (colonIdx > 0 && colonIdx <= 80) {
    const name = trimmed.slice(0, colonIdx).trim();
    if (name) return name;
  }
  return trimmed.length > 50 ? `${trimmed.slice(0, 50).trim()}…` : trimmed;
}

async function sendMessage(chatId: string | number, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram API ${res.status}: ${body.slice(0, 200)}`);
  }
}

async function handleStart(
  chatId: number,
  payload: string,
  username?: string,
  firstName?: string,
): Promise<void> {
  const token = payload.trim();
  if (!token) {
    await sendMessage(
      chatId,
      'Open the link on the vault page to connect alerts for a specific vault.',
    );
    return;
  }

  const link = await completeLinkToken(token, String(chatId), username, firstName);
  if (!link) {
    await sendMessage(
      chatId,
      'This link expired or is invalid. Go back to the vault page and tap <b>Connect Telegram</b> again.',
    );
    return;
  }

  const vault = vaultIndexer.getVault(link.vault as `0x${string}`);
  if (!vault) {
    await sendMessage(chatId, 'Vault not found. The link may be outdated.');
    return;
  }

  await subscribe(String(chatId), link.vault, username);

  const vaultName = parseVaultName(vault.strategyPrompt ?? '');
  await sendMessage(
    chatId,
    `✅ <b>Alerts enabled</b> for <b>${vaultName}</b>.\n\nYou'll get a DM here when this vault publishes a new signal.`,
  );

  logger.info(CTX, `Linked chat ${chatId} to vault ${link.vault} via token ${token}`);
}

async function pollOnce(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('timeout', '30');
  url.searchParams.set('allowed_updates', JSON.stringify(['message']));

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`getUpdates ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };
  if (!data.ok) return;

  for (const update of data.result) {
    offset = update.update_id + 1;
    const message = update.message;
    if (!message) continue;

    const text = message.text?.trim();
    if (!text?.startsWith('/start')) continue;

    const chatId = message.chat.id;
    if (message.chat.type !== 'private') continue;

    const parts = text.split(/\s+/);
    const payload = parts[1] ?? '';
    const from = message.from;

    try {
      await handleStart(chatId, payload, from?.username, from?.first_name);
    } catch (err) {
      logger.error(CTX, `Failed to handle /start for chat ${chatId}`, err);
    }
  }
}

async function pollLoop(): Promise<void> {
  while (running) {
    try {
      await pollOnce();
    } catch (err) {
      logger.error(CTX, 'poll error', err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

export async function startTelegramBotPoller(): Promise<void> {
  if (!isTelegramEnabled()) {
    logger.info(CTX, 'Telegram disabled — bot poller not started');
    return;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  if (running) return;
  running = true;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    if (!res.ok) {
      logger.warn(CTX, 'deleteWebhook failed — polling may not work if a webhook is set');
    }
  } catch (err) {
    logger.warn(CTX, 'deleteWebhook error', err);
  }

  logger.info(CTX, 'Starting Telegram bot poller for deep-link subscriptions');
  void pollLoop();
}

export function stopTelegramBotPoller(): void {
  running = false;
}
