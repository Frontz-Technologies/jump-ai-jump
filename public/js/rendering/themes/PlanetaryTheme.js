import { ThemeBase } from './ThemeBase.js';
import { PLANET_CONFIGS, PLATFORMS_PER_STAGE } from '../../data/PlanetConfig.js';
import { BODY_TYPE_RENDERERS } from './ProceduralBackgrounds.js';
import { CharState } from '../../entities/Character.js';

/**
 * Seeded PRNG for consistent star positions per level.
 */
function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Procedural planetary theme. Each level has a unique background
 * based on a real celestial body. All visuals are procedural (no images).
 */
export class PlanetaryTheme extends ThemeBase {
  constructor() {
    super();
    this.colors = {
      character: '#e85d4a',
      characterStroke: '#c94835',
      eyes: '#fff',
      pupils: '#2a2a2a',
    };
    this.stagePalettes = null;
    this._currentBg = '#87CEEB';
    this._starCaches = {};
    this._planetIndex = 0;

    // Transition state
    this._transition = null;
  }

  /** Generate palettes from planet configs.
   * @param {number} count - number of stages
   * @param {Array} [planets] - optional array of planet objects (tutorial + galaxy)
   */
  initStagePalettes(count = 10, planets) {
    const source = planets || PLANET_CONFIGS;
    this._allPlanets = source; // store for background rendering
    this.stagePalettes = source.slice(0, count).map((p) => ({
      bg: p.skyColor,
      platform: p.platformColor,
      stroke: p.platformStroke,
    }));
    this._currentBg = this.stagePalettes[0].bg;
  }

  getCurrentBg() {
    return this._currentBg;
  }

  setCurrentBg(color) {
    this._currentBg = color;
  }

  setPlanetIndex(index) {
    this._planetIndex = index;
  }

  // --- Background ---

  drawBackground(ctx, canvas, transition) {
    const pi = this._planetIndex;

    if (transition && transition.active) {
      const p = transition.progress;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxRadius = Math.sqrt(cx * cx + cy * cy);

      // Ease-out (fast start, gentle finish)
      const eased = 1 - (1 - p) * (1 - p);
      const radius = eased * maxRadius;

      // Draw old planet background as base
      this._drawPlanetBg(ctx, canvas, Math.max(0, pi - 1));

      // Clip a circle and draw new planet background inside it
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();
      this._drawPlanetBg(ctx, canvas, pi);
      ctx.restore();
    } else {
      this._drawPlanetBg(ctx, canvas, pi);
    }
  }

  _drawPlanetBg(ctx, canvas, planetIndex) {
    const w = canvas.width;
    const h = canvas.height;

    // Resolve planet from stored planets array or PLANET_CONFIGS
    const planets = this._allPlanets || PLANET_CONFIGS;
    const planet = planets[Math.min(planetIndex, planets.length - 1)];

    // Hardcoded tutorial/legacy bodies
    const hardcodedBodies = {
      earth: () => this._drawEarth(ctx, w, h),
      stratosphere: () => this._drawStratosphere(ctx, w, h),
      moon: () => this._drawMoon(ctx, w, h),
      mars: () => this._drawMars(ctx, w, h),
      mercury: () => this._drawMercury(ctx, w, h),
      venus: () => this._drawVenus(ctx, w, h),
      titan: () => this._drawTitan(ctx, w, h),
      jupiter: () => this._drawJupiter(ctx, w, h),
      europa: () => this._drawEuropa(ctx, w, h),
      pluto: () => this._drawPluto(ctx, w, h),
    };

    if (hardcodedBodies[planet.body] && !planet.bodyType) {
      // Use hardcoded renderer for legacy planets without bodyType
      hardcodedBodies[planet.body]();
    } else if (planet.bodyType && BODY_TYPE_RENDERERS[planet.bodyType]) {
      // Use procedural renderer for galaxy planets
      const seed = planetIndex * 1000 + 42;
      BODY_TYPE_RENDERERS[planet.bodyType](ctx, w, h, planet, seed);
    } else if (hardcodedBodies[planet.body]) {
      hardcodedBodies[planet.body]();
    } else {
      ctx.fillStyle = planet.skyColor || '#000000';
      ctx.fillRect(0, 0, w, h);
    }
  }

