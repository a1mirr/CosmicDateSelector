"use strict";

/* =========================================================================
 * Cosmic Date Selector
 * -------------------------------------------------------------------------
 * A top-down model of the Solar System whose planet positions are computed
 * from real low-precision orbital elements (after Paul Schlyter's
 * "Computing planetary positions"). Every date maps to a unique arrangement
 * of the planets; dragging any planet around its orbit scrubs the date.
 *
 * Because each planet has a different orbital period, the planet you grab
 * sets the resolution: drag Neptune to move by years, Mercury to nudge days.
 * ========================================================================= */

const DEG = Math.PI / 180;
const rev = (x) => x - Math.floor(x / 360) * 360; // normalise to [0, 360)

/* Orbital elements as [value at epoch, change per day].
 * Angles in degrees; a in AU. Epoch = 2000 Jan 0.0 (JD 2451543.5).
 * `M[1]` doubles as the planet's mean motion in deg/day. */
const ELEMENTS = {
  Mercury: { N:[48.3313,3.24587e-5], i:[7.0047,5.00e-8], w:[29.1241,1.01444e-5], a:[0.387098,0],        e:[0.205635,5.59e-10], M:[168.6562,4.0923344368] },
  Venus:   { N:[76.6799,2.46590e-5], i:[3.3946,2.75e-8], w:[54.8910,1.38374e-5], a:[0.723330,0],        e:[0.006773,-1.302e-9],M:[48.0052,1.6021302244] },
  Earth:   { N:[0,0],                i:[0,0],            w:[282.9404,4.70935e-5],a:[1.000000,0],        e:[0.016709,-1.151e-9],M:[356.0470,0.9856002585] }, // Sun's elements; Earth is opposite
  Mars:    { N:[49.5574,2.11081e-5], i:[1.8497,-1.78e-8],w:[286.5016,2.92961e-5],a:[1.523688,0],        e:[0.093405,2.516e-9], M:[18.6021,0.5240207766] },
  Jupiter: { N:[100.4542,2.76854e-5],i:[1.3030,-1.557e-7],w:[273.8777,1.64505e-5],a:[5.20256,0],        e:[0.048498,4.469e-9], M:[19.8950,0.0830853001] },
  Saturn:  { N:[113.6634,2.38980e-5],i:[2.4886,-1.081e-7],w:[339.3939,2.97661e-5],a:[9.55475,0],        e:[0.055546,-9.499e-9],M:[316.9670,0.0334442282] },
  Uranus:  { N:[74.0005,1.3978e-5],  i:[0.7733,1.9e-8],  w:[96.6612,3.0565e-5],  a:[19.18171,-1.55e-8], e:[0.047318,7.45e-9],  M:[142.5905,0.011725806] },
  Neptune: { N:[131.7806,3.0173e-5], i:[1.7700,-2.55e-7],w:[272.8461,-6.027e-6], a:[30.05826,3.313e-8], e:[0.008606,2.15e-9],  M:[260.2471,0.005995147] },
};

/* ---- Two-body propagation from JPL osculating elements ------------------ */

/* Everything below the planets — Ceres, a comet, an interstellar visitor, a
 * spacecraft coasting away — is propagated from a single set of osculating
 * elements taken from JPL Horizons: eccentricity, perihelion distance q (AU),
 * inclination, ascending node and argument of perihelion (degrees), time of
 * perihelion Tp (JD) and mean motion n (deg/day).
 *
 * Two-body motion is exact for an unperturbed orbit, so each body is only
 * shown over a window where that assumption holds and the result has been
 * checked against Horizons. Elliptical and hyperbolic orbits differ only in
 * which anomaly equation gets solved. */
const EPOCH_JD = 2451543.5; // JD at dn = 0

