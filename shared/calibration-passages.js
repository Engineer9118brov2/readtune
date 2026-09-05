/*
 * ReadTune — calibration passage pool
 *
 * The calibration draws its reading passages from here. Design rules, so every
 * draw is a fair comparison and no run can be gamed:
 *
 *   • ~48–56 words, two or three sentences, Grade 6–7, plain narrative syntax.
 *     Matched closely enough that swapping one passage for another doesn't
 *     change the reading load — only the *formatting* under test does.
 *   • Each carries a cloze check: two content words in a MIDDLE sentence are
 *     blanked (never the first sentence, never guessable from the topic). The
 *     reader picks the missing pair from four. You cannot answer it from the
 *     title or a skim — you had to read that line. It's a GATE (did you read
 *     this passage properly), not a score input.
 *   • `answer` is the correct pair; `distractors` are three pairs that are the
 *     right part of speech and topically plausible but wrong per the text.
 *     The UI shuffles all four and the correct index is random per render.
 *   • No passage repeats until the pool is exhausted — `pickPassages` excludes
 *     ids the reader has already seen (persisted by the caller).
 *
 * `{{word}}` marks a cloze blank in `text`. Exactly two per passage, adjacent
 * or near-adjacent, both in a non-opening sentence.
 */

export const CALIBRATION_PASSAGES = Object.freeze([
  {
    id: "wax-palm",
    text:
      "The seeds of the wax palm are spread almost entirely by one bird, a large mountain parrot that swallows them whole. Where the parrot has {{vanished}}, young palms stop {{appearing}}, and the forest slowly fills with trees that were already old when the birds were common.",
    answer: ["vanished", "appearing"],
    distractors: [["returned", "spreading"], ["nested", "sprouting"], ["multiplied", "flowering"]],
  },
  {
    id: "lighthouse-garden",
    text:
      "A lighthouse keeper on a bare stretch of coast kept a garden of flowers that could never have grown there on their own. Every plant began as a seed blown in by a {{storm}} or dropped by a passing {{bird}}, then coaxed along in soil he carried up from the beach.",
    answer: ["storm", "bird"],
    distractors: [["truck", "friend"], ["river", "goat"], ["neighbour", "boat"]],
  },
  {
    id: "freight-trains",
    text:
      "The longest freight trains take so long to clear a crossing that some towns have built roads over or under the tracks. A single train can weigh as much as a small cargo {{ship}}, and from the front the driver cannot see the last {{car}} even on a straight line.",
    answer: ["ship", "car"],
    distractors: [["town", "signal"], ["plane", "bridge"], ["truck", "engine"]],
  },
  {
    id: "tower-clock",
    text:
      "A clockmaker in a small mountain town was asked for a tower clock that people could read from the valley floor. She made the hands as long as a rowing {{boat}} and painted them {{black}} on a white face, and farmers set their watches by it from their fields.",
    answer: ["boat", "black"],
    distractors: [["car", "gold"], ["ladder", "red"], ["door", "blue"]],
  },
  {
    id: "lake-turnover",
    text:
      "Each autumn a certain deep lake turns over. The chilled surface water {{sinks}}, the warmer water from below {{rises}}, and for a few days the whole lake smells of mud that has sat on the bottom all summer.",
    answer: ["sinks", "rises"],
    distractors: [["freezes", "clears"], ["spreads", "settles"], ["warms", "falls"]],
  },
  {
    id: "flood-channel",
    text:
      "A town on a river bend used to flood every few springs until it dug a second, straighter channel for the high water. Most of the year the new channel is a dry {{ditch}} full of {{grass}}, but in a bad thaw it carries more water than the river itself.",
    answer: ["ditch", "grass"],
    distractors: [["pond", "reeds"], ["road", "gravel"], ["canal", "boats"]],
  },
  {
    id: "ferry-crew",
    text:
      "A small ferry crosses the same channel more than forty times a day. The crew knows the water so well they can hold the boat against the {{dock}} without {{ropes}} while the last cars roll off the deck.",
    answer: ["dock", "ropes"],
    distractors: [["shore", "anchors"], ["pier", "engines"], ["bank", "chains"]],
  },
  {
    id: "salt-road",
    text:
      "For centuries a mountain village paid its taxes in blocks of salt cut from a cave behind the church. Traders carried the blocks down on {{mules}}, and a family's wealth was counted in how many {{blocks}} were stacked against the back wall of the house.",
    answer: ["mules", "blocks"],
    distractors: [["carts", "coins"], ["boats", "sacks"], ["backs", "jars"]],
  },
  {
    id: "night-bakery",
    text:
      "The village bakery lit its oven at two in the morning so the bread would be ready by dawn. The baker judged the heat by holding a {{hand}} inside the door for a slow count, never by a {{thermometer}}, and the loaves came out the same every day.",
    answer: ["hand", "thermometer"],
    distractors: [["candle", "clock"], ["cloth", "timer"], ["spoon", "recipe"]],
  },
  {
    id: "desert-well",
    text:
      "A desert town shares one deep well, and the order in which families draw water has not changed in living memory. The turn passes by {{household}}, not by {{payment}}, so the poorest house and the richest wait the same number of days.",
    answer: ["household", "payment"],
    distractors: [["age", "need"], ["lottery", "rank"], ["distance", "size"]],
  },
  {
    id: "moth-orchard",
    text:
      "One old orchard is pollinated entirely at night by a single kind of moth with a very long tongue. When cold springs keep the {{moths}} grounded, the trees set almost no {{fruit}}, and the farmer props open the shed to let them shelter.",
    answer: ["moths", "fruit"],
    distractors: [["bees", "leaves"], ["birds", "seed"], ["winds", "blossom"]],
  },
  {
    id: "river-ice",
    text:
      "Before bridges, a northern town waited each winter for the river to freeze hard enough to cross. A man walked out with an {{axe}}, cut a hole, and measured the {{ice}} against the handle before anyone was allowed to drive a cart over.",
    answer: ["axe", "ice"],
    distractors: [["rope", "current"], ["pole", "snow"], ["lamp", "water"]],
  },
]);

