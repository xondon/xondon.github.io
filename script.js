try {
  // Green status box (auto-hides)
  const status = document.createElement("div");
  status.style.cssText = `
    position:fixed; top:48px; left:10px; z-index:9999;
    font: 12px/1.2 monospace; color:#0f0;
    background: rgba(0,0,0,0.55);
    padding:8px 10px; border-radius:8px;
    pointer-events:none;
    transition: opacity 0.6s ease;`;
  status.textContent = "Loading script.js v13...";
  document.body.appendChild(status);

  setTimeout(() => {
    status.style.opacity = "0";
    setTimeout(() => status.remove(), 700);
  }, 2000);

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
    scene.background = new THREE.Color(0x050605);

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 260);
    camera.position.set(0, 6, 32);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    scene.fog = new THREE.Fog(0x050605, 25, 120);

    // ---------- Bloom (scroll-driven) ----------
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.25,
      0.55,
      0.18
    );
    composer.addPass(bloomPass);

    // ---------- UI ----------
    const revealEl = document.getElementById("reveal");
    const hintEl = document.getElementById("hint");

    // ---------- Scroll control ----------
    let scrollProgress = 0;
    function updateScrollProgress() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = maxScroll <= 0 ? 0 : Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    }
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    updateScrollProgress();

    function speedFromScroll(t) {
      const stopPoint = 0.35;
      const flipPoint = 0.55;

      if (t < stopPoint) return THREE.MathUtils.lerp(1.0, 0.10, t / stopPoint);
      if (t < flipPoint) return THREE.MathUtils.lerp(0.10, 0.0, (t - stopPoint) / (flipPoint - stopPoint));
      return THREE.MathUtils.lerp(0.0, -1.25, (t - flipPoint) / (1.0 - flipPoint));
    }
    function revealFromScroll(t) {
      return t > 0.62;
    }

    function smoothstep(edge0, edge1, x) {
      const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
      return t * t * (3 - 2 * t);
    }

    // ---------- Glyph set ----------
    const GLYPHS = [
      "0","1","2","3","4","5","6","7","8","9",
      "@","#","$","%","&","*","+","-","=","/","\\",
      "∑","∆","≡","⊕","◆","◇","◈","○","◎",
      "ﾅ","ﾐ","ｻ","ﾗ","ﾄ","ﾘ","ﾇ","ﾍ"
    ];

    // ---------- Texture builder (crisp + glow) ----------
    function makeGlyphTexture(ch) {
      const size = 256;
      const cnv = document.createElement("canvas");
      cnv.width = size;
      cnv.height = size;
      const ctx = cnv.getContext("2d");

      ctx.clearRect(0, 0, size, size);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // soft glow pass
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.font = "900 150px monospace";
      ctx.shadowColor = "rgba(0,255,120,0.65)";
      ctx.shadowBlur = 22;
      ctx.fillStyle = "rgba(0,255,120,0.28)";
      ctx.fillText(ch, 0, 8);
      ctx.restore();

      // crisp pass
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.shadowBlur = 0;
      ctx.font = "900 150px monospace";
      ctx.fillStyle = "rgba(165,255,205,0.98)";
      ctx.fillText(ch, 0, 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,120,55,0.55)";
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

    // ---------- Instanced meshes ----------
    const COUNT = 1000;

    // Bigger glyphs
    const geo = new THREE.PlaneGeometry(1.75, 1.75);

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

    const SPAWN = { x: 52, y: 72, zNear: 18, zFar: -95 };

    const drops = Array.from({ length: COUNT }, () => ({
      x: rand(-SPAWN.x, SPAWN.x),
      y: rand(-SPAWN.y, SPAWN.y),
      z: rand(SPAWN.zFar, SPAWN.zNear),
      s: 0.75 + Math.random() * 1.05,
      sp: 0.6 + Math.random() * 2.2,
      glyph: Math.floor(Math.random() * GLYPHS.length),
    }));

    // Initial placement
    for (let g = 0; g < glyphMeshes.length; g++) glyphMeshes[g].count = 0;
    const initCounts = new Array(GLYPHS.length).fill(0);

    for (let i = 0; i < COUNT; i++) {
      const d = drops[i];
      const gi = d.glyph;
      const idx = initCounts[gi]++;
      if (idx >= COUNT) continue;

      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      glyphMeshes[gi].setMatrixAt(idx, dummy.matrix);
    }

    for (let g = 0; g < glyphMeshes.length; g++) {
      glyphMeshes[g].count = initCounts[g];
      glyphMeshes[g].instanceMatrix.needsUpdate = true;
    }

    // ---------- Animation ----------
    let last = performance.now();

    function animate(now) {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      const spd = speedFromScroll(scrollProgress);

      revealEl?.classList.toggle("show", revealFromScroll(scrollProgress));
      hintEl?.classList.toggle("hide", scrollProgress > 0.12);

      // Scroll-driven glow tuning (strong at top, tighter later)
      const t = scrollProgress;
      const tighten = smoothstep(0.05, 0.55, t);
      bloomPass.strength  = THREE.MathUtils.lerp(1.75, 0.75, tighten);
      bloomPass.radius    = THREE.MathUtils.lerp(0.75, 0.35, tighten);
      bloomPass.threshold = THREE.MathUtils.lerp(0.08, 0.35, tighten);

      const counts = new Array(GLYPHS.length).fill(0);

      for (let i = 0; i < COUNT; i++) {
        const d = drops[i];

        d.y -= dt * 18 * d.sp * spd;

        if (spd >= 0) {
          if (d.y < -SPAWN.y) d.y = SPAWN.y;
        } else {
          if (d.y > SPAWN.y) d.y = -SPAWN.y;
        }

        if (Math.random() < 0.02) {
          d.glyph = Math.floor(Math.random() * GLYPHS.length);
        }

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
    position:fixed; top:48px; left:10px; z-index:9999;
    font: 12px/1.3 monospace; color:#fff;
    background: rgba(255,0,0,0.75);
    padding:10px 12px; border-radius:8px; max-width: 90vw;`;
  fail.textContent = "❌ script.js failed: " + (err?.message || err);
  document.body.appendChild(fail);
}
