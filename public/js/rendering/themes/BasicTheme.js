import { ThemeBase } from './ThemeBase.js';

/** Pool of curated color palettes — shuffled at game start, 10 picked per run. */
const PALETTE_POOL = [
  { bg: '#e6e0f0', platform: '#6b8f71', stroke: '#5a7d60' }, // lavender + green
  { bg: '#f5f0e1', platform: '#7b6b8f', stroke: '#6a5a7d' }, // cream + purple
  { bg: '#1a1a3e', platform: '#4a90d9', stroke: '#3a7bc8' }, // dark navy + bright blue
  { bg: '#2a1a3e', platform: '#d97ab5', stroke: '#c06aa0' }, // deep purple + pink
  { bg: '#1a2e1a', platform: '#8fd98a', stroke: '#70b86c' }, // dark green + light green
  { bg: '#f5e0d0', platform: '#c27a5a', stroke: '#a8654a' }, // peach + terracotta
  { bg: '#d8eaf5', platform: '#4a8db5', stroke: '#3a7ca0' }, // light blue + ocean
  { bg: '#2a1e14', platform: '#e8943a', stroke: '#c87e2e' }, // dark brown + orange
  { bg: '#f5f2e8', platform: '#8a9a5a', stroke: '#728040' }, // warm white + olive
  { bg: '#0e2a2a', platform: '#3ad9d0', stroke: '#2ab8b0' }, // dark teal + bright teal
  { bg: '#f0e0f0', platform: '#9a5ab5', stroke: '#8048a0' }, // pink-lavender + violet
  { bg: '#f0ebe5', platform: '#b85a4a', stroke: '#a04838' }, // off-white + clay red
  { bg: '#2a2e1a', platform: '#d9d04a', stroke: '#b8b03a' }, // dark olive + yellow
  { bg: '#daf0e0', platform: '#4a9a6a', stroke: '#3a8058' }, // mint + sea green
  { bg: '#14142e', platform: '#a898d0', stroke: '#8a7ab8' }, // midnight + lavender
  { bg: '#2e1e14', platform: '#d4a84a', stroke: '#b89038' }, // dark brown + gold
];

const PLATFORMS_PER_STAGE = 10;

/** Fixed palette for stage 1 — the original light theme. */
const DEFAULT_PALETTE = { bg: '#e8e0f0', platform: '#6b8f71', stroke: '#5a7d60' };

/**
 * Returns `count` palettes: stage 1 is always DEFAULT_PALETTE,
 * remaining stages are shuffled unique picks from PALETTE_POOL.
 */
