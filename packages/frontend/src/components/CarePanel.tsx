import type { Monster } from "@ddm/shared";

export interface CarePanelProps {
  monster: Monster;
  busy: boolean;
  onFeed: () => void;
  onTrain: () => void;
  onSleep: () => void;
  onClean: () => void;
}

/** Care action buttons: 餌 / トレーニング / 睡眠 / 清掃. */
export function CarePanel({ monster, busy, onFeed, onTrain, onSleep, onClean }: CarePanelProps) {
  return (
    <section className="panel care-panel" aria-label="お世話">
      <h2>お世話</h2>
      <div className="care-buttons">
        <button type="button" className="care-btn feed" onClick={onFeed} disabled={busy}>
          <span className="care-icon" aria-hidden="true">🍖</span>
          <span>餌やり</span>
        </button>
        <button type="button" className="care-btn train" onClick={onTrain} disabled={busy}>
          <span className="care-icon" aria-hidden="true">💪</span>
          <span>トレーニング</span>
        </button>
        <button type="button" className="care-btn sleep" onClick={onSleep} disabled={busy}>
          <span className="care-icon" aria-hidden="true">{monster.isSleeping ? "⏰" : "😴"}</span>
          <span>{monster.isSleeping ? "起こす" : "睡眠"}</span>
        </button>
        <button type="button" className="care-btn clean" onClick={onClean} disabled={busy}>
          <span className="care-icon" aria-hidden="true">🧼</span>
          <span>清掃</span>
        </button>
      </div>
      <p className="care-hint">
        トレーニングと時間経過で進化します。放っておくとお腹がすいて汚れます。
      </p>
    </section>
  );
}

export default CarePanel;
