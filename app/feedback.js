// Feedback (2026-11-17, docs/plans/feedback_plan.md). Everyone signed in can send feedback here
// (Suggest an improvement first), with an optional screenshot, and see their own reports and whether
// they're fixed. Admins also see every report and sort and answer it (status, note, fixed in,
// duplicate of, to-do), and add reports by hand from email, TestFlight or Google Play.
// Sending goes through the `feedback` edge function, which saves it with the sender's login and emails
// katherine@cue-coach.com. Sorting writes straight to the feedback table (admins only, by its rules).
// Answers (2026-11-20): an admin writes one on a report's card; the same function saves it in
// feedback_replies, emails it to the tester (their reply goes to katherine@) and marks the report
// answered. The tester sees answers under "What you've sent".
// Uses index.html's $, esc, mock, db, me, show, status, fromMock, callFunction.

const FB_KINDS = {
  idea: "Suggest an improvement", bug: "Something's not working", confusing: "Something's confusing",
  hardware: "The sensor or mount", praise: "Something I like", other: "Something else",
  shot: "This shot looks wrong", survey: "Check-in answers",
};
const FB_REASONS = { speed: "The speed is off", not_a_shot: "That wasn't a shot", missed_shot: "It missed a shot I took",
  phases: "The stroke phases look wrong", other: "Something else" };
const FB_STATUS = { new: "New", looking: "Looking into it", fixed: "Fixed", wont_fix: "Won't fix", duplicate: "Duplicate", answered: "Answered" };
const FB_SOURCE = { android: "Android app", ios: "iPhone app", web: "web page", email: "email", testflight: "TestFlight", play: "Google Play" };
const FB = { rows: [], people: {}, replies: [], mockRows: null, mockReplies: null };
// Ways to start an answer (the admin edits before sending).
const FB_STARTS = [
  ["Thanks", "Thanks for taking the time to send this. "],
  ["Good idea", "Thanks, that's a good idea. We've added it to our list of improvements. "],
  ["Looking into it", "Thanks for letting us know. We're looking into it and will tell you what we find. "],
  ["Fixed", "Thanks! This is fixed in the latest build. Update Cue Coach from TestFlight or Google Play, and let us know if you still see it. "],
  ["More details", "Thanks for this. Could you tell us a bit more: what were you doing when it happened, and did it happen more than once? "],
];
const fbDate = (t) => new Date(t).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

$("fb-kind").innerHTML = ["idea", "bug", "confusing", "hardware", "praise", "other"]
  .map((k) => `<option value="${k}">${esc(FB_KINDS[k])}</option>`).join("");
$("fb-a-kind").innerHTML = Object.entries(FB_KINDS).filter(([k]) => k !== "shot" && k !== "survey")
  .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
