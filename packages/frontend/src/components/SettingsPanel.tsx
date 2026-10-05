import { useCallback, useEffect, useRef } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useI18n } from "../i18n.ts";
import type { Lang } from "../i18n.ts";
import type { Settings } from "../ui-helpers.ts";

export interface SettingsPanelProps {
  /** The current settings (SFX on/off, volume, reduced motion). */
  settings: Settings;
  /** Called with the next settings whenever any control changes. */
  onChange: (next: Settings) => void;
  /** Close the panel (button or Escape). Focus restoration handled by parent. */
  onClose: () => void;
}

/**
 * Accessible Settings dialog (issue #45), mirroring the ZukanModal pattern:
 * role=dialog + aria-modal, focus moved into the dialog on open, Escape closes,
 * and a Tab/Shift+Tab focus trap keeps focus inside the box. Focus restoration
 * to the opener is handled by the PARENT (App) via its settingsTriggerRef.
 *
 * Consolidates the previously inline header language toggle (#12) along with
 * the new SFX on/off, SFX volume, and reduced-motion controls. SFX/volume/
 * reduced-motion live in the `ddm.settings` store (via the `settings` prop +
 * `onChange`); language stays owned by i18n.ts under `ddm.lang` and is surfaced
 * here directly through useI18n().lang/setLang so toggling it is unchanged.
 *
 * Each control takes effect immediately: changes call back to the parent which
 * updates state and persists, and the language buttons call setLang directly.
 */
export function SettingsPanel({ settings, onChange, onClose }: SettingsPanelProps) {
  const { lang, setLang, t } = useI18n();
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
      // Focus trap over the focusable controls inside the dialog, matching the
      // ZukanModal implementation so Tab / Shift+Tab cycle within the box.
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

  const handleSfxToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...settings, sfxEnabled: event.target.checked });
    },
    [onChange, settings],
  );

  const handleVolumeChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const next = Number(event.target.value);
      onChange({ ...settings, volume: Number.isFinite(next) ? next : settings.volume });
    },
    [onChange, settings],
  );

  const handleReducedMotionToggle = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange({ ...settings, reducedMotion: event.target.checked });
    },
    [onChange, settings],
  );

  const handleSetLang = useCallback(
    (next: Lang) => {
      setLang(next);
    },
    [setLang],
  );

  // Percentage shown in the range input's aria-valuetext so screen-reader users
  // hear a meaningful value (e.g. "50%") rather than a raw 0..1 float.
  const percent = Math.round(settings.volume * 100);
  const volumeValueText = t("settings.volumeValue").replace("{percent}", String(percent));

  return (
    <div
      className="settings-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
      onKeyDown={handleKeyDown}
    >
      <div className="settings-box" ref={boxRef}>
        <header className="settings-head">
          <h2 className="settings-title">{t("settings.title")}</h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="settings-close"
            onClick={onClose}
          >
            {t("settings.close")}
          </button>
        </header>

        <div className="settings-body">
          {/* SFX on/off */}
          <div className="settings-row">
            <input
              type="checkbox"
              id="settings-sfx"
              className="settings-checkbox"
              checked={settings.sfxEnabled}
              onChange={handleSfxToggle}
            />
            <label htmlFor="settings-sfx">{t("settings.sfx")}</label>
          </div>

          {/* SFX volume. Kept editable even when SFX is off so the user can set
              their preferred level before enabling sound. */}
          <div className="settings-row">
            <label htmlFor="settings-volume" className="settings-row-label">
              {t("settings.volume")}
            </label>
            <input
              type="range"
              id="settings-volume"
              className="settings-range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={handleVolumeChange}
              aria-label={t("settings.volume")}
              aria-valuetext={volumeValueText}
            />
            <span className="settings-range-value" aria-hidden="true">
              {volumeValueText}
            </span>
          </div>

          {/* Reduced motion */}
          <div className="settings-row">
            <input
              type="checkbox"
              id="settings-reduced-motion"
              className="settings-checkbox"
              checked={settings.reducedMotion}
              onChange={handleReducedMotionToggle}
            />
            <label htmlFor="settings-reduced-motion">{t("settings.reducedMotion")}</label>
          </div>

          {/* Language toggle (moved from the header, issue #12). Language stays
              owned by i18n.ts under ddm.lang. */}
          <div className="settings-row">
            <span className="settings-row-label" id="settings-language-label">
              {t("settings.language")}
            </span>
            <div className="lang-toggle" role="group" aria-labelledby="settings-language-label">
              <button
                type="button"
                className={`lang-btn${lang === "ja" ? " active" : ""}`}
                aria-pressed={lang === "ja"}
                onClick={() => handleSetLang("ja")}
              >
                JA
              </button>
              <button
                type="button"
                className={`lang-btn${lang === "en" ? " active" : ""}`}
                aria-pressed={lang === "en"}
                onClick={() => handleSetLang("en")}
              >
                EN
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
