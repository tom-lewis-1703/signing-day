# GUI-PLAN.md: Signing Day GUI spec

§1–8 describe the Signing Day GUI as built (`node gui.mjs`). When the GUI changes, update its section here in the same commit. §9 is the player card: planned, not built.

## 0. Constraints

- Built for Tom's screen: **2560×1440, 27", Windows scaling 100%, browser full screen.** The sizes in §2 are tuned for it; nothing on screen under 14px.
- The GUI doesn't change placement rules. Its only `lib/` changes are the locks (§6) and the reads (§7).

## 1. Product

Local web GUI to: open any CFB 27 dynasty save, pick the user team, build the Signing Day plan, review every CPU team's moves (in and out), undo single moves, save. Works for any dynasty; nothing about one school is hard-coded.

Signing Day only. For any other stage, show the stage name and "This tool works on a Signing Day save" (no actions).

## 2. Design system (black, terminal look)

**Identity.** A black, terminal-style college football tool: two accents from the user team's own colors, neon status colors, flat bordered cards, mono uppercase labels. Schools show their logos (helmets on a team's review); big stats use neon scoreboard numerals in Plex Mono; headings and breadcrumbs read like a terminal (`> DYNASTY-… › TEAMS`).

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
Accents from the save: `Team.TEAM_BACKGROUNDCOLORR/G/B` (primary) and `TEAM_BACKGROUNDCOLORR2/G2/B2` (secondary) of the picked user team, unchanged (Kansas: navy `#0E4C90` and red `#CE202F`). Team colors can be too dark to read as text on black, so they are used as **fills, edges and underlines**, with `--accent-ink` / `--accent-2-ink` text on fills. A color under 1.6:1 against black (black, near-black) is skipped: the other color leads and `--accent-2` is `--text`; with neither, `--moved` and `--orange`. `--accent` = primary button fill, active menu item tint, save box edge, selected row tint; `--accent-2` = active menu bar, selected row's 4px left bar, stage pill, active tab underline and count pill, active chip fill, save dialog top edge, the `>` prompt. Focus ring: 2px `--text`.

**Type.** Both fonts (SIL OFL) are self-hosted as woff2 in `gui/fonts/`; no network at runtime.

| Use | Font | Size / weight |
|---|---|---|
| Body, table cells, player and team names | IBM Plex Sans | 18px / 400 (tables 17px) |
| Page title (h1) | IBM Plex Mono | 35px / 600 (team name 38px) |
| Section title (h2) | IBM Plex Mono | 24px / 600 |
| Labels, breadcrumbs, tabs, status tags | IBM Plex Mono, UPPERCASE, letter-spacing .08em | 15px / 600 (column headers 14px) |
| Menu | IBM Plex Mono, UPPERCASE, letter-spacing .06em | 16px / 500 |
| Numbers in tables | IBM Plex Mono, `font-variant-numeric: tabular-nums`, left-aligned like every column | 17px / 500 |
| Scoreboard numbers | IBM Plex Mono, in the card's status color with a soft glow | 60px / 700 |
| Buttons | IBM Plex Sans | 17px / 600, height 46px, padding 0 20px (row buttons 38px) |

Line height 1.5.

**Layout.** 4/8px spacing. Cards: 1px `--border`, radius 4px, padding 22px, no shadows. Content max-width 2240px (fills a 2560 screen); min window 1600×900; under 1900px wide the review panels stack. App shell: sidebar 270px (`--surface`), top bar 58px with breadcrumbs (`> Save › Teams › Missouri`). Active menu item: 4px `--accent-2` bar on its left plus an `--accent` tint. The page always keeps room for its scroll bar (`scrollbar-gutter: stable`).

**Icons.** Tabler Icons (MIT), stroke 2.25, 21px (30px in empty states); the SVGs used are in `gui/icons/`. Always beside a text label, never alone. Used: `folder-open`, `file`, `layout-dashboard`, `users`, `arrow-down-circle` (in), `arrow-up-circle` (out), `trash` (deleted), `arrows-exchange` (moved), `arrow-back-up` (undo), `arrow-forward-up` (restore), `check` (reviewed), `alert-triangle` (re-check), `device-floppy` (save), `chevron-left`, `chevron-right`, `search`, `filter`.

