import { useCallback, useEffect, useRef, useState } from "react";
import { useMonster } from "./state/useMonster.ts";
import { useI18n } from "./i18n.ts";
import {
  babySpeechText,
  canChat,
  careEffect,
  latestMonsterReply,
  playerStartHpFromLog,
  type CareAction,
} from "./ui-helpers.ts";
import { MonsterSprite } from "./assets/monsters/MonsterSprite.tsx";
import { StatsPanel } from "./components/StatsPanel.tsx";
import { CarePanel } from "./components/CarePanel.tsx";
import { BattlePanel } from "./components/BattlePanel.tsx";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { SpeechBubble } from "./components/SpeechBubble.tsx";
import { EvolutionBanner } from "./components/EvolutionBanner.tsx";

/** Root game screen wiring the state hook to the UI panels. */
export function App() {
  const game = useMonster();
  const { lang, setLang, t } = useI18n();

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
        <h1>{t("app.title")}</h1>
        <div className="lang-toggle" role="group" aria-label="Language">
          <button
            type="button"
            className={`lang-btn${lang === "ja" ? " active" : ""}`}
            aria-pressed={lang === "ja"}
            onClick={() => setLang("ja")}
          >
            JA
          </button>
          <button
            type="button"
            className={`lang-btn${lang === "en" ? " active" : ""}`}
            aria-pressed={lang === "en"}
            onClick={() => setLang("en")}
          >
            EN
          </button>
        </div>
      </header>

      <EvolutionBanner stageId={game.justEvolvedTo} onDismiss={game.dismissEvolution} />

      {game.error !== null && <p className="app-error" role="alert">{game.error}</p>}

      {game.loading ? (
        <p className="loading">{t("app.loading")}</p>
      ) : game.monster === null ? (
        <p className="loading">{t("app.loadError")}</p>
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
                key={careFx === null ? "idle" : `fx-${careFx.key}`}
                className={`sprite-bounce-layer ${careFx !== null ? "reacting" : ""}`}
              >
                <MonsterSprite stageId={game.monster.stageId} size={200} />
              </div>
              {/* Latest spoken reply shown as a bubble over the sprite. For a
                  baby (幼年期) the monster can't chat, so surface the canned
                  non-verbal cue WITHOUT sending a request (and never pending);
                  otherwise mirror the live chat state. */}
              <SpeechBubble
                text={canChat(game.monster.stageId) ? latestMonsterReply(game.chatLog) : babySpeechText(lang)}
                pending={canChat(game.monster.stageId) ? game.chatPending : false}
              />
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
              playerName={game.monster.name}
              playerStageId={game.monster.stageId}
              playerMaxHp={game.monster.stats.maxHp}
              // useMonster.battle() commits the UPDATED (post-battle) monster, so
              // game.monster.stats.hp is already the END HP once the result lands
              // and is NOT a reliable pre-battle value. The sim starts from the
              // player's CURRENT HP (often below max for a damaged-but-alive
              // monster), so starting the bar at full would snap on the first
              // enemy hit (or stay wrong if the player is never hit). Recover the
              // true pre-battle HP from the log: the first player-defender event
              // gives defenderHpAfter + dmg; fall back to full only when the
              // player is never hit. See playerStartHpFromLog.
              playerStartHp={playerStartHpFromLog(game.battleLog, game.monster.stats.maxHp)}
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
        <small>{t("app.footer")}</small>
      </footer>
    </div>
  );
}

export default App;
