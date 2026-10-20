// Builds lib/data/abilities.json: the five physical abilities (three for K/P) of each
// archetype, in slot order (= PhysicalAbility1..5 in the save), with the rating each one
// needs per tier in Dynasty. The save stores only the tier per slot, not the name.
//
//   node tools/extract-abilities.mjs <saved page.html>
//
// Source: TeamCrafters "CFB 27 Dynasty Ability Requirements"
// (https://www.teamcrafters.net/tools/cfb27/dynasty-abilities), saved with a browser or curl.
// The site uses the game's archetype names; the save uses older ones (PlayerType), mapped in
// ARCHETYPES below. Checked on the Week 1 test save: with these names the tier each
// player's ratings reach matches the tier in the save for about 95-99% of slots per archetype,
// and every other candidate archetype matches far worse.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Save PlayerType -> [site position group, game archetype name].
const ARCHETYPES = {
  QB_FieldGeneral: ["QB", "Pocket Passer"], QB_Improviser: ["QB", "Backfield Creator"],
  QB_Scrambler: ["QB", "Dual Threat"], QB_PureScrambler: ["QB", "Pure Runner"],
  HB_ElusiveBack: ["HB", "East/West Playmaker"], HB_ElusivePower: ["HB", "Elusive Bruiser"],
  HB_PowerBack: ["HB", "Contact Seeker"], HB_PowerBlocking: ["HB", "North/South Blocker"],
  HB_PowerReceiving: ["HB", "North/South Receiver"], HB_ReceivingBack: ["HB", "Backfield Threat"],
  FB_Blocking: ["FB", "Blocking"], FB_Utility: ["FB", "Utility"],
  WR_DeepThreat: ["WR", "Speedster"], WR_GadgetReceiver: ["WR", "Gadget"], WR_Physical: ["WR", "Contested Specialist"],
  WR_PhysicalBlocker: ["WR", "Gritty Possession"], WR_PhysicalRouteRunner: ["WR", "Physical Route Runner"],
  WR_Playmaker: ["WR", "Route Artist"], WR_ShiftyRouteRunner: ["WR", "Elusive Route Runner"],
  TE_Blocking: ["TE", "Pure Blocker"], TE_PhysicalRouteRunner: ["TE", "Physical Route Runner"],
  TE_Possession: ["TE", "Pure Possession"], TE_PossessionBlocking: ["TE", "Gritty Possession"], TE_VerticalThreat: ["TE", "Vertical Threat"],
  ...Object.fromEntries(["C", "G", "OT"].flatMap(pos => [
    [`${pos}_Agile`, [pos, "Agile"]], [`${pos}_PassProtector`, [pos, "Pass Protector"]],
    [`${pos}_Power`, [pos, "Raw Strength"]], [`${pos}_WellRounded`, [pos, "Well Rounded"]]])),
  DE_PowerRusher: ["EDGE", "Power Rusher"], DE_PurePower: ["EDGE", "Pure Power"],
  DE_RunStopper: ["EDGE", "Edge Setter"], DE_SmallerSpeedRusher: ["EDGE", "Speed Rusher"],
  DT_NoseTackle: ["DT", "Gap Specialist"], DT_PowerRusher: ["DT", "Power Rusher"],
  DT_PurePower: ["DT", "Pure Power"], DT_SpeedRusher: ["DT", "Speed Rusher"],
  MLB_FieldGeneral: ["MIKE", "Signal Caller"], MLB_PassCoverage: ["MIKE", "Lurker"], MLB_RunStopper: ["MIKE", "Thumper"],
  OLB_PowerRusher: ["OLB", "Signal Caller"], OLB_PassCoverage: ["OLB", "Lurker"], OLB_RunStopper: ["OLB", "Thumper"],
  CB_HybridCorner: ["CB", "Field"], CB_MantoMan: ["CB", "Bump and Run"], CB_Slot: ["CB", "Boundary"], CB_Zone: ["CB", "Zone"],
  S_Hybrid: ["S", "Hybrid"], S_RunSupport: ["S", "Box Specialist"], S_Zone: ["S", "Coverage Specialist"],
  KP_Accurate: ["KP", "Accurate"], KP_Power: ["KP", "Power"]
};
// Second ratings the site names by short code.
const SHORT = { SPD: "Speed", SAC: "ThrowAccuracyShort", AWR: "Awareness", FMV: "FinesseMoves", MCV: "ManCoverage", ACC: "Acceleration" };
const TIERS = ["bronze", "silver", "gold", "platinum"];

const html = fs.readFileSync(process.argv[2], "utf8");
// The page data is in Next.js flight chunks: self.__next_f.push([1,"<json string>"]).
const flight = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)].map(m => JSON.parse(m[1])).join("");

// Each ability object: {"name":..,"slug":..,"description":..,"requirements":[{mode, position, archetype, slot, ratingFull, rating2, tiers}]}.
function readObject(text, start) {
  let depth = 0, inStr = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(text.slice(start, i + 1));
  }
  return null;
}
const slots = new Map();   // "pos|archetype" -> [ability per slot]
const descriptions = {};
for (const m of flight.matchAll(/\{"name":"[^"]+","slug":"/g)) {
  let a;
  try { a = readObject(flight, m.index); } catch { continue; }
  if (!a?.requirements) continue;
  if (typeof a.description === "string" && !a.description.startsWith("$")) descriptions[a.name] ??= a.description;
  for (const r of a.requirements) {
    if (r.mode !== "dynasty") continue;
    const key = `${r.position}|${r.archetype}`;
    if (!slots.has(key)) slots.set(key, []);
    const r2 = r.rating2 && r.rating2 !== "$undefined" ? SHORT[r.rating2] : null;
    if (r.rating2 && r.rating2 !== "$undefined" && !r2) throw new Error(`Unknown second rating ${r.rating2}`);
    slots.get(key)[r.slot - 1] = {
      name: a.name,
      rating: `${r.ratingFull}Rating`,
      rating2: r2 ? `${r2}Rating` : null,
      tiers: TIERS.map(t => r.tiers[t] ? [r.tiers[t].requirement, r.tiers[t].requirement2 || 0] : null)
    };
  }
}

const archetypes = {};
for (const [playerType, [pos, name]] of Object.entries(ARCHETYPES)) {
  const list = slots.get(`${pos}|${name}`);
  if (!list || list.some(x => !x)) throw new Error(`No complete ability list for ${pos} ${name}`);
  archetypes[playerType] = { name, abilities: list.map(x => ({ ...x, description: descriptions[x.name] || "" })) };
}
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "data", "abilities.json");
fs.writeFileSync(out, JSON.stringify({
  source: "TeamCrafters CFB 27 Dynasty Ability Requirements (teamcrafters.net/tools/cfb27/dynasty-abilities); archetype names mapped in tools/extract-abilities.mjs",
  tiers: ["Bronze", "Silver", "Gold", "Platinum"],
  archetypes
}, null, 1));
console.log(`Wrote ${Object.keys(archetypes).length} archetypes to ${out}`);
