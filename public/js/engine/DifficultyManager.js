import {
  PLANET_CONFIGS,
  PLATFORMS_PER_STAGE as _PLATFORMS_PER_STAGE,
} from '../data/PlanetConfig.js';
import { LLMClient } from './LLMClient.js';

const PLATFORM_BOUNDS = {
  width: [20, 250],
  gap: [60, 350],
  rise: [-30, 80],
  yOffset: [0, 60],
  powerExponent: [1.2, 4.0],
  surfaceFriction: [0.15, 1.8],
};

// Legacy bounds for backward compatibility with old flat format
const LEGACY_CONFIG_BOUNDS = {
  minW: [20, 200],
  maxW: [30, 250],
  minGap: [100, 350],
  maxGap: [150, 450],
  yOffset: [0, 60],
  minRise: [10, 60],
  maxRise: [20, 80],
  powerExponent: [1.2, 4.0],
};

export class DifficultyManager {
  constructor(analytics) {
    this._analytics = analytics;
    this._configs = [];
    this._stageMetrics = [];
    this._currentJumpMetrics = null;
    this._stageStartTime = null;
    this._llmClient = new LLMClient(analytics);
    this._pendingConfigs = new Map();
    this._requestedForStages = new Set();
    this._activeRequest = null;
    this._llmAppliedStages = new Set();
    this._platformSpecs = new Map(); // stageIndex -> array of 10 per-platform specs
    this._stageWinds = new Map(); // stageIndex -> wind speed (m/s)
    this._onConfigApplied = null;
    this._galaxyMode = false;
    this._humanTourist = false;
    this._totalStages = PLANET_CONFIGS.length;
    this._allPlanets = PLANET_CONFIGS; // reference for LLM input
    this.resetToDefaults();
  }

  /** Register callback: (stageIndex, config) => void */
  setOnConfigApplied(fn) {
    this._onConfigApplied = fn;
  }

  // --- Stage config access ---

  setHumanTouristMode(enabled) {
    this._humanTourist = enabled;
  }

  getStageConfig(stageIndex) {
    const idx = Math.min(stageIndex, this._configs.length - 1);
    let cfg;

    // If per-platform specs exist, synthesize a representative config (averages)
    const specs = this._platformSpecs.get(stageIndex);
    if (specs && specs.length > 0) {
      const avg = (key) => specs.reduce((s, p) => s + p[key], 0) / specs.length;
      const min = (key) => Math.min(...specs.map((p) => p[key]));
      const max = (key) => Math.max(...specs.map((p) => p[key]));
      cfg = {
        minW: min('width'),
        maxW: max('width'),
        minGap: min('gap'),
        maxGap: max('gap'),
        yOffset: avg('yOffset'),
        minRise: min('rise'),
        maxRise: max('rise'),
        powerExponent: avg('powerExponent'),
      };
    } else {
      cfg = { ...this._configs[idx] };
    }

    if (this._humanTourist) {
      cfg.minW *= 2.0;
      cfg.maxW *= 2.0;
      cfg.minGap *= 0.6;
      cfg.maxGap *= 0.6;
      cfg.yOffset *= 0.5;
      cfg.minRise *= 0.6;
      cfg.maxRise *= 0.6;
      cfg.powerExponent = cfg.powerExponent - (cfg.powerExponent - 1.5) * 0.5;
    }
    return cfg;
  }

  /**
   * Get per-platform spec for a specific platform within a stage.
   * Returns null if per-platform specs aren't available for this stage.
   */
  getPlatformSpec(stageIndex, platformInStage) {
    const specs = this._platformSpecs.get(stageIndex);
    if (!specs || platformInStage < 0 || platformInStage >= specs.length) return null;
    const spec = { ...specs[platformInStage] };
    if (this._humanTourist) {
      spec.width *= 2.0;
      spec.gap *= 0.6;
      spec.rise *= 0.6;
      spec.yOffset *= 0.5;
      spec.powerExponent = spec.powerExponent - (spec.powerExponent - 1.5) * 0.5;
    }
    return spec;
  }

