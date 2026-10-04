/**
 * Renders the monster: its per-stage image asset, the Japanese stage label,
 * name, training count, and happiness / fullness bars.
 */
import { STAGE_LABELS, type Monster } from '@digital-monster/shared';

import { stageImage } from '../lib/stageImage';

interface StatBarProps {
  label: string;
  value: number;
  color: string;
}

function StatBar({ label, value, color }: StatBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <div className="stat-track">
        <div className="stat-fill" style={{ width: `${clamped}%`, backgroundColor: color }} />
      </div>
      <span className="stat-value">{clamped}</span>
    </div>
  );
}

interface MonsterViewProps {
  monster: Monster;
}

export function MonsterView({ monster }: MonsterViewProps) {
  const label = STAGE_LABELS[monster.stage];
  return (
    <section className="monster-view">
      <div className="monster-image-wrap">
        <img
          className="monster-image"
          src={stageImage(monster.stage)}
          alt={`${label}のモンスター`}
          width={240}
          height={240}
        />
      </div>
      <h2 className="monster-name">{monster.name}</h2>
      <p className="monster-stage">
        <span className="stage-badge">{label}</span>
        <span className="training-count">トレーニング {monster.trainingCount} 回</span>
      </p>
      <div className="monster-stats">
        <StatBar label="きげん" value={monster.happiness ?? 0} color="#ff8ab3" />
        <StatBar label="まんぷく" value={monster.fullness ?? 0} color="#ffb703" />
      </div>
    </section>
  );
}
