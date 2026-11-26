// ---- Admin Dashboard (Billy, 2026-11-15): player engagement, admins only.
// The numbers come from one Supabase call, admin_dashboard(from, to) (migration
// 20261123100000_admin_dashboard.sql), which refuses anyone who isn't an admin. This page adds them
// up by day, week or month, compares with the period before, and leaves the team out unless asked.
// Uses index.html's helpers ($, esc, db, mock, show, status, fromMock, legendHtml, isoDay, dayOf, todayIso, card).

const DASH = { range: 30, group: "day", team: false, data: null, charts: [] };
try { Object.assign(DASH, JSON.parse(localStorage.getItem("dash-view") || "{}"), { data: null, charts: [] }); } catch (_) {}

// Activity colors: the validated dark categorical order (same family as the drill colors).
const ACTIVITIES = [
  ["practice", "Practice shots", "#3987e5"],
  ["session", "Several-shot sessions", "#d95926"],
  ["drill", "Drill shots", "#199e70"],
  ["test", "Coaching test shots", "#c98500"],
  ["booth", "Booth visitors", "#d55181"],
];
const NEW_C = "#d95926", RETURNING_C = "#3987e5", ONE_C = "#3987e5", MUTED_C = "#7c7c85";
// The app's shot types (Android ShotIntent.kt): Developer-screen shots made on purpose to test the analysis.
const INTENTS = {
  N: ["Normal", "Normal"], TWL: ["Twist left", "Spin and twist"], TWR: ["Twist right", "Spin and twist"],
  TOP: ["Top spin", "Spin and twist"], BOT: ["Bottom spin", "Spin and twist"], LSP: ["Left spin", "Spin and twist"],
  RSP: ["Right spin", "Spin and twist"], NSA: ["No settle at address", "Timing"], RBS: ["Rushed backswing", "Timing"],
  NOP: ["No pause", "Timing"], LPS: ["Long pause", "Timing"], RSH: ["Rushed forward stroke", "Timing"],
  CON: ["Constant speed", "Timing"], ACC: ["Accelerate into the ball", "Timing"], DEC: ["Let up into the ball", "Timing"],
  JAB: ["Jab", "Timing"], SFT: ["Short follow-through", "Timing"], TNS: ["Tense finish", "Timing"],
  SUE: ["Stand up early", "Timing"], STL: ["Steer tip left", "Straightness"], STR: ["Steer tip right", "Straightness"],
  WBS: ["Side wobble", "Straightness"], WBU: ["Up/down wobble", "Straightness"], CBC: ["Crooked backswing, corrected", "Straightness"],
  CBN: ["Crooked backswing, not corrected", "Straightness"], ELB: ["Elbow drop", "Straightness"],
  EBS: ["Elbow drop, off line", "Straightness"], FSL: ["Follow-through swings left", "Straightness"],
  FSR: ["Follow-through swings right", "Straightness"], BRG: ["Bridge-assisted", "Straightness"],
};
const intentOf = (code) => {
  if (/^N\b/.test(code)) return ["Normal", "Normal"];
  return INTENTS[code] || INTENTS[code.toUpperCase()] || [code, "Older labels"];
};
const COACHING_ACTIONS = [
  ["invite_sent", "Coach invites sent"], ["invite_accepted", "Invites accepted"], ["assigned", "Drills assigned"],
  ["test_started", "Tests started"], ["test_sent", "Tests handed in"], ["test_reviewed", "Tests reviewed"],
  ["feedback_sent", "Feedback sent"], ["comment_added", "Coach comments"],
];

const addDays = (iso, n) => { const d = dayOf(iso); d.setDate(d.getDate() + n); return isoDay(d); };
function bucketOf(iso, group) {
  if (group === "day") return iso;
  const d = dayOf(iso);
  if (group === "month") return iso.slice(0, 7) + "-01";
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));  // Monday
  return isoDay(d);
}
function bucketLabel(key, group, long = false) {
  const d = dayOf(key);
  if (group === "month") return d.toLocaleDateString([], { month: long ? "long" : "short", year: "numeric" });
  if (group === "week") return (long ? "Week of " : "") + d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], long ? { weekday: "long", month: "short", day: "numeric" } : { month: "short", day: "numeric" });
}
function bucketsBetween(from, to, group) {
  const out = [];
  for (let k = bucketOf(from, group); k <= to; ) {
    out.push(k);
    if (group === "day") k = addDays(k, 1);
    else if (group === "week") k = addDays(k, 7);
    else { const d = dayOf(k); d.setMonth(d.getMonth() + 1); k = isoDay(d); }
  }
  return out;
}
const sum = (list, f) => list.reduce((a, r) => a + Number(f(r) || 0), 0);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);

