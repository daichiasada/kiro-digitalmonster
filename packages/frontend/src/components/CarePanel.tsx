import type { Monster } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import { busyStatusLabel } from "../ui-helpers.ts";

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
  const { lang, t } = useI18n();
  return (
    <section className="panel care-panel" aria-label={t("aria.care")} aria-busy={busy}>
      <h2>
        {t("care.title")}
        {busy && <span className="busy-spinner" aria-hidden="true" />}
      </h2>
      {/* Accessible, lightweight busy feedback. Lives in the panel (not over
          the sprite) so it never double-signals with the #10 care-fx overlay.
          The visually-hidden live region announces "処理中…"/"Working…" while an
          action is in flight; the small spinner above is the visual cue. */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {busy ? busyStatusLabel(lang) : ""}
      </span>
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
