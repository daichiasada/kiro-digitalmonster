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
  gainAffectionFromChat,
  getStage,
  isValidMonsterName,
  normalizeAffection,
  normalizeMonsterName,
  pet as petLogic,
  sleep as sleepLogic,
  train as trainLogic,
  wake as wakeLogic,
} from "@ddm/shared";
import * as api from "../api.ts";
import { getOrCreateMonsterId } from "../api.ts";
import {
  canPet,
  nextPetRecord,
  petsRemaining as computePetsRemaining,
  readPetRecord,
  readPetRecordRaw,
  writePetRecord,
} from "../ui-helpers.ts";
import { t, useI18n } from "../i18n.ts";

/** How often (ms) to re-apply time passage so hunger/age tick live. */
const TIME_TICK_MS = 15_000;

/**
 * Default name given to a freshly hatched baby. Shared by BOTH the mount hatch
 * and {@link UseMonsterState.reset} so the two paths can never drift.
 */
export const DEFAULT_MONSTER_NAME = "でじたん";

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
  /**
   * Pet (なでる) the monster, raising affection via the shared `pet()` logic.
   * No-ops once the per-day cap is reached (see {@link UseMonsterState.petsRemaining}).
   */
  pet: () => Promise<void>;
  /** Pets remaining today under the per-day cap; recomputed after each pet. */
  petsRemaining: number;
  battle: () => Promise<void>;
  sendChat: (message: string) => Promise<void>;
  dismissEvolution: () => void;
  /** Reset the current monster back to a fresh baby egg under the same id. */
  reset: () => Promise<void>;
  /**
   * True right after a brand-new monster is hatched (the getMonster 404 path),
   * signalling the UI to auto-open the first-run name dialog. Cleared by
   * {@link UseMonsterState.rename} or {@link UseMonsterState.dismissNeedsName}.
   */
  needsName: boolean;
  /** Clear the {@link UseMonsterState.needsName} first-run signal (e.g. skip). */
  dismissNeedsName: () => void;
  /** Normalize + validate a new name, commit it optimistically, and persist. */
  rename: (name: string) => Promise<void>;
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
  // normalizeAffection backfills AFFECTION_INITIAL for legacy (pre-#42) saves
  // that lack an affection field, so the live state always has a numeric
  // affection for the UI gauge. It is cheap + idempotent (FEAT-001).
  return normalizeAffection(applyTimePassage(monster, now));
}

