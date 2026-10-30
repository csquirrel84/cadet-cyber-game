let lastState = null;
let selectedCallsign = null;
let armed = null;      // { kind: 'scan'|'run', nodeId, level|card }
let awaitingConfirm = null; // { nodeId, card, roll }

const el = (id) => document.getElementById(id);
const term = el("term");
const input = el("cmd-input");

// --------------------------------------------------------- iso projection

// Note: scaling tw/th alone cannot make the island look bigger on screen --
// the SVG viewBox always auto-fits to exactly the content's own extent
// (preserveAspectRatio="none"), so the island and its own measuring stick
// grow together and the apparent size cancels out exactly. DETAIL_SCALE is
// kept at 1 (inert) rather than ripping out the per-element scaling below;
// what actually makes the island bigger is islandRadius() filling more of
// the fixed 0-100 frame that node positions (from the scenario file) live in.
const DETAIL_SCALE = 1;
const ISO = { cols: 120, rows: 120, tw: 2.76 * DETAIL_SCALE, th: 1.38 * DETAIL_SCALE, padX: 4, padTop: 4, padBottom: 14 };
ISO.originX = ISO.rows * (ISO.tw / 2) + ISO.padX;
ISO.totalW = ISO.rows * ISO.tw + ISO.cols * ISO.tw / 2 + ISO.padX * 2;
ISO.totalH = (ISO.cols + ISO.rows) * (ISO.th / 2) + ISO.padTop + ISO.padBottom;

function isoX(col, row) { return (col - row) * (ISO.tw / 2) + ISO.originX; }
function isoY(col, row) { return (col + row) * (ISO.th / 2) + ISO.padTop; }

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}
function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return amt >= 0
    ? rgbToHex([r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt])
    : rgbToHex([r * (1 + amt), g * (1 + amt), b * (1 + amt)]);
}

/** One iso prism (roof diamond + two shaded wall faces) anchored with its
 * base centre at (cx, cy), roof `height` units above. */
function isoBlock(cx, cy, halfW, halfD, height, base) {
  const top = shade(base, 0.18), left = base, right = shade(base, -0.32);
  const T = [cx, cy - halfD], R = [cx + halfW, cy], B = [cx, cy + halfD], L = [cx - halfW, cy];
  const T2 = [T[0], T[1] - height], R2 = [R[0], R[1] - height], B2 = [B[0], B[1] - height], L2 = [L[0], L[1] - height];
  const pts = (a, b, c, d) => `${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]} ${d[0]},${d[1]}`;
  return (
    `<polygon points="${pts(L, B, B2, L2)}" fill="${left}"/>` +
    `<polygon points="${pts(B, R, R2, B2)}" fill="${right}"/>` +
    `<polygon points="${pts(T2, R2, B2, L2)}" fill="${top}"/>`
  );
}

const _lerp = (a, b, t) => a + (b - a) * t;
function _facePoint(c1, c2, top1, top2, t, u) {
  const bx = _lerp(c1[0], c2[0], t), by = _lerp(c1[1], c2[1], t);
  const tx = _lerp(top1[0], top2[0], t), ty = _lerp(top1[1], top2[1], t);
  return [_lerp(bx, tx, u), _lerp(by, ty, u)];
}

/** A grid of small window rects on one wall face of an iso block, properly
 * sheared to match the face's parallelogram. c1/c2 are the face's bottom
 * corners, top1/top2 the same corners raised by the block's height. */
function isoWindows(c1, c2, top1, top2, nAcross, nUp, litColor, darkColor) {
  let out = "";
  for (let i = 0; i < nAcross; i++) {
    const t0 = (i + 0.22) / nAcross, t1 = (i + 0.78) / nAcross;
    for (let j = 0; j < nUp; j++) {
      const u0 = (j + 0.18) / nUp, u1 = (j + 0.62) / nUp;
      const p00 = _facePoint(c1, c2, top1, top2, t0, u0);
      const p10 = _facePoint(c1, c2, top1, top2, t1, u0);
      const p11 = _facePoint(c1, c2, top1, top2, t1, u1);
      const p01 = _facePoint(c1, c2, top1, top2, t0, u1);
      const lit = (i * 3 + j * 2) % 5 === 0;
      out += `<polygon points="${p00},${p10},${p11},${p01}" fill="${lit ? litColor : darkColor}"/>`;
    }
  }
  return out;
}

/** 2-3 faint diagonal scuff marks on a wall face, for weathering. */
function isoWeathering(c1, c2, top1, top2, color) {
  let out = "";
  const spots = [[0.25, 0.3, 0.4, 0.55], [0.6, 0.15, 0.75, 0.4], [0.15, 0.6, 0.35, 0.8]];
  for (const [t0, u0, t1, u1] of spots) {
    const a = _facePoint(c1, c2, top1, top2, t0, u0);
    const b = _facePoint(c1, c2, top1, top2, t1, u1);
    out += `<line x1="${a[0].toFixed(2)}" y1="${a[1].toFixed(2)}" x2="${b[0].toFixed(2)}" y2="${b[1].toFixed(2)}" stroke="${color}" stroke-width="0.4" opacity="0.25"/>`;
  }
  return out;
}

