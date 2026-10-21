# GUI-PLAN.md: Signing Day GUI spec

Spec of the Signing Day GUI (`node gui.mjs`). §0–8 are **Built** (each part names its file or function); §9 (player card) is **Planned**; §10 holds the open questions on the built GUI (code vs spec, code defects). When the GUI changes, update its section here in the same commit. Cite as `GUI-PLAN §n.m`. Tasks: `PLAN.md`; rules and save facts: `CLAUDE.md`.

## 0. Constraints
1. Built for Tom's screen: **2560×1440, 27", Windows scaling 100%, browser full screen.** The sizes in §2 are tuned for it; nothing on screen under 14px.
2. The GUI doesn't change placement rules. Its only `lib/` changes outside `lib/gui-plan.mjs` are the locks (§6) and reads (§7); the player card would add Player reads and the output-only snapshot (§9.5), and the snapshot needs Tom's OK (§9.7 Q2).
3. Works for any dynasty: nothing about one school is hard-coded. The user team is picked per save (§3.2) and never changed.

## 1. Product (Built)
- Local web GUI to: open any CFB 27 dynasty save, pick the user team, build the Signing Day plan, review every CPU team's moves (in and out), undo single moves, save.
- Signing Day only; any other stage gets no actions (§3.2, §5.1).

## 2. Design system (Built: `gui/styles.css`, `gui/views.js`)

### 2.1 Identity
A black, terminal-style college football tool: two accents from the user team's own colors, neon status colors, flat bordered cards, mono uppercase labels. Schools show their logos (helmets on a team's review); big stats use neon scoreboard numerals in Plex Mono; headings and breadcrumbs read like a terminal (`> DYNASTY-… › TEAMS`).

### 2.2 Tokens
CSS custom properties on `:root` (`gui/styles.css`):
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
--accent:      user team primary, exactly as stored in the save (§2.3); CSS default #2BD4FF
--accent-2:    user team secondary, exactly as stored; CSS default #FF8A2B
--accent-ink / --accent-2-ink: #000000 or #FFFFFF, whichever contrasts more with that accent
--sans: "IBM Plex Sans", system-ui, sans-serif
--mono: "IBM Plex Mono", ui-monospace, monospace
--pad:  40px   /* page side padding; 28px at ≤1900px wide */
--cell: 16px   /* table cell side padding; 12px at ≤1900px wide */
```
`color-scheme: dark`.

### 2.3 Accents (`views.js` `accentFrom`, `accentCss`; set as inline style on `<html>`)
- From the picked user team's `Team.TEAM_BACKGROUNDCOLORR/G/B` (primary) and `TEAM_BACKGROUNDCOLORR2/G2/B2` (secondary), unchanged (Kansas: navy `#0E4C90` and red `#CE202F`). On S0, before a plan exists, they follow the team chosen in the dropdown.
- A color under 1.6:1 against black (black, near-black) is skipped: the other color leads and `--accent-2` is `--text`. Same when both colors are equal. With neither usable: `--moved` and `--orange`.
- Team colors can be too dark to read as text on black, so they are used as **fills, edges and underlines**, with `--accent-ink` / `--accent-2-ink` text on fills.
- `--accent`: primary button fill, active menu item tint (30% over `--surface`), save box left edge (4px), selected row tint (22% over `--surface`), text selection.
- `--accent-2`: active menu item's 4px left bar, selected row's 4px left bar, stage pill, active tab underline and count pill, active chip fill, save dialog top edge, the `>` prompt, team-name link underline on hover.
- Sidebar brand mark (`TTT`, 42px square): diagonal split `--accent` / `--accent-2`.
- Focus ring: 2px `--text`, offset 2px (`:focus-visible`). Text inputs and the select show none: on focus their border turns `--text-2`.

### 2.4 Type
Both fonts (SIL OFL) are self-hosted as woff2 in `gui/fonts/` (weights 400, 500, 600, 700; licenses `OFL-IBMPlexSans.txt`, `OFL-IBMPlexMono.txt`); no network at runtime.

| Use | Font | Size / weight |
|---|---|---|
| Body, table cells | IBM Plex Sans | 18px / 400 (tables 17px) |
| Names: save and team links (S0, S2), the sidebar's and S1's user team | IBM Plex Sans | 600; S3 player names 700 (`<b>`) |
| Page title (h1) | IBM Plex Mono | 35px / 600 (team name on S3 38px) |
| Section title (h2) | IBM Plex Mono | 24px / 600 |
| Panel title (h2 in a Panel header) | IBM Plex Mono, UPPERCASE, letter-spacing .08em | 20px / 600; its count 20px / 700 |
| Labels, breadcrumbs, tabs, status tags, chips | IBM Plex Mono, UPPERCASE, letter-spacing .08em | 15px / 600 (column headers 14px) |
| Menu | IBM Plex Mono, UPPERCASE, letter-spacing .06em | 16px / 500 |
| Numbers in tables | IBM Plex Mono, `font-variant-numeric: tabular-nums`, left-aligned like every column | 17px / 500 (code renders 400: §10 Q1) |
| Roster before → after | IBM Plex Mono, tabular-nums | 17px / 500, after 700; S3 header 30px |
| Scoreboard numbers | IBM Plex Mono, in the card's status color with a soft glow (text-shadow 0 0 24px, 35% of the color) | 60px / 700 |
| Buttons | IBM Plex Sans | 17px / 600, height 46px, padding 0 20px; row buttons (`.btn.small`) 16px, height 38px, padding 0 14px |

Line height 1.5 (body); h1 1.2, h2 1.3, scoreboard numbers 1.

