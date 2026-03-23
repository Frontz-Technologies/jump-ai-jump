import { MCPBridge } from '../net/MCPBridge.js';

/** Manages screen transitions and HUD button wiring. */
export class UIManager {
  /**
   * @param {object} callbacks
   * @param {function} callbacks.onStart
   * @param {function} callbacks.onRetry
   * @param {function} callbacks.onMenu
   * @param {function} callbacks.onMenuSettingsOpen
   * @param {function} callbacks.onGameSettingsOpen
   * @param {function} callbacks.onStatsOpen
   * @param {function} callbacks.onContinueCheckpoint
   */
  constructor(callbacks) {
    this.screens = {
      menu: document.getElementById('menu-screen'),
      gameover: document.getElementById('gameover-screen'),
      victory: document.getElementById('victory-screen'),
    };
    this.hud = document.getElementById('hud');
    this.checkpointBtn = document.getElementById('btn-checkpoint');
    this._mcpBridge = null;

    // Wire buttons
    document.getElementById('btn-start').addEventListener('click', callbacks.onStart);
    document.getElementById('btn-retry').addEventListener('click', callbacks.onRetry);
    document.getElementById('btn-menu').addEventListener('click', callbacks.onMenu);
    document.getElementById('btn-victory-menu').addEventListener('click', callbacks.onMenu);
    document.getElementById('btn-settings').addEventListener('click', callbacks.onGameSettingsOpen);
    document.getElementById('btn-stats').addEventListener('click', callbacks.onStatsOpen);
    document.getElementById('menu-settings').addEventListener('click', callbacks.onMenuSettingsOpen);
    document.getElementById('menu-stats').addEventListener('click', callbacks.onStatsOpen);
    if (this.checkpointBtn) {
      this.checkpointBtn.addEventListener('click', callbacks.onContinueCheckpoint);
    }

    // AI button & MCP modal
    const aiBtn = document.getElementById('btn-ai');
    if (aiBtn) {
      aiBtn.addEventListener('click', () => this._openMCPModal());
    }
    this._wireMCPModal();

    // Auto-connect MCP bridge when ?mcpSession=xxx is in the URL
    const autoSession = new URLSearchParams(window.location.search).get('mcpSession');
    if (autoSession) {
      localStorage.setItem('planetary-jumper-mcp-session', autoSession);
      this._mcpBridge = new MCPBridge(autoSession);
      this._mcpBridge.onStatusChange((status) => this._setMCPStatus(status));
      this._mcpBridge.connect();
    }
  }

  _wireMCPModal() {
    const modal = document.getElementById('mcp-modal');
    if (!modal) return;

    // Close button
    const closeBtn = modal.querySelector('[data-close="mcp-modal"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }
    // Backdrop close
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Copy button
    const copyBtn = document.getElementById('mcp-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        const text = document.getElementById('mcp-command-text')?.textContent;
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            copyBtn.textContent = '\u2713';
            setTimeout(() => { copyBtn.textContent = '\u{1F4CB}'; }, 1500);
          });
        }
      });
    }
  }

  _openMCPModal() {
    const modal = document.getElementById('mcp-modal');
    if (!modal) return;

    // Stable session ID: persists across page reloads and server restarts
    // so the MCP client URL never changes once installed.
    // URL query param ?mcpSession=xxx overrides localStorage (useful for Playwright/automation).
    const STORAGE_KEY = 'planetary-jumper-mcp-session';
    const urlSession = new URLSearchParams(window.location.search).get('mcpSession');
    let sessionId = urlSession || localStorage.getItem(STORAGE_KEY);
    if (!sessionId) {
      sessionId = crypto.randomUUID().slice(0, 8);
    }
    localStorage.setItem(STORAGE_KEY, sessionId);

    // Display session info
    document.getElementById('mcp-session-display').textContent = sessionId;

    const host = location.host;
    const protocol = location.protocol === 'https:' ? 'https' : 'http';
    const command = `claude mcp add jump-game --transport http ${protocol}://${host}/mcp/${sessionId}`;
    document.getElementById('mcp-command-text').textContent = command;

    // Reset status
    this._setMCPStatus('waiting');

    // Show modal
    modal.classList.remove('hidden');

    // Start MCP bridge
    if (this._mcpBridge) {
      this._mcpBridge.disconnect();
    }
    this._mcpBridge = new MCPBridge(sessionId);
    this._mcpBridge.onStatusChange((status) => {
      this._setMCPStatus(status);
      if (status === 'connected') {
        // Auto-dismiss after a moment
        setTimeout(() => modal.classList.add('hidden'), 2000);
      }
    });
    this._mcpBridge.connect();
  }

  _setMCPStatus(status) {
    const container = document.getElementById('mcp-status');
    if (!container) return;
    const dot = container.querySelector('.mcp-status-dot');
    const text = container.querySelector('.mcp-status-text');

    dot.className = 'mcp-status-dot';
    switch (status) {
      case 'waiting':
        dot.classList.add('mcp-waiting');
        text.textContent = 'Waiting for connection...';
        break;
      case 'connected':
        dot.classList.add('mcp-connected');
        text.textContent = 'Connected!';
        break;
      case 'disconnected':
        dot.classList.add('mcp-disconnected');
        text.textContent = 'Disconnected';
        break;
    }
  }

  showScreen(name) {
    Object.values(this.screens).forEach(s => s.classList.add('hidden'));
    if (this.screens[name]) {
      this.screens[name].classList.remove('hidden');
    }
    this.hud.style.display = name === null ? 'flex' : (name === 'menu' ? 'none' : 'flex');
  }

  /** Hide all overlays — show game. */
  showGame() {
    Object.values(this.screens).forEach(s => s.classList.add('hidden'));
    this.hud.style.display = 'flex';
  }

  showGameOver(message, platformReached, stage, checkpointAvailable = false) {
    document.getElementById('gameover-message').textContent = message || 'You fell!';
    document.getElementById('gameover-score').textContent =
      `Stage ${stage} · Platform ${platformReached}`;
    if (this.checkpointBtn) {
      this.checkpointBtn.classList.toggle('hidden', !checkpointAvailable);
    }
    this.showScreen('gameover');
  }

  showVictory(platformReached, stage) {
    document.getElementById('victory-score').textContent =
      `Stage ${stage} · Platform ${platformReached}`;
    this.showScreen('victory');
  }
}
