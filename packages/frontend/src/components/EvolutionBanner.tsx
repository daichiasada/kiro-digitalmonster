import type { GrowthStage } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import { stageLabel } from "../ui-helpers.ts";

export interface EvolutionBannerProps {
  /** The stage just evolved into, or null when nothing to show. */
  stageId: GrowthStage | null;
  onDismiss: () => void;
}

/** Celebratory banner shown briefly when the monster changes stage. */
export function EvolutionBanner({ stageId, onDismiss }: EvolutionBannerProps) {
  const { lang, t } = useI18n();
  if (stageId === null) {
    return null;
  }
  // Split the localized banner template on the {stage} placeholder so the
  // stage name can be emphasized with <strong> while keeping the surrounding
  // wording per language (JA: 進化した！ {stage} になった！).
  const [before, after] = t("evolution.banner").split("{stage}");
  return (
    <div className="evolution-banner" role="status" onClick={onDismiss}>
      <span className="evo-spark" aria-hidden="true">✨</span>
      <span>
        {before}
        <strong>{stageLabel(stageId, lang)}</strong>
        {after}
      </span>
      <button type="button" className="evo-close" onClick={onDismiss} aria-label={t("evolution.close")}>
        ×
      </button>
    </div>
  );
}

export default EvolutionBanner;
