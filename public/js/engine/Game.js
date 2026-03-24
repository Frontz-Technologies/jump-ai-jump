import { Character, CharState } from '../entities/Character.js';
import { Platform } from '../entities/Platform.js';
import { Input } from './Input.js';
import { applyPhysics, checkLanding, powerToVelocity, estimateSlideDistance } from './Physics.js';
import { Renderer } from '../rendering/Renderer.js';
import { HUD } from '../rendering/HUD.js';
import { PlanetaryTheme } from '../rendering/themes/PlanetaryTheme.js';
import { UIManager } from '../ui/UIManager.js';
import { SettingsModal } from '../ui/SettingsModal.js';
import { StatsModal } from '../ui/StatsModal.js';
import { Storage } from '../data/Storage.js';
import { checkTrophies } from '../data/Trophies.js';
import { AudioManager } from '../audio/AudioManager.js';
import {
  PLANET_CONFIGS,
  PLATFORMS_PER_STAGE,
  TOTAL_PLATFORMS as _TOTAL_PLATFORMS,
  makePlanetFromGalaxy,
} from '../data/PlanetConfig.js';
import { DifficultyManager } from './DifficultyManager.js';
import { GhostNetwork } from '../net/GhostNetwork.js';
import { GalaxyClient } from '../net/GalaxyClient.js';
import { LeaderboardModal } from '../ui/LeaderboardModal.js';

import { CharacterThoughts } from '../narrator/CharacterThoughts.js';

const GameState = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY',
};

const ANIM_SPEED = 4; // how fast platforms drop in (higher = faster)

