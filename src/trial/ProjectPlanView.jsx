// ProjectPlanView.jsx - project explanation and delivery plan for the active trial.
// Rendered inside Trial Mode (.tm root, its CSS variables apply). React only, ASCII source.
import React, { useMemo, useState } from "react";
import { buildPlan, PHASE_LABEL } from "./projectPlan.js";

const GBP = "\u00A3";
const PHASE_COLOR = {
  measure: "var(--base)",
  define: "var(--acc)",
  approve: "var(--warn)",
  procure: "#8a6fd1",
  install: "var(--bad)",
  commission: "var(--acc2)",
  implement: "#2fae9b",
  verify: "var(--ok)",
};
const PHASE_NAME = Object.assign({ measure: "Measure" }, PHASE_LABEL);

function money(x) {
  if (x === null || x === undefined || !isFinite(x)) return "-";
  const neg = x < 0;
  const v = Math.abs(x);
  const s = v >= 100000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (Math.round(v / 100) / 10).toFixed(1) + "k" : Math.round(v).toLocaleString("en-GB");
  return (neg ? "-" : "") + GBP + s;
}
function fmtDate(d) {
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";
}
function isoDate(d) {
  const z = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function nextMonday(from) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const add = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d;
}
function wk(n) {
  return n + (n === 1 ? " week" : " weeks");
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const CSS = `
.tm .pp{display:flex;flex-direction:column;gap:14px}
.tm .pp .ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.tm .pp .ex{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:14px}
@media (max-width:1100px){.tm .pp .ex{grid-template-columns:1fr}}
.tm .pp ul{margin:6px 0 0 0;padding-left:18px}
.tm .pp li{margin:3px 0}
.tm .pp .wpx{border:1px solid var(--line);border-radius:10px;background:var(--card)}
.tm .pp .wpx>.hd{display:flex;gap:10px;align-items:center;padding:10px 12px;cursor:pointer;flex-wrap:wrap}
.tm .pp .wpx>.bd{padding:4px 12px 12px 12px;border-top:1px dashed var(--line);display:grid;grid-template-columns:1fr 1fr;gap:6px 18px}
@media (max-width:900px){.tm .pp .wpx>.bd{grid-template-columns:1fr}}
.tm .pp .wpx h4{margin:8px 0 2px 0;font-size:12.5px}
.tm .pp .ph{display:inline-flex;align-items:center;gap:5px;margin-right:10px;font-size:11.5px;color:var(--mut)}
.tm .pp .ph i{width:10px;height:10px;border-radius:3px;display:inline-block}
.tm .pp .kp{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.tm .pp .kp>div{background:var(--soft);border-radius:8px;padding:8px 10px}
.tm .pp .kp b{display:block;font-size:17px}
.tm .pp .kp span{font-size:11.5px;color:var(--mut)}
.tm .pp .gw{overflow-x:auto}
.tm .pp .note{padding:8px 10px;border-radius:8px;background:var(--soft);border-left:4px solid var(--warn)}
`;

export default function ProjectPlanView(props) {
  const { scenario, sum, base, header } = props;
  const [startIso, setStartIso] = useState(() => isoDate(nextMonday(new Date())));
  const [combined, setCombined] = useState(true);
  const [open, setOpen] = useState({});
  const start = useMemo(() => {
    const p = startIso.split("-").map(Number);
    return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : nextMonday(new Date());
  }, [startIso]);
  const plan = useMemo(() => buildPlan(scenario, { startDate: start, combined, baseMass: props.baseMass }), [scenario, start, combined, props.baseMass]);

  const saving = base && sum ? base.total - sum.total : null;
  const capex = sum ? sum.capex : plan.capex;
  const payback = capex > 0 && saving > 0 ? capex / saving : null;
  // Summer PAH season starts 1 May: is the hardware in service before the next one?
  const may1 = useMemo(() => {
    const y = start.getMonth() >= 4 ? start.getFullYear() + 1 : start.getFullYear();
    return new Date(y, 4, 1);
  }, [start]);
  const inService = plan.hardwareInService || (plan.empty ? null : plan.end);
  const readyForSummer = inService ? inService <= may1 : null;

  if (scenario.id === "baseline" || plan.empty) {
    return (
      <div className="pp">
        <style>{CSS}</style>
        {header}
        <div className="card">
          <h3>No project: this is the current system</h3>
          <div className="mut">The baseline keeps the existing single 6 t bed and today's changeout regime, so there is nothing to deliver. Open a trial from the dashboard, or build one, to see its project plan.</div>
        </div>
      </div>
    );
  }

  const wps = plan.wps;
  const summaryText =
    "This project " + (wps.length === 1 ? "makes one change" : "combines " + wps.length + " changes") + " to the abatement system: " +
    wps.map((w) => w.title.charAt(0).toLowerCase() + w.title.slice(1)).join("; ") + ".";

  // ---- Gantt geometry
  const W = Math.max(plan.weeks, 4);
  const LBL = 270;
  const GW = 760;
  const ROWH = 26;
  const top = 26;
  const x = (w) => LBL + (w / W) * GW;
  const rows = plan.rows;
  const H = top + rows.length * ROWH + 10;
  const months = [];
  for (let k = 0; k < 40; k++) {
    const d = new Date(start.getFullYear(), start.getMonth() + k, 1);
    const wks = (d - start) / (7 * 86400000);
    if (wks > W) break;
    if (wks >= 0) months.push({ wks, label: d.toLocaleDateString("en-GB", { month: "short" }) + (d.getMonth() === 0 || months.length === 0 ? " " + String(d.getFullYear()).slice(2) : "") });
  }
  const mayW = (may1 - start) / (7 * 86400000);

  const download = () => {
    const line = (k, v) => "<tr><th>" + esc(k) + "</th><td>" + esc(v) + "</td></tr>";
    let h = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Project plan - " + esc(scenario.name) + "</title>";
    h += "<style>body{font-family:Segoe UI,Arial,sans-serif;color:#16202b;max-width:960px;margin:24px auto;padding:0 16px;font-size:13px;line-height:1.45}h1{font-size:22px}h2{font-size:16px;margin-top:22px;border-bottom:1px solid #dde3ea;padding-bottom:4px}h3{font-size:14px;margin:16px 0 4px}table{border-collapse:collapse;width:100%;margin:6px 0}th,td{text-align:left;border-bottom:1px solid #e5e9ef;padding:5px 8px;vertical-align:top}th{width:34%;color:#5d6b7a;font-weight:600}.n{color:#5d6b7a}</style></head><body>";
    h += "<h1>Project plan: " + esc(scenario.name) + "</h1><div class='n'>Calders &amp; Grandidge Boston - A4 carbon abatement. Generated " + esc(fmtDate(new Date())) + " from Trial Mode. Planning estimate: durations are typical lead times, costs are Trial Mode assumptions.</div>";
    h += "<h2>Project explanation</h2><p>" + esc(summaryText) + "</p>";
    wps.forEach((w) => { h += "<h3>" + esc(w.title) + "</h3><p>" + esc(w.what) + " " + esc(w.why) + "</p>"; });
    h += "<h2>Expected outcome (vs current system)</h2><table>";
    if (sum && base) {
      h += line("Saving per year", money(saving));
      h += line("Changeouts per year", sum.changeouts + " (was " + base.changeouts + ")");
      h += line("Days between changeouts", Math.round(sum.avgInt) + " (was " + Math.round(base.avgInt) + ")");
      h += line("Carbon per year", Math.round(sum.kg / 1000) + " t (was " + Math.round(base.kg / 1000) + " t)");
      h += line("Days over an ELV per year", sum.over + " (was " + base.over + ")");
    }
    h += line("Capex", money(capex) + (plan.uncostedVessel ? " (vessel cost not entered)" : ""));
    h += line("Payback", payback ? payback.toFixed(1) + " years" : "-");
    h += "</table><h2>Timeline</h2><table>";
    h += line("Start", fmtDate(plan.start));
    h += line("Duration", wk(plan.weeks));
    if (plan.installWindow) h += line("Installation window", fmtDate(plan.installWindow.s) + " to " + fmtDate(plan.installWindow.e) + " (" + plan.shutdownDays + " shutdown days)");
    h += line("In service", fmtDate(inService));
    h += line("Before the summer PAH season (1 May)", readyForSummer ? "Yes" : "No");
    h += line("Project closed (after verification)", fmtDate(plan.end));
    h += "</table><table><tr><th>Activity</th><td><b>Phases (from - to)</b></td></tr>";
    rows.forEach((r) => {
      h += "<tr><th>" + esc(r.title) + "</th><td>" + r.bars.map((b) => esc(PHASE_NAME[b.phase] || b.phase) + ": " + esc(fmtDate(plan.addW(b.s))) + " - " + esc(fmtDate(plan.addW(b.e)))).join("<br>") + "</td></tr>";
    });
    h += "</table>";
    if (plan.measurements.length) {
      h += "<h2>Before you start: confirm the basis</h2><table>";
      plan.measurements.forEach((m) => { h += line(m.title, m.detail + " (about " + wk(m.weeks) + ")"); });
      h += "</table>";
    }
    h += "<h2>Work packages</h2>";
    wps.forEach((w) => {
      h += "<h3>" + esc(w.title) + "</h3><table>";
      h += line("Owner", w.owner) + line("Contractors", w.contractors) + line("Capex", money(w.capex || 0) + (w.vesselUncosted ? " - vessel cost not entered" : "")) + line("Shutdown", (w.shutdownDays || 0) + " days" + (w.atChangeout ? " (done at a carbon changeout)" : ""));
      h += line("Scope", (w.scope || []).join("; "));
      h += line("Approvals", (w.approvals || []).join("; "));
      if ((w.safety || []).length) h += line("Process safety", w.safety.join("; "));
      h += line("Risks", (w.risks || []).join("; "));
      h += line("How the benefit is verified", w.verify);
      h += "</table>";
    });
    h += "<h2>Approvals checklist</h2><ul>" + plan.approvals.map((a) => "<li>" + esc(a) + "</li>").join("") + "</ul>";
    h += "</body></html>";
    try {
      const blob = new Blob([h], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Project plan - " + scenario.name.replace(/[^A-Za-z0-9 +\-]/g, "").slice(0, 80) + ".html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      /* ignore */
    }
  };

  return (
    <div className="pp">
      <style>{CSS}</style>
      {header}
      <div className="ctl">
        <label className="small mut row" style={{ gap: 6 }}>
          Project start
          <input type="date" value={startIso} onChange={(e) => e.target.value && setStartIso(e.target.value)} style={{ font: "inherit", background: "var(--card)", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 6, padding: "4px 6px" }} />
        </label>
        <span className="seg">
          <button className={"pl" + (combined ? " on" : "")} onClick={() => setCombined(true)}>One combined shutdown</button>
          <button className={"pl" + (!combined ? " on" : "")} onClick={() => setCombined(false)}>Install each when ready</button>
        </span>
        <span className="sp" />
        <button className="pri" onClick={download}>Download plan</button>
      </div>

      <div className="ex">
        <div className="card">
          <h3>Project explanation</h3>
          <p style={{ margin: "0 0 8px 0" }}>{summaryText}</p>
          {wps.map((w) => (
            <div key={w.deviceId || w.key} style={{ margin: "8px 0" }}>
              <b>{w.title}.</b> <span>{w.what}</span> <span className="mut">{w.why}</span>
            </div>
          ))}
          {plan.uncostedVessel ? (
            <div className="note small" style={{ marginTop: 10 }}>
              The extra carbon vessel has no cost entered, so the capex and payback leave it out. Enter the vessel and ductwork cost on the trial builder (Vessel / ductwork cost), or confirm that an existing vessel can be used. A new 6 t vessel with ductwork and dampers is a significant item: get supplier quotes.
            </div>
          ) : null}
        </div>
        <div className="card">
          <h3>What it delivers</h3>
          <div className="kp">
            <div><b className={saving > 0 ? "good" : saving < 0 ? "bad" : ""}>{saving != null ? money(saving) : "-"}</b><span>saved per year vs the current system</span></div>
            <div><b>{payback ? payback.toFixed(1) + " yr" : "-"}</b><span>{"payback on " + money(capex) + (plan.uncostedVessel ? " (+ vessel)" : "")}</span></div>
            <div><b>{sum ? Math.round(sum.avgInt) + " d" : "-"}</b><span>{"between changeouts" + (base ? " (was " + Math.round(base.avgInt) + ")" : "")}</span></div>
            <div><b>{sum ? sum.over : "-"}</b><span>{"days over an ELV per year" + (base ? " (was " + base.over + ")" : "")}</span></div>
            <div><b>{fmtDate(inService)}</b><span>{plan.hardwareInService ? "equipment in service" : "in place"}</span></div>
            <div><b className={readyForSummer ? "good" : "amb"}>{readyForSummer ? "Yes" : "No"}</b><span>{"in service before the summer PAH season (1 May " + may1.getFullYear() + ")"}</span></div>
          </div>
          <div className="small mut" style={{ marginTop: 8 }}>
            {wk(plan.weeks) + " from " + fmtDate(plan.start) + " to close-out (" + fmtDate(plan.end) + ")" + (plan.shutdownDays ? ", " + plan.shutdownDays + " shutdown days" + (plan.combined && plan.installWindow ? " in one window from " + fmtDate(plan.installWindow.s) : "") : ", no shutdown") + ". Plan the installation to coincide with a carbon changeout where possible."}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Timeline</h3>
          <span className="sp" />
          {["measure", "define", "approve", "procure", "install", "commission", "implement", "verify"].map((p) => (
            <span key={p} className="ph"><i style={{ background: PHASE_COLOR[p] }} />{PHASE_NAME[p]}</span>
          ))}
        </div>
        <div className="gw">
          <svg viewBox={"0 0 " + (LBL + GW + 10) + " " + H} width="100%" style={{ minWidth: 820, display: "block" }} role="img" aria-label={"Project timeline, " + plan.weeks + " weeks"}>
            {months.map((m, i) => (
              <g key={i}>
                <line x1={x(m.wks)} x2={x(m.wks)} y1={top - 6} y2={H - 6} stroke="var(--line)" />
                <text x={x(m.wks) + 3} y={14} fontSize="11" fill="var(--mut)">{m.label}</text>
              </g>
            ))}
            {mayW > 0 && mayW < W ? (
              <g>
                <line x1={x(mayW)} x2={x(mayW)} y1={top - 8} y2={H - 4} stroke="var(--bad)" strokeDasharray="4 3" />
                <text x={x(mayW) - 4} y={top - 10} fontSize="10" fill="var(--bad)" textAnchor="end">PAH season</text>
              </g>
            ) : null}
            {rows.map((r, i) => {
              const y = top + i * ROWH;
              return (
                <g key={r.id + "-" + i}>
                  <text x={4} y={y + 16} fontSize="11.5" fill="var(--ink)" fontWeight={r.kind === "common" ? 600 : 400}>{r.title.length > 42 ? r.title.slice(0, 40) + "..." : r.title}</text>
                  {r.bars.map((b, k) => (
                    <rect key={k} x={x(b.s)} y={y + 5} width={Math.max(2, x(b.e) - x(b.s))} height={ROWH - 10} rx="3" fill={PHASE_COLOR[b.phase] || "var(--acc)"} opacity={b.phase === "verify" ? 0.75 : 0.9}>
                      <title>{(PHASE_NAME[b.phase] || b.phase) + ": " + fmtDate(plan.addW(b.s)) + " to " + fmtDate(plan.addW(b.e)) + " (" + wk(Math.round(b.e - b.s)) + ")" + (b.atChangeout ? " - at a carbon changeout" : "")}</title>
                    </rect>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="small mut" style={{ marginTop: 6 }}>Weeks are typical lead times for planning. Replace them with supplier quotes as each package develops. Hover a bar for its dates.</div>
      </div>

      {plan.measurements.length ? (
        <div className="card">
          <h3>Before you start: confirm the basis</h3>
          <div className="lev">
            {plan.measurements.map((m, i) => (
              <div key={m.key} className="step"><span className="n">{i + 1}</span><span><b>{m.title}</b><div className="small mut">{m.detail + " About " + wk(m.weeks) + "."}</div></span></div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card">
        <h3>Work packages</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {wps.map((w) => {
            const id = w.deviceId || w.key;
            const isOpen = !!open[id];
            const ph = w.phases || {};
            return (
              <div key={id} className="wpx">
                <div className="hd" onClick={() => setOpen(Object.assign({}, open, { [id]: !isOpen }))}>
                  <b>{w.title}</b>
                  <span className="chip">{w.owner}</span>
                  <span className="chip">{money(w.capex || 0) + (w.vesselUncosted ? " + vessel" : "")}</span>
                  <span className="chip">{(w.shutdownDays || 0) ? w.shutdownDays + " shutdown days" : w.atChangeout ? "at a changeout" : "no shutdown"}</span>
                  <span className="sp" />
                  <span className="mut small">{isOpen ? "Hide" : "Details"}</span>
                </div>
                {isOpen ? (
                  <div className="bd">
                    <div>
                      <h4>Scope</h4>
                      <ul>{(w.scope || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                      <h4>Phases</h4>
                      <div className="small">{Object.keys(ph).map((k) => (PHASE_NAME[k] || k) + " " + wk(ph[k])).join(", ")}</div>
                      <h4>Who</h4>
                      <div className="small">{w.owner + ". " + w.contractors + "."}</div>
                    </div>
                    <div>
                      <h4>Approvals</h4>
                      <ul>{(w.approvals || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                      {(w.safety || []).length ? (
                        <>
                          <h4>Process safety</h4>
                          <ul>{w.safety.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </>
                      ) : null}
                      <h4>Risks</h4>
                      <ul>{(w.risks || []).map((s, i) => <li key={i}>{s}</li>)}</ul>
                      <h4>How the benefit is verified</h4>
                      <div className="small">{w.verify}</div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h3>Approvals checklist</h3>
        <ul>{plan.approvals.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </div>
    </div>
  );
}
