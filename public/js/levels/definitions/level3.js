/**
 * Level 3 — Precision.
 * Smaller platforms, tight jump budget.
 */
export default {
  name: 'Precision',
  theme: 'basic',
  jumps: 9,
  platforms: [
    [80, 0, 180, 20],
    [420, -20, 150, 20],
    [770, 15, 140, 20],
    [1130, -30, 160, 20],
    [1510, 10, 145, 20],
    [1880, -15, 150, 20],
    [2260, 25, 140, 20],
    [2620, -10, 155, 20],
    [2990, 20, 145, 20],
    [3350, 0, 200, 20, { isGoal: true }],
  ],
};
