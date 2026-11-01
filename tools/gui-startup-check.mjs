// Fresh-copy HTTP proof: startup remembers a save and its explicitly chosen school,
// while reopening remains read-only and never builds a tool preview.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { loadSettings } from '../lib/settings.mjs';
import { RATING_FIELDS } from '../lib/ratings-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(root, 'test_saves', 'DYNASTY-SIGNINGDAYCOPY');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHash = hash(fixture);
fs.mkdirSync(path.join(root, 'test_runs'), { recursive: true });
const dir = fs.mkdtempSync(path.join(root, 'test_runs', 'gui-startup-'));
const copy = path.join(dir, path.basename(fixture));
const stateFile = path.join(dir, 'gui-state.json');
fs.copyFileSync(fixture, copy);
const log = [];
const requests = [];
let child = null;
let base = null;

async function start() {
  assert.equal(child, null);
  child = spawn(process.execPath, [path.join(root, 'gui.mjs'), '--no-open', '--state-file', stateFile], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  const running = child;
  base = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('GUI did not announce its address within 30 seconds.')), 30_000);
    const done = (error, url) => {
      clearTimeout(timer);
      running.off('error', onError);
      running.off('exit', onExit);
      if (error) reject(error); else resolve(url);
    };
    const onError = error => done(error);
    const onExit = code => done(new Error(`GUI exited before startup (${code}).`));
    running.once('error', onError);
    running.once('exit', onExit);
    running.stdout.on('data', data => {
      const text = String(data);
      log.push(text);
      output += text;
      const address = output.match(/Signing Day GUI: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
      if (address) done(null, address);
    });
    running.stderr.on('data', data => log.push(String(data)));
  });
}

async function stop() {
  const running = child;
  child = null;
  base = null;
  if (!running || running.exitCode !== null || running.signalCode !== null) return;
  const closed = once(running, 'close');
  running.kill();
  await closed;
}

async function request(endpoint, body, expected = 200) {
  const method = body === undefined ? 'GET' : 'POST';
  requests.push(`${method} ${endpoint}`);
  const response = await fetch(new URL(endpoint, base), {
    method, headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120_000)
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${endpoint}: ${JSON.stringify(result)}`);
  return result;
}

const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const readonly = () => {
  assert.equal(hash(copy), sourceHash, 'Startup and browsing must not change the copied save.');
  assert.equal(hash(fixture), sourceHash, 'The source fixture must remain unchanged.');
};
const noPlan = () => request('/api/plan', undefined, 409);

try {
  await start();
  assert.deepEqual(await request('/api/startup'), { lastSavePath: null });
  assert(!fs.existsSync(stateFile), 'Reading startup must not create preferences.');

  const opened = await request('/api/open', { path: copy });
  assert.equal(opened.path, copy);
  assert.equal(opened.suggestedUserTeam, null, 'A new save must not silently pick a school.');
  assert.equal(state().lastSavePath, copy);
  const teamName = loadSettings().testSavesTeam;
  assert.equal(typeof teamName, 'string', 'settings.testSavesTeam must name the fixture school.');
  const team = opened.teams.find(t => t.name.toLowerCase() === teamName.trim().toLowerCase());
  assert(team, `Fixture does not contain the configured school ${teamName}.`);
  await request('/api/dynasty', undefined, 409);
  await noPlan();

  const beforeBadChoice = fs.readFileSync(stateFile, 'utf8');
  await request('/api/user-team', { teamIndex: -1, tool: 'browse' }, 400);
  assert.equal(fs.readFileSync(stateFile, 'utf8'), beforeBadChoice, 'An invalid school must not be remembered.');
  const firstView = await request('/api/user-team', { teamIndex: team.index, tool: 'browse' });
  assert.equal(firstView.userTeam.index, team.index);
  assert.equal(state().teams[copy], team.name);
  assert.equal(state().lastSavePath, copy);
  await noPlan();
  readonly();

  await stop();
  await start();
  assert.deepEqual(await request('/api/startup'), { lastSavePath: copy });
  await request('/api/dynasty', undefined, 409);
  const reopened = await request('/api/open', { path: copy });
  assert.equal(reopened.suggestedUserTeam, team.index, 'The remembered school must resolve against this save.');
  await request('/api/dynasty', undefined, 409);
  await noPlan();
  await request('/api/user-team', { teamIndex: reopened.suggestedUserTeam, tool: 'browse' });
  const dynasty = await request('/api/dynasty');
  assert.deepEqual(dynasty.counts, firstView.counts, 'Restart must preserve league counts.');
  assert.equal(dynasty.counts.teams, dynasty.teams.length);
  assert.equal(dynasty.counts.rostered, dynasty.teams.reduce((n, t) => n + t.rosterCount, 0));
  assert.equal(dynasty.counts.recruits, dynasty.teams.reduce((n, t) => n + t.recruitCount, 0));
  assert.equal(dynasty.userTeam.name, team.name);
  const named = [];
  for (const name of [team.name, 'Alabama', 'Ohio State']) {
    const school = dynasty.teams.find(t => t.name === name);
    assert(school?.topPlayers.length, `No roster sample for ${name}.`);
    const player = school.topPlayers[0];
    const card = await request(`/api/player?index=${player.index}`);
    assert.equal(card.name, player.name);
    assert.equal(card.ovr, player.ovr);
    assert.equal(card.school.index, school.index);
    assert.equal(card.ratings.length, RATING_FIELDS.length);
    assert(card.ratings.every(r => Number.isFinite(r.value)));
    named.push({ school: name, name: card.name, position: card.pos, overall: card.ovr,
      attributes: card.ratings.length });
  }
  await noPlan();

  const missing = path.join(dir, 'MISSING-SAVE');
  await request('/api/open', { path: missing }, 404);
  assert.equal((await request('/api/startup')).lastSavePath, copy, 'A failed open must not replace the last successful save.');
  readonly();

  // A removed school produces a picker rather than a made-up replacement.
  await stop();
  fs.writeFileSync(stateFile, JSON.stringify({ ...state(), teams: { [copy]: 'No Such School' } }, null, 2));
  await start();
  assert.equal((await request('/api/open', { path: copy })).suggestedUserTeam, null);
  await request('/api/dynasty', undefined, 409);
  await noPlan();

  // The browser owns the missing-file fallback; the startup endpoint exposes the
  // remembered path, and trying to open it reports a clear 404.
  await stop();
  fs.writeFileSync(stateFile, JSON.stringify({ ...state(), lastSavePath: missing }, null, 2));
  await start();
  assert.equal((await request('/api/startup')).lastSavePath, missing);
  await request('/api/open', { path: missing }, 404);
  await request('/api/dynasty', undefined, 409);
  await noPlan();
  readonly();
  assert(requests.every(r => !/\/api\/(?:tool|replan|save|undo|restore|review)(?:\?|$)/.test(r)), 'Proof must not build plans or write saves.');
  const result = { ok: true, sourceHash, copyHash: hash(copy), rememberedSchool: team.name,
    league: dynasty.counts, named, checks: ['empty startup', 'last successful save persisted',
      'explicit school persisted', 'restart resolves remembered school', 'browse only; no preview',
      'failed open retains last save', 'stale school returns picker', 'missing save reports 404',
      'source and copy unchanged'], requests };
  fs.writeFileSync(path.join(dir, 'proof.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, proof: dir }, null, 2));
} finally {
  await stop();
  fs.writeFileSync(path.join(dir, 'server.log'), log.join(''));
}
