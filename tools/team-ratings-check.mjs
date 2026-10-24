// Focused check: node tools/team-ratings-check.mjs [--save]
// One fixture copy; --save exercises the normal backup/reopen verification.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Session } from "../lib/session.mjs";
import { Dynasty, TEAM_RATING_FIELDS } from "../lib/dynasty.mjs";
import { calculateTeamRatings, buildTeamRatingsPlan } from "../lib/team-ratings.mjs";
import { startersFor } from "../lib/depth-chart.mjs";
import { loadSettings } from "../lib/settings.mjs";

const settings = loadSettings(), slots = startersFor({}, settings);
assert.deepEqual(calculateTeamRatings({}, slots).ratings, { overall: 40, offense: 40, defense: 40 });
assert.throws(() => calculateTeamRatings({}, { ...slots, CB: 3 }), /exactly 11/);
let index = 0;
const rooms = Object.fromEntries(Object.entries(slots).filter(([, n]) => Number.isInteger(n)).map(([room, n]) => [room,
  Array.from({ length: n * 2 }, () => ({ index: index++, name: room, room, overall: 80 }))]));
rooms.C.pop();
rooms.OG.push({ index: index++, name: "Spare guard", room: "OG", overall: 78 });
const calculated = calculateTeamRatings(rooms, slots);
const center = calculated.breakdown.offense.find(r => r.room === "C");
assert.equal(center.backups[0].sourceRoom, "OG");
assert.equal(center.backups[0].overall, 75);
const assigned = Object.values(calculated.breakdown).flat().flatMap(r => [...r.starters, ...r.backups]);
assert.equal(new Set(assigned.map(p => p.index)).size, assigned.length, "No player fills two slots");
const team = { index: 1, name: "Incomplete school", record: { index: 1, TEAM_RATINGOVR: 90, TEAM_RATINGOFF: 90, TEAM_RATINGDEF: 90 } };
const partial = buildTeamRatingsPlan({ teams: new Map([[1, team]]), stage: { supported: false },
  players: [{ index: 1, name: "QB", position: "QB", overall: 80, team: 1 }] }, settings).teams[0];
assert.equal(partial.after.defense, 40); assert.equal(partial.warnings.length, 1); assert.equal(partial.note, null);

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const source = path.resolve("test_saves/DYNASTY-SIGNINGDAYCOPY"), originalHash = hash(source);
fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.resolve("test_runs/team-ratings-v2-")), file = path.join(work, path.basename(source));
fs.copyFileSync(source, file);
const session = new Session();
await session.open(file, { userTeam: settings.testSavesTeam });
const current = session.teamRatingsPlan({ rosterBasis: "current" });
const plan = session.teamRatingsPlan({ rosterBasis: "upcoming" });
assert.notEqual(current.id, plan.id, "Roster basis is bound into the preview");
assert.equal(plan.counts.teams, 138);
const user = plan.teams.find(t => t.index === session.userTeam.teamIndex);
assert(user.changed, "Your school is included");
const namedPlayers = session.d.players.filter(p => ["Austin Mack", "Jonaz Walton", "Kyler Kasper"].includes(p.name))
  .map(p => ({ index: p.index, name: p.name, overall: p.overall, team: p.team }));
const substitutions = plan.teams.flatMap(t => Object.values(t.breakdown || {}).flat().flatMap(r => [...r.starters, ...r.backups]).filter(p => p.sourceRoom));
assert(substitutions.some(p => p.positionalModel), "Real linemen use their attribute-based positional model");
const report = { work, counts: plan.counts, substitutions: substitutions.length,
  namedTeams: plan.teams.filter(t => ["Kansas", "Georgia", "Ohio State"].includes(t.name)).map(t => ({ name: t.name, before: t.before, after: t.after })), namedPlayers, saved: false };
if (process.argv.includes("--save")) {
  await session.applyTeamRatings({ planId: plan.id });
  const saved = await session.save();
  assert.equal(hash(saved.backup.backupPath), originalHash);
  const reopened = await Dynasty.load(file);
  for (const t of plan.teams) for (const [key, field] of Object.entries(TEAM_RATING_FIELDS)) {
    assert.equal(Number(reopened.teams.get(t.index).record[field]), t.after[key]);
  }
  for (const p of namedPlayers) {
    const next = reopened.playerByIndex.get(p.index);
    assert.deepEqual({ index: next.index, name: next.name, overall: next.overall, team: next.team }, p);
  }
  report.saved = true; report.backup = saved.backup.backupPath; report.verification = saved.check;
}
assert.equal(hash(source), originalHash, "Fixture unchanged");
fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2));
console.log(`Team ratings passed: ${plan.counts.teams} schools, ${plan.counts.changed} changes, ${substitutions.length} modeled substitutions${report.saved ? ", backup/reopen verified" : ""}.`);
console.log(`Your school: ${user.name} ${user.before.overall} → ${user.after.overall}. Report: ${path.join(work, "report.json")}`);
