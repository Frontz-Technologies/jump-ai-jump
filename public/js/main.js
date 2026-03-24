import { Analytics } from './debug/Analytics.js';
import { Game } from './engine/Game.js';

const analytics = new Analytics();
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas, analytics);

// Expose for debug panel and Playwright
window.__game = game;
window.__analytics = analytics;

// Debug panel: gated by server-side ENABLE_DEBUG env var
let debugAllowed = false;
let debugPanel = null;

async function toggleDebugPanel() {
  if (!debugAllowed) return;
  if (debugPanel) {
    debugPanel.toggle();
    return;
  }
  const { DebugPanel } = await import('./debug/DebugPanel.js');
  debugPanel = new DebugPanel(game, analytics);
  debugPanel.show();
  analytics.startPeriodicPush();
}

fetch('/api/config')
  .then((r) => r.json())
  .then((config) => {
    debugAllowed = config.debugEnabled;
    if (debugAllowed && new URLSearchParams(window.location.search).has('debug')) {
      toggleDebugPanel();
    }
  })
  .catch(() => {});

window.addEventListener('keydown', (e) => {
  if ((e.key === '`' || e.key === 'Backquote') && debugAllowed) {
    e.preventDefault();
    toggleDebugPanel();
  }
});
