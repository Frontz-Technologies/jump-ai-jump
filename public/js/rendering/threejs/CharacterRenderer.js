import * as THREE from 'three';

/**
 * Procedural Three.js character renderer.
 * Builds the character from geometry primitives (boxes, spheres)
 * matching the 2D PlanetaryTheme look: coral-red body, white eyes
 * with black pupils, small legs, expressive face, and space helmet.
 */

const BODY_COLOR = 0xe85d4a;
const BODY_STROKE_COLOR = 0xc94835;
const EYE_COLOR = 0xffffff;
const PUPIL_COLOR = 0x2a2a2a;
const MOUTH_COLOR = 0xc94835;
const LEG_COLOR = 0xe85d4a;
const LEG_STROKE_COLOR = 0xc94835;
const HELMET_COLOR = 0xffffff;
const EYEBROW_COLOR = 0xc94835;
const STAR_EYE_COLOR = 0xffd700;

const AFTERIMAGE_COUNT = 4;

export class CharacterRenderer {
  constructor() {
    /** @type {THREE.Group} */
    this.group = new THREE.Group();

    // --- Body ---
    const bodyGeom = this._makeRoundedBoxGeometry(40, 40, 20, 4);
    this._bodyMat = new THREE.MeshStandardMaterial({ color: BODY_COLOR });
    this._bodyMesh = new THREE.Mesh(bodyGeom, this._bodyMat);
    this._bodyMesh.position.z = 0;
    this.group.add(this._bodyMesh);

    // Darker edge outline (slightly larger, behind)
    const outlineGeom = this._makeRoundedBoxGeometry(43, 43, 18, 4);
    this._outlineMat = new THREE.MeshStandardMaterial({
      color: BODY_STROKE_COLOR,
    });
    this._outlineMesh = new THREE.Mesh(outlineGeom, this._outlineMat);
    this._outlineMesh.position.z = -1;
    this.group.add(this._outlineMesh);

    // --- Legs ---
    this._legs = [];
    const legGeom = this._makeRoundedBoxGeometry(10, 8, 10, 2);
    for (let side = -1; side <= 1; side += 2) {
      const legMat = new THREE.MeshStandardMaterial({ color: LEG_COLOR });
      const legMesh = new THREE.Mesh(legGeom, legMat);
      const legOutlineGeom = this._makeRoundedBoxGeometry(12, 9, 9, 2);
      const legOutlineMat = new THREE.MeshStandardMaterial({
        color: LEG_STROKE_COLOR,
      });
      const legOutlineMesh = new THREE.Mesh(legOutlineGeom, legOutlineMat);
      legOutlineMesh.position.z = -0.5;

      const legGroup = new THREE.Group();
      legGroup.add(legOutlineMesh);
      legGroup.add(legMesh);
      legGroup.position.x = side * 8;
      legGroup.position.y = 22; // below body
      legGroup.position.z = 0;
      this.group.add(legGroup);
      this._legs.push({ group: legGroup, mat: legMat, side });
    }

    // --- Eyes ---
    this._eyeGroups = [];
    for (let side = -1; side <= 1; side += 2) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 8, -4, 11);

      // Sclera (white sphere, slightly flattened)
      const scleraGeom = new THREE.SphereGeometry(6, 16, 12);
      const scleraMat = new THREE.MeshStandardMaterial({ color: EYE_COLOR });
      const scleraMesh = new THREE.Mesh(scleraGeom, scleraMat);
      scleraMesh.scale.set(1, 1, 0.5);
      eyeGroup.add(scleraMesh);

      // Pupil (small black sphere)
      const pupilGeom = new THREE.SphereGeometry(2.5, 12, 8);
      const pupilMat = new THREE.MeshStandardMaterial({ color: PUPIL_COLOR });
      const pupilMesh = new THREE.Mesh(pupilGeom, pupilMat);
      pupilMesh.position.z = 2.5;
      eyeGroup.add(pupilMesh);

