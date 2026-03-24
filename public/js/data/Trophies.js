/** Trophy definitions. */
export const TROPHIES = [
  {
    id: 'first_jump',
    name: 'First Leap',
    desc: 'Complete your first jump',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>',
    check: (stats) => stats.totalJumps >= 1,
  },
  {
    id: 'ten_jumps',
    name: 'Getting Air',
    desc: 'Make 10 total jumps',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/></svg>',
    check: (stats) => stats.totalJumps >= 10,
  },
  {
    id: 'fifty_jumps',
    name: 'Frequent Flyer',
    desc: 'Make 50 total jumps',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
    check: (stats) => stats.totalJumps >= 50,
  },
  {
    id: 'level1_complete',
    name: 'Tutorial Graduate',
    desc: 'Complete Level 1',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>',
    check: (stats) => stats.levelsCompleted >= 1,
  },
  {
    id: 'level3_complete',
    name: 'Precision Master',
    desc: 'Complete all levels',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5.21 16.5h13.58"/></svg>',
    check: (stats) => stats.levelsCompleted >= 3,
  },
  {
    id: 'five_games',
    name: 'Persistent',
    desc: 'Play 5 games',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
    check: (stats) => stats.totalGames >= 5,
  },
  {
    id: 'platform_5',
    name: 'Halfway There',
    desc: 'Reach platform 5 in any level',
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a.534.534 0 0 0 .4.292l5.18.753a.53.53 0 0 1 .294.904l-3.75 3.657a.535.535 0 0 0-.154.473l.885 5.16a.53.53 0 0 1-.77.56l-4.63-2.435a.534.534 0 0 0-.496 0l-4.63 2.435a.53.53 0 0 1-.77-.56l.885-5.16a.535.535 0 0 0-.154-.473L3.34 8.923a.53.53 0 0 1 .294-.904l5.18-.753a.534.534 0 0 0 .4-.292z"/></svg>',
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
