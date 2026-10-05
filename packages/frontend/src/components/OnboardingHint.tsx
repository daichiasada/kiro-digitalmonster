import type { EvolutionProgress } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import { onboardingCta } from "../ui-helpers.ts";

export interface OnboardingHintProps {
  /** Current evolution progress, used to build the call-to-action line. */
  prog: EvolutionProgress;
  onDismiss: () => void;
}

/**
 * Unobtrusive first-run hint telling the player what to do first. Mirrors the
 * understated EvolutionBanner pattern (role="status", light markup, a close
 * button) rather than a heavy modal overlay.
 */
export function OnboardingHint({ prog, onDismiss }: OnboardingHintProps) {
  const { lang, t } = useI18n();
  return (
    <div className="onboarding-hint" role="status">
      <span className="onboarding-icon" aria-hidden="true">💡</span>
      <div className="onboarding-text">
        <p className="onboarding-title">{t("onboarding.title")}</p>
        <p className="onboarding-body">{t("onboarding.body")}</p>
        <p className="onboarding-cta">{onboardingCta(prog, lang)}</p>
      </div>
      <button
        type="button"
        className="onboarding-close"
        onClick={onDismiss}
        aria-label={t("onboarding.dismiss")}
      >
        ×
      </button>
    </div>
  );
}

export default OnboardingHint;
