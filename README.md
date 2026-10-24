# Signing Day

Personal local CFB 27 dynasty tool. Open a Signing Day save, explicitly select your school, review the CPU transfer market, optionally add constraints/replan, then save the exact reviewed plan. Your roster and commitments remain protected.

The GUI opens to a dark dynasty dashboard with Transfer Market and Team Ratings tools. Browse every school’s roster, position rooms, recruiting class, and transfers; click players to inspect their profiles and all 54 loaded attributes. Team pages distinguish the current save from upcoming or proposed rosters. [Design and browser verification](docs/gui-redesign.md).

```sh
npm install
node gui.mjs
```

The server binds to localhost at port 5178 (or the next free port). `--no-open` suppresses opening the browser.

On launch, the GUI reopens the last successfully opened save and returns to the dashboard using the school you previously selected for that file. A save without a remembered valid school opens the school picker. If the file is unavailable, the save chooser stays available. Use **Change save** to open another dynasty. Startup only browses the save; tool previews and saving remain separate actions.

The separate **Recalculate team ratings** tool previews overall, offense, and defense for every team, including yours. Select your school and this tool after opening a save. It uses 80% starters / 20% backups, scheme-specific starter counts, and extra QB weight; **Save ratings** writes only the three team-rating fields through backup and reopen verification. See [the formula and fresh-copy proof](docs/team-ratings-v1.md). Run `node tools/team-ratings-test.mjs --save` to verify it on a disposable copy. In-game display/persistence still needs Tom's check.

## Current implementation

For AI resumption, read [the algorithm handoff](docs/algorithm-handoff.md).

V1.6 reopens all CPU transfer commitments and runs competing offers with separate player and school valuations. It clears surplus CPU incoming freshmen rated 58 or lower before veteran cuts and after transfer arrivals. A release must be beyond all modeled depth slots, lose no current or future value, and preserve a frozen succession floor. Impact/Star/Elite prospects, unknown development and Keep selections are protected. Each release frees both roster and commitment-board space. A full-board school may also un-sign one normal-development 1–2★ recruit when a transfer it wants more accepts. The game deletes unsigned recruits at the Preseason rollover. Player preferences and school philosophies are explicitly simulated, fixed by seed, and never written into save ratings. Native CPU destinations are audit data, not preferences.

The interface includes explicit team selection, school and player review, three roster projections, unplaced-player diagnostics, keep/exclude constraints, seed-preserving replans, named change comparisons, and an explicit Save. Save is bound to source bytes, team, seed, constraints, settings, and the reviewed plan. Writes use a verified backup and temporary-file reopen verification before replacing the original. Fixture paths are refused at the write boundary, including alternate Windows casing.

The implementation is technically verified, **not fully behaviorally accepted**. On a fresh copy with Kansas explicitly protected, seed `sd-v1.2-001` places 1,042 of 1,882 candidates (v1.5: 697), releases 402 veterans (was 603), and un-signs 622 surplus freshmen plus six contingent recruits. All 85+ candidates are placed (was seven unplaced). All 140 incoming freshmen rated <=58 with Impact/Star/Elite development remain. The v1.5 competing-offer, second-HB, immediate-acceptance and three-veteran-replacement rules remain in place. [V1.6 rules, named examples and verification](docs/recruit-cleanup-v1.6.md) distinguish this targeted fix from the separate roster-clearing implementation.

Tom reported the isolated withdrawal in-game check passed. The final integrated market game check and eight-seed behavioral acceptance are separate and remain outstanding. Use a disposable copy while reviewing this implementation.

The v1.6 competition diagnostic is unresolved: 143 of 1,042 signers (13.7%) accept before a more appealing school would have offered later, above the 10% review threshold and v1.5's 5.6%. The cleanup is verified; it does not establish full market acceptance.

## Verification

```sh
node tools/market-model-test.mjs
node tools/recruit-cleanup-test.mjs
node tools/market-safety-test.mjs
node tools/market-check.mjs --save
```

`market-check` creates a unique fresh copy in `test_runs`, uses the explicit fixture team from settings, reports named cases and league counts, and confirms all source fixtures remain unchanged. `--save` exercises backup/write/reopen and verifies protected commitments and transfer outcomes. `baseline-check.mjs` now forwards to this current proof; the old forced-placement counts are not v1.2 acceptance targets.

`tools/market-verify.mjs` independently replays the stored market and enumerates every legal final cut/add transaction. See its command usage for a saved plan and original copy/backup. It checks implementation fidelity, not whether the resulting roster experience is desirable.

[GUI regression checks](tools/gui-regression.md) use recorded plan/card responses for browser layout and interaction checks. [GUI repair evidence](docs/gui-repair-plan.md) also records the fresh-copy backup/save/reopen proof.

The design and acceptance contract are in [docs/replacement-transfer-spec-v1.md](docs/replacement-transfer-spec-v1.md) and [docs/replacement-transfer-acceptance-v1.md](docs/replacement-transfer-acceptance-v1.md). [First implementation review](docs/first-market-review.md) records the v1.2 evidence and the decision that led to v1.3.
