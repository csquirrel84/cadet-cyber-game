let lastState = null;
let selectedCallsign = null;
let armed = null;      // { kind: 'scan'|'run', nodeId, level|card }
let awaitingConfirm = null; // { nodeId, card, roll }

const el = (id) => document.getElementById(id);
const term = el("term");
const input = el("cmd-input");

// --------------------------------------------------------- iso projection

const ISO = { cols: 52, rows: 52, tw: 3.4, th: 1.7, padX: 4, padTop: 4, padBottom: 14 };
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

const SPRITES = {
  "power station": isoBuilding(16, 32, 10, 5, 9, "#d99a3c", { nAcross: 3, nUp: 2, lit: "#ffd98a" }) +
    isoBlock(11, 24, 1.6, 1, 10, "#444") + isoBlock(20, 22, 1.6, 1, 12, "#444") +
    `<ellipse cx="11" cy="13" rx="1.4" ry="0.8" fill="#aaa" opacity="0.4"/>
     <ellipse cx="20" cy="9" rx="1.6" ry="0.9" fill="#aaa" opacity="0.35"/>
     <line x1="4" y1="27" x2="28" y2="27" stroke="#3a2c10" stroke-width="0.5" opacity="0.6"/>` +
    hazardStripes(16, 39, 14, "#1a1a1a", "#d9a73c"),
  substation: isoBuilding(16, 32, 9, 4.5, 6, "#8a8a8a", { windows: false }) +
    `<line x1="12" y1="18" x2="12" y2="26" stroke="#333" stroke-width="1"/>
     <line x1="20" y1="16" x2="20" y2="26" stroke="#333" stroke-width="1"/>
     <circle cx="12" cy="17" r="0.6" fill="#eee"/><circle cx="20" cy="15" r="0.6" fill="#eee"/>
     <polygon points="24,22 25.4,24.6 22.6,24.6" fill="#e0b020"/>` +
    isoBlock(9, 37, 1.4, 1, 2, "#777"),
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
    hazardStripes(11, 38, 7, "#1a1a1a", "#e0a020") + hazardStripes(21, 35, 7, "#1a1a1a", "#e0a020"),
  radar: isoBlock(16, 33, 6, 3, 6, "#6b6b6b") +
    `<ellipse cx="16" cy="22" rx="7" ry="2.5" fill="#3a9aa0" transform="rotate(-20 16 22)"/>
     <line x1="16" y1="27" x2="16" y2="24" stroke="#444" stroke-width="0.6"/>
     <line x1="13" y1="30" x2="16" y2="27" stroke="#444" stroke-width="0.4"/>
     <line x1="19" y1="30" x2="16" y2="27" stroke="#444" stroke-width="0.4"/>
     <circle cx="12" cy="29" r="0.5" fill="#e04040"/>`,
  "air base": isoBuilding(16, 33, 12, 6, 6, "#7a7a7a", { nAcross: 4, nUp: 1, lit: "#dfe8c0" }) +
    `<line x1="6" y1="33" x2="26" y2="33" stroke="#c7c75a" stroke-width="0.8"/>
     <circle cx="27" cy="27" r="0.6" fill="#e04040"/>
     <line x1="16" y1="21" x2="16" y2="27" stroke="#555" stroke-width="0.4"/>`,
  "air defence": isoBlock(16, 34, 8, 4, 6, "#3a4a2f") + isoBlock(16, 26, 1.4, 4, 5, "#2a3a22") +
    sandbags(16, 36.5, 8, "#8a7a4a") +
    `<ellipse cx="13" cy="30" rx="1.6" ry="1" fill="#2e3a22" opacity="0.5"/>
     <ellipse cx="19" cy="29" rx="1.3" ry="0.9" fill="#2e3a22" opacity="0.5"/>`,
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
     <path d="M27,37 l-1.4,-1 l1.4,-1 l-1.4,-1 l1.4,-1" stroke="#999" stroke-width="0.25" fill="none"/>`,
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
  return 38 + 6 * Math.sin(3 * theta + 1) + 4 * Math.cos(5 * theta + 0.5) + 3 * Math.sin(7 * theta + 2);
}

/** A node's pos is a 0-100 percent pair from the scenario file. Map it onto
 * the iso grid, then project to iso screen units (shared by tiles, roads,
 * fences and the HTML node markers so everything lines up). */
function nodeGrid(n) {
  return [(n.pos[0] / 100) * ISO.cols, (n.pos[1] / 100) * ISO.rows];
}
function nodeIso(n) {
  const [col, row] = nodeGrid(n);
  return [isoX(col, row), isoY(col, row)];
}
function nodePercent(n) {
  const [x, y] = nodeIso(n);
  return [(x / ISO.totalW) * 100, (y / ISO.totalH) * 100];
}

function classifyTile(col, row) {
  const px = (col / ISO.cols) * 100, py = (row / ISO.rows) * 100;
  const dx = px - 50, dy = py - 48;
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
  el("island-svg").setAttribute("viewBox", `0 0 ${ISO.totalW} ${ISO.totalH}`);
  el("overlay-svg").setAttribute("viewBox", `0 0 ${ISO.totalW} ${ISO.totalH}`);

  const rand = seededRandom(1337);
  const GRASS = ["tile-grass-a", "tile-grass-b", "tile-grass-c", "tile-grass-d"];
  const riverGrid = RIVER_WAYPOINTS_FRAC.map(([fc, fr]) => [fc * ISO.cols, fr * ISO.rows]);
  const trailGrid = TRAIL_WAYPOINTS_FRAC.map(([fc, fr]) => [fc * ISO.cols, fr * ISO.rows]);

  const tiles = [];
  const flecks = [];
  const grain = [];
  for (let row = 0; row < ISO.rows; row++) {
    for (let col = 0; col < ISO.cols; col++) {
      const kind = classifyTile(col, row);
      if (!kind) continue;
      const cc = col + 0.5, cr = row + 0.5;
      const p = [isoX(col, row), isoY(col, row), isoX(col + 1, row), isoY(col + 1, row),
        isoX(col + 1, row + 1), isoY(col + 1, row + 1), isoX(col, row + 1), isoY(col, row + 1)];
      const pts = `${p[0]},${p[1]} ${p[2]},${p[3]} ${p[4]},${p[5]} ${p[6]},${p[7]}`;
      let cls;
      const onTrail = kind === "grass" && distToPolyline(cc, cr, trailGrid) < 0.9;
      if (onTrail) {
        cls = rand() < 0.5 ? "tile-path-a" : "tile-path-b";
      } else if (kind === "grass") {
        const weights = [0.4, 0.3, 0.2, 0.1];
        let roll = rand(), acc = 0, idx = 0;
        for (let i = 0; i < weights.length; i++) { acc += weights[i]; if (roll <= acc) { idx = i; break; } }
        cls = GRASS[idx];
      } else if (kind === "sand") {
        cls = "tile-sand";
      } else {
        cls = "tile-reef";
      }
      tiles.push(`<polygon class="${cls}" points="${pts}"/>`);

      if (kind === "sand" && rand() < 0.4) {
        const mx = isoX(col + 0.2 + rand() * 0.6, row + 0.2 + rand() * 0.6);
        const my = isoY(col + 0.2 + rand() * 0.6, row + 0.2 + rand() * 0.6);
        flecks.push(`<circle class="sand-fleck" cx="${mx.toFixed(2)}" cy="${my.toFixed(2)}" r="${(0.15 + rand() * 0.2).toFixed(2)}"/>`);
      }
      if ((kind === "grass" || onTrail) && rand() < 0.22) {
        // fine grass-blade grain, 1-2 short ticks per tile
        const n = 1 + (rand() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const gx = isoX(col + 0.15 + rand() * 0.7, row + 0.15 + rand() * 0.7);
          const gy = isoY(col + 0.15 + rand() * 0.7, row + 0.15 + rand() * 0.7);
          const a = rand() * Math.PI;
          const dx2 = Math.cos(a) * 0.35, dy2 = Math.sin(a) * 0.18;
          grain.push(`<line class="grass-grain" x1="${(gx - dx2).toFixed(2)}" y1="${(gy - dy2).toFixed(2)}" x2="${(gx + dx2).toFixed(2)}" y2="${(gy + dy2).toFixed(2)}"/>`);
        }
      }
      if (kind === "grass" && !onTrail && rand() < 0.035) {
        const px2 = isoX(cc, cr);
        const py2 = isoY(cc, cr);
        flecks.push(`<ellipse class="pebble" cx="${px2.toFixed(2)}" cy="${py2.toFixed(2)}" rx="${(0.3 + rand() * 0.3).toFixed(2)}" ry="${(0.18 + rand() * 0.15).toFixed(2)}"/>`);
      }
    }
  }
  el("island-tiles").innerHTML = tiles.join("") + grain.join("") + flecks.join("");

  // forest clusters on open grass, away from the map edges and the trail
  const clusters = [];
  for (let i = 0; i < 16; i++) {
    clusters.push({ col: 5 + rand() * 42, row: 5 + rand() * 42, r: 3.5 + rand() * 6 });
  }
  const trees = [];
  const rocks = [];
  const bushes = [];
  const ferns = [];
  const logs = [];
  for (let row = 0; row < ISO.rows; row++) {
    for (let col = 0; col < ISO.cols; col++) {
      const kind = classifyTile(col, row);
      const cc = col + 0.5, cr = row + 0.5;
      if (kind === "sand" && rand() < 0.12) {
        const jx = isoX(cc, cr), jy = isoY(cc, cr);
        rocks.push(`<ellipse class="rock" cx="${jx.toFixed(2)}" cy="${(jy + 0.3).toFixed(2)}" rx="1" ry="0.5"/>
          <ellipse class="rock-top" cx="${jx.toFixed(2)}" cy="${jy.toFixed(2)}" rx="0.8" ry="0.5"/>`);
        continue;
      }
      if (kind !== "grass") continue;
      if (distToPolyline(cc, cr, trailGrid) < 0.7) continue;
      const inForest = clusters.some((c) => Math.hypot(col - c.col, row - c.row) < c.r);
      if (inForest && rand() < 0.72) {
        const jc = cc + (rand() - 0.5) * 0.6, jr = cr + (rand() - 0.5) * 0.6;
        const jx = isoX(jc, jr), jy = isoY(jc, jr);
        const roll = rand();
        const s = roll < 0.2 ? 1.3 : roll < 0.55 ? 0.95 : 0.6;
        const pine = rand() < 0.65;
        const topFill = pine ? "tree-top" : "tree-top-b";
        const midFill = pine ? "tree-mid" : "tree-mid-b";
        trees.push(
          `<ellipse class="tree-shadow" cx="${(jx + 0.6).toFixed(2)}" cy="${(jy + 0.5).toFixed(2)}" rx="${(1.6 * s).toFixed(2)}" ry="${(0.6 * s).toFixed(2)}"/>` +
          `<rect class="tree-trunk" x="${(jx - 0.2 * s).toFixed(2)}" y="${(jy - 1.4 * s).toFixed(2)}" width="${(0.4 * s).toFixed(2)}" height="${(1.4 * s).toFixed(2)}"/>` +
          `<polygon class="${midFill}" points="${jx - 1.8 * s},${jy - 1.2 * s} ${jx + 1.8 * s},${jy - 1.2 * s} ${jx},${jy - 3.4 * s}"/>` +
          `<polygon class="${topFill}" points="${jx - 1.3 * s},${jy - 2.8 * s} ${jx + 1.3 * s},${jy - 2.8 * s} ${jx},${jy - 5 * s}"/>` +
          (pine && s > 0.9 ? `<polygon class="${topFill}" points="${jx - 0.9 * s},${jy - 4.2 * s} ${jx + 0.9 * s},${jy - 4.2 * s} ${jx},${jy - 6 * s}"/>` : "")
        );
        if (rand() < 0.3) {
          const fx = isoX(jc + (rand() - 0.5) * 1.2, jr + (rand() - 0.5) * 1.2);
          const fy = isoY(jc + (rand() - 0.5) * 1.2, jr + (rand() - 0.5) * 1.2);
          ferns.push(`<path class="fern" d="M${fx},${fy} q-0.8,-0.9 -0.3,-1.8 M${fx},${fy} q0.9,-0.8 0.4,-1.8 M${fx},${fy} q0,-1.1 0,-2"/>`);
        }
        if (rand() < 0.06) {
          const lx = isoX(jc + (rand() - 0.5) * 1.5, jr + (rand() - 0.5) * 1.5);
          const ly = isoY(jc + (rand() - 0.5) * 1.5, jr + (rand() - 0.5) * 1.5);
          const ang = rand() * 40 - 20;
          logs.push(`<rect class="log" x="${(lx - 1.6).toFixed(2)}" y="${(ly - 0.25).toFixed(2)}" width="3.2" height="0.5" rx="0.25" transform="rotate(${ang.toFixed(1)} ${lx.toFixed(2)} ${ly.toFixed(2)})"/>`);
        }
      } else if (!inForest && rand() < 0.07) {
        const jx = isoX(cc, cr), jy = isoY(cc, cr);
        bushes.push(`<ellipse class="bush-shadow" cx="${(jx + 0.3).toFixed(2)}" cy="${(jy + 0.1).toFixed(2)}" rx="1.3" ry="0.5"/>
          <ellipse class="bush" cx="${jx.toFixed(2)}" cy="${(jy - 0.4).toFixed(2)}" rx="1.1" ry="0.8"/>
          <ellipse class="bush-hi" cx="${(jx - 0.3).toFixed(2)}" cy="${(jy - 0.7).toFixed(2)}" rx="0.5" ry="0.35"/>`);
      } else if (!inForest && rand() < 0.1) {
        const fx = isoX(cc + (rand() - 0.5) * 0.5, cr + (rand() - 0.5) * 0.5);
        const fy = isoY(cc + (rand() - 0.5) * 0.5, cr + (rand() - 0.5) * 0.5);
        ferns.push(`<path class="fern" d="M${fx},${fy} q-0.7,-0.8 -0.25,-1.6 M${fx},${fy} q0.8,-0.7 0.35,-1.6 M${fx},${fy} q0,-1 0,-1.8"/>`);
      }
    }
  }
  el("forest").innerHTML = rocks.join("") + bushes.join("") + logs.join("") + ferns.join("") + trees.join("");

  // a river running roughly west-east through the island, with ripples and foam
  const waypoints = riverGrid.map(([c, r]) => [isoX(c, r), isoY(c, r)]);
  const d = "M" + waypoints.map((p) => p.join(",")).join(" L");
  el("river-bank").setAttribute("d", d);
  el("river-water").setAttribute("d", d);

  const ripples = [];
  const reeds = [];
  for (let col = 1; col < ISO.cols - 1; col += 0.7) {
    const nearestRow = (() => {
      // find the row fraction of the river at this column by linear interpolation
      for (let i = 0; i < riverGrid.length - 1; i++) {
        const [c0] = riverGrid[i], [c1] = riverGrid[i + 1];
        if (col >= c0 && col <= c1) {
          const t = (col - c0) / (c1 - c0 || 1);
          return riverGrid[i][1] + (riverGrid[i + 1][1] - riverGrid[i][1]) * t;
        }
      }
      return null;
    })();
    if (nearestRow === null) continue;
    if (rand() < 0.4) {
      const rx = isoX(col, nearestRow), ry = isoY(col, nearestRow);
      const off = (rand() - 0.5) * 1.6;
      ripples.push(`<ellipse class="ripple" cx="${(rx + off).toFixed(2)}" cy="${(ry + off * 0.5).toFixed(2)}" rx="${(0.8 + rand() * 0.6).toFixed(2)}" ry="${(0.25 + rand() * 0.15).toFixed(2)}"/>`);
    }
    if (rand() < 0.15) {
      const side = rand() < 0.5 ? -1 : 1;
      const rx = isoX(col, nearestRow + side * 1.3), ry = isoY(col, nearestRow + side * 1.3);
      if (rand() < 0.5) {
        reeds.push(`<path class="reed" d="M${rx},${ry} q0.2,-1.4 -0.1,-2.3 M${rx + 0.3},${ry} q-0.1,-1.3 0.3,-2.1 M${rx - 0.3},${ry} q0.3,-1.1 -0.2,-1.9"/>`);
      } else {
        reeds.push(`<ellipse class="lilypad" cx="${rx.toFixed(2)}" cy="${ry.toFixed(2)}" rx="1" ry="0.45"/>`);
      }
    }
  }
  el("river-detail").innerHTML = ripples.join("") + reeds.join("");

  // shoreline foam where sand meets reef
  const foam = [];
  for (let row = 0; row < ISO.rows; row++) {
    for (let col = 0; col < ISO.cols; col++) {
      if (classifyTile(col, row) !== "sand") continue;
      if (classifyTile(col + 1, row) === "reef" || classifyTile(col, row + 1) === "reef" ||
        classifyTile(col - 1, row) === "reef" || classifyTile(col, row - 1) === "reef") {
        if (rand() < 0.5) {
          const fx = isoX(col + 0.5, row + 0.5), fy = isoY(col + 0.5, row + 0.5);
          foam.push(`<circle class="foam" cx="${fx.toFixed(2)}" cy="${fy.toFixed(2)}" r="${(0.25 + rand() * 0.25).toFixed(2)}"/>`);
        }
      }
    }
  }
  el("foam").innerHTML = foam.join("");
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
  const pad = 10;
  const x0 = Math.max(2, Math.min(...xs) - pad), x1 = Math.min(ISO.totalW - 2, Math.max(...xs) + pad);
  const y0 = Math.max(2, Math.min(...ys) - pad), y1 = Math.min(ISO.totalH - 2, Math.max(...ys) + pad);
  const fence = `<rect class="fence" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>
    <circle class="fence-post" cx="${x0}" cy="${y0}" r="0.9"/>
    <circle class="fence-post" cx="${x1}" cy="${y0}" r="0.9"/>
    <circle class="fence-post" cx="${x0}" cy="${y1}" r="0.9"/>
    <circle class="fence-post" cx="${x1}" cy="${y1}" r="0.9"/>`;

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

buildTerrain();
print("operation blackout -- field terminal", "sys");
print('type "help" for commands, or click a host on the map.', "sys");
refresh();
setInterval(refresh, 2000);