/** Fisher–Yates, on a copy. */
export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Draw `count` passages the reader hasn't seen. When the unseen set can't
 * fill the run, the pool has been exhausted — reset and draw fresh (still
 * avoiding an immediate repeat of the very last one where possible).
 *
 * @param {string[]} seenIds
 * @returns {{ passages: object[], seenIds: string[], cycled: boolean }}
 */
export function pickPassages(count, seenIds = [], rand = Math.random) {
  const seen = new Set(seenIds);
  let pool = CALIBRATION_PASSAGES.filter((p) => !seen.has(p.id));
  let cycled = false;
  if (pool.length < count) {
    cycled = true;
    const lastSeen = seenIds[seenIds.length - 1];
    pool = CALIBRATION_PASSAGES.filter((p) => p.id !== lastSeen);
    seenIds = [];
    seen.clear();
  }
  const passages = shuffle(pool, rand).slice(0, count);
  const nextSeen = [...seenIds, ...passages.map((p) => p.id)];
  return { passages, seenIds: nextSeen, cycled };
}

const BLANK_RE = /\{\{([^}]+)\}\}/g;

/** The passage text with each `{{word}}` replaced by a numbered blank. */
export function clozeText(text, blank = " ____ ") {
  return String(text).replace(BLANK_RE, blank);
}

/** The plain text with markers stripped — for word count / reading. */
export function plainText(text) {
  return String(text).replace(BLANK_RE, "$1");
}

/**
 * The four answer options for a passage, shuffled, with the index of the
 * correct pair. Each option is a `["word", "word"]` pair.
 */
export function clozeOptions(passage, rand = Math.random) {
  const all = [passage.answer, ...passage.distractors];
  const order = shuffle(all, rand);
  return { options: order, correctIndex: order.indexOf(passage.answer) };
}
