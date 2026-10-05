import type { Ref } from "react";
import type { Monster } from "@ddm/shared";
import { AFFECTION_MAX, MAX_HUNGRY_LEVEL, affectionOf, battleRecordOf, evolutionProgress } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import {
  affectionLevelLabel,
  affectionPercent,
  battleRecordSummary,
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
  /** Optional handler to open the rename dialog from the header affordance. */
  onRename?: () => void;
  /** Ref to the rename button so the parent can restore focus on dialog close. */
  renameButtonRef?: Ref<HTMLButtonElement>;
}

/** Shows HP / ATK / DEF bars and the localized stage + mood labels. */
export function StatsPanel({ monster, onRename, renameButtonRef }: StatsPanelProps) {
  const { lang, t } = useI18n();
  const { stats } = monster;
  const hp = hpPercent(stats.hp, stats.maxHp);
  const fullness = fullnessPercent(monster.hungryLevel);
  const hungerCaution = isHungerCaution(monster.hungryLevel);
  // Read affection via the shared helper so legacy state (no field) is safe.
  const affection = affectionOf(monster);
  const affectionPct = affectionPercent(affection);
  const affectionLabel = affectionLevelLabel(affection, lang);
  const atk = statBarPercent(stats.atk, ATK_REFERENCE);
  const def = statBarPercent(stats.def, DEF_REFERENCE);
  // Read the battle record via the shared helper so legacy state (no field)
  // is safe, then format a localized win/loss/draw + streak summary.
  const recordSummary = battleRecordSummary(battleRecordOf(monster), lang);

  const now = Date.now();
  const prog = evolutionProgress(monster, now);

  return (
    <section className="panel stats-panel" aria-label={t("aria.stats")}>
      <header className="panel-head">
        <div className="panel-head-name">
          <h2>{monster.name}</h2>
          {onRename && (
            <button
              ref={renameButtonRef}
              type="button"
              className="rename-btn"
              aria-label={t("name.renameButtonAria")}
              title={t("name.renameButton")}
              onClick={onRename}
            >
              <span aria-hidden="true">✎</span>
            </button>
          )}
        </div>
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

      {/* Affection (なつき度) gauge. Accessible, NOT color-only: the row
          aria-label combines the gauge name, the percentage/value, AND the
          band label, mirroring the fullness gauge's aria-label pattern. */}
      <div
        className="stat-row"
        aria-label={`${t("stats.affection")}: ${affectionPct}% (${affection}/${AFFECTION_MAX}) ${affectionLabel}`}
      >
        <span className="stat-label">
          <span aria-hidden="true">❤️</span> {t("stats.affection")}
        </span>
        <div className="bar">
          <div className="bar-fill affection" style={{ width: `${affectionPct}%` }} />
        </div>
        <span className="stat-value">
          {affectionPct}% ({affection}/{AFFECTION_MAX}) {affectionLabel}
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

      {/* Battle record (戦績) row. Accessible and NOT color-only: the row
          aria-label combines the label and the full summary string, mirroring
          the affection/fullness rows' aria-label pattern. */}
      <p className="battle-record" aria-label={`${t("stats.record")}: ${recordSummary}`}>
        <span className="battle-record-label">
          <span aria-hidden="true">⚔️</span> {t("stats.record")}
        </span>
        <span className="battle-record-value">{recordSummary}</span>
      </p>

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
