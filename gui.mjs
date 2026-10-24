// Signing Day GUI: a local web server for gui/, the team art and the JSON API.
//   node gui.mjs            (opens the browser; --no-open to skip)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Session } from "./lib/session.mjs";
import { dynastyView, teamPage, profile } from "./lib/gui-dynasty.mjs";
import { artDirsFor, listSaves, teamArt, emptyState, loadState, saveState, locksPath, lockCount, rawPlan, buildPlan, movesOf } from "./lib/gui-plan.mjs";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const GUI_DIR = path.join(APP_DIR, "gui");
const stateArgument = process.argv.indexOf("--state-file");
if (stateArgument !== -1 && !process.argv[stateArgument + 1]) throw new Error("--state-file needs a path.");
const STATE_PATH = stateArgument === -1 ? path.join(APP_DIR, "gui-state.json") : path.resolve(process.argv[stateArgument + 1]);
const PORT = 5178;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".txt": "text/plain; charset=utf-8" };

// The save opened on the start screen (Session.peek), then the session for the picked team,
// with its locks and review states (lib/gui-plan.mjs) and the last planner output.
let opened = null, session = null, state = null, raw = null, changes = null, activeTool = null;

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const inTestSaves = p => fs.realpathSync(p).split(/[\\/]+/).some(part => part.toLowerCase() === "test_saves");
const indexOf = (value, name) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new HttpError(400, `Choose a valid ${name}.`);
  return value;
};

