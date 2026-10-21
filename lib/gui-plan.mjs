// Signing Day GUI (GUI-PLAN.md §5–6): the Plan the screens show, built from
// session.signingDayPlan(locks), and the undo locks + review states kept beside the save.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKUP_DIR_NAME } from "./safe-save.mjs";

export const SAVES_DIR = path.join(os.homedir(), "Documents", "EA SPORTS College Football 27", "saves");

// The start screen's saves list: dynasty saves only (the game names them DYNASTY-…; profile and
// playbook files sit in the same folder), newest first, without backups or the GUI's lock files.
export function listSaves(dir = SAVES_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name !== BACKUP_DIR_NAME && /^DYNASTY-/i.test(e.name) && !/\.(bak|tmp|json)$/i.test(e.name))
    .map(e => { const p = path.join(dir, e.name); return { name: e.name, path: p, modified: fs.statSync(p).mtime.toISOString() }; })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

// Team logos, helmets and player portraits, served at assets/… by gui.mjs: first the slim copies
// committed in gui/art/ (tools/copy-art.mjs), then Tom's DynastyOS asset library. Both use the
// library's relative paths. Neither there: the screens fall back to monogram tiles.
export const ART_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "gui", "art");
export const ASSETS_DIR = path.join(os.homedir(), "Documents", "DynastyOS Assets");
export const ART_DIRS = [ART_DIR, ASSETS_DIR];
const ART_ALIAS = { california: "cal", uconn: "connecticut", eastcarolina: "ecu", middletennessee: "midtennstate", samhouston: "samhoustonstate", massachusetts: "umass" };
const artKey = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
let artIndex = null;
export function teamArt(name, longName, dirs = ART_DIRS) {
  if (artIndex?.dirs !== dirs) {
    // Later entries win, so gui/art/ goes last.
    const pack = (sub, strip) => new Map([...dirs].reverse().flatMap(dir => {
      const p = path.join(dir, sub);
      return fs.existsSync(p) ? fs.readdirSync(p).map(f => [artKey(f.replace(strip, "")), `assets/${sub}/${f}`]) : [];
    }));
    artIndex = { dirs, logo: pack("logos-flat-dark", /^tlow_|\.webp$/g), helmet: pack("helmet/left", /^thel_lthelmets_|_result\.webp$/g) };
  }
  const keys = [artKey(longName), artKey(name)].flatMap(k => [k, ART_ALIAS[k]]).filter(Boolean);
  const find = m => keys.map(k => m.get(k)).find(Boolean) ?? null;
  return { logo: find(artIndex.logo), helmet: find(artIndex.helmet) };
}

export const locksPath = savePath => `${savePath}.locks.json`;

// keep: players never un-signed or cut; notAt: player -> schools he is never placed at;
// reviewed: team -> its moves (movesOf) when it was marked reviewed.
export const emptyState = () => ({ keep: new Set(), notAt: new Map(), reviewed: new Map() });

export function loadState(savePath) {
  const s = emptyState();
  const file = locksPath(savePath);
  if (!fs.existsSync(file)) return s;
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const i of j.keep || []) s.keep.add(Number(i));
  for (const [p, teams] of Object.entries(j.notAt || {})) if (teams.length) s.notAt.set(Number(p), new Set(teams.map(Number)));
  for (const [t, moves] of Object.entries(j.reviewed || {})) s.reviewed.set(Number(t), String(moves));
  return s;
}

export function saveState(savePath, s) {
  const notAt = Object.fromEntries([...s.notAt].filter(([, t]) => t.size).map(([p, t]) => [p, [...t]]));
  fs.writeFileSync(locksPath(savePath), JSON.stringify({ save: path.basename(savePath), keep: [...s.keep], notAt, reviewed: Object.fromEntries(s.reviewed) }, null, 2) + "\n");
}

export const lockCount = s => s.keep.size + [...s.notAt.values()].reduce((n, t) => n + t.size, 0);

// A team's moves: sorted player indexes in and out (a reviewed team whose moves change needs a re-check).
export const movesOf = t => JSON.stringify([t.in.map(r => r.playerIndex).sort((a, b) => a - b), t.out.map(r => r.playerIndex).sort((a, b) => a - b)]);

