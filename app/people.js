// People (admins): invite someone, change roles. Split out of index.html 2026-11-28 (structure plan step 5);
// no change in what it does. Uses index.html's $, esc, mock, db, me, show, status, callFunction, loadTeam.

// ---- Admin: People (2026-11-05). The people edge function does the work with the service key;
// this page only sends the admin's own login (cloud/production/supabase/functions/people).
async function peopleCall(method, body) {
  if (mock) {
    if (method === "GET") return { ok: true, people: await fromMock("people") };
    return { ok: true, note: "mock: nothing sent", link: body.link ? "https://example.com/mock-link" : null };
  }
  const res = await callFunction("people", { method, body: body ? JSON.stringify(body) : undefined });
  const answer = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!answer.ok) throw new Error(answer.error || `HTTP ${res.status}`);
  return answer;
}

const when = (t) => (t ? new Date(t).toLocaleDateString([], { month: "short", day: "numeric" }) : "");
function statusTag(p) {
  if (p.status === "active") return `<span class="tag active">Signed in</span> <span class="small">${when(p.last_sign_in_at)}</span>`;
  if (p.status === "invited") return `<span class="tag invited">Invited</span> <span class="small">${when(p.invited_at)}</span>`;
  if (p.status === "not invited") return `<span class="tag">Email set, no link sent</span>`;
  return `<span class="tag">No login yet</span>`;
}

async function loadPeople(note) {
  setAddr("#team/people");
  show("who", "people");
  $("title").textContent = "People";
  status("Loading…");
  try {
    const { people } = await peopleCall("GET");
    const roles = ["player", "coach", "admin", "staff"];
    $("people-table").innerHTML = "<tr><th>Code</th><th>Name</th><th>Email</th><th>Role</th><th>Login</th><th>Shots</th><th></th></tr>" +
      people.map((p) => `<tr data-id="${esc(p.id)}">
        <td>${esc(p.player_code ?? "")}</td><td>${esc(p.name)}</td><td>${esc(p.email ?? "")}</td>
        <td><select class="role" ${p.id === me.id ? "disabled title=\"You can't change your own role\"" : ""}>${roles.map((r) => `<option ${r === p.role ? "selected" : ""}>${r}</option>`).join("")}</select></td>
        <td>${statusTag(p)}</td>
        <td>${p.recordings}${p.last_recording_at ? ` <span class="small">last ${when(p.last_recording_at)}</span>` : ""}</td>
        <td>${p.email
          ? `<button class="link resend">Send link</button> · <button class="link copylink">Copy link</button>`
          : `<button class="link fill">Invite…</button>`}</td></tr>`).join("");
    $("people-table").querySelectorAll("tr[data-id]").forEach((tr) => {
      const p = people.find((x) => x.id === tr.dataset.id);
      tr.querySelector(".role").onchange = (e) => act({ action: "role", id: p.id, role: e.target.value });
      tr.querySelector(".resend")?.addEventListener("click", () => act({ action: "resend", id: p.id }));
      tr.querySelector(".copylink")?.addEventListener("click", () => act({ action: "resend", id: p.id, link: true }));
      tr.querySelector(".fill")?.addEventListener("click", () => {
        $("inv-code").value = p.player_code ?? ""; $("inv-name").value = p.name; $("inv-email").value = ""; $("inv-email").focus();
      });
    });
    status("");
    if (note) peopleMsg(note);
  } catch (e) { status(e.message, true); }
}

function peopleMsg(text, bad, link) {
  $("people-msg").textContent = text || "";
  $("people-msg").className = bad ? "err" : "msg";
  $("linkbox").hidden = !link;
  if (link) $("link-out").value = link;
}

async function act(body) {
  peopleMsg("Working…");
  try {
    const r = await peopleCall("POST", body);
    if (body.action === "invite" && invitingLead) {
      await saveLead(invitingLead, { status: "invited", profile_id: r.id });
      invitingLead = null;
    }
    await loadPeople();
    peopleMsg(r.link ? `${r.note}. This link works once and expires in about an hour: send it only to them.` : r.note, false, r.link);
  } catch (e) { peopleMsg(e.message, true); if (body.action === "role") loadPeople(); }
}

function inviteBody(link) {
  return { action: "invite", code: $("inv-code").value, name: $("inv-name").value, email: $("inv-email").value, role: $("inv-role").value || undefined, link };
}
$("invite-form").onsubmit = (e) => { e.preventDefault(); act(inviteBody(false)); };
$("inv-link").onclick = () => { if ($("invite-form").reportValidity()) act(inviteBody(true)); };
$("link-copy").onclick = async () => { await navigator.clipboard.writeText($("link-out").value); $("link-copy").textContent = "Copied"; setTimeout(() => ($("link-copy").textContent = "Copy"), 1500); };
$("people-link").onclick = () => loadPeople();
$("people-back").onclick = () => loadTeam();
