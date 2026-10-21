# What we know (Oct 21, 2026)

Facts only: what the game does, how the save works, which edits are proven in-game, what we measured. No tool rules and no decisions; those come later, one step at a time. The old code is on branch `v1-archive`.

## 1. The problem in the game

- **CPU schools barely recruit the portal.** By Week 4 only 559 of 1,891 transfers are on any school's recruiting board. Game commits: Week 1 0, Week 2 1, Week 4 172, Signing Day 581.
- **At Signing Day about 1,310 transfers are still uncommitted.** At the Signing Day → Preseason rollover the game deletes them (1,042 deleted in the test dynasty, 314 rated 80+, e.g. Austin Simmons QB 86). It also deletes unsigned recruits.
- **Teams collapse.** The game trims rosters to 85 by cutting veterans, never incoming recruits, and fills teams under 85 with a few leftover transfers. Hardest hit: schools that lost about 15 to the portal and got 0–5 back (Missouri, Nebraska, BYU, Oklahoma State).
- **Weak recruits.** 43% of signed high-school recruits are under 60 OVR.

## 2. How the game recruits and commits (transfers too)

- **A player commits when an offering school's influence reaches his `CommitScore`** (125–350). 170 of 172 Week 4 commits.
- He only commits to a school on his in-game list at that moment (574 of 581 Signing Day commits went to his #1). Lists change during the portal: about half of Signing Day commits went to a school added after Week 1.
- A school's influence on its board equals the `TeamInfluence` on the player's list (649 of 649).
- Most transfers have no CPU offer (Week 2: 1,445 of 1,890).
- CPU schools seem to pick targets from players who list them.
- **At Signing Day the game only signs a committed transfer whose school has him on its recruiting board.** The rest are deleted at the rollover. In run 2 it deleted 948 commits the old tool had written during the weeks.
- During the weeks, signed high-school recruits already sit on the schools' signed boards.

## 3. Offseason stages

From `SeasonInfo.CurrentOffseasonStage`: 2 Players Leaving, 3 Week 1, 4 Week 2, 5 Week 3, 6 Week 4, 7 Signing Day. `CurrentStage = PreSeason` is the preseason.

## 4. How the save is built

**Tables (unique IDs):**

| Table | ID |
|---|---|
| Player | 1612938518 |
| Team | 3359508968 |
| Recruit | 1873209313 |
| TopSchools | 2332540366 |
| LeavingPlayer | 1418279587 |
| Transfer processing queue | 3884115435 |
| RecruitingBoard | 220276943 |
| RecruitTarget | 59043175 |

The schema file is `C27_486_1.gz` (major 486, minor 1, on `v1-archive` in `lib/`). The library is `madden-franchise` 4.3.1. It can't add a field to a table it has already read, so request every field you need in the first read.

**Players:**
- `TeamIndex` 255 = no team.
- Players who left keep their old team in `PrevTeamIndex` (transfers from Week 1, graduates from Week 2).
- Archetype = `PlayerType`. Skill caps = `SkillGroupCap1–6` (0–20). Dev trait = `TraitDevelopment`. Home state = `PLYR_HOME_STATE`.
- The `Age` field is unreliable (1 or 52 for many players).
- Stars: `Player.ProspectStarRating`. Rankings: `Recruit.NationalRank` and `PositionRank` (transfer rankings for portal players).
- The Player table holds 17,500 rows (16,235 used at Signing Day). Removed players must be deleted, never left teamless.

**Player wishes:**
- `RecruitingDealbreaker` and `IdealRecruitingPitch`: 20 pitches × 3 categories. His dealbreaker is one of his pitch's categories, except for Gym Rat players.
- The pitches and school states are on `v1-archive` in `lib/data/`.

**Schools:**
- `TeamPrestige` is 0–10.
- School grades: `Team.MySchoolTrackingTable` → a row with `*Grade` letters, `ProPotentialGrade<group>`, and `PlayingStyleGradeByPlayerTypeTable` → `PlayerTypeGradeTable` (a grade per archetype).
- Coach perks: `Team.CoachTalentEffects` → `PlayersLeaving_InterestBoost_Transfers` / `PlayersLeaving_ThresholdDecrease_Dealbreakers`, int[8] in order QB, RB/FB, WR/TE, OL, DL, LB, DB, K/P.
- Colors: `TEAM_BACKGROUNDCOLORR/G/B` (+`2` for secondary). Short name: `Mascot_AssetName`. Logos aren't in the save.

**Lists, boards and rosters:**
- **His list:** high-school recruits and transfers point at **different** ProspectTargetSchool tables. Follow the reference (the old TrapsTransferTool's bug). Each row holds `TeamId` and `TeamInfluence`, sorted by influence high to low. `Motivation1–3` are empty.
- **Recruiting board:** `Team.RecruitingBoard` → RecruitingBoard row → `Recruits` (RecruitTarget[] array; read keys with `Object.keys(array.fields)`) → RecruitTarget rows.
  - Fields: `Recruit` ref, `ScholarshipStatus` (Offered/None), `ProspectInfluenceTotal`, `ProspectInfluenceDelta`, `ProspectInfluenceTotalLastWeek`, `CommittedWeekNumber`.
  - **The user team's board points at a different RecruitTarget table than the CPU boards, so read every table the boards reference.**
- Recruit: `RecruitStage`, `TotalScholarshipOffers`, `CommitScore`.
- **Signed board (`CommittedPlayers`, Player[] 6135):** 35 slots per school. At Signing Day a transfer's school is the one whose signed board holds him, else his list #1 when `RecruitStage` is Signed/HardCommitted.
- **Roster list:** Player[] table 6137, one row per school, 100 slots. The row number is **not** the TeamIndex.
- **Depth chart slots:** Player[] 6136 rows, referenced by DepthChart 6302.
- **Arrays:** list tables keep each row's used length in their header (the library updates it). Arrays are kept packed: later slots move up, and an empty slot is 32 zero bits.

**Other facts:**
- NIL: player `BaseNILValue`; team `NILProgramPointsSpent` / `ProgramPointBudget`. How the game uses them for CPU schools is unknown.
- After Tom advances a save in-game, the game writes `<name>-AUTOSAVE` next to it; the loaded file itself is unchanged.

## 5. Edits proven in-game

| Edit | How it's written | Proven with |
|---|---|---|
| **Un-sign a recruit** | `RecruitStage` Top10, `TotalScholarshipOffers` 0, off the school's signed board | Joshua Fisher WR 53 (Liberty): deleted at rollover |
| **Cut a player** | `TeamIndex` 255, `PrevTeamIndex` old school, off its roster list and every depth-chart slot | Jayden Whaley FS 65: deleted at rollover |
| **Sign a transfer (Signing Day)** | `RecruitStage` Signed, `TotalScholarshipOffers` 1, on the signed board, school moved to #1 of his list with the top influence + 10; a school not on his list replaces his last school | Matyus McLain RE 74 (Liberty); Nate Sheppard HB 93, Brandon Finney Jr. CB 91 (Missouri, not on their lists) |
| **Move a cut player to another school** | the cut, then `TeamIndex` new school and onto its roster list; off every depth chart (normal: 105 rostered players have none at Signing Day) | Tagert Bardin → New Mexico St. (run 1) |
| **Commit during the weeks** | like the game's own: `HardCommitted`, `TotalScholarshipOffers` 1, school #1 of his list, not on the signed board | 377 commits Week 2 → 3 (DJ Lagway → SMU), but see section 2: the game won't sign them at Signing Day unless the school has him on its recruiting board |
| **Sign a week commit at Signing Day** | HardCommitted transfer off every board → Signed on his school's signed board | run 2: all 1,936 transfers reached Preseason |
| **Rewrite his list** | his list rows rewritten in place | 1,502 lists Week 2 → 3, unchanged at Week 3 |

**Not proven yet:** putting a transfer on a school's recruiting board (so the game signs a week commit itself).

## 6. Safe saving (how it worked, proven)

1. Back up to `TTT Backups\` beside the save.
2. Write a temporary file.
3. Reopen it and check the stage, the player count, every written field, and that no other record changed (compared byte for byte with the backup).
4. Replace the save.

## 7. What we measured

**Before any tool (stock test dynasty):**

| Measure | Value |
|---|---|
| League strength (best-22 average, user team left out) | year 1 79.8 · year 2 79.8 |
| Prestige 9–10 best-22 average | year 1 86.4 · year 2 88.0 |
| Whole roster average | year 1 72.0 · year 2 70.5 |

**With the old tool:**
- League strength: 81.4 with the draft lock, 81.1 without (prestige 9–10: 88.8 / 87.5; whole roster 73.6 / 73.5).
- The draft lock added only about 0.3.

**Refill, not gift (Signing Day test copy, starter average, this season's OVR, no training):**

| Prestige | This year | Next year, stock | Next year, old tool |
|---|---:|---:|---:|
| All | 79.5 | 75.8 | 77.7 |
| 9–10 | 86.4 | 84.4 | 85.4 |

The biggest gains go to the schools that lost the most starters. Vanderbilt (prestige 5) lost 19 starters (10 graduating, 9 portal): 81.0 this year → 74.2 stock → 78.5 with the tool.

**Position rooms are the game's doing:**
- Stock Preseason rosters average 5.8 running backs (max 9) and 10.2 receivers (max 17) per team.
- Tom's run 2 Preseason: 5.7 running backs (max 10) and 10.7 receivers.
- Missouri's 10 running backs: 1 from the tool (Samuel Brown V), 9 of its own. Iowa State's 9: 2 from the tool.

**Offseason training (Signing Day → Preseason, 7,046 returning players):**
- About +2.4 OVR on average, the same for every dev trait (Normal to Elite).
- By position: WR +3.3 (26% gain 5+), CB +2.6, K/P about +1.4.
- 285 players with 10+ points of room gained nothing (Austin Mack's case is common).
- The big jumps (Chris Jenkins QB 75 → 83) happen during the season; no test save covers a season.

**Other:**
- The game's team rating likely counts depth and backups (99 teams without a 99). Judge by player OVR.
- Speed: opening a save takes about 0.65 s.

## 8. Test saves (`test_saves/`, never written to; copy first)

**Stock test dynasty:**
- `DYNASTY-PLAYERSLEAVINGCOPY`, `-WEEK1PORTALOPENSCOPY`, `-WEEK2COPY`, `-WEEK4PORTALCLOSESCOPY`, `-SIGNINGDAYCOPY`, `-PRESEASONCOPY`.

**Edited copies:**
- `DYNASTY-STEP5PROOF` (Signing Day, 4 proven edits at Liberty) and `-STEP5PROOF-PRESEASON` (after Tom advanced it).
- `DYNASTY-WRITERTEST` (Missouri edits).
- `DYNASTY-WEEKLYTEST` and `-WEEKLYTEST2` (Week 2 with old-tool commits and list updates).

**Not in the repo:** Tom's run 2 Preseason save (`DYNASTY-SDRUN-AUTOSAVE`) is on his PC.

## 9. Setup

- **Tom's PC:** Windows 11, Node 25. Repo at `C:\Users\tomle\Documents\TomsTransferTools`; saves at `C:\Users\tomle\Documents\EA SPORTS College Football 27\saves\`.
- **Private GitHub repo:** `tom-lewis-1703/toms-transfer-tools`. It must stay private: the ratings model numbers were extracted from Maxi's tool, which states no license. It's on `v1-archive`.
- **Cloud sessions:** can push only to the session's branch. The game and in-game checks are PC only.
- **Windows Git Bash:** apostrophes break `node -e`; write scripts to a file instead.
- **User team:** set by the user, never hard-coded (Kansas in the current dynasty).
