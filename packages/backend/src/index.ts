/**
 * Barrel of Lambda handler entry points. CDK (infra) references the handler
 * files directly, but this makes the package importable as a whole and gives
 * `tsc` a single root to type-check from.
 */
export { handler as getMonsterHandler } from "./handlers/getMonster.ts";
export { handler as saveMonsterHandler } from "./handlers/saveMonster.ts";
export { handler as chatHandler } from "./handlers/chat.ts";
export { handler as battleHandler } from "./handlers/battle.ts";
