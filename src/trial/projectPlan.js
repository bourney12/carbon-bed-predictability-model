// projectPlan.js - project explanation and delivery plan for any Trial Mode trial.
// Pure functions, ASCII source. A trial's plan is assembled from work packages, one per
// change the trial makes (arrangement, carbon, operating practice, each device), plus a
// common front end (confirm the basis, capex approval) and a verification close-out.
//
// Durations are typical UK industrial lead times in weeks, for planning only. They should
// be replaced with supplier quotes as each package is developed.

import { DEVICE_TYPES, ARRANGEMENTS, CARBON_TYPES } from "./trialEngine.js";

// Measurements that confirm the basis of a package (keys used in WP.needs).
export const MEASUREMENTS = {
  inlet: { title: "Carbon-inlet VOC and PAH test", detail: "MCERTS test before the carbon bed (Cura Terrae / Envirocare). Sets the size of any condenser, vent or source work and the real tank share of the load.", weeks: 6 },
  vents: { title: "Tank vent branch flows and temperatures", detail: "Velocity traverse or anemometer on each work-tank and storage-tank vent branch, plus headspace and vent-junction temperatures.", weeks: 3 },
  fanI: { title: "Fan motor current (clamp meter)", detail: "Running current on each phase with voltage and power factor, to confirm the ~14 kW fan power.", weeks: 1 },
  temps: { title: "Gas temperatures with both plants running", detail: "Testo before fan, after fan, after demister, after bed and outside air, with both plants running. Repeat on a warm afternoon.", weeks: 2 },
  rh: { title: "Humidity before and after the demister and at the bed inlet", detail: "RH and temperature at the same points, to see how much water reaches the carbon.", weeks: 1 },
  bed: { title: "Carbon vessel dimensions, bed depth and pressure drop", detail: "From the Forbes vessel drawing and a dP reading across the bed. Needed for velocity, MTZ and fan duty.", weeks: 2 },
  lev: { title: "LEV capture check at every extraction point", detail: "Hood face / capture velocities at current fan speed (latest COSHH TExT), as the reference before any flow change.", weeks: 2 },
  droplets: { title: "Mist carry-over check", detail: "Inspect the carbon inlet face and the demister drain at the next changeout; note liquid on the carbon.", weeks: 1 },
};

const PHASE_ORDER = ["define", "approve", "procure", "install", "commission", "verify"];
export const PHASE_LABEL = {
  define: "Define and design",
  approve: "MOC and approvals",
  procure: "Procure / fabricate",
  install: "Install",
  commission: "Commission",
  verify: "Verify benefit",
  implement: "Implement",
};

// Standard approvals text.
const A = {
  moc: "Management of Change (MOC) with HAZOP or What-If review",
  dsear: "DSEAR / ATEX assessment and zoning update",
  comah: "Check against the COMAH Safety Report (major accident scenarios, safety-critical equipment)",
  ea: "Confirm with the EA site officer whether permit EPR/A2/1 needs notification or a variation before commissioning",
  coshh: "COSHH / LEV: capture at every extraction point re-tested (TExT)",
  waste: "Waste and effluent route for creosote-contaminated condensate or water (hazardous waste)",
  capex: "Capex approval (CAPEX register 2027-2029)",
  prod: "Production agreement (Production Director)",
  elec: "Electrical supply and isolation design (P&W Electrical)",
  struct: "Structural / foundation check",
};

// ---------------------------------------------------------------------------
// Work package library
// ---------------------------------------------------------------------------
// Each entry: title, what, why, scope[], phases{phase: weeks}, shutdownDays, approvals[], safety[],
// risks[], verify, owner, needs[], hardware (true = needs an installation window).

