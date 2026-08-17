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
  /* Approximate J2000 elements, shifted to the epoch above. Ceres only ever
   * shows for its half-century as a planet, and it rides a fixed ring, so this
   * is close enough for the part of it you can see. */
  Ceres:   { N:[80.3930,0],          i:[10.5834,0],      w:[73.1187,0],          a:[2.76580,0],         e:[0.079340,0],        M:[188.9540,0.2141] },
};

/* Pluto has no simple Keplerian fit, so Schlyter gives it a periodic series
 * instead — valid 1800–2100, which comfortably covers the 1930–2006 window
 * where Pluto is a planet and therefore visible at all. */
const PLUTO_MOTION = 0.003968789; // deg/day, the series' mean argument rate

function plutoLongitude(dn) {
  const S = (50.03 + 0.033459652 * dn) * DEG;
  const P = (238.95 + PLUTO_MOTION * dn) * DEG;
  const lon = 238.9508 + 0.00400703 * dn
    - 19.799 * Math.sin(P)       + 19.848 * Math.cos(P)
    +  0.897 * Math.sin(2 * P)   -  4.956 * Math.cos(2 * P)
    +  0.610 * Math.sin(3 * P)   +  1.211 * Math.cos(3 * P)
    -  0.341 * Math.sin(4 * P)   -  0.190 * Math.cos(4 * P)
    +  0.128 * Math.sin(5 * P)   -  0.034 * Math.cos(5 * P)
    -  0.038 * Math.sin(6 * P)   +  0.031 * Math.cos(6 * P)
    +  0.020 * Math.sin(S - P)   -  0.010 * Math.cos(S - P);
  return rev(lon) * DEG;
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
  // A planet from Piazzi's discovery until the asteroid belt filled up around it.
  { name: "Ceres",   ring: 162, size: 2.8, color: "#a9a49a",
    from: Date.UTC(1801, 0, 1), until: Date.UTC(1852, 0, 1) },
  { name: "Jupiter", ring: 186, size: 9.0, color: "#d9a679" },
  { name: "Saturn",  ring: 226, size: 7.6, color: "#e8d19b" },
  // Herschel, 13 March 1781 — the first planet nobody had always known about.
  { name: "Uranus",  ring: 262, size: 5.6, color: "#9fe6e6", from: Date.UTC(1781, 2, 13) },
  // Predicted by Le Verrier, found by Galle on the night of 23 September 1846.
  { name: "Neptune", ring: 290, size: 5.4, color: "#5b7bff", from: Date.UTC(1846, 8, 23) },
  // Tombaugh, 18 February 1930 — until the IAU's definition on 24 August 2006.
  { name: "Pluto",   ring: 312, size: 3.2, color: "#cbb6a4",
    from: Date.UTC(1930, 1, 18), until: Date.UTC(2006, 7, 24) },
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
  if (name === "Pluto") return plutoLongitude(dn);
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

function buildScene() {
  // Starfield
  for (let n = 0; n < 140; n++) {
    const r = 30 + Math.random() * 290;
    const a = Math.random() * Math.PI * 2;
    starsG.appendChild(svgEl("circle", {
      cx: (Math.cos(a) * r).toFixed(1),
      cy: (Math.sin(a) * r).toFixed(1),
      r: (Math.random() * 0.9 + 0.2).toFixed(2),
      fill: "#fff",
      opacity: (Math.random() * 0.6 + 0.15).toFixed(2),
    }));
  }

  for (const p of PLANETS) {
    const orbit = svgEl("circle", { class: "orbit", "data-orbit": p.name, cx: 0, cy: 0, r: p.ring });
    orbitsG.appendChild(orbit);

    const g = svgEl("g", { class: "planet-group", "data-planet": p.name });
    // Generous grab radius: the popup shows this 640-unit scene at ~340px.
    const hit = svgEl("circle", { class: "planet-hit", r: Math.max(p.size + 12, 18) });
    const body = svgEl("circle", { class: "planet-body", r: p.size, fill: p.color });
    const label = svgEl("text", { class: "planet-label", "text-anchor": "middle", dy: -p.size - 5 });
    label.textContent = p.name;
    g.append(hit, body, label);
    planetsG.appendChild(g);
    nodes[p.name] = { group: g, hit, body, label, orbit };

    attachDrag(p, g);
  }
}

function render() {
  const dn = dayNumber(currentMs);
  for (const p of PLANETS) {
    // Fade out anything that wasn't a planet on this date, and stop computing
    // a position for it — Pluto's series is only valid over its own window.
    const here = isPlanetOn(p, currentMs);
    nodes[p.name].group.classList.toggle("gone", !here);
    nodes[p.name].orbit.classList.toggle("gone", !here);
    if (!here) continue;

    const lon = heliocentricLongitude(p.name, dn);
    const x = Math.cos(lon) * p.ring;
    const y = -Math.sin(lon) * p.ring; // SVG y grows downward
    const { group, label } = nodes[p.name];
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
  clearTimeout(closeTimer);
  closeTimer = setTimeout(closePicker, 180);
}

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
  if (e.key === "Escape" && !picker.hidden) { closePicker(); dateBox.focus(); }
});
document.addEventListener("pointerdown", (e) => {
  if (!picker.hidden && !dateAnchor.contains(e.target)) closePicker();
});

/* ---- Dragging: angle delta -> date delta ------------------------------ */

function pointerAngle(evt) {
  // Angle of the pointer about the Sun, in the same orientation as our plot
  // (counter-clockwise positive), in radians.
  const rect = svg.getBoundingClientRect();
  const vb = 640; // viewBox spans -320..320
  const x = ((evt.clientX - rect.left) / rect.width) * vb - vb / 2;
  const y = ((evt.clientY - rect.top) / rect.height) * vb - vb / 2;
  return Math.atan2(-y, x);
}

function attachDrag(planet, group) {
  let dragging = false;
  let lastAngle = 0;
  let pointerId = null;

  // deg/day — how far the grabbed planet's own year stretches the timeline.
  const meanMotion = planet.name === "Pluto" ? PLUTO_MOTION : ELEMENTS[planet.name].M[1];

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

    if (currentMs < MIN_DATE) currentMs = MIN_DATE;
    if (currentMs > MAX_DATE) currentMs = MAX_DATE;

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
