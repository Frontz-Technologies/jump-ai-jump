const UI_SELECTOR = 'button, .modal, .overlay, input, .debug-panel';

/** Tracks hold/release timing for keyboard, mouse, and touch. */
export class Input {
  constructor() {
    this.holdStartTime = 0;
    this.isHolding = false;
    this._onJumpStart = null;
    this._onJumpRelease = null;
    this._bound = {};
    this.enabled = true;
  }

  /**
   * @param {object} callbacks
   * @param {function} callbacks.onJumpStart
   * @param {function(power: number)} callbacks.onJumpRelease
   */
  init(callbacks) {
    this._onJumpStart = callbacks.onJumpStart;
    this._onJumpRelease = callbacks.onJumpRelease;

    this._bound.keydown = this._handleKeyDown.bind(this);
    this._bound.keyup = this._handleKeyUp.bind(this);
    this._bound.touchstart = this._handleTouchStart.bind(this);
    this._bound.touchmove = this._handleTouchMove.bind(this);
    this._bound.touchend = this._handleTouchEnd.bind(this);
    this._bound.mousedown = this._handleMouseDown.bind(this);
    this._bound.mouseup = this._handleMouseUp.bind(this);

    window.addEventListener('keydown', this._bound.keydown);
    window.addEventListener('keyup', this._bound.keyup);
    window.addEventListener('touchstart', this._bound.touchstart, { passive: false });
    window.addEventListener('touchmove', this._bound.touchmove, { passive: false });
    window.addEventListener('touchend', this._bound.touchend);

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.addEventListener('mousedown', this._bound.mousedown);
      canvas.addEventListener('mouseup', this._bound.mouseup);
    }
  }

  _handleKeyDown(e) {
    if (!this.enabled) return;
    if (e.repeat) return;
    // Ignore keys when focused on buttons/modals/inputs
    if (e.target.closest(UI_SELECTOR)) return;
    e.preventDefault();
    this._startHold();
  }

  _handleKeyUp(e) {
    if (e.target.closest(UI_SELECTOR)) return;
    e.preventDefault();
    this._endHold();
  }

  _handleMouseDown(e) {
    if (!this.enabled) return;
    if (e.target.closest(UI_SELECTOR)) return;
    e.preventDefault();
    this._startHold();
  }

  _handleMouseUp(e) {
    this._endHold();
  }

  _handleTouchMove(e) {
    e.preventDefault();
  }

  _handleTouchStart(e) {
    if (!this.enabled) return;
    // Ignore touches on buttons/modals
    if (e.target.closest(UI_SELECTOR)) return;
    e.preventDefault();
    this._startHold();
  }

  _handleTouchEnd(e) {
    this._endHold();
  }

  _startHold() {
    if (this.isHolding) return;
    this.isHolding = true;
    this.holdStartTime = performance.now();
    if (this._onJumpStart) this._onJumpStart();
  }

  _endHold() {
    if (!this.isHolding) return;
    this.isHolding = false;
    const holdDuration = performance.now() - this.holdStartTime;
    const power = this.computePower(holdDuration);
    if (this._onJumpRelease) this._onJumpRelease(power);
  }

  /** Returns current power 0..1 based on ongoing hold. */
  getCurrentPower() {
    if (!this.isHolding) return 0;
    const duration = performance.now() - this.holdStartTime;
    return this.computePower(duration);
  }

  /** Convert hold duration to 0..1 power with easing. */
  computePower(durationMs) {
    const MAX_HOLD = 1200;
    const raw = Math.min(durationMs / MAX_HOLD, 1.0);
    // Ease-out for better feel: fast initial ramp, slower near max
    return raw * (2 - raw);
  }

  destroy() {
    window.removeEventListener('keydown', this._bound.keydown);
    window.removeEventListener('keyup', this._bound.keyup);
    window.removeEventListener('touchstart', this._bound.touchstart);
    window.removeEventListener('touchmove', this._bound.touchmove);
    window.removeEventListener('touchend', this._bound.touchend);

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
      canvas.removeEventListener('mousedown', this._bound.mousedown);
      canvas.removeEventListener('mouseup', this._bound.mouseup);
    }
  }
}
