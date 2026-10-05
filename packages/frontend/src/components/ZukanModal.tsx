import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ZUKAN_APPEARANCES,
  ZUKAN_TOTAL,
  appearanceKey,
  discoveredCount,
  isDiscovered,
} from "@ddm/shared";
import type { Zukan } from "@ddm/shared";
import { useI18n } from "../i18n.ts";
import {
  daysRaisedLabel,
  firstSeenDateLabel,
  formLabel,
  stageLabel,
  zukanCountLabel,
} from "../ui-helpers.ts";
import { MonsterSprite } from "../assets/monsters/MonsterSprite.tsx";

export interface ZukanModalProps {
  /** The collection to render; read by the parent at open time. */
  zukan: Zukan;
  /** Called when the user closes the modal (button or Escape). */
  onClose: () => void;
}

/**
 * Accessible monster-collection (図鑑) modal, mirroring the NameDialog /
 * reset-confirm pattern in this app: role=dialog + aria-modal, focus moved to
 * the Close button on open, Escape closes, and a focus trap keeps Tab /
 * Shift+Tab cycling within the dialog. Focus restoration to the opener is
 * handled by the PARENT (App) via its zukanTriggerRef.
 *
 * Every one of the canonical {@link ZUKAN_APPEARANCES} gets a cell. Discovered
 * appearances show the sprite at normal appearance plus the tier (+ branch
 * form) label, the recorded name, first-seen date, and days raised. Undiscovered
 * appearances show the SAME sprite darkened via the `zukan-silhouette` class
 * with all detail fields genuinely omitted (not just visually hidden); the cell
 * is labelled "undiscovered" for screen readers and the silhouette sprite is
 * aria-hidden so it is not announced.
 */
export function ZukanModal({ zukan, onClose }: ZukanModalProps) {
  const { lang, t } = useI18n();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Move focus to the Close button once the dialog is mounted.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      // Focus trap over the focusable controls inside the dialog. The Close
      // button is the only interactive control, so the trap simply keeps focus
      // pinned to it; querying keeps this correct if more controls are added.
      const box = boxRef.current;
      if (box === null) {
        return;
      }
      const focusables = box.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  const discovered = discoveredCount(zukan);

  return (
    <div
      className="zukan-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t("zukan.title")}
      onKeyDown={handleKeyDown}
    >
      <div className="zukan-box" ref={boxRef}>
        <header className="zukan-head">
          <h2 className="zukan-title">{t("zukan.title")}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="zukan-close"
            onClick={onClose}
          >
            {t("zukan.close")}
          </button>
        </header>

        <p className="zukan-count">{zukanCountLabel(discovered, ZUKAN_TOTAL, lang)}</p>

        <ul className="zukan-grid">
          {ZUKAN_APPEARANCES.map(({ stageId, form }) => {
            const key = appearanceKey(stageId, form);
            const found = isDiscovered(zukan, stageId, form);
            if (!found) {
              return (
                <li
                  key={key}
                  className="zukan-cell undiscovered"
                  aria-label={t("zukan.undiscoveredAria")}
                >
                  <div className="zukan-sprite zukan-silhouette" aria-hidden="true">
                    <MonsterSprite stageId={stageId} form={form} size={96} />
                  </div>
                  <p className="zukan-cell-label">{t("zukan.undiscovered")}</p>
                </li>
              );
            }

            const entry = zukan[key];
            const variant = formLabel(form, lang);
            const label =
              variant === ""
                ? stageLabel(stageId, lang)
                : `${stageLabel(stageId, lang)} ・ ${variant}`;

            return (
              <li key={key} className="zukan-cell discovered">
                <div className="zukan-sprite">
                  <MonsterSprite stageId={stageId} form={form} size={96} />
                </div>
                <p className="zukan-cell-label">{label}</p>
                {entry !== undefined && (
                  <dl className="zukan-cell-details">
                    <dt>{t("zukan.name")}</dt>
                    <dd className="zukan-cell-name">{entry.name}</dd>
                    <dt>{t("zukan.firstSeen")}</dt>
                    <dd>{firstSeenDateLabel(entry.firstSeenAt, lang)}</dd>
                    <dt>{t("zukan.daysRaised")}</dt>
                    <dd>{daysRaisedLabel(entry.daysRaised, lang)}</dd>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default ZukanModal;
