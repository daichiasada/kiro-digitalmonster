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

/**
 * Pick and render the correct per-stage SVG creature.
 *
 * `form` (issue #38) selects the evolution-branch variant; it is threaded to
 * the stage component which overlays a small per-variant accent. An undefined
 * `form` behaves as `"base"` (byte-identical to the pre-#38 rendering), and the
 * baby stage always renders base regardless of `form` (it has no branch yet).
 */
export function MonsterSprite({ stageId, size, title, form }: MonsterSpriteSelectProps) {
  switch (stageId) {
    case "baby":
      // Baby has no branch variant; always render the base look.
      return <Baby size={size} title={title} />;
    case "rookie":
      return <Rookie size={size} title={title} form={form} />;
    case "champion":
      return <Champion size={size} title={title} form={form} />;
    case "ultimate":
      return <Ultimate size={size} title={title} form={form} />;
    default:
      return <Baby size={size} title={title} />;
  }
}

export default MonsterSprite;
