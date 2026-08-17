import { logger } from '../utils/logger';
import { vaultIndexer } from './vault-indexer';
import {
  getSubscribers,
  tryRecordSent,
} from './telegram-subscription-store';
import type { DecodedSignalUpdated } from '../utils/decoder';

const CTX = 'TelegramNotifier';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000';

function isEnabled(): boolean {
  if (process.env.TELEGRAM_ENABLED === '0') return false;
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

function directionLabel(direction: number): string {
  if (direction === 1) return 'LONG';
  if (direction === -1 || direction === 2) return 'SHORT';
  return 'FLAT';
}

function formatUsdCents(cents: bigint | number): string {
  const raw = typeof cents === 'bigint' ? Number(cents) : cents;
  if (!Number.isFinite(raw) || raw <= 0) return '—';
  return (raw / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMessage(
  decoded: DecodedSignalUpdated,
  meta?: { epoch?: string; timestamp?: number },
): string {
  const vault = vaultIndexer.getVault(decoded.vault);
  const vaultName = parseVaultName(vault?.strategyPrompt ?? '');
  const frontendUrl = (process.env.FRONTEND_PUBLIC_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  const epoch = meta?.epoch ?? vault?.currentSignal?.epoch;
  const reasoning = decoded.reasoningSummary?.trim() ?? '';
  const reasoningBlock =
    reasoning.length > 500 ? `${reasoning.slice(0, 497)}…` : reasoning;

  const lines = [
    `<b>New signal — ${escapeHtml(vaultName)}</b>`,
    '',
    `<b>Vault:</b> <code>${decoded.vault}</code>`,
    `<b>Direction:</b> ${directionLabel(decoded.direction)}`,
    `<b>Size:</b> ${(decoded.sizeBps / 100).toFixed(1)}%`,
    `<b>Stop:</b> $${formatUsdCents(decoded.stopPrice)}`,
  ];

  if (epoch) {
    lines.push(`<b>Epoch:</b> #${escapeHtml(String(epoch))}`);
  }

  if (reasoningBlock) {
    lines.push('', `<b>Reasoning:</b>`, escapeHtml(reasoningBlock));
  }

  const hash = decoded.reasoningHash?.toLowerCase();
  if (hash && hash !== ZERO_HASH) {
    const auditUrl = `${frontendUrl}/vault/${decoded.vault}/audit/${decoded.reasoningHash}`;
    lines.push('', `<a href="${auditUrl}">View audit receipt</a>`);
  }

  return lines.join('\n');
}

async function sendMessage(chatId: string, text: string): Promise<void> {
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

export async function notifySignal(
  decoded: DecodedSignalUpdated,
  meta?: { epoch?: string; timestamp?: number },
): Promise<void> {
  if (!isEnabled()) return;

  try {
    const shouldSend = await tryRecordSent(
      decoded.vault,
      decoded.reasoningHash,
      decoded.signalHash,
    );
    if (!shouldSend) {
      logger.info(CTX, `Skipping duplicate signal for vault ${decoded.vault}`);
      return;
    }

    const subscribers = await getSubscribers(decoded.vault);
    if (subscribers.length === 0) {
      logger.info(CTX, `No Telegram subscribers for vault ${decoded.vault}`);
      return;
    }

    const text = buildMessage(decoded, meta);
    const results = await Promise.allSettled(
      subscribers.map((chatId) => sendMessage(chatId, text)),
    );

    let sent = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        sent++;
      } else {
        logger.warn(
          CTX,
          `Failed to notify chat ${subscribers[i]} for vault ${decoded.vault}`,
          result.reason,
        );
      }
    }

    logger.info(
      CTX,
      `Sent signal alert to ${sent}/${subscribers.length} subscribers for vault ${decoded.vault}`,
    );
  } catch (err) {
    logger.error(CTX, 'notifySignal failed', err);
  }
}

export function isTelegramEnabled(): boolean {
  return isEnabled();
}
