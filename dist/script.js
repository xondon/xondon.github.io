import "./style.css";
import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/* ================= BASIC SETUP ================= */

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();

/* ==== CHANGED: BACKGROUND COLOR ==== */
scene.background = new THREE.Color(0x0b1020); // dark blue-gray

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  220
);
camera.position.set(0, 6, 34);

scene.add(new THREE.AmbientLight(0xffffff, 0.25));

/* ==== CHANGED: FOG COLOR ==== */
scene.fog = new THREE.Fog(0x0b1020, 25, 95);

/* ================= POST PROCESSING ================= */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

/* ==== CHANGED: BLOOM STRONGER ==== */
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.8, // strength ↑
  0.65, // radius ↑
  0.05  // threshold ↓ (more glow)
);
composer.addPass(bloomPass);

/* ================= STREAM SETTINGS ================= */

const rand = (min, max) => min + Math.random() * (max - min);

const bounds = { x: 34, z: 34, yTop: 38, yBottom: -38 };

const STREAMS = 170;
const SEGMENTS = 24;
const SPACING = 1.12;
const INSTANCES_PER_DIGIT = STREAMS * SEGMENTS;

/* ================= DIGIT TEXTURES ================= */

function makeDigitTexture(digit) {
  const size = 128;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d");

  ctx.clearRect(0, 0, size, size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.shadowColor = "rgba(0,255,140,0.9)";
  ctx.shadowBlur = 30;

  ctx.font = "bold 92px monospace";
  ctx.fillStyle = "rgba(0,255,140,1)";
  ctx.fillText(String(digit), size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(cnv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const tex0 = makeDigitTexture(0);
const tex1 = makeDigitTexture(1);

/* ================= INSTANCED MESH ================= */

const glyphGeo = new THREE.PlaneGeometry(1, 1);

const baseMat = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
};

const mat0 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex0 });
const mat1 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex1 });

const zeros = new THREE.InstancedMesh(glyphGeo, mat0, INSTANCES_PER_DIGIT);
const ones = new THREE.InstancedMesh(glyphGeo, mat1, INSTANCES_PER_DIGIT);

zeros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

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

/* ================= STREAM DATA ================= */

const streams = new Array(STREAMS).fill(0).map(() => ({
  x: rand(-bounds.x, bounds.x),
  z: rand(-bounds.z, bounds.z),
  headY: rand(bounds.yBottom, bounds.yTop),
  speed: rand(0.7, 1.8),
  scale: rand(0.38, 0.9),
}));

/* ================= BRIGHTNESS / COLOR ================= */

/* ==== CHANGED: HEAD BRIGHTER ==== */
function brightnessForSegment(i) {
  if (i === 0) return 3.0;
  const t = i / (SEGMENTS - 1);
  return THREE.MathUtils.lerp(1.5, 0.05, t * t);
}

/* ==== CHANGED: TAIL GREEN BOOST ==== */
function colorForSegment(i, b) {
  if (i === 0) return { r: 1.4 * b, g: 1.6 * b, bl: 1.4 * b };
  return { r: 0.1 * b, g: 1.2 * b, bl: 0.15 * b };
}

/* ================= ANIMATION ================= */

let last = performance.now();

function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  let idx0 = 0;
  let idx1 = 0;

  for (let s = 0; s < STREAMS; s++) {
    const st = streams[s];
    st.headY -= dt * 14;

    if (st.headY < bounds.yBottom - SEGMENTS * SPACING)
      st.headY = bounds.yTop + rand(0, 10);

    for (let seg = 0; seg < SEGMENTS; seg++) {
      const y = st.headY - seg * SPACING;

      const b = brightnessForSegment(seg);
      const c = colorForSegment(seg, b);

      dummy.position.set(st.x, y, st.z);
      dummy.scale.setScalar(st.scale);
      dummy.updateMatrix();

      if (Math.random() > 0.5) {
        zeros.setMatrixAt(idx0, dummy.matrix);
        zeros.instanceColor.setXYZ(idx0, c.r, c.g, c.bl);
        idx0++;
      } else {
        ones.setMatrixAt(idx1, dummy.matrix);
        ones.instanceColor.setXYZ(idx1, c.r, c.g, c.bl);
        idx1++;
      }
    }
  }

  zeros.count = idx0;
  ones.count = idx1;

  zeros.instanceMatrix.needsUpdate = true;
  ones.instanceMatrix.needsUpdate = true;
  zeros.instanceColor.needsUpdate = true;
  ones.instanceColor.needsUpdate = true;

  composer.render();
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

/* ================= RESIZE ================= */

window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});
