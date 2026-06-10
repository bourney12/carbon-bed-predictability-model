import { useState, useEffect, useCallback, useMemo } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea, ResponsiveContainer
} from "recharts";

// ============================================================
// BRAND TOKENS
// ============================================================
const C = {
  bg:       "#f8f9fb",
  surface:  "#ffffff",
  surface2: "#f0f3f7",
  surface3: "#e8ecf2",
  header:   "#1c2636",
  border:       "#d6dce6",
  borderBright: "#b0bccf",
  borderGreen:  "#b8d98a",
  green:  "#2D5016",
  mid:    "#3D6B1E",
  rund:   "#4a7c1f",
  gold:   "#c9a227",
  white:  "#1c2636",
  ivory:  "#f0f3f7",
  ink:    "#1c2636",
  muted:  "#5a6e82",
  mono:   "#2d3f55",
  teal:   "#4a7c1f",
  amber:  "#d97b0e",
  red:    "#c0392b",
  blue:   "#2980b9",
  timber: "#8B6914",
};
const TINT = {
  safeBg: "#e8f2da",
  safeText: "#2a5000",
  amberBg: "#fef3e0",
  amberText: "#7a3d00",
  redBg: "#fdf0ef",
  redText: "#7a1010",
  blueBg: "#edf6fd",
  blueText: "#0d3d6e",
};
const MONO = "'Consolas', 'Courier New', monospace";
const MODEL_VERSION = "v1.5.1";
const MODEL_BUILD_DATE = "2026-06-10";

// ============================================================
// CONSTANTS
// ============================================================
const VOC_ELV    = 20;      // mg/m3  TVOC ELV permit EPR/A2/1
const PAH_ELV    = 1000;    // ug/m3  total PAH ELV permit EPR/A2/1
const BED_MASS   = 6000;    // kg GAC
const FLOW_M3HR  = 9000;    // m3/hr nominal extraction flow
const GAC_BULK_DENSITY_KGM3 = 450;
const DEFAULT_CROSS_SECTION_M2 = 1.5;
const NAPHTHALENE_MW = 128.17;
const SAME_BED_VOC_LIMIT_HRS = 1155;
const LAT        = 52.9833;
const LON        = 0.0167;
const P1_AVG_HRS = 5.85;    // hrs/charge  Plant 1 (blended average, all product types)
const P2_AVG_HRS = 7.84;    // hrs/charge  Plant 2 (blended average, all product types)

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

function calcEffectiveHours(activeHrs, periodStart, periodEnd) {
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
  FAN_CONFIG_LOG.forEach(function(cfg) {
    var cfgFrom = new Date(cfg.from);
    var cfgTo = cfg.to ? new Date(cfg.to) : new Date("2099-12-31");
    var overlapStart = cfgFrom > start ? cfgFrom : start;
    var overlapEnd = cfgTo < end ? cfgTo : end;
    if (overlapEnd > overlapStart) {
      var overlapMs = overlapEnd - overlapStart;
      var flowRatio = cfg.typicalStackDischargeFlow_m3hr / REFERENCE_FLOW;
      weightedMs += overlapMs * flowRatio;
    }
  });

  var correctionFactor = totalMs > 0 ? weightedMs / totalMs : 1.0;
  return activeHrs * correctionFactor;
}

function filterFlowCalculationRecords(records) {
  return records.filter(function(record) {
    return record.excludeFromFlowCalcs !== true;
  });
}

// VOC model defaults - Ridge L2, all 8 periods, ln(rawHrs) + ambientTemp
// Calibrated at nf=0.53. WJ fraction effect applied only to safeWindowHours output
// (not to predictVOC input) so coefficients remain consistent with calibration data.
// R2=0.47 - weak fit reflects small dataset and P1-P3 same-carbon confound.
// Uncertainty band x1.85 (1SD in log space).
const D_VOC_A =  0.8039;   // ln(rawActiveHrs) coefficient
const D_VOC_B =  0.0960;   // avgTemp (ambient) coefficient
const D_VOC_C = -3.3914;   // intercept
const VOC_RMSE_LOG = 0.6178; // RMSE in log space -> x1.85 uncertainty band

// PAH model defaults - bivariate: stackTemp (dominant) + ln(activeHrs)
// Fresh-carbon periods only (P4,P5,P6,P7): R2=0.9994, hours coeff POSITIVE (physically valid)
// ln(PAH) = D_PAH_A*stackTemp + D_PAH_B*ln(activeHrs) + D_PAH_C
// ELV breach governed primarily by temperature; hours provide a real secondary ageing signal.
const D_PAH_A =  0.2697;   // stackTemp coefficient (dominant driver)
const D_PAH_B =  0.0093;   // ln(activeHrs) coefficient (positive = conservative with age)
const D_PAH_C =  1.0686;   // intercept
const PAH_RMSE_LOG = 0.0420; // RMSE from fresh-carbon bivariate fit
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
// SEED DATA P1-P8
// ============================================================
const INITIAL_STACK_DATA = [
  { period:"P1", date:"2025-01-16", periodStart:"2024-09-01", periodEnd:"2025-01-16", activeHrs:320,  avgTemp:8.0,  stackTemp:18.0, avgRH:82, voc:10.6, pah:524.9,  charges:55,  p1Charges:32, p2Charges:23,  sameCarbon:true  },
  { period:"P2", date:"2025-03-12", periodStart:"2024-09-01", periodEnd:"2025-03-12", activeHrs:780,  avgTemp:12.0, stackTemp:22.0, avgRH:78, voc:45.0, pah:865.0,  charges:133, p1Charges:78, p2Charges:55,  sameCarbon:true,
    flowAnomalous:true,
    excludeFromFlowCalcs:true,
    anomalyNote:"Stack discharge flow 3,659 m3/hr vs 7,000-12,000 m3/hr all other Config A periods. Config A pulleys confirmed installed at time of test. Envirocare certified measurement stands - raw traverse data not available for review. No operational cause identified. Anomaly formally unresolvable. Excluded from Wheeler-Jonas EBCT, mass flux calculations, and T_operative correction derivation. Retained in VOC and PAH regression with this flag. See Stack Tests tab." },
  { period:"P3", date:"2025-05-20", periodStart:"2024-09-01", periodEnd:"2025-05-20", activeHrs:1100, avgTemp:16.0, stackTemp:26.0, avgRH:74, voc:55.6, pah:2475.0, charges:188, p1Charges:110, p2Charges:78, sameCarbon:true  },
  { period:"P4", date:"2025-07-15", periodStart:"2025-06-01", periodEnd:"2025-07-15", activeHrs:380,  avgTemp:22.5, stackTemp:27.7, avgRH:70, voc:18.2, pah:5369.0, charges:65,  p1Charges:38, p2Charges:27,  sameCarbon:false },
  { period:"P5", date:"2025-11-06", periodStart:"2025-08-01", periodEnd:"2025-11-06", activeHrs:420,  avgTemp:9.5,  stackTemp:19.5, avgRH:80, voc:8.4,  pah:586.0,  charges:72,  p1Charges:42, p2Charges:30,  sameCarbon:false },
  { period:"P6", date:"2025-12-18", periodStart:"2025-08-01", periodEnd:"2025-12-18", activeHrs:890,  avgTemp:10.2, stackTemp:20.0, avgRH:83, voc:28.0, pah:712.0,  charges:152, p1Charges:89, p2Charges:63,  sameCarbon:false },
  { period:"P7", date:"2026-03-14", periodStart:"2026-01-12", periodEnd:"2026-03-14", activeHrs:1387, avgTemp:6.1,  stackTemp:17.5, avgRH:85, voc:5.9,  pah:340.0,  charges:237, p1Charges:138, p2Charges:99, sameCarbon:false },
  { period:"P8", date:"2026-06-04", periodStart:"2026-03-20", periodEnd:"2026-06-04", activeHrs:1495, avgTemp:11.6, stackTemp:23.0, avgRH:78, voc:63.9, pah:null,   charges:241, p1Charges:141, p2Charges:100,sameCarbon:false },
];
const INITIAL_CHARGES = [];

// ============================================================
// PHYSICS ENGINE
// ============================================================

function humidityFactor(rhPct) {
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
function drPolanyi(tempC, inletConc_mgm3) {
  var R = 8.314;
  var T_K = tempC + 273.15;
  var W0 = 0.45;
  var E = 20000;
  // Antoine equation for naphthalene saturation vapour pressure (Pa)
  // Valid range ~80-218 degC; extrapolated at ambient - conservative below boiling point
  // log10(Ps_mmHg) = 8.722 - 3104 / (T_degC + 217.7)  [CRC Handbook]
  var Ps_mmHg = Math.pow(10, 8.722 - 3104 / (tempC + 217.7));
  var Ps_Pa = Ps_mmHg * 133.322;
  // Partial pressure from inlet concentration: P = (C * R * T) / (MW * 1000)
  // C in mg/m3, MW naphthalene 128.17 g/mol
  var C_kgm3 = Math.max(inletConc_mgm3 || 0.1, 0.001) / 1000000;
  var P_Pa = Math.max((C_kgm3 * R * T_K) / (0.12817), 0.001);
  var Ps_safe = Math.max(Ps_Pa, P_Pa + 0.001);
  var A = R * T_K * Math.log(Ps_safe / P_Pa);
  var ratio = A / E;
  var W = W0 * Math.exp(-(ratio * ratio));
  return Math.max(0, W);
}

function wheelerJonasBedLife(opTemp, inletConc_mgm3, settings) {
  const crossSectionM2 = Math.max(0.2, settings.crossSectionM2 || DEFAULT_CROSS_SECTION_M2);
  const flowM3hr = Math.max(1, settings.flowM3hr || FLOW_M3HR);
  const bedMassKg = Math.max(1, settings.bedMass || BED_MASS);
  const bedDepthM = bedMassKg / (GAC_BULK_DENSITY_KGM3 * crossSectionM2);
  const flowM3s = flowM3hr / 3600;
  const inletKgM3 = Math.max(inletConc_mgm3 || 0.1, 0.1) / 1000000;
  const capacityKgKg = Math.max(0.0001, drPolanyi(opTemp, inletConc_mgm3));
  const linearVelocity = flowM3s / crossSectionM2;
  const serviceSeconds = (bedMassKg * capacityKgKg) / Math.max(flowM3s * inletKgM3, 1e-12);
  const mtzSeconds = (GAC_BULK_DENSITY_KGM3 * bedDepthM) / Math.max(linearVelocity * NAPHTHALENE_MW, 1e-9);
  return Math.max(0, Math.round((serviceSeconds - mtzSeconds) / 3600));
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

// VOC calibration: ln(VOC) = a*ln(rawHrs) + b*ambientTemp + c + humidityPenalty.
// Uses independent carbon charge periods only. P1-P3 are same-carbon cumulative
// observations and are shown for transparency, not fitted as independent points.
function calibrateVOC(stackData) {
  const v = stackData.filter(d => d.voc != null && d.activeHrs > 0 && d.sameCarbon !== true);
  if (v.length < 3) return { a: D_VOC_A, b: D_VOC_B, c: D_VOC_C, r2: null, r2_loo: null, n_folds: 0, rmse: VOC_RMSE_LOG, n: v.length };
  const effectiveHours = v.map(d=>calcEffectiveHours(d.activeHrs, d.periodStart, d.periodEnd));
  const fit = ridgeRegression(effectiveHours.map(h=>Math.log(h)), v.map(d=>d.avgTemp), v.map(d=>d.voc), 0.1);
  if (!fit) return { a: D_VOC_A, b: D_VOC_B, c: D_VOC_C, r2: null, r2_loo: null, n_folds: 0, rmse: VOC_RMSE_LOG, n: v.length };
  const resids = v.map(d => {
    const hf = humidityFactor(d.avgRH), hp = (1-hf)*0.6;
    const effectiveHrs = calcEffectiveHours(d.activeHrs, d.periodStart, d.periodEnd);
    return (fit.a*Math.log(effectiveHrs) + fit.b*d.avgTemp + fit.c + hp) - Math.log(d.voc);
  });
  const rmse = Math.sqrt(resids.reduce((a,e)=>a+e*e,0)/resids.length);
  const looResult = looCV(effectiveHours.map(h=>Math.log(Math.max(h, 1))), v.map(d=>d.avgTemp), v.map(d=>d.voc), 0.1);
  return { a: fit.a, b: fit.b, c: fit.c, r2: fit.r2, r2_loo: looResult ? looResult.r2_loo : null, n_folds: looResult ? looResult.n_folds : 0, rmse, n: v.length };
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
    return { a: D_PAH_A, b: D_PAH_B, c: D_PAH_C, r2: null, rmse: PAH_RMSE_LOG, n: v.length, freshOnly: fresh.length >= 3 };
  }
  // x1 = stackTemp (dominant), x2 = ln(activeHrs)
  const fit = ridgeRegression(v.map(d=>d.stackTemp), v.map(d=>Math.log(calcEffectiveHours(d.activeHrs, d.periodStart, d.periodEnd))), v.map(d=>d.pah), 0.1);
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
    return { a:b, b:0, c, r2:Math.max(0,1-ssr/Math.max(sst,1e-9)), rmse, n:v.length, freshOnly: fresh.length>=3, tempOnly:true };
  }
  const ssr=v.reduce((s,d,i)=>{
    const yhat=fit.a*d.stackTemp+fit.b*Math.log(calcEffectiveHours(d.activeHrs, d.periodStart, d.periodEnd))+fit.c;
    return s+(yhat-Math.log(d.pah))*(yhat-Math.log(d.pah));
  },0);
  const rmse=Math.sqrt(ssr/v.length);
  return { a: fit.a, b: fit.b, c: fit.c, r2: fit.r2, rmse, n: v.length, freshOnly: fresh.length>=3 };
}

// predictVOC: uses raw active hours (consistent with calibration at nf=0.53 baseline).
// WJ fraction does NOT scale the hours input here - it scales the safeWindowHours output.
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

// Rolling charge rate from last N days of log
function rollingChargeRate(chargeLog, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const recent = chargeLog.filter(c => new Date(c.date) >= cutoff);
  const totalCharges = recent.reduce((s,c)=>s+(c.count||1),0);
  return totalCharges / Math.max(days, 1);
}

const BOSTON_MONTHLY_TEMPS = [
  4.2, 4.5, 6.8, 9.3, 12.6, 15.4, 17.6, 17.3, 14.8, 11.2, 7.4, 4.8
];

function isoDateFromDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(startDate, endDate) {
  return Math.max(0, Math.floor((new Date(endDate) - new Date(startDate)) / 86400000));
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
    const vocMid = Math.round(predictVOC(cumulativeHrs, tOperative, forecastRH, vocC) * 10) / 10;
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

function MissingPAHBanner({ period, dismissed, onDismiss }) {
  if (!period || dismissed) return null;
  return (
    <div style={{ marginBottom:16, padding:"12px 14px", border:`2px solid ${C.red}`, borderRadius:8, background:TINT.redBg, color:TINT.redText, display:"flex", gap:12, alignItems:"flex-start", justifyContent:"space-between" }}>
      <div style={{ fontSize:12, lineHeight:1.5, fontWeight:700 }}>
        PAH RESULT OUTSTANDING: {period.period} PAH certified result not yet received. PAH model is not calibrated on the current carbon charge. PAH risk predictions are based on prior periods only. Obtain and enter the certified PAH result immediately.
      </div>
      <button onClick={onDismiss} aria-label="Dismiss PAH outstanding warning" style={{ border:"none", background:"transparent", color:C.red, fontWeight:900, cursor:"pointer", fontSize:18, lineHeight:1 }}>x</button>
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
      borderRadius:3,
      padding:"16px 20px",
      marginBottom:14,
      boxShadow:"0 1px 4px rgba(28,38,54,0.06)",
      ...style
    }}>
      {children}
    </div>
  );
}
function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontSize:9,
      fontWeight:700,
      letterSpacing:"0.18em",
      textTransform:"uppercase",
      color:C.muted,
      marginBottom:12,
      marginTop:0,
      borderBottom:`1px solid ${C.border}`,
      paddingBottom:6,
    }}>
      {children}
    </h3>
  );
}
function StatPill({ label, value, unit, color, sub }) {
  const stroke = color || C.borderGreen;
  const tint = stroke === C.red ? TINT.redBg : stroke === C.amber ? TINT.amberBg : stroke === C.blue ? TINT.blueBg : stroke === C.teal || stroke === C.rund ? TINT.safeBg : C.surface2;
  const textOnFill = stroke === C.red ? TINT.redText : stroke === C.amber ? TINT.amberText : stroke === C.blue ? TINT.blueText : stroke === C.teal || stroke === C.rund ? TINT.safeText : C.muted;
  return (
    <div style={{ background:tint, border:`1px solid ${C.border}`, borderLeft:`3px solid ${stroke}`, borderRadius:2, padding:"12px 16px", flex:1, minWidth:130 }}>
      <div style={{ fontSize:9, color:textOnFill, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:"clamp(1.3rem, 3vw, 2rem)", fontWeight:700, color:stroke || C.mono, fontFamily:MONO, lineHeight:1 }}>
        {value}<span style={{ fontSize:11, color:textOnFill, marginLeft:3 }}>{unit}</span>
      </div>
      {sub && <div style={{ fontSize:10, color:textOnFill, marginTop:4 }}>{sub}</div>}
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
      {sub && <div style={{ fontSize:10, color:C.muted, marginTop:3, lineHeight:1.3 }}>{sub}</div>}
    </div>
  );
}
function Badge({ text, color }) {
  return <span style={{ display:"inline-block", background:"transparent", color, border:`1px solid ${color}`, borderRadius:2, fontSize:9, fontWeight:700, letterSpacing:"0.1em", padding:"2px 7px", textTransform:"uppercase", fontFamily:MONO }}>{text}</span>;
}
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:"flex", gap:2, background:C.surface2, border:`1px solid ${C.border}`, borderBottom:`2px solid ${C.border}`, borderRadius:2, padding:3, marginBottom:20, flexWrap:"wrap" }}>
      {tabs.map(t=>(
        <button key={t.id} onClick={()=>onChange(t.id)} style={{
          flex:"1 1 auto", padding:"9px 14px", borderRadius:0, border:"none", borderTop:active===t.id?`2px solid ${C.rund}`:"2px solid transparent", cursor:"pointer",
          fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", transition:"all 0.18s", whiteSpace:"nowrap",
          background: active===t.id ? C.surface : "transparent", color: active===t.id ? C.ink : C.muted,
        }}>{t.label}</button>
      ))}
    </div>
  );
}
function Input({ label, value, onChange, type="text", step, min, max, placeholder, style={} }) {
  return (
    <div style={{ marginBottom:14, ...style }}>
      {label && <label style={{ display:"block", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5, lineHeight:1.2 }}>{label}</label>}
      <input type={type} value={value} step={step} min={min} max={max} placeholder={placeholder}
        onChange={e=>onChange(type==="number" ? parseFloat(e.target.value) : e.target.value)}
        style={{ width:"100%", height:36, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:2, fontSize:13, color:C.ink, background:C.surface2, fontFamily:type==="number"?MONO:"inherit", boxSizing:"border-box", outline:`1px solid ${C.borderBright}` }} />
    </div>
  );
}
function Btn({ children, onClick, variant="primary", small, style={} }) {
  const base={ padding:small?"7px 14px":"10px 20px", borderRadius:2, border:`1px solid ${C.borderBright}`, background:C.surface2, cursor:"pointer", fontSize:small?10:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:C.ink, ...style };
  const v={ primary:{borderLeft:`3px solid ${C.rund}`}, rund:{borderLeft:`3px solid ${C.rund}`,color:C.rund}, gold:{borderLeft:`3px solid ${C.gold}`,color:C.gold}, ghost:{borderLeft:`3px solid ${C.border}`,color:C.muted}, danger:{borderLeft:`3px solid ${C.red}`,color:C.red} };
  return <button onClick={onClick} style={{...base,...v[variant]}}>{children}</button>;
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
      <div className="schematic-scroll-hint" style={{ fontSize:10, color:C.muted, textAlign:"right", marginTop:3 }}>Scroll right to see full process view</div>
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

function ModelStatusBanner({ vocC, pahC, settings }) {
  const vOk = vocC.n >= 3, pOk = pahC.n >= 3;
  const stackTempCorrection = settings && settings.stackTempCorrectionC != null ? settings.stackTempCorrectionC : 8;
  const looLabel = vocC.r2_loo != null ? vocC.r2_loo.toFixed(3) : "insufficient data (need 4+ periods)";
  const residualRows = INITIAL_STACK_DATA.filter(d=>d.voc != null && d.activeHrs > 0).map(d=>{
    const effectiveHrs = calcEffectiveHours(d.activeHrs, d.periodStart, d.periodEnd);
    const pred = predictVOC(effectiveHrs, operativeTemp(d.avgTemp, stackTempCorrection), d.avgRH, vocC);
    return { period:d.period, actual:d.voc, pred, err: Math.round(((d.voc - pred) / Math.max(pred, 0.1)) * 100) };
  });
  const p4Err = residualRows.find(r=>r.period==="P4");
  const p7Err = residualRows.find(r=>r.period==="P7");
  return (
    <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:200, background:vOk?TINT.safeBg:TINT.amberBg, border:`1px solid ${vOk?C.teal:C.amber}`, borderRadius:8, padding:"10px 14px" }}>
        <div style={{ fontSize:10, fontWeight:700, color:vOk?C.teal:C.amber, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>VOC Model</div>
        <div style={{ fontSize:12, color:C.ink }}>{vOk ? `n=${vocC.n} | In-sample R2: ${vocC.r2.toFixed(3)} | LOO CV R2: ${looLabel}` : `Defaults (n=${vocC.n} - need 3+)`}</div>
        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>a={vocC.a.toFixed(3)} b={vocC.b.toFixed(3)} c={vocC.c.toFixed(3)} | Uncertainty band: x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)}</div>
        <div style={{ fontSize:10, color:TINT.amberText, marginTop:6, padding:"7px 9px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:6, lineHeight:1.45 }}>
          LOO CV R2 is the leave-one-out cross-validated coefficient of determination. It estimates how well the model predicts periods it was NOT trained on. For compliance scheduling, LOO CV R2 is the more conservative and EA-defensible reliability metric. In-sample R2 is shown for calibration audit trail only. {vocC.r2_loo == null ? "LOO CV requires a minimum of 4 independent calibration periods." : ""}
        </div>
        <div style={{ fontSize:10, color:C.amber, marginTop:2 }}>Calibration dataset: independent carbon charge periods only (sameCarbon=false). P1-P3 excluded (same-carbon cumulative observations, not independent data points). n={vocC.n}.</div>
        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>P2 retained for anomaly display but excluded by sameCarbon filter. Prediction uncertainty x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} (effective RMSE band in log space).</div>
        {p4Err && p7Err && (
          <div style={{ fontSize:10, color:TINT.amberText, marginTop:6, padding:"7px 9px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:6, lineHeight:1.45 }}>
            Largest calibration residuals: P4 actual {p4Err.actual}, predicted {p4Err.pred.toFixed(1)} ({p4Err.err>0?"+":""}{p4Err.err}%); P7 actual {p7Err.actual}, predicted {p7Err.pred.toFixed(1)} ({p7Err.err>0?"+":""}{p7Err.err}%). P7 over-prediction by {Math.abs(p7Err.err)}% means the model would recommend a changeout significantly earlier than necessary under cold winter conditions. P4 under-prediction means the model may not flag temperature-driven risk adequately in high summer. Treat scheduling outputs with corresponding caution.
          </div>
        )}
      </div>
      <div style={{ flex:1, minWidth:200, background:pOk?TINT.safeBg:TINT.amberBg, border:`1px solid ${pOk?C.teal:C.amber}`, borderRadius:8, padding:"10px 14px" }}>
        <div style={{ fontSize:10, fontWeight:700, color:pOk?C.teal:C.amber, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:3 }}>PAH Model</div>
        <div style={{ fontSize:12, color:C.ink }}>{pOk ? `Live calibrated (n=${pahC.n}, R2=${pahC.r2.toFixed(3)})` : `Defaults (n=${pahC.n} - need 3+)`}</div>
        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Bivariate: temp + age. Breach stack temp at 500hrs: {pahFailTemp(500, pahC).toFixed(1)}C (~{(pahFailTemp(500,pahC)-10).toFixed(1)}C ambient)</div>
        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
          Calibration: independent fresh-carbon periods only (sameCarbon=false). P2 excluded for calibration symmetry with VOC model. P2 certified result retained in display table only. n={pahC.n} independent periods.
        </div>
        <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>Flow measurements: Envirocare stack discharge (post-demister, post-carbon bed), used as conservative proxy for bed inlet flow.</div>
      </div>
    </div>
  );
}

// ============================================================
// DASHBOARD TAB
// ============================================================
function DashboardTab({ stackData, settings, weather, chargeLog, fanHrs, lastChangeout, downtimeHrs, onDowntime, onFanHrs, vocC, pahC }) {
  const [dismissPahWarning, setDismissPahWarning] = useState(false);
  const [showWeighting, setShowWeighting] = useState(false);
  const logChargeHrs = useMemo(()=>calcActiveHrsFromLog(chargeLog),[chargeLog]);
  const now = new Date(), changeoutDate = new Date(lastChangeout);
  const daysSince = Math.max(0, Math.floor((now-changeoutDate)/86400000));
  const fallbackHrs = Math.max(0, Math.round(daysSince*24*settings.utilisationRate - downtimeHrs));
  // Active hours: charge log primary, fallback on days*util
  const chargeActiveHrs = chargeLog.length > 0 ? Math.max(logChargeHrs - downtimeHrs, 0) : fallbackHrs;
  // Fan hours: bed exposure time even between charges (24/7 minus downtime)
  const fanActiveHrs = fanHrs > 0 ? fanHrs - downtimeHrs : daysSince*24 - downtimeHrs;
  // Prediction uses charge hours (loading proxy) but fan hours shown for reference
  const activeHrs = chargeActiveHrs;

  const ambientTemp = weather ? weather.temperature_2m : settings.typicalTempC;
  const rawRh       = weather ? weather.relative_humidity_2m : settings.typicalRH;
  const rh          = settings.useConservativeRH ? 90 : rawRh;
  const stackTempCorrection = settings.stackTempCorrectionC ?? 8;
  const opTemp = operativeTemp(ambientTemp, stackTempCorrection);
  const opNote = operativeTempNote(ambientTemp, stackTempCorrection);
  // Stack temp estimate via linear regression on P1-P8 MCERTS data (R2=0.92)
  const estStackTemp = estimateStackTemp(ambientTemp);
  const hf = humidityFactor(rh);
  const nf = settings.naphthaleneFrac;

  const predVOCBand = predictVOCBand(activeHrs, opTemp, rh, vocC);
  const predPAH     = predictPAH(estStackTemp, activeHrs, pahC);
  const pahThresh   = pahFailTemp(activeHrs, pahC);
  const pahBreaching = estStackTemp >= pahThresh;
  const vRisk = vocRiskScore(activeHrs, opTemp, rh, vocC);
  const pRisk = pahRiskScore(estStackTemp, activeHrs, pahC);
  const vocRiskWeight = settings.vocRiskWeight != null ? settings.vocRiskWeight : 0.55;
  const pahRiskWeight = 1 - vocRiskWeight;
  const combined = Math.round(vRisk*vocRiskWeight + pRisk*pahRiskWeight);
  const wjBedLife = wheelerJonasBedLife(opTemp, predVOCBand.mid, settings);
  const missingPah = getMostRecentPeriodWithMissingPAH(stackData);

  const vocWindow   = safeWindowHoursVOC(opTemp, rh, vocC, nf);
  const remainHrs   = Math.max(0, vocWindow - activeHrs);
  const remainDays  = Math.round(remainHrs / (24*settings.utilisationRate));

  // Cycles remaining: remaining hrs / avg hrs per charge from rolling rate
  const plant1Count = chargeLog.filter(c=>normalizeChargeType(c.type)==="plant1").reduce((a,c)=>a+(c.count||1),0);
  const plant2Count = chargeLog.filter(c=>normalizeChargeType(c.type)==="plant2").reduce((a,c)=>a+(c.count||1),0);
  const totalCharges = plant1Count + plant2Count;
  const avgHrsPerCharge = totalCharges > 0
    ? logChargeHrs / totalCharges
    : (P1_AVG_HRS + P2_AVG_HRS) / 2;
  const chargesRemaining = remainHrs > 0 && avgHrsPerCharge > 0
    ? Math.floor(remainHrs / avgHrsPerCharge)
    : 0;
  const chargeRatePer28d = rollingChargeRate(chargeLog, 28);

  // VOC forecast with uncertainty band
  const maxHrs = Math.max(vocWindow*1.3, activeHrs+300);
  const step = Math.max(20, Math.round(maxHrs/50));
  const forecastVOC = [];
  for(let h=0; h<=maxHrs; h+=step) {
    const band = predictVOCBand(h, opTemp, rh, vocC);
    forecastVOC.push({ hrs:h, mid:band.mid, lo:band.lo, hi:band.hi, elv:VOC_ELV });
  }

  return (
    <div>
      <MissingPAHBanner period={missingPah} dismissed={dismissPahWarning} onDismiss={()=>setDismissPahWarning(true)} />
      <ModelStatusBanner vocC={vocC} pahC={pahC} settings={settings} />

      <Card style={{ borderLeft:`4px solid ${riskBand(combined).color}` }}>
        <SectionTitle>Carbon Bed Status</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Charge Active Hrs" value={activeHrs.toLocaleString()} unit="hrs"
            color={activeHrs>vocWindow?C.red:activeHrs>vocWindow*0.8?C.amber:C.teal}
            sub={chargeLog.length>0 ? `${totalCharges} charges logged` : `${daysSince}d x ${(settings.utilisationRate*100).toFixed(0)}% util`} />
          <StatPill label="Fan Running Hrs" value={Math.round(fanActiveHrs).toLocaleString()} unit="hrs"
            color={C.blue} sub="Bed exposure (24/7 minus downtime)" />
          <StatPill label="VOC Predicted" value={predVOCBand.mid} unit="mg/m3"
            color={predVOCBand.hi>VOC_ELV?C.red:predVOCBand.mid>VOC_ELV*0.7?C.amber:C.teal}
            sub={`Range: ${predVOCBand.lo}-${predVOCBand.hi} | ELV ${VOC_ELV}`} />
          <StatPill label="PAH Predicted" value={predPAH.toLocaleString()} unit="ug/m3"
            color={pahBreaching?C.red:predPAH>PAH_ELV*0.7?C.amber:C.teal}
            sub={`Stack est. ${estStackTemp.toFixed(1)}C | ELV ${PAH_ELV}`} />
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>{opNote}</div>
      </Card>

      <Card>
        <SectionTitle>Remaining Life to Failure</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="VOC Safe Window" value={vocWindow.toLocaleString()} unit="hrs"
            color={C.blue} sub={`At T_op ${opTemp.toFixed(1)}C, RH${rh.toFixed(0)}%, nf=${(nf*100).toFixed(0)}%`} />
          <StatPill label="Hours Remaining" value={remainHrs.toLocaleString()} unit="hrs"
            color={remainHrs<200?C.red:remainHrs<500?C.amber:C.teal}
            sub={`~${remainDays} days at ${(settings.utilisationRate*100).toFixed(0)}% util`} />
          <StatPill label="Charges Remaining" value={chargesRemaining.toLocaleString()} unit=""
            color={chargesRemaining<20?C.red:chargesRemaining<50?C.amber:C.teal}
            sub={`Avg ${avgHrsPerCharge.toFixed(2)} hrs/charge`} />
          <StatPill label="PAH Status" value={pahBreaching?"BREACHING":"OK"} unit=""
            color={pahBreaching?C.red:C.teal}
            sub={`Threshold: ${pahThresh.toFixed(1)}C stack`} />
        </div>
        {pahBreaching && (
          <div style={{ marginTop:12, padding:"10px 14px", background:TINT.redBg, border:`1px solid ${C.red}`, borderRadius:7, fontSize:12, color:TINT.redText, fontWeight:600 }}>
            WARNING: Estimated stack temperature ({estStackTemp.toFixed(1)}C) exceeds PAH ELV threshold ({pahThresh.toFixed(1)}C). PAH exceedance likely regardless of carbon age. Consider immediate changeout and temperature monitoring.
          </div>
        )}
        {chargeRatePer28d > 0 && (
          <div style={{ marginTop:10, fontSize:12, color:C.muted }}>
            Rolling charge rate (28d): {chargeRatePer28d.toFixed(1)} charges/day | At this rate, {chargesRemaining} remaining charges = ~{chargesRemaining>0?(chargesRemaining/chargeRatePer28d).toFixed(0):0} days to failure
          </div>
        )}
        <div style={{
          marginTop:10,
          padding:"9px 13px",
          background:C.surface2,
          border:`1px solid ${C.border}`,
          borderRadius:7,
          fontSize:11,
          color:C.muted,
          lineHeight:1.6
        }}>
          <strong style={{ color:C.ink }}>Compliance scheduling uses the VOC Safe Window figure only.</strong>
          {" "}The Wheeler-Jonas theoretical maximum is a steady-state upper bound derived from adsorption theory (Dubinin-Radushkevich/Polanyi). It has no calibrated relationship to any observed breakthrough event in the P1-P8 dataset and consistently exceeds the regression-derived safe window by a large margin. It is shown for engineering reference only and must not be used as the basis for carbon changeout scheduling or stack test deferral decisions.
        </div>
        <div style={{ marginTop:10, padding:"10px 14px", background:C.surface2, border:`1px solid ${C.border}`, borderRadius:7, fontSize:11, color:C.muted, lineHeight:1.6 }}>
          Wheeler-Jonas theoretical maximum (engineering reference only): {wjBedLife.toLocaleString()} hrs - not a compliance limit. This figure has no calibrated relationship to any P1-P8 breakthrough observation and consistently exceeds the regression-derived safe window. It must not be used as the basis for carbon changeout scheduling or stack test deferral.
        </div>
      </Card>

      <Card>
        <SectionTitle>Risk Assessment</SectionTitle>
        <div style={{ display:"flex", justifyContent:"space-around", alignItems:"flex-start", flexWrap:"wrap", gap:14 }}>
          <RiskGauge score={vRisk} label="VOC Risk" sub={`${predVOCBand.mid} mg/m3 (x${Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(1)} uncertainty)`} />
          <RiskGauge score={pRisk} label="PAH Risk" sub={`${predPAH.toLocaleString()} ug/m3 predicted`} />
          <RiskGauge score={combined} label="Combined" sub={`${Math.round(vocRiskWeight*100)}% VOC + ${Math.round(pahRiskWeight*100)}% PAH weighting`} />
        </div>
        <div style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:8 }}>
          {opNote} | Humidity factor: {hf.toFixed(3)} (RH {rh.toFixed(0)}%) | WJ nf: {(nf*100).toFixed(0)}% | DR/Polanyi ref capacity (theoretical): {(drPolanyi(opTemp,predVOCBand.mid)*1000).toFixed(1)} g/kg <span style={{ color:C.muted, fontSize:10 }}>[Not integrated into VOC regression pathway - engineering reference only]</span>
        </div>
        <div style={{ textAlign:"center", marginTop:8 }}>
          <button onClick={()=>setShowWeighting(v=>!v)} style={{ border:`1px solid ${C.border}`, background:C.surface2, color:C.blue, borderRadius:20, width:24, height:24, cursor:"pointer", fontWeight:800 }}>?</button>
        </div>
        {showWeighting && (
          <div style={{ fontSize:11, color:C.muted, marginTop:8, lineHeight:1.5 }}>
            VOC currently weighted at {Math.round(vocRiskWeight*100)}% and PAH at {Math.round(pahRiskWeight*100)}%. This reflects operational priority: VOC is the current binding constraint (P8 exceedance 3.2x ELV; P3 and P6 also exceeded). PAH has been within ELV in all winter/spring periods. Weighting is configurable in Settings.
          </div>
        )}
        <div style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:8 }}>
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
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
            <XAxis dataKey="hrs" label={{ value:"Cumulative Active Hours", position:"insideBottom", offset:-8, fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <YAxis label={{ value:"VOC mg/m3", angle:-90, position:"insideLeft", fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
            <ReferenceLine y={VOC_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"ELV 20", fill:C.red, fontSize:10 }} />
            <ReferenceLine x={activeHrs} stroke={C.gold} strokeDasharray="4 2" label={{ value:"Now", fill:C.gold, fontSize:10, position:"insideTopRight" }} />
            <Area type="monotone" dataKey="hi" stroke={C.amber} strokeWidth={1} strokeDasharray="4 2" fill={C.amber} fillOpacity={0.15} dot={false} name="Upper (x1SD)" />
            <Area type="monotone" dataKey="lo" stroke={C.blue} strokeWidth={1} strokeDasharray="4 2" fill="#ffffff" fillOpacity={0.9} dot={false} name="Lower (x1SD)" />
            <Line type="monotone" dataKey="mid" stroke={C.rund} strokeWidth={2.5} dot={false} name="Predicted VOC" />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
          Shaded band = x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} uncertainty (effective RMSE in log space). R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"}. WJ nf={((nf||0.53)*100).toFixed(0)}% scales safe window (not prediction input). {opNote}.
        </div>
      </Card>

      <Card>
        <SectionTitle>Downtime and Fan Hours</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Logged Downtime This Period (hrs)" type="number" min={0}
            value={downtimeHrs} onChange={onDowntime} style={{ flex:1, minWidth:180, marginBottom:0 }} />
          <Input label="Fan Running Hours This Period (hrs)" type="number" min={0}
            value={fanHrs} onChange={onFanHrs}
            placeholder={String(Math.round(daysSince*24))}
            style={{ flex:1, minWidth:180, marginBottom:0 }} />
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
          Fan hours = extraction system running time since changeout (24/7 minus shutdowns). Separate from charge hours - the bed adsorbs between charges too. Leave fan hours at 0 to auto-calculate from days since changeout.
        </div>
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
    ready.push({ id:Date.now()+Math.floor(Math.random()*10000)+lineNo, date, type, count, durationHrs:Number.isFinite(durationHrs)?durationHrs:null, notes:notesIdx >= 0 ? cols[notesIdx] || "" : "", source:"csv" });
  });
  return { ready, errors };
}

