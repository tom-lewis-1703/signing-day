// Signing Day GUI: the Plan the screens show, built from
// session.signingDayPlan(locks), and the undo locks + review states kept beside the save.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKUP_DIR_NAME } from "./safe-save.mjs";
import { nextClass } from "./dynasty.mjs";
import { roomOf } from "./depth-chart.mjs";
import { PITCHES, categoryGrade, pitchSecondaries } from "./destinations.mjs";

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

// ---- Player card ----

// Portrait file of a head asset (Player.GenericHeadAssetName): nilpp_<head>.webp. A long name is
// cut to 17 characters plus "-", and the file drops that "-" before the final _<number>.
// null for a name the save shouldn't hold.
export const portraitFile = head => /^[A-Za-z0-9_-]{1,32}$/.test(head || "") ? `nilpp_${head.replace(/-(?=_\d+$)/, "")}.webp` : null;

// His portrait, cached per head: the committed copy in gui/art/, else the DynastyOS library's file
// when the library is on this PC and its name list (gui/art/playerportrait-files.txt) has it, else
// the blank portrait; null only when even that is missing (the card shows his initials).
const PORTRAITS = "playerportrait", BLANK = "nilpp_Blank.webp";
let portraits = null;
export function playerPortrait(head) {
  if (!portraits) {
    const list = path.join(ART_DIR, `${PORTRAITS}-files.txt`);
    portraits = { names: new Set(fs.existsSync(list) ? fs.readFileSync(list, "utf8").split(/\r?\n/).filter(Boolean) : []),
      library: fs.existsSync(path.join(ASSETS_DIR, PORTRAITS)), byHead: new Map() };
  }
  if (!portraits.byHead.has(head)) {
    const file = portraitFile(head), committed = f => fs.existsSync(path.join(ART_DIR, PORTRAITS, f));
    const at = f => `assets/${PORTRAITS}/${f}`;
    portraits.byHead.set(head, file && (committed(file) || (portraits.library && portraits.names.has(file))) ? { src: at(file), blank: false }
      : committed(BLANK) ? { src: at(BLANK), blank: true } : null);
  }
  return portraits.byHead.get(head);
}

// The game's short rating labels (SPD, ACC…), from the ratings model's field list.
let ratingLabels = null;
const ratingLabel = field => {
  ratingLabels ??= new Map(Object.entries(JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "ratings-model.json"), "utf8")).ratingFields).map(([k, f]) => [f, k]));
  return ratingLabels.get(field) ?? field;
};

const words = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2");
const YEAR = { Freshman: "FR", Sophomore: "SO", Junior: "JR", Senior: "SR" };
// Where the enum's words aren't the game's name.
const ARCHETYPE_NAME = { MantoMan: "Man to Man" };
const CATEGORY_LABEL = { ProximityToHome: "Proximity to Home" };
const gradeText = g => g ? g.replace("plus", "+").replace("minus", "-") : "—";

// One sentence on why he ends up where he does, from his raw plan entries
// (x: placed, moved, cut, unsign, unplaced, committed) and the undo locks.
export function whyLine(d, raw, s, p, x) {
  const made = e => e.cut ? ` ${e.cut} made room.` : "";
  const trim = c => /^trim to (\d+)$/.exec(c.reason)?.[1];
  const cutAt = c => c.forName ? `Cut at ${c.team} for ${c.forName} (${c.reason})` : trim(c) ? `Cut at ${c.team} to trim the roster to ${trim(c)}` : `Cut at ${c.team} (${c.reason})`;
  if (x.placed) {
    const e = x.placed, n = /^Top 10 #(\d+)$/.exec(e.how)?.[1];
    return (n ? `${e.team} was #${n} on his list when his turn came, with room for him (${e.role}).`
      : `No school on his list had room for him; ${e.team} was his best fit with room (${e.role}).`) + made(e);
  }
  if (x.moved) {
    const wanted = x.moved.here?.baseScore > 0 ? "of the schools with room that wanted him" : "none of the schools with room wanted him; of those";
    return `${cutAt(x.cut)}; ${wanted}, he liked ${x.moved.team} most (${x.moved.role}).${made(x.moved)}`;
  }
  if (x.unsign) return `Signed recruit under ${raw.underOverall} OVR without the dev trait and ceiling to keep him: un-signed to free his board slot.`;
  if (x.cut?.kind === "Recruit") return x.cut.forName ? `Un-signed to make room for ${x.cut.forName} (${x.cut.reason}).`
    : trim(x.cut) ? `Un-signed to trim the roster to ${trim(x.cut)}.` : `Un-signed (${x.cut.reason}).`;
  if (x.cut) return `${cutAt(x.cut)}; ${x.cut.top5 ? "no other school had room for him, so " : ""}he is deleted.`;
  if (x.unplaced) return "No school on his list had room for him, so he drops out and the rollover deletes him.";
  if (x.committed) return `Committed to ${x.committed.team} in the portal; he is on its board, so the game signs him.`;
  const school = d.teamName(p.isIncomingRecruit ? p.destination : p.team);
  if (s.keep.has(p.index)) return p.isIncomingRecruit ? `You undid his un-sign; he stays signed at ${school}.` : `You undid his cut; he stays at ${school}.`;
  return `The plan doesn't move him; he stays at ${school}.`;
}

