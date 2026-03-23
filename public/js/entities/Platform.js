export class Platform {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   */
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.definitionY = y;
    this.width = width;
    this.height = height;
    this.surfaceFriction = null; // null = use planet default
    // Spawn animation: starts negative (above), eases to 0
    this.animOffset = -80;
  }
}
