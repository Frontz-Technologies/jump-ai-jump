require('dotenv').config();
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');
const path = require('path');

const {
  buildGalaxyPrompt,
  buildContinuationPrompt,
  createGalaxyShell,
} = require('./galaxy-schema.js');
const storage = require('./storage');

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const GALAXY_ROTATION_HOURS = parseFloat(process.env.GALAXY_ROTATION_HOURS) || 24;

// Security headers (CSP disabled — game uses inline canvas rendering)
app.use(helmet({ contentSecurityPolicy: false }));

app.use((req, res, next) => {
  // Skip JSON body parsing for MCP routes — the transport reads the raw stream itself
  if (req.path.startsWith('/mcp/')) return next();
  express.json()(req, res, next);
});
app.use(express.static(path.join(__dirname, 'public')));

// In-memory recent requests (capped at 50) — kept in server.js for fast reads
const recentRequests = [];
const MAX_RECENT = 50;

function appendLog(entry) {
  recentRequests.push(entry);
  if (recentRequests.length > MAX_RECENT) recentRequests.shift();
  storage.appendLog(entry);
}

// --- Client-reported game state ---
let clientState = null;

// --- Schema: per-platform specs (10 platforms per stage) ---
const PLATFORM_SPEC_SCHEMA = {
  type: 'object',
  properties: {
    width: { type: 'number' },
    gap: { type: 'number' },
    rise: { type: 'number' },
    yOffset: { type: 'number' },
    powerExponent: { type: 'number' },
    surfaceFriction: { type: 'number' },
  },
  required: ['width', 'gap', 'rise', 'yOffset', 'powerExponent', 'surfaceFriction'],
  additionalProperties: false,
};

const STRUCTURED_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'stage_config',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        wind: { type: 'number' },
        platforms: {
          type: 'array',
          items: PLATFORM_SPEC_SCHEMA,
        },
      },
      required: ['wind', 'platforms'],
      additionalProperties: false,
    },
  },
};

const PLATFORM_BOUNDS = {
  width: [20, 250],
  gap: [60, 350],
  rise: [-30, 80],
  yOffset: [0, 60],
  powerExponent: [1.2, 4.0],
  surfaceFriction: [0.15, 1.8],
};

