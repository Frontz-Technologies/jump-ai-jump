import { EyeIndicator } from './EyeIndicator.js';
import { PLANET_CONFIGS } from '../data/PlanetConfig.js';

/**
 * Handles canvas setup, camera, and orchestrates drawing via themes.
 */
export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cameraX = 0;
    this.cameraTargetX = 0;
    this.cameraY = 0;
    this.cameraTargetY = 0;
    this.theme = null;
    this.eyeIndicator = new EyeIndicator();

    this._resize();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  setTheme(theme) {
    this.theme = theme;
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();

    // Zoom out on narrow screens so more game world is visible
    const REFERENCE_WIDTH = 700;
    const MIN_SCALE = 0.5;
    this.gameScale = Math.max(MIN_SCALE, Math.min(1, rect.width / REFERENCE_WIDTH));

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.setTransform(dpr * this.gameScale, 0, 0, dpr * this.gameScale, 0, 0);

    // Virtual (unscaled) dimensions — game logic sees a wider world
    this.displayWidth = rect.width / this.gameScale;
    this.displayHeight = rect.height / this.gameScale;
  }

  /** Set camera target to follow character (used during airborne). */
  followCharacter(character) {
    const targetX = character.x + character.width / 2 - this.displayWidth / 2;
    this.cameraTargetX = targetX;
    const targetY = character.y + character.height / 2 - this.displayHeight / 2;
    this.cameraTargetY = targetY;
  }

  /** Smooth camera update. */
  updateCamera(dt) {
    const smoothing = 5;
    this.cameraX += (this.cameraTargetX - this.cameraX) * smoothing * dt;
    this.cameraY += (this.cameraTargetY - this.cameraY) * smoothing * dt;
  }

  /** Draw one frame. */
  draw(character, visiblePlatforms, options = {}) {
    if (!this.theme) return;
    const { ctx } = this;
    const { thoughtBubble, characterThought, bgTransition, aiEye, planetIndex, ghosts, planet, sliding } = options;
    const canvas = { width: this.displayWidth, height: this.displayHeight };

    ctx.clearRect(0, 0, this.displayWidth, this.displayHeight);

    // Background (no camera transform)
    this.theme.drawBackground(ctx, canvas, bgTransition);

    // AI eye indicator (screen-space, behind all game objects)
    if (aiEye) {
      this.eyeIndicator.update(
        aiEye.dt, aiEye.charScreenX, aiEye.charScreenY,
        aiEye.active, this.displayWidth, this.displayHeight
      );
      this.eyeIndicator.draw(ctx, this.displayWidth, this.displayHeight, aiEye.irisColor);
    }

    // Camera transform
    ctx.save();
    ctx.translate(-this.cameraX, -this.cameraY);

    // Platforms (visiblePlatforms is array of { platform, index })
    for (const entry of visiblePlatforms) {
      const p = entry.platform;
      const i = entry.index;
      this.theme.drawPlatform(ctx, p, i, visiblePlatforms.length);
    }

    // Ghost players (drawn behind local character)
    if (ghosts && ghosts.length > 0) {
      for (const ghost of ghosts) {
        this.theme.drawGhostCharacter(ctx, ghost);
      }
    }

    // Character
    this.theme.drawCharacter(ctx, character, sliding);

    // Thought bubble (legacy AI thinking)
    if (thoughtBubble) {
      this.theme.drawThoughtBubble(ctx, character, 'Really?');
    }

    // Character inner thoughts (cloud bubble)
    if (characterThought) {
      this.theme.drawThoughtBubble(ctx, character, characterThought.text, characterThought.opacity);
    }

    ctx.restore();

    // Atmosphere post-processing overlay for dense-atmosphere planets
    const atmoPlanet = planet || (planetIndex != null ? PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)] : null);
    if (atmoPlanet && atmoPlanet.airDensity >= 5.0) {
      // Tinted overlay for dense atmosphere bodies
      let tintColor;
      if (atmoPlanet.body === 'venus' || atmoPlanet.bodyType === 'hazy') {
        tintColor = 'rgba(200,160,80,0.06)';
      } else if (atmoPlanet.body === 'titan') {
        tintColor = 'rgba(180,120,60,0.06)';
      }
      if (tintColor) {
        ctx.fillStyle = tintColor;
        ctx.fillRect(0, 0, this.displayWidth, this.displayHeight);
      }
    }
  }

  /** Check if character has fallen off screen (camera-relative). */
  isOffScreen(character) {
    return character.y - this.cameraY > this.displayHeight + 100;
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
  }
}
