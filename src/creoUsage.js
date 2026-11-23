// ============================================================
// v2.5.0 (2026-11-23): cleaned creosote usage from the Daily Log.
//
// The Daily Log contains readings that are not real printouts:
//   - catch-up entries that repeat the previous day's tank figures,
//   - copied blocks that repeat readings from earlier dates,
//   - rows with a blank tank reading (total stock then misses a whole tank),
//   - the 26 May - 24 Jun 2026 block recorded as copy-pasted in the project brief.
// On such a row the stock is wrong, so the workbook's "usage since last reading" is wrong:
// a delivery shows up as usage and the next real reading goes negative. Summing only the
// positive rows (the v2.1 trial-model basis) kept the false usage and dropped the negatives.
//
// Each run of flagged rows is rebuilt from the real readings either side of it:
//   gap usage = stock before + deliveries in the gap - stock after   (stock balance)
// spread over the production days in proportion to the treatment charges run on each day
// (v2.5.1: Plant 1 / Plant 2 charges from the synced charge log, weighted by the kg per charge
// fitted on clean readings). Where the charge log does not cover a gap, the Settings day
// factors are used instead, with bank holidays at zero.
// A fall of less than DRIFT_KG (load-cell drift) is treated as an idle period (0 usage).
// A balance that cannot be right (stock rose beyond drift, or more than MAX_DAY_KG per
// production day) is replaced by the recent clean rate and marked as an estimate.
//
// Creosote used over a period is then the sum of cleaned usage (the net stock balance),
// never a positive-only sum. Same logic as the duplicate-corrected workbook of 23 Nov 2026.
// ============================================================

export const DRIFT_KG = 8000;
export const MAX_DAY_KG = 45000;
// Settings day factors (from 2025-26 readings). JS getDay(): Sun = 0.
export const DAY_FACTORS = [0, 0.66, 1.08, 1.16, 1.05, 1.05, 0];
// kg of creosote per charge, robust fit of 419 clean reading intervals Jan 2024 - Oct 2026
// against the synced charge log (v2.5.1). Plant 1 = fencing/track pot, Plant 2 = poles pot.
// The split between the two is not firm (it moves from year to year); charge count is what
// carries the signal. Only the ratio matters for spreading a gap; totals come from the tanks.
export const KG_PER_CHARGE = { plant1: 3191, plant2: 2626 };
export const KNOWN_BAD_RANGES = [["2026-05-26", "2026-06-24"]];
const BANK_HOLIDAYS = new Set([
  "2013-01-01","2013-03-29","2013-04-01","2013-05-06","2013-05-27","2013-08-26","2013-12-25","2013-12-26",
  "2014-01-01","2014-04-18","2014-04-21","2014-05-05","2014-05-26","2014-08-25","2014-12-25","2014-12-26",
  "2015-01-01","2015-04-03","2015-04-06","2015-05-04","2015-05-25","2015-08-31","2015-12-25","2015-12-28",
  "2016-01-01","2016-03-25","2016-03-28","2016-05-02","2016-05-30","2016-08-29","2016-12-26","2016-12-27",
  "2017-01-02","2017-04-14","2017-04-17","2017-05-01","2017-05-29","2017-08-28","2017-12-25","2017-12-26",
  "2018-01-01","2018-03-30","2018-04-02","2018-05-07","2018-05-28","2018-08-27","2018-12-25","2018-12-26",
  "2019-01-01","2019-04-19","2019-04-22","2019-05-06","2019-05-27","2019-08-26","2019-12-25","2019-12-26",
  "2020-01-01","2020-04-10","2020-04-13","2020-05-08","2020-05-25","2020-08-31","2020-12-25","2020-12-28",
  "2021-01-01","2021-04-02","2021-04-05","2021-05-03","2021-05-31","2021-08-30","2021-12-27","2021-12-28",
  "2022-01-03","2022-04-15","2022-04-18","2022-05-02","2022-06-02","2022-06-03","2022-08-29","2022-09-19","2022-12-26","2022-12-27",
  "2023-01-02","2023-04-07","2023-04-10","2023-05-01","2023-05-08","2023-05-29","2023-08-28","2023-12-25","2023-12-26",
  "2024-01-01","2024-03-29","2024-04-01","2024-05-06","2024-05-27","2024-08-26","2024-12-25","2024-12-26",
  "2025-01-01","2025-04-18","2025-04-21","2025-05-05","2025-05-26","2025-08-25","2025-12-25","2025-12-26",
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28",
  "2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28",
]);

