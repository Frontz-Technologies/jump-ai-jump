import { PLANET_CONFIGS } from '../data/PlanetConfig.js';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'css/debug.css';
document.head.appendChild(link);

export class DebugPanel {
  constructor(game, analytics) {
    this._game = game;
    this._analytics = analytics;
    this._visible = false;
    this._activeTab = 0;
    this._logFilter = 'all';
    this._autoScroll = true;
    this._inspectedStage = 0;

    this._el = this._ce('div', 'debug-panel hidden');
    document.body.appendChild(this._el);

    this._render();
    this._analytics.subscribe((event) => this._onEvent(event));
  }

  show() { this._visible = true; this._el.classList.remove('hidden'); }
  hide() { this._visible = false; this._el.classList.add('hidden'); }
  toggle() { this._visible ? this.hide() : this.show(); }

  _render() {
    this._el.innerHTML = '';

    // Header
    const header = this._ce('div', 'debug-header');
    header.appendChild(this._ce('h3', '', 'Debug'));
    const close = this._ce('button', 'debug-close', '\u00d7');
    close.onclick = () => this.hide();
    header.appendChild(close);
    this._el.appendChild(header);

    // Tabs
    const tabs = this._ce('div', 'debug-tabs');
    ['Log', 'LLM', 'Stage', 'Controls'].forEach((name, i) => {
      const btn = this._ce('button', 'debug-tab' + (i === this._activeTab ? ' active' : ''), name);
      btn.onclick = () => { this._activeTab = i; this._renderContent(); };
      tabs.appendChild(btn);
    });
    this._el.appendChild(tabs);

    this._contentEl = this._ce('div', 'debug-content');
    this._el.appendChild(this._contentEl);
    this._renderContent();
  }

  _renderContent() {
    this._el.querySelectorAll('.debug-tab').forEach((btn, i) => {
      btn.classList.toggle('active', i === this._activeTab);
    });
    this._contentEl.innerHTML = '';
    [this._renderLogStream, this._renderLLMDashboard, this._renderStageInspector, this._renderDevControls][this._activeTab].call(this);
  }

  // ── Log Stream ──────────────────────────────────

  _renderLogStream() {
    const c = this._contentEl;

    // Controls row
    const scrollToggle = this._ce('div', 'debug-scroll-toggle');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = this._autoScroll;
    cb.onchange = () => { this._autoScroll = cb.checked; };
    scrollToggle.appendChild(cb);
    scrollToggle.appendChild(document.createTextNode('Auto-scroll'));
    c.appendChild(scrollToggle);

    // Filters
    const filters = this._ce('div', 'debug-filters');
    ['all', 'llm', 'stage', 'player', 'game'].forEach(f => {
      const btn = this._ce('button',
        'debug-filter-btn' + (this._logFilter === f ? ' active' : ''),
        f.toUpperCase());
      btn.onclick = () => { this._logFilter = f; this._renderContent(); };
      filters.appendChild(btn);
    });
    c.appendChild(filters);

    // Log list
    this._logListEl = this._ce('div', 'debug-log-list');
    const events = this._logFilter === 'all'
      ? this._analytics.getEvents()
      : this._analytics.getEvents(this._logFilter);

    events.slice(-100).forEach(evt => {
      this._logListEl.appendChild(this._makeLogEntry(evt));
    });
    c.appendChild(this._logListEl);

    if (this._autoScroll) {
      requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
    }
  }

  _makeLogEntry(evt) {
    const el = this._ce('div', `debug-log-entry cat-${evt.category}`);
    const t = new Date(evt.timestamp).toLocaleTimeString('en-US', { hour12: false });
    el.appendChild(this._ce('span', 'log-time', t));
    el.appendChild(this._ce('span', 'log-cat', `[${evt.category}]`));
    el.appendChild(document.createTextNode(` ${evt.type}`));
    el.onclick = () => {
      const existing = el.querySelector('.debug-log-detail');
      if (existing) { existing.remove(); return; }
      el.appendChild(this._ce('div', 'debug-log-detail', JSON.stringify(evt.data, null, 2)));
    };
    return el;
  }

  // ── LLM Dashboard ──────────────────────────────