$("dash-link").onclick = () => loadDashboard();
$("dash-back").onclick = () => loadTeam();
document.querySelectorAll("#dash-range button").forEach((b) => (b.onclick = () => { DASH.range = Number(b.dataset.v); saveView(); drawDashboard(); }));
document.querySelectorAll("#dash-group button").forEach((b) => (b.onclick = () => { DASH.group = b.dataset.v; saveView(); drawDashboard(); }));
$("dash-team").onchange = () => { DASH.team = $("dash-team").checked; saveView(); drawDashboard(); };
$("dash-refresh").onclick = () => loadDashboard(true);
function saveView() { try { localStorage.setItem("dash-view", JSON.stringify({ range: DASH.range, group: DASH.group, team: DASH.team })); } catch (_) {} }

async function loadDashboard(again = false) {
  setAddr("#team/dashboard");
  show("who", "dash");
  $("title").textContent = "Dashboard";
  if (DASH.data && !again) return drawDashboard();
  status("Loading…");
  try {
    // Two years back covers the longest range and the one before it.
    if (mock) DASH.data = await fromMock("admin_dashboard");
    else {
      const { data, error } = await db.rpc("admin_dashboard", { p_from: addDays(todayIso(), -760), p_to: todayIso() });
      if (error) throw new Error(error.message === "admins only" ? "The Dashboard is for admins only." : error.message);
      DASH.data = data;
    }
    status("");
    drawDashboard();
  } catch (e) { status(e.message, true); }
}

