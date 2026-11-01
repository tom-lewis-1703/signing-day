# GUI regression checks

Only needed when working on the GUI.

Run `node tools/gui-dynasty-check.mjs`, then `node tools/gui-replay.mjs --fixture <the-proof-folder-it-prints> --port 5188`. Open GUI-REPLAY, select Kansas and enter the dashboard. `tools/gui-workspace-check.js` is a read-only layout check to evaluate in the browser on each view.

The replay serves the current `gui/` files against recorded responses. It refuses Save and does not recompute the market, so use the real GUI on a disposable copy to check planning and saving.

`GET /__replay` on the replay server returns its request log. POST `{ "failNext": ["/api/review"], "delays": { "/api/player?index=9674": 1200 } }` to test a failed request and a slow player card, and `{ "reset": true }` to clear those.

`tools/gui-layout-check.js` targets the earlier school-rail layout and no longer applies.
