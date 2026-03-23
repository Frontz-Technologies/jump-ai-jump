/**
 * Procedural background renderers for galaxy body types.
 * Each renderer: (ctx, w, h, planet, seed) => void
 * Uses planet.skyColor + planet.groundColor as primary palette.
 */

function seededRandom(seed) {
  let s = seed;
  return function () {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function drawStarfield(ctx, w, h, count, seed) {
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

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function lerpColor(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r},${g},${b})`;
}

// --- Body type renderers ---

function drawRocky(ctx, w, h, planet, seed) {
  // Black sky with starfield and cratered grey/brown ground
  ctx.fillStyle = planet.skyColor || '#000000';
  ctx.fillRect(0, 0, w, h);

  drawStarfield(ctx, w, h, 120, seed);

  // Ground
  ctx.fillStyle = planet.groundColor || '#8a8a8a';
  ctx.fillRect(0, h * 0.85, w, h * 0.15);

  // Craters on ground
  const rng = seededRandom(seed + 100);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let i = 0; i < 10; i++) {
    const cx = rng() * w;
    const cy = h * 0.87 + rng() * h * 0.1;
    const r = 3 + rng() * 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Optional small sun in corner
  if (seed % 3 === 0) {
    const sunX = w * 0.85;
    const sunY = h * 0.1;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 6, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(sunX, sunY, 3, sunX, sunY, 30);
    glow.addColorStop(0, 'rgba(255,255,200,0.3)');
    glow.addColorStop(1, 'rgba(255,255,200,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 30, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawVolcanic(ctx, w, h, planet, seed) {
  // Dark sky with orange/red volcanic glow
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, planet.skyColor || '#1a0500');
  grad.addColorStop(0.7, '#2a0800');
  grad.addColorStop(1, planet.groundColor || '#4a1500');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Faint stars at top
  drawStarfield(ctx, w, h * 0.4, 40, seed);

  // Volcanic ground
  ctx.fillStyle = planet.groundColor || '#4a1500';
  ctx.fillRect(0, h * 0.82, w, h * 0.18);

  // Lava pools
  const rng = seededRandom(seed + 200);
  for (let i = 0; i < 5; i++) {
    const lx = rng() * w;
    const ly = h * 0.84 + rng() * h * 0.12;
    const lr = 8 + rng() * 20;
    const lavaGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
    lavaGrad.addColorStop(0, 'rgba(255,120,20,0.8)');
    lavaGrad.addColorStop(0.6, 'rgba(255,80,10,0.4)');
    lavaGrad.addColorStop(1, 'rgba(255,50,0,0)');
    ctx.fillStyle = lavaGrad;
    ctx.beginPath();
    ctx.ellipse(lx, ly, lr * 1.5, lr * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Orange glow from below
  const glowGrad = ctx.createLinearGradient(0, h * 0.7, 0, h);
  glowGrad.addColorStop(0, 'rgba(255,100,20,0)');
  glowGrad.addColorStop(1, 'rgba(255,80,10,0.15)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

function drawIcy(ctx, w, h, planet, seed) {
  // Black sky with starfield and ice surface with cracks
  ctx.fillStyle = planet.skyColor || '#000010';
  ctx.fillRect(0, 0, w, h);

  drawStarfield(ctx, w, h, 140, seed);

  // Optional parent planet in sky
  const rng = seededRandom(seed + 300);
  if (seed % 2 === 0) {
    const px = w * (0.15 + rng() * 0.3);
    const py = h * (0.1 + rng() * 0.15);
    const pr = 40 + rng() * 60;
    const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    pGrad.addColorStop(0, '#d4a87a');
    pGrad.addColorStop(0.7, '#c09060');
    pGrad.addColorStop(1, '#8b6848');
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Ice surface
  ctx.fillStyle = planet.groundColor || '#d0e8f0';
  ctx.fillRect(0, h * 0.85, w, h * 0.15);

  // Crack lines
  ctx.strokeStyle = 'rgba(100,160,180,0.5)';
  ctx.lineWidth = 1;
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

function drawGasGiant(ctx, w, h, planet, seed) {
  // Horizontal color bands — no solid ground
  const sky = planet.skyColor || '#c4956a';
  const ground = planet.groundColor || '#a07050';
  const rng = seededRandom(seed + 400);

  const bandCount = 10 + Math.floor(rng() * 6);
  const bandH = h / bandCount;
  for (let i = 0; i < bandCount; i++) {
    const t = i / (bandCount - 1);
    const color = lerpColor(sky, ground, t + (rng() - 0.5) * 0.3);
    ctx.fillStyle = color;
    ctx.fillRect(0, i * bandH, w, bandH + 1);
  }

  // Storm spot
  ctx.save();
  ctx.globalAlpha = 0.35;
  const spotX = w * (0.3 + rng() * 0.4);
  const spotY = h * (0.3 + rng() * 0.4);
  const spotGrad = ctx.createRadialGradient(spotX, spotY, 0, spotX, spotY, 45);
  spotGrad.addColorStop(0, '#c04020');
  spotGrad.addColorStop(1, 'rgba(192,64,32,0)');
  ctx.fillStyle = spotGrad;
  ctx.beginPath();
  ctx.ellipse(spotX, spotY, 55, 25, rng() * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHazy(ctx, w, h, planet, seed) {
  // Layered gradient haze using planet colors
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  const sky = planet.skyColor || '#d4a050';
  const ground = planet.groundColor || '#6b4a10';
  grad.addColorStop(0, sky);
  grad.addColorStop(0.3, lerpColor(sky, ground, 0.2));
  grad.addColorStop(0.5, lerpColor(sky, ground, 0.4));
  grad.addColorStop(0.7, lerpColor(sky, ground, 0.6));
  grad.addColorStop(1, ground);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Haze bands
  const rng = seededRandom(seed + 500);
  for (let i = 0; i < 5; i++) {
    const y = h * (0.1 + i * 0.17 + rng() * 0.03);
    const rgb = hexToRgb(sky);
    ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.06 + i * 0.02})`;
    ctx.fillRect(0, y, w, h * 0.08);
  }

  // Ground strip
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.87, w, h * 0.13);
}