  _renderLLMDashboard() {
    const c = this._contentEl;
    const s = this._analytics.getSessionSummary();

    // Stats
    const grid = this._ce('div', 'debug-summary');
    [
      { label: 'Requests', value: s.totalRequests },
      { label: 'Latency', value: s.avgLatency ? s.avgLatency + 'ms' : '--' },
      { label: 'Success', value: s.totalRequests > 0
        ? Math.round(s.successfulResponses / s.totalRequests * 100) + '%' : '--' },
      { label: 'LLM', value: s.llmStages },
      { label: 'Default', value: s.defaultStages },
      { label: 'Errors', value: s.errors },
    ].forEach(stat => {
      const el = this._ce('div', 'debug-stat');
      el.innerHTML = `<span class="label">${stat.label}</span><span class="value">${stat.value}</span>`;
      grid.appendChild(el);
    });
    c.appendChild(grid);

    // Fetch server logs
    const fetchBtn = this._ce('button', 'debug-btn', 'Fetch Server Logs');
    fetchBtn.onclick = async () => {
      try {
        const logs = await (await fetch('/api/logs')).json();
        this._renderServerLogs(logs);
      } catch (e) {
        this._serverLogEl.textContent = 'Fetch failed: ' + e.message;
      }
    };
    c.appendChild(fetchBtn);

    this._serverLogEl = this._ce('div', 'debug-request-list');
    c.appendChild(this._serverLogEl);

    // Client LLM events
    const llmEvents = this._analytics.getEvents('llm');
    if (llmEvents.length > 0) {
      c.appendChild(this._ce('div', 'debug-section-label', 'Client Events'));
      const list = this._ce('div', 'debug-request-list');
      llmEvents.slice(-20).forEach(evt => {
        const el = this._ce('div', 'debug-request');
        const hdr = this._ce('div', 'req-header');
        hdr.appendChild(this._ce('span', 'req-stage', `Stage ${evt.data.stage || '?'}`));
        if (evt.type === 'response-ok' && evt.data.latencyMs) {
          hdr.appendChild(this._ce('span', 'req-latency', evt.data.latencyMs + 'ms'));
        } else if (evt.type === 'response-error') {
          hdr.appendChild(this._ce('span', 'req-error', 'ERROR'));
        } else {
          const t = this._ce('span', '', evt.type);
          t.style.color = '#4a4a62';
          hdr.appendChild(t);
        }
        el.appendChild(hdr);
        el.onclick = () => {
          const d = el.querySelector('.debug-log-detail');
          if (d) { d.remove(); return; }
          el.appendChild(this._ce('div', 'debug-log-detail', JSON.stringify(evt.data, null, 2)));
        };
        list.appendChild(el);
      });
      c.appendChild(list);
    }
  }

  _renderServerLogs(logs) {
    this._serverLogEl.innerHTML = '';
    if (!logs.length) {
      const empty = this._ce('div', '');
      empty.style.cssText = 'color:#3a3a52;padding:8px 0;font-style:italic';
      empty.textContent = 'No server logs yet';
      this._serverLogEl.appendChild(empty);
      return;
    }
    logs.forEach(log => {
      const el = this._ce('div', 'debug-request');
      const hdr = this._ce('div', 'req-header');
      hdr.appendChild(this._ce('span', 'req-stage', `Stage ${log.stage || '?'}`));
      hdr.appendChild(this._ce('span',
        log.error ? 'req-error' : 'req-latency',
        log.error ? 'ERROR' : log.latencyMs + 'ms'));
      el.appendChild(hdr);
      if (log.model) {
        el.appendChild(this._ce('div', 'req-model', log.model));
      }
      el.onclick = () => {
        const d = el.querySelector('.debug-log-detail');
        if (d) { d.remove(); return; }
        el.appendChild(this._ce('div', 'debug-log-detail', JSON.stringify(log, null, 2)));
      };
      this._serverLogEl.appendChild(el);
    });
  }

  // ── Stage Inspector ────────────────────────────

