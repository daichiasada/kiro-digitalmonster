import { useEffect, useRef, useState } from "react";
import type { BattleResult, GrowthStage } from "@ddm/shared";
import { getStage } from "@ddm/shared";
import { MonsterSprite } from "../assets/monsters/MonsterSprite.tsx";
import {
  battleLogLineJa,
  hpPercent,
  parseBattleEvents,
  stageLabelJa,
  winnerLabelJa,
  type BattleTurnEvent,
} from "../ui-helpers.ts";

export interface BattlePanelProps {
  busy: boolean;
  log: string[];
  result: BattleResult | null;
  onBattle: () => void;
  /** Player's monster name (shown under its sprite). */
  playerName: string;
  /** Player's growth stage; the enemy mirrors it (same stage sprite). */
  playerStageId: GrowthStage;
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
 * Animated battle panel. The battle is already resolved by the time `result`
 * arrives (useMonster.battle() commits synchronously), so this component only
 * replays the structured log turn-by-turn: attacker lunge, defender hit flash,
 * a damage popup, a smoothly tweening HP bar, and the log revealed one line at
 * a time. The localized winner headline appears after the final turn.
 */
export function BattlePanel({
  busy,
  log,
  result,
  onBattle,
  playerName,
  playerStageId,
  playerMaxHp,
  playerStartHp,
}: BattlePanelProps) {
  // The enemy mirrors the backend (packages/backend/src/handlers/battle.ts):
  // same stageId as the player, maxHp = round(stage.baseStats.maxHp * 0.9),
  // name `野生の{labelJa}モンスター`. getStage is already a frontend dependency.
  const enemyMaxHp = Math.round(getStage(playerStageId).baseStats.maxHp * 0.9);
  const enemyName = `野生の${stageLabelJa(playerStageId)}モンスター`;

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
    const id = log.join("\n");
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
        battleLogLineJa(
          `T${ev.turn}: ${ev.attacker === "player" ? playerName : enemyName} hits ${
            ev.defender === "player" ? playerName : enemyName
          } for ${ev.dmg} (${ev.defender} HP ${ev.defenderHpAfter})`,
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
        setWinner(result.winner);
        return;
      }
      play(events[i]);
      i += 1;
    }, STEP_MS);

    return clearTimer;
    // enemyMaxHp/enemyName/playerName are derived from stable props; the run is
    // keyed off the log identity so we intentionally depend on log + result.
  }, [log, result, playerStartHp, enemyMaxHp, enemyName, playerName]);

  const playerMotion =
    active === null ? "" : active.attacker === "player" ? "attacking" : active.defender === "player" ? "hit" : "";
  const enemyMotion =
    active === null ? "" : active.attacker === "enemy" ? "attacking" : active.defender === "enemy" ? "hit" : "";

  return (
    <section className="panel battle-panel" aria-label="バトル">
      <h2>バトル</h2>
      <button type="button" className="battle-btn" onClick={onBattle} disabled={busy}>
        ⚔️ 野生のモンスターと戦う
      </button>

      {result !== null && (
        <>
          <div className="battle-stage" aria-hidden="true">
            <div className={`combatant player ${playerMotion}`}>
              <div className="combatant-sprite">
                <MonsterSprite stageId={playerStageId} size={110} />
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
            <p className={`battle-result ${winner}`}>{winnerLabelJa(winner)}</p>
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
