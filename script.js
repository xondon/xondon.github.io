import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

console.log("✅ script.js v9 loaded");

// ---------- Canvas / Renderer ----------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

// ---------- Scene / Camera ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050605);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  260
);
camera.position.set(0, 6, 32);

// CHANGED: ensure camera is aimed into the scene
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.25));
scene.fog = new THREE.Fog(0x050605, 25, 120);

// ---------- Bloom ----------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // strength
  0.6, // radius
  0.1  // threshold
);
composer.addPass(bloomPass);

// ---------- UI hooks ----------
const revealEl = document.getElementById("reveal");
const hintEl = document.getElementById("hint");

// ---------- Scroll control ----------
let scrollProgress = 0;
function updateScrollProgress() {
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  scrollProgress =
    maxScroll <= 0 ? 0 : Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
}
window.addEventListener("scroll", updateScrollProgress, { passive: true });
updateScrollProgress();

function speedFromScroll(t) {
  const stopPoint = 0.35;
  const flipPoint = 0.55;

  if (t < stopPoint) return THREE.MathUtils.lerp(1.0, 0.10, t / stopPoint);
  if (t < flipPoint)
    return THREE.MathUtils.lerp(
      0.10,
      0.0,
      (t - stopPoint) / (flipPoint - stopPoint)
    );
  return THREE.MathUtils.lerp(0.0, -1.25, (t - flipPoint) / (1.0 - flipPoint));
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

  ctx.shadowColor = "rgba(0,255,120,0.85)";
  ctx.shadowBlur = 28;

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

// ---------- Instanced rain ----------
const COUNT = 900; // keep stable for performance; increase later if desired
const geo = new THREE.PlaneGeometry(1, 1);

const baseMat = {
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
};

const mat0 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex0 });
const mat1 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex1 });

const mesh0 = new THREE.InstancedMesh(geo, mat0, COUNT);
const mesh1 = new THREE.InstancedMesh(geo, mat1, COUNT);
scene.add(mesh0, mesh1);

const dummy = new THREE.Object3D();

function rand(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * CHANGED: Spawn box is guaranteed IN FRONT of the camera.
 * camera.z = 32; anything with z > 32 is behind camera and invisible.
 *
 * We'll spawn mostly between z = -90 and z = 20 (always < 32).
 */
const SPAWN = {
  x: 48,
  y: 65,
  zNear: 20,   // closer to camera but still in front
  zFar: -90,   // deeper into the scene
};

// Drop data
const drops = Array.from({ length: COUNT }, () => ({
  x: rand(-SPAWN.x, SPAWN.x),
  y: rand(-SPAWN.y, SPAWN.y),
  z: rand(SPAWN.zFar, SPAWN.zNear), // CHANGED: always in front of camera
  s: 0.35 + Math.random() * 0.95,
  sp: 0.6 + Math.random() * 2.2,
  bit: Math.random() > 0.5 ? 1 : 0,
}));

// CHANGED: Initialize matrices once so you see digits immediately
for (let i = 0; i < COUNT; i++) {
  const d = drops[i];
  dummy.position.set(d.x, d.y, d.z);
  dummy.scale.setScalar(d.s);
  dummy.updateMatrix();
  if (d.bit === 0) mesh0.setMatrixAt(i, dummy.matrix);
  else mesh1.setMatrixAt(i, dummy.matrix);
}
mesh0.instanceMatrix.needsUpdate = true;
mesh1.instanceMatrix.needsUpdate = true;

// ---------- Animation ----------
let last = performance.now();

function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  const spd = speedFromScroll(scrollProgress);

  // overlay states
  if (revealEl) revealEl.classList.toggle("show", revealFromScroll(scrollProgress));
  if (hintEl) hintEl.classList.toggle("hide", scrollProgress > 0.12);

  for (let i = 0; i < COUNT; i++) {
    const d = drops[i];

    // Move down/up based on scroll speed
    d.y -= dt * 18 * d.sp * spd;

    // wrap around vertically
    if (spd >= 0) {
      if (d.y < -SPAWN.y) d.y = SPAWN.y;
    } else {
      if (d.y > SPAWN.y) d.y = -SPAWN.y;
    }

    // flicker digits occasionally (not every frame to reduce “sparkle noise”)
    if (Math.random() < 0.03) d.bit = d.bit ^ 1;

    dummy.position.set(d.x, d.y, d.z);
    dummy.scale.setScalar(d.s);
    dummy.updateMatrix();

    if (d.bit === 0) mesh0.setMatrixAt(i, dummy.matrix);
    else mesh1.setMatrixAt(i, dummy.matrix);
  }

  mesh0.instanceMatrix.needsUpdate = true;
  mesh1.instanceMatrix.needsUpdate = true;

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

  // keep aiming at center
  camera.lookAt(0, 0, 0);
});
