# GUI-PLAN.md: Signing Day GUI (spec for an AI builder)

Read `CLAUDE.md` first; its rules apply unless the prompt that started your chat overrides them. This file is the full spec. Build exactly this; if something isn't covered, choose the simplest option and list it in your final report.

## 0. Guardrails

- References below are **inspiration, not templates**. Combine their best parts into one original design. Never reproduce any one site's layout, colors or branding.
- No features beyond this spec. No placement rule changes in `lib/` except §6 (locks) and §7 (reads).
- Never change the user team. Never write to `test_saves/`; test on a copy in the scratchpad or `test_runs/`.
- If the same problem fails twice, switch to a simpler approach, note it, move on.
- Built for Tom's screen: **2560×1440, 27", Windows scaling 100%, browser full screen.** The sizes in §2 are tuned for it; nothing on screen under 14px.

## 1. Product

Local web GUI to: open any CFB 27 dynasty save, pick the user team, build the Signing Day plan, review every CPU team's moves (in and out), undo single moves, save. Works for any dynasty; nothing about one school is hard-coded.

Signing Day only. For any other stage, show the stage name and "This tool works on a Signing Day save" (no actions).

## 2. Design system (black, terminal look)

**Direction.** A black terminal-style app: the user team's own colors as accents, neon status colors. Inspiration mix:
- **Codecademy:** crisp bordered flat cards; monospace uppercase labels and numbers; a "scoreboard" summary panel with a dot texture; joined action bars with one filled primary button; a thick bar on the active menu item.
- **GitLab:** an app shell with a side menu and breadcrumb bar; tabs with counts; list rows with team marks and counts on the right; a full-width search and filter bar; plain empty states (one icon, one sentence, one button).

Identity: a college football tool. Two accents come from the user team's colors; schools show their logos (helmets on a team's review); big stats use neon scoreboard numerals in Plex Mono; headings and breadcrumbs read like a terminal (`> DYNASTY-… › TEAMS`).

**Tokens** (CSS custom properties on `:root`):
```
--bg:          #000000   /* page */
--surface:     #0B0B10   /* cards, sidebar */
--surface-2:   #16161F   /* hover, raised, table header */
--scoreboard:  #050507   /* overview summary panel; dot texture: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px) 0 0/14px 14px */
--border:      #2B2B38   /* 1px card borders */
--divider:     #1D1D27   /* 1px table rows */
--text:        #F4F4F7
--text-2:      #A6A6B5   /* secondary text */
--in:          #2CF08A   /* transfers in, success, REVIEWED */
--out:         #FF4545   /* deleted, players out */
--warn:        #FFC53D   /* re-check, dropped, warnings */
--moved:       #2BD4FF   /* moved, CHANGED */
--orange:      #FF8A2B   /* un-signed, signed commits */
--accent:      user team primary, exactly as stored in the save (see below)
--accent-2:    user team secondary, exactly as stored
--accent-ink / --accent-2-ink: #000000 or #FFFFFF, whichever contrasts more
```
Accents from the save: `Team.TEAM_BACKGROUNDCOLORR/G/B` (primary) and `TEAM_BACKGROUNDCOLORR2/G2/B2` (secondary) of the picked user team, unchanged (Kansas: navy `#0E4C90` and red `#CE202F`). Team colors can be too dark to read as text on black, so they are used as **fills, edges and underlines**, with `--accent-ink` / `--accent-2-ink` text on fills. A color under 1.6:1 against black (black, near-black) is skipped: the other color leads and `--accent-2` is `--text`; with neither, `--moved` and `--orange`. `--accent` = primary button fill, active menu item tint, save box edge, selected row tint; `--accent-2` = active menu bar, stage pill, active tab underline and count pill, active chip fill, save dialog top edge, the `>` prompt. Focus ring: 2px `--text`.

**Type.** Self-host both fonts (SIL OFL) as woff2 in `gui/fonts/`; no network at runtime.

| Use | Font | Size / weight |
|---|---|---|
| Body, table cells, player and team names | IBM Plex Sans | 18px / 400 (tables 17px) |
| Page title (h1) | IBM Plex Mono | 35px / 600 (team name 38px) |
| Section title (h2) | IBM Plex Mono | 24px / 600 |
| Labels, menu, breadcrumbs, tabs, status tags | IBM Plex Mono, UPPERCASE, letter-spacing .08em | 15px / 600 (column headers 14px) |
| Numbers in tables | IBM Plex Mono, `font-variant-numeric: tabular-nums`, left-aligned like every column | 17px / 500 |
| Scoreboard numbers | IBM Plex Mono, in the card's status color with a soft glow | 60px / 700 |
| Buttons | IBM Plex Sans | 17px / 600, height 46px, padding 0 20px (row buttons 38px) |

