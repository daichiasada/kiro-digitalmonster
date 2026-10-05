import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { BattleResult, Difficulty, GrowthStage, MonsterForm } from "@ddm/shared";
import { generateEnemy } from "@ddm/shared";
import { MonsterSprite } from "../assets/monsters/MonsterSprite.tsx";
import { useI18n } from "../i18n.ts";
import {
  DIFFICULTIES,
  battleLogLine,
  busyStatusLabel,
  difficultyLabel,
  hpPercent,
  isLowHp,
  parseBattleEvents,
  pickBattleSeed,
  resolveAnimationEnemy,
  stageLabel,
  winnerLabel,
  type BattleTurnEvent,
} from "../ui-helpers.ts";

export interface BattlePanelProps {
  busy: boolean;
  log: string[];
  result: BattleResult | null;
  /** Fight the chosen difficulty with the chosen seed (threaded to the backend). */
  onBattle: (difficulty: Difficulty, seed: number) => void;
  /** Player's monster name (shown under its sprite). */
  playerName: string;
  /** Player's growth stage; the enemy mirrors it (same stage sprite). */
  playerStageId: GrowthStage;
  /**
   * Player's evolution-branch variant (issue #38), used only for the PLAYER
   * sprite's accent. Defaults to "base" so legacy/base monsters render exactly
   * as before. The generated enemy has no branch, so the enemy sprite always
   * renders "base" regardless of this prop.
   */
  playerForm?: MonsterForm;
  /** Player's max HP, used as the full value of the player's HP bar. */
  playerMaxHp: number;
  /** Player's HP at the start of the bar animation (see App.tsx note). */
  playerStartHp: number;
}

/** How long each turn of the battle is shown before advancing, in ms. */
const STEP_MS = 800;

/** A transient damage popup shown over the combatant that just got hit. */
interface DamagePop {
  side: "player" | "enemy";
  dmg: number;
  key: number;
}

/**
 * Animated battle panel with difficulty selection + enemy preview (issue #41).
 *
 * The player chooses a difficulty (弱い/普通/強い) and the panel previews the
 * EXACT enemy the fight will face by calling the shared `generateEnemy` with
 * the client-chosen seed; the backend regenerates the identical enemy from the
 * same (stage, difficulty, seed), so preview === actual fight. The previewed
 * enemy's real maxHp + localized name drive both the preview block and the #9
 * replay animation (no stage*0.9 reconstruction).
 *
 * The battle is already resolved by the time `result` arrives
 * (useMonster.battle() commits synchronously), so this component only replays
 * the structured log turn-by-turn: attacker lunge, defender hit flash, a damage
 * popup, a smoothly tweening HP bar, and the log revealed one line at a time.
 * The localized winner headline appears after the final turn.
 */
