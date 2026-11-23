// trialEngine.js - Trial Mode sub-models for the A4 carbon bed predictability model.
// Pure functions, no React. ASCII only.
//
// Structure (the "models inside the model"):
//   1. Site climate model        - daily ambient temp / RH from Boston monthly means
//   2. Gas train model           - temperature, water vapour and species concentrations
//                                  carried through each device in order (fan in the middle)
//   3. Device sub-models         - condenser, DCWBC, cooler, reheater, demister, VSD,
//                                  source reduction, custom
//   4. Bed capacity model        - site-calibrated trial model (ln VOC = a ln t + b T + c),
//                                  recast as a log-logistic breakthrough curve so it can be
//                                  chained bed-to-bed, then scaled for carbon mass, type,
//                                  utilisation (MTZ / velocity), humidity and concentration
//   5. Bed arrangement model     - single, parallel together, parallel staggered,
//                                  series (lead-lag rotate), series change-all
//   6. Operations / cost model   - changeout trigger, carbon use, cost, energy, payback

// ---------------------------------------------------------------------------
// Defaults (every value is editable on the Assumptions screen)
// ---------------------------------------------------------------------------

export const DEFAULT_SITE = {
  elvVOC: 20, // mg/Nm3 TVOC as C (permit EPR/A2/1, A4)
  elvPAH: 1000, // ug/Nm3 (1 mg/Nm3, A4)
  // Trial model (variant D), recalibrated on corrected tonnes 23 Nov 2026
  voc: { a: 1.87, b: 0.228, c: -14.27, band: 2.53, rhK: 0.5 },
  // Indicative PAH fit (stack temp + ln tonnes). Replace with the app's fitted values.
  pah: { a: 0.838, b: 0.359, c: -8.653, band: 4.0, rhK: 0.3 },
  stackI: 12.9, // T_stack = stackI + stackS * T_ambient (replace with app regression)
  stackS: 0.74,
  thetaBed: 0.6, // share of the stack-temperature effect that is bed adsorption (rest = source generation)
  tFloor: 14, // lowest bed temperature the calibration is allowed to credit (deg C)
  throughput: 11, // creosote t per calendar day
  flow0: 9500, // m3/h current
  fanHeat0: 2.0, // deg C temperature rise across the fan at current flow
  moistureAdd: 0.0, // kPa water vapour added by the process above ambient
  carbonMass0: 6000, // kg CX65 per charge
  bulkDensity: 480, // kg/m3
  bedDepth0: 1.0, // m (confirm from vessel drawing)
  mtz0: 0.3, // m mass-transfer-zone length at current velocity
  mtzExp: 0.5, // MTZ length ~ velocity^exp
  freundlich: 0.3, // capacity ~ concentration^n
  rhOnset: 50, // % RH where water starts to take capacity
  // Inlet to carbon (after existing demister), mg/m3, current flow. Not yet measured.
  inlet: { light: 200, naph: 120, mnap: 50, heavy: 30 },
  aerosol: { light: 0.0, naph: 0.05, mnap: 0.1, heavy: 0.4 }, // fraction present as mist
  changeoutFixed: 2580, // GBP per changeout event (labour, transport, disposal)
  carbonPerKg: 2.0, // GBP per kg CX65 (2580 + 6000 x 2.00 = 14,580)
  testCost: 2755,
  elecPrice: 0.25, // GBP per kWh
  hoursPerDay: 21.7,
  // kW electrical at current flow (confirm from motor current). v2.8.1 audit: was 22 kW, more than the
  // 18.5 kW IE3 motor can draw continuously (~20 kW electrical at full load), which overstated VSD savings.
  fanPower0: 20,
  fanEff: 0.65,
  trigger: 0.8, // change carbon at this fraction of ELV
  triggerWindow: 7, // days averaged for the changeout decision (planning basis, not single hot days)
  cautious: false, // use upper uncertainty band for the trigger
  weather: "typical", // typical | warm | hot | smooth
  dailySD: 3.0, // deg C day-to-day ambient swing (AR1, fixed seed so runs are repeatable)
  tMonth: [4.2, 4.5, 6.6, 8.9, 12.1, 15.0, 17.4, 17.3, 14.8, 11.2, 7.2, 4.6],
  rhMonth: [87, 84, 80, 76, 74, 74, 74, 76, 79, 84, 88, 88],
  // Half the day-night ambient range by month (deg C). Estimate for coastal Lincolnshire - confirm.
  diurnalAmp: [2.5, 3.0, 3.5, 4.0, 4.5, 4.5, 4.5, 4.5, 4.0, 3.5, 2.5, 2.5],
  // Creosote tanks. All vents and tanker displacement go to the extraction (confirmed 23 Nov 2026).
  // Their load is already inside the measured carbon inlet; these inputs split it out so it can be cut.
  // 2 storage tanks normally 60-80 C; 2 work tanks held at 116 C (fed from a 6 barg steam tubular
  // exchanger, creosote possibly ~140 C at the exchanger outlet).
  tankStorT: 70, // deg C storage tank liquid/headspace
  tankWorkT: 116, // deg C work tank headspace (try 125-140 for the exchanger return)
  tankSolar: 6, // deg C storage headspace above ambient from sun, if that is warmer than tankStorT
  tankStorSweep: 50, // m3/h drawn continuously through the storage tank vents (confirm)
  tankWorkSweep: 20, // m3/h drawn continuously through the work tank vents (confirm - key unknown)
  ventJStor: 70, // deg C vent gas where it joins the main duct (= tank T means no cooling in the vent line)
  ventJWork: 116,
  tankSat: 0.6, // headspace approach to equilibrium (1 = fully saturated)
  tankXLight: 0.05, // mole fractions in the creosote (Raoult). Light = phenols/cresols/indene lump
  tankXNaph: 0.12,
  tankXMnap: 0.08,
  tankXHeavy: 0.2,
  deliveriesYr: 143, // road tankers per year (~ throughput x 365 / 28 t)
  deliveryM3: 26, // m3 creosote per delivery (= storage headspace displaced)
  airBlowM3: 40, // m3 air blown through at the end of offload (line clearing)
  chargesDay: 3, // treatment charges per day (confirm from charge log)
  returnM3: 30, // m3 creosote returned from the cylinder to the work tanks per charge (confirm)
  creoDensity: 1.08, // t/m3, for storage-to-work transfer volume
};

export const SPECIES = ["light", "naph", "mnap", "heavy"];
export const SPECIES_LABEL = {
  light: "Light VOC (non-PAH)",
  naph: "Naphthalene",
  mnap: "Methylnaphthalenes",
  heavy: "3-ring PAH (acenaphthene, fluorene, phenanthrene)",
};
const PAH_SPECIES = ["naph", "mnap", "heavy"];

// Vapour pressure ln(P/Pa) = A - B/T(K); MW g/mol. Light fraction treated as non-condensable.
export const VAP = {
  naph: { A: 31.676, B: 8732, mw: 128.2 }, // solid, Ruzicka 2005 (10.9 Pa at 25 C)
  mnap: { A: 28.764, B: 7938, mw: 142.2 }, // liquid 1-/2-MN (~8.5 Pa at 25 C)
  heavy: { A: 33.085, B: 10344, mw: 160 }, // lumped 3-ring (~0.2 Pa at 25 C)
};

