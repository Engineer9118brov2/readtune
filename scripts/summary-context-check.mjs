import { selectSummaryContext } from "../shared/assist.js";

const maxChars = 12000;
const block = (label, char) => label + " " + char.repeat(2600);
const blocks = [
  block("OPENING-CONTEXT", "a"),
  block("EARLY-DETAIL", "b"),
  block("MIDDLE-FINDING", "c"),
  block("MID-LATE-EVIDENCE", "d"),
  block("LATE-DEVELOPMENT", "e"),
  block("FINAL-CONCLUSION", "f"),
];

const out = selectSummaryContext(blocks, maxChars);
if (!out) throw new Error("expected representative summary context");
if (out.length > maxChars) throw new Error("summary context exceeded relay budget");
for (const marker of ["OPENING-CONTEXT", "MIDDLE-FINDING", "FINAL-CONCLUSION"]) {
  if (!out.includes(marker)) throw new Error(`summary context missed ${marker}`);
}
if (!(out.indexOf("OPENING-CONTEXT") < out.indexOf("MIDDLE-FINDING") &&
      out.indexOf("MIDDLE-FINDING") < out.indexOf("FINAL-CONCLUSION"))) {
  throw new Error("summary context did not preserve article order");
}

const short = selectSummaryContext(["alpha", "beta", "omega"], 1000);
if (short !== "alpha\n\nbeta\n\nomega") throw new Error("short article blocks should remain intact");

console.log("✓ long summaries sample opening, middle, and conclusion within the existing budget");
