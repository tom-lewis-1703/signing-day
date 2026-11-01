// Overall and max-overall (ceiling) model, following the method of Maxi's Dynasty
// Progression Monitor & Planner. Data: lib/data/ratings-model.json (see
// tools/extract-ratings-model.mjs).
//
// - Overall = archetype intercept + sum(rating x archetype weight), rounded (halves
//   down) and clamped to the archetype's floor/ceiling.
// - Each archetype has six skill groups, in the same order as SkillGroupCap1..6.
//   Group rating = weighted mean of its ratings: primaries x15, secondaries x3 (+10
//   each), tertiaries x1 (+20 each). Level = 1 + thresholds reached (by position family).
// - At its cap a group's rating sits on the threshold for the cap level. Each rating's
//   value there is estimated by adding +1 to the ratings in turn until the group rating
//   reaches that target, from every starting point; the midpoint of the range is used.
// - Max overall = overall with every uncapped group projected to its cap. A rating in
//   two groups takes the later group's projection (as Maxi's tool does).
//
// Ratings are passed as an array in RATING_FIELDS order. Archetypes are compiled to
// typed arrays once, so a full league of ceilings takes a fraction of a second.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "ratings-model.json"), "utf8"));
const SHORTS = Object.keys(MODEL.ratingFields);
export const RATING_FIELDS = Object.values(MODEL.ratingFields);
const IDX = Object.fromEntries(SHORTS.map((s, i) => [s, i]));
const N = RATING_FIELDS.length;
const TIERS = [["p", 15, 0], ["s", 3, 10], ["t", 1, 20]];

function thresholdsFor(position) {
  if (position === "FB" || position === "TE") return MODEL.levelThresholds.te;
  if (position === "WR" || position === "MLB" || position === "K" || position === "P") return MODEL.levelThresholds.wr;
  return MODEL.levelThresholds.def;
}

const compiled = new Map();
function compile(archetype) {
  if (compiled.has(archetype)) return compiled.get(archetype);
  const c = MODEL.ovrCoef[archetype];
  let out = null;
  if (c) {
    const w = new Float64Array(N);
    RATING_FIELDS.forEach((f, i) => { w[i] = c[f] || 0; });
    const groups = (MODEL.skillGroups[archetype] || []).map(g => {
      const tiered = TIERS.flatMap(([key, mul, off]) => (g[3][key] || []).filter(sh => IDX[sh] !== undefined).map(sh => ({ idx: IDX[sh], mul, off })));
      return {
        name: g[0],
        shown: g[1].filter(sh => IDX[sh] !== undefined).map(sh => IDX[sh]),
        idx: Int32Array.from(tiered.map(m => m.idx)),
        mul: Int32Array.from(tiered.map(m => m.mul)),
        off: Int32Array.from(tiered.map(m => m.off)),
        den: tiered.reduce((a, m) => a + m.mul, 0)
      };
    });
    out = { intercept: c._i, lo: c._lo ?? 0, hi: c._hi ?? 99, w, groups };
  }
  compiled.set(archetype, out);
  return out;
}

export const hasModel = archetype => !!compile(archetype);

// Current positional estimate, without projecting progression or skill caps.
export function overallAtArchetype(archetype, ratings) {
  const m = compile(archetype);
  if (!m || ratings.length !== N || ratings.some(n => !Number.isFinite(n))) return null;
  return round(m, raw(m, ratings));
}

function raw(m, r) {
  let v = m.intercept;
  for (let i = 0; i < N; i++) if (m.w[i]) v += r[i] * m.w[i];
  return v;
}

function round(m, x) {
  const fl = Math.floor(x);
  const r = x - fl === 0.5 ? fl : Math.round(x);
  return Math.min(m.hi, Math.max(m.lo, r));
}

function groupNum(g, r) {
  let num = 0;
  for (let k = 0; k < g.idx.length; k++) num += g.mul[k] * (r[g.idx[k]] + g.off[k]);
  return num;
}

// Midpoint value of each tiered rating when the group reaches `target` (Float64Array, aligned to g.idx).
function projectMid(g, r, target) {
  const n = g.idx.length;
  const lo = new Float64Array(n).fill(Infinity), hi = new Float64Array(n).fill(-Infinity);
  const v = new Int32Array(n);
  const num0 = groupNum(g, r);
  for (let start = 0; start < n; start++) {
    for (let k = 0; k < n; k++) v[k] = r[g.idx[k]];
    let num = num0, i = start, guard = 0;
    while (Math.round(num / g.den) < target && guard++ < 400) {
      const k = i % n;
      if (v[k] < 99) { v[k]++; num += g.mul[k]; }
      i++;
    }
    for (let k = 0; k < n; k++) { if (v[k] < lo[k]) lo[k] = v[k]; if (v[k] > hi[k]) hi[k] = v[k]; }
  }
  const mid = new Float64Array(n);
  for (let k = 0; k < n; k++) mid[k] = (lo[k] + hi[k]) / 2;
  return mid;
}

// { overall, max } — numbers only, for bulk use. Both null when the archetype is unknown.
// ratings: array in RATING_FIELDS order; caps: [SkillGroupCap1..6].
export function ceiling(archetype, position, ratings, caps, detail = false) {
  const m = compile(archetype);
  if (!m) return { overall: null, max: null, groups: null };
  const thr = thresholdsFor(position);
  const capped = Float64Array.from(ratings);
  const groups = detail ? [] : null;
  m.groups.forEach((g, gi) => {
    const rating = g.den ? Math.round(groupNum(g, ratings) / g.den) : null;
    let level = 1;
    if (rating != null) for (const t of thr) if (t <= rating) level++;
    const cap = caps[gi] || 0;
    const atCap = cap ? level >= cap : false;
    const target = cap >= 2 ? thr[Math.min(cap, 20) - 2] : null;
    let mid = null;
    if (!atCap && target != null && g.idx.length) {
      mid = projectMid(g, ratings, target);
      for (let k = 0; k < g.idx.length; k++) if (mid[k] > ratings[g.idx[k]]) capped[g.idx[k]] = mid[k];
    }
    if (detail) {
      groups.push({
        name: g.name, cap, level: rating == null ? null : level, atCap, rating, target,
        members: g.shown.map(i => {
          const k = Array.prototype.indexOf.call(g.idx, i);
          const proj = mid && k >= 0 && mid[k] > ratings[i] ? mid[k] : ratings[i];
          return { field: RATING_FIELDS[i], value: ratings[i], atCap: proj };
        })
      });
    }
  });
  return { overall: round(m, raw(m, ratings)), max: round(m, raw(m, capped)), groups };
}
