// Board-authoritative incoming-recruit membership on a fresh disposable copy.
// The copy is opened read-only; only evidence files in test_runs/ are written.
// node tools/recruit-ownership-test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { Session } from "../lib/session.mjs";
import { ZERO } from "../lib/dynasty.mjs";
import { loadSettings } from "../lib/settings.mjs";
import { buildMarketInput } from "../lib/market-input.mjs";
import { dynastyView, teamPage, profile } from "../lib/gui-dynasty.mjs";
import { nextSeasonTeam, roomOf } from "../lib/depth-chart.mjs";
import { buildTeamRatingsPlan } from "../lib/team-ratings.mjs";

const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const fixture = path.resolve("test_saves/DYNASTY-SIGNINGDAYCOPY"), sourceHash = hash(fixture);
fs.mkdirSync("test_runs", { recursive: true });
const work = fs.mkdtempSync(path.resolve("test_runs/recruit-ownership-"));
const copy = path.join(work, path.basename(fixture));
fs.copyFileSync(fixture, copy, fs.constants.COPYFILE_EXCL);
const report = { work, sourceHash };

try {
  const session = new Session();
  await session.open(copy, { userTeam: loadSettings().testSavesTeam });
  const d = session.d, input = buildMarketInput(d, session.userTeam.teamIndex);
  const owners = new Map(), byRef = new Map(d.players.map(p => [p.ref, p]));
  for (const team of d.teams.values()) {
    const board = d.rowAt(team.record, "CommittedPlayers");
    for (const key of Object.keys(board.row.fields).filter(k => /^Player\d+$/.test(k))) {
      const ref = board.row[key];
      if (ref === ZERO) continue;
      assert(!owners.has(ref), "Fixture board ownership must be unique");
      owners.set(ref, team.index);
    }
  }

  const elijah = d.players.find(p => p.name === "Elijah Murrell");
  assert(elijah && elijah.index === 4969 && elijah.isIncomingRecruit);
  const airForce = d.findTeamByName("Air Force").index, virginiaTech = d.findTeamByName("Virginia Tech").index;
  assert.equal(airForce, 0, "Authoritative TeamIndex zero must not trigger the fallback");
  assert.equal(owners.get(elijah.ref), airForce);
  assert.equal(d.topSchools(elijah.recruitRecord)[0].teamIndex, virginiaTech);
  assert.equal(elijah.destination, airForce, "Elijah must belong to his commitment-board school");
  assert.equal(profile(session, elijah.index).school.index, airForce);
  assert.equal(nextSeasonTeam(elijah, d.stage), airForce);
  assert(teamPage(session, airForce).recruits.some(p => p.index === elijah.index && p.committedHere));
  assert(!teamPage(session, virginiaTech).recruits.some(p => p.index === elijah.index && p.committedHere));

  const view = dynastyView(session), ratings = buildTeamRatingsPlan(d, session.settings, { rosterBasis: "upcoming" });
  const signed = d.players.filter(p => p.isIncomingRecruit && owners.has(p.ref));
  const uncommitted = d.players.filter(p => p.isIncomingRecruit && !["Signed", "HardCommitted"].includes(p.recruitStage));
  assert(uncommitted.length > 0, "Exercise real uncommitted recruits, including their existing school lists");
  for (const p of signed) assert.equal(p.destination, owners.get(p.ref), p.name);
  for (const p of uncommitted) {
    assert.equal(p.destination, null, `${p.name}: a school list is not a commitment`);
    assert.equal(nextSeasonTeam(p, d.stage), null);
  }
  const order = indices => indices.sort((a, b) => a - b);
  for (const team of input.teams) {
    const page = teamPage(session, team.index), native = team.nativeRoster.map(ref => byRef.get(ref));
    assert.deepEqual(order(page.upcoming.map(p => p.index)), order(native.map(p => p.index)), `${team.name}: browser and market membership`);
    assert.equal(view.teams.find(t => t.index === team.index).recruitCount,
      signed.filter(p => owners.get(p.ref) === team.index).length, `${team.name}: committed recruit count`);
    assert.equal(ratings.teams.find(t => t.index === team.index).rosterCount,
      native.filter(p => roomOf(p.position)).length, `${team.name}: upcoming-rating inputs`);
  }
  assert.equal(view.counts.recruits, signed.length);

  // Refresh behavior must retain the existing stage gate and missing-board
  // fallback. These isolated in-memory states are never saved or planned.
  const stage = elijah.recruitRecord.RecruitStage;
  try {
    elijah.recruitRecord.RecruitStage = "HardCommitted";
    d.refreshPlayer(elijah);
    assert.equal(elijah.destination, airForce);
    d.boardTeamByPlayerRef.delete(elijah.ref);
    d.refreshPlayer(elijah);
    assert.equal(elijah.destination, virginiaTech, "Retain the committed display fallback when no board owner is known");
    elijah.recruitRecord.RecruitStage = "Top10";
    d.refreshPlayer(elijah);
    assert.equal(elijah.destination, null, "Uncommitted recruits never inherit Top Schools #1");
  } finally {
    elijah.recruitRecord.RecruitStage = stage;
    d.boardTeamByPlayerRef.set(elijah.ref, airForce);
    d.refreshPlayer(elijah);
  }
  report.namedPlayers = ["Elijah Murrell", "David Murphy", "Justin Lawson"].map(name => {
    const p = d.players.find(p => p.name === name);
    return { index: p.index, name, school: profile(session, p.index).school.name,
      topSchool: d.teamName(d.topSchools(p.recruitRecord)[0].teamIndex), schoolYear: p.schoolYear };
  });
  report.league = { ...view.counts, boardOwnedRecruits: signed.length, uncommittedRecruits: uncommitted.length,
    upcomingPlayers: input.teams.reduce((n, t) => n + t.nativeRoster.length, 0), ratingPlayers: ratings.counts.countedPlayers };
  report.passed = true;
} catch (error) {
  report.passed = false; report.error = error.stack; throw error;
} finally {
  report.fixtureUnchanged = hash(fixture) === sourceHash;
  report.copyUnchanged = hash(copy) === sourceHash;
  fs.writeFileSync(path.join(work, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Recruit ownership evidence: ${path.join(work, "report.json")}`);
  assert(report.fixtureUnchanged && report.copyUnchanged, "Fixture and source copy must remain unchanged");
}
console.log(JSON.stringify({ namedPlayers: report.namedPlayers, league: report.league }, null, 2));
