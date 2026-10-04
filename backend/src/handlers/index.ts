/**
 * Re-exports the four Lambda handlers under stable named exports used by the
 * CDK stack to wire each handler to its API Gateway route.
 */
export { handler as getMonster } from './getMonster.js';
export { handler as saveMonster } from './saveMonster.js';
export { handler as train } from './train.js';
export { handler as chat } from './chat.js';
