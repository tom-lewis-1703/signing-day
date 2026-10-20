// Player card for the Portal Players tab: profile, abilities, skill groups and every rating.
// Read-only. Physical ability names come from lib/data/abilities.json (the save stores only
// the tier per slot); see tools/extract-abilities.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nextClass } from "./dynasty.mjs";
import { RATING_FIELDS } from "./ratings-model.mjs";

const ABILITIES = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "abilities.json"), "utf8"));
const TIERS = ["None", "Bronze", "Silver", "Gold", "Platinum"];

// Rating field -> [in-game short code, name].
const RATINGS = {
  SpeedRating: ["SPD", "Speed"], AccelerationRating: ["ACC", "Acceleration"], AgilityRating: ["AGI", "Agility"],
  ChangeOfDirectionRating: ["COD", "Change of Direction"], StrengthRating: ["STR", "Strength"], AwarenessRating: ["AWR", "Awareness"],
  JumpingRating: ["JMP", "Jumping"], StaminaRating: ["STA", "Stamina"], ToughnessRating: ["TGH", "Toughness"], InjuryRating: ["INJ", "Injury"],
  CarryingRating: ["CAR", "Carrying"], BreakTackleRating: ["BTK", "Break Tackle"], TruckingRating: ["TRK", "Trucking"],
  StiffArmRating: ["SFA", "Stiff Arm"], SpinMoveRating: ["SPM", "Spin Move"], JukeMoveRating: ["JKM", "Juke Move"],
  BCVisionRating: ["BCV", "Ball Carrier Vision"], CatchingRating: ["CTH", "Catching"], CatchInTrafficRating: ["CIT", "Catch in Traffic"],
  SpectacularCatchRating: ["SPC", "Spectacular Catch"], ShortRouteRunningRating: ["SRR", "Short Route Running"],
  MediumRouteRunningRating: ["MRR", "Medium Route Running"], DeepRouteRunningRating: ["DRR", "Deep Route Running"], ReleaseRating: ["RLS", "Release"],
  ThrowPowerRating: ["THP", "Throw Power"], ThrowAccuracyShortRating: ["SAC", "Short Accuracy"], ThrowAccuracyMidRating: ["MAC", "Medium Accuracy"],
  ThrowAccuracyDeepRating: ["DAC", "Deep Accuracy"], ThrowOnTheRunRating: ["TOR", "Throw on the Run"], ThrowUnderPressureRating: ["TUP", "Throw Under Pressure"],
  BreakSackRating: ["BSK", "Break Sack"], PlayActionRating: ["PAC", "Play Action"], PassBlockRating: ["PBK", "Pass Block"],
  PassBlockPowerRating: ["PBP", "Pass Block Power"], PassBlockFinesseRating: ["PBF", "Pass Block Finesse"], RunBlockRating: ["RBK", "Run Block"],
  RunBlockPowerRating: ["RBP", "Run Block Power"], RunBlockFinesseRating: ["RBF", "Run Block Finesse"], LeadBlockRating: ["LBK", "Lead Block"],
  ImpactBlockingRating: ["IBL", "Impact Blocking"], TackleRating: ["TAK", "Tackle"], HitPowerRating: ["POW", "Hit Power"], PursuitRating: ["PUR", "Pursuit"],
  PlayRecognitionRating: ["PRC", "Play Recognition"], ManCoverageRating: ["MCV", "Man Coverage"], ZoneCoverageRating: ["ZCV", "Zone Coverage"],
  PressRating: ["PRS", "Press"], BlockSheddingRating: ["BSH", "Block Shedding"], PowerMovesRating: ["PMV", "Power Moves"],
  FinesseMovesRating: ["FMV", "Finesse Moves"], KickPowerRating: ["KPW", "Kick Power"], KickAccuracyRating: ["KAC", "Kick Accuracy"],
  KickReturnRating: ["KR", "Kick Return"], LongSnapRating: ["LSN", "Long Snap"]
};
const STARS = { ONE_STAR: 1, TWO_STAR: 2, THREE_STAR: 3, FOUR_STAR: 4, FIVE_STAR: 5 };

// "HomeFanFavorite" -> "Home Fan Favorite"
export const words = s => String(s || "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Z])([A-Z][a-z])/g, "$1 $2");
const rating = (field, value) => ({ field, short: RATINGS[field]?.[0] ?? field, name: RATINGS[field]?.[1] ?? words(field.replace(/Rating$/, "")), value });

export function playerCard(d, p) {
  const r = p.record;
  const num = f => Number(r[f]) || 0;
  const inches = num("Height");

  // Skill groups: level now vs his cap, group rating now vs at cap, and the ratings in each.
  const detail = d.skillGroupDetail(p);
  const skillGroups = detail.groups.map(g => ({
    name: g.name, level: g.level, cap: g.cap, atCap: g.atCap, rating: g.rating, target: g.target,
    ratings: g.members.map(m => ({ ...rating(m.field, m.value), atCap: Math.round(m.atCap) }))
  }));
  const inGroups = new Set(detail.groups.flatMap(g => g.members.map(m => m.field)));

  // Physical abilities: name by archetype slot, tier from the save, next tier's requirement.
  const arch = ABILITIES.archetypes[p.archetype];
  const physical = (arch?.abilities || []).map((a, i) => {
    const tier = Math.max(0, TIERS.indexOf(String(r[`PhysicalAbility${i + 1}`])));
    const next = a.tiers[tier];
    const needs = next ? [rating(a.rating, num(a.rating)), a.rating2 ? rating(a.rating2, num(a.rating2)) : null]
      .filter(Boolean).map((x, k) => ({ ...x, needed: next[k] })) : [];
    return { slot: i + 1, name: a.name, description: a.description, tier: TIERS[tier], tierLevel: tier,
      nextTier: next ? TIERS[tier + 1] : null, needs };
  });
  // Mental abilities are named in the save; a few values have no name in the schema (numbers).
  const mental = [1, 2, 3].map(i => [String(r[`MentalAbility${i}`] || "None"), String(r[`MentalAbilityRank${i}`] || "None")])
    .filter(([name]) => name !== "None")
    .map(([name, tier]) => ({ name: /^\d+$/.test(name) ? `Unknown (${name})` : words(name), tier }));

  return {
    index: p.index, name: p.name, position: p.position, jersey: num("JerseyNum"),
    archetype: arch?.name || words(p.archetype.replace(/^[A-Z]+_/, "")), archetypeRaw: p.archetype,
    overall: p.overall, max: d.maxOverall(p), dev: p.dev === "Normal" ? "Normal" : p.dev.replace("College_", ""),
    year: p.schoolYear, nextYear: nextClass(p), redshirt: p.redshirt,
    height: inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : "", weight: num("Weight") + 160,   // saved as pounds − 160
    hometown: String(r.PLYR_HOME_TOWN || ""), homeState: p.homeState, stars: STARS[String(r.ProspectStarRating)] ?? null,
    personality: words(r.Personality), fromTeam: d.teamName(p.prevTeam),
    skillGroups, physical, mental,
    ratings: RATING_FIELDS.map(f => ({ ...rating(f, num(f)), inGroups: inGroups.has(f) }))
  };
}
