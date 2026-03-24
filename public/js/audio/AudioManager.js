/**
 * Simple Web Audio API sound effects.
 * Generates sounds procedurally — no external files needed.
 */
export class AudioManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  /** Lazy-init AudioContext (must happen after user gesture). */
  _ensureContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  _playTone(freq, duration, type = 'square', volume = 0.15) {
    if (!this.enabled) return;
    this._ensureContext();
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  startCharge() {
    if (!this.enabled) return;
    this._ensureContext();
    const { ctx } = this;

    // Main oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    this._chargeOsc = osc;
    this._chargeGain = gain;

    // Ready warble oscillator (silent until power >= 0.95)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(200, ctx.currentTime);
    osc2.detune.setValueAtTime(15, ctx.currentTime);
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start();
    this._chargeOsc2 = osc2;
    this._chargeGain2 = gain2;
  }

  updateCharge(power) {
    if (!this._chargeOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Frequency: 200 (power=0) -> 800 (power=1)
    const freq = 200 + power * 600;
    this._chargeOsc.frequency.setTargetAtTime(freq, t, 0.03);
    // Volume: 0.04 -> 0.15
    this._chargeGain.gain.setTargetAtTime(0.04 + power * 0.11, t, 0.03);

    // Ready warble at power >= 0.95
    if (this._chargeOsc2) {
      this._chargeOsc2.frequency.setTargetAtTime(freq, t, 0.03);
      const warbleVol = power >= 0.95 ? 0.06 : 0;
      this._chargeGain2.gain.setTargetAtTime(warbleVol, t, 0.05);
    }
  }

  stopCharge() {
    const t = this.ctx?.currentTime || 0;
    if (this._chargeGain) {
      try {
        this._chargeGain.gain.cancelScheduledValues(t);
        this._chargeGain.gain.setTargetAtTime(0.001, t, 0.03);
        this._chargeOsc.stop(t + 0.1);
      } catch {}
      this._chargeOsc = null;
      this._chargeGain = null;
    }
    if (this._chargeGain2) {
      try {
        this._chargeGain2.gain.cancelScheduledValues(t);
        this._chargeGain2.gain.setTargetAtTime(0.001, t, 0.03);
        this._chargeOsc2.stop(t + 0.1);
      } catch {}
      this._chargeOsc2 = null;
      this._chargeGain2 = null;
    }
  }

  playJump() {
    this._playTone(400, 0.15, 'square', 0.12);
    setTimeout(() => this._playTone(500, 0.1, 'square', 0.08), 50);
  }

  playLand() {
    this._playTone(200, 0.1, 'triangle', 0.15);
  }

  playFall() {
    this._playTone(300, 0.3, 'sawtooth', 0.12);
    setTimeout(() => this._playTone(150, 0.4, 'sawtooth', 0.1), 100);
  }

  playComplete() {
    [0, 100, 200, 300].forEach((delay, i) => {
      setTimeout(() => this._playTone(400 + i * 100, 0.2, 'square', 0.1), delay);
    });
  }

  playTrophy() {
    this._playTone(600, 0.15, 'sine', 0.12);
    setTimeout(() => this._playTone(800, 0.2, 'sine', 0.12), 120);
  }
}