/** Full detail package for a building: the block, a window grid on each
 * wall, and weathering, returned as one SVG string. */
function isoBuilding(cx, cy, halfW, halfD, height, base, opts) {
  opts = opts || {};
  const T = [cx, cy - halfD], R = [cx + halfW, cy], B = [cx, cy + halfD], L = [cx - halfW, cy];
  const Td = [T[0], T[1] - height], Rd = [R[0], R[1] - height], Bd = [B[0], B[1] - height], Ld = [L[0], L[1] - height];
  const litColor = opts.lit || "#ffe28a";
  const darkColor = shade(base, -0.5);
  const nAcross = opts.nAcross || 2, nUp = opts.nUp || (height > 8 ? 2 : 1);
  let out = isoBlock(cx, cy, halfW, halfD, height, base);
  if (opts.windows !== false && halfD > 1.5) {
    out += isoWindows(L, B, Ld, Bd, nAcross, nUp, litColor, darkColor);
    out += isoWindows(B, R, Bd, Rd, nAcross, nUp, litColor, darkColor);
  }
  if (opts.weather !== false) {
    out += isoWeathering(L, B, Ld, Bd, "#000");
  }
  return out;
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  let body = null;
  try { body = await res.json(); } catch (_) { /* no body */ }
  if (!res.ok) {
    const err = new Error((body && body.detail) || res.statusText);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function print(text, cls) {
  const line = document.createElement("div");
  line.className = "line" + (cls ? " " + cls : "");
  line.textContent = text;
  term.appendChild(line);
  term.scrollTop = term.scrollHeight;
}

function printBlock(lines, cls) {
  for (const l of lines) print(l, cls);
}

function fmtClock(minutes) {
  const m = Math.floor(minutes);
  const s = Math.floor((minutes - m) * 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function findNode(token) {
  if (!lastState || !token) return null;
  const t = token.toLowerCase();
  return lastState.nodes.find(
    (n) => n.callsign.toLowerCase() === t || n.id.toLowerCase() === t || (n.name && n.name.toLowerCase() === t)
  );
}

function nodeLabel(n) {
  return n.name ? `${n.name} [${n.callsign}]` : n.callsign;
}

// ---------------------------------------------------------------- render

function renderMeters(meters) {
  el("noise-num").textContent = `${meters.noise} / ${meters.noise_lockdown}`;
  el("trace-num").textContent = `${meters.trace} / ${meters.trace_attributed}`;
  el("noise-fill").style.width = Math.min(100, (meters.noise / meters.noise_lockdown) * 100) + "%";
  el("trace-fill").style.width = Math.min(100, (meters.trace / meters.trace_attributed) * 100) + "%";
  el("noise-bar").classList.toggle("warn", meters.noise >= meters.noise_warn);
  el("trace-bar").classList.toggle("warn", meters.trace >= meters.trace_warn);
}

function tankBands(cx, cy, halfW, height, n, color) {
  let out = "";
  for (let i = 1; i < n; i++) {
    const y = cy - (height * i) / n;
    out += `<line x1="${cx - halfW}" y1="${y}" x2="${cx + halfW}" y2="${y}" stroke="${color}" stroke-width="0.4" opacity="0.6"/>`;
  }
  return out;
}
function ladder(x, y0, y1, color) {
  let out = `<line x1="${x - 0.5}" y1="${y0}" x2="${x - 0.5}" y2="${y1}" stroke="${color}" stroke-width="0.3"/>` +
    `<line x1="${x + 0.5}" y1="${y0}" x2="${x + 0.5}" y2="${y1}" stroke="${color}" stroke-width="0.3"/>`;
  for (let y = y0; y > y1; y -= 1.2) out += `<line x1="${x - 0.5}" y1="${y}" x2="${x + 0.5}" y2="${y}" stroke="${color}" stroke-width="0.25"/>`;
  return out;
}
function hazardStripes(cx, cy, w, color1, color2) {
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += `<rect x="${cx - w / 2 + i * w / 5}" y="${cy}" width="${w / 10}" height="0.6" fill="${i % 2 ? color1 : color2}"/>`;
  }
  return out;
}
function sandbags(cx, cy, halfW, color) {
  let out = "";
  for (let i = -2; i <= 2; i++) out += `<ellipse cx="${cx + i * (halfW / 2.5)}" cy="${cy}" rx="1.1" ry="0.5" fill="${color}"/>`;
  return out;
}
function guyWires(cx, topY, baseY, spread, color) {
  return `<line x1="${cx}" y1="${topY}" x2="${cx - spread}" y2="${baseY}" stroke="${color}" stroke-width="0.25" opacity="0.6"/>
    <line x1="${cx}" y1="${topY}" x2="${cx + spread}" y2="${baseY}" stroke="${color}" stroke-width="0.25" opacity="0.6"/>`;
}

/** A small iso crate sat on the ground at (cx, cy). */
function crate(cx, cy, size, base) {
  return isoBlock(cx, cy, size, size * 0.5, size, base) +
    `<line x1="${cx - size}" y1="${cy - size * 0.1}" x2="${cx}" y2="${cy + size * 0.4}" stroke="${shade(base, -0.5)}" stroke-width="0.15" opacity="0.6"/>`;
}

/** A barrel: ellipse cap on a short cylinder body. */
function barrel(cx, cy, r, h, base) {
  const dark = shade(base, -0.35);
  return `<rect x="${cx - r}" y="${cy - h}" width="${r * 2}" height="${h}" fill="${base}" rx="${r * 0.3}"/>
    <ellipse cx="${cx}" cy="${cy - h}" rx="${r}" ry="${r * 0.42}" fill="${shade(base, 0.2)}"/>
    <line x1="${cx - r}" y1="${cy - h * 0.6}" x2="${cx + r}" y2="${cy - h * 0.6}" stroke="${dark}" stroke-width="0.25" opacity="0.7"/>`;
}

/** A short decorative fence segment, local to a building's own sprite. */
function miniFence(x0, x1, y, color) {
  let out = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y - (x1 - x0) * 0.12}" stroke="${color}" stroke-width="0.3" opacity="0.8"/>`;
  const n = Math.max(2, Math.round((x1 - x0) / 1.6));
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = _lerp(x0, x1, t), yy = y - (x1 - x0) * 0.12 * t;
    out += `<line x1="${x.toFixed(2)}" y1="${(yy - 1).toFixed(2)}" x2="${x.toFixed(2)}" y2="${(yy + 0.3).toFixed(2)}" stroke="${color}" stroke-width="0.3" opacity="0.8"/>`;
  }
  return out;
}

const SPRITES = {
  "power station": isoBuilding(16, 32, 10, 5, 9, "#d99a3c", { nAcross: 3, nUp: 2, lit: "#ffd98a" }) +
    isoBlock(11, 24, 1.6, 1, 10, "#444") + isoBlock(20, 22, 1.6, 1, 12, "#444") +
    `<ellipse cx="11" cy="13" rx="1.4" ry="0.8" fill="#aaa" opacity="0.4"/>
     <ellipse cx="20" cy="9" rx="1.6" ry="0.9" fill="#aaa" opacity="0.35"/>
     <line x1="4" y1="27" x2="28" y2="27" stroke="#3a2c10" stroke-width="0.5" opacity="0.6"/>` +
    hazardStripes(16, 39, 14, "#1a1a1a", "#d9a73c") +
    crate(5, 38, 1.1, "#6b5a38") + crate(6.4, 37, 0.9, "#7a6844") + barrel(27, 38, 0.9, 1.6, "#4a6b3a"),
  substation: isoBuilding(16, 32, 9, 4.5, 6, "#8a8a8a", { windows: false }) +
    `<line x1="12" y1="18" x2="12" y2="26" stroke="#333" stroke-width="1"/>
     <line x1="20" y1="16" x2="20" y2="26" stroke="#333" stroke-width="1"/>
     <circle cx="12" cy="17" r="0.6" fill="#eee"/><circle cx="20" cy="15" r="0.6" fill="#eee"/>
     <polygon points="24,22 25.4,24.6 22.6,24.6" fill="#e0b020"/>` +
    isoBlock(9, 37, 1.4, 1, 2, "#777") + miniFence(2, 8, 39, "#999"),
  hospital: isoBuilding(16, 32, 9, 4.5, 10, "#e3e3e3", { nAcross: 3, nUp: 2, lit: "#fff6d8" }) +
    `<line x1="16" y1="18" x2="16" y2="22" stroke="#c62828" stroke-width="1.6"/>
     <line x1="13.5" y1="20" x2="18.5" y2="20" stroke="#c62828" stroke-width="1.6"/>
     <rect x="10" y="29" width="4" height="2.4" fill="#9ab" opacity="0.7"/>` +
    isoBlock(21, 23, 1.2, 1.2, 1.4, "#ccc"),
  district: isoBuilding(10, 34, 5, 2.5, 5, "#b58a62", { nAcross: 1, nUp: 1, lit: "#ffe9b0" }) +
    isoBuilding(22, 30, 5, 2.5, 5, "#a87954", { nAcross: 1, nUp: 1, lit: "#ffe9b0" }) +
    `<rect x="9.3" y="26" width="0.8" height="2.4" fill="#3a2c1a"/>
     <rect x="21.3" y="22" width="0.8" height="2.4" fill="#3a2c1a"/>
     <circle cx="12.5" cy="31.5" r="0.4" fill="#ffd98a" opacity="0.8"/>`,
  rail: isoBuilding(16, 33, 9, 4.5, 5, "#8a8a8a", { nAcross: 2, nUp: 1 }) +
    `<line x1="8" y1="31" x2="24" y2="31" stroke="#c9c9a0" stroke-width="0.6" stroke-dasharray="1 1"/>
     <line x1="5" y1="7" x2="5" y2="28" stroke="#555" stroke-width="0.5"/>
     <circle cx="5" cy="7" r="1" fill="#2a8a3a"/>`,
  water: isoBlock(16, 32, 6, 3, 12, "#3a7fa0") +
    tankBands(16, 32, 6, 12, 4, "#1f4f68") + ladder(22, 30, 21, "#223") +
    `<line x1="10" y1="31" x2="6" y2="33" stroke="#223" stroke-width="0.6"/>`,
  fuel: isoBlock(11, 34, 4, 2, 7, "#c15a26") + isoBlock(21, 31, 4, 2, 7, "#b14e1e") +
    tankBands(11, 34, 4, 7, 3, "#7a3312") + tankBands(21, 31, 4, 7, 3, "#733212") +
    `<line x1="15" y1="29" x2="17" y2="27" stroke="#555" stroke-width="0.5"/>` +
    hazardStripes(11, 38, 7, "#1a1a1a", "#e0a020") + hazardStripes(21, 35, 7, "#1a1a1a", "#e0a020") +
    barrel(4, 38, 0.8, 1.4, "#c15a26") + barrel(5.2, 39, 0.8, 1.4, "#733212") + miniFence(23, 29, 36, "#998"),
  radar: isoBlock(16, 33, 6, 3, 6, "#6b6b6b") +
    `<ellipse cx="16" cy="22" rx="7" ry="2.5" fill="#3a9aa0" transform="rotate(-20 16 22)"/>
     <line x1="16" y1="27" x2="16" y2="24" stroke="#444" stroke-width="0.6"/>
     <line x1="13" y1="30" x2="16" y2="27" stroke="#444" stroke-width="0.4"/>
     <line x1="19" y1="30" x2="16" y2="27" stroke="#444" stroke-width="0.4"/>
     <circle cx="12" cy="29" r="0.5" fill="#e04040"/>`,
  "air base": isoBuilding(16, 33, 12, 6, 6, "#7a7a7a", { nAcross: 4, nUp: 1, lit: "#dfe8c0" }) +
    `<line x1="6" y1="33" x2="26" y2="33" stroke="#c7c75a" stroke-width="0.8"/>
     <circle cx="27" cy="27" r="0.6" fill="#e04040"/>
     <line x1="16" y1="21" x2="16" y2="27" stroke="#555" stroke-width="0.4"/>` +
    crate(3, 38, 1, "#5a6b4a") + crate(28.5, 37, 1.1, "#6b7a4a"),
  "air defence": isoBlock(16, 34, 8, 4, 6, "#3a4a2f") + isoBlock(16, 26, 1.4, 4, 5, "#2a3a22") +
    sandbags(16, 36.5, 8, "#8a7a4a") +
    `<ellipse cx="13" cy="30" rx="1.6" ry="1" fill="#2e3a22" opacity="0.5"/>
     <ellipse cx="19" cy="29" rx="1.3" ry="0.9" fill="#2e3a22" opacity="0.5"/>` +
    crate(4, 39, 0.9, "#3a4a2f") + barrel(28, 39, 0.8, 1.3, "#2e3a22"),
  generator: isoBuilding(16, 33, 7, 3.5, 5, "#6b6b6b", { windows: false }) +
    isoBlock(21, 29, 1, 1, 6, "#444") +
    `<circle cx="11" cy="29" r="1" fill="none" stroke="#e0b020" stroke-width="0.4"/>
     <line x1="11" y1="29" x2="11.6" y2="28.4" stroke="#e0b020" stroke-width="0.3"/>
     <line x1="9" y1="31" x2="13" y2="31" stroke="#333" stroke-width="0.4"/>`,
  feeder: `<line x1="16" y1="6" x2="16" y2="30" stroke="#555" stroke-width="1.4"/>
    <line x1="9" y1="13" x2="23" y2="13" stroke="#555" stroke-width="1.4"/>
    <line x1="9" y1="13" x2="9" y2="7" stroke="#777" stroke-width="1"/>
    <line x1="23" y1="13" x2="23" y2="7" stroke="#777" stroke-width="1"/>
    <line x1="12" y1="19" x2="20" y2="19" stroke="#555" stroke-width="1"/>
    <circle cx="9" cy="13" r="0.5" fill="#ddd"/><circle cx="23" cy="13" r="0.5" fill="#ddd"/>
    <circle cx="12" cy="19" r="0.4" fill="#ddd"/><circle cx="20" cy="19" r="0.4" fill="#ddd"/>`,
  telecoms: isoBlock(16, 36, 2.2, 1.2, 16, "#777") +
    `<polygon points="16,6 21,13 11,13" fill="#8a8a8a"/>
     <line x1="15" y1="35" x2="15" y2="20" stroke="#444" stroke-width="0.3"/>
     <line x1="17" y1="35" x2="17" y2="20" stroke="#444" stroke-width="0.3"/>` +
    guyWires(16, 18, 36, 6, "#666") +
    `<circle cx="16" cy="6" r="0.7" fill="#e04040"/>`,
  comms: `<line x1="16" y1="16" x2="16" y2="34" stroke="#555" stroke-width="1.4"/>
    <circle cx="16" cy="12" r="5" fill="none" stroke="#3a9aa0" stroke-width="1.6"/>
    <circle cx="16" cy="12" r="1.6" fill="#3a9aa0"/>` +
    guyWires(16, 20, 34, 5, "#666") +
    isoBlock(16, 36, 2.4, 1.4, 2, "#555"),
  objective: isoBlock(16, 34, 12, 6, 8, "#4a2020") + isoBlock(16, 30, 4, 4, 4, "#2a1212") +
    sandbags(16, 38, 12, "#6a5a38") +
    `<line x1="16" y1="26" x2="16" y2="21" stroke="#333" stroke-width="0.5"/>` +
    guyWires(16, 21, 26, 2.5, "#444") +
    `<ellipse cx="11" cy="31" rx="1.8" ry="1" fill="#1a0e0e" opacity="0.6"/>
     <ellipse cx="21" cy="30" rx="1.5" ry="0.9" fill="#1a0e0e" opacity="0.6"/>
     <path d="M5,37 l1.4,-1 l-1.4,-1 l1.4,-1 l-1.4,-1" stroke="#999" stroke-width="0.25" fill="none"/>
     <path d="M27,37 l-1.4,-1 l1.4,-1 l-1.4,-1 l1.4,-1" stroke="#999" stroke-width="0.25" fill="none"/>` +
    crate(2.5, 39, 1, "#5a4a30") + barrel(29, 39, 0.9, 1.5, "#4a2020"),
};
const FOG_SPRITE = `<circle cx="16" cy="30" r="3.5" fill="#ffe14d"/>
    <circle cx="16" cy="30" r="11" fill="none" stroke="#ffe14d" stroke-width="2" stroke-dasharray="3 3"/>`;

// ------------------------------------------------------------- terrain

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function islandRadius(theta) {
  // Fills as much of the fixed 0-100 node-position frame as safely possible
  // without the coastline clipping into a flat edge at the grid boundary.
  // Lower-amplitude wobble than before: less "island blob", more "landmass".
  return 46 + 4 * Math.sin(3 * theta + 1) + 3 * Math.cos(5 * theta + 0.5) + 2 * Math.sin(7 * theta + 2);
}

// The source image (campaign-map.webp) is 1536x1024. Its bottom 186px is
// the legend band, which now lives only in #legend-pinned -- #map-bg crops
// it out and #map is sized to the remaining 1536x838 content area. Both
// IMAGE_W/IMAGE_H and CONTENT_H are the single source of truth for that
// split; if the image or the crop line ever changes, this is the only
// place that needs updating.
const SRC_IMAGE_W = 1536, SRC_IMAGE_H = 1024, SRC_CONTENT_H = 838;

/** Hand-calibrated against the actual pins drawn in campaign-map.webp.
 * Values are raw [x, y] pixel coordinates in the source image's own
 * 1536x1024 space (easiest to eyeball against the picture). Converted to
 * percent-of-#map (the cropped 1536x838 content area) by nodePercent().
 * Best-effort single pass without pixel-level zoom tooling: some of the
 * visually-similar small badges (substation vs rail, the two hidden-feeder
 * greens) are closer guesses than the clearly distinct ones (power
 * stations, hospital cross, radar dishes, air base runway, bunker
 * crosshair). Easy to nudge -- it's just numbers in this table. */
// Positions are grouped by power dependency, not by which badge icon
// happens to look right -- a substation and everything it feeds sit
// together on the map, same as the logic graph says they should. See
// scenario/blackout.yaml's needs/sources for the ground truth this
// layout follows. Nudge individual numbers freely; just keep each
// cluster's members near each other when you do.
const NODE_IMAGE_POS = {
  // Cluster A -- fed by substation 1 (west landmass)
  ps_north: [180, 150],
  sub1: [300, 350],
  hospital: [350, 480],
  homes_east: [220, 420],
  rail: [420, 500],

  // Cluster B -- fed by substation 2 (centre landmass)
  ps_south: [600, 240],
  sub2: [700, 300],
  water_plant: [780, 280],
  fuel_depot: [650, 420],
  mil_radar: [850, 250],
  air_base: [900, 400],

  // Cluster C -- fed by substation 3 (east landmass)
  sub3: [1150, 300],
  civil_radar: [1250, 200],
  telecoms: [1100, 150],
  mil_comms: [1300, 250],
  homes_west: [1350, 400],

  // Air defence's own feeder/generator cluster -- between A and C,
  // since it draws from feed_1b (sub1) and feed_3b (sub3) both
  feed_1b: [500, 650],
  airdef: [750, 700],
  gen_ad: [750, 780],
  feed_3b: [1000, 650],

  // The objective -- only reachable via mil_comms (cluster C)
  bunker: [1150, 750],
};

/** A calibrated node's image pixel position, converted to percent of #map
 * (the cropped 1536xSRC_CONTENT_H content area the legend band is excluded
 * from) -- NOT percent of the full source image, since #map no longer
 * shows the full image. X is simple (no horizontal crop); Y divides by
 * SRC_CONTENT_H rather than SRC_IMAGE_H. */
function imagePosPercent(id) {
  const [px, py] = NODE_IMAGE_POS[id];
  return [(px / SRC_IMAGE_W) * 100, (py / SRC_CONTENT_H) * 100];
}

/** A node's pos is a 0-100 percent pair from the scenario file. Map it onto
 * the iso grid, then project to iso screen units (shared by tiles, roads,
 * fences and the HTML node markers so everything lines up). This is the
 * fallback for any node not in NODE_IMAGE_POS. */
function nodeGrid(n) {
  return [(n.pos[0] / 100) * ISO.cols, (n.pos[1] / 100) * ISO.rows];
}
function nodeIso(n) {
  if (NODE_IMAGE_POS[n.id]) {
    const [px, py] = imagePosPercent(n.id);
    return [(px / 100) * ISO.totalW, (py / 100) * ISO.totalH];
  }
  const [col, row] = nodeGrid(n);
  return [isoX(col, row), isoY(col, row)];
}
function nodePercent(n) {
  if (NODE_IMAGE_POS[n.id]) return imagePosPercent(n.id);
  const [x, y] = nodeIso(n);
  return [(x / ISO.totalW) * 100, (y / ISO.totalH) * 100];
}

function classifyTile(col, row) {
  const px = (col / ISO.cols) * 100, py = (row / ISO.rows) * 100;
  const dx = px - 50, dy = py - 50;
  const r = Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(dy, dx);
  const R = islandRadius(theta);
  if (r < R - 5) return "grass";
  if (r < R - 1) return "sand";
  if (r < R + 3) return "reef";
  return null;
}

/** Shortest distance (in grid units) from a point to a polyline, used to
 * lay dirt trails and river-bank decoration without needing node data. */
function distToPolyline(pc, pr, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const abx = bx - ax, aby = by - ay;
    const len2 = abx * abx + aby * aby || 1e-6;
    let t = ((pc - ax) * abx + (pr - ay) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t, cy = ay + aby * t;
    best = Math.min(best, Math.hypot(pc - cx, pr - cy));
  }
  return best;
}

const RIVER_WAYPOINTS_FRAC = [[0, 0.34], [0.15, 0.26], [0.27, 0.34], [0.38, 0.29],
  [0.5, 0.28], [0.65, 0.32], [0.78, 0.29], [0.92, 0.33], [1, 0.36]];
const TRAIL_WAYPOINTS_FRAC = [[0.08, 0.68], [0.22, 0.58], [0.33, 0.66], [0.47, 0.57],
  [0.58, 0.68], [0.7, 0.6], [0.82, 0.7], [0.93, 0.6]];

function buildTerrain() {
  // Terrain is now a real hand-crafted background image (#map-bg, set in
  // CSS), not procedurally generated. This just sets the shared coordinate
  // frame (viewBox) that node markers, the fence/road overlay, and the
  // background image all line up against, and makes sure the old
  // procedural layers are empty so nothing leftover draws over the image.
  el("island-svg").setAttribute("viewBox", `0 0 ${ISO.totalW} ${ISO.totalH}`);
  el("overlay-svg").setAttribute("viewBox", `0 0 ${ISO.totalW} ${ISO.totalH}`);
  for (const id of ["island-tiles", "river-detail", "foam", "forest", "powerlines",
    "vehicles", "roads-paved", "city-blocks", "airstrip", "dock", "flags"]) {
    el(id).innerHTML = "";
  }
  for (const id of ["river-bank", "river-water", "tributary-bank", "tributary-water"]) {
    el(id).removeAttribute("d");
  }
}

function updateOverlay(nodes, entryNodeId) {
  const svg = el("overlay-svg");
  if (nodes.length === 0) { svg.innerHTML = ""; return; }
  const entry = nodes.find((n) => n.id === entryNodeId) || nodes[0];
  const [ex, ey] = nodeIso(entry);
  const roads = nodes
    .filter((n) => n.id !== entry.id)
    .map((n) => { const [x, y] = nodeIso(n); return `<path class="road" d="M${ex},${ey} L${x},${y}"/>`; })
    .join("");

  const pts = nodes.map(nodeIso);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const pad = 10 * DETAIL_SCALE;
  const postR = 0.9 * DETAIL_SCALE;
  const x0 = Math.max(2, Math.min(...xs) - pad), x1 = Math.min(ISO.totalW - 2, Math.max(...xs) + pad);
  const y0 = Math.max(2, Math.min(...ys) - pad), y1 = Math.min(ISO.totalH - 2, Math.max(...ys) + pad);
  const fence = `<rect class="fence" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>
    <circle class="fence-post" cx="${x0}" cy="${y0}" r="${postR}"/>
    <circle class="fence-post" cx="${x1}" cy="${y0}" r="${postR}"/>
    <circle class="fence-post" cx="${x0}" cy="${y1}" r="${postR}"/>
    <circle class="fence-post" cx="${x1}" cy="${y1}" r="${postR}"/>`;

  svg.innerHTML = roads + fence;
}

function renderMap(nodes, entryNodeId) {
  const layer = el("map-nodes");
  layer.innerHTML = "";
  for (const n of nodes) {
    const div = document.createElement("div");
    div.className = "node";
    if (n.known === 0) div.classList.add("unknown");
    if (n.up === false) div.classList.add("down");
    if (n.neutralised) div.classList.add("neutralised");
    if (n.id === entryNodeId) div.classList.add("entry");
    if (n.callsign === selectedCallsign) div.classList.add("selected");
    const [x, y] = nodePercent(n);
    div.style.left = x + "%";
    div.style.top = y + "%";
    const sprite = n.known ? (SPRITES[n.type] || SPRITES.generator) : FOG_SPRITE;
    const foothold = n.id === entryNodeId ? `<div class="n-foothold">FOOTHOLD</div>` : "";
    div.innerHTML = `
      ${foothold}
      <div class="sprite-wrap">
        <div class="corner tl"></div><div class="corner tr"></div>
        <div class="corner bl"></div><div class="corner br"></div>
        <svg class="sprite" viewBox="0 0 32 40" aria-hidden="true">${sprite}</svg>
      </div>
      <div class="n-bar"><div class="n-bar-fill"></div></div>
      <div class="n-name">${n.known ? n.name : n.callsign}</div>`;
    div.onclick = () => {
      selectedCallsign = n.callsign;
      renderMap(lastState.nodes, lastState.entry_node);
      input.value = `scan ${n.callsign} `;
      input.focus();
    };
    layer.appendChild(div);
  }
  updateOverlay(nodes, entryNodeId);
}

async function refresh() {
  const state = await api("/api/state");
  lastState = state;
  el("title").textContent = state.title;
  el("phase").textContent = state.phase_name;
  el("clock").textContent = fmtClock(state.minutes);
  renderMeters(state.meters);
  renderMap(state.nodes, state.entry_node);
  el("roll-btn").disabled = !armed;
  el("start-btn").disabled = state.started;
}

// ------------------------------------------------------------- commands

const HELP = [
  "available commands:",
  "  hosts                          list every host you have pivoted to",
  "  scan <callsign> [1|2|3]        1=identify 2=map-links 3=deep (default 1)",
  "  intel <callsign>                show what you already know",
  "  cards <callsign>                list available actions once mapped",
  "  run <callsign> <card>           arm an action, then ROLL to resolve it",
  "  roll                            resolve the armed scan or action",
  "  confirm                         commander approval for a flagged action",
  "  status                          show the clock and meters",
  "  clear                           clear the terminal",
];

async function handleCommand(raw) {
  const line = raw.trim();
  if (!line) return;
  print(`operator@field:~$ ${line}`, "prompt-echo");
  const [cmd, ...rest] = line.split(/\s+/);

  switch (cmd.toLowerCase()) {
    case "help":
      printBlock(HELP, "sys");
      break;
    case "clear":
      term.innerHTML = "";
      break;
    case "status": {
      const p = lastState.phase_name, m = fmtClock(lastState.minutes);
      print(`t+${m} -- phase: ${p}`, "sys");
      print(`noise ${lastState.meters.noise}/${lastState.meters.noise_lockdown}  trace ${lastState.meters.trace}/${lastState.meters.trace_attributed}`, "sys");
      break;
    }
    case "hosts": {
      if (!lastState.started) { print("start the operation first.", "err"); break; }
      if (lastState.nodes.length === 0) { print("no hosts pivoted to yet.", "warn"); break; }
      for (const n of lastState.nodes) {
        print(`  ${n.callsign.padEnd(12)} ${n.known ? n.name : "unidentified"}${n.id === lastState.entry_node ? "  (your foothold)" : ""}`, "sys");
      }
      break;
    }
    case "intel": {
      const n = findNode(rest[0]);
      if (!n) { print(`unknown or unreachable host: ${rest[0] || ""}`, "err"); break; }
      if (!n.known) { print(`no intel on ${n.callsign}. scan it first.`, "warn"); break; }
      print(`${nodeLabel(n)}`, "ok");
      print(`  type: ${n.type}`, "sys");
      if (n.desc) print(`  ${n.desc}`, "sys");
      if (n.service) print(`  service: ${n.service}`, "sys");
      print(`  status: ${n.up ? "powered" : "DOWN"}`, n.up ? "sys" : "err");
      if (n.notes) for (const t of Object.values(n.notes)) print(`  note: ${t}`, "hint");
      break;
    }
    case "cards": {
      const n = findNode(rest[0]);
      if (!n) { print(`unknown or unreachable host: ${rest[0] || ""}`, "err"); break; }
      if (!n.cards) { print(`no actions visible yet. run "scan ${n.callsign} 2" first.`, "warn"); break; }
      if (n.cards.length === 0) { print("no actions available at this site.", "sys"); break; }
      for (const cid of n.cards) {
        const c = await api(`/api/card/${cid}`);
        print(`  ${cid.padEnd(22)} noise ${c.noise}  trace ${c.trace}  recon ${c.recon}${c.needs_intel ? "  [needs exploit sheet]" : ""}`, "sys");
        print(`      ${c.text}`, "hint");
        print(`      trade-off: ${c.tradeoff}`, "hint");
      }
      break;
    }
    case "scan": {
      const n = findNode(rest[0]);
      if (!n) { print(`unknown or unreachable host: ${rest[0] || ""}`, "err"); break; }
      const level = { identify: 1, map: 2, deep: 3 }[rest[1]] || parseInt(rest[1], 10) || 1;
      armed = { kind: "scan", nodeId: n.id, level };
      print(`armed: scan (level ${level}) -> ${n.callsign}. type ROLL or press the button.`, "warn");
      el("roll-btn").disabled = false;
      break;
    }
    case "run": {
      const n = findNode(rest[0]);
      const cardId = rest[1];
      if (!n) { print(`unknown or unreachable host: ${rest[0] || ""}`, "err"); break; }
      if (!cardId) { print("usage: run <callsign> <card>", "err"); break; }
      armed = { kind: "run", nodeId: n.id, card: cardId };
      print(`armed: ${cardId} -> ${n.callsign}. type ROLL or press the button.`, "warn");
      el("roll-btn").disabled = false;
      break;
    }
    case "roll":
      await doRoll();
      break;
    case "confirm":
      await doConfirm();
      break;
    default:
      print(`unrecognised command: ${cmd}. type help.`, "err");
  }
}

async function doRoll() {
  if (!armed) { print("nothing armed. use scan or run first.", "err"); return; }
  const { roll } = await api("/api/roll");
  el("roll-result").textContent = roll;
  print(`die: ${roll}`, "ok");

  try {
    if (armed.kind === "scan") {
      const result = await api("/api/scan", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node: armed.nodeId, level: armed.level, roll }),
      });
      printTier(result);
      for (const d of result.discovered || []) {
        print(`  new host in range: ${d.callsign}`, "ok");
      }
    } else {
      const result = await api("/api/play", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node: armed.nodeId, card: armed.card, roll }),
      });
      printTier(result);
    }
  } catch (err) {
    if (err.status === 409) {
      print(`COMMANDER APPROVAL REQUIRED: ${err.message}`, "crit");
      print(`type "confirm" to proceed, or arm a different action.`, "warn");
      awaitingConfirm = { nodeId: armed.nodeId, card: armed.card, roll };
    } else {
      print(err.message, "err");
    }
  }
  armed = null;
  el("roll-btn").disabled = true;
  await refresh();
}

