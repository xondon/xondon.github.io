try {
  // Green status (auto-hide)
  const status = document.createElement("div");
  status.style.cssText = `
    position:fixed; top:12px; left:12px; z-index:9999;
    font: 12px/1.2 monospace; color:#0f0;
    background: rgba(0,0,0,0.55);
    padding:8px 10px; border-radius:8px;
    pointer-events:none;
    transition: opacity 0.6s ease;`;
  status.textContent = "Loading script.js v16...";
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

    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 280);
    camera.position.set(0, 6, 32);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.22));
    scene.fog = new THREE.Fog(0x000000, 25, 130);

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
    let scrollProgress = 0;
    function updateScrollProgress() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = maxScroll <= 0 ? 0 : Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    }
    window.addEventListener("scroll", updateScrollProgress, { passive: true });
    updateScrollProgress();

    // ---------- Timing / Zones ----------
    // These zones control the “feel” you described:
    // fall -> slow -> STOP + linger -> scroll more -> WIPE
    const SLOW_START = 0.22;
    const STOP_POINT = 0.46;   // enters full stop
    const LINGER_END = 0.58;   // still 0 speed through here (more present)
    const WIPE_POINT = 0.64;   // scroll past this to trigger stream wipe
    const RESET_POINT = 0.30;  // scroll back up past this to return to rain

    // stream wipe duration
    const STREAM_BURST_DURATION = 2.0;

    function smoothstep(edge0, edge1, x) {
      const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
      return t * t * (3 - 2 * t);
    }

    // speed profile with a stronger linger
    function speedFromScroll(t) {
      if (t < SLOW_START) return 1.0;

      // Slow down to 0
      if (t < STOP_POINT) {
        const k = smoothstep(SLOW_START, STOP_POINT, t);
        return THREE.MathUtils.lerp(1.0, 0.0, k);
      }

      // Linger at 0 for a longer mid region
      if (t < LINGER_END) return 0.0;

      // After linger, keep near 0 until wipe triggers
      if (t < WIPE_POINT) {
        // tiny subtle drift so it feels alive but basically stopped
        return 0.03;
      }

      // We won’t use “reverse” speed here; wipe takes over.
      return 0.0;
    }

    // ---------- Trigger points ----------
    let mode = "RAIN"; // "RAIN" | "STREAM" | "BLACK"
    let streamStart = 0;

    // ---------- Glyph set ----------
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
      ctx.shadowColor = "rgba(0,255,120,0.75)";
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

    const baseMat = {
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.98,
    };

    // Larger symbols
    const glyphGeo = new THREE.PlaneGeometry(2.15, 2.15);

    const dummy = new THREE.Object3D();
    const rand = (min, max) => min + Math.random() * (max - min);

    const SPAWN = { x: 54, y: 75, zNear: 18, zFar: -105 };

    // ============================================================
    // MODE A: Rain
    // ============================================================
    const RAIN_COUNT = 1100;

    const rainMeshes = GLYPHS.map((_, i) => {
      const mat = new THREE.MeshBasicMaterial({ ...baseMat, map: glyphTextures[i] });
      const mesh = new THREE.InstancedMesh(glyphGeo, mat, RAIN_COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.visible = true;
      scene.add(mesh);
      return mesh;
    });

    const rainDrops = Array.from({ length: RAIN_COUNT }, () => ({
      x: rand(-SPAWN.x, SPAWN.x),
      y: rand(-SPAWN.y, SPAWN.y),
      z: rand(SPAWN.zFar, SPAWN.zNear),
      s: 0.95 + Math.random() * 1.20,
      sp: 0.6 + Math.random() * 2.2,
      glyph: Math.floor(Math.random() * GLYPHS.length),
    }));

    function placeRainOnce() {
      for (let g = 0; g < rainMeshes.length; g++) rainMeshes[g].count = 0;
      const counts = new Array(GLYPHS.length).fill(0);

      for (let i = 0; i < RAIN_COUNT; i++) {
        const d = rainDrops[i];
        const gi = d.glyph;
        const idx = counts[gi]++;
        if (idx >= RAIN_COUNT) continue;

        dummy.position.set(d.x, d.y, d.z);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        rainMeshes[gi].setMatrixAt(idx, dummy.matrix);
      }
      for (let g = 0; g < rainMeshes.length; g++) {
        rainMeshes[g].count = counts[g];
        rainMeshes[g].instanceMatrix.needsUpdate = true;
      }
    }
    placeRainOnce();

    // ============================================================
    // MODE B: Stream wipe (columns)
    // ============================================================
    const STREAM_COLUMNS = 130;
    const STREAM_SEGMENTS = 26;
    const STREAM_COUNT = STREAM_COLUMNS * STREAM_SEGMENTS;

    const streamMeshes = GLYPHS.map((_, i) => {
      const mat = new THREE.MeshBasicMaterial({
        ...baseMat,
        map: glyphTextures[i],
        blending: THREE.AdditiveBlending,
        opacity: 1.0,
      });
      const mesh = new THREE.InstancedMesh(glyphGeo, mat, STREAM_COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.visible = false;
      scene.add(mesh);
      return mesh;
    });

    const streams = Array.from({ length: STREAM_COLUMNS }, () => ({
      x: rand(-SPAWN.x * 0.95, SPAWN.x * 0.95),
      z: rand(SPAWN.zFar, SPAWN.zNear),
      headY: rand(-SPAWN.y, SPAWN.y),
      speed: rand(0.9, 1.8),
      scale: rand(0.85, 1.25),
      phase: Math.random() * 1000,
    }));

    const STREAM_SPACING = 1.05;

    function setMode(next) {
      mode = next;
      const rainVisible = next === "RAIN";
      const streamVisible = next === "STREAM";

      for (const m of rainMeshes) m.visible = rainVisible;
      for (const m of streamMeshes) m.visible = streamVisible;

      if (next === "BLACK") {
        for (const m of rainMeshes) m.count = 0;
        for (const m of streamMeshes) m.count = 0;
        for (const m of rainMeshes) m.instanceMatrix.needsUpdate = true;
        for (const m of streamMeshes) m.instanceMatrix.needsUpdate = true;
      }
    }

    setMode("RAIN");

    // ---------- Animation ----------
    let last = performance.now();

    function animate(now) {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      // Reset if user scrolls back up enough
      if (scrollProgress < RESET_POINT && mode !== "RAIN") {
        setMode("RAIN");
        placeRainOnce();
      }

      // Trigger wipe only AFTER the linger
      if (mode === "RAIN" && scrollProgress >= WIPE_POINT) {
        setMode("STREAM");
        streamStart = now;
      }

      // UI:
      // - In RAIN: hide the name (you want it after wipe), keep hint early
      // - In STREAM: hide everything
      // - In BLACK: show name
      if (mode === "RAIN") {
        revealEl?.classList.remove("show");
        hintEl?.classList.toggle("hide", scrollProgress > 0.12);
      } else if (mode === "STREAM") {
        revealEl?.classList.remove("show");
        hintEl?.classList.add("hide");
      } else if (mode === "BLACK") {
        revealEl?.classList.add("show");   // CHANGED: name appears after wipe
        hintEl?.classList.add("hide");
      }

      // Glow profile:
      // Strong dreamy glow at top, slightly tighter by mid, then:
      // - During STREAM: max glow for erase
      // - During BLACK: no bloom
      const tighten = smoothstep(0.08, 0.60, scrollProgress);
      let strength = THREE.MathUtils.lerp(2.15, 1.05, tighten);
      let radius = THREE.MathUtils.lerp(0.85, 0.45, tighten);
      let threshold = THREE.MathUtils.lerp(0.06, 0.30, tighten);

      if (mode === "STREAM") {
        strength = 3.0;
        radius = 1.0;
        threshold = 0.02;
      } else if (mode === "BLACK") {
        strength = 0.0;
        radius = 0.0;
        threshold = 1.0;
      }

      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;

      // Update modes
      if (mode === "RAIN") {
        const spd = speedFromScroll(scrollProgress);
        const counts = new Array(GLYPHS.length).fill(0);

        for (let i = 0; i < RAIN_COUNT; i++) {
          const d = rainDrops[i];

          d.y -= dt * 18 * d.sp * spd;

          // Wrap only if we are moving meaningfully; in stop zone we keep them “present”
          if (spd > 0.02) {
            if (d.y < -SPAWN.y) d.y = SPAWN.y;
          } else if (spd < -0.02) {
            if (d.y > SPAWN.y) d.y = -SPAWN.y;
          }

          // Flicker slows during linger so it feels “present”
          const inLinger = scrollProgress >= STOP_POINT && scrollProgress <= LINGER_END;
          const flickerChance = inLinger ? 0.006 : 0.02;
          if (Math.random() < flickerChance) d.glyph = Math.floor(Math.random() * GLYPHS.length);

          const gi = d.glyph;
          const idx = counts[gi]++;
          if (idx >= RAIN_COUNT) continue;

          dummy.position.set(d.x, d.y, d.z);
          dummy.scale.setScalar(d.s);
          dummy.updateMatrix();
          rainMeshes[gi].setMatrixAt(idx, dummy.matrix);
        }

        for (let g = 0; g < rainMeshes.length; g++) {
          rainMeshes[g].count = counts[g];
          rainMeshes[g].instanceMatrix.needsUpdate = true;
        }
      }

      if (mode === "STREAM") {
        const elapsed = (now - streamStart) / 1000;
        if (elapsed > STREAM_BURST_DURATION) {
          setMode("BLACK");
        } else {
          // Fast upward wall of code
          const streamSpeed = -11.5;

          for (let s = 0; s < STREAM_COLUMNS; s++) {
            const st = streams[s];
            st.headY -= dt * 18 * st.speed * streamSpeed;
            if (st.headY > SPAWN.y + STREAM_SEGMENTS * STREAM_SPACING) {
              st.headY = -SPAWN.y - Math.random() * 12;
            }
          }

          const counts = new Array(GLYPHS.length).fill(0);
          const flickerChance = 0.20;

          for (let s = 0; s < STREAM_COLUMNS; s++) {
            const st = streams[s];

            for (let seg = 0; seg < STREAM_SEGMENTS; seg++) {
              const y = st.headY - seg * STREAM_SPACING;
              if (y < -SPAWN.y - 10 || y > SPAWN.y + 10) continue;

              let gi = Math.floor((st.phase + seg * 13.37 + elapsed * 90) % GLYPHS.length);
              if (Math.random() < flickerChance) gi = Math.floor(Math.random() * GLYPHS.length);

              const idx = counts[gi]++;
              if (idx >= STREAM_COUNT) continue;

              dummy.position.set(st.x, y, st.z);
              dummy.scale.setScalar(st.scale);
              dummy.updateMatrix();
              streamMeshes[gi].setMatrixAt(idx, dummy.matrix);
            }
          }

          for (let g = 0; g < streamMeshes.length; g++) {
            streamMeshes[g].count = counts[g];
            streamMeshes[g].instanceMatrix.needsUpdate = true;
          }
        }
      }

      if (mode === "BLACK") {
        // Keep blank black background with name visible
        for (const m of rainMeshes) m.count = 0;
        for (const m of streamMeshes) m.count = 0;
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
