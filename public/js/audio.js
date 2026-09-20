'use strict';

/**
 * GZAudio — zero-asset chiptune synthesizer built on Web Audio.
 * Every sound on this site is generated live. No audio files.
 */
window.GZAudio = (function () {
  var ctx = null;
  var master = null;
  var enabled = true;
  var VOL = 0.16;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        ctx = new AC();
      } catch (e) {
        return false;
      }
      master = ctx.createGain();
      master.gain.value = enabled ? VOL : 0;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
    return true;
  }

  function unlock() { ensure(); }

  function setEnabled(v) {
    enabled = !!v;
    if (master && ctx) {
      try { master.gain.setTargetAtTime(enabled ? VOL : 0, ctx.currentTime, 0.01); } catch (e) { /* ignore */ }
    }
  }

  function toggle() { setEnabled(!enabled); return enabled; }
  function isEnabled() { return enabled; }

  function tone(o) {
    if (!enabled || !ensure()) return;
    try {
      var t = ctx.currentTime + (o.delay || 0);
      var dur = o.dur || 0.1;
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.freq, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.5, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t); osc.stop(t + dur + 0.03);
    } catch (e) { /* audio must never break the game */ }
  }

  function noise(o) {
    if (!enabled || !ensure()) return;
    try {
      var dur = o.dur || 0.3;
      var t = ctx.currentTime + (o.delay || 0);
      var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      var i;
      for (i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      var filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(o.from || 1800, t);
      filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.to || 120), t + dur);
      var g = ctx.createGain();
      g.gain.setValueAtTime(o.vol || 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt); filt.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.03);
    } catch (e) { /* ignore */ }
  }

  return {
    unlock: unlock,
    setEnabled: setEnabled,
    toggle: toggle,
    isEnabled: isEnabled,

    /* ---- site sfx ---- */
    boot: function () {
      tone({ freq: 220, to: 440, dur: 0.12, vol: 0.35 });
      tone({ freq: 330, to: 660, dur: 0.12, delay: 0.12, vol: 0.35 });
      tone({ freq: 660, to: 990, dur: 0.24, delay: 0.24, vol: 0.4 });
    },
    click: function () { tone({ freq: 760, to: 1320, dur: 0.07, vol: 0.32 }); },
    hover: function () { tone({ freq: 1250, dur: 0.03, vol: 0.07, type: 'triangle' }); },
    back: function () { tone({ freq: 520, to: 300, dur: 0.08, vol: 0.28 }); },
    coin: function () {
      tone({ freq: 988, dur: 0.07, vol: 0.32 });
      tone({ freq: 1319, dur: 0.22, delay: 0.07, vol: 0.3 });
    },
    ach: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone({ freq: f, dur: 0.14, delay: i * 0.09, vol: 0.28 }); });
    },
    level: function () {
      [392, 523, 659, 880].forEach(function (f, i) { tone({ freq: f, dur: 0.12, delay: i * 0.07, vol: 0.26, type: 'triangle' }); });
    },

    /* ---- game sfx ---- */
    shoot: function () { tone({ freq: 900, to: 320, dur: 0.055, vol: 0.10, type: 'sawtooth' }); },
    boom: function () { noise({ dur: 0.3, vol: 0.5, from: 1500, to: 90 }); },
    boomBig: function () {
      noise({ dur: 0.5, vol: 0.6, from: 900, to: 60 });
      tone({ freq: 160, to: 50, dur: 0.4, vol: 0.3, type: 'sawtooth' });
    },
    hit: function () {
      tone({ freq: 180, to: 60, dur: 0.3, vol: 0.45, type: 'sawtooth' });
      noise({ dur: 0.25, vol: 0.4, from: 700, to: 80 });
    },
    power: function () {
      [660, 880, 1320].forEach(function (f, i) { tone({ freq: f, dur: 0.1, delay: i * 0.06, vol: 0.3 }); });
    },
    wave: function () {
      tone({ freq: 440, to: 880, dur: 0.18, vol: 0.32 });
      tone({ freq: 880, dur: 0.14, delay: 0.18, vol: 0.28 });
    },
    over: function () {
      [523, 392, 330, 262].forEach(function (f, i) { tone({ freq: f, dur: 0.28, delay: i * 0.16, vol: 0.3, type: 'triangle' }); });
    }
  };
})();