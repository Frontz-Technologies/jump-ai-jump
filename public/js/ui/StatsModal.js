import { TROPHIES } from '../data/Trophies.js';

/** Wires up the stats/trophies modal. */
export class StatsModal {
  /** @param {import('../data/Storage.js').Storage} storage */
  constructor(storage) {
    this.storage = storage;
    this.modal = document.getElementById('stats-modal');
    this.gamesEl = document.getElementById('stat-games');
    this.jumpsEl = document.getElementById('stat-jumps');
    this.bestStageEl = document.getElementById('stat-best-stage');
    this.bestEl = document.getElementById('stat-best');
    this.trophyListEl = document.getElementById('trophy-list');

    // Close
    this.modal.querySelector('.close-btn').addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop').addEventListener('click', () => this.close());
  }

  open() {
    this._refresh();
    this.modal.classList.remove('hidden');
  }

  close() {
    this.modal.classList.add('hidden');
  }

  isOpen() {
    return !this.modal.classList.contains('hidden');
  }

  _refresh() {
    const stats = this.storage.getStats();
    this.gamesEl.textContent = stats.totalGames;
    this.jumpsEl.textContent = stats.totalJumps;
    this.bestStageEl.textContent = stats.bestStage || 0;
    this.bestEl.textContent = stats.bestPlatform;

    const unlocked = this.storage.getTrophies();
    this.trophyListEl.innerHTML = TROPHIES.map(t => {
      const isUnlocked = unlocked.includes(t.id);
      return `
        <div class="trophy-item ${isUnlocked ? '' : 'locked'}">
          <span class="trophy-icon">${t.icon}</span>
          <div class="trophy-info">
            <span class="trophy-name">${t.name}</span>
            <span class="trophy-desc">${t.desc}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}
