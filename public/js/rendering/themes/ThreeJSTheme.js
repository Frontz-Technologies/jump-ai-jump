import * as THREE from 'three';
import { ThemeBase } from './ThemeBase.js';
import { PLANET_CONFIGS } from '../../data/PlanetConfig.js';
import { PlatformRenderer } from '../threejs/PlatformRenderer.js';
import { CharacterRenderer } from '../threejs/CharacterRenderer.js';

/**
 * Three.js theme — procedural 3D rendering with expressive character.
 * Character rendered via CharacterRenderer with expressions, helmet, and afterimages.
 * Platforms rendered via PlatformRenderer with 5 surface types and per-planet tinting.
 */
export class ThreeJSTheme extends ThemeBase {
  constructor() {
    super();

    this._bgLayer = null;
    this._worldLayer = null;
    this._hudLayer = null;

    // Shared geometry (reused across ghost meshes)
    this._boxGeom = new THREE.BoxGeometry(1, 1, 1);

    // Materials
    this._ghostMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaff,
      transparent: true,
      opacity: 0.4,
    });

    // Renderers / meshes (created in attachToScene)
    this._characterRenderer = null;
    this._platformRenderer = null;
    this._ghostMeshes = [];

    // Atmosphere overlay
    this._atmoMesh = null;
    this._atmoMaterial = null;

    // Sky gradient background
    this._bgCanvas = null;
    this._bgCtx = null;
    this._bgTexture = null;
    this._currentSkyKey = '';

    // Theme interface state (mirrors PlanetaryTheme)
    this.stagePalettes = null;
    this._currentBg = '#87CEEB';
    this._planetIndex = 0;
    this._power = 0;
    this._startTime = performance.now() * 0.001;
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

    // Sky gradient background texture
    this._bgCanvas = document.createElement('canvas');
    this._bgCanvas.width = 1;
    this._bgCanvas.height = 256;
    this._bgCtx = this._bgCanvas.getContext('2d');
    this._bgTexture = new THREE.CanvasTexture(this._bgCanvas);
    this._bgTexture.colorSpace = THREE.SRGBColorSpace;
    this._scene.background = this._bgTexture;

    this._characterRenderer = new CharacterRenderer();
    this._characterRenderer.attachTo(worldLayer);

    // Platforms with 5 surface types and per-planet tinting
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
    if (this._characterRenderer) {
      this._characterRenderer.detachFrom(worldLayer);
      this._characterRenderer.dispose();
      this._characterRenderer = null;
    }
    if (this._platformRenderer) {
      this._platformRenderer.dispose();
      this._platformRenderer = null;
    }
    for (const ghost of this._ghostMeshes) {
      worldLayer.remove(ghost.mesh);
      ghost.mesh.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
      });
    }
    if (this._atmoMesh) {
      hudLayer.remove(this._atmoMesh);
      this._atmoMesh.geometry.dispose();
    }

    this._ghostMeshes = [];

    if (this._bgTexture) {
      this._bgTexture.dispose();
      this._bgTexture = null;
    }

    // Dispose shared GPU resources
    this._boxGeom.dispose();
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
    const { bgTransition, ghosts, personalBestIndex, planetIndex, power } = options;

    this._planetIndex = planetIndex ?? this._planetIndex;
    this._power = power ?? 0;

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

  /** Horizon colors per body type — paired with skyColor for gradients. */
  static HORIZON_COLORS = {
    earth: '#c8e8ff',
    earth_like: '#c8e8ff',
    stratosphere: '#000005',
    moon: '#1a1a1a',
    mars: '#8b3a0a',
    mercury: '#1a1a1a',
    venus: '#e8c848',
    volcanic: '#5a1a0a',
    titan: '#6b4020',
    hazy: '#6b4020',
    jupiter: '#a07850',
    gas_giant: '#a07850',
    europa: '#001030',
    pluto: '#0a0a20',
    icy: '#001030',
    rocky: '#1a1a1a',
    barren: '#1a1a1a',
    exotic: '#1a0030',
  };

  _updateBackground(_w, _h, transition, planetIndex) {
    if (!this._bgCtx) return;

    const skyColor = transition?.skyColor || this._getSkyColor(planetIndex);
    if (!skyColor || skyColor === this._currentSkyKey) return;
    this._currentSkyKey = skyColor;

    const planet = PLANET_CONFIGS[Math.min(planetIndex ?? 0, PLANET_CONFIGS.length - 1)];
    const body = planet?.body || planet?.bodyType || 'earth';
    const horizonColor = ThreeJSTheme.HORIZON_COLORS[body] || skyColor;

    const ctx = this._bgCtx;
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, skyColor);
    grad.addColorStop(1, horizonColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1, 256);

    this._bgTexture.needsUpdate = true;
  }

  _getSkyColor(planetIndex) {
    if (planetIndex == null) return '#87CEEB';
    const planet = PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)];
    return planet?.skyColor || '#87CEEB';
  }

  _updatePlatforms(visiblePlatforms, personalBestIndex) {
    if (this._platformRenderer) {
      this._platformRenderer.sync(visiblePlatforms, this._planetIndex, personalBestIndex);
    }
  }

  _updateCharacter(character) {
    if (!this._characterRenderer || !character) return;

    const time = performance.now() * 0.001 - this._startTime;
    this._characterRenderer.update(character, {
      power: this._power,
      time,
    });
  }

  _updateGhosts(ghosts) {
    // Grow ghost pool if needed — simplified body + eyes meshes
    while (this._ghostMeshes.length < ghosts.length) {
      const ghostObj = this._createGhostMesh();
      if (this._worldLayer) this._worldLayer.add(ghostObj.mesh);
      this._ghostMeshes.push(ghostObj);
    }

    // Hide all, then show active
    for (const g of this._ghostMeshes) g.mesh.visible = false;
    for (let i = 0; i < ghosts.length; i++) {
      const g = ghosts[i];
      const ghostObj = this._ghostMeshes[i];
      ghostObj.mesh.visible = true;
      ghostObj.mesh.position.set(g.x + (g.width || 40) / 2, g.y + (g.height || 40) / 2, 3);
      ghostObj.mesh.scale.set(g.scaleX || 1, g.scaleY || 1, 1);

      // Tint by hue if available
      if (g.hue != null) {
        ghostObj.bodyMat.color.setHSL(g.hue / 360, 0.6, 0.65);
      }
    }
  }

  /**
   * Create a simplified ghost character mesh (body + eyes, semi-transparent).
   */
  _createGhostMesh() {
    const group = new THREE.Group();

    // Body
    const bodyGeom = new THREE.BoxGeometry(40, 40, 16, 2, 2, 2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xaaaaff,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    group.add(bodyMesh);

    // Eyes (simple white spheres)
    const eyeGeom = new THREE.SphereGeometry(4, 8, 6);
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    });
    for (let side = -1; side <= 1; side += 2) {
      const eyeMesh = new THREE.Mesh(eyeGeom, eyeMat);
      eyeMesh.position.set(side * 7, -3, 9);
      eyeMesh.scale.set(1, 1, 0.5);
      group.add(eyeMesh);

      // Pupil
      const pupilGeom = new THREE.SphereGeometry(2, 8, 6);
      const pupilMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        transparent: true,
        opacity: 0.5,
      });
      const pupilMesh = new THREE.Mesh(pupilGeom, pupilMat);
      pupilMesh.position.set(side * 7, -3, 11);
      group.add(pupilMesh);
    }

    return { mesh: group, bodyMat };
  }

  // Canvas ThemeBase stubs (no-ops for 3D renderer)
  drawBackground() {}
  drawPlatform() {}
  drawCharacter() {}
  drawThoughtBubble() {}
  drawDeathWall() {}
  drawGhostCharacter() {}
}
