import * as THREE from 'three';

/**
 * Hero scene: the Flowkite kite, drifting.
 *
 * The whole thing is deliberately one object in a lot of air. It has to sit in the same
 * material world as the CSS — pale ground (#eef0f4), graphite form, light from the
 * upper-left — so the canvas reads as an extension of the page rather than a video
 * playing inside it.
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

  const fadeables: Array<THREE.MeshPhysicalMaterial> = [];

  for (const panel of panels) {
    const geometry = panelGeometry(panel.tri[0], panel.tri[1], panel.tri[2]);
    const material = new THREE.MeshPhysicalMaterial({
      color: panel.color,
      roughness: panel.roughness,
      metalness: 0.2,
      clearcoat: 0.65,
      clearcoatRoughness: 0.28,
      envMapIntensity: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    // A shallow dihedral, as if the sail were bowed by the wind: outer tips fall back,
    // spine stays proud, so the key light catches the centre first.
    mesh.rotation.y = panel.dihedral;
    mesh.castShadow = true;
    kite.add(mesh);
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

  // --- ground ---------------------------------------------------------------------------

  // ShadowMaterial draws nothing but the shadow, so the ground stays exactly the clear
  // colour — no seam where the plane ends, no second pale that almost matches the CSS.
  const groundGeometry = new THREE.PlaneGeometry(40, 40);
  const groundMaterial = new THREE.ShadowMaterial({ color: 0x9fa7b7, opacity: 0.34 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1.7;
  ground.receiveShadow = true;
  scene.add(ground);
  geometries.push(groundGeometry);
  materials.push(groundMaterial);
  const GROUND_SHADOW_OPACITY = groundMaterial.opacity;

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

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc8cdd8, 1.1);
  scene.add(hemi);

  // --- state ----------------------------------------------------------------------------

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const clock = new THREE.Clock();
  let previousElapsed = 0;
  let rafId = 0;
  let inView = true;
  let scroll = 0;

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
    for (const material of fadeables) {
      material.opacity = opacity;
      material.transparent = opacity < 1;
    }
    groundMaterial.opacity = GROUND_SHADOW_OPACITY * opacity;
    root.visible = opacity > 0.002;
    ground.visible = root.visible;
  }

  function renderFrame(elapsed: number, delta: number): void {
    // Frame-rate independent easing toward the pointer — exponential decay, never a snap.
    // Done first so the camera and the kite's yaw both read the same value this frame.
    const ease = 1 - Math.exp(-2.4 * delta);
    pointer.x += (pointerTarget.x - pointer.x) * ease;
    pointer.y += (pointerTarget.y - pointer.y) * ease;

    // Buoyancy: two detuned sines so the bob never lands on an obvious period.
    kite.position.y = Math.sin(elapsed * 0.55) * 0.12 + Math.sin(elapsed * 0.31 + 1.3) * 0.06;
    kite.position.x = Math.sin(elapsed * 0.24 + 0.6) * 0.09;
    kite.rotation.y = Math.sin(elapsed * 0.23) * 0.28 + pointer.x * 0.12;
    kite.rotation.z = Math.sin(elapsed * 0.19 + 0.7) * 0.1;
    kite.rotation.x = -0.1 + Math.sin(elapsed * 0.27) * 0.05;

    // The ribbons swing on the same yaw, phase-shifted, so they always look like they are
    // catching up with the kite rather than welded to it.
    tailPivot.rotation.z = -Math.sin(elapsed * 0.23 - 0.6) * 0.22;
    tailPivot.rotation.x = Math.sin(elapsed * 0.41 + 0.2) * 0.1;

    // The wave itself, rebuilt from scratch every frame.
    updateRibbons(elapsed);

    camera.position.x = pointer.x * 0.55;
    camera.position.y = BASE_CAMERA_Y + pointer.y * 0.3;
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
    camera.position.z = BASE_CAMERA_Z * fit;
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

  // --- start ----------------------------------------------------------------------------

  resize();
  applyScroll();

  if (reduceMotion) {
    // Reduced motion: one static frame, no loop, no pointer tracking. The kite still
    // exists, it just never moves on its own.
    renderFrame(STATIC_POSE_TIME, 0);
  } else {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
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

      scene.clear();
      // Lights own render targets too — the key light's shadow map is not small.
      key.dispose();
      fill.dispose();
      hemi.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      environment?.dispose();
      scene.environment = null;
      renderer.dispose();
    },
  };
}
