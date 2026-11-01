# Algorithm handoff

Updated November 1, 2026. Read `AGENTS.md` for save-safety rules.

## Status

- **Code:** market **v1.8** and the sophomore draft lock are on branch `claude/signing-day-work-ff8e49`. Main is still v1.7, and nothing has been pushed.
- **Team:** Tom's team in these dynasty saves is Kansas. Still pass it explicitly. Season 2 stage saves are in Tom's saves folder.
- **Proven in-game:** v1.7 reached Preseason with all 1,115 signers at their planned schools.
- **Not yet checked in-game:** v1.8 and the draft lock. Both are waiting on Tom:
  1. **Market:** run the transfer tool on a copy of `DYNASTY-SIGNINGDAYS2`, save, advance to Preseason, then compare with `test_runs/s2-comparison/scripts/preseason-compare-v17.mjs` (change its save names).
  2. **Draft lock:** use the dashboard button on a copy of `DYNASTY-PLYRSLEAVING` and advance to Week 4. Malachi Toney (Miami), Dakorien Moore (Texas Tech) and Nate Sheppard (LSU) should still be on their teams. If they leave, try a copy of `DYNASTY-WEEK1`.

**Working with Tom:** this is a personal tool, so keep testing light (see "Testing"). The GUI is a future item: don't change or check it unless Tom asks.

## Next task: the school model

Analyze and improve how schools decide who to sign. Measure first, recommend one design, and get Tom's OK before changing market code.

A school's value for a transfer looks only at the player's position room: the slot-weighted rating gain now, plus discounted future gain. Its cost is 4 + 0.5 per signing, plus a surcharge if someone is released. Roster size plays no part, so a school at 72 and one at 84 value a player the same.

- **Example:** UL Monroe has 72 players and 13 signings. Rodney Fields Jr. (HB84) adds 5.6 against a cost of 10.5, so the school passes. Signing him would also break the playing-time promise made to King Davis, so fixing the valuation alone would not place him.
- **Season 2 v1.8 plan:** 29 schools have 129 open spots while 335 transfers go unplaced. Four of those schools have full boards (13 spots). Across the other 25, 5,169 player-school pairings fail on both sides, 2,863 only on the school's side and 18 only on the player's.
- **Tradeoff:** the rising cost stops low-prestige schools collecting huge hauls just because they have room. Removing it would work against item 4.

**Decided by Tom:** no fill step. The game fills open spots at rollover, and did so at v1.7: it added 95 unplaced transfers (mean 74.9) and 18 recruits (mean 60.1), spread almost evenly across positions. Even a full fill could not hold every unplaced transfer: 335 players, 129 spots.

## Tom's list

1. Done: board-less hard commitments join the market.
2. Built in v1.8, in-game check pending: four-QB minimum, WR and HB signing caps.
3. Done in v1.8: rare lifestyle trait removed, as Tom decided. Ordinary social and culture preferences remain.
4. Open: low-tier teams look too close to top teams, including many premier QBs at 0-1 star schools. On the v1.7 Preseason, starting QBs averaged 80.4 at prestige 0-1, 82.1 at 2-3, 81.2 at 4-6 and 86.5 at 7-10. Tom expected this may need its own branch. Check `lib/team-ratings.mjs` and `docs/team-ratings-v2.md` first. The mod's team overalls range 74 to 87, with many 0-1 star teams at 76-79.
5. Partly done in v1.8: the cleanup ceiling rose from 58 to 62, so kept CPU recruits fell from 3,253 to about 2,950 on Season 2. Item 8 is the remaining route.
6. Built, in-game check pending: sophomore draft lock (see below).
7. GUI: a future item, set aside by Tom.
8. Open: a tool to run after Fang's recruiting mod each preseason that removes weak recruits and trims the class before they take board spots. Needs a Fang-modded preseason save. Deleting records must follow the save traps in `AGENTS.md`.

Order: Tom's in-game checks, the school model, then 8 and 4. The school model may change item 4, so measure item 4 again after it.

## How the market works