const TANKS = ["store1Kg", "store2Kg", "work1Kg", "work2Kg"];

function isoAddDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayWeight(iso) {
  if (BANK_HOLIDAYS.has(iso)) return 0;
  return DAY_FACTORS[new Date(iso + "T00:00:00Z").getUTCDay()];
}
// Production days covered by a reading on `to` that follows a reading on `from`: [from, to-1].
function productionDays(from, to) {
  const out = [];
  for (let d = from; d < to; d = isoAddDays(d, 1)) out.push(d);
  return out;
}
// Charge log -> { byDate: Map(date -> kg-weighted charges), first, last }.
export function buildChargeWeights(chargeLog) {
  const byDate = new Map();
  let first = null, last = null;
  for (const c of chargeLog || []) {
    if (!c || !c.date) continue;
    const d = String(c.date).slice(0, 10);
    const kg = KG_PER_CHARGE[c.type];
    if (!kg) continue;
    byDate.set(d, (byDate.get(d) || 0) + kg * (c.count || 1));
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
  return byDate.size ? { byDate, first, last } : null;
}
function stockOf(r) {
  if (r.correctedKg != null) return r.correctedKg;
  if (r.totalKg != null) return r.totalKg;
  return TANKS.reduce((a, k) => a + (r[k] || 0), 0);
}
function sameReadings(a, b) {
  return TANKS.every(k => (a[k] == null && b[k] == null) || a[k] === b[k]);
}

export function flagCreoRows(rows) {
  const seen = new Map();
  return rows.map((r, i) => {
    const reasons = [];
    const hasAny = TANKS.some(k => r[k] != null);
    if (hasAny && TANKS.some(k => r[k] == null)) reasons.push("Tank reading missing - total stock incomplete");
    if (i > 0 && sameReadings(r, rows[i - 1])) reasons.push("Same readings as previous row (copied forward)");
    else if (hasAny && TANKS.some(k => r[k])) {
      const key = TANKS.map(k => r[k] == null ? "-" : r[k]).join("|");
      if (seen.has(key) && i - seen.get(key).i > 1) reasons.push("Repeats readings from " + seen.get(key).date);
      else if (!seen.has(key)) seen.set(key, { i, date: r.date });
    }
    if (!reasons.length && KNOWN_BAD_RANGES.some(([a, b]) => r.date >= a && r.date <= b)) reasons.push("Inside the 26 May - 24 Jun 2026 copy-paste block");
    return reasons.join("; ");
  });
}

// rows: Daily Log readings ({date, store1Kg..work2Kg, correctedKg, totalKg, deliveredKg, usageKg, usagePerDayKg}).
// Returns { rows: [{...row, flag, usageCleanKg, method, gapId}], gaps: [...], flaggedCount }.
export function cleanCreoLog(dailyLog, chargeLog) {
  const charges = buildChargeWeights(chargeLog);
  const rows = (dailyLog || []).filter(r => r && r.date).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const flags = flagCreoRows(rows);
  const out = rows.map((r, i) => ({ ...r, flag: flags[i], usageCleanKg: r.usageKg, method: "", gapId: null }));
  const gaps = [];
  let i = 0;
  while (i < out.length) {
    if (!out[i].flag) { i++; continue; }
    const s = i;
    while (i < out.length && out[i].flag) i++;
    const a = s - 1, b = i;
    if (a < 0) { for (let j = s; j < b; j++) out[j].method = "No real reading before - not rebuilt"; continue; }
    if (b >= out.length) {
      for (let j = s; j < b; j++) { out[j].usageCleanKg = null; out[j].method = "Waiting for the next real reading"; }
      continue;
    }
    const gapId = gaps.length + 1;
    let deliveredKg = 0;
    for (let j = s; j <= b; j++) deliveredKg += out[j].deliveredKg || 0;
    const balance = stockOf(out[a]) + deliveredKg - stockOf(out[b]);
    const days = productionDays(out[a].date, out[b].date);
    const chargeCovered = charges && days.length && days[0] >= charges.first && days[days.length - 1] <= charges.last;
    const chargeKg = chargeCovered ? days.reduce((acc, d) => acc + (charges.byDate.get(d) || 0), 0) : 0;
    const useCharges = chargeCovered && chargeKg > 0;
    const w = d => useCharges ? (charges.byDate.get(d) || 0) : dayWeight(d);
    const weightSum = days.reduce((acc, d) => acc + w(d), 0);
    const basis = useCharges ? ", spread by charges run" : ", spread by weekday factors";
    const prodDays = days.filter(d => new Date(d + "T00:00:00Z").getUTCDay() !== 0 && !BANK_HOLIDAYS.has(d)).length;
    let method, perWeight;
    if (balance < 0 && balance >= -DRIFT_KG) { method = "Idle - level within load-cell drift"; perWeight = 0; }
    else if (balance < -DRIFT_KG || balance > MAX_DAY_KG * Math.max(1, prodDays)) {
      const recent = out.slice(Math.max(0, a - 40), a + 1)
        .filter(r => !r.flag && r.usagePerDayKg != null && r.usagePerDayKg > 0 && r.usagePerDayKg < MAX_DAY_KG)
        .map(r => r.usagePerDayKg).sort((x, y) => x - y);
      perWeight = useCharges ? 1 : (recent.length ? recent[Math.floor(recent.length / 2)] : 12000);
      method = useCharges ? "Estimated from charges run x kg per charge - stock balance not usable" : "Estimated at the recent clean rate - stock balance not usable";
    } else if (weightSum <= 0) { method = "Stock balance (no working days - on next real reading)"; perWeight = null; }
    else { method = "Stock balance between real readings" + basis; perWeight = balance / weightSum; }
    for (let j = s; j <= b; j++) {
      const wj = productionDays(out[j - 1].date, out[j].date).reduce((acc, d) => acc + w(d), 0);
      out[j].usageCleanKg = perWeight == null ? (j === b ? Math.max(0, balance) : 0) : Math.round(perWeight * wj);
      out[j].method = method + (j === b ? " (next real reading)" : "");
      out[j].gapId = gapId;
    }
    gaps.push({ gapId, from: out[a].date, to: out[b].date, flaggedRows: b - s, deliveredKg, balanceKg: balance, chargeKg: chargeCovered ? chargeKg : null, method });
  }
  return { rows: out, gaps, flaggedCount: flags.filter(Boolean).length };
}

// Creosote used (kg) between start (exclusive) and end (inclusive) on the cleaned log: net stock balance.
// Returns null when the log does not cover the period or a reading inside it is still unresolved.
// openEnd: the period runs to today (current bed), so the log need not reach `end`.
export function cleanUsageKg(cleanRows, start, end, openEnd) {
  if (!cleanRows || !cleanRows.length) return null;
  if (!cleanRows.some(r => r.date <= start)) return null;
  if (!openEnd && !cleanRows.some(r => r.date >= end)) return null;
  let kg = 0;
  for (const r of cleanRows) {
    if (r.date > start && r.date <= end) {
      if (r.usageCleanKg == null) continue;
      kg += r.usageCleanKg;
    }
  }
  return Math.max(0, kg);
}
