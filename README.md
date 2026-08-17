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
