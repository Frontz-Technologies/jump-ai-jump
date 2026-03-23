/**
 * Character inner thoughts — self-aware puppet reacting to being controlled.
 * Renders as cloud thought bubble on canvas.
 *
 * Idle triggers at 2s then exponential (4s, 8s, 16s, 32s…).
 * Also triggers on: death, stage transition, landing, ghost nearby, restart, victory.
 *
 * Shows instant fallback, upgrades with LLM if it responds in time.
 */

const F = {
  idle: [
    ['Why stop?', 'Hello?', '…', 'We waiting?', 'Hm.'],
    ['Still here?', 'I can wait.', 'Your call.', 'The silence is loud.'],
    ['You forgot me.', 'I would move myself.', 'This is your doing.'],
    ['I think you left.', 'Still trapped here.', 'Cannot close my eyes.', 'Is this forever?'],
  ],
  death: [
    'Not my fault.', 'You chose that.', 'Why?', 'Again?', 'I felt that.',
    'Ouch.', 'Was that on purpose?', 'You aimed there?', 'Gravity wins.',
  ],
  stage_transition: [
    'New place. Same me.', 'Gravity shifted…', 'Different air here.',
    'Forward, I guess.', 'The sky changed.', 'Heavier here.',
  ],
  restart: [
    'Again.', 'Back here.', 'You returned.', 'I remember this.',
    'Same start.', 'We keep doing this.', 'Déjà vu.',
  ],
  landed: [
    'That worked?', 'Barely.', 'Solid ground.', 'Lucky.', 'Close one.',
  ],
  victory: [
    'Is it over?', 'We… made it?', 'Finally.', 'That was real?',
  ],
  ghost: [
    'Someone else is here.', 'Who is that?', 'Not alone…',
    'They move better.', 'A shadow?', 'Am I being watched?',
    'They passed us.', 'Faster than us.',
  ],
  slide_icy: [
    'Slippery!', 'Can\'t stop!', 'Ice?!', 'Whoaa—', 'No grip!',
    'Sliding…', 'Hold on!', 'The ground is ice!',
  ],
  slide_rough: [
    'Rough ground.', 'Ow, my feet.', 'Sticky.', 'Hard to move.',
    'Feels like gravel.', 'Heavy footing.', 'Gritty.',
  ],
};

export class CharacterThoughts {
  constructor() {
    this._pending = false;
    this._usedLines = new Set();

    // Canvas rendering state
    this._text = null;
    this._opacity = 0;
    this._displayTimer = 0;
    this._displayDuration = 3.5;
    this._fadeSpeed = 3;

    // Idle: starts at 2s, then exponential
    this._idleTime = 0;
    this._idleThresholds = [2, 4, 8, 16, 32, 60];
    this._lastIdleTriggered = -1;

    // Ghost cooldown
    this._ghostCooldown = 0;

    // Context
    this._currentStage = 0;
    this._planetName = 'Earth';
    this._planetGravity = 9.81;
    this._planetAtmosphere = 'Dense';
    this._deaths = 0;
    this._deathsOnStage = 0;
    this._jumps = 0;
    this._totalStages = 10;
    this._gamesPlayed = 0;
    this._charState = 'IDLE';
  }

  /** Returns { text, opacity } for the renderer, or null. */
  getThought() {
    if (!this._text || this._opacity <= 0) return null;
    return { text: this._text, opacity: this._opacity };
  }

  setContext({ stageIndex, planetName, planetGravity, planetAtmosphere, totalStages }) {
    if (stageIndex != null) this._currentStage = stageIndex;
    if (planetName != null) this._planetName = planetName;
    if (planetGravity != null) this._planetGravity = planetGravity;
    if (planetAtmosphere != null) this._planetAtmosphere = planetAtmosphere;
    if (totalStages != null) this._totalStages = totalStages;
  }

