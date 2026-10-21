# Tom's Transfer Tools

## Project

Node.js CLI (`ttt.mjs`) and local GUI (`gui.mjs`) that edit EA Sports College Football 27 dynasty saves. CPU schools barely recruit the transfer portal, so at the Signing Day → Preseason rollover the game deletes ~1,300 uncommitted transfers and teams collapse. The tool's core is calculating interest both ways (how much a player wants each school, how much each school wants him) and placing transfers by it. The user team (the user's own school) is never touched.

Personal tool: one user (Tom), run locally, private repo. Skip public-release concerns (accessibility, other browsers/screens, auth, user-proofing, backwards compatibility, polished errors). Reading Tom's PC folders is fine. Save-safety rules still apply in full.

Docs: `PLAN.md` (status, task list, what's built), `GUI-PLAN.md` (GUI spec). Chats: `/hub` (design and dispatch), `/next` (start a task), `/handoff` (end a chat).

## How we work

- One step at a time. When Tom comments or asks a question, only discuss: no code, edits, scripts or commits.
- Before acting, list exactly what you'll do and wait for Tom's "go". Do only that, then stop and show the result.
- No extras; don't start the next step unprompted.
- If Tom's idea, decision or code has a mistake or a better alternative, say so right away, briefly and with the reason. Don't wait to be asked.

## Hard rules

- Never change the user team (`settings.json` → `userTeam`; never hard-coded). If the name isn't found in a save, refuse to open it.
- Never write to `test_saves/` or a real save. Work on copies; only an explicit Save writes, always with a backup and a reopen check.

## Save traps (learned the hard way)

- `madden-franchise` can't add fields to a table it already read: request every field in the first read (`Dynasty.load`).
- HS recruits and transfers point at **different** ProspectTargetSchool tables; follow the reference.
- The user team's RecruitingBoard points at a different RecruitTarget table than the CPU boards; read every referenced table.
- The game commits a player when an offering school's influence reaches his `CommitScore`, and only to a school on his list at that moment.
- At Signing Day the game only signs a HardCommitted transfer whose school has him on its RecruitingBoard; the rest are deleted at the rollover.
- Rollover: deletes uncommitted transfers and unsigned recruits, then trims rosters to 85 by cutting veterans, never incoming recruits.
- `TeamIndex` 255 = no team; players who left keep their old team in `PrevTeamIndex`. The roster-list row index is not the TeamIndex. `Age` is unreliable.
- Arrays stay packed (later slots move up; empty = 32 zero bits). The Player table is capped at 17,500 rows: delete players the tool removes for good. Cut players stay teamless (`TeamIndex` 255) and the game deletes them at the rollover.
- Proven edit formulas live in `lib/roster-edits.mjs`; change them only with an in-game re-test.

## Running and testing

- `npm install` once per checkout. Run tools from the repo root.
- Test saves in `test_saves/`: the stock dynasty at each stage (`DYNASTY-<stage>COPY` for PLAYERSLEAVING, WEEK1PORTALOPENS, WEEK2, WEEK4PORTALCLOSES, SIGNINGDAY, PRESEASON), plus saves from earlier proof runs (STEP5PROOF, STEP5PROOF-PRESEASON, WEEKLYTEST, WEEKLYTEST2, WRITERTEST). Copy to the scratchpad or `test_runs/` (git-ignored) before running anything that writes.
- Minimum proof: one fresh copy, a few named players, league counts. Tom does the in-game check.
- Cloud sessions: push only to the session branch; at the end, merge it into `main` (merge commit) and push both. New chats start from `main`.
- Windows Git Bash: apostrophes break `node -e`; write scripts to a file instead.
