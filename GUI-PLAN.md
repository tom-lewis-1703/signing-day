# GUI-PLAN.md: Signing Day GUI (spec for an AI builder)

Read `CLAUDE.md` first; its rules apply unless the prompt that started your chat overrides them. This file is the full spec. Build exactly this; if something isn't covered, choose the simplest option and list it in your final report.

## 0. Guardrails

- References below are **inspiration, not templates**. Combine their best parts into one original design. Never reproduce any one site's layout, colors or branding.
- No features beyond this spec. No placement rule changes in `lib/` except §6 (locks) and §7 (reads).
- Never change the user team. Never write to `test_saves/`; test on a copy in the scratchpad or `test_runs/`.
- If the same problem fails twice, switch to a simpler approach, note it, move on.
- The user (Tom) reads without glasses: **the size minimums in §2 are hard requirements.**

## 1. Product

Local web GUI to: open any CFB 27 dynasty save, pick the user team, build the Signing Day plan, review every CPU team's moves (in and out), undo single moves, save. Works for any dynasty; nothing about one school is hard-coded.

Signing Day only. For any other stage, show the stage name and "This tool works on a Signing Day save" (no actions).

## 2. Design system (dark mode)

**Direction.** Inspiration mix:
- **Codecademy:** crisp bordered flat cards; monospace uppercase labels and numbers; a dark "scoreboard" summary panel with a dot texture; striped progress bars; joined action bars with one filled primary button; a thick bar on the active menu item.
- **GitLab:** an app shell with a side menu and breadcrumb bar; tabs with counts; list rows with square letter tiles and counts on the right; a full-width search and filter bar; plain empty states (one icon, one sentence, one button).

Identity: a college football tool. The accent is the user team's colors; team short names appear as monogram tiles; big stats use scoreboard-style mono numerals.

**Tokens** (CSS custom properties on `:root`):
```
--bg:          #0E1320   /* page */
--surface:     #161C2C   /* cards, sidebar */
--surface-2:   #1E2638   /* hover, raised, table header */
--scoreboard:  #0A0E18   /* overview summary panel; dot texture: radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px) 0 0/14px 14px */
--border:      #3A4560   /* 2px card borders */
--divider:     #2A3348   /* 1px table rows */
--text:        #F2F4F8
--text-2:      #B8C0D0   /* secondary text; nothing dimmer than this */
--in:          #3DD68C   /* transfers in, success */
--out:         #FF6B6B   /* players out, delete */
--warn:        #FFC145   /* re-check, warnings */
--accent:      user team primary (see below)
--accent-ink:  #0E1320 or #FFFFFF, whichever contrasts more with --accent
--accent-2:    user team secondary (same adjustment)
```
Accent from the save: `Team.TEAM_BACKGROUNDCOLORR/G/B` (primary) and `TEAM_BACKGROUNDCOLORR2/G2/B2` (secondary) of the picked user team. If contrast against `--bg` is under 4.5:1, raise HSL lightness in steps of 5% until it passes; if the primary still fails, use the secondary. Fallback: `#6CB4FF`.

**Type.** Self-host both fonts (SIL OFL) as woff2 in `gui/fonts/`; no network at runtime.

| Use | Font | Size / weight |
|---|---|---|
| Body, table cells | DM Sans | 20px / 400 (tables 18px minimum) |
| Page title (h1) | DM Sans | 40px / 700 |
| Section title (h2) | DM Sans | 28px / 700 |
| Labels, column headers, tabs, status tags | JetBrains Mono, UPPERCASE, letter-spacing .08em | 16px / 600 |
| Numbers in tables | JetBrains Mono, `font-variant-numeric: tabular-nums`, right-aligned with right-aligned headers | 18px / 500 |
| Scoreboard numbers | JetBrains Mono | 64px / 700 |
| Buttons | DM Sans | 18px / 600, height 52px, padding 0 24px |

Line height 1.5. Nothing on screen under 16px.

