try {
  const status = document.createElement("div");
  status.style.cssText = `
    position:fixed; top:48px; left:10px; z-index:9999;
    font: 12px/1.2 monospace; color:#0f0;
    background: rgba(0,0,0,0.6);
    padding:8px 10px; border-radius:8px;
    pointer-events:none;`;
  status.textContent = "Loading script.js v10...";
  document.body.appendChild(status);

  import("three").then(async (THREE) => {
    // Use static imports for addons via dynamic import (works with importmap)
    const { EffectComposer } = await import("three/addons/postprocessing/EffectComposer.js");
    const { RenderPass } = await import("three/addons/postprocessing/RenderPass.js");
    const { UnrealBloomPass } = await import("three/addons/postprocessing/UnrealBloomPass.js");

    status.textContent = "✅ script.js v10 loaded (Three OK)";

    const canvas = document.getElementById("c");
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
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

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.6,
      0.6,
      0.1
    );
    composer.addPass(bloomPass);

    // Digit textures
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

    const COUNT = 900;
    const geo = new THREE.PlaneGeometry(1, 1);

    const baseMat = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
    const mat0 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex0 });
    const mat1 = new THREE.MeshBasicMaterial({ ...baseMat, map: tex1 });

    const mesh0 = new THREE.InstancedMesh(geo, mat0, COUNT);
    const mesh1 = new THREE.InstancedMesh(geo, mat1, COUNT);
    scene.add(mesh0, mesh1);

    const dummy = new THREE.Object3D();
    const rand = (min, max) => min + Math.random() * (max - min);

    // Spawn IN FRONT of camera (camera.z = 32)
    const SPAWN = { x: 48, y: 65, zNear: 20, zFar: -90 };

    const drops = Array.from({ length: COUNT }, () => ({
      x: rand(-SPAWN.x, SPAWN.x),
      y: rand(-SPAWN.y, SPAWN.y),
      z: rand(SPAWN.zFar, SPAWN.zNear),
      s: 0.35 + Math.random() * 0.95,
      sp: 0.6 + Math.random() * 2.2,
      bit: Math.random() > 0.5 ? 1 : 0,
    }));

    // init matrices once so you always see digits immediately
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

    let last = performance.now();
    function animate(now) {
      const dt = Math.min((now - last) / 1000, 0.033);
      last = now;

      // constant falling (for this debug phase)
      const spd = 1.0;

      for (let i = 0; i < COUNT; i++) {
        const d = drops[i];
        d.y -= dt * 18 * d.sp * spd;
        if (d.y < -SPAWN.y) d.y = SPAWN.y;

        if (Math.random() < 0.03) d.bit ^= 1;

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

    window.addEventListener("resize", () => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      composer.setSize(window.innerWidth, window.innerHeight);
      bloomPass.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      camera.lookAt(0, 0, 0);
    });
  }).catch((e) => {
    throw e;
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
