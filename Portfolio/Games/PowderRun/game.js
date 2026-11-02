// Powder Run — a first-person downhill ski game by Ajit Dixit.
// Built with three.js (r128). Carve, jump, hit gates, outrun the avalanche.
(function () {
  'use strict';

  // ------------------------------------------------------------------ DOM
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ui = {
    dist: $('hudDist'), speed: $('hudSpeed'), style: $('hudStyle'), best: $('hudBest'),
    av: $('avalanche'), avDist: $('avDist'), avMeter: $('avMeter'),
    whiteout: $('whiteout'), popup: $('popup'),
    overlay: $('overlay'), ovTitle: $('ovTitle'), ovText: $('ovText'), ovBest: $('ovBest'),
    startBtn: $('startBtn'), pauseBtn: $('pauseBtn'), fsBtn: $('fsBtn'),
  };

  function loadBest() { try { return parseInt(localStorage.getItem('powderRunBest') || '0', 10) || 0; } catch (e) { return 0; } }
  function saveBest(v) { try { localStorage.setItem('powderRunBest', String(v)); } catch (e) { /* storage unavailable */ } }
  let best = loadBest();

  // ------------------------------------------------------------------ tuning
  const SLOPE = 0.2;            // terrain drops this much per metre downhill
  const GROUND_SIZE = 240;
  const GROUND_SEGS = 60;       // 4 m cells
  const SNAP = 20;              // ground recentres in 20 m steps
  const SPAWN_AHEAD = 330;
  const EYE = 1.65;

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function heightAt(x, z) {
    return (
      1.4 * Math.sin(x * 0.045) * Math.cos(z * 0.037) +
      0.7 * Math.sin((x + z) * 0.09) +
      0.25 * Math.sin(x * 0.31 + z * 0.17) +
      z * SLOPE
    );
  }

  // ------------------------------------------------------------------ renderer & scene
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const FOG = new THREE.Color(0xdbe7f6);
  scene.fog = new THREE.Fog(FOG, 50, 250);

  // Sky gradient as the background
  (function sky() {
    const c = document.createElement('canvas');
    c.width = 2; c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, '#3D5A9E');
    grd.addColorStop(0.45, '#8FB3E8');
    grd.addColorStop(0.72, '#DBE7F6');
    grd.addColorStop(1, '#F5F0EA');
    g.fillStyle = grd;
    g.fillRect(0, 0, 2, 256);
    const tex = new THREE.CanvasTexture(c);
    scene.background = tex;
  })();

  const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 700);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  scene.add(new THREE.HemisphereLight(0xeef5ff, 0x7d8aa6, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1d6, 0.75);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  // ------------------------------------------------------------------ snow texture & ground
  function snowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#F4F8FF';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(rand(222, 255));
      g.fillStyle = 'rgba(' + (v - 12) + ',' + (v - 6) + ',' + v + ',' + rand(0.15, 0.5) + ')';
      g.fillRect(rand(0, 256), rand(0, 256), rand(1, 3), rand(1, 3));
    }
    // faint ski tracks / wind ripples
    g.strokeStyle = 'rgba(170, 190, 225, 0.18)';
    g.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      const y = rand(0, 256);
      g.moveTo(0, y);
      g.bezierCurveTo(80, y + rand(-30, 30), 170, y + rand(-30, 30), 256, y);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(GROUND_SIZE / 10, GROUND_SIZE / 10);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  const groundGeo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGS, GROUND_SEGS);
  groundGeo.rotateX(-Math.PI / 2);
  const groundBase = groundGeo.attributes.position.array.slice();
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ color: 0xeef3fb, map: snowTexture() }));
  ground.receiveShadow = true;
  scene.add(ground);
  let groundKey = '';

  function updateGround(px, pz) {
    const gx = Math.round(px / SNAP) * SNAP;
    const gz = Math.round(pz / SNAP) * SNAP;
    const key = gx + ',' + gz;
    if (key === groundKey) return;
    groundKey = key;
    ground.position.set(gx, 0, gz);
    const pos = groundGeo.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i + 1] = heightAt(groundBase[i] + gx, groundBase[i + 2] + gz);
    }
    groundGeo.attributes.position.needsUpdate = true;
    groundGeo.computeVertexNormals();
  }

  // ------------------------------------------------------------------ distant mountains (follow the player)
  const mountains = new THREE.Group();
  (function buildMountains() {
    const mat = new THREE.MeshPhongMaterial({ color: 0xb8c8e2, flatShading: true, shininess: 6, fog: false });
    const capMat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 6, fog: false });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rand(-0.1, 0.1);
      const h = rand(70, 150);
      const r = rand(60, 110);
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), mat);
      const d = rand(430, 520);
      m.position.set(Math.cos(a) * d, h / 2 - 70, Math.sin(a) * d);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.32, h * 0.32, 7), capMat);
      cap.position.y = h * 0.34;
      m.add(cap);
      mountains.add(m);
    }
  })();
  scene.add(mountains);

  // ------------------------------------------------------------------ shared object geometry
  const MAT = {
    trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a33 }),
    pine: new THREE.MeshPhongMaterial({ color: 0x154a2f, flatShading: true, shininess: 6 }),
    pine2: new THREE.MeshPhongMaterial({ color: 0x1d6440, flatShading: true, shininess: 6 }),
    snow: new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 6 }),
    rock: new THREE.MeshPhongMaterial({ color: 0x5d677b, flatShading: true, shininess: 6 }),
    ramp: new THREE.MeshPhongMaterial({ color: 0xbfe0ff, flatShading: true, shininess: 6 }),
    rampEdge: new THREE.MeshLambertMaterial({ color: 0x4f46e5 }),
    red: new THREE.MeshLambertMaterial({ color: 0xe11d48 }),
    blue: new THREE.MeshLambertMaterial({ color: 0x2563eb }),
    pole: new THREE.MeshLambertMaterial({ color: 0xf8fafc }),
  };
  const GEO = {
    trunk: new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6),
    cone1: new THREE.ConeGeometry(1.9, 2.6, 7),
    cone2: new THREE.ConeGeometry(1.45, 2.3, 7),
    cone3: new THREE.ConeGeometry(0.95, 2.0, 7),
    cap: new THREE.ConeGeometry(0.55, 0.8, 7),
    rock: new THREE.DodecahedronGeometry(1, 0),
    pole: new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
    flag: new THREE.PlaneGeometry(0.9, 0.6),
  };
  // Wedge-shaped jump ramp: low edge faces the skier (+z), rises toward -z
  GEO.ramp = (function () {
    const w = 2.2, L = 3.2, H = 1.5;
    const v = [
      -w, 0, L,  w, 0, L,  w, 0, -L,  -w, 0, -L,   // base
      -w, H, -L, w, H, -L,                        // top back edge
    ];
    const idx = [
      0, 1, 5, 0, 5, 4,   // ramp surface
      3, 4, 5, 3, 5, 2,   // back face
      0, 4, 3,            // left side
      1, 2, 5,            // right side
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  GEO.rampEdge = new THREE.BoxGeometry(4.4, 0.12, 0.16);

  function makeTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(GEO.trunk, MAT.trunk);
    trunk.position.y = 0.7;
    g.add(trunk);
    const tiers = [[GEO.cone1, 2.1], [GEO.cone2, 3.4], [GEO.cone3, 4.6]];
    tiers.forEach(([geo, y], i) => {
      const c = new THREE.Mesh(geo, i % 2 ? MAT.pine2 : MAT.pine);
      c.position.y = y;
      c.castShadow = true;
      g.add(c);
    });
    const cap = new THREE.Mesh(GEO.cap, MAT.snow);
    cap.position.y = 5.35;
    g.add(cap);
    const s = rand(0.8, 1.55);
    g.scale.set(s, s * rand(0.9, 1.15), s);
    g.rotation.y = rand(0, Math.PI * 2);
    return { mesh: g, type: 'tree', r: 1.15 * s, h: 6 * s };
  }

  function makeRock() {
    const g = new THREE.Group();
    const r = new THREE.Mesh(GEO.rock, MAT.rock);
    const s = rand(0.8, 1.6);
    r.scale.set(s * rand(1, 1.5), s * rand(0.6, 0.9), s * rand(1, 1.4));
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    r.castShadow = true;
    g.add(r);
    const cap = new THREE.Mesh(GEO.rock, MAT.snow);
    cap.scale.set(s * 0.8, s * 0.25, s * 0.8);
    cap.position.y = s * 0.55;
    g.add(cap);
    return { mesh: g, type: 'rock', r: 1.05 * s, h: 1.1 * s };
  }

  function makeRamp() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(GEO.ramp, MAT.ramp);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    const edge = new THREE.Mesh(GEO.rampEdge, MAT.rampEdge);
    edge.position.set(0, 1.5, -3.2);
    g.add(edge);
    return { mesh: g, type: 'ramp', halfW: 2.2, halfL: 3.2 };
  }

  function makeGate(color) {
    const g = new THREE.Group();
    const mat = color === 'red' ? MAT.red : MAT.blue;
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(GEO.pole, MAT.pole);
      p.position.set(side * 4, 1.1, 0);
      g.add(p);
      const f = new THREE.Mesh(GEO.flag, mat);
      f.position.set(side * 4 - side * 0.45, 1.85, 0);
      f.material.side = THREE.DoubleSide;
      g.add(f);
    }
    return { mesh: g, type: 'gate', halfW: 4, passed: false };
  }

  // ------------------------------------------------------------------ first-person skis & poles
  const rig = new THREE.Group();
  camera.add(rig);
  const skiMat = new THREE.MeshLambertMaterial({ color: 0x4f46e5 });
  const skiStripe = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const skis = [];
  for (const side of [-1, 1]) {
    const ski = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 1.9), skiMat);
    ski.add(body);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.028, 1.6), skiStripe);
    ski.add(stripe);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.28), skiMat);
    tip.position.set(0, 0.06, -1.05);
    tip.rotation.x = 0.5;
    ski.add(tip);
    ski.position.set(side * 0.2, -1.3, -1.55);
    ski.userData.side = side;
    rig.add(ski);
    skis.push(ski);
  }
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x818cf8 });
  const poles = [];
  for (const side of [-1, 1]) {
    const pole = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.5, 6), poleMat);
    shaft.position.y = -0.75;
    pole.add(shaft);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8), gripMat);
    pole.position.set(side * 0.62, -0.62, -0.95);
    pole.rotation.set(0.95, 0, side * -0.18);
    pole.userData.side = side;
    rig.add(pole);
    poles.push(pole);
  }

  // ------------------------------------------------------------------ particles: falling snow + ski spray
  const flake = (function () {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const SNOW_N = 1400;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW_N * 3);
  for (let i = 0; i < SNOW_N; i++) {
    snowPos[i * 3] = rand(-40, 40);
    snowPos[i * 3 + 1] = rand(-10, 25);
    snowPos[i * 3 + 2] = rand(-60, 20);
  }
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snowfall = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: 0xffffff, map: flake, size: 0.16, transparent: true, opacity: 0.9, depthWrite: false }));
  scene.add(snowfall);

  const SPRAY_N = 260;
  const sprayGeo = new THREE.BufferGeometry();
  const sprayPos = new Float32Array(SPRAY_N * 3);
  const sprayVel = new Float32Array(SPRAY_N * 3);
  const sprayLife = new Float32Array(SPRAY_N);
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: 0xffffff, map: flake, size: 0.12, transparent: true, opacity: 0.95, depthWrite: false }));
  spray.frustumCulled = false;
  scene.add(spray);
  let sprayHead = 0;
  function emitSpray(x, y, z, vx, vy, vz) {
    const i = sprayHead;
    sprayHead = (sprayHead + 1) % SPRAY_N;
    sprayPos[i * 3] = x; sprayPos[i * 3 + 1] = y; sprayPos[i * 3 + 2] = z;
    sprayVel[i * 3] = vx; sprayVel[i * 3 + 1] = vy; sprayVel[i * 3 + 2] = vz;
    sprayLife[i] = rand(0.35, 0.7);
  }

  // ------------------------------------------------------------------ input
  const keys = { left: false, right: false, tuck: false, brake: false, jump: false };
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'tuck', KeyW: 'tuck', ArrowDown: 'brake', KeyS: 'brake', Space: 'jump',
  };
  window.addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault();
      keys[k] = true;
      if (state === 'ready' || state === 'over') { if (k === 'jump') start(); }
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing' || state === 'paused') togglePause();
    } else if (e.code === 'Enter' && (state === 'ready' || state === 'over')) {
      start();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });
  window.addEventListener('blur', () => { Object.keys(keys).forEach((k) => (keys[k] = false)); });
  document.querySelectorAll('.touch [data-key]').forEach((b) => {
    const k = b.dataset.key;
    const on = (e) => { e.preventDefault(); keys[k] = true; b.classList.add('on'); };
    const off = (e) => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
  });
  ui.startBtn.addEventListener('click', () => (state === 'paused' ? togglePause() : start()));
  ui.pauseBtn.addEventListener('click', () => { if (state === 'playing' || state === 'paused') togglePause(); });
  ui.fsBtn.addEventListener('click', () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') togglePause(); });

  // ------------------------------------------------------------------ game state
  let state = 'ready';
  let p = null;          // player
  let objects = [];
  let nextSpawnZ = 0;
  let popupTimer = null;

  function reset() {
    objects.forEach((o) => scene.remove(o.mesh));
    objects = [];
    p = {
      x: 0, z: 0, y: heightAt(0, 0), vy: 0,
      heading: 0, speed: 8, air: false, airTime: 0,
      crash: 0, crashes: 0, style: 0, gates: 0,
      lean: 0, tuckAmt: 0, shake: 0, bob: 0,
      av: 140, time: 0, jumpHeld: keys.jump,
    };
    nextSpawnZ = -60;
    // a few scenery trees beside the start
    for (let i = 0; i < 14; i++) {
      const t = makeTree();
      const side = i % 2 ? 1 : -1;
      placeObject(t, side * rand(12, 40), rand(-55, 25));
    }
    spawnAhead();
    updateGround(p.x, p.z);
  }

  function placeObject(o, x, z) {
    o.x = x; o.z = z;
    o.mesh.position.set(x, heightAt(x, z) - (o.type === 'ramp' ? 0.05 : 0.1), z);
    if (o.type === 'ramp' || o.type === 'gate') {
      // align with the local slope so they sit flush on the snow
      const slope = Math.atan(heightAt(x, z - 1) - heightAt(x, z + 1)) / 1;
      o.mesh.rotation.x = -slope * 0.5;
    }
    scene.add(o.mesh);
    objects.push(o);
  }

  function spawnAhead() {
    const dist = -p.z;
    const density = clamp(1 + dist / 2500, 1, 2.2);
    while (nextSpawnZ > p.z - SPAWN_AHEAD) {
      const z = nextSpawnZ;
      const roll = Math.random();
      if (roll < 0.07 && dist > 40) {
        const gate = makeGate(Math.random() < 0.5 ? 'red' : 'blue');
        placeObject(gate, p.x + rand(-22, 22), z);
        nextSpawnZ -= rand(14, 22);
        continue;
      }
      if (roll < 0.14) {
        placeObject(makeRamp(), p.x + rand(-26, 26), z);
      }
      const n = Math.round(rand(1, 2.4 * density));
      for (let i = 0; i < n; i++) {
        const x = p.x + rand(-75, 75);
        placeObject(Math.random() < 0.78 ? makeTree() : makeRock(), x, z + rand(-3, 3));
      }
      nextSpawnZ -= rand(4, 9) / density;
    }
  }

  function cullBehind() {
    objects = objects.filter((o) => {
      if (o.z > p.z + 30 || Math.abs(o.x - p.x) > 140) { scene.remove(o.mesh); return false; }
      return true;
    });
  }

  function popup(text, color) {
    ui.popup.textContent = text;
    ui.popup.style.color = color || '#FFFFFF';
    ui.popup.classList.add('show');
    clearTimeout(popupTimer);
    popupTimer = setTimeout(() => ui.popup.classList.remove('show'), 900);
  }

  // ------------------------------------------------------------------ flow
  function start() {
    reset();
    state = 'playing';
    ui.overlay.hidden = true;
    ui.pauseBtn.textContent = '❚❚';
    popup('Drop in!', '#C7D2FE');
  }

  function togglePause() {
    if (state === 'playing') {
      state = 'paused';
      showOverlay('Paused', 'Catch your breath — the avalanche waits for you.', 'Resume');
      ui.pauseBtn.textContent = '▶';
    } else if (state === 'paused') {
      state = 'playing';
      ui.overlay.hidden = true;
      ui.pauseBtn.textContent = '❚❚';
    }
  }

  function score() { return Math.floor(-p.z) + p.style; }

  function gameOver() {
    state = 'over';
    const s = score();
    const newBest = s > best;
    if (newBest) { best = s; saveBest(best); }
    updateHud();
    setTimeout(() => {
      showOverlay(
        newBest ? 'New best run!' : 'Buried!',
        'The avalanche caught you after ' + Math.floor(-p.z) + ' m. Style ' + p.style + ', ' + p.gates + ' gates, ' + p.crashes + ' wipeouts. Score: ' + s + '.',
        'Ski again'
      );
    }, 900);
  }

  function showOverlay(title, text, btn) {
    ui.ovTitle.textContent = title;
    ui.ovText.textContent = text;
    ui.startBtn.textContent = btn;
    ui.ovBest.textContent = best ? 'Best score: ' + best : '';
    ui.overlay.hidden = false;
  }

  // ------------------------------------------------------------------ physics
  function update(dt) {
    p.time += dt;
    const steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const crashed = p.crash > 0;

    if (crashed) {
      p.crash -= dt;
      p.speed = Math.max(0, p.speed - 8 * dt);
    } else if (!p.air) {
      const turnRate = 1.7 * (0.55 + Math.min(p.speed, 30) / 60);
      p.heading = clamp(p.heading + steer * turnRate * dt, -1.25, 1.25);
      // gentle drift back toward the fall line when not steering
      if (!steer) p.heading *= 1 - Math.min(1, dt * 0.35);
      const tuck = keys.tuck ? 1 : 0;
      const brake = keys.brake ? 1 : 0;
      p.tuckAmt = lerp(p.tuckAmt, tuck, dt * 6);
      let acc = 7.2 * Math.cos(p.heading) + tuck * 5.5 - brake * 16;
      const drag = 0.0105 * p.speed * p.speed + Math.abs(steer) * p.speed * 0.18 + (brake ? 0 : 0);
      p.speed = Math.max(0, p.speed + (acc - drag) * dt);
      if (Math.abs(p.heading) > 1.1) p.speed = Math.max(0, p.speed - 6 * dt); // traversing slows you
      // jump
      if (keys.jump && !p.jumpHeld) {
        p.air = true; p.vy = 5.2; p.airTime = 0;
      }
      // spray when carving or braking
      if ((Math.abs(steer) || brake) && p.speed > 6) {
        for (let i = 0; i < 3; i++) {
          const side = steer || (Math.random() < 0.5 ? -1 : 1);
          emitSpray(p.x + rand(-0.4, 0.4), p.y + 0.1, p.z - 1.2,
            -side * rand(2, 5) + Math.sin(p.heading) * p.speed * 0.4, rand(1.5, 3.5), -Math.cos(p.heading) * p.speed * 0.4);
        }
      }
    }
    p.jumpHeld = keys.jump;
    p.lean = lerp(p.lean, crashed ? 0 : steer * Math.min(1, p.speed / 15), dt * 5);

    // move
    const prevZ = p.z;
    p.x += Math.sin(p.heading) * p.speed * dt;
    p.z -= Math.cos(p.heading) * p.speed * dt;
    const gy = heightAt(p.x, p.z);
    if (p.air) {
      p.vy -= 20 * dt;
      p.y += p.vy * dt;
      p.airTime += dt;
      if (p.y <= gy) {
        p.y = gy;
        p.air = false;
        if (p.airTime > 0.55) {
          const pts = Math.round(p.airTime * 120);
          p.style += pts;
          popup((p.airTime > 1.2 ? 'Huge air! +' : 'Air +') + pts, '#FDE68A');
        }
        p.shake = Math.min(0.5, p.airTime * 0.2);
      }
    } else {
      p.y = gy;
    }

    // collisions & interactions
    for (const o of objects) {
      const dx = p.x - o.x;
      const dz = p.z - o.z;
      if (o.type === 'gate') {
        if (!o.passed && prevZ > o.z && p.z <= o.z) {
          o.passed = true;
          if (Math.abs(dx) < o.halfW) {
            p.style += 100; p.gates++;
            p.speed += 1.5;
            popup('Gate +100', '#93C5FD');
          }
        }
        continue;
      }
      if (o.type === 'ramp') {
        if (!p.air && !crashed && Math.abs(dx) < o.halfW && Math.abs(dz) < o.halfL && p.speed > 5) {
          p.air = true;
          p.vy = 4 + p.speed * 0.38;
          p.airTime = 0;
          p.y = gy + 0.3;
        }
        continue;
      }
      if (crashed) continue;
      if (dx * dx + dz * dz < (o.r + 0.35) * (o.r + 0.35)) {
        const clearance = p.y - heightAt(o.x, o.z);
        if (clearance > o.h) continue; // flew over it
        wipeout(o);
        break;
      }
    }

    // avalanche chase
    const downhill = p.speed * Math.cos(p.heading);
    const avSpeed = Math.min(31, 15 + p.time * 0.12);
    if (p.time > 2.5) p.av += (downhill - avSpeed) * dt;
    p.av = Math.min(p.av, 220);
    if (p.av <= 0) { p.av = 0; gameOver(); }

    if (p.shake > 0) p.shake = Math.max(0, p.shake - dt * 1.6);

    // keep the world around the player
    spawnAhead();
    cullBehind();
    updateGround(p.x, p.z);
  }

  function wipeout(o) {
    p.crash = 1.4;
    p.crashes++;
    p.speed = Math.min(p.speed, 3);
    p.shake = 0.9;
    p.air = false;
    p.y = heightAt(p.x, p.z);
    // knock the skier clear of the obstacle
    const dx = p.x - o.x;
    p.x += (dx >= 0 ? 1 : -1) * (o.r + 0.9);
    p.heading *= 0.3;
    popup('Wipeout!', '#FCA5A5');
    for (let i = 0; i < 40; i++) {
      emitSpray(p.x + rand(-1, 1), p.y + 0.4, p.z - 2.2, rand(-5, 5), rand(1, 5), rand(-6, -1));
    }
  }

  // ------------------------------------------------------------------ rendering
  function updateHud() {
    ui.dist.textContent = Math.floor(-p.z) + ' m';
    ui.speed.textContent = Math.round(p.speed * 3.6) + ' km/h';
    ui.style.textContent = p.style;
    ui.best.textContent = Math.max(best, state === 'over' ? 0 : score());
    const pct = clamp(p.av / 220, 0, 1);
    ui.avMeter.style.width = (pct * 100) + '%';
    ui.avDist.textContent = Math.max(0, Math.round(p.av)) + ' m';
    ui.av.classList.toggle('danger', p.av < 50);
    ui.whiteout.style.opacity = state === 'over' ? 1 : clamp((60 - p.av) / 60, 0, 1) * 0.75;
  }

  function updateCamera(dt, t) {
    const tuckDrop = p.tuckAmt * 0.35;
    const crashTilt = p.crash > 0 ? Math.sin((1.4 - p.crash) * 3) * 0.5 * (p.crash / 1.4) : 0;
    p.bob += dt * (6 + p.speed * 0.3);
    const bob = p.air || p.crash > 0 ? 0 : Math.sin(p.bob) * 0.02 * Math.min(1, p.speed / 10);
    const avShake = p.av < 70 ? (70 - p.av) / 70 * 0.06 : 0;
    const sh = p.shake * 0.12 + avShake;
    camera.position.set(
      p.x + rand(-sh, sh),
      p.y + EYE - tuckDrop + bob + rand(-sh, sh) + (p.crash > 0 ? -0.6 * (p.crash / 1.4) : 0),
      p.z
    );
    // look slightly down the fall line
    camera.rotation.y = -p.heading;
    camera.rotation.x = -0.2 - p.tuckAmt * 0.06 + crashTilt * 0.4;
    camera.rotation.z = -p.lean * 0.16 + crashTilt;
    const fov = 70 + Math.min(24, p.speed * 0.55) + p.tuckAmt * 3;
    if (Math.abs(camera.fov - fov) > 0.05) {
      camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 4));
      camera.updateProjectionMatrix();
    }
    // skis & poles react to input
    skis.forEach((ski) => {
      const side = ski.userData.side;
      ski.rotation.y = -p.lean * 0.18;
      ski.rotation.z = p.lean * 0.3;
      ski.position.x = side * (0.2 + (keys.brake ? 0.1 : 0));
      ski.rotation.y += keys.brake ? side * -0.25 : 0; // snowplow
      ski.position.y = -1.3 + tuckDrop * 0.8 + (p.air ? 0.15 : 0) + bob * 0.5;
    });
    poles.forEach((pole) => {
      const side = pole.userData.side;
      pole.rotation.x = 0.95 + p.tuckAmt * 0.45 + (p.air ? 0.35 : Math.sin(p.bob * 0.5 + side) * 0.05);
      pole.position.y = -0.62 + tuckDrop * 0.5;
    });
    // sun & shadows follow the player
    sun.position.set(p.x - 30, p.y + 60, p.z + 25);
    sun.target.position.set(p.x, p.y, p.z - 15);
    mountains.position.set(p.x, p.y, p.z);
  }

  function updateParticles(dt) {
    // falling snow, wrapped around the camera
    for (let i = 0; i < SNOW_N; i++) {
      const j = i * 3;
      snowPos[j + 1] -= dt * (1.4 + (i % 5) * 0.25);
      snowPos[j] += Math.sin(t0 * 0.6 + i) * dt * 0.3;
      let rx = snowPos[j] - camera.position.x;
      let ry = snowPos[j + 1] - camera.position.y;
      let rz = snowPos[j + 2] - camera.position.z;
      if (ry < -8) snowPos[j + 1] += 30;
      if (Math.abs(rx) < 0.6 && Math.abs(rz) < 1.2 && Math.abs(ry) < 1) snowPos[j] += 3;
      if (rx < -40) snowPos[j] += 80; else if (rx > 40) snowPos[j] -= 80;
      if (rz > 20) snowPos[j + 2] -= 80; else if (rz < -60) snowPos[j + 2] += 80;
    }
    snowGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < SPRAY_N; i++) {
      if (sprayLife[i] <= 0) { sprayPos[i * 3 + 1] = -9999; continue; }
      sprayLife[i] -= dt;
      sprayVel[i * 3 + 1] -= 9 * dt;
      sprayPos[i * 3] += sprayVel[i * 3] * dt;
      sprayPos[i * 3 + 1] += sprayVel[i * 3 + 1] * dt;
      sprayPos[i * 3 + 2] += sprayVel[i * 3 + 2] * dt;
    }
    sprayGeo.attributes.position.needsUpdate = true;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------------ loop
  let last = performance.now();
  let t0 = 0;
  let hudTick = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t0 += dt;
    if (state === 'playing') {
      update(dt);
    } else if (state === 'ready') {
      // idle: glide slowly down the hill behind the menu
      p.speed = 9;
      p.z -= p.speed * dt;
      p.x = Math.sin(t0 * 0.3) * 4;
      p.heading = Math.cos(t0 * 0.3) * 0.12;
      p.y = heightAt(p.x, p.z);
      spawnAhead();
      cullBehind();
      updateGround(p.x, p.z);
    }
    if (state !== 'paused') {
      updateCamera(dt, now);
      updateParticles(dt);
    }
    hudTick += dt;
    if (hudTick > 0.1) { hudTick = 0; if (state !== 'ready') updateHud(); }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  reset();
  showOverlay(ui.ovTitle.textContent, ui.ovText.textContent, 'Drop in');
  ui.ovTitle.innerHTML = 'Powder <em>Run</em>';
  requestAnimationFrame(frame);
})();
