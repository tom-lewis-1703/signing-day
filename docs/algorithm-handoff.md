# Algorithm handoff

Updated November 1, 2026. Read `AGENTS.md` for save-safety rules.

## Status

- **Code:** market **v1.9** is on branch `code/signing-day-school-strategy-10d0b1`, built on v1.8 and the sophomore draft lock from `claude/signing-day-work-ff8e49`. Main is still v1.7, and nothing has been pushed.
- **Team:** Tom's team in these dynasty saves is Kansas. Still pass it explicitly. Season 2 stage saves are in Tom's saves folder.
- **Proven in-game:** v1.7 reached Preseason with all 1,115 signers at their planned schools.
- **Not yet checked in-game:** v1.8, v1.9 and the draft lock. All are waiting on Tom:
  1. **Market (v1.9):** run the transfer tool on a copy of `DYNASTY-SIGNINGDAYS2`, save, advance to Preseason, then compare with `test_runs/s2-comparison/scripts/preseason-compare-v17.mjs` (change its save names).
  2. **Draft lock:** use the dashboard button on a copy of `DYNASTY-PLYRSLEAVING` and advance to Week 4. Malachi Toney (Miami), Dakorien Moore (Texas Tech) and Nate Sheppard (LSU) should still be on their teams. If they leave, try a copy of `DYNASTY-WEEK1`.

**Working with Tom:** this is a personal tool, so keep testing light (see "Testing"). The GUI is a future item: don't change or check it unless Tom asks.

## The school model (v1.9)

Measured on the Season 2 v1.8 plan, stars landed at small schools because better programs passed, not because players preferred small schools. A school valued a transfer only by the gain over its current room, so the worst rooms bid hardest: an 85+ was worth 23 at prestige 0-1 and 12.6 at 7-10. Of 254 80+ signers at prestige 0-3, 236 never got an offer from a school 3+ prestige higher. Doubling the player's prestige weight changed almost nothing.

v1.9 changes the school side only:

- **Talent premium:** a school's net gains `2 x prestige/10 x max(0, OVR - 75)`: +20 for an 85 at prestige 10, +2 at prestige 1. There is no gate, so low schools are outbid, not barred. Strengths from 1.5 to 3 gave nearly the same talent numbers.
- **Release room:** veteran replacements rise from 6 to 12 at prestige 10, and recruit releases from 3 to 8.
- **QB minimum 3:** Tom's call. At four, schools needed 77 of 122 pool QBs, so 33 rated 80+ signed as depth.
- **QB reserve:** the lowest-rated QBs, as many as the league is short of the minimum (19 here), sign only with a school under it. It left no team short here, but premium 3 with a four-QB minimum left two short, so check the count on each plan.
- **Cap fix:** a restored release can no longer take a room past a signing cap.

The rising cost sets how many sign, not who gets the talent: with it removed, 226 more placed and separation held. The old warning that removing it would hurt item 4 does not hold, but it stays because the goal isn't more placements. Even with zero cost, 0-1 schools keep about 60-79 open spots, so roster-size valuation would not fill them.

**Three against four QBs:** Tom chose three after seeing both built. Four gave starting QBs of 78.6 / 79.9 / 81.6 / 86.6, with 77 floor signings and 8 unplaced QBs (three: 27), and nearly the same starter averages. How the game treats three-QB rooms is unchecked.

**Ceiling:** a strict pecking order for the best transfers reaches about 73.8 / 76.0 / 78.8 / 83.8 starters. v1.9 is at that level for the top tier, so a larger gap needs changes beyond transfers.

**Decided by Tom:** no fill step. The game fills open spots at rollover, and did so at v1.7: it added 95 unplaced transfers (mean 74.9) and 18 recruits (mean 60.1), spread almost evenly across positions. Those numbers predate v1.9, so re-measure item 4 at Preseason.

## Tom's list

