/**
 * React hook that owns the monster game state.
 *
 * On mount it:
 *   1. resolves the browser monsterId (localStorage),
 *   2. loads the monster from the backend,
 *   3. if the backend returns 404 (never saved), hatches a NEW baby egg
 *      locally and saves it,
 *   4. applies `applyTimePassage` + `evolveStage` from @ddm/shared so the UI
 *      reflects elapsed time / evolution immediately (optimistic), then
 *      persists if that changed anything.
 *
 * It exposes care actions (feed/train/sleep/clean), battle and chat. Each
 * action optimistically updates the shared pure logic, calls the API, and
 * autosaves.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  BattleResult,
  ChatResponse,
  GrowthStage,
  Monster,
} from "@ddm/shared";
import {
  applyTimePassage,
  clean as cleanLogic,
  createMonster,
  feed as feedLogic,
  getStage,
  sleep as sleepLogic,
  train as trainLogic,
  wake as wakeLogic,
} from "@ddm/shared";
import * as api from "../api.ts";
import { getOrCreateMonsterId } from "../api.ts";

/** How often (ms) to re-apply time passage so hunger/age tick live. */
const TIME_TICK_MS = 15_000;

/** A single chat line for the conversation log. */
export interface ChatLine {
  role: "player" | "monster";
  text: string;
  modelId?: string;
}

export interface UseMonsterState {
  monster: Monster | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  /** Set to the new stage id for a short time right after an evolution. */
  justEvolvedTo: GrowthStage | null;
  battleLog: string[];
  lastBattle: BattleResult | null;
  chatLog: ChatLine[];
  chatPending: boolean;
  feed: () => Promise<void>;
  train: () => Promise<void>;
  sleep: () => Promise<void>;
  clean: () => Promise<void>;
  battle: () => Promise<void>;
  sendChat: (message: string) => Promise<void>;
  dismissEvolution: () => void;
}

/**
 * Apply elapsed-time effects + evolution to a monster snapshot.
 *
 * `applyTimePassage` is the single evolution path: it advances the monster
 * through every stage it now qualifies for (rebasing the stat block via
 * applyEvolution at each step) in a single call. We intentionally do NOT call
 * evolveStage again here; doing so would change stageId without rebasing stats.
 */
function advance(monster: Monster, now: number): Monster {
  return applyTimePassage(monster, now);
}

export function useMonster(): UseMonsterState {
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justEvolvedTo, setJustEvolvedTo] = useState<GrowthStage | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [lastBattle, setLastBattle] = useState<BattleResult | null>(null);
  const [chatLog, setChatLog] = useState<ChatLine[]>([]);
  const [chatPending, setChatPending] = useState(false);

  // Mutable ref so action callbacks always see the latest monster without
  // being re-created on every render.
  const monsterRef = useRef<Monster | null>(null);
  const prevStageRef = useRef<GrowthStage | null>(null);

  const commit = useCallback((next: Monster) => {
    const prevStage = prevStageRef.current;
    if (prevStage !== null && prevStage !== next.stageId) {
      setJustEvolvedTo(next.stageId);
    }
    prevStageRef.current = next.stageId;
    monsterRef.current = next;
    setMonster(next);
  }, []);

  // Initial load / hatch.
  useEffect(() => {
    let cancelled = false;
    const monsterId = getOrCreateMonsterId();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const now = Date.now();
        let loaded = await api.getMonster(monsterId);
        if (loaded === null) {
          // Hatch a new egg locally and persist it.
          const hatchling = createMonster(monsterId, "でじたん", now);
          loaded = await api.saveMonster(hatchling).catch(() => hatchling);
        }
        const advanced = advance(loaded, now);
        if (cancelled) {
          return;
        }
        prevStageRef.current = advanced.stageId;
        monsterRef.current = advanced;
        setMonster(advanced);
        // Persist if time passage / evolution changed anything.
        if (advanced.lastUpdatedAt !== loaded.lastUpdatedAt || advanced.stageId !== loaded.stageId) {
          api.saveMonster(advanced).catch(() => undefined);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "読み込みに失敗しました");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Live time passage ticking (hunger / dirtiness / evolution over time).
  useEffect(() => {
    const timer = setInterval(() => {
      const current = monsterRef.current;
      if (current === null) {
        return;
      }
      const advanced = advance(current, Date.now());
      // Only commit if something actually changed to avoid churn.
      if (
        advanced.stageId !== current.stageId ||
        advanced.hungryLevel !== current.hungryLevel ||
        advanced.dirty !== current.dirty ||
        advanced.stats.hp !== current.stats.hp
      ) {
        commit(advanced);
        if (advanced.stageId !== current.stageId) {
          api.saveMonster(advanced).catch(() => undefined);
        }
      }
    }, TIME_TICK_MS);
    return () => clearInterval(timer);
  }, [commit]);

  /** Run a local pure-logic mutation, then persist to the backend. */
  const runCareAction = useCallback(
    async (mutate: (m: Monster, now: number) => Monster) => {
      const current = monsterRef.current;
      if (current === null || busy) {
        return;
      }
      setBusy(true);
      setError(null);
      const now = Date.now();
      const optimistic = mutate(current, now);
      commit(optimistic);
      try {
        const saved = await api.saveMonster(optimistic);
        commit(saved);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [busy, commit],
  );

  const feed = useCallback(() => runCareAction(feedLogic), [runCareAction]);
  const train = useCallback(() => runCareAction(trainLogic), [runCareAction]);
  const clean = useCallback(() => runCareAction(cleanLogic), [runCareAction]);
  // Sleep toggles: wake if sleeping, else sleep.
  const sleep = useCallback(
    () =>
      runCareAction((m, now) => (m.isSleeping ? wakeLogic(m, now) : sleepLogic(m, now))),
    [runCareAction],
  );

  const battle = useCallback(async () => {
    const current = monsterRef.current;
    if (current === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { result, monster: updated } = await api.battle(current.id);
      commit(updated);
      setLastBattle(result);
      setBattleLog(result.log);
    } catch (err) {
      setError(err instanceof Error ? err.message : "バトルに失敗しました");
    } finally {
      setBusy(false);
    }
  }, [busy, commit]);

  const sendChat = useCallback(
    async (message: string) => {
      const current = monsterRef.current;
      const trimmed = message.trim();
      if (current === null || trimmed === "" || chatPending) {
        return;
      }
      const stage = getStage(current.stageId);
      if (!stage.canChat) {
        return;
      }
      setChatPending(true);
      setError(null);
      setChatLog((log) => [...log, { role: "player", text: trimmed }]);
      try {
        const res: ChatResponse = await api.chat({
          monsterId: current.id,
          stageId: current.stageId,
          monsterName: current.name,
          message: trimmed,
        });
        setChatLog((log) => [
          ...log,
          { role: "monster", text: res.reply, modelId: res.modelId },
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "会話に失敗しました";
        setError(msg);
        setChatLog((log) => [
          ...log,
          { role: "monster", text: "…（うまく返事ができなかったみたい）" },
        ]);
      } finally {
        setChatPending(false);
      }
    },
    [chatPending],
  );

  const dismissEvolution = useCallback(() => setJustEvolvedTo(null), []);

  return {
    monster,
    loading,
    error,
    busy,
    justEvolvedTo,
    battleLog,
    lastBattle,
    chatLog,
    chatPending,
    feed,
    train,
    sleep,
    clean,
    battle,
    sendChat,
    dismissEvolution,
  };
}