export class Game {
  constructor(canvas, analytics) {
    this._analytics = analytics;
    this.state = GameState.MENU;
    this.storage = new Storage();
    this.audio = new AudioManager();
    this.renderer = new Renderer(canvas);
    this.hud = new HUD();
    this.input = new Input();

    // Difficulty
    this.difficulty = new DifficultyManager(analytics);
    this.difficulty.setOnConfigApplied((stageIndex, config) => {
      this._regenerateStagePlatforms(stageIndex, config);
      // Update wind display if config arrived for the current stage
      if (stageIndex === this.stageIndex) {
        this.hud.updateWind(this.difficulty.getStageWind(stageIndex));
      }
    });
    this._lastLoggedGenStage = -1;

    // Theme — Planetary
    this.theme = new PlanetaryTheme();
    this.renderer.setTheme(this.theme);

    // Level state
    this.character = null;
    this.platforms = [];
    this.currentPlatformIndex = 0;
    this.stageIndex = 0;
    this._nextPlatformX = 0;
    this._nextPlatformY = 0;

    // Current planet config
    this.currentPlanet = PLANET_CONFIGS[0];

    // Thought bubble state
    this._thoughtBubbleTimer = 0;
    this._pendingVelocity = null;
    this._visiblePlatforms = [];

    // Background transition state
    this.bgTransition = {
      active: false,
      fromColor: '',
      toColor: '',
      originX: 0,
      originY: 0,
      progress: 0,
      duration: 0.6,
    };

    // Planet info pause timer
    this._planetInfoTimer = 0;

    // Speed multiplier for dev controls
    this._speedMult = 1;

    // Pending platform regeneration (deferred until landing)
    this._pendingRegen = null;

    // Ghost/shadow multiplayer
    this.ghostNet = new GhostNetwork();

    // Galaxy mode
    this.galaxyClient = new GalaxyClient();
    this._galaxyMode = false;
    this._totalStages = PLANET_CONFIGS.length;
    this._galaxyPlanets = []; // cached runtime planet objects from galaxy

    // Human Tourist mode
    this._isHumanTourist = false;
    this._checkpoint = null;

    // Auto-play state
    this._autoPlay = false;
    this._autoPlayTimer = null;

    // Leaderboard modal
    this.leaderboardModal = new LeaderboardModal();

    // Character inner thoughts (self-aware puppet)
    this.thoughts = new CharacterThoughts();

    this._initUI();
    this._initInput();
    this._initSettings();
    this._initLeaderboard();

    // Apply saved settings
    this.audio.setEnabled(this.storage.getSettings().sound);

    // Prefetch galaxy info for menu display
    this._loadMenuGalaxyInfo();

    // Start loop
    this._lastTime = 0;
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _initUI() {
    this.ui = new UIManager({
      onStart: () => this._onPlayClicked(),
      onRetry: () => this._startGame(),
      onMenu: () => this._showMenu(),
      onMenuSettingsOpen: () => {
        this.settingsModal.setMenuContext(true);
        this.settingsModal.open();
      },
      onGameSettingsOpen: () => {
        this.settingsModal.setMenuContext(false);
        this.settingsModal.open();
      },
      onStatsOpen: () => this.statsModal.open(),
      onContinueCheckpoint: () => this._continueFromCheckpoint(),
    });

    // Name prompt (first time)
    this._namePrompt = document.getElementById('name-prompt');
    this._namePromptInput = document.getElementById('name-prompt-input');
    const okBtn = document.getElementById('name-prompt-ok');
    if (okBtn) {
      okBtn.addEventListener('click', () => this._submitNamePrompt());
    }
    if (this._namePromptInput) {
      this._namePromptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this._submitNamePrompt();
      });
    }
  }

  /** Show name prompt if first time, otherwise start game directly. */
  _onPlayClicked() {
    const name = this.storage.getPlayerName();
    if (name === 'Anonymous' && this._namePrompt) {
      this._namePrompt.classList.remove('hidden');
      if (this._namePromptInput) this._namePromptInput.focus();
    } else {
      this._startGame();
    }
  }

  _submitNamePrompt() {
    if (!this._namePromptInput) return;
    const val = this._namePromptInput.value.trim();
    this.storage.setPlayerName(val || 'Anonymous');
    if (this._namePrompt) this._namePrompt.classList.add('hidden');
    this._startGame();
  }

  _initInput() {
    this.input.init({
      onJumpStart: () => {
        if (this.state !== GameState.PLAYING) return;
        if (this._planetInfoTimer > 0) return; // paused for planet info
        if (this.character.state !== CharState.IDLE && this.character.state !== CharState.SLIDING)
          return;
        this.character.cancelSlide();
        this.character.startCharge();
        this.audio.playCharge();
      },
      onJumpRelease: (power) => {
        if (this.state !== GameState.PLAYING) return;
        if (this._planetInfoTimer > 0) return;
        if (this.character.state !== CharState.CHARGING) return;
        this.audio.stopCharge();
        this._doJump(power);
      },
    });
  }

  _initSettings() {
    this.settingsModal = new SettingsModal(this.storage, {
      onSoundChange: (on) => this.audio.setEnabled(on),
      onDarkModeChange: () => {},
    });
    this.statsModal = new StatsModal(this.storage);
  }

  _initLeaderboard() {
    const menuBtn = document.getElementById('menu-leaderboard');
    const goBtn = document.getElementById('btn-gameover-leaderboard');
    const vicBtn = document.getElementById('btn-victory-leaderboard');
    const openLb = () => this.leaderboardModal.open(this.galaxyClient.getGalaxyId());
    if (menuBtn) menuBtn.addEventListener('click', openLb);
    if (goBtn) goBtn.addEventListener('click', openLb);
    if (vicBtn) vicBtn.addEventListener('click', openLb);
  }

  async _loadMenuGalaxyInfo() {
    try {
      const galaxy = await this.galaxyClient.fetchCurrent();
      const el = document.getElementById('daily-challenge');
      const nameEl = document.getElementById('daily-galaxy-name');
      const metaEl = document.getElementById('daily-galaxy-meta');
      if (galaxy && galaxy.name) {
        if (el && nameEl) {
          nameEl.textContent = galaxy.name;
          if (metaEl) {
            metaEl.textContent = `${galaxy.planets.length} worlds to cross`;
          }
          el.classList.remove('hidden');
        }
      } else {
        // Galaxy unavailable — show fallback info
        if (el && nameEl) {
          nameEl.textContent = 'Default Planets';
          nameEl.classList.add('fallback-warning');
          if (metaEl) {
            metaEl.textContent = '⚠ Daily galaxy unavailable';
            metaEl.classList.add('fallback-warning');
          }
          el.classList.remove('hidden');
        }
      }
    } catch {
      /* intentionally empty */
    }
  }

  _showMenu() {
    this.state = GameState.MENU;
    this.ui.showScreen('menu');
    this.input.enabled = false;
  }

  /**
   * Get the planet config for a given stage index.
   * Stages 0-1: tutorial (PLANET_CONFIGS[0-1])
   * Stage 2+: galaxy planets (if galaxy mode)
   */
  _getPlanetForStage(stageIndex) {
    let planet;
    let isDefault = false;
    if (!this._galaxyMode || stageIndex < 2) {
      planet = PLANET_CONFIGS[Math.min(stageIndex, PLANET_CONFIGS.length - 1)];
      // Stages 0-1 are always tutorial; only flag as fallback if galaxy failed entirely
      if (stageIndex >= 2) isDefault = true;
    } else {
      const galaxyIdx = stageIndex - 2;
      if (galaxyIdx < this._galaxyPlanets.length) {
        planet = this._galaxyPlanets[galaxyIdx];
      } else {
        planet =
          this._galaxyPlanets.length > 0
            ? this._galaxyPlanets[this._galaxyPlanets.length - 1]
            : PLANET_CONFIGS[PLANET_CONFIGS.length - 1];
        if (!this._galaxyPlanets.length) isDefault = true;
      }
    }
    // Tag with stage index for HUD display
    planet._stageIndex = stageIndex;
    planet._isDefault = isDefault;
    return planet;
  }

  async _startGame() {
    // Fetch galaxy
    let galaxy = null;
    try {
      galaxy = await this.galaxyClient.fetchCurrent();
    } catch (err) {
      console.warn('[Game] Galaxy fetch failed, using legacy mode:', err.message);
    }

    this._galaxyMode = !!(galaxy && galaxy.planets && galaxy.planets.length > 0);

    if (this._galaxyMode) {
      this._galaxyPlanets = galaxy.planets.map((p) => makePlanetFromGalaxy(p));
      this._totalStages = 2 + this._galaxyPlanets.length;
      this.ghostNet.setGalaxyId(galaxy.galaxyId);
    } else {
      this._galaxyPlanets = [];
      this._totalStages = PLANET_CONFIGS.length;
      this.ghostNet.setGalaxyId(null);
    }

    this.platforms = [];
    this.currentPlatformIndex = 0;
    this.stageIndex = 0;
    this._nextPlatformX = 80;
    this._nextPlatformY = 0; // will be set after displayHeight is known
    this.currentPlanet = this._getPlanetForStage(0);
    this.bgTransition = {
      active: false,
      fromColor: '',
      toColor: '',
      originX: 0,
      originY: 0,
      progress: 0,
      duration: 0.6,
    };
    this._planetInfoTimer = 0;

    // Cache Human Tourist mode at game start
    this._isHumanTourist = this.storage.getSettings().humanTourist === true;
    this._checkpoint = null;

    // Cache personal best platform for current mode (1-based; 0 = no record)
    const bestKey = this._isHumanTourist ? 'bestPlatformTourist' : 'bestPlatform';
    this._personalBestPlatform = this.storage.getStats()[bestKey] || 0;

    // Init difficulty with galaxy data if available
    if (this._galaxyMode) {
      this.difficulty.initFromGalaxy(this._galaxyPlanets, this._totalStages);
    } else {
      this.difficulty.resetToDefaults();
    }
    this.difficulty.setHumanTouristMode(this._isHumanTourist);
    this.difficulty.beginStage(0);
    this._lastLoggedGenStage = -1;

    // Generate palettes from all planets (tutorial + galaxy)
    const allPlanets = this._galaxyMode
      ? [PLANET_CONFIGS[0], PLANET_CONFIGS[1], ...this._galaxyPlanets]
      : PLANET_CONFIGS;
    this.theme.initStagePalettes(allPlanets.length, allPlanets);
    this.theme.setPlanetIndex(0);

    // Init vertical progression start
    this._nextPlatformY = this.renderer.displayHeight * 0.6;

    // Generate first batch of platforms
    this._generatePlatforms(PLATFORMS_PER_STAGE + 5);

    // First batch: no animation, already placed
    for (const p of this.platforms) {
      p.animOffset = 0;
    }

    // Create character on first platform
    const start = this.platforms[0];
    this.character = new Character(start.x + start.width / 2 - 20, start.y - 40);

    // Reset thought bubble state
    this._thoughtBubbleTimer = 0;
    this._pendingVelocity = null;

    this._updateVisiblePlatforms();

    // Center camera
    this._centerCameraOnPlatform(0);
    this.renderer.cameraX = this.renderer.cameraTargetX;
    this.renderer.cameraY = this.renderer.cameraTargetY;

    this.hud.updatePlanet(this.currentPlanet, this._totalStages);
    this.hud.updateWind(this.difficulty.getStageWind(this.stageIndex));
    this.hud.updatePlatformsLeft(PLATFORMS_PER_STAGE);
    this.hud.adaptToBackground(this.theme.getCurrentBg());
    this.state = GameState.PLAYING;
    this.input.enabled = true;
    this.ui.showGame();

    // Connect ghost network
    this.ghostNet.connect();

    this.storage.incrementStat('totalGames');
    checkTrophies(this.storage);

    // Character thoughts: game start
    this.thoughts.onGameStart();
    this.thoughts.setContext({
      stageIndex: 0,
      planetName: this.currentPlanet.name,
      planetGravity: this.currentPlanet.gReal,
      planetAtmosphere: this.currentPlanet.atmosphereLabel,
      totalStages: this._totalStages,
    });

    if (this._analytics) {
      this._analytics.log('game', 'start', {
        galaxyMode: this._galaxyMode,
        totalStages: this._totalStages,
      });
    }
  }

  /**
   * Clamp a gap so the next platform edge is always visible on screen.
   * Reserves space for at least the minimum platform width to peek in.
   */
  _clampGap(gap, platformWidth) {
    // Max gap = viewport width minus current platform width minus some padding
    // so the next platform's left edge is always visible
    const maxGap = this.renderer.displayWidth * 0.75 - platformWidth;
    return Math.min(gap, Math.max(maxGap, 80));
  }

  _generatePlatforms(count) {
    for (let i = 0; i < count; i++) {
      const globalIndex = this.platforms.length;
      const stageIdx = Math.min(
        Math.floor(globalIndex / PLATFORMS_PER_STAGE),
        this._totalStages - 1,
      );
      const platformInStage = globalIndex % PLATFORMS_PER_STAGE;

      if (stageIdx !== this._lastLoggedGenStage) {
        const source = this.difficulty.getConfigSource(stageIdx);
        if (this._analytics) {
          this._analytics.log('game', 'generate', {
            stageIndex: stageIdx,
            stageNumber: stageIdx + 1,
            source,
          });
        }
        this._lastLoggedGenStage = stageIdx;
      }

      // Try per-platform spec first, fall back to legacy range-based config
      const spec = this.difficulty.getPlatformSpec(stageIdx, platformInStage);

      let width, gap, yRandom, rise;
      if (spec) {
        width = spec.width;
        gap = this._clampGap(spec.gap, width);
        yRandom = spec.yOffset === 0 ? 0 : (Math.random() - 0.5) * 2 * spec.yOffset;
        rise = spec.rise;
      } else {
        const cfg = this.difficulty.getStageConfig(stageIdx);
        width = cfg.minW + Math.random() * (cfg.maxW - cfg.minW);
        gap = this._clampGap(cfg.minGap + Math.random() * (cfg.maxGap - cfg.minGap), width);
        yRandom = cfg.yOffset === 0 ? 0 : (Math.random() - 0.5) * 2 * cfg.yOffset;
        rise = cfg.minRise + Math.random() * (cfg.maxRise - cfg.minRise);
      }

      const x = this.platforms.length === 0 ? 80 : this._nextPlatformX;
      const y = this._nextPlatformY + yRandom;
      const p = new Platform(x, 0, width, 20);
      p.y = y;
      p.definitionY = y;
      p.surfaceFriction = spec?.surfaceFriction ?? null;
      this.platforms.push(p);

      this._nextPlatformX = x + width + gap;
      // Rise upward for next platform
      this._nextPlatformY -= rise;
    }
  }

  _ensurePlatformsAhead() {
    // Keep at least 10 platforms ahead of the current one
    const needed = this.currentPlatformIndex + 15 - this.platforms.length;
    if (needed > 0) {
      this._generatePlatforms(needed);
      // Y positions are set in _generatePlatforms; animOffset is -80 from constructor
    }
  }

  /**
   * Queue a regeneration for when the player next lands.
   */
  _regenerateStagePlatforms(stageIndex, cfg) {
    this._pendingRegen = { stageIndex, cfg };
  }

  /**
   * Apply a queued platform regeneration.
   */
  _applyPendingRegen() {
    if (!this._pendingRegen) return;
    const { stageIndex, cfg } = this._pendingRegen;
    this._pendingRegen = null;

    const firstIdx = stageIndex * PLATFORMS_PER_STAGE;
    const lastIdx = firstIdx + PLATFORMS_PER_STAGE - 1;

    const startRegen = Math.max(firstIdx, this.currentPlatformIndex + 2);
    if (startRegen > lastIdx) return;
    if (startRegen >= this.platforms.length) return;

    const endRegen = Math.min(lastIdx, this.platforms.length - 1);
    let regenerated = 0;

    for (let i = startRegen; i <= endRegen; i++) {
      const prevPlat = this.platforms[i - 1];
      const platformInStage = i % PLATFORMS_PER_STAGE;
      const spec = this.difficulty.getPlatformSpec(stageIndex, platformInStage);

      let width, gap, yRandom, rise;
      if (spec) {
        width = spec.width;
        gap = this._clampGap(spec.gap, width);
        yRandom = spec.yOffset === 0 ? 0 : (Math.random() - 0.5) * 2 * spec.yOffset;
        rise = spec.rise;
      } else {
        width = cfg.minW + Math.random() * (cfg.maxW - cfg.minW);
        gap = this._clampGap(cfg.minGap + Math.random() * (cfg.maxGap - cfg.minGap), width);
        yRandom = cfg.yOffset === 0 ? 0 : (Math.random() - 0.5) * 2 * cfg.yOffset;
        rise = cfg.minRise + Math.random() * (cfg.maxRise - cfg.minRise);
      }

      const p = this.platforms[i];
      p.x = prevPlat.x + prevPlat.width + gap;
      p.width = width;
      const y = prevPlat.y - rise + yRandom;
      p.y = y;
      p.definitionY = y;
      p.surfaceFriction = spec?.surfaceFriction ?? null;
      regenerated++;
    }

    // Fix X and Y positions for all platforms after the regenerated range
    for (let i = endRegen + 1; i < this.platforms.length; i++) {
      const prevPlat = this.platforms[i - 1];
      const pStageIdx = Math.min(Math.floor(i / PLATFORMS_PER_STAGE), this._totalStages - 1);
      const pInStage = i % PLATFORMS_PER_STAGE;
      const pSpec = this.difficulty.getPlatformSpec(pStageIdx, pInStage);

      let gap, rise, yR;
      if (pSpec) {
        gap = this._clampGap(pSpec.gap, this.platforms[i].width);
        rise = pSpec.rise;
        yR = pSpec.yOffset === 0 ? 0 : (Math.random() - 0.5) * 2 * pSpec.yOffset;
      } else {
        const pCfg = this.difficulty.getStageConfig(pStageIdx);
        gap = this._clampGap(
          pCfg.minGap + Math.random() * (pCfg.maxGap - pCfg.minGap),
          this.platforms[i].width,
        );
        rise = pCfg.minRise + Math.random() * (pCfg.maxRise - pCfg.minRise);
        yR = pCfg.yOffset === 0 ? 0 : (Math.random() - 0.5) * 2 * pCfg.yOffset;
      }

      this.platforms[i].x = prevPlat.x + prevPlat.width + gap;
      const y = prevPlat.y - rise + yR;
      this.platforms[i].y = y;
      this.platforms[i].definitionY = y;
    }

    // Update _nextPlatformX and _nextPlatformY
    if (this.platforms.length > 0) {
      const last = this.platforms[this.platforms.length - 1];
      const lastStageIdx = Math.min(
        Math.floor((this.platforms.length - 1) / PLATFORMS_PER_STAGE),
        this._totalStages - 1,
      );
      const lastInStage = (this.platforms.length - 1) % PLATFORMS_PER_STAGE;
      const lastSpec = this.difficulty.getPlatformSpec(lastStageIdx, lastInStage);

      let lastGap, lastRise;
      if (lastSpec) {
        lastGap = lastSpec.gap;
        lastRise = lastSpec.rise;
      } else {
        const lastCfg = this.difficulty.getStageConfig(lastStageIdx);
        lastGap = lastCfg.minGap + Math.random() * (lastCfg.maxGap - lastCfg.minGap);
        lastRise = lastCfg.minRise + Math.random() * (lastCfg.maxRise - lastCfg.minRise);
      }
      this._nextPlatformX = last.x + last.width + lastGap;
      this._nextPlatformY = last.y - lastRise;
    }

    if (regenerated > 0 && this._analytics) {
      this._analytics.log('game', 'regenerate', {
        stageIndex,
        stageNumber: stageIndex + 1,
        regenerated,
        range: `${startRegen}-${endRegen}`,
      });
    }

    this._updateVisiblePlatforms();
  }

  _centerCameraOnPlatform(index) {
    const platform = this.platforms[index];
    if (!platform) return;
    const platformCenterX = platform.x + platform.width / 2;
    // Offset camera so current platform sits in left third — shows more ahead
    const lookAhead = this.renderer.displayWidth * 0.05;
    this.renderer.cameraTargetX = platformCenterX - this.renderer.displayWidth / 2 + lookAhead;
    const platformCenterY = platform.y + platform.height / 2;
    this.renderer.cameraTargetY = platformCenterY - this.renderer.displayHeight / 2;
  }

  _getActivePlanet() {
    // Apply tourist gravity clamp before powerExponent overrides
    const basePlanet = this.difficulty.getTouristPlanet(this.currentPlanet);
    // Try per-platform powerExponent first, then stage-level
    const platformInStage = this.currentPlatformIndex % PLATFORMS_PER_STAGE;
    const spec = this.difficulty.getPlatformSpec(this.stageIndex, platformInStage);
    if (spec && spec.powerExponent != null) {
      return { ...basePlanet, powerExponent: spec.powerExponent };
    }
    const cfg = this.difficulty.getStageConfig(this.stageIndex);
    if (cfg.powerExponent != null) {
      return { ...basePlanet, powerExponent: cfg.powerExponent };
    }
    return basePlanet;
  }

  _doJump(power) {
    const { vx, vy } = powerToVelocity(power, this._getActivePlanet());

    this.difficulty.recordJump({ power, platformIndex: this.currentPlatformIndex });

    if (this._analytics) {
      this._analytics.log('player', 'jump', { power, platformIndex: this.currentPlatformIndex });
    }

    this.character.launch(vx, vy);
    this._recordJump();
    this.audio.playJump();
  }

  _loop(timestamp) {
    const rawDt = Math.min((timestamp - this._lastTime) / 1000, 0.05);
    this._lastTime = timestamp;

    const dt = rawDt * this._speedMult;

    if (this.state === GameState.PLAYING) {
      this._update(dt);
    }

    this._dt = dt;
    this._draw();
    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  _update(dt) {
    const char = this.character;
    if (!char) return;

    // Planet info pause
    if (this._planetInfoTimer > 0) {
      this._planetInfoTimer -= dt;
      if (this._planetInfoTimer <= 0) {
        this._planetInfoTimer = 0;
        this._hidePlanetInfo();
      }
      // Still advance background transition during info pause
      if (this.bgTransition.active) {
        this.bgTransition.progress += dt / this.bgTransition.duration;
        if (this.bgTransition.progress >= 1) {
          this.bgTransition.progress = 1;
          this.bgTransition.active = false;
          this.theme.setCurrentBg(this.bgTransition.toColor);
          this.hud.adaptToBackground(this.bgTransition.toColor);
        }
      }
      return;
    }

    char.updateAnimation(dt);

    // Animate platform spawn offsets toward 0
    for (const entry of this._visiblePlatforms) {
      const p = entry.platform;
      if (p.animOffset !== 0) {
        p.animOffset += (0 - p.animOffset) * ANIM_SPEED * dt;
        if (Math.abs(p.animOffset) < 0.5) p.animOffset = 0;
      }
    }

    // Advance background transition
    if (this.bgTransition.active) {
      this.bgTransition.progress += dt / this.bgTransition.duration;
      if (this.bgTransition.progress >= 1) {
        this.bgTransition.progress = 1;
        this.bgTransition.active = false;
        this.theme.setCurrentBg(this.bgTransition.toColor);
        this.hud.adaptToBackground(this.bgTransition.toColor);
      }
    }

    // Handle thought bubble countdown
    if (char.state === CharState.THOUGHT_BUBBLE) {
      this._thoughtBubbleTimer -= dt;
      if (this._thoughtBubbleTimer <= 0) {
        const { vx, vy } = this._pendingVelocity;
        this.character.launch(vx, vy);
        this._pendingVelocity = null;
        this.audio.playJump();
      }
      return;
    }

    // Handle sliding state (icy slide or rough footing delay)
    if (char.state === CharState.SLIDING) {
      const plat = this.platforms[this.currentPlatformIndex];
      const friction = plat?.surfaceFriction ?? this.currentPlanet.surfaceFriction ?? 1.0;
      const result = char.updateSlide(dt, friction);
      if (result.fellOff) {
        this.difficulty.recordSlideFall();
        // Character slid off platform — now airborne, fall detection handles game over
        char.vy = 0;
      }
      // Camera follows during slide
      this.renderer.followCharacter(char);

      // If slide finished and auto-play active, schedule next jump
      if (char.state === CharState.IDLE && this._autoPlay) {
        this._scheduleAutoJump();
      }
    }

    if (char.state === CharState.AIRBORNE) {
      const prevY = char.y;
      const wind = this.difficulty.getStageWind(this.stageIndex);
      applyPhysics(char, dt, this.difficulty.getTouristPlanet(this.currentPlanet), wind);

      // Check landing — only current platform (fallback) and next
      const nextIdx = this.currentPlatformIndex + 1;
      const landTargets = [this.currentPlatformIndex, nextIdx];
      for (const i of landTargets) {
        if (i >= this.platforms.length) continue;
        if (checkLanding(char, this.platforms[i], prevY)) {
          const friction =
            this.platforms[i].surfaceFriction ?? this.currentPlanet.surfaceFriction ?? 1.0;
          char.landOn(this.platforms[i], friction);
          const prevStage = this.stageIndex;
          this.currentPlatformIndex = i;
          this.stageIndex = Math.floor(i / PLATFORMS_PER_STAGE);

          // Record landing metrics
          const landedPlat = this.platforms[i];
          this.difficulty.recordLanding({
            platformIndex: i,
            landingX: char.x + char.width / 2,
            platformX: landedPlat.x,
            platformWidth: landedPlat.width,
          });

          if (this._analytics) {
            this._analytics.log('player', 'land', {
              platformIndex: i,
              stageIndex: this.stageIndex,
            });
          }

          // Character thoughts: landing
          this.thoughts.onLand(i, this.stageIndex);
          if (char.state === CharState.SLIDING) {
            this.thoughts.onSlide(friction);
          }

          // Victory check: landed on last platform
          const totalPlatforms = this._totalStages * PLATFORMS_PER_STAGE;
          if (i >= totalPlatforms - 1) {
            this.difficulty.endStage(this.stageIndex);
            this._victory();
            return;
          }

          // Stage transition
          if (this.stageIndex > prevStage) {
            // Save checkpoint for Human Tourist mode
            if (this._isHumanTourist) {
              this._checkpoint = {
                stageIndex: this.stageIndex,
                stageMetrics: JSON.parse(JSON.stringify(this.difficulty.getStageMetrics())),
                stats: { ...this.storage.getStats() },
              };
            }

            this.difficulty.endStage(prevStage);
            this.difficulty.beginStage(this.stageIndex);
            this.difficulty.requestNextStageConfig(prevStage);

            // Update planet
            this.currentPlanet = this._getPlanetForStage(this.stageIndex);
            this.theme.setPlanetIndex(this.stageIndex);
            this.hud.updatePlanet(this.currentPlanet, this._totalStages);
            this.hud.updateWind(this.difficulty.getStageWind(this.stageIndex));
            this.audio.playComplete();

            // Character thoughts: stage complete
            this.thoughts.onStageComplete(this.stageIndex, this.currentPlanet.name);
            this.thoughts.setContext({
              stageIndex: this.stageIndex,
              planetName: this.currentPlanet.name,
              planetGravity: this.currentPlanet.gReal,
              planetAtmosphere: this.currentPlanet.atmosphereLabel,
            });

            // Start background transition (fade through black)
            const newPalette =
              this.theme.stagePalettes[
                Math.min(this.stageIndex, this.theme.stagePalettes.length - 1)
              ];
            this.bgTransition = {
              active: true,
              fromColor: this.theme.getCurrentBg(),
              toColor: newPalette.bg,
              originX: 0,
              originY: 0,
              progress: 0,
              duration: 1.0,
            };

            // Only show planet info on first transition (stage 0 → 1)
            if (prevStage === 0) {
              this._showPlanetInfo(this.currentPlanet);
              this._planetInfoTimer = 2.0;
            }
          }

          this._ensurePlatformsAhead();
          this._applyPendingRegen();
          this._updateVisiblePlatforms();
          this.audio.playLand();

          this._centerCameraOnPlatform(i);

          // Update platforms remaining in current stage
          const platformInStage = i % PLATFORMS_PER_STAGE;
          this.hud.updatePlatformsLeft(PLATFORMS_PER_STAGE - platformInStage);

          // Early LLM prefetch at platform 7+ of current stage
          if (platformInStage >= 7) {
            const nextStageIdx = this.stageIndex + 1;
            if (nextStageIdx < this._totalStages) {
              this.difficulty.requestNextStageConfigEarly(this.stageIndex);
            }
          }

          // Track best platform and best stage
          const bestKey = this._isHumanTourist ? 'bestPlatformTourist' : 'bestPlatform';
          this.storage.setStatIfHigher(bestKey, i + 1);
          this.storage.setStatIfHigher('bestStage', this.stageIndex + 1);
          checkTrophies(this.storage);

          // Auto-play: schedule next jump after landing
          if (this._autoPlay) {
            this._scheduleAutoJump();
          }

          break;
        }
      }

      // Check if fallen far below the current platform
      const currentPlat = this.platforms[this.currentPlatformIndex];
      if (currentPlat && char.y > currentPlat.y + 600) {
        this._gameOver(`You fell on ${this.currentPlanet.name}!`);
        return;
      }
    }

    // Update AI thinking indicator
    this.hud.setAIThinking(this.difficulty.isLLMPending());

    // Character thoughts idle tracking
    const charStateName =
      char.state === CharState.IDLE
        ? 'IDLE'
        : char.state === CharState.CHARGING
          ? 'CHARGING'
          : char.state === CharState.SLIDING
            ? 'SLIDING'
            : 'AIRBORNE';
    this.thoughts.update(dt, charStateName);

    // Camera follow
    if (char.state === CharState.AIRBORNE || char.state === CharState.SLIDING) {
      this.renderer.followCharacter(char);
    }
    this.renderer.updateCamera(dt);

    // Ghost network: send position and interpolate
    const currentPlat = this.platforms[this.currentPlatformIndex];
    const nextPlat = this.platforms[this.currentPlatformIndex + 1] || null;
    if (currentPlat) {
      this.ghostNet.sendPosition(
        this.stageIndex,
        char,
        currentPlat,
        this.currentPlatformIndex,
        nextPlat,
        this.currentPlatformIndex + 1,
      );
    }
    this.ghostNet.updateInterpolation(dt);

    // Check if a ghost is nearby — trigger character thought
    const ghosts = this.ghostNet.getGhosts(
      this.stageIndex,
      this.platforms,
      this.currentPlatformIndex,
    );
    if (ghosts && ghosts.length > 0 && char.state === CharState.IDLE) {
      this.thoughts.onGhostNearby(ghosts.length);
    }
  }

  _draw() {
    if (!this.character) {
      this.renderer.draw(
        { x: 0, y: 0, width: 0, height: 0, vx: 0, vy: 0, scaleX: 1, scaleY: 1 },
        [],
        { thoughtBubble: false },
      );
      return;
    }

    const power = this.character.state === CharState.CHARGING ? this.input.getCurrentPower() : 0;

    // Compute AI eye indicator state
    const char = this.character;
    const palette = this.theme.stagePalettes
      ? this.theme.stagePalettes[Math.min(this.stageIndex, this.theme.stagePalettes.length - 1)]
      : null;

    // Build sliding info for visual effects
    const slidingInfo =
      char.state === CharState.SLIDING
        ? {
            active: true,
            friction: this.currentPlanet.surfaceFriction ?? 1.0,
            slideVx: char._slideVx,
          }
        : null;

    this.renderer.draw(char, this._visiblePlatforms, {
      thoughtBubble: char.state === CharState.THOUGHT_BUBBLE,
      characterThought: this.thoughts.getThought(),
      power,
      bgTransition: this.bgTransition,
      planetIndex: this.stageIndex,
      planet: this.currentPlanet,
      sliding: slidingInfo,
      personalBestIndex: this._personalBestPlatform,
      ghosts: this.ghostNet.getGhosts(this.stageIndex, this.platforms, this.currentPlatformIndex),
      aiEye: {
        active: this.difficulty.isLLMPending(),
        charScreenX: char.x + char.width / 2 - this.renderer.cameraX,
        charScreenY: char.y + char.height / 2 - this.renderer.cameraY,
        irisColor: palette ? palette.platform : '#6b8f71',
        dt: this._dt || 0,
      },
    });
  }

  _showPlanetInfo(planet) {
    const el = document.getElementById('planet-info');
    if (!el) return;
    document.getElementById('planet-info-name').textContent = planet.name;
    document.getElementById('planet-info-gravity').textContent =
      `g = ${planet.gReal} m/s² (${(planet.gReal / 9.81).toFixed(2)}x Earth)`;
    document.getElementById('planet-info-atmo').textContent =
      `Atmosphere: ${planet.atmosphereLabel}`;
    document.getElementById('planet-info-desc').textContent = planet.description;
    el.classList.remove('hidden');
  }

  _hidePlanetInfo() {
    const el = document.getElementById('planet-info');
    if (el) el.classList.add('hidden');
  }

  _gameOver(_message) {
    const planet = this.currentPlanet;
    const cause = 'fell';
    this.difficulty.recordDeath({
      cause,
      platformIndex: this.currentPlatformIndex,
      stageIndex: this.stageIndex,
    });

    if (this._analytics) {
      this._analytics.log('player', 'death', {
        cause,
        platformIndex: this.currentPlatformIndex,
        stageIndex: this.stageIndex,
      });
    }

    this.state = GameState.GAME_OVER;
    this.input.enabled = false;
    this.stopAutoPlay();
    this._hidePlanetInfo();
    this.audio.playFall();

    // Character thoughts: death
    this.thoughts.onDeath(this.currentPlatformIndex, this.stageIndex, planet.name);
    this.ui.showGameOver(
      `You fell on ${planet.name}!`,
      this.currentPlatformIndex + 1,
      this.stageIndex + 1,
      this._isHumanTourist && this._checkpoint != null,
    );
    this._submitScore();
  }

  async _continueFromCheckpoint() {
    if (!this._checkpoint) return;

    // Save checkpoint data before skipToStage, which calls _startGame and resets it
    const cp = this._checkpoint;
    const savedMetrics = cp.stageMetrics;
    const savedStats = cp.stats;
    const targetStage = cp.stageIndex;

    // skipToStage rebuilds the world at the checkpoint stage
    await this.skipToStage(targetStage);

    // Restore real metrics from checkpoint instead of fake ones
    for (let s = 0; s < savedMetrics.length; s++) {
      if (savedMetrics[s]) {
        this.difficulty.setStageMetrics(s, savedMetrics[s]);
      }
    }

    // Restore stats snapshot
    this.storage.restoreStats(savedStats);

    // Re-apply tourist mode (skipToStage resets difficulty)
    this._isHumanTourist = true;
    this.difficulty.setHumanTouristMode(true);

    // Re-persist checkpoint so it survives subsequent deaths
    this._checkpoint = cp;
  }

  _victory() {
    this.state = GameState.VICTORY;
    this.input.enabled = false;
    this.stopAutoPlay();
    this._hidePlanetInfo();
    this.audio.playComplete();
    this.ui.showVictory(this.currentPlatformIndex + 1, this.stageIndex + 1);

    // Character thoughts: victory
    this.thoughts.onVictory();
    this._submitScore();
  }

  _submitScore() {
    if (!this._galaxyMode) return;
    const galaxyId = this.galaxyClient.getGalaxyId();
    if (!galaxyId) return;
    const playerId = this.storage.getPlayerId();
    const playerName = this.storage.getPlayerName();
    fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        galaxyId,
        playerId,
        playerName,
        highestStage: this.stageIndex + 1,
        totalJumps: this.storage.getStats().totalJumps,
        timeMs: 0,
        humanTourist: this._isHumanTourist || false,
      }),
    }).catch(() => {});
  }

  _recordJump() {
    this.storage.incrementStat('totalJumps');
    checkTrophies(this.storage);
  }

  _updateVisiblePlatforms() {
    const idx = this.currentPlatformIndex;
    this._visiblePlatforms = [];
    for (let i = Math.max(0, idx - 1); i <= Math.min(this.platforms.length - 1, idx + 2); i++) {
      this._visiblePlatforms.push({ platform: this.platforms[i], index: i });
    }
  }

  // --- Dev methods for debug panel ---

  async skipToStage(targetStage) {
    if (targetStage < 0 || targetStage >= this._totalStages) return;

    // Start a fresh game if not playing
    if (this.state !== GameState.PLAYING) {
      await this._startGame();
    }

    // Set stage/platform indices
    this.stageIndex = targetStage;
    this.currentPlatformIndex = targetStage * PLATFORMS_PER_STAGE;
    this.currentPlanet = this._getPlanetForStage(targetStage);
    this.theme.setPlanetIndex(targetStage);

    // Populate fake metrics for skipped stages
    for (let s = 0; s < targetStage; s++) {
      this.difficulty.setStageMetrics(s, {
        jumps: 8,
        landings: 7,
        successRate: 0.875,
        avgPower: 0.6,
        powerVariance: 0.02,
        avgAccuracy: 0.6,
        deaths: 0,
        deathCause: null,
        timeSpent: 15,
        platformsReached: (s + 1) * PLATFORMS_PER_STAGE - 1,
      });
    }

    // Clear and regenerate platforms
    this.platforms = [];
    this._nextPlatformX = 80;
    this._nextPlatformY = this.renderer.displayHeight * 0.6;
    this._lastLoggedGenStage = -1;
    if (this._galaxyMode) {
      this.difficulty.initFromGalaxy(this._galaxyPlanets, this._totalStages);
    } else {
      this.difficulty.resetToDefaults();
    }

    // Re-populate fake metrics after reset
    for (let s = 0; s < targetStage; s++) {
      this.difficulty.setStageMetrics(s, {
        jumps: 8,
        landings: 7,
        successRate: 0.875,
        avgPower: 0.6,
        powerVariance: 0.02,
        avgAccuracy: 0.6,
        deaths: 0,
        deathCause: null,
        timeSpent: 15,
        platformsReached: (s + 1) * PLATFORMS_PER_STAGE - 1,
      });
    }

    // Generate all platforms up to current + buffer
    this._generatePlatforms(this.currentPlatformIndex + PLATFORMS_PER_STAGE + 5);

    // No animation for skip-generated platforms
    for (const p of this.platforms) {
      p.animOffset = 0;
    }

    // Begin stage tracking
    this.difficulty.beginStage(this.stageIndex);

    // Place character on current platform
    const plat = this.platforms[this.currentPlatformIndex];
    if (plat) {
      this.character = new Character(plat.x + plat.width / 2 - 20, plat.y - 40);
    }

    // Update HUD and camera
    this.hud.updatePlanet(this.currentPlanet, this._totalStages);
    this.hud.updateWind(this.difficulty.getStageWind(this.stageIndex));
    this.hud.updatePlatformsLeft(PLATFORMS_PER_STAGE);
    this._updateVisiblePlatforms();
    this._centerCameraOnPlatform(this.currentPlatformIndex);
    this.renderer.cameraX = this.renderer.cameraTargetX;
    this.renderer.cameraY = this.renderer.cameraTargetY;

    // Apply theme palette for target stage
    const newPalette =
      this.theme.stagePalettes[Math.min(this.stageIndex, this.theme.stagePalettes.length - 1)];
    if (newPalette) {
      this.theme.setCurrentBg(newPalette.bg);
      this.hud.adaptToBackground(newPalette.bg);
    }

    this.state = GameState.PLAYING;
    this.input.enabled = true;
    this.ui.showGame();
    this._hidePlanetInfo();

    this._thoughtBubbleTimer = 0;
    this._pendingVelocity = null;
    this._planetInfoTimer = 0;
  }

  setSpeedMultiplier(mult) {
    this._speedMult = Math.max(0.25, Math.min(mult, 10));
  }

  startAutoPlay() {
    this._autoPlay = true;
    if (
      this.state === GameState.PLAYING &&
      this.character &&
      this.character.state === CharState.IDLE
    ) {
      this._scheduleAutoJump();
    }
  }

  stopAutoPlay() {
    this._autoPlay = false;
    if (this._autoPlayTimer) {
      clearTimeout(this._autoPlayTimer);
      this._autoPlayTimer = null;
    }
  }

  _scheduleAutoJump() {
    if (this._autoPlayTimer) {
      clearTimeout(this._autoPlayTimer);
    }
    this._autoPlayTimer = setTimeout(() => {
      this._autoPlayTimer = null;
      if (!this._autoPlay || this.state !== GameState.PLAYING) return;
      if (!this.character || this.character.state !== CharState.IDLE) return;
      if (this._planetInfoTimer > 0) {
        // Wait for planet info to finish, then retry
        this._scheduleAutoJump();
        return;
      }

      const power = this._computeAutoPlayPower();
      this._doJump(power);
    }, 300);
  }

  /**
   * Numerical micro-simulation auto-play solver that accounts for drag.
   */
  _computeAutoPlayPower() {
    const planet = this._getActivePlanet();
    const nextIdx = this.currentPlatformIndex + 1;
    if (nextIdx >= this.platforms.length) return 0.5;

    const currentPlat = this.platforms[this.currentPlatformIndex];
    const nextPlat = this.platforms[nextIdx];

    const charX = currentPlat.x + currentPlat.width / 2;
    const targetX = nextPlat.x + nextPlat.width / 2;
    const dx = targetX - charX;
    const dy = nextPlat.y - currentPlat.y;

    // Wind and per-platform friction
    const wind = this.difficulty.getStageWind(this.stageIndex);
    const SCALE = 183.49;
    const windAccel = wind * SCALE;
    const friction = nextPlat.surfaceFriction ?? planet.surfaceFriction ?? 1.0;

    let bestPower = 0.5;
    let bestError = Infinity;

    const simDt = 0.005; // 5ms simulation steps

    for (let p = 0.05; p <= 1.0; p += 0.005) {
      const vel = powerToVelocity(p, planet);
      let sx = 0,
        sy = 0,
        svx = vel.vx,
        svy = vel.vy;

      let landed = false;
      for (let t = 0; t < 5.0; t += simDt) {
        svy += planet.gravity * simDt;

        // Wind acceleration
        if (windAccel !== 0) {
          svx += windAccel * simDt;
        }

        if (planet.airDensity > 0) {
          const dX = planet.dragCoeff * planet.airDensity * Math.abs(svx) * svx;
          const dY = planet.dragCoeff * planet.airDensity * Math.abs(svy) * svy;
          svx -= Math.sign(dX) * Math.min(Math.abs(dX * simDt), Math.abs(svx));
          svy -= Math.sign(dY) * Math.min(Math.abs(dY * simDt), Math.abs(svy));
        }

        if (svy > planet.terminalVY) svy = planet.terminalVY;

        sx += svx * simDt;
        sy += svy * simDt;

        if (sy >= dy && svy > 0) {
          // Compensate for post-landing slide on slippery surfaces
          const finalX = sx + estimateSlideDistance(svx, friction);
          const error = Math.abs(finalX - dx);
          if (error < bestError) {
            bestError = error;
            bestPower = p;
          }
          landed = true;
          break;
        }
      }

      // If we never crossed target height, check final position
      if (!landed && sy > 0) {
        const error = Math.abs(sx - dx) + Math.abs(sy - dy) * 2;
        if (error < bestError) {
          bestError = error;
          bestPower = p;
        }
      }
    }

    // Add ±2.5% jitter (tighter than before for precision challenge)
    const jitter = (Math.random() - 0.5) * 0.05;
    return Math.max(0.05, Math.min(1.0, bestPower + jitter));
  }

  // --- MCP Bridge methods ---

  /** Return current game state for MCP get_state tool. */
  getStateForMCP() {
    const char = this.character;
    const planet = this._getActivePlanet();
    const totalPlatforms = this._totalStages * PLATFORMS_PER_STAGE;
    return {
      phase: this.state,
      stage: this.stageIndex + 1,
      platformIndex: this.currentPlatformIndex,
      playerX: char ? Math.round(char.x) : null,
      playerY: char ? Math.round(char.y) : null,
      playerState: char ? char.state : null,
      planetName: this.currentPlanet.name,
      // NO gravity, gravityReal, airDensity — AI must research these
      wind: this.difficulty.getStageWind(this.stageIndex),
      minVX: planet.minVX,
      maxVX: planet.maxVX,
      minVY: planet.minVY,
      maxVY: planet.maxVY,
      powerExponent: planet.powerExponent,
      dragCoeff: planet.dragCoeff,
      terminalVY: planet.terminalVY,
      surfaceFriction: planet.surfaceFriction,
      platformsLeft: totalPlatforms - this.currentPlatformIndex,
      totalPlatforms,
      totalStages: this._totalStages,
    };
  }

  /**
   * Execute a jump with given power (0-1) for MCP.
   * Returns a promise that resolves when the character lands or dies.
   */
  jumpForMCP(power) {
    return new Promise((resolve) => {
      if (this.state !== GameState.PLAYING) {
        return resolve({ result: 'not_playing', phase: this.state });
      }
      if (!this.character || this.character.state !== CharState.IDLE) {
        return resolve({ result: 'not_ready', playerState: this.character?.state });
      }

      const clampedPower = Math.max(0, Math.min(1, power));
      this._doJump(clampedPower);

      // Poll for landing or death
      const check = () => {
        if (this.state === GameState.GAME_OVER) {
          const char = this.character;
          const nextIdx = this.currentPlatformIndex + 1;
          const nextPlat = nextIdx < this.platforms.length ? this.platforms[nextIdx] : null;
          const deathInfo = {
            result: 'died',
            platformIndex: this.currentPlatformIndex,
            stage: this.stageIndex + 1,
            playerX: char ? Math.round(char.x) : null,
          };
          if (nextPlat) {
            const targetCenter = nextPlat.x + nextPlat.width / 2;
            deathInfo.targetPlatformX = Math.round(nextPlat.x);
            deathInfo.targetPlatformWidth = Math.round(nextPlat.width);
            deathInfo.missedBy = char ? Math.round(char.x - targetCenter) : null;
          }
          resolve(deathInfo);
        } else if (this.state === GameState.VICTORY) {
          const char = this.character;
          const landedPlat = this.platforms[this.currentPlatformIndex];
          resolve({
            result: 'victory',
            platformIndex: this.currentPlatformIndex,
            stage: this.stageIndex + 1,
            playerX: char ? Math.round(char.x) : null,
            platformCenter: landedPlat ? Math.round(landedPlat.x + landedPlat.width / 2) : null,
          });
        } else if (this.character && this.character.state === CharState.IDLE) {
          const char = this.character;
          const landedPlat = this.platforms[this.currentPlatformIndex];
          resolve({
            result: 'landed',
            platformIndex: this.currentPlatformIndex,
            stage: this.stageIndex + 1,
            playerX: char ? Math.round(char.x) : null,
            platformCenter: landedPlat ? Math.round(landedPlat.x + landedPlat.width / 2) : null,
          });
        } else if (this.character && this.character.state === CharState.SLIDING) {
          // Wait for slide to finish
          setTimeout(check, 50);
        } else {
          setTimeout(check, 50);
        }
      };
      setTimeout(check, 100);
    });
  }

  /** Restart the game for MCP. */
  async restartForMCP() {
    await this._startGame();
    return { started: true };
  }

  /** Return next N platforms for MCP get_platforms tool. */
  getPlatformsForMCP(count) {
    const startIdx = this.currentPlatformIndex;
    const results = [];
    for (let i = 0; i < count && startIdx + i < this.platforms.length; i++) {
      const p = this.platforms[startIdx + i];
      results.push({
        index: startIdx + i,
        x: Math.round(p.x),
        y: Math.round(p.y),
        width: Math.round(p.width),
        height: Math.round(p.height),
        surfaceFriction: p.surfaceFriction,
      });
    }
    return { platforms: results };
  }
}
