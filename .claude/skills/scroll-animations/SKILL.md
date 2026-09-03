---
name: scroll-animations
description: Use whenever adding scroll-triggered reveals or entrance animations to index.html on the elirangelberg.com marketing site — covers the vanilla-JS IntersectionObserver + fallback pattern already wired up, so new sections stay consistent with it instead of adding a second animation system.
---

# Scroll & entrance animations (elirangelberg.com marketing site)

This is a static site with no build step and no animation library — scroll
reveals are hand-rolled vanilla JS in the `<script>` block right before
`</body>` in `index.html`, paired with a `.reveal` / `.reveal.is-visible`
CSS rule near the end of the `<style>` block. Extend that one system for any
new section; don't add a second, different animation approach.

## How it works

1. **CSS** (`.reveal` rule): `opacity: 0; transform: translateY(28px);` with
   a `transition`, and `.reveal.is-visible { opacity: 1; transform: none; }`.
   A `@media (prefers-reduced-motion: reduce)` override forces `.reveal` to
   `opacity: 1; transition: none` outright.
2. **The `.reveal` class is added only by JS**, never present in the static
   HTML/CSS by default. This is deliberate progressive enhancement: if the
   script ever fails to run, nothing on the page is left permanently
   invisible — the hidden state only exists once JS has also taken
   responsibility for eventually revealing it.
3. **Two independent reveal mechanisms run together, not one:**
   - An `IntersectionObserver` (`threshold: 0.12`, `rootMargin:
     "0px 0px -60px 0px"`) is the primary, efficient path.
   - A throttled (`requestAnimationFrame`-gated) `scroll`/`resize` listener
     that manually checks `getBoundingClientRect()` runs **as a backup**,
     not a replacement. This was added after finding, empirically, that
     `IntersectionObserver` can silently never fire at all in some
     constrained/embedded browser contexts (observed in this project's own
     preview tooling) — real end-user browsers don't have this problem, but
     the fallback is nearly free and removes the risk entirely of a section
     staying stuck at `opacity: 0` for anyone.
   - Keep both when extending this — don't simplify down to IO alone.
4. **Staggering**: the `tag(selector, staggerMs)` helper counts siblings
   under the same parent and sets an inline `transition-delay` per element,
   capped at 8 steps, so a card grid or FAQ list cascades in slightly
   instead of popping in as one block.
5. **The hero** is already on-screen at load (nothing to scroll to), so it's
   handled separately: `.reveal` is added immediately, then a **double
   `requestAnimationFrame`** (not a single one) adds `.is-visible` — the
   double-rAF ensures the browser has actually painted the `opacity: 0`
   starting state on-screen at least once before the transition to
   `opacity: 1` begins, otherwise the browser can collapse both into a
   single paint and skip the animation entirely.

## Adding a new animated section

Add its selector(s) to the `groups` array in the reveal script (grouped by
section id, e.g. `'#pricing .card'`), with a stagger delay if it's a
repeated list/grid item. Don't write a new observer or a new CSS class —
reuse `.reveal`/`.is-visible`.

## Related: the app's own version of this

The tutor-managment Next.js app (a separate repo) implements the same idea —
fade-and-rise on scroll, once — using framer-motion's `<Reveal>` and
`<AnimatedCounter>` components instead, since it has a proper build/component
setup this static site doesn't. See that repo's `scroll-animations` skill;
the principles (respect reduced motion, animate once, never leave content
stuck invisible) match even though the code doesn't.
