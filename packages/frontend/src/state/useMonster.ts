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
  AbsenceSummary,
  BattleResult,
  CareRecommendation,
  ChatResponse,
  Difficulty,
  GrowthStage,
  Monster,
} from "@ddm/shared";
import {
  ABSENCE_SUMMARY_THRESHOLD_MS,
  applyTimePassage,
  clean as cleanLogic,
  createMonster,
  feed as feedLogic,
  gainAffectionFromChat,
  getStage,
  isValidMonsterName,
  monsterAppearanceKey,
  normalizeAffection,
  normalizeBattleRecord,
  normalizeForm,
  normalizeMonsterName,
  pet as petLogic,
  recommendCareFromMonster,
  sleep as sleepLogic,
  summarizeAbsence,
  train as trainLogic,
  trimChatHistory,
  wake as wakeLogic,
} from "@ddm/shared";
import type { ChatTurn } from "@ddm/shared";
import * as api from "../api.ts";
import { getOrCreateMonsterId } from "../api.ts";
import {
  canPet,
  clearChatLog,
  nextPetRecord,
  petCapReachedLabel,
  petsRemaining as computePetsRemaining,
  readChatLog,
  readPetRecord,
  readPetRecordRaw,
  readZukan,
  recordMonsterAppearance,
  writeChatLog,
  writePetRecord,
  writeZukan,
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
  /**
   * Transient, non-error notice shown when the player tries to pet after the
   * per-day cap is reached (the pet() no-op). Null when there is nothing to
   * say. Cleared on a successful pet or on a fresh-day reset.
   */
  petNotice: string | null;
  /**
   * Run a battle at the chosen difficulty with the given seed. The BattlePanel
   * owns the difficulty + seed (so the previewed enemy matches the fight) and
   * threads them through to api.battle; the backend regenerates the identical
   * enemy from the same (stage, difficulty, seed).
   */
  battle: (difficulty: Difficulty, seed: number) => Promise<void>;
  sendChat: (message: string) => Promise<void>;
  /**
   * Clear the conversation: wipes both the in-memory {@link chatLog} and the
   * persisted `ddm.chat.<monsterId>` key, so a subsequent reload shows an empty
   * transcript. Less destructive than {@link reset} (the monster is untouched).
   */
  clearChat: () => void;
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
  /**
   * The "while you were away" summary (issue #40), computed ONCE at mount by
   * diffing the loaded (pre-advance) monster against the advanced
   * (post-advance) one, and only when the real absence
   * (now - loaded.lastUpdatedAt) is at least {@link ABSENCE_SUMMARY_THRESHOLD_MS}.
   * `null` when the gap was too short, the monster was freshly hatched, or the
   * panel has been dismissed this session. The 15s TIME_TICK interval never
   * sets this, so later ticks can never re-open the panel.
   */
  welcomeBack: AbsenceSummary | null;
  /**
   * The single most useful one-tap care action for the welcome-back panel,
   * FROZEN at mount from the advanced monster at the same moment the summary is
   * captured. Kept here (rather than re-derived from the live `monster` on
   * every render) so a background 15s TIME_TICK cannot shift the panel's button
   * label while it is open. `null` whenever {@link welcomeBack} is null.
   */
  welcomeBackRecommendation: CareRecommendation | null;
  /**
   * Dismiss the welcome-back summary for THIS session (sets {@link welcomeBack}
   * to null). It does not reappear until the next qualifying load/return, since
   * the summary is only ever recomputed in the mount effect ("閉じるとその回は
   * 再表示しない").
   */
  dismissWelcomeBack: () => void;
  /**
   * Run the FROZEN {@link welcomeBackRecommendation} as a single tap, then
   * dismiss the panel. Maps feed/clean to the matching care action and wake to
   * the sleep toggle (which wakes when asleep); "none"/null only dismisses.
   *
   * The underlying care actions early-return while `busy` (an in-flight save),
   * so this bails WITHOUT dismissing when busy — leaving the panel open so the
   * tap can be retried — and dismisses only after a care action has actually
   * been applied. That way a tap landing during an in-flight save is never
   * silently dropped.
   */
  runWelcomeBackCare: () => Promise<void>;
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
  // normalizeBattleRecord likewise backfills an all-zeros battle record for
  // legacy (pre-#41) saves that lack the field, so the StatsPanel record row
  // always has a numeric record to display. Both helpers are idempotent.
  // normalizeForm likewise backfills "base" for legacy (pre-#38) saves that
  // lack the evolution-branch `form` field, so the sprite + StatsPanel hint
  // always have a concrete form to read. Idempotent, same as the others.
  return normalizeForm(
    normalizeBattleRecord(normalizeAffection(applyTimePassage(monster, now))),
  );
}