1. Done: board-less hard commitments join the market.
2. Built, in-game check pending: QB minimum (three since v1.9), WR and HB signing caps.
3. Done in v1.8: rare lifestyle trait removed, as Tom decided. Ordinary social and culture preferences remain.
4. Addressed in v1.9, in-game check pending: low-tier teams looked too close to top teams, including many premier QBs at 0-1 star schools. On the v1.7 Preseason, starting QBs averaged 80.4 at prestige 0-1, 82.1 at 2-3, 81.2 at 4-6 and 86.5 at 7-10. Re-measure at Preseason. Displayed team overalls are separate. Check `lib/team-ratings.mjs` and `docs/team-ratings-v2.md` first. The mod's team overalls range 74 to 87, with many 0-1 star teams at 76-79.
5. Partly done in v1.8: the cleanup ceiling rose from 58 to 62, so kept CPU recruits fell from 3,253 to about 2,950 on Season 2. Item 8 is the remaining route.
6. Built, in-game check pending: sophomore draft lock (see below).
7. GUI: a future item, set aside by Tom.
8. Open: a tool to run after Fang's recruiting mod each preseason that removes weak recruits and trims the class before they take board spots. Needs a Fang-modded preseason save. Deleting records must follow the save traps in `AGENTS.md`.

Order: Tom's in-game checks, then item 4's Preseason measurement, then 8.

## How the market works

A standalone Signing Day CPU transfer market. An explicit user school is required, and that school's roster and commitments are protected.

1. **Normalize.** Reopen all eligible CPU transfer commitments and pool them with uncommitted transfers. Original destinations and influences are audit data, not preferences. Incoming recruits and returning players form each school's projected roster.
2. **Clear surplus freshmen.** Un-sign CPU incoming freshmen rated <=62 with Normal development only when the room exceeds its modeled depth slots, removal loses no current or future roster value, and a future-coverage floor survives. Protect Impact/Star/Elite, unknown development and Keep selections. This reruns whenever holds change a school. Each release frees a roster place and a board entry.
3. **Resolve overages.** Trim veterans toward 85 by lowest value loss, preserving coverage and locks. A school that cannot reach 85 is excluded.
4. **Score both sides.** Schools value roster improvement less costs, plus a prestige-scaled talent premium. Players value immediate and future opportunity, prestige, home state and their game motivation. Both sides must prefer the deal, except on QB depth-floor offers.
5. **Offer in rounds.** Schools offer across position rooms, one offer per room per round. A player holds the best offer and may trade up, and each pair is offered once. A school cannot drop a hold. Later moves must keep the opportunity promised to current holders, within a tolerance.
6. **Stop** when no permitted deal remains, and holds become final. Only QB depth-floor offers override a player's preference; nothing fills rosters.

## Rules and limits

- **Roster and boards:** 85 maximum, plus each commitment board's real capacity. Veteran cuts do not free board entries.
- **Three-QB minimum:** releases and cleanup cannot take a QB room below three, counting only players who are staying. A school under three pays a 25-point premium for a QB, who takes the place even below his outside option (contract `depth floor`), since the alternative is deletion. He can still trade up while the market is open. The lowest-rated QBs are reserved for short schools.
- **Signing caps, WR 14 and HB 8:** a room at its cap signs only by releasing someone from that room, and a restored release cannot pass the cap. Rooms already above a cap are not cut.
- **Veteran releases:** six discretionary replacements per school, up to 12 at prestige 10, separate from overage cuts. A veteran rated 78+ can be released only for a player at his own position. Outside QB, the coverage floor is usually starters plus one.
- **Recruit releases:** a full-board school can also release three Normal-development 1-2★ recruits for transfer offers, up to eight at prestige 10, separate from cleanup.
- **Forecasts:** two seasons. Returning players and transfers get a modeled +2 first-season estimate, and later growth depends on development. Forecasts never change saved ratings or class.
- **Simulated inputs:** school development philosophies and player culture and social preferences are seeded, not observed. Football features keep 82-92% of a player's weight. NIL, production history and coach relationships are not modeled.
- **Seeds and locks:** the seed fixes traits across replans. Keep controls protect releases, and exclude controls prohibit player-school pairings. An original CPU commitment gets no continuity preference, and returning to the previous school carries a penalty.

## Sophomore draft lock

Early-draft rows are gone by Week 4, so this runs separately from the market. On a Players Leaving or Week 1 save, the dashboard's button sets each CPU sophomore's `EarlyNFL_*` rows to `LeaveStatus` Staying and `PersuadeAttempts` at least 1, the values the game writes for a persuasion, with backup and reopen verification.

Kansas, juniors and seniors are left out, and portal decisions are not changed. `DYNASTY-PLYRSLEAVING` has 33 such sophomores: without the lock 16 left for the draft, 11 stayed and six entered the portal. At Week 1 only those 16 still have rows. It is unknown whether the game honors the edit from Players Leaving.

## Results

Season 2 `DYNASTY-SIGNINGDAYS2`, Kansas protected, default seed:

| Plan | v1.7 | v1.8 | v1.9 |
|---|---:|---:|---:|
| Transfers placed, of 1,559 | 1,115 | 1,224 | 1,354 |
| Rated 85+ | 253/254 | 254/254 | 254/254 |
| Rated 80-84 | 530/583 | 548/583 | 581/583 |
| Rated 75-79 | | 396/593 | 483/593 |
| Surplus freshmen released | 709 | 1,023 | 1,074 |
| All recruits released | | 1,038 | 1,092 |
| Veteran releases | 701 | 525 | 640 |
| Teams under the QB minimum | 80 under 4 | 0 under 4 | 0 under 3 |
| Largest WR / HB room | 19 / 9 | 16 / 9 | 16 / 9 |
| Open roster spots | 112 | 129 | 168 |

By prestige 0-1 / 2-3 / 4-6 / 7-10, signing-stage ratings, before the game fills rosters:

| | v1.8 | v1.9 |
|---|---:|---:|
| Starter OVR | 76.2 / 77.0 / 79.4 / 83.2 | 75.3 / 76.6 / 79.5 / 83.6 |
| Starting QB | 79.5 / 81.4 / 81.8 / 86.2 | 77.3 / 80.3 / 83.5 / 86.5 |
| Best HB | 83.0 / 84.1 / 85.3 / 87.6 | 81.4 / 83.3 / 85.6 / 88.8 |
| Top-3 WR | 79.6 / 81.1 / 81.9 / 85.8 | 77.3 / 80.4 / 82.5 / 86.2 |
| QB room size | 4.1 / 4.2 / 4.6 / 4.4 | 3.3 / 3.5 / 4.1 / 3.7 |

In v1.9, 19 QBs signed on depth-floor offers (6 rated 80+), and 27 QBs go unplaced (v1.8: 10). Ten 85+ transfers sign at prestige 0-3 (v1.8: 33), none of them QBs. Six signers finish below their outside option (v1.8: 28). Six schools are under 75 before the game fills them. Three WR rooms and one HB room stay over a cap because of players already there. Five veterans rated 78+ are released for a player at their own position, the highest Jalen Thomeson FS82 at TCU. Fixture with seed `sd-v1.2-001` places 1,350 of 1,882 (v1.8: 1,228).

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

- **Offer timing:** holds let a player reach a better school later, but a school cannot drop a hold, and capacity blocks many preferred schools. On the Season 2 v1.8 plan, 142 of 1,224 signers finished over 10 utility points below a school that wanted them but had no capacity left.
- **Crowded rooms:** caps only limit signings, and cleanup only removes low-rated freshmen with zero value. About 1,100 Normal-development recruits rated <=62 stay.
- **Roster quality:** coverage, growth and opportunity are approximations, and passing checks does not show rosters are realistic. There is no hard prestige gate, and the premium does not guarantee talent spread or full rosters. Prestige 0-1 and 2-3 stay close (1.3 apart), and HBs stay strong everywhere because the pool holds 136 of 180 rated 80+.
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

Only if Tom asks or a result looks wrong: `tools/market-verify.mjs`, `tools/market-safety-test.mjs`, `tools/draft-lock-test.mjs` (defaults to a copy of `DYNASTY-PLYRSLEAVING`, as the fixtures hold no sophomore rows), extra seeds and new test tools. The verifier checks that the code matches its rules, not that results are realistic. It has not been updated for v1.9: it still expects flat release limits and has no talent premium or QB reserve.

Real saves are written only through the GUI's explicit Save, with a verified backup and reopen verification. Never write to `test_saves/`. Changes to established write formulas need fresh-copy proof and Tom's in-game retest.

## Evidence and repo notes

Git-ignored, so these may not exist in another checkout:

- `test_runs/s2-comparison/` in the main checkout: comparison scripts and reports, including `reports/v1.7-preseason.json` and `reports/v1.8-signingdays2.json`. Scripts take the repo path as their first argument and read saves from temporary copies.
- `test_runs/s2-v18-ltIVPa/` in this worktree: v1.8 Season 2 plan and saved copy.
- `test_runs/s2-v19-uxpyOe/` in this worktree: v1.9 Season 2 plan and saved copy. `test_runs/s2-v19-F34c3m/` is the same build with a four-QB minimum.

`origin` moved from `toms-transfer-tools` to `signing-day`, and the desktop app refuses its sync tool until Tom re-pins it under Help, Troubleshooting, Review Pinned Git Origins. Local main is ahead of `origin`.
