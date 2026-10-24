// Signing Day v1.2: pure, explicitly simulated roster values and preferences.
// All decision comparisons use millionth precision; display rounding never feeds decisions.
import crypto from "node:crypto";

export const MODEL = "v1.6";
export const PARAMETERS = Object.freeze({ model: MODEL, rosterMax: 85, replacementLimit: 3, recruitReleaseLimit: 1,
  surplusFreshmanMaxOverall: 58,
  forecastGrowth: 2, seasonOneReference: 45, seasonTwoReference: 65,
  acquisitionCost: 4, acquisitionStep: .5, promiseTolerance: 12, developmentalBoundary: 35 });
export const MODEL_PARAMETERS = PARAMETERS;
export const Q = n => Math.round(n * 1e6);
export const cmp = (a, b) => Q(a) - Q(b);
export const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export const ROOMS = ["QB", "HB", "FB", "WR", "TE", "OT", "OG", "C", "EDGE", "DT", "LB", "CB", "S", "K", "P"];
const POSITIONS = { LT: "OT", RT: "OT", LG: "OG", RG: "OG", LE: "EDGE", RE: "EDGE", NT: "DT", LOLB: "LB", MLB: "LB", ROLB: "LB", FS: "S", SS: "S" };
export const roomOf = pos => POSITIONS[pos] ?? (ROOMS.includes(pos) ? pos : null);
// A full-board school may release one low-rated HS/JUCO commitment to sign a transfer.
export const releasableRecruit = p => p.kind === "recruit" && Number.isInteger(p.stars) && p.stars >= 1 && p.stars <= 2 && ["Normal", "College_Normal"].includes(p.dev);
export const surplusFreshman = p => p.kind === "recruit" && p.teamIndex === 255 && p.schoolYear === "Freshman"
  && Number.isFinite(p.overall) && p.overall <= PARAMETERS.surplusFreshmanMaxOverall && ["Normal", "College_Normal"].includes(p.dev);
const CLASSES = ["Freshman", "Sophomore", "Junior", "Senior"];
const GROWTH = { Normal: 2, College_Normal: 2, College_Impact: 3, College_Star: 4, College_Elite: 5 };
// The second HB carries a larger share than an ordinary rotation player.
const ROTATION_SLOTS = { HB: { h: [.50, .30], opportunity: [70, 55] } };
const ROTATION = { HB: 2, WR: 2, TE: 1, EDGE: 2, DT: 2, LB: 2, CB: 2, S: 1 };
const OFFENSE = Object.fromEntries([
  ...["OFF_SPREAD", "OFF_POWER_SPREAD", "OFF_SPREAD_OPTION", "OFF_MULTIPLE_OFFENSE", "OFF_PISTOL"].map(k => [k, [1, 0, 3, 1]]),
  ...["OFF_AIR_RAID", "OFF_VEER_AND_SHOOT", "OFF_RUN_AND_SHOOT"].map(k => [k, [1, 0, 4, 0]]),
  ["OFF_PRO_STYLE", [1, 0, 2, 2]], ["OFF_OPTION", [1, 1, 2, 1]]
]);
const DEFENSE = Object.fromEntries([
  ...["DEF_4_2_5", "DEF_MULTIPLE_DEFENSE"].map(k => [k, [2, 2, 2, 3, 2]]),
  ...["DEF_BASE4_3", "DEF_4_3_MULTIPLE"].map(k => [k, [2, 2, 3, 2, 2]]),
  ...["DEF_BASE3_4", "DEF_3_4_MULTIPLE"].map(k => [k, [2, 1, 4, 2, 2]]),
  ...["DEF_3_3_5", "DEF_3_3_5_TITE"].map(k => [k, [2, 1, 3, 2, 3]]),
  ["DEF_3_2_6", [2, 1, 2, 3, 3]]
]);

export function forecast(p) {
  const y = CLASSES.indexOf(p.schoolYear) + (p.kind === "recruit" || p.redshirt === "Current" ? 0 : 1);
  const E = 4 - y, q1 = Math.min(99, p.overall + (p.kind === "recruit" ? 0 : 2));
  return { ...p, room: roomOf(p.position), y, E, q1, q2: E >= 2 ? Math.min(99, q1 + (GROWTH[p.dev] ?? 2)) : null,
    unknownDevelopment: !Object.hasOwn(GROWTH, p.dev) };
}

export function slotsFor(team) {
  const off = OFFENSE[team.offScheme] ?? [1, 0, 3, 1], def = DEFENSE[team.defScheme] ?? [2, 2, 3, 2, 2];
  const first = { QB: 1, OT: 2, OG: 2, C: 1, K: 1, P: 1,
    ...Object.fromEntries(["HB", "FB", "WR", "TE"].map((r, i) => [r, off[i]])),
    ...Object.fromEntries(["EDGE", "DT", "LB", "CB", "S"].map((r, i) => [r, def[i]])) };
  const rooms = Object.fromEntries(ROOMS.map(room => {
    const S = first[room], R = S ? ROTATION[room] ?? 0 : 0;
    const rotation = ROTATION_SLOTS[room] ?? { h: Array(R).fill(.30), opportunity: Array(R).fill(55) };
    const h = S ? [...Array(S).fill(1), ...rotation.h, ...Array(S).fill(.12), ...Array(S).fill(.03)] : room === "TE" ? [.30, .12] : room === "FB" ? [.12] : [];
    const opportunity = S ? [...Array(S).fill(100), ...rotation.opportunity, ...Array(S).fill(20)] : room === "TE" ? [55, 20] : room === "FB" ? [20] : [];
    return [room, { S, R, B: S, D: S, h, opportunity, support: S ? 0 : opportunity.length }];
  }));
  return { rooms, unknownOffense: !OFFENSE[team.offScheme], unknownDefense: !DEFENSE[team.defScheme] };
}

