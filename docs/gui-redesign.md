# Dynasty workspace

Design direction agreed with Tom: a dark modern sports website, focused on the whole dynasty, with tools leading the dashboard. Schools and players are connected browsing views throughout the workspace.

## Navigation and views

- Open save → explicitly select your school → dashboard. Selecting a school does not run a planner.
- Dashboard: tool cards, observed league counts, and links to schools with the highest stored ratings.
- Schools: searchable directory, alphabetic or overall sorting. Includes Tom's school.
- Team page: overview, current/upcoming or proposed rosters, position rooms, recruiting commitments and board targets, native and proposed transfer activity. Position rooms are ordered by OVR; they are not the game's actual depth chart.
- Player card: centered overlay with portrait, profile, all 54 loaded attributes grouped by purpose, recruiting information, and a market decision tab when a transfer preview is active. Detailed model calculations stay under disclosures.
- Transfer preview: player movement, changed schools, releases, unplaced players, and model review. Keep/exclude/restore/review actions retain the school context. Seed and constraints are separate from saving.
- Ratings preview: before/after rating cards and a position breakdown with linked players.

`gui/views.js` renders the views; `gui/app.js` owns requests, view state, and detailed model disclosures. `gui/workspace.css` applies the design over the base styles. `lib/gui-dynasty.mjs` supplies read-only team and profile data from fields already requested by `Dynasty.load`.

## Visual choices

- Keep the 1,512px workspace and its padding. Verify at Tom's 2560px desktop size; do not widen the workspace to address small content.
- Featured players use four large portrait cards across the full content width (two on smaller desktops), with 330px source images in 280px stages. The player popup uses a 385px portrait. Transparent source padding is cropped through layout.
- School colors, helmets, oversized wordmarks, condensed display type, development tags, and prominent rating badges give teams distinct identities.
- Market photos load as their cards approach the viewport, with a per-save portrait cache.
- Serve the original 512px DynastyOS portraits before the bundled 256px copies. Portrait URLs carry a version to bypass cached thumbnails. `tools/copy-art.mjs` preserves original WebP bytes for future bundles.

## Startup

The last successfully opened save is remembered in `gui-state.json`. Launching or refreshing reopens it and restores only the school selected for that same path. With no valid remembered school, show the picker; an unavailable file leaves the save chooser usable. Change save opens the chooser without restoring again. Startup only browses and never calculates or saves a tool preview.

Checks, when working on the GUI: [GUI regression checks](../tools/gui-regression.md) and `node tools/gui-startup-check.mjs`.
