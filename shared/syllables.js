/*
 * ReadTune — English syllabification
 *
 * The bundled hyphenation patterns (Hypher + TeX en-US) answer a different
 * question than the one a struggling reader is asking. TeX patterns mark
 * *safe line-break points*: they are deliberately conservative, because a
 * wrong break in printed text looks bad, and a missing one costs nothing.
 * That makes them wrong for teaching decoding — "Calabasas" comes back as
 * "Cal·abasas", which is not how anyone says it.
 *
 * This splits on structure instead: find the vowel nuclei, then hand each
 * consonant cluster to the following syllable as far as English spelling
 * allows an onset (the maximal onset principle). It is not a pronouncing
 * dictionary and will not be right on every loanword, but it is right on the
 * ordinary vocabulary this is for, and it never returns a split that cannot
 * be reassembled into the original word.
 */

/* Clusters English words can actually begin with. Order matters only in that
   we test longest-first. */
const ONSETS = new Set([
  "bl", "br", "ch", "chr", "cl", "cr", "dr", "dw", "fl", "fr", "gh", "gl", "gn", "gr",
  "kl", "kn", "kr", "kw", "ph", "phl", "phr", "pl", "pn", "pr", "ps", "qu", "rh",
  "sc", "sch", "scl", "scr", "sh", "shr", "sk", "skr", "sl", "sm", "sn", "sp", "sph",
  "spl", "spr", "squ", "st", "str", "sv", "sw", "th", "thr", "thw", "tr", "ts", "tw",
  "wh", "wr",
]);

const isVowel = (c) => "aeiouy".includes(c);

/* A vowel run is one nucleus, with two exceptions worth making:
   - "y" only counts as a vowel when it isn't starting the word or a syllable
     next to another vowel ("yellow" has one nucleus in "ye", not two).
   - a silent final "e" is not its own syllable ("make" is one syllable), but
     the "-le" in "table" is. */
/* Vowel pairs that are one sound, not two. Everything not listed splits, so a
   run like "ao" in "chaos" or "io" in "lion" becomes two nuclei.
   "ie", "ea" and "ue" stay whole deliberately: they are a digraph far more
   often than a hiatus ("field", "meat", "blue"), and the cost of being wrong
   is asymmetric — an unsplit word is merely unhelpful, a wrongly split one
   teaches the wrong decoding. */
const DIGRAPHS = new Set([
  "aa", "ai", "au", "aw", "ay",
  "ea", "ee", "ei", "eu", "ew", "ey",
  "ie", "oa", "oi", "oo", "ou", "ow", "oy",
  "ue", "ui", "uy",
  "ya", "ye", "yo",
]);

function nuclei(w) {
  const spots = [];
  let i = 0;
  while (i < w.length) {
    if (!isVowel(w[i])) { i++; continue; }
    let start = i;
    i++;
    while (i < w.length && isVowel(w[i])) {
      /* Break the run where the pair isn't a digraph — "cha|os", "li|on",
         "po|em" — rather than swallowing every vowel run whole.
         Except after t/s/c/x, where an "i" before another vowel is the soft
         "sh" of -tion, -sion, -cial, -cious: one sound, not two. Without this
         "dictionary" comes apart as "dic-ti-o-na-ry". */
      const prev = w[i - 2];
      const softI = w[i - 1] === "i" && prev && "tscx".includes(prev);
      if (!DIGRAPHS.has(w[i - 1] + w[i]) && !softI) {
        spots.push([start, i]);
        start = i;
      }
      i++;
    }
    spots.push([start, i]);
  }
  return spots;
}

