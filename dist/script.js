try {
  // Green status box (auto-hides)
  const status = document.createElement("div");
  status.style.cssText = `
    position:fixed; top:12px; left:12px; z-index:9999;
    font: 12px/1.2 monospace; color:#0f0;
    background: rgba(0,0,0,0.55);
    padding:8px 10px; border-radius:8px;
    pointer-events:none;
    transition: opacity 0.6s ease;`;
  status.textContent = "Loading script.js v17...";
  document.body.appendChild(status);
  setTimeout(() => {
    status.style.opacity = "0";
    setTimeout(() => status.remove(), 700);
  }, 1600);

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

    // ---------- Bloom ----------
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
    const hintEl = document.getElementById("hint");

    // ---------- Scroll control ----------
    // Physical scroll (0..1)
    let scrollProgress = 0;

    // CHANGED: Virtual mapping makes the page *feel longer* (less sensitive wheel)
    // Larger value = more physical scroll needed to reach the same animation progress.
    const SCROLL_STRETCH = 1.85;

    // This is the progress the animation actually uses (0..1)
    let tProg = 0;

    function updateScrollProgress() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = maxScroll <= 0 ? 0 : Math.min(Math.max(window.scrollY / maxScroll, 0), 1);

      // CHANGED: map physical scroll -> slower virtual progress
      // Example: with 1.85, you reach virtual 1.0 only near the *very* bottom.
      tProg = Math.min(scrollProgress / SCROLL_STRETCH, 1);
    }
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    updateScrollProgress();

    function smoothstep(edge0, edge1, x) {
      const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
      return t * t * (3 - 2 * t);
    }

    // CHANGED: New curve = slower longer before reverse
    function speedFromScroll(t) {
      // These operate on VIRTUAL progress (tProg)
      const slowStart = 0.22;  // start slowing earlier
      const stopPoint = 0.58;  // reach near-stop later
      const flipPoint = 0.74;  // reverse much later (more slow time)

      if (t < slowStart) return 1.0;

      // ease down from 1 -> 0.05 (very slow)
      if (t < stopPoint) {
        const k = smoothstep(slowStart, stopPoint, t);
        return THREE.MathUtils.lerp(1.0, 0.05, k);
      }

      // linger near-zero before reverse
      if (t < flipPoint) {
        const k = smoothstep(stopPoint, flipPoint, t);
        return THREE.MathUtils.lerp(0.05, 0.0, k);
      }

      // after flip, go negative (upwards) gradually (but burst will override near end)
      return THREE.MathUtils.lerp(0.0, -1.25, smoothstep(flipPoint, 1.0, t));
    }

    function revealFromScroll(t) {
      // CHANGED: name should be AFTER burst; we’ll control reveal directly in code.
      // Keeping this for compatibility, but not used for showing name during rain.
      return t > 0.62;
    }

    // ---------- End “energy rush” + blackout state ----------
    // CHANGED: Burst points now use VIRTUAL progress (tProg)
    const BURST_POINT = 0.92;     // near the end of the virtual scroll
    const BURST_DURATION = 2.2;   // seconds
    const RESET_POINT = 0.45;     // scroll back up past here (virtual) to restore

    let burstActive = false;
    let burstDone = false;
    let burstStart = 0;
    let blank = false;

    // ---------- Glyph set ----------
    const GLYPHS = [
      "0","1","2","3","4","5","6","7","8","9",
      "@","#","$","%","&","*","+","-","=","/","\\",
      "∑","∆","≡","⊕","◆","◇","◈","○","◎",
      "ﾅ","ﾐ","ｻ","ﾗ","ﾄ","ﾘ","ﾇ","ﾍ"
    ];

    // ---------- Texture builder ----------
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

    // ---------- Instanced meshes ----------
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

    function clearGlyphs() {
      for (let g = 0; g < glyphMeshes.length; g++) {
        glyphMeshes[g].count = 0;
        glyphMeshes[g].instanceMatrix.needsUpdate = true;
      }
    }

    function initialPlace() {
      for (let g = 0; g < glyphMeshes.length; g++) glyphMeshes[g].count = 0;
      const counts = new Array(GLYPHS.length).fill(0);

      for (let i = 0; i < COUNT; i++) {
        const d = drops[i];
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
    }
    initialPlace();

    // ---------- Animation ----------
    let last = performance.now();

    function animate(now) {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      // Reset behavior when user scrolls back up (use virtual progress)
      if (tProg < RESET_POINT && (blank || burstDone || burstActive)) {
        burstActive = false;
        burstDone = false;
        blank = false;
        for (const m of glyphMeshes) m.material.blending = THREE.NormalBlending;
        initialPlace();
      }

      // Trigger burst near end of VIRTUAL scroll
      if (!burstActive && !burstDone && tProg >= BURST_POINT) {
        burstActive = true;
        burstStart = now;
      }

      // If blank, keep screen black + SHOW NAME AFTER BURST
      if (blank) {
        // CHANGED: show name after rush
        revealEl?.classList.add("show");
        hintEl?.classList.add("hide");

        clearGlyphs();
        bloomPass.strength = 0.0;
        composer.render();
        requestAnimationFrame(animate);
        return;
      }

      // During normal rain: hide name (so it appears only after rush)
      revealEl?.classList.remove("show");

      // Determine speed + glow from scroll / burst state
      let spd = speedFromScroll(tProg);

      const tighten = smoothstep(0.05, 0.75, tProg);
      let strength = THREE.MathUtils.lerp(2.35, 0.95, tighten);
      let radius = THREE.MathUtils.lerp(0.85, 0.40, tighten);
      let threshold = THREE.MathUtils.lerp(0.06, 0.33, tighten);

      if (burstActive) {
        const elapsed = (now - burstStart) / 1000;
        if (elapsed < BURST_DURATION) {
          // super fast upward rush
          spd = -9.0;

          // maximum bloom for “solid blur line”
          strength = 3.2;
          radius = 1.05;
          threshold = 0.02;

          for (const m of glyphMeshes) m.material.blending = THREE.AdditiveBlending;
        } else {
          // End burst -> blackout
          burstActive = false;
          burstDone = true;
          blank = true;

          clearGlyphs();

          // CHANGED: show name after rush, not before
          revealEl?.classList.add("show");
          hintEl?.classList.add("hide");

          composer.render();
          requestAnimationFrame(animate);
          return;
        }
      } else {
        for (const m of glyphMeshes) m.material.blending = THREE.NormalBlending;
      }

      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;

      // Hint: still show early, hide later / during burst
      hintEl?.classList.toggle("hide", tProg > 0.10 || burstActive);

      const counts = new Array(GLYPHS.length).fill(0);
      const flickerChance = burstActive ? 0.12 : 0.02;

      for (let i = 0; i < COUNT; i++) {
        const d = drops[i];

        d.y -= dt * 18 * d.sp * spd;

        // wrap
        if (spd >= 0) {
          if (d.y < -SPAWN.y) d.y = SPAWN.y;
        } else {
          if (d.y > SPAWN.y) d.y = -SPAWN.y;
        }

        if (Math.random() < flickerChance) {
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
    position:fixed; top:12px; left:12px; z-index:9999;
    font: 12px/1.3 monospace; color:#fff;
    background: rgba(255,0,0,0.75);
    padding:10px 12px; border-radius:8px; max-width: 90vw;`;
  fail.textContent = "❌ script.js failed: " + (err?.message || err);
  document.body.appendChild(fail);
}
