/**
 * Client-side galaxy data fetcher and cache.
 * Fetches the current galaxy from the server and caches in localStorage.
 */
const CACHE_KEY = 'jump_game_galaxy';

export class GalaxyClient {
  constructor() {
    this._galaxy = null;
  }

  async fetchCurrent() {
    // Check localStorage cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.galaxyId && new Date(parsed.expiresAt) > new Date()) {
          this._galaxy = parsed;
        }
      }
    } catch {}

    // Fetch from server
    try {
      const response = await fetch('/api/galaxy/current');
      if (!response.ok) return this._galaxy;
      const data = await response.json();

      if (!data || !data.galaxyId) {
        return this._galaxy; // server returned null, keep cache if valid
      }

      // If cached galaxy is same and not expired, skip update
      if (this._galaxy && this._galaxy.galaxyId === data.galaxyId) {
        return this._galaxy;
      }

      this._galaxy = data;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {}
      return this._galaxy;
    } catch (err) {
      console.warn('[GalaxyClient] Fetch failed:', err.message);
      return this._galaxy; // return cached if available
    }
  }

  getGalaxy() {
    return this._galaxy;
  }

  getPlanet(galaxyStageIndex) {
    if (!this._galaxy || !this._galaxy.planets) return null;
    if (galaxyStageIndex < 0 || galaxyStageIndex >= this._galaxy.planets.length) return null;
    return this._galaxy.planets[galaxyStageIndex];
  }

  getGalaxyId() {
    return this._galaxy ? this._galaxy.galaxyId : null;
  }

  getPlanetCount() {
    return this._galaxy ? this._galaxy.planets.length : 0;
  }
}
