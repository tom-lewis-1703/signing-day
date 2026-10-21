# GUI-PLAN.md: GUI engine spec

What the GUI's screens run on: the server, API, undo locks, reads, team art and the player card's data. The front end (`gui/` pages, styles, scripts) is being redesigned (`PLAN.md` task list); until then `node gui.mjs` serves the API and art only. When the engine changes, update its section here in the same commit. Cite as `GUI-PLAN §n.m`. Tasks: `PLAN.md`; rules and save facts: `CLAUDE.md`.

## 1. Rules
1. Tom's screen: 2560×1440, 27", Windows scaling 100%, browser full screen.
2. The GUI doesn't change placement rules. Its only `lib/` changes outside `lib/gui-plan.mjs` are the locks (§4), the reads (§5) and the card's reads and snapshot (§6).
3. Works for any dynasty: nothing about one school is hard-coded. The user team is picked per save; Signing Day leaves it out.
4. Signing Day saves only; any other stage gets no actions (§3.1).

## 2. Server and files

### 2.1 Server (`gui.mjs`)
- `node gui.mjs` starts a local server (Node `http`, no framework) on 127.0.0.1, port 5178 or the next free one (up to 300 more), and opens the browser (Windows `start`, mac `open`, Linux `xdg-open`; `--no-open` skips it). Windows can reserve whole port ranges (Hyper-V; on Tom's PC 5080–5279), so a blocked port (`EACCES`) counts as taken: there it starts on 5280.
- Routes: `/api/…` (§3), `/assets/…` (§2.3), else a static file from `gui/` (`/` = `index.html`; types html, js, css, svg, woff2, webp, png, txt; anything else 404). POST handlers get the JSON body, GET handlers the query string.
- `gui/` files and API answers are served `no-store`.
- In memory: the opened save (`Session.peek`), the `Session` for the picked team, its locks and review states (§4), and the last planner output. Requests run one at a time, so rebuilds and saves never overlap. Measured in the cloud on the stock copy: `/api/user-team` about 7 s, each undo or restore about 2 s (a full rebuild), save about 7 s.

### 2.2 Data (`lib/gui-plan.mjs`, `lib/session.mjs`)
- All save access goes through `lib/session.mjs`. Save uses the backup and reopen check (`session.applySigningDay(locks)`, then `session.save()`; `PLAN.md` §4.4).
- `lib/gui-plan.mjs`: plan building (`rawPlan`, `buildPlan`, `movesOf`), locks file (`locksPath`, `emptyState`, `loadState`, `saveState`, `lockCount`), saves list (`SAVES_DIR`, `listSaves`), team art (`ART_DIR`, `ASSETS_DIR`, `ART_DIRS`, `teamArt`), player card (`playerCard`, `whyLine`, `playerPortrait`, `portraitFile`).
- Saves list (`listSaves`): `.../Documents/EA SPORTS College Football 27/saves/` under the home folder, newest first; only `DYNASTY-…` files; hides `*.bak`, `*.tmp`, `*.json` and the `TTT Backups` folder.
- The picked team is remembered per save path in `gui-state.json` in the app folder (`{"teams": {"<save path>": "<team name>"}}`) and returned as `suggestedUserTeam`.
- Refuses any path inside `test_saves/` (any folder of that name in the path).
- Git: `gui-state.json` and `*.locks.json` are ignored; `gui/art/` is always committed (`!gui/art/**` in `.gitignore`).

### 2.3 Team art (`lib/gui-plan.mjs` `teamArt`, `ART_DIRS`; `gui.mjs` `serveArt`; `tools/copy-art.mjs`)
- URL `assets/<path>`, served from `gui/art/` first, then from Tom's DynastyOS asset library (`%USERPROFILE%\Documents\DynastyOS Assets`, ~1.1 GB, only on his PC), read-only, with the same relative paths. Cached by the browser for a day (`max-age=86400`, then revalidated by `Last-Modified`).
- `gui/art/` is a slim copy, committed so cloud sessions can render art. `tools/copy-art.mjs ["<library folder>"]` makes it on Tom's PC (needs `sharp`); re-running replaces it. Contents:
  - `logos-flat-dark/` (149 files) and `helmet/left/` (151 files), unchanged;
  - `playerportrait-files.txt`: every portrait name in the library, sorted (25,527; 5,040 `nilpp_Generic_*`, numbered 1–5040);
  - `playerportrait/` (15,210 files): `nilpp_Unique_*` of players in any `test_saves/` save, matched by player name (`LastFirst`, letters and digits only, any case) or by head asset (§6.1), plus all `nilpp_Generic_*` (5,040) and `nilpp_Blank.webp`; 256×256 webp with alpha.
- Logos: `logos-flat-dark/tlow_<School>.webp`; helmets: `helmet/left/thel_lthelmets_<School>_result.webp`.
- Match on `Team.LongName`, then the team name (`DisplayName`), with letters and digits only, any case, plus aliases (California → CAL, UConn → Connecticut, East Carolina → ECU, Middle Tennessee → MidTennState, Sam Houston → SamHoustonState, Massachusetts → UMass). All 138 schools of the stock save match a logo and a helmet in `gui/art/`. No match: `logo`/`helmet` null.

## 3. API (JSON; `gui.mjs` `api`)

### 3.1 Calls
| Method | Path | Body / query | Returns | Errors |
|---|---|---|---|---|
| GET | `/api/saves` | | `[{name, path, modified}]` (`modified` ISO time) | |
| POST | `/api/open` | `{path}` | `{path, fileName, stage:{id, label}, teams:[{index, name, short, colors, logo, helmet}], suggestedUserTeam}` (team index or null) | 400 no path or under `test_saves/`; 404 no file; 500 not a save |
| POST | `/api/user-team` | `{teamIndex}` | opens the save for that team, loads its locks file, builds the plan; `Plan` | 409 no save open; 400 not Signing Day; 500 unknown or missing `teamIndex` |
| GET | `/api/plan` | | `Plan` | 409 no plan |
| GET | `/api/player` | `?index=<playerIndex>` | `PlayerCard` (§6.4), from the last planner output | 409 no plan; 404 unknown player |
| POST | `/api/undo` | `{playerIndex, teamIndex, kind}` | adds a lock (`kind` `"in"` → `notAt`, `"out"` → `keep`, §4), rebuilds, writes the locks file; `Plan` | 400 unknown player, team (kind `"in"`) or kind |
| POST | `/api/restore` | `{playerIndex, teamIndex}` | removes the lock (that school's `notAt` if there is one, else `keep`), rebuilds, writes the locks file; `Plan` | |
| POST | `/api/review` | `{teamIndex, reviewed}` | stores or clears the team's moves (§4); `Plan` | 404 team not in the plan |
| POST | `/api/save` | | `{ok, backupPath, counts, undos}` or `{ok:false, failed:[…]}` | |

- Every call after `/api/user-team` answers 409 when there is no plan.
- An error answers `{error: "<message>"}` with its status; unknown call 404, bad JSON 400, a body over 1e6 characters 413, anything unexpected 500.
- `/api/save`: `counts` = the Plan `summary`, `undos` = the lock count. On success the locks file is deleted and the session closed. If an edit fails, `failed` lists them and the plan is rebuilt; if the save check fails, the save is reopened for the same team and the plan rebuilt.

### 3.2 Plan
`Plan` = `{save:{fileName, filePath, stage}, summary:{placed, dropped, unsigned, deleted, moved}, userTeam:{index, name, short, colors, logo, helmet}, teams:[{index, name, short, colors, logo, helmet, prestige, rosterBefore, rosterAfter, in:[…], out:[…], kept:[…], counts:{in, out, deleted, kept}, status}], locks:{count}}`.
- `save.stage`: the stage label.
- `summary`: `placed` = `placement.placed` · `dropped` = `placement.unplaced` · `unsigned` = cleanup `unsign` + recruit cuts · `deleted` = cuts with `fate` `Deleted` · `moved` = `placement.moved` (counts).
- `teams`: the CPU teams of the plan (not the user team), sorted by name. `rosterBefore` = next season's projected roster before the plan (`getLeague()` `rosterNextSeason`); `rosterAfter` = `placement.teams[].rosterEnd`. `status`: `""` (no moves), `CHANGED`, `REVIEWED`, `RE-CHECK`.
- `colors`: `{primary:"#rrggbb", secondary:"#rrggbb"}` (lowercase). `logo`, `helmet`: an `assets/…` URL or null.

### 3.3 Rows
Every row has `playerIndex, name, pos, ovr`.
- `in`: `from, role, kind` (`placed` or `moved`).
- `out`: `kind` (`Recruit` or `Returning`; transfers are never cut), `result` (`Un-signed`, `Moved`, `Deleted`), `to` (school or null), `reason`: `Under <underOverall> OVR` (cleanup), `Room for <name> (<cut reason>)`, or the cut reason alone when no one was placed for it (`board full`, `trim to 85`).
- `kept`: `lock` (`keep` or `notAt`), `undone` (`Un-sign`, `Cut` or `Transfer in`), `now` (`Placed at <school>`, `Un-signed`, `Moved to <school>`, `Deleted`, `Dropped (no school)`, else `Stays`). Listed at the school the undo was made at: `keep` at the recruit's destination or the player's team; `notAt` at each locked school.

### 3.4 Built from `session.signingDayPlan(locks)` (`rawPlan`)
- Recruit cleanup: `unsign`, `underOverall`.
- Placement: `placed`, `moved`, `cuts` (`kind`, `fate`, `reason`, `forName`), `unplaced`, `committed` (the game's commits), `teams`.
- Cut `reason`: `<room> cap`, `board full`, `<rosterMax> limit`, `trim to <rosterMax>` (rosterMax 85). `fate`: `Un-signed`, `Moved → <school> (<role>)`, `Deleted`.

### 3.5 Behavior notes
- `/api/open` drops the open save and plan first (even for the same file, even if the open then fails); `/api/plan` answers 409 until a team is picked again. After a successful save the server forgets the save too.
- `/api/undo` kind `"out"` ignores `teamIndex`.
- `/api/restore` never fails: an unknown player or one without a lock still rebuilds and rewrites the locks file.
- `/api/review` doesn't rebuild; any truthy `reviewed` counts as yes.
- The locks file appears on the first undo, restore or review, not when the team is picked.

## 4. Undo = locks
- **Lock types:**
  - `keep: Set<playerIndex>`: never un-sign or cut this player. Used for undo of an un-signed recruit, a cut or deleted player, or a moved player (OUT rows).
  - `notAt: Map<playerIndex, Set<teamIndex>>`: never place this transfer at this school. Used for undo of a transfer in (IN rows); he may land elsewhere or drop.
- **In the planners:**
  - `planRecruitCleanup(d, league, settings, locks)` skips `keep`.
  - `planPlacement(…, locks)` marks `keep` entries not cuttable and skips `notAt` schools for that player, in the Top 10 pass and in best fit (which also re-offers cut players).
  - `session.signingDayPlan(locks)` and `session.applySigningDay(locks)` pass them through.
  - With no locks, the results are the same as without the locks argument.
- **Rebuilds:** a `REVIEWED` team stores its moves (`movesOf`: sorted player indexes in and out); after a rebuild, a reviewed team whose moves changed shows `RE-CHECK`. Only the player indexes count: a row changing from Moved to Deleted, or a new destination or role, leaves it `REVIEWED`.
- **Persistence:** locks and review states live in `<save>.locks.json` beside the save (never inside it): `{save, keep:[…], notAt:{player:[teams]}, reviewed:{team: moves}}`. It's reloaded when the same save path is opened again, whatever team is picked (its `save` field isn't checked); unreadable: a console warning and no locks. Deleted after a successful Save.

## 5. Reads and the picked user team
- **`lib/dynasty.mjs`:** the Team table's first read includes `TEAM_BACKGROUNDCOLORR`, `…G`, `…B`, `…R2`, `…G2`, `…B2`, exposed as `team.colors`; `ShortName` is exposed as `team.short` (`Mascot_AssetName` is empty for 12 of 138 schools; `ShortName` is always filled and unique).
- **`lib/session.mjs`:** `open(path, {userTeam})` takes the picked team (name or index), and refuses if it isn't in the save. With no team passed it reads `settings.json` → `testSavesTeam` (only the `tools/` scripts, which run on `test_saves` copies); with neither, it refuses. `Session.peek(path)` reads a save's stage and schools (`{index, name, longName, short, colors}`) for picking the team.
  - The planners (`signing-day.mjs`, `destinations.mjs`) look the user team up by name in `settings.userTeam`. So the session keeps `this.settings = {...settings, userTeam: <picked team's name>}` in memory (`settings.json` has no `userTeam`), and every planner leaves the picked team out.
  - The session remembers the pick, so its own reopen after a failed `applySigningDay` keeps the same team.

## 6. Player card data (`lib/gui-plan.mjs` `playerCard`; `GET /api/player`)
Everything about one player of the current plan: who he is, where he ends up and why, his pitch, his ratings, and his list when his turn came.

### 6.1 Portraits (`playerPortrait`, `portraitFile`)
- `Player.GenericHeadAssetName` is the player's head asset; the portrait file is `nilpp_<head>.webp` (`Unique_LegreeJesse_204629` → `nilpp_Unique_LegreeJesse_204629.webp`; `Generic_4968_P_T0235_M_6_4` → `nilpp_Generic_4968_P_T0235_M_6_4.webp`).
- A long `<LastFirst>` is cut to 17 characters plus `-`, and the file drops that `-`: `Unique_AbdulRahimGladdin-_33048` → `nilpp_Unique_AbdulRahimGladdin_33048.webp`. 121 players have such a head; 113 of them have a library file.
- All 16,233 players have one: 13,741 `Unique_…` (10,944 different) and 2,492 `Generic_…` (1,761 different). Only `A–Z a–z 0–9 _ -` occur, at most 32 characters; a head failing `^[A-Za-z0-9_-]{1,32}$` counts as missing.
- Portraits are matched by head asset. Players who share a head show the same face, as in the game; HS/JUCO recruits often wear another player's head (Caden Madha wears `Unique_HunterEverett_20148`).
- Coverage (by `gui/art/playerportrait-files.txt`): 15,220 of 16,233 players have a library file; the other 1,013 get the blank. `gui/art/playerportrait/` lacks the 113 cut-short heads until `tools/copy-art.mjs` is re-run on Tom's PC.
- Lookup, cached per head: 1. the file is in `gui/art/playerportrait/`; 2. it's in `playerportrait-files.txt` and the library's `playerportrait/` folder exists on this PC; both give `{src: "assets/playerportrait/<file>", blank: false}`. 3. Else `nilpp_Blank.webp` (`blank: true`); `null` only if even that is missing (then `initials`). The library folder is never listed.

### 6.2 Fields and sources
"His school" = the school he ends up at after the plan, else the team of his rows (un-signed, deleted, dropped).
- **Identity:** `name`; `pos`; `archetype` (enum words, `MantoMan` = Man to Man); `year` → `nextYear` (`FR → SO`; `RS SO → RS JR` after a redshirt year, `FR → RS FR` while redshirting; recruits `HS`/`JUCO`); `dev`; `stars`. From `p.position`, `p.archetype`, `p.schoolYear`, `p.redshirt`, `nextClass(p)`, `p.dev`, `p.stars`.
- **Body:** `jersey`, `height` (inches), `weight` (lb), `homeTown`, `homeState` (null for `NonUS`). From `JerseyNum`, `Height`, `Weight` (stored as lb − 160), `PLYR_HOME_TOWN`, `p.homeState`.
- **OVR:** `ovr`, `max` (`d.maxOverall(p)`).
- **Move:** `status`, `from`, `to`, `role`, `rank` (room and place, `WR2`), from the raw plan entries. `status`: `PLACED`, `MOVED`, `UN-SIGNED`, `DELETED`, `DROPPED`, `STAYS` (an undone un-sign or cut, or not moved by the plan).
- **Why:** one sentence (§6.3).
- **Info:** `kind` (Transfer, HS recruit, JUCO recruit, Returning); `ranks` (national and position, transfers and recruits only); `undos` (`{undone, at}` from the locks).
- **Pitch:** `{name, school, categories}` at his school: his dealbreaker (`dealbreaker: true`, `met` from the snapshot) then his pitch's other categories (`pitchSecondaries`), each graded with `categoryGrade()` (Playing Time: his role; Proximity to Home: Home/Away). An `Invalid` pitch or dealbreaker counts as none. `null` when he ends up nowhere.
- **Ratings:** `groups` from `d.skillGroupDetail(p)`: name, `level`, `cap`, ratings with the game's short labels (from `lib/data/ratings-model.json`).
- **Top 5:** his list when his turn came, from the snapshot: `rank`, school, `his` (player score), `theirs` (team score ÷ 2, rounded), `match` (combined), `role`, `here` (his school; added as a 6th row when it isn't in the top 5). `null` when the planner never ranked schools for him (recruits, players it doesn't move).
- **Recruiting:** recruits only: `{commitScore, schools}`, the game's list of schools with their `influence`, his school `signed`. From `d.topSchools(p.recruitRecord)`, `p.commitScore`.

### 6.3 Why line (`whyLine`)
Built from the raw plan entries (`how`, `cut`, `reason`, `forName`, `fate`, the snapshot) and the locks. Examples are real (stock copy, user team Kansas, no undos):

| Case | Sentence |
|---|---|
| Placed, `Top 10 #n` | `Missouri was #1 on his list when his turn came, with room for him (Starter). Josiah Israel made room.` (Jesse Legree; the second sentence only when the entry has `cut`) |
| Placed, `Best fit` | `No school on his list had room for him; Missouri was his best fit with room (Buried). Brett Le Blanc made room.` (Mario Wofford) |
| Moved | `Cut at Missouri for Zeraun Daniel (S cap); of the schools with room that wanted him, he liked West Virginia most (Rotation). Rodney Geter made room.` (Jackson Hancock). When his new school's team score is 0: `…; none of the schools with room wanted him; of those, he liked X most (…)`. |
| Deleted | `Cut at Vanderbilt for Eli Owens (FB cap); no other school had room for him, so he is deleted.` (Jeremy Dugans; `…; he is deleted.` when he was never offered elsewhere, `moveCutFrom`) |
| Un-signed for a transfer | `Un-signed to make room for Willie Rodriguez (TE cap).` (Caden Madha) |
| Un-signed in the cleanup | `Signed recruit under 60 OVR without the dev trait and ceiling to keep him: un-signed to free his board slot.` (Nathan Dunne) |
| Game commit | `Committed to <school> in the portal; he is on its board, so the game signs him.` |
| Dropped | `No school on his list had room for him, so he drops out and the rollover deletes him.` |
| Stays | `You undid his un-sign; he stays signed at Missouri.` / `You undid his cut; he stays at Missouri.` |
| Not moved by the plan | `The plan doesn't move him; he stays at <school>.` |

With no `forName` (the 85 trim), the reason stands alone: `Cut at <school> to trim the roster to 85; …`, `Un-signed to trim the roster to 85.`

### 6.4 Code
- **`lib/dynasty.mjs`** (first read only; `CLAUDE.md` save traps): `GenericHeadAssetName`, `JerseyNum`, `Height`, `Weight`, `PLYR_HOME_TOWN`; `refreshPlayer` sets `p.head`, `p.jersey`, `p.height`, `p.weight` (stored + 160), `p.homeTown`.
- **`lib/signing-day.mjs`** (`planPlacement`), output only: each placed, moved and unplaced entry, and each re-offered cut, gets `top5` (the first five of `w.top10`) and `here` (his landing school's row from `w.top10`/`w.teams` with its list rank, or null; null when he lands nowhere). Row fields: `teamIndex, team, rank, playerScore, baseScore, combined, role, meets, dealbreakerGrade, pitchGrades`.
- **`lib/gui-plan.mjs`:** `playerCard(session, raw, state, playerIndex)` (null for an unknown player), `whyLine(d, raw, state, p, entries)`, `playerPortrait(head)`, `portraitFile(head)` (also used by `tools/copy-art.mjs`).

`PlayerCard` = `{index, name, pos, archetype, year, nextYear, redshirt, dev, stars, ranks:{national, position}, kind, jersey, height, weight, homeTown, homeState, ovr, max, groups:[{name, level, cap, ratings:[{label, value}]}], portrait:{src, blank}|null, initials, status, from, to, role, rank, why, pitch:{name, school, categories:[{id, label, grade, dealbreaker, met}]}|null, top5:[{…team, rank, his, theirs, match, role, here}]|null, recruiting:{commitScore, schools:[{…team, rank, influence, signed}]}|null, undos:[{undone, at}]}`. `from`, `to` and `…team` = `{index, name, short, colors, logo}` or null.

### 6.5 Named players
A copy of `DYNASTY-SIGNINGDAYCOPY`, user team Kansas, no undos (`tools/baseline-check.mjs` prints them):
- **Jesse Legree** (WR 87, player 13851): placed `Top 10 #1` at Missouri from Oregon State, Starter · WR2; own head `Unique_LegreeJesse_204629`. With his Missouri transfer undone: placed at TCU (`Top 10 #2`, Starter · WR1).
- **Mario Wofford** (FB 69, 6934): placed `Best fit` at Missouri from Duke, Buried; generic head `Generic_4968_P_T0235_M_6_4`; Missouri is the extra `here` row (his list has two schools).
- **Caden Madha** (TE 65 recruit, 3498): un-signed at Missouri for Willie Rodriguez (TE cap); borrowed head `Unique_HunterEverett_20148`; recruiting list Missouri 559 (signed), Colorado 68, ….
- **Jackson Hancock** (FS 71, 13344): cut at Missouri for Zeraun Daniel (S cap), moved to West Virginia (Rotation · S4).

## 7. Checks
`node tools/baseline-check.mjs [--save]` after any engine or `lib/` change: a fresh copy of `test_saves/DYNASTY-SIGNINGDAYCOPY` in `test_runs/`, the plan summary against the baseline (`PLAN.md` §4.6), and the four named players' cards; `--save` also applies the plan and saves the copy through the backup and reopen check.
