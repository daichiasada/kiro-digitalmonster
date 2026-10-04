import { useState } from "react";
import type { GrowthStage } from "@ddm/shared";
import type { ChatLine } from "../state/useMonster.ts";
import { canChat } from "../ui-helpers.ts";

export interface ChatPanelProps {
  stageId: GrowthStage;
  log: ChatLine[];
  pending: boolean;
  onSend: (message: string) => void;
}

/** Conversation panel. Disabled with a hint during the 幼年期 (baby) stage. */
export function ChatPanel({ stageId, log, pending, onSend }: ChatPanelProps) {
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
    <section className="panel chat-panel" aria-label="会話">
      <h2>会話</h2>
      {!enabled ? (
        <p className="chat-disabled-hint">
          幼年期のあいだはまだ言葉を話せません。トレーニングと時間経過で成長期へ進化すると会話できるようになります。
        </p>
      ) : (
        <>
          <div className="chat-log" aria-live="polite">
            {log.length === 0 ? (
              <p className="chat-empty">話しかけてみよう！</p>
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
              placeholder="メッセージを入力"
              disabled={pending}
              aria-label="メッセージ"
            />
            <button type="submit" disabled={pending || text.trim() === ""}>
              送信
            </button>
          </form>
        </>
      )}
    </section>
  );
}

export default ChatPanel;
