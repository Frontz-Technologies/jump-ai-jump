import * as THREE from 'three';
import { PLANET_CONFIGS } from '../../data/PlanetConfig.js';

const POOL_SIZE = 50;
const TILE_SIZE = 128;
const ASSET_BASE = '/assets/platform/';

/** Map planet body names to surface types. */
const BODY_TO_SURFACE = {
  earth: 'grass',
  earth_like: 'grass',
  moon: 'rocky',
  mercury: 'rocky',
  rocky: 'rocky',
  barren: 'rocky',
  mars: 'volcanic',
  venus: 'volcanic',
  volcanic: 'volcanic',
  exotic: 'volcanic',
  stratosphere: 'metallic',
  titan: 'metallic',
  gas_giant: 'metallic',
  hazy: 'metallic',
  jupiter: 'metallic',
  europa: 'crystal',
  pluto: 'crystal',
  icy: 'crystal',
};

const SURFACE_TYPES = ['grass', 'rocky', 'crystal', 'metallic', 'volcanic'];

/**
 * Manages a pool of textured platform meshes with 5 surface types.
 * Each platform tile is repeated horizontally to fill variable-width platforms.
 */
export class PlatformRenderer {
  constructor() {
    this._slabGeom = new THREE.PlaneGeometry(1, 1);
    this._shadowGeom = new THREE.PlaneGeometry(1, 1);

    this._textures = {};
    this._texturesReady = false;
    this._loadTextures();

    // Gold material for personal best platform
    this._bestMaterial = new THREE.MeshBasicMaterial({
      color: 0xf0c050,
      side: THREE.DoubleSide,
    });

    this._shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });

    // Material cache: `surfaceType` → MeshBasicMaterial with tiled texture
    this._surfaceMaterials = {};

    this._pool = [];
    this._parent = null;
    this._currentSurface = '';
  }

  _loadTextures() {
    const loader = new THREE.TextureLoader();
    let pending = SURFACE_TYPES.length;

    const onComplete = () => {
      pending--;
      if (pending <= 0) {
        this._texturesReady = true;
        this._buildSurfaceMaterials();
      }
    };

    const onError = (url) => {
      console.warn(`[PlatformRenderer] Failed to load texture: ${url}`);
      onComplete();
    };

    for (const type of SURFACE_TYPES) {
      const tex = loader.load(ASSET_BASE + type + '.png', onComplete, undefined, () =>
        onError(ASSET_BASE + type + '.png'),
      );
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      // Flip Y for y-down camera
      tex.repeat.set(1, -1);
      tex.offset.set(0, 1);
      this._textures[type] = tex;
    }
  }

  _buildSurfaceMaterials() {
    for (const type of SURFACE_TYPES) {
      const tex = this._textures[type];
      if (tex) {
        this._surfaceMaterials[type] = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      }
    }
  }

  _getSurfaceForPlanet(planetIndex) {
    const planet = PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)];
    if (!planet) return 'grass';
    return BODY_TO_SURFACE[planet.body] || BODY_TO_SURFACE[planet.bodyType] || 'rocky';
  }

  attachTo(parentGroup) {
    this._parent = parentGroup;

    for (let i = 0; i < POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const slab = new THREE.Mesh(this._slabGeom, this._bestMaterial);
      slab.name = 'slab';
      group.add(slab);

      const shadow = new THREE.Mesh(this._shadowGeom, this._shadowMaterial);
      shadow.name = 'shadow';
      shadow.position.y = 6;
      shadow.position.z = -1;
      group.add(shadow);

      parentGroup.add(group);
      this._pool.push(group);
    }
  }

  /** Sync pool with visible platforms. */
  sync(visiblePlatforms, planetIndex, personalBestIndex) {
    if (!this._texturesReady) return;

    const surfaceType = this._getSurfaceForPlanet(planetIndex);
    const material = this._surfaceMaterials[surfaceType];

    // Hide all
    for (const g of this._pool) g.visible = false;

    for (let i = 0; i < visiblePlatforms.length && i < this._pool.length; i++) {
      const { platform: p, index } = visiblePlatforms[i];
      const group = this._pool[i];
      group.visible = true;

      // Position
      group.position.set(p.x + p.width / 2, p.y + p.height / 2 + (p.animOffset || 0), 0);

      const slab = group.children[0];
      slab.scale.set(p.width, p.height, 1);

      // Set texture repeat based on platform width
      const tex = this._textures[surfaceType];
      if (tex) {
        const tilesX = p.width / TILE_SIZE;
        tex.repeat.set(tilesX, -1);
      }

      const shadow = group.children[1];
      shadow.scale.set(p.width * 0.9, 4, 1);
      shadow.position.y = p.height / 2 + 5;

      if (index === personalBestIndex) {
        slab.material = this._bestMaterial;
      } else if (material) {
        slab.material = material;
      }
    }
  }

  detachFrom(parentGroup) {
    for (const group of this._pool) {
      parentGroup.remove(group);
    }
    this._pool = [];
  }

  dispose() {
    if (this._parent) this.detachFrom(this._parent);

    this._slabGeom.dispose();
    this._shadowGeom.dispose();

    for (const key of Object.keys(this._textures)) {
      this._textures[key].dispose();
    }
    this._textures = {};

    for (const mat of Object.values(this._surfaceMaterials)) {
      mat.dispose();
    }
    this._surfaceMaterials = {};

    this._bestMaterial.dispose();
    this._shadowMaterial.dispose();
  }
}
