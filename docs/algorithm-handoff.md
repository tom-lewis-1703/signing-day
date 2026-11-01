# Algorithm handoff

Updated November 1, 2026. Current implementation: **v1.8** on branch `claude/signing-day-work-ff8e49` (v1.7 on main). Read `AGENTS.md` for save-safety requirements.

## Current behavior

This is a standalone Signing Day CPU transfer market. An explicit user-school selection is required. That school's roster and commitments are protected; Kansas was selected for the recorded runs.

1. **Normalize the market.** Reopen all eligible CPU transfer commitments and combine those players with initially uncommitted transfers. Original CPU destinations and recruiting influences are audit data, not preference inputs. Incoming recruits and returning players form projected school rosters after known departures are excluded.
2. **Clear surplus freshmen.** CPU teamless incoming freshmen with observed OVR <=62 and known Normal development may be un-signed only when their room exceeds all modeled depth slots, removal loses zero current and future roster value, and a frozen future-coverage floor survives. Protect Impact/Star/Elite, unknown development and Keep selections. Run cleanup before veteran overage cuts and again whenever holds change a school; an earlier release stays out if returning him would overflow the roster or board. Each release frees a roster place and commitment-board entry.
3. **Resolve inherited overages.** Trim returning veterans toward 85 by lowest marginal roster-value loss while preserving coverage and locks. If a school cannot reach 85 under the protections, roll back its provisional veteran trims and exclude it; valid surplus cleanup remains.
4. **Score both sides separately.** Schools value current and discounted future roster improvement, less acquisition and displacement costs. Players value immediate opportunity, future opportunity, prestige, home-state affinity and their game motivation. Both sides must prefer the transaction to their alternative.
5. **Issue competing offers in rounds.** Schools can offer across multiple position groups, with capacity reserved and no overlapping rooms within a school's batch. A player holds his best offer and may trade up; each player-school pair is offered once, and holds become final when the market ends. A school cannot drop a player it holds. Later transactions must preserve the opportunity and willingness promised to current holders within defined tolerances.
6. **Stop when no permitted mutually acceptable transaction remains.** There is no forced placement or automatic roster filling.

## Model and restrictions

- Position groups and school schemes set starter, rotation, backup and developmental slots. Some left/right positions are pooled. The second HB has extra roster-value weight (0.50) and opportunity score 70.
- Forecasts cover two seasons. Returning players/transfers receive a modeled +2 first-season rating estimate; future growth depends on development. Forecasts never change saved ratings or class.
- School development philosophies and player culture/social preferences are seeded simulation inputs, not observed facts. Players retain 82–92% football-feature weight; the rare lifestyle trait was removed in v1.8. Actual NIL offers, production history and coach relationships are not modeled.
- The seed fixes traits across replans. Changing constraints can change allocations without redrawing personalities. An original CPU commitment gets no continuity preference; returning to the actual previous school carries a preference penalty.
- Roster maximum: **85**, plus the actual physical capacity of each commitment board. Veteran cuts do not free commitment-board entries.
- At most **six discretionary veteran replacements per school**, separate from initial overage cuts. A veteran rated 78+ can be released only for a player at his own position.
- A full-board school can additionally release up to **three normal-development 1–2★ recruits** as part of transfer offers. This allowance is separate from surplus-freshman cleanup.
- **Four-QB minimum.** Releases and cleanup cannot take a QB room below four, counting only players who are staying. A school under four pays a 25-point premium for a QB, and a QB takes that place even below his outside option (contract `depth floor`), since his alternative is deletion. He can still trade up while the market is open. There is no automatic backup transfer after a manual move. Elsewhere the veteran coverage floor is usually starters plus one.
- **Signing caps: WR 14, HB 8.** A room at its cap signs a player only by releasing someone from that room. The cap does not cut rooms already above it, so a few stay over from veterans and held recruits.
- Keep controls protect releases; exclude controls prohibit player-school pairings. Replanning uses the original opened snapshot and retained seed.

## Recorded results