      this.group.add(eyeGroup);
      this._eyeGroups.push({
        group: eyeGroup,
        sclera: scleraMesh,
        scleraMat,
        pupil: pupilMesh,
        pupilMat,
        side,
      });
    }

    // --- Mouth ---
    this._mouthGroup = new THREE.Group();
    this._mouthGroup.position.set(0, 8, 11);

    // Smile (torus arc)
    this._smileMesh = this._createSmileMesh();
    this._mouthGroup.add(this._smileMesh);

    // Scared mouth (open circle)
    const scaredGeom = new THREE.RingGeometry(2.5, 4, 16);
    this._scaredMat = new THREE.MeshStandardMaterial({
      color: MOUTH_COLOR,
      side: THREE.DoubleSide,
    });
    this._scaredMesh = new THREE.Mesh(scaredGeom, this._scaredMat);
    this._scaredMesh.visible = false;
    this._mouthGroup.add(this._scaredMesh);

    // Determined mouth (flat line)
    this._lineMouth = this._createLineMouth();
    this._lineMouth.visible = false;
    this._mouthGroup.add(this._lineMouth);

    this.group.add(this._mouthGroup);

    // --- Eyebrows (thin box meshes) ---
    this._eyebrows = [];
    for (let side = -1; side <= 1; side += 2) {
      const browGeom = new THREE.BoxGeometry(7, 1.5, 1);
      const browMat = new THREE.MeshStandardMaterial({ color: EYEBROW_COLOR });
      const browMesh = new THREE.Mesh(browGeom, browMat);
      browMesh.position.set(side * 8, -12, 11);
      browMesh.visible = false;
      this.group.add(browMesh);
      this._eyebrows.push({ mesh: browMesh, mat: browMat, side });
    }

    // --- Death X-eyes overlay ---
    this._deathEyeGroups = [];
    for (let side = -1; side <= 1; side += 2) {
      const xGroup = new THREE.Group();
      xGroup.position.set(side * 8, -4, 12);
      const xMat = new THREE.MeshStandardMaterial({ color: PUPIL_COLOR });
      for (let r = 0; r < 2; r++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(8, 1.5, 1), xMat);
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
      starGroup.position.set(side * 8, -4, 12);
      const starMesh = this._createStarMesh(5, STAR_EYE_COLOR);
      starGroup.add(starMesh);
      starGroup.visible = false;
      this.group.add(starGroup);
      this._starEyeGroups.push(starGroup);
    }

    // --- Helmet (semi-transparent dome) ---
    this._helmetGroup = new THREE.Group();
    const helmetGeom = new THREE.SphereGeometry(26, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
    this._helmetMat = new THREE.MeshStandardMaterial({
      color: HELMET_COLOR,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const helmetMesh = new THREE.Mesh(helmetGeom, this._helmetMat);
    helmetMesh.rotation.x = Math.PI; // dome faces upward
    helmetMesh.position.y = -5;
    helmetMesh.position.z = 2;
    this._helmetGroup.add(helmetMesh);

    // Helmet rim (torus at the base)
    const rimGeom = new THREE.TorusGeometry(22, 1.5, 8, 24);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const rimMesh = new THREE.Mesh(rimGeom, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 5;
    rimMesh.position.z = 2;
    this._helmetGroup.add(rimMesh);

    // Visor tint (subtle reflective strip)
    const visorGeom = new THREE.SphereGeometry(
      25,
      24,
      8,
      -Math.PI * 0.4,
      Math.PI * 0.8,
      Math.PI * 0.25,
      Math.PI * 0.25,
    );
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const visorMesh = new THREE.Mesh(visorGeom, visorMat);
    visorMesh.rotation.x = Math.PI;
    visorMesh.position.y = -5;
    visorMesh.position.z = 2;
    this._helmetGroup.add(visorMesh);

    this._helmetGroup.visible = false;
    this.group.add(this._helmetGroup);

    // --- Afterimage trail ---
    this._afterimages = [];
    this._afterGeom = this._makeRoundedBoxGeometry(40, 40, 16, 4);
    for (let i = 0; i < AFTERIMAGE_COUNT; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: BODY_COLOR,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this._afterGeom, mat);
      mesh.visible = false;
      mesh.renderOrder = -1;
      this._afterimages.push({ mesh, mat });
    }

    // Track current expression state to avoid redundant updates
    this._currentExpression = '';
  }

  /**
   * Create a rounded box geometry using beveled edges.
   * Uses a standard BoxGeometry with slight bevel approximation.
   */
  _makeRoundedBoxGeometry(width, height, depth, _radius) {
    // Three.js doesn't have a built-in rounded box, so we use a regular box
    // and rely on the outline mesh for the visual rounding effect.
    // For a more rounded look, we use a slightly higher-segment box.
    return new THREE.BoxGeometry(width, height, depth, 2, 2, 2);
  }

  /** Create the smile arc mesh from a torus segment. */
  _createSmileMesh() {
    const curve = new THREE.EllipseCurve(0, 0, 5, 3, 0.15 * Math.PI, 0.85 * Math.PI, false);
    const points = curve.getPoints(16);
    const shape = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, -p.y, 0)),
    );
    const mat = new THREE.LineBasicMaterial({ color: MOUTH_COLOR, linewidth: 2 });
    const line = new THREE.Line(shape, mat);
    return line;
  }

  /** Create a flat line mouth for determined/charging expression. */
  _createLineMouth() {
    const geom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-4, 0, 0),
      new THREE.Vector3(4, 0, 0),
    ]);
    const mat = new THREE.LineBasicMaterial({ color: MOUTH_COLOR, linewidth: 2 });
    return new THREE.Line(geom, mat);
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
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geom, mat);
  }

  /**
   * Attach this character's meshes to a parent group (e.g., worldLayer).
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
   * Called every frame by ThreeJSTheme.updateFrame().
   *
   * @param {object} character - Character entity
   * @param {object} options - { planetIndex, power, time }
   */
  update(character, options = {}) {
    if (!character) return;

    const { planetIndex = 0, power = 0, time = 0 } = options;

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

    // --- Determine expression state ---
    const expression = this._resolveExpression(character, power);

    // --- Death transform ---
    if (character.deathActive) {
      const dt = character.deathTimer;
      this.group.rotation.z = dt * 8;
      const deathScale = Math.max(0.1, 1 - dt * 0.8);
      this.group.scale.multiplyScalar(deathScale);
      // Fade body
      this._bodyMat.transparent = true;
      this._bodyMat.opacity = Math.max(0, 1 - dt * 0.7);
      this._outlineMat.transparent = true;
      this._outlineMat.opacity = Math.max(0, 1 - dt * 0.7);
    } else {
      this.group.rotation.z = 0;
      if (this._bodyMat.transparent) {
        this._bodyMat.transparent = false;
        this._bodyMat.opacity = 1;
        this._outlineMat.transparent = false;
        this._outlineMat.opacity = 1;
      }
    }

    // --- Update face/expression ---
    this._updateExpression(expression, character, time);

    // --- Legs animation ---
    this._updateLegs(expression, time);

    // --- Helmet ---
    this._helmetGroup.visible = planetIndex > 0;

    // --- Eye blink ---
    this._updateBlink(character, expression);

    // --- Afterimage trail ---
    this._updateAfterimages(character);
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

  /**
   * Update eyes, mouth, and eyebrows to match expression.
   */
  _updateExpression(expression, character, _time) {
    // Only update if expression changed (except for idle which needs pupil drift)
    const needsUpdate = expression !== this._currentExpression || expression === 'idle';
    if (!needsUpdate && expression !== 'charge-high') return;
    this._currentExpression = expression;

    // Reset all overlays
    for (const xg of this._deathEyeGroups) xg.visible = false;
    for (const sg of this._starEyeGroups) sg.visible = false;

    // --- Eyes: sclera shape and pupil position ---
    let scleraScaleY = 1;
    let pupilOffX = 0;
    let pupilOffY = 0;
    let pupilScale = 1;
    let showNormalEyes = true;

    switch (expression) {
      case 'death':
        showNormalEyes = false;
        for (const xg of this._deathEyeGroups) xg.visible = true;
        break;
      case 'victory':
        showNormalEyes = false;
        for (const sg of this._starEyeGroups) sg.visible = true;
        break;
      case 'idle':
        pupilOffX = (character.pupilDriftX || 0) * 0.4;
        pupilOffY = (character.pupilDriftY || 0) * 0.4;
        break;
      case 'charge-low':
        scleraScaleY = 0.75;
        pupilScale = 0.8;
        break;
      case 'charge-mid':
        scleraScaleY = 0.5;
        pupilScale = 0.6;
        break;
      case 'charge-high':
        scleraScaleY = 0.35;
        pupilScale = 0.4;
        // Shake
        pupilOffX = (Math.random() - 0.5) * 1.5;
        pupilOffY = (Math.random() - 0.5) * 1.5;
        break;
      case 'rising':
        pupilOffY = 0;
        pupilOffX = 0;
        break;
      case 'peak':
        pupilOffY = 0.8;
        break;
      case 'falling':
        scleraScaleY = 1.15;
        pupilScale = 0.7;
        pupilOffY = -0.6;
        break;
      case 'sliding':
        pupilOffX = character._slideVx > 0 ? 0.8 : character._slideVx < 0 ? -0.8 : 0;
        break;
      case 'landing':
        scleraScaleY = 0.6;
        break;
      default:
        break;
    }

    for (const eye of this._eyeGroups) {
      eye.sclera.visible = showNormalEyes;
      eye.pupil.visible = showNormalEyes;
      if (showNormalEyes) {
        eye.sclera.scale.set(1, scleraScaleY, 0.5);
        eye.pupil.position.x = pupilOffX;
        eye.pupil.position.y = pupilOffY;
        eye.pupil.scale.setScalar(pupilScale);
      }
    }

    // --- Mouth ---
    this._smileMesh.visible = false;
    this._scaredMesh.visible = false;
    this._lineMouth.visible = false;

    switch (expression) {
      case 'idle':
      case 'peak':
      case 'victory':
        this._smileMesh.visible = true;
        break;
      case 'falling':
      case 'death':
        this._scaredMesh.visible = true;
        break;
      case 'charge-low':
      case 'charge-mid':
      case 'charge-high':
      case 'rising':
      case 'sliding':
      case 'landing':
        this._lineMouth.visible = true;
        break;
      default:
        this._smileMesh.visible = true;
        break;
    }

    // --- Eyebrows ---
    const showDetermined = expression === 'rising' || expression === 'charge-high';
    const showWorried = expression === 'falling' || expression === 'sliding';
    for (const brow of this._eyebrows) {
      brow.mesh.visible = showDetermined || showWorried;
      if (showDetermined) {
        // Angled inward-down (determined look)
        brow.mesh.rotation.z = brow.side * 0.3;
        brow.mesh.position.y = -12;
      } else if (showWorried) {
        // Angled inward-up (worried look)
        brow.mesh.rotation.z = brow.side * -0.3;
        brow.mesh.position.y = -13;
      }
    }

    // --- Charge shake on body ---
    if (expression === 'charge-high') {
      this._bodyMesh.position.x = (Math.random() - 0.5) * 3;
      this._bodyMesh.position.y = (Math.random() - 0.5) * 3;
      this._outlineMesh.position.x = this._bodyMesh.position.x;
      this._outlineMesh.position.y = this._bodyMesh.position.y;
    } else {
      this._bodyMesh.position.x = 0;
      this._bodyMesh.position.y = 0;
      this._outlineMesh.position.x = 0;
      this._outlineMesh.position.y = 0;
    }
  }

  /**
   * Animate legs based on expression state.
   */
  _updateLegs(expression, time) {
    for (const leg of this._legs) {
      let yOff = 22;
      let angle = 0;

      switch (expression) {
        case 'idle':
          yOff += Math.sin(time * 2 + leg.side * Math.PI) * 1.5;
          break;
        case 'charge-low':
          yOff -= 2;
          break;
        case 'charge-mid':
          yOff -= 4;
          break;
        case 'charge-high':
          yOff -= 6;
          break;
        case 'rising':
          yOff += 4;
          break;
        case 'peak':
          yOff += 2;
          angle = leg.side * 0.15;
          break;
        case 'falling':
          yOff += 3;
          angle = leg.side * Math.sin(time * 8) * 0.3;
          break;
        case 'sliding':
          yOff += 1;
          angle = leg.side * 0.2;
          break;
        case 'landing':
          yOff -= 2;
          break;
        case 'victory':
          yOff += Math.sin(time * 6 + leg.side * Math.PI) * 3;
          break;
        case 'death':
          angle = leg.side * 0.5;
          yOff += 5;
          break;
        default:
          break;
      }

      leg.group.position.y = yOff;
      leg.group.rotation.z = angle;
    }
  }

  /**
   * Eye blink effect — squash sclera vertically.
   */
  _updateBlink(character, expression) {
    if (
      character.blinkPhase > 0 &&
      !character.deathActive &&
      !character.victoryActive &&
      (expression === 'idle' || expression === 'sliding')
    ) {
      const halfDur = 0.075;
      const bp = character.blinkPhase;
      // bp counts down from ~0.15 to 0: first half closes, second half opens
      let blinkScale;
      if (bp > halfDur) {
        // Closing: 1 → 0 as bp goes from 0.15 → halfDur
        blinkScale = (bp - halfDur) / halfDur;
      } else {
        // Opening: 0 → 1 as bp goes from halfDur → 0
        blinkScale = 1 - bp / halfDur;
      }
      blinkScale = Math.max(0.05, blinkScale);

      for (const eye of this._eyeGroups) {
        eye.sclera.scale.y = blinkScale;
        eye.pupil.visible = blinkScale > 0.2;
      }
    } else {
      // Reset sclera scale when not blinking
      for (const eye of this._eyeGroups) {
        eye.sclera.scale.y = 1;
        eye.pupil.visible = true;
      }
    }
  }

  /**
   * Update afterimage trail meshes.
   */
  _updateAfterimages(character) {
    const positions = character.afterimagePositions || [];
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

    // Dispose shared afterimage geometry once, then materials
    if (this._afterGeom) this._afterGeom.dispose();
    for (const ai of this._afterimages) {
      ai.mat.dispose();
    }
  }
}
