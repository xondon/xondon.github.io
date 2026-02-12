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
  status.textContent = "Loading script.js v20...";
  document.body.appendChild(status);
  setTimeout(() => {
    status.style.opacity = "0";
    setTimeout(() => status.remove(), 700);
  }, 1400);

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
    const hintEl = document.getElementById("hint");

    // ---------- Scroll ----------
    let scrollProgress = 0; // 0..1
    function updateScroll() {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      scrollProgress = maxScroll <= 0 ? 0 : Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
    }
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();

    function smoothstep(edge0, edge1, x) {
      const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
      return t * t * (3 - 2 * t);
    }

    // ---------- Speed curve (slows longer before reverse) ----------
    function speedFromScroll(t) {
      const slowStart = 0.22;
      const stopPoint = 0.62;  // later = more time slowing
      const flipPoint = 0.78;  // later = more time near 0 before reverse

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

    // ---------- Trigger points ----------
    const FLIP_POINT = 0.78;              // start wipe around here
    const BOTTOM_FAILSAFE = 0.995;        // CHANGED: guaranteed trigger at bottom
    const STREAM_BURST_DURATION = 2.0;
    const RESET_POINT = 0.42;

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
      ctx.shadowColor = "rgba(0,255,120,0.75)";
      ctx.shadowBlur = 26;
      ctx.fillStyle = "rgba(0,255,120,0.30)";
      ctx.fillText(ch, 0, 8);
      ctx.restore();

      // crisp pass
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

    // ---------- Shared ----------
    const baseMat = {
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      opacity: 0.98,
    };
    const geo = new THREE.PlaneGeometry(2.10, 2.10);

    const dummy = new THREE.Object3D();
    const rand = (min, max) => min + Math.random() * (max - min);
    const SPAWN = { x: 54, y: 75, zNear: 18, zFar: -105 };

    // ============================================================
    // MODE A: Rain
    // ============================================================
    const RAIN_COUNT = 1100;

    const rainMeshes = GLYPHS.map((_, i) => {
      const mat = new THREE.MeshBasicMaterial({ ...baseMat, map: glyphTextures[i] });
      const mesh = new THREE.InstancedMesh(geo, mat, RAIN_COUNT);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.visible = true;
      scene.add(mesh);
      return mesh;
    });

    const rainDrops = Array.from({ length: RAIN_COUNT }, () => ({
      x: rand(-SPAWN.x, SPAWN.x),
      y: rand(-SPAWN.y, SPAWN.y),
      z: rand(SPAWN.zFar, SPAWN.zNear),
      s: 0.90 + Math.random() * 1.15,
      sp: 0.6 + Math.random() * 2.2,
      glyph: Math.floor(Math.random() * GLYPHS.length),
    }));

    function updateRain(dt, spd) {
      const counts = new Array(GLYPHS.length).fill(0);
      const flickerChance = 0.02;

      for (let i = 0; i < RAIN_COUNT; i++) {
        const d = rainDrops[i];

        d.y -= dt * 18 * d.sp * spd;

        if (spd > 0.02) {
          if (d.y < -SPAWN.y) d.y = SPAWN.y;
        } else if (spd < -0.02) {
          if (d.y > SPAWN.y) d.y = -SPAWN.y;
        }

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

    // ============================================================
    // MODE B: Stream wipe
    // ============================================================
    const STREAM_COLUMNS = 130;
    const STREAM_SEGMENTS = 26;
    const STREAM_COUNT = STREAM_COLUMNS * STREAM_SEGMENTS;
    const STREAM_SPACING = 1.05;

    const streamMeshes = GLYPHS.map((_, i) => {
      const mat = new THREE.MeshBasicMaterial({
        ...baseMat,
        map: glyphTextures[i],
        blending: THREE.AdditiveBlending,
        opacity: 1.0,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, STREAM_COUNT);
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

    function updateStreams(dt, elapsed) {
      const counts = new Array(GLYPHS.length).fill(0);
      const flickerChance = 0.20;
      const streamSpeed = -11.5;

      for (let s = 0; s < STREAM_COLUMNS; s++) {
        const st = streams[s];
        st.headY -= dt * 18 * st.speed * streamSpeed;

        if (st.headY > SPAWN.y + STREAM_SEGMENTS * STREAM_SPACING) {
          st.headY = -SPAWN.y - Math.random() * 12;
        }

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

    function clearAll() {
      for (const m of rainMeshes) { m.count = 0; m.instanceMatrix.needsUpdate = true; }
      for (const m of streamMeshes) { m.count = 0; m.instanceMatrix.needsUpdate = true; }
    }

    // ============================================================
    // State machine
    // ============================================================
    let mode = "RAIN"; // "RAIN" | "STREAM" | "BLACK"
    let streamStart = 0;
    let prevT = scrollProgress;

    function setMode(next) {
      mode = next;
      for (const m of rainMeshes) m.visible = (next === "RAIN");
      for (const m of streamMeshes) m.visible = (next === "STREAM");
      if (next === "BLACK") clearAll();
    }
    setMode("RAIN");

    // ---------- Animation ----------
    let last = performance.now();

    function animate(now) {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      // Reset if scroll back up
      if (scrollProgress < RESET_POINT && mode !== "RAIN") {
        setMode("RAIN");
      }

      // Trigger wipe if you cross the flip point OR you are basically at the bottom
      const crossedFlip = prevT < FLIP_POINT && scrollProgress >= FLIP_POINT;
      const atBottom = scrollProgress >= BOTTOM_FAILSAFE;
      prevT = scrollProgress;

      if (mode === "RAIN" && (crossedFlip || atBottom)) {
        setMode("STREAM");
        streamStart = now;
      }

      // UI: show name only after wipe
      if (mode === "BLACK") {
        revealEl?.classList.add("show");
        hintEl?.classList.add("hide");
      } else {
        revealEl?.classList.remove("show");
        hintEl?.classList.toggle("hide", scrollProgress > 0.10 || mode === "STREAM");
      }

      // Glow scaling
      const tighten = smoothstep(0.05, 0.75, scrollProgress);
      let strength = THREE.MathUtils.lerp(2.35, 0.95, tighten);
      let radius = THREE.MathUtils.lerp(0.85, 0.40, tighten);
      let threshold = THREE.MathUtils.lerp(0.06, 0.33, tighten);

      if (mode === "STREAM") { strength = 3.0; radius = 1.0; threshold = 0.02; }
      if (mode === "BLACK")  { strength = 0.0; radius = 0.0; threshold = 1.0; }

      bloomPass.strength = strength;
      bloomPass.radius = radius;
      bloomPass.threshold = threshold;

      if (mode === "RAIN") {
        const spd = speedFromScroll(scrollProgress);
        updateRain(dt, spd);
      } else if (mode === "STREAM") {
        const elapsed = (now - streamStart) / 1000;
        if (elapsed > STREAM_BURST_DURATION) {
          setMode("BLACK");
        } else {
          updateStreams(dt, elapsed);
        }
      } else {
        clearAll();
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