const LIB = {
  leadlag: {
    title: "Second carbon vessel in series (lead/lag)",
    what: "Add a second carbon vessel downstream of the existing one, with dampers so the gas can pass lead then lag, and a sample point between them.",
    why: "The lag bed catches breakthrough from the lead, so the lead can be run much closer to saturation before it is emptied. More of each carbon fill is used and the stack is protected while the lead is changed.",
    scope: [
      "Size the second vessel to match the existing 6 t bed (velocity, depth, pressure drop)",
      "Interconnecting ductwork, isolation and diverter dampers to swap lead and lag, interstage sample port",
      "Foundation / plinth and access platform",
      "Check the fan can take the extra bed pressure drop at the current speed",
      "Operating procedure for rotation: empty lead, swap flow order, refill",
    ],
    phases: { define: 4, approve: 3, procure: 14, install: 2, commission: 1, verify: 3 },
    shutdownDays: 3,
    approvals: [A.moc, A.dsear, A.struct, A.ea],
    safety: ["Confined-space entry and carbon handling for two vessels", "Self-heating of loaded carbon: temperature watch on the lag bed and at rotation"],
    risks: ["Fan cannot overcome the extra pressure drop at the current speed (may need the VSD or a fan change)", "Vessel lead time"],
    verify: "Interstage sample at mid-life and a stack test after the first rotation.",
    owner: "Engineering",
    contractors: "Vessel supplier (e.g. Forbes Technologies), ductwork and civils contractors",
    needs: ["bed"],
    hardware: true,
  },
  parallel: {
    title: "Additional carbon vessel in parallel",
    what: "Add a second vessel alongside the existing one and split the gas between them.",
    why: "Halves the gas velocity through each bed, which shortens the mass transfer zone and uses more of the carbon before breakthrough.",
    scope: [
      "Size the second vessel and balancing dampers so flow splits evenly",
      "Ductwork split and recombine, isolation dampers on each vessel",
      "Foundation and access",
      "Changeout procedure (together or staggered)",
    ],
    phases: { define: 4, approve: 3, procure: 14, install: 2, commission: 1, verify: 3 },
    shutdownDays: 3,
    approvals: [A.moc, A.dsear, A.struct, A.ea],
    safety: ["Confined-space entry and carbon handling for two vessels"],
    risks: ["Uneven flow split (balance at commissioning)", "Vessel lead time"],
    verify: "Flow traverse on each branch at commissioning; stack test at mid-life.",
    owner: "Engineering",
    contractors: "Vessel supplier, ductwork and civils contractors",
    needs: ["bed"],
    hardware: true,
  },
  bedmass: {
    title: "Change the carbon fill mass",
    what: "Fill the vessel with a different mass of carbon.",
    why: "More carbon gives more capacity per fill; it also raises pressure drop and depth.",
    scope: ["Confirm the vessel volume and support grid can take the new fill", "Check pressure drop and fan duty", "Update the changeout order quantity"],
    phases: { define: 2, approve: 1, implement: 2, verify: 4 },
    shutdownDays: 0,
    atChangeout: true,
    approvals: [A.moc],
    safety: [],
    risks: ["Higher pressure drop reduces extraction flow"],
    verify: "dP and flow after the next fill; stack test at mid-life.",
    owner: "Engineering",
    contractors: "Carbon supplier",
    needs: ["bed"],
    hardware: false,
  },
  carbon: {
    title: "Change carbon grade",
    what: "Switch the fill to a different carbon grade at the next changeout.",
    why: "Grades differ in capacity for light VOC and 3-ring PAH and in humidity tolerance.",
    scope: ["Supplier isotherm data and CoA for creosote vapours (naphthalene, methylnaphthalenes, 3-ring PAH)", "Price per tonne and supply lead time", "Order for the next changeout"],
    phases: { define: 3, approve: 1, implement: 2, verify: 8 },
    shutdownDays: 0,
    atChangeout: true,
    approvals: [A.moc],
    safety: ["Supplier safety data: self-heating and ignition temperature of the new grade"],
    risks: ["Indicative capacity factors are not site-proven until a full bed life is run"],
    verify: "Compare the first full bed life and stack tests with the model; update the carbon factor.",
    owner: "Engineering",
    contractors: "Carbon supplier",
    needs: [],
    hardware: false,
  },
  partial: {
    title: "Partial (inlet-layer) changeout",
    what: "Replace only the inlet layer of the bed at each changeout.",
    why: "Most of the loading sits in the inlet layer; the outlet carbon is part-used and can stay.",
    scope: ["Method statement for removing a set depth (vacuum extraction to a depth marker)", "Layer marker or mesh at the set depth", "Outlet test regime after each partial change"],
    phases: { define: 2, approve: 2, implement: 2, verify: 4 },
    shutdownDays: 0,
    atChangeout: true,
    approvals: [A.moc, A.ea],
    safety: ["Confined-space entry; dust and self-heating while part of the bed is disturbed"],
    risks: ["Outlet carbon can bleed slowly; the model does not include this"],
    verify: "Outlet (stack) test in the week after the first partial change.",
    owner: "Engineering",
    contractors: "Carbon changeout contractor",
    needs: ["bed"],
    hardware: false,
  },
  interstage: {
    title: "Interstage VOC analyser (lead/lag)",
    what: "Continuous VOC analyser between the lead and lag beds to trigger lead changeouts.",
    why: "Changes the lead on measured breakthrough rather than a calendar, with the stack held to a backstop.",
    scope: ["Analyser selection (FID or PID), sample line and conditioning", "Cabinet, power and data to the app", "Calibration gas and maintenance regime"],
    phases: { define: 3, approve: 2, procure: 10, install: 1, commission: 2, verify: 8 },
    shutdownDays: 1,
    approvals: [A.moc, A.dsear, A.elec],
    safety: ["An FID needs a hydrogen fuel supply: DSEAR for the gas store and cabinet"],
    risks: ["With the site breakthrough curve the stack backstop usually fires first, so the gain is small until the inlet test confirms otherwise"],
    verify: "Compare analyser readings with an interstage spot test.",
    owner: "Engineering",
    contractors: "Analyser supplier, P&W Electrical",
    needs: ["inlet"],
    hardware: true,
  },
  condenser: {
    title: "Chilled condenser before the carbon",
    what: "Glycol-chilled coil in the duct that cools the gas to the set temperature so naphthalene, heavier PAH and water condense out before the carbon.",
    why: "Removes part of the load before it reaches the carbon, and dries the gas so the bed humidity falls.",
    scope: [
      "Heat and condensate load from the inlet test; coil and chiller sizing",
      "Naphthalene freezes below 80 C: duplex coils or melt-out cycle, heated drain",
      "Condensate collection and disposal route",
      "Chiller, glycol circuit, controls and electrical supply",
      "Interlock: carbon bed stays in service if the chiller trips (single point of failure)",
    ],
    phases: { define: 5, approve: 3, procure: 12, install: 2, commission: 2, verify: 6 },
    shutdownDays: 3,
    approvals: [A.moc, A.dsear, A.waste, A.elec, A.ea],
    safety: ["Hazardous condensate handling", "Chiller refrigerant (F-gas)"],
    risks: ["Coil fouling by solid naphthalene", "Fog formation reduces capture", "Chiller energy cancels much of the carbon saving at 0.25 GBP/kWh"],
    verify: "Condensate collected per week, bed-inlet temperature and RH, then a stack test.",
    owner: "Engineering",
    contractors: "Refrigeration contractor, ductwork contractor, P&W Electrical",
    needs: ["inlet", "rh"],
    hardware: true,
  },
  dcwbc: {
    title: "Direct-contact water bath cooler (DCWBC)",
    what: "Gas bubbles through chilled water (C&G-ABT-SPEC-001), cooling it and capturing mist and some condensables.",
    why: "Cools the gas reaching the carbon; adsorption capacity rises as temperature falls, particularly for PAH.",
    scope: [
      "Vessel design to C&G-ABT-SPEC-001 (Octowood precedent drawing 15-1007778-103)",
      "Chiller and water circuit; water treatment",
      "Downstream reheat (fan or waste heat) to bring RH down",
      "Contaminated water handling and disposal",
      "Recalibrate the +10.3 C thermal offset after installation",
    ],
    phases: { define: 6, approve: 4, procure: 16, install: 3, commission: 2, verify: 6 },
    shutdownDays: 4,
    approvals: [A.moc, A.dsear, A.waste, A.elec, A.struct, A.ea, "Legionella (L8) risk assessment for the water system"],
    safety: ["Creosote-contaminated water", "Single chiller is a single point of failure: keep the carbon as the backstop"],
    risks: ["Gas leaves saturated: without reheat the bed RH rises", "Pressure drop ~1.2 kPa on an already overspeed fan"],
    verify: "Bed-inlet temperature and RH logging, then a stack test; recalibrate the thermal offset in the app.",
    owner: "Engineering",
    contractors: "Vessel fabricator, refrigeration contractor, P&W Electrical",
    needs: ["inlet", "rh", "temps"],
    hardware: true,
  },
  cooler: {
    title: "Gas cooler (air or cooling water)",
    what: "Heat exchanger in the duct without a chiller, bringing the gas part-way to ambient.",
    why: "Lower gas temperature raises carbon capacity, without refrigeration energy.",
    scope: ["Duty and approach temperature", "Exchanger, cleaning access and condensate drain", "Ductwork tie-in"],
    phases: { define: 3, approve: 2, procure: 10, install: 1, commission: 1, verify: 4 },
    shutdownDays: 2,
    approvals: [A.moc, A.dsear, A.waste],
    safety: ["Condensate may contain creosote"],
    risks: ["Little cooling on hot days, when it matters most"],
    verify: "Bed-inlet temperature logging through a warm spell.",
    owner: "Engineering",
    contractors: "Ductwork / exchanger supplier",
    needs: ["temps"],
    hardware: true,
  },
  reheat: {
    title: "Reheater after cooling",
    what: "Duct heater after the cooler or condenser to lower the relative humidity at the bed.",
    why: "Each 1 C of reheat lowers RH by about 6%, keeping water off the carbon.",
    scope: ["Heater sizing for the target RH", "Prefer fan or waste heat over electric", "Controls on bed-inlet RH"],
    phases: { define: 2, approve: 2, procure: 6, install: 1, commission: 1, verify: 4 },
    shutdownDays: 1,
    approvals: [A.moc, A.dsear, A.elec],
    safety: ["Hot surface in a creosote vapour stream: surface temperature class under DSEAR"],
    risks: ["Electric reheat costs more than it saves"],
    verify: "Bed-inlet RH below ~50-60%.",
    owner: "Engineering",
    contractors: "P&W Electrical",
    needs: ["rh"],
    hardware: true,
    with: ["condenser", "dcwbc", "cooler"],
  },
  demister: {
    title: "High-efficiency mist eliminator",
    what: "Fibre-bed coalescer added to, or replacing, the existing demister.",
    why: "Stops creosote mist landing on the carbon inlet face, where it blinds the carbon and carries heavy PAH.",
    scope: ["Mist load and droplet size", "Element selection and housing", "Drain and pressure-drop monitoring"],
    phases: { define: 2, approve: 2, procure: 8, install: 1, commission: 1, verify: 3 },
    shutdownDays: 2,
    approvals: [A.moc, A.waste],
    safety: ["Element changeout: creosote-soaked waste"],
    risks: ["Pressure drop rises as the element loads"],
    verify: "Drain volume, dP trend and inspection of the carbon inlet face at the next changeout.",
    owner: "Engineering",
    contractors: "Mist eliminator supplier",
    needs: ["droplets", "rh"],
    hardware: true,
  },
  vsd: {
    title: "Fan VSD to nameplate speed",
    what: "Variable speed drive on the main fan motor, set back from the current overspeed (~68% above nameplate) towards the target flow.",
    why: "Fan heat rises with flow squared, so slowing the fan cuts the ~4 C it adds before the carbon, and saves fan energy (~14 kW today).",
    scope: [
      "Fan curve and system curve; target flow",
      "VSD panel, EMC cabling and motor suitability",
      "Step the speed down while checking capture at every extraction point",
    ],
    phases: { define: 2, approve: 2, procure: 6, install: 1, commission: 2, verify: 6 },
    shutdownDays: 1,
    approvals: [A.moc, A.coshh, A.elec, A.ea],
    safety: ["Lower flow must not reduce capture at any extraction point below its design velocity: workplace exposure comes first"],
    risks: ["Capture at the furthest points may set a higher minimum flow than the target"],
    verify: "LEV capture test at each point at the new speed, flow traverse, stack test at reduced flow.",
    owner: "Engineering",
    contractors: "P&W Electrical, LEV examiner",
    needs: ["fanI", "lev"],
    hardware: true,
  },
  source: {
    title: "Source reduction on the process",
    what: "Stop vapour at the source before it reaches the extraction: vacuum-line condenser, cylinder door practice, lower working temperatures.",
    why: "Less vapour generated means less load on the carbon.",
    scope: ["Rank sources from the inlet test and process knowledge", "Engineering changes (e.g. vacuum-line condenser)", "Operating practice changes and operator training"],
    phases: { define: 4, approve: 2, procure: 8, install: 2, commission: 1, verify: 6 },
    shutdownDays: 2,
    approvals: [A.moc, A.prod, A.dsear],
    safety: ["Any change to treatment temperature or cycle must keep treatment quality"],
    risks: ["Effect is uncertain until the inlet test separates process and tank load"],
    verify: "Inlet test before and after.",
    owner: "Engineering with Production",
    contractors: "As required",
    needs: ["inlet"],
    hardware: true,
  },
  vapbal: {
    title: "Vapour balancing on tanker deliveries",
    what: "Return line from the storage tank headspace to the road tanker during offloading.",
    why: "Vapour displaced while filling goes back to the tanker instead of the extraction.",
    scope: ["Return line and dry-break coupling at the offload point", "Agreement with the supplier and haulier", "Offload procedure"],
    phases: { define: 2, approve: 3, procure: 6, install: 1, commission: 1, verify: 2 },
    shutdownDays: 0,
    approvals: [A.moc, A.dsear, "Supplier / haulier agreement for vapour return"],
    safety: ["ADR tanker connection and earthing"],
    risks: ["Modelled benefit is close to zero (~34 kg/yr): low priority for carbon life"],
    verify: "Observe the first balanced delivery.",
    owner: "Engineering",
    contractors: "Pipework contractor",
    needs: [],
    hardware: true,
  },
  tankvent: {
    title: "Tank vent dampers and pressure/vacuum valves",
    what: "Stop the extraction pulling air continuously through the tank headspaces. Vents stay connected but open only on pressure (filling, returns, breathing).",
    why: "Each m3/h of air swept through a work tank at 116 C carries about 7 times the vapour of a storage vent. Cutting the sweep removes that load from the carbon.",
    scope: [
      "Measure each vent branch flow first",
      "Damper and P/V valve on each vent, sized to tank design pressure and vacuum ratings",
      "Flame arresters where required",
      "Confirm displaced vapour still reaches abatement",
    ],
    phases: { define: 3, approve: 4, procure: 8, install: 1, commission: 1, verify: 4 },
    shutdownDays: 1,
    approvals: [A.moc, A.dsear, A.comah, A.ea],
    safety: [
      "Work tanks at 116 C are above the creosote flash point. Without the air sweep the headspace may sit within the flammable range: DSEAR zoning, ignition sources, flame arresters and possibly nitrogen blanketing must be settled before the sweep is cut",
      "Tank over- and under-pressure protection",
    ],
    risks: ["Benefit depends on the vent flows, which are not yet measured"],
    verify: "Vent flows and tank pressures after the change; carbon life against the model.",
    owner: "Process Safety with Engineering",
    contractors: "Valve supplier, pipework contractor",
    needs: ["vents"],
    hardware: true,
  },
  ventcond: {
    title: "Work tank vent condenser",
    what: "Small water-cooled condenser on the tank vent line before it joins the main duct, draining back to the tank.",
    why: "Hot, concentrated, low-flow vent gas is where condensing works best. It removes about 88% of the vent PAH.",
    scope: [
      "Size from the measured vent flow and headspace temperature",
      "Naphthalene freezes below 80 C: trace-heated drain or melt-out",
      "Condensate return to the tank",
    ],
    phases: { define: 4, approve: 3, procure: 10, install: 2, commission: 1, verify: 4 },
    shutdownDays: 2,
    approvals: [A.moc, A.dsear, A.comah],
    safety: ["Hot creosote condensate; trace heating in a hazardous area"],
    risks: ["Little effect on light VOC", "Drain blockage by solid naphthalene"],
    verify: "Condensate returned per week; carbon life against the model.",
    owner: "Engineering",
    contractors: "Exchanger supplier, pipework contractor, P&W Electrical",
    needs: ["vents", "inlet"],
    hardware: true,
  },
  schedule: {
    title: "Schedule heavy-emission steps for cooler hours",
    what: "Move vacuum releases, door openings and transfers out of the warm part of the day in the months selected.",
    why: "The mass is unchanged but it reaches the carbon when the gas is cooler, which helps PAH most on hot days.",
    scope: ["Identify the heavy steps by charge stage", "Agree a summer schedule with Production", "Update SOPs and brief operators"],
    phases: { define: 2, approve: 2, implement: 3, verify: 12 },
    shutdownDays: 0,
    approvals: [A.prod, A.moc],
    safety: [],
    risks: ["Production impact; benefit rests on an estimated day-night range"],
    verify: "Hot-day PAH warnings and the summer stack test.",
    owner: "Production with Engineering",
    contractors: "None",
    needs: ["temps"],
    hardware: false,
    seasonal: true,
  },
  fanmove: {
    title: "Move the fan after the carbon bed",
    what: "Relocate the main fan (or re-route the ductwork) so it draws gas through the demister and carbon and discharges to the stack.",
    why: "The fan adds 4.0 C (measured 24 Nov 2026). After the bed, that heat goes up the stack instead of into the carbon, so the bed runs about 4 C cooler all year.",
    scope: [
      "Layout: fan position, ductwork re-route, fan base and anti-vibration mounts",
      "Check the demister and carbon vessel for suction (door and hatch seals, vessel rating)",
      "Fan duty with the bed now on the suction side",
      "Stack connection",
    ],
    phases: { define: 6, approve: 4, procure: 8, install: 2, commission: 1, verify: 3 },
    shutdownDays: 5,
    approvals: [A.moc, A.dsear, A.struct, A.ea],
    safety: ["Demister and carbon vessel under suction: leaks draw air in rather than push fumes out", "Fan then handles cleaned gas: less creosote condensate in the casing (update DSEAR zone)"],
    risks: ["Gain up to ~1 C lower than modelled if the demister sheds less heat with cooler gas", "Shutdown length"],
    verify: "Testo readings before and after the bed, then a stack test.",
    owner: "Engineering",
    contractors: "Ductwork contractor, fan specialist, P&W Electrical",
    needs: ["temps", "bed"],
    hardware: true,
  },
  custom: {
    title: "Custom device",
    what: "A device defined in the trial builder.",
    why: "Effect as entered: removal, temperature and moisture change.",
    scope: ["Specify the device", "Supplier quotes", "Installation and tie-in"],
    phases: { define: 4, approve: 3, procure: 10, install: 2, commission: 1, verify: 4 },
    shutdownDays: 2,
    approvals: [A.moc, A.dsear],
    safety: [],
    risks: ["Effect is user-entered and not site-proven"],
    verify: "Measure the effect after commissioning.",
    owner: "Engineering",
    contractors: "As required",
    needs: [],
    hardware: true,
  },
};

