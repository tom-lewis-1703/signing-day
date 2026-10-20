// Lean read layer for a CFB 27 dynasty save. Loads only the fields the tool uses,
// once, and builds the indexes everything else works from. Writes go straight to
// the underlying records (see draft-lock.mjs); call refreshPlayer() afterwards.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Franchise from "madden-franchise";
import { readStage } from "./stage.mjs";
import { ceiling, RATING_FIELDS } from "./ratings-model.mjs";

const CAP_FIELDS = [1, 2, 3, 4, 5, 6].map(i => `SkillGroupCap${i}`);
const TEAM_STATES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "team-states.json"), "utf8"));
// Letter grades (F .. A+) as 0..100; missing or "COUNT" = 0.
export const GRADES = ["F", "Dminus", "D", "Dplus", "Cminus", "C", "Cplus", "Bminus", "B", "Bplus", "Aminus", "A", "Aplus"];
export const gradeValue = g => { const i = GRADES.indexOf(String(g)); return i < 0 ? 0 : Math.round(i / (GRADES.length - 1) * 100); };
// School grade fields in MySchoolTrackingTable (team.grades key = field without "Grade").
const SCHOOL_GRADE_FIELDS = ["ChampionshipContenderGrade", "BrandExposureGrade", "CoachPrestigeGrade", "CoachStabilityGrade",
  "ConferencePrestigeGrade", "ProgramTraditionGrade", "StadiumAtmosphereGrade", "AcademicPrestigeGrade",
  "CampusLifestyleGrade", "AthleticFacilitiesGrade"];
export const PRO_POTENTIAL_GROUPS = ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "K", "P"];
// Coach perk arrays are indexed by these groups (order confirmed in-game by Tom).
export const PERK_GROUPS = ["QB", "RB/FB", "WR/TE", "OL", "DL", "LB", "DB", "K/P"];

const SCHEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), "C27_486_1.gz");
export const ZERO = "00000000000000000000000000000000";
export const NO_TEAM = 255;
const STARS = { ONE_STAR: 1, TWO_STAR: 2, THREE_STAR: 3, FOUR_STAR: 4, FIVE_STAR: 5 };

const UID = {
  player: 1612938518,
  team: 3359508968,
  recruit: 1873209313,
  topSchools: 2332540366,
  leaving: 1418279587,
  transferQueue: 3884115435
};

const CLASS_ORDER = ["Freshman", "Sophomore", "Junior", "Senior"];
const COMMITTED = new Set(["Signed", "HardCommitted"]);

export function openFranchise(filePath) {
  return Franchise.create(path.resolve(filePath), {
    gameTypeOverride: "college",
    gameYearOverride: 27,
    saveOnChange: false,
    schemaOverride: { major: 486, minor: 1, path: SCHEMA }
  });
}

const isRef = v => !!v && v !== ZERO;

export class Dynasty {
  static async load(filePath) {
    const d = new Dynasty();
    d.filePath = path.resolve(filePath);
    d.franchise = await openFranchise(d.filePath);
    await d.#read();
    return d;
  }

  async #read() {
    const f = this.franchise;
    const t = this.tables = {
      player: f.getTableByUniqueId(UID.player),
      team: f.getTableByUniqueId(UID.team),
      recruit: f.getTableByUniqueId(UID.recruit),
      topSchools: f.getTableByUniqueId(UID.topSchools),
      leaving: f.getTableByUniqueId(UID.leaving),
      transferQueue: f.getTableByUniqueId(UID.transferQueue)
    };
    for (const [k, v] of Object.entries(t)) if (!v) throw new Error(`This save is missing the ${k} table; it may not be a CFB 27 dynasty.`);

    const top = Array.from({ length: 10 }, (_, i) => `ProspectTargetSchool${i}`);
    const [stage] = await Promise.all([
      readStage(f),
      t.player.readRecords(["FirstName", "LastName", "TeamIndex", "PrevTeamIndex", "Position", "OverallRating",
        "SchoolYear", "RedshirtStatus", "TraitDevelopment", "PlayerType", "RecruitingDealbreaker", "IdealRecruitingPitch", "PLYR_HOME_STATE", "ProspectStarRating",
        ...CAP_FIELDS, ...RATING_FIELDS]),
      t.team.readRecords(["TeamIndex", "DisplayName", "LongName", "ShortName",
        "CurrentOffensiveScheme", "CurrentDefensiveScheme", "CommittedPlayers", "TeamPrestige", "MySchoolTrackingTable", "CoachTalentEffects",
        "Roster", "DepthChart"]),
      t.recruit.readRecords(["Player", "Class", "RecruitStage", "TotalScholarshipOffers", "TopSchoolsList", "NationalRank", "PositionRank"]),
      t.topSchools.readRecords(top),
      t.leaving.readRecords(["Player", "LeaveStatus", "LeaveType", "PersuadeAttempts", "ProjectRound"]),
      t.transferQueue.readRecords()
    ]);
    this.stage = stage;
    this.tableById = new Map(f.tables.map(x => [x.header.tableId, x]));

