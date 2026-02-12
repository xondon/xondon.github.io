// src/main.js
import "./style.css";
import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * TRUE "Matrix movie" trails = glyph streams (bright head + fading tail)
 * + White head glyph + Bloom (glow) postprocess
 *
 * - Many vertical streams.
 * - Each stream has a bright/white "head" glyph and a fading green tail.
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
scene.background = new THREE.Color(0x040504); // off-black to help glow read

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);
camera.position.set(0, 6, 34);

scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// Depth vibe
scene.fog = new THREE.Fog(0x040504, 25, 95);

// ---------- Postprocessing: Bloom ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

// Bloom params (tweakable):
// strength: how strong the glow is
// radius: glow spread
// threshold: how bright something must be to glow (lower = more glow)
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.15, // strength
  0.55, // radius
  0.15  // threshold
);
composer.addPass(bloomPass);

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
  const stopPoint = 0.35;
  const flipPoint = 0.55;

  if (t < stopPoint) return THREE.MathUtils.lerp(1.0, 0.08, t / stopPoint);
  if (t < flipPoint)
    return THREE.MathUtils.lerp(0.08, 0.0, (t - stopPoint) / (flipPoint - stopPoint));
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

const STREAMS = 170;  // columns
const SEGMENTS = 24;  // trail length
const SPACING = 1.12; // distance between glyphs

const INSTANCES_PER_DIGIT = STREAMS * SEGMENTS;

const glyphGeo = new THREE.PlaneGeometry(1, 1);

// Additive blending makes glow stack nicely
const baseMatParams = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
};

const mat0 = new THREE.MeshBasicMaterial({ ...baseMatParams, map: tex0, opacity: 1.0 });
const mat1 = new THREE.MeshBasicMaterial({ ...baseMatParams, map: tex1, opacity: 1.0 });

const zeros = new THREE.InstancedMesh(glyphGeo, mat0, INSTANCES_PER_DIGIT);
const ones = new THREE.InstancedMesh(glyphGeo, mat1, INSTANCES_PER_DIGIT);
zeros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

// Per-instance color controls brightness/tint
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
const streams = new Array(STREAMS).fill(0).map(() => ({
  x: rand(-bounds.x, bounds.x),
  z: rand(-bounds.z, bounds.z),
  headY: rand(bounds.yBottom, bounds.yTop),
  speed: rand(0.7, 1.85),
  scale: rand(0.38, 0.88),
  rotY: rand(-0.15, 0.15),
  phase: Math.random() * 1000,
}));

// Base digits, flicker over time
const baseBit = new Uint8Array(INSTANCES_PER_DIGIT);
for (let i = 0; i < INSTANCES_PER_DIGIT; i++) baseBit[i] = Math.random() < 0.5 ? 0 : 1;

// Brightness curve: head bright, tail fades out
function brightnessForSegment(segIndex) {
  if (segIndex === 0) return 2.25; // extra bright for bloom
  const t = segIndex / (SEGMENTS - 1); // 0..1
  return THREE.MathUtils.lerp(1.25, 0.04, t * t);
}

// Tint curve: head is near-white, tail is green
function colorForSegment(segIndex, b) {
  if (segIndex === 0) {
    // near-white head with a tiny green tint
    return { r: 1.25 * b, g: 1.35 * b, bl: 1.25 * b };
  }
  // tail: green dominant, with some dim red/blue for glow richness
  return { r: 0.05 * b, g: 1.0 * b, bl: 0.10 * b };
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
  const worldSpeed = 16.5;
  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];
    st.headY -= dt * worldSpeed * st.speed * scrollSpeed;

    if (scrollSpeed >= 0) {
      if (st.headY < bounds.yBottom - SEGMENTS * SPACING) {
        st.headY = bounds.yTop + rand(0, 10);
      }
    } else {
      if (st.headY > bounds.yTop + SEGMENTS * SPACING) {
        st.headY = bounds.yBottom - rand(0, 10);
      }
    }
  }

  // Build instance lists each frame
  let idx0 = 0;
  let idx1 = 0;

  const flickerRate = 10.5;

  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];

    for (let seg = 0; seg < SEGMENTS; seg++) {
      const y = st.headY - seg * SPACING;

      if (y < bounds.yBottom - 6 || y > bounds.yTop + 6) continue;

      const globalIndex = s * SEGMENTS + seg;

      // Flicker: toggles digits
      const flicker =
        Math.sin(time * flickerRate + st.phase + seg * 0.35) > 0.55;

      const bit = (baseBit[globalIndex] ^ (flicker ? 1 : 0)) & 1;

      const b = brightnessForSegment(seg);
      const c = colorForSegment(seg, b);

      dummy.position.set(st.x, y, st.z);
      dummy.rotation.set(0, st.rotY, 0);
      dummy.scale.setScalar(st.scale);
      dummy.updateMatrix();

      if (bit === 0) {
        if (idx0 < INSTANCES_PER_DIGIT) {
          zeros.setMatrixAt(idx0, dummy.matrix);
          zeros.instanceColor.setXYZ(idx0, c.r, c.g, c.bl);
          idx0++;
        }
      } else {
        if (idx1 < INSTANCES_PER_DIGIT) {
          ones.setMatrixAt(idx1, dummy.matrix);
          ones.instanceColor.setXYZ(idx1, c.r, c.g, c.bl);
          idx1++;
        }
      }
    }
  }

  zeros.count = idx0;
  ones.count = idx1;

  zeros.instanceMatrix.needsUpdate = true;
  ones.instanceMatrix.needsUpdate = true;
  zeros.instanceColor.needsUpdate = true;
  ones.instanceColor.needsUpdate = true;

  // Render with bloom
  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---------- Resize ----------
window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Reduced motion ----------
const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
if (reduce?.matches) {
  revealEl?.classList.add("show");
  hintEl?.classList.add("hide");
  // Keep bloom but reduce intensity
  bloomPass.strength = 0.6;
  bloomPass.radius = 0.35;
  bloomPass.threshold = 0.25;
}
