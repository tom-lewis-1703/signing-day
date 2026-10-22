# Tom's Transfer Tools

## Project

Local GUI (`gui.mjs`, Node.js) that edits EA Sports College Football 27 dynasty saves. CPU schools barely recruit the transfer portal, so at the Signing Day → Preseason rollover the game deletes ~1,300 uncommitted transfers and teams collapse. The tool's core is calculating interest both ways (how much a player wants each school, how much each school wants him) and placing transfers by it. Signing Day leaves the user team (the user's own school) out of its plan.

Personal tool: one user (Tom), run locally, private repo. Skip public-release concerns (accessibility, other browsers/screens, auth, user-proofing, backwards compatibility, polished errors). Reading Tom's PC folders is fine. Save-safety rules still apply in full.

## Code map

- `gui.mjs`: local GUI server and API; frontend assets are in `gui/`.
- `lib/session.mjs`: opens saves, plans changes, applies edits, and saves.
- `lib/dynasty.mjs`: save reader; `lib/signing-day.mjs`: transfer placement; `lib/gui-plan.mjs`: GUI plan and player cards.
- `lib/fit.mjs`: school interest; `lib/destinations.mjs`: player interest and combined destinations.
- `lib/roster-edits.mjs`: field writes; `lib/safe-save.mjs`: backup, write, and reopen verification.
- `settings.json`: tuning values; `tools/`: reports and test helpers.

## Hard rules

- The user team is picked per save in the GUI (never hard-coded or defaulted). If it isn't found in a save, refuse to open it.
- Never write to `test_saves/`. Development and tests use copies. Real saves are written only through the GUI's explicit Save, with a backup and reopen verification.

## Save traps (learned the hard way)

- `madden-franchise` can't add fields to a table it already read: request every field in the first read (`Dynasty.load`).
- HS recruits and transfers point at **different** ProspectTargetSchool tables; follow the reference.
- The user team's RecruitingBoard points at a different RecruitTarget table than the CPU boards; read every referenced table.
- The game commits a player when an offering school's influence reaches his `CommitScore`, and only to a school on his list at that moment.
- The Signing Day board is `Team.CommittedPlayers`, distinct from `Team.RecruitingBoard`. `commitTransfer` sets the transfer to `Signed` and adds him to the school's Signing Day board.
- Rollover: deletes uncommitted transfers and unsigned recruits, then trims rosters to 85 by cutting veterans, never incoming recruits.
- `TeamIndex` 255 = no team; players who left keep their old team in `PrevTeamIndex`. The roster-list row index is not the TeamIndex. `Age` is unreliable.
- Arrays stay packed (later slots move up; empty = 32 zero bits). The Player table is capped at 17,500 rows: delete players the tool removes for good. Cut players stay teamless (`TeamIndex` 255) and the game deletes them at the rollover.
- Proven edit formulas live in `lib/roster-edits.mjs`; change them only with an in-game re-test.

## Running and testing

- `npm install` once per checkout. Run tools from the repo root.
- `node gui.mjs` starts the local GUI server; `--no-open` suppresses opening the browser.
- Fixtures are in `test_saves/`. Copy to `test_runs/` (git-ignored) before running anything that writes.
- `node tools/baseline-check.mjs` creates a fresh Signing Day copy in `test_runs/baseline-check/`, compares plan counts, and prints four named players' cards. Tools read the fixture's user team from `settings.json` → `testSavesTeam`.
- Add `--save` to apply the plan and save that copy through backup and reopen verification.
- Changes affecting save reading, planning, or writing need proof on a fresh copy: a few named players and league counts. Tom does any required in-game check. Documentation and cosmetic changes do not need save-based proof.
