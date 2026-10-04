import type { Monster } from "@ddm/shared";
import { hpPercent, moodLabelJa, statBarPercent, stageLabelJa } from "../ui-helpers.ts";

/** Reference max values used only to scale the ATK/DEF bars visually. */
const ATK_REFERENCE = 40;
const DEF_REFERENCE = 30;

export interface StatsPanelProps {
  monster: Monster;
}

/** Shows HP / ATK / DEF bars and the Japanese stage + mood labels. */
export function StatsPanel({ monster }: StatsPanelProps) {
  const { stats } = monster;
  const hp = hpPercent(stats.hp, stats.maxHp);
  const atk = statBarPercent(stats.atk, ATK_REFERENCE);
  const def = statBarPercent(stats.def, DEF_REFERENCE);

  return (
    <section className="panel stats-panel" aria-label="ステータス">
      <header className="panel-head">
        <h2>{monster.name}</h2>
        <span className="stage-badge">{stageLabelJa(monster.stageId)}</span>
      </header>
      <p className="mood">きぶん: {moodLabelJa(monster)}</p>

      <div className="stat-row">
        <span className="stat-label">HP</span>
        <div className="bar">
          <div className="bar-fill hp" style={{ width: `${hp}%` }} />
        </div>
        <span className="stat-value">
          {stats.hp}/{stats.maxHp}
        </span>
      </div>

      <div className="stat-row">
        <span className="stat-label">攻撃</span>
        <div className="bar">
          <div className="bar-fill atk" style={{ width: `${atk}%` }} />
        </div>
        <span className="stat-value">{stats.atk}</span>
      </div>

      <div className="stat-row">
        <span className="stat-label">防御</span>
        <div className="bar">
          <div className="bar-fill def" style={{ width: `${def}%` }} />
        </div>
        <span className="stat-value">{stats.def}</span>
      </div>

      <p className="train-count">トレーニング回数: {monster.trainingCount}</p>
    </section>
  );
}

export default StatsPanel;