// gui-state.json: last successfully opened save and the explicitly picked school for each path.
function guiState() { try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")) ?? {}; } catch { return {}; } }
function rememberSave(savePath, team) {
  const s = guiState();
  s.lastSavePath = savePath;
  if (team !== undefined) s.teams = { ...s.teams, [savePath]: team };
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

function closeSave() { opened = null; session = null; state = null; raw = null; changes = null; activeTool = null; }
function requirePlan() { if (!session || !raw || activeTool !== "transfers") throw new HttpError(409, "Open a save, select your team, and build a transfer plan first."); }
function rebuild() {
  const previous = raw;
  raw = rawPlan(session, state);
  state.seed = raw.seed;
  changes = previous ? comparePlans(previous, raw) : null;
}
const plan = () => ({ ...buildPlan(session, raw, state), changes });
const ratingsView = () => ({ ...session.reviewedRatings,
  save: { fileName: path.basename(session.d.filePath), stage: session.stage.label },
  userTeam: { ...session.userTeam, ...teamArt(session.userTeam.name) } });
function comparePlans(before, after) {
  const placement = list => new Map(list.map(p => [p.index, p.teamIndex]));
  const oldDestinations = placement(before.placements), newDestinations = placement(after.placements);
  const name = index => session.d.playerByIndex.get(index)?.name ?? `Player ${index}`;
  const school = index => index == null ? "Unplaced" : session.d.teamName(index);
  const destinations = [], status = [];
  for (const i of new Set([...oldDestinations.keys(), ...newDestinations.keys()])) {
    const a = oldDestinations.get(i) ?? null, b = newDestinations.get(i) ?? null;
    if (a === b) continue;
    destinations.push({ playerIndex: i, name: name(i), from: school(a), to: school(b) });
    if (a === null || b === null) status.push({ playerIndex: i, name: name(i), before: a === null ? "Unplaced" : "Placed", after: b === null ? "Unplaced" : "Placed" });
  }
  const oldCuts = new Set(before.cuts.map(p => p.index)), newCuts = new Set(after.cuts.map(p => p.index));
  const cuts = [...new Set([...oldCuts, ...newCuts])].filter(i => oldCuts.has(i) !== newCuts.has(i))
    .map(i => ({ playerIndex: i, name: name(i), before: oldCuts.has(i) ? "Released" : "Retained", after: newCuts.has(i) ? "Released" : "Retained" }));
  return { destinations, cuts, placement: status, seedChanged: before.seed !== after.seed, previousSeed: before.seed, seed: after.seed };
}

const api = {
  "GET /api/saves": () => listSaves(),
  "GET /api/startup": () => ({ lastSavePath: guiState().lastSavePath ?? null }),

  "POST /api/open": async ({ path: p }) => {
    const file = path.resolve(String(p || "").trim().replace(/^"(.*)"$/, "$1"));
    if (!p) throw new HttpError(400, "Give the path of a save file.");
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new HttpError(404, `There is no file at ${file}.`);
    if (inTestSaves(file)) throw new HttpError(400, "Refusing a file in test_saves/; copy the save first.");
    closeSave();
    const peek = await Session.peek(file);
    const teams = peek.teams.map(t => ({ index: t.index, name: t.name, short: t.short, colors: t.colors, ...teamArt(t.name, t.longName) }));
    const find = name => teams.find(t => t.name.toLowerCase() === String(name || "").trim().toLowerCase());
    const suggested = find(guiState().teams?.[peek.filePath]) ?? null;
    opened = peek;
    rememberSave(peek.filePath);
    return { path: peek.filePath, fileName: peek.fileName, stage: { id: peek.stage.id, label: peek.stage.label }, teams, suggestedUserTeam: suggested?.index ?? null };
  },

  "POST /api/user-team": async ({ teamIndex, seed, tool = "transfers" }) => {
    if (!opened) throw new HttpError(409, "Open a save first.");
    if (!["browse", "transfers", "team-ratings"].includes(tool)) throw new HttpError(400, "Choose a valid tool.");
    if (tool === "transfers" && opened.stage.id !== "signing-day") throw new HttpError(400, `The transfer tool works on a Signing Day save; this one is ${opened.stage.label}.`);
    const s = new Session();
    await s.open(opened.filePath, { userTeam: indexOf(teamIndex, "user team") });
    session = s;
    rememberSave(opened.filePath, s.userTeam.name);
    activeTool = tool;
    if (tool === "browse") {
      raw = null; state = null; changes = null;
      return dynastyView(session);
    }
    if (tool === "team-ratings") {
      raw = null; state = null; changes = null;
      session.teamRatingsPlan();
      return ratingsView();
    }
    try { state = loadState(opened.filePath); }   // undos and reviews from an earlier visit
    catch (e) { console.warn(`Ignoring an unreadable ${locksPath(opened.filePath)}: ${e.message}`); state = emptyState(); }
    raw = null; changes = null;
    if (seed !== undefined) state.seed = validSeed(seed);
    rebuild();
    return plan();
  },

  "GET /api/plan": () => { requirePlan(); return plan(); },

  "GET /api/dynasty": () => {
    if (!session) throw new HttpError(409, "Select your school first.");
    return dynastyView(session);
  },
  "GET /api/team": ({ index }) => {
    if (!session) throw new HttpError(409, "Select your school first.");
    const page = /^\d+$/.test(index ?? "") ? teamPage(session, Number(index), activeTool === "transfers" ? raw : null) : null;
    if (!page) throw new HttpError(404, "Unknown school.");
    return page;
  },
  "POST /api/tool": ({ tool }) => {
    if (!session) throw new HttpError(409, "Select your school first.");
    if (!["transfers", "team-ratings"].includes(tool)) throw new HttpError(400, "Choose a valid tool.");
    if (tool === "team-ratings") {
      session.teamRatingsPlan(); activeTool = tool;
      return ratingsView();
    }
    session.requireStage("signing-day");
    if (!state) {
      try { state = loadState(session.d.filePath); }
      catch (e) { console.warn(`Ignoring an unreadable ${locksPath(session.d.filePath)}: ${e.message}`); state = emptyState(); }
    }
    rebuild(); activeTool = tool;
    return plan();
  },

  "POST /api/replan": ({ seed }) => {
    requirePlan();
    if (seed !== undefined) state.seed = validSeed(seed);
    rebuild();
    saveState(session.d.filePath, state);
    return plan();
  },

  // Read-only profile for every player; include market detail when a preview is active.
  "GET /api/player": ({ index }) => {
    if (!session) throw new HttpError(409, "Select your school first.");
    const card = /^\d+$/.test(index ?? "") ? profile(session, Number(index), activeTool === "transfers" ? raw : null, state) : null;
    if (!card) throw new HttpError(404, "Unknown player.");
    return card;
  },

  // Undo: an IN row keeps the transfer away from that school (notAt); an OUT row keeps the player (keep).
  "POST /api/undo": ({ playerIndex, teamIndex, kind }) => {
    requirePlan();
    const p = indexOf(playerIndex, "player"), t = indexOf(teamIndex, "team");
    if (!session.d.playerByIndex.has(p)) throw new HttpError(400, "Unknown player.");
    if (kind === "in" && !session.d.teams.has(t)) throw new HttpError(400, "Unknown team.");
    if (kind === "in") { if (!state.notAt.has(p)) state.notAt.set(p, new Set()); state.notAt.get(p).add(t); }
    else if (kind === "out") {
      if (!raw.cuts.some(e => e.index === p && e.teamIndex === t)) throw new HttpError(400, "Only a planned veteran release can be kept. CPU withdrawals remain part of the market.");
      state.keep.add(p);
    }
    else throw new HttpError(400, 'kind must be "in" or "out".');
    rebuild();
    saveState(session.d.filePath, state);
    return plan();
  },

  "POST /api/restore": ({ playerIndex, teamIndex }) => {
    requirePlan();
    const p = indexOf(playerIndex, "player"), t = indexOf(teamIndex, "team"), schools = state.notAt.get(p);
    if (schools?.has(t)) { schools.delete(t); if (!schools.size) state.notAt.delete(p); }
    else state.keep.delete(p);
    rebuild();
    saveState(session.d.filePath, state);
    return plan();
  },

  "POST /api/review": ({ teamIndex, reviewed }) => {
    requirePlan();
    const t = Number(teamIndex), team = plan().teams.find(x => x.index === t);
    if (!team) throw new HttpError(404, "That team isn't in this plan.");
    if (reviewed) state.reviewed.set(t, movesOf(team)); else state.reviewed.delete(t);
    saveState(session.d.filePath, state);
    return plan();
  },

  // Writes the plan (with the undos) into the save: backup, write, reopen check (session.save).
  "POST /api/save": async ({ planId, tool = "transfers" }) => {
    if (tool === "team-ratings") {
      if (!session || activeTool !== tool || !session.reviewedRatings) throw new HttpError(409, "Preview team ratings before saving.");
      if (typeof planId !== "string" || planId !== session.reviewedRatings.id) throw new HttpError(409, "The ratings preview changed. Review the current ratings before saving.");
      const filePath = session.d.filePath, teamIndex = session.userTeam.teamIndex, counts = session.reviewedRatings.counts;
      let saved;
      try {
        await session.applyTeamRatings({ planId });
        saved = await session.save();
      } catch (e) {
        await session.open(filePath, { userTeam: teamIndex });
        session.teamRatingsPlan();
        return { ok: false, failed: [e.message] };
      }
      closeSave();
      return { ok: true, backupPath: saved.backup.backupPath, counts, tool };
    }
    if (tool !== "transfers") throw new HttpError(400, "Choose a valid tool.");
    requirePlan();
    if (typeof planId !== "string" || planId !== raw.id) throw new HttpError(409, "The reviewed plan has changed. Review the current plan before saving.");
    const filePath = session.d.filePath, teamIndex = session.userTeam.teamIndex;
    const counts = plan().summary, undos = lockCount(state);
    const applied = await session.applySigningDay({ keep: state.keep, notAt: state.notAt }, { planId });
    if (!applied.ok) { rebuild(); return { ok: false, failed: applied.failed }; }
    let saved;
    try { saved = await session.save(); }
    catch (e) {
      // Nothing was written; reopen so the next try starts from the file again.
      await session.open(filePath, { userTeam: teamIndex });
      rebuild();
      return { ok: false, failed: [e.message] };
    }
    fs.rmSync(locksPath(filePath), { force: true });
    closeSave();
    return { ok: true, backupPath: saved.backup.backupPath, counts, undos };
  }
};

function validSeed(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 200) throw new HttpError(400, "Enter a seed between 1 and 200 characters.");
  return value;
}

// One request at a time: rebuilds and saves never overlap.
let queue = Promise.resolve();
const serial = fn => (queue = queue.then(fn, fn));

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 1e6) reject(new HttpError(413, "Request too large.")); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new HttpError(400, "Bad JSON.")); } });
    req.on("error", reject);
  });
}

