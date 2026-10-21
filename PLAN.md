# Plan

`/hub` starts the hub chat (design and dispatch; see `.claude/skills/hub/SKILL.md`). `/next` starts the first open task in "Task list"; `/handoff` updates this file. A task a builder session is working on ends with `(builder: <session id>)`. Rules and save facts are in `CLAUDE.md`; history is in git.

## Where we are and what's next
- On `main`: `node ttt.mjs "<save copy>"` (CLI: this week's commits and list updates in the portal weeks, or the full Signing Day build) and `node gui.mjs` (Signing Day GUI, spec `GUI-PLAN.md` §1–8). At Signing Day both use `lib/signing-day.mjs` (`planRecruitCleanup`, then `planPlacement`).
- Under both: read layer `lib/dynasty.mjs`, save writer `lib/roster-edits.mjs` (proven in-game), safe save `lib/safe-save.mjs` (backup + reopen check).
- Next: no task is set; ask Tom.

## Task list
One chat per task. `[ ]` open, `[x]` done.
- None open.

## Later (not scheduled; don't start without Tom)
- GUI player card: plan in `GUI-PLAN.md` §9.
- AI-run CPU coaches.
- Position limits (the game over-recruits RB and WR).
- When and how players get deleted; real players vs recruits.
- In-game player progression (Tom's own system).
- Next-season OVR with training gains in the projections.
