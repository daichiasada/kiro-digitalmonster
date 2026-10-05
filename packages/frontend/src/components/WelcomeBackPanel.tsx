import type { AbsenceSummary, CareRecommendation } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import { formatDuration, recommendLabelKey, stageLabel } from "../ui-helpers.ts";

export interface WelcomeBackPanelProps {
  /** The pure diff of what happened while the player was away (issue #40). */
  summary: AbsenceSummary;
  /** The single most useful one-tap care action, from the shared helper. */
  recommendation: CareRecommendation;
  /** Run the recommended care action, then dismiss the panel. */
  onRecommendedAction: () => void;
  /** Dismiss the panel for this session. */
  onClose: () => void;
}

/**
 * "While you were away" / おかえり summary (issue #40).
 *
 * Mirrors the understated {@link import("./OnboardingHint.tsx").OnboardingHint}
 * strip pattern rather than a blocking modal: this is informational, so it uses
 * `role="status"` with a single focusable Close button and NO focus trap. The
 * elapsed-time line is shown first, then one line per change that occurred
 * (hunger / dirty / HP lost / HP recovered while sleeping / evolved); when
 * nothing changed it shows the no-change line. Status cues are never
 * color-only — each line carries text plus an aria-hidden emoji. When a
 * recommended care action exists (recommendation !== "none") a one-tap button
 * runs it; it is omitted for "none". The entrance animation is gated behind
 * `prefers-reduced-motion` in CSS.
 */
export function WelcomeBackPanel({
  summary,
  recommendation,
  onRecommendedAction,
  onClose,
}: WelcomeBackPanelProps) {
  const { lang, t } = useI18n();

  const line = (key: Parameters<typeof t>[0], replacements: Record<string, string>): string => {
    let text = t(key);
    for (const [token, value] of Object.entries(replacements)) {
      text = text.replace(`{${token}}`, value);
    }
    return text;
  };

  const recommendKey = recommendLabelKey(recommendation);

  return (
    <div className="welcome-back" role="status">
      <span className="welcome-back-icon" aria-hidden="true">👋</span>
      <div className="welcome-back-text">
        <p className="welcome-back-title">{t("welcome.title")}</p>
        <p className="welcome-back-elapsed">
          {line("welcome.elapsed", { duration: formatDuration(summary.elapsedMs, lang) })}
        </p>
        <ul className="welcome-back-changes">
          {summary.hasChanges ? (
            <>
              {summary.hungerDelta > 0 && (
                <li>
                  <span aria-hidden="true">🍖</span>{" "}
                  {line("welcome.hunger", { n: String(summary.hungerDelta) })}
                </li>
              )}
              {summary.becameDirty && (
                <li>
                  <span aria-hidden="true">💢</span> {t("welcome.dirty")}
                </li>
              )}
              {summary.hpLostFromStarving > 0 && (
                <li>
                  <span aria-hidden="true">💔</span>{" "}
                  {line("welcome.hpLost", { n: String(summary.hpLostFromStarving) })}
                </li>
              )}
              {summary.hpGainedFromSleeping > 0 && (
                <li>
                  <span aria-hidden="true">💤</span>{" "}
                  {line("welcome.hpRecovered", { n: String(summary.hpGainedFromSleeping) })}
                </li>
              )}
              {summary.evolved && (
                <li>
                  <span aria-hidden="true">✨</span>{" "}
                  {line("welcome.evolved", { stage: stageLabel(summary.toStageId, lang) })}
                </li>
              )}
            </>
          ) : (
            <li>{t("welcome.noChange")}</li>
          )}
        </ul>
        {recommendKey !== null && (
          <button
            type="button"
            className="welcome-back-action"
            onClick={onRecommendedAction}
          >
            {t(recommendKey)}
          </button>
        )}
      </div>
      <button
        type="button"
        className="welcome-back-close"
        onClick={onClose}
        aria-label={t("welcome.close")}
      >
        ×
      </button>
    </div>
  );
}

export default WelcomeBackPanel;
