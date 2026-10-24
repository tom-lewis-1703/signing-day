// GUI-only replay: node tools/gui-replay.mjs [--port 5188] [--fixture PATH]
// Serves current gui/ against recorded responses. No saves are opened or written.
// Browser actions must use CUA. This is not an algorithm/save correctness test.
// GET /__replay lists requests, full-card IDs and control state.
// POST /__replay {failNext:['/api/review'], delays:{'/api/player?index=4829':1200}}
// configures one-shot failures/delays; {reset:true} resets all replay state.
// /api/save always refuses: use the real GUI on a disposable copy for save proof.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { artDirsFor } from '../lib/gui-plan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const port = Number(value('--port', 5188));
const fixture = path.resolve(root, value('--fixture', 'test_runs/market-v1.2-hWymkF'));
const source = JSON.parse(fs.readFileSync(path.join(fixture, 'view.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(fixture, 'report.json'), 'utf8'));
const optional = name => fs.existsSync(path.join(fixture,name)) ? JSON.parse(fs.readFileSync(path.join(fixture,name),'utf8')) : null;
const dynasty = optional('dynasty.json'), pages = optional('school-pages.json'), rated = optional('ratings.json');
const cards = new Map(report.namedPlayers.map(card => [card.index, card]));
const nativeCards = new Map((report.nativePlayers ?? report.namedPlayers).map(card => [card.index,card]));
const nativeRows = new Map(Object.values(pages?.native ?? {}).flatMap(t => [...t.roster,...t.recruits,...t.transfersIn,...t.transfersOut]).map(row => [row.index,row]));
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.webp':'image/webp', '.png':'image/png' };
const requests = [];
let plan, locks, activeName, failNext, delays, activeTool;
let lastSavePath = null;
const rememberedTeams = new Map();
const reset = () => {
  plan = structuredClone(source); locks = new Map(); activeName = 'GUI-REPLAY';
  activeTool = 'browse';
  failNext = []; delays = {}; requests.length = 0;
};
reset();
const send = (res, status, body) => {
  res.writeHead(status, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
  res.end(JSON.stringify(body));
};
const json = async req => {
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1e6) throw new Error('Body too large'); }
  return body ? JSON.parse(body) : {};
};
const teamInfo = team => ({ index:team.index, name:team.name, short:team.short, colors:team.colors, logo:team.logo });
const response = () => ({ ...plan, save:{ ...plan.save, fileName:activeName, filePath:`replay://${activeName}` } });
const findRow = index => plan.teams.flatMap(t => [...t.in,...t.out,...t.kept]).find(row => row.playerIndex === index) ?? plan.unplaced.find(row => row.playerIndex === index) ?? Object.values(pages?.native ?? {}).flatMap(t => [...t.roster,...t.recruits,...t.transfersIn,...t.transfersOut]).find(row => row.index === index);
function cardFor(index) {
  const recorded = (activeTool === 'transfers' ? cards : nativeCards).get(index);
  const row = findRow(index);
  if (!recorded && !row) return null;
  // Detailed numerical cards are exact recorded responses. Other links get a
  // deliberately minimal row-derived card, never invented model measurements.
  const card = recorded ? structuredClone(recorded) : {
    index, name:row.name, pos:row.pos, ovr:row.ovr, year:nativeRows.get(index)?.year || '', dev:nativeRows.get(index)?.dev || '', portrait:nativeRows.get(index)?.portrait,
    status:row.kind === 'release' ? 'RELEASED' : row.kind === 'placed' ? 'PLACED' : 'UNPLACED',
    from:row.from ? {name:row.from} : null,
    to:(() => { const team = plan.teams.find(t => t.in.some(p => p.playerIndex === index)); return team ? teamInfo(team) : null; })(),
    why:'Replay row only; this player has no recorded detailed card.', facts:{}, undos:[]
  };
  return card;
}
function constraint(body, restore = false) {
  const team = plan.teams.find(t => t.index === body.teamIndex);
  if (!team) throw new Error('Unknown team');
  const key = `${body.teamIndex}:${body.playerIndex}`;
  if (restore) {
    const prior = locks.get(key);
    if (prior) { team[prior.direction].push(prior.row); locks.delete(key); }
    team.kept = team.kept.filter(row => row.playerIndex !== body.playerIndex);
  } else {
    const direction = body.kind === 'in' ? 'in' : 'out';
    const row = team[direction].find(r => r.playerIndex === body.playerIndex);
    if (!row) throw new Error('Unknown move');
    locks.set(key, {row,direction});
    team[direction] = team[direction].filter(r => r !== row);
    team.kept.push({...row, lock:direction === 'in' ? 'notAt' : 'keep', now:'Replay constraint'});
  }
  plan.locks.count = locks.size;
  team.status = 'RE-CHECK';
  plan.changes = { destinations:[], cuts:[], placement:[], seedChanged:false };
  return response();
}
function staticFile(res, dir, rel) {
  const file = path.resolve(dir, rel);
  if (!file.startsWith(dir + path.sep) || !mime[path.extname(file)] || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, {'content-type':mime[path.extname(file)], 'cache-control':'no-store'});
  fs.createReadStream(file).pipe(res); return true;
}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const route = url.pathname;
    const body = req.method === 'POST' ? await json(req) : {};
    if (route === '/__replay') {
      if (req.method === 'POST') {
        if (body.reset) { reset(); lastSavePath = null; rememberedTeams.clear(); }
        if (body.failNext) failNext = [...body.failNext];
        if (body.delays) delays = {...body.delays};
      }
      return send(res,200,{ fixture, fullCards:report.namedPlayers.map(c => ({index:c.index,name:c.name})), requests, failNext, delays });
    }
    if (route.startsWith('/api/')) {
      requests.push({method:req.method,path:req.url,body,time:Date.now()});
      const delay = Number(delays[req.url] ?? delays[route] ?? 0);
      if (delay > 0) await new Promise(resolve => setTimeout(resolve,delay));
      const fail = failNext.indexOf(route);
      if (fail !== -1) { failNext.splice(fail,1); return send(res,503,{error:`Replay failure for ${route}`}); }
      if (route === '/api/saves') return send(res,200,['GUI-REPLAY','GUI-REPLAY-SECOND'].map(name => ({name,path:`replay://${name}`,modified:'2026-10-23T12:00:00Z'})));
      if (route === '/api/startup') return send(res,200,{lastSavePath});
      if (route === '/api/open') {
        const name = String(body.path).split('/').at(-1); reset(); activeName = name;
        lastSavePath = `replay://${name}`;
        return send(res,200,{path:lastSavePath,fileName:name,stage:{id:'signing-day',label:'Signing Day'},teams:[...plan.teams,plan.userTeam].map(teamInfo),suggestedUserTeam:rememberedTeams.get(lastSavePath) ?? null});
      }
      if (route === '/api/user-team') {
        if (body.teamIndex !== plan.userTeam.index) return send(res,400,{error:`Recorded replay requires ${plan.userTeam.name}; explicitly select it.`});
        rememberedTeams.set(lastSavePath, body.teamIndex);
        if (body.tool === 'browse') {
          if (!dynasty) return send(res,409,{error:'This legacy replay lacks dynasty pages. Run node tools/gui-dynasty-check.mjs, then restart replay with --fixture set to its output folder.'});
          activeTool = 'browse'; return send(res,200,dynasty);
        }
        if (body.seed) plan.seed = body.seed;
        return send(res,200,response());
      }
      if (route === '/api/dynasty') return send(res,200,dynasty);
      if (route === '/api/team') {
        const page = pages?.[activeTool === 'transfers' ? 'planned' : 'native']?.[url.searchParams.get('index')];
        return send(res,page ? 200 : 404,page ?? {error:'No recorded school page.'});
      }
      if (route === '/api/tool') {
        activeTool = body.tool;
        return send(res,200,body.tool === 'team-ratings' ? rated : response());
      }
      if (route === '/api/plan') return send(res,200,response());
      if (route === '/api/replan') {
        const previousSeed = plan.seed; plan.seed = body.seed ?? plan.seed;
        plan.changes = {destinations:[],cuts:[],placement:[],seedChanged:previousSeed !== plan.seed,previousSeed,seed:plan.seed};
        return send(res,200,response());
      }
      if (route === '/api/review') {
        const team = plan.teams.find(t => t.index === body.teamIndex);
        if (!team) return send(res,404,{error:'Unknown team'});
        team.status = body.reviewed ? 'REVIEWED' : 'CHANGED'; return send(res,200,response());
      }
      if (route === '/api/undo') return send(res,200,constraint(body));
      if (route === '/api/restore') return send(res,200,constraint(body,true));
      if (route === '/api/player') {
        const card = cardFor(Number(url.searchParams.get('index')));
        return send(res,card ? 200 : 404,card ?? {error:'No recorded player row'});
      }
      if (route === '/api/save') return send(res,409,{error:'Replay cannot save. Run save verification on a disposable copy in the real GUI.'});
      return send(res,404,{error:'Unknown replay API'});
    }
    const rel = decodeURIComponent(route).replace(/^\//,'');
    if (route.startsWith('/assets/')) {
      const artRel = rel.slice('assets/'.length);
      for (const dir of artDirsFor(artRel)) if (staticFile(res,dir,artRel)) return;
    } else if (staticFile(res,path.join(root,'gui'),rel || 'index.html')) return;
    send(res,404,{error:'Not found'});
  } catch (e) { send(res,500,{error:e.message}); }
});
server.listen(port,'127.0.0.1',() => console.log(`GUI replay: http://127.0.0.1:${port}/ (no save access)`));