    // Load every ProspectTargetSchool table the Top 10 lists point at
    // (high-school and transfer recruits use different ones).
    const targetTableIds = new Set();
    for (const r of t.topSchools.records) {
      if (!r || r.isEmpty) continue;
      for (const k of top) {
        if (!isRef(r[k])) continue;
        try { targetTableIds.add(r.getReferenceDataByKey(k).tableId); } catch {}
        break;
      }
    }
    await Promise.all([...targetTableIds].map(id => this.tableById.get(id)?.readRecords(["TeamId", "TeamInfluence"])));

    // Teams
    this.teams = new Map();
    for (const r of t.team.records) {
      if (!r || r.isEmpty) continue;
      const index = Number(r.TeamIndex);
      const name = String(r.DisplayName || r.LongName || r.ShortName || "").trim();
      if (index >= 0 && index < NO_TEAM && name) {
        this.teams.set(index, {
          index, name, offScheme: String(r.CurrentOffensiveScheme || ""), defScheme: String(r.CurrentDefensiveScheme || ""), record: r,
          prestige: Number(r.TeamPrestige) || 0, state: TEAM_STATES[name] ?? null,
          grades: {}, proPotential: {}, playingStyle: null,
          transferPerk: new Array(8).fill(0), dealbreakerRelief: new Array(8).fill(0)
        });
      }
    }

    // The game's school grades (the dealbreaker grades): Team.MySchoolTrackingTable -> one
    // row per school; Playing Style grades by archetype sit in a PlayerTypeGradeTable row.
    const trackingRef = team => { try { return isRef(team.record.MySchoolTrackingTable) ? team.record.getReferenceDataByKey("MySchoolTrackingTable") : null; } catch { return null; } };
    const first = [...this.teams.values()].map(trackingRef).find(Boolean);
    const tracking = first && this.tableById.get(first.tableId);
    if (tracking) {
      await tracking.readRecords([...SCHOOL_GRADE_FIELDS, ...PRO_POTENTIAL_GROUPS.map(g => `ProPotentialGrade${g}`), "PlayingStyleGradeByPlayerTypeTable"]);
      for (const team of this.teams.values()) {
        const ref = trackingRef(team);
        const row = ref && ref.tableId === tracking.header.tableId ? tracking.records[ref.rowNumber] : null;
        if (!row || row.isEmpty) continue;
        for (const f of SCHOOL_GRADE_FIELDS) team.grades[f.replace(/Grade$/, "")] = String(row[f] || "");
        for (const g of PRO_POTENTIAL_GROUPS) team.proPotential[g] = String(row[`ProPotentialGrade${g}`] || "");
        team.playingStyle = await this.#follow(row, "PlayingStyleGradeByPlayerTypeTable");
      }
    }

