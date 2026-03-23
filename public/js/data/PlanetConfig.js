/**
 * Planetary physics configuration for each of the 10 levels.
 * Each level is a real celestial body with scientifically accurate gravity
 * and atmospheric drag. Replaces StageConfig.js as the source of truth.
 */

const EARTH_GRAVITY_PX = 1800;
const EARTH_G_REAL = 9.81;
const SCALE = EARTH_GRAVITY_PX / EARTH_G_REAL; // ~183.49 px per m/s²
const DRAG_COEFF = 0.0003; // tuning constant for F = DRAG_COEFF * airDensity * |v| * v

export const PLATFORMS_PER_STAGE = 10;

/** Default surface friction by body type (0.0–2.0 scale). */
export const BODY_TYPE_FRICTION = {
  icy: 0.2,
  gas_giant: 0.5,
  hazy: 0.5,
  earth_like: 0.8,
  barren: 0.8,
  rocky: 1.3,
  volcanic: 1.5,
  exotic: 1.7,
};

/**
 * Compute velocity scale factor: sqrt(g_planet / g_earth)
 * Lower gravity → lower launch velocity → keeps jump distances roughly consistent.
 */
function velScale(gravityPx) {
  return Math.sqrt(gravityPx / EARTH_GRAVITY_PX);
}

/** Base velocity ranges (Earth-level) */
const BASE_MIN_VX = 150;
const BASE_MAX_VX = 600;
const BASE_MIN_VY = -400;
const BASE_MAX_VY = -900;
const BASE_TERMINAL_VY = 1200;

function makePlanet({
  name, body, gReal, airDensity,
  minW, maxW, minGap, maxGap, yOffset,
  minRise, maxRise,
  powerExponent,
  surfaceFriction,
  windMin, windMax,
  skyColor, groundColor, platformColor, platformStroke,
  description, atmosphereLabel,
}) {
  const gravity = Math.round(gReal * SCALE);
  const vs = velScale(gravity);
  return {
    name,
    body,
    gReal,
    gravity,
    airDensity,
    dragCoeff: DRAG_COEFF,
    velocityScale: vs,
    minVX: BASE_MIN_VX * vs,
    maxVX: BASE_MAX_VX * vs,
    minVY: BASE_MIN_VY * vs,
    maxVY: BASE_MAX_VY * vs,
    terminalVY: BASE_TERMINAL_VY * vs,
    // Platform generation
    minW, maxW, minGap, maxGap, yOffset,
    minRise, maxRise,
    // Power curve — higher exponent = narrower timing window = more precision required
    powerExponent: powerExponent || 1.8,
    // Surface friction (0.0–2.0): <1 = slippery slide, 1 = instant stop, >1 = rough footing delay
    surfaceFriction: surfaceFriction ?? 1.0,
    // Wind range (m/s)
    windMin: windMin ?? 0,
    windMax: windMax ?? 0,
    // Visuals
    skyColor, groundColor, platformColor, platformStroke,
    description, atmosphereLabel,
  };
}