**Team art.** The GUI serves art at `assets/…` from `gui/art/` first, then from Tom's DynastyOS asset library (`%USERPROFILE%\Documents\DynastyOS Assets`, ~1.1 GB, only on his PC). `gui/art/` is a slim copy, committed so cloud sessions can render art, made by `tools/copy-art.mjs` on Tom's PC with the library's relative paths: `logos-flat-dark/` and `helmet/left/` unchanged, `playerportrait-files.txt` (every portrait name in the library), and the portraits of players in `test_saves/` plus all `nilpp_Generic_*` and `nilpp_Blank`, resized to 256×256 webp with alpha, so the player card shows portraits at ≤256px. Logos: `logos-flat-dark/tlow_<School>.webp`; helmets: `helmet/left/thel_lthelmets_<School>_result.webp`. Match on `Team.LongName`/`DisplayName` with letters and digits only, plus aliases (California → CAL, UConn → Connecticut, East Carolina → ECU, Middle Tennessee → MidTennState, Sam Houston → SamHoustonState, Massachusetts → UMass). No library or no match: a MonogramTile.

**Components.**
- **Button:** primary (fill `--accent`, text `--accent-ink`), secondary (1px `--border` outline on `--surface`), danger (`--out` outline).
- **ActionBar:** buttons joined edge to edge in one bordered strip; exactly one primary.
- **StatCard:** mono label above a scoreboard number; 4px colored left edge, number in the same color: placed `--in`, dropped `--warn`, un-signed `--orange`, deleted `--out`, moved `--moved`.
- **Table:** header row `--surface-2` with mono labels; rows 46px (52px with buttons); 1px `--divider`; hover `--surface-2`; every column (headers, numbers, buttons) left-aligned.
- **Tabs:** mono labels with a count pill, e.g. `CHANGED 132`; active tab underlined 3px `--accent-2`, its count pill filled `--accent-2`.
- **TeamMark:** the school's logo, 46px; else a MonogramTile: 42px square, fill = that team's own primary color (contrast-adjusted against its text), `Team.ShortName` (e.g. `KU`, `BAMA`) in mono 15px/700.
- **StatusTag:** mono `[ REVIEWED ]` (`--in`), `[ CHANGED ]` (`--moved`), `[ RE-CHECK ]` (`--warn`), `[ KEPT ]` (`--text-2`), `[ SIGNED COMMIT ]` (`--orange`).
- **Roster:** next season's roster as plain mono numbers, before → after: `91 → 85` (after in bold). No bars or marker lines.
- **Panel:** a card with a 3px colored top edge and a header (icon, mono title, count, hint); used for IN (`--in`), OUT (`--out`), KEPT (`--text-2`).
- **EmptyState:** a 30px icon, one sentence, one button.

## 3. Screens

**S0 Start.**
- **Saves list:** `.../Documents/EA SPORTS College Football 27/saves/` (Windows: `%USERPROFILE%`), newest first. Columns: name and modified time. Only `DYNASTY-…` files (profile and playbook files share the folder); hide `*.bak` and the `TTT Backups` folder.
- **Other saves:** a text box to paste any path, plus **Open**.
- **User team:** after a save opens, a dropdown of every school in the save (sorted by name) picks the user team.
  - Default: the choice remembered for this save path, else `settings.json → userTeam` if it's in the save, else empty.
  - **Continue** is disabled until a team is picked.
  - The choice is remembered per save path in `gui-state.json` in the app folder.

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

