import { Fragment, useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea, ResponsiveContainer
} from "recharts";
import { createDefaultPlatformState } from "./platformShared.js";
import { cleanCreoLog, cleanUsageKg } from "./creoUsage.js";
import TrialModeTab from "./trial/TrialModeTab.jsx";
import { calibrateHotDay, pahRiskDays, pahSeasonOutlook, hindcast as pahHindcast } from "./pahRisk.js";

// ============================================================
// BRAND TOKENS
// ============================================================
const C = {
  bg:       "var(--bg)",
  surface:  "var(--panel)",
  surface2: "var(--panel2)",
  surface3: "var(--panel3)",
  header:   "var(--text)",
  border:       "var(--line)",
  borderBright: "var(--line2)",
  borderGreen:  "var(--ok)",
  green:  "var(--ok)",
  mid:    "var(--ok)",
  rund:   "var(--accent)",
  gold:   "var(--gold)",
  white:  "var(--text)",
  ivory:  "var(--panel2)",
  ink:    "var(--text)",
  muted:  "var(--muted)",
  mono:   "var(--text2)",
  teal:   "var(--ok)",
  amber:  "var(--warn)",
  red:    "var(--bad)",
  blue:   "var(--info)",
  timber: "var(--timber)",
  grid:   "var(--grid)",
  onAccent: "var(--on-accent)",
};
const TINT = {
  safeBg: "var(--ok-soft)",
  safeText: "var(--ok)",
  amberBg: "var(--warn-soft)",
  amberText: "var(--warn)",
  redBg: "var(--bad-soft)",
  redText: "var(--bad)",
  blueBg: "var(--info-soft)",
  blueText: "var(--info)",
};
// Semi-transparent version of a palette colour (palette entries are CSS variables).
function alpha(color, pct) {
  return "color-mix(in srgb, " + color + " " + pct + "%, transparent)";
}
const THEME_CSS = [
  ".cb{color-scheme:dark;--bg:#0A1017;--panel:#111A24;--panel2:#16212D;--panel3:#1C2836;--line:#223041;--line2:#2E3F54;--text:#E6EDF3;--text2:#C3D0DE;--muted:#93A4B8;",
  "--accent:#22D3EE;--accent-soft:rgba(34,211,238,.14);--on-accent:#06222A;--ok:#34D399;--ok-soft:rgba(52,211,153,.14);--warn:#FBBF24;--warn-soft:rgba(251,191,36,.14);",
  "--bad:#F87171;--bad-soft:rgba(248,113,113,.14);--info:#60A5FA;--info-soft:rgba(96,165,250,.14);--gold:#E8C35A;--timber:#C08A3E;--grid:rgba(147,164,184,.16)}",
  ".cb.light{color-scheme:light;--bg:#F4F6F9;--panel:#FFFFFF;--panel2:#F1F4F8;--panel3:#E7ECF2;--line:#DCE3EB;--line2:#C5CFDB;--text:#0F172A;--text2:#26364D;--muted:#4B5A6E;",
  "--accent:#0E7490;--accent-soft:rgba(14,116,144,.10);--on-accent:#FFFFFF;--ok:#047857;--ok-soft:rgba(4,120,87,.10);--warn:#B45309;--warn-soft:rgba(180,83,9,.10);",
  "--bad:#B91C1C;--bad-soft:rgba(185,28,28,.09);--info:#1D4ED8;--info-soft:rgba(29,78,216,.08);--gold:#A16207;--timber:#8B6914;--grid:rgba(75,90,110,.14)}",
  ".cb{background:var(--bg);color:var(--text);font-family:Inter,system-ui,'Segoe UI',sans-serif}",
  ".cb .num{font-family:'JetBrains Mono',Consolas,monospace}",
  ".cb input,.cb select,.cb textarea{color:var(--text);background:var(--panel2);border-color:var(--line)}",
  ".cb table{color:var(--text)}",
  ".cb a{color:var(--accent)}",
  ".cb .recharts-default-tooltip{background:var(--panel)!important;border:1px solid var(--line)!important;border-radius:10px;color:var(--text)}",
  ".cb .recharts-cartesian-axis-tick-value{fill:var(--muted)}",
  ".cb .recharts-legend-item-text{color:var(--text2)!important}",
  ".cb button:focus-visible,.cb a:focus-visible,.cb input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}",
  ".cb .navbtn:hover{color:var(--text)!important;background:var(--panel2)!important}",
  ".cb details>summary::marker{color:var(--accent)}",
  "@media (max-width: 900px){.cb .hdr{padding:10px 14px!important;gap:8px 12px!important}.cb .mainnav{order:3;flex:1 1 100%!important;flex-wrap:nowrap!important;overflow-x:auto;scrollbar-width:none;margin:0 -4px}.cb .mainnav::-webkit-scrollbar{display:none}.cb .mainnav button{flex:0 0 auto;white-space:nowrap}.cb .hdr-tools{margin-left:auto}}",
  "@media (max-width: 600px){.cb .hdr-sub,.cb .hdr-sync span:not(:first-child){display:none}.cb main{padding:16px 12px 32px!important}}",
  "[role=tablist]{scrollbar-width:none}",
  "@media (max-width: 600px){.cb [role=tablist]{flex-wrap:nowrap!important;overflow-x:auto;margin-right:-12px}.cb [role=tablist] button{flex:0 0 auto}}",
].join("\n");
if (typeof document !== "undefined" && !document.getElementById("cb-theme-css")) {
  const el = document.createElement("style");
  el.id = "cb-theme-css";
  el.textContent = THEME_CSS;
  document.head.appendChild(el);
}
function readStoredTheme() {
  try { return window.localStorage.getItem("cgb_theme") === "light" ? "light" : "dark"; } catch (e) { return "dark"; }
}
function useTheme() {
  const [theme, setTheme] = useState(readStoredTheme);
  useEffect(() => {
    document.documentElement.className = theme === "light" ? "cb light" : "cb";
    document.body.style.margin = "0";
    document.body.style.background = "var(--bg)";
    try { window.localStorage.setItem("cgb_theme", theme); } catch (e) { /* storage unavailable */ }
  }, [theme]);
  return [theme, () => setTheme(t => t === "light" ? "dark" : "light")];
}
const MONO = "'JetBrains Mono', Consolas, 'Courier New', monospace";
const HEAD_FONT = "'Space Grotesk', Inter, system-ui, sans-serif";
const MODEL_VERSION = "v2.10.0";
const MODEL_BUILD_DATE = "2026-11-24";

// ============================================================
// CONSTANTS
// ============================================================
const VOC_ELV    = 20;      // mg/m3  TVOC ELV permit EPR/A2/1
const PAH_ELV    = 1000;    // ug/m3  total PAH ELV permit EPR/A2/1
const PAH_ELV_PERMIT_LABEL = "1,000 ug/Nm3 (1 mg/Nm3 per Permit EPR/A2/1, Schedule 4, Table 4.1)";
const PAH_ELV_SHORT_LABEL = "1,000 ug/Nm3 (1 mg/Nm3 permit)";
const BED_MASS   = 6000;    // kg GAC
const FLOW_M3HR  = 9000;    // m3/hr nominal extraction flow
const GAC_BULK_DENSITY_KGM3 = 450;
const DEFAULT_CROSS_SECTION_M2 = 1.5;
const NAPHTHALENE_MW = 128.17;
const SAME_BED_VOC_LIMIT_HRS = 1155;
const LAT        = 52.9833;
const LON        = -0.0167;   // Boston, Lincolnshire is west of Greenwich (v2.8.1 sign fix)
const P1_AVG_HRS = 5.85;    // hrs/charge  Plant 1 (blended average, all product types)
const P2_AVG_HRS = 7.84;    // hrs/charge  Plant 2 (blended average, all product types)
// Updated 2026-06-18: Testo 925 spot reading validated +10.3 deg C delta.
// Pre-bed inlet 22.7 deg C, external ambient 12.4 deg C.
// Replaces the inferred +8 deg C interim value used before site measurement.
const FALLBACK_AMBIENT_TO_INLET_OFFSET_C = 10.3;
const PLANT_STATES = ["Not running","Raising/holding air pressure","Filling","Pressing","Emptying","Raising vacuum","Holding vacuum"];
const EMPTY_THERMAL_LOG_ENTRY = {
  id: "",
  timestamp: "",
  ambientTemp: "",
  preBedTemp: "",
  postBedTemp: "",
  plant1State: "",
  plant2State: "",
  notes: "",
};

function dropletFalloutShortLabel(value) {
  if (value === true) return "Pass";
  if (value === false) return "Fail";
  return "Not Recorded";
}

function dropletFalloutLongLabel(value) {
  if (value === true) return "Free from liquid droplet fallout confirmed";
  if (value === false) return "Droplet fallout observed";
  return "Not Recorded";
}

function dropletFalloutColor(value) {
  if (value === true) return C.teal;
  if (value === false) return C.red;
  return C.muted;
}

const FAN_SPECIFICATION = {
  manufacturer: "Halifax Fan Ltd",
  model: "Centrifugal Fan 24 BFBI 2",
  yearOfManufacture: 2025,
  nameplateRPM: 1500,
  nameplateFlow_m3hr: 9288,
  nameplateFlow_m3s: 2.58,
  nameplatePressure_Pa: 1143,
  overallEfficiency_pct: 66.1,
  targetEfficiency_pct: 49.0,
  efficiencyGrade_NG: 68,
  installationCategory: "D",
  motor_kW: 18.5,
  motorPoles: 4,
  motorFullLoadRPM: 1465,
  motorClass: "IE3",
  flowMeasurementPoint: "Stack discharge - post-demister, post-carbon bed (Envirocare MCERTS)",
  operatingNote: "Fan installed above nameplate speed via 360/220 mm pulley arrangement (~2,397 rpm). Actual operating flow determined by system resistance curve intersection. Envirocare stack discharge measurements 7,000-12,000 m3/hr are consistent with this configuration. Stack discharge flow used as conservative proxy for carbon bed inlet flow (true bed inlet flow marginally higher due to upstream temperature and pressure conditions)."
};

const FAN_CONFIG_LOG = [
  {
    from: "2024-11-13",
    to: "2026-01-29",
    motorPulley_mm: 360,
    fanPulley_mm: 220,
    motorRPM: 1465,
    fanRPM: 2397,
    theoreticalFreeFlow_m3hr: 14840,
    typicalStackDischargeFlow_m3hr: 9000,
    stackDischargeFlowNote: "Envirocare-measured 7,000-12,000 m3/hr across P1-P7 at this configuration. Variation reflects carbon bed resistance change across bed life. 9,000 m3/hr used as representative mid-life value.",
    label: "Config A (Standard)"
  },
  {
    from: "2026-01-30",
    to: "2026-02-23",
    motorPulley_mm: 100,
    fanPulley_mm: 125,
    motorRPM: 1465,
    fanRPM: 1172,
    theoreticalFreeFlow_m3hr: 7266,
    typicalStackDischargeFlow_m3hr: 6000,
    stackDischargeFlowNote: "Estimated ~5,500-6,500 m3/hr by fan law ratio from Config A measurements. No Envirocare measurement taken during this window. 6,000 m3/hr used as central estimate.",
    label: "Config B (Reduced speed - temporary)"
  },
  {
    from: "2026-02-24",
    to: null,
    motorPulley_mm: 360,
    fanPulley_mm: 220,
    motorRPM: 1465,
    fanRPM: 2397,
    theoreticalFreeFlow_m3hr: 14840,
    typicalStackDischargeFlow_m3hr: 9000,
    stackDischargeFlowNote: "Restored to Config A. Envirocare-measured flows expected in 7,000-12,000 m3/hr range consistent with prior Config A periods.",
    label: "Config A (Standard restored)"
  }
];

function getFanConfigAtDate(dateStr) {
  var d = new Date(dateStr);
  for (var i = FAN_CONFIG_LOG.length - 1; i >= 0; i--) {
    var cfg = FAN_CONFIG_LOG[i];
    var from = new Date(cfg.from);
    var to = cfg.to ? new Date(cfg.to) : new Date("2099-12-31");
    if (d >= from && d <= to) return cfg;
  }
  return FAN_CONFIG_LOG[0];
}

function effectiveFlowForPeriod(stackTestRecord, fallbackFlow) {
  if (stackTestRecord && stackTestRecord.flowRate_m3hr != null &&
      Number.isFinite(stackTestRecord.flowRate_m3hr)) {
    return stackTestRecord.flowRate_m3hr;
  }
  return fallbackFlow;
}

function calcEffectiveHours(activeHrs, periodStart, periodEnd, stackTestRecord) {
  // Weights active hours by volumetric flow ratio relative to Config A.
  // Lower flow = lower mass flux to adsorbent per hour = lower effective loading.
  // Uses typicalStackDischargeFlow_m3hr as the flow proxy.
  // Config A reference flow = 9,000 m3/hr (representative mid-life).
  // Returns activeHrs unchanged if periodStart/periodEnd not provided.
  var REFERENCE_FLOW = 9000;

  if (!periodStart || !periodEnd) return activeHrs;

  var start = new Date(periodStart);
  var end = new Date(periodEnd);
  var totalMs = end - start;
  if (totalMs <= 0) return activeHrs;

  var weightedMs = 0;
  var coveredMs = 0;
  FAN_CONFIG_LOG.forEach(function(cfg) {
    var cfgFrom = new Date(cfg.from);
    var cfgTo = cfg.to ? new Date(cfg.to) : new Date("2099-12-31");
    var overlapStart = cfgFrom > start ? cfgFrom : start;
    var overlapEnd = cfgTo < end ? cfgTo : end;
    if (overlapEnd > overlapStart) {
      var overlapMs = overlapEnd - overlapStart;
      coveredMs += overlapMs;
      var effectiveFlow = effectiveFlowForPeriod(stackTestRecord, cfg.typicalStackDischargeFlow_m3hr);
      var flowRatio = effectiveFlow / REFERENCE_FLOW;
      weightedMs += overlapMs * flowRatio;
    }
  });

  // v2.1.0: time before the first logged fan configuration (periods starting before
  // 13 Nov 2024) counts at the reference flow. It was previously counted as zero flow,
  // which roughly halved P1-P3 hours.
  weightedMs += Math.max(0, totalMs - coveredMs) * 1.0;
  var correctionFactor = totalMs > 0 ? weightedMs / totalMs : 1.0;
  return activeHrs * correctionFactor;
}

function filterFlowCalculationRecords(records) {
  return records.filter(function(record) {
    return record.excludeFromFlowCalcs !== true;
  });
}

function effectiveHoursForStackRecord(record) {
  var weighted = calcEffectiveHours(record.activeHrs, record.periodStart, record.periodEnd, record);
  if (record && record.flowRate_m3hr != null && Number.isFinite(record.flowRate_m3hr) &&
      (record.flowRate_m3hr < 7000 || record.flowRate_m3hr > 12000)) {
    return Math.max(0, record.activeHrs * (record.flowRate_m3hr / 9000));
  }
  return weighted;
}

// VOC model defaults - Ridge L2, all 8 periods, ln(rawHrs) + ambientTemp
// Calibrated at nf=0.53. WJ fraction effect applied only to safeWindowHours output
// (not to predictVOC input) so coefficients remain consistent with calibration data.
// v1.9.0 refit on 11 independent periods (P4-P14): R2=0.771, LOO CV R2=0.463.
// Fallback values only - live coefficients are recalculated by calibrateVOC().
const D_VOC_A =  1.699;    // ln(rawActiveHrs) coefficient
const D_VOC_B =  0.109;    // avgTemp (ambient) coefficient
const D_VOC_C = -9.917;    // intercept
const VOC_RMSE_LOG = 1.079; // RMSE in log space -> x1.85 uncertainty band

// PAH model defaults - bivariate: stackTemp (dominant) + ln(activeHrs)
// v1.9.0 refit on fresh-carbon periods P4-P14 (n=11): R2=0.429, hours coeff positive.
// The previous 4-point fit (R2=0.9994) was over-fitted; 2026 data shows wider scatter.
// ln(PAH) = D_PAH_A*stackTemp + D_PAH_B*ln(activeHrs) + D_PAH_C
// ELV breach governed primarily by temperature; hours provide a real secondary ageing signal.
const D_PAH_A =  0.171;    // stackTemp coefficient (dominant driver)
const D_PAH_B =  0.705;    // ln(activeHrs) coefficient (positive = conservative with age)
const D_PAH_C = -2.538;    // intercept
const PAH_RMSE_LOG = 1.260; // RMSE from fresh-carbon bivariate fit
// Stack temp linear regression: stackTemp = STACK_TEMP_A + STACK_TEMP_B * avgTemp
// Derived from MCERTS data: P1, P3, P4, P5, P6, P7, P8.
// P2 excluded: flowAnomalous === true. Anomalous low-flow condition
// produced unrepresentative 14 degC stack-to-ambient delta vs ~7.4 degC
// representative average. Including P2 biases the intercept upward.
// Do not include P2 or any record where flowAnomalous === true
// in this regression under any circumstances.
const STACK_TEMP_A = 13.506;
const STACK_TEMP_B =  0.685;

// ============================================================
// SEED DATA P1-P14
// ============================================================
// v1.9.0 (2026-11-20): P8 updated to certified JOB-2865 (VOC 105, PAH 295,
// stack 24.8C). P9-P14 added from Cura Terrae/Envirocare reports JOB-2963,
// JOB-3036, JOB-3082, JOB-3083 (R1/R2) and JOB-3146.
// Changeouts: Bed 6 on 2026-06-05; Bed 7 on 2026-08-25 (inferred from the
// JOB-3083 R1->R2 step change); Bed 8 on 2026-11-05.
// P9-P14 activeHrs are ESTIMATED as bed days x 21.7 hrs/day (rate measured
// over P8: 1,494.9 hrs / 69 days) pending charge-log reconciliation.
// avgTemp/avgRH are Open-Meteo archive daily means, Boston (52.98N, 0.02W),
// from changeout to test date. measuredFlow_m3hr is informational only and
// is deliberately not fed to calcEffectiveHours, keeping P8-P14 on the same
// effective-hours basis as P1-P7.
// creoT: creosote used (tonnes) between periodStart and the test date, from the Creosote Tank
// and Flash Point Log Daily Log (read 23 Nov 2026), as a net stock balance on the cleaned log
// (src/creoUsage.js: copied, repeated and incomplete readings rebuilt from the real readings
// either side, spread across the gap by the Plant 1 / Plant 2 charges run each day). creoTOriginal is the v2.1-v2.4 positive-only sum, kept for reference: it was
// inflated by copied readings (a delivery on a copied day counted as usage). workingDays is
// unchanged. Used by the creosote-throughput trial model.
const INITIAL_STACK_DATA = [
  { period:"P1", creoT:546.9, creoTOriginal:757.8, workingDays:89, date:"2025-01-16", periodStart:"2024-09-01", periodEnd:"2025-01-16", activeHrs:320,  avgTemp:8.0,  stackTemp:18.0, avgRH:82, voc:10.6, pah:524.9,  charges:55,  p1Charges:32, p2Charges:23,  sameCarbon:true,  dropletFalloutObserved:null },
  { period:"P2", creoT:916.5, creoTOriginal:1150.7, workingDays:128, date:"2025-03-12", periodStart:"2024-09-01", periodEnd:"2025-03-12", activeHrs:780,  avgTemp:12.0, stackTemp:22.0, avgRH:78, voc:45.0, pah:865.0,  charges:133, p1Charges:78, p2Charges:55,  sameCarbon:true, dropletFalloutObserved:null,
    flowAnomalous:true,
    excludeFromFlowCalcs:true,
    anomalyNote:"Stack discharge flow 3,659 m3/hr vs 7,000-12,000 m3/hr all other Config A periods. Config A pulleys confirmed installed at time of test. Envirocare certified measurement stands - raw traverse data not available for review. No operational cause identified. Anomaly formally unresolvable. Excluded from Wheeler-Jonas EBCT, mass flux calculations, and T_operative correction derivation. Retained in VOC and PAH regression with this flag. See Stack Tests tab." },
  { period:"P3", creoT:1455.2, creoTOriginal:1734.0, workingDays:177, date:"2025-05-20", periodStart:"2024-09-01", periodEnd:"2025-05-20", activeHrs:1100, avgTemp:16.0, stackTemp:26.0, avgRH:74, voc:55.6, pah:2475.0, charges:188, p1Charges:110, p2Charges:78, sameCarbon:true,  dropletFalloutObserved:null },
  { period:"P4", creoT:401.7, creoTOriginal:409.8, workingDays:32, date:"2025-07-15", periodStart:"2025-06-01", periodEnd:"2025-07-15", activeHrs:380,  avgTemp:22.5, stackTemp:27.7, avgRH:70, voc:18.2, pah:5369.0, charges:65,  p1Charges:38, p2Charges:27,  sameCarbon:false, dropletFalloutObserved:null },
  { period:"P5", creoT:691.2, creoTOriginal:765.4, workingDays:69, date:"2025-11-06", periodStart:"2025-08-01", periodEnd:"2025-11-06", activeHrs:420,  avgTemp:9.5,  stackTemp:19.5, avgRH:80, voc:8.4,  pah:586.0,  charges:72,  p1Charges:42, p2Charges:30,  sameCarbon:false, dropletFalloutObserved:null },
  { period:"P6", creoT:1016.3, creoTOriginal:1111.7, workingDays:99, date:"2025-12-18", periodStart:"2025-08-01", periodEnd:"2025-12-18", activeHrs:890,  avgTemp:10.2, stackTemp:20.0, avgRH:83, voc:28.0, pah:712.0,  charges:152, p1Charges:89, p2Charges:63,  sameCarbon:false, dropletFalloutObserved:null },
  { period:"P7", creoT:559.6, creoTOriginal:606.3, workingDays:44, date:"2026-03-14", periodStart:"2026-01-12", periodEnd:"2026-03-14", activeHrs:1387, avgTemp:6.1,  stackTemp:17.5, avgRH:85, voc:5.9,  pah:340.0,  charges:237, p1Charges:138, p2Charges:99, sameCarbon:false, dropletFalloutObserved:null },
  { period:"P8", creoT:936.6, creoTOriginal:1050.5, workingDays:56, report:"JOB-2865", date:"2026-06-02", periodStart:"2026-03-20", periodEnd:"2026-06-02", bedId:"Bed 5", activeHrs:1495, avgTemp:11.6, stackTemp:24.8, avgRH:78, voc:105, pah:295, charges:241, p1Charges:141, p2Charges:100, measuredFlow_m3hr:9884, sameCarbon:false, dropletFalloutObserved:null },
  { period:"P9", creoT:457.4, creoTOriginal:613.5, workingDays:28, report:"JOB-2963", date:"2026-07-14", periodStart:"2026-06-05", periodEnd:"2026-07-14", bedId:"Bed 6", bedDay:39, activeHrs:846, activeHrsEstimated:true, avgTemp:19.0, stackTemp:25.3, avgRH:69, voc:44.6, pah:144, charges:null, p1Charges:null, p2Charges:null, measuredFlow_m3hr:3589, sameCarbon:false, dropletFalloutObserved:null,
    flowAnomalous:true,
    excludeFromFlowCalcs:true,
    anomalyNote:"Stack discharge flow 3,589 m3/hr on test day vs ~9,000-10,000 m3/hr at P8 and P10-P14. Same pattern as P2. Cause not identified; queried with Cura Terrae. Excluded from flow-dependent calculations. Retained in VOC and PAH regression with this flag." },
  { period:"P10", creoT:608.4, creoTOriginal:764.6, workingDays:39, report:"JOB-3036", date:"2026-07-29", periodStart:"2026-06-05", periodEnd:"2026-07-29", bedId:"Bed 6", bedDay:54, activeHrs:1172, activeHrsEstimated:true, avgTemp:18.9, stackTemp:33.0, avgRH:68, voc:138, pah:2116, charges:null, p1Charges:null, p2Charges:null, measuredFlow_m3hr:9464, sameCarbon:false, dropletFalloutObserved:null },
  { period:"P11", creoT:803.2, creoTOriginal:959.3, workingDays:50, report:"JOB-3082", date:"2026-08-13", periodStart:"2026-06-05", periodEnd:"2026-08-13", bedId:"Bed 6", bedDay:69, activeHrs:1497, activeHrsEstimated:true, avgTemp:19.2, stackTemp:31.0, avgRH:66, voc:166, pah:7950, charges:null, p1Charges:null, p2Charges:null, measuredFlow_m3hr:10033, sameCarbon:false, dropletFalloutObserved:null },
  { period:"P12", creoT:926.7, creoTOriginal:1082.8, workingDays:58, report:"JOB-3083 R1", date:"2026-08-25", periodStart:"2026-06-05", periodEnd:"2026-08-25", bedId:"Bed 6", bedDay:81, activeHrs:1758, activeHrsEstimated:true, avgTemp:18.9, stackTemp:25.5, avgRH:67, voc:109, pah:1300, charges:null, p1Charges:null, p2Charges:null, measuredFlow_m3hr:8990, sameCarbon:false, dropletFalloutObserved:null },
  { period:"P13", creoT:15.3, creoTOriginal:15.3, workingDays:1, report:"JOB-3083 R2", date:"2026-08-26", periodStart:"2026-08-25", periodEnd:"2026-08-26", bedId:"Bed 7", bedDay:1, activeHrs:22, activeHrsEstimated:true, avgTemp:19.6, stackTemp:28.8, avgRH:74, voc:0.093, pah:53.5, charges:null, p1Charges:null, p2Charges:null, measuredFlow_m3hr:8990, sameCarbon:false, dropletFalloutObserved:null },
  { period:"P14", creoT:289.4, creoTOriginal:289.4, workingDays:21, report:"JOB-3146", date:"2026-09-24", periodStart:"2026-08-25", periodEnd:"2026-09-24", bedId:"Bed 7", bedDay:30, activeHrs:651, activeHrsEstimated:true, avgTemp:17.2, stackTemp:21.0, avgRH:75, voc:1.0, pah:33.8, charges:null, p1Charges:null, p2Charges:null, measuredFlow_m3hr:9606, sameCarbon:false, dropletFalloutObserved:null },
];
const INITIAL_CHARGES = [];

// ============================================================
// PHYSICS ENGINE
// ============================================================

function humidityFactor(rhPct) {
  // Audit note: humidityFactor() is an uncalibrated multiplicative heuristic layered
  // onto a regression that may already contain correlated humidity effects through
  // ambient temperature and seasonal co-variation in the P1-P8 dataset. Do not
  // re-tune this term until n >= 8 independent periods are available for a
  // dedicated multivariate sensitivity check.
  if (rhPct <= 50) return 1.0;
  if (rhPct >= 95) return 0.35;
  const x = (rhPct - 50) / 45.0;
  return 1.0 - 0.65 * (x * x);
}

// DR/Polanyi adsorption capacity estimate for naphthalene on GAC.
// W = W0 * exp( -( A / E )^2 )
// where A = RT * ln(Ps/P) is the adsorption potential (J/mol)
//       E = characteristic adsorption energy for naphthalene on GAC (~20,000 J/mol)
//       W0 = limiting adsorption volume (0.45 mL/g, typical for coal-based GAC)
//       Ps = saturation vapour pressure of naphthalene (Pa), Antoine approximation
//       P  = partial pressure of naphthalene in gas phase (Pa), derived from inlet
//            concentration at the stack gas conditions
// Note: This is a THEORETICAL REFERENCE estimate. It is not integrated into the
// VOC regression pathway. The VOC regression safe-window calculation is the
// primary compliance scheduling tool. This value is displayed for engineering
// reference only.
function drPolanyi(tempC, inletConc_mgm3, carbonBatch) {
  var R = 8.314;
  var T_K = tempC + 273.15;
  var W0 = carbonBatch && carbonBatch.iodineMgG != null
    ? 0.45 * (carbonBatch.iodineMgG / 1000)
    : 0.45;
  var E = 20000;
  // v2.8.1 audit: naphthalene saturation vapour pressure (Pa), ln(P/Pa) = A - B/T(K).
  // Solid below the 80.3 C melting point (Ruzicka 2005: 10.9 Pa at 25 C), liquid above
  // (anchored at 25 C sub-cooled and the 218 C boiling point). Same curves as Trial Mode.
  // The previous Antoine form gave ~0.01 Pa at 25 C (about 1,000x low), so A ~ 0 and the
  // capacity always came out at W0 regardless of temperature or concentration.
  var Ps_Pa = tempC < 80.3 ? Math.exp(31.676 - 8732 / T_K) : Math.exp(23.798 - 6027 / T_K);
  // Partial pressure from inlet concentration: P = C R T / MW, C in kg/m3, MW 0.12817 kg/mol
  var C_kgm3 = Math.max(inletConc_mgm3 || 0.1, 0.001) / 1000000;
  var P_Pa = Math.max((C_kgm3 * R * T_K) / (0.12817), 0.001);
  var Ps_safe = Math.max(Ps_Pa, P_Pa + 0.001);
  var A = R * T_K * Math.log(Ps_safe / P_Pa);
  var ratio = A / E;
  // W is a micropore volume (cm3/g); x 0.98 g/cm3 adsorbate density gives kg/kg.
  var W = W0 * Math.exp(-(ratio * ratio)) * 0.98;
  return Math.max(0, W);
}

function wheelerJonasBedLife(opTemp, inletConc_mgm3, settings, carbonBatch) {
  const crossSectionM2 = Math.max(0.2, settings.crossSectionM2 || DEFAULT_CROSS_SECTION_M2);
  const flowM3hr = Math.max(1, settings.flowM3hr || FLOW_M3HR);
  const bedMassKg = Math.max(1, settings.bedMass || BED_MASS);
  const bulkDensity = carbonBatch && carbonBatch.densityKgM3 != null
    ? carbonBatch.densityKgM3 : GAC_BULK_DENSITY_KGM3;
  const bedDepthM = bedMassKg / (bulkDensity * crossSectionM2);
  const flowM3s = flowM3hr / 3600;
  const inletKgM3 = Math.max(inletConc_mgm3 || 0.1, 0.1) / 1000000;
  const capacityKgKg = Math.max(0.0001, drPolanyi(opTemp, inletConc_mgm3, carbonBatch));
  const serviceSeconds = (bedMassKg * capacityKgKg) / Math.max(flowM3s * inletKgM3, 1e-12);
  // v2.8.1 audit: the previous MTZ term (density x depth / (velocity x MW)) was not
  // dimensionally valid. Use bed utilisation 1 - MTZ/(2 x depth) with a 0.3 m MTZ,
  // the same assumption as Trial Mode.
  const utilisation = Math.max(0.25, 1 - 0.3 / (2 * Math.max(bedDepthM, 0.1)));
  return Math.max(0, Math.round(serviceSeconds * utilisation / 3600));
}

function ambientThresholdForPAHAtHours(activeHrs, pahC) {
  return (pahFailTemp(activeHrs, pahC) - STACK_TEMP_A) / STACK_TEMP_B;
}

// Estimate stack temperature from ambient using linear regression on P1-P8 MCERTS data.
// stackTemp = 0.685*ambientTemp + 13.506  (R2=0.92, errors under 1.6C across all periods)
// More accurate than fixed +10 offset, especially at temperature extremes.
function estimateStackTemp(ambientTemp) {
  return STACK_TEMP_B * ambientTemp + STACK_TEMP_A;
}

function operativeTemp(ambientTemp, correctionFactor) {
  const correction = Number.isFinite(correctionFactor) ? correctionFactor : 0;
  return (ambientTemp || 0) + correction;
}

function operativeTempNote(ambientTemp, correctionFactor) {
  const correction = Number.isFinite(correctionFactor) ? correctionFactor : 0;
  const opTemp = operativeTemp(ambientTemp, correction);
  return `Calculated at T_operative = ${opTemp.toFixed(1)}C (ambient ${ambientTemp.toFixed(1)}C + ${correction.toFixed(1)}C correction)`;
}

// Ridge L2 bivariate regression: ln(y) = a*x1 + b*x2 + c
function ridgeRegression(x1arr, x2arr, yarr, lam) {
  const lm = lam != null ? lam : 0.1;
  const n = x1arr.length;
  if (n < 3) return null;
  const xs = x1arr, ts = x2arr;
  const ys = yarr.map(v => Math.log(Math.max(v, 0.01)));
  const mx = xs.reduce((a,v)=>a+v,0)/n, mt = ts.reduce((a,v)=>a+v,0)/n, my = ys.reduce((a,v)=>a+v,0)/n;
  let sxx=0,stt=0,sxy=0,sty=0,sxt=0;
  for(let i=0;i<n;i++){const dx=xs[i]-mx,dt=ts[i]-mt,dy=ys[i]-my;sxx+=dx*dx;stt+=dt*dt;sxy+=dx*dy;sty+=dt*dy;sxt+=dx*dt;}
  const det=(sxx+lm)*(stt+lm)-sxt*sxt;
  if(Math.abs(det)<1e-12) return null;
  const a=(sxy*(stt+lm)-sty*sxt)/det, b=(sty*(sxx+lm)-sxy*sxt)/det, c=my-a*mx-b*mt;
  let ss_res=0,ss_tot=0;
  ys.forEach((y,i)=>{const yhat=a*xs[i]+b*ts[i]+c;ss_res+=(y-yhat)*(y-yhat);ss_tot+=(y-my)*(y-my);});
  return {a, b, c, r2: Math.max(0, 1 - ss_res/Math.max(ss_tot,1e-9))};
}

function looCV(x1arr, x2arr, yarr, lam) {
  const n = yarr.length;
  if (n < 4) return null;
  const actuals = yarr.map(v=>Math.max(v, 0.01));
  const meanActual = actuals.reduce((a,v)=>a+v,0) / n;
  let ssRes = 0;
  let ssTot = 0;
  let folds = 0;

  for (let i = 0; i < n; i++) {
    const x1Loo = [];
    const x2Loo = [];
    const yLoo = [];
    for (let j = 0; j < n; j++) {
      if (j !== i) {
        x1Loo.push(x1arr[j]);
        x2Loo.push(x2arr[j]);
        yLoo.push(yarr[j]);
      }
    }
    const looFit = ridgeRegression(x1Loo, x2Loo, yLoo, lam);
    if (!looFit) continue;
    const yHat = Math.exp(looFit.a * x1arr[i] + looFit.b * x2arr[i] + looFit.c);
    const err = actuals[i] - yHat;
    ssRes += err * err;
    folds += 1;
  }

  actuals.forEach(v=>{ const diff = v - meanActual; ssTot += diff * diff; });
  if (folds < 1 || ssTot <= 1e-9) return null;
  return { r2_loo: 1 - ssRes / ssTot, n_folds: folds };
}

// Bayesian sequential update for a single scalar coefficient.
// Prior: N(mu0, sigma0^2). Likelihood: normal with known noise sigma_n.
// Returns posterior mean and variance. Used as an informational intercept
// refinement only; Ridge and LOO CV remain the operative reliability metrics.
// This lightweight layer is intentionally scalar and closed form.
// It avoids sampling, avoids extra dependencies, and keeps each update auditable.
// Residuals are logged in ln-space so the mechanism matches the regression model.
// The posterior mean is not fed back into compliance scheduling limits.
function bayesianUpdateNormal(mu0, sigma0Sq, observations, predictions, sigmaNSq) {
  var postVar = sigma0Sq;
  var postMean = mu0;
  for (var i = 0; i < observations.length; i++) {
    var residual = observations[i] - predictions[i];
    var denom = postVar + sigmaNSq;
    postMean = postMean + (postVar / denom) * residual;
    postVar = (postVar * sigmaNSq) / denom;
  }
  return { mean: postMean, variance: postVar, stdDev: Math.sqrt(postVar) };
}

// VOC calibration: ln(VOC) = a*ln(rawHrs) + b*ambientTemp + c + humidityPenalty.
// Uses independent carbon charge periods only. P1-P3 are same-carbon cumulative
// observations and are shown for transparency, not fitted as independent points.
function calibrateVOC(stackData) {
  const v = stackData.filter(d => d.voc != null && d.activeHrs > 0 && d.sameCarbon !== true);
  if (v.length < 3) return { a: D_VOC_A, b: D_VOC_B, c: D_VOC_C, r2: null, r2_loo: null, n_folds: 0, rmse: VOC_RMSE_LOG, n: v.length, bayesC: null, bayesianActive: false, bayesianStatus: "Inactive - n < 4" };
  const effectiveHours = v.map(d=>effectiveHoursForStackRecord(d));
  // v2.1.0: the humidity term added in predictVOC is removed from the targets before fitting,
  // so calibration and prediction use the same model (previously added at prediction only).
  const vocHumidityAdjusted = v.map(d=>d.voc / Math.exp((1 - humidityFactor(d.avgRH)) * 0.6));
  const fit = ridgeRegression(effectiveHours.map(h=>Math.log(h)), v.map(d=>d.avgTemp), vocHumidityAdjusted, 0.1);
  if (!fit) return { a: D_VOC_A, b: D_VOC_B, c: D_VOC_C, r2: null, r2_loo: null, n_folds: 0, rmse: VOC_RMSE_LOG, n: v.length, bayesC: null, bayesianActive: false };
  const resids = v.map(d => {
    const hf = humidityFactor(d.avgRH), hp = (1-hf)*0.6;
    const effectiveHrs = effectiveHoursForStackRecord(d);
    return (fit.a*Math.log(effectiveHrs) + fit.b*d.avgTemp + fit.c + hp) - Math.log(d.voc);
  });
  const rmse = Math.sqrt(resids.reduce((a,e)=>a+e*e,0)/resids.length);
  const looResult = looCV(effectiveHours.map(h=>Math.log(Math.max(h, 1))), v.map(d=>d.avgTemp), vocHumidityAdjusted, 0.1);
  // Bayesian sequential update on intercept c (most uncertain coefficient).
  // Prior: N(fit.c, (rmse * 1.5)^2). Noise sigma: rmse.
  const priorSigmaSq = (rmse * 1.5) * (rmse * 1.5);
  const noiseSigmaSq = rmse * rmse;
  const lnObserved = v.map(function(d) { return Math.log(d.voc); });
  const lnPredicted = v.map(function(d) {
    const hp = (1 - humidityFactor(d.avgRH)) * 0.6;
    const effectiveHrs = effectiveHoursForStackRecord(d);
    return fit.a * Math.log(effectiveHrs) + fit.b * d.avgTemp + fit.c + hp;
  });
  const bayesC = bayesianUpdateNormal(fit.c, priorSigmaSq, lnObserved, lnPredicted, noiseSigmaSq);
  const bayesianActive = v.length >= 4;
  return { a: fit.a, b: fit.b, c: fit.c, r2: fit.r2, r2_loo: looResult ? looResult.r2_loo : null, n_folds: looResult ? looResult.n_folds : 0, rmse, n: v.length, bayesC, bayesianActive, bayesianStatus: bayesianActive ? "Active - informational only" : "Inactive - n < 4" };
}

// PAH calibration uses independent fresh-carbon periods only
// (sameCarbon === false), consistent with VOC calibration.
// P2 is excluded: it is a same-carbon cumulative observation
// (780 active hours on the carbon charge beginning at P1) and
// does not meet the independent-period criterion regardless of
// whether its certified PAH result is valid.
// The valid P2 PAH result (865 ug/m3, ES-2093) is retained in
// the regression display table for transparency but excluded from
// the fresh-carbon calibration population.
// Any future decision to formally re-include P2 in PAH calibration
// must be documented and agreed with the Environment Agency.
function calibratePAH(stackData) {
  const fresh = stackData.filter(d => d.pah != null && d.sameCarbon === false &&
    d.stackTemp != null && d.activeHrs > 0);
  const all   = stackData.filter(d => d.pah != null && d.stackTemp != null && d.activeHrs > 0);
  const v = fresh.length >= 3 ? fresh : all;
  if (v.length < 3) {
    return { a: D_PAH_A, b: D_PAH_B, c: D_PAH_C, r2: null, rmse: PAH_RMSE_LOG, n: v.length, freshOnly: fresh.length >= 3, bayesC: null, bayesianActive: false, bayesianStatus: "Inactive - n < 4" };
  }
  // x1 = stackTemp (dominant), x2 = ln(activeHrs)
  const fit = ridgeRegression(v.map(d=>d.stackTemp), v.map(d=>Math.log(effectiveHoursForStackRecord(d))), v.map(d=>d.pah), 0.1);
  if (!fit || fit.b < 0) {
    // Bivariate gave negative hours term - fall back to temperature-only univariate
    const xs=v.map(d=>d.stackTemp), ys=v.map(d=>Math.log(d.pah));
    const n=xs.length, mx=xs.reduce((a,x)=>a+x,0)/n, my=ys.reduce((a,y)=>a+y,0)/n;
    let stt=0,sty=0;
    xs.forEach((t,i)=>{stt+=(t-mx)*(t-mx);sty+=(t-mx)*(ys[i]-my);});
    const b=sty/stt, c=my-b*mx;
    let ssr=0,sst=0;
    ys.forEach((y,i)=>{ssr+=(b*xs[i]+c-y)*(b*xs[i]+c-y);sst+=(y-my)*(y-my);});
    const rmse=Math.sqrt(ssr/n);
    return { a:b, b:0, c, r2:Math.max(0,1-ssr/Math.max(sst,1e-9)), rmse, n:v.length, freshOnly: fresh.length>=3, tempOnly:true, bayesC: null, bayesianActive: false, bayesianStatus: "Inactive - n < 4" };
  }
  const ssr=v.reduce((s,d,i)=>{
    const yhat=fit.a*d.stackTemp+fit.b*Math.log(effectiveHoursForStackRecord(d))+fit.c;
    return s+(yhat-Math.log(d.pah))*(yhat-Math.log(d.pah));
  },0);
  const rmse=Math.sqrt(ssr/v.length);
  // Bayesian sequential update on PAH intercept c.
  const pahPriorSigmaSq = (rmse * 1.5) * (rmse * 1.5);
  const pahNoiseSigmaSq = rmse * rmse;
  const pahLnObs = v.map(function(d) { return Math.log(d.pah); });
  const pahLnPred = v.map(function(d) {
    return fit.a * d.stackTemp + fit.b * Math.log(effectiveHoursForStackRecord(d)) + fit.c;
  });
  const pahBayesC = bayesianUpdateNormal(fit.c, pahPriorSigmaSq, pahLnObs, pahLnPred, pahNoiseSigmaSq);
  const pahBayesianActive = v.length >= 4;
  return { a: fit.a, b: fit.b, c: fit.c, r2: fit.r2, rmse, n: v.length, freshOnly: fresh.length>=3, bayesC: pahBayesC, bayesianActive: pahBayesianActive, bayesianStatus: pahBayesianActive ? "Active - informational only" : "Inactive - n < 4" };
}

// ============================================================
// v2.1.0 TRIAL MODEL - creosote throughput
// ln(VOC) = a*ln(creosote tonnes since changeout) + b*stackTemp + c
// ln(PAH) = a*stackTemp + b*ln(creosote tonnes) + c
// Runs alongside the operative run-hours model; it does not drive scheduling.
// Tonnes are the net stock balance on the cleaned Creosote Tank and Flash Point Log Daily Log,
// measured the same way for every period (the run-hours basis changed in 2026).
// Uncertainty uses the leave-one-out RMSE in log space (prediction error on unseen tests).
// ============================================================
function looLogRMSE(x1arr, x2arr, yarr, lam) {
  const n = yarr.length;
  if (n < 4) return null;
  let ss = 0, k = 0;
  for (let i = 0; i < n; i++) {
    const a1 = [], a2 = [], ay = [];
    for (let j = 0; j < n; j++) if (j !== i) { a1.push(x1arr[j]); a2.push(x2arr[j]); ay.push(yarr[j]); }
    const f = ridgeRegression(a1, a2, ay, lam);
    if (!f) continue;
    const e = (f.a * x1arr[i] + f.b * x2arr[i] + f.c) - Math.log(Math.max(yarr[i], 0.01));
    ss += e * e; k += 1;
  }
  return k ? Math.sqrt(ss / k) : null;
}
function calibrateCreoModel(stackData) {
  const v = (stackData || []).filter(d => d.sameCarbon !== true && d.creoT > 0 && d.stackTemp != null);
  const vv = v.filter(d => d.voc != null && d.voc > 0);
  const pp = v.filter(d => d.pah != null && d.pah > 0);
  if (vv.length < 4 || pp.length < 4) return { ready:false, n:vv.length };
  const voc = ridgeRegression(vv.map(d=>Math.log(d.creoT)), vv.map(d=>d.stackTemp), vv.map(d=>d.voc), 0.1);
  const pah = ridgeRegression(pp.map(d=>d.stackTemp), pp.map(d=>Math.log(d.creoT)), pp.map(d=>d.pah), 0.1);
  if (!voc || !pah) return { ready:false, n:vv.length };
  const vocLoo = looLogRMSE(vv.map(d=>Math.log(d.creoT)), vv.map(d=>d.stackTemp), vv.map(d=>d.voc), 0.1);
  const pahLoo = looLogRMSE(pp.map(d=>d.stackTemp), pp.map(d=>Math.log(d.creoT)), pp.map(d=>d.pah), 0.1);
  return { ready:true, voc, pah, vocLoo, pahLoo, n:vv.length, nPah:pp.length, maxT:Math.max(...vv.map(d=>d.creoT)) };
}
// Same leave-one-out log RMSE for the operative run-hours model, so the two can be compared like for like.
function operativeLooLogRMSE(stackData) {
  const v = (stackData || []).filter(d => d.voc != null && d.activeHrs > 0 && d.sameCarbon !== true);
  const p = (stackData || []).filter(d => d.pah != null && d.sameCarbon === false && d.stackTemp != null && d.activeHrs > 0);
  const adj = v.map(d=>d.voc / Math.exp((1 - humidityFactor(d.avgRH)) * 0.6));
  return {
    voc: looLogRMSE(v.map(d=>Math.log(Math.max(effectiveHoursForStackRecord(d), 1))), v.map(d=>d.avgTemp), adj, 0.1),
    pah: looLogRMSE(p.map(d=>d.stackTemp), p.map(d=>Math.log(Math.max(effectiveHoursForStackRecord(d), 1))), p.map(d=>d.pah), 0.1),
  };
}
function predictVOCCreo(tonnes, stackTemp, cm) {
  return Math.exp(cm.voc.a * Math.log(Math.max(tonnes, 0.5)) + cm.voc.b * stackTemp + cm.voc.c);
}
function predictPAHCreo(stackTemp, tonnes, cm) {
  return Math.exp(cm.pah.a * stackTemp + cm.pah.b * Math.log(Math.max(tonnes, 0.5)) + cm.pah.c);
}
// Creosote used on the current bed and the forward usage rate.
// Prefers the synced Daily Log; falls back to the rate in Settings.
function creosoteBedState(dailyLog, lastChangeout, settings, today) {
  // dailyLog here is the cleaned log (cleanCreoLog rows): copied/incomplete readings rebuilt.
  const rows = (dailyLog || []).filter(r => r && r.date).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const start = String(lastChangeout).slice(0,10);
  const todayIso = isoDateFromDate(today);
  const fallbackRate = settings.creoRateTPerDay != null ? settings.creoRateTPerDay : 11;
  const daysOnBed = Math.max(0, daysBetween(start, today));
  const last = rows.length ? rows[rows.length - 1] : null;
  const logCurrent = last && daysBetween(last.date, today) <= 4 && rows.some(r => r.date <= start);
  if (!logCurrent) {
    return { tonnes: fallbackRate * daysOnBed, rate: fallbackRate, source: "estimate", note: "estimated at " + fallbackRate + " t/day (Settings) - creosote log not synced" };
  }
  const usedKg = cleanUsageKg(rows, start, todayIso, true) || 0;
  const from30 = isoDateFromDate(addDays(today, -30));
  const kg30 = cleanUsageKg(rows, from30, todayIso, true) || 0;
  const rate = kg30 > 0 ? kg30 / 1000 / 30 : fallbackRate;
  return { tonnes: usedKg / 1000, rate, source: "log", note: "from the creosote log; forward rate " + rate.toFixed(1) + " t/day (last 30 days)" };
}
// Day-by-day forecast of the trial model at Boston climatology.
function forecastCreo(startDate, startTonnes, ratePerDay, cm, maxDays) {
  const horizon = maxDays || 365;
  let t = startTonnes, vocBreach = null, pahBreach = null;
  for (let day = 0; day <= horizon; day++) {
    const date = addDays(startDate, day);
    const stack = estimateStackTemp(BOSTON_MONTHLY_TEMPS[date.getMonth()]);
    const voc = predictVOCCreo(t, stack, cm);
    const pah = predictPAHCreo(stack, t, cm);
    if (!vocBreach && voc >= VOC_ELV) vocBreach = { day, date:isoDateFromDate(date), tonnes:t, value:voc };
    if (!pahBreach && pah >= PAH_ELV) pahBreach = { day, date:isoDateFromDate(date), tonnes:t, value:pah };
    if (vocBreach && pahBreach) break;
    t += ratePerDay;
  }
  let binding = null;
  if (vocBreach && pahBreach) binding = vocBreach.day <= pahBreach.day ? { type:"VOC", row:vocBreach } : { type:"PAH", row:pahBreach };
  else if (vocBreach) binding = { type:"VOC", row:vocBreach };
  else if (pahBreach) binding = { type:"PAH", row:pahBreach };
  return { vocBreach, pahBreach, binding };
}

// predictVOC: calibrated under Config A fan configuration (9,000 m3/hr nominal).
// activeHrs is treated as raw hours. For any period spanning Config B
// (reduced flow ~6,000 m3/hr, correction factor ~0.667), the caller should
// pre-apply calcEffectiveHours() to activeHrs before calling this function.
// For current Config A operations this discrepancy is negligible (<5%).
// This assumption must be revisited before any Config B period enters
// the live calibration dataset.
function predictVOC(activeHrs, ambientTemp, rhPct, vocC) {
  const a = vocC ? vocC.a : D_VOC_A, b = vocC ? vocC.b : D_VOC_B, ci = vocC ? vocC.c : D_VOC_C;
  const hf = humidityFactor(rhPct != null ? rhPct : 75), hp = (1-hf)*0.6;
  const lnV = a*Math.log(Math.max(activeHrs, 1)) + b*ambientTemp + ci + hp;
  return Math.round(Math.exp(lnV) * 10) / 10;
}

function vocUncertaintyMultiplier(vocC) {
  var r2 = vocC && vocC.r2_loo != null ? vocC.r2_loo : (vocC && vocC.r2 != null ? vocC.r2 : 0);
  var rmse = vocC && vocC.rmse != null ? vocC.rmse : VOC_RMSE_LOG;
  // Threshold applied to LOO CV R2 where available; in-sample R2 otherwise.
  // At R2 < 0.65, widen to 1.5 RMSE for conservative compliance scheduling.
  // At R2 >= 0.65, use 1 RMSE. Do not interpolate -- apply threshold cleanly.
  return r2 < 0.65 ? rmse * 1.5 : rmse;
}

function predictVOCBand(activeHrs, ambientTemp, rhPct, vocC) {
  const mid = predictVOC(activeHrs, ambientTemp, rhPct, vocC);
  const rmse = vocC && vocC.rmse != null ? vocC.rmse : VOC_RMSE_LOG;
  const effectiveRmse = vocUncertaintyMultiplier(vocC);
  return {
    mid,
    lo:  Math.round(mid / Math.exp(effectiveRmse) * 10) / 10,
    hi:  Math.round(mid * Math.exp(effectiveRmse) * 10) / 10,
    rmse,
  };
}

// predictPAH: bivariate - stack temp + ln(activeHrs)
// Both parameters now correctly wired. At high hours PAH prediction is conservatively higher.
function predictPAH(stackTemp, activeHrs, pahC) {
  const a = pahC ? pahC.a : D_PAH_A;
  const b = pahC ? pahC.b : D_PAH_B;
  const c = pahC ? pahC.c : D_PAH_C;
  const lnPAH = a*stackTemp + b*Math.log(Math.max(activeHrs, 1)) + c;
  return Math.round(Math.exp(lnPAH));
}

// PAH ELV breach temperature at a given active hours count
// Invert: ln(PAH_ELV) = a*stackTemp + b*ln(hrs) + c
// => stackTemp = (ln(PAH_ELV) - b*ln(hrs) - c) / a
function pahFailTemp(activeHrs, pahC) {
  const a = pahC ? pahC.a : D_PAH_A;
  const b = pahC ? pahC.b : D_PAH_B;
  const c = pahC ? pahC.c : D_PAH_C;
  if(Math.abs(a) < 1e-6) return 999;
  return (Math.log(PAH_ELV) - b*Math.log(Math.max(activeHrs, 1)) - c) / a;
}

// safeWindowHoursVOC: invert predictVOC for VOC = ELV, then apply WJ fraction scaling.
// WJ scaling is applied HERE (output stage), not inside predictVOC (input stage),
// keeping the regression coefficients consistent with their calibration data.
// Higher naphthalene fraction = capacity consumed faster = shorter safe window.
function safeWindowHoursVOC(ambientTemp, rhPct, vocC, naphthaleneFrac) {
  const nf = naphthaleneFrac != null ? naphthaleneFrac : 0.53;
  const a = vocC ? vocC.a : D_VOC_A, b = vocC ? vocC.b : D_VOC_B, ci = vocC ? vocC.c : D_VOC_C;
  const hf = humidityFactor(rhPct != null ? rhPct : 75), hp = (1-hf)*0.6;
  if(a <= 0) return 9999;
  // Invert for raw hours at baseline nf=0.53
  const lnH = (Math.log(VOC_ELV) - b*ambientTemp - ci - hp) / a;
  const rawHrs = Math.max(50, Math.round(Math.exp(lnH)));
  // Audit note: WJ fraction scaling is an uncalibrated multiplicative heuristic
  // applied on the output side. The regression may already absorb correlated
  // composition/temperature effects in the small P1-P8 dataset. Revisit once
  // n >= 8 independent periods exist for a formal sensitivity check.
  // Scale: at higher nf, capacity is consumed faster, so safe window shrinks proportionally
  return Math.max(0, Math.round(rawHrs * (0.53 / nf)));
}

// Risk scores anchored to actual ELV predictions
function vocRiskScore(activeHrs, ambientTemp, rhPct, vocC) {
  return Math.min(100, Math.round((predictVOC(activeHrs, ambientTemp, rhPct, vocC) / VOC_ELV) * 100));
}
function pahRiskScore(stackTemp, activeHrs, pahC) {
  return Math.min(100, Math.round((predictPAH(stackTemp, activeHrs, pahC) / PAH_ELV) * 100));
}

function riskBand(score) {
  if (score >= 80) return { label:"HIGH RISK",  color: C.red   };
  if (score >= 50) return { label:"ELEVATED",   color: C.amber };
  if (score >= 25) return { label:"MODERATE",   color: C.gold  };
  return               { label:"LOW",          color: C.teal  };
}

// Active hours from charge log
function calcActiveHrsFromLog(chargeLog) {
  return chargeLog.reduce((s,c) => {
    const plantType = normalizeChargeType(c.type);
    return s + (c.durationHrs || (plantType==="plant1" ? P1_AVG_HRS : P2_AVG_HRS)) * (c.count||1);
  }, 0);
}

function normalizeChargeType(type) {
  const raw = String(type || "").toLowerCase();
  if (["plant1","p1","fencing","fence"].includes(raw)) return "plant1";
  if (["plant2","p2","poles","pole"].includes(raw)) return "plant2";
  return "";
}

function filterChargeLogSince(chargeLog, startDate) {
  const startMs = new Date(startDate).getTime();
  if (!Number.isFinite(startMs)) return chargeLog || [];
  return (chargeLog || []).filter(entry => {
    const entryMs = new Date(entry.date).getTime();
    return Number.isFinite(entryMs) && entryMs >= startMs;
  });
}

// Rolling charge rate from last N days of log
function rollingChargeRate(chargeLog, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = chargeLog.filter(c => new Date(c.date) >= cutoff);
  const totalCharges = recent.reduce((s,c)=>s+(c.count||1),0);
  return totalCharges / Math.max(days, 1);
}

const BOSTON_MONTHLY_TEMPS = [
  4.2, 4.5, 6.8, 9.3, 12.6, 15.4, 17.6, 173/10, 14.8, 11.2, 7.4, 4.8
];

const BOSTON_MONTHLY_RH = [
  88, 86, 83, 78, 74, 74, 74, 76, 82, 85, 87, 87
];

function isoDateFromDate(date) {
  // v2.8.1 audit: local calendar date. toISOString() is UTC, so in a UK browser during BST
  // every forecast date built from a date string came out one day early.
  const d = new Date(date);
  const z = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(startDate, endDate) {
  return Math.max(0, Math.floor((new Date(endDate) - new Date(startDate)) / 86400000));
}

function nowDateTimeLocal() {
  const d = new Date();
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
}

function formatThermalTimestamp(ts) {
  if (!ts) return "--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const z = n => String(n).padStart(2, "0");
  return `${z(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

function parseThermalNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function thermalDerived(entry) {
  const ambient = parseThermalNumber(entry.ambientTemp);
  const preBed = parseThermalNumber(entry.preBedTemp);
  const postBed = parseThermalNumber(entry.postBedTemp);
  if (ambient == null || preBed == null || postBed == null) return { ambientToInletDelta:null, exotherm:null };
  return {
    ambientToInletDelta: preBed - ambient,
    exotherm: postBed - preBed,
  };
}

function computeThermalStats(thermalLog) {
  const rows = (thermalLog || []).map(entry => ({...entry, ...thermalDerived(entry)}))
    .filter(entry => entry.ambientToInletDelta != null && entry.exotherm != null);
  const count = rows.length;
  if (count < 1) return { count:0, rows:[], ready:false, meanAmbientToInletDelta:null, stdDevAmbientToInletDelta:null, latestDelta:null, latestAmbientTemp:null, minExotherm:null, maxExotherm:null, commonPlant1:"--", commonPlant2:"--" };
  const deltas = rows.map(r => r.ambientToInletDelta);
  const mean = deltas.reduce((sum, val)=>sum+val,0) / count;
  const variance = deltas.reduce((acc, val) => acc + (val - mean) * (val - mean), 0) / Math.max(count - 1, 1);
  const sortedRows = rows.slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const exotherms = rows.map(r => r.exotherm);
  const commonState = field => {
    const counts = {};
    rows.forEach(r=>{ if (r[field]) counts[r[field]] = (counts[r[field]] || 0) + 1; });
    const keys = Object.keys(counts).sort((a,b)=>counts[b]-counts[a] || a.localeCompare(b));
    return keys[0] || "--";
  };
  return {
    count,
    rows,
    ready: count >= 3,
    meanAmbientToInletDelta: mean,
    stdDevAmbientToInletDelta: Math.sqrt(variance),
    latestDelta: sortedRows[0] ? sortedRows[0].ambientToInletDelta : null,
    latestAmbientTemp: sortedRows[0] ? parseThermalNumber(sortedRows[0].ambientTemp) : null,
    minExotherm: Math.min.apply(null, exotherms),
    maxExotherm: Math.max.apply(null, exotherms),
    commonPlant1: commonState("plant1State"),
    commonPlant2: commonState("plant2State"),
  };
}

function computeLoggerStats(loggerLog) {
  var rows = (loggerLog || []).filter(function(r) {
    return r.ambientTemp != null && r.preBedTemp != null;
  });
  var count = rows.length;
  if (count < 1) return { count: 0, meanDelta: null, stdDevDelta: null };
  var deltas = rows.map(function(r) { return r.preBedTemp - r.ambientTemp; });
  var mean = deltas.reduce(function(a, v) { return a + v; }, 0) / count;
  var variance = count > 1
    ? deltas.reduce(function(acc, v) { return acc + (v - mean) * (v - mean); }, 0) / (count - 1)
    : 0;
  return {
    count: count,
    meanDelta: mean,
    stdDevDelta: Math.sqrt(variance),
  };
}

function thermalDeltaColor(delta) {
  if (delta == null) return C.muted;
  if (delta <= 8) return C.teal;
  if (delta <= 12) return C.amber;
  return C.red;
}

function plantStateColor(state) {
  if (state === "Impregnating") return C.red;
  if (state === "Draining" || state === "Steaming") return C.amber;
  if (state === "Conditioning") return C.gold;
  if (state === "Idle") return C.rund;
  if (state === "Maintenance") return C.muted;
  return C.muted;
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

function pahLimitHoursForOperativeTemp(tOperative) {
  if (tOperative < 17) return null;
  if (tOperative < 22) return 800;
  if (tOperative < 26) return 400;
  return 300;
}

function pahRiskLabelForOperativeTemp(tOperative) {
  if (tOperative < 17) return "Low";
  if (tOperative < 22) return "Moderate";
  if (tOperative < 26) return "Elevated";
  return "High";
}

function getScenarioAmbientTemp(dayIndex, currentDate, mode, flatTemp, monthlyTemps, liveTemps) {
  if (mode === "flat") return flatTemp;
  if (mode === "live" && liveTemps && liveTemps[dayIndex] != null) return liveTemps[dayIndex];
  const d = addDays(currentDate, dayIndex);
  return monthlyTemps[d.getMonth()];
}

function buildForwardForecast({ startDate, startActiveHrs, utilisationPct, mode, flatTemp, monthlyTemps, liveTemps, correctionFactor, pahStackTempOverride, isSameCarbonCharge, vocC, pahC, maxDays, settings, forecastRH }) {
  const dailyActiveHrs = 24 * (utilisationPct / 100);
  const rows = [];
  let vocBreach = null;
  let pahBreach = null;
  let sameBedLimit = null;
  let cumulativeHrs = startActiveHrs;
  const horizon = maxDays || 365;
  const rmse = vocUncertaintyMultiplier(vocC);

  for (let day = 0; day <= horizon; day++) {
    const date = addDays(startDate, day);
    const ambient = getScenarioAmbientTemp(day, startDate, mode, flatTemp, monthlyTemps, liveTemps);
    const tOperative = operativeTemp(ambient, correctionFactor);
    const vocMid = Math.round(predictVOC(cumulativeHrs, ambient, forecastRH, vocC) * 10) / 10;
    const vocLo = Math.round(vocMid / Math.exp(rmse) * 10) / 10;
    const vocHi = Math.round(vocMid * Math.exp(rmse) * 10) / 10;
    const overrideStackTemp = pahStackTempOverride !== "" && pahStackTempOverride != null && Number.isFinite(Number(pahStackTempOverride)) ? Number(pahStackTempOverride) : null;
    const estStackTempForDay = overrideStackTemp != null ? overrideStackTemp : estimateStackTemp(ambient);
    const pahPred = predictPAH(estStackTempForDay, cumulativeHrs, pahC);
    const pahRmse = pahC && pahC.rmse != null ? pahC.rmse : PAH_RMSE_LOG;
    const pahPredLo = Math.round(pahPred / Math.exp(pahRmse));
    const pahPredHi = Math.round(pahPred * Math.exp(pahRmse));
    const pahRisk = pahRiskLabelForOperativeTemp(tOperative);

    const row = {
      day,
      date: isoDateFromDate(date),
      activeHrs: Math.round(cumulativeHrs),
      ambient: Math.round(ambient * 10) / 10,
      tOperative: Math.round(tOperative * 10) / 10,
      vocMid,
      vocLo,
      vocHi,
      pahRisk,
      pahPred,
      pahPredLo,
      pahPredHi,
      stackTemp: Math.round(estStackTempForDay * 10) / 10,
      source: mode === "live" && liveTemps && liveTemps[day] != null ? "live" : mode === "flat" ? "flat" : "climate",
    };
    rows.push(row);

    if (!vocBreach && vocMid >= VOC_ELV) vocBreach = row;
    if (!pahBreach && pahPred >= PAH_ELV) pahBreach = row;
    if (isSameCarbonCharge && !sameBedLimit && cumulativeHrs >= 1155) sameBedLimit = row;
    if ((vocBreach || sameBedLimit) && pahBreach) break;
    cumulativeHrs += dailyActiveHrs;
  }

  const finalRows = rows.length > 0 ? rows : [];
  return {
    rows: finalRows,
    vocBreach,
    pahBreach,
    sameBedLimit,
    dailyActiveHrs,
    vocEarlyDay: vocBreach ? Math.max(0, Math.round(vocBreach.day * 0.75)) : null,
    vocLateDay: vocBreach ? Math.round(vocBreach.day * 1.25) : null,
  };
}

function forecastDateLabel(row) {
  if (!row) return "Not within horizon";
  return `${row.date} (${row.day} days / ${row.activeHrs.toLocaleString()} active hrs)`;
}

function getMostRecentPeriodWithMissingPAH(stackData) {
  const missing = stackData
    .filter(d => d && d.pah == null)
    .slice()
    .sort((a,b)=>parseInt(String(b.period).replace(/\D/g,""),10)-parseInt(String(a.period).replace(/\D/g,""),10));
  return missing[0] || null;
}

function MissingPAHBanner({ period }) {
  if (!period) return null;
  return (
    <div style={{ marginBottom:16, padding:"12px 14px", border:"2px solid " + C.red,
      borderRadius:8, background:TINT.redBg, color:TINT.redText,
      fontSize:12, lineHeight:1.5, fontWeight:700 }}>
      {"PAH RESULT OUTSTANDING: " + period.period + " PAH certified result not yet received. " +
      "PAH model is not calibrated on the current carbon charge. " +
      "PAH risk predictions are based on prior periods only. " +
      "Obtain and enter the certified PAH result immediately. " +
      "This banner clears automatically when the result is entered."}
    </div>
  );
}

// ============================================================
// UI COMPONENTS
// ============================================================
function Card({ children, style={} }) {
  return (
    <div style={{
      background:C.surface,
      border:`1px solid ${C.border}`,
      borderRadius:14,
      padding:"20px 22px",
      marginBottom:18,
      ...style
    }}>
      {children}
    </div>
  );
}
// Folds long method notes so pages stay short; the text stays available for audit.
function Fold({ title, children }) {
  return (
    <details style={{ marginTop:10 }}>
      <summary style={{ cursor:"pointer", fontSize:13, fontWeight:600, color:C.rund, padding:"6px 0", listStyle:"revert" }}>{title || "Method note"}</summary>
      <div style={{ marginTop:6 }}>{children}</div>
    </details>
  );
}
function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontFamily:HEAD_FONT,
      fontSize:16,
      fontWeight:600,
      letterSpacing:"0",
      color:C.ink,
      marginBottom:14,
      marginTop:0,
    }}>
      {children}
    </h3>
  );
}
function StatPill({ label, value, unit, color, sub }) {
  const stroke = color || C.ink;
  const tint = stroke === C.red ? TINT.redBg : stroke === C.amber ? TINT.amberBg : stroke === C.blue ? TINT.blueBg : stroke === C.teal || stroke === C.rund ? TINT.safeBg : C.surface2;
  return (
    <div style={{ background:tint, borderRadius:12, padding:"14px 16px", flex:1, minWidth:140 }}>
      <div style={{ fontSize:12, color:C.muted, fontWeight:600, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>{label}</div>
      <div style={{ fontSize:"clamp(1.3rem, 2.6vw, 1.75rem)", fontWeight:600, color:stroke, fontFamily:MONO, lineHeight:1 }}>
        {value}<span style={{ fontSize:12, color:C.muted, marginLeft:4, fontWeight:400 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize:12, color:C.muted, marginTop:6, lineHeight:1.35 }}>{sub}</div>}
    </div>
  );
}
function RiskGauge({ score, label, sub }) {
  const band = riskBand(score);
  const clampedScore = Math.max(0, Math.min(100, score));
  const arcPath = "M 32 104 A 56 56 0 0 1 144 104";
  return (
    <div style={{ textAlign:"center", padding:"6px 8px 4px", flex:"1 1 180px", minWidth:170 }}>
      <svg width="100%" height={118} viewBox="0 0 176 126" role="img" aria-label={`${label}: ${score} ${band.label}`}>
        <path d={arcPath} fill="none" stroke={C.border} strokeWidth={12} strokeLinecap="round" pathLength={100} />
        <path d={arcPath} fill="none" stroke={band.color} strokeWidth={12} strokeLinecap="round"
          pathLength={100} strokeDasharray={`${clampedScore} 100`} style={{ transition:"stroke-dasharray 0.8s ease" }} />
        <text x={88} y={82} textAnchor="middle" fontSize={24} fontWeight={700} fill={band.color} fontFamily={MONO}>{score}</text>
        <text x={88} y={98} textAnchor="middle" fontSize={10} fill={C.muted} fontWeight={600}>{band.label}</text>
      </svg>
      <div style={{ fontSize:12, color:C.muted, marginTop:-8, fontWeight:600 }}>{label}</div>
      {sub && <div style={{ fontSize:12, color:C.muted, marginTop:3, lineHeight:1.3 }}>{sub}</div>}
    </div>
  );
}
function Badge({ text, color }) {
  return <span style={{ display:"inline-block", background:alpha(color, 14), color, borderRadius:999, fontSize:12, fontWeight:600, letterSpacing:"0.02em", padding:"3px 10px" }}>{text}</span>;
}
function TabBar({ tabs, active, onChange }) {
  return (
    <div role="tablist" style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
      {tabs.map(t=>{
        const on = active===t.id;
        return (
          <button key={t.id} role="tab" aria-selected={on} className={on ? "" : "navbtn"} onClick={()=>onChange(t.id)} style={{
            minHeight:38, padding:"0 16px", borderRadius:999, cursor:"pointer", fontSize:13, fontWeight:on?600:500, whiteSpace:"nowrap",
            border:`1px solid ${on ? "transparent" : C.border}`, background:on ? C.rund : "transparent", color:on ? C.onAccent : C.muted,
          }}>{t.label}</button>
        );
      })}
    </div>
  );
}
function Input({ label, value, onChange, type="text", step, min, max, placeholder, style={}, disabled=false }) {
  return (
    <div style={{ marginBottom:14, display:"flex", flexDirection:"column", justifyContent:"flex-end", ...style }}>
      {label && <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:6, lineHeight:1.2 }}>{label}</label>}
      <input type={type} value={value} step={step} min={min} max={max} placeholder={placeholder} disabled={disabled}
        onChange={e=>onChange(type==="number" ? parseFloat(e.target.value) : e.target.value)}
        style={{ width:"100%", height:40, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, color:disabled?C.muted:C.ink, background:disabled?C.surface3:C.surface2, fontFamily:type==="number"?MONO:"inherit", boxSizing:"border-box", cursor:disabled?"not-allowed":"text", opacity:disabled?0.75:1 }} />
    </div>
  );
}
function Btn({ children, onClick, variant="primary", small, style={}, disabled=false }) {
  const base={ minHeight:small?34:40, padding:small?"0 14px":"0 18px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surface2, cursor:disabled?"not-allowed":"pointer", fontSize:small?12:13, fontWeight:600, color:C.ink, opacity:disabled?0.55:1, fontFamily:"inherit", ...style };
  const v={ primary:{background:C.rund,color:C.onAccent,border:"1px solid transparent"}, rund:{background:C.rund,color:C.onAccent,border:"1px solid transparent"}, gold:{color:C.gold}, ghost:{color:C.muted,background:"transparent"}, danger:{color:C.red,background:TINT.redBg,border:"1px solid transparent"} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant]}}>{children}</button>;
}

function ProcessSchematic({ activeHrs, vocWindowHrs, tvocPredicted, pahPredicted, stackTempC }) {
  const fillPct = Math.min(activeHrs / Math.max(vocWindowHrs, 1), 1.0);
  const fillHeight = fillPct * 80;
  const fillY = 148 - fillHeight;
  const fillColor = fillPct < 0.6 ? C.teal : fillPct < 0.85 ? C.amber : C.red;
  const alarm = tvocPredicted >= 15 || pahPredicted >= 750;
  const Timber = ({ x, y }) => (
    <>
      <rect x={x} y={y} width={36} height={8} fill={C.timber} opacity={0.85} />
      <rect x={x} y={y+12} width={36} height={8} fill={C.timber} opacity={0.72} />
      <rect x={x} y={y+24} width={36} height={8} fill={C.timber} opacity={0.6} />
    </>
  );
  const Chevron = ({ x, y }) => <polyline points={`${x},${y-6} ${x+10},${y} ${x},${y+6}`} stroke={C.rund} strokeWidth={1.5} fill="none" />;
  return (
    <Card style={{ padding:"14px 18px", background:C.surface }}>
      <SectionTitle>Abatement System -- Process Overview</SectionTitle>
      <style>{`@media (min-width:501px){.schematic-scroll-hint{display:none;}}`}</style>
      <div style={{ overflowX:"auto", WebkitOverflowScrolling:"touch", borderRadius:7, marginBottom:0 }}>
      <svg viewBox="0 0 920 240" width="100%" height="auto" style={{ minWidth:920 }} role="img" aria-label="Abatement process overview">
        <defs>
          <style>{`.flow-line{stroke-dasharray:8 6;animation:flowdash 2s linear infinite;}@keyframes flowdash{from{stroke-dashoffset:0;}to{stroke-dashoffset:-28;}}`}</style>
        </defs>
        <rect x={0} y={0} width={920} height={240} fill={C.surface} />

        <line x1={78} y1={115} x2={162} y2={115} stroke={C.borderBright} strokeWidth={6} />
        <line x1={218} y1={115} x2={710} y2={115} stroke={C.borderBright} strokeWidth={6} />
        <line x1={218} y1={115} x2={710} y2={115} stroke={C.rund} strokeWidth={2} className="flow-line" />
        <Chevron x={145} y={115} /><Chevron x={238} y={115} /><Chevron x={265} y={115} /><Chevron x={395} y={115} /><Chevron x={545} y={115} /><Chevron x={650} y={115} />

        <text x={54} y={66} textAnchor="middle" fill={C.mono} fontSize={12} fontWeight={700} fontFamily={MONO}>PLANT 1</text>
        <rect x={30} y={80} width={48} height={70} rx={2} fill={C.surface2} stroke={C.borderBright} />
        <Timber x={36} y={96} />
        <text x={114} y={66} textAnchor="middle" fill={C.mono} fontSize={12} fontWeight={700} fontFamily={MONO}>PLANT 2</text>
        <rect x={90} y={80} width={48} height={70} rx={2} fill={C.surface2} stroke={C.borderBright} />
        <Timber x={96} y={96} />

        <circle cx={190} cy={115} r={28} fill={C.surface2} stroke={C.borderBright} />
        <g>
          <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 190 115" to="360 190 115" dur="1.2s" repeatCount="indefinite" />
          <path d="M190 115 L218 108 L218 122 Z" fill={C.mono} opacity={0.95} />
          <path d="M190 115 L218 108 L218 122 Z" fill={C.mono} opacity={0.85} transform="rotate(120 190 115)" />
          <path d="M190 115 L218 108 L218 122 Z" fill={C.mono} opacity={0.75} transform="rotate(240 190 115)" />
          <circle cx={190} cy={115} r={4} fill={C.rund} />
        </g>
        <text x={190} y={162} textAnchor="middle" fill={C.mono} fontSize={12} fontWeight={700} fontFamily={MONO}>EXTR. FAN</text>

        <text x={310} y={66} textAnchor="middle" fill={C.mono} fontSize={12} fontWeight={700} fontFamily={MONO}>DEMISTER</text>
        <rect x={289} y={79} width={42} height={72} rx={2} fill={C.surface2} stroke={C.borderBright} />
        {[92,106,120,134].map(y=><line key={y} x1={294} y1={y} x2={326} y2={y} stroke={C.borderBright} strokeWidth={1} opacity={0.5} />)}

        <text x={460} y={52} textAnchor="middle" fill={C.ink} fontSize={13} fontWeight={700} fontFamily={MONO}>GAC BED 1</text>
        <rect x={431} y={66} width={58} height={88} rx={2} fill={C.surface2} stroke={C.borderBright} strokeWidth={2} />
        <rect x={436} y={fillY} width={48} height={fillHeight} fill={fillColor} opacity={0.75} />
        {alarm && <rect x={429} y={64} width={62} height={92} fill="none" stroke={C.red} strokeWidth={3}><animate attributeName="opacity" values="1;0.2;1" dur="1.5s" repeatCount="indefinite" /></rect>}
        <text x={460} y={113} textAnchor="middle" fill={fillPct < 0.85 ? C.mono : C.red} fontSize={14} fontWeight={700} fontFamily={MONO}>{Math.round(fillPct*100)}%</text>
        <text x={460} y={171} textAnchor="middle" fill={C.rund} fontSize={12} fontWeight={700} fontFamily={MONO}>LEAD</text>

        <rect x={710} y={86} width={28} height={60} rx={1} fill={C.surface2} stroke={C.borderBright} />
        <polyline points="724,70 716,78 732,78 724,70" stroke={C.muted} strokeWidth={1.5} fill="none" />
        <polyline points="724,58 716,66 732,66 724,58" stroke={C.muted} strokeWidth={1.5} fill="none" />
        <polyline points="724,46 716,54 732,54 724,46" stroke={C.muted} strokeWidth={1.5} fill="none" />
        <text x={724} y={160} textAnchor="middle" fill={C.mono} fontSize={12} fontWeight={700} fontFamily={MONO}>STACK</text>
        <text x={724} y={176} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily={MONO}>TVOC 20 mg/m3</text>
        <text x={724} y={190} textAnchor="middle" fill={C.muted} fontSize={10} fontFamily={MONO}>PAH 1000 ug/m3</text>

        <rect x={32} y={194} width={670} height={34} fill={C.surface2} stroke={C.border} />
        <text x={48} y={216} fill={C.ink} fontSize={14} fontFamily={MONO}>STACK {stackTempC.toFixed(1)} deg C</text>
        <text x={250} y={216} fill={tvocPredicted >= 15 ? C.red : C.mono} fontSize={14} fontFamily={MONO}>TVOC {tvocPredicted.toFixed(1)} mg/m3</text>
        <text x={470} y={216} fill={pahPredicted >= 750 ? C.red : C.mono} fontSize={14} fontFamily={MONO}>PAH {pahPredicted.toLocaleString()} ug/m3</text>

        <rect x={774} y={98} width={20} height={20} fill={C.teal} /><text x={806} y={113} fill={C.muted} fontSize={14} fontFamily={MONO}>{"< 60%"}</text>
        <rect x={774} y={126} width={20} height={20} fill={C.amber} /><text x={806} y={141} fill={C.muted} fontSize={14} fontFamily={MONO}>60-85%</text>
        <rect x={774} y={154} width={20} height={20} fill={C.red} /><text x={806} y={169} fill={C.muted} fontSize={14} fontFamily={MONO}>{"> 85%"}</text>
      </svg>
      </div>
      <div className="schematic-scroll-hint" style={{ fontSize:12, color:C.muted, textAlign:"right", marginTop:3 }}>Scroll right to see full process view</div>
    </Card>
  );
}

function useLocalStorage(key, initialValue, onSaved) {
  const [value, setValue] = useState(()=>{
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initialValue : JSON.parse(raw);
    } catch {
      return initialValue;
    }
  });
  useEffect(()=>{
    try {
      localStorage.setItem(key, JSON.stringify(value));
      if (onSaved) onSaved(new Date().toLocaleTimeString());
    } catch {}
  },[key,value,onSaved]);
  return [value, setValue];
}

async function platformRequest(path, options) {
  const authToken = (() => {
    try {
      return localStorage.getItem("cgb_platform_token") || "";
    } catch {
      return "";
    }
  })();
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options && options.headers ? options.headers : {}),
    },
    ...(options || {}),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(payload && payload.error ? payload.error : `Platform request failed (${response.status})`);
  }
  return payload;
}

function formatSyncStamp(value) {
  if (!value) return "--";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB");
}

function resolveStateUpdate(nextValueOrUpdater, previousValue) {
  return typeof nextValueOrUpdater === "function"
    ? nextValueOrUpdater(previousValue)
    : nextValueOrUpdater;
}

function getStoredPlatformToken() {
  try {
    return localStorage.getItem("cgb_platform_token") || "";
  } catch {
    return "";
  }
}

function setStoredPlatformToken(token) {
  try {
    if (token) localStorage.setItem("cgb_platform_token", token);
    else localStorage.removeItem("cgb_platform_token");
  } catch {}
}

async function fileToBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const marker = "base64,";
      const idx = result.indexOf(marker);
      resolve(idx >= 0 ? result.slice(idx + marker.length) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function usePlatformAuth() {
  const [authState, setAuthState] = useState({
    ready: false,
    loading: true,
    token: getStoredPlatformToken(),
    user: null,
    error: "",
    adminStatus: null,
  });

  const refreshSession = useCallback(async () => {
    const token = getStoredPlatformToken();
    if (!token) {
      setAuthState({ ready: true, loading: false, token: "", user: null, error: "", adminStatus: null });
      return;
    }
    setAuthState(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const session = await platformRequest("/api/auth/session");
      setAuthState({
        ready: true,
        loading: false,
        token,
        user: session.user,
        error: "",
        adminStatus: session.adminStatus || null,
      });
    } catch (error) {
      setStoredPlatformToken("");
      setAuthState({ ready: true, loading: false, token: "", user: null, error: error.message, adminStatus: null });
    }
  }, []);

  useEffect(()=>{
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (username, password) => {
    const session = await platformRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setStoredPlatformToken(session.token);
    setAuthState({
      ready: true,
      loading: false,
      token: session.token,
      user: session.user,
      error: "",
      adminStatus: session.adminStatus || null,
    });
    return session;
  }, []);

  const logout = useCallback(async () => {
    try {
      await platformRequest("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
    } catch {}
    setStoredPlatformToken("");
    setAuthState({ ready: true, loading: false, token: "", user: null, error: "", adminStatus: null });
  }, []);

  const changePassword = useCallback(async payload => {
    const response = await platformRequest("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAuthState(prev => ({ ...prev, user: response.user ? response.user : prev.user, adminStatus: prev.adminStatus ? { ...prev.adminStatus, usingDefaultAdminPassword: false } : prev.adminStatus }));
    return response;
  }, []);

  return {
    authState,
    login,
    logout,
    refreshSession,
    changePassword,
  };
}

function usePlatformDocument(onSaved, enabled) {
  const [platformState, setPlatformState] = useState(()=>createDefaultPlatformState());
  const [platformMeta, setPlatformMeta] = useState({
    ready: false,
    loading: true,
    syncLabel: "Connecting",
    error: "",
    version: 0,
    updatedAt: "",
    imports: null,
    storage: null,
  });
  const pendingSavesRef = useRef(0);
  const platformStateRef = useRef(platformState);

  useEffect(()=>{
    platformStateRef.current = platformState;
  }, [platformState]);

  const applyServerDocument = useCallback(doc => {
    const nextState = doc && doc.state ? doc.state : createDefaultPlatformState();
    platformStateRef.current = nextState;
    setPlatformState(nextState);
    setPlatformMeta(prev => ({
      ...prev,
      ready: true,
      loading: false,
      syncLabel: "Synced",
      error: "",
      version: doc && doc.version ? doc.version : prev.version,
      updatedAt: doc && doc.updatedAt ? doc.updatedAt : prev.updatedAt,
      imports: doc ? doc.imports : prev.imports,
      storage: doc ? doc.storage : prev.storage,
    }));
  }, []);

  const refreshFromServer = useCallback(async silent => {
    if (!enabled) {
      setPlatformMeta(prev => ({ ...prev, ready: false, loading: false, syncLabel: "Locked", error: "" }));
      return;
    }
    if (silent && pendingSavesRef.current > 0) return;
    if (!silent) {
      setPlatformMeta(prev => ({ ...prev, loading: true, syncLabel: "Loading", error: "" }));
    }
    try {
      const doc = await platformRequest("/api/state");
      applyServerDocument(doc);
    } catch (error) {
      setPlatformMeta(prev => ({
        ...prev,
        loading: false,
        syncLabel: prev.ready ? "Sync paused" : "Offline",
        error: error.message,
      }));
    }
  }, [applyServerDocument, enabled]);

  useEffect(()=>{
    if (!enabled) return;
    refreshFromServer(false);
    const id = setInterval(()=>{ refreshFromServer(true); }, 15000);
    return () => clearInterval(id);
  }, [enabled, refreshFromServer]);

  const persistKey = useCallback(async (key, value) => {
    pendingSavesRef.current += 1;
    setPlatformMeta(prev => ({ ...prev, syncLabel: "Saving", error: "" }));
    try {
      const doc = await platformRequest(`/api/state/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      });
      // v2.3.0: only adopt the server copy once no other saves are in flight. Applying an
      // earlier response while later edits are still pending rolled those edits back
      // (lost records in bulk imports, reverted keystrokes in settings).
      if (pendingSavesRef.current <= 1) applyServerDocument(doc);
      else setPlatformMeta(prev => ({ ...prev, version: doc && doc.version ? doc.version : prev.version, updatedAt: doc && doc.updatedAt ? doc.updatedAt : prev.updatedAt }));
      if (onSaved) onSaved(new Date().toLocaleTimeString("en-GB"));
    } catch (error) {
      setPlatformMeta(prev => ({ ...prev, syncLabel: "Save failed", error: error.message }));
      throw error;
    } finally {
      pendingSavesRef.current = Math.max(0, pendingSavesRef.current - 1);
    }
  }, [applyServerDocument, onSaved]);

  const updateKey = useCallback((key, nextValueOrUpdater) => {
    const currentState = platformStateRef.current || createDefaultPlatformState();
    const nextValue = resolveStateUpdate(nextValueOrUpdater, currentState[key]);
    if (Object.is(currentState[key], nextValue)) return;
    const nextState = { ...currentState, [key]: nextValue };
    platformStateRef.current = nextState;
    setPlatformState(nextState);
    void persistKey(key, nextValue);
  }, [persistKey]);

  const exportBackup = useCallback(async () => {
    const backup = await platformRequest("/api/backup/export");
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cgb-platform-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importBackup = useCallback(async payload => {
    const doc = await platformRequest("/api/backup/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    applyServerDocument(doc);
    if (onSaved) onSaved(new Date().toLocaleTimeString("en-GB"));
  }, [applyServerDocument, onSaved]);

  const resetPlatform = useCallback(async () => {
    const doc = await platformRequest("/api/reset", { method: "POST", body: JSON.stringify({}) });
    applyServerDocument(doc);
    if (onSaved) onSaved(new Date().toLocaleTimeString("en-GB"));
  }, [applyServerDocument, onSaved]);

  const runChargeImportScan = useCallback(async () => {
    const doc = await platformRequest("/api/imports/charges/run", { method: "POST", body: JSON.stringify({}) });
    applyServerDocument(doc);
  }, [applyServerDocument]);

  const importCreosoteWorkbook = useCallback(async payload => {
    const res = await platformRequest("/api/imports/creosote/upload", { method: "POST", body: JSON.stringify(payload) });
    if (res && res.doc) applyServerDocument(res.doc);
    return res ? res.result : null;
  }, [applyServerDocument]);

  return {
    platformState,
    platformMeta,
    updateKey,
    exportBackup,
    importBackup,
    resetPlatform,
    runChargeImportScan,
    refreshFromServer,
    importCreosoteWorkbook,
  };
}

function usePlatformAdminData(enabled, isAdmin) {
  const [adminData, setAdminData] = useState({
    documents: [],
    users: [],
    audit: [],
    loading: false,
    error: "",
  });

  const refresh = useCallback(async () => {
    if (!enabled) {
      setAdminData({ documents: [], users: [], audit: [], loading: false, error: "" });
      return;
    }
    setAdminData(prev => ({ ...prev, loading: true, error: "" }));
    try {
      const docsPromise = platformRequest("/api/documents");
      const usersPromise = isAdmin ? platformRequest("/api/users") : Promise.resolve({ users: [] });
      const auditPromise = isAdmin ? platformRequest("/api/audit?limit=100") : Promise.resolve({ audit: [] });
      const [docs, users, audit] = await Promise.all([docsPromise, usersPromise, auditPromise]);
      setAdminData({
        documents: docs.documents || [],
        users: users.users || [],
        audit: audit.audit || [],
        loading: false,
        error: "",
      });
    } catch (error) {
      setAdminData(prev => ({ ...prev, loading: false, error: error.message }));
    }
  }, [enabled, isAdmin]);

  useEffect(()=>{
    if (enabled) void refresh();
  }, [enabled, refresh]);

  const uploadDocument = useCallback(async payload => {
    const response = await platformRequest("/api/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAdminData(prev => ({ ...prev, documents: response.document ? [response.document, ...prev.documents] : prev.documents }));
    return response.document;
  }, []);

  const createUser = useCallback(async payload => {
    const response = await platformRequest("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setAdminData(prev => ({ ...prev, users: response.user ? [...prev.users, response.user] : prev.users }));
    return response.user;
  }, []);

  const downloadDocument = useCallback(async fileRecord => {
    const authToken = getStoredPlatformToken();
    const response = await fetch(`/api/documents/${fileRecord.id}/download`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    if (!response.ok) {
      throw new Error(`Download failed (${response.status})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    if ((fileRecord.mimeType || "").toLowerCase().includes("pdf")) {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else {
      a.download = fileRecord.fileName || "document.bin";
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
  }, []);

  return {
    adminData,
    refreshAdminData: refresh,
    uploadDocument,
    createUser,
    downloadDocument,
  };
}

function ModelStatusBanner({ vocC, pahC, settings }) {
  const vOk = vocC.n >= 3, pOk = pahC.n >= 3;
  const stackTempCorrection = settings && settings.stackTempCorrectionC != null ? settings.stackTempCorrectionC : 10.3;
  const looLabel = vocC.r2_loo != null ? vocC.r2_loo.toFixed(3) : "insufficient data (need 4+ periods)";
  const residualRows = INITIAL_STACK_DATA.filter(d=>d.voc != null && d.activeHrs > 0).map(d=>{
    const effectiveHrs = effectiveHoursForStackRecord(d);
    const pred = predictVOC(effectiveHrs, d.avgTemp, d.avgRH, vocC);
    return { period:d.period, actual:d.voc, pred, err: Math.round(((d.voc - pred) / Math.max(pred, 0.1)) * 100) };
  });
  // v1.9.0: largest residuals found dynamically among calibration periods (log ratio), not hard-coded to P4/P7.
  const calibResiduals = INITIAL_STACK_DATA.filter(d=>d.voc != null && d.activeHrs > 0 && d.sameCarbon === false)
    .map(d=>residualRows.find(r=>r.period===d.period)).filter(Boolean)
    .map(r=>({ ...r, lr: Math.log(Math.max(r.actual,0.01)/Math.max(r.pred,0.1)) }));
  const underRow = calibResiduals.length ? calibResiduals.reduce((m,r)=>r.lr>m.lr?r:m) : null;
  const overRow = calibResiduals.length ? calibResiduals.reduce((m,r)=>r.lr<m.lr?r:m) : null;
  const p4Err = underRow && underRow.lr > 0 ? underRow : null;
  const p7Err = overRow && overRow.lr < 0 ? overRow : null;
  const looColor = vocC.r2_loo == null ? C.muted : vocC.r2_loo < 0 ? C.red : vocC.r2_loo < 0.4 ? C.amber : C.teal;
  const looDisplay = vocC.r2_loo == null
    ? "insufficient data (need 4+ periods)"
    : vocC.r2_loo < 0
    ? looLabel + " (negative -- see note)"
    : looLabel;
  return (
    <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:200, background:vOk?TINT.safeBg:TINT.amberBg, border:`1px solid ${vOk?C.teal:C.amber}`, borderRadius:8, padding:"10px 14px" }}>
        <div style={{ fontSize:12, fontWeight:700, color:vOk?C.teal:C.amber, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>VOC Model</div>
        <div style={{ fontSize:12, color:C.ink }}>
          {vOk ? (
            <>
              {`n=${vocC.n} | In-sample R2: ${vocC.r2.toFixed(3)} | LOO CV R2: `}
              <span style={{ color:looColor }}>{looDisplay}</span>
            </>
          ) : `Defaults (n=${vocC.n} - need 3+)`}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>a={vocC.a.toFixed(3)} b={vocC.b.toFixed(3)} c={vocC.c.toFixed(3)} | Uncertainty band: x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)}</div>
        <div style={{ fontSize:12, color:vocC.bayesianActive?C.teal:C.muted, marginTop:2 }}>
          Bayes: {vocC.bayesianActive ? "Active" : "Inactive"} | {vocC.bayesianActive ? `delta c=${vocC.bayesC ? (vocC.bayesC.mean - vocC.c).toFixed(3) : "n/a"}` : `n=${vocC.n} of 4 req.`}
        </div>
        <Fold title="What the cross-validated R2 means">
        <div style={{ fontSize:12, color:TINT.amberText, marginTop:6, padding:"7px 9px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:6, lineHeight:1.45 }}>
          {"LOO CV R2 is the leave-one-out cross-validated R2. It estimates predictive " +
          "accuracy on periods NOT used for fitting and is the primary EA-defensible " +
          "reliability metric. In-sample R2 is shown for audit trail only. " +
          "At n=" + vocC.n + " independent periods, LOO CV R2 has high variance " +
          "and is sensitive to influential outliers. A negative LOO CV R2 indicates " +
          "the most influential period " +
          "cannot be predicted from the remaining " + (vocC.n - 1) + " periods -- " +
          "this is diagnostic information, not a model failure. " +
          "LOO CV R2 stabilises as n increases; " + MODEL_VERSION + " has " + (vocC && vocC.n ? vocC.n : "--") + " independent periods."}
        </div>
        </Fold>
        {(function() {
          var bayesRefPeriod = INITIAL_STACK_DATA.filter(function(d) {
            return d.sameCarbon === false && d.voc != null;
          }).slice(-1)[0];
          if (!bayesRefPeriod || !vocC.bayesianActive || !vocC.bayesC) return null;
          var bayesEffectiveHrs = effectiveHoursForStackRecord(bayesRefPeriod);
          var hf = humidityFactor(bayesRefPeriod.avgRH);
          var hp = (1 - hf) * 0.6;
          var ridgePred = Math.round(Math.exp(
            vocC.a * Math.log(Math.max(bayesEffectiveHrs, 1)) +
            vocC.b * bayesRefPeriod.avgTemp + vocC.c + hp
          ) * 10) / 10;
          var bayesPred = Math.round(Math.exp(
            vocC.a * Math.log(Math.max(bayesEffectiveHrs, 1)) +
            vocC.b * bayesRefPeriod.avgTemp + vocC.bayesC.mean + hp
          ) * 10) / 10;
          var diff = Math.round((bayesPred - ridgePred) * 10) / 10;
          var diffColor = Math.abs(diff) > 5 ? C.amber : C.muted;
          return (
            <div style={{ fontSize:12, color:diffColor, marginTop:2 }}>
              {"Bayes ref (" + bayesRefPeriod.period + ", " +
              bayesRefPeriod.activeHrs + " raw hrs / " + bayesEffectiveHrs.toFixed(0) + " eff hrs, " +
              bayesRefPeriod.avgTemp + "C): " +
              "Ridge=" + ridgePred.toFixed(1) + " mg/m3, " +
              "Bayes-adj=" + bayesPred.toFixed(1) + " mg/m3, " +
              "actual=" + bayesRefPeriod.voc + " mg/m3. " +
              "Delta=" + (diff > 0 ? "+" : "") + diff.toFixed(1) + " mg/m3. " +
              "Bayes intercept shift informational only -- not applied to compliance outputs."}
            </div>
          );
        })()}
        <div style={{ fontSize:12, color:C.amber, marginTop:2 }}>Calibration dataset: independent carbon charge periods only (sameCarbon=false). P1-P3 excluded (same-carbon cumulative observations, not independent data points). n={vocC.n}.</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>P2 retained for anomaly display but excluded by sameCarbon filter. Prediction uncertainty x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} (effective RMSE band in log space).</div>
        {p4Err && p7Err && (
          <div style={{ fontSize:12, color:TINT.amberText, marginTop:6, padding:"7px 9px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:6, lineHeight:1.45 }}>
            Largest calibration residuals: under-prediction {p4Err.period} actual {p4Err.actual}, predicted {p4Err.pred.toFixed(1)} (+{p4Err.err}%); over-prediction {p7Err.period} actual {p7Err.actual}, predicted {p7Err.pred.toFixed(1)} ({p7Err.err}%). Under-prediction means the model can flag breakthrough later than it occurs; over-prediction means it recommends changeout earlier than necessary. Treat scheduling outputs with corresponding caution and use the uncertainty band.
          </div>
        )}
      </div>
      <div style={{ flex:1, minWidth:200, background:pOk?TINT.safeBg:TINT.amberBg, border:`1px solid ${pOk?C.teal:C.amber}`, borderRadius:8, padding:"10px 14px" }}>
        <div style={{ fontSize:12, fontWeight:700, color:pOk?C.teal:C.amber, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>PAH Model</div>
        <div style={{ fontSize:12, color:C.ink }}>{pOk ? `Live calibrated (n=${pahC.n}, R2=${pahC.r2.toFixed(3)})` : `Defaults (n=${pahC.n} - need 3+)`}</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Bivariate: temp + age. Breach stack temp at 500 hrs reference: {pahFailTemp(500, pahC).toFixed(1)}C (~{((pahFailTemp(500, pahC) - STACK_TEMP_A) / STACK_TEMP_B).toFixed(1)}C ambient)</div>
        <div style={{ fontSize:12, color:pahC.bayesianActive?C.teal:C.muted, marginTop:2 }}>
          Bayes: {pahC.bayesianActive ? "Active" : "Inactive"} | {pahC.bayesianActive ? `delta c=${pahC.bayesC ? (pahC.bayesC.mean - pahC.c).toFixed(3) : "n/a"}` : `n=${pahC.n} of 4 req.`}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>
          Calibration: independent fresh-carbon periods only (sameCarbon=false). P2 excluded for calibration symmetry with VOC model. P2 certified result retained in display table only. n={pahC.n} independent periods.
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Flow measurements: Envirocare stack discharge (post-demister, post-carbon bed), used as conservative proxy for bed inlet flow.</div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD TAB
// ============================================================
function DashboardTab({ stackData, settings, weather, ambientOverride, chargeLog, lastChangeout, downtimeHrs, onDowntime, vocC, pahC, canEdit, latestCarbonBatch }) {
  const [showWeighting, setShowWeighting] = useState(false);
  const currentPeriodChargeLog = useMemo(()=>filterChargeLogSince(chargeLog, lastChangeout), [chargeLog, lastChangeout]);
  const logChargeHrs = useMemo(()=>calcActiveHrsFromLog(currentPeriodChargeLog),[currentPeriodChargeLog]);
  const now = new Date(), changeoutDate = new Date(lastChangeout);
  const daysSince = Math.max(0, Math.floor((now-changeoutDate)/86400000));
  const fallbackHrs = Math.max(0, Math.round(daysSince*24*settings.utilisationRate - downtimeHrs));
  // Active hours: charge log primary, fallback on days*util
  const chargeActiveHrs = currentPeriodChargeLog.length > 0 ? Math.max(logChargeHrs - downtimeHrs, 0) : fallbackHrs;
  // Fan hours: bed exposure time even between charges (24/7 minus downtime)
  const fanActiveHrs = Math.max(0, daysSince * 24 - downtimeHrs);
  // Prediction uses charge hours (loading proxy) but fan hours shown for reference
  const currentPeriodEnd = isoDateFromDate(new Date());
  const effectiveChargeHrs = calcEffectiveHours(chargeActiveHrs, lastChangeout, currentPeriodEnd);
  const activeHrs = effectiveChargeHrs;

  const ambientTemp = ambientOverride != null ? ambientOverride : weather ? weather.temperature_2m : settings.typicalTempC;
  const rawRh       = weather ? weather.relative_humidity_2m : settings.typicalRH;
  const rh          = settings.useConservativeRH ? 90 : rawRh;
  const stackTempCorrection = settings.stackTempCorrectionC ?? 10.3;
  const opTemp = operativeTemp(ambientTemp, stackTempCorrection);
  const opNote = operativeTempNote(ambientTemp, stackTempCorrection);
  // Stack temp estimate via linear regression on P1-P8 MCERTS data (R2=0.92)
  const estStackTemp = estimateStackTemp(ambientTemp);
  const hf = humidityFactor(rh);
  const nf = settings.naphthaleneFrac;

  const predVOCBand = predictVOCBand(activeHrs, ambientTemp, rh, vocC);
  const predPAH     = predictPAH(estStackTemp, activeHrs, pahC);
  const pahThresh   = pahFailTemp(activeHrs, pahC);
  const pahBreaching = estStackTemp >= pahThresh;
  const vRisk = vocRiskScore(activeHrs, ambientTemp, rh, vocC);
  const pRisk = pahRiskScore(estStackTemp, activeHrs, pahC);
  const vocRiskWeight = settings.vocRiskWeight != null ? settings.vocRiskWeight : 0.55;
  const pahRiskWeight = 1 - vocRiskWeight;
  const combined = Math.round(vRisk*vocRiskWeight + pRisk*pahRiskWeight);
  // v2.8.1 audit: Wheeler-Jonas needs the carbon INLET concentration. It was being given the
  // predicted stack (outlet) VOC, which made the reference life far too long.
  const wjInlet = settings.inletVOCmgm3 != null ? settings.inletVOCmgm3 : 400;
  const wjBedLife = wheelerJonasBedLife(opTemp, wjInlet, settings, latestCarbonBatch);
  const missingPah = getMostRecentPeriodWithMissingPAH(stackData);

  const vocWindow   = safeWindowHoursVOC(ambientTemp, rh, vocC, nf);
  // Scheduling dates use the same day-by-day seasonal forecast as the Overview and
  // Forward Forecast tabs, so every screen shows one date for the current bed.
  const schedule = forecastFrom(now, activeHrs, settings, vocC, pahC);
  const vocRow = schedule.fc.vocBreach;
  const remainDays  = vocRow ? vocRow.day : 365;
  const remainHrs   = vocRow ? Math.max(0, Math.round(vocRow.activeHrs - activeHrs)) : Math.max(0, vocWindow - activeHrs);
  const predictedDepletionDate = vocRow ? vocRow.date : "Beyond 12 months";
  const preTestBufferDays = schedule.bufferDays;
  const latestTestDays = Math.max(0, remainDays - preTestBufferDays);
  const latestTestDate = isoDateFromDate(addDays(now, latestTestDays));
  const pahAmbientThresh = ambientThresholdForPAHAtHours(activeHrs, pahC);
  let pahRiskOnsetDate = null;
  for (let d = 0; d <= 365; d++) {
    const checkDate = addDays(now, d);
    const monthTemp = BOSTON_MONTHLY_TEMPS[checkDate.getMonth()];
    if (monthTemp >= pahAmbientThresh) {
      pahRiskOnsetDate = isoDateFromDate(checkDate);
      break;
    }
  }
  const vocHealthColor = vocC.r2_loo != null && vocC.r2_loo > 0
    ? (vocC.r2_loo >= 0.4 ? C.teal : C.amber)
    : C.amber;
  const pahHealthColor = pahC.r2 != null && pahC.r2 >= 0.9 ? C.teal : C.amber;

  // Cycles remaining: remaining hrs / avg hrs per charge from rolling rate
  const plant1Count = currentPeriodChargeLog.filter(c=>normalizeChargeType(c.type)==="plant1").reduce((a,c)=>a+(c.count||1),0);
  const plant2Count = currentPeriodChargeLog.filter(c=>normalizeChargeType(c.type)==="plant2").reduce((a,c)=>a+(c.count||1),0);
  const totalCharges = plant1Count + plant2Count;
  const avgHrsPerCharge = totalCharges > 0
    ? logChargeHrs / totalCharges
    : (P1_AVG_HRS + P2_AVG_HRS) / 2;
  const chargesRemaining = remainHrs > 0 && avgHrsPerCharge > 0
    ? Math.floor(remainHrs / avgHrsPerCharge)
    : 0;
  const chargeRatePer28d = rollingChargeRate(currentPeriodChargeLog, 28);

  // VOC forecast with uncertainty band
  const maxHrs = Math.max(vocWindow*1.3, activeHrs+300);
  const step = Math.max(20, Math.round(maxHrs/50));
  const forecastVOC = [];
  for(let h=0; h<=maxHrs; h+=step) {
    const band = predictVOCBand(h, ambientTemp, rh, vocC);
    forecastVOC.push({ hrs:h, mid:band.mid, lo:band.lo, hi:band.hi, elv:VOC_ELV });
  }

  return (
    <div>
      <MissingPAHBanner period={missingPah} />
      {(function() {
        var todayStr = new Date().toISOString().slice(0, 10);
        var cfg = getFanConfigAtDate(todayStr);
        if (cfg && cfg.label && cfg.label.toLowerCase().indexOf("reduced") >= 0) {
          return (
            <div style={{ marginBottom:16, padding:"12px 14px",
              border:"2px solid " + C.amber, borderRadius:8,
              background:TINT.amberBg, color:TINT.amberText,
              fontSize:12, fontWeight:700, lineHeight:1.5 }}>
              FAN CONFIG B ACTIVE: Extraction fan running at reduced speed
              ({cfg.fanRPM.toLocaleString()} rpm, approx {cfg.typicalStackDischargeFlow_m3hr.toLocaleString()} m3/hr).
              VOC predictions are automatically flow-corrected using Config B
              weighting before the safe window and forecast outputs are calculated.
              PAH model is unaffected.
            </div>
          );
        }
        return null;
      })()}
      <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 12,
        padding: "8px 12px",
        background: C.surface2,
        border: "1px solid " + C.border,
        borderRadius: 2,
        alignItems: "center",
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted,
          letterSpacing: "0.1em", textTransform: "uppercase" }}>
          Model Health:
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: vocHealthColor,
          fontFamily: MONO }}>
          VOC n={vocC.n} R2={vocC.r2 != null ? vocC.r2.toFixed(2) : "default"}
          {" "}LOO={vocC.r2_loo != null ? vocC.r2_loo.toFixed(2) : "n/a"}
        </span>
        <span style={{ fontSize: 12, color: C.muted }}>|</span>
        <span style={{ fontSize: 12, color: C.muted }}>
          {vocC.bayesianStatus || "Bayes status unavailable"}
        </span>
        <span style={{ fontSize: 12, color: C.muted }}>|</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: pahHealthColor,
          fontFamily: MONO }}>
          PAH n={pahC.n} R2={pahC.r2 != null ? pahC.r2.toFixed(2) : "default"}
        </span>
        <span style={{ fontSize: 12, color: C.muted }}>|</span>
        <span style={{ fontSize: 12, color: C.muted }}>
          {pahC.bayesianStatus || "Bayes status unavailable"}
        </span>
        <span style={{ fontSize: 12, color: C.muted }}>|</span>
        <span style={{ fontSize: 12, color: C.muted }}>
          Full detail: Model Details tab
        </span>
      </div>

      <Card style={{ borderLeft:`4px solid ${riskBand(combined).color}` }}>
        <SectionTitle>Carbon Bed Status</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Charge Active Hrs" value={chargeActiveHrs.toLocaleString()} unit="hrs"
            color={activeHrs>vocWindow?C.red:activeHrs>vocWindow*0.8?C.amber:C.teal}
            sub={currentPeriodChargeLog.length>0 ? `${totalCharges} charges logged since changeout` : `${daysSince}d x ${(settings.utilisationRate*100).toFixed(0)}% util`} />
          <StatPill label="Fan Running Hrs" value={Math.round(fanActiveHrs).toLocaleString()} unit="hrs"
            color={C.blue} sub={"Auto: " + daysSince + " days x 24 hrs minus " + downtimeHrs + " hrs downtime"} />
          <StatPill label="VOC Predicted" value={predVOCBand.mid} unit="mg/m3"
            color={predVOCBand.hi>VOC_ELV?C.red:predVOCBand.mid>VOC_ELV*0.7?C.amber:C.teal}
            sub={`Range: ${predVOCBand.lo}-${predVOCBand.hi} | ELV ${VOC_ELV}`} />
          <StatPill label="PAH Predicted" value={predPAH.toLocaleString()} unit="ug/m3"
            color={pahBreaching?C.red:predPAH>PAH_ELV*0.7?C.amber:C.teal}
            sub={`Stack est. ${estStackTemp.toFixed(1)}C | ELV ${PAH_ELV_SHORT_LABEL}`} />
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          {opNote} | Flow-corrected loading basis: {activeHrs.toFixed(0)} hrs effective from {chargeActiveHrs.toFixed(0)} raw charge hrs.
        </div>
      </Card>

      <Card style={{ borderLeft: "4px solid " + C.blue }}>
        <SectionTitle>Scheduling Dates (Central Estimate)</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill
            label="Predicted VOC Depletion"
            value={predictedDepletionDate}
            unit=""
            color={remainDays < 30 ? C.red : remainDays < 90 ? C.amber : C.blue}
            sub={"~" + remainDays + " days / " + remainHrs.toLocaleString() + " active hrs remaining"}
          />
          <StatPill
            label="Latest Stack Test Date"
            value={latestTestDate}
            unit=""
            color={latestTestDays < 14 ? C.red : latestTestDays < 30 ? C.amber : C.teal}
            sub={"Depletion minus " + preTestBufferDays + "-day buffer"}
          />
          <StatPill
            label="PAH Risk Onset (Climatological)"
            value={pahRiskOnsetDate || "Not in 365d horizon"}
            unit=""
            color={pahRiskOnsetDate ? C.amber : C.teal}
            sub={"Ambient >" + pahAmbientThresh.toFixed(1) + " deg C threshold at current hours"}
          />
        </div>
        <Fold title="How the scheduling dates are worked out">
        <div style={{ fontSize:12, color:C.muted, marginTop:8, lineHeight:1.5 }}>
          Scheduling dates are central-estimate predictions from the regression model, run day by day
          over Boston seasonal climatology (the same forecast as the Overview and Forward Forecast tabs).
          Uncertainty band x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} applies to the
          VOC depletion date. PAH risk onset uses Boston climatological monthly means
          and will differ from actual conditions. Use Forward Forecast tab for
          scenario-specific planning with live or manual temperature inputs.
        </div>
        </Fold>
      </Card>

      <Card>
        <SectionTitle>Remaining Life to Failure</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="VOC Safe Window" value={(vocRow ? Math.round(vocRow.activeHrs) : vocWindow).toLocaleString()} unit="hrs"
            color={C.blue} sub={vocRow ? `Bed total to VOC limit on the seasonal forecast (${vocWindow.toLocaleString()} hrs if ${ambientTemp.toFixed(1)}C held all year)` : `At ambient ${ambientTemp.toFixed(1)}C, RH${rh.toFixed(0)}%, nf=${(nf*100).toFixed(0)}%`} />
          <StatPill label="Hours Remaining" value={remainHrs.toLocaleString()} unit="hrs"
            color={remainHrs<200?C.red:remainHrs<500?C.amber:C.teal}
            sub={`~${remainDays} days at ${(settings.utilisationRate*100).toFixed(0)}% util`} />
          <StatPill label="Charges Remaining" value={chargesRemaining.toLocaleString()} unit=""
            color={chargesRemaining<20?C.red:chargesRemaining<50?C.amber:C.teal}
            sub={`Avg ${avgHrsPerCharge.toFixed(2)} hrs/charge`} />
          <StatPill label="PAH Status" value={pahBreaching?"BREACHING":"OK"} unit=""
            color={pahBreaching?C.red:C.teal}
            sub={`Threshold: ${pahThresh.toFixed(1)}C stack (~${((pahThresh - STACK_TEMP_A) / STACK_TEMP_B).toFixed(1)}C ambient (regression))`} />
        </div>
        {pahBreaching && (
          <div style={{ marginTop:12, padding:"10px 14px", background:TINT.redBg, border:`1px solid ${C.red}`, borderRadius:7, fontSize:12, color:TINT.redText, fontWeight:600 }}>
            WARNING: Estimated stack temperature ({estStackTemp.toFixed(1)}C) exceeds PAH ELV threshold ({pahThresh.toFixed(1)}C). PAH exceedance likely regardless of carbon age. Consider immediate changeout and temperature monitoring.
          </div>
        )}
        {chargeRatePer28d > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:C.muted }}>
            Rolling charge rate (last 28 days): {chargeRatePer28d.toFixed(1)} charges/day. Days remaining above use the seasonal forecast at the utilisation setting.
          </div>
        )}
        <Fold title="Safe window and the Wheeler-Jonas reference">
        <div style={{
          marginTop:10,
          padding:"9px 13px",
          background:C.surface2,
          border:`1px solid ${C.border}`,
          borderRadius:7,
          fontSize:12,
          color:C.muted,
          lineHeight:1.6
        }}>
          <strong style={{ color:C.ink }}>Compliance scheduling uses the VOC Safe Window figure only.</strong>
          {" "}The Wheeler-Jonas theoretical maximum is a steady-state upper bound derived from adsorption theory (Dubinin-Radushkevich/Polanyi). It has no calibrated relationship to any observed breakthrough event in the P1-P14 dataset. It is shown for engineering reference only and must not be used as the basis for carbon changeout scheduling or stack test deferral decisions.
        </div>
        </Fold>
        <Fold title="Wheeler-Jonas theoretical maximum (reference only)">
        <div style={{ marginTop:10, padding:"10px 14px", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:7, fontSize:12, color:C.muted, lineHeight:1.6 }}>
          Wheeler-Jonas theoretical estimate (engineering reference only): {wjBedLife.toLocaleString()} hrs at an assumed carbon-inlet VOC of {wjInlet} mg/m3 - not a compliance limit. The carbon-inlet concentration has not been measured; the figure scales inversely with it, so compare it with the regression safe window as a check on the inlet assumption, not on the bed. It must not be used as the basis for carbon changeout scheduling or stack test deferral.
          {latestCarbonBatch ? ` Current carbon batch ref: ${latestCarbonBatch.batchRef || latestCarbonBatch.date || "latest batch"} | iodine ${latestCarbonBatch.iodineMgG != null ? latestCarbonBatch.iodineMgG : "--"} mg/g | density ${latestCarbonBatch.densityKgM3 != null ? latestCarbonBatch.densityKgM3 : "--"} kg/m3.` : " No live carbon batch record available; default carbon properties applied."}
        </div>
        </Fold>
      </Card>

      <Card>
        <SectionTitle>Risk Assessment</SectionTitle>
        <div style={{ display:"flex", justifyContent:"space-around", alignItems:"flex-start", flexWrap:"wrap", gap:14 }}>
          <RiskGauge score={vRisk} label="VOC Risk" sub={`${predVOCBand.mid} mg/m3 (x${Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(1)} uncertainty)`} />
          <RiskGauge score={pRisk} label="PAH Risk" sub={`${predPAH.toLocaleString()} ug/m3 predicted`} />
          <RiskGauge score={combined} label="Combined" sub={`${Math.round(vocRiskWeight*100)}% VOC + ${Math.round(pahRiskWeight*100)}% PAH weighting`} />
        </div>
        <div style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:8 }}>
          {opNote} | Humidity factor: {hf.toFixed(3)} (RH {rh.toFixed(0)}%) | WJ nf: {(nf*100).toFixed(0)}% | DR/Polanyi ref capacity (theoretical): {(drPolanyi(opTemp,wjInlet,latestCarbonBatch)*1000).toFixed(1)} g/kg <span style={{ color:C.muted, fontSize:12 }}>[Not integrated into VOC regression pathway - engineering reference only]</span>
        </div>
        <div style={{ textAlign:"center", marginTop:8 }}>
          <button onClick={()=>setShowWeighting(v=>!v)} style={{ border:`1px solid ${C.border}`, background:C.surface2, color:C.blue, borderRadius:20, width:24, height:24, cursor:"pointer", fontWeight:800 }}>?</button>
        </div>
        {showWeighting && (
          <div style={{ fontSize:12, color:C.muted, marginTop:8, lineHeight:1.5 }}>
            VOC currently weighted at {Math.round(vocRiskWeight*100)}% and PAH at {Math.round(pahRiskWeight*100)}%. This reflects operational priority: VOC is the binding constraint in every season (P8 105 mg/m3, 5.25x ELV; summer 2026 bed peaked at 166 mg/m3 at P11). PAH has been within ELV in all winter/spring periods but exceeded at P4, P10, P11 and P12 when stack temperature was ~25C or above. Weighting is configurable in Settings.
          </div>
        )}
        <div style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:8 }}>
          WJ bed life is a theoretical maximum under steady-state inlet conditions. VOC regression safe window is the primary operational limit.
        </div>
      </Card>

      {!settings.useConservativeRH && (
        <div style={{ marginBottom:14, padding:"10px 14px", background:TINT.amberBg, border:`2px solid ${C.amber}`, borderRadius:8, fontSize:12, color:TINT.amberText, fontWeight:700, lineHeight:1.55 }}>
          SCHEDULING POSTURE: Conservative humidity mode is OFF. Predictions use measured/average RH ({Math.round(rawRh)}%). For BAT-aligned compliance scheduling, enable Conservative Humidity Mode in Settings (fixes RH at 90%). Boston, Lincolnshire night-time RH routinely exceeds 90% in autumn and winter.
        </div>
      )}

      <Card>
        <SectionTitle>Site Conditions {weather?"(Live - Open-Meteo)":"(Configured Defaults)"}</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Ambient Temp" value={ambientTemp.toFixed(1)} unit="C" />
          <StatPill label="Operative Temp" value={opTemp.toFixed(1)} unit="C" sub={`Ambient + ${stackTempCorrection.toFixed(1)}C correction`} />
          <StatPill label="Est Stack Temp" value={estStackTemp.toFixed(1)} unit="C" sub="0.685T + 13.5 (R2=0.92, excl. P2)" />
          <StatPill label="Humidity" value={rh.toFixed(0)} unit="% RH" />
          <StatPill label="Humidity Factor" value={hf.toFixed(3)} unit="" sub="Applied to VOC model" />
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          Calculated at T_operative = {opTemp.toFixed(1)}C (ambient {ambientTemp.toFixed(1)}C + {stackTempCorrection.toFixed(1)}C correction).
        </div>
      </Card>

      {vocC.r2 != null && vocC.r2 < 0.65 && (
        <div style={{ background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:8, padding:"12px 14px", marginBottom:16, fontSize:12 }}>
          <div style={{ color:C.amber, fontWeight:800, marginBottom:6 }}>VOC MODEL FIT WARNING: R2 = {vocC.r2.toFixed(3)} (n={vocC.n} independent periods)</div>
          <div style={{ color:TINT.amberText, lineHeight:1.6 }}>
            An R2 below 0.65 indicates the regression explains less than 65% of observed VOC variance. Breakthrough forecasts carry higher uncertainty than in a well-calibrated model. The widened uncertainty band (x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)}) reflects this. Predictions should be treated as order-of-magnitude guidance for scheduling purposes, not precise threshold forecasts. Add further certified stack test periods to improve calibration.
          </div>
        </div>
      )}

      <Card>
        <SectionTitle>VOC Breakthrough Forecast (with Uncertainty Band)</SectionTitle>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={forecastVOC} margin={{ top:5, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="hrs" label={{ value:"Cumulative Active Hours", position:"insideBottom", offset:-8, fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <YAxis label={{ value:"VOC mg/m3", angle:-90, position:"insideLeft", fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
            <ReferenceLine y={VOC_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"ELV 20", fill:C.red, fontSize:12 }} />
            <ReferenceLine x={activeHrs} stroke={C.gold} strokeDasharray="4 2" label={{ value:"Now", fill:C.gold, fontSize:12, position:"insideTopRight" }} />
            <Area type="monotone" dataKey="hi" stroke={C.amber} strokeWidth={1} strokeDasharray="4 2" fill={C.amber} fillOpacity={0.15} dot={false} name="Upper (x1SD)" />
            <Area type="monotone" dataKey="lo" stroke={C.blue} strokeWidth={1} strokeDasharray="4 2" fill={C.surface} fillOpacity={0.9} dot={false} name="Lower (x1SD)" />
            <Line type="monotone" dataKey="mid" stroke={C.rund} strokeWidth={2.5} dot={false} name="Predicted VOC" />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
          Shaded band = x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} uncertainty (effective RMSE in log space). R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"}. WJ nf={((nf||0.53)*100).toFixed(0)}% scales safe window (not prediction input). {opNote}.
        </div>
      </Card>

      <Card>
        <SectionTitle>System Downtime</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Logged Downtime This Period (hrs)" type="number" min={0}
            value={downtimeHrs} onChange={onDowntime} style={{ flex:1, minWidth:180, marginBottom:0 }} disabled={!canEdit} />
        </div>
        <Fold title="About fan running hours">
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          Fan running hours are auto-calculated as days since changeout x 24 hrs, minus
          logged downtime. Log any period when the extraction system was offline
          (maintenance, plant shutdown, power failure). Do not include normal operational
          pauses between charges.
        </div>
        </Fold>
        {!canEdit ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Viewer mode: downtime entry is locked.</div> : null}
      </Card>
    </div>
  );
}

// ============================================================
// CHARGE CYCLES TAB
// ============================================================
function parseChargeCsvText(text) {
  const rows = String(text || "").split(/\r?\n/).filter(line=>line.trim() !== "");
  if (rows.length < 2) return { ready:[], errors:["CSV has no data rows."] };
  const headers = rows[0].split(",").map(h=>h.trim().toLowerCase());
  const idx = name => headers.indexOf(name.toLowerCase());
  const dateIdx = idx("date"), typeIdx = idx("type"), countIdx = idx("count"), durIdx = idx("durationhrs"), notesIdx = idx("notes");
  const ready = [], errors = [];
  rows.slice(1).forEach((line, lineNo)=>{
    const cols = line.split(",").map(c=>c.trim());
    const rawDate = cols[dateIdx] || "";
    const date = rawDate.includes("/") ? rawDate.split("/").map(p=>p.padStart(2,"0")).reverse().join("-") : rawDate;
    const rawType = (cols[typeIdx] || "").toLowerCase();
    const type = normalizeChargeType(rawType);
    const count = parseInt(cols[countIdx], 10) || 1;
    const durationHrs = cols[durIdx] === "" || durIdx < 0 ? null : parseFloat(cols[durIdx]);
    if (!date || !type) {
      errors.push(`Line ${lineNo + 2}: missing/invalid date or type`);
      return;
    }
    if (durationHrs != null && durationHrs < 0) {
      errors.push(`Line ${lineNo + 2}: negative duration skipped`);
      return;
    }
    ready.push({ id:"csv-" + Date.now().toString(36) + "-" + lineNo + "-" + Math.random().toString(36).slice(2, 8), date, type, count, durationHrs:Number.isFinite(durationHrs)?durationHrs:null, notes:notesIdx >= 0 ? cols[notesIdx] || "" : "", source:"csv" });
  });
  return { ready, errors };
}

function parseTestoCsvText(text) {
  var lines = String(text || "").split(/\r?\n/).filter(function(l) {
    return l.trim() !== "";
  });
  if (lines.length < 2) return { rows: [], errors: ["File has no data rows."] };

  var delimiter = lines[0].indexOf(";") >= 0 ? ";" : ",";

  var headers = lines[0].split(delimiter).map(function(h) {
    return h.trim().toLowerCase().replace(/[\[\]()]/g, "").replace(/degrees\s*c/g, "c").replace(/\s+/g, "");
  });

  function findIdx(candidates) {
    for (var ci = 0; ci < candidates.length; ci++) {
      for (var hi = 0; hi < headers.length; hi++) {
        if (headers[hi].indexOf(candidates[ci]) >= 0) return hi;
      }
    }
    return -1;
  }

  var dateIdx = findIdx(["date"]);
  var timeIdx = findIdx(["time"]);
  var ch1Idx = findIdx(["t1", "ch1", "channel1", "inlet", "t1c"]);
  var ch2Idx = findIdx(["t2", "ch2", "channel2", "outlet", "t2c"]);
  var ch3Idx = findIdx(["t3", "ch3", "channel3", "ambient", "t3c"]);

  if (dateIdx < 0) return { rows: [], errors: ["Cannot find date column in Testo CSV."] };
  if (ch1Idx < 0 || ch3Idx < 0) {
    return { rows: [], errors: ["Cannot map Ch1 (inlet) or Ch3 (ambient). Check column headers."] };
  }

  function parseTemp(raw) {
    if (!raw || raw.trim() === "" || raw.trim() === "---" || raw.trim() === "--") return null;
    var s = raw.trim().replace(",", ".");
    var n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function parseDate(raw) {
    var s = raw.trim();
    var m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return s;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
    return null;
  }

  function parseTime(raw) {
    var s = (raw || "").trim();
    var m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) return m[1].padStart(2, "0") + ":" + m[2];
    return "00:00";
  }

  var rawRows = [];
  var errors = [];
  for (var i = 1; i < lines.length; i++) {
    var cols = lines[i].split(delimiter);
    var rawDate = cols[dateIdx] || "";
    var rawTime = timeIdx >= 0 ? (cols[timeIdx] || "") : "";
    var dateStr = parseDate(rawDate);
    if (!dateStr) {
      errors.push("Line " + (i + 1) + ": unrecognised date format '" + rawDate + "'");
      continue;
    }
    var timeStr = parseTime(rawTime);
    var ch1 = parseTemp(cols[ch1Idx]);
    var ch2 = ch2Idx >= 0 ? parseTemp(cols[ch2Idx]) : null;
    var ch3 = parseTemp(cols[ch3Idx]);
    rawRows.push({ dateStr: dateStr, timeStr: timeStr, ch1: ch1, ch2: ch2, ch3: ch3 });
  }

  if (rawRows.length === 0) return { rows: [], errors: errors.length ? errors : ["No valid rows parsed."] };

  var buckets = {};
  rawRows.forEach(function(r) {
    var hour = r.timeStr.slice(0, 2);
    var key = r.dateStr + "T" + hour + ":00";
    if (!buckets[key]) buckets[key] = { ch1s: [], ch2s: [], ch3s: [] };
    if (r.ch1 != null) buckets[key].ch1s.push(r.ch1);
    if (r.ch2 != null) buckets[key].ch2s.push(r.ch2);
    if (r.ch3 != null) buckets[key].ch3s.push(r.ch3);
  });

  function mean(arr) {
    if (!arr.length) return null;
    var s = arr.reduce(function(a, v) { return a + v; }, 0);
    return Math.round((s / arr.length) * 10) / 10;
  }

  var rows = Object.keys(buckets).sort().map(function(key) {
    var b = buckets[key];
    return {
      timestamp: key,
      preBedTemp: mean(b.ch1s),
      postBedTemp: mean(b.ch2s),
      ambientTemp: mean(b.ch3s),
      source: "logger",
    };
  });

  return { rows: rows, errors: errors, rawCount: rawRows.length };
}

function ChargeCyclesTab({ chargeLog, onAddCharge, onAddCharges, onDeleteCharge, lastChangeout, settings, vocC, canEdit }) {
  const [form, setForm] = useState({ date:new Date().toISOString().slice(0,10), type:"plant1", count:1, durationHrs:"", notes:"" });
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvStatus, setCsvStatus] = useState("");
  const currentPeriodChargeLog = useMemo(()=>filterChargeLogSince(chargeLog, lastChangeout), [chargeLog, lastChangeout]);

  const plant1Count = currentPeriodChargeLog.filter(c=>normalizeChargeType(c.type)==="plant1").reduce((a,c)=>a+(c.count||1),0);
  const plant2Count = currentPeriodChargeLog.filter(c=>normalizeChargeType(c.type)==="plant2").reduce((a,c)=>a+(c.count||1),0);
  const plant1Hrs   = currentPeriodChargeLog.filter(c=>normalizeChargeType(c.type)==="plant1").reduce((a,c)=>a+(c.durationHrs||P1_AVG_HRS)*(c.count||1),0);
  const plant2Hrs   = currentPeriodChargeLog.filter(c=>normalizeChargeType(c.type)==="plant2").reduce((a,c)=>a+(c.durationHrs||P2_AVG_HRS)*(c.count||1),0);
  const totalActiveHrs = Math.round((plant1Hrs+plant2Hrs)*10)/10;
  const effectiveActiveHrs = calcEffectiveHours(totalActiveHrs, lastChangeout, isoDateFromDate(new Date()));
  const stackTempCorrection = settings.stackTempCorrectionC ?? 10.3;
  const vocWindow = safeWindowHoursVOC(settings.typicalTempC, settings.typicalRH, vocC, settings.naphthaleneFrac);
  const remainHrs = Math.max(0, vocWindow - effectiveActiveHrs);
  const avgHrsPerCharge = (plant1Count+plant2Count) > 0 ? totalActiveHrs/(plant1Count+plant2Count) : (P1_AVG_HRS+P2_AVG_HRS)/2;
  const chargesRemaining = avgHrsPerCharge > 0 ? Math.max(0, Math.floor(remainHrs/avgHrsPerCharge)) : 0;

  const cumulChart = useMemo(()=>{
    const sorted = [...currentPeriodChargeLog].sort((a,b)=>a.date.localeCompare(b.date));
    let cum=0;
    const cMs = new Date(lastChangeout).getTime();
    return sorted.map(c=>{
      const plantType = normalizeChargeType(c.type);
      const hrs=(c.durationHrs||(plantType==="plant1"?P1_AVG_HRS:P2_AVG_HRS))*(c.count||1);
      cum+=hrs;
      return { day:Math.floor((new Date(c.date).getTime()-cMs)/86400000), cumHrs:Math.round(cum*10)/10 };
    });
  },[currentPeriodChargeLog,lastChangeout]);

  const weeklyData = useMemo(()=>{
    const byWeek={};
    currentPeriodChargeLog.forEach(c=>{
      const d=new Date(c.date), ws=new Date(d);
      ws.setDate(d.getDate()-d.getDay()+1);
      const k=ws.toISOString().slice(0,10);
      if(!byWeek[k]) byWeek[k]={week:k,plant1:0,plant2:0,hrs:0};
      const plantType = normalizeChargeType(c.type);
      const cnt=c.count||1, hrs=(c.durationHrs||(plantType==="plant1"?P1_AVG_HRS:P2_AVG_HRS))*cnt;
      if(plantType==="plant1") byWeek[k].plant1+=cnt; else byWeek[k].plant2+=cnt;
      byWeek[k].hrs+=Math.round(hrs*10)/10;
    });
    return Object.values(byWeek).sort((a,b)=>a.week.localeCompare(b.week));
  },[currentPeriodChargeLog]);

  const handleAdd = ()=>{
    if(!form.date) return;
    onAddCharge({ id:Date.now(), date:form.date, type:form.type, count:parseInt(form.count)||1, durationHrs:form.durationHrs!==""?parseFloat(form.durationHrs):null, notes:form.notes });
    setForm(f=>({...f, count:1, durationHrs:"", notes:""}));
  };

  const handleCsvFile = file => {
    if (!canEdit) {
      setCsvStatus("Viewer mode: charge import is disabled.");
      return;
    }
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseChargeCsvText(reader.result);
      setCsvPreview(parsed);
      setCsvStatus(`${parsed.ready.length} records ready to import, ${parsed.errors.length} skipped (errors)`);
    };
    reader.readAsText(file);
  };
  const downloadCsvTemplate = () => {
    const csv = "date,type,count,durationHrs,notes\n2026-06-08,plant1,1,5.85,example plant 1\n2026-06-09,plant2,1,7.84,example plant 2\n2026-06-10,p1,2,,uses plant average\n";
    const url = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "charge-log-template.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Card>
        <SectionTitle>Current Period Summary (Since {lastChangeout})</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Total Charges" value={plant1Count+plant2Count} unit="" sub="All plants" />
          <StatPill label="Plant 1" value={plant1Count} unit="" sub={`${plant1Hrs.toFixed(0)} hrs`} />
          <StatPill label="Plant 2" value={plant2Count} unit="" sub={`${plant2Hrs.toFixed(0)} hrs`} />
          <StatPill label="Active Hrs" value={totalActiveHrs.toFixed(0)} unit="hrs" color={totalActiveHrs>vocWindow?C.red:C.teal} sub="From charge log" />
          <StatPill label="Charges Remaining" value={chargesRemaining} unit=""
            color={chargesRemaining<20?C.red:chargesRemaining<50?C.amber:C.teal}
            sub={`~${avgHrsPerCharge.toFixed(2)} hrs/charge avg`} />
        </div>
        <div style={{ marginTop:10, fontSize:12, color:C.muted, background:C.ivory, padding:"10px 14px", borderRadius:7 }}>
          Plant averages (P1-P8 analysis): Plant 1 avg {P1_AVG_HRS} hrs/charge (all product types) | Plant 2 avg {P2_AVG_HRS} hrs/charge (all product types). Derived from full 1,519-charge timestamp analysis.
          Override per entry if actual duration is available. {operativeTempNote(settings.typicalTempC, stackTempCorrection)}. Flow-corrected scheduling basis: {effectiveActiveHrs.toFixed(0)} effective hrs from {totalActiveHrs.toFixed(0)} raw hrs.
        </div>
      </Card>

      {cumulChart.length > 1 && (
        <Card>
          <SectionTitle>Cumulative Active Hours</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cumulChart} margin={{ top:5, right:20, bottom:18, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="day" type="number" domain={[0, "dataMax"]} allowDecimals={false} label={{ value:"Days since changeout", position:"insideBottom", offset:-8, fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
              <YAxis label={{ value:"Cumul. hrs", angle:-90, position:"insideLeft", fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
              <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
              <ReferenceLine y={vocWindow} stroke={C.red} strokeDasharray="5 3" label={{ value:"VOC window", fill:C.red, fontSize:12 }} />
              <Area type="monotone" dataKey="cumHrs" fill={alpha(C.rund,15)} stroke={C.rund} strokeWidth={2} name="Cumulative Active Hrs" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {weeklyData.length > 0 && (
        <Card>
          <SectionTitle>Weekly Charge Activity</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyData} margin={{ top:5, right:20, bottom:18, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="week" tick={{ fontSize:12, fill:C.ink }} />
              <YAxis yAxisId="c" tick={{ fontSize:12, fill:C.ink }} />
              <YAxis yAxisId="h" orientation="right" tick={{ fontSize:12, fill:C.ink }} />
              <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
              <Legend />
              <Bar yAxisId="c" dataKey="plant1" fill={C.rund} name="Plant 1" stackId="a" />
              <Bar yAxisId="c" dataKey="plant2" fill={C.blue} name="Plant 2" stackId="a" />
              <Line yAxisId="h" type="monotone" dataKey="hrs" stroke={C.gold} strokeWidth={2} dot={false} name="Active hrs" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <SectionTitle>CSV Charge Import</SectionTitle>
        <div onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleCsvFile(e.dataTransfer.files[0]);}}
          style={{ border:`2px dashed ${C.border}`, borderRadius:10, padding:"20px", textAlign:"center", background:C.ivory }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>Drag charge CSV here or browse</div>
          <input id="chargeCsvFile" type="file" accept=".csv,text/csv" disabled={!canEdit} style={{ display:"none" }} onChange={e=>handleCsvFile(e.target.files[0])} />
          <label htmlFor="chargeCsvFile" style={{ cursor:canEdit?"pointer":"not-allowed", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${canEdit?C.rund:C.border}`, color:canEdit?C.rund:C.muted, fontWeight:700, fontSize:12, opacity:canEdit?1:0.7 }}>Browse CSV</label>
          <button onClick={downloadCsvTemplate} style={{ marginLeft:10, border:"none", background:"transparent", color:C.blue, cursor:"pointer", fontSize:12, fontWeight:700 }}>Download template CSV</button>
        </div>
        {csvStatus && <div style={{ marginTop:10, fontSize:12, color:C.blue, fontWeight:700 }}>{csvStatus}</div>}
        {csvPreview && (
          <div style={{ marginTop:12 }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead><tr>{["Date","Plant","Count","Hrs/charge","Total hrs"].map(h=><th key={h} style={{ textAlign:"left", padding:"5px 7px", color:C.muted }}>{h}</th>)}</tr></thead>
                <tbody>{csvPreview.ready.slice(0,10).map(r=>{
                  const avg = r.type==="plant1"?P1_AVG_HRS:P2_AVG_HRS;
                  const dur = r.durationHrs || avg;
                  return <tr key={r.id} style={{ borderTop:`1px solid ${C.border}` }}><td style={{ padding:"5px 7px" }}>{r.date}</td><td style={{ padding:"5px 7px" }}>{r.type}</td><td style={{ padding:"5px 7px" }}>{r.count}</td><td style={{ padding:"5px 7px" }}>{dur.toFixed(2)}</td><td style={{ padding:"5px 7px" }}>{(dur*r.count).toFixed(2)}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {csvPreview.errors.length > 0 && <div style={{ marginTop:8, fontSize:12, color:C.red }}>{csvPreview.errors.join(" | ")}</div>}
            <div style={{ marginTop:10, display:"flex", gap:8 }}>
              <Btn onClick={()=>{onAddCharges(csvPreview.ready); const p1=csvPreview.ready.filter(r=>r.type==="plant1").reduce((s,r)=>s+r.count,0); const p2=csvPreview.ready.filter(r=>r.type==="plant2").reduce((s,r)=>s+r.count,0); const th=csvPreview.ready.reduce((s,r)=>s+(r.durationHrs||(r.type==="plant1"?P1_AVG_HRS:P2_AVG_HRS))*r.count,0); setCsvStatus(`Imported ${csvPreview.ready.length} charges (${p1} Plant 1, ${p2} Plant 2, ${th.toFixed(1)} active hrs)`); setCsvPreview(null);}} variant="rund" disabled={!canEdit}>Import All</Btn>
              <Btn onClick={()=>setCsvPreview(null)} variant="ghost">Cancel</Btn>
            </div>
          </div>
        )}
        {!canEdit ? <div style={{ marginTop:10, fontSize:12, color:C.muted }}>Viewer mode: CSV import is disabled.</div> : null}
      </Card>

      <Card>
        <SectionTitle>Log Charges</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap:12, alignItems:"end" }}>
          <Input label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} style={{ marginBottom:0 }} disabled={!canEdit} />
          <div style={{ marginBottom:0 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5, lineHeight:1.2 }}>Plant / Type</label>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} disabled={!canEdit}
              style={{ width:"100%", height:38, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:canEdit?C.surface2:C.surface3, color:canEdit?C.ink:C.muted, boxSizing:"border-box", cursor:canEdit?"pointer":"not-allowed" }}>
              <option value="plant1">Plant 1</option>
              <option value="plant2">Plant 2</option>
            </select>
          </div>
          <Input label="No. Charges" type="number" min={1} step={1} value={form.count} onChange={v=>setForm(f=>({...f,count:v}))} style={{ marginBottom:0 }} disabled={!canEdit} />
          <Input label="Duration hrs" type="number" step={0.25} value={form.durationHrs} onChange={v=>setForm(f=>({...f,durationHrs:v}))} style={{ marginBottom:0 }} disabled={!canEdit} />
          <Input label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} style={{ marginBottom:0 }} disabled={!canEdit} />
        </div>
        <div style={{ marginTop:10 }}>
          <Btn onClick={handleAdd} variant="rund" disabled={!canEdit}>Log Charge(s)</Btn>
          <span style={{ fontSize:12, color:C.muted, marginLeft:14 }}>No duration = plant average ({form.type==="plant1"?P1_AVG_HRS:P2_AVG_HRS} hrs/charge)</span>
        </div>
      </Card>

      {chargeLog.length > 0 && <ChargeLogCard chargeLog={chargeLog} onDeleteCharge={onDeleteCharge} canEdit={canEdit} />}
    </div>
  );
}

// Charge records: the full log stays in the platform state, but the page shows a
// monthly summary and keeps individual records behind a filtered, paged view.
function ChargeLogCard({ chargeLog, onDeleteCharge, canEdit }) {
  const [open, setOpen] = useState(false);
  const [monthsShown, setMonthsShown] = useState(6);
  const [filterMonth, setFilterMonth] = useState("");
  const [page, setPage] = useState(0);
  const PAGE = 25;
  const rows = useMemo(() => (chargeLog || []).slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))), [chargeLog]);
  const months = useMemo(() => {
    const map = new Map();
    rows.forEach(r => {
      const k = String(r.date).slice(0,7);
      if (!map.has(k)) map.set(k, { month:k, p1:0, p2:0, hrs:0 });
      const m = map.get(k);
      const t = normalizeChargeType(r.type);
      const n = r.count || 1;
      if (t === "plant1") m.p1 += n; else m.p2 += n;
      m.hrs += (r.durationHrs || (t === "plant1" ? P1_AVG_HRS : P2_AVG_HRS)) * n;
    });
    return [...map.values()].sort((a,b)=>b.month.localeCompare(a.month));
  }, [rows]);
  const filtered = filterMonth ? rows.filter(r => String(r.date).startsWith(filterMonth)) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const th = { textAlign:"left", padding:"8px 10px", fontSize:12, fontWeight:600, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", borderBottom:`1px solid ${C.border}` };
  const td = { padding:"8px 10px", borderBottom:`1px solid ${C.border}`, fontSize:13 };
  const first = rows.length ? rows[rows.length - 1].date : "--";
  const last = rows.length ? rows[0].date : "--";
  const monthLabel = k => MONTH_NAMES[Number(k.slice(5,7)) - 1] + " " + k.slice(0,4);

  return (
    <Card>
      <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"baseline", gap:10, marginBottom:12 }}>
        <SectionTitle>Charge records</SectionTitle>
        <div style={{ fontSize:13, color:C.muted }}>{rows.length.toLocaleString("en-GB")} records - {first} to {last}</div>
      </div>
      <div style={{ overflowX:"auto" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:520 }}>
          <thead><tr><th style={th}>Month</th><th style={th}>Plant 1 charges</th><th style={th}>Plant 2 charges</th><th style={th}>Active hours</th><th style={th}></th></tr></thead>
          <tbody>
            {months.slice(0, monthsShown).map(m => (
              <tr key={m.month}>
                <td style={{ ...td, fontWeight:600 }}>{monthLabel(m.month)}</td>
                <td style={{ ...td, fontFamily:MONO }}>{m.p1}</td>
                <td style={{ ...td, fontFamily:MONO }}>{m.p2}</td>
                <td style={{ ...td, fontFamily:MONO }}>{m.hrs.toFixed(1)}</td>
                <td style={{ ...td, textAlign:"right" }}>
                  <button type="button" onClick={()=>{ setFilterMonth(m.month); setPage(0); setOpen(true); }} style={{ background:"none", border:"none", color:C.rund, cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"inherit" }}>View records</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginTop:12 }}>
        {months.length > monthsShown ? <Btn small variant="ghost" onClick={()=>setMonthsShown(n=>n + 12)}>Show earlier months</Btn> : null}
        <Btn small variant={open ? "ghost" : "primary"} onClick={()=>{ setOpen(o=>!o); setFilterMonth(""); setPage(0); }}>{open ? "Hide individual records" : "Show individual records"}</Btn>
      </div>
      {open ? (
        <div style={{ marginTop:16 }}>
          <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10, marginBottom:10 }}>
            <label style={{ fontSize:12, color:C.muted }}>Month
              <select value={filterMonth} onChange={e=>{ setFilterMonth(e.target.value); setPage(0); }} style={{ marginLeft:8, height:34, borderRadius:8, border:`1px solid ${C.border}`, padding:"0 8px", fontFamily:"inherit" }}>
                <option value="">All months</option>
                {months.map(m => <option key={m.month} value={m.month}>{monthLabel(m.month)}</option>)}
              </select>
            </label>
            <span style={{ fontSize:12, color:C.muted }}>{filtered.length} records - page {page + 1} of {pages}</span>
            <Btn small variant="ghost" disabled={page === 0} onClick={()=>setPage(p=>Math.max(0, p - 1))}>Newer</Btn>
            <Btn small variant="ghost" disabled={page >= pages - 1} onClick={()=>setPage(p=>Math.min(pages - 1, p + 1))}>Older</Btn>
          </div>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", minWidth:640 }}>
              <thead><tr>{["Date","Plant","Charges","Hrs/charge","Total hrs","Notes",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {pageRows.map(row => {
                  const plantType = normalizeChargeType(row.type);
                  const avg = plantType === "plant1" ? P1_AVG_HRS : P2_AVG_HRS;
                  const dur = row.durationHrs || avg;
                  return (
                    <tr key={row.id}>
                      <td style={{ ...td, fontFamily:MONO }}>{row.date}</td>
                      <td style={td}><Badge text={plantType === "plant1" ? "Plant 1" : "Plant 2"} color={plantType === "plant1" ? C.rund : C.blue} /></td>
                      <td style={{ ...td, fontFamily:MONO }}>{row.count || 1}</td>
                      <td style={{ ...td, fontFamily:MONO }}>{row.durationHrs ? row.durationHrs.toFixed(2) : "~" + avg + " (avg)"}</td>
                      <td style={{ ...td, fontFamily:MONO, fontWeight:600 }}>{(dur * (row.count || 1)).toFixed(2)}</td>
                      <td style={{ ...td, color:C.muted, fontSize:12 }}>{row.notes || ""}</td>
                      <td style={td}>
                        <button type="button" aria-label={"Delete charge record " + row.date} onClick={()=>onDeleteCharge(row.id)} disabled={!canEdit} style={{ background:"none", border:"none", cursor:canEdit ? "pointer" : "not-allowed", color:C.red, fontWeight:600, fontSize:13, opacity:canEdit ? 1 : 0.45, fontFamily:"inherit" }}>Delete</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Could not load PDF parser"));
    document.head.appendChild(script);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

function cleanPdfText(text) {
  return text.replace(/\s+/g, " ").replace(/,/g, "").trim();
}

function parsePdfNumber(value) {
  if (value == null) return "";
  const n = parseFloat(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : "";
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function parseStackPdfText(rawText, nextPeriod) {
  const text = cleanPdfText(rawText);
  const dateText = firstMatch(text, [
    /\b(?:test|sampling|sample|monitoring)\s+date\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /\bdate\s+of\s+(?:test|sampling|monitoring)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /\b(\d{4}-\d{2}-\d{2})\b/,
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
  ]);
  const date = (() => {
    if (!dateText) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return dateText;
    const parts = dateText.split(/[\/\-]/).map(p => p.padStart(2, "0"));
    if (parts.length !== 3) return "";
    const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
    return `${year}-${parts[1]}-${parts[0]}`;
  })();

  const period = firstMatch(text, [
    /\b(?:period|sample|run)\s*(P?\d+)\b/i,
    /\b(P\d+)\b/i,
  ]);

  return {
    period: period && /^P?\d+$/i.test(period) ? period.toUpperCase().replace(/^(\d)/, "P$1") : nextPeriod,
    date,
    activeHrs: parsePdfNumber(firstMatch(text, [
      /\bactive\s+(?:treatment\s+)?hours?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /\bcumulative\s+(?:active\s+)?hours?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    ])),
    avgTemp: parsePdfNumber(firstMatch(text, [
      /\b(?:ambient|external|outside)\s+(?:air\s+)?temp(?:erature)?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /\baverage\s+ambient\s+(?:temp|temperature)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    ])),
    stackTemp: parsePdfNumber(firstMatch(text, [
      /\b(?:stack|gas|inlet)\s+(?:temp|temperature)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
      /\btemperature\s+at\s+(?:stack|inlet|sample\s+point)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    ])),
    avgRH: parsePdfNumber(firstMatch(text, [
      /\b(?:relative\s+humidity|humidity|RH)\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    ])),
    voc: parsePdfNumber(firstMatch(text, [
      /\b(?:TVOC|VOC|total\s+VOC)[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)\s*(?:mg\/?m3|mg\/?m3|mg\s*m-3)/i,
      /\b([0-9]+(?:\.[0-9]+)?)\s*(?:mg\/?m3|mg\/?m3|mg\s*m-3)[^A-Za-z0-9]{0,20}(?:TVOC|VOC|total\s+VOC)/i,
    ])),
    pah: parsePdfNumber(firstMatch(text, [
      /\b(?:total\s+PAH|PAH)[^0-9]{0,40}([0-9]+(?:\.[0-9]+)?)\s*(?:ug\/?m3|ug\/?m3|ug\/?m3|ug\/?m3|ug\s*m-3)/i,
      /\b([0-9]+(?:\.[0-9]+)?)\s*(?:ug\/?m3|ug\/?m3|ug\/?m3|ug\/?m3|ug\s*m-3)[^A-Za-z0-9]{0,20}(?:total\s+PAH|PAH)/i,
    ])),
    charges: parsePdfNumber(firstMatch(text, [
      /\b(?:total\s+)?charges?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    ])),
    p1Charges: parsePdfNumber(firstMatch(text, [
      /\b(?:fencing|plant\s*1)[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)\s+charges?/i,
    ])),
    p2Charges: parsePdfNumber(firstMatch(text, [
      /\b(?:poles|plant\s*2)[^0-9]{0,20}([0-9]+(?:\.[0-9]+)?)\s+charges?/i,
    ])),
  };
}

// ============================================================
// STACK TESTS TAB
// ============================================================
function StackTestsTab({ stackData, onAdd, settings, onArchiveDocument, canArchiveDocuments, canEdit, lastChangeout }) {
  const [form, setForm] = useState({ period:"", date:"", activeHrs:"", avgTemp:"", stackTemp:"", avgRH:"", voc:"", pah:"", charges:"", p1Charges:"", p2Charges:"", flowRate_m3hr:"", dropletFalloutObserved:"" });
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const missingPah = getMostRecentPeriodWithMissingPAH(stackData);

  const nextPeriod = useMemo(() => {
    const max = stackData.reduce((m,d) => {
      const n = parseInt(String(d.period || "").replace(/\D/g, ""), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 0);
    return `P${max + 1}`;
  }, [stackData]);

  const handleStackPdf = useCallback(async (file) => {
    if (!file || file.type !== "application/pdf") {
      setPdfStatus("PDF files only.");
      return;
    }
    if (!canEdit) {
      setPdfStatus("Viewer mode: stack test import is disabled.");
      return;
    }
    setPdfImporting(true);
    setPdfStatus("Reading stack test PDF...");
    try {
      const base64 = await fileToBase64(file);
      let archiveNotice = "";
      if (canArchiveDocuments && onArchiveDocument) {
        try {
          await onArchiveDocument({
            category: "stack-test-pdf",
            fileName: file.name,
            mimeType: file.type || "application/pdf",
            base64,
            notes: "Original MCERTS stack test PDF retained from browser import.",
          });
          archiveNotice = " PDF archived to server.";
        } catch (archiveError) {
          archiveNotice = ` Archive failed: ${archiveError.message}.`;
        }
      }
      setPdfStatus("Extracting stack report on server...");
      const data = await platformRequest("/api/extract/stack-test", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          base64,
          nextPeriod,
        }),
      });
      const parsedAi = data.extracted || {};
      const extracted = Object.fromEntries(Object.entries(parsedAi).map(([k,v])=>[k, v == null ? "" : String(v)]));
      if (!extracted.period) extracted.period = nextPeriod;
      setForm(f => ({ ...f, ...extracted }));
      const missing = [
        ["date","date"], ["activeHrs","active hours"], ["avgTemp","ambient temp"],
        ["stackTemp","stack temp"], ["avgRH","RH"], ["voc","VOC"], ["pah","PAH"],
      ].filter(([key]) => extracted[key] === "").map(([,label]) => label);
      setPdfStatus(missing.length
        ? `Extracted PDF fields. Review before adding; missing: ${missing.join(", ")}.${archiveNotice}`
        : `Extracted PDF fields. Review, then click Add and Recalibrate Both Models.${archiveNotice}`);
    } catch (error) {
      setPdfStatus("Import failed: " + error.message);
    }
    setPdfImporting(false);
  }, [canArchiveDocuments, canEdit, nextPeriod, onArchiveDocument]);

  const handleAdd = ()=>{
    if(!form.period||!form.date) return;
    onAdd({ period:form.period, date:form.date, activeHrs:parseFloat(form.activeHrs)||0, avgTemp:parseFloat(form.avgTemp)||0, stackTemp:form.stackTemp!==""?parseFloat(form.stackTemp):null, avgRH:parseFloat(form.avgRH)||75, voc:form.voc!==""?parseFloat(form.voc):null, pah:form.pah!==""?parseFloat(form.pah):null, charges:parseInt(form.charges)||0, p1Charges:parseInt(form.p1Charges)||0, p2Charges:parseInt(form.p2Charges)||0, flowRate_m3hr:form.flowRate_m3hr!==""?parseFloat(form.flowRate_m3hr):null, dropletFalloutObserved:form.dropletFalloutObserved==="pass"?true:form.dropletFalloutObserved==="fail"?false:null });
    setForm({ period:"", date:"", activeHrs:"", avgTemp:"", stackTemp:"", avgRH:"", voc:"", pah:"", charges:"", p1Charges:"", p2Charges:"", flowRate_m3hr:"", dropletFalloutObserved:"" });
  };

  return (
    <div>
      <MissingPAHBanner period={missingPah} />
      <Card>
        <SectionTitle>Adding a stack test</SectionTitle>
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>
          Add each new MCERTS stack test here, by importing the report PDF or typing the results in. Adding a test recalibrates the forecast straight away. Results and charts are on the Compliance tab.
        </div>
        <div style={{ marginTop:10, padding:"10px 12px", background:TINT.blueBg, border:`1px solid ${C.blue}`, borderRadius:7, fontSize:12, color:TINT.blueText, lineHeight:1.6 }}>
          Note: All VOC and PAH stack test data in this application is scoped to Emission Point A4 (Creosote Impregnation Plant) only, per Permit EPR/A2/1 Schedule 4, Table 4.1. Emission Point A1 (Combustion Stack) carries an independent VOC limit of 20 mg/Nm3 from a different source and is NOT included in this dataset.
        </div>
      </Card>

      <Card>
        <SectionTitle>Import Stack Test PDF (Auto-Extract)</SectionTitle>
        <div onDragOver={e=>{e.preventDefault();setPdfDragOver(true);}} onDragLeave={()=>setPdfDragOver(false)}
          onDrop={e=>{e.preventDefault();setPdfDragOver(false);handleStackPdf(e.dataTransfer.files[0]);}}
          style={{ border:`2px dashed ${pdfDragOver?C.rund:C.border}`, borderRadius:10, padding:"24px 20px", textAlign:"center", background:pdfDragOver?alpha(C.rund,3):C.ivory, transition:"all 0.2s" }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>
            {pdfImporting ? pdfStatus : "Drag MCERTS stack test PDF here or browse"}
          </div>
          <input type="file" accept=".pdf" id="stackPdfFile" disabled={!canEdit} style={{ display:"none" }} onChange={e=>handleStackPdf(e.target.files[0])} />
          <label htmlFor="stackPdfFile" style={{ cursor:canEdit?"pointer":"not-allowed", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${canEdit?C.rund:C.border}`, color:canEdit?C.rund:C.muted, fontWeight:700, fontSize:12, opacity:canEdit?1:0.7 }}>Browse PDF</label>
          {pdfStatus && <div style={{ fontSize:12, color:pdfImporting?C.amber:pdfStatus.startsWith("Import failed")||pdfStatus.startsWith("PDF files")?C.red:C.teal, marginTop:10 }}>{pdfStatus}</div>}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          Extracts period, test date, active hours, charges, ambient/stack temperature, RH, TVOC and total PAH where present. Review the populated fields before recalibrating.
        </div>
        {!canEdit ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Viewer mode: stack test import and manual entry are locked.</div> : null}
      </Card>

      <Card>
        <SectionTitle>Add Stack Test Result</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Period"        value={form.period}         onChange={v=>setForm(f=>({...f,period:v}))}         style={{ flex:"1 1 70px"  }} disabled={!canEdit} />
          <Input label="Date"     type="date" value={form.date}   onChange={v=>setForm(f=>({...f,date:v}))}           style={{ flex:"1 1 140px" }} disabled={!canEdit} />
          <Input label="Active Hrs" type="number" value={form.activeHrs}   onChange={v=>setForm(f=>({...f,activeHrs:v}))}   style={{ flex:"1 1 90px"  }} disabled={!canEdit} />
          <Input label="Charges"    type="number" value={form.charges}     onChange={v=>setForm(f=>({...f,charges:v}))}     style={{ flex:"1 1 80px"  }} disabled={!canEdit} />
          <Input label="Plant 1"    type="number" value={form.p1Charges} onChange={v=>setForm(f=>({...f,p1Charges:v}))} style={{ flex:"1 1 70px"  }} disabled={!canEdit} />
          <Input label="Plant 2"    type="number" value={form.p2Charges} onChange={v=>setForm(f=>({...f,p2Charges:v}))} style={{ flex:"1 1 70px"  }} disabled={!canEdit} />
          <Input label="Amb Temp C" type="number" step="0.1" value={form.avgTemp}   onChange={v=>setForm(f=>({...f,avgTemp:v}))}   style={{ flex:"1 1 90px"  }} disabled={!canEdit} />
          <Input label="Stack Temp C" type="number" step="0.1" placeholder="MCERTS header" value={form.stackTemp} onChange={v=>setForm(f=>({...f,stackTemp:v}))} style={{ flex:"1 1 100px" }} disabled={!canEdit} />
          <Input label="Avg RH %"   type="number" value={form.avgRH}       onChange={v=>setForm(f=>({...f,avgRH:v}))}       style={{ flex:"1 1 70px"  }} disabled={!canEdit} />
          <Input label="VOC mg/m3"  type="number" step="0.1" value={form.voc}  onChange={v=>setForm(f=>({...f,voc:v}))}       style={{ flex:"1 1 90px"  }} disabled={!canEdit} />
          <Input label="PAH ug/m3"  type="number" step="0.1" value={form.pah}  onChange={v=>setForm(f=>({...f,pah:v}))}       style={{ flex:"1 1 90px"  }} disabled={!canEdit} />
          <Input label="Stack Discharge Flow (m3/hr) - from report" type="number" step="1" value={form.flowRate_m3hr} onChange={v=>setForm(f=>({...f, flowRate_m3hr:v}))} style={{ flex:"1 1 180px" }} disabled={!canEdit} />
          <div style={{ flex:"1 1 220px" }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>A4 Liquid Droplets Fallout</label>
            <select value={form.dropletFalloutObserved} onChange={e=>setForm(f=>({...f, dropletFalloutObserved:e.target.value}))} disabled={!canEdit} style={{ width:"100%", height:38, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:C.surface2, color:C.ink, boxSizing:"border-box" }}>
              <option value="">Not Recorded</option>
              <option value="pass">Pass - Free from liquid droplet fallout confirmed</option>
              <option value="fail">Fail - Droplet fallout observed</option>
            </select>
          </div>
        </div>
        {form.flowRate_m3hr!=="" && (parseFloat(form.flowRate_m3hr)<7000 || parseFloat(form.flowRate_m3hr)>12000) && (
          <div style={{ marginBottom:10, padding:"9px 12px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:7, color:TINT.amberText, fontSize:12, fontWeight:700 }}>
            Flow rate {form.flowRate_m3hr} m3/hr is outside the expected 7,000-12,000 m3/hr range for Config A. Review before adding - this may indicate a flow anomaly.
          </div>
        )}
        <Btn onClick={handleAdd} variant="rund" disabled={!canEdit}>Add and Recalibrate Both Models</Btn>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Tests dated on or after {lastChangeout} are recorded against the current bed (changed {lastChangeout}), with creosote used since the changeout taken from the creosote log.</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>Stack temp from MCERTS report header. Critical for PAH calibration - read from test certificate where available.</div>
      </Card>

      <Card>
        <SectionTitle>A4 Permit Condition Log - Free from liquid droplet fallout</SectionTitle>
        <div style={{ fontSize:12, color:C.muted, marginBottom:10, lineHeight:1.6 }}>
          Permit reference: EPR/A2/1 Schedule 4, Table 4.1, Emission Point A4. This is a qualitative inspection condition, not a concentration limit, and is not used in predictive model calculations.
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {["Period","Test Date","Droplet Fallout Condition"].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"6px 8px", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stackData.map((row, index)=>(
                <tr key={row.period + "-" + index} style={{ borderBottom:`1px solid ${C.border}`, background:index%2===0?C.ivory:C.surface }}>
                  <td style={{ padding:"6px 8px", fontFamily:MONO, fontWeight:700 }}>{row.period}</td>
                  <td style={{ padding:"6px 8px", fontFamily:MONO }}>{row.date || "--"}</td>
                  <td style={{ padding:"6px 8px", color:dropletFalloutColor(row.dropletFalloutObserved), fontWeight:700 }}>{dropletFalloutLongLabel(row.dropletFalloutObserved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// CoA DATA TAB
// ============================================================
// ---- Creosote supply and usage (synced from the site's Creosote Tank and Flash Point Log) ----
function CreosoteSupplyCard({ deliveries, dailyLog, importStatus, flaggedCount }) {
  const [months, setMonths] = useState(12);
  const rows = useMemo(() => (dailyLog || []).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))), [dailyLog]);
  const dels = useMemo(() => (deliveries || []).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))), [deliveries]);
  const latest = rows.length ? rows[rows.length-1] : null;
  const lastDelivery = dels.length ? dels[dels.length-1] : null;

  const monthly = useMemo(() => {
    const map = new Map();
    const bucket = key => {
      if (!map.has(key)) map.set(key, { month:key, usageKg:0, deliveredKg:0, loads:0, workingDays:0, fpSum:0, fpN:0 });
      return map.get(key);
    };
    rows.forEach(r => {
      const b = bucket(String(r.date).slice(0,7));
      const u = r.usageCleanKg !== undefined ? r.usageCleanKg : r.usageKg;
      if (u != null) b.usageKg += u;
      if (r.workingDays != null && r.workingDays > 0) b.workingDays += r.workingDays;
    });
    dels.forEach(d => {
      const b = bucket(String(d.stockDate || d.date).slice(0,7));
      if (d.qtyKg != null) b.deliveredKg += d.qtyKg;
      b.loads += 1;
      if (d.flashpoint != null) { b.fpSum += d.flashpoint; b.fpN += 1; }
    });
    return [...map.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(b => ({
      month: b.month,
      label: b.month.slice(2).replace("-", "/"),
      usageT: Math.round(Math.max(0, b.usageKg) / 100) / 10,
      deliveredT: Math.round(b.deliveredKg / 100) / 10,
      loads: b.loads,
      perDayT: b.workingDays > 0 ? Math.round(Math.max(0, b.usageKg) / b.workingDays / 100) / 10 : null,
      avgFP: b.fpN ? Math.round(b.fpSum / b.fpN * 10) / 10 : null,
    }));
  }, [rows, dels]);
  const shown = months > 0 ? monthly.slice(-months) : monthly;

  const last30 = useMemo(() => {
    if (!latest) return null;
    const cutoff = new Date(new Date(latest.date + "T00:00:00Z").getTime() - 30 * 86400000).toISOString().slice(0,10);
    let use = 0, days = 0;
    rows.forEach(r => { if (r.date > cutoff) { const u = r.usageCleanKg !== undefined ? r.usageCleanKg : r.usageKg; if (u != null) use += u; if (r.workingDays > 0) days += r.workingDays; } });
    use = Math.max(0, use);
    return { use, perDay: days > 0 ? use / days : null };
  }, [rows, latest]);

  if (!rows.length && !dels.length) {
    return (
      <Card>
        <SectionTitle>Creosote Supply and Usage</SectionTitle>
        <div style={{ fontSize:12, color:C.muted }}>
          No creosote data yet. Load the Creosote Tank and Flash Point Log with Load creosote log (Excel) above,
          or set up the automatic sync from the site PC (scripts/install-creosote-sync-task.ps1).
        </div>
      </Card>
    );
  }

  const fmtT = kg => kg == null ? "--" : (kg / 1000).toFixed(1);
  return (
    <Card>
      <SectionTitle>Creosote Supply and Usage</SectionTitle>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
        <StatPill label="Tank stock" value={latest ? fmtT(latest.totalKg) : "--"} unit="t" sub={latest ? "SCADA " + latest.date + " (4 tanks)" : ""} />
        <StatPill label="Usage, last 30 days" value={last30 ? fmtT(last30.use) : "--"} unit="t"
          sub={last30 && last30.perDay != null ? fmtT(last30.perDay) + " t per working day" : ""} color={C.blue} />
        <StatPill label="Last delivery" value={lastDelivery ? fmtT(lastDelivery.qtyKg) : "--"} unit="t"
          sub={lastDelivery ? lastDelivery.date + " " + (lastDelivery.certNo || "") + (lastDelivery.flashpoint != null ? ", FP " + lastDelivery.flashpoint + " C" : "") : ""}
          color={lastDelivery && lastDelivery.flashpoint != null && lastDelivery.flashpoint < 140 ? C.red : C.teal} />
        <StatPill label="Ambient at reading" value={latest && latest.ambientC != null ? latest.ambientC.toFixed(1) : "--"} unit="C" color={C.muted} sub="From the daily SCADA print" />
      </div>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:8 }}>
        <div style={{ fontSize:12, color:C.muted }}>Monthly usage (tank stock balance) against deliveries, with mean delivered flash point.
          {flaggedCount > 0 ? " " + flaggedCount.toLocaleString("en-GB") + " Daily Log readings were copied or incomplete; their usage is rebuilt from the real readings either side." : ""}</div>
        <div style={{ display:"flex", gap:4 }}>
          {[[6,"6m"],[12,"12m"],[24,"24m"],[0,"All"]].map(([m,l]) => (
            <button key={l} onClick={()=>setMonths(m)} style={{ fontSize:12, padding:"3px 8px", border:"1px solid " + C.border, background:months===m?C.rund:C.surface, color:months===m?"#fff":C.ink, cursor:"pointer", borderRadius:2 }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ width:"100%", height:260, marginTop:6 }}>
        <ResponsiveContainer>
          <ComposedChart data={shown} margin={{ top:8, right:16, bottom:4, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="label" tick={{ fontSize:12, fill:C.muted }} />
            <YAxis yAxisId="t" tick={{ fontSize:12, fill:C.muted }} label={{ value:"tonnes", angle:-90, position:"insideLeft", fontSize:12, fill:C.muted }} />
            <YAxis yAxisId="fp" orientation="right" domain={[130, 170]} tick={{ fontSize:12, fill:C.muted }} label={{ value:"FP C", angle:90, position:"insideRight", fontSize:12, fill:C.muted }} />
            <Tooltip contentStyle={{ fontSize:12 }} />
            <Legend wrapperStyle={{ fontSize:12 }} />
            <Bar yAxisId="t" dataKey="usageT" name="Used (t)" fill={C.blue} />
            <Bar yAxisId="t" dataKey="deliveredT" name="Delivered (t)" fill={C.borderGreen} />
            <Line yAxisId="fp" dataKey="avgFP" name="Mean FP (C)" stroke={C.amber} dot={{ r:2 }} connectNulls />
            <ReferenceLine yAxisId="fp" y={140} stroke={C.red} strokeDasharray="4 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
        {importStatus && importStatus.lastSummary ? importStatus.lastSummary : "No sync status."}
        {importStatus && importStatus.lastImportedAt ? " Last sync " + String(importStatus.lastImportedAt).slice(0,16).replace("T"," ") + " UTC." : ""}
        {importStatus && importStatus.lastError ? " Note: " + importStatus.lastError : ""}
        {" "}Source: Creosote Tank and Flash Point Log (Deliveries and Daily Log tabs). The workbook is the master record; edits made there replace the synced range here.
      </div>
    </Card>
  );
}

// ---- Creosote Tank and Flash Point Log (.xlsx) reader, in the browser ----
// Reads the Deliveries and Daily Log tabs straight from the workbook (a zip of XML parts),
// matching columns by header text, the same mapping as scripts/sync-creosote-xlsx.ps1.
async function readXlsxParts(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const dv = new DataView(buf.buffer);
  let e = buf.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Not an .xlsx workbook");
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const entries = {};
  for (let i = 0; i < count; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    entries[new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen))] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  return async function read(name) {
    const x = entries[name];
    if (!x) return null;
    const lf = dv.getUint16(x.off + 26, true), lx = dv.getUint16(x.off + 28, true);
    const data = buf.subarray(x.off + 30 + lf + lx, x.off + 30 + lf + lx + x.csize);
    if (x.method === 0) return new TextDecoder().decode(data);
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  };
}
function xlsxSerialToIso(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return "";
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
}
function xlsxNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[<>,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
}
async function readCreosoteWorkbook(file, sinceDate) {
  const read = await readXlsxParts(file);
  const parser = new DOMParser();
  const ssXml = await read("xl/sharedStrings.xml");
  const shared = ssXml ? [...parser.parseFromString(ssXml, "application/xml").getElementsByTagName("si")].map(si => [...si.getElementsByTagName("t")].map(t => t.textContent).join("")) : [];
  const wb = parser.parseFromString(await read("xl/workbook.xml"), "application/xml");
  const rels = parser.parseFromString(await read("xl/_rels/workbook.xml.rels"), "application/xml");
  const relMap = {};
  [...rels.getElementsByTagName("Relationship")].forEach(r => { relMap[r.getAttribute("Id")] = r.getAttribute("Target"); });
  const sheetPath = {};
  [...wb.getElementsByTagName("sheet")].forEach(sh => {
    const target = relMap[sh.getAttribute("r:id")] || "";
    sheetPath[sh.getAttribute("name")] = "xl/" + target.replace(/^\/?xl\//, "");
  });
  const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d/g, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  async function sheetRows(name) {
    if (!sheetPath[name]) throw new Error("Tab '" + name + "' not found in the workbook");
    const xml = parser.parseFromString(await read(sheetPath[name]), "application/xml");
    return [...xml.getElementsByTagName("row")].map(row => {
      const out = {};
      [...row.getElementsByTagName("c")].forEach(c => {
        const ci = colIndex(c.getAttribute("r"));
        if (ci > 40) return;
        const v = c.getElementsByTagName("v")[0];
        const is = c.getElementsByTagName("is")[0];
        let val = v ? v.textContent : is ? is.textContent : "";
        if (c.getAttribute("t") === "s") val = shared[Number(val)];
        if (val !== "" && val != null) out[ci] = val;
      });
      return out;
    });
  }
  function headerMap(header, wanted) {
    const cols = Object.keys(header).map(Number).sort((a, b) => a - b);
    const map = {};
    Object.keys(wanted).forEach(k => {
      const prefix = wanted[k].toLowerCase();
      const hit = cols.find(c => String(header[c]).split("\n")[0].trim().toLowerCase().startsWith(prefix));
      if (hit != null) map[k] = hit;
    });
    return map;
  }
  const del = await sheetRows("Deliveries");
  const dm = headerMap(del[0] || {}, { date:"Delivery date", intoTankDate:"Date into tanks", status:"Status", supplier:"Supplier", type:"Type", qtyKg:"Quantity", certNo:"Cert no", flashpoint:"Flash point", crystallisation:"Crystallisation", tarAcid:"Tar acid", tolueneInsol:"Toluene insol", naphthalene:"Naphthalene", bap:"BaP", water:"Water", density:"Density", dist235:"Distillation 0-235", dist300:"Distillation 0-300", dist355:"Distillation 0-355", orderNo:"Order no", transport:"Transport", stockDate:"Stock date", outOfSpec:"Out-of-spec" });
  if (dm.date == null) throw new Error("Deliveries tab: 'Delivery date' column not found");
  const numeric = ["qtyKg","flashpoint","crystallisation","tarAcid","tolueneInsol","naphthalene","bap","water","density","dist235","dist300","dist355"];
  const dates = ["date","intoTankDate","stockDate"];
  const deliveries = del.slice(1).map(r => {
    const o = {};
    Object.keys(dm).forEach(k => {
      const v = r[dm[k]];
      o[k] = dates.includes(k) ? xlsxSerialToIso(v) : numeric.includes(k) ? xlsxNum(v) : (v == null ? "" : String(v).trim());
    });
    return o;
  }).filter(o => o.date && o.date >= sinceDate);
  const log = await sheetRows("Daily Log");
  const lm = headerMap(log[0] || {}, { date:"Date", store1Kg:"Store Tank 1", store2Kg:"Store Tank 2", work1Kg:"Work Tank 1", work2Kg:"Work Tank 2", totalKg:"Total stock", deliveredKg:"Delivered since", usageKg:"Usage since", workingDays:"Working days", usagePerDayKg:"Usage per working day", ambientC:"Ambient", correctedKg:"Corrected stock", idleDays:"Idle working days" });
  if (lm.date == null) throw new Error("Daily Log tab: 'Date' column not found");
  const dailyLog = log.slice(1).map(r => {
    const o = { date: xlsxSerialToIso(r[lm.date]) };
    Object.keys(lm).forEach(k => { if (k !== "date") o[k] = xlsxNum(r[lm[k]]); });
    return o;
  }).filter(o => o.date && o.date >= sinceDate && (o.store1Kg != null || o.totalKg != null));
  return { fileName:file.name, fileModifiedAt:file.lastModified ? new Date(file.lastModified).toISOString() : null, sinceDate, deliveries, dailyLog };
}

function CoATab({ coaData, onAdd, onImport, settings, onSettingChange, onArchiveDocument, canArchiveDocuments, canEdit, creoDeliveries, creoDailyLog, creoFlagged, creoImportStatus, onImportWorkbook }) {
  const [form, setForm] = useState({ date:"", certNo:"", flashpoint:"", crystallisation:"", naphthalene:"", bap:"" });
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const coaRows = useMemo(() => (coaData || []).slice().sort((a,b)=>(a.date||"").localeCompare(b.date||"")), [coaData]);
  const defaultRange = useMemo(() => ({
    from: coaRows[0]?.date || "",
    to: coaRows[coaRows.length-1]?.date || "",
  }), [coaRows]);
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [selectedMetric, setSelectedMetric] = useState("flashpoint");

  useEffect(() => {
    if (defaultRange.from && !rangeFrom) setRangeFrom(defaultRange.from);
    if (defaultRange.to && !rangeTo) setRangeTo(defaultRange.to);
  }, [defaultRange.from, defaultRange.to, rangeFrom, rangeTo]);

  const handleFile = useCallback(async (file)=>{
    if(!file || !/\.xlsx$/i.test(file.name)){setImportStatus("Choose the Creosote Tank and Flash Point Log workbook (.xlsx).");return;}
    if(!canEdit){setImportStatus("Viewer mode: import is disabled.");return;}
    if(typeof DecompressionStream === "undefined"){setImportStatus("This browser cannot read .xlsx files. Use a current version of Edge or Chrome.");return;}
    setImporting(true);setImportStatus("Reading workbook...");
    try {
      const payload = await readCreosoteWorkbook(file, "2024-01-01");
      setImportStatus("Read " + payload.deliveries.length + " deliveries and " + payload.dailyLog.length + " tank readings. Saving...");
      const result = await onImportWorkbook(payload);
      setImportStatus(result && result.summary ? result.summary : "Imported.");
    } catch(e){ setImportStatus("Import failed: " + e.message); }
    setImporting(false);
  },[canEdit,onImportWorkbook]);

  const avgNaph = coaRows.filter(d=>d.naphthalene).length>0
    ? coaRows.filter(d=>d.naphthalene).reduce((a,d)=>a+d.naphthalene,0)/coaRows.filter(d=>d.naphthalene).length : null;
  const wjFrac = settings.naphthaleneFrac*100;
  const divergence = avgNaph!=null ? Math.abs(avgNaph-wjFrac) : null;

  // CoA B(a)P trend: high B(a)P correlates with higher PAH loading
  const avgBap = coaRows.filter(d=>d.bap).length>0
    ? coaRows.filter(d=>d.bap).reduce((a,d)=>a+d.bap,0)/coaRows.filter(d=>d.bap).length : null;
  const avgFlashpoint = coaRows.filter(d=>d.flashpoint).length>0
    ? coaRows.filter(d=>d.flashpoint).reduce((a,d)=>a+d.flashpoint,0)/coaRows.filter(d=>d.flashpoint).length : null;
  const avgCrystallisation = coaRows.filter(d=>d.crystallisation).length>0
    ? coaRows.filter(d=>d.crystallisation).reduce((a,d)=>a+d.crystallisation,0)/coaRows.filter(d=>d.crystallisation).length : null;

  const metricOptions = [
    { value:"flashpoint", label:"Flashpoint", unit:"C", color:C.gold, ref:140, refLabel:"140C spec min" },
    { value:"crystallisation", label:"Crystallisation", unit:"C", color:C.blue, ref:null, refLabel:"" },
    { value:"naphthalene", label:"Naphthalene", unit:"%", color:C.rund, ref:null, refLabel:"" },
    { value:"bap", label:"B(a)P", unit:"ppm", color:C.red, ref:null, refLabel:"" },
  ];
  const selectedMetricConfig = metricOptions.find(opt=>opt.value===selectedMetric) || metricOptions[0];
  const effectiveFrom = rangeFrom || defaultRange.from;
  const effectiveTo = rangeTo || defaultRange.to;
  const filteredCoaRows = useMemo(() => coaRows.filter(row => {
    const rowDate = row.date || "";
    if (effectiveFrom && rowDate && rowDate < effectiveFrom) return false;
    if (effectiveTo && rowDate && rowDate > effectiveTo) return false;
    return true;
  }), [coaRows, effectiveFrom, effectiveTo]);
  const filteredMetricRows = filteredCoaRows.filter(row => row[selectedMetric] != null && row[selectedMetric] !== "");
  const filteredMetricAvg = filteredMetricRows.length
    ? filteredMetricRows.reduce((sum,row)=>sum + Number(row[selectedMetric] || 0),0) / filteredMetricRows.length
    : null;
  const filteredMetricMin = filteredMetricRows.length
    ? Math.min(...filteredMetricRows.map(row=>Number(row[selectedMetric])))
    : null;
  const filteredMetricMax = filteredMetricRows.length
    ? Math.max(...filteredMetricRows.map(row=>Number(row[selectedMetric])))
    : null;
  const filteredChartData = filteredCoaRows.map(row => ({
    label: row.date ? row.date.slice(5) : (row.certNo || "").slice(-6),
    fullDate: row.date || "--",
    certNo: row.certNo || "--",
    flashpoint: row.flashpoint,
    crystallisation: row.crystallisation,
    naphthalene: row.naphthalene,
    bap: row.bap,
  }));
  const crystallisationChartData = filteredCoaRows.filter(row => row.crystallisation != null).map(row => ({
    label: row.date ? row.date.slice(5) : (row.certNo || "").slice(-6),
    fullDate: row.date || "--",
    certNo: row.certNo || "--",
    crystallisation: row.crystallisation,
  }));

  return (
    <div>
      <Card>
        <SectionTitle>CoA to Model Connection</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="CoA Avg Naph %" value={avgNaph!=null?avgNaph.toFixed(1):"--"} unit="%" sub="Liquid phase (Raoult)" />
          <StatPill label="WJ Vapour Fraction" value={wjFrac.toFixed(1)} unit="%" sub="Applied to active hrs scaling" />
          <StatPill
            label="Liquid vs Vapour Phase Diff"
            value={divergence != null ? divergence.toFixed(1) : "--"}
            unit="%"
            color={C.muted}
            sub="Expected - not a calibration signal"
          />
          <StatPill label="CoA Avg B(a)P" value={avgBap!=null?avgBap.toFixed(2):"--"} unit="ppm"
            color={avgBap!=null?(avgBap>3500?C.red:avgBap>2500?C.amber:C.teal):C.muted}
            sub="PAH loading indicator" />
          <StatPill label="Avg Flashpoint" value={avgFlashpoint!=null?avgFlashpoint.toFixed(1):"--"} unit="C"
            color={avgFlashpoint!=null?(avgFlashpoint<140?C.red:C.teal):C.muted}
            sub="CoA mean" />
          <StatPill label="Avg Crystallisation" value={avgCrystallisation!=null?avgCrystallisation.toFixed(1):"--"} unit="C"
            color={avgCrystallisation!=null?C.blue:C.muted}
            sub="CoA mean" />
        </div>
        <Fold title="CoA naphthalene vs the WJ vapour fraction">
        <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>
          IMPORTANT: CoA naphthalene % (bulk liquid mass fraction) and the WJ vapour-phase TVOC fraction are categorically different quantities and must not be conflated. The WJ fraction is calibrated from MCERTS stack test data (Stack Tests tab) - it represents the measured vapour-phase naphthalene fraction at the carbon bed inlet. CoA liquid naphthalene represents bulk tank composition before volatilisation, ductwork condensation, and demister separation occur. A Raoult scaling factor cannot bridge these two measurements reliably for a complex multi-component creosote matrix. CoA data is used here for batch consistency monitoring only. The WJ fraction setting is governed solely by MCERTS certified stack test evidence.
        </div>
        </Fold>
        <div style={{ marginTop:14 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>
            WJ Naphthalene/TVOC Fraction: {wjFrac.toFixed(1)}%
          </label>
          <input type="range" min={30} max={70} step={0.5} value={wjFrac}
            disabled={!canEdit}
            onChange={e=>onSettingChange("naphthaleneFrac",parseFloat(e.target.value)/100)}
            style={{ width:"100%", accentColor:C.rund, opacity:canEdit?1:0.65, cursor:canEdit?"pointer":"not-allowed" }} />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.muted }}>
            <span>30% (below winter ref)</span><span>53% (plant calib. - operative)</span><span>70% (above range)</span>
          </div>
        </div>
        <Fold title="Seasonal naphthalene fraction reference (engineering guidance)">
        <div style={{
          marginTop: 16,
          padding: "12px 14px",
          background: TINT.blueBg,
          border: "1px solid " + C.blue,
          borderRadius: 7,
          fontSize: 12,
          color: TINT.blueText,
          lineHeight: 1.65
        }}>
          <div style={{
            fontWeight: 800,
            fontSize: 12,
            marginBottom: 8,
            color: C.ink
          }}>
            Temperature-Calibrated Naphthalene Fraction Reference (Engineering Guidance)
          </div>
          <div style={{ marginBottom: 6 }}>
            Naphthalene volatilisation from Type C creosote is temperature-dependent. At lower stack temperatures, heavier components condense in the ductwork and demister, reducing the naphthalene fraction of TVOC reaching the bed. At higher temperatures, naphthalene constitutes a larger fraction of the inlet stream. The operative WJ fraction of 53% is the plant-calibrated annual average derived from P1-P8 MCERTS data and is the correct value for compliance scheduling. The seasonal reference values below are provided for engineering context only and must not be applied without EA agreement and documented recalibration.
          </div>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            marginTop: 8
          }}>
            <thead>
              <tr style={{ borderBottom: "2px solid " + C.border }}>
                {["Season", "Stack Temp Range", "Reference nf", "Basis"].map(h => (
                  <th key={h} style={{
                    textAlign: "left",
                    padding: "5px 8px",
                    fontSize: 12,
                    fontWeight: 700,
                    color: C.muted,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase"
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["Winter (Dec-Feb)", "15-18 deg C", "0.44", "Below Heikkilaen default. Naphthalene partially condensed in ductwork at low T."],
                ["Spring / Autumn", "18-22 deg C", "0.50", "Mid-range. Close to Heikkilaen 1987 literature default of 0.45."],
                ["Summer (Jun-Aug)", "22-28 deg C", "0.57", "Above Heikkilaen default. Full naphthalene volatilisation at elevated T."],
                ["High Summer", "> 28 deg C", "0.60", "Conservative cap. Maximum volatilisation regime. PAH risk dominant at these temperatures."],
              ].map(([season, range, nfValue, basis]) => (
                <tr key={season} style={{
                  borderBottom: "1px solid " + C.border
                }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                    {season}
                  </td>
                  <td style={{
                    padding: "6px 8px",
                    fontFamily: MONO
                  }}>
                    {range}
                  </td>
                  <td style={{
                    padding: "6px 8px",
                    fontFamily: MONO,
                    fontWeight: 700,
                    color: C.rund
                  }}>
                    {nfValue}
                  </td>
                  <td style={{
                    padding: "6px 8px",
                    color: C.muted,
                    fontSize: 12
                  }}>
                    {basis}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{
            marginTop: 10,
            fontSize: 12,
            color: C.muted,
            fontStyle: "italic"
          }}>
            Operative setting: 53% (plant-calibrated from P1-P8 MCERTS data). This is the correct value for compliance scheduling and EA audit purposes. Seasonal values are engineering reference only. Source: Heikkilaen (1987) 45% literature default; plant calibration P1-P8; vapour pressure analysis of Type C creosote at process temperatures.
          </div>
        </div>
        </Fold>
      </Card>

      <Card>
        <SectionTitle>Load creosote log (Excel)</SectionTitle>
        <div style={{ fontSize:13, color:C.muted, marginBottom:12, lineHeight:1.5 }}>Drop a copy of the Creosote Tank and Flash Point Log (.xlsx). Deliveries and CoA results from the Deliveries tab, and tank readings from the Daily Log tab, are loaded from 1 Jan 2024 onward. The workbook is the master record: loading it again replaces that range. This does the same job as the automatic sync from Darrel's folder once that is set up.</div>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
          style={{ border:`2px dashed ${dragOver?C.rund:C.border}`, borderRadius:10, padding:"28px 20px", textAlign:"center", background:dragOver?alpha(C.rund,3):C.ivory, transition:"all 0.2s" }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>{importing?importStatus:"Drag the creosote log workbook here or browse"}</div>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" id="coaFile" disabled={!canEdit} style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
          <label htmlFor="coaFile" style={{ cursor:canEdit?"pointer":"not-allowed", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${canEdit?C.rund:C.border}`, color:canEdit?C.rund:C.muted, fontWeight:700, fontSize:12, opacity:canEdit?1:0.7 }}>Browse workbook</label>
          {importStatus && <div style={{ fontSize:12, color:importing?C.amber:C.teal, marginTop:10 }}>{importStatus}</div>}
        </div>
        {!canEdit ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Viewer mode: workbook import and WJ setting changes are locked.</div> : null}
      </Card>

      {filteredChartData.length > 0 && (
        <Card>
          <SectionTitle>CoA Date-Range Analysis</SectionTitle>
          <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end", marginBottom:10 }}>
            <Input label="From" type="date" value={rangeFrom} onChange={setRangeFrom} style={{ flex:"1 1 150px", marginBottom:0 }} />
            <Input label="To" type="date" value={rangeTo} onChange={setRangeTo} style={{ flex:"1 1 150px", marginBottom:0 }} />
            <div style={{ flex:"1 1 180px", marginBottom:14 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5, lineHeight:1.2 }}>Metric</label>
              <select value={selectedMetric} onChange={e=>setSelectedMetric(e.target.value)}
                style={{ width:"100%", height:36, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:2, fontSize:13, color:C.ink, background:C.surface2, boxSizing:"border-box", outline:`1px solid ${C.borderBright}` }}>
                {metricOptions.map(opt=><option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <Btn small variant="ghost" onClick={()=>{ setRangeFrom(defaultRange.from); setRangeTo(defaultRange.to); }}>Reset Range</Btn>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
            <StatPill label="Records In Range" value={filteredCoaRows.length} sub={`${effectiveFrom || "--"} to ${effectiveTo || "--"}`} />
            <StatPill label={`${selectedMetricConfig.label} Avg`} value={filteredMetricAvg!=null?filteredMetricAvg.toFixed(2):"--"} unit={selectedMetricConfig.unit} color={selectedMetricConfig.color} sub="Selected date range" />
            <StatPill label={`${selectedMetricConfig.label} Min`} value={filteredMetricMin!=null?filteredMetricMin.toFixed(2):"--"} unit={selectedMetricConfig.unit} color={selectedMetricConfig.color} sub="Lowest in range" />
            <StatPill label={`${selectedMetricConfig.label} Max`} value={filteredMetricMax!=null?filteredMetricMax.toFixed(2):"--"} unit={selectedMetricConfig.unit} color={selectedMetricConfig.color} sub="Highest in range" />
          </div>
          <div style={{ marginBottom:6, fontSize:12, fontWeight:700, color:C.muted }}>{selectedMetricConfig.label} ({selectedMetricConfig.unit}) over selected CoA date range</div>
          <ResponsiveContainer width="100%" height={170}>
            <LineChart data={filteredChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="label" tick={{ fontSize:12, fill:C.ink }} />
              <YAxis domain={["auto","auto"]} tick={{ fontSize:12, fill:C.ink }} />
              {selectedMetricConfig.ref!=null ? <ReferenceLine y={selectedMetricConfig.ref} stroke={C.amber} strokeDasharray="4 2" label={{ value:selectedMetricConfig.refLabel, fill:C.amber, fontSize:12 }} /> : null}
              <Tooltip formatter={(v)=>[v!=null?Number(v).toFixed(2):"--",`${selectedMetricConfig.label} (${selectedMetricConfig.unit})`]} labelFormatter={(label, rows)=>{
                const row = rows && rows[0] && rows[0].payload ? rows[0].payload : null;
                return row ? `${row.fullDate} | ${row.certNo}` : label;
              }} />
              <Line type="monotone" dataKey={selectedMetric} stroke={selectedMetricConfig.color} strokeWidth={2} dot={{ r:2 }} name={selectedMetricConfig.label} />
            </LineChart>
          </ResponsiveContainer>
          {filteredMetricRows.length === 0 ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>No {selectedMetricConfig.label.toLowerCase()} values are available within the selected CoA date range.</div> : null}
          <div style={{ marginTop:14, marginBottom:6, fontSize:12, fontWeight:700, color:C.muted }}>Crystallisation point (C) over selected CoA date range</div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={crystallisationChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="label" tick={{ fontSize:12, fill:C.ink }} />
              <YAxis domain={["auto","auto"]} tick={{ fontSize:12, fill:C.ink }} />
              <Tooltip formatter={(v)=>[v!=null?Number(v).toFixed(2):"--","Crystallisation (C)"]} labelFormatter={(label, rows)=>{
                const row = rows && rows[0] && rows[0].payload ? rows[0].payload : null;
                return row ? `${row.fullDate} | ${row.certNo}` : label;
              }} />
              <Line type="monotone" dataKey="crystallisation" stroke={C.blue} strokeWidth={2} dot={{ r:2 }} name="Crystallisation" />
            </LineChart>
          </ResponsiveContainer>
          {filteredChartData.length === 0 ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>No CoA records fall within the selected date range.</div> : null}
        </Card>
      )}

      <Card>
        <SectionTitle>Manual CoA Entry</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="CoA Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} style={{ flex:"1 1 140px" }} />
          <Input label="Cert No" value={form.certNo} onChange={v=>setForm(f=>({...f,certNo:v}))} style={{ flex:"1 1 120px" }} />
          <Input label="Flashpoint C" type="number" step="0.1" value={form.flashpoint} onChange={v=>setForm(f=>({...f,flashpoint:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="Crystallisation C" type="number" step="0.1" value={form.crystallisation} onChange={v=>setForm(f=>({...f,crystallisation:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="Naphthalene %" type="number" step="0.01" value={form.naphthalene} onChange={v=>setForm(f=>({...f,naphthalene:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="B(a)P ppm" type="number" step="0.01" value={form.bap} onChange={v=>setForm(f=>({...f,bap:v}))} style={{ flex:"1 1 100px" }} />
        </div>
        <Btn onClick={()=>{if(!form.date||!form.certNo)return;onAdd({...form,flashpoint:parseFloat(form.flashpoint)||null,crystallisation:parseFloat(form.crystallisation)||null,naphthalene:parseFloat(form.naphthalene)||null,bap:parseFloat(form.bap)||null});setForm({date:"",certNo:"",flashpoint:"",crystallisation:"",naphthalene:"",bap:""});}} variant="rund" disabled={!canEdit}>Add Entry</Btn>
      </Card>

      <CreosoteSupplyCard deliveries={creoDeliveries} dailyLog={creoDailyLog} importStatus={creoImportStatus} flaggedCount={creoFlagged} />

      {coaData.length > 0 && (
        <Card>
          <SectionTitle>CoA Records ({coaData.length})</SectionTitle>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                  {["Date","Cert No","Qty (t)","Flashpoint","Crystallisation","Naph %","B(a)P ppm","Density"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...coaData].sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).slice(0,25).map((row,i)=>(
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.ivory:C.surface }}>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.date}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.certNo}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.qtyKg!=null?(row.qtyKg/1000).toFixed(1):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO, color:row.flashpoint<140?C.red:C.ink }}>{row.flashpoint?row.flashpoint.toFixed(1):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.crystallisation?row.crystallisation.toFixed(1):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.naphthalene?row.naphthalene.toFixed(2):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.bap?row.bap.toFixed(2):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.density!=null?Number(row.density).toFixed(3):"--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {coaData.length>25&&<div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Showing 25 most recent of {coaData.length}</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

function ModelArchitectureDetail({ vocC, pahC, settings }) {
  return (
    <div style={{ fontSize:12, color:C.ink, lineHeight:1.8 }}>
      <strong>VOC:</strong> Calibrated using Ridge L2 bivariate regression (ln(active hrs), ambient temperature). In-sample R2 and leave-one-out cross-validated R2 are both computed and displayed. LOO CV R2 is the operative reliability metric for scheduling decisions - it estimates predictive accuracy on periods not used for fitting. In-sample R2 is retained for audit trail purposes only. ln(VOC) = a*ln(rawActiveHrs) + b*T_ambient + c + humidityPenalty. The b coefficient ({vocC.b.toFixed(3)}) was calibrated against ambient temperature (avgTemp from MCERTS records), not T_operative. Correction v1.6.0: the b coefficient is applied at raw ambient temperature at all VOC call sites, restoring consistency with its calibration basis against MCERTS avgTemp. The ambient-to-inlet offset is retained in the PAH pathway only. Documented under audit C&G-GAC-2026-AUDIT-001 (2026-06-18). No EA recalibration notification required: this restores internal consistency rather than changing model physics or coefficients. WJ fraction scales the safeWindowHoursVOC output only - it does not alter the regression prediction input, keeping coefficients consistent with calibration data. The WJ bed life estimate is a theoretical upper bound (Dubinin-Radushkevich/Polanyi steady-state) with no calibrated relationship to observed P1-P8 breakthrough events. It must not be used as a compliance scheduling limit. The VOC regression safe window is the operative limit. Uncertainty band x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} shown on forecast.
      <br /><br />
      <strong>VOC heuristic caveats:</strong> The humidityFactor() term is an uncalibrated multiplicative heuristic layered on top of the regression to preserve conservative behaviour in wet Boston conditions. It is not independently fitted from P1-P8 and should not be re-tuned until a larger independent-period dataset exists. Likewise, WJ fraction scaling is a practical capacity-consumption heuristic applied to safe-window inversion only. It helps align theoretical capacity with site experience, but it is not a first-principles multi-component adsorption model.
      <br /><br />
      <strong>Bayesian Sequential Updating (VOC Intercept Refinement):</strong>{" "}
      {vocC.bayesianActive
        ? <>
            Active (n={vocC.n} independent periods). The Ridge L2 regression intercept is refined via a conjugate normal-normal Bayesian update treating each MCERTS result as a sequential observation. Prior: N({vocC.c.toFixed(3)}, sigma={(vocC.rmse * 1.5).toFixed(3)}). Posterior intercept mean: {vocC.bayesC ? vocC.bayesC.mean.toFixed(4) : "n/a"} (delta: {vocC.bayesC ? (vocC.bayesC.mean - vocC.c).toFixed(4) : "n/a"}). Posterior std dev: {vocC.bayesC ? vocC.bayesC.stdDev.toFixed(4) : "n/a"}. Slope coefficients (a, b) are unchanged: physically constrained and well-determined by Ridge regression at current n. Bayesian intercept is informational only; Ridge R2 and LOO CV remain the operative reliability metrics for compliance scheduling.
          </>
        : <>
            Inactive - requires 4+ independent calibration periods (sameCarbon=false). Currently n={vocC.n}. Bayesian refinement will activate automatically on next qualifying stack test entry.
          </>
      }
      <br /><br />
      <strong>PAH:</strong> Bivariate model. ln(PAH) = a*stackTemp + b*ln(activeHrs) + c. Fresh-carbon periods only where PAH is available. Hours coefficient constrained positive. R2={pahC.r2!=null?pahC.r2.toFixed(3):"default"}. ELV breach stack temp at 500hrs reference: {pahFailTemp(500,pahC).toFixed(1)}C; at 1200hrs: {pahFailTemp(1200,pahC).toFixed(1)}C. Temperature dominant; age provides conservative secondary signal. The operative PAH threshold shown on the Dashboard is calculated at the current active-hours state, not fixed at 500 hrs.
      <br /><br />
      <strong>Bayesian Sequential Updating (PAH Intercept Refinement):</strong>{" "}
      {pahC.bayesianActive
        ? <>
            Active (n={pahC.n} independent periods). The PAH Ridge L2 regression intercept is refined via the same conjugate normal-normal update. Prior: N({pahC.c.toFixed(3)}, sigma={(pahC.rmse * 1.5).toFixed(3)}). Posterior intercept mean: {pahC.bayesC ? pahC.bayesC.mean.toFixed(4) : "n/a"} (delta: {pahC.bayesC ? (pahC.bayesC.mean - pahC.c).toFixed(4) : "n/a"}). Posterior std dev: {pahC.bayesC ? pahC.bayesC.stdDev.toFixed(4) : "n/a"}. Slope coefficients are unchanged and the posterior intercept is supplementary only; PAH R2 and the certified stack-test evidence remain the operative reliability basis.
          </>
        : <>
            Inactive - requires 4+ independent PAH calibration periods. Currently n={pahC.n}. Enter the next certified stack test to extend calibration.
          </>
      }
      <br /><br />
      <strong>Single-component WJ proxy:</strong> Naphthalene is used as a single-component proxy compound for Wheeler-Jonas bed capacity estimation. This is a conservative simplification - no multi-component competitive adsorption model is implemented. The {(settings.naphthaleneFrac*100).toFixed(0)}% vapour-phase fraction is plant-calibrated against P4-P8 MCERTS results.
      <br /><br />
      <strong>Cycles to failure:</strong> remainingHrs / avgHrsPerCharge (from charge log). Rolling 28-day charge rate converts hours to days.
      <br /><br />
      {"CHANGELOG v1.6.0 (2026-06-18) -- Audit C&G-GAC-2026-AUDIT-001:\n" +
      "E01: VOC pathway restored to ambient temperature basis. The b coefficient\n" +
      "was calibrated against MCERTS ambient temperature (d.avgTemp). All predictVOC\n" +
      "and safeWindowHoursVOC calls now correctly pass ambient temperature. The\n" +
      "ambient-to-inlet offset applies to PAH scheduling only. No recalibration required.\n" +
      "E03: flowRate_m3hr onChange handler fixed (was a silent no-op).\n" +
      "E04: Config A flow assumption documented in predictVOC. Config B active warning added.\n" +
      "E05: Default ambient-to-inlet offset updated 8.0 -> 10.3 deg C (Testo 925 validated).\n" +
      "PAH ambient back-calculation now uses regression inverse not hardcoded -10.\n" +
      "W01: Thermal stats now uses sample variance (n-1) not population variance (n).\n" +
      "W02: Vestigial stored operative-display field removed from seasonRec.\n" +
      "W03: LOO CV R2 instability messaging improved. Bayesian vs Ridge comparison added.\n" +
      "W04: exportSchedule now references live stackData not INITIAL_STACK_DATA.\n" +
      "W05: Erroneous PAH ambient threshold replaced with live computed value\n" +
      "(~11.6 deg C). PAH risk window corrected: May-September not June-August only.\n" +
      "W07: MissingPAHBanner dismiss button removed. Banner clears on data entry only.\n" +
      "W08: Bayesian vs Ridge reference comparison added to ModelStatusBanner.\n\n" +
      "CHANGELOG v1.7.0 (2026-06-18):\n\n" +
      "C1: Fan hours manual input removed. Fan running hours are now always\n" +
      "    auto-calculated as (days since changeout x 24) minus logged downtime.\n" +
      "    Eliminates double-counting risk. cgb_fanHrs platform key removed.\n\n" +
      "C2: Dashboard scheduling dates added: predicted VOC depletion date,\n" +
      "    latest recommended stack test date, and PAH risk onset date\n" +
      "    (climatological estimate). Derived from existing remainDays and\n" +
      "    pahFailTemp() calculations.\n\n" +
      "C3: New Model Details tab created. ModelStatusBanner, Model Architecture\n" +
      "    text, VOC model curves, model fit table, residual analysis, and P2\n" +
      "    sensitivity control moved here from Dashboard/Stack Tests/Settings.\n\n" +
      "C4: Dashboard ModelStatusBanner removed. Replaced with compact model\n" +
      "    health indicator showing n, R2, and LOO CV R2 for both models.\n\n" +
      "C5: New Carbon Quality tab for CX65 GAC supplier CoA records.\n" +
      "    New platform state key cgb_carbonCoaData. Captures Iodine Number,\n" +
      "    BET surface area, ash, moisture, density, hardness, pH, mesh size.\n" +
      "    PDF import via /api/extract/carbon-coa. Iodine Number trend chart.\n" +
      "    Acceptance threshold flags (< 900 mg/g amber, < 800 mg/g red).\n\n" +
      "C6: Testo 176 T3 logger CSV importer added to Settings tab.\n" +
      "    New platform state key cgb_loggerLog (hourly-bucketed entries).\n" +
      "    Parser handles semicolon/comma delimiter, European decimal,\n" +
      "    DD.MM.YYYY date format. Deduplication on timestamp. Three-channel\n" +
      "    temperature trend chart with date range selector. Auto-update prompt\n" +
      "    for stackTempCorrectionC when n >= 10 logger readings available."}
      <br /><br />
      Permit EPR/A2/1 | VOC ELV {VOC_ELV} mg/m3 | PAH ELV {PAH_ELV_PERMIT_LABEL} | STS BREF BAT 51/52 | Decision (EU) 2020/2009
    </div>
  );
}

function ModelDetailsTab({ stackData, vocC, pahC, settings, latestCarbonBatch }) {
  const [openAnomaly, setOpenAnomaly] = useState(null);
  const [excludeP2Sensitivity, setExcludeP2Sensitivity] = useState(false);
  const stackTempCorrection = settings.stackTempCorrectionC ?? 10.3;
  const fitRows = stackData.map(d=>{
    const tOperative = operativeTemp(d.avgTemp, stackTempCorrection);
    const effectiveHrs = effectiveHoursForStackRecord(d);
    const vocPred = d.voc!=null ? predictVOC(effectiveHrs,d.avgTemp,d.avgRH,vocC) : null;
    const bayesResidual = d.sameCarbon === false && d.voc != null
      ? Math.log(Math.max(d.voc, 0.01)) - (vocC.a * Math.log(Math.max(effectiveHrs, 1)) + vocC.b * d.avgTemp + vocC.c + ((1 - humidityFactor(d.avgRH)) * 0.6))
      : null;
    const st = d.stackTemp!=null ? d.stackTemp : d.avgTemp+10;
    const pahPred = d.pah!=null ? predictPAH(st, effectiveHrs, pahC) : null;
    const vocErr = vocPred&&d.voc ? ((vocPred-d.voc)/d.voc*100) : null;
    const pahErr = pahPred&&d.pah ? ((pahPred-d.pah)/d.pah*100) : null;
    return {...d, tOperative, effectiveHrs, vocPred, pahPred, vocErr, pahErr, bayesResidual};
  });
  const highResiduals = fitRows.filter(r=>r.vocErr != null && Math.abs(r.vocErr) > 80);
  const vocCWithoutP2 = calibrateVOC(stackData.filter(d=>d.period !== "P2"));
  const modelLines = [];
  const tSeries=[6,10,15,20];
  const tColors=[C.teal,C.rund,C.amber,C.red];
  for(let h=100;h<=2000;h+=100){
    const pt={hrs:h};
    tSeries.forEach(t=>{ pt["voc_"+t]=predictVOC(h,t,80,vocC); });
    modelLines.push(pt);
  }
  return (
    <div>
      <Card style={{ background:TINT.amberBg, borderLeft:`4px solid ${C.amber}` }}>
        <SectionTitle>Temperature Basis Control Note</SectionTitle>
        <div style={{ fontSize:12, color:TINT.amberText, lineHeight:1.7 }}>
          VOC regression is calibrated and executed on raw ambient temperature. PAH regression is calibrated on stack temperature and can be driven by certified stack temperature, estimated stack temperature, or operative-temperature offset workflows depending on context. Any future contractor, logger, or live-instrument integration must preserve this split so the VOC ELV and PAH ELV pathways are not inadvertently fed with the wrong thermal basis.
        </div>
      </Card>
      <Card>
        <SectionTitle>Model Status and Calibration</SectionTitle>
        <ModelStatusBanner vocC={vocC} pahC={pahC} settings={settings} />
      </Card>
      <Card>
        <SectionTitle>VOC Model Architecture</SectionTitle>
        <div style={{ fontSize:13, color:C.muted }}>Operative VOC model: ridge regression of ln(VOC) on ln(effective active hours) and ambient temperature, with a humidity term. PAH model: ln(PAH) on stack temperature and ln(effective active hours). Trial model: creosote throughput and stack temperature (see Stack Tests, Compliance).</div>
        <Fold title="Full model specification and caveats">
          <ModelArchitectureDetail vocC={vocC} pahC={pahC} settings={settings} />
        </Fold>
        <div style={{ marginTop:10, fontSize:12, color:C.muted }}>
          Current WJ reference batch: {latestCarbonBatch ? `${latestCarbonBatch.batchRef || latestCarbonBatch.date || "latest batch"} | iodine ${latestCarbonBatch.iodineMgG != null ? latestCarbonBatch.iodineMgG : "--"} mg/g | density ${latestCarbonBatch.densityKgM3 != null ? latestCarbonBatch.densityKgM3 : "--"} kg/m3` : "No live carbon quality batch loaded; default carbon assumptions in use."}
        </div>
      </Card>
      <Card>
        <SectionTitle>P2 VOC Sensitivity</SectionTitle>
        <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, fontWeight:700, color:C.ink }}>
          <input type="checkbox" checked={excludeP2Sensitivity} onChange={e=>setExcludeP2Sensitivity(e.target.checked)} />
          Exclude P2 from VOC regression (sensitivity test)
        </label>
        <div style={{ marginTop:8, fontSize:12, color:Math.abs((vocCWithoutP2.a||0)-(vocC.a||0))>0.1?C.amber:C.muted }}>
          With P2: a={vocC.a.toFixed(3)}, b={vocC.b.toFixed(3)}, R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"} | Without P2: a={vocCWithoutP2.a.toFixed(3)}, b={vocCWithoutP2.b.toFixed(3)}, R2={vocCWithoutP2.r2!=null?vocCWithoutP2.r2.toFixed(3):"default"}
        </div>
        <div style={{ marginTop:8, fontSize:12, color:C.muted }}>P2 exclusion is a sensitivity test only. The operative model uses the independent-period calibration rule. Any decision to formally exclude P2 from calibration must be documented and agreed with the Environment Agency.</div>
      </Card>
      <Card>
        <SectionTitle>Model Fit - Predicted vs Actual</SectionTitle>
        <div style={{ background:TINT.blueBg, borderLeft:`3px solid ${C.blue}`, borderRadius:7, padding:"10px 14px", fontSize:12, color:TINT.blueText, marginBottom:10, lineHeight:1.55 }}>
          ELV applicability: Environmental permit ELVs (VOC 20 mg/m3, PAH 1,000 ug/m3) were formally applied from November 2025 onwards. P1-P4 were baseline monitoring periods. Exceedances in P1-P4 are recorded for calibration reference only and do not constitute permit non-compliance events.
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {["Period","Hrs","Flow","Amb T","T Oper","Stack T","RH","VOC Act","VOC Pred","VOC Err","Bayes Resid (ln)","PAH Act","PAH Pred","PAH Err","Note"].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"5px 7px", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fitRows.map((row,i)=>{
                const baseline=["P1","P2","P3","P4"].includes(row.period);
                const same=["P2","P3"].includes(row.period);
                return (
                  <>
                    <tr key={row.period} style={{ borderBottom:`1px solid ${C.border}`, background:row.pah==null?TINT.redBg:i%2===0?C.ivory:C.surface }}>
                      <td style={{ padding:"5px 7px", fontWeight:700, fontFamily:MONO }}>{row.period}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.activeHrs?.toLocaleString()} / {row.effectiveHrs != null ? row.effectiveHrs.toFixed(0) : "--"} eff</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.flowRate_m3hr != null ? row.flowRate_m3hr.toLocaleString() : "n/a (est.)"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.avgTemp}C</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, color:C.blue }}>{row.tOperative.toFixed(1)}C</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.stackTemp?C.ink:C.muted }}>{row.stackTemp?row.stackTemp+"C":"~est"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.avgRH}%</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.voc>VOC_ELV?C.red:C.teal, fontWeight:row.voc>VOC_ELV?700:400 }}>{row.voc!=null?row.voc:"--"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.vocPred!=null?row.vocPred:"--"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.vocErr!=null&&Math.abs(row.vocErr)>50?C.amber:C.muted }}>{row.vocErr!=null?(row.vocErr>0?"+":"")+row.vocErr.toFixed(0)+"%":"--"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, textAlign:"right", color:row.bayesResidual!=null&&Math.abs(row.bayesResidual)>0.5?C.amber:C.muted }}>{row.bayesResidual!=null?(row.bayesResidual>0?"+":"")+row.bayesResidual.toFixed(3):"--"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.pah>PAH_ELV?C.red:C.teal, fontWeight:row.pah>PAH_ELV?700:400 }}>{row.pah!=null?row.pah.toLocaleString():<Badge text="Outstanding" color={C.red} />}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.pahPred!=null?row.pahPred.toLocaleString():"--"}</td>
                      <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.pahErr!=null&&Math.abs(row.pahErr)>30?C.amber:C.muted }}>{row.pahErr!=null?(row.pahErr>0?"+":"")+row.pahErr.toFixed(0)+"%":"--"}</td>
                      <td style={{ padding:"5px 7px", fontSize:12, color:C.muted }}>
                        <div>{same?"same C/O":baseline?"baseline":""}</div>
                        {baseline && <div style={{ marginTop:4 }}><Badge text="Pre-ELV baseline" color={C.blue} /></div>}
                        {row.flowAnomalous && (
                          <div style={{ marginTop:4 }}>
                            <Badge text="Flow: unresolved" color={C.amber} />
                            <button onClick={()=>setOpenAnomaly(openAnomaly===row.period?null:row.period)} style={{ marginLeft:6, border:`1px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.blue, cursor:"pointer", fontSize:12, fontWeight:700 }}>note</button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {row.flowAnomalous && openAnomaly===row.period && (
                      <tr key={row.period + "-anomaly"} style={{ borderBottom:`1px solid ${C.border}`, background:TINT.amberBg }}>
                        <td colSpan={15} style={{ padding:"9px 10px", fontSize:12, color:C.ink, lineHeight:1.55 }}>
                          P2 (March 2025, MCERTS ref ES-2093): Envirocare certified stack discharge flow of 3,659 m3/hr against 7,000-12,000 m3/hr across all other Config A periods. Standard Config A pulleys confirmed installed at time of test. No operational cause identified. Envirocare measurement stands as certified. Raw traverse data not available for retrospective review. Anomaly is formally unresolvable. P2 is excluded from flow-dependent Wheeler-Jonas EBCT calculations and from the stack temperature correction (T_operative) derivation. P2 VOC and PAH certified results are valid and are retained in regression calibration.
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
        <Fold title="About the calibration periods">
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          P1-P3: same carbon charge (cumulative -- not independent data points). P4-P14: tests on fresh beds introduced under the programme (P5/P6 share Bed 3; P9-P12 share Bed 6; P13/P14 share Bed 7). P9-P14 active hours are estimated at 21.7 hrs/day pending charge-log reconciliation. P2 excluded from both VOC and PAH calibration for consistency: sameCarbon=true cumulative observations are not independent data points in either model. P2 certified results (VOC 45.0 mg/m3, PAH 865 ug/m3) are displayed for transparency only. VOC model uses raw ambient temperature consistent with calibration basis. PAH model uses MCERTS stack temp.
        </div>
        </Fold>
        <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
          Bayes Resid = ln(measured) - ln(Ridge predicted). Sequential Bayesian update on intercept c uses these residuals as observations. Positive mean residual indicates systematic underprediction; Bayesian posterior will shift intercept upward.
        </div>
      </Card>
      <Card>
        <SectionTitle>Residual Analysis</SectionTitle>
        <h4 style={{ margin:"0 0 10px", color:C.ink }}>High-Residual Periods</h4>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap:10 }}>
          {highResiduals.map(row=>(
            <div key={row.period} style={{ border:`1px solid ${C.red}`, borderLeft:`4px solid ${C.red}`, borderRadius:8, padding:"10px 12px", background:TINT.redBg }}>
              <Badge text="High residual" color={C.red} />
              <div style={{ fontSize:12, color:C.ink, marginTop:8, lineHeight:1.5 }}>
                {row.period==="P4" && "P4: Fresh carbon, high summer temperature (22.5C ambient, 27.7C stack). Model under-predicts at high temperatures with low hours. Temperature coefficient in VOC regression partially compensates but PAH model is the primary high-temperature constraint."}
                {row.period==="P7" && "P7: 1,387 hrs at 6.1C ambient (17.5C stack). VOC = 5.9 mg/m3. Model substantially over-predicts at cold temperatures with high hours. This is physically consistent - cold temperatures suppress VOC volatility. P7 is the strongest evidence that temperature is the dominant VOC driver."}
                {row.period!=="P4" && row.period!=="P7" && `${row.period}: VOC residual ${row.vocErr.toFixed(0)}%. Retained in calibration for transparency.`}
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>These residuals are retained in calibration. They define the x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} uncertainty band applied to all predictions. Remove or exclude these periods only if a specific physical explanation justifies exclusion and is documented.</div>
      </Card>
      <Card>
        <SectionTitle>VOC Model Curves</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={modelLines} margin={{ top:5, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="hrs" label={{ value:"Active Hours", position:"insideBottom", offset:-8, fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <YAxis label={{ value:"VOC mg/m3", angle:-90, position:"insideLeft", fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} domain={[0,80]} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
            <ReferenceLine y={VOC_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"ELV 20", fill:C.red, fontSize:12 }} />
            {tSeries.map((t,i)=>(
              <Line key={t} type="monotone" dataKey={"voc_"+t} stroke={tColors[i]} strokeWidth={2} dot={false} name={t+"C"} />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:22, flexWrap:"wrap", marginTop:8, fontSize:12, color:C.muted }}>
          {tSeries.map((t,i)=>(
            <div key={t} style={{ display:"inline-flex", alignItems:"center", gap:6, minWidth:48 }}>
              <span style={{ width:18, height:0, borderTop:`3px solid ${tColors[i]}`, display:"inline-block" }} />
              <span style={{ fontFamily:MONO }}>{t}C</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:6 }}>
          Curve labels show ambient temperature. VOC physics is calculated at raw ambient temperature consistent with the regression calibration basis.
        </div>
      </Card>
    </div>
  );
}

function CarbonQualityTab({ carbonCoaData, onAdd, onDelete, onArchiveDocument, canArchiveDocuments, canEdit, settings }) {
  const [carbonCoaForm, setCarbonCoaForm] = useState({
    id: "",
    date: "",
    batchRef: "",
    iodineMgG: "",
    betM2G: "",
    ashPct: "",
    moisturePct: "",
    densityKgM3: "",
    hardness: "",
    pH: "",
    meshSize: "",
    notes: "",
  });
  const [status, setStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const records = (carbonCoaData || []).slice().sort((a,b)=>(a.date||"").localeCompare(b.date||""));
  const latest = records.length ? records[records.length - 1] : null;
  const iodineRows = records.filter(d => d.iodineMgG != null);
  const avgIodine = iodineRows.length ? iodineRows.reduce((a,d)=>a+d.iodineMgG,0) / iodineRows.length : null;
  const latestIodine = latest && latest.iodineMgG != null ? latest.iodineMgG : null;
  const latestDensity = latest && latest.densityKgM3 != null ? latest.densityKgM3 : null;
  const chartData = [...records]
    .filter(d => d.iodineMgG != null)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map(d => ({
      label: d.date ? d.date.slice(5) : d.batchRef,
      fullDate: d.date || "--",
      batchRef: d.batchRef || "--",
      iodine: d.iodineMgG,
      density: d.densityKgM3,
      moisture: d.moisturePct,
      ash: d.ashPct,
    }));
  const densityChartData = [...records]
    .filter(d => d.densityKgM3 != null)
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    .map(d => ({
      label: d.date ? d.date.slice(5) : d.batchRef,
      fullDate: d.date || "--",
      batchRef: d.batchRef || "--",
      density: d.densityKgM3,
    }));

  const updateForm = (key, value) => setCarbonCoaForm(prev => ({ ...prev, [key]: value }));
  const resetForm = () => setCarbonCoaForm({
    id: "",
    date: "",
    batchRef: "",
    iodineMgG: "",
    betM2G: "",
    ashPct: "",
    moisturePct: "",
    densityKgM3: "",
    hardness: "",
    pH: "",
    meshSize: "",
    notes: "",
  });

  const handleFile = useCallback(async function(file) {
    if (!file || file.type !== "application/pdf") {
      setStatus("PDF files only.");
      return;
    }
    if (!canEdit) {
      setStatus("Viewer mode: carbon CoA import is disabled.");
      return;
    }
    setImporting(true);
    setStatus("Reading carbon supplier CoA PDF...");
    try {
      const base64 = await fileToBase64(file);
      if (canArchiveDocuments && onArchiveDocument) {
        await onArchiveDocument({
          category: "carbon-coa-pdf",
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          base64,
          notes: "CX65 carbon supplier CoA PDF retained from browser import.",
        });
      }
      const data = await platformRequest("/api/extract/carbon-coa", {
        method: "POST",
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          base64,
        }),
      });
      const extracted = data.extracted || {};
      setCarbonCoaForm(prev => ({
        ...prev,
        date: extracted.date || "",
        batchRef: extracted.batchRef || extracted.certNo || "",
        iodineMgG: extracted.iodineMgG != null ? String(extracted.iodineMgG) : "",
        betM2G: extracted.betM2G != null ? String(extracted.betM2G) : "",
        ashPct: extracted.ashPct != null ? String(extracted.ashPct) : "",
        moisturePct: extracted.moisturePct != null ? String(extracted.moisturePct) : "",
        densityKgM3: extracted.densityKgM3 != null ? String(extracted.densityKgM3) : "",
        hardness: extracted.hardness != null ? String(extracted.hardness) : "",
        pH: extracted.pH != null ? String(extracted.pH) : "",
        meshSize: extracted.meshSize || "",
        notes: extracted.notes || "",
      }));
      setStatus("Extracted carbon CoA fields. Review before adding.");
    } catch (error) {
      setStatus("Import failed: " + error.message);
    }
    setImporting(false);
  }, [canArchiveDocuments, canEdit, onArchiveDocument]);

  const addRecord = () => {
    onAdd({
      id: String(Date.now()),
      date: carbonCoaForm.date || "",
      batchRef: carbonCoaForm.batchRef || "",
      iodineMgG: carbonCoaForm.iodineMgG !== "" ? parseFloat(carbonCoaForm.iodineMgG) : null,
      betM2G: carbonCoaForm.betM2G !== "" ? parseFloat(carbonCoaForm.betM2G) : null,
      ashPct: carbonCoaForm.ashPct !== "" ? parseFloat(carbonCoaForm.ashPct) : null,
      moisturePct: carbonCoaForm.moisturePct !== "" ? parseFloat(carbonCoaForm.moisturePct) : null,
      densityKgM3: carbonCoaForm.densityKgM3 !== "" ? parseFloat(carbonCoaForm.densityKgM3) : null,
      hardness: carbonCoaForm.hardness !== "" ? parseFloat(carbonCoaForm.hardness) : null,
      pH: carbonCoaForm.pH !== "" ? parseFloat(carbonCoaForm.pH) : null,
      meshSize: carbonCoaForm.meshSize || "",
      notes: carbonCoaForm.notes || "",
    });
    resetForm();
    setStatus("Carbon quality batch record added.");
  };

  const latestIodineColor = latestIodine == null ? C.muted : latestIodine < 900 ? C.red : latestIodine < 950 ? C.amber : C.teal;
  const latestDensityColor = latestDensity == null ? C.muted : (latestDensity < 420 || latestDensity > 480) ? C.amber : C.teal;

  return (
    <div>
      <Card style={{ background:TINT.blueBg, borderLeft:"4px solid " + C.blue }}>
        <SectionTitle>Why Carbon Quality Matters</SectionTitle>
        <Fold title="Read more">
        <div style={{ fontSize:12, color:TINT.blueText, lineHeight:1.7 }}>
          CX65 Large Granular Coal-Based GAC -- Batch Quality Monitoring
          <br /><br />
          Iodine Number (mg/g) is the primary indicator of adsorption capacity for this
          application. The Wheeler-Jonas bed life calculation uses a fixed limiting
          adsorption volume (W0 = 0.45 mL/g) and bulk density assumption (450 kg/m3).
          Significant batch-to-batch variation in Iodine Number or density will shift the
          true safe window relative to the model prediction.
          <br /><br />
          Acceptance thresholds (indicative, pending supplier specification confirmation):
          <br />
          Iodine Number:    &gt; 900 mg/g (flag below 900, reject below 800)
          <br />
          Ash Content:      &lt; 10%
          <br />
          Moisture:         &lt; 5% (as delivered)
          <br />
          Apparent Density: 420-480 kg/m3 (model assumes 450 kg/m3)
          <br />
          BET Surface Area: &gt; 900 m2/g
          <br /><br />
          Record each batch CoA on delivery. The EA audit trail requires demonstration
          of incoming carbon quality for each charge. Contact the CX65 supplier to
          establish routine CoA supply with every delivery.
        </div>
        </Fold>
      </Card>
      <Card>
        <SectionTitle>Batch Summary Statistics</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Latest Iodine Number" value={latestIodine != null ? latestIodine.toFixed(0) : "--"} unit="mg/g" color={latestIodineColor} sub={latest ? (latest.batchRef || latest.date || "Latest batch") : "No records"} />
          <StatPill label="Average Iodine Number" value={avgIodine != null ? avgIodine.toFixed(1) : "--"} unit="mg/g" color={avgIodine != null ? C.rund : C.muted} sub="All batch records" />
          <StatPill label="Latest Apparent Density" value={latestDensity != null ? latestDensity.toFixed(0) : "--"} unit="kg/m3" color={latestDensityColor} sub="Model assumes 450 kg/m3" />
          <StatPill label="Records Count" value={records.length} unit="" color={C.blue} sub="Supplier CoA entries" />
        </div>
      </Card>
      <Card>
        <SectionTitle>Import Carbon Supplier CoA PDF</SectionTitle>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
          style={{ border:`2px dashed ${dragOver?C.rund:C.border}`, borderRadius:10, padding:"28px 20px", textAlign:"center", background:dragOver?alpha(C.rund,3):C.ivory, transition:"all 0.2s" }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>{importing ? status : "Drag carbon supplier CoA PDF here or browse"}</div>
          <input type="file" accept=".pdf" id="carbonCoaFile" disabled={!canEdit} style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
          <label htmlFor="carbonCoaFile" style={{ cursor:canEdit?"pointer":"not-allowed", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${canEdit?C.rund:C.border}`, color:canEdit?C.rund:C.muted, fontWeight:700, fontSize:12, opacity:canEdit?1:0.7 }}>Browse PDF</label>
          {status && <div style={{ fontSize:12, color:importing?C.amber:C.teal, marginTop:10 }}>{status}</div>}
        </div>
      </Card>
      <Card>
        <SectionTitle>Manual CoA Entry</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Date" type="date" value={carbonCoaForm.date} onChange={v=>updateForm("date",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Batch Ref" value={carbonCoaForm.batchRef} onChange={v=>updateForm("batchRef",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Iodine Number" type="number" value={carbonCoaForm.iodineMgG} onChange={v=>updateForm("iodineMgG",v)} style={{ flex:"1 1 140px" }} disabled={!canEdit} />
          <Input label="BET Surface Area" type="number" value={carbonCoaForm.betM2G} onChange={v=>updateForm("betM2G",v)} style={{ flex:"1 1 140px" }} disabled={!canEdit} />
          <Input label="Ash %" type="number" value={carbonCoaForm.ashPct} onChange={v=>updateForm("ashPct",v)} style={{ flex:"1 1 120px" }} disabled={!canEdit} />
          <Input label="Moisture %" type="number" value={carbonCoaForm.moisturePct} onChange={v=>updateForm("moisturePct",v)} style={{ flex:"1 1 120px" }} disabled={!canEdit} />
          <Input label="Density kg/m3" type="number" value={carbonCoaForm.densityKgM3} onChange={v=>updateForm("densityKgM3",v)} style={{ flex:"1 1 140px" }} disabled={!canEdit} />
          <Input label="Hardness" type="number" value={carbonCoaForm.hardness} onChange={v=>updateForm("hardness",v)} style={{ flex:"1 1 120px" }} disabled={!canEdit} />
          <Input label="pH" type="number" value={carbonCoaForm.pH} onChange={v=>updateForm("pH",v)} style={{ flex:"1 1 100px" }} disabled={!canEdit} />
          <Input label="Mesh Size" value={carbonCoaForm.meshSize} onChange={v=>updateForm("meshSize",v)} style={{ flex:"1 1 140px" }} disabled={!canEdit} />
          <Input label="Notes" value={carbonCoaForm.notes} onChange={v=>updateForm("notes",v)} style={{ flex:"1 1 220px" }} disabled={!canEdit} />
        </div>
        <Btn onClick={addRecord} variant="rund" disabled={!canEdit}>Add Batch Record</Btn>
      </Card>
      {chartData.length > 0 && (
        <Card>
          <SectionTitle>Iodine Number Trend</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top:5, right:24, bottom:18, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="label" tick={{ fontSize:12, fill:C.ink }} />
              <YAxis domain={[700, "auto"]} tick={{ fontSize:12, fill:C.ink }} />
              <Tooltip formatter={(v,n)=>[v,n]} labelFormatter={(label, payload)=>payload && payload[0] ? payload[0].payload.fullDate + " | " + payload[0].payload.batchRef : label} />
              <ReferenceLine y={900} stroke={C.amber} label={{ value:"900 mg/g threshold", fill:C.amber, fontSize:12 }} />
              <ReferenceLine y={800} stroke={C.red} label={{ value:"800 mg/g reject", fill:C.red, fontSize:12 }} />
              <Line type="monotone" dataKey="iodine" stroke={C.rund} strokeWidth={2.5} dot={true} name="Iodine Number" />
            </LineChart>
          </ResponsiveContainer>
          {densityChartData.length > 0 && (
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={densityChartData} margin={{ top:5, right:24, bottom:18, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="label" tick={{ fontSize:12, fill:C.ink }} />
                <YAxis tick={{ fontSize:12, fill:C.ink }} />
                <Tooltip formatter={(v,n)=>[v,n]} labelFormatter={(label, payload)=>payload && payload[0] ? payload[0].payload.fullDate + " | " + payload[0].payload.batchRef : label} />
                <ReferenceLine y={420} stroke={C.amber} label={{ value:"420", fill:C.amber, fontSize:12 }} />
                <ReferenceLine y={480} stroke={C.amber} label={{ value:"480", fill:C.amber, fontSize:12 }} />
                <ReferenceLine y={450} stroke={C.blue} label={{ value:"Model assumes 450 kg/m3", fill:C.blue, fontSize:12 }} />
                <Line type="monotone" dataKey="density" stroke={C.blue} strokeWidth={2} dot={true} name="Density kg/m3" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      )}
      {records.length > 0 && (
        <Card>
          <SectionTitle>Batch Records</SectionTitle>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                  {["Date","Batch Ref","Iodine (mg/g)","BET (m2/g)","Ash %","Moisture %","Density (kg/m3)","Hardness","pH","Mesh","Delete"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"6px 7px", color:C.muted, fontSize:12, textTransform:"uppercase", letterSpacing:"0.06em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((row,i)=>{
                  var bg = i%2===0?C.ivory:C.surface;
                  if (row.iodineMgG != null && row.iodineMgG < 800) bg = TINT.redBg;
                  else if ((row.iodineMgG != null && row.iodineMgG < 900) || (row.densityKgM3 != null && (row.densityKgM3 < 420 || row.densityKgM3 > 480))) bg = TINT.amberBg;
                  return (
                    <tr key={row.id} style={{ borderBottom:`1px solid ${C.border}`, background:bg }}>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.date || "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.batchRef || "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.iodineMgG != null ? row.iodineMgG : "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.betM2G != null ? row.betM2G : "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.ashPct != null ? row.ashPct : "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.moisturePct != null ? row.moisturePct : "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.densityKgM3 != null ? row.densityKgM3 : "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.hardness != null ? row.hardness : "--"}</td>
                      <td style={{ padding:"6px 7px", fontFamily:MONO }}>{row.pH != null ? row.pH : "--"}</td>
                      <td style={{ padding:"6px 7px" }}>{row.meshSize || "--"}</td>
                      <td style={{ padding:"6px 7px" }}><button disabled={!canEdit} onClick={()=>onDelete(row.id)} style={{ background:"none", border:"none", cursor:canEdit?"pointer":"not-allowed", color:C.red, fontWeight:700, fontSize:13, opacity:canEdit?1:0.45 }}>x</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function LoggerDataSection({ loggerLog, onImport, onClearLogger, onUpdateCorrectionFactor, settings, canEdit }) {
  const [loggerDragOver, setLoggerDragOver] = useState(false);
  const [loggerStatus, setLoggerStatus] = useState("");
  const [loggerImporting, setLoggerImporting] = useState(false);
  const [loggerPreview, setLoggerPreview] = useState(null);
  const [loggerRangeFrom, setLoggerRangeFrom] = useState("");
  const [loggerRangeTo, setLoggerRangeTo] = useState("");
  const loggerStats = computeLoggerStats(loggerLog);
  const loggerChartData = (loggerLog || [])
    .filter(function(r) {
      if (loggerRangeFrom && r.timestamp < loggerRangeFrom) return false;
      if (loggerRangeTo && r.timestamp > loggerRangeTo + "T23:59") return false;
      return true;
    })
    .sort(function(a, b) { return a.timestamp.localeCompare(b.timestamp); })
    .map(function(r) {
      return {
        ts: r.timestamp.slice(5, 16),
        fullTs: r.timestamp,
        ambient: r.ambientTemp,
        inlet: r.preBedTemp,
        outlet: r.postBedTemp,
        deltaInlet: r.ambientTemp != null && r.preBedTemp != null
          ? Math.round((r.preBedTemp - r.ambientTemp) * 10) / 10
          : null,
      };
    });

  const handleLoggerFile = useCallback(function(file) {
    if (!file) return;
    if (!canEdit) { setLoggerStatus("Viewer mode: logger import disabled."); return; }
    var name = file.name.toLowerCase();
    var isValid = name.endsWith(".csv") || name.endsWith(".txt");
    if (!isValid) { setLoggerStatus("CSV or TXT files only. Export from Testo Comfort Software."); return; }
    setLoggerImporting(true);
    setLoggerStatus("Parsing Testo logger file...");
    var reader = new FileReader();
    reader.onload = function() {
      var result = parseTestoCsvText(reader.result);
      setLoggerPreview(result);
      setLoggerStatus(
        result.rows.length + " hourly records parsed from " + result.rawCount + " raw readings." +
        (result.errors.length ? " " + result.errors.length + " parse errors." : "")
      );
      setLoggerImporting(false);
    };
    reader.onerror = function() {
      setLoggerStatus("Could not read file.");
      setLoggerImporting(false);
    };
    reader.readAsText(file);
  }, [canEdit]);

  const handleImportConfirm = function() {
    if (!loggerPreview || !loggerPreview.rows.length) return;
    var existingTimestamps = new Set((loggerLog || []).map(function(r) { return r.timestamp; }));
    var newRows = loggerPreview.rows.filter(function(r) {
      return !existingTimestamps.has(r.timestamp);
    });
    onImport(newRows);
    setLoggerStatus("Imported " + newRows.length + " new hourly records (" +
      (loggerPreview.rows.length - newRows.length) + " duplicates skipped).");
    setLoggerPreview(null);
  };

  return (
    <div>
      <Card>
      <SectionTitle>Logger Data</SectionTitle>
      <div onDragOver={e=>{e.preventDefault();setLoggerDragOver(true);}} onDragLeave={()=>setLoggerDragOver(false)}
        onDrop={e=>{e.preventDefault();setLoggerDragOver(false);handleLoggerFile(e.dataTransfer.files[0]);}}
        style={{ border:`2px dashed ${loggerDragOver?C.rund:C.border}`, borderRadius:10, padding:"24px 20px", textAlign:"center", background:loggerDragOver?alpha(C.rund,3):C.ivory, transition:"all 0.2s" }}>
        <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>
          {loggerImporting ? loggerStatus : "Drag Testo 176 T3 CSV export here or browse. Export from Testo Comfort Software: File > Export > CSV. Semicolon-delimited, all channels. Date format DD.MM.YYYY."}
        </div>
        <input type="file" accept=".csv,.txt,text/csv,text/plain" id="loggerFile" disabled={!canEdit} style={{ display:"none" }} onChange={e=>handleLoggerFile(e.target.files[0])} />
        <label htmlFor="loggerFile" style={{ cursor:canEdit?"pointer":"not-allowed", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${canEdit?C.rund:C.border}`, color:canEdit?C.rund:C.muted, fontWeight:700, fontSize:12, opacity:canEdit?1:0.7 }}>Browse CSV/TXT</label>
        {loggerStatus && <div style={{ fontSize:12, color:loggerImporting?C.amber:C.teal, marginTop:10 }}>{loggerStatus}</div>}
      </div>
      {loggerPreview && loggerPreview.rows.length > 0 && (
        <div style={{ marginTop:10 }}>
          <div style={{ fontSize:12, color:C.muted, marginBottom:6 }}>
            Preview ready: {loggerPreview.rows.length} hourly rows.
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <Btn onClick={handleImportConfirm} variant="rund" small disabled={!canEdit}>Import</Btn>
            <Btn onClick={()=>setLoggerPreview(null)} variant="ghost" small>Cancel</Btn>
          </div>
        </div>
      )}
      </Card>
      <Card style={{ marginTop:14, marginBottom:0 }}>
        <SectionTitle>Testo 176 T3 Logger Temperature Profile</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end" }}>
          <Input label="From" type="date" value={loggerRangeFrom} onChange={setLoggerRangeFrom} style={{ flex:"1 1 150px", marginBottom:0 }} />
          <Input label="To" type="date" value={loggerRangeTo} onChange={setLoggerRangeTo} style={{ flex:"1 1 150px", marginBottom:0 }} />
        </div>
        {loggerChartData.length === 0 ? (
          <div style={{ padding:"36px 16px", textAlign:"center", color:C.muted, fontSize:14, border:`1px dashed ${C.border}`, borderRadius:12 }}>No logger data yet. Import a Testo 176 T3 export above to see the temperature profile.</div>
        ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={loggerChartData} margin={{ top:5, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="ts" tick={{ fontSize:12, fill:C.ink }} interval={Math.max(0, Math.floor(loggerChartData.length / 24))} />
            <YAxis tick={{ fontSize:12, fill:C.ink }} />
            <YAxis yAxisId="delta" orientation="right" tick={{ fontSize:12, fill:C.ink }} label={{ value:"Delta T (deg C)", angle:90, position:"insideRight", fontSize:12, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[v,n]} labelFormatter={(label, payload)=>payload && payload[0] ? payload[0].payload.fullTs : label} />
            <Legend />
            <Line type="monotone" dataKey="ambient" stroke={C.blue} strokeWidth={1.5} dot={false} name="Ambient (deg C)" />
            <Line type="monotone" dataKey="inlet" stroke={C.red} strokeWidth={2} dot={false} name="Bed Inlet Ch1 (deg C)" />
            <Line type="monotone" dataKey="outlet" stroke={C.teal} strokeWidth={1.5} dot={false} name="Bed Outlet Ch2 (deg C)" />
            <Line yAxisId="delta" type="monotone" dataKey="deltaInlet" stroke={C.gold} strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Amb-to-Inlet Delta (deg C)" />
          </ComposedChart>
        </ResponsiveContainer>
        )}
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginTop:10 }}>
          <StatPill label="Logger Records" value={(loggerLog||[]).length.toLocaleString()} unit="" sub="Total hourly entries" />
          <StatPill label="In Range" value={loggerChartData.length.toLocaleString()} unit="" />
          <StatPill
            label="Mean Amb-Inlet Delta"
            value={loggerStats.meanDelta != null ? loggerStats.meanDelta.toFixed(1) : "--"}
            unit="deg C"
            color={loggerStats.meanDelta != null ? (loggerStats.meanDelta > 12 ? C.red : loggerStats.meanDelta > 9 ? C.amber : C.teal) : C.muted}
            sub={loggerStats.count >= 10 ? "n=" + loggerStats.count + " logger readings" : "Need 10+ readings"}
          />
        </div>
        {loggerStats.count >= 10 && loggerStats.meanDelta != null && (
          <div style={{ marginTop:10, padding:"10px 12px", background:TINT.amberBg,
            border:"1px solid " + C.amber, borderRadius:7, fontSize:12,
            color:TINT.amberText, lineHeight:1.5 }}>
            <strong>Logger Delta Available:</strong> Mean ambient-to-inlet offset from
            logger data is {loggerStats.meanDelta.toFixed(1)} deg C (n={loggerStats.count}
            hourly readings). Current model correction factor is{" "}
            {settings.stackTempCorrectionC != null ? settings.stackTempCorrectionC.toFixed(1) : "10.3"} deg C.
            {" "}
            {canEdit && (
              <button
                onClick={function() {
                  var newDelta = Math.round(loggerStats.meanDelta * 10) / 10;
                  onUpdateCorrectionFactor(newDelta);
                }}
                style={{ marginLeft:8, padding:"4px 10px", border:"1px solid " + C.amber,
                  borderRadius:4, background:C.surface, color:TINT.amberText,
                  cursor:"pointer", fontWeight:700, fontSize:12 }}
              >
                Update model offset to {loggerStats.meanDelta.toFixed(1)} deg C
              </button>
            )}
            <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
              Updating the correction factor will take effect immediately across
              all PAH scheduling calculations. The previous value can be restored
              manually in Settings. Only update if the logger data covers a
              representative operational period (minimum 7 days of normal operation).
            </div>
          </div>
        )}
        {canEdit && (
          <div style={{ marginTop:10 }}>
            <Btn
              onClick={function() {
                if (window.confirm("Delete all " + (loggerLog||[]).length + " logger records? This cannot be undone.")) {
                  onClearLogger();
                }
              }}
              variant="danger"
              small
            >
              Clear logger data
            </Btn>
          </div>
        )}
      </Card>
    </div>
  );
}

function ThermalLogChart({ thermalLog, settings }) {
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const chartData = (thermalLog || [])
    .filter(function(entry) {
      var day = String(entry.timestamp || "").slice(0, 10);
      if (rangeFrom && day < rangeFrom) return false;
      if (rangeTo && day > rangeTo) return false;
      return true;
    })
    .sort(function(a, b) { return String(a.timestamp || "").localeCompare(String(b.timestamp || "")); })
    .map(function(entry) {
      var derived = thermalDerived(entry);
      return {
        ts: String(entry.timestamp || "").slice(5, 16).replace("T", " "),
        fullTs: entry.timestamp,
        ambient: parseThermalNumber(entry.ambientTemp),
        inlet: parseThermalNumber(entry.preBedTemp),
        outlet: parseThermalNumber(entry.postBedTemp),
        delta: derived.ambientToInletDelta,
      };
    });

  return (
    <div style={{ marginTop:12, padding:"12px 14px", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:7 }}>
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", alignItems:"flex-end", marginBottom:10 }}>
        <Input label="From" type="date" value={rangeFrom} onChange={setRangeFrom} style={{ flex:"1 1 150px", marginBottom:0 }} />
        <Input label="To" type="date" value={rangeTo} onChange={setRangeTo} style={{ flex:"1 1 150px", marginBottom:0 }} />
      </div>
      {chartData.length === 0 ? (
        <div style={{ padding:"36px 16px", textAlign:"center", color:C.muted, fontSize:14, border:`1px dashed ${C.border}`, borderRadius:12 }}>No thermal readings in this range yet. Add a reading above to start the chart.</div>
      ) : (
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top:5, right:24, bottom:18, left:0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
          <XAxis dataKey="ts" tick={{ fontSize:12, fill:C.ink }} />
          <YAxis tick={{ fontSize:12, fill:C.ink }} />
          <YAxis yAxisId="delta" orientation="right" tick={{ fontSize:12, fill:C.ink }} />
          <Tooltip formatter={(v,n)=>[v,n]} labelFormatter={(label, payload)=>payload && payload[0] ? payload[0].payload.fullTs : label} />
          <Legend />
          <Line type="monotone" dataKey="ambient" stroke={C.blue} strokeWidth={1.5} dot={false} name="Ambient (deg C)" />
          <Line type="monotone" dataKey="inlet" stroke={C.red} strokeWidth={2} dot={false} name="Pre-bed inlet (deg C)" />
          <Line type="monotone" dataKey="outlet" stroke={C.teal} strokeWidth={1.5} dot={false} name="Post-bed outlet (deg C)" />
          <Line yAxisId="delta" type="monotone" dataKey="delta" stroke={C.gold} strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Ambient-to-inlet delta (deg C)" />
          <ReferenceLine yAxisId="delta" y={settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C} stroke={C.amber} strokeDasharray="3 3" label={{ value:"Current correction", fill:C.amber, fontSize:12 }} />
        </ComposedChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}

// ============================================================
// TEMPERATURE ANALYSIS TAB
// ============================================================
function TempAnalysisTab({ vocC, pahC, settings, pahRisk }) {
  const nf = settings.naphthaleneFrac;
  const stackTempCorrection = settings.stackTempCorrectionC ?? 10.3;
  const pahThresh500 = pahFailTemp(500, pahC);
  const pahThresh = pahThresh500;
  var pahAmbientThreshold_C = parseFloat(((pahThresh500 - STACK_TEMP_A) / STACK_TEMP_B).toFixed(1));
  // ~11.6 C: ambient at which estimateStackTemp reaches the PAH ELV breach stack temperature.
  // Near-independent of hours. Replaces the previous hardcoded threshold figure.
  const windowChart = [-5,0,5,10,12,15,18,20,25].map(t=>({
    temp:t,
    vocDry:  safeWindowHoursVOC(t,60,vocC,nf),
    vocTyp:  safeWindowHoursVOC(t,80,vocC,nf),
    vocWet:  safeWindowHoursVOC(t,90,vocC,nf),
  }));
  // SEASON_PAH_AMBIENT_THRESHOLD_C removed v1.6.0 -- value was arithmetically incorrect.
  // Compute live from pahFailTemp(activeHrs, pahC) via regression inverse.
  // See audit C&G-GAC-2026-AUDIT-001.
  // seasonRec: climatological reference data for seasonal cards.
  // tOp is computed at render time: operativeTemp(s.ambT, stackTempCorrection).
  // Do not add a stored operative-display field -- it goes stale when the correction changes.
  // v2.3.0: season notes are generated from the live PAH threshold so they cannot contradict it.
  const seasonDefs = [
    { season:"Winter (Dec-Feb)", months:[11,0,1], rh:87 },
    { season:"Spring (Mar-May)", months:[2,3,4], rh:78 },
    { season:"Summer (Jun-Aug)", months:[5,6,7], rh:75 },
    { season:"Autumn (Sep-Nov)", months:[8,9,10], rh:85 },
  ];
  const monthName = m => ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m];
  const seasonRec = seasonDefs.map(function(d) {
    const temps = d.months.map(m => BOSTON_MONTHLY_TEMPS[m]);
    const ambT = Math.round(temps.reduce((a, t) => a + t, 0) / temps.length * 10) / 10;
    const warmest = Math.max(...temps);
    const warmMonth = monthName(d.months[temps.indexOf(warmest)]);
    // v2.9.0: season PAH band = worst hot-day level among the season's months (same as Home and the plan).
    const order = ["Low","Moderate","Elevated","High"];
    const hotMonths = pahRisk ? d.months.map(m => pahRisk.season[m]) : null;
    const worstHot = hotMonths ? hotMonths.reduce((w, o) => order.indexOf(o.level) > order.indexOf(w.level) ? o : w, hotMonths[0]) : null;
    const pahGoverns = worstHot ? worstHot.level === "High" : ambT >= pahAmbientThreshold_C;
    const margin = pahAmbientThreshold_C - warmest;
    const seasonTop = operativeTemp(ambT, settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C);
    const seasonBand = worstHot ? worstHot.level : pahRiskLabelForOperativeTemp(seasonTop);
    const hotNote = worstHot
      ? "Hot-day PAH (" + pahRisk.pct + "th percentile): in " + monthName(worstHot.m) + " a bed can carry about " + (worstHot.days != null ? worstHot.days : "--") + " days of loading before a hot day (stack ~" + worstHot.stackHot.toFixed(0) + " C) could breach PAH."
      : "";
    const bandNote = worstHot ? "" : (seasonBand === "Elevated" || seasonBand === "High")
      ? " Season-mean operative temperature " + seasonTop.toFixed(1) + " C is in the " + seasonBand.toLowerCase() + " PAH band: older beds breach at lower temperatures (the 2026 summer bed exceeded the PAH limit at 25.5 to 33 C stack)."
      : "";
    const pahNote = worstHot ? hotNote : pahGoverns
      ? "Mean ambient " + ambT.toFixed(1) + " C is at or above the PAH threshold (~" + pahAmbientThreshold_C.toFixed(1) + " C ambient, 500 hr bed): PAH governs this season."
      : margin <= 4
        ? "Warmest month " + warmMonth + " (" + warmest.toFixed(1) + " C mean) is within " + margin.toFixed(1) + " C of the PAH threshold (~" + pahAmbientThreshold_C.toFixed(1) + " C ambient, 500 hr bed). Warm spells and older beds can cross it: watch the PAH forecast."
        : "";
    const pahNoteFull = (pahNote + bandNote).trim();
    const ambientNote = "Mean " + ambT.toFixed(1) + " C (" + d.months.map(m => monthName(m) + " " + BOSTON_MONTHLY_TEMPS[m].toFixed(1)).join(", ") + "). " +
      (pahGoverns ? "PAH-led scheduling." : "VOC saturation is the operative constraint on climate averages.");
    return { season:d.season, ambT, rh:d.rh, pahGoverns, pahNote:pahNoteFull, ambientNote, seasonBand };
  });
  return (
    <div>
      <Card>
        <SectionTitle>PAH Temperature Threshold Analysis</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          <StatPill label="PAH ELV Threshold (500 hr ref)" value={pahThresh.toFixed(1)} unit="C stack"
            color={C.red} sub={"~" + pahAmbientThreshold_C.toFixed(1) + "C ambient (500 hr reference)"} />
          <StatPill label="PAH Model R2" value={pahC.r2!=null?pahC.r2.toFixed(3):"default"} unit=""
            color={pahC.r2>0.9?C.teal:C.amber} sub="Temperature-only model" />
          <StatPill label="Uncertainty" value={"x"+Math.exp(pahC.rmse||PAH_RMSE_LOG).toFixed(2)} unit=""
            color={C.blue} sub="1SD multiplicative" />
        </div>
        <Fold title="P7 vs P8: the two breakthrough mechanisms">
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.75 }}>
          {"P7 vs P8 dual-mechanism confirmation: P7 ran 1,387 hrs at 6.1 deg C ambient (T_op 16.4 deg C at +10.3 offset) -- VOC 5.9 mg/m3, PAH 340 ug/m3, both well inside ELV. P8 ran 1,495 hrs at 11.6 deg C ambient (T_op 21.9 deg C) -- VOC 105 mg/m3 (5.25x ELV, certified JOB-2865), PAH 295 ug/m3 (inside ELV). P4 ran 380 hrs at 22.5 deg C ambient (T_op 32.8 deg C) -- VOC 18.2 mg/m3 (inside ELV), PAH 5,369 ug/m3 (5.4x ELV). This dataset confirms the dual breakthrough mechanism: VOC failure is hours-driven (P8 at modest temperature); PAH failure is temperature-driven (P4 at low hours but high temperature). These are independent failure modes requiring separate scheduling tracks. PAH ambient threshold: ~" + pahAmbientThreshold_C.toFixed(1) + " deg C (model-derived, v1.6.0). Site-measured offset from Testo 925 spot readings: pre-bed inlet 22.7 deg C, external ambient 12.4 deg C, delta +10.3 deg C. Model uses settings.stackTempCorrectionC for all live calculations; +10.3 deg C noted here as the directly measured site constant pending continuous logging validation."}
        </div>
        </Fold>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          Seasonal PAH threshold references in this tab are fixed 500-hour comparison points for climatology only. Live Dashboard PAH status is recalculated at the current active-hours state.
        </div>
      </Card>

      <Card>
        <SectionTitle>VOC Safe-Hours Window by Temperature and Humidity</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={windowChart} margin={{ top:5, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="temp" label={{ value:"Ambient Temp (C)", position:"insideBottom", offset:-8, fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <YAxis label={{ value:"Safe hrs to ELV breach", angle:-90, position:"insideLeft", fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[v.toLocaleString()+" hrs",n]} />
            <Line type="monotone" dataKey="vocDry"  stroke={C.teal}  strokeWidth={1.5} dot={false} name="RH 60%" strokeDasharray="5 2" />
            <Line type="monotone" dataKey="vocTyp"  stroke={C.rund} strokeWidth={2.5} dot={false} name="RH 80%" />
            <Line type="monotone" dataKey="vocWet"  stroke={C.amber} strokeWidth={1.5} dot={false} name="RH 90%" strokeDasharray="5 2" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:24, flexWrap:"wrap", marginTop:8, fontSize:12, color:C.muted }}>
          {[
            { label:"RH 60%", color:C.teal, dash:"dashed" },
            { label:"RH 80%", color:C.rund, dash:"solid" },
            { label:"RH 90%", color:C.amber, dash:"dashed" },
          ].map(item=>(
            <div key={item.label} style={{ display:"inline-flex", alignItems:"center", gap:6, minWidth:70 }}>
              <span style={{ width:20, height:0, borderTop:`3px ${item.dash} ${item.color}`, display:"inline-block" }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
          WJ fraction {(nf*100).toFixed(0)}% applied. Higher fraction = shorter window.
          {" "}Safe window is calculated at ambient temperature, consistent with the regression calibration
          basis (coefficient b was fitted against MCERTS ambient temperature measurements).
          {" "}T_operative (ambient + {stackTempCorrection.toFixed(1)}C correction) is shown on the seasonal
          cards for operational reference only and is not used in the inversion calculation.
          {" "}<span style={{ color:C.amber, fontWeight:700 }}>Conservative compliance posture: RH 90% curve.</span>
        </div>
      </Card>

      <Card>
        <SectionTitle>
          Seasonal Summary -- Boston Lincolnshire Site-Calibrated
        </SectionTitle>
        <Fold title="About the climate data">
        <div style={{
          padding: "9px 12px",
          background: TINT.blueBg,
          border: "1px solid " + C.blue,
          borderRadius: 7,
          fontSize: 12,
          color: TINT.blueText,
          marginBottom: 12,
          lineHeight: 1.6,
        }}>
          {"Ambient values are 30-year climatological means for Boston Lincolnshire PE21 (52.9833N 0.0167W). T_operative uses the site-measured ambient-to-inlet offset of +10.3 deg C from Testo 925 spot readings (pre-bed inlet vs external ambient). RH values are monthly means. VOC safe window is calculated at seasonal mean conditions using the live-calibrated VOC model. Where PAH governs (summer), the VOC figure is shown for reference only and must not be used for scheduling. PAH threshold: approximately " + pahAmbientThreshold_C.toFixed(1) + " deg C ambient (model-derived by regression inverse)."}
        </div>
        </Fold>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {seasonRec.map((s, i) => {
            const tOp = operativeTemp(s.ambT, stackTempCorrection);
            const vocW = safeWindowHoursVOC(
              s.ambT, s.rh, vocC, nf
            );
            // Same PAH risk scale as the Overview season strip (season-mean operative temperature).
            const pahBand = s.seasonBand || pahRiskLabelForOperativeTemp(tOp);
            const pahOk = !s.pahGoverns && pahBand === "Low";
            const borderColor = s.pahGoverns
              ? C.red
              : vocW < 500
              ? C.red
              : vocW < 900
              ? C.amber
              : vocW < 1300
              ? C.gold
              : C.teal;
            return (
              <div
                key={i}
                style={{
                  flex: "1 1 200px",
                  background: C.ivory,
                  border: "2px solid " + alpha(borderColor, 25),
                  borderLeft: "4px solid " + borderColor,
                  borderRadius: 7,
                  padding: "14px 16px",
                }}
              >
                <div style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: C.ink,
                  marginBottom: 4,
                }}>
                  {s.season}
                </div>
                <div style={{
                  fontSize: 12,
                  color: C.muted,
                  marginBottom: 6,
                  lineHeight: 1.45,
                }}>
                  Ambient {s.ambT} deg C | T_op {tOp.toFixed(1)} deg C
                  | RH {s.rh}%
                </div>
                <div style={{
                  fontSize: 13,
                  fontFamily: MONO,
                  fontWeight: 700,
                  color: s.pahGoverns ? C.muted : borderColor,
                  marginBottom: 4,
                  textDecoration: s.pahGoverns ? "line-through" : "none",
                }}>
                  {vocW.toLocaleString()} hrs VOC
                </div>
                {s.pahGoverns && (
                  <div style={{
                    fontSize: 12,
                    color: C.red,
                    fontWeight: 800,
                    marginBottom: 4,
                  }}>
                    PAH GOVERNS -- VOC figure not operative
                  </div>
                )}
                <div style={{
                  fontSize: 12,
                  color: pahOk ? C.teal : pahBand === "Moderate" ? C.amber : C.red,
                  fontWeight: 600,
                  marginBottom: 6,
                }}>
                  PAH: {s.pahGoverns
                    ? "DOMINANT CONSTRAINT"
                    : pahBand.toUpperCase() + " RISK"}
                </div>
                {!s.pahGoverns && (
                  <div style={{
                    fontSize: 12,
                    color: C.muted,
                    marginBottom: 4,
                  }}>
                    ~{Math.round(vocW / (24 * (settings.utilisationRate || 0.82)))} days at {Math.round((settings.utilisationRate || 0.82) * 100)}% util
                  </div>
                )}
                <div style={{
                  fontSize: 12,
                  color: C.muted,
                  marginTop: 6,
                  lineHeight: 1.45,
                  borderTop: "1px solid " + C.border,
                  paddingTop: 6,
                }}>
                  {s.ambientNote}
                </div>
                {s.pahNote && (
                  <div style={{
                    fontSize: 12,
                    color: s.pahGoverns ? C.red : TINT.amberText,
                    marginTop: 6,
                    padding: "5px 7px",
                    background: s.pahGoverns ? TINT.redBg : TINT.amberBg,
                    borderRadius: 5,
                    lineHeight: 1.45,
                    fontWeight: 600,
                  }}>
                    {s.pahNote}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{
          marginTop: 12,
          padding: "10px 14px",
          background: TINT.redBg,
          border: "1px solid " + C.red,
          borderRadius: 7,
          fontSize: 12,
          color: TINT.redText,
          lineHeight: 1.6,
          fontWeight: 700,
        }}>
          {(function() {
            const hot = BOSTON_MONTHLY_TEMPS.map((t, m) => ({ t, m })).filter(x => x.t >= pahAmbientThreshold_C);
            const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const head = "PAH SCHEDULING NOTE: the model PAH breach is ~" + pahThresh.toFixed(1) + " C stack (~" + pahAmbientThreshold_C.toFixed(1) + " C ambient) for a 500 hr bed. ";
            const months = hot.length
              ? "On climate averages this is reached in " + hot.map(x => names[x.m]).join(", ") + ": PAH governs scheduling in those months. "
              : "No month reaches it on climate averages, so PAH risk comes from warm spells and older beds rather than the average season. ";
            const evidence = "Stack test evidence: every PAH exceedance (P3, P4, P10, P11, P12) was at 25.5 C stack or above; P4 breached on fresh carbon at 27.7 C stack. Use the Forward Forecast PAH projection from May to September.";
            return head + months + evidence;
          })()}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// FORWARD FORECAST TAB
// ============================================================
function ForwardForecastTab({ stackData, settings, onSettingChange, lastChangeout, onChangeoutDateChange, vocC, pahC, thermalStats, canEdit, currentActiveHrs, pahRisk }) {
  const today = useMemo(()=>new Date(),[]);
  const [mode, setMode] = useState("seasonal");
  const [flatTemp, setFlatTemp] = useState(settings.typicalTempC);
  const [monthlyTemps, setMonthlyTemps] = useState(BOSTON_MONTHLY_TEMPS);
  const [activeOverride, setActiveOverride] = useState("");
  const [pahTempOverride, setPahTempOverride] = useState("");
  const [liveTemps, setLiveTemps] = useState(null);
  const [liveStatus, setLiveStatus] = useState("");

  const utilisationPct = Math.round((settings.utilisationRate || 0.82) * 1000) / 10;
  const fallbackAmbientToInletOffset = settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C;
  const thermalOffsetReady = thermalStats && thermalStats.ready;
  const useSiteMeasuredOffset = !!settings.useSiteMeasuredThermalOffset;
  const activeAmbientToInletOffset = thermalOffsetReady && useSiteMeasuredOffset ? thermalStats.meanAmbientToInletDelta : fallbackAmbientToInletOffset;
  const preTestBufferDays = settings.preTestBufferDays ?? 14;
  const preTestBufferActiveHrs = settings.preTestBufferActiveHrs ?? 150;
  const autoActiveHrs = Math.max(0, Math.round(daysBetween(lastChangeout, today) * 24 * (utilisationPct / 100)));
  const autoEffectiveActiveHrs = calcEffectiveHours(autoActiveHrs, lastChangeout, isoDateFromDate(today));
  // v2.8.1 audit: start from the same bed loading as Home and Dashboard (charge log when synced),
  // so the forecast tab gives the same date as every other screen.
  const baseActiveHrs = Number.isFinite(currentActiveHrs) ? currentActiveHrs : autoEffectiveActiveHrs;
  const startActiveHrs = activeOverride !== "" ? Math.max(0, parseFloat(activeOverride) || 0) : baseActiveHrs;

  useEffect(()=>{
    if (mode !== "live" || liveTemps) return;
    setLiveStatus("Fetching 7-day Open-Meteo forecast...");
    fetch("https://api.open-meteo.com/v1/forecast?latitude=52.9833&longitude=-0.0167&hourly=temperature_2m&forecast_days=7")
      .then(r=>r.json())
      .then(d=>{
        const vals = d && d.hourly && d.hourly.time && d.hourly.temperature_2m ? d.hourly : null;
        if (vals && vals.temperature_2m.length) {
          const byDay = {};
          vals.time.forEach((ts,i)=>{ const day=ts.slice(0,10); if(!byDay[day]) byDay[day]=[]; byDay[day].push(vals.temperature_2m[i]); });
          setLiveTemps(Object.values(byDay).map(arr=>Math.round((arr.reduce((s,v)=>s+v,0)/arr.length)*10)/10));
          setLiveStatus("Using live Open-Meteo forecast for days 1-7, then climatology.");
        } else {
          setLiveTemps([]);
          setLiveStatus("Live forecast unavailable. Falling back to seasonal climatology.");
        }
      })
      .catch(()=>{
        setLiveTemps([]);
        setLiveStatus("Live forecast unavailable. Falling back to seasonal climatology.");
      });
  },[mode, liveTemps]);

  const forecastRaw = useMemo(()=>buildForwardForecast({
    startDate: today,
    startActiveHrs,
    utilisationPct,
    mode,
    flatTemp,
    monthlyTemps,
    liveTemps,
    correctionFactor: activeAmbientToInletOffset,
    pahStackTempOverride: pahTempOverride,
    isSameCarbonCharge: !!settings.isSameCarbonCharge,
    vocC,
    pahC,
    maxDays: 365,
    settings,
    forecastRH: settings.useConservativeRH ? 90 : 80,
  }),[today,startActiveHrs,utilisationPct,mode,flatTemp,monthlyTemps,liveTemps,activeAmbientToInletOffset,pahTempOverride,vocC,pahC,settings]);
  // v2.9.0: the PAH risk label on each day is the hot-day risk for the current bed (same as Home),
  // replacing the fixed operative-temperature bands.
  const forecast = useMemo(()=>{
    if (!pahRisk) return forecastRaw;
    const rows = forecastRaw.rows.map(r => {
      const pr = pahRisk.days.rows[r.day];
      return pr ? { ...r, pahRisk: pr.level } : r;
    });
    return { ...forecastRaw, rows };
  }, [forecastRaw, pahRisk]);

  const binding = (() => {
    const sameBedActive = settings.isSameCarbonCharge && forecast.sameBedLimit;
    if (sameBedActive && (!forecast.vocBreach || forecast.sameBedLimit.day <= forecast.vocBreach.day) && (!forecast.pahBreach || forecast.sameBedLimit.day <= forecast.pahBreach.day)) return { type:"Same-bed VOC limit", row:forecast.sameBedLimit };
    if (forecast.vocBreach && forecast.pahBreach) return forecast.vocBreach.day <= forecast.pahBreach.day ? { type:"VOC", row:forecast.vocBreach } : { type:"PAH", row:forecast.pahBreach };
    if (forecast.vocBreach) return { type:"VOC", row:forecast.vocBreach };
    if (forecast.pahBreach) return { type:"PAH", row:forecast.pahBreach };
    return { type:"None", row:null };
  })();
  const bufferDaysFromHrs = Math.ceil(preTestBufferActiveHrs / Math.max(forecast.dailyActiveHrs, 1));
  const effectiveBufferDays = Math.max(preTestBufferDays, bufferDaysFromHrs);
  const dropletFalloutScheduleSummary = stackData.map(function(row) {
    return row.period + ": " + dropletFalloutShortLabel(row.dropletFalloutObserved);
  }).join(" | ");
  const latestTestDate = binding.row ? isoDateFromDate(addDays(today, Math.max(0, binding.row.day - effectiveBufferDays))) : "Not within horizon";
  const vocEarlyDate = forecast.vocEarlyDay != null ? isoDateFromDate(addDays(today, forecast.vocEarlyDay)) : "Not within horizon";
  const vocLateDate = forecast.vocLateDay != null ? isoDateFromDate(addDays(today, forecast.vocLateDay)) : "Not within horizon";
  const chartRows = forecast.rows.slice(0, Math.min(forecast.rows.length, 366));
  const highZones = [];
  let zoneStart = null;
  chartRows.forEach((row, i)=>{
    const hot = row.tOperative >= 26;
    if (hot && zoneStart == null) zoneStart = row.day;
    if ((!hot || i === chartRows.length - 1) && zoneStart != null) {
      highZones.push({ start: zoneStart, end: hot && i === chartRows.length - 1 ? row.day : chartRows[Math.max(0,i-1)].day });
      zoneStart = null;
    }
  });

  const modeButtons = [
    { id:"flat", label:"Flat Average" },
    { id:"seasonal", label:"Seasonal Profile" },
    { id:"live", label:"Live Weather Forward" },
  ];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const exportSchedule = () => {
    const rmse = vocUncertaintyMultiplier(vocC);
    var calibPeriods = stackData.filter(function(d) {
      return d.sameCarbon === false && d.voc != null;
    });
    var calibMinHrs = Math.min.apply(null, calibPeriods.map(function(d) { return d.activeHrs; }));
    var calibMaxHrs = Math.max.apply(null, calibPeriods.map(function(d) { return d.activeHrs; }));
    var calibMinTemp = Math.min.apply(null, calibPeriods.map(function(d) { return d.avgTemp; }));
    var calibMaxTemp = Math.max.apply(null, calibPeriods.map(function(d) { return d.avgTemp; }));
    var forecastTemps = mode === "flat" ? [flatTemp] : monthlyTemps;
    var forecastMinTemp = Math.min.apply(null, forecastTemps);
    var forecastMaxTemp = Math.max.apply(null, forecastTemps);
    var isExtrapolatingHrs = startActiveHrs > calibMaxHrs;
    var isExtrapolatingTemp = forecastMinTemp < calibMinTemp || forecastMaxTemp > calibMaxTemp;
    var calibEnvelopeLines = [
      "",
      "CALIBRATION ENVELOPE",
      "Model calibrated on independent fresh-carbon periods (sameCarbon=false).",
      `Active hours range: ${calibMinHrs} to ${calibMaxHrs} hrs`,
      `Ambient temperature range: ${calibMinTemp.toFixed(1)} to ${calibMaxTemp.toFixed(1)} degC`,
      ""
    ];
    if (isExtrapolatingHrs) {
      calibEnvelopeLines.push(`WARNING: Current active hours (${startActiveHrs} hrs) EXCEED the calibration maximum (${calibMaxHrs} hrs). Hours forecast is an extrapolation beyond validated model range. Treat breach date prediction with increased caution.`);
    } else {
      calibEnvelopeLines.push(`Active hours at forecast start (${startActiveHrs} hrs) are within the calibrated range.`);
    }
    calibEnvelopeLines.push("");
    if (isExtrapolatingTemp) {
      calibEnvelopeLines.push(`WARNING: Forecast temperature scenario includes temperatures outside the calibration range (${calibMinTemp.toFixed(1)}-${calibMaxTemp.toFixed(1)} degC). Temperature extrapolation increases prediction uncertainty.`);
    } else {
      calibEnvelopeLines.push("Forecast temperature range is within the calibrated range.");
    }
    calibEnvelopeLines.push(
      "",
      "MODEL LIMITATION STATEMENT",
      "This output supports but does not replace MCERTS-certified stack testing as the",
      "primary compliance verification method under permit EPR/A2/1.",
      "Predictions are based on a statistical regression model with limited calibration",
      "data. The Environment Agency should be consulted before any compliance decision",
      "is based solely on model output."
    );
    const lines = [
      "CALDERS & GRANDIDGE (BOSTON) LTD",
      "Carbon Bed MCERTS Stack Test Schedule",
      `Generated: ${isoDateFromDate(today)}`,
      `Permit: EPR/A2/1 | Carbon Changeout: ${lastChangeout}`,
      `Model: Carbon Bed Predictability Model ${MODEL_VERSION} (${MODEL_BUILD_DATE})`,
      "",
      "PREDICTED BREACH DATES (CENTRAL ESTIMATE)",
      `VOC ELV Breach: ${forecastDateLabel(forecast.vocBreach)}`,
      `PAH ELV Breach: ${forecast.pahBreach ? forecastDateLabel(forecast.pahBreach) : "Not within 365-day horizon"}`,
      `PAH ELV: ${PAH_ELV_PERMIT_LABEL}`,
      `Binding Constraint: ${binding.type}`,
      `A4 Liquid Droplets Fallout: ${dropletFalloutScheduleSummary}`,
      "",
      "SCHEDULING RECOMMENDATION",
      `Latest recommended stack test date: ${latestTestDate}`,
      `  (Binding breach date minus ${effectiveBufferDays} day buffer)`,
      `Confidence range: ${vocEarlyDate} to ${vocLateDate}`,
      "",
      `TEMPERATURE SCENARIO: ${mode}`,
      `Utilisation rate assumed: ${utilisationPct}%`,
      `Active ambient-to-inlet offset: +${activeAmbientToInletOffset.toFixed(1)}C`,
      "",
      "UNCERTAINTY NOTE",
      `Model calibrated on ${vocC.n} independent stack test periods.`,
      `R2 = ${vocC.r2!=null?vocC.r2.toFixed(3):"default"}. Uncertainty band: x${Math.exp(rmse).toFixed(2)} (effective RMSE).`,
      "This output supports but does not replace MCERTS-certified stack testing",
      "as the primary compliance verification method.",
      ...calibEnvelopeLines,
      "Envirocare contact: "
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type:"text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `mcerts-schedule-${isoDateFromDate(today)}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <Card>
        <SectionTitle>Current Carbon State</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Last Carbon Changeout" type="date" value={lastChangeout} onChange={onChangeoutDateChange} style={{ flex:"1 1 170px" }} disabled={!canEdit} />
          <Input label="Cumulative Active Hrs" type="number" value={activeOverride!==""?activeOverride:autoActiveHrs} onChange={v=>setActiveOverride(v)} style={{ flex:"1 1 170px" }} />
          <div style={{ flex:"1 1 170px" }}>
            <label style={{
              display:"block", fontSize:12, fontWeight:700,
              color:C.muted, letterSpacing:"0.08em",
              textTransform:"uppercase", marginBottom:5
            }}>
              Model VOC at Start (mg/m3)
            </label>
            <div style={{
              height:38, padding:"8px 12px",
              border:`1px solid ${C.border}`, borderRadius:7,
              fontSize:13, color:C.muted, background:C.ivory,
              fontFamily:MONO, boxSizing:"border-box",
              display:"flex", alignItems:"center"
            }}>
              {predictVOC(
                startActiveHrs,
                getScenarioAmbientTemp(0, today, mode, flatTemp, monthlyTemps, liveTemps),
                settings.useConservativeRH ? 90 : 80,
                vocC
              ).toFixed(1)} mg/m3 (predicted)
            </div>
            <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>
              Model prediction at current hours. Anchor scaling removed - see audit note.
            </div>
          </div>
          <Input label="Utilisation Rate (%)" type="number" step="1" min={0} max={100} value={utilisationPct} onChange={v=>onSettingChange("utilisationRate",Math.max(0,Math.min(100,v||0))/100)} style={{ flex:"1 1 170px" }} disabled={!canEdit} />
        </div>
        {(function() {
          var todayStr = new Date().toISOString().slice(0, 10);
          var cfg = getFanConfigAtDate(todayStr);
          if (cfg && cfg.label && cfg.label.toLowerCase().indexOf("reduced") >= 0) {
            return (
              <div style={{ marginTop:10, padding:"12px 14px",
                border:"2px solid " + C.amber, borderRadius:8,
                background:TINT.amberBg, color:TINT.amberText,
                fontSize:12, fontWeight:700, lineHeight:1.5 }}>
                FAN CONFIG B ACTIVE: Extraction fan running at reduced speed
                ({cfg.fanRPM.toLocaleString()} rpm, approx {cfg.typicalStackDischargeFlow_m3hr.toLocaleString()} m3/hr).
                VOC predictions are automatically flow-corrected before the forecast
                baseline and breach dates are calculated.
                PAH model is unaffected.
              </div>
            );
          }
          return null;
        })()}
        <div style={{ fontSize:12, color:C.muted }}>Leave cumulative active hours as the auto value or type an override. Current VOC anchor scaling has been removed; the model prediction at start is shown for audit trail only.</div>
        <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>
          Auto baseline uses {baseActiveHrs.toFixed(0)} effective hrs, the same bed loading as Home and Dashboard (charge log where synced). Days x utilisation alone would give {autoEffectiveActiveHrs.toFixed(0)} hrs.
        </div>
      </Card>

      <Card>
        <SectionTitle>Temperature Scenario Builder</SectionTitle>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {modeButtons.map(btn=>(
            <button key={btn.id} onClick={()=>setMode(btn.id)} style={{ padding:"8px 12px", borderRadius:7, border:`1px solid ${mode===btn.id?C.rund:C.border}`, background:mode===btn.id?C.rund:C.surface, color:mode===btn.id?C.onAccent:C.ink, fontSize:12, fontWeight:700, cursor:"pointer" }}>{btn.label}</button>
          ))}
        </div>
        {mode==="flat" && <Input label="Flat Ambient Temp (C)" type="number" step="0.5" value={flatTemp} onChange={setFlatTemp} style={{ maxWidth:260 }} />}
        {(mode==="seasonal" || mode==="live") && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(92px, 100%), 1fr))", gap:10 }}>
              {monthlyTemps.map((temp,i)=>(
                <Input key={monthNames[i]} label={monthNames[i]} type="number" step="0.1" value={temp} onChange={v=>setMonthlyTemps(arr=>arr.map((x,idx)=>idx===i?v:x))} style={{ marginBottom:0 }} />
              ))}
            </div>
            <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Monthly ambient values are editable climatological averages for Boston, Lincolnshire.</div>
          </div>
        )}
        {mode==="live" && <div style={{ marginTop:10, padding:"9px 12px", borderRadius:7, background:(liveTemps&&liveTemps.length)?TINT.safeBg:TINT.amberBg, color:(liveTemps&&liveTemps.length)?TINT.safeText:TINT.amberText, fontSize:12, fontWeight:600 }}>{liveStatus || "Live mode uses Open-Meteo days 1-7, then seasonal climatology."}</div>}
        <div style={{ marginTop:12, padding:"10px 12px", borderRadius:7, background:C.ivory, border:`1px solid ${C.border}`, fontSize:12, color:C.ink, lineHeight:1.55 }}>
          Active ambient-to-inlet offset: {activeAmbientToInletOffset.toFixed(1)} degrees C ({thermalOffsetReady && useSiteMeasuredOffset ? "site-measured setting" : "settings correction factor"}).
        </div>
      </Card>

      <Card>
        <SectionTitle>PAH Temperature Scenario Override</SectionTitle>
        <Input label="PAH Stack Temp Override (degC) - leave blank to use regression estimate" type="number" step="0.5" min={15} max={40} value={pahTempOverride} onChange={v=>setPahTempOverride(Number.isFinite(v)?v:"")} style={{ maxWidth:420 }} />
        <div style={{ fontSize:12, color:C.muted, marginTop:-6 }}>
          Use this to model worst-case PAH exposure in high-summer operations or to test a specific monitored stack temperature against the PAH model.
        </div>
      </Card>

      <Card style={{ borderLeft:`4px solid ${binding.type==="PAH"?C.red:binding.type==="VOC"?C.amber:C.teal}` }}>
        <SectionTitle>Forward Forecast Summary</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Predicted VOC Breach" value={forecast.vocBreach?forecast.vocBreach.date:"--"} unit="" color={C.amber} sub={`${forecast.vocBreach?forecast.vocBreach.day:"--"} days / ${forecast.vocBreach?forecast.vocBreach.activeHrs.toLocaleString():"--"} active hrs`} />
          <StatPill label="VOC Confidence Range" value={vocEarlyDate} unit="" color={C.blue} sub={`to ${vocLateDate}`} />
          <StatPill label="Predicted PAH Breach" value={forecast.pahBreach?forecast.pahBreach.date:"--"} unit="" color={C.red} sub={forecast.pahBreach?`predictPAH = ${forecast.pahBreach.pahPred.toLocaleString()} ug/m3 at breach`:"Not within horizon"} />
          {pahRisk ? <StatPill label={"Hot-day PAH risk (P" + pahRisk.pct + ")"} value={pahRisk.first ? isoDateFromDate(pahRisk.first.date) : "--"} unit="" color={C.red} sub={pahRisk.first ? "a 1-in-" + Math.round(100 / (100 - pahRisk.pct)) + " hot day could breach from here" : "Not within 365 days"} /> : null}
          <StatPill label="Binding Constraint" value={binding.type} unit="" color={binding.type==="PAH"?C.red:binding.type==="VOC"?C.amber:C.teal} sub="Earlier predicted breach" />
          <StatPill label="Latest Stack Test" value={latestTestDate} unit="" color={C.blue} sub={`${preTestBufferDays} days / ${preTestBufferActiveHrs} active hrs buffer (whichever later)`} />
          <StatPill label="Change carbon by" value={binding.row?binding.row.date:"--"} unit="" color={binding.type==="PAH"?C.red:C.amber} sub="Binding breach date" />
        </div>
        <div style={{ fontSize:12, color:TINT.redText, background:TINT.redBg, border:`1px solid ${C.red}`, borderRadius:7, padding:"9px 12px", marginTop:10, lineHeight:1.55 }}>
          PAH breach date shown is the central model estimate. Uncertainty band: x{Math.exp(pahC.rmse).toFixed(2)} multiplicative (RMSE in log space). PAH model is temperature-dominant - uncertainty in the ambient-to-stack temperature relationship is the primary source of error, not hours accumulation.
        </div>
        <div style={{ marginTop:10 }}><Btn onClick={exportSchedule} variant="gold" small>Export test schedule</Btn></div>
        <div style={{ fontSize:12, color:settings.useConservativeRH?C.amber:C.muted, marginTop:8 }}>
          {settings.useConservativeRH ? "Humidity: Conservative mode (90% RH) - BAT-aligned posture" : "Humidity: Average mode (80% RH) - switch to Conservative for compliance scheduling"}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Confidence band: x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} (effective RMSE in log space, consistent with Dashboard forecast). R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"}. Treat as risk-informed planning estimate.</div>
      </Card>

      <Card>
        <SectionTitle>Day-by-Day Projection</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartRows} margin={{ top:8, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            {highZones.map((z,i)=><ReferenceArea key={i} x1={z.start} x2={z.end} fill={C.red} fillOpacity={0.08} />)}
            <XAxis dataKey="day" label={{ value:"Days from today", position:"insideBottom", offset:-8, fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <YAxis domain={[0, VOC_ELV * 4]} allowDataOverflow label={{ value:"VOC mg/m3", angle:-90, position:"insideLeft", fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
            <ReferenceLine y={VOC_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"VOC ELV 20", fill:C.red, fontSize:12 }} />
            {forecast.sameBedLimit && <ReferenceLine x={forecast.sameBedLimit.day} stroke={C.amber} strokeDasharray="4 2" label={{ value:"1155 hr limit", fill:C.amber, fontSize:12 }} />}
            {binding.row && <ReferenceLine x={Math.max(0,binding.row.day-effectiveBufferDays)} stroke={C.blue} strokeDasharray="3 3" label={{ value:"Latest test", fill:C.blue, fontSize:12 }} />}
            {binding.row && <ReferenceLine x={binding.row.day} stroke={binding.type==="PAH"?C.red:C.amber} strokeDasharray="5 2" label={{ value:"Breach", fill:binding.type==="PAH"?C.red:C.amber, fontSize:12 }} />}
            <Area type="monotone" dataKey="vocHi" stroke="none" fill={C.amber} fillOpacity={0.12} name="Upper band" />
            <Area type="monotone" dataKey="vocLo" stroke="none" fill={C.surface} fillOpacity={0.9} name="Lower band" />
            <Line type="monotone" dataKey="vocMid" stroke={C.rund} strokeWidth={2.5} dot={false} name="Predicted VOC" />
            <Line type="monotone" dataKey="vocHi" stroke={C.amber} strokeWidth={1} dot={false} strokeDasharray="4 2" name="Upper confidence" />
            <Line type="monotone" dataKey="vocLo" stroke={C.blue} strokeWidth={1} dot={false} strokeDasharray="4 2" name="Lower confidence" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Red background indicates days where T_operative is at or above 26C and PAH is high risk. The 1,155-hr same-bed limit line is shown only when Same carbon is enabled in Settings. It does not apply to fresh carbon charges.</div>
      </Card>

      <Card>
        <SectionTitle>PAH Temperature Forecast (with Confidence Band)</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartRows} margin={{ top:8, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="day" label={{ value:"Days from today", position:"insideBottom", offset:-8, fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <YAxis domain={[0, PAH_ELV * 4]} allowDataOverflow label={{ value:"PAH ug/m3", angle:-90, position:"insideLeft", fontSize:12, fill:C.ink }} tick={{ fontSize:12, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toLocaleString():v,n]} />
            <ReferenceLine y={PAH_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"PAH ELV 1 mg/Nm3", fill:C.red, fontSize:12 }} />
            {forecast.pahBreach && <ReferenceLine x={forecast.pahBreach.day} stroke={C.red} strokeDasharray="5 2" label={{ value:"PAH breach", fill:C.red, fontSize:12 }} />}
            <Area type="monotone" dataKey="pahPredHi" stroke="none" fill={C.red} fillOpacity={0.08} name="Upper (x1 RMSE)" />
            <Area type="monotone" dataKey="pahPredLo" stroke="none" fill={C.surface} fillOpacity={0.9} name="Lower (x1 RMSE)" />
            <Line type="monotone" dataKey="pahPred" stroke={C.red} strokeWidth={2.5} dot={false} name="Predicted PAH" />
            <Line type="monotone" dataKey="pahPredHi" stroke={C.amber} strokeWidth={1} strokeDasharray="4 2" dot={false} name="Upper confidence" />
            <Line type="monotone" dataKey="pahPredLo" stroke={C.blue} strokeWidth={1} strokeDasharray="4 2" dot={false} name="Lower confidence" />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
          Confidence band: x{Math.exp(pahC && pahC.rmse != null ? pahC.rmse : PAH_RMSE_LOG).toFixed(3)} (RMSE in log space = {(pahC && pahC.rmse != null ? pahC.rmse : PAH_RMSE_LOG).toFixed(4)}). The band width reflects the scatter in the fresh-carbon PAH calibration (R2={pahC && pahC.r2 != null ? pahC.r2.toFixed(3) : "default"}). PAH predictions are sensitive to the ambient-to-stack temperature estimate; this uncertainty is the primary risk factor, not model RMSE. Stack temp override available above.
        </div>
      </Card>

      <Card>
        <SectionTitle>Temperature Profile Used</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(130px, 100%), 1fr))", gap:8, maxHeight:310, overflowY:"auto", paddingRight:4 }}>
          {forecast.rows.slice(0,120).map(row=>(
            <div key={row.day} style={{ border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", background:row.pahRisk==="High"?C.red:row.pahRisk==="Elevated"?TINT.redBg:row.pahRisk==="Moderate"?TINT.amberBg:C.surface2, color:row.pahRisk==="High"?TINT.redText:C.ink }}>
              <div style={{ fontSize:12, color:C.muted, fontWeight:700 }}>Day {row.day} | {row.date}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:C.ink }}>Amb {row.ambient}C</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:row.tOperative>=26?C.red:C.blue }}>T_op {row.tOperative}C</div>
              <div style={{ fontSize:12, color:C.muted }}>{row.source} | hot-day PAH {row.pahRisk}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Showing first 120 projected days. Forecast calculation continues until the first binding breach or 730 days.</div>
      </Card>

      <Card>
        <SectionTitle>Assumptions and Limitations</SectionTitle>
        <Fold title="Read the assumptions and limitations">
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>
          This forecast is derived from a multivariate VOC regression model calibrated against independent stack test periods (R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"}). PAH breach dates use the calibrated predictPAH model. Predictions should be treated as risk-informed planning estimates, not guaranteed changeout intervals. Model accuracy will improve as additional stack test periods are calibrated. Active ambient-to-inlet offset of +{activeAmbientToInletOffset.toFixed(1)}C applied to all ambient inputs. This tool supports but does not replace MCERTS-certified stack testing as the primary compliance verification method. Anchor scaling from a current VOC reading has been removed: a proportional residual at the current hours count cannot be assumed to hold across the forecast horizon under a log-linear model structure, and the bias was most severe at high residual periods such as P8 (105 mg/m3 certified, 5.25x ELV). The unanchored regression prediction is used throughout.
        </div>
        </Fold>
        <div style={{ marginTop:10, padding:"10px 14px", background:settings.useConservativeRH?TINT.safeBg:TINT.amberBg, border:`1px solid ${settings.useConservativeRH?C.teal:C.amber}`, borderRadius:7, color:settings.useConservativeRH?TINT.safeText:TINT.amberText, fontSize:12, lineHeight:1.55, fontWeight:700 }}>
          Humidity assumption: {settings.useConservativeRH ? "Conservative mode ON - 90% RH applied to all forecast periods. BAT-aligned for Boston, Lincolnshire." : "Conservative mode OFF - 80% RH average applied. For compliance scheduling, enable Conservative Humidity Mode in Settings."}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// ============================================================
function BATComplianceTab({ settings, onChange, canEdit, stackData }) {
  const dropletFalloutSummary = (stackData || []).map(function(row) {
    return row.period + ": " + dropletFalloutShortLabel(row.dropletFalloutObserved);
  }).join(" | ");
  const rows = [
    ["BAT 51(a)", "Activated carbon adsorption with regeneration or disposal", "IMPLEMENTED", "6,000 kg GAC bed, single-pass, disposal at changeout"],
    ["BAT 51(b)", "Regular monitoring of carbon saturation", "IMPLEMENTED", "MCERTS stack testing P1-P14, this model provides predictive scheduling"],
    ["BAT 51(c)", "Lead-lag (series) carbon bed configuration", "NOT YET IMPLEMENTED", "Identified as priority compliance intervention. Lead bed reaches saturation first and is replaced while lag bed continues to protect; provides direct compliance safety net without process interruption. Lower capital cost and operationally simpler than pre-treatment alternatives."],
    ["BAT 52", "VOC ELV 20 mg/m3", "MONITORING", "ELV formally applied from November 2025. Exceedances P8 105 mg/m3 and P9-P12 44.6-166 mg/m3 (summer 2026 bed). Corrective action in progress."],
    ["BAT 52", "PAH ELV " + PAH_ELV_PERMIT_LABEL, "MONITORING", "Temperature-driven exceedances: P4 5,369, P10 2,116, P11 7,950, P12 1,300 ug/m3. P8 295 ug/m3 (inside ELV)."],
    ["Permit A4", "Liquid Droplets Fallout (Vapour Separation Plant)", "MONITORING", "Status by period: " + dropletFalloutSummary + ". Permit Reference: Schedule 4, Table 4.1. Qualitative inspection condition, not a concentration limit. Not used in predictive model calculations."],
  ];
  return (
    <div>
      <Card>
        <SectionTitle>STS BREF BAT 51/52 Compliance Status | Decision (EU) 2020/2009 | Permit EPR/A2/1</SectionTitle>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["BAT Reference","Measure","Status","Notes"].map(h=><th key={h} style={{ textAlign:"left", padding:"7px 9px", borderBottom:`2px solid ${C.border}`, color:C.muted, fontSize:12, textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=><tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.ivory:C.surface }}>
              <td style={{ padding:"7px 9px", fontWeight:700 }}>{r[0]}</td><td style={{ padding:"7px 9px" }}>{r[1]}</td><td style={{ padding:"7px 9px" }}><Badge text={r[2]} color={r[2]==="IMPLEMENTED"?C.teal:r[2]==="MONITORING"?C.amber:C.red} /></td><td style={{ padding:"7px 9px", color:C.muted }}>{r[3]}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card>
        <SectionTitle>Lead-Lag Configuration Assessment</SectionTitle>
        <Fold title="Read the lead-lag assessment">
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>
          BAT 51(c) - Lead-Lag GAC Configuration: A lead-lag (series) bed configuration would install a second carbon vessel in series downstream of the primary bed. When the lead bed reaches a defined breakthrough threshold (e.g. 80% of VOC ELV), it is taken offline for carbon replacement while the lag bed continues to provide abatement. This approach: (1) eliminates the risk of permit exceedance during the changeout window, (2) provides a direct compliance safety net independent of temperature-driven prediction uncertainty, (3) is explicitly named BAT under Decision (EU) 2020/2009 BAT 51(c), and (4) is lower capital cost and operationally simpler than condensation pre-treatment or thermal oxidation. Status: ASSESSMENT PENDING. Recommend formal feasibility assessment for inclusion in the next permit review submission.
        </div>
        </Fold>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginTop:14 }}>
          <Input label="Last reviewed" type="date" value={settings.batReviewDate} onChange={v=>onChange("batReviewDate",v)} style={{ flex:"1 1 180px" }} disabled={!canEdit} />
          <Input label="Reviewed by" value={settings.batReviewedBy} onChange={v=>onChange("batReviewedBy",v)} style={{ flex:"1 1 220px" }} disabled={!canEdit} />
        </div>
        {!canEdit ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Viewer mode: BAT review fields are locked.</div> : null}
      </Card>
    </div>
  );
}

function ThermalStateBadge({ state }) {
  const color = plantStateColor(state);
  return <span style={{ display:"inline-block", background:color, color:C.onAccent, borderRadius:2, fontSize:12, fontWeight:800, letterSpacing:"0.06em", padding:"3px 7px", textTransform:"uppercase", fontFamily:MONO }}>{state || "--"}</span>;
}

function ThermalMonitoringLogSection({ thermalLog, thermalStats, onAdd, onDelete, canEdit, settings }) {
  const [expandedNote, setExpandedNote] = useState(null);
  const [dismissThermalRisk, setDismissThermalRisk] = useState(false);
  const [form, setForm] = useState({...EMPTY_THERMAL_LOG_ENTRY, timestamp:nowDateTimeLocal(), plant1State:"Not running", plant2State:"Not running"});
  const [errors, setErrors] = useState({});
  const sortedEntries = (thermalLog || []).slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp));
  const warningActive = thermalStats.ready && thermalStats.latestAmbientTemp > 18 && thermalStats.meanAmbientToInletDelta > 9;

  const updateForm = (key, value) => {
    setForm(prev=>({...prev, [key]:value}));
    setErrors(prev=>({...prev, [key]:""}));
  };
  const validate = () => {
    const nextErrors = {};
    const ambient = parseThermalNumber(form.ambientTemp);
    const preBed = parseThermalNumber(form.preBedTemp);
    const postBed = parseThermalNumber(form.postBedTemp);
    if (!form.timestamp) nextErrors.timestamp = "Required.";
    if (ambient == null || ambient < -10 || ambient > 50) nextErrors.ambientTemp = "Required, -10 to 50.";
    if (preBed == null || preBed < 0 || preBed > 80) nextErrors.preBedTemp = "Required, 0 to 80.";
    if (postBed == null || postBed < 0 || postBed > 80) nextErrors.postBedTemp = "Required, 0 to 80.";
    if (!form.plant1State) nextErrors.plant1State = "Required.";
    if (!form.plant2State) nextErrors.plant2State = "Required.";
    if (String(form.notes || "").length > 300) nextErrors.notes = "Maximum 300 characters.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const handleSubmit = () => {
    if (!validate()) return;
    onAdd({
      id: `thermal-${Date.now()}`,
      timestamp: form.timestamp,
      ambientTemp: parseThermalNumber(form.ambientTemp),
      preBedTemp: parseThermalNumber(form.preBedTemp),
      postBedTemp: parseThermalNumber(form.postBedTemp),
      plant1State: form.plant1State,
      plant2State: form.plant2State,
      notes: String(form.notes || "").slice(0, 300),
    });
    setDismissThermalRisk(false);
    setForm({...EMPTY_THERMAL_LOG_ENTRY, timestamp:nowDateTimeLocal(), plant1State:form.plant1State, plant2State:form.plant2State});
    setErrors({});
  };
  const exportThermalCsv = () => {
    const headers = ["thermalLog_timestamp","thermalLog_ambientTemp","thermalLog_preBedTemp","thermalLog_postBedTemp","thermalLog_ambToInletDelta","thermalLog_exotherm","thermalLog_plant1State","thermalLog_plant2State","thermalLog_notes"];
    const rows = sortedEntries.length ? sortedEntries.map(entry => {
      const derived = thermalDerived(entry);
      return [
        entry.timestamp,
        entry.ambientTemp,
        entry.preBedTemp,
        entry.postBedTemp,
        derived.ambientToInletDelta != null ? derived.ambientToInletDelta.toFixed(2) : "",
        derived.exotherm != null ? derived.exotherm.toFixed(2) : "",
        entry.plant1State,
        entry.plant2State,
        entry.notes,
      ].map(csvEscape).join(",");
    }) : [headers.map(()=>csvEscape("")).join(",")];
    const csv = [headers.join(","), ...rows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type:"text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = `thermal-log-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const fieldLabel = { display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 };
  const fieldBase = { width:"100%", height:38, padding:"8px 10px", border:`1px solid ${C.border}`, borderRadius:7, background:C.surface, color:C.ink, boxSizing:"border-box" };
  const errorText = key => errors[key] ? <div style={{ fontSize:12, color:C.red, marginTop:3 }}>{errors[key]}</div> : null;

  return (
    <div style={{ marginBottom:18, border:`1px solid ${C.border}`, borderRadius:14, background:C.surface, padding:"8px 8px 4px" }}>
      <div style={{ boxSizing:"border-box", width:"100%", textAlign:"left", padding:"12px 14px 4px", color:C.ink, fontFamily:HEAD_FONT, fontWeight:600, fontSize:16 }}>
        Thermal monitoring log
      </div>
      <div style={{ padding:"0 14px 14px" }}>
          {warningActive && !dismissThermalRisk && (
            <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"flex-start", marginBottom:12, padding:"10px 12px", border:`1px solid ${C.amber}`, background:TINT.amberBg, color:TINT.amberText, borderRadius:7, fontSize:12, fontWeight:700, lineHeight:1.45 }}>
              <span>Elevated Thermal Risk - Ambient temperature and duct heat gain indicate bed inlet conditions may approach PAH-sensitive range. Review forward forecast PAH pathway before next scheduled stack test.</span>
              <button onClick={()=>setDismissThermalRisk(true)} style={{ border:"none", background:"transparent", color:TINT.amberText, cursor:"pointer", fontWeight:900 }}>x</button>
            </div>
          )}
          <div style={{ fontSize:12, color:C.muted, marginBottom:10, lineHeight:1.5 }}>
            Testo 925 Type K spot readings. Accuracy +/- 0.5 degrees C. Log instantaneous ambient, pre-bed inlet, post-bed outlet, and concurrent plant state.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap:10, alignItems:"start" }}>
            <div><label style={fieldLabel}>Date and Time</label><input type="datetime-local" value={form.timestamp} onChange={e=>updateForm("timestamp",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"text":"not-allowed" }} />{errorText("timestamp")}</div>
            <div><label style={fieldLabel}>Ambient Temp (degrees C)</label><input type="number" step="0.1" min="-10" max="50" value={form.ambientTemp} onChange={e=>updateForm("ambientTemp",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"text":"not-allowed" }} />{errorText("ambientTemp")}</div>
            <div><label style={fieldLabel}>Pre-Bed Inlet Temp (degrees C)</label><input type="number" step="0.1" min="0" max="80" value={form.preBedTemp} onChange={e=>updateForm("preBedTemp",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"text":"not-allowed" }} />{errorText("preBedTemp")}</div>
            <div><label style={fieldLabel}>Post-Bed Outlet Temp (degrees C)</label><input type="number" step="0.1" min="0" max="80" value={form.postBedTemp} onChange={e=>updateForm("postBedTemp",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"text":"not-allowed" }} />{errorText("postBedTemp")}</div>
            <div><label style={fieldLabel}>Plant 1 State</label><select value={form.plant1State} onChange={e=>updateForm("plant1State",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"pointer":"not-allowed" }}><option value="">Select</option>{PLANT_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select>{errorText("plant1State")}</div>
            <div><label style={fieldLabel}>Plant 2 State</label><select value={form.plant2State} onChange={e=>updateForm("plant2State",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"pointer":"not-allowed" }}><option value="">Select</option>{PLANT_STATES.map(s=><option key={s} value={s}>{s}</option>)}</select>{errorText("plant2State")}</div>
            <div style={{ gridColumn:"1 / -1" }}><label style={fieldLabel}>Operator Notes</label><textarea maxLength={300} value={form.notes} onChange={e=>updateForm("notes",e.target.value)} disabled={!canEdit} style={{ ...fieldBase, minHeight:68, height:"auto", resize:"vertical", background:canEdit?C.surface:C.surface3, color:canEdit?C.ink:C.muted, cursor:canEdit?"text":"not-allowed" }} />{errorText("notes")}</div>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:10 }}>
            <Btn onClick={handleSubmit} variant="rund" small disabled={!canEdit}>Add Thermal Reading</Btn>
            <Btn onClick={exportThermalCsv} variant="ghost" small>Export thermal CSV</Btn>
          </div>
          {!canEdit ? <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Viewer mode: thermal log entry and deletion are locked.</div> : null}
          {thermalStats.ready && (
            <div style={{ marginTop:12, padding:"10px 12px", background:TINT.blueBg, border:`1px solid ${C.blue}`, borderRadius:7, fontSize:12, color:TINT.blueText, lineHeight:1.6 }}>
              <strong>Site Thermal Transfer Profile</strong><br />
              Mean Ambient to Inlet Delta T: {thermalStats.meanAmbientToInletDelta.toFixed(1)} degrees C (+/- {thermalStats.stdDevAmbientToInletDelta.toFixed(1)} degrees C, n={thermalStats.count})<br />
              Latest Delta T: {thermalStats.latestDelta.toFixed(1)} degrees C<br />
              Exotherm Range: {thermalStats.minExotherm.toFixed(1)} to {thermalStats.maxExotherm.toFixed(1)} degrees C across all entries<br />
              Most Common P1 State: {thermalStats.commonPlant1}<br />
              Most Common P2 State: {thermalStats.commonPlant2}
            </div>
          )}
          <ThermalLogChart thermalLog={sortedEntries} settings={settings} />
          <div style={{ overflowX:"auto", marginTop:12 }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["Date / Time","Ambient","Pre-Bed","Post-Bed","Amb to Inlet Delta T","Exotherm","P1 State","P2 State","Notes","Delete"].map(h=><th key={h} style={{ textAlign:"left", padding:"6px 7px", color:C.muted, fontSize:12, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`2px solid ${C.border}` }}>{h}</th>)}</tr></thead>
              <tbody>{sortedEntries.map(entry=>{
                const derived = thermalDerived(entry);
                const noteText = String(entry.notes || "");
                const isExpanded = expandedNote === entry.id;
                return (
                  <tr key={entry.id} style={{ borderBottom:`1px solid ${C.border}`, background:C.surface }}>
                    <td style={{ padding:"6px 7px", fontFamily:MONO }}>{formatThermalTimestamp(entry.timestamp)}</td>
                    <td style={{ padding:"6px 7px", fontFamily:MONO }}>{parseThermalNumber(entry.ambientTemp)?.toFixed(1)} deg C</td>
                    <td style={{ padding:"6px 7px", fontFamily:MONO }}>{parseThermalNumber(entry.preBedTemp)?.toFixed(1)} deg C</td>
                    <td style={{ padding:"6px 7px", fontFamily:MONO }}>{parseThermalNumber(entry.postBedTemp)?.toFixed(1)} deg C</td>
                    <td style={{ padding:"6px 7px", fontFamily:MONO, color:thermalDeltaColor(derived.ambientToInletDelta), fontWeight:700 }}>{derived.ambientToInletDelta!=null?derived.ambientToInletDelta.toFixed(1):"--"} deg C</td>
                    <td style={{ padding:"6px 7px", fontFamily:MONO, color:derived.exotherm!=null&&derived.exotherm<0?C.amber:C.muted }}>{derived.exotherm!=null?(derived.exotherm>0?"+":"")+derived.exotherm.toFixed(1):"--"} deg C</td>
                    <td style={{ padding:"6px 7px" }}><ThermalStateBadge state={entry.plant1State} /></td>
                    <td style={{ padding:"6px 7px" }}><ThermalStateBadge state={entry.plant2State} /></td>
                    <td style={{ padding:"6px 7px", maxWidth:220, cursor:noteText.length>40?"pointer":"default" }} onClick={()=>noteText.length>40&&setExpandedNote(isExpanded?null:entry.id)}>{isExpanded ? noteText : noteText.length>40 ? noteText.slice(0,40)+"..." : noteText}</td>
                    <td style={{ padding:"6px 7px" }}><button title="Delete thermal reading" disabled={!canEdit} onClick={()=>{ if(window.confirm("Delete this thermal log entry?")) onDelete(entry.id); }} style={{ border:`1px solid ${C.red}`, color:C.red, background:C.surface, borderRadius:4, cursor:canEdit?"pointer":"not-allowed", fontWeight:900, opacity:canEdit?1:0.45 }}>x</button></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
      </div>
    </div>
  );
}

function ThermalAnalysisTab({ thermalLog, thermalStats, onAddThermalEntry, onDeleteThermalEntry, loggerLog, onImportLoggerData, onClearLoggerData, onUpdateCorrectionFactor, settings, onChangeSetting, canEdit }) {
  const thermalOffsetReady = thermalStats && thermalStats.ready;
  const activeOffset = thermalOffsetReady && settings.useSiteMeasuredThermalOffset
    ? thermalStats.meanAmbientToInletDelta
    : (settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C);
  return (
    <div>
      <Card style={{ background:TINT.blueBg, borderLeft:`4px solid ${C.blue}` }}>
        <SectionTitle>Why This Matters</SectionTitle>
        <Fold title="Read more">
        <div style={{ fontSize:12, color:TINT.blueText, lineHeight:1.7 }}>
          Thermal monitoring is the live operational bridge between ambient weather, inlet duct heat gain, and the PAH breach pathway. VOC remains an ambient-basis regression, but PAH scheduling depends on the temperature the carbon actually sees. Keep this section current whenever spot readings or logger exports are available.
        </div>
        </Fold>
        <div style={{ marginTop:12, padding:"10px 12px", borderRadius:7, background:C.surface, border:`1px solid ${C.border}`, fontSize:12, color:C.ink, lineHeight:1.55 }}>
          <label style={{ display:"flex", gap:8, alignItems:"center", fontWeight:700, color:thermalOffsetReady?C.ink:C.muted }}>
            <input
              type="checkbox"
              disabled={!thermalOffsetReady || !canEdit}
              checked={!!settings.useSiteMeasuredThermalOffset && thermalOffsetReady}
              onChange={e=>onChangeSetting("useSiteMeasuredThermalOffset", e.target.checked)}
            />
            Use site-measured Delta T offset (n={thermalStats ? thermalStats.count : 0} readings)
          </label>
          <div style={{ marginTop:6, color:C.muted }}>
            Active ambient-to-inlet offset: {activeOffset.toFixed(1)} degrees C
          </div>
          {!thermalOffsetReady && (
            <div style={{ marginTop:4, color:C.muted }}>
              Site-measured offset activates after 3 thermal readings. Fallback constant: {(settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C).toFixed(1)} degrees C.
            </div>
          )}
        </div>
      </Card>
      <ThermalMonitoringLogSection thermalLog={thermalLog} thermalStats={thermalStats} onAdd={onAddThermalEntry} onDelete={onDeleteThermalEntry} canEdit={canEdit} settings={settings} />
      <LoggerDataSection loggerLog={loggerLog} onImport={onImportLoggerData} onClearLogger={onClearLoggerData} onUpdateCorrectionFactor={onUpdateCorrectionFactor} settings={settings} canEdit={canEdit} />
    </div>
  );
}

function LoginScreen({ onLogin, authError, adminStatus }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  const handleSubmit = async e => {
    if (e && e.preventDefault) e.preventDefault();
    if (!username || !password) { setLocalError("Enter your username and password."); return; }
    setSubmitting(true);
    setLocalError("");
    try {
      await onLogin(username, password);
    } catch (error) {
      setLocalError(error.message);
    }
    setSubmitting(false);
  };

  const message = localError || authError || "";
  const input = { height:46, padding:"0 14px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surface2, color:C.ink, fontSize:15, fontFamily:"inherit", boxSizing:"border-box", width:"100%" };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, color:C.ink, padding:"24px", fontFamily:"Inter, system-ui, sans-serif", boxSizing:"border-box" }}>
      <form onSubmit={handleSubmit} style={{ width:"100%", maxWidth:420, background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"30px 28px", boxSizing:"border-box" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:18 }}>
          <svg width="38" height="38" viewBox="0 0 34 34" aria-hidden="true"><path d="M17 2 30 9.5v15L17 32 4 24.5v-15z" fill="none" stroke={C.rund} strokeWidth="2" /><path d="M11 13.5h12M11 17h12M11 20.5h12" stroke={C.rund} strokeWidth="2" strokeLinecap="round" /></svg>
          <div>
            <div style={{ fontFamily:HEAD_FONT, fontSize:20, fontWeight:700 }}>Carbon Bed Model</div>
            <div style={{ fontSize:13, color:C.muted }}>Calders &amp; Grandidge, Boston - A4 abatement</div>
          </div>
        </div>
        <div style={{ display:"grid", gap:14 }}>
          <label style={{ display:"grid", gap:6, fontSize:13, fontWeight:600 }}>Username
            <input type="text" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} style={input} />
          </label>
          <label style={{ display:"grid", gap:6, fontSize:13, fontWeight:600 }}>Password
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} style={input} />
          </label>
        </div>
        {message ? (
          <div role="alert" style={{ marginTop:14, padding:"10px 12px", borderRadius:10, background:TINT.redBg, color:C.red, fontSize:14, fontWeight:600 }}>{message}</div>
        ) : null}
        <button type="submit" disabled={submitting} style={{ marginTop:18, width:"100%", height:46, borderRadius:10, border:"none", background:C.rund, color:C.onAccent, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>{submitting ? "Signing in..." : "Sign in"}</button>
        {adminStatus && adminStatus.usingDefaultAdminPassword ? (
          <div style={{ marginTop:14, fontSize:13, color:C.amber, lineHeight:1.5 }}>The default administrator password is still active. Change it straight after signing in.</div>
        ) : null}
      </form>
    </div>
  );
}

function SecurityCard({ authState, onLogout, onChangePassword, onCreateUser, adminData }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword:"", newPassword:"" });
  const [userForm, setUserForm] = useState({ username:"", displayName:"", password:"", role:"operator" });
  const [status, setStatus] = useState("");

  const changeOwnPassword = async () => {
    setStatus("");
    try {
      await onChangePassword(passwordForm);
      setStatus("Password updated.");
      setPasswordForm({ currentPassword:"", newPassword:"" });
    } catch (error) {
      setStatus(error.message);
    }
  };

  const addUser = async () => {
    setStatus("");
    try {
      await onCreateUser(userForm);
      setStatus(`User ${userForm.username} created.`);
      setUserForm({ username:"", displayName:"", password:"", role:"operator" });
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <Card>
      <SectionTitle>Security and Access</SectionTitle>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
        <StatPill label="Signed In As" value={authState.user ? authState.user.username : "--"} unit="" sub={authState.user ? authState.user.role : ""} />
        <StatPill label="Last Login" value={authState.user && authState.user.lastLoginAt ? formatSyncStamp(authState.user.lastLoginAt) : "--"} unit="" sub={authState.user && authState.user.mustChangePassword ? "Password change required" : "Session active"} />
      </div>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"end" }}>
        <Input label="Current Password" type="password" value={passwordForm.currentPassword} onChange={v=>setPasswordForm(f=>({...f,currentPassword:v}))} style={{ flex:"1 1 220px" }} />
        <Input label="New Password" type="password" value={passwordForm.newPassword} onChange={v=>setPasswordForm(f=>({...f,newPassword:v}))} style={{ flex:"1 1 220px" }} />
        <Btn onClick={()=>{ void changeOwnPassword(); }} variant="gold">Change Password</Btn>
        <Btn onClick={()=>{ void onLogout(); }} variant="ghost">Sign Out</Btn>
      </div>
      {authState.user && authState.user.role === "admin" ? (
        <div style={{ marginTop:16, paddingTop:14, borderTop:`1px solid ${C.border}` }}>
          <div style={{ fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Create Platform User</div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"end" }}>
            <Input label="Username" value={userForm.username} onChange={v=>setUserForm(f=>({...f,username:v}))} style={{ flex:"1 1 150px" }} />
            <Input label="Display Name" value={userForm.displayName} onChange={v=>setUserForm(f=>({...f,displayName:v}))} style={{ flex:"1 1 180px" }} />
            <Input label="Temporary Password" type="password" value={userForm.password} onChange={v=>setUserForm(f=>({...f,password:v}))} style={{ flex:"1 1 180px" }} />
            <div style={{ flex:"1 1 140px" }}>
              <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>Role</label>
              <select value={userForm.role} onChange={e=>setUserForm(f=>({...f,role:e.target.value}))} style={{ width:"100%", height:38, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:C.surface2, color:C.ink, boxSizing:"border-box" }}>
                <option value="operator">Operator</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <Btn onClick={()=>{ void addUser(); }} variant="rund">Create User</Btn>
          </div>
          {adminData.users.length > 0 ? (
            <div style={{ marginTop:12, overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead><tr>{["Username","Display","Role","Created","Last Login"].map(h=><th key={h} style={{ textAlign:"left", padding:"6px 8px", color:C.muted, fontSize:12, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`2px solid ${C.border}` }}>{h}</th>)}</tr></thead>
                <tbody>{adminData.users.map(user => <tr key={user.id} style={{ borderBottom:`1px solid ${C.border}` }}><td style={{ padding:"6px 8px", fontFamily:MONO }}>{user.username}</td><td style={{ padding:"6px 8px" }}>{user.displayName}</td><td style={{ padding:"6px 8px" }}>{user.role}</td><td style={{ padding:"6px 8px", fontFamily:MONO }}>{formatSyncStamp(user.createdAt)}</td><td style={{ padding:"6px 8px", fontFamily:MONO }}>{user.lastLoginAt ? formatSyncStamp(user.lastLoginAt) : "--"}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
      {status ? <div style={{ marginTop:12, fontSize:12, color:C.blue, fontWeight:700 }}>{status}</div> : null}
    </Card>
  );
}

function DocumentLibraryCard({ documents, audit, adminError, isAdmin, onDownload }) {
  return (
    <Card>
      <SectionTitle>Document Library</SectionTitle>
      <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:12 }}>
        <StatPill label="Retained Documents" value={documents.length} unit="" sub="Server-side originals" />
        <StatPill label="Audit Events" value={audit.length} unit="" sub={isAdmin ? "Most recent 100" : "Admin only"} />
      </div>
      {adminError ? <div style={{ marginBottom:10, fontSize:12, color:C.red, fontWeight:700 }}>{adminError}</div> : null}
      {documents.length > 0 ? (
        <div style={{ overflowX:"auto", marginBottom:12 }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["Type","File","Uploaded","By","Size"].map(h=><th key={h} style={{ textAlign:"left", padding:"6px 8px", color:C.muted, fontSize:12, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`2px solid ${C.border}` }}>{h}</th>)}</tr></thead>
            <tbody>{documents.map(doc => <tr key={doc.id} style={{ borderBottom:`1px solid ${C.border}` }}><td style={{ padding:"6px 8px" }}>{doc.category}</td><td style={{ padding:"6px 8px" }}><button onClick={()=>{ void onDownload(doc); }} style={{ border:"none", background:"transparent", color:C.blue, cursor:"pointer", padding:0, fontWeight:700 }}>{doc.fileName}</button></td><td style={{ padding:"6px 8px", fontFamily:MONO }}>{formatSyncStamp(doc.uploadedAt)}</td><td style={{ padding:"6px 8px" }}>{doc.uploadedBy ? doc.uploadedBy.username : "--"}</td><td style={{ padding:"6px 8px", fontFamily:MONO }}>{Math.round((doc.sizeBytes || 0) / 1024)} KB</td></tr>)}</tbody>
          </table>
        </div>
      ) : <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>No archived documents yet.</div>}
      {isAdmin ? (
        audit.length > 0 ? (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr>{["When","Action","Actor","Detail"].map(h=><th key={h} style={{ textAlign:"left", padding:"6px 8px", color:C.muted, fontSize:12, textTransform:"uppercase", letterSpacing:"0.06em", borderBottom:`2px solid ${C.border}` }}>{h}</th>)}</tr></thead>
              <tbody>{audit.slice(0, 20).map(item => <tr key={item.id} style={{ borderBottom:`1px solid ${C.border}` }}><td style={{ padding:"6px 8px", fontFamily:MONO }}>{formatSyncStamp(item.at)}</td><td style={{ padding:"6px 8px" }}>{item.action}</td><td style={{ padding:"6px 8px" }}>{item.actor ? `${item.actor.username} (${item.actor.role})` : "--"}</td><td style={{ padding:"6px 8px", color:C.muted }}>{JSON.stringify(item.detail || {})}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <div style={{ fontSize:12, color:C.muted }}>No audit events yet.</div>
      ) : <div style={{ fontSize:12, color:C.muted }}>Audit log is visible to platform admins only.</div>}
    </Card>
  );
}

function DocumentLibraryTab({ adminData, isAdmin, onDownloadDocument }) {
  return (
    <div>
      <DocumentLibraryCard
        documents={adminData.documents}
        audit={adminData.audit}
        adminError={adminData.error}
        isAdmin={isAdmin}
        onDownload={onDownloadDocument}
      />
    </div>
  );
}

function SettingsTab({ settings, onChange, lastChangeout, onChangeoutDateChange, onRecordChangeout, vocC, pahC, platformMeta, onExportBackup, onImportBackup, onResetPlatform, onRunChargeImportScan, authState, onLogout, onChangePassword, onCreateUser, adminData, onDownloadDocument }) {
  const [openFanNote, setOpenFanNote] = useState(null);
  const canEdit = !!(authState && authState.user && authState.user.role !== "viewer");
  const isAdmin = !!(authState && authState.user && authState.user.role === "admin");
  const specRows = [
    ["Manufacturer", FAN_SPECIFICATION.manufacturer],
    ["Model", FAN_SPECIFICATION.model],
    ["Year of Manufacture", FAN_SPECIFICATION.yearOfManufacture],
    ["Nameplate Speed", FAN_SPECIFICATION.nameplateRPM.toLocaleString() + " rpm"],
    ["Nameplate Flow", FAN_SPECIFICATION.nameplateFlow_m3hr.toLocaleString() + " m3/hr (" + FAN_SPECIFICATION.nameplateFlow_m3s + " m3/s)"],
    ["Nameplate Pressure", FAN_SPECIFICATION.nameplatePressure_Pa.toLocaleString() + " Pa total"],
    ["Overall Efficiency", FAN_SPECIFICATION.overallEfficiency_pct + "%"],
    ["Motor", FAN_SPECIFICATION.motor_kW + " kW " + FAN_SPECIFICATION.motorClass + ", " + FAN_SPECIFICATION.motorPoles + "-pole, " + FAN_SPECIFICATION.motorFullLoadRPM.toLocaleString() + " rpm full load"],
    ["Flow Measurement", "Stack discharge (post-demister, post-carbon bed)"],
  ];
  return (
    <div>
      <Card>
        <SectionTitle>Carbon bed</SectionTitle>
        <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:15, color:C.ink }}>Current bed fitted on <b>{fmtDateShort(lastChangeout)}</b> ({Math.max(0, daysBetween(lastChangeout, new Date()))} days ago).</div>
          {canEdit && onRecordChangeout ? <Btn variant="primary" onClick={onRecordChangeout}>Record carbon change</Btn> : null}
        </div>
        <Fold title="Correct the current bed's fitted date">
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>Only use this to fix a wrong date. To record new carbon, use Record carbon change so the bed history stays complete.</div>
          <Input label="Fitted date" type="date" value={lastChangeout} onChange={onChangeoutDateChange} style={{ maxWidth:280 }} disabled={!canEdit} />
        </Fold>
      </Card>
      <Card>
        <SectionTitle>Site conditions (used when live data is missing)</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Typical Ambient Temp (C)" type="number" step="0.5" value={settings.typicalTempC} onChange={v=>onChange("typicalTempC",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Typical RH (%)" type="number" value={settings.typicalRH} onChange={v=>onChange("typicalRH",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Creosote use (t/day, trial model fallback)" type="number" step="0.5" value={settings.creoRateTPerDay ?? 11} onChange={v=>onChange("creoRateTPerDay",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
        </div>
        <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:12, color:C.ink, fontWeight:700 }}>
          <input type="checkbox" checked={!!settings.useConservativeRH} onChange={e=>onChange("useConservativeRH",e.target.checked)} disabled={!canEdit} />
          Conservative Humidity Mode
        </label>
        <div style={{ fontSize:12, color:C.muted, marginTop:4, lineHeight:1.5 }}>
          When enabled, humidity is fixed at 90% RH for all VOC predictions and forward forecasts. This is the conservative BAT-aligned posture for Boston, Lincolnshire where night-time RH routinely exceeds 90% in autumn and winter. Recommended for compliance scheduling decisions.
        </div>
        <div style={{ fontSize:12, color:C.muted }}>Boston, Lincolnshire PE21 7HJ | {LAT}N {Math.abs(LON)}W | Live weather from Open-Meteo on load.</div>
      </Card>
      <Card>
        <SectionTitle>Data Management</SectionTitle>
        <div style={{ marginBottom:12, padding:"10px 14px", borderRadius:7, background:platformMeta && platformMeta.error ? TINT.redBg : TINT.blueBg, border:`1px solid ${platformMeta && platformMeta.error ? C.red : C.blue}`, color:platformMeta && platformMeta.error ? TINT.redText : TINT.blueText, fontSize:12, lineHeight:1.6 }}>
          <strong>Shared Platform Status</strong><br />
          Sync: {platformMeta ? platformMeta.syncLabel : "--"} | Last server update: {formatSyncStamp(platformMeta ? platformMeta.updatedAt : "")}<br />
          Charge import worker: {platformMeta && platformMeta.imports && platformMeta.imports.charges ? platformMeta.imports.charges.lastSummary : "No import status yet."}
          {platformMeta && platformMeta.imports && platformMeta.imports.charges && platformMeta.imports.charges.lastError ? <><br />Import notes: {platformMeta.imports.charges.lastError}</> : null}
          {platformMeta && platformMeta.storage && platformMeta.storage.chargeInboxDir ? <><br />Charge inbox: {platformMeta.storage.chargeInboxDir}</> : null}
          {platformMeta && platformMeta.error ? <><br />Connection issue: {platformMeta.error}</> : null}
        </div>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <Btn onClick={()=>{ void onExportBackup(); }} variant="ghost">Export backup (JSON)</Btn>
          <label style={{ display:"inline-block", padding:"10px 20px", borderRadius:7, background:canEdit?C.rund:C.muted, color:C.onAccent, fontSize:13, fontWeight:700, cursor:canEdit?"pointer":"not-allowed", opacity:canEdit?1:0.7 }}>
            Import backup (JSON)
            <input type="file" accept=".json,application/json" disabled={!canEdit} style={{ display:"none" }} onChange={e=>{
              const file=e.target.files[0]; if(!file) return;
              const reader=new FileReader();
              reader.onload=()=>{ if(!window.confirm("Import backup and overwrite the shared platform state for all users?")) return; const data=JSON.parse(reader.result); void onImportBackup(data); };
              reader.readAsText(file);
            }} />
          </label>
          <Btn onClick={()=>{ void onRunChargeImportScan(); }} variant="gold" disabled={!canEdit}>Run charge import scan</Btn>
          <Btn onClick={()=>{ const typed = window.prompt("This deletes all shared charge logs, CoA and creosote records, thermal readings, carbon change history and settings for every user, and cannot be undone. Export a backup first. Type DELETE to confirm."); if (typed === "DELETE") { void onResetPlatform(); } }} variant="danger" disabled={!isAdmin}>Clear all data</Btn>
        </div>
        {authState && authState.user && authState.user.role === "viewer" ? <div style={{ marginTop:8, fontSize:12, color:C.muted }}>Viewer accounts can inspect shared state and retained documents, but they cannot change platform data.</div> : null}
        {!isAdmin ? <div style={{ marginTop:8, fontSize:12, color:C.muted }}>Only platform admins can clear all shared data.</div> : null}
        <div style={{ fontSize:12, color:C.muted, marginTop:10, lineHeight:1.6 }}>
          Shared-platform backup note: this export contains the live server state for all users, plus model version metadata. Uploaded MCERTS stack test PDFs and Koppers CoA PDFs are retained server-side in the shared document library. Automated charge CSV exports should be dropped into the server charge inbox for ingestion and archival.
        </div>
      </Card>
      <SecurityCard authState={authState} onLogout={onLogout} onChangePassword={onChangePassword} onCreateUser={onCreateUser} adminData={adminData} />
      <Card>
        <SectionTitle>Engineering settings and reference</SectionTitle>
        <div style={{ fontSize:14, color:C.muted }}>Model inputs, risk weighting, plant averages and fan data. Change these only with engineering sign-off.</div>
        <Fold title="Show engineering settings">
          <div style={{ marginTop:8 }}>
      <Card>
        <SectionTitle>Carbon Bed Configuration</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Bed Mass (kg)" type="number" value={settings.bedMass} onChange={v=>onChange("bedMass",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Extraction Flow (m3/hr)" type="number" value={settings.flowM3hr} onChange={v=>onChange("flowM3hr",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Bed Cross-Section (m2)" type="number" step="0.1" min={0.2} value={settings.crossSectionM2} onChange={v=>onChange("crossSectionM2",Math.max(0.2,v||DEFAULT_CROSS_SECTION_M2))} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Carbon-inlet VOC (mg/m3, assumed)" type="number" step="10" min={10} value={settings.inletVOCmgm3 != null ? settings.inletVOCmgm3 : 400} onChange={v=>onChange("inletVOCmgm3",Math.max(10,v||400))} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="WJ Naph/TVOC Fraction (%)" type="number" step="0.5" value={(settings.naphthaleneFrac*100).toFixed(1)} onChange={v=>onChange("naphthaleneFrac",v/100)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <Input label="Utilisation Rate (0-1)" type="number" step="0.01" min={0} max={1} value={settings.utilisationRate} onChange={v=>onChange("utilisationRate",v)} style={{ flex:"1 1 150px" }} disabled={!canEdit} />
          <div style={{ flex:"1 1 150px", marginBottom:14, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:6, lineHeight:1.2 }}>Hot-day PAH risk percentile</label>
            <select value={settings.pahRiskPercentile || 90} onChange={e=>onChange("pahRiskPercentile", parseInt(e.target.value, 10))} disabled={!canEdit} style={{ width:"100%", height:40, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:10, fontSize:14, background:C.surface2, color:C.ink, boxSizing:"border-box", fontFamily:"inherit" }}>
              <option value={80}>80th - hottest 1 day in 5</option>
              <option value={90}>90th - hottest 1 day in 10 (recommended)</option>
              <option value={95}>95th - hottest 1 day in 20</option>
            </select>
          </div>
          <Input label="Stack Temp Correction Factor (C)" type="number" step="0.5" min={0} max={20} value={settings.stackTempCorrectionC} onChange={v=>onChange("stackTempCorrectionC",Math.max(0,Math.min(20,v||0)))} style={{ flex:"1 1 210px" }} disabled={!canEdit} />
          <Input label="Pre-Test Buffer (days)" type="number" step="1" min={0} max={60} value={settings.preTestBufferDays} onChange={v=>onChange("preTestBufferDays",Math.max(0,Math.min(60,v||0)))} style={{ flex:"1 1 170px" }} disabled={!canEdit} />
          <Input label="Pre-Test Buffer (active hrs)" type="number" step="10" min={50} max={400} value={settings.preTestBufferActiveHrs} onChange={v=>onChange("preTestBufferActiveHrs",Math.max(50,Math.min(400,v||150)))} style={{ flex:"1 1 190px" }} disabled={!canEdit} />
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8, lineHeight:1.55 }}>
          Empirical uplift from ambient to carbon bed face temperature. Derived from P1-P8 MCERTS stack test data (avg delta +8 deg C). Update when continuous bed-face logging is available.
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>
            Current Carbon Charge Type
          </label>
          <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, color:C.ink, fontWeight:700 }}>
            <input type="checkbox" checked={!!settings.isSameCarbonCharge} onChange={e=>onChange("isSameCarbonCharge", e.target.checked)} disabled={!canEdit} />
            Same carbon (not replaced since prior test) - enables 1,155-hr same-bed VOC limit
          </label>
          <div style={{ fontSize:12, color:C.muted, marginTop:4, lineHeight:1.5 }}>
            Tick only if the carbon has NOT been replaced since the previous stack test period. The 1,155-hr same-bed limit applies to the P1-P3 same-carbon failure curve only. Fresh carbon (default) has higher capacity and a different failure trajectory. Incorrect setting will show a misleading reference line on the Forward Forecast chart.
          </div>
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
          WJ fraction applied as hours scaling: higher fraction = faster capacity consumption = fewer charges to failure. 53% = plant baseline. Inlet VOC monitoring excluded (would trigger BAT 45 EA continuous stack monitoring obligation).
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>
          Site-measured ambient-to-inlet offset: +10.3 deg C (Testo 925, 2026-06-18: pre-bed inlet 22.7 deg C, external ambient 12.4 deg C). Updated from +8.0 deg C interim value. Applies to PAH scheduling and T_operative display only. VOC pathway uses raw ambient temperature consistent with calibration basis.
        </div>
      </Card>

      <Card>
        <SectionTitle>Risk Scoring</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="VOC Risk Weight (%)" type="number" min={10} max={90} step="1" value={Math.round((settings.vocRiskWeight??0.55)*100)} onChange={v=>onChange("vocRiskWeight",Math.max(10,Math.min(90,v||55))/100)} style={{ flex:"1 1 180px" }} disabled={!canEdit} />
          <StatPill label="PAH Risk Weight" value={Math.round((1-(settings.vocRiskWeight??0.55))*100)} unit="%" sub="Auto-calculated" />
        </div>
      </Card>
      <Card>
        <SectionTitle>Plant Averages</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Plant 1" value={P1_AVG_HRS} unit="hrs/charge" sub="All product types, P1-P8 analysis" />
          <StatPill label="Plant 2" value={P2_AVG_HRS} unit="hrs/charge" sub="All product types, P1-P8 analysis" />
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>
          Plant 1 avg {P1_AVG_HRS} hrs/charge (all product types) | Plant 2 avg {P2_AVG_HRS} hrs/charge (all product types). Derived from full 1,519-charge timestamp analysis.
        </div>
      </Card>
      <Card>
        <SectionTitle>Model Architecture</SectionTitle>
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.8 }}>
          Full model architecture, calibration equations, Bayesian update detail, and the v1.7.0 audit changelog are documented in the Model Details tab.
        </div>
      </Card>

      <Card>
        <SectionTitle>Fan Specification (Confirmed Nameplate Data)</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(230px, 100%), 1fr))", gap:8 }}>
          {specRows.map(([label,value])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", gap:12, border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", background:C.ivory }}>
              <span style={{ fontSize:12, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
              <span style={{ fontSize:12, color:C.ink, textAlign:"right" }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize:12, color:C.muted, fontStyle:"italic", marginTop:10, lineHeight:1.6 }}>{FAN_SPECIFICATION.operatingNote}</div>
      </Card>
      <Card>
        <SectionTitle>Fan Configuration History</SectionTitle>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {["From","To","Config","Motor (mm)","Fan (mm)","Fan RPM","Stack Discharge Flow (m3/hr)"].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"7px 8px", fontSize:12, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FAN_CONFIG_LOG.map((cfg,i)=>(
                <tr key={cfg.from} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.ivory:C.surface }}>
                  <td style={{ padding:"7px 8px", fontFamily:MONO }}>{cfg.from}</td>
                  <td style={{ padding:"7px 8px", fontFamily:MONO }}>{cfg.to || "Present"}</td>
                  <td style={{ padding:"7px 8px" }}>{cfg.label}</td>
                  <td style={{ padding:"7px 8px", fontFamily:MONO }}>{cfg.motorPulley_mm}</td>
                  <td style={{ padding:"7px 8px", fontFamily:MONO }}>{cfg.fanPulley_mm}</td>
                  <td style={{ padding:"7px 8px", fontFamily:MONO }}>{cfg.fanRPM.toLocaleString()}</td>
                  <td style={{ padding:"7px 8px", fontFamily:MONO }}>
                    {cfg.typicalStackDischargeFlow_m3hr.toLocaleString()}
                    <button onClick={()=>setOpenFanNote(openFanNote===i?null:i)} style={{ marginLeft:6, border:`1px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.blue, cursor:"pointer", fontSize:12, fontWeight:700 }} title="Show flow note">*</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {openFanNote!=null && (
          <div style={{ marginTop:8, padding:"9px 12px", background:alpha(C.blue,6), border:`1px solid ${alpha(C.blue,19)}`, borderRadius:7, fontSize:12, color:C.ink, lineHeight:1.5 }}>
            {FAN_CONFIG_LOG[openFanNote].stackDischargeFlowNote}
          </div>
        )}
        <Fold title="About the flow values">
        <div style={{ fontSize:12, color:C.muted, marginTop:10, lineHeight:1.6 }}>
          All flow values are Envirocare-measured stack discharge flows (post-demister, post-carbon bed) or fan-law estimates where no Envirocare measurement exists during that configuration window. True carbon bed inlet flow is marginally higher than stack discharge flow. Stack discharge flow is used as a conservative proxy in Wheeler-Jonas EBCT calculations.
        </div>
        </Fold>
      </Card>
          </div>
        </Fold>
      </Card>
    </div>
  );
}

// ============================================================
// v2.0 REDESIGN - shared helpers and the new Overview / Season plan / Compliance views
// ============================================================
const CHANGEOUT_COST_GBP = 14580;   // per carbon changeout (programme economics, 2026)
const STACK_TEST_COST_GBP = 2755;   // per MCERTS stack test (programme economics, 2026)
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDateShort(value) {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(String(value).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return String(value);
  return d.getDate() + " " + MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
}
function fmtDayMonth(value) {
  if (!value) return "--";
  const d = value instanceof Date ? value : new Date(String(value).slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return String(value);
  return d.getDate() + " " + MONTH_NAMES[d.getMonth()];
}
function log10(v) { return Math.log(v) / Math.LN10; }

function toneColor(tone) {
  return tone === "bad" ? C.red : tone === "warn" ? C.amber : tone === "info" ? C.blue : tone === "accent" ? C.rund : C.teal;
}
function toneSoft(tone) {
  return tone === "bad" ? TINT.redBg : tone === "warn" ? TINT.amberBg : tone === "info" ? TINT.blueBg : tone === "accent" ? "var(--accent-soft)" : TINT.safeBg;
}
function Chip({ tone, children }) {
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"5px 12px", borderRadius:999, background:toneSoft(tone), color:toneColor(tone), fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>{children}</span>;
}
function Label({ children, color }) {
  return <div style={{ fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", color:color || C.muted, fontWeight:600 }}>{children}</div>;
}
function Panel({ children, style }) {
  return <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:14, padding:"20px 22px", minWidth:0, ...(style || {}) }}>{children}</div>;
}
function PanelTitle({ title, sub, right }) {
  return (
    <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"baseline", gap:10, marginBottom:14 }}>
      <div>
        <h2 style={{ margin:0, fontFamily:HEAD_FONT, fontSize:18, fontWeight:600, color:C.ink }}>{title}</h2>
        {sub ? <div style={{ fontSize:13, color:C.muted, marginTop:3 }}>{sub}</div> : null}
      </div>
      {right || null}
    </div>
  );
}
function LegendDot({ tone, label }) {
  return <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:12, color:C.muted }}><span style={{ width:10, height:10, borderRadius:3, background:toneColor(tone) }} />{label}</span>;
}

// Forecast from today using the same engine and assumptions as the Forward Forecast tab (seasonal climatology).
function forecastFrom(startDate, startActiveHrs, settings, vocC, pahC) {
  const utilisationPct = Math.round((settings.utilisationRate || 0.82) * 1000) / 10;
  const fc = buildForwardForecast({
    startDate,
    startActiveHrs,
    utilisationPct,
    mode: "seasonal",
    flatTemp: settings.typicalTempC,
    monthlyTemps: BOSTON_MONTHLY_TEMPS,
    liveTemps: null,
    correctionFactor: settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C,
    pahStackTempOverride: "",
    isSameCarbonCharge: !!settings.isSameCarbonCharge,
    vocC,
    pahC,
    maxDays: 365,
    settings,
    forecastRH: settings.useConservativeRH ? 90 : 80,
  });
  let binding = { type:"None", row:null };
  if (fc.vocBreach && fc.pahBreach) binding = fc.vocBreach.day <= fc.pahBreach.day ? { type:"VOC", row:fc.vocBreach } : { type:"PAH", row:fc.pahBreach };
  else if (fc.vocBreach) binding = { type:"VOC", row:fc.vocBreach };
  else if (fc.pahBreach) binding = { type:"PAH", row:fc.pahBreach };
  if (settings.isSameCarbonCharge && fc.sameBedLimit && (!binding.row || fc.sameBedLimit.day <= binding.row.day)) binding = { type:"Same-bed", row:fc.sameBedLimit };
  const bufferDays = Math.max(settings.preTestBufferDays ?? 14, Math.ceil((settings.preTestBufferActiveHrs ?? 150) / Math.max(fc.dailyActiveHrs, 1)));
  return { fc, binding, bufferDays };
}

function seasonOutlook(settings, vocC) {
  const utilisation = settings.utilisationRate || 0.82;
  const daily = 24 * utilisation;
  const offset = settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C;
  return MONTH_NAMES.map(function(name, m) {
    const amb = BOSTON_MONTHLY_TEMPS[m];
    const rh = settings.useConservativeRH ? 90 : BOSTON_MONTHLY_RH[m];
    const hrs = safeWindowHoursVOC(amb, rh, vocC, settings.naphthaleneFrac);
    const days = Math.round(hrs / Math.max(daily, 1));
    const pah = pahRiskLabelForOperativeTemp(operativeTemp(amb, offset));
    return {
      name, m, amb, hrs, days,
      vocTone: days >= 60 ? "ok" : days >= 35 ? "warn" : "bad",
      pah,
      pahTone: pah === "Low" ? "ok" : pah === "Moderate" ? "warn" : "bad",
    };
  });
}

// v2.3.0: a stack test entered in the app is a test on the current bed. Record the bed start,
// mark it as a fresh-bed period (so both the VOC and PAH calibrations use it), and attach
// creosote used since the changeout from the synced creosote log (trial model input).
function enrichStackRecord(rec, lastChangeout, dailyLog) {
  const out = { ...rec };
  const start = String(lastChangeout || "").slice(0, 10);
  if (start && rec.date && rec.date >= start) {
    if (!out.periodStart) out.periodStart = start;
    if (!out.periodEnd) out.periodEnd = rec.date;
    if (out.sameCarbon == null) out.sameCarbon = false;
    if (out.bedDay == null) out.bedDay = Math.max(0, daysBetween(start, rec.date));
    const rows = (dailyLog || []).filter(r => r && r.date);
    const usedKg = cleanUsageKg(rows, start, rec.date);
    if (out.creoT == null && usedKg != null) {
      const inPeriod = rows.filter(r => r.date > start && r.date <= rec.date);
      out.creoT = Math.round(usedKg / 100) / 10;
      out.workingDays = Math.round(inPeriod.reduce((a, r) => a + Math.max(0, r.workingDays || 0), 0) * 10) / 10;
    }
  }
  return out;
}

function sortedTests(stackData) {
  return (stackData || []).filter(d=>d && d.date).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}

function LogBars({ tests, field, limit, lo, hi, unit }) {
  const pos = v => Math.max(2, Math.min(100, (log10(v) - log10(lo)) / (log10(hi) - log10(lo)) * 100));
  const limitPos = pos(limit);
  const shown = tests.filter(t => t[field] != null && t[field] > 0);
  return (
    <div>
      <div style={{ position:"relative", height:200, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ position:"absolute", left:0, right:0, bottom:limitPos + "%", borderTop:`2px dashed ${C.red}` }} />
        <div style={{ position:"absolute", right:0, bottom:"calc(" + limitPos + "% + 4px)", fontSize:12, color:C.red, fontWeight:600 }}>Limit {limit.toLocaleString("en-GB")}</div>
        <div style={{ position:"absolute", inset:0, display:"grid", gridTemplateColumns:"repeat(" + Math.max(shown.length, 1) + ", minmax(0, 1fr))", gap:6, alignItems:"end" }}>
          {shown.map(t => (
            <div key={t.period} style={{ height:"100%", display:"flex", alignItems:"flex-end" }}>
              <div title={t.period + " (" + t.date + "): " + t[field] + " " + unit} style={{ width:"100%", height:pos(t[field]) + "%", borderRadius:"4px 4px 0 0", background:t[field] > limit ? C.red : C.rund }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(" + Math.max(shown.length, 1) + ", minmax(0, 1fr))", gap:6, marginTop:6 }}>
        {shown.map(t => <div key={t.period} style={{ fontFamily:MONO, fontSize:12, color:C.muted, textAlign:"center" }}>{t.period}</div>)}
      </div>
    </div>
  );
}

function MeterBar({ label, value, limit, unit, note }) {
  const pct = limit > 0 ? value / limit * 100 : 0;
  const tone = pct >= 100 ? "bad" : pct >= 75 ? "warn" : "ok";
  const shown = Math.max(2, Math.min(100, pct));
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
        <span style={{ fontSize:14, fontWeight:600, color:C.ink }}>{label}</span>
        <span style={{ fontSize:14, color:toneColor(tone), fontWeight:600 }}>{Math.round(pct)}% of permit limit</span>
      </div>
      <div style={{ position:"relative", height:12, borderRadius:999, background:C.surface2, marginTop:8, overflow:"hidden" }}>
        <div style={{ position:"absolute", left:0, top:0, bottom:0, width:shown + "%", borderRadius:999, background:toneColor(tone) }} />
      </div>
      <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>{note || (value.toLocaleString("en-GB", { maximumFractionDigits:1 }) + " " + unit + " against a limit of " + limit.toLocaleString("en-GB") + " " + unit)}</div>
    </div>
  );
}

function pahLevelTone(level) {
  return level === "High" ? "bad" : level === "Elevated" ? "warn" : level === "Moderate" ? "info" : "ok";
}

// v2.9.0 hot-day PAH risk panel (Home).
function HotDayPAHPanel({ pahRisk, breachDate }) {
  if (!pahRisk) return null;
  const pctText = pahRisk.pct === 90 ? "the hottest 1 day in 10" : pahRisk.pct === 95 ? "the hottest 1 day in 20" : pahRisk.pct === 80 ? "the hottest 1 day in 5" : "a " + pahRisk.pct + "th-percentile day";
  const strip = pahRisk.days.rows.slice(0, 16);
  const first = pahRisk.first;
  const firstIso = first ? isoDateFromDate(first.date) : null;
  const beforeVOC = first && breachDate && firstIso < breachDate;
  const unitLoad = v => pahRisk.kind === "creo" ? Math.round(v).toLocaleString("en-GB") + " t of creosote" : Math.round(v).toLocaleString("en-GB") + " run hours";
  const headTone = !first ? "ok" : first.day <= 7 ? "bad" : first.day <= 30 ? "warn" : "info";
  const headline = !first
    ? "No hot-day PAH risk forecast for this carbon bed in the next 12 months."
    : first.day === 0 ? "A hot day today could push PAH over the limit."
    : "From " + fmtDateShort(firstIso) + " (in " + first.day + " days) a hot day could push PAH over the limit.";
  return (
    <Panel>
      <PanelTitle title="Hot-day PAH risk" sub={"PAH on " + pctText + " for this carbon bed. " + (pahRisk.liveDays ? "The next " + pahRisk.liveDays + " days use the live weather forecast, then Boston climate." : "Live forecast unavailable: Boston climate used.")} right={<div style={{ display:"flex", gap:14, flexWrap:"wrap" }}><LegendDot tone="ok" label="Low" /><LegendDot tone="info" label="Moderate" /><LegendDot tone="warn" label="Elevated" /><LegendDot tone="bad" label="High" /></div>} />
      <div style={{ display:"flex", alignItems:"flex-start", gap:10, flexWrap:"wrap", marginBottom:14 }}>
        <Chip tone={headTone}>{!first ? "Low" : first.day <= 7 ? "Now" : first.day <= 30 ? "Soon" : "Later"}</Chip>
        <div style={{ fontSize:15, color:C.ink, lineHeight:1.5, flex:"1 1 320px" }}>
          {headline}
          {first ? " The bed will have about " + unitLoad(first.load) + " on it, and the gas could reach " + first.stackHot.toFixed(0) + " C at the stack." : ""}
          {beforeVOC ? <b> This is before the VOC changeout date ({fmtDateShort(breachDate)}), so on this bed PAH may set the limit.</b> : null}
        </div>
      </div>
      <div style={{ overflowX:"auto", paddingBottom:4 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(16, minmax(52px, 1fr))", gap:6, minWidth:860 }}>
          {strip.map(r => (
            <div key={r.day} title={"Hot-day stack " + r.stackHot.toFixed(1) + " C, PAH " + Math.round(r.pahHot) + " ug/m3 (" + Math.round(r.ratio * 100) + "% of limit)"} style={{ padding:"8px 4px", borderRadius:10, background:toneSoft(pahLevelTone(r.level)), border:"1px solid " + alpha(toneColor(pahLevelTone(r.level)), 35), textAlign:"center" }}>
              <div style={{ fontSize:11, color:C.muted }}>{r.date.toLocaleDateString("en-GB", { weekday:"short" })}</div>
              <div style={{ fontSize:12, fontWeight:600, color:C.ink }}>{r.date.getDate()}</div>
              <div style={{ fontFamily:MONO, fontSize:14, fontWeight:600, color:toneColor(pahLevelTone(r.level)), marginTop:4 }}>{Math.round(r.ratio * 100)}%</div>
              <div style={{ fontSize:10, color:C.muted }}>{r.live ? "forecast" : "climate"}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize:13, color:C.muted, marginTop:8 }}>Each day shows hot-day PAH as a % of the {PAH_ELV.toLocaleString("en-GB")} ug/m3 limit.</div>
      <Fold title="How this works and what to do">
        <div style={{ fontSize:14, color:C.muted, lineHeight:1.6, display:"flex", flexDirection:"column", gap:8 }}>
          <div>PAH breaks through when the gas is hot, so the risk comes from hot days, not average weather. The model takes the expected stack temperature for each day and adds the hot-day spread seen in the stack tests (stack running {pahRisk.hot.mu.toFixed(1)} C above the weather-based estimate on average, give or take {pahRisk.hot.sd.toFixed(1)} C, from {pahRisk.hot.n} tests). It then applies the {pahRisk.kind === "creo" ? "creosote-throughput" : "run-hours"} PAH model for the bed's loading on that day.</div>
          <div>Back-tested on the past stack tests, this rule would have flagged {pahRisk.caught} of {pahRisk.nOver} PAH exceedances, with {pahRisk.falseAlarms} false alarm{pahRisk.falseAlarms === 1 ? "" : "s"} (summer tests that fell on cooler days). It is a risk warning, not a prediction of a stack test result.</div>
          <div><b style={{ color:C.ink }}>On High days:</b> move vacuum releases, door openings and transfers to the coolest hours, check the bed inlet temperature on the logger, and avoid timing a stack test or carbon decision on that day without knowing the temperature. If High days keep coming, the bed needs changing sooner or cooling (fan after the bed, tank vent controls). See Trial Mode.</div>
        </div>
      </Fold>
    </Panel>
  );
}

function HomeTab({ stackData, settings, lastChangeout, vocC, pahC, activeHrs, ambient, ambientSource, rh, creoDailyLog, creoDeliveries, platformMeta, onNavigate, creoModel, creoBed, opLoo, canEdit, onRecordChangeout, changeoutList, pahRisk }) {
  const today = useMemo(()=>new Date(), []);
  const { fc, binding, bufferDays } = useMemo(()=>forecastFrom(today, activeHrs, settings, vocC, pahC), [today, activeHrs, settings, vocC, pahC]);
  const outlook = useMemo(()=>seasonOutlook(settings, vocC), [settings, vocC]);
  const tests = useMemo(()=>sortedTests(stackData), [stackData]);
  const latest = tests.length ? tests[tests.length - 1] : null;

  const daysSince = Math.max(0, daysBetween(lastChangeout, today));
  const daysLeft = binding.row ? binding.row.day : null;
  const totalLife = daysLeft != null ? daysSince + daysLeft : null;
  const used = totalLife ? Math.min(1, daysSince / Math.max(totalLife, 1)) : 0;
  const breachDate = binding.row ? binding.row.date : null;
  const testDay = binding.row ? Math.max(0, binding.row.day - bufferDays) : null;
  const testDate = testDay != null ? isoDateFromDate(addDays(today, testDay)) : null;
  const band = Math.exp(vocUncertaintyMultiplier(vocC));

  const vocNow = predictVOC(activeHrs, ambient, rh, vocC);
  const stackNow = estimateStackTemp(ambient);
  const pahNow = predictPAH(stackNow, activeHrs, pahC);
  const pahLimitTemp = pahFailTemp(activeHrs, pahC);
  const latestOver = latest && ((latest.voc != null && latest.voc > VOC_ELV) || (latest.pah != null && latest.pah > PAH_ELV));
  const modelOver = vocNow >= VOC_ELV || pahNow >= PAH_ELV;
  const modelNear = vocNow >= VOC_ELV * 0.75 || pahNow >= PAH_ELV * 0.75;

  const hotSoon = pahRisk && pahRisk.first && pahRisk.first.day <= 7;
  let status = "ok";
  if (modelOver || latestOver || (testDay != null && testDay <= 0)) status = "bad";
  else if (modelNear || hotSoon || (testDay != null && testDay <= 14)) status = "warn";
  const statusTitle = status === "ok" ? "All good" : status === "warn" ? "Action needed soon" : "Action needed now";
  const lifeText = daysLeft != null ? "The carbon bed has about " + daysLeft + " days of life left." : "The carbon bed is not forecast to reach its limit in the next 12 months.";
  const emissionsText = modelOver ? "The model estimates emissions are over the permit limit." : latestOver ? "The last stack test was over the permit limit." : "Emissions are estimated to be within permit limits.";
  const nextJob = testDate == null ? "No stack test needed in the next 12 months." : testDay <= 0 ? "Book the confirmatory stack test now." : "Next job: book a stack test for before " + fmtDateShort(testDate) + ".";
  const hotText = hotSoon ? (pahRisk.first.day === 0 ? " A hot day today could push PAH over the limit." : " A hot day within " + pahRisk.first.day + " days could push PAH over the limit.") : "";

  const tempTone = stackNow >= pahLimitTemp ? "bad" : stackNow >= pahLimitTemp - 4 ? "warn" : "ok";
  const tempText = tempTone === "ok" ? "Low. The gas reaching the carbon is cool enough that PAH is unlikely to break through."
    : tempTone === "warn" ? "Rising. Warm gas makes PAH break through more easily: watch the forecast."
    : "High. Gas this warm can push PAH over the limit even on newer carbon.";

  const circ = 2 * Math.PI * 92;
  const vocOver = tests.filter(t=>t.voc != null && t.voc > VOC_ELV).length;
  const pahOver = tests.filter(t=>t.pah != null && t.pah > PAH_ELV).length;
  const maxDays = Math.max(1, ...outlook.map(o=>o.days));
  const nowMonth = today.getMonth();
  const curBed = changeoutList && changeoutList.length ? changeoutList[changeoutList.length - 1] : null;

  const readings = (creoDailyLog || []).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const lastReading = readings.length ? readings[readings.length - 1] : null;
  const dels = (creoDeliveries || []).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const lastDel = dels.length ? dels[dels.length - 1] : null;
  const chargeImport = platformMeta && platformMeta.imports ? platformMeta.imports.charges : null;
  const creoImport = platformMeta && platformMeta.imports ? platformMeta.imports.creosote : null;
  const linkBtn = { minHeight:40, padding:"0 14px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.rund, fontWeight:600, fontSize:14, cursor:"pointer", fontFamily:"inherit" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", flexWrap:"wrap", gap:16, alignItems:"center", justifyContent:"space-between", padding:"18px 20px", borderRadius:14, background:toneSoft(status), border:"1px solid " + alpha(toneColor(status), 35) }}>
        <div style={{ display:"flex", gap:14, alignItems:"flex-start", minWidth:0, flex:"1 1 420px" }}>
          <span aria-hidden="true" style={{ flex:"0 0 auto", width:14, height:14, marginTop:8, borderRadius:"50%", background:toneColor(status), boxShadow:"0 0 0 5px " + alpha(toneColor(status), 25) }} />
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:13, color:C.muted }}>{today.toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}</div>
            <h1 style={{ margin:"4px 0 6px", fontFamily:HEAD_FONT, fontWeight:600, fontSize:"clamp(22px, 3vw, 30px)", color:C.ink, lineHeight:1.2 }}>{statusTitle}</h1>
            <div style={{ fontSize:16, color:C.ink, lineHeight:1.5 }}>{emissionsText}{hotText} {lifeText} <b>{nextJob}</b></div>
          </div>
        </div>
        {canEdit ? <Btn variant="primary" onClick={onRecordChangeout}>Record carbon change</Btn> : null}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(340px, 100%), 1fr))", gap:20 }}>
        <Panel style={{ gridColumn:"1 / -1", display:"flex", flexWrap:"wrap", gap:28, alignItems:"center" }}>
          <div style={{ position:"relative", width:200, height:200, flex:"0 0 auto", margin:"0 auto" }}>
            <svg width="200" height="200" viewBox="0 0 220 220" role="img" aria-label={"Carbon life used: day " + daysSince + (totalLife ? " of about " + totalLife + " days" : "")}>
              <circle cx="110" cy="110" r="92" fill="none" stroke={C.border} strokeWidth="16" />
              <circle cx="110" cy="110" r="92" fill="none" stroke={C.rund} strokeWidth="16" strokeLinecap="round" strokeDasharray={(circ * used).toFixed(1) + " " + circ.toFixed(1)} transform="rotate(-90 110 110)" style={{ transition:"stroke-dasharray 0.8s ease" }} />
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center" }}>
              <div style={{ fontFamily:MONO, fontSize:50, fontWeight:600, lineHeight:1, color:C.ink }}>{daysLeft != null ? daysLeft : "--"}</div>
              <div style={{ fontSize:14, color:C.muted, marginTop:6 }}>days of carbon<br />life left</div>
            </div>
          </div>
          <div style={{ flex:"1 1 340px", minWidth:0, display:"flex", flexDirection:"column", gap:16 }}>
            <div>
              <h2 style={{ margin:0, fontFamily:HEAD_FONT, fontSize:20, fontWeight:600, color:C.ink }}>Carbon bed{curBed ? " - " + curBed.bed : ""}</h2>
              <div style={{ fontSize:14, color:C.muted, marginTop:4 }}>Day {daysSince}{totalLife ? " of about " + totalLife : ""}. Forecast from plant running hours and Boston weather.</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(170px, 100%), 1fr))", gap:12 }}>
              {[
                ["Carbon fitted", fmtDateShort(lastChangeout), null],
                ["Book stack test by", testDate ? fmtDateShort(testDate) : "Not needed yet", "accent"],
                ["Expected to need changing", breachDate ? fmtDateShort(breachDate) : "After 12 months", null],
              ].map(r => (
                <div key={r[0]} style={{ background:r[2] ? "var(--accent-soft)" : C.surface2, borderRadius:12, padding:"12px 14px" }}>
                  <div style={{ fontSize:13, color:r[2] ? C.rund : C.muted, fontWeight:600 }}>{r[0]}</div>
                  <div style={{ fontSize:18, fontWeight:600, marginTop:4, color:r[2] ? C.rund : C.ink }}>{r[1]}</div>
                </div>
              ))}
            </div>
            {totalLife ? (
              <div aria-hidden="true">
                <div style={{ position:"relative", height:10, borderRadius:999, background:C.surface2, overflow:"hidden" }}>
                  <div style={{ position:"absolute", left:0, top:0, bottom:0, width:(used * 100).toFixed(1) + "%", background:C.rund, borderRadius:999 }} />
                </div>
                <div style={{ position:"relative", height:18, fontSize:12, color:C.muted, marginTop:6 }}>
                  <span style={{ position:"absolute", left:0 }}>{fmtDayMonth(lastChangeout)}</span>
                  {used > 0.12 && used < 0.82 ? <span style={{ position:"absolute", left:(used * 100).toFixed(1) + "%", transform:"translateX(-50%)", color:C.rund, fontWeight:600 }}>Today</span> : null}
                  <span style={{ position:"absolute", right:0 }}>{fmtDayMonth(breachDate)}</span>
                </div>
              </div>
            ) : null}
            <Fold title="How sure is this forecast?">
              <div style={{ fontSize:14, color:C.muted, lineHeight:1.6 }}>
                The forecast comes from {vocC && vocC.n ? vocC.n : "--"} past stack tests. Results vary a lot from bed to bed, so the real date could be several weeks either side (uncertainty x{band.toFixed(1)} on the VOC estimate). That is why the plan is to book a stack test {bufferDays} days before the forecast date: the test confirms when the carbon actually needs changing.
              </div>
            </Fold>
          </div>
        </Panel>

        <Panel>
          <h2 style={{ margin:"0 0 14px", fontFamily:HEAD_FONT, fontSize:18, fontWeight:600, color:C.ink }}>Emissions now (estimate)</h2>
          <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
            <MeterBar label="VOC (solvent vapour)" value={vocNow} limit={VOC_ELV} unit="mg/m3" />
            <MeterBar label="PAH (tar compounds)" value={pahNow} limit={PAH_ELV} unit="ug/m3" />
          </div>
          <div style={{ fontSize:13, color:C.muted, marginTop:14 }}>Model estimate for today. Only a stack test measures emissions directly.</div>
        </Panel>

        <Panel>
          <h2 style={{ margin:"0 0 6px", fontFamily:HEAD_FONT, fontSize:18, fontWeight:600, color:C.ink }}>Last stack test</h2>
          {latest ? (
            <>
              <div style={{ display:"flex", alignItems:"center", gap:10, flexWrap:"wrap", marginBottom:14 }}>
                <Chip tone={latestOver ? "bad" : "ok"}>{latestOver ? "Over limit" : "Passed"}</Chip>
                <span style={{ fontSize:14, color:C.muted }}>{fmtDateShort(latest.date)} ({latest.period}{latest.report ? ", " + latest.report : ""})</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
                {latest.voc != null ? <MeterBar label="VOC" value={latest.voc} limit={VOC_ELV} unit="mg/m3" /> : null}
                {latest.pah != null ? <MeterBar label="PAH" value={latest.pah} limit={PAH_ELV} unit="ug/m3" /> : null}
              </div>
              <div style={{ marginTop:14 }}><button type="button" onClick={()=>onNavigate("stack", "compliance")} style={linkBtn}>All stack test results</button></div>
            </>
          ) : <div style={{ fontSize:14, color:C.muted }}>No stack tests recorded yet.</div>}
        </Panel>

        <Panel>
          <h2 style={{ margin:"0 0 6px", fontFamily:HEAD_FONT, fontSize:18, fontWeight:600, color:C.ink }}>Temperature risk</h2>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}><Chip tone={tempTone}>{tempTone === "ok" ? "Low" : tempTone === "warn" ? "Rising" : "High"}</Chip><span style={{ fontSize:14, color:C.muted }}>Gas at the stack about {stackNow.toFixed(0)} C</span></div>
          <div style={{ position:"relative", marginTop:4 }}>
            <div style={{ height:12, borderRadius:999, background:"linear-gradient(90deg, " + C.teal + " 0%, " + C.teal + " " + Math.max(0, (pahLimitTemp - 4) / 40 * 100).toFixed(0) + "%, " + C.amber + " " + Math.max(0, (pahLimitTemp - 4) / 40 * 100).toFixed(0) + "%, " + C.amber + " " + Math.min(100, pahLimitTemp / 40 * 100).toFixed(0) + "%, " + C.red + " " + Math.min(100, pahLimitTemp / 40 * 100).toFixed(0) + "%)" }} />
            <span style={{ position:"absolute", left:Math.max(0, Math.min(100, stackNow / 40 * 100)).toFixed(1) + "%", top:-5, width:4, height:22, marginLeft:-2, borderRadius:2, background:C.ink }} />
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.muted, marginTop:6 }}><span>Cool</span><span>Hot</span></div>
          <div style={{ fontSize:14, color:C.ink, marginTop:12, lineHeight:1.5 }}>{tempText}</div>
          <div style={{ fontSize:13, color:C.muted, marginTop:6 }}>Outside {ambient.toFixed(1)} C ({ambientSource}).</div>
        </Panel>
      </div>

      <HotDayPAHPanel pahRisk={pahRisk} breachDate={breachDate} />

      <Panel>
        <PanelTitle title="Carbon life through the year" sub="How long fresh carbon is expected to last if it is fitted in each month. Summer heat shortens it." right={<div style={{ display:"flex", gap:14, flexWrap:"wrap" }}><LegendDot tone="ok" label="Long" /><LegendDot tone="warn" label="Medium" /><LegendDot tone="bad" label="Short" /></div>} />
        <div style={{ overflowX:"auto", paddingBottom:4 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(12, minmax(62px, 1fr))", gap:8, minWidth:780 }}>
            {outlook.map(o => (
              <div key={o.name} style={{ padding:"12px 8px", borderRadius:12, background:C.surface2, border:"2px solid " + (o.m === nowMonth ? C.rund : "transparent"), textAlign:"center" }}>
                <div style={{ fontSize:13, fontWeight:600, color:o.m === nowMonth ? C.rund : C.muted }}>{o.name}</div>
                <div style={{ height:90, display:"flex", alignItems:"flex-end", marginTop:8 }}>
                  <div title={o.days + " days"} style={{ width:"100%", height:Math.max(4, Math.round(o.days / maxDays * 100)) + "%", borderRadius:6, background:toneColor(o.vocTone) }} />
                </div>
                <div style={{ fontFamily:MONO, fontSize:16, fontWeight:600, marginTop:8 }}>{o.days}</div>
                <div style={{ fontSize:12, color:C.muted }}>days</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"space-between", gap:12, alignItems:"center", marginTop:14 }}>
          <div style={{ fontSize:13, color:C.muted }}>Based on {Math.round((settings.utilisationRate || 0.82) * 100)}% plant running time. Updates with every stack test.</div>
          <button type="button" onClick={()=>onNavigate("forecast", "seasonplan")} style={linkBtn}>See the 12-month carbon plan</button>
        </div>
      </Panel>

      <Panel>
        <PanelTitle title="Stack test history" sub={"Each bar is one stack test. Red bars were over the permit limit (" + vocOver + " of " + tests.filter(t=>t.voc != null).length + " for VOC, " + pahOver + " of " + tests.filter(t=>t.pah != null).length + " for PAH)."} />
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap:24 }}>
          <div><div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>VOC</div><LogBars tests={tests} field="voc" limit={VOC_ELV} lo={0.05} hi={300} unit="mg/m3" /></div>
          <div><div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>PAH</div><LogBars tests={tests} field="pah" limit={PAH_ELV} lo={10} hi={10000} unit="ug/m3" /></div>
        </div>
        <div style={{ fontSize:13, color:C.muted, marginTop:10 }}>Bars use a log scale so very small and very large results both fit.</div>
      </Panel>

      <Panel style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(190px, 100%), 1fr))", gap:16 }}>
        <div><div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>Creosote in stock</div><div style={{ fontFamily:MONO, fontSize:22, fontWeight:600, marginTop:4 }}>{lastReading && lastReading.totalKg != null ? (lastReading.totalKg / 1000).toFixed(1) + " t" : "--"}</div><div style={{ fontSize:13, color:C.muted }}>{lastReading ? "Tank reading " + fmtDayMonth(lastReading.date) : "Load the creosote log to see this"}</div></div>
        <div><div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>Used on this carbon bed</div><div style={{ fontFamily:MONO, fontSize:22, fontWeight:600, marginTop:4 }}>{creoBed ? Math.round(creoBed.tonnes) + " t" : "--"}</div><div style={{ fontSize:13, color:C.muted }}>{creoBed && creoBed.source === "log" ? "From the creosote log" : "Estimated"}</div></div>
        <div><div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>Last creosote delivery</div><div style={{ fontFamily:MONO, fontSize:22, fontWeight:600, marginTop:4 }}>{lastDel && lastDel.qtyKg != null ? (lastDel.qtyKg / 1000).toFixed(1) + " t" : "--"}</div><div style={{ fontSize:13, color:C.muted }}>{lastDel ? fmtDayMonth(lastDel.date) + (lastDel.flashpoint != null ? ", flash point " + lastDel.flashpoint + " C" : "") : ""}</div></div>
        <div><div style={{ fontSize:13, color:C.muted, fontWeight:600 }}>Data feeds</div><div style={{ fontSize:14, marginTop:6 }}><span style={{ color:chargeImport && chargeImport.lastImportedAt ? C.teal : C.muted, fontWeight:600 }}>{chargeImport && chargeImport.lastImportedAt ? "Charges connected" : "Charges: no sync"}</span></div><div style={{ fontSize:14, marginTop:2 }}><span style={{ color:creoImport && creoImport.lastImportedAt ? C.teal : C.muted, fontWeight:600 }}>{creoImport && creoImport.lastImportedAt ? "Creosote log loaded" : "Creosote log: not loaded"}</span></div></div>
      </Panel>

      <Panel>
        <Fold title="What do these terms mean?">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap:"12px 24px", fontSize:14, lineHeight:1.5 }}>
            {[
              ["Carbon bed", "A tank of activated carbon that the extracted fumes pass through. The carbon soaks up the vapours until it is full and must be replaced."],
              ["VOC", "Volatile organic compounds: the solvent-like vapour given off by creosote. The permit limit is " + VOC_ELV + " mg/m3."],
              ["PAH", "Polycyclic aromatic hydrocarbons: heavier tar compounds in creosote fumes. The permit limit is " + PAH_ELV.toLocaleString("en-GB") + " ug/m3. They break through more easily when the gas is warm."],
              ["Permit limit", "The maximum emission allowed by the Environment Agency permit (EPR/A2/1) at the stack."],
              ["Stack test", "An independent, certified (MCERTS) measurement of what is actually leaving the stack. It is the evidence the EA relies on."],
              ["Carbon change", "Replacing the spent carbon with fresh carbon. Record it here so the countdown and forecast restart."],
            ].map(g => <div key={g[0]}><b>{g[0]}.</b> <span style={{ color:C.muted }}>{g[1]}</span></div>)}
          </div>
        </Fold>
      </Panel>
    </div>
  );
}

function ModelComparisonPanel({ today, opBinding, opFc, bufferDays, opLoo, cm, creoBed, onNavigate }) {
  if (!cm || !cm.ready) return null;
  const trial = forecastCreo(today, creoBed.tonnes, creoBed.rate, cm, 365);
  const tb = trial.binding;
  const opDay = opBinding.row ? opBinding.row.day : null;
  const testDay = opDay != null ? Math.max(0, opDay - bufferDays) : 30;
  const testDate = addDays(today, testDay);
  const opRow = opFc.rows[Math.min(testDay, opFc.rows.length - 1)];
  const opAtTest = opRow ? opRow.vocMid : null;
  const tonnesAtTest = creoBed.tonnes + creoBed.rate * testDay;
  const trialAtTest = predictVOCCreo(tonnesAtTest, estimateStackTemp(BOSTON_MONTHLY_TEMPS[testDate.getMonth()]), cm);
  const gap = opDay != null && tb ? tb.row.day - opDay : null;
  const beyond = tb && tb.row.tonnes > cm.maxT;
  const col = (title, tag, tone, rows) => (
    <div style={{ background:C.surface2, borderRadius:12, padding:"16px 18px", minWidth:0 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8, flexWrap:"wrap" }}>
        <div style={{ fontWeight:600, fontSize:14 }}>{title}</div><Chip tone={tone}>{tag}</Chip>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:12, marginTop:12 }}>
        {rows.map(r => <div key={r[0]}><Label>{r[0]}</Label><div style={{ fontFamily:MONO, fontSize:18, fontWeight:600, marginTop:4, color:r[2] || C.ink }}>{r[1]}</div></div>)}
      </div>
    </div>
  );
  return (
    <Panel>
      <PanelTitle title="Second opinion: creosote-based forecast (trial)" sub="The main forecast uses plant running hours. A second model based on creosote used is being trialled alongside it until stack tests confirm which is more accurate." right={<button type="button" onClick={()=>onNavigate("stack", "compliance")} style={{ minHeight:38, padding:"0 14px", borderRadius:10, border:`1px solid ${C.border}`, background:"transparent", color:C.rund, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Model fit</button>} />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap:16 }}>
        {col("Run hours", "Operative", "accent", [
          ["Forecast limit", opBinding.row ? fmtDateShort(opBinding.row.date) : "None in 12 months"],
          ["Uncertainty (unseen tests)", opLoo.voc != null ? "x" + Math.exp(opLoo.voc).toFixed(1) : "--"],
          ["Predicts at " + fmtDayMonth(testDate) + " test", opAtTest != null ? opAtTest.toFixed(1) + " mg/m3" : "--", opAtTest != null && opAtTest >= VOC_ELV ? C.red : null],
          ["Bed loading so far", Math.round(opFc.rows[0] ? opFc.rows[0].activeHrs : 0).toLocaleString("en-GB") + " h"],
        ])}
        {col("Creosote throughput", "Trial", "warn", [
          ["Forecast limit", tb ? fmtDateShort(tb.row.date) : "None in 12 months"],
          ["Uncertainty (unseen tests)", cm.vocLoo != null ? "x" + Math.exp(cm.vocLoo).toFixed(1) : "--"],
          ["Predicts at " + fmtDayMonth(testDate) + " test", trialAtTest.toFixed(1) + " mg/m3", trialAtTest >= VOC_ELV ? C.red : null],
          ["Creosote so far", Math.round(creoBed.tonnes).toLocaleString("en-GB") + " t"],
        ])}
      </div>
      <div style={{ fontSize:12, color:C.muted, marginTop:12, lineHeight:1.5 }}>
        {gap != null ? (gap > 0 ? "The trial model gives this bed " + gap + " more days. " : gap < 0 ? "The trial model gives this bed " + (-gap) + " fewer days. " : "Both models agree on the date. ") : ""}
        The {fmtDayMonth(testDate)} stack test separates them: a VOC result near {opAtTest != null ? opAtTest.toFixed(0) : "--"} mg/m3 supports the run-hours model, near {trialAtTest.toFixed(0)} mg/m3 the throughput model.
        {" "}Creosote use {creoBed.note}.
        {beyond ? " The trial date lies beyond the largest throughput yet tested (" + Math.round(cm.maxT).toLocaleString("en-GB") + " t), so it is an extrapolation: do not defer a changeout on it without a confirming test." : ""}
      </div>
    </Panel>
  );
}

function SeasonPlanTab({ settings, lastChangeout, vocC, pahC, activeHrs, creoModel, creoBed, opLoo, onNavigate, pahRisk }) {
  const today = useMemo(()=>new Date(), []);
  const [basis, setBasis] = useState("hours");
  const current = useMemo(()=>forecastFrom(today, activeHrs, settings, vocC, pahC), [today, activeHrs, settings, vocC, pahC]);
  const trialReady = !!(creoModel && creoModel.ready);
  const plan = useMemo(()=>{
    const windowStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const windowEnd = new Date(today.getFullYear() + 1, today.getMonth(), 1);
    const beds = [];
    let start = new Date(String(lastChangeout).slice(0, 10) + "T00:00:00");
    let simStart = today;
    let hrs = activeHrs;
    let tonnes = creoBed ? creoBed.tonnes : 0;
    const bufferForTrial = settings.preTestBufferDays ?? 14;
    for (let i = 0; i < 16; i++) {
      let res;
      if (basis === "creo" && trialReady) {
        const tf = forecastCreo(simStart, tonnes, creoBed.rate, creoModel, 365);
        res = { binding: tf.binding ? { type:tf.binding.type, row:tf.binding.row } : { type:"None", row:null }, bufferDays: bufferForTrial };
      } else {
        res = forecastFrom(simStart, hrs, settings, vocC, pahC);
      }
      if (!res.binding.row) { beds.push({ start, end:null, life:null, type:"None", testDate:null }); break; }
      const end = addDays(simStart, res.binding.row.day);
      const life = Math.max(1, daysBetween(start, end));
      const testDate = addDays(simStart, Math.max(0, res.binding.row.day - res.bufferDays));
      // v2.9.0: first hot-day PAH risk within this bed's life.
      let pahDate = null;
      if (pahRisk) {
        const load0 = pahRisk.kind === "creo" ? tonnes : hrs;
        const pr = pahRiskDays({ ...pahRisk.base, start:simStart, horizon:res.binding.row.day, load0, ratePerDay:pahRisk.rate, liveMeans: i === 0 ? pahRisk.days.rows.filter(r => r.live).map(r => r.ambient) : [] });
        if (pr.first) pahDate = pr.first.date;
      }
      beds.push({ start, end, life, type:res.binding.type, testDate, pahDate });
      if (end >= windowEnd) break;
      start = end; simStart = end; hrs = 0; tonnes = 0;
    }
    const span = (windowEnd - windowStart) / 86400000;
    const changeouts = beds.filter(b => b.end && b.end >= today && b.end < windowEnd).length;
    const months = [];
    for (let k = 0; k < 12; k++) {
      const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + k, 1);
      const amb = BOSTON_MONTHLY_TEMPS[d.getMonth()];
      const pah = pahRisk ? pahRisk.season[d.getMonth()].level : pahRiskLabelForOperativeTemp(operativeTemp(amb, settings.stackTempCorrectionC ?? FALLBACK_AMBIENT_TO_INLET_OFFSET_C));
      months.push({ key:k, name:MONTH_NAMES[d.getMonth()] + (d.getMonth() === 0 || k === 0 ? " " + String(d.getFullYear()).slice(2) : ""), pahSeason: pahRisk ? (pah === "High" || pah === "Elevated") : pah !== "Low" });
    }
    const pos = d => Math.max(0, Math.min(100, (d - windowStart) / 86400000 / span * 100));
    return { beds, changeouts, months, pos, windowStart, windowEnd };
  }, [today, lastChangeout, activeHrs, settings, vocC, pahC, basis, trialReady, creoModel, creoBed, pahRisk]);
  const outlook = useMemo(()=>seasonOutlook(settings, vocC), [settings, vocC]);
  const seasons = [["Winter", [11,0,1]], ["Spring", [2,3,4]], ["Summer", [5,6,7]], ["Autumn", [8,9,10]]].map(function(s) {
    const days = Math.round(s[1].reduce((acc, m)=>acc + outlook[m].days, 0) / 3);
    return { name:s[0], days, tone: days >= 60 ? "ok" : days >= 35 ? "warn" : "bad" };
  });
  const maxSeason = Math.max(1, ...seasons.map(s=>s.days));
  const next = plan.beds.find(b => b.end && b.end >= today);
  const shortest = plan.beds.filter(b=>b.life && b.end > today).reduce((m, b)=>Math.min(m, b.life), 9999);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <Label>Forecast - next 12 months - model-driven, seasonal climatology</Label>
        <h1 style={{ margin:"6px 0 0", fontFamily:HEAD_FONT, fontWeight:600, fontSize:"clamp(22px, 3vw, 30px)", color:C.ink }}>{plan.changeouts} changeouts forecast in the next 12 months</h1>
      </div>
      {trialReady ? (
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:13, color:C.muted }}>Forecast basis</span>
          {[["hours","Run hours (operative)"],["creo","Creosote throughput (trial)"]].map(b => (
            <button key={b[0]} type="button" aria-pressed={basis === b[0]} onClick={()=>setBasis(b[0])} style={{ minHeight:36, padding:"0 14px", borderRadius:999, cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:basis === b[0] ? 600 : 500, border:`1px solid ${basis === b[0] ? "transparent" : C.border}`, background:basis === b[0] ? (b[0] === "creo" ? C.amber : C.rund) : "transparent", color:basis === b[0] ? C.onAccent : C.muted }}>{b[1]}</button>
          ))}
          {basis === "creo" ? <span style={{ fontSize:12, color:C.amber }}>Trial model, at {creoBed.rate.toFixed(1)} t/day creosote. Not for scheduling until confirmed by stack tests.</span> : null}
        </div>
      ) : null}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap:16 }}>
        <StatPill label="Changeouts" value={plan.changeouts} unit="" sub="single bed, no lead-lag" />
        <StatPill label="Carbon cost" value={"GBP " + (plan.changeouts * CHANGEOUT_COST_GBP / 1000).toFixed(1) + "k"} unit="" sub={plan.changeouts + " x GBP " + CHANGEOUT_COST_GBP.toLocaleString("en-GB")} />
        <StatPill label="Next changeout" value={next && next.end ? fmtDayMonth(next.end) : "--"} unit="" color={C.rund} sub={next && next.testDate ? "test by " + fmtDayMonth(next.testDate) : ""} />
        <StatPill label="Shortest bed life" value={shortest < 9999 ? shortest : "--"} unit="days" color={C.red} sub="summer PAH and VOC season" />
      </div>

      <ModelComparisonPanel today={today} opBinding={current.binding} opFc={current.fc} bufferDays={current.bufferDays} opLoo={opLoo} cm={creoModel} creoBed={creoBed} onNavigate={onNavigate || (()=>{})} />

      <Panel>
        <PanelTitle title="Bed timeline" sub="Each bar is one carbon bed, ending at its forecast limit. Diamonds mark the confirmatory stack test." right={<div style={{ display:"flex", gap:14, flexWrap:"wrap" }}><LegendDot tone="ok" label="60 d or more" /><LegendDot tone="warn" label="35 to 59 d" /><LegendDot tone="bad" label="under 35 d" /></div>} />
        <div style={{ overflowX:"auto" }}>
          <div style={{ minWidth:880 }}>
            <div style={{ display:"grid", gridTemplateColumns:"110px minmax(0, 1fr)", gap:10 }}>
              <div />
              <div style={{ display:"grid", gridTemplateColumns:"repeat(12, minmax(0, 1fr))" }}>
                {plan.months.map(m => <div key={m.key} style={{ fontSize:12, fontWeight:600, color:C.muted, padding:"0 0 8px 6px", borderLeft:`1px solid ${C.border}` }}>{m.name}</div>)}
              </div>
            </div>
            <div style={{ position:"relative" }}>
              <div style={{ position:"absolute", left:120, right:0, top:0, bottom:0, display:"grid", gridTemplateColumns:"repeat(12, minmax(0, 1fr))", pointerEvents:"none" }}>
                {plan.months.map(m => <div key={m.key} style={{ borderLeft:`1px solid ${C.border}`, background:m.pahSeason ? alpha(C.amber, 6) : "transparent" }} />)}
              </div>
              <div style={{ position:"absolute", left:"calc(120px + (100% - 120px) * " + (plan.pos(today) / 100).toFixed(4) + ")", top:0, bottom:0, width:2, background:C.rund }} />
              {plan.beds.map((b, i) => {
                const s = plan.pos(b.start), e = b.end ? plan.pos(b.end) : 100;
                const tone = b.life == null ? "ok" : b.life >= 60 ? "ok" : b.life >= 35 ? "warn" : "bad";
                const testPos = b.testDate ? plan.pos(b.testDate) : null;
                return (
                  <div key={i} style={{ display:"grid", gridTemplateColumns:"110px minmax(0, 1fr)", gap:10, alignItems:"center", height:44 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:C.ink }}>{i === 0 ? "Current bed" : "Bed +" + i}</div>
                    <div style={{ position:"relative", height:26 }}>
                      <div title={fmtDateShort(b.start) + " to " + (b.end ? fmtDateShort(b.end) : "beyond horizon") + " (" + b.type + ")"} style={{ position:"absolute", top:0, bottom:0, left:s + "%", width:Math.max(0.5, e - s) + "%", background:toneColor(tone), borderRadius:6, display:"flex", alignItems:"center", overflow:"hidden" }}>
                        <span style={{ fontFamily:MONO, fontSize:12, fontWeight:600, color:C.bg, padding:"0 8px", whiteSpace:"nowrap" }}>{b.life ? b.life + " d" : ""}</span>
                      </div>
                      {b.pahDate && plan.pos(b.pahDate) > 0 && plan.pos(b.pahDate) < 100 ? <div title={"Hot-day PAH risk from " + fmtDateShort(b.pahDate)} style={{ position:"absolute", top:-4, bottom:-4, left:plan.pos(b.pahDate) + "%", width:3, marginLeft:-1, borderRadius:2, background:C.red, boxShadow:"0 0 0 2px " + C.surface }} /> : null}
                      {testPos != null && testPos > 0 && testPos < 100 ? <div title={"Stack test by " + fmtDateShort(b.testDate)} style={{ position:"absolute", top:7, left:testPos + "%", width:12, height:12, marginLeft:-6, transform:"rotate(45deg)", background:C.rund, border:`2px solid ${C.surface}` }} /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ fontSize:12, color:C.muted, marginTop:12 }}>Shaded months: hot-day PAH season (Elevated or High below). Red line: from this date a hot day could push PAH over the limit on that bed. Each later bed is assumed to start fresh on its predecessor's forecast date; dates move with every stack test and recalibration.</div>
      </Panel>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap:20 }}>
        <Panel>
          <PanelTitle title="Seasonal bed life" sub="Mean model VOC safe window for a fresh bed" />
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {seasons.map(s => (
              <div key={s.name} style={{ display:"grid", gridTemplateColumns:"80px minmax(0, 1fr) 70px", gap:12, alignItems:"center" }}>
                <div style={{ fontSize:14, fontWeight:600 }}>{s.name}</div>
                <div style={{ height:14, borderRadius:999, background:C.surface2, overflow:"hidden" }}><div style={{ height:"100%", width:Math.round(s.days / maxSeason * 100) + "%", background:toneColor(s.tone), borderRadius:999 }} /></div>
                <div style={{ fontFamily:MONO, fontSize:13, textAlign:"right" }}>{s.days} d</div>
              </div>
            ))}
          </div>
        </Panel>
        {pahRisk ? (
          <Panel>
            <PanelTitle title="Hot-day PAH by month" sub={"Days of loading a bed can carry before " + (pahRisk.pct === 90 ? "a 1-in-10" : "a " + pahRisk.pct + "th-percentile") + " hot day could push PAH over the limit, at " + pahRisk.rate.toFixed(1) + (pahRisk.kind === "creo" ? " t/day creosote." : " run hrs/day.")} />
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6, minmax(0, 1fr))", gap:8 }}>
              {pahRisk.season.map(o => (
                <div key={o.m} title={"Hot-day stack " + o.stackHot.toFixed(1) + " C"} style={{ padding:"8px 6px", borderRadius:10, background:toneSoft(pahLevelTone(o.level)), textAlign:"center" }}>
                  <div style={{ fontSize:12, fontWeight:600, color:C.muted }}>{MONTH_NAMES[o.m]}</div>
                  <div style={{ fontFamily:MONO, fontSize:15, fontWeight:600, color:toneColor(pahLevelTone(o.level)) }}>{o.days != null ? (o.days > 365 ? ">365" : o.days) : "--"}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{o.level}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>High under 30 days, Elevated under 60, Moderate under 120. Fitting fresh carbon before the hot months does not remove the risk on its own: the 2025 summer bed breached PAH on fresh carbon.</div>
          </Panel>
        ) : null}
        <Panel>
          <PanelTitle title="What would change this plan" />
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {[
              ["VSD", "Fan VSD retrofit.", "The fan runs about 68% above nameplate, cutting contact time. Slowing it extends both VOC and PAH life."],
              ["Lead-lag", "Second carbon vessel.", "Primary compliance safety net: a breakthrough on the lead bed is caught by the lag bed."],
              ["Cooling", "DCWBC gas cooling (Phase 2).", "Targets the summer PAH breach at high stack temperature."],
              ["Testing", "Test more, change less.", "A stack test is GBP " + STACK_TEST_COST_GBP.toLocaleString("en-GB") + " against GBP " + CHANGEOUT_COST_GBP.toLocaleString("en-GB") + " for a changeout, and each one sharpens the forecast."],
            ].map(r => (
              <div key={r[0]} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                <span style={{ flex:"0 0 auto", padding:"3px 10px", borderRadius:999, fontSize:12, fontWeight:600, background:"var(--accent-soft)", color:C.rund }}>{r[0]}</span>
                <div style={{ fontSize:13 }}><b>{r[1]}</b> <span style={{ color:C.muted }}>{r[2]}</span></div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ComplianceTab({ stackData, vocC, pahC, creoModel, opLoo }) {
  const tests = useMemo(()=>sortedTests(stackData), [stackData]);
  const latest = tests.length ? tests[tests.length - 1] : null;
  const vocTests = tests.filter(t=>t.voc != null);
  const pahTests = tests.filter(t=>t.pah != null);
  const vocOver = vocTests.filter(t=>t.voc > VOC_ELV).length;
  const pahOver = pahTests.filter(t=>t.pah > PAH_ELV).length;
  const latestPass = latest && (latest.voc == null || latest.voc <= VOC_ELV) && (latest.pah == null || latest.pah <= PAH_ELV);
  const band = Math.exp(vocUncertaintyMultiplier(vocC));
  const ptsRaw = tests.filter(t=>t.pah != null && t.pah > 0 && t.stackTemp != null);
  // Label placement: put a label on the left when the point is near the right edge or a
  // neighbour's label would collide (within ~6% across and ~8% up/down).
  const pts = ptsRaw.map(t => ({ ...t })).sort((a, b) => a.stackTemp - b.stackTemp);
  pts.forEach((t, i) => {
    const x = (t.stackTemp - 10) / 25 * 100, y = (Math.log(t.pah) / Math.LN10 - 1) / 3 * 100;
    const clash = pts.slice(0, i).some(o => !o.labelLeft && Math.abs((o.stackTemp - 10) / 25 * 100 - x) < 6 && Math.abs((Math.log(o.pah) / Math.LN10 - 1) / 3 * 100 - y) < 8);
    t.labelLeft = x > 85 || clash;
  });
  const tMin = 10, tMax = 35;
  const breachLo = pahFailTemp(1500, pahC), breachHi = pahFailTemp(200, pahC);
  const xPos = t => Math.max(0, Math.min(100, (t - tMin) / (tMax - tMin) * 100));
  const yPos = v => Math.max(0, Math.min(100, (log10(v) - 1) / 3 * 100));
  const zoneL = xPos(Math.min(breachLo, breachHi)), zoneR = xPos(Math.max(breachLo, breachHi));
  const th = { textAlign:"left", padding:"10px 12px", fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", color:C.muted, fontWeight:600, borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" };
  const td = { padding:"10px 12px", borderBottom:`1px solid ${C.border}`, fontSize:13 };
  const hoursFlagged = tests.filter(t => t.workingDays && t.activeHrs / t.workingDays > 24);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div>
        <Label>Stack tests and compliance - MCERTS, Emission Point A4</Label>
        <h1 style={{ margin:"6px 0 0", fontFamily:HEAD_FONT, fontWeight:600, fontSize:"clamp(22px, 3vw, 30px)", color:C.ink }}>PAH tracks stack temperature. VOC tracks bed age.</h1>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap:16 }}>
        <StatPill label="Tests on record" value={tests.length} unit="" sub={tests.length ? fmtDayMonth(tests[0].date) + " " + String(tests[0].date).slice(0,4) + " to " + fmtDayMonth(latest.date) + " " + String(latest.date).slice(0,4) : ""} />
        <StatPill label="VOC over limit" value={vocOver + " / " + vocTests.length} unit="" color={vocOver ? C.red : C.teal} sub={"limit " + VOC_ELV + " mg/m3"} />
        <StatPill label="PAH over limit" value={pahOver + " / " + pahTests.length} unit="" color={pahOver ? C.red : C.teal} sub={"limit " + PAH_ELV.toLocaleString("en-GB") + " ug/m3"} />
        <StatPill label={"Latest" + (latest ? " - " + latest.period : "")} value={latest ? (latestPass ? "Pass" : "Over") : "--"} unit="" color={latestPass ? C.teal : C.red} sub={latest ? "VOC " + (latest.voc != null ? latest.voc : "--") + " - PAH " + (latest.pah != null ? latest.pah : "--") + " - " + fmtDayMonth(latest.date) : ""} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(400px, 100%), 1fr))", gap:20 }}>
        <Panel>
          <PanelTitle title="PAH against stack temperature" sub={"Each dot is a test. Shaded: model breach zone (" + Math.min(breachLo, breachHi).toFixed(1) + " to " + Math.max(breachLo, breachHi).toFixed(1) + " C across 200 to 1,500 active hours)."} />
          <div style={{ display:"grid", gridTemplateColumns:"44px minmax(0, 1fr)", gap:8 }}>
            <div style={{ position:"relative", height:280, fontSize:12, color:C.muted, fontFamily:MONO }}>
              <span style={{ position:"absolute", right:0, top:-6 }}>10k</span><span style={{ position:"absolute", right:0, top:"31%" }}>1k</span><span style={{ position:"absolute", right:0, top:"64%" }}>100</span><span style={{ position:"absolute", right:0, bottom:-6 }}>10</span>
            </div>
            <div style={{ position:"relative", height:280, borderLeft:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
              <div style={{ position:"absolute", top:0, bottom:0, left:zoneL + "%", width:Math.max(1, zoneR - zoneL) + "%", background:TINT.redBg }} />
              <div style={{ position:"absolute", left:0, right:0, bottom:yPos(PAH_ELV) + "%", borderTop:`2px dashed ${C.red}` }} />
              <div style={{ position:"absolute", left:6, bottom:"calc(" + yPos(PAH_ELV) + "% + 4px)", fontSize:12, color:C.red, fontWeight:600 }}>PAH limit</div>
              {pts.map(p => (
                <Fragment key={p.period}>
                  <div title={p.period + ": " + p.stackTemp + " C stack, PAH " + p.pah} style={{ position:"absolute", width:12, height:12, margin:"0 0 -6px -6px", borderRadius:"50%", background:p.pah > PAH_ELV ? C.red : C.rund, border:`2px solid ${C.surface}`, left:xPos(p.stackTemp) + "%", bottom:yPos(p.pah) + "%" }} />
                  <div style={{ position:"absolute", fontSize:12, color:C.muted, fontFamily:MONO, marginBottom:4, left:xPos(p.stackTemp) + "%", bottom:yPos(p.pah) + "%", transform:p.labelLeft ? "translateX(calc(-100% - 10px))" : "translateX(10px)", whiteSpace:"nowrap" }}>{p.period}</div>
                </Fragment>
              ))}
            </div>
            <div />
            <div style={{ position:"relative", height:18, fontSize:12, color:C.muted, fontFamily:MONO }}>
              <span style={{ position:"absolute", left:0 }}>{tMin} C</span><span style={{ position:"absolute", left:"50%", transform:"translateX(-50%)" }}>{(tMin + tMax) / 2} C stack</span><span style={{ position:"absolute", right:0 }}>{tMax} C</span>
            </div>
          </div>
        </Panel>
        <Panel>
          <PanelTitle title="Model fit" sub={"Calibrated on " + (vocC && vocC.n ? vocC.n : "--") + " VOC and " + (pahC && pahC.n ? pahC.n : "--") + " PAH periods"} />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(2, minmax(0, 1fr))", gap:12 }}>
            <StatPill label="VOC R2" value={vocC && vocC.r2 != null ? vocC.r2.toFixed(2) : "--"} unit="" sub={"cross-validated " + (vocC && vocC.r2_loo != null ? vocC.r2_loo.toFixed(2) : "--")} />
            <StatPill label="PAH R2" value={pahC && pahC.r2 != null ? pahC.r2.toFixed(2) : "--"} unit="" sub="temperature-led" />
            <StatPill label="VOC band" value={"x" + band.toFixed(2)} unit="" color={C.amber} sub="applied uncertainty" />
            <StatPill label="Over-limit rate" value={tests.length ? Math.round((vocOver + pahOver) / Math.max(1, vocTests.length + pahTests.length) * 100) + "%" : "--"} unit="" sub="of all VOC and PAH results" />
          </div>
          <div style={{ fontSize:12, color:C.muted, marginTop:14 }}>Uncertainty is shown, not hidden. Each new certified test narrows the band and moves the forecast.</div>
          {creoModel && creoModel.ready ? (
            <div style={{ marginTop:16 }}>
              <Label>Prediction error on unseen tests (leave-one-out)</Label>
              <div style={{ overflowX:"auto" }}><table style={{ width:"100%", borderCollapse:"collapse", marginTop:8, minWidth:420 }}>
                <thead><tr><th style={th}>Model</th><th style={th}>VOC band</th><th style={th}>PAH band</th><th style={th}>VOC fit R2</th></tr></thead>
                <tbody>
                  <tr><td style={td}>Run hours + ambient (operative)</td><td style={{ ...td, fontFamily:MONO }}>{opLoo.voc != null ? "x" + Math.exp(opLoo.voc).toFixed(2) : "--"}</td><td style={{ ...td, fontFamily:MONO }}>{opLoo.pah != null ? "x" + Math.exp(opLoo.pah).toFixed(2) : "--"}</td><td style={{ ...td, fontFamily:MONO }}>{vocC && vocC.r2 != null ? vocC.r2.toFixed(2) : "--"}</td></tr>
                  <tr><td style={td}>Creosote throughput + stack temp (trial)</td><td style={{ ...td, fontFamily:MONO, color:C.teal, fontWeight:600 }}>{"x" + Math.exp(creoModel.vocLoo).toFixed(2)}</td><td style={{ ...td, fontFamily:MONO, color:C.teal, fontWeight:600 }}>{"x" + Math.exp(creoModel.pahLoo).toFixed(2)}</td><td style={{ ...td, fontFamily:MONO }}>{creoModel.voc.r2.toFixed(2)}</td></tr>
                </tbody>
              </table></div>
              <div style={{ fontSize:12, color:C.muted, marginTop:8 }}>Lower band = better prediction of tests the model has not seen. Trial VOC: ln VOC = {creoModel.voc.a.toFixed(2)} ln(t) + {creoModel.voc.b.toFixed(3)} T_stack {creoModel.voc.c < 0 ? "-" : "+"} {Math.abs(creoModel.voc.c).toFixed(2)}, n = {creoModel.n}.</div>
            </div>
          ) : null}
        </Panel>
      </div>

      <div style={{ padding:"14px 16px", borderRadius:12, background:C.surface2, color:C.ink, fontSize:13, lineHeight:1.5 }}>
        <b>Creosote tonnes corrected (v2.5, 23 Nov 2026).</b> Some Daily Log entries repeated an earlier day's readings or missed a tank, so a delivery on those days was counted as usage. Creosote used is now the stock balance between real readings (opening stock + deliveries - closing stock), split across each gap by the charges run each day, and the trial model is calibrated on the corrected tonnes. The figure before correction is shown in brackets.
      </div>
      {hoursFlagged.length ? (
        <div style={{ padding:"14px 16px", borderRadius:12, background:TINT.amberBg, color:C.ink, fontSize:13, lineHeight:1.5 }}>
          <b style={{ color:C.amber }}>Run-hours basis check.</b> {hoursFlagged.map(t=>t.period).join(", ")} record more than 24 active hours per working day, so their hours are not on the same basis as earlier tests (likely both plants summed, or calendar hours; P9 to P14 are estimates). Reconcile them against the charge log before the next recalibration.
        </div>
      ) : null}
      <Panel style={{ padding:"8px 12px 12px" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:980 }}>
            <thead><tr><th style={th}>Test</th><th style={th}>Report</th><th style={th}>Date</th><th style={th}>Bed - day</th><th style={th}>Creosote t</th><th style={th}>Hrs / work day</th><th style={th}>Stack C</th><th style={th}>VOC mg/m3</th><th style={th}>PAH ug/m3</th><th style={th}>Result</th></tr></thead>
            <tbody>
              {tests.slice().reverse().map(t => {
                const vo = t.voc != null && t.voc > VOC_ELV, po = t.pah != null && t.pah > PAH_ELV;
                const res = vo && po ? "VOC + PAH over" : vo ? "VOC over" : po ? "PAH over" : "Pass";
                return (
                  <tr key={t.period}>
                    <td style={{ ...td, fontWeight:600 }}>{t.period}</td>
                    <td style={{ ...td, fontFamily:MONO, color:C.muted }}>{t.report || "--"}</td>
                    <td style={{ ...td, fontFamily:MONO }}>{fmtDateShort(t.date)}</td>
                    <td style={td}>{t.bedId ? t.bedId + (t.bedDay ? " - " + t.bedDay : "") : "--"}</td>
                    <td style={{ ...td, fontFamily:MONO }} title={t.creoTOriginal != null && Math.abs(t.creoTOriginal - t.creoT) >= 1 ? "Before copied-reading correction: " + Math.round(t.creoTOriginal).toLocaleString("en-GB") + " t" : undefined}>{t.creoT != null ? Math.round(t.creoT).toLocaleString("en-GB") : "--"}{t.creoTOriginal != null && Math.abs(t.creoTOriginal - t.creoT) >= 1 ? <span style={{ color:C.muted, fontSize:11 }}>{" (was " + Math.round(t.creoTOriginal).toLocaleString("en-GB") + ")"}</span> : null}</td>
                    <td style={{ ...td, fontFamily:MONO, color:t.workingDays && t.activeHrs / t.workingDays > 24 ? C.amber : C.ink, fontWeight:t.workingDays && t.activeHrs / t.workingDays > 24 ? 600 : 400 }}>{t.workingDays ? (t.activeHrs / t.workingDays).toFixed(1) : "--"}</td>
                    <td style={{ ...td, fontFamily:MONO }}>{t.stackTemp != null ? Number(t.stackTemp).toFixed(1) : "--"}</td>
                    <td style={{ ...td, fontFamily:MONO, color:vo ? C.red : C.ink, fontWeight:vo ? 600 : 400 }}>{t.voc != null ? t.voc : "--"}</td>
                    <td style={{ ...td, fontFamily:MONO, color:po ? C.red : C.ink, fontWeight:po ? 600 : 400 }}>{t.pah != null ? Number(t.pah).toLocaleString("en-GB") : "--"}</td>
                    <td style={td}><Chip tone={res === "Pass" ? "ok" : "bad"}>{res}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================
// v2.4.0 CARBON CHANGES - simple recording and history
// ============================================================
// Bed start dates before in-app recording began, taken from the stack test records.
const CHANGEOUT_HISTORY_SEED = [
  { date:"2024-09-01", bed:"Bed 1", source:"records" },
  { date:"2025-06-01", bed:"Bed 2", source:"records" },
  { date:"2025-08-01", bed:"Bed 3", source:"records" },
  { date:"2026-01-12", bed:"Bed 4", source:"records" },
  { date:"2026-03-20", bed:"Bed 5", source:"records" },
  { date:"2026-06-05", bed:"Bed 6", source:"records" },
  { date:"2026-08-25", bed:"Bed 7", source:"records" },
  { date:"2026-11-05", bed:"Bed 8", source:"records" },
];
function changeoutHistory(stored, lastChangeout) {
  const list = (stored && stored.length ? stored : CHANGEOUT_HISTORY_SEED).slice();
  const cur = String(lastChangeout || "").slice(0, 10);
  if (cur && !list.some(c => c.date === cur)) list.push({ date:cur, bed:"", source:"settings" });
  list.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  let n = 0;
  return list.map((c, i) => {
    n += 1;
    const next = list[i + 1];
    return { ...c, bed: c.bed || ("Bed " + n), removed: next ? next.date : null, days: next ? daysBetween(c.date, next.date) : null, current: !next };
  });
}

function ChangeoutDialog({ open, onClose, onSave, lastChangeout, userName }) {
  const todayIso = isoDateFromDate(new Date());
  const [form, setForm] = useState({ date:todayIso, batchRef:"", massKg:"6000", fittedBy:"", notes:"" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const firstRef = useRef(null);
  useEffect(() => {
    if (open) {
      setForm({ date:todayIso, batchRef:"", massKg:"6000", fittedBy:userName || "", notes:"" });
      setError("");
      setTimeout(() => { if (firstRef.current) firstRef.current.focus(); }, 30);
    }
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const save = async () => {
    if (!form.date) { setError("Enter the date the new carbon went in."); return; }
    if (form.date > todayIso) { setError("The date cannot be in the future."); return; }
    if (form.date <= String(lastChangeout).slice(0, 10)) { setError("The date must be after the current bed's start (" + fmtDateShort(lastChangeout) + ")."); return; }
    setSaving(true);
    try { await onSave({ ...form, massKg: form.massKg === "" ? null : Number(form.massKg) }); onClose(); }
    catch (e) { setError("Could not save: " + e.message); }
    setSaving(false);
  };
  const field = { display:"flex", flexDirection:"column", gap:6, fontSize:13, fontWeight:600, color:C.ink };
  const input = { height:44, padding:"0 12px", borderRadius:10, border:`1px solid ${C.border}`, background:C.surface2, color:C.ink, fontSize:15, fontFamily:"inherit", boxSizing:"border-box", width:"100%" };
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(5,10,16,0.62)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="changeout-title" onClick={e => e.stopPropagation()} style={{ width:"100%", maxWidth:520, maxHeight:"92vh", overflowY:"auto", background:C.surface, border:`1px solid ${C.border}`, borderRadius:16, padding:"24px 24px 20px", boxSizing:"border-box" }}>
        <h2 id="changeout-title" style={{ margin:0, fontFamily:HEAD_FONT, fontSize:22, fontWeight:600, color:C.ink }}>Record a carbon change</h2>
        <p style={{ margin:"8px 0 18px", fontSize:14, color:C.muted, lineHeight:1.5 }}>Use this when fresh carbon has been put into the bed. The countdown restarts from this date and the forecast updates straight away.</p>
        <div style={{ display:"grid", gap:14 }}>
          <label style={field}>Date the new carbon went in
            <input ref={firstRef} type="date" value={form.date} max={todayIso} onChange={e => setForm(f => ({ ...f, date:e.target.value }))} style={input} />
          </label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap:14 }}>
            <label style={field}>Carbon batch or delivery ref (optional)
              <input type="text" value={form.batchRef} placeholder="e.g. CX65 batch number" onChange={e => setForm(f => ({ ...f, batchRef:e.target.value }))} style={input} />
            </label>
            <label style={field}>Amount fitted (kg)
              <input type="number" inputMode="numeric" value={form.massKg} onChange={e => setForm(f => ({ ...f, massKg:e.target.value }))} style={input} />
            </label>
          </div>
          <label style={field}>Fitted by
            <input type="text" value={form.fittedBy} onChange={e => setForm(f => ({ ...f, fittedBy:e.target.value }))} style={input} />
          </label>
          <label style={field}>Notes (optional)
            <textarea value={form.notes} rows={2} onChange={e => setForm(f => ({ ...f, notes:e.target.value }))} style={{ ...input, height:"auto", padding:"10px 12px", resize:"vertical" }} />
          </label>
        </div>
        <div style={{ marginTop:14, padding:"10px 12px", borderRadius:10, background:TINT.blueBg, color:C.ink, fontSize:13, lineHeight:1.5 }}>
          The current bed (fitted {fmtDateShort(lastChangeout)}) will be closed off on this date. Downtime logged against it is cleared for the new bed.
        </div>
        {error ? <div role="alert" style={{ marginTop:12, color:C.red, fontSize:14, fontWeight:600 }}>{error}</div> : null}
        <div style={{ display:"flex", gap:10, justifyContent:"flex-end", flexWrap:"wrap", marginTop:18 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Record carbon change"}</Btn>
        </div>
      </div>
    </div>
  );
}

function CarbonChangesTab({ history, stackData, canEdit, onRecord, onUndoLast }) {
  const rows = history.slice().reverse();
  const tests = sortedTests(stackData);
  const done = history.filter(h => h.days != null);
  const avg = done.length ? Math.round(done.reduce((a, h) => a + h.days, 0) / done.length) : null;
  const shortest = done.length ? done.reduce((m, h) => h.days < m.days ? h : m) : null;
  const longest = done.length ? done.reduce((m, h) => h.days > m.days ? h : m) : null;
  const th = { textAlign:"left", padding:"10px 12px", fontSize:12, letterSpacing:"0.06em", textTransform:"uppercase", color:C.muted, fontWeight:600, borderBottom:`1px solid ${C.border}`, whiteSpace:"nowrap" };
  const td = { padding:"12px", borderBottom:`1px solid ${C.border}`, fontSize:14, verticalAlign:"top" };
  const last = history[history.length - 1];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      <div style={{ display:"flex", flexWrap:"wrap", justifyContent:"space-between", alignItems:"flex-end", gap:12 }}>
        <div>
          <Label>Carbon bed history</Label>
          <h1 style={{ margin:"6px 0 0", fontFamily:HEAD_FONT, fontWeight:600, fontSize:"clamp(22px, 3vw, 30px)", color:C.ink }}>{history.length} carbon beds fitted since {history.length ? fmtDateShort(history[0].date) : "--"}</h1>
        </div>
        {canEdit ? <Btn variant="primary" onClick={onRecord}>Record carbon change</Btn> : null}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap:16 }}>
        <StatPill label="Current bed fitted" value={last ? fmtDayMonth(last.date) : "--"} unit="" color={C.rund} sub={last ? daysBetween(last.date, new Date()) + " days in service" : ""} />
        <StatPill label="Average bed life" value={avg != null ? avg : "--"} unit="days" sub={done.length + " completed beds"} />
        <StatPill label="Shortest" value={shortest ? shortest.days : "--"} unit="days" color={C.amber} sub={shortest ? shortest.bed + ", fitted " + fmtDateShort(shortest.date) : ""} />
        <StatPill label="Longest" value={longest ? longest.days : "--"} unit="days" color={C.teal} sub={longest ? longest.bed + ", fitted " + fmtDateShort(longest.date) : ""} />
      </div>
      <Panel style={{ padding:"8px 12px 12px" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:720 }}>
            <thead><tr><th style={th}>Bed</th><th style={th}>Fitted</th><th style={th}>Changed</th><th style={th}>Days in service</th><th style={th}>Stack tests</th><th style={th}>Details</th></tr></thead>
            <tbody>
              {rows.map(h => {
                // Tests that carry a bed label use it (a test on a changeout morning belongs to the old bed);
                // others are matched by date.
                const inBed = tests.filter(t => t.bedId ? t.bedId === h.bed : (t.date >= h.date && (!h.removed || t.date < h.removed)));
                const over = inBed.filter(t => (t.voc != null && t.voc > VOC_ELV) || (t.pah != null && t.pah > PAH_ELV));
                return (
                  <tr key={h.date}>
                    <td style={{ ...td, fontWeight:600 }}>{h.bed}{h.current ? <span style={{ marginLeft:8 }}><Chip tone="accent">In use</Chip></span> : null}</td>
                    <td style={{ ...td, fontFamily:MONO }}>{fmtDateShort(h.date)}</td>
                    <td style={{ ...td, fontFamily:MONO }}>{h.removed ? fmtDateShort(h.removed) : "--"}</td>
                    <td style={{ ...td, fontFamily:MONO }}>{h.days != null ? h.days : daysBetween(h.date, new Date()) + " so far"}</td>
                    <td style={td}>{inBed.length ? inBed.map(t => t.period).join(", ") : "None"}{over.length ? <div style={{ marginTop:4 }}><Chip tone="bad">{over.length} over limit</Chip></div> : inBed.length ? <div style={{ marginTop:4 }}><Chip tone="ok">All within limits</Chip></div> : null}</td>
                    <td style={{ ...td, color:C.muted, fontSize:13 }}>{[h.batchRef, h.massKg ? h.massKg.toLocaleString("en-GB") + " kg" : "", h.fittedBy ? "by " + h.fittedBy : "", h.notes].filter(Boolean).join(" - ") || (h.source === "records" ? "From stack test records" : "")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {canEdit && last && last.source === "app" ? (
        <div style={{ fontSize:13, color:C.muted }}>Recorded the latest change by mistake? <button type="button" onClick={onUndoLast} style={{ background:"none", border:"none", color:C.red, fontWeight:600, cursor:"pointer", fontSize:13, fontFamily:"inherit", padding:0 }}>Undo the {fmtDateShort(last.date)} change</button></div>
      ) : null}
    </div>
  );
}

const NAV_AREAS = [
  { id:"overview",  label:"Overview",          tabs:[{ id:"home", label:"Summary" }, { id:"dashboard", label:"Engineering detail" }] },
  { id:"forecast",  label:"Forecast",          tabs:[{ id:"seasonplan", label:"12-month plan" }, { id:"forecast", label:"Bed forecast" }, { id:"tempanalysis", label:"Temperature analysis" }, { id:"trialmode", label:"Trial mode" }] },
  { id:"stack",     label:"Stack tests",       tabs:[{ id:"compliance", label:"Compliance" }, { id:"stack", label:"Test records" }, { id:"bat", label:"BAT compliance" }] },
  { id:"plant",     label:"Plant data",        tabs:[{ id:"changes", label:"Carbon changes" }, { id:"cycles", label:"Charge cycles" }, { id:"thermal", label:"Thermal monitoring" }] },
  { id:"materials", label:"Creosote & carbon", tabs:[{ id:"coa", label:"Creosote and CoA" }, { id:"carbonquality", label:"Carbon quality" }] },
  { id:"admin",     label:"Settings",          tabs:[{ id:"settings", label:"Settings" }, { id:"documents", label:"Documents" }, { id:"modeldetails", label:"Model details" }] },
];

// The clock lives in its own component so the rest of the app does not re-render every tick.
function HeaderClock() {
  const fmt = () => new Date().toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  const [t, setT] = useState(fmt);
  useEffect(() => { const id = setInterval(() => setT(fmt()), 30000); return () => clearInterval(id); }, []);
  return <span style={{ fontFamily:MONO }}>{t}</span>;
}
function AppHeader({ area, onArea, theme, onToggleTheme, user, syncLabel, syncError }) {
  const initials = user && user.username ? user.username.slice(0, 2).toUpperCase() : "--";
  return (
    <header style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:20 }}>
      <div className="hdr" style={{ maxWidth:1376, margin:"0 auto", display:"flex", flexWrap:"wrap", alignItems:"center", gap:"12px 24px", padding:"12px 24px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><path d="M17 2 30 9.5v15L17 32 4 24.5v-15z" fill="none" stroke={C.rund} strokeWidth="2" /><path d="M11 13.5h12M11 17h12M11 20.5h12" stroke={C.rund} strokeWidth="2" strokeLinecap="round" /></svg>
          <div>
            <div style={{ fontFamily:HEAD_FONT, fontWeight:700, fontSize:17, color:C.ink }}>Carbon Bed Model</div>
            <div className="hdr-sub" style={{ fontSize:12, color:C.muted }}>A4 GAC abatement - Permit EPR/A2/1</div>
          </div>
        </div>
        <nav aria-label="Main" className="mainnav" style={{ display:"flex", flexWrap:"wrap", gap:4, flex:"1 1 auto" }}>
          {NAV_AREAS.map(a => {
            const on = a.id === area;
            return <button key={a.id} type="button" className={on ? "" : "navbtn"} aria-current={on ? "page" : undefined} onClick={()=>onArea(a.id)} style={{ minHeight:40, padding:"0 14px", borderRadius:10, border:"none", cursor:"pointer", fontSize:14, fontFamily:"inherit", fontWeight:on ? 600 : 500, color:on ? C.rund : C.muted, background:on ? "var(--accent-soft)" : "transparent" }}>{a.label}</button>;
          })}
        </nav>
        <div className="hdr-tools" style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
          <div title={syncError || ""} className="hdr-sync" style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.muted }}>
            <span style={{ width:8, height:8, borderRadius:"50%", background:syncError ? C.red : C.teal, boxShadow:"0 0 0 4px " + (syncError ? TINT.redBg : TINT.safeBg) }} />
            <span>{syncLabel}</span><HeaderClock />
          </div>
          <button type="button" onClick={onToggleTheme} aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} style={{ display:"flex", alignItems:"center", gap:8, minHeight:40, padding:"0 14px", borderRadius:999, border:`1px solid ${C.border}`, background:C.surface2, color:C.ink, cursor:"pointer", fontSize:13, fontFamily:"inherit" }}>
            {theme === "light"
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <div title={user ? user.username + " (" + user.role + ")" : ""} style={{ width:40, height:40, borderRadius:"50%", background:"var(--accent-soft)", color:C.rund, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600, fontSize:14 }}>{initials}</div>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [activeArea, setActiveArea] = useState("overview");
  const [areaTabs, setAreaTabs] = useState(()=>{
    const init = {};
    NAV_AREAS.forEach(a => { init[a.id] = a.tabs[0].id; });
    return init;
  });
  const activeTab = areaTabs[activeArea];
  const setActiveTab = useCallback(tabId => setAreaTabs(prev => ({ ...prev, [activeArea]: tabId })), [activeArea]);
  const navigateTo = useCallback((areaId, tabId) => {
    setActiveArea(areaId);
    if (tabId) setAreaTabs(prev => ({ ...prev, [areaId]: tabId }));
    if (typeof window !== "undefined" && window.scrollTo) window.scrollTo(0, 0);
  }, []);
  const [lastSaved, setLastSaved]       = useState("");
  const markSaved = useCallback(t=>setLastSaved(t),[]);
  const { authState, login, logout, changePassword } = usePlatformAuth();
  const isViewer = !!(authState.user && authState.user.role === "viewer");
  const canEdit = !isViewer;
  const isAdmin = !!(authState.user && authState.user.role === "admin");
  const {
    platformState,
    platformMeta,
    updateKey,
    exportBackup,
    importBackup,
    resetPlatform,
    runChargeImportScan,
    importCreosoteWorkbook,
  } = usePlatformDocument(markSaved, !!authState.user);
  const { adminData, refreshAdminData, uploadDocument, createUser, downloadDocument } = usePlatformAdminData(!!authState.user, isAdmin);
  const stackDataExtra = platformState.cgb_stackDataExtra;
  const setStackDataExtra = useCallback(nextValueOrUpdater => updateKey("cgb_stackDataExtra", nextValueOrUpdater), [updateKey]);
  // Dataset is A4-only by construction: all stack test rows in this application
  // represent Emission Point A4 (Creosote Impregnation Plant), not A1.
  // v2.5.0: copied / incomplete Daily Log readings are rebuilt before any creosote total is taken.
  // v2.5.1: gaps are spread by the charges actually run each day (synced charge log).
  const creoClean = useMemo(()=>cleanCreoLog(platformState.cgb_creoDailyLog, platformState.cgb_chargeLog), [platformState.cgb_creoDailyLog, platformState.cgb_chargeLog]);
  const stackData = useMemo(()=>{
    // Seed periods take precedence: drop any manually-entered duplicates (e.g. P9-P14 keyed in before v1.9.0).
    const seedPeriods = new Set(INITIAL_STACK_DATA.map(d=>d.period));
    // Tests entered in the app take creosote used from the cleaned log (net stock balance), so a
    // figure saved under the old positive-only basis is recalculated whenever the log covers the period.
    const extras = (stackDataExtra || []).filter(d=>!seedPeriods.has(d.period)).map(d => {
      if (!d.periodStart || !d.date) return d;
      const kg = cleanUsageKg(creoClean.rows, String(d.periodStart).slice(0,10), String(d.date).slice(0,10));
      return kg == null ? d : { ...d, creoT: Math.round(kg / 100) / 10 };
    });
    return [...INITIAL_STACK_DATA, ...extras];
  }, [stackDataExtra, creoClean]);
  const coaData = platformState.cgb_coaData;
  const setCoaData = useCallback(nextValueOrUpdater => updateKey("cgb_coaData", nextValueOrUpdater), [updateKey]);
  const chargeLog = platformState.cgb_chargeLog;
  const setChargeLog = useCallback(nextValueOrUpdater => updateKey("cgb_chargeLog", nextValueOrUpdater), [updateKey]);
  const [weather, setWeather]           = useState(null);
  const [liveDaily, setLiveDaily]       = useState(null); // v2.9.0: 16-day daily-mean forecast for hot-day PAH risk
  const lastChangeout = platformState.cgb_lastChangeout;
  const storedChangeouts = platformState.cgb_changeouts;
  const changeoutList = useMemo(()=>changeoutHistory(storedChangeouts, lastChangeout), [storedChangeouts, lastChangeout]);
  const [changeoutOpen, setChangeoutOpen] = useState(false);
  const setLastChangeout = useCallback(nextValueOrUpdater => updateKey("cgb_lastChangeout", nextValueOrUpdater), [updateKey]);
  const downtimeHrs = platformState.cgb_downtimeHrs;
  const setDowntimeHrs = useCallback(nextValueOrUpdater => updateKey("cgb_downtimeHrs", nextValueOrUpdater), [updateKey]);
  const thermalLog = platformState.cgb_thermalLog;
  const setThermalLog = useCallback(nextValueOrUpdater => updateKey("cgb_thermalLog", nextValueOrUpdater), [updateKey]);
  const carbonCoaData = platformState.cgb_carbonCoaData;
  const setCarbonCoaData = useCallback(nextValueOrUpdater => updateKey("cgb_carbonCoaData", nextValueOrUpdater), [updateKey]);
  const loggerLog = platformState.cgb_loggerLog;
  const setLoggerLog = useCallback(nextValueOrUpdater => updateKey("cgb_loggerLog", nextValueOrUpdater), [updateKey]);
  const settings = platformState.cgb_settings || createDefaultPlatformState().cgb_settings;
  const setSettings = useCallback(nextValueOrUpdater => updateKey("cgb_settings", nextValueOrUpdater), [updateKey]);
  const updateSetting = useCallback((k,v)=>setSettings(s=>({...s,[k]:v})),[]);
  const currentPeriodChargeLog = useMemo(()=>filterChargeLogSince(chargeLog, lastChangeout), [chargeLog, lastChangeout]);

  const vocC = useMemo(()=>calibrateVOC(stackData),[stackData]);
  const creoModel = useMemo(()=>calibrateCreoModel(stackData),[stackData]);
  const opLoo = useMemo(()=>operativeLooLogRMSE(stackData),[stackData]);
  const pahC = useMemo(()=>calibratePAH(stackData),[stackData]);
  const appLogChargeHrs = useMemo(()=>calcActiveHrsFromLog(currentPeriodChargeLog),[currentPeriodChargeLog]);
  const appDaysSince = Math.max(0, Math.floor((new Date()-new Date(lastChangeout))/86400000));
  const appFallbackHrs = Math.max(0, Math.round(appDaysSince*24*settings.utilisationRate - downtimeHrs));
  const chargeActiveHrs = currentPeriodChargeLog.length > 0 ? Math.max(appLogChargeHrs - downtimeHrs, 0) : appFallbackHrs;
  const effectiveChargeActiveHrs = calcEffectiveHours(chargeActiveHrs, lastChangeout, isoDateFromDate(new Date()));
  const latestScadaReading = useMemo(()=>{
    const rows = (platformState.cgb_creoDailyLog || []).filter(r => r && r.ambientC != null).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const last = rows.length ? rows[rows.length - 1] : null;
    return last && daysBetween(last.date, new Date()) <= 2 ? last : null;
  }, [platformState.cgb_creoDailyLog]);
  const appAmbientTemp = weather ? weather.temperature_2m : latestScadaReading ? latestScadaReading.ambientC : settings.typicalTempC;
  const creoBed = useMemo(()=>creosoteBedState(creoClean.rows, lastChangeout, settings, new Date()), [creoClean, lastChangeout, settings]);
  // v2.9.0 hot-day PAH risk: PAH forecast on the hottest 1-in-N day, not the monthly mean.
  // Uses the creosote-throughput PAH fit when it is calibrated (it back-tests better), else run hours.
  const pahRisk = useMemo(()=>{
    const pct = settings.pahRiskPercentile || 90;
    const hot = calibrateHotDay(stackData, BOSTON_MONTHLY_TEMPS, STACK_TEMP_A, STACK_TEMP_B);
    const useCreo = !!(creoModel && creoModel.ready && creoModel.pah);
    const model = useCreo ? { a:creoModel.pah.a, b:creoModel.pah.b, c:creoModel.pah.c } : { a:pahC.a, b:pahC.b, c:pahC.c };
    const load0 = useCreo ? creoBed.tonnes : effectiveChargeActiveHrs;
    const rate = useCreo ? creoBed.rate : 24 * (settings.utilisationRate || 0.82);
    const base = { model, hot, stackA:STACK_TEMP_A, stackB:STACK_TEMP_B, tMonth:BOSTON_MONTHLY_TEMPS, percentile:pct, elv:PAH_ELV };
    const liveMeans = liveDaily ? liveDaily.map(d => d.mean) : [];
    const days = pahRiskDays({ ...base, start:new Date(), horizon:365, load0, ratePerDay:rate, liveMeans });
    const season = pahSeasonOutlook({ ...base, ratePerDay:rate });
    const back = pahHindcast(stackData, { ...base, loadOf: useCreo ? (d => d.creoT || 0) : (d => effectiveHoursForStackRecord(d)) });
    const over = back.filter(b => b.over);
    return {
      base, model, pct, hot, kind: useCreo ? "creo" : "op", unit: useCreo ? "t" : "hrs", load0, rate, days, season,
      first: days.first, liveDays: liveMeans.length, liveDates: liveDaily ? liveDaily.map(d => d.date) : [],
      back, caught: over.filter(b => b.flagged).length, nOver: over.length, falseAlarms: back.filter(b => b.flagged && !b.over).length,
    };
  }, [settings.pahRiskPercentile, settings.utilisationRate, stackData, creoModel, pahC, creoBed, effectiveChargeActiveHrs, liveDaily]);
  // v2.6.0 Trial Mode: live calibration handed to the what-if engine (read-only there).
  // App PAH model is a*stackTemp + b*ln(t) + c; the engine uses a*ln(t) + b*T + c, so a and b swap.
  const trialCalibration = useMemo(()=>{
    const cal = {
      elvVOC: VOC_ELV, elvPAH: PAH_ELV,
      stackI: STACK_TEMP_A, stackS: STACK_TEMP_B,
      tMonth: BOSTON_MONTHLY_TEMPS.slice(), rhMonth: BOSTON_MONTHLY_RH.slice(),
      carbonMass0: BED_MASS,
    };
    if (creoModel && creoModel.ready) {
      cal.voc = { a: creoModel.voc.a, b: creoModel.voc.b, c: creoModel.voc.c };
      cal.pah = { a: creoModel.pah.b, b: creoModel.pah.a, c: creoModel.pah.c };
      if (creoModel.vocLoo) cal.voc.band = Math.round(Math.exp(creoModel.vocLoo) * 100) / 100;
      if (creoModel.pahLoo) cal.pah.band = Math.round(Math.exp(creoModel.pahLoo) * 100) / 100;
    }
    return cal;
  }, [creoModel]);
  const trialDefaults = useMemo(()=>({
    throughput: settings.creoRateTPerDay != null ? settings.creoRateTPerDay : 11,
    changeoutFixed: CHANGEOUT_COST_GBP - BED_MASS * 2,
  }), [settings.creoRateTPerDay]);
  const appAmbientSource = weather ? "Open-Meteo live" : latestScadaReading ? "SCADA print " + latestScadaReading.date : "settings typical value";
  const appRH = settings.useConservativeRH ? 90 : (weather ? weather.relative_humidity_2m : settings.typicalRH);
  const appOperativeTemp = operativeTemp(appAmbientTemp, settings.stackTempCorrectionC ?? 10.3);
  const thermalStats = useMemo(()=>computeThermalStats(thermalLog), [thermalLog]);
  const latestCarbonBatch = useMemo(()=>{
    const records = (carbonCoaData || []).slice().sort((a, b)=>(a.date || "").localeCompare(b.date || ""));
    return records.length ? records[records.length - 1] : null;
  }, [carbonCoaData]);

  useEffect(()=>{
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m&timezone=Europe%2FLondon`)
      .then(r=>r.json()).then(d=>{if(d.current)setWeather(d.current);}).catch(()=>{});
    // v2.9.0: 16-day daily-mean forecast feeds the hot-day PAH risk (climatology after that).
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min&forecast_days=16&timezone=Europe%2FLondon`)
      .then(r=>r.json()).then(d=>{
        const dl = d && d.daily;
        if (!dl || !dl.time || !dl.time.length) return;
        const rows = dl.time.map((t, i) => {
          const mean = dl.temperature_2m_mean && dl.temperature_2m_mean[i] != null ? dl.temperature_2m_mean[i]
            : (dl.temperature_2m_max && dl.temperature_2m_min && dl.temperature_2m_max[i] != null && dl.temperature_2m_min[i] != null ? (dl.temperature_2m_max[i] + dl.temperature_2m_min[i]) / 2 : null);
          return { date: t, mean, max: dl.temperature_2m_max ? dl.temperature_2m_max[i] : null };
        });
        // Keep only the unbroken run from today so day 0 lines up with today.
        const todayIso = isoDateFromDate(new Date());
        const start = rows.findIndex(r => r.date === todayIso);
        const run = [];
        for (let i = Math.max(0, start); start >= 0 && i < rows.length && Number.isFinite(rows[i].mean); i++) run.push(rows[i]);
        if (run.length) setLiveDaily(run);
      }).catch(()=>{});
  },[]);

  useEffect(()=>{
    const p7 = INITIAL_STACK_DATA.find(d=>d.period==="P7");
    if (p7) console.log("P7 effective hours after fan weighting:", calcEffectiveHours(p7.activeHrs, p7.periodStart, p7.periodEnd));
  },[]);

  const TABS = [
    { id:"dashboard",    label:"Dashboard"     },
    { id:"cycles",       label:"Charge Cycles" },
    { id:"stack",        label:"Stack Tests"   },
    { id:"forecast",     label:"Forward Forecast" },
    { id:"thermal",      label:"Thermal Monitoring" },
    { id:"coa",          label:"CoA Data"      },
    { id:"carbonquality", label:"Carbon Quality" },
    { id:"documents",    label:"Documents"     },
    { id:"tempanalysis", label:"Temp Analysis" },
    { id:"bat",          label:"BAT Compliance" },
    { id:"modeldetails", label:"Model Details" },
    { id:"settings",     label:"Settings"      },
  ];

  useEffect(()=>{
    if (authState.user) void refreshAdminData();
  }, [authState.user, refreshAdminData]);

  useEffect(()=>{
    if (authState.user && canEdit) {
      void runChargeImportScan();
    }
  }, [authState.user, canEdit, runChargeImportScan]);

  if (!authState.ready || authState.loading) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, color:C.ink, fontFamily:"Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth:520, padding:"24px 28px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:"0 8px 24px rgba(28,38,54,0.08)" }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.header, marginBottom:8 }}>Checking platform session</div>
          <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>
            Connecting to the shared platform and validating operator access.
          </div>
        </div>
      </div>
    );
  }

  if (!authState.user) {
    return <LoginScreen onLogin={login} authError={authState.error} adminStatus={authState.adminStatus} />;
  }

  if (!platformMeta.ready && platformMeta.loading) {
    return (
      <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:C.bg, color:C.ink, fontFamily:"Inter, system-ui, sans-serif" }}>
        <div style={{ maxWidth:520, padding:"24px 28px", background:C.surface, border:`1px solid ${C.border}`, borderRadius:8, boxShadow:"0 8px 24px rgba(28,38,54,0.08)" }}>
          <div style={{ fontSize:18, fontWeight:800, color:C.header, marginBottom:8 }}>Loading shared carbon platform</div>
          <div style={{ fontSize:13, color:C.muted, lineHeight:1.6 }}>
            Connecting to the shared server state so all operators are working from the same charge log, calibration data, and backups.
          </div>
        </div>
      </div>
    );
  }

  const currentArea = NAV_AREAS.find(x => x.id === activeArea) || NAV_AREAS[0];
  const recordChangeout = async form => {
    const base = (storedChangeouts && storedChangeouts.length ? storedChangeouts : changeoutList.map(({ date, bed, source }) => ({ date, bed, source }))).filter(c => c.date !== form.date);
    const entry = { date:form.date, batchRef:form.batchRef || "", massKg:form.massKg, fittedBy:form.fittedBy || "", notes:form.notes || "", source:"app", recordedBy:authState.user ? authState.user.username : "", recordedAt:new Date().toISOString() };
    updateKey("cgb_changeouts", [...base, entry]);
    setLastChangeout(form.date);
    setDowntimeHrs(0);
  };
  const undoLastChangeout = () => {
    const list = (storedChangeouts || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = list[list.length - 1];
    if (!last || last.source !== "app") return;
    if (!window.confirm("Undo the carbon change recorded for " + fmtDateShort(last.date) + "? The previous bed becomes current again.")) return;
    const rest = list.slice(0, -1);
    updateKey("cgb_changeouts", rest);
    if (rest.length) setLastChangeout(rest[rest.length - 1].date);
  };
  return (
    <div style={{ background:C.bg, color:C.ink, minHeight:"100vh", fontFamily:"Inter, system-ui, sans-serif" }}>
      <AppHeader area={activeArea} onArea={id=>navigateTo(id)} theme={theme} onToggleTheme={toggleTheme} user={authState.user} syncLabel={platformMeta.syncLabel} syncError={platformMeta.error} />
      <main style={{ maxWidth:1376, margin:"0 auto", padding:"24px 24px 40px", boxSizing:"border-box" }}>
        {currentArea.tabs.length > 1 ? <TabBar tabs={currentArea.tabs} active={activeTab} onChange={setActiveTab} /> : null}
        {platformMeta.error || isViewer ? (
          <div style={{ marginBottom:16, padding:"10px 14px", borderRadius:10, background:platformMeta.error ? TINT.redBg : TINT.blueBg, color:platformMeta.error ? TINT.redText : TINT.blueText, fontSize:13 }}>
            {platformMeta.error ? "Sync problem: " + platformMeta.error : ""}{platformMeta.error && isViewer ? " | " : ""}{isViewer ? "Read-only viewer mode" : ""}
          </div>
        ) : null}
        {activeTab==="changes"      && <CarbonChangesTab history={changeoutList} stackData={stackData} canEdit={canEdit} onRecord={()=>setChangeoutOpen(true)} onUndoLast={undoLastChangeout} />}
        {activeTab==="home"         && <HomeTab stackData={stackData} settings={settings} lastChangeout={lastChangeout} vocC={vocC} pahC={pahC} activeHrs={effectiveChargeActiveHrs} ambient={appAmbientTemp} ambientSource={appAmbientSource} rh={appRH} creoDailyLog={platformState.cgb_creoDailyLog} creoDeliveries={platformState.cgb_creoDeliveries} platformMeta={platformMeta} onNavigate={navigateTo} creoModel={creoModel} creoBed={creoBed} opLoo={opLoo} canEdit={canEdit} onRecordChangeout={()=>setChangeoutOpen(true)} changeoutList={changeoutList} pahRisk={pahRisk} />}
        {activeTab==="seasonplan"   && <SeasonPlanTab settings={settings} lastChangeout={lastChangeout} vocC={vocC} pahC={pahC} activeHrs={effectiveChargeActiveHrs} creoModel={creoModel} creoBed={creoBed} opLoo={opLoo} onNavigate={navigateTo} pahRisk={pahRisk} />}
        {activeTab==="compliance"   && <ComplianceTab stackData={stackData} vocC={vocC} pahC={pahC} creoModel={creoModel} opLoo={opLoo} />}
        {activeTab==="dashboard"    && (
          <>
            <ProcessSchematic
              activeHrs={effectiveChargeActiveHrs}
              vocWindowHrs={safeWindowHoursVOC(appAmbientTemp, appRH, vocC, settings.naphthaleneFrac)}
              tvocPredicted={predictVOC(effectiveChargeActiveHrs, appAmbientTemp, appRH, vocC)}
              pahPredicted={predictPAH(estimateStackTemp(appAmbientTemp), effectiveChargeActiveHrs, pahC)}
              stackTempC={estimateStackTemp(appAmbientTemp)}
            />
          </>
        )}
        {activeTab==="dashboard"    && <DashboardTab    stackData={stackData} settings={settings} weather={weather} ambientOverride={appAmbientTemp} chargeLog={chargeLog} lastChangeout={lastChangeout} downtimeHrs={downtimeHrs} onDowntime={setDowntimeHrs} vocC={vocC} pahC={pahC} canEdit={canEdit} latestCarbonBatch={latestCarbonBatch} />}
        {activeTab==="cycles"       && <ChargeCyclesTab chargeLog={chargeLog} onAddCharge={c=>setChargeLog(l=>[...l,c])} onAddCharges={list=>setChargeLog(l=>[...l,...list])} onDeleteCharge={id=>setChargeLog(l=>l.filter(c=>c.id!==id))} lastChangeout={lastChangeout} settings={settings} vocC={vocC} canEdit={canEdit} />}
        {activeTab==="stack"        && <StackTestsTab   stackData={stackData} lastChangeout={lastChangeout} onAdd={e=>setStackDataExtra(d=>[...d,enrichStackRecord(e, lastChangeout, creoClean.rows)])} settings={settings} onArchiveDocument={uploadDocument} canArchiveDocuments={canEdit} canEdit={canEdit} />}
        {activeTab==="forecast"     && <ForwardForecastTab stackData={stackData} settings={settings} onSettingChange={updateSetting} lastChangeout={lastChangeout} onChangeoutDateChange={setLastChangeout} vocC={vocC} pahC={pahC} thermalStats={thermalStats} canEdit={canEdit} currentActiveHrs={effectiveChargeActiveHrs} pahRisk={pahRisk} />}
        {activeTab==="thermal"      && <ThermalAnalysisTab thermalLog={thermalLog} thermalStats={thermalStats} onAddThermalEntry={entry=>setThermalLog(list=>[...list, entry])} onDeleteThermalEntry={id=>setThermalLog(list=>list.filter(entry=>entry.id!==id))} loggerLog={loggerLog} onImportLoggerData={rows=>setLoggerLog(list=>[...list, ...rows])} onClearLoggerData={()=>setLoggerLog([])} onUpdateCorrectionFactor={newDelta=>updateSetting("stackTempCorrectionC", newDelta)} settings={settings} onChangeSetting={updateSetting} canEdit={canEdit} />}
        {activeTab==="coa"          && <CoATab onImportWorkbook={importCreosoteWorkbook} creoDeliveries={platformState.cgb_creoDeliveries} creoDailyLog={creoClean.rows} creoFlagged={creoClean.flaggedCount} creoImportStatus={platformMeta && platformMeta.imports ? platformMeta.imports.creosote : null} coaData={coaData} onAdd={e=>setCoaData(d=>[...d,e])} onImport={e=>setCoaData(d=>d.find(x=>x.certNo===e.certNo)?d:[...d,e])} settings={settings} onSettingChange={updateSetting} onArchiveDocument={uploadDocument} canArchiveDocuments={canEdit} canEdit={canEdit} />}
        {activeTab==="carbonquality" && <CarbonQualityTab carbonCoaData={carbonCoaData} onAdd={entry=>setCarbonCoaData(d=>[...d, entry])} onDelete={id=>setCarbonCoaData(d=>d.filter(e=>e.id!==id))} onArchiveDocument={uploadDocument} canArchiveDocuments={canEdit} canEdit={canEdit} settings={settings} />}
        {activeTab==="documents"    && <DocumentLibraryTab adminData={adminData} isAdmin={isAdmin} onDownloadDocument={downloadDocument} />}
        {activeTab==="tempanalysis" && <TempAnalysisTab vocC={vocC} pahC={pahC} settings={settings} pahRisk={pahRisk} />}
        {activeTab==="trialmode"    && <TrialModeTab appMode calibration={trialCalibration} defaults={trialDefaults} />}
        {activeTab==="bat"          && <BATComplianceTab settings={settings} onChange={updateSetting} canEdit={canEdit} stackData={stackData} />}
        {activeTab==="modeldetails" && <ModelDetailsTab stackData={stackData} vocC={vocC} pahC={pahC} settings={settings} latestCarbonBatch={latestCarbonBatch} />}
        {activeTab==="settings"     && <SettingsTab     onRecordChangeout={()=>setChangeoutOpen(true)} settings={settings} onChange={updateSetting} lastChangeout={lastChangeout} onChangeoutDateChange={setLastChangeout} vocC={vocC} pahC={pahC} platformMeta={platformMeta} onExportBackup={exportBackup} onImportBackup={importBackup} onResetPlatform={resetPlatform} onRunChargeImportScan={runChargeImportScan} authState={authState} onLogout={logout} onChangePassword={changePassword} onCreateUser={createUser} adminData={adminData} onDownloadDocument={downloadDocument} />}

        <ChangeoutDialog open={changeoutOpen} onClose={()=>setChangeoutOpen(false)} onSave={recordChangeout} lastChangeout={lastChangeout} userName={authState.user ? (authState.user.displayName || authState.user.username) : ""} />
        <footer style={{ marginTop:28, paddingTop:18, borderTop:`1px solid ${C.border}`, display:"flex", flexWrap:"wrap", justifyContent:"space-between", gap:10, fontSize:12, color:C.muted }}>
          <div>Calders &amp; Grandidge (Boston) Ltd - Permit EPR/A2/1 - BAT 51/52 (EU) 2020/2009 - For compliance planning only; does not replace MCERTS stack testing.</div>
          <div style={{ fontFamily:MONO }}>Model {MODEL_VERSION} - state v{platformMeta.version || 0} - synced {formatSyncStamp(platformMeta.updatedAt)}{lastSaved ? " - saved " + lastSaved : ""}</div>
        </footer>
      </main>
    </div>
  );
}