export function drawFactory(seed, seasonYear) {
  if (!Number.isInteger(seasonYear) || !Number.isFinite(seasonYear)) throw new Error("The save has no valid integer seasonYear.");
  if (typeof seed !== "string") throw new Error("The market seed must be a string.");
  // The draw label stays at v1.2 so a seed keeps its simulated traits across model revisions.
  return (label, p = null, t = null) => {
    const h = crypto.createHash("sha256").update(JSON.stringify(["SD-market-v1.2", seed, seasonYear, label, p, t])).digest("hex");
    return (parseInt(h.slice(0, 12), 16) + .5) / 2 ** 48;
  };
}

export function schoolTraits(team, u) {
  const d = u("school-development", null, team.index);
  return { d, delta: .25 + .20 * d, cutSurcharge: 2 + 2 * d, socialScene: 100 * u("school-social", null, team.index) };
}

export function playerTraits(p, u) {
  const names = ["T", "F", "P", "H", "M"], raw = p.E === 1 ? [5, 0, 2, 1, 2] : p.E === 2 ? [4, 1, 2, 1, 2] : [3, 2, 2, 1, 2];
  const weighted = raw.map((w, i) => w * (.75 + .50 * u("weight-" + names[i], p.id, null)));
  const total = weighted.reduce((a, b) => a + b, 0), socialWeight = u("social-weight", p.id, null);
  const aOrd = .04 + .06 * socialWeight, rareLifestyle = u("social-priority", p.id, null) < .01;
  return { weights: Object.fromEntries(names.map((k, i) => [k, weighted[i] / total])),
    socialIdeal: 100 * u("social-ideal", p.id, null), cultureIdeal: 100 * u("culture-ideal", p.id, null),
    aOrd, a: rareLifestyle ? .60 + .10 * socialWeight : aOrd, b: .04 + .04 * u("culture-weight", p.id, null), rareLifestyle,
    outside: 52 + 8 * (2 * u("outside", p.id, null) - 1) };
}

const NORMALIZE = s => String(s ?? "").trim().toLowerCase().replace(/[\s_.-]/g, "");
const STATES = new Set("Alabama Alaska Arizona Arkansas California Colorado Connecticut Delaware Florida Georgia Hawaii Idaho Illinois Indiana Iowa Kansas Kentucky Louisiana Maine Maryland Massachusetts Michigan Minnesota Mississippi Missouri Montana Nebraska Nevada NewHampshire NewJersey NewMexico NewYork NorthCarolina NorthDakota Ohio Oklahoma Oregon Pennsylvania RhodeIsland SouthCarolina SouthDakota Tennessee Texas Utah Vermont Virginia Washington WestVirginia Wisconsin Wyoming DistrictOfColumbia".split(" ").map(NORMALIZE));
export const normalizedState = s => STATES.has(NORMALIZE(s)) ? NORMALIZE(s) : null;
const GRADES = ["F", "Dminus", "D", "Dplus", "Cminus", "C", "Cplus", "Bminus", "B", "Bplus", "Aminus", "A", "Aplus"];
const GRADE_KEYS = new Set(["ChampionshipContender", "BrandExposure", "CoachPrestige", "CoachStability", "ConferencePrestige", "ProgramTradition", "StadiumAtmosphere", "AcademicPrestige", "CampusLifestyle", "AthleticFacilities"]);
const PRO_GROUP = { HB: "RB", FB: "RB", OT: "OL", OG: "OL", C: "OL", EDGE: "DL", DT: "DL", CB: "DB", S: "DB" };
export const gradeIndex = g => GRADES.includes(g) ? 100 * GRADES.indexOf(g) / 12 : 50;

