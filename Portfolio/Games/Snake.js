// Snake Odyssey — by Ajit Dixit
// Eat apples, open the portal, survive the levels.
(function () {
  'use strict';

  // ------------------------------------------------------------------ setup
  const COLS = 20;
  const ROWS = 20;
  const APPLES_PER_LEVEL = 10;
  const COMBO_WINDOW = 2600; // ms of game time to keep a combo alive

  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const $ = (id) => document.getElementById(id);
  const ui = {
    level: $('hudLevel'),
    score: $('hudScore'),
    best: $('hudBest'),
    time: $('hudTime'),
    combo: $('hudCombo'),
    bar: $('progressBar'),
    label: $('progressLabel'),
    overlay: $('overlay'),
    ovTitle: $('ovTitle'),
    ovText: $('ovText'),
    startBtn: $('startBtn'),
    pauseBtn: $('pauseBtn'),
  };

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  // Best score survives reloads when the browser allows storage.
  function loadBest() {
    try { return parseInt(localStorage.getItem('snakeOdysseyBest') || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveBest(v) {
    try { localStorage.setItem('snakeOdysseyBest', String(v)); } catch (e) { /* storage unavailable */ }
  }

  // ------------------------------------------------------------------ state
  let size = 480;      // CSS px of the square board
  let cell = size / COLS;
  let best = loadBest();
  let s = null;        // game state, built by reset()
  let mode = 'ready';  // ready | playing | paused | over
  let lastFrame = 0;

  function reset() {
    s = {
      snake: [{ x: 6, y: 10 }, { x: 5, y: 10 }, { x: 4, y: 10 }],
      prev: null,
      dir: DIRS.right,
      queue: [],
      food: null,
      bonus: null,
      portal: null,
      obstacles: new Set(),
      level: 1,
      score: 0,
      levelApples: 0,
      combo: 0,
      lastEat: -Infinity,
      tickMs: speedFor(1),
      acc: 0,
      clock: 0,          // game time in ms (pauses with the game)
      particles: [],
      popups: [],
      shake: 0,
      banner: { text: '', t: 0 },
      flash: 0,
    };
    s.prev = s.snake.map(copy);
    s.food = freeCell(3);
    updateHud(true);
  }

  function speedFor(level) {
    return Math.max(58, 140 * Math.pow(0.92, level - 1));
  }

  // ------------------------------------------------------------------ helpers
  const key = (p) => p.x + ',' + p.y;
  const copy = (p) => ({ x: p.x, y: p.y });
  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const rand = (min, max) => min + Math.random() * (max - min);
  const randInt = (min, max) => Math.floor(rand(min, max + 1));

  function occupied(p) {
    if (s.obstacles.has(key(p))) return true;
    if (s.snake.some((q) => same(q, p))) return true;
    if (same(s.food, p) || same(s.portal, p)) return true;
    if (s.bonus && same(s.bonus, p)) return true;
    return false;
  }

  // A random empty cell, kept `gap` cells away from the snake's head.
  function freeCell(gap) {
    const head = s.snake[0];
    for (let tries = 0; tries < 500; tries++) {
      const p = { x: randInt(0, COLS - 1), y: randInt(0, ROWS - 1) };
      if (occupied(p)) continue;
      if (gap && Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < gap) continue;
      return p;
    }
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const p = { x, y };
      if (!occupied(p)) return p;
    }
    return null;
  }

  // Obstacles never block the snake's next few moves.
  function buildObstacles() {
    s.obstacles.clear();
    const head = s.snake[0];
    const safe = new Set();
    for (let i = 0; i <= 5; i++) safe.add(key({ x: head.x + s.dir.x * i, y: head.y + s.dir.y * i }));
    const pieces = Math.min(2 + (s.level - 1) * 2, 18);
    for (let n = 0; n < pieces; n++) {
      for (let tries = 0; tries < 60; tries++) {
        const len = randInt(1, Math.min(4, 1 + Math.floor(s.level / 2) + 1));
        const horiz = Math.random() < 0.5;
        const start = { x: randInt(1, COLS - 2), y: randInt(1, ROWS - 2) };
        const cells = [];
        let ok = true;
        for (let i = 0; i < len; i++) {
          const p = { x: start.x + (horiz ? i : 0), y: start.y + (horiz ? 0 : i) };
          if (p.x < 0 || p.y < 0 || p.x >= COLS || p.y >= ROWS) { ok = false; break; }
          if (safe.has(key(p)) || occupied(p)) { ok = false; break; }
          if (Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < 3) { ok = false; break; }
          cells.push(p);
        }
        if (ok) { cells.forEach((p) => s.obstacles.add(key(p))); break; }
      }
    }
  }

  // ------------------------------------------------------------------ input
  function turn(name) {
    const d = DIRS[name];
    if (!d) return;
    if (mode === 'ready' || mode === 'over') { start(); }
    if (mode !== 'playing') return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d.x === -last.x && d.y === -last.y) return; // no instant reversal
    if (d.x === last.x && d.y === last.y) return;
    if (s.queue.length < 3) s.queue.push(d);
  }

  document.addEventListener('keydown', (e) => {
    const dir = KEYS[e.code];
    if (dir) {
      e.preventDefault();
      turn(dir);
      return;
    }
    if (e.code === 'Space' || e.code === 'KeyP') {
      e.preventDefault();
      if (mode === 'playing' || mode === 'paused') togglePause();
      else start();
    } else if (e.code === 'Enter' && (mode === 'ready' || mode === 'over')) {
      e.preventDefault();
      start();
    }
  });

  // Swipe on the board
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }, { passive: true });

  // On-screen d-pad
  document.querySelectorAll('[data-dir]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); turn(btn.dataset.dir); });
  });

  ui.startBtn.addEventListener('click', () => (mode === 'paused' ? togglePause() : start()));
  ui.pauseBtn.addEventListener('click', () => {
    if (mode === 'playing' || mode === 'paused') togglePause();
    else start();
  });

  // Pause automatically when the tab is hidden
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mode === 'playing') togglePause();
  });

  // ------------------------------------------------------------------ flow
  function start() {
    reset();
    buildObstacles();
    mode = 'playing';
    s.banner = { text: 'Level 1', t: 1400 };
    hideOverlay();
    ui.pauseBtn.textContent = 'Pause';
  }

  function togglePause() {
    if (mode === 'playing') {
      mode = 'paused';
      showOverlay('Paused', 'Take a breath. Press Space or tap Resume to keep going.', 'Resume');
      ui.pauseBtn.textContent = 'Resume';
    } else if (mode === 'paused') {
      mode = 'playing';
      hideOverlay();
      ui.pauseBtn.textContent = 'Pause';
    }
  }

  function gameOver() {
    mode = 'over';
    s.shake = 14;
    s.flash = 1;
    burst(s.snake[0], '#F87171', 26);
    const newBest = s.score > best;
    if (newBest) { best = s.score; saveBest(best); }
    updateHud(true);
    setTimeout(() => {
      if (mode !== 'over') return;
      showOverlay(
        newBest ? 'New best score!' : 'Game over',
        'You reached level ' + s.level + ' with ' + s.score + ' points in ' + fmtTime(s.clock) + '.',
        'Play again'
      );
      ui.pauseBtn.textContent = 'Start';
    }, 650);
  }

  function showOverlay(title, text, button) {
    ui.ovTitle.textContent = title;
    ui.ovText.textContent = text;
    ui.startBtn.textContent = button;
    ui.overlay.hidden = false;
  }
  function hideOverlay() { ui.overlay.hidden = true; }

  // ------------------------------------------------------------------ game step
  function step() {
    if (s.queue.length) s.dir = s.queue.shift();
    s.prev = s.snake.map(copy);
    const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };

    const eating = same(head, s.food) || (s.bonus && same(head, s.bonus));
    const body = eating ? s.snake : s.snake.slice(0, -1);
    const hitWall = head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS;
    if (hitWall || s.obstacles.has(key(head)) || body.some((q) => same(q, head))) {
      gameOver();
      return;
    }

    s.snake.unshift(head);

    if (same(head, s.portal)) {
      s.snake.pop();
      levelUp();
      return;
    }

    if (same(head, s.food)) {
      eat(1, '#FB7185');
      s.food = freeCell(2);
    } else if (s.bonus && same(head, s.bonus)) {
      eat(s.bonus.points, '#34D399');
      s.bonus = null;
    } else {
      s.snake.pop();
    }

    // Occasionally drop a bonus apple
    if (!s.bonus && s.score > 0 && Math.random() < 0.012) {
      const p = freeCell(4);
      if (p) {
        const life = rand(6000, 9500);
        s.bonus = { x: p.x, y: p.y, points: randInt(2, 5), born: s.clock, life };
      }
    }
  }

  function eat(points, color) {
    s.combo = s.clock - s.lastEat <= COMBO_WINDOW ? s.combo + 1 : 1;
    s.lastEat = s.clock;
    const mult = Math.min(3, 1 + Math.floor((s.combo - 1) / 3));
    const gained = points * mult;
    s.score += gained;
    s.levelApples += points;
    const head = s.snake[0];
    burst(head, color, 14);
    s.popups.push({ x: head.x, y: head.y, text: '+' + gained + (mult > 1 ? ' ×' + mult : ''), t: 900, color });
    if (!s.portal && s.levelApples >= APPLES_PER_LEVEL) {
      s.portal = freeCell(5);
      s.banner = { text: 'Portal open!', t: 1300 };
    }
    updateHud(true);
  }

  function levelUp() {
    const head = s.snake[0];
    burst(head, '#C084FC', 34);
    s.level += 1;
    s.levelApples = 0;
    s.portal = null;
    s.bonus = null;
    s.tickMs = speedFor(s.level);
    buildObstacles();
    s.food = freeCell(3);
    s.flash = 0.6;
    s.banner = { text: 'Level ' + s.level, t: 1500 };
    updateHud(true);
  }

  // ------------------------------------------------------------------ effects
  function burst(p, color, n) {
    const cx = (p.x + 0.5) * cell;
    const cy = (p.y + 0.5) * cell;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = rand(40, 190);
      s.particles.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(350, 750), age: 0, r: rand(1.5, 3.6), color });
    }
  }

  function updateEffects(dt) {
    const sec = dt / 1000;
    s.particles = s.particles.filter((q) => {
      q.age += dt;
      q.x += q.vx * sec;
      q.y += q.vy * sec;
      q.vx *= 0.94;
      q.vy *= 0.94;
      return q.age < q.life;
    });
    s.popups = s.popups.filter((q) => (q.t -= dt) > 0);
    if (s.banner.t > 0) s.banner.t -= dt;
    if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 0.03);
    if (s.flash > 0) s.flash = Math.max(0, s.flash - dt / 500);
    if (s.bonus && s.clock - s.bonus.born > s.bonus.life) s.bonus = null;
    if (s.combo > 0 && s.clock - s.lastEat > COMBO_WINDOW) { s.combo = 0; updateHud(true); }
  }

  // ------------------------------------------------------------------ HUD
  let hudTimer = 0;
  function fmtTime(ms) {
    const t = Math.floor(ms / 1000);
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  }
  function updateHud() {
    ui.level.textContent = s.level;
    ui.score.textContent = s.score;
    ui.best.textContent = Math.max(best, s.score);
    ui.time.textContent = fmtTime(s.clock);
    const mult = Math.min(3, 1 + Math.floor((Math.max(s.combo, 1) - 1) / 3));
    ui.combo.textContent = s.combo >= 2 ? 'Combo ' + s.combo + (mult > 1 ? ' · ×' + mult : '') : 'No combo';
    ui.combo.classList.toggle('hot', mult > 1);
    const pct = Math.min(1, s.levelApples / APPLES_PER_LEVEL);
    ui.bar.style.width = (pct * 100) + '%';
    ui.bar.classList.toggle('open', !!s.portal);
    ui.label.textContent = s.portal
      ? 'Portal open — reach it to advance to level ' + (s.level + 1)
      : (APPLES_PER_LEVEL - Math.min(APPLES_PER_LEVEL, s.levelApples)) + ' more points to open the portal';
  }

  // ------------------------------------------------------------------ drawing
  function resize() {
    const rect = canvas.getBoundingClientRect();
    size = Math.max(200, Math.round(rect.width));
    cell = size / COLS;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  window.addEventListener('resize', resize);

  function levelHue() { return (232 + (s.level - 1) * 38) % 360; }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBoard(now) {
    const h = levelHue();
    ctx.fillStyle = 'hsl(' + h + ', 32%, 8%)';
    ctx.fillRect(0, 0, size, size);
    // checker tint
    ctx.fillStyle = 'hsla(' + h + ', 40%, 60%, 0.035)';
    for (let y = 0; y < ROWS; y++) for (let x = (y % 2); x < COLS; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    // grid
    ctx.strokeStyle = 'hsla(' + h + ', 50%, 70%, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < COLS; i++) { ctx.moveTo(i * cell + 0.5, 0); ctx.lineTo(i * cell + 0.5, size); }
    for (let i = 1; i < ROWS; i++) { ctx.moveTo(0, i * cell + 0.5); ctx.lineTo(size, i * cell + 0.5); }
    ctx.stroke();
    // vignette
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.2, size / 2, size / 2, size * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }

  function drawObstacles() {
    const h = levelHue();
    s.obstacles.forEach((k) => {
      const [x, y] = k.split(',').map(Number);
      const px = x * cell + 1.5, py = y * cell + 1.5, w = cell - 3;
      roundRect(px, py, w, w, cell * 0.18);
      ctx.fillStyle = 'hsl(' + h + ', 14%, 24%)';
      ctx.fill();
      ctx.strokeStyle = 'hsla(' + h + ', 30%, 70%, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = 'hsla(' + h + ', 30%, 80%, 0.12)';
      roundRect(px + 2, py + 2, w - 4, w * 0.35, cell * 0.12);
      ctx.fill();
    });
  }

  function drawApple(p, body, glow, now, scale) {
    const cx = (p.x + 0.5) * cell;
    const cy = (p.y + 0.5) * cell;
    const r = cell * 0.34 * scale * (1 + Math.sin(now / 220) * 0.05);
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = cell * 0.9;
    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.18, body);
    g.addColorStop(1, glow);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.05, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // stem + leaf
    ctx.strokeStyle = '#7C5A3A';
    ctx.lineWidth = Math.max(1.5, cell * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.8);
    ctx.lineTo(cx + r * 0.1, cy - r * 1.2);
    ctx.stroke();
    ctx.fillStyle = '#4ADE80';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.45, cy - r * 1.05, r * 0.38, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBonus(now) {
    const b = s.bonus;
    if (!b) return;
    const left = 1 - (s.clock - b.born) / b.life;
    if (left < 0.25 && Math.floor(now / 120) % 2 === 0) return; // blink before vanishing
    drawApple(b, '#6EE7B7', '#059669', now, 1);
    const cx = (b.x + 0.5) * cell;
    const cy = (b.y + 0.5) * cell;
    ctx.strokeStyle = 'rgba(110, 231, 183, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.52, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left));
    ctx.stroke();
    ctx.fillStyle = '#ECFDF5';
    ctx.font = '700 ' + Math.round(cell * 0.34) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('+' + b.points, cx, cy - cell * 0.78);
  }

  function drawPortal(now) {
    const p = s.portal;
    if (!p) return;
    const cx = (p.x + 0.5) * cell;
    const cy = (p.y + 0.5) * cell;
    const r = cell * 0.46;
    ctx.save();
    ctx.shadowColor = '#C084FC';
    ctx.shadowBlur = cell * 1.4;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, '#0B0D12');
    g.addColorStop(0.55, '#3B0764');
    g.addColorStop(1, '#C084FC');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = now / (500 + i * 180) * (i % 2 ? -1 : 1) + i;
      ctx.strokeStyle = ['#E9D5FF', '#A78BFA', '#F0ABFC'][i];
      ctx.beginPath();
      ctx.arc(cx, cy, r * (0.55 + i * 0.22) + Math.sin(now / 300 + i) * 1.5, a, a + Math.PI * 1.1);
      ctx.stroke();
    }
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function snakePoints(alpha) {
    const pts = [];
    for (let i = 0; i < s.snake.length; i++) {
      const cur = s.snake[i];
      const old = s.prev[i] || s.prev[s.prev.length - 1] || cur;
      // Skip interpolation across big jumps (should not happen, but stay safe)
      const t = Math.abs(cur.x - old.x) + Math.abs(cur.y - old.y) > 1 ? 1 : alpha;
      pts.push({ x: (lerp(old.x, cur.x, t) + 0.5) * cell, y: (lerp(old.y, cur.y, t) + 0.5) * cell });
    }
    return pts;
  }

  function mixColor(a, b, t) {
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return 'rgb(' + pa.map((v, i) => Math.round(lerp(v, pb[i], t))).join(',') + ')';
  }

  function drawSnake(alpha, now) {
    const pts = snakePoints(mode === 'playing' ? alpha : 1);
    const n = pts.length;
    const width = cell * 0.74;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // soft glow under the body
    ctx.save();
    ctx.shadowColor = 'rgba(129, 140, 248, 0.55)';
    ctx.shadowBlur = cell * 0.8;
    ctx.strokeStyle = '#4F46E5';
    ctx.lineWidth = width;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
    ctx.restore();
    // body gradient, tail to head
    for (let i = n - 1; i > 0; i--) {
      const t = i / Math.max(1, n - 1);
      ctx.strokeStyle = mixColor('#C7D2FE', '#4338CA', t);
      ctx.lineWidth = width * (1 - t * 0.35);
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i - 1].x, pts[i - 1].y);
      ctx.stroke();
    }
    // sheen stripe
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = width * 0.22;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - width * 0.18) : ctx.moveTo(p.x, p.y - width * 0.18)));
    ctx.stroke();
    // head
    const h = pts[0];
    const d = s.dir;
    ctx.save();
    ctx.shadowColor = '#A5B4FC';
    ctx.shadowBlur = cell * 0.9;
    ctx.fillStyle = '#E0E7FF';
    ctx.beginPath();
    ctx.arc(h.x, h.y, width * 0.56, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // eyes look where the snake is going
    const ex = -d.y, ey = d.x; // perpendicular
    const blink = Math.floor(now / 2600) % 7 === 0 && (now % 2600) < 140;
    for (const side of [-1, 1]) {
      const cx = h.x + d.x * width * 0.18 + ex * side * width * 0.24;
      const cy = h.y + d.y * width * 0.18 + ey * side * width * 0.24;
      ctx.fillStyle = '#0B0D12';
      ctx.beginPath();
      if (blink || mode === 'over') ctx.ellipse(cx, cy, width * 0.13, width * 0.03, 0, 0, Math.PI * 2);
      else ctx.arc(cx, cy, width * 0.12, 0, Math.PI * 2);
      ctx.fill();
      if (!blink && mode !== 'over') {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(cx + d.x * width * 0.04 - width * 0.03, cy + d.y * width * 0.04 - width * 0.03, width * 0.04, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawEffects() {
    s.particles.forEach((q) => {
      const a = 1 - q.age / q.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r * (0.6 + a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    s.popups.forEach((q) => {
      const a = Math.min(1, q.t / 400);
      ctx.globalAlpha = a;
      ctx.fillStyle = q.color;
      ctx.font = '800 ' + Math.round(cell * 0.6) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(q.text, (q.x + 0.5) * cell, (q.y + 0.5) * cell - (900 - q.t) * 0.045);
    });
    ctx.globalAlpha = 1;
    if (s.banner.t > 0) {
      const a = Math.min(1, s.banner.t / 400);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(11, 13, 18, 0.55)';
      roundRect(size / 2 - cell * 5, size / 2 - cell * 1.3, cell * 10, cell * 2.6, cell * 0.6);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 ' + Math.round(cell * 1.1) + 'px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(s.banner.text, size / 2, size / 2 + 1);
      ctx.globalAlpha = 1;
    }
    if (s.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (s.flash * 0.25) + ')';
      ctx.fillRect(0, 0, size, size);
    }
  }

  function render(alpha, now) {
    ctx.save();
    if (s.shake > 0) ctx.translate(rand(-s.shake, s.shake) * 0.5, rand(-s.shake, s.shake) * 0.5);
    drawBoard(now);
    drawObstacles();
    drawPortal(now);
    if (s.food) drawApple(s.food, '#FDA4AF', '#E11D48', now, 1);
    drawBonus(now);
    drawSnake(alpha, now);
    drawEffects();
    ctx.restore();
  }

  // ------------------------------------------------------------------ loop
  function frame(now) {
    const dt = Math.min(100, now - (lastFrame || now));
    lastFrame = now;
    if (mode === 'playing') {
      s.acc += dt;
      s.clock += dt;
      while (s.acc >= s.tickMs && mode === 'playing') {
        s.acc -= s.tickMs;
        step();
      }
      hudTimer += dt;
      if (hudTimer > 250) { hudTimer = 0; ui.time.textContent = fmtTime(s.clock); }
    }
    if (mode !== 'paused') updateEffects(dt);
    render(mode === 'playing' ? s.acc / s.tickMs : 1, now);
    requestAnimationFrame(frame);
  }

  resize();
  reset();
  showOverlay('Snake Odyssey', 'Eat apples to fill the bar, then dive into the portal to reach the next level. Each level is faster, with new obstacles.', 'Start game');
  requestAnimationFrame(frame);
})();
