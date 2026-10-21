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

**Team art.** The GUI serves art at `assets/…` from `gui/art/` first, then from Tom's DynastyOS asset library (`%USERPROFILE%\Documents\DynastyOS Assets`, ~1.1 GB, only on his PC). `gui/art/` is a slim copy, committed so cloud sessions can render art, made by `tools/copy-art.mjs` on Tom's PC with the library's relative paths: `logos-flat-dark/` and `helmet/left/` unchanged, `playerportrait-files.txt` (every portrait name in the library), and the portraits of players in `test_saves/` plus all `nilpp_Generic_*` and `nilpp_Blank`, resized to 256×256 webp with alpha, so the player card shows portraits at ≤256px. Logos: `logos-flat-dark/tlow_<School>.webp`; helmets: `helmet/left/thel_lthelmets_<School>_result.webp`. Match on `Team.LongName`/`DisplayName` with letters and digits only, plus aliases (California → CAL, UConn → Connecticut, East Carolina → ECU, Middle Tennessee → MidTennState, Sam Houston → SamHoustonState, Massachusetts → UMass). No library or no match: a MonogramTile.

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
- **Team art:** `assets/…` serves image files from `gui/art/` (slim copies made by `tools/copy-art.mjs`), else the DynastyOS asset library (§2), read-only; cached by the browser for a day.
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

## 10. Player card (not built yet)

Click a player in a team's IN, OUT or KEPT rows (S3) and a card about him opens, with his portrait. Inspiration (Tom): The Ringer's NBA Top 100 card, as inspiration only (not its font, voting or photo breaking out of the box): a big name headline with an OVR badge, then small panels. §0–§2 apply as they are (black terminal look, tokens, type sizes, nothing under 14px).

### 10.1 Portraits

