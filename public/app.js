// Plain JS front end over the REST API. No framework.
const KEY = "demo-key"; // public demo key; the data is synthetic
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mmss = (s) => (s == null ? "--:--" : `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json", "x-api-key": KEY } : { "x-api-key": KEY }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get("content-type") || "";
  return { status: r.status, body: ct.includes("json") ? await r.json() : await r.text() };
};
let state = { calls: [], current: null, checklist: null };
const VIDEO = new URLSearchParams(location.search).has("video");
const STATUS = { present: "FOUND", missing: "MISSING", unclear: "UNCLEAR", mismatch: "MISMATCH" };

async function loadCalls() {
  state.calls = (await api("GET", "/calls")).body.calls;
  $("#call-list").innerHTML = state.calls.map((c, i) => {
    const st = c.registration_status;
    const chip = st.startsWith("charged") ? (st === "charged_override" ? '<span class="chip override">CHARGED AFTER OVERRIDE</span>' : '<span class="chip charged">CHARGED</span>')
      : st === "held" ? '<span class="chip held">FIRST CHARGE HELD</span>'
      : c.blocking.length ? `<span class="chip blocked">${c.blocking.length} NOT CONFIRMED</span>` : '<span class="chip ok">ALL ITEMS FOUND</span>';
    return `<li data-id="${c.id}" class="${state.current?.id === c.id ? "active" : ""}"><div class="t">${i + 1}. ${esc(c.title)}</div><div class="fine">${esc(c.member_name)}${c.family_signup ? " · family signup" : ""}</div>${chip}</li>`;
  }).join("");
  document.querySelectorAll("#call-list li").forEach((li) => li.onclick = () => select(li.dataset.id));
}

async function select(id, opts = {}) {
  const c = (await api("GET", `/calls/${id}`)).body;
  state.current = c;
  await loadCalls();
  $("#call-title").textContent = `Transcript · ${c.title}`;
  $("#meta").innerHTML = `Plan record: <b>${esc(c.plan.name)}</b>, $${(c.plan.price_cents / 100).toFixed(2)} per ${c.plan.frequency} · Registration <code>${c.registration.id}</code>`;
  const hl = {};
  for (const it of c.ledger.items) for (const sid of it.segment_ids) if (!hl[sid] || it.status !== "present") hl[sid] = it.status;
  $("#transcript").innerHTML = c.segments.map((s) => `<div class="seg ${s.speaker} ${hl[s.id] ? "hl-" + hl[s.id] : ""}" id="seg-${s.id}"><span class="ts">${mmss(s.start)}</span><span class="sp">${s.speaker}</span><span>${esc(s.text)}</span></div>`).join("");
  $("#det").textContent = `detector: ${c.ledger.detector}`;
  const fam = $("#family");
  fam.className = c.ledger.family_signup ? "on" : "";
  fam.innerHTML = c.ledger.family_signup ? `<b>Family signup.</b> Section 4.2(h) items also required. ${esc(c.ledger.family_reason)}` : "Self signup: 7 phone-registration items required.";
  renderLedger(c, opts.compact);
  $("#result").innerHTML = "";
  await renderAudit();
}

function renderLedger(c, compact) {
  $("#ledger").innerHTML = c.ledger.items.map((i) => `
    <div class="item ${i.status} ${compact && i.status === "present" ? "compact" : ""}" data-item="${i.item_id}" data-seg="${i.segment_ids[0] ?? ""}">
      <div class="row"><span class="lbl">${i.item_id}. ${esc(i.label)}</span><span class="st">${STATUS[i.status]}</span></div>
      <div class="cl">${esc(i.clause)} · found by ${i.source}</div>
      ${i.quote ? `<div class="q"><span class="ts">${mmss(i.start)}</span>"${esc(i.quote)}"</div>` : ""}
      ${i.detail && i.status !== "present" ? `<div class="d">${esc(i.detail)}</div>` : ""}
      ${i.ack !== "n/a" ? `<div class="ack">Caller ${mmss(i.ack_start)}: "${esc(i.ack_quote)}" · ${i.ack === "explicit" ? "clear yes" : i.ack === "ambiguous" ? "not a clear yes" : "no reply"}</div>` : ""}
    </div>`).join("");
  document.querySelectorAll(".item").forEach((el) => el.onclick = () => focusSeg(el.dataset.seg));
}

function focusSeg(segId) {
  document.querySelectorAll(".seg.focus").forEach((e) => e.classList.remove("focus"));
  const el = segId && document.getElementById(`seg-${segId}`);
  if (el) { el.classList.add("focus"); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
}

async function renderAudit() {
  const r = state.current.registration;
  const a = (await api("GET", `/registrations/${r.id}/audit`)).body.entries;
  $("#audit").innerHTML = `<h3>Audit log</h3>` + a.map((e) => `<div class="a">${esc(e.at.slice(11, 19))} UTC  ${esc(e.actor)}  <b>${esc(e.action)}</b> ${esc(summary(e))}</div>`).join("");
}
const summary = (e) => e.action === "first_charge_held" ? `missing: ${e.detail.missing.join(", ")}` : e.action === "override_granted" ? `"${e.detail.reason}"` : e.action === "first_charge_made" ? `${e.detail.amount} (mock)${e.detail.override_id ? " via override" : ""}` : `blocking: ${e.detail.blocking.join(", ") || "none"}`;

async function charge() {
  const r = await api("POST", `/registrations/${state.current.registration.id}/first-charge`);
  const b = r.body;
  let html = `<div class="res r${r.status}"><span class="code">POST /registrations/${state.current.registration.id}/first-charge → ${r.status}</span>`;
  if (r.status === 409) html += `<div><b>First charge held.</b></div>` + b.missing.map((m) => `<div class="miss"><b>${m.id} ${m.status.toUpperCase()}${m.at ? ` at ${m.at}` : ""}</b>${m.quote && m.status !== "missing" ? ` "${esc(m.quote)}"` : ""}<br><span>${esc(m.detail || m.label)}</span></div>`).join("");
  else if (r.status !== 200) html += `<div>${esc(b.error)}</div>`;
  else html += `<div><b>${b.result === "charged" ? "Charged" : "Already charged"} ${esc(b.amount)}</b> (mock processor, no real card)${b.via_override ? " · allowed by supervisor override" : ""}</div>`;
  $("#result").innerHTML = html + "</div>";
  await loadCalls();
  await renderAudit();
  return r;
}

async function override(sup, reason) {
  if (sup !== undefined) { $("#sup").value = sup; $("#reason").value = reason; }
  const r = await api("POST", `/registrations/${state.current.registration.id}/override`, { supervisor_id: $("#sup").value, reason: $("#reason").value });
  $("#result").innerHTML = `<div class="res r${r.status}"><span class="code">POST /registrations/${state.current.registration.id}/override → ${r.status}</span><div>${r.status === 201 ? `Override <b>${r.body.override_id}</b> by ${esc(r.body.supervisor_id)} for ${r.body.overrides_items.join(", ")}. Logged.` : esc(r.body.error)}</div></div>`;
  await renderAudit();
  return r;
}

async function showEvidence() {
  const r = await api("GET", `/calls/${state.current.id}/evidence-pack`);
  const body = VIDEO ? r.body.replace(/ \(https?:[^)]*\)/g, "") : r.body;
  openModal(`<h3>GET /calls/${state.current.id}/evidence-pack (markdown)</h3><pre>${esc(body)}</pre>`);
}

async function showChecklist() {
  const c = state.checklist ?? (state.checklist = (await api("GET", "/checklist")).body);
  openModal(`<h3>Checklist from the public Terms of Service, effective ${c.source.effective}</h3>
    <p class="fine">Source: ${VIDEO ? "GoGoGrandparent's public Terms of Service page" : `<a href="${c.source.url}" target="_blank">${c.source.url}</a>`} (checked ${c.source.checked}). Toll-free number and email as printed there: ${esc(c.contact.toll_free)}, ${esc(c.contact.email)}.</p>
    <table><tr><th>ID</th><th>Clause</th><th>As printed in the Terms</th><th>Needs a clear yes</th></tr>
    ${c.items.map((i) => `<tr data-group="${i.group}"><td>${i.id}</td><td>${esc(i.clause)}</td><td class="tt">"${esc(i.terms_text)}"</td><td>${i.requires_ack ? "yes" : ""}</td></tr>`).join("")}</table>`);
}

function openModal(html) { $("#modal-body").innerHTML = html; $("#modal").hidden = false; $("#modal .box").scrollTop = 0; }
function closeModal() { $("#modal").hidden = true; }
function endCard(html) { const e = $("#endcard"); if (!html) { e.hidden = true; return; } e.innerHTML = html; e.hidden = false; }
function setCaption(t) { const c = $("#caption"); if (!t) { c.hidden = true; return; } c.textContent = t; c.hidden = false; }

$("#btn-charge").onclick = charge;
$("#btn-evidence").onclick = showEvidence;
$("#btn-checklist").onclick = showChecklist;
$("#modal-close").onclick = closeModal;
$("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
$("#override-form").onsubmit = (e) => { e.preventDefault(); override(); };

window.cl = { endCard, select, charge, override, showEvidence, showChecklist, closeModal, setCaption, focusSeg, reset: () => api("POST", "/demo/reset") };
(async () => {
  await loadCalls();
  const want = new URLSearchParams(location.search).get("call");
  await select(want || state.calls[0].id);
})();
