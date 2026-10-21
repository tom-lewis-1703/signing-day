# Plan

`/hub` starts the hub chat (design and dispatch; see `.claude/skills/hub/SKILL.md`). `/next` starts the first open task in "Task list" that has no builder tag; `/handoff` updates this file. A task a builder session is working on ends with `(builder: <session id>)`. Rules and save facts are in `CLAUDE.md`; the GUI spec is `GUI-PLAN.md`; history is in git. Cite sections as `PLAN §n.m`.

## 1. Where we are and what's next
- On `main`: the Signing Day GUI `node gui.mjs` (spec `GUI-PLAN.md` §0–8), the only way to edit a save. It runs Signing Day through `lib/signing-day.mjs` (`planRecruitCleanup`, then `planPlacement`). What's built: §4.
- Portal-week mode removed and the `Kansas` default dropped (git `0593958`): on fresh copies of `DYNASTY-SIGNINGDAYCOPY` the Signing Day plan, every field write and the GUI `/api/plan` are identical to before (only the always-0 `sign unsigned commits` counter is gone); `DYNASTY-WEEK2COPY` and a `settings.json` without `userTeam` are refused in one line.
- GUI only (hub edit): `ttt.mjs` deleted; the GUI no longer pre-fills a team from `settings.json` (pick per save, remembered in `gui-state.json`); `settings.json` `userTeam` is now `testSavesTeam`, read only when `Session.open` gets no team (the `tools/` scripts); the always-0 `signed` summary counter and the `[ SIGNED COMMIT ]` IN rows are gone. Fresh copy of `DYNASTY-SIGNINGDAYCOPY`: no suggested team on first open, Kansas picked → §4.6 summary unchanged (Missouri IN 16, OUT 22), remembered on reopen; `tools/step5-report` still runs (Kansas skipped, un-signed 1535).
- §3 answered: no draft lock in the GUI (Tom; it stays in `tools/step2-test.mjs` only); stale comments fixed and `lib/stage.mjs` `action`/`buildStep` dropped; `/handoff` stays as is.
- Next: Tom starts working on the GUI. Open GUI questions: `GUI-PLAN.md` §9.7 (player card), §10 Q1–4.

