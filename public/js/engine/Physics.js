/** Physics constants and helpers — parameterized by planet. */

// Base constants (Earth-level) for reference
export const BASE_GRAVITY = 1800;
export const BASE_MIN_VX = 150;
export const BASE_MAX_VX = 600;
export const BASE_MIN_VY = -400;
export const BASE_MAX_VY = -900;
export const BASE_TERMINAL_VY = 1200;

// Legacy exports (kept for backward compat with debug panel etc.)
export const GRAVITY = BASE_GRAVITY;
export const MIN_VX = BASE_MIN_VX;
export const MAX_VX = BASE_MAX_VX;
export const MIN_VY = BASE_MIN_VY;
export const MAX_VY = BASE_MAX_VY;
export const TERMINAL_VY = BASE_TERMINAL_VY;

/**
 * Convert power (0..1) to initial velocity vector.
 * @param {number} power - 0..1
 * @param {object} [planet] - planet config with minVX/maxVX/minVY/maxVY
 * @returns {{ vx: number, vy: number }}
 */
export function powerToVelocity(power, planet) {
  const minVX = planet ? planet.minVX : BASE_MIN_VX;
  const maxVX = planet ? planet.maxVX : BASE_MAX_VX;
  const minVY = planet ? planet.minVY : BASE_MIN_VY;
  const maxVY = planet ? planet.maxVY : BASE_MAX_VY;
  // Exponential curve: higher exponent = narrower timing window = more AI-demanding
  const exponent = planet ? (planet.powerExponent || 1.8) : 1.8;
  const curved = Math.pow(power, exponent);
  return {
    vx: minVX + curved * (maxVX - minVX),
    vy: minVY + curved * (maxVY - minVY),
  };
}

/**
 * Apply physics for one tick.
 * @param {object} char - must have x, y, vx, vy
 * @param {number} dt - delta time in seconds
 * @param {object} [planet] - planet config with gravity, airDensity, dragCoeff, terminalVY
 * @param {number} [wind=0] - wind speed in m/s (negative=headwind, positive=tailwind)
 */
export function applyPhysics(char, dt, planet, wind = 0) {
  const gravity = planet ? planet.gravity : BASE_GRAVITY;
  const terminalVY = planet ? planet.terminalVY : BASE_TERMINAL_VY;

  // Gravity
  char.vy += gravity * dt;

  // Wind: horizontal acceleration (m/s converted to px/s² via SCALE)
  if (wind !== 0) {
    const SCALE = 183.49; // same as PlanetConfig SCALE (px per m/s²)
    const windAccel = wind * SCALE;
    char.vx += windAccel * dt;
  }

  // Velocity-squared drag (opposes motion)
  if (planet && planet.airDensity > 0) {
    const dragX = planet.dragCoeff * planet.airDensity * Math.abs(char.vx) * char.vx;
    const dragY = planet.dragCoeff * planet.airDensity * Math.abs(char.vy) * char.vy;
    // Clamp: drag cannot reverse velocity direction in a single frame
    char.vx -= Math.sign(dragX) * Math.min(Math.abs(dragX * dt), Math.abs(char.vx));
    char.vy -= Math.sign(dragY) * Math.min(Math.abs(dragY * dt), Math.abs(char.vy));
  }

  // Terminal velocity (planet-scaled)
  if (char.vy > terminalVY) char.vy = terminalVY;

  char.x += char.vx * dt;
  char.y += char.vy * dt;
}

/**
 * Estimate how far a character will slide after landing.
 * Used by auto-play solver to compensate for friction.
 * @param {number} landingVx - horizontal velocity at moment of landing
 * @param {number} surfaceFriction - planet surface friction (0.0–2.0)
 * @returns {number} signed slide distance in pixels
 */
export function estimateSlideDistance(landingVx, surfaceFriction) {
  if (surfaceFriction >= 1.0) return 0; // no slide for grippy/rough surfaces
  let vx = landingVx * (1 - surfaceFriction);
  let dist = 0;
  const simDt = 0.005;
  for (let t = 0; t < 3.0; t += simDt) {
    vx *= Math.pow(surfaceFriction, simDt * 10);
    dist += vx * simDt;
    if (Math.abs(vx) < 5) break;
  }
  return dist;
}

/**
 * Check if character landed on a platform.
 * Uses simple AABB: character bottom edge crosses platform top while falling.
 * @param {object} char - { x, y, width, height, vy }
 * @param {object} platform - { x, y, width, height }
 * @param {number} prevY - character's y before this frame
 * @returns {boolean}
 */
export function checkLanding(char, platform, prevY) {
  if (char.vy < 0) return false; // moving upward

  const charBottom = char.y + char.height;
  const prevBottom = prevY + char.height;
  const platTop = platform.y;

  // Character's bottom crossed platform top this frame
  if (prevBottom <= platTop && charBottom >= platTop) {
    // Horizontal overlap check
    const charRight = char.x + char.width;
    const platRight = platform.x + platform.width;
    if (charRight > platform.x && char.x < platRight) {
      return true;
    }
  }
  return false;
}
