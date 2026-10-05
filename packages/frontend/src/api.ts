/**
 * Typed fetch client for the AI Monster backend.
 *
 * API contract (matches packages/backend/src/handlers/*.ts):
 *   GET  {base}/monster/{monsterId}  -> 200 { monster } | 404 if not found
 *   POST {base}/monster  (bare Monster body) -> 200 { ok, monster }
 *   POST {base}/chat     (ChatRequest body)  -> 200 { reply, modelId }
 *   POST {base}/battle   ({ monsterId, difficulty, seed }) -> 200 { result, monster }
 */
import type {
  BattleResult,
  ChatRequest,
  ChatResponse,
  Difficulty,
  Monster,
} from "@ddm/shared";
import { resolveApiBaseUrl } from "./config.ts";

const MONSTER_ID_KEY = "ddm.monsterId";

/** Thrown for non-2xx responses (except GET-monster 404, handled explicitly). */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Get the persisted browser monster id, generating + storing one on first run. */
export function getOrCreateMonsterId(): string {
  const existing = localStorage.getItem(MONSTER_ID_KEY);
  if (existing !== null && existing !== "") {
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(MONSTER_ID_KEY, generated);
  return generated;
}

async function apiUrl(path: string): Promise<string> {
  const base = await resolveApiBaseUrl();
  const suffix = path.startsWith("/") ? path : `/${path}`;
  // When no base URL is configured, fall back to same-origin relative paths.
  return base !== "" ? `${base}${suffix}` : suffix;
}

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (typeof body.error === "string") {
        message = body.error;
      }
    } catch {
      // keep status-line message
    }
    throw new ApiError(res.status, message);
  }
  return (text === "" ? ({} as T) : (JSON.parse(text) as T));
}

/**
 * Load a monster by id. Returns `null` when the backend responds 404 (the
 * monster has not been created yet), so the caller can hatch a new one.
 */
export async function getMonster(monsterId: string): Promise<Monster | null> {
  const url = await apiUrl(`/monster/${encodeURIComponent(monsterId)}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) {
    return null;
  }
  const data = await parseJson<{ monster: Monster }>(res);
  return data.monster;
}

/** Persist a monster. Sends the bare Monster object (backend also accepts an envelope). */
export async function saveMonster(monster: Monster): Promise<Monster> {
  const url = await apiUrl("/monster");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(monster),
  });
  const data = await parseJson<{ ok: boolean; monster: Monster }>(res);
  return data.monster;
}

/** Send a chat message. Returns the model reply + which model answered. */
export async function chat(request: ChatRequest): Promise<ChatResponse> {
  const url = await apiUrl("/chat");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseJson<ChatResponse>(res);
}

/** Result of a battle: the simulation plus the updated (persisted) monster. */
export interface BattleApiResult {
  result: BattleResult;
  monster: Monster;
}

/**
 * Run a battle for the given monster id at the chosen difficulty, using the
 * supplied seed so the backend regenerates the IDENTICAL enemy the frontend
 * previewed (preview === actual fight). See @ddm/shared generateEnemy.
 */
export async function battle(
  monsterId: string,
  difficulty: Difficulty,
  seed: number,
): Promise<BattleApiResult> {
  const url = await apiUrl("/battle");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monsterId, difficulty, seed }),
  });
  return parseJson<BattleApiResult>(res);
}
