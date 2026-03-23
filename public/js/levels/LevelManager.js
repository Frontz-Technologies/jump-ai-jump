import { Level } from './Level.js';
import level1 from './definitions/level1.js';
import level2 from './definitions/level2.js';
import level3 from './definitions/level3.js';

const LEVEL_DEFS = [level1, level2, level3];

/** Manages level loading and progression. */
export class LevelManager {
  constructor() {
    this.currentIndex = 0;
    this.currentLevel = null;
  }

  /** Load a level by index. */
  load(index) {
    if (index < 0 || index >= LEVEL_DEFS.length) return null;
    this.currentIndex = index;
    this.currentLevel = new Level(LEVEL_DEFS[index]);
    return this.currentLevel;
  }

  /** Load next level. Returns null if no more levels. */
  loadNext() {
    return this.load(this.currentIndex + 1);
  }

  /** Restart current level. */
  restart() {
    return this.load(this.currentIndex);
  }

  hasNextLevel() {
    return this.currentIndex + 1 < LEVEL_DEFS.length;
  }

  getTotalLevels() {
    return LEVEL_DEFS.length;
  }
}