A standalone Signing Day CPU transfer market. An explicit user school is required, and that school's roster and commitments are protected.

1. **Normalize.** Reopen all eligible CPU transfer commitments and pool them with uncommitted transfers. Original destinations and influences are audit data, not preferences. Incoming recruits and returning players form each school's projected roster.
2. **Clear surplus freshmen.** Un-sign CPU incoming freshmen rated <=62 with Normal development only when the room exceeds its modeled depth slots, removal loses no current or future roster value, and a future-coverage floor survives. Protect Impact/Star/Elite, unknown development and Keep selections. This reruns whenever holds change a school. Each release frees a roster place and a board entry.
3. **Resolve overages.** Trim veterans toward 85 by lowest value loss, preserving coverage and locks. A school that cannot reach 85 is excluded.
4. **Score both sides.** Schools value roster improvement less costs. Players value immediate and future opportunity, prestige, home state and their game motivation. Both sides must prefer the deal, except on QB depth-floor offers.
5. **Offer in rounds.** Schools offer across position rooms, one offer per room per round. A player holds the best offer and may trade up, and each pair is offered once. A school cannot drop a hold. Later moves must keep the opportunity promised to current holders, within a tolerance.
6. **Stop** when no permitted deal remains, and holds become final. Only QB depth-floor offers override a player's preference; nothing fills rosters.

## Rules and limits

- **Roster and boards:** 85 maximum, plus each commitment board's real capacity. Veteran cuts do not free board entries.
- **Four-QB minimum:** releases and cleanup cannot take a QB room below four, counting only players who are staying. A school under four pays a 25-point premium for a QB, who takes the place even below his outside option (contract `depth floor`), since the alternative is deletion. He can still trade up while the market is open.
- **Signing caps, WR 14 and HB 8:** a room at its cap signs only by releasing someone from that room. Rooms already above a cap are not cut.
- **Veteran releases:** at most six discretionary replacements per school, separate from overage cuts. A veteran rated 78+ can be released only for a player at his own position. Outside QB, the coverage floor is usually starters plus one.
- **Recruit releases:** a full-board school can also release up to three Normal-development 1-2★ recruits for transfer offers, separate from cleanup.
- **Forecasts:** two seasons. Returning players and transfers get a modeled +2 first-season estimate, and later growth depends on development. Forecasts never change saved ratings or class.
- **Simulated inputs:** school development philosophies and player culture and social preferences are seeded, not observed. Football features keep 82-92% of a player's weight. NIL, production history and coach relationships are not modeled.
- **Seeds and locks:** the seed fixes traits across replans. Keep controls protect releases, and exclude controls prohibit player-school pairings. An original CPU commitment gets no continuity preference, and returning to the previous school carries a penalty.

## Sophomore draft lock

Early-draft rows are gone by Week 4, so this runs separately from the market. On a Players Leaving or Week 1 save, the dashboard's button sets each CPU sophomore's `EarlyNFL_*` rows to `LeaveStatus` Staying and `PersuadeAttempts` at least 1, the values the game writes for a persuasion, with backup and reopen verification.

Kansas, juniors and seniors are left out, and portal decisions are not changed. `DYNASTY-PLYRSLEAVING` has 33 such sophomores: without the lock 16 left for the draft, 11 stayed and six entered the portal. At Week 1 only those 16 still have rows. It is unknown whether the game honors the edit from Players Leaving.

## Results

Season 2 `DYNASTY-SIGNINGDAYS2`, Kansas protected, default seed:

| Plan | v1.7 | v1.8 |
|---|---:|---:|
| Transfers placed, of 1,559 | 1,115 | 1,224 |
| Rated 85+ | 253/254 | 254/254 |
| Rated 80-84 | 530/583 | 548/583 |
| Surplus freshmen released | 709 | 1,023 |
| Veteran releases | 701 | 525 |
| Teams under 4 QBs | 80 | 0 |
| Largest WR / HB room | 19 / 9 | 16 / 9 |
| Open roster spots | 112 | 129 |