/**
 * Record the monster's current appearance (stageId x form) into the persisted
 * zukan when it differs from the last-recorded appearance (tracked in
 * `keyRef`). This is how the collection grows: the fresh baby on first load and
 * each new tier x form as the monster evolves. Fully guarded so it never throws
 * (every storage call in ui-helpers is itself guarded):
 *   - compute the appearance key; bail if unchanged from keyRef,
 *   - read the current zukan, delegate to the shared pure recordAppearance,
 *   - only writeZukan when a NEW entry was added (returned object differs),
 *   - update keyRef so re-encountering the same appearance is a no-op.
 * The shared recordAppearance ignores non-canonical combos and preserves the
 * first-seen snapshot, so re-recording an existing appearance never overwrites.
 */
function recordAppearanceToStorage(
  monster: Monster,
  keyRef: { current: string | null },
  now: number,
): void {
  try {
    const key = monsterAppearanceKey(monster);
    if (key === keyRef.current) {
      return;
    }
    const zukan = readZukan();
    const next = recordMonsterAppearance(zukan, monster, now);
    if (next !== zukan) {
      writeZukan(next);
    }
    keyRef.current = key;
  } catch {
    // Discovery recording is best-effort; never let it break the lifecycle.
  }
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
  // "While you were away" summary (issue #40). Session/hook state only: set
  // ONCE in the mount effect from the loaded-vs-advanced diff, cleared by
  // dismissWelcomeBack. Never touched by the 15s TIME_TICK interval.
  const [welcomeBack, setWelcomeBack] = useState<AbsenceSummary | null>(null);
  // The recommended one-tap care action, FROZEN alongside the summary at mount
  // from the advanced monster. Not re-derived from the live monster, so a 15s
  // TIME_TICK cannot change the button label while the panel is open.
  const [welcomeBackRecommendation, setWelcomeBackRecommendation] =
    useState<CareRecommendation | null>(null);
  // Pets remaining today under the per-day cap. Initialized from localStorage
  // so the limit persists across reloads; recomputed after each pet.
  const [petsRemaining, setPetsRemaining] = useState<number>(() =>
    computePetsRemaining(readPetRecord(readPetRecordRaw(), Date.now()), Date.now()),
  );
  // Transient non-error notice shown when petting is attempted at the daily cap.
  const [petNotice, setPetNotice] = useState<string | null>(null);

  // Mutable ref so action callbacks always see the latest monster without
  // being re-created on every render.
  const monsterRef = useRef<Monster | null>(null);
  const prevStageRef = useRef<GrowthStage | null>(null);
  // Last appearance key (stageId x form) we recorded into the zukan, so we only
  // touch storage when the appearance actually changes (issue #39). Null until
  // the first appearance is recorded on mount.
  const prevAppearanceKeyRef = useRef<string | null>(null);

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
    // Record this appearance into the zukan whenever (stageId x form) changes.
    // commit() runs on every monster change (care, time-tick, evolution,
    // battle, reset), so this captures each new tier x form as it is reached.
    recordAppearanceToStorage(next, prevAppearanceKeyRef, Date.now());
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
        // Welcome-back summary (issue #40): compute the REAL absence from the
        // loaded monster's lastUpdatedAt (its last-visit time) and only build
        // the summary when the player has been away at least the threshold.
        // Skip a freshly hatched monster — a brand-new egg has no absence. This
        // is the ONLY place welcomeBack is set; the 15s TIME_TICK interval must
        // never recompute it (see that effect).
        const absenceMs = Math.max(0, now - loaded.lastUpdatedAt);
        if (!hatchedFresh && absenceMs >= ABSENCE_SUMMARY_THRESHOLD_MS) {
          setWelcomeBack(summarizeAbsence(loaded, advanced));
          // Freeze the one-tap recommendation at the SAME moment, from the
          // advanced (post-advance) monster, so the panel's button label is
          // stable even if a later 15s tick shifts the live monster's state.
          setWelcomeBackRecommendation(recommendCareFromMonster(advanced));
        }
        prevStageRef.current = advanced.stageId;
        monsterRef.current = advanced;
        setMonster(advanced);
        // Restore the persisted chat transcript for THIS monster (issue #37)
        // so a reload re-displays the recent conversation. Keyed per monster id
        // via readChatLog(ddm.chat.<id>); guarded so it never throws.
        setChatLog(readChatLog(advanced.id) as ChatLine[]);
        // The mount path sets state directly (bypassing commit), so record the
        // FIRST appearance here too — this is what captures the fresh/loaded
        // monster (e.g. baby:base) into the zukan on first load (issue #39).
        recordAppearanceToStorage(advanced, prevAppearanceKeyRef, now);
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
  // NOTE (issue #40): this interval intentionally NEVER touches `welcomeBack`.
  // The welcome-back summary is mount-only (the loaded-vs-advanced gap captured
  // above), so these later ticks can never set or re-open the panel.
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
      const remaining = computePetsRemaining(record, now);
      setPetsRemaining(remaining);
      // Surface a non-error notice so hitting the cap is no longer a silent
      // no-op; a fresh-day reset (remaining > 0 after readPetRecord) clears it.
      setPetNotice(remaining <= 0 ? petCapReachedLabel(langRef.current) : null);
      return;
    }
    setBusy(true);
    setError(null);
    // A successful pet clears any lingering cap notice.
    setPetNotice(null);
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

  const battle = useCallback(async (difficulty: Difficulty, seed: number) => {
    const current = monsterRef.current;
    if (current === null || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { result, monster: updated } = await api.battle(current.id, difficulty, seed);
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
      // Build the continuity `history` from the CURRENT transcript (the turns
      // BEFORE this new player message), mapped to ChatTurn {role,text}. We
      // pre-trim client-side with the shared trimChatHistory/MAX_CHAT_TURNS so
      // the client sends at most N turns; the server STILL re-validates and
      // truncates it (issue #37). Snapshot the log via the functional setState
      // so we never read a stale closure value.
      let history: ChatTurn[] = [];
      let afterPlayer: ChatLine[] = [];
      setChatLog((log) => {
        history = trimChatHistory(
          log.map((line) => ({ role: line.role, text: line.text })),
        );
        afterPlayer = [...log, { role: "player", text: trimmed }];
        // Persist the player line immediately so a reload mid-request still
        // shows what was asked.
        writeChatLog(current.id, afterPlayer);
        return afterPlayer;
      });
      try {
        const res: ChatResponse = await api.chat({
          monsterId: current.id,
          stageId: current.stageId,
          monsterName: current.name,
          message: trimmed,
          lang: langRef.current,
          history,
        });
        const afterReply: ChatLine[] = [
          ...afterPlayer,
          { role: "monster", text: res.reply, modelId: res.modelId },
        ];
        setChatLog(afterReply);
        writeChatLog(current.id, afterReply);
        // A successful (non-baby) chat deepens the bond: raise affection by
        // AFFECTION_GAIN_CHAT via the shared helper, then persist. Read the
        // latest monster from the ref so we don't clobber concurrent updates.
        // The save is awaited and reconciled with the server copy, and a
        // failure surfaces an error, mirroring the pet/care paths so a dropped
        // save no longer silently loses the +1 gain. The save is handled in its
        // OWN try/catch so a dropped save does NOT trigger the outer catch's
        // "couldn't reply" line (the reply above already arrived successfully).
        const latest = monsterRef.current;
        if (latest !== null) {
          const bumped = gainAffectionFromChat(latest, Date.now());
          commit(bumped);
          try {
            const saved = await api.saveMonster(bumped);
            commit(saved);
          } catch (saveErr) {
            setError(saveErr instanceof Error ? saveErr.message : "保存に失敗しました");
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "会話に失敗しました";
        setError(msg);
        const afterError: ChatLine[] = [
          ...afterPlayer,
          { role: "monster", text: "…（うまく返事ができなかったみたい）" },
        ];
        setChatLog(afterError);
        writeChatLog(current.id, afterError);
      } finally {
        setChatPending(false);
      }
    },
    [chatPending, commit],
  );

  /**
   * Clear the conversation (issue #37): empty the in-memory transcript AND
   * remove the persisted `ddm.chat.<monsterId>` key so a reload shows nothing.
   * The monster record itself is untouched (unlike {@link reset}). Guarded via
   * clearChatLog, which never throws.
   */
  const clearChat = useCallback(() => {
    setChatLog([]);
    const current = monsterRef.current;
    if (current !== null) {
      clearChatLog(current.id);
    }
  }, []);

  const dismissEvolution = useCallback(() => setJustEvolvedTo(null), []);

  const dismissNeedsName = useCallback(() => setNeedsName(false), []);

  // Close the welcome-back panel for this session. Because the summary is only
  // ever recomputed in the mount effect, clearing it here means it will not
  // reappear this mount (閉じるとその回は再表示しない). The frozen recommendation
  // is cleared alongside it so the two can never be out of sync.
  const dismissWelcomeBack = useCallback(() => {
    setWelcomeBack(null);
    setWelcomeBackRecommendation(null);
  }, []);

  /**
   * Run the frozen welcome-back recommendation in one tap, THEN dismiss.
   *
   * The underlying care actions (feed/clean/sleep) silently early-return while
   * `busy` (an in-flight save), so dismissing unconditionally would close the
   * panel while dropping the player's one intended care. To keep the one tap
   * honest we bail BEFORE touching anything when busy — leaving the panel open
   * so the tap can be retried — and only run+dismiss when a care action can
   * actually apply. A "none"/null recommendation has no care to run and simply
   * dismisses.
   */
  const runWelcomeBackCare = useCallback(async () => {
    if (welcomeBackRecommendation === null || welcomeBackRecommendation === "none") {
      dismissWelcomeBack();
      return;
    }
    // Don't drop the care into an in-flight save: keep the panel open so the
    // player can tap again once the current action settles.
    if (busy) {
      return;
    }
    switch (welcomeBackRecommendation) {
      case "feed":
        await feed();
        break;
      case "clean":
        await clean();
        break;
      case "wake":
        // sleep() is a toggle: it wakes the monster when it is asleep.
        await sleep();
        break;
    }
    dismissWelcomeBack();
  }, [welcomeBackRecommendation, busy, feed, clean, sleep, dismissWelcomeBack]);

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
    // The zukan (ddm.zukan) is INTENTIONALLY left untouched here: reset only
    // rewrites the monster save, never the collection. Because commit() only
    // ADDS appearances (never deletes) and reset writes nothing to the zukan
    // key, the collection survives reset (issue #39 acceptance). The fresh
    // baby re-records baby:base below, which already exists -> a no-op.
    // Going from a later stage back to baby must NOT fire a spurious evolution
    // banner, so align prevStageRef with the fresh baby BEFORE commit() and
    // dismiss any banner currently showing.
    prevStageRef.current = fresh.stageId;
    setJustEvolvedTo(null);
    // Clear transient UI state that belonged to the old monster.
    setBattleLog([]);
    setLastBattle(null);
    setChatLog([]);
    // Reset must also wipe the persisted conversation (issue #37 acceptance):
    // clear the per-monster ddm.chat.<id> key so the fresh baby starts with no
    // transcript on reload. Guarded; never throws.
    clearChatLog(current.id);
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
    petNotice,
    battle,
    sendChat,
    clearChat,
    dismissEvolution,
    reset,
    needsName,
    dismissNeedsName,
    rename,
    welcomeBack,
    welcomeBackRecommendation,
    dismissWelcomeBack,
    runWelcomeBackCare,
  };
}
