import * as THREE from 'three';

/**
 * Hero scene: the Flowkite kite, drifting.
 *
 * The whole thing is deliberately one object in a lot of air — but the air itself is
 * allowed a presence: the line the kite flies on, a few wind swooshes riding across the
 * frame, a field of dust motes drifting the same way, and cloud puffs far behind it all.
 * Under everything, a dim mirror of the kite in the ground turns the pale void into a
 * glossy studio floor. All of it has to sit in the same material world as the CSS —
 * pale ground (#eef0f4), graphite form, light from the upper-left — so the canvas reads
 * as an extension of the page rather than a video playing inside it.
 *
 * Two clocks run here: `elapsed` (real time, drives the idle pose and the camera) and
 * `windTime` (accumulated at 1× normally, faster during a gust or the periodic swoop),
 * which drives every piece of cloth and the whole air system so a click genuinely makes
 * the wind pick up instead of just nudging the kite.
 */

/** Canvas ground colour, shared with `--canvas` in style.css. */
const CANVAS_COLOR = 0xeef0f4;

/** Camera distance at a comfortably wide viewport; narrow viewports pull back from here. */
const BASE_CAMERA_Z = 7.8;
const BASE_CAMERA_Y = 0.9;

/** Kite outline in its own 2D space: a classic kite quadrilateral, long tail-ward point. */
const TIP_TOP = { x: 0, y: 1.05 };
const TIP_LEFT = { x: -0.66, y: 0.3 };
const TIP_RIGHT = { x: 0.66, y: 0.3 };
const TIP_BOTTOM = { x: 0, y: -1.1 };
/** Where the spars cross — the centre of the mark's X. */
const SPAR_CROSS = { x: 0, y: 0.3 };

/** Half-width of the gap that stands in for the mark's light-coloured spars. */
const SPAR_GAP = 0.028;

const EXTRUDE_DEPTH = 0.055;

/**
 * The moment in the idle animation used as the still pose under reduced motion. Picked
 * because t=0 is dead symmetric and reads as a diagram; here the kite is gently off-axis.
 */
const STATIC_POSE_TIME = 1.6;

interface Point2 {
  x: number;
  y: number;
}

/**
 * Inset a triangle by `d` on every edge, offsetting each corner along its angle bisector.
 * Insetting all three edges (rather than just the two that touch a spar) shrinks the outer
 * silhouette by a fraction of a percent, which nobody can see, and keeps this to one
 * branch-free helper. The step is clamped because the tail-ward corner is razor sharp and
 * an exact bisector offset there would retract the point a long way up the spine.
 */
function insetTriangle(a: Point2, b: Point2, c: Point2, d: number): [Point2, Point2, Point2] {
  const corner = (p: Point2, q: Point2, r: Point2): Point2 => {
    const ux = q.x - p.x;
    const uy = q.y - p.y;
    const vx = r.x - p.x;
    const vy = r.y - p.y;
    const ul = Math.hypot(ux, uy) || 1;
    const vl = Math.hypot(vx, vy) || 1;
    const bx = ux / ul + vx / vl;
    const by = uy / ul + vy / vl;
    const bl = Math.hypot(bx, by) || 1;
    const cosTheta = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (ul * vl)));
    const halfAngle = Math.acos(cosTheta) / 2;
    const step = Math.min(d / Math.max(Math.sin(halfAngle), 1e-3), d * 3);
    return { x: p.x + (bx / bl) * step, y: p.y + (by / bl) * step };
  };
  return [corner(a, b, c), corner(b, c, a), corner(c, a, b)];
}

/** Build one extruded, bevelled sail panel from three (already inset) corners. */
function panelGeometry(a: Point2, b: Point2, c: Point2): THREE.ExtrudeGeometry {
  const [p, q, r] = insetTriangle(a, b, c, SPAR_GAP);
  const shape = new THREE.Shape();
  shape.moveTo(p.x, p.y);
  shape.lineTo(q.x, q.y);
  shape.lineTo(r.x, r.y);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.014,
    bevelSize: 0.014,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 1,
  });
  // Centre the slab on its own mid-plane so the dihedral rotation pivots through the spine.
  geometry.translate(0, 0, -EXTRUDE_DEPTH / 2);
  return geometry;
}

/**
 * A studio environment, generated rather than downloaded.
 *
 * Clearcoat has nothing to mirror without an environment, and a bare `MeshPhysicalMaterial`
 * under a single key light looks like matte plastic. This paints a tiny equirectangular
 * gradient — bright sky, hot spot up and to the left, cooler floor — and pushes it through
 * PMREM so the graphite gets a believable soft specular rake for a few kilobytes of nothing.
 */
function createStudioEnvironment(renderer: THREE.WebGLRenderer): {
  texture: THREE.Texture;
  dispose: () => void;
} | null {
  const source = document.createElement('canvas');
  source.width = 256;
  source.height = 128;
  const ctx = source.getContext('2d');
  if (!ctx) return null;

  const sky = ctx.createLinearGradient(0, 0, 0, source.height);
  sky.addColorStop(0, '#ffffff');
  sky.addColorStop(0.48, '#eef0f4');
  sky.addColorStop(0.52, '#d4d9e2');
  sky.addColorStop(1, '#a9b0bd');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, source.width, source.height);

  // Key highlight. In three's equirect convention the direction (-1, 1, 1) — up and to the
  // left of a camera looking down -Z — lands at u ≈ 0.875, v ≈ 0.70, and CanvasTexture
  // flips Y, so that is 0.30 of the way down this canvas.
  const hot = ctx.createRadialGradient(
    source.width * 0.875,
    source.height * 0.3,
    0,
    source.width * 0.875,
    source.height * 0.3,
    source.width * 0.34,
  );
  hot.addColorStop(0, 'rgba(255,255,255,1)');
  hot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hot;
  ctx.fillRect(0, 0, source.width, source.height);

  const texture = new THREE.CanvasTexture(source);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromEquirectangular(texture);

  texture.dispose();
  pmrem.dispose();

  return {
    texture: target.texture,
    dispose: () => target.dispose(),
  };
}

