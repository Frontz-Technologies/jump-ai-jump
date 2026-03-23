const MAX_EVENTS = 500;
const PUSH_INTERVAL = 5000;

export class Analytics {
  constructor() {
    this._events = [];
    this._listeners = new Set();
    this._pushTimer = null;
    this._debugActive = false;
  }

  log(category, type, data = {}) {
    const event = {
      timestamp: Date.now(),
      category,
      type,
      data,
    };

    this._events.push(event);
    if (this._events.length > MAX_EVENTS) {
      this._events.shift();
    }

    // Notify listeners
    for (const fn of this._listeners) {
      try { fn(event); } catch (_) {}
    }

    // Echo to console
    console.log(`[${category}] ${type}`, data);
  }

  subscribe(fn) {
    this._listeners.add(fn);
  }

  unsubscribe(fn) {
    this._listeners.delete(fn);
  }

  getEvents(category) {
    if (!category) return [...this._events];
    return this._events.filter(e => e.category === category);
  }

  getSessionSummary() {
    const llmEvents = this._events.filter(e => e.category === 'llm');
    const requests = llmEvents.filter(e => e.type === 'request-sent');
    const okResponses = llmEvents.filter(e => e.type === 'response-ok');
    const errors = llmEvents.filter(e => e.type === 'response-error');
    const applied = llmEvents.filter(e => e.type === 'config-applied');

    const latencies = okResponses
      .map(e => e.data.latencyMs)
      .filter(v => typeof v === 'number');

    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    return {
      totalRequests: requests.length,
      successfulResponses: okResponses.length,
      errors: errors.length,
      avgLatency,
      llmStages: applied.length,
      defaultStages: 10 - applied.length,
    };
  }

  exportJSON() {
    return JSON.stringify({
      summary: this.getSessionSummary(),
      events: this._events,
    }, null, 2);
  }

  startPeriodicPush() {
    this._debugActive = true;
    if (this._pushTimer) return;
    this._pushTimer = setInterval(() => this.pushToServer(), PUSH_INTERVAL);
  }

  stopPeriodicPush() {
    this._debugActive = false;
    if (this._pushTimer) {
      clearInterval(this._pushTimer);
      this._pushTimer = null;
    }
  }

  async pushToServer() {
    try {
      await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: Date.now(),
          summary: this.getSessionSummary(),
          recentEvents: this._events.slice(-50),
        }),
      });
    } catch (_) {}
  }
}
