import type { GrowthStage } from "@ddm/shared";
import { stageLabelJa } from "../ui-helpers.ts";

export interface EvolutionBannerProps {
  /** The stage just evolved into, or null when nothing to show. */
  stageId: GrowthStage | null;
  onDismiss: () => void;
}

/** Celebratory banner shown briefly when the monster changes stage. */
export function EvolutionBanner({ stageId, onDismiss }: EvolutionBannerProps) {
  if (stageId === null) {
    return null;
  }
  return (
    <div className="evolution-banner" role="status" onClick={onDismiss}>
      <span className="evo-spark" aria-hidden="true">✨</span>
      <span>
        進化した！ <strong>{stageLabelJa(stageId)}</strong> になった！
      </span>
      <button type="button" className="evo-close" onClick={onDismiss} aria-label="閉じる">
        ×
      </button>
    </div>
  );
}

export default EvolutionBanner;
