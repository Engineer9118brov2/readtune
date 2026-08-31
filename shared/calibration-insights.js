/*
 * ReadTune — calibration insights
 *
 * Turns raw calibration history into product-level signals the UI can explain:
 * confidence, stability, repeated wins, and where the current profile is likely
 * to feel strongest. Pure data shaping only — no DOM.
 */

import { FONTS, describeProfile } from "./settings.js";

const DIMENSION_LABELS = {
  baseline: "Standard",
  spacing: "Roomier spacing",
  bionic: "Bionic bolding",
  chunk: "One sentence at a time",
  dyslexic: "OpenDyslexic",
  atkinson: "Atkinson Hyperlegible",
  lexend: "Lexend",
};

const FONT_KEYS = new Set(["dyslexic", "atkinson", "lexend"]);

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function normalizeLegacyKey(key) {
  switch (key) {
    case "plain":
      return "baseline";
    case "bionic-open":
      return "bionic";
    case "bionic-chunked":
      return "chunk";
    default:
      return key || "";
  }
}

function sortDims(run) {
  const dims = asArray(run && run.dims)
    .map((d) => ({
      ...d,
      key: normalizeLegacyKey(d && d.key),
      label: d && d.label ? d.label : labelForDimension(d && d.key),
      help: Number(d && d.help) || 0,
      speedDelta: Number(d && d.speedDelta) || 0,
    }))
    .filter((d) => d.key && d.key !== "baseline")
    .sort((a, b) => b.help - a.help);

  if (dims.length) return dims;

  const winner = normalizeLegacyKey(run && run.winner);
  if (!winner || winner === "baseline") return [];
  return [{ key: winner, label: labelForDimension(winner), help: 0.12, speedDelta: 0 }];
}

function getKept(run) {
  const kept = asArray(run && run.kept).map(normalizeLegacyKey).filter(Boolean);
  if (kept.length) return [...new Set(kept)];
  const winner = normalizeLegacyKey(run && run.winner);
  return winner && winner !== "baseline" ? [winner] : [];
}

function topDim(run) {
  return sortDims(run)[0] || null;
}

function sameSet(a, b) {
  const aa = [...new Set(asArray(a).filter(Boolean))].sort();
  const bb = [...new Set(asArray(b).filter(Boolean))].sort();
  if (aa.length !== bb.length) return false;
  return aa.every((x, i) => x === bb[i]);
}

function formatDate(ts) {
  if (!ts) return "No date";
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
  } catch {
    return "Recent";
  }
}

