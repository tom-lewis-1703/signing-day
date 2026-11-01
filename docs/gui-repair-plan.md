# GUI repair plan

Completed October 23, 2026. This document records the original diagnosis, repair scope, and verification. The functional repair is implemented; the color and visual redesign remains separate.

## Confirmed cause of the broken review screen

Two HTML nesting errors in `gui/app.js` explain the main failure:

- `renderPlan()` does not close `.workspace-top` after `.workspace-actions`. The summary, seed controls, disclosures, and `.desk` become children of the horizontal flex header.
- `selectedSheet()` ends with an unmatched `</div>`. When inserted into the complete review template, it causes the browser to repair the surrounding structure; the footer ends up outside `.workspace`. This fragment also needs checking when it replaces `#team-sheet` directly.

The data and player sheet are present in the DOM. They are being squeezed and pushed out of view. In the reproduced 1280 × 720 browser viewport:

| Element | Observed result |
| --- | --- |
| Document | 2,186 px wide; 6,680 px tall |
| `.workspace-top` | 6,481 px tall |
| `.desk` | Begins at x = 1,899 px |
| `#team-sheet` | Only 2 px wide |
| `.summary-strip` | Begins around y = 3,189 px |

This accounts for the empty screen, school list on the far right, controls far down the page, and horizontal scrollbar in the screenshots. Fix the structure before diagnosing the remaining CSS.

## Repair order

### 1. Restore the page structure

- Close the header before rendering the summary and other review sections; remove the unmatched school-sheet closing tag.
- Break the giant review template into readable, balanced sections so container boundaries are explicit.
- Keep the intended arrangement: header/actions, summary, seed/review controls, optional disclosures, then school navigation beside the selected school or unplaced pool.
- Verify both initial plan rendering and subsequent school/pool replacements. Browser parsing differs between a complete page fragment and a replacement inside an existing container.

**Done when:** the first school opens visibly, controls occupy normal rows near the top, the school list is beside the sheet, and the footer remains inside the workspace.

### 2. Fix sizing and scrolling after the markup repair

- Ensure the main grid and school sheet can shrink within the available desktop width. Check flex/grid minimum widths and long content.
- Give wide tables local horizontal scrolling where needed. Do not hide document overflow to conceal displaced content.
- Make the school list's height and sticky behavior fit the actual available space; its search, filters, and unplaced-pool button must remain reachable.
- Check long school/player names, crowded roster rooms, expanded league review, and player-card tables.
- Verify in Tom's maximized Edge window and during ordinary desktop resizing/zoom. No mobile or cross-browser expansion is needed for this personal tool.

**Done when:** the document has no unintended horizontal overflow, content is not clipped, and normal scrolling never produces a large empty area before the controls or sheet.

### 3. Check the working controls and review state

Exercise these after the layout makes them usable:

- School search, All/Changed/Re-check filters, school selection, and links from league diagnostics.
- Unplaced-pool search, paging, empty results, and switching back to a school.
- Player-card open/close and its displayed player, destination, release details, and constraint controls.
- Keep, exclude pairing, remove constraint, mark reviewed/unreviewed, and seed replan.
- Loading/failure feedback and return to the save picker.

`acceptPlan()` currently replaces the entire review DOM on every successful mutation, including review-only updates. Preserve the selected school, relevant search/filter, rail position, and open details where appropriate during the same review. Reset file-specific view state when opening a different save. Check drawer scroll position and pending player requests when switching cards.

These are verification targets and source-identified weak spots; they have not all been reproduced as separate failures. Fix demonstrated problems without adding new workflow gates or a frontend framework migration.

**Done when:** each action updates the intended result without losing the user's place, displaying stale player details, or leaving the interface stuck.

### 4. Prove the repaired workflow

- Add a focused browser regression check for visible school content, correct container relationships, and no document-wide horizontal overflow. A screenshot alone will not reliably catch this nesting regression.
- Use recorded fixture plan/card responses for fast frontend checks, plus one fresh disposable save copy for the actual open → select Kansas → plan → review/constraint → save workflow.
- Verify Save on that copy through the existing backup and reopen checks. Do not write Tom's ongoing dynasty or anything in `test_saves/`.
- Capture the repaired review screen, an expanded school room, the unplaced pool, and a player card in the desktop browser.
- Keep planning results unchanged for the same source, seed, and constraints. This repair does not tune the market or change save-edit formulas.

## Copy and appearance after functional repair

Replace promotional headings and repeated protection messaging with direct labels such as **Open save**, **Select your team**, and **Review plan**. Keep useful facts: save filename/stage, selected team, counts, actual exceptions, operation status, and backup/verification result.

The header currently hardcodes `v1.2` even though plans include their model version. Correct or remove that stale display. Color palette, branding, typography, and broader visual composition belong to the later design pass.

## Files and reproduction evidence

- `gui/app.js`: templates, view state, request handling, and interactions.
- `gui/styles.css`: layout, sizing, scrolling, and drawer rules.
- `gui/index.html`: application shell and hardcoded header copy/version.
- `gui.mjs`: existing API and save workflow; change only if a demonstrated frontend issue requires it.
- `lib/gui-plan.mjs`: existing plan/card data contract.

Ignored evidence: `test_runs/gui-audit-c846a871/layout-before.json` and `layout-before.png`. The same folder contains a fresh `DYNASTY-SIGNINGDAYCOPY` opened with Kansas for reproduction. The audit built a plan but did not save it. Real save files were not written.

## Completed repair and proof

`gui/app.js` now uses balanced review sections and table wrappers, retains school/search/filter/rail/disclosure state during updates, resets view state for another save, cancels stale player-card requests, and displays operation failures inside an open drawer. Returning Home renders the save picker immediately, including when refreshing the save list fails. Promotional headings and repeated protection messaging were removed; the displayed model comes from the plan.

`gui/styles.css` contains desktop width/wrapping fixes, local table scrolling, a viewport-capped school rail, and drawer containment. Browser checks passed at 1280 × 720, 1000 × 800, and 2560 × 1250. They covered school/pool navigation, searches and empty results, paging, expanded league/room details, player cards, review state, constraints, seed replanning, request failures, and delayed old-card responses. The repaired 1280-wide review header is 59 px tall and the school sheet is approximately 916 px wide, with no document horizontal overflow.

Real API integration used a fresh copy under `test_runs/gui-repair-a5287777/`, explicitly selected Kansas, applied/restored Brayden Drews's Keep constraint, then saved through the GUI. The restored plan ID was unchanged: `ff669ed5fc47378587ebc1329b0bd791654803a85483c05228a5dd96e280b96b`. Backup and reopen verification passed; independent read-back checked 1,042 placements, 402 veteran releases, 628 recruit releases, 16,233 retained records, and Kansas roster/board preservation. The saved SHA-256 matches the earlier v1.6 proof: `21d6bf2d2c98576de1e0615a89ab360f79a593ba30ff5fcd2908331dc429b010`. The source fixture remained unchanged. Tom's ongoing save was not written.

Replay tools and usage: [GUI regression checks](../tools/gui-regression.md). Detailed results and screenshots are in the ignored `test_runs/gui-repair-a5287777/` folder, including `browser-checks.json`, `save-verification.json`, `repaired-review.png`, `expanded-room.png`, `unplaced-pool.png`, `player-card.png`, and `save-complete.png`.
