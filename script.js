import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/**
 * Matrix Streams (movie-style):
 * - Trails are real "tail segments" behind a bright head glyph (not motion blur).
 * - Bloom makes the green pop.
 * - Scroll: fast fall -> slow -> stop -> reverse up -> reveal text.
 */

// ---------- Setup ----------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050605);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 240);
camera.position.set(0, 6, 36);

scene.add(new THREE.AmbientLight(0xffffff, 0.22));
scene.fog = new THREE.Fog(0x050605, 26, 110);

// ---------- Bloom ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.45, // strength
  0.55, // radius
  0.10  // threshold
);
composer.addPass(bloomPass);

// ---------- UI ----------
const revealEl = document.getElementById("reveal");
const hintEl = document.getElementById("hint");

// ---------- Scroll control ----------
let scrollProgress = 0;

function updateScrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const s = maxScroll <= 0 ? 0 : window.scrollY / maxScroll;
  scrollProgress = THREE.MathUtils.clamp(s, 0, 1);
}
window.addEventListener("scroll", updateScrollProgress, { passive: true });
updateScrollProgress();

function speedFromScroll(t) {
  const stopPoint = 0.35;
  const flipPoint = 0.55;

  if (t < stopPoint) return THREE.MathUtils.lerp(1.0, 0.10, t / stopPoint);
  if (t < flipPoint) return THREE.MathUtils.lerp(0.10, 0.0, (t - stopPoint) / (flipPoint - stopPoint));
  return THREE.MathUtils.lerp(0.0, -1.35, (t - flipPoint) / (1.0 - flipPoint));
}
function revealFromScroll(t) {
  return t > 0.62;
}

// ---------- Digit textures ----------
function makeDigitTexture(digit) {
  const size = 128;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // glow
  ctx.shadowColor = "rgba(0,255,120,0.85)";
  ctx.shadowBlur = 28;

  // glyph
  ctx.font = "bold 92px monospace";
  ctx.fillStyle = "rgba(0,255,120,1.0)";
  ctx.fillText(String(digit), size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(cnv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const tex0 = makeDigitTexture(0);
const tex1 = makeDigitTexture(1);

// ---------- Matrix stream settings ----------
const rand = (min, max) => min + Math.random() * (max - min);
const bounds = { x: 36, z: 36, yTop: 42, yBottom: -42 };

const STREAMS = 190;     // columns
const SEGMENTS = 28;     // tail length (more = longer trails)
const SPACING = 1.05;    // distance between glyphs

const INSTANCES = STREAMS * SEGMENTS;

// geometry
const glyphGeo = new THREE.PlaneGeometry(1, 1);

// materials (additive glow)
const baseMat = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const mat0 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex0 });
const mat1 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex1 });

// instanced meshes
const zeros = new THREE.InstancedMesh(glyphGeo, mat0, INSTANCES);
const ones  = new THREE.InstancedMesh(glyphGeo, mat1, INSTANCES);
zeros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

zeros.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES * 3), 3);
ones.instanceColor  = new THREE.InstancedBufferAttribute(new Float32Array(INSTANCES * 3), 3);
mat0.vertexColors = true;
mat1.vertexColors = true;

scene.add(zeros, ones);

const dummy = new THREE.Object3D();

// per-stream state
const streams = Array.from({ length: STREAMS }, () => ({
  x: rand(-bounds.x, bounds.x),
  z: rand(-bounds.z, bounds.z),
  headY: rand(bounds.yBottom, bounds.yTop),
  speed: rand(0.65, 1.9),
  scale: rand(0.42, 0.95),
  rotY: rand(-0.12, 0.12),
  phase: Math.random() * 1000,
}));

// base digit value per segment, plus flicker
const baseBit = new Uint8Array(INSTANCES);
for (let i = 0; i < INSTANCES; i++) baseBit[i] = Math.random() < 0.5 ? 0 : 1;

// brightness curve: white head, fading green tail
function brightness(seg) {
  if (seg === 0) return 2.9; // head very bright for bloom
  const t = seg / (SEGMENTS - 1);
  return THREE.MathUtils.lerp(1.35, 0.03, t * t);
}

// color curve: head is near-white, tail is green
function color(seg, b) {
  if (seg === 0) {
    // near-white head
    return { r: 1.25 * b, g: 1.35 * b, bl: 1.25 * b };
  }
  // tail: green dominant
  return { r: 0.06 * b, g: 1.0 * b, bl: 0.12 * b };
}

// ---------- Animation ----------
let last = performance.now();
let time = 0;

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;
  time += dt;

  const spd = speedFromScroll(scrollProgress);

  // UI
  revealEl?.classList.toggle("show", revealFromScroll(scrollProgress));
  hintEl?.classList.toggle("hide", scrollProgress > 0.12);

  // move heads
  const worldSpeed = 18.0;
  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];
    st.headY -= dt * worldSpeed * st.speed * spd;

    if (spd >= 0) {
      if (st.headY < bounds.yBottom - SEGMENTS * SPACING) st.headY = bounds.yTop + rand(0, 10);
    } else {
      if (st.headY > bounds.yTop + SEGMENTS * SPACING) st.headY = bounds.yBottom - rand(0, 10);
    }
  }

  // build instances each frame
  let i0 = 0;
  let i1 = 0;

  const flickerRate = 11.0;

  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];

    for (let seg = 0; seg < SEGMENTS; seg++) {
      const y = st.headY - seg * SPACING;
      if (y < bounds.yBottom - 6 || y > bounds.yTop + 6) continue;

      const gi = s * SEGMENTS + seg;

      // flicker toggle
      const flicker = Math.sin(time * flickerRate + st.phase + seg * 0.33) > 0.55;
      const bit = (baseBit[gi] ^ (flicker ? 1 : 0)) & 1;

      const b = brightness(seg);
      const c = color(seg, b);

      dummy.position.set(st.x, y, st.z);
      dummy.rotation.set(0, st.rotY, 0);
      dummy.scale.setScalar(st.scale);
      dummy.updateMatrix();

      if (bit === 0) {
        if (i0 < INSTANCES) {
          zeros.setMatrixAt(i0, dummy.matrix);
          zeros.instanceColor.setXYZ(i0, c.r, c.g, c.bl);
          i0++;
        }
      } else {
        if (i1 < INSTANCES) {
          ones.setMatrixAt(i1, dummy.matrix);
          ones.instanceColor.setXYZ(i1, c.r, c.g, c.bl);
          i1++;
        }
      }
    }
  }

  zeros.count = i0;
  ones.count = i1;

  zeros.instanceMatrix.needsUpdate = true;
  ones.instanceMatrix.needsUpdate = true;
  zeros.instanceColor.needsUpdate = true;
  ones.instanceColor.needsUpdate = true;

  composer.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---------- Resize ----------
window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
