/**
 * 幼年期 (baby) sprite: a small egg with a tiny hatchling peeking out.
 * Smallest and simplest of the four stages.
 */
export interface MonsterSpriteProps {
  /** Pixel size of the (square) SVG viewport. */
  size?: number;
  /** Accessible label. */
  title?: string;
}

export function Baby({ size = 160, title = "幼年期のAIモンスター" }: MonsterSpriteProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <defs>
        <radialGradient id="baby-egg" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#fff8e7" />
          <stop offset="100%" stopColor="#f2d79b" />
        </radialGradient>
      </defs>
      {/* shadow */}
      <ellipse cx="100" cy="178" rx="46" ry="10" fill="#000000" opacity="0.12" />
      {/* egg body */}
      <ellipse cx="100" cy="110" rx="60" ry="72" fill="url(#baby-egg)" stroke="#c7a24d" strokeWidth="3" />
      {/* egg spots */}
      <circle cx="78" cy="120" r="9" fill="#e9c56b" />
      <circle cx="118" cy="140" r="7" fill="#e9c56b" />
      <circle cx="112" cy="92" r="6" fill="#e9c56b" />
      {/* zig-zag crack where it is hatching */}
      <polyline
        points="60,96 74,86 68,104 86,94 80,112 100,100"
        fill="none"
        stroke="#9b7a2e"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      {/* tiny hatchling peeking */}
      <circle cx="100" cy="74" r="22" fill="#8fd3f4" stroke="#4a90c2" strokeWidth="2.5" />
      <circle cx="92" cy="72" r="4" fill="#1b2a4a" />
      <circle cx="108" cy="72" r="4" fill="#1b2a4a" />
      <path d="M94 82 Q100 88 106 82" fill="none" stroke="#1b2a4a" strokeWidth="2.5" strokeLinecap="round" />
      {/* little antenna sprout */}
      <path d="M100 52 L100 40" stroke="#4a90c2" strokeWidth="3" strokeLinecap="round" />
      <circle cx="100" cy="38" r="4" fill="#f6a5c0" />
    </svg>
  );
}

export default Baby;
