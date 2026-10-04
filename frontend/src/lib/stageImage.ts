/**
 * Maps each growth {@link Stage} to its prepared image asset.
 *
 * The user explicitly requested real image assets (not emoji / ASCII). Each
 * stage has a distinct hand-authored SVG under `../assets/monster/` that
 * escalates in size and complexity as the monster evolves.
 */
import { Stage } from '@digital-monster/shared';

import babyImg from '../assets/monster/baby.svg';
import rookieImg from '../assets/monster/rookie.svg';
import championImg from '../assets/monster/champion.svg';
import ultimateImg from '../assets/monster/ultimate.svg';

/** Stage -> imported image asset URL (resolved by Vite at build time). */
export const STAGE_IMAGE: Readonly<Record<Stage, string>> = {
  [Stage.BABY]: babyImg,
  [Stage.ROOKIE]: rookieImg,
  [Stage.CHAMPION]: championImg,
  [Stage.ULTIMATE]: ultimateImg,
};

/** Returns the image asset for the given stage. */
export function stageImage(stage: Stage): string {
  return STAGE_IMAGE[stage];
}