export const CARBON_TYPES = {
  cx65: { label: "CX65 coal-based (current)", capVOC: 1.0, capPAH: 1.0, rhMult: 1.0, costMult: 1.0, note: "Calibrated baseline" },
  hiact: { label: "High-activity coal-based (CTC 80+)", capVOC: 1.2, capPAH: 1.1, rhMult: 1.0, costMult: 1.25, note: "Indicative: +20% VOC capacity" },
  coconut: { label: "Coconut shell", capVOC: 1.1, capPAH: 0.75, rhMult: 1.1, costMult: 1.1, note: "Micropores suit light VOC; poorer on 3-ring PAH" },
  hydro: { label: "Hydrophobic / extruded pellet", capVOC: 0.95, capPAH: 0.95, rhMult: 0.5, costMult: 1.35, note: "Halves the humidity penalty" },
  react: { label: "Reactivated CX65", capVOC: 0.9, capPAH: 0.9, rhMult: 1.0, costMult: 0.65, note: "Lower cost, ~10% less capacity" },
};

export const DEVICE_TYPES = {
  condenser: {
    label: "Chilled condenser",
    short: "Condenser",
    positional: true,
    blurb: "Indirect chilled-water/glycol coil. Cools the gas to a set temperature; naphthalene and heavier PAH condense, and water drops to the coil dew point.",
    defaults: { pos: "pre", tOut: 6, fogCapture: 0.7, cop: 3.0, dp: 250, capex: 60000 },
  },
  dcwbc: {
    label: "Direct-contact water bath cooler (DCWBC)",
    short: "DCWBC",
    positional: true,
    blurb: "Gas bubbles through chilled water (C&G-ABT-SPEC-001). Cools and saturates the gas, captures mist and some condensables. Needs downstream heat to bring RH down.",
    defaults: { pos: "pre", tWater: 10, approach: 3, fogCapture: 0.5, soluble: 0.03, cop: 3.0, dp: 1200, capex: 85000 },
  },
  cooler: {
    label: "Gas cooler (ambient air or cooling water)",
    short: "Cooler",
    positional: true,
    blurb: "Heat exchanger without a chiller. Brings the gas part-way to ambient. No energy for refrigeration but limited cooling in summer.",
    defaults: { pos: "post", eff: 0.6, approachAmb: 2, dp: 300, capex: 30000 },
  },
  reheat: {
    label: "Reheater",
    short: "Reheat",
    positional: true,
    blurb: "Duct heater after a cooler/condenser. Each 1 deg C lowers RH by ~6%, but also costs some adsorption capacity. Use only enough to keep RH below ~50-60%.",
    defaults: { pos: "post", dT: 4, eff: 1.0, dp: 50, capex: 8000 },
  },
  demister: {
    label: "High-efficiency mist eliminator / coalescer",
    short: "Demister+",
    positional: true,
    blurb: "Fibre-bed coalescer added to (or replacing) the existing demister. Removes creosote mist that would otherwise land on the carbon.",
    defaults: { pos: "post", eff: 0.8, dp: 400, capex: 25000 },
  },
  vsd: {
    label: "Fan VSD / flow setpoint",
    short: "VSD",
    positional: false,
    blurb: "Sets the system flow. Lower flow = longer contact time, shorter MTZ, less fan heat and power. Captured mass is assumed unchanged unless you lower 'mass retained'.",
    defaults: { flow: 5650, massRetained: 1.0, capex: 12000 },
  },
  source: {
    label: "Source reduction",
    short: "Source",
    positional: false,
    blurb: "Process vapour stopped before it reaches the extraction: vacuum-line condenser, cylinder door practice, lower working temperature. Acts on the process share only - use the tank devices for tank vents and deliveries.",
    defaults: { cutVOC: 0.1, cutPAH: 0.1, capex: 15000 },
  },
  vapbal: {
    label: "Vapour balancing on tanker deliveries",
    short: "VapBal",
    positional: false,
    blurb: "Return line from the storage tank headspace to the road tanker, so the vapour displaced while filling goes back to the tanker instead of the extraction. Optionally stop or divert the end-of-offload air blow.",
    defaults: { capture: 0.95, blowCut: 0, capex: 12000, opex: 0 },
  },
  tankvent: {
    label: "Tank vent dampers + pressure/vacuum valves",
    short: "TankVent",
    positional: false,
    blurb: "Stops the extraction pulling air continuously through the tank headspaces. Vents stay connected but only open on pressure (filling, cylinder returns, breathing), so displaced vapour still goes to abatement.",
    defaults: { sweepCutStor: 0.9, sweepCutWork: 0.9, capex: 12000, opex: 0 },
  },
  ventcond: {
    label: "Tank vent condenser",
    short: "VentCond",
    positional: false,
    blurb: "Small water-cooled condenser on the tank vent line before it joins the main duct. Hot, concentrated, low-flow vent gas is where condensing works best; condensate drains back to the tank. Pure-component saturation is used, so removal is conservative.",
    defaults: { tOut: 35, onWork: 1, onStor: 0, kw: 1, capex: 25000, opex: 0 },
  },
  schedule: {
    label: "Schedule heavy-emission steps for cooler hours",
    short: "Schedule",
    positional: false,
    blurb: "Move vacuum releases, door openings and transfers out of the warm part of the day. Mass load is unchanged; the load-weighted stack temperature falls, which helps PAH most. Use the month buttons for summer only.",
    defaults: { shift: 0.25, capex: 0, opex: 6000 },
  },
  fanmove: {
    label: "Move the fan after the carbon bed",
    short: "Fan after bed",
    positional: false,
    blurb: "Induced draught through the carbon: the fan's compression and motor heat is added after the bed instead of before it. Bed also runs under suction, so no outward leaks.",
    defaults: { capex: 40000, opex: 0 },
  },
  custom: {
    label: "Custom device",
    short: "Custom",
    positional: true,
    blurb: "Define your own effect: removal %, temperature change and moisture change.",
    defaults: { pos: "post", name: "Custom device", remVOC: 0.1, remPAH: 0.1, dT: 0, dPv: 0, kw: 0, dp: 0, capex: 0 },
  },
};