## 2. Task list
One chat per task. `[ ]` open, `[x]` done.
- [x] **GUI only** (hub, small edit): delete `ttt.mjs`; `gui.mjs` stops reading `settings.json` for the team (no pre-fill: pick per save, remembered in `gui-state.json`); rename `settings.json` `userTeam` to `testSavesTeam`, read only by `Session.open` when no team is passed (the `tools/` check scripts, which only run on `test_saves/`, Tom's Kansas dynasty); update `CLAUDE.md` (project line, hard rule), §1, §4 and `GUI-PLAN.md` §3.2/§5 to match. Test on a fresh copy of `DYNASTY-SIGNINGDAYCOPY`: the GUI opens it, Kansas is picked, the counts match §4's baseline; one `tools/` script still runs.
- [x] **Decide (Tom):** remove the GUI's leftover signed-commit code? Yes; removed with the GUI-only edit.

## 3. Open questions for Tom
1. **GUI:** `GUI-PLAN.md` §9.7 (player card) and §10 Q1–4 (built GUI vs spec, code defects).

## 4. What's built

### 4.1 Commands
| Command | Does |
|---|---|
| `node gui.mjs [--no-open]` | Signing Day GUI (the only save editor; the CLI `ttt.mjs` was removed): `GUI-PLAN.md`. The user team is picked per save. |
| `node tools/<name>.mjs …` | Reports and test helpers: §4.5. |

Run from the repo root after `npm install`. Dependencies: `madden-franchise` 4.3.1; `sharp` 0.35.5 (devDependency, only `tools/copy-art.mjs`).

### 4.2 Stages
`lib/stage.mjs` `readStage` reads `SeasonInfo`. With `CurrentStage` = `OffSeason`, `CurrentOffseasonStage` 2–7 maps to the stage ids `players-leaving`, `week-1` (portal opens), `week-2`, `week-3`, `week-4` (portal closes), `signing-day`; the week stages have no action. Anything else is `unsupported`, labelled e.g. `Preseason (no action at this stage)`.

### 4.3 Code map
| File | Role | Main exports |
|---|---|---|
| `lib/session.mjs` | The entry point for `gui.mjs` and `tools/`: open (refuses when no user team is named, and a save that doesn't contain the team picked in the GUI, or for `tools/`, `settings.json` → `testSavesTeam`), plans, edits, save | `Session`: `peek`, `open(path, {userTeam})`, `signingDayPlan(locks)`, `applySigningDay(locks)`, `edits()`, `getLeague()`, `save()`, `previewDraftLock`, `applyDraftLock`; read-only helpers `depthTeams`, `depthTeam`, `leagueSummary`, `portalPlayers`, `roleAt`, `whoWantsHim`, `destinations` |
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
| `lib/draft-lock.mjs` | Draft lock (Players Leaving): only players out of eligibility may leave early for the NFL | `planDraftLock`, `applyDraftLock` |
| `lib/gui-plan.mjs` | The GUI's Plan, locks file, saves list, team art | `GUI-PLAN.md` §4.3 |
| `lib/C27_486_1.gz` | `madden-franchise` schema 486.1 for CFB 27 | |

### 4.4 Save writes
- "Board" below = a school's Signing Day board, `Team.CommittedPlayers` (`BOARD_SLOTS` 35; read into `d.boardTeamByPlayerRef`), not its `RecruitingBoard`.
- Only two writers: `RosterEdits` (`lib/roster-edits.mjs`, through `session.edits()`) and `applyDraftLock` (`lib/draft-lock.mjs`). `RosterEdits` refuses the user team and logs every field it writes (`writes`); `applyDraftLock` writes records directly (not in `writes`).
- Every `RosterEdits` method is proven in-game (git `a9ebb41`, `bc0083a`, `5aa36fe`). `CLAUDE.md`: change these formulas only with an in-game re-test.

| Edit | Writes | Used by |
|---|---|---|
| `commitTransfer(p, t)` | `Signed`, 1 offer, on the school's board; the school becomes #1 on his list with the top influence + 10 (a school not on his list replaces his last one) | Signing Day |
| `unsignRecruit(p)` | `Top10`, 0 offers, off the school's board | Signing Day |
| `cutPlayer(p)` | `TeamIndex` 255, `PrevTeamIndex` = his school, off its roster list and every depth chart slot; the game deletes him at the rollover (in-game check, git `a9ebb41`) | Signing Day |
| `movePlayer(p, t)` | The cut, then `TeamIndex` = the new school and onto its roster list; left off its depth chart | Signing Day |
| `applyDraftLock` (built, signed off; git `5aa36fe` `PLAN.md`) | Players with early-draft (`EarlyNFL_*`) rows who are not out of eligibility (Senior not redshirting), not on the user team and not already all Staying: every such row `LeaveStatus` = `Staying`, `PersuadeAttempts` ≥ 1 (what the game writes on a persuade) | `tools/step2-test.mjs` only (Tom: not in the GUI) |

- `applySigningDay` order: un-sign (frees board slots), cuts and moves, commits.
- Save (`session.save()` → `lib/safe-save.mjs` `safeSave`):
  1. Back up to `<save folder>/TTT Backups/<name>__<YYYY-MM-DD_HHMMSS>.bak` (`_2`, `_3`… if taken; SHA-1 checked).
  2. Write the save to the same path with `.saving.tmp` instead of `.bak`.
  3. `Session.verifySaved`: reopens; same stage; same named-player count; when `RosterEdits` made edits, every written field reads back and no record changed that no edit wrote (byte compare with the backup, `changedRecords`).
  4. Rename the temp file over the original.

  If the backup's SHA-1 check fails, the backup is deleted and nothing is written. On any later failure the original is unchanged and the temp file deleted; the backup stays. After a draft lock, `<name>__<YYYY-MM-DD_HHMMSS>.draft-lock.json` beside the backup records who was locked.

### 4.5 Tools and docs
Usage is in each file's first lines.
- Read-only reports: `capacity-check`, `list-journey`, `offers-report`, `step3-report` (depth charts), `step4-report` (team side), `step4b-report` (player side + Top 10), `step5-report` (recruit cleanup).
- Tests on copies: `step1-test` (open, stage, back up and save each test save in a work folder), `step2-test` (draft lock on a copy, saved).
- Read-only check: `step2-check` (a `.draft-lock.json` and a later save: are the locked players still on their teams).
- `extract-ratings-model`: one-time; writes `lib/data/ratings-model.json` from Maxi's Dynasty Progression Monitor & Planner page.
- `gui-mockup-data` (`GUI-PLAN.md` §8.1); `copy-art` (`GUI-PLAN.md` §2.7; Tom's PC).

### 4.6 Baseline numbers
Stock `test_saves/DYNASTY-SIGNINGDAYCOPY` (copy), user team Kansas, no GUI locks, `settings.json` as of this commit (a settings change moves them):
- 138 schools (137 CPU), 16,233 named players; 1,310 uncommitted transfers.
- Planner: the recruit cleanup un-signs 1,535 (`tools/step5-report`); placement makes room by un-signing 682 more recruits, moving 136 and cutting 15 (GUI unsigned = 1,535 + 682).
- GUI summary: placed 1,310 · dropped 0 · unsigned 2,217 · deleted 15 · moved 136. Missouri: IN 16, OUT 22.

## 5. Later (not scheduled; don't start without Tom)
- GUI player card: plan in `GUI-PLAN.md` §9.
- Portal-week mode (weekly commits, list updates): removed in `0593958` for a full redesign; old code in git history.
- AI-run CPU coaches.
- Position limits (the game over-recruits RB and WR).
- When and how players get deleted; real players vs recruits.
- In-game player progression (Tom's own system).
- Next-season OVR with training gains in the projections.
