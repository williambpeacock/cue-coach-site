// Coaching on My Cue Coach: Coaches Corner (student cards, scoreboard, drill list, assign, review, withdraw
// and redo, history), the student's coaching panel on their log, the coach's feedback boxes on a test report,
// and the admins' Coaching overview on Team. Split out of index.html 2026-11-28 (structure plan step 5); no
// change in what it does. The rules: docs/plans/coaching_cloud_plan.md. Uses index.html's $, esc, mock, db,
// me, show, status, fromMock, callFunction, viewFrom, playerCode, loadPlayer, loadTeam.

// Coaching overview (2026-11-27, step 4): admins see what may be stuck, across every coach.
async function coachingStuck() {
  const st = await fetchCoaching(), { people, assignments, tests, invites } = st;
  const name = (id) => nameOf(people, id), now = Date.now(), dayMs = 864e5;
  const drillFor = (t) => { const a = assignments.find((x) => x.id === t.assignment_id); return a ? drillText(a) : "a drill"; };
  const coachOf = (t) => name(assignments.find((x) => x.id === t.assignment_id)?.coach_id);
  const items = [];
  for (const t of tests) {
    if (t.status === "in_progress" && now - new Date(t.started_at) > dayMs) {
      items.push({ when: t.started_at, what: `${esc(name(t.student_id))}'s ${t.kind === "baseline" ? "baseline" : "test"} on ${drillFor(t)} was started ${shortDay(t.started_at)} and never sent`, who: `coach ${esc(coachOf(t))}` });
    } else if (t.status !== "in_progress" && !t.reviewed_at && now - new Date(t.started_at) > 3 * dayMs) {
      items.push({ when: t.started_at, what: `${esc(name(t.student_id))}'s ${t.kind === "baseline" ? "baseline" : "test"} on ${drillFor(t)} (${shortDay(t.started_at)}) is waiting for review`, who: `coach ${esc(coachOf(t))}` });
    }
  }
  for (const i of invites) if (i.status === "sent" && i.email_error) {
    items.push({ when: i.created_at, what: `The invite to ${esc(i.email)} didn't send: ${esc(i.email_error)}`, who: `coach ${esc(name(i.coach_id))}` });
  }
  if (!mock) {
    const since = new Date(now - 14 * dayMs).toISOString();
    const { data } = await db.from("coaching_events").select("at, student_id, after, note").eq("action", "email_failed").gte("at", since).order("at", { ascending: false });
    for (const e of data || []) items.push({ when: e.at, what: `A "${esc(e.after?.kind || "coaching")}" email to ${esc(e.after?.to || "someone")} didn't send: ${esc(e.note || "")}`, who: e.student_id ? `about ${esc(name(e.student_id))}` : "" });
  }
  return items.sort((a, b) => (a.when < b.when ? 1 : -1));
}
async function loadOverview() {
  setAddr("#team/coaching");
  show("who", "overview");
  $("title").textContent = "Coaching overview";
  $("ov-list").innerHTML = `<p class="small">Loading…</p>`;
  try {
    const items = await coachingStuck();
    $("ov-list").innerHTML = items.length
      ? `<ul class="ov">${items.map((x) => `<li>${x.what}${x.who ? ` <span class="small">· ${x.who}</span>` : ""}</li>`).join("")}</ul>
         <p class="small">Open <button class="link" id="ov-cc">Coaches Corner</button> to act on these.</p>`
      : `<p>Nothing stuck. Every test is sent and reviewed on time, and every coaching email went.</p>`;
    $("ov-cc")?.addEventListener("click", () => loadStudents());
  } catch (e) { $("ov-list").innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

// ---- The coach's feedback on a test (2026-11-13). A test's coach report (cue_coach_report.py --test-id,
// summary.test_id) ends with three boxes: what improved, what to work on, next drill and target.
// "Save and email" sends them to the coaching function (action feedback): saved on the test as a
// comment, the test marked reviewed, and emailed to the student. The boxes open filled with the
// last feedback saved. The frame allows same-origin (no scripts) so the page can read the boxes.
const FEEDBACK_BOXES = [["praise", "improved", "What improved: "], ["fix", "work_on", "What to work on: "], ["next", "next", "Next drill and target: "]];
let feedbackFor = null;  // {test, student} of the report on screen
async function setupFeedback(r, loaded) {
  feedbackFor = null;
  $("feedback-bar").hidden = true; $("feedback-msg").textContent = ""; $("feedback-msg").className = "small";
  const testId = r.summary?.test_id;
  if (r.kind !== "coach" || !testId || !["coach", "admin"].includes(me?.role)) return;
  try {
    const [test] = await ctable("tests", (q) => q.eq("id", testId), (t) => t.id === testId);
    if (!test) return;
    const [student] = await ctable("profiles", (q) => q.eq("id", test.student_id), (p) => p.id === test.student_id);
    const comments = await ctable("coach_comments", (q) => q.eq("test_id", testId).neq("author_id", test.student_id).order("created_at", { ascending: false }),
      (c) => c.test_id === testId && c.author_id !== test.student_id);
    const last = comments.find((c) => FEEDBACK_BOXES.some(([, , label]) => c.body.startsWith(label)));
    feedbackFor = { test, student };
    const first = (student?.display_name || student?.player_code || "the student").split(" ")[0];
    $("feedback-send").textContent = `Save and email to ${first}`;
    $("feedback-send").disabled = false;
    $("feedback-bar").hidden = false;
    if (last) $("feedback-msg").textContent = `Last sent ${when(last.created_at)}.`;
    const fill = () => {
      const doc = $("report-frame").contentDocument;
      if (!doc || !last) return;
      for (const part of last.body.split("\n\n")) {
        const box = FEEDBACK_BOXES.find(([, , label]) => part.startsWith(label));
        const el = box && doc.getElementById(box[0]);
        if (el && !el.value) el.value = part.slice(box[2].length);
      }
    };
    if (last) { await loaded; fill(); }
  } catch (e) { $("feedback-msg").textContent = e.message; }
}
$("feedback-send").onclick = async () => {
  if (!feedbackFor) return;
  const doc = $("report-frame").contentDocument;
  const say = (text, bad) => { $("feedback-msg").textContent = text; $("feedback-msg").className = bad ? "err" : "small"; };
  if (!doc) return say("Couldn't read the report's boxes.", true);
  const args = Object.fromEntries(FEEDBACK_BOXES.map(([id, key]) => [key, (doc.getElementById(id)?.value || "").trim()]));
  if (!args.improved && !args.work_on && !args.next) return say("Type something in at least one of the Coach feedback boxes first.", true);
  const name = feedbackFor.student?.display_name || "the student";
  $("feedback-send").disabled = true; say("Saving…");
  try {
    const r = await coachingCall({ action: "feedback", test_id: feedbackFor.test.id, ...args });
    say(r.email_errors?.length ? `Saved, but the email didn't send: ${r.email_errors[0]}`
      : r.emailed ? `Saved and emailed to ${name}.` : `Saved. ${name} has no email address on file, so nothing was emailed.`, Boolean(r.email_errors?.length));
  } catch (e) { say(e.message, true); }
  $("feedback-send").disabled = false;
};

// ---- Coaching (2026-11-13, docs/plans/coaching_cloud_plan.md step 3). Every change goes through the
// "coaching" edge function (the rules live in the database: coaching_act); the page reads the tables
// directly, and their row-level security decides what each person sees.
let mockC = null;
async function coachingTables() {
  if (mock && !mockC) mockC = await fromMock("coaching");
}
/** Rows of a coaching table: from Supabase, or from the mock file filtered by `keep`. */
async function ctable(name, query, keep = () => true) {
  if (mock) { await coachingTables(); return mockC[name].filter(keep); }
  const { data, error } = await query(db.from(name).select("*"));
  if (error) throw new Error(`${name}: ${error.message}`);
  return data || [];
}
async function coachingCall(body) {
  if (mock) return mockCoaching(body);
  const res = await callFunction("coaching", { method: "POST", body: JSON.stringify(body) });
  const answer = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!answer.ok) throw new Error(answer.error || `HTTP ${res.status}`);
  return answer;
}
/** What the coaching function would do, on the mock data (nothing is sent). */
function mockCoaching(b) {
  const now = new Date().toISOString(), result = {};
  if (b.action === "invite") {
    if (mockC.coach_invites.some((i) => i.coach_id === me.id && i.email === b.email.trim().toLowerCase() && i.status === "sent")) throw new Error("you have already invited them: send it again instead");
    mockC.coach_invites.unshift({ id: `m-inv${Date.now()}`, coach_id: me.id, email: b.email.trim().toLowerCase(), student_id: null, status: "sent", created_at: now, expires_at: new Date(Date.now() + 30 * 864e5).toISOString() });
    result.has_login = false;
  } else if (b.action === "accept" || b.action === "decline") {
    const inv = mockC.coach_invites.find((i) => i.id === b.invite_id);
    inv.status = b.action === "accept" ? "accepted" : "declined";
    if (b.action === "accept") {
      mockC.coach_links.forEach((l) => { if (l.student_id === me.id && l.active) l.active = false; });
      mockC.assignments.forEach((a) => { if (a.student_id === me.id && a.status === "active") a.status = "closed"; });
      mockC.coach_links.push({ student_id: me.id, coach_id: inv.coach_id, active: true, created_at: now });
    }
  } else if (b.action === "end_link") {
    mockC.coach_links.forEach((l) => { if (l.student_id === me.id && l.active) l.active = false; });
    mockC.assignments.forEach((a) => { if (a.student_id === me.id && a.status === "active") a.status = "closed"; });
  } else if (b.action === "assign") {
    mockC.assignments.forEach((a) => { if (a.student_id === b.student_id && a.status === "active") a.status = b.end_current || "closed"; });
    const d = mockC.drills.find((x) => x.drill_id === b.drill_id && x.level === b.level && x.active);
    mockC.assignments.push({ id: `m-a${Date.now()}`, student_id: b.student_id, coach_id: me.id, drill_id: d.drill_id, drill_level: d.level, drill_version: d.version,
      sets_per_test: b.sets_per_test, status: "active", target_set_at: null, due_date: null, created_at: now });
  } else if (b.action === "set_target") {
    const a = mockC.assignments.find((x) => x.id === b.assignment_id);
    Object.assign(a, { score_goal: b.score_goal, band_low: b.band_low ?? null, band_high: b.band_high ?? null, pass_rule: b.pass_rule || a.pass_rule,
      metric_goal: b.metric_goal ?? a.metric_goal ?? 0.8, due_date: b.due_date, target_set_at: now });
    mockC.tests.forEach((t) => { if (t.assignment_id === a.id && t.status !== "in_progress" && !t.reviewed_at) t.reviewed_at = now; });
  } else if (b.action === "feedback") {
    const t = mockC.tests.find((x) => x.id === b.test_id); t.reviewed_at ||= now;
    const body = [["What improved: ", b.improved], ["What to work on: ", b.work_on], ["Next drill and target: ", b.next]].filter(([, v]) => v).map(([l, v]) => l + v).join("\n\n");
    (mockC.coach_comments ||= []).push({ id: `m-c${Date.now()}`, test_id: t.id, student_id: t.student_id, assignment_id: t.assignment_id, author_id: me.id, body, created_at: now });
  } else if (b.action === "review") {
    const t = mockC.tests.find((x) => x.id === b.test_id); t.reviewed_at ||= now;
  } else if (b.action === "withdraw" || b.action === "redo_baseline") {
    const a = mockC.assignments.find((x) => x.id === b.assignment_id);
    Object.assign(a, { status: b.action === "withdraw" ? "withdrawn" : "redone", ended_at: now });
    if (b.action === "redo_baseline") mockC.assignments.push({ ...a, id: `m-a${Date.now()}`, status: "active", ended_at: null, created_at: now, target_set_at: null, score_goal: null });
  } else if (b.action === "pass" || b.action === "close") {
    mockC.assignments.find((x) => x.id === b.assignment_id).status = b.action === "pass" ? "passed" : "closed";
  }
  return { ok: true, result, emailed: 1, email_errors: [] };
}

const ASSIGNABLE = ["Make/miss", "Make + cue ball", "Cue ball zone"];  // as the database's assign rule
let drillList = [];
const drillOf = (a) => drillList.find((d) => d.drill_id === a.drill_id && d.level === a.drill_level && d.version === a.drill_version);
const drillText = (a) => { const d = drillOf(a); return `${esc(d?.name || a.drill_id)}, level ${a.drill_level}`; };
const testMax = (a) => { const d = drillOf(a); return d?.shots ? d.shots * (d.scoring === "Make/miss" ? 1 : 2) * a.sets_per_test : null; };
const shortDay = (iso) => dayOf(iso.slice(0, 10)).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
const nameOf = (people, id) => { const p = people.find((x) => x.id === id); return p ? (p.display_name || p.player_code || "Someone") : "Someone"; };

/** Where an assignment stands, in a few words (as the phone's coach tools, Coach.kt step()). */
function stepOf(a, tests, forStudent) {
  if (!a) return { key: "none", text: "No drill assigned" };
  const ts = tests.filter((t) => t.assignment_id === a.id).sort((x, y) => (x.started_at < y.started_at ? -1 : 1));
  const last = ts[ts.length - 1];
  if (!last) return { key: "baseline", text: forStudent ? "Shoot your baseline test" : "Baseline test to shoot" };
  if (last.status === "in_progress") return { key: "testing", text: "Shooting a test now" };
  if (!last.reviewed_at) {
    return { key: "review", text: forStudent ? "Test sent: waiting for your coach" : "Test waiting for your review" };
  }
  if (!a.target_set_at) return { key: "target", text: forStudent ? "Waiting for your coach's target" : "Set the target" };
  if (a.due_date && a.due_date > isoDay(new Date())) return { key: "practice", text: `Practicing · test due ${shortDay(a.due_date)}` };
  return { key: "due", text: "Test due" };
}

// The student's own panel on their training log: invites, their coach, their drill.

async function loadMyCoaching() {
  const panel = $("coach-panel");
  panel.hidden = true;
  if (!me || (me.role === "staff" && !(await staffPlays())) || (me.player_code && playerCode !== me.player_code)) return;
  try {
    const [invites, links, assignments] = await Promise.all([
      ctable("coach_invites", (q) => q.eq("status", "sent").neq("coach_id", me.id), (i) => i.status === "sent" && i.coach_id !== me.id && i.student_id === me.id),
      ctable("coach_links", (q) => q.eq("student_id", me.id).eq("active", true), (l) => l.student_id === me.id && l.active),
      ctable("assignments", (q) => q.eq("student_id", me.id).eq("status", "active"), (a) => a.student_id === me.id && a.status === "active"),
    ]);
    if (!invites.length && !links.length && !assignments.length) return;
    const a = assignments.sort((x, y) => (x.created_at < y.created_at ? 1 : -1))[0];
    const [people, tests, drills] = await Promise.all([
      ctable("profiles", (q) => q.in("id", [...invites.map((i) => i.coach_id), ...links.map((l) => l.coach_id)])),
      a ? ctable("tests", (q) => q.eq("assignment_id", a.id), (t) => t.assignment_id === a.id) : [],
      ctable("drills", (q) => q),
    ]);
    drillList = drills;
    const coach = links[0] ? nameOf(people, links[0].coach_id) : null;
    let html = "";
    for (const i of invites) {
      html += `<div class="invite-card" data-inv="${esc(i.id)}"><div><b>${esc(nameOf(people, i.coach_id))}</b> invited you to be coached on Cue Coach.</div>
        <div class="small">Your coach sees your shots and tests, sets you drills and targets.${coach ? ` Accepting ends your link with ${esc(coach)}.` : ""} Open until ${shortDay(i.expires_at)}.</div>
        <div class="buttons"><button class="primary inv-accept">Accept</button><button class="inv-decline">Decline</button></div></div>`;
    }
    if (coach) {
      const step = stepOf(a, tests, true);
      const lines = [`<div><span class="label">Your coach</span><br><b>${esc(coach)}</b></div>`];
      if (a) {
        lines.push(`<div>Drill: <b>${drillText(a)}</b> · ${a.sets_per_test} sets a test</div>`, `<div><span class="step ${step.key}">${esc(step.text)}</span></div>`);
        if (a.target_set_at && a.score_goal != null) {
          lines.push(`<div class="small">Target: score ${fmt(a.score_goal, 0)}${testMax(a) ? ` of ${testMax(a)}` : ""}` +
            (a.focus_metric && a.band_low != null ? ` · ${esc(a.focus_metric.replace(/_/g, " "))} ${fmt(a.band_low)} to ${fmt(a.band_high)} on ${Math.round((a.metric_goal ?? 0.8) * 100)}% of shots` : "") +
            (a.due_date ? ` · next test ${shortDay(a.due_date)}` : "") + "</div>");
        }
        if (step.key === "baseline" || step.key === "due") lines.push(`<div class="small">Tests are shot in the app's Test mode: once you start, finish it the same day.</div>`);
      } else lines.push(`<div class="small">No drill assigned yet.</div>`);
      lines.push(`<div><button class="link" id="end-link">End coaching link</button></div>`);
      html += `<div class="coach-lines">${lines.join("")}</div>`;
    }
    html += `<div id="coach-msg" class="msg"></div>`;
    panel.innerHTML = html;
    panel.hidden = false;
    // After a reload the panel may be gone (no invites or coach left): then the page's status line says it.
    const say = (text, bad) => { if (panel.hidden || !$("coach-msg")) return status(text, bad); $("coach-msg").textContent = text; $("coach-msg").className = bad ? "err" : "msg"; };
    panel.querySelectorAll(".invite-card").forEach((card) => {
      const respond = async (action) => {
        say(action === "accept" ? "Accepting…" : "Declining…");
        try {
          await coachingCall({ action, invite_id: card.dataset.inv });
          if (action === "accept" && !me.player_code && !mock) return start();  // a player code is given on accepting
          await loadMyCoaching();
          say(action === "accept" ? "Done: you're linked to your new coach." : "Declined. The coach has been told.");
        } catch (e) { say(e.message, true); }
      };
      card.querySelector(".inv-accept").onclick = () => respond("accept");
      card.querySelector(".inv-decline").onclick = () => respond("decline");
    });
    $("end-link")?.addEventListener("click", async () => {
      if (!confirm(`End your coaching link with ${coach}? They'll stop seeing your shots, and your current drill closes. You keep all your data.`)) return;
      try { await coachingCall({ action: "end_link" }); await loadMyCoaching(); say("Your coaching link has ended."); }
      catch (e) { say(e.message, true); }
    });
  } catch (e) { panel.innerHTML = `<div class="err">Coaching: ${esc(e.message)}</div>`; panel.hidden = false; }
}

// The Students page: a coach's students and invites (admins: everyone's), assign a drill.
let studentsState = null;
async function loadStudents(note) {
  setAddr("#coaches");
  show("who", "students");
  $("title").textContent = "Coaches Corner";
  $("ci-msg").textContent = ""; $("assign-box").hidden = true; $("review-box").hidden = true;
  status("Loading…");
  const admin = me.role === "admin";
  try {
    studentsState = await fetchCoaching();
    drawStudents(admin);
    drawCoachBoard();
    drawDrillList();
    status("");
    if (note) studentsMsg(note);
  } catch (e) { status(`Students: ${e.message}`, true); }
}

/** Links, invites, people, every assignment and test for the coach's students (admins: everyone's). */
async function fetchCoaching() {
  const admin = me.role === "admin";
  {
    const mineL = (l) => l.active && (admin || l.coach_id === me.id), mineI = (i) => admin || i.coach_id === me.id;
    const [links, invites, drills] = await Promise.all([
      ctable("coach_links", (q) => (admin ? q : q.eq("coach_id", me.id)).eq("active", true), mineL),
      ctable("coach_invites", (q) => (admin ? q : q.eq("coach_id", me.id)).order("created_at", { ascending: false }), mineI),
      ctable("drills", (q) => q),
    ]);
    drillList = drills;
    const studentIds = links.map((l) => l.student_id);
    const ids = [...new Set([...studentIds, ...links.map((l) => l.coach_id), ...invites.map((i) => i.coach_id), ...invites.map((i) => i.student_id).filter(Boolean)])];
    const [people, assignments] = await Promise.all([
      ids.length ? ctable("profiles", (q) => q.in("id", ids), (p) => ids.includes(p.id)) : [],
      // Every assignment, for the history on each card (2026-11-27); the active one drives the card.
      studentIds.length ? ctable("assignments", (q) => q.in("student_id", studentIds).order("created_at", { ascending: false }), (a) => studentIds.includes(a.student_id)) : [],
    ]);
    const aIds = assignments.map((a) => a.id);
    const tests = aIds.length ? await ctable("tests", (q) => q.in("assignment_id", aIds), (t) => aIds.includes(t.assignment_id)) : [];
    const state = { links, invites, people, assignments, tests };
    setNeedsBadge(state);
    return state;
  }
}

// "Needs you" on the Coaches Corner tab (2026-11-27, step 4): your own students with a test to
// review or a target to set (an admin's count is their own students only, not every coach's).
function setNeedsBadge({ links, assignments, tests }) {
  const n = links.filter((l) => l.coach_id === me.id).filter((l) => {
    const a = assignments.find((x) => x.student_id === l.student_id && x.status === "active");
    return ["review", "target"].includes(stepOf(a, tests, false).key);
  }).length;
  $("students-link").innerHTML = `Coaches Corner${n ? ` <span class="needs-badge" title="${n} student${n === 1 ? "" : "s"} waiting on you">${n}</span>` : ""}`;
}

// Scoreboard across your students (2026-11-27, step 4): each student on their current drill, from
// drill_sets (the same scored sets as the player's own scoreboard).
async function drawCoachBoard() {
  const { links, people, assignments } = studentsState, admin = me.role === "admin";
  const coachPick = admin ? $("cc-coach").value : "";
  const list = links.filter((l) => !coachPick || l.coach_id === coachPick).map((l) => ({
    p: people.find((x) => x.id === l.student_id) || {}, a: assignments.find((x) => x.student_id === l.student_id && x.status === "active"),
  })).filter((r) => r.a && r.p.player_code);
  $("coach-board-panel").hidden = !list.length;
  if (!list.length) return;
  const codes = list.map((r) => r.p.player_code);
  let sets;
  try {
    if (mock) sets = (await fromMock("drill_sets")).filter((x) => codes.includes(x.player_code));
    else {
      const { data, error } = await db.from("drill_sets").select("*").in("player_code", codes).not("list_drill_id", "is", null);
      if (error) throw error;
      sets = data;
    }
  } catch (e) { $("coach-board").innerHTML = `<tr><td class="err small">Couldn't load the scoreboard: ${esc(e.message)}</td></tr>`; return; }
  const weekAgo = isoDay(new Date(Date.now() - 6 * 864e5));
  const score = (x, max) => (x == null ? "–" : `${fmt(x, 0)}<span class="small">/${max}</span>`);
  const body = list.map(({ p, a }) => {
    const mine = sets.filter((x) => x.player_code === p.player_code && x.list_drill_id === a.drill_id && x.list_level === a.drill_level)
      .sort((x, y) => (x.drill_date + String(x.set_no).padStart(4, "0") < y.drill_date + String(y.set_no).padStart(4, "0") ? -1 : 1));
    const prac = mine.filter((x) => !x.is_test), scored = prac.filter((x) => x.scored), values = scored.map((x) => Number(x.score));
    const max = Number(mine[0]?.max_score) || drillOf(a)?.max_score || 1;
    const lastDay = prac.length ? prac[prac.length - 1].drill_date : null;
    return { html: `<tr><td><b>${esc(nameOf(people, p.id))}</b> <span class="small">${esc(p.player_code)}</span></td>
      <td>${drillText(a)}</td>
      <td>${prac.filter((x) => x.drill_date >= weekAgo).length || "–"}</td>
      <td>${score(values[values.length - 1], max)}</td>
      <td>${values.length ? score(Math.max(...values), max) : "–"}</td>
      <td>${values.length ? `${fmt(mean(values.slice(-10)))}<span class="small">/${max}</span>` : "–"}</td>
      <td>${boardTrend(values, max)}</td>
      <td>${lastDay ? shortDay(lastDay) : "not yet"}</td></tr>`, last: lastDay || "" };
  }).sort((x, y) => (x.last < y.last ? 1 : x.last > y.last ? -1 : 0)).map((r) => r.html).join("");
  $("coach-board").innerHTML = `<tr><th>Student</th><th>Drill</th><th title="practice sets in the last 7 days">Sets this week</th><th>Last</th><th>Best</th>` +
    `<th title="average of the last 10 scored practice sets">Last 10 avg</th><th>Trend</th><th>Last practised</th></tr>${body}`;
}

function studentsMsg(text, bad) { $("students-msg").textContent = text || ""; $("students-msg").className = bad ? "err" : "msg"; }

function drawStudents(admin) {
  const { people, assignments, tests } = studentsState;
  // Admins see every coach's students; the coach filter narrows it to one coach (2026-11-27).
  const coachIds = [...new Set([...studentsState.links.map((l) => l.coach_id), ...studentsState.invites.map((i) => i.coach_id)])];
  $("cc-coach-wrap").hidden = !admin || coachIds.length < 2;
  if (admin) {
    const keep = $("cc-coach").value;
    $("cc-coach").innerHTML = `<option value="">All coaches</option>` +
      coachIds.map((id) => [id, nameOf(people, id)]).sort((x, y) => x[1].localeCompare(y[1]))
        .map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join("");
    $("cc-coach").value = coachIds.includes(keep) ? keep : "";
  }
  const coachPick = admin ? $("cc-coach").value : "";
  const links = studentsState.links.filter((l) => !coachPick || l.coach_id === coachPick);
  const invites = studentsState.invites.filter((i) => !coachPick || i.coach_id === coachPick);
  const order = { review: 0, target: 1, due: 2, testing: 3, baseline: 4, none: 5, practice: 6 };
  const rowsOut = links.map((l) => {
    const p = people.find((x) => x.id === l.student_id) || { id: l.student_id };
    const mine = assignments.filter((x) => x.student_id === l.student_id).sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
    const a = mine.find((x) => x.status === "active");
    return { l, p, a, past: mine.filter((x) => x !== a), step: stepOf(a, tests, false) };
  }).sort((x, y) => order[x.step.key] - order[y.step.key] || nameOf(people, x.p.id).localeCompare(nameOf(people, y.p.id)));
  const needs = (r) => ["review", "target"].includes(r.step.key);
  const nNeeds = rowsOut.filter(needs).length;
  $("students-head").textContent = (admin && !coachPick ? "Students and their coaches" : admin ? `${nameOf(people, coachPick)}'s students` : "Your students") +
    (nNeeds ? ` · ${nNeeds} need${nNeeds === 1 ? "s" : ""} you` : "");
  // The assign and review boxes open under a card; take them out before the cards are redrawn.
  $("student-cards").after($("review-box")); $("student-cards").after($("assign-box"));
  $("student-cards").innerHTML = rowsOut.length ? rowsOut.map((r) => {
    const { l, p, a, step } = r, t = lastTest(a, tests);
    return `<div class="scard${needs(r) ? " needs" : ""}" data-id="${esc(p.id)}">
      <div><span class="sname">${esc(nameOf(people, p.id))}</span>${p.player_code ? ` <span class="small">${esc(p.player_code)}</span>` : ""}</div>
      <div><span class="step ${step.key}">${esc(step.text)}</span></div>
      <div>${a ? `${drillText(a)}<br><span class="small">${a.sets_per_test} sets a test${a.score_goal != null ? ` · goal ${fmt(a.score_goal, 0)}${testMax(a) ? ` of ${testMax(a)}` : ""}` : ""}</span>` : `<span class="small">No drill yet</span>`}</div>
      <div class="small">${admin ? `Coach ${esc(nameOf(people, l.coach_id))} · ` : ""}student since ${when(l.created_at)}${t ? ` · last test ${shortDay(t.started_at)}` : ""}</div>
      <div class="acts">${t ? (needs(r) ? `<button class="primary st-review">Review test</button>` : `<button class="link st-review">Last test</button>`) : ""}
        ${p.player_code ? `<button class="link st-shots">Open log</button>` : ""}
        <button class="link st-assign">${a ? "New drill…" : "Assign drill…"}</button>
        ${canRedo(a, tests) ? `<button class="link st-redo" title="Throw out this baseline and have them shoot it again">Redo baseline…</button>` : ""}
        ${a ? `<button class="link st-withdraw" title="Take this drill off their phone">Withdraw drill…</button>` : ""}</div>
      ${historyHtml(r, tests)}
    </div>`;
  }).join("") : `<p class="small empty">${coachPick ? "No students for this coach." : "No students yet: invite one at the bottom of the page. They appear here once they accept."}</p>`;
  $("student-cards").querySelectorAll(".scard").forEach((card) => {
    const r = rowsOut.find((x) => x.p.id === card.dataset.id);
    const under = (box) => { card.after(box); };
    card.querySelector(".st-shots")?.addEventListener("click", () => openStudentLog(r.p));
    card.querySelector(".st-assign").onclick = () => { under($("assign-box")); openAssign(r); };
    card.querySelector(".st-review")?.addEventListener("click", () => { under($("review-box")); openReview(r); });
    card.querySelector(".st-withdraw")?.addEventListener("click", () => undoAssignment(r, "withdraw"));
    card.querySelector(".st-redo")?.addEventListener("click", () => undoAssignment(r, "redo_baseline"));
  });

  const STATUS = { sent: "Waiting", accepted: "Accepted", declined: "Declined", expired: "Expired" };
  $("invites-table").innerHTML = `<tr><th>Email</th>${admin ? "<th>Coach</th>" : ""}<th>Sent</th><th>Status</th><th></th></tr>` +
    (invites.length ? "" : `<tr><td colspan="${admin ? 5 : 4}" class="small">No invites yet.</td></tr>`) +
    invites.map((i) => `<tr data-inv="${esc(i.id)}"><td>${esc(i.email)}${i.student_id ? ` <span class="small">${esc(nameOf(people, i.student_id))}</span>` : ""}</td>
      ${admin ? `<td>${esc(nameOf(people, i.coach_id))}</td>` : ""}
      <td>${when(i.created_at)}</td>
      <td><span class="tag ${esc(i.status)}">${STATUS[i.status] || esc(i.status)}</span>${i.status === "sent" ? ` <span class="small">until ${when(i.expires_at)}</span>` : ""}
        ${i.email_error ? `<br><span class="err small">email didn't send: ${esc(i.email_error)}</span>` : ""}</td>
      <td>${i.status === "sent" ? `<button class="link inv-resend">Send again</button>` : ""}</td></tr>`).join("");
  $("invites-table").querySelectorAll(".inv-resend").forEach((b) => (b.onclick = async () => {
    const id = b.closest("tr").dataset.inv;
    studentsMsg("Sending…");
    try {
      const r = await coachingCall({ action: "resend_invite", invite_id: id });
      await loadStudents(r.email_errors?.length ? `Invite renewed for 30 days, but the email didn't send: ${r.email_errors[0]}` : "Sent again; the invite is open for 30 more days.");
    } catch (e) { studentsMsg(e.message, true); }
  }));
}

