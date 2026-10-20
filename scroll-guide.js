/*
 * Scroll guide - a page-position ruler plus section names that travel along it.
 *
 * Why it exists: visitors couldn't tell where the page ends. The ruler shows a
 * tick for every 1% of the page, moving with the scroll, with a marker that
 * always sits on the tick matching your current position. The section names
 * live in three places: a small stack at the bottom (still ahead of you), one
 * large vertical title pinned in the rail (where you are), and a small stack
 * at the top (already behind you). When a new section arrives its name rides
 * up the rail, letter by letter, while the previous one folds into the top
 * stack.
 *
 * Technique inspired by the page-position ruler on getartcraft.com; written
 * from scratch for this site (RTL Hebrew, phone layout, no dependencies).
 *
 * Wide screens (>= 1280px): ruler + stacks + pinned title.
 * Everything smaller:       thin ruler + one title riding the rail.
 */
(function () {
  'use strict';

  var SECTIONS = [
    ['how-it-works', 'איך מתחילים'],
    ['testimonials', 'חוות דעת'],
    ['subjects', 'מקצועות'],
    ['preview', 'חומרי לימוד'],
    ['pricing', 'מחירים'],
    ['about', 'אודות'],
    ['faq', 'שאלות נפוצות'],
    ['contact-form', 'השאירו פרטים']
  ];

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = document.querySelector('nav');

  var secs = [];
  SECTIONS.forEach(function (def) {
    var el = document.getElementById(def[0]);
    if (el) secs.push({ id: def[0], label: def[1], el: el, letters: [], cum: [], len: 0, top: 0, lastT: -1 });
  });
  if (!secs.length) return;
  var n = secs.length;

  /* ---------- colours (read from the site's own tokens) ---------- */
  function hexToRgb(hex, fallback) {
    var m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return fallback;
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  var cs = getComputedStyle(root);
  var ACCENT = hexToRgb(cs.getPropertyValue('--accent'), [30, 58, 127]);
  var MUTED = hexToRgb(cs.getPropertyValue('--muted'), [90, 104, 130]);
  var INK = hexToRgb(cs.getPropertyValue('--text'), [26, 39, 68]);
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ---------- DOM ---------- */
  function make(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  var layer = make('div', 'sg-layer');
  layer.setAttribute('aria-hidden', 'true'); // purely visual - native scrolling already works for everyone
  var railBg = make('div', 'sg-rail-bg');
  var fadeTop = make('div', 'sg-fade sg-fade-top');
  var fadeBottom = make('div', 'sg-fade sg-fade-bottom');
  var titlesWrap = make('div', 'sg-titles');
  var rail = make('div', 'sg-rail');
  var canvas = make('canvas');
  rail.appendChild(canvas);
  var chip = make('div', 'sg-chip');
  var hoverChip = make('div', 'sg-chip sg-chip-hover');

  secs.forEach(function (s) {
    var a = make('a', 'sg-title');
    a.href = '#' + s.id;
    a.tabIndex = -1;
    Array.prototype.forEach.call(s.label, function (ch) {
      var sp = make('span', 'sg-l');
      sp.textContent = ch;
      a.appendChild(sp);
      s.letters.push(sp);
    });
    a.addEventListener('click', function (e) {
      e.preventDefault();
      s.el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
    titlesWrap.appendChild(a);
    s.a = a;
  });

  layer.appendChild(railBg);
  layer.appendChild(fadeTop);
  layer.appendChild(fadeBottom);
  layer.appendChild(titlesWrap);
  layer.appendChild(rail);
  layer.appendChild(chip);
  layer.appendChild(hoverChip);
  document.body.appendChild(layer);

  /* ---------- state ---------- */
  var ctx = canvas.getContext('2d');
  var vw = 0, vh = 0, docH = 1, maxScroll = 1, navH = 58, railH = 0, dpr = 1;
  var full = false, W = 30, B = 13, DOCK = 12, ROW = 18, sd = 1;
  var laneX = 0, dockRight = 0;
  var measuredB = 0;
  var layoutVersion = 0;
  var hoverY = null, dragging = false;
  var raf = 0, idleTimer = 0;
  var TOP_PAD = 14, BOT_PAD = 14, STAGGER = 0.38;

  /* ---------- helpers ---------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function bez(p0, c, p1, t) {
    var u = 1 - t;
    return u * u * p0 + 2 * u * t * c + t * t * p1;
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(render); }

  /* ---------- layout (runs on load/resize/height changes, not per scroll) ---------- */
  function measureLetters() {
    secs.forEach(function (s) {
      var cum = 0;
      s.cum = [];
      s.letters.forEach(function (l) {
        l.style.fontSize = B + 'px';
        var w = l.offsetWidth;
        s.cum.push(cum + w / 2); // distance from the word's start to this letter's centre
        cum += w;
      });
      s.len = cum;
    });
    measuredB = B;
  }

  function layout() {
    vw = root.clientWidth;
    vh = window.innerHeight;
    docH = Math.max(root.scrollHeight, 1);
    maxScroll = Math.max(1, docH - vh);
    full = vw >= 1280;
    W = full ? 64 : 30;
    B = full ? 24 : 13;
    sd = DOCK / B;
    navH = nav ? Math.round(nav.getBoundingClientRect().height) : 58;
    railH = Math.max(0, vh - navH);
    laneX = vw - (full ? 49 : 21);
    dockRight = vw - W - 10;

    root.style.setProperty('--sg-w', W + 'px');
    root.style.setProperty('--sg-top', navH + 'px');
    layer.classList.toggle('sg-full', full);
    layer.classList.toggle('sg-compact', !full);

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = Math.round(W * dpr), ch = Math.round(railH * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = W + 'px';
      canvas.style.height = railH + 'px';
    }

    var y = window.pageYOffset;
    secs.forEach(function (s) { s.top = s.el.getBoundingClientRect().top + y; });
    if (measuredB !== B) measureLetters();

    layoutVersion++;
    schedule();
  }

  /* ---------- section progress ---------- */
  // 0..1 as the section's top travels from the bottom of the screen to just under the nav.
  function arrival(i, y) {
    var pinAt = navH + 22;
    if (i === 0) {
      // Nothing is below the hero's fold at load, so the first title stays parked
      // until you actually start scrolling toward its section.
      return clamp(y / Math.max(1, secs[0].top - pinAt), 0, 1);
    }
    var topY = secs[i].top - y;
    var start = vh * 0.9;
    return clamp((start - topY) / Math.max(1, start - pinAt), 0, 1);
  }

  // 0 = waiting in the bottom stack, 1 = pinned in the rail, 2 = folded into the top stack.
  function journey(i, y) {
    var t = arrival(i, y) + (i < n - 1 ? arrival(i + 1, y) : 0);
    t = clamp(t, 0, 2);
    if (reduceMotion) t = t < 0.5 ? 0 : t < 1.5 ? 1 : 2;
    return t;
  }

  function stage(tp, k, count) {
    var d = count > 1 ? STAGGER * (k / (count - 1)) : 0;
    return ease(clamp((tp - d) / (1 - STAGGER), 0, 1));
  }

  /* ---------- section titles ---------- */
  function placeTitle(i, s, T) {
    var count = s.letters.length;
    var ROW_TOP = navH + 22;
    var pinTop = full ? ROW_TOP + 4 + i * ROW : navH + 14;
    var topRowY = ROW_TOP + i * ROW;
    var botRowY = vh - 28 - (n - 1 - i) * ROW;
    var arriving = T <= 1;
    var tp = arriving ? T : T - 1;

    for (var k = 0; k < count; k++) {
      var u = stage(tp, k, count);
      var x, yy, rot, sc, col, op = 1;
      var pinY = pinTop + s.cum[k];

      if (full) {
        var dockX = dockRight - sd * s.cum[k];
        if (arriving) {
          x = bez(dockX, laneX, laneX, u);
          yy = bez(botRowY, botRowY, pinY, u);
          rot = lerp(0, -90, u);
          sc = lerp(sd, 1, u);
          col = u;
        } else {
          x = bez(laneX, laneX, dockX, u);
          yy = bez(pinY, topRowY, topRowY, u);
          rot = lerp(-90, 0, u);
          sc = lerp(1, sd, u);
          col = 1 - u;
        }
      } else {
        // Phone / narrow: no stacks. The word rises from below the screen into the
        // rail, then slides up under the nav bar when the next section takes over.
        var below = vh + 16 + s.cum[k];
        var above = pinY - (pinTop - navH + s.len + 24);
        x = laneX;
        rot = -90;
        sc = 1;
        col = 1;
        yy = arriving ? lerp(below, pinY, u) : lerp(pinY, above, u);
        op = arriving ? clamp(u * 6, 0, 1) : clamp((1 - u) * 3, 0, 1);
      }

      var l = s.letters[k];
      l.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px,0) translate(-50%,-50%) rotate(' + rot.toFixed(1) + 'deg) scale(' + sc.toFixed(3) + ')';
      l.style.opacity = op.toFixed(2);
      l.style.color = 'rgb(' + Math.round(lerp(MUTED[0], ACCENT[0], col)) + ',' + Math.round(lerp(MUTED[1], ACCENT[1], col)) + ',' + Math.round(lerp(MUTED[2], ACCENT[2], col)) + ')';
    }
  }

  function updateTitles(y) {
    var past = 0, ahead = 0;
    secs.forEach(function (s, i) {
      var T = journey(i, y);
      if (T > 0.5) past++;
      if (T < 1) ahead++;
      var changed = Math.abs(T - s.lastT) > 0.0005 || s.lastVersion !== layoutVersion;
      if (!changed) return;
      s.lastT = T;
      s.lastVersion = layoutVersion;
      var atRest = full && (T <= 0.01 || T >= 1.99);
      s.a.classList.toggle('sg-rest', atRest);
      // Phone layout keeps only the title that is on its way in, parked or on its way out.
      s.a.style.visibility = !full && (T <= 0.01 || T >= 1.99) ? 'hidden' : '';
      placeTitle(i, s, T);
    });
    fadeTop.style.opacity = full && past ? '1' : '0';
    fadeBottom.style.opacity = full && ahead ? '1' : '0';
  }

  /* ---------- ruler ---------- */
  function markerAt(s) { return TOP_PAD + s * (railH - TOP_PAD - BOT_PAD); }
  function pctAt(localY, s) {
    return clamp(s + (localY - markerAt(s)) / docH, 0, 1);
  }

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
    var tickLane = full ? 26 : 14;
    var longLen = full ? 16 : 11;
    var shortLen = full ? 9 : 7;

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
      if (full && isLong) {
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
      var hp = Math.round(pctAt(hoverY, s) * 100);
      hoverChip.textContent = hp + '%';
      hoverChip.style.transform = 'translate3d(0,' + (navH + hoverY).toFixed(1) + 'px,0) translateY(-50%)';
      hoverChip.style.opacity = '1';
    } else {
      hoverChip.style.opacity = '0';
    }
  }

  /* ---------- frame ---------- */
  function render() {
    raf = 0;
    var y = window.pageYOffset;
    var s = clamp(y / maxScroll, 0, 1);
    drawRuler(s);
    updateChips(s);
    updateTitles(y);
  }

  function onScroll() {
    chip.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { chip.classList.add('is-idle'); }, 1800);
    schedule();
  }

  /* ---------- ruler interaction (mouse only - touch keeps scrolling natively) ---------- */
  function localY(e) { return e.clientY - navH; }
  function scrubTo(e, smooth) {
    var s = clamp(window.pageYOffset / maxScroll, 0, 1);
    var p = pctAt(localY(e), s);
    window.scrollTo({ top: p * maxScroll, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
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

  /* ---------- wiring ---------- */
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { requestAnimationFrame(layout); });
  window.addEventListener('load', layout);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { measuredB = 0; layout(); });
  }
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
