import type { GrowthStage } from "@ddm/shared";
import { Baby } from "./Baby.tsx";
import { Rookie } from "./Rookie.tsx";
import { Champion } from "./Champion.tsx";
import { Ultimate } from "./Ultimate.tsx";
import type { MonsterSpriteProps } from "./Baby.tsx";

export interface MonsterSpriteSelectProps extends MonsterSpriteProps {
  /** Which growth stage sprite to render. */
  stageId: GrowthStage;
}

/** Pick and render the correct per-stage SVG creature. */
export function MonsterSprite({ stageId, size, title }: MonsterSpriteSelectProps) {
  switch (stageId) {
    case "baby":
      return <Baby size={size} title={title} />;
    case "rookie":
      return <Rookie size={size} title={title} />;
    case "champion":
      return <Champion size={size} title={title} />;
    case "ultimate":
      return <Ultimate size={size} title={title} />;
    default:
      return <Baby size={size} title={title} />;
  }
}

export default MonsterSprite;