**Layout.** 8px spacing scale. Cards: 2px `--border`, radius 4px, padding 24px, no shadows. Content max-width 1400px; min window 1280×800. App shell: sidebar 280px (`--surface`), top bar 64px with breadcrumbs (`Save › Teams › Missouri`). Active menu item: 4px `--accent` bar on its left plus `--surface-2`. Focus ring: 3px `--accent`.

**Icons.** Tabler Icons (MIT), stroke 2.25, 24px (32px in empty states); copy the SVGs used into `gui/icons/`. Always beside a text label, never alone. Suggested: `folder-open`, `file`, `shield`, `users`, `arrow-down-circle` (in), `arrow-up-circle` (out), `trash` (deleted), `arrows-exchange` (moved), `arrow-back-up` (undo), `check` (reviewed), `alert-triangle` (re-check), `device-floppy` (save), `chevron-left`, `chevron-right`, `search`, `filter`.

**Components.**
- **Button:** primary (fill `--accent`, text `--accent-ink`), secondary (2px `--border` outline), danger (2px `--out` outline).
- **ActionBar:** buttons joined edge to edge in one bordered strip; exactly one primary.
- **StatCard:** mono label above a scoreboard number; optional colored left edge 4px (in/out/warn).
- **Table:** header row `--surface-2` with mono labels; rows 56px; 1px `--divider`; hover `--surface-2`; numbers right-aligned.
- **Tabs:** mono labels with a count, e.g. `IN 5`; active tab underlined 3px `--accent`.
- **MonogramTile:** 48px square, fill = that team's own primary color (contrast-adjusted against its text), team short name (`Team.Mascot_AssetName`, e.g. `KU`, `LIB`) in mono 16px/700.
- **StatusTag:** mono `[ REVIEWED ]` (`--in`), `[ CHANGED ]` (`--text-2`), `[ RE-CHECK ]` (`--warn`), `[ KEPT ]` (`--text-2`).
- **StripedBar:** roster fill out of 85: a filled part plus a hatched part (`repeating-linear-gradient(45deg, …)`) for room left, with the number `82 / 85` beside it.
- **EmptyState:** a 32px icon, one sentence, one button.