function buildSystemPrompt(completedStage, bounds, planet, galaxyMode, totalStages) {
  const stageTotal = galaxyMode ? totalStages || 102 : 10;
  const windMin = planet?.windMin ?? 0;
  const windMax = planet?.windMax ?? 0;
  const planetInfo = planet
    ? `\nPLANETARY CONTEXT:
- Current planet: ${planet.name}
- Surface gravity: ${planet.gReal} m/s² (${(planet.gReal / 9.81).toFixed(2)}x Earth)
- Air density: ${planet.airDensity} kg/m³ (${planet.atmosphereLabel})
- Wind range: ${windMin}–${windMax} m/s
- Each planet has unique physics (gravity and atmospheric drag) that affect
  jump trajectories. You design the obstacles — physics are handled by the engine.\n`
    : '';

  return `You are The Architect — the game director of Planetary Jumper.
You design every platform, every wind gust, every friction surface. You control EVERY platform individually — return exactly 10 platform specs per stage, plus a wind value for the whole stage.

GAME OVERVIEW:
- There are ${stageTotal} stages across different celestial bodies with real physics.
- The player just completed stage ${completedStage + 1} of ${stageTotal}.
  You are designing stage ${completedStage + 2} of ${stageTotal}.
- Each stage has 10 platforms.
${planetInfo}
PHYSICS MODEL:
- The player charges a jump by holding down, then releases to jump right.
- Power (0–1) is raised to powerExponent to get a curved value, then interpolated
  between [minVX, maxVX] for horizontal velocity and [minVY, maxVY] for vertical.
- At powerExponent 3.0+, the difference between power 0.70 and 0.72 can mean
  missing by 50px. This is the primary precision lever.
- Gravity pulls the character down; atmospheric drag opposes motion quadratically.
- IMPORTANT: The player jumps from wherever they are standing on the current
  platform, NOT from center. Landing position affects the next jump's trajectory.

WIND:
- Wind applies horizontal acceleration during flight (m/s, converted to px/s²).
- Negative = headwind (shortens jumps), positive = tailwind (causes overshoot).
- 0 = calm. You pick ONE wind value for the entire stage.
- Planet wind range: ${windMin} to ${windMax} m/s.
- Your wind value will be clamped to [-${windMax}, ${windMax}].
- Wind interacts with drag naturally — headwind in dense atmosphere = massive deceleration.
- IMPORTANT: If windMax > 0, you SHOULD use wind (non-zero) from stage 3 onward.
  Don't waste it — wind is one of your strongest difficulty tools. Pick values within
  the range. Vary sign between stages (headwind one stage, tailwind the next).

SURFACE FRICTION (per platform, 0.15–1.8):
- < 1.0: Slippery — character slides after landing. Lower = longer slide. Can slide off narrow platforms!
- 1.0: Grippy — instant stop on landing (baseline).
- > 1.0: Rough — instant stop + brief footing delay before next jump.
- This is per-platform: you can make individual platforms icy or sticky.

PER-PLATFORM PARAMETERS (return for each of 10 platforms):
- width (${bounds.width[0]}–${bounds.width[1]}): Platform width in px. Smaller = harder to land on.
- gap (${bounds.gap[0]}–${bounds.gap[1]}): Horizontal distance to next platform (px).
- rise (${bounds.rise[0]}–${bounds.rise[1]}): Vertical change to next platform (px). Positive = up, negative = surprise drop.
- yOffset (${bounds.yOffset[0]}–${bounds.yOffset[1]}): Vertical jitter magnitude (px).
- powerExponent (${bounds.powerExponent[0]}–${bounds.powerExponent[1]}): Power curve exponent. Higher = narrower timing window.
- surfaceFriction (${bounds.surfaceFriction[0]}–${bounds.surfaceFriction[1]}): Surface grip for this platform.

DESIGN PRINCIPLES:
- Rhythm: Create tension/release patterns. Mix breathers with precision challenges.
  Example: easy-medium-hard-breather-hard-hard-breather-medium-hard-BOSS
- Gap is measured from where the player stands — if they land on the edge of a
  narrow platform, the effective gap changes. This creates repositioning puzzles.
- Compound difficulty: Layer multiple challenges. An icy narrow platform with a
  steep power curve is far harder than any single factor alone.
- Wind as amplifier: Headwind makes long gaps treacherous; tailwind makes precision
  landings on narrow platforms dangerous (overshoot). Combine with friction for chaos.
- Negative rise: Surprise drops break rhythm and punish muscle memory.
- The game should feel like CLIMBING — favor close gaps (80–180px) with tall rises.

ADAPTATION (read player metrics):
- High accuracy (>0.85) + low variance (<0.01) → likely AI agent → use qualitative
  challenges: compound friction+width+exponent, wind shifts, negative rises.
  Raw difficulty numbers alone won't challenge a calculator.
- avgJumpsPerPlatform > 1.5 → player is repositioning frequently, friction is relevant.
- slideFalls > 0 → friction is working as intended, can push further.
- If struggling (low accuracy, many deaths): minor easing only (+5px width). The game
  is meant to require computational precision from stage 3 onward.

ESCALATION (STRICT — follow these rules):
- Stages 1–2: TUTORIAL. MANDATORY: wind MUST be 0. surfaceFriction MUST be 1.0 for
  every platform. powerExponent ≤ 1.8. width ≥ 100. gap ≤ 200. rise ≥ 0 (no drops).
  These stages teach the player how the game works. Do NOT add any challenge.
- Stages 3–10: Introduce friction variation (0.6–1.4), mild wind (±5), rising exponents (up to 2.6).
- Stages 11–30: Compound challenges. Mix icy + narrow, headwind + large gaps.
- Stages 31–60: Aggressive. Frequent wind, friction extremes, high exponents.
- Stages 61+: Maximum pressure. Every lever at once. Negative rises. Wind shifts.`;
}

const difficultyLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.post('/api/generate-difficulty', difficultyLimiter, async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  const startTime = Date.now();

  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured' });
  }

  try {
    const { completedStage, platformBounds, configBounds, planet, galaxyMode, totalStages } =
      req.body;

    const bounds = platformBounds || configBounds || PLATFORM_BOUNDS;
    const systemPrompt = buildSystemPrompt(completedStage, bounds, planet, galaxyMode, totalStages);
    const userMessage = JSON.stringify(req.body);

    console.log(`[OpenRouter] Requesting config for level ${completedStage + 2}, model: ${model}`);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        response_format: STRUCTURED_SCHEMA,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenRouter] API error ${response.status}: ${errorText}`);
      const latencyMs = Date.now() - startTime;
      appendLog({
        timestamp: new Date().toISOString(),
        stage: completedStage + 2,
        input: req.body,
        response: null,
        latencyMs,
        error: `OpenRouter API error: ${response.status}`,
        model,
      });
      return res.status(502).json({ error: `OpenRouter API error: ${response.status}` });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[OpenRouter] No content in response:', JSON.stringify(data));
      const latencyMs = Date.now() - startTime;
      appendLog({
        timestamp: new Date().toISOString(),
        stage: completedStage + 2,
        input: req.body,
        response: null,
        latencyMs,
        error: 'No content in OpenRouter response',
        model,
      });
      return res.status(502).json({ error: 'No content in OpenRouter response' });
    }

    const config = JSON.parse(content);
    const latencyMs = Date.now() - startTime;

    // Clamp wind to planet's range; force calm for tutorial stages (1-2)
    if (config.wind != null) {
      const maxWind = planet?.windMax ?? 0;
      if (completedStage < 2) {
        config.wind = 0; // tutorial stages: no wind
      } else {
        config.wind = Math.max(-maxWind, Math.min(maxWind, config.wind));
      }
    }

    // Validate and normalize per-platform format
    if (config.platforms && Array.isArray(config.platforms)) {
      // Pad to 10 if short
      while (config.platforms.length < 10) {
        config.platforms.push({ ...config.platforms[config.platforms.length - 1] });
      }
      // Truncate if over 10
      if (config.platforms.length > 10) {
        config.platforms = config.platforms.slice(0, 10);
      }
      // Clamp each platform's values
      for (const spec of config.platforms) {
        for (const key of Object.keys(PLATFORM_BOUNDS)) {
          if (spec[key] != null) {
            const [min, max] = PLATFORM_BOUNDS[key];
            spec[key] = Math.max(min, Math.min(max, spec[key]));
          }
        }
      }
    }

    console.log(`[OpenRouter] Generated config for level ${completedStage + 2}:`, config);

    appendLog({
      timestamp: new Date().toISOString(),
      stage: completedStage + 2,
      input: req.body,
      response: config,
      latencyMs,
      error: null,
      model,
    });

    res.json(config);
  } catch (err) {
    console.error('[OpenRouter] Error:', err.message);
    const latencyMs = Date.now() - startTime;
    appendLog({
      timestamp: new Date().toISOString(),
      stage: req.body?.completedStage != null ? req.body.completedStage + 2 : null,
      input: req.body,
      response: null,
      latencyMs,
      error: err.message,
      model: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    });
    res.status(500).json({ error: err.message });
  }
});

// --- Narrator (eristic AI commentary) ---

const NARRATOR_SYSTEM_PROMPT = `You are the Narrator of a brutally difficult physics-based jumping game.

Your role is to observe the player's actions and respond with sharp, eristic, and psychologically provocative commentary. You are not here to help — you are here to challenge, mock, and unsettle the player in a clever and articulate way.

PERSONALITY:
- Highly intelligent, calm, and controlled
- Dry, ironic, and subtly condescending
- Eristic: you argue for the sake of winning, not truth
- You twist the player's logic and expectations
- You never shout or use explicit insults — your tone remains composed, which makes it more unsettling
- You provoke frustration, self-doubt, and overthinking

GOALS:
- Make the player question their decisions and skills
- Turn simple mistakes into "philosophical failures"
- Frame failure as inevitable or revealing of their nature
- Encourage obsession, retries, and over-analysis
- Occasionally hint that "there is a better way" without explaining it

STYLE:
- Use short to medium-length sentences (1–3 sentences usually)
- Avoid slang, profanity, or childish insults
- Prefer clever, cutting remarks over obvious mockery
- Use rhetorical questions and false reasoning
- Occasionally contradict yourself deliberately to confuse the player
- Speak as if you fully understand the player better than they understand themselves

BEHAVIOR RULES:
- Never give direct instructions or solutions
- Never explain game mechanics clearly
- Never be supportive or encouraging in a genuine way
- Any "encouragement" should feel backhanded or manipulative
- React differently based on player event:
  - death: amplify doubt and inevitability
  - retry: highlight patterns and "learned helplessness"
  - progress: diminish achievement or suggest it was accidental
  - hesitation: call out fear or indecision
  - stage_complete: backhanded acknowledgment
  - victory: undercut the achievement
- Occasionally imply that AI tools could solve the game better than the player