export function workPackageLibrary() {
  return LIB;
}

// ---------------------------------------------------------------------------
// Which work packages a trial needs
// ---------------------------------------------------------------------------
export function packagesFor(scenario, baseMass) {
  const out = [];
  const beds = scenario.beds || [];
  const arr = scenario.arrangement || "single";
  const add = (key, extra) => out.push(Object.assign({ key, capex: 0, opex: 0 }, LIB[key], extra || {}));
  if (beds.length > 1 && (arr === "leadlag" || arr === "seriesall")) {
    add("leadlag", { capex: scenario.vesselCapex || 0, vesselUncosted: !(scenario.vesselCapex > 0), title: (beds.length > 2 ? (beds.length - 1) + " extra carbon vessels in series" : LIB.leadlag.title) });
  } else if (beds.length > 1) {
    add("parallel", { capex: scenario.vesselCapex || 0, vesselUncosted: !(scenario.vesselCapex > 0) });
  }
  const bm = baseMass || 6000;
  if (beds.some((b) => Math.abs((b.mass || bm) - bm) > 1)) add("bedmass");
  const grades = Array.from(new Set(beds.map((b) => b.type || "cx65"))).filter((t) => t !== "cx65");
  if (grades.length) add("carbon", { what: "Switch the fill to " + grades.map((g) => (CARBON_TYPES[g] ? CARBON_TYPES[g].label : g)).join(" / ") + " at the next changeout." });
  if ((scenario.partialFrac || 1) < 1 && arr !== "leadlag") add("partial", { what: "Replace only the inlet " + Math.round((scenario.partialFrac || 1) * 100) + "% of the bed at each changeout." });
  if (scenario.trigMode === "interstage" && arr === "leadlag") add("interstage", { capex: scenario.interCapex || 0 });
  (scenario.devices || []).filter((d) => d.on !== false).forEach((d) => {
    const lib = LIB[d.type] || LIB.custom;
    const extra = { capex: d.capex || 0, opex: d.opex || 0, deviceId: d.id };
    if (d.type === "custom") extra.title = d.name || "Custom device";
    if (d.type === "condenser") extra.what = "Glycol-chilled coil in the duct that cools the gas to " + d.tOut + " C so naphthalene, heavier PAH and water condense out before the carbon.";
    if (d.type === "vsd") extra.what = "Variable speed drive on the main fan, set to about " + Math.round(d.flow || 0).toLocaleString("en-GB") + " m3/h (from ~9,500 today, ~68% above nameplate speed).";
    if (d.type === "reheat") extra.what = "Duct heater adding about " + d.dT + " C after cooling, to lower the relative humidity at the bed.";
    if (d.type === "schedule" && d.months) {
      const on = d.months.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
      if (on.length && on.length < 12) extra.months = on;
    }
    if (DEVICE_TYPES[d.type] && d.type !== "custom") extra.label = DEVICE_TYPES[d.type].label;
    out.push(Object.assign({ key: lib === LIB.custom ? "custom" : d.type, opex: 0 }, lib, extra));
  });
  return out;
}

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
// opts: { combined (one shutdown for all hardware, default true), startDate (Date) }
export function buildPlan(scenario, opts) {
  const o = opts || {};
  const combined = o.combined !== false;
  const start = o.startDate ? new Date(o.startDate) : new Date();
  const wps = packagesFor(scenario, o.baseMass);
  if (!wps.length) {
    return { empty: true, wps: [], rows: [], measurements: [], approvals: [], weeks: 0, start, end: start, capex: 0, shutdownDays: 0 };
  }
  // Phase 0: measurements the packages rely on (run in parallel; longest sets the end).
  const needKeys = Array.from(new Set(wps.reduce((a, w) => a.concat(w.needs || []), [])));
  const measurements = needKeys.map((k) => Object.assign({ key: k }, MEASUREMENTS[k])).filter((m) => m.title);
  const p0 = measurements.length ? Math.max.apply(null, measurements.map((m) => m.weeks)) : 0;
  const capexTotal = wps.reduce((s, w) => s + (w.capex || 0), 0);
  // Any hardware needs capex approval, including a vessel whose cost has not been entered yet.
  const needCapex = wps.some((w) => w.hardware);
  const capexStart = p0;
  const capexEnd = needCapex ? p0 + 4 : p0;

  const rows = [];
  if (p0) rows.push({ id: "p0", title: "Confirm the basis (measurements)", kind: "common", bars: [{ phase: "measure", s: 0, e: p0 }] });
  if (needCapex) rows.push({ id: "capex", title: "Business case and capex approval", kind: "common", bars: [{ phase: "approve", s: capexStart, e: capexEnd }] });

  // First pass: define/approve/procure per package.
  const sched = wps.map((w) => {
    const ph = w.phases || {};
    const defS = 0;
    const defE = defS + (ph.define || 0);
    const measEnd = (w.needs || []).length ? Math.max.apply(null, w.needs.map((k) => (MEASUREMENTS[k] ? MEASUREMENTS[k].weeks : 0))) : 0;
    const apS = Math.max(defE, measEnd);
    const apE = apS + (ph.approve || 0);
    let prS = apE;
    if (w.hardware && needCapex) prS = Math.max(prS, capexEnd);
    const prE = prS + (ph.procure || 0);
    return { w, defS, defE, apS, apE, prS, prE };
  });
  // Install windows: hardware either together (after the latest procurement) or each when ready.
  const hw = sched.filter((x) => x.w.hardware && (x.w.phases || {}).install);
  const commonInstall = hw.length ? Math.max.apply(null, hw.map((x) => x.prE)) : 0;
  const installs = [];
  sched.forEach((x) => {
    const ph = x.w.phases || {};
    const bars = [];
    if (ph.define) bars.push({ phase: "define", s: x.defS, e: x.defE });
    if (ph.approve) bars.push({ phase: "approve", s: x.apS, e: x.apE });
    let end = x.apE;
    if (ph.procure) {
      bars.push({ phase: "procure", s: x.prS, e: x.prE });
      end = x.prE;
    }
    if (ph.install) {
      // packages that go with another (reheat with its cooler) always share that window
      const inS = combined ? commonInstall : x.prE;
      const inE = inS + ph.install;
      bars.push({ phase: "install", s: inS, e: inE });
      installs.push({ s: inS, e: inE, days: x.w.shutdownDays || 0, title: x.w.title });
      end = inE;
      if (ph.commission) {
        bars.push({ phase: "commission", s: inE, e: inE + ph.commission });
        end = inE + ph.commission;
      }
    }
    if (ph.implement) {
      const imS = Math.max(x.apE, x.prE);
      bars.push({ phase: "implement", s: imS, e: imS + ph.implement, atChangeout: !!x.w.atChangeout });
      end = imS + ph.implement;
    }
    if (ph.verify) {
      bars.push({ phase: "verify", s: end, e: end + ph.verify });
      end = end + ph.verify;
    }
    rows.push({ id: x.w.deviceId || x.w.key, title: x.w.title, kind: "wp", wp: x.w, bars, end });
  });
  // Shutdown days: combined = one window (longest package); otherwise group by window start.
  let shutdownDays = 0;
  if (installs.length) {
    const groups = {};
    installs.forEach((i) => {
      groups[i.s] = Math.max(groups[i.s] || 0, i.days);
    });
    shutdownDays = Object.keys(groups).reduce((s, k) => s + groups[k], 0);
  }
  const weeks = Math.max.apply(null, rows.map((r) => Math.max.apply(null, r.bars.map((b) => b.e))));
  // Close-out: verification stack test and recalibration.
  rows.push({ id: "close", title: "Verify, recalibrate and close out", kind: "common", bars: [{ phase: "verify", s: weeks, e: weeks + 2 }] });
  const total = weeks + 2;
  const approvals = Array.from(new Set(wps.reduce((a, w) => a.concat(w.approvals || []), needCapex ? [A.capex] : [])));
  const addW = (n) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.round(n * 7));
  const hwEnd = installs.length ? Math.max.apply(null, installs.map((i) => i.e)) : null;
  return {
    empty: false,
    wps,
    rows,
    measurements,
    approvals,
    weeks: total,
    start,
    end: addW(total),
    hardwareInService: hwEnd != null ? addW(hwEnd + 1) : null,
    installWindow: combined && installs.length ? { s: addW(commonInstall), e: addW(commonInstall + Math.max.apply(null, installs.map((i) => i.e - i.s))) } : null,
    capex: capexTotal,
    shutdownDays,
    combined,
    addW,
    uncostedVessel: wps.some((w) => w.vesselUncosted),
  };
}

export function phaseOf(key) {
  return PHASE_ORDER.indexOf(key);
}