  _renderStageInspector() {
    const c = this._contentEl;
    const si = this._inspectedStage;

    // Planet selector
    const select = this._ce('div', 'debug-stage-select');
    for (let i = 0; i < PLANET_CONFIGS.length; i++) {
      const source = this._game.difficulty.getConfigSource(i);
      const btn = this._ce('button',
        'debug-stage-btn' + (i === si ? ' active' : '') + (source === 'llm' ? ' llm' : ''),
        String(i + 1));
      btn.title = PLANET_CONFIGS[i].name;
      btn.onclick = () => { this._inspectedStage = i; this._renderContent(); };
      select.appendChild(btn);
    }
    c.appendChild(select);

    // Planet name label
    const planet = PLANET_CONFIGS[si];
    c.appendChild(this._ce('div', 'debug-section-label', `${planet.name} \u2014 ${planet.atmosphereLabel}`));

    // Config comparison
    const compare = this._ce('div', 'debug-config-compare');
    const defaultCfg = {
      minW: planet.minW, maxW: planet.maxW,
      minGap: planet.minGap, maxGap: planet.maxGap,
      yOffset: planet.yOffset,
      minRise: planet.minRise, maxRise: planet.maxRise,
    };
    const currentCfg = this._game.difficulty.getStageConfig(si);

    // Default column
    const defCol = this._ce('div', 'debug-config-col');
    defCol.appendChild(this._ce('h4', '', 'Default'));
    for (const key of Object.keys(defaultCfg)) {
      const isDiff = defaultCfg[key] !== currentCfg[key];
      const row = this._ce('div', 'debug-config-row' + (isDiff ? ' diff' : ''));
      row.innerHTML = `<span>${key}</span><span>${defaultCfg[key]}</span>`;
      defCol.appendChild(row);
    }
    compare.appendChild(defCol);

    // Current column
    const curCol = this._ce('div', 'debug-config-col');
    const source = this._game.difficulty.getConfigSource(si);
    curCol.appendChild(this._ce('h4', '', source === 'llm' ? 'LLM' : 'Current'));
    for (const key of Object.keys(currentCfg)) {
      const isDiff = defaultCfg[key] !== currentCfg[key];
      const row = this._ce('div', 'debug-config-row' + (isDiff ? ' diff' : ''));
      row.innerHTML = `<span>${key}</span><span>${currentCfg[key]}</span>`;
      curCol.appendChild(row);
    }
    compare.appendChild(curCol);
    c.appendChild(compare);

    // Per-platform specs (if LLM provided them)
    const platformSpecs = this._game.difficulty.getPlatformSpecs(si);
    if (platformSpecs) {
      c.appendChild(this._ce('div', 'debug-section-label', `Per-Platform Specs (${platformSpecs.length})`));
      const specsBox = this._ce('div', 'debug-metrics-box');
      const specsHeader = this._ce('div', 'debug-config-row');
      specsHeader.innerHTML = '<span><b>#</b></span><span><b>W</b></span><span><b>Gap</b></span><span><b>Rise</b></span><span><b>yOff</b></span><span><b>Pow</b></span>';
      specsHeader.style.cssText = 'display:grid;grid-template-columns:1fr 2fr 2fr 2fr 2fr 2fr;gap:2px;font-size:10px';
      specsBox.appendChild(specsHeader);
      platformSpecs.forEach((spec, idx) => {
        const row = this._ce('div', 'debug-config-row');
        row.style.cssText = 'display:grid;grid-template-columns:1fr 2fr 2fr 2fr 2fr 2fr;gap:2px;font-size:10px';
        row.innerHTML = `<span>${idx + 1}</span><span>${Math.round(spec.width)}</span><span>${Math.round(spec.gap)}</span><span>${Math.round(spec.rise)}</span><span>${Math.round(spec.yOffset)}</span><span>${spec.powerExponent.toFixed(1)}</span>`;
        specsBox.appendChild(row);
      });
      c.appendChild(specsBox);
    }

    // Metrics
    c.appendChild(this._ce('div', 'debug-section-label', 'Player Metrics'));
    const metrics = this._game.difficulty.getStageMetrics()[si];
    const box = this._ce('div', 'debug-metrics-box');
    if (metrics) {
      for (const [key, val] of Object.entries(metrics)) {
        const v = typeof val === 'number' ? Math.round(val * 1000) / 1000 : String(val);
        const row = this._ce('div', 'debug-config-row');
        row.innerHTML = `<span>${key}</span><span>${v}</span>`;
        box.appendChild(row);
      }
    } else {
      box.appendChild(this._ce('div', 'no-data', 'No metrics yet'));
    }
    c.appendChild(box);
  }

  // ── Dev Controls ───────────────────────────────

