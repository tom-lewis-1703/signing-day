# Signing Day

Personal local tool for College Football 27 dynasty saves. Current status, rules and next work are in [the algorithm handoff](docs/algorithm-handoff.md).

```sh
npm install
node gui.mjs
```

The server runs on localhost at port 5178, or the next free port. `--no-open` stops it opening the browser. On launch it reopens your last save and school; **Change save** opens another.

## Tools

- **Transfer market** (Signing Day saves): plans where CPU transfers go, with your school protected. Review it, add constraints or replan, then Save the exact plan you reviewed.
- **Team ratings** (any save): previews overall, offense and defense for every team, then saves those three fields. See [the formula](docs/team-ratings-v2.md).
- **Sophomore draft lock** (Players Leaving and Week 1 saves): keeps CPU sophomores from leaving for the NFL draft.

You can also browse every school's roster, position rooms, recruits and transfers, and open any player's profile.

Every Save makes a backup and reopens the written file to verify it before replacing the original. Save-safety rules are in `AGENTS.md`, and testing is covered in the handoff.
