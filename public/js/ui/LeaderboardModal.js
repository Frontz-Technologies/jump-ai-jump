import { LeaderboardClient } from '../net/LeaderboardClient.js';

/**
 * Leaderboard modal — Current galaxy, History, All Time.
 */
export class LeaderboardModal {
  constructor() {
    this._client = new LeaderboardClient();
    this._modal = document.getElementById('leaderboard-modal');
    this._list = document.getElementById('leaderboard-list');
    this._title = document.getElementById('leaderboard-title');
    this._tabCurrent = document.getElementById('lb-tab-current');
    this._tabHistory = document.getElementById('lb-tab-history');
    this._tabAllTime = document.getElementById('lb-tab-alltime');
    this._tabTourist = document.getElementById('lb-tab-tourist');
    this._activeTab = 'current';

    if (!this._modal) return;

    const closeBtn = this._modal.querySelector('[data-close="leaderboard-modal"]');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    const backdrop = this._modal.querySelector('.modal-backdrop');
    if (backdrop) backdrop.addEventListener('click', () => this.close());

    if (this._tabCurrent) this._tabCurrent.addEventListener('click', () => this._switchTab('current'));
    if (this._tabHistory) this._tabHistory.addEventListener('click', () => this._switchTab('history'));
    if (this._tabAllTime) this._tabAllTime.addEventListener('click', () => this._switchTab('alltime'));
    if (this._tabTourist) this._tabTourist.addEventListener('click', () => this._switchTab('tourist'));
  }

  open(galaxyId) {
    if (!this._modal) return;
    this._galaxyId = galaxyId;
    this._modal.classList.remove('hidden');
    this._switchTab('current');
  }

  close() {
    if (this._modal) this._modal.classList.add('hidden');
  }

  async _switchTab(tab) {
    this._activeTab = tab;
    if (this._tabCurrent) this._tabCurrent.classList.toggle('active', tab === 'current');
    if (this._tabHistory) this._tabHistory.classList.toggle('active', tab === 'history');
    if (this._tabAllTime) this._tabAllTime.classList.toggle('active', tab === 'alltime');
    if (this._tabTourist) this._tabTourist.classList.toggle('active', tab === 'tourist');

    if (tab === 'current') await this._loadCurrent();
    else if (tab === 'history') await this._loadHistory();
    else if (tab === 'tourist') await this._loadTourist();
    else await this._loadAllTime();
  }

  async _loadCurrent() {
    if (!this._list) return;
    this._list.innerHTML = '<p class="lb-loading">Loading...</p>';
    if (this._title) this._title.textContent = 'Current Galaxy';

    const id = this._galaxyId || 'current';
    const entries = await this._client.fetchLeaderboard(id);

    if (!entries || entries.length === 0) {
      this._list.innerHTML = '<p class="lb-empty">No scores yet</p>';
      return;
    }

    // Table header
    let html = `<div class="lb-table">
      <div class="lb-row lb-header">
        <span class="lb-col lb-col-rank">#</span>
        <span class="lb-col lb-col-name">Name</span>
        <span class="lb-col lb-col-stage">Stage</span>
        <span class="lb-col lb-col-date">Date</span>
      </div>`;

    html += entries.map((e, i) => `
      <div class="lb-row${i < 3 ? ' lb-top' : ''}">
        <span class="lb-col lb-col-rank">${i + 1}</span>
        <span class="lb-col lb-col-name">${this._esc(e.playerName)}</span>
        <span class="lb-col lb-col-stage">${e.highestStage}</span>
        <span class="lb-col lb-col-date">${this._fmtDate(e.submittedAt)}</span>
      </div>`).join('');

    html += '</div>';
    this._list.innerHTML = html;
  }

  async _loadHistory() {
    if (!this._list) return;
    this._list.innerHTML = '<p class="lb-loading">Loading...</p>';
    if (this._title) this._title.textContent = 'Past Galaxies';

    const history = await this._client.fetchHistory();

    if (!history || history.length === 0) {
      this._list.innerHTML = '<p class="lb-empty">No past galaxies</p>';
      return;
    }

    let html = '';
    for (const g of history) {
      const date = this._fmtDate(g.createdAt);
      const entries = g.entries || g.top3 || [];

      html += `<div class="lb-galaxy-section">
        <div class="lb-galaxy-header">
          <span class="lb-galaxy-name">${this._esc(g.name)}</span>
          <span class="lb-galaxy-date">${date}</span>
        </div>`;

      if (entries.length === 0) {
        html += '<p class="lb-empty lb-empty-sm">No scores</p>';
      } else {
        html += '<div class="lb-table lb-table-sm">';
        html += entries.map((e, i) => `
          <div class="lb-row${i < 3 ? ' lb-top' : ''}">
            <span class="lb-col lb-col-rank">${i + 1}</span>
            <span class="lb-col lb-col-name">${this._esc(e.playerName)}</span>
            <span class="lb-col lb-col-stage">${e.highestStage}</span>
          </div>`).join('');
        html += '</div>';
      }

      html += '</div>';
    }

    this._list.innerHTML = html;
  }

  async _loadAllTime() {
    await this._loadRankedTable('All Time', () => this._client.fetchAllTime(), 'No scores yet');
  }

  async _loadTourist() {
    await this._loadRankedTable('Tourist Runs', () => this._client.fetchTourist(), 'No tourist scores yet');
  }

  async _loadRankedTable(title, fetchFn, emptyMsg) {
    if (!this._list) return;
    this._list.innerHTML = '<p class="lb-loading">Loading...</p>';
    if (this._title) this._title.textContent = title;

    const entries = await fetchFn();

    if (!entries || entries.length === 0) {
      this._list.innerHTML = `<p class="lb-empty">${emptyMsg}</p>`;
      return;
    }

    let html = `<div class="lb-table">
      <div class="lb-row lb-header">
        <span class="lb-col lb-col-rank">#</span>
        <span class="lb-col lb-col-name">Name</span>
        <span class="lb-col lb-col-galaxy">Galaxy</span>
        <span class="lb-col lb-col-stage">Stage</span>
        <span class="lb-col lb-col-date">Date</span>
      </div>`;

    html += entries.map((e, i) => `
      <div class="lb-row${i < 3 ? ' lb-top' : ''}">
        <span class="lb-col lb-col-rank">${i + 1}</span>
        <span class="lb-col lb-col-name">${this._esc(e.playerName)}</span>
        <span class="lb-col lb-col-galaxy">${this._esc(e.galaxyName)}</span>
        <span class="lb-col lb-col-stage">${e.highestStage}</span>
        <span class="lb-col lb-col-date">${this._fmtDate(e.date)}</span>
      </div>`).join('');

    html += '</div>';
    this._list.innerHTML = html;
  }

  /** Format date as DD/MM/YYYY */
  _fmtDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${dd}/${mm}/${yyyy}`;
    } catch {
      return '—';
    }
  }

  _esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
}
