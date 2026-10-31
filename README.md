# Signing Day

Personal local CFB 27 dynasty tool. Open a Signing Day save, explicitly select your school, review the CPU transfer market, optionally add constraints/replan, then save the exact reviewed plan. Your roster and commitments remain protected.

```sh
npm install
node gui.mjs
```

The server binds to localhost at port 5178 (or the next free port). `--no-open` suppresses opening the browser.

## Current implementation

V1.6 reopens all CPU transfer commitments and runs competing offers with separate player and school valuations. Players hold their best offer and may trade up until the market ends. Schools may make up to six veteran replacements, and a veteran rated 78+ can be released only for a player at his own position. HS/JUCO commitments are preserved, except that a school with a full commitment board may un-sign up to three 1–2★ recruits (never Star/Elite development) for transfers it wants more; the game deletes those recruits at the Preseason rollover. Player preferences and school philosophies are explicitly simulated, fixed by seed, and never written into save ratings. Native CPU destinations are audit data, not preferences.

The interface includes explicit team selection, school and player review, three roster projections, unplaced-player diagnostics, keep/exclude constraints, seed-preserving replans, named change comparisons, and an explicit Save. Save is bound to source bytes, team, seed, constraints, settings, and the reviewed plan. Writes use a verified backup and temporary-file reopen verification before replacing the original. Fixture paths are refused at the write boundary, including alternate Windows casing.

The implementation is technically verified, **not behaviorally accepted**. Tom chose revision 1.6 after in-memory what-ifs: held offers, six replacements, the 78+ release guard and three recruit releases. Seed `sd-v1.2-001` now places 857 of 1,882 candidates in 34 rounds, with 1,604 trade-ups, and releases 696 veterans (377 inherited-overage trims, 319 replacements) and 111 recruits (OVR 45–63). Three players rated 85+ remain unplaced, all HBs. No signer is a real miss; 474 (55.3%) finish more than 10 utility points below a school that wanted them but had no capacity left. Planning takes about 40 seconds.

Tom reported the isolated withdrawal in-game check passed. The final integrated market game check and eight-seed behavioral acceptance are separate and remain outstanding, including for v1.6. Use a disposable copy while reviewing this implementation.

## Verification

```sh
node tools/market-model-test.mjs
node tools/market-safety-test.mjs
node tools/market-check.mjs --save
```

`market-check` creates a unique fresh copy in `test_runs`, uses the explicit fixture team from settings, reports named cases and league counts, and confirms all source fixtures remain unchanged. `--save` exercises backup/write/reopen and verifies protected commitments and transfer outcomes. `baseline-check.mjs` now forwards to this current proof; the old forced-placement counts are not v1.2 acceptance targets.

`tools/market-verify.mjs` independently replays the stored market and enumerates every legal final cut/add transaction. See its command usage for a saved plan and original copy/backup. It checks implementation fidelity, not whether the resulting roster experience is desirable.

The design and acceptance contract are in [docs/replacement-transfer-spec-v1.md](docs/replacement-transfer-spec-v1.md) and [docs/replacement-transfer-acceptance-v1.md](docs/replacement-transfer-acceptance-v1.md). [First implementation review](docs/first-market-review.md) records the v1.2 evidence and the decision that led to v1.3.