export function BattlePanel({
  busy,
  log,
  result,
  onBattle,
  playerName,
  playerStageId,
  playerForm = "base",
  playerMaxHp,
  playerStartHp,
}: BattlePanelProps) {
  const { lang, t } = useI18n();

  // Player-chosen difficulty (default 普通/normal) and the current battle seed.
  // The seed is regenerated when the difficulty changes OR after each fight so
  // every preview/fight pair gets a fresh enemy.
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [seed, setSeed] = useState<number>(() => pickBattleSeed());

  const handleDifficulty = useCallback((next: Difficulty) => {
    setDifficulty(next);
    // Regenerate the seed so a new preview is shown for the new difficulty.
    setSeed(pickBattleSeed());
  }, []);

  // The previewed enemy: generated with the SHARED generateEnemy so it matches
  // exactly what the backend regenerates from the same (stage, difficulty,
  // seed). Memoized so it only recomputes when those inputs change.
  const enemy = useMemo(
    () => generateEnemy(playerStageId, difficulty, seed),
    [playerStageId, difficulty, seed],
  );

  // Localized enemy display name for the PREVIEW: the
  // battle.enemyNameWithDifficulty template combines the difficulty label and
  // the stage label via i18n (NOT the raw Monster.name, which is the
  // JA-canonical server name).
  const previewName = t("battle.enemyNameWithDifficulty")
    .replace("{difficulty}", difficultyLabel(difficulty, lang))
    .replace("{label}", stageLabel(playerStageId, lang));

  // Snapshot of the enemy that was actually DISPATCHED to fight, captured at
  // fight time. The replay must animate THIS enemy, not the live preview:
  // fightNow() reseeds the preview to a fresh enemy immediately after dispatch
  // (so a repeat fight faces a new foe), which would otherwise recompute the
  // memoized preview to the next enemy BEFORE the fought result/log land and
  // animate, scaling the enemy HP bar against the wrong maxHp. The snapshot is
  // immune to that reseed because it is frozen at dispatch. Null until the
  // first fight is dispatched.
  //
  // We snapshot the fought difficulty + maxHp (NOT a baked-in localized name):
  // the name is re-derived from the snapshot's difficulty in render so a
  // mid-replay language toggle still relocalizes the enemy name, matching the
  // pre-fix behavior where the name tracked the active language.
  const [foughtEnemy, setFoughtEnemy] = useState<
    { difficulty: Difficulty; maxHp: number } | null
  >(null);

  const foughtName =
    foughtEnemy === null
      ? null
      : t("battle.enemyNameWithDifficulty")
          .replace("{difficulty}", difficultyLabel(foughtEnemy.difficulty, lang))
          .replace("{label}", stageLabel(playerStageId, lang));

  // The enemy the #9 replay depicts: the fought snapshot when present, else the
  // live preview (before any fight). resolveAnimationEnemy encodes that
  // precedence as a pure, unit-tested decision so the replay can never scale
  // against a reseeded preview.
  const animationEnemy = resolveAnimationEnemy(
    { name: previewName, maxHp: enemy.stats.maxHp },
    foughtEnemy === null ? null : { name: foughtName ?? previewName, maxHp: foughtEnemy.maxHp },
  );
  const enemyName = animationEnemy.name;
  const enemyMaxHp = animationEnemy.maxHp;

  // Displayed HP for each bar; tweened down by the CSS width transition.
  const [playerHp, setPlayerHp] = useState(playerStartHp);
  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  // Localized log lines revealed so far (grows one per turn).
  const [revealed, setRevealed] = useState<string[]>([]);
  // Which side is currently attacking / being hit (drives motion classes).
  const [active, setActive] = useState<{ attacker: "player" | "enemy"; defender: "player" | "enemy" } | null>(null);
  // Transient damage popup over the defender; keyed so it remounts each turn.
  const [pop, setPop] = useState<DamagePop | null>(null);
  // Winner headline, revealed only after the last turn has played.
  const [winner, setWinner] = useState<BattleResult["winner"] | null>(null);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Identity of the battle currently being animated, so a new result restarts.
  // The language is folded into the identity so switching JA/EN re-plays the
  // log in the newly selected language instead of keeping the stale lines.
  const playingId = useRef<string | null>(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  // Clean up the interval on unmount so no timer leaks.
  useEffect(() => clearTimer, []);

  useEffect(() => {
    if (result === null || log.length === 0) {
      return;
    }
    // Detect a new battle run by log identity so pressing the button again
    // cleanly restarts the animation from turn 1 with fresh HP and empty log.
    // The active language is part of the identity so a language toggle restarts
    // playback and re-localizes the revealed log lines.
    const id = `${lang}\n${log.join("\n")}`;
    if (id === playingId.current) {
      return;
    }
    playingId.current = id;

    const { events } = parseBattleEvents(log);

    // Reset all animation state and start fresh.
    clearTimer();
    setRevealed([]);
    setActive(null);
    setPop(null);
    setWinner(null);
    setPlayerHp(playerStartHp);
    setEnemyHp(enemyMaxHp);

    let i = 0;
    const play = (ev: BattleTurnEvent) => {
      setActive({ attacker: ev.attacker, defender: ev.defender });
      setPop({ side: ev.defender, dmg: ev.dmg, key: ev.turn });
      if (ev.defender === "enemy") {
        setEnemyHp(ev.defenderHpAfter);
      } else {
        setPlayerHp(ev.defenderHpAfter);
      }
      setRevealed((prev) => [
        ...prev,
        battleLogLine(
          `T${ev.turn}: ${ev.attacker === "player" ? playerName : enemyName} hits ${
            ev.defender === "player" ? playerName : enemyName
          } for ${ev.dmg} (${ev.defender} HP ${ev.defenderHpAfter})`,
          lang,
        ),
      ]);
    };

    if (events.length === 0) {
      // No turns to play (defensive): go straight to the winner.
      setWinner(result.winner);
      return;
    }

    // Play the first turn immediately, then advance on an interval.
    play(events[i]);
    i += 1;
    timer.current = setInterval(() => {
      if (i >= events.length) {
        clearTimer();
        setActive(null);
        // Clear the final turn's damage popup so it does not linger over the
        // sprite after the battle ends. With motion the `damage-pop-rise`
        // keyframe already fades it out, but under prefers-reduced-motion the
        // popup is forced opacity:1 with animation:none, so without this it
        // would stay pinned until the next run.
        setPop(null);
        setWinner(result.winner);
        return;
      }
      play(events[i]);
      i += 1;
    }, STEP_MS);

    return clearTimer;
    // enemyMaxHp/enemyName/playerName are derived from stable props/state; the
    // run is keyed off the log identity so we intentionally depend on log +
    // result. lang is included so toggling language re-renders the log in the
    // new language (the run restarts since the revealed lines are rebuilt).
  }, [log, result, playerStartHp, enemyMaxHp, enemyName, playerName, lang]);

  // --- Low-HP pre-fight warning ---------------------------------------------
  // When the player's current HP (recovered from the log as playerStartHp) is
  // low, surface an accessible inline warning + explicit confirm BEFORE
  // fighting; otherwise fight immediately. The confirm reuses the reset-dialog
  // accessibility pattern (role=alertdialog, aria-modal, focus moved to
  // confirm, two-button focus trap, Escape cancels, focus restored on close).
  const [confirmingLowHp, setConfirmingLowHp] = useState(false);
  const fightTriggerRef = useRef<HTMLButtonElement>(null);
  const lowHpConfirmRef = useRef<HTMLButtonElement>(null);
  const lowHpCancelRef = useRef<HTMLButtonElement>(null);

  const fightNow = useCallback(() => {
    // SNAPSHOT the enemy actually being fought BEFORE reseeding, so the #9
    // replay animates (and HP-bar-scales) against this exact enemy even though
    // the preview immediately regenerates to a fresh foe below. We store the
    // fought difficulty + maxHp; the localized name is re-derived in render so
    // a mid-replay language toggle still relocalizes it.
    setFoughtEnemy({ difficulty, maxHp: enemy.stats.maxHp });
    onBattle(difficulty, seed);
    // Fresh seed for the next preview/fight so repeat fights face a new enemy.
    setSeed(pickBattleSeed());
  }, [onBattle, difficulty, seed, enemy.stats.maxHp]);

  const handleFightClick = useCallback(() => {
    if (busy) {
      return;
    }
    if (isLowHp(playerStartHp, playerMaxHp)) {
      setConfirmingLowHp(true);
      return;
    }
    fightNow();
  }, [busy, playerStartHp, playerMaxHp, fightNow]);

  const closeLowHpConfirm = useCallback(() => {
    setConfirmingLowHp(false);
    fightTriggerRef.current?.focus();
  }, []);

  const confirmLowHp = useCallback(() => {
    setConfirmingLowHp(false);
    fightNow();
    fightTriggerRef.current?.focus();
  }, [fightNow]);

  useEffect(() => {
    if (confirmingLowHp) {
      lowHpConfirmRef.current?.focus();
    }
  }, [confirmingLowHp]);

  const handleLowHpKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLowHpConfirm();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      // Two-button focus trap keeping Tab / Shift+Tab between Confirm/Cancel.
      const confirm = lowHpConfirmRef.current;
      const cancel = lowHpCancelRef.current;
      if (confirm === null || cancel === null) {
        return;
      }
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === confirm) {
          event.preventDefault();
          cancel.focus();
        }
      } else if (activeEl === cancel) {
        event.preventDefault();
        confirm.focus();
      }
    },
    [closeLowHpConfirm],
  );

  const playerMotion =
    active === null ? "" : active.attacker === "player" ? "attacking" : active.defender === "player" ? "hit" : "";
  const enemyMotion =
    active === null ? "" : active.attacker === "enemy" ? "attacking" : active.defender === "enemy" ? "hit" : "";

  return (
    <section className="panel battle-panel" aria-label={t("aria.battle")} aria-busy={busy}>
      <h2>
        {t("battle.title")}
        {busy && <span className="busy-spinner" aria-hidden="true" />}
      </h2>
      {/* Lightweight accessible busy feedback for the battle action, mirroring
          CarePanel. The visually-hidden live region announces "処理中…"/"Working…"
          while a battle is in flight; it is separate from the #9 playback
          animation / result / log below so the two never interfere. */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {busy ? busyStatusLabel(lang) : ""}
      </span>

      {/* Difficulty selector: a radio group (role=radiogroup) of toggle
          buttons. Each button reports aria-checked and is keyboard reachable;
          selecting a difficulty regenerates the seed and updates the preview
          live. */}
      <div
        className="difficulty-select"
        role="radiogroup"
        aria-label={t("difficulty.label")}
      >
        <span className="difficulty-label" id="difficulty-label">
          {t("difficulty.label")}
        </span>
        <div className="difficulty-options">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              className={`difficulty-btn${difficulty === d ? " active" : ""}`}
              role="radio"
              aria-checked={difficulty === d}
              disabled={busy}
              onClick={() => handleDifficulty(d)}
            >
              {difficultyLabel(d, lang)}
            </button>
          ))}
        </div>
      </div>

      {/* Enemy preview: the SAME enemy the backend will regenerate from the
          chosen (stage, difficulty, seed). Shows the localized display name,
          the stage sprite, the difficulty, and the enemy stats. */}
      <div className="battle-preview" aria-label={t("battle.preview")}>
        <span className="battle-preview-title">{t("battle.preview")}</span>
        <div className="battle-preview-body">
          <div className="battle-preview-sprite" aria-hidden="true">
            <MonsterSprite stageId={playerStageId} size={88} form={playerForm} />
          </div>
          <div className="battle-preview-info">
            <span className="battle-preview-name">{previewName}</span>
            <span className="battle-preview-difficulty">
              {t("difficulty.label")}: {difficultyLabel(difficulty, lang)}
            </span>
            <span className="battle-preview-stats">
              {t("stats.hp")} {enemy.stats.maxHp} / {t("stats.atk")} {enemy.stats.atk} / {t("stats.def")} {enemy.stats.def}
            </span>
          </div>
        </div>
      </div>

      <button
        ref={fightTriggerRef}
        type="button"
        className="battle-btn"
        onClick={handleFightClick}
        disabled={busy}
      >
        {t("battle.start")}
      </button>

      {confirmingLowHp && (
        <div
          className="low-hp-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={t("battle.lowHpWarning")}
          onKeyDown={handleLowHpKeyDown}
        >
          <p className="low-hp-confirm-text">{t("battle.lowHpWarning")}</p>
          <div className="low-hp-confirm-actions">
            <button
              ref={lowHpConfirmRef}
              type="button"
              className="battle-btn confirm"
              onClick={confirmLowHp}
            >
              {t("battle.lowHpConfirm")}
            </button>
            <button
              ref={lowHpCancelRef}
              type="button"
              className="low-hp-cancel-btn"
              onClick={closeLowHpConfirm}
            >
              {t("battle.lowHpCancel")}
            </button>
          </div>
        </div>
      )}

      {result !== null && (
        <>
          <div className="battle-stage" aria-hidden="true">
            <div className={`combatant player ${playerMotion}`}>
              <div className="combatant-sprite">
                <MonsterSprite stageId={playerStageId} size={110} form={playerForm} />
                {pop !== null && pop.side === "player" && (
                  <span key={`p-${pop.key}`} className="damage-pop">
                    -{pop.dmg}
                  </span>
                )}
              </div>
              <span className="combatant-name">{playerName}</span>
              <div className="battle-hp">
                <div className="battle-hp-fill" style={{ width: `${hpPercent(playerHp, playerMaxHp)}%` }} />
              </div>
            </div>

            <span className="battle-vs">VS</span>

            <div className={`combatant enemy ${enemyMotion}`}>
              <div className="combatant-sprite">
                <MonsterSprite stageId={playerStageId} size={96} />
                {pop !== null && pop.side === "enemy" && (
                  <span key={`e-${pop.key}`} className="damage-pop">
                    -{pop.dmg}
                  </span>
                )}
              </div>
              <span className="combatant-name">{enemyName}</span>
              <div className="battle-hp">
                <div className="battle-hp-fill" style={{ width: `${hpPercent(enemyHp, enemyMaxHp)}%` }} />
              </div>
            </div>
          </div>

          {winner !== null && (
            <p className={`battle-result ${winner}`}>{winnerLabel(winner, lang)}</p>
          )}
        </>
      )}

      {revealed.length > 0 && (
        <ol className="battle-log">
          {revealed.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default BattlePanel;
