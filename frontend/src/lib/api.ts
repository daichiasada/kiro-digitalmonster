/**
 * Typed fetch client for the digital-monster backend.
 *
 * The backend base URL comes from `import.meta.env.VITE_API_BASE_URL` (set at
 * build time, e.g. the API Gateway stage URL). Every request carries the
 * localStorage-generated `clientId` so the server can key persistence by
 * browser (no auth).
 */
import type { Monster, Stage } from '@digital-monster/shared';

import { getClientId } from './clientId';

const BASE_URL: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/** Shape returned by POST /train (monster plus whether it just evolved). */
export interface TrainResult extends Monster {
  evolved: boolean;
}

/** Shape returned by POST /chat. */
export interface ChatResult {
  reply: string;
  stage: Stage;
  conversationDisabled: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${init?.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}

/** Load the current monster for this browser (initialized BABY if none saved). */
export function getMonster(): Promise<Monster> {
  const clientId = getClientId();
  return request<Monster>(`/monster?clientId=${encodeURIComponent(clientId)}`);
}

/** Persist the monster. */
export function saveMonster(monster: Monster): Promise<Monster> {
  const clientId = getClientId();
  return request<Monster>('/monster', {
    method: 'POST',
    body: JSON.stringify({ ...monster, clientId }),
  });
}

/** Run a training session; may evolve the monster. */
export function trainMonster(): Promise<TrainResult> {
  const clientId = getClientId();
  return request<TrainResult>('/train', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  });
}

/** Send a chat message. For 幼年期 the backend returns conversationDisabled. */
export function chat(message: string): Promise<ChatResult> {
  const clientId = getClientId();
  return request<ChatResult>('/chat', {
    method: 'POST',
    body: JSON.stringify({ clientId, message }),
  });
}