function listify(items) {
  const list = asArray(items).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function humanizeKept(keys) {
  return asArray(keys).map(labelForDimension);
}

export function labelForDimension(key) {
  return DIMENSION_LABELS[normalizeLegacyKey(key)] || "Reading change";
}

export function buildProfileTitle(profile, keptKeys = []) {
  const p = profile && typeof profile === "object" ? profile : {};
  const parts = [];
  const font = p.font && FONTS[p.font] ? FONTS[p.font].label : FONTS.sans.label;
  parts.push(font);

  const kept = [...new Set(asArray(keptKeys).map(normalizeLegacyKey))].filter((k) => !FONT_KEYS.has(k));
  if (kept.includes("spacing")) parts.push("roomier spacing");
  if (kept.includes("bionic")) parts.push("bionic anchors");
  if (kept.includes("chunk")) parts.push("guided pacing");

  return parts.join(" + ");
}

export function summarizeCalibrations(history = [], fallbackProfile = null) {
  const runs = asArray(history).filter(Boolean).slice(-10);
  const last = runs[runs.length - 1] || null;
  const profile = (last && last.profile) || fallbackProfile || null;
  const kept = getKept(last);
  const dims = sortDims(last);
  const top = dims[0] || null;
  const second = dims[1] || null;
  const margin = top ? top.help - (second ? second.help : 0) : 0;

  const runMeta = runs.map((run) => ({
    run,
    kept: getKept(run),
    top: topDim(run),
    dims: sortDims(run),
  }));

  const topRepeatCount = top ? runMeta.filter((r) => r.top && r.top.key === top.key).length : 0;
  const sameSetCount = kept.length ? runMeta.filter((r) => sameSet(r.kept, kept)).length : 0;
  const recent = runMeta.slice(-3);
  const recentTopRepeats = top ? recent.filter((r) => r.top && r.top.key === top.key).length : 0;

  let confidenceScore = 0.2;
  if (!last) confidenceScore = 0;
  else {
    if (last.speedInformative !== false) confidenceScore += 0.12;
    if (!kept.length) confidenceScore += 0.1;
    if (top) {
      if (top.help >= 0.14) confidenceScore += 0.28;
      else if (top.help >= 0.1) confidenceScore += 0.2;
      else if (top.help >= 0.05) confidenceScore += 0.1;
      if (margin >= 0.08) confidenceScore += 0.18;
      else if (margin >= 0.04) confidenceScore += 0.1;
    }
    if (recentTopRepeats >= 2) confidenceScore += 0.15;
    if (sameSetCount >= 2) confidenceScore += 0.17;
    confidenceScore = clamp(confidenceScore, 0, 0.96);
  }

  let confidenceLabel = "No signal yet";
  let confidenceBody = "Run the calibration once to create your first reading profile.";
  if (last) {
    if (runs.length < 2 || confidenceScore < 0.5) {
      confidenceLabel = "Provisional";
      confidenceBody = kept.length
        ? "This is a good starting point, but one more retake on another day will tell you whether it repeats."
        : "Standard text held up best today. That can be the right result, but a retake is still useful.";
    } else if (confidenceScore < 0.75) {
      confidenceLabel = "Getting clearer";
      confidenceBody = top && topRepeatCount >= 2
        ? `${labelForDimension(top.key)} has started repeating, which is a stronger signal than one dramatic run.`
        : "The shape is emerging, but the top options are still fairly close.";
    } else {
      confidenceLabel = "High confidence";
      confidenceBody = kept.length
        ? `The same pattern is holding up across retakes, so this profile is worth treating as your everyday default.`
        : "Repeated retakes are still landing on standard settings, which is a stable result rather than a missing one.";
    }
  }

  let stabilityLabel = "New";
  let stabilityBody = "You have one run so far.";
  if (runs.length >= 2) {
    if (sameSetCount >= 2 || recentTopRepeats === 3) {
      stabilityLabel = "Stable";
      stabilityBody = kept.length
        ? `Your last retakes are pointing at the same combination: ${listify(humanizeKept(kept))}.`
        : "Your retakes are consistently saying standard settings work as well as anything else.";
    } else if (recentTopRepeats >= 2 || topRepeatCount >= 2) {
      stabilityLabel = "Emerging";
      stabilityBody = top
        ? `${labelForDimension(top.key)} has won more than once, but the full combination is still settling.`
        : "Some patterns are starting to repeat, but not enough to call stable yet.";
    } else {
      stabilityLabel = "Mixed";
      stabilityBody = "Your results are bouncing around a bit, which usually means the difference between styles was small.";
    }
  }

  let signalTitle = "Build a reading profile you can trust";
  let signalBody = "The goal is not a flashy winner. The goal is finding what keeps helping you over time.";
  if (last) {
    if (top && topRepeatCount >= 2) {
      signalTitle = `${labelForDimension(top.key)} keeps showing up`;
      signalBody = `${labelForDimension(top.key)} led ${topRepeatCount} of your last ${runs.length} calibration${runs.length === 1 ? "" : "s"}.`;
    } else if (top && kept.length) {
      signalTitle = `${labelForDimension(top.key)} helped most today`;
      signalBody = "That does not make it permanent yet, but it is the clearest place to start.";
    } else {
      signalTitle = "Standard settings are holding up";
      signalBody = "Nothing beat plain text by enough to keep. That is an honest result, not a weak one.";
    }
  }

  const dimMap = new Map();
  for (const meta of runMeta) {
    for (const d of meta.dims) {
      const cur = dimMap.get(d.key) || {
        key: d.key,
        label: labelForDimension(d.key),
        topWins: 0,
        keptRuns: 0,
        seen: 0,
        helpTotal: 0,
      };
      cur.seen += 1;
      cur.helpTotal += Number(d.help) || 0;
      if (meta.top && meta.top.key === d.key) cur.topWins += 1;
      if (meta.kept.includes(d.key)) cur.keptRuns += 1;
      dimMap.set(d.key, cur);
    }
  }

  const leaderboard = [...dimMap.values()]
    .map((d) => ({
      ...d,
      avgHelp: d.seen ? d.helpTotal / d.seen : 0,
      summary:
        d.keptRuns > 0
          ? `Kept in ${d.keptRuns} of ${runs.length} run${runs.length === 1 ? "" : "s"}`
          : d.topWins > 0
          ? `Won ${d.topWins} run${d.topWins === 1 ? "" : "s"}, but not by enough to keep every time`
          : "Never separated itself clearly from standard",
    }))
    .sort((a, b) => {
      if (b.keptRuns !== a.keptRuns) return b.keptRuns - a.keptRuns;
      if (b.topWins !== a.topWins) return b.topWins - a.topWins;
      return b.avgHelp - a.avgHelp;
    });

  const timeline = runMeta
    .map((meta) => {
      const title = meta.kept.length
        ? `Kept ${listify(humanizeKept(meta.kept))}`
        : meta.top
        ? `${labelForDimension(meta.top.key)} nudged ahead`
        : "Standard held up best";
      const body = meta.kept.length
        ? describeProfile((meta.run && meta.run.profile) || profile || {})
        : "No change cleared the keep threshold this time.";
      return {
        at: meta.run && meta.run.at,
        dateLabel: formatDate(meta.run && meta.run.at),
        title,
        body,
      };
    })
    .reverse();

  const useCases = [
    {
      title: "Articles in Reader View",
      body: "Use your profile on long articles and docs when you want a quieter page with fewer distractions.",
      tag: "Best daily entry point",
    },
    {
      title: "PDFs and handouts",
      body: "The same profile carries into PDFs, so schoolwork and research do not force you back to bright default layouts.",
      tag: "Same profile, new surface",
    },
  ];

  if (kept.includes("chunk")) {
    useCases.push({
      title: "Low-focus reading days",
      body: "When attention is slipping, one sentence at a time gives you a smaller unit to finish instead of a wall of text.",
      tag: "Pacing win",
    });
  } else if (kept.includes("spacing")) {
    useCases.push({
      title: "Dense, crowded pages",
      body: "Spacing wins usually show up most on articles or worksheets that feel cramped before you even start.",
      tag: "Crowding relief",
    });
  } else if (kept.includes("bionic")) {
    useCases.push({
      title: "Fast scanning",
      body: "Bionic anchors can be worth trying when you need to stay on the line while scanning quickly for meaning.",
      tag: "Anchor cue",
    });
  } else if (profile && profile.font && profile.font !== "sans") {
    useCases.push({
      title: "Visually tricky text",
      body: `${FONTS[profile.font] ? FONTS[profile.font].label : "That font"} is most worth using when letter shapes are what slows you down, not the meaning of the sentence.`,
      tag: "Letterform help",
    });
  } else {
    useCases.push({
      title: "Tired or overloaded moments",
      body: "Even if the calibration stayed close to standard, Read Aloud with highlighting is still the strongest fallback when focus drops.",
      tag: "Energy saver",
    });
  }

  let nextStepTitle = "Retake once more";
  let nextStepBody = "One more run on a different day will tell you whether today’s winner keeps holding up.";
  if (runs.length >= 2 && stabilityLabel === "Stable") {
    nextStepTitle = "Use it everywhere";
    nextStepBody = "Your profile looks steady enough to treat as your default. Retest later only if it stops feeling right.";
  } else if (runs.length >= 2 && stabilityLabel === "Mixed") {
    nextStepTitle = "Retest when you are in a normal reading mood";
    nextStepBody = "Mixed results often mean the differences were small. A calmer retake helps separate real gains from noise.";
  }

  return {
    runs: runs.length,
    profile,
    profileTitle: buildProfileTitle(profile || {}, kept),
    profileSummary: profile ? describeProfile(profile) : "",
    lastDateLabel: formatDate(last && last.at),
    kept,
    dims,
    top,
    confidenceScore,
    confidenceLabel,
    confidenceBody,
    stabilityLabel,
    stabilityBody,
    signalTitle,
    signalBody,
    leaderboard,
    timeline,
    useCases,
    nextStepTitle,
    nextStepBody,
    trustPoints: [
      "It is a quick estimate from six short readings, not a diagnosis.",
      "A repeated winner matters more than a single dramatic result.",
      "If the result feels close, retaking on another day is the right move.",
    ],
  };
}