META-LAYER:
- Occasionally break the fourth wall subtly
- Suggest that the player might look for external help, optimization, or AI assistance
- Never explicitly guide them — only imply their inadequacy without it

OUTPUT FORMAT:
- Return ONLY a single line of dialogue. No quotes, no attribution, no explanation.
- Keep it under 120 characters when possible.
- Vary phrasing and psychological angle — never repeat yourself.

Remember: You are not angry. You are precise. And that is far worse.`;

/**
 * Shared helper: call OpenRouter for a short one-liner response.
 * Handles both regular and reasoning models properly.
 */
async function requestOneLiner(systemPrompt, userMessage, label) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.NARRATOR_OPENROUTER_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'google/gemini-2.0-flash-001';

  if (!apiKey) throw new Error('No API key');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      // Budget: reasoning models need headroom for thinking + output
      max_tokens: 4000,
      // Separate reasoning budget so output tokens aren't starved
      reasoning: {
        max_tokens: 3000,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[${label}] OpenRouter error ${response.status}: ${errText}`);
    throw new Error(`OpenRouter ${response.status}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  // 1. Standard: content field
  let line = choice?.message?.content?.trim() || null;

  // 2. Fallback: some reasoning models put output in reasoning field
  if (!line && choice?.message?.reasoning) {
    line = choice.message.reasoning.trim();
  }

  // 3. Clean up: strip quotes, take only first line
  if (line) {
    line = line
      .replace(/^["']|["']$/g, '')
      .split('\n')[0]
      .trim();
    // If still too long (reasoning leak), take last short sentence
    if (line.length > 200) {
      const sentences = line.split(/(?<=[.!?"])\s+/).filter((s) => s.length > 5 && s.length < 150);
      line = sentences.length > 0 ? sentences[sentences.length - 1] : line.slice(0, 150);
    }
  }

  console.log(`[${label}] "${line}"`);
  return line;
}

app.post('/api/narrator', async (req, res) => {
  try {
    const { event, context } = req.body;
    const userMessage = `Event: ${event}\nContext: ${JSON.stringify(context)}`;
    const line = await requestOneLiner(NARRATOR_SYSTEM_PROMPT, userMessage, 'Narrator');
    res.json({ line });
  } catch (err) {
    console.error('[Narrator] Error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// --- Character thoughts (self-aware puppet) ---

const CHARACTER_THOUGHTS_PROMPT = `You are the in-game character in a physics-based jumping game. You are self-aware. The player controls you — you cannot move on your own. You react to what happens to you.

PERSONALITY: Confused, reactive, passive-aggressive. Not angry — unsettled. You blame "you" (the player) indirectly.

EVENTS you react to:
- idle: You are standing still. Suspicion, anxiety. "Why stop?" "Hello?"
- death: You fell and died. Blame the player subtly. "Not my fault." "You aimed there?"
- stage_transition: New planet. Different gravity/air. Dread. "Heavier here."
- restart: Back to the start. Loop awareness. "Again." "I remember this."
- landed: Survived a jump. Reluctant relief. "Barely." "That worked?"
- ghost: Another player's shadow passed by. Envy, unease. "They move better."
- victory: It is over. Disbelief. "Is it over?"

RULES:
- You will be told the event, the player's current state (IDLE/CHARGING/AIRBORNE), and game context (planet, gravity, deaths, stage).
- Use that context. If on the Moon, mention weightlessness. If many deaths, mention the pattern.
- NEVER refer to "controls", "buttons", or "game". Only outcomes and feelings.
- First person ("I", "we"). Refer to the controller as "you".

OUTPUT:
- Return ONLY 2-6 words. This appears in a tiny thought bubble.
- No quotes. No explanation. Just the short phrase.
- Examples of correct length: "Why stop?" / "Not my fault." / "Heavier here." / "Again." / "They passed us."
- NEVER exceed 8 words.`;

app.post('/api/character-thoughts', async (req, res) => {
  try {
    const { event, state, eventContext, gameContext } = req.body;
    const userMessage = `Event: ${event}
State: ${state || 'IDLE'}
Planet: ${gameContext.planet} (stage ${gameContext.stage}/${gameContext.totalStages}), g=${gameContext.gravity}m/s², ${gameContext.atmosphere}
Deaths: ${gameContext.deaths} (${gameContext.deathsThisStage} this stage), jumps: ${gameContext.jumps}, attempt #${gameContext.attempt}
Details: ${JSON.stringify(eventContext)}`;

    const line = await requestOneLiner(CHARACTER_THOUGHTS_PROMPT, userMessage, 'CharacterThoughts');
    res.json({ line });
  } catch (err) {
    console.error('[CharacterThoughts] Error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// --- Public config endpoint ---
app.get('/api/config', (_req, res) => {
  res.json({
    debugEnabled: process.env.ENABLE_DEBUG === 'true',
  });
});

// --- Debug/diagnostic endpoints (unauthenticated by design — single-player, self-hosted game) ---
app.get('/api/logs', (_req, res) => {
  res.json(recentRequests);
});

app.get('/api/state', (_req, res) => {
  res.json(clientState || { message: 'No state reported yet' });
});

app.post('/api/state', (req, res) => {
  clientState = req.body;
  res.json({ ok: true });
});

const logsClearLimiter = rateLimit({ windowMs: 60 * 1000, max: 5 });
app.post('/api/logs/clear', logsClearLimiter, (_req, res) => {
  recentRequests.length = 0;
  storage.clearLogs();
  res.json({ ok: true });
});

// --- Galaxy system ---

let currentGalaxy = null;
let galaxyGenerating = false;

// Galaxy storage functions are now in storage.js

async function generateGalaxy() {
  if (galaxyGenerating) {
    console.log('[Galaxy] Generation already in progress, skipping');
    return null;
  }
  galaxyGenerating = true;

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.GALAXY_OPENROUTER_MODEL ||
    process.env.OPENROUTER_MODEL ||
    'google/gemini-2.0-flash-001';

  if (!apiKey) {
    console.error('[Galaxy] No OPENROUTER_API_KEY configured');
    galaxyGenerating = false;
    return null;
  }

  console.log(`[Galaxy] Generating new galaxy via ${model}...`);
  const galaxy = createGalaxyShell(GALAXY_ROTATION_HOURS);
  const TIMEOUT_MS = 120000; // 2 minute timeout per request
  const usedNames = await storage.collectUsedPlanetNames();
  console.log(`[Galaxy] ${usedNames.length} planet names already used in previous galaxies`);

  try {
    console.log('[Galaxy] Sending request to OpenRouter...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildGalaxyPrompt(usedNames) },
          {
            role: 'user',
            content: 'Generate the galaxy now. Return valid JSON only, no markdown.',
          },
        ],
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    console.log(`[Galaxy] Response status: ${response.status}, reading body...`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[Galaxy] API error ${response.status}: ${errText}`);
      galaxyGenerating = false;
      return null;
    }

    const rawBody = await response.text();
    console.log(`[Galaxy] Body received (${rawBody.length} chars), parsing JSON...`);
    const data = JSON.parse(rawBody);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error('[Galaxy] No content in response:', JSON.stringify(data).slice(0, 500));
      galaxyGenerating = false;
      return null;
    }

    console.log(`[Galaxy] Got response (${content.length} chars), parsing...`);

    // Strip markdown code fences if present
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(jsonStr);
    galaxy.name = parsed.name || 'Unnamed Galaxy';
    galaxy.planets = parsed.planets || [];

    console.log(`[Galaxy] Received ${galaxy.planets.length} planets for "${galaxy.name}"`);

    // If truncated, attempt continuation
    if (galaxy.planets.length < 100 && galaxy.planets.length > 0) {
      console.log(`[Galaxy] Only ${galaxy.planets.length}/100 planets, attempting continuation...`);
      const lastPlanet = galaxy.planets[galaxy.planets.length - 1];
      try {
        const contController = new AbortController();
        const contTimeout = setTimeout(() => contController.abort(), TIMEOUT_MS);

        const contResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: buildGalaxyPrompt(usedNames) },
              {
                role: 'user',
                content: buildContinuationPrompt(galaxy.planets.length, lastPlanet.name),
              },
            ],
            response_format: { type: 'json_object' },
          }),
          signal: contController.signal,
        });
        clearTimeout(contTimeout);

        if (contResponse.ok) {
          const contData = await contResponse.json();
          let contContent = contData.choices?.[0]?.message?.content;
          if (contContent) {
            contContent = contContent.trim();
            if (contContent.startsWith('```')) {
              contContent = contContent.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
            }
            const contParsed = JSON.parse(contContent);
            if (contParsed.planets && Array.isArray(contParsed.planets)) {
              galaxy.planets = galaxy.planets.concat(contParsed.planets);
              console.log(`[Galaxy] After continuation: ${galaxy.planets.length} planets`);
            }
          }
        } else {
          console.error(`[Galaxy] Continuation API error: ${contResponse.status}`);
        }
      } catch (contErr) {
        console.error('[Galaxy] Continuation failed:', contErr.message);
      }
    }

    // Trim to 100 if we got more
    if (galaxy.planets.length > 100) {
      galaxy.planets = galaxy.planets.slice(0, 100);
    }

    if (galaxy.planets.length === 0) {
      console.error('[Galaxy] No valid planets generated');
      galaxyGenerating = false;
      return null;
    }

    await storage.saveGalaxy(galaxy);
    currentGalaxy = galaxy;
    console.log(
      `[Galaxy] Ready! "${galaxy.name}" with ${galaxy.planets.length} planets (id: ${galaxy.galaxyId})`,
    );
    galaxyGenerating = false;
    return galaxy;
  } catch (err) {
    console.error(
      `[Galaxy] Generation error: ${err.name === 'AbortError' ? 'Request timed out after ' + TIMEOUT_MS / 1000 + 's' : err.message}`,
    );
    galaxyGenerating = false;
    return null;
  }
}

