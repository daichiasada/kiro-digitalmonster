import type { BattleResult, BattleWinner, Monster } from "./types.ts";

/**
 * Small deterministic pseudo-random number generator (mulberry32).
 * Given the same seed it always produces the same sequence, which keeps
 * battle simulations reproducible in tests.
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Max number of turns before we call a draw, so the loop always terminates. */
const MAX_TURNS = 100;

/**
 * Compute damage from attacker to defender. Damage is atk minus def with a
 * small floor, modulated by a random factor in roughly [0.85, 1.15].
 */
function computeDamage(atk: number, def: number, roll: number): number {
  const base = Math.max(1, atk - Math.floor(def / 2));
  const factor = 0.85 + roll * 0.3;
  return Math.max(1, Math.round(base * factor));
}

/**
 * Simulate a simple turn-based battle between two monsters.
 *
 * The player attacks first each turn, then the enemy (if still alive).
 * Pass a `seed` for a deterministic result (used by tests). If no seed is
 * given, a time-based seed is used.
 */
export function simulateBattle(
  player: Monster,
  enemy: Monster,
  seed: number = Date.now(),
): BattleResult {
  const rng = createRng(seed);
  let playerHp = Math.max(0, Math.round(player.stats.hp));
  let enemyHp = Math.max(0, Math.round(enemy.stats.hp));
  const log: string[] = [];
  let turns = 0;

  while (playerHp > 0 && enemyHp > 0 && turns < MAX_TURNS) {
    turns += 1;

    const playerDmg = computeDamage(player.stats.atk, enemy.stats.def, rng());
    enemyHp = Math.max(0, enemyHp - playerDmg);
    log.push(`T${turns}: ${player.name} hits ${enemy.name} for ${playerDmg} (enemy HP ${enemyHp})`);
    if (enemyHp <= 0) {
      break;
    }

    const enemyDmg = computeDamage(enemy.stats.atk, player.stats.def, rng());
    playerHp = Math.max(0, playerHp - enemyDmg);
    log.push(`T${turns}: ${enemy.name} hits ${player.name} for ${enemyDmg} (player HP ${playerHp})`);
  }

  let winner: BattleWinner;
  if (playerHp <= 0 && enemyHp <= 0) {
    winner = "draw";
  } else if (enemyHp <= 0) {
    winner = "player";
  } else if (playerHp <= 0) {
    winner = "enemy";
  } else {
    // Ran out of turns: higher remaining HP wins, else draw.
    if (playerHp > enemyHp) {
      winner = "player";
    } else if (enemyHp > playerHp) {
      winner = "enemy";
    } else {
      winner = "draw";
    }
  }

  log.push(`Result: ${winner}`);

  return {
    winner,
    log,
    playerHpAfter: playerHp,
    enemyHpAfter: enemyHp,
    turns,
  };
}
