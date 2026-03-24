/**
 * Base class / interface for themes.
 * Themes control how everything looks on the canvas.
 */
export class ThemeBase {
  /** @param {CanvasRenderingContext2D} ctx */
  drawBackground(_ctx, _canvas, _transition) {}

  /** @param {CanvasRenderingContext2D} ctx */
  drawPlatform(_ctx, _platform, _index, _totalPlatforms, _personalBestIndex) {}

  /** @param {CanvasRenderingContext2D} ctx */
  drawCharacter(_ctx, _character, _sliding, _extra) {}

  /** Draw a thought bubble above the character.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} character
   * @param {string} text
   */
  drawThoughtBubble(_ctx, _character, _text) {}

  /** Draw the death wall (fog/void from left).
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} deathWall - { x, active }
   * @param {object} canvas - { width, height }
   */
  drawDeathWall(_ctx, _deathWall, _canvas) {}
}
