# Tom's Transfer Tools — handoff for new sessions

Personal CFB 27 dynasty utility for Tom (works for any dynasty; his current one is Kansas). **Read `PLAN.md` first**: its "Where we are and what's next" and "Task list" sections say where the build is and what to do next. Its "How we'll work" section is mandatory. One task per chat: Tom starts a chat with `/next` and ends it with `/handoff` (`.claude/skills/`; `/handoff` is his OK to commit, merge into `main` and push).

This repository is the app folder, `C:\Users\tomle\Documents\TomsTransferTools` on Tom's PC, pushed to the **private** GitHub repo https://github.com/tom-lewis-1703/toms-transfer-tools (`origin`) so cloud sessions can work on it. Keep it private: the numbers in `lib/data/ratings-model.json` were extracted from Maxi's tool (it states no license). Tom considers the ratings model our own work; describe it that way, without implying Maxi owns it.

Branches: `main`; one branch per session or step (the sixth session's was `claude/determined-einstein-ogrm6h`; `claude/confident-mendel-53hrhb` is the rejected UI overhaul, never merge it); `review-base` + `full-review` exist only so a pull request can show the whole app for `/code-review ultra` (never merge them). On Tom's PC pushing from Claude is blocked by auto mode, so give Tom the push command to run; cloud sessions can push. **New cloud chats start on `main`**, so at the end of every session merge the working branch into `main` (merge commit, no rebase) and push both; otherwise the next chat sees old files.

## Working rules (from Tom)

- One build step at a time. Before a step: restate goal and approach in plain terms and wait for Tom's OK. Ask about every tuning choice instead of guessing. After: show real results from fresh copies of the test saves (specific players and teams), Tom checks in-game and signs off, then update `PLAN.md` before proposing the next step.
- Never write to the test saves in `test_saves/` (or `test_copies\` on Tom's PC) or to any real save. Copy a save to a scratch or `test_runs/` folder first. Opening a save is read-only; only Save writes.
- Use as little old-tool code as possible (TrapsTransferTool was badly built). Priorities: peak performance and usability. Verify anything reused against real saves.
- Only the worst of the worst real players may ever be left unplaced/deleted. Real players always come before generated recruits.
- The user team (`settings.json` → `userTeam`; Kansas, TeamIndex 37, in the current dynasty) is exempt from all automated changes. Never hard-code Kansas; read the setting.

### Fast and loose, but not sloppy (Tom, Oct 20, seventh session)

- Be hyper-efficient with Tom's usage limit and tokens: minimal testing (the least that proves it works), short replies, no re-reading or re-running what's already known. Quality stays the same.
- Batch in-game tests: put everything that needs checking in the game into one test copy (or one set of copies) so Tom can check it all in one launch.
- This does not loosen the check-in rules below: still small pieces, still wait for Tom's OK, never try to finish the whole project in one go.

### Check in before doing more (from Tom, after the reverted Portal Players redesign)

- Work in small pieces. After each piece, stop, show Tom what changed, and wait for his OK before starting the next.
- Before starting, list exactly what you'll change. Anything not on that list needs a new OK.
- When Tom says "recommendations are good", he's approving those decisions, not a big build all at once.
- For anything Tom will see (screens, layout, colors), show a mockup or a single example first and get his OK before changing the app.
- Don't add extras he didn't ask for, even small ones. Offer them in one line instead.
- Don't commit or push until Tom has seen the result and said OK.
- If a piece turns out bigger than described, stop and tell him before carrying on.

## Local vs. cloud sessions

| | Tom's PC | Cloud session |
|---|---|---|
| Code, plan, analysis tools | yes | yes (run `npm install` first) |
| Test saves | `C:\Users\tomle\Documents\EA SPORTS College Football 27\saves\TomsTransferTools\test_copies\` (and `test_saves/` here) | `test_saves/` |
| The app window (Electron, Windows) | yes (`runtime\` is local only) | no |
| The game, real dynasty saves, in-game sign-off | yes | no |

Cloud sessions: commit to a branch and push; Tom pulls and checks locally. Don't commit test outputs (see `.gitignore`); write scratch copies of saves outside the repo or under `test_runs/` (ignored).

## Rule codes

Tom refers to rules by code (e.g. "T3" = weak-starter need, "T10" = starter level, "P2" = player score). The code list, formulas, real-player examples and the setting behind each code are in `docs/ttt-internals.html`, published at https://claude.ai/artifact/4kbXJoCjikjx8PL56jqb98 (Tom's private artifact). When a rule changes: change the code, rerun on a fresh test copy with real players, update `docs/ttt-internals.html`, republish it to the same URL (Artifact tool with `url`; from a cloud session, if publishing isn't possible, just update the file and tell Tom), and update `PLAN.md`.

The first publish of `docs/ttt-internals.html` in a new session is refused and returns a diff against the live page. If that diff only shows your own edits, publish again unchanged; otherwise merge the live lines in first.

Always say "user team" when talking about the user team, never the school's name (Tom, eighth session).

How to talk to Tom (he is not a programmer): short plain-language summaries with real players and teams, then one clear recommendation. Trust what he reads in-game (e.g. the pitch categories); if the save disagrees, say so once and use his value, without asking him to re-check.

Screens (Tom is very particular about alignment): everything must line up. Numbers right-aligned with their headers aligned the same way, the same column widths for tables shown together, label columns the same width, even spacing. Check every screenshot for anything out of line before showing it to him. He wants a dark theme with a little color, not plain gray.

How Tom tunes: he describes a problem with a real player (often a screenshot of the app), you propose 2–4 concrete options with numbers from the save, he picks; then show before/after on named players and league-wide counts (empty Top 10s, #1-pick spread, Top 10 prestige by rating band).

To get numbers for options before changing code: write a scratch script (in the scratchpad, not the repo) that opens a `Session` on a fresh copy, changes `session.settings` in memory (it's read on every call) or re-sorts the returned `teams` rows, and calls `session.destinations(p.index)` for each uncommitted transfer. Report the same league counts as `tools/step4b-report.mjs --league`.

## Locations

| What | Where |
|---|---|
| Plan, handoff, walkthrough | this repo: `PLAN.md`, `CLAUDE.md`, `docs/ttt-internals.html` |
| Test saves (never written) | `test_saves/` — PLAYERSLEAVING, WEEK1PORTALOPENS, WEEK2, WEEK4PORTALCLOSES, SIGNINGDAY, PRESEASON (`DYNASTY-*COPY`); `DYNASTY-STEP5PROOF` (Signing Day copy with the 4 proven edits at Liberty) and `DYNASTY-STEP5PROOF-PRESEASON` (the game's save after Tom advanced it); `DYNASTY-WRITERTEST` (Signing Day copy, task 1 piece 3: at Missouri un-sign Clement Watson, Victor Paulino, Derrick Ali; cut Brett Le Blanc; commit Wayshawn Parker (on his list), Nate Sheppard and Brandon Finney Jr. (off his list)); `DYNASTY-WEEKLYTEST` (Week 2 + 377 weekly commits, built before the user-board fix: commits only) and `DYNASTY-WEEKLYTEST2` (Week 2 + 377 commits + 1,502 list updates, user-board fix; built before the stopgap and lock-break rules) |
| Tom's real saves and local test runs | `C:\Users\tomle\Documents\EA SPORTS College Football 27\saves\` (`TomsTransferTools\test_runs\` for run copies) |
| Old tool (reference only, PC only) | `C:\Users\tomle\Downloads\TrapsTransferTool` |
| Maxi's tool (source of the ratings model; PC only) | `C:\Users\tomle\Downloads\DynastyProgressionMonitor-9.2.1` |

## App file map

- `lib/dynasty.mjs` — lean read layer over madden-franchise. `Dynasty.load(path)` reads only needed fields once and builds indexes; each player gets derived fields (`team`, `prevTeam`, `outOfEligibility`, `leavingForDraft`, `enteringPortal`, `isTransfer`, `isIncomingRecruit`, `destination`, `transferCommitted`, `archetype`, `dealbreaker`, `homeState`, …); each team gets `prestige`, `state`, school `grades`, `proPotential`, `playingStyle`, coach perks. `refreshPlayer(p)` after editing records. `maxOverall(p)` lazily computes and caches the ceiling.
- `lib/stage.mjs` — stage from `SeasonInfo.CurrentOffseasonStage`: 2 Players Leaving, 3 Week 1, 4 Week 2, 5 Week 3 (inferred), 6 Week 4, 7 Signing Day; `CurrentStage=PreSeason` is preseason (no action).
- `lib/draft-lock.mjs` — step 2 (sets every EarlyNFL leaving row of non-graduating, non-Kansas players to Staying, PersuadeAttempts ≥ 1).
- `lib/depth-chart.mjs` — step 3 projection: rooms, roles, path to start, needs (starters lost/replaced/open, this season's starter OVRs), `roleAtTeam`.
- `lib/ratings-model.mjs` + `lib/data/ratings-model.json` — overall formula and max overall (our implementation, modeled on Maxi's tool). Data extracted once by `tools/extract-ratings-model.mjs` (needs Maxi's tool, PC only).
- `lib/fit.mjs` — step 4 team side (T1–T10, plus lookalikes ×0.25 and newcomer limits: 4+ OVR to take a newcomer's starting spot, max transfers per room = starters lost + 1): role at a team (fast, verified equal to `roleAtTeam`), stopgap vs prestige starter level (T10), room need = max(drop-off, weakness) or Stacked, per-player upgrade (level-weighted) and succession, position importance, level check; `fitAt`, `whoWantsHim`. Returns `baseScore` (used inside one player's list) and `score` (× position importance, for comparing across positions). Tuning in `settings.json` → `fit`.
- `lib/destinations.mjs` — step 4b player side (P1–P4, K1–K4): dealbreaker = the game's school grade, pass/fail by OVR (Playing Time dropped below position average); player score (playing-time weight halved for 80+; the two other categories of his ideal pitch, from `lib/data/pitches.json`); prestige floor; never his old school (P5; Signing Day best fit tries it last); home state; coach perks for the user team only (full transfer perk → joins his list from as low as 18th, at #10); combined Top 10 preview (`destinations`). The user team (`settings.userTeam`, any dynasty; Kansas now) skips team side and floor. School states in `lib/data/team-states.json`; tuning in `settings.json` → `playerSide`.
- `lib/signing-day.mjs` — step 5 (Signing Day roster build), read-only plans: `planRecruitCleanup` (Pass 0: un-sign signed HS/JUCO recruits under 60 at CPU teams, keep Star/Elite/Impact whose max reaches the league's average next-season starter) and `planPlacement` (Pass B: every uncommitted transfer placed on a live projection; room = 35 board slots, position caps, 85; cuts bench-only, recruits first, max 5 real players per school; keep value; protection; cut real players re-placed; game commits listed). `BOARD_SLOTS` = 35. Tuning in `settings.json` → `signingDay`. Writing the plan to the save is task 4 in PLAN.md.
- `lib/roster-edits.mjs` — the save writer (`RosterEdits`, via `session.edits()`): `commitTransfer(p, team, { weekly })`, `unsignRecruit(p)`, `cutPlayer(p)`, `setTopSchools(p, list)` (weekly list update); refuses the user team, a full board or a player in the wrong state; logs every field written (`writes`). `changedRecords(a, b)` = records that differ between two open saves, by raw bytes.
- `lib/live-league.mjs` — a working copy of the next-season projection that changes as players are signed or cut (`liveLeague`, `addToTeam`, `removeFromTeam`); league-wide baselines stay fixed. Used by Pass B and, later, the weekly commits.
- `lib/weekly-commits.mjs` — task 2: `planWeekly` (this week's commits: pace, chance-based order, live Top 10, no stopgaps, user team's board and top 3 skipped; returns the `live` league) and `planListUpdates` (in-game lists → live Top 10, user team's spot kept). Tuning in `settings.json` → `weekly`; written by `tools/weekly-run.mjs`.
- `lib/session.mjs` — app session used by the window and the CLI tools (open, draft lock, depth chart, Top 10 preview, Signing Day plan, save).
- `lib/safe-save.mjs` — backup to `TTT Backups\` beside the save → write temp → reopen and verify stage + player count (and, with roster edits, every written field re-read and no other record changed vs the backup) → replace.
- `lib/settings.mjs` + `settings.json` — every tuning value (user team, starters by scheme, role cutoffs, `fit`, `playerSide`). `settings.json` overrides defaults key by key at every level (lists replace whole), so a nested value missing from `settings.json` keeps its default; still add new values to both. If `userTeam` isn't found in a save, opening it fails (so the user team is never left unprotected).
- `electron-main.cjs`, `preload.cjs`, `ui/` — the window: a minimal one-page app (Oct 20, 2026, Tom: replaced the UI overhaul, which stays unmerged on `claude/confident-mendel-53hrhb`). Header buttons switch four views: **Stage** (save facts, Draft Lock Preview → Apply, log), **Portal** (filterable uncommitted-transfer list → his Top 10 preview; click a team for his role there), **Teams** (league needs list → depth chart), **Signing Day** (dashboard: overview tiles that open pages: Transfers ranked by the game's national rank with stars, Schools sortable by Avg OVR In, one school's summary with tabs, Cuts, Recruit cleanup; breadcrumbs; badges). Tom likes dashboard-style screens (tiles with big centered numbers, cards, nested pages, status badges) as long as they are easy to read. Open / Reopen last save (remembered in `app-state.json` in the app's user-data folder) / Save in the header. Normal resizable window, 1600 × 1000. Dark theme tokens and dark scroll bars at the top of `ui/styles.css`; `grid()` in `ui/app.js` builds every table (numbers right-aligned). The page's CSP blocks inline `style=""` attributes; set sizes from JS or in `styles.css`.

## Save facts worth knowing

- Table unique IDs: Player 1612938518, Team 3359508968, Recruit 1873209313, TopSchools 2332540366, LeavingPlayer 1418279587, transfer processing queue 3884115435. Schema file `lib/C27_486_1.gz` (major 486, minor 1).
- HS recruits and transfers point at **different** ProspectTargetSchool tables; follow the reference (the old tool's bug).
- Players who left keep their old team in `PrevTeamIndex` (transfers from Week 1, graduates from Week 2). `TeamIndex` 255 = no team.
- Signing Day: transfer destination = team whose `CommittedPlayers` board holds him, else Top School #1 when `RecruitStage` is Signed/HardCommitted.
- Player side: `RecruitingDealbreaker`, `IdealRecruitingPitch` (20 pitches × 3 categories in `lib/data/pitches.json`; his dealbreaker is one of them, except Gym Rat players, whose dealbreaker isn't), `PLYR_HOME_STATE` (Player); `TeamPrestige` 0–10 (Team). School (dealbreaker) grades: `Team.MySchoolTrackingTable` → row with `*Grade` letters, `ProPotentialGrade<group>`, `PlayingStyleGradeByPlayerTypeTable` → `PlayerTypeGradeTable` (grade per archetype). Coach perks: `Team.CoachTalentEffects` → `PlayersLeaving_InterestBoost_Transfers` / `PlayersLeaving_ThresholdDecrease_Dealbreakers` int[8] in order QB, RB/FB, WR/TE, OL, DL, LB, DB, K/P. `Motivation1–3` are empty. madden-franchise won't add fields to an already-read table, so request every field in `Dynasty.load`.
- Archetype = `PlayerType`; skill caps = `SkillGroupCap1–6` (0–20). The `Age` field is unreliable (1 or 52 for many players).
- At the Signing Day → preseason rollover the game deletes uncommitted transfers and unsigned recruits, and trims rosters to 85 by cutting veterans, never incoming recruits.
- Game commits always go to a school on the player's in-game list at that time (574 of 581 to #1), but lists change during the portal (about half of Signing Day commits went to a school added after Week 1). Commits: Week 1 0, Week 2 1, Week 4 172, Signing Day 581; 1,310 uncommitted at Signing Day.
- NIL: player `BaseNILValue`, team `NILProgramPointsSpent` / `ProgramPointBudget`; how the game uses them for CPU schools is unknown.
- Signing Day edits proven in-game (step 5 piece 1): **un-sign** = Recruit `RecruitStage` Top10 + `TotalScholarshipOffers` 0 + off the team's `CommittedPlayers` board; **cut** = `TeamIndex` 255 + `PrevTeamIndex` old team + off the team's roster list (Player[] table id 6137, one row per team; the row index is not the TeamIndex) and its depth-chart slots (Player[] 6136 rows, referenced by DepthChart 6302); **commit a transfer** = `RecruitStage` Signed + `TotalScholarshipOffers` 1 + on the board + the school moved to #1 of his list with the top influence + 10; a school not on his list replaces his last school first (proven at Missouri, seventh session). **Weekly commit** (proven Week 2 → 3, eighth session) = as the game writes its own: `HardCommitted`, `TotalScholarshipOffers` 1, school #1 of his list, not on the board until Signing Day. **Weekly list update** (proven Week 2 → 3) = rewrite his ProspectTargetSchool rows in place (each row holds only `TeamId`, `TeamInfluence`; list sorted by influence high to low). List tables keep each row's used length in their header (madden-franchise updates it). Arrays are kept packed (later slots move up, empty = 32 zero bits).
- **Game recruiting state (transfers too):** `Team.RecruitingBoard` → RecruitingBoard row (uid 220276943; `Recruits` → RecruitTarget[] array, read keys with `Object.keys(array.fields)`) → RecruitTarget rows (uid 59043175; **the user team's board points at a different RecruitTarget table than the CPU boards, so read every table the boards reference**): `Recruit` ref, `ScholarshipStatus` (Offered/None), `ProspectInfluenceTotal`, `ProspectInfluenceDelta` (this week's gain), `ProspectInfluenceTotalLastWeek`, `CommittedWeekNumber`. Recruit: `TotalScholarshipOffers`, `CommitScore` (125–350): **the game commits a player when an offering school's influence reaches his CommitScore** (170 of 172 Week 4 commits). A school's board influence equals its `TeamInfluence` on his list (649 of 649). The game's CPU schools seem to pick targets from players who list them (after our list update Alabama was listed by 53 instead of 220 and went after the user team's targets). During the weeks signed HS recruits already sit on the `CommittedPlayers` boards. Most transfers have no CPU offer (Week 2: 1,445 of 1,890). Star rating `Player.ProspectStarRating` (ONE_STAR…FIVE_STAR); rankings `Recruit.NationalRank`, `PositionRank` (transfer rankings for portal players).
- Each team's `CommittedPlayers` board (Player[] 6135) has 35 slots. The Player table holds 17,500 rows (16,235 used at Signing Day), so removed players must be deleted, never left teamless. At the rollover the game fills teams under 85 with leftover uncommitted transfers. Team colors: `TEAM_BACKGROUNDCOLORR/G/B` (+`2` for secondary); short name `Mascot_AssetName` (LIB, KU); logo images are not in the save.
- After Tom advances a save in-game, the game writes `<name>-AUTOSAVE` next to it; the loaded file itself is unchanged.
- Shell note (Windows Git Bash): apostrophes in JS strings break `node -e` and heredoc quoting. For anything bigger than a one-liner, write the script with the Write tool into the scratchpad and run it with `node <path>`.

## Testing commands (run from the repo root; paths with spaces need quotes)

```
npm install                                                                      # once per checkout (cloud sessions)
node tools/step3-report.mjs test_saves/DYNASTY-WEEK1PORTALOPENSCOPY --teams=Missouri --rooms=QB,WR --league=10
node tools/step4-report.mjs test_saves/DYNASTY-WEEK1PORTALOPENSCOPY --who="Caleb Hawkins" --at=Team,Team --league --verify
node tools/step4b-report.mjs test_saves/DYNASTY-WEEK1PORTALOPENSCOPY --who="Caleb Hawkins" --at=Kansas --league
node tools/step5-report.mjs test_saves/DYNASTY-SIGNINGDAYCOPY --team=Liberty      # step 5 recruit cleanup preview (league totals, boards, one school's list)
node tools/weekly-report.mjs test_saves/DYNASTY-WEEK2COPY [--compare]           # weekly commits preview (who, where, rank spread)
node tools/lists-report.mjs test_saves/DYNASTY-WEEK2COPY --who="Nico Iamaleava"  # weekly interest update preview (lists before/after)
node tools/offers-report.mjs test_saves/DYNASTY-WEEK4PORTALCLOSESCOPY            # game offers vs our Top 10s
node tools/weekly-run.mjs "<Week 1-4 save COPY>" [--dry]                         # writes this week's commits + list updates (backup + check; refuses test_saves/)
node tools/capacity-check.mjs test_saves/DYNASTY-SIGNINGDAYCOPY                  # room for uncommitted transfers after recruit cleanup (older, simpler check)
node tools/list-journey.mjs test_saves                                           # in-game lists over time vs where players landed
node tools/step1-test.mjs "<folder of saves>" "<work folder>"                    # open/save/compare (writes copies into the work folder)
node tools/step2-test.mjs "<PLAYERSLEAVING save>" "<work folder>"                # draft lock + diff
node tools/step2-check.mjs "<...draft-lock.json>" "<later save>"                 # locked players still on teams?
runtime\electron\electron.exe tools\ui-smoke.cjs --player=Name --depth=Missouri "<save>" "<out.png>"   # PC only: drive the real window
runtime\electron\electron.exe tools\ui-smoke.cjs --sd=school:BYU "<Signing Day save>" "<out.png>"          # PC only: a Signing Day page (home, transfers, schools, school:<Team>, cuts, cleanup)
```

The tools only read the saves you pass; step1/step2 tests write to the work folder you give them, never to the input save.

Tom's PC: Windows 11, Node 25; the app runs on the bundled Electron 37 runtime (`runtime\`, not in git).
