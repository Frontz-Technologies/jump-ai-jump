import * as THREE from 'three';

/**
 * Sprite-based Three.js character renderer.
 * Loads pre-rendered sprite sheet textures for each pose and swaps them
 * based on game state. Eyes/pupils are baked into the sprite sheets.
 *
 * Sprite sheets: 512×128 (4 frames of 128×128), RGBA transparent PNG.
 */

const ASSET_BASE = '/assets/character/';
const STAR_EYE_COLOR = 0xffd700;
const AFTERIMAGE_COUNT = 4;

const FRAME_COUNT = 4;
const IDLE_FRAME_DURATION = 0.5;
const ACTION_FRAME_DURATION = 0.12;
const BLINK_FRAME_INDEX = 2;

// Sprite quad size in world units — larger than entity hitbox (40×40)
// because the sprite frame (128×128) has padding around the character
const SPRITE_W = 64;
const SPRITE_H = 64;

// Eye overlay positions (death X-eyes, victory star-eyes)
const EYE_OVERLAY_X = 9;
const EYE_OVERLAY_Y = -9;
const EYE_OVERLAY_Z = 2;

/** Pose names that map to sprite sheet files. */
const POSES = ['idle', 'charging', 'jumping', 'falling', 'landing'];

export class CharacterRenderer {
  constructor() {
    /** @type {THREE.Group} */
    this.group = new THREE.Group();

    this._textures = {};
    this._texturesReady = false;
    this._loadTextures();

    const geom = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H);
    this._spriteMat = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this._spriteMesh = new THREE.Mesh(geom, this._spriteMat);
    this.group.add(this._spriteMesh);