// gui/ files are no-store, so a plain refresh always loads the current page, styles and modules.
// Art (assets/…) is cached for a day, then revalidated by its date, so thousands of portraits
// aren't downloaded again on every render.
function serveFile(res, root, rel, cache = "no-store", req = null) {
  const file = path.resolve(root, "." + path.sep + rel);
  if (!file.startsWith(root + path.sep) || !TYPES[path.extname(file).toLowerCase()] || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, { error: "Not found." });
  const modified = fs.statSync(file).mtime.toUTCString();
  if (req && req.headers["if-modified-since"] === modified) { res.writeHead(304, { "cache-control": cache, "last-modified": modified }); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()], "cache-control": cache, "last-modified": modified });
  fs.createReadStream(file).pipe(res);
}

// Portraits prefer the full-size local originals, with bundled art as the fallback.
function serveArt(req, res, rel) {
  const has = dir => { const f = path.resolve(dir, "." + path.sep + rel); return f.startsWith(dir + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile(); };
  const dirs = artDirsFor(rel);
  serveFile(res, dirs.find(has) ?? dirs.at(-1), rel, "max-age=86400", req);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/api/")) {
    const handler = api[`${req.method} ${pathname}`];
    if (!handler) return send(res, 404, { error: "Unknown API call." });
    try {
      const body = req.method === "POST" ? await readJson(req) : Object.fromEntries(url.searchParams);
      send(res, 200, await serial(() => handler(body)));
    } catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status || 500, { error: e.message });
    }
    return;
  }
  if (pathname.startsWith("/assets/")) return serveArt(req, res, pathname.slice("/assets/".length));
  serveFile(res, GUI_DIR, pathname === "/" ? "index.html" : pathname.slice(1));
});

function openBrowser(url) {
  const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
}

// Port 5178, or the next free one. Windows can reserve whole port ranges (Hyper-V: EACCES), so
// a blocked port counts as taken and the search goes on past the range.
let port = PORT, tries = 300;
server.on("error", e => {
  if ((e.code === "EADDRINUSE" || e.code === "EACCES") && tries-- > 0) return server.listen(++port, "127.0.0.1");
  throw e;
});
server.on("listening", () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  console.log(`Signing Day GUI: ${url}  (Ctrl+C to stop)`);
  if (!process.argv.includes("--no-open")) openBrowser(url);
});
server.listen(port, "127.0.0.1");
