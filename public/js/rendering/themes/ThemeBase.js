/**
 * Base class / interface for themes.
 * Themes control how everything looks on the canvas.
 */
export class ThemeBase {
  /** @param {CanvasRenderingContext2D} ctx */
  drawBackground(ctx, canvas, transition) {}

  /** @param {CanvasRenderingContext2D} ctx */
  drawPlatform(ctx, platform, index, totalPlatforms) {}

  /** @param {CanvasRenderingContext2D} ctx */
  drawCharacter(ctx, character) {}

  /** Draw a thought bubble above the character.
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} character
   * @param {string} text
   */
  drawThoughtBubble(ctx, character, text) {}

  /** Draw the death wall (fog/void from left).
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} deathWall - { x, active }
   * @param {object} canvas - { width, height }
   */
  drawDeathWall(ctx, deathWall, canvas) {}
}
