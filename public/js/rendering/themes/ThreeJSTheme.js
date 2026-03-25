import * as THREE from 'three';
import { ThemeBase } from './ThemeBase.js';

const PLATFORM_POOL_SIZE = 50;

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
    this._platformMaterial = new THREE.MeshStandardMaterial({ color: 0x6b8f71 });
    this._characterMaterial = new THREE.MeshStandardMaterial({ color: 0xe85d4a });
    this._ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaff,
      transparent: true,
      opacity: 0.4,
    });

    // Meshes (created in attachToScene)
    this._bgMesh = null;
    this._bgMaterial = null;
    this._characterMesh = null;
    this._platformPool = [];
    this._ghostMeshes = [];

    // Atmosphere overlay
    this._atmoMesh = null;
    this._atmoMaterial = null;
  }

  /** Called by ThreeJSRenderer.setTheme() — add persistent meshes to layers. */
  attachToScene(bgLayer, worldLayer, hudLayer) {
    this._bgLayer = bgLayer;
    this._worldLayer = worldLayer;
    this._hudLayer = hudLayer;

    // Background plane
    const bgGeom = new THREE.PlaneGeometry(1, 1);
    this._bgMaterial = new THREE.MeshBasicMaterial({ color: 0x87ceeb });
    this._bgMesh = new THREE.Mesh(bgGeom, this._bgMaterial);
    this._bgMesh.position.z = -10;
    bgLayer.add(this._bgMesh);

    // Character mesh (simple box — will be replaced with sprite later)
    this._characterMesh = new THREE.Mesh(this._boxGeom, this._characterMaterial);
    worldLayer.add(this._characterMesh);

    // Platform pool
    for (let i = 0; i < PLATFORM_POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(this._boxGeom, this._platformMaterial);
      mesh.visible = false;
      worldLayer.add(mesh);
      this._platformPool.push(mesh);
    }

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

  /** Called when switching away from this theme. */
  detachFromScene(bgLayer, worldLayer, hudLayer) {
    if (this._bgMesh) bgLayer.remove(this._bgMesh);
    if (this._characterMesh) worldLayer.remove(this._characterMesh);
    for (const mesh of this._platformPool) {
      worldLayer.remove(mesh);
    }
    for (const mesh of this._ghostMeshes) {
      worldLayer.remove(mesh);
    }
    if (this._atmoMesh) hudLayer.remove(this._atmoMesh);

    this._platformPool = [];
    this._ghostMeshes = [];
  }

  /**
   * Update all Three.js meshes to reflect current game state.
   * Called by ThreeJSRenderer.draw() each frame.
   */
  updateFrame(character, visiblePlatforms, options, camera) {
    const { displayWidth, displayHeight } = camera;
    const { bgTransition, ghosts, personalBestIndex, planetIndex } = options;

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

  _updateBackground(w, h, transition, planetIndex) {
    if (!this._bgMesh) return;

    this._bgMesh.scale.set(w, h, 1);
    this._bgMesh.position.x = w / 2;
    this._bgMesh.position.y = h / 2;

    // Use planet sky color if available
    if (transition && transition.skyColor) {
      this._bgMaterial.color.set(transition.skyColor);
    } else if (planetIndex != null) {
      // Import would be circular — use a simple lookup
      const skyColors = [
        0x87ceeb, // Earth
        0x0a0a2e, // Stratosphere
        0x000000, // Moon
        0xc1440e, // Mars
        0x1a1a1a, // Mercury
        0xb8860b, // Venus
        0xff8c00, // Titan
        0xd2691e, // Jupiter
        0x000011, // Europa
        0x000005, // Pluto
      ];
      const color = skyColors[Math.min(planetIndex, skyColors.length - 1)];
      this._bgMaterial.color.setHex(color);
    }
  }

  _updatePlatforms(visiblePlatforms, personalBestIndex) {
    // Hide all pool meshes
    for (const m of this._platformPool) m.visible = false;

    for (let i = 0; i < visiblePlatforms.length && i < this._platformPool.length; i++) {
      const { platform: p, index } = visiblePlatforms[i];
      const mesh = this._platformPool[i];
      mesh.visible = true;
      mesh.position.set(p.x + p.width / 2, p.y + p.height / 2, 0);
      mesh.scale.set(p.width, p.height, 12);

      // Highlight personal best platform
      if (index === personalBestIndex) {
        mesh.material =
          this._platformPool._bestMaterial ||
          (this._platformPool._bestMaterial = new THREE.MeshStandardMaterial({
            color: 0xf0c050,
            emissive: 0xf0c050,
            emissiveIntensity: 0.3,
          }));
      } else {
        mesh.material = this._platformMaterial;
      }
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