Line height 1.5.

**Layout.** 4/8px spacing. Cards: 1px `--border`, radius 4px, padding 20px, no shadows. Content max-width 2240px (fills a 2560 screen); min window 1600×900; under 1900px wide the review panels stack. App shell: sidebar 270px (`--surface`), top bar 58px with breadcrumbs (`> Save › Teams › Missouri`). Active menu item: 4px `--accent-2` bar on its left plus an `--accent` tint.

**Icons.** Tabler Icons (MIT), stroke 2.25, 21px (30px in empty states); copy the SVGs used into `gui/icons/`. Always beside a text label, never alone. Used: `folder-open`, `file`, `layout-dashboard`, `users`, `arrow-down-circle` (in), `arrow-up-circle` (out), `trash` (deleted), `arrows-exchange` (moved), `arrow-back-up` (undo), `arrow-forward-up` (restore), `check` (reviewed), `alert-triangle` (re-check), `device-floppy` (save), `chevron-left`, `chevron-right`, `search`, `filter`.

**Team art.** Tom's DynastyOS asset library (`%USERPROFILE%\Documents\DynastyOS Assets`) is served by the GUI at `assets/…`; it is never copied into the repo. Logos: `logos-flat-dark/tlow_<School>.webp`; helmets: `helmet/left/thel_lthelmets_<School>_result.webp`. Match on `Team.LongName`/`DisplayName` with letters and digits only, plus aliases (California → CAL, UConn → Connecticut, East Carolina → ECU, Middle Tennessee → MidTennState, Sam Houston → SamHoustonState, Massachusetts → UMass). No library or no match: a MonogramTile.

**Components.**
- **Button:** primary (fill `--accent`, text `--accent-ink`), secondary (1px `--border` outline on `--surface`), danger (`--out` outline).
- **ActionBar:** buttons joined edge to edge in one bordered strip; exactly one primary.
- **StatCard:** mono label above a scoreboard number; 4px colored left edge, number in the same color: placed `--in`, dropped `--warn`, un-signed `--orange`, deleted `--out`, moved `--moved`.
- **Table:** header row `--surface-2` with mono labels; rows 46px (52px with buttons); 1px `--divider`; hover `--surface-2`; every column (headers, numbers, buttons) left-aligned.
- **Tabs:** mono labels with a count pill, e.g. `CHANGED 132`; active tab underlined 3px `--accent-2`, its count pill filled `--accent-2`.
- **TeamMark:** the school's logo, 42px; else a MonogramTile: 42px square, fill = that team's own primary color (contrast-adjusted against its text), `Team.ShortName` (e.g. `KU`, `BAMA`) in mono 15px/700.
- **StatusTag:** mono `[ REVIEWED ]` (`--in`), `[ CHANGED ]` (`--moved`), `[ RE-CHECK ]` (`--warn`), `[ KEPT ]` (`--text-2`), `[ SIGNED COMMIT ]` (`--orange`).
- **Roster:** next season's roster as plain mono numbers, before → after: `91 → 85` (after in bold). No bars or marker lines.
- **Panel:** a card with a 3px colored top edge and a header (icon, mono title, count, hint); used for IN (`--in`), OUT (`--out`), KEPT (`--text-2`).
- **EmptyState:** a 28px icon, one sentence, one button.

