import type { Monster } from "@ddm/shared";
import { useI18n } from "../i18n.ts";

export interface CarePanelProps {
  monster: Monster;
  busy: boolean;
  onFeed: () => void;
  onTrain: () => void;
  onSleep: () => void;
  onClean: () => void;
}

/** Care action buttons: feed / train / sleep / clean. */
export function CarePanel({ monster, busy, onFeed, onTrain, onSleep, onClean }: CarePanelProps) {
  const { t } = useI18n();
  return (
    <section className="panel care-panel" aria-label={t("aria.care")}>
      <h2>{t("care.title")}</h2>
      <div className="care-buttons">
        <button type="button" className="care-btn feed" onClick={onFeed} disabled={busy}>
          <span className="care-icon" aria-hidden="true">🍖</span>
          <span>{t("care.feed")}</span>
        </button>
        <button type="button" className="care-btn train" onClick={onTrain} disabled={busy}>
          <span className="care-icon" aria-hidden="true">💪</span>
          <span>{t("care.train")}</span>
        </button>
        <button type="button" className="care-btn sleep" onClick={onSleep} disabled={busy}>
          <span className="care-icon" aria-hidden="true">{monster.isSleeping ? "⏰" : "😴"}</span>
          <span>{monster.isSleeping ? t("care.wake") : t("care.sleep")}</span>
        </button>
        <button type="button" className="care-btn clean" onClick={onClean} disabled={busy}>
          <span className="care-icon" aria-hidden="true">🧼</span>
          <span>{t("care.clean")}</span>
        </button>
      </div>
      <p className="care-hint">{t("care.hint")}</p>
    </section>
  );
}

export default CarePanel;
