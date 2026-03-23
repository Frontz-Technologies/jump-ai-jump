/** Trophy definitions. */
export const TROPHIES = [
  {
    id: 'first_jump',
    name: 'First Leap',
    desc: 'Complete your first jump',
    icon: '🦘',
    check: (stats) => stats.totalJumps >= 1,
  },
  {
    id: 'ten_jumps',
    name: 'Getting Air',
    desc: 'Make 10 total jumps',
    icon: '🌤️',
    check: (stats) => stats.totalJumps >= 10,
  },
  {
    id: 'fifty_jumps',
    name: 'Frequent Flyer',
    desc: 'Make 50 total jumps',
    icon: '✈️',
    check: (stats) => stats.totalJumps >= 50,
  },
  {
    id: 'level1_complete',
    name: 'Tutorial Graduate',
    desc: 'Complete Level 1',
    icon: '🎓',
    check: (stats) => stats.levelsCompleted >= 1,
  },
  {
    id: 'level3_complete',
    name: 'Precision Master',
    desc: 'Complete all levels',
    icon: '👑',
    check: (stats) => stats.levelsCompleted >= 3,
  },
  {
    id: 'five_games',
    name: 'Persistent',
    desc: 'Play 5 games',
    icon: '💪',
    check: (stats) => stats.totalGames >= 5,
  },
  {
    id: 'platform_5',
    name: 'Halfway There',
    desc: 'Reach platform 5 in any level',
    icon: '⭐',
    check: (stats) => stats.bestPlatform >= 5,
  },
];

/**
 * Check all trophies against stats and unlock new ones.
 * @param {import('./Storage.js').Storage} storage
 * @returns {string[]} Newly unlocked trophy IDs
 */
export function checkTrophies(storage) {
  const stats = storage.getStats();
  const newlyUnlocked = [];
  for (const trophy of TROPHIES) {
    if (trophy.check(stats)) {
      if (storage.unlockTrophy(trophy.id)) {
        newlyUnlocked.push(trophy.id);
      }
    }
  }
  return newlyUnlocked;
}
