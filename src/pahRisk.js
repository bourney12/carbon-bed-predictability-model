// v2.9.0 - Hot-day PAH risk.
//
// PAH breakthrough is driven by the gas temperature on the day, not by the monthly mean.
// The app's PAH fits (stack temperature + loading) are sound given the stack temperature,
// but forecasting with monthly-mean weather never reaches the stack temperatures seen on
// the exceedance days (P10 33 C, P11 31 C), so summer PAH was never flagged.
//
// This module forecasts PAH on a chosen hot-day percentile (default 90th: the hottest
// 1 day in 10). The spread of stack temperature about the weather-based estimate is
// calibrated directly from the stack tests: residual = measured stack temp minus the
// stack regression applied to the daily-mean climate for the test date. That residual
// carries daytime heating, hot spells and regression error together, which is exactly
// what a stack test sees. Pure functions only (no React), ASCII source.

export const PAH_RISK_ELV = 1000; // ug/m3

// Day of year (0-based) of the middle of each month.
const MID = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

function dayOfYear(date) {
  const d = new Date(date);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.max(0, Math.min(364, Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000)));
}

// Daily-mean ambient climatology, linearly interpolated between month mid-points.
export function climateMeanForDate(date, tMonth) {
  const doy = dayOfYear(date);
  let i = 11;
  for (let k = 0; k < 12; k++) if (doy >= MID[k]) i = k;
  let a, b, f;
  if (doy < MID[0]) {
    a = 11; b = 0; f = (doy + 365 - MID[11]) / (MID[0] + 365 - MID[11]);
  } else if (i === 11) {
    a = 11; b = 0; f = (doy - MID[11]) / (MID[0] + 365 - MID[11]);
  } else {
    a = i; b = i + 1; f = (doy - MID[i]) / (MID[i + 1] - MID[i]);
  }
  return tMonth[a] + f * (tMonth[b] - tMonth[a]);
}

