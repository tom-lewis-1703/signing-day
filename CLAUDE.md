# Tom's Transfer Tools — handoff for new sessions

Personal CFB 27 dynasty utility for Tom (works for any dynasty; his current one is Kansas). **Read `PLAN.md` first**: its "Current status and next step" section says where the build is and what to do next. Its "How we'll work" section is mandatory.

This repository is the app folder, `C:\Users\tomle\Documents\TomsTransferTools` on Tom's PC, pushed to the **private** GitHub repo https://github.com/tom-lewis-1703/toms-transfer-tools (`origin`) so cloud sessions can work on it. Keep it private: the numbers in `lib/data/ratings-model.json` were extracted from Maxi's tool (it states no license). Tom considers the ratings model our own work; describe it that way, without implying Maxi owns it.

Branches: `main`; feature branches per step (e.g. `step4b-pitches-perks`); `review-base` + `full-review` exist only so a pull request can show the whole app for `/code-review ultra` (never merge them). Pushing from Claude is blocked by auto mode, so give Tom the push command to run.

## Working rules (from Tom)

- One build step at a time. Before a step: restate goal and approach in plain terms and wait for Tom's OK. Ask about every tuning choice instead of guessing. After: show real results from fresh copies of the test saves (specific players and teams), Tom checks in-game and signs off, then update `PLAN.md` before proposing the next step.
- Never write to the test saves in `test_saves/` (or `test_copies\` on Tom's PC) or to any real save. Copy a save to a scratch or `test_runs/` folder first. Opening a save is read-only; only Save writes.
- Use as little old-tool code as possible (TrapsTransferTool was badly built). Priorities: peak performance and usability. Verify anything reused against real saves.
- Only the worst of the worst real players may ever be left unplaced/deleted. Real players always come before generated recruits.
- The user team (`settings.json` → `userTeam`; Kansas, TeamIndex 37, in the current dynasty) is exempt from all automated changes. Never hard-code Kansas; read the setting.

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

How to talk to Tom (he is not a programmer): short plain-language summaries with real players and teams, then one clear recommendation. Trust what he reads in-game (e.g. the pitch categories); if the save disagrees, say so once and use his value, without asking him to re-check.

How Tom tunes: he describes a problem with a real player (often a screenshot of the app), you propose 2–4 concrete options with numbers from the save, he picks; then show before/after on named players and league-wide counts (empty Top 10s, #1-pick spread, Top 10 prestige by rating band).

To get numbers for options before changing code: write a scratch script (in the scratchpad, not the repo) that opens a `Session` on a fresh copy, changes `session.settings` in memory (it's read on every call) or re-sorts the returned `teams` rows, and calls `session.destinations(p.index)` for each uncommitted transfer. Report the same league counts as `tools/step4b-report.mjs --league`.

## Locations

| What | Where |
|---|---|
| Plan, handoff, walkthrough | this repo: `PLAN.md`, `CLAUDE.md`, `docs/ttt-internals.html` |
| Test saves (never written) | `test_saves/` — PLAYERSLEAVING, WEEK1PORTALOPENS, WEEK2, WEEK4PORTALCLOSES, SIGNINGDAY, PRESEASON (`DYNASTY-*COPY`) |
| Tom's real saves and local test runs | `C:\Users\tomle\Documents\EA SPORTS College Football 27\saves\` (`TomsTransferTools\test_runs\` for run copies) |
| Old tool (reference only, PC only) | `C:\Users\tomle\Downloads\TrapsTransferTool` |
| Maxi's tool (source of the ratings model; PC only) | `C:\Users\tomle\Downloads\DynastyProgressionMonitor-9.2.1` |

## App file map

- `lib/dynasty.mjs` — lean read layer over madden-franchise. `Dynasty.load(path)` reads only needed fields once and builds indexes; each player gets derived fields (`team`, `prevTeam`, `outOfEligibility`, `leavingForDraft`, `enteringPortal`, `isTransfer`, `isIncomingRecruit`, `destination`, `transferCommitted`, `archetype`, `dealbreaker`, `homeState`, …); each team gets `prestige`, `state`, school `grades`, `proPotential`, `playingStyle`, coach perks. `refreshPlayer(p)` after editing records. `maxOverall(p)` lazily computes and caches the ceiling.
- `lib/stage.mjs` — stage from `SeasonInfo.CurrentOffseasonStage`: 2 Players Leaving, 3 Week 1, 4 Week 2, 5 Week 3 (inferred), 6 Week 4, 7 Signing Day; `CurrentStage=PreSeason` is preseason (no action).
- `lib/draft-lock.mjs` — step 2 (sets every EarlyNFL leaving row of non-graduating, non-Kansas players to Staying, PersuadeAttempts ≥ 1).
- `lib/depth-chart.mjs` — step 3 projection: rooms, roles, path to start, needs (starters lost/replaced/open, this season's starter OVRs), `roleAtTeam`.
- `lib/ratings-model.mjs` + `lib/data/ratings-model.json` — overall formula and max overall (our implementation, modeled on Maxi's tool). Data extracted once by `tools/extract-ratings-model.mjs` (needs Maxi's tool, PC only).
- `lib/fit.mjs` — step 4 team side (T1–T10): role at a team (fast, verified equal to `roleAtTeam`), stopgap vs prestige starter level (T10), room need = max(drop-off, weakness) or Stacked, per-player upgrade (level-weighted) and succession, position importance, level check; `fitAt`, `whoWantsHim`. Returns `baseScore` (used inside one player's list) and `score` (× position importance, for comparing across positions). Tuning in `settings.json` → `fit`.
- `lib/destinations.mjs` — step 4b player side (P1–P4, K1–K4): dealbreaker = the game's school grade, pass/fail by OVR (Playing Time dropped below position average); player score (playing-time weight halved for 80+; the two other categories of his ideal pitch, from `lib/data/pitches.json`); prestige floor; home state; coach perks for the user team only (full transfer perk → joins his list from as low as 18th, at #10); combined Top 10 preview (`destinations`). The user team (`settings.userTeam`, any dynasty; Kansas now) skips team side and floor. School states in `lib/data/team-states.json`; tuning in `settings.json` → `playerSide`.
- `lib/session.mjs` — app session used by the window and the CLI tools (open, draft lock, depth chart, Top 10 preview, save).
- `lib/safe-save.mjs` — backup to `TTT Backups\` beside the save → write temp → reopen and verify stage + player count → replace.
- `lib/settings.mjs` + `settings.json` — every tuning value (user team, starters by scheme, role cutoffs, `fit`, `playerSide`). `settings.json` overrides defaults at the top level only, so when adding a nested value, add it to both.
- `electron-main.cjs`, `preload.cjs`, `ui/` — the window (tabs: Stage, Portal Players, Depth Chart, League Needs). Portal Players tab → type a portal player → "Top 10 preview" table (★ = in his Top 10); click a team → its depth chart with his role there.

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
- Shell note (Windows Git Bash): apostrophes in JS strings break `node -e` and heredoc quoting. For anything bigger than a one-liner, write the script with the Write tool into the scratchpad and run it with `node <path>`.

## Testing commands (run from the repo root; paths with spaces need quotes)

```
npm install                                                                      # once per checkout (cloud sessions)
node tools/step3-report.mjs test_saves/DYNASTY-WEEK1PORTALOPENSCOPY --teams=Missouri --rooms=QB,WR --league=10
node tools/step4-report.mjs test_saves/DYNASTY-WEEK1PORTALOPENSCOPY --who="Caleb Hawkins" --at=Team,Team --league --verify
node tools/step4b-report.mjs test_saves/DYNASTY-WEEK1PORTALOPENSCOPY --who="Caleb Hawkins" --at=Kansas --league
node tools/capacity-check.mjs test_saves/DYNASTY-SIGNINGDAYCOPY                  # room for uncommitted transfers after recruit cleanup
node tools/list-journey.mjs test_saves                                           # in-game lists over time vs where players landed
node tools/step1-test.mjs "<folder of saves>" "<work folder>"                    # open/save/compare (writes copies into the work folder)
node tools/step2-test.mjs "<PLAYERSLEAVING save>" "<work folder>"                # draft lock + diff
node tools/step2-check.mjs "<...draft-lock.json>" "<later save>"                 # locked players still on teams?
runtime\electron\electron.exe tools\ui-smoke.cjs --player=Name --depth=Missouri "<save>" "<out.png>"   # PC only: drive the real window
```

The tools only read the saves you pass; step1/step2 tests write to the work folder you give them, never to the input save.

Tom's PC: Windows 11, Node 25; the app runs on the bundled Electron 37 runtime (`runtime\`, not in git).
