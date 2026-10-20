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
   * Section titles: split into letters, spring them in when scrolled to
   * ==================================================================== */
  var titles = [];

  function splitTitle(el) {
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) return;
    el.setAttribute('aria-label', text);
    el.textContent = '';
    var idx = 0;
    text.split(' ').forEach(function (word, w, words) {
      var wordEl = document.createElement('span');
      wordEl.className = 'sg-word';
      wordEl.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach(function (ch) {
        var c = document.createElement('span');
        c.className = 'sg-ch';
        c.textContent = ch;
        c.style.transitionDelay = Math.min(idx * 38, 700) + 'ms';
        idx++;
        wordEl.appendChild(c);
      });
      el.appendChild(wordEl);
      if (w < words.length - 1) {
        el.appendChild(document.createTextNode(' '));
        idx++;
      }
    });
    el.classList.add('sg-split');
    titles.push(el);
  }

  function revealTitles() {
    var vh = window.innerHeight;
    titles = titles.filter(function (el) {
      var r = el.getBoundingClientRect();
      // Also catches titles already scrolled past (page reloaded mid-way).
      if (r.top < vh * 0.88) {
        el.classList.add('is-in');
        return false;
      }
      return true;
    });
  }

  if (!reduceMotion) {
    Array.prototype.forEach.call(document.querySelectorAll('.section-title, [data-sg-title]'), splitTitle);
    // Let the browser paint the hidden state before the first reveal check,
    // otherwise a title that is already in view would never show the animation.
    requestAnimationFrame(function () { requestAnimationFrame(revealTitles); });
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
    if (titles.length) revealTitles();
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
