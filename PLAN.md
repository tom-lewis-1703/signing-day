# Tom's Transfer Tools — Plan

Oct 20, 2026 · @Thomas Lewis

## Current status and next step (updated Oct 20, 2026, end of the fifth build session)

**How to pick up in a new chat (local or cloud):** read this section, then `CLAUDE.md` (its "Check in before doing more" and "Screens" rules are Tom's and are mandatory), then the rule walkthrough page. New cloud chats open on `main`; work on a branch and, at the end of every session, merge it into `main` and push both so the next chat sees the work. Tom points at rules by code (e.g. "T3", "P2").

- **Where we are:** step 5 (Signing Day roster build) pieces 1–3 are built. Piece 3 (placing every uncommitted transfer + cuts, preview only, on a *live* projection) went through two rounds of Tom's tuning this session and is waiting for his in-game sense check during the full offseason run. The weekly-commit design (Weeks 1–4) is **decided** (see "Weekly commits (decided Oct 20, 2026)" under Phase 2b). Nothing writes Top 10s or commits yet; the only edit the app writes is Draft Lock.
- **Very next thing (Tom, end of the fifth session):** mix the game's recruiting data into player and school interest: scholarship offers (who offered whom, offer count), each school's influence with the player and its weekly gain, the player's CommitScore, star rating and rankings (save facts in CLAUDE.md). **Discuss first**: measure on the test copies how offers/influence line up with our Top 10s, then bring Tom 2–4 options with numbers and wait for his pick. Measuring tip: the board link that worked was `Team.RecruitingBoard` → board row → `Recruits` array (`Object.keys(array.fields)`) → RecruitTarget rows (Week 4: 559 transfers on boards). A later scratch script that went through the `team.record` objects from `Dynasty.load` found 0 boards (unresolved bug, probably the field wasn't loaded on those records), so read `RecruitingBoard` explicitly and check the counts before trusting any numbers.
- **After that:** the weekly-commit write test (approach approved, build not yet; restate and get his OK first): copy the Week 1 save to `test_runs\`, commit 6 transfers two ways (3 with the direct commit edit proven at Signing Day; 3 by raising an offering school's `ProspectInfluenceTotal` to the player's `CommitScore` so the game commits him itself), verify every changed record, Tom advances one week in-game and reports. Keep the method that sticks.
- **Then (Tom's order):** build the weekly run (commits each week + live Top 10 refresh) and its screen (where top transfers committed, week by week) → step 5 piece 4 (write Signing Day to a copy) → a **full offseason run** on copies, Players Leaving → Preseason, Tom checking in-game.
- **Done and signed off:** step 1 (app skeleton), step 2 (draft lock), step 3 (depth chart), step 4 (ceiling + team side), step 4b (player side + Top 10 preview).
- **Kept as written for now (Tom, Oct 20):** Pass B processes uncommitted transfers by **max overall first** (the draft line).
- **Tom's ideas to come back to (not designed yet):** player **tags** that change how teams recruit him (e.g. "Project Player", "Win Now"); review where max overall is used (T5, keep value, protection, recruit keep rule, Pass B order). NIL: Tom said "forget it" (Oct 20); not modeled.
- **Open observation (not decided):** "best fit" leftovers go by player score, so prestige can beat playing time for younger players (Christian Clark HB 80 So → Texas, buried #3). Tom may want leftovers to go where they'd play; ask if he raises it.
- **Branches:** `main` = everything to date (merged at the end of the fifth session). This session's branch was `claude/kind-boyd-1cfea9` (worktree). `claude/confident-mendel-53hrhb` holds the rejected UI overhaul (never merge). `review-base` / `full-review` only for whole-app code reviews (never merged). Cloud sessions can push; on Tom's PC give him the commands.
- **Rule walkthrough page:** https://claude.ai/artifact/4kbXJoCjikjx8PL56jqb98 (source `docs/ttt-internals.html`, version 10, updated Oct 20 end of the fifth session). Codes: R1, S1, V1, L1, D1–D5, C1–C2, T1–T12 (T11 lookalikes, T12 newcomer limits), P1–P4 (P2 reweighted), K1–K4, SD1–SD6 (Signing Day). Weekly commits get codes when built. Keep codes stable; a new rule gets a new code.
- **Test copies:** cloud: copy from `test_saves/` into the scratchpad; Tom's PC: `saves\TomsTransferTools\test_runs\`. The game names its own save after advancing `<name>-AUTOSAVE`.

## Goals and scope

Tom's Transfer Tools is a lean, personal CFB 27 dynasty utility. It fixes two problems: underclassmen leaving early for the NFL draft, and transfers piling onto already-stacked top programs while mid-tier teams lose players and get nothing back.

It started from the TrapsTransferTool code, but by step 3 every part of that tool had been replaced with our own lean code on the madden-franchise library (Tom: the old tool was badly put together; use only what's needed, aim for peak performance and usability). The original tool stays untouched in Downloads as a fallback.

Build order:

1. **Draft lock**: only players who are out of eligibility can leave for the draft.
2. **Need-based destinations**: each transfer's Top 10 reflects realistic role, need and fit, refreshed each week through Week 4.
3. **Signing Day commitments**: the tool commits the players who are still uncommitted and recommends fixes for bad game-made commitments.
4. **Later: outflow control**: who enters the portal and how many per team. Deferred until 1–3 work.

## Decisions from the interview

| Topic | Decision |
| --- | --- |
| Draft eligibility | Only players out of eligibility (seniors not currently redshirting) may declare |
| Who leaves via portal | Out of scope for now; revisit once destinations work |
| Your team | Kansas is exempt from draft lock and transfer logic; Kansas still appears in AI Top 10s where it fits |
| Commitments | Tool sets Top 10s in Week 1; the game plays Weeks 1–4; tool commits the rest at Signing Day |
| Bad game-made commits | Tool shows the best-fit options for the player and the teams; you pick |
| Nobody needs him | Goes to the best available fit with room, even a step down |
| Playing-time weight by year | Fr 20%, So 35%, Jr 50%, final year 70% |
| Path to start | Counts mostly for freshmen and sophomores; nothing for final-year players |
| Top 10 membership | Both sides must fit: player wants the school AND the school would want him |
| Need boost | Strong: losing a starter roughly doubles a team's pull at that position |
| Starters per position | Per-team scheme when available; standard set otherwise |
| Randomness | Low |
| Home distance | Big factor for Proximity dealbreaker; light pull for everyone else |
| App style | Lean and fast; usability over looks; named Tom's Transfer Tools |
| Dynasties | One main dynasty |

## How we'll work

One step at a time, with a check-in before and after every step. No step starts until the previous one is built, tested, added to the app and signed off by you.

For each step, Claude Code:

- **Before:** restates the goal and approach in plain terms and waits for your OK.
- **During:** asks you about any tuning choice or ambiguity rather than guessing.
- **After:** shows real results from the test saves (specific players and teams), and you confirm them in-game.
- **Then:** updates this plan, and only then moves on.

Build order:

1. App skeleton: open a save, detect the stage, automatic backup, save — **Done Oct 20, 2026** (see "Step 1 results" below)
2. Draft lock: build, test, add to the app — **Done Oct 20, 2026** (see "Step 2 results" below)
3. Depth-chart projection as a read-only report, so we can check that roles look right (e.g., Ohio State's QB room) — **Done Oct 20, 2026** (see "Step 3 results" below; Tom moved on after reviewing it)
4. Ceiling and need scoring as a read-only report, reviewed together — **Done Oct 20, 2026**
4b. **Player side + combined Top 10 preview** (moved up Oct 20, 2026; read-only) — **Done Oct 20, 2026** (see "Step 4b results", "Ceiling = max overall" and "Step 4 results")
5. **Signing Day roster build** (moved up Oct 20, 2026): un-sign bad generated recruits, enforce position caps, review game commits, Commit Remaining with need logic, guarantee ≤ 85 so the game's rollover cut removes nobody. See "Phase 3: Signing Day". — **In progress** (piece 1 done, piece 2 built; see "Step 5 results")
6. Week 1 Top 10 generator
7. Weekly commit review and Top 10 refresh
8. Later: outflow control

Why the order changed: the season-1 → season-2 drops you see (Missouri, Vanderbilt, BYU, Oklahoma State, Iowa State…) almost all happen at the Signing Day → preseason rollover, so fixing Signing Day first removes the biggest damage. See "Why teams collapse between seasons" below.

### Step 1 results (signed off Oct 20, 2026)

- **App folder:** `C:\Users\tomle\Documents\TomsTransferTools`. Start it with `Start Tom's Transfer Tools.bat`. The schema file, madden-franchise 4.3.1 and the Electron 37.2.6 runtime were copied from the old tool (its `portal-core.mjs` was copied too, then removed in step 3); the original folder was not changed.
- **Stage detection** reads `SeasonInfo.CurrentOffseasonStage`: 2 = Players Leaving, 3 = Week 1, 4 = Week 2, 5 = Week 3 (inferred, not yet seen on a real save), 6 = Week 4, 7 = Signing Day. Any other value disables all actions.
- **Saving:** backup to a `TTT Backups` folder next to the save, write a temp file, reopen it to check the stage and player count, then replace the original. Backups are never auto-deleted.
- **Nothing changes on open.** The old tool's automatic open-time edits (Army/Navy/Air Force portal policy, early transfer-commit cleanup) are turned off and only reported.
- **Settings:** `settings.json` holds your team (Kansas = team 37). Tuning values get added at the step that uses them.
- **Tested:** all five test saves detected correctly; no-change saves had 0 differences in the player, team, recruit, Top 10 and leaving tables; the Players Leaving copy saved by the tool loaded and advanced normally in-game.
- **Test tools:** `tools\step1-test.mjs` (open/save/compare on fresh copies) and `tools\ui-smoke.cjs` (drives the real window). Test runs go in `saves\TomsTransferTools\test_runs\`.

### Step 2 results (signed off Oct 20, 2026)

- **What it does:** on the Players Leaving save, Preview → Apply → Save. Every early-draft record of a player with eligibility left is set to Staying with the persuasion marked used (the same values the game writes when you persuade a player). Kansas is skipped. Portal decisions are left alone. Each save writes a `.draft-lock.json` record next to the backup.
- **On the test save:** 224 early-draft players (exactly 7 rounds × 32). 141 locked at 57 teams (86 Jr, 55 So; most: Texas 11, Notre Dame 9, LSU 7). 82 graduating players left as normal. Kansas: Dylan Edwards untouched. 42 locked players were also entering the portal and did.
- **Proof:** the saved file differed from its backup only in those 141 draft records, and only in LeaveStatus and PersuadeAttempts.
- **In-game check (advanced to Week 2):** all 99 locked players not headed to the portal stayed on their teams; the 42 portal entrants are in the portal from their original teams; none drafted; all 82 graduates gone.
- **App readout:** every save shows "Underclassmen set to leave"; it should be 0 after Players Leaving.
- **Test tools:** `tools\step2-test.mjs` (lock + diff on a fresh copy) and `tools\step2-check.mjs` (checks a later save against a lock record).

### Facts learned from the saves (Oct 20, 2026)

- **Timing:** portal entrants leave their rosters by Week 1; graduates and draft picks leave on the Week 1 → Week 2 advance. The game gives each locked player a second draft record by Week 1 (also Staying).
- **Rollover trims rosters to 85.** Signing Day → Preseason deleted 610 rostered players (mostly freshmen, median 71 OVR, highest 86, nobody 87+); 134 of 138 teams ended at exactly 85 (Navy 93 and Army 90 stayed over). At Signing Day, 89 teams were projected over 85, so over-85 is normal before rollover.
- **Uncommitted transfers at Signing Day mostly vanish:** of 1,310, 1,015 were deleted at rollover, 72 had no team, 222 were placed by the game. All 581 committed transfers arrived. This is why Commit Remaining (step 7) matters.
- **Old tool bug:** its count of signed high-school recruits reads the wrong target-school table (HS recruits use a separate ProspectTargetSchool table), giving nonsense like Air Force 1,675. Real counts are 11–35 per team (Kansas 15). Its 85-man roster checks are therefore unreliable; we compute our own.

### Step 3 results (built Oct 20, 2026)

- **Old tool removed from the app.** New lean data layer (`lib/dynasty.mjs`) reads madden-franchise directly: about 0.55 s to open a save (was 1.2 s), and projecting all 138 teams takes about 30 ms. Every count matches the verified step 1–2 numbers on all six saves, and the draft lock's saved file holds exactly the same game data as the step 2 file checked in-game.
- **Depth Chart tab:** pick a team to see each position room for next season with role (Starter, Rotation, Backup, Buried), OVR, next-season year, tags (Transfer from X, HS/JUCO recruit, Draft-locked, Path to start), plus starters lost (with reason) and who replaced them. A lookup shows any uncommitted transfer's role at that team.
- **League Needs tab:** every team sorted by open starter slots; click to open its depth chart.
- **Starters and role cutoffs** are in `settings.json` (scheme table and rotation counts as agreed). Rooms: EDGE = LE+RE, DT, LB = LOLB+MLB+ROLB, S = FS+SS; players only count at their listed position.
- **Examples (Week 1):** Ohio State QB: Sayin starts, St. Clair Backup with path to start; Keisean Henderson would be Backup #2 at Ohio State (path to start the year after), Starter at Kansas or Delaware. Delaware lost 22 starters; Army/Navy/Air Force 0 (no seniors, can't lose transfers).
- **Known limits:** strict position rooms (a 3-4 team's extra DTs show Buried); next-season rosters can exceed 85 before the game's trim; ranking uses current OVR only (ceiling comes in step 4).
- **Test tool:** `tools\step3-report.mjs` (rooms, role lookups, league summary from any save).

### Why teams collapse between seasons (measured Oct 20, 2026, Signing Day → Preseason saves)

Your list (Missouri, Maryland, North Carolina, BYU, Cincinnati, Charlotte, Fresno State, Houston, Iowa State, James Madison, Kansas State, Michigan State, Mississippi State, Nebraska, Northwestern, Oklahoma State, San Jose State, Temple, Tulsa, UCF, Vanderbilt) matches the saves: 19 of 21 are among the 32 biggest team-OVR drops (−6 to −12; Baylor is worst at −17; league median −3). Team ratings only change at the rollover. Four causes:

1. **The game deletes most of the portal at rollover.** 1,310 transfers were uncommitted at Signing Day; 1,042 were deleted, including 314 rated 80+ (e.g., Missouri QB Austin Simmons 86).
2. **These teams lose their best players and get nothing back.** Each lost the maximum 15 to the portal with 6–9 rated 80+ (typical team: 3), and got 0–5 transfers back (mostly 0–1).
3. **The game's cut to 85 protects recruits and cuts real players.** It never cut an incoming recruit; it cut veterans instead (Nebraska 11 rated 70+, Mississippi State 7, North Carolina 7, Missouri 6 rated 71–76 while keeping 58–59 WR recruits).
4. **Filler recruiting classes.** These teams signed 29–35 HS/JUCO recruits each; 1,686 of 3,928 signed recruits (43%) are under 60 OVR, only 24 of them Star/Elite. Position glut: 33 teams have 7+ HB (max 9), 31 teams have 12+ WR (max 17).

Useful: all 172 recruits who were unsigned at Signing Day were removed cleanly by the game at rollover, so un-signing a bad recruit at Signing Day should remove him (to be confirmed with a test on a copy). Every team on the list hit the in-game Max Transfers Per Team cap of 15; lowering that setting would reduce outflow until Phase 4.

### Ceiling = max overall, Maxi's method (built Oct 20, 2026, part of step 4)

- Follows Maxi's Dynasty Progression Monitor & Planner exactly, reimplemented in our code (`lib/ratings-model.mjs`). Its data (per-archetype overall weights, skill groups, level thresholds) was extracted once into `lib/data/ratings-model.json` by `tools/extract-ratings-model.mjs`; the app never needs Maxi's tool.
- Overall = archetype intercept + weighted ratings; archetype is the save's `PlayerType`. Reproduces 98.2–98.4% of stored overalls exactly (rest off by 1 from rounding).
- Max overall = every skill group (caps = `SkillGroupCap1–6`, in each archetype's group order) taken to its cap. Matches Maxi's tooltip: Kameryn Crawford 86 → 89. Others: Keisean Henderson 88 → 97, Matt Zollers 74 → 98, Julian Sayin 95 → 97.
- Max is a theoretical ceiling (assumes every upgrade is bought): 98% of sub-60 recruits have max 70+. The Signing Day recruit rule therefore cuts all Normal/Impact recruits under 60 regardless of max; the max check only decides the 24 Star/Elite ones.
- Performance: a league of ceilings in ~0.1 s; computed lazily per player and cached. Shown as **Max** in the Depth Chart and the portal-player lookup.

### Step 4 results: team-side need and fit (signed off Oct 20, 2026)

- **Tom's choices:** stacked room ×0.25; level bar 3 OVR; elite players at low-level programs are not discounted on the team side (the player side handles that in step 6); shown in the app and the CLI; need measured by drop-off; upgrade size as tie-breaker.
- **Need per room:** **Stacked** (no starter lost, none replaced by a newcomer, best backup within 3 OVR of the weakest starter) ×0.25. Otherwise drop-off = this season's starters vs next season's, slot by slot, averaged: ×1 at no drop, rising to ×2 at a 10+ OVR drop. First version (Open ×2 / Normal ×1) was too coarse: 1,144 of about 1,900 starter rooms were "Open" at Signing Day, so most teams tied at 200.
- **Fit = role score × need.** Role there: Starter 100, Rotation 60, Backup 30, Buried 0; path-to-start bonus +30 Fr/So, +15 Jr (next-season year). A non-starter scores 0 when his max can't reach their weakest starter − 3. Ties are ordered by upgrade (his OVR − the starter he'd replace). All values in `settings.json` → `fit`.
- **Examples:** Henderson (Week 1): 200 at Marshall, Rice, Georgia (lost Stockton 92, Puglisi 79 next); Ohio State 60 (Backup + path), Alabama 30, Kansas 25 (stacked). Austin Simmons (Signing Day): 200 at Rice, Marshall, Missouri; Kansas 100; Ohio State 30. Rico Bond (WR 76): C. Michigan, FAU, San Diego St.; Ohio State 0 (ceiling too low).
- **League:** every uncommitted transfer has at least one interested team (only 4 FBs have ≤ 5; few teams start a FB). Before any balancing, best fits concentrate (C. Michigan is best fit for 299 players at Signing Day), so step 6's #1-pick spread is needed. The game does place transfers back at their old team (8) and at service academies (9) at Signing Day, so both are kept and labeled.
- **Checks:** the fast role calculation matches the depth chart's roleAtTeam for all 260,958 player-team pairs (Week 1); whole league scored in about 0.1 s.
- **Where:** `lib/fit.mjs`; Depth Chart tab → pick a portal player → "Who would want him" table (click a team to open its depth chart); `tools/step4-report.mjs <save> --who="Name" --at=Team,Team --league --verify`.

### Player-side data in the save (checked Oct 20, 2026)

- **Player:** `RecruitingDealbreaker` (Week 1 transfers: ChampionshipContender 439, PlayingStyle 418, ProPotential 398, BrandExposure 354, PlayingTime 139, ConferencePrestige 137, CoachPrestige 5, ProximityToHome 1), `PLYR_HOME_STATE`, `HomePipeline`, `IdealRecruitingPitch`. `Motivation1–3` are empty for every transfer.
- **Team:** `TeamPrestige` 0–10 (teams per level: 0:5, 1:15, 2:15, 3:22, 4:14, 5:19, 6:16, 7:11, 8:12, 9:5, 10:4), `PrestigeRank`, program grades (brand exposure, conference prestige, traditions, stadium), `City`.
- **Read note:** madden-franchise won't add fields to a table already read with a smaller field list; the Dynasty load must request every field it needs up front.
- **The game's own Signing Day commits by prestige:** 90+ OVR (8) all went to prestige 6+ and never lower than their old school; 85–89 (67) never below prestige 4; 80–84 and below went anywhere (31 of 103 to prestige ≤ 3).
- **Caleb Hawkins** (Week 1): HB 93, max 96, sophomore next year, from Oklahoma State (prestige 6), dealbreaker PlayingStyle, home Oklahoma. Team side ranks MTSU and Sam Houston (prestige 2) at the top.

### Step 4b results: player side and Top 10 preview (signed off Oct 20, 2026)

- **Tom's choices:** player side before Signing Day. Prestige floor by rating, less strict than the game: 90+ prefer prestige 6+, fall back to 4+; 85–89 prefer 4+, fall back to 2+; under 85 none; his old school always allowed; the fallback only applies when no team at the preferred level has a team score of 100+. Starting weights approved; combined = 50/50.
- **Dealbreakers use the game's school grades** (Tom: "make it based off school grades"). Each team's `MySchoolTrackingTable` row has letter grades for Championship Contender, Brand Exposure, Coach Prestige, Coach Stability, Conference Prestige, Program Tradition, Stadium Atmosphere, Academic Prestige, Campus Lifestyle and Athletic Facilities, Pro Potential by position group, and a Playing Style grade per archetype (`PlayerTypeGradeTable`). These replaced the hand-made scheme table and the stand-ins (projected strength, ProgramPoints grades). Playing Time = his projected role; Proximity = home state.
- **Dealbreaker is pass/fail, as in the base game:** the school's grade must reach B− for 85+ OVR, C for 78–84, D+ under 78. Playing Time needs Starter or Rotation; Proximity needs his home state.
- **User team (Kansas):** skips the team side and the prestige floor; it is in a list whenever it meets the player's dealbreaker, ranked by his player score.
- **T7–T9 (added Oct 20, 2026, Tom chose ideas 1, 2 and 4):** T7 upgrade: he would start and beat the weakest starter by 3+ OVR → ×1 rising to ×1.5 at +10 (applies to every room, overrides Stacked). T8 succession: every starter is a senior next season → Fr/So with a path to start (or starting) get ×2 (overrides Stacked). T9 position importance QB ×1.25, OT ×1.1, EDGE ×1.1, used only when comparing players across positions (Signing Day, #1-pick balancing); Top 10 order uses the unweighted team score. Week 1: Stacked pairs 20,147 → 13,066; Jide Abasiri (DT 88) at Duke/Louisville/Minnesota now 150 (was 25); Utah #1 picks 230 → 201. Side effect: Kansas fell out of Caleb Hawkins's Top 10 as more AI teams want him (Kansas is ranked by player score only). Prestige-based ambition (idea 3) not built.
- **T10 starter level (Oct 20, 2026, Tom):** a projected starter only counts as one when his OVR is within 5 of the usual starter at his position for schools of his prestige (average of this season's starters at that prestige); below that he's a stopgap, treated as a Backup on both sides (path to start if not final year), no T7 upgrade, and T5 compares his max to that usual level. Fixes weak players "starting" at top programs that will refill the spot (Clark-Jolivet DT 70 at BYU/USC). Week 1: Top 10 avg prestige by rating 85+ 6.8, 80–84 5.7, 75–79 4.3, <75 3.4; Utah #1 picks 230 → 87. Side effect fixed (Tom): the Playing Time dealbreaker is dropped for players below the league average of this season's starters at their position (seniors next season: below that average − 4); a dropped dealbreaker never blocks and scores neutral. Week 1: dropped for 96 of 139 Playing Time players; 0 empty Top 10s. Preview only; writing it to the save is a later decision (step 6).
- **T7 weighted (Oct 20, 2026, Tom):** upgrade starts at +4 and is weighted by the weakest starter's level: ×(1 + 0.05 per OVR the starter sits below the league average starter in that room), kept 0.25–1.5. Rooms with several starters (WR, DT…) compare against the weakest starter. Examples: Wisloski (WR 83) at Utah (69 weakest) +14 → +19.4; Hawkins at Boise State (HB 86) +7 → +4.9. Stacked pairs 14,545.
- **Game behavior during the portal (measured Oct 20, 2026, Week 1 → Week 4 → Signing Day → Preseason):** lists change: by Signing Day 313 players had 455 schools not on their Week 1 list; 316 of 581 Signing Day commits went to a Week 1 school (54%), 265 to a school added later; every commit was to a school on his list at that time (574 to #1). By Week 4: 144 of 172 commits to a Week 1 school, only 34 to its #1. At Preseason 781 had landed on a team (329 at a Week 1 school), 1,042 deleted, 68 no team. Kansas is #1 on many Week 1 lists (Portal King). Implication: the weekly refresh (step 7) and Signing Day (step 5) matter as much as the Week 1 list. Tom: a school can recruit a player as long as his dealbreaker and NIL expectation don't block it.
- **NIL (open):** the save has player `BaseNILValue` (5–325, median 55; Hawkins 325) and team `NILProgramPointsSpent` / `ProgramPointBudget` (Ohio State 4,365 / 14,645; Kansas 715 / 3,790; Sam Houston 135 / 550). How the game uses NIL to block CPU schools is unknown (Tom doesn't know either), so it is not modeled.
- **Need for AI teams also counts weak starters (added Oct 20, 2026, Tom's choice):** a room's need is the stronger of drop-off and weakness. Weakness = next season's starters vs the level expected for that team (league average starter in that room, shifted by how far the team's other starters sit from their league averages); 5+ OVR below = ×1.5, up to ×2 at 10+ below; a weak room is never Stacked. Week 1: 39 rooms Weak. Kansas's need is never used (Tom decides his own needs). For reference, Kansas QB Chase Jenkins 77 ranks 50th of 138 next-season starting QBs (league average 76.2), so the tool does not call it weak; Tom considers Kansas full need at QB.
- **Coach perks (all schools, read from `Team.CoachTalentEffects`; arrays in the order QB, RB/FB, WR/TE, OL, DL, LB, DB, K/P, confirmed by Tom):** transfer interest boost of 10+ at his group moves the school to #2 of his Top 10 (it stays #1 if already there; online: "Portal King" puts you 1st or 2nd for players who already list you); a smaller boost adds that many points to its combined score. The dealbreaker threshold-decrease perk lowers the bar one grade step per point. Tom left the exact model to Claude. **Replaced Oct 20, 2026 (third session, Tom):** only the user team's perks count; AI transfer and threshold perks are ignored; the user team's full transfer perk (10+) no longer moves it to #2, it lets it join his list when it ranks 11th–18th (`perk.userReach`), at #10. Kansas in these saves: 10, 0, 4, 10, 10, 10, 12, 10 (same Players Leaving → Preseason; Tom says he now has every group, so the RB/FB and WR/TE perks were likely unlocked later). League: 32 schools have a full QB perk, 32 WR/TE; 34 have threshold relief.
- **Player score (0–100):** year weight × playing time (Fr 20%, So 35%, Jr 50%, final year 70%; role Starter 100 / Rotation 60 / Backup 30 + path bonus) + the rest × [dealbreaker grade 50%, prestige where he'd play 30%, team strength 10%, home state 10%] ± 3 jitter (fixed per player, team and season). **Changed Oct 20, 2026 (third session, Tom):** year weight halved for 80+ OVR (`playingTimeByRating`; Tom picked option C over "halve partial perk points" alone, which became moot when AI perks were dropped); rest = dealbreaker 40%, his two pitch categories 10% each, prestige 25%, strength 10%, home 5% (Tom picked option 1 of three splits).
- **Ideal recruiting pitch (P4, added Oct 20, 2026, third session):** `Player.IdealRecruitingPitch`; each of the 20 pitches has 3 categories (Tom's in-game list, stored in `lib/data/pitches.json`); his dealbreaker is always one of them, the other two are secondary preferences scored with the same school grades (Playing Time = role, Proximity = home state; never block). Verified: Tom's list is in the save's enum order, and for 19 of 20 pitches every player's dealbreaker is one of its 3 categories; Gym Rat (`WorkHorse`) mismatched (see status). Week 1 effect: #1 changed for 423 of 1,891; on average 9.3 of 10 schools unchanged; #1 concentration unchanged (it's team-side need).
- **Results after the third-session changes (Week 1 copy):** 0 empty Top 10s; 80–84 with a prestige ≤3 #1: 37 → 12; #1 prestige avg 85+ 7.0 → 7.6, 80–84 6.5 → 7.2; under 80 unchanged. Singleton → Duke (P6), Oklahoma State, Illinois; Hawkins → Illinois, Tennessee, Duke, Virginia, USC (Kansas 13th; no RB/FB perk in these saves); Mack → Indiana, Michigan, UCLA; Wisloski → Utah, Pittsburgh (home), Virginia. Kansas in 330 of 1,891 Top 10s (17.5%), 128 via the perk (e.g., Brandon Finney Jr. CB 91, Jehiem Oatis DT 90, Quincy Rhodes Jr. LE 90), top 2 in 25. Signing Day copy: Kansas in 249 of 1,310 (19.0%), 76 via the perk; #1 most BYU 100, Utah 79, FAU 76. Whole portal scores in about 0.6 s (was 0.5 s).
- **Examples (Week 1):** Hawkins (HB 93, Playing Style): Illinois, Arkansas (full perk), Duke, UCLA, Virginia, Iowa, Kansas 7th; Oklahoma State fails his dealbreaker (C+). Wisloski (WR 83, Contender): Utah, Virginia, Minnesota, Oregon, Kansas 5th; C. Michigan and FAU are gone (they were there before grades and the pass/fail rule). AJ Williams (WR 78, Contender): Utah, Virginia, Texas Tech (home). Seabrooks (DT 83, Playing Style): Oregon, Notre Dame, Colorado (full DL perks). Still questionable: Jasper Beeler (S 83, Pro Potential) has C. Michigan 2nd (home state, DB grade C+).
- **Kansas across the league (Week 1, before the third-session changes):** in 11.9% of Top 10s (225 of 1,891; game baseline is about 5–6%, about 10% with the perk), top 2 in 105 of them (19 before perks), median slot 3. Not in Austin Mack's list (QB room stacked).
- **League:** no empty Top 10s; #1 choices still concentrate (Utah 230, BYU 176, Illinois 148), so step 6's #1-pick balancing is needed. Only 3% of the game's own Signing Day commits match our Top 10s (measured before grades); the game sends transfers to prestige 3.9 on average.
- **Data notes:** school states from `lib/data/team-states.json` (the save's City points at game data that isn't in the save; pipelines measure recruiting reach, not location); home = same state only.
- **Speed:** open 0.65 s; whole portal scored in about 0.25 s. Role check still 0 mismatches.
- **Where:** `lib/destinations.mjs`; Depth Chart tab → portal player → "Top 10 preview" (★ = in Top 10); `tools/step4b-report.mjs <save> --who="Name" --at=Team --league`.

### Step 5 results (Oct 20, 2026, in progress)

**Piece 1: save edits proven in-game (done).** Test copy `test_saves/DYNASTY-STEP5PROOF` (the Signing Day copy with 4 edits at Liberty); Tom loaded it, advanced, and the game's save is `test_saves/DYNASTY-STEP5PROOF-PRESEASON`. Every table and record was compared before handing it over: exactly the 12 planned records changed.

| Edit | Player | What we write | Result at preseason |
|---|---|---|---|
| Un-sign a recruit | Joshua Fisher WR 53 | Recruit `RecruitStage` Signed → Top10, `TotalScholarshipOffers` → 0, removed from the school's board (later slots move up, last cleared) | Deleted (his player row reused by a new player) |
| Cut a returning player, way **A** (release) — **use this one** | Jayden Whaley FS 65 | `TeamIndex` 255, `PrevTeamIndex` = old school, removed from the school's roster list (Player[] table 6137, one row per team) and from its depth chart slots (Player[] 6136 rows behind the DepthChart table) | Deleted |
| Cut, way B (graduate-style) | Michael Floyde LE 65 | Same as A plus `SchoolYear` Senior (redshirt not current) | Deleted (works, but changes his year; not needed) |
| Commit a transfer | Matyus McLain RE 74 | Recruit `RecruitStage` Top10 → Signed, `TotalScholarshipOffers` → 1, added to the school's board, the school moved to #1 on his list with the top influence | On Liberty's roster |

Also learned: each team's committed-players board has **35 slots** (a hard limit on newcomers per team); the save holds 17,500 player rows, 16,235 used at Signing Day, so cut players must really be deleted, never left teamless; at the rollover **the game fills teams under 85 with leftover uncommitted transfers itself** (Liberty got Joenel Figueroa SS 73 and Juan Salas FS 73), so whatever room we leave, the game fills its own way. The scratch scripts that wrote and checked the copy are not in the repo; piece 4 rebuilds these edits in `lib/roster-edits.mjs`.

**Piece 2: recruit cleanup preview (built).** `lib/signing-day.mjs` (`planRecruitCleanup`), `tools/step5-report.mjs`, settings `signingDay.recruitCleanup` (under 60; keep Star/Elite/Impact whose max reaches the league's average next-season starter at his position, `fit.mjs` `starterLevels`), and the app's **Signing Day** tab (summary, all CPU schools sortable, click a school for its un-signed and kept lists). Signing Day copy: 137 CPU schools, 3,913 signed recruits, 1,685 under 60; **1,535 un-signed** (Normal 1,508, Impact 23, Elite 4), **150 kept** (Impact 131, Elite 11, Star 8); free board spots 310 → 1,845 (enough for the 1,310 uncommitted transfers); full boards 49 → 1 (Georgia: 35 signed recruits, all 60+). Liberty: 15 un-signed (e.g. Adrian Hinojosa MLB 59), Andrew McQuillan RG 56 kept (Impact, max 78 vs OG average 74.9).

**Piece 3: placing transfers + cuts (built, preview only; Tom tuned it twice on Oct 20).** `lib/signing-day.mjs` `planPlacement` on a live copy of the projection (`lib/live-league.mjs`): after every signing or cut the school's needs are recomputed, so each later player's Top 10 (`destinations`) reflects earlier signings. Rules (settings `signingDay.placement`, `fit.lookalike`, `fit.newcomerUpgrade`, `fit.transferLimit`):
- Queue: uncommitted transfers by max overall. Each goes to the first school in his **live** Top 10 with room; else "best fit": the school with room he likes most by player score (schools meeting his dealbreaker first).
- Room = free board slot (35), position cap (table below), roster 85. A full school cuts **one** player whose keep value is 5+ below the newcomer's, only a player who'd be **Backup/Buried once the newcomer arrives**, **recruits first**, at most **5 real players per school**; protected players never.
- **Lookalikes (Tom):** team score ×0.25 for each transfer/recruit already coming into the room with the same next-season year and OVR within 3 (BYU had signed 4 rising-senior safeties 87–89; now 1 + a 77).
- **Newcomer limits (Tom, option c):** a transfer only takes a starting spot from a newcomer already coming in when he is 4+ OVR better (else Backup); a school takes at most (starters it lost in that room + 1) transfers per room (FAU had 3 QBs; now 2: Bailey 84 starts, Hill 76 Fr backs up). A second QB as a young backup is fine (Tom).
- Schools still over 85 after placement trim recruits first, then lowest-keep-value bench players (the game would cut its own way otherwise).
- Cut real players are placed again: schools that want him (team score > 0) first, then by his player score; deleted only if no school has room.
- Player side reweighted (P2, Tom): dealbreaker 40→45%, each pitch category 10→15%, prestige 25→15%, team strength 10→5%, home 5%. Week 1: BYU #1 for 110 players (was 130); 80–84 OVR with a prestige ≤3 #1: 12 → 28; 0 empty Top 10s.
- **Results (Signing Day copy):** 1,310 of 1,310 placed, 0 unplaced; 1,004 at their #1, 25 best fit; 1,094 start, 178 rotation; real players cut 150 (4 rated 75+), 137 moved, 13 deleted; recruits un-signed 1,535 (cleanup) + 674 (to make room); rosters 64–85, 0 over 85; schools taking 3+ at one position 87 (most where they lost that many starters); ~0.8 s. Simmons → Arizona (#1), Hawkins → Duke (#1), Khalil Barnes → BYU (#1).
- **Signing Day screen (Tom's dashboard ask):** overview tiles (transfers placed, schools, real players cut, recruits un-signed, rosters) that open pages: Transfers (all 1,891 incl. 581 game commits, by the game's national rank; stars, position rank, from → to, pick badge, role; search + position + stars filters), Schools (sortable; default Avg OVR In: Texas 86.0, Oklahoma 85.3, Penn State 84.8), one school (tiles, plain-sentence summary, tabs Transfers In / Cut to Make Room / Recruit Cleanup), Cuts, Recruit cleanup. Star rating = `Player.ProspectStarRating`, rankings = `Recruit.NationalRank` / `PositionRank`.
- Tom's earlier open questions are answered: no minimum role (not every transfer has to start); cut real players are offered to other schools; service academies follow the same 85 limit.

**UI (Oct 20):** basic dark theme across the app (`ui/styles.css` color tokens), numbers and number headings right-aligned, tabular digits, same column widths in every depth-chart card, Top 10 ★ in its own column. Known rough edge: on the Signing Day tab a clicked school's list appears below all 137 rows (Tom will pick UI fixes one at a time).

### Working rule (Oct 20, 2026)

Use only what is strictly needed from the old tool; it was badly put together. Goal: peak performance and usability. Every reused piece is checked against real saves first.

## Phase 1: Draft lock

Run once on the Players Leaving save: every early-draft declaration from a player with eligibility left is set to Staying, for every team except Kansas.

- **Eligible to leave:** SchoolYear is Senior and RedshirtStatus is not Current. Everyone else is locked.
- **How:** reuse the existing per-player "Make Stay" logic (EarlyNFL leaving records set to Staying, persuasion marked used) as one batch action.
- **Report:** count of players locked per team, plus a list of the notable names (e.g., 85+ OVR) so you can spot-check.
- **Check:** after advancing, open the next save and confirm locked players are still on their rosters. The old tool's draft-return checker can be reused for this.

Open question: whether the game backfills NFL draft picks with other college players once these players stay. That's fine either way. Still open: the game clears its draft list by Week 2, so the test saves can't show it. At Week 1 the game added 82 more graduating seniors to its list.

## Phase 2: Need-based destinations (Week 1)

Every uncommitted transfer scores every school on two halves. A school enters his Top 10 only if both halves clear a bar.

### Step 1: Project next season's depth chart

- For each team, count only players who will be there next season: the current roster, minus graduating, draft-declared and outgoing-portal players, plus committed transfers and signed recruits.
- Starter slots come from the team's current offensive and defensive scheme (the save has both). When a scheme can't be mapped, the standard set applies: QB 1, HB 1+1, WR 3, TE 1+1, OT 2, OG 2, C 1, EDGE 2, IDL 2, LB 3, CB 3, S 2, K 1, P 1.
- The player's projected **role** at that school: Starter, Rotation, Backup or Buried, based on where his OVR falls in that room.
- **Path to start:** if a starter ahead of him is a senior, he projects to start the following year.

### Step 2: Player side, "do I want to go there?"

- **Playing time** = role score (plus path to start for young players), weighted by school year: Fr 20%, So 35%, Jr 50%, final year 70%. The remaining share goes to his other factors.
- **Dealbreaker** sets the weights of those other factors. For example: Championship Contender weights team quality, Pro Potential weights draft pipeline and development, and Proximity to Home weights distance heavily. Playing Time adds role on top of the year weight.
- **Home distance:** a light pull toward the home region for everyone (home state from the save).
- **Prestige only counts where he plays.** Remove the old bonus that gave 86+ players up to +12 for any higher-prestige school regardless of role. Prestige now helps only when his role there is Starter or Rotation, or he has a clear path to start.
- **Low randomness:** a small per-player seed, so results aren't identical every season.

### Step 3: Team side, "would they want me?"

- **Need:** a team that lost a starter at his position gets a strong boost, about double its normal pull. A room that's already stacked with returning starters is heavily discounted.
- **Projected ceiling:** max overall from the six skill-group caps, Maxi's method (see "Ceiling = max overall" above; replaces the earlier dev-trait/age idea, since the save's Age field is unusable). A young player with a high ceiling can interest a top program even as a backup. A 78 OVR sophomore whose caps leave little room cannot.
- **Talent tier:** compare his projected ceiling to the team's level at that position. A top program isn't interested in a player who won't ever crack its two-deep; a low-level program can't realistically pull an elite starter unless his dealbreaker points there (e.g., Proximity to Home).

### Step 4: Build the Top 10

- Rank schools by the combined score, keeping only schools that pass both bars.
- Balancing: spread #1 picks so no team is the #1 choice of far more players than its open starter slots plus a small cushion. The existing load-balancing pass is kept, but it works from position need rather than total roster count.
- Respect roster limits (85) and the save's committed-player slots, as the current tool does.
- Write the Top 10 school IDs and influence values; commit no one.

Example check: Keisean Henderson at Ohio State with Julian Sayin returning projects as a Backup. That makes Ohio State's player-side score low, and Ohio State's QB need is near zero. Ohio State should not appear near the top of his list.

## Phase 2b: Weekly upkeep (Weeks 2–4)

Run this on each week's save after the game advances and before you play the next week. It does two things: reviews new game commits, then refreshes the remaining Top 10s.

### Weekly commits (decided Oct 20, 2026, fifth session; not built)

**How the game commits (measured on the Week 4 copy):** a transfer commits when a school that has **offered** him reaches his `CommitScore` (Recruit, 125–350) in influence (`RecruitTarget.ProspectInfluenceTotal`): 170 of the game's 172 Week 4 commits had an offering school at or above it; 0 of 1,719 uncommitted did. CPU schools barely recruit the portal: only 559 of 1,891 transfers are on any school's recruiting board and 360 uncommitted have an offer (Week 4), which is why ~1,300 pile up until Signing Day. Commits so far: Week 1 0, Week 2 1, Week 4 172, Signing Day 581.

Tom's decisions:
- **The tool commits players itself each week** (option A), with live interest updated after every commit (same engine as Signing Day: `lib/live-league.mjs`).
- **Pace, back-loaded:** share of all portal transfers committed by the end of Week 1 / 2 / 3 / 4 = 10% / 25% / 45% / 70% (≈190 / 475 / 850 / 1,325 of 1,891), the rest at Signing Day. The game's own commits count; the tool fills the gap.
- **Who first:** a mix: clear favorite (his #1 far ahead of #2 in combined score), boosted for higher-ranked players (game ranking), and for players with a single offer whose offering school is close to his `CommitScore` (Tom: "a player with only one offer with a school that has a decent lead").
- **Destination:** if a school has offered him in-game and it is anywhere in his Top 10, he commits there; otherwise his live Top 10 #1 with room.
- **Held:** never auto-commit a player while the user team is in his top 3.
- **No cuts and no recruit cleanup during the weeks**: weekly commits need a free board slot and room under the position limits; all cutting stays at Signing Day.
- **Write method:** test both on one copy first (see Current status): direct commit edit vs. the game's own trigger (offer + influence at his `CommitScore`). Keep what survives a weekly advance.
- Tracking screen: where top transfers committed, week by week (ranking, stars, school).

### Weekly commit review

- Uses the same flags as the Signing Day review, but only for commits made since last week.
- Each flagged player shows his top 3 best-fit alternatives. You pick: keep or move. Kansas is never flagged.
- Fixing early matters: the team that loses the player still has weeks to recruit a replacement.

### Weekly Top 10 refresh

- Rebuild depth charts with this week's commits, then re-score every uncommitted player.
- Teams that just filled his position drop down or off his list. Teams whose target went elsewhere move up.
- **Keep lists stable:** a school is swapped only when its score changed meaningfully. His #1 stays unless that team no longer needs him. That way the game's built-up recruiting progress isn't wiped every week.
- **Kansas is never removed** from a list it's already on, so your in-game recruiting isn't undone.
- Open question to test on copies: how the game carries recruiting progress from week to week when a school is swapped out.

## Phase 3: Signing Day

At Signing Day the tool builds every AI team's next-season roster (Kansas exempt) so the game's rollover has nothing left to cut or delete: a recruit cleanup, a review of the game's own commitments, then auto-commitment of everyone still uncommitted, and a final 85-player check.

### Pass 0: Recruit cleanup (decided Oct 20, 2026)

- **Real players always come before generated recruits.**
- **Un-sign bad generated recruits:** any signed HS/JUCO recruit under 60 OVR, unless his dev trait is Star, Elite or Impact **and** he projects to contribute: his max overall reaches the league's average next-season starter at his position (updated Oct 20, 2026, Tom added Impact). Signing Day copy: 1,685 AI recruits under 60; 150 kept (131 Impact, 11 Elite, 8 Star); 1,535 un-signed. Tom: don't delete too many true freshmen; keep the flow of players.
- **Position caps** on next season's roster (returning players + transfers + recruits). **A cap never stops a team from upgrading (Tom, Oct 20, 2026):** a team at a cap (or at 85) that adds a better player cuts its weakest link to make room, at that position for a cap, anywhere on the roster for 85.
- **Weakest link = lowest keep value (Tom, Oct 20, 2026):** keep value = OVR + (max OVR − OVR) × year factor (next season: Fr 0.5, So 0.35, Jr 0.2, Sr 0). Applies to everyone: returning players, transfers and recruits. Young players with a ceiling outlast topped-out upperclassmen.
- **Cut margin:** a team cuts a player only when the newcomer's keep value is at least **5** higher; otherwise the newcomer goes elsewhere.
- **Protected (Tom, Oct 20, 2026):** real players are never cut and never left unplaced when they are **Junior or Senior and 77+**, or **Freshman or Sophomore, 72+, with a max overall of 77+** (school year as shown in-game at Signing Day, before rollover). Signing Day copy: 1,082 of the 1,310 uncommitted transfers protected (Fr 319, So 362, Jr 401); 228 can be left unplaced (183 juniors under 77); the max-77 test drops only 19 underclassmen 72+ (e.g., Damon Allen S 73→74). 3,061 of 7,598 returning AI players protected. Simmons (Jr 86) and Hawkins (Fr 93) protected.
- **To test on a copy first:** how a cut is written for a returning player (the game itself removes players at rollover; we need the edit that makes it remove the one we choose), and that un-signing a recruit makes the game remove him.

  | QB | HB | FB | WR | TE | OT | OG | C | EDGE | DT | LB | CB | S | K | P | Total |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | 5 | 6 | 1 | 11 | 5 | 8 | 8 | 4 | 8 | 8 | 12 | 9 | 8 | 2 | 2 | 97 |

  Raised Oct 20, 2026 (Tom): the first caps (QB 4, WR 9, OT 6, OG 6, C 3, EDGE 7, DT 7, LB 11, CB 8, S 7) added up to only 81, so no team could reach 85. Raised again the same day to WR 11, TE 5, K 2, P 2 (total 97) after the capacity check below.

  **Capacity check (Signing Day copy, Oct 20, 2026; read-only simulation of Pass 0):** 1,310 uncommitted transfers; 137 AI teams have only 194 spots under 85 as the save stands (89 teams already over 85, by 632). Pass 0 un-signs 1,662 sub-60 non-Star/Elite recruits and 348 over-cap recruits → 1,656 spots under 85. With caps 93, WR (301 transfers vs 213 spots), TE (49 vs 23), K (50 vs 6) and P (31 vs 4) ran short by ~185; with caps 97 every position fits (WR 301 vs 303, TE 49 vs 79, K 50 vs 79, P 31 vs 85). WR is tight, so a few of the weakest WRs may still go unplaced once team 85 limits apply. Uncommitted transfers by OVR: 85+ 123, 80–84 274, 75–79 646, 70–74 262, under 70 5. Commit timing: Week 1 0, Week 2 1, Week 4 172 (34 rated 85+), Signing Day 581; 1,310 still uncommitted.

  The caps now total 97, enough for a full 85 with slack. The caps and the 85 limit are separate checks; teams are not required or pushed to reach 85.

- Un-signing must first be tested on a copy: the game removed all 172 naturally unsigned recruits at rollover; we confirm our edit gets the same result.
- **Final check after Pass B:** every AI team at or under 85, and every transfer placed somewhere, so the game neither cuts veterans nor deletes portal players.
- **Deletion rule (Tom, Oct 20, 2026):** a real player like Austin Simmons (QB 86) being deleted is unacceptable. Only the worst of the worst real players may be left unplaced, and only after every team's room (freed by the recruit cleanup) is used. Un-signing the ~1,600 sub-60 recruits frees more than enough room for all 1,310 uncommitted transfers.

### Pass A: Review game-made commitments

- Flag AI-team commitments that clearly break the need rules. Examples: he projects as Backup or Buried there, the team already has a returning starter at or above his level, or the team signed another starter-caliber player at his position.
- For each flagged player, show the top 3 best-fit destinations with his projected role and the team's need at his position. Show the current commit alongside for comparison.
- You pick: keep the commit, or move him to one of the suggestions. Nothing moves without your click.
- Kansas commitments are never flagged.

### Pass B: Commit the rest

1. Process uncommitted transfers from best to worst projected ceiling.
2. Each player goes to the highest school in his Top 10 that still needs his position and has roster and slot room.
3. After each signing, update that team's depth chart and needs. A team that just landed a QB stops being a strong QB destination.
4. If his whole Top 10 is full or no longer needs him, he goes to the best available fit nationally: the school with room where his projected role is highest.

### Report

A per-team table (in, out, net, average OVR in/out, plus starter slots lost vs. filled by position) so you can see whether mid-tier teams rebuilt.

## App design and stage workflow

One window: open a save, the tool detects the stage, shows the one action for that stage, runs it, shows the report, and saves.

1. **Players Leaving save:** Draft Lock, then review the report and save.
2. **Advance in game** to Week 1.
3. **Week 1 save:** Generate Top 10s, then review the per-team need summary and save.
4. **Weeks 1–4 play out in game, with Weekly Upkeep after each week (Phase 2b).**
5. **Signing Day save:** review flagged game commits and pick fixes, then Commit Remaining, review the per-team report, and save.

Built in:

- **Automatic backup** of the save before every write, kept in a `TTT Backups` folder beside the original with a timestamp. The old tool overwrote saves with no backup.
- **Settings file** for your team (Kansas), year weights, need boost and randomness, so tuning doesn't need code changes.
- **Dry-run preview:** every action shows what it *would* change before you commit to it.
- **Speed:** load player, team and recruit tables once and build indexes. The old generator re-scanned the full player table several times.

Tech: Electron 37 + Node, madden-franchise 4.3.1, our own lean data layer (no old-tool code), a plain HTML UI with three tabs (Stage, Depth Chart, League Needs), in `C:\Users\tomle\Documents\TomsTransferTools`. File map and test commands are in `CLAUDE.md` next to this plan.

## Testing plan

All tests run on copies of the six saves in `saves\TomsTransferTools\test_copies`; the originals there are never written. Fresh copies for each run go in `saves\TomsTransferTools\test_runs\<step>\`.

| Save | What gets tested |
| --- | --- |
| DYNASTY-PRESEASONCOPY | Made by advancing the Signing Day copy; shows what the game's rollover did (cuts to 85, deleted transfers, team OVR drops) |
| DYNASTY-PLAYERSLEAVINGCOPY | Draft lock: no non-graduating player stays declared; Kansas untouched; the file reopens cleanly |
| DYNASTY-WEEK1PORTALOPENSCOPY | Top 10 generation: Henderson-type cases, #1-pick spread across teams, teams that lost 10+ players appear in Top 10s, run time |
| Week 2 copy (Week 3 made later by advancing a tool-refreshed Week 2 in-game) | Weekly upkeep: only new commits are flagged; refreshed lists stay stable; Kansas stays on lists |
| DYNASTY-WEEK4PORTALCLOSESCOPY | Need/depth projection with real game commits already made |
| DYNASTY-SIGNINGDAYCOPY | Reroute flags, Commit Remaining, roster limits (85) and slots respected, per-team report |

The final check is yours in-game: load each modified copy, advance one stage, and confirm the game accepts it.

## Later phase and open questions

**Phase 4 (later): outflow control.** Decide who enters the portal at the Players Leaving stage: protect projected starters, let buried backups leave, and possibly lower the per-team cap below 15. This uses the same depth-chart projection built in Phase 2. Draft-locked players count as portal candidates too: outflow control may send a locked player into the portal when his projected role at his school is poor (e.g., a star buried behind a better starter). The draft lock itself never blocks the portal.

Open questions to settle while building:

- [ ] How the game uses NIL to block CPU schools (data exists; mechanism unknown; Tom: not now)
- [x] 80–84 Playing Time players at prestige-3 #1s: fixed by halving playing-time weight for 80+ (Oct 20, 2026)
- [x] Gym Rat pitch categories (Tom, from the game)
- [ ] Write the Playing Time dealbreaker drop into the save in step 6, or keep it preview-only?
- [ ] #1-pick balancing by open slots (step 6)

- [ ] Exact dealbreaker list in CFB 27 and the weights for each, to tune together after a first run (needed for step 6, player side)
- [x] How scheme values map to starter counts: the game's scheme data isn't readable from the save, so we use an agreed table in `settings.json` (step 3)
- [x] Role cutoffs: rank-based (Starter within starter count, next 1 Rotation at most rooms plus 1 OL swing, Backup to double the starters, rest Buried), in `settings.json`
- [x] Ceiling formula: Maxi's max overall (skill groups to cap)
- [ ] Is max overall too generous for scoring? It assumes every upgrade is bought (now also used by T5, T10, the recruit keep rule and the protection rule's max-77 test)
- [x] Does un-signing a recruit at Signing Day make the game remove him at rollover? Yes, proven in-game (step 5 piece 1); so do cutting (release) and committing edits
- [ ] Week 3 stage number (5) is inferred; confirm on a real Week 3 save
- [ ] 3-4 defenses: should extra DTs count in the EDGE room? (strict position rooms for now)
- [ ] Does the game backfill NFL draft picks after the draft lock? (Not answerable from Week 2 saves; lock itself verified working.)
- [x] Where the new tool folder should live: `C:\Users\tomle\Documents\TomsTransferTools`