v1.8, Kansas protected: seed `sd-v1.2-001` on the fixture places **1,228 of 1,882** (889 surplus freshmen, 379 veteran releases). The default seed on `DYNASTY-SIGNINGDAYS2` places **1,224 of 1,559**: all 254 rated 85+, 548 of 583 rated 80-84, with 1,023 surplus freshmen and 525 veteran releases. All 137 CPU teams have 4+ QBs (77 signed on depth-floor offers, 28 of them finishing below their outside option). Largest rooms are WR 16 and HB 9. Rosters leave 129 places for the game to fill, and four schools are under 75. Not yet checked in-game.

v1.7, Kansas protected: seed `sd-v1.2-001` on the fixture places **1,133 of 1,882** (one 85+ unplaced, 605 surplus freshmen, 522 veteran releases). The default seed on Tom's Season 2 `DYNASTY-SIGNINGDAYS2` places **1,115 of 1,559** (253 of 254 rated 85+, 709 surplus freshmen, 701 veteran releases). An earlier hold-offers build without surplus cleanup reached Preseason in-game with all 752 signers at their planned schools; the combined v1.7 plan then reached Preseason with all 1,115 signers at their planned schools (see "Next work").

Earlier results:

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

- **Offer timing is reduced, not removed.** Holding offers lets a player reach a better school later, but a school cannot drop a hold for someone better, and capacity still blocks many preferred schools. On the fixture, 259 of 1,133 signers finish over 10 utility points below a school that wanted them but had no capacity left.
- **Crowded rooms remain.** Cleanup only removes qualifying low-rated freshmen with zero marginal value. Higher-rated recruits, protected development and retained veterans can preserve large rooms. The real-run review recorded HB rooms of nine and WR rooms up to 17.
- **Roster quality is not established by mechanical checks.** Coverage, growth, opportunity and future value are approximations. Small schools can gain elite players when both valuations agree; there is no hard prestige gate. No policy guarantees equal talent distribution or full rosters.
- The separate experimental roster-clearing worktree is **not** the active implementation.

## Next work

Tom's team in these dynasty saves is Kansas (he confirmed it in-game on November 1, 2026). Season 2 stage saves are in his saves folder.

**v1.7 rollover result (November 1, 2026):** `DYNASTY-S2V17TEST` advanced in-game to Preseason (`DYNASTY-S2V17TEST-AUTOSAVE`). All 1,115 signers reached their planned schools, including Kade Phillips (USC). The game removed no returning players. Of 736 released recruits, 723 were deleted and 13 were placed by the game. Kansas kept its 57 returners and 24 signees. Every CPU school ended at 85: the plan left a shortfall of 112, and one committed recruit (Kyle Cruz WR54) was also deleted, so the game added 113 players (95 unplaced transfers, mean 74.9; 18 recruits, mean 60.1), mostly at the schools the plan left shortest. This comes from reading the saves; Tom has not reported a review of the result in-game beyond advancing it.

On that Preseason save, 76 of 137 CPU teams have under 4 QBs, and the largest rooms are WR 19 (TCU) and HB 9 (Wake Forest). CPU freshmen rated <=62 number 1,816, including 316 WRs and 160 HBs. Starting QBs average 80.4 at prestige 0-1, 82.1 at 2-3, 81.2 at 4-6 and 86.5 at 7-10.

Earlier comparison, before surplus cleanup was combined: the All In One mod (`DYNASTY-SIGNINGDAYS2-COPY`, then `DYNASTY-CUSTOMCONF-AUTOSAVE`) landed 942 transfers with 556 rated 80+, and removed 459 recruits. The hold-offers build (`DYNASTY-S2V16TESTPRESEASON`) landed 794 with 618 rated 80+, all 752 signers at their planned schools. The mod keeps CPU commitments, forces new ones with Commit Score 100 and influence 999, places some transfers straight on rosters, and revived nine finished seniors. All of those rostered transfers but four survived the rollover.

Tom's list, in his order:

