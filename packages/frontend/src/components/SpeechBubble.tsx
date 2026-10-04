export interface SpeechBubbleProps {
  /** The latest monster reply text, or null when there is nothing to show. */
  text: string | null;
  /** Whether a reply is being awaited; shows the '…' typing indicator. */
  pending: boolean;
}

/**
 * A near-sprite speech bubble that surfaces the monster's most recent spoken
 * reply (or a typing indicator while one is awaited). Purely presentational:
 * it is positioned/animated via the `.speech-bubble` CSS in styles.css and
 * mounted inside the relatively-positioned `.sprite-wrap` in App.tsx.
 *
 * Behavior:
 *  - pending            -> show the '…' typing state (same cue as ChatPanel).
 *  - not pending + text -> show the reply text.
 *  - not pending + none -> render nothing.
 *
 * The root element is keyed on its content so a new reply remounts it and the
 * fade-in animation replays (same keyed-remount trick as the care-fx overlay).
 */
export function SpeechBubble({ text, pending }: SpeechBubbleProps) {
  if (!pending && (text === null || text === "")) {
    return null;
  }

  // Pending wins over stale text so the typing indicator is unambiguous.
  const content = pending ? "…" : (text as string);
  const className = `speech-bubble${pending ? " pending" : ""}`;

  return (
    <div
      key={`${pending ? "pending" : "reply"}:${content}`}
      className={className}
      aria-live="polite"
    >
      <span className="speech-bubble-text">{content}</span>
      <span className="speech-bubble-tail" aria-hidden="true" />
    </div>
  );
}

export default SpeechBubble;