function keplerPosition(el, dn) {
  const e = el.e;
  let xv, yv; // position in the orbital plane, perihelion along +x

  if (e < 1) {
    const a = el.q / (1 - e);
    // Wrap to one revolution about perihelion so Newton always converges.
    let M = rev(el.n * (dn + EPOCH_JD - el.Tp));
    if (M > 180) M -= 360;
    M *= DEG;
    let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (let k = 0; k < 12; k++) {
      E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    xv = a * (Math.cos(E) - e);
    yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
  } else {
    const A = el.q / (e - 1); // positive; one passage, so no wrapping
    const M = el.n * (dn + EPOCH_JD - el.Tp) * DEG;
    let H = Math.asinh(M / e);
    for (let k = 0; k < 60; k++) {
      const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
      H -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    xv = A * (e - Math.cosh(H));
    yv = A * Math.sqrt(e * e - 1) * Math.sinh(H);
  }

  const N = el.node * DEG, w = el.argp * DEG, i = el.i * DEG;
  const cN = Math.cos(N), sN = Math.sin(N);
  const cw = Math.cos(w), sw = Math.sin(w);
  const ci = Math.cos(i), si = Math.sin(i);

  const x = xv * (cN * cw - sN * sw * ci) + yv * (-cN * sw - sN * cw * ci);
  const y = xv * (sN * cw + cN * sw * ci) + yv * (-sN * sw + cN * cw * ci);

  // Top-down map: the plotted radius is the distance projected onto the
  // ecliptic, which is what x and y already are.
  return { lon: Math.atan2(y, x), r: Math.hypot(x, y) };
}

const kepler = (el) => (dn) => keplerPosition(el, dn);

/* Halley is the one body here that two-body motion cannot carry across
 * centuries: Jupiter and Saturn shove its period around between 74 and 79
 * years, so propagating the 1986 solution back to 1910 lands the comet three
 * months out — right place on the ellipse, wrong date. JPL fits each
 * apparition separately, so we carry one element set per apparition and use
 * whichever perihelion is nearest the date being shown. */
const HALLEY = [
  { e: 0.9672960499, q: 0.5872100478, i: 162.2187984, node: 58.56208299,
    argp: 111.7366941, Tp: 2418781.678417111, n: 0.01295430667 }, // 1910
  { e: 0.9672792272, q: 0.5871034488, i: 162.2422243, node: 58.85993641,
    argp: 111.8655481, Tp: 2446470.958961021, n: 0.01296783439 }, // 1986
  { e: 0.9665767671, q: 0.5927819456, i: 161.9651213, node: 59.39231569,
    argp: 112.0521038, Tp: 2474034.220124185, n: 0.01319575685 }, // 2061
];

function halleyPosition(dn) {
  const jd = dn + EPOCH_JD;
  let best = HALLEY[0];
  for (const el of HALLEY) {
    if (Math.abs(jd - el.Tp) < Math.abs(jd - best.Tp)) best = el;
  }
  return keplerPosition(best, dn);
}

/* ---- Mapping real distances onto the drawing ---------------------------- */

/* The rings are hand-tuned rather than to scale, so anything plotted at a real
 * distance has to be squeezed through the same curve: interpolate the planets'
 * own (semi-major axis -> ring) pairs in log space, and continue past Neptune
 * at a gentler 110px per decade so the far objects stay on the map. */
const RING_SCALE = [
  [0.3871, 52], [0.7233, 78], [1.0000, 106], [1.5237, 138], [2.7658, 162],
  [5.2026, 186], [9.5548, 226], [19.1817, 262], [30.0583, 290],
];

function ringForAU(au) {
  const r = Math.max(au, 0.02);
  if (r <= RING_SCALE[0][0]) return RING_SCALE[0][1] * (r / RING_SCALE[0][0]);
  for (let k = 1; k < RING_SCALE.length; k++) {
    const [a0, p0] = RING_SCALE[k - 1], [a1, p1] = RING_SCALE[k];
    if (r <= a1) {
      const t = Math.log(r / a0) / Math.log(a1 / a0);
      return p0 + t * (p1 - p0);
    }
  }
  const [aN, pN] = RING_SCALE[RING_SCALE.length - 1];
  return pN + 110 * Math.log10(r / aN);
}

/* Display config: ring = orbit radius on screen (px), size = planet radius,
 * color = fill. Rings are hand-tuned (roughly log-spaced) so every orbit is
 * visible rather than physically to-scale.
 *
 * `from` / `until` are the dates a body joined and left the list of planets.
 * The sky shows the Solar System as it was understood on the selected date, so
 * drag far enough back and the outer planets go out one by one; Mercury
 * through Saturn have no `from` because nobody had to discover them. */
const PLANETS = [
  { name: "Mercury", ring: 52,  size: 2.6, color: "#b7b0a4" },
  { name: "Venus",   ring: 78,  size: 4.2, color: "#e6c98a" },
  { name: "Earth",   ring: 106, size: 4.4, color: "#5b9bff" },
  { name: "Mars",    ring: 138, size: 3.4, color: "#e07a4d" },
  // A planet from Piazzi's discovery until the asteroid belt filled up around
  // it. Elements osculating at 1825, the middle of that half-century.
  { name: "Ceres",   size: 2.8, color: "#a9a49a",
    at: kepler({ e: 0.078597801, q: 2.549992651, i: 10.63160989,
                 node: 83.19164578, argp: 65.30507952,
                 Tp: 2387588.515790960, n: 0.2140767717 }),
    period: 1681.64, motion: 0.2140767717,
    from: Date.UTC(1801, 0, 1), until: Date.UTC(1852, 0, 1) },
  { name: "Jupiter", ring: 186, size: 9.0, color: "#d9a679" },
  { name: "Saturn",  ring: 226, size: 7.6, color: "#e8d19b" },
  // Herschel, 13 March 1781 — the first planet nobody had always known about.
  { name: "Uranus",  ring: 262, size: 5.6, color: "#9fe6e6", from: Date.UTC(1781, 2, 13) },
  // Predicted by Le Verrier, found by Galle on the night of 23 September 1846.
  { name: "Neptune", ring: 290, size: 5.4, color: "#5b7bff", from: Date.UTC(1846, 8, 23) },
  // Tombaugh, 18 February 1930 — until the IAU's definition on 24 August 2006.
  // Elements osculating at 1968, the middle of that window. Plotted at its
  // true distance, so with e = 0.25 it swings from 49 AU down inside Neptune's
  // ring at perihelion in 1989, exactly as it does in the sky.
  { name: "Pluto",   size: 3.2, color: "#cbb6a4",
    at: kepler({ e: 0.2522245672, q: 29.62583757, i: 17.06324778,
                 node: 109.8122650, argp: 114.3469360,
                 Tp: 2447814.188036249, n: 0.003952345558 }),
    period: 91085.153, motion: 0.003952345558,
    from: Date.UTC(1930, 1, 18), until: Date.UTC(2006, 7, 24) },
];

/* Where a body sits on the drawing: an angle, and a radius that is either its
 * hand-tuned ring or its real distance squeezed through `ringForAU`. */
function bodyPosition(p, dn) {
  if (p.at) {
    const s = p.at(dn);
    return { lon: s.lon, ring: ringForAU(s.r) };
  }
  return { lon: heliocentricLongitude(p.name, dn), ring: p.ring };
}

/* ---- Extras: things that are not planets, shown only full screen -------
 *
 * These would swamp the little popup, so they only appear once the sky has
 * room. Each is propagated from JPL Horizons osculating elements over a window
 * where two-body motion holds — after a spacecraft's last gravity assist, or
 * around a comet's own apparition — and each was checked against Horizons.
 *
 * Cassini and the cruise phases of the others are deliberately absent: their
 * paths are strings of gravity assists and burns that no closed-form orbit
 * reproduces. Cassini appears only for its years in orbit at Saturn, where
 * riding Saturn's position is accurate to far less than a pixel here. */
const EXTRAS = [
  // 1P/Halley. The dot uses the apparition nearest the date; the drawn ellipse
  // is one revolution of the 1986 solution, so it doesn't kink where the
  // element sets hand over.
  { name: "Halley", size: 2.0, color: "#8ee0c0",
    at: halleyPosition, pathAt: kepler(HALLEY[1]), period: 27760.996,
    from: Date.UTC(1900, 0, 1), until: Date.UTC(2100, 0, 1) },

  // 3I/ATLAS, the third known interstellar object: hyperbolic, e = 6.14, so it
  // crosses once and never returns. Shown from its discovery on 1 July 2025.
  { name: "3I/ATLAS", size: 1.8, color: "#c9a2ff",
    at: kepler({ e: 6.139755265, q: 1.356442543, i: 175.1135356,
                 node: 322.1547641, argp: 128.0057210,
                 Tp: 2460977.983124003, n: 7.269685622 }),
    from: Date.UTC(2025, 6, 1) },

  // Voyager 1 after its Titan flyby of 12 November 1980 put it on the escape
  // hyperbola it has followed ever since.
  { name: "Voyager 1", size: 1.6, color: "#ffd451", craft: true,
    at: kepler({ e: 3.695530547, q: 8.670423985, i: 35.78608710,
                 node: 179.0656404, argp: 338.0564708,
                 Tp: 2444231.466052787, n: 0.1708480232 }),
    from: Date.UTC(1980, 10, 13) },

  // Voyager 2 after Neptune, 25 August 1989. Its orbit is steeply inclined
  // (79°), so on this top-down map it reads much closer in than it really is.
  { name: "Voyager 2", size: 1.6, color: "#ffb457", craft: true,
    at: kepler({ e: 6.283315907, q: 21.24898323, i: 79.00274168,
                 node: 101.8247301, argp: 130.0377591,
                 Tp: 2445451.634079524, n: 0.1221959219 }),
    from: Date.UTC(1989, 7, 26) },

  // New Horizons after its Jupiter assist of 28 February 2007.
  { name: "New Horizons", size: 1.6, color: "#7ee0a0", craft: true,
    at: kepler({ e: 1.408801545, q: 2.305834525, i: 2.262922701,
                 node: 226.5467691, argp: 291.4515432,
                 Tp: 2453771.276271808, n: 0.07357506587 }),
    from: Date.UTC(2007, 2, 1) },

  // Saturn orbit insertion to the Grand Finale, 2004–2017.
  { name: "Cassini", size: 1.6, color: "#e8d19b", craft: true, follows: "Saturn",
    from: Date.UTC(2004, 6, 1), until: Date.UTC(2017, 8, 16) },
];

/* Was this body a planet on the given date? */
function isPlanetOn(p, ms) {
  return (p.from === undefined || ms >= p.from) && (p.until === undefined || ms < p.until);
}

const DAY_MS = 86400000;
/* The past is not fenced off: keep dragging and you can leave recorded history
 * entirely. The only floor is the earliest instant a JS Date can represent. */
const MIN_DATE = -8.64e15;
/* No birth dates in the future. Computed at load, not hardcoded, so a
 * long-deployed copy of the page never falls behind today's date. */
const MAX_DATE = (() => {
  const now = new Date();
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
})();

/* ---- Astronomy -------------------------------------------------------- */

/* Schlyter day number: days since 2000 Jan 0.0, including fractional day. */
function dayNumber(ms) {
  const d = new Date(ms);
  const Y = d.getUTCFullYear(), M = d.getUTCMonth() + 1, D = d.getUTCDate();
  const dn = 367 * Y
    - Math.floor((7 * (Y + Math.floor((M + 9) / 12))) / 4)
    + Math.floor((275 * M) / 9) + D - 730530;
  const frac = (d.getUTCHours() + d.getUTCMinutes() / 60) / 24;
  return dn + frac;
}

/* Heliocentric ecliptic longitude (radians) of a planet on day `dn`. */
function heliocentricLongitude(name, dn) {
  const el = ELEMENTS[name === "Earth" ? "Earth" : name];
  const N = rev(el.N[0] + el.N[1] * dn) * DEG;
  const i = (el.i[0] + el.i[1] * dn) * DEG;
  const w = rev(el.w[0] + el.w[1] * dn) * DEG;
  const e = el.e[0] + el.e[1] * dn;
  const M = rev(el.M[0] + el.M[1] * dn) * DEG;

  // Solve Kepler's equation for the eccentric anomaly E.
  let E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
  for (let k = 0; k < 6; k++) {
    E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  }

  const xv = Math.cos(E) - e;
  const yv = Math.sqrt(1 - e * e) * Math.sin(E);
  const v = Math.atan2(yv, xv); // true anomaly (radius scale is irrelevant here)

  // Position in the ecliptic plane, then longitude.
  const xh = Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i);
  const yh = Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i);
  let lon = Math.atan2(yh, xh);

  // Above we used the Sun's elements; Earth sits opposite the Sun.
  if (name === "Earth") lon += Math.PI;
  return lon;
}

