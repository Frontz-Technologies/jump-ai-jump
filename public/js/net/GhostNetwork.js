/**
 * Client-side WebSocket networking for ghost/shadow players.
 *
 * Positions are normalised so randomly-generated levels align:
 * - Idle/charging: offset from current platform center
 * - Airborne: progress t (0-1) between fromPlatform and toPlatform,
 *   plus normalised arc height yN relative to the vertical span
 */
export class GhostNetwork {
  constructor() {
    this._ws = null;
    this._id = null;
    this._ghosts = new Map();
    this._sendInterval = null;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
    this._connected = false;
    this._pendingPos = null;
    this._maxVisibleGhosts = 10;
    this._staleThreshold = 2000;
    this._galaxyId = null;
  }

  setGalaxyId(id) {
    this._galaxyId = id;
  }

  connect() {
    if (this._ws) return;
    this._reconnectAttempts = 0;
    this._openSocket();
  }

  _openSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}`;
    try {
      this._ws = new WebSocket(url);
    } catch (e) {
      console.warn('[GhostNetwork] WebSocket creation failed:', e);
      return;
    }

    this._ws.onopen = () => {
      this._connected = true;
      this._reconnectAttempts = 0;
      this._sendInterval = setInterval(() => this._flush(), 50);
    };
    this._ws.onmessage = (event) => {
      try {
        this._handleMessage(JSON.parse(event.data));
      } catch {}
    };
    this._ws.onclose = () => {
      this._cleanup();
      this._attemptReconnect();
    };
    this._ws.onerror = () => {};
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        this._id = msg.id;
        break;
      case 'positions':
        this._updateGhosts(msg.players);
        break;
      case 'leave':
        this._ghosts.delete(msg.id);
        break;
    }
  }

  _hueFromId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
    }
    return ((hash % 360) + 360) % 360;
  }

  _updateGhosts(players) {
    const now = performance.now();
    for (const p of players) {
      const existing = this._ghosts.get(p.id);
      const newData = {
        airborne: p.airborne,
        platformIndex: p.platformIndex,
        // idle fields
        ox: p.ox,
        oy: p.oy,
        // airborne fields
        fromIndex: p.fromIndex,
        toIndex: p.toIndex,
        t: p.t,
        yN: p.yN,
        // shared
        vx: p.vx,
        vy: p.vy,
        scaleX: p.scaleX,
        scaleY: p.scaleY,
        state: p.state,
      };
      if (existing) {
        if (p.airborne) {
          existing.prev = { t: existing.target.t ?? p.t, yN: existing.target.yN ?? p.yN };
          existing.target = { t: p.t, yN: p.yN };
        } else {
          existing.prev = { ox: existing.target.ox ?? p.ox, oy: existing.target.oy ?? p.oy };
          existing.target = { ox: p.ox, oy: p.oy };
        }
        Object.assign(existing, newData);
        existing.lastUpdate = now;
        existing.interpT = 0;
      } else {
        const ghost = {
          ...newData,
          x: 0,
          y: 0,
          hue: this._hueFromId(p.id),
          lastUpdate: now,
          interpT: 1,
        };
        if (p.airborne) {
          ghost.prev = { t: p.t, yN: p.yN };
          ghost.target = { t: p.t, yN: p.yN };
          ghost._interpArc = { t: p.t, yN: p.yN };
        } else {
          ghost.prev = { ox: p.ox, oy: p.oy };
          ghost.target = { ox: p.ox, oy: p.oy };
          ghost._interpIdle = { ox: p.ox, oy: p.oy };
        }
        this._ghosts.set(p.id, ghost);
      }
    }
  }

  disconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._reconnectAttempts = this._maxReconnectAttempts;
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
    }
    this._cleanup();
  }

  _cleanup() {
    this._connected = false;
    if (this._sendInterval) {
      clearInterval(this._sendInterval);
      this._sendInterval = null;
    }
    this._ws = null;
  }

  _attemptReconnect() {
    if (this._reconnectAttempts >= this._maxReconnectAttempts) return;
    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._openSocket();
    }, 3000);
  }

  /**
   * Queue position for next send tick.
   * @param {number} stageIndex
   * @param {object} character
   * @param {object} fromPlatform - platform the character launched from
   * @param {number} fromIndex - global index of fromPlatform
   * @param {object|null} toPlatform - next platform (target), null if none
   * @param {number} toIndex - global index of toPlatform
   */
  sendPosition(stageIndex, character, fromPlatform, fromIndex, toPlatform, toIndex) {
    const base = {
      type: 'pos',
      stageIndex,
      galaxyId: this._galaxyId,
      vx: character.vx || 0,
      vy: character.vy || 0,
      scaleX: character.scaleX,
      scaleY: character.scaleY,
      state: character.state,
    };

    if (character.state === 'AIRBORNE' && toPlatform) {
      // Normalised arc: t = horizontal progress 0→1 from fromPlatform center to toPlatform center
      const fromCx = fromPlatform.x + fromPlatform.width / 2;
      const toCx = toPlatform.x + toPlatform.width / 2;
      const charCx = character.x + character.width / 2;
      const dx = toCx - fromCx;
      const t = dx !== 0 ? Math.max(0, Math.min(1, (charCx - fromCx) / dx)) : 0;

      // yN = vertical offset normalised to the vertical span between platforms
      const fromY = fromPlatform.y;
      const toY = toPlatform.y;
      const dy = toY - fromY; // typically negative (going up)
      const charY = character.y + character.height; // bottom of character
      const baselineY = fromY + (toY - fromY) * t; // linear baseline
      const yN = dy !== 0 ? (charY - baselineY) / Math.abs(dy) : (charY - baselineY) / 100;

      this._pendingPos = {
        ...base,
        airborne: true,
        fromIndex,
        toIndex,
        t,
        yN,
        platformIndex: fromIndex,
      };
    } else {
      // Idle/charging: offset from current platform center
      const platCx = fromPlatform.x + fromPlatform.width / 2;
      const platY = fromPlatform.y;
      this._pendingPos = {
        ...base,
        airborne: false,
        platformIndex: fromIndex,
        ox: character.x - platCx,
        oy: character.y - platY,
      };
    }
  }

  _flush() {
    if (!this._connected || !this._ws || !this._pendingPos) return;
    if (this._ws.readyState !== WebSocket.OPEN) return;
    this._ws.send(JSON.stringify(this._pendingPos));
    this._pendingPos = null;
  }

  /**
   * Resolve ghost world positions and return visible ghosts.
   */
  getGhosts(stageIndex, platforms, currentPlatformIndex) {
    const now = performance.now();
    const result = [];
    for (const [id, g] of this._ghosts) {
      if (now - g.lastUpdate > this._staleThreshold) {
        this._ghosts.delete(id);
        continue;
      }
      if (g.platformIndex < currentPlatformIndex - 1) {
        this._ghosts.delete(id);
        continue;
      }

      // Skip ghosts beyond the visible platform window (don't delete — they may scroll into view)
      const ghostMaxIndex = g.airborne ? Math.max(g.fromIndex, g.toIndex) : g.platformIndex;
      if (ghostMaxIndex > currentPlatformIndex + 2) continue;

      if (g.airborne) {
        const from = platforms[g.fromIndex];
        const to = platforms[g.toIndex];
        if (!from || !to) continue;
        const fromCx = from.x + from.width / 2;
        const toCx = to.x + to.width / 2;
        const fromY = from.y;
        const toY = to.y;
        const arcT = g._interpArc ? g._interpArc.t : g.t;
        const arcYN = g._interpArc ? g._interpArc.yN : g.yN;
        const dy = toY - fromY;

        g.x = fromCx + (toCx - fromCx) * arcT - 20; // -20 = half char width
        const baselineY = fromY + dy * arcT;
        g.y = baselineY + arcYN * Math.abs(dy || 100) - 40; // -40 = char height
      } else {
        const plat = platforms[g.platformIndex];
        if (!plat) continue;
        const interpOx = g._interpIdle ? g._interpIdle.ox : g.ox;
        const interpOy = g._interpIdle ? g._interpIdle.oy : g.oy;
        g.x = plat.x + plat.width / 2 + interpOx;
        g.y = plat.y + interpOy;
      }
      result.push(g);
    }
    return result.slice(0, this._maxVisibleGhosts);
  }

  updateInterpolation(dt) {
    for (const [, g] of this._ghosts) {
      g.interpT = Math.min(1, g.interpT + dt / 0.05);
      const s = g.interpT;

      if (g.airborne) {
        const prevT = g.prev.t ?? g.t;
        const prevYN = g.prev.yN ?? g.yN;
        g._interpArc = {
          t: prevT + (g.target.t - prevT) * s,
          yN: prevYN + (g.target.yN - prevYN) * s,
        };
      } else {
        const prevOx = g.prev.ox ?? g.ox;
        const prevOy = g.prev.oy ?? g.oy;
        g._interpIdle = {
          ox: prevOx + (g.target.ox - prevOx) * s,
          oy: prevOy + (g.target.oy - prevOy) * s,
        };
      }
    }
  }
}
