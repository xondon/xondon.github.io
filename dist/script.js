// src/main.js
import "./style.css";
import * as THREE from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";

/**
 * 3D Matrix Rain w/ Scroll Control + Real Motion Trails (AfterimagePass)
 * - start: rain falls fast
 * - scroll: slows to stop
 * - scroll more: reverses upward
 * - reveal name/company overlay once reversed enough
 */

const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0b);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 6, 28);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));

// ---------------- Postprocessing: Trails (Afterimage) ----------------
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const afterimagePass = new AfterimagePass();
// Higher = longer trails; 0.85–0.93 is typical
afterimagePass.uniforms.damp.value = 0.90;
composer.addPass(afterimagePass);

// ---------------- Digit textures (0 / 1) ----------------
function makeDigitTexture(digit) {
  const size = 128;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;

  const ctx = cnv.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  ctx.font = "bold 92px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.shadowColor = "rgba(0, 200, 83, 0.55)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "rgba(0, 200, 83, 0.98)";
  ctx.fillText(String(digit), size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(cnv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const tex0 = makeDigitTexture(0);
const tex1 = makeDigitTexture(1);

// ---------------- Instanced digits (FAST) ----------------
const planeGeo = new THREE.PlaneGeometry(1, 1);

const countPerDigit = 900; // safe default; try 600–1800
const material0 = new THREE.MeshBasicMaterial({
  map: tex0,
  transparent: true,
  depthWrite: false,
  opacity: 0.9,
});
const material1 = new THREE.MeshBasicMaterial({
  map: tex1,
  transparent: true,
  depthWrite: false,
  opacity: 0.9,
});

const zeros = new THREE.InstancedMesh(planeGeo, material0, countPerDigit);
const ones = new THREE.InstancedMesh(planeGeo, material1, countPerDigit);
zeros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

// Per-instance tint variation (adds depth + pseudo-trail vibe)
zeros.instanceColor = new THREE.InstancedBufferAttribute(
  new Float32Array(countPerDigit * 3),
  3
);
ones.instanceColor = new THREE.InstancedBufferAttribute(
  new Float32Array(countPerDigit * 3),
  3
);
material0.vertexColors = true;
material1.vertexColors = true;

scene.add(zeros, ones);

const rand = (min, max) => min + Math.random() * (max - min);

const bounds = {
  x: 34,
  z: 34,
  yTop: 34,
  yBottom: -34,
};

function makeDrops(n) {
  const drops = new Array(n);
  for (let i = 0; i < n; i++) {
    drops[i] = {
      x: rand(-bounds.x, bounds.x),
      y: rand(bounds.yBottom, bounds.yTop),
      z: rand(-bounds.z, bounds.z),
      speed: rand(0.8, 2.2),
      scale: rand(0.35, 0.8),
      rot: rand(-0.12, 0.12),
      alpha: rand(0.25, 0.95),
    };
  }
  return drops;
}

const drops0 = makeDrops(countPerDigit);
const drops1 = makeDrops(countPerDigit);

const dummy = new THREE.Object3D();

function setInstanceTint(mesh, i, a) {
  // green channel dominates; vary slightly for depth
  const g = 0.85 + 0.15 * Math.random();
  mesh.instanceColor.setXYZ(i, 0.0, g * a, 0.0);
}

// ---------------- Scroll-driven behavior ----------------
let scrollProgress = 0; // 0..1
const revealEl = document.querySelector(".reveal");
const hintEl = document.querySelector(".scrollHint");

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

  if (t < stopPoint) {
    return THREE.MathUtils.lerp(1.0, 0.05, t / stopPoint);
  }
  if (t < flipPoint) {
    return THREE.MathUtils.lerp(
      0.05,
      0.0,
      (t - stopPoint) / (flipPoint - stopPoint)
    );
  }
  return THREE.MathUtils.lerp(0.0, -1.2, (t - flipPoint) / (1.0 - flipPoint));
}

function revealFromScroll(t) {
  return t > 0.62;
}

// ---------------- Animation loop ----------------
let last = performance.now();

function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  const scrollSpeed = speedFromScroll(scrollProgress);

  // UI overlay states
  const show = revealFromScroll(scrollProgress);
  revealEl?.classList.toggle("show", show);
  hintEl?.classList.toggle("hide", scrollProgress > 0.12);

  // Material opacity slightly changes with motion
  const globalOpacity = THREE.MathUtils.clamp(
    0.95 - Math.abs(scrollSpeed) * 0.2,
    0.55,
    0.95
  );
  material0.opacity = globalOpacity;
  material1.opacity = globalOpacity;

  // Trail length reacts to motion:
  // When stopped, reduce trails to avoid heavy smearing on static frames.
  const speedAbs = Math.min(Math.abs(scrollSpeed), 1.2);
  afterimagePass.uniforms.damp.value = THREE.MathUtils.lerp(
    0.96, // short trails (near stop)
    0.86, // long trails (fast motion)
    speedAbs / 1.2
  );

  // Update instances
  for (let i = 0; i < countPerDigit; i++) {
    // Zeros
    {
      const d = drops0[i];
      d.y -= dt * 10.0 * d.speed * scrollSpeed;

      if (scrollSpeed >= 0) {
        if (d.y < bounds.yBottom) d.y = bounds.yTop + rand(0, 8);
      } else {
        if (d.y > bounds.yTop) d.y = bounds.yBottom - rand(0, 8);
      }

      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.setScalar(d.scale);
      dummy.updateMatrix();
      zeros.setMatrixAt(i, dummy.matrix);

      setInstanceTint(zeros, i, d.alpha);
    }

    // Ones
    {
      const d = drops1[i];
      d.y -= dt * 10.0 * d.speed * scrollSpeed;

      if (scrollSpeed >= 0) {
        if (d.y < bounds.yBottom) d.y = bounds.yTop + rand(0, 8);
      } else {
        if (d.y > bounds.yTop) d.y = bounds.yBottom - rand(0, 8);
      }

      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.setScalar(d.scale);
      dummy.updateMatrix();
      ones.setMatrixAt(i, dummy.matrix);

      setInstanceTint(ones, i, d.alpha);
    }
  }

  zeros.instanceMatrix.needsUpdate = true;
  ones.instanceMatrix.needsUpdate = true;
  zeros.instanceColor.needsUpdate = true;
  ones.instanceColor.needsUpdate = true;

  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// ---------------- Resize ----------------
window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);

  composer.setSize(window.innerWidth, window.innerHeight);

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------------- Reduced motion ----------------
const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
if (reduce?.matches) {
  revealEl?.classList.add("show");
  hintEl?.classList.add("hide");
  // Short trails so it doesn't smear on static frames
  afterimagePass.uniforms.damp.value = 0.98;
}