/* ---- State & DOM ------------------------------------------------------ */

let currentMs = Date.UTC(2000, 0, 1); // default selection

const svg = document.getElementById("sky");
const orbitsG = document.getElementById("orbits");
const planetsG = document.getElementById("planets");
const starsG = document.getElementById("stars");
const extrasG = document.getElementById("extras");
const extraOrbitsG = document.getElementById("extraOrbits");
const fsDate = document.getElementById("fsDate");
const dateInput = document.getElementById("dateInput"); // hidden, carries the form value
const dateText = document.getElementById("dateText");
const dateAnchor = document.getElementById("dateAnchor");
const dateBox = document.getElementById("dateBox");
const picker = document.getElementById("picker");
const nodes = {}; // name -> { group, hit, body }

function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/* Trace a real orbit. Closed orbits get one full revolution starting in 1800,
 * the beginning of the Pluto series' validity; open ones get the arc they are
 * actually shown over, which is the only part that means anything. */
function orbitPath(p, steps = 240) {
  const closed = p.period !== undefined;
  const dn0 = closed ? dayNumber(Date.UTC(1800, 0, 1)) : dayNumber(p.from);
  const span = closed ? p.period : dayNumber(Math.min(p.until ?? MAX_DATE, MAX_DATE)) - dn0;

  const shape = p.pathAt ? { at: p.pathAt } : p;
  let d = "";
  for (let k = 0; k <= steps; k++) {
    const { lon, ring } = bodyPosition(shape, dn0 + (k / steps) * span);
    const x = (Math.cos(lon) * ring).toFixed(2);
    const y = (-Math.sin(lon) * ring).toFixed(2);
    d += (k ? "L" : "M") + x + " " + y;
  }
  return closed ? d + "Z" : d;
}