  setStageConfig(stageIndex, partialConfig) {
    if (stageIndex < 0 || stageIndex >= this._configs.length) return;
    Object.assign(this._configs[stageIndex], partialConfig);
  }

  resetToDefaults() {
    this._galaxyMode = false;
    this._totalStages = PLANET_CONFIGS.length;
    this._allPlanets = PLANET_CONFIGS;
    this._configs = PLANET_CONFIGS.map((p) => ({
      minW: p.minW,
      maxW: p.maxW,
      minGap: p.minGap,
      maxGap: p.maxGap,
      yOffset: p.yOffset,
      minRise: p.minRise,
      maxRise: p.maxRise,
      powerExponent: p.powerExponent,
    }));
    this._stageMetrics = [];
    this._currentJumpMetrics = null;
    this._stageStartTime = null;
    this._pendingConfigs = new Map();
    this._requestedForStages = new Set();
    this._activeRequest = null;
    this._llmAppliedStages = new Set();
    this._platformSpecs = new Map();
    this._stageWinds = new Map();
  }

  /**
   * Initialize from galaxy data: tutorial (0-1) + galaxy planets (2+).
   * @param {Array} galaxyPlanets - Runtime planet objects from makePlanetFromGalaxy
   * @param {number} totalStages - Total number of stages (2 + galaxy count)
   */
  initFromGalaxy(galaxyPlanets, totalStages) {
    this._galaxyMode = true;
    this._totalStages = totalStages;
    const tutorialPlanets = PLANET_CONFIGS.slice(0, 2);
    this._allPlanets = [...tutorialPlanets, ...galaxyPlanets];
    this._configs = this._allPlanets.map((p) => ({
      minW: p.minW,
      maxW: p.maxW,
      minGap: p.minGap,
      maxGap: p.maxGap,
      yOffset: p.yOffset,
      minRise: p.minRise,
      maxRise: p.maxRise,
      powerExponent: p.powerExponent,
    }));
    this._stageMetrics = [];
    this._currentJumpMetrics = null;
    this._stageStartTime = null;
    this._pendingConfigs = new Map();
    this._requestedForStages = new Set();
    this._activeRequest = null;
    this._llmAppliedStages = new Set();
    this._platformSpecs = new Map();
    this._stageWinds = new Map();
  }

  // --- Metric collection ---

  beginStage(stageIndex) {
    this._stageStartTime = performance.now();
    this._currentJumpMetrics = {
      stageIndex,
      jumps: 0,
      jumpPowers: [],
      landings: 0,
      landingAccuracies: [],
      deaths: 0,
      deathCause: null,
      platformsReached: 0,
      perPlatformLandings: [],
      jumpsPerPlatform: {},
      slideFalls: 0,
    };
    if (this._analytics) {
      this._analytics.log('stage', 'begin', { stageIndex, stageNumber: stageIndex + 1 });
    }
  }

  recordJump({ power, platformIndex }) {
    if (!this._currentJumpMetrics) return;
    this._currentJumpMetrics.jumps++;
    this._currentJumpMetrics.jumpPowers.push(power);
    const jpp = this._currentJumpMetrics.jumpsPerPlatform;
    jpp[platformIndex] = (jpp[platformIndex] || 0) + 1;
    if (platformIndex > this._currentJumpMetrics.platformsReached) {
      this._currentJumpMetrics.platformsReached = platformIndex;
    }
  }

  recordLanding({ platformIndex, landingX, platformX, platformWidth }) {
    if (!this._currentJumpMetrics) return;
    this._currentJumpMetrics.landings++;
    const center = platformX + platformWidth / 2;
    const halfWidth = platformWidth / 2;
    const distFromCenter = Math.abs(landingX - center);
    const accuracy = Math.max(0, 1 - distFromCenter / halfWidth);
    this._currentJumpMetrics.landingAccuracies.push(accuracy);
    this._currentJumpMetrics.perPlatformLandings.push({
      platformIndex,
      accuracy,
      landingOffset: landingX - platformX,
      relativeOffset: (landingX - platformX) / platformWidth,
    });
    if (platformIndex > this._currentJumpMetrics.platformsReached) {
      this._currentJumpMetrics.platformsReached = platformIndex;
    }
  }

