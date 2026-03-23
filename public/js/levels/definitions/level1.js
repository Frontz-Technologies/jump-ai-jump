/**
 * Level 1 — Tutorial / easy.
 * Platforms are close together, generous jump count.
 */
export default {
  name: 'Getting Started',
  theme: 'basic',
  jumps: 12,
  /** Platform definitions: [x, y, width, height, opts?] */
  platforms: [
    [80, 0, 180, 20], // Start
    [360, -20, 160, 20], // 2
    [630, 10, 190, 20], // 3
    [920, -15, 150, 20], // 4
    [1200, 5, 180, 20], // 5
    [1500, -25, 170, 20], // 6
    [1790, 15, 160, 20], // 7
    [2100, -10, 180, 20], // 8
    [2420, 0, 200, 20, { isGoal: true }], // Goal
  ],
};
