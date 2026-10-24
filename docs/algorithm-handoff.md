# Algorithm handoff

Updated October 24, 2026. Current implementation: **v1.6** on main. Read `AGENTS.md` for save-safety requirements.

## Current behavior

This is a standalone Signing Day CPU transfer market. An explicit user-school selection is required. That school's roster and commitments are protected; Kansas was selected for the recorded runs.

1. **Normalize the market.** Reopen all eligible CPU transfer commitments and combine those players with initially uncommitted transfers. Original CPU destinations and recruiting influences are audit data, not preference inputs. Incoming recruits and returning players form projected school rosters after known departures are excluded.
2. **Clear surplus freshmen.** CPU teamless incoming freshmen with observed OVR <=58 and known Normal development may be un-signed only when their room exceeds all modeled depth slots, removal loses zero current and future roster value, and a frozen future-coverage floor survives. Protect Impact/Star/Elite, unknown development and Keep selections. Run cleanup before veteran overage cuts and after accepted arrivals. Each release frees a roster place and commitment-board entry.
3. **Resolve inherited overages.** Trim returning veterans toward 85 by lowest marginal roster-value loss while preserving coverage and locks. If a school cannot reach 85 under the protections, roll back its provisional veteran trims and exclude it; valid surplus cleanup remains.
4. **Score both sides separately.** Schools value current and discounted future roster improvement, less acquisition and displacement costs. Players value immediate opportunity, future opportunity, prestige, home-state affinity and their game motivation. Both sides must prefer the transaction to their alternative.
5. **Issue competing offers in rounds.** Schools can offer across multiple position groups, with capacity reserved and no overlapping rooms within a school's batch. A player immediately accepts his best acceptable actual offer. Completed signings are binding. Later transactions must preserve the opportunity and willingness promised to earlier signers within defined tolerances.
6. **Stop when no permitted mutually acceptable transaction remains.** There is no forced placement, automatic roster filling or final reassignment of completed signings.

## Model and restrictions

- Position groups and school schemes set starter, rotation, backup and developmental slots. Some left/right positions are pooled. The second HB has extra roster-value weight (0.50) and opportunity score 70.
- Forecasts cover two seasons. Returning players/transfers receive a modeled +2 first-season rating estimate; future growth depends on development. Forecasts never change saved ratings or class.
- School development philosophies and player culture/social preferences are seeded simulation inputs, not observed facts. Ordinary players retain 82–92% football-feature weight; approximately 1% receive a simulated exceptional lifestyle preference with 60–70% lifestyle weight. Actual NIL offers, production history and coach relationships are not modeled.
- The seed fixes traits across replans. Changing constraints can change allocations without redrawing personalities. An original CPU commitment gets no continuity preference; returning to the actual previous school carries a preference penalty.
- Roster maximum: **85**, plus the actual physical capacity of each commitment board. Veteran cuts do not free commitment-board entries.
- At most **three discretionary veteran replacements per school**, separate from initial overage cuts.
- A full-board school can additionally release **one normal-development 1–2★ recruit** as part of an accepted transfer offer. This allowance is separate from surplus-freshman cleanup.
- There is **no three-QB minimum** and no automatic backup transfer after a manual move. The general veteran coverage floor is usually starters plus one, which permits two QBs. Cleanup also preserves future coverage; it is not a general positional roster cap.
- Keep controls protect releases; exclude controls prohibit player-school pairings. Replanning uses the original opened snapshot and retained seed.

## Recorded results

Same fixture, Kansas protected, seed `sd-v1.2-001`:

| Measure | v1.5 | v1.6 |
|---|---:|---:|
| Transfers placed / 1,882 | 697 | 1,042 |
| Transfers rated 85+ unplaced | 7 | 0 |
| Veteran cuts | 603 | 402 |
| Surplus freshmen released | 0 | 622 |
| Other recruit releases | 30 | 6 |

All 140 fixture freshmen rated <=58 with Impact/Star/Elite development remained. Useful low-rated Normal prospects also remained; the cutoff alone never authorizes cleanup.