  recordDeath({ cause, platformIndex, stageIndex }) {
    if (!this._currentJumpMetrics) return;
    this._currentJumpMetrics.deaths = 1;
    this._currentJumpMetrics.deathCause = cause;
    if (platformIndex > this._currentJumpMetrics.platformsReached) {
      this._currentJumpMetrics.platformsReached = platformIndex;
    }
    this._finalizeCurrentMetrics(stageIndex);
  }

  endStage(stageIndex) {
    this._finalizeCurrentMetrics(stageIndex);
  }

  _finalizeCurrentMetrics(stageIndex) {
    const m = this._currentJumpMetrics;
    if (!m) return;

    const timeSpent =
      this._stageStartTime != null ? (performance.now() - this._stageStartTime) / 1000 : 0;

    const avgPower =
      m.jumpPowers.length > 0 ? m.jumpPowers.reduce((a, b) => a + b, 0) / m.jumpPowers.length : 0;

    const avgAccuracy =
      m.landingAccuracies.length > 0
        ? m.landingAccuracies.reduce((a, b) => a + b, 0) / m.landingAccuracies.length
        : 0;

    let powerVariance = 0;
    if (m.jumpPowers.length > 1) {
      const mean = avgPower;
      powerVariance =
        m.jumpPowers.reduce((sum, p) => sum + (p - mean) ** 2, 0) / m.jumpPowers.length;
    }

    // Derived: average jumps per platform
    const jppValues = Object.values(m.jumpsPerPlatform);
    const avgJumpsPerPlatform =
      jppValues.length > 0 ? jppValues.reduce((a, b) => a + b, 0) / jppValues.length : 0;

    // Derived: accuracy variance
    let accuracyVariance = 0;
    if (m.landingAccuracies.length > 1) {
      accuracyVariance =
        m.landingAccuracies.reduce((sum, a) => sum + (a - avgAccuracy) ** 2, 0) /
        m.landingAccuracies.length;
    }

    // Derived: player profile
    const playerProfile = this._detectPlayerProfile(m);

    this._stageMetrics[stageIndex] = {
      jumps: m.jumps,
      landings: m.landings,
      successRate: m.jumps > 0 ? m.landings / m.jumps : 0,
      avgPower,
      powerVariance,
      avgAccuracy,
      accuracyVariance,
      avgJumpsPerPlatform,
      slideFalls: m.slideFalls,
      playerProfile,
      perPlatformLandings: m.perPlatformLandings,
      deaths: m.deaths,
      deathCause: m.deathCause,
      timeSpent,
      platformsReached: m.platformsReached,
    };

    if (this._analytics) {
      this._analytics.log('stage', 'end', {
        stageIndex,
        stageNumber: stageIndex + 1,
        metrics: this._stageMetrics[stageIndex],
      });
    }

    this._currentJumpMetrics = null;
    this._stageStartTime = null;
  }

  // Expose metrics for debug panel
  getStageMetrics() {
    return this._stageMetrics;
  }

  setStageMetrics(index, metrics) {
    this._stageMetrics[index] = metrics;
  }

  getAllConfigs() {
    return this._configs.map((c) => ({ ...c }));
  }

  getPlatformSpecs(stageIndex) {
    return this._platformSpecs.get(stageIndex) || null;
  }

  // --- LLM interface ---

