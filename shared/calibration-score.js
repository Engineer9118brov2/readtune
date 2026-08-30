/*
 * ReadTune — calibration scoring
 *
 * Pure functions, no DOM, so the method can be unit-tested (see test/harness.js).
 *
 * Model:
 *  1. De-trend words-per-minute for practice effect — subtract a linear fit of
 *     wpm against passage position, so later passages aren't credited for the
 *     speed-up everyone gets from warming up.
 *  2. For each single-change passage, compare it to the baseline passage on
 *     three axes: adjusted speed, 1–5 ease, and the comprehension question.
 *  3. A change is "kept" only if its combined score clears HELP_THRESHOLD.
 *     If speed carries no signal (all passages read at a similar pace) it drops
 *     out and the decision leans on ease + comprehension.
 *  4. Fonts are mutually exclusive — the better-scoring font wins, or neither.
 */

export const HELP_THRESHOLD = 0.1;

/** least-squares slope of ys against xs */
export function linfit(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * @param results  [{ key, label, apply, position, wpm, correct, ease }] — one per scored passage,
 *                 including exactly one with key === baselineKey
 * @returns { base, dims (sorted best-first), speedInformative, practiceSlope }
 */
export function analyse(results, baselineKey = "baseline") {
  const pos = results.map((r) => r.position);
  const wpm = results.map((r) => r.wpm);
  const slope = linfit(pos, wpm);
  const adj = results.map((r, i) => ({ ...r, adjWpm: wpm[i] - slope * pos[i] }));

  const meanW = adj.reduce((a, b) => a + b.adjWpm, 0) / adj.length;
  const adjVals = adj.map((r) => r.adjWpm);
  const spread = Math.max(...adjVals) - Math.min(...adjVals);
  const speedInformative = meanW > 0 && spread / meanW > 0.1;

  const base = adj.find((r) => r.key === baselineKey);
  const dims = adj
    .filter((r) => r.key !== baselineKey)
    .map((v) => {
      const speedDelta = base && base.adjWpm ? (v.adjWpm - base.adjWpm) / base.adjWpm : 0;
      const easeDelta = (v.ease - (base ? base.ease : 3)) / 4;
      const compDelta = (v.correct ? 1 : 0) - (base && base.correct ? 1 : 0);
      const speedTerm = speedInformative ? clamp(speedDelta / 0.4, -1, 1) : 0;
      const wS = speedInformative ? 0.45 : 0;
      const wE = speedInformative ? 0.4 : 0.8;
      const help = wS * speedTerm + wE * easeDelta + 0.15 * compDelta;
      return { ...v, speedDelta, easeDelta, compDelta, help };
    })
    .sort((a, b) => b.help - a.help);

  return { base, dims, speedInformative, practiceSlope: slope };
}

/**
 * @returns { profile, kept: [dimKey] }
 */
export function buildProfile({ dims, baseline, defaults, fontKeys, extra = {} }) {
  const fk = fontKeys instanceof Set ? fontKeys : new Set(fontKeys);
  const profile = { ...defaults, ...baseline, ...extra };
  const kept = [];

  const fonts = dims.filter((d) => fk.has(d.key)).sort((a, b) => b.help - a.help);
  if (fonts[0] && fonts[0].help >= HELP_THRESHOLD) {
    Object.assign(profile, fonts[0].apply);
    kept.push(fonts[0].key);
  }
  for (const d of dims) {
    if (fk.has(d.key)) continue;
    if (d.help >= HELP_THRESHOLD) {
      Object.assign(profile, d.apply);
      kept.push(d.key);
    }
  }
  return { profile, kept };
}

export function effectText(d, speedInformative) {
  const pct = Math.round(d.speedDelta * 100);
  const bits = [];
  if (speedInformative && Math.abs(pct) >= 4) bits.push(`${pct > 0 ? "+" : ""}${pct}% speed`);
  if (Math.abs(d.easeDelta) >= 0.25) bits.push(`${d.easeDelta > 0 ? "+" : "−"}${Math.abs(Math.round(d.easeDelta * 4))} on ease`);
  if (d.compDelta > 0) bits.push("answered right where standard didn't");
  if (d.compDelta < 0) bits.push("missed the question");
  return bits.length ? bits.join(" · ") : "about the same as standard";
}
