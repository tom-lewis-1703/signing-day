// One-time extraction of the ratings model data from Maxi's Dynasty Progression
// Monitor & Planner (a free single-page tool) into lib/data/ratings-model.json.
// Our app never reads Maxi's tool at runtime; it only uses the JSON this writes.
//   node tools/extract-ratings-model.mjs <path to DynastyProgressionMonitor.html>
// For personal use only: the data was compiled by that tool's author.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const src = process.argv[2];
if (!src) { console.error("usage: node tools/extract-ratings-model.mjs <DynastyProgressionMonitor.html>"); process.exit(2); }
const html = fs.readFileSync(src, "utf8");

// Reads the JSON literal assigned to `window.<name> = {...};`
function jsonAssigned(name) {
  const start = html.indexOf(`window.${name} = `);
  if (start < 0) throw new Error(`${name} not found`);
  let i = html.indexOf("{", start), depth = 0, inStr = false;
  const from = i;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) break;
  }
  return JSON.parse(html.slice(from, i + 1));
}

// Rating fields, index-aligned with the short codes the skill groups use.
const attrsMatch = html.match(/ir=\[("SpeedRating"[^\]]*)\]/);
if (!attrsMatch) throw new Error("rating field list not found");
const fields = JSON.parse(`[${attrsMatch[1]}]`);
const SHORT = ["SPD","ACC","AGI","COD","STR","AWR","JMP","STA","TGH","INJ","CAR","BTK","TRK","SFA","SPM","JKM","BCV",
  "CTH","CIT","SPC","SRR","MRR","DRR","RLS","THP","SAC","MAC","DAC","TOR","TUP","BSK","PAC","PBK","PBP","PBF",
  "RBK","RBP","RBF","LBK","IBL","TAK","POW","PUR","PRC","MCV","ZCV","PRS","BSH","PMV","FMV","KPW","KAC","KR","LSN"];
if (fields.length !== SHORT.length) throw new Error(`expected ${SHORT.length} rating fields, found ${fields.length}`);

const model = {
  source: `Extracted ${new Date().toISOString().slice(0, 10)} from ${path.basename(path.dirname(path.dirname(src)))} (Maxi's Dynasty Progression Monitor & Planner). Personal use only.`,
  // short code -> save field name
  ratingFields: Object.fromEntries(SHORT.map((s, i) => [s, fields[i]])),
  // Per archetype: { _i intercept, _lo/_hi clamps, <RatingField>: weight }
  ovrCoef: jsonAssigned("OVR_COEF"),
  // Per archetype: [[groupName, [short codes], costCurve [[level, cost]...], {p:[], s:[], t:[]}], ...] in cap order
  skillGroups: jsonAssigned("SKILL_GROUPS_VANILLA"),
  // Group level = 1 + number of thresholds the group rating has reached, by position family
  levelThresholds: {
    te: [59, 61, 63, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 84, 85, 86, 87, 88, 89],
    wr: [61, 64, 66, 69, 71, 74, 76, 79, 81, 84, 86, 89, 91, 93, 95, 96, 97, 98, 99],
    def: [63, 65, 67, 69, 71, 73, 75, 77, 79, 81, 83, 85, 87, 89, 91, 93, 95, 97, 99]
  }
};

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "data", "ratings-model.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(model));
console.log(`Wrote ${out}: ${Object.keys(model.ovrCoef).length} archetype OVR formulas, ${Object.keys(model.skillGroups).length} archetype skill-group sets, ${fields.length} rating fields`);
