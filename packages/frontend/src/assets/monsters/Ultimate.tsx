/**
 * 完全体 (ultimate) sprite: a towering armored cyber-dragon with a glowing
 * core, large horned helm, broad wings and an aura. The biggest, most
 * detailed and most menacing of the four stages.
 */
import type { MonsterSpriteProps } from "./Baby.tsx";

export function Ultimate({ size = 160, title = "完全体のデジタルモンスター" }: MonsterSpriteProps) {
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
        <linearGradient id="ult-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8a5c" />
          <stop offset="55%" stopColor="#e0431f" />
          <stop offset="100%" stopColor="#8f1b0c" />
        </linearGradient>
        <linearGradient id="ult-wing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a3f5a" />
          <stop offset="100%" stopColor="#12152a" />
        </linearGradient>
        <radialGradient id="ult-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fff6c2" />
          <stop offset="60%" stopColor="#ffd166" />
          <stop offset="100%" stopColor="#ff8a00" />
        </radialGradient>
        <radialGradient id="ult-aura" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffcf6b" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffcf6b" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* aura */}
      <circle cx="100" cy="100" r="96" fill="url(#ult-aura)" />
      <ellipse cx="100" cy="190" rx="66" ry="12" fill="#000000" opacity="0.2" />
      {/* large wings */}
      <path d="M66 92 Q6 52 4 112 Q24 100 36 120 Q22 118 30 138 Q50 118 62 132 Z" fill="url(#ult-wing)" stroke="#0a0c1a" strokeWidth="2.5" />
      <path d="M134 92 Q194 52 196 112 Q176 100 164 120 Q178 118 170 138 Q150 118 138 132 Z" fill="url(#ult-wing)" stroke="#0a0c1a" strokeWidth="2.5" />
      {/* spiked tail */}
      <path d="M126 162 Q168 164 184 128 L194 134 L182 152 Q170 176 126 170 Z" fill="#8f1b0c" />
      <path d="M184 128 l12 -8 l-2 14 Z" fill="#ffd166" stroke="#c98f1e" strokeWidth="1.5" />
      {/* legs */}
      <rect x="74" y="156" width="22" height="30" rx="6" fill="#8f1b0c" />
      <rect x="104" y="156" width="22" height="30" rx="6" fill="#8f1b0c" />
      <path d="M74 186 l-5 9 M84 186 l0 10 M94 186 l5 9" stroke="#3a0a04" strokeWidth="3" strokeLinecap="round" />
      <path d="M104 186 l-5 9 M114 186 l0 10 M124 186 l5 9" stroke="#3a0a04" strokeWidth="3" strokeLinecap="round" />
      {/* armored body */}
      <path d="M58 134 Q58 86 100 86 Q142 86 142 134 Q142 174 100 174 Q58 174 58 134 Z" fill="url(#ult-body)" stroke="#5a0f06" strokeWidth="3.5" />
      {/* chest armor plates */}
      <path d="M74 108 L126 108 L120 132 L80 132 Z" fill="#2b2f4a" opacity="0.85" />
      {/* glowing core */}
      <circle cx="100" cy="140" r="16" fill="url(#ult-core)" stroke="#c98f1e" strokeWidth="2" />
      <circle cx="100" cy="140" r="7" fill="#fff6c2" />
      {/* heavy arms + claws */}
      <path d="M58 112 Q36 118 34 144" fill="none" stroke="#5a0f06" strokeWidth="13" strokeLinecap="round" />
      <path d="M142 112 Q164 118 166 144" fill="none" stroke="#5a0f06" strokeWidth="13" strokeLinecap="round" />
      <path d="M30 148 l-5 9 M36 150 l0 10 M43 148 l5 9" stroke="#3a0a04" strokeWidth="3" strokeLinecap="round" />
      <path d="M157 148 l-5 9 M164 150 l0 10 M170 148 l5 9" stroke="#3a0a04" strokeWidth="3" strokeLinecap="round" />
      {/* horned helm head */}
      <path d="M66 64 Q66 30 100 30 Q134 30 134 64 Q134 94 100 94 Q66 94 66 64 Z" fill="url(#ult-body)" stroke="#5a0f06" strokeWidth="3.5" />
      {/* big horns */}
      <path d="M74 40 L52 6 L90 32 Z" fill="#e9ecf5" stroke="#9aa0bd" strokeWidth="2" />
      <path d="M126 40 L148 6 L110 32 Z" fill="#e9ecf5" stroke="#9aa0bd" strokeWidth="2" />
      {/* helm visor */}
      <rect x="76" y="52" width="48" height="16" rx="4" fill="#161a30" />
      <path d="M80 60 L96 60 M104 60 L120 60" stroke="#ff5a3c" strokeWidth="4" strokeLinecap="round" />
      {/* fanged maw */}
      <path d="M80 80 L120 80 L112 92 L88 92 Z" fill="#161a30" />
      <path d="M86 80 L90 90 L94 80 Z" fill="#ffffff" />
      <path d="M98 80 L102 90 L106 80 Z" fill="#ffffff" />
      <path d="M110 80 L114 90 L118 80 Z" fill="#ffffff" />
    </svg>
  );
}

export default Ultimate;
