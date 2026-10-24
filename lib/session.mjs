import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { Dynasty, openFranchise, NO_TEAM, TEAM_RATING_FIELDS } from "./dynasty.mjs";
import { readStage } from "./stage.mjs";
import { safeSave, assertWritableSave } from "./safe-save.mjs";
import { loadSettings } from "./settings.mjs";
import { projectLeague, roleAtTeam, roomOf, ROOM_ORDER } from "./depth-chart.mjs";
import { whoWantsHim } from "./fit.mjs";
import { destinations } from "./destinations.mjs";
import { buildMarketInput } from "./market-input.mjs";
import { planTransferMarket } from "./transfer-market.mjs";
import { MODEL, releasableRecruit, surplusFreshman } from "./market-model.mjs";
import { RosterEdits, changedRecords } from "./roster-edits.mjs";
import { buildTeamRatingsPlan, verifyTeamRatingsWrite } from "./team-ratings.mjs";

export { openFranchise };

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const digest = value => crypto.createHash("sha256").update(JSON.stringify(canonical(value)) ?? "undefined").digest("hex");
const fileHash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const lockIdentity = locks => ({ keep: [...(locks?.keep ?? [])].sort((a, b) => a - b),
  notAt: [...(locks?.notAt ?? [])].map(([p, teams]) => [p, [...teams].sort((a, b) => a - b)]).sort((a, b) => a[0] - b[0]) });
const planIdentity = plan => { const { id, ms, ...body } = plan; return digest(body); };

function countPlayers(d, userTeamIndex) {
  const c = { namedPlayers: 0, rostered: 0, userTeamRoster: 0, earlyDraft: 0, enteringPortal: 0, portalUncommitted: 0, portalCommitted: 0, recruitsCommitted: 0 };
  for (const p of d.players) {
    c.namedPlayers++;
    if (p.team !== NO_TEAM) c.rostered++;
    if (p.team === userTeamIndex) c.userTeamRoster++;
    if (p.leavingForDraft) c.earlyDraft++;
    if (p.enteringPortal) c.enteringPortal++;
    if (p.isTransfer) p.transferCommitted ? c.portalCommitted++ : c.portalUncommitted++;
    if (p.isIncomingRecruit && p.destination !== null) c.recruitsCommitted++;
  }
  return c;
}

export class Session {
  constructor() {
    this.d = null;
    this.settings = null;
    this.userTeam = null;
    this.rosterEdits = null;
    this.league = null;
    this.reviewedPlan = null;
    this.appliedPlan = null;
    this.reviewedRatings = null;
    this.appliedRatings = null;
  }

  get stage() { return this.d?.stage; }

