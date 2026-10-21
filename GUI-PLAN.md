# Signing Day GUI: build plan

For a new chat. Read `CLAUDE.md` first; its working rules apply (one step at a time, wait for Tom's "go", show results).

## Goal

A simple window to run the Signing Day plan on a save, **review every CPU team's transfers in and out**, undo single moves, then save. Replaces typing `node ttt.mjs` and reading text output.

## Must-haves (Tom)

- **Big, easy-to-read text.** Tom often reads without glasses. Body text 20px minimum, table text 18px minimum, numbers in summary cards 40px+. Buttons at least 48px tall. No light-gray-on-white; strong contrast.
- **Style: Firecrawl's look, light theme** (Tom, Oct 21): warm off-white background, thin grid lines joining cards into one panel, monospace uppercase for labels and statuses (`TRANSFER IN`, `[ DELETED ]`), big bold page titles, left sidebar with the active page highlighted, roomy tables. References: [Overview](https://mobbin.com/screens/f3ddb0f3-34c7-488f-89d0-69391bebfe70), [Activity Logs](https://mobbin.com/screens/dc179b79-8083-472d-94a7-2cbe05044e90), [Run cards](https://mobbin.com/screens/f6fc0ade-ffa2-4833-9916-514282945b8d). Firecrawl's text is small; scale everything up to the sizes above.
- **Accent color = the user team's colors**, read from the save (`TEAM_BACKGROUNDCOLORR/G/B`, secondary `…R2/G2/B2`) for the team in `settings.json` → `userTeam`. If the primary is too light for text on the light background (contrast under 4.5:1), darken it, or use the secondary. Green = in, red = out, amber = warning stay fixed.
- **Clean and simple:** few screens, lots of space, one main action per screen.
- **Everything lines up:** numbers right-aligned with their headers; same column widths across tables.

## Tech

- No Electron. `node gui.mjs "<save copy>"` starts a small local server (Node's `http`, no framework) and opens the browser at `http://localhost:<port>`.
- One HTML page plus one CSS file plus one JS file in `gui/`. Plain JavaScript, no build step.
- The server uses the existing `lib/session.mjs` (open, `signingDayPlan()`, `applySigningDay()`, `save()`). Same backup and reopen check as now. Refuses `test_saves/`.

## Screens (with Mobbin references)

**1. Overview**
- Save name, stage, user team.
- Big stat cards: transfers placed, dropped, recruits un-signed, players deleted, players moved.
- Two big buttons: **Review teams** and **Save**.
- References: [Vapi metrics cards](https://mobbin.com/screens/6998a104-0081-42d3-9147-7a433f6f8c5c) (large numbers in colored cards); [Churnkey "Lifetime Performance"](https://mobbin.com/screens/e8cc072e-76d6-4624-b62d-03b58798af3e) (big numbers with one clear primary button).

**2. Teams list**
- One row per CPU team: name, prestige, roster before → after, transfers in, players out, and a status badge ("Reviewed" / "Changed").
- Search box, sort by any column, filter (e.g. "teams with deletions").
- Click a row to open the team.
- References: [Twingate resources](https://mobbin.com/screens/8f788643-fe7a-4273-81c2-59186cff8008) (large title, roomy rows, search and filter); [Fresha team members](https://mobbin.com/screens/e43c6445-573d-41e8-a121-dcefe5e92db7) (tall, readable rows).

**3. Team review**
- **In:** each transfer, with name, position, OVR, from, role, and NIL if used.
- **Out:** un-signed recruits, deleted players and moved players, each with the reason.
- Every row has an **Undo** button. Undone rows turn gray and show "kept".
- Previous / next team buttons, so Tom can go through all teams in order.
- References: [AirOps "Review Changes"](https://mobbin.com/screens/9dc41840-28c1-4033-b623-1666f65d2616) (list of changes, each with its own Revert); [Deel change requests](https://mobbin.com/screens/04cf3d45-777b-4066-a5b2-b13598930ce7) (list on the left, detail on the right).

**4. Save confirm**
- A summary of the final counts and of Tom's undos, plus **Save** and **Cancel**.
- Reference: [Aboard approval panel](https://mobbin.com/screens/d15cd548-a758-4743-8944-99c825340019) (clear final approve/reject).

## How Undo works

- Undo = a lock: "keep this recruit or player" or "don't place this transfer at this school".
- The plan is rebuilt with all locks; others may shift. For example, a transfer that's undone may land at his next school or drop out.
- Needs a small change in `lib/signing-day.mjs`: `planRecruitCleanup` and `planPlacement` accept locks (`keep: Set`, `notAt: Map`).
- Locks live in the page until Save.

## Build steps (one per check-in with Tom)

1. **Mockup:** one static HTML page of screens 1 to 3 with real data from the Signing Day test save. Tom approves the look (size, colors, layout) before any server code.
2. **Server and Overview:** `gui.mjs`, opening a save, the overview cards.
3. **Teams list.**
4. **Team review,** read-only.
5. **Undo:** locks in `signing-day.mjs`, then rebuild.
6. **Save with confirm.**
7. **Remove `ttt.mjs`'s Signing Day part,** or keep it as a fallback (Tom decides).

## Open before step 1

- **Default placement settings** (all are already settings in `settings.json` → `signingDay`):
  - recruit cleanup cutoff (`recruitCleanup.underOverall`);
  - `placeRoles` (Starter/Rotation);
  - `cutRecruitsFrom` (80 = only 80+ transfers may bump recruits);
  - `deleteOnly` (rising seniors, or HB/WR/TE/FB);
  - `moveCutFrom` (cut players under this OVR are deleted instead of moved).
- **The sim** (`PLAN.md`) is a separate track; this GUI works with the current placement and can show the sim's results later.
