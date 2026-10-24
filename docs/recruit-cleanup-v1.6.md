# Surplus freshman cleanup — October 23, 2026

Tom chose to release surplus CPU incoming freshmen rated 58 or lower while protecting useful depth and development. V1.5's one contingent recruit release per school left large stockpiles occupying both projected roster places and commitment-board entries. V1.6 adds cleanup to the main implementation; it does not merge the separate roster-clearing worktree.

## Rule

Only teamless incoming Freshman recruits with observed OVR <=58 and known Normal development qualify. Keep selections, the user school, Impact/Star/Elite and unknown development are protected. Before veteran overage trims, remove a qualifying recruit only when his room exceeds every modeled current depth slot, his removal loses zero V1 and V2, and the room retains its frozen future coverage: min(original future-eligible count, starters + one), or the support-room count. Recompute after each removal and choose the lowest OVR, then q2, then player reference. Repeat after each accepted batch so arrivals cannot recreate removable surplus.

Cleanup has no arbitrary per-school quota and does not spend the separate allowance of one contingent recruit release. It frees both roster and board capacity. The existing contingent release now also protects Impact and unknown development. Useful low-rated freshmen remain; this is not a blanket cutoff. All releases use the unchanged `unsignRecruit` writer. No record deletion or rating/class edit was added.

The GUI shows the total recruits released, the surplus subset, each recruit's reason and coverage evidence, and Keep controls. Kept recruits are shown under their commitment-board school rather than their teamless TeamIndex. League counts distinguish original from retained recruits and no longer count recruit releases as veteran releases.

## Same-source comparison

Fixture: `test_saves/DYNASTY-SIGNINGDAYCOPY`, copied before every run. Explicit fixture team: Kansas (`settings.json.testSavesTeam`), index 37. Seed: `sd-v1.2-001`; source SHA-256: `e0f4cd88d363e1f58148e0aff11435fd444895dcc6dae76b6cea64ecc2be3ed6`.

| Measure | v1.5 | v1.6 |
|---|---:|---:|
| Transfers placed / 1,882 | 697 | 1,042 |
| Transfers rated 85+ unplaced | 7 | 0 |
| Veteran overage cuts | 377 | 213 |
| Veteran replacements | 226 | 189 |
| Total veteran cuts | 603 | 402 |
| Recruit releases | 30 | 628 |
| Surplus-freshman cleanup releases | 0 | 622 |
| Mississippi State HB room | 10 | 6 |
| Maryland WR room | 14 | 12 |

The original CPU rosters contain 1,345 incoming freshmen rated <=58; 720 remain in the final plan. All 122 Impact, five Star and 13 Elite prospects in that cohort remain. Of the six contingent releases, three are also freshmen rated <=58; this explains why that cohort drops by 625 rather than 622. No further recruit meets the surplus cleanup rule on any final roster.

Named checks:

- Air Force HB Brayden Drews (52, Normal): released from a seven-player HB room with five modeled depth slots; four future-eligible players remain, above the floor of two. Both value losses are zero.
- Air Force C Timothy Zemlicka (58, Normal): released from a four-player room with three depth slots; two future-eligible players remain, meeting the floor of two.
- Air Force HB Latavian Pray (58, Impact) and Akron DT Joncarlo Donath (53, Impact): retained.
- Air Force RG Oscar Hunt (58, Normal): retained; low rating alone is not a release condition.
- Trevor Bindel: previously unplaced, now signs with Missouri State. Lance Heard moves from Georgia Southern to Oregon State after seven actual offers. Nate Sheppard remains at Texas; Jesse Legree remains at Sacramento State.

## Verification

- `node tools/market-model-test.mjs`: existing arithmetic and market scenarios pass.
- `node tools/recruit-cleanup-test.mjs`: inclusive cutoff, useful depth, frozen succession, development, Keep/user protection, board accounting, repeated post-arrival cleanup and unresolvable-overage behavior pass.
- `node tools/market-safety-test.mjs`: nine safety checks pass, including explicit team selection, fixture write rejection, stale-plan rejection and rollback. Evidence: `test_runs/market-safety-2inRHs/result.json`.
- `node tools/market-check.mjs --save`: fresh-copy apply, verified backup and independent reopen pass. Every retained commitment and user roster/commitment check passes; player count remains 16,233 and all fixture hashes remain unchanged. Evidence: `test_runs/market-v1.2-hWymkF/report.json`, `plan.json`, `fixture-hashes.json` and the saved copy/backup there. Original v1.5 comparison: `test_runs/market-v1.2-YO6r8l/`.
- `node tools/market-verify.mjs --plan test_runs/market-v1.2-hWymkF/plan.json --source test_runs/market-v1.2-YO6r8l/DYNASTY-SIGNINGDAYCOPY`: independently reconstructs cleanup without its production helper, replays 5,835 offers and 18 rounds, and enumerates 1,709,554 final transactions; zero residual feasible transactions. Evidence: `test_runs/market-verify-FLe9RV/report.json`. A deliberately omitted surplus release is rejected.
- `test_runs/market-v1.2-hWymkF/cleanup-comparison.json`: original/final low-rated cohorts, development counts, named releases/retentions, school comparisons and negative-control result.
- Browser review: displayed the surplus count and Brayden Drews's release card, kept him at Air Force through a same-seed replan, then removed the constraint and recovered the exact original plan ID. The GUI's source-copy bytes remained unchanged. `test_runs/market-v1.2-hWymkF/final-checks.json` records the checks; `cleanup-player-card.png` shows the explanation. JavaScript syntax and `git diff --check` pass.

Plan ID: `ff669ed5fc47378587ebc1329b0bd791654803a85483c05228a5dd96e280b96b`. Saved-copy SHA-256: `21d6bf2d2c98576de1e0615a89ab360f79a593ba30ff5fcd2908331dc429b010`.

The broader competition diagnostic regresses: 143/1,042 signers (13.7%, versus 39/697 or 5.6% in v1.5) accepted before a more appealing school would have offered in a later round. This exceeds the existing 10% review threshold. More open capacity changes the offer sequence; the instantaneous binding acceptance policy remains unchanged. The result is not full behavioral acceptance. No final-year 85+ signer has final opportunity below 35; the smallest projected team has 75 players. TCU and Penn State still decline in modeled first-season value relative to native commitments. These unresolved competition and roster-quality limits are visible in the plan diagnostics.

These are focused results from one seed and one dynasty. Broader competition/football-quality acceptance and the integrated in-game advance remain outstanding. Higher-rated recruits, protected development, model-valued depth and succession can still leave crowded rooms. Writing formulas are unchanged; no real save or source fixture was edited.
