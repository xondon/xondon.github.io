import "./style.css";
import * as THREE from "three";

/**
 * Concept:
 * - We render "matrix rain" as instanced planes (each with a 0/1 character).
 * - Scroll progress controls speed:
 *   * Start: falling fast
 *   * Scroll: slows to stop
 *   * Past threshold: reverses upward
 * - When reversed enough, show name + company overlay.
 */

// ---------- Basic setup ----------
const canvas = document.getElementById("c");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0b);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 6, 28);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));

// ---------- Create a tiny texture with "0" and "1" ----------
function makeDigitTexture(digit) {
  const size = 128;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d");

  // background transparent
  ctx.clearRect(0, 0, size, size);

  // glow-ish digit
  ctx.font = "bold 92px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // subtle outer glow
  ctx.shadowColor = "rgba(0, 200, 83, 0.45)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(0, 200, 83, 0.95)";
  ctx.fillText(String(digit), size / 2, size / 2 + 4);

  const tex = new THREE.CanvasTexture(cnv);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return tex;
}

const tex0 = makeDigitTexture(0);
const tex1 = makeDigitTexture(1);

const planeGeo = new THREE.PlaneGeometry(1, 1);

// Two instanced meshes: one for zeros, one for ones
const countPerDigit = 900; // adjust 400–2000 safely depending on GPU
const material0 = new THREE.MeshBasicMaterial({ map: tex0, transparent: true, depthWrite: false });
const material1 = new THREE.MeshBasicMaterial({ map: tex1, transparent: true, depthWrite: false });

const zeros = new THREE.InstancedMesh(planeGeo, material0, countPerDigit);
const ones = new THREE.InstancedMesh(planeGeo, material1, countPerDigit);
zeros.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
ones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(zeros, ones);

// ---------- Particle-ish data ----------
const rand = (min, max) => min + Math.random() * (max - min);

// World bounds (tweak for density)
const bounds = {
  x: 34,
  z: 34,
  yTop: 34,
  yBottom: -34,
};

// Each instance gets its own position + velocity + scale + trail offset
function makeDrops(n) {
  const drops = new Array(n);
  for (let i = 0; i < n; i++) {
    drops[i] = {
      x: rand(-bounds.x, bounds.x),
      y: rand(bounds.yBottom, bounds.yTop),
      z: rand(-bounds.z, bounds.z),
      speed: rand(0.8, 2.2),   // base speed multiplier
      scale: rand(0.35, 0.8),  // make digits vary
      rot: rand(-0.12, 0.12),
      alpha: rand(0.25, 0.95),
    };
  }
  return drops;
}

const drops0 = makeDrops(countPerDigit);
const drops1 = makeDrops(countPerDigit);

const dummy = new THREE.Object3D();

// ---------- “Trails” effect (cheap + convincing) ----------
/**
 * Instead of real motion blur, we render 2-3 layers by slightly offsetting Y in shader… BUT we’ll keep it simple:
 * We fake trails by scaling and lowering opacity via instance color.
 * InstancedMesh supports instanceColor; we’ll use it to vary alpha.
 */
zeros.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(countPerDigit * 3), 3);
ones.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(countPerDigit * 3), 3);
material0.vertexColors = true;
material1.vertexColors = true;

// Write per-instance "green tint" (alpha is handled by material opacity per frame)
function setInstanceTint(mesh, i, a) {
  // bright green but scaled by a (we’ll also set material opacity globally)
  const g = 0.85 + 0.15 * Math.random();
  mesh.instanceColor.setXYZ(i, 0.0, g * a, 0.0);
}

// ---------- Scroll-driven behavior ----------
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

// Map scroll to speed:
// - start: falling fast
// - middle: slow to stop
// - later: reverse upward
function speedFromScroll(t) {
  // tweak these to taste:
  // stopPoint: where it fully stops
  // flipPoint: where it begins going upward
  const stopPoint = 0.35;
  const flipPoint = 0.55;

  if (t < stopPoint) {
    // 1.0 down to 0.05
    return THREE.MathUtils.lerp(1.0, 0.05, t / stopPoint);
  }
  if (t < flipPoint) {
    // hover near stop
    return THREE.MathUtils.lerp(0.05, 0.0, (t - stopPoint) / (flipPoint - stopPoint));
  }
  // reverse: 0.0 up to -1.2
  return THREE.MathUtils.lerp(0.0, -1.2, (t - flipPoint) / (1.0 - flipPoint));
}

function revealFromScroll(t) {
  // show text once reversing has "committed"
  return t > 0.62;
}

// ---------- Animation loop ----------
let last = performance.now();

function animate(now) {
  const dt = Math.min((now - last) / 1000, 0.033); // clamp delta
  last = now;

  const scrollSpeed = speedFromScroll(scrollProgress);

  // UI states
  const show = revealFromScroll(scrollProgress);
  revealEl.classList.toggle("show", show);
  hintEl.classList.toggle("hide", scrollProgress > 0.12);

  // material opacity shifts with scroll: more “misty” during stop/reverse
  const globalOpacity = THREE.MathUtils.clamp(0.95 - Math.abs(scrollSpeed) * 0.2, 0.55, 0.95);
  material0.opacity = globalOpacity;
  material1.opacity = globalOpacity;

  // move and update instances
  for (let i = 0; i < countPerDigit; i++) {
    // Zeros
    {
      const d = drops0[i];
      d.y -= dt * 10.0 * d.speed * scrollSpeed; // minus because down is negative speed
      if (scrollSpeed >= 0) {
        // falling
        if (d.y < bounds.yBottom) d.y = bounds.yTop + rand(0, 8);
      } else {
        // rising
        if (d.y > bounds.yTop) d.y = bounds.yBottom - rand(0, 8);
      }

      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(0, d.rot, 0);
      dummy.scale.setScalar(d.scale);
      dummy.updateMatrix();
      zeros.setMatrixAt(i, dummy.matrix);

      // instance tint (trail-ish variation)
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

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// ---------- Resize ----------
window.addEventListener("resize", () => {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- Accessibility: reduced motion ----------
const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");
if (reduce?.matches) {
  // If user prefers reduced motion, jump straight to reveal & stop heavy animation.
  revealEl.classList.add("show");
  hintEl.classList.add("hide");
}
