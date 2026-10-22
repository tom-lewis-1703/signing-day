# Signing Day

Personal local CFB 27 dynasty tool. Open a Signing Day save, explicitly select your school, review the CPU transfer market, optionally add constraints/replan, then save the exact reviewed plan. Your roster and commitments remain protected.

```sh
npm install
node gui.mjs
```

The server binds to localhost at port 5178 (or the next free port). `--no-open` suppresses opening the browser.

## Current implementation

V1.3 reopens all CPU transfer commitments and runs competing offers with separate player and school valuations. HS/JUCO commitments are preserved. Player preferences and school philosophies are explicitly simulated, fixed by seed, and never written into save ratings. Native CPU destinations are audit data, not preferences.

The interface includes explicit team selection, school and player review, three roster projections, unplaced-player diagnostics, keep/exclude constraints, seed-preserving replans, named change comparisons, and an explicit Save. Save is bound to source bytes, team, seed, constraints, settings, and the reviewed plan. Writes use a verified backup and temporary-file reopen verification before replacing the original. Fixture paths are refused at the write boundary, including alternate Windows casing.

The implementation is technically verified, **not behaviorally accepted**. The v1.2 first result triggered the competition review. Tom chose revision 1.3: schools at 85 may make one contingent offer per room per round, and the review counts only real misses (the better school would have offered him in a later round). Seed `sd-v1.2-001` now places 670 of 1,882 candidates in 14 rounds and releases 606 veterans (377 inherited-overage trims, 229 replacements). 440 signers had a willing school more than 10 utility points better, but only 61 (9.1%) are real misses, under the 10% trigger. The v1.2 rule with the same measure gives 108 (16.3%). Instant binding acceptance is unchanged.

Tom reported the isolated withdrawal in-game check passed. The final integrated market game check and eight-seed behavioral acceptance are separate and remain outstanding. Use a disposable copy while reviewing this implementation.

## Verification

```sh
node tools/market-model-test.mjs
node tools/market-safety-test.mjs
node tools/market-check.mjs --save
```

`market-check` creates a unique fresh copy in `test_runs`, uses the explicit fixture team from settings, reports named cases and league counts, and confirms all source fixtures remain unchanged. `--save` exercises backup/write/reopen and verifies protected commitments and transfer outcomes. `baseline-check.mjs` now forwards to this current proof; the old forced-placement counts are not v1.2 acceptance targets.

`tools/market-verify.mjs` independently replays the stored market and enumerates every legal final cut/add transaction. See its command usage for a saved plan and original copy/backup. It checks implementation fidelity, not whether the resulting roster experience is desirable.

The design and acceptance contract are in [docs/replacement-transfer-spec-v1.md](docs/replacement-transfer-spec-v1.md) and [docs/replacement-transfer-acceptance-v1.md](docs/replacement-transfer-acceptance-v1.md). [First implementation review](docs/first-market-review.md) records the v1.2 evidence and the decision that led to v1.3.
