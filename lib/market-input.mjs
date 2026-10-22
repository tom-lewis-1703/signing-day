// Read-only normalization for the Signing Day v1.2 market. Native CPU
// destinations survive only in audit data and the eventual withdrawal list.
import { ZERO, NO_TEAM } from "./dynasty.mjs";
import { roomOf } from "./depth-chart.mjs";

const YEARS = ["Freshman", "Sophomore", "Junior", "Senior"];
const REDSHIRTS = new Set(["Current", "Previous", "Eligible", "Ineligible"]);
const COMMITTED = new Set(["Signed", "HardCommitted"]);
const refValue = value => typeof value === "string" && /^[01]{32}$/.test(value) && value !== ZERO;
const playerSlots = row => Object.keys(row.fields).filter(k => /^Player\d+$/.test(k));
const atKey = ({ table, row }) => `${table.header.tableId}:${row.index}`;
const label = p => `${p.name} (player ${p.index}, ${p.ref})`;
const entries = row => playerSlots(row).map(k => ({ key: k, ref: row[k] })).filter(x => x.ref !== ZERO);

export class MarketInputError extends Error {
  constructor(problems) {
    super(`Cannot plan this save:\n${problems.map(p => `• ${p}`).join("\n")}`);
    this.name = "MarketInputError";
    this.problems = problems;
  }
}

// Also used by the withdrawal writer to verify unique ownership immediately
// before mutation; no cached first-owner map can hide a second board entry.
export function transferOwnership(d, player) {
  const boards = [], rosters = [], depth = [];
  for (const team of d.teams.values()) {
    const board = d.rowAt(team.record, "CommittedPlayers");
    if (board) for (const slot of entries(board.row)) if (slot.ref === player.ref) boards.push({ teamIndex: team.index, ...board, key: slot.key });
    const roster = d.rowAt(team.record, "Roster");
    if (roster) for (const slot of entries(roster.row)) if (slot.ref === player.ref) rosters.push({ teamIndex: team.index, key: slot.key });
    const chart = d.rowAt(team.record, "DepthChart");
    if (chart) for (const key of Object.keys(chart.row.fields)) {
      if (key === "LockedEntries") continue;
      const list = d.rowAt(chart.row, key);
      if (list && Object.keys(list.row.fields).some(k => list.row[k] === player.ref)) depth.push({ teamIndex: team.index, position: key });
    }
  }
  return { boards, rosters, depth };
}

