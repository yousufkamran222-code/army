// All tuning numbers live here (plus per-unit stats in units.ts and relic numbers in relics.ts).

export const WORLD = {
  length: 1400, // lane length in world units
  laneTop: 0, // y range for stickmen depth band
  laneDepth: 120,
  playerStatueX: 60,
  enemyStatueX: 1340,
  statueHalfWidth: 26,
  binSize: 16,
  gravity: 520,
};

export const SIM = {
  dt: 1 / 30,
  timeLimit: 90, // seconds; fallback winner after this
  maxUnits: 9000,
  maxProjectiles: 5000,
  spawnRateMin: 14, // stickmen per second per side at minimum
  deployTime: 5, // whole army deploys within ~this many seconds
  crowdBase: 9, // allies per bin before units queue behind
  crowdPerAlive: 1 / 22,
  corpseLife: 7, // seconds a corpse can be raised
  maxCorpses: 400,
  arrowSpeed: 420,
  boltSpeed: 360,
  retargetTicks: 4,
  speedScale: 1.45, // global walk speed multiplier (unit speeds in units.ts are relative)
};

export const STATUE = {
  playerHp: 500,
  enemyHpBase: 300,
  enemyHpPerBattle: 120,
};

export const ECONOMY = {
  startGold: 10,
  baseReward: 7,
  rewardPerBattle: 1, // + battleIndex
  fastWinTime: 30,
  fastWinBonus: 2,
  flawlessBonus: 2, // statue undamaged
  interestPer: 5,
  interestCap: 5,
  rerollBase: 1,
  rerollStep: 1,
  slotBaseCost: 8,
  slotCostStep: 4,
  maxSlots: 7,
  startSlots: 5,
  maxRelics: 5,
  relicCost: { common: 4, uncommon: 6, rare: 9 } as Record<string, number>,
  sellFraction: 0.5,
  // copies needed for each level (index = level-1)
  levelCopies: [1, 3, 9],
  levelStatMult: 1.6,
  levelSizeMult: 1.12,
  shopUnitOffers: 3,
  shopRelicOffers: 2,
  // relic rarity weights by battle index (1..8)
  rarityWeights: (battle: number) => ({
    common: Math.max(30, 70 - battle * 6),
    uncommon: 25 + battle * 3,
    rare: 5 + battle * 3,
  }),
};

export const ENEMY = {
  // gold-equivalent budget for the enemy army in battle i (1-based)
  budget: (i: number) => Math.round(7 + 4 * (i - 1) + 0.32 * (i - 1) * (i - 1)),
  statMult: (i: number) => 1 + 0.04 * (i - 1),
  bossBattles: [4, 8],
};

export const COMMANDS_PER_BATTLE = 2;

export const JUICE = {
  shakeHeavy: 7,
  shakeBoss: 14,
  shakeDecay: 6, // per second (exponential)
  hitStopBoss: 0.09,
  hitStopHeavy: 0.035,
  statueSlowMo: 0.25,
  statueSlowMoTime: 2.2,
  maxRagdolls: 700,
  maxSparks: 900,
  maxDamageNumbers: 50,
  damageNumberMinGap: 0.03,
  relicLabelWindow: 0.7,
  cameraMinView: 640,
  cameraLerp: 2.2,
};
