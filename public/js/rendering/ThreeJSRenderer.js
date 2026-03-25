import * as THREE from 'three';
import { PLANET_CONFIGS } from '../data/PlanetConfig.js';

/**
 * Three.js renderer — drop-in replacement for Renderer.js.
 * Exposes the same public interface so Game.js can swap without branching.
 */
export class ThreeJSRenderer {
  /** @param {HTMLCanvasElement} existingCanvas — the #game-canvas element */
  constructor(existingCanvas) {
    // Camera state (same interface as Renderer.js)
    this.cameraX = 0;
    this.cameraTargetX = 0;
    this.cameraY = 0;
    this.cameraTargetY = 0;
    this.theme = null;

    // Container & canvases
    this._container = existingCanvas.parentElement;
    this._canvas2d = existingCanvas;

    this._canvas3d = document.createElement('canvas');
    this._canvas3d.id = 'game-canvas-3d';
    this._canvas3d.style.touchAction = 'none';
    this._container.insertBefore(this._canvas3d, existingCanvas);
    this._canvas2d.style.display = 'none';

    // Three.js core
    this._webglRenderer = new THREE.WebGLRenderer({
      canvas: this._canvas3d,
      antialias: true,
      alpha: false,
    });
    this._webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._webglRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this._scene = new THREE.Scene();

    // Orthographic camera — y-down to match Canvas coordinate system
    this._camera = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 1000);
    this._camera.position.z = 500;

    // Scene layers
    this._bgLayer = new THREE.Group();
    this._worldLayer = new THREE.Group();
    this._hudLayer = new THREE.Group();
    this._scene.add(this._bgLayer);
    this._scene.add(this._worldLayer);
    this._scene.add(this._hudLayer);

    // Lighting
    this._setupLighting();

    // Resize
    this._resize();
    this._resizeHandler = () => this._resize();
    window.addEventListener('resize', this._resizeHandler);
  }

  _setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    this._scene.add(ambient);

    this._sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this._sunLight.position.set(200, -300, 400);
    this._scene.add(this._sunLight);
  }

  _resize() {
    const rect = this._container.getBoundingClientRect();

    const REFERENCE_WIDTH = 700;
    const MIN_SCALE = 0.5;
    this.gameScale = Math.max(MIN_SCALE, Math.min(1, rect.width / REFERENCE_WIDTH));

    this.displayWidth = rect.width / this.gameScale;
    this.displayHeight = rect.height / this.gameScale;

    this._webglRenderer.setSize(rect.width, rect.height);

    // Frustum matches virtual game-world dims (y-down)
    this._camera.left = 0;
    this._camera.right = this.displayWidth;
    this._camera.top = 0;
    this._camera.bottom = this.displayHeight;
    this._camera.updateProjectionMatrix();
  }

  setTheme(theme) {
    if (this.theme && this.theme.detachFromScene) {
      this.theme.detachFromScene(this._bgLayer, this._worldLayer, this._hudLayer);
    }
    this.theme = theme;
    if (theme && theme.attachToScene) {
      theme.attachToScene(this._bgLayer, this._worldLayer, this._hudLayer);
    }
  }

  /** Set camera target to follow character. */
  followCharacter(character) {
    const targetX = character.x + character.width / 2 - this.displayWidth / 2;
    this.cameraTargetX = targetX;
    const targetY = character.y + character.height / 2 - this.displayHeight / 2;
    this.cameraTargetY = targetY;
  }

  /** Smooth camera update (identical math to Renderer.js). */
  updateCamera(dt) {
    const smoothing = 5;
    this.cameraX += (this.cameraTargetX - this.cameraX) * smoothing * dt;
    this.cameraY += (this.cameraTargetY - this.cameraY) * smoothing * dt;
  }

  /** Draw one frame. */
  draw(character, visiblePlatforms, options = {}) {
    if (!this.theme) return;

    const { bgTransition, planetIndex, ghosts, planet, sliding, personalBestIndex, power } =
      options;

    // Delegate visual updates to theme
    if (this.theme.updateFrame) {
      this.theme.updateFrame(
        character,
        visiblePlatforms,
        {
          bgTransition,
          planetIndex,
          ghosts,
          planet,
          sliding,
          personalBestIndex,
          power,
        },
        {
          cameraX: this.cameraX,
          cameraY: this.cameraY,
          displayWidth: this.displayWidth,
          displayHeight: this.displayHeight,
        },
      );
    }

    // Camera offset on world layer only (bg and hud stay screen-fixed)
    this._worldLayer.position.x = -this.cameraX;
    this._worldLayer.position.y = -this.cameraY;

    // Atmosphere tint overlay for dense-atmosphere planets
    const atmoPlanet =
      planet ||
      (planetIndex != null
        ? PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)]
        : null);
    if (this.theme.updateAtmosphere) {
      this.theme.updateAtmosphere(atmoPlanet, this.displayWidth, this.displayHeight);
    }

    this._webglRenderer.render(this._scene, this._camera);
  }

  /** Check if character has fallen off screen. */
  isOffScreen(character) {
    return character.y - this.cameraY > this.displayHeight + 100;
  }

  destroy() {
    window.removeEventListener('resize', this._resizeHandler);
    this._webglRenderer.dispose();
    this._canvas3d.remove();
    this._canvas2d.style.display = '';
  }
}