export const rawPlan = (session, s) => session.signingDayPlan({ keep: s.keep, notAt: s.notAt });

export function buildPlan(session, raw, s) {
  const d = session.d, pb = raw.placement, league = session.getLeague();
  const teamInfo = t => ({ index: t.index, name: t.name, short: t.short, colors: t.colors, ...teamArt(t.name, t.record.LongName) });
  const teams = new Map(pb.teams.map(t => [t.teamIndex, {
    ...teamInfo(d.teams.get(t.teamIndex)), prestige: t.prestige,
    rosterBefore: league.teams.get(t.teamIndex).rosterNextSeason, rosterAfter: t.rosterEnd, in: [], out: [], kept: [], status: ""
  }]));
  const row = (e, extra) => ({ playerIndex: e.index, name: e.name, pos: e.position, ovr: e.overall, ...extra });
  const now = new Map();   // where each player ends up, for the KEPT rows
  const movedTo = new Map(pb.moved.map(e => [e.index, e]));

  for (const e of pb.placed) { teams.get(e.teamIndex)?.in.push(row(e, { from: e.from, role: e.role, kind: "placed" })); now.set(e.index, `Placed at ${e.team}`); }
  for (const e of pb.moved) teams.get(e.teamIndex)?.in.push(row(e, { from: e.from, role: e.role, kind: "moved" }));
  for (const e of raw.unsign) {
    teams.get(e.teamIndex)?.out.push(row(e, { kind: "Recruit", result: "Un-signed", to: null, reason: `Under ${raw.underOverall} OVR` }));
    now.set(e.index, "Un-signed");
  }
  for (const e of pb.cuts) {
    const to = movedTo.get(e.index);
    const result = e.kind === "Recruit" ? "Un-signed" : to ? "Moved" : "Deleted";
    teams.get(e.teamIndex)?.out.push(row(e, { kind: e.kind, result, to: to?.team ?? null, reason: e.forName ? `Room for ${e.forName} (${e.reason})` : e.reason }));
    now.set(e.index, to ? `Moved to ${to.team}` : result);
  }
  for (const e of pb.unplaced) now.set(e.index, "Dropped (no school)");

  // KEPT: undone items, shown at the school the undo was made at.
  const player = i => d.playerByIndex.get(i);
  const keptRow = (p, lock, undone) => ({ playerIndex: p.index, name: p.name, pos: p.position, ovr: p.overall, lock, undone, now: now.get(p.index) ?? "Stays" });
  for (const i of s.keep) {
    const p = player(i);
    if (p) teams.get(p.isIncomingRecruit ? p.destination : p.team)?.kept.push(keptRow(p, "keep", p.isIncomingRecruit ? "Un-sign" : "Cut"));
  }
  for (const [i, set] of s.notAt) {
    const p = player(i);
    if (p) for (const ti of set) teams.get(ti)?.kept.push(keptRow(p, "notAt", "Transfer in"));
  }

  const byOvr = (a, b) => b.ovr - a.ovr || a.name.localeCompare(b.name);
  for (const t of teams.values()) {
    t.in.sort(byOvr); t.out.sort(byOvr); t.kept.sort(byOvr);
    t.counts = { in: t.in.length, out: t.out.length, deleted: t.out.filter(r => r.result === "Deleted").length, kept: t.kept.length };
    const reviewed = s.reviewed.get(t.index);
    t.status = reviewed !== undefined ? (reviewed === movesOf(t) ? "REVIEWED" : "RE-CHECK") : t.in.length || t.out.length ? "CHANGED" : "";
  }

  const recruitCuts = pb.cuts.filter(e => e.kind === "Recruit").length;
  const user = session.userTeam && d.teams.get(session.userTeam.teamIndex);
  return {
    save: { fileName: path.basename(d.filePath), filePath: d.filePath, stage: d.stage.label },
    summary: {
      placed: pb.placed.length, dropped: pb.unplaced.length, unsigned: raw.unsign.length + recruitCuts,
      deleted: pb.cuts.filter(e => e.fate === "Deleted").length, moved: pb.moved.length
    },
    userTeam: user ? teamInfo(user) : null,
    teams: [...teams.values()].sort((a, b) => a.name.localeCompare(b.name)),
    locks: { count: lockCount(s) }
  };
}
