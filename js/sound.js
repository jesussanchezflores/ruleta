/* Sonidos sintetizados con Web Audio: no requiere archivos externos. */
window.Sound = (() => {
  let ctx = null;
  let master = null;
  let fx = null;
  let enabled = true;
  let volume = 0.7;
  let noiseBuf = null;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(comp);
    comp.connect(ctx.destination);

    // Bus de eco suave para la fanfarria y destellos
    fx = ctx.createGain();
    fx.gain.value = 0.3;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.17;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.33;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    fx.connect(delay);
    delay.connect(lp);
    lp.connect(feedback);
    feedback.connect(delay);
    lp.connect(master);
    return ctx;
  }

  const ready = () => enabled && init();

  function envelope(g, t, peak, attack, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  function tone({ freq, to, type = 'sine', at = 0, dur = 0.2, gain = 0.2, attack = 0.006, send = 0, detune = 0 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    envelope(g, t, gain, attack, dur);
    osc.connect(g);
    g.connect(master);
    if (send) {
      const s = ctx.createGain();
      s.gain.value = send;
      g.connect(s);
      s.connect(fx);
    }
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function getNoise() {
    if (!noiseBuf) {
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function noise({ at = 0, dur = 0.05, gain = 0.2, type = 'bandpass', freq = 3000, to, q = 1, attack }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    envelope(g, t, gain, attack ?? Math.min(0.004, dur / 4), dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t, Math.random() * 0.4);
    src.stop(t + dur + 0.05);
  }

  return {
    unlock() { if (enabled) init(); },
    setEnabled(v) { enabled = !!v; },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
    },

    /* Clic de la lengüeta contra los separadores */
    tick() {
      if (!ready()) return;
      noise({ dur: 0.03, gain: 0.5, freq: 2400 + Math.random() * 700, q: 2.5 });
      tone({ freq: 1500, to: 850, type: 'triangle', dur: 0.045, gain: 0.09 });
    },

    /* Arranque del giro */
    whoosh() {
      if (!ready()) return;
      noise({ dur: 0.85, gain: 0.16, freq: 380, to: 2600, q: 0.9, attack: 0.25 });
      tone({ freq: 220, to: 520, type: 'sine', dur: 0.4, gain: 0.08, attack: 0.05 });
    },

    /* Fanfarria del premio */
    win() {
      if (!ready()) return;
      // golpe grave
      tone({ freq: 170, to: 55, type: 'sine', dur: 0.35, gain: 0.45 });
      noise({ dur: 0.18, gain: 0.12, type: 'lowpass', freq: 1200 });
      // arpegio ascendente (Do mayor)
      const arp = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      arp.forEach((f, i) => {
        tone({ freq: f, type: 'triangle', at: 0.05 + i * 0.085, dur: 0.32, gain: 0.2, send: 0.5 });
        tone({ freq: f * 2, type: 'sine', at: 0.05 + i * 0.085, dur: 0.22, gain: 0.04, send: 0.6 });
      });
      // acorde final sostenido
      const chord = [523.25, 659.25, 783.99, 1046.5];
      chord.forEach((f) => {
        tone({ freq: f, type: 'triangle', at: 0.5, dur: 1.5, gain: 0.08, attack: 0.02, send: 0.4, detune: -6 });
        tone({ freq: f, type: 'sine', at: 0.5, dur: 1.6, gain: 0.07, attack: 0.02, send: 0.4, detune: 6 });
      });
      tone({ freq: 130.8, type: 'sine', at: 0.5, dur: 1.4, gain: 0.18, attack: 0.02 });
      // destellos
      for (let i = 0; i < 12; i++) {
        tone({ freq: 2200 + Math.random() * 2600, type: 'sine', at: 0.55 + i * 0.07, dur: 0.12, gain: 0.035, send: 0.9 });
      }
    },

    pop() {
      if (!ready()) return;
      tone({ freq: 520, to: 900, type: 'sine', dur: 0.09, gain: 0.14 });
    },

    add() {
      if (!ready()) return;
      tone({ freq: 660, type: 'triangle', dur: 0.1, gain: 0.1 });
      tone({ freq: 990, type: 'triangle', at: 0.07, dur: 0.14, gain: 0.1, send: 0.3 });
    },

    remove() {
      if (!ready()) return;
      tone({ freq: 620, to: 280, type: 'triangle', dur: 0.16, gain: 0.1 });
    },

    error() {
      if (!ready()) return;
      tone({ freq: 220, type: 'square', dur: 0.12, gain: 0.05 });
      tone({ freq: 180, type: 'square', at: 0.11, dur: 0.16, gain: 0.05 });
    },
  };
})();
