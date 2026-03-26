import * as THREE from 'three';

/**
 * Sprite-based Three.js character renderer.
 * Loads pre-rendered sprite sheet textures for each pose and swaps them
 * based on game state. Pupils are rendered as separate quads on top of
 * the sprite for dynamic eye tracking. Helmet variants are separate
 * sprite sheets swapped per planet.
 *
 * Sprite sheets: 512×128 (4 frames of 128×128), RGBA transparent PNG.
 * Blank white eyes — pupils drawn in realtime.
 */

const ASSET_BASE = '/assets/character/';
const PUPIL_COLOR = 0x2a2a2a;
const STAR_EYE_COLOR = 0xffd700;
const AFTERIMAGE_COUNT = 4;

// Animation: 4 frames per sheet, cycle rate in seconds
const FRAME_COUNT = 4;
const IDLE_FRAME_DURATION = 0.25;
const ACTION_FRAME_DURATION = 0.12;

// Sprite quad size in world units (matches old 40×40 body roughly)
const SPRITE_W = 48;
const SPRITE_H = 48;

// Pupil positioning relative to sprite center (tuned to sprite eye locations)
const EYE_OFFSET_X = 6; // distance from center to each eye
const EYE_OFFSET_Y = 2; // eyes slightly above center
const PUPIL_RADIUS = 2.5;
const PUPIL_Z = 1; // in front of sprite

/** Pose names that map to sprite sheet files. */
const POSES = ['idle', 'charging', 'jumping', 'falling', 'landing'];

export class CharacterRenderer {
  constructor() {
    /** @type {THREE.Group} */
    this.group = new THREE.Group();

    // --- Sprite textures (loaded async) ---
    this._textures = {}; // { 'idle': tex, 'idle-helmet': tex, ... }
    this._texturesReady = false;
    this._loadTextures();

    // --- Main sprite quad ---
    const geom = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H);
    this._spriteMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._spriteMesh = new THREE.Mesh(geom, this._spriteMat);
    this.group.add(this._spriteMesh);

    // --- Pupil overlays (two small circles) ---
    this._pupils = [];
    const pupilGeom = new THREE.CircleGeometry(PUPIL_RADIUS, 12);
    for (let side = -1; side <= 1; side += 2) {
      const mat = new THREE.MeshBasicMaterial({
        color: PUPIL_COLOR,
        transparent: true,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(pupilGeom, mat);
      mesh.position.set(side * EYE_OFFSET_X, EYE_OFFSET_Y, PUPIL_Z);
      this.group.add(mesh);
      this._pupils.push({ mesh, mat, side });
    }

    // --- Death X-eyes overlay ---
    this._deathEyeGroups = [];
    for (let side = -1; side <= 1; side += 2) {
      const xGroup = new THREE.Group();
      xGroup.position.set(side * EYE_OFFSET_X, EYE_OFFSET_Y, PUPIL_Z);
      const xMat = new THREE.MeshBasicMaterial({ color: PUPIL_COLOR });
      for (let r = 0; r < 2; r++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.5), xMat);
        bar.rotation.z = r === 0 ? Math.PI / 4 : -Math.PI / 4;
        xGroup.add(bar);
      }
      xGroup.visible = false;
      this.group.add(xGroup);
      this._deathEyeGroups.push(xGroup);
    }

    // --- Victory star-eyes overlay ---
    this._starEyeGroups = [];
    for (let side = -1; side <= 1; side += 2) {
      const starGroup = new THREE.Group();
      starGroup.position.set(side * EYE_OFFSET_X, EYE_OFFSET_Y, PUPIL_Z);
      const starMesh = this._createStarMesh(4, STAR_EYE_COLOR);
      starGroup.add(starMesh);
      starGroup.visible = false;
      this.group.add(starGroup);
      this._starEyeGroups.push(starGroup);
    }