function drawDashboard() {
  const D = DASH.data;
  if (!D) return;
  document.querySelectorAll("#dash-range button").forEach((b) => b.setAttribute("aria-pressed", Number(b.dataset.v) === DASH.range));
  document.querySelectorAll("#dash-group button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.v === DASH.group));
  $("dash-team").checked = DASH.team;
  DASH.charts.forEach((c) => c.destroy()); DASH.charts = [];

  const people = Object.fromEntries(D.people.map((p) => [p.pid, p]));
  const counted = (pid) => DASH.team || !(people[pid]?.team);
  const to = todayIso(), from = addDays(to, -(DASH.range - 1));
  const prevTo = addDays(from, -1), prevFrom = addDays(prevTo, -(DASH.range - 1));
  const days = D.player_days.filter((r) => counted(r.pid));
  const cur = days.filter((r) => r.day >= from && r.day <= to);
  const prev = days.filter((r) => r.day >= prevFrom && r.day <= prevTo);
  const active = (list) => new Set(list.filter((r) => r.shots > 0 || r.drill_shots > 0).map((r) => r.pid));
  const newIn = (a, b) => D.people.filter((p) => counted(p.pid) && p.first_shot_day >= a && p.first_shot_day <= b);
  const events = D.coaching.map((e) => ({ ...e, day: isoDay(new Date(e.at)) }));
  const evIn = (a, b, act) => events.filter((e) => e.day >= a && e.day <= b && (!act || e.action === act)).length;
  $("dash-note").textContent = `${dayOf(from).toLocaleDateString([], { month: "short", day: "numeric" })} to today` +
    (DASH.team ? ", team included" : ", players only (admins, staff and test logins left out)") +
    `. Updated ${new Date(D.made_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;

  // ---- Headline numbers, against the same number of days before.
  // Against fewer than 20 before, a percentage misleads (1 → 78 is "7700%"), so the difference is shown instead.
  const change = (a, b, f = (n) => n.toLocaleString()) => {
    if (b == null || a == null) return "";
    const cls = a > b ? "up" : a < b ? "down" : "flat", arrow = a > b ? "▲" : a < b ? "▼" : "=";
    if (a === b) return `<span class="flat">= same as the ${DASH.range} days before</span>`;
    const by = b >= 20 ? `${Math.abs(Math.round(((a - b) / b) * 100))}%` : f(Math.abs(a - b));
    return `<span class="${cls}">${arrow} ${by}</span> vs ${f(b)} before`;
  };
  const shots = sum(cur, (r) => r.shots), shotsPrev = sum(prev, (r) => r.shots);
  const act = active(cur).size, actPrev = active(prev).size;
  const nw = newIn(from, to).length, nwPrev = newIn(prevFrom, prevTo).length;
  const mins = Math.round(sum(cur, (r) => r.active_minutes)), minsPrev = Math.round(sum(prev, (r) => r.active_minutes));
  const made = sum(cur, (r) => r.drill_made), dshots = sum(cur, (r) => r.drill_shots);
  const madePrev = pct(sum(prev, (r) => r.drill_made), sum(prev, (r) => r.drill_shots));
  const tests = evIn(from, to, "test_sent"), testsPrev = evIn(prevFrom, prevTo, "test_sent");
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
  $("dash-cards").innerHTML = [
    card("Shots", shots.toLocaleString(), change(shots, shotsPrev)),
    card("Active players", act, change(act, actPrev)),
    card("New players", nw, change(nw, nwPrev)),
    card("Practice time", hm(mins), change(mins, minsPrev, hm)),
    card("Shots per player", act ? Math.round(shots / act) : "–", actPrev ? `${Math.round(shotsPrev / actPrev)} before` : ""),
    card("Drill shots made", dshots ? `${pct(made, dshots)}%` : "–", dshots ? `${made} of ${dshots}${madePrev != null ? ` · ${madePrev}% before` : ""}` : "no drill sets"),
    card("Tests handed in", tests, change(tests, testsPrev)),
  ].join("");

  // ---- Per period.
  const keys = bucketsBetween(from, to, DASH.group);
  const per = Object.fromEntries(keys.map((k) => [k, { rows: [], ev: [] }]));
  cur.forEach((r) => per[bucketOf(r.day, DASH.group)]?.rows.push(r));
  events.filter((e) => e.day >= from && e.day <= to).forEach((e) => per[bucketOf(e.day, DASH.group)]?.ev.push(e));
  const labels = keys.map((k) => bucketLabel(k, DASH.group));
  const longLabel = (i) => bucketLabel(keys[i], DASH.group, true);
  const B = keys.map((k) => {
    const rows = per[k].rows, a = active(rows);
    const firsts = new Set(D.people.filter((p) => counted(p.pid) && p.first_shot_day && bucketOf(p.first_shot_day, DASH.group) === k).map((p) => p.pid));
    const o = { key: k, shots: sum(rows, (r) => r.shots), players: a.size, newp: [...a].filter((p) => firsts.has(p)).length,
      minutes: Math.round(sum(rows, (r) => r.active_minutes)), sets: sum(rows, (r) => r.drill_sets), dshots: sum(rows, (r) => r.drill_shots),
      made: sum(rows, (r) => r.drill_made), recordings: sum(rows, (r) => r.recordings), ok: sum(rows, (r) => r.measured_ok),
      nostroke: sum(rows, (r) => r.no_stroke), failed: sum(rows, (r) => r.refused_or_failed), notm: sum(rows, (r) => r.not_measured),
      lowc: sum(rows, (r) => r.low_confidence), uncal: sum(rows, (r) => r.uncalibrated), errs: sum(rows, (r) => r.stroke_errors) };
    ACTIVITIES.forEach(([k2]) => (o[k2] = sum(rows, (r) => r[k2])));
    COACHING_ACTIONS.forEach(([k2]) => (o[k2] = per[k].ev.filter((e) => e.action === k2).length));
    return o;
  });

  const tick = { color: "#b4b4bb" }, grid = { color: "#3a3a40" };
  const maxTicks = DASH.group === "day" ? (DASH.range <= 30 ? 10 : 12) : 12;
  const bar = (id, datasets, opts = {}) => {
    datasets.forEach((d) => Object.assign(d, { borderColor: "#34343a", borderWidth: datasets.length > 1 ? { top: 2 } : 0,
      borderSkipped: "bottom", borderRadius: 4, maxBarThickness: 24, stack: "s" }, d));
    const totals = keys.map((_, i) => datasets.reduce((a, d) => a + (d.data[i] || 0), 0));
    DASH.charts.push(new Chart($(id), {
      type: "bar", data: { labels, datasets },
      options: { maintainAspectRatio: false, animation: { duration: 200 }, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { filter: (it) => it.raw > 0 || datasets.length === 1,
          callbacks: { title: (it) => `${longLabel(it[0].dataIndex)}${datasets.length > 1 ? `: ${totals[it[0].dataIndex].toLocaleString()}${opts.unit || ""}` : ""}`,
                       label: (it) => ` ${it.dataset.label}: ${it.raw.toLocaleString()}${opts.unit || ""}` } } },
        scales: { x: { stacked: true, ticks: { ...tick, autoSkip: true, maxTicksLimit: maxTicks, maxRotation: 0 }, grid: { display: false } },
                  y: { stacked: true, beginAtZero: true, ticks: { ...tick, precision: 0 }, grid, ...(opts.y || {}) } } },
    }));
  };
  const line = (id, label, data, opts = {}) => DASH.charts.push(new Chart($(id), {
    type: "line", data: { labels, datasets: [{ label, data, borderColor: ONE_C, backgroundColor: ONE_C, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5, spanGaps: true, tension: 0.2 }] },
    options: { maintainAspectRatio: false, animation: { duration: 200 }, interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => longLabel(it[0].dataIndex), label: (it) => ` ${label}: ${it.raw == null ? "–" : it.raw}${opts.unit || ""}` } } },
      scales: { x: { ticks: { ...tick, autoSkip: true, maxTicksLimit: maxTicks, maxRotation: 0 }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { ...tick, precision: 0 }, grid, ...(opts.y || {}) } } },
  }));

  const shown = ACTIVITIES.filter(([k]) => B.some((b) => b[k] > 0));
  bar("dc-shots", (shown.length ? shown : ACTIVITIES.slice(0, 1)).map(([k, l, c]) => ({ label: l, data: B.map((b) => b[k]), backgroundColor: c })));
  $("dl-shots").innerHTML = legendHtml((shown.length ? shown : ACTIVITIES.slice(0, 1)).map(([, l, c]) => [l, c]));
  bar("dc-players", [{ label: "Returning", data: B.map((b) => b.players - b.newp), backgroundColor: RETURNING_C },
                     { label: "New (first shot ever)", data: B.map((b) => b.newp), backgroundColor: NEW_C }]);
  $("dl-players").innerHTML = legendHtml([["Returning", RETURNING_C], ["New (first shot ever)", NEW_C]]);
  line("dc-perplayer", "Shots per active player", B.map((b) => (b.players ? Math.round(b.shots / b.players) : null)));
  bar("dc-minutes", [{ label: "Practice minutes", data: B.map((b) => b.minutes), backgroundColor: ONE_C }], { unit: " min" });
  bar("dc-sets", [{ label: "Drill sets", data: B.map((b) => b.sets), backgroundColor: ONE_C }]);
  line("dc-made", "Drill shots made", B.map((b) => pct(b.made, b.dshots)), { unit: "%", y: { max: 100 } });
  bar("dc-quality", [
    { label: "Measured", data: B.map((b) => b.ok), backgroundColor: "#3987e5" },
    { label: "No stroke found", data: B.map((b) => b.nostroke), backgroundColor: "#c98500" },
    { label: "Refused or failed", data: B.map((b) => b.failed), backgroundColor: "#e66767" },
    { label: "Not measured yet", data: B.map((b) => b.notm), backgroundColor: MUTED_C }]);
  $("dl-quality").innerHTML = legendHtml([["Measured", "#3987e5"], ["No stroke found", "#c98500"], ["Refused or failed", "#e66767"], ["Not measured yet", MUTED_C]]);
  const recs = sum(cur, (r) => r.recordings), bad = sum(cur, (r) => r.no_stroke + r.refused_or_failed);
  $("dash-quality-note").innerHTML = `${recs.toLocaleString()} uploads: <b>${pct(bad, recs) ?? 0}%</b> with no measured stroke · ` +
    `${sum(cur, (r) => r.stroke_errors)} strokes the engine couldn't measure · ${sum(cur, (r) => r.low_confidence)} low-confidence shots · ` +
    `${sum(cur, (r) => r.uncalibrated)} uploads without calibration. A sudden jump here is usually an app or sensor problem, not players.`;

  // ---- Shot types (the app's Developer-screen intents) over the range.
  const intentTotals = {};
  cur.forEach((r) => Object.entries(r.intents || {}).forEach(([code, n]) => { const [label, grp] = intentOf(code); const k = `${grp}|${label}`; intentTotals[k] = (intentTotals[k] || 0) + n; }));
  const groups = {};
  Object.entries(intentTotals).forEach(([k, n]) => { const g = k.split("|")[0]; groups[g] = (groups[g] || 0) + n; });
  const ORDER = ["Normal", "Spin and twist", "Timing", "Straightness", "Older labels"];
  const totalShots = Object.values(groups).reduce((a, b) => a + b, 0);
  const row = (label, n, of, cls = "") => `<div class="payoff-row ${cls}"><span>${esc(label)}</span><div class="payoff-bar"><div style="width:${of ? (100 * n) / of : 0}%;background:${ONE_C}"></div></div><span class="v">${n.toLocaleString()}</span></div>`;
  $("dash-intents").innerHTML = totalShots ? ORDER.filter((g) => groups[g]).map((g) => {
    const items = Object.entries(intentTotals).filter(([k]) => k.startsWith(g + "|")).sort((a, b) => b[1] - a[1]);
    return `<div class="month">${esc(g)} · ${groups[g].toLocaleString()} (${pct(groups[g], totalShots)}%)</div>` +
      (g === "Normal" ? "" : items.map(([k, n]) => row(k.split("|")[1], n, items[0][1])).join(""));
  }).join("") : `<p class="msg">No shots in this range.</p>`;

  // ---- When they practice: weekday by hour, darker = more shots.
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  D.hours.filter((h) => counted(h.pid) && (!h.day || (h.day >= from && h.day <= to))).forEach((h) => (heat[h.dow][h.hour] += h.shots));
  const hmax = Math.max(1, ...heat.flat());
  const ramp = ["#2f3440", "#1d3a66", "#184f95", "#2a78d6", "#5598e7", "#9cc2f2"];  // blue, dark to light on the dark panel
  const shade = (n) => (n ? ramp[Math.min(ramp.length - 1, 1 + Math.floor((n / hmax) * (ramp.length - 1.01)))] : ramp[0]);
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const hourLabel = (h) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);
  $("dash-heat").innerHTML = `<div class="heat"><span></span>${Array.from({ length: 24 }, (_, h) => `<span class="hh">${h % 3 ? "" : hourLabel(h)}</span>`).join("")}` +
    DAY_ORDER.map((d) => `<span class="hd">${DOW[d]}</span>` + heat[d].map((n, h) =>
      `<span class="hc" style="background:${shade(n)}" title="${DOW[d]} ${hourLabel(h)}–${hourLabel((h + 1) % 24)}: ${n} shot${n === 1 ? "" : "s"}"></span>`).join("")).join("") + `</div>`;

  // ---- Coaching activity, this range against the one before.
  $("dash-coaching").innerHTML = `<tr><th>What</th><th>Last ${DASH.range} days</th><th>The ${DASH.range} days before</th></tr>` +
    COACHING_ACTIONS.map(([k, l]) => `<tr><td>${l}</td><td>${evIn(from, to, k)}</td><td>${evIn(prevFrom, prevTo, k)}</td></tr>`).join("");

  // ---- Players in the range.
  const byPlayer = {};
  cur.forEach((r) => { const p = (byPlayer[r.pid] ||= { days: 0, shots: 0, minutes: 0, sets: 0, platforms: {} });
    if (r.shots || r.drill_shots) p.days++; p.shots += r.shots; p.minutes += Number(r.active_minutes); p.sets += r.drill_sets;
    if (r.platform) p.platforms[r.platform] = (p.platforms[r.platform] || 0) + r.shots; });
  const who = (p) => `${esc(p.player_code || "")}${p.player_code ? " · " : ""}${esc(p.name)}${p.team ? ' <span class="tag">team</span>' : ""}${p.booth ? ' <span class="tag">booth</span>' : ""}`;
  const since = (iso) => { if (!iso) return "–"; const n = Math.round((dayOf(to) - dayOf(iso.slice(0, 10))) / 864e5); return n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`; };
  const list = Object.entries(byPlayer).map(([pid, s]) => ({ p: people[pid] || { name: "?" }, s })).sort((a, b) => b.s.shots - a.s.shots);
  $("dash-players").innerHTML = `<tr><th>Player</th><th>Days played</th><th>Shots</th><th>Practice</th><th>Drill sets</th><th>Phone</th><th>Coach</th><th>Last shot</th></tr>` +
    (list.length ? list.map(({ p, s }) => `<tr><td>${who(p)}</td><td>${s.days}</td><td>${s.shots.toLocaleString()}</td><td>${hm(Math.round(s.minutes))}</td><td>${s.sets}</td>` +
      `<td>${esc(Object.entries(s.platforms).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(", ") || "–")}</td><td>${p.has_coach ? "yes" : ""}</td><td>${since(p.last_shot_day)}</td></tr>`).join("")
      : `<tr><td colspan="8" class="msg">Nobody played in this range.</td></tr>`);

  // ---- Gone quiet (7+ days without a shot) and signed up but no shots yet: players only.
  const quiet = D.people.filter((p) => !p.team && p.last_shot_day && p.last_shot_day < addDays(to, -6)).sort((a, b) => (a.last_shot_day < b.last_shot_day ? 1 : -1));
  const never = D.people.filter((p) => !p.team && !p.shots_all_time);
  $("dash-quiet").innerHTML = `<tr><th>Player</th><th>Last shot</th><th>Shots all time</th><th>Last signed in</th><th>Coach</th></tr>` +
    (quiet.length ? quiet.map((p) => `<tr><td>${who(p)}</td><td>${since(p.last_shot_day)}</td><td>${p.shots_all_time.toLocaleString()}</td><td>${since(p.last_sign_in)}</td><td>${p.has_coach ? "yes" : ""}</td></tr>`).join("")
      : `<tr><td colspan="5" class="msg">Everyone has played in the last 7 days.</td></tr>`);
  $("dash-never").innerHTML = never.length ? `Logins with no shots yet: ${never.map((p) => `${who(p)} <span class="small">(joined ${since(p.joined)}${p.last_sign_in ? `, signed in ${since(p.last_sign_in)}` : ", never signed in"})</span>`).join(" · ")}` : "";

  // ---- Phones and app versions in the range.
  const phones = {}, versions = {};
  cur.forEach((r) => { if (!r.platform) return; phones[r.platform] = (phones[r.platform] || 0) + r.shots;
    const v = `${r.platform}|${r.app_version || "?"}`; (versions[v] ||= { shots: 0, players: new Set() }).shots += r.shots; versions[v].players.add(r.pid); });
  $("dash-phones").innerHTML = Object.keys(phones).length ? Object.entries(phones).map(([k, n]) => card(k, `${n.toLocaleString()} shots`, `${pct(n, sum(Object.values(phones), (x) => x))}% of shots from the app`)).join("") : `<p class="msg">No app shots in this range.</p>`;
  $("dash-versions").innerHTML = `<tr><th>App version</th><th>Phone</th><th>Players</th><th>Shots</th></tr>` +
    Object.entries(versions).sort((a, b) => b[1].shots - a[1].shots).map(([k, v]) => `<tr><td>${esc(k.split("|")[1])}</td><td>${esc(k.split("|")[0])}</td><td>${v.players.size}</td><td>${v.shots.toLocaleString()}</td></tr>`).join("");

  // ---- Leads funnel (all time) and new leads in the range.
  const L = D.leads, leadsNew = L.filter((l) => l.first_seen && isoDay(new Date(l.first_seen)) >= from).length;
  const contacted = L.filter((l) => l.status !== "new").length, login = L.filter((l) => l.has_login).length, shot = L.filter((l) => l.has_shots).length;
  $("dash-leads").innerHTML = [card("Leads", L.length, `${leadsNew} new in the last ${DASH.range} days`), card("Followed up", contacted, L.length ? `${pct(contacted, L.length)}% of leads` : ""),
    card("Have a login", login, L.length ? `${pct(login, L.length)}% of leads` : ""), card("Have taken a shot", shot, login ? `${pct(shot, login)}% of those with a login` : "")].join("");

  // ---- Every number by period, as a table (the charts' table view) and a file for a spreadsheet.
  const cols = [["Period", (b) => longLabel(B.indexOf(b))], ["Shots", (b) => b.shots], ...ACTIVITIES.map(([k, l]) => [l, (b) => b[k]]),
    ["Active players", (b) => b.players], ["New players", (b) => b.newp], ["Practice minutes", (b) => b.minutes], ["Drill sets", (b) => b.sets],
    ["Drill shots", (b) => b.dshots], ["Drill made", (b) => b.made], ["Uploads", (b) => b.recordings], ["No stroke", (b) => b.nostroke],
    ["Refused/failed", (b) => b.failed], ["Low confidence", (b) => b.lowc], ["Uncalibrated", (b) => b.uncal],
    ...COACHING_ACTIONS.map(([k, l]) => [l, (b) => b[k]])];
  const rowsDesc = [...B].reverse();
  $("dash-table").innerHTML = `<tr>${cols.map(([h]) => `<th>${esc(h)}</th>`).join("")}</tr>` + rowsDesc.map((b) => `<tr>${cols.map(([, f]) => `<td>${esc(f(b))}</td>`).join("")}</tr>`).join("");
  $("dash-csv").onclick = () => {
    const csv = [cols.map(([h]) => h), ...B.map((b) => cols.map(([, f]) => f(b)))].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `cue-coach-dashboard-${DASH.group}-${to}.csv`;
    a.click();
  };
}