async function doConfirm() {
  if (!awaitingConfirm) { print("nothing waiting on confirmation.", "err"); return; }
  const { nodeId, card, roll } = awaitingConfirm;
  awaitingConfirm = null;
  try {
    const result = await api("/api/play", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ node: nodeId, card, roll, confirmed: true }),
    });
    printTier(result);
  } catch (err) {
    print(err.message, "err");
  }
  await refresh();
}

function printTier(result) {
  const cls = { fumble: "err", weak: "warn", partial: "warn", success: "ok", clean: "ok", critical: "crit" }[result.tier] || "sys";
  print(`result: ${result.tier.toUpperCase()}`, cls);
  if (result.bonus === "zero_day") print("  *** CRITICAL: a zero-day was uncovered. one-time use. ***", "crit");
  if (result.note === "exposed") print("  you were noticed. noise raised.", "err");
  print(`  noise now ${result.noise}, trace now ${result.trace}`, "sys");
}

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const v = input.value;
    input.value = "";
    handleCommand(v);
  }
});

el("roll-btn").onclick = doRoll;
el("start-btn").onclick = async () => {
  await api("/api/start", { method: "POST" });
  print("operation started. one foothold established -- type \"hosts\".", "ok");
  await refresh();
};

// -------------------------------------------------------------- map zoom/pan