$("fb-f-status").innerHTML = `<option value="open">Open (new or looking into it)</option><option value="">All</option>` +
  Object.entries(FB_STATUS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
$("fb-f-kind").innerHTML = `<option value="">Every kind</option>` +
  Object.entries(FB_KINDS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");

$("feedback-link").onclick = () => loadFeedback();
$("fb-back").onclick = () => { history.replaceState(null, "", location.pathname + location.search); show("who", "home"); loadPlayer(); };
["fb-f-status", "fb-f-kind"].forEach((id) => ($(id).onchange = drawFeedbackAdmin));
$("fb-f-search").oninput = drawFeedbackAdmin;

async function loadFeedback() {
  show("who", "feedback");
  $("title").textContent = "Feedback";
  $("fb-admin").hidden = me.role !== "admin";
  status("");
  try {
    if (mock) {
      FB.mockRows ??= await fromMock("feedback");
      FB.rows = FB.mockRows;
      FB.mockReplies ??= await fromMock("feedback_replies");
      FB.replies = FB.mockReplies;
      FB.people = Object.fromEntries((await fromMock("profiles")).map((p) => [p.id, p]));
    } else {
      const { data, error } = await db.from("feedback").select("*").order("created_at", { ascending: false }).limit(2000);
      if (error) throw new Error(error.message);
      FB.rows = data;
      const { data: replies, error: rErr } = await db.from("feedback_replies").select("*").order("created_at").limit(5000);
      if (rErr) throw new Error(rErr.message);
      FB.replies = replies;
      if (me.role === "admin") {
        const { data: people } = await db.from("profiles").select("id, display_name, player_code");
        FB.people = Object.fromEntries((people || []).map((p) => [p.id, p]));
      }
    }
    drawMyFeedback();
    if (me.role === "admin") {
      $("fb-a-who").innerHTML = `<option value="">No login (give their email)</option>` + Object.values(FB.people)
        .filter((p) => p.player_code).sort((a, b) => (a.player_code < b.player_code ? -1 : 1))
        .map((p) => `<option value="${p.id}">${esc(p.player_code)} · ${esc(p.display_name)}</option>`).join("");
      drawFeedbackAdmin();
    }
  } catch (e) { status(`Couldn't load feedback: ${e.message}`, true); }
}

// ---- Sending
$("fb-shot").onchange = () => {
  const f = $("fb-shot").files[0];
  $("fb-shot-note").textContent = !f ? "" : f.size > 5 * 1024 * 1024 ? "That picture is over 5 MB; pick a smaller one."
    : !["image/jpeg", "image/png", "image/webp"].includes(f.type) ? "Pick a JPEG, PNG or WebP picture." : f.name;
};
$("fb-form").onsubmit = async (ev) => {
  ev.preventDefault();
  const msg = $("fb-msg"), kind = $("fb-kind").value, message = $("fb-text").value.trim(), file = $("fb-shot").files[0];
  if (!message && !file) { msg.textContent = "Write a few words about it."; msg.className = "err"; return; }
  if (file && (file.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(file.type))) {
    msg.textContent = $("fb-shot-note").textContent; msg.className = "err"; return;
  }
  $("fb-send").disabled = true; msg.textContent = "Sending…"; msg.className = "msg";
  try {
    let screenshot_path = null;
    if (file && !mock) {
      const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
      screenshot_path = `${me.id}/${new Date().toISOString().replace(/[-:.]/g, "")}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await db.storage.from("feedback").upload(screenshot_path, file, { contentType: file.type });
      if (error) throw new Error(`the screenshot didn't upload (${error.message})`);
    }
    const body = { kind, message, screenshot_path, source: "web", app_version: "web",
      device_model: "Web browser", platform_version: (navigator.userAgentData?.platform || navigator.platform || "").slice(0, 50) };
    if (mock) {
      FB.mockRows.unshift({ id: Date.now(), created_at: new Date().toISOString(), user_id: me.id, status: "new", admin_note: "", ...body });
    } else {
      const res = await callFunction("feedback", { method: "POST", body: JSON.stringify(body) });
      const answer = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
      if (!answer.ok) throw new Error(answer.error || `HTTP ${res.status}`);
    }
    $("fb-text").value = ""; $("fb-shot").value = ""; $("fb-shot-note").textContent = "";
    msg.textContent = "Thank you! It's on its way to the Cue Coach team."; msg.className = "msg";
    await loadFeedback();
  } catch (e) { msg.textContent = `Couldn't send it: ${e.message}`; msg.className = "err"; }
  $("fb-send").disabled = false;
};

function drawMyFeedback() {
  const mine = FB.rows.filter((r) => r.user_id === me.id);
  $("fb-mine-wrap").hidden = !mine.length;
  $("fb-mine").innerHTML = `<tr><th>Sent</th><th>Kind</th><th>What you said</th><th>Status</th></tr>` + mine.map((r) =>
    `<tr><td>${fbDate(r.created_at)}</td><td>${esc(FB_KINDS[r.kind])}</td><td class="fb-text">${esc(firstLine(r))}</td>` +
    `<td>${esc(FB_STATUS[r.status])}${r.status === "fixed" && r.fixed_in ? ` in ${esc(r.fixed_in)}` : ""}</td></tr>` +
    repliesTo(r.id).map((a) => `<tr class="fb-answer-row"><td></td><td colspan="3"><div class="fb-answer">` +
      `<span class="small">Cue Coach answered, ${fbDate(a.created_at)}</span><div class="fb-text">${esc(a.message)}</div></div></td></tr>`).join("")).join("");
}
const repliesTo = (id) => FB.replies.filter((a) => a.feedback_id === id);
const firstLine = (r) => (r.message || (r.shot_reason ? FB_REASONS[r.shot_reason] : "(a screenshot)")).split("\n")[0].slice(0, 120);

// ---- Admin: every report, sorted and answered here
function drawFeedbackAdmin() {
  const st = $("fb-f-status").value, kind = $("fb-f-kind").value, q = $("fb-f-search").value.trim().toLowerCase();
  const who = (r) => {
    const p = FB.people[r.user_id];
    return p ? `${p.display_name || ""}${p.player_code ? ` (${p.player_code})` : ""}` : r.contact_email || (r.user_id ? "A deleted login" : "No login");
  };
  const list = FB.rows.filter((r) => (st === "open" ? ["new", "looking"].includes(r.status) : !st || r.status === st) &&
    (!kind || r.kind === kind) &&
    (!q || [r.message, r.admin_note, who(r), r.recording_id, r.device_model, r.app_version, r.sensor_serial, String(r.id)]
      .some((v) => String(v ?? "").toLowerCase().includes(q))));
  const counts = Object.keys(FB_STATUS).map((s) => [s, FB.rows.filter((r) => r.status === s).length]).filter(([, n]) => n);
  $("fb-counts").textContent = `${FB.rows.length} reports` + (counts.length ? ": " + counts.map(([s, n]) => `${n} ${FB_STATUS[s].toLowerCase()}`).join(", ") : "") +
    ` · ${FB.rows.filter((r) => r.kind === "idea").length} improvement ideas`;
  $("fb-list").innerHTML = list.length ? list.map((r) => {
    const details = [r.app_version && `App ${r.app_version}`, r.engine_version && `engine ${r.engine_version}`, r.device_model, r.platform_version,
      r.sensor_serial && `sensor ${r.sensor_serial}`].filter(Boolean).map(esc).join(" · ");
    const shot = r.recording_id ? (() => {
      const q = new URLSearchParams({ recording: r.recording_id, stroke: r.stroke_index ?? 0, label: `Feedback #${r.id}` });
      return `Shot <a href="viewer.html?${q}" target="_blank" rel="noopener">${esc(r.recording_id)}${r.stroke_index != null ? `, stroke ${r.stroke_index + 1}` : ""}</a>`;
    })() : "";
    return `<div class="fb-card fb-${r.status}" data-id="${r.id}">
      <div class="fb-head"><span class="tag">${esc(FB_KINDS[r.kind])}</span> <b>${esc(who(r))}</b>
        <span class="small">${fbDate(r.created_at)} · ${esc(FB_SOURCE[r.source] || r.source)} · #${r.id}${r.source !== "email" && !r.emailed_at && !["testflight", "play"].includes(r.source) ? " · not emailed" : ""}</span></div>
      ${r.shot_reason ? `<div><b>${esc(FB_REASONS[r.shot_reason])}</b></div>` : ""}
      <div class="fb-text">${esc(r.message) || '<span class="small">(no message)</span>'}</div>
      ${shot || r.screenshot_path || details ? `<div class="small">${[shot, r.screenshot_path ? `<button class="link" data-shot="${esc(r.screenshot_path)}">Screenshot</button>` : "", details].filter(Boolean).join(" · ")}</div>` : ""}
      ${repliesTo(r.id).map((a) => `<div class="fb-answer"><span class="small">Answered by ${esc(FB.people[a.author_id]?.display_name || "an admin")}, ${fbDate(a.created_at)}${
        a.emailed_at ? ` · emailed to ${esc(a.emailed_to)}` : " · not emailed"}</span><div class="fb-text">${esc(a.message)}</div></div>`).join("")}
      ${canEmail(r) ? `<div class="fb-reply">
        <div class="fb-starts small">Start from: ${FB_STARTS.map(([label], i) => `<button type="button" class="link" data-start="${i}">${esc(label)}</button>`).join(" · ")}</div>
        <textarea rows="2" maxlength="5000" placeholder="Answer ${esc(firstName(r) || "them")}: emailed to them; if they write back, it goes to katherine@"></textarea>
        <div><button type="button" class="fb-send-reply">Send answer</button> <span class="small fb-reply-msg"></span></div>
      </div>` : `<div class="small">No email address for this report, so it can't be answered from here.</div>`}
      <div class="fb-controls">
        <label>Status <select data-f="status">${Object.entries(FB_STATUS).map(([k, v]) => `<option value="${k}"${k === r.status ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
        <label>Fixed in <input data-f="fixed_in" value="${esc(r.fixed_in)}" placeholder="1.0 (3)" size="8"></label>
        <label>Duplicate of # <input data-f="duplicate_of" value="${esc(r.duplicate_of)}" inputmode="numeric" size="5"></label>
        <label class="grow">To-do item <input data-f="todo_ref" value="${esc(r.todo_ref)}" placeholder="todo_later.md: …"></label>
        <label class="wide">Our note <textarea data-f="admin_note" rows="2">${esc(r.admin_note)}</textarea></label>
        <label><input type="checkbox" data-f="answered_at"${r.answered_at ? " checked" : ""}> Tester told</label>
        <span class="small fb-saved"></span>
      </div>
    </div>`;
  }).join("") : `<p class="small">Nothing to show with these filters.</p>`;
  $("fb-list").querySelectorAll("[data-shot]").forEach((b) => (b.onclick = () => openScreenshot(b.dataset.shot)));
  $("fb-list").querySelectorAll("[data-f]").forEach((el) => (el.onchange = () => saveFeedbackField(el)));
  $("fb-list").querySelectorAll("[data-start]").forEach((b) => (b.onclick = () => {
    const box = b.closest(".fb-reply").querySelector("textarea");
    box.value = FB_STARTS[Number(b.dataset.start)][1] + box.value.trim();
    box.focus();
  }));
  $("fb-list").querySelectorAll(".fb-send-reply").forEach((b) => (b.onclick = () => sendReply(b)));
}

const canEmail = (r) => !!(r.user_id ? FB.people[r.user_id] : r.contact_email);
const firstName = (r) => (FB.people[r.user_id]?.display_name || "").trim().split(/\s+/)[0];

async function sendReply(button) {
  const card = button.closest(".fb-card"), id = Number(card.dataset.id), r = FB.rows.find((x) => x.id === id);
  const box = card.querySelector(".fb-reply textarea"), note = card.querySelector(".fb-reply-msg");
  const message = box.value.trim();
  if (!message) { note.textContent = "Write the answer first."; note.className = "small err fb-reply-msg"; return; }
  const who = FB.people[r.user_id]?.display_name || r.contact_email || "this tester";
  if (!confirm(`Email this answer to ${who}?`)) return;
  button.disabled = true; note.textContent = "Sending…"; note.className = "small fb-reply-msg";
  try {
    let answer;
    if (mock) {
      answer = { ok: true, id: Date.now(), emailed: true, to: r.contact_email || "player@example.com",
                 status: ["new", "looking"].includes(r.status) ? "answered" : r.status };
    } else {
      const res = await callFunction("feedback", { method: "POST", body: JSON.stringify({ action: "reply", feedback_id: id, message }) });
      answer = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
    }
    if (!answer.ok) throw new Error(answer.error || "not sent");
    const now = new Date().toISOString();
    FB.replies.push({ id: answer.id, feedback_id: id, created_at: now, author_id: me.id, message,
                      emailed_to: answer.emailed ? answer.to : null, emailed_at: answer.emailed ? now : null });
    if (answer.emailed) Object.assign(r, { status: answer.status, answered_at: now });
    drawFeedbackAdmin();
    drawMyFeedback();
    if (!answer.emailed) status(answer.error || "Saved, but not emailed.", true);
  } catch (e) {
    button.disabled = false; note.textContent = `Not sent: ${e.message}`; note.className = "small err fb-reply-msg";
  }
}

async function openScreenshot(path) {
  if (mock) return status("mock: no screenshots stored");
  const tab = window.open("", "_blank");
  const { data, error } = await db.storage.from("feedback").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) { tab?.close(); return status(`Couldn't open the screenshot: ${error?.message || "not found"}`, true); }
  if (tab) tab.location = data.signedUrl; else location.href = data.signedUrl;
}

async function saveFeedbackField(el) {
  const card = el.closest(".fb-card"), id = Number(card.dataset.id), f = el.dataset.f, saved = card.querySelector(".fb-saved");
  let v = el.type === "checkbox" ? (el.checked ? new Date().toISOString() : null) : el.value.trim();
  if (f === "duplicate_of") {
    if (v && !/^\d+$/.test(v)) { saved.textContent = "Duplicate of: a report number"; saved.className = "small err fb-saved"; return; }
    v = v ? Number(v) : null;
  } else if (["fixed_in", "todo_ref"].includes(f)) v = v || null;
  const fields = { [f]: v };
  if (f === "duplicate_of" && v) fields.status = "duplicate";
  if (f === "fixed_in" && v) fields.status = "fixed";
  saved.textContent = "Saving…"; saved.className = "small fb-saved";
  try {
    if (!mock) {
      const { error } = await db.from("feedback").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    }
    Object.assign(FB.rows.find((r) => r.id === id), fields);
    if (fields.status && f !== "status") card.querySelector('[data-f="status"]').value = fields.status;
    saved.textContent = "Saved"; setTimeout(() => (saved.textContent = ""), 1500);
    $("fb-counts").textContent = $("fb-counts").textContent;  // the counts refresh on the next filter change
  } catch (e) { saved.textContent = `Not saved: ${e.message}`; saved.className = "small err fb-saved"; }
}

// ---- Admin: a report added by hand (from email, TestFlight or Google Play)
$("fb-a-who").onchange = () => ($("fb-a-email-wrap").hidden = !!$("fb-a-who").value);
$("fb-add").onsubmit = async (ev) => {
  ev.preventDefault();
  const msg = $("fb-a-msg"), uid = $("fb-a-who").value || null, email = $("fb-a-email").value.trim() || null;
  const row = { user_id: uid, contact_email: uid ? null : email, kind: $("fb-a-kind").value, source: $("fb-a-source").value,
    message: $("fb-a-text").value.trim() };
  if (!row.message) { msg.textContent = "Write what they said."; msg.className = "err"; return; }
  try {
    if (mock) FB.mockRows.unshift({ id: Date.now(), created_at: new Date().toISOString(), status: "new", admin_note: "", ...row });
    else {
      const { error } = await db.from("feedback").insert(row);
      if (error) throw new Error(error.message);
    }
    $("fb-a-text").value = ""; $("fb-a-email").value = "";
    msg.textContent = "Added."; msg.className = "msg";
    await loadFeedback();
  } catch (e) { msg.textContent = `Not added: ${e.message}`; msg.className = "err"; }
};
