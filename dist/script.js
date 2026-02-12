// src/main.js
import "./style.css";
import * as THREE from "three";

/**
 * TRUE "Matrix movie" trails = glyph streams (bright head + fading tail)
 * NOT motion blur.
 *
 * - We render many vertical streams.
 * - Each stream is made of multiple glyph segments behind the head.
 * - Scroll controls speed: fall fast -> slow -> stop -> reverse up
 * - Reveal overlay once reversal starts.
 */

// ---------- Basic setup ----------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050605); // slightly off-black helps glow read

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);
camera.position.set(0, 6, 34);

scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// Optional: subtle fog for depth (Matrix vibe)
scene.fog = new THREE.Fog(0x050605, 25, 90);

// ---------- UI elements ----------
const revealEl = document.querySelector(".reveal");
const hintEl = document.querySelector(".scrollHint");

// ---------- Scroll mapping ----------
let scrollProgress = 0; // 0..1

function updateScrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const s = maxScroll <= 0 ? 0 : window.scrollY / maxScroll;
  scrollProgress = THREE.MathUtils.clamp(s, 0, 1);
}
window.addEventListener("scroll", updateScrollProgress, { passive: true });
updateScrollProgress();

function speedFromScroll(t) {
  // Tune these two points to match your “feel”
  const stopPoint = 0.35;
  const flipPoint = 0.55;

  if (t < stopPoint) {
    // falling speed: 1.0 -> 0.08
    return THREE.MathUtils.lerp(1.0, 0.08, t / stopPoint);
  }
  if (t < flipPoint) {
    // ease to full stop
    return THREE.MathUtils.lerp(
      0.08,
      0.0,
      (t - stopPoint) / (flipPoint - stopPoint)
    );
  }
  // reverse upward: 0 -> -1.3
  return THREE.MathUtils.lerp(0.0, -1.3, (t - flipPoint) / (1.0 - flipPoint));
}

function revealFromScroll(t) {
  return t > 0.62;
}

// ---------- Glyph textures (0 / 1) ----------
function makeDigitTexture(digit) {
  const size = 128;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Outer glow
  ctx.shadowColor = "rgba(0, 255, 120, 0.65)";
  ctx.shadowBlur = 22;

  // Digit
  ctx.font = "bold 92px monospace";
  ctx.fillStyle = "rgba(0, 255, 120, 0.98)";
  ctx.fillText(String(digit), size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(cnv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const tex0 = makeDigitTexture(0);
const tex1 = makeDigitTexture(1);

// ---------- Stream / trail settings ----------
const rand = (min, max) => min + Math.random() * (max - min);

const bounds = {
  x: 34,
  z: 34,
  yTop: 38,
  yBottom: -38,
};

// How many streams, and how long each trail is
const STREAMS = 160;        // number of columns
const SEGMENTS = 22;        // glyphs per column (tail length)
const SPACING = 1.15;       // spacing between glyphs in a trail

// Total instances per digit mesh
const INSTANCES_PER_DIGIT = STREAMS * SEGMENTS;

// Plane for each glyph “tile”
const glyphGeo = new THREE.PlaneGeometry(1, 1);

// Additive blending helps glow pop like Matrix
const baseMatParams = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
};

// Two instanced meshes: zeros and ones
const mat0 = new THREE.MeshBasicMaterial({
  ...baseMatParams,
  map: tex0,
  opacity: 1.0,
});
const mat1 = new THREE.MeshBasicMaterial({
  ...baseMatParams,
  map: tex1,
  opacity: 1.0,
});

const zeros = new THREE.InstancedMesh(glyphGeo, mat0, INSTANCES_PER_DIGIT);
const ones = new THREE.InstancedMesh(glyphGeo, mat1, INSTANCES_PER_DIGIT);
zeros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

// Per-instance color to control brightness (head brighter, tail dimmer)
zeros.instanceColor = new THREE.InstancedBufferAttribute(
  new Float32Array(INSTANCES_PER_DIGIT * 3),
  3
);
ones.instanceColor = new THREE.InstancedBufferAttribute(
  new Float32Array(INSTANCES_PER_DIGIT * 3),
  3
);
mat0.vertexColors = true;
mat1.vertexColors = true;

scene.add(zeros, ones);

const dummy = new THREE.Object3D();

// ---------- Stream data ----------
/**
 * Each stream has:
 * - x,z position
 * - headY current position
 * - speed multiplier
 * - scale
 * - slight rotation
 */
const streams = new Array(STREAMS).fill(0).map(() => ({
  x: rand(-bounds.x, bounds.x),
  z: rand(-bounds.z, bounds.z),
  headY: rand(bounds.yBottom, bounds.yTop),
  speed: rand(0.7, 1.8),
  scale: rand(0.38, 0.85),
  rotY: rand(-0.15, 0.15),
  phase: Math.random() * 1000, // for “digit switching”
}));

/**
 * Pre-decide which segment uses 0 vs 1, but we also “flicker” over time.
 * We store a base bit per segment; then change occasionally.
 */
const baseBit = new Uint8Array(INSTANCES_PER_DIGIT);
for (let i = 0; i < INSTANCES_PER_DIGIT; i++) {
  baseBit[i] = Math.random() < 0.5 ? 0 : 1;
}

// ---------- Brightness curve (head bright, tail fades) ----------
function brightnessForSegment(segIndex) {
  // segIndex = 0 is head
  // Make head extra bright, then exponential-ish falloff
  if (segIndex === 0) return 1.6;
  const t = segIndex / (SEGMENTS - 1); // 0..1
  // Fast fade then long tail
  return THREE.MathUtils.lerp(1.0, 0.05, t * t);
}

// ---------- Animation ----------
let last = performance.now();
let time = 0;

function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  time += dt;

  const scrollSpeed = speedFromScroll(scrollProgress);

  // UI states
  const show = revealFromScroll(scrollProgress);
  revealEl?.classList.toggle("show", show);
  hintEl?.classList.toggle("hide", scrollProgress > 0.12);

  // Move stream heads
  const worldSpeed = 16.0; // overall speed multiplier (tune)
  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];
    st.headY -= dt * worldSpeed * st.speed * scrollSpeed;

    if (scrollSpeed >= 0) {
      // falling
      if (st.headY < bounds.yBottom - SEGMENTS * SPACING) {
        st.headY = bounds.yTop + rand(0, 10);
      }
    } else {
      // rising
      if (st.headY > bounds.yTop + SEGMENTS * SPACING) {
        st.headY = bounds.yBottom - rand(0, 10);
      }
    }
  }

  // Update instances:
  // Each stream contributes SEGMENTS glyph tiles behind its head.
  // We split instances into two meshes (0 and 1). We decide per segment where it goes.
  let idx0 = 0;
  let idx1 = 0;

  // Simple “digit flicker”: every stream/segment can flip occasionally
  // This imitates Matrix glyph changing.
  const flickerRate = 10.0; // higher = more changes

  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];

    for (let seg = 0; seg < SEGMENTS; seg++) {
      // Segment world position (tail behind head)
      const y = st.headY - seg * SPACING;

      // Only draw within vertical bounds (optional optimization)
      if (y < bounds.yBottom - 6 || y > bounds.yTop + 6) continue;

      // Determine which digit (0/1) for this segment
      // Base + time flicker
      const globalIndex = s * SEGMENTS + seg;
      const flicker = Math.sin((time * flickerRate) + st.phase + seg * 0.35) > 0.55;
      const bit = (baseBit[globalIndex] ^ (fl
