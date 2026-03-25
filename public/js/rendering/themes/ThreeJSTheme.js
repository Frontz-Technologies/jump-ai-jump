import * as THREE from 'three';
import { ThemeBase } from './ThemeBase.js';
import { PLANET_CONFIGS } from '../../data/PlanetConfig.js';
import { PlatformRenderer } from '../threejs/PlatformRenderer.js';

/**
 * Three.js theme — foundation stub.
 * Renders platforms, character, and ghosts as colored 3D boxes.
 * Subsequent issues will add sprites, textures, and environments.
 */
export class ThreeJSTheme extends ThemeBase {
  constructor() {
    super();

    this._bgLayer = null;
    this._worldLayer = null;
    this._hudLayer = null;

    // Shared geometry (reused across all meshes)
    this._boxGeom = new THREE.BoxGeometry(1, 1, 1);

    // Materials
    this._characterMaterial = new THREE.MeshStandardMaterial({ color: 0xe85d4a });
    this._ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaff,
      transparent: true,
      opacity: 0.4,
    });

    // Meshes (created in attachToScene)
    this._characterMesh = null;
    this._platformRenderer = null;
    this._ghostMeshes = [];

    // Atmosphere overlay
    this._atmoMesh = null;
    this._atmoMaterial = null;

    // Theme interface state (mirrors PlanetaryTheme)
    this.stagePalettes = null;
    this._currentBg = '#87CEEB';
    this._planetIndex = 0;
  }

  // --- Theme interface methods (called by Game.js) ---

  initStagePalettes(count = 10, planets) {
    const source = planets || PLANET_CONFIGS;
    this.stagePalettes = source.slice(0, count).map((p) => ({
      bg: p.skyColor,
      platform: p.platformColor,
      stroke: p.platformStroke,
    }));
    this._currentBg = this.stagePalettes[0].bg;
  }

  getCurrentBg() {
    return this._currentBg;
  }

  setCurrentBg(color) {
    this._currentBg = color;
  }

  setPlanetIndex(index) {
    this._planetIndex = index;
  }

  /** Called by ThreeJSRenderer.setTheme() — add persistent meshes to layers. */
  attachToScene(bgLayer, worldLayer, hudLayer, scene) {
    this._bgLayer = bgLayer;
    this._worldLayer = worldLayer;
    this._hudLayer = hudLayer;
    this._scene = scene;

    // Character mesh (simple box — will be replaced with sprite later)
    this._characterMesh = new THREE.Mesh(this._boxGeom, this._characterMaterial);
    worldLayer.add(this._characterMesh);

    // Platforms
    this._platformRenderer = new PlatformRenderer();
    this._platformRenderer.attachTo(worldLayer);

    // Atmosphere overlay (screen-space, in hud layer)
    const atmoGeom = new THREE.PlaneGeometry(1, 1);
    this._atmoMaterial = new THREE.MeshBasicMaterial({
      color: 0xc8a050,
      transparent: true,
      opacity: 0,
      depthTest: false,
    });
    this._atmoMesh = new THREE.Mesh(atmoGeom, this._atmoMaterial);
    this._atmoMesh.position.z = 10;
    hudLayer.add(this._atmoMesh);
  }

  /** Called when switching away from this theme. Disposes GPU resources. */
  detachFromScene(_bgLayer, worldLayer, hudLayer) {
    if (this._characterMesh) worldLayer.remove(this._characterMesh);
    if (this._platformRenderer) this._platformRenderer.dispose();
    for (const mesh of this._ghostMeshes) {
      worldLayer.remove(mesh);
    }
    if (this._atmoMesh) {
      hudLayer.remove(this._atmoMesh);
      this._atmoMesh.geometry.dispose();
    }

    this._platformRenderer = null;
    this._ghostMeshes = [];

    // Dispose shared GPU resources
    this._boxGeom.dispose();
    this._characterMaterial.dispose();
    this._ghostMaterial.dispose();
    this._scene = null;
    if (this._atmoMaterial) this._atmoMaterial.dispose();
  }

  /**
   * Update all Three.js meshes to reflect current game state.
   * Called by ThreeJSRenderer.draw() each frame.
   */
  updateFrame(character, visiblePlatforms, options, camera) {
    const { displayWidth, displayHeight } = camera;
    const { bgTransition, ghosts, personalBestIndex, planetIndex } = options;

    this._planetIndex = planetIndex ?? this._planetIndex;

    this._updateBackground(displayWidth, displayHeight, bgTransition, planetIndex);
    this._updatePlatforms(visiblePlatforms, personalBestIndex);
    this._updateCharacter(character);
    this._updateGhosts(ghosts || []);
  }

  /** Update atmosphere tint overlay for dense planets. */
  updateAtmosphere(planet, displayWidth, displayHeight) {
    if (!this._atmoMesh) return;

    this._atmoMesh.scale.set(displayWidth, displayHeight, 1);
    this._atmoMesh.position.x = displayWidth / 2;
    this._atmoMesh.position.y = displayHeight / 2;

    if (!planet || planet.airDensity < 5.0) {
      this._atmoMaterial.opacity = 0;
      return;
    }

    if (planet.body === 'venus' || planet.bodyType === 'hazy') {
      this._atmoMaterial.color.setHex(0xc8a050);
      this._atmoMaterial.opacity = 0.06;
    } else if (planet.body === 'titan') {
      this._atmoMaterial.color.setHex(0xb4783c);
      this._atmoMaterial.opacity = 0.06;
    } else {
      this._atmoMaterial.opacity = 0;
    }
  }

  _updateBackground(_w, _h, transition, planetIndex) {
    if (!this._scene) return;

    // Use planet sky color if available
    if (transition && transition.skyColor) {
      this._scene.background.set(transition.skyColor);
    } else if (planetIndex != null) {
      const planet = PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)];
      if (planet && planet.skyColor) {
        this._scene.background.set(planet.skyColor);
      }
    }
  }

  _updatePlatforms(visiblePlatforms, personalBestIndex) {
    if (this._platformRenderer) {
      this._platformRenderer.sync(visiblePlatforms, this._planetIndex, personalBestIndex);
    }
  }

  _updateCharacter(character) {
    if (!this._characterMesh || !character) return;
    this._characterMesh.position.set(
      character.x + character.width / 2,
      character.y + character.height / 2,
      5,
    );
    this._characterMesh.scale.set(
      character.width * (character.scaleX || 1),
      character.height * (character.scaleY || 1),
      character.width,
    );
  }

  _updateGhosts(ghosts) {
    // Grow pool if needed
    while (this._ghostMeshes.length < ghosts.length) {
      const mesh = new THREE.Mesh(this._boxGeom, this._ghostMaterial);
      mesh.visible = false;
      if (this._worldLayer) this._worldLayer.add(mesh);
      this._ghostMeshes.push(mesh);
    }

    // Hide all, then show active
    for (const m of this._ghostMeshes) m.visible = false;
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      const mesh = this._ghostMeshes[i];
      mesh.visible = true;
      mesh.position.set(g.x + g.width / 2, g.y + g.height / 2, 3);
      mesh.scale.set(g.width, g.height, g.width);
    }
  }

  // Canvas ThemeBase stubs (no-ops for 3D renderer)
  drawBackground() {}
  drawPlatform() {}
  drawCharacter() {}
  drawThoughtBubble() {}
  drawDeathWall() {}
  drawGhostCharacter() {}
}