**Inspiration (Mobbin; links need login; with the Mobbin connector use `search_screens` with the app name, e.g. "Codecademy dashboard", "GitLab projects list"):**
- Codecademy: [dashboard with action bar](https://mobbin.com/screens/df5c6018-fbf8-4473-88ba-4f7c02ba17ad), [dark table with mono headers](https://mobbin.com/screens/f7c1b917-38c1-4e53-96a2-110990ac8fb8), [bordered course card](https://mobbin.com/screens/fc8b8316-e615-4d16-a3ce-974c7ef1a21b).
- GitLab: [projects list with tabs and letter tiles](https://mobbin.com/screens/e5f91dc1-be8d-469a-9fe2-2c33ecab660e), [app shell and cards](https://mobbin.com/screens/fffd9c58-b256-49f1-9519-d5ce97d4f7bf), [empty state](https://mobbin.com/screens/efa952a9-421f-4563-b850-d6d011241062).

## 3. Screens

**S0 Start.**
- **Saves list:** `.../Documents/EA SPORTS College Football 27/saves/` (Windows: `%USERPROFILE%`), newest first. Columns: name and modified time. Hide `*.bak` and the `TTT Backups` folder.
- **Other saves:** a text box to paste any path, plus **Open**.
- **User team:** after a save opens, a dropdown of every school in the save (sorted by name) picks the user team.
  - Default: the choice remembered for this save path, else `settings.json → userTeam` if it's in the save, else empty.
  - **Continue** is disabled until a team is picked.
  - Remember the choice per save path in `gui-state.json` in the app folder.

**S1 Overview.**
- **Scoreboard panel** (`--scoreboard`, dot texture) with five StatCards: `TRANSFERS PLACED`, `DROPPED`, `RECRUITS UN-SIGNED`, `PLAYERS DELETED`, `PLAYERS MOVED`.
- **Line under it:** the save name, stage and user team (tile and name).
- **ActionBar:** `Review teams` (primary), `Save…`.

**S2 Teams list.**
- **Tabs:** `ALL n` · `CHANGED n` · `RE-CHECK n` · `REVIEWED n`.
- **Search box:** filters by team name.
- **Filter chips:** `HAS DELETIONS`, `ROSTER UNDER 80`.
- **Table columns:** tile, Team, Prestige, Roster (StripedBar, before → after), In, Out, Deleted, Status.
- **Sorting:** click any header to sort.
- **Opening a team:** click a row.

**S3 Team review.**
- **Header:** tile, team name, prestige, roster StripedBar (before → after).
- **Tabs:**
  - `IN n`: transfers placed here. Columns: player, POS, OVR, from, role here, NIL if any.
  - `OUT n`: recruits un-signed, players cut and deleted, players moved away (with destination), each with its reason.
  - `KEPT n`: undone items, each with **Restore**.
- **Undo:** every IN and OUT row has an **Undo** button.
- **Footer ActionBar:** `‹ Previous team` · `Mark reviewed` (primary) · `Next team ›`, in teams-list order.

**S4 Save confirm** (modal over S1, S2 or S3):
- **Contents:** final counts, number of undos, number of teams not reviewed (in `--warn` if more than 0).
- **Buttons:** `Save` (primary), `Cancel`.
- **After saving:** a result screen with the backup path and **Open another save**.

## 4. Tech

- **Server:** `node gui.mjs` starts a local server (Node `http`, no new npm dependencies) on port 5178, or the next free one, and opens the browser (Windows `start`, mac `open`, Linux `xdg-open`).
- **Front end:** static files from `gui/` (`index.html`, `app.js`, `styles.css`, `fonts/`, `icons/`). Plain JS with ES modules, no framework, no build step. One page; screens switch by hash route (`#/start`, `#/overview`, `#/teams`, `#/team/<index>`).
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

`Plan` = `{summary:{placed, dropped, unsigned, deleted, moved}, userTeam:{index, name, short, colors}, teams:[{index, name, short, colors, prestige, rosterBefore, rosterAfter, in:[…], out:[…], kept:[…], status}], locks}`.
- **Build it from** `session.signingDayPlan()`:
  - recruit cleanup: `unsign`;
  - placement: `placed`, `moved`, `cuts` (`kind`, `fate`, `reason`), `unplaced`, `committed`.
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

- **`lib/dynasty.mjs`:** add `TEAM_BACKGROUNDCOLORR`, `…G`, `…B`, `…R2`, `…G2`, `…B2` and `Mascot_AssetName` to the Team read list, and expose them as `team.colors` and `team.short`. They must be in the first read; see the `CLAUDE.md` save traps.
- **`lib/session.mjs`:** `open(path, {userTeam})` takes the picked team name or index and uses it instead of `settings.userTeam` (still refusing if it isn't found).

## 8. Build steps and acceptance

1. **Mockup:** `gui/mockup.html`, static, with real data dumped from a copy of `test_saves/DYNASTY-SIGNINGDAYCOPY`. It shows S0, S1, S2 and S3 (for Missouri), using the final CSS. Screenshot each screen at 1440×900 (Playwright, Chromium at `/opt/pw-browsers` in the cloud). **Stop and show Tom.**
2. **Server, S0 and S1:** opening a copy plus picking a team shows correct overview counts (they match `ttt.mjs` on the same copy).
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
- Open decisions, for example the Signing Day placement defaults in `settings.json` → `signingDay` (`recruitCleanup.underOverall`, `placeRoles`, `cutRecruitsFrom`, `deleteOnly`, `moveCutFrom`); don't change them.
- `ttt.mjs` stays as a fallback, unchanged.
