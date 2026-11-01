// Fresh-copy proof for the read-only dynasty browser and its interaction with planning.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { Session } from '../lib/session.mjs';
import { dynastyView, teamPage, profile } from '../lib/gui-dynasty.mjs';
import { loadSettings } from '../lib/settings.mjs';
import { RATING_FIELDS } from '../lib/ratings-model.mjs';
import { buildPlan, emptyState } from '../lib/gui-plan.mjs';

const fixture = path.resolve('test_saves/DYNASTY-SIGNINGDAYCOPY');
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const sourceHash = hash(fixture);
fs.mkdirSync('test_runs', { recursive: true });
const dir = fs.mkdtempSync(path.resolve('test_runs/gui-dynasty-'));
const copy = path.join(dir, path.basename(fixture)); fs.copyFileSync(fixture, copy);
const s = new Session(); await s.open(copy, { userTeam: loadSettings().testSavesTeam });
const view = dynastyView(s);
assert.equal(view.teams.length, s.d.teams.size);
assert.equal(view.counts.rostered, view.teams.reduce((n,t) => n + t.rosterCount, 0));
assert.equal(view.counts.recruits, view.teams.reduce((n,t) => n + t.recruitCount, 0));
const named = [];
for (const name of ['Kansas', 'Alabama', 'Ohio State', 'Oregon']) {
  const t = s.d.findTeamByName(name), page = teamPage(s, t.index);
  assert.equal(page.roster.length, s.d.players.filter(p => p.team === t.index).length);
  assert.equal(page.upcoming.length, Object.values(page.rooms).flat().length);
  const recruit = page.recruits.find(p => p.committedHere);
  for (const player of [...page.roster.slice(0,2), ...(recruit ? [recruit] : [])]) {
    const card = profile(s, player.index);
    assert.equal(card.ratings.length, RATING_FIELDS.length);
    assert(card.ratings.every(r => Number.isFinite(r.value)));
    assert.equal(card.ovr, player.ovr);
    named.push({ school:name, name:card.name, position:card.pos, overall:card.ovr,
      status:card.status, attributes:card.ratings.length });
  }
}
const before = s.signingDayPlan({}, { seed:'sd-v1.2-001' });
const ids = [];
for (const t of before.teams) {
  const page = teamPage(s, t.teamIndex, before);
  assert.equal(page.upcoming.length, t.roster.length);
  ids.push(...page.upcoming.slice(0,1).map(p => p.index));
}
for (const id of ids) profile(s, id, before, {keep:new Set(),notAt:new Map()});
const after = s.signingDayPlan({}, { seed:'sd-v1.2-001' });
assert.equal(after.id, before.id, 'Browsing must not alter the plan');
assert.equal(hash(copy), sourceHash, 'Browsing and planning must not write the save');
assert.equal(hash(fixture), sourceHash, 'Source fixture must remain unchanged');
const result = { ok:true, sourceHash, planId:after.id, league:view.counts, summary:after.summary, named };
fs.writeFileSync(path.join(dir,'proof.json'), JSON.stringify(result,null,2));
// Recorded browser responses let layout work run without opening a save.
const state = emptyState();
fs.writeFileSync(path.join(dir,'view.json'), JSON.stringify(buildPlan(s,after,state)));
fs.writeFileSync(path.join(dir,'dynasty.json'), JSON.stringify(view));
fs.writeFileSync(path.join(dir,'school-pages.json'), JSON.stringify({
  native: Object.fromEntries([...s.d.teams.keys()].map(i => [i,teamPage(s,i)])),
  planned: Object.fromEntries([...s.d.teams.keys()].map(i => [i,teamPage(s,i,after)])) }));
const sample = [...new Set([...named.map(x => s.d.players.find(p => p.name === x.name)?.index),
  ...after.placements.slice(0,10).map(p => p.index), ...after.unplaced.slice(0,10).map(p => p.index)])].filter(Number.isInteger);
fs.writeFileSync(path.join(dir,'report.json'), JSON.stringify({namedPlayers:sample.map(i => profile(s,i,after,state)),nativePlayers:sample.map(i => profile(s,i))}));
const rated = s.teamRatingsPlan();
fs.writeFileSync(path.join(dir,'ratings.json'), JSON.stringify({...rated, save:{fileName:path.basename(copy),stage:s.stage.label},userTeam:view.userTeam}));
console.log(JSON.stringify({ ...result, proof:dir },null,2));
