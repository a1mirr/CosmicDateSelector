# Cosmic Date Selector

A dummy registration page with one field — a birth date — whose **date picker is
a working model of the Solar System**. Hover the field and the planets drop open
where a calendar would be. Every date corresponds to a unique arrangement of the
planets, and you set your birth date by **dragging any planet along its orbit**.

The field itself takes no input: there is no calendar and nothing to type into,
so the sky is the only way to answer the question.

Because each planet has a different orbital period, the planet you grab sets the
resolution:

| Drag this… | …and time moves about |
| --- | --- |
| Neptune | 165 years per full turn (centuries fast) |
| Jupiter | ~12 years per turn |
| Earth | one year per turn |
| Mercury | 88 days per turn (fine, day-level tuning) |

The planet positions are not decorative — they're computed from real
low-precision Keplerian orbital elements (after Paul Schlyter's
[*Computing planetary positions*](https://stjarnhimlen.se/comp/ppcomp.html)),
so for any given date the planets sit at their true heliocentric ecliptic
longitudes.

## Full screen

The button in the corner of the popup opens the sky full screen, which zooms
out far enough to add the things that would swamp a 340px square: comet
Halley, the interstellar object 3I/ATLAS, Voyager 1 and 2, New Horizons, and
Cassini during its years at Saturn.

Everything here comes from [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/),
by one of two routes.

The comet and the interstellar object are **propagated from osculating
elements**. Halley carries one element set per apparition, because Jupiter and
Saturn move its period between 74 and 79 years — propagating the 1986 solution
back to 1910 mistimes that perihelion by three months. It is drawn for every
date, but Horizons' own ephemeris for it starts on 11 December 1599, so
outside 1599–2061 it runs on the nearest fitted apparition and its position
along the ellipse drifts by roughly a month per revolution it reaches back.

The spacecraft are **sampled positions of the path they actually flew**
(`trajectories.js`), because a flown path is a sequence of gravity assists and
burns that no set of elements describes — Cassini needed two loops past Venus
and one past Earth just to reach Saturn, and that is visible in the drawing.
Sampling is dense while a craft manoeuvres through the inner system and sparse
once it coasts; for the three still flying, dates after the last sample
continue along the escape hyperbola they are now on.

Checked against Horizons vectors, longitudes agree to 0.00° for Halley
(1607 and 1910), 3I/ATLAS and Voyager 1 at its last sample, 0.001° for Voyager
1 mid-track in 1990, 0.04° for an interpolated Cassini point in 1998, 0.12°
for Pluto and 0.2° for Ceres.

An orbit line is drawn only where the whole path is real: a closed ellipse, a
complete hyperbolic branch, or every sample a craft flew.

Two caveats on the drawing. It is a top-down view, so a body is plotted at its
distance projected onto the ecliptic — Voyager 2, on a 79° orbit, reads much
closer in than it is. And the radial scale is squeezed (roughly logarithmic,
calibrated on the planets' own rings) so that 1 AU and 138 AU fit on one map.
Angles are true; radii are compressed.

## Run locally

It's plain static HTML/CSS/JS with no build step. Just open `index.html`, or
serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy on GitHub Pages

The repo is ready to publish as-is (all assets live at the root).

**Option A — GitHub Actions (included).** The workflow at
`.github/workflows/pages.yml` deploys automatically on every push to `main`.
Just enable it once:

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Push to `main`. The site publishes to
   `https://<user>.github.io/<repo>/`.

**Option B — deploy from a branch.** Settings → Pages → Source: *Deploy from a
branch* → `main` / `/ (root)`. The `.nojekyll` file ensures the files are served
verbatim.

## Files

- `index.html` — form + the SVG sky that serves as its date picker
- `styles.css` — layout and theme
- `app.js` — orbital-mechanics engine, rendering, and drag-to-scrub-date logic
- `trajectories.js` — sampled Horizons positions for the flown spacecraft paths
