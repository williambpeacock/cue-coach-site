// A drill's table, drawn from its spec (the drills table's spec column, as drills.json).
// Copied from Drill Manager (Cue Coach Android tools/drill_manager.html, tableSvg), which draws
// like the phones' DrillTable.kt / DrillListView.swift; change them together (2026-11-27).
// Colours come from CSS: --rail, --felt, --pocket, --orange.
(() => {
const DT_BALL_DIAMONDS = 0.18;  // one ball in diamonds (9 ft table)
const num = (v) => typeof v === "number" && isFinite(v);
const ok = (p) => Array.isArray(p) && num(p[0]) && num(p[1]);
const RAIL = 0.35, BALL = 0.11, POCKET = 0.2, LEN = 8, WID = 4;
const POCKETS = {
  "top-left corner": [0, 0], "top-right corner": [0, 4], "bottom-left corner": [8, 0],
  "bottom-right corner": [8, 4], "left side": [4, 0], "right side": [4, 4],
};
function tableSvg(d, opts = {}) {
  const across = WID + 2 * RAIL, along = LEN + 2 * RAIL;
  const at = p => [RAIL + p[1], RAIL + p[0]];  // x along the table runs down the drawing
  const pocket = POCKETS[(d.pocket || "").trim().toLowerCase()];
  const s = [];
  s.push(`<svg viewBox="0 0 ${across} ${along}" xmlns="http://www.w3.org/2000/svg" ${opts.id ? `id="${opts.id}"` : ""}>`);
  s.push(`<rect width="${across}" height="${along}" rx="${RAIL * 0.6}" fill="var(--rail)"/>`);
  s.push(`<rect x="${RAIL}" y="${RAIL}" width="${WID}" height="${LEN}" fill="var(--felt)"/>`);
  const mid = RAIL / 2;
  for (let x = 1; x < LEN; x++) if (x !== LEN / 2) {
    s.push(`<circle cx="${mid}" cy="${RAIL + x}" r=".045" fill="#f0f0f0"/><circle cx="${across - mid}" cy="${RAIL + x}" r=".045" fill="#f0f0f0"/>`);
  }
  for (let y = 1; y < WID; y++) {
    s.push(`<circle cx="${RAIL + y}" cy="${mid}" r=".045" fill="#f0f0f0"/><circle cx="${RAIL + y}" cy="${along - mid}" r=".045" fill="#f0f0f0"/>`);
  }
  if (opts.grid) {  // faint diamond grid, to help place balls
    for (let x = 0.5; x < LEN; x += 0.5) s.push(`<line x1="${RAIL}" x2="${RAIL + WID}" y1="${RAIL + x}" y2="${RAIL + x}" stroke="#fff" stroke-opacity="${x % 1 ? .04 : .09}" stroke-width=".015"/>`);
    for (let y = 0.5; y < WID; y += 0.5) s.push(`<line y1="${RAIL}" y2="${RAIL + LEN}" x1="${RAIL + y}" x2="${RAIL + y}" stroke="#fff" stroke-opacity="${y % 1 ? .04 : .09}" stroke-width=".015"/>`);
  }
  Object.values(POCKETS).forEach(p => { const [cx, cy] = at(p); s.push(`<circle cx="${cx}" cy="${cy}" r="${POCKET}" fill="var(--pocket)"/>`); });
  if (pocket) { const [cx, cy] = at(pocket); s.push(`<circle cx="${cx}" cy="${cy}" r="${POCKET * 1.35}" fill="none" stroke="var(--orange)" stroke-width=".06"/>`); }
  if (ok(d.zone)) {
    const [cx, cy] = at(d.zone);
    if (num(d.near_radius)) {
      s.push(`<circle cx="${cx}" cy="${cy}" r="${d.near_radius}" fill="#f0f0f0" fill-opacity=".08"/>`);
      s.push(`<circle cx="${cx}" cy="${cy}" r="${d.near_radius}" fill="none" stroke="#f0f0f0" stroke-opacity=".6" stroke-width=".03" stroke-dasharray=".12 .08"/>`);
    }
    s.push(`<circle cx="${cx}" cy="${cy}" r="${num(d.zone_radius) ? d.zone_radius : BALL * 2}" fill="var(--orange)" fill-opacity=".3"/>`);
  }
  const legs = [d.cue_ball, d.object_ball, ok(d.object_ball) ? pocket : null].filter(ok);
  for (let i = 0; i + 1 < legs.length; i++) {
    const [x1, y1] = at(legs[i]), [x2, y2] = at(legs[i + 1]);
    s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9a9da2" stroke-width=".03" stroke-dasharray=".1 .08"/>`);
  }
  // Preview only (the app doesn't draw these): the contact spot ("ghost ball") for Stop and Stun
  // drills, and for a Stun the cue ball's path after impact, at right angles to the object
  // ball's path (Billy, 2026-11-15), drawn to the rail.
  const g = ghost(d);
  if (g && (d.shot_type === "Stop" || d.shot_type === "Stun")) {
    const [gx, gy] = at(g.spot), bd = DT_BALL_DIAMONDS;
    s.push(`<circle cx="${gx}" cy="${gy}" r="${bd / 2}" fill="none" stroke="#f0f0f0" stroke-opacity=".7" stroke-width=".02" stroke-dasharray=".04 .03"/>`);
    if (d.shot_type === "Stun" && ok(d.cue_ball)) {
      let p = [-g.u[1], g.u[0]];
      const v = [g.spot[0] - d.cue_ball[0], g.spot[1] - d.cue_ball[1]];
      const side = p[0] * v[0] + p[1] * v[1];
      if (side < 0) p = [-p[0], -p[1]];
      // Straight in (under about 1°): the cue ball stops, so there is no path to draw.
      if (Math.abs(side) < 0.0175 * Math.hypot(v[0], v[1])) p = [0, 0];
      const ts = [p[0] > 0 ? (LEN - g.spot[0]) / p[0] : p[0] < 0 ? -g.spot[0] / p[0] : Infinity,
                  p[1] > 0 ? (WID - g.spot[1]) / p[1] : p[1] < 0 ? -g.spot[1] / p[1] : Infinity];
      const t = Math.min(...ts);
      if (isFinite(t) && t > 0) {
        const [ex, ey] = at([g.spot[0] + p[0] * t, g.spot[1] + p[1] * t]);
        s.push(`<line x1="${gx}" y1="${gy}" x2="${ex}" y2="${ey}" stroke="#f0f0f0" stroke-opacity=".75" stroke-width=".03" stroke-dasharray=".06 .06"/>`);
      }
    }
  }
  // The cue ball's path of travel (export_drills.cue_path): a dotted line through its points.
  const path = (d.path || []).filter(ok).map(at);
  if (path.length > 1) s.push(`<polyline points="${path.map(p => p.join(",")).join(" ")}" fill="none" stroke="#f0f0f0" stroke-opacity=".75" stroke-width=".035" stroke-linecap="round" stroke-dasharray=".001 .09"/>`);
  // A many-ball layout (export_drills.layout): each ball's line to its pocket, the pockets used
  // ringed, the cue ball line (in hand anywhere on it) with a cue ball in its middle.
  const balls = (d.balls || []).filter(b => ok(b.at));
  const used = [...new Set(balls.map(b => (b.pocket || "").toLowerCase()))].map(n => POCKETS[n]).filter(Boolean);
  used.forEach(p => { if (p !== pocket) { const [cx, cy] = at(p); s.push(`<circle cx="${cx}" cy="${cy}" r="${POCKET * 1.35}" fill="none" stroke="var(--orange)" stroke-width=".06"/>`); } });
  balls.forEach(b => {
    const p = POCKETS[(b.pocket || "").toLowerCase()];
    if (!p) return;
    const [x1, y1] = at(b.at), [x2, y2] = at(p);
    s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9a9da2" stroke-opacity=".45" stroke-width=".02" stroke-dasharray=".1 .08"/>`);
  });
  if (Array.isArray(d.cue_line) && ok(d.cue_line[0]) && ok(d.cue_line[1])) {
    const [x1, y1] = at(d.cue_line[0]), [x2, y2] = at(d.cue_line[1]);
    s.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#f0f0f0" stroke-opacity=".7" stroke-width=".03" stroke-dasharray=".12 .08"/>`);
    const [cx, cy] = at([(d.cue_line[0][0] + d.cue_line[1][0]) / 2, (d.cue_line[0][1] + d.cue_line[1][1]) / 2]);
    s.push(`<circle cx="${cx}" cy="${cy}" r="${BALL}" fill="#f0f0f0"/>`);
  }
  // Each ball's cue ball zone (export_drills.ball_zones): a band across the table, numbered on the
  // left, or on the right with "R" when it is reached off the foot rail.
  const zoned = balls.filter(b => Array.isArray(b.zone));
  zoned.forEach(b => {
    const k = balls.indexOf(b) + 1, left = !b.rail;
    const [x1, y1] = at([b.zone[0], 0]), [x2, y2] = at([b.zone[1], WID]);
    s.push(`<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="var(--orange)" fill-opacity="${k % 2 ? .2 : .1}" stroke="var(--orange)" stroke-opacity=".7" stroke-width=".015"${b.rail ? ' stroke-dasharray=".06 .04"' : ""}/>`);
    const ty = (y1 + y2) / 2 + 0.05, tx = left ? RAIL / 2 : across - RAIL / 2;
    s.push(`<text x="${tx}" y="${ty}" font-size=".16" text-anchor="middle" fill="#f0f0f0">${k}${b.rail ? "R" : ""}</text>`);
  });
  balls.forEach((b, i) => {
    const [cx, cy] = at(b.at);
    s.push(`<circle cx="${cx}" cy="${cy}" r="${BALL}" fill="var(--orange)"/>`);
    if (zoned.length || d.numbered) s.push(`<text x="${cx}" y="${cy - BALL - .05}" font-size=".14" text-anchor="middle" fill="#f0f0f0">${i + 1}</text>`);
  });
  if (ok(d.object_ball)) { const [cx, cy] = at(d.object_ball); s.push(`<circle cx="${cx}" cy="${cy}" r="${BALL}" fill="var(--orange)"/>`); }
  if (ok(d.cue_ball)) { const [cx, cy] = at(d.cue_ball); s.push(`<circle cx="${cx}" cy="${cy}" r="${BALL}" fill="#f0f0f0"/>`); }
  s.push(`</svg>`);
  return s.join("");
}
// The contact spot (export_drills.contact): one ball width behind the object ball on its line to the pocket.
function ghost(d) {
  const pocket = POCKETS[(d.pocket || "").trim().toLowerCase()];
  if (!ok(d.object_ball) || !pocket) return null;
  const dx = pocket[0] - d.object_ball[0], dy = pocket[1] - d.object_ball[1], n = Math.hypot(dx, dy);
  if (!n) return null;
  const u = [dx / n, dy / n], bd = DT_BALL_DIAMONDS;
  return {spot: [d.object_ball[0] - bd * u[0], d.object_ball[1] - bd * u[1]], u};
}
window.drillTableSvg = tableSvg;
})();
