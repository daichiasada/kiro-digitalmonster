import type { BattleResult } from "@ddm/shared";

export interface BattlePanelProps {
  busy: boolean;
  log: string[];
  result: BattleResult | null;
  onBattle: () => void;
}

/** Maps the battle winner to a Japanese headline. */
function winnerLabel(result: BattleResult): string {
  switch (result.winner) {
    case "player":
      return "勝利！ 🎉";
    case "enemy":
      return "敗北… 💥";
    default:
      return "引き分け 🤝";
  }
}

/** Battle button plus a scrolling battle log. */
export function BattlePanel({ busy, log, result, onBattle }: BattlePanelProps) {
  return (
    <section className="panel battle-panel" aria-label="バトル">
      <h2>バトル</h2>
      <button type="button" className="battle-btn" onClick={onBattle} disabled={busy}>
        ⚔️ 野生のモンスターと戦う
      </button>
      {result !== null && (
        <p className={`battle-result ${result.winner}`}>{winnerLabel(result)}</p>
      )}
      {log.length > 0 && (
        <ol className="battle-log">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default BattlePanel;
