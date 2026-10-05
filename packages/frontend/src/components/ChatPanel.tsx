import { useState } from "react";
import type { GrowthStage } from "@ddm/shared";
import type { ChatLine } from "../state/useMonster.ts";
import { useI18n } from "../i18n.ts";
import { canChat } from "../ui-helpers.ts";

export interface ChatPanelProps {
  stageId: GrowthStage;
  log: ChatLine[];
  pending: boolean;
  onSend: (message: string) => void;
  /** Clear both the in-memory and persisted conversation (issue #37). */
  onClear: () => void;
}

/** Conversation panel. Disabled with a hint during the 幼年期 (baby) stage. */
export function ChatPanel({ stageId, log, pending, onSend, onClear }: ChatPanelProps) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const enabled = canChat(stageId);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed === "" || !enabled || pending) {
      return;
    }
    onSend(trimmed);
    setText("");
  }

  return (
    <section className="panel chat-panel" aria-label={t("aria.chat")}>
      <div className="chat-header">
        <h2>{t("chat.title")}</h2>
        {enabled && log.length > 0 && (
          <button
            type="button"
            className="chat-clear"
            onClick={onClear}
            disabled={pending}
            aria-label={t("chat.clearAria")}
          >
            {t("chat.clear")}
          </button>
        )}
      </div>
      {!enabled ? (
        <p className="chat-disabled-hint">{t("chat.disabledHint")}</p>
      ) : (
        <>
          <div className="chat-log" aria-live="polite">
            {log.length === 0 ? (
              <p className="chat-empty">{t("chat.emptyPrompt")}</p>
            ) : (
              log.map((line, i) => (
                <div key={i} className={`chat-line ${line.role}`}>
                  <span className="chat-bubble">{line.text}</span>
                  {line.role === "monster" && line.modelId !== undefined && line.modelId !== "none" && (
                    <span className="chat-model">{line.modelId}</span>
                  )}
                </div>
              ))
            )}
            {pending && <div className="chat-line monster"><span className="chat-bubble">…</span></div>}
          </div>
          <form className="chat-form" onSubmit={submit}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("chat.placeholder")}
              disabled={pending}
              aria-label={t("chat.inputAria")}
            />
            <button type="submit" disabled={pending || text.trim() === ""}>
              {t("chat.send")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export default ChatPanel;
