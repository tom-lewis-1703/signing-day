// UI smoke test: starts the real app, opens a save through the window and drives it,
// then writes a screenshot plus the page text.
//   runtime\electron\electron.exe tools\ui-smoke.cjs [options] <save file> <output .png>
// Options: --draft-lock (Preview -> Apply), --save, --depth=<Team name>,
//          --role=<portal player name prefix> (with --depth), --league
const { app } = require("electron");
const fs = require("fs");

const args = process.argv;
const [savePath, shotPath] = args.slice(-2);
const opt = name => { const a = args.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a ? (a.split("=")[1] ?? true) : null; };
const steps = { draftLock: !!opt("draft-lock"), save: !!opt("save"), depth: opt("depth"), role: opt("role"), league: !!opt("league") };
require("../electron-main.cjs");

app.on("browser-window-created", (_e, win) => {
  win.setSize(1400, 1000);
  win.webContents.once("did-finish-load", async () => {
    const out = shotPath.replace(/\.png$/i, ".txt");
    try {
      const text = await win.webContents.executeJavaScript(`(async () => {
        const steps = ${JSON.stringify(steps)};
        const wait = async (test) => { for (let i = 0; i < 150 && !test(); i++) await new Promise(r => setTimeout(r, 100)); };
        const logText = () => document.getElementById("log").innerText;
        if (!await openPath(${JSON.stringify(savePath)})) return "OPEN ERROR: " + logText();
        if (steps.draftLock) {
          document.getElementById("actionBtn").click();
          await wait(() => /preview:/.test(logText()));
          document.getElementById("applyBtn").click();
          await wait(() => /Draft Lock applied|failed/.test(logText()));
        }
        if (steps.save) {
          document.getElementById("saveBtn").click();
          await wait(() => /Saved|Save failed/.test(logText()));
        }
        if (steps.league) {
          showTab("league");
          await wait(() => document.getElementById("leagueTable").rows.length > 1);
        }
        if (steps.depth) {
          showTab("depth");
          await loadDepth();
          const sel = document.getElementById("teamSelect");
          sel.value = [...sel.options].find(o => o.textContent === steps.depth).value;
          await renderTeam();
          if (steps.role) {
            const inp = document.getElementById("portalInput");
            inp.value = [...document.getElementById("portalList").options].map(o => o.value).find(v => v.startsWith(steps.role)) || "";
            await showRoleAt();
            await showFit();
          }
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 200));
        return document.body.innerText;
      })()`);
      const image = await win.webContents.capturePage();
      fs.writeFileSync(shotPath, image.toPNG());
      fs.writeFileSync(out, text);
    } catch (e) {
      fs.writeFileSync(out, "SMOKE ERROR " + (e?.stack || e));
    }
    app.quit();
  });
});
