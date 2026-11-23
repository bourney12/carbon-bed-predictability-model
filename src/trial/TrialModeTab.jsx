// TrialModeTab.jsx - "Trial Mode" for the carbon bed predictability model.
// Build a modified abatement train, forecast carbon life, cost and compliance against the
// current system. Self-contained: React only, inline SVG charts, scoped CSS. ASCII source.
import React, { useState, useMemo, useEffect } from "react";
import {
  DEFAULT_SITE,
  DEVICE_TYPES,
  CARBON_TYPES,
  ARRANGEMENTS,
  SPECIES,
  SPECIES_LABEL,
  MONTHS,
  MONTH_MID,
  simulate,
  summarise,
  lifeByMonth,
  runTrain,
  capacityBreakdown,
  warningsFor,
  presetScenarios,
  blankScenario,
  newBed,
  newId,
  dev as makeDevice,
  psatW,
  tankBaseline,
  extraPresets,
} from "./trialEngine.js";

const DEG = "\u00B0C";
const GBP = "\u00A3";
const STORE = "cpm.trialMode.v1";

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------
function fmtInt(x) {
  if (x === null || x === undefined || !isFinite(x)) return "-";
  return Math.round(x).toLocaleString("en-GB");
}
function fmt1(x) {
  if (x === null || x === undefined || !isFinite(x)) return "-";
  return (Math.round(x * 10) / 10).toLocaleString("en-GB");
}
function money(x) {
  if (x === null || x === undefined || !isFinite(x)) return "-";
  const neg = x < 0;
  const v = Math.abs(x);
  const s = v >= 100000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (Math.round(v / 100) / 10).toFixed(1) + "k" : fmtInt(v);
  return (neg ? "-" : "") + GBP + s;
}
function clone(o) {
  return JSON.parse(JSON.stringify(o));
}
function loadStore() {
  try {
    const raw = window.localStorage.getItem(STORE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}
function saveStore(v) {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(v));
  } catch (e) {
    /* storage unavailable - session only */
  }
}

// ---------------------------------------------------------------------------
// device field definitions
// ---------------------------------------------------------------------------
const FIELDS = {
  condenser: [
    { k: "tOut", label: "Gas outlet temperature", min: -2, max: 20, step: 0.5, unit: DEG, key: true },
    { k: "fogCapture", label: "Condensate captured (rest carries as fog)", min: 0, max: 1, step: 0.05, pct: true },
    { k: "cop", label: "Chiller COP", min: 1.5, max: 6, step: 0.1 },
    { k: "dp", label: "Pressure drop", min: 0, max: 2000, step: 50, unit: "Pa" },
    { k: "capex", label: "Installed cost", min: 0, max: 300000, step: 1000, unit: GBP },
  ],
  dcwbc: [
    { k: "tWater", label: "Bath water temperature", min: 2, max: 25, step: 0.5, unit: DEG, key: true },
    { k: "approach", label: "Gas approach to water", min: 0.5, max: 8, step: 0.5, unit: DEG },
    { k: "fogCapture", label: "Mist / condensate captured", min: 0, max: 1, step: 0.05, pct: true },
    { k: "soluble", label: "Light VOC scrubbed (phenols etc.)", min: 0, max: 0.3, step: 0.01, pct: true },
    { k: "cop", label: "Chiller COP", min: 1.5, max: 6, step: 0.1 },
    { k: "dp", label: "Pressure drop", min: 0, max: 3000, step: 50, unit: "Pa" },
    { k: "capex", label: "Installed cost", min: 0, max: 300000, step: 1000, unit: GBP },
  ],
  cooler: [
    { k: "eff", label: "Effectiveness (share of gap to ambient closed)", min: 0, max: 0.95, step: 0.05, pct: true, key: true },
    { k: "approachAmb", label: "Closest approach to ambient", min: 0, max: 10, step: 0.5, unit: DEG },
    { k: "dp", label: "Pressure drop", min: 0, max: 2000, step: 50, unit: "Pa" },
    { k: "capex", label: "Installed cost", min: 0, max: 200000, step: 1000, unit: GBP },
  ],
  reheat: [
    { k: "dT", label: "Temperature lift", min: 0, max: 15, step: 0.5, unit: DEG, key: true },
    { k: "eff", label: "Heater efficiency", min: 0.3, max: 1, step: 0.05, pct: true },
    { k: "dp", label: "Pressure drop", min: 0, max: 500, step: 10, unit: "Pa" },
    { k: "capex", label: "Installed cost", min: 0, max: 100000, step: 500, unit: GBP },
  ],
  demister: [
    { k: "eff", label: "Mist capture efficiency", min: 0, max: 0.99, step: 0.01, pct: true, key: true },
    { k: "dp", label: "Pressure drop", min: 0, max: 2000, step: 50, unit: "Pa" },
    { k: "capex", label: "Installed cost", min: 0, max: 150000, step: 1000, unit: GBP },
  ],
  vsd: [
    { k: "flow", label: "System flow", min: 2500, max: 14000, step: 250, unit: "m3/h", key: true },
    { k: "massRetained", label: "Vapour mass still captured", min: 0.5, max: 1, step: 0.01, pct: true },
    { k: "capex", label: "Installed cost", min: 0, max: 100000, step: 500, unit: GBP },
  ],
  source: [
    { k: "cutVOC", label: "Cut in light VOC reaching extraction", min: 0, max: 0.8, step: 0.01, pct: true, key: true },
    { k: "cutPAH", label: "Cut in naphthalene / PAH reaching extraction", min: 0, max: 0.8, step: 0.01, pct: true },
    { k: "capex", label: "Cost", min: 0, max: 200000, step: 1000, unit: GBP },
  ],
  vapbal: [
    { k: "capture", label: "Displaced vapour returned to tanker", min: 0, max: 1, step: 0.01, pct: true, key: true },
    { k: "blowCut", label: "End-of-offload air blow stopped / diverted", min: 0, max: 1, step: 0.05, pct: true },
    { k: "capex", label: "Installed cost", min: 0, max: 100000, step: 500, unit: GBP },
  ],
  tankvent: [
    { k: "sweepCut", label: "Cut in continuous air drawn through tank vents", min: 0, max: 1, step: 0.01, pct: true, key: true },
    { k: "capex", label: "Installed cost", min: 0, max: 100000, step: 500, unit: GBP },
  ],
  schedule: [
    { k: "shift", label: "Share of daily emission load moved to the cool half of the day", min: 0, max: 0.5, step: 0.01, pct: true, key: true },
    { k: "opex", label: "Running cost (e.g. shift premium) if run all year", min: 0, max: 100000, step: 500, unit: GBP + "/yr" },
    { k: "capex", label: "One-off cost", min: 0, max: 100000, step: 500, unit: GBP },
  ],
  fanmove: [
    { k: "capex", label: "Installed cost (ductwork, fan relocation)", min: 0, max: 200000, step: 1000, unit: GBP, key: true },
  ],
  custom: [
    { k: "remVOC", label: "Light VOC removed", min: 0, max: 0.95, step: 0.01, pct: true, key: true },
    { k: "remPAH", label: "Naphthalene / PAH removed", min: 0, max: 0.95, step: 0.01, pct: true },
    { k: "dT", label: "Temperature change", min: -20, max: 20, step: 0.5, unit: DEG },
    { k: "dPv", label: "Water vapour change", min: -2, max: 2, step: 0.05, unit: "kPa" },
    { k: "kw", label: "Power draw", min: 0, max: 200, step: 1, unit: "kW" },
    { k: "dp", label: "Pressure drop", min: 0, max: 3000, step: 50, unit: "Pa" },
    { k: "capex", label: "Installed cost", min: 0, max: 300000, step: 1000, unit: GBP },
  ],
};