// Inverse standard normal (Acklam), adequate for 0.5-0.99.
export function zFor(p) {
  const q = Math.min(0.999, Math.max(0.5, p));
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  if (q > 0.97575) {
    const r = Math.sqrt(-2 * Math.log(1 - q));
    return -(((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  const r = q - 0.5;
  const s = r * r;
  return (((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
}

// Calibrate the hot-day spread from the stack tests.
// stackData records need date (YYYY-MM-DD) and stackTemp. flowAnomalous records are excluded,
// as they are from the stack regression.
export function calibrateHotDay(stackData, tMonth, stackA, stackB) {
  const rows = (stackData || [])
    .filter(d => d && d.date && d.stackTemp != null && Number.isFinite(Number(d.stackTemp)) && d.flowAnomalous !== true)
    .map(d => {
      const clim = climateMeanForDate(d.date + "T12:00:00", tMonth);
      const est = stackA + stackB * clim;
      return { period: d.period, date: d.date, clim, est, stackTemp: Number(d.stackTemp), resid: Number(d.stackTemp) - est };
    });
  const n = rows.length;
  if (n < 4) return { ready: false, n, mu: 2.0, sd: 3.0, rows };
  const mu = rows.reduce((s, r) => s + r.resid, 0) / n;
  const sd = Math.sqrt(rows.reduce((s, r) => s + (r.resid - mu) * (r.resid - mu), 0) / (n - 1));
  return { ready: true, n, mu, sd: Math.max(sd, 1.0), rows };
}

// Stack temperature at a percentile for a given daily-mean ambient.
export function stackTempAt(ambientMean, hot, stackA, stackB, percentile) {
  const z = percentile <= 50 ? 0 : zFor(percentile / 100);
  return stackA + stackB * ambientMean + hot.mu + z * hot.sd;
}

// PAH model wrapper. kind "creo": loading = tonnes of creosote; "op": effective run hours.
// creo: ln PAH = a*T + b*ln(tonnes) + c ; op: ln PAH = a*T + b*ln(hours) + c (same form).
export function pahAt(model, stackT, load) {
  if (!model) return null;
  return Math.exp(model.a * stackT + model.b * Math.log(Math.max(load, 0.5)) + model.c);
}

// Loading at which PAH reaches the ELV at a given stack temperature.
export function loadAtLimit(model, stackT, elv) {
  if (!model || !(model.b > 0)) return null;
  return Math.exp((Math.log(elv || PAH_RISK_ELV) - model.a * stackT - model.c) / model.b);
}

export function riskLevel(ratio) {
  if (ratio >= 1) return "High";
  if (ratio >= 0.6) return "Elevated";
  if (ratio >= 0.3) return "Moderate";
  return "Low";
}

// Day-by-day hot-day PAH risk for the current bed.
// opts: { start (Date), horizon, load0, ratePerDay, model, hot, stackA, stackB, tMonth,
//         percentile, liveMeans (array of daily-mean ambient from today, optional), elv }
export function pahRiskDays(opts) {
  const elv = opts.elv || PAH_RISK_ELV;
  const pct = opts.percentile || 90;
  const live = opts.liveMeans || [];
  const out = [];
  let first = null;
  for (let day = 0; day <= (opts.horizon || 365); day++) {
    const date = new Date(opts.start.getFullYear(), opts.start.getMonth(), opts.start.getDate() + day, 12);
    const isLive = day < live.length && Number.isFinite(live[day]);
    const amb = isLive ? live[day] : climateMeanForDate(date, opts.tMonth);
    const load = (opts.load0 || 0) + (opts.ratePerDay || 0) * day;
    const t50 = stackTempAt(amb, opts.hot, opts.stackA, opts.stackB, 50);
    const tHot = stackTempAt(amb, opts.hot, opts.stackA, opts.stackB, pct);
    const pahHot = pahAt(opts.model, tHot, load);
    const pahTyp = pahAt(opts.model, t50, load);
    const ratio = pahHot / elv;
    const row = { day, date, live: isLive, ambient: amb, stackTyp: t50, stackHot: tHot, load, pahTyp, pahHot, ratio, level: riskLevel(ratio) };
    if (first == null && ratio >= 1) first = row;
    out.push(row);
  }
  return { rows: out, first };
}

// Season outlook, one entry per calendar month: in that month's weather, how many days of
// loading (at ratePerDay) a bed can carry before a hot day at the percentile could breach.
// High < 30 days, Elevated < 60, Moderate < 120, Low otherwise.
export function pahSeasonOutlook(opts) {
  const res = [];
  for (let m = 0; m < 12; m++) {
    const tHot = stackTempAt(opts.tMonth[m], opts.hot, opts.stackA, opts.stackB, opts.percentile || 90);
    const loadLimit = loadAtLimit(opts.model, tHot, opts.elv);
    const days = loadLimit != null && opts.ratePerDay > 0 ? Math.round(loadLimit / opts.ratePerDay) : null;
    let level = "Low";
    if (days != null && days < 30) level = "High";
    else if (days != null && days < 60) level = "Elevated";
    else if (days != null && days < 120) level = "Moderate";
    res.push({ m, days, level, stackHot: tHot, loadLimit });
  }
  return res;
}

// Back-test: would the rule have flagged each past test? Uses each test's own date and loading.
export function hindcast(stackData, opts) {
  return (stackData || [])
    .filter(d => d && d.date && d.pah != null && opts.loadOf(d) > 0)
    .map(d => {
      const amb = climateMeanForDate(d.date + "T12:00:00", opts.tMonth);
      const tHot = stackTempAt(amb, opts.hot, opts.stackA, opts.stackB, opts.percentile || 90);
      const pahHot = pahAt(opts.model, tHot, opts.loadOf(d));
      const flagged = pahHot >= (opts.elv || PAH_RISK_ELV);
      const over = d.pah > (opts.elv || PAH_RISK_ELV);
      return { period: d.period, date: d.date, pah: d.pah, stackTemp: d.stackTemp, tHot, pahHot, flagged, over };
    });
}