  _drawEarth(ctx, w, h) {
    // Blue gradient sky
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4a90d9');
    grad.addColorStop(0.6, '#87CEEB');
    grad.addColorStop(1, '#b0d4e8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Subtle cloud shapes
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.ellipse(w * 0.2, h * 0.15, 80, 25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.7, h * 0.1, 100, 20, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.5, h * 0.25, 60, 18, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Green ground strip
    ctx.fillStyle = '#4a7c3f';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }

  _drawStratosphere(ctx, w, h) {
    // Dark blue to black gradient
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#000005');
    grad.addColorStop(0.6, '#0a0a2e');
    grad.addColorStop(1, '#1a2a5e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Stars at top
    this._drawStarfield(ctx, w, h * 0.5, 80, 201);

    // Thin blue atmosphere line at bottom
    const atmoGrad = ctx.createLinearGradient(0, h * 0.9, 0, h);
    atmoGrad.addColorStop(0, 'rgba(80,140,255,0)');
    atmoGrad.addColorStop(0.5, 'rgba(80,140,255,0.3)');
    atmoGrad.addColorStop(1, 'rgba(40,80,200,0.5)');
    ctx.fillStyle = atmoGrad;
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
  }

  _drawMoon(ctx, w, h) {
    // Black sky
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Starfield
    this._drawStarfield(ctx, w, h, 120, 301);

    // Large Earth in upper corner
    ctx.save();
    ctx.beginPath();
    ctx.arc(w * 0.85, h * 0.15, 50, 0, Math.PI * 2);
    const earthGrad = ctx.createRadialGradient(w * 0.85, h * 0.15, 0, w * 0.85, h * 0.15, 50);
    earthGrad.addColorStop(0, '#4a90d9');
    earthGrad.addColorStop(0.5, '#3a7bc8');
    earthGrad.addColorStop(0.8, '#2a6ab8');
    earthGrad.addColorStop(1, '#1a4a80');
    ctx.fillStyle = earthGrad;
    ctx.fill();
    // Green land splotch
    ctx.fillStyle = 'rgba(74,124,63,0.4)';
    ctx.beginPath();
    ctx.ellipse(w * 0.85 - 10, h * 0.15 + 5, 20, 15, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Grey ground
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);

    // Crater dots on ground
    ctx.fillStyle = '#707070';
    const rng = seededRandom(303);
    for (let i = 0; i < 8; i++) {
      const cx = rng() * w;
      const cy = h * 0.87 + rng() * h * 0.1;
      const r = 3 + rng() * 8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _drawMars(ctx, w, h) {
    // Dark orange-red sky
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#8b4513');
    grad.addColorStop(0.4, '#c2742e');
    grad.addColorStop(0.8, '#a0522d');
    grad.addColorStop(1, '#6b3410');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Red-brown ground
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);

    // Two tiny moons (dots)
    ctx.fillStyle = '#d0c8c0';
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.08, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(w * 0.6, h * 0.12, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawMercury(ctx, w, h) {
    // Black sky
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    // Stars
    this._drawStarfield(ctx, w, h, 60, 501);

    // HUGE sun (3x radius, radial gradient)
    const sunX = w * 0.8;
    const sunY = h * 0.12;
    const sunR = 120;
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunR);
    sunGrad.addColorStop(0, '#ffffff');
    sunGrad.addColorStop(0.3, '#fff8e0');
    sunGrad.addColorStop(0.6, '#ffd700');
    sunGrad.addColorStop(0.85, '#ff8c00');
    sunGrad.addColorStop(1, 'rgba(255,140,0,0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

    // Corona glow
    const coronaGrad = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, sunR * 2);
    coronaGrad.addColorStop(0, 'rgba(255,200,50,0.15)');
    coronaGrad.addColorStop(1, 'rgba(255,200,50,0)');
    ctx.fillStyle = coronaGrad;
    ctx.fillRect(0, 0, w, h);

    // Grey-brown scorched surface
    ctx.fillStyle = '#6b6b6b';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }

  _drawVenus(ctx, w, h) {
    // Thick layered yellow-orange haze
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#c89030');
    grad.addColorStop(0.2, '#d4a050');
    grad.addColorStop(0.4, '#c89040');
    grad.addColorStop(0.6, '#b07830');
    grad.addColorStop(0.8, '#9a6820');
    grad.addColorStop(1, '#6b4a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Semi-transparent haze bands
    for (let i = 0; i < 5; i++) {
      const y = h * (0.1 + i * 0.18);
      ctx.fillStyle = `rgba(200,160,80,${0.08 + i * 0.02})`;
      ctx.fillRect(0, y, w, h * 0.08);
    }

    // Brown ground
    ctx.fillStyle = '#6b4a10';
    ctx.fillRect(0, h * 0.87, w, h * 0.13);
  }

  _drawTitan(ctx, w, h) {
    // Orange-brown haze
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#705030');
    grad.addColorStop(0.3, '#c08040');
    grad.addColorStop(0.6, '#a06830');
    grad.addColorStop(1, '#3a2a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Saturn with ring in upper sky
    const sx = w * 0.75;
    const sy = h * 0.12;
    // Saturn body
    ctx.fillStyle = '#d4b87a';
    ctx.beginPath();
    ctx.arc(sx, sy, 25, 0, Math.PI * 2);
    ctx.fill();
    // Ring (ellipse)
    ctx.strokeStyle = '#c0a060';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(sx, sy, 45, 10, -0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Dark ground
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }

  _drawJupiter(ctx, w, h) {
    // Horizontal band stripes — no solid ground
    const bands = [
      '#c4956a',
      '#d4a87a',
      '#e8c8a0',
      '#f0dcc0',
      '#c4956a',
      '#a07050',
      '#d4a87a',
      '#c09060',
      '#b08050',
      '#c4956a',
      '#d4a87a',
      '#a07050',
    ];
    const bandH = h / bands.length;
    for (let i = 0; i < bands.length; i++) {
      ctx.fillStyle = bands[i];
      ctx.fillRect(0, i * bandH, w, bandH + 1);
    }

    // Great Red Spot
    ctx.save();
    ctx.globalAlpha = 0.4;
    const spotGrad = ctx.createRadialGradient(w * 0.6, h * 0.55, 0, w * 0.6, h * 0.55, 40);
    spotGrad.addColorStop(0, '#c04020');
    spotGrad.addColorStop(1, 'rgba(192,64,32,0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.ellipse(w * 0.6, h * 0.55, 50, 25, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawEuropa(ctx, w, h) {
    // Black sky
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, w, h);

    // Dense starfield
    this._drawStarfield(ctx, w, h, 150, 901);

    // Massive Jupiter in background
    const jx = w * 0.2;
    const jy = h * 0.2;
    const jr = 100;
    const jGrad = ctx.createRadialGradient(jx, jy, 0, jx, jy, jr);
    jGrad.addColorStop(0, '#d4a87a');
    jGrad.addColorStop(0.7, '#c09060');
    jGrad.addColorStop(1, '#8b6848');
    ctx.fillStyle = jGrad;
    ctx.beginPath();
    ctx.arc(jx, jy, jr, 0, Math.PI * 2);
    ctx.fill();

    // Jupiter bands on the sphere
    ctx.save();
    ctx.beginPath();
    ctx.arc(jx, jy, jr, 0, Math.PI * 2);
    ctx.clip();
    for (let i = 0; i < 8; i++) {
      const by = jy - jr + i * ((jr * 2) / 8);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(160,112,80,0.3)' : 'rgba(200,160,120,0.2)';
      ctx.fillRect(jx - jr, by, jr * 2, (jr * 2) / 8);
    }
    // Red spot
    ctx.fillStyle = 'rgba(180,60,30,0.4)';
    ctx.beginPath();
    ctx.ellipse(jx + 20, jy + 15, 18, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Icy blue-white surface with crack lines
    ctx.fillStyle = '#d0e8f0';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);

    // Crack lines
    ctx.strokeStyle = 'rgba(100,160,180,0.5)';
    ctx.lineWidth = 1;
    const rng = seededRandom(902);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = rng() * w;
      let y = h * 0.86 + rng() * h * 0.12;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rng() - 0.3) * 60;
        y += (rng() - 0.5) * 15;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  _drawPluto(ctx, w, h) {
    // Very dark sky
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, w, h);

    // Dense starfield
    this._drawStarfield(ctx, w, h, 180, 1001);

    // Tiny sun (small bright dot)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.08, 4, 0, Math.PI * 2);
    ctx.fill();
    // Subtle glow
    const sunGlow = ctx.createRadialGradient(w * 0.7, h * 0.08, 2, w * 0.7, h * 0.08, 20);
    sunGlow.addColorStop(0, 'rgba(255,255,200,0.3)');
    sunGlow.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = sunGlow;
    ctx.beginPath();
    ctx.arc(w * 0.7, h * 0.08, 20, 0, Math.PI * 2);
    ctx.fill();

    // Charon (small grey circle)
    ctx.fillStyle = '#707880';
    ctx.beginPath();
    ctx.arc(w * 0.4, h * 0.2, 15, 0, Math.PI * 2);
    ctx.fill();

    // Grey-blue icy surface
    ctx.fillStyle = '#8090a0';
    ctx.fillRect(0, h * 0.85, w, h * 0.15);
  }

  /**
   * Draw a starfield with consistent positions (seeded).
   */
  _drawStarfield(ctx, w, h, count, seed) {
    const rng = seededRandom(seed);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < count; i++) {
      const x = rng() * w;
      const y = rng() * h;
      const r = 0.5 + rng() * 1.5;
      const alpha = 0.3 + rng() * 0.7;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // --- Platforms ---

  drawPlatform(ctx, platform, index, _totalPlatforms, personalBestIndex) {
    const stage = Math.floor(index / PLATFORMS_PER_STAGE);
    const planets = this._allPlanets || PLANET_CONFIGS;
    const planet = planets[Math.min(stage, planets.length - 1)];
    const radius = 8;
    const animOffset = platform.animOffset || 0;
    const drawY = platform.y + animOffset;
    const friction = planet.surfaceFriction ?? 1.0;

    const x = platform.x;
    const w = platform.width;
    const h = platform.height;

    // Platform body — shape varies by friction
    ctx.fillStyle = planet.platformColor;
    ctx.strokeStyle = planet.platformStroke;
    ctx.lineWidth = 2;

    if (friction > 1.05) {
      // Rough/very rough — bumpy top silhouette
      this._drawRoughPlatformPath(ctx, x, drawY, w, h, radius, friction);
    } else {
      ctx.beginPath();
      ctx.roundRect(x, drawY, w, h, radius);
    }
    ctx.fill();
    ctx.stroke();

    // Friction-based surface overlay (color/sheen effects)
    this._drawFrictionSurface(ctx, platform, drawY, radius, friction);

    // Top highlight (dimmer on rough, brighter on icy)
    if (friction <= 1.05) {
      const highlightAlpha = friction < 0.7 ? 0.35 : 0.2;
      ctx.fillStyle = `rgba(255,255,255,${highlightAlpha})`;
      ctx.fillRect(x + 2, drawY + 2, w - 4, 4);
    }

    // Planet-specific platform details
    this._drawPlatformDetails(ctx, platform, drawY, planet);

    // Personal best flag — draw on the record platform
    // personalBestIndex is 1-based (platform 1 = index 0)
    if (personalBestIndex > 0 && index === personalBestIndex - 1) {
      this._drawPersonalBestFlag(ctx, platform, drawY);
    }
  }

  /** Build a platform path with a bumpy/rocky top edge. */
  _drawRoughPlatformPath(ctx, x, y, w, h, radius, friction) {
    const rng = seededRandom(Math.round(x * 13 + 7));
    // Bump intensity scales with friction: 1.1→small bumps, 2.0→big rocks
    const intensity = Math.min((friction - 1.0) * 4, 5);
    const step = friction > 1.5 ? 3 : 4;

    ctx.beginPath();
    // Start bottom-left, go clockwise
    // Bottom edge (flat with rounded corners)
    ctx.moveTo(x + radius, y + h);
    ctx.lineTo(x + w - radius, y + h);
    // Bottom-right corner
    ctx.arcTo(x + w, y + h, x + w, y + h - radius, radius);
    // Right edge
    ctx.lineTo(x + w, y + radius);
    // Top-right corner (into bumpy top)
    ctx.arcTo(x + w, y, x + w - radius, y, radius);
    // Bumpy top edge — right to left
    for (let px = x + w - radius; px > x + radius; px -= step) {
      const bump = (rng() - 0.3) * intensity;
      ctx.lineTo(px, y - bump);
    }
    // Top-left corner
    ctx.arcTo(x, y, x, y + radius, radius);
    // Left edge
    ctx.lineTo(x, y + h - radius);
    // Bottom-left corner
    ctx.arcTo(x, y + h, x + radius, y + h, radius);
    ctx.closePath();
  }

  _drawPlatformDetails(ctx, platform, drawY, planet) {
    const body = planet.body;
    const bodyType = planet.bodyType;

    // Match on hardcoded body first, then bodyType category
    if (body === 'moon' || bodyType === 'rocky') {
      // Crater dots
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      const rng = seededRandom(Math.round(platform.x));
      for (let i = 0; i < 3; i++) {
        const cx = platform.x + 5 + rng() * (platform.width - 10);
        const cy = drawY + 4 + rng() * 10;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (body === 'europa' || bodyType === 'icy') {
      // Ice shimmer lines
      ctx.strokeStyle = 'rgba(200,230,255,0.3)';
      ctx.lineWidth = 0.5;
      const rng = seededRandom(Math.round(platform.x) + 1);
      for (let i = 0; i < 2; i++) {
        const x1 = platform.x + rng() * platform.width * 0.3;
        const x2 = x1 + rng() * platform.width * 0.5;
        const y = drawY + 5 + rng() * 8;
        ctx.beginPath();
        ctx.moveTo(x1, y);
        ctx.lineTo(x2, y + (rng() - 0.5) * 4);
        ctx.stroke();
      }
    } else if (body === 'venus' || bodyType === 'hazy') {
      // Heat distortion (wavy line on top)
      ctx.strokeStyle = 'rgba(255,200,100,0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(platform.x, drawY - 2);
      for (let x = platform.x; x < platform.x + platform.width; x += 5) {
        ctx.lineTo(x, drawY - 2 + Math.sin(x * 0.1) * 2);
      }
      ctx.stroke();
    } else if (bodyType === 'volcanic') {
      // Lava glow under platform
      const glowGrad = ctx.createLinearGradient(
        platform.x,
        drawY + platform.height,
        platform.x,
        drawY + platform.height + 8,
      );
      glowGrad.addColorStop(0, 'rgba(255,100,20,0.3)');
      glowGrad.addColorStop(1, 'rgba(255,50,0,0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(platform.x, drawY + platform.height, platform.width, 8);
    } else if (bodyType === 'exotic') {
      // Subtle glow halo
      ctx.strokeStyle = 'rgba(160,180,255,0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(platform.x - 2, drawY - 2, platform.width + 4, platform.height + 4, 10);
      ctx.stroke();
    }
  }

  /** Draw a pixel-art Mario-style flag on the personal best platform. */
  _drawPersonalBestFlag(ctx, platform, drawY) {
    const poleX = platform.x + platform.width - 18;
    const poleBottom = drawY; // top of platform surface
    const poleHeight = 40;
    const poleTop = poleBottom - poleHeight;
    const poleWidth = 3;

    // Brown pole
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(poleX, poleTop, poleWidth, poleHeight);

    // Pole cap (small ball at top)
    ctx.fillStyle = '#DAA520';
    ctx.beginPath();
    ctx.arc(poleX + poleWidth / 2, poleTop, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Red waving flag (triangular pennant shape)
    const flagTop = poleTop + 2;
    const flagHeight = 14;
    const flagWidth = 18;

    ctx.fillStyle = '#DC143C';
    ctx.beginPath();
    ctx.moveTo(poleX + poleWidth, flagTop);
    // Wavy edge using a quadratic curve
    ctx.quadraticCurveTo(
      poleX + poleWidth + flagWidth * 0.6,
      flagTop + flagHeight * 0.3,
      poleX + poleWidth + flagWidth,
      flagTop + flagHeight * 0.45,
    );
    ctx.quadraticCurveTo(
      poleX + poleWidth + flagWidth * 0.6,
      flagTop + flagHeight * 0.7,
      poleX + poleWidth,
      flagTop + flagHeight,
    );
    ctx.closePath();
    ctx.fill();

    // Flag stroke for definition
    ctx.strokeStyle = '#8B0000';
    ctx.lineWidth = 1;
    ctx.stroke();

    // "PB" text label (tiny, on the flag)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('PB', poleX + poleWidth + 3, flagTop + flagHeight * 0.45);
  }

  /** Draw friction-based surface overlay on platform (color/texture only — shape is in drawPlatform). */
  _drawFrictionSurface(ctx, platform, drawY, radius, friction) {
    if (friction >= 0.7 && friction <= 1.05) return; // normal range — no overlay

    const x = platform.x;
    const w = platform.width;
    const h = platform.height;
    const rng = seededRandom(Math.round(x * 7 + 31));

    ctx.save();
    // Clip to platform shape so overlays don't bleed
    ctx.beginPath();
    ctx.roundRect(x, drawY, w, h, radius);
    ctx.clip();

    if (friction < 0.4) {
      // Very icy — strong blue-white glassy sheen
      const iceGrad = ctx.createLinearGradient(x, drawY, x + w, drawY);
      iceGrad.addColorStop(0, 'rgba(180,220,255,0.25)');
      iceGrad.addColorStop(0.3, 'rgba(220,240,255,0.35)');
      iceGrad.addColorStop(0.5, 'rgba(180,220,255,0.15)');
      iceGrad.addColorStop(0.7, 'rgba(220,240,255,0.3)');
      iceGrad.addColorStop(1, 'rgba(180,220,255,0.2)');
      ctx.fillStyle = iceGrad;
      ctx.fillRect(x, drawY, w, h);

      // Glint streaks across surface
      ctx.strokeStyle = 'rgba(240,250,255,0.4)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 3; i++) {
        const sx = x + rng() * w * 0.3;
        const ex = sx + rng() * w * 0.5 + 10;
        const sy = drawY + 3 + rng() * (h - 6);
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, sy + (rng() - 0.5) * 2);
        ctx.stroke();
      }
    } else if (friction < 0.7) {
      // Smooth/slippery — subtle sheen
      const sheenGrad = ctx.createLinearGradient(x, drawY, x + w, drawY + h);
      sheenGrad.addColorStop(0, 'rgba(200,230,255,0.1)');
      sheenGrad.addColorStop(0.5, 'rgba(220,240,255,0.18)');
      sheenGrad.addColorStop(1, 'rgba(200,230,255,0.08)');
      ctx.fillStyle = sheenGrad;
      ctx.fillRect(x, drawY, w, h);
    } else if (friction <= 1.5) {
      // Rough — scattered gravel dots inside body
      ctx.fillStyle = 'rgba(0,0,0,0.1)';
      const dotCount = Math.floor(w / 7);
      for (let i = 0; i < dotCount; i++) {
        const dx = x + 3 + rng() * (w - 6);
        const dy = drawY + 3 + rng() * (h - 6);
        const r = 0.7 + rng() * 0.8;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Very rough — warm tint + dense gravel
      ctx.fillStyle = 'rgba(80,40,10,0.1)';
      ctx.fillRect(x, drawY, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      const dotCount = Math.floor(w / 5);
      for (let i = 0; i < dotCount; i++) {
        const dx = x + 3 + rng() * (w - 6);
        const dy = drawY + 3 + rng() * (h - 6);
        const r = 0.5 + rng() * 1.0;
        ctx.beginPath();
        ctx.arc(dx, dy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  // --- Character (expressive creature with limbs, eyes, particles) ---

  drawCharacter(ctx, character, sliding, extra = {}) {
    const planet = extra.planet || null;

    // Afterimages (drawn behind character)
    this._drawAfterimages(ctx, character);

    // Main character body with limbs and face
    this._drawCharacterBody(ctx, character, extra);

    // Slide particles (drawn in world space, outside character transform)
    if (sliding && sliding.active) {
      this._drawSlideParticles(ctx, character, sliding);
    }

    // Landing dust burst
    this._drawLandingDust(ctx, character, planet);
  }

  /** Determine the current animation state string from character properties. */
  _getAnimState(character, power) {
    if (character.deathActive) return 'death';
    if (character.victoryActive) return 'victory';
    if (character.state === CharState.CHARGING) {
      if (power > 0.66) return 'charge-high';
      if (power > 0.33) return 'charge-mid';
      return 'charge-low';
    }
    if (character.state === CharState.AIRBORNE) {
      if (character.vy < -50) return 'rising';
      if (character.vy > 50) return 'falling';
      return 'peak';
    }
    if (character.state === CharState.SLIDING) return 'sliding';
    return 'idle';
  }

  /** Draw faded afterimage copies when airborne. */
  _drawAfterimages(ctx, character) {
    if (!character.afterimagePositions || character.afterimagePositions.length === 0) return;
    for (const img of character.afterimagePositions) {
      ctx.save();
      ctx.globalAlpha = img.opacity * 0.35;
      const icx = img.x + character.width / 2;
      const icy = img.y + character.height / 2;
      ctx.translate(icx, icy);
      ctx.scale(img.scaleX, img.scaleY);
      const hw = character.width / 2;
      const hh = character.height / 2;
      ctx.fillStyle = this.colors.character;
      ctx.beginPath();
      ctx.roundRect(-hw, -hh, character.width, character.height, 8);
      ctx.fill();
      ctx.restore();
    }
  }

  /** Draw the full character: limbs, body, face, planet tint. */
  _drawCharacterBody(ctx, character, extra) {
    const power = extra.power || 0;
    const planet = extra.planet || null;
    const animState = this._getAnimState(character, power);

    const cx = character.x + character.width / 2;
    const cy = character.y + character.height / 2;
    const hw = character.width / 2;
    const hh = character.height / 2;
    const t = performance.now() * 0.001;

    ctx.save();
    ctx.translate(cx, cy);

    // Death: apply rotation and shrinking
    if (animState === 'death') {
      const dTimer = character.deathTimer;
      const deathScale = Math.max(0.1, 1 - dTimer * 0.8);
      ctx.rotate(dTimer * 8);
      ctx.scale(deathScale, deathScale);
      ctx.globalAlpha = Math.max(0, 1 - dTimer * 0.7);
    }

    ctx.scale(character.scaleX, character.scaleY);

    // Charge shake at high power
    let shakeX = 0;
    let shakeY = 0;
    if (animState === 'charge-high') {
      shakeX = (Math.random() - 0.5) * 3;
      shakeY = (Math.random() - 0.5) * 3;
    }

    // --- LEGS ---
    this._drawLegs(ctx, hw, hh, animState, t, character);

    // --- ARMS ---
    this._drawArms(ctx, hw, hh, animState, t, character);

    // --- BODY ---
    ctx.fillStyle = this.colors.character;
    ctx.strokeStyle = this.colors.characterStroke;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-hw + shakeX, -hh + shakeY, character.width, character.height, 8);
    ctx.fill();
    ctx.stroke();

    // Planet-reactive tint overlay
    if (planet) {
      this._drawPlanetTint(ctx, hw, hh, character, planet, shakeX, shakeY);
    }

    // --- EYES ---
    this._drawEyes(ctx, animState, character, t, shakeX, shakeY);

    // --- EYEBROWS ---
    this._drawEyebrows(ctx, animState, shakeX, shakeY);

    // --- MOUTH ---
    this._drawMouth(ctx, animState, character, t, shakeX, shakeY);

    ctx.restore();
  }

  /** Draw two stubby legs below the body. */
  _drawLegs(ctx, _hw, hh, animState, t, character) {
    const legW = 10;
    const legH = 8;
    const legSpacing = 8;
    const bodyColor = this.colors.character;
    const strokeColor = this.colors.characterStroke;

    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      const baseX = side * legSpacing;
      let baseY = hh;
      let angle = 0;

      switch (animState) {
        case 'idle':
          baseY += Math.sin(t * 2 + side * Math.PI) * 1.5;
          break;
        case 'charge-low':
          baseY -= 2;
          break;
        case 'charge-mid':
          baseY -= 4;
          break;
        case 'charge-high':
          baseY -= 6;
          break;
        case 'rising':
          baseY += 4;
          break;
        case 'peak':
          baseY += 2;
          break;
        case 'falling':
          angle = Math.sin(t * 8 + side * Math.PI) * 0.4;
          baseY += 2;
          break;
        case 'sliding':
          angle = side * 0.3;
          break;
        case 'death':
          angle = side * (0.5 + character.deathTimer * 2);
          break;
        case 'victory':
          baseY += Math.sin(t * 6) * 3;
          break;
        default:
          break;
      }

      ctx.translate(baseX, baseY);
      ctx.rotate(angle);
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-legW / 2, 0, legW, legH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Draw two stubby arms on the sides. */
  _drawArms(ctx, hw, hh, animState, t, _character) {
    const armW = 8;
    const armH = 6;
    const bodyColor = this.colors.character;
    const strokeColor = this.colors.characterStroke;

    for (let side = -1; side <= 1; side += 2) {
      ctx.save();
      let baseX = side * (hw + 2);
      let baseY = 0;
      let angle = 0;

      switch (animState) {
        case 'idle':
          baseY = 2;
          angle = side * (0.1 + Math.sin(t * 1.5) * 0.05);
          break;
        case 'charge-low':
          baseX = side * (hw - 1);
          angle = side * 0.2;
          break;
        case 'charge-mid':
          baseX = side * (hw - 3);
          angle = side * 0.3;
          break;
        case 'charge-high':
          baseX = side * (hw - 5);
          angle = side * 0.4;
          break;
        case 'rising':
          baseY = -5;
          angle = side * -0.8;
          break;
        case 'peak':
          baseY = -3;
          angle = side * -1.2;
          break;
        case 'falling':
          baseY = -hh + 2;
          angle = side * (-1.0 + Math.sin(t * 10 + side) * 0.3);
          break;
        case 'sliding':
          baseY = -2;
          angle = side * -0.7;
          break;
        case 'death':
          angle = side * Math.sin(t * 15 + side) * 1.5;
          break;
        case 'victory':
          baseY = -hh - 2;
          angle = side * -0.5;
          break;
        default:
          break;
      }

      ctx.translate(baseX, baseY);
      ctx.rotate(angle);
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-armW / 2, -armH / 2, armW, armH, 3);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Draw planet-reactive tint overlay on the body. */
  _drawPlanetTint(ctx, hw, hh, character, planet, shakeX, shakeY) {
    ctx.save();
    const friction = planet.surfaceFriction ?? 1.0;
    const bodyType = planet.bodyType || '';
    const body = planet.body || '';

    let tintColor;
    if (friction < 0.7 || bodyType === 'icy') {
      tintColor = 'rgba(150,200,255,0.12)';
    } else if (bodyType === 'volcanic' || body === 'io') {
      tintColor = 'rgba(255,140,50,0.12)';
    } else if (bodyType === 'gas_giant') {
      tintColor = 'rgba(255,215,100,0.10)';
    } else if (planet.groundColor) {
      tintColor = planet.groundColor;
      ctx.globalAlpha = 0.12;
    } else {
      ctx.restore();
      return;
    }

    ctx.fillStyle = tintColor;
    ctx.beginPath();
    ctx.roundRect(-hw + shakeX, -hh + shakeY, character.width, character.height, 8);
    ctx.fill();
    ctx.restore();
  }

  /** Draw expressive eyes based on animation state. */
  _drawEyes(ctx, animState, character, _t, shakeX, shakeY) {
    const eyeY = -5 + shakeY;
    const eyeSpacing = 8;
    const leftX = -eyeSpacing + shakeX;
    const rightX = eyeSpacing + shakeX;

    // Death: X eyes
    if (animState === 'death') {
      ctx.strokeStyle = this.colors.pupils;
      ctx.lineWidth = 2;
      for (const ex of [leftX, rightX]) {
        ctx.beginPath();
        ctx.moveTo(ex - 3, eyeY - 3);
        ctx.lineTo(ex + 3, eyeY + 3);
        ctx.moveTo(ex + 3, eyeY - 3);
        ctx.lineTo(ex - 3, eyeY + 3);
        ctx.stroke();
      }
      return;
    }

    // Victory: star eyes
    if (animState === 'victory') {
      ctx.fillStyle = '#FFD700';
      for (const ex of [leftX, rightX]) {
        this._drawStar(ctx, ex, eyeY, 5, 5);
      }
      return;
    }

    // Determine sclera size and pupil based on state
    let scleraRx = 6;
    let scleraRy = 6;
    let pupilR = 2.5;
    let pupilOffX = 0;
    let pupilOffY = 0;
    let blinkScale = 1;

    // Blink (idle/sliding)
    if (character.blinkPhase > 0 && (animState === 'idle' || animState === 'sliding')) {
      const halfDur = 0.075;
      const bp = character.blinkPhase;
      if (bp > halfDur) {
        blinkScale = (0.15 - bp) / halfDur;
      } else {
        blinkScale = bp / halfDur;
      }
      blinkScale = Math.max(0.05, blinkScale);
    }

    switch (animState) {
      case 'idle':
        pupilOffX = character.pupilDriftX || 0;
        pupilOffY = character.pupilDriftY || 0;
        break;
      case 'charge-low':
        scleraRy = 4.5;
        pupilR = 2;
        break;
      case 'charge-mid':
        scleraRy = 3;
        pupilR = 1.5;
        break;
      case 'charge-high':
        scleraRy = 2;
        pupilR = 1;
        break;
      case 'rising':
        pupilOffX = 0;
        pupilOffY = 0;
        break;
      case 'peak':
        pupilOffY = 2;
        break;
      case 'falling':
        scleraRx = 7;
        scleraRy = 7;
        pupilR = 1.8;
        pupilOffY = -1.5;
        break;
      case 'sliding':
        pupilOffX = character._slideVx > 0 ? 2 : character._slideVx < 0 ? -2 : 0;
        break;
      default:
        break;
    }

    // Draw sclera (white ellipses)
    ctx.fillStyle = this.colors.eyes;
    for (const ex of [leftX, rightX]) {
      ctx.save();
      ctx.translate(ex, eyeY);
      ctx.scale(1, blinkScale);
      ctx.beginPath();
      ctx.ellipse(0, 0, scleraRx, scleraRy, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw pupils (only if not fully blinked)
    if (blinkScale > 0.2) {
      ctx.fillStyle = this.colors.pupils;
      for (const ex of [leftX, rightX]) {
        ctx.beginPath();
        ctx.arc(ex + pupilOffX, eyeY + pupilOffY, pupilR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /** Draw eyebrows for specific states. */
  _drawEyebrows(ctx, animState, shakeX, shakeY) {
    const eyeY = -5 + shakeY;
    const eyeSpacing = 8;
    const browLen = 6;
    const browY = eyeY - 8;

    let type = null;
    if (animState === 'rising' || animState === 'charge-high') {
      type = 'determined';
    } else if (animState === 'falling' || animState === 'sliding') {
      type = 'worried';
    }

    if (!type) return;

    ctx.strokeStyle = this.colors.characterStroke;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';

    for (let side = -1; side <= 1; side += 2) {
      const bx = side * eyeSpacing + shakeX;
      ctx.beginPath();
      if (type === 'determined') {
        ctx.moveTo(bx - side * (browLen / 2), browY + 2);
        ctx.lineTo(bx + side * (browLen / 2), browY);
      } else {
        ctx.moveTo(bx - side * (browLen / 2), browY);
        ctx.lineTo(bx + side * (browLen / 2), browY + 2);
      }
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** Draw mouth based on animation state. */
  _drawMouth(ctx, animState, character, t, shakeX, shakeY) {
    const mouthY = 8 + shakeY;
    const mouthX = 0 + shakeX;

    ctx.strokeStyle = this.colors.characterStroke;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    switch (animState) {
      case 'idle':
        ctx.beginPath();
        ctx.arc(mouthX, mouthY - 2, 5, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        break;
      case 'charge-low':
      case 'charge-mid':
        ctx.beginPath();
        ctx.moveTo(mouthX - 4, mouthY);
        ctx.lineTo(mouthX + 4, mouthY);
        ctx.stroke();
        break;
      case 'charge-high':
        ctx.beginPath();
        ctx.moveTo(mouthX - 5, mouthY);
        for (let x = -5; x <= 5; x += 2) {
          ctx.lineTo(mouthX + x, mouthY + (x % 4 === 0 ? -1 : 1));
        }
        ctx.stroke();
        break;
      case 'rising':
        ctx.beginPath();
        ctx.moveTo(mouthX - 4, mouthY);
        ctx.lineTo(mouthX + 4, mouthY);
        ctx.stroke();
        break;
      case 'peak':
        ctx.beginPath();
        ctx.arc(mouthX, mouthY - 1, 4, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        break;
      case 'falling':
      case 'death':
        ctx.beginPath();
        ctx.arc(mouthX, mouthY, 4, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'sliding':
        ctx.beginPath();
        ctx.moveTo(mouthX - 5, mouthY);
        for (let x = -5; x <= 5; x += 2.5) {
          ctx.lineTo(mouthX + x, mouthY + Math.sin((x + t * 5) * 1.5) * 1.5);
        }
        ctx.stroke();
        break;
      case 'victory':
        ctx.beginPath();
        ctx.arc(mouthX, mouthY - 2, 7, 0.1 * Math.PI, 0.9 * Math.PI);
        ctx.stroke();
        break;
      default:
        if (character.landingImpact > 0) {
          ctx.beginPath();
          ctx.arc(mouthX, mouthY - 2, 6, 0.1 * Math.PI, 0.9 * Math.PI);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(mouthX, mouthY - 2, 5, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
        }
        break;
    }
    ctx.lineCap = 'butt';
  }

  /** Draw a small 5-point star at (x, y). */
  _drawStar(ctx, x, y, outerR, points) {
    const innerR = outerR * 0.4;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  /** Draw landing dust burst at character feet. */
  _drawLandingDust(ctx, character, planet) {
    if (!character.landingImpact || character.landingImpact <= 0) return;

    const footY = character.y + character.height;
    const charCx = character.x + character.width / 2;
    const impact = character.landingImpact;
    const spread = (1 - impact) * 30;
    const count = 7;
    const groundColor = (planet && planet.groundColor) || '#8a8a8a';

    ctx.save();
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI) / count;
      const px = charCx + Math.cos(angle) * spread * (0.8 + (i % 3) * 0.2);
      const py = footY - Math.sin(angle) * spread * 0.3;
      const r = 2.5 * impact;

      ctx.globalAlpha = impact * 0.6;
      ctx.fillStyle = groundColor;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Draw friction particles at character's feet during slide. */
  _drawSlideParticles(ctx, character, sliding) {
    const footY = character.y + character.height;
    const cx = character.x + character.width / 2;
    const t = performance.now() * 0.003; // animation time

    if (sliding.friction < 0.7) {
      // Icy: white/blue ice dust particles behind character
      ctx.save();
      const dir = sliding.slideVx > 0 ? -1 : 1; // particles trail behind
      for (let i = 0; i < 4; i++) {
        const offset = dir * (5 + i * 8 + Math.sin(t + i * 2) * 3);
        const py = footY - 2 + Math.sin(t + i * 1.5) * 3;
        const alpha = 0.3 + (Math.abs(sliding.slideVx) / 500) * 0.4;
        const r = 1.5 + Math.sin(t + i) * 0.5;
        ctx.fillStyle = `rgba(200, 230, 255, ${Math.min(alpha, 0.7)})`;
        ctx.beginPath();
        ctx.arc(cx + offset, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (sliding.friction > 1.0) {
      // Rough: orange/brown spark dots at character base
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const ox = Math.sin(t * 3 + i * 2.1) * 0.5 * character.width;
        const py = footY - 1 + Math.sin(t * 4 + i) * 2;
        const alpha = 0.4 + Math.sin(t * 5 + i) * 0.2;
        const r = 1 + Math.sin(t * 2 + i * 1.3) * 0.5;
        ctx.fillStyle = `rgba(220, 140, 40, ${Math.min(alpha, 0.6)})`;
        ctx.beginPath();
        ctx.arc(cx + ox, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawGhostCharacter(ctx, ghost) {
    const cx = ghost.x + 20; // half of 40px character width
    const cy = ghost.y + 20;
    const hue = ghost.hue || 220; // fallback blue

    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.translate(cx, cy);
    ctx.scale(ghost.scaleX || 1, ghost.scaleY || 1);

    const hw = 20;
    const hh = 20;

    // Body — tinted by unique hue
    ctx.fillStyle = `hsla(${hue}, 60%, 75%, 0.6)`;
    ctx.strokeStyle = `hsla(${hue}, 50%, 55%, 0.5)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, 40, 40, 8);
    ctx.fill();
    ctx.stroke();

    // Eyes
    const eyeY = -5;
    const eyeSpacing = 8;
    ctx.fillStyle = `hsla(${hue}, 30%, 92%, 0.8)`;
    ctx.beginPath();
    ctx.arc(-eyeSpacing, eyeY, 5, 0, Math.PI * 2);
    ctx.arc(eyeSpacing, eyeY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    const pupilOffset = (ghost.vx || 0) > 0 ? 2 : 0;
    ctx.fillStyle = `hsla(${hue}, 50%, 40%, 0.9)`;
    ctx.beginPath();
    ctx.arc(-eyeSpacing + pupilOffset, eyeY, 2.5, 0, Math.PI * 2);
    ctx.arc(eyeSpacing + pupilOffset, eyeY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.strokeStyle = `hsla(${hue}, 50%, 55%, 0.5)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 5, 6, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    ctx.restore();
  }

  drawThoughtBubble(ctx, character, text, opacity = 1) {
    if (!text) return;
    const cx = character.x + character.width / 2;

    ctx.save();
    ctx.globalAlpha = opacity;

    // Measure text to size bubble dynamically
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

    // Small trailing circles (thought dots)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.arc(cx + 3, character.y - 12, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 7, character.y - 22, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Cloud bubble shape
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 1;
    this._drawCloud(ctx, bx, by, bubbleWidth, bubbleHeight);
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

  /** Draw a cloud-shaped bubble. */
  _drawCloud(ctx, x, y, w, h) {
    const r = Math.min(h / 2, 16);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  /** Word-wrap text to fit maxWidth. */
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

  /** Death wall removed — no-op. */
  drawDeathWall(_ctx, _deathWall, _canvas) {}
}