    // Coach perks by perk group (PERK_GROUPS order): transfer interest boost and
    // dealbreaker threshold decrease, from Team.CoachTalentEffects.
    const ints = row => row ? Object.keys(row.fields).filter(k => /^int\d+$/.test(k)).map(k => Number(row[k]) || 0) : [];
    for (const team of this.teams.values()) {
      const effects = await this.#follow(team.record, "CoachTalentEffects");
      if (!effects) continue;
      const boost = ints(await this.#follow(effects, "PlayersLeaving_InterestBoost_Transfers"));
      const relief = ints(await this.#follow(effects, "PlayersLeaving_ThresholdDecrease_Dealbreakers"));
      boost.slice(0, 8).forEach((v, i) => { team.transferPerk[i] = v; });
      relief.slice(0, 8).forEach((v, i) => { team.dealbreakerRelief[i] = v; });
    }

    // Signing Day board: Team.CommittedPlayers -> player refs
    this.boardTeamByPlayerRef = new Map();
    for (const team of this.teams.values()) {
      const array = await this.#follow(team.record, "CommittedPlayers");
      if (!array) continue;
      for (const k of Object.keys(array.fields)) {
        if (/^Player\d+$/.test(k) && isRef(array[k]) && !this.boardTeamByPlayerRef.has(array[k])) this.boardTeamByPlayerRef.set(array[k], team.index);
      }
    }

    // Roster lists and depth charts (used by roster-edits.mjs): reading one team's loads each table.
    const anyTeam = [...this.teams.values()][0];
    const depth = anyTeam && await this.#follow(anyTeam.record, "DepthChart");
    if (anyTeam) await this.#follow(anyTeam.record, "Roster");
    if (depth) await this.#follow(depth, "QB");

    // Recruit rows by player ref (a portal player keeps his old HighSchool row; prefer Transfer_)
    this.recruitByRef = new Map();
    for (const r of t.recruit.records) {
      if (!r || r.isEmpty || !isRef(r.Player)) continue;
      const prev = this.recruitByRef.get(r.Player);
      const isT = String(r.Class).startsWith("Transfer_");
      if (!prev || (isT && !String(prev.Class).startsWith("Transfer_")) || (isT === String(prev.Class).startsWith("Transfer_") && r.index > prev.index)) {
        this.recruitByRef.set(r.Player, r);
      }
    }

    // Leaving rows by player ref, and the game's transfer processing queue
    this.leavingByRef = new Map();
    for (const r of t.leaving.records) {
      if (!r || r.isEmpty || !isRef(r.Player)) continue;
      if (!this.leavingByRef.has(r.Player)) this.leavingByRef.set(r.Player, []);
      this.leavingByRef.get(r.Player).push(r);
    }
    const queue = t.transferQueue.records.find(r => r && !r.isEmpty);
    this.queuedLeavingRefs = new Set(queue ? Object.keys(queue.fields).filter(k => /^LeavingPlayer\d+$/.test(k)).map(k => queue[k]).filter(isRef) : []);

    // Players
    this.players = [];
    this.playerByIndex = new Map();
    for (const r of t.player.records) {
      if (!r || r.isEmpty) continue;
      const name = `${r.FirstName || ""} ${r.LastName || ""}`.trim();
      if (!name) continue;
      const p = { index: r.index, record: r, ref: t.player.getBinaryReferenceToRecord(r.index), name };
      this.refreshPlayer(p);
      this.players.push(p);
      this.playerByIndex.set(p.index, p);
    }
  }

  async #follow(record, key) {
    if (!isRef(record[key])) return null;
    try {
      const ref = record.getReferenceDataByKey(key);
      const table = this.tableById.get(ref.tableId);
      if (!table) return null;
      if (!table.recordsRead) await table.readRecords();
      const row = table.records[ref.rowNumber];
      return row && !row.isEmpty ? row : null;
    } catch {
      return null;
    }
  }