    this._deathEyeGroups = [];
    for (let side = -1; side <= 1; side += 2) {
      const xGroup = new THREE.Group();
      xGroup.position.set(side * EYE_OVERLAY_X, EYE_OVERLAY_Y, EYE_OVERLAY_Z);
      const xMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a });
      for (let r = 0; r < 2; r++) {
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.5), xMat);
        bar.rotation.z = r === 0 ? Math.PI / 4 : -Math.PI / 4;
        xGroup.add(bar);
      }
      xGroup.visible = false;
      this.group.add(xGroup);
      this._deathEyeGroups.push(xGroup);
    }

    this._starEyeGroups = [];
    for (let side = -1; side <= 1; side += 2) {
      const starGroup = new THREE.Group();
      starGroup.position.set(side * EYE_OVERLAY_X, EYE_OVERLAY_Y, EYE_OVERLAY_Z);
      const starMesh = this._createStarMesh(4, STAR_EYE_COLOR);
      starGroup.add(starMesh);
      starGroup.visible = false;
      this.group.add(starGroup);
      this._starEyeGroups.push(starGroup);
    }

    this._afterimages = [];
    this._afterGeom = new THREE.PlaneGeometry(SPRITE_W, SPRITE_H);
    for (let i = 0; i < AFTERIMAGE_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this._afterGeom, mat);
      mesh.visible = false;
      mesh.renderOrder = -1;
      this._afterimages.push({ mesh, mat });
    }

    this._currentPose = '';
    this._currentExpression = '';
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._lastTime = 0;
  }

  _loadTextures() {
    const loader = new THREE.TextureLoader();
    let pending = POSES.length;

    const onComplete = () => {
      pending--;
      if (pending <= 0) this._texturesReady = true;
    };

    const onError = (url) => {
      console.warn(`[CharacterRenderer] Failed to load texture: ${url}`);
      onComplete();
    };

    for (const pose of POSES) {
      const tex = loader.load(ASSET_BASE + pose + '.png', onComplete, undefined, () =>
        onError(ASSET_BASE + pose + '.png'),
      );
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / FRAME_COUNT, -1);
      tex.offset.set(0, 1);
      this._textures[pose] = tex;
    }
  }

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
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    return new THREE.Mesh(geom, mat);
  }

  /** @param {THREE.Group} parent */
  attachTo(parent) {
    parent.add(this.group);
    for (const ai of this._afterimages) {
      parent.add(ai.mesh);
    }
  }

  /** @param {THREE.Group} parent */
  detachFrom(parent) {
    parent.remove(this.group);
    for (const ai of this._afterimages) {
      parent.remove(ai.mesh);
    }
  }

  /**
   * Update character position, pose, expression, and effects.
   * @param {object} character - Character entity
   * @param {object} options - { power, time }
   */
  update(character, options = {}) {
    if (!character || !this._texturesReady) return;

    const { power = 0, time = 0 } = options;
    const dt = time - this._lastTime;
    this._lastTime = time;

    // Align sprite feet with entity bottom.
    // Feet are at row 124/128 of the sprite = 62/64 world units from sprite top.
    // Feet offset from sprite center = 62 - 32 = 30.
    // Entity feet offset from entity center = height/2 = 20.
    // So shift sprite up by 30 - 20 = 10 (negative in y-down).
    const feetInSprite = (124 / 128) * SPRITE_H - SPRITE_H / 2; // 30
    const feetInEntity = character.height / 2; // 20
    const spriteOffsetY = -(feetInSprite - feetInEntity);
    this.group.position.set(
      character.x + character.width / 2,
      character.y + character.height / 2 + spriteOffsetY,
      5,
    );

    const sx = character.scaleX || 1;
    const sy = character.scaleY || 1;
    this.group.scale.set(sx, sy, 1);

    const expression = this._resolveExpression(character, power);
    const pose = this._expressionToPose(expression);

    if (pose !== this._currentPose) {
      this._currentPose = pose;
      this._spriteMat.map = this._textures[pose] || null;
      this._spriteMat.needsUpdate = true;
      this._frameIndex = 0;
      this._frameTimer = 0;
    }

    const frameDuration = pose === 'idle' ? IDLE_FRAME_DURATION : ACTION_FRAME_DURATION;
    this._frameTimer += dt;
    if (this._frameTimer >= frameDuration) {
      this._frameTimer -= frameDuration;
      this._frameIndex = (this._frameIndex + 1) % FRAME_COUNT;
    }
    const tex = this._textures[pose];
    if (tex) {
      tex.offset.x = this._frameIndex / FRAME_COUNT;
    }

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

    this._updateExpression(expression);

    if (expression === 'charge-high') {
      this._spriteMesh.position.x = (Math.random() - 0.5) * 3;
      this._spriteMesh.position.y = (Math.random() - 0.5) * 3;
    } else {
      this._spriteMesh.position.x = 0;
      this._spriteMesh.position.y = 0;
    }

    this._updateBlink(character, expression);
    this._updateAfterimages(character, pose);
  }

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

  _updateExpression(expression) {
    if (expression === this._currentExpression) return;
    this._currentExpression = expression;

    for (const xg of this._deathEyeGroups) xg.visible = false;
    for (const sg of this._starEyeGroups) sg.visible = false;

    if (expression === 'death') {
      for (const xg of this._deathEyeGroups) xg.visible = true;
    } else if (expression === 'victory') {
      for (const sg of this._starEyeGroups) sg.visible = true;
    }
  }

  _updateBlink(character, expression) {
    if (
      character.blinkPhase > 0 &&
      !character.deathActive &&
      !character.victoryActive &&
      (expression === 'idle' || expression === 'sliding')
    ) {
      this._frameIndex = BLINK_FRAME_INDEX;
      const tex = this._textures[this._currentPose];
      if (tex) tex.offset.x = BLINK_FRAME_INDEX / FRAME_COUNT;
    }
  }

  _updateAfterimages(character, pose) {
    const positions = character.afterimagePositions || [];
    const tex = this._textures[pose];

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
        if (tex && ai.mat.map !== tex) {
          ai.mat.map = tex;
          ai.mat.needsUpdate = true;
        }
        ai.mat.opacity = img.opacity * 0.35;
      } else if (ai.mesh.visible) {
        ai.mesh.visible = false;
        ai.mat.opacity = 0;
      }
    }
  }

  dispose() {
    for (const key of Object.keys(this._textures)) {
      this._textures[key].dispose();
    }
    this._textures = {};

    if (this._afterGeom) this._afterGeom.dispose();

    const shared = new Set([this._afterGeom].filter(Boolean));
    this.group.traverse((obj) => {
      if (obj.geometry && !shared.has(obj.geometry)) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    for (const ai of this._afterimages) {
      if (ai.mat.map) ai.mat.map = null;
      ai.mat.dispose();
    }
  }
}
