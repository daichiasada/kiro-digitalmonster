import type { Monster } from "@ddm/shared";
import { MAX_HUNGRY_LEVEL, evolutionProgress } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import {
  evolutionReqAriaLabel,
  formatMinutes,
  fullnessPercent,
  hpPercent,
  isHungerCaution,
  moodLabel,
  statBarPercent,
  stageLabel,
} from "../ui-helpers.ts";

/** Reference max values used only to scale the ATK/DEF bars visually. */
const ATK_REFERENCE = 40;
const DEF_REFERENCE = 30;

export interface StatsPanelProps {
  monster: Monster;
}

/** Shows HP / ATK / DEF bars and the localized stage + mood labels. */
export function StatsPanel({ monster }: StatsPanelProps) {
  const { lang, t } = useI18n();
  const { stats } = monster;
  const hp = hpPercent(stats.hp, stats.maxHp);
  const fullness = fullnessPercent(monster.hungryLevel);
  const hungerCaution = isHungerCaution(monster.hungryLevel);
  const atk = statBarPercent(stats.atk, ATK_REFERENCE);
  const def = statBarPercent(stats.def, DEF_REFERENCE);

  const now = Date.now();
  const prog = evolutionProgress(monster, now);

  return (
    <section className="panel stats-panel" aria-label={t("aria.stats")}>
      <header className="panel-head">
        <h2>{monster.name}</h2>
        <span className="stage-badge">{stageLabel(monster.stageId, lang)}</span>
      </header>
      <p className="mood">{t("stats.mood")}{moodLabel(monster, lang)}</p>

      <div className="stat-row">
        <span className="stat-label">{t("stats.hp")}</span>
        <div className="bar">
          <div className="bar-fill hp" style={{ width: `${hp}%` }} />
        </div>
        <span className="stat-value">
          {stats.hp}/{stats.maxHp}
        </span>
      </div>

      <div
        className="stat-row"
        aria-label={
          hungerCaution ? `${t("stats.fullness")}: ${t("badge.hungry")}` : undefined
        }
      >
        <span className="stat-label">{t("stats.fullness")}</span>
        <div className="bar">
          <div
            className={`bar-fill fullness${hungerCaution ? " caution" : ""}`}
            style={{ width: `${fullness}%` }}
          />
        </div>
        <span className="stat-value">
          {fullness}% ({monster.hungryLevel}/{MAX_HUNGRY_LEVEL})
        </span>
      </div>

      <div className="stat-row">
        <span className="stat-label">{t("stats.atk")}</span>
        <div className="bar">
          <div className="bar-fill atk" style={{ width: `${atk}%` }} />
        </div>
        <span className="stat-value">{stats.atk}</span>
      </div>

      <div className="stat-row">
        <span className="stat-label">{t("stats.def")}</span>
        <div className="bar">
          <div className="bar-fill def" style={{ width: `${def}%` }} />
        </div>
        <span className="stat-value">{stats.def}</span>
      </div>

      <p className="train-count">{t("stats.trainingCount")}{monster.trainingCount}</p>

      <div className="evolution-progress">
        <h3 className="evolution-title">{t("stats.evolveTitle")}</h3>
        {prog.isFinalStage ? (
          <p className="evolution-final">
            {t("stats.finalStage").replace("{stage}", stageLabel(monster.stageId, lang))}
          </p>
        ) : (
          <>
            <p className="evolution-next">
              {t("stats.nextStage")}{lang === "en" ? prog.nextLabelEn : prog.nextLabelJa}
            </p>
            <p className={`evolution-req${prog.trainingMet ? " met" : " unmet"}`}>
              <span className="evolution-check" aria-hidden="true">
                {prog.trainingMet ? "✓" : "・"}
              </span>
              <span className="visually-hidden">{evolutionReqAriaLabel(prog.trainingMet, lang)}: </span>
              {t("stats.training")}{prog.trainingCurrent}/{prog.trainingRequired}
            </p>
            <p className={`evolution-req${prog.ageMet ? " met" : " unmet"}`}>
              <span className="evolution-check" aria-hidden="true">
                {prog.ageMet ? "✓" : "・"}
              </span>
              <span className="visually-hidden">{evolutionReqAriaLabel(prog.ageMet, lang)}: </span>
              {t("stats.elapsed")}{formatMinutes(prog.elapsedMs, lang)}/{formatMinutes(prog.requiredMs ?? 0, lang)}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

export default StatsPanel;