const SITE_GROUPS = [
  {
    title: "Permit and trigger",
    note: "ELVs from EPR/A2/1 Table 4.1 (A4). The trigger is the predicted stack level at which carbon is changed.",
    fields: [
      { k: "elvVOC", label: "VOC ELV", unit: "mg/Nm3", min: 1, max: 100, step: 1 },
      { k: "elvPAH", label: "PAH ELV", unit: "ug/Nm3", min: 100, max: 5000, step: 50 },
      { k: "trigger", label: "Change carbon at", min: 0.3, max: 1, step: 0.05, pct: true, tag: "of ELV" },
      { k: "triggerWindow", label: "Decision basis: rolling mean of", unit: "days", min: 1, max: 14, step: 1 },
    ],
  },
  {
    title: "Operation",
    note: "Throughput drives loading. 11 t/day is the Settings fallback; since 5 Nov the plant has run ~7 t/day.",
    fields: [
      { k: "throughput", label: "Creosote throughput", unit: "t/day", min: 2, max: 25, step: 0.5 },
      { k: "hoursPerDay", label: "Abatement running hours", unit: "h/day", min: 4, max: 24, step: 0.1 },
      { k: "flow0", label: "Current system flow", unit: "m3/h", min: 3000, max: 15000, step: 100 },
      { k: "fanHeat0", label: "Temperature rise across fan", unit: DEG, min: 0, max: 6, step: 0.1 },
      { k: "fanPower0", label: "Fan absorbed power now (confirm)", unit: "kW", min: 1, max: 100, step: 1 },
      { k: "moistureAdd", label: "Process water vapour above ambient", unit: "kPa", min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: "Current carbon bed",
    note: "6,000 kg CX65 per charge. Bed depth and MTZ length are not yet measured; they set how much a flow change helps.",
    fields: [
      { k: "carbonMass0", label: "Carbon per charge", unit: "kg", min: 1000, max: 20000, step: 100 },
      { k: "bulkDensity", label: "Bulk density", unit: "kg/m3", min: 350, max: 600, step: 5 },
      { k: "bedDepth0", label: "Bed depth (confirm)", unit: "m", min: 0.3, max: 3, step: 0.05 },
      { k: "mtz0", label: "MTZ length at current velocity", unit: "m", min: 0.05, max: 1.5, step: 0.05 },
      { k: "mtzExp", label: "MTZ length ~ velocity^n, n =", min: 0, max: 1.2, step: 0.05 },
      { k: "freundlich", label: "Capacity ~ concentration^n, n =", min: 0, max: 0.8, step: 0.05 },
    ],
  },
  {
    title: "Temperature and humidity",
    note: "The calibration links stack temperature to outlet VOC/PAH. Part of that is bed adsorption (a cooler helps) and part is more vapour from the plant in hot weather (a cooler does not help).",
    fields: [
      { k: "thetaBed", label: "Share of temperature effect due to the bed", min: 0, max: 1, step: 0.05, pct: true },
      { k: "tFloor", label: "No temperature credit below", unit: DEG, min: 0, max: 25, step: 0.5 },
      { k: "rhOnset", label: "Water starts taking capacity above", unit: "% RH", min: 30, max: 80, step: 1 },
      { k: "stackI", label: "Stack temp = a + b x ambient: a", unit: DEG, min: 0, max: 25, step: 0.1 },
      { k: "stackS", label: "Stack temp regression: b", min: 0.3, max: 1.2, step: 0.01 },
      { k: "dailySD", label: "Day-to-day weather swing", unit: DEG, min: 0, max: 6, step: 0.5 },
    ],
  },
  {
    title: "Creosote storage tanks (vents and deliveries go to extraction)",
    note: "This load is already inside the measured carbon inlet; these inputs only split it out so tank measures can be tested. Vent sweep flow and tank temperature set almost all of it - measure the air velocity in the tank vent branch.",
    fields: [
      { k: "tankHeated", label: "Tanks held warm (1 = yes, 0 = no)", min: 0, max: 1, step: 1 },
      { k: "tankT", label: "Held tank temperature (confirm)", unit: DEG, min: 10, max: 80, step: 1 },
      { k: "tankSolar", label: "Headspace above ambient from sun", unit: DEG, min: 0, max: 20, step: 0.5 },
      { k: "tankSweep", label: "Air drawn through tank vents (confirm)", unit: "m3/h", min: 0, max: 2000, step: 10 },
      { k: "tankSat", label: "Headspace approach to equilibrium", min: 0.1, max: 1, step: 0.05, pct: true },
      { k: "tankXNaph", label: "Naphthalene mole fraction in stock", min: 0, max: 0.4, step: 0.01 },
      { k: "tankXMnap", label: "Methylnaphthalenes mole fraction", min: 0, max: 0.3, step: 0.01 },
      { k: "tankXHeavy", label: "3-ring PAH mole fraction", min: 0, max: 0.5, step: 0.01 },
      { k: "tankLight20", label: "Light VOC in saturated headspace at 20 C", unit: "mg/m3", min: 0, max: 2000, step: 10 },
      { k: "deliveriesYr", label: "Road tanker deliveries", unit: "/yr", min: 0, max: 400, step: 1 },
      { k: "deliveryM3", label: "Volume per delivery (= vapour displaced)", unit: "m3", min: 5, max: 40, step: 1 },
      { k: "airBlowM3", label: "Air blown through at end of offload", unit: "m3", min: 0, max: 200, step: 5 },
    ],
  },
  {
    title: "Costs",
    note: "Default split reproduces ~" + GBP + "14,580 per 6 t changeout.",
    fields: [
      { k: "changeoutFixed", label: "Fixed cost per changeout", unit: GBP, min: 0, max: 20000, step: 100 },
      { k: "carbonPerKg", label: "Carbon supply and disposal", unit: GBP + "/kg", min: 0.5, max: 6, step: 0.05 },
      { k: "elecPrice", label: "Electricity", unit: GBP + "/kWh", min: 0.05, max: 0.6, step: 0.01 },
      { k: "fanEff", label: "Fan efficiency (for added pressure drop)", min: 0.3, max: 0.9, step: 0.05, pct: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// styles
// ---------------------------------------------------------------------------
const CSS = `
.tm{--bg:#f6f7f9;--card:#ffffff;--ink:#16202b;--mut:#5d6b7a;--line:#dde3ea;--soft:#eef2f6;--acc:#0f6fd1;--acc2:#e07b00;--ok:#1a8a4a;--warn:#b77900;--bad:#c23a3a;--base:#8a97a6;
font-family:Inter,Segoe UI,system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg);font-size:13px;line-height:1.4;padding:16px;border-radius:12px}
.tm.dark{--bg:#0e141b;--card:#151d26;--ink:#e6edf4;--mut:#93a3b4;--line:#263241;--soft:#1b2531;--acc:#4ea3ff;--acc2:#ffa940;--ok:#3ccf7e;--warn:#e8b339;--bad:#ff6b6b;--base:#7d8a99}
.tm *{box-sizing:border-box}
.tm h2{font-size:20px;margin:0}
.tm h3{font-size:14px;margin:0 0 8px 0}
.tm .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tm .sp{flex:1}
.tm .card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.tm .mut{color:var(--mut)}
.tm .small{font-size:11.5px}
.tm button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:7px;padding:5px 10px;cursor:pointer}
.tm button:hover{border-color:var(--acc)}
.tm button.pri{background:var(--acc);border-color:var(--acc);color:var(--onacc,#fff)}
.tm button.on{background:var(--acc);border-color:var(--acc);color:var(--onacc,#fff)}
.tm button.ghost{border-color:transparent;background:transparent;padding:3px 6px}
.tm button:disabled{opacity:.45;cursor:default}
.tm select,.tm input[type=text],.tm input[type=number],.tm textarea{font:inherit;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:4px 6px}
.tm input[type=range]{width:100%;accent-color:var(--acc)}
.tm .tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin:12px 0}
.tm .tabs button{border:none;border-bottom:2px solid transparent;border-radius:0;background:transparent;padding:8px 12px;color:var(--mut)}
.tm .tabs button.act{color:var(--ink);border-bottom-color:var(--acc);font-weight:600}
.tm .grid{display:grid;grid-template-columns:minmax(330px,420px) 1fr;gap:14px;align-items:start}
@media (max-width:1000px){.tm .grid{grid-template-columns:1fr}}
.tm .pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:var(--card);cursor:pointer;white-space:nowrap}
.tm .pill.act{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc) inset}
.tm .pill .dot{width:8px;height:8px;border-radius:50%}
.tm .node{border:1px solid var(--line);border-radius:9px;background:var(--card);margin:0}
.tm .node .hd{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:pointer}
.tm .node .bd{padding:4px 10px 10px 10px;border-top:1px dashed var(--line)}
.tm .fixed{background:var(--soft)}
.tm .arrow{height:16px;display:flex;justify-content:center;align-items:center;color:var(--mut)}
.tm .ins{display:flex;justify-content:center;margin:2px 0}
.tm .ins button{font-size:11px;padding:1px 8px;border-style:dashed;color:var(--mut)}
.tm .chip{display:inline-block;padding:1px 7px;border-radius:999px;background:var(--soft);font-size:11px;color:var(--mut);white-space:nowrap}
.tm .chip.g{color:var(--ok)} .tm .chip.r{color:var(--bad)} .tm .chip.a{color:var(--warn)}
.tm .fld{margin:7px 0}
.tm .fld .lab{display:flex;justify-content:space-between;gap:8px;font-size:12px}
.tm .fld .val{display:flex;gap:4px;align-items:center}
.tm .fld input[type=number]{width:82px;text-align:right}
.tm .kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.tm .kpi .v{font-size:22px;font-weight:650;letter-spacing:-.01em}
.tm .kpi .l{font-size:11.5px;color:var(--mut)}
.tm .kpi .d{font-size:12px;margin-top:2px}
.tm .good{color:var(--ok)} .tm .bad{color:var(--bad)} .tm .amb{color:var(--warn)}
.tm .warn{display:flex;gap:8px;padding:7px 9px;border-radius:7px;background:var(--soft);margin:5px 0}
.tm .warn .b{width:4px;border-radius:2px;flex:none}
.tm table{border-collapse:collapse;width:100%}
.tm th,.tm td{text-align:right;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
.tm th:first-child,.tm td:first-child{text-align:left}
.tm th{font-weight:600;color:var(--mut);font-size:11.5px}
.tm .strip{display:flex;gap:0;overflow-x:auto;padding-bottom:4px}
.tm .blk{min-width:92px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:var(--card)}
.tm .blk .t{font-weight:600;font-size:12px;margin-bottom:2px}
.tm .blk div{font-size:11px;color:var(--mut)}
.tm .cn{display:flex;align-items:center;padding:0 3px;color:var(--mut)}
.tm .seg{display:flex;flex-wrap:wrap;gap:4px}
.tm .seg button{font-size:12px}
.tm .two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:1250px){.tm .two{grid-template-columns:1fr}}
.tm .prose p{margin:6px 0}
.tm .prose h4{margin:14px 0 4px 0;font-size:13px}
.tm.app{--bg:inherit;--line:inherit;--ok:inherit;--warn:inherit;--bad:inherit;--card:var(--panel);--ink:var(--text);--mut:var(--muted);--soft:var(--panel2);--acc:var(--accent);--acc2:var(--gold);--base:var(--muted);--onacc:var(--on-accent);padding:0;background:transparent}
.tm .tgl{width:34px;height:19px;border-radius:999px;background:var(--line);position:relative;flex:none;cursor:pointer;transition:background .15s}
.tm .tgl.on{background:var(--ok)}
.tm .tgl.dis{opacity:.5;cursor:default}
.tm .tgl .k{position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:left .15s;box-shadow:0 1px 2px rgba(0,0,0,.25)}
.tm .tgl.on .k{left:17px}
.tm .tag{font-size:10.5px;padding:1px 6px;border-radius:4px;border:1px solid var(--line);color:var(--mut);margin-left:6px}
`;

// ---------------------------------------------------------------------------
// small UI parts
// ---------------------------------------------------------------------------
function Field(props) {
  const f = props.f;
  const v = props.value;
  const disabled = props.disabled;
  const shown = f.pct ? Math.round(v * 1000) / 10 : v;
  const onNum = (e) => {
    const n = parseFloat(e.target.value);
    if (!isFinite(n)) return;
    props.onChange(f.pct ? n / 100 : n);
  };
  return (
    <div className="fld">
      <div className="lab">
        <span>{f.label}</span>
        <span className="val">
          <input type="number" value={shown} step={f.pct ? f.step * 100 : f.step} disabled={disabled} onChange={onNum} />
          <span className="mut small" style={{ minWidth: 34 }}>{f.pct ? "%" : f.unit || ""}{f.tag ? " " + f.tag : ""}</span>
        </span>
      </div>
      <input type="range" min={f.min} max={f.max} step={f.step} value={v} disabled={disabled} onChange={(e) => props.onChange(parseFloat(e.target.value))} />
    </div>
  );
}

function Icon(props) {
  const t = props.type;
  const c = "currentColor";
  let body = null;
  if (t === "condenser" || t === "cooler") body = <g><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke={c} strokeWidth="1.6" /><path d="M7 8v8M11 8v8M15 8v8M19 8v8" stroke={c} strokeWidth="1.3" /></g>;
  else if (t === "dcwbc") body = <g><rect x="5" y="3" width="14" height="18" rx="3" fill="none" stroke={c} strokeWidth="1.6" /><path d="M5 13c3 2 5-2 7 0s4-2 7 0" fill="none" stroke={c} strokeWidth="1.4" /><circle cx="10" cy="17" r="1" fill={c} /><circle cx="14" cy="16" r="1" fill={c} /></g>;
  else if (t === "reheat") body = <path d="M4 18c3-2 1-5 4-7s1-5 4-7M10 18c3-2 1-5 4-7s1-5 4-7" fill="none" stroke={c} strokeWidth="1.6" />;
  else if (t === "demister") body = <g><rect x="4" y="4" width="16" height="16" rx="2" fill="none" stroke={c} strokeWidth="1.6" /><path d="M4 8h16M4 12h16M4 16h16" stroke={c} strokeWidth="1.2" strokeDasharray="2 2" /></g>;
  else if (t === "vsd" || t === "fan") body = <g><circle cx="12" cy="12" r="8" fill="none" stroke={c} strokeWidth="1.6" /><path d="M12 12c0-4 3-5 4-3M12 12c-4 0-5-3-3-4M12 12c0 4-3 5-4 3M12 12c4 0 5 3 3 4" fill="none" stroke={c} strokeWidth="1.4" /></g>;
  else if (t === "source") body = <g><path d="M4 20h16M7 20V10h10v10" fill="none" stroke={c} strokeWidth="1.6" /><path d="M9 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4" fill="none" stroke={c} strokeWidth="1.3" /></g>;
  else if (t === "bed") body = <g><rect x="6" y="2" width="12" height="20" rx="4" fill="none" stroke={c} strokeWidth="1.6" /><path d="M6 9h12M6 15h12" stroke={c} strokeWidth="1.2" /></g>;
  else if (t === "stack") body = <path d="M9 21V5h6v16M8 5h8M10 3c1-1 3-1 4 0" fill="none" stroke={c} strokeWidth="1.6" />;
  else if (t === "in") body = <path d="M3 12h14M13 7l5 5-5 5" fill="none" stroke={c} strokeWidth="1.6" />;
  else body = <g><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke={c} strokeWidth="1.6" /><path d="M9 12h6M12 9v6" stroke={c} strokeWidth="1.6" /></g>;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ flex: "none", color: "var(--acc)" }}>
      {body}
    </svg>
  );
}

function Kpi(props) {
  const d = props.delta;
  let cls = "mut";
  if (d !== undefined && d !== null && isFinite(d) && Math.abs(d) > 1e-9) cls = (props.goodIfDown ? d < 0 : d > 0) ? "good" : "bad";
  return (
    <div className="card kpi">
      <div className="l">{props.label}</div>
      <div className="v">{props.value}</div>
      <div className={"d " + cls}>{props.sub}</div>
    </div>
  );
}

// line chart of daily series over one year
function YearChart(props) {
  const [hover, setHover] = useState(null);
  const W = 820;
  const H = 260;
  const L = 46;
  const R = 12;
  const T = 14;
  const B = 28;
  const series = props.series; // [{name,color,data:[...365], dash, marks:[idx]}]
  let ymax = props.ymax || 0;
  if (!props.ymax) {
    for (let i = 0; i < series.length; i++) for (let j = 0; j < series[i].data.length; j++) ymax = Math.max(ymax, series[i].data[j]);
    ymax = ymax * 1.1;
  }
  let ymin = props.ymin !== undefined ? props.ymin : 0;
  if (props.autoMin) {
    let mn = 1e9;
    for (let i = 0; i < series.length; i++) for (let j = 0; j < series[i].data.length; j++) mn = Math.min(mn, series[i].data[j]);
    ymin = Math.floor(mn - 1);
  }
  if (ymax <= ymin) ymax = ymin + 1;
  const x = (i) => L + ((W - L - R) * i) / 364;
  const y = (v) => T + (H - T - B) * (1 - (Math.min(v, ymax) - ymin) / (ymax - ymin));
  const ticks = [];
  const step = niceStep((ymax - ymin) / 4);
  for (let v = Math.ceil(ymin / step) * step; v <= ymax + 1e-9; v += step) ticks.push(v);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(364, Math.round(((px - L) / (W - L - R)) * 364)));
    setHover(i);
  };
  return (
    <svg viewBox={"0 0 " + W + " " + H} width="100%" style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      {ticks.map((v) => (
        <g key={"t" + v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
          <text x={L - 6} y={y(v) + 4} fontSize="10.5" textAnchor="end" fill="var(--mut)">{props.yfmt ? props.yfmt(v) : v}</text>
        </g>
      ))}
      {MONTH_MID.map((m, i) => (
        <text key={"m" + i} x={x(m)} y={H - 9} fontSize="10.5" textAnchor="middle" fill="var(--mut)">{MONTHS[i]}</text>
      ))}
      {(props.refs || []).map((r) => (
        <g key={"r" + r.v}>
          <line x1={L} x2={W - R} y1={y(r.v)} y2={y(r.v)} stroke={r.color} strokeWidth="1.3" strokeDasharray={r.dash || "5 4"} />
          <text x={W - R - 2} y={y(r.v) - 4} fontSize="10.5" textAnchor="end" fill={r.color}>{r.label}</text>
        </g>
      ))}
      {series.map((s) => {
        let d = "";
        for (let i = 0; i < s.data.length; i++) d += (i ? "L" : "M") + x(i).toFixed(1) + " " + y(s.data[i]).toFixed(1);
        return <path key={s.name} d={d} fill="none" stroke={s.color} strokeWidth={s.width || 1.8} strokeDasharray={s.dash || ""} opacity={s.opacity || 1} />;
      })}
      {series.map((s) =>
        (s.marks || []).map((i) => (
          <path key={s.name + "k" + i} d={"M" + x(i) + " " + (H - B + 1) + "l-4 7h8z"} fill={s.color} />
        ))
      )}
      {hover !== null ? (
        <g>
          <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--mut)" strokeWidth="1" strokeDasharray="2 3" />
          <rect x={Math.min(x(hover) + 8, W - 190)} y={T + 2} width="180" height={18 + 15 * series.length} rx="6" fill="var(--card)" stroke="var(--line)" />
          <text x={Math.min(x(hover) + 16, W - 182)} y={T + 16} fontSize="11" fill="var(--mut)">{dayLabel(hover)}</text>
          {series.map((s, k) => (
            <text key={"h" + k} x={Math.min(x(hover) + 16, W - 182)} y={T + 31 + 15 * k} fontSize="11" fill={s.color}>
              {s.name + ": " + (props.yfmt ? props.yfmt(s.data[hover]) : fmt1(s.data[hover]))}
            </text>
          ))}
        </g>
      ) : null}
    </svg>
  );
}

function smooth(arr, n) {
  const out = [];
  const h = Math.floor(n / 2);
  for (let i = 0; i < arr.length; i++) {
    let t = 0;
    let c = 0;
    for (let j = i - h; j <= i + h; j++) {
      if (j >= 0 && j < arr.length) {
        t += arr[j];
        c++;
      }
    }
    out.push(t / c);
  }
  return out;
}

function niceStep(x) {
  if (x <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const m = x / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}

function dayLabel(doy) {
  let m = 0;
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  for (let i = 0; i < 12; i++) if (doy >= starts[i]) m = i;
  return doy - starts[m] + 1 + " " + MONTHS[m];
}

function MonthBars(props) {
  const W = 520;
  const H = 220;
  const L = 40;
  const R = 10;
  const T = 12;
  const B = 26;
  const sets = props.sets; // [{name,color,data:[{days,by}]}]
  let ymax = 0;
  sets.forEach((s) => s.data.forEach((d) => (ymax = Math.max(ymax, d.days))));
  ymax = Math.max(30, Math.ceil((ymax * 1.08) / 20) * 20);
  const gw = (W - L - R) / 12;
  const bw = Math.min(26, (gw - 8) / sets.length);
  const y = (v) => T + (H - T - B) * (1 - v / ymax);
  const ticks = [];
  const st = niceStep(ymax / 4);
  for (let v = 0; v <= ymax; v += st) ticks.push(v);
  return (
    <svg viewBox={"0 0 " + W + " " + H} width="100%" style={{ display: "block" }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" />
          <text x={L - 6} y={y(v) + 4} fontSize="10.5" textAnchor="end" fill="var(--mut)">{v}</text>
        </g>
      ))}
      {MONTHS.map((m, i) => (
        <g key={m}>
          <text x={L + gw * i + gw / 2} y={H - 8} fontSize="10.5" textAnchor="middle" fill="var(--mut)">{m}</text>
          {sets.map((s, k) => {
            const d = s.data[i];
            const x0 = L + gw * i + (gw - bw * sets.length) / 2 + k * bw;
            const capped = d.by === "none";
            return (
              <g key={s.name}>
                <rect x={x0 + 1} y={y(d.days)} width={bw - 2} height={H - B - y(d.days)} rx="3" fill={s.color} opacity={capped ? 0.45 : 0.9}>
                  <title>{s.name + " - start " + m + ": " + (capped ? ">" : "") + d.days + " days" + (d.by && d.by !== "none" ? " (" + d.by + ")" : "")}</title>
                </rect>
                {d.by === "PAH" ? <text x={x0 + bw / 2} y={y(d.days) - 3} fontSize="9" textAnchor="middle" fill="var(--acc2)">P</text> : null}
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// main component
// ---------------------------------------------------------------------------
export default function TrialModeTab(props) {
  const stored = useMemo(() => loadStore(), []);
  // props.defaults: starting values the user may change. props.calibration: live values from the
  // host app (fitted coefficients, stack regression, climate) that always win and are shown read-only.
  const [siteRaw, setSite] = useState(() => Object.assign(clone(DEFAULT_SITE), props.defaults || {}, stored && stored.site ? stored.site : {}));
  const calib = props.calibration || null;
  const site = useMemo(() => {
    if (!calib) return siteRaw;
    const out = Object.assign({}, siteRaw);
    Object.keys(calib).forEach((k) => {
      const v = calib[k];
      if (v && typeof v === "object" && !Array.isArray(v)) out[k] = Object.assign({}, siteRaw[k], v);
      else if (v !== undefined && v !== null) out[k] = v;
    });
    return out;
  }, [siteRaw, calib]);
  const isLinked = (k, sub) => {
    if (!calib || calib[k] === undefined || calib[k] === null) return false;
    if (sub) return typeof calib[k] === "object" && calib[k][sub] !== undefined && calib[k][sub] !== null;
    return true;
  };
  const [scenarios, setScenarios] = useState(() => (stored && stored.scenarios && stored.scenarios.length ? stored.scenarios : presetScenarios()));
  const [activeId, setActiveId] = useState(() => (stored && stored.activeId ? stored.activeId : scenarios[1] ? scenarios[1].id : "baseline"));
  const [compareId, setCompareId] = useState(() => (stored && stored.compareId ? stored.compareId : "baseline"));
  const [view, setView] = useState("build");
  const [metric, setMetric] = useState("voc");
  const [refMonth, setRefMonth] = useState(6);
  const [openDev, setOpenDev] = useState(null);
  const [adding, setAdding] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [darkState, setDark] = useState(() => {
    if (props.dark !== undefined) return props.dark;
    try {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) {
      return false;
    }
  });
  const dark = props.dark !== undefined ? props.dark : darkState;

  useEffect(() => {
    saveStore({ site: siteRaw, scenarios, activeId, compareId });
  }, [siteRaw, scenarios, activeId, compareId]);

  const active = scenarios.find((s) => s.id === activeId) || scenarios[0];
  const comp = scenarios.find((s) => s.id === compareId) || scenarios[0];
  const locked = !!active.locked;

  const resA = useMemo(() => {
    const sim = simulate(site, active);
    const sum = summarise(site, active, sim);
    const life = lifeByMonth(site, active);
    return { sim, sum, life, warn: warningsFor(site, active, sum, life) };
  }, [site, active]);
  const resC = useMemo(() => {
    const sim = simulate(site, comp);
    const sum = summarise(site, comp, sim);
    const life = lifeByMonth(site, comp);
    return { sim, sum, life };
  }, [site, comp]);
  const refDoy = MONTH_MID[refMonth];
  const train = useMemo(() => runTrain(site, active, refDoy), [site, active, refDoy]);
  const brk = useMemo(() => capacityBreakdown(site, active, comp, refDoy), [site, active, comp, refDoy]);

  // ---- scenario editing helpers
  const update = (fn) => {
    if (locked) return;
    setScenarios((list) => list.map((s) => (s.id === active.id ? fn(clone(s)) : s)));
  };
  const setDevice = (id, k, v) =>
    update((s) => {
      s.devices = s.devices.map((d) => (d.id === id ? Object.assign(d, { [k]: v }) : d));
      return s;
    });
  const addDevice = (type, pos) =>
    update((s) => {
      if (type === "vsd" && s.devices.some((d) => d.type === "vsd")) return s;
      const d = makeDevice(type, DEVICE_TYPES[type].positional ? { pos } : {});
      s.devices.push(d);
      setOpenDev(d.id);
      return s;
    });
  const removeDevice = (id) => update((s) => Object.assign(s, { devices: s.devices.filter((d) => d.id !== id) }));
  const moveDevice = (id, dir) =>
    update((s) => {
      const i = s.devices.findIndex((d) => d.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= s.devices.length) return s;
      const t = s.devices[i];
      s.devices[i] = s.devices[j];
      s.devices[j] = t;
      return s;
    });
  const duplicate = (src, name) => {
    const c = clone(src);
    c.id = newId();
    c.locked = false;
    c.name = name || src.name + " (copy)";
    c.devices.forEach((d) => (d.id = newId()));
    c.beds.forEach((b) => (b.id = newId()));
    setScenarios((l) => l.concat([c]));
    setActiveId(c.id);
    return c;
  };
  const removeScenario = (id) => {
    if (id === "baseline") return;
    const rest = scenarios.filter((s) => s.id !== id);
    setScenarios(rest);
    if (activeId === id) setActiveId(rest[rest.length - 1].id);
    if (compareId === id) setCompareId("baseline");
  };
  const resetAll = () => {
    const p = presetScenarios();
    setScenarios(p);
    setActiveId(p[1].id);
    setCompareId("baseline");
  };

  const sA = resA.sum;
  const sC = resC.sum;
  const saving = sC.total - sA.total;
  const payback = sA.capex > 0 && saving > 0 ? sA.capex / saving : null;
  const colA = "var(--acc)";
  const colC = "var(--base)";

  // ---- chart data
  const yA = sA.year;
  const yC = sC.year;
  const pick = (arr, k) => arr.map((d) => d[k]);
  const marks = (sum) => sum.events.map((e) => e.doy);
  let chart = null;
  if (metric === "voc" || metric === "pah") {
    const k = metric === "voc" ? "vRatio" : "pRatio";
    const kh = metric === "voc" ? "vHi" : "pHi";
    const seriesV = [
      { name: comp.name.slice(0, 22), color: colC, data: smooth(pick(yC, k).map((v) => v * 100), 7), marks: marks(sC), width: 1.6 },
      { name: active.name.slice(0, 22), color: colA, data: smooth(pick(yA, k).map((v) => v * 100), 7), marks: marks(sA), width: 2.2 },
      { name: "Daily (" + active.name.slice(0, 12) + ")", color: colA, data: pick(yA, k).map((v) => v * 100), width: 0.8, opacity: 0.35 },
    ];
    if (site.cautious || props.showBand) seriesV.push({ name: "Cautious (upper band)", color: colA, dash: "3 3", data: smooth(pick(yA, kh).map((v) => v * 100), 7), width: 1, opacity: 0.7 });
    chart = (
      <YearChart
        series={seriesV}
        ymax={Math.max(120, Math.min(400, Math.max.apply(null, seriesV[0].data.concat(seriesV[1].data)) * 1.1))}
        yfmt={(v) => Math.round(v) + "%"}
        refs={[
          { v: 100, label: "ELV", color: "var(--bad)" },
          { v: site.trigger * 100, label: "Change trigger", color: "var(--warn)", dash: "2 4" },
        ]}
      />
    );
  } else if (metric === "temp") {
    chart = (
      <YearChart
        autoMin
        yfmt={(v) => fmt1(v) + DEG}
        series={[
          { name: "Ambient", color: "var(--mut)", data: pick(yA, "tAmb"), width: 1 },
          { name: "Bed - " + comp.name.slice(0, 14), color: colC, data: pick(yC, "tBed"), width: 1.5 },
          { name: "Bed - " + active.name.slice(0, 14), color: colA, data: pick(yA, "tBed") },
        ]}
        refs={[{ v: site.tFloor, label: "Calibration floor", color: "var(--warn)" }]}
      />
    );
  } else {
    chart = (
      <YearChart
        ymin={0}
        ymax={105}
        yfmt={(v) => Math.round(v) + "%"}
        series={[
          { name: "Bed RH - " + comp.name.slice(0, 14), color: colC, data: pick(yC, "rhBed"), width: 1.5 },
          { name: "Bed RH - " + active.name.slice(0, 14), color: colA, data: pick(yA, "rhBed") },
        ]}
        refs={[
          { v: site.rhOnset, label: "Capacity loss starts", color: "var(--warn)" },
          { v: 70, label: "Significant loss", color: "var(--bad)" },
        ]}
      />
    );
  }

  // ---- device readouts from train steps
  const stepFor = (id) => train.steps.find((s) => s.id === id);
  const prevStep = (id) => {
    const i = train.steps.findIndex((s) => s.id === id);
    return i > 0 ? train.steps[i - 1] : null;
  };
  const rh = (st) => Math.min(100, (100 * st.pv) / psatW(st.T));

  const tankB = tankBaseline(site);
  const devs = active.devices;
  const preDevs = devs.filter((d) => DEVICE_TYPES[d.type].positional && d.pos === "pre");
  const postDevs = devs.filter((d) => DEVICE_TYPES[d.type].positional && d.pos !== "pre");
  const globalDevs = devs.filter((d) => !DEVICE_TYPES[d.type].positional);

  const renderDevice = (d) => {
    const t = DEVICE_TYPES[d.type];
    const open = openDev === d.id;
    const st = stepFor(d.id);
    const pv = prevStep(d.id);
    let summary = null;
    if (st && pv) {
      const dv = pv.voc > 0 ? (1 - st.voc / pv.voc) * 100 : 0;
      const dp = pv.pah > 0 ? (1 - st.pah / pv.pah) * 100 : 0;
      summary = (
        <span className="row" style={{ gap: 4 }}>
          <span className="chip">{fmt1(st.T) + DEG}</span>
          <span className={"chip " + (rh(st) > 70 ? "r" : rh(st) > site.rhOnset ? "a" : "")}>{Math.round(rh(st)) + "% RH"}</span>
          {dv > 0.5 ? <span className="chip g">{"VOC -" + Math.round(dv) + "%"}</span> : null}
          {dp > 0.5 ? <span className="chip g">{"PAH -" + Math.round(dp) + "%"}</span> : null}
        </span>
      );
    } else if (d.type === "vsd") {
      summary = <span className="chip">{fmtInt(d.flow) + " m3/h"}</span>;
    } else if (d.type === "source") {
      summary = <span className="chip g">{"-" + Math.round(d.cutVOC * 100) + "% / -" + Math.round(d.cutPAH * 100) + "%"}</span>;
    } else if (d.type === "vapbal" || d.type === "tankvent") {
      summary = (
        <span className="row" style={{ gap: 4 }}>
          <span className="chip">{"Tanks " + fmt1(train.tankKgDay) + " kg/day (was " + fmt1(train.tankKgDayBase) + ")"}</span>
          <span className="chip">{Math.round(tankB.share * 100) + "% of inlet load today"}</span>
        </span>
      );
    } else if (d.type === "schedule") {
      summary = <span className="chip g">{"Load-weighted stack " + fmt1(train.tShift * site.stackS) + DEG + " in " + MONTHS[refMonth]}</span>;
    } else if (d.type === "fanmove") {
      summary = <span className="chip g">{"Bed " + fmt1(site.fanHeat0) + DEG + " cooler (no fan heat)"}</span>;
    }
    if (d.on === false) summary = <span className="chip">Bypassed - not in this forecast</span>;
    else if (d.months && d.months.some((x) => x === false)) {
      const onList = MONTHS.filter((m, i) => d.months[i] !== false);
      summary = (
        <span className="row" style={{ gap: 4 }}>
          {summary}
          <span className="chip a">{onList.length ? "Runs " + onList.length + " months" : "Never runs"}</span>
        </span>
      );
    }
    const idx = devs.findIndex((x) => x.id === d.id);
    return (
      <div className="node" key={d.id} style={{ opacity: d.on === false ? 0.55 : 1 }}>
        <div className="hd" onClick={() => setOpenDev(open ? null : d.id)}>
          <Icon type={d.type} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{d.type === "custom" ? d.name : t.label}</div>
            <div style={{ marginTop: 3 }}>{summary}</div>
          </div>
          <span
            className={"tgl" + (d.on === false ? "" : " on") + (locked ? " dis" : "")}
            title={d.on === false ? "Bypassed - click to switch on" : "In service - click to bypass"}
            onClick={(e) => {
              e.stopPropagation();
              if (!locked) setDevice(d.id, "on", d.on === false);
            }}
          >
            <span className="k" />
          </span>
          <span className="mut" style={{ width: 10, textAlign: "center" }}>{open ? "-" : "+"}</span>
        </div>
        {open ? (
          <div className="bd">
            <p className="mut small" style={{ margin: "6px 0" }}>{t.blurb}</p>
            {d.type === "custom" ? (
              <div className="fld">
                <div className="lab"><span>Name</span></div>
                <input type="text" value={d.name} disabled={locked} onChange={(e) => setDevice(d.id, "name", e.target.value)} style={{ width: "100%" }} />
              </div>
            ) : null}
            {t.positional ? (
              <div className="fld">
                <div className="lab"><span>Position</span></div>
                <div className="seg">
                  <button className={d.pos === "pre" ? "on" : ""} disabled={locked} onClick={() => setDevice(d.id, "pos", "pre")}>Before fan</button>
                  <button className={d.pos !== "pre" ? "on" : ""} disabled={locked} onClick={() => setDevice(d.id, "pos", "post")}>After fan</button>
                </div>
              </div>
            ) : null}
            <div className="fld">
              <div className="lab"><span>Runs in</span><span className="mut small">click months to switch off</span></div>
              <div className="seg">
                {MONTHS.map((m, mi) => {
                  const onM = !d.months || d.months[mi] !== false;
                  return (
                    <button
                      key={m}
                      className={onM ? "on" : ""}
                      style={{ padding: "3px 6px", fontSize: 11 }}
                      disabled={locked}
                      onClick={() => {
                        const arr = d.months ? d.months.slice() : MONTHS.map(() => true);
                        arr[mi] = !onM;
                        setDevice(d.id, "months", arr);
                      }}
                    >
                      {m}
                    </button>
                  );
                })}
                <button className="ghost small" disabled={locked} onClick={() => setDevice(d.id, "months", MONTHS.map((x, i) => i >= 4 && i <= 8))}>May-Sep</button>
                <button className="ghost small" disabled={locked} onClick={() => setDevice(d.id, "months", null)}>All year</button>
              </div>
            </div>
            {FIELDS[d.type].map((f) => (
              <Field key={f.k} f={f} value={d[f.k]} disabled={locked} onChange={(v) => setDevice(d.id, f.k, v)} />
            ))}
            {st && st.kw ? <div className="mut small">{"Energy in " + MONTHS[refMonth] + ": " + fmt1(st.kw) + " kW"}</div> : null}
            <div className="row" style={{ marginTop: 8 }}>
              <button disabled={locked} onClick={() => setDevice(d.id, "on", d.on === false)}>{d.on === false ? "Switch on" : "Bypass"}</button>
              <button disabled={locked || idx === 0} onClick={() => moveDevice(d.id, -1)}>Up</button>
              <button disabled={locked || idx === devs.length - 1} onClick={() => moveDevice(d.id, 1)}>Down</button>
              <span className="sp" />
              <button disabled={locked} onClick={() => removeDevice(d.id)} style={{ color: "var(--bad)" }}>Remove</button>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const addBar = (pos) => (
    <div className="ins">
      {adding === pos ? (
        <div className="card" style={{ width: "100%", padding: 8 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <b className="small">{pos === "pre" ? "Add before the fan" : pos === "post" ? "Add after the fan" : "Add a system-wide change"}</b>
            <span className="sp" />
            <button className="ghost" onClick={() => setAdding(null)}>Close</button>
          </div>
          <div className="seg">
            {Object.keys(DEVICE_TYPES)
              .filter((k) => (pos === "glob" ? !DEVICE_TYPES[k].positional : DEVICE_TYPES[k].positional))
              .map((k) => (
                <button
                  key={k}
                  disabled={k === "vsd" && devs.some((d) => d.type === "vsd")}
                  onClick={() => {
                    addDevice(k, pos);
                    setAdding(null);
                  }}
                >
                  {DEVICE_TYPES[k].label}
                </button>
              ))}
          </div>
        </div>
      ) : (
        <button disabled={locked} onClick={() => setAdding(pos)}>{pos === "glob" ? "+ system-wide change (VSD, source, tanks, scheduling, fan position)" : pos === "pre" ? "+ add device before the fan" : "+ add device after the fan"}</button>
      )}
    </div>
  );

  // ---- carbon stage
  const setArr = (a) =>
    update((s) => {
      s.arrangement = a;
      if (a !== "single" && s.beds.length < 2) s.beds.push(newBed(s.beds[0].mass, s.beds[0].type));
      if (a === "single") s.beds = [s.beds[0]];
      return s;
    });
  const setBed = (id, k, v) =>
    update((s) => {
      s.beds = s.beds.map((b) => (b.id === id ? Object.assign(b, { [k]: v }) : b));
      return s;
    });
  const totalKg = active.beds.reduce((s, b) => s + b.mass, 0);
  const isSeries = active.arrangement === "leadlag" || active.arrangement === "seriesall";
  const ebct = isSeries ? (totalKg / site.bulkDensity / train.Q) * 3600 : (totalKg / site.bulkDensity / train.Q) * 3600;
  const bedNames = isSeries ? ["Lead", "Lag", "Lag 2", "Lag 3"] : ["Bed A", "Bed B", "Bed C", "Bed D"];

  const carbonStage = (
    <div className="node">
      <div className="hd" style={{ cursor: "default" }}>
        <Icon type="bed" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600 }}>Carbon stage</div>
          <div className="row" style={{ gap: 4, marginTop: 3 }}>
            <span className="chip">{fmt1(totalKg / 1000) + " t carbon"}</span>
            <span className="chip">{"EBCT " + fmt1(ebct) + " s"}</span>
            <span className={"chip " + (train.rhBed > 70 ? "r" : train.rhBed > site.rhOnset ? "a" : "")}>{"Bed " + fmt1(train.tBed) + DEG + ", " + Math.round(train.rhBed) + "% RH"}</span>
          </div>
        </div>
      </div>
      <div className="bd">
        <div className="seg" style={{ margin: "6px 0" }}>
          {Object.keys(ARRANGEMENTS).map((k) => (
            <button key={k} className={active.arrangement === k ? "on" : ""} disabled={locked} onClick={() => setArr(k)}>
              {ARRANGEMENTS[k].label}
            </button>
          ))}
        </div>
        <p className="mut small" style={{ margin: "4px 0 8px 0" }}>{ARRANGEMENTS[active.arrangement].help}</p>
        {active.beds.map((b, i) => (
          <div key={b.id} className="card" style={{ padding: 8, marginBottom: 6, background: "var(--soft)" }}>
            <div className="row">
              <b>{active.arrangement === "single" ? "Bed" : bedNames[i]}</b>
              <span className="sp" />
              <select value={b.type} disabled={locked} onChange={(e) => setBed(b.id, "type", e.target.value)}>
                {Object.keys(CARBON_TYPES).map((k) => (
                  <option key={k} value={k}>{CARBON_TYPES[k].label}</option>
                ))}
              </select>
              {active.beds.length > 2 ? (
                <button className="ghost" disabled={locked} onClick={() => update((s) => Object.assign(s, { beds: s.beds.filter((x) => x.id !== b.id) }))}>x</button>
              ) : null}
            </div>
            <Field f={{ label: "Carbon fill", min: 500, max: 15000, step: 250, unit: "kg" }} value={b.mass} disabled={locked} onChange={(v) => setBed(b.id, "mass", v)} />
            <Field f={{ label: "Bed depth", min: 0.3, max: 3, step: 0.05, unit: "m" }} value={b.depth || site.bedDepth0} disabled={locked} onChange={(v) => setBed(b.id, "depth", v)} />
            <div className="mut small">{CARBON_TYPES[b.type].note}</div>
          </div>
        ))}
        <div className="card" style={{ padding: 8, marginBottom: 6 }}>
          <b className="small">Changeout practice</b>
          {active.arrangement === "leadlag" ? (
            <div>
              <div className="seg" style={{ margin: "6px 0" }}>
                <button className={active.trigMode !== "interstage" ? "on" : ""} disabled={locked} onClick={() => update((s) => Object.assign(s, { trigMode: "stack" }))}>Predicted stack trigger</button>
                <button className={active.trigMode === "interstage" ? "on" : ""} disabled={locked} onClick={() => update((s) => Object.assign(s, { trigMode: "interstage", leadFrac: s.leadFrac || 0.5, backstop: s.backstop || 0.95, interCapex: s.interCapex === undefined ? 15000 : s.interCapex }))}>Interstage analyser</button>
              </div>
              {active.trigMode === "interstage" ? (
                <div>
                  <Field f={{ label: "Change when lead outlet reaches", min: 0.05, max: 0.95, step: 0.05, pct: true, tag: "of inlet" }} value={active.leadFrac || 0.5} disabled={locked} onChange={(v) => update((s) => Object.assign(s, { leadFrac: v }))} />
                  <Field f={{ label: "Stack backstop (measured)", min: 0.5, max: 1, step: 0.05, pct: true, tag: "of ELV" }} value={active.backstop || 0.95} disabled={locked} onChange={(v) => update((s) => Object.assign(s, { backstop: v }))} />
                  <Field f={{ label: "Analyser + sample port cost", min: 0, max: 60000, step: 500, unit: GBP }} value={active.interCapex || 0} disabled={locked} onChange={(v) => update((s) => Object.assign(s, { interCapex: v }))} />
                  <div className="mut small">{"Lead outlet now: " + Math.round(((yA[refDoy] && yA[refDoy].leadOut) || 0) * 100) + "% of inlet on " + MONTHS[refMonth] + " mid-month. Events set by interstage this year: " + sA.byInter + " of " + sA.changeouts + "."}</div>
                </div>
              ) : (
                <div className="mut small">Carbon is changed when the predicted stack reaches the trigger on the Assumptions screen.</div>
              )}
            </div>
          ) : (
            <div>
              <Field f={{ label: "Carbon replaced at each changeout (inlet layer first)", min: 0.25, max: 1, step: 0.05, pct: true }} value={active.partialFrac || 1} disabled={locked} onChange={(v) => update((s) => Object.assign(s, { partialFrac: v }))} />
              <div className="mut small">100% = full changeout. Below 100% only the inlet layer is replaced; the rest stays in with its loading.</div>
            </div>
          )}
        </div>
        <div className="row">
          <button disabled={locked || active.arrangement === "single" || active.beds.length >= 4} onClick={() => update((s) => Object.assign(s, { beds: s.beds.concat([newBed(s.beds[0].mass, s.beds[0].type)]) }))}>+ add vessel</button>
          <span className="sp" />
          <span className="small mut">Vessel / ductwork cost</span>
          <input type="number" style={{ width: 90 }} value={active.vesselCapex || 0} disabled={locked} step={1000} onChange={(e) => update((s) => Object.assign(s, { vesselCapex: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>
    </div>
  );

  // ---- build view
  const buildView = (
    <div className="grid">
      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>System builder</h3>
          <span className="sp" />
          <span className="small mut">Readouts for</span>
          <select value={refMonth} onChange={(e) => setRefMonth(parseInt(e.target.value, 10))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
        </div>
        {locked ? (
          <div className="warn">
            <div className="b" style={{ background: "var(--acc)" }} />
            <div>
              The baseline is your current system and is locked. <button className="pri" onClick={() => duplicate(active, "My trial")}>Copy it to start a trial</button>
            </div>
          </div>
        ) : null}
        <div className="node fixed">
          <div className="hd" style={{ cursor: "default" }}>
            <Icon type="in" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Extraction (all points incl. tank vents) + old scrubber shell</div>
              <div className="mut small">{fmt1(train.steps[0].T) + DEG + " | VOC " + fmtInt(train.steps[0].voc) + " mg/m3 to carbon basis | " + fmtInt(train.Q) + " m3/h | tanks " + fmt1(train.tankKgDay) + " kg/day" + (train.deliveries ? " (delivery day)" : "")}</div>
            </div>
          </div>
        </div>
        {globalDevs.length ? <div style={{ marginTop: 6 }}>{globalDevs.map(renderDevice)}</div> : null}
        {addBar("glob")}
        {preDevs.map((d) => (
          <div key={"w" + d.id}>
            <div className="arrow">|</div>
            {renderDevice(d)}
          </div>
        ))}
        {addBar("pre")}
        <div className="node fixed">
          <div className="hd" style={{ cursor: "default" }}>
            <Icon type="fan" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{train.fanAfter ? "Existing demister (fan moved after the carbon bed)" : "Main fan (Halifax) + existing demister"}</div>
              <div className="mut small">{(train.fanAfter ? "No fan heat at the bed (was ~" + fmt1(site.fanHeat0) + DEG + ")" : "Adds ~" + fmt1(site.fanHeat0 * Math.pow(train.Q / site.flow0, 2)) + DEG) + " | " + fmtInt(train.Q) + " m3/h"}</div>
            </div>
          </div>
        </div>
        {postDevs.map((d) => (
          <div key={"w" + d.id}>
            <div className="arrow">|</div>
            {renderDevice(d)}
          </div>
        ))}
        {addBar("post")}
        {carbonStage}
        <div className="arrow">|</div>
        <div className="node fixed">
          <div className="hd" style={{ cursor: "default" }}>
            <Icon type="stack" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>Stack (A4)</div>
              <div className="mut small">{"ELV VOC " + site.elvVOC + " mg/Nm3 | PAH " + fmtInt(site.elvPAH) + " ug/Nm3"}</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="row" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Forecast</h3>
          <span className="pill act"><span className="dot" style={{ background: colA }} />{active.name}</span>
          <span className="mut small">vs</span>
          <select value={compareId} onChange={(e) => setCompareId(e.target.value)}>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="kpis">
          <Kpi label="Changeout events / year" value={sA.changeouts} sub={deltaTxt(sA.changeouts - sC.changeouts, "", 0) + " vs " + sC.changeouts} delta={sA.changeouts - sC.changeouts} goodIfDown />
          <Kpi label="Average days between changeouts" value={sA.avgInt ? fmtInt(sA.avgInt) : ">365"} sub={"was " + (sC.avgInt ? fmtInt(sC.avgInt) : ">365")} delta={(sA.avgInt || 365) - (sC.avgInt || 365)} />
          <Kpi label="Carbon used / year" value={fmt1(sA.kg / 1000) + " t"} sub={deltaTxt((sA.kg - sC.kg) / 1000, " t", 1)} delta={sA.kg - sC.kg} goodIfDown />
          <Kpi label="Running cost / year (carbon + energy)" value={money(sA.total)} sub={(saving >= 0 ? "saves " : "costs ") + money(Math.abs(saving)) + "/yr"} delta={-saving} goodIfDown />
          <Kpi label="Capital cost" value={money(sA.capex)} sub={payback ? "payback " + fmt1(payback) + " yr" : saving > 0 ? "no capex entered" : "no payback"} />
          <Kpi label="Days over an ELV / year" value={sA.over} sub={"was " + sC.over} delta={sA.over - sC.over} goodIfDown />
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <div className="row">
            <h3 style={{ margin: 0 }}>Predicted stack over a typical year</h3>
            <span className="sp" />
            <div className="seg">
              {[["voc", "VOC % ELV"], ["pah", "PAH % ELV"], ["temp", "Bed temp"], ["rh", "Bed RH"]].map((m) => (
                <button key={m[0]} className={metric === m[0] ? "on" : ""} onClick={() => setMetric(m[0])}>{m[1]}</button>
              ))}
            </div>
          </div>
          {chart}
          <div className="mut small">Steady-state year (after two years of changeouts). Bold lines are 7-day means (the changeout decision basis); the faint line shows day-to-day weather swings. Triangles mark changeouts. Hover for values.</div>
        </div>

        <div className="two" style={{ marginTop: 12 }}>
          <div className="card">
            <h3>Fresh-carbon life by start month</h3>
            <MonthBars
              sets={[
                { name: comp.name, color: colC, data: resC.life },
                { name: active.name, color: colA, data: resA.life },
              ]}
            />
            <div className="mut small">Days from fresh carbon to the change trigger. Faded bars ran past 400 days. P = PAH triggered.</div>
          </div>
          <div className="card">
            <h3>{"Why the lead-bed capacity changes (" + MONTHS[refMonth] + ")"}</h3>
            {brk.items.map((it) => {
              const lf = Math.log(Math.max(0.05, it.f)) / Math.log(4);
              const w = Math.min(50, Math.abs(lf) * 50);
              return (
                <div key={it.k} className="row" style={{ margin: "5px 0", flexWrap: "nowrap" }}>
                  <span style={{ width: 150, flex: "none" }} className="small">{it.k}</span>
                  <div style={{ flex: 1, position: "relative", height: 14, background: "var(--soft)", borderRadius: 4 }}>
                    <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--line)" }} />
                    <div style={{ position: "absolute", top: 2, bottom: 2, borderRadius: 3, left: lf >= 0 ? "50%" : 50 - w + "%", width: w + "%", background: lf >= 0 ? "var(--ok)" : "var(--bad)" }} />
                  </div>
                  <span style={{ width: 52, textAlign: "right", flex: "none" }} className={"small " + (it.f > 1.005 ? "good" : it.f < 0.995 ? "bad" : "mut")}>{"x" + it.f.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="row" style={{ borderTop: "1px solid var(--line)", paddingTop: 6, marginTop: 6 }}>
              <b className="small">Combined</b>
              <span className="sp" />
              <b className={brk.total >= 1 ? "good" : "bad"}>{"x" + brk.total.toFixed(2)}</b>
            </div>
            <div className="mut small">Multipliers on the loading the carbon can take before breakthrough, vs the comparison. Series beds also gain from rotation, which is not shown here.</div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <h3>{"Gas conditions through the train (" + MONTHS[refMonth] + ")"}</h3>
          <div className="strip">
            {train.steps.map((s, i) => (
              <React.Fragment key={"s" + i}>
                {i ? <div className="cn">{">"}</div> : null}
                <div className="blk">
                  <div className="t" style={{ color: "var(--ink)" }}>{s.label}</div>
                  <div>{fmt1(s.T) + DEG}</div>
                  <div>{Math.round(rh(s)) + "% RH"}</div>
                  <div>{"VOC " + fmtInt(s.voc)}</div>
                  <div>{"PAH " + fmtInt(s.pah)}</div>
                </div>
              </React.Fragment>
            ))}
            <div className="cn">{">"}</div>
            <div className="blk" style={{ borderColor: "var(--acc)" }}>
              <div className="t" style={{ color: "var(--ink)" }}>Stack</div>
              <div>{"VOC " + fmt1(yA[refDoy] ? yA[refDoy].voc : 0) + " mg"}</div>
              <div>{"PAH " + fmtInt(yA[refDoy] ? yA[refDoy].pah : 0) + " ug"}</div>
            </div>
          </div>
          <div className="mut small">VOC and PAH in mg/m3 at actual flow, on the assumed carbon-inlet basis (set on Assumptions). Stack values are for that day in the steady-state year.</div>
        </div>

        <div className="card" style={{ marginTop: 12 }}>
          <h3>Checks and limits</h3>
          {resA.warn.length === 0 ? <div className="mut">No issues flagged for this configuration.</div> : null}
          {resA.warn.map((w, i) => (
            <div className="warn" key={"w" + i}>
              <div className="b" style={{ background: w.lvl === "red" ? "var(--bad)" : w.lvl === "amber" ? "var(--warn)" : "var(--acc)" }} />
              <div>{w.t}</div>
            </div>
          ))}
          <div className="warn">
            <div className="b" style={{ background: "var(--mut)" }} />
            <div>
              {"Model uncertainty: the calibrated VOC model has a leave-one-out band of x" + site.voc.band + " and PAH x" + site.pah.band + ". Device effects are physics/literature estimates layered on top and are not yet site-tested. Use Trial Mode to rank options and size trials, not to defer a changeout."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // ---- compare view
  const allRes = useMemo(() => {
    if (view !== "compare") return [];
    return scenarios.map((s) => {
      const sim = simulate(site, s);
      const sum = summarise(site, s, sim);
      const life = lifeByMonth(site, s);
      return { s, sum, life };
    });
  }, [view, site, scenarios]);
  const base = allRes.find((r) => r.s.id === "baseline");
  const compareView = (
    <div className="card" style={{ overflowX: "auto" }}>
      <h3>All trials against the current system</h3>
      <table>
        <thead>
          <tr>
            <th>Trial</th>
            <th>Changeouts/yr</th>
            <th>Avg interval (d)</th>
            <th>Jan start life (d)</th>
            <th>Jul start life (d)</th>
            <th>Carbon t/yr</th>
            <th>Carbon cost</th>
            <th>Energy cost</th>
            <th>Other running</th>
            <th>Total / yr</th>
            <th>Saving / yr</th>
            <th>Capex</th>
            <th>Payback (yr)</th>
            <th>Days over ELV</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {allRes.map((r) => {
            const sv = base ? base.sum.total - r.sum.total : 0;
            const pb = r.sum.capex > 0 && sv > 0 ? r.sum.capex / sv : null;
            return (
              <tr key={r.s.id}>
                <td>
                  <b>{r.s.name}</b>
                  <div className="mut small">{ARRANGEMENTS[r.s.arrangement].label + ", " + fmt1(r.s.beds.reduce((a, b) => a + b.mass, 0) / 1000) + " t" + (r.s.devices.length ? ", " + r.s.devices.filter((d) => d.on !== false).map((d) => DEVICE_TYPES[d.type].short).join(" + ") : "")}</div>
                </td>
                <td>{r.sum.changeouts}</td>
                <td>{r.sum.avgInt ? fmtInt(r.sum.avgInt) : ">365"}</td>
                <td>{(r.life[0].by === "none" ? ">" : "") + r.life[0].days}</td>
                <td>{(r.life[6].by === "none" ? ">" : "") + r.life[6].days}</td>
                <td>{fmt1(r.sum.kg / 1000)}</td>
                <td>{money(r.sum.carbonCost)}</td>
                <td>{money(r.sum.energyCost)}</td>
                <td>{money(r.sum.otherCost)}</td>
                <td><b>{money(r.sum.total)}</b></td>
                <td className={sv > 0 ? "good" : sv < 0 ? "bad" : ""}>{r.s.id === "baseline" ? "-" : money(sv)}</td>
                <td>{money(r.sum.capex)}</td>
                <td>{pb ? fmt1(pb) : "-"}</td>
                <td className={r.sum.over > 0 ? "bad" : ""}>{r.sum.over}</td>
                <td>
                  <button onClick={() => { setActiveId(r.s.id); setView("build"); }}>Open</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mut small">Same assumptions, throughput and weather for every trial. Energy cost is the change vs today (negative = saving, e.g. fan power with a VSD). Other running = device running costs such as a shift premium for scheduling.</p>
    </div>
  );

  // ---- assumptions view
  const setS = (k, v) => setSite((s) => Object.assign({}, s, { [k]: v }));
  const setSub = (g, k, v) => setSite((s) => Object.assign({}, s, { [g]: Object.assign({}, s[g], { [k]: v }) }));
  const assumeView = (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="mut">These apply to every trial. Values marked (confirm) are placeholders until measured.</span>
        <span className="sp" />
        <button onClick={() => setSite(Object.assign(clone(DEFAULT_SITE), props.defaults || {}))}>Reset assumptions</button>
      </div>
      <div className="two">
        {SITE_GROUPS.map((g) => (
          <div className="card" key={g.title}>
            <h3>{g.title}</h3>
            <div className="mut small">{g.note}</div>
            {g.fields.map((f) => (
              <Field key={f.k} f={isLinked(f.k) ? Object.assign({}, f, { label: f.label + " (from app)" }) : f} value={site[f.k]} disabled={isLinked(f.k)} onChange={(v) => setS(f.k, v)} />
            ))}
          </div>
        ))}
        <div className="card">
          <h3>Calibrated bed models</h3>
          <div className="mut small">{calib && calib.voc ? "ln(outlet) = a ln(creosote tonnes) + b T_stack + c. Linked live to the app's creosote-throughput trial model (refits whenever a stack test is added); band = exp(leave-one-out RMSE)." : "ln(outlet) = a ln(creosote tonnes) + b T_stack + c. VOC: trial model (variant D) on corrected tonnes, 23 Nov 2026. PAH: indicative fit to P8-P14 - replace with the app's fitted PAH coefficients."}</div>
          {["voc", "pah"].map((g) => (
            <div key={g} style={{ marginTop: 8 }}>
              <b className="small">{g === "voc" ? "VOC (mg/m3)" : "PAH (ug/m3)"}</b>
              <div className="row">
                {["a", "b", "c", "band", "rhK"].map((k) => (
                  <label key={k} className="small mut" style={{ display: "flex", flexDirection: "column" }}>
                    {k === "band" ? "LOO band x" : k === "rhK" ? "RH penalty k" : k}
                    <input type="number" step="0.001" style={{ width: 78 }} value={Math.round(site[g][k] * 1000) / 1000} disabled={isLinked(g, k)} onChange={(e) => setSub(g, k, parseFloat(e.target.value) || 0)} />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Carbon inlet composition (confirm by inlet test)</h3>
          <div className="mut small">Concentration reaching the carbon at today's flow, mg/m3. Not yet measured - this mainly sets how much a condenser or DCWBC can remove. An inlet VOC + PAH test is the most valuable single measurement for Trial Mode.</div>
          {SPECIES.map((k) => (
            <div key={k} className="row" style={{ margin: "6px 0" }}>
              <span className="small" style={{ flex: 1 }}>{SPECIES_LABEL[k]}</span>
              <input type="number" style={{ width: 80 }} value={site.inlet[k]} onChange={(e) => setSub("inlet", k, parseFloat(e.target.value) || 0)} />
              <span className="small mut">mist</span>
              <input type="number" style={{ width: 60 }} step="0.05" value={site.aerosol[k]} onChange={(e) => setSub("aerosol", k, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Tank load today (from the inputs on the left)</h3>
          <table>
            <tbody>
              <tr><td>Headspace temperature (mid-July / mid-January)</td><td>{fmt1(runTrain(site, scenarios[0], 196).tankT) + " / " + fmt1(runTrain(site, scenarios[0], 15).tankT) + " " + DEG}</td></tr>
              <tr><td>Continuous vent sweep</td><td>{fmt1(tankB.sweepKgDay) + " kg/day"}</td></tr>
              <tr><td>Deliveries (displacement + air blow)</td><td>{fmtInt(tankB.delKgYr) + " kg/yr"}</td></tr>
              <tr><td>Total tank load to the carbon</td><td><b>{fmt1(tankB.totKgDay) + " kg/day"}</b></td></tr>
              <tr><td>Share of carbon inlet load (all / PAH)</td><td><b>{Math.round(tankB.share * 100) + "% / " + Math.round(tankB.sharePAH * 100) + "%"}</b></td></tr>
              <tr><td>Carbon inlet load (from inlet composition)</td><td>{fmt1(tankB.inletKgDay) + " kg/day"}</td></tr>
            </tbody>
          </table>
          {tankB.overflow.length ? <div className="warn"><div className="b" style={{ background: "var(--bad)" }} /><div>{"Tank inputs exceed the assumed inlet for " + tankB.overflow.join(", ") + " - make the two consistent."}</div></div> : null}
          <div className="mut small">A delivery displaces only ~{site.deliveryM3} m3 of headspace into ~{fmtInt(site.flow0 * site.hoursPerDay)} m3 of daily extraction, so deliveries matter far less than air drawn continuously through the vents.</div>
        </div>
        <div className="card">
          <h3>Climate - Boston monthly means</h3>
          <div className="row">
            <span className="small">Weather year</span>
            <div className="seg">
              {[["smooth", "Monthly means only"], ["typical", "Typical (daily swings)"], ["warm", "Warm year +1.5"], ["hot", "Hot summer"]].map((w) => (
                <button key={w[0]} className={site.weather === w[0] ? "on" : ""} onClick={() => setS("weather", w[0])}>{w[1]}</button>
              ))}
            </div>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th />
                {MONTHS.map((m) => (
                  <th key={m}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[["tMonth", "Ambient " + DEG], ["rhMonth", "RH %"], ["diurnalAmp", "Day-night half-range " + DEG]].map((r) => (
                <tr key={r[0]}>
                  <td className="small">{r[1]}</td>
                  {site[r[0]].map((v, i) => (
                    <td key={i} style={{ padding: 2 }}>
                      <input
                        type="number"
                        style={{ width: 46, fontSize: 11 }}
                        disabled={isLinked(r[0])}
                        value={v}
                        onChange={(e) => {
                          const a = site[r[0]].slice();
                          a[i] = parseFloat(e.target.value) || 0;
                          setS(r[0], a);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const methodView = <MethodNotes site={site} />;

  return (
    <div className={"tm" + (props.appMode ? " app" : dark ? " dark" : "")}>
      <style>{CSS}</style>
      <div className="row">
        <div>
          <h2>Trial Mode</h2>
          <div className="mut">Add equipment or change the carbon arrangement and see what it does to carbon life, cost and compliance.</div>
        </div>
        <span className="sp" />
        <label className="small mut row" style={{ gap: 6 }}>
          Throughput
          <input type="number" style={{ width: 60 }} step="0.5" value={site.throughput} onChange={(e) => setS("throughput", parseFloat(e.target.value) || 0)} />
          t/day
        </label>
        <label className="small mut row" style={{ gap: 6 }}>
          <input type="checkbox" checked={site.cautious} onChange={(e) => setS("cautious", e.target.checked)} />
          Cautious trigger (upper band)
        </label>
        {props.dark === undefined && !props.appMode ? <button onClick={() => setDark(!darkState)}>{dark ? "Light" : "Dark"}</button> : null}
      </div>

      <div className="row" style={{ marginTop: 12, gap: 6 }}>
        {scenarios.map((s) => (
          <span key={s.id} className={"pill" + (s.id === activeId ? " act" : "")} onClick={() => setActiveId(s.id)}>
            <span className="dot" style={{ background: s.id === "baseline" ? "var(--base)" : s.id === activeId ? "var(--acc)" : "var(--line)" }} />
            {s.name}
          </span>
        ))}
        <button onClick={() => duplicate(blankScenario(), "New trial")}>+ New</button>
        <button onClick={() => duplicate(active)}>Duplicate</button>
        {renaming ? (
          <input
            type="text"
            autoFocus
            defaultValue={active.name}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = e.target.value.trim();
                if (n) update((s) => Object.assign(s, { name: n }));
                setRenaming(false);
              }
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={(e) => {
              const n = e.target.value.trim();
              if (n) update((s) => Object.assign(s, { name: n }));
              setRenaming(false);
            }}
          />
        ) : (
          <button disabled={locked} onClick={() => setRenaming(true)}>Rename</button>
        )}
        <button disabled={locked} onClick={() => removeScenario(active.id)}>Delete</button>
        <span className="sp" />
        <button className="ghost small" onClick={() => setScenarios((l) => l.concat(extraPresets()))}>+ Add 23 Nov example trials</button>
        <button className="ghost small" onClick={resetAll}>Restore example trials</button>
      </div>

      <div className="tabs">
        {[["build", "Build and forecast"], ["compare", "Compare trials"], ["assume", "Assumptions"], ["method", "How it works"]].map((t) => (
          <button key={t[0]} className={view === t[0] ? "act" : ""} onClick={() => setView(t[0])}>{t[1]}</button>
        ))}
      </div>
      {view === "build" ? buildView : view === "compare" ? compareView : view === "assume" ? assumeView : methodView}
    </div>
  );
}

function deltaTxt(d, unit, dp) {
  if (!isFinite(d) || Math.abs(d) < (dp ? 0.05 : 0.5)) return "no change";
  const v = dp ? fmt1(Math.abs(d)) : fmtInt(Math.abs(d));
  return (d > 0 ? "+" : "-") + v + unit;
}

function MethodNotes(props) {
  const s = props.site;
  return (
    <div className="two prose">
      <div className="card">
        <h3>How Trial Mode works</h3>
        <p>Trial Mode runs your trial and the comparison day by day for three years and reports the third (steady-state) year. Each day passes through five linked sub-models.</p>
        <h4>1. Climate <span className="tag">site data</span></h4>
        <p>Boston monthly mean temperature and RH, with a repeatable day-to-day swing so hot spells appear. Stack (bed-inlet) temperature comes from the ambient-to-stack regression.</p>
        <h4>2. Gas train <span className="tag">physics</span></h4>
        <p>Temperature, water vapour and four lumped species (light VOC, naphthalene, methylnaphthalenes, 3-ring PAH) are carried through each device in order. The fan adds heat that scales with flow squared. Bed RH is water vapour pressure over saturation pressure at the bed temperature.</p>
        <h4>3. Device sub-models <span className="tag">physics + literature</span></h4>
        <p>Condensers and the DCWBC cool to a set point. Each species condenses down to its saturation concentration at that temperature (naphthalene from its recommended sublimation curve, 10.9 Pa at 25 C), and only the captured share of the condensate is removed; the rest is assumed to carry on as fog. Pure-component saturation is used, which under-states condensation from the real mixture, so condenser removals are conservative. Water condenses to the dew point; the DCWBC also re-saturates the gas, which adds water in winter. A mist eliminator removes the mist share of each species. A VSD changes flow: with the same vapour mass captured, concentration rises as flow falls, while contact time lengthens, the mass-transfer zone shortens and fan heat and power fall.</p>
        <h4>4. Bed capacity <span className="tag">site-calibrated</span></h4>
        <p>{"The calibrated model ln(VOC) = " + s.voc.a + " ln(t) + " + s.voc.b + " T_stack " + s.voc.c + " is the early part of a breakthrough curve. Trial Mode writes it as a full log-logistic curve (outlet/inlet = x^a / (1 + x^a), x = loading / loading at 50%), which matches the site fit exactly at low breakthrough and saturates at 100%. That allows beds to be chained and rotated."}</p>
        <p>The loading a bed can take is then scaled by: carbon mass; carbon type; utilisation (1 - MTZ / 2 x depth, MTZ length rising with velocity); concentration (Freundlich, capacity ~ C^n); humidity (no loss below the onset RH, rising to a k-fraction loss at saturation, after the Hansen-Fackler / Wood treatments of Dubinin-Radushkevich); and bed temperature. Only the bed share of the temperature effect is credited when a device cools the gas, and never below the calibration floor.</p>
        <h4>5. Arrangement and operations <span className="tag">engineering practice</span></h4>
        <p>Parallel beds split the flow by carbon mass. Staggered parallel changes only the most loaded bed. Series beds act as one deep bed; at a lead/lag rotation the lead leaves with the share of the loading the calibrated profile places in it, the lag moves up and fresh carbon goes in last. Carbon is changed when the predicted stack reaches the trigger (central or upper band). Cost = fixed cost per event + carbon by mass; energy = chillers, heaters, added pressure drop and fan power change.</p>
      </div>
      <div className="card">
        <h3>Carbon-life techniques - what the research says and how it is modelled</h3>
        <h4>Lead/lag (series) beds <span className="tag">high confidence</span></h4>
        <p>The lag catches breakthrough from the lead, so the lead can be run far closer to saturation before it is emptied. Carbon is used more completely and the stack is protected. This is the strongest single lever and the programme's primary safety net.</p>
        <h4>Keep bed RH below ~50% <span className="tag">high confidence</span></h4>
        <p>Above a critical RH (often 50-65%) water condenses in the micropores and takes capacity, more so for lighter, less adsorbable compounds. Cooling without removing water raises RH. Cool below the dew point to drop water out, then add only enough heat (fan heat, or a small reheat) to bring RH back below ~50-60%.</p>
        <h4>Cool the gas <span className="tag">medium - site-specific</span></h4>
        <p>Adsorption capacity falls as temperature rises, and the site data show PAH roughly doubling per 2-2.5 C of stack temperature. Cooling is credited only for the bed share of that effect and only down to the calibration floor. A single chiller is a single point of failure.</p>
        <h4>Condense out heavy components <span className="tag">medium - needs inlet data</span></h4>
        <p>Naphthalene and 3-ring PAH have low vapour pressures; chilling to 5-8 C can remove a large share before the carbon, if the condensate is captured rather than formed into fog. The benefit depends on inlet concentration, which is not yet measured.</p>
        <h4>Velocity and contact time <span className="tag">medium - not measured</span></h4>
        <p>Typical design superficial velocities are around 0.3-0.4 m/s (60-85 ft/min). Lower velocity shortens the mass-transfer zone and uses more of the bed. Lower flow also raises concentration (the ELV is concentration-based), so a VSD mainly pays back through fan energy unless the bed is MTZ-limited. A stack test at reduced fan speed would settle this.</p>
        <h4>Remove mist <span className="tag">medium</span></h4>
        <p>Creosote mist blinds the inlet face and carries heavy PAH. A high-efficiency coalescer protects the carbon.</p>
        <h4>Carbon grade <span className="tag">indicative</span></h4>
        <p>Coal-based grades suit the larger PAH molecules; coconut shell suits light VOC. High-activity and hydrophobic grades trade price for capacity or humidity tolerance. Factors are editable and should be confirmed with supplier isotherms and CoAs.</p>
        <h4>Tank vents and tanker deliveries <span className="tag">physics - sweep flow not measured</span></h4>
        <p>The storage tank vents and tanker displacement go to the extraction, so their vapour is already inside the measured carbon inlet. Trial Mode estimates it (headspace concentration from Raoult's law at tank temperature, times the air drawn continuously through the vents plus the volume displaced at each delivery) and subtracts it from the inlet to leave the process share. A vent damper with a pressure/vacuum valve cuts the continuous sweep; vapour balancing returns displaced vapour to the tanker. Deliveries are small against ~200,000 m3/day of extraction; the continuous sweep can matter, depending on flow and tank temperature.</p>
        <h4>Schedule heavy steps for cooler hours <span className="tag">medium - estimate</span></h4>
        <p>Moving a share of the day's emission load from the warm half of the day to the cool half lowers the load-weighted ambient by about 1.27 x share x the day-night half-range, which feeds the stack temperature through the site regression. Mass load is unchanged.</p>
        <h4>Fan after the bed <span className="tag">high - physics</span></h4>
        <p>The fan's heat of compression and any motor heat then reach the gas after the carbon, so the bed runs cooler by the fan temperature rise. Measure the rise across the fan to firm up the benefit.</p>
        <h4>Interstage analyser (lead/lag) <span className="tag">medium</span></h4>
        <p>Changes the lead when an analyser between the beds reads a set share of inlet, with the stack held to a measured backstop. With the site-calibrated breakthrough curve the lead is only part-loaded when the stack nears the ELV, so the backstop usually sets the change; the inlet test will show whether that holds.</p>
        <h4>Partial changeout <span className="tag">medium</span></h4>
        <p>Replaces only the inlet layer. The carbon left in keeps the loading the calibrated profile places beyond that layer (same treatment as a lead/lag rotation). Less carbon per event, more events; outlet bleed is not modelled.</p>
        <h4>Not modelled</h4>
        <p>Dilution air (rejected: concentration-based ELV); in-situ steam regeneration (heavy creosote ends do not strip cleanly); bed cooling jacket (rejected earlier); chiller trips and partial availability.</p>
        <h4>Sources</h4>
        <p className="small mut">US EPA Air Pollution Control Cost Manual, Carbon Adsorbers ch. (RH above 50%, 60-85 ft/min, working capacity ~50% of equilibrium, canisters in series). Lodewyckx, Wood &amp; Ryu - the Wheeler-Jonas equation for carbon bed breakthrough. Wood - DR / Wheeler-Jonas estimation with temperature and RH. Kawar &amp; Underhill (1999) - Hansen-Fackler modification of DR for humidity. Cal et al. (1996) - benzene capacity falls sharply above ~65% RH. Ruzicka et al. (2005) - recommended vapour pressure of solid naphthalene. ASTM D5160 - mass transfer zone and bed utilisation. Site: MCERTS A4 tests P1-P14, model review 20-23 Nov 2026.</p>
      </div>
    </div>
  );
}