    // --- Afterimage trail ---
    this._afterimages = [];
    const afterGeom = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H);
    for (let i = 0; i < AFTERIMAGE_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(afterGeom, mat);
      mesh.visible = false;
      mesh.renderOrder = -1;
      this._afterimages.push({ mesh, mat });
    }

    // Track state
    this._currentPose = '';
    this._currentExpression = '';
    this._currentHelmet = false;
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._lastTime = 0;
  }

  /** Load all sprite sheet textures. */
  _loadTextures() {
    const loader = new THREE.TextureLoader();
    let pending = POSES.length * 2;

    const onLoad = () => {
      pending--;
      if (pending <= 0) this._texturesReady = true;
    };

    for (const pose of POSES) {
      // No helmet
      const tex = loader.load(ASSET_BASE + pose + '.png', onLoad);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      // Show only first frame by default
      tex.repeat.set(0.25, 1);
      tex.offset.set(0, 0);
      this._textures[pose] = tex;

      // Helmet variant
      const helmetTex = loader.load(ASSET_BASE + pose + '-helmet.png', onLoad);
      helmetTex.magFilter = THREE.NearestFilter;
      helmetTex.minFilter = THREE.NearestFilter;
      helmetTex.colorSpace = THREE.SRGBColorSpace;
      helmetTex.repeat.set(0.25, 1);
      helmetTex.offset.set(0, 0);
      this._textures[pose + '-helmet'] = helmetTex;
    }
  }

  /** Create a 5-pointed star mesh for victory eyes. */
  _createStarMesh(radius, color) {
    const shape = new THREE.Shape();
    const points = 5;
    const innerR = radius * 0.4;
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? radius : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geom = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Attach this character's meshes to a parent group.
   * @param {THREE.Group} parent
   */
  attachTo(parent) {
    parent.add(this.group);
    for (const ai of this._afterimages) {
      parent.add(ai.mesh);
    }
  }

  /**
   * Detach from parent group.
   * @param {THREE.Group} parent
   */
  detachFrom(parent) {
    parent.remove(this.group);
    for (const ai of this._afterimages) {
      parent.remove(ai.mesh);
    }
  }

  /**
   * Update character position, pose, expression, and effects.
   * @param {object} character - Character entity
   * @param {object} options - { planetIndex, power, time }
   */
  update(character, options = {}) {
    if (!character || !this._texturesReady) return;

    const { planetIndex = 0, power = 0, time = 0 } = options;
    const dt = time - this._lastTime;
    this._lastTime = time;

    // --- Position ---
    this.group.position.set(
      character.x + character.width / 2,
      character.y + character.height / 2,
      5,
    );

    // --- Squash/Stretch ---
    const sx = character.scaleX || 1;
    const sy = character.scaleY || 1;
    this.group.scale.set(sx, sy, 1);

    // --- Determine expression and pose ---
    const expression = this._resolveExpression(character, power);
    const pose = this._expressionToPose(expression);
    const useHelmet = planetIndex > 0;

    // --- Swap sprite texture if pose/helmet changed ---
    const texKey = useHelmet ? pose + '-helmet' : pose;
    if (pose !== this._currentPose || useHelmet !== this._currentHelmet) {
      this._currentPose = pose;
      this._currentHelmet = useHelmet;
      this._spriteMat.map = this._textures[texKey] || null;
      this._spriteMat.needsUpdate = true;
      // Reset animation frame
      this._frameIndex = 0;
      this._frameTimer = 0;
    }

    // --- Frame animation ---
    const frameDuration = pose === 'idle' ? IDLE_FRAME_DURATION : ACTION_FRAME_DURATION;
    this._frameTimer += dt;
    if (this._frameTimer >= frameDuration) {
      this._frameTimer -= frameDuration;
      this._frameIndex = (this._frameIndex + 1) % FRAME_COUNT;
    }
    // Update UV offset to show current frame
    const tex = this._textures[texKey];
    if (tex) {
      tex.offset.x = this._frameIndex * 0.25;
    }

    // --- Death transform ---
    if (character.deathActive) {
      const deathT = character.deathTimer;
      this.group.rotation.z = deathT * 8;
      const deathScale = Math.max(0.1, 1 - deathT * 0.8);
      this.group.scale.multiplyScalar(deathScale);
      this._spriteMat.opacity = Math.max(0, 1 - deathT * 0.7);
    } else {
      this.group.rotation.z = 0;
      this._spriteMat.opacity = 1;
    }

    // --- Update pupils / overlays ---
    this._updateExpression(expression, character, time);

    // --- Charge shake ---
    if (expression === 'charge-high') {
      this._spriteMesh.position.x = (Math.random() - 0.5) * 3;
      this._spriteMesh.position.y = (Math.random() - 0.5) * 3;
    } else {
      this._spriteMesh.position.x = 0;
      this._spriteMesh.position.y = 0;
    }

    // --- Blink ---
    this._updateBlink(character, expression);

    // --- Afterimage trail ---
    this._updateAfterimages(character, texKey);
  }

  /**
   * Resolve expression string from character state.
   */
  _resolveExpression(character, power) {
    if (character.deathActive) return 'death';
    if (character.victoryActive) return 'victory';

    switch (character.state) {
      case 'CHARGING':
        if (power > 0.66) return 'charge-high';
        if (power > 0.33) return 'charge-mid';
        return 'charge-low';
      case 'AIRBORNE':
        if (character.vy < -50) return 'rising';
        if (character.vy > 150) return 'falling';
        return 'peak';
      case 'SLIDING':
        return 'sliding';
      default:
        if (character.landingImpact > 0.3) return 'landing';
        return 'idle';
    }
  }

  /** Map expression to sprite sheet pose name. */
  _expressionToPose(expression) {
    switch (expression) {
      case 'charge-low':
      case 'charge-mid':
      case 'charge-high':
        return 'charging';
      case 'rising':
      case 'peak':
        return 'jumping';
      case 'falling':
      case 'sliding':
        return 'falling';
      case 'landing':
        return 'landing';
      case 'death':
      case 'victory':
      case 'idle':
      default:
        return 'idle';
    }
  }

  /**
   * Update pupil positions, death/victory overlays based on expression.
   */
  _updateExpression(expression, character, _time) {
    const needsUpdate = expression !== this._currentExpression || expression === 'idle';
    if (!needsUpdate && expression !== 'charge-high') return;
    this._currentExpression = expression;

    // Reset overlays
    for (const xg of this._deathEyeGroups) xg.visible = false;
    for (const sg of this._starEyeGroups) sg.visible = false;

    let pupilOffX = 0;
    let pupilOffY = 0;
    let pupilScale = 1;
    let showPupils = true;

    switch (expression) {
      case 'death':
        showPupils = false;
        for (const xg of this._deathEyeGroups) xg.visible = true;
        break;
      case 'victory':
        showPupils = false;
        for (const sg of this._starEyeGroups) sg.visible = true;
        break;
      case 'idle':
        pupilOffX = (character.pupilDriftX || 0) * 0.3;
        pupilOffY = (character.pupilDriftY || 0) * 0.3;
        break;
      case 'charge-low':
        pupilScale = 0.8;
        break;
      case 'charge-mid':
        pupilScale = 0.6;
        break;
      case 'charge-high':
        pupilScale = 0.4;
        pupilOffX = (Math.random() - 0.5) * 1.2;
        pupilOffY = (Math.random() - 0.5) * 1.2;
        break;
      case 'rising':
        pupilOffY = -0.5;
        break;
      case 'peak':
        pupilOffY = 0.6;
        break;
      case 'falling':
        pupilScale = 0.7;
        pupilOffY = 0.5;
        break;
      case 'sliding':
        pupilOffX = character._slideVx > 0 ? 0.6 : character._slideVx < 0 ? -0.6 : 0;
        break;
      case 'landing':
        pupilScale = 0.8;
        break;
      default:
        break;
    }

    for (const pupil of this._pupils) {
      pupil.mesh.visible = showPupils;
      if (showPupils) {
        pupil.mesh.position.x = pupil.side * EYE_OFFSET_X + pupilOffX;
        pupil.mesh.position.y = EYE_OFFSET_Y + pupilOffY;
        pupil.mesh.scale.setScalar(pupilScale);
      }
    }
  }

  /**
   * Eye blink — hide pupils briefly.
   * The sprite sheet frame 3 already has closed eyes, so we just need
   * to force frame 3 and hide pupils during blink.
   */
  _updateBlink(character, expression) {
    if (
      character.blinkPhase > 0 &&
      !character.deathActive &&
      !character.victoryActive &&
      (expression === 'idle' || expression === 'sliding')
    ) {
      // Force the blink frame (frame index 2 = third frame with closed eyes)
      this._frameIndex = 2;
      const texKey = this._currentHelmet ? this._currentPose + '-helmet' : this._currentPose;
      const tex = this._textures[texKey];
      if (tex) tex.offset.x = 2 * 0.25;

      // Hide pupils during blink
      const halfDur = 0.075;
      const bp = character.blinkPhase;
      const blinkScale = bp > halfDur ? (bp - halfDur) / halfDur : 1 - bp / halfDur;
      for (const pupil of this._pupils) {
        pupil.mesh.visible = blinkScale > 0.3;
      }
    }
  }

  /**
   * Update afterimage trail meshes using sprite texture.
   */
  _updateAfterimages(character, texKey) {
    const positions = character.afterimagePositions || [];
    const tex = this._textures[texKey];

    for (let i = 0; i < AFTERIMAGE_COUNT; i++) {
      const ai = this._afterimages[i];
      if (i < positions.length) {
        const img = positions[i];
        ai.mesh.visible = true;
        ai.mesh.position.set(
          img.x + character.width / 2,
          img.y + character.height / 2,
          4 - i * 0.5,
        );
        ai.mesh.scale.set(img.scaleX || 1, img.scaleY || 1, 1);
        // Use current sprite texture for afterimages
        if (tex && ai.mat.map !== tex) {
          ai.mat.map = tex;
          ai.mat.needsUpdate = true;
        }
        ai.mat.opacity = img.opacity * 0.35;
      } else {
        ai.mesh.visible = false;
        ai.mat.opacity = 0;
      }
    }
  }

  /**
   * Dispose all GPU resources.
   */
  dispose() {
    // Dispose textures
    for (const key of Object.keys(this._textures)) {
      this._textures[key].dispose();
    }
    this._textures = {};

    // Dispose meshes in group
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });

    // Dispose afterimage materials
    for (const ai of this._afterimages) {
      if (ai.mat.map) ai.mat.map = null;
      ai.mat.dispose();
      ai.mesh.geometry.dispose();
    }
  }
}