  getLLMInput(completedStageIndex) {
    const metrics = this._stageMetrics[completedStageIndex];
    if (!metrics) return null;

    const configIdx = Math.min(completedStageIndex, this._configs.length - 1);
    const planet = this._allPlanets[Math.min(completedStageIndex, this._allPlanets.length - 1)];
    // Recent history: last 3 stages for trend detection
    const recentHistory = [];
    for (let i = Math.max(0, completedStageIndex - 2); i <= completedStageIndex; i++) {
      if (this._stageMetrics[i]) {
        const m = this._stageMetrics[i];
        recentHistory.push({
          stage: i + 1,
          avgAccuracy: m.avgAccuracy,
          avgJumpsPerPlatform: m.avgJumpsPerPlatform,
          slideFalls: m.slideFalls,
          playerProfile: m.playerProfile,
          deaths: m.deaths,
        });
      }
    }

    const input = {
      completedStage: completedStageIndex,
      playerMetrics: { ...metrics, recentHistory },
      currentConfig: { ...this._configs[configIdx] },
      platformBounds: { ...PLATFORM_BOUNDS },
      planet: {
        name: planet.name,
        gReal: planet.gReal,
        airDensity: planet.airDensity,
        atmosphereLabel: planet.atmosphereLabel,
        surfaceFriction: planet.surfaceFriction,
        windMin: planet.windMin,
        windMax: planet.windMax,
        maxVX: planet.maxVX,
        maxVY: planet.maxVY,
        gravity: planet.gravity,
      },
    };
    if (this._galaxyMode) {
      input.galaxyMode = true;
      input.totalStages = this._totalStages;
    }
    return input;
  }

  getPartialMetrics() {
    const m = this._currentJumpMetrics;
    if (!m) return null;

    const timeSpent =
      this._stageStartTime != null ? (performance.now() - this._stageStartTime) / 1000 : 0;

    const avgPower =
      m.jumpPowers.length > 0 ? m.jumpPowers.reduce((a, b) => a + b, 0) / m.jumpPowers.length : 0;

    const avgAccuracy =
      m.landingAccuracies.length > 0
        ? m.landingAccuracies.reduce((a, b) => a + b, 0) / m.landingAccuracies.length
        : 0;

    let powerVariance = 0;
    if (m.jumpPowers.length > 1) {
      const mean = avgPower;
      powerVariance =
        m.jumpPowers.reduce((sum, p) => sum + (p - mean) ** 2, 0) / m.jumpPowers.length;
    }

    return {
      jumps: m.jumps,
      landings: m.landings,
      successRate: m.jumps > 0 ? m.landings / m.jumps : 0,
      avgPower,
      powerVariance,
      avgAccuracy,
      deaths: m.deaths,
      deathCause: m.deathCause,
      timeSpent,
      platformsReached: m.platformsReached,
      partial: true,
    };
  }

  getLLMInputEarly(currentStageIndex) {
    const metrics = this.getPartialMetrics();
    if (!metrics) return null;

    const configIdx = Math.min(currentStageIndex, this._configs.length - 1);
    const planet = this._allPlanets[Math.min(currentStageIndex, this._allPlanets.length - 1)];
    const input = {
      completedStage: currentStageIndex,
      playerMetrics: { ...metrics },
      currentConfig: { ...this._configs[configIdx] },
      platformBounds: { ...PLATFORM_BOUNDS },
      planet: {
        name: planet.name,
        gReal: planet.gReal,
        airDensity: planet.airDensity,
        atmosphereLabel: planet.atmosphereLabel,
        surfaceFriction: planet.surfaceFriction,
        windMin: planet.windMin,
        windMax: planet.windMax,
        maxVX: planet.maxVX,
        maxVY: planet.maxVY,
        gravity: planet.gravity,
      },
    };
    if (this._galaxyMode) {
      input.galaxyMode = true;
      input.totalStages = this._totalStages;
    }
    return input;
  }

  async requestNextStageConfigEarly(currentStageIndex) {
    const nextStage = currentStageIndex + 1;
    if (this._requestedForStages.has(nextStage)) {
      if (this._analytics) {
        this._analytics.log('llm', 'request-skipped', {
          stage: nextStage + 1,
          reason: 'already requested',
        });
      }
      return;
    }
    this._requestedForStages.add(nextStage);

    const llmInput = this.getLLMInputEarly(currentStageIndex);
    if (!llmInput) return;

    this._activeRequest = { stageIndex: nextStage, startTime: performance.now(), resolved: false };

    try {
      const config = await this._llmClient.requestDifficulty(llmInput);
      this._activeRequest.resolved = true;

      if (config) {
        this.applyLLMOutput(nextStage, config);
      }
    } catch {
      this._activeRequest.resolved = true;
    }
  }

