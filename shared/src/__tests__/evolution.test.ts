import { describe, it, expect } from 'vitest';
import {
  Stage,
  type Monster,
  BEDROCK_MODEL_IDS,
  getModelForStage,
  canConverse,
  computeStage,
  nextStage,
  EVOLUTION_THRESHOLDS,
} from '../index.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return {
    clientId: 'client-1',
    name: 'Mon',
    stage: Stage.BABY,
    trainingCount: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('bedrock model mapping', () => {
  it('BABY (幼年期) has no model and cannot converse', () => {
    expect(getModelForStage(Stage.BABY)).toBeNull();
    expect(canConverse(Stage.BABY)).toBe(false);
  });

  it('ROOKIE/CHAMPION/ULTIMATE map to Haiku/Sonnet/Opus and can converse', () => {
    expect(getModelForStage(Stage.ROOKIE)).toBe(BEDROCK_MODEL_IDS.HAIKU);
    expect(getModelForStage(Stage.CHAMPION)).toBe(BEDROCK_MODEL_IDS.SONNET);
    expect(getModelForStage(Stage.ULTIMATE)).toBe(BEDROCK_MODEL_IDS.OPUS);

    expect(canConverse(Stage.ROOKIE)).toBe(true);
    expect(canConverse(Stage.CHAMPION)).toBe(true);
    expect(canConverse(Stage.ULTIMATE)).toBe(true);
  });

  it('uses the official Anthropic Bedrock model ids', () => {
    expect(BEDROCK_MODEL_IDS.HAIKU).toBe('anthropic.claude-3-haiku-20240307-v1:0');
    expect(BEDROCK_MODEL_IDS.SONNET).toBe('anthropic.claude-3-5-sonnet-20240620-v1:0');
    expect(BEDROCK_MODEL_IDS.OPUS).toBe('anthropic.claude-3-opus-20240229-v1:0');
  });
});

describe('computeStage: both training AND time gating', () => {
  it('stays BABY before any threshold is met', () => {
    expect(computeStage(0, 0)).toBe(Stage.BABY);
  });

  it('does not evolve when only training count is met (time missing)', () => {
    const gate = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    expect(computeStage(gate.trainingCount, 0)).toBe(Stage.BABY);
    expect(computeStage(gate.trainingCount, gate.elapsedMs - 1)).toBe(Stage.BABY);
  });

  it('does not evolve when only elapsed time is met (training missing)', () => {
    const gate = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    expect(computeStage(0, gate.elapsedMs)).toBe(Stage.BABY);
    expect(computeStage(gate.trainingCount - 1, gate.elapsedMs)).toBe(Stage.BABY);
  });

  it('evolves to ROOKIE only when BOTH training and time are met', () => {
    const gate = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    expect(computeStage(gate.trainingCount, gate.elapsedMs)).toBe(Stage.ROOKIE);
  });

  it('evolves to CHAMPION when its gate is met', () => {
    const gate = EVOLUTION_THRESHOLDS[Stage.CHAMPION];
    expect(computeStage(gate.trainingCount, gate.elapsedMs)).toBe(Stage.CHAMPION);
  });

  it('evolves to ULTIMATE when its gate is met', () => {
    const gate = EVOLUTION_THRESHOLDS[Stage.ULTIMATE];
    expect(computeStage(gate.trainingCount, gate.elapsedMs)).toBe(Stage.ULTIMATE);
  });
});

describe('computeStage: never skips stages', () => {
  it('caps at ROOKIE if time qualifies for CHAMPION but training only meets ROOKIE gate', () => {
    // Enough time for CHAMPION, but training only clears the ROOKIE gate.
    const rookie = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    const champion = EVOLUTION_THRESHOLDS[Stage.CHAMPION];
    const trainingBetween = champion.trainingCount - 1;
    expect(trainingBetween).toBeGreaterThanOrEqual(rookie.trainingCount);
    expect(computeStage(trainingBetween, champion.elapsedMs)).toBe(Stage.ROOKIE);
  });

  it('caps at CHAMPION if training qualifies for ULTIMATE but time only meets CHAMPION gate', () => {
    const champion = EVOLUTION_THRESHOLDS[Stage.CHAMPION];
    const ultimate = EVOLUTION_THRESHOLDS[Stage.ULTIMATE];
    const timeBetween = ultimate.elapsedMs - 1;
    expect(timeBetween).toBeGreaterThanOrEqual(champion.elapsedMs);
    expect(computeStage(ultimate.trainingCount, timeBetween)).toBe(Stage.CHAMPION);
  });
});

describe('nextStage', () => {
  it('returns the current stage when no evolution is due', () => {
    const m = makeMonster({ trainingCount: 1, createdAt: 0 });
    expect(nextStage(m, 1 * MINUTE)).toBe(Stage.BABY);
  });

  it('advances to ROOKIE when both gates are met', () => {
    const gate = EVOLUTION_THRESHOLDS[Stage.ROOKIE];
    const m = makeMonster({ trainingCount: gate.trainingCount, createdAt: 0 });
    expect(nextStage(m, gate.elapsedMs)).toBe(Stage.ROOKIE);
  });

  it('never regresses below the stored stage', () => {
    const m = makeMonster({ stage: Stage.CHAMPION, trainingCount: 0, createdAt: 0 });
    // computeStage(0,0) would be BABY, but nextStage must not regress.
    expect(nextStage(m, 0)).toBe(Stage.CHAMPION);
  });

  it('handles a now earlier than createdAt without regressing or crashing', () => {
    const m = makeMonster({ stage: Stage.BABY, trainingCount: 100, createdAt: 10 * HOUR });
    expect(nextStage(m, 0)).toBe(Stage.BABY);
  });
});
