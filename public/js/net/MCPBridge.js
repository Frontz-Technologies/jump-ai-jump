/**
 * Browser-side MCP command executor.
 * Connects to the game's WebSocket and handles MCP commands
 * forwarded from the server, executing them on window.__game.
 */
export class MCPBridge {
  constructor(sessionId) {
    this._sessionId = sessionId;
    this._ws = null;
    this._bound = false;
    this._onStatusChange = null;
  }

  /** Set a callback for connection status changes: 'waiting' | 'connected' | 'disconnected' */
  onStatusChange(cb) {
    this._onStatusChange = cb;
  }

  connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}`;
    try {
      this._ws = new WebSocket(url);
    } catch (e) {
      console.warn('[MCPBridge] WebSocket creation failed:', e);
      return;
    }

    this._ws.onopen = () => {
      // Bind this WebSocket to our MCP session
      this._ws.send(JSON.stringify({ type: 'mcp-bind', sessionId: this._sessionId }));
      this._bound = true;
      if (this._onStatusChange) this._onStatusChange('waiting');
    };

    this._ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'mcp-command') {
          this._handleCommand(msg);
        } else if (msg.type === 'mcp-connected') {
          if (this._onStatusChange) this._onStatusChange('connected');
        }
      } catch (e) {
        console.warn('[MCPBridge] Message parse error:', e);
      }
    };

    this._ws.onclose = () => {
      this._bound = false;
      if (this._onStatusChange) this._onStatusChange('disconnected');
    };

    this._ws.onerror = () => {};
  }

  disconnect() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
    this._bound = false;
  }

  async _handleCommand(msg) {
    const { id, command, params } = msg;
    let result;
    try {
      result = await this._executeCommand(command, params);
    } catch (e) {
      result = { error: e.message };
    }
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: 'mcp-result', id, result }));
    }
  }

  async _executeCommand(command, params) {
    const game = window.__game;
    if (!game) return { error: 'Game not initialized' };

    switch (command) {
      case 'get_state':
        return game.getStateForMCP();

      case 'jump':
        return await game.jumpForMCP(params.power);

      case 'restart':
        return await game.restartForMCP();

      case 'get_platforms':
        return game.getPlatformsForMCP(params.count || 3);

      default:
        return { error: `Unknown command: ${command}` };
    }
  }
}
