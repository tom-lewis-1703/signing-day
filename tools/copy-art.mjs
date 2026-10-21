// Usage: node tools/copy-art.mjs ["<DynastyOS Assets folder>"]
// Fills gui/art/ with the slim copy of the DynastyOS asset library the GUI uses (GUI-PLAN.md §2.3),
// so it can be committed and cloud sessions can render art. Paths mirror the library's, so the
// assets/… URLs stay the same:
//   logos-flat-dark/, helmet/left/       copied unchanged
//   playerportrait-files.txt             every portrait file name in the library, sorted
//   playerportrait/nilpp_Unique_*.webp   those matching a player in any test_saves/ save, by name
//                                        (letters and digits only, any case) or by his head asset
//                                        (lib/gui-plan.mjs portraitFile: a cut-short head drops its "-")
//   playerportrait/nilpp_Generic_*.webp  all of them
//   playerportrait/nilpp_Blank.webp      the card's "file missing" portrait
// Portraits are resized to 256×256 webp, alpha kept. Read-only on the library and test_saves/;
// re-running replaces gui/art/.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { openFranchise } from "../lib/dynasty.mjs";
import { ART_DIR, ASSETS_DIR, portraitFile } from "../lib/gui-plan.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SAVES = path.join(ROOT, "test_saves");
const PLAYER_UID = 1612938518;
const SIZE = 256;
const COPY_DIRS = ["logos-flat-dark", path.join("helmet", "left")];
const PORTRAITS = "playerportrait";

const lib = path.resolve(process.argv[2] || ASSETS_DIR);
const key = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fail = msg => { console.error(msg); process.exit(1); };

if (!fs.existsSync(path.join(lib, PORTRAITS))) fail(`No ${PORTRAITS}/ folder in "${lib}". Pass the DynastyOS Assets folder.`);
const portraitFiles = fs.readdirSync(path.join(lib, PORTRAITS), { withFileTypes: true })
  .filter(e => e.isFile()).map(e => e.name).sort();

// Unique portraits by name key: nilpp_Unique_<LastFirst>_<n>.webp
const uniqueByKey = new Map();
for (const f of portraitFiles) {
  const m = /^nilpp_Unique_(.+)_\d+\.webp$/i.exec(f);
  if (!m) continue;
  const k = key(m[1]);
  if (!uniqueByKey.has(k)) uniqueByKey.set(k, []);
  uniqueByKey.get(k).push(f);
}
const portraitSet = new Set(portraitFiles);

// Players in every test save (opened read-only: saveOnChange is off and nothing is saved).
const wanted = new Set();
const saveStats = [];
for (const name of fs.readdirSync(SAVES).sort()) {
  const file = path.join(SAVES, name);
  if (!fs.statSync(file).isFile()) continue;
  const f = await openFranchise(file);
  const t = f.getTableByUniqueId(PLAYER_UID);
  await t.readRecords(["FirstName", "LastName", "GenericHeadAssetName"]);
  const s = { name, players: 0, byName: 0, byHead: 0, either: 0 };
  for (const r of t.records) {
    if (!r || r.isEmpty || !`${r.FirstName || ""}${r.LastName || ""}`.trim()) continue;
    s.players++;
    const named = uniqueByKey.get(key(`${r.LastName}${r.FirstName}`)) || [];
    const head = portraitFile(r.GenericHeadAssetName);
    const hasHead = head && portraitSet.has(head);
    for (const p of named) wanted.add(p);
    if (hasHead && /^nilpp_Unique_/i.test(head)) wanted.add(head);
    if (named.length) s.byName++;
    if (hasHead) s.byHead++;
    if (named.length || hasHead) s.either++;
  }
  saveStats.push(s);
}

// Start clean, then copy.
fs.rmSync(ART_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(ART_DIR, PORTRAITS), { recursive: true });
const counts = {};
for (const dir of COPY_DIRS) {
  const src = path.join(lib, dir);
  if (!fs.existsSync(src)) { console.warn(`Missing in the library: ${dir}/`); counts[dir] = 0; continue; }
  fs.cpSync(src, path.join(ART_DIR, dir), { recursive: true });
  counts[dir] = fs.readdirSync(src).length;
}
fs.writeFileSync(path.join(ART_DIR, "playerportrait-files.txt"), portraitFiles.join("\n") + "\n");

const unique = [...wanted].sort();
const generic = portraitFiles.filter(f => /^nilpp_Generic_.*\.webp$/i.test(f));
const blank = portraitFiles.filter(f => /^nilpp_Blank\.webp$/i.test(f));
const jobs = [...unique, ...generic, ...blank];
let next = 0, done = 0;
const resize = async () => {
  while (next < jobs.length) {
    const f = jobs[next++];
    await sharp(path.join(lib, PORTRAITS, f)).resize(SIZE, SIZE).webp({ quality: 80, alphaQuality: 100 })
      .toFile(path.join(ART_DIR, PORTRAITS, f));
    if (++done % 1000 === 0) console.log(`  ${done} / ${jobs.length} portraits`);
  }
};
await Promise.all(Array.from({ length: Math.max(4, os.availableParallelism?.() ?? 4) }, resize));

const sizeOf = dir => fs.readdirSync(dir, { withFileTypes: true })
  .reduce((a, e) => a + (e.isDirectory() ? sizeOf(path.join(dir, e.name)) : fs.statSync(path.join(dir, e.name)).size), 0);
const mb = n => n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

console.log(`\nLibrary: ${lib}\nWrote:   ${ART_DIR}\n`);
for (const dir of COPY_DIRS) console.log(`${dir.padEnd(28)} ${String(counts[dir]).padStart(6)} files  ${mb(fs.existsSync(path.join(ART_DIR, dir)) ? sizeOf(path.join(ART_DIR, dir)) : 0)}`);
console.log(`${"playerportrait-files.txt".padEnd(28)} ${String(portraitFiles.length).padStart(6)} names`);
console.log(`${"portraits Unique (matched)".padEnd(28)} ${String(unique.length).padStart(6)} of ${[...uniqueByKey.values()].flat().length}`);
console.log(`${"portraits Generic".padEnd(28)} ${String(generic.length).padStart(6)}`);
console.log(`${"portraits Blank".padEnd(28)} ${String(blank.length).padStart(6)}`);
console.log(`${"portraits total".padEnd(28)} ${String(jobs.length).padStart(6)} files  ${mb(sizeOf(path.join(ART_DIR, PORTRAITS)))}\n`);
console.log("Players with a portrait, per save (by name / by head asset / either, of all players):");
for (const s of saveStats) console.log(`  ${s.name.padEnd(32)} ${s.byName} / ${s.byHead} / ${s.either} of ${s.players}`);
console.log(`\ngui/art/ total: ${mb(sizeOf(ART_DIR))}`);