/** Smooth 0→1 ramp, used for the scroll fade so the hand-off has no hard edges. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function initScene(canvas: HTMLCanvasElement): { setScroll(p: number): void; destroy(): void } {
  const noop = {
    setScroll: () => {},
    destroy: () => {},
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    // No WebGL2 (old browser, blocklisted driver, headless). The hero copy stands on its
    // own, so hand back an inert handle instead of taking the page down with us.
    return noop;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(CANVAS_COLOR, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  camera.position.set(0, BASE_CAMERA_Y, BASE_CAMERA_Z);
  const lookTarget = new THREE.Vector3(0, 0.25, 0);
  camera.lookAt(lookTarget);

  const environment = createStudioEnvironment(renderer);
  if (environment) scene.environment = environment.texture;

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  // --- kite -----------------------------------------------------------------------------

  const root = new THREE.Group(); // scroll drift lives here
  const kite = new THREE.Group(); // idle bob / yaw lives here
  root.position.set(0, 0.75, 0);
  kite.rotation.x = -0.1;
  root.add(kite);
  scene.add(root);

  /**
   * Four sail panels rather than one rhombus: the gaps between them are the mark's spars,
   * and four facets give the key light four slightly different angles to rake across.
   * Colours walk the same 160° graphite ramp the CSS uses — lighter at the top-left corner.
   */
  const panels: Array<{ tri: [Point2, Point2, Point2]; color: number; roughness: number; dihedral: number }> = [
    { tri: [TIP_TOP, TIP_LEFT, SPAR_CROSS], color: 0x2b3038, roughness: 0.26, dihedral: -0.1 },
    { tri: [TIP_TOP, SPAR_CROSS, TIP_RIGHT], color: 0x1c1f24, roughness: 0.34, dihedral: 0.1 },
    { tri: [TIP_LEFT, TIP_BOTTOM, SPAR_CROSS], color: 0x191c21, roughness: 0.3, dihedral: -0.1 },
    { tri: [SPAR_CROSS, TIP_BOTTOM, TIP_RIGHT], color: 0x0e1014, roughness: 0.42, dihedral: 0.1 },
  ];

  // Everything whose opacity the scroll fade drives. Material, not MeshPhysicalMaterial:
  // the flying line below is deliberately a flat MeshBasicMaterial.
  const fadeables: THREE.Material[] = [];

  /** The sail meshes, kept so the floor reflection below can share their geometry. */
  const sailMeshes: THREE.Mesh[] = [];

  for (const panel of panels) {
    const geometry = panelGeometry(panel.tri[0], panel.tri[1], panel.tri[2]);
    const material = new THREE.MeshPhysicalMaterial({
      color: panel.color,
      roughness: panel.roughness,
      metalness: 0.2,
      clearcoat: 0.65,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.9,
      // A whisper of thin-film iridescence: as the yaw walks the facets through the key
      // light the graphite picks up a shifting cool sheen — ripstop nylon, not plastic.
      iridescence: 0.16,
      iridescenceIOR: 1.3,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // A shallow dihedral, as if the sail were bowed by the wind: outer tips fall back,
    // spine stays proud, so the key light catches the centre first.
    mesh.rotation.y = panel.dihedral;
    mesh.castShadow = true;
    kite.add(mesh);
    sailMeshes.push(mesh);
    geometries.push(geometry);
    materials.push(material);
    fadeables.push(material);
  }

  // --- tails ----------------------------------------------------------------------------

  // Pivoted at the kite's bottom point so the ribbons can lag behind the yaw, then tucked
  // a little way up inside the sail: pinned exactly at the tip, the ribbons' flat root faces
  // sit edge-on beside the bevel and catch the key light as a bright notch in the join.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(TIP_BOTTOM.x, TIP_BOTTOM.y + 0.08, 0);
  kite.add(tailPivot);

  /** Stations along a ribbon's centreline. 48 is past the point where the wave stops faceting. */
  const RIBBON_STATIONS = 48;

  interface RibbonSpec {
    /** Arc length from the kite down to the tip. */
    length: number;
    /** Half-width at the root; the ribbon tapers to a point. */
    halfWidth: number;
    /** Launch angle from straight-down, positive swinging to +X. */
    sweep: number;
    /** How far the centreline keeps turning on the way down — this is what makes the hook. */
    curl: number;
    /** Wavelengths held along the ribbon at any instant. */
    waves: number;
    /** How fast the wave travels root → tip. */
    speed: number;
    /** Peak lateral travel, reached at the tip. */
    amplitude: number;
    /** How hard the ribbon rolls about its own axis, so it flashes edge-on and back. */
    twist: number;
    phase: number;
    colour: number;
    roughness: number;
  }

  /**
   * Two tails, as in the mark: a long one that sweeps away to the left and hooks at the tip,
   * and a shorter one that falls closer to the spine. They are detuned from each other on
   * every axis — length, wavelength, speed, phase — so they never beat in sync, which is the
   * thing that makes a pair of streamers read as cloth rather than as one mirrored object.
   */
  const ribbonSpecs: RibbonSpec[] = [
    {
      length: 1.34,
      halfWidth: 0.082,
      sweep: -0.34,
      curl: -0.95,
      waves: 1.45,
      speed: 1.7,
      amplitude: 0.2,
      twist: 1.15,
      phase: 0,
      colour: 0x121519,
      roughness: 0.56,
    },
    {
      length: 0.86,
      halfWidth: 0.062,
      sweep: 0.16,
      curl: -0.55,
      waves: 1.9,
      speed: 2.15,
      amplitude: 0.13,
      twist: 1.45,
      phase: 2.2,
      colour: 0x191d23,
      roughness: 0.62,
    },
  ];

  interface Ribbon {
    spec: RibbonSpec;
    geometry: THREE.BufferGeometry;
    position: THREE.BufferAttribute;
  }

  const ribbons: Ribbon[] = [];

  for (const spec of ribbonSpecs) {
    const vertexCount = (RIBBON_STATIONS + 1) * 2;
    const position = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
    position.setUsage(THREE.DynamicDrawUsage);

    // Two triangles per segment, stitching station i's pair to station i+1's.
    const indices: number[] = [];
    for (let i = 0; i < RIBBON_STATIONS; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }

    const uv = new Float32Array(vertexCount * 2);
    for (let i = 0; i <= RIBBON_STATIONS; i++) {
      const v = i / RIBBON_STATIONS;
      uv[i * 4 + 0] = 0;
      uv[i * 4 + 1] = v;
      uv[i * 4 + 2] = 1;
      uv[i * 4 + 3] = v;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshPhysicalMaterial({
      color: spec.colour,
      roughness: spec.roughness,
      metalness: 0.05,
      // Barely any clearcoat and a quiet environment: a thin strip seen at a grazing angle
      // sits right in the fresnel peak, so the sail's polish would blow the cloth out to
      // white and make the tails read as smoke rather than as ribbon.
      clearcoat: 0.12,
      clearcoatRoughness: 0.55,
      envMapIntensity: 0.3,
      // A ribbon has no thickness, so both faces have to be lit — otherwise every crest
      // where the cloth rolls over punches a hole straight through it.
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    // The sail casts the contact shadow; two waving streamers casting as well drew long
    // pale smears across the ground that read as motion blur on a still page.
    mesh.castShadow = false;
    // The wave moves the cloth well outside its starting box; without this three culls the
    // ribbon the moment the kite drifts toward the edge of frame.
    mesh.frustumCulled = false;
    tailPivot.add(mesh);

    ribbons.push({ spec, geometry, position });
    geometries.push(geometry);
    materials.push(material);
    fadeables.push(material);
  }

  // Scratch vectors, hoisted out of the per-frame loop — this runs 60 times a second.
  const centre = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const across = new THREE.Vector3();
  const axisZ = new THREE.Vector3(0, 0, 1);

  /**
   * Rebuild both ribbons for time `t`.
   *
   * The centreline is integrated rather than interpolated from control points: at each step
   * the heading turns by `sweep + curl·s^1.4` (which draws the mark's hook) and by the
   * travelling wave's own slope, so the wave bends the actual path instead of being smeared
   * sideways across a fixed one. Amplitude ramps with s², because a streamer is held at the
   * kite and free at the tip — a constant-amplitude wave looks like a wobbling rod.
   */
  function updateRibbons(t: number): void {
    for (const ribbon of ribbons) {
      const { spec, geometry, position } = ribbon;
      const step = spec.length / RIBBON_STATIONS;

      centre.set(0, 0, 0);
      previous.set(0, 0, 0);

      for (let i = 0; i <= RIBBON_STATIONS; i++) {
        const s = i / RIBBON_STATIONS;

        if (i > 0) {
          // Heading, measured from straight down, accumulated one step at a time.
          const swing = spec.sweep + spec.curl * Math.pow(s, 1.4);
          const wavePhase = s * spec.waves * Math.PI * 2 - t * spec.speed + spec.phase;
          const lateral = Math.cos(wavePhase) * spec.amplitude * s * s * 2.4;
          const heading = swing + lateral;

          previous.copy(centre);
          centre.x += Math.sin(heading) * step;
          centre.y -= Math.cos(heading) * step;
          // A little depth so the ribbon crosses in front of and behind the kite's plane.
          centre.z += Math.sin(wavePhase * 0.85 + 1.1) * spec.amplitude * s * s * 0.55 * step * 4;

          tangent.subVectors(centre, previous).normalize();
        } else {
          tangent.set(Math.sin(spec.sweep), -Math.cos(spec.sweep), 0);
        }

        // Cross-section direction: perpendicular to the path, then rolled about the path so
        // the cloth turns edge-on at the crests and catches the key light flat at the troughs.
        across.crossVectors(tangent, axisZ);
        if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
        across.normalize();
        const roll = Math.sin(s * spec.waves * Math.PI * 2 - t * spec.speed * 0.9 + spec.phase) * spec.twist * s;
        across.applyAxisAngle(tangent, roll);

        // Taper to a point, with a slight belly near the root so it does not read as a wedge.
        const half = spec.halfWidth * (1 - s) * (0.72 + 0.5 * Math.sin(Math.PI * Math.min(1, s * 1.6)));

        const a = i * 2;
        position.setXYZ(a, centre.x - across.x * half, centre.y - across.y * half, centre.z - across.z * half);
        position.setXYZ(a + 1, centre.x + across.x * half, centre.y + across.y * half, centre.z + across.z * half);
      }

      position.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }

  // Build once up front so the first frame — and the reduced-motion still — has real cloth
  // rather than a strip of zeroed vertices collapsed at the origin.
  updateRibbons(STATIC_POSE_TIME);

  // --- flying line ----------------------------------------------------------------------

  /**
   * The line the kite flies on, bowing away down-left toward a flyer somewhere past the
   * bottom of the frame. Built with the same station-by-station integration as the tails,
   * but this cloth is under tension rather than free: the bow is one smooth arc, and the
   * ripple running down it is a fraction of the tails' wave. It is what turns "a kite
   * shape floating" into "a kite being flown".
   */
  const LINE_STATIONS = 64;
  const LINE_LENGTH = 4.8;
  const LINE_HALF_WIDTH = 0.016;

  const linePosition = new THREE.BufferAttribute(new Float32Array((LINE_STATIONS + 1) * 2 * 3), 3);
  linePosition.setUsage(THREE.DynamicDrawUsage);

  const lineIndices: number[] = [];
  for (let i = 0; i < LINE_STATIONS; i++) {
    const a = i * 2;
    lineIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', linePosition);
  lineGeometry.setIndex(lineIndices);

  // Flat graphite, unlit: a hair-thin strip has no readable shading — under the physical
  // material it only sparkles. Drawn flat it reads as the mark's own linework.
  const lineMaterial = new THREE.MeshBasicMaterial({ color: 0x2a2f37, side: THREE.DoubleSide });
  const line = new THREE.Mesh(lineGeometry, lineMaterial);
  // Nearly all of it hangs outside the kite's bounding box, and its shadow would draw a
  // hard diagonal across the soft contact shadow.
  line.castShadow = false;
  line.frustumCulled = false;
  kite.add(line);
  geometries.push(lineGeometry);
  materials.push(lineMaterial);
  fadeables.push(lineMaterial);

  /**
   * Rebuild the flying line for time `t`. `sway` is a whole-line lean supplied by the
   * frame loop (slow wander plus a little pointer lag) — passed in rather than read from
   * `pointer` so the build-once call below can run before the state section exists.
   */
  function updateLine(t: number, sway: number): void {
    const step = LINE_LENGTH / LINE_STATIONS;
    centre.set(TIP_BOTTOM.x, TIP_BOTTOM.y + 0.05, 0.02);
    previous.copy(centre);

    for (let i = 0; i <= LINE_STATIONS; i++) {
      const s = i / LINE_STATIONS;

      if (i > 0) {
        // One shallow bow toward -X, tightening toward the far end, plus a small ripple
        // that grows with distance from the kite — near the bridle the line is taut.
        const bow = -(0.16 + 1.0 * Math.pow(s, 1.5));
        const ripple = Math.sin(s * Math.PI * 2 * 1.1 - t * 1.4) * 0.05 * s;
        const heading = bow + ripple + sway * s;

        previous.copy(centre);
        centre.x += Math.sin(heading) * step;
        centre.y -= Math.cos(heading) * step;
        // The flyer stands on the viewer's side of the kite, so the line eases forward.
        centre.z += step * 0.1;

        tangent.subVectors(centre, previous).normalize();
      } else {
        tangent.set(0, -1, 0);
      }

      across.crossVectors(tangent, axisZ);
      if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
      across.normalize();

      // Tapers away from the kite — cheap perspective for a strip with no thickness.
      const half = LINE_HALF_WIDTH * (1 - 0.45 * s);

      const a = i * 2;
      linePosition.setXYZ(a, centre.x - across.x * half, centre.y - across.y * half, centre.z - across.z * half);
      linePosition.setXYZ(a + 1, centre.x + across.x * half, centre.y + across.y * half, centre.z + across.z * half);
    }

    linePosition.needsUpdate = true;
  }

  // Same reason as the ribbons: the first frame needs a real line, not zeroed vertices.
  updateLine(STATIC_POSE_TIME, 0);

  // --- ground ---------------------------------------------------------------------------

  const GROUND_Y = -1.7;

  // ShadowMaterial draws nothing but the shadow, so the ground stays exactly the clear
  // colour — no seam where the plane ends, no second pale that almost matches the CSS.
  const groundGeometry = new THREE.PlaneGeometry(40, 40);
  const groundMaterial = new THREE.ShadowMaterial({ color: 0x9fa7b7, opacity: 0.34 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);
  geometries.push(groundGeometry);
  materials.push(groundMaterial);
  const GROUND_SHADOW_OPACITY = groundMaterial.opacity;

  // --- air ------------------------------------------------------------------------------

  /**
   * The wind, made just barely visible. Two ingredients, both travelling toward -X —
   * the direction the tails already trail, so the whole frame agrees on where the wind
   * is going: long swoosh strips that ride across the scene and fade in and out, and a
   * field of dust motes drifting the same way. Everything in this group is graphic
   * rather than physical — flat colour, no lights, no shadows, depthWrite off — because
   * it is set dressing for the kite, not competition.
   */
  const air = new THREE.Group();
  scene.add(air);

  /** Stations along a swoosh. Enough that the arc reads as a curve, not a polyline. */
  const STREAK_STATIONS = 36;
  /** Horizontal distance a swoosh covers per cycle — comfortably past both frame edges. */
  const STREAK_TRAVEL = 18;

  interface StreakSpec {
    /** Tip-to-tip length of the strip. */
    length: number;
    /** Half-width at the fullest point; the ends taper to nothing. */
    halfWidth: number;
    /** Height of the arc bump along the strip. */
    arc: number;
    /** End-to-end slope, so no two swooshes sit parallel. */
    tilt: number;
    y: number;
    z: number;
    /** Seconds per full crossing. Detuned against each other so they never bunch. */
    period: number;
    phase: number;
    opacity: number;
  }

  /**
   * Four swooshes at four depths. The one in front of the kite is the faintest —
   * anything bold crossing the subject reads as a scratch on the lens.
   */
  const streakSpecs: StreakSpec[] = [
    { length: 3.4, halfWidth: 0.03, arc: 0.13, tilt: -0.1, y: 2.3, z: -2.6, period: 12.4, phase: 0.0, opacity: 0.6 },
    { length: 2.5, halfWidth: 0.024, arc: 0.09, tilt: 0.08, y: 1.0, z: -1.4, period: 8.6, phase: 0.45, opacity: 0.5 },
    { length: 3.0, halfWidth: 0.032, arc: 0.11, tilt: -0.05, y: -0.55, z: 0.7, period: 10.2, phase: 0.72, opacity: 0.35 },
    { length: 2.1, halfWidth: 0.02, arc: 0.07, tilt: 0.12, y: 3.05, z: -3.4, period: 15.2, phase: 0.22, opacity: 0.55 },
  ];

  /** One static strip in the XY plane: an arced centreline, pointed at both ends. */
  function streakGeometry(spec: StreakSpec): THREE.BufferGeometry {
    const position = new Float32Array((STREAK_STATIONS + 1) * 2 * 3);
    const indices: number[] = [];
    for (let i = 0; i < STREAK_STATIONS; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    for (let i = 0; i <= STREAK_STATIONS; i++) {
      const s = i / STREAK_STATIONS;
      const x = (s - 0.5) * spec.length;
      const y = Math.sin(Math.PI * s) * spec.arc + (s - 0.5) * spec.tilt;
      // sin^0.7 keeps the belly long and the tips sharp — the classic wind swoosh.
      const half = spec.halfWidth * Math.pow(Math.sin(Math.PI * s), 0.7);
      const a = i * 6;
      position[a + 0] = x;
      position[a + 1] = y - half;
      position[a + 2] = 0;
      position[a + 3] = x;
      position[a + 4] = y + half;
      position[a + 5] = 0;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setIndex(indices);
    return geometry;
  }

  interface Streak {
    spec: StreakSpec;
    mesh: THREE.Mesh;
    material: THREE.MeshBasicMaterial;
  }

  const streaks: Streak[] = [];

  for (const spec of streakSpecs) {
    const geometry = streakGeometry(spec);
    // A shade deeper than the sunk canvas: present when you look, silent when you read.
    // DoubleSide because the strip's winding faces -Z; single-sided it simply never draws.
    const material = new THREE.MeshBasicMaterial({
      color: 0xbcc4d3,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, spec.y, spec.z);
    // The mesh spends most of its cycle parked outside the frustum on purpose.
    mesh.frustumCulled = false;
    air.add(mesh);
    streaks.push({ spec, mesh, material });
    geometries.push(geometry);
    materials.push(material);
  }

  /** Dust motes: enough to feel like air, few enough to never read as weather. */
  const MOTE_COUNT = 110;
  const MOTE_WRAP = 15;
  const MOTE_OPACITY = 0.5;

  /** A soft radial dot, drawn once — a square point sprite reads as confetti. */
  function createMoteSprite(): THREE.Texture | null {
    const source = document.createElement('canvas');
    source.width = 64;
    source.height = 64;
    const ctx = source.getContext('2d');
    if (!ctx) return null;
    const dot = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    dot.addColorStop(0, 'rgba(255,255,255,1)');
    dot.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    dot.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = dot;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(source);
  }

  const moteBase = new Float32Array(MOTE_COUNT * 3);
  /** Per mote: drift speed, bob amplitude, bob frequency, bob phase. */
  const moteParams = new Float32Array(MOTE_COUNT * 4);
  for (let i = 0; i < MOTE_COUNT; i++) {
    moteBase[i * 3 + 0] = (Math.random() - 0.5) * MOTE_WRAP;
    moteBase[i * 3 + 1] = -1.6 + Math.random() * 5.0;
    moteBase[i * 3 + 2] = -3.5 + Math.random() * 4.6;
    moteParams[i * 4 + 0] = 0.1 + Math.random() * 0.18;
    moteParams[i * 4 + 1] = 0.05 + Math.random() * 0.12;
    moteParams[i * 4 + 2] = 0.3 + Math.random() * 0.5;
    moteParams[i * 4 + 3] = Math.random() * Math.PI * 2;
  }

  const motePosition = new THREE.BufferAttribute(new Float32Array(MOTE_COUNT * 3), 3);
  motePosition.setUsage(THREE.DynamicDrawUsage);
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', motePosition);

  const moteSprite = createMoteSprite();
  const moteMaterial = new THREE.PointsMaterial({
    color: 0x9aa4b4,
    size: 0.085,
    map: moteSprite,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  // Positions wrap around the whole scene; the once-computed bounding sphere is a lie.
  motes.frustumCulled = false;
  air.add(motes);
  geometries.push(moteGeometry);
  materials.push(moteMaterial);

  /** Horizontal wrap for the cloud layer — wider than the streaks', it sits much deeper. */
  const CLOUD_WRAP = 30;

  /**
   * One soft cumulus puff, painted once and shared: a handful of overlapping radial blobs,
   * flat-bottomed by keeping every centre in the upper half. Hand-placed rather than
   * random so every visitor gets the same sky.
   */
  function createCloudSprite(): THREE.Texture | null {
    const source = document.createElement('canvas');
    source.width = 256;
    source.height = 128;
    const ctx = source.getContext('2d');
    if (!ctx) return null;
    const blobs: Array<[number, number, number]> = [
      [0.5, 0.52, 0.4],
      [0.3, 0.6, 0.28],
      [0.68, 0.58, 0.3],
      [0.42, 0.42, 0.24],
      [0.62, 0.4, 0.22],
      [0.2, 0.7, 0.18],
      [0.8, 0.7, 0.19],
    ];
    for (const [bx, by, br] of blobs) {
      const puff = ctx.createRadialGradient(256 * bx, 128 * by, 0, 256 * bx, 128 * by, 128 * br);
      puff.addColorStop(0, 'rgba(255,255,255,0.85)');
      puff.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puff;
      ctx.fillRect(0, 0, 256, 128);
    }
    return new THREE.CanvasTexture(source);
  }

  interface CloudSpec {
    x: number;
    y: number;
    z: number;
    scale: number;
    /** World units per second of windTime, so gusts hurry the sky along too. */
    speed: number;
    opacity: number;
  }

  /** Five puffs on three depth planes: big and slow far back, smaller and quicker nearer. */
  const cloudSpecs: CloudSpec[] = [
    { x: -6, y: 2.6, z: -6, scale: 4.2, speed: 0.2, opacity: 0.75 },
    { x: 2, y: 3.4, z: -8, scale: 5.6, speed: 0.14, opacity: 0.6 },
    { x: 7, y: 1.95, z: -5, scale: 3.2, speed: 0.26, opacity: 0.7 },
    { x: -1, y: 2.3, z: -9.5, scale: 6.4, speed: 0.1, opacity: 0.5 },
    { x: 11, y: 3.0, z: -7, scale: 4.6, speed: 0.17, opacity: 0.65 },
  ];

  const cloudSprite = createCloudSprite();
  const clouds: Array<{ spec: CloudSpec; sprite: THREE.Sprite; material: THREE.SpriteMaterial }> = [];

  if (cloudSprite) {
    for (const spec of cloudSpecs) {
      // One material per puff: each carries its own opacity, both for its depth-fade
      // and because the scroll fade multiplies in per frame.
      const material = new THREE.SpriteMaterial({
        map: cloudSprite,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(spec.x, spec.y, spec.z);
      sprite.scale.set(spec.scale, spec.scale * 0.48, 1);
      air.add(sprite);
      clouds.push({ spec, sprite, material });
      materials.push(material);
    }
  }

  /**
   * A second kite, far away among the clouds: the same four sail extrusions — spar gaps
   * and all, so it is unmistakably the mark — flattened to one hazy silhouette colour.
   * It rides the wind's clock across the sky the way the clouds do, with its own little
   * bob and yaw. A speck with a story: this is a sky where other kites fly.
   */
  const distantMaterial = new THREE.MeshBasicMaterial({
    color: 0xc2c9d6,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // The mini kite yaws past edge-on; single-sided its sails would blink out mid-turn.
    side: THREE.DoubleSide,
  });
  materials.push(distantMaterial);

  interface DistantSpec {
    /** Where it begins its crossing. Spread apart so they never travel as a clump. */
    x: number;
    y: number;
    z: number;
    scale: number;
    speed: number;
    /** Haze: the further back, the closer to the canvas colour it is allowed to sit. */
    opacity: number;
    /** Detunes the bob and yaw, so three kites never nod in unison. */
    phase: number;
  }

  /**
   * Three of them, on three depth planes. Aerial perspective does the work: the nearest
   * is the darkest, largest and quickest, the furthest is barely more than a smudge with
   * a kite's outline. Together they turn one object in empty air into a sky with weather
   * and company in it.
   */
  const distantSpecs: DistantSpec[] = [
    { x: 0, y: 2.1, z: -7, scale: 0.26, speed: 0.42, opacity: 0.9, phase: 0 },
    { x: 9, y: 3.15, z: -9.5, scale: 0.19, speed: 0.3, opacity: 0.62, phase: 2.1 },
    { x: -8, y: 1.35, z: -5.5, scale: 0.14, speed: 0.55, opacity: 0.45, phase: 4.3 },
  ];

  /** Stations down a distant kite's line. It is a lazy curve, so it needs very few. */
  const DISTANT_LINE_STATIONS = 20;

  /**
   * The line a distant kite is flown on, authored in world units so it does not inherit
   * the kite's scale. It leaves the tail, bows downwind as it drops, and runs out of the
   * bottom of the frame toward whoever is holding it. Without it these kites read as
   * ornaments floating in the sky rather than as kites someone is flying.
   */
  function distantLineGeometry(scale: number): THREE.BufferGeometry {
    const length = 11 * scale;
    const position = new Float32Array((DISTANT_LINE_STATIONS + 1) * 3);
    // Four components: three's line shader multiplies material opacity by this alpha,
    // so the thread can dissolve along its own length while the scroll fade still owns
    // the overall level.
    const color = new Float32Array((DISTANT_LINE_STATIONS + 1) * 4);
    for (let i = 0; i <= DISTANT_LINE_STATIONS; i++) {
      const s = i / DISTANT_LINE_STATIONS;
      const a = i * 3;
      // Downwind is -X here, the same direction the hero kite's line bows.
      position[a] = -Math.pow(s, 1.6) * length * 0.42;
      // Starts just inside the sail, so the join is hidden behind the tail-ward point.
      position[a + 1] = TIP_BOTTOM.y * scale - s * length;
      position[a + 2] = 0;

      const c = i * 4;
      color[c] = 1;
      color[c + 1] = 1;
      color[c + 2] = 1;
      // Full where it leaves the sail, gone by the two-thirds mark. A background kite
      // has to read as flown without dragging a hard diagonal across the headline.
      color[c + 3] = Math.max(0, 1 - Math.pow(s / 0.66, 1.5));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(color, 4));
    return geometry;
  }

  /** Fainter than the sails: a thread seen at this distance is barely a mark at all. */
  const distantLineMaterial = new THREE.LineBasicMaterial({
    color: 0xb9c0cd,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  materials.push(distantLineMaterial);

  const distantKites: Array<{ spec: DistantSpec; holder: THREE.Group; body: THREE.Group }> = [];

  for (const spec of distantSpecs) {
    // Two groups, because the two parts move differently: the holder carries the kite
    // and its line across the sky together, while only the body is allowed to bank and
    // yaw. Rotating the line with it would swing the whole string like a rigid rod.
    const holder = new THREE.Group();
    holder.position.set(spec.x, spec.y, spec.z);

    const body = new THREE.Group();
    for (const sail of sailMeshes) {
      // Geometry is shared with the hero kite — three extra kites cost four draw calls
      // each and not one byte of new vertex data.
      const mini = new THREE.Mesh(sail.geometry, distantMaterial);
      mini.rotation.copy(sail.rotation);
      body.add(mini);
    }
    body.scale.setScalar(spec.scale);
    holder.add(body);

    const lineGeometry = distantLineGeometry(spec.scale);
    holder.add(new THREE.Line(lineGeometry, distantLineMaterial));
    geometries.push(lineGeometry);

    air.add(holder);
    distantKites.push({ spec, holder, body });
  }

  // --- birds ------------------------------------------------------------------------------

  /**
   * A skein of birds, drawn the way a pencil would: five points per bird, two strokes
   * from wingtip to wingtip through the body. No bodies, no beaks — at this distance a
   * bird *is* the flap, so the flap is the whole model.
   */
  const BIRD_COUNT = 7;
  const BIRD_WRAP = 34;
  /** Local half-span; the per-bird scale takes it from here. */
  const BIRD_POINTS = 5;

  interface BirdSpec {
    x: number;
    y: number;
    z: number;
    scale: number;
    speed: number;
    /** Wingbeats per second. Small birds beat faster, which also reads as "further". */
    flap: number;
    phase: number;
  }

  /** A loose skein rather than a tidy V — staggered, so it reads as birds, not as a logo. */
  const birdSpecs: BirdSpec[] = [
    { x: 0, y: 3.5, z: -8, scale: 0.2, speed: 0.62, flap: 5.2, phase: 0 },
    { x: 0.9, y: 3.72, z: -8.3, scale: 0.17, speed: 0.62, flap: 5.6, phase: 0.9 },
    { x: 1.7, y: 3.34, z: -8.1, scale: 0.16, speed: 0.62, flap: 6.0, phase: 1.7 },
    { x: 2.5, y: 3.95, z: -8.6, scale: 0.15, speed: 0.62, flap: 5.4, phase: 2.4 },
    { x: 3.4, y: 3.55, z: -8.2, scale: 0.14, speed: 0.62, flap: 6.3, phase: 3.1 },
    { x: 4.4, y: 3.85, z: -8.8, scale: 0.13, speed: 0.62, flap: 5.8, phase: 3.9 },
    { x: 5.2, y: 3.42, z: -8.4, scale: 0.12, speed: 0.62, flap: 6.6, phase: 4.6 },
  ];

  const birdMaterial = new THREE.LineBasicMaterial({
    // Darker than the kites they share the sky with: a one-pixel line needs more contrast
    // than a filled silhouette to read at all, let alone read as a bird.
    color: 0x69717f,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  materials.push(birdMaterial);

  const birds: Array<{ spec: BirdSpec; line: THREE.Line; position: THREE.BufferAttribute }> = [];

  for (const spec of birdSpecs) {
    const position = new THREE.BufferAttribute(new Float32Array(BIRD_POINTS * 3), 3);
    position.setUsage(THREE.DynamicDrawUsage);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', position);

    const line = new THREE.Line(geometry, birdMaterial);
    line.position.set(spec.x, spec.y, spec.z);
    line.scale.setScalar(spec.scale);
    // Wings sweep well past the resting bounding box, and the flock wraps the sky.
    line.frustumCulled = false;
    air.add(line);

    birds.push({ spec, line, position });
    geometries.push(geometry);
  }

  /**
   * Beat every bird's wings for time `t`. The wing is a shallow arc — the tip travels
   * roughly twice as far as the elbow — and the downstroke is snapped while the upstroke
   * glides, which is the asymmetry that stops a flap looking like a metronome.
   */
  function updateBirds(t: number): void {
    for (const bird of birds) {
      const { spec, position } = bird;
      const raw = Math.sin(t * spec.flap + spec.phase);
      // Bias toward the top of the stroke: cheap stand-in for a fast down, slow up.
      const beat = Math.sign(raw) * Math.pow(Math.abs(raw), 0.65);
      const tip = beat * 0.55;
      const elbow = beat * 0.26 + 0.03;

      position.setXYZ(0, -1, tip, 0);
      position.setXYZ(1, -0.48, elbow, 0);
      position.setXYZ(2, 0, 0, 0);
      position.setXYZ(3, 0.48, elbow, 0);
      position.setXYZ(4, 1, tip, 0);
      position.needsUpdate = true;
    }
  }

  updateBirds(STATIC_POSE_TIME);

  /**
   * Advance the air for time `t`. Everything is computed from `t` alone — no integrated
   * state — so the reduced-motion still lands on the exact same frame every load, and a
   * background tab that skipped rendering picks up exactly where the clock says.
   * `visibility` is the scroll fade, folded in here because the swooshes already own
   * their opacity for the fade-in/fade-out of each crossing.
   */
  function updateAir(t: number, visibility: number): void {
    for (const streak of streaks) {
      const { spec, mesh, material } = streak;
      const cycle = ((t / spec.period + spec.phase) % 1 + 1) % 1;
      // 0.5 → -0.5: right edge to left, downwind.
      mesh.position.x = (0.5 - cycle) * STREAK_TRAVEL;
      mesh.position.y = spec.y + Math.sin(t * 0.5 + spec.phase * 9) * 0.07;
      // sin^1.6 window: born faint, brightest mid-frame, gone before the edge.
      material.opacity = spec.opacity * Math.pow(Math.sin(Math.PI * cycle), 1.6) * visibility;
    }

    for (let i = 0; i < MOTE_COUNT; i++) {
      const j = i * 3;
      const k = i * 4;
      const raw = moteBase[j] - moteParams[k] * t;
      const half = MOTE_WRAP / 2;
      const x = ((((raw + half) % MOTE_WRAP) + MOTE_WRAP) % MOTE_WRAP) - half;
      const y = moteBase[j + 1] + Math.sin(t * moteParams[k + 2] + moteParams[k + 3]) * moteParams[k + 1];
      motePosition.setXYZ(i, x, y, moteBase[j + 2]);
    }
    motePosition.needsUpdate = true;
    moteMaterial.opacity = MOTE_OPACITY * visibility;

    for (const cloud of clouds) {
      const { spec, sprite, material } = cloud;
      const half = CLOUD_WRAP / 2;
      const raw = spec.x - spec.speed * t;
      sprite.position.x = ((((raw + half) % CLOUD_WRAP) + CLOUD_WRAP) % CLOUD_WRAP) - half;
      material.opacity = spec.opacity * visibility;
    }

    for (const { spec, holder, body } of distantKites) {
      const half = CLOUD_WRAP / 2;
      const raw = spec.x - spec.speed * t;
      holder.position.x = ((((raw + half) % CLOUD_WRAP) + CLOUD_WRAP) % CLOUD_WRAP) - half;
      holder.position.y = spec.y + Math.sin(t * 0.4 + spec.phase) * 0.16;
      // Only the sail banks; the line below it keeps hanging toward its flyer.
      body.rotation.z = -0.14 + Math.sin(t * 0.5 + spec.phase + 1.0) * 0.1;
      body.rotation.y = Math.sin(t * 0.33 + spec.phase) * 0.5;
      // A lazy sway on the whole rig, which is what actually reads as "on a string".
      holder.rotation.z = Math.sin(t * 0.24 + spec.phase) * 0.05;
    }
    // One shared material, so the haze is set once from the nearest kite's value and the
    // rest read as further away through scale and height alone.
    distantMaterial.opacity = distantSpecs[0].opacity * visibility;
    distantLineMaterial.opacity = 0.7 * visibility;

    updateBirds(t);
    for (const { spec, line } of birds) {
      const half = BIRD_WRAP / 2;
      const raw = spec.x - spec.speed * t;
      line.position.x = ((((raw + half) % BIRD_WRAP) + BIRD_WRAP) % BIRD_WRAP) - half;
      // A slow rise and fall over the crossing, so the skein is never a straight line.
      line.position.y = spec.y + Math.sin(t * 0.21 + spec.phase) * 0.22;
    }
    birdMaterial.opacity = 0.9 * visibility;
  }

  // --- light ----------------------------------------------------------------------------

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-4.5, 8, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3.5;
  key.shadow.camera.right = 3.5;
  key.shadow.camera.top = 3.5;
  key.shadow.camera.bottom = -3.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 20;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 5;
  scene.add(key);
  scene.add(key.target);

  // Just enough bounce that the shaded side is graphite rather than a hole in the page.
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(5, 1.5, 4);
  scene.add(fill);

  // A cool rim from behind-right: when the yaw swings the lit faces away from the key,
  // this keeps a bright hairline on the sail's edge so it separates from its own shadow.
  const rim = new THREE.DirectionalLight(0xe9eef8, 0.55);
  rim.position.set(3.5, 2.2, -4.5);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8cdd8, 1.1);
  scene.add(hemi);

  // --- state ----------------------------------------------------------------------------

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clock = new THREE.Clock();
  let previousElapsed = 0;
  let rafId = 0;
  let inView = true;
  let scroll = 0;
  /** The scroll fade, cached for the air: its materials animate their own opacity per
   *  frame, so they multiply this in rather than being written to from applyScroll. */
  let sceneOpacity = 1;
  /** Camera distance chosen by resize(); the frame loop breathes around it. */
  let cameraZ = BASE_CAMERA_Z;
  /**
   * The wind's own clock. Advances at 1× normally and faster while a gust or the swoop
   * is live, so cloth, swooshes, motes and clouds all genuinely speed up together.
   * Starts at the static pose so the reduced-motion still (delta 0 forever) matches it.
   */
  let windTime = STATIC_POSE_TIME;
  /**
   * The click impulse, in two parts.
   *
   * `gustEnergy` is what a click deposits and what decays on its own. `gust` is what the
   * frame actually reads, and it only ever *chases* the energy. The split is the whole
   * point: driving the kite straight from the deposited value moved it a fifth of its
   * own height between one frame and the next, which does not read as a gust of wind at
   * all — it reads as the kite teleporting.
   */
  let gustEnergy = 0;
  let gust = 0;

  /** How fast the sail answers a gust. ~70ms to nearly full: a snap, but a drawn one. */
  const GUST_ATTACK = 14;
  /** How fast a deposited gust dies away. */
  const GUST_DECAY = 2.6;

  /** How long between swoops, how long one lasts, and where in the cycle it starts.
   *  The start offset keeps STATIC_POSE_TIME (1.6s) safely outside the window, so the
   *  reduced-motion still is the calm pose, never mid-manoeuvre. */
  const SWOOP_PERIOD = 19;
  const SWOOP_START = 6;
  const SWOOP_LENGTH = 3.4;

  const pointerTarget = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };

  /**
   * Where the kite sits relative to the hero copy, recomputed on resize.
   *
   * The canvas is full-bleed behind the text, so a centred kite lands straight on the
   * headline and the copy becomes unreadable. On wide viewports it moves into the right
   * third, clear of the measure; as the viewport narrows there is nowhere lateral to go,
   * so it shrinks and climbs instead, sitting above the copy rather than across it.
   */
  const layout = { x: 0, y: 0.75, scale: 1 };

  /** Drift the kite up and away, then fade it, so it hands off to the content below. */
  function applyScroll(): void {
    root.position.x = layout.x;
    root.position.y = layout.y + scroll * 2.2;
    root.position.z = -scroll * 3.4;
    root.rotation.z = scroll * 0.18;
    root.scale.setScalar(layout.scale);

    const opacity = 1 - smoothstep(0.15, 0.85, scroll);
    sceneOpacity = opacity;
    for (const material of fadeables) {
      material.opacity = opacity;
      material.transparent = opacity < 1;
    }
    groundMaterial.opacity = GROUND_SHADOW_OPACITY * opacity;
    root.visible = opacity > 0.002;
    ground.visible = root.visible;
    air.visible = root.visible;
  }

  function renderFrame(elapsed: number, delta: number): void {
    // Frame-rate independent easing toward the pointer — exponential decay, never a snap.
    // Done first so the camera and the kite's yaw both read the same value this frame.
    const ease = 1 - Math.exp(-2.4 * delta);
    pointer.x += (pointerTarget.x - pointer.x) * ease;
    pointer.y += (pointerTarget.y - pointer.y) * ease;

    /**
     * The swoop: every SWOOP_PERIOD seconds the kite allows itself one manoeuvre — it
     * slides downwind, dips, banks into the dive and climbs back out. `w` walks 0→1
     * through the window; the shapes below are sine windows so entry and exit are silent.
     */
    const cyclePhase = ((elapsed % SWOOP_PERIOD) + SWOOP_PERIOD) % SWOOP_PERIOD;
    const w = (cyclePhase - SWOOP_START) / SWOOP_LENGTH;
    const swoop = w > 0 && w < 1 ? Math.sin(Math.PI * w) : 0;

    // The gust decays on its own; while either is live the wind's clock runs fast, which
    // is what whips the tails, the line, the swooshes, the dust and the clouds at once.
    gustEnergy *= Math.exp(-GUST_DECAY * delta);
    // Frame-rate independent chase, so the rise is the same on 60Hz and 120Hz.
    gust += (gustEnergy - gust) * (1 - Math.exp(-GUST_ATTACK * delta));
    // 1.2×, not 2.2×: at the old rate the travelling wave along the tails advanced far
    // enough between frames to break up, and torn cloth reads as a rendering fault.
    windTime += delta * (1 + gust * 1.2 + swoop * 0.9);

    // Buoyancy: two detuned sines so the bob never lands on an obvious period.
    kite.position.y = Math.sin(elapsed * 0.55) * 0.12 + Math.sin(elapsed * 0.31 + 1.3) * 0.06;
    kite.position.x = Math.sin(elapsed * 0.24 + 0.6) * 0.09;
    kite.rotation.y = Math.sin(elapsed * 0.23) * 0.28 + pointer.x * 0.12;
    kite.rotation.z = Math.sin(elapsed * 0.19 + 0.7) * 0.1;
    kite.rotation.x = -0.1 + Math.sin(elapsed * 0.27) * 0.05;

    // Manoeuvre and gust, stacked on top of the idle pose rather than replacing it.
    // The swoop slides away from the copy (+X, off-frame side); sin(2πw) dips it first,
    // then lifts it past level on the way back — a dive and a recovering climb.
    if (swoop > 0) {
      kite.position.x += swoop * 0.55;
      kite.position.y -= Math.sin(Math.PI * 2 * w) * 0.34;
      kite.rotation.z += swoop * 0.3;
      kite.rotation.y -= swoop * 0.18;
    }
    if (gust > 0.001) {
      // Roughly half the old throw. A gust should lift the kite, not launch it: the
      // previous amount carried it clear of its own resting frame on a single click.
      kite.position.y += gust * 0.14;
      kite.position.x += gust * 0.05;
      kite.rotation.z += gust * 0.07;
      kite.rotation.x -= gust * 0.05;
    }

    // The ribbons swing on the same yaw, phase-shifted, so they always look like they are
    // catching up with the kite rather than welded to it. The swoop adds its own lash.
    tailPivot.rotation.z = -Math.sin(elapsed * 0.23 - 0.6) * 0.22 - swoop * 0.28;
    tailPivot.rotation.x = Math.sin(elapsed * 0.41 + 0.2) * 0.1;

    // The cloth and the air run on the wind's clock, not the wall clock.
    updateRibbons(windTime);
    // The flying line leans with a slow wander plus a trace of the pointer, so it lags
    // the kite the way the tails do rather than swinging rigidly with it.
    updateLine(windTime, Math.sin(elapsed * 0.32) * 0.05 + pointer.x * 0.07 - swoop * 0.1);
    updateAir(windTime, sceneOpacity);

    camera.position.x = pointer.x * 0.55;
    camera.position.y = BASE_CAMERA_Y + pointer.y * 0.3;
    // A breath of dolly — slow enough to be felt as air pressure, never seen as zoom.
    camera.position.z = cameraZ + Math.sin(elapsed * 0.14) * 0.06;
    camera.lookAt(lookTarget);

    renderer.render(scene, camera);
  }

  function tick(): void {
    rafId = requestAnimationFrame(tick);

    const elapsed = clock.getElapsedTime();
    const delta = Math.min(elapsed - previousElapsed, 0.05);
    previousElapsed = elapsed;

    // Hero scrolled out of the viewport: keep the clock honest, skip the GPU work.
    if (!inView) return;

    renderFrame(elapsed, delta);
  }

  // --- resize ---------------------------------------------------------------------------

  function resize(): void {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    // A display:none hero, or a canvas measured before layout, would give us NaN aspect.
    if (width === 0 || height === 0) return;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height, false); // false: CSS owns the element's box
    const aspect = width / height;
    camera.aspect = aspect;
    // Narrow viewports pull the camera back so the kite and its tails stay in frame.
    const fit = aspect < 1.15 ? Math.min(1.15 / Math.max(aspect, 0.5), 1.6) : 1;
    cameraZ = BASE_CAMERA_Z * fit;
    camera.position.z = cameraZ;
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);

    // Half the visible width in world units at the kite's depth, which is what the offset
    // below has to stay inside of.
    const halfWidth = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z * aspect;

    if (aspect >= 1.3) {
      // Room to stand beside the copy: sit just inside the right edge.
      layout.x = Math.min(halfWidth * 0.52, 2.6);
      layout.y = 0.85;
      layout.scale = 0.82;
    } else if (aspect >= 0.9) {
      layout.x = Math.min(halfWidth * 0.42, 1.5);
      layout.y = 1.15;
      layout.scale = 0.66;
    } else {
      // Phone: centred and small. It cannot clear the copy at this width, so style.css
      // drops the whole canvas to a watermark here and the kite becomes texture.
      layout.x = 0;
      layout.y = 1.35;
      layout.scale = 0.5;
    }
    applyScroll();

    if (reduceMotion) renderFrame(STATIC_POSE_TIME, 0);
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const viewObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) inView = entry.isIntersecting;
    },
    { rootMargin: '120px' },
  );
  viewObserver.observe(canvas);

  // --- pointer --------------------------------------------------------------------------

  function onPointerMove(event: PointerEvent): void {
    pointerTarget.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointerTarget.y = -((event.clientY / window.innerHeight) * 2 - 1);
  }

  /**
   * A press on the hero's empty air kicks the wind up.
   *
   * Not on its controls, though: someone pressing "View on GitHub" is aiming at a button,
   * and having the backdrop lurch under their cursor at that moment reads as the page
   * malfunctioning rather than as a scene that answers to them.
   *
   * The cap is on the deposited energy, so mashing saturates instead of accumulating.
   */
  function onPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('#hero')) return;
    if (target.closest('a, button, summary, input, textarea, select, [role="button"]')) return;
    gustEnergy = Math.min(gustEnergy + 0.55, 1);
  }

  /**
   * Touch devices have no hover, so the parallax would be dead there: feed it from the
   * device's tilt instead. Centred on holding the phone at a natural ~40° pitch. On iOS
   * this listener stays silent until the site is granted motion access — it degrades to
   * the still scene, which is fine; requesting permission with a dialog is not worth it.
   */
  function onOrientation(event: DeviceOrientationEvent): void {
    if (event.gamma == null || event.beta == null) return;
    pointerTarget.x = Math.max(-1, Math.min(1, event.gamma / 24));
    pointerTarget.y = Math.max(-1, Math.min(1, (40 - event.beta) / 28));
  }

  const coarseInput = window.matchMedia('(hover: none)').matches;

  // --- start ----------------------------------------------------------------------------

  resize();
  applyScroll();

  if (reduceMotion) {
    // Reduced motion: one static frame, no loop, no pointer tracking. The kite still
    // exists, it just never moves on its own.
    renderFrame(STATIC_POSE_TIME, 0);
  } else {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    if (coarseInput && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', onOrientation, { passive: true });
    }
    rafId = requestAnimationFrame(tick);
  }

  return {
    setScroll(p: number): void {
      scroll = Math.min(1, Math.max(0, p));
      applyScroll();
      // With the loop running the next frame picks this up; without one, redraw by hand.
      // Scroll-linked movement is user-driven, so it is safe under reduced motion.
      if (reduceMotion) renderFrame(STATIC_POSE_TIME, 0);
    },

    destroy(): void {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      resizeObserver.disconnect();
      viewObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('deviceorientation', onOrientation);

      scene.clear();
      // Lights own render targets too — the key light's shadow map is not small.
      key.dispose();
      fill.dispose();
      rim.dispose();
      hemi.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      moteSprite?.dispose();
      cloudSprite?.dispose();
      environment?.dispose();
      scene.environment = null;
      renderer.dispose();
    },
  };
}
