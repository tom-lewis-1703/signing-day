# Team ratings v1

Open a dynasty save, explicitly select your school, choose **Recalculate team ratings**, and click **Preview ratings**. Review stored → recalculated overall/offense/defense for every school, including your own. Select any school for the named starters, backups, room averages, and room weights. **Save ratings** uses the existing backup, temporary-file write, and reopen-verification flow. This tool is separate from the transfer market; it never applies transfer moves.

## Formula

This is a custom rating on the player OVR scale, not a reproduction of EA's team-rating scaling.

1. Group eligible players into the existing position rooms and sort by current OVR, then player record index to break ties. Do not change the game's depth chart.
2. Use the existing scheme-specific starter counts. Offense and defense each have 11 starter slots. Unknown schemes use the existing fallback counts.
3. For a room with S starter slots, take the top S players as starters and the next S as backups. Room score = 0.8 × starter average + 0.2 × backup average. Empty slots count as 40 OVR, so roster holes reduce the rating. Players beyond this two-deep do not dilute it.
4. Average room scores using S as the room weight, except QB has weight 2. The QB therefore has twice the influence of a single starter slot. Round each side to the nearest integer and clamp to 0–99.
5. Overall = round((displayed offense + displayed defense) / 2). Kickers and punters do not affect these three ratings.

At supported offseason stages, use the existing upcoming-season membership rules: returning veterans plus committed HS/JUCO recruits and transfers; exclude graduating players, draft departures, portal departures, and uncommitted players. At other stages, use current TeamIndex membership. Current player OVR is used without simulated progression. The calculation does not predict future roster-limit cuts. Empty offense/defense placeholder teams keep their original ratings and are marked skipped.

## Save boundary

Only `Team.TEAM_RATINGOVR`, `Team.TEAM_RATINGOFF`, and `Team.TEAM_RATINGDEF` are written. Dynasty.load requests them in its first Team read. The roster Team table is selected by its existing unique ID (3359508968); saves have several other tables named Team.

The preview ID covers the formula output, source hash, settings hash, and explicit user-team choice. Apply rejects a changed source, settings, preview, or loaded roster. Ratings and transfer edits cannot share a staged transaction. Fixture writes remain forbidden.

Before replacing the source, verification reopens the staged file and backup, checks every team's three expected ratings, and compares every table's raw bytes with the backup amended only at those exact fields. This catches extra writes even within an otherwise permitted Team row. A rejected verification leaves the source intact.

## Verification

`node tools/team-ratings-test.mjs --save` creates a unique fresh fixture copy in test_runs. It checks formula weights, depth selection, empty slots, ignored specialists, determinism, skipped placeholders, user-team selection, preview tampering, source and roster changes, fixture guards, mixed-tool rejection, same-row unrelated-write rejection, backup equality, exact persisted ratings, named-player preservation, and idempotence.

Fresh Signing Day proof: 138 teams reviewed; 137 changed; 0 skipped; 16,233 player records preserved. Upcoming membership includes 12,165 players in recognized rooms. Preseason preview: 138 teams; 16,448 named players; 11,749 currently rostered players in recognized rooms.

| School | Stored OVR / OFF / DEF | Recalculated OVR / OFF / DEF |
| --- | --- | --- |
| Kansas | 81 / 81 / 81 | 79 / 80 / 77 |
| Georgia | 94 / 94 / 94 | 84 / 82 / 85 |
| Alabama | 91 / 89 / 94 | 83 / 83 / 82 |
| Ohio State | 94 / 94 / 96 | 85 / 86 / 83 |
| Ball State | 69 / 69 / 71 | 73 / 73 / 72 |

Named preserved players include Austin Mack (83), Jonaz Walton (85), Kyler Kasper (85), Talyn Shettron (79), and Jackson Cook (78). Evidence: `test_runs/team-ratings-FMAmyu/report.json`.

The live GUI was also checked on fresh Signing Day and Preseason copies: explicit team selection, tool selection, school search (including no matches), named calculation breakdowns, no desktop horizontal overflow, and Save ratings through the completion screen. Both saved copies independently reopen with zero remaining rating changes. Preseason Kansas is 81 / 83 / 78 using its current roster. GUI evidence: `test_runs/gui-team-ratings-n4iQjr/gui-report.json`; preview: `test_runs/team-ratings-preview.png`.

Existing transfer baseline remains 1,042 placements, 840 unplaced, 402 veteran cuts, and 628 recruit releases. The market safety tests pass. These checks establish file integrity and implementation behavior. Tom still needs to check the new rating fields' display and persistence in-game on a disposable copy.