/* One body: its orbit line, its dot, its label. Planets get a drag handle;
 * the extras are along for the ride. */
function buildBody(p, { draggable }) {
  const orbitParent = draggable ? orbitsG : extraOrbitsG;
  const bodyParent = draggable ? planetsG : extrasG;

  let orbit = null;
  if (p.at) orbit = svgEl("path", { class: "orbit", "data-orbit": p.name, d: orbitPath(p) });
  else if (p.ring) orbit = svgEl("circle", { class: "orbit", "data-orbit": p.name, cx: 0, cy: 0, r: p.ring });
  if (orbit) orbitParent.appendChild(orbit);

  const g = svgEl("g", { class: draggable ? "planet-group" : "planet-group extra", "data-planet": p.name });
  // Generous grab radius: the popup shows this 640-unit scene at ~340px.
  const hit = svgEl("circle", { class: "planet-hit", r: Math.max(p.size + 12, 18) });
  const body = svgEl("circle", { class: "planet-body", r: p.size, fill: p.color });
  const label = svgEl("text", {
    class: draggable ? "planet-label" : "planet-label extra-label",
    "text-anchor": "middle", dy: -p.size - 5,
  });
  label.textContent = p.name;
  g.append(hit, body, label);
  bodyParent.appendChild(g);
  nodes[p.name] = { group: g, hit, body, label, orbit };

  if (draggable) attachDrag(p, g);
}

