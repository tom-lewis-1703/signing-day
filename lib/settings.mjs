import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SETTINGS_PATH = path.join(APP_DIR, "settings.json");

const SPREAD = { HB: 1, FB: 0, WR: 3, TE: 1 };
const FOUR_WIDE = { HB: 1, FB: 0, WR: 4, TE: 0 };

// Tuning values get added here at the build step that first uses them.
export const DEFAULTS = {
  userTeam: "Kansas",

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
    fallback: { HB: 1, FB: 0, WR: 3, TE: 1, EDGE: 2, DT: 2, LB: 3, CB: 3, S: 2 }
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
    positionWeight: { QB: 1.25, OT: 1.1, EDGE: 1.1 }
  },

  // Step 4b: player side ("would he go there?"). Score 0-100 =
  //   yearWeight x playing time + (1 - yearWeight) x (weights of: his dealbreaker,
  //   prestige where he'd play, projected team strength, home state) + small jitter.
  // prestigeFloor: by current OVR, the preferred minimum prestige and the fallback used
  // only when no team at the preferred level has a team score of spotOrNeed or more.
  // Combined = playerWeight x player score + (1 - playerWeight) x team score / 2.
  playerSide: {
    yearWeight: { Freshman: 0.2, Sophomore: 0.35, Junior: 0.5, Senior: 0.7 },
    rest: { dealbreaker: 0.5, prestige: 0.3, teamStrength: 0.1, home: 0.1 },
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
    // Coach transfer-interest perk: this value or more = moved to #2 of his Top 10.
    perk: { full: 10 }
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
  return { ...structuredClone(DEFAULTS), ...parsed };
}