  _renderDevControls() {
    const c = this._contentEl;
    const controls = this._ce('div', 'debug-controls');

    // Skip to Stage
    const skipGroup = this._ce('div', 'debug-control-group');
    skipGroup.appendChild(this._ce('label', '', 'Skip to Planet'));
    const skipRow = this._ce('div', 'debug-btn-row');
    for (let i = 0; i < PLANET_CONFIGS.length; i++) {
      const btn = this._ce('button', 'debug-btn', String(i + 1));
      btn.title = PLANET_CONFIGS[i].name;
      btn.onclick = () => this._game.skipToStage(i);
      skipRow.appendChild(btn);
    }
    skipGroup.appendChild(skipRow);
    controls.appendChild(skipGroup);

    // Auto-Play
    const autoGroup = this._ce('div', 'debug-control-group');
    autoGroup.appendChild(this._ce('label', '', 'Auto-Play'));
    const autoRow = this._ce('div', 'debug-btn-row');
    const startBtn = this._ce('button',
      'debug-btn' + (this._game._autoPlay ? ' active' : ''), 'Start');
    startBtn.onclick = () => { this._game.startAutoPlay(); this._renderContent(); };
    autoRow.appendChild(startBtn);
    const stopBtn = this._ce('button', 'debug-btn danger', 'Stop');
    stopBtn.onclick = () => { this._game.stopAutoPlay(); this._renderContent(); };
    autoRow.appendChild(stopBtn);
    autoGroup.appendChild(autoRow);
    controls.appendChild(autoGroup);

    // Speed
    const speedGroup = this._ce('div', 'debug-control-group');
    speedGroup.appendChild(this._ce('label', '', 'Speed'));
    const speedRow = this._ce('div', 'debug-btn-row');
    [0.5, 1, 2, 5].forEach(m => {
      const btn = this._ce('button',
        'debug-btn' + (this._game._speedMult === m ? ' active' : ''), m + 'x');
      btn.onclick = () => { this._game.setSpeedMultiplier(m); this._renderContent(); };
      speedRow.appendChild(btn);
    });
    speedGroup.appendChild(speedRow);
    controls.appendChild(speedGroup);

    // Trigger LLM
    const llmGroup = this._ce('div', 'debug-control-group');
    llmGroup.appendChild(this._ce('label', '', 'Trigger LLM'));
    const llmRow = this._ce('div', 'debug-btn-row');
    for (let i = 0; i < 9; i++) {
      const btn = this._ce('button', 'debug-btn', `${i + 1}\u2192${i + 2}`);
      btn.onclick = () => this._game.difficulty.requestNextStageConfig(i);
      llmRow.appendChild(btn);
    }
    llmGroup.appendChild(llmRow);
    controls.appendChild(llmGroup);

    // Utilities
    const utilGroup = this._ce('div', 'debug-control-group');
    utilGroup.appendChild(this._ce('label', '', 'Utilities'));
    const utilRow = this._ce('div', 'debug-btn-row');

    this._addFlashBtn(utilRow, 'Export Logs', 'Copied', () => {
      return navigator.clipboard.writeText(this._analytics.exportJSON());
    });
    this._addFlashBtn(utilRow, 'Clear Logs', 'Cleared', () => {
      return fetch('/api/logs/clear', { method: 'POST' });
    }, true);
    this._addFlashBtn(utilRow, 'Push State', 'Pushed', () => {
      return this._analytics.pushToServer();
    });

    utilGroup.appendChild(utilRow);
    controls.appendChild(utilGroup);
    c.appendChild(controls);
  }

  _addFlashBtn(container, label, flashLabel, action, danger) {
    const btn = this._ce('button', 'debug-btn' + (danger ? ' danger' : ''), label);
    btn.onclick = async () => {
      await action();
      btn.textContent = flashLabel;
      setTimeout(() => { btn.textContent = label; }, 1200);
    };
    container.appendChild(btn);
  }

  // ── Live event appending ──────────────────────

  _onEvent(event) {
    if (!this._visible || this._activeTab !== 0) return;
    if (this._logFilter !== 'all' && this._logFilter !== event.category) return;
    if (!this._logListEl) return;
    this._logListEl.appendChild(this._makeLogEntry(event));
    if (this._autoScroll) {
      this._contentEl.scrollTop = this._contentEl.scrollHeight;
    }
  }

  // ── Helper ────────────────────────────────────

  _ce(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }
}
