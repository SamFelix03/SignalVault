import { randomBytes } from 'crypto';
import { getAddress } from 'viem';
import { getSupabase } from '../config/supabase';
import { logger } from '../utils/logger';

const CTX = 'TelegramLinkStore';
const TOKEN_TTL_MS = 15 * 60 * 1000;

export interface LinkToken {
  token: string;
  vault: string;
  expiresAt: string;
  chatId?: string;
  username?: string;
  firstName?: string;
  completedAt?: string;
}

function normalizeVault(vault: string): string {
  return getAddress(vault);
}

function generateToken(): string {
  return `sv${randomBytes(6).toString('hex')}`;
}

export async function createLinkToken(vault: string): Promise<LinkToken> {
  const vaultAddress = normalizeVault(vault);
  const token = generateToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  const { error } = await getSupabase().from('telegram_link_tokens').insert({
    token,
    vault_address: vaultAddress,
    expires_at: expiresAt,
  });

  if (error) {
    logger.error(CTX, 'createLinkToken failed', error);
    throw new Error(error.message);
  }

  return { token, vault: vaultAddress, expiresAt };
}

export async function getLinkToken(token: string): Promise<LinkToken | null> {
  const { data, error } = await getSupabase()
    .from('telegram_link_tokens')
    .select('token, vault_address, expires_at, chat_id, username, first_name, completed_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    logger.error(CTX, 'getLinkToken failed', error);
    throw new Error(error.message);
  }

  if (!data) return null;

  return {
    token: data.token,
    vault: data.vault_address,
    expiresAt: data.expires_at,
    chatId: data.chat_id ?? undefined,
    username: data.username ?? undefined,
    firstName: data.first_name ?? undefined,
    completedAt: data.completed_at ?? undefined,
  };
}

export async function completeLinkToken(
  token: string,
  chatId: string,
  username?: string,
  firstName?: string,
): Promise<LinkToken | null> {
  const existing = await getLinkToken(token);
  if (!existing) return null;
  if (existing.completedAt) return existing;
  if (new Date(existing.expiresAt).getTime() < Date.now()) return null;

  const completedAt = new Date().toISOString();
  const { error } = await getSupabase()
    .from('telegram_link_tokens')
    .update({
      chat_id: String(chatId),
      username: username ?? null,
      first_name: firstName ?? null,
      completed_at: completedAt,
    })
    .eq('token', token)
    .is('completed_at', null);

  if (error) {
    logger.error(CTX, 'completeLinkToken failed', error);
    throw new Error(error.message);
  }

  return {
    ...existing,
    chatId: String(chatId),
    username,
    firstName,
    completedAt,
  };
}
