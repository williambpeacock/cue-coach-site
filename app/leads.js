// Leads (admins and staff). Split out of index.html 2026-11-28 (structure plan step 5); no change in what
// it does. Uses index.html's $, esc, mock, db, me, show, status, fromMock, loadTeam.

// ---- Leads (2026-11-05), for admins and staff. Read and updated straight from the leads table:
// its database rules let only admins and staff in, only status, notes and the login link change,
// and only admins delete.
const LEAD_STATUSES = [["new", "New"], ["contacted", "Contacted"], ["invited", "Invited"], ["tester", "Tester"], ["customer", "Customer"], ["not_interested", "Not interested"]];
let leadRows = [], invitingLead = null;
$("lead-status").innerHTML += LEAD_STATUSES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");

async function loadLeads() {
  setAddr("#team/leads");
  show("who", "leads");
  $("title").textContent = "Leads";
  status("Loading…");
  try {
    if (mock) leadRows = await fromMock("leads");
    else {
      const { data, error } = await db.from("leads").select("*").order("last_seen_at", { ascending: false });
      if (error) throw new Error(`leads: ${error.message}`);
      leadRows = data;
    }
    drawLeads();
    status("");
  } catch (e) { status(e.message, true); }
}

function drawLeads() {
  const q = $("lead-search").value.trim().toLowerCase(), st = $("lead-status").value, beta = $("lead-beta").checked;
  const shown = leadRows.filter((l) =>
    (st === "" || (st === "open" ? !["customer", "not_interested"].includes(l.status) : l.status === st)) &&
    (!beta || l.beta) &&
    (!q || [l.name, l.email, l.cue, l.notes, l.interest].join(" ").toLowerCase().includes(q)));
  const n = (f) => leadRows.filter(f).length;
  $("lead-counts").innerHTML = `<span><b>${leadRows.length}</b> leads</span><span><b>${n((l) => l.status === "new")}</b> new</span>` +
    `<span><b>${n((l) => l.beta)}</b> want to beta test</span><span><b>${n((l) => l.status === "tester")}</b> testers</span><span><b>${n((l) => l.status === "customer")}</b> customers</span>`;
  const isAdmin = me.role === "admin";
  document.querySelectorAll("#leads .admin-only").forEach((el) => (el.hidden = !isAdmin));
  $("leads-table").innerHTML = "<tr><th>Signed up</th><th>Name</th><th>Email</th><th>Is a</th><th>Beta</th><th>Cue</th><th>Status</th><th>Notes</th><th></th></tr>" +
    (shown.length ? "" : `<tr><td colspan="9" class="small">No leads match.</td></tr>`) +
    shown.map((l) => `<tr data-id="${esc(l.id)}">
      <td>${when(l.first_seen_at)}${l.signups > 1 ? ` <span class="small">×${l.signups}</span>` : ""}</td>
      <td>${esc(l.name)}</td><td><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></td>
      <td>${esc(l.interest)}</td><td>${l.beta ? "Yes" : ""}</td><td>${esc(l.cue)}</td>
      <td><select class="lead-st">${LEAD_STATUSES.map(([v, t]) => `<option value="${v}" ${v === l.status ? "selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><textarea class="lead-notes" maxlength="4000" aria-label="Notes">${esc(l.notes)}</textarea></td>
      <td>${l.profile_id ? `<span class="small">Has a login</span>` : isAdmin ? `<button class="link lead-invite">Invite…</button>` : ""}
        ${isAdmin ? `<br><button class="link lead-delete" title="Remove this lead for good (a test, or they asked to be forgotten)">Delete</button>` : ""}</td></tr>`).join("");
  $("leads-table").querySelectorAll("tr[data-id]").forEach((tr) => {
    const l = leadRows.find((x) => x.id === tr.dataset.id);
    tr.querySelector(".lead-st").onchange = (e) => saveLead(l.id, { status: e.target.value });
    const notes = tr.querySelector(".lead-notes");
    notes.onchange = () => saveLead(l.id, { notes: notes.value });
    tr.querySelector(".lead-invite")?.addEventListener("click", () => inviteLead(l));
    tr.querySelector(".lead-delete")?.addEventListener("click", () => deleteLead(l));
  });
  leadsShown = shown;
}
let leadsShown = [];

async function deleteLead(l) {
  if (!confirm(`Delete ${l.name} <${l.email}> for good? This can't be undone. (Their login, if they have one, stays.)`)) return;
  $("leads-msg").className = "msg";
  try {
    if (!mock) {
      const { error, count } = await db.from("leads").delete({ count: "exact" }).eq("id", l.id);
      if (error) throw new Error(error.message);
      if (!count) throw new Error("not allowed");
    }
    leadRows = leadRows.filter((x) => x.id !== l.id);
    drawLeads();
    $("leads-msg").textContent = `Deleted ${l.name}.`;
  } catch (e) { $("leads-msg").textContent = `Not deleted: ${e.message}`; $("leads-msg").className = "err"; }
}

/** The leads shown (search and filters applied) as a CSV file. */
function downloadLeadsCsv() {
  const cols = [["Signed up", (l) => l.first_seen_at], ["Last signed up", (l) => l.last_seen_at], ["Sign-ups", (l) => l.signups],
    ["Name", (l) => l.name], ["Email", (l) => l.email], ["Is a", (l) => l.interest], ["Beta", (l) => (l.beta ? "yes" : "no")],
    ["Cue", (l) => l.cue], ["Status", (l) => (LEAD_STATUSES.find(([v]) => v === l.status) || [, l.status])[1]],
    ["Notes", (l) => l.notes], ["Page", (l) => l.page], ["Source", (l) => l.source]];
  // Quoted; a leading = + - @ gets a ' so a spreadsheet shows it rather than running it.
  const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const csv = [cols.map(([h]) => cell(h)).join(","), ...leadsShown.map((l) => cols.map(([, f]) => cell(f(l))).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `cue-coach-leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("lead-csv").onclick = downloadLeadsCsv;

async function saveLead(id, fields) {
  $("leads-msg").className = "msg";
  try {
    if (!mock) {
      const { error } = await db.from("leads").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
    }
    Object.assign(leadRows.find((l) => l.id === id) ?? {}, fields);
    $("leads-msg").textContent = "Saved.";
    setTimeout(() => ($("leads-msg").textContent = ""), 1500);
  } catch (e) { $("leads-msg").textContent = `Not saved: ${e.message}`; $("leads-msg").className = "err"; }
}

/** A player code for someone new: their initials and the next free number (Josh King -> JK01). */
function suggestCode(name, people) {
  const words = name.toUpperCase().replace(/[^A-Z ]/g, "").split(/\s+/).filter(Boolean);
  const letters = ((words[0]?.[0] ?? "X") + (words.length > 1 ? words[words.length - 1][0] : words[0]?.[1] ?? "X"));
  const taken = new Set(people.map((p) => p.player_code));
  for (let i = 1; i < 100; i++) { const c = letters + String(i).padStart(2, "0"); if (!taken.has(c)) return c; }
  return "";
}

async function inviteLead(l) {
  invitingLead = l.id;
  await loadPeople();
  const { people } = await peopleCall("GET");
  const coach = /coach/i.test(l.interest) && !/both/i.test(l.interest);
  $("inv-code").value = coach ? "" : suggestCode(l.name, people);
  $("inv-name").value = l.name; $("inv-email").value = l.email; $("inv-role").value = coach ? "coach" : "player";
  peopleMsg(`Inviting lead ${l.name}: check the player code, then send. They'll be marked invited on the Leads page.`);
}

$("leads-link").onclick = () => loadLeads();
$("leads-back").onclick = () => loadTeam();
["lead-search", "lead-status", "lead-beta"].forEach((id) => ($(id).oninput = drawLeads));
$("people-link").addEventListener("click", () => (invitingLead = null));
