'use strict';

/**
 * SKYBREAKER — playable demo (Gazudian Games).
 * Canvas vertical shooter: pointer/keys to fly, auto-fire, waves,
 * combo multiplier, power-ups, particles, screen shake.
 */
(function () {
  var canvas = document.getElementById('game');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var overlay = document.getElementById('gameOverlay');
  var hudScore = document.getElementById('gScore');
  var hudWave = document.getElementById('gWave');
  var hudLives = document.getElementById('gLives');
  var hudHi = document.getElementById('gHi');
  var audio = window.GZAudio || {};
  var hooks = window.GZGameHooks || {};

  var W = 960, H = 540;

  function pad(n, len) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < len) s = '0' + s;
    return s;
  }

  /* ---------------- state ---------------- */
  var S = {
    state: 'idle', // idle | playing | paused | over
    score: 0,
    hi: Number(localStorage.getItem('gzg_hiscore') ? JSON.parse(localStorage.getItem('gzg_hiscore')) : 0) || 0,
    wave: 1, lives: 3, combo: 0, comboTimer: 0, mult: 1,
    runTime: 0, waveTimer: 0, spawnTimer: 0.9, shake: 0,
    power: 0, shield: 0, invuln: 0, shotsFired: 0, lastNew: false
  };
  var player = { x: W / 2, y: H - 90, tx: W / 2, ty: H - 90, fireTimer: 0 };
  var bullets = [], enemies = [], bolts = [], parts = [], pops = [], pickups = [], bgStars = [];
  var banner = null, firstPlayDone = false;
  var keys = {};
  var pointer = { x: W / 2, y: H - 90 };

  /* ---------------- sizing ---------------- */
  function fit() {
    var rect = canvas.getBoundingClientRect();
    var cssW = Math.max(320, rect.width || W);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * (H / W) * dpr);
    var s = canvas.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
  }
  window.addEventListener('resize', fit);
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(canvas);
  fit();

  /* ---------------- background stars ---------------- */
  (function seedBg() {
    for (var i = 0; i < 90; i++) {
      bgStars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7, s: 1 + Math.random() * 1.6 });
    }
  })();

  /* ---------------- baked sprites ---------------- */
  function bake(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w * 2; c.height = h * 2;
    var g = c.getContext('2d');
    g.scale(2, 2);
    draw(g);
    return c;
  }

  var shipSprite = bake(44, 48, function (g) {
    g.shadowColor = 'rgba(46,230,255,.9)';
    g.shadowBlur = 9;
    g.fillStyle = '#0e2b40';
    g.strokeStyle = '#2ee6ff';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(22, 3);
    g.lineTo(31, 24);
    g.lineTo(38, 43);
    g.lineTo(27, 36);
    g.lineTo(22, 40);
    g.lineTo(17, 36);
    g.lineTo(6, 43);
    g.lineTo(13, 24);
    g.closePath();
    g.fill(); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#bff6ff';
    g.beginPath(); g.moveTo(22, 12); g.lineTo(26, 22); g.lineTo(18, 22); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,61,154,.85)';
    g.fillRect(9, 30, 6, 2); g.fillRect(29, 30, 6, 2);
  });

  var droneSprite = bake(42, 36, function (g) {
    g.shadowColor = 'rgba(255,90,90,.8)';
    g.shadowBlur = 8;
    g.fillStyle = '#38101a';
    g.strokeStyle = '#ff5a5a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(21, 3); g.lineTo(37, 18); g.lineTo(21, 33); g.lineTo(5, 18);
    g.closePath(); g.fill(); g.stroke();
    g.shadowBlur = 0;
    g.fillStyle = '#ffc63d';
    g.beginPath(); g.arc(21, 18, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#38101a';
    g.beginPath(); g.arc(21, 18, 2, 0, Math.PI * 2); g.fill();
  });

  function rockSprite(r, seed, hue) {
    var s = r * 2 + 16;
    return bake(s, s, function (g) {
      var cx = s / 2, cy = s / 2;
      g.shadowColor = 'rgba(255,61,154,.75)';
      g.shadowBlur = 8;
      g.fillStyle = '#241033';
      g.strokeStyle = hue || '#ff3d9a';
      g.lineWidth = 2;
      g.beginPath();
      var pts = 9 + (seed % 3);
      for (var i = 0; i < pts; i++) {
        var a = (i / pts) * Math.PI * 2;
        var wob = Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453 % 1);
        var rr = r * (0.7 + wob * 0.45);
        var x = cx + Math.cos(a) * rr;
        var y = cy + Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.closePath();
      g.fill(); g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.09)';
      g.beginPath(); g.arc(cx - r * 0.25, cy - r * 0.3, r * 0.32, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.beginPath(); g.arc(cx + r * 0.28, cy + r * 0.15, r * 0.2, 0, Math.PI * 2); g.fill();
    });
  }

  var rocks = {
    s: { r: 15, hp: 1, pts: 10, variants: [rockSprite(15, 1), rockSprite(15, 2), rockSprite(15, 3)] },
    m: { r: 25, hp: 2, pts: 20, variants: [rockSprite(25, 4), rockSprite(25, 5), rockSprite(25, 6)] },
    l: { r: 39, hp: 3, pts: 30, variants: [rockSprite(39, 7, '#ff7ac0'), rockSprite(39, 8, '#ff7ac0'), rockSprite(39, 9, '#ff7ac0')] }
  };

  /* ---------------- spawning ---------------- */
  function variantOf(key) {
    var v = rocks[key].variants;
    return v[Math.floor(Math.random() * v.length)];
  }

  function spawnRock() {
    var roll = Math.random();
    var key = roll < 0.45 ? 's' : roll < 0.82 ? 'm' : 'l';
    var spec = rocks[key];
    enemies.push({
      type: 'rock', key: key, r: spec.r, hp: spec.hp, pts: spec.pts, sp: variantOf(key),
      x: 60 + Math.random() * (W - 120), y: -60 - Math.random() * 40,
      vy: 62 + S.wave * 9 + Math.random() * 55,
      vx: (Math.random() - 0.5) * 60,
      rot: Math.random() * Math.PI * 2,
      rs: (Math.random() - 0.5) * 1.6
    });
  }

  function spawnDrone() {
    var baseX = 80 + Math.random() * (W - 160);
    enemies.push({
      type: 'drone', r: 17, hp: 2, pts: 25, sp: droneSprite,
      x: baseX, baseX: baseX, y: -50,
      vy: 78 + S.wave * 6,
      amp: 40 + Math.random() * 70, freq: 0.9 + Math.random() * 1.2,
      t: Math.random() * 3, fireTimer: 1.6 + Math.random(), rot: 0, rs: 0
    });
  }

  function spawnEnemy() {
    if (S.wave >= 2 && Math.random() < 0.24) spawnDrone(); else spawnRock();
  }

  /* ---------------- fx ---------------- */
  function burst(x, y, color, n, spd) {
    for (var i = 0; i < n; i++) {
      if (parts.length > 420) break;
      var a = Math.random() * Math.PI * 2;
      var v = (0.3 + Math.random()) * (spd || 160);
      parts.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.6, c: color, s: 1.5 + Math.random() * 2.5 });
    }
  }
  function pop(x, y, text) { pops.push({ x: x, y: y, text: text, life: 1 }); }

  /* ---------------- overlay ---------------- */
  function ov(kind) {
    if (!overlay) return;
    if (kind === 'none') { overlay.hidden = true; overlay.innerHTML = ''; return; }
    var html = '';
    if (kind === 'idle') {
      html = '<div class="ov"><p class="ov__kicker">SKYBREAKER \u2014 DEMO 0.9.1</p>' +
        '<h3 class="ov__title">READY?</h3>' +
        '<p class="ov__sub">Fly with <kbd>MOUSE</kbd> or <kbd>ARROW KEYS</kbd>. Guns fire themselves. Don\u2019t hit the rocks.</p>' +
        '<button class="btn btn--primary btn--lg" data-action="start">\u25B6\u00A0 START MISSION</button>' +
        '<p class="ov__foot">3 lives \u00B7 1 high score \u00B7 0 excuses</p></div>';
    } else if (kind === 'paused') {
      html = '<div class="ov"><p class="ov__kicker">PAUSED</p>' +
        '<h3 class="ov__title">TAKE A BREATH</h3>' +
        '<p class="ov__sub">The rocks will wait. They have nowhere to be.</p>' +
        '<button class="btn btn--primary" data-action="resume">\u25B6\u00A0 RESUME</button>' +
        '<p class="ov__foot">HI-SCORE ' + pad(S.hi, 6) + ' \u00B7 SCORE ' + pad(S.score, 6) + '</p></div>';
    } else {
      html = '<div class="ov"><p class="ov__kicker">RUN TERMINATED</p>' +
        '<h3 class="ov__title">' + (S.lastNew ? 'NEW HIGH SCORE!' : 'GAME OVER') + '</h3>' +
        '<p class="ov__sub">SCORE ' + pad(S.score, 6) + ' \u00B7 WAVE ' + S.wave + ' \u00B7 ' +
        (S.lastNew ? 'you beat your best' : 'best ' + pad(S.hi, 6)) + '</p>' +
        '<button class="btn btn--primary btn--lg" data-action="start">\u25B6\u00A0 INSERT COIN \u2014 RETRY</button>' +
        '<p class="ov__foot">HI-SCORE ' + pad(S.hi, 6) + '</p></div>';
    }
    overlay.innerHTML = html;
    overlay.hidden = false;
  }

  /* ---------------- HUD ---------------- */
  function syncHud() {
    if (hudScore) hudScore.textContent = pad(S.score, 6);
    if (hudWave) hudWave.textContent = String(S.wave);
    if (hudHi) hudHi.textContent = pad(S.hi, 6);
    if (hudLives) {
      var h = '';
      for (var i = 0; i < 3; i++) h += '<i' + (i < S.lives ? '' : ' class="off"') + '>\u2665</i>';
      hudLives.innerHTML = h;
    }
  }

  /* ---------------- control ---------------- */
  function resetRun() {
    S.score = 0; S.wave = 1; S.lives = 3; S.combo = 0; S.comboTimer = 0; S.mult = 1;
    S.runTime = 0; S.waveTimer = 0; S.spawnTimer = 0.9; S.shake = 0;
    S.power = 0; S.shield = 0; S.invuln = 1.2; S.shotsFired = 0; S.lastNew = false;
    player.x = player.tx = W / 2;
    player.y = player.ty = H - 90;
    player.fireTimer = 0;
    bullets = []; enemies = []; bolts = []; parts = []; pops = []; pickups = [];
    banner = { text: 'WAVE 1', t: 1.6 };
    syncHud();
  }

  function start() {
    resetRun();
    S.state = 'playing';
    ov('none');
    if (audio.coin) audio.coin();
    if (!firstPlayDone) {
      firstPlayDone = true;
      if (hooks.firstPlay) hooks.firstPlay();
    }
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }

  function pause() {
    if (S.state !== 'playing') return;
    S.state = 'paused';
    ov('paused');
  }

  function resume() {
    if (S.state !== 'paused') return;
    S.state = 'playing';
    ov('none');
  }

  function gameOver() {
    S.state = 'over';
    S.lastNew = S.score > S.hi;
    if (S.lastNew) S.hi = S.score;
    if (hooks.gameOver) hooks.gameOver(S.score, S.hi, S.lastNew);
    if (audio.over) audio.over();
    burst(player.x, player.y, '#2ee6ff', 40, 240);
    burst(player.x, player.y, '#ff3d9a', 30, 200);
    S.shake = 18;
    ov('over');
    syncHud();
  }

  /* ---------------- input ---------------- */
  function canvasPos(e) {
    var r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }

  canvas.addEventListener('pointermove', function (e) {
    var p = canvasPos(e);
    pointer.x = p.x; pointer.y = p.y;
    player.tx = p.x; player.ty = p.y;
  });

  canvas.addEventListener('pointerdown', function (e) {
    var p = canvasPos(e);
    pointer.x = p.x; pointer.y = p.y;
    player.tx = p.x; player.ty = p.y;
    if (S.state === 'idle' || S.state === 'over') start();
    else if (S.state === 'paused') resume();
  });

  window.addEventListener('keydown', function (e) {
    if (window.GZ && typeof window.GZ.isBooted === 'function' && !window.GZ.isBooted()) return;
    var k = e.key;
    if (k === 'p' || k === 'P' || k === 'Escape') {
      if (S.state === 'playing') { pause(); e.preventDefault(); }
      else if (S.state === 'paused') { resume(); e.preventDefault(); }
      return;
    }
    if (S.state === 'playing') {
      if (k.indexOf('Arrow') === 0 || k === ' ') e.preventDefault();
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'a', 'd', 'w', 's'].indexOf(k) !== -1) keys[k] = true;
    }
    if ((S.state === 'idle' || S.state === 'over') && (k === 'Enter' || k === ' ')) start();
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!b) return;
    var arcade = document.getElementById('arcade');
    if (!arcade || !arcade.contains(b)) return;
    var action = b.getAttribute('data-action');
    if (action === 'start' || action === 'restart') start();
    else if (action === 'pause') { if (S.state === 'playing') pause(); else if (S.state === 'paused') resume(); }
    else if (action === 'resume') resume();
  });

  /* ---------------- update ---------------- */
  function killEnemy(en) {
    var gained = en.pts * S.mult;
    S.score += gained;
    S.combo++;
    S.comboTimer = 3.2;
    S.mult = 1 + Math.min(4, Math.floor(S.combo / 6));
    pop(en.x, en.y, '+' + gained);
    burst(en.x, en.y, en.type === 'drone' ? '#ff5a5a' : '#ff3d9a', en.key === 'l' ? 26 : 14, en.key === 'l' ? 230 : 170);
    if (en.key === 'l') {
      if (audio.boomBig) audio.boomBig();
      S.shake = Math.max(S.shake, 9);
      for (var i = 0; i < 2; i++) {
        enemies.push({
          type: 'rock', key: 'm', r: rocks.m.r, hp: 1, pts: rocks.m.pts, sp: variantOf('m'),
          x: en.x + (i === 0 ? -22 : 22), y: en.y,
          vy: en.vy * 1.05, vx: (i === 0 ? -70 : 70),
          rot: Math.random() * 6, rs: (Math.random() - 0.5) * 2.4
        });
      }
    } else if (audio.boom) {
      audio.boom();
    }
    if (Math.random() < 0.11) {
      pickups.push({ x: en.x, y: en.y, vy: 95, type: Math.random() < 0.65 ? 'P' : 'S' });
    }
    if (hudScore) hudScore.textContent = pad(S.score, 6);
  }

  function playerHit() {
    if (S.shield > 0) {
      S.shield = 0;
      S.invuln = 1.4;
      burst(player.x, player.y, '#6bff9e', 18, 190);
      if (audio.power) audio.power();
      pop(player.x, player.y - 24, 'SHIELD DOWN');
      return;
    }
    S.lives--;
    S.combo = 0; S.mult = 1;
    S.invuln = 2.2;
    S.shake = 16;
    burst(player.x, player.y, '#2ee6ff', 24, 220);
    if (audio.hit) audio.hit();
    syncHud();
    if (S.lives <= 0) gameOver();
  }

  function update(dt) {
    var i;

    var starSpeed = S.state === 'playing' ? 120 : 26;
    for (i = 0; i < bgStars.length; i++) {
      var st = bgStars[i];
      st.y += starSpeed * st.z * dt;
      if (st.y > H + 3) { st.y = -3; st.x = Math.random() * W; }
    }

    for (i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 1.6 * dt); p.vy *= (1 - 1.6 * dt);
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (i = pops.length - 1; i >= 0; i--) {
      pops[i].y -= 34 * dt;
      pops[i].life -= dt * 0.9;
      if (pops[i].life <= 0) pops.splice(i, 1);
    }
    if (S.shake > 0) S.shake = Math.max(0, S.shake - 40 * dt);
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }

    /* keep bullets flying in the game-over freeze-frame */
    if (S.state === 'over') {
      for (i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y += bullets[i].vy * dt * 0.4;
        if (bullets[i].y < -20) bullets.splice(i, 1);
      }
      for (i = enemies.length - 1; i >= 0; i--) {
        enemies[i].y += enemies[i].vy * 0.25 * dt;
        enemies[i].rot += enemies[i].rs * 0.3 * dt;
        if (enemies[i].y > H + 90) enemies.splice(i, 1);
      }
      return;
    }

    /* attract mode behind the start screen */
    if (S.state === 'idle') {
      if (enemies.length < 5 && Math.random() < 0.9 * dt) spawnRock();
      for (i = enemies.length - 1; i >= 0; i--) {
        var idleE = enemies[i];
        idleE.y += (idleE.vy * 0.5) * dt;
        idleE.x += idleE.vx * 0.3 * dt;
        idleE.rot += idleE.rs * 0.5 * dt;
        if (idleE.y > H + 70) enemies.splice(i, 1);
      }
      return;
    }

    if (S.state !== 'playing') return;

    S.runTime += dt;
    S.waveTimer += dt;
    if (S.power > 0) S.power -= dt;
    if (S.invuln > 0) S.invuln -= dt;
    if (S.comboTimer > 0) {
      S.comboTimer -= dt;
      if (S.comboTimer <= 0) { S.combo = 0; S.mult = 1; }
    }

    /* player */
    var kx = 0, ky = 0;
    if (keys.ArrowLeft || keys.a) kx -= 1;
    if (keys.ArrowRight || keys.d) kx += 1;
    if (keys.ArrowUp || keys.w) ky -= 1;
    if (keys.ArrowDown || keys.s) ky += 1;
    if (kx || ky) {
      var kl = Math.hypot(kx, ky) || 1;
      player.tx += (kx / kl) * 560 * dt;
      player.ty += (ky / kl) * 560 * dt;
    }
    player.tx = Math.min(W - 26, Math.max(26, player.tx));
    player.ty = Math.min(H - 30, Math.max(H * 0.3, player.ty));
    var lerp = Math.min(1, dt * 16);
    player.x += (player.tx - player.x) * lerp;
    player.y += (player.ty - player.y) * lerp;

    /* auto fire */
    var fireEvery = S.power > 0 ? 0.085 : 0.145;
    player.fireTimer -= dt;
    while (player.fireTimer <= 0) {
      player.fireTimer += fireEvery;
      S.shotsFired++;
      if (S.power > 0) {
        bullets.push({ x: player.x - 9, y: player.y - 22, vy: -820 });
        bullets.push({ x: player.x + 9, y: player.y - 22, vy: -820 });
      } else {
        bullets.push({ x: player.x, y: player.y - 22, vy: -820 });
      }
      if (audio.shoot && (S.shotsFired & 1) === 0) audio.shoot();
    }

    for (i = bullets.length - 1; i >= 0; i--) {
      bullets[i].y += bullets[i].vy * dt;
      if (bullets[i].y < -20) bullets.splice(i, 1);
    }

    /* spawn director */
    S.spawnTimer -= dt;
    if (S.spawnTimer <= 0) {
      var every = Math.max(0.34, 1.05 - S.wave * 0.085 - S.runTime * 0.004);
      S.spawnTimer = every * (0.7 + Math.random() * 0.7);
      spawnEnemy();
    }
    if (S.waveTimer > 15 + S.wave * 2) {
      S.wave++;
      S.waveTimer = 0;
      banner = { text: 'WAVE ' + S.wave, t: 1.7 };
      if (hudWave) hudWave.textContent = String(S.wave);
      if (audio.wave) audio.wave();
      if (hooks.wave) hooks.wave(S.wave);
    }

    /* enemies */
    for (i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      if (e.type === 'drone') {
        e.t += dt;
        e.y += e.vy * dt;
        e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.y > 40) {
          e.fireTimer = 2.4 - Math.min(1.2, S.wave * 0.12);
          var ang = Math.atan2(player.y - e.y, player.x - e.x);
          bolts.push({ x: e.x, y: e.y + 10, vx: Math.cos(ang) * 190, vy: Math.max(120, Math.sin(ang) * 190) });
        }
      } else {
        e.rot += e.rs * dt;
        e.y += e.vy * dt;
        e.x += e.vx * dt;
        if (e.x < 40 || e.x > W - 40) e.vx *= -1;
      }
      if (e.y > H + 90) { enemies.splice(i, 1); continue; }

      var dpx = e.x - player.x, dpy = e.y - player.y;
      var near = e.r + 17;
      if (S.invuln <= 0 && dpx * dpx + dpy * dpy < near * near) {
        if (e.type === 'rock') burst(e.x, e.y, '#ff3d9a', 16, 170);
        enemies.splice(i, 1);
        playerHit();
      }
    }

    /* bullets vs enemies */
    for (i = bullets.length - 1; i >= 0; i--) {
      var bu = bullets[i];
      for (var j = enemies.length - 1; j >= 0; j--) {
        var en = enemies[j];
        var dx = en.x - bu.x, dy = en.y - bu.y;
        var rr = en.r + 5;
        if (dx * dx + dy * dy < rr * rr) {
          bullets.splice(i, 1);
          en.hp--;
          burst(bu.x, bu.y, '#2ee6ff', 4, 90);
          if (en.hp <= 0) {
            killEnemy(en);
            enemies.splice(j, 1);
          }
          break;
        }
      }
    }

    /* enemy bolts */
    for (i = bolts.length - 1; i >= 0; i--) {
      var bo = bolts[i];
      bo.x += bo.vx * dt; bo.y += bo.vy * dt;
      if (bo.y > H + 20 || bo.x < -20 || bo.x > W + 20) { bolts.splice(i, 1); continue; }
      var bx2 = bo.x - player.x, by2 = bo.y - player.y;
      if (S.invuln <= 0 && bx2 * bx2 + by2 * by2 < 400) {
        bolts.splice(i, 1);
        playerHit();
      }
    }

    /* pickups */
    for (i = pickups.length - 1; i >= 0; i--) {
      var pk = pickups[i];
      pk.y += pk.vy * dt;
      if (pk.y > H + 30) { pickups.splice(i, 1); continue; }
      var px = pk.x - player.x, py = pk.y - player.y;
      if (px * px + py * py < 900) {
        if (pk.type === 'P') { S.power = 12; pop(pk.x, pk.y, 'POWER UP'); }
        else { S.shield = 1; pop(pk.x, pk.y, 'SHIELD'); }
        if (audio.power) audio.power();
        burst(pk.x, pk.y, pk.type === 'P' ? '#ffc63d' : '#6bff9e', 12, 120);
        pickups.splice(i, 1);
      }
    }
  }

  /* ---------------- draw ---------------- */
  function draw() {
    ctx.save();
    if (S.shake > 0) {
      ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    }

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05070f');
    g.addColorStop(0.55, '#070b1c');
    g.addColorStop(1, '#0a0620');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    var i;
    for (i = 0; i < bgStars.length; i++) {
      var st = bgStars[i];
      ctx.fillStyle = 'rgba(233,239,255,' + (0.18 + st.z * 0.5).toFixed(3) + ')';
      ctx.fillRect(st.x, st.y, st.s, st.s);
    }

    /* pickups */
    for (i = 0; i < pickups.length; i++) {
      var pk = pickups[i];
      var col = pk.type === 'P' ? '#ffc63d' : '#6bff9e';
      ctx.save();
      ctx.shadowColor = col; ctx.shadowBlur = 12;
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.strokeRect(pk.x - 11, pk.y - 11, 22, 22);
      ctx.fillStyle = col;
      ctx.font = '10px "Press Start 2P", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(pk.type, pk.x, pk.y + 1);
      ctx.restore();
    }

    /* enemies */
    for (i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.rot);
      var spr = e.sp || droneSprite;
      ctx.drawImage(spr, -spr.width / 4, -spr.height / 4, spr.width / 2, spr.height / 2);
      ctx.restore();
    }

    /* bolts */
    ctx.save();
    ctx.shadowColor = '#ff5a5a'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ff5a5a';
    for (i = 0; i < bolts.length; i++) {
      ctx.beginPath(); ctx.arc(bolts[i].x, bolts[i].y, 4.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    /* bullets */
    ctx.save();
    ctx.shadowColor = '#2ee6ff'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#bff6ff';
    for (i = 0; i < bullets.length; i++) {
      ctx.fillRect(bullets[i].x - 2, bullets[i].y - 9, 4, 18);
    }
    ctx.restore();

    /* player */
    if (S.state !== 'over' && (S.state !== 'playing' || S.invuln <= 0 || Math.floor(performance.now() / 90) % 2 === 0)) {
      var fl = 10 + Math.random() * 8;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createLinearGradient(0, player.y + 20, 0, player.y + 20 + fl);
      fg.addColorStop(0, 'rgba(46,230,255,.8)');
      fg.addColorStop(1, 'rgba(255,61,154,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(player.x - 5, player.y + 18);
      ctx.lineTo(player.x + 5, player.y + 18);
      ctx.lineTo(player.x, player.y + 20 + fl);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (S.state === 'playing') {
        ctx.drawImage(shipSprite, player.x - 22, player.y - 24, 44, 48);
      } else {
        /* idle: ship whispers at the bottom */
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(shipSprite, player.x - 22, player.y - 24, 44, 48);
        ctx.restore();
      }

      if (S.shield > 0 && S.state === 'playing') {
        ctx.save();
        ctx.strokeStyle = 'rgba(107,255,158,.75)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#6bff9e'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(player.x, player.y, 34, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
    }

    /* particles */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    /* score pops */
    ctx.save();
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc63d';
    for (i = 0; i < pops.length; i++) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pops[i].life));
      ctx.fillText(pops[i].text, pops[i].x, pops[i].y);
    }
    ctx.restore();

    if (S.state === 'playing' && S.mult > 1) {
      ctx.save();
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.fillStyle = '#ff3d9a';
      ctx.shadowColor = '#ff3d9a'; ctx.shadowBlur = 10;
      ctx.textAlign = 'left';
      ctx.fillText('COMBO x' + S.mult, 24, H - 24);
      ctx.restore();
    }

    if (banner) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, banner.t / 0.4);
      ctx.font = '26px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9efff';
      ctx.shadowColor = '#2ee6ff'; ctx.shadowBlur = 22;
      ctx.fillText(banner.text, W / 2, H * 0.38);
      ctx.restore();
    }

    ctx.restore();
  }

  /* ---------------- loop ---------------- */
  var rafId = null, lastT = 0, running = false, arcadeVisible = true;

  function frame(t) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
    lastT = t;
    update(dt);
    draw();
  }
  function startLoop() { if (!running) { running = true; lastT = 0; rafId = requestAnimationFrame(frame); } }
  function stopLoop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = null; }
  function loopVisibility() {
    if (arcadeVisible && !document.hidden) startLoop(); else stopLoop();
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        arcadeVisible = en.isIntersecting;
        if (!arcadeVisible && S.state === 'playing') pause();
        loopVisibility();
      });
    }, { threshold: 0.05 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && S.state === 'playing') pause();
    loopVisibility();
  });
  loopVisibility();

  /* ---------------- public API ---------------- */
  window.GZGame = {
    start: start,
    pause: pause,
    resume: resume,
    isPlaying: function () { return S.state === 'playing'; },
    state: function () { return S.state; }
  };

  syncHud();
  ov('idle');
})();