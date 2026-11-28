// Inventory (admins and staff). Split out of index.html 2026-11-28 (structure plan step 5); no change in
// what it does. Uses index.html's $, esc, mock, db, show, status, fromMock, loadTeam.

// ---- Inventory (2026-11-08), for admins and staff. Sensors are checked in on the CC Receiving
// app (record_receiving); the tables are read-only here and a sensor moves only through
// move_inventory, which keeps every move in inventory_events.
const LOCATIONS = [["inventory", "Inventory"], ["quality_hold", "Quality hold"], ["sold", "Sold"], ["returned", "Returned"], ["demo", "Demo / loaner"], ["scrapped", "Scrapped"]];
const place = (loc) => (LOCATIONS.find(([v]) => v === loc) || [, loc])[1];
let stockItems = [], stockChecks = [], stockEvents = [], stockShown = [], stockOpen = null;
$("stock-loc").innerHTML += LOCATIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");

async function loadStock() {
  setAddr("#team/inventory");
  show("who", "stock");
  $("title").textContent = "Inventory";
  status("Loading…");
  try {
    if (mock) [stockItems, stockChecks, stockEvents] = await Promise.all(["inventory_items", "receiving_inspections", "inventory_events"].map(fromMock));
    else {
      const [a, b, c] = await Promise.all([
        db.from("inventory_items").select("*").order("updated_at", { ascending: false }),
        db.from("receiving_inspections").select("*").order("inspected_at", { ascending: false }),
        db.from("inventory_events").select("*").order("at", { ascending: false }),
      ]);
      for (const r of [a, b, c]) if (r.error) throw new Error(r.error.message);
      [stockItems, stockChecks, stockEvents] = [a.data, b.data, c.data];
    }
    drawStock();
    status("");
  } catch (e) { status(`Inventory: ${e.message}`, true); }
}

const lastCheck = (it) => stockChecks.find((c) => c.id === it.last_inspection_id) || stockChecks.find((c) => c.serial === it.serial);

function drawStock() {
  const q = $("stock-search").value.trim().toLowerCase(), loc = $("stock-loc").value;
  stockShown = stockItems.filter((it) => {
    const c = lastCheck(it) || {};
    return (!loc || it.location === loc) &&
      (!q || [it.serial, c.sensor_name, it.hold_reasons, it.sold_to_name, it.sold_to_email, it.square_order_id, c.note].join(" ").toLowerCase().includes(q));
  });
  const n = (l) => stockItems.filter((it) => it.location === l).length;
  $("stock-counts").innerHTML = `<span><b>${stockItems.length}</b> sensors</span>` +
    LOCATIONS.filter(([v]) => n(v) || ["inventory", "quality_hold", "sold"].includes(v)).map(([v, l]) => `<span><b>${n(v)}</b> ${l.toLowerCase()}</span>`).join("");
  const rate = (v) => (v == null ? "–" : `${fmt(v, 0)} Hz`);
  $("stock-table").innerHTML = "<tr><th>Serial</th><th>Name</th><th>Firmware</th><th>Where</th><th>Last check</th><th>Why / who</th><th></th></tr>" +
    (stockShown.length ? "" : `<tr><td colspan="7" class="small">${stockItems.length ? "No sensors match." : "No sensors checked in yet: use the CC Receiving app."}</td></tr>`) +
    stockShown.map((it) => {
      const c = lastCheck(it) || {};
      const why = it.location === "sold" ? `${esc(it.sold_to_name || "")}${it.sold_to_email ? ` <span class="small">${esc(it.sold_to_email)}</span>` : ""}${it.square_order_id ? `<br><span class="small">Square ${esc(it.square_order_id)}</span>` : ""}`
        : esc(it.hold_reasons || "");
      return `<tr class="clickable" data-sn="${esc(it.serial)}">
        <td class="sn">${esc(it.serial)}</td><td>${esc(c.sensor_name || "")}</td><td>${esc(c.firmware || "")}</td>
        <td><span class="tag ${esc(it.location)}">${esc(place(it.location))}</span><br><span class="small">since ${when(it.updated_at)}</span></td>
        <td>${c.id ? `<span class="${c.passed ? "pass" : "fail"}">${c.passed ? "PASS" : "FAIL"}</span> ${when(c.inspected_at)}<br><span class="small">accel ${rate(c.accel_rate_hz)} · gyro ${rate(c.gyro_rate_hz)}</span>` : ""}</td>
        <td>${why}</td>
        <td><select class="stock-move" aria-label="Move ${esc(it.serial)}"><option value="">Move…</option>${LOCATIONS.filter(([v]) => v !== it.location).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></td></tr>` +
        (stockOpen === it.serial ? `<tr class="detail"><td colspan="7">${stockDetail(it)}</td></tr>` : "");
    }).join("");
  $("stock-table").querySelectorAll("tr[data-sn]").forEach((tr) => {
    const it = stockItems.find((x) => x.serial === tr.dataset.sn);
    tr.onclick = (e) => { if (e.target.closest("select")) return; stockOpen = stockOpen === it.serial ? null : it.serial; drawStock(); };
    tr.querySelector(".stock-move").onchange = (e) => { const to = e.target.value; e.target.value = ""; if (to) moveStock(it, to); };
  });
}

/** Every check of one sensor (each one's results) and every move, newest first. */
function stockDetail(it) {
  const mark = { pass: '<span class="pass">✓</span>', fail: '<span class="fail">✗</span>', not_checked: '<span class="small">–</span>' };
  const checks = stockChecks.filter((c) => c.serial === it.serial).map((c) => `<li><b class="${c.passed ? "pass" : "fail"}">${c.passed ? "PASS" : "FAIL"}</b>
      ${new Date(c.inspected_at).toLocaleString()}${c.device ? ` <span class="small">· ${esc(c.device)}</span>` : ""}${c.hardware ? ` <span class="small">· hardware ${esc(c.hardware)}</span>` : ""}${c.note ? ` · ${esc(c.note)}` : ""}
      <ul>${(c.checks || []).map((k) => `<li>${mark[k.result] || ""} ${esc(k.label)}: ${esc(k.actual ?? (k.result === "not_checked" ? "not readable" : "none"))} <span class="small">(expected ${esc(k.expected)})</span></li>`).join("")}</ul></li>`).join("");
  const events = stockEvents.filter((e) => e.serial === it.serial).map((e) =>
    `<li>${new Date(e.at).toLocaleString()}: ${e.from_location === e.to_location ? `checked again, stays in <b>${esc(place(e.to_location))}</b>`
      : `${e.from_location ? `${esc(place(e.from_location))} → ` : ""}<b>${esc(place(e.to_location))}</b>`}${e.reason ? ` · ${esc(e.reason)}` : ""}</li>`).join("");
  return `<div class="detail"><b>Checks</b><ul>${checks || "<li class='small'>None</li>"}</ul><b>History</b><ul>${events || "<li class='small'>None</li>"}</ul></div>`;
}

async function moveStock(it, to) {
  let reason = null, buyer = null, email = null, order = null;
  if (to === "sold") {
    buyer = prompt(`Sold ${it.serial}: buyer's name`);
    if (buyer === null) return;
    email = prompt("Buyer's email (optional)") || null;
    order = prompt("Square order or receipt number (optional)") || null;
    reason = "Sold (entered on the web page)";
  } else {
    reason = prompt(`Move ${it.serial} from ${place(it.location)} to ${place(to)}. Why? (kept in its history)`);
    if (reason === null) return;
  }
  $("stock-msg").className = "msg";
  try {
    if (!mock) {
      const { error } = await db.rpc("move_inventory", { p_serial: it.serial, p_to: to, p_reason: reason || null,
        p_sold_to_name: buyer || null, p_sold_to_email: email, p_square_order_id: order });
      if (error) throw new Error(error.message);
      await loadStock();
    } else {
      stockEvents.unshift({ serial: it.serial, at: new Date().toISOString(), from_location: it.location, to_location: to, reason });
      Object.assign(it, { location: to, updated_at: new Date().toISOString(), hold_reasons: to === "quality_hold" ? reason : null },
        to === "sold" ? { sold_to_name: buyer, sold_to_email: email, square_order_id: order } : {});
      drawStock();
    }
    $("stock-msg").textContent = `${it.serial} moved to ${place(to)}.`;
  } catch (e) { $("stock-msg").textContent = `Not moved: ${e.message}`; $("stock-msg").className = "err"; }
}

/** The sensors shown (search and location applied) as a CSV file. */
function downloadStockCsv() {
  const c = (it) => lastCheck(it) || {};
  const cols = [["Serial", (it) => it.serial], ["Name", (it) => c(it).sensor_name], ["Firmware", (it) => c(it).firmware], ["Hardware", (it) => c(it).hardware],
    ["Location", (it) => place(it.location)], ["Since", (it) => it.updated_at], ["Received", (it) => it.received_at],
    ["Last check", (it) => (c(it).id ? (c(it).passed ? "PASS" : "FAIL") : "")], ["Checked at", (it) => c(it).inspected_at],
    ["Accel Hz", (it) => c(it).accel_rate_hz?.toFixed(1)], ["Gyro Hz", (it) => c(it).gyro_rate_hz?.toFixed(1)],
    ["Hold reasons", (it) => it.hold_reasons], ["Buyer", (it) => it.sold_to_name], ["Buyer email", (it) => it.sold_to_email],
    ["Sold at", (it) => it.sold_at], ["Square order", (it) => it.square_order_id], ["Note", (it) => c(it).note]];
  const cell = (v) => { let t = String(v ?? ""); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  const csv = [cols.map(([h]) => cell(h)).join(","), ...stockShown.map((it) => cols.map(([, f]) => cell(f(it))).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `cue-coach-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$("stock-link").onclick = () => loadStock();
$("stock-back").onclick = () => loadTeam();
$("stock-csv").onclick = downloadStockCsv;
["stock-search", "stock-loc"].forEach((id) => ($(id).oninput = drawStock));
