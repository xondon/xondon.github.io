try {
  // Always start at top on refresh / back-forward cache
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const goTop = () => window.scrollTo(0, 0);
  document.addEventListener("DOMContentLoaded", goTop);
  window.addEventListener("pageshow", goTop);

  // Small green status (auto-hide)
  const status = document.createElement("div");
  status.style.cssText = `
    position:fixed; top:12px; left:12px; z-index:9999;
    font: 12px/1.2 monospace; color:#0f0;
    background: rgba(0,0,0,0.55);
    padding:8px 10px; border-radius:8px;
    pointer-events:none;
    transition: opacity 0.6s ease;`;
  status.textContent = "Loading script.js v40...";
  document.body.appendChild(status);
  setTimeout(() => {
    status.style.opacity = "0";
    setTimeout(() => status.remove(), 700);
  }, 1200);

  import("three").then(async (THREE) => {
    const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
    const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
    const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");

    // ---------- Setup ----------
    const canvas = document.getElementById("c");
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 260);
    camera.position.set(0, 6, 32);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    scene.fog = new THREE.Fog(0x000000, 25, 120);

    // ---------- Post ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.4,
      0.65,
      0.12
    );
    composer.addPass(bloomPass);

    // ---------- UI ----------
    const revealEl = document.getElementById("reveal");
    const actionsEl = document.getElementById("actions");
    const hintEl = document.getElementById("hint");

    // ---------- Scroll ----------
    let scrollProgress = 0; // 0..1
    let tProg = 0;          // 0..1 (slower early)

    const GAMMA = 1.5; // slightly less “stretched” so there’s room for text/buttons/rush

    function readScroll() {
      const doc = document.documentElement;
      const maxScroll = Math.max(0, doc.scrollHeight - window.innerHeight);
      const y = window.scrollY || doc.scrollTop || 0;
      const clamped = Math.min(Math.max(y, 0), maxScroll);

      scrollProgress = maxScroll <= 0 ? 0 : (clamped / maxScroll);
      tProg = Math.pow(scrollProgress, GAMMA);

      const pxFromBottom = Math.max(0, maxScroll - clamped);
      return { maxScroll, y: clamped, pxFromBottom };
    }
    window.addEventListener("scroll", readScroll, { passive: true });
    let scrollInfo = readScroll();

    function smoothstep(edge0, edge1, x) {
      const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
      return t * t * (3 - 2 * t);
    }

    // ---------- Speed curve ----------
    function speedFromScroll(t) {
      const slowStart = 0.18;
      const stopPoint = 0.55;
      const flipPoint = 0.72;

      if (t < slowStart) return 1.0;

      if (t < stopPoint) {
        const k = smoothstep(slowStart, stopPoint, t);
        return THREE.MathUtils.lerp(1.0, 0.08, k);
      }

      if (t < flipPoint) {
        const k = smoothstep(stopPoint, flipPoint, t);
        return THREE.MathUtils.lerp(0.08, 0.0, k);
      }

      return THREE.MathUtils.lerp(0.0, -1.25, smoothstep(flipPoint, 1.0, t));
    }

    // ---------- Reveal timing ----------
    // CHANGED: text shows earlier, buttons show later (both based on virtual progress)
    const TEXT_POINT = 0.62;
    const BUTTON_POINT = 0.78;

    // ---------- Rush (optional “energy”) ----------
    const RUSH_POINT = 0.90;
    const RUSH_DURATION = 1.8;
    const ACTIVATE_PX_FROM_BOTTOM = 12;

    let rushActive = false;
    let rushDone = false;
    let rushStart = 0;

    // ---------- Glyphs ----------
    const GLYPHS = [
      "0","1","2","3","4","5","6","7","8","9",
      "@","#","$","%","&","*","+","-","=","/","\\",
      "∑","∆","≡","⊕","◆","◇","◈","○","◎",
      "ﾅ","ﾐ","ｻ","ﾗ","ﾄ","ﾘ","ﾇ","ﾍ"
    ];

    function makeGlyphTexture(ch) {
      const size = 256;
      const cnv = document.createElement("canvas");
      cnv.width = size;
      cnv.height = size;
      const ctx = cnv.getContext("2d");

      ctx.clearRect(0, 0, size, size);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // glow pass
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.font = "900 150px monospace";
      ctx.shadowColor = "rgba(0,255,120,0.7)";
      ctx.shadowBlur = 26;
      ctx.fillStyle = "rgba(0,255,120,0.30)";
      ctx.fillText(ch, 0, 8);
      ctx.restore();

      // crisp core
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.shadowBlur = 0;
      ctx.font = "900 150px monospace";
      ctx.fillStyle = "rgba(180,255,215,0.98)";
      ctx.fillText(ch, 0, 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,110,55,0.55)";
      ctx.strokeText(ch, 0, 8);
      ctx.restore();

      const tex = new THREE.CanvasTexture(cnv);
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      if ("colorSpace" in tex) tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    }

    const glyphTextures = GLYPHS.map(makeGlyphTexture);

    // ---------- Instancing ----------
    const COUNT = 1100;
    const geo = new THREE.PlaneGeometry(2.10, 2.10);

    const baseMat = {
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.98,
    };

    const glyphMeshes = GLYPHS.map((_, i) => {
      const mat = new THREE.MeshBasicMaterial({ ...baseMat, map: glyphTextures[i] });
      const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
      return mesh;
    });

    const dummy = new THREE.Object3D();
    const rand = (min, max) => min + Math.random() * (max - min);
    const SPAWN = { x: 54, y: 75, zNear: 18, zFar: -100 };

    const drops = Array.from({ length: COUNT }, () => ({
      x: rand(-SPAWN.x, SPAWN.x),
      y: rand(-SPAWN.y, SPAWN.y),
      z: rand(SPAWN.zFar, SPAWN.zNear),
      s: 0.90 + Math.random() * 1.15,
      sp: 0.6 + Math.random() * 2.2,
      glyph: Math.floor(Math.random() * GLYPHS.length),
    }));

    // ---------- Animation ----------
    let last = performance.now();

    function animate(now) {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      scrollInfo = readScroll();
      const atBottomPx = scrollInfo.pxFromBottom <= ACTIVATE_PX_FROM_BOTTOM;

      // Reveal text + buttons by scroll
      const showText = tProg >= TEXT_POINT;
      const showButtons = tProg >= BUTTON_POINT;

      revealEl?.classList.toggle("show", showText);
      actionsEl?.classList.toggle("show", showButtons);

      // Hint hides after you start scrolling or after text shows
      hintEl?.classList.toggle("hide", tProg > 0.08 || showText);

      // Trigger rush near end (optional)
      if (!rushActive && !rushDone && (tProg >= RUSH_POINT || atBottomPx)) {
        rushActive = true;
        rushStart = now;
      }

      let spd = speedFromScroll(tProg);

      // Bloom scales with scroll
      const tighten = smoothstep(0.05, 0.75, tProg);
      let strength = THREE.MathUtils.lerp(2.35, 0.95, tighten);
      let radius = THREE.MathUtils.lerp(0.85, 0.40, tighten);
      let threshold = THREE.MathUtils.lerp(0.06, 0.33, tighten);

      if (rushActive) {
        const elapsed = (now - rushStart) / 1000;
        if (elapsed < RUSH_DURATION) {
          spd = -9.0;
          strength = 3.0;
          radius = 1.0;
          threshold = 0.02;
          for (const m of glyphMeshes) m.material.blending = THREE.AdditiveBlending;
        } else {
          rushActive = false;
          rushDone = true;
          for (const m of glyphMeshes) m.material.blending = THREE.NormalBlending;
        }
      } else {
        for (const m of glyphMeshes) m.material.blending = THREE.NormalBlending;
      }

      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;

      // Instances
      const counts = new Array(GLYPHS.length).fill(0);
      const flickerChance = rushActive ? 0.12 : 0.02;

      for (let i = 0; i < COUNT; i++) {
        const d = drops[i];

        d.y -= dt * 18 * d.sp * spd;

        if (spd >= 0) {
          if (d.y < -SPAWN.y) d.y = SPAWN.y;
        } else {
          if (d.y > SPAWN.y) d.y = -SPAWN.y;
        }

        if (Math.random() < flickerChance) d.glyph = Math.floor(Math.random() * GLYPHS.length);

        const gi = d.glyph;
        const idx = counts[gi]++;
        if (idx >= COUNT) continue;

        dummy.position.set(d.x, d.y, d.z);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        glyphMeshes[gi].setMatrixAt(idx, dummy.matrix);
      }

      for (let g = 0; g < glyphMeshes.length; g++) {
        glyphMeshes[g].count = counts[g];
        glyphMeshes[g].instanceMatrix.needsUpdate = true;
      }

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
      camera.lookAt(0, 0, 0);
    });
  });
} catch (err) {
  console.error(err);
  const fail = document.createElement("div");
  fail.style.cssText = `
    position:fixed; top:12px; left:12px; z-index:9999;
    font: 12px/1.3 monospace; color:#fff;
    background: rgba(255,0,0,0.75);
    padding:10px 12px; border-radius:8px; max-width: 90vw;`;
  fail.textContent = "❌ script.js failed: " + (err?.message || err);
  document.body.appendChild(fail);
}
