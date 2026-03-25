import * as THREE from 'three';
import { PLANET_CONFIGS } from '../../data/PlanetConfig.js';

const POOL_SIZE = 50;

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

/**
 * Manages a pool of procedural platform meshes with 5 distinct surface types.
 * Each platform is a group containing a main slab and a shadow plane.
 */
export class PlatformRenderer {
  constructor() {
    // Shared geometries
    this._slabGeom = new THREE.BoxGeometry(1, 1, 1);
    this._topAccentGeom = new THREE.BoxGeometry(1, 0.3, 1);
    this._shadowGeom = new THREE.PlaneGeometry(1, 1);

    // Base materials for each surface type
    this._baseMaterials = {
      grass: this._makeGrass(),
      rocky: this._makeRocky(),
      crystal: this._makeCrystal(),
      metallic: this._makeMetallic(),
      volcanic: this._makeVolcanic(),
    };

    // Gold material for personal best
    this._bestMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0c050,
      emissive: 0xf0c050,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
    });

    // Shadow material
    this._shadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
    });

    // Tinted material cache: `surfaceType:hexColor` → material
    this._tintCache = new Map();

    // Pool
    this._pool = [];
    this._parent = null;
    this._currentSurface = 'grass';
    this._currentPlanetColor = null;
  }

  // --- Material factories ---

  _makeGrass() {
    return {
      top: new THREE.MeshStandardMaterial({
        color: 0x4a7c3f,
        roughness: 0.9,
        metalness: 0,
      }),
      sides: new THREE.MeshStandardMaterial({
        color: 0x8b4513,
        roughness: 0.95,
        metalness: 0,
      }),
    };
  }

  _makeRocky() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 1.0,
      metalness: 0.1,
      flatShading: true,
    });
    return { top: mat, sides: mat };
  }

  _makeCrystal() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x88ccee,
      roughness: 0.1,
      metalness: 0.3,
      transparent: true,
      opacity: 0.85,
    });
    return { top: mat, sides: mat };
  }

  _makeMetallic() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x555566,
      roughness: 0.2,
      metalness: 0.8,
    });
    return { top: mat, sides: mat };
  }

  _makeVolcanic() {
    return {
      top: new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.8,
        metalness: 0.2,
        emissive: 0xff4500,
        emissiveIntensity: 0.15,
      }),
      sides: new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.9,
        metalness: 0.1,
        emissive: 0xff4500,
        emissiveIntensity: 0.25,
      }),
    };
  }

  // --- Tinting ---

  _getSurfaceForPlanet(planetIndex) {
    const planet = PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)];
    if (!planet) return 'grass';
    return BODY_TO_SURFACE[planet.body] || BODY_TO_SURFACE[planet.bodyType] || 'rocky';
  }

  _getTintedMaterial(surfaceType, planetColor) {
    if (!planetColor) return this._baseMaterials[surfaceType];

    const key = `${surfaceType}:${planetColor}`;
    if (this._tintCache.has(key)) return this._tintCache.get(key);

    const base = this._baseMaterials[surfaceType];
    const tintColor = new THREE.Color(planetColor);

    const tinted = {
      top: base.top.clone(),
      sides: base.sides === base.top ? null : base.sides.clone(),
    };
    tinted.top.color.multiply(tintColor);
    if (tinted.sides) {
      tinted.sides.color.multiply(tintColor);
    } else {
      tinted.sides = tinted.top;
    }

    this._tintCache.set(key, tinted);
    return tinted;
  }

  // --- Pool management ---

  attachTo(parentGroup) {
    this._parent = parentGroup;

    for (let i = 0; i < POOL_SIZE; i++) {
      const group = new THREE.Group();
      group.visible = false;

      // Main slab — uses multi-material via face groups
      const slab = new THREE.Mesh(this._slabGeom, this._baseMaterials.grass.top);
      slab.name = 'slab';
      group.add(slab);

      // Top face accent (thin box on top for grass-type two-tone effect)
      const topAccent = new THREE.Mesh(this._topAccentGeom, this._baseMaterials.grass.top);
      topAccent.name = 'topAccent';
      topAccent.position.y = -0.35; // y-down: negative is up
      group.add(topAccent);

      // Shadow plane
      const shadow = new THREE.Mesh(this._shadowGeom, this._shadowMaterial);
      shadow.name = 'shadow';
      shadow.position.y = 6; // below the platform (y-down)
      shadow.position.z = -1;
      shadow.scale.set(0.9, 1, 1);
      group.add(shadow);

      parentGroup.add(group);
      this._pool.push(group);
    }
  }

  /** Sync pool with visible platforms. */
  sync(visiblePlatforms, planetIndex, personalBestIndex) {
    const surfaceType = this._getSurfaceForPlanet(planetIndex);
    const planet = PLANET_CONFIGS[Math.min(planetIndex, PLANET_CONFIGS.length - 1)];
    const planetColor = planet ? planet.platformColor : null;
    const materials = this._getTintedMaterial(surfaceType, planetColor);

    // Hide all
    for (const g of this._pool) g.visible = false;

    for (let i = 0; i < visiblePlatforms.length && i < this._pool.length; i++) {
      const { platform: p, index } = visiblePlatforms[i];
      const group = this._pool[i];
      group.visible = true;

      // Position and scale
      group.position.set(p.x + p.width / 2, p.y + p.height / 2 + (p.animOffset || 0), 0);

      const slab = group.children[0]; // slab
      slab.scale.set(p.width, p.height, 12);

      const topAccent = group.children[1]; // top accent
      const showTwoTone = surfaceType === 'grass' || surfaceType === 'volcanic';
      topAccent.visible = showTwoTone;
      if (showTwoTone) {
        topAccent.scale.set(p.width, p.height * 0.3, 12.1);
        topAccent.position.y = -p.height * 0.35;
      }

      const shadow = group.children[2]; // shadow
      shadow.scale.set(p.width * 0.9, 4, 1);
      shadow.position.y = p.height / 2 + 5;

      // Material assignment
      if (index === personalBestIndex) {
        slab.material = this._bestMaterial;
        if (showTwoTone) topAccent.material = this._bestMaterial;
      } else {
        slab.material = materials.sides;
        if (showTwoTone) topAccent.material = materials.top;
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
    this._topAccentGeom.dispose();
    this._shadowGeom.dispose();

    // Dispose base materials
    for (const mats of Object.values(this._baseMaterials)) {
      mats.top.dispose();
      if (mats.sides !== mats.top) mats.sides.dispose();
    }

    // Dispose tint cache
    for (const mats of this._tintCache.values()) {
      mats.top.dispose();
      if (mats.sides !== mats.top) mats.sides.dispose();
    }
    this._tintCache.clear();

    this._bestMaterial.dispose();
    this._shadowMaterial.dispose();
  }
}