function buildScene() {
  // Starfield, drawn out to the full-screen frame rather than the popup's.
  for (let n = 0; n < 220; n++) {
    const r = 30 + Math.random() * 560;
    const a = Math.random() * Math.PI * 2;
    starsG.appendChild(svgEl("circle", {
      cx: (Math.cos(a) * r).toFixed(1),
      cy: (Math.sin(a) * r).toFixed(1),
      r: (Math.random() * 0.9 + 0.2).toFixed(2),
      fill: "#fff",
      opacity: (Math.random() * 0.6 + 0.15).toFixed(2),
    }));
  }

  for (const p of PLANETS) buildBody(p, { draggable: true });
  for (const p of EXTRAS) buildBody(p, { draggable: false });
}

function render() {
  const dn = dayNumber(currentMs);
  for (const p of [...PLANETS, ...EXTRAS]) {
    // Fade out anything that didn't exist, or wasn't a planet, on this date —
    // and stop computing a position for it, since each body's model is only
    // meaningful inside its own window.
    const { group, label, orbit } = nodes[p.name];
    const here = isPlanetOn(p, currentMs);
    group.classList.toggle("gone", !here);
    orbit?.classList.toggle("gone", !here);
    if (!here) continue;

    // Cassini has no orbit of its own here: for its years at Saturn, Saturn's
    // position is its position to well under a pixel.
    const src = p.follows ? PLANETS.find((q) => q.name === p.follows) : p;
    const { lon, ring } = bodyPosition(src, dn);
    const x = Math.cos(lon) * ring;
    const y = -Math.sin(lon) * ring; // SVG y grows downward
    group.querySelector(".planet-hit").setAttribute("cx", x.toFixed(2));
    group.querySelector(".planet-hit").setAttribute("cy", y.toFixed(2));
    group.querySelector(".planet-body").setAttribute("cx", x.toFixed(2));
    group.querySelector(".planet-body").setAttribute("cy", y.toFixed(2));
    label.setAttribute("x", x.toFixed(2));
    label.setAttribute("y", y.toFixed(2));
  }
  updateDateUI();
}