function generateStagePalettes(count) {
  const pool = [...PALETTE_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [DEFAULT_PALETTE, ...pool.slice(0, count - 1)];
}

/** Simple geometric theme — box character, bar platforms. */
export class BasicTheme extends ThemeBase {
  constructor() {
    super();
    this.colors = {
      character: '#e85d4a',
      characterStroke: '#c94835',
      eyes: '#fff',
      pupils: '#2a2a2a',
    };
    this.stagePalettes = null;
    this._currentBg = '#e8e0f0';
  }

  /** Generate and assign random palettes for a new game. */
  initStagePalettes(count = 10) {
    this.stagePalettes = generateStagePalettes(count);
    this._currentBg = this.stagePalettes[0].bg;
  }

  /** Get the current background color. */
  getCurrentBg() {
    return this._currentBg;
  }

  /** Set current bg (called when transition completes). */
  setCurrentBg(color) {
    this._currentBg = color;
  }

  drawBackground(ctx, canvas, transition) {
    if (transition && transition.active) {
      // Fill old color
      ctx.fillStyle = transition.fromColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Expanding circle clip with new color
      const maxRadius = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
      const radius = maxRadius * transition.progress;

      ctx.save();
      ctx.beginPath();
      ctx.arc(transition.originX, transition.originY, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = transition.toColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    } else {
      ctx.fillStyle = this._currentBg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  drawPlatform(ctx, platform, index, _totalPlatforms) {
    const stage = Math.floor(index / PLATFORMS_PER_STAGE);
    const palette = this.stagePalettes
      ? this.stagePalettes[Math.min(stage, this.stagePalettes.length - 1)]
      : PALETTE_POOL[0];
    const radius = 8;

    // Apply spawn animation offset
    const animOffset = platform.animOffset || 0;
    const drawY = platform.y + animOffset;

    // Platform body
    ctx.fillStyle = palette.platform;
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.roundRect(platform.x, drawY, platform.width, platform.height, radius);
    ctx.fill();
    ctx.stroke();

    // Top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(platform.x + 2, drawY + 2, platform.width - 4, 4);
  }

  drawCharacter(ctx, character, _sliding, _extra) {
    const cx = character.x + character.width / 2;
    const cy = character.y + character.height / 2;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(character.scaleX, character.scaleY);

    const hw = character.width / 2;
    const hh = character.height / 2;

    // Body
    ctx.fillStyle = this.colors.character;
    ctx.strokeStyle = this.colors.characterStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, character.width, character.height, 8);
    ctx.fill();
    ctx.stroke();

    // Eyes
    const eyeY = -5;
    const eyeSpacing = 8;
    ctx.fillStyle = this.colors.eyes;
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeY, 5, 0, Math.PI * 2);
    ctx.arc(eyeSpacing, eyeY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils (look in movement direction)
    const pupilOffset = character.vx > 0 ? 2 : 0;
    ctx.fillStyle = this.colors.pupils;
    ctx.beginPath();
    ctx.arc(-eyeSpacing + pupilOffset, eyeY, 2.5, 0, Math.PI * 2);
    ctx.arc(eyeSpacing + pupilOffset, eyeY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = this.colors.characterStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (character.vy > 100) {
      // Scared mouth (falling fast)
      ctx.arc(0, 7, 5, 0, Math.PI * 2);
    } else {
      // Smile
      ctx.arc(0, 5, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    }
    ctx.stroke();

    ctx.restore();
  }

  drawThoughtBubble(ctx, character, text, opacity = 1) {
    if (!text) return;
    const cx = character.x + character.width / 2;

    ctx.save();
    ctx.globalAlpha = opacity;

    ctx.font = '11px system-ui, sans-serif';
    const maxLineWidth = 140;
    const lines = this._wrapText(ctx, text, maxLineWidth);
    const lineHeight = 14;
    const padding = 12;
    const bubbleWidth = Math.min(
      maxLineWidth + padding * 2,
      Math.max(...lines.map((l) => ctx.measureText(l).width)) + padding * 2 + 8,
    );
    const bubbleHeight = lines.length * lineHeight + padding * 2 - 4;
    const bubbleY = character.y - 40 - bubbleHeight;
    const bx = cx - bubbleWidth / 2;
    const by = bubbleY;

    // Trailing thought dots
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(cx + 3, character.y - 12, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, character.y - 22, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Bubble
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    const r = Math.min(bubbleHeight / 2, 16);
    ctx.beginPath();
    ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, r);
    ctx.fill();
    ctx.stroke();

    // Text
    ctx.fillStyle = '#2a2a2a';
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textX = bx + bubbleWidth / 2;
    const textStartY = by + padding + lineHeight / 2 - 2;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], textX, textStartY + i * lineHeight);
    }

    ctx.restore();
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  drawDeathWall(ctx, deathWall, canvas) {
    if (!deathWall || !deathWall.active) return;

    const wallX = deathWall.x;
    const feather = 80;

    // Solid dark fill from far left up to wall edge
    ctx.fillStyle = 'rgba(10, 5, 20, 0.95)';
    ctx.fillRect(wallX - 2000, 0, 2000, canvas.height);

    // Soft gradient edge (feather)
    const grad = ctx.createLinearGradient(wallX, 0, wallX + feather, 0);
    grad.addColorStop(0, 'rgba(10, 5, 20, 0.95)');
    grad.addColorStop(1, 'rgba(10, 5, 20, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(wallX, 0, feather, canvas.height);
  }
}
