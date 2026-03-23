/**
 * Atmospheric canvas eye that watches the player during AI/LLM thinking.
 * Purely procedural Canvas 2D — no image assets.
 */
export class EyeIndicator {
  constructor() {
    this.alpha = 0;          // overall visibility (0-1)
    this.openness = 0;       // eyelid openness (0=closed, 1=open)
    this.pupilX = 0;         // current pupil offset X (relative to eye center)
    this.pupilY = 0;         // current pupil offset Y
    this._targetPupilX = 0;
    this._targetPupilY = 0;
    this._active = false;
    this._wasActive = false;   // isActive from previous frame (for edge detection)
    this._showTimer = 0;       // minimum display time remaining
    this._MIN_SHOW_TIME = 1.8; // seconds — eye stays open at least this long
    this._blinkTimer = this._nextBlinkDelay();
    this._blinkPhase = 'none'; // 'none' | 'closing' | 'opening'
    this._blinkProgress = 0;
    this._preBlinkOpenness = 1;
  }

  _nextBlinkDelay() {
    return 3 + Math.random() * 3; // 3-6 seconds
  }

  /**
   * @param {number} dt - delta time in seconds
   * @param {number} charScreenX - character screen X
   * @param {number} charScreenY - character screen Y
   * @param {boolean} isActive - whether LLM is currently thinking
   * @param {number} canvasW - canvas width
   * @param {number} canvasH - canvas height
   */
  update(dt, charScreenX, charScreenY, isActive, canvasW, canvasH) {
    // Detect rising edge: isActive just became true (wasn't true last frame)
    if (isActive && !this._wasActive) {
      this._active = true;
      this._showTimer = this._MIN_SHOW_TIME;
      this._blinkPhase = 'none';
    }
    this._wasActive = isActive;

    // Count down the minimum display timer
    if (this._showTimer > 0) {
      this._showTimer -= dt;
    }

    // Stay visible while LLM is active OR min display time hasn't elapsed
    const shouldShow = isActive || this._showTimer > 0;

    if (shouldShow) {
      this._active = true;
      // Fade in
      this.alpha = Math.min(1, this.alpha + dt * 2.5); // ~0.4s fade in
      // Open eyelids
      if (this._blinkPhase === 'none') {
        this.openness = Math.min(1, this.openness + dt * 2.0); // ~0.5s open
      }
    } else {
      this._active = false;
      // Close eyelids first, then fade
      if (this.openness > 0) {
        this.openness = Math.max(0, this.openness - dt * 3.3); // ~0.3s close
      } else if (this.alpha > 0) {
        this.alpha = Math.max(0, this.alpha - dt * 5.0); // ~0.2s fade out
      }
    }

    // Skip further updates if invisible
    if (this.alpha <= 0) return;

    // Pupil tracking toward character
    const eyeCenterX = canvasW / 2;
    const eyeCenterY = canvasH * 0.42;
    const eyeH = canvasH * 0.30;
    const irisRadius = eyeH * 0.35;
    const maxPupilOffset = irisRadius * 0.35;

    const dx = charScreenX - eyeCenterX;
    const dy = charScreenY - eyeCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this._targetPupilX = (dx / dist) * Math.min(maxPupilOffset, Math.abs(dx) * 0.15);
    this._targetPupilY = (dy / dist) * Math.min(maxPupilOffset * 0.6, Math.abs(dy) * 0.1);

    // Smooth lerp
    const trackSpeed = 4;
    this.pupilX += (this._targetPupilX - this.pupilX) * trackSpeed * dt;
    this.pupilY += (this._targetPupilY - this.pupilY) * trackSpeed * dt;

    // Blink logic
    if (this._active && this.openness >= 0.95) {
      if (this._blinkPhase === 'none') {
        this._blinkTimer -= dt;
        if (this._blinkTimer <= 0) {
          this._blinkPhase = 'closing';
          this._blinkProgress = 0;
          this._preBlinkOpenness = this.openness;
        }
      } else if (this._blinkPhase === 'closing') {
        this._blinkProgress += dt / 0.12; // 0.12s close
        if (this._blinkProgress >= 1) {
          this.openness = 0.05;
          this._blinkPhase = 'opening';
          this._blinkProgress = 0;
        } else {
          this.openness = this._preBlinkOpenness * (1 - this._blinkProgress);
        }
      } else if (this._blinkPhase === 'opening') {
        this._blinkProgress += dt / 0.1; // 0.1s open
        if (this._blinkProgress >= 1) {
          this.openness = 1;
          this._blinkPhase = 'none';
          this._blinkTimer = this._nextBlinkDelay();
        } else {
          this.openness = 0.05 + 0.95 * this._blinkProgress;
        }
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} w - canvas width
   * @param {number} h - canvas height
   * @param {string} irisColor - hex color for the iris
   */
  draw(ctx, w, h, irisColor) {
    if (this.alpha <= 0.001) return;

    const cx = w / 2;
    const cy = h * 0.42;
    const eyeW = w * 0.38;
    const eyeH = h * 0.30;
    const irisR = eyeH * 0.35;
    const pupilR = irisR * 0.45;

    ctx.save();
    ctx.globalAlpha = this.alpha * 0.55; // atmospheric, not overwhelming

    // --- Atmospheric glow (only when eye is meaningfully open) ---
    if (this.openness > 0.15) {
      ctx.save();
      ctx.shadowColor = irisColor;
      ctx.shadowBlur = eyeH * 0.8;
      ctx.globalAlpha = this.alpha * 0.55 * Math.min(1, (this.openness - 0.15) / 0.3);
      ctx.beginPath();
      ctx.ellipse(cx, cy, eyeW * 0.5, eyeH * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.01)';
      ctx.fill();
      ctx.restore();
    }

    // --- Clip to eye shape (almond) ---
    ctx.save();
    this._eyePath(ctx, cx, cy, eyeW, eyeH, this.openness);
    ctx.clip();

    // --- Sclera ---
    const scleraGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, eyeH * 0.5);
    scleraGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    scleraGrad.addColorStop(0.7, 'rgba(245,240,240,0.9)');
    scleraGrad.addColorStop(1, 'rgba(220,200,200,0.8)');
    ctx.fillStyle = scleraGrad;
    ctx.fillRect(cx - eyeW, cy - eyeH, eyeW * 2, eyeH * 2);

    // --- Iris ---
    const irisX = cx + this.pupilX;
    const irisY = cy + this.pupilY;

    const irisGrad = ctx.createRadialGradient(irisX, irisY, irisR * 0.15, irisX, irisY, irisR);
    irisGrad.addColorStop(0, this._lighten(irisColor, 40));
    irisGrad.addColorStop(0.5, irisColor);
    irisGrad.addColorStop(1, this._darken(irisColor, 50));
    ctx.beginPath();
    ctx.arc(irisX, irisY, irisR, 0, Math.PI * 2);
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Iris fibrous lines
    ctx.save();
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(irisX + Math.cos(angle) * irisR * 0.3, irisY + Math.sin(angle) * irisR * 0.3);
      ctx.lineTo(irisX + Math.cos(angle) * irisR * 0.95, irisY + Math.sin(angle) * irisR * 0.95);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
    ctx.restore();

    // --- Pupil ---
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, pupilR, pupilR * 1.1, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // --- Specular highlight ---
    const specX = irisX - pupilR * 0.5;
    const specY = irisY - pupilR * 0.6;
    ctx.beginPath();
    ctx.arc(specX, specY, pupilR * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();

    // Smaller secondary highlight
    ctx.beginPath();
    ctx.arc(irisX + pupilR * 0.35, irisY + pupilR * 0.3, pupilR * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();

    ctx.restore(); // remove clip

    // --- Eyelid edges (drawn on top of eye shape, hidden when nearly closed) ---
    if (this.openness > 0.1) {
      ctx.save();
      ctx.lineWidth = 2;
      const edgeAlpha = 0.4 * this.alpha * Math.min(1, this.openness / 0.25);
      ctx.strokeStyle = `rgba(60,50,50,${edgeAlpha})`;
      this._eyePath(ctx, cx, cy, eyeW, eyeH, this.openness);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // remove globalAlpha
  }

  /**
   * Draws an almond-shaped eye path controlled by openness.
   * openness=1: fully open, openness=0: flat line (closed).
   */
  _eyePath(ctx, cx, cy, eyeW, eyeH, openness) {
    const halfW = eyeW * 0.5;
    const topH = eyeH * 0.45 * openness;
    const botH = eyeH * 0.35 * openness;

    ctx.beginPath();
    // Left corner -> top lid -> right corner
    ctx.moveTo(cx - halfW, cy);
    ctx.quadraticCurveTo(cx, cy - topH, cx + halfW, cy);
    // Right corner -> bottom lid -> left corner
    ctx.quadraticCurveTo(cx, cy + botH, cx - halfW, cy);
    ctx.closePath();
  }

  _lighten(hex, amount) {
    const rgb = this._hexToRgb(hex);
    return `rgb(${Math.min(255, rgb.r + amount)},${Math.min(255, rgb.g + amount)},${Math.min(255, rgb.b + amount)})`;
  }

  _darken(hex, amount) {
    const rgb = this._hexToRgb(hex);
    return `rgb(${Math.max(0, rgb.r - amount)},${Math.max(0, rgb.g - amount)},${Math.max(0, rgb.b - amount)})`;
  }

  _hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16) || 128,
      g: parseInt(h.substring(2, 4), 16) || 128,
      b: parseInt(h.substring(4, 6), 16) || 128,
    };
  }
}
