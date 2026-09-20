'use strict';

/**
 * Gazudian Games — site layer.
 * Boot screen, hero starfield, XP/level scroll progression,
 * achievements, toasts, tilt, konami code.
 */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var store = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    }
  };

  function pad(n, len) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < len) s = '0' + s;
    return s;
  }

  /* ================= toasts ================= */
  var toastWrap = $('#toasts');
  var queue = [];
  var showing = false;

  function toast(o) {
    queue.push(o);
    if (!showing) nextToast();
  }

  function nextToast() {
    var o = queue.shift();
    if (!o) { showing = false; return; }
    showing = true;
    var el = document.createElement('div');
    el.className = 'toast ' +
      (o.type === 'achievement' ? 'toast--ach' : o.type === 'level' ? 'toast--level' : 'toast--info');
    var icon = document.createElement('span');
    icon.className = 'toast__icon';
    icon.textContent = o.icon || '\uD83C\uDFC6';
    var body = document.createElement('div');
    var title = document.createElement('p');
    title.className = 'toast__title';
    title.textContent = o.title || '';
    var desc = document.createElement('p');
    desc.className = 'toast__desc';
    desc.textContent = o.desc || '';
    body.appendChild(title); body.appendChild(desc);
    el.appendChild(icon); el.appendChild(body);
    toastWrap.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-in'); });
    setTimeout(function () {
      el.classList.remove('is-in');
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); nextToast(); }, 420);
    }, o.ms || 4600);
  }

  /* ================= achievements ================= */
  var ACH = {
    boot:          { name: 'SYSTEM ONLINE',    flavor: 'You pressed start. Respect.' },
    explorer:      { name: 'EXPLORER',         flavor: 'A quarter of the way down the rabbit hole.' },
    pathfinder:    { name: 'PATHFINDER',       flavor: 'Halfway. The plot thickens.' },
    stargazer:     { name: 'STARGAZER',        flavor: 'Three quarters deep. You can see the stars from here.' },
    completionist: { name: 'COMPLETIONIST',    flavor: 'You reached the bottom. The bottom reached back.' },
    ace:           { name: 'ACE PILOT',        flavor: 'First SKYBREAKER launch on record.' },
    sharp:         { name: 'SHARP SHOOTER',    flavor: '300+ points in a single run. Not bad, pilot.' },
    wave:          { name: 'WAVE RIDER',       flavor: 'Survived to wave 3. The belt respects you now.' },
    konami:        { name: 'KONAMI PROTOCOL',  flavor: '\u2191\u2191\u2193\u2193\u2190\u2192\u2190\u2192BA. Old magic still works.' },
    audiophile:    { name: 'AUDIOPHILE',       flavor: 'Toggled the sound twice. We appreciate the attention to detail.' },
    recruit:       { name: 'RECRUIT',          flavor: 'On the playtest list. See you at the front.' },
    afk:           { name: 'STILL LOADING\u2026', flavor: 'You stared at our site for a full minute. We love you.' }
  };

  var unlocked = {};
  (store.get('gzg_ach', []) || []).forEach(function (id) { unlocked[id] = true; });

  function achieve(id) {
    if (unlocked[id] || !ACH[id]) return false;
    unlocked[id] = true;
    store.set('gzg_ach', Object.keys(unlocked));
    var a = ACH[id];
    toast({ type: 'achievement', icon: '\uD83C\uDFC6', title: 'ACHIEVEMENT UNLOCKED', desc: a.name + ' \u2014 ' + a.flavor });
    if (window.GZAudio) window.GZAudio.ach();
    return true;
  }

  /* ================= XP / levels ================= */
  var LEVELS = ['ROOKIE', 'CADET', 'PILOT', 'ACE', 'STARGAZER', 'VOIDWALKER', 'SUNBREAKER', 'MYTH', 'LEGEND', 'GAZUDIAN'];
  var xpFill = $('#xpFill'), xpLevel = $('#xpLevel'), xpTitle = $('#xpTitle');
  var lastLevel = 1;
  var booted = false;

  function setLevel(lvl, quiet) {
    var name = LEVELS[Math.min(LEVELS.length, lvl) - 1] || LEVELS[0];
    xpLevel.innerHTML = 'LVL&nbsp;' + lvl;
    xpTitle.textContent = name;
    if (!quiet && lvl > lastLevel && booted) {
      toast({
        type: 'level', icon: '\u2B50',
        title: 'LEVEL UP \u2014 LVL ' + lvl,
        desc: 'Rank: ' + name + '. Keep scrolling, keep earning.'
      });
      if (window.GZAudio) window.GZAudio.level();
    }
    lastLevel = lvl;
  }

  var scrollHit = {};
  function onScroll() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var y = window.scrollY || doc.scrollTop || 0;
    var p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
    xpFill.style.width = (p * 100).toFixed(2) + '%';
    var lvl = Math.min(10, 1 + Math.floor(p * 9.999));
    if (lvl !== lastLevel) setLevel(lvl, false);

    if (p >= 0.25 && !scrollHit.a) { scrollHit.a = true; achieve('explorer'); }
    if (p >= 0.5 && !scrollHit.b) { scrollHit.b = true; achieve('pathfinder'); }
    if (p >= 0.75 && !scrollHit.c) { scrollHit.c = true; achieve('stargazer'); }
    if (max > 0 && max - y < 70 && !scrollHit.d) { scrollHit.d = true; achieve('completionist'); }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  /* ================= boot sequence ================= */
  var boot = $('#boot'), bootFill = $('#bootFill'), bootLine = $('#bootLine'), bootStart = $('#bootStart');

  function bootGo(interactive) {
    if (booted) return;
    booted = true;
    document.body.classList.remove('booting');
    if (!boot) return;
    if (interactive) {
      if (window.GZAudio) { window.GZAudio.unlock(); window.GZAudio.boot(); }
      achieve('boot');
    }
    boot.classList.add('is-done');
    setTimeout(function () { if (boot && boot.parentNode) boot.remove(); }, 900);
    onScroll();
  }

  if (boot) {
    if (reduced) {
      bootFill.style.width = '100%';
      bootLine.textContent = 'READY.';
      bootStart.hidden = false;
    } else {
      var steps = [
        { p: 16, l: 'LOADING CARTRIDGE\u2026' },
        { p: 40, l: 'WARMING THRUSTERS\u2026' },
        { p: 63, l: 'POLISHING PIXELS\u2026' },
        { p: 86, l: 'CHECKING VIBES\u2026' },
        { p: 100, l: 'READY.' }
      ];
      var i = 0;
      var iv = setInterval(function () {
        var s = steps[i++];
        if (!s) { clearInterval(iv); return; }
        bootFill.style.width = s.p + '%';
        bootLine.textContent = s.l;
        if (i >= steps.length) bootStart.hidden = false;
      }, 400);
    }
    boot.addEventListener('click', function () { bootGo(true); });
    window.addEventListener('keydown', function (e) {
      if (!booted && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) bootGo(true);
    });
    setTimeout(function () { if (!booted) { bootFill.style.width = '100%'; bootLine.textContent = 'READY.'; bootStart.hidden = false; } }, 2400);
    setTimeout(function () { if (!booted) bootGo(false); }, 10000);
  } else {
    document.body.classList.remove('booting');
    booted = true;
  }

  /* unlock audio on first real gesture (autoplay policy) */
  document.addEventListener('pointerdown', function once() {
    document.removeEventListener('pointerdown', once);
    if (window.GZAudio) window.GZAudio.unlock();
  });

  /* ================= sound toggle ================= */
  var soundBtn = $('#soundToggle');
  var soundToggles = 0;
  if (soundBtn) {
    soundBtn.addEventListener('click', function () {
      if (window.GZAudio) {
        window.GZAudio.unlock();
        var on = window.GZAudio.toggle();
        soundBtn.textContent = on ? 'SOUND' : 'MUTED';
        soundBtn.classList.toggle('is-off', !on);
        soundBtn.setAttribute('aria-pressed', String(on));
        soundToggles++;
        if (soundToggles >= 2) achieve('audiophile');
        if (on) window.GZAudio.click();
      }
    });
  }

  /* subtle interaction sounds */
  var lastHover = 0;
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var t = e.target.closest ? e.target.closest('button, a, .world, .gcard') : null;
    if (!t) return;
    var now = performance.now();
    if (now - lastHover < 90) return;
    lastHover = now;
    if (window.GZAudio && window.GZAudio.isEnabled()) window.GZAudio.hover();
  }, { passive: true });

  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.btn, .boot__start') : null;
    if (!b || b.id === 'soundToggle') return;
    if (window.GZAudio && window.GZAudio.isEnabled()) window.GZAudio.click();
  });

  /* ================= reveal on scroll ================= */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduced) {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); ro.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { ro.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ================= hero starfield ================= */
  var heroCanvas = $('#heroStars');
  var heroVisible = true;

  if (heroCanvas) {
    var hctx = heroCanvas.getContext('2d');
    var stars = [], shots = [], flyby = null, flybyTimer = 4;
    var hw = 0, hh = 0, hdpr = 1;
    var mouse = { x: 0.5, y: 0.5 };

    function heroFit() {
      var rect = heroCanvas.parentNode.getBoundingClientRect();
      hw = Math.max(320, rect.width);
      hh = Math.max(320, rect.height);
      hdpr = Math.min(window.devicePixelRatio || 1, 1.6);
      heroCanvas.width = Math.round(hw * hdpr);
      heroCanvas.height = Math.round(hh * hdpr);
      seedStars();
    }

    function seedStars() {
      stars = [];
      var n = Math.min(260, Math.max(90, Math.round(hw * hh / 6200)));
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * hw,
          y: Math.random() * hh,
          z: 0.25 + Math.random() * 0.75,
          tw: Math.random() * Math.PI * 2,
          sp: 0.6 + Math.random() * 1.6
        });
      }
    }

    function drawShip(g, x, y, s, dir) {
      g.save();
      g.translate(x, y);
      g.scale(dir, 1);
      g.fillStyle = 'rgba(46,230,255,.9)';
      g.beginPath();
      g.moveTo(10 * s, 0);
      g.lineTo(-6 * s, 6 * s);
      g.lineTo(-3 * s, 0);
      g.lineTo(-6 * s, -6 * s);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,61,154,.55)';
      g.fillRect(-13 * s, -1.4 * s, 7 * s, 2.8 * s);
      g.restore();
    }

    var heroLast = 0;
    function heroTick(t) {
      var dt = Math.min(0.05, (t - heroLast) / 1000 || 0.016);
      heroLast = t;

      hctx.setTransform(hdpr, 0, 0, hdpr, 0, 0);
      hctx.clearRect(0, 0, hw, hh);

      var i, st;
      for (i = 0; i < stars.length; i++) {
        st = stars[i];
        if (!reduced) st.y += st.sp * st.z * 14 * dt;
        if (st.y > hh + 4) { st.y = -4; st.x = Math.random() * hw; }
        var tw = reduced ? 0.8 : 0.55 + 0.45 * Math.sin(t / 700 * st.sp + st.tw);
        var px = st.x + (mouse.x - 0.5) * 26 * st.z;
        var py = st.y + (mouse.y - 0.5) * 18 * st.z;
        hctx.fillStyle = 'rgba(233,239,255,' + (0.25 + 0.75 * tw) * (0.35 + st.z * 0.65) + ')';
        hctx.fillRect(px, py, st.z > 0.8 ? 2 : 1.4, st.z > 0.8 ? 2 : 1.4);
      }

      /* shooting stars */
      if (!reduced) {
        if (Math.random() < 0.004 && shots.length < 2) {
          shots.push({
            x: Math.random() * hw * 0.8, y: Math.random() * hh * 0.35,
            vx: 420 + Math.random() * 260, vy: 150 + Math.random() * 90,
            life: 1
          });
        }
        for (i = shots.length - 1; i >= 0; i--) {
          var sh = shots[i];
          sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.life -= dt * 0.9;
          if (sh.life <= 0) { shots.splice(i, 1); continue; }
          var grad = hctx.createLinearGradient(sh.x, sh.y, sh.x - 60, sh.y - 22);
          grad.addColorStop(0, 'rgba(46,230,255,' + sh.life + ')');
          grad.addColorStop(1, 'rgba(46,230,255,0)');
          hctx.strokeStyle = grad;
          hctx.lineWidth = 2;
          hctx.beginPath();
          hctx.moveTo(sh.x, sh.y);
          hctx.lineTo(sh.x - 60, sh.y - 22);
          hctx.stroke();
        }

        /* tiny ship flyby */
        flybyTimer -= dt;
        if (!flyby && flybyTimer <= 0) {
          flyby = { x: -30, y: hh * (0.25 + Math.random() * 0.4), v: 130 + Math.random() * 90, s: 1.4 };
          flybyTimer = 14 + Math.random() * 12;
        }
        if (flyby) {
          flyby.x += flyby.v * dt;
          var bob = Math.sin(t / 320) * 6;
          drawShip(hctx, flyby.x, flyby.y + bob, flyby.s, 1);
          if (flyby.x > hw + 40) flyby = null;
        }
      }

      if (heroVisible && !document.hidden) requestAnimationFrame(heroTick);
    }

    heroFit();
    window.addEventListener('resize', heroFit);
    window.addEventListener('pointermove', function (e) {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = e.clientY / window.innerHeight;
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var was = heroVisible;
          heroVisible = en.isIntersecting;
          if (heroVisible && !was) { heroLast = 0; requestAnimationFrame(heroTick); }
        });
      }, { threshold: 0.02 }).observe(heroCanvas.parentNode);
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && heroVisible) { heroLast = 0; requestAnimationFrame(heroTick); }
    });
    requestAnimationFrame(heroTick);
  }

  /* ================= arcade HUD (hero) ================= */
  var hudScore = $('#hudScore'), hudHi = $('#hudHi'), gHi = $('#gHi');
  var hi0 = Number(store.get('gzg_hiscore', 0)) || 0;
  if (hudHi) hudHi.textContent = pad(hi0, 7);
  if (gHi) gHi.textContent = pad(hi0, 6);

  if (hudScore && !reduced) {
    var t0 = performance.now();
    setInterval(function () {
      var secs = (performance.now() - t0) / 1000;
      var y = window.scrollY || 0;
      hudScore.textContent = pad(137 + secs * 11 + y * 0.7, 7);
    }, 320);
  }

  /* ================= tilt (pointer:fine) ================= */
  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches && !reduced) {
    $$('[data-tilt], .gcard').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var dx = (e.clientX - r.left) / r.width - 0.5;
        var dy = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateY(' + (dx * 5).toFixed(2) + 'deg) rotateX(' + (-dy * 5).toFixed(2) + 'deg)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ================= demo launcher ================= */
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.js-play-demo') : null;
    if (!b) return;
    var arcade = document.getElementById('arcade');
    if (arcade) arcade.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    if (window.GZGame) {
      setTimeout(function () { window.GZGame.start(); }, reduced ? 60 : 750);
    }
  });

  /* ================= konami code ================= */
  var konamiSeq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var konamiPos = 0;
  window.addEventListener('keydown', function (e) {
    var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === konamiSeq[konamiPos]) {
      konamiPos++;
      if (konamiPos === konamiSeq.length) {
        konamiPos = 0;
        if (achieve('konami')) {
          document.body.classList.add('rainbow');
          if (window.GZAudio) window.GZAudio.coin();
          setTimeout(function () { document.body.classList.remove('rainbow'); }, 9000);
        }
      }
    } else {
      konamiPos = (k === konamiSeq[0]) ? 1 : 0;
    }
  });

  /* ================= afk ================= */
  setTimeout(function () { achieve('afk'); }, 60000);

  /* ================= join form ================= */
  var joinForm = $('#joinForm'), emailInput = $('#emailInput'), joinMsg = $('#joinMsg');
  if (joinForm) {
    joinForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (emailInput.value || '').trim();
      var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!ok) {
        joinMsg.className = 'join__msg err';
        joinMsg.textContent = 'ENTER A REAL EMAIL, PLAYER.';
        if (window.GZAudio) window.GZAudio.back();
        emailInput.focus();
        return;
      }
      /* WIRE YOUR ENDPOINT HERE — forward `email` to Mailchimp/Buttondown/your API.
         For now the address is kept locally so the demo stays a demo. */
      var list = store.get('gzg_players', []) || [];
      if (list.indexOf(email) === -1) list.push(email);
      store.set('gzg_players', list);
      joinMsg.className = 'join__msg';
      joinMsg.textContent = 'SIGNAL RECEIVED \u2014 WELCOME TO THE PARTY, PLAYER ' + (list.length) + '.';
      if (window.GZAudio) window.GZAudio.coin();
      achieve('recruit');
      joinForm.reset();
    });
  }

  /* ================= socials (placeholders) ================= */
  $$('.social-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      toast({
        type: 'info', icon: '\uD83D\uDCE1', title: 'COMMS OFFLINE',
        desc: (b.getAttribute('data-net') || 'That') + ' channel is still being set up. Check back soon.'
      });
      if (window.GZAudio) window.GZAudio.back();
    });
  });

  /* ================= public API for game.js ================= */
  window.GZ = {
    toast: toast,
    achieve: achieve,
    store: store,
    pad: pad,
    isBooted: function () { return booted; }
  };

  window.GZGameHooks = {
    firstPlay: function () { achieve('ace'); },
    wave: function (w) { if (w >= 3) achieve('wave'); },
    gameOver: function (score, hi, isNew) {
      store.set('gzg_hiscore', hi);
      var el = $('#hudHi');
      if (el) el.textContent = pad(hi, 7);
      if (score >= 300) achieve('sharp');
      if (isNew) toast({ type: 'level', icon: '\uD83D\uDD25', title: 'NEW HIGH SCORE', desc: pad(score, 6) + ' points. The board remembers.' });
    }
  };

  onScroll();
})();