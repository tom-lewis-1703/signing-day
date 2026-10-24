# GUI regression checks

For the redesigned dynasty workspace, run `node tools/gui-dynasty-check.mjs`, then `node tools/gui-replay.mjs --fixture <the-proof-folder-it-prints> --port 5188`. Open GUI-REPLAY, explicitly select Kansas, and enter the dashboard. Use `tools/gui-workspace-check.js` as the read-only CUA layout expression. Exercise dashboard → schools/search → school tabs → player/profile/attributes/recruiting; run both tool previews; check transfer search/paging, school review, constraints, and seed controls. The replay deliberately refuses Save. Use the real GUI on a disposable copy for backup/reopen proof. See [the redesign record](../docs/gui-redesign.md).

The remaining notes describe the earlier school-rail interface and its recorded repair evidence. Its layout expression targets that earlier DOM.

Use the actual browser through CUA. These tools do not launch or control browsers.

`node tools/gui-replay.mjs --port 5188` serves the current `gui/` files against recorded fixture responses. It defaults to `test_runs/market-v1.2-hWymkF`; use `--fixture PATH` for another directory containing `view.json` and `report.json`. No save files are opened or written. Select **GUI-REPLAY**, then explicitly select **Kansas** and build the plan.

Pass the contents of `tools/gui-layout-check.js` as a string to CUA's `tab.playwright.evaluate`. It only reads DOM content, geometry, scroll offsets and displayed state. A passing review returns `ok: true`; failures identify structural nesting, squeezed school content and document overflow. Record results after:

1. Initial review and switching schools.
2. Opening league diagnostics and a crowded room.
3. Switching to the unplaced pool, searching, paging and clearing an empty search.
4. Opening a player card and its detailed tables.
5. Marking reviewed/unreviewed with a rail search, filter, open room and scroll position already set.
6. Adding/removing Keep and excluded-pair constraints, then replanning with a new seed.

The result includes a `state` snapshot for checking whether relevant view state survived each update. Resize the desktop browser and repeat the geometry check. Do not treat a screenshot alone as a structural regression check.

`GET http://127.0.0.1:5188/__replay` returns the API request log and full recorded card IDs. A local test command can POST controls:

```powershell
$body = @{ failNext = @('/api/review'); delays = @{ '/api/player?index=9674' = 1200 } } | ConvertTo-Json -Depth 4
Invoke-RestMethod http://127.0.0.1:5188/__replay -Method Post -ContentType application/json -Body $body
```

The next review request fails once. Player 9674 (Nate Sheppard) responds slowly: open him, close or switch cards before completion, and verify the stale response cannot replace the new card or reopen the drawer. Use `{ "reset": true }` to reset replay state and controls, then reload the browser.

The replay preserves recorded numerical cards for ten named players. Other player links return row-only cards. Review/constraint requests update replay rows for interaction checks; seed and constraint changes do **not** run the market or recalculate scores/counts. `/api/save` deliberately refuses. Verify actual planning and backup/reopen saving separately in the real GUI using a fresh disposable copy under `test_runs/`.
