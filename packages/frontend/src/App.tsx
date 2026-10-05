import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { evolutionProgress } from "@ddm/shared";
import { useMonster } from "./state/useMonster.ts";
import { useI18n } from "./i18n.ts";
import {
  babySpeechText,
  canChat,
  careEffect,
  isHungerCaution,
  latestMonsterReply,
  playerStartHpFromLog,
  readOnboarded,
  shouldShowOnboarding,
  writeOnboarded,
  type CareAction,
} from "./ui-helpers.ts";
import { MonsterSprite } from "./assets/monsters/MonsterSprite.tsx";
import { StatsPanel } from "./components/StatsPanel.tsx";
import { NameDialog } from "./components/NameDialog.tsx";
import { CarePanel } from "./components/CarePanel.tsx";
import { BattlePanel } from "./components/BattlePanel.tsx";
import { ChatPanel } from "./components/ChatPanel.tsx";
import { SpeechBubble } from "./components/SpeechBubble.tsx";
import { EvolutionBanner } from "./components/EvolutionBanner.tsx";
import { OnboardingHint } from "./components/OnboardingHint.tsx";

/** Root game screen wiring the state hook to the UI panels. */
export function App() {
  const game = useMonster();
  const { lang, setLang, t } = useI18n();

  // Transient "last care action" signal used to drive a short, non-blocking
  // overlay animation over the sprite. The counter forces React to remount the
  // overlay so repeating the SAME action re-fires its animation.
  const [careFx, setCareFx] = useState<{ action: CareAction; key: number } | null>(null);
  const fxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Two-step confirm for the destructive reset action so a single accidental
  // click cannot wipe progress. First click reveals the prompt; Confirm resets,
  // Cancel dismisses.
  const [confirmingReset, setConfirmingReset] = useState(false);
  const resetDisabled = game.busy || game.loading || game.monster === null;

  // Focus management for the reset confirm dialog (role=alertdialog). On open
  // we move focus to the Confirm button; a simple two-button trap keeps Tab /
  // Shift+Tab cycling between Confirm and Cancel; Escape cancels; and focus is
  // restored to the reset trigger button on close.
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (confirmingReset) {
      // Move focus into the dialog once it is mounted. Prefer Confirm; fall
      // back to Cancel when Confirm is disabled (e.g. a reset already in
      // flight) so focus still lands inside the dialog for the trap/Escape.
      const target = confirmBtnRef.current?.disabled
        ? cancelBtnRef.current
        : confirmBtnRef.current;
      target?.focus();
    }
  }, [confirmingReset]);

  const closeResetConfirm = useCallback(() => {
    setConfirmingReset(false);
    // Restore focus to the trigger so keyboard users are not dropped at the
    // top of the document after the dialog closes.
    resetTriggerRef.current?.focus();
  }, []);

  const handleResetDialogKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeResetConfirm();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      // Two-button focus trap: keep Tab / Shift+Tab cycling between the
      // Confirm and Cancel buttons so focus never leaves the dialog.
      const confirm = confirmBtnRef.current;
      const cancel = cancelBtnRef.current;
      if (confirm === null || cancel === null) {
        return;
      }
      const first = confirm.disabled ? cancel : confirm;
      const last = cancel;
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [closeResetConfirm],
  );

  // Name dialog (issue #36): the first-run variant auto-opens right after a
  // fresh hatch (game.needsName), while the rename variant is opened from the
  // StatsPanel header affordance. Both render the same accessible NameDialog.
  const [nameDialog, setNameDialog] = useState<null | { mode: "firstRun" | "rename" }>(null);
  const renameTriggerRef = useRef<HTMLButtonElement>(null);

  // Auto-open the first-run dialog once the hook signals a fresh hatch. Guard
  // on `nameDialog === null` so we only open it once.
  useEffect(() => {
    if (game.needsName && nameDialog === null) {
      setNameDialog({ mode: "firstRun" });
    }
  }, [game.needsName, nameDialog]);

  const closeNameDialog = useCallback(() => {
    const wasRename = nameDialog?.mode === "rename";
    setNameDialog(null);
    // First-run skip/close keeps the default name but must clear the hook's
    // signal so the dialog does not immediately re-open.
    game.dismissNeedsName();
    // Restore focus to the opener. The rename trigger lives in StatsPanel; the
    // first-run dialog has no persistent opener so focus is left to the browser.
    if (wasRename) {
      renameTriggerRef.current?.focus();
    }
  }, [nameDialog, game.dismissNeedsName]);

  const handleNameSubmit = useCallback(
    (name: string) => {
      void game.rename(name);
      closeNameDialog();
    },
    [game.rename, closeNameDialog],
  );

  const openRenameDialog = useCallback(() => {
    setNameDialog({ mode: "rename" });
  }, []);

  // First-run onboarding hint. Lazy initializer reads localStorage once;
  // dismissing persists the "ddm.onboarded" flag so it never shows again.
  const [onboarded, setOnboarded] = useState(readOnboarded);
  const handleDismissOnboarding = useCallback(() => {
    writeOnboarded();
    setOnboarded(true);
  }, []);

  const handleReset = useCallback(() => {
    void game.reset();
    closeResetConfirm();
  }, [game.reset, closeResetConfirm]);

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
        <div className="header-controls">
          <button
            ref={resetTriggerRef}
            type="button"
            className="reset-btn"
            disabled={resetDisabled}
            onClick={() => setConfirmingReset(true)}
          >
            {t("reset.button")}
          </button>
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
        </div>
      </header>

      {confirmingReset && (
        <div
          className="reset-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={t("reset.button")}
          onKeyDown={handleResetDialogKeyDown}
        >
          <p className="reset-confirm-text">{t("reset.confirmPrompt")}</p>
          <div className="reset-confirm-actions">
            <button
              ref={confirmBtnRef}
              type="button"
              className="reset-btn confirm"
              disabled={resetDisabled}
              onClick={handleReset}
            >
              {t("reset.confirm")}
            </button>
            <button
              ref={cancelBtnRef}
              type="button"
              className="reset-cancel-btn"
              onClick={closeResetConfirm}
            >
              {t("reset.cancel")}
            </button>
          </div>
        </div>
      )}

      {nameDialog !== null && game.monster !== null && (
        <NameDialog
          title={
            nameDialog.mode === "firstRun"
              ? t("name.firstRunTitle")
              : t("name.renameTitle")
          }
          initialName={nameDialog.mode === "rename" ? game.monster.name : ""}
          mode={nameDialog.mode}
          onSubmit={handleNameSubmit}
          onClose={closeNameDialog}
        />
      )}

      <EvolutionBanner stageId={game.justEvolvedTo} onDismiss={game.dismissEvolution} />

      {game.error !== null && <p className="app-error" role="alert">{game.error}</p>}

      {game.loading ? (
        <p className="loading">{t("app.loading")}</p>
      ) : game.monster === null ? (
        <p className="loading">{t("app.loadError")}</p>
      ) : (
        <main className="game-grid">
          <div className="stage-area">
            {shouldShowOnboarding(onboarded, game.monster !== null) && (
              <OnboardingHint
                prog={evolutionProgress(game.monster, Date.now())}
                onDismiss={handleDismissOnboarding}
              />
            )}
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
              {game.monster.isSleeping && (
                <span className="zzz" role="img" aria-label={t("badge.sleeping")} title={t("badge.sleeping")}>
                  💤
                </span>
              )}
              {game.monster.dirty && (
                <span className="dirt" role="img" aria-label={t("badge.dirty")} title={t("badge.dirty")}>
                  💢
                </span>
              )}
              {isHungerCaution(game.monster.hungryLevel) && (
                <span
                  className="hunger-badge caution"
                  role="img"
                  aria-label={t("badge.hungry")}
                  title={t("badge.hungry")}
                >
                  🍖
                </span>
              )}
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
            <ChatPanel
              stageId={game.monster.stageId}
              log={game.chatLog}
              pending={game.chatPending}
              onSend={game.sendChat}
            />
          </div>

          <div className="controls-area">
            <StatsPanel
              monster={game.monster}
              onRename={openRenameDialog}
              renameButtonRef={renameTriggerRef}
            />
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
