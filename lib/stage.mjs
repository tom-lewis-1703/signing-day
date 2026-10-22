// Stage detection from the save's SeasonInfo table.
// CurrentOffseasonStage values were read from the five test saves (Oct 20, 2026).
// Stage 5 (Week 3) confirmed on a Week 3 save (Oct 20, eighth session).
// The portal weeks have no action.

const OFFSEASON_STAGES = {
  2: { id: "players-leaving", label: "Players Leaving" },
  3: { id: "week-1", label: "Week 1 (portal opens)" },
  4: { id: "week-2", label: "Week 2" },
  5: { id: "week-3", label: "Week 3" },
  6: { id: "week-4", label: "Week 4 (portal closes)" },
  7: { id: "signing-day", label: "Signing Day" }
};

const SEASON_FIELDS = [
  "CurrentStage", "CurrentWeekType", "CurrentOffseasonStage", "CurrentWeek",
  "CurrentSeasonYear", "CurrentYear"
];

export async function readStage(franchise) {
  const table = franchise.getTableByName("SeasonInfo");
  if (!table) throw new Error("This save has no SeasonInfo table; it may not be a CFB 27 dynasty.");
  await table.readRecords(SEASON_FIELDS);
  const row = table.records.find(r => r && !r.isEmpty);
  if (!row) throw new Error("SeasonInfo is empty in this save.");

  const raw = Object.fromEntries(SEASON_FIELDS.map(k => [k, typeof row[k] === "bigint" ? Number(row[k]) : row[k]]));
  const offseasonStage = Number(raw.CurrentOffseasonStage);
  const known = String(raw.CurrentStage) === "OffSeason" ? OFFSEASON_STAGES[offseasonStage] : null;

  return {
    id: known?.id || "unsupported",
    label: known?.label || describeUnsupported(raw),
    supported: !!known,
    unconfirmed: !!known?.unconfirmed,
    seasonYear: Number(raw.CurrentSeasonYear) || null,
    dynastyYear: Number(raw.CurrentYear) + 1,
    raw
  };
}

function describeUnsupported(raw) {
  if (String(raw.CurrentStage) === "PreSeason") return "Preseason (no action at this stage)";
  if (String(raw.CurrentStage) !== "OffSeason") return `${raw.CurrentStage} (not an offseason stage)`;
  return `Offseason stage ${raw.CurrentOffseasonStage} (not one the tool handles)`;
}
