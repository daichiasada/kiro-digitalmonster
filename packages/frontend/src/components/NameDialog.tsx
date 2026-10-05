import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { MONSTER_NAME_MAX_LENGTH, isValidMonsterName } from "@ddm/shared";
import { useI18n } from "../i18n.ts";

export interface NameDialogProps {
  /** Dialog heading, already localized by the parent. */
  title: string;
  /** Initial value for the name input (empty for first run, current for rename). */
  initialName: string;
  /** First-run (hatch) vs. later rename — controls the secondary button label. */
  mode: "firstRun" | "rename";
  /** Called with the entered name when the user confirms a valid value. */
  onSubmit: (name: string) => void;
  /** Called when the user cancels/skips or dismisses via Escape. */
  onClose: () => void;
}

/**
 * Accessible name-entry dialog mirroring the reset-confirm pattern in App.tsx:
 * role=alertdialog + aria-modal, focus moves to the input on open, Escape
 * closes, a simple focus trap cycles between the input and the two action
 * buttons, and focus restoration to the opener is handled by the parent.
 *
 * Validation reuses the shared {@link isValidMonsterName} helper so the Save
 * button stays disabled for empty / whitespace-only / too-long input and the
 * live validation message appears only once the user has typed something.
 */
export function NameDialog({ title, initialName, mode, onSubmit, onClose }: NameDialogProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(initialName);

  const inputRef = useRef<HTMLInputElement>(null);
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  const secondaryBtnRef = useRef<HTMLButtonElement>(null);

  const inputId = useId();
  const errorId = useId();

  const valid = isValidMonsterName(value);
  // Only surface the validation hint once the user has typed something so a
  // freshly opened empty first-run dialog is not pre-flagged as an error.
  const showError = value.length > 0 && !valid;

  // Move focus into the input once the dialog is mounted.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSubmit = useCallback(() => {
    if (!isValidMonsterName(value)) {
      return;
    }
    onSubmit(value);
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Enter" && event.target === inputRef.current) {
        // Enter from the input submits when valid (native form-less behavior).
        event.preventDefault();
        handleSubmit();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      // Focus trap cycling input -> save (if enabled) -> secondary -> input.
      const input = inputRef.current;
      const save = saveBtnRef.current;
      const secondary = secondaryBtnRef.current;
      if (input === null || secondary === null) {
        return;
      }
      const candidates: Array<HTMLElement | null> = [
        input,
        save !== null && !save.disabled ? save : null,
        secondary,
      ];
      const focusables = candidates.filter((el): el is HTMLElement => el !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) {
        return;
      }
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
    [handleSubmit, onClose],
  );

  return (
    <div
      className="name-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={handleKeyDown}
    >
      <div className="name-dialog-box">
        <h2 className="name-dialog-title">{title}</h2>
        <label className="name-dialog-label" htmlFor={inputId}>
          {t("name.label")}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          className="name-dialog-input"
          type="text"
          value={value}
          maxLength={MONSTER_NAME_MAX_LENGTH * 2}
          placeholder={t("name.placeholder")}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {showError && (
          <p id={errorId} className="name-dialog-error" role="alert">
            {t("name.validation")}
          </p>
        )}
        <div className="name-dialog-actions">
          <button
            ref={saveBtnRef}
            type="button"
            className="name-dialog-save"
            disabled={!valid}
            onClick={handleSubmit}
          >
            {t("name.save")}
          </button>
          <button
            ref={secondaryBtnRef}
            type="button"
            className="name-dialog-cancel"
            onClick={onClose}
          >
            {mode === "firstRun" ? t("name.skip") : t("name.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NameDialog;