// PlayerCard for one player of the current plan; null for an unknown player.
export function playerCard(session, raw, s, playerIndex) {
  const d = session.d, pb = raw.placement;
  const p = d.playerByIndex.get(Number(playerIndex));
  if (!p) return null;
  const of = list => list.find(e => e.index === p.index) ?? null;
  const x = { placed: of(pb.placed), moved: of(pb.moved), cut: of(pb.cuts), unsign: of(raw.unsign), unplaced: of(pb.unplaced), committed: of(pb.committed) };
  const landed = x.placed ?? x.moved ?? x.committed;
  const status = x.placed || x.committed ? "PLACED" : x.moved ? "MOVED" : x.unsign || x.cut?.kind === "Recruit" ? "UN-SIGNED"
    : x.cut ? "DELETED" : x.unplaced ? "DROPPED" : "STAYS";
  const home = p.isIncomingRecruit ? p.destination : p.team;
  const fromIndex = x.moved ? x.cut.teamIndex : landed || x.unplaced ? p.prevTeam : (x.unsign ?? x.cut)?.teamIndex ?? null;
  const toIndex = landed ? landed.teamIndex : status === "STAYS" ? home : null;
  const team = i => { const t = d.teams.get(i); return t ? { index: t.index, name: t.name, short: t.short, colors: t.colors, logo: teamArt(t.name, t.record.LongName).logo } : null; };
  const room = roomOf(p.position);

  // Pitch: his dealbreaker, then his pitch's other categories, graded at the school he ends up at.
  const at = toIndex === null ? null : d.teams.get(toIndex);
  const here = landed?.here ?? null;
  const gradeAt = c => c === "PlayingTime" ? landed?.role ?? "—" : c === "ProximityToHome" ? (p.homeState && p.homeState === at.state ? "Home" : "Away")
    : gradeText(categoryGrade(c, p, room, at));
  // Most returning players have no pitch, and some no dealbreaker ("Invalid" in the save).
  const dealbreaker = p.dealbreaker && p.dealbreaker !== "Invalid" ? p.dealbreaker : null;
  const categories = [...(dealbreaker ? [dealbreaker] : []), ...pitchSecondaries(p)];
  const pitch = at ? { name: PITCHES[p.pitch]?.name ?? null, school: at.name, categories: categories.map(c => ({ id: c, label: CATEGORY_LABEL[c] ?? words(c),
    grade: gradeAt(c), dealbreaker: c === dealbreaker, met: c === dealbreaker ? here?.meets ?? null : null })) } : null;

  // Top 5 when his turn came; the school he lands at is a 6th row when it isn't in them.
  const snap = landed?.top5 ? landed : x.unplaced ?? (x.cut?.top5 ? x.cut : null);
  const top5 = snap ? [...snap.top5, ...(snap.here && !snap.top5.some(t => t.teamIndex === snap.here.teamIndex) ? [snap.here] : [])].map(t => ({
    ...team(t.teamIndex), rank: t.rank, his: t.playerScore, theirs: Math.round(t.baseScore / 2), match: t.combined, role: t.role, here: t.teamIndex === snap.here?.teamIndex })) : null;

  // Recruits have no planner list: his recruiting list as the game has it, with the school he signed with.
  const recruiting = p.isIncomingRecruit && p.recruitRecord ? { commitScore: p.commitScore, schools: d.topSchools(p.recruitRecord).filter(t => d.teams.has(t.teamIndex))
    .map((t, i) => ({ ...team(t.teamIndex), rank: i + 1, influence: t.influence, signed: t.teamIndex === p.destination })) } : null;

  const undos = [];
  if (s.keep.has(p.index)) undos.push({ undone: p.isIncomingRecruit ? "un-sign" : "cut", at: d.teamName(home) });
  for (const t of s.notAt.get(p.index) ?? []) undos.push({ undone: "transfer in", at: d.teamName(t) });

  const juco = /^JuniorCollege_/.test(p.recruitClass);
  const rs = p.redshirt === "Previous" ? "RS " : "";
  const ranked = p.isTransfer || p.isIncomingRecruit;
  return {
    index: p.index, name: p.name, pos: p.position, archetype: (k => ARCHETYPE_NAME[k] ?? words(k))(p.archetype.replace(/^[A-Z]+_/, "")),
    year: p.isIncomingRecruit ? (juco ? "JUCO" : "HS") : rs + (YEAR[p.schoolYear] ?? p.schoolYear),
    nextYear: (rs || p.redshirt === "Current" ? "RS " : "") + (YEAR[nextClass(p)] ?? nextClass(p)),
    redshirt: p.redshirt === "Previous" || p.redshirt === "Current", dev: p.dev.replace("College_", ""), stars: p.stars,
    ranks: { national: ranked ? p.nationalRank : null, position: ranked ? p.positionRank : null },
    kind: p.isTransfer ? "Transfer" : p.isIncomingRecruit ? (juco ? "JUCO recruit" : "HS recruit") : "Returning",
    jersey: p.jersey, height: p.height, weight: p.weight, homeTown: p.homeTown, homeState: p.homeState && p.homeState !== "NonUS" ? words(p.homeState) : null,
    ovr: p.overall, max: d.maxOverall(p),
    groups: (d.skillGroupDetail(p).groups ?? []).map(g => ({ name: g.name, level: g.level, cap: g.cap, ratings: g.members.map(m => ({ label: ratingLabel(m.field), value: m.value })) })),
    portrait: playerPortrait(p.head), initials: [p.record.FirstName, p.record.LastName].map(n => String(n || "").trim()[0] ?? "").join("").toUpperCase(),
    status, from: fromIndex === null ? null : team(fromIndex), to: toIndex === null ? null : team(toIndex),
    role: landed?.role ?? null, rank: landed?.rank ? `${room}${landed.rank}` : null,
    why: whyLine(d, raw, s, p, x), pitch, top5, recruiting, undos
  };
}
