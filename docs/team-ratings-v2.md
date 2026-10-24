# Team ratings v2

Open a dynasty save, select your school, and open **Team ratings**. Choose **Current roster** or **Upcoming roster**, then **Calculate ratings preview**. Your school follows the same calculation and Save flow as the CPU schools.

Changing roster basis clears the old preview; calculate again before saving. **Recalculate** reads the latest source save and settings. A rejected Save displays a fresh preview when the source can still be opened, so review it before retrying. The tool never applies transfer moves.

## Formula

This is a custom strength score on the player OVR scale. The formula keeps the v1 80% starter / 20% backup split and doubled QB weight. It does not rescale the league to match EA's stored numbers.

1. Group eligible players into position rooms and sort by saved OVR, then player index. Reserve each room's top S starters and next S backups. The game's positions and depth charts are never edited.
2. Scheme counts must be nonnegative integers totaling exactly 11 per side. Unknown defensive schemes use a conventional 4–3 fallback: 2 EDGE, 2 DT, 3 LB, 2 CB, 2 S.
3. Fill empty offensive-line slots from unused tackles, guards, and centers, covering missing starters before backups. Native two-deep players stay reserved. A player fills at most one slot; extra depth elsewhere never dilutes a rating.
4. For a lineman covering another room, compare his attributes under his saved archetype and the matching destination archetype. Apply any modeled drop to his saved OVR, then deduct 3 OVR for tackle/guard or guard/center coverage, or 5 for tackle/center. Do not award a modeled increase. If the archetype or attributes are unavailable, use saved OVR minus the same fit penalty. These are conservative tool estimates, not game-validated position-change formulas. They appear beside the player in the calculation. No other cross-room substitutions are inferred.
5. Unfilled slots count as 40 OVR. A room's score is 0.8 × starter average + 0.2 × backup average. Its weight is S, except QB has weight 2.
6. Average each side's room scores by weight; round and clamp to 0–99. Overall = round((displayed offense + displayed defense) / 2). Kickers and punters do not affect these ratings.

The breakdown shows starter strength, depth adjustment, the raw side total, each room's percentage and point contribution, substituted players and penalties, and empty slots. Schools can be sorted by name, calculated overall, largest overall change, or roster exceptions.

Only wholly empty eligible rosters keep their stored ratings. A populated school missing an entire side receives replacement scores for its empty slots and a visible roster warning.

## Roster basis

- **Current:** players assigned to the school by the save's current TeamIndex.
- **Upcoming:** available during the supported offseason before Preseason. Uses returning veterans plus committed HS/JUCO recruits and transfers; excludes graduating players, draft departures, portal departures, and uncommitted players. It uses current player OVR without predicting future commitments, progression, or roster-limit cuts.

The default is upcoming during the supported offseason and current otherwise. The chosen basis is part of the reviewed preview ID and is preserved through apply, save, and failure recovery.

## Save boundary

Only `Team.TEAM_RATINGOVR`, `Team.TEAM_RATINGOFF`, and `Team.TEAM_RATINGDEF` are written. `Dynasty.load` requests them in its first Team read, using the roster Team table's unique ID, 3359508968.

The preview binds source hash, settings, selected user team, roster basis, and calculation output. Apply rejects stale input or a changed preview. Ratings and transfer edits cannot share a staged transaction; fixture writes remain forbidden.

Save backs up the source and writes a temporary file. Before replacement, verification reopens the temporary save and backup, checks all expected ratings, and compares every table's raw bytes against the backup amended only at those three fields. A failed verification preserves the source.

## Focused verification

Use `node tools/team-ratings-check.mjs --save` for routine changes. It checks the corrected fallback, a compatible backup without double-counting, an incomplete roster, roster-basis identity, and your school's inclusion. One fresh Signing Day copy is saved through backup/reopen verification, with league counts and three named players checked. The older `team-ratings-test.mjs` remains available for deeper investigation.

The v2 check passed on October 24, 2026: 138 schools, 138 rating changes, 18 modeled line substitutions, and 16,233 player records. The source fixture stayed unchanged. Austin Mack (83), Jonaz Walton (85), and Kyler Kasper (85) retained their records, OVR, and team assignments.

| School | Stored OVR / OFF / DEF | Calculated OVR / OFF / DEF |
| --- | --- | --- |
| Kansas | 81 / 81 / 81 | 79 / 80 / 77 |
| Georgia | 94 / 94 / 94 | 84 / 82 / 85 |
| Ohio State | 94 / 94 / 96 | 85 / 86 / 83 |

Evidence: `test_runs/team-ratings-v2-IjpTnv/report.json`. These checks establish file integrity and implementation behavior. Tom's disposable-copy in-game display/persistence check remains outstanding. Broad multi-fixture and browser regression suites were not rerun for v2.