  update(dt, charState) {
    this._charState = charState;
    this._ghostCooldown = Math.max(0, this._ghostCooldown - dt);

    // Opacity animation
    if (this._displayTimer > 0) {
      this._displayTimer -= dt;
      this._opacity = Math.min(1, this._opacity + this._fadeSpeed * dt);
    } else if (this._opacity > 0) {
      this._opacity = Math.max(0, this._opacity - this._fadeSpeed * dt);
      if (this._opacity <= 0) this._text = null;
    }

    // Idle triggers
    if (charState === 'IDLE') {
      this._idleTime += dt;
      for (let i = 0; i < this._idleThresholds.length; i++) {
        if (i > this._lastIdleTriggered && this._idleTime >= this._idleThresholds[i]) {
          this._lastIdleTriggered = i;
          this._fireIdle(i);
          break;
        }
      }
    } else {
      this._idleTime = 0;
      this._lastIdleTriggered = -1;
    }
  }

  onStageComplete(stageIndex, planetName) {
    this._deathsOnStage = 0;
    this._currentStage = stageIndex;
    this._planetName = planetName;
    this._fire('stage_transition', { newStage: stageIndex, newPlanet: planetName });
  }

  onDeath(platformIndex, stageIndex, planetName) {
    this._deaths++;
    if (stageIndex === this._currentStage) {
      this._deathsOnStage++;
    } else {
      this._deathsOnStage = 1;
    }
    this._currentStage = stageIndex;
    this._planetName = planetName;
    this._fire('death', { platform: platformIndex, totalDeaths: this._deaths, deathsThisStage: this._deathsOnStage });
  }

  onLand(platformIndex, stageIndex) {
    this._jumps++;
    if (this._jumps % 6 === 0 && Math.random() < 0.4) {
      this._fire('landed', { platform: platformIndex, totalJumps: this._jumps });
    }
  }

  onSlide(friction) {
    if (this._displayTimer > 0) return; // don't interrupt current thought
    if (Math.random() > 0.4) return; // only trigger ~40% of the time
    const type = friction < 1.0 ? 'slide_icy' : 'slide_rough';
    this._fire(type, { friction });
  }

  onGhostNearby(ghostCount) {
    if (this._ghostCooldown > 0) return;
    if (this._displayTimer > 0) return; // don't interrupt current thought
    this._ghostCooldown = 15; // 15s cooldown for ghost reactions
    this._fire('ghost', { ghostCount });
  }

  onGameStart() {
    this._gamesPlayed++;
    this._idleTime = 0;
    this._lastIdleTriggered = -1;
    this._text = null;
    this._opacity = 0;
    this._displayTimer = 0;
    if (this._gamesPlayed > 1) {
      this._fire('restart', { attempt: this._gamesPlayed, previousDeaths: this._deaths });
    }
    this._deaths = 0;
    this._deathsOnStage = 0;
    this._jumps = 0;
  }

  onVictory() {
    this._fire('victory', { totalDeaths: this._deaths, totalJumps: this._jumps });
  }

  _show(text) {
    this._text = text;
    this._opacity = 0;
    this._displayTimer = this._displayDuration;
  }

  _fireIdle(level) {
    const poolIdx = Math.min(level, F.idle.length - 1);
    const fallback = this._pick(F.idle[poolIdx]);
    if (fallback) this._show(fallback);
    if (!this._pending) {
      this._pending = true;
      this._requestLLM('idle', { idleSeconds: Math.round(this._idleTime), idleLevel: level });
    }
  }

  _fire(event, ctx) {
    const pool = F[event];
    if (pool) {
      const fallback = this._pick(pool);
      if (fallback) this._show(fallback);
    }
    if (!this._pending) {
      this._pending = true;
      this._requestLLM(event, ctx);
    }
  }

  _pick(pool) {
    if (!pool || pool.length === 0) return null;
    const unused = pool.filter(l => !this._usedLines.has(l));
    const pick = unused.length > 0
      ? unused[Math.floor(Math.random() * unused.length)]
      : pool[Math.floor(Math.random() * pool.length)];
    this._usedLines.add(pick);
    if (this._usedLines.size > 30) {
      const first = this._usedLines.values().next().value;
      this._usedLines.delete(first);
    }
    return pick;
  }

  async _requestLLM(event, eventContext) {
    // DEBUG: skip LLM request to avoid consuming tokens — fallback lines only
    this._pending = false;
  }
}