export const PLANET_CONFIGS = [
  // Level 1: Earth — Tutorial (human-playable)
  makePlanet({
    name: 'Earth', body: 'earth', gReal: 9.81, airDensity: 1.225,
    minW: 140, maxW: 170, minGap: 100, maxGap: 150, yOffset: 0,
    minRise: 25, maxRise: 45,
    powerExponent: 1.5, surfaceFriction: 1.0, windMin: 0, windMax: 25,
    skyColor: '#87CEEB', groundColor: '#4a7c3f',
    platformColor: '#6b8f71', platformStroke: '#5a7d60',
    description: 'Home planet. Standard gravity, familiar atmosphere.',
    atmosphereLabel: 'Dense',
  }),
  // Level 2: Stratosphere — Humans start struggling
  makePlanet({
    name: 'Stratosphere', body: 'stratosphere', gReal: 9.65, airDensity: 0.001,
    minW: 75, maxW: 105, minGap: 130, maxGap: 210, yOffset: 15,
    minRise: 35, maxRise: 60,
    powerExponent: 2.0, surfaceFriction: 1.0, windMin: 0, windMax: 60,
    skyColor: '#0a0a2e', groundColor: '#1a1a3e',
    platformColor: '#4a90d9', platformStroke: '#3a7bc8',
    description: 'Edge of space. No air — trajectories fly unpredictably far.',
    atmosphereLabel: 'Vacuum',
  }),
  // Level 3: Moon — Very hard for humans
  makePlanet({
    name: 'Moon', body: 'moon', gReal: 1.62, airDensity: 0,
    minW: 50, maxW: 75, minGap: 110, maxGap: 200, yOffset: 25,
    minRise: 40, maxRise: 65,
    powerExponent: 2.2, surfaceFriction: 0.9, windMin: 0, windMax: 0,
    skyColor: '#000000', groundColor: '#8a8a8a',
    platformColor: '#b0b0b0', platformStroke: '#909090',
    description: 'Low gravity, no atmosphere. Floaty arcs demand computation.',
    atmosphereLabel: 'Vacuum',
  }),
  // Level 4: Mars — AI-required territory begins
  makePlanet({
    name: 'Mars', body: 'mars', gReal: 3.72, airDensity: 0.020,
    minW: 40, maxW: 60, minGap: 130, maxGap: 230, yOffset: 30,
    minRise: 40, maxRise: 65,
    powerExponent: 2.4, surfaceFriction: 0.85, windMin: 0, windMax: 30,
    skyColor: '#c2742e', groundColor: '#8b4513',
    platformColor: '#c27a5a', platformStroke: '#a8654a',
    description: 'Light gravity, trace atmosphere. The Red Planet.',
    atmosphereLabel: 'Thin',
  }),
  // Level 5: Mercury
  makePlanet({
    name: 'Mercury', body: 'mercury', gReal: 3.70, airDensity: 0,
    minW: 35, maxW: 55, minGap: 140, maxGap: 250, yOffset: 35,
    minRise: 45, maxRise: 70,
    powerExponent: 2.6, surfaceFriction: 1.3, windMin: 0, windMax: 0,
    skyColor: '#000000', groundColor: '#6b6b6b',
    platformColor: '#9a8a7a', platformStroke: '#7a6a5a',
    description: 'Similar gravity to Mars, no air. Scorched by the Sun.',
    atmosphereLabel: 'Vacuum',
  }),
  // Level 6: Venus — Drag makes trajectories wildly nonlinear
  makePlanet({
    name: 'Venus', body: 'venus', gReal: 8.87, airDensity: 65.0,
    minW: 32, maxW: 50, minGap: 100, maxGap: 190, yOffset: 35,
    minRise: 30, maxRise: 55,
    powerExponent: 2.8, surfaceFriction: 0.5, windMin: 20, windMax: 100,
    skyColor: '#d4a050', groundColor: '#8b6914',
    platformColor: '#e8943a', platformStroke: '#c87e2e',
    description: 'Near-Earth gravity but EXTREME atmospheric drag warps all arcs.',
    atmosphereLabel: 'Dense',
  }),
  // Level 7: Titan — Low-g + thick drag = alien trajectories
  makePlanet({
    name: 'Titan', body: 'titan', gReal: 1.35, airDensity: 5.4,
    minW: 30, maxW: 45, minGap: 110, maxGap: 210, yOffset: 40,
    minRise: 40, maxRise: 65,
    powerExponent: 3.0, surfaceFriction: 0.5, windMin: 0, windMax: 10,
    skyColor: '#c08040', groundColor: '#3a2a1a',
    platformColor: '#d9d04a', platformStroke: '#b8b03a',
    description: 'Low gravity + thick atmosphere. Alien trajectory physics.',
    atmosphereLabel: 'Dense',
  }),
  // Level 8: Jupiter — Crushing gravity + narrow targets
  makePlanet({
    name: 'Jupiter', body: 'jupiter', gReal: 24.79, airDensity: 1.326,
    minW: 28, maxW: 42, minGap: 110, maxGap: 230, yOffset: 40,
    minRise: 25, maxRise: 50,
    powerExponent: 3.2, surfaceFriction: 0.5, windMin: 50, windMax: 180,
    skyColor: '#c4956a', groundColor: '#8b6848',
    platformColor: '#d4a84a', platformStroke: '#b89038',
    description: 'Crushing gravity. Razor-thin platforms in gas bands.',
    atmosphereLabel: 'Dense',
  }),
  // Level 9: Europa — Extreme precision in vacuum
  makePlanet({
    name: 'Europa', body: 'europa', gReal: 1.31, airDensity: 0,
    minW: 25, maxW: 38, minGap: 130, maxGap: 250, yOffset: 45,
    minRise: 45, maxRise: 70,
    powerExponent: 3.4, surfaceFriction: 0.2, windMin: 0, windMax: 0,
    skyColor: '#000010', groundColor: '#d0e8f0',
    platformColor: '#a0d0e0', platformStroke: '#80b0c0',
    description: 'Low-g vacuum on icy moon. Pixel-perfect precision required.',
    atmosphereLabel: 'Vacuum',
  }),
  // Level 10: Pluto — Near-impossible
  makePlanet({
    name: 'Pluto', body: 'pluto', gReal: 0.62, airDensity: 0,
    minW: 22, maxW: 35, minGap: 110, maxGap: 230, yOffset: 50,
    minRise: 50, maxRise: 75,
    powerExponent: 3.6, surfaceFriction: 0.25, windMin: 0, windMax: 0,
    skyColor: '#050510', groundColor: '#8090a0',
    platformColor: '#7a8a9a', platformStroke: '#5a6a7a',
    description: 'Near-zero gravity. Millisecond timing determines everything.',
    atmosphereLabel: 'Vacuum',
  }),
];