export function buildMarketInput(d, userTeamIndex) {
  if (!Number.isInteger(userTeamIndex) || !d.teams.has(userTeamIndex)) throw new MarketInputError(["Explicit valid user-team selection required."]);
  if (d.stage.id !== "signing-day") throw new MarketInputError([`Signing Day required; save is ${d.stage.label}.`]);
  const problems = [], diagnostics = { excludedCandidates: [], ownershipDiscrepancies: [], unknownDevelopment: [], unknownPositions: [], counts: {} };
  const byRef = new Map(d.players.map(p => [p.ref, p]));
  const boardOwners = new Map(), rosterOwners = new Map(), depthOwners = new Map();
  const boardRows = new Map(), boardStorage = new Map(), rosterRows = new Map();
  const register = (map, ref, owner) => { if (!map.has(ref)) map.set(ref, []); map.get(ref).push(owner); };
  for (const team of d.teams.values()) {
    const board = d.rowAt(team.record, "CommittedPlayers");
    if (!board || !board.table.isArray || !playerSlots(board.row).length) problems.push(`${team.name} (${team.index}) has a malformed CommittedPlayers reference ${team.record.CommittedPlayers}.`);
    else {
      const key = atKey(board);
      if (boardStorage.has(key)) problems.push(`${team.name} and ${boardStorage.get(key)} alias CommittedPlayers array ${key}.`);
      boardStorage.set(key, team.name);
      boardRows.set(team.index, board);
      let empty = false;
      for (const slot of playerSlots(board.row)) {
        const ref = board.row[slot];
        if (ref === ZERO) { empty = true; continue; }
        if (!refValue(ref) || !byRef.has(ref)) problems.push(`${team.name} CommittedPlayers ${key}.${slot} references missing player ${ref}.`);
        else register(boardOwners, ref, team.index);
        if (empty) problems.push(`${team.name} CommittedPlayers ${key} is not packed at ${slot}.`);
      }
    }
    const roster = d.rowAt(team.record, "Roster");
    if (!roster || !roster.table.isArray) problems.push(`${team.name} has a malformed Roster reference ${team.record.Roster}.`);
    else {
      rosterRows.set(team.index, roster);
      for (const slot of entries(roster.row)) {
        if (!refValue(slot.ref) || !byRef.has(slot.ref)) problems.push(`${team.name} Roster ${atKey(roster)}.${slot.key} references missing player ${slot.ref}.`);
        else register(rosterOwners, slot.ref, team.index);
      }
    }
    const chart = d.rowAt(team.record, "DepthChart");
    if (!chart) problems.push(`${team.name} has a malformed DepthChart reference ${team.record.DepthChart}.`);
    else for (const key of Object.keys(chart.row.fields)) {
      if (key === "LockedEntries" || chart.row[key] === ZERO) continue;
      const list = d.rowAt(chart.row, key);
      if (!list) { problems.push(`${team.name} DepthChart ${key} references a missing row.`); continue; }
      for (const slot of entries(list.row)) register(depthOwners, slot.ref, team.index);
    }
  }
  for (const [ref, owners] of boardOwners) if (owners.length !== 1) problems.push(`${label(byRef.get(ref))} has duplicate commitment ownership: ${owners.join(", ")}.`);
  for (const [ref, owners] of rosterOwners) {
    const p = byRef.get(ref);
    if (owners.length !== 1 || owners[0] !== p.team) problems.push(`${label(p)} has contradictory roster ownership ${owners.join(", ")} versus TeamIndex ${p.team}.`);
  }
  for (const p of d.players) if (p.team !== NO_TEAM && d.teams.has(p.team) && !rosterOwners.has(p.ref)) problems.push(`${label(p)} has TeamIndex ${p.team} but is absent from its roster.`);

  const critical = p => {
    const bad = [];
    const ovr = Number(p.record.OverallRating);
    if (!Number.isFinite(ovr) || ovr < 0 || ovr > 99) bad.push(`invalid OVR ${p.record.OverallRating}`);
    if (!YEARS.includes(p.schoolYear)) bad.push(`invalid SchoolYear ${p.schoolYear}`);
    if (!REDSHIRTS.has(p.redshirt)) bad.push(`invalid RedshirtStatus ${p.redshirt}`);
    return bad;
  };
  const prospect = p => p.team === NO_TEAM && (p.isTransfer || p.isIncomingRecruit) || boardOwners.has(p.ref);
  const kindOf = p => prospect(p) ? p.isTransfer ? "transfer" : "recruit" : "veteran";
  const players = d.players.map(p => ({
    id: p.ref, index: p.index, name: p.name, position: p.position, overall: Number(p.record.OverallRating), schoolYear: p.schoolYear,
    redshirt: p.redshirt, dev: p.dev, kind: kindOf(p), teamIndex: p.team, prevTeamIndex: p.prevTeam, homeState: p.homeState,
    dealbreaker: p.dealbreaker, archetype: p.archetype, stars: p.stars
  }));
  const normalizedByRef = new Map(players.map(p => [p.id, p]));
  const candidates = [], withdrawals = [], originalCommitted = new Map();
  let userCommittedTransfers = 0, cpuCommittedTransfers = 0, uncommittedTransfers = 0, preservedRecruits = 0, userCommitments = 0;
  for (const p of d.players) {
    if (!prospect(p)) continue;
    const owner = boardOwners.get(p.ref)?.[0];
    const committed = COMMITTED.has(p.recruitStage);
    if (owner !== undefined) {
      if (!p.recruitRecord || !committed) problems.push(`${label(p)} is on ${d.teamName(owner)}'s commitment board with RecruitStage ${p.recruitStage || "missing"}.`);
      originalCommitted.set(p.ref, owner);
      if (owner === userTeamIndex) userCommitments++;
      const listed = p.recruitRecord && d.topSchools(p.recruitRecord)[0]?.teamIndex;
      if (listed !== undefined && listed !== owner) diagnostics.ownershipDiscrepancies.push({ index: p.index, id: p.ref, name: p.name, boardTeamIndex: owner, listTeamIndex: listed });
    } else if (committed) problems.push(`${label(p)} has RecruitStage ${p.recruitStage} but no commitment-board owner.`);
    if (!p.isTransfer) { if (owner !== undefined) preservedRecruits++; continue; }
    if (owner === userTeamIndex) { userCommittedTransfers++; continue; }
    if (owner !== undefined) cpuCommittedTransfers++; else uncommittedTransfers++;
    const errors = critical(p);
    if (p.team !== NO_TEAM || rosterOwners.has(p.ref) || depthOwners.has(p.ref)) errors.push("active incoming transfer is already rostered or on a depth chart (unsupported withdrawal state)");
    if (p.outOfEligibility) errors.push("no modeled next-season eligibility");
    if (!roomOf(p.position)) errors.push(`unsupported position ${p.position}`);
    if (!p.recruitRecord || !String(p.recruitRecord.Class).startsWith("Transfer_")) errors.push("missing active Transfer recruit record");
    const list = p.recruitRecord && d.rowAt(p.recruitRecord, "TopSchoolsList");
    if (!list) errors.push("missing TopSchoolsList reference");
    else {
      let writable = 0;
      const seen = new Set();
      for (const key of Object.keys(list.row.fields).filter(k => /^ProspectTargetSchool\d+$/.test(k))) {
        if (list.row[key] === ZERO) continue;
        const target = d.rowAt(list.row, key);
        if (!target || !target.row.fields.TeamId || !target.row.fields.TeamInfluence) errors.push(`invalid ${key} reference ${list.row[key]}`);
        else { writable++; if (seen.has(list.row[key])) errors.push(`duplicate target-school slot ${list.row[key]}`); seen.add(list.row[key]); }
      }
      if (!writable) errors.push("no writable target-school slot");
    }
    if (errors.length) {
      if (owner !== undefined || p.team !== NO_TEAM || rosterOwners.has(p.ref) || depthOwners.has(p.ref)) problems.push(`${label(p)}: ${errors.join("; ")}.`);
      else diagnostics.excludedCandidates.push({ id: p.ref, index: p.index, name: p.name, reasons: errors });
      continue;
    }
    candidates.push(p.ref);
    if (owner !== undefined) withdrawals.push({ id: p.ref, index: p.index, name: p.name, teamIndex: owner });
  }

  // Detect shared mutable records against every recruit owner, including owners
  // whose commitments are preserved. Historical rows for the same player are OK.
  const mutableOwners = new Map();
  for (const rec of d.tables.recruit.records) {
    if (!rec || rec.isEmpty || !refValue(rec.Player)) continue;
    const list = d.rowAt(rec, "TopSchoolsList");
    if (!list) continue;
    register(mutableOwners, `list:${atKey(list)}`, rec.Player);
    for (const key of Object.keys(list.row.fields).filter(k => /^ProspectTargetSchool\d+$/.test(k))) {
      const target = d.rowAt(list.row, key);
      if (target) register(mutableOwners, `target:${atKey(target)}`, rec.Player);
    }
  }
  const involved = new Set(candidates);
  for (const [storage, owners] of mutableOwners) {
    const unique = [...new Set(owners)];
    if (unique.length > 1 && unique.some(id => involved.has(id))) problems.push(`Mutable prospect ${storage} is shared by distinct players ${unique.join(", ")}.`);
  }

  const teams = [];
  for (const team of d.teams.values()) {
    const roster = new Set(), nativeRoster = new Set();
    for (const p of d.players) {
      const owner = originalCommitted.get(p.ref), kind = normalizedByRef.get(p.ref).kind;
      const veteran = kind === "veteran" && p.team === team.index && !p.outOfEligibility && !p.leavingForDraft && !p.enteringPortal;
      const incoming = owner === team.index;
      if (!veteran && !incoming) continue;
      const errors = critical(p);
      if (errors.length) problems.push(`${label(p)} on ${team.name}'s projected roster: ${errors.join("; ")}.`);
      if (!roomOf(p.position)) diagnostics.unknownPositions.push({ index: p.index, id: p.ref, teamIndex: team.index, position: p.position });
      if (!["Normal", "College_Impact", "College_Star", "College_Elite"].includes(p.dev)) diagnostics.unknownDevelopment.push({ index: p.index, id: p.ref, value: p.dev });
      nativeRoster.add(p.ref);
      if (!incoming || !p.isTransfer || team.index === userTeamIndex) roster.add(p.ref);
    }
    const board = boardRows.get(team.index), boardCapacity = board ? playerSlots(board.row).length : 0;
    const boardBefore = board ? entries(board.row).length : 0;
    const boardUsed = boardBefore - withdrawals.filter(w => w.teamIndex === team.index).length;
    const playingStyle = team.playingStyle ? Object.fromEntries(Object.keys(team.playingStyle.fields).map(k => [k, String(team.playingStyle[k])])) : {};
    teams.push({ index: team.index, name: team.name, offScheme: team.offScheme, defScheme: team.defScheme,
      prestige: Number.isFinite(Number(team.record.TeamPrestige)) ? Number(team.record.TeamPrestige) : null,
      state: team.state, grades: { ...team.grades }, proPotential: { ...team.proPotential }, playingStyle,
      boardCapacity, boardBefore, boardUsed, roster: [...roster].sort(), nativeRoster: [...nativeRoster].sort() });
  }
  if (problems.length) throw new MarketInputError([...new Set(problems)]);
  diagnostics.counts = { userCommittedTransfers, cpuCommittedTransfers, uncommittedTransfers,
    totalTransfers: userCommittedTransfers + cpuCommittedTransfers + uncommittedTransfers,
    pool: cpuCommittedTransfers + uncommittedTransfers, eligible: candidates.length, excluded: diagnostics.excludedCandidates.length,
    preservedRecruits, userCommitments, cpuBoardCapacity: teams.filter(t => t.index !== userTeamIndex).reduce((sum, t) => sum + t.boardCapacity, 0),
    cpuBoardAvailable: teams.filter(t => t.index !== userTeamIndex).reduce((sum, t) => sum + t.boardCapacity - t.boardUsed, 0) };
  return { seasonYear: d.stage.seasonYear ?? d.stage.raw.CurrentSeasonYear, userTeamIndex,
    players: players.sort((a, b) => a.id.localeCompare(b.id)), teams: teams.sort((a, b) => a.index - b.index),
    candidates: candidates.sort(), withdrawals: withdrawals.sort((a, b) => a.id.localeCompare(b.id)), diagnostics };
}