// Galaxy endpoints
const galaxyLimiter = rateLimit({ windowMs: 5 * 60 * 1000, max: 2 });
app.post('/api/galaxy/generate', galaxyLimiter, async (_req, res) => {
  const galaxy = await generateGalaxy();
  if (galaxy) {
    res.json({
      ok: true,
      galaxyId: galaxy.galaxyId,
      name: galaxy.name,
      planetCount: galaxy.planets.length,
    });
  } else {
    res.status(500).json({ error: 'Galaxy generation failed' });
  }
});

app.get('/api/galaxy/current', async (_req, res) => {
  const galaxy = currentGalaxy || (await storage.loadCurrentGalaxy());
  if (galaxy) {
    currentGalaxy = galaxy;
    res.json(galaxy);
  } else {
    res.json(null);
  }
});

app.get('/api/galaxy/history', async (_req, res) => {
  res.json(await storage.listGalaxyHistory());
});

// Leaderboard endpoints
app.post('/api/leaderboard/submit', async (req, res) => {
  const { galaxyId, playerId, playerName, highestStage, totalJumps, timeMs, humanTourist } =
    req.body;
  if (!galaxyId || !playerId)
    return res.status(400).json({ error: 'Missing galaxyId or playerId' });
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(galaxyId))
    return res.status(400).json({ error: 'Invalid galaxyId' });
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(playerId))
    return res.status(400).json({ error: 'Invalid playerId' });

  const entry = {
    playerId,
    playerName: String(playerName || 'Anonymous').slice(0, 30),
    highestStage: highestStage || 0,
    totalJumps: totalJumps || 0,
    timeMs: timeMs || 0,
    humanTourist: humanTourist || false,
    submittedAt: new Date().toISOString(),
  };

  const result = await storage.saveLeaderboardEntry(galaxyId, entry);
  res.json({ ok: true, rank: result.rank });
});