  // GUI start screen: a save's stage and schools, read without keeping it open.
  static async peek(filePath) {
    const d = await Dynasty.load(filePath);
    const teams = [...d.teams.values()].map(t => ({ index: t.index, name: t.name, longName: String(t.record.LongName || t.name), short: t.short, colors: t.colors }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { filePath: d.filePath, fileName: path.basename(d.filePath), stage: d.stage, teams };
  }

  // The caller must select a team. Fixture tools explicitly read testSavesTeam;
  // production sessions never fall back to that fixture setting.
  async open(filePath, { userTeam: pick } = {}) {
    const started = Date.now();
    const loaded = loadSettings();
    const wanted = pick;
    // Signing Day leaves the user team out, so one must be named (there is no default).
    if (!(typeof wanted === "string" && wanted.trim() || typeof wanted === "number" && Number.isInteger(wanted))) throw new Error("Select your user team explicitly before opening a session. Fixture tools must pass settings.json → testSavesTeam explicitly.");
    const sourceHash = fileHash(filePath);
    const d = await Dynasty.load(filePath);
    if (fileHash(filePath) !== sourceHash) throw new Error("The save changed while opening it. Open it again.");
    const userTeam = typeof wanted === "number" ? d.teams.get(wanted) ?? null : d.findTeamByName(wanted);
    // A misspelled name would put the user team into the plans, so refuse to open.
    if (!userTeam) throw new Error(`Your team "${wanted}" is not in this save; nothing was opened.`);
    // The planners look the user team up by name in settings.userTeam, so it goes there (in memory only).
    const settings = { ...loaded, userTeam: userTeam.name };

    this.d = d;
    this.settings = settings;
    this.userTeam = userTeam ? { teamIndex: userTeam.index, name: userTeam.name } : null;
    this.rosterEdits = null;
    this.league = null;
    this.sourceHash = sourceHash;
    this.settingsHash = digest(loaded);
    this.reviewedPlan = null;
    this.appliedPlan = null;
    this.reviewedRatings = null;
    this.appliedRatings = null;

    return {
      filePath: d.filePath,
      fileName: path.basename(d.filePath),
      stage: d.stage,
      settings: { userTeam: settings.userTeam },
      userTeam: this.userTeam,
      teamCount: d.teams.size,
      counts: countPlayers(d, userTeam?.index ?? null),
      openMs: Date.now() - started
    };
  }

  requireOpen() {
    if (!this.d) throw new Error("No save is open.");
  }

  requireStage(id) {
    this.requireOpen();
    if (this.d.stage.id !== id) throw new Error(`This action needs a ${id} save; this one is ${this.d.stage.label}.`);
  }

  // Commits, un-signs and cuts (lib/roster-edits.mjs), kept until Save.
  edits() {
    this.requireOpen();
    if (!this.rosterEdits) this.rosterEdits = new RosterEdits(this.d);
    this.league = null;
    return this.rosterEdits;
  }

  pendingChanges() {
    const out = [];
    const counts = {};
    for (const e of this.rosterEdits?.edits || []) counts[e.kind] = (counts[e.kind] || 0) + 1;
    for (const [kind, n] of Object.entries(counts)) out.push(`${kind}: ${n} players`);
    return out;
  }

  // ---- Depth chart (read-only) ----
  getLeague() {
    this.requireOpen();
    if (!this.league) {
      const started = Date.now();
      this.league = projectLeague(this.d, this.settings);
      this.league.ms = Date.now() - started;
    }
    return this.league;
  }

  depthTeams() {
    const league = this.getLeague();
    return {
      projects: league.projects,
      ms: league.ms,
      userTeamIndex: this.userTeam?.teamIndex ?? null,
      teams: [...league.teams.values()].map(t => ({ teamIndex: t.teamIndex, name: t.team })).sort((a, b) => a.name.localeCompare(b.name))
    };
  }

  depthTeam(teamIndex) {
    const t = this.getLeague().teams.get(Number(teamIndex));
    if (!t) throw new Error("Unknown team.");
    // Max overall is computed only for the team being viewed (cached per player).
    const rooms = Object.fromEntries(Object.entries(t.rooms).map(([room, list]) =>
      [room, list.map(e => ({ ...e, max: this.d.maxOverall(this.d.playerByIndex.get(e.index)) }))]));
    return { ...t, rooms, roomOrder: ROOM_ORDER };
  }

  leagueSummary() {
    const league = this.getLeague();
    return [...league.teams.values()].map(t => ({
      teamIndex: t.teamIndex, team: t.team, offScheme: t.offScheme, defScheme: t.defScheme,
      startersLost: t.startersLost, startersFilled: t.startersFilled, openSlots: t.openSlots, rosterNextSeason: t.rosterNextSeason,
      openRooms: Object.entries(t.needs).filter(([, n]) => n.open > 0).map(([room, n]) => `${room} ${n.open}`)
    })).sort((a, b) => b.openSlots - a.openSlots || b.startersLost - a.startersLost || a.team.localeCompare(b.team));
  }

  // Uncommitted transfers for the player picker, best OVR first; roomOrder = the position filter's groups.
  portalPlayers() {
    this.requireOpen();
    const players = this.d.players.filter(p => p.isTransfer && !p.transferCommitted)
      .map(p => ({ index: p.index, name: p.name, position: p.position, room: roomOf(p.position), overall: p.overall, year: p.schoolYear, from: this.d.teamName(p.prevTeam) }))
      .sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
    return { players, roomOrder: ROOM_ORDER };
  }

  roleAt(playerIndex, teamIndex) {
    const r = roleAtTeam(this.d, this.getLeague(), Number(playerIndex), Number(teamIndex), this.settings);
    const p = this.d.playerByIndex.get(Number(playerIndex));
    return { ...r, max: this.d.maxOverall(p), dev: p.dev.replace("College_", "") };
  }

  // ---- Fit (read-only): which teams would want this player ----
  whoWantsHim(playerIndex) {
    return whoWantsHim(this.d, this.getLeague(), Number(playerIndex), this.settings);
  }

  // Both sides: team score, player score, prestige floor and the Top 10 preview.
  destinations(playerIndex) {
    return destinations(this.d, this.getLeague(), Number(playerIndex), this.settings);
  }

  // V1.2 preview: source-bound, reproducible, and entirely read-only.
  // locks (the GUI's undos): { keep: Set<playerIndex>, notAt: Map<playerIndex, Set<teamIndex>> }.
  signingDayPlan(locks = null, { seed } = {}) {
    this.requireStage("signing-day");
    if (this.rosterEdits?.edits.length || this.appliedPlan || this.appliedRatings) throw new Error("Reopen the save before replanning applied edits.");
    this.reviewedRatings = null;
    if (fileHash(this.d.filePath) !== this.sourceHash) throw new Error("The save changed on disk. Reopen it before planning.");
    if (digest(loadSettings()) !== this.settingsHash) throw new Error("Settings changed. Reopen the save before planning.");
    const started = Date.now();
    const input = buildMarketInput(this.d, this.userTeam.teamIndex);
    const effectiveSeed = seed ?? this.reviewedPlan?.seed ?? `SigningDay-v1.2|${input.seasonYear}`;
    if (typeof effectiveSeed !== "string" || !effectiveSeed.trim()) throw new Error("The market seed must be a nonempty string.");
    const binding = { model: MODEL, sourceHash: this.sourceHash, userTeamIndex: this.userTeam.teamIndex,
      seasonYear: input.seasonYear, settingsHash: this.settingsHash, inputHash: digest(input), locks: lockIdentity(locks), seed: effectiveSeed };
    if (this.reviewedPlan && digest(this.reviewedPlan.binding) === digest(binding) && planIdentity(this.reviewedPlan) === this.reviewedPlan.id) return this.reviewedPlan;
    const result = planTransferMarket(input, { seed: effectiveSeed, keep: locks?.keep ?? new Set(), notAt: locks?.notAt ?? new Map() });
    const plan = { ...result, available: true, binding, inputCounts: input.diagnostics.counts, userTeam: this.userTeam.name, ms: Date.now() - started };
    plan.id = planIdentity(plan);
    this.reviewedPlan = plan;
    return plan;
  }

  // Apply exactly the reviewed market; source/locks/settings/plan changes reject
  // before any mutation. A later failure discards the entire staged transaction.
  async applySigningDay(locks = null, { planId } = {}) {
    this.requireStage("signing-day");
    if (this.rosterEdits?.edits.length || this.appliedPlan || this.appliedRatings) throw new Error("This save already has unsaved edits. Save it, or reopen the file to start over.");
    assertWritableSave(this.d.filePath);
    const plan = this.reviewedPlan;
    if (!planId || !plan || plan.id !== planId || planIdentity(plan) !== planId) throw new Error("Save must identify the exact currently reviewed plan. Review the current plan again.");
    if (fileHash(this.d.filePath) !== plan.binding.sourceHash || this.sourceHash !== plan.binding.sourceHash) throw new Error("The source save changed after review. Reopen and review it again.");
    if (digest(loadSettings()) !== plan.binding.settingsHash || digest(lockIdentity(locks)) !== digest(plan.binding.locks) || this.userTeam.teamIndex !== plan.binding.userTeamIndex) throw new Error("Team, settings, or constraints changed after review. Replan and review again.");
    const input = buildMarketInput(this.d, this.userTeam.teamIndex);
    if (digest(input) !== plan.binding.inputHash) throw new Error("The loaded save changed after review. Reopen and review again.");
    this.preflightMarket(plan, input);
    const d = this.d;
    const steps = [
      ...plan.withdrawals.map(e => ["Withdraw", e, ed => ed.withdrawTransfer(d.playerByIndex.get(e.index), e.teamIndex, this.userTeam.teamIndex)]),
      ...plan.cuts.map(e => e.kind === "recruit" ? ["Un-sign", e, ed => ed.unsignRecruit(d.playerByIndex.get(e.index))]
        : ["Cut", e, ed => ed.cutPlayer(d.playerByIndex.get(e.index))]),
      ...plan.placements.map(e => ["Commit", e, ed => ed.commitTransfer(d.playerByIndex.get(e.index), e.teamIndex)])
    ];
    const edits = this.edits();
    const failed = [];
    for (const [kind, e, run] of steps) {
      try { run(edits); } catch (err) { failed.push(`${kind} ${e.name ?? e.index} (${e.teamIndex}): ${err.message}`); break; }
    }
    if (failed.length) {
      const teamIndex = this.userTeam.teamIndex;
      this.d = null; this.rosterEdits = null; this.reviewedPlan = null; this.appliedPlan = null;
      await this.open(d.filePath, { userTeam: teamIndex });
    } else this.appliedPlan = plan;
    return { ok: !failed.length, failed, plan, counts: failed.length ? null : this.pendingChanges() };
  }

  preflightMarket(plan, input) {
    const players = new Map(input.players.map(p => [p.id, p])), candidates = new Set(input.candidates), seen = new Set();
    const teams = new Map(input.teams.map(t => [t.index, { ...t, roster: new Set(t.roster), placed: 0 }]));
    const expectedWithdrawals = input.withdrawals.map(x => [x.id, x.index, x.teamIndex]);
    if (digest(plan.withdrawals.map(x => [x.id, x.index, x.teamIndex])) !== digest(expectedWithdrawals)) throw new Error("The plan does not withdraw the complete CPU commitment cohort.");
    for (const cut of plan.cuts) {
      const p = players.get(cut.id), t = teams.get(cut.teamIndex), recruit = cut.kind === "recruit";
      const eligible = recruit ? p && (cut.reason === "surplus" ? surplusFreshman(p) : releasableRecruit(p)) : p?.kind === "veteran" && p.teamIndex === cut.teamIndex;
      if (!p || p.index !== cut.index || !eligible || cut.teamIndex === input.userTeamIndex || !t?.roster.has(p.id) || seen.has(p.id) || plan.binding.locks.keep.includes(p.index)) throw new Error(`Invalid planned ${recruit ? "recruit" : "veteran"} release ${cut.index}.`);
      seen.add(p.id); t.roster.delete(p.id);
      if (recruit) t.boardUsed--;
    }
    for (const placement of plan.placements) {
      const p = players.get(placement.id), t = teams.get(placement.teamIndex);
      const vetoes = plan.binding.locks.notAt.find(([i]) => i === placement.index)?.[1] ?? [];
      if (!p || p.index !== placement.index || !candidates.has(p.id) || seen.has(p.id) || !t || t.index === input.userTeamIndex || vetoes.includes(t.index)) throw new Error(`Invalid planned transfer commitment ${placement.index}.`);
      seen.add(p.id); t.roster.add(p.id); t.placed++;
      if (++t.boardUsed > t.boardCapacity || t.roster.size > 85) throw new Error(`Planned commitments exceed ${t.name}'s board or roster capacity.`);
    }
    const assigned = new Set(plan.placements.map(p => p.id));
    const unplaced = new Set(plan.unplaced.map(p => p.id));
    if (unplaced.size !== plan.unplaced.length || [...unplaced].some(id => !candidates.has(id) || assigned.has(id)) || assigned.size + unplaced.size !== candidates.size) throw new Error("The reviewed plan does not partition every eligible transfer exactly once.");
  }

  // ---- Separate team-ratings tool ----
  teamRatingsPlan() {
    this.requireOpen();
    if (!this.userTeam || !this.d.teams.has(this.userTeam.teamIndex)) throw new Error("Select your user team before calculating team ratings.");
    if (this.rosterEdits?.edits.length || this.appliedPlan || this.appliedRatings) throw new Error("Reopen the save before calculating ratings with applied edits.");
    if (fileHash(this.d.filePath) !== this.sourceHash || digest(loadSettings()) !== this.settingsHash) throw new Error("The save or settings changed. Reopen before calculating ratings.");
    const plan = { ...buildTeamRatingsPlan(this.d, this.settings), binding: {
      sourceHash: this.sourceHash, settingsHash: this.settingsHash, userTeamIndex: this.userTeam.teamIndex } };
    plan.id = planIdentity(plan);
    this.reviewedPlan = null;
    this.reviewedRatings = plan;
    return plan;
  }

  async applyTeamRatings({ planId } = {}) {
    this.requireOpen();
    assertWritableSave(this.d.filePath);
    if (this.rosterEdits?.edits.length || this.appliedPlan || this.appliedRatings) throw new Error("This save already has unsaved edits. Reopen it first.");
    const plan = this.reviewedRatings;
    if (!planId || !plan || plan.id !== planId || planIdentity(plan) !== planId) throw new Error("Review the current team ratings before saving.");
    if (fileHash(this.d.filePath) !== this.sourceHash || this.sourceHash !== plan.binding.sourceHash || digest(loadSettings()) !== plan.binding.settingsHash || this.userTeam?.teamIndex !== plan.binding.userTeamIndex) throw new Error("The save, settings, or user team changed after review. Reopen and review again.");
    const fresh = { ...buildTeamRatingsPlan(this.d, this.settings), binding: plan.binding };
    if (planIdentity(fresh) !== plan.id) throw new Error("The loaded roster or ratings changed after review. Reopen and review again.");
    try {
      for (const team of plan.teams.filter(t => t.changed)) {
        const record = this.d.teams.get(team.index).record;
        for (const [key, field] of Object.entries(TEAM_RATING_FIELDS)) record[field] = team.after[key];
      }
      this.appliedRatings = plan;
    } catch (e) {
      await this.open(this.d.filePath, { userTeam: this.userTeam.teamIndex });
      throw e;
    }
    return { ok: true, counts: plan.counts };
  }

  async saveTeamRatings() {
    const plan = this.appliedRatings;
    if (!plan || planIdentity(plan) !== plan.id || this.rosterEdits?.edits.length || this.appliedPlan) throw new Error("Apply the exact reviewed team ratings before saving.");
    if (fileHash(this.d.filePath) !== plan.binding.sourceHash || digest(loadSettings()) !== plan.binding.settingsHash || this.userTeam?.teamIndex !== plan.binding.userTeamIndex) throw new Error("The source, settings, or team changed before Save. Reopen and review again.");
    const started = Date.now();
    const result = await safeSave(this.d.franchise, this.d.filePath, async (tempPath, backup) => {
      const problems = [];
      if (fileHash(backup.backupPath) !== plan.binding.sourceHash) problems.push("Backup differs from the reviewed source.");
      const [original, saved] = await Promise.all([openFranchise(backup.backupPath), openFranchise(tempPath)]);
      problems.push(...await verifyTeamRatingsWrite(original, saved, plan));
      return { ok: !problems.length, problems, playerCount: plan.counts.players, teamCount: plan.counts.teams };
    });
    this.reviewedRatings = null;
    this.appliedRatings = null;
    this.sourceHash = fileHash(this.d.filePath);
    return { ...result, changes: [`Recalculated ratings: ${plan.counts.changed} teams`], saveMs: Date.now() - started };
  }

  // ---- Save ----
  async verifySaved(tempPath, backup) {
    const problems = [];
    if (fileHash(backup.backupPath) !== this.sourceHash) problems.push("backup differs from the reviewed source bytes");
    let reopened;
    try {
      reopened = await openFranchise(tempPath);
    } catch (e) {
      return { ok: false, problems: [`saved file would not reopen (${e.message})`] };
    }
    const stage = await readStage(reopened);
    // Before the name read below: a table's fields can only be read once per open.
    if (this.rosterEdits?.edits.length) problems.push(...await this.verifyEdits(reopened, backup.backupPath));
    const players = reopened.getTableByUniqueId(this.d.tables.player.header.uniqueId);
    await players.readRecords(["FirstName", "LastName"]);
    const playerCount = players.records.filter(r => r && !r.isEmpty && `${r.FirstName || ""}${r.LastName || ""}`.trim()).length;
    if (stage.raw.CurrentOffseasonStage !== this.d.stage.raw.CurrentOffseasonStage || stage.raw.CurrentStage !== this.d.stage.raw.CurrentStage) {
      problems.push(`stage changed from ${this.d.stage.label} to ${stage.label}`);
    }
    if (playerCount !== this.d.players.length) problems.push(`player count changed from ${this.d.players.length} to ${playerCount}`);
    if (this.appliedPlan) problems.push(...await this.verifyMarketSaved(tempPath, backup.backupPath));
    return { ok: problems.length === 0, problems, stage: stage.label, playerCount };
  }

  async verifyMarketSaved(tempPath, backupPath) {
    const saved = await Dynasty.load(tempPath), original = await Dynasty.load(backupPath), problems = [];
    const plan = this.appliedPlan, user = plan.binding.userTeamIndex;
    const boardMembership = d => {
      const map = new Map();
      for (const t of d.teams.values()) {
        const board = d.rowAt(t.record, "CommittedPlayers");
        if (!board) continue;
        for (const key of Object.keys(board.row.fields)) {
          const ref = board.row[key];
          if (!map.has(ref)) map.set(ref, []);
          map.get(ref).push(t.index);
        }
      }
      return map;
    };
    const before = boardMembership(original), after = boardMembership(saved), assigned = new Map(plan.placements.map(p => [p.index, p.teamIndex]));
    const releasedRecruits = plan.cuts.filter(c => c.kind === "recruit"), released = new Set(releasedRecruits.map(c => c.id));
    for (const e of releasedRecruits) {
      const p = saved.playerByIndex.get(e.index);
      if (!p || p.ref !== e.id || p.recruitStage !== "Top10" || Number(p.recruitRecord.TotalScholarshipOffers) !== 0 || after.has(e.id) || p.team !== NO_TEAM) problems.push(`Recruit release verification failed for ${e.index}.`);
    }
    for (const e of plan.placements) {
      const p = saved.playerByIndex.get(e.index);
      if (!p || p.ref !== e.id || p.recruitStage !== "Signed" || Number(p.recruitRecord.TotalScholarshipOffers) !== 1 || p.team !== NO_TEAM || digest(after.get(e.id)) !== digest([e.teamIndex]) || saved.topSchools(p.recruitRecord)[0]?.teamIndex !== e.teamIndex) problems.push(`Commitment verification failed for ${e.index}.`);
    }
    for (const e of plan.withdrawals) {
      const p = saved.playerByIndex.get(e.index), old = original.playerByIndex.get(e.index);
      if (p?.prevTeam !== old?.prevTeam) problems.push(`Withdrawal changed true PrevTeamIndex for ${e.index}.`);
      if (!assigned.has(e.index) && (!p || p.team !== NO_TEAM || p.recruitStage !== "Top10" || Number(p.recruitRecord.TotalScholarshipOffers) !== 0 || after.has(e.id) || p.destination !== null)) problems.push(`Unplaced withdrawal verification failed for ${e.index}.`);
      if (!assigned.has(e.index) && digest(saved.topSchools(p.recruitRecord)) !== digest(original.topSchools(old.recruitRecord))) problems.push(`Unplaced withdrawal changed original list/influence for ${e.index}.`);
    }
    for (const p of original.players) {
      const owners = before.get(p.ref) ?? [], protectedCommitment = owners.length && !released.has(p.ref) && (!p.isTransfer || owners[0] === user);
      if (protectedCommitment && digest(owners) !== digest(after.get(p.ref))) problems.push(`Preserved commitment ownership changed for ${p.index}.`);
      if (p.team === user || owners.includes(user) || protectedCommitment) {
        const next = saved.playerByIndex.get(p.index);
        if (!next || digest(Object.fromEntries(Object.keys(p.record.fields).map(k => [k, String(p.record[k])]))) !== digest(Object.fromEntries(Object.keys(next.record.fields).map(k => [k, String(next.record[k])])))) problems.push(`Protected player record changed for ${p.index}.`);
      }
    }
    const originalUser = original.teams.get(user), savedUser = saved.teams.get(user);
    for (const key of ["Roster", "CommittedPlayers", "DepthChart"]) {
      const a = original.rowAt(originalUser.record, key), b = saved.rowAt(savedUser.record, key);
      const fields = row => Object.fromEntries(Object.keys(row.fields).map(k => [k, String(row[k])]));
      if (!a || !b || digest(fields(a.row)) !== digest(fields(b.row))) problems.push(`User ${key} changed.`);
      if (key === "DepthChart" && a && b) for (const slot of Object.keys(a.row.fields).filter(k => k !== "LockedEntries")) {
        const x = original.rowAt(a.row, slot), y = saved.rowAt(b.row, slot);
        if (x && (!y || digest(fields(x.row)) !== digest(fields(y.row)))) problems.push(`User depth slot ${slot} changed.`);
      }
    }
    return problems;
  }

  // Every field the edits wrote is in the saved file, and no other record changed
  // compared with the backup (the original save).
  async verifyEdits(saved, backupPath) {
    const problems = [];
    const writes = this.rosterEdits.writes;
    const byTable = new Map([[this.d.tables.player.header.tableId, new Set(["FirstName", "LastName"])]]);
    for (const w of writes.values()) {
      if (!byTable.has(w.tableId)) byTable.set(w.tableId, new Set());
      for (const f of Object.keys(w.fields)) byTable.get(w.tableId).add(f);
    }
    const tables = new Map(saved.tables.map(t => [t.header.tableId, t]));
    await Promise.all([...byTable].map(([id, fields]) => tables.get(id).readRecords([...fields])));
    for (const w of writes.values()) {
      const row = tables.get(w.tableId).records[w.row];
      for (const [f, v] of Object.entries(w.fields)) {
        if (String(row?.[f]) !== String(v)) problems.push(`${tables.get(w.tableId).name} row ${w.row}: ${f} is ${row?.[f]}, expected ${v}`);
      }
    }
    const original = await openFranchise(backupPath);
    for (const c of await changedRecords(original, saved)) {
      if (c.row === null) problems.push(`${c.name} (table ${c.tableId}) changed outside its records`);
      else if (!writes.has(`${c.tableId}:${c.row}`)) problems.push(`${c.name} row ${c.row} changed but no edit wrote it`);
    }
    return problems;
  }

  async save() {
    this.requireOpen();
    if (this.appliedRatings) return this.saveTeamRatings();
    if (!this.appliedPlan) throw new Error("Apply the exact reviewed Signing Day plan before saving.");
    if (planIdentity(this.appliedPlan) !== this.appliedPlan.id) throw new Error("The applied plan changed. Reopen and review it again.");
    const expectedEdits = [
      ...this.appliedPlan.withdrawals.map(e => ["Withdraw", e.index, e.teamIndex]),
      ...this.appliedPlan.cuts.map(e => [e.kind === "recruit" ? "Un-sign" : "Cut", e.index, e.teamIndex]),
      ...this.appliedPlan.placements.map(e => ["Commit", e.index, e.teamIndex])
    ];
    const actualEdits = (this.rosterEdits?.edits ?? []).map(e => [e.kind, e.index, e.teamIndex]);
    if (digest(expectedEdits) !== digest(actualEdits)) throw new Error("Staged edits differ from the reviewed plan. Reopen and review it again.");
    if (fileHash(this.d.filePath) !== this.sourceHash) throw new Error("The source file changed before Save. Reopen and review it again.");
    const started = Date.now();
    const changes = this.pendingChanges();
    const result = await safeSave(this.d.franchise, this.d.filePath, (t, backup) => this.verifySaved(t, backup));
    this.rosterEdits = null;
    this.reviewedPlan = null;
    this.appliedPlan = null;
    this.sourceHash = fileHash(this.d.filePath);
    return { ...result, changes, saveMs: Date.now() - started };
  }
}
