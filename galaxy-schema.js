/**
 * Galaxy schema and LLM prompt builder for procedural galaxy generation.
 * Server-side CommonJS module.
 */

const crypto = require('crypto');

const BODY_TYPES = [
  'rocky',
  'volcanic',
  'icy',
  'gas_giant',
  'hazy',
  'earth_like',
  'barren',
  'exotic',
];

const GALAXY_PLANET_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'galaxy',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        planets: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              gReal: { type: 'number' },
              airDensity: { type: 'number' },
              bodyType: { type: 'string' },
              atmosphereLabel: { type: 'string' },
              description: { type: 'string' },
              skyColor: { type: 'string' },
              groundColor: { type: 'string' },
              platformColor: { type: 'string' },
              platformStroke: { type: 'string' },
              minW: { type: 'number' },
              maxW: { type: 'number' },
              minGap: { type: 'number' },
              maxGap: { type: 'number' },
              yOffset: { type: 'number' },
              minRise: { type: 'number' },
              maxRise: { type: 'number' },
              powerExponent: { type: 'number' },
              surfaceFriction: { type: 'number' },
              windMin: { type: 'number' }, // minimum wind speed (m/s), 0 for no-atmosphere bodies
              windMax: { type: 'number' }, // maximum wind speed (m/s)
            },
            required: [
              'name',
              'gReal',
              'airDensity',
              'bodyType',
              'atmosphereLabel',
              'description',
              'skyColor',
              'groundColor',
              'platformColor',
              'platformStroke',
              'minW',
              'maxW',
              'minGap',
              'maxGap',
              'yOffset',
              'minRise',
              'maxRise',
              'powerExponent',
              'windMin',
              'windMax',
            ],
            additionalProperties: false,
          },
        },
      },
      required: ['name', 'planets'],
      additionalProperties: false,
    },
  },
};

function buildGalaxyPrompt(usedPlanetNames = []) {
  const exclusionBlock =
    usedPlanetNames.length > 0
      ? `\nALREADY USED IN PREVIOUS GALAXIES (DO NOT reuse any of these names):\n${usedPlanetNames.join(', ')}\n`
      : '';

  return `You are a procedural universe designer for a browser platformer game called "Planetary Jumper".

Your task: generate a galaxy — a sequence of exactly 100 real celestial bodies (planets, moons, dwarf planets, exoplanets, stars, etc.) that the player will traverse.

REQUIREMENTS:
1. Each body must be a REAL astronomical object (e.g. Ganymede, Kepler-442b, Proxima Centauri b, Io, Enceladus, Ceres, etc.) — not fictional.
2. Use scientifically accurate surface gravity (gReal in m/s²) and atmospheric density (airDensity in kg/m³). Use 0 for vacuum.
3. The galaxy needs a creative name that describes the journey theme (e.g. "The Jovian Descent", "Stellar Wanderer", "Icy Frontier").
4. UNIQUENESS: Every planet name must be unique — no duplicates within this galaxy AND no reuse of names from previous galaxies (see exclusion list below). There are thousands of real celestial bodies: solar system moons (174+), dwarf planets, asteroids, confirmed exoplanets (5000+), and named stars. Explore the full catalog — don't default to the familiar inner solar system.
${exclusionBlock}

BODY TYPES (for visual rendering):
- "rocky" — Moon-like, Mercury-like: black sky, starfield, cratered ground
- "volcanic" — Io-like: dark sky, volcanic surface, lava glow
- "icy" — Europa-like, Enceladus-like: black sky, ice surface, crack lines
- "gas_giant" — Jupiter-like: horizontal bands, no solid ground
- "hazy" — Venus-like, Titan-like: layered gradient haze
- "earth_like" — blue sky, clouds, ground
- "barren" — Mars-like: colored sky gradient, barren ground
- "exotic" — neutron stars, pulsars: extreme visuals

DIFFICULTY PROGRESSION (stages 1-100):
- Stages 1-20: Accessible but challenging. Platform widths 35-65px, gaps 150-270px, powerExponent 2.0-2.6
- Stages 21-60: Hard. Platform widths 25-50px, gaps 170-300px, powerExponent 2.4-3.2
- Stages 61-100: Extreme. Platform widths 20-40px, gaps 180-350px, powerExponent 3.0-4.0
- yOffset: 20-50 (increases with difficulty)
- minRise: 20-45, maxRise: 35-70 (increases with difficulty)

COLOR GUIDELINES:
- skyColor: hex color for the sky/background (e.g. "#000008" for space, "#c2742e" for Mars-like)
- groundColor: hex color for ground (e.g. "#8a8a8a" for grey, "#a0b0c0" for ice)
- platformColor: hex color for platforms — should contrast with sky
- platformStroke: slightly darker version of platformColor
- atmosphereLabel: "Dense", "Thin", or "Vacuum"

SURFACE FRICTION (surfaceFriction, 0.0–2.0 scale — optional, omit to use bodyType default):
- 0.1–0.3: Very icy, long post-landing slide (can slide off narrow platforms). Default for "icy" bodies.
- 0.4–0.6: Smooth, short drift after landing. Default for "gas_giant", "hazy".
- 0.7–0.9: Normal, near-instant stop. Default for "earth_like", "barren".
- 1.0: Grippy, instant stop (baseline).
- 1.2–1.5: Rough, instant stop + brief footing delay before next jump. Default for "rocky".
- 1.5–2.0: Very rough, instant stop + longer footing delay. Default for "volcanic", "exotic".
Only include surfaceFriction if you want a value different from the bodyType default.

WIND DATA (realistic wind speeds in m/s):
- windMin/windMax: Range of possible wind speeds for this body.
- No atmosphere = no wind: windMin: 0, windMax: 0 (Moon, Mercury, most asteroids)
- Thin atmosphere: windMin: 0, windMax: 20-30 (Mars: dust storms up to ~30 m/s)
- Earth-like: windMin: 0, windMax: 20-35
- Dense atmosphere: windMin: 0, windMax: 60-100 (Venus super-rotation: ~100 m/s)
- Gas giants: windMin: 30, windMax: 150-180 (Jupiter jet streams, Saturn storms)
- Use real astronomical data for wind speeds.

DIVERSITY:
- Ensure a mix of body types across the 100 entries. Don't cluster all similar types together.
- Vary the starting bodies — don't always begin with Moon/Mercury/Mars.
- IMPORTANT: At least 30-40% of planets should have atmosphere (airDensity > 0, windMax > 0).
  Include Venus-like, Titan-like, Earth-like exoplanets, gas giants, and other atmospheric
  bodies throughout the sequence. Don't fill the galaxy with only vacuum moons and asteroids —
  wind and drag are core gameplay mechanics that require atmospheric planets.

Return a JSON object with:
- "name": creative galaxy journey name
- "planets": array of exactly 100 objects, each with: name, gReal, airDensity, bodyType, atmosphereLabel, description (1 short sentence), skyColor, groundColor, platformColor, platformStroke, minW, maxW, minGap, maxGap, yOffset, minRise, maxRise, powerExponent, windMin, windMax, and optionally surfaceFriction`;
}