  #followSync(record, key) {
    if (!isRef(record[key])) return null;
    try {
      const ref = record.getReferenceDataByKey(key);
      const row = this.tableById.get(ref.tableId)?.records?.[ref.rowNumber];
      return row && !row.isEmpty ? row : null;
    } catch {
      return null;
    }
  }

  // The row a reference field points at, with its table (tables must already be read).
  rowAt(record, key) {
    if (!isRef(record[key])) return null;
    try {
      const ref = record.getReferenceDataByKey(key);
      const table = this.tableById.get(ref.tableId);
      const row = table?.records?.[ref.rowNumber];
      return row && !row.isEmpty ? { table, row } : null;
    } catch {
      return null;
    }
  }

  // Top 10 schools for a recruit row: [{slot, teamIndex, influence}]. High-school and
  // transfer recruits point at different ProspectTargetSchool tables, so follow the reference.
  topSchools(recruit) {
    const top = this.#followSync(recruit, "TopSchoolsList");
    if (!top) return [];
    const out = [];
    for (let i = 0; i < 10; i++) {
      const row = this.#followSync(top, `ProspectTargetSchool${i}`);
      if (row && row.TeamId !== undefined) out.push({ slot: i, teamIndex: Number(row.TeamId), influence: Number(row.TeamInfluence) || 0 });
    }
    return out;
  }

  // Recomputes a player's derived fields from his records (call after editing them).
  refreshPlayer(p) {
    const r = p.record;
    p.position = String(r.Position || "");
    p.overall = Number(r.OverallRating) || 0;
    p.schoolYear = String(r.SchoolYear || "");
    p.redshirt = String(r.RedshirtStatus || "");
    p.dev = String(r.TraitDevelopment || "");
    p.archetype = String(r.PlayerType || "");
    p.dealbreaker = String(r.RecruitingDealbreaker || "");
    p.pitch = String(r.IdealRecruitingPitch || "");
    p.homeState = String(r.PLYR_HOME_STATE || "");
    p._ceiling = null;
    p.team = Number(r.TeamIndex);
    p.prevTeam = Number(r.PrevTeamIndex);

    const leaving = this.leavingByRef.get(p.ref) || [];
    p.nflRows = leaving.filter(x => String(x.LeaveType).startsWith("EarlyNFL_"));
    const statuses = p.nflRows.map(x => String(x.LeaveStatus));
    p.leavingForDraft = statuses.includes("Leaving") || (statuses.includes("Unknown") && !statuses.includes("Staying"));
    p.enteringPortal = leaving.some(x => String(x.LeaveType).startsWith("Transfer_") &&
      this.queuedLeavingRefs.has(this.tables.leaving.getBinaryReferenceToRecord(x.index)));
    // A Senior who is not redshirting this year has used his eligibility.
    p.outOfEligibility = p.schoolYear === "Senior" && p.redshirt !== "Current";

    const rec = this.recruitByRef.get(p.ref) || null;
    p.recruitClass = rec ? String(rec.Class || "") : "";
    p.recruitStage = rec ? String(rec.RecruitStage || "") : "";
    p.isTransfer = p.recruitClass.startsWith("Transfer_");
    p.isIncomingRecruit = !!rec && !p.isTransfer && p.team === NO_TEAM;
    p.recruitRecord = rec;
    // The game's star rating and rankings (transfer rankings for portal players).
    p.stars = STARS[String(r.ProspectStarRating || "")] ?? null;
    p.nationalRank = rec ? Number(rec.NationalRank) || null : null;
    p.positionRank = rec ? Number(rec.PositionRank) || null : null;

    // Where a transfer or recruit is committed (null when uncommitted).
    p.destination = null;
    if (p.isTransfer) {
      const board = this.boardTeamByPlayerRef.get(p.ref);
      if (board !== undefined) p.destination = board;
      else if (COMMITTED.has(p.recruitStage)) p.destination = this.topSchools(rec)[0]?.teamIndex ?? null;
    } else if (p.isIncomingRecruit && COMMITTED.has(p.recruitStage)) {
      p.destination = this.topSchools(rec)[0]?.teamIndex ?? null;
    }
    if (p.destination !== null && !this.teams?.has(p.destination)) p.destination = null;
    p.transferCommitted = p.isTransfer && p.destination !== null;
    return p;
  }

  // Max overall if every skill group were taken to its cap (computed on first use, cached).
  maxOverall(p) {
    if (!p._ceiling) {
      const r = p.record;
      p._ceiling = ceiling(p.archetype, p.position, RATING_FIELDS.map(f => Number(r[f]) || 0), CAP_FIELDS.map(f => Number(r[f]) || 0));
    }
    return p._ceiling.max ?? p.overall;
  }

  // Full skill-group breakdown for one player (not cached).
  skillGroupDetail(p) {
    const r = p.record;
    return ceiling(p.archetype, p.position, RATING_FIELDS.map(f => Number(r[f]) || 0), CAP_FIELDS.map(f => Number(r[f]) || 0), true);
  }

  teamName(index) {
    return this.teams.get(Number(index))?.name || (Number(index) === NO_TEAM ? "No team" : `Team ${index}`);
  }

  findTeamByName(name) {
    const wanted = String(name || "").trim().toLowerCase();
    for (const t of this.teams.values()) if (t.name.toLowerCase() === wanted) return t;
    return null;
  }
}

export function nextClass(p) {
  if (p.isIncomingRecruit) {
    const m = p.recruitClass.match(/^JuniorCollege_(\w+)$/);
    return m ? m[1] : "Freshman";
  }
  if (p.redshirt === "Current") return p.schoolYear;
  const i = CLASS_ORDER.indexOf(p.schoolYear);
  return i < 0 ? p.schoolYear : CLASS_ORDER[Math.min(i + 1, 3)];
}

export function classRank(year) {
  return CLASS_ORDER.indexOf(year);
}