1. Done: board-less hard commitments join the market.
2. Done in v1.8 (November 1, 2026): four-QB minimum, WR/HB signing caps. **Waiting on Tom's in-game check.**
3. Done in v1.8: rare lifestyle trait removed, as Tom decided. Ordinary social and culture preferences remain.
4. Low-tier teams look too close to top teams, including many premier QBs at 0-1 star schools. On the v1.7 Preseason, starting QBs averaged 80.4 at prestige 0-1, 82.1 at 2-3, 81.2 at 4-6 and 86.5 at 7-10. Tom expected this may need its own branch. Check `lib/team-ratings.mjs` and `docs/team-ratings-v2.md` first. Tom noted the mod's team overalls range 74 to 87, with many 0-1 star teams at 76-79.
5. Partly done in v1.8: the cleanup ceiling rose from 58 to 62, so kept recruits fell from 3,253 to about 2,950 of 3,999 on Season 2. Cleanup still requires a room over its depth slots and zero value loss. Item 8 is the remaining route for weak recruits.
6. Built: sophomore draft lock. Tom defined it as keeping sophomores from leaving for the NFL draft. See below. **Waiting on Tom's in-game check.**
7. GUI: a future item, set aside by Tom on November 1, 2026. The draft lock has only a plain dashboard button, because real saves are written through the GUI.
8. A tool to run after Fang's recruiting mod each preseason that removes weak recruits and trims the class before they take board spots. Needs a Fang-modded preseason save. Deleting records must follow the save traps in `AGENTS.md`.

**Sophomore draft lock.** The market cannot do this: early-draft rows are gone by Week 4, so it runs earlier. Open a Players Leaving or Week 1 save in the GUI and use the dashboard's Sophomore draft lock button. It sets every CPU sophomore's `EarlyNFL_*` rows to `LeaveStatus` Staying and `PersuadeAttempts` at least 1, the values the game writes for a persuasion, with backup and reopen verification. Kansas is left out, as are juniors and seniors. `DYNASTY-PLYRSLEAVING` has 33 such sophomores; without the lock 16 left for the draft, 11 stayed and six entered the portal (a sophomore also entering the portal stays in it). At Week 1 only the 16 real leavers still have rows. Fixtures hold no sophomore rows, so `node tools/draft-lock-test.mjs` defaults to `DYNASTY-PLYRSLEAVING` and writes only a copy. **No in-game result yet**, including whether the game honors the edit from Players Leaving; Week 1 is the fallback if it does not.

Recommended order: Tom's in-game checks of v1.8 and the draft lock, then 8, then 4.

Repo note: `origin` moved from `toms-transfer-tools` to `signing-day`, and the desktop app refuses its sync tool until Tom re-pins it under Help, Troubleshooting, Review Pinned Git Origins. Local main is ahead of `origin`; nothing has been pushed.

Evidence: `test_runs/s2-comparison/` in the main checkout (Git-ignored) holds the comparison scripts and reports. The scripts take the repo path as their first argument and read saves from temporary copies.

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

Verification commands: `node tools/market-model-test.mjs`, `node tools/recruit-cleanup-test.mjs`, `node tools/market-safety-test.mjs`, `node tools/draft-lock-test.mjs`, and `node tools/market-check.mjs --save`. The last command writes only a fresh disposable copy. Do not rerun tools against a real save as a resumption step.

Local evidence (Git-ignored; may not exist in another checkout):

- `test_runs/market-v1.2-hWymkF/`: v1.6 fixture plan, comparison, saved-copy proof and final checks. The directory's v1.2 prefix is historical; read the report's model field.
- `test_runs/market-verify-FLe9RV/report.json`: independent fixture verification.
- `test_runs/market-safety-2inRHs/result.json`: safety checks.
- `test_runs/live-signingday-7EmjiN/review.json` and `saved.json`: real-run output and verification.

Real saves require the GUI's explicit Save, a verified backup and reopen verification. Never write to `test_saves/`. Changes to established writing formulas need fresh-copy proof and Tom's in-game retest.