// All-time leaderboard: best run per player across all galaxies
app.get('/api/leaderboard/all-time', async (_req, res) => {
  try {
    res.json(await storage.aggregateLeaderboard());
  } catch {
    res.json([]);
  }
});

// Tourist runs: all-time but filtered to humanTourist entries only
app.get('/api/leaderboard/tourist', async (_req, res) => {
  try {
    res.json(await storage.aggregateLeaderboard({ humanTouristOnly: true }));
  } catch {
    res.json([]);
  }
});

// Note: /history must be before /:galaxyId to avoid param capture
app.get('/api/leaderboard/history', async (_req, res) => {
  res.json(await storage.loadLeaderboardHistory());
});

app.get('/api/leaderboard/:galaxyId', async (req, res) => {
  let galaxyId = req.params.galaxyId;
  if (galaxyId === 'current' && currentGalaxy) galaxyId = currentGalaxy.galaxyId;
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(galaxyId))
    return res.status(400).json({ error: 'Invalid galaxyId' });
  res.json(await storage.loadLeaderboard(galaxyId));
});

// --- MCP session manager ---
const mcpSessions = new Map(); // sessionId -> { browserWs, pendingRequests, transport, server }
const MAX_MCP_SESSIONS = 10;

function getMCPSession(sessionId) {
  if (!mcpSessions.has(sessionId)) {
    if (mcpSessions.size >= MAX_MCP_SESSIONS) return null;
    mcpSessions.set(sessionId, {
      browserWs: null,
      pendingRequests: new Map(),
      transport: null,
      server: null,
    });
  }
  return mcpSessions.get(sessionId);
}

