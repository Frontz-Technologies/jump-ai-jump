const STORAGE_KEY = 'jump_game_data';

const DEFAULT_DATA = {
  settings: {
    sound: true,
    darkMode: false,
    humanTourist: false,
  },
  stats: {
    totalGames: 0,
    totalJumps: 0,
    bestPlatform: 0,
    levelsCompleted: 0,
  },
  trophies: [], // array of unlocked trophy IDs
  playerId: null,
  playerName: 'Anonymous',
};

/** localStorage wrapper with defaults. */
export class Storage {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults to handle new fields
        return {
          settings: { ...DEFAULT_DATA.settings, ...parsed.settings },
          stats: { ...DEFAULT_DATA.stats, ...parsed.stats },
          trophies: parsed.trophies || [],
          playerId: parsed.playerId || null,
          playerName: parsed.playerName || 'Anonymous',
        };
      }
    } catch {
      // Corrupted data, reset
    }
    return structuredClone(DEFAULT_DATA);
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Storage full or unavailable
    }
  }

  getSettings() {
    return this.data.settings;
  }

  setSetting(key, value) {
    this.data.settings[key] = value;
    this._save();
  }

  getStats() {
    return this.data.stats;
  }

  incrementStat(key, amount = 1) {
    this.data.stats[key] = (this.data.stats[key] || 0) + amount;
    this._save();
  }

  restoreStats(statsObj) {
    this.data.stats = { ...DEFAULT_DATA.stats, ...statsObj };
    this._save();
  }

  setStatIfHigher(key, value) {
    if (value > (this.data.stats[key] || 0)) {
      this.data.stats[key] = value;
      this._save();
    }
  }

  getTrophies() {
    return this.data.trophies;
  }

  unlockTrophy(id) {
    if (!this.data.trophies.includes(id)) {
      this.data.trophies.push(id);
      this._save();
      return true;
    }
    return false;
  }

  getPlayerId() {
    if (!this.data.playerId) {
      this.data.playerId = crypto.randomUUID();
      this._save();
    }
    return this.data.playerId;
  }

  getPlayerName() {
    return this.data.playerName || 'Anonymous';
  }

  setPlayerName(name) {
    this.data.playerName = name || 'Anonymous';
    this._save();
  }
}