export function pairTraits(p, team, pt, st, u) {
  const home = normalizedState(p.homeState), state = normalizedState(team.state);
  const H = home && state ? home === state ? 100 : 35 : 50;
  const prestigeValid = Number.isFinite(team.prestige) && team.prestige >= 0 && team.prestige <= 10;
  const P = prestigeValid ? 10 * team.prestige : 50;
  let grade = null, motivationAvailable = true;
  if (p.dealbreaker === "PlayingStyle") grade = team.playingStyle?.[p.archetype];
  else if (p.dealbreaker === "ProPotential") grade = team.proPotential?.[PRO_GROUP[p.room] ?? p.room];
  else if (GRADE_KEYS.has(p.dealbreaker)) grade = team.grades?.[p.dealbreaker];
  else if (!["PlayingTime", "ProximityToHome"].includes(p.dealbreaker)) motivationAvailable = false;
  if (!["PlayingTime", "ProximityToHome"].includes(p.dealbreaker) && !GRADES.includes(grade)) motivationAvailable = false;
  const datingFit = 100 * u("dating-fit", p.id, team.index);
  return { H, P, staticM: gradeIndex(grade), grade, motivationAvailable, prestigeAvailable: prestigeValid,
    geographyAvailable: !!(home && state), datingFit,
    L: .60 * (100 - Math.abs(st.socialScene - pt.socialIdeal)) + .40 * datingFit,
    C: 100 - Math.abs(100 * st.d - pt.cultureIdeal),
    taste: 2 * (2 * u("player-fit", p.id, team.index) - 1),
    returnFriction: team.index === p.prevTeamIndex ? 8 : 0,
    schoolTaste: 1.5 * (2 * u("school-fit", p.id, team.index) - 1) };
}

export function roomValue(players, slots) {
  const first = [...players].sort((a, b) => b.q1 - a.q1 || byId(a, b));
  const second = players.filter(p => p.E >= 2).sort((a, b) => b.q2 - a.q2 || byId(a, b));
  return { V1: first.reduce((s, p, i) => s + (slots.h[i] ?? 0) * Math.max(0, p.q1 - 45), 0),
    V2: second.reduce((s, p, i) => s + (slots.h[i] ?? 0) * Math.max(0, p.q2 - 65), 0) };
}

export function opportunity(p, players, slots, season = 1) {
  if (season === 2 && p.E < 2) return null;
  const field = season === 1 ? "q1" : "q2", peers = players.filter(x => x.id !== p.id && (season === 1 || x.E >= 2));
  let total = 0;
  for (let offset = -3; offset <= 3; offset++) {
    const q = p[field] + offset;
    let ahead = 0, tied = 1;
    for (const other of peers) { if (other[field] > q) ahead++; else if (other[field] === q) tied++; }
    let group = 0;
    for (let i = ahead; i < ahead + tied; i++) group += slots.opportunity[i] ?? 0;
    total += group / tied;
  }
  return total / 7;
}

export function utility(p, players, slots, pt, pair) {
  const O1 = opportunity(p, players, slots), O2 = opportunity(p, players, slots, 2);
  const F = p.E >= 2 ? .70 * O2 + .30 * O1 : 0;
  const M = p.dealbreaker === "PlayingTime" ? O1 : p.dealbreaker === "ProximityToHome" ? pair.H : pair.staticM;
  const features = { T: O1, F, P: pair.P, H: pair.H, M };
  const football = Object.keys(features).reduce((s, k) => s + pt.weights[k] * features[k], 0);
  const U = (1 - pt.a - pt.b) * football + pt.a * pair.L + pt.b * pair.C + pair.taste - pair.returnFriction;
  const ordinaryU = (1 - pt.aOrd - pt.b) * football + pt.aOrd * pair.L + pt.b * pair.C + pair.taste - pair.returnFriction;
  return { O1, O2, F, U, ordinaryU, outside: pt.outside, football, features,
    contributions: { football: (1 - pt.a - pt.b) * football, lifestyle: pt.a * pair.L, culture: pt.b * pair.C, taste: pair.taste, returnFriction: -pair.returnFriction },
    comparison: { O1: Q(O1), F: Q(F), U: Q(U), outside: Q(pt.outside) } };
}

export function promiseFailures(promise, value) {
  const failed = [];
  if (promise.contract !== "developmental reserve" && cmp(value.O1, promise.O1 - 12) < 0) failed.push("immediate opportunity");
  if (promise.E >= 2 && cmp(value.F, promise.F - 12) < 0) failed.push("future scenario");
  if (cmp(value.U, promise.outside) <= 0) failed.push("outside option");
  return failed;
}

export function rosterSnapshot(roster, team, slots, traits) {
  let V1 = 0, V2 = 0;
  const rooms = {};
  for (const room of ROOMS) {
    const s = slots[room], players = roster.filter(p => p.room === room).sort((a, b) => b.q1 - a.q1 || byId(a, b));
    const value = roomValue(players, s); V1 += value.V1; V2 += value.V2;
    rooms[room] = { count: players.length, firstTeamSlots: s.S, rotationSlots: s.R, supportSlots: s.support,
      emptyFirstTeam: Math.max(0, s.S - players.length), emptyRotation: Math.min(s.R, Math.max(0, s.S + s.R - players.length)),
      emptyBackups: Math.min(s.B, Math.max(0, s.S + s.R + s.B - players.length)), emptySupport: Math.max(0, s.support - players.length),
      excess: Math.max(0, players.length - s.h.length), ...value,
      players: players.map(p => ({ id: p.id, index: p.index, name: p.name, position: p.position, overall: p.overall, q1: p.q1, q2: p.q2, E: p.E, kind: p.kind })) };
  }
  return { headcount: roster.length, V1, V2, value: V1 + traits.delta * V2, rooms,
    unknownPositions: roster.filter(p => !p.room).map(p => ({ id: p.id, index: p.index, name: p.name, position: p.position })) };
}
