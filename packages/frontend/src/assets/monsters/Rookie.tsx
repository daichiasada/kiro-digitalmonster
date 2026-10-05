/**
 * 成長期 (rookie) sprite: a stocky little reptile-dragon standing on two feet.
 * Clearly bigger and more defined than the baby.
 */
import type { MonsterSpriteProps } from "./Baby.tsx";
import { FormAccent } from "./formAccent.tsx";

export function Rookie({ size = 160, title = "成長期のAIモンスター", form }: MonsterSpriteProps) {
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
        <linearGradient id="rookie-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8fd3f4" />
          <stop offset="100%" stopColor="#3f9bd6" />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="182" rx="52" ry="11" fill="#000000" opacity="0.14" />
      {/* tail */}
      <path d="M138 150 Q172 150 166 120 Q158 142 138 138 Z" fill="#3f9bd6" />
      {/* legs */}
      <rect x="74" y="150" width="18" height="28" rx="8" fill="#3f9bd6" />
      <rect x="108" y="150" width="18" height="28" rx="8" fill="#3f9bd6" />
      {/* body */}
      <ellipse cx="100" cy="120" rx="48" ry="52" fill="url(#rookie-body)" stroke="#2b7bb0" strokeWidth="3" />
      {/* belly */}
      <ellipse cx="100" cy="130" rx="26" ry="30" fill="#eaf7ff" />
      {/* arms */}
      <path d="M58 112 Q44 120 50 134" fill="none" stroke="#2b7bb0" strokeWidth="9" strokeLinecap="round" />
      <path d="M142 112 Q156 120 150 134" fill="none" stroke="#2b7bb0" strokeWidth="9" strokeLinecap="round" />
      {/* head */}
      <circle cx="100" cy="78" r="38" fill="url(#rookie-body)" stroke="#2b7bb0" strokeWidth="3" />
      {/* horn */}
      <path d="M100 44 L92 24 L108 24 Z" fill="#f6a5c0" stroke="#d47a99" strokeWidth="2" />
      {/* eyes */}
      <circle cx="86" cy="76" r="7" fill="#ffffff" />
      <circle cx="114" cy="76" r="7" fill="#ffffff" />
      <circle cx="87" cy="77" r="3.6" fill="#1b2a4a" />
      <circle cx="113" cy="77" r="3.6" fill="#1b2a4a" />
      {/* smile */}
      <path d="M86 94 Q100 106 114 94" fill="none" stroke="#1b2a4a" strokeWidth="3" strokeLinecap="round" />
      {/* small fangs */}
      <path d="M92 98 L96 104 L100 98 Z" fill="#ffffff" />
      {/* per-variant accent (issue #38); null for base/undefined */}
      <FormAccent form={form} stage="rookie" />
    </svg>
  );
}

export default Rookie;
