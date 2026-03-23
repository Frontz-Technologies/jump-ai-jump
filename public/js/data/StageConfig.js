/**
 * Backward-compatible re-export from PlanetConfig.
 * Use PLANET_CONFIGS directly in new code.
 */
import { PLANET_CONFIGS, PLATFORMS_PER_STAGE, TOTAL_PLATFORMS } from './PlanetConfig.js';

/** Map planet configs to the old stage config shape for backward compat. */
export const STAGE_CONFIGS = PLANET_CONFIGS.map(p => ({
  minW: p.minW,
  maxW: p.maxW,
  minGap: p.minGap,
  maxGap: p.maxGap,
  yOffset: p.yOffset,
  minRise: p.minRise,
  maxRise: p.maxRise,
  powerExponent: p.powerExponent,
  wallSpeed: 0, // death wall removed
}));

export const DEATH_WALL_START_OFFSET = 400;
export { PLATFORMS_PER_STAGE, TOTAL_PLATFORMS };