  async requestNextStageConfig(completedStageIndex) {
    const nextStage = completedStageIndex + 1;

    if (this._requestedForStages.has(nextStage)) {
      if (this._analytics) {
        this._analytics.log('llm', 'request-skipped', {
          stage: nextStage + 1,
          reason: 'already prefetched',
        });
      }
      return;
    }
    this._requestedForStages.add(nextStage);

    const llmInput = this.getLLMInput(completedStageIndex);
    if (!llmInput) return;

    this._activeRequest = { stageIndex: nextStage, startTime: performance.now(), resolved: false };

    const promise = (async () => {
      try {
        const config = await this._llmClient.requestDifficulty(llmInput);
        this._activeRequest.resolved = true;

        if (config) {
          this.applyLLMOutput(nextStage, config);
        }
      } catch {
        this._activeRequest.resolved = true;
      }
    })();

    this._pendingConfigs.set(nextStage, promise);
  }

  applyLLMOutput(stageIndex, newConfig) {
    // In galaxy mode, extend configs array if needed
    while (stageIndex >= this._configs.length && this._galaxyMode) {
      const lastConfig = this._configs[this._configs.length - 1];
      this._configs.push({ ...lastConfig });
    }
    if (stageIndex < 0 || stageIndex >= this._configs.length) return;

    // Store wind for this stage
    if (newConfig.wind != null) {
      this._stageWinds.set(stageIndex, newConfig.wind);
    }

    // New per-platform format: { platforms: [...] }
    if (newConfig.platforms && Array.isArray(newConfig.platforms)) {
      const clampedSpecs = newConfig.platforms.map((spec) => {
        const clamped = {};
        for (const key of Object.keys(PLATFORM_BOUNDS)) {
          const [min, max] = PLATFORM_BOUNDS[key];
          clamped[key] = Math.max(min, Math.min(max, spec[key] ?? min));
        }
        return clamped;
      });
      this._platformSpecs.set(stageIndex, clampedSpecs);
      this._llmAppliedStages.add(stageIndex);

      if (this._analytics) {
        this._analytics.log('llm', 'config-applied', {
          stageIndex,
          stageNumber: stageIndex + 1,
          format: 'per-platform',
          platformCount: clampedSpecs.length,
          config: this.getStageConfig(stageIndex),
        });
      }

      if (this._onConfigApplied) {
        this._onConfigApplied(stageIndex, this.getStageConfig(stageIndex));
      }
      return;
    }

    // Legacy flat format fallback
    const clamped = {};
    for (const key of Object.keys(newConfig)) {
      if (!(key in LEGACY_CONFIG_BOUNDS)) continue;
      const [min, max] = LEGACY_CONFIG_BOUNDS[key];
      clamped[key] = Math.max(min, Math.min(max, newConfig[key]));
    }

    Object.assign(this._configs[stageIndex], clamped);
    this._llmAppliedStages.add(stageIndex);

    if (this._analytics) {
      this._analytics.log('llm', 'config-applied', {
        stageIndex,
        stageNumber: stageIndex + 1,
        format: 'legacy',
        config: { ...this._configs[stageIndex] },
      });
    }

    if (this._onConfigApplied) {
      this._onConfigApplied(stageIndex, { ...this._configs[stageIndex] });
    }
  }

  isLLMPending() {
    return !!this._activeRequest && !this._activeRequest.resolved;
  }

  getConfigSource(stageIndex) {
    return this._llmAppliedStages.has(stageIndex) ? 'llm' : 'default';
  }

  getStageWind(stageIndex) {
    return this._stageWinds.get(stageIndex) ?? 0;
  }

  recordSlideFall() {
    if (this._currentJumpMetrics) this._currentJumpMetrics.slideFalls++;
  }

  _detectPlayerProfile(metrics) {
    const acc = metrics.landingAccuracies;
    if (acc.length < 3) return 'unknown';
    const avg = acc.reduce((a, b) => a + b, 0) / acc.length;
    const variance = acc.reduce((sum, a) => sum + (a - avg) ** 2, 0) / acc.length;
    if (avg > 0.85 && variance < 0.01) return 'likely_ai';
    if (avg > 0.6 && variance < 0.05) return 'skilled_human';
    return 'struggling';
  }
}