(function setUpMapZoom() {
  const map = el("map");
  const viewport = el("map-viewport");
  const ZOOM_MIN = 0.5, ZOOM_MAX = 5;
  // Start zoomed in on the centre of the landmass rather than fit-to-screen --
  // the whole point is that it's too big to take in at a glance. "reset"
  // still zooms all the way out to see the whole country in one go.
  let zoom = 2.2, panX = 0, panY = 0;
  let dragging = false, dragStartX = 0, dragStartY = 0, dragMoved = false;

  function apply() {
    viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
  apply();
  function setZoom(nextZoom, cx, cy) {
    nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoom));
    if (cx !== undefined) {
      // keep the point under the cursor stationary while zooming
      const rect = map.getBoundingClientRect();
      const ox = cx - rect.left - rect.width / 2, oy = cy - rect.top - rect.height / 2;
      const ratio = nextZoom / zoom;
      panX = ox - (ox - panX) * ratio;
      panY = oy - (oy - panY) * ratio;
    }
    zoom = nextZoom;
    apply();
  }

  map.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setZoom(zoom * delta, e.clientX, e.clientY);
  }, { passive: false });

  map.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true; dragMoved = false;
    dragStartX = e.clientX - panX; dragStartY = e.clientY - panY;
    viewport.classList.add("dragging");
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const nx = e.clientX - dragStartX, ny = e.clientY - dragStartY;
    if (Math.abs(nx - panX) > 2 || Math.abs(ny - panY) > 2) dragMoved = true;
    panX = nx; panY = ny;
    apply();
  });
  window.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; viewport.classList.remove("dragging"); }
  });
  // suppress the node-select click that would otherwise fire right after a drag
  map.addEventListener("click", (e) => { if (dragMoved) { e.stopPropagation(); dragMoved = false; } }, true);

  el("zoom-in").onclick = () => setZoom(zoom * 1.3);
  el("zoom-out").onclick = () => setZoom(zoom / 1.3);
  el("zoom-reset").onclick = () => { zoom = 1; panX = 0; panY = 0; apply(); };

  // legend is pinned (lives outside #map-viewport, so zoom/pan never moves
  // it) and starts open; the toggle just hides it if it's in the way.
  el("legend-toggle").onclick = () => el("legend-pinned").classList.toggle("hidden");
})();

buildTerrain();
print("operation blackout -- field terminal", "sys");
print('type "help" for commands, or click a host on the map.', "sys");
refresh();
setInterval(refresh, 2000);
