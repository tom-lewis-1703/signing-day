# Manual roster moves: reusable findings

October 23, 2026. A requested one-off edit was interrupted after disposable-copy verification. Tom then made the changes manually. The interrupted attempt never wrote the real autosave. Its temporary GUI and executable move plan were removed so they cannot replay stale assignments.

- A save's filename does not establish its stage: `DYNASTY-SIGNINGDAY-AUTOSAVE` was already at Preseason, with players on rosters rather than transfer commitment boards. Inspect SeasonInfo and actual ownership before choosing an edit operation.
- Preseason moves between existing rosters use the established `RosterEdits.movePlayer` operation. Current rostered seniors still play this season; the reader's `outOfEligibility` flag describes the following rollover and must not exclude them from a current-season manual move.
- All destination teams in this case had 85 players. Tom chose return depth swaps to preserve 85 rather than releasing players. Count all requested departures first when identifying QB rooms that need a replacement; retain at least three QBs in the affected source rooms. These were one-off user choices, not new automatic market rules.
- The unchanged move formula passed a fresh-copy test with 12 requested moves and 12 return moves. Backup/write/reopen verification passed; all affected rosters stayed at 85; source depth-chart references were removed; player count stayed 16,394; ratings, class and redshirt fields were unchanged; Kansas was protected. The generic field-write and unrelated-record checks in `Session.verifySaved` also passed.

Compact proof: `test_runs/manual-roster-move-proof-2026-10-23.json` (local, ignored). It records test-copy results only and does not establish the contents of Tom's later manually edited save or a new in-game validation. No writer formula or permanent manual-edit GUI was added.