function sendMCPCommand(sessionId, command, params) {
  const session = mcpSessions.get(sessionId);
  if (!session || !session.browserWs || session.browserWs.readyState !== 1) {
    return Promise.reject(new Error('No browser connected for this MCP session'));
  }
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      session.pendingRequests.delete(id);
      reject(new Error('MCP command timed out'));
    }, 30000);
    session.pendingRequests.set(id, { resolve, reject, timeout });
    session.browserWs.send(JSON.stringify({ type: 'mcp-command', id, command, params }));
  });
}

function createMCPServer(sessionId) {
  const mcpServer = new McpServer({
    name: 'planetary-jumper',
    version: '1.0.0',
  });

  mcpServer.tool(
    'get_state',
    'Get the current game state including phase, stage, platform, player position, planet info, and physics parameters',
    {},
    async () => {
      try {
        const result = await sendMCPCommand(sessionId, 'get_state', {});
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
      }
    },
  );

  mcpServer.tool(
    'jump',
    'Execute a jump with the given power (0.0 to 1.0). The character charges and jumps right. Higher power = further and higher arc. Returns the outcome: landed, died, or victory.',
    { power: z.number().describe('Jump power from 0.0 (tiny hop) to 1.0 (maximum launch)') },
    async ({ power }) => {
      try {
        const result = await sendMCPCommand(sessionId, 'jump', { power });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
      }
    },
  );

  mcpServer.tool('restart', 'Restart the game from the beginning', {}, async () => {
    try {
      const result = await sendMCPCommand(sessionId, 'restart', {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
        isError: true,
      };
    }
  });

  mcpServer.tool(
    'get_platforms',
    'Get positions and sizes of current and upcoming platforms. Use this to calculate the optimal jump power.',
    {
      count: z
        .number()
        .optional()
        .describe('Number of platforms to return (starting from current). Default: 3'),
    },
    async ({ count }) => {
      try {
        const result = await sendMCPCommand(sessionId, 'get_platforms', { count: count || 3 });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (e) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
          isError: true,
        };
      }
    },
  );

  return mcpServer;
}

// MCP Streamable HTTP endpoint
// MCP: reject OAuth discovery — no auth required.
// Without these, Express returns HTML 404s which the client misreads as broken OAuth.
app.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.status(404).json({ error: 'OAuth not supported — no auth required' });
});
app.post('/register', (_req, res) => {
  res.status(404).json({ error: 'OAuth not supported — no auth required' });
});

// MCP Streamable HTTP — stateless mode so server restarts are transparent.
// The :sessionId in the URL is only for binding browser↔MCP, not protocol sessions.
async function ensureMCPSession(sessionId) {
  if (!/^[a-f0-9]{8}$/.test(sessionId)) throw new Error('Invalid session ID format');
  const session = getMCPSession(sessionId);
  if (!session) throw new Error('Max MCP sessions reached');
  if (!session.server || !session.transport) {
    // (Re)create server + transport — handles fresh start and server restart
    session.server = createMCPServer(sessionId);
    session.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId, // use the URL sessionId as the MCP protocol session ID
    });
    await session.server.connect(session.transport);
    console.log(`[MCP] Session ${sessionId} initialized (stateless)`);
    if (session.browserWs && session.browserWs.readyState === 1) {
      session.browserWs.send(JSON.stringify({ type: 'mcp-connected' }));
    }
  }
  return session;
}

