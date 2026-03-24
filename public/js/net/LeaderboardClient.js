/**
 * Client-side leaderboard API wrapper.
 */
export class LeaderboardClient {
  async submit(galaxyId, data) {
    try {
      const response = await fetch('/api/leaderboard/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galaxyId, ...data }),
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async fetchLeaderboard(galaxyId, { excludeTourist = false } = {}) {
    try {
      let url = `/api/leaderboard/${encodeURIComponent(galaxyId)}`;
      if (excludeTourist) url += '?excludeTourist=true';
      const response = await fetch(url);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }

  async fetchHistory({ excludeTourist = false } = {}) {
    try {
      let url = '/api/leaderboard/history';
      if (excludeTourist) url += '?excludeTourist=true';
      const response = await fetch(url);
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }

  async fetchAllTime() {
    try {
      const response = await fetch('/api/leaderboard/all-time');
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }

  async fetchTourist() {
    try {
      const response = await fetch('/api/leaderboard/tourist');
      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }
}