- **Server:** `node gui.mjs` starts a local server (Node `http`, no framework) on port 5178, or the next free one, and opens the browser (Windows `start`, mac `open`, Linux `xdg-open`; `--no-open` skips it). Windows can reserve whole port ranges (Hyper-V; on Tom's PC 5080–5279), so a blocked port counts as taken: there it starts on 5280.
- **Front end:** static files from `gui/` (`index.html`, `app.js`, `views.js` (screens, shared with `mockup.html`), `styles.css`, `fonts/`, `icons/`). Plain JS with ES modules, no framework, no build step. One page; screens switch by hash route (`#/start`, `#/overview`, `#/teams`, `#/team/<index>`, `#/saved`). `gui/` files are served no-store, so a refresh loads the current files.
- **Team art:** `assets/…` serves image files from `gui/art/` (slim copies made by `tools/copy-art.mjs`), else the DynastyOS asset library (§2), read-only; cached by the browser for a day.
- **Plan building, locks file, saves list, team art:** `lib/gui-plan.mjs`.
- **Data:** all save access goes through `lib/session.mjs`. The same backup and reopen check on Save as `ttt.mjs`. Refuse any path inside `test_saves/`.
- **Git:** `gui-state.json` and `*.locks.json` are ignored; `gui/art/` is always committed.

## 5. API (JSON)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/api/saves` | | `[{name, path, modified}]` |
| POST | `/api/open` | `{path}` | `{path, fileName, stage:{id, label}, teams:[{index, name, short, colors, logo, helmet}], suggestedUserTeam}` |
| POST | `/api/user-team` | `{teamIndex}` | builds the plan; returns `Plan` |
| GET | `/api/plan` | | `Plan` |
| POST | `/api/undo` | `{playerIndex, teamIndex, kind}` | adds a lock, rebuilds; returns `Plan` |
| POST | `/api/restore` | `{playerIndex, teamIndex}` | removes the lock, rebuilds; returns `Plan` |
| POST | `/api/review` | `{teamIndex, reviewed}` | `Plan` |
| POST | `/api/save` | | `{ok, backupPath, counts, undos}` or `{ok:false, failed:[…]}` |

`Plan` = `{save:{fileName, filePath, stage}, summary:{placed, dropped, unsigned, deleted, moved, signed}, userTeam:{index, name, short, colors, logo, helmet}, teams:[{index, name, short, colors, logo, helmet, prestige, rosterBefore, rosterAfter, in:[…], out:[…], kept:[…], counts:{in, out, deleted, kept}, status}], locks:{count}}`.
- **Built from** `session.signingDayPlan()`:
  - recruit cleanup: `unsign`;
  - placement: `placed`, `moved`, `cuts` (`kind`, `fate`, `reason`), `unplaced`, `committed` (entries with `sign: true` are the signed commits in that team's IN).
- **`colors`:** `{primary:"#rrggbb", secondary:"#rrggbb"}`.

## 6. Undo = locks

- **Lock types:**
  - `keep: Set<playerIndex>`: never un-sign or cut this player. Used for undo of an un-signed recruit, a cut or deleted player, or a moved player.
  - `notAt: Map<playerIndex, Set<teamIndex>>`: never place this transfer at this school. Used for undo of a transfer in; he may land elsewhere or drop.
- **In the planners:**
  - `planRecruitCleanup(d, league, settings, locks)` skips `keep`.
  - `planPlacement(…, locks)` marks `keep` entries not cuttable and skips `notAt` schools for that player, both in the Top 10 pass and in best fit.
  - `session.signingDayPlan(locks)` and `session.applySigningDay(locks)` pass them through.
  - With no locks, the results are the same as without the locks argument.
- **Rebuilds:** a `REVIEWED` team stores its moves (sorted player indexes in and out); after a rebuild, a reviewed team whose moves changed shows `RE-CHECK`.
- **Persistence:** locks and review states live in `<save>.locks.json` beside the save (never inside it). It's reloaded when the same save is opened again and deleted after a successful Save.

## 7. Reads and the picked user team

- **`lib/dynasty.mjs`:** the Team table's first read includes `TEAM_BACKGROUNDCOLORR`, `…G`, `…B`, `…R2`, `…G2`, `…B2`, exposed as `team.colors`; `ShortName` is exposed as `team.short` (`Mascot_AssetName` is empty for 12 of 138 schools; `ShortName` is always filled and unique).
- **`lib/session.mjs`:** `open(path, {userTeam})` takes the picked team (name or index) instead of `settings.userTeam`, and refuses if it isn't in the save.
  - The planners (`signing-day.mjs`, `destinations.mjs`, `weekly-commits.mjs`) look the user team up by name in `settings.userTeam`. So the session keeps `this.settings = {...settings, userTeam: <picked team's name>}` in memory (`settings.json` is unchanged), and every planner protects the picked team.
  - The session remembers the pick, so its own reopen after a failed `applySigningDay` keeps the same team.

## 8. Mockup and checks

Mock up a screen change before building it; rerun the checks after any GUI or `lib/` change.
1. **Mockup:** `node tools/gui-mockup-data.mjs "<save copy>" [team]` writes `gui/mockup-data.js`: the real Plan for that copy, with the team shown in full (default Missouri), one undo and a few reviewed teams so every status shows. `gui/mockup.html` renders the real screens (S0–S3) from it. Screenshot at 2560×1440: headless Edge on Tom's PC; Playwright with Chromium at `/opt/pw-browsers` in the cloud. Show Tom before building the screen.
2. **Checks** on a copy of `test_saves/DYNASTY-SIGNINGDAYCOPY`:
   - Picking the `settings.json` team: the overview counts match `ttt.mjs` on the same copy. Picking another team: it has no moves, and the `settings.json` team is planned like any CPU team.
   - S2 lists 137 CPU teams; search, tabs, sort and filters work. Missouri's IN and OUT match the plan.
   - Undo one transfer-in and one un-signed recruit: the plan rebuilds, both move to KEPT, an affected reviewed team shows `RE-CHECK`, and the locks file survives a page refresh. With no locks, the plan matches the planner's output.
   - Save: passes the reopen check, the backup exists and the locks file is deleted.

## 9. Player card (not built yet)

Click a player in a team's IN, OUT or KEPT rows (S3) and a card about him opens, with his portrait. Inspiration (Tom): The Ringer's NBA Top 100 card, as inspiration only (not its font, voting or photo breaking out of the box): a big name headline with an OVR badge, then small panels. §0–§2 apply as they are (black terminal look, tokens, type sizes, nothing under 14px).

### 9.1 Portraits

**What the save holds** (stock `DYNASTY-SIGNINGDAYCOPY`, fields read in the Player table's first read):
- `Player.GenericHeadAssetName` is the player's head asset. The portrait file is that name with `nilpp_` before it and `.webp` after:
  - `Unique_LegreeJesse_204629` → `nilpp_Unique_LegreeJesse_204629.webp`
  - `Generic_4968_P_T0235_M_6_4` → `nilpp_Generic_4968_P_T0235_M_6_4.webp`
  - A head name cut at 32 characters ends in `-`, and the file drops it: `Unique_AbdulRahimGladdin-_33048` → `nilpp_Unique_AbdulRahimGladdin_33048.webp`. So: remove a `-` just before the final `_<number>`.
- All 16,233 players have one: 13,741 `Unique_…` (10,944 different) and 2,492 `Generic_…` (1,761 different, numbered 1–5039, which fits the library's 5,040 generic files). Only `A–Z a–z 0–9 _ -` occur, at most 32 characters.
- Read a second time after `Dynasty.load`, these fields come back `null` for every player (the save trap); read first, they hold the head names. So the new fields go in the first read (§9.5).
- `PortraitForceSilhouette` (false) and `PortraitSwappableLibraryPath` (`library_icons_brt`) are the same for everyone: ignored.
- **Coverage** (by `gui/art/playerportrait-files.txt`, the list of every portrait in the library): 15,220 of 16,233 players (93.8%) have a file: all 2,492 generic heads, 2,826 of 2,828 recruits, 9,902 of 10,913 others. The other 1,013 heads have no matching file in the library (e.g. `Unique_WilliamsJace_206927`) and get the blank. `gui/art/playerportrait/` holds 15,107 of the 15,220: `tools/copy-art.mjs` matches the exact head name, so it misses most cut-short heads (§9.5).
- **Files:** the `gui/art/` copies are 256×256 webp with a transparent background (about 60% of pixels clear), so the team's color shows behind the face. Library originals (lookup case 2) show in the same 256px box.

**Match by head asset name, not by player name:**
- **Recruits wear other players' faces.** HS/JUCO recruits are generated: 2,828 wear another player's unique head and none wear their own (Caden Madha, a TE recruit un-signed at Missouri, wears `Unique_HunterEverett_20148`); 1,272 wear a generic head. A name match gives them nothing, or a namesake's face.
- **Long names are cut** at 32 characters; the head name (with the `-` rule) still finds the file, a name match doesn't.
- **No tiebreak needed:** the head name is the exact file. Heads are shared (2,378 unique heads by 2+ players, generic ones too); the game draws those players with the same face, and the card does too.
- **Not needed:**
  - `PLYR_PORTRAIT`: equals the generic number for about half of the generic heads, nothing else.
  - `PresentationId`: the unique file's number for all 10,913 non-recruits with a unique head.
  - `PLYR_ASSETNAME`: `<LastFirst>_<PresentationId>`, empty for recruits.
  - `PLYR_GENERICHEAD`: a head enum whose first digit (1–7) looks like skin tone.
  - The generic name's parts (`T0235`, `M`, `6_4`): the whole file name is already in the save.

**Lookup.** When a card opens, the server makes the file name (above) and takes the first case that applies, caching the answer per head:
1. **In `gui/art/playerportrait/`** (the committed slim copy, §2 Team art): his portrait.
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
| Pitch | his pitch's name; his dealbreaker and pitch categories, each an icon, label and the landing school's grade; dealbreaker met or not | `p.dealbreaker`, `PITCHES[p.pitch]`, `categoryGrade()`; met from the snapshot | |
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
| Moved | `Cut at Missouri for Zeraun Daniel (S cap); West Virginia wanted him most of the schools with room (Rotation).` (Jackson Hancock) |
| Deleted | `Cut at Vanderbilt for Eli Owens (FB cap); no school with room wanted him, so he is deleted.` (Jeremy Dugans) |
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
  - Under 1900px wide the panels stack and the drawer stays 840px; player names stay visible down to the 1600px minimum window.
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

- **Type:** section labels mono 15px uppercase, as in Panel headers; body 17px; table rows 46px; ratings in Plex Mono 17px with tabular numbers, every column left-aligned (§2).

### 9.5 Code changes

- **`lib/dynasty.mjs`** (first read only; see the `CLAUDE.md` save traps): add `GenericHeadAssetName`, `JerseyNum`, `Height`, `Weight`, `PLYR_HOME_TOWN`, `BaseNILValue` to the Player read list. `refreshPlayer` sets `p.head`, `p.jersey`, `p.height` (inches), `p.weight` (lb: stored + 160), `p.homeTown`, `p.nil`.
- **`lib/signing-day.mjs`** (`planPlacement`), output only:
  - Each placed, moved and unplaced entry, and each re-offered cut, keeps the list the planner already computed for him: `top5` (from `w.top10`) and `here` (the landing school's row from `w.teams`, with its list rank or null).
  - Row fields: `teamIndex, team, playerScore, baseScore, combined, role, meets, dealbreakerGrade, pitchGrades`.
  - No rule change; the rest of the plan stays identical. This is the one `lib/` change outside §6/§7 (Tom's OK needed, §9.7).
  - Why it's needed: without it, the card can only show his list from before Signing Day, which disagrees with the plan. Jesse Legree's pre-Signing Day top 5 is Ole Miss, Colorado, Stanford, Texas Tech, TCU, but when his turn came Missouri was #1 and he was placed there.
- **`lib/gui-plan.mjs`:** `playerCard(session, raw, state, playerIndex)` returns `PlayerCard`; `whyLine(…)` (§9.3); `playerPortrait(head)` (§9.1 lookup).
- **`gui.mjs`:** `GET /api/player?index=<playerIndex>` returns `PlayerCard`, with a 409 when there's no plan and a 404 for an unknown player.
  - The request handler passes the query string to GET handlers (`Object.fromEntries(url.searchParams)`, one line), so the exact-match handler table stays. That's why it's a query and not `/api/player/<index>`.
- **`gui/views.js`:** IN/OUT/KEPT rows get `data-action="card" data-player="…"` and names become buttons; `shell` draws `cardView(ui.card)` next to the save modal; the category icon map and rating labels live here.
- **`gui/app.js`:** `ui.card = {playerIndex, loading, data, error}`. Open, switch, close and Esc; close on `hashchange`; reload after undo, restore and review. Card loads skip the busy label: they're read-only and don't block other buttons.
- **`gui/styles.css`:** `.drawer`, `.portrait`, `.ovr-badge`, card sections, selected row.
- **`gui/icons/`:** `x` and the 14 category icons (§9.2).
- **`tools/gui-mockup-data.mjs`, `gui/mockup.html`:** card data for the shown team's players; clicking a row opens the card, as in the app.
- **`tools/copy-art.mjs`:** use the same head-to-file rule (drop the `-`), then re-run on Tom's PC, so `gui/art/` also gets the 113 cut-short heads' portraits.
- **This file:** once built, the API row goes in §5 and the card in §3 S3.

`PlayerCard` = `{index, name, pos, archetype, year, nextYear, redshirt, dev, stars, ranks:{national, position}, kind, jersey, height, weight, homeTown, homeState, nil, ovr, max, groups:[{name, level, cap, ratings:[{label, value}]}], portrait:{src, blank}|null, initials, status, from, to, role, rank, why, pitch:{name, school, categories:[{id, label, grade, dealbreaker, met}]}|null, top5:[{…team, rank, his, theirs, match, role, here}]|null, undos:[{undone, at}]}`. `from` and `to` = `{index, name, short, colors, logo}` or null.

### 9.6 Build steps and acceptance

Named players (a copy of `DYNASTY-SIGNINGDAYCOPY`, user team Kansas, no undos, Missouri's page):
- **Jesse Legree** (WR 87, player 13851): placed `Top 10 #1` from Oregon State, Starter · WR2; own head `Unique_LegreeJesse_204629`. Missouri isn't in his pre-Signing Day top 5 (the snapshot test).
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

1. **NIL:** what is `BaseNILValue` in the game? What unit, and what do negative values mean (−25 and −255 appear)? Show it, `CurrentNILCompensation` (0–110 here), or leave NIL off?
2. **Top 5 snapshot:** OK to make the output-only change to `lib/signing-day.mjs` (§9.5)? Without it, the Top 5 panel goes.
3. **Extras:** keep jersey number, height, weight and hometown? They're four cheap reads, but weren't in the earlier list.
4. **No portrait file:** the blank (as planned) or the monogram?
