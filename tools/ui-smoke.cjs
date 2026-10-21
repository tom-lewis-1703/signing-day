// UI smoke test: starts the real app, opens a save through the window and drives it,
// then writes a screenshot plus the page text.
//   runtime\electron\electron.exe tools\ui-smoke.cjs [options] <save file> <output .png>
// Options: --draft-lock (Preview -> Apply), --save, --league (Signing Day view), --sd=<page>[:School]
//          (Signing Day page: home, transfers, schools, school:BYU, cuts, cleanup),
//          --player=<portal player name prefix> (Portal view: his Top 10 preview),
//          --depth=<Team name> (Teams view: that depth chart; with --player his role there)
const { app } = require("electron");
const fs = require("fs");

const args = process.argv;
const [savePath, shotPath] = args.slice(-2);
const opt = name => { const a = args.find(x => x === `--${name}` || x.startsWith(`--${name}=`)); return a ? (a.split("=")[1] ?? true) : null; };
const steps = { draftLock: !!opt("draft-lock"), save: !!opt("save"), depth: opt("depth"), player: opt("player") || opt("role"), league: !!opt("league"), sd: opt("sd") };
require("../electron-main.cjs");

app.on("browser-window-created", (_e, win) => {
  win.setSize(1600, 1000);
  win.webContents.once("did-finish-load", async () => {
    const out = shotPath.replace(/\.png$/i, ".txt");
    try {
      const text = await win.webContents.executeJavaScript(`(async () => {
        const steps = ${JSON.stringify(steps)};
        const wait = async (test) => { for (let i = 0; i < 150 && !test(); i++) await new Promise(r => setTimeout(r, 100)); };
        const logText = () => document.getElementById("log").innerText;
        if (!await openPath(${JSON.stringify(savePath)})) return "OPEN ERROR: " + logText();
        if (steps.draftLock) {
          document.getElementById("dlPreview").click();
          await wait(() => /preview:/.test(logText()));
          document.getElementById("dlApply").click();
          await wait(() => /Draft Lock applied|failed/.test(logText()));
        }
        if (steps.save) {
          document.getElementById("saveBtn").click();
          await wait(() => /Saved|Save failed/.test(logText()));
        }
        if (steps.league || steps.sd) await showView("signing");
        if (steps.sd) {
          const [page, school] = String(steps.sd).split(":");
          sdGo(page, school ? S.signing.rows.find(t => t.team === school)?.teamIndex : null);
        }
        if (steps.player) {
          await showView("portal");
          const p = S.portal.players.find(x => x.name.startsWith(steps.player));
          if (p) await pickPlayer(p);
        }
        if (steps.depth) {
          await showView("teams");
          const t = S.teams.find(x => x.team === steps.depth);
          if (t) await showTeam(t.teamIndex);
        }
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 1000));
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
