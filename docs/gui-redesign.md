# Dynasty workspace

Design direction agreed with Tom: a dark modern sports website, focused on the whole dynasty, with tools leading the dashboard. Transfers and Team Ratings are the two tools. Schools and players are connected browsing views throughout the workspace.

## Navigation and views

- Open save → explicitly select your school → dashboard. Selecting a school does not run either planner.
- Dashboard: the two tool cards, observed league counts, and links to schools with the highest stored ratings.
- Schools: searchable directory, alphabetic or overall sorting. Includes Tom's school.
- Team page: overview, current/upcoming or proposed rosters, position rooms, recruiting commitments and board targets, native and proposed transfer activity. Position rooms are ordered by OVR; they are not the game's actual depth chart.
- Player card: centered overlay with portrait, profile, all 54 loaded attributes grouped by purpose, recruiting information, and a market decision tab when a transfer preview is active. Detailed model calculations remain under disclosures.
- Transfer preview: player movement, changed schools, releases, unplaced players, and model review. Keep/exclude/restore/review actions retain the school context. Seed and constraints are separate from saving.
- Ratings preview: before/after rating cards and a position breakdown with linked players.

`gui/views.js` renders the new views; `gui/app.js` owns requests, view state, and detailed model disclosures. `gui/workspace.css` applies the new design over the existing base/audit styles. `lib/gui-dynasty.mjs` supplies read-only team/profile data from fields already requested by `Dynasty.load`. The market algorithm, edit formulas, backup and reopen verification are unchanged.

## Verification

Visual revision: retain the original 1,512px workspace and its horizontal padding/margins. Featured players use four large portrait cards across the full content width (two on smaller desktops), with 330px source images in 280px stages; regular roster and recruit cards also use prominent portraits. The centered player popup uses a 385px portrait. Transparent source padding is cropped through layout while preserving the hairline. School colors, helmets, oversized wordmarks, condensed display type, development tags, and prominent rating badges give teams distinct identities. The overview separates featured players, roster composition, recruiting, and portal activity. The dashboard leads with illustrated tools and adds a league player spotlight. Market photos load as their cards approach the viewport through the existing read-only player endpoint, with a per-save portrait cache. Verify at Tom's 2560px desktop size; do not widen the workspace to address small content.

Portrait quality: serve the original 512px DynastyOS library portraits before the older bundled 256px copies. Portrait URLs carry a version to bypass cached thumbnails. The bundled copies remain available when the local library is absent, and `tools/copy-art.mjs` now preserves original WebP bytes for future bundles instead of resizing and recompressing them. Layout dimensions remain unchanged.

Startup remembers the last successfully opened save in `gui-state.json`. Launching or refreshing reopens it and restores only the school explicitly selected for that same path, after resolving its name against the save's current schools. With no valid remembered school, show the picker; an unavailable file leaves the save chooser usable. Change save opens the chooser without immediately restoring again. Startup opens browse mode and never calculates or saves a tool preview. `node tools/gui-startup-check.mjs` exercises server restarts on a fresh fixture copy using an isolated `--state-file`, including invalid-school/missing-file cases, named profiles, league counts, and unchanged save hashes.

Run `node tools/gui-dynasty-check.mjs`. It creates a unique fresh fixture copy, checks league counts and named roster/recruit profiles, verifies every proposed school roster, and proves browsing does not alter the deterministic transfer plan or save bytes. The seed `sd-v1.2-001` retains plan ID `ff669ed5fc47378587ebc1329b0bd791654803a85483c05228a5dd96e280b96b`: 1,042 placements, 840 unplaced, 402 veteran releases, 628 recruit releases. Named examples include Keelon Russell (91), Jeremiah Smith (99), Dante Moore (94), and Dante Barney (82); every card exposes all 54 requested attributes.

The proof folder also contains recorded dynasty, school, profile, market, and ratings responses for `node tools/gui-replay.mjs --fixture <proof-folder>`. The replay cannot save and does not recompute the market. Detailed profiles exist for the recorded sample; other replay player links provide row-only cards.

Use `tools/gui-workspace-check.js` as a read-only CUA `playwright.evaluate` expression on dashboard, school, market, ratings, and player views. The earlier `gui-layout-check.js` documents the superseded school-rail layout.

Browser evidence and disposable-copy integration results for this redesign are under `test_runs/gui-redesign/`. Real dynasty saves and source fixtures are not used for Save checks.

Both tools passed explicit GUI Save on separate disposable copies, including backup and reopen verification. Independent read-back confirmed all 1,042 transfer destinations, 16,233 retained player records, and unchanged Kansas team/roster/commitment-board bytes. The saved transfer SHA-256 is `21d6bf2d2c98576de1e0615a89ab360f79a593ba30ff5fcd2908331dc429b010`, matching the previous verified implementation. Ratings read-back confirmed all three fields for all 138 schools (137 changed).

Browser checks covered school search, roster search, recruit/player cards, all 54 grouped attributes, tool previews, unplaced search/empty results, school review, Keep and restore, seed replanning, and linked ratings starters. Desktop layout checks passed across approximately 1,000, 1,280 and 2,560 pixels of available width without document overflow. Recorded-response checks confirmed recovery from a school request failure and cancellation of a delayed old player response. Position rooms use current OVR and projected class years; the player card's profile retains the class year observed in the save.