**What the save holds** (stock `DYNASTY-SIGNINGDAYCOPY`, fields read in the Player table's first read):
- `Player.GenericHeadAssetName` is the player's head asset. The portrait file is that name with `nilpp_` before it and `.webp` after:
  - `Unique_LegreeJesse_204629` → `nilpp_Unique_LegreeJesse_204629.webp`
  - `Generic_4968_P_T0235_M_6_4` → `nilpp_Generic_4968_P_T0235_M_6_4.webp`
- All 16,233 players have one: 13,741 `Unique_…` (10,944 different) and 2,492 `Generic_…` (1,761 different, numbered 1–5039, which fits the library's 5,040 generic files). Only `A–Z a–z 0–9 _ -` occur, at most 32 characters.
- The earlier finding that it "holds one value for every player" was the save trap: read again after `Dynasty.load`, these fields come back `null` for every player. Read first, they hold the head names. So the new fields go in the first read (§10.5).
- `PortraitForceSilhouette` (false) and `PortraitSwappableLibraryPath` (`library_icons_brt`) really are the same for everyone: ignored.

**Match by head asset name, not by player name:**
- **Recruits wear other players' faces.** HS/JUCO recruits are generated: 2,828 wear another player's unique head and none wear their own (Caden Madha, a TE recruit un-signed at Missouri, wears `Unique_HunterEverett_20148`); 1,272 wear a generic head. A name match gives them nothing, or a namesake's face.
- **Long names are cut** at 32 characters with a trailing `-` (`Unique_AbdulRahimGladdin-_33048`); a name match misses them, the head name doesn't.
- **No tiebreak needed:** the head name is the exact file. Heads are shared (2,378 unique heads by 2+ players, generic ones too); the game draws those players with the same face, and the card does too.
- **Not needed:**
  - `PLYR_PORTRAIT`: equals the generic number for about half of the generic heads, nothing else.
  - `PresentationId`: the unique file's number for all 10,913 non-recruits with a unique head.
  - `PLYR_ASSETNAME`: `<LastFirst>_<PresentationId>`, empty for recruits.
  - `PLYR_GENERICHEAD`: a head enum whose first digit (1–7) looks like skin tone.
  - The generic name's parts (`T0235`, `M`, `6_4`): the whole file name is already in the save.

**Lookup: one file check per card, no index.** When a card opens, the server checks `DynastyOS Assets/playerportrait/nilpp_<head>.webp` with one `fs.existsSync` and caches the answer per head. A head name that fails `^[A-Za-z0-9_-]{1,32}$` counts as missing. The server never lists the folder or reads the manifest: with the exact name known, an index isn't needed. The manifest (`.dynastyos-library/playerportrait.files.json`) is only for the one-off coverage check (§10.6 step 1). Portraits go through the existing read-only `assets/…` route (`.webp` is already allowed) and are never committed.

**Fallback:**
1. **File found:** the portrait.
2. **Library there, file missing:** the library's `nilpp_Blank.webp`, so it sits with the other portraits.
3. **No library (or no blank):** a monogram: his initials in Plex Mono 96px/700 on the team's primary color, kept readable the same way as team MonogramTiles.

"The team" (portrait backdrop, monogram) = the school he ends up at after the plan, else the school of the row clicked.

### 10.2 Card contents

| Part | Shows | Source | New read |
|---|---|---|---|
| Portrait | 240×240 box | `GenericHeadAssetName` (§10.1) | yes |
| Name | h1, Plex Mono 38px/600 | `p.name` | |
| OVR badge | scoreboard numeral (60px/700, soft glow) in a bordered square; `MAX 94` under it | `p.overall`, `d.maxOverall(p)` | |
| Identity line | `WR · Shifty Route Runner · FR → SO · Impact · 4-star` | `p.position`, `p.archetype`, `p.schoolYear`, `p.redshirt` (RS when he has redshirted), `nextClass(p)`, `p.dev`, `p.stars` | |
| Body line | `#12 · 5'10" · 167 lb · Baltimore, Maryland` | `JerseyNum`, `Height` (inches), `Weight` (stored as lb − 160), `PLYR_HOME_TOWN`, `p.homeState` | 4 fields |
| Move strip | `[logo] Oregon State → [logo] Missouri`, StatusTag, role there (`Starter · WR2`) | raw plan entry: `from`, `team`, `role`, `rank` (his place in the room) | |
| Why | one sentence (§10.3) | raw plan entries, locks | |
| Info | kind (Transfer, HS recruit, JUCO recruit, Returning); ranks (`#49 overall · WR #9`); NIL; his undos (`You undid: transfer in at Missouri`) | `p.recruitClass`, `p.nationalRank`, `p.positionRank`, `BaseNILValue`, the locks | NIL |
| Pitch | his pitch's name; his dealbreaker and pitch categories, each an icon, label and the landing school's grade; dealbreaker met or not | `p.dealbreaker`, `PITCHES[p.pitch]`, `categoryGrade()`; met from the snapshot | |
| Ratings | `OVR 87 → MAX 94`; six skill groups, each its name, `LV 15/16` and its ratings with the game's short labels (`SPD 93 ACC 95 STA 90 KR 45`) | `d.skillGroupDetail(p)` | |
| Top 5 | his list when his turn came: rank, TeamMark, school, `HIS` (player score), `THEIRS` (team score ÷ 2, so 0–100 as in the combined score), `MATCH` (combined), role there. The landing school is tagged `[ HERE ]`, as a 6th row when it isn't in the top 5 (Best fit) | snapshot from the planner (§10.5) | |

- **Status** (StatusTag and the card's top edge): PLACED `--in`, MOVED `--moved`, SIGNED COMMIT and UN-SIGNED `--orange`, DELETED `--out`, DROPPED `--warn`, STAYS (an undone un-sign or cut) `--text-2`.
- **Hidden parts:** Pitch when he ends up nowhere (un-signed, deleted, dropped). Top 5 when the planner never ranked schools for him (signed commits, recruits).
- **Key ratings** = the six skill groups: they're the game's own progression view, and `skillGroupDetail` already computes them.
- **Category icons** (Tabler, always beside the label, copied into `gui/icons/`): Playing Time `clock`, Proximity to Home `home`, Championship Contender `trophy`, Brand Exposure `speakerphone`, Coach Prestige `user-star`, Coach Stability `anchor`, Conference Prestige `flag`, Program Tradition `books`, Stadium Atmosphere `building-stadium`, Academic Prestige `school`, Campus Lifestyle `confetti`, Athletic Facilities `barbell`, Playing Style `ball-american-football`, Pro Potential `briefcase`. Plus `x` for Close.
- The Plan rows already carry `playerIndex`, so the `Plan` itself doesn't change.

### 10.3 Why line

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

### 10.4 Interaction and layout

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
│ │  240×240   │  #12 · 5'10" · 167 lb                  MAX 94              │
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

### 10.5 Code changes

- **`lib/dynasty.mjs`** (first read only; see the `CLAUDE.md` save traps): add `GenericHeadAssetName`, `JerseyNum`, `Height`, `Weight`, `PLYR_HOME_TOWN`, `BaseNILValue` to the Player read list. `refreshPlayer` sets `p.head`, `p.jersey`, `p.height` (inches), `p.weight` (lb: stored + 160), `p.homeTown`, `p.nil`.
- **`lib/signing-day.mjs`** (`planPlacement`), output only:
  - Each placed, moved and unplaced entry, and each re-offered cut, keeps the list the planner already computed for him: `top5` (from `w.top10`) and `here` (the landing school's row from `w.teams`, with its list rank or null).
  - Row fields: `teamIndex, team, playerScore, baseScore, combined, role, meets, dealbreakerGrade, pitchGrades`.
  - No rule change; the rest of the plan stays identical. This is the one `lib/` change outside §6/§7 (Tom's OK needed, §10.7).
  - Why it's needed: without it, the card can only show his list from before Signing Day, which disagrees with the plan. Jesse Legree's pre-Signing Day top 5 is Ole Miss, Colorado, Stanford, Texas Tech, TCU, but when his turn came Missouri was #1 and he was placed there.
- **`lib/gui-plan.mjs`:** `playerCard(session, raw, state, playerIndex)` returns `PlayerCard`; `whyLine(…)` (§10.3); `playerPortrait(head, dir = ASSETS_DIR)` (§10.1).
- **`gui.mjs`:** `GET /api/player?index=<playerIndex>` returns `PlayerCard`, with a 409 when there's no plan and a 404 for an unknown player.
  - The request handler passes the query string to GET handlers (`Object.fromEntries(url.searchParams)`, one line), so the exact-match handler table stays. That's why it's a query and not `/api/player/<index>`.
- **`gui/views.js`:** IN/OUT/KEPT rows get `data-action="card" data-player="…"` and names become buttons; `shell` draws `cardView(ui.card)` next to the save modal; the category icon map and rating labels live here.
- **`gui/app.js`:** `ui.card = {playerIndex, loading, data, error}`. Open, switch, close and Esc; close on `hashchange`; reload after undo, restore and review. Card loads skip the busy label: they're read-only and don't block other buttons.
- **`gui/styles.css`:** `.drawer`, `.portrait`, `.ovr-badge`, card sections, selected row.
- **`gui/icons/`:** `x` and the 14 category icons (§10.2).
- **`tools/gui-mockup-data.mjs`, `gui/mockup.html`:** card data for the shown team's players; clicking a row opens the card, as in the app.
- **`tools/portrait-check.mjs`** (new, read-only, run on Tom's PC): for a save copy, how many head names have a file in the library (split into own unique, borrowed unique and generic), plus the first 10 misses. It finds file names by matching `nilpp_[A-Za-z0-9_-]+\.webp` in the manifest's text, so the manifest's JSON layout doesn't matter.
- **This file:** once built, the API row goes in §5 and the card in §3 S3.

`PlayerCard` = `{index, name, pos, archetype, year, nextYear, redshirt, dev, stars, ranks:{national, position}, kind, jersey, height, weight, homeTown, homeState, nil, ovr, max, groups:[{name, level, cap, ratings:[{label, value}]}], portrait:{src, blank}|null, initials, status, from, to, role, rank, why, pitch:{name, school, categories:[{id, label, grade, dealbreaker, met}]}|null, top5:[{…team, rank, his, theirs, match, role, here}]|null, undos:[{undone, at}]}`. `from` and `to` = `{index, name, short, colors, logo}` or null.

### 10.6 Build steps and acceptance

Named players (a copy of `DYNASTY-SIGNINGDAYCOPY`, user team Kansas, no undos, Missouri's page):
- **Jesse Legree** (WR 87, player 13851): placed `Top 10 #1` from Oregon State, Starter · WR2; own head `Unique_LegreeJesse_204629`. Missouri isn't in his pre-Signing Day top 5 (the snapshot test).
- **Mario Wofford** (FB 69, 6934): placed `Best fit` from Duke, Buried; generic head `Generic_4968_P_T0235_M_6_4`.
- **Caden Madha** (TE 65 recruit, 3498): un-signed for Willie Rodriguez (TE cap); borrowed head `Unique_HunterEverett_20148`.
- **Jackson Hancock** (FS 71, 13344): cut at Missouri for Zeraun Daniel (S cap), moved to West Virginia (Rotation).

1. **Portrait check (Tom's PC):** `node tools/portrait-check.mjs "<save copy>"` prints the coverage. Tom answers §10.7.
2. **Data:** the reads, the snapshot and `playerCard`. Proof on a fresh copy:
   - The `ttt.mjs` counts and the GUI plan's summary are unchanged.
   - The plan JSON with `top5`/`here` removed equals today's.
   - The card JSON for the four players matches the bullets above.
3. **Mockup:** the card in `gui/mockup.html` for Missouri's players, screenshot at 2560×1440. The mockup data keeps its one undo (Caden Madha), so his card shows the STAYS story and Mario Wofford lands elsewhere; the step 2 checks use the plan with no undos. The cloud has no library, so the screenshot shows the monogram; one more with portraits on Tom's PC. **Stop and show Tom.**
4. **Live:** the API and the drawer. On a copy: open, switch, Esc and Close work. After an Undo of Jesse Legree's row, his card reloads with the new story and the row is in KEPT.
5. **Tom in-game:** the four portraits match the faces in the game.

### 10.7 Open questions for Tom

1. **Portrait files:** what pixel size are they, and is the background transparent? The plan shows them at 240×240 on the team's color. If they have their own background, the team color only shows on the monogram.
2. **NIL:** what is `BaseNILValue` in the game? What unit, and what do negative values mean (−25 and −255 appear)? Show it, `CurrentNILCompensation` (0–110 here), or leave NIL off?
3. **Top 5 snapshot:** OK to make the output-only change to `lib/signing-day.mjs` (§10.5)? Without it, the Top 5 panel goes.
4. **Extras:** keep jersey number, height, weight and hometown? They're four cheap reads, but weren't in the earlier list.
5. **File missing, library there:** the library's blank (as planned) or the monogram?