export const TOTAL_PLATFORMS = PLANET_CONFIGS.length * PLATFORMS_PER_STAGE;

/** First 2 planets are tutorials (Earth + Stratosphere). */
export const TUTORIAL_PLANETS = PLANET_CONFIGS.slice(0, 2);

/**
 * Convert a galaxy planet JSON entry into the same runtime format as makePlanet().
 * Used for galaxy-mode levels (stage 2+).
 */
export function makePlanetFromGalaxy(galaxyPlanet) {
  const gravity = Math.round(galaxyPlanet.gReal * SCALE);
  const vs = velScale(gravity);
  const bodyType = galaxyPlanet.bodyType;
  return {
    name: galaxyPlanet.name,
    body: bodyType, // galaxy planets use bodyType for rendering dispatch
    bodyType,
    gReal: galaxyPlanet.gReal,
    gravity,
    airDensity: galaxyPlanet.airDensity,
    dragCoeff: DRAG_COEFF,
    velocityScale: vs,
    minVX: BASE_MIN_VX * vs,
    maxVX: BASE_MAX_VX * vs,
    minVY: BASE_MIN_VY * vs,
    maxVY: BASE_MAX_VY * vs,
    terminalVY: BASE_TERMINAL_VY * vs,
    // Platform generation
    minW: galaxyPlanet.minW,
    maxW: galaxyPlanet.maxW,
    minGap: galaxyPlanet.minGap,
    maxGap: galaxyPlanet.maxGap,
    yOffset: galaxyPlanet.yOffset,
    minRise: galaxyPlanet.minRise,
    maxRise: galaxyPlanet.maxRise,
    powerExponent: galaxyPlanet.powerExponent || 2.0,
    // Surface friction: explicit value > bodyType default > 1.0
    surfaceFriction: galaxyPlanet.surfaceFriction ?? BODY_TYPE_FRICTION[bodyType] ?? 1.0,
    // Wind range (m/s)
    windMin: galaxyPlanet.windMin ?? 0,
    windMax: galaxyPlanet.windMax ?? 0,
    // Visuals
    skyColor: galaxyPlanet.skyColor,
    groundColor: galaxyPlanet.groundColor,
    platformColor: galaxyPlanet.platformColor,
    platformStroke: galaxyPlanet.platformStroke,
    description: galaxyPlanet.description || '',
    atmosphereLabel: galaxyPlanet.atmosphereLabel || 'Vacuum',
  };
}

// Re-export base constants for reference
export { EARTH_GRAVITY_PX, EARTH_G_REAL, SCALE, DRAG_COEFF };
export { BASE_MIN_VX, BASE_MAX_VX, BASE_MIN_VY, BASE_MAX_VY, BASE_TERMINAL_VY };
