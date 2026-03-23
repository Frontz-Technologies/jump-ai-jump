import { Analytics } from './debug/Analytics.js';
import { Game } from './engine/Game.js';

const analytics = new Analytics();
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas, analytics);

// Expose for debug panel and Playwright
window.__game = game;
window.__analytics = analytics;

// Debug panel: activate via ?debug=1 or backtick key
const debugEnabled = new URLSearchParams(window.location.search).has('debug');
let debugPanel = null;

async function toggleDebugPanel() {
  if (debugPanel) {
    debugPanel.toggle();
    return;
  }
  const { DebugPanel } = await import('./debug/DebugPanel.js');
  debugPanel = new DebugPanel(game, analytics);
  debugPanel.show();
  analytics.startPeriodicPush();
}

if (debugEnabled) {
  toggleDebugPanel();
}

window.addEventListener('keydown', (e) => {
  if (e.key === '`' || e.key === 'Backquote') {
    e.preventDefault();
    toggleDebugPanel();
  }
});