function ChargeCyclesTab({ chargeLog, onAddCharge, onDeleteCharge, lastChangeout, settings, vocC }) {
  const [form, setForm] = useState({ date:new Date().toISOString().slice(0,10), type:"plant1", count:1, durationHrs:"", notes:"" });
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvStatus, setCsvStatus] = useState("");

  const plant1Count = chargeLog.filter(c=>normalizeChargeType(c.type)==="plant1").reduce((a,c)=>a+(c.count||1),0);
  const plant2Count = chargeLog.filter(c=>normalizeChargeType(c.type)==="plant2").reduce((a,c)=>a+(c.count||1),0);
  const plant1Hrs   = chargeLog.filter(c=>normalizeChargeType(c.type)==="plant1").reduce((a,c)=>a+(c.durationHrs||P1_AVG_HRS)*(c.count||1),0);
  const plant2Hrs   = chargeLog.filter(c=>normalizeChargeType(c.type)==="plant2").reduce((a,c)=>a+(c.durationHrs||P2_AVG_HRS)*(c.count||1),0);
  const totalActiveHrs = Math.round((plant1Hrs+plant2Hrs)*10)/10;
  const stackTempCorrection = settings.stackTempCorrectionC ?? 8;
  const typicalOpTemp = operativeTemp(settings.typicalTempC, stackTempCorrection);
  const vocWindow = safeWindowHoursVOC(typicalOpTemp, settings.typicalRH, vocC, settings.naphthaleneFrac);
  const remainHrs = Math.max(0, vocWindow - totalActiveHrs);
  const avgHrsPerCharge = (plant1Count+plant2Count) > 0 ? totalActiveHrs/(plant1Count+plant2Count) : (P1_AVG_HRS+P2_AVG_HRS)/2;
  const chargesRemaining = avgHrsPerCharge > 0 ? Math.max(0, Math.floor(remainHrs/avgHrsPerCharge)) : 0;

  const cumulChart = useMemo(()=>{
    const sorted = [...chargeLog].sort((a,b)=>a.date.localeCompare(b.date));
    let cum=0;
    const cMs = new Date(lastChangeout).getTime();
    return sorted.map(c=>{
      const plantType = normalizeChargeType(c.type);
      const hrs=(c.durationHrs||(plantType==="plant1"?P1_AVG_HRS:P2_AVG_HRS))*(c.count||1);
      cum+=hrs;
      return { day:Math.floor((new Date(c.date).getTime()-cMs)/86400000), cumHrs:Math.round(cum*10)/10 };
    });
  },[chargeLog,lastChangeout]);

  const weeklyData = useMemo(()=>{
    const byWeek={};
    chargeLog.forEach(c=>{
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
  },[chargeLog]);

  const handleAdd = ()=>{
    if(!form.date) return;
    onAddCharge({ id:Date.now(), date:form.date, type:form.type, count:parseInt(form.count)||1, durationHrs:form.durationHrs!==""?parseFloat(form.durationHrs):null, notes:form.notes });
    setForm(f=>({...f, count:1, durationHrs:"", notes:""}));
  };

  const handleCsvFile = file => {
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
          Override per entry if actual duration is available. {operativeTempNote(settings.typicalTempC, stackTempCorrection)}.
        </div>
      </Card>

      {cumulChart.length > 1 && (
        <Card>
          <SectionTitle>Cumulative Active Hours</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cumulChart} margin={{ top:5, right:20, bottom:18, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
              <XAxis dataKey="day" label={{ value:"Days since changeout", position:"insideBottom", offset:-8, fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
              <YAxis label={{ value:"Cumul. hrs", angle:-90, position:"insideLeft", fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
              <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
              <ReferenceLine y={vocWindow} stroke={C.red} strokeDasharray="5 3" label={{ value:"VOC window", fill:C.red, fontSize:10 }} />
              <Area type="monotone" dataKey="cumHrs" fill={C.rund+"25"} stroke={C.rund} strokeWidth={2} name="Cumulative Active Hrs" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {weeklyData.length > 0 && (
        <Card>
          <SectionTitle>Weekly Charge Activity</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={weeklyData} margin={{ top:5, right:20, bottom:18, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
              <XAxis dataKey="week" tick={{ fontSize:9, fill:C.ink }} />
              <YAxis yAxisId="c" tick={{ fontSize:10, fill:C.ink }} />
              <YAxis yAxisId="h" orientation="right" tick={{ fontSize:10, fill:C.ink }} />
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
          <input id="chargeCsvFile" type="file" accept=".csv,text/csv" style={{ display:"none" }} onChange={e=>handleCsvFile(e.target.files[0])} />
          <label htmlFor="chargeCsvFile" style={{ cursor:"pointer", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${C.rund}`, color:C.rund, fontWeight:700, fontSize:12 }}>Browse CSV</label>
          <button onClick={downloadCsvTemplate} style={{ marginLeft:10, border:"none", background:"transparent", color:C.blue, cursor:"pointer", fontSize:12, fontWeight:700 }}>Download template CSV</button>
        </div>
        {csvStatus && <div style={{ marginTop:10, fontSize:12, color:C.blue, fontWeight:700 }}>{csvStatus}</div>}
        {csvPreview && (
          <div style={{ marginTop:12 }}>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
                <thead><tr>{["Date","Plant","Count","Hrs/charge","Total hrs"].map(h=><th key={h} style={{ textAlign:"left", padding:"5px 7px", color:C.muted }}>{h}</th>)}</tr></thead>
                <tbody>{csvPreview.ready.slice(0,10).map(r=>{
                  const avg = r.type==="plant1"?P1_AVG_HRS:P2_AVG_HRS;
                  const dur = r.durationHrs || avg;
                  return <tr key={r.id} style={{ borderTop:`1px solid ${C.border}` }}><td style={{ padding:"5px 7px" }}>{r.date}</td><td style={{ padding:"5px 7px" }}>{r.type}</td><td style={{ padding:"5px 7px" }}>{r.count}</td><td style={{ padding:"5px 7px" }}>{dur.toFixed(2)}</td><td style={{ padding:"5px 7px" }}>{(dur*r.count).toFixed(2)}</td></tr>;
                })}</tbody>
              </table>
            </div>
            {csvPreview.errors.length > 0 && <div style={{ marginTop:8, fontSize:11, color:C.red }}>{csvPreview.errors.join(" | ")}</div>}
            <div style={{ marginTop:10, display:"flex", gap:8 }}>
              <Btn onClick={()=>{csvPreview.ready.forEach(onAddCharge); const p1=csvPreview.ready.filter(r=>r.type==="plant1").reduce((s,r)=>s+r.count,0); const p2=csvPreview.ready.filter(r=>r.type==="plant2").reduce((s,r)=>s+r.count,0); const th=csvPreview.ready.reduce((s,r)=>s+(r.durationHrs||(r.type==="plant1"?P1_AVG_HRS:P2_AVG_HRS))*r.count,0); setCsvStatus(`Imported ${csvPreview.ready.length} charges (${p1} Plant 1, ${p2} Plant 2, ${th.toFixed(1)} active hrs)`); setCsvPreview(null);}} variant="rund">Import All</Btn>
              <Btn onClick={()=>setCsvPreview(null)} variant="ghost">Cancel</Btn>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle>Log Charges</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"minmax(150px,0.9fr) minmax(180px,1.2fr) minmax(120px,0.7fr) minmax(150px,0.9fr) minmax(190px,1.3fr)", gap:12, alignItems:"end" }}>
          <Input label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} style={{ marginBottom:0 }} />
          <div style={{ marginBottom:0 }}>
            <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5, lineHeight:1.2 }}>Plant / Type</label>
            <select value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}
              style={{ width:"100%", height:38, padding:"8px 12px", border:`1px solid ${C.border}`, borderRadius:7, fontSize:13, background:C.surface2, color:C.ink, boxSizing:"border-box" }}>
              <option value="plant1">Plant 1</option>
              <option value="plant2">Plant 2</option>
            </select>
          </div>
          <Input label="No. Charges" type="number" min={1} step={1} value={form.count} onChange={v=>setForm(f=>({...f,count:v}))} style={{ marginBottom:0 }} />
          <Input label="Duration hrs" type="number" step={0.25} value={form.durationHrs} onChange={v=>setForm(f=>({...f,durationHrs:v}))} style={{ marginBottom:0 }} />
          <Input label="Notes" value={form.notes} onChange={v=>setForm(f=>({...f,notes:v}))} style={{ marginBottom:0 }} />
        </div>
        <div style={{ marginTop:10 }}>
          <Btn onClick={handleAdd} variant="rund">Log Charge(s)</Btn>
          <span style={{ fontSize:11, color:C.muted, marginLeft:14 }}>No duration = plant average ({form.type==="plant1"?P1_AVG_HRS:P2_AVG_HRS} hrs/charge)</span>
        </div>
      </Card>

      {chargeLog.length > 0 && (
        <Card>
          <SectionTitle>Charge Log ({chargeLog.length} entries)</SectionTitle>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                  {["Date","Plant","Charges","Hrs/charge","Total hrs","Notes",""].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"7px 10px", fontSize:10, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...chargeLog].reverse().map((row,i)=>{
                  const plantType = normalizeChargeType(row.type);
                  const avg=plantType==="plant1"?P1_AVG_HRS:P2_AVG_HRS;
                  const dur=row.durationHrs||avg;
                  return (
                    <tr key={row.id} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.ivory:C.surface }}>
                      <td style={{ padding:"7px 10px", fontFamily:MONO }}>{row.date}</td>
                      <td style={{ padding:"7px 10px" }}><Badge text={plantType==="plant1"?"Plant 1":"Plant 2"} color={plantType==="plant1"?C.rund:C.blue} /></td>
                      <td style={{ padding:"7px 10px", fontFamily:MONO, textAlign:"center" }}>{row.count||1}</td>
                      <td style={{ padding:"7px 10px", fontFamily:MONO }}>{row.durationHrs?row.durationHrs.toFixed(2):`~${avg} (avg)`}</td>
                      <td style={{ padding:"7px 10px", fontFamily:MONO, fontWeight:600 }}>{(dur*(row.count||1)).toFixed(2)}</td>
                      <td style={{ padding:"7px 10px", color:C.muted, fontSize:11 }}>{row.notes||""}</td>
                      <td style={{ padding:"7px 10px" }}>
                        <button onClick={()=>onDeleteCharge(row.id)} style={{ background:"none", border:"none", cursor:"pointer", color:C.red, fontWeight:700, fontSize:13 }}>x</button>
                      </td>
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
function StackTestsTab({ stackData, onAdd, settings, vocC, pahC }) {
  const [form, setForm] = useState({ period:"", date:"", activeHrs:"", avgTemp:"", stackTemp:"", avgRH:"", voc:"", pah:"", charges:"", p1Charges:"", p2Charges:"", flowRate_m3hr:"" });
  const [pdfStatus, setPdfStatus] = useState("");
  const [pdfImporting, setPdfImporting] = useState(false);
  const [pdfDragOver, setPdfDragOver] = useState(false);
  const [openAnomaly, setOpenAnomaly] = useState(null);
  const [dismissPahWarning, setDismissPahWarning] = useState(false);
  const [excludeP2Sensitivity, setExcludeP2Sensitivity] = useState(false);
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
    setPdfImporting(true);
    setPdfStatus("Reading stack test PDF...");
    try {
      const pdfjsLib = await loadPdfJs();
      const bytes = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
      const pageTexts = [];
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
        const page = await pdf.getPage(pageNo);
        const content = await page.getTextContent();
        pageTexts.push(content.items.map(item => item.str).join(" "));
      }
      const rawStackText = pageTexts.join(" ");
      const extractPrompt = `Extract data from this Envirocare MCERTS stack test report for a creosote timber treatment plant. Return ONLY JSON with no markdown fences: {"period":"P[n] or empty string","date":"YYYY-MM-DD or empty string","activeHrs":number_or_null,"avgTemp":number_or_null,"stackTemp":number_or_null,"avgRH":number_or_null,"voc":number_or_null,"pah":number_or_null,"charges":number_or_null,"p1Charges":number_or_null,"p2Charges":number_or_null,"flowRate_m3hr":number_or_null}. VOC is TVOC in mg/m3. PAH is total PAH in ug/m3. flowRate is stack discharge flow in m3/hr.\n\n${rawStackText}`;
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body:JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, messages:[{ role:"user", content:extractPrompt }] })
      });
      const data = await resp.json();
      const aiText = data.content ? data.content.map(b=>b.text||"").join("") : "";
      const parsedAi = JSON.parse(aiText.replace(/```json|```/g,"").trim());
      const extracted = Object.fromEntries(Object.entries(parsedAi).map(([k,v])=>[k, v == null ? "" : String(v)]));
      if (!extracted.period) extracted.period = nextPeriod;
      setForm(f => ({ ...f, ...extracted }));
      const missing = [
        ["date","date"], ["activeHrs","active hours"], ["avgTemp","ambient temp"],
        ["stackTemp","stack temp"], ["avgRH","RH"], ["voc","VOC"], ["pah","PAH"],
      ].filter(([key]) => extracted[key] === "").map(([,label]) => label);
      setPdfStatus(missing.length
        ? `Extracted PDF fields. Review before adding; missing: ${missing.join(", ")}.`
        : "Extracted PDF fields. Review, then click Add and Recalibrate Both Models.");
    } catch (error) {
      setPdfStatus("Import failed: " + error.message);
    }
    setPdfImporting(false);
  }, [nextPeriod]);

  const handleAdd = ()=>{
    if(!form.period||!form.date) return;
    onAdd({ period:form.period, date:form.date, activeHrs:parseFloat(form.activeHrs)||0, avgTemp:parseFloat(form.avgTemp)||0, stackTemp:form.stackTemp!==""?parseFloat(form.stackTemp):null, avgRH:parseFloat(form.avgRH)||75, voc:form.voc!==""?parseFloat(form.voc):null, pah:form.pah!==""?parseFloat(form.pah):null, charges:parseInt(form.charges)||0, p1Charges:parseInt(form.p1Charges)||0, p2Charges:parseInt(form.p2Charges)||0, flowRate_m3hr:form.flowRate_m3hr!==""?parseFloat(form.flowRate_m3hr):null });
    setForm({ period:"", date:"", activeHrs:"", avgTemp:"", stackTemp:"", avgRH:"", voc:"", pah:"", charges:"", p1Charges:"", p2Charges:"", flowRate_m3hr:"" });
  };

  const stackTempCorrection = settings.stackTempCorrectionC ?? 8;
  const fitRows = stackData.map(d=>{
    const tOperative = operativeTemp(d.avgTemp, stackTempCorrection);
    const vocPred = d.voc!=null ? predictVOC(d.activeHrs,tOperative,d.avgRH,vocC) : null;
    const st = d.stackTemp!=null ? d.stackTemp : d.avgTemp+10;
    const pahPred = d.pah!=null ? predictPAH(st, d.activeHrs, pahC) : null;
    const vocErr = vocPred&&d.voc ? ((vocPred-d.voc)/d.voc*100) : null;
    const pahErr = pahPred&&d.pah ? ((pahPred-d.pah)/d.pah*100) : null;
    return {...d, tOperative, vocPred, pahPred, vocErr, pahErr};
  });
  const highResiduals = fitRows.filter(r=>r.vocErr != null && Math.abs(r.vocErr) > 80);
  const vocCWithoutP2 = calibrateVOC(stackData.filter(d=>d.period !== "P2"));

  // VOC model curves
  const modelLines=[];
  const tSeries=[6,10,15,20]; const tColors=[C.teal,C.rund,C.amber,C.red];
  for(let h=100;h<=2000;h+=100){
    const pt={hrs:h};
    tSeries.forEach(t=>{ pt["voc_"+t]=predictVOC(h,operativeTemp(t, stackTempCorrection),80,vocC); });
    modelLines.push(pt);
  }

  return (
    <div>
      <MissingPAHBanner period={missingPah} dismissed={dismissPahWarning} onDismiss={()=>setDismissPahWarning(true)} />
      <ModelStatusBanner vocC={vocC} pahC={pahC} />

      <Card>
        <SectionTitle>P2 VOC Sensitivity</SectionTitle>
        <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, fontWeight:700, color:C.ink }}>
          <input type="checkbox" checked={excludeP2Sensitivity} onChange={e=>setExcludeP2Sensitivity(e.target.checked)} />
          Exclude P2 from VOC regression (sensitivity test)
        </label>
        <div style={{ marginTop:8, fontSize:12, color:Math.abs((vocCWithoutP2.a||0)-(vocC.a||0))>0.1?C.amber:C.muted }}>
          With P2: a={vocC.a.toFixed(3)}, b={vocC.b.toFixed(3)}, R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"} | Without P2: a={vocCWithoutP2.a.toFixed(3)}, b={vocCWithoutP2.b.toFixed(3)}, R2={vocCWithoutP2.r2!=null?vocCWithoutP2.r2.toFixed(3):"default"}
        </div>
        <div style={{ marginTop:8, fontSize:11, color:C.muted }}>P2 exclusion is a sensitivity test only. The operative model uses the independent-period calibration rule. Any decision to formally exclude P2 from calibration must be documented and agreed with the Environment Agency.</div>
      </Card>

      <Card>
        <SectionTitle>Model Fit - Predicted vs Actual</SectionTitle>
        <div style={{ background:TINT.blueBg, borderLeft:`3px solid ${C.blue}`, borderRadius:7, padding:"10px 14px", fontSize:11, color:TINT.blueText, marginBottom:10, lineHeight:1.55 }}>
          ELV applicability: Environmental permit ELVs (VOC 20 mg/m3, PAH 1,000 ug/m3) were formally applied from November 2025 onwards. P1-P4 were baseline monitoring periods. Exceedances in P1-P4 are recorded for calibration reference only and do not constitute permit non-compliance events.
        </div>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {["Period","Hrs","Amb T","T Oper","Stack T","RH","VOC Act","VOC Pred","VOC Err","PAH Act","PAH Pred","PAH Err","Note"].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"5px 7px", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fitRows.map((row,i)=>{
                const baseline=["P1","P2","P3","P4"].includes(row.period);
                const same=["P2","P3"].includes(row.period);
                return (
                  <>
                  <tr style={{ borderBottom:`1px solid ${C.border}`, background:row.pah==null?TINT.redBg:i%2===0?C.ivory:C.surface }}>
                    <td style={{ padding:"5px 7px", fontWeight:700, fontFamily:MONO }}>{row.period}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.activeHrs?.toLocaleString()}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.avgTemp}C</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO, color:C.blue }}>{row.tOperative.toFixed(1)}C</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.stackTemp?C.ink:C.muted }}>{row.stackTemp?row.stackTemp+"C":"~est"}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.avgRH}%</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.voc>VOC_ELV?C.red:C.teal, fontWeight:row.voc>VOC_ELV?700:400 }}>{row.voc!=null?row.voc:"--"}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.vocPred!=null?row.vocPred:"--"}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.vocErr!=null&&Math.abs(row.vocErr)>50?C.amber:C.muted }}>{row.vocErr!=null?(row.vocErr>0?"+":"")+row.vocErr.toFixed(0)+"%":"--"}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.pah>PAH_ELV?C.red:C.teal, fontWeight:row.pah>PAH_ELV?700:400 }}>{row.pah!=null?row.pah.toLocaleString():<Badge text="Outstanding" color={C.red} />}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO }}>{row.pahPred!=null?row.pahPred.toLocaleString():"--"}</td>
                    <td style={{ padding:"5px 7px", fontFamily:MONO, color:row.pahErr!=null&&Math.abs(row.pahErr)>30?C.amber:C.muted }}>{row.pahErr!=null?(row.pahErr>0?"+":"")+row.pahErr.toFixed(0)+"%":"--"}</td>
                    <td style={{ padding:"5px 7px", fontSize:9, color:C.muted }}>
                      <div>{same?"same C/O":baseline?"baseline":""}</div>
                      {baseline && <div style={{ marginTop:4 }}><Badge text="Pre-ELV baseline" color={C.blue} /></div>}
                      {row.flowAnomalous && (
                        <div style={{ marginTop:4 }}>
                          <Badge text="Flow: unresolved" color={C.amber} />
                          <button onClick={()=>setOpenAnomaly(openAnomaly===row.period?null:row.period)} style={{ marginLeft:6, border:`1px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.blue, cursor:"pointer", fontSize:10, fontWeight:700 }}>note</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {row.flowAnomalous && openAnomaly===row.period && (
                    <tr key={`${row.period}-anomaly`} style={{ borderBottom:`1px solid ${C.border}`, background:TINT.amberBg }}>
                      <td colSpan={13} style={{ padding:"9px 10px", fontSize:11, color:C.ink, lineHeight:1.55 }}>
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
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
          P1-P3: same carbon charge (cumulative -- not independent data points). P4-P8: fresh carbon each period. P2 excluded from both VOC and PAH calibration for consistency: sameCarbon=true cumulative observations are not independent data points in either model. P2 certified results (VOC 45.0 mg/m3, PAH 865 ug/m3) are displayed for transparency only. VOC model uses T_operative = ambient + correction factor. PAH model uses MCERTS stack temp.
        </div>
      </Card>

      <Card>
        <SectionTitle>Residual Analysis</SectionTitle>
        <h4 style={{ margin:"0 0 10px", color:C.ink }}>High-Residual Periods</h4>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(260px, 1fr))", gap:10 }}>
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
        <div style={{ fontSize:11, color:C.muted, marginTop:10 }}>These residuals are retained in calibration. They define the x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} uncertainty band applied to all predictions. Remove or exclude these periods only if a specific physical explanation justifies exclusion and is documented.</div>
      </Card>

      <Card>
        <SectionTitle>VOC Model Curves (with Uncertainty Band)</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={modelLines} margin={{ top:5, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
            <XAxis dataKey="hrs" label={{ value:"Active Hours", position:"insideBottom", offset:-8, fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <YAxis label={{ value:"VOC mg/m3", angle:-90, position:"insideLeft", fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} domain={[0,80]} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
            <ReferenceLine y={VOC_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"ELV 20", fill:C.red, fontSize:10 }} />
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
        <div style={{ fontSize:11, color:C.muted, textAlign:"center", marginTop:6 }}>
          Curve labels show ambient temperature. VOC physics is calculated at ambient + {stackTempCorrection.toFixed(1)}C correction.
        </div>
      </Card>

      <Card>
        <SectionTitle>Import Stack Test PDF (Auto-Extract)</SectionTitle>
        <div onDragOver={e=>{e.preventDefault();setPdfDragOver(true);}} onDragLeave={()=>setPdfDragOver(false)}
          onDrop={e=>{e.preventDefault();setPdfDragOver(false);handleStackPdf(e.dataTransfer.files[0]);}}
          style={{ border:`2px dashed ${pdfDragOver?C.rund:C.border}`, borderRadius:10, padding:"24px 20px", textAlign:"center", background:pdfDragOver?C.rund+"08":C.ivory, transition:"all 0.2s" }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>
            {pdfImporting ? pdfStatus : "Drag MCERTS stack test PDF here or browse"}
          </div>
          <input type="file" accept=".pdf" id="stackPdfFile" style={{ display:"none" }} onChange={e=>handleStackPdf(e.target.files[0])} />
          <label htmlFor="stackPdfFile" style={{ cursor:"pointer", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${C.rund}`, color:C.rund, fontWeight:700, fontSize:12 }}>Browse PDF</label>
          {pdfStatus && <div style={{ fontSize:12, color:pdfImporting?C.amber:pdfStatus.startsWith("Import failed")||pdfStatus.startsWith("PDF files")?C.red:C.teal, marginTop:10 }}>{pdfStatus}</div>}
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
          Extracts period, test date, active hours, charges, ambient/stack temperature, RH, TVOC and total PAH where present. Review the populated fields before recalibrating.
        </div>
      </Card>

      <Card>
        <SectionTitle>Add Stack Test Result</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Period"        value={form.period}         onChange={v=>setForm(f=>({...f,period:v}))}         style={{ flex:"1 1 70px"  }} />
          <Input label="Date"     type="date" value={form.date}   onChange={v=>setForm(f=>({...f,date:v}))}           style={{ flex:"1 1 140px" }} />
          <Input label="Active Hrs" type="number" value={form.activeHrs}   onChange={v=>setForm(f=>({...f,activeHrs:v}))}   style={{ flex:"1 1 90px"  }} />
          <Input label="Charges"    type="number" value={form.charges}     onChange={v=>setForm(f=>({...f,charges:v}))}     style={{ flex:"1 1 80px"  }} />
          <Input label="Plant 1"    type="number" value={form.p1Charges} onChange={v=>setForm(f=>({...f,p1Charges:v}))} style={{ flex:"1 1 70px"  }} />
          <Input label="Plant 2"    type="number" value={form.p2Charges} onChange={v=>setForm(f=>({...f,p2Charges:v}))} style={{ flex:"1 1 70px"  }} />
          <Input label="Amb Temp C" type="number" step="0.1" value={form.avgTemp}   onChange={v=>setForm(f=>({...f,avgTemp:v}))}   style={{ flex:"1 1 90px"  }} />
          <Input label="Stack Temp C" type="number" step="0.1" placeholder="MCERTS header" value={form.stackTemp} onChange={v=>setForm(f=>({...f,stackTemp:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="Avg RH %"   type="number" value={form.avgRH}       onChange={v=>setForm(f=>({...f,avgRH:v}))}       style={{ flex:"1 1 70px"  }} />
          <Input label="VOC mg/m3"  type="number" step="0.1" value={form.voc}  onChange={v=>setForm(f=>({...f,voc:v}))}       style={{ flex:"1 1 90px"  }} />
          <Input label="PAH ug/m3"  type="number" step="0.1" value={form.pah}  onChange={v=>setForm(f=>({...f,pah:v}))}       style={{ flex:"1 1 90px"  }} />
          <Input label="Stack Discharge Flow (m3/hr) - from report" type="number" step="1" value={form.flowRate_m3hr} onChange={()=>{}} style={{ flex:"1 1 180px" }} />
        </div>
        {form.flowRate_m3hr!=="" && (parseFloat(form.flowRate_m3hr)<7000 || parseFloat(form.flowRate_m3hr)>12000) && (
          <div style={{ marginBottom:10, padding:"9px 12px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:7, color:TINT.amberText, fontSize:12, fontWeight:700 }}>
            Flow rate {form.flowRate_m3hr} m3/hr is outside the expected 7,000-12,000 m3/hr range for Config A. Review before adding - this may indicate a flow anomaly.
          </div>
        )}
        <Btn onClick={handleAdd} variant="rund">Add and Recalibrate Both Models</Btn>
        <div style={{ fontSize:11, color:C.muted, marginTop:6 }}>Stack temp from MCERTS report header. Critical for PAH calibration - read from test certificate where available.</div>
      </Card>
    </div>
  );
}

// ============================================================
// CoA DATA TAB
// ============================================================
function CoATab({ coaData, onAdd, onImport, settings, onSettingChange }) {
  const [form, setForm] = useState({ date:"", certNo:"", flashpoint:"", crystallisation:"", naphthalene:"", bap:"" });
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(async (file)=>{
    if(!file||file.type!=="application/pdf"){setImportStatus("PDF files only.");return;}
    setImporting(true);setImportStatus("Reading PDF...");
    try {
      const base64 = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Read failed"));r.readAsDataURL(file);});
      setImportStatus("Extracting via AI...");
      const resp = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:base64}},{type:"text",text:"Extract from this Koppers creosote CoA. Return ONLY JSON, no markdown: {\"date\":\"YYYY-MM-DD\",\"certNo\":\"string\",\"flashpoint\":number_or_null,\"crystallisation\":number_or_null,\"naphthalene\":number_or_null,\"bap\":number_or_null}"}]}]})});
      const data = await resp.json();
      const text = data.content.map(b=>b.text||"").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      onImport(parsed);
      setImportStatus("Imported: "+parsed.certNo+" ("+parsed.date+")");
    } catch(e){setImportStatus("Import failed: "+e.message);}
    setImporting(false);
  },[onImport]);

  const avgNaph = coaData.filter(d=>d.naphthalene).length>0
    ? coaData.filter(d=>d.naphthalene).reduce((a,d)=>a+d.naphthalene,0)/coaData.filter(d=>d.naphthalene).length : null;
  const wjFrac = settings.naphthaleneFrac*100;
  const divergence = avgNaph!=null ? Math.abs(avgNaph-wjFrac) : null;

  // CoA naphthalene -> suggested WJ fraction adjustment (Raoult scaling ~0.85 factor)
  const suggestedWJ = avgNaph!=null ? (avgNaph*0.85).toFixed(1) : null;

  // CoA B(a)P trend: high B(a)P correlates with higher PAH loading
  const avgBap = coaData.filter(d=>d.bap).length>0
    ? coaData.filter(d=>d.bap).reduce((a,d)=>a+d.bap,0)/coaData.filter(d=>d.bap).length : null;
  const avgFlashpoint = coaData.filter(d=>d.flashpoint).length>0
    ? coaData.filter(d=>d.flashpoint).reduce((a,d)=>a+d.flashpoint,0)/coaData.filter(d=>d.flashpoint).length : null;
  const avgCrystallisation = coaData.filter(d=>d.crystallisation).length>0
    ? coaData.filter(d=>d.crystallisation).reduce((a,d)=>a+d.crystallisation,0)/coaData.filter(d=>d.crystallisation).length : null;

  const chartData = coaData.slice(-30).map(d=>({
    label:(d.certNo||d.date||"").slice(-5),
    flashpoint:d.flashpoint, naphthalene:d.naphthalene, bap:d.bap, crystallisation:d.crystallisation
  }));

  return (
    <div>
      <Card>
        <SectionTitle>CoA to Model Connection</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="CoA Avg Naph %" value={avgNaph!=null?avgNaph.toFixed(1):"--"} unit="%" sub="Liquid phase (Raoult)" />
          <StatPill label="WJ Vapour Fraction" value={wjFrac.toFixed(1)} unit="%" sub="Applied to active hrs scaling" />
          <StatPill label="Divergence" value={divergence!=null?divergence.toFixed(1):"--"} unit="%"
            color={divergence!=null?(divergence<5?C.teal:divergence<10?C.amber:C.red):C.muted}
            sub={divergence!=null?(divergence<5?"Consistent":"Review WJ setting"):"No CoA data"} />
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
        <div style={{ fontSize:12, color:C.muted, marginTop:10 }}>
          CoA liquid naphthalene and vapour TVOC fraction are distinct (Raoult's Law). WJ fraction is applied as a scaling factor on active hours - higher naphthalene fraction = faster capacity consumption = fewer charges to failure. The WJ fraction directly drives the charges-remaining calculation on the Dashboard.
        </div>
        {suggestedWJ && Math.abs(parseFloat(suggestedWJ)-wjFrac) > 3 && (
          <div style={{ marginTop:10, padding:"10px 14px", background:TINT.amberBg, border:`1px solid ${C.amber}`, borderRadius:7, fontSize:12, color:TINT.amberText }}>
            CoA data suggests WJ fraction of ~{suggestedWJ}% (Raoult-adjusted from {avgNaph.toFixed(1)}% liquid). Current setting: {wjFrac.toFixed(1)}%.
            <button onClick={()=>onSettingChange("naphthaleneFrac",parseFloat(suggestedWJ)/100)}
              style={{ marginLeft:10, padding:"3px 10px", background:C.amber, color:"#ffffff", border:"none", borderRadius:5, cursor:"pointer", fontSize:11, fontWeight:700 }}>
              Apply Suggestion
            </button>
          </div>
        )}
        <div style={{ marginTop:14 }}>
          <label style={{ display:"block", fontSize:11, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:5 }}>
            WJ Naphthalene/TVOC Fraction: {wjFrac.toFixed(1)}%
          </label>
          <input type="range" min={30} max={70} step={0.5} value={wjFrac}
            onChange={e=>onSettingChange("naphthaleneFrac",parseFloat(e.target.value)/100)}
            style={{ width:"100%", accentColor:C.rund }} />
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.muted }}>
            <span>30%</span><span>53% (plant calib.)</span><span>70%</span>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Import Koppers CoA PDF (Auto-Extract)</SectionTitle>
        <div onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)}
          onDrop={e=>{e.preventDefault();setDragOver(false);handleFile(e.dataTransfer.files[0]);}}
          style={{ border:`2px dashed ${dragOver?C.rund:C.border}`, borderRadius:10, padding:"28px 20px", textAlign:"center", background:dragOver?C.rund+"08":C.ivory, transition:"all 0.2s" }}>
          <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>{importing?importStatus:"Drag Koppers CoA PDF here or browse"}</div>
          <input type="file" accept=".pdf" id="coaFile" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])} />
          <label htmlFor="coaFile" style={{ cursor:"pointer", display:"inline-block", padding:"8px 18px", borderRadius:7, border:`1px solid ${C.rund}`, color:C.rund, fontWeight:700, fontSize:12 }}>Browse PDF</label>
          {importStatus && <div style={{ fontSize:12, color:importing?C.amber:C.teal, marginTop:10 }}>{importStatus}</div>}
        </div>
      </Card>

      {chartData.length > 1 && (
        <Card>
          <SectionTitle>CoA Trends (Last 30 Deliveries)</SectionTitle>
          <div style={{ marginBottom:6, fontSize:11, fontWeight:700, color:C.muted }}>Flashpoint (C) - spec min 140C</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
              <XAxis dataKey="label" tick={{ fontSize:9, fill:C.ink }} />
              <YAxis domain={["auto","auto"]} tick={{ fontSize:10, fill:C.ink }} />
              <ReferenceLine y={140} stroke={C.amber} strokeDasharray="4 2" label={{ value:"140C", fill:C.amber, fontSize:9 }} />
              <Tooltip formatter={(v)=>[v?v.toFixed(1):"--","Flashpoint"]} />
              <Line type="monotone" dataKey="flashpoint" stroke={C.gold} strokeWidth={2} dot={{ r:2 }} name="Flashpoint" />
            </LineChart>
          </ResponsiveContainer>
          <div style={{ marginTop:10, marginBottom:6, fontSize:11, fontWeight:700, color:C.muted }}>Naphthalene % and B(a)P ppm - both feed model</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
              <XAxis dataKey="label" tick={{ fontSize:9, fill:C.ink }} />
              <YAxis yAxisId="n" domain={["auto","auto"]} tick={{ fontSize:10, fill:C.ink }} />
              <YAxis yAxisId="b" orientation="right" domain={["auto","auto"]} tick={{ fontSize:10, fill:C.ink }} />
              <Tooltip formatter={(v,n)=>[v?v.toFixed(2):"--",n]} />
              <Line yAxisId="n" type="monotone" dataKey="naphthalene" stroke={C.rund} strokeWidth={2} dot={{ r:2 }} name="Naphthalene %" />
              <Line yAxisId="b" type="monotone" dataKey="bap" stroke={C.red} strokeWidth={1.5} strokeDasharray="4 2" dot={{ r:2 }} name="B(a)P ppm" />
              <Legend />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <SectionTitle>Manual CoA Entry</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Date" type="date" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))} style={{ flex:"1 1 140px" }} />
          <Input label="Cert No" value={form.certNo} onChange={v=>setForm(f=>({...f,certNo:v}))} style={{ flex:"1 1 120px" }} />
          <Input label="Flashpoint C" type="number" step="0.1" value={form.flashpoint} onChange={v=>setForm(f=>({...f,flashpoint:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="Crystallisation C" type="number" step="0.1" value={form.crystallisation} onChange={v=>setForm(f=>({...f,crystallisation:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="Naphthalene %" type="number" step="0.01" value={form.naphthalene} onChange={v=>setForm(f=>({...f,naphthalene:v}))} style={{ flex:"1 1 100px" }} />
          <Input label="B(a)P ppm" type="number" step="0.01" value={form.bap} onChange={v=>setForm(f=>({...f,bap:v}))} style={{ flex:"1 1 100px" }} />
        </div>
        <Btn onClick={()=>{if(!form.date||!form.certNo)return;onAdd({...form,flashpoint:parseFloat(form.flashpoint)||null,crystallisation:parseFloat(form.crystallisation)||null,naphthalene:parseFloat(form.naphthalene)||null,bap:parseFloat(form.bap)||null});setForm({date:"",certNo:"",flashpoint:"",crystallisation:"",naphthalene:"",bap:""});}} variant="rund">Add Entry</Btn>
      </Card>

      {coaData.length > 0 && (
        <Card>
          <SectionTitle>CoA Records ({coaData.length})</SectionTitle>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                  {["Date","Cert No","Flashpoint","Crystallisation","Naph %","B(a)P ppm"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"6px 10px", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.08em", textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...coaData].reverse().slice(0,25).map((row,i)=>(
                  <tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.ivory:C.surface }}>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.date}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.certNo}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO, color:row.flashpoint<140?C.red:C.ink }}>{row.flashpoint?row.flashpoint.toFixed(1):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.crystallisation?row.crystallisation.toFixed(1):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.naphthalene?row.naphthalene.toFixed(2):"--"}</td>
                    <td style={{ padding:"6px 10px", fontFamily:MONO }}>{row.bap?row.bap.toFixed(2):"--"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {coaData.length>25&&<div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Showing 25 most recent of {coaData.length}</div>}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// TEMPERATURE ANALYSIS TAB
// ============================================================
function TempAnalysisTab({ vocC, pahC, settings }) {
  const nf = settings.naphthaleneFrac;
  const stackTempCorrection = settings.stackTempCorrectionC ?? 8;
  const pahThresh500 = pahFailTemp(500, pahC);
  const pahThresh = pahThresh500;
  const windowChart = [-5,0,5,10,12,15,18,20,25].map(t=>({
    temp:t,
    vocDry:  safeWindowHoursVOC(operativeTemp(t, stackTempCorrection),60,vocC,nf),
    vocTyp:  safeWindowHoursVOC(operativeTemp(t, stackTempCorrection),80,vocC,nf),
    vocWet:  safeWindowHoursVOC(operativeTemp(t, stackTempCorrection),90,vocC,nf),
  }));
  const seasonRec = [
    { season:"Winter (Dec-Feb)", ambT:5,  stackT:15, rh:85 },
    { season:"Spring (Mar-May)", ambT:10, stackT:20, rh:78 },
    { season:"Summer (Jun-Aug)", ambT:20, stackT:30, rh:72 },
    { season:"Autumn (Sep-Nov)", ambT:12, stackT:22, rh:82 },
  ];
  return (
    <div>
      <Card>
        <SectionTitle>PAH Temperature Threshold Analysis</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:14 }}>
          <StatPill label="PAH ELV Threshold" value={pahThresh.toFixed(1)} unit="C stack"
            color={C.red} sub={`~${(pahThresh-10).toFixed(1)}C ambient equiv.`} />
          <StatPill label="PAH Model R2" value={pahC.r2!=null?pahC.r2.toFixed(3):"default"} unit=""
            color={pahC.r2>0.9?C.teal:C.amber} sub="Temperature-only model" />
          <StatPill label="Uncertainty" value={"x"+Math.exp(pahC.rmse||PAH_RMSE_LOG).toFixed(2)} unit=""
            color={C.blue} sub="1SD multiplicative" />
        </div>
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.75 }}>
          P7 vs P8 confirmation: 1,387 hrs at 6.1C/17.5C stack = VOC 5.9 mg/m3 (PASS). 1,495 hrs at 11.6C/23.0C stack = VOC 63.9 mg/m3 (FAIL, 3.2x ELV). VOC safe-hours curves use T_operative = ambient + {stackTempCorrection.toFixed(1)}C correction.
        </div>
      </Card>

      <Card>
        <SectionTitle>VOC Safe-Hours Window by Temperature and Humidity</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={windowChart} margin={{ top:5, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
            <XAxis dataKey="temp" label={{ value:"Ambient Temp (C)", position:"insideBottom", offset:-8, fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <YAxis label={{ value:"Safe hrs to ELV breach", angle:-90, position:"insideLeft", fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
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
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>WJ fraction {(nf*100).toFixed(0)}% applied. Higher fraction = shorter window. Curve x-axis shows ambient; calculations use ambient + {stackTempCorrection.toFixed(1)}C correction. <span style={{ color:C.amber, fontWeight:700 }}>Conservative scenario: RH 90% curve.</span></div>
      </Card>

      <Card>
        <SectionTitle>Seasonal Summary (Live Calibration)</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {seasonRec.map((s,i)=>{
            const vocW = safeWindowHoursVOC(operativeTemp(s.ambT, stackTempCorrection), s.rh, vocC, nf);
            const pahOk = s.stackT < pahFailTemp(500, pahC);
            const rc = !pahOk ? C.red : vocW < 400 ? C.red : vocW < 800 ? C.amber : vocW < 1200 ? C.gold : C.teal;
            return (
              <div key={i} style={{ flex:"1 1 180px", background:C.ivory, border:`2px solid ${rc}30`, borderRadius:10, padding:"14px 16px" }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.ink, marginBottom:4 }}>{s.season}</div>
                <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>{s.ambT}C amb | {s.stackT}C stack | {s.rh}% RH</div>
                <div style={{ fontSize:13, fontFamily:MONO, fontWeight:700, color:rc, marginBottom:4 }}>{vocW.toLocaleString()} hrs VOC</div>
                <div style={{ fontSize:11, color:pahOk?C.teal:C.red, fontWeight:600 }}>PAH: {pahOk?"OK":"THRESHOLD EXCEEDED"}</div>
                <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>~{Math.round(vocW/(24*0.9))} days at 90% util</div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// FORWARD FORECAST TAB
// ============================================================
function ForwardForecastTab({ settings, onSettingChange, lastChangeout, onChangeoutDateChange, vocC, pahC }) {
  const today = useMemo(()=>new Date(),[]);
  const [mode, setMode] = useState("seasonal");
  const [flatTemp, setFlatTemp] = useState(settings.typicalTempC);
  const [monthlyTemps, setMonthlyTemps] = useState(BOSTON_MONTHLY_TEMPS);
  const [activeOverride, setActiveOverride] = useState("");
  const [pahTempOverride, setPahTempOverride] = useState("");
  const [liveTemps, setLiveTemps] = useState(null);
  const [liveStatus, setLiveStatus] = useState("");

  const utilisationPct = Math.round((settings.utilisationRate || 0.82) * 1000) / 10;
  const stackTempCorrection = settings.stackTempCorrectionC ?? 8;
  const preTestBufferDays = settings.preTestBufferDays ?? 14;
  const preTestBufferActiveHrs = settings.preTestBufferActiveHrs ?? 150;
  const autoActiveHrs = Math.max(0, Math.round(daysBetween(lastChangeout, today) * 24 * (utilisationPct / 100)));
  const startActiveHrs = activeOverride !== "" ? Math.max(0, parseFloat(activeOverride) || 0) : autoActiveHrs;

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

  const forecast = useMemo(()=>buildForwardForecast({
    startDate: today,
    startActiveHrs,
    utilisationPct,
    mode,
    flatTemp,
    monthlyTemps,
    liveTemps,
    correctionFactor: stackTempCorrection,
    pahStackTempOverride: pahTempOverride,
    isSameCarbonCharge: !!settings.isSameCarbonCharge,
    vocC,
    pahC,
    maxDays: 365,
    settings,
    forecastRH: settings.useConservativeRH ? 90 : 80,
  }),[today,startActiveHrs,utilisationPct,mode,flatTemp,monthlyTemps,liveTemps,stackTempCorrection,pahTempOverride,vocC,pahC,settings]);

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
    var calibPeriods = INITIAL_STACK_DATA.filter(function(d) {
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
      `Binding Constraint: ${binding.type}`,
      "",
      "SCHEDULING RECOMMENDATION",
      `Latest recommended stack test date: ${latestTestDate}`,
      `  (Binding breach date minus ${effectiveBufferDays} day buffer)`,
      `Confidence range: ${vocEarlyDate} to ${vocLateDate}`,
      "",
      `TEMPERATURE SCENARIO: ${mode}`,
      `Utilisation rate assumed: ${utilisationPct}%`,
      `Stack temp correction: +${stackTempCorrection}C`,
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
          <Input label="Last Carbon Changeout" type="date" value={lastChangeout} onChange={onChangeoutDateChange} style={{ flex:"1 1 170px" }} />
          <Input label="Cumulative Active Hrs" type="number" value={activeOverride!==""?activeOverride:autoActiveHrs} onChange={v=>setActiveOverride(v)} style={{ flex:"1 1 170px" }} />
          <div style={{ flex:"1 1 170px" }}>
            <label style={{
              display:"block", fontSize:11, fontWeight:700,
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
                operativeTemp(
                  getScenarioAmbientTemp(0, today, mode, flatTemp, monthlyTemps, liveTemps),
                  settings.stackTempCorrectionC ?? 8
                ),
                settings.useConservativeRH ? 90 : 80,
                vocC
              ).toFixed(1)} mg/m3 (predicted)
            </div>
            <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>
              Model prediction at current hours. Anchor scaling removed - see audit note.
            </div>
          </div>
          <Input label="Utilisation Rate (%)" type="number" step="1" min={0} max={100} value={utilisationPct} onChange={v=>onSettingChange("utilisationRate",Math.max(0,Math.min(100,v||0))/100)} style={{ flex:"1 1 170px" }} />
        </div>
        <div style={{ fontSize:11, color:C.muted }}>Leave cumulative active hours as the auto value or type an override. Current VOC anchor scaling has been removed; the model prediction at start is shown for audit trail only.</div>
      </Card>

      <Card>
        <SectionTitle>Temperature Scenario Builder</SectionTitle>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
          {modeButtons.map(btn=>(
            <button key={btn.id} onClick={()=>setMode(btn.id)} style={{ padding:"8px 12px", borderRadius:7, border:`1px solid ${mode===btn.id?C.rund:C.border}`, background:mode===btn.id?C.rund:C.surface, color:mode===btn.id?"#ffffff":C.ink, fontSize:12, fontWeight:700, cursor:"pointer" }}>{btn.label}</button>
          ))}
        </div>
        {mode==="flat" && <Input label="Flat Ambient Temp (C)" type="number" step="0.5" value={flatTemp} onChange={setFlatTemp} style={{ maxWidth:260 }} />}
        {(mode==="seasonal" || mode==="live") && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(92px, 1fr))", gap:10 }}>
              {monthlyTemps.map((temp,i)=>(
                <Input key={monthNames[i]} label={monthNames[i]} type="number" step="0.1" value={temp} onChange={v=>setMonthlyTemps(arr=>arr.map((x,idx)=>idx===i?v:x))} style={{ marginBottom:0 }} />
              ))}
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>Monthly ambient values are editable climatological averages for Boston, Lincolnshire.</div>
          </div>
        )}
        {mode==="live" && <div style={{ marginTop:10, padding:"9px 12px", borderRadius:7, background:(liveTemps&&liveTemps.length)?TINT.safeBg:TINT.amberBg, color:(liveTemps&&liveTemps.length)?TINT.safeText:TINT.amberText, fontSize:12, fontWeight:600 }}>{liveStatus || "Live mode uses Open-Meteo days 1-7, then seasonal climatology."}</div>}
      </Card>

      <Card>
        <SectionTitle>PAH Temperature Scenario Override</SectionTitle>
        <Input label="PAH Stack Temp Override (degC) - leave blank to use regression estimate" type="number" step="0.5" min={15} max={40} value={pahTempOverride} onChange={v=>setPahTempOverride(Number.isFinite(v)?v:"")} style={{ maxWidth:420 }} />
        <div style={{ fontSize:11, color:C.muted, marginTop:-6 }}>
          Use this to model worst-case PAH exposure in high-summer operations or to test a specific monitored stack temperature against the PAH model.
        </div>
      </Card>

      <Card style={{ borderLeft:`4px solid ${binding.type==="PAH"?C.red:binding.type==="VOC"?C.amber:C.teal}` }}>
        <SectionTitle>Forward Forecast Summary</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Predicted VOC Breach" value={forecast.vocBreach?forecast.vocBreach.date:"--"} unit="" color={C.amber} sub={`${forecast.vocBreach?forecast.vocBreach.day:"--"} days / ${forecast.vocBreach?forecast.vocBreach.activeHrs.toLocaleString():"--"} active hrs`} />
          <StatPill label="VOC Confidence Range" value={vocEarlyDate} unit="" color={C.blue} sub={`to ${vocLateDate}`} />
          <StatPill label="Predicted PAH Breach" value={forecast.pahBreach?forecast.pahBreach.date:"--"} unit="" color={C.red} sub={forecast.pahBreach?`predictPAH = ${forecast.pahBreach.pahPred.toLocaleString()} ug/m3 at breach`:"Not within horizon"} />
          <StatPill label="Binding Constraint" value={binding.type} unit="" color={binding.type==="PAH"?C.red:binding.type==="VOC"?C.amber:C.teal} sub="Earlier predicted breach" />
          <StatPill label="Latest Stack Test" value={latestTestDate} unit="" color={C.blue} sub={`${preTestBufferDays} days / ${preTestBufferActiveHrs} active hrs buffer (whichever later)`} />
          <StatPill label="Latest Changeout" value={binding.row?binding.row.date:"--"} unit="" color={binding.type==="PAH"?C.red:C.amber} sub="Binding breach date" />
        </div>
        <div style={{ fontSize:11, color:TINT.redText, background:TINT.redBg, border:`1px solid ${C.red}`, borderRadius:7, padding:"9px 12px", marginTop:10, lineHeight:1.55 }}>
          PAH breach date shown is the central model estimate. Uncertainty band: x{Math.exp(pahC.rmse).toFixed(2)} multiplicative (RMSE in log space). PAH model is temperature-dominant - uncertainty in the ambient-to-stack temperature relationship is the primary source of error, not hours accumulation.
        </div>
        <div style={{ marginTop:10 }}><Btn onClick={exportSchedule} variant="gold" small>Export test schedule</Btn></div>
        <div style={{ fontSize:11, color:settings.useConservativeRH?C.amber:C.muted, marginTop:8 }}>
          {settings.useConservativeRH ? "Humidity: Conservative mode (90% RH) - BAT-aligned posture" : "Humidity: Average mode (80% RH) - switch to Conservative for compliance scheduling"}
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>Confidence band: x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} (effective RMSE in log space, consistent with Dashboard forecast). R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"}. Treat as risk-informed planning estimate.</div>
      </Card>

      <Card>
        <SectionTitle>Day-by-Day Projection</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartRows} margin={{ top:8, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
            {highZones.map((z,i)=><ReferenceArea key={i} x1={z.start} x2={z.end} fill={C.red} fillOpacity={0.08} />)}
            <XAxis dataKey="day" label={{ value:"Days from today", position:"insideBottom", offset:-8, fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <YAxis label={{ value:"VOC mg/m3", angle:-90, position:"insideLeft", fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toFixed(1):v,n]} />
            <ReferenceLine y={VOC_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"VOC ELV 20", fill:C.red, fontSize:10 }} />
            {forecast.sameBedLimit && <ReferenceLine x={forecast.sameBedLimit.day} stroke={C.amber} strokeDasharray="4 2" label={{ value:"1155 hr limit", fill:C.amber, fontSize:10 }} />}
            {binding.row && <ReferenceLine x={Math.max(0,binding.row.day-effectiveBufferDays)} stroke={C.blue} strokeDasharray="3 3" label={{ value:"Latest test", fill:C.blue, fontSize:10 }} />}
            {binding.row && <ReferenceLine x={binding.row.day} stroke={binding.type==="PAH"?C.red:C.amber} strokeDasharray="5 2" label={{ value:"Breach", fill:binding.type==="PAH"?C.red:C.amber, fontSize:10 }} />}
            <Area type="monotone" dataKey="vocHi" stroke="none" fill={C.amber} fillOpacity={0.12} name="Upper band" />
            <Area type="monotone" dataKey="vocLo" stroke="none" fill="#ffffff" fillOpacity={0.9} name="Lower band" />
            <Line type="monotone" dataKey="vocMid" stroke={C.rund} strokeWidth={2.5} dot={false} name="Predicted VOC" />
            <Line type="monotone" dataKey="vocHi" stroke={C.amber} strokeWidth={1} dot={false} strokeDasharray="4 2" name="Upper confidence" />
            <Line type="monotone" dataKey="vocLo" stroke={C.blue} strokeWidth={1} dot={false} strokeDasharray="4 2" name="Lower confidence" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>Red background indicates days where T_operative is at or above 26C and PAH is high risk. The 1,155-hr same-bed limit line is shown only when Same carbon is enabled in Settings. It does not apply to fresh carbon charges.</div>
      </Card>

      <Card>
        <SectionTitle>PAH Temperature Forecast (with Confidence Band)</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={chartRows} margin={{ top:8, right:24, bottom:18, left:0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e5ea" />
            <XAxis dataKey="day" label={{ value:"Days from today", position:"insideBottom", offset:-8, fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <YAxis label={{ value:"PAH ug/m3", angle:-90, position:"insideLeft", fontSize:10, fill:C.ink }} tick={{ fontSize:10, fill:C.ink }} />
            <Tooltip formatter={(v,n)=>[typeof v==="number"?v.toLocaleString():v,n]} />
            <ReferenceLine y={PAH_ELV} stroke={C.red} strokeDasharray="6 3" label={{ value:"ELV 1000", fill:C.red, fontSize:10 }} />
            {forecast.pahBreach && <ReferenceLine x={forecast.pahBreach.day} stroke={C.red} strokeDasharray="5 2" label={{ value:"PAH breach", fill:C.red, fontSize:10 }} />}
            <Area type="monotone" dataKey="pahPredHi" stroke="none" fill={C.red} fillOpacity={0.08} name="Upper (x1 RMSE)" />
            <Area type="monotone" dataKey="pahPredLo" stroke="none" fill="#ffffff" fillOpacity={0.9} name="Lower (x1 RMSE)" />
            <Line type="monotone" dataKey="pahPred" stroke={C.red} strokeWidth={2.5} dot={false} name="Predicted PAH" />
            <Line type="monotone" dataKey="pahPredHi" stroke={C.amber} strokeWidth={1} strokeDasharray="4 2" dot={false} name="Upper confidence" />
            <Line type="monotone" dataKey="pahPredLo" stroke={C.blue} strokeWidth={1} strokeDasharray="4 2" dot={false} name="Lower confidence" />
          </ComposedChart>
        </ResponsiveContainer>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
          Confidence band: x{Math.exp(pahC && pahC.rmse != null ? pahC.rmse : PAH_RMSE_LOG).toFixed(3)} (RMSE in log space = {(pahC && pahC.rmse != null ? pahC.rmse : PAH_RMSE_LOG).toFixed(4)}). The narrow band reflects the high temperature-dominance of the PAH model (R2={pahC && pahC.r2 != null ? pahC.r2.toFixed(3) : "default"}). PAH predictions are sensitive to the ambient-to-stack temperature estimate; this uncertainty is the primary risk factor, not model RMSE. Stack temp override available above.
        </div>
      </Card>

      <Card>
        <SectionTitle>Temperature Profile Used</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:8, maxHeight:310, overflowY:"auto", paddingRight:4 }}>
          {forecast.rows.slice(0,120).map(row=>(
            <div key={row.day} style={{ border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", background:row.pahRisk==="High"?C.red:row.pahRisk==="Elevated"?TINT.redBg:row.pahRisk==="Moderate"?TINT.amberBg:C.surface2, color:row.pahRisk==="High"?TINT.redText:C.ink }}>
              <div style={{ fontSize:10, color:C.muted, fontWeight:700 }}>Day {row.day} | {row.date}</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:C.ink }}>Amb {row.ambient}C</div>
              <div style={{ fontSize:12, fontFamily:MONO, color:row.tOperative>=26?C.red:C.blue }}>T_op {row.tOperative}C</div>
              <div style={{ fontSize:10, color:C.muted }}>{row.source} | PAH {row.pahRisk}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>Showing first 120 projected days. Forecast calculation continues until the first binding breach or 730 days.</div>
      </Card>

      <Card>
        <SectionTitle>Assumptions and Limitations</SectionTitle>
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>
          This forecast is derived from a multivariate VOC regression model calibrated against independent stack test periods (R2={vocC.r2!=null?vocC.r2.toFixed(3):"default"}). PAH breach dates use the calibrated predictPAH model. Predictions should be treated as risk-informed planning estimates, not guaranteed changeout intervals. Model accuracy will improve as additional stack test periods are calibrated. Stack temperature correction of +{stackTempCorrection.toFixed(1)}C applied to all ambient inputs (configurable in Settings). This tool supports but does not replace MCERTS-certified stack testing as the primary compliance verification method. Anchor scaling from a current VOC reading has been removed: a proportional residual at the current hours count cannot be assumed to hold across the forecast horizon under a log-linear model structure, and the bias was most severe at high residual periods such as P8 (63.9 mg/m3 actual, 3.2x ELV). The unanchored regression prediction is used throughout.
        </div>
        <div style={{ marginTop:10, padding:"10px 14px", background:settings.useConservativeRH?TINT.safeBg:TINT.amberBg, border:`1px solid ${settings.useConservativeRH?C.teal:C.amber}`, borderRadius:7, color:settings.useConservativeRH?TINT.safeText:TINT.amberText, fontSize:11, lineHeight:1.55, fontWeight:700 }}>
          Humidity assumption: {settings.useConservativeRH ? "Conservative mode ON - 90% RH applied to all forecast periods. BAT-aligned for Boston, Lincolnshire." : "Conservative mode OFF - 80% RH average applied. For compliance scheduling, enable Conservative Humidity Mode in Settings."}
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// SETTINGS TAB
// ============================================================
function BATComplianceTab({ settings, onChange }) {
  const rows = [
    ["BAT 51(a)", "Activated carbon adsorption with regeneration or disposal", "IMPLEMENTED", "6,000 kg GAC bed, single-pass, disposal at changeout"],
    ["BAT 51(b)", "Regular monitoring of carbon saturation", "IMPLEMENTED", "MCERTS stack testing P1-P8, this model provides predictive scheduling"],
    ["BAT 51(c)", "Lead-lag (series) carbon bed configuration", "NOT YET IMPLEMENTED", "Identified as priority compliance intervention. Lead bed reaches saturation first and is replaced while lag bed continues to protect; provides direct compliance safety net without process interruption. Lower capital cost and operationally simpler than pre-treatment alternatives."],
    ["BAT 52", "VOC ELV 20 mg/m3", "MONITORING", "ELV formally applied from November 2025. P8 exceedance 63.9 mg/m3 (3.2x ELV). Corrective action in progress."],
    ["BAT 52", "PAH ELV 1,000 ug/m3", "MONITORING", "P4 exceedance 5,369 ug/m3 (temperature-driven). P8 PAH result outstanding."],
  ];
  return (
    <div>
      <Card>
        <SectionTitle>STS BREF BAT 51/52 Compliance Status | Decision (EU) 2020/2009 | Permit EPR/A2/1</SectionTitle>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead><tr>{["BAT Reference","Measure","Status","Notes"].map(h=><th key={h} style={{ textAlign:"left", padding:"7px 9px", borderBottom:`2px solid ${C.border}`, color:C.muted, fontSize:10, textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>{rows.map((r,i)=><tr key={i} style={{ borderBottom:`1px solid ${C.border}`, background:i%2===0?C.ivory:C.surface }}>
              <td style={{ padding:"7px 9px", fontWeight:700 }}>{r[0]}</td><td style={{ padding:"7px 9px" }}>{r[1]}</td><td style={{ padding:"7px 9px" }}><Badge text={r[2]} color={r[2]==="IMPLEMENTED"?C.teal:r[2]==="MONITORING"?C.amber:C.red} /></td><td style={{ padding:"7px 9px", color:C.muted }}>{r[3]}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </Card>
      <Card>
        <SectionTitle>Lead-Lag Configuration Assessment</SectionTitle>
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.7 }}>
          BAT 51(c) - Lead-Lag GAC Configuration: A lead-lag (series) bed configuration would install a second carbon vessel in series downstream of the primary bed. When the lead bed reaches a defined breakthrough threshold (e.g. 80% of VOC ELV), it is taken offline for carbon replacement while the lag bed continues to provide abatement. This approach: (1) eliminates the risk of permit exceedance during the changeout window, (2) provides a direct compliance safety net independent of temperature-driven prediction uncertainty, (3) is explicitly named BAT under Decision (EU) 2020/2009 BAT 51(c), and (4) is lower capital cost and operationally simpler than condensation pre-treatment or thermal oxidation. Status: ASSESSMENT PENDING. Recommend formal feasibility assessment for inclusion in the next permit review submission.
        </div>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginTop:14 }}>
          <Input label="Last reviewed" type="date" value={settings.batReviewDate} onChange={v=>onChange("batReviewDate",v)} style={{ flex:"1 1 180px" }} />
          <Input label="Reviewed by" value={settings.batReviewedBy} onChange={v=>onChange("batReviewedBy",v)} style={{ flex:"1 1 220px" }} />
        </div>
      </Card>
    </div>
  );
}

function SettingsTab({ settings, onChange, lastChangeout, onChangeoutDateChange, vocC, pahC }) {
  const [openFanNote, setOpenFanNote] = useState(null);
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
      <ModelStatusBanner vocC={vocC} pahC={pahC} />
      <Card>
        <SectionTitle>Fan Specification (Confirmed Nameplate Data)</SectionTitle>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(230px, 1fr))", gap:8 }}>
          {specRows.map(([label,value])=>(
            <div key={label} style={{ display:"flex", justifyContent:"space-between", gap:12, border:`1px solid ${C.border}`, borderRadius:7, padding:"8px 10px", background:C.ivory }}>
              <span style={{ fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em" }}>{label}</span>
              <span style={{ fontSize:12, color:C.ink, textAlign:"right" }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize:11, color:C.muted, fontStyle:"italic", marginTop:10, lineHeight:1.6 }}>{FAN_SPECIFICATION.operatingNote}</div>
      </Card>
      <Card>
        <SectionTitle>Fan Configuration History</SectionTitle>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.border}` }}>
                {["From","To","Config","Motor (mm)","Fan (mm)","Fan RPM","Stack Discharge Flow (m3/hr)"].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"7px 8px", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.06em", textTransform:"uppercase" }}>{h}</th>
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
                    <button onClick={()=>setOpenFanNote(openFanNote===i?null:i)} style={{ marginLeft:6, border:`1px solid ${C.border}`, borderRadius:5, background:C.surface2, color:C.blue, cursor:"pointer", fontSize:10, fontWeight:700 }} title="Show flow note">*</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {openFanNote!=null && (
          <div style={{ marginTop:8, padding:"9px 12px", background:C.blue+"10", border:`1px solid ${C.blue}30`, borderRadius:7, fontSize:11, color:C.ink, lineHeight:1.5 }}>
            {FAN_CONFIG_LOG[openFanNote].stackDischargeFlowNote}
          </div>
        )}
        <div style={{ fontSize:11, color:C.muted, marginTop:10, lineHeight:1.6 }}>
          All flow values are Envirocare-measured stack discharge flows (post-demister, post-carbon bed) or fan-law estimates where no Envirocare measurement exists during that configuration window. True carbon bed inlet flow is marginally higher than stack discharge flow. Stack discharge flow is used as a conservative proxy in Wheeler-Jonas EBCT calculations.
        </div>
      </Card>
      <Card>
        <SectionTitle>Carbon Bed Configuration</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Bed Mass (kg)" type="number" value={settings.bedMass} onChange={v=>onChange("bedMass",v)} style={{ flex:"1 1 150px" }} />
          <Input label="Extraction Flow (m3/hr)" type="number" value={settings.flowM3hr} onChange={v=>onChange("flowM3hr",v)} style={{ flex:"1 1 150px" }} />
          <Input label="Bed Cross-Section (m2)" type="number" step="0.1" min={0.2} value={settings.crossSectionM2} onChange={v=>onChange("crossSectionM2",Math.max(0.2,v||DEFAULT_CROSS_SECTION_M2))} style={{ flex:"1 1 150px" }} />
          <Input label="WJ Naph/TVOC Fraction (%)" type="number" step="0.5" value={(settings.naphthaleneFrac*100).toFixed(1)} onChange={v=>onChange("naphthaleneFrac",v/100)} style={{ flex:"1 1 150px" }} />
          <Input label="Utilisation Rate (0-1)" type="number" step="0.01" min={0} max={1} value={settings.utilisationRate} onChange={v=>onChange("utilisationRate",v)} style={{ flex:"1 1 150px" }} />
          <Input label="Stack Temp Correction Factor (C)" type="number" step="0.5" min={0} max={20} value={settings.stackTempCorrectionC} onChange={v=>onChange("stackTempCorrectionC",Math.max(0,Math.min(20,v||0)))} style={{ flex:"1 1 210px" }} />
          <Input label="Pre-Test Buffer (days)" type="number" step="1" min={0} max={60} value={settings.preTestBufferDays} onChange={v=>onChange("preTestBufferDays",Math.max(0,Math.min(60,v||0)))} style={{ flex:"1 1 170px" }} />
          <Input label="Pre-Test Buffer (active hrs)" type="number" step="10" min={50} max={400} value={settings.preTestBufferActiveHrs} onChange={v=>onChange("preTestBufferActiveHrs",Math.max(50,Math.min(400,v||150)))} style={{ flex:"1 1 190px" }} />
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:9, fontWeight:700, color:C.muted, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 }}>
            Current Carbon Charge Type
          </label>
          <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:13, color:C.ink, fontWeight:700 }}>
            <input type="checkbox" checked={!!settings.isSameCarbonCharge} onChange={e=>onChange("isSameCarbonCharge", e.target.checked)} />
            Same carbon (not replaced since prior test) - enables 1,155-hr same-bed VOC limit
          </label>
          <div style={{ fontSize:11, color:C.muted, marginTop:4, lineHeight:1.5 }}>
            Tick only if the carbon has NOT been replaced since the previous stack test period. The 1,155-hr same-bed limit applies to the P1-P3 same-carbon failure curve only. Fresh carbon (default) has higher capacity and a different failure trajectory. Incorrect setting will show a misleading reference line on the Forward Forecast chart.
          </div>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
          WJ fraction applied as hours scaling: higher fraction = faster capacity consumption = fewer charges to failure. 53% = plant baseline. Inlet VOC monitoring excluded (would trigger BAT 45 EA continuous stack monitoring obligation).
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
          Empirical uplift from ambient to carbon bed face temperature. Derived from P1-P8 MCERTS stack test data (avg delta +8C). Update when continuous bed-face logging is available.
        </div>
      </Card>

      <Card>
        <SectionTitle>Risk Scoring</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="VOC Risk Weight (%)" type="number" min={10} max={90} step="1" value={Math.round((settings.vocRiskWeight??0.55)*100)} onChange={v=>onChange("vocRiskWeight",Math.max(10,Math.min(90,v||55))/100)} style={{ flex:"1 1 180px" }} />
          <StatPill label="PAH Risk Weight" value={Math.round((1-(settings.vocRiskWeight??0.55))*100)} unit="%" sub="Auto-calculated" />
        </div>
      </Card>
      <Card>
        <SectionTitle>Last Carbon Changeout</SectionTitle>
        <Input label="Changeout Date" type="date" value={lastChangeout} onChange={onChangeoutDateChange} style={{ maxWidth:280 }} />
        <div style={{ fontSize:12, color:C.muted }}>Active hours from charge log (primary) or days x utilisation rate (fallback). Fan hours tracked separately - bed is exposed 24/7.</div>
      </Card>
      <Card>
        <SectionTitle>Site Fallback Conditions</SectionTitle>
        <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
          <Input label="Typical Ambient Temp (C)" type="number" step="0.5" value={settings.typicalTempC} onChange={v=>onChange("typicalTempC",v)} style={{ flex:"1 1 150px" }} />
          <Input label="Typical RH (%)" type="number" value={settings.typicalRH} onChange={v=>onChange("typicalRH",v)} style={{ flex:"1 1 150px" }} />
        </div>
        <label style={{ display:"flex", gap:8, alignItems:"center", fontSize:12, color:C.ink, fontWeight:700 }}>
          <input type="checkbox" checked={!!settings.useConservativeRH} onChange={e=>onChange("useConservativeRH",e.target.checked)} />
          Conservative Humidity Mode
        </label>
        <div style={{ fontSize:11, color:C.muted, marginTop:4, lineHeight:1.5 }}>
          When enabled, humidity is fixed at 90% RH for all VOC predictions and forward forecasts. This is the conservative BAT-aligned posture for Boston, Lincolnshire where night-time RH routinely exceeds 90% in autumn and winter. Recommended for compliance scheduling decisions.
        </div>
        <div style={{ fontSize:11, color:C.muted }}>Boston, Lincolnshire PE21 7HJ | {LAT}N {LON}E | Live weather from Open-Meteo on load.</div>
      </Card>
      <Card>
        <SectionTitle>Plant Averages</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <StatPill label="Plant 1" value={P1_AVG_HRS} unit="hrs/charge" sub="All product types, P1-P8 analysis" />
          <StatPill label="Plant 2" value={P2_AVG_HRS} unit="hrs/charge" sub="All product types, P1-P8 analysis" />
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>
          Plant 1 avg {P1_AVG_HRS} hrs/charge (all product types) | Plant 2 avg {P2_AVG_HRS} hrs/charge (all product types). Derived from full 1,519-charge timestamp analysis.
        </div>
      </Card>
      <Card>
        <SectionTitle>Model Architecture</SectionTitle>
        <div style={{ fontSize:12, color:C.ink, lineHeight:1.8 }}>
          <strong>VOC:</strong> Calibrated using Ridge L2 bivariate regression (ln(active hrs), ambient temperature). In-sample R2 and leave-one-out cross-validated R2 are both computed and displayed. LOO CV R2 is the operative reliability metric for scheduling decisions - it estimates predictive accuracy on periods not used for fitting. In-sample R2 is retained for audit trail purposes only. ln(VOC) = a*ln(rawActiveHrs) + b*T_operative + c + humidityPenalty. The b coefficient ({vocC.b.toFixed(3)}) was calibrated against ambient temperature (avgTemp from MCERTS records), not T_operative. The +{(settings.stackTempCorrectionC ?? 8).toFixed(1)}C stack temperature correction is applied at prediction time only (T_operative = ambient + correction). This is internally consistent provided the correction factor is constant across all calibration periods, which the +8C interim assumption achieves. If a period-specific correction were used, the model would require recalibration. Deferred until continuous bed-face temperature logging data is available. WJ fraction scales the safeWindowHoursVOC output only - it does not alter the regression prediction input, keeping coefficients consistent with calibration data. The WJ bed life estimate is a theoretical upper bound (Dubinin-Radushkevich/Polanyi steady-state) with no calibrated relationship to observed P1-P8 breakthrough events. It must not be used as a compliance scheduling limit. The VOC regression safe window is the operative limit. Uncertainty band x{Math.exp(vocUncertaintyMultiplier(vocC)).toFixed(2)} shown on forecast.
          <br /><br />
          <strong>PAH:</strong> Bivariate model. ln(PAH) = a*stackTemp + b*ln(activeHrs) + c. Fresh-carbon periods only where PAH is available. Hours coefficient constrained positive. R2={pahC.r2!=null?pahC.r2.toFixed(3):"default"}. ELV breach stack temp at 500hrs: {pahFailTemp(500,pahC).toFixed(1)}C; at 1200hrs: {pahFailTemp(1200,pahC).toFixed(1)}C. Temperature dominant; age provides conservative secondary signal.
          <br /><br />
          <strong>Single-component WJ proxy:</strong> Naphthalene is used as a single-component proxy compound for Wheeler-Jonas bed capacity estimation. This is a conservative simplification - no multi-component competitive adsorption model is implemented. The {(settings.naphthaleneFrac*100).toFixed(0)}% vapour-phase fraction is plant-calibrated against P4-P8 MCERTS results.
          <br /><br />
          <strong>Cycles to failure:</strong> remainingHrs / avgHrsPerCharge (from charge log). Rolling 28-day charge rate converts hours to days.
          <br /><br />
          Permit EPR/A2/1 | VOC ELV {VOC_ELV} mg/m3 | PAH ELV {PAH_ELV} ug/m3 | STS BREF BAT 51/52 | Decision (EU) 2020/2009
        </div>
      </Card>

      <Card>
        <SectionTitle>Data Management</SectionTitle>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <Btn onClick={()=>{
            const keys=["cgb_chargeLog","cgb_coaData","cgb_settings","cgb_lastChangeout","cgb_stackDataExtra","cgb_downtimeHrs","cgb_fanHrs"];
            const payload={ exportedAt:new Date().toISOString(), modelVersion:MODEL_VERSION, modelBuildDate:MODEL_BUILD_DATE, backupSchema:"cgb-localstorage-v1" };
            keys.forEach(k=>{ payload[k]=JSON.parse(localStorage.getItem(k)||"null"); });
            const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
            const a=document.createElement("a"); a.href=url; a.download=`cgb-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
          }} variant="ghost">Export backup (JSON)</Btn>
          <label style={{ display:"inline-block", padding:"10px 20px", borderRadius:7, background:C.rund, color:"#ffffff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Import backup (JSON)
            <input type="file" accept=".json,application/json" style={{ display:"none" }} onChange={e=>{
              const file=e.target.files[0]; if(!file) return;
              const reader=new FileReader();
              reader.onload=()=>{ if(!window.confirm("Import backup and overwrite current persisted data?")) return; const data=JSON.parse(reader.result); Object.keys(data).filter(k=>k.startsWith("cgb_")).forEach(k=>localStorage.setItem(k,JSON.stringify(data[k]))); window.location.reload(); };
              reader.readAsText(file);
            }} />
          </label>
          <Btn onClick={()=>{ if(window.confirm("This will delete all charge log entries, CoA records, and settings overrides. The P1-P8 seed data will be restored. Confirm?")){ ["cgb_chargeLog","cgb_coaData","cgb_settings","cgb_lastChangeout","cgb_stackDataExtra","cgb_downtimeHrs","cgb_fanHrs"].forEach(k=>localStorage.removeItem(k)); window.location.reload(); } }} variant="danger">Clear all data</Btn>
        </div>
        <div style={{ fontSize:11, color:C.muted, marginTop:10, lineHeight:1.6 }}>
          Go-live backup note: this export contains all app-entered and PDF-extracted records held in browser storage, plus model version metadata. Uploaded PDFs are parsed for extraction but are not stored by this app; keep original MCERTS stack test PDFs and Koppers CoA PDFs in a controlled document store, and export this JSON backup after every operational update.
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [clockTime, setClockTime] = useState(new Date().toLocaleTimeString("en-GB"));
  useEffect(() => {
    const id = setInterval(() => setClockTime(new Date().toLocaleTimeString("en-GB")), 1000);
    return () => clearInterval(id);
  }, []);
  const [activeTab, setActiveTab]       = useState("dashboard");
  const [lastSaved, setLastSaved]       = useState("");
  const markSaved = useCallback(t=>setLastSaved(t),[]);
  const [stackDataExtra, setStackDataExtra] = useLocalStorage("cgb_stackDataExtra", [], markSaved);
  const stackData = useMemo(()=>[...INITIAL_STACK_DATA, ...stackDataExtra], [stackDataExtra]);
  const [coaData, setCoaData]           = useLocalStorage("cgb_coaData", [], markSaved);
  const [chargeLog, setChargeLog]       = useLocalStorage("cgb_chargeLog", INITIAL_CHARGES, markSaved);
  const [weather, setWeather]           = useState(null);
  const [lastChangeout, setLastChangeout] = useLocalStorage("cgb_lastChangeout", "2026-03-20", markSaved);
  const [downtimeHrs, setDowntimeHrs]   = useLocalStorage("cgb_downtimeHrs", 0, markSaved);
  const [fanHrs, setFanHrs]             = useLocalStorage("cgb_fanHrs", 0, markSaved);

  const [settings, setSettings] = useLocalStorage("cgb_settings", {
    bedMass:6000, flowM3hr:9000, crossSectionM2:DEFAULT_CROSS_SECTION_M2, naphthaleneFrac:0.53,
    utilisationRate:0.82, typicalTempC:12.0, typicalRH:80,
    stackTempCorrectionC:8,
    preTestBufferDays:14,
    preTestBufferActiveHrs:150,
    vocRiskWeight:0.55,
    useConservativeRH:true,
    isSameCarbonCharge:false,
    batReviewDate:new Date().toISOString().slice(0,10),
    batReviewedBy:"",
  }, markSaved);
  const updateSetting = useCallback((k,v)=>setSettings(s=>({...s,[k]:v})),[]);

  const vocC = useMemo(()=>calibrateVOC(stackData),[stackData]);
  const pahC = useMemo(()=>calibratePAH(stackData),[stackData]);
  const appLogChargeHrs = useMemo(()=>calcActiveHrsFromLog(chargeLog),[chargeLog]);
  const appDaysSince = Math.max(0, Math.floor((new Date()-new Date(lastChangeout))/86400000));
  const appFallbackHrs = Math.max(0, Math.round(appDaysSince*24*settings.utilisationRate - downtimeHrs));
  const chargeActiveHrs = chargeLog.length > 0 ? Math.max(appLogChargeHrs - downtimeHrs, 0) : appFallbackHrs;
  const appAmbientTemp = weather ? weather.temperature_2m : settings.typicalTempC;
  const appRH = settings.useConservativeRH ? 90 : (weather ? weather.relative_humidity_2m : settings.typicalRH);
  const appOperativeTemp = operativeTemp(appAmbientTemp, settings.stackTempCorrectionC ?? 8);

  useEffect(()=>{
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,relative_humidity_2m&timezone=Europe%2FLondon`)
      .then(r=>r.json()).then(d=>{if(d.current)setWeather(d.current);}).catch(()=>{});
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
    { id:"coa",          label:"CoA Data"      },
    { id:"tempanalysis", label:"Temp Analysis" },
    { id:"bat",          label:"BAT Compliance" },
    { id:"settings",     label:"Settings"      },
  ];

  return (
    <div style={{ background:C.bg, color:C.ink, minHeight:"100vh", fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ height:2, background:C.rund, width:"100%" }} />
      <div style={{ background:C.header, padding:"0 20px", borderBottom:`1px solid ${C.borderBright}` }}>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"14px 0" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ background:C.gold, color:C.header, fontWeight:900, fontSize:14, padding:"4px 7px", borderRadius:2, fontFamily:MONO }}>{"<>"}</div>
              <div>
                <div style={{ color:C.gold, fontSize:15, fontWeight:800, letterSpacing:"0.03em" }}>CALDERS &amp; GRANDIDGE (BOSTON) LTD</div>
                <div style={{ color:"#8fa3ba", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase" }}>Carbon Bed Abatement Control System</div>
              </div>
            </div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", justifyContent:"flex-end", alignItems:"center" }}>
              <span style={{ display:"inline-block", background:"#2d3f55", color:"#8fa3ba", border:"1px solid #4a6080", borderRadius:2, fontSize:9, fontWeight:700, letterSpacing:"0.1em", padding:"3px 8px", textTransform:"uppercase", fontFamily:MONO }}>PERMIT EPR/A2/1</span>
              <span style={{ display:"inline-block", background:"transparent", color:"#8fa3ba", border:"1px solid #4a6080", borderRadius:2, fontSize:9, fontWeight:700, letterSpacing:"0.1em", padding:"3px 8px", textTransform:"uppercase", fontFamily:MONO }}>{MODEL_VERSION}</span>
              <div style={{ color:"#8fa3ba", fontFamily:MONO, fontSize:12, border:"1px solid #4a6080", padding:"3px 8px" }}>{clockTime}</div>
              {lastSaved && <div style={{ color:"#8fa3ba", border:"1px solid #4a6080", borderRadius:2, padding:"3px 8px", fontSize:9, fontWeight:700, fontFamily:MONO }}>Saved {lastSaved}</div>}
              <span style={{ display:"inline-block", background:C.gold, color:C.header, border:`1px solid ${C.gold}`, borderRadius:2, fontSize:9, fontWeight:700, letterSpacing:"0.1em", padding:"3px 8px", textTransform:"uppercase", fontFamily:MONO }}>STS BREF BAT 51/52</span>
              <span style={{ display:"inline-block", background:"transparent", color:C.rund, border:`1px solid ${C.rund}`, borderRadius:2, fontSize:9, fontWeight:700, letterSpacing:"0.1em", padding:"3px 8px", textTransform:"uppercase", fontFamily:MONO }}>RUNDVIRKE</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:900, margin:"0 auto", padding:"18px 16px" }}>
        <ProcessSchematic
          activeHrs={chargeActiveHrs}
          vocWindowHrs={safeWindowHoursVOC(appOperativeTemp, appRH, vocC, settings.naphthaleneFrac)}
          tvocPredicted={predictVOC(chargeActiveHrs, appOperativeTemp, appRH, vocC)}
          pahPredicted={predictPAH(estimateStackTemp(appAmbientTemp), chargeActiveHrs, pahC)}
          stackTempC={estimateStackTemp(appAmbientTemp)}
        />
        <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />
        {activeTab==="dashboard"    && <DashboardTab    stackData={stackData} settings={settings} weather={weather} chargeLog={chargeLog} fanHrs={fanHrs} lastChangeout={lastChangeout} downtimeHrs={downtimeHrs} onDowntime={setDowntimeHrs} onFanHrs={setFanHrs} vocC={vocC} pahC={pahC} />}
        {activeTab==="cycles"       && <ChargeCyclesTab chargeLog={chargeLog} onAddCharge={c=>setChargeLog(l=>[...l,c])} onDeleteCharge={id=>setChargeLog(l=>l.filter(c=>c.id!==id))} lastChangeout={lastChangeout} settings={settings} vocC={vocC} />}
        {activeTab==="stack"        && <StackTestsTab   stackData={stackData} onAdd={e=>setStackDataExtra(d=>[...d,e])} settings={settings} vocC={vocC} pahC={pahC} />}
        {activeTab==="forecast"     && <ForwardForecastTab settings={settings} onSettingChange={updateSetting} lastChangeout={lastChangeout} onChangeoutDateChange={setLastChangeout} vocC={vocC} pahC={pahC} />}
        {activeTab==="coa"          && <CoATab coaData={coaData} onAdd={e=>setCoaData(d=>[...d,e])} onImport={e=>setCoaData(d=>d.find(x=>x.certNo===e.certNo)?d:[...d,e])} settings={settings} onSettingChange={updateSetting} />}
        {activeTab==="tempanalysis" && <TempAnalysisTab vocC={vocC} pahC={pahC} settings={settings} />}
        {activeTab==="bat"          && <BATComplianceTab settings={settings} onChange={updateSetting} />}
        {activeTab==="settings"     && <SettingsTab     settings={settings} onChange={updateSetting} lastChangeout={lastChangeout} onChangeoutDateChange={setLastChangeout} vocC={vocC} pahC={pahC} />}

        <div style={{ background:C.header, borderTop:"1px solid #4a6080", padding:"12px 20px", textAlign:"center" }}>
          <div style={{ fontSize:9, color:"#8fa3ba", letterSpacing:"0.1em", textTransform:"uppercase" }}>CALDERS &amp; GRANDIDGE (BOSTON) LTD | EST. 1896 | BOSTON, LINCOLNSHIRE PE21 7HJ</div>
          <div style={{ fontSize:9, color:"#8fa3ba", marginTop:3, letterSpacing:"0.06em" }}>ENVIRONMENTAL PERMIT EPR/A2/1 | BAT REFERENCE: DECISION (EU) 2020/2009 BAT 51/52</div>
          <div style={{ fontSize:9, color:"#8fa3ba", marginTop:3 }}>Wheeler-Jonas | DR/Polanyi | Manes/QHR humidity | Ridge L2 | Single-component WJ proxy (naphthalene)</div>
          <div style={{ fontSize:9, color:"#8fa3ba", marginTop:3 }}>For compliance planning purposes only. Does not replace MCERTS-certified stack testing.</div>
        </div>
      </div>
    </div>
  );
}
