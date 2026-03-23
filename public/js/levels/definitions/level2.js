/**
 * Level 2 — Intermediate.
 * Bigger gaps, varied heights.
 */
export default {
  name: 'Rising Up',
  theme: 'basic',
  jumps: 10,
  platforms: [
    [80,   0,   180, 20],
    [400,  -25, 160, 20],
    [710,  15,  150, 20],
    [1040, -10, 170, 20],
    [1380, 20,  160, 20],
    [1720, -30, 150, 20],
    [2060, 10,  170, 20],
    [2380, -15, 160, 20],
    [2720, 5,   150, 20],
    [3060, 0,   200, 20, { isGoal: true }],
  ],
};