/** Split one lowercase alphabetic word. Returns [] for anything else. */
export function splitWord(word) {
  const w = String(word || "").toLowerCase();
  if (!/^[a-z]+$/.test(w)) return [];
  if (w.length <= 3) return [word];

  let spots = nuclei(w);
  if (spots.length <= 1) return [word];

  /* Silent final e: "make", "stone". Fold it back into the previous nucleus
     unless the word ends in consonant + "le", which is its own syllable. */
  const last = spots[spots.length - 1];
  if (last[1] === w.length && last[1] - last[0] === 1 && w[last[0]] === "e") {
    const beforeE = w[last[0] - 1];
    const twoBefore = w[last[0] - 2];
    const isConsonantLe = beforeE === "l" && twoBefore && !isVowel(twoBefore);
    if (!isConsonantLe) spots = spots.slice(0, -1);
  }
  if (spots.length <= 1) return [word];

  /* Cut points: for each gap between nuclei, give the following syllable the
     longest legal onset the cluster allows, and the rest to the syllable
     before it. A single consonant always goes forward ("ca-la"). */
  const cuts = [];
  for (let n = 0; n < spots.length - 1; n++) {
    const from = spots[n][1];
    const to = spots[n + 1][0];
    const cluster = w.slice(from, to);
    if (cluster.length === 0) {
      cuts.push(from); // two nuclei touching: "cha-os"
      continue;
    }
    if (cluster.length === 1) {
      cuts.push(from); // maximal onset: the consonant starts the next syllable
      continue;
    }
    /* Maximal onset: hand the next syllable the longest tail of the cluster
       that English can start a word with. A lone consonant always qualifies,
       which is what makes "ta-ble" and "com-pu-ter" come out right. */
    let onset = 1;
    for (let take = Math.min(3, cluster.length); take >= 2; take--) {
      if (ONSETS.has(cluster.slice(cluster.length - take))) { onset = take; break; }
    }
    /* A doubled consonant is the one place English splits rather than carries:
       "run-ning", "ap-ple". */
    if (cluster.length >= 2 && cluster[0] === cluster[1]) onset = cluster.length - 1;
    cuts.push(to - onset);
  }

  const parts = [];
  let prev = 0;
  for (const c of cuts) {
    if (c > prev && c < word.length) {
      parts.push(word.slice(prev, c));
      prev = c;
    }
  }
  parts.push(word.slice(prev));

  /* Never hand back a fragment with no vowel — merge it into its neighbour. */
  const merged = [];
  for (const part of parts) {
    if (merged.length && !/[aeiouy]/i.test(part)) merged[merged.length - 1] += part;
    else if (merged.length && !/[aeiouy]/i.test(merged[merged.length - 1])) merged[merged.length - 1] += part;
    else merged.push(part);
  }
  return merged.filter(Boolean);
}

/** Split, keeping any leading/trailing punctuation out of the way.
 *
 * A hyphen or apostrophe stays *attached* to the piece before it rather than
 * becoming an element of its own: the caller renders one dot per element and
 * counts elements as syllables, so a loose separator turned "don't" into
 * "don·'·t" and announced it as three syllables. */
export function syllabify(raw) {
  const s = String(raw || "");
  const m = s.match(/^([^\p{L}]*)(\p{L}[\p{L}'’-]*?)([^\p{L}]*)$/u);
  if (!m) return s ? [s] : [];
  const core = m[2];
  if (/[-'’]/.test(core)) {
    const out = [];
    for (const piece of core.split(/(?<=[-'’])/)) {
      const sep = (piece.match(/[-'’]+$/) || [""])[0];
      const body = sep ? piece.slice(0, -sep.length) : piece;
      const parts = body ? splitWord(body) : [];
      const list = parts.length ? parts.slice() : body ? [body] : [];
      if (!list.length) {
        if (sep && out.length) out[out.length - 1] += sep;
        continue;
      }
      list[list.length - 1] += sep;
      out.push(...list);
    }
    /* A piece with no vowel is not a syllable of its own: "don't" splits into
       "don'" + "t", which is one syllable spoken, not two. Fold it back. */
    const merged = [];
    for (const piece of out.filter(Boolean)) {
      if (merged.length && !/[aeiouy]/i.test(piece)) merged[merged.length - 1] += piece;
      else merged.push(piece);
    }
    return merged;
  }
  const parts = splitWord(core);
  return parts.length ? parts : [core];
}
