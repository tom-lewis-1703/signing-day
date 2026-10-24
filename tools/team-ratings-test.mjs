// node tools/team-ratings-test.mjs [--save]
// All writes use a unique disposable fixture copy, never test_saves/.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Session } from "../lib/session.mjs";
import { Dynasty, TEAM_RATING_FIELDS } from "../lib/dynasty.mjs";
import { calculateTeamRatings, buildTeamRatingsPlan } from "../lib/team-ratings.mjs";
import { loadSettings } from "../lib/settings.mjs";
import { changedRecords } from "../lib/roster-edits.mjs";

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fixtureHashes = () => Object.fromEntries(fs.readdirSync("test_saves").filter(n => fs.statSync(path.join("test_saves", n)).isFile()).map(n => [n, hash(path.join("test_saves", n))]));
const fixtures = fixtureHashes();
const slots = { QB: 1, HB: 1, FB: 0, WR: 3, TE: 1, OT: 2, OG: 2, C: 1, EDGE: 2, DT: 2, LB: 3, CB: 2, S: 2 };
let index = 0;
const roster = (first = 80, second = 80) => Object.fromEntries(Object.entries(slots).map(([room, count]) => [room,
  Array.from({ length: count * 2 }, (_, i) => ({ index: index++, name: `${room} ${i}`, overall: i < count ? first : second }))]));
const ratings = rooms => calculateTeamRatings(rooms, slots).ratings;
assert.deepEqual(ratings(roster()), { overall: 80, offense: 80, defense: 80 });
assert.deepEqual(ratings(roster(100, 100)), { overall: 99, offense: 99, defense: 99 });
assert.deepEqual(ratings(roster(80, 60)), { overall: 76, offense: 76, defense: 76 }, "Backups provide 20% of the rating");
const qb = roster(), hb = roster();
qb.QB.forEach(p => p.overall = 92); hb.HB.forEach(p => p.overall = 92);
assert.equal(ratings(qb).offense, 82); assert.equal(ratings(hb).offense, 81, "QB has twice a single slot's weight");
const buried = roster(); buried.QB.push({ index: index++, name: "Buried", overall: 30 });
buried.FB.push({ index: index++, name: "Unused FB", overall: 99 });
buried.K = [{ index: index++, name: "Kicker", overall: 99 }];
assert.deepEqual(ratings(buried), ratings(roster()), "Buried depth, unused scheme slots and specialists do not dilute ratings");
assert.deepEqual(ratings(Object.fromEntries(Object.entries(buried).map(([k, ps]) => [k, [...ps].reverse()]))), ratings(buried));
assert.deepEqual(ratings({}), { overall: 40, offense: 40, defense: 40 }, "Empty slots have a fixed replacement rating");
const short = calculateTeamRatings({ QB: [{ index: 1, name: "Only QB", overall: 90 }] }, slots).breakdown.offense[0];
assert.equal(short.score, 80); assert.equal(short.missingBackups, 1);
const settings = loadSettings(), userTeam = settings.testSavesTeam;
const placeholder = { index: 1, name: "Empty school", record: { index: 3, TEAM_RATINGOVR: 75, TEAM_RATINGOFF: 76, TEAM_RATINGDEF: 74 } };
const skipped = buildTeamRatingsPlan({ teams: new Map([[1, placeholder]]), players: [], stage: { supported: false } }, settings);
assert.equal(skipped.counts.skipped, 1); assert.deepEqual(skipped.teams[0].after, skipped.teams[0].before);

fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.resolve("test_runs/team-ratings-"));
const source = path.resolve("test_saves/DYNASTY-SIGNINGDAYCOPY"), file = path.join(work, "DYNASTY-SIGNINGDAYCOPY");
fs.copyFileSync(source, file);
const s = new Session();
await assert.rejects(s.open(file), /Select your user team/);
await assert.rejects(s.open(file, { userTeam: "No such school" }), /not in this save/);
await s.open(file, { userTeam });
const before = hash(file), p = s.teamRatingsPlan();
assert.equal(hash(file), before, "Preview never writes the save");
assert.equal(p.teams.length, s.d.teams.size);
assert.equal(p.counts.teams, 138); assert.equal(p.counts.players, 16233);
assert.equal(s.reviewedPlan, null, "Ratings preview never builds a transfer market");
const user = p.teams.find(t => t.index === s.userTeam.teamIndex);
assert(user.changed, "The selected user school is included in ratings recalculation");
assert.equal(p.rosterBasis, "upcoming");
assert.equal(p.id, s.teamRatingsPlan().id, "Preview is deterministic");
await assert.rejects(s.applyTeamRatings({ planId: "stale" }), /Review the current/);
s.reviewedRatings.teams[0].after.overall++;
await assert.rejects(s.applyTeamRatings({ planId: s.reviewedRatings.id }), /Review the current/);
await s.open(file, { userTeam });
let preview = s.teamRatingsPlan();
fs.appendFileSync(file, Buffer.from([0]));
await assert.rejects(s.applyTeamRatings({ planId: preview.id }), /changed after review/);
fs.copyFileSync(source, file);
await s.open(file, { userTeam }); preview = s.teamRatingsPlan();
// An in-memory roster change after preview must invalidate it too.
const player = s.d.playerByIndex.get(user.breakdown.offense[0].starters[0].index);
player.overall--;
await assert.rejects(s.applyTeamRatings({ planId: preview.id }), /loaded roster or ratings changed/);

const fixtureSession = new Session(); await fixtureSession.open(source, { userTeam });
const fixturePreview = fixtureSession.teamRatingsPlan();
await assert.rejects(fixtureSession.applyTeamRatings({ planId: fixturePreview.id }), /Refusing to write test_saves/);
const preseason = new Session(); await preseason.open("test_saves/DYNASTY-PRESEASONCOPY", { userTeam });
const preseasonPreview = preseason.teamRatingsPlan();
assert.equal(preseasonPreview.rosterBasis, "current");
assert.equal(preseasonPreview.counts.teams, 138);

await s.open(file, { userTeam }); preview = s.teamRatingsPlan();
const namedTeams = preview.teams.filter(t => ["Kansas", "Georgia", "Alabama", "Ohio State", "Ball State"].includes(t.name)).map(t => ({ name: t.name, before: t.before, after: t.after, players: t.rosterCount }));
const namedPlayers = user.breakdown.offense.filter(r => ["QB", "HB", "WR"].includes(r.room)).flatMap(r => r.starters).slice(0, 5);
const report = { work, counts: preview.counts, namedTeams, namedPlayers, preseasonCounts: preseasonPreview.counts, saved: false };
if (process.argv.includes("--save")) {
  await s.applyTeamRatings({ planId: preview.id });
  assert.throws(() => s.signingDayPlan(), /Reopen the save/);
  await assert.rejects(s.applySigningDay(null, { planId: "anything" }), /unsaved edits/);
  // A write to an unrelated field in an otherwise allowed Team row must be caught.
  const target = s.d.teams.get(user.index).record;
  target.TeamPrestige = Number(target.TeamPrestige) === 1 ? 2 : 1;
  await assert.rejects(s.save(), /beyond the reviewed team ratings/);
  assert.equal(hash(file), before, "Failed verification preserves the source bytes");
  await s.open(file, { userTeam }); preview = s.teamRatingsPlan();
  await s.applyTeamRatings({ planId: preview.id });
  const saved = await s.save();
  assert.equal(hash(saved.backup.backupPath), before, "Backup matches the original exactly");
  const reopened = await Dynasty.load(file);
  const original = await Dynasty.load(source);
  const differences = await changedRecords(original.franchise, reopened.franchise);
  assert.equal(differences.length, preview.counts.changed);
  assert(differences.every(c => c.tableId === reopened.tables.team.header.tableId && preview.teams.some(t => t.changed && t.row === c.row)), "Only reviewed team records changed");
  for (const t of preview.teams) for (const [key, field] of Object.entries(TEAM_RATING_FIELDS)) assert.equal(Number(reopened.teams.get(t.index).record[field]), t.after[key], `${t.name} ${key} persisted`);
  for (const player of namedPlayers) {
    const a = original.playerByIndex.get(player.index), b = reopened.playerByIndex.get(player.index);
    assert.equal(b.name, a.name); assert.equal(b.overall, a.overall); assert.equal(b.team, a.team); assert.equal(b.destination, a.destination);
  }
  const again = new Session(); await again.open(file, { userTeam });
  assert.equal(again.teamRatingsPlan().counts.changed, 0, "Recalculation is idempotent");
  report.saved = true; report.backupPath = saved.backup.backupPath; report.verification = saved.check;
}
assert.deepEqual(fixtureHashes(), fixtures, "Every source fixture remains unchanged");
fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log("Team-ratings formula, selection/source guards, preview isolation, and fixture preservation passed.");
