import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SETTINGS_PATH = path.join(APP_DIR, "settings.json");

const SPREAD = { HB: 1, FB: 0, WR: 3, TE: 1 };
const FOUR_WIDE = { HB: 1, FB: 0, WR: 4, TE: 0 };

// Tuning values get added here at the build step that first uses them. There is no user team
// here: the GUI picks it per save. testSavesTeam (no default) names it for the tools/ scripts,
// which only run on test_saves copies.
export const DEFAULTS = {
  // Step 3: starters per position room. "base" applies to every team; the
  // scheme tables add the rest. "fallback" is used for a scheme not listed.
  starters: {
    base: { QB: 1, OT: 2, OG: 2, C: 1, K: 1, P: 1 },
    offense: {
      OFF_SPREAD: SPREAD, OFF_POWER_SPREAD: SPREAD, OFF_SPREAD_OPTION: SPREAD,
      OFF_MULTIPLE_OFFENSE: SPREAD, OFF_PISTOL: SPREAD,
      OFF_AIR_RAID: FOUR_WIDE, OFF_VEER_AND_SHOOT: FOUR_WIDE, OFF_RUN_AND_SHOOT: FOUR_WIDE,
      OFF_PRO_STYLE: { HB: 1, FB: 0, WR: 2, TE: 2 },
      OFF_OPTION: { HB: 1, FB: 1, WR: 2, TE: 1 }
    },
    defense: {
      DEF_4_2_5: { EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2 },
      DEF_MULTIPLE_DEFENSE: { EDGE: 2, DT: 2, LB: 2, CB: 3, S: 2 },
      DEF_BASE4_3: { EDGE: 2, DT: 2, LB: 3, CB: 2, S: 2 },
      DEF_4_3_MULTIPLE: { EDGE: 2, DT: 2, LB: 3, CB: 2, S: 2 },
      DEF_BASE3_4: { EDGE: 2, DT: 1, LB: 4, CB: 2, S: 2 },
      DEF_3_4_MULTIPLE: { EDGE: 2, DT: 1, LB: 4, CB: 2, S: 2 },
      DEF_3_3_5: { EDGE: 2, DT: 1, LB: 3, CB: 2, S: 3 },
      DEF_3_3_5_TITE: { EDGE: 2, DT: 1, LB: 3, CB: 2, S: 3 },
      DEF_3_2_6: { EDGE: 2, DT: 1, LB: 2, CB: 3, S: 3 }
    },
    fallback: { HB: 1, FB: 0, WR: 3, TE: 1, EDGE: 2, DT: 2, LB: 3, CB: 2, S: 2 }
  },

  // Step 3: role cutoffs. Rotation = this many players right after the starters;
  // olSwing = one extra Rotation player across OT/OG/C. Backup runs to double the
  // starter count; everyone below is Buried.
  roles: {
    rotation: { HB: 1, WR: 1, TE: 1, EDGE: 1, DT: 1, LB: 1, CB: 1, S: 1 },
    olSwing: 1
  },

  // Step 4: team-side fit ("would they want him?"). Fit = role score x need multiplier.
  // need: x1 with no drop-off from this season's starters, rising to maxMult at a
  // fullDropOff-OVR drop; a Stacked room gets "stacked" instead. Weak: starters weakFrom+
  // below the team's expected level count as need too (×1.5 at weakFrom, maxMult at weakFull).
  // pathToStartBonus is by next-season year. levelBar: a non-starter's max overall must
  // reach the team's weakest starter minus this. stackedBackupBar: a room is Stacked when
  // every starter returns and the best backup is within this of the weakest starter.
  fit: {
    roleScore: { Starter: 100, Rotation: 60, Backup: 30, Buried: 0 },
    pathToStartBonus: { Freshman: 30, Sophomore: 30, Junior: 15 },
    need: { maxMult: 2, fullDropOff: 10, stacked: 0.25, weakFrom: 5, weakFull: 10 },
    levelBar: 3,
    stackedBackupBar: 3,
    // Starter level: a projected starter more than `margin` below the usual starter at that position
    // for schools of the same prestige is a stopgap, treated as a Backup.
    starterLevel: { basis: "prestige", margin: 5 },
    // Upgrade: he'd start and beat the weakest starter by `from`+ OVR -> x1, up to maxMult at `full`+.
    // The upgrade is first weighted by the weakest starter's level: x(1 + levelSlope per OVR he sits
    // below the league average starter in that room), kept between minFactor and maxFactor.
    upgrade: { from: 4, full: 10, maxMult: 1.5, levelSlope: 0.05, minFactor: 0.25, maxFactor: 1.5 },
    // Succession: every starter is in his final year next season -> young players with a path get `mult`.
    succession: { years: ["Freshman", "Sophomore"], mult: 2 },
    // Position importance: team score multiplier by room (others x1).
    positionWeight: { QB: 1.25, OT: 1.1, EDGE: 1.1 },
    // Lookalikes: team score x mult for each incoming player already in the room with the same
    // next-season year and OVR within ovrWithin (a school doesn't sign the same player twice).
    lookalike: { ovrWithin: 3, mult: 0.25 },
    // Newcomers: a transfer only takes a starting spot from a transfer already coming in when
    // he is newcomerUpgrade+ OVR better, and never from one at the school's starter level
    // (newcomerLockAtLevel; Tom, Oct 20, eighth session); a school wants at most (starters
    // lost in the room + transferLimit.extra) transfers per room.
    newcomerUpgrade: 4,
    newcomerLockAtLevel: true,
    // ...except for a star: upgrade+ OVR better than the newcomer, or a top-positionRank transfer at his position.
    lockBreak: { upgrade: 8, positionRank: 5 },
    transferLimit: { extra: 1 }
  },

  // Step 4b: player side ("would he go there?"). Score 0-100 =
  //   yearWeight x playing time + (1 - yearWeight) x (weights of: his dealbreaker, each of
  //   the two other categories in his ideal pitch, prestige where he'd play, projected team
  //   strength, home state) + small jitter.
  // playingTimeByRating: yearWeight x factor for the first entry his current OVR reaches.
  // prestigeFloor: by current OVR, the preferred minimum prestige and the fallback used
  // only when no team at the preferred level has a team score of spotOrNeed or more.
  // Combined = playerWeight x player score + (1 - playerWeight) x team score / 2.
  playerSide: {
    yearWeight: { Freshman: 0.2, Sophomore: 0.35, Junior: 0.5, Senior: 0.7 },
    playingTimeByRating: [{ minOverall: 80, factor: 0.5 }],
    rest: { dealbreaker: 0.45, secondary: 0.15, prestige: 0.15, teamStrength: 0.05, home: 0.05 },
    jitter: 3,
    prestigeFloor: [
      { minOverall: 90, preferred: 6, fallback: 4 },
      { minOverall: 85, preferred: 4, fallback: 2 }
    ],
    spotOrNeed: 100,
    // Dealbreaker pass/fail: the school's grade must reach this for his current OVR.
    dealbreakerBar: [
      { minOverall: 85, grade: "Bminus" },
      { minOverall: 78, grade: "C" },
      { minOverall: 0, grade: "Dplus" }
    ],
    // Playing Time dealbreaker dropped below the position's average starter (seniors: average - seniorMargin).
    playingTimeDrop: { seniorMargin: 4 },
    playerWeight: 0.5,
    // Coach perks count for the user team only. Transfer-interest perk of `full` or more at his
    // group: the user team joins his list when it ranks within his top `userReach` eligible
    // schools (at its own spot, or #10).
    perk: { full: 10, userReach: 18 }
  },

  // Step 5: Signing Day roster build (CPU teams only; the user team is left out).
  // recruitCleanup: signed HS/JUCO recruits under `underOverall` are un-signed, except those
  // with a dev trait in `keepDev` whose max overall reaches the league's average next-season
  // starter at their position.
  signingDay: {
    recruitCleanup: { underOverall: 60, keepDev: ["Star", "Elite", "Impact"] },
    // Pass B: place every uncommitted transfer (best max overall first) at the highest school
    // in his live Top 10 (rescored after every signing) with room; otherwise the CPU school with
    // room he likes most (player score). Room = board slot, position cap, `rosterMax`. A full
    // team cuts its lowest keep value (OVR + (max − OVR) × factor for next season's year) when
    // the newcomer's keep value is `cutMargin`+ higher, only players in `cutRoles` once he
    // arrives, recruits first, at most `maxRealCuts` real players per school. Protected real
    // players (school year as shown at Signing Day) are never cut. Cut real players are placed
    // the same way; only those with nowhere to go are deleted.
    placement: {
      caps: { QB: 5, HB: 6, FB: 1, WR: 11, TE: 5, OT: 8, OG: 8, C: 4, EDGE: 8, DT: 8, LB: 12, CB: 9, S: 8, K: 2, P: 2 },
      rosterMax: 85,
      // Roles a transfer must have at a school to be placed there (null = any); the rest drop out.
      placeRoles: null,
      // Only transfers rated this or higher may take a signed recruit's spot (null = any).
      cutRecruitsFrom: null,
      // Returning players may only be cut when a rising senior or in one of these rooms (null = anyone).
      deleteOnly: null,
      // Cut returning players under this OVR are deleted instead of offered to other schools (null = offer all).
      moveCutFrom: null,
      cutMargin: 5,
      maxRealCuts: 5,
      cutRoles: ["Backup", "Buried"],
      yearFactor: { Freshman: 0.5, Sophomore: 0.35, Junior: 0.2, Senior: 0 },
      protect: { upperMinOverall: 77, underMinOverall: 72, underMinMax: 77 }
    }
  }
};

export function loadSettings() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(DEFAULTS, null, 2) + "\n");
    return structuredClone(DEFAULTS);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
  } catch (e) {
    throw new Error(`settings.json could not be read: ${e.message}`);
  }
  return merge(structuredClone(DEFAULTS), parsed);
}

// settings.json overrides the defaults key by key at every level, so a nested value it
// doesn't mention keeps its default instead of switching its rule off. Lists replace whole.
function merge(base, over) {
  for (const [k, v] of Object.entries(over)) {
    const plain = x => x !== null && typeof x === "object" && !Array.isArray(x);
    base[k] = plain(v) && plain(base[k]) ? merge(base[k], v) : v;
  }
  return base;
}