### 2.5 Layout and app shell (`views.js` `shell`)
- Spacing: a 4/8px grid was the plan; the CSS sets spacing per component (6, 10, 14, 18, 22px also occur; §10 Q2). Cards: `--surface`, 1px `--border`, radius 4px, padding 22px, no shadows.
- Content max-width 2240px, left-aligned in the main column (at 2560: 2560 − 270 sidebar − scroll bar gutter ≈ 2275px, so about 35px stays empty on the right). Min window 1600×900 (`body` min-width and min-height). At 1900px wide or less (`max-width: 1900px`) the review panels stack (§3.5) and `--pad` / `--cell` shrink (§2.2).
- The page always keeps room for its scroll bar (`html { scrollbar-gutter: stable }`). Only the page scrolls: tables have no scroll box of their own, and each table has fixed column widths (`<colgroup>`, `table-layout: fixed`), so columns never shift with sorting, filters or the team shown.
- Sidebar: 270px, `--surface`, sticky, full height. Top to bottom: brand (`TTT` mark, "Transfer Tools", "SIGNING DAY"); once a plan exists, the save box (user team's TeamMark and name, save file name); menu `Open save`, `Overview`, `Teams`, `Save…` (the last three greyed out without a plan; `Save…` opens S4). Active menu item: 4px `--accent-2` bar on its left plus an `--accent` tint.
- Top bar: 58px, sticky (z-index 5). Breadcrumbs: `>` prompt, then the save file name › Teams › team (`> DYNASTY-… › Teams › Missouri`); S0 `> Open a save`; result screen `> Saved`. On the right: the busy label while a request runs (§3.1), else, once a plan exists, the stage pill (nothing on S0 before Continue or on the Saved screen).
- Errors show as an error notice at the top of the content.

### 2.6 Icons
Tabler Icons (MIT, `gui/icons/LICENSE.txt`), stroke 2.25, 21px (30px in empty states and on the Saved screen); the SVGs used are in `gui/icons/`, drawn as CSS masks so they take the text color. Always beside a text label, never alone (exception: the search box's icon, which has a screen-reader label and the placeholder).

| Icon | Used for |
|---|---|
| `folder-open` | Open save menu item, Open button, Open another save, empty saves list |
| `file` | save name on S1 |
| `layout-dashboard` | Overview menu item |
| `users` | Teams menu item, Review teams, unknown-team empty state |
| `arrow-down-circle` | IN panel (in) |
| `arrow-up-circle` | OUT panel (out), Un-signed result |
| `trash` | Deleted result |
| `arrows-exchange` | Moved result |
| `arrow-back-up` | Undo, KEPT panel |
| `arrow-forward-up` | Restore |
| `check` | Mark reviewed, Saved screen |
| `alert-triangle` | notices (errors, the wrong-stage warning) |
| `device-floppy` | Save… and Save |
| `chevron-left`, `chevron-right` | Previous / Next team; Continue (right) |
| `search` | search box, no-match empty state |
| `filter` | filter chips label |

### 2.7 Team art (Built: `lib/gui-plan.mjs` `teamArt`, `ART_DIRS`; `gui.mjs` `serveArt`; `tools/copy-art.mjs`)
- URL `assets/<path>`, served from `gui/art/` first, then from Tom's DynastyOS asset library (`%USERPROFILE%\Documents\DynastyOS Assets`, ~1.1 GB, only on his PC), read-only, with the same relative paths. Cached by the browser for a day (`max-age=86400`, then revalidated by `Last-Modified`).
- `gui/art/` is a slim copy, committed so cloud sessions can render art. `tools/copy-art.mjs ["<library folder>"]` makes it on Tom's PC (needs `sharp`); re-running replaces it. Contents:
  - `logos-flat-dark/` (149 files) and `helmet/left/` (151 files), unchanged;
  - `playerportrait-files.txt`: every portrait name in the library, sorted (25,527; 5,040 `nilpp_Generic_*`, numbered 1–5040);
  - `playerportrait/` (15,210 files): `nilpp_Unique_*` of players in any `test_saves/` save, matched by player name (`LastFirst`, letters and digits only, any case) or by exact head asset (10,169 files), plus all `nilpp_Generic_*` (5,040) and `nilpp_Blank.webp`; resized to 256×256 webp with alpha, so the player card shows portraits at ≤256px.
- Logos: `logos-flat-dark/tlow_<School>.webp`; helmets: `helmet/left/thel_lthelmets_<School>_result.webp`.
- Match on `Team.LongName`, then the team name (`DisplayName`), with letters and digits only, any case, plus aliases (California → CAL, UConn → Connecticut, East Carolina → ECU, Middle Tennessee → MidTennState, Sam Houston → SamHoustonState, Massachusetts → UMass). All 138 schools of the stock save match a logo and a helmet in `gui/art/`.
- No library or no match: a MonogramTile (§2.8); on S3 no helmet falls back to the TeamMark.

### 2.8 Components (`views.js`)
- **Button:** primary (fill `--accent`, text `--accent-ink`), secondary (1px `--border` outline on `--surface`), danger (`--out` outline; in the CSS, not used yet). Disabled: 45% opacity.
- **ActionBar:** buttons joined edge to edge in one bordered strip; exactly one primary.
- **StatCard:** mono label above a scoreboard number; 4px colored left edge, number in the same color: placed `--in`, dropped `--warn`, un-signed `--orange`, deleted `--out`, moved `--moved`. Min height 160px; the scoreboard grid fits columns of at least 230px.
- **Table:** header row 42px, `--surface-2`, mono labels; rows 46px (S2 rows 47px: the 46px logo plus the divider; 52px with buttons); 1px `--divider`; hover `--surface-2`; every column (headers, numbers, buttons) left-aligned (Tom); cells cut long text with an ellipsis, except OUT's Reason, which wraps.
- **Tabs:** 48px high, mono labels with a count pill, e.g. `CHANGED 132`; active tab underlined 3px `--accent-2`, its count pill filled `--accent-2`.
- **TeamMark:** the school's logo, 46px; else a MonogramTile: 42px square (64px with 19px text in the S3 header), fill = that team's own primary color (contrast-adjusted against its text: white or black, whichever contrasts more, lightness stepped by 5% until 4.5:1; no valid color → `#2B2B38`), `Team.ShortName` (e.g. `KU`, `BAMA`) in mono 15px/700.
- **Helmet** (S3 header): 150px box, scaled 1.25.
- **StatusTag:** mono `[ REVIEWED ]` (`--in`), `[ CHANGED ]` (`--moved`), `[ RE-CHECK ]` (`--warn`), `[ KEPT ]` (`--text-2`), `[ SIGNED COMMIT ]` (`--orange`); no status shows `—`.
- **Roster:** next season's roster as plain mono numbers, before → after: `91 → 85` (before `--text-2`, after bold). No bars or marker lines.
- **Panel:** a bordered box with a 3px colored top edge and a 56px header (icon, mono title, count, hint on the right); not a `.card` (no 22px padding; header side padding `--cell`); used for IN (`--in`), OUT (`--out`), KEPT (`--text-2`).
- **EmptyState:** a 30px icon, one sentence, one button.
- **Notice:** 1px `--warn` border with a 4px left edge and `alert-triangle`; errors in `--out`.
- **Modal:** overlay `rgba(0,0,0,.75)`, z-index 20; box up to 640px wide, `--surface`, 4px `--accent-2` top edge, padding 28px.

## 3. Screens (Built: `views.js` `page`, `gui/app.js`)

### 3.1 Routes and behavior
- One page; screens switch by hash route: `#/start` (S0), `#/overview` (S1), `#/teams` (S2), `#/team/<TeamIndex>` (S3), `#/saved` (S4 result). S4's confirm is a modal over the current screen.
- Without a plan, S1–S3 go to `#/start`; so does `#/saved` without a save result. On load the page waits for `GET /api/plan` (the server keeps the open save across page refreshes) and `GET /api/saves`, with no busy label; a URL without a hash then opens `#/overview` if there is a plan, else `#/start` (a refresh on another route stays there). A route change scrolls to the top.
- One server call at a time (`app.js` `run`): a second action while one runs is dropped. The top bar shows its busy label: `Opening the save…` (open), `Reading the saves folder…` (Refresh), `Building the plan…` (Continue), `Rebuilding the plan…` (Undo, Restore), `Saving…` (Mark reviewed). Continue, Undo, Restore and Mark reviewed are disabled meanwhile; links, tabs, chips and sort stay clickable. The real Save doesn't use `run`: only its modal button reads `Saving…`.

### 3.2 S0 Start
- **Saves list** (`lib/gui-plan.mjs` `listSaves`): `.../Documents/EA SPORTS College Football 27/saves/` under the home folder (Windows: `%USERPROFILE%`), newest first. Columns: Name, Modified. Only `DYNASTY-…` files (profile and playbook files share the folder); hides `*.bak`, `*.tmp`, `*.json` and the `TTT Backups` folder. The folder of the first save shows above the list (none when there are no saves). Click a save to open it; the open save's row is selected. None: EmptyState "No dynasty saves found in the CFB 27 saves folder." with Refresh.
- **Other saves:** a text box to paste any path (surrounding double quotes are dropped), plus **Open** (or Enter).
- **User team:** after a save opens, a dropdown "Your team (never changed)" of every school in the save (sorted by name) picks the user team.
  - Default: the choice remembered for this save path, else `settings.json → userTeam` if it's in the save, else empty.
  - **Continue** is disabled until a team is picked; it builds the plan and opens S1.
  - The choice (team name) is remembered per save path in `gui-state.json` in the app folder (`{"teams": {"<save path>": "<team name>"}}`).
- **Wrong stage:** file, stage and the notice "This tool works on a Signing Day save." instead of the dropdown.

### 3.3 S1 Overview
- **Scoreboard panel** (`--scoreboard`, dot texture) with five StatCards: `TRANSFERS PLACED`, `DROPPED`, `RECRUITS UN-SIGNED`, `PLAYERS DELETED`, `PLAYERS MOVED` (Plan `summary`, §5.2; hyphens don't break).
- **Line under it:** the save name, stage and user team (TeamMark and name), "(your team, never changed)".
- **ActionBar:** `Review teams` (primary, S2), `Save…` (S4).

### 3.4 S2 Teams list
- Every CPU team in the plan ("n CPU teams").
- **Tabs:** `ALL n` · `CHANGED n` · `RE-CHECK n` · `REVIEWED n`; the counts ignore search and chips.
- **Search box:** filters by team name or `ShortName` (part of it, any case). Tab, search, chips and sort persist across screens and reset on Continue; Clear filters also resets the tab to ALL.
- **Filter chips** (toggles, combined): `HAS DELETIONS` (deleted > 0), `ROSTER UNDER 80` (roster after < 80).
- **Table columns:** TeamMark, Team, Prestige, Roster (before → after), In, Out, Deleted, Status.
- **Sorting:** click any header but the TeamMark's. The same header flips the order; a new one starts A–Z for Team and Status (RE-CHECK, CHANGED, REVIEWED, none) and high-first for numbers; Roster sorts by after, then before; ties by team name. Default: Team A–Z.
- **Opening a team:** click a row.
- **No match:** EmptyState "No teams match these filters." with Clear filters.

### 3.5 S3 Team review
- **Header:** helmet (else TeamMark), team name, prestige, status, roster next season (before → after, large).
- **Panels** (no tabs: on a 2560 screen everything about a team fits at once): `IN n` and `OUT n` side by side (widths 9 : 11), `KEPT n` under them; at 1900px wide or less they stack. Rows sorted by OVR, high first, then name.
  - `IN n` (hint "transfers placed here"): transfers placed here and players moved in. (The code's signed-commit rows, tagged `[ SIGNED COMMIT ]`, no longer appear: §10 Q5.) Columns: Player, Pos, OVR, From, Role here.
  - `OUT n` (hint "un-signed, deleted or moved"): recruits un-signed (marked "recruit"), players cut and deleted, players moved away (`Moved → <school>`), each with its reason. Columns: Player, Pos, OVR, Result, Reason.
  - `KEPT n` (hint "undone moves"): undone items (`[ KEPT ]` and what was undone, where the player is now), each with **Restore**. Columns: Player, Pos, OVR, Undone, Now.
  - Empty panels show one line: "No transfers placed here." / "Nobody leaves this team." / "Nothing undone at this team. Undo a move above and it shows here."
- **Undo:** every IN and OUT row has an **Undo** button, except signed commits (undoing one would only get him deleted at the rollover).
- **Footer ActionBar:** `‹ Previous team` · `Mark reviewed` (primary; `Mark not reviewed` on a REVIEWED team) · `Next team ›`, in teams-list order (S2's current tab, search, chips and sort; all teams A–Z when this team is filtered out).
- **Unknown team index:** EmptyState "That team isn't in this plan." with Back to teams.

### 3.6 S4 Save confirm and result
- **Modal** (sidebar `Save…`, enabled on any screen once a plan exists; S1 also has a `Save…` button): "a backup is made first, then the saved file is reopened and checked"; final counts (placed, dropped, un-signed, deleted, moved; `Commits signed` only when > 0), number of undos, number of teams not reviewed (CHANGED or RE-CHECK; in `--warn` if more than 0).
- **Buttons:** `Save` (primary), `Cancel`; Esc cancels; both are disabled while saving.
- **Failure:** the modal stays with "Not saved." and each failure; after an `{ok:false}` answer the plan reloads.
- **After saving:** a result screen (`#/saved`) with the backup path and **Open another save**.

## 4. Server and files (Built)

### 4.1 Server (`gui.mjs`)
- `node gui.mjs` starts a local server (Node `http`, no framework) on 127.0.0.1, port 5178 or the next free one (up to 300 more), and opens the browser (Windows `start`, mac `open`, Linux `xdg-open`; `--no-open` skips it). Windows can reserve whole port ranges (Hyper-V; on Tom's PC 5080–5279), so a blocked port (`EACCES`) counts as taken: there it starts on 5280.
- Routes: `/api/…` (§5), `/assets/…` (§2.7), else a static file from `gui/` (`/` = `index.html`; types html, js, css, svg, woff2, webp, png, txt; anything else 404).
- `gui/` files and API answers are served `no-store`, so a refresh loads the current files.
- In memory: the save opened on S0 (`Session.peek`), the `Session` for the picked team, its locks and review states (§6), and the last planner output. Requests run one at a time, so rebuilds and saves never overlap. Measured in the cloud on the stock copy: `/api/user-team` about 7 s, each undo or restore about 2 s (a full rebuild), save about 7 s.

### 4.2 Front end (`gui/`)
`index.html`, `app.js` (state, API calls, events), `views.js` (screens as pure functions of state, shared with `mockup.html`), `styles.css`, `fonts/`, `icons/`, `art/` (§2.7), `mockup.html` and `mockup-data.js` (§8.1). Plain JS with ES modules, no framework, no build step.
- Every state change re-renders all of `#app` (`innerHTML`); focus and caret are kept only by element `id`, so a new input needs an `id`. The search box re-renders on each keystroke.
- Clicks route through `data-action` attributes and the `actions` map in `app.js` (an `<a>` with `data-action` gets `preventDefault`); a click on a `tr[data-href]` row opens it unless it lands on a link or button.

### 4.3 Data (`lib/gui-plan.mjs`, `lib/session.mjs`)
- All save access goes through `lib/session.mjs`. Save uses the same backup and reopen check as `ttt.mjs` (`session.applySigningDay(locks)`, then `session.save()`; `PLAN.md` §4.4).
- `lib/gui-plan.mjs`: plan building (`rawPlan`, `buildPlan`, `movesOf`), locks file (`locksPath`, `emptyState`, `loadState`, `saveState`, `lockCount`), saves list (`SAVES_DIR`, `listSaves`), team art (`ART_DIR`, `ASSETS_DIR`, `ART_DIRS`, `teamArt`).
- Refuses any path inside `test_saves/` (any folder of that name in the path).

### 4.4 Git
`gui-state.json` and `*.locks.json` are ignored; `gui/art/` is always committed (`!gui/art/**` in `.gitignore`).

## 5. API (JSON; Built: `gui.mjs` `api`)

### 5.1 Calls
| Method | Path | Body | Returns | Errors |
|---|---|---|---|---|
| GET | `/api/saves` | | `[{name, path, modified}]` (`modified` ISO time) | |
| POST | `/api/open` | `{path}` | `{path, fileName, stage:{id, label}, teams:[{index, name, short, colors, logo, helmet}], suggestedUserTeam}` (team index or null, §3.2 default) | 400 no path or under `test_saves/`; 404 no file; 500 not a save |
| POST | `/api/user-team` | `{teamIndex}` | opens the save for that team, loads its locks file, builds the plan; `Plan` | 409 no save open; 400 not Signing Day; 500 unknown or missing `teamIndex` |
| GET | `/api/plan` | | `Plan` | 409 no plan |
| POST | `/api/undo` | `{playerIndex, teamIndex, kind}` | adds a lock (`kind` `"in"` → `notAt`, `"out"` → `keep`, §6), rebuilds, writes the locks file; `Plan` | 400 unknown player or kind |
| POST | `/api/restore` | `{playerIndex, teamIndex}` | removes the lock (that school's `notAt` if there is one, else `keep`), rebuilds, writes the locks file; `Plan` | |
| POST | `/api/review` | `{teamIndex, reviewed}` | stores or clears the team's moves (§6); `Plan` | 404 team not in the plan |
| POST | `/api/save` | | `{ok, backupPath, counts, undos}` or `{ok:false, failed:[…]}` | |

- Every call after `/api/user-team` answers 409 when there is no plan.
- An error answers `{error: "<message>"}` with its status; unknown call 404, bad JSON 400, a body over 1e6 characters 413, anything unexpected 500.
- `/api/save`: `counts` = the Plan `summary`, `undos` = the lock count. On success the locks file is deleted and the session closed. If an edit fails, `failed` lists them and the plan is rebuilt; if the save check fails, the save is reopened for the same team and the plan rebuilt.

### 5.2 Plan
`Plan` = `{save:{fileName, filePath, stage}, summary:{placed, dropped, unsigned, deleted, moved, signed}, userTeam:{index, name, short, colors, logo, helmet}, teams:[{index, name, short, colors, logo, helmet, prestige, rosterBefore, rosterAfter, in:[…], out:[…], kept:[…], counts:{in, out, deleted, kept}, status}], locks:{count}}`.
- `save.stage`: the stage label.
- `summary`: `placed` = `placement.placed` · `dropped` = `placement.unplaced` · `unsigned` = cleanup `unsign` + recruit cuts · `deleted` = cuts with `fate` `Deleted` · `moved` = `placement.moved` · `signed` = `committed` with `sign: true` (counts; `signed` is always 0 now, §10 Q5).
- `teams`: the CPU teams of the plan (not the user team), sorted by name. `rosterBefore` = next season's projected roster before the plan (`getLeague()` `rosterNextSeason`); `rosterAfter` = `placement.teams[].rosterEnd`. `status`: `""` (no moves), `CHANGED`, `REVIEWED`, `RE-CHECK`.
- `colors`: `{primary:"#rrggbb", secondary:"#rrggbb"}` (lowercase). `logo`, `helmet`: an `assets/…` URL or null.

### 5.3 Rows
Every row has `playerIndex, name, pos, ovr`.
- `in`: `from, role, kind` (`placed`, `moved` or `signed`).
- `out`: `kind` (`Recruit` or `Returning`; transfers are never cut), `result` (`Un-signed`, `Moved`, `Deleted`), `to` (school or null), `reason`: `Under <underOverall> OVR` (cleanup), `Room for <name> (<cut reason>)`, or the cut reason alone when no one was placed for it (`board full`, `trim to 85`).
- `kept`: `lock` (`keep` or `notAt`), `undone` (`Un-sign`, `Cut` or `Transfer in`), `now` (`Placed at <school>`, `Un-signed`, `Moved to <school>`, `Deleted`, `Dropped (no school)`, else `Stays`). Shown at the school the undo was made at: `keep` at the recruit's destination or the player's team; `notAt` at each locked school.

### 5.4 Built from `session.signingDayPlan(locks)` (`rawPlan`)
- Recruit cleanup: `unsign`, `underOverall`.
- Placement: `placed`, `moved`, `cuts` (`kind`, `fate`, `reason`, `forName`), `unplaced`, `committed` (the game's commits; no `sign` field since portal-week mode was removed, §10 Q5), `teams`.
- Cut `reason`: `<room> cap`, `board full`, `<rosterMax> limit`, `trim to <rosterMax>` (rosterMax 85). `fate`: `Un-signed`, `Moved → <school> (<role>)`, `Deleted`.

### 5.5 Behavior notes
- `/api/open` drops the open save and plan first (even for the same file, even if the open then fails); `/api/plan` answers 409 until a team is picked again. After a successful save the server forgets the save too.
- `/api/undo` doesn't check `teamIndex` (§10 Q3); kind `"out"` ignores it.
- `/api/restore` never fails: an unknown player or one without a lock still rebuilds and rewrites the locks file.
- `/api/review` doesn't rebuild; any truthy `reviewed` counts as yes.
- The locks file appears on the first undo, restore or review, not when the team is picked.

## 6. Undo = locks (Built)
- **Lock types:**
  - `keep: Set<playerIndex>`: never un-sign or cut this player. Used for undo of an un-signed recruit, a cut or deleted player, or a moved player (OUT rows).
  - `notAt: Map<playerIndex, Set<teamIndex>>`: never place this transfer at this school. Used for undo of a transfer in (IN rows); he may land elsewhere or drop.
- **In the planners:**
  - `planRecruitCleanup(d, league, settings, locks)` skips `keep`.
  - `planPlacement(…, locks)` marks `keep` entries not cuttable and skips `notAt` schools for that player, in the Top 10 pass and in best fit (which also re-offers cut players).
  - `session.signingDayPlan(locks)` and `session.applySigningDay(locks)` pass them through.
  - With no locks, the results are the same as without the locks argument.
- **Rebuilds:** a `REVIEWED` team stores its moves (`movesOf`: sorted player indexes in and out); after a rebuild, a reviewed team whose moves changed shows `RE-CHECK`. Only the player indexes count: a row changing from Moved to Deleted, or a new destination or role, leaves it `REVIEWED`.
- **Persistence:** locks and review states live in `<save>.locks.json` beside the save (never inside it): `{save, keep:[…], notAt:{player:[teams]}, reviewed:{team: moves}}`. It's reloaded when the same save path is opened again, whatever team is picked (its `save` field isn't checked; §10 Q4); unreadable: a console warning and no locks. Deleted after a successful Save.

## 7. Reads and the picked user team (Built)
- **`lib/dynasty.mjs`:** the Team table's first read includes `TEAM_BACKGROUNDCOLORR`, `…G`, `…B`, `…R2`, `…G2`, `…B2`, exposed as `team.colors`; `ShortName` is exposed as `team.short` (`Mascot_AssetName` is empty for 12 of 138 schools; `ShortName` is always filled and unique).
- **`lib/session.mjs`:** `open(path, {userTeam})` takes the picked team (name or index) instead of `settings.userTeam`, and refuses if it isn't in the save. `Session.peek(path)` reads a save's stage and schools (`{index, name, longName, short, colors}`) for S0.
  - The planners (`signing-day.mjs`, `destinations.mjs`) look the user team up by name in `settings.userTeam`. So the session keeps `this.settings = {...settings, userTeam: <picked team's name>}` in memory (`settings.json` is unchanged), and every planner protects the picked team; `RosterEdits` gets its index.
  - The session remembers the pick, so its own reopen after a failed `applySigningDay` keeps the same team.

## 8. Mockup and checks
Mock up a screen change before building it; rerun the checks after any GUI or `lib/` change.

### 8.1 Mockup (Built: `tools/gui-mockup-data.mjs`, `gui/mockup.html`)
- `node tools/gui-mockup-data.mjs "<save copy>" [team]` (refuses `test_saves/`) writes `gui/mockup-data.js` (committed): the real Plan for that copy, with the team shown in full (default Missouri; other teams keep only their counts), one undo (the shown team's first un-signed recruit; Missouri: Caden Madha), four CHANGED teams marked reviewed and a fifth with old moves (RE-CHECK), so every status shows. The home folder is written as `%USERPROFILE%` in the saves list and `plan.save.filePath`; `opened.path` keeps the copy's raw path when the saves folder has no `…SIGNINGDAY` save (always in the cloud).
- `gui/mockup.html` renders the real screens from it: `#/start` (S0), `#/overview` (S1), `#/teams` (S2), `#/team/<index>` (S3; the default), `#/save` (S4 modal). Serve it with `gui.mjs` (`/mockup.html`) so `assets/…` loads.
- Screenshot at 2560×1440: headless Edge on Tom's PC; Playwright with Chromium at `/opt/pw-browsers` in the cloud. Show Tom before building the screen.

### 8.2 Checks
On a copy of `test_saves/DYNASTY-SIGNINGDAYCOPY` (baseline numbers: `PLAN.md` §4.6):
- Picking the `settings.json` team: the overview counts match `ttt.mjs` on the same copy (placed = `place`, unsigned = `un-sign` + `un-sign … recruits`, deleted = `cut`, moved = `move`, dropped = `unplaced`; signed is always 0, §10 Q5). Picking another team: it has no moves, and the `settings.json` team is planned like any CPU team.
- S2 lists 137 CPU teams; search, tabs, sort and filters work. Missouri's IN and OUT match the plan.
- Undo one transfer-in and one un-signed recruit: the plan rebuilds, both move to KEPT, an affected reviewed team shows `RE-CHECK`, and the locks file survives a page refresh. With no locks, the plan matches the planner's output.
- Save: passes the reopen check, the backup exists and the locks file is deleted.

## 9. Player card (Planned)

Click a player in a team's IN, OUT or KEPT rows (S3) and a card about him opens, with his portrait. Inspiration (Tom): The Ringer's NBA Top 100 card, as inspiration only (not its font, voting or photo breaking out of the box): a big name headline with an OVR badge, then small panels. §0–§2 apply as they are (black terminal look, tokens, type sizes, nothing under 14px).

### 9.1 Portraits
**What the save holds** (stock `DYNASTY-SIGNINGDAYCOPY`, fields read in the Player table's first read):
- `Player.GenericHeadAssetName` is the player's head asset. The portrait file is that name with `nilpp_` before it and `.webp` after:
  - `Unique_LegreeJesse_204629` → `nilpp_Unique_LegreeJesse_204629.webp`
  - `Generic_4968_P_T0235_M_6_4` → `nilpp_Generic_4968_P_T0235_M_6_4.webp`
  - A long `<LastFirst>` is cut to 17 characters plus `-` (uncut ones are at most 18), and the file drops the `-`: `Unique_AbdulRahimGladdin-_33048` → `nilpp_Unique_AbdulRahimGladdin_33048.webp`. So: remove a `-` just before the final `_<number>`. 121 players have such a head (29–32 characters long).
- All 16,233 players have one: 13,741 `Unique_…` (10,944 different) and 2,492 `Generic_…` (1,761 different, numbered 1–5039, which fits the library's 5,040 generic files). Only `A–Z a–z 0–9 _ -` occur, at most 32 characters.
- Read a second time after `Dynasty.load`, these fields come back `null` for every player (the save trap); read first, they hold the head names. So the new fields go in the first read (§9.5).
- `PortraitForceSilhouette` (false) and `PortraitSwappableLibraryPath` (`library_icons_brt`) are the same for everyone: ignored.
- **Coverage** (by `gui/art/playerportrait-files.txt`, the list of every portrait in the library): 15,220 of 16,233 players (93.8%) have a file: all 2,492 with generic heads, 2,826 of the 2,828 recruits with unique heads, 9,902 of the 10,913 others. The other 1,013 players (1,011 different heads) have no matching file in the library (e.g. `Unique_WilliamsJace_206927`) and get the blank. `gui/art/playerportrait/` holds the files of 15,107 of the 15,220: `tools/copy-art.mjs` matches by exact head name or by player name (§2.7), so it misses all 113 cut-short heads that have a library file (§9.5); the other 8 cut-short heads have none.
- **Files:** the `gui/art/` copies are 256×256 webp with a transparent background (about 60% of pixels clear), so the team's color shows behind the face. Library originals (lookup case 2) show in the same 256px box.

**Match by head asset name, not by player name:**
- **Recruits wear other players' faces.** HS/JUCO recruits are generated: 2,828 wear another player's unique head and none wear their own (Caden Madha, a TE recruit un-signed at Missouri, wears `Unique_HunterEverett_20148`); 1,272 wear a generic head. A name match gives them nothing, or a namesake's face.
- **Long names are cut** (17 characters plus `-`); the head name (with the `-` rule) still finds the file (113 of the 121; 8 have none), a name match doesn't.
- **No tiebreak needed:** the head name is the exact file. Heads are shared (2,378 unique heads and 522 generic heads are worn by 2+ players); the game draws those players with the same face, and the card does too.
- **Not needed:**
  - `PLYR_PORTRAIT`: the generic number for 2,491 of the 2,492 generic-head players; for unique heads, an id of its own per head (10,944 values), neither `PresentationId` nor the file's number.
  - `PresentationId`: the unique file's number for all 10,913 non-recruits with a unique head.
  - `PLYR_ASSETNAME`: `<LastFirst>_<PresentationId>` for all 12,133 non-recruits (name without punctuation; a few use another form of it, e.g. `AbshireCameron` for Cam Abshire), empty for recruits.
  - `PLYR_GENERICHEAD`: a head enum (e.g. `6_H_BD_01`) whose first digit (1–7) looks like skin tone; `NoHead` for 4,589 players.
  - The generic name's parts (`T0235`, `M`, `6_4`): the whole file name is already in the save.

**Lookup.** When a card opens, the server makes the file name (above) and takes the first case that applies, caching the answer per head:
1. **In `gui/art/playerportrait/`** (the committed slim copy, §2.7): his portrait.
2. **In `gui/art/playerportrait-files.txt`** (read once into a set) **and the DynastyOS library's `playerportrait/` folder is on this PC:** his portrait.
3. **Neither:** `nilpp_Blank.webp` from `gui/art/playerportrait/` (committed, so always there). A monogram (his initials in Plex Mono 96px/700 on the team's primary color, kept readable the same way as team MonogramTiles) only if even that is missing.

A head name that fails `^[A-Za-z0-9_-]{1,32}$` counts as missing. Cases 1 and 2 use the URL `assets/playerportrait/<file>`, which `gui.mjs` already serves from `gui/art/` first, then the library. The server never lists the library folder; the name list replaces the library's manifest (`.dynastyos-library/playerportrait.files.json`).

"The team" (the color behind the portrait or monogram) = the school he ends up at after the plan, else the school of the row clicked.

### 9.2 Card contents
| Part | Shows | Source | New read |
|---|---|---|---|
| Portrait | 256×256 box (the files' own size; never larger) on the team's color | `GenericHeadAssetName` (§9.1) | yes |
| Name | h1, Plex Mono 38px/600 | `p.name` | |
| OVR badge | scoreboard numeral (60px/700, soft glow) in a bordered square; `MAX 94` under it | `p.overall`, `d.maxOverall(p)` | |
| Identity line | `WR · Shifty Route Runner · FR → SO · Impact · 4-star` | `p.position`, `p.archetype`, `p.schoolYear`, `p.redshirt` (RS when he has redshirted), `nextClass(p)`, `p.dev`, `p.stars` | |
| Body line | `#12 · 5'10" · 167 lb · Baltimore, Maryland` | `JerseyNum`, `Height` (inches), `Weight` (stored as lb − 160), `PLYR_HOME_TOWN`, `p.homeState` | 4 fields |
| Move strip | `[logo] Oregon State → [logo] Missouri`, StatusTag, role there (`Starter · WR2`) | raw plan entry: `from`, `team`, `role`, `rank` (his place in the room) | |
| Why | one sentence (§9.3) | raw plan entries, locks | |
| Info | kind (Transfer, HS recruit, JUCO recruit, Returning); ranks (`#49 overall · WR #9`); NIL; his undos (`You undid: transfer in at Missouri`) | `p.recruitClass`, `p.nationalRank`, `p.positionRank`, `BaseNILValue`, the locks | NIL |
| Pitch | his pitch's name; his dealbreaker and pitch categories, each an icon, label and the landing school's grade; dealbreaker met or not | `p.dealbreaker`, `PITCHES[p.pitch]`, `categoryGrade()` (`lib/destinations.mjs`); met from the snapshot | |
| Ratings | `OVR 87 → MAX 94`; six skill groups, each its name, `LV 15/16` and its ratings with the game's short labels (`SPD 93 ACC 95 STA 90 KR 45`) | `d.skillGroupDetail(p)` | |
| Top 5 | his list when his turn came: rank, TeamMark, school, `HIS` (player score), `THEIRS` (team score ÷ 2, so 0–100 as in the combined score), `MATCH` (combined), role there. The landing school is tagged `[ HERE ]`, as a 6th row when it isn't in the top 5 (Best fit) | snapshot from the planner (§9.5) | |

- **Status** (StatusTag and the card's top edge): PLACED `--in`, MOVED `--moved`, SIGNED COMMIT and UN-SIGNED `--orange`, DELETED `--out`, DROPPED `--warn`, STAYS (an undone un-sign or cut) `--text-2`.
- **Hidden parts:** Pitch when he ends up nowhere (un-signed, deleted, dropped). Top 5 when the planner never ranked schools for him (signed commits, recruits).
- **Key ratings** = the six skill groups: they're the game's own progression view, and `skillGroupDetail` already computes them.
- **Category icons** (Tabler, always beside the label, copied into `gui/icons/`): Playing Time `clock`, Proximity to Home `home`, Championship Contender `trophy`, Brand Exposure `speakerphone`, Coach Prestige `user-star`, Coach Stability `anchor`, Conference Prestige `flag`, Program Tradition `books`, Stadium Atmosphere `building-stadium`, Academic Prestige `school`, Campus Lifestyle `confetti`, Athletic Facilities `barbell`, Playing Style `ball-american-football`, Pro Potential `briefcase`. Plus `x` for Close.
- The Plan rows already carry `playerIndex`, so the `Plan` itself doesn't change.

### 9.3 Why line
Built by the server from the raw plan entries (`how`, `cut`, `reason`, `forName`, `fate`) and the locks. Examples are real (stock copy, user team Kansas, no undos):

| Case | Sentence |
|---|---|
| Placed, `Top 10 #n` | `Missouri was #1 on his list when his turn came, with room for him (Starter). Josiah Israel made room.` (Jesse Legree; the second sentence only when the entry has `cut`) |
| Placed, `Best fit` | `No school on his list had room for him; Missouri was his best fit with room (Buried). Brett Le Blanc made room.` (Mario Wofford) |
| Moved | `Cut at Missouri for Zeraun Daniel (S cap); of the schools with room that wanted him, he liked West Virginia most (Rotation).` (Jackson Hancock) |
| Deleted | `Cut at Vanderbilt for Eli Owens (FB cap); no other school had room for him, so he is deleted.` (Jeremy Dugans) |
| Un-signed for a transfer | `Un-signed to make room for Willie Rodriguez (TE cap).` (Caden Madha) |
| Un-signed in the cleanup | `Signed recruit under 60 OVR without the dev trait and ceiling to keep him: un-signed to free his board slot.` (Nathan Dunne) |
| Signed commit | `Committed to <school> in the portal, but the game didn't sign him (he isn't on its board), so the tool signs him and the rollover keeps him.` |
| Dropped (reached from KEPT) | `No school on his list had room for him, so he drops out and the rollover deletes him.` |
| Stays (undone un-sign or cut) | `You undid his un-sign; he stays signed at Missouri.` / `You undid his cut; he stays at Missouri.` |

With no `forName` (the 85 trim, a full board), the reason stands alone: `Cut at <school> to trim the roster to 85; …`.

### 9.4 Interaction and layout
- **Open:** click a player's row in IN, OUT or KEPT (anywhere but its Undo/Restore button), or Tab to his name (a button) and press Enter. The row gets the selected-row tint (`--accent`).
- **Switch:** click another row; the card shows him.
- **Close:** `Close` (× icon with its label), Esc, his row again, or leaving the team (Previous/Next team, breadcrumbs, menu). Not in the URL; a page refresh closes it.
- **Read-only:** no Undo in the card; the row keeps it. After Undo, Restore or Mark reviewed, the plan rebuilds and an open card reloads (his story may have changed).
- **Loading:** the card shows his name from the row and `Loading…`; an error shows as a notice inside the card.
- **Where (2560×1440, 100%):** a drawer fixed to the right edge under the top bar.
  - Size: 840px wide, y 58–1440 (1382px tall). Its right edge is the page's scroll bar gutter (`scrollbar-gutter: stable`, about 17px in Edge at 100%), so it spans about x 1703–2543 on Tom's screen.
  - Look: `--surface`, 1px `--border` left edge, 3px top edge in his status color, padding 28px, no dimming.
  - Measured on the mockup's Missouri page: IN ends at x 1271 and OUT's Player, Pos and OVR columns end at x 1684. With the card open, every row's name stays visible and clickable.
  - At 1900px wide or less the panels stack and the drawer stays 840px; player names stay visible down to the 1600px minimum window.
  - It doesn't scroll with the page. Its body scrolls only on a window shorter than the card. The save modal (z-index 20) still opens above it.
- **Inside, top to bottom** (fits 1382px with no scroll on Tom's screen). Values are Jesse Legree's on the stock copy; `nn` are scores the snapshot will supply, and `met` is format only:

```
┌─ 3px top edge: status color ──────────────────────────────────────────────┐
│ ┌────────────┐  JESSE LEGREE                         ┌──────┐   [x] Close │
│ │            │  WR · Shifty Route Runner             │  87  │             │
│ │  portrait  │  FR → SO · Impact · 4-star            └──────┘             │
│ │  256×256   │  #12 · 5'10" · 167 lb                  MAX 94              │
│ │            │  Baltimore, Maryland                                       │
│ └────────────┘                                                            │
│ [logo] Oregon State  →  [logo] Missouri    [ PLACED ]    Starter · WR2    │
│ WHY  Missouri was #1 on his list when his turn came, with room for him    │
│      (Starter). Josiah Israel made room.                                  │
├─ INFO ───────────────────────────┬─ PITCH: GAMER ─────────────────────────┤
│ Kind    Transfer                 │ [i] Pro Potential  DEALBREAKER  A-  met│
│ Ranks   #49 overall · WR #9      │ [i] Conference Prestige         A+     │
│ NIL     155                      │ [i] Playing Style               D-     │
├─ RATINGS   OVR 87 → MAX 94 ──────┴────────────────────────────────────────┤
│ QUICKNESS        LV 15/16   SPD 93  ACC 95  STA 90  KR 45                 │
│ HANDS            LV 8/17    CAR 71  CTH 88                                │
│ ROUTE RUNNING    LV 11/16   SRR 84  MRR 88  DRR 85  RLS 80                │
│ … (six groups)                                                            │
├─ HIS TOP 5 (WHEN HIS TURN CAME) ──────────────────────────────────────────┤
│ #  SCHOOL               HIS  THEIRS  MATCH  ROLE                          │
│ 1  [logo] Missouri       nn      nn     nn  Starter   [ HERE ]            │
│ 2  …                                                                      │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Type:** section labels mono 15px/600 uppercase (the §2.4 label style); body 17px; table rows 46px; ratings in Plex Mono 17px with tabular numbers, every column left-aligned (§2).

### 9.5 Code changes
- **`lib/dynasty.mjs`** (first read only; see the `CLAUDE.md` save traps): add `GenericHeadAssetName`, `JerseyNum`, `Height`, `Weight`, `PLYR_HOME_TOWN`, `BaseNILValue` to the Player read list. `refreshPlayer` sets `p.head`, `p.jersey`, `p.height` (inches), `p.weight` (lb: stored + 160), `p.homeTown`, `p.nil`.
- **`lib/signing-day.mjs`** (`planPlacement`), output only:
  - Each placed, moved and unplaced entry, and each re-offered cut, keeps the list the planner already computed for him: `top5` (from `w.top10`) and `here` (the landing school's row from `w.teams`, with its list rank or null).
  - Row fields: `teamIndex, team, playerScore, baseScore, combined, role, meets, dealbreakerGrade, pitchGrades`.
  - No rule change; the rest of the plan stays identical. Besides the reads, this is the one `lib/` change outside §6/§7 (Tom's OK needed, §9.7 Q2).
  - Why: without it, the card can only show his list from before placement, which disagrees with the plan. Jesse Legree's top 5 before placement (`destinations()` on the unchanged league) is Ole Miss, Colorado, Stanford, Texas Tech, TCU (Missouri 11th), but when his turn came Missouri was #1 and he was placed there.
- **`lib/gui-plan.mjs`:** `playerCard(session, raw, state, playerIndex)` returns `PlayerCard`; `whyLine(…)` (§9.3); `playerPortrait(head)` (§9.1 lookup).
- **`gui.mjs`:** `GET /api/player?index=<playerIndex>` returns `PlayerCard`, with a 409 when there's no plan and a 404 for an unknown player.
  - The request handler passes the query string to GET handlers (`Object.fromEntries(url.searchParams)`, one line; today GET handlers get `{}`), so the exact-match handler table stays. That's why it's a query and not `/api/player/<index>`.
- **`gui/views.js`:** IN/OUT/KEPT rows get `data-action="card" data-player="…"` and names become buttons; `shell` draws `cardView(ui.card)` next to the save modal; the category icon map and rating labels live here.
- **`gui/app.js`:** `ui.card = {playerIndex, loading, data, error}`. Open, switch, close and Esc; close on `hashchange`; reload after undo, restore and review. Card loads skip the busy label: they're read-only and don't block other buttons.
- **`gui/styles.css`:** `.drawer`, `.portrait`, `.ovr-badge`, card sections; the open card's row reuses `tr.selected` (§2.3).
- **`gui/icons/`:** `x` and the 14 category icons (§9.2).
- **`tools/gui-mockup-data.mjs`, `gui/mockup.html`:** card data for the shown team's players; clicking a row opens the card, as in the app.
- **`tools/copy-art.mjs`:** use the same head-to-file rule (drop the `-`), then re-run on Tom's PC, so `gui/art/` also gets the 113 cut-short heads' portraits.
- **This file:** once built, the API row goes in §5.1, the card in §3.5 (S3), and §9 is marked Built.

`PlayerCard` = `{index, name, pos, archetype, year, nextYear, redshirt, dev, stars, ranks:{national, position}, kind, jersey, height, weight, homeTown, homeState, nil, ovr, max, groups:[{name, level, cap, ratings:[{label, value}]}], portrait:{src, blank}|null, initials, status, from, to, role, rank, why, pitch:{name, school, categories:[{id, label, grade, dealbreaker, met}]}|null, top5:[{…team, rank, his, theirs, match, role, here}]|null, undos:[{undone, at}]}`. `from` and `to` = `{index, name, short, colors, logo}` or null.

### 9.6 Build steps and acceptance
Named players (a copy of `DYNASTY-SIGNINGDAYCOPY`, user team Kansas, no undos, Missouri's page):
- **Jesse Legree** (WR 87, player 13851): placed `Top 10 #1` from Oregon State, Starter · WR2; own head `Unique_LegreeJesse_204629`. Missouri isn't in his top 5 before placement (§9.5; the snapshot test).
- **Mario Wofford** (FB 69, 6934): placed `Best fit` from Duke, Buried; generic head `Generic_4968_P_T0235_M_6_4`.
- **Caden Madha** (TE 65 recruit, 3498): un-signed for Willie Rodriguez (TE cap); borrowed head `Unique_HunterEverett_20148`.
- **Jackson Hancock** (FS 71, 13344): cut at Missouri for Zeraun Daniel (S cap), moved to West Virginia (Rotation).

1. **Data:** the reads, the snapshot and `playerCard`. Proof on a fresh copy:
   - The `ttt.mjs` counts and the GUI plan's summary are unchanged.
   - The plan JSON with `top5`/`here` removed equals today's.
   - The card JSON for the four players matches the bullets above.
2. **Mockup:** the card in `gui/mockup.html` for Missouri's players, screenshot at 2560×1440. The mockup data keeps its one undo (Caden Madha), so his card shows the STAYS story and Mario Wofford lands elsewhere; the step 1 checks use the plan with no undos. The four players' portraits are in `gui/art/`, so the cloud screenshot shows them. **Stop and show Tom.**
3. **Live:** the API and the drawer. On a copy: open, switch, Esc and Close work. After an Undo of Jesse Legree's row, his card reloads with the new story and the row is in KEPT.
4. **Tom in-game:** the four portraits match the faces in the game.

### 9.7 Open questions for Tom
1. **NIL:** what is `BaseNILValue` in the game? What unit, and what do negative values mean (956 players are negative, −5 to −255; the range is −255 to 440)? Show it, `CurrentNILCompensation` (0–510 here), or leave NIL off?
2. **Top 5 snapshot:** OK to make the output-only change to `lib/signing-day.mjs` (§9.5)? Without it, the Top 5 panel goes.
3. **Extras:** keep jersey number, height, weight and hometown? They're four cheap reads.
4. **No portrait file:** the blank (as planned) or the monogram?
5. **Moved: who made room?** A moved player's entry also has `cut` (Jackson Hancock: Rodney Geter at West Virginia). Add "… made room." as for placed players?

## 10. Built GUI vs this spec (open questions for Tom)
1. **Numbers in tables:** §2.4 says 17px / 500, but `gui/styles.css` `.num` sets no weight, so they render at 400 (the Roster numbers are 500). Fix the CSS or the spec?
2. **Spacing:** keep the 4/8px grid as the rule for new work, or drop it (§2.5)?
3. **Undo without `teamIndex` corrupts the locks file** (code defect): `gui.mjs` `/api/undo` with kind `"in"` and no `teamIndex` stores `NaN`, saved as `null`, which reloads as team 0 (the player shows in Air Force's KEPT). The GUI always sends it. Validate it?
4. **Locks follow the save path, not the team:** picking another user team for the same save reuses its undos and reviews (§6). Intended?
5. **Inert signed-commit pieces** (portal-week mode removed, `PLAN.md` §5): the planner no longer sets `committed[].sign`, so `summary.signed` is always 0, and the `[ SIGNED COMMIT ]` IN rows (§2.8, §3.5, with their Undo exception) and S4's `Commits signed` (§3.6) never show. Code: `lib/gui-plan.mjs` (the `kind: "signed"` rows, `summary.signed`), `gui/views.js` (the tag, `Commits signed`), `gui/styles.css` `.tag.SIGNED`. Remove them in a GUI task?
