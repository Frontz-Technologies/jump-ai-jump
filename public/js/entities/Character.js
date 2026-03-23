/** Character states. */
export const CharState = {
  IDLE: 'IDLE',
  CHARGING: 'CHARGING',
  AIRBORNE: 'AIRBORNE',
  SLIDING: 'SLIDING',
  THOUGHT_BUBBLE: 'THOUGHT_BUBBLE',
};

export class Character {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 40;
    this.height = 40;
    this.vx = 0;
    this.vy = 0;
    this.state = CharState.IDLE;

    // For squash/stretch
    this.scaleX = 1;
    this.scaleY = 1;
    this._animTimer = 0;

    // Sliding state
    this._slideVx = 0;
    this._slidePlatform = null;
    this._footingDelay = 0;
  }

  /** Snap character to stand on a platform. */
  landOn(platform, surfaceFriction = 1.0) {
    this.y = platform.y - this.height;
    this.vy = 0;
    this._slidePlatform = platform;

    if (surfaceFriction < 1.0) {
      // Slippery: post-landing slide
      this._slideVx = this.vx * (1 - surfaceFriction);
      this.vx = 0;
      this._footingDelay = 0;
      this.state = CharState.SLIDING;
      // Normal land squash
      this.scaleX = 1.3;
      this.scaleY = 0.7;
      this._animTimer = 0.15;
    } else if (surfaceFriction <= 1.05) {
      // Grippy: instant stop (current behavior)
      this.vx = 0;
      this._slideVx = 0;
      this._footingDelay = 0;
      this.state = CharState.IDLE;
      this.scaleX = 1.3;
      this.scaleY = 0.7;
      this._animTimer = 0.15;
    } else {
      // Rough: instant stop + footing delay
      this.vx = 0;
      this._slideVx = 0;
      this._footingDelay = (surfaceFriction - 1.0) * 0.35;
      this.state = CharState.SLIDING;
      // Extended squash for rough surfaces
      this.scaleX = 1.4;
      this.scaleY = 0.6;
      this._animTimer = 0.25;
    }
  }

  /**
   * Update slide/footing state each frame.
   * @returns {{ fellOff: boolean }}
   */
  updateSlide(dt, surfaceFriction) {
    // Rough footing delay
    if (this._footingDelay > 0) {
      this._footingDelay -= dt;
      if (this._footingDelay <= 0) {
        this._footingDelay = 0;
        this.state = CharState.IDLE;
      }
      return { fellOff: false };
    }

    // Icy/smooth slide
    if (this._slideVx !== 0) {
      this._slideVx *= Math.pow(surfaceFriction, dt * 10);
      this.x += this._slideVx * dt;

      // Check platform bounds
      const plat = this._slidePlatform;
      if (plat) {
        const charRight = this.x + this.width;
        if (charRight < plat.x || this.x > plat.x + plat.width) {
          // Slid off the edge
          this._slideVx = 0;
          this.state = CharState.AIRBORNE;
          this.vy = 0;
          return { fellOff: true };
        }
      }

      if (Math.abs(this._slideVx) < 5) {
        this._slideVx = 0;
        this.state = CharState.IDLE;
      }
    } else {
      this.state = CharState.IDLE;
    }

    return { fellOff: false };
  }

  /** Cancel an active slide so the character can jump immediately. */
  cancelSlide() {
    this._slideVx = 0;
    this._footingDelay = 0;
  }

  /** Update squash/stretch animation. */
  updateAnimation(dt) {
    if (this._animTimer > 0) {
      this._animTimer -= dt;
      if (this._animTimer <= 0) {
        this.scaleX = 1;
        this.scaleY = 1;
      } else {
        // Lerp back to normal
        const t = this._animTimer / 0.15;
        this.scaleX = 1 + (0.3 * t);
        this.scaleY = 1 - (0.3 * t);
      }
    }
  }

  /** Start charging animation. */
  startCharge() {
    this.state = CharState.CHARGING;
    this.scaleX = 1.15;
    this.scaleY = 0.85;
  }

  /** Launch with given velocity. */
  launch(vx, vy) {
    this.vx = vx;
    this.vy = vy;
    this.state = CharState.AIRBORNE;
    // Stretch in jump direction
    this.scaleX = 0.8;
    this.scaleY = 1.2;
    this._animTimer = 0.2;
  }
}
