/*
 * Scroll guide - two small things that tell visitors where they are on the page.
 *
 * 1. A ruler on the edge of the screen: a tick for every 1% of the page, moving
 *    with the scroll, with a marker (and a % tag) always on the tick that matches
 *    your position. Visitors couldn't tell where the page ends - now it's obvious.
 * 2. Section titles that "jump in": when you scroll to a new section, its title
 *    letters spring up from below into place, one after another.
 *
 * Technique inspired by getartcraft.com; written from scratch for this site
 * (RTL Hebrew, phone layout, no dependencies).
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.querySelector('nav');

  /* ====================================================================
   * Section titles: each letter flies in from the bottom corner of the screen,
   * up along the edge and curving into its place in the heading. The flight is
   * tied to the scroll position, so it plays forward and backward as you scroll.
   * ==================================================================== */
  var titles = [];
  var titleVersion = 0;
  var INTRO_MS = 1100;   // titles already on screen at load fly in once, on a timer
  var STAGGER = 0.38;    // how far apart the letters start (share of the flight)

  function splitTitle(el) {
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    var letters = [];
    text.split(' ').forEach(function (word, w, words) {
      var wordEl = document.createElement('span');
      wordEl.className = 'sg-word';
      wordEl.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach(function (ch) {
        var c = document.createElement('span');
        c.className = 'sg-ch';
        c.textContent = ch;
        wordEl.appendChild(c);
        letters.push(c);
      });
      el.appendChild(wordEl);
      if (w < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.remove('reveal'); // the letters do the revealing; a fade on top would fight them
    el.classList.add('sg-split');
    titles.push({ el: el, letters: letters, cx: [], cy: [], docTop: 0, lastP: -1, version: -1, initial: false, locked: false });
  }

  if (!reduceMotion) {
    Array.prototype.forEach.call(document.querySelectorAll('.section-title, [data-sg-title]'), splitTitle);
  }

  // Where every letter sits when it is at rest (document coordinates).
  function measureTitles() {
    var sy = window.pageYOffset, sx = window.pageXOffset;
    titles.forEach(function (t) {
      t.letters.forEach(function (l) { l.style.transform = 'none'; });
      var r = t.el.getBoundingClientRect();
      t.docTop = r.top + sy;
      t.letters.forEach(function (l, i) {
        var lr = l.getBoundingClientRect();
        t.cx[i] = lr.left + lr.width / 2 + sx;
        t.cy[i] = lr.top + lr.height / 2 + sy;
      });
    });
    titleVersion++;
  }

  var introStart = 0, introDone = false;
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function bez(p0, c, p1, t) { var u = 1 - t; return u * u * p0 + 2 * u * t * c + t * t * p1; }

  function flightProgress(t, y, now) {
    if (t.locked) return 1;
    var start = vh - 24, end = vh * 0.42;
    var p = clamp((start - (t.docTop - y)) / (start - end), 0, 1);
    if (t.initial) {
      // Already in view when the page opened: fly in once on a timer, then stay put.
      p = clamp((now - introStart) / INTRO_MS, 0, 1);
      if (p >= 1) t.locked = true;
    }
    return p;
  }

  function placeTitle(t, p) {
    var n = t.letters.length;
    var dockY = vh - 26;
    var laneX = vw - W / 2;
    var dockX = vw - W - 14;
    var sy = window.pageYOffset, sx = window.pageXOffset;
    for (var k = 0; k < n; k++) {
      var l = t.letters[k];
      var d = n > 1 ? STAGGER * (k / (n - 1)) : 0;
      var raw = clamp((p - d) / (1 - STAGGER), 0, 1);
      if (raw >= 1) { l.style.transform = ''; l.style.opacity = ''; continue; }
      var u = easeInOut(raw);
      var hx = t.cx[k] - sx, hy = t.cy[k] - sy;
      // Start in a small row at the bottom corner, climb the edge, curve into place.
      var x = bez(dockX - k * 5, laneX, hx, u);
      var yy = bez(dockY, hy, hy, u);
      var rot = lerp(-90, 0, u);
      var sc = lerp(0.5, 1, u);
      l.style.transform = 'translate3d(' + (x - hx).toFixed(1) + 'px,' + (yy - hy).toFixed(1) + 'px,0) rotate(' + rot.toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
      l.style.opacity = clamp(raw * 6, 0, 1).toFixed(2);
    }
  }

  function updateTitles(y, now) {
    var animating = false;
    titles.forEach(function (t) {
      var p = flightProgress(t, y, now);
      var moving = t.initial && !t.locked;
      if (moving) animating = true;
      if (p === t.lastP && t.version === titleVersion) return;
      t.lastP = p;
      t.version = titleVersion;
      var flying = p > 0 && p < 1;
      t.el.classList.toggle('sg-flying', flying);
      t.el.classList.toggle('is-in', p >= 0.97);
      if (p <= 0) {
        // Waiting below the fold: letters are parked and invisible.
        t.letters.forEach(function (l) { l.style.opacity = '0'; l.style.transform = ''; });
      } else {
        placeTitle(t, p);
      }
    });
    return animating;
  }

  /* ====================================================================
   * Ruler
   * ==================================================================== */
  function hexToRgb(hex, fallback) {
    var m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return fallback;
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  var cs = getComputedStyle(root);
  var ACCENT = hexToRgb(cs.getPropertyValue('--accent'), [30, 58, 127]);
  var INK = hexToRgb(cs.getPropertyValue('--text'), [26, 39, 68]);
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  function make(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  var layer = make('div', 'sg-layer');
  layer.setAttribute('aria-hidden', 'true'); // purely visual - native scrolling already works for everyone
  var railBg = make('div', 'sg-rail-bg');
  var rail = make('div', 'sg-rail');
  var canvas = make('canvas');
  rail.appendChild(canvas);
  var chip = make('div', 'sg-chip');
  var hoverChip = make('div', 'sg-chip sg-chip-hover');
  layer.appendChild(railBg);
  layer.appendChild(rail);
  layer.appendChild(chip);
  layer.appendChild(hoverChip);
  document.body.appendChild(layer);

  var ctx = canvas.getContext('2d');
  var vw = 0, vh = 0, docH = 1, maxScroll = 1, navH = 58, railH = 0, dpr = 1;
  var wide = false, W = 30;
  var measuredOnce = false;
  var hoverY = null, dragging = false;
  var raf = 0, idleTimer = 0;
  var TOP_PAD = 14, BOT_PAD = 14;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }

  function layout() {
    vw = root.clientWidth;
    vh = window.innerHeight;
    docH = Math.max(root.scrollHeight, 1);
    maxScroll = Math.max(1, docH - vh);
    wide = vw >= 900;
    W = wide ? 52 : 30;
    navH = nav ? Math.round(nav.getBoundingClientRect().height) : 58;
    railH = Math.max(0, vh - navH);

    root.style.setProperty('--sg-w', W + 'px');
    root.style.setProperty('--sg-top', navH + 'px');

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(W * dpr), ch = Math.round(railH * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = W + 'px';
      canvas.style.height = railH + 'px';
    }
    if (titles.length) {
      var first = !measuredOnce;
      measureTitles();
      if (first) {
        measuredOnce = true;
        introStart = performance.now() + 150;
        var y0 = window.pageYOffset;
        if (y0 < 5) titles.forEach(function (t) { t.initial = (t.docTop - y0) < vh - 24; });
      }
    }
    schedule();
  }

  function markerAt(s) { return TOP_PAD + s * (railH - TOP_PAD - BOT_PAD); }
  // Tick p sits at markerAt(s) + (p - s) * docH, so the tick under the marker is
  // always the one that equals your scroll position.
  function pctAt(localY, s) { return clamp(s + (localY - markerAt(s)) / docH, 0, 1); }

  function drawRuler(s) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, railH);
    var markerY = markerAt(s);
    var pMin = s - markerY / docH;
    var pMax = s + (railH - markerY) / docH;
    // One tick per 1% of the page, subdivided when the page is tall enough that
    // whole percents would sit more than ~40px apart (keeps the ruler dense).
    var sub = Math.max(1, Math.round(docH / 100 / 38));
    var j0 = Math.max(0, Math.ceil(pMin * 100 * sub - 1e-6));
    var j1 = Math.min(100 * sub, Math.floor(pMax * 100 * sub + 1e-6));
    var tickLane = wide ? 26 : 14;
    var longLen = wide ? 16 : 11;
    var shortLen = wide ? 9 : 7;

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '600 9px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

    for (var j = j0; j <= j1; j++) {
      var p = j / (100 * sub);
      var yy = markerY + (p - s) * docH;
      var whole = j % sub === 0;
      var pct = j / sub;
      var isLong = whole && pct % 5 === 0;
      var len = isLong ? longLen : whole ? shortLen : Math.round(shortLen * 0.55);
      if (hoverY !== null) {
        var d = (yy - hoverY) / 48;
        len += 10 * Math.exp(-d * d);
      }
      var passed = p <= s + 1e-6;
      var a = isLong ? 0.95 : whole ? 0.7 : 0.45;
      ctx.fillStyle = passed ? rgba(ACCENT, a) : rgba(INK, a * 0.75);
      ctx.fillRect(W - len, Math.round(yy) - 0.5, len, 1);
      if (wide && isLong) {
        ctx.fillStyle = passed ? rgba(ACCENT, 0.85) : rgba(INK, 0.55);
        ctx.fillText(String(pct), W - Math.max(len, longLen, pct === 0 || pct === 100 ? tickLane : 0) - 4, yy);
      }
    }

    // Start and end of the page get a heavier tick - the end is what visitors
    // were missing, so make it unmistakable.
    [0, 1].forEach(function (p) {
      var yy = markerY + (p - s) * docH;
      if (yy < -2 || yy > railH + 2) return;
      ctx.fillStyle = p <= s + 1e-6 ? rgba(ACCENT, 1) : rgba(INK, 0.85);
      ctx.fillRect(W - tickLane, Math.round(yy) - 1, tickLane, 3);
    });

    // Marker: where you are right now.
    ctx.fillStyle = rgba(ACCENT, 1);
    ctx.fillRect(W - tickLane - 2, Math.round(markerY) - 1.5, tickLane + 2, 3);

    if (hoverY !== null) {
      ctx.fillStyle = rgba(ACCENT, 0.55);
      ctx.fillRect(W - tickLane - 6, Math.round(hoverY) - 0.5, tickLane + 6, 1);
    }
  }

  function updateChips(s) {
    var pct = Math.round(s * 100);
    if (chip.textContent !== pct + '%') chip.textContent = pct + '%';
    chip.style.transform = 'translate3d(0,' + (navH + markerAt(s)).toFixed(1) + 'px,0) translateY(-50%)';
    if (hoverY !== null) {
      hoverChip.textContent = Math.round(pctAt(hoverY, s) * 100) + '%';
      hoverChip.style.transform = 'translate3d(0,' + (navH + hoverY).toFixed(1) + 'px,0) translateY(-50%)';
      hoverChip.style.opacity = '1';
    } else {
      hoverChip.style.opacity = '0';
    }
  }

  function render() {
    raf = 0;
    var s = clamp(window.pageYOffset / maxScroll, 0, 1);
    drawRuler(s);
    updateChips(s);
    if (titles.length && updateTitles(window.pageYOffset, performance.now())) schedule();
  }

  function onScroll() {
    chip.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { chip.classList.add('is-idle'); }, 1800);
    schedule();
  }

  /* Mouse only - on touch the strip ignores input and the page scrolls as usual. */
  function localY(e) { return e.clientY - navH; }
  function scrubTo(e, smooth) {
    var s = clamp(window.pageYOffset / maxScroll, 0, 1);
    window.scrollTo({ top: pctAt(localY(e), s) * maxScroll, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }
  rail.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    hoverY = clamp(localY(e), 0, railH);
    if (dragging) scrubTo(e, false);
    schedule();
  });
  rail.addEventListener('pointerleave', function () {
    if (dragging) return;
    hoverY = null;
    schedule();
  });
  rail.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.button !== 0) return;
    dragging = true;
    rail.setPointerCapture(e.pointerId);
    scrubTo(e, true);
    e.preventDefault();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    if (e && e.pointerId !== undefined && rail.hasPointerCapture(e.pointerId)) rail.releasePointerCapture(e.pointerId);
    if (e && e.type === 'pointerup' && !rail.matches(':hover')) hoverY = null;
    schedule();
  }
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { requestAnimationFrame(layout); });
  window.addEventListener('load', layout);
  // The page grows as lazy images load and as FAQ items open - keep the ruler honest.
  if ('ResizeObserver' in window) {
    var lastH = 0;
    new ResizeObserver(function () {
      var h = root.scrollHeight;
      if (h !== lastH) { lastH = h; layout(); }
    }).observe(document.body);
  }

  layout();
  chip.classList.add('is-idle');
  requestAnimationFrame(function () { root.classList.add('sg-ready'); });
})();
