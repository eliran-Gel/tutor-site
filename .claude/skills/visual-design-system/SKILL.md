---
name: visual-design-system
description: Use whenever touching colors, fonts, spacing, or component visual style on the elirangelberg.com marketing site (index.html) — covers the current token palette and the hard lesson about how much visual change the tutor actually wants approved-on-paper vs. shipped.
---

# Visual design system (elirangelberg.com marketing site)

## The one lesson that matters most: evolve, don't replace

A full "editorial" visual redesign of this exact site was once written up as
a detailed brief, explicitly approved step-by-step by the tutor, fully
implemented (new palette, new display serif, restructured hero), and
deployed — then rejected outright the moment he saw it live: "העיצוב נראה
מזעזע!! תחזיר לעיצוב החדש עכשיו!!" (the design looks awful, revert
immediately). It was fully reverted with `git checkout <pre-redesign-commit>
-- index.html`, keeping only the non-visual features that had been layered
on top in the meantime (SEO tags, the lead-capture form, GA4, the
cancellation-policy copy fix).

The takeaway: **written-brief approval does not reliably predict approval of
the shipped, live result** for this site. Default to incremental, reversible
visual changes on top of the *current* navy/turquoise/yellow layout and
structure — better use of the existing palette, spacing tweaks, motion (see
[[scroll-animations]]) — not a from-scratch template swap. If a bigger visual
change is explicitly requested, ship the smallest independently-reviewable
slice (e.g. just the hero) and get the tutor looking at the actual live page
before touching anything else, rather than proceeding through a whole plan
on the strength of a described-and-approved brief alone.

## Current palette & tokens

Defined as CSS custom properties near the top of the single `<style>` block
in `index.html`:

- `--bg: #edf1f7` (page background, faint grid texture), `--surface: #ffffff`, `--border: #d0d9e8`
- `--text: #1a2744`, `--muted: #5a6882`
- `--accent: #1e3a7f` (navy — primary brand color), `--accent-light: #dce5f5`
- `--yellow: #FACC15`, `--navy-dark: #0d1e4d` — secondary accents used for badges/highlights/CTA emphasis
- Subject tag colors: `--tag-math: #1e3a7f`, `--tag-physics: #5b21b6`, `--tag-cs: #065f46`
- `--radius: 12px`, `--shadow: 0 2px 8px rgba(30,58,127,0.08)`

This is a plain static HTML file with **no build step** — every new color
should become a new `--variable` next to these, not a hardcoded hex value
buried in a component's inline `style="..."` (several pricing-card and
about-photo styles already do this as one-offs; don't add more of that
pattern, even though precedent exists).

## No framework, no bundler

Vanilla HTML/CSS/JS only — no React, no Tailwind, no npm build. Keep any new
script inline in a `<script>` tag near the bottom of `<body>` (see the
existing FAQ-accordion, lead-form, and gallery scripts for the pattern:
small self-contained IIFEs, plain `document.querySelector`/
`addEventListener`, no dependencies).

## Deployment

Static Vercel project (`tutor-site`, separate from the `tutor-managment`
app's Vercel project), custom domain elirangelberg.com. Preview locally with
`.claude/launch.json`'s `tutor-site-static` config (a plain
`python -m http.server`) before pushing — this repo has no dev server of its
own to catch mistakes, so a real local render is the only check before
production.
