# Plan

## Built
- Read layer, safe save (backup + reopen check), save writer (commits, un-signs, cuts, moves, list updates; proven in-game).
- `node ttt.mjs "<save copy>"`: per stage, plans this week's commits + list updates (Weeks 1–4) or the full Signing Day build, shows the top 10 moves, asks before saving.

## Decided (Oct 21, 2026): Signing Day simulation
- At Signing Day the uncommitted transfers are placed by a simulation instead of the old placement. The game's own commits stay.
- CPU schools: offer only to transfers who'd start or rotate there; team score = role × (0.5 + 0.5 × need), 0–100; NIL budget = 25% of `RemainingProgramPoints`, price = `BaseNILValue`. HS recruits on a board and transfers compete for its 35 slots by the same team score (weaker recruits get bumped).
- Players rank schools by the player score; matching until nothing changes (stable matching); unmatched transfers drop out.
- User team (option 2): Tom recruits in-game; at Signing Day his uncommitted board offers (incl. NIL) compete in the sim; his commits are never touched.
- Output can be CLI art; Tom builds the sim with Claude.
- Targets: 65–70% of transfers on a roster; every 85+ placed, 90%+ of 80–84; 85+ average prestige 7+, none at ≤3; 60%+ start or rotate; league near stock (a super team or two is fine); no school over its NIL budget; rosters 80–85, no room above the stock maximum.
- Prototype (scratch, first run): 97% placed, starter average 75.8 → 77.2, budgets bind at top schools; flaw: static roles (two starting QBs at Ole Miss).

## Next (in order)
1. Sim: schools rescore needs as they sign players.
2. Sim: the user team competes with its in-game board offers.
3. Sim: move-by-move list (CLI art) to judge placements.
4. Sim: tune placement toward the targets.
5. Build the sim into the tool; review before Save; check script; Tom's full offseason run in-game.

## Later / undecided
- GUI player card (click a player in a team's IN / OUT / KEPT rows): planned in `GUI-PLAN.md` §10. The Ringer's NBA Top 100 card as inspiration only; portraits from the DynastyOS library by each player's head asset (`GenericHeadAssetName`), monogram fallback. Waiting on Tom's answers (§10.7) and "go".
- Weekly commits and list updates: likely dropped with the sim.
- AI-run CPU coaches as a layer on top of the sim.
- Position limits (the game over-recruits RB and WR).
- When and how players get deleted; real players vs recruits.
- In-game player progression (Tom's own system).
- Next-season OVR with training gains in the projections.