function buildContinuationPrompt(receivedCount, lastPlanetName) {
  return `Continue generating the galaxy planet list. You previously generated ${receivedCount} planets, the last being "${lastPlanetName}". Continue from planet ${receivedCount + 1} to 100. Return a JSON object with "planets" array containing the remaining ${100 - receivedCount} planets in the exact same format.`;
}

function createGalaxyShell(rotationHours) {
  const galaxyId = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + rotationHours * 60 * 60 * 1000);
  return {
    galaxyId,
    name: '',
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    planets: [],
  };
}

function validateGalaxyPlanet(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.name !== 'string' || !p.name) return false;
  if (typeof p.gReal !== 'number' || p.gReal <= 0) return false;
  if (typeof p.airDensity !== 'number' || p.airDensity < 0) return false;
  if (!BODY_TYPES.includes(p.bodyType)) return false;
  if (typeof p.skyColor !== 'string') return false;
  if (typeof p.groundColor !== 'string') return false;
  if (typeof p.platformColor !== 'string') return false;
  if (typeof p.platformStroke !== 'string') return false;
  if (typeof p.minW !== 'number') return false;
  if (typeof p.maxW !== 'number') return false;
  if (typeof p.minGap !== 'number') return false;
  if (typeof p.maxGap !== 'number') return false;
  if (typeof p.windMin !== 'number' || p.windMin < 0) return false;
  if (typeof p.windMax !== 'number' || p.windMax < p.windMin) return false;
  return true;
}

function validateGalaxy(galaxy) {
  if (!galaxy || typeof galaxy !== 'object') return false;
  if (!galaxy.galaxyId || !galaxy.planets || !Array.isArray(galaxy.planets)) return false;
  if (galaxy.planets.length === 0) return false;
  return galaxy.planets.every(validateGalaxyPlanet);
}

module.exports = {
  BODY_TYPES,
  GALAXY_PLANET_SCHEMA,
  buildGalaxyPrompt,
  buildContinuationPrompt,
  createGalaxyShell,
  validateGalaxyPlanet,
  validateGalaxy,
};
