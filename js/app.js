(() => {
  'use strict';

  /* ================== Configuración ================== */
  const STORAGE_KEY = 'ruleta-premios:v1';
  const MAX_PRIZES = 200;
  const PALETTE = [
    '#FF6B6B', '#FFB547', '#4ECDC4', '#5B8DEF', '#A66CFF',
    '#FF8FB1', '#2EC4B6', '#FFD166', '#7BD389', '#F78C6B',
  ];
  const PLACEHOLDER_COLORS = ['#3a2d7a', '#43358a'];
  const DURATIONS = {
    corto: { ms: 4200, turns: 5 },
    normal: { ms: 6500, turns: 8 },
    largo: { ms: 9500, turns: 12 },
  };
  const DEFAULT_SETTINGS = {
    title: 'Ruleta de Premios',
    sound: true,
    volume: 0.7,
    autoRemove: true,
    confetti: true,
    duration: 'normal',
  };
  const SAMPLE = [
    ['Tarjeta de regalo $500', 1],
    ['Audífonos Bluetooth', 1],
    ['Taza personalizada', 3],
    ['Día libre', 1],
    ['Kit de café', 2],
    ['Sudadera oficial', 2],
    ['Bocina portátil', 1],
    ['Termo térmico', 2],
  ];

  /* ================== Utilidades ================== */
  const $ = (sel, el = document) => el.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const mod = (n, m) => ((n % m) + m) % m;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function randomInt(n) {
    if (window.crypto?.getRandomValues) {
      const max = Math.floor(0xffffffff / n) * n;
      const buf = new Uint32Array(1);
      do { window.crypto.getRandomValues(buf); } while (buf[0] >= max);
      return buf[0] % n;
    }
    return Math.floor(Math.random() * n);
  }

  function colorAt(i, n) {
    const L = PALETTE.length;
    // Evita que el último gajo tenga el mismo color que el primero
    if (n > 1 && i === n - 1 && i % L === 0) return PALETTE[Math.floor(L / 2)];
    return PALETTE[i % L];
  }

  function isLight(hex) {
    const v = parseInt(hex.slice(1), 16);
    const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 186;
  }

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const fmtDate = (ts) => new Date(ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  /* ================== Estado ================== */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return {
          settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
          prizes: Array.isArray(s.prizes)
            ? s.prizes.filter((p) => p && typeof p.name === 'string' && p.qty > 0)
            : [],
          history: Array.isArray(s.history) ? s.history : [],
          drawCount: Number(s.drawCount) || 0,
        };
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return {
      settings: { ...DEFAULT_SETTINGS },
      prizes: SAMPLE.map(([name, qty]) => ({ id: uid(), name, qty })),
      history: [],
      drawCount: 0,
    };
  }

  let state = load();
  const save = () => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* noop */ } };

  let rotation = 0;
  let spinning = false;
  let pendingRemoval = null;
  let lastWinner = null;

  /* ================== Elementos ================== */
  const el = {
    title: $('#eventTitle'),
    wheel: $('#wheel'),
    wrap: $('#wheelWrap'),
    rotor: $('#rotor'),
    lights: $('#lights'),
    pointer: $('#pointer'),
    spinBtn: $('#spinBtn'),
    hint: $('#stageHint'),
    lastWin: $('#lastWin'),
    prizeCount: $('#prizeCount'),
    historyCount: $('#historyCount'),
    addForm: $('#addForm'),
    prizeName: $('#prizeName'),
    prizeQty: $('#prizeQty'),
    prizeList: $('#prizeList'),
    prizesEmpty: $('#prizesEmpty'),
    listSummary: $('#listSummary'),
    historyList: $('#historyList'),
    historyEmpty: $('#historyEmpty'),
    historySummary: $('#historySummary'),
    dropzone: $('#dropzone'),
    fileInput: $('#fileInput'),
    winModal: $('#winModal'),
    winTitle: $('#winTitle'),
    winNumber: $('#winNumber'),
    winSub: $('#winSub'),
    backToWheel: $('#backToWheel'),
    confirmModal: $('#confirmModal'),
    soundQuick: $('#soundQuick'),
  };

  /* ================== Ruleta (canvas) ================== */
  function fitText(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, Math.max(1, lo)).trimEnd() + '…';
  }

  function drawWheel() {
    const canvas = el.wheel;
    const size = canvas.clientWidth;
    if (!size) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const c = size / 2;
    const r = c;
    const prizes = state.prizes;
    const empty = prizes.length === 0;
    const n = empty ? 12 : prizes.length;
    const seg = (Math.PI * 2) / n;
    const start = -Math.PI / 2;

    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, start + i * seg, start + (i + 1) * seg);
      ctx.closePath();
      ctx.fillStyle = empty ? PLACEHOLDER_COLORS[i % 2] : colorAt(i, n);
      ctx.fill();
    }

    // Volumen: luz al centro, sombra en el borde
    const shade = ctx.createRadialGradient(c, c, r * 0.1, c, c, r);
    shade.addColorStop(0, 'rgba(255,255,255,0.22)');
    shade.addColorStop(0.55, 'rgba(255,255,255,0)');
    shade.addColorStop(0.92, 'rgba(0,0,0,0.08)');
    shade.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();

    // Separadores
    if (n > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = Math.max(1.5, size * 0.0045);
      for (let i = 0; i < n; i++) {
        const a = start + i * seg;
        ctx.beginPath();
        ctx.moveTo(c + Math.cos(a) * r * 0.2, c + Math.sin(a) * r * 0.2);
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
        ctx.stroke();
      }
      // Remaches en el borde
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        const a = start + i * seg;
        ctx.beginPath();
        ctx.arc(c + Math.cos(a) * r * 0.955, c + Math.sin(a) * r * 0.955, Math.max(2, size * 0.008), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Textos
    if (empty) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `600 ${Math.round(size * 0.042)}px Fredoka, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Agrega premios', c, c - size * 0.2);
      ctx.fillText('para empezar ✨', c, c + size * 0.2);
      ctx.restore();
      return;
    }

    const outer = r * 0.9;
    const inner = r * 0.35;
    const maxW = outer - inner;
    const fs = clamp(Math.min(size * 0.05, r * 0.62 * seg * 0.62), 9, 30);

    for (let i = 0; i < n; i++) {
      const p = prizes[i];
      const color = colorAt(i, n);
      const dark = isLight(color);
      let label = p.name;
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate(start + (i + 0.5) * seg);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      let qtyW = 0;
      if (p.qty > 1) {
        ctx.font = `700 ${Math.round(fs * 0.7)}px "Plus Jakarta Sans", sans-serif`;
        const qtyText = `×${p.qty}`;
        qtyW = ctx.measureText(qtyText).width + fs * 0.4;
        ctx.fillStyle = dark ? 'rgba(31,27,58,0.55)' : 'rgba(255,255,255,0.75)';
        ctx.fillText(qtyText, outer, 1);
      }

      // Primero reduce la letra (hasta 60%) y solo después recorta con «…»
      const room = maxW - qtyW;
      ctx.font = `600 ${fs}px Fredoka, sans-serif`;
      const w = ctx.measureText(label).width;
      const fitFs = w > room ? Math.max(fs * 0.6, 9, fs * (room / w)) : fs;
      ctx.font = `600 ${fitFs.toFixed(1)}px Fredoka, sans-serif`;
      label = fitText(ctx, label, room);
      if (!dark) {
        ctx.shadowColor = 'rgba(0,0,0,0.28)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetY = 1;
      }
      ctx.fillStyle = dark ? '#1f1b3a' : '#ffffff';
      ctx.fillText(label, outer - qtyW, 1);
      ctx.restore();
    }
  }

  function buildLights() {
    const count = 24;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const b = document.createElement('span');
      b.className = 'bulb';
      b.style.left = `${50 + 47.1 * Math.sin(a)}%`;
      b.style.top = `${50 - 47.1 * Math.cos(a)}%`;
      b.style.setProperty('--i', i);
      frag.appendChild(b);
    }
    el.lights.appendChild(frag);
  }

  const setLights = (mode) => { el.lights.className = `lights ${mode}`; };
  const setRotation = (deg) => { el.rotor.style.transform = `rotate(${deg}deg)`; };

  function indexAt(rot, n) {
    const a = mod(360 - mod(rot, 360), 360);
    return Math.floor(a / (360 / n)) % n;
  }

  function flickPointer(strength = 1) {
    if (!el.pointer.animate) return;
    el.pointer.animate(
      [
        { transform: `translateX(-50%) rotate(${-24 * strength}deg)` },
        { transform: 'translateX(-50%) rotate(0deg)' },
      ],
      { duration: 140, easing: 'cubic-bezier(.2,.8,.4,1)' }
    );
  }

  /* ================== Giro ================== */
  function spin() {
    if (spinning) return;
    if (!el.winModal.hidden) closeWin();
    if (!state.prizes.length) {
      toast('Agrega al menos un premio para girar', 'warn');
      Sound.error();
      switchTab('prizes');
      el.prizeName.focus();
      return;
    }

    Sound.unlock();
    spinning = true;
    document.body.classList.add('is-spinning');
    el.spinBtn.disabled = true;
    setLights('spin');

    const n = state.prizes.length;
    const seg = 360 / n;
    const target = randomInt(n);
    const offset = 0.12 + Math.random() * 0.76; // no caer en la raya
    const landAt = (target + offset) * seg;
    const { ms, turns } = DURATIONS[state.settings.duration] || DURATIONS.normal;
    const startRot = rotation;
    const delta = mod((360 - landAt) - mod(startRot, 360), 360);
    const wind = 12;
    const windMs = 340;
    const from = startRot - wind;
    const endRot = startRot + turns * 360 + delta;

    const easeOut = (p) => 1 - Math.pow(1 - p, 4.2);
    const easeInOut = (p) => 0.5 - Math.cos(Math.PI * p) / 2;

    let lastIdx = indexAt(rotation, n);
    let lastTick = 0;
    let whooshed = false;
    const t0 = performance.now();

    function frame(now) {
      const t = now - t0;
      let rot;
      let done = false;
      if (t < windMs) {
        rot = startRot - wind * easeInOut(t / windMs);
      } else {
        if (!whooshed) { whooshed = true; Sound.whoosh(); }
        const p = Math.min(1, (t - windMs) / ms);
        rot = from + (endRot - from) * easeOut(p);
        done = p >= 1;
      }
      setRotation(rot);
      rotation = rot;

      const idx = indexAt(rot, n);
      if (idx !== lastIdx) {
        lastIdx = idx;
        if (now - lastTick > 32) {
          lastTick = now;
          Sound.tick();
          flickPointer(t > windMs + ms * 0.6 ? 1.2 : 0.7);
        }
      }

      if (done) finish(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function finish() {
    rotation = mod(rotation, 360);
    setRotation(rotation);
    const n = state.prizes.length;
    const idx = indexAt(rotation, n);
    const prize = state.prizes[idx];
    const color = colorAt(idx, n);

    spinning = false;
    document.body.classList.remove('is-spinning');
    el.spinBtn.disabled = false;
    setLights('win');
    setTimeout(() => { if (!spinning) setLights('idle'); }, 3200);

    state.drawCount += 1;
    const removed = !!state.settings.autoRemove;
    const entry = {
      id: uid(),
      prizeId: prize.id,
      name: prize.name,
      color,
      at: Date.now(),
      n: state.drawCount,
      removed,
      restored: false,
    };
    state.history.unshift(entry);
    if (removed) pendingRemoval = prize.id;
    lastWinner = entry;
    save();
    renderHistory(entry.id);

    Sound.win();
    celebrate(color);
    setTimeout(() => openWin(entry), 280);
  }

  function celebrate(color) {
    if (!state.settings.confetti || typeof window.confetti !== 'function') return;
    const colors = [color, '#FFC94D', '#FF6B6B', '#4ECDC4', '#A66CFF', '#5B8DEF', '#ffffff'];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const base = { colors, zIndex: 1000, disableForReducedMotion: false };

    confetti({ ...base, particleCount: reduce ? 60 : 170, spread: 100, startVelocity: 48, origin: { x: 0.5, y: 0.6 }, scalar: 1.1 });
    if (reduce) return;

    const end = Date.now() + 1700;
    (function cannons() {
      confetti({ ...base, particleCount: 4, angle: 60, spread: 58, startVelocity: 60, origin: { x: 0, y: 0.8 } });
      confetti({ ...base, particleCount: 4, angle: 120, spread: 58, startVelocity: 60, origin: { x: 1, y: 0.8 } });
      if (Date.now() < end) requestAnimationFrame(cannons);
    })();
    setTimeout(() => {
      confetti({ ...base, particleCount: 50, spread: 360, startVelocity: 26, gravity: 0.6, ticks: 260,
        shapes: ['star'], colors: ['#FFD166', '#FFC94D', '#FFFFFF'], scalar: 1.4, origin: { x: 0.5, y: 0.35 } });
    }, 420);
  }

  /* ================== Modal de premio ================== */
  function openWin(entry) {
    el.winModal.style.setProperty('--win', entry.color);
    el.winNumber.textContent = entry.n;
    el.winTitle.textContent = entry.name;

    const units = totalUnits() - (entry.removed ? 1 : 0);
    if (entry.removed) {
      el.winSub.textContent = units > 0
        ? `Se retira de la ruleta · quedan ${plural(units, 'premio', 'premios')}`
        : '¡Este era el último premio! 🎊';
    } else {
      el.winSub.textContent = 'El premio permanece en la ruleta';
    }
    el.winModal.hidden = false;
    // reinicia animaciones de la tarjeta
    const card = $('.modal-card', el.winModal);
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
    el.backToWheel.focus();

    el.lastWin.hidden = false;
    $('strong', el.lastWin).textContent = entry.name;
  }

  function closeWin() {
    if (el.winModal.hidden) return;
    el.winModal.hidden = true;
    applyPendingRemoval();
    el.spinBtn.focus({ preventScroll: true });
  }

  function applyPendingRemoval() {
    if (!pendingRemoval) return;
    const id = pendingRemoval;
    pendingRemoval = null;
    const p = state.prizes.find((x) => x.id === id);
    if (!p) return;
    p.qty -= 1;
    if (p.qty <= 0) state.prizes = state.prizes.filter((x) => x.id !== id);
    save();
    Sound.remove();
    renderPrizes();
    drawWheel();
  }

  /* ================== Premios ================== */
  const totalUnits = () => state.prizes.reduce((s, p) => s + p.qty, 0);

  function addPrizes(list, { quiet = false } = {}) {
    let added = 0, merged = 0, skipped = 0;
    for (const item of list) {
      const name = String(item.name).replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!name) continue;
      const qty = clamp(parseInt(item.qty, 10) || 1, 1, 999);
      const existing = state.prizes.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        existing.qty = clamp(existing.qty + qty, 1, 999);
        merged++;
      } else if (state.prizes.length >= MAX_PRIZES) {
        skipped++;
      } else {
        state.prizes.push({ id: uid(), name, qty });
        added++;
      }
    }
    save();
    renderPrizes();
    drawWheel();
    if (!quiet) {
      const parts = [];
      if (added) parts.push(`${plural(added, 'premio agregado', 'premios agregados')}`);
      if (merged) parts.push(`${merged} sumado${merged === 1 ? '' : 's'} a existentes`);
      if (skipped) parts.push(`${skipped} omitido${skipped === 1 ? '' : 's'} (máx. ${MAX_PRIZES})`);
      if (parts.length) toast(parts.join(' · '), skipped ? 'warn' : 'ok');
    }
    if (added || merged) Sound.add();
    return added + merged;
  }

  function renderPrizes() {
    const list = el.prizeList;
    const n = state.prizes.length;
    list.textContent = '';
    const frag = document.createDocumentFragment();
    state.prizes.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'prize-item';
      li.dataset.id = p.id;
      li.style.animationDelay = `${Math.min(i * 15, 300)}ms`;

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = colorAt(i, n);

      const name = document.createElement('input');
      name.className = 'prize-name';
      name.value = p.name;
      name.maxLength = 80;
      name.setAttribute('aria-label', 'Nombre del premio');
      name.dataset.action = 'rename';

      const stepper = document.createElement('div');
      stepper.className = 'stepper';
      stepper.innerHTML = '<button type="button" data-action="dec" aria-label="Menos">−</button><span></span><button type="button" data-action="inc" aria-label="Más">+</button>';
      stepper.querySelector('span').textContent = p.qty;

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'del';
      del.dataset.action = 'delete';
      del.setAttribute('aria-label', `Eliminar ${p.name}`);
      del.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

      li.append(dot, name, stepper, del);
      frag.appendChild(li);
    });
    list.appendChild(frag);

    el.prizesEmpty.hidden = n > 0;
    $('.list-head', $('#tab-prizes')).hidden = n === 0;
    const units = totalUnits();
    el.listSummary.textContent = `${plural(n, 'premio', 'premios')} · ${plural(units, 'unidad', 'unidades')}`;
    setBadge(el.prizeCount, units);
    el.hint.hidden = n === 0;
  }

  function setBadge(badge, value) {
    const v = String(value);
    if (badge.textContent !== v) {
      badge.textContent = v;
      badge.classList.remove('bump');
      void badge.offsetWidth;
      badge.classList.add('bump');
    }
  }

  el.addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = el.prizeName.value.trim();
    if (!name) { el.prizeName.focus(); return; }
    const count = addPrizes([{ name, qty: el.prizeQty.value }], { quiet: true });
    if (count) flashItem(name);
    el.prizeName.value = '';
    el.prizeQty.value = 1;
    el.prizeName.focus();
  });

  // Pegar una lista con varias líneas
  el.prizeName.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;
    e.preventDefault();
    const items = lines.map((line) => {
      const cells = line.split('\t');
      return { name: cells[0], qty: cells[1] };
    });
    addPrizes(items);
  });

  function flashItem(name) {
    const p = state.prizes.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (!p) return;
    const li = el.prizeList.querySelector(`[data-id="${p.id}"]`);
    if (li) { li.classList.add('flash'); li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  el.prizeList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn || spinning) return;
    const li = btn.closest('.prize-item');
    const p = state.prizes.find((x) => x.id === li.dataset.id);
    if (!p) return;
    const action = btn.dataset.action;
    if (action === 'inc') { p.qty = Math.min(999, p.qty + 1); Sound.pop(); }
    if (action === 'dec') {
      if (p.qty <= 1) return removePrize(li, p);
      p.qty -= 1; Sound.pop();
    }
    if (action === 'delete') return removePrize(li, p);
    save();
    li.querySelector('.stepper span').textContent = p.qty;
    const units = totalUnits();
    el.listSummary.textContent = `${plural(state.prizes.length, 'premio', 'premios')} · ${plural(units, 'unidad', 'unidades')}`;
    setBadge(el.prizeCount, units);
    drawWheel();
  });

  function removePrize(li, p) {
    li.classList.add('leaving');
    Sound.remove();
    setTimeout(() => {
      state.prizes = state.prizes.filter((x) => x.id !== p.id);
      save();
      renderPrizes();
      drawWheel();
    }, 220);
  }

  el.prizeList.addEventListener('change', (e) => {
    if (e.target.dataset.action !== 'rename') return;
    const li = e.target.closest('.prize-item');
    const p = state.prizes.find((x) => x.id === li.dataset.id);
    const v = e.target.value.replace(/\s+/g, ' ').trim();
    if (!p) return;
    if (!v) { e.target.value = p.name; return; }
    p.name = v;
    save();
    drawWheel();
  });
  el.prizeList.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.action === 'rename') e.target.blur();
  });

  $('#shuffleBtn').addEventListener('click', () => {
    if (spinning || state.prizes.length < 2) return;
    const a = state.prizes;
    for (let i = a.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    save();
    renderPrizes();
    drawWheel();
    Sound.whoosh();
    el.rotor.animate?.([{ transform: `rotate(${rotation}deg) scale(1)` }, { transform: `rotate(${rotation}deg) scale(.96)` }, { transform: `rotate(${rotation}deg) scale(1)` }], { duration: 380, easing: 'ease-out' });
  });

  $('#clearPrizes').addEventListener('click', async () => {
    if (spinning || !state.prizes.length) return;
    if (!(await confirmDialog('¿Vaciar la ruleta?', 'Se eliminarán todos los premios de la lista. El historial de entregados se conserva.'))) return;
    state.prizes = [];
    pendingRemoval = null;
    save();
    renderPrizes();
    drawWheel();
    toast('Ruleta vacía');
  });

  /* ================== Excel ================== */
  function parseRows(rows) {
    let startRow = 0, nameCol = 0, qtyCol = 1;
    if (rows.length) {
      const head = (rows[0] || []).map((v) => String(v).trim().toLowerCase());
      const ni = head.findIndex((h) => /premio|nombre|prize|descrip|art[ií]culo|regalo/.test(h));
      const qi = head.findIndex((h) => /cant|qty|unid|cu[aá]nt|piezas|stock/.test(h));
      if (ni >= 0 || qi >= 0) {
        startRow = 1;
        if (ni >= 0) nameCol = ni;
        qtyCol = qi >= 0 ? qi : -1;
      }
    }
    const out = [];
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r] || [];
      const name = String(row[nameCol] ?? '').trim();
      if (!name) continue;
      let qty = qtyCol >= 0 ? parseInt(row[qtyCol], 10) : 1;
      if (!Number.isFinite(qty) || qty < 1) qty = 1;
      out.push({ name, qty });
    }
    return out;
  }

  async function importFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast('Formato no soportado. Usa .xlsx, .xls o .csv', 'error');
      Sound.error();
      return;
    }
    if (!window.XLSX) {
      toast('No se pudo cargar el lector de Excel. Revisa tu conexión.', 'error');
      return;
    }
    try {
      const wb = /\.csv$/i.test(file.name)
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
      const items = parseRows(rows);
      if (!items.length) {
        toast('No encontré premios en el archivo. Revisa la plantilla.', 'warn');
        Sound.error();
        return;
      }
      switchTab('prizes');
      addPrizes(items);
    } catch (err) {
      console.error(err);
      toast('No se pudo leer el archivo', 'error');
      Sound.error();
    }
  }

  $('#pickFile').addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', () => {
    importFile(el.fileInput.files[0]);
    el.fileInput.value = '';
  });

  // Arrastrar y soltar en todo el documento
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    switchTab('prizes');
    el.dropzone.classList.add('over');
  });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) el.dropzone.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    el.dropzone.classList.remove('over');
    importFile(e.dataTransfer.files[0]);
  });

  $('#templateBtn').addEventListener('click', () => {
    if (!window.XLSX) { toast('No se pudo cargar el generador de Excel', 'error'); return; }
    const ws = XLSX.utils.aoa_to_sheet([
      ['Premio', 'Cantidad'],
      ['Tarjeta de regalo $500', 2],
      ['Audífonos Bluetooth', 1],
      ['Taza personalizada', 5],
      ['Día libre', 1],
    ]);
    ws['!cols'] = [{ wch: 36 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Premios');
    XLSX.writeFile(wb, 'plantilla-premios.xlsx');
    toast('Plantilla descargada: columna A = premio, B = cantidad');
  });

  /* ================== Historial ================== */
  function renderHistory(newId) {
    const list = el.historyList;
    list.textContent = '';
    const frag = document.createDocumentFragment();
    for (const h of state.history) {
      const li = document.createElement('li');
      li.className = 'history-item' + (h.id === newId ? ' new' : '');
      li.dataset.id = h.id;

      const num = document.createElement('span');
      num.className = 'h-num';
      num.style.background = h.color || PALETTE[0];
      num.textContent = h.n;
      if (isLight(h.color || PALETTE[0])) num.style.color = '#1f1b3a';

      const body = document.createElement('div');
      body.className = 'h-body';
      const strong = document.createElement('strong');
      strong.textContent = h.name;
      strong.title = h.name;
      const small = document.createElement('small');
      small.textContent = fmtTime(h.at);
      if (h.removed) {
        const tag = document.createElement('span');
        tag.className = 'tag' + (h.restored ? ' restored' : '');
        tag.textContent = h.restored ? 'Devuelto' : 'Retirado';
        small.appendChild(tag);
      }
      body.append(strong, small);
      li.append(num, body);

      if (h.removed && !h.restored) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn ghost sm';
        btn.dataset.action = 'restore';
        btn.textContent = 'Devolver';
        btn.title = 'Regresar este premio a la ruleta';
        li.appendChild(btn);
      }
      frag.appendChild(li);
    }
    list.appendChild(frag);

    const n = state.history.length;
    el.historyEmpty.hidden = n > 0;
    $('.list-head', $('#tab-history')).hidden = n === 0;
    const removed = state.history.filter((h) => h.removed && !h.restored).length;
    el.historySummary.textContent = `${plural(n, 'giro', 'giros')} · ${plural(removed, 'retirado', 'retirados')}`;
    setBadge(el.historyCount, n);
  }

  el.historyList.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action="restore"]');
    if (!btn || spinning) return;
    const h = state.history.find((x) => x.id === btn.closest('.history-item').dataset.id);
    if (!h || h.restored) return;
    if (pendingRemoval === h.prizeId) applyPendingRemoval();
    const p = state.prizes.find((x) => x.id === h.prizeId)
      || state.prizes.find((x) => x.name.toLowerCase() === h.name.toLowerCase());
    if (p) p.qty = Math.min(999, p.qty + 1);
    else state.prizes.push({ id: h.prizeId, name: h.name, qty: 1 });
    h.restored = true;
    save();
    renderPrizes();
    renderHistory();
    drawWheel();
    Sound.add();
    toast(`«${h.name}» regresó a la ruleta`);
  });

  $('#exportHistory').addEventListener('click', () => {
    if (!state.history.length) return;
    if (!window.XLSX) { toast('No se pudo cargar el generador de Excel', 'error'); return; }
    const rows = [...state.history].reverse().map((h) => ({
      'Giro': h.n,
      'Premio': h.name,
      'Fecha y hora': fmtDate(h.at),
      'Estado': h.removed ? (h.restored ? 'Devuelto a la ruleta' : 'Retirado') : 'Permaneció en la ruleta',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 6 }, { wch: 36 }, { wch: 20 }, { wch: 24 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entregados');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `premios-entregados-${stamp}.xlsx`);
  });

  $('#clearHistory').addEventListener('click', async () => {
    if (!state.history.length) return;
    if (!(await confirmDialog('¿Limpiar historial?', 'Se borrará la lista de entregados y el contador de giros. Los premios de la ruleta no cambian.'))) return;
    state.history = [];
    state.drawCount = 0;
    save();
    renderHistory();
    el.lastWin.hidden = true;
    toast('Historial limpio');
  });

  /* ================== Ajustes ================== */
  const opt = {
    title: $('#titleInput'),
    sound: $('#optSound'),
    volume: $('#optVolume'),
    autoRemove: $('#optAutoRemove'),
    confetti: $('#optConfetti'),
    duration: $('#optDuration'),
  };

  function applySettings() {
    const s = state.settings;
    const title = s.title?.trim() || DEFAULT_SETTINGS.title;
    el.title.textContent = title;
    document.title = title === DEFAULT_SETTINGS.title ? title : `${title} · Ruleta`;
    opt.title.value = s.title;
    opt.sound.checked = s.sound;
    opt.volume.value = Math.round(s.volume * 100);
    $('#volumeRow').classList.toggle('disabled', !s.sound);
    opt.autoRemove.checked = s.autoRemove;
    opt.confetti.checked = s.confetti;
    [...opt.duration.children].forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === s.duration)));
    el.soundQuick.setAttribute('aria-pressed', String(s.sound));
    el.soundQuick.title = s.sound ? 'Silenciar (M)' : 'Activar sonido (M)';
    Sound.setVolume(s.volume);
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    save();
    applySettings();
  }

  opt.title.addEventListener('input', () => setSetting('title', opt.title.value));
  opt.sound.addEventListener('change', () => toggleSound(opt.sound.checked));
  opt.volume.addEventListener('input', () => setSetting('volume', opt.volume.value / 100));
  opt.volume.addEventListener('change', () => Sound.pop());
  opt.autoRemove.addEventListener('change', () => {
    setSetting('autoRemove', opt.autoRemove.checked);
    Sound.pop();
    toast(opt.autoRemove.checked ? 'Los premios ganados se retirarán de la ruleta' : 'Los premios se quedarán en la ruleta');
  });
  opt.confetti.addEventListener('change', () => {
    setSetting('confetti', opt.confetti.checked);
    Sound.pop();
    if (opt.confetti.checked && window.confetti) confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 }, zIndex: 1000 });
  });
  opt.duration.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-value]');
    if (!b) return;
    setSetting('duration', b.dataset.value);
    Sound.pop();
  });

  function toggleSound(on = !state.settings.sound) {
    Sound.setEnabled(on);
    setSetting('sound', on);
    if (on) Sound.pop();
  }
  el.soundQuick.addEventListener('click', () => toggleSound());

  $('#resetAll').addEventListener('click', async () => {
    if (!(await confirmDialog('¿Restablecer todo?', 'Se borran premios, historial y ajustes, y se cargan los premios de ejemplo.'))) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    state = load();
    pendingRemoval = null;
    applySettings();
    Sound.setEnabled(state.settings.sound);
    renderPrizes();
    renderHistory();
    drawWheel();
    el.lastWin.hidden = true;
    toast('Todo listo para empezar de nuevo');
  });

  /* ================== Pestañas ================== */
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.id !== `tab-${name}`; });
  }
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) switchTab(t.dataset.tab);
  });

  /* ================== Diálogo de confirmación ================== */
  function confirmDialog(title, text) {
    return new Promise((resolve) => {
      const m = el.confirmModal;
      $('#confirmTitle').textContent = title;
      $('#confirmText').textContent = text;
      m.hidden = false;
      const ok = $('#confirmOk');
      ok.focus();
      const done = (v) => {
        m.hidden = true;
        ok.removeEventListener('click', onOk);
        m.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onOk = () => done(true);
      const onCancel = (e) => { if (e.target.closest('[data-cancel]')) done(false); };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      ok.addEventListener('click', onOk);
      m.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /* ================== Toasts ================== */
  function toast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2800);
  }

  /* ================== Presentación ================== */
  function togglePresent(force) {
    const on = force ?? !document.body.classList.contains('present');
    document.body.classList.toggle('present', on);
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!on && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    requestAnimationFrame(drawWheel);
  }
  $('#presentBtn').addEventListener('click', () => togglePresent());
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && document.body.classList.contains('present')) togglePresent(false);
  });

  /* ================== Eventos globales ================== */
  el.spinBtn.addEventListener('click', spin);
  el.winModal.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeWin(); });

  document.addEventListener('keydown', (e) => {
    const typing = e.target.matches('input, textarea, select, [contenteditable]');
    if (!el.confirmModal.hidden) return;
    if (e.key === 'Escape' && !el.winModal.hidden) { closeWin(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space' || (e.key === 'Enter' && e.target === document.body)) {
      e.preventDefault();
      if (!el.winModal.hidden) closeWin(); else spin();
    } else if (e.key === 'm' || e.key === 'M') {
      toggleSound();
    } else if (e.key === 'f' || e.key === 'F') {
      togglePresent();
    }
  });

  // Desbloquea el audio en el primer gesto del usuario
  window.addEventListener('pointerdown', () => Sound.unlock(), { once: true });

  new ResizeObserver(() => drawWheel()).observe(el.rotor);

  /* ================== Inicio ================== */
  buildLights();
  Sound.setEnabled(state.settings.sound);
  applySettings();
  renderPrizes();
  renderHistory();
  drawWheel();
  if (document.fonts?.ready) document.fonts.ready.then(drawWheel);
  if (state.history[0]) {
    el.lastWin.hidden = false;
    $('strong', el.lastWin).textContent = state.history[0].name;
  }
})();