In v1.8, 77 QBs signed on depth-floor offers, and 28 finish below their outside option. Six teams stay over a cap because of players already on the roster, and four schools are under 75 before the game fills them. Fixture with seed `sd-v1.2-001` places 1,228 of 1,882 (v1.7: 1,133).

v1.7 at Preseason, from reading `DYNASTY-S2V17TEST-AUTOSAVE`: the game removed no returning players, and Kansas kept its 57 returners and 24 signees. Of 736 released recruits, 723 were deleted and 13 placed. The game deleted one committed recruit, Kyle Cruz WR54.

Landed at Preseason, same save:

| | All In One mod | Hold-offers (v1.6) | v1.7 |
|---|---:|---:|---:|
| Transfers landed | 942 | 794 | 1,210 |
| Rated 85+ | 234/254 | 232/254 | 253/254 |
| Rated 80-84 | 322/583 | 386/583 | 534/583 |
| Teams under 4 QBs | 14 | 67 | 76 |

The mod keeps CPU commitments, forces new ones with Commit Score 100 and influence 999, places some transfers straight on rosters, and revived nine finished seniors.

## Known limits

- **Offer timing:** holds let a player reach a better school later, but a school cannot drop a hold, and capacity blocks many preferred schools. On the Season 2 v1.8 plan, 142 of 1,224 signers finish over 10 utility points below a school that wanted them but had no capacity left.
- **Crowded rooms:** caps only limit signings, and cleanup only removes low-rated freshmen with zero value. About 1,100 Normal-development recruits rated <=62 stay.
- **Roster quality:** coverage, growth and opportunity are approximations, and passing checks does not show rosters are realistic. There is no hard prestige gate, and no policy guarantees talent spread or full rosters.
- **Manual edits:** Tom's in-game destination changes do not teach the algorithm.

## Files

- `lib/market-input.mjs`: normalization, ownership and reference validation.
- `lib/market-model.mjs`: forecasts, depth slots, values, seeded preferences and `PARAMETERS`.
- `lib/recruit-cleanup.mjs`: surplus-freshman checks.
- `lib/transfer-market.mjs`: offers, acceptance, releases, promises and diagnostics.
- `lib/session.mjs`, `lib/roster-edits.mjs`, `lib/safe-save.mjs`: plan apply, draft lock, field writes, backup and reopen verification.
- `lib/gui-plan.mjs`, `gui/`, `gui.mjs`: review and explanations.

This file and the code are the current reference. The older market spec, which explains why many v1.7 rules exist, is in commit `cf0e5d97` as `docs/replacement-transfer-spec-v1.md`.

## Testing

Default for a market change:

```bash
node tools/market-model-test.mjs
node tools/recruit-cleanup-test.mjs
node tools/market-check.mjs --save
```

The last writes only a fresh copy under `test_runs/`. Add one Season 2 plan and save on a copy, with a few named players and league counts.

Only if Tom asks or a result looks wrong: `tools/market-verify.mjs`, `tools/market-safety-test.mjs`, `tools/draft-lock-test.mjs` (defaults to a copy of `DYNASTY-PLYRSLEAVING`, as the fixtures hold no sophomore rows), extra seeds and new test tools. The verifier checks that the code matches its rules, not that results are realistic.

Real saves are written only through the GUI's explicit Save, with a verified backup and reopen verification. Never write to `test_saves/`. Changes to established write formulas need fresh-copy proof and Tom's in-game retest.

## Evidence and repo notes

Git-ignored, so these may not exist in another checkout:

- `test_runs/s2-comparison/` in the main checkout: comparison scripts and reports, including `reports/v1.7-preseason.json` and `reports/v1.8-signingdays2.json`. Scripts take the repo path as their first argument and read saves from temporary copies.
- `test_runs/s2-v18-ltIVPa/` in this worktree: v1.8 Season 2 plan and saved copy.

`origin` moved from `toms-transfer-tools` to `signing-day`, and the desktop app refuses its sync tool until Tom re-pins it under Help, Troubleshooting, Review Pinned Git Origins. Local main is ahead of `origin`.
