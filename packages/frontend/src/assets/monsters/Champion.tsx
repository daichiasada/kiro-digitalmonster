/**
 * 成熟期 (champion) sprite: a tall winged beast with claws and a crest.
 * More detailed, more menacing, with wings the rookie lacked.
 */
import type { MonsterSpriteProps } from "./Baby.tsx";

export function Champion({ size = 160, title = "成熟期のデジタルモンスター" }: MonsterSpriteProps) {
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
        <linearGradient id="champ-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b78cff" />
          <stop offset="100%" stopColor="#6f3fd6" />
        </linearGradient>
        <linearGradient id="champ-wing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a5cf0" />
          <stop offset="100%" stopColor="#4a1fae" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="186" rx="58" ry="12" fill="#000000" opacity="0.16" />
      {/* wings */}
      <path d="M60 96 Q18 70 20 118 Q40 108 56 128 Z" fill="url(#champ-wing)" stroke="#3a1690" strokeWidth="2.5" />
      <path d="M140 96 Q182 70 180 118 Q160 108 144 128 Z" fill="url(#champ-wing)" stroke="#3a1690" strokeWidth="2.5" />
      {/* tail with spike */}
      <path d="M128 158 Q166 158 176 128 L186 136 L174 150 Q166 166 128 164 Z" fill="#6f3fd6" />
      {/* legs with claws */}
      <rect x="78" y="156" width="18" height="26" rx="6" fill="#5a2fb8" />
      <rect x="104" y="156" width="18" height="26" rx="6" fill="#5a2fb8" />
      <path d="M78 182 l-4 8 M86 182 l0 9 M94 182 l4 8" stroke="#2d1566" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M104 182 l-4 8 M112 182 l0 9 M120 182 l4 8" stroke="#2d1566" strokeWidth="2.5" strokeLinecap="round" />
      {/* body */}
      <path d="M64 130 Q64 92 100 92 Q136 92 136 130 Q136 166 100 166 Q64 166 64 130 Z" fill="url(#champ-body)" stroke="#4a1fae" strokeWidth="3" />
      <path d="M86 128 Q100 118 114 128 Q114 152 100 158 Q86 152 86 128 Z" fill="#efe6ff" />
      {/* arms + claws */}
      <path d="M64 112 Q46 118 44 138" fill="none" stroke="#4a1fae" strokeWidth="10" strokeLinecap="round" />
      <path d="M136 112 Q154 118 156 138" fill="none" stroke="#4a1fae" strokeWidth="10" strokeLinecap="round" />
      {/* head */}
      <path d="M70 70 Q70 40 100 40 Q130 40 130 70 Q130 96 100 96 Q70 96 70 70 Z" fill="url(#champ-body)" stroke="#4a1fae" strokeWidth="3" />
      {/* crest horns */}
      <path d="M82 42 L74 18 L92 36 Z" fill="#ffd166" stroke="#d9a526" strokeWidth="2" />
      <path d="M118 42 L126 18 L108 36 Z" fill="#ffd166" stroke="#d9a526" strokeWidth="2" />
      <path d="M100 40 L100 14" stroke="#ffd166" strokeWidth="5" strokeLinecap="round" />
      {/* eyes - fierce */}
      <path d="M80 66 L94 70 L80 74 Z" fill="#ffffff" />
      <path d="M120 66 L106 70 L120 74 Z" fill="#ffffff" />
      <circle cx="86" cy="70" r="3.4" fill="#1b0a3a" />
      <circle cx="114" cy="70" r="3.4" fill="#1b0a3a" />
      {/* mouth with fangs */}
      <path d="M84 84 Q100 94 116 84" fill="none" stroke="#1b0a3a" strokeWidth="3" strokeLinecap="round" />
      <path d="M90 86 L94 93 L98 86 Z" fill="#ffffff" />
      <path d="M102 86 L106 93 L110 86 Z" fill="#ffffff" />
    </svg>
  );
}

export default Champion;