export const ARRANGEMENTS = {
  single: { label: "Single bed", help: "One vessel. Change at trigger." },
  parallel: { label: "Parallel - change together", help: "Flow split across beds; all changed at once. Same as one bigger bed." },
  stagger: { label: "Parallel - staggered", help: "Flow split; only the most loaded bed is changed. Fresh and part-used beds blend at the stack." },
  leadlag: { label: "Series - lead/lag rotate", help: "Gas passes every bed. At trigger the lead is emptied, lag becomes lead, fresh carbon goes in last." },
  seriesall: { label: "Series - change all", help: "Gas passes every bed; all beds changed together." },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function psatW(T) {
  // water saturation pressure, kPa (Magnus)
  return 0.61094 * Math.exp((17.625 * T) / (T + 243.04));
}

function csatSpecies(sp, T) {
  // saturation concentration mg/m3 at T deg C (pure component; Raoult would lower it further)
  const v = VAP[sp];
  if (!v) return Infinity;
  const TK = T + 273.15;
  const P = Math.exp(v.A - v.B / TK);
  return ((P * v.mw) / (8.314 * TK)) * 1000;
}

// Liquid vapour pressure for hot tanks, ln(P/Pa) = A - B/T(K), anchored at 25 C (sub-cooled liquid)
// and at the normal boiling point so it holds up to ~140 C. Naphthalene: 25 C sub-cooled 36 Pa,
// bp 218 C (4.1 kPa at 116 C vs NIST Antoine 4.8 kPa). 1-methylnaphthalene: 8.5 Pa, bp 245 C.
// 3-ring lump: 0.6 Pa, bp ~307 C. Light lump (phenols/cresols/indene): 100 Pa, bp ~187 C, MW 110.
export const VAPL = {
  light: { A: 24.276, B: 5865, mw: 110 },
  naph: { A: 23.798, B: 6027, mw: 128.2 },
  mnap: { A: 24.264, B: 6596, mw: 142.2 },
  heavy: { A: 24.259, B: 7385, mw: 160 },
};
function csatL(sp, T) {
  const v = VAPL[sp];
  const TK = T + 273.15;
  return ((Math.exp(v.A - v.B / TK) * v.mw) / (8.314 * TK)) * 1000;
}
function csatCond(sp, T) {
  // what can stay as vapour after cooling to T (pure component, so conservative): the lower of
  // the solid curve (below the melting point) and the liquid curve
  if (sp === "light") return csatL(sp, T);
  return Math.min(csatSpecies(sp, T), csatL(sp, T));
}

// ---------------------------------------------------------------------------
// Storage tank sub-model: continuous vent sweep + delivery displacement
// ---------------------------------------------------------------------------

export function tankHeadspace(site, group, tAmb, condT) {
  // group "stor" | "work". Returns headspace temperature and the concentration (mg/m3) of the vent
  // gas when it reaches the main duct (after any vent-line cooling or vent condenser).
  const T = group === "work" ? Math.max(site.tankWorkT, tAmb) : Math.max(site.tankStorT, tAmb + site.tankSolar);
  const x = { light: site.tankXLight, naph: site.tankXNaph, mnap: site.tankXMnap, heavy: site.tankXHeavy };
  const tj = group === "work" ? site.ventJWork : site.ventJStor;
  const cap = Math.min(tj === undefined || tj === null ? T : tj, condT === undefined || condT === null ? T : condT, T);
  const c = {};
  const c0 = {};
  for (let i = 0; i < SPECIES.length; i++) {
    const sp = SPECIES[i];
    c0[sp] = site.tankSat * x[sp] * csatL(sp, T);
    c[sp] = cap < T ? Math.min(c0[sp], csatCond(sp, cap)) : c0[sp];
  }
  return { T, c, c0, cap };
}

export function deliveriesOn(site, doy) {
  const n = site.deliveriesYr || 0;
  return Math.floor(((doy + 1) * n) / 365) - Math.floor((doy * n) / 365);
}

export function tankLoad(site, tAmb, doy, red) {
  // mg/day of each species sent to the extraction by the tanks, split by source
  const r = Object.assign({ sweepS: 1, sweepW: 1, disp: 1, blow: 1, condS: null, condW: null }, red || {});
  const hsS = tankHeadspace(site, "stor", tAmb, r.condS);
  const hsW = tankHeadspace(site, "work", tAmb, r.condW);
  const nDel = deliveriesOn(site, doy);
  const vol = {
    storSweep: site.tankStorSweep * site.hoursPerDay * r.sweepS,
    storDel: nDel * (site.deliveryM3 * r.disp + site.airBlowM3 * r.blow),
    workSweep: site.tankWorkSweep * site.hoursPerDay * r.sweepW,
    // creosote coming back from the cylinders, plus the day's make-up pumped in from storage
    workDisp: site.chargesDay * site.returnM3 + site.throughput / (site.creoDensity || 1.08),
  };
  const mass = {};
  const src = { storSweep: 0, storDel: 0, workSweep: 0, workDisp: 0 };
  for (let i = 0; i < SPECIES.length; i++) {
    const sp = SPECIES[i];
    const m = { storSweep: hsS.c[sp] * vol.storSweep, storDel: hsS.c[sp] * vol.storDel, workSweep: hsW.c[sp] * vol.workSweep, workDisp: hsW.c[sp] * vol.workDisp };
    mass[sp] = m.storSweep + m.storDel + m.workSweep + m.workDisp;
    Object.keys(src).forEach((k) => (src[k] += m[k]));
  }
  return { mass, src, nDel, hsS, hsW, vol };
}

const tankBaseCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;
export function tankBaseline(site) {
  // Annual-mean tank contribution to the carbon inlet (mg/m3 at current flow) with today's
  // arrangement. Subtracted from the measured inlet to leave the process share.
  if (tankBaseCache && tankBaseCache.has(site)) return tankBaseCache.get(site);
  const acc = { light: 0, naph: 0, mnap: 0, heavy: 0 };
  const src = { storSweep: 0, storDel: 0, workSweep: 0, workDisp: 0 };
  for (let d = 0; d < 365; d++) {
    const cl = climateDay(site, d);
    const tl = tankLoad(site, cl.tAmb, d);
    for (let i = 0; i < SPECIES.length; i++) acc[SPECIES[i]] += tl.mass[SPECIES[i]] / 365;
    Object.keys(src).forEach((k) => (src[k] += tl.src[k] / 365 / 1e6));
  }
  const vol = site.flow0 * site.hoursPerDay;
  const conc = {};
  const proc = {};
  const kgDay = {};
  for (let i = 0; i < SPECIES.length; i++) {
    const sp = SPECIES[i];
    conc[sp] = acc[sp] / vol;
    proc[sp] = Math.max(0, site.inlet[sp] - conc[sp]);
    kgDay[sp] = acc[sp] / 1e6;
  }
  const totKgDay = SPECIES.reduce((s, k) => s + kgDay[k], 0);
  const inletKgDay = (sum(site.inlet, SPECIES) * vol) / 1e6;
  const res = {
    conc,
    proc,
    kgDay,
    totKgDay,
    src,
    sweepKgDay: src.storSweep + src.workSweep,
    delKgYr: src.storDel * 365,
    workKgDay: src.workSweep + src.workDisp,
    storKgDay: src.storSweep + src.storDel,
    inletKgDay,
    share: totKgDay / Math.max(1e-9, inletKgDay),
    sharePAH: (kgDay.naph + kgDay.mnap + kgDay.heavy) / Math.max(1e-9, (sum(site.inlet, PAH_SPECIES) * vol) / 1e6),
    overflow: SPECIES.filter((sp) => conc[sp] > site.inlet[sp]),
  };
  if (tankBaseCache) tankBaseCache.set(site, res);
  return res;
}

function sum(o, keys) {
  let s = 0;
  for (let i = 0; i < keys.length; i++) s += o[keys[i]] || 0;
  return s;
}

function fRH(rh, onset, k) {
  if (rh <= onset) return 1;
  const x = Math.min(1, (rh - onset) / (100 - onset));
  return Math.max(0.05, 1 - k * x * x);
}

function logLogistic(x, a) {
  if (x <= 0) return 0;
  const p = Math.pow(x, a);
  return p / (1 + p);
}

export function newId() {
  return "d" + Math.random().toString(36).slice(2, 9);
}

// ---------------------------------------------------------------------------
// 1. Climate
// ---------------------------------------------------------------------------

const MID = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

let anomCache = { sd: null, arr: null };
function anomalies(sd) {
  if (anomCache.sd === sd && anomCache.arr) return anomCache.arr;
  let seed = 20261123;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const arr = [];
  let x = 0;
  for (let d = 0; d < 365; d++) {
    // Box-Muller normal, AR(1) with phi 0.75 so warm and cold spells last several days
    const n = Math.sqrt(-2 * Math.log(Math.max(1e-9, rnd()))) * Math.cos(2 * Math.PI * rnd());
    x = 0.75 * x + Math.sqrt(1 - 0.75 * 0.75) * n;
    const summer = d >= 135 && d <= 250 ? 1.2 : 1.0;
    arr.push(x * sd * summer);
  }
  anomCache = { sd, arr };
  return arr;
}

export function climateDay(site, doy) {
  // doy 0..364
  let i = 0;
  while (i < 11 && doy >= MID[i + 1]) i++;
  let t;
  let rh;
  if (doy < MID[0]) {
    const f = (doy + 365 - MID[11]) / (MID[0] + 365 - MID[11]);
    t = site.tMonth[11] + f * (site.tMonth[0] - site.tMonth[11]);
    rh = site.rhMonth[11] + f * (site.rhMonth[0] - site.rhMonth[11]);
  } else if (i === 11) {
    const f = (doy - MID[11]) / (MID[0] + 365 - MID[11]);
    t = site.tMonth[11] + f * (site.tMonth[0] - site.tMonth[11]);
    rh = site.rhMonth[11] + f * (site.rhMonth[0] - site.rhMonth[11]);
  } else {
    const f = (doy - MID[i]) / (MID[i + 1] - MID[i]);
    t = site.tMonth[i] + f * (site.tMonth[i + 1] - site.tMonth[i]);
    rh = site.rhMonth[i] + f * (site.rhMonth[i + 1] - site.rhMonth[i]);
  }
  if (site.weather !== "smooth") t += anomalies(site.dailySD)[doy];
  if (site.weather === "warm") t += 1.5;
  if (site.weather === "hot" && doy >= 152 && doy <= 243) {
    t += 3.0 * Math.sin((Math.PI * (doy - 152)) / 91);
  }
  return { tAmb: t, rhAmb: rh };
}

// ---------------------------------------------------------------------------
// 2+3. Gas train with device sub-models
// ---------------------------------------------------------------------------

const MSTART = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export function monthOf(doy) {
  let m = 0;
  for (let i = 0; i < 12; i++) if (doy >= MSTART[i]) m = i;
  return m;
}

function flowOf(site, scenario, doy) {
  const mo = monthOf(doy || 0);
  const v = (scenario.devices || []).find((d) => d.type === "vsd" && d.on !== false && (!d.months || d.months[mo] !== false));
  return v ? v.flow : site.flow0;
}

function applyDevice(dev, st, ctx) {
  // st: { T, pv, c:{species mg/m3}, Q }
  // returns energy kW and notes
  const out = { T: st.T, pv: st.pv, c: Object.assign({}, st.c), Q: st.Q };
  let kw = 0;
  const mAir = (st.Q * 1.2) / 3600; // kg/s
  const cp = 1.006;
  const site = ctx.site;
  const condense = (Tout, fog) => {
    for (let i = 1; i < SPECIES.length; i++) {
      const sp = SPECIES[i];
      const cs = csatSpecies(sp, Tout);
      if (out.c[sp] > cs) out.c[sp] = out.c[sp] - (out.c[sp] - cs) * fog;
    }
  };
  const waterTo = (Tout, satFrac) => {
    // returns kg/s water condensed
    const cap = psatW(Tout) * satFrac;
    let removed = 0;
    if (out.pv > cap) {
      const dpv = out.pv - cap;
      removed = ((dpv * 1000 * 0.018) / (8.314 * (Tout + 273.15))) * (st.Q / 3600);
      out.pv = cap;
    }
    return removed;
  };
  if (dev.type === "condenser") {
    const Tout = Math.min(st.T, dev.tOut);
    condense(Tout, dev.fogCapture);
    const w = waterTo(Tout, 1.0);
    const q = mAir * cp * (st.T - Tout) + w * 2450;
    out.T = Tout;
    kw = q / Math.max(0.5, dev.cop);
  } else if (dev.type === "dcwbc") {
    const Tout = Math.min(st.T, dev.tWater + dev.approach);
    condense(Tout, dev.fogCapture);
    for (let i = 0; i < SPECIES.length; i++) {
      const sp = SPECIES[i];
      out.c[sp] = out.c[sp] * (1 - site.aerosol[sp] * dev.fogCapture);
    }
    out.c.light = out.c.light * (1 - dev.soluble);
    const w = waterTo(Tout, 0.97);
    // gas leaves near saturation even if it entered dry
    const sat = psatW(Tout) * 0.97;
    if (out.pv < sat) out.pv = sat;
    const q = mAir * cp * (st.T - Tout) + w * 2450;
    out.T = Tout;
    kw = Math.max(0, q) / Math.max(0.5, dev.cop);
  } else if (dev.type === "cooler") {
    const target = ctx.tAmb + dev.approachAmb;
    const Tout = st.T > target ? st.T - dev.eff * (st.T - target) : st.T;
    condense(Tout, 0.3);
    waterTo(Tout, 1.0);
    out.T = Tout;
  } else if (dev.type === "reheat") {
    out.T = st.T + dev.dT;
    kw = (mAir * cp * dev.dT) / Math.max(0.3, dev.eff);
  } else if (dev.type === "demister") {
    for (let i = 0; i < SPECIES.length; i++) {
      const sp = SPECIES[i];
      out.c[sp] = out.c[sp] * (1 - site.aerosol[sp] * dev.eff);
    }
  } else if (dev.type === "custom") {
    out.c.light = out.c.light * (1 - dev.remVOC);
    for (let i = 0; i < PAH_SPECIES.length; i++) {
      const sp = PAH_SPECIES[i];
      out.c[sp] = out.c[sp] * (1 - dev.remPAH);
    }
    out.T = st.T + dev.dT;
    out.pv = Math.max(0.05, st.pv + dev.dPv);
    kw = dev.kw || 0;
  }
  if (dev.dp) kw += (st.Q * dev.dp) / (3600 * 1000 * site.fanEff);
  return { st: out, kw };
}

export function runTrain(site, scenario, doy) {
  // Returns the gas state at the carbon inlet for one day plus diagnostics.
  const cl = climateDay(site, doy);
  const Q = flowOf(site, scenario, doy);
  const tSrc0 = site.stackI + site.stackS * cl.tAmb; // baseline bed-inlet (stack) temperature
  const pvAmb = (cl.rhAmb / 100) * psatW(cl.tAmb) + site.moistureAdd;
  const month = monthOf(doy);
  const devs = (scenario.devices || []).filter((d) => d.on !== false && (!d.months || d.months[month] !== false));
  let massRet = 1;
  let shift = 0;
  let fanAfter = false;
  const cut = { light: 1, naph: 1, mnap: 1, heavy: 1 };
  const red = { sweepS: 1, sweepW: 1, disp: 1, blow: 1, condS: null, condW: null };
  let kwExtra = 0;
  for (let i = 0; i < devs.length; i++) {
    const d = devs[i];
    if (d.type === "vsd") massRet *= d.massRetained;
    if (d.type === "source") {
      cut.light *= 1 - d.cutVOC;
      for (let j = 0; j < PAH_SPECIES.length; j++) cut[PAH_SPECIES[j]] *= 1 - d.cutPAH;
    }
    if (d.type === "vapbal") {
      red.disp *= 1 - d.capture;
      red.blow *= 1 - d.blowCut;
    }
    if (d.type === "tankvent") {
      red.sweepS *= 1 - (d.sweepCutStor !== undefined ? d.sweepCutStor : d.sweepCut || 0);
      red.sweepW *= 1 - (d.sweepCutWork !== undefined ? d.sweepCutWork : d.sweepCut || 0);
    }
    if (d.type === "ventcond") {
      if (d.onWork) red.condW = red.condW === null ? d.tOut : Math.min(red.condW, d.tOut);
      if (d.onStor) red.condS = red.condS === null ? d.tOut : Math.min(red.condS, d.tOut);
      kwExtra += d.kw || 0;
    }
    if (d.type === "schedule") shift = Math.min(0.5, shift + d.shift);
    if (d.type === "fanmove") fanAfter = true;
  }
  // Moving a share s of the load from the warm half of the day to the cool half lowers the
  // load-weighted ambient by 2 x s x (2/pi) x amplitude (sinusoidal day).
  const amp = site.diurnalAmp ? site.diurnalAmp[month] : 0;
  const tShift = -1.273 * shift * amp;
  const tSrc = tSrc0 + site.stackS * tShift;
  const tb = tankBaseline(site);
  const tl = tankLoad(site, cl.tAmb, doy, red);
  const tlBase = tankLoad(site, cl.tAmb, doy);
  const vol = Q * site.hoursPerDay;
  const c = {};
  for (let i = 0; i < SPECIES.length; i++) {
    const sp = SPECIES[i];
    c[sp] = tb.proc[sp] * (site.flow0 / Q) * massRet * cut[sp] + tl.mass[sp] / vol;
  }
  const tankC = sum(tl.mass, SPECIES) / vol;
  const tankKgDay = sum(tl.mass, SPECIES) / 1e6;
  const tankKgDayBase = sum(tlBase.mass, SPECIES) / 1e6;
  const fanHeat = fanAfter ? 0 : site.fanHeat0 * Math.pow(Q / site.flow0, 2);
  let st = { T: tSrc - site.fanHeat0, pv: pvAmb, c, Q };
  const ctx = { site, tAmb: cl.tAmb };
  let kw = kwExtra;
  const steps = [{ label: "Extraction", T: st.T, pv: st.pv, voc: sum(st.c, SPECIES), pah: sum(st.c, PAH_SPECIES) }];
  const pre = devs.filter((d) => DEVICE_TYPES[d.type].positional && d.pos === "pre");
  const post = devs.filter((d) => DEVICE_TYPES[d.type].positional && d.pos !== "pre");
  const doList = (list) => {
    for (let i = 0; i < list.length; i++) {
      const r = applyDevice(list[i], st, ctx);
      st = r.st;
      kw += r.kw;
      steps.push({ id: list[i].id, label: DEVICE_TYPES[list[i].type].short, T: st.T, pv: st.pv, voc: sum(st.c, SPECIES), pah: sum(st.c, PAH_SPECIES), kw: r.kw });
    }
  };
  doList(pre);
  st = Object.assign({}, st, { T: st.T + fanHeat });
  steps.push({ label: fanAfter ? "Fan moved after bed" : "Fan", T: st.T, pv: st.pv, voc: sum(st.c, SPECIES), pah: sum(st.c, PAH_SPECIES) });
  doList(post);
  // fan power change (cube law) relative to current
  const fanDelta = site.fanPower0 * (Math.pow(Q / site.flow0, 3) - 1);
  let rhBed = (100 * st.pv) / psatW(st.T);
  const wetBed = rhBed > 100;
  if (rhBed > 100) rhBed = 100;
  const rhBase = Math.min(100, (100 * pvAmb) / psatW(tSrc0));
  return {
    tAmb: cl.tAmb,
    rhAmb: cl.rhAmb,
    tSrc,
    tSrc0,
    tShift,
    fanAfter,
    tankC,
    tankKgDay,
    tankKgDayBase,
    deliveries: tl.nDel,
    tankStorT: tl.hsS.T,
    tankWorkT: tl.hsW.T,
    tankSrc: tl.src,
    tBed: st.T,
    rhBed,
    rhBase,
    wetBed,
    Q,
    c: st.c,
    voc: sum(st.c, SPECIES),
    pah: sum(st.c, PAH_SPECIES),
    voc0: sum(site.inlet, SPECIES),
    pah0: sum(site.inlet, PAH_SPECIES),
    kwDevices: kw,
    kwFan: fanDelta,
    steps,
  };
}

// ---------------------------------------------------------------------------
// 4. Bed capacity model
// ---------------------------------------------------------------------------

function bedGeometry(site, bed, qBed) {
  const depth = bed.depth || site.bedDepth0;
  const vol = bed.mass / site.bulkDensity;
  const area = vol / depth;
  const v = qBed / 3600 / area;
  const ebct = (vol / qBed) * 3600;
  const area0 = site.carbonMass0 / site.bulkDensity / site.bedDepth0;
  const v0 = site.flow0 / 3600 / area0;
  const mtz = site.mtz0 * Math.pow(Math.max(0.01, v / v0), site.mtzExp);
  const u = Math.max(0.25, 1 - (0.5 * mtz) / depth);
  const u0 = Math.max(0.25, 1 - (0.5 * site.mtz0) / site.bedDepth0);
  return { depth, vol, area, v, ebct, mtz, u, uRatio: u / u0 };
}

function m50(site, kind, tr, cIn, c0, bed, geo) {
  // tonne-equivalent loading at 50% breakthrough for one bed
  const p = kind === "voc" ? site.voc : site.pah;
  const ct = CARBON_TYPES[bed.type] || CARBON_TYPES.cx65;
  const tEff = Math.max(tr.tBed, Math.min(site.tFloor, tr.tSrc));
  const th = site.thetaBed;
  const lnC0 = Math.log(kind === "voc" ? c0 : c0 * 1000); // PAH model in ug/m3
  const base = Math.exp((lnC0 - p.c - th * p.b * tEff - (1 - th) * p.b * tr.tSrc) / p.a);
  const k = p.rhK * ct.rhMult;
  const rhF = fRH(tr.rhBed, site.rhOnset, k) / fRH(tr.rhBase, site.rhOnset, p.rhK);
  const conc = Math.pow(Math.max(1e-6, cIn / c0), site.freundlich);
  const cap = kind === "voc" ? ct.capVOC : ct.capPAH;
  return base * (bed.mass / site.carbonMass0) * geo.uRatio * cap * rhF * conc;
}

// ---------------------------------------------------------------------------
// 5+6. Simulation
// ---------------------------------------------------------------------------

function freshBeds(scenario) {
  return scenario.beds.map((b) => ({ spec: b, mV: 0, mP: 0, age: 0 }));
}

export function simulate(site, scenario, opts) {
  const o = Object.assign({ years: 3, startDoy: 0, noChange: false, maxDays: 0 }, opts || {});
  const days = o.maxDays || o.years * 365;
  const arr = scenario.arrangement;
  const series = arr === "leadlag" || arr === "seriesall";
  let beds = freshBeds(scenario);
  const totalMass = scenario.beds.reduce((s, b) => s + b.mass, 0);
  const trains = [];
  for (let d = 0; d < 365; d++) trains.push(runTrain(site, scenario, d));
  const daily = [];
  const events = [];
  let lastChange = -999;
  const trainState = { mV: 0, mP: 0, kLeadV: 1, kLeadP: 1 };
  let win = [];
  let firstTrigger = null;
  const trig = site.trigger;
  for (let day = 0; day < days; day++) {
    const doy = (o.startDoy + day) % 365;
    const tr = trains[doy];
    const rate = site.throughput; // t creosote per day
    const teV = rate * (tr.voc * tr.Q) / (tr.voc0 * site.flow0);
    const teP = rate * (tr.pah * tr.Q) / (tr.pah0 * site.flow0);
    let outV = 0;
    let outP = 0;
    let leadOut = 0;
    const fr = [];
    if (series) {
      // Series beds behave as one deep bed (gas passes every vessel). Train loading is
      // tracked as a whole; at a lead/lag rotation the lead leaves with the share of the
      // loading the calibrated profile puts in it, and fresh carbon joins at the back.
      const depthSum = beds.reduce((s2, b) => s2 + (b.spec.depth || site.bedDepth0), 0);
      let kV = 0;
      let kP = 0;
      const kLeadV = [];
      const kLeadP = [];
      for (let i = 0; i < beds.length; i++) {
        const sp = Object.assign({}, beds[i].spec, { depth: depthSum });
        const geo = bedGeometry(site, sp, tr.Q);
        const geoReal = bedGeometry(site, beds[i].spec, tr.Q);
        const g2 = Object.assign({}, geoReal, { uRatio: geo.uRatio });
        const a1 = m50(site, "voc", tr, tr.voc, tr.voc0, beds[i].spec, g2);
        const a2 = m50(site, "pah", tr, tr.pah, tr.pah0, beds[i].spec, g2);
        kV += a1;
        kP += a2;
        kLeadV.push(kV);
        kLeadP.push(kP);
      }
      trainState.mV += teV;
      trainState.mP += teP;
      const fV = logLogistic(trainState.mV / kV, site.voc.a);
      const fP = logLogistic(trainState.mP / kP, site.pah.a);
      for (let i = 0; i < beds.length; i++) {
        // fraction of each vessel in use: share of the profile that has passed its inlet
        const upV = i === 0 ? 1 : logLogistic(trainState.mV / kLeadV[i - 1], site.voc.a);
        const dnV = logLogistic(trainState.mV / kLeadV[i], site.voc.a);
        fr.push(Math.max(0, Math.min(1, (upV + dnV) / 2)));
        beds[i].age++;
      }
      trainState.kLeadV = kLeadV[0];
      trainState.kLeadP = kLeadP[0];
      trainState.kV = kV;
      trainState.kP = kP;
      // what an interstage analyser between lead and lag would read (fraction of inlet)
      leadOut = Math.max(logLogistic(trainState.mV / kLeadV[0], site.voc.a), logLogistic(trainState.mP / kLeadP[0], site.pah.a));
      outV = tr.voc * fV;
      outP = tr.pah * fP;
    } else {
      for (let i = 0; i < beds.length; i++) {
        const b = beds[i];
        const share = b.spec.mass / totalMass;
        const qb = tr.Q * share;
        const geo = bedGeometry(site, b.spec, qb);
        b.mV += teV * share;
        b.mP += teP * share;
        // this bed's capacity (scaled by its own mass) against its share of the load
        const kV = m50(site, "voc", tr, tr.voc, tr.voc0, b.spec, geo);
        const kP = m50(site, "pah", tr, tr.pah, tr.pah0, b.spec, geo);
        b.kV = kV;
        b.kP = kP;
        const fV = logLogistic(b.mV / kV, site.voc.a);
        const fP = logLogistic(b.mP / kP, site.pah.a);
        fr.push(Math.max(fV, fP));
        outV += tr.voc * fV * share;
        outP += tr.pah * fP * share;
        b.age++;
      }
    }
    const pahUg = outP * 1000;
    const vRatio = outV / site.elvVOC;
    const pRatio = pahUg / site.elvPAH;
    const mV = site.cautious ? site.voc.band : 1;
    const mP = site.cautious ? site.pah.band : 1;
    win.push([vRatio, pRatio]);
    const nw = Math.max(1, site.triggerWindow || 1);
    if (win.length > nw) win.shift();
    let avV = 0;
    let avP = 0;
    for (let i = 0; i < win.length; i++) {
      avV += win[i][0] / win.length;
      avP += win[i][1] / win.length;
    }
    // Trigger. Default: predicted stack (rolling mean) reaches the trigger fraction of ELV.
    // Interstage (lead/lag only): change when the analyser after the lead reads leadFrac of
    // inlet, with the stack held to a measured backstop instead of the planning margin.
    const inter = arr === "leadlag" && beds.length > 1 && scenario.trigMode === "interstage";
    const stackTrig = inter ? (scenario.backstop || 0.95) : trig;
    const stackHit = avV * mV >= stackTrig || avP * mP >= stackTrig;
    const leadHit = inter && leadOut >= (scenario.leadFrac || 0.5);
    const fired = stackHit || leadHit;
    const firedBy = leadHit && !stackHit ? "Interstage" : avV * mV >= stackTrig ? "VOC" : "PAH";
    daily.push({
      day,
      doy,
      tAmb: tr.tAmb,
      tBed: tr.tBed,
      tSrc: tr.tSrc,
      rhBed: tr.rhBed,
      wet: tr.wetBed,
      voc: outV,
      pah: pahUg,
      vRatio,
      pRatio,
      vHi: vRatio * site.voc.band,
      pHi: pRatio * site.pah.band,
      fr: fr.slice(),
      leadOut,
      tankKg: tr.tankKgDay,
      kw: tr.kwDevices + tr.kwFan,
      change: false,
    });
    if (fired) {
      if (o.noChange) {
        if (firstTrigger === null) firstTrigger = { day, by: firedBy };
        break;
      }
      if (day - lastChange >= 7) {
        let kgChanged = 0;
        let costMult = 0;
        // Partial changeout: replace only the inlet share p of the carbon. The carbon left in
        // keeps the loading that the calibrated profile places beyond the inlet share
        // (same treatment as a lead/lag rotation). Not used with lead/lag.
        const p = arr === "leadlag" ? 1 : Math.max(0.1, Math.min(1, scenario.partialFrac || 1));
        const keepFrac = (m, k, a) => (p >= 1 ? 0 : logLogistic(m / (p * k), a));
        if (arr === "stagger") {
          let idx = 0;
          for (let i = 1; i < beds.length; i++) if (fr[i] > fr[idx]) idx = i;
          const b = beds[idx];
          kgChanged = b.spec.mass * p;
          costMult = (CARBON_TYPES[b.spec.type] || CARBON_TYPES.cx65).costMult * kgChanged;
          beds[idx] = { spec: b.spec, mV: b.mV * keepFrac(b.mV, b.kV, site.voc.a), mP: b.mP * keepFrac(b.mP, b.kP, site.pah.a), age: 0 };
        } else if (p < 1) {
          for (let i = 0; i < beds.length; i++) {
            kgChanged += beds[i].spec.mass * p;
            costMult += (CARBON_TYPES[beds[i].spec.type] || CARBON_TYPES.cx65).costMult * beds[i].spec.mass * p;
          }
          if (series) {
            trainState.mV = trainState.mV * keepFrac(trainState.mV, trainState.kV, site.voc.a);
            trainState.mP = trainState.mP * keepFrac(trainState.mP, trainState.kP, site.pah.a);
          } else {
            beds = beds.map((b) => ({ spec: b.spec, mV: b.mV * keepFrac(b.mV, b.kV, site.voc.a), mP: b.mP * keepFrac(b.mP, b.kP, site.pah.a), age: 0 }));
          }
        } else if (arr === "leadlag" && beds.length > 1) {
          const lead = beds[0];
          kgChanged = lead.spec.mass;
          costMult = (CARBON_TYPES[lead.spec.type] || CARBON_TYPES.cx65).costMult * kgChanged;
          // loading left in the train = what got past the lead
          trainState.mV = trainState.mV * logLogistic(trainState.mV / trainState.kLeadV, site.voc.a);
          trainState.mP = trainState.mP * logLogistic(trainState.mP / trainState.kLeadP, site.pah.a);
          const specs = scenario.beds;
          const moved = beds.slice(1).map((b, i) => ({ spec: specs[i], mV: 0, mP: 0, age: b.age }));
          moved.push({ spec: specs[specs.length - 1], mV: 0, mP: 0, age: 0 });
          beds = moved;
        } else {
          for (let i = 0; i < beds.length; i++) {
            kgChanged += beds[i].spec.mass;
            costMult += (CARBON_TYPES[beds[i].spec.type] || CARBON_TYPES.cx65).costMult * beds[i].spec.mass;
          }
          beds = freshBeds(scenario);
          trainState.mV = 0;
          trainState.mP = 0;
        }
        const cost = site.changeoutFixed + costMult * site.carbonPerKg;
        events.push({ day, doy, kg: kgChanged, cost, by: firedBy, interval: day - (lastChange < 0 ? 0 : lastChange) });
        daily[daily.length - 1].change = true;
        win = [];
        lastChange = day;
      }
    }
  }
  return { daily, events, firstTrigger, totalMass, trains };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function summarise(site, scenario, sim) {
  const n = sim.daily.length;
  const from = Math.max(0, n - 365);
  const yr = sim.daily.slice(from);
  const ev = sim.events.filter((e) => e.day >= from);
  const kg = ev.reduce((s, e) => s + e.kg, 0);
  const carbonCost = ev.reduce((s, e) => s + e.cost, 0);
  const kwh = yr.reduce((s, d) => s + d.kw, 0) * site.hoursPerDay;
  const energyCost = kwh * site.elecPrice;
  const over = yr.filter((d) => d.vRatio > 1 || d.pRatio > 1).length;
  const wet = yr.filter((d) => d.wet).length;
  const highRH = yr.filter((d) => d.rhBed > 70).length;
  const maxV = yr.reduce((m, d) => Math.max(m, d.vRatio), 0);
  const maxP = yr.reduce((m, d) => Math.max(m, d.pRatio), 0);
  const allEv = sim.events;
  const intervals = allEv.slice(1).map((e) => e.interval);
  const ssIntervals = ev.map((e) => e.interval);
  const avgInt = ssIntervals.length ? ssIntervals.reduce((s, x) => s + x, 0) / ssIntervals.length : null;
  const byPAH = ev.filter((e) => e.by === "PAH").length;
  const byInter = ev.filter((e) => e.by === "Interstage").length;
  const onDevs = (scenario.devices || []).filter((d) => d.on !== false);
  const capex = onDevs.reduce((s, d) => s + (d.capex || 0), 0) + (scenario.vesselCapex || 0) + (scenario.trigMode === "interstage" && scenario.arrangement === "leadlag" ? scenario.interCapex || 0 : 0);
  // other running costs (e.g. shift premium for night scheduling), pro rata to months in service
  const otherCost = onDevs.reduce((s, d) => s + ((d.opex || 0) * (d.months ? d.months.filter((x) => x !== false).length : 12)) / 12, 0);
  const tankKgYr = yr.reduce((s, d) => s + (d.tankKg || 0), 0);
  const minTbed = yr.reduce((m, d) => Math.min(m, d.tBed), 99);
  return {
    changeouts: ev.length,
    kg,
    carbonCost,
    kwh,
    energyCost,
    otherCost,
    tankKgYr,
    byInter,
    total: carbonCost + energyCost + otherCost,
    over,
    wet,
    highRH,
    maxV,
    maxP,
    avgInt,
    intervals,
    byPAH,
    capex,
    minTbed,
    events: ev,
    year: yr,
  };
}

export function lifeByMonth(site, scenario) {
  const res = [];
  for (let m = 0; m < 12; m++) {
    const sim = simulate(site, scenario, { startDoy: MID[m] - 14, noChange: true, maxDays: 400 });
    const ft = sim.firstTrigger;
    res.push(ft ? { days: ft.day, by: ft.by } : { days: 400, by: "none" });
  }
  return res;
}

// Capacity breakdown on a given day: what each factor does to lead-bed capacity vs baseline
export function capacityBreakdown(site, scenario, baseline, doy) {
  const tr = runTrain(site, scenario, doy);
  const tb = runTrain(site, baseline, doy);
  const b0 = baseline.beds[0];
  const geo0 = bedGeometry(site, b0, tb.Q);
  const lead = scenario.beds[0];
  const series = scenario.arrangement === "leadlag" || scenario.arrangement === "seriesall";
  const totalMass = scenario.beds.reduce((s, b) => s + b.mass, 0);
  const share = series ? 1 : lead.mass / totalMass;
  const geo = bedGeometry(site, lead, tr.Q * share);
  const p = site.voc;
  const th = site.thetaBed;
  const tEff = Math.max(tr.tBed, Math.min(site.tFloor, tr.tSrc));
  const tEff0 = Math.max(tb.tBed, Math.min(site.tFloor, tb.tSrc));
  const ct = CARBON_TYPES[lead.type] || CARBON_TYPES.cx65;
  const items = [];
  items.push({ k: "Bed temperature", f: Math.exp((-th * p.b * (tEff - tEff0)) / p.a) });
  items.push({ k: "Humidity", f: fRH(tr.rhBed, site.rhOnset, p.rhK * ct.rhMult) / fRH(tr.rhBase, site.rhOnset, p.rhK) });
  const massF = series ? totalMass / b0.mass : totalMass / b0.mass;
  items.push({ k: "Carbon quantity", f: massF });
  items.push({ k: "Carbon type", f: ct.capVOC });
  items.push({ k: "Contact time / MTZ", f: geo.uRatio / geo0.uRatio });
  items.push({ k: "Inlet concentration", f: Math.pow(tr.voc / tb.voc, site.freundlich) });
  items.push({ k: "Load removed upstream", f: (tb.voc * tb.Q) / Math.max(1e-9, tr.voc * tr.Q) });
  let tot = 1;
  for (let i = 0; i < items.length; i++) tot *= items[i].f;
  return { items, total: tot, tr, tb, geo };
}

export function warningsFor(site, scenario, summ, life) {
  const w = [];
  const devs = (scenario.devices || []).filter((d) => d.on !== false);
  const coldDays = summ.year.filter((d) => d.tBed < site.tFloor && d.tBed < d.tSrc - 0.5).length;
  if (coldDays > 0) w.push({ lvl: "amber", t: "Cooling takes the bed below " + site.tFloor + " C on " + coldDays + " days a year (min " + summ.minTbed.toFixed(1) + " C). The calibration covers stack temperatures of about 16-33 C, so no extra temperature benefit is credited below " + site.tFloor + " C." });
  if (summ.wet > 0) w.push({ lvl: "red", t: summ.wet + " days a year the gas reaches the bed at or above its dew point (condensation in the carbon). Add reheat or move the cooler before the fan." });
  else if (summ.highRH > 0) w.push({ lvl: "amber", t: summ.highRH + " days a year with bed RH above 70%. Water will take carbon capacity; consider a little reheat." });
  if (devs.some((d) => d.type === "dcwbc" || d.type === "condenser") && scenario.beds.length < 2) w.push({ lvl: "amber", t: "Single chiller, single bed: a chiller trip exposes the bed to saturated or warm gas with no backstop. Keep the second vessel as lead/lag." });
  if (summ.over > 0) w.push({ lvl: summ.over > 5 ? "red" : "amber", t: summ.over + " day(s) a year predicted above an ELV at the central estimate: hot spells push the stack past the limit before the trigger is reached. Plan changeouts ahead of forecast heat, or lower the trigger." });
  if (life && life.some((x) => x.days >= 120)) w.push({ lvl: "info", t: "Some bed lives exceed ~120 days, i.e. loadings beyond the largest tested bed (1,016 t). Treat as extrapolation; confirm by stack test before relying on it." });
  if (summ.byPAH > 0) w.push({ lvl: "info", t: summ.byPAH + " of the year's changeouts are triggered by PAH (temperature), not VOC capacity." });
  if (devs.some((d) => d.type === "vsd")) w.push({ lvl: "info", t: "VSD energy saving assumes the fan absorbs " + site.fanPower0 + " kW today (cube law). Confirm from the motor current before using the payback." });
  if (devs.some((d) => d.type === "vsd" && d.flow < site.flow0 * 0.55)) w.push({ lvl: "amber", t: "Flow below ~55% of current: check capture velocity at every extraction point before relying on this." });
  const tb = tankBaseline(site);
  if (tb.overflow.length) w.push({ lvl: "red", t: "Tank inputs give more " + tb.overflow.join(", ") + " than the assumed carbon inlet holds. Lower the tank sweep / headspace inputs or raise the inlet composition - the two must be consistent." });
  if (devs.some((d) => d.type === "vapbal" || d.type === "tankvent" || d.type === "ventcond")) w.push({ lvl: "info", t: "Tanks send ~" + tb.totKgDay.toFixed(1) + " kg/day to the carbon today (" + Math.round(tb.share * 100) + "% of the inlet load, " + Math.round(tb.sharePAH * 100) + "% of the PAH): work tanks " + tb.workKgDay.toFixed(1) + " kg/day, storage " + tb.storKgDay.toFixed(1) + " kg/day. The vent sweep flows (work " + site.tankWorkSweep + ", storage " + site.tankStorSweep + " m3/h) are assumed - measure the velocity in each tank vent branch." });
  if (devs.some((d) => d.type === "tankvent")) w.push({ lvl: "amber", t: "Tank vent dampers change how the tanks are protected against over/under-pressure (including the cylinder returns and steam heating) and how fugitive vapour is captured. Size the P/V valves to the fill/return rate and thermal breathing, and check against the COMAH Safety Report and permit before installing." });
  if (devs.some((d) => d.type === "ventcond")) w.push({ lvl: "amber", t: "Vent condenser: condensate (naphthalene solidifies below 80 C) can block a cold vent line. Keep the condenser and drain trace-heated above ~85 C on the condensate side or design for melt-out, and never let it restrict tank venting." });
  if ((scenario.partialFrac || 1) < 1 && scenario.arrangement !== "leadlag") w.push({ lvl: "amber", t: "Partial changeout leaves part-loaded carbon at the outlet side. The model counts its loading against the whole bed but not where it sits; in practice the outlet carbon can bleed slowly. Confirm with an outlet test in the week after the first partial change." });
  if (scenario.trigMode === "interstage" && scenario.arrangement === "leadlag") {
    if (summ.byInter === 0 && summ.changeouts > 0) w.push({ lvl: "info", t: "Every changeout is still set by the stack backstop, not the interstage reading: with the site-calibrated breakthrough curve the lead is only part-loaded when the stack nears the ELV. The gain here comes from running the stack to the measured " + Math.round((scenario.backstop || 0.95) * 100) + "% backstop instead of the 80% planning trigger." });
    w.push({ lvl: "amber", t: "Interstage trigger relies on a working analyser (PID/FID) between the beds and a stack backstop you can see. Without continuous stack data, keep the planning trigger." });
  }
  if (devs.some((d) => d.type === "fanmove")) w.push({ lvl: "info", t: "Fan after bed removes " + site.fanHeat0 + " C of fan heat at the bed (Operation assumptions). Check the bed vessel and demister for suction duty, and that the fan is happy on clean, cooler gas." });
  if (devs.some((d) => d.type === "schedule")) w.push({ lvl: "info", t: "Scheduling benefit uses estimated day-night temperature ranges (Climate table) and assumes the moved steps carry the stated share of the day's emission load. A week of continuous stack temperature would firm this up." });
  return w;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export function dev(type, over) {
  return Object.assign({ id: newId(), type, on: true }, DEVICE_TYPES[type].defaults, over || {});
}

function bed(mass, type) {
  return { id: newId(), mass: mass || 6000, type: type || "cx65" };
}

export function presetScenarios() {
  return [
    { id: "baseline", name: "Baseline - current system", locked: true, arrangement: "single", beds: [bed()], devices: [], vesselCapex: 0 },
    { id: newId(), name: "Lead/lag - 2 x 6 t", arrangement: "leadlag", beds: [bed(), bed()], devices: [], vesselCapex: 0 },
    { id: newId(), name: "VSD to nameplate flow", arrangement: "single", beds: [bed()], devices: [dev("vsd")], vesselCapex: 0 },
    { id: newId(), name: "DCWBC + lead/lag", arrangement: "leadlag", beds: [bed(), bed()], devices: [dev("dcwbc"), dev("reheat", { dT: 3 })], vesselCapex: 0 },
    { id: newId(), name: "Lead/lag + condenser 6 C", arrangement: "leadlag", beds: [bed(), bed()], devices: [dev("condenser"), dev("reheat", { dT: 3 })], vesselCapex: 0 },
    { id: newId(), name: "Condenser 6 C + reheat + VSD", arrangement: "single", beds: [bed()], devices: [dev("vsd"), dev("condenser"), dev("reheat", { dT: 5 })], vesselCapex: 0 },
  ].concat(extraPresets());
}

// Added 23 Nov 2026: tank vents/deliveries, scheduling, fan position, interstage, partial changeout
export function extraPresets() {
  return [
    { id: newId(), name: "Work tank vent condenser 35 C", arrangement: "single", beds: [bed()], devices: [dev("ventcond")], vesselCapex: 0 },
    { id: newId(), name: "Tank vent dampers + work tank vent condenser", arrangement: "single", beds: [bed()], devices: [dev("tankvent"), dev("ventcond")], vesselCapex: 0 },
    { id: newId(), name: "Single bed - change top half", arrangement: "single", partialFrac: 0.5, beds: [bed()], devices: [], vesselCapex: 0 },
    { id: newId(), name: "Fan after bed + summer scheduling", arrangement: "single", beds: [bed()], devices: [dev("fanmove"), dev("schedule", { months: MONTHS.map((x, i) => i >= 4 && i <= 8) })], vesselCapex: 0 },
    { id: newId(), name: "Lead/lag + tank dampers + vent condenser + fan after bed + summer scheduling", arrangement: "leadlag", beds: [bed(), bed()], devices: [dev("tankvent"), dev("ventcond"), dev("fanmove"), dev("schedule", { months: MONTHS.map((x, i) => i >= 4 && i <= 8) })], vesselCapex: 0 },
  ];
}

export function blankScenario(name) {
  return { id: newId(), name: name || "New trial", arrangement: "single", beds: [bed()], devices: [], vesselCapex: 0 };
}

export function newBed(mass, type) {
  return bed(mass, type);
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_MID = MID;
