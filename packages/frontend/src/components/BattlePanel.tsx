import type { BattleResult } from "@ddm/shared";
import { battleLogLineJa, winnerLabelJa } from "../ui-helpers.ts";

export interface BattlePanelProps {
  busy: boolean;
  log: string[];
  result: BattleResult | null;
  onBattle: () => void;
}

/** Battle button plus a scrolling battle log (localized to Japanese). */
export function BattlePanel({ busy, log, result, onBattle }: BattlePanelProps) {
  return (
    <section className="panel battle-panel" aria-label="バトル">
      <h2>バトル</h2>
      <button type="button" className="battle-btn" onClick={onBattle} disabled={busy}>
        ⚔️ 野生のモンスターと戦う
      </button>
      {result !== null && (
        <p className={`battle-result ${result.winner}`}>{winnerLabelJa(result.winner)}</p>
      )}
      {log.length > 0 && (
        <ol className="battle-log">
          {log.map((line, i) => (
            <li key={i}>{battleLogLineJa(line)}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default BattlePanel;
