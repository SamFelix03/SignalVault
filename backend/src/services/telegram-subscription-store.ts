import { getAddress, type Address } from 'viem';
import { getSupabase } from '../config/supabase';
import { logger } from '../utils/logger';

const CTX = 'TelegramSubscriptionStore';

export interface TelegramSubscription {
  chatId: string;
  vault: string;
  username?: string;
  subscribedAt: string;
}

function normalizeVault(vault: string): string {
  return getAddress(vault);
}

export async function subscribe(
  chatId: string,
  vault: string,
  username?: string,
): Promise<void> {
  const vaultAddress = normalizeVault(vault);
  const { error } = await getSupabase()
    .from('telegram_subscriptions')
    .upsert(
      {
        chat_id: String(chatId),
        vault_address: vaultAddress,
        username: username ?? null,
        subscribed_at: new Date().toISOString(),
      },
      { onConflict: 'chat_id,vault_address' },
    );

  if (error) {
    logger.error(CTX, 'subscribe failed', error);
    throw new Error(error.message);
  }
}

export async function unsubscribe(chatId: string, vault: string): Promise<void> {
  const vaultAddress = normalizeVault(vault);
  const { error } = await getSupabase()
    .from('telegram_subscriptions')
    .delete()
    .eq('chat_id', String(chatId))
    .eq('vault_address', vaultAddress);

  if (error) {
    logger.error(CTX, 'unsubscribe failed', error);
    throw new Error(error.message);
  }
}

export async function isSubscribed(chatId: string, vault: string): Promise<boolean> {
  const vaultAddress = normalizeVault(vault);
  const { data, error } = await getSupabase()
    .from('telegram_subscriptions')
    .select('id')
    .eq('chat_id', String(chatId))
    .eq('vault_address', vaultAddress)
    .maybeSingle();

  if (error) {
    logger.error(CTX, 'isSubscribed failed', error);
    throw new Error(error.message);
  }

  return Boolean(data);
}

export async function getSubscribers(vault: string): Promise<string[]> {
  const vaultAddress = normalizeVault(vault);
  const { data, error } = await getSupabase()
    .from('telegram_subscriptions')
    .select('chat_id')
    .eq('vault_address', vaultAddress);

  if (error) {
    logger.error(CTX, 'getSubscribers failed', error);
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => String(row.chat_id));
}

export async function getVaultsForChat(chatId: string): Promise<TelegramSubscription[]> {
  const { data, error } = await getSupabase()
    .from('telegram_subscriptions')
    .select('chat_id, vault_address, username, subscribed_at')
    .eq('chat_id', String(chatId));

  if (error) {
    logger.error(CTX, 'getVaultsForChat failed', error);
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    chatId: String(row.chat_id),
    vault: String(row.vault_address),
    username: row.username ?? undefined,
    subscribedAt: String(row.subscribed_at),
  }));
}

/** Returns true if this signal was newly recorded (should send). False if already sent. */
export async function tryRecordSent(
  vault: Address | string,
  reasoningHash: string,
  signalHash?: string,
): Promise<boolean> {
  const vaultAddress = normalizeVault(vault);
  const hash = reasoningHash.toLowerCase();

  if (
    !hash ||
    hash === '0x0000000000000000000000000000000000000000000000000000000000000000'
  ) {
    return true;
  }

  const { error } = await getSupabase().from('telegram_sent_signals').insert({
    vault_address: vaultAddress,
    reasoning_hash: hash,
    signal_hash: signalHash ?? null,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    if (error.code === '23505') {
      return false;
    }
    logger.error(CTX, 'tryRecordSent failed', error);
    throw new Error(error.message);
  }

  return true;
}
