import { Platform } from '../entities/Platform.js';

/** A single level instance created from a level definition. */
export class Level {
  /**
   * @param {object} def - Level definition data
   */
  constructor(def) {
    this.name = def.name;
    this.themeName = def.theme;
    this.maxJumps = def.jumps;
    this.platforms = def.platforms.map(
      ([x, y, w, h, opts]) => new Platform(x, y, w, h, opts)
    );
  }

  /** Get the starting platform (first one). */
  getStartPlatform() {
    return this.platforms[0];
  }

  /** Get the goal platform (last one marked isGoal, or last). */
  getGoalPlatform() {
    return this.platforms.find(p => p.isGoal) || this.platforms[this.platforms.length - 1];
  }
}
