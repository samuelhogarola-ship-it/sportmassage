# Sport Massage proposal pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create three static, responsive monopage proposals for Sport Massage Fuengirola under the approved `/propuesta/*/` routes without changing the current homepage.

**Architecture:** Each proposal is an independent `index.html` with its own CSS and generated hero/editorial imagery. Shared brand assets and real contact links are reused, while each page has a distinct palette and layout system.

**Tech Stack:** Static HTML, CSS, existing Sport Massage assets, generated WebP/PNG imagery.

**Spec:** `docs/superpowers/specs/2026-10-17-sportmassage-propuestas-monopage-design.md`

## Global Constraints

- Keep `index.html` unchanged in behavior.
- Use only the three approved routes: `/propuesta/color-diferente/`, `/propuesta/moderno/`, `/propuesta/creativa/`.
- Preserve working contact, booking, legal and location links from the current site.
- Keep every proposal usable on mobile and desktop.
- Generated images must contain no invented text, logo or watermark.

## Review Focus

- Relative asset paths from nested proposal folders resolve correctly.
- Contact and booking links remain valid and accessible.
- Mobile navigation and content remain readable without horizontal overflow.
- Each page is visually distinct while retaining the same service content.
- The current homepage has no unintended diff.

### Task 1: Generate proposal imagery

**Files:** Create final images under `propuesta/*/assets/`.

- [ ] Generate a warm editorial sports-massage image for the modern proposal.
- [ ] Generate a high-contrast coastal/athletic image for the color-different proposal.
- [ ] Generate an expressive abstract body-motion image for the creative proposal.
- [ ] Copy final assets into the corresponding proposal folders and verify dimensions/formats.

### Task 2: Build the three static pages

**Files:** Create `propuesta/color-diferente/index.html`, `propuesta/moderno/index.html`, `propuesta/creativa/index.html` and their local styles/assets.

- [ ] Reproduce the current site's essential sections: hero, service overview, benefits/about, reviews or trust, booking CTA, contact/location and legal footer.
- [ ] Apply distinct design systems for the three approved concepts.
- [ ] Ensure nested paths use correct relative URLs and the generated imagery loads.
- [ ] Preserve the existing contact and booking targets.

### Task 3: Validate the proposal routes

**Files:** No new source files required.

- [ ] Parse every proposal HTML file and verify all local `href`/`src` targets exist.
- [ ] Check the homepage diff is empty.
- [ ] Run a local static server with the bundled Node runtime and request all three routes.
- [ ] Inspect the pages visually and fix any mobile/layout defects found.
