# Plan

`/hub` starts the hub chat (design and dispatch; see `.claude/skills/hub/SKILL.md`). `/next` starts the first open task in "Task list" that has no builder tag; `/handoff` updates this file. A task a builder session is working on ends with `(builder: <session id>)`. Rules and save facts are in `CLAUDE.md`; the GUI engine spec is `GUI-PLAN.md`; history is in git. Cite sections as `PLAN §n.m`.

## 1. Where we are and what's next
- On `main`: the GUI engine `node gui.mjs` (server, API, undo locks, player card data; spec `GUI-PLAN.md`), with no screens until task 2. It runs Signing Day through `lib/signing-day.mjs` (`planRecruitCleanup`, then `planPlacement`). What's built: §4.
- Next: the GUI redesign (task 2).

## 2. Task list
One chat per task. `[ ]` open, `[x]` done.
1. [ ] **Portraits** (Tom, on his PC): re-run `tools/copy-art.mjs` (adds the 113 cut-short heads), then check in-game that the four named players' portraits (`GUI-PLAN.md` §6.5) match their faces.
2. [ ] **GUI redesign:** a new front end in `gui/` on the engine (`GUI-PLAN.md`). Goal: easy to read, good to look at, and using the screen's space well. Designed with Tom in the hub chat, with Mobbin examples; a mockup before building.

## 3. Open questions for Tom
None.

## 4. What's built

### 4.1 Commands
| Command | Does |
|---|---|
| `node gui.mjs [--no-open]` | GUI server and API (`GUI-PLAN.md`); no screens until task 2. The user team is picked per save. |
| `node tools/<name>.mjs …` | Reports and test helpers: §4.5. |

Run from the repo root after `npm install`. Dependencies: `madden-franchise` 4.3.1; `sharp` 0.35.5 (devDependency, only `tools/copy-art.mjs`).

### 4.2 Stages
`lib/stage.mjs` `readStage` reads `SeasonInfo`. With `CurrentStage` = `OffSeason`, `CurrentOffseasonStage` 2–7 maps to the stage ids `players-leaving`, `week-1` (portal opens), `week-2`, `week-3`, `week-4` (portal closes), `signing-day`; only `signing-day` has an action. Anything else is `unsupported`, labelled e.g. `Preseason (no action at this stage)`.

