/**
 * Eristic narrator — observes player actions, requests provocative
 * one-line commentary from the LLM, and displays it as a floating text.
 *
 * Shows an instant local fallback line, then replaces with LLM response
 * if it arrives within the display window.
 */

const FALLBACKS = {
  death: [
    'Interesting. You failed in a slightly different way this time.',
    'That was not physics. That was you.',
    'Most people would blame the game here. You seem more honest.',
    'You could try again. Or you could try thinking.',
    'Gravity did not change. Your judgment did.',
    'The platform was right there. You were not.',
    'Falling is easy. You have proven that.',
    'Another data point in a pattern you refuse to see.',
    'That was almost impressive. Almost.',
    'The void does not judge. I do.',
  ],
  hesitation: [
    'Thinking, or avoiding?',
    'The platform will not come to you.',
    'Hesitation is just failure in slow motion.',
    'You stopped. The game did not.',
    'There is a correct approach. You are circling it… vaguely.',
    'Time passes. Skill does not accumulate by waiting.',
    'Fear is a choice. A poor one.',
  ],
  progress: [
    'That landed. Presumably by accident.',
    'Do not mistake luck for competence.',
    'A correct jump does not imply understanding.',
    'You are progressing. The word "despite" comes to mind.',
    'Even randomness produces results occasionally.',
    'Adequate. Nothing more.',
  ],
  stage_complete: [
    'You survived. The next stage will correct that.',
    'A new planet. The same limitations.',
    'Completion is not mastery. You will learn this.',
    'The difficulty has not begun. You just cannot tell yet.',
    'Progress. Or perhaps the game is simply patient.',
  ],
  retry: [
    'Again. Interesting.',
    'Repetition without adaptation. There is a word for that.',
    'You returned. The outcome will not.',
    'The definition of persistence is generous here.',
    'Back again. The game remembers, even if you pretend not to.',
  ],
  victory: [
    'You finished. Whether you understood is a different question.',
    'Completion. Not elegance, but completion.',
    'The game is over. The doubt is not.',
  ],
};

export class Narrator {
  constructor() {
    this._el = document.getElementById('narrator-text');
    this._cooldown = 0;
    this._minInterval = 8;
    this._fadeTimer = null;
    this._pending = false;
    this._usedLines = new Set();

    // Player tracking
    this._deaths = 0;
    this._deathsOnStage = 0;
    this._currentStage = 0;
    this._jumps = 0;
    this._idleTime = 0;
    this._idleTriggered = false;
    this._lastPlatform = 0;
    this._gamesPlayed = 0;
  }

  update(dt, charState) {
    this._cooldown = Math.max(0, this._cooldown - dt);

    if (charState === 'IDLE') {
      this._idleTime += dt;
      if (this._idleTime > 6 && !this._idleTriggered && this._cooldown <= 0) {
        this._idleTriggered = true;
        this._fire('hesitation', {
          idleSeconds: Math.round(this._idleTime),
          platform: this._lastPlatform,
          stage: this._currentStage,
          deaths: this._deaths,
        });
      }
    } else {
      this._idleTime = 0;
      this._idleTriggered = false;
    }
  }

  onDeath(platformIndex, stageIndex, planetName) {
    this._deaths++;
    if (stageIndex === this._currentStage) {
      this._deathsOnStage++;
    } else {
      this._deathsOnStage = 1;
      this._currentStage = stageIndex;
    }
    this._fire('death', {
      platform: platformIndex, stage: stageIndex, planet: planetName,
      totalDeaths: this._deaths, deathsThisStage: this._deathsOnStage,
      jumpsBeforeDeath: this._jumps,
    });
  }

  onLand(platformIndex, stageIndex) {
    this._lastPlatform = platformIndex;
    this._jumps++;
    if (this._jumps % 5 === 0 && Math.random() < 0.4) {
      this._fire('progress', {
        platform: platformIndex, stage: stageIndex,
        totalJumps: this._jumps, deaths: this._deaths,
      });
    }
  }

  onStageComplete(stageIndex, planetName) {
    this._deathsOnStage = 0;
    this._currentStage = stageIndex;
    this._fire('stage_complete', {
      completedStage: stageIndex, planet: planetName,
      totalDeaths: this._deaths,
    });
  }

  onGameStart() {
    this._gamesPlayed++;
    this._jumps = 0;
    this._idleTime = 0;
    this._idleTriggered = false;
    if (this._gamesPlayed > 1) {
      this._fire('retry', {
        attempt: this._gamesPlayed, previousDeaths: this._deaths,
      });
    }
    this._deaths = 0;
    this._deathsOnStage = 0;
  }

  onVictory(stageIndex) {
    this._fire('victory', {
      finalStage: stageIndex, totalDeaths: this._deaths,
      totalJumps: this._jumps,
    });
  }

  /** Show fallback instantly, then upgrade with LLM if it arrives in time. */
  _fire(event, context) {
    if (this._cooldown > 0) return;
    this._cooldown = this._minInterval;

    // Instant fallback
    const fallback = this._pickFallback(event);
    if (fallback) this._display(fallback);

    // LLM upgrade (non-blocking)
    if (!this._pending) {
      this._pending = true;
      this._requestLLM(event, context);
    }
  }

  _pickFallback(event) {
    const pool = FALLBACKS[event];
    if (!pool || pool.length === 0) return null;

    // Try to pick one we haven't used recently
    const unused = pool.filter(l => !this._usedLines.has(l));
    const pick = unused.length > 0
      ? unused[Math.floor(Math.random() * unused.length)]
      : pool[Math.floor(Math.random() * pool.length)];

    this._usedLines.add(pick);
    if (this._usedLines.size > 20) {
      const first = this._usedLines.values().next().value;
      this._usedLines.delete(first);
    }
    return pick;
  }

  async _requestLLM(event, context) {
    // DEBUG: skip LLM request to avoid consuming tokens — fallback lines only
    this._pending = false;
  }

  _display(text) {
    if (!this._el) return;
    if (this._fadeTimer) clearTimeout(this._fadeTimer);

    this._el.textContent = text;
    this._el.classList.remove('narrator-hidden');
    this._el.classList.add('narrator-visible');

    this._fadeTimer = setTimeout(() => {
      this._el.classList.remove('narrator-visible');
      this._el.classList.add('narrator-hidden');
      this._fadeTimer = null;
    }, 5000);
  }
}
