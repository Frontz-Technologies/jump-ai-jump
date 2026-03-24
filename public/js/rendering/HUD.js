/** Updates DOM-based HUD elements. */
export class HUD {
  constructor() {
    this.jumpCountEl = document.getElementById('jump-count');
    this.stageEl = document.getElementById('stage-label');
    this.hudEl = document.getElementById('hud');
    this.aiIndicatorEl = document.getElementById('ai-indicator');
    this.planetNameEl = document.getElementById('planet-name');
    this.gravityValueEl = document.getElementById('gravity-value');
    this.atmoIndicatorEl = document.getElementById('atmo-indicator');
    this.atmoDotEl = document.querySelector('.atmo-dot');
    this.atmoLabelEl = document.querySelector('.atmo-label');
    this.hudBottomEl = document.getElementById('hud-bottom');
    this.windArrowEl = document.getElementById('wind-arrow');
    this.windValueEl = document.getElementById('wind-value');
    this.windSepEl = document.getElementById('wind-sep');
    this.windIndicatorEl = document.getElementById('wind-indicator');
  }

  /** Update platforms remaining in current stage. */
  updatePlatformsLeft(remaining) {
    if (this.jumpCountEl) {
      this.jumpCountEl.textContent = remaining;
    }
  }

  /** Update planet display — replaces updateStage. */
  updatePlanet(planetConfig, totalStages) {
    const _total = totalStages || 10;
    const isDefault = planetConfig && planetConfig._isDefault;
    const warnSuffix = isDefault ? ' ⚠' : '';
    if (this.stageEl && planetConfig) {
      const _index = this._getPlanetIndex(planetConfig);
      this.stageEl.textContent = planetConfig.name + warnSuffix;
      this.stageEl.title = isDefault ? 'Fallback planet — daily galaxy unavailable' : '';
    }
    if (this.planetNameEl && planetConfig) {
      this.planetNameEl.textContent = planetConfig.name + warnSuffix;
      this.planetNameEl.title = isDefault ? 'Fallback planet — daily galaxy unavailable' : '';
    }
    if (this.gravityValueEl && planetConfig) {
      const ratio = (planetConfig.gReal / 9.81).toFixed(2);
      this.gravityValueEl.textContent = `g = ${planetConfig.gReal} m/s² (${ratio}x Earth)`;
    }
    if (this.atmoIndicatorEl && planetConfig) {
      this._updateAtmoIndicator(planetConfig.atmosphereLabel);
    }
    // Set planet accent color on HUD center pill border
    const hudCenter = document.getElementById('hud-center');
    if (hudCenter && planetConfig && planetConfig.skyColor) {
      const hex = planetConfig.skyColor;
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      hudCenter.style.setProperty('--planet-accent', `rgba(${r}, ${g}, ${b}, 0.25)`);
    }
  }

  _getPlanetIndex(planetConfig) {
    // If planetConfig has a stageIndex set, use it directly
    if (planetConfig._stageIndex != null) return planetConfig._stageIndex;
    // Simple lookup by name from the hardcoded configs
    const names = [
      'Earth',
      'Stratosphere',
      'Moon',
      'Mars',
      'Mercury',
      'Venus',
      'Titan',
      'Jupiter',
      'Europa',
      'Pluto',
    ];
    const idx = names.indexOf(planetConfig.name);
    return idx >= 0 ? idx : 0;
  }

  _updateAtmoIndicator(label) {
    if (this.atmoDotEl) {
      if (label === 'Dense') {
        this.atmoDotEl.className = 'atmo-dot atmo-dense';
      } else if (label === 'Thin') {
        this.atmoDotEl.className = 'atmo-dot atmo-thin';
      } else {
        this.atmoDotEl.className = 'atmo-dot atmo-vacuum';
      }
    }
    if (this.atmoLabelEl) {
      this.atmoLabelEl.textContent = label;
    }
  }

  /** Update wind display in the bottom bar. */
  updateWind(windSpeed) {
    if (!this.windArrowEl || !this.windValueEl) return;
    if (windSpeed === 0 || windSpeed == null) {
      this.windArrowEl.style.transform = 'rotate(0deg)';
      this.windArrowEl.style.opacity = '0.3';
      this.windValueEl.textContent = 'Calm';
    } else if (windSpeed > 0) {
      this.windArrowEl.style.transform = 'rotate(0deg)';
      this.windArrowEl.style.opacity = '1';
      this.windValueEl.textContent = `${Math.abs(windSpeed).toFixed(1)} m/s tailwind`;
    } else {
      this.windArrowEl.style.transform = 'rotate(180deg)';
      this.windArrowEl.style.opacity = '1';
      this.windValueEl.textContent = `${Math.abs(windSpeed).toFixed(1)} m/s headwind`;
    }
  }

  /** Legacy method for backward compat. */
  updateStage(stage) {
    if (this.stageEl) {
      this.stageEl.textContent = `Stage ${stage} of 10`;
    }
  }

  setAIThinking(active) {
    if (!this.aiIndicatorEl) return;
    this.aiIndicatorEl.classList.toggle('active', active);
  }

  /** Adapt HUD text color based on background luminance. */
  adaptToBackground(hexColor) {
    if (!this.hudEl) return;
    // Handle non-hex colors gracefully
    if (!hexColor || !hexColor.startsWith('#') || hexColor.length < 7) {
      this.hudEl.style.setProperty('--text', '#e0e0e0');
      this.hudEl.style.setProperty('--muted', '#aaa');
      return;
    }
    const r = parseInt(hexColor.slice(1, 3), 16) / 255;
    const g = parseInt(hexColor.slice(3, 5), 16) / 255;
    const b = parseInt(hexColor.slice(5, 7), 16) / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (L < 0.5) {
      this.hudEl.style.setProperty('--text', '#e0e0e0');
      this.hudEl.style.setProperty('--muted', '#aaa');
    } else {
      this.hudEl.style.setProperty('--text', '#2a2a2a');
      this.hudEl.style.setProperty('--muted', '#888');
    }

    if (this.hudBottomEl) {
      if (L < 0.5) {
        this.hudBottomEl.style.setProperty('--text', '#e0e0e0');
        this.hudBottomEl.style.setProperty('--muted', '#aaa');
      } else {
        this.hudBottomEl.style.setProperty('--text', '#2a2a2a');
        this.hudBottomEl.style.setProperty('--muted', '#888');
      }
    }
  }
}