**Inspiration (Mobbin; links need login; with the Mobbin connector use `search_screens` with the app name, e.g. "Codecademy dashboard", "GitLab projects list"):**
- Codecademy: [dashboard with action bar](https://mobbin.com/screens/df5c6018-fbf8-4473-88ba-4f7c02ba17ad), [dark table with mono headers](https://mobbin.com/screens/f7c1b917-38c1-4e53-96a2-110990ac8fb8), [bordered course card](https://mobbin.com/screens/fc8b8316-e615-4d16-a3ce-974c7ef1a21b).
- GitLab: [projects list with tabs and letter tiles](https://mobbin.com/screens/e5f91dc1-be8d-469a-9fe2-2c33ecab660e), [app shell and cards](https://mobbin.com/screens/fffd9c58-b256-49f1-9519-d5ce97d4f7bf), [empty state](https://mobbin.com/screens/efa952a9-421f-4563-b850-d6d011241062).

## 3. Screens

**S0 Start.**
- **Saves list:** `.../Documents/EA SPORTS College Football 27/saves/` (Windows: `%USERPROFILE%`), newest first. Columns: name and modified time. Only `DYNASTY-…` files (profile and playbook files share the folder); hide `*.bak` and the `TTT Backups` folder.
- **Other saves:** a text box to paste any path, plus **Open**.
- **User team:** after a save opens, a dropdown of every school in the save (sorted by name) picks the user team.
  - Default: the choice remembered for this save path, else `settings.json → userTeam` if it's in the save, else empty.
  - **Continue** is disabled until a team is picked.
  - Remember the choice per save path in `gui-state.json` in the app folder.

**S1 Overview.**
- **Scoreboard panel** (`--scoreboard`, dot texture) with five StatCards: `TRANSFERS PLACED`, `DROPPED`, `RECRUITS UN-SIGNED`, `PLAYERS DELETED`, `PLAYERS MOVED`.
- **Line under it:** the save name, stage and user team (TeamMark and name).
- **ActionBar:** `Review teams` (primary), `Save…`.

**S2 Teams list.**
- **Tabs:** `ALL n` · `CHANGED n` · `RE-CHECK n` · `REVIEWED n`.
- **Search box:** filters by team name.
- **Filter chips:** `HAS DELETIONS`, `ROSTER UNDER 80`.
- **Table columns:** TeamMark, Team, Prestige, Roster (before → after), In, Out, Deleted, Status.
- **Sorting:** click any header to sort.
- **Opening a team:** click a row.

**S3 Team review.**
- **Header:** helmet (else TeamMark), team name, prestige, status, roster next season (before → after, large).
- **Panels** (no tabs: on a 2560 screen everything about a team fits at once): `IN n` and `OUT n` side by side, `KEPT n` under them.
  - `IN n`: transfers placed here, players moved in, plus signed commits (weekly commits the game didn't sign; the tool signs them so the rollover doesn't delete them), tagged `[ SIGNED COMMIT ]`. Columns: player, POS, OVR, from, role here.
  - `OUT n`: recruits un-signed, players cut and deleted, players moved away (with destination), each with its reason.
  - `KEPT n`: undone items (what was undone, where the player is now), each with **Restore**.
- **Undo:** every IN and OUT row has an **Undo** button, except signed commits (undoing one would only get him deleted at the rollover).
- **Footer ActionBar:** `‹ Previous team` · `Mark reviewed` (primary) · `Next team ›`, in teams-list order.

**S4 Save confirm** (modal over S1, S2 or S3):
- **Contents:** final counts, number of undos, number of teams not reviewed (in `--warn` if more than 0).
- **Buttons:** `Save` (primary), `Cancel`.
- **After saving:** a result screen with the backup path and **Open another save**.

## 4. Tech

- **Server:** `node gui.mjs` starts a local server (Node `http`, no new npm dependencies) on port 5178, or the next free one, and opens the browser (Windows `start`, mac `open`, Linux `xdg-open`; `--no-open` skips it). Windows can reserve whole port ranges (Hyper-V; on Tom's PC 5080–5279), so a blocked port counts as taken: there it starts on 5280.
- **Front end:** static files from `gui/` (`index.html`, `app.js`, `views.js` (screens, shared with `mockup.html`), `styles.css`, `fonts/`, `icons/`). Plain JS with ES modules, no framework, no build step. One page; screens switch by hash route (`#/start`, `#/overview`, `#/teams`, `#/team/<index>`, `#/saved`).
- **Team art:** `assets/…` serves image files from the DynastyOS asset library (§2), read-only.
- **Plan building, locks file, saves list, team art:** `lib/gui-plan.mjs`.
- **Data:** all save access goes through `lib/session.mjs`. The same backup and reopen check on Save as `ttt.mjs`. Refuse any path inside `test_saves/`.
- **`.gitignore`:** add `gui-state.json` and `*.locks.json`.

## 5. API (JSON)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/saves` | | `[{name, path, modified}]` |
| POST | `/api/open` | `{path}` | `{fileName, stage, teams:[{index, name, short}], suggestedUserTeam}` |
| POST | `/api/user-team` | `{teamIndex}` | builds the plan; returns `Plan` |
| GET | `/api/plan` | | `Plan` |
| POST | `/api/undo` | `{playerIndex, teamIndex, kind}` | adds a lock, rebuilds; returns `Plan` |
| POST | `/api/restore` | `{playerIndex, teamIndex}` | removes the lock, rebuilds; returns `Plan` |
| POST | `/api/review` | `{teamIndex, reviewed}` | `Plan` |
| POST | `/api/save` | | `{ok, backupPath, counts}` or `{ok:false, failed:[…]}` |

`Plan` = `{save:{fileName, filePath, stage}, summary:{placed, dropped, unsigned, deleted, moved, signed}, userTeam:{index, name, short, colors, logo, helmet}, teams:[{index, name, short, colors, logo, helmet, prestige, rosterBefore, rosterAfter, in:[…], out:[…], kept:[…], counts:{in, out, deleted, kept}, status}], locks:{count}}`.
- **Build it from** `session.signingDayPlan()`:
  - recruit cleanup: `unsign`;
  - placement: `placed`, `moved`, `cuts` (`kind`, `fate`, `reason`), `unplaced`, `committed` (entries with `sign: true` are the signed commits in that team's IN).
- **`colors`:** `{primary:"#rrggbb", secondary:"#rrggbb"}`.

## 6. Undo = locks

- **Lock types:**
  - `keep: Set<playerIndex>`: never un-sign or cut this player. Used for undo of an un-signed recruit, a cut or deleted player, or a moved player.
  - `notAt: Map<playerIndex, Set<teamIndex>>`: never place this transfer at this school. Used for undo of a transfer in; he may land elsewhere or drop.
- **Code changes:**
  - `planRecruitCleanup(d, league, settings, locks)` skips `keep`.
  - `planPlacement(…, locks)` marks `keep` entries not cuttable and skips `notAt` schools for that player, both in the Top 10 pass and in best fit.
  - `session.signingDayPlan(locks)` and `session.applySigningDay(locks)` pass them through.
  - With no locks, results are byte-identical to today's.
- **Rebuilds:** after every rebuild, compare each team's moves (sorted player indexes in and out) with the previous plan. A `REVIEWED` team whose moves changed becomes `RE-CHECK`.
- **Persistence:**
  - Keep locks and review states in `<save>.locks.json` beside the save (never inside it). Reload it when the same save is opened again.
  - Delete it after a successful Save.

## 7. Small read changes

- **`lib/dynasty.mjs`:** add `TEAM_BACKGROUNDCOLORR`, `…G`, `…B`, `…R2`, `…G2`, `…B2` to the Team read list and expose them as `team.colors`; expose `ShortName` (already read) as `team.short`. (`Mascot_AssetName` is empty for 12 of 138 schools; `ShortName` is always filled and unique.) They must be in the first read; see the `CLAUDE.md` save traps.
- **`lib/session.mjs`:** `open(path, {userTeam})` takes the picked team name or index and uses it instead of `settings.userTeam` (still refusing if it isn't found).
  - The planners (`signing-day.mjs`, `destinations.mjs`, `weekly-commits.mjs`) look the user team up by name in `settings.userTeam` themselves. So the session keeps `this.settings = {...settings, userTeam: <picked team's name>}`, and every planner protects the picked team. In memory only; `settings.json` is not changed.
  - The session remembers the pick, so its own reopen after a failed apply (`applySigningDay`) keeps the same team.

## 8. Build steps and acceptance

1. **Mockup:** `gui/mockup.html`, static, with real data dumped from a copy of `test_saves/DYNASTY-SIGNINGDAYCOPY`. It shows S0, S1, S2 and S3 (for Missouri), using the final CSS. Screenshot each screen at 2560×1440 (headless Edge on Tom's PC; Playwright with Chromium at `/opt/pw-browsers` in the cloud). **Stop and show Tom.**
2. **Server, S0 and S1:** opening a copy plus picking the `settings.json` team shows correct overview counts (they match `ttt.mjs` on the same copy). Picking a different team: that team has no moves in the plan, and the `settings.json` team is planned like any CPU team.
3. **S2:** 137 CPU teams listed; search, tabs, sort and filters work.
4. **S3 read-only:** Missouri's IN and OUT match the plan.
5. **Locks:**
   - Undo one transfer-in and one un-signed recruit. The plan rebuilds, the items move to KEPT, and any affected reviewed team shows RE-CHECK.
   - The locks file exists and survives a page refresh.
   - With no locks, the plan equals the old output.
6. **S4 Save:** on a copy, the save passes the reopen check, the backup exists and the locks file is deleted.

## 9. Final report (to Tom)

- How to start it: one line.
- One screenshot per screen.
- What was simplified or skipped.
- Open decisions, for example the Signing Day defaults in `settings.json` → `signingDay` (`recruitCleanup.underOverall`; `placement.placeRoles`, `placement.cutRecruitsFrom`, `placement.deleteOnly`, `placement.moveCutFrom`); don't change them.
- `ttt.mjs` stays as a fallback, unchanged.
