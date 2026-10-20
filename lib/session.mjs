import fs from "node:fs";
import path from "node:path";
import { Dynasty, openFranchise, NO_TEAM } from "./dynasty.mjs";
import { readStage } from "./stage.mjs";
import { safeSave } from "./safe-save.mjs";
import { loadSettings } from "./settings.mjs";
import { planDraftLock, applyDraftLock } from "./draft-lock.mjs";
import { projectLeague, roleAtTeam, roomOf, ROOM_ORDER } from "./depth-chart.mjs";
import { whoWantsHim } from "./fit.mjs";
import { destinations } from "./destinations.mjs";
import { planRecruitCleanup, planPlacement, BOARD_SLOTS } from "./signing-day.mjs";

export { openFranchise };

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
    this.draftLockResult = null;
    this.league = null;
  }

  get stage() { return this.d?.stage; }

  async open(filePath) {
    const started = Date.now();
    const settings = loadSettings();
    const d = await Dynasty.load(filePath);
    const userTeam = d.findTeamByName(settings.userTeam);
    // A misspelled name would leave the user team unprotected, so refuse to open.
    if (settings.userTeam && !userTeam) throw new Error(`Your team "${settings.userTeam}" (settings.json → userTeam) is not in this save. Fix the name; nothing was opened.`);
    const draft = planDraftLock(d, userTeam?.index ?? null);

    this.d = d;
    this.settings = settings;
    this.userTeam = userTeam ? { teamIndex: userTeam.index, name: userTeam.name } : null;
    this.draftLockResult = null;
    this.league = null;

    return {
      filePath: d.filePath,
      fileName: path.basename(d.filePath),
      stage: d.stage,
      settings: { userTeam: settings.userTeam },
      userTeam: this.userTeam,
      teamCount: d.teams.size,
      counts: countPlayers(d, userTeam?.index ?? null),
      // Underclassmen (not on your team) still set to leave early for the draft.
      draftCheck: {
        underclassmenLeaving: draft.toLock.length,
        graduatingLeaving: draft.graduating.length,
        userTeamLeaving: draft.userTeam.length,
        alreadyStaying: draft.alreadyStaying.length
      },
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

  // ---- Draft lock ----
  previewDraftLock() {
    this.requireStage("players-leaving");
    return planDraftLock(this.d, this.userTeam?.teamIndex ?? null);
  }

  applyDraftLock() {
    this.requireStage("players-leaving");
    if (this.draftLockResult) throw new Error("Draft Lock was already applied to this save. Save it, or reopen the file to start over.");
    this.draftLockResult = applyDraftLock(this.d, this.userTeam?.teamIndex ?? null);
    this.league = null;
    return this.draftLockResult;
  }

  pendingChanges() {
    return this.draftLockResult ? [`Draft Lock: ${this.draftLockResult.locked.length} players set to Staying`] : [];
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

  // Step 5 preview (read-only): the Signing Day recruit cleanup for every CPU team.
  signingDayPlan() {
    this.requireOpen();
    if (this.d.stage.id !== "signing-day") return { available: false, stage: this.d.stage.label };
    const started = Date.now();
    const plan = planRecruitCleanup(this.d, this.getLeague(), this.settings);
    const placement = planPlacement(this.d, this.getLeague(), this.settings, plan);
    return { available: true, ...plan, placement, boardSlots: BOARD_SLOTS, userTeam: this.settings.userTeam, ms: Date.now() - started };
  }

  // ---- Save ----
  async verifySaved(tempPath) {
    const problems = [];
    let reopened;
    try {
      reopened = await openFranchise(tempPath);
    } catch (e) {
      return { ok: false, problems: [`saved file would not reopen (${e.message})`] };
    }
    const stage = await readStage(reopened);
    const players = reopened.getTableByUniqueId(this.d.tables.player.header.uniqueId);
    await players.readRecords(["FirstName", "LastName"]);
    const playerCount = players.records.filter(r => r && !r.isEmpty && `${r.FirstName || ""}${r.LastName || ""}`.trim()).length;
    if (stage.raw.CurrentOffseasonStage !== this.d.stage.raw.CurrentOffseasonStage || stage.raw.CurrentStage !== this.d.stage.raw.CurrentStage) {
      problems.push(`stage changed from ${this.d.stage.label} to ${stage.label}`);
    }
    if (playerCount !== this.d.players.length) problems.push(`player count changed from ${this.d.players.length} to ${playerCount}`);
    return { ok: problems.length === 0, problems, stage: stage.label, playerCount };
  }

  async save() {
    this.requireOpen();
    const started = Date.now();
    const changes = this.pendingChanges();
    const result = await safeSave(this.d.franchise, this.d.filePath, t => this.verifySaved(t));

    // Keep a record of who was locked, for checking a later save.
    let draftLockRecord = null;
    if (this.draftLockResult) {
      draftLockRecord = result.backup.backupPath.replace(/\.bak$/, ".draft-lock.json");
      fs.writeFileSync(draftLockRecord, JSON.stringify({
        save: this.d.filePath,
        savedAt: new Date().toISOString(),
        userTeam: this.userTeam,
        locked: this.draftLockResult.locked,
        graduating: this.draftLockResult.plan.graduating,
        userTeamPlayers: this.draftLockResult.plan.userTeam
      }, null, 2));
      this.draftLockResult = null;
    }
    return { ...result, changes, draftLockRecord, saveMs: Date.now() - started };
  }
}