export function useMonster(): UseMonsterState {
  const { lang } = useI18n();
  const [monster, setMonster] = useState<Monster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justEvolvedTo, setJustEvolvedTo] = useState<GrowthStage | null>(null);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [lastBattle, setLastBattle] = useState<BattleResult | null>(null);
  const [chatLog, setChatLog] = useState<ChatLine[]>([]);
  const [chatPending, setChatPending] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  // Pets remaining today under the per-day cap. Initialized from localStorage
  // so the limit persists across reloads; recomputed after each pet.
  const [petsRemaining, setPetsRemaining] = useState<number>(() =>
    computePetsRemaining(readPetRecord(readPetRecordRaw(), Date.now()), Date.now()),
  );

  // Mutable ref so action callbacks always see the latest monster without
  // being re-created on every render.
  const monsterRef = useRef<Monster | null>(null);
  const prevStageRef = useRef<GrowthStage | null>(null);

  // Mirror the active UI language into a ref so sendChat (a useCallback) always
  // sends the current language without being re-created on every lang change.
  const langRef = useRef(lang);
  langRef.current = lang;

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
        let hatchedFresh = false;
        if (loaded === null) {
          // Hatch a new egg locally and persist it. Flag the fresh hatch so the
          // UI can auto-open the first-run name dialog once mounted.
          hatchedFresh = true;
          const hatchling = createMonster(monsterId, DEFAULT_MONSTER_NAME, now);
          loaded = await api.saveMonster(hatchling).catch(() => hatchling);
        }
        const advanced = advance(loaded, now);
        if (cancelled) {
          return;
        }
        if (hatchedFresh) {
          setNeedsName(true);
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

  /**
   * Pet (なでる) the monster. The shared `pet()` action is intentionally
   * uncapped, so the per-day cap is enforced HERE via a localStorage-backed
   * counter: when the day's cap is reached we no-op (affection never rises past
   * the cap). Otherwise we optimistically apply pet() (commit -> saveMonster ->
   * commit, mirroring runCareAction), persist the incremented pet record, and
   * recompute petsRemaining into state so the UI stays in sync. Guards on busy.
   */
  const pet = useCallback(async () => {
    const current = monsterRef.current;
    if (current === null || busy) {
      return;
    }
    const now = Date.now();
    const record = readPetRecord(readPetRecordRaw(), now);
    if (!canPet(record, now)) {
      // Keep state honest with storage even on a no-op (e.g. a new day reset).
      setPetsRemaining(computePetsRemaining(record, now));
      return;
    }
    setBusy(true);
    setError(null);
    const optimistic = petLogic(current, now);
    commit(optimistic);
    // Persist the per-day counter immediately so the cap survives reloads even
    // if the save round-trip fails.
    const advanced = nextPetRecord(record, now);
    writePetRecord(advanced);
    setPetsRemaining(computePetsRemaining(advanced, now));
    try {
      const saved = await api.saveMonster(optimistic);
      commit(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }, [busy, commit]);

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
          lang: langRef.current,
        });
        setChatLog((log) => [
          ...log,
          { role: "monster", text: res.reply, modelId: res.modelId },
        ]);
        // A successful (non-baby) chat deepens the bond: raise affection by
        // AFFECTION_GAIN_CHAT via the shared helper, then persist. Read the
        // latest monster from the ref so we don't clobber concurrent updates.
        const latest = monsterRef.current;
        if (latest !== null) {
          const bumped = gainAffectionFromChat(latest, Date.now());
          commit(bumped);
          api.saveMonster(bumped).catch(() => undefined);
        }
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
    [chatPending, commit],
  );

  const dismissEvolution = useCallback(() => setJustEvolvedTo(null), []);

  const dismissNeedsName = useCallback(() => setNeedsName(false), []);

  /**
   * Rename the current monster. Normalizes + validates the input with the
   * shared helpers (invalid input is ignored defensively), commits the new
   * name optimistically, then persists via api.saveMonster — mirroring the
   * optimistic -> commit -> save -> commit shape of runCareAction. Clears the
   * first-run `needsName` signal regardless of persistence outcome.
   */
  const rename = useCallback(
    async (name: string) => {
      const current = monsterRef.current;
      if (current === null || busy) {
        return;
      }
      const normalized = normalizeMonsterName(name);
      if (!isValidMonsterName(normalized)) {
        return;
      }
      setNeedsName(false);
      setBusy(true);
      setError(null);
      const next: Monster = {
        ...current,
        name: normalized,
        lastUpdatedAt: Date.now(),
      };
      commit(next);
      try {
        const saved = await api.saveMonster(next);
        commit(saved);
      } catch (err) {
        setError(err instanceof Error ? err.message : "保存に失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [busy, commit],
  );

  /**
   * Reset the monster back to a fresh baby egg under the SAME monster id, then
   * persist it (overwrites the single DynamoDB record via api.saveMonster).
   * Mirrors the optimistic -> commit -> save -> commit shape of runCareAction.
   */
  const reset = useCallback(async () => {
    const current = monsterRef.current;
    if (current === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const fresh = createMonster(current.id, DEFAULT_MONSTER_NAME, Date.now());
    // Going from a later stage back to baby must NOT fire a spurious evolution
    // banner, so align prevStageRef with the fresh baby BEFORE commit() and
    // dismiss any banner currently showing.
    prevStageRef.current = fresh.stageId;
    setJustEvolvedTo(null);
    // Clear transient UI state that belonged to the old monster.
    setBattleLog([]);
    setLastBattle(null);
    setChatLog([]);
    commit(fresh);
    try {
      const saved = await api.saveMonster(fresh);
      commit(saved);
    } catch {
      // Reset is destructive: the fresh baby was committed optimistically but
      // never persisted, so the backend still holds `current`. Roll the UI
      // back to the pre-reset snapshot so a reload won't silently undo a reset
      // the user believes happened; instead the UI reflects reality (the reset
      // did not persist). The transient battle/chat state cleared above stays
      // cleared on rollback (acceptable, it only affects the current session).
      //
      // Align prevStageRef with `current` and keep justEvolvedTo null so
      // re-committing the (later-stage) old monster does NOT fire a spurious
      // evolution banner.
      prevStageRef.current = current.stageId;
      setJustEvolvedTo(null);
      commit(current);
      setError(t(langRef.current, "reset.saveFailed"));
    } finally {
      setBusy(false);
    }
  }, [busy, commit]);

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
    pet,
    petsRemaining,
    battle,
    sendChat,
    dismissEvolution,
    reset,
    needsName,
    dismissNeedsName,
    rename,
  };
}