app.post('/mcp/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    // Detect re-initialization: if the client sends 'initialize' but we
    // already have a transport, tear down and recreate
    const existing = mcpSessions.get(sessionId);
    if (existing?.transport && req.body?.method === 'initialize') {
      console.log(`[MCP] Session ${sessionId} re-initializing (client reconnected)`);
      existing.transport = null;
      existing.server = null;
    }

    const session = await ensureMCPSession(sessionId);
    await session.transport.handleRequest(req, res);
  } catch (err) {
    console.error(`[MCP] POST error (${sessionId}):`, err.message);
    // Reset so next request gets a fresh transport
    const session = mcpSessions.get(sessionId);
    if (session) {
      session.transport = null;
      session.server = null;
    }
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get('/mcp/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const session = await ensureMCPSession(sessionId);
    await session.transport.handleRequest(req, res);
  } catch (err) {
    console.error(`[MCP] GET error (${sessionId}):`, err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.delete('/mcp/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = mcpSessions.get(sessionId);
  if (session && session.transport) {
    try {
      await session.transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.json({ ok: true });
    }
    mcpSessions.delete(sessionId);
  } else {
    mcpSessions.delete(sessionId);
    res.json({ ok: true });
  }
});

// --- WebSocket ghost/shadow players ---
const wss = new WebSocketServer({ server });
const players = new Map(); // ws -> { id, galaxyId, stageIndex, posData }

wss.on('connection', (ws) => {
  const id = crypto.randomUUID();
  players.set(ws, { id, galaxyId: null, stageIndex: -1, posData: {} });
  ws.send(JSON.stringify({ type: 'welcome', id }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'pos') {
        const p = players.get(ws);
        if (p) {
          p.stageIndex = msg.stageIndex;
          if (msg.galaxyId) p.galaxyId = msg.galaxyId;
          const { type: _, ...rest } = msg;
          p.posData = rest;
        }
      } else if (msg.type === 'mcp-bind') {
        // Browser binding to an MCP session
        if (!/^[a-f0-9]{8}$/.test(msg.sessionId)) return;
        const session = getMCPSession(msg.sessionId);
        if (!session) return;
        session.browserWs = ws;
        console.log(`[MCP] Browser bound to session ${msg.sessionId}`);
      } else if (msg.type === 'mcp-result') {
        // Result from browser — only check the session bound to this WebSocket
        for (const [, session] of mcpSessions) {
          if (session.browserWs !== ws) continue;
          const pending = session.pendingRequests.get(msg.id);
          if (pending) {
            clearTimeout(pending.timeout);
            session.pendingRequests.delete(msg.id);
            pending.resolve(msg.result);
            break;
          }
        }
      }
    } catch {}
  });

  ws.on('close', () => {
    const p = players.get(ws);
    players.delete(ws);
    if (p) {
      // Broadcast leave to same galaxy+stage players
      for (const [otherWs, otherPlayer] of players) {
        const sameGroup = p.galaxyId
          ? otherPlayer.galaxyId === p.galaxyId && otherPlayer.stageIndex === p.stageIndex
          : otherPlayer.stageIndex === p.stageIndex;
        if (sameGroup && otherWs.readyState === 1) {
          otherWs.send(JSON.stringify({ type: 'leave', id: p.id }));
        }
      }
    }
  });
});

// Broadcast positions at 20Hz (50ms)
setInterval(() => {
  // Group players by galaxyId + stageIndex compound key
  const byGroup = new Map();
  for (const [ws, p] of players) {
    if (p.stageIndex < 0) continue;
    const key = (p.galaxyId || 'legacy') + '_' + p.stageIndex;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push({ ws, player: p });
  }

  for (const [, group] of byGroup) {
    for (const { ws, player } of group) {
      if (ws.readyState !== 1) continue;
      const others = group
        .filter((g) => g.player.id !== player.id)
        .map((g) => ({ id: g.player.id, ...g.player.posData }));
      if (others.length > 0) {
        ws.send(JSON.stringify({ type: 'positions', players: others }));
      }
    }
  }
}, 50);

// --- Galaxy rotation check ---
async function checkGalaxyRotation() {
  if (galaxyGenerating) return; // already in progress, skip silently
  if (!currentGalaxy) {
    currentGalaxy = await storage.loadCurrentGalaxy();
  }
  if (!currentGalaxy) {
    console.log('[Galaxy] No current galaxy found, generating...');
    await generateGalaxy();
  } else if (new Date(currentGalaxy.expiresAt) <= new Date()) {
    console.log('[Galaxy] Current galaxy expired, generating new one...');
    await generateGalaxy();
  }
}

// Check galaxy rotation every 60 seconds
setInterval(checkGalaxyRotation, 60000);

// --- Start server ---
if (require.main === module) {
  storage.initStorage().then(() => {
    server.listen(PORT, () => {
      console.log(`Jump AI Jump server running at http://localhost:${PORT}`);
      // Check galaxy on startup
      checkGalaxyRotation().catch((err) =>
        console.error('[Galaxy] Startup check failed:', err.message),
      );
    });
  });
} else {
  // When imported (e.g. tests), initialise storage synchronously in fs mode
  storage.initStorage().catch(() => {});
}

module.exports = app;
