// The save edits proven in-game (step 5 piece 1, Liberty): commit a transfer, un-sign a
// recruit, cut a player; plus moving a cut player to another school (task 3, not yet proven). Edits go straight to the records in memory; every field written
// is logged in `writes` so the save check can re-read it and confirm nothing else changed.
// The user team is never touched.
import { ZERO, NO_TEAM } from "./dynasty.mjs";

const TOP = Array.from({ length: 10 }, (_, i) => `ProspectTargetSchool${i}`);
// Positions in a team's DepthChart row (every field but LockedEntries).
const depthKeys = row => Object.keys(row.fields).filter(k => k !== "LockedEntries");
const slotKeys = row => Object.keys(row.fields);
// Influence given to the committed school: the top school's + 10 (Liberty proof: 9 -> 19; Tom OK'd).
export const COMMIT_INFLUENCE_BONUS = 10;

export class RosterEdits {
  constructor(d, userTeamIndex) {
    this.d = d;
    this.userTeamIndex = userTeamIndex;
    this.edits = [];          // { kind, index, name, teamIndex, team, note }
    this.writes = new Map();  // "tableId:row" -> { tableId, row, fields: { field: value } }
  }

  #set(table, row, field, value) {
    row[field] = value;
    const key = `${table.header.tableId}:${row.index}`;
    if (!this.writes.has(key)) this.writes.set(key, { tableId: table.header.tableId, row: row.index, fields: {} });
    this.writes.get(key).fields[field] = value;
  }

  #guardTeam(teamIndex, what) {
    if (!this.d.teams.has(teamIndex)) throw new Error(`${what}: unknown team ${teamIndex}.`);
    if (teamIndex === this.userTeamIndex) throw new Error(`${what}: ${this.d.teamName(teamIndex)} is your team; it is never changed.`);
  }

  // Removes `ref` from a packed Player[] row (later slots move up, last slot emptied).
  #removeFromList(table, row, ref) {
    const keys = slotKeys(row);
    const at = keys.findIndex(k => row[k] === ref);
    if (at < 0) return false;
    for (let i = at; i < keys.length; i++) this.#set(table, row, keys[i], i + 1 < keys.length ? row[keys[i + 1]] : ZERO);
    return true;
  }

  #addToList(table, row, ref, what) {
    const free = slotKeys(row).find(k => row[k] === ZERO);
    if (!free) throw new Error(`${what}: the list is full.`);
    this.#set(table, row, free, ref);
  }

  #board(teamIndex) {
    const b = this.d.rowAt(this.d.teams.get(teamIndex).record, "CommittedPlayers");
    if (!b) throw new Error(`${this.d.teamName(teamIndex)} has no Signing Day board.`);
    return b;
  }

  #log(kind, p, teamIndex, note = "") {
    this.edits.push({ kind, index: p.index, name: p.name, position: p.position, overall: p.overall, teamIndex, team: this.d.teamName(teamIndex), note });
  }

  // Commit an uncommitted transfer to a school. Signing Day (proven): Signed, 1 offer, on the
  // school's board. Weekly (as the game writes its own portal-week commits; not yet proven):
  // HardCommitted, 1 offer, not on the board. Either way the school becomes #1 on his list
  // with the top influence + 10; a school not on his list replaces his last one first.
  commitTransfer(p, teamIndex, { weekly = false } = {}) {
    const what = `Commit ${p.name}`;
    this.#guardTeam(teamIndex, what);
    if (!p.isTransfer || p.transferCommitted) throw new Error(`${what}: he is not an uncommitted transfer.`);
    const rec = p.recruitRecord;
    const list = this.d.rowAt(rec, "TopSchoolsList");
    if (!list) throw new Error(`${what}: he has no Top 10 list.`);
    const slots = TOP.filter(k => this.d.rowAt(list.row, k));
    if (!slots.length) throw new Error(`${what}: his Top 10 list is empty.`);
    if (!weekly) {
      const board = this.#board(teamIndex);
      this.#addToList(board.table, board.row, p.ref, `${what} (${this.d.teamName(teamIndex)} board)`);
    }

    const schools = slots.map(k => ({ k, ref: list.row[k], ...this.d.rowAt(list.row, k) }));
    const top = Math.max(...schools.map(s => Number(s.row.TeamInfluence) || 0));
    let at = schools.findIndex(s => Number(s.row.TeamId) === teamIndex);
    let note = at < 0 ? `replaced #${schools.length} ${this.d.teamName(schools.at(-1).row.TeamId)}` : `was #${at + 1}`;
    if (at < 0) {
      at = schools.length - 1;
      this.#set(schools[at].table, schools[at].row, "TeamId", teamIndex);
    }
    this.#set(schools[at].table, schools[at].row, "TeamInfluence", top + COMMIT_INFLUENCE_BONUS);
    // Move it to slot 0; the schools above it move down one.
    const order = [schools[at].ref, ...schools.filter((_, i) => i !== at).map(s => s.ref)];
    order.forEach((ref, i) => { if (list.row[slots[i]] !== ref) this.#set(list.table, list.row, slots[i], ref); });

    this.#set(this.d.tables.recruit, rec, "RecruitStage", weekly ? "HardCommitted" : "Signed");
    this.#set(this.d.tables.recruit, rec, "TotalScholarshipOffers", 1);
    if (!weekly) this.d.boardTeamByPlayerRef.set(p.ref, teamIndex);
    this.d.refreshPlayer(p);
    this.#log(weekly ? "Commit (weekly)" : "Commit", p, teamIndex, note);
  }

  // Sign a weekly commit the game didn't sign (HardCommitted, off every board) to his school in
  // the Signing Day form: Signed + 1 offer + on its board. His list already has the school at #1.
  signCommitted(p) {
    const what = `Sign ${p.name}`;
    const teamIndex = p.destination;
    if (!p.isTransfer || !p.transferCommitted || teamIndex == null || this.d.boardTeamByPlayerRef.has(p.ref)) throw new Error(`${what}: he is not an unsigned committed transfer.`);
    this.#guardTeam(teamIndex, what);
    const board = this.#board(teamIndex);
    this.#addToList(board.table, board.row, p.ref, `${what} (${this.d.teamName(teamIndex)} board)`);
    this.#set(this.d.tables.recruit, p.recruitRecord, "RecruitStage", "Signed");
    this.#set(this.d.tables.recruit, p.recruitRecord, "TotalScholarshipOffers", 1);
    this.d.boardTeamByPlayerRef.set(p.ref, teamIndex);
    this.d.refreshPlayer(p);
    this.#log("Sign commit", p, teamIndex);
  }

  // Weekly interest update (not yet proven): rewrite an uncommitted transfer's in-game list,
  // slot by slot (each ProspectTargetSchool row holds only TeamId and TeamInfluence). Same
  // length; the user team keeps its spot and influence; players on its board are refused.
  setTopSchools(p, list) {
    const what = `List ${p.name}`;
    if (!p.isTransfer || p.transferCommitted) throw new Error(`${what}: he is not an uncommitted transfer.`);
    if (p.boardInterest.some(o => o.teamIndex === this.userTeamIndex)) throw new Error(`${what}: he is on your team's board; his list is never changed.`);
    const top = this.d.rowAt(p.recruitRecord, "TopSchoolsList");
    const slots = top ? TOP.map(k => this.d.rowAt(top.row, k)).filter(Boolean) : [];
    if (slots.length !== list.length) throw new Error(`${what}: ${list.length} schools for ${slots.length} slots.`);
    slots.forEach((s, i) => {
      const was = Number(s.row.TeamId), now = list[i].teamIndex;
      if ((was === this.userTeamIndex || now === this.userTeamIndex) && (was !== now || Number(s.row.TeamInfluence) !== list[i].influence)) {
        throw new Error(`${what}: your team's spot on his list is never changed.`);
      }
      if (was !== now) this.#set(s.table, s.row, "TeamId", now);
      if (Number(s.row.TeamInfluence) !== list[i].influence) this.#set(s.table, s.row, "TeamInfluence", list[i].influence);
    });
    this.d.refreshPlayer(p);
    this.#log("List update", p, list[0].teamIndex, `#1 ${this.d.teamName(list[0].teamIndex)}`);
  }

  // Un-sign a signed HS/JUCO recruit: Top10, 0 offers, off the school's board.
  unsignRecruit(p) {
    const what = `Un-sign ${p.name}`;
    const teamIndex = this.d.boardTeamByPlayerRef.get(p.ref) ?? p.destination;
    if (!p.isIncomingRecruit || teamIndex == null) throw new Error(`${what}: he is not a signed recruit.`);
    this.#guardTeam(teamIndex, what);
    const board = this.#board(teamIndex);
    if (!this.#removeFromList(board.table, board.row, p.ref)) throw new Error(`${what}: not on ${this.d.teamName(teamIndex)}'s board.`);
    this.#set(this.d.tables.recruit, p.recruitRecord, "RecruitStage", "Top10");
    this.#set(this.d.tables.recruit, p.recruitRecord, "TotalScholarshipOffers", 0);
    this.d.boardTeamByPlayerRef.delete(p.ref);
    this.d.refreshPlayer(p);
    this.#log("Un-sign", p, teamIndex);
  }

  // Cut (release) a rostered player: no team, previous team = his school, off its roster
  // list and every depth chart slot.
  cutPlayer(p) {
    const teamIndex = p.team;
    const slots = this.#release(p, `Cut ${p.name}`);
    this.d.refreshPlayer(p);
    this.#log("Cut", p, teamIndex, `${slots} depth chart slots`);
  }

  // Move a rostered player (a cut returning player has no recruit row) straight to another
  // school: the cut above, then his team = the new school and onto its roster list. Left off
  // its depth chart (the game leaves newcomers off it too).
  movePlayer(p, teamIndex) {
    const what = `Move ${p.name}`;
    const from = p.team;
    this.#guardTeam(teamIndex, what);
    if (teamIndex === from) throw new Error(`${what}: he is already at ${this.d.teamName(teamIndex)}.`);
    const roster = this.d.rowAt(this.d.teams.get(teamIndex).record, "Roster");
    if (!roster || !slotKeys(roster.row).some(k => roster.row[k] === ZERO)) throw new Error(`${what}: ${this.d.teamName(teamIndex)}'s roster list is full.`);
    const slots = this.#release(p, what);
    this.#set(this.d.tables.player, p.record, "TeamIndex", teamIndex);
    this.#addToList(roster.table, roster.row, p.ref, `${what} (${this.d.teamName(teamIndex)} roster)`);
    this.d.refreshPlayer(p);
    this.#log("Move", p, teamIndex, `from ${this.d.teamName(from)}, ${slots} depth chart slots cleared`);
  }

  // No team, previous team = his school, off its roster list and every depth chart slot.
  #release(p, what) {
    const teamIndex = p.team;
    if (teamIndex === NO_TEAM) throw new Error(`${what}: he has no team.`);
    this.#guardTeam(teamIndex, what);
    const team = this.d.teams.get(teamIndex).record;
    const roster = this.d.rowAt(team, "Roster");
    if (!roster || !this.#removeFromList(roster.table, roster.row, p.ref)) throw new Error(`${what}: not on ${this.d.teamName(teamIndex)}'s roster list.`);
    const depth = this.d.rowAt(team, "DepthChart");
    let slots = 0;
    if (depth) for (const k of depthKeys(depth.row)) {
      const pos = this.d.rowAt(depth.row, k);
      if (pos && this.#removeFromList(pos.table, pos.row, p.ref)) slots++;
    }
    const players = this.d.tables.player;
    this.#set(players, p.record, "TeamIndex", NO_TEAM);
    this.#set(players, p.record, "PrevTeamIndex", teamIndex);
    return slots;
  }
}

// Which records differ between two open saves, by raw bytes: [{ tableId, name, row }]
// (row null = a part of the table outside its records changed). List tables keep each
// row's used length in their header; a change there counts only for rows that changed.
export async function changedRecords(a, b) {
  const byId = new Map(b.tables.map(t => [t.header.tableId, t]));
  const out = [];
  for (const ta of a.tables) {
    const tb = byId.get(ta.header.tableId);
    if (!tb || ta.data.length !== tb.data.length) { out.push({ tableId: ta.header.tableId, name: ta.name, row: null }); continue; }
    if (Buffer.compare(ta.data, tb.data) === 0) continue;
    const { table1StartIndex: start, record1Size: size, recordCapacity: count } = ta.header;
    const end = start + size * count;
    const rows = [];
    for (let i = 0; i < count; i++) {
      const o = start + i * size;
      if (Buffer.compare(ta.data.subarray(o, o + size), tb.data.subarray(o, o + size))) rows.push(i);
    }
    let outside = Buffer.compare(ta.data.subarray(end), tb.data.subarray(end)) !== 0;
    if (Buffer.compare(ta.data.subarray(0, start), tb.data.subarray(0, start))) {
      if (!ta.isArray) outside = true;
      else {
        await Promise.all([ta.readRecords(), tb.readRecords()]);
        const sized = ta.arraySizes.map((n, i) => n !== tb.arraySizes[i] ? i : -1).filter(i => i >= 0);
        if (!sized.length || sized.some(i => !rows.includes(i))) outside = true;
      }
    }
    if (outside) out.push({ tableId: ta.header.tableId, name: ta.name, row: null });
    for (const row of rows) out.push({ tableId: ta.header.tableId, name: ta.name, row });
  }
  return out;
}