The later run on the real `DYNASTY-SIGNINGDAY` used a different source snapshot: **1,145 placed, 737 unplaced, 573 surplus freshmen released, four other recruit releases and eight veteran cuts**. All 704 original CPU transfer commitments were reopened. Kansas's full checked snapshot remained unchanged. Do not compare this run's counts to the fixture as if only an algorithm parameter changed.

Tom subsequently advanced into the season and manually changed destinations. Those manual changes do not update the algorithm or teach its preferences. The recorded run reports describe the saved algorithm output, not the current manually edited dynasty. The interrupted manual-edit attempt wrote only a disposable copy; its temporary GUI and executable plan were removed.

## Unresolved behavior

- **Early binding acceptance is the main identified competition problem.** A player can sign before a more appealing school would offer him later. The diagnostic counts signers with a gap over 10 utility points where the preferred school would actually have offered in a later round. It affected **143/1,042 (13.7%)** in the v1.6 fixture and **156/1,145 (13.6%)** in the real run, above the existing 10% review threshold. The fixture's v1.5 rate was 5.6%. Cleanup opened capacity but did not fix offer timing.
- **Crowded rooms remain.** Cleanup only removes qualifying low-rated freshmen with zero marginal value. Higher-rated recruits, protected development and retained veterans can preserve large rooms. The real-run review recorded HB rooms of nine and WR rooms up to 17.
- **Roster quality is not established by mechanical checks.** Coverage, growth, opportunity and future value are approximations. Small schools can gain elite players when both valuations agree; there is no hard prestige gate. No policy guarantees equal talent distribution or full rosters.
- A deferred-acceptance or other offer-timing revision has **not** been implemented. The separate experimental roster-clearing worktree is **not** the active v1.6 implementation.

## Verification and entry points

Model scenarios, cleanup tests, safety checks, independent market replay and backup/write/reopen verification passed for the recorded v1.6 proof. The independent verifier reconstructed cleanup and enumerated final legal transactions with no residual feasible pair. It shares some model formulas and the reader; this establishes implementation consistency, not empirical realism. Tom reported the isolated CPU withdrawal game check passed. A comprehensive behavioral review across seeds and after game rollover is not recorded as complete.

Core files:

- `lib/market-input.mjs`: normalization, ownership and mutable-reference validation.
- `lib/market-model.mjs`: forecasts, depth slots, school/player values and seeded preferences.
- `lib/recruit-cleanup.mjs`: surplus-freshman eligibility, depth and succession checks.
- `lib/transfer-market.mjs`: offers, acceptance, releases, promises and diagnostics.
- `lib/gui-plan.mjs`, `gui/app.js`, `gui.mjs`: review, explanations and constraints.
- `lib/session.mjs`, `lib/roster-edits.mjs`, `lib/safe-save.mjs`: exact-plan apply, established field writes, backup and reopen verification.

Reference documents: `docs/replacement-transfer-spec-v1.md` (currently v1.6 despite its filename), `docs/replacement-transfer-acceptance-v1.md`, `docs/recruit-cleanup-v1.6.md`, and `docs/manual-roster-move-check.md`. The historical first-market review describes v1.2, not current results.

Verification commands: `node tools/market-model-test.mjs`, `node tools/recruit-cleanup-test.mjs`, `node tools/market-safety-test.mjs`, and `node tools/market-check.mjs --save`. The last command writes only a fresh disposable copy. Do not rerun tools against a real save as a resumption step.

Local evidence (Git-ignored; may not exist in another checkout):

- `test_runs/market-v1.2-hWymkF/`: v1.6 fixture plan, comparison, saved-copy proof and final checks. The directory's v1.2 prefix is historical; read the report's model field.
- `test_runs/market-verify-FLe9RV/report.json`: independent fixture verification.
- `test_runs/market-safety-2inRHs/result.json`: safety checks.
- `test_runs/live-signingday-7EmjiN/review.json` and `saved.json`: real-run output and verification.

Real saves require the GUI's explicit Save, a verified backup and reopen verification. Never write to `test_saves/`. Changes to established writing formulas need fresh-copy proof and Tom's in-game retest.
