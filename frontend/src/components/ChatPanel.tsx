/**
 * Chat UI with the monster.
 *
 * Mirrors the backend's `conversationDisabled` rule: when the monster is
 * 幼年期 / BABY it cannot converse, so the input and send button are disabled
 * and an explanatory message is shown. For the other three stages the chat API
 * is called and replies are appended to the transcript.
 */
import { useState } from 'react';
import { canConverse, STAGE_LABELS, type Stage } from '@digital-monster/shared';

import { chat } from '../lib/api';

interface ChatMessage {
  from: 'user' | 'monster';
  text: string;
}

interface ChatPanelProps {
  stage: Stage;
}

export function ChatPanel({ stage }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const disabled = !canConverse(stage);

  async function send() {
    const text = input.trim();
    if (!text || disabled || sending) {
      return;
    }
    setErr(null);
    setSending(true);
    setMessages((prev) => [...prev, { from: 'user', text }]);
    setInput('');
    try {
      const result = await chat(text);
      setMessages((prev) => [...prev, { from: 'monster', text: result.reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void send();
    }
  }

  return (
    <section className="chat-panel">
      <h3 className="chat-title">おしゃべり</h3>
      {disabled ? (
        <p className="chat-disabled-note" role="note">
          {STAGE_LABELS[stage]}はまだおしゃべりできません。トレーニングして進化させよう！
        </p>
      ) : null}
      <ul className="chat-log" aria-label="チャット履歴">
        {messages.map((m, i) => (
          <li key={i} className={`chat-msg chat-msg--${m.from}`}>
            {m.text}
          </li>
        ))}
      </ul>
      {err ? (
        <p className="chat-error" role="alert">
          {err}
        </p>
      ) : null}
      <div className="chat-input-row">
        <input
          className="chat-input"
          type="text"
          aria-label="メッセージ"
          placeholder={disabled ? 'まだおしゃべりできません' : 'メッセージを入力…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled || sending}
        />
        <button
          className="chat-send"
          type="button"
          onClick={() => void send()}
          disabled={disabled || sending || input.trim().length === 0}
        >
          送信
        </button>
      </div>
    </section>
  );
}