/* Both formatters have to cope with years outside 1..9999, since the past is
 * unbounded: ISO 8601's expanded form for the form value, and an explicit BC
 * suffix for the display (astronomical year 0 is 1 BC). */
function isoDate(d) {
  const y = d.getUTCFullYear();
  const year = y < 0 ? "-" + String(-y).padStart(6, "0")
             : y > 9999 ? "+" + String(y).padStart(6, "0")
             : String(y).padStart(4, "0");
  return `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function displayDate(d) {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const y = d.getUTCFullYear();
  return y > 0 ? `${mm}/${dd}/${y}` : `${mm}/${dd}/${1 - y} BC`;
}

function updateDateUI() {
  const d = new Date(currentMs);
  dateInput.value = isoDate(d);
  dateText.textContent = displayDate(d);
  fsDate.textContent = displayDate(d); // the field is off-screen full screen
}

/* ---- The dropdown: hover to open, drag to pick ------------------------ */

let planetDragging = false; // set while a planet is being dragged
let closeTimer = null;
let closeWhenDragEnds = false;

function openPicker() {
  clearTimeout(closeTimer);
  closeWhenDragEnds = false;
  picker.hidden = false;
  dateBox.classList.add("open");
  dateBox.setAttribute("aria-expanded", "true");
}

function closePicker() {
  clearTimeout(closeTimer);
  picker.hidden = true;
  dateBox.classList.remove("open");
  dateBox.setAttribute("aria-expanded", "false");
}

/* A short grace period so crossing the gap between field and popup — or
 * slipping a few pixels off a planet mid-drag — doesn't dismiss it. */
function scheduleClose() {
  if (planetDragging) { closeWhenDragEnds = true; return; }
  if (document.fullscreenElement) return; // hover is meaningless full screen
  clearTimeout(closeTimer);
  closeTimer = setTimeout(closePicker, 180);
}

/* ---- Full screen ------------------------------------------------------- */

const expandBtn = document.getElementById("expandBtn");
expandBtn.addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else picker.requestFullscreen?.().catch(() => {});
});
/* Full screen zooms out as well as enlarging: Voyager 1 sits at ~370 on this
 * scale, far outside the frame the planets need. */
const VIEWBOX = { normal: "-320 -320 640 640", full: "-420 -420 840 840" };

document.addEventListener("fullscreenchange", () => {
  const full = document.fullscreenElement === picker;
  svg.setAttribute("viewBox", full ? VIEWBOX.full : VIEWBOX.normal);
  expandBtn.title = full ? "Exit full screen" : "Full screen";
  expandBtn.setAttribute("aria-label", expandBtn.title);
  // Coming back from full screen the pointer is usually nowhere near the
  // field, and no pointerleave will fire — so close unless it really is there.
  if (!full && !dateAnchor.matches(":hover")) closePicker();
});

// The popup lives inside the anchor, so hovering it keeps the anchor hovered.
dateAnchor.addEventListener("pointerenter", openPicker);
dateAnchor.addEventListener("pointerleave", scheduleClose);

// Hover isn't available on touch, and the field should work from the keyboard.
dateBox.addEventListener("click", () => (picker.hidden ? openPicker() : closePicker()));
dateBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    picker.hidden ? openPicker() : closePicker();
  }
});
document.addEventListener("keydown", (e) => {
  // In full screen, Escape belongs to the browser: let it just exit.
  if (e.key === "Escape" && !picker.hidden && !document.fullscreenElement) {
    closePicker();
    dateBox.focus();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (!picker.hidden && !dateAnchor.contains(e.target)) closePicker();
});

/* ---- Dragging: angle delta -> date delta ------------------------------ */

function pointerAngle(evt) {
  // Angle of the pointer about the Sun, counter-clockwise positive, in
  // radians. Ask the SVG itself for the mapping: the viewBox changes in full
  // screen, and there the drawing is letterboxed inside a wide viewport.
  const ctm = svg.getScreenCTM();
  if (!ctm) return 0;
  const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse());
  return Math.atan2(-pt.y, pt.x);
}

function attachDrag(planet, group) {
  let dragging = false;
  let lastAngle = 0;
  let pointerId = null;

  // deg/day — how far the grabbed planet's own year stretches the timeline.
  const meanMotion = planet.motion ?? ELEMENTS[planet.name].M[1];

  // The dates this particular body can take you to. `until` is exclusive, so
  // the last day it can reach is the day before it stopped being a planet.
  const lo = planet.from === undefined ? MIN_DATE : Math.max(MIN_DATE, planet.from);
  const hi = planet.until === undefined ? MAX_DATE : Math.min(MAX_DATE, planet.until - DAY_MS);

  const onDown = (evt) => {
    evt.preventDefault();
    dragging = true;
    planetDragging = true;
    pointerId = evt.pointerId;
    lastAngle = pointerAngle(evt);
    group.classList.add("active");
    svg.classList.add("grabbing");
    document.querySelector(`.orbit[data-orbit="${planet.name}"]`).classList.add("active");
    group.setPointerCapture?.(pointerId);
  };

  const onMove = (evt) => {
    if (!dragging || evt.pointerId !== pointerId) return;
    const a = pointerAngle(evt);
    let delta = a - lastAngle; // radians
    // Unwrap to the shortest arc so a full sweep doesn't jump a whole period.
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;
    lastAngle = a;

    // Prograde motion (increasing longitude) advances time.
    const deltaDeg = delta / DEG;
    const deltaDays = deltaDeg / meanMotion;
    currentMs += deltaDays * DAY_MS;

    // A body can only carry you through dates on which it exists: drag Pluto
    // and time stops dead at its discovery and at its demotion.
    if (currentMs < lo) currentMs = lo;
    if (currentMs > hi) currentMs = hi;

    render();
  };

  const onUp = (evt) => {
    if (!dragging) return;
    dragging = false;
    planetDragging = false;
    if (closeWhenDragEnds) scheduleClose(); // pointer wandered off during the drag
    group.classList.remove("active");
    svg.classList.remove("grabbing");
    document.querySelector(`.orbit[data-orbit="${planet.name}"]`).classList.remove("active");
    group.releasePointerCapture?.(pointerId);
    pointerId = null;
  };

  group.addEventListener("pointerdown", onDown);
  group.addEventListener("pointermove", onMove);
  group.addEventListener("pointerup", onUp);
  group.addEventListener("pointercancel", onUp);
}

/* ---- Form -------------------------------------------------------------- */

const form = document.getElementById("register");
const result = document.getElementById("result");
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const d = new Date(currentMs).toLocaleDateString("en-US",
    { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
  result.className = "result";
  result.textContent = `Born ${d}. (Dummy sign-up — nothing was sent.)`;
});

/* ---- Go ---------------------------------------------------------------- */
buildScene();
render();