function drawEarthLike(ctx, w, h, planet, seed) {
  // Blue sky gradient with clouds and ground
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, planet.skyColor || '#4a90d9');
  grad.addColorStop(0.6, lerpColor(planet.skyColor || '#4a90d9', '#ffffff', 0.3));
  grad.addColorStop(1, '#b0d4e8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Clouds
  const rng = seededRandom(seed + 600);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(
      rng() * w, h * (0.08 + rng() * 0.2),
      60 + rng() * 50, 15 + rng() * 12,
      rng() * 0.3, 0, Math.PI * 2
    );
    ctx.fill();
  }

  // Ground
  ctx.fillStyle = planet.groundColor || '#4a7c3f';
  ctx.fillRect(0, h * 0.85, w, h * 0.15);
}

function drawBarren(ctx, w, h, planet, seed) {
  // Colored sky gradient and barren ground
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, lerpColor(planet.skyColor || '#8b4513', '#000000', 0.3));
  grad.addColorStop(0.4, planet.skyColor || '#8b4513');
  grad.addColorStop(0.8, lerpColor(planet.skyColor || '#8b4513', planet.groundColor || '#6b3410', 0.5));
  grad.addColorStop(1, planet.groundColor || '#6b3410');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Ground
  ctx.fillStyle = planet.groundColor || '#6b3410';
  ctx.fillRect(0, h * 0.85, w, h * 0.15);

  // Small moons
  const rng = seededRandom(seed + 700);
  if (seed % 2 === 0) {
    ctx.fillStyle = '#d0c8c0';
    ctx.beginPath();
    ctx.arc(w * (0.2 + rng() * 0.3), h * (0.05 + rng() * 0.1), 2 + rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawExotic(ctx, w, h, planet, seed) {
  // Extreme visuals: pulsing gradients, inverted colors
  const rng = seededRandom(seed + 800);

  // Deep space gradient
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, planet.skyColor || '#1a0030');
  grad.addColorStop(0.4, lerpColor(planet.skyColor || '#1a0030', '#000000', 0.5));
  grad.addColorStop(1, '#000000');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Dense starfield
  drawStarfield(ctx, w, h, 200, seed);

  // Central bright object (neutron star / pulsar)
  const cx = w * (0.4 + rng() * 0.2);
  const cy = h * (0.3 + rng() * 0.2);
  const pulseR = 15 + rng() * 20;

  // Core glow
  const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, pulseR * 3);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.1, planet.groundColor || '#a0b0ff');
  coreGrad.addColorStop(0.4, `rgba(160,180,255,0.3)`);
  coreGrad.addColorStop(1, 'rgba(160,180,255,0)');
  ctx.fillStyle = coreGrad;
  ctx.fillRect(cx - pulseR * 3, cy - pulseR * 3, pulseR * 6, pulseR * 6);

  // Bright core
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();

  // Radiation beams
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = planet.groundColor || '#a0b0ff';
  ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng() * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * w * 0.5, cy + Math.sin(angle) * h * 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

export const BODY_TYPE_RENDERERS = {
  rocky: drawRocky,
  volcanic: drawVolcanic,
  icy: drawIcy,
  gas_giant: drawGasGiant,
  hazy: drawHazy,
  earth_like: drawEarthLike,
  barren: drawBarren,
  exotic: drawExotic,
};
