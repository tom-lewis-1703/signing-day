# V1.2 first implementation review — October 22, 2026

Tom authorized implementation after reporting that the isolated CPU-transfer withdrawal works in-game. This report concerns the first full market, not final behavioral acceptance.

## Implemented and checked

- Pure normalization validates actual commitment-board ownership, storage aliases, transfer eligibility, and user-team protection before planning.
- V1.2 forecasts, independent player/school utilities, fixed simulated traits, concurrent no-cut offers, contingent veteran replacements, and original opportunity promises are implemented.
- All CPU withdrawals precede all veteran cuts and all transfer commitments. No HS/JUCO rescission, direct veteran relocation, permanent record deletion, or rating/class edit occurs.
- Model arithmetic and constructed market tests pass. Nine safety checks cover explicit selection, fixture-path protection, aliased storage, duplicate ownership, stale review/source rejection, and full rollback after an injected withdrawal-stage failure.
- The first complete plan saved to a disposable copy, reopened, and preserved the user roster, all user commitments, all 3,928 HS/JUCO commitments, and player record count. Every fixture hash remained unchanged.
- Independent verification replayed 17 rounds, 2,911 offers, 663 signings and 377 baseline trims. It checked 30,078 offered cut variants and 1,194,808 final legal transactions: zero feasible transactions remained. It also verified 188 board-only counterfactuals.

## First result

Seed: `sd-v1.2-001`; fixture user team: Kansas. Input: 1,310 uncommitted + 572 CPU-committed transfers = 1,882 candidates. Nine Kansas transfer commitments remain outside the market. Normalization leaves 882 CPU board slots.

The plan signs 663 and leaves 1,219 unplaced. It releases 377 veterans to resolve inherited overages and 222 in accepted replacements. Former CPU signees: 223 reassigned, eight independently choose the same school, and 341 remain unplaced. Their withdrawal state passed reopen checks. No final-year OVR85+ signer has final modeled opportunity below35 in this seed.

Technical evidence:

- `test_runs/market-v1.2-WrMTS8/report.json`, `plan.json`, and saved copy/backup.
- `test_runs/market-safety-7tNSlm/result.json`.
- `test_runs/market-verify-NijmXj/report.json`.

## Open behavioral decision

462/663 signers (69.7%) have a mutually acceptable standalone alternative more than 10 utility points better that did not offer. The specified threshold is 10%. Of those 462, 414 preferred a school already at85; in 251 cases the preferred school lost every offer that round. The inspected arithmetic and independent verifier support this being a consequence of the specified offer/acceptance rules, rather than an implementation error.

Examples:

- Jesse Legree WR87 takes his only actual offer from Sac State (U62.25). Texas would be mutually acceptable (U89.77/net2.48), but pursued C Michael Hershey instead.
- Lance Heard LT88 takes Ga Southern (U53.22); willing Ohio State (U93.49) pursued CB Dijon Lee Jr.
- Jackson Arnold QB86 takes Nevada (U54.17); willing Indiana (U88.23) pursued Cade Uluave and lost him to Alabama.

These are ordinary traits and constrained offer timing, not exceptional lifestyle explanations. The next substantive model decision is whether to revise the combination of one contingent offer per full school and immediate irreversible acceptance. No silent parameter or policy tuning has been made.

The highest ten unplaced players are HB85–87. Caleb Komolafe87 has 28 otherwise-feasible board-only vetoes; lack of placement should not be described as refusal of every school. TCU, Minnesota and Penn State finish85 with no empty modeled first-team slots, but recover only part of the value of withdrawn native signees and exhaust three replacements. Existing protected commitments also preserve crowded rooms, including Mississippi State HB10/WR16 and MTSU WR18 with13 protected recruits. These effects need judgment beyond passing invariants.

## Outstanding

Browser workflow proof is recorded separately when complete. The first-result competition-policy review, eight-seed behavioral assessment, and final integrated in-game advance remain separate acceptance gates. The isolated withdrawal game result does not establish final roster enjoyment or the integrated market's game behavior.
