# Tom's Transfer Tools — Plan

Oct 20, 2026 · @Thomas Lewis

Shortened on Oct 20, 2026 (sixth session). The old long version, with every tuning round and its numbers, is in git history (commit `80686c3`). Each rule's full detail, formula and real-player examples are on the rule walkthrough page (https://claude.ai/artifact/4kbXJoCjikjx8PL56jqb98, source `docs/ttt-internals.html`).

## Where we are and what's next

**Last chat (Oct 20–21, tenth session):** task 4 (branch `claude/adoring-meitner-syxx7c`).
- `node tools/signing-day-run.mjs <Signing Day copy> [--dry]` writes the whole Signing Day plan (all or nothing, Tom's option A: if one edit fails nothing is saved). First test dynasty: 1,310 placed, 2,215 un-signed, 136 moved, 15 cut; in-game Simmons → UCLA, Hawkins → Duke, Barnes → BYU, Bardin moved to New Mexico St. (task 3 now proven).
- **Run 2 (Tom, from `DYNASTY-NIL`, no draft lock, weekly + Signing Day commands):** the game deleted 948 of our weekly commits at the rollover (326 rated 80+): at Signing Day it only signs a HardCommitted transfer whose school has him on its recruiting board. Fix: the Signing Day write now signs those itself (`signCommitted`, proven form); redone from the Signing Day backup, all 1,936 transfers reached Preseason.
- **League strength (best-22 average OVR, user team left out):** stock year 1 79.8 · year 2 no tool 79.8 · tool + draft lock 81.4 · tool, no draft lock 81.1 (prestige 9–10: 86.4 / 88.0 / 88.8 / 87.5; whole roster 72.0 / 70.5 / 73.6 / 73.5; game team rating 90+: 7 / 10 / 22 / 21). The draft lock adds only ~0.3; the tool adds ~1.3 at every prestige. **Tom: he doesn't want the tool to make everybody a super team** → task 5 below.
- Tom: the game's own team rating isn't accurate; judge by player OVR. 98 of the top 104 transfers had committed by Week 4 (ranking counts double in the weekly order); Tom kept it for now.

**Next:** task 6 (or the new progression task, if Tom moves it up).

**Goal right now (Tom, sixth session):** one complete test run of a whole offseason on copies, Players Leaving → Preseason, with Tom checking in-game. Be token-efficient: Claude runs the bare minimum tests that prove each piece works; Tom tests the rest in-game. Quality stays the same.

**Built:** reading the save (incl. recruiting boards), safe saving, draft lock (writes), next-season depth chart, team score, player score, Top 10 preview, Signing Day plan (preview only), save writer (commit, un-sign, cut, list update), weekly commits + interest update (CLI `tools/weekly-run.mjs`; no app button yet).

### Task list (one chat each, top first)

Start a chat with `/next` (takes the top task that isn't done); end it with `/handoff`. Agreed with Tom Oct 20, sixth session.

1. ~~**Save writer**~~ **Done (seventh session).** `lib/roster-edits.mjs` + the stronger save check; proven in-game at Liberty and Missouri.
2. ~~**Weekly commits**~~ **Done (eighth session),** plus the weekly interest update; both proven in-game Week 2 → 3 (design below, "Weekly commits").
3. ~~**"Cut player moved to another school" write**~~ **Done (ninth session; proven in-game tenth session):** none of the 136 moved players has a recruit row, so Tom chose a direct move (`RosterEdits.movePlayer`): the proven cut, then his team = the new school and onto its roster list (100 slots, at most 79 used), left off its depth chart (normal: 105 rostered players have none at Signing Day). Save check passed on a copy (Tagert Bardin → New Mexico St., Ansel Nedore → W. Kentucky, Kortez Rupert → Utah State).
4. ~~**Signing Day write**~~ **Done (tenth session),** plus signing the weekly commits the game leaves unsigned; checked in-game (run 2).
5. ~~**League strength**~~ **Done (eleventh session): kept as is (Tom).** Measured on the test Signing Day save (starter average, this season's OVR, no training, user team left out): the tool refills holes, it doesn't gift. Every prestige band ends below this year (all 79.5 this year → 75.8 stock → 77.7 tool; 9–10: 86.4 → 84.4 → 85.4). The biggest gains go to schools that lost the most starters, e.g. Vanderbilt (p5) lost 19 of its starters (10 graduating, 9 portal): 81.0 → 74.2 stock → 78.5 tool. Tom thinks the game's team rating counts depth and backups (99 teams without a 99), which would explain the high team ratings.
   **New task to place (Tom, eleventh session): in-game player progression.** The game makes players better too fast and too evenly; e.g. Tom's backup QB Chris Jenkins 75 → 83 in one season, common at QB, WR, DB, RB; Austin Mack (84) got no upgrade in training despite open skill caps. Measured offseason training (Signing Day → Preseason, 7,046 returning players): only about +2.4 on average, the same for every dev trait (Normal to Elite), WR highest (+3.3, 26% gain 5+); 285 players with 10+ room gained nothing. So the big jumps happen during the season (game XP), which no test save covers. Needs: a save from the start and end of one season; Tom's choice of method (scale back each year's gains against a snapshot, dev traits, or skill caps) and whether the user team is included.
6. **Weekly commit onto the school's recruiting board:** so the game signs our weekly commits itself (and shows the school's offer, e.g. Williams Nwaneri, Alabama, no offer while Oklahoma offered). Today the Signing Day write covers it; this is the clean fix. A new write to prove in-game.
7. **App controls, minimal:** a "Run this week" / "Run Signing Day" button in the Stage view, using the existing log and Save. Show Tom a mockup first. Also fix the stale stage labels (review #6). Tom (eighth session): outliers and oddities must be his call, so the app must let him review the plan and change or drop single moves before Save.
8. **Check script:** one reusable script that runs every stage on fresh copies of the test saves and checks: rosters ≤ 85, every transfer placed, boards ≤ 35, nobody left teamless, the user team untouched, the save reopens, no transfer skipped for an unknown position, every committed transfer signed to a board at Signing Day. This is the app's automated test.
9. **Tom's full offseason run** (Players Leaving → Preseason, in-game).

**Side task (Tom, eighth session; not in the order above):** the depth chart uses projected next-season OVR = OVR + expected training gain. Measured Signing Day → Preseason (7,046 returning players): about +2.4 on average, by room to max (0–2: +0.6 … 15+: +2.9) and dev trait (Elite with 15+ room: +4.1); e.g. Ty Hawkins (SMU QB) 82 → 86. It changes every need/role rule, so check before/after on named teams.

### Code review (Oct 20, sixth session)

Every layer was read line by line. No calculation errors in the rules; speed is fine everywhere. Findings:
- **#1** `lib/dynasty.mjs` doesn't read `Team.RecruitingBoard` when the save opens, and madden-franchise can't add a field to an already-read table. That is why one script found 0 boards. Fix: add the field to the team read list (task 2).
- **#2** Moving a cut returning player to another school: `movePlayer` (task 3, proven in-game tenth session).
- **#3** Fixed: a `userTeam` name not found in the save now stops the save from opening (before, the user team was silently unprotected).
- **#4** Fixed: `settings.json` now overrides defaults at every level, so a missing nested value keeps its default instead of switching its rule off.
- **#5** Save check too weak for commits and cuts (task 1).
- **#6** `lib/stage.mjs` labels and build-step numbers are stale (task 5).
- Left alone: a transfer placed back at his old school is tagged "Transfer from (his school)"; backups in `TTT Backups` are never deleted.

### Notes for the full run

**Week 1 of Tom's run doubles as the write test:** the tool commits with the weekly edit (HardCommitted, off the board; the Signing Day form is proven); Claude checks the save reopens and the changed records are right; Tom advances one week. If the commits hold, carry on. If not, switch to the other method (raise an offering school's `ProspectInfluenceTotal` to the player's `CommitScore` so the game commits him) with one setting and redo Week 1 from the copy.

**Skipped for this first run (Tom):** writing Top 10s into the game during the weeks; Pass A (reviewing the game's own commits at Signing Day); mixing offers/influence into interest (measured only).

**After the run:** fix what Tom finds; if rules fight each other, simplify instead of adding another layer. Then the deferred items above, the weekly tracking screen, and "Later" at the bottom.

**Housekeeping:** branches: `main` has everything to date; one branch per session, merged into `main` at the end (merge commit) and both pushed. `claude/confident-mendel-53hrhb` (rejected UI) and `review-base` / `full-review` (code-review only) are never merged. Test copies: cloud, copy from `test_saves/` to the scratchpad; Tom's PC, `saves\TomsTransferTools\test_runs\`.

## How we'll work

**One task per chat (Tom, Oct 20, sixth session):** start each chat with `/next`, end it with `/handoff` (both in `.claude/skills/`; typing `/handoff` is Tom's OK to commit, merge into `main` and push). Long chats get expensive and lose detail; the repo carries everything between chats.

The full rules are in `CLAUDE.md` ("Working rules" and "Check in before doing more"); they are Tom's and mandatory. In short: small pieces, list what you'll change first, stop after each piece and show real players, mockups before any screen change, no extras without asking, no commit until Tom says OK. Tom refers to rules by code (T3, P2…); when a rule changes, update its code, the walkthrough page and this plan.

## How the tool works, in plain words

### The offseason, stage by stage

| Stage (save) | What the game does | What the tool does | Status |
|---|---|---|---|
| Players Leaving | Underclassmen declare for the draft; players enter the portal | **Draft lock:** only players out of eligibility (seniors not redshirting) may leave for the draft; everyone else is set to Staying | Built, writes, signed off |
| Week 1 | Portal opens; each transfer has a Top 10 of schools | Nothing yet (writing Top 10s skipped for the first run) | — |
| Weeks 1–4 | Schools recruit; a player commits when an offering school's influence reaches his CommitScore | **Weekly commits:** commit a share of transfers each week to schools that need them | Built, proven Week 2 → 3 |
| Signing Day | Last commits; recruits sign | **Roster build:** un-sign weak recruits, place every uncommitted transfer, cut only where needed, every CPU team ≤ 85 | Planned in preview; writing next |
| Preseason (rollover) | Deletes uncommitted transfers and unsigned recruits; cuts veterans to reach 85 | Nothing; by now there is nothing left for the game to cut or delete | — |

The user team (`settings.json` → `userTeam`; Kansas in this dynasty) is never changed by any of this.

### The four building blocks

Everything after the draft lock is built from the same four blocks. They run in this order for every uncommitted transfer at every school.

**1. Next season's depth chart (codes D1–D5).** For each school: today's roster, minus graduates, draft declarations and players leaving in the portal, plus committed transfers and signed recruits. Players are grouped into position rooms (EDGE = LE+RE, LB = all three LB spots, S = FS+SS), sorted by OVR, and given a role: **Starter** (within the scheme's starter count), **Rotation** (the next one), **Backup** (up to twice the starters), **Buried** (the rest). "Path to start" = a senior starter ahead of him leaves after next season. This also gives each room's starters lost, replaced and still open.

**2. Would the school want him? Team score (T1–T12).**
- Start from **his role there**: Starter 100, Rotation 60, Backup 30, Buried 0, plus a path-to-start bonus (+30 Fr/So, +15 Jr) (T1).
- Multiply by **how much the school needs that room**: up to ×2 when its starters drop off by 10+ OVR from this season (T2) or its starters are 10+ below the level expected for that school (T3); ×0.25 when the room is **stacked** (no starter lost, a backup ready) (T4).
- Need can go higher for a clear **upgrade** over the weakest starter, up to ×1.5 (T7), or **succession** when every starter is a senior next season and he's a young player who'd take over, ×2 (T8).
- **Reality checks:** a backup only counts if his max overall reaches their weakest starter −3 (T5); a "starter" more than 5 below the usual starter at schools of that prestige is a stopgap and counts as a backup (T10); ×0.25 for each similar player already coming into that room (same year, OVR within 3) (T11); he only takes a start from another newcomer if he's 4+ better, and a school takes at most (starters lost in that room + 1) transfers there (T12).
- QB ×1.25, OT and EDGE ×1.1, used only when comparing players at different positions (T9).

**3. Would he go there? Player score, 0–100 (P1–P5).**
- **Dealbreaker is pass/fail** using the game's own school grade: B− needed for 85+ OVR, C for 78–84, D+ below that. Playing Time needs Starter or Rotation; Proximity needs his home state. The Playing Time dealbreaker is ignored for players below the league's average starter at their position (P1).
- **Score** = playing time × year weight (Fr 20%, So 35%, Jr 50%, final year 70%; halved for 80+ OVR) + the rest split: dealbreaker grade 45%, his two other ideal-pitch categories 15% each, prestige 15%, team strength 5%, home state 5%; ±3 small fixed randomness (P2, P4).
- **Prestige floor:** 90+ OVR want prestige 6+ (fall back to 4+), 85–89 want 4+ (fall back to 2+) (P3).
- **Never back to his old school** (P5, Tom's option A, ninth session): the school he left is never on his Top 10 or a weekly commit; at Signing Day only as the last "best fit" so a real player isn't deleted.

**4. His Top 10 (K1–K4).** A school can be on his list only if it passes his dealbreaker, the school wants him (team score above 0) it meets his prestige floor and it isn't the school he left (K2, P5). Ranked by a 50/50 mix of team score and player score (K1). **User team:** skips the team side and the floor; it's on his list whenever it passes his dealbreaker, ranked by his player score; with a full transfer perk at his position it can join from as low as 18th, at #10 (K3, K4).

### Signing Day roster build (SD1–SD6)

1. **Recruit cleanup (SD1):** un-sign every signed high-school/JUCO recruit under 60 OVR at CPU schools, except Star/Elite/Impact recruits whose max overall reaches the league's average next-season starter at his position. Real players always come before generated recruits.
2. **Place every uncommitted transfer (SD4):** best max overall first. Each goes to the highest school on his Top 10 that has room; the Top 10 is recomputed live, so a school that just landed a QB stops pulling QBs. If nobody on his list has room: the school with room he likes most ("best fit").
3. **Room (SD5):** a free board slot (35 per school), under the position cap (QB 5, HB 6, FB 1, WR 11, TE 5, OT 8, OG 8, C 4, EDGE 8, DT 8, LB 12, CB 9, S 8, K 2, P 2) and under 85. A full school may cut **one** player to make room: only someone who'd be Backup/Buried once the newcomer arrives, whose keep value is 5+ below the newcomer's, recruits first, at most 5 real players per school.
4. **Keep value (SD2)** = OVR + (max − OVR) × year factor (next season Fr 0.5, So 0.35, Jr 0.2, Sr 0): young players with room to grow outlast topped-out upperclassmen.
5. **Protected (SD3):** never cut or left unplaced: Jr/Sr 77+, or Fr/So 72+ with max 77+.
6. **Weekly commits the game didn't sign** (HardCommitted, off every board) are signed to their school first and take a board slot; boards over 35 un-sign their lowest-keep-value recruits (tenth session).
7. **Finish (SD6):** schools still over 85 trim recruits first, then the lowest-keep-value bench players. Cut real players are offered to other schools (schools that want him first); deleted only if no school has room.

### Weekly commits (built, eighth session; settings `weekly`)

- **Pace:** share of all portal transfers committed by the end of Week 1 / 2 / 3 / 4 = 0% / 20% / 40% / 70% (Week 1 is free for the user to scout); the game's own commits count. The rest at Signing Day.
- **Who first (Tom: not all stars at once):** chance-based order. Chance = 0.1 + favorite (his #1 ahead of #2, percentile) + 2 × rank (national transfer rank) + offer (best in-game offer / CommitScore); a weighted draw fixed per player and week, so a save always gives the same plan. Week 2: about 1 in 5 of each rank band commits (top 25: 4 of 24).
- **Where:** any school on his live Top 10 (rescored after every commit), schools that offered him in-game first; never where he'd be a stopgap (below the school's starter level, T10). Board slots counted as after Signing Day's recruit cleanup; position caps and 85 ignored during the weeks (Signing Day trims; it never cuts a committed transfer).
- **Never:** a player on the user team's recruiting board, or with the user team in his top 3. No cuts and no recruit cleanup during the weeks.
- **Interest update (from Week 2):** each uncommitted transfer's in-game list becomes his live Top 10, with his existing influence numbers high to low; schools with him on their board keep theirs (the game commits from that number); the user team keeps its exact spot and influence and is never added or removed; players on its board are left alone.
- **T12 newcomer lock (Tom):** a transfer coming in at the school's starter level (T10: within 5 of the usual starter for its prestige) locks his starting spot (Drake Lindsey QB 84 keeps Iamaleava 89 off Auburn), unless the newcomer is beaten by 8+ OVR or by a top-5 transfer at his position (Pierre 91 over Julian Walker 80 at Alabama; KaMario Taylor QB #1 over Lindsey). Below the level he's a stopgap: 4+ better takes his spot. In rooms with several starters only the newcomer's own spot is protected.
- **Fit lists, harder recruiting (Tom, eighth session):** our lists drop schools that don't need a player, so big schools run short of players listing them (Alabama 220 → 53) and go after the user team's targets (Alabama on Kameryn Crawford, Auburn on Jonaz Walton). Tom: keep "fit" lists; harder recruiting is OK.

## What the game does on its own (why the rules exist)

- **Teams collapse at the Signing Day → Preseason rollover:** 1,310 transfers were uncommitted at Signing Day; the game deleted 1,042 of them (314 rated 80+, e.g. Austin Simmons QB 86), then cut veterans rather than incoming recruits to reach 85. Hardest hit: schools that lost 15 to the portal and got 0–5 back (Missouri, Nebraska, BYU, Oklahoma State…). 43% of signed recruits were under 60 OVR.
- **CPU schools barely recruit the portal:** only 559 of 1,891 transfers are on any school's board by Week 4. Game commits: Week 1 0, Week 2 1, Week 4 172, Signing Day 581.
- **A commit happens when an offering school's influence reaches the player's CommitScore** (170 of 172 at Week 4). The game only commits to a school on his list at that moment, but lists change during the portal (half of Signing Day commits went to schools added after Week 1).
- Save-level facts (table IDs, field names, how edits are written) are in `CLAUDE.md` → "Save facts worth knowing".

### Edits proven in-game (Oct 20, Signing Day copy at Liberty, Tom advanced to Preseason)

| Edit | Example | Result |
|---|---|---|
| Un-sign a recruit | Joshua Fisher WR 53 | Deleted by the game at rollover |
| Cut a player (release) | Jayden Whaley FS 65 | Deleted by the game at rollover |
| Commit a transfer | Matyus McLain RE 74 | On Liberty's roster at Preseason |
| Commit to a school not on his list (seventh session, Missouri) | Nate Sheppard HB 93, Brandon Finney Jr. CB 91 | On Missouri's roster at Preseason |
| Weekly commit (eighth session, Week 2 → 3) | 377 commits, e.g. DJ Lagway → SMU, Drake Lindsey → Auburn | All still committed at Week 3 |
| Weekly list update (eighth session, Week 2 → 3) | 1,502 lists, e.g. Nico Iamaleava, Michael Carroll, Dakorien Moore | Same lists at Week 3 |

Exactly the 12 planned records changed. How each is written: `CLAUDE.md` → "Signing Day edits proven in-game".

## Results to compare against

| Check | Copy | Result |
|---|---|---|
| Draft lock | Players Leaving | 141 locked at 57 teams (86 Jr, 55 So); 82 graduates left; in-game: all locked players stayed |
| Top 10 preview | Week 1 | 0 empty Top 10s; BYU #1 for 110 players; Hawkins → Illinois, Tennessee, Duke; Kansas in ~17% of lists |
| Recruit cleanup | Signing Day | 1,535 un-signed, 150 kept (Impact 131, Elite 11, Star 8) |
| Placement | Signing Day | 1,310 of 1,310 placed (1,004 at their #1, 25 best fit); 1,094 start; 150 real players cut (137 moved, 13 deleted); rosters 64–85; ~0.8 s. Simmons → Arizona, Hawkins → Duke, Khalil Barnes → BYU |
| Signing Day write | Signing Day | first dynasty: un-sign 2,215, move 136, cut 15, commit 1,310, ~4 s; run 2: sign 948 unsigned weekly commits, commit 376, all 1,936 transfers in Preseason |
| League strength | Preseason | best-22 avg: stock y1 79.8, y2 no tool 79.8, tool + lock 81.4, tool no lock 81.1 |
| Speed | any | open ~0.65 s; whole portal scored ~0.25 s |

## Later and open questions

- **Later phases:** outflow control (who enters the portal and how many per team); Pass A review of game commits; #1-pick balancing; weekly tracking screen.
- **CPU schools offer their Top 10 players (Tom, eighth session, realism):** most transfers have no in-game offer (Week 2: 139 of 197 uncommitted 85+, e.g. Nico Iamaleava QB 89, Austin Simmons QB 86). Would mean creating RecruitTarget rows on CPU boards (unproven) and would start the game's own commit clock beside ours, and give the user team real competition; placement doesn't need it. Try after the full run.
- **Tom's ideas, not designed:** player tags that change how teams recruit him ("Project Player", "Win Now"); review where max overall is used (T5, T10, keep value, protection, recruit keep rule, Pass B order), since it assumes every upgrade is bought.
- **Open observation:** "best fit" leftovers go by player score, so prestige can beat playing time (Christian Clark HB 80 So → Texas, #3 on the depth chart). Ask only if Tom raises it.
- **Open questions:** 3-4 defenses' extra DTs count only as DT; whether the game backfills NFL draft picks after the lock; NIL not modeled (Tom: forget it).
- **Known UI rough edge:** on the Signing Day Schools page, a clicked school's list appears below all 137 rows.
