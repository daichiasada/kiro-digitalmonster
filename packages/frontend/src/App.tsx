import { useCallback, useEffect, useRef, useState } from "react";
import { useMonster } from "./state/useMonster.ts";
import { careEffect, type CareAction } from "./ui-helpers.ts";
import { MonsterSprite } from "./assets/monsters/MonsterSprite.tsx";
import { StatsPanel } from "./components/StatsPanel.tsx";
import { CarePanel } from "./components/CarePanel.tsx";
import { BattlePanel } from "./components/BattlePanel.tsx";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { EvolutionBanner } from "./components/EvolutionBanner.tsx";

/** Root game screen wiring the state hook to the UI panels. */
export function App() {
  const game = useMonster();

  // Transient "last care action" signal used to drive a short, non-blocking
  // overlay animation over the sprite. The counter forces React to remount the
  // overlay so repeating the SAME action re-fires its animation.
  const [careFx, setCareFx] = useState<{ action: CareAction; key: number } | null>(null);
  const fxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFxTimer = useCallback(() => {
    if (fxTimer.current !== null) {
      clearTimeout(fxTimer.current);
      fxTimer.current = null;
    }
  }, []);

  // Clean up any pending timer on unmount so no timer leaks.
  useEffect(() => clearFxTimer, [clearFxTimer]);

  const triggerCareFx = useCallback(
    (action: CareAction, run: () => void) => {
      // Only play the cue when the underlying care action can actually run.
      // `runCareAction` no-ops when the monster is null or an action is already
      // in flight (busy), so playing the FX unconditionally would show a cue for
      // an action that was dropped. Keep the visual honest by gating on the
      // same conditions.
      if (game.monster === null || game.busy) {
        return;
      }
      setCareFx((prev) => ({ action, key: (prev?.key ?? 0) + 1 }));
      clearFxTimer();
      // Fallback clear in case onAnimationEnd never fires (e.g. reduced motion).
      fxTimer.current = setTimeout(() => {
        setCareFx(null);
        fxTimer.current = null;
      }, careEffect(action).durationMs + 50);
      run();
    },
    [clearFxTimer, game.busy, game.monster],
  );

  const handleFeed = useCallback(() => triggerCareFx("feed", game.feed), [triggerCareFx, game.feed]);
  const handleTrain = useCallback(() => triggerCareFx("train", game.train), [triggerCareFx, game.train]);
  // The sleep button is a toggle (睡眠 ⇄ 起こす); show the cue that matches the
  // branch taken so waking never shows the 💤 sleep bubble.
  const handleSleep = useCallback(
    () => triggerCareFx(game.monster?.isSleeping ? "wake" : "sleep", game.sleep),
    [triggerCareFx, game.sleep, game.monster],
  );
  const handleClean = useCallback(() => triggerCareFx("clean", game.clean), [triggerCareFx, game.clean]);

  const handleFxEnd = useCallback(() => {
    clearFxTimer();
    setCareFx(null);
  }, [clearFxTimer]);

  return (
    <div className="app">
      <header className="app-header">
        <h1>デジタルモンスター育成</h1>
      </header>

      <EvolutionBanner stageId={game.justEvolvedTo} onDismiss={game.dismissEvolution} />

      {game.error !== null && <p className="app-error" role="alert">{game.error}</p>}

      {game.loading ? (
        <p className="loading">読み込み中…</p>
      ) : game.monster === null ? (
        <p className="loading">モンスターを準備できませんでした。</p>
      ) : (
        <main className="game-grid">
          <div className="stage-area">
            <div
              className={`sprite-wrap ${game.monster.isSleeping ? "sleeping" : ""}`}
            >
              {/* Keyed on the FX counter so the bounce remounts and re-fires on
                  every action, including rapid repeats of the same button
                  (a persistent class would not restart the finished animation). */}
              <div
                key={careFx?.key ?? "idle"}
                className={`sprite-bounce-layer ${careFx !== null ? "reacting" : ""}`}
              >
                <MonsterSprite stageId={game.monster.stageId} size={200} />
              </div>
              {game.monster.isSleeping && <span className="zzz" aria-hidden="true">💤</span>}
              {game.monster.dirty && <span className="dirt" aria-hidden="true">💢</span>}
              {careFx !== null && (
                <span
                  key={careFx.key}
                  className={`care-fx ${careEffect(careFx.action).className}`}
                  aria-hidden="true"
                  onAnimationEnd={handleFxEnd}
                >
                  {careEffect(careFx.action).emoji}
                </span>
              )}
            </div>
            <StatsPanel monster={game.monster} />
          </div>

          <div className="controls-area">
            <CarePanel
              monster={game.monster}
              busy={game.busy}
              onFeed={handleFeed}
              onTrain={handleTrain}
              onSleep={handleSleep}
              onClean={handleClean}
            />
            <BattlePanel
              busy={game.busy}
              log={game.battleLog}
              result={game.lastBattle}
              onBattle={game.battle}
            />
            <ChatPanel
              stageId={game.monster.stageId}
              log={game.chatLog}
              pending={game.chatPending}
              onSend={game.sendChat}
            />
          </div>
        </main>
      )}

      <footer className="app-footer">
        <small>進化条件: トレーニング回数 ＋ 経過時間 ／ セーブは自動です</small>
      </footer>
    </div>
  );
}

export default App;