### 4.3 Code map
| File | Role | Main exports |
|---|---|---|
| `lib/session.mjs` | The entry point for `gui.mjs` and `tools/`: open (refuses when no user team is named, and a save that doesn't contain the team picked in the GUI, or for `tools/`, `settings.json` → `testSavesTeam`), plans, edits, save | `Session`: `peek`, `open(path, {userTeam})`, `signingDayPlan(locks)`, `applySigningDay(locks)`, `edits()`, `getLeague()`, `save()`; read-only helpers `depthTeams`, `depthTeam`, `leagueSummary`, `portalPlayers`, `roleAt`, `whoWantsHim`, `destinations` |
| `lib/dynasty.mjs` | Read layer: every field read once in `Dynasty.load` (save trap, `CLAUDE.md`); teams, players, boards, offers, indexes | `Dynasty`, `openFranchise`, `NO_TEAM` (255), `ZERO`, `nextClass`, `classRank`, `GRADES`, `gradeValue` |
| `lib/stage.mjs` | Stage from `SeasonInfo` (§4.2) | `readStage` |
| `lib/settings.mjs` | Tuning values: `DEFAULTS` (every tuning key commented). No user team; `testSavesTeam` (no default; Kansas in `settings.json`) names it for the `tools/` scripts. `settings.json` overrides key by key at every level; lists replace whole; a missing `settings.json` is written from `DEFAULTS` | `DEFAULTS`, `loadSettings` |
| `lib/depth-chart.mjs` | Next season's depth chart per team; roles Starter / Rotation / Backup / Buried | `projectLeague`, `roomOf`, `ROOMS`, `ROOM_ORDER`, `assignRoles`, `roleAtTeam` |
| `lib/ratings-model.mjs` | OVR and max OVR (ceiling) per skill group; data `lib/data/ratings-model.json` | `ceiling`, `RATING_FIELDS` |
| `lib/fit.mjs` | Team side: how much each school wants him | `whoWantsHim`, `fitAt`, `starterLevels`, `prestigeTargets`, `roomNeeds` |
| `lib/destinations.mjs` | Player side and the combined Top 10; pitches `lib/data/pitches.json`, school home states `lib/data/team-states.json` (read by `dynasty.mjs`) | `destinations`, `categoryGrade`, `dealbreakerGrade`, `PITCHES`, `teamStrength` |
| `lib/live-league.mjs` | Working copy of the projection, updated after each signing or cut | `liveLeague`, `addToTeam`, `removeFromTeam` |
| `lib/signing-day.mjs` | Signing Day plan: recruit cleanup, then placement | `planRecruitCleanup`, `planPlacement`, `BOARD_SLOTS` (35), `keepValue`, `isProtected` |
| `lib/roster-edits.mjs` | Save writer (§4.4) | `RosterEdits`, `changedRecords`, `COMMIT_INFLUENCE_BONUS` (10) |
| `lib/safe-save.mjs` | Backup, write, verify, replace (§4.4) | `safeSave`, `backupSave`, `BACKUP_DIR_NAME` (`TTT Backups`) |
| `lib/gui-plan.mjs` | The GUI's Plan, locks file, saves list, team art, player card | `GUI-PLAN.md` §2.2 |
| `lib/C27_486_1.gz` | `madden-franchise` schema 486.1 for CFB 27 | |

### 4.4 Save writes
- "Board" below = a school's Signing Day board, `Team.CommittedPlayers` (`BOARD_SLOTS` 35; read into `d.boardTeamByPlayerRef`), not its `RecruitingBoard`.
- The only writer: `RosterEdits` (`lib/roster-edits.mjs`, through `session.edits()`). It logs every field it writes (`writes`).
- Every `RosterEdits` method is proven in-game. `CLAUDE.md`: change these formulas only with an in-game re-test.

| Edit | Writes | Used by |
|---|---|---|
| `commitTransfer(p, t)` | `Signed`, 1 offer, on the school's board; the school becomes #1 on his list with the top influence + 10 (a school not on his list replaces his last one) | Signing Day |
| `unsignRecruit(p)` | `Top10`, 0 offers, off the school's board | Signing Day |
| `cutPlayer(p)` | `TeamIndex` 255, `PrevTeamIndex` = his school, off its roster list and every depth chart slot; the game deletes him at the rollover | Signing Day |
| `movePlayer(p, t)` | The cut, then `TeamIndex` = the new school and onto its roster list; left off its depth chart | Signing Day |

- `applySigningDay` order: un-sign (frees board slots), cuts and moves, commits.
- Save (`session.save()` → `lib/safe-save.mjs` `safeSave`):
  1. Back up to `<save folder>/TTT Backups/<name>__<YYYY-MM-DD_HHMMSS>.bak` (`_2`, `_3`… if taken; SHA-1 checked).
  2. Write the save to the same path with `.saving.tmp` instead of `.bak`.
  3. `Session.verifySaved`: reopens; same stage; same named-player count; when `RosterEdits` made edits, every written field reads back and no record changed that no edit wrote (byte compare with the backup, `changedRecords`).
  4. Rename the temp file over the original.

  If the backup's SHA-1 check fails, the backup is deleted and nothing is written. On any later failure the original is unchanged and the temp file deleted; the backup stays.

### 4.5 Tools and docs
Usage is in each file's first lines.
- Read-only reports: `capacity-check`, `list-journey`, `offers-report`, `step3-report` (depth charts), `step4-report` (team side), `step4b-report` (player side + Top 10), `step5-report` (recruit cleanup).
- Tests on copies: `baseline-check` (the minimum proof for a change: `GUI-PLAN.md` §7), `step1-test` (open, stage, back up and save each test save in a work folder).
- `extract-ratings-model`: one-time; writes `lib/data/ratings-model.json` from Maxi's Dynasty Progression Monitor & Planner page.
- `copy-art` (`GUI-PLAN.md` §2.3; Tom's PC).

### 4.6 Baseline numbers
Stock `test_saves/DYNASTY-SIGNINGDAYCOPY` (copy), user team Kansas, no GUI locks, `settings.json` as of this commit (a settings change moves them):
- 138 schools (137 CPU), 16,233 named players; 1,310 uncommitted transfers.
- Planner: the recruit cleanup un-signs 1,535 (`tools/step5-report`); placement makes room by un-signing 682 more recruits, moving 136 and cutting 15 (GUI unsigned = 1,535 + 682).
- GUI summary: placed 1,310 · dropped 0 · unsigned 2,217 · deleted 15 · moved 136. Missouri: IN 16, OUT 22.