/** The "test is in" email links to #coaches/test/<id> (2026-11-27): open that test's review under its card. */
function openTestFromLink(testId) {
  const t = studentsState?.tests.find((x) => x.id === testId);
  if (!t) return studentsMsg("That test isn't one of your students' (or it was withdrawn). Here's Coaches Corner.", true);
  const card = document.querySelector(`.scard[data-id="${CSS.escape(t.student_id)}"]`);
  const a = studentsState.assignments.find((x) => x.id === t.assignment_id);
  if (!card || !a || a.status !== "active") return studentsMsg("That test's drill has ended; see the student's History.", true);
  card.after($("review-box"));
  openReview({ p: studentsState.people.find((x) => x.id === t.student_id) || { id: t.student_id }, a });
}

// ---- Drill list on Coaches Corner (2026-11-27): the newest active version of each drill and level.
const dlLevel = {};  // drill_id -> level shown
function drawDrillList() {
  const latest = new Map();
  for (const d of drillList.filter((x) => x.active)) {
    const k = `${d.drill_id}|${d.level}`;
    if (!latest.has(k) || latest.get(k).version < d.version) latest.set(k, d);
  }
  const byDrill = new Map();
  [...latest.values()].sort((a, b) => a.drill_id.localeCompare(b.drill_id) || a.level - b.level)
    .forEach((d) => { if (!byDrill.has(d.drill_id)) byDrill.set(d.drill_id, []); byDrill.get(d.drill_id).push(d); });
  $("drill-lib-panel").hidden = !byDrill.size;
  const types = [...new Set([...latest.values()].map((d) => d.shot_type).filter(Boolean))].sort();
  const keepType = $("dl-type").value;
  $("dl-type").innerHTML = `<option value="">All shot types</option>` + types.map((t) => `<option>${esc(t)}</option>`).join("");
  $("dl-type").value = types.includes(keepType) ? keepType : "";
  const q = $("dl-search").value.trim().toLowerCase(), type = $("dl-type").value;
  const shown = [...byDrill.entries()].filter(([, levels]) => (!type || levels.some((d) => d.shot_type === type)) &&
    (!q || levels.some((d) => [d.drill_id, d.name, d.shot_type, d.scoring, d.description, d.credit, (d.key_metrics || []).join(" ")].join(" ").toLowerCase().includes(q))));
  $("drill-lib-head").textContent = `Drill list · ${byDrill.size} drills`;
  const metric = (m) => esc(String(m).replace(/_/g, " "));
  $("drill-lib").innerHTML = shown.length ? shown.map(([id, levels]) => {
    const d = levels.find((x) => x.level === dlLevel[id]) || levels[0];
    const spec = { ...(d.spec || {}), pocket: d.spec?.pocket ?? d.pocket, shot_type: d.shot_type };
    return `<div class="dcard" data-drill="${esc(id)}">
      <div class="dtable">${window.drillTableSvg ? window.drillTableSvg(spec) : ""}</div>
      <div class="dinfo">
        <div><span class="small">${esc(id)}</span> <span class="sname">${esc(d.name)}</span></div>
        ${levels.length > 1 ? `<div class="dlevels">${levels.map((x) => `<button data-level="${x.level}" aria-pressed="${x.level === d.level}">Level ${x.level}</button>`).join("")}</div>` : `<div class="small">Level ${d.level}</div>`}
        <div class="small">${[d.shot_type, d.scoring, `${d.shots} shots`, d.max_score ? `best ${d.max_score} a set` : ""].filter(Boolean).map(esc).join(" · ")}</div>
        ${d.description ? `<div>${esc(d.description)}</div>` : ""}
        <div class="small">${(d.key_metrics || []).length ? `Key metrics: ${d.key_metrics.map(metric).join(", ")}` : ""}${d.credit ? `${(d.key_metrics || []).length ? " · " : ""}From ${esc(d.credit)}` : ""}</div>
        ${ASSIGNABLE.includes(d.scoring) ? "" : `<div class="small">Can't be assigned yet (${esc(d.scoring)} scoring); players can still practise it.</div>`}
      </div></div>`;
  }).join("") : `<p class="small">No drills match.</p>`;
  $("drill-lib").querySelectorAll(".dlevels button").forEach((b) => (b.onclick = () => {
    dlLevel[b.closest(".dcard").dataset.drill] = Number(b.dataset.level); drawDrillList();
  }));
}

// ---- Coach-only undo and the history on each card (Billy, 2026-11-27: Koby misunderstood his
// baseline; "I don't want the student to be able to throw out a drill. That should be reserved for
// the coach."). The cloud refuses both for students and while a test is being shot.
/** Redo baseline: before the target is set, once a baseline has been sent. */
const canRedo = (a, tests) => !!a && !a.target_set_at && tests.some((t) => t.assignment_id === a.id && t.status !== "in_progress");
const ENDED = { passed: "Passed", closed: "Closed", withdrawn: "Withdrawn", redone: "Baseline redone", active: "Current" };

async function undoAssignment({ p, a }, action) {
  const name = nameOf(studentsState.people, p.id), drill = drillOf(a)?.name || a.drill_id;
  if (studentsState.tests.some((t) => t.assignment_id === a.id && t.status === "in_progress")) {
    return studentsMsg(`${name} is shooting a test on ${drill} right now. Try again once it's sent.`, true);
  }
  const ask = action === "withdraw"
    ? `Withdraw ${drill}, level ${a.drill_level} from ${name}?\n\nIt comes off their phone; their shots and tests stay. They get an email.\n\nA note for them (optional):`
    : `Have ${name} shoot the baseline on ${drill}, level ${a.drill_level} again?\n\nThe first baseline stays in the history; the new one is used for the target. They get an email.\n\nA note for them (optional), e.g. what to do differently:`;
  const reason = prompt(ask, "");
  if (reason === null) return;
  studentsMsg("Saving…");
  try {
    const r = await coachingCall({ action, assignment_id: a.id, ...(reason.trim() ? { reason: reason.trim() } : {}) });
    const mailed = r.email_errors?.length ? ` The email didn't send: ${r.email_errors[0]}` : " They've been emailed.";
    await loadStudents((action === "withdraw" ? `${drill} withdrawn from ${name}.` : `${name} will shoot the ${drill} baseline again.`) + mailed);
  } catch (e) { studentsMsg(e.message, true); }
}

/** Every drill the student has had with a coach, newest first, with its tests. */
function historyHtml({ a, past }, tests) {
  const all = [a, ...past].filter(Boolean);
  if (!all.length) return "";
  const testLine = (t) => `<li>${t.kind === "baseline" ? "Baseline" : "Test"} ${shortDay(t.started_at)}: ` +
    (t.status === "in_progress" ? "being shot" : `<b>${fmt(t.score, 0)}${t.max_score ? ` of ${t.max_score}` : ""}</b>` +
      `${t.status === "incomplete" ? `, incomplete (${t.sets_done} of ${t.sets_planned} sets)` : ""}${t.reviewed_at ? "" : ", not reviewed yet"}`) + "</li>";
  const rows = all.map((x) => {
    const ts = tests.filter((t) => t.assignment_id === x.id).sort((p, q) => (p.started_at < q.started_at ? -1 : 1));
    return `<li><b>${drillText(x)}</b> <span class="tag ${esc(x.status)}">${esc(ENDED[x.status] || x.status)}</span>
      <div class="small">${x.sets_per_test} sets a test · assigned ${shortDay(x.created_at)}${x.ended_at ? ` · ended ${shortDay(x.ended_at)}` : ""}${x.score_goal != null ? ` · goal ${fmt(x.score_goal, 0)}` : ""}</div>
      ${ts.length ? `<ul class="small">${ts.map(testLine).join("")}</ul>` : `<div class="small">No tests shot.</div>`}</li>`;
  }).join("");
  return `<details class="shist"><summary>History · ${all.length} drill${all.length === 1 ? "" : "s"}</summary><ul>${rows}</ul></details>`;
}

/** The assignment's latest finished test (sent by the phone), or undefined. */
function lastTest(a, tests) {
  if (!a) return undefined;
  return tests.filter((t) => t.assignment_id === a.id && t.status !== "in_progress").sort((x, y) => (x.started_at < y.started_at ? 1 : -1))[0];
}

/** The coach report made for a test (the coaching function files it with summary.test_id). */
async function reportForTest(testId) {
  if (mock) return null;
  const { data, error } = await db.from("reports").select("id, kind, title, shots, made, created_at, storage_path, summary")
    .eq("kind", "coach").eq("summary->>test_id", testId).order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(`reports: ${error.message}`);
  return data?.[0] || null;
}

/**
 * Reviewing a test (coaching step 6, 2026-11-13): the test's numbers, its Cue Coach Report (the
 * coach-test report, made in the cloud: _shared/test_report.ts, the same page as cue_coach_report.py), and the coach's answer: set the next
 * target (which marks it reviewed), or just mark it reviewed, or pass the drill; plus a comment the
 * student sees. The suggested goal is the cloud's rule: this score + the drill's improvement, at most the best.
 */
async function openReview({ p, a }) {
  const box = $("review-box"), name = nameOf(studentsState.people, p.id), t = lastTest(a, studentsState.tests);
  if (!t) return;
  $("assign-box").hidden = true;
  const max = t.max_score ?? testMax(a), d = drillOf(a);
  const improvement = a.improvement ?? d?.improvement ?? 0.2;
  const suggested = t.score == null ? null : Math.min(max ?? Infinity, Math.ceil(t.score * (1 + improvement) - 1e-9));
  const yes = (v) => (v == null ? "not judged" : v ? "met" : "missed");
  const due = new Date(Date.now() + 7 * 864e5), dueIso = isoDay(due);
  const focus = a.focus_metric ? esc(a.focus_metric.replace(/_/g, " ")) : null;
  box.innerHTML = `<b>${esc(name)}: ${t.kind === "baseline" ? "baseline test" : "test"} on ${shortDay(t.started_at)}</b>
    <div>${drillText(a)} · score <b>${fmt(t.score, 0)}${max ? ` of ${max}` : ""}</b> · ${t.sets_done} of ${t.sets_planned} sets${t.status === "incomplete" ? " (<b>incomplete</b>: not finished that day)" : ""}</div>
    ${t.kind === "weekly" ? `<div class="small">Score goal ${yes(t.score_met)} · band ${yes(t.metric_met)} · pass rule ${yes(t.rule_met)}${t.pass_check ? " · <b>met on this test and the one before: ready to pass?</b>" : ""}</div>` : ""}
    <div id="rv-report" class="small">Looking for its report…</div>
    <div class="row">
      <label>Next score goal <input id="rv-goal" type="number" min="0" ${max ? `max="${max}"` : ""} step="1" value="${suggested ?? ""}" style="width:110px"></label>
      <label>Next test due <input id="rv-due" type="date" value="${a.due_date && a.due_date > isoDay(new Date()) ? a.due_date : dueIso}"></label>
      ${focus ? `<label>${focus} band (optional) <span style="display:flex;gap:6px"><input id="rv-lo" type="number" step="any" placeholder="low" value="${a.band_low ?? ""}" style="width:90px"><input id="rv-hi" type="number" step="any" placeholder="high" value="${a.band_high ?? ""}" style="width:90px"></span></label>
      <label>Inside the band <select id="rv-mgoal">${[6, 7, 8, 9, 10].map((n) => `<option value="${n / 10}" ${Math.round((a.metric_goal ?? 0.8) * 10) === n ? "selected" : ""}>${n} of 10 strokes</option>`).join("")}</select></label>` : ""}
    </div>
    <div class="small">${suggested != null ? `Suggested goal ${suggested}: this score + ${Math.round(improvement * 100)}%${max ? `, at most ${max}` : ""}. ` : ""}${focus ? "With a band, passing needs the score goal and the band; without one, the score goal alone." : "Passing needs the score goal."}</div>
    <label>Comment for ${esc(name)} (optional) <textarea id="rv-comment" rows="2" maxlength="5000" placeholder="What you saw and what to work on"></textarea></label>
    <div class="row">
      <button class="primary" id="rv-target">${a.target_set_at ? "Set next target" : "Set the target"}</button>
      ${a.target_set_at && !t.reviewed_at ? `<button id="rv-keep">Reviewed: keep the target</button>` : ""}
      ${t.kind === "weekly" ? `<button id="rv-pass">Passed: drill done</button>` : ""}
      <button id="rv-cancel">Close</button>
    </div>`;
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("rv-cancel").onclick = () => (box.hidden = true);
  // The cloud makes the report when the test comes in, and brings it up to date here if more of the
  // test's shots or recordings have arrived since (the phone can send "finished" before them).
  (mock ? Promise.resolve({ result: { note: "the sample data has no reports" } })
        : coachingCall({ action: "make_report", test_id: t.id }).catch((e) => ({ error: e.message })))
    .then(async (made) => {
      const r = await reportForTest(t.id);
      if (!$("rv-report")) return;
      const why = made.error || made.result?.note || "";
      $("rv-report").innerHTML = r ? `<button class="link" id="rv-open"><b>Open the Cue Coach Report</b></button> <span class="small">(${esc(r.title)}${made.result?.made ? "; just updated with the shots that came in" : ""})</span>`
        : `Its Cue Coach Report couldn't be made yet${why ? `: ${esc(why)}` : ""}. It is made once the test's shots are in the cloud; open this again later.`;
      $("rv-open")?.addEventListener("click", () => { reportBack = () => { show("who", "students"); $("title").textContent = "Coaches Corner"; }; showReport(r); });
    }).catch((e) => { if ($("rv-report")) $("rv-report").textContent = e.message; });
  const comment = async () => {
    const body = $("rv-comment").value.trim();
    if (body) await coachingCall({ action: "comment", assignment_id: a.id, test_id: t.id, body });
  };
  const act = async (button, work, done) => {
    button.disabled = true;
    try { await work(); await comment(); await loadStudents(done); } catch (e) { studentsMsg(e.message, true); button.disabled = false; }
  };
  $("rv-target").onclick = () => {
    const goal = Number($("rv-goal").value), lo = $("rv-lo")?.value, hi = $("rv-hi")?.value;
    if ($("rv-goal").value === "" || !(goal >= 0) || (max && goal > max)) return studentsMsg(`The score goal is 0 to ${max ?? "the best score"}.`, true);
    if ((lo === "") !== (hi === "") ) return studentsMsg("Give both ends of the band, or neither.", true);
    const band = lo ? { band_low: Number(lo), band_high: Number(hi), metric_goal: Number($("rv-mgoal").value) } : {};
    if (lo && band.band_low > band.band_high) return studentsMsg("The band's low end is above its high end.", true);
    act($("rv-target"), () => coachingCall({ action: "set_target", assignment_id: a.id, score_goal: goal, due_date: $("rv-due").value,
      pass_rule: lo ? "both" : "score", ...band }), `Target set for ${name}: score ${goal}, next test ${shortDay($("rv-due").value)}. They've been emailed.`);
  };
  $("rv-keep")?.addEventListener("click", () => act($("rv-keep"), () => coachingCall({ action: "review", test_id: t.id }), `Test marked reviewed; ${name}'s target stays.`));
  $("rv-pass")?.addEventListener("click", () => {
    if (!confirm(`Mark ${d?.name || "this drill"} as passed for ${name}? Then assign their next drill.`)) return;
    act($("rv-pass"), async () => { await coachingCall({ action: "review", test_id: t.id }); await coachingCall({ action: "pass", assignment_id: a.id }); },
      `${d?.name || "Drill"} passed. Assign ${name}'s next drill with New drill…`);
  });
}

/** A student's training log, from their card on Coaches Corner (address #coaches/<code>). */
function openStudentLog(p) {
  if (![...$("player").options].some((o) => o.value === p.player_code)) {
    $("player").insertAdjacentHTML("beforeend", `<option value="${esc(p.player_code)}">${esc(p.player_code)} · ${esc(p.display_name || "")}</option>`);
    playerIds[p.player_code] = p.id;
  }
  playerCode = p.player_code; $("player").value = playerCode;
  viewFrom = "coaches"; show("who", "home"); showTab("log"); loadPlayer();
}

function openAssign({ p, a }) {
  const box = $("assign-box"), name = nameOf(studentsState.people, p.id);
  const choices = drillList.filter((d) => d.active && ASSIGNABLE.includes(d.scoring)).sort((x, y) => x.drill_id.localeCompare(y.drill_id) || x.level - y.level);
  box.innerHTML = `<b>${a ? "New drill" : "Assign a drill"} for ${esc(name)}</b>
    <div class="row">
      <label style="flex:1 1 260px">Drill and level <select id="as-drill">${choices.map((d, i) => `<option value="${i}">${esc(d.drill_id)} · ${esc(d.name)} · level ${d.level} (${esc(d.scoring)}, ${d.shots} shots)</option>`).join("")}</select></label>
      <label>Sets per test <input id="as-sets" type="number" min="1" max="10" value="3" style="width:90px"></label>
    </div>
    ${a ? `<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="as-passed"> Mark ${drillText(a)} as passed (otherwise it's closed)</label>` : ""}
    <div class="small">They start with a baseline test (the sets you choose, all in one day) and you set the target after seeing it. They get an email.</div>
    <div class="row"><button class="primary" id="as-go">Assign</button><button id="as-cancel">Cancel</button></div>`;
  box.hidden = false;
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  $("as-cancel").onclick = () => (box.hidden = true);
  $("as-go").onclick = async () => {
    const d = choices[Number($("as-drill").value)], sets = Number($("as-sets").value);
    if (!d) return studentsMsg("Pick a drill.", true);
    if (!(sets >= 1 && sets <= 10)) return studentsMsg("Sets per test is 1 to 10.", true);
    // Assigning mid-test replaces the drill they're shooting (how Koby's 26 Nov mix-up began).
    if (a && studentsState.tests.some((t) => t.assignment_id === a.id && t.status === "in_progress") &&
        !confirm(`${name} is shooting a test on ${drillOf(a)?.name || a.drill_id} right now. Assign ${d.name} anyway? It replaces the drill they're testing on.`)) return;
    $("as-go").disabled = true;
    try {
      const r = await coachingCall({ action: "assign", student_id: p.id, drill_id: d.drill_id, level: d.level, sets_per_test: sets,
        ...(a ? { end_current: $("as-passed")?.checked ? "passed" : "closed" } : {}) });
      await loadStudents(`${d.name}, level ${d.level} assigned to ${name}.` + (r.email_errors?.length ? ` The email didn't send: ${r.email_errors[0]}` : " They've been emailed."));
    } catch (e) { studentsMsg(e.message, true); $("as-go").disabled = false; }
  };
}

$("coach-invite-form").onsubmit = async (e) => {
  e.preventDefault();
  // The form is at the bottom of Coaches Corner (2026-11-27), so its messages show under it.
  const ciMsg = (text, bad) => { $("ci-msg").textContent = text; $("ci-msg").className = bad ? "err" : "msg"; };
  const email = $("ci-email").value.trim();
  ciMsg("Sending…");
  try {
    const r = await coachingCall({ action: "invite", email, name: $("ci-name").value.trim() || undefined });
    $("ci-email").value = ""; $("ci-name").value = "";
    await loadStudents();
    if (r.email_errors?.length) ciMsg(`Invite made, but the email didn't send: ${r.email_errors[0]}. Try Send again.`, true);
    else ciMsg(`Invite sent to ${email}.${r.result?.has_login === false ? " They had no login, so the email has a link to make one." : ""}`);
  } catch (err) { ciMsg(err.message, true); }
};
$("students-link").onclick = () => loadStudents();
$("ov-link").onclick = () => loadOverview();
$("dl-search").oninput = () => drawDrillList();
$("dl-type").onchange = () => drawDrillList();
$("ov-back").onclick = () => loadTeam();
$("cc-coach").onchange = () => { $("assign-box").hidden = true; $("review-box").hidden = true; drawStudents(true); drawCoachBoard(); };
$("view-back").onclick = () => (viewFrom === "team" ? loadTeam() : loadStudents());
$("students-back").onclick = () => { show("who", "home"); loadPlayer(); };
